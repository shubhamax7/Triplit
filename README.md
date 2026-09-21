# Triplit

Triplit is a three-member shared expense tracker with two hard-separated financial systems:

- Group ledger: every expense is split equally among all three members.
- Pair ledger: an expense is visible only to its two participants and never affects the group calculation.

## Run locally

1. Copy `.env.example` to `.env` and add only the project URL and publishable/anon key.
2. Apply the ordered migrations in `supabase/migrations/` (`20260921112208_initial_triplit_schema.sql`, `20260921115915_corrections_and_period_closure.sql`, `20260921123000_clearance_and_bilateral_enhancements.sql`) to your Supabase project.
3. Configure Magic Link and/or Google OAuth in the Supabase dashboard, then provision exactly three active member records.
4. Run `npm start` (or `pnpm start`).

For Magic Link, add `triplit://**` to Supabase Authentication -> URL Configuration -> Redirect URLs. The app handles `triplit://auth/callback`; test this in an Expo development build, not Expo Go.

The client has no service-role key. Expense creation uses database RPCs, and financial tables permit no direct client writes.

## Verification

Run `pnpm test` for deterministic integer accounting and bilateral symmetry tests. Run `pnpm typecheck` before opening the app.

## Accounting contract

All values are integer paise. For a group amount `T`, each share is `floor(T / 3)`, with remaining paise assigned in stable member order. Group balances always sum to zero. The bilateral net is antisymmetric: `net(A,B) = -net(B,A)`.
