# Finance Manager

A personal finance tracker built as an installable PWA on Supabase. Multi-user:
anyone can sign up and every user's data is private to them.

The point of the app is that you shouldn't have to type your spending in. Your
bank already texts you on every transaction — the plan is to ingest those
messages, categorise them from memory, and only ask when it genuinely doesn't
know. See [the plan](../../.claude/plans/) for the full design.

**Status: Phase 1 (core ledger).** Accounts, categories, manual transactions,
transfers and balances work. SMS capture is Phase 2.

## Stack

- **Frontend** — Vite + React 19 + TypeScript, Tailwind v4, `vite-plugin-pwa`
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
| `npm run db:types` | Regenerate `src/types/database.types.ts` from the live schema |

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

`src/types/database.types.ts` is generated — never edit it. Friendly aliases
live in `src/types/db.ts`; import from there. After any migration:

```bash
npm run db:reset && npm run db:types
```
