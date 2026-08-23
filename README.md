# Batwa

بٹوہ — "wallet". A Pakistani personal finance tracker: an installable web PWA
plus an Android app, on Supabase. Multi-user: anyone can sign up and every
user's data is private to them.

The point is that you shouldn't have to type your spending in. Your bank already
texts you on every transaction, so Batwa ingests those messages, categorises
them from memory, and only asks when it genuinely doesn't know.

**Status: live.** The core ledger, RLS-isolated multi-user schema, the SMS
ingest pipeline and the review Inbox all work. Bank SMS is captured natively by
the Android app in `apps/mobile` (a manifest-registered receiver, a
notification-listener fallback and a WorkManager retry queue) and POSTed to the
`sms-ingest` Edge Function. iOS has no SMS API, so there capture is manual.

## Structure

An npm-workspaces monorepo. Logic and the data layer are shared; UI is not,
because React Native has no `<div>`.

- `apps/web` — the Vite + React PWA
- `apps/mobile` — the Expo (React Native) Android app, with a local native
  `batwa-capture` module
- `packages/core` — types, money handling, the Supabase client and the whole
  React Query data layer, imported by both apps as `@batwa/core`
- `supabase` — schema migrations, RLS, and the Edge Functions

## Stack

- **Frontend** — Vite + React 19 + TypeScript, Tailwind v4, `vite-plugin-pwa`
- **Mobile** — Expo SDK 57, expo-router, a Kotlin capture module, EAS Build +
  EAS Update (over-the-air)
- **Data** — Supabase (Postgres + Auth), accessed directly from the client
  behind Row Level Security. No bespoke API layer.
- **Money** — `numeric(14,2)`, always positive; direction comes from the
  transaction `type`. PKR by default.

## Getting started

```bash
npm install
npx supabase start          # needs Docker Desktop running
cp .env.example .env.local  # fill in the URL + anon key that `start` printed
npm run dev
```

`supabase start` prints the local API URL and anon key. A `.env.local` pointing
at the local stack is already in place for development.

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on :5173 |
| `npm run build` | Typecheck + production build + service worker |
| `npm run typecheck` | Types only |
| `npm run db:start` / `db:stop` | Local Supabase stack |
| `npm run db:reset` | Recreate the DB and reapply every migration |
| `npm run db:types` | Regenerate `packages/core/src/types/database.types.ts` from the live schema |

Local Supabase Studio runs at <http://127.0.0.1:54323>, and sign-up emails are
caught by Mailpit at <http://127.0.0.1:54324> rather than being sent.

## Data model notes

Two decisions carry most of the weight:

**Cash is an ordinary account.** An ATM withdrawal is therefore just a transfer
from the bank to the Cash account, and cash spending debits it like anything
else. Whatever you never log shows up as drift, which the reconcile flow books
to *Unaccounted Cash* so the books always close.

**Every foreign key is composite on `(id, user_id)`.** RLS alone does not stop
one user writing a transaction that points at another user's account — the
policy only checks who owns the *row*, and the attacker does own it. Composite
FKs make a cross-user reference unresolvable in the schema itself. There is a
regression test for exactly this; see below.

## Verifying

```bash
npm run db:reset
bash supabase/tests/rls.sh
```

`rls.sh` signs up two real users through the auth API and drives PostgREST with
their JWTs — the same path the browser takes. It should report
**32 passed, 0 failed**, covering:

- new-user seeding, and balance arithmetic including the ATM → cash → spend loop
- the transfer and positive-amount constraints
- neither user can read, write, reference, or delete anything of the other's —
  through tables *and* through the balance views
- ownership cannot be spoofed on insert or moved on update
- the `SECURITY DEFINER` signup function is not callable over the API, and
  `auth.users` is not reachable
- `anon` is blocked on every table and view

Run it after any schema change. If you add a table, add its RLS policy, its
GRANT, its composite FKs — and a case here.

## Regenerating types

`packages/core/src/types/database.types.ts` is generated — never edit it.
Friendly aliases live in `packages/core/src/types/db.ts`; import from there.
After any migration:

```bash
npm run db:reset && npm run db:types
```
