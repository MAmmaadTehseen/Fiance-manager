# Running Batwa from the cloud (laptop-off dev + deploy)

Batwa's **production already runs in the cloud** — the email-sync cron lives in
Supabase, the site on Vercel, the DB is hosted. Turn your laptop off and email
capture, the website and the database keep running. Nothing here is needed for
that.

This doc is for the other thing: running **Claude Code** (development *and*
deploys) without your laptop on, via [claude.ai/code](https://claude.ai/code).
Coding and PRs work in the cloud out of the box; the deploy CLIs need the
one-time environment config below.

## One-time: configure the cloud environment

At [claude.ai/code](https://claude.ai/code), click the **cloud icon** above the
message box → **Add cloud environment** (or edit **Default**). Set three fields.

### 1. Network access → `Custom`

Tick **“Also include default list of common package managers”**, then list:

```
api.supabase.com
*.supabase.co
*.pooler.supabase.com
api.vercel.com
*.vercel.com
api.expo.dev
*.expo.dev
u.expo.dev
```

- `api.supabase.com` — Management API (function deploys, migrations, secrets, cron SQL)
- `*.supabase.co` — project REST + Edge Functions
- `*.pooler.supabase.com` — direct DB for `supabase db push`
- `api.vercel.com` / `*.vercel.com` — `vercel deploy`
- `*.expo.dev` / `u.expo.dev` — `eas update`, `eas build`

*(Or just pick `Full` if you don’t want to maintain a list — it’s your personal environment.)*

### 2. Environment variables (`.env` format)

```
SUPABASE_ACCESS_TOKEN=...
VERCEL_TOKEN=...
EXPO_TOKEN=...
BATWA_DEV_DB_PASS=...
CRON_SECRET=...
```

> ⚠️ **Rotate these first, then paste the fresh values.** The cloud env-vars box
> is *not* a hardened secrets store — it’s convenient, not a vault. Fine for a
> personal environment (only your account uses it); never put secrets in a
> *shared* environment.

### 3. Setup script

Leave empty. `npx supabase`, `npx vercel`, and `npx eas-cli` fetch on demand
because npm is allowlisted.

## How the workflow shifts in the cloud

Cloud sessions can only `git push` to the session’s **own working branch** (via
GitHub’s proxy), so the local pattern of pushing `master` **and** `develop`
directly doesn’t apply. The cloud flow is **branch → PR → merge**.

That’s fine, because **Vercel auto-deploys on merge**:

| Task | In the cloud |
| --- | --- |
| Write code, review, open PRs | ✅ built in |
| Web deploy (batwa.online, dev.batwa.online) | ✅ automatic on merge to `master` / `develop` |
| Supabase Edge Functions / migrations | ✅ run the CLI / Management API in-session (needs the env above) |
| EAS OTA (`eas update`) | ✅ in-session (needs `EXPO_TOKEN`) |
| Android APK build (`eas build`) | ✅ in-session; the build itself runs on Expo’s servers |

## Deploy commands (reference)

```bash
# Web: just merge — Vercel ships it. Manual prod deploy if needed:
npx vercel deploy --prod --yes --token="$VERCEL_TOKEN"

# Supabase Edge Functions (per project ref):
npx supabase functions deploy <fn> --project-ref byjytsoeayopmcaabgyj   # prod
npx supabase functions deploy <fn> --project-ref edaxpqeszssgmlfpsyrn   # dev

# Migrations: dev via db push; prod via Management API (see scripts/).

# Mobile OTA:
EXPO_TOKEN="$EXPO_TOKEN" npx eas-cli update --branch preview --environment preview -m "msg"
```

## Mobile: which build talks to which database

The EAS profile decides the database, and the database decides the app's
identity — `app.config.ts` reads `EXPO_PUBLIC_SUPABASE_URL` and derives the
name, the Android package and the on-screen DEV banner from it. So a build
cannot quietly point at prod while looking like a dev build.

| Profile | Database | App name | Android package | Output |
| --- | --- | --- | --- | --- |
| `development`, `preview` | dev (`edaxpqeszssgmlfpsyrn`) | Batwa Dev | `online.batwa.app.dev` | APK |
| `production` | prod (`byjytsoeayopmcaabgyj`) | Batwa | `online.batwa.app` | APK |
| `production-store` | prod | Batwa | `online.batwa.app` | AAB |

**`production` is the release build.** Batwa is distributed outside the Play
Store, so a release is an APK people sideload from `/download` — that is what
`production` now emits. `production-store` exists for the day there is a Play
listing; an AAB cannot be sideloaded, so it is not the release path today.
Both extend `production-base`, which holds the prod credentials.

Historically every build used `preview`, which pointed at the prod database —
so `preview` *was* the release channel. It is dev now, and `production` has
taken over that job. Rebuilding a release means
`eas build --profile production`, not `preview`.

Dev credentials are the `base` profile, so a new profile that forgets to set
`env` inherits the dev database rather than the real ledger. Separate package
names mean both apps install side by side instead of overwriting each other —
`eas build --profile preview` will not replace the app you actually use.

`/download` serves a different APK per deploy (`DownloadPage.tsx` picks by
`isProductionDeploy`), so bump the matching URL there after a release build.

## Project refs (not secret)

- **Prod Supabase:** `byjytsoeayopmcaabgyj`
- **Dev Supabase:** `edaxpqeszssgmlfpsyrn`
- **Vercel prod:** `finance-manager` · **Vercel dev:** `batwa-dev`
- **Expo project:** `6d023af2-8e41-404e-b250-3d16f6d61ac6`
