# TODO

Open work, roughly in priority order. Each item says what is missing and why it
matters, so it can be picked up cold.

## Also tracked

- **Domain renewal.** `batwa.online` renews around Aug 2027 at roughly $30–40 —
  `.online` is one of the steep-renewal TLDs. Decide before then whether to keep
  it or move to a `.com`/`.xyz` while redirects are still cheap to set up.

## Done

- **The dev project's production branch is `develop`** (Aug 2026). `batwa-dev`
  now builds `develop` as its production target, so a push to `develop` updates
  `dev.batwa.online` directly — `master` builds land as previews. Verified
  against the Vercel API: the recent `develop` deploys carry
  `target: production`, and both `dev.batwa.online` and `batwa.online` serve.
- **Dev environment stood up** (Aug 2026). Separate Supabase project
  `batwa-dev` (`edaxpqeszssgmlfpsyrn`, ap-southeast-2) with all 12 migrations,
  both Edge Functions, and its auth allow-list set to `dev.batwa.online`. A
  `batwa-dev` Vercel project on the `develop` branch, its own dev Supabase env
  vars, and `dev.batwa.online` attached and serving — verified pointing at the
  dev database, never prod. The DB password is in `.env.deploy.local`.
- **Password recovery** — "Forgot password?" on sign-in and a signed-out
  `/reset-password` route now close the loop.
- **The rebrand is deployed** — `batwa.online` serves the Batwa manifest and
  theme colour; verified live.
- **`README.md` describes Batwa** — the monorepo, the Android capture app, and
  the live SMS pipeline.
- **MacroDroid is retired** — the app captures SMS itself; the forwarder setup
  instructions are gone from Settings and the codebase.
