# Triplit

**Triplit** is a specialized expense tracking application built for exactly three group members. It features two strictly separated financial systems, immutable audit trails, and zero-sum integer accounting.

---

## Key Features

- **Group Ledger**: Every group expense is split equally among all three members. All balance calculations strictly enforce zero-sum invariants.
- **Pair Ledger**: Private bilateral expenses between any two members. Pair transactions are fully isolated and never affect group ledger calculations.
- **Deterministic Paise Accounting**: Eliminates floating-point rounding errors by performing all financial math in integer **paise** (1 INR = 100 paise). Remainder paise are allocated in deterministic, stable member order (`floor(T / 3)` + remainder).
- **Immutable Audit Trail & Corrections**: Financial rows are immutable. Corrections and adjustments are recorded through explicit reversal and correction entries rather than mutating historical records.
- **3-of-3 Unanimous Clearance**: Period closures and balance roll-overs require explicit 3-of-3 unanimous approval from all active members before being finalized.
- **Optimal Greedy Settlement**: Automatically calculates minimal debt-clearing transactions, resolving any 3-member zero-sum balance vector in at most 2 transfers.
- **Security-First Architecture**: Zero service-role keys exposed to the client. Financial state changes are guarded behind Supabase PostgreSQL `SECURITY DEFINER` RPCs and Row Level Security (RLS).

---

## Tech Stack

- **Framework**: [Expo SDK 57](https://expo.dev/) & [React Native 0.86](https://reactnative.dev/) (React 19)
- **Navigation**: [React Navigation v7](https://reactnavigation.org/) (Native Stack)
- **State & Data Fetching**: [TanStack Query v5](https://tanstack.com/query) (React Query)
- **Validation & Forms**: [Zod v4](https://zod.dev/) & [React Hook Form](https://react-hook-form.com/)
- **Backend & Database**: [Supabase](https://supabase.com/) (PostgreSQL with RLS & Stored Procedures)
- **Authentication**: Supabase Auth (Passwordless Magic Link & Deep Linking)
- **Testing**: [Vitest](https://vitest.dev/) & [TypeScript](https://www.typescriptlang.org/)

---

## Accounting Contract & Invariants

### Group Ledger Allocation
For a total expense amount $T$ (in paise):
- Each member's base share is $S_{\text{base}} = \lfloor T / 3 \rfloor$.
- The remainder $R = T \bmod 3$ ($R \in \{0, 1, 2\}$) is assigned to the first $R$ members in stable member order.
- **Zero-Sum Invariant**: The sum of all net balances across all 3 members is guaranteed to equal zero:
  $$\sum_{i=1}^{3} \text{Net}_i = 0$$

### Pair Ledger Symmetry
- Bilateral balances between Member A and Member B strictly preserve antisymmetry:
  $$\text{Net}(A, B) = -\text{Net}(B, A)$$

---

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- `npm` or `pnpm`
- Expo Go / Expo Development Build
- A Supabase project

### 1. Environment Setup

Create a `.env` file in the project root based on `.env.example`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-supabase-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

> [!IMPORTANT]
> Never put a Supabase service-role key in `.env` or client application code. Financial tables permit no direct client writes.

### 2. Database Migrations

Apply the database migrations in order to your Supabase project:

1. `supabase/migrations/20260921112208_initial_triplit_schema.sql`
2. `supabase/migrations/20260921115915_corrections_and_period_closure.sql`
3. `supabase/migrations/20260921123000_clearance_and_bilateral_enhancements.sql`

### 3. Authentication & Member Setup

1. In your Supabase Dashboard, navigate to **Authentication -> URL Configuration**.
2. Add `triplit://**` to **Redirect URLs**.
3. Provision exactly 3 active member records in the `members` database table corresponding to authorized member emails.

> [!NOTE]
> Magic Link authentication handles `triplit://auth/callback`. Test this in an Expo development build rather than basic Expo Go.

### 4. Running Locally

Start the Expo development server:

```bash
npm start
# or
npx expo start
```

Platform-specific commands:
```bash
npm run android # Launch on Android
npm run ios     # Launch on iOS
npm run web     # Launch on Web preview
```

### 5. Preview Build

Generate an Android preview APK using EAS:

```bash
npm run build:apk
```

---

## Verification & Testing

Run unit tests for integer paise calculation, remainder allocation, zero-sum guarantees, greedy settlement algorithms, and bilateral symmetry:

```bash
npm test
```

Run TypeScript static type checks:

```bash
npm run typecheck
```

---

## Project Structure

```
Triplit/
├── App.tsx                     # App entry point & navigation container
├── app.json                    # Expo config & deep link scheme
├── src/
│   ├── features/
│   │   ├── auth/              # Magic Link auth provider & gate
│   │   ├── bilateral/         # Pair ledger screens, modals, & query hooks
│   │   ├── clearance/         # 3-of-3 clearance request & approval screens
│   │   ├── dashboard/         # Group summary & balance dashboard
│   │   ├── ledger/            # Group expenses history & correction screens
│   │   ├── members/           # Member profile & status screen
│   │   ├── periods/           # Monthly accounting period summaries
│   │   └── settlement/        # Minimal-transfer settlement view
│   ├── lib/
│   │   ├── accounting.ts      # Core zero-sum integer paise math & greedy transfer engine
│   │   ├── currency.ts        # Formatting & paise/rupee conversion helpers
│   │   ├── supabase.ts        # Supabase client setup
│   │   └── uuid.ts            # Hermes-compatible crypto UUID helper
│   └── navigation/            # React Navigation stack types & screen definitions
└── supabase/
    └── migrations/            # SQL schema migrations & RPC functions
```
