-- ============================================================================
-- TRIPLIT: COMPLETE DATABASE SCHEMA & SEED SETUP
-- Paste this entire file into your Supabase Dashboard -> SQL Editor and click "Run"
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. BASE SCHEMA & EXTENSIONS
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;

create type public.period_status as enum ('OPEN', 'CLOSED', 'ARCHIVED');
create type public.ledger_entry_type as enum ('EXPENSE', 'REVERSAL', 'ADJUSTMENT');
create type public.bilateral_entry_type as enum ('BILATERAL_EXPENSE', 'BILATERAL_REVERSAL', 'BILATERAL_ADJUSTMENT');

create table if not exists public.ledger_groups (
  id uuid primary key default gen_random_uuid(),
  epoch integer not null default 1 check (epoch > 0),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.ledger_groups(id) on delete restrict,
  auth_uid uuid unique,
  email text not null,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  member_order smallint not null check (member_order between 1 and 3),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (group_id, email),
  unique (group_id, member_order)
);

create unique index if not exists members_active_auth_uid_unique on public.members(auth_uid) where is_active;
create unique index if not exists members_at_most_three_active on public.members(group_id, member_order) where is_active;

create table if not exists public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.ledger_groups(id) on delete restrict,
  epoch integer not null check (epoch > 0),
  year smallint not null check (year between 2020 and 2100),
  month smallint not null check (month between 1 and 12),
  status public.period_status not null default 'OPEN',
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (group_id, epoch, year, month)
);

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.ledger_groups(id) on delete restrict,
  period_id uuid not null references public.accounting_periods(id) on delete restrict,
  entry_type public.ledger_entry_type not null,
  payer_member_id uuid not null references public.members(id) on delete restrict,
  payer_email_snapshot text not null,
  payer_name_snapshot text not null,
  amount_paise bigint not null check (amount_paise > 0),
  description text not null check (char_length(trim(description)) between 1 and 200),
  category text check (char_length(category) <= 60),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  idempotency_key uuid not null,
  payload_hash text not null check (char_length(payload_hash) = 64),
  correction_of uuid references public.ledger_entries(id) on delete restrict,
  unique (group_id, idempotency_key),
  check (
    (entry_type = 'EXPENSE' and correction_of is null)
    or (entry_type in ('REVERSAL', 'ADJUSTMENT') and correction_of is not null)
  )
);

create unique index if not exists one_reversal_per_expense on public.ledger_entries(correction_of) where entry_type = 'REVERSAL';
create index if not exists ledger_entries_period_payer_idx on public.ledger_entries(period_id, payer_member_id);
create index if not exists ledger_entries_period_occurred_idx on public.ledger_entries(period_id, occurred_at desc, id desc);

create table if not exists public.settlement_snapshots (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.accounting_periods(id) on delete restrict,
  algorithm_version text not null default '1.0',
  rounding_policy_version text not null default '1.0',
  total_paise bigint not null check (total_paise >= 0),
  per_member jsonb not null,
  transfers jsonb not null,
  ledger_hash text not null check (char_length(ledger_hash) = 64),
  created_at timestamptz not null default now(),
  superseded_by uuid references public.settlement_snapshots(id) on delete restrict
);
create unique index if not exists settlement_active_snapshot_unique on public.settlement_snapshots(period_id) where superseded_by is null;

create table if not exists public.bilateral_transactions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.ledger_groups(id) on delete restrict,
  entry_type public.bilateral_entry_type not null,
  payer_member_id uuid not null references public.members(id) on delete restrict,
  counterparty_member_id uuid not null references public.members(id) on delete restrict,
  payer_email_snapshot text not null,
  payer_name_snapshot text not null,
  counterparty_email_snapshot text not null,
  counterparty_name_snapshot text not null,
  amount_paise bigint not null check (amount_paise > 0),
  currency char(3) not null default 'INR' check (currency = 'INR'),
  description text not null check (char_length(trim(description)) between 1 and 200),
  category text check (char_length(category) <= 60),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  idempotency_key uuid not null,
  payload_hash text not null check (char_length(payload_hash) = 64),
  correction_of uuid references public.bilateral_transactions(id) on delete restrict,
  unique (group_id, idempotency_key),
  check (payer_member_id <> counterparty_member_id),
  check (
    (entry_type = 'BILATERAL_EXPENSE' and correction_of is null)
    or (entry_type in ('BILATERAL_REVERSAL', 'BILATERAL_ADJUSTMENT') and correction_of is not null)
  )
);
create unique index if not exists one_bilateral_reversal_per_expense on public.bilateral_transactions(correction_of) where entry_type = 'BILATERAL_REVERSAL';
create index if not exists bilateral_pair_idx on public.bilateral_transactions(group_id, payer_member_id, counterparty_member_id, occurred_at desc);

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

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.ledger_groups(id) on delete restrict,
  actor_member_id uuid not null references public.members(id) on delete restrict,
  action text not null check (char_length(action) between 1 and 80),
  resource_type text not null check (char_length(resource_type) between 1 and 80),
  resource_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. IMMUTABILITY TRIGGERS
-- ----------------------------------------------------------------------------
create or replace function public.prevent_financial_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'Financial ledger history is immutable' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists ledger_entries_immutable on public.ledger_entries;
create trigger ledger_entries_immutable before update or delete on public.ledger_entries
for each row execute function public.prevent_financial_history_mutation();

drop trigger if exists bilateral_transactions_immutable on public.bilateral_transactions;
create trigger bilateral_transactions_immutable before update or delete on public.bilateral_transactions
for each row execute function public.prevent_financial_history_mutation();

drop trigger if exists settlement_snapshots_immutable on public.settlement_snapshots;
create trigger settlement_snapshots_immutable before update or delete on public.settlement_snapshots
for each row execute function public.prevent_financial_history_mutation();

drop trigger if exists clearance_approvals_immutable on public.clearance_approvals;
create trigger clearance_approvals_immutable before update or delete on public.clearance_approvals
for each row execute function public.prevent_financial_history_mutation();

drop trigger if exists audit_events_immutable on public.audit_events;
create trigger audit_events_immutable before update or delete on public.audit_events
for each row execute function public.prevent_financial_history_mutation();

-- ----------------------------------------------------------------------------
-- 3. MEMBERSHIP & HELPER FUNCTIONS
-- ----------------------------------------------------------------------------
create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id from public.members m where (m.auth_uid = auth.uid() or m.email = auth.jwt()->>'email') and m.is_active limit 1;
$$;

create or replace function public.current_group_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.group_id from public.members m where m.id = public.current_member_id();
$$;

create or replace function public.require_current_member()
returns public.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_member public.members;
begin
  -- Auto-link auth_uid if matched by email upon first login
  update public.members
  set auth_uid = auth.uid()
  where email = auth.jwt()->>'email' and auth_uid is null and is_active;

  select * into current_member from public.members where id = public.current_member_id() and is_active;
  if not found then raise exception 'UNAUTHORIZED_MEMBER' using errcode = '42501'; end if;
  if (select count(*) from public.members where group_id = current_member.group_id and is_active) <> 3 then
    raise exception 'GROUP_MEMBER_COUNT_INVALID' using errcode = '23514';
  end if;
  return current_member;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
alter table public.ledger_groups enable row level security;
alter table public.members enable row level security;
alter table public.accounting_periods enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.settlement_snapshots enable row level security;
alter table public.bilateral_transactions enable row level security;
alter table public.clearance_requests enable row level security;
alter table public.clearance_approvals enable row level security;
alter table public.audit_events enable row level security;

create policy members_read_own_group on public.members for select to authenticated
  using (group_id = (select public.current_group_id()));
create policy groups_read_own_group on public.ledger_groups for select to authenticated
  using (id = (select public.current_group_id()));
create policy periods_read_own_group on public.accounting_periods for select to authenticated
  using (group_id = (select public.current_group_id()));
create policy ledger_read_own_group on public.ledger_entries for select to authenticated
  using (group_id = (select public.current_group_id()));
create policy snapshots_read_own_group on public.settlement_snapshots for select to authenticated
  using (exists (select 1 from public.accounting_periods p where p.id = settlement_snapshots.period_id and p.group_id = (select public.current_group_id())));
create policy bilateral_read_participants_only on public.bilateral_transactions for select to authenticated
  using ((select public.current_member_id()) in (payer_member_id, counterparty_member_id));
create policy clearance_requests_read_own_group on public.clearance_requests for select to authenticated
  using (group_id = (select public.current_group_id()));
create policy clearance_approvals_read_own_group on public.clearance_approvals for select to authenticated
  using (exists (select 1 from public.clearance_requests r where r.id = clearance_approvals.request_id and r.group_id = (select public.current_group_id())));
create policy audit_read_group_or_actor on public.audit_events for select to authenticated
  using (
    actor_member_id = (select public.current_member_id())
    or (resource_type <> 'bilateral_transaction' and group_id = (select public.current_group_id()))
  );

-- ----------------------------------------------------------------------------
-- 5. RPC PROCEDURES (ALL MUTATIONS VIA RPC ONLY)
-- ----------------------------------------------------------------------------

-- create_expense
create or replace function public.create_expense(
  p_idempotency_key uuid,
  p_amount_paise bigint,
  p_description text,
  p_category text,
  p_occurred_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  period_row public.accounting_periods;
  existing public.ledger_entries;
  payload_hash text;
  entry_id uuid;
  local_time timestamp;
begin
  actor := public.require_current_member();
  if p_amount_paise <= 0 or char_length(trim(coalesce(p_description, ''))) not between 1 and 200 then
    raise exception 'INVALID_EXPENSE' using errcode = '22023';
  end if;
  if p_occurred_at < (select created_at from public.ledger_groups where id = actor.group_id) or p_occurred_at > now() + interval '5 minutes' then
    raise exception 'INVALID_OCCURRED_AT' using errcode = '22023';
  end if;
  payload_hash := encode(digest(concat_ws('|', p_amount_paise::text, trim(p_description), coalesce(p_category, ''), p_occurred_at::text), 'sha256'), 'hex');
  select * into existing from public.ledger_entries where group_id = actor.group_id and idempotency_key = p_idempotency_key;
  if found then
    if existing.payload_hash <> payload_hash then raise exception 'IDEMPOTENCY_CONFLICT' using errcode = '23505'; end if;
    return existing.id;
  end if;
  local_time := p_occurred_at at time zone 'Asia/Kolkata';
  insert into public.accounting_periods (group_id, epoch, year, month)
  values (actor.group_id, (select epoch from public.ledger_groups where id = actor.group_id), extract(year from local_time)::smallint, extract(month from local_time)::smallint)
  on conflict (group_id, epoch, year, month) do nothing;
  select * into period_row from public.accounting_periods
  where group_id = actor.group_id and epoch = (select epoch from public.ledger_groups where id = actor.group_id)
    and year = extract(year from local_time)::smallint and month = extract(month from local_time)::smallint
  for update;
  if period_row.status <> 'OPEN' then raise exception 'PERIOD_CLOSED' using errcode = '55000'; end if;
  insert into public.ledger_entries (group_id, period_id, entry_type, payer_member_id, payer_email_snapshot, payer_name_snapshot, amount_paise, description, category, occurred_at, idempotency_key, payload_hash)
  values (actor.group_id, period_row.id, 'EXPENSE', actor.id, actor.email, actor.display_name, p_amount_paise, trim(p_description), p_category, p_occurred_at, p_idempotency_key, payload_hash)
  returning id into entry_id;
  insert into public.audit_events (group_id, actor_member_id, action, resource_type, resource_id, metadata)
  values (actor.group_id, actor.id, 'expense_created', 'ledger_entry', entry_id, jsonb_build_object('period_id', period_row.id));
  return entry_id;
end;
$$;

-- generate_settlement_transfers
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

-- create_correction
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
declare
  actor public.members;
  original public.ledger_entries;
  period_row public.accounting_periods;
  reversal_id uuid;
  adjustment_id uuid;
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

-- close_period
create or replace function public.close_period(p_period_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  period_row public.accounting_periods;
  total bigint;
  balances jsonb;
  member_summary jsonb;
  transfers jsonb;
  ledger_hash text;
  snapshot_id uuid;
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

-- reopen_period
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
  if not found or period_row.group_id <> actor.group_id then raise exception 'PERIOD_NOT_FOUND' using errcode = '42501'; end if;
  if period_row.status <> 'CLOSED' then raise exception 'PERIOD_CANNOT_BE_REOPENED' using errcode = '55000'; end if;

  update public.accounting_periods set status = 'OPEN' where id = period_row.id;
  insert into public.audit_events (group_id, actor_member_id, action, resource_type, resource_id)
  values (actor.group_id, actor.id, 'period_reopened', 'accounting_period', period_row.id);
end;
$$;

-- create_bilateral_transaction
create or replace function public.create_bilateral_transaction(
  p_idempotency_key uuid,
  p_counterparty_member_id uuid,
  p_amount_paise bigint,
  p_description text,
  p_category text,
  p_occurred_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  counterparty public.members;
  existing public.bilateral_transactions;
  payload_hash text;
  transaction_id uuid;
begin
  actor := public.require_current_member();
  if p_amount_paise <= 0 or char_length(trim(coalesce(p_description, ''))) not between 1 and 200
     or p_occurred_at < (select created_at from public.ledger_groups where id = actor.group_id)
     or p_occurred_at > now() + interval '5 minutes' then
    raise exception 'INVALID_BILATERAL_TRANSACTION' using errcode = '22023';
  end if;
  select * into counterparty from public.members where id = p_counterparty_member_id and group_id = actor.group_id and is_active;
  if not found or counterparty.id = actor.id then raise exception 'INVALID_BILATERAL_PARTICIPANT' using errcode = '23514'; end if;
  payload_hash := encode(digest(concat_ws('|', p_counterparty_member_id::text, p_amount_paise::text, trim(p_description), coalesce(p_category, ''), p_occurred_at::text), 'sha256'), 'hex');
  select * into existing from public.bilateral_transactions where group_id = actor.group_id and idempotency_key = p_idempotency_key;
  if found then
    if existing.payload_hash <> payload_hash then raise exception 'IDEMPOTENCY_CONFLICT' using errcode = '23505'; end if;
    return existing.id;
  end if;
  insert into public.bilateral_transactions (group_id, entry_type, payer_member_id, counterparty_member_id, payer_email_snapshot, payer_name_snapshot, counterparty_email_snapshot, counterparty_name_snapshot, amount_paise, description, category, occurred_at, idempotency_key, payload_hash)
  values (actor.group_id, 'BILATERAL_EXPENSE', actor.id, counterparty.id, actor.email, actor.display_name, counterparty.email, counterparty.display_name, p_amount_paise, trim(p_description), p_category, p_occurred_at, p_idempotency_key, payload_hash)
  returning id into transaction_id;
  insert into public.audit_events (group_id, actor_member_id, action, resource_type, resource_id)
  values (actor.group_id, actor.id, 'bilateral_transaction_created', 'bilateral_transaction', transaction_id);
  return transaction_id;
end;
$$;

-- create_bilateral_correction
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

-- Clearance RPCs
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
  select * into existing from public.clearance_requests where group_id = actor.group_id and idempotency_key = p_idempotency_key;
  if found then return existing.id; end if;

  if exists (
    select 1 from public.clearance_requests
    where group_id = actor.group_id and status in ('PENDING', 'APPROVED') and expires_at > now()
  ) then
    raise exception 'ACTIVE_CLEARANCE_ALREADY_EXISTS' using errcode = '23505';
  end if;

  insert into public.clearance_requests (group_id, requested_by_member_id, idempotency_key)
  values (actor.group_id, actor.id, p_idempotency_key)
  returning id into req_id;

  insert into public.clearance_approvals (request_id, approver_member_id)
  values (req_id, actor.id);

  insert into public.audit_events (group_id, actor_member_id, action, resource_type, resource_id)
  values (actor.group_id, actor.id, 'clearance_requested', 'clearance_request', req_id);
  return req_id;
end;
$$;

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
  if not found or req.group_id <> actor.group_id then raise exception 'REQUEST_NOT_FOUND' using errcode = '42501'; end if;
  if req.status <> 'PENDING' then raise exception 'REQUEST_NOT_PENDING' using errcode = '55000'; end if;
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
  if not found or req.group_id <> actor.group_id then raise exception 'REQUEST_NOT_FOUND' using errcode = '42501'; end if;
  if req.status <> 'PENDING' then raise exception 'CANNOT_CANCEL_NON_PENDING' using errcode = '55000'; end if;
  update public.clearance_requests set status = 'CANCELLED', cancelled_at = now() where id = req.id;
  insert into public.audit_events (group_id, actor_member_id, action, resource_type, resource_id)
  values (actor.group_id, actor.id, 'clearance_cancelled', 'clearance_request', req.id);
end;
$$;

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
  if not found or req.group_id <> actor.group_id then raise exception 'REQUEST_NOT_FOUND' using errcode = '42501'; end if;
  if req.status <> 'APPROVED' then raise exception 'CLEARANCE_NOT_APPROVED' using errcode = '55000'; end if;

  select * into grp from public.ledger_groups where id = actor.group_id for update;
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

-- ----------------------------------------------------------------------------
-- 6. PERMISSIONS & ROLE GRANTS
-- ----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
grant select on public.ledger_groups, public.members, public.accounting_periods, public.ledger_entries, public.settlement_snapshots, public.bilateral_transactions, public.clearance_requests, public.clearance_approvals, public.audit_events to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.current_member_id(),
  public.current_group_id(),
  public.create_expense(uuid, bigint, text, text, timestamptz),
  public.create_correction(uuid, uuid, uuid, bigint, text, text),
  public.close_period(uuid),
  public.reopen_period(uuid),
  public.create_bilateral_transaction(uuid, uuid, bigint, text, text, timestamptz),
  public.create_bilateral_correction(uuid, uuid, uuid, bigint, text, text),
  public.request_clearance(uuid),
  public.approve_clearance(uuid),
  public.cancel_clearance(uuid),
  public.execute_clearance(uuid)
to authenticated;

-- ----------------------------------------------------------------------------
-- 7. SEED DATA (EPOCH 1 + 3 ACTIVE MEMBERS)
-- ----------------------------------------------------------------------------
-- Replace the 3 email addresses below with the actual emails you and your 2 members will use to log in!
insert into public.ledger_groups (id, epoch, created_at)
values ('00000000-0000-0000-0000-000000000001', 1, now())
on conflict (id) do nothing;

insert into public.members (id, group_id, email, display_name, member_order, is_active)
values (
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000001',
  'shubhamax7@gmail.com',
  'Shubham',
  1,
  true
)
on conflict (group_id, member_order) do update set email = excluded.email, display_name = excluded.display_name;

insert into public.members (id, group_id, email, display_name, member_order, is_active)
values (
  '22222222-2222-2222-2222-222222222222',
  '00000000-0000-0000-0000-000000000001',
  'nirajsharma7724@gmail.com',
  'Niraj',
  2,
  true
)
on conflict (group_id, member_order) do update set email = excluded.email, display_name = excluded.display_name;

insert into public.members (id, group_id, email, display_name, member_order, is_active)
values (
  '33333333-3333-3333-3333-333333333333',
  '00000000-0000-0000-0000-000000000001',
  'mr.annoymous071105@gmail.com',
  'Tutun',
  3,
  true
)
on conflict (group_id, member_order) do update set email = excluded.email, display_name = excluded.display_name;
