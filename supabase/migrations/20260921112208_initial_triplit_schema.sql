-- Triplit financial core. Amounts are integer paise; neither ledger stores a mutable balance.
create extension if not exists pgcrypto;

create type public.period_status as enum ('OPEN', 'CLOSED', 'ARCHIVED');
create type public.ledger_entry_type as enum ('EXPENSE', 'REVERSAL', 'ADJUSTMENT');
create type public.bilateral_entry_type as enum ('BILATERAL_EXPENSE', 'BILATERAL_REVERSAL', 'BILATERAL_ADJUSTMENT');

create table public.ledger_groups (
  id uuid primary key default gen_random_uuid(),
  epoch integer not null default 1 check (epoch > 0),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.members (
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

create unique index members_active_auth_uid_unique on public.members(auth_uid) where is_active;
create unique index members_at_most_three_active on public.members(group_id, member_order) where is_active;

create table public.accounting_periods (
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

create table public.ledger_entries (
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
create unique index one_reversal_per_expense on public.ledger_entries(correction_of) where entry_type = 'REVERSAL';
create index ledger_entries_period_payer_idx on public.ledger_entries(period_id, payer_member_id);
create index ledger_entries_period_occurred_idx on public.ledger_entries(period_id, occurred_at desc, id desc);

create table public.settlement_snapshots (
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
create unique index settlement_active_snapshot_unique on public.settlement_snapshots(period_id) where superseded_by is null;

create table public.bilateral_transactions (
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
create unique index one_bilateral_reversal_per_expense on public.bilateral_transactions(correction_of) where entry_type = 'BILATERAL_REVERSAL';
create index bilateral_pair_idx on public.bilateral_transactions(group_id, payer_member_id, counterparty_member_id, occurred_at desc);

create table public.audit_events (
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

create trigger ledger_entries_immutable before update or delete on public.ledger_entries
for each row execute function public.prevent_financial_history_mutation();
create trigger bilateral_transactions_immutable before update or delete on public.bilateral_transactions
for each row execute function public.prevent_financial_history_mutation();
create trigger settlement_snapshots_immutable before update or delete on public.settlement_snapshots
for each row execute function public.prevent_financial_history_mutation();
create trigger audit_events_immutable before update or delete on public.audit_events
for each row execute function public.prevent_financial_history_mutation();

create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id from public.members m where m.auth_uid = auth.uid() and m.is_active limit 1;
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
declare current_member public.members;
begin
  select * into current_member from public.members where id = public.current_member_id() and is_active;
  if not found then raise exception 'UNAUTHORIZED_MEMBER' using errcode = '42501'; end if;
  if (select count(*) from public.members where group_id = current_member.group_id and is_active) <> 3 then
    raise exception 'GROUP_MEMBER_COUNT_INVALID' using errcode = '23514';
  end if;
  return current_member;
end;
$$;

create or replace function public.validate_bilateral_pair(p_group_id uuid, p_payer uuid, p_counterparty uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_payer = p_counterparty then raise exception 'COUNTERPARTY_MUST_DIFFER' using errcode = '23514'; end if;
  if not exists (select 1 from public.members where id = p_payer and group_id = p_group_id and is_active)
     or not exists (select 1 from public.members where id = p_counterparty and group_id = p_group_id and is_active) then
    raise exception 'INVALID_BILATERAL_PARTICIPANT' using errcode = '23514';
  end if;
end;
$$;

create or replace function public.assert_bilateral_pair()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.validate_bilateral_pair(new.group_id, new.payer_member_id, new.counterparty_member_id);
  return new;
end;
$$;
create trigger bilateral_pair_must_be_in_group before insert on public.bilateral_transactions
for each row execute function public.assert_bilateral_pair();

alter table public.ledger_groups enable row level security;
alter table public.members enable row level security;
alter table public.accounting_periods enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.settlement_snapshots enable row level security;
alter table public.bilateral_transactions enable row level security;
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
create policy audit_read_group_or_actor on public.audit_events for select to authenticated
  using (
    actor_member_id = (select public.current_member_id())
    or (resource_type <> 'bilateral_transaction' and group_id = (select public.current_group_id()))
  );

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
declare actor public.members; counterparty public.members; existing public.bilateral_transactions; payload_hash text; transaction_id uuid;
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

revoke all on all tables in schema public from anon, authenticated;
grant select on public.ledger_groups, public.members, public.accounting_periods, public.ledger_entries, public.settlement_snapshots, public.bilateral_transactions, public.audit_events to authenticated;
revoke execute on all functions in schema public from public, anon;
grant execute on function public.current_member_id(), public.current_group_id(), public.create_expense(uuid, bigint, text, text, timestamptz), public.create_bilateral_transaction(uuid, uuid, bigint, text, text, timestamptz) to authenticated;
