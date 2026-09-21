-- Triplit clearance authorization, period reopening, and bilateral corrections

create table if not exists public.clearance_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.ledger_groups(id) on delete restrict,
  requested_by_member_id uuid not null references public.members(id) on delete restrict,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'CANCELLED', 'EXECUTED', 'EXPIRED')),
  idempotency_key uuid not null unique,
  expires_at timestamptz not null default (now() + interval '72 hours'),
  created_at timestamptz not null default now(),
  executed_at timestamptz,
  cancelled_at timestamptz
);

create table if not exists public.clearance_approvals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.clearance_requests(id) on delete cascade,
  approver_member_id uuid not null references public.members(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (request_id, approver_member_id)
);

create trigger clearance_approvals_immutable before update or delete on public.clearance_approvals
for each row execute function public.prevent_financial_history_mutation();

alter table public.clearance_requests enable row level security;
alter table public.clearance_approvals enable row level security;

create policy clearance_requests_read_own_group on public.clearance_requests for select to authenticated
  using (group_id = (select public.current_group_id()));

create policy clearance_approvals_read_own_group on public.clearance_approvals for select to authenticated
  using (exists (select 1 from public.clearance_requests r where r.id = clearance_approvals.request_id and r.group_id = (select public.current_group_id())));

-- Request Clearance (starts 72h window, automatically records proposer's approval)
create or replace function public.request_clearance(p_idempotency_key uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  existing public.clearance_requests;
  req_id uuid;
begin
  actor := public.require_current_member();
  
  select * into existing from public.clearance_requests
  where group_id = actor.group_id and idempotency_key = p_idempotency_key;
  if found then return existing.id; end if;

  -- Check if an active pending or approved request already exists
  if exists (
    select 1 from public.clearance_requests
    where group_id = actor.group_id and status in ('PENDING', 'APPROVED') and expires_at > now()
  ) then
    raise exception 'ACTIVE_CLEARANCE_ALREADY_EXISTS' using errcode = '23505';
  end if;

  insert into public.clearance_requests (group_id, requested_by_member_id, idempotency_key)
  values (actor.group_id, actor.id, p_idempotency_key)
  returning id into req_id;

  -- Proposer automatically approves
  insert into public.clearance_approvals (request_id, approver_member_id)
  values (req_id, actor.id);

  insert into public.audit_events (group_id, actor_member_id, action, resource_type, resource_id)
  values (actor.group_id, actor.id, 'clearance_requested', 'clearance_request', req_id);

  return req_id;
end;
$$;

-- Approve Clearance (checks 3-of-3 count)
create or replace function public.approve_clearance(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  req public.clearance_requests;
  approval_count integer;
begin
  actor := public.require_current_member();
  select * into req from public.clearance_requests where id = p_request_id for update;
  if not found or req.group_id <> actor.group_id then
    raise exception 'REQUEST_NOT_FOUND' using errcode = '42501';
  end if;
  if req.status <> 'PENDING' then
    raise exception 'REQUEST_NOT_PENDING' using errcode = '55000';
  end if;
  if req.expires_at <= now() then
    update public.clearance_requests set status = 'EXPIRED' where id = req.id;
    raise exception 'REQUEST_EXPIRED' using errcode = '55000';
  end if;

  insert into public.clearance_approvals (request_id, approver_member_id)
  values (req.id, actor.id)
  on conflict (request_id, approver_member_id) do nothing;

  select count(*) into approval_count from public.clearance_approvals where request_id = req.id;
  if approval_count >= 3 then
    update public.clearance_requests set status = 'APPROVED' where id = req.id;
    insert into public.audit_events (group_id, actor_member_id, action, resource_type, resource_id)
    values (actor.group_id, actor.id, 'clearance_approved', 'clearance_request', req.id);
    return 'APPROVED';
  end if;

  insert into public.audit_events (group_id, actor_member_id, action, resource_type, resource_id)
  values (actor.group_id, actor.id, 'clearance_member_approved', 'clearance_request', req.id);
  return 'PENDING';
end;
$$;

-- Cancel Clearance (any member can cancel pending)
create or replace function public.cancel_clearance(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  req public.clearance_requests;
begin
  actor := public.require_current_member();
  select * into req from public.clearance_requests where id = p_request_id for update;
  if not found or req.group_id <> actor.group_id then
    raise exception 'REQUEST_NOT_FOUND' using errcode = '42501';
  end if;
  if req.status <> 'PENDING' then
    raise exception 'CANNOT_CANCEL_NON_PENDING' using errcode = '55000';
  end if;

  update public.clearance_requests set status = 'CANCELLED', cancelled_at = now() where id = req.id;
  insert into public.audit_events (group_id, actor_member_id, action, resource_type, resource_id)
  values (actor.group_id, actor.id, 'clearance_cancelled', 'clearance_request', req.id);
end;
$$;

-- Execute Clearance (unanimous 3-of-3 execution: archives current epoch and increments)
create or replace function public.execute_clearance(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  req public.clearance_requests;
  grp public.ledger_groups;
  new_epoch integer;
begin
  actor := public.require_current_member();
  select * into req from public.clearance_requests where id = p_request_id for update;
  if not found or req.group_id <> actor.group_id then
    raise exception 'REQUEST_NOT_FOUND' using errcode = '42501';
  end if;
  if req.status <> 'APPROVED' then
    raise exception 'CLEARANCE_NOT_APPROVED' using errcode = '55000';
  end if;

  select * into grp from public.ledger_groups where id = actor.group_id for update;
  
  -- Archive all periods in the current epoch
  update public.accounting_periods
  set status = 'ARCHIVED'
  where group_id = grp.id and epoch = grp.epoch and status in ('OPEN', 'CLOSED');

  new_epoch := grp.epoch + 1;
  update public.ledger_groups set epoch = new_epoch where id = grp.id;
  update public.clearance_requests set status = 'EXECUTED', executed_at = now() where id = req.id;

  insert into public.audit_events (group_id, actor_member_id, action, resource_type, resource_id, metadata)
  values (actor.group_id, actor.id, 'clearance_executed', 'ledger_group', grp.id, jsonb_build_object('new_epoch', new_epoch));

  return new_epoch;
end;
$$;

-- Reopen Period (allows corrections/retroactive additions to a closed period)
create or replace function public.reopen_period(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  period_row public.accounting_periods;
begin
  actor := public.require_current_member();
  select * into period_row from public.accounting_periods where id = p_period_id for update;
  if not found or period_row.group_id <> actor.group_id then
    raise exception 'PERIOD_NOT_FOUND' using errcode = '42501';
  end if;
  if period_row.status <> 'CLOSED' then
    raise exception 'PERIOD_CANNOT_BE_REOPENED' using errcode = '55000';
  end if;

  update public.accounting_periods set status = 'OPEN' where id = period_row.id;
  insert into public.audit_events (group_id, actor_member_id, action, resource_type, resource_id)
  values (actor.group_id, actor.id, 'period_reopened', 'accounting_period', period_row.id);
end;
$$;

-- Bilateral Correction (atomic reversal + adjustment for bilateral transactions)
create or replace function public.create_bilateral_correction(
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
declare
  actor public.members;
  original public.bilateral_transactions;
  reversal_id uuid;
  adjustment_id uuid;
begin
  actor := public.require_current_member();
  if p_new_amount_paise <= 0 or char_length(trim(coalesce(p_new_description, ''))) not between 1 and 200 then
    raise exception 'INVALID_BILATERAL_CORRECTION' using errcode = '22023';
  end if;

  select * into original from public.bilateral_transactions where id = p_original_id for update;
  if not found or original.group_id <> actor.group_id or original.entry_type <> 'BILATERAL_EXPENSE' or original.payer_member_id <> actor.id then
    raise exception 'CORRECTION_NOT_ALLOWED' using errcode = '42501';
  end if;

  select id into reversal_id from public.bilateral_transactions where group_id = actor.group_id and idempotency_key = p_reversal_key;
  if reversal_id is null then
    insert into public.bilateral_transactions (
      group_id, entry_type, payer_member_id, counterparty_member_id,
      payer_email_snapshot, payer_name_snapshot, counterparty_email_snapshot, counterparty_name_snapshot,
      amount_paise, currency, description, category, occurred_at, idempotency_key, payload_hash, correction_of
    )
    values (
      actor.group_id, 'BILATERAL_REVERSAL', original.payer_member_id, original.counterparty_member_id,
      original.payer_email_snapshot, original.payer_name_snapshot, original.counterparty_email_snapshot, original.counterparty_name_snapshot,
      original.amount_paise, 'INR', original.description, original.category, original.occurred_at,
      p_reversal_key, encode(digest(concat_ws('|', original.id::text, 'bilateral_reversal'), 'sha256'), 'hex'), original.id
    )
    returning id into reversal_id;
  end if;

  select id into adjustment_id from public.bilateral_transactions where group_id = actor.group_id and idempotency_key = p_adjustment_key;
  if adjustment_id is null then
    insert into public.bilateral_transactions (
      group_id, entry_type, payer_member_id, counterparty_member_id,
      payer_email_snapshot, payer_name_snapshot, counterparty_email_snapshot, counterparty_name_snapshot,
      amount_paise, currency, description, category, occurred_at, idempotency_key, payload_hash, correction_of
    )
    values (
      actor.group_id, 'BILATERAL_ADJUSTMENT', original.payer_member_id, original.counterparty_member_id,
      original.payer_email_snapshot, original.payer_name_snapshot, original.counterparty_email_snapshot, original.counterparty_name_snapshot,
      p_new_amount_paise, 'INR', trim(p_new_description), p_new_category, original.occurred_at,
      p_adjustment_key, encode(digest(concat_ws('|', original.id::text, p_new_amount_paise::text, trim(p_new_description), coalesce(p_new_category, '')), 'sha256'), 'hex'), original.id
    )
    returning id into adjustment_id;
  end if;

  insert into public.audit_events (group_id, actor_member_id, action, resource_type, resource_id, metadata)
  values (actor.group_id, actor.id, 'bilateral_correction_created', 'bilateral_transaction', original.id, jsonb_build_object('reversal_id', reversal_id, 'adjustment_id', adjustment_id));

  return jsonb_build_object('original_id', original.id, 'reversal_id', reversal_id, 'adjustment_id', adjustment_id);
end;
$$;

revoke all on public.clearance_requests, public.clearance_approvals from anon, authenticated;
grant select on public.clearance_requests, public.clearance_approvals to authenticated;

revoke execute on function public.request_clearance(uuid), public.approve_clearance(uuid), public.cancel_clearance(uuid), public.execute_clearance(uuid), public.reopen_period(uuid), public.create_bilateral_correction(uuid, uuid, uuid, bigint, text, text) from public, anon;
grant execute on function public.request_clearance(uuid), public.approve_clearance(uuid), public.cancel_clearance(uuid), public.execute_clearance(uuid), public.reopen_period(uuid), public.create_bilateral_correction(uuid, uuid, uuid, bigint, text, text) to authenticated;
