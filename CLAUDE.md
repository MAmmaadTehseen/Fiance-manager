# Batwa (بٹوہ — "wallet")

A Pakistani personal-finance tracker: a **web PWA + Android app** that
auto-captures bank transaction alerts into a categorised, RLS-isolated
multi-user ledger. PKR-first.

## This file is the shared brain

Every session reads this — **local (your laptop) and cloud (claude.ai/code)
alike**. Work can start in either place and stay in sync, as long as you
**commit and push**. Keep this file current when the architecture changes; it is
the memory that makes a fresh session (especially a cloud one) productive
immediately.

## Monorepo (npm workspaces)

- `apps/web` — Vite + React 19 + TS, Tailwind v4, PWA. The main UI.
- `apps/mobile` — Expo SDK 57 (React Native), expo-router, a Kotlin
  `batwa-capture` native module. Android-first (iOS has no SMS API). SDK-57
  docs rule: see `apps/mobile/AGENTS.md`.
- `packages/core` — `@batwa/core`: types, money, the Supabase client, and the
  whole React Query data layer + hooks. Shared by both apps; **UI is not
  shared** (React Native has no `<div>`).
- `supabase` — migrations, RLS, Edge Functions (Deno).

## Capture channels (how transactions get in)

1. **Email — primary, recommended.** One-tap **Connect Gmail** (OAuth).
   `gmail-connect` stores a refresh token server-side (never in the browser);
   `gmail-sync` (15-min cron + on-connect + a "Sync now" button) reads bank
   emails, stores each as an `sms_messages` row, and runs the **same pipeline**
   as SMS. Play-safe, reliable, works on iPhone too. Email parser templates are
   keyed on an `@` sender so they only match email.
2. **SMS — optional, power-user.** The native Android app reads bank SMS and
   POSTs to `sms-ingest`. Sideload-only (Google Play restricts SMS) and fights
   OEM battery managers — kept as an extra, not the default.
3. **Manual** — add by hand.

MacroDroid / third-party SMS forwarders are **retired** — do not reintroduce.

## The pipeline (shared by SMS + email)

`supabase/functions/_shared/pipeline.ts` (`processStoredMessage`) +
`_shared/parser.ts`. A stored message → parsed via DB `parser_templates` (regex
`field_patterns`) → account resolved (by last4 / `accounts.sms_senders`) →
transaction created, transfer de-duplicated across both legs, or parked in the
review **Inbox** (`needs_account` / `unmatched`). Nothing is ever dropped.

## Data model — conventions to follow exactly

- Every FK is **composite on `(id, user_id)`**. RLS alone does not stop a user
  referencing another user's row; the composite FK does. Add
  `unique (id, user_id)` to any new table.
- RLS: `enable row level security` + `create policy "own X" for all to
  authenticated using (user_id = (select auth.uid())) with check (...)`.
- Grants: `grant ... to authenticated; revoke all ... from anon;`. Use
  **column-level grants** to hide secret columns from the client (see
  `email_accounts` — the refresh token is service_role-only).
- Money: `numeric(14,2)`, always positive; direction comes from `type`.
  supabase-js returns numerics as **strings** → use `toNumber`.
- Generated types: `packages/core/src/types/database.types.ts` (never edit —
  regenerate). Friendly aliases in `types/db.ts`.

## Features

Ledger, accounts (cash is an ordinary account), review Inbox (teach-once
categorisation), Dashboard, **Budgets**, **Savings goals**, **Recurring
detection**, **CSV export**. Mobile mirrors these via tabs:
Home / Activity / Inbox / Accounts / **Plan** (budgets+goals+recurring) /
Settings.

## Environments

|              | Prod                            | Dev                              |
| ------------ | ------------------------------- | -------------------------------- |
| Site         | batwa.online                    | dev.batwa.online                 |
| Branch       | `master`                        | `develop`                        |
| Supabase ref | `byjytsoeayopmcaabgyj`          | `edaxpqeszssgmlfpsyrn`           |
| Vercel proj  | `finance-manager`               | `batwa-dev`                      |

Non-prod builds show a **DEV banner** (keyed off the Supabase URL in
`apps/web/src/lib/env.ts` — safe by default: anything not the prod project is
flagged). Dev has its **own separate auth** (own users) and auto-confirms
signups. Expo project id: `6d023af2-8e41-404e-b250-3d16f6d61ac6`.

## Workflow — identical from local or cloud

- **Always commit + push.** That is what keeps local and cloud in sync.
- **Local:** push to `master` **and** `develop` (both auto-deploy on Vercel).
- **Cloud (claude.ai/code):** a session can only push its **own** branch → so
  work on a branch, open a **PR**, and **merge** (Vercel auto-deploys web on
  merge). See `CLOUD-SETUP.md` for the one-time cloud-environment config.
- **Web deploys are automatic** on push/merge to `master`/`develop` — no CLI.
- **Supabase / EAS deploys** run via CLI and need the tokens below.

## Deploy (reference)

Tokens live in `.env.deploy.local` locally (gitignored) and, in the cloud, in
the environment's variables — **same names**: `SUPABASE_ACCESS_TOKEN`,
`VERCEL_TOKEN`, `EXPO_TOKEN`, `BATWA_DEV_DB_PASS`, `CRON_SECRET`.

- **Web:** merge (auto) or `npx vercel deploy --prod --yes --token=$VERCEL_TOKEN`.
- **Edge Functions:** `npx supabase functions deploy <fn> --project-ref <ref>`.
- **Migrations:** dev via `npx supabase db push`; prod via the Management API
  (`POST api.supabase.com/v1/projects/<ref>/database/query`) then record the
  version in `supabase_migrations.schema_migrations` (see the scratchpad
  `apply-mig.mjs` pattern).
- **Mobile OTA:** `EXPO_TOKEN=… npx eas-cli update --branch preview
  --environment preview -m "…"`. The `preview` channel is linked to the
  `preview` branch; the installed APK listens there.
- **Gmail secrets** (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) are Supabase
  **function secrets**, set per project. Dev has both; **prod still needs
  `GOOGLE_CLIENT_SECRET`** to enable email capture on batwa.online.

## Commands

- `npm run build` (typecheck + web build + SW), `npm run typecheck`,
  `npm run lint` (oxlint).
- Mobile typecheck: from `apps/mobile`, `npx tsc --noEmit`.
- Tests (need local Supabase / Docker): `bash supabase/tests/rls.sh` (32),
  `parser.sh`, `ingest.sh`.

## Current state (Aug 2026)

Web + mobile live. **Email capture works end-to-end** (Gmail OAuth + 15-min
sync + templates; ~100% of real bank emails parse — Faysal/Meezan RAAST/IBFT).
Dev environment stood up (`develop` → `dev.batwa.online`). Open work in
`TODO.md`: enable email on prod (add `GOOGLE_CLIENT_SECRET`), add Connect Gmail
to the mobile app, more bank email templates.
