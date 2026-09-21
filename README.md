# Triplit

Triplit is a three-member shared expense tracker with two hard-separated financial systems:

- Group ledger: every expense is split equally among all three members.
- Pair ledger: an expense is visible only to its two participants and never affects the group calculation.

## Run locally

1. Copy `.env.example` to `.env` and add only the project URL and publishable/anon key.
2. Apply `supabase/migrations/20260921112208_initial_triplit_schema.sql` to a Supabase project.
3. Configure Magic Link and/or Google OAuth in the Supabase dashboard, then provision exactly three active member records.
4. Run `pnpm start`.

The client has no service-role key. Expense creation uses database RPCs, and financial tables permit no direct client writes.

## Verification

Run `pnpm test` for deterministic integer accounting and bilateral symmetry tests. Run `pnpm typecheck` before opening the app.

## Accounting contract

All values are integer paise. For a group amount `T`, each share is `floor(T / 3)`, with remaining paise assigned in stable member order. Group balances always sum to zero. The bilateral net is antisymmetric: `net(A,B) = -net(B,A)`.
