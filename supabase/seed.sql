-- Triplit Seed Data
-- Creates the initial ledger group (Epoch 1) and provisions the 3 fixed members.
-- Replace the email addresses and display names with the 3 authorized group members.

insert into public.ledger_groups (id, epoch, created_at)
values ('00000000-0000-0000-0000-000000000001', 1, now())
on conflict (id) do nothing;

-- Member 1 (Order 1: receives 1st remainder paise)
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

-- Member 2 (Order 2: receives 2nd remainder paise)
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

-- Member 3 (Order 3)
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

