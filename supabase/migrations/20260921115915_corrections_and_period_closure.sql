-- Append-only corrections and immutable period settlements.

create or replace function public.generate_settlement_transfers(p_balances jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  credits jsonb := '{}'::jsonb;
  debts jsonb := '{}'::jsonb;
  item record;
  creditor_id text;
  debtor_id text;
  creditor_amount bigint;
  debtor_amount bigint;
  payment bigint;
  result jsonb := '[]'::jsonb;
begin
  for item in select key, value::bigint as amount from jsonb_each_text(p_balances) loop
    if item.amount > 0 then credits := credits || jsonb_build_object(item.key, item.amount);
    elsif item.amount < 0 then debts := debts || jsonb_build_object(item.key, -item.amount);
    end if;
  end loop;

  while credits <> '{}'::jsonb and debts <> '{}'::jsonb loop
    select key, value::bigint into creditor_id, creditor_amount from jsonb_each_text(credits) order by value::bigint desc, key limit 1;
    select key, value::bigint into debtor_id, debtor_amount from jsonb_each_text(debts) order by value::bigint desc, key limit 1;
    payment := least(creditor_amount, debtor_amount);
    if payment <= 0 or creditor_id = debtor_id then raise exception 'INVALID_SETTLEMENT_STATE' using errcode = '22000'; end if;
    result := result || jsonb_build_array(jsonb_build_object('from_member_id', debtor_id, 'to_member_id', creditor_id, 'amount_paise', payment));
    if creditor_amount = payment then credits := credits - creditor_id;
    else credits := jsonb_set(credits, array[creditor_id], to_jsonb(creditor_amount - payment)); end if;
    if debtor_amount = payment then debts := debts - debtor_id;
    else debts := jsonb_set(debts, array[debtor_id], to_jsonb(debtor_amount - payment)); end if;
  end loop;
  if credits <> '{}'::jsonb or debts <> '{}'::jsonb or jsonb_array_length(result) > 2 then
    raise exception 'SETTLEMENT_INVARIANT_VIOLATED' using errcode = '22000';
  end if;
  return result;
end;
$$;

create or replace function public.create_correction(
  p_original_id uuid,
  p_reversal_key uuid,
  p_adjustment_key uuid,
  p_new_amount_paise bigint,
  p_new_description text,
  p_new_category text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor public.members; original public.ledger_entries; period_row public.accounting_periods; reversal_id uuid; adjustment_id uuid;
begin
  actor := public.require_current_member();
  if p_new_amount_paise <= 0 or char_length(trim(coalesce(p_new_description, ''))) not between 1 and 200 then
    raise exception 'INVALID_CORRECTION' using errcode = '22023';
  end if;
  select * into original from public.ledger_entries where id = p_original_id for update;
  if not found or original.group_id <> actor.group_id or original.entry_type <> 'EXPENSE' or original.payer_member_id <> actor.id then
    raise exception 'CORRECTION_NOT_ALLOWED' using errcode = '42501';
  end if;
  select * into period_row from public.accounting_periods where id = original.period_id for update;
  if period_row.status <> 'OPEN' then raise exception 'PERIOD_CLOSED' using errcode = '55000'; end if;

  select id into reversal_id from public.ledger_entries where group_id = actor.group_id and idempotency_key = p_reversal_key;
  if reversal_id is null then
    insert into public.ledger_entries (group_id, period_id, entry_type, payer_member_id, payer_email_snapshot, payer_name_snapshot, amount_paise, description, category, occurred_at, idempotency_key, payload_hash, correction_of)
    values (actor.group_id, original.period_id, 'REVERSAL', actor.id, actor.email, actor.display_name, original.amount_paise, original.description, original.category, original.occurred_at, p_reversal_key, encode(digest(concat_ws('|', original.id::text, 'reversal'), 'sha256'), 'hex'), original.id)
    returning id into reversal_id;
  end if;
  select id into adjustment_id from public.ledger_entries where group_id = actor.group_id and idempotency_key = p_adjustment_key;
  if adjustment_id is null then
    insert into public.ledger_entries (group_id, period_id, entry_type, payer_member_id, payer_email_snapshot, payer_name_snapshot, amount_paise, description, category, occurred_at, idempotency_key, payload_hash, correction_of)
    values (actor.group_id, original.period_id, 'ADJUSTMENT', actor.id, actor.email, actor.display_name, p_new_amount_paise, trim(p_new_description), p_new_category, original.occurred_at, p_adjustment_key, encode(digest(concat_ws('|', original.id::text, p_new_amount_paise::text, trim(p_new_description), coalesce(p_new_category, '')), 'sha256'), 'hex'), original.id)
    returning id into adjustment_id;
  end if;
  insert into public.audit_events (group_id, actor_member_id, action, resource_type, resource_id, metadata)
  values (actor.group_id, actor.id, 'correction_created', 'ledger_entry', original.id, jsonb_build_object('reversal_id', reversal_id, 'adjustment_id', adjustment_id));
  return jsonb_build_object('original_id', original.id, 'reversal_id', reversal_id, 'adjustment_id', adjustment_id);
end;
$$;

create or replace function public.close_period(p_period_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare actor public.members; period_row public.accounting_periods; total bigint; balances jsonb; member_summary jsonb; transfers jsonb; ledger_hash text; snapshot_id uuid;
begin
  actor := public.require_current_member();
  select * into period_row from public.accounting_periods where id = p_period_id for update;
  if not found or period_row.group_id <> actor.group_id then raise exception 'PERIOD_NOT_FOUND' using errcode = '42501'; end if;
  if period_row.status <> 'OPEN' then raise exception 'PERIOD_NOT_OPEN' using errcode = '55000'; end if;

  with contribution as (
    select payer_member_id, coalesce(sum(case when entry_type = 'REVERSAL' then -amount_paise else amount_paise end), 0)::bigint as amount
    from public.ledger_entries where period_id = period_row.id group by payer_member_id
  ), prepared as (
    select m.id, m.member_order, coalesce(c.amount, 0)::bigint as contribution,
      sum(coalesce(c.amount, 0)) over ()::bigint as total
    from public.members m left join contribution c on c.payer_member_id = m.id
    where m.group_id = actor.group_id and m.is_active
  ), balanced as (
    select *, (total / 3 + case when member_order <= total % 3 then 1 else 0 end)::bigint as share
    from prepared
  )
  select coalesce(max(total), 0), jsonb_object_agg(id::text, contribution - share),
    jsonb_agg(jsonb_build_object('member_id', id, 'contribution_paise', contribution, 'share_paise', share, 'balance_paise', contribution - share) order by member_order)
  into total, balances, member_summary from balanced;
  if coalesce((select sum((value)::bigint) from jsonb_each_text(balances)), 0) <> 0 then raise exception 'BALANCE_INVARIANT_VIOLATED' using errcode = '22000'; end if;
  transfers := public.generate_settlement_transfers(balances);
  select encode(digest(coalesce(string_agg(id::text, ',' order by occurred_at, id), ''), 'sha256'), 'hex') into ledger_hash
  from public.ledger_entries where period_id = period_row.id;
  insert into public.settlement_snapshots (period_id, total_paise, per_member, transfers, ledger_hash)
  values (period_row.id, total, member_summary, transfers, ledger_hash) returning id into snapshot_id;
  update public.accounting_periods set status = 'CLOSED', closed_at = now() where id = period_row.id;
  insert into public.audit_events (group_id, actor_member_id, action, resource_type, resource_id, metadata)
  values (actor.group_id, actor.id, 'period_closed', 'accounting_period', period_row.id, jsonb_build_object('snapshot_id', snapshot_id));
  return snapshot_id;
end;
$$;

revoke execute on function public.generate_settlement_transfers(jsonb), public.create_correction(uuid, uuid, uuid, bigint, text, text), public.close_period(uuid) from public, anon;
grant execute on function public.create_correction(uuid, uuid, uuid, bigint, text, text), public.close_period(uuid) to authenticated;
