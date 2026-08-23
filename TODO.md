# TODO

Open work, roughly in priority order. Each item says what is missing and why it
matters, so it can be picked up cold.

## 1. `dev.batwa.online` has no environment behind it

DNS is already live — `dev` is a CNAME to the same Vercel target as the apex —
but no project claims the hostname, so it resolves to nothing.

The decision was a **separate Supabase project**, not a shared one. Dev writing
to the production ledger is the one failure this app cannot tolerate: a bad
migration or a replayed test SMS would corrupt real financial history.

To build it:

- Second Vercel project off the same repo, tracking a `develop` branch, with
  `dev.batwa.online` attached
- Second Supabase project (free tier allows 2 per org; production is the first).
  Push `supabase/migrations` to it and deploy both Edge Functions
- Its own `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in the dev Vercel project
- Add `https://dev.batwa.online/**` to that project's auth redirect allow-list
- Free Supabase projects pause after 7 days idle, and a dev project will go
  quiet — expect to resume it from the dashboard

## Also tracked

- **Domain renewal.** `batwa.online` renews around Aug 2027 at roughly $30–40 —
  `.online` is one of the steep-renewal TLDs. Decide before then whether to keep
  it or move to a `.com`/`.xyz` while redirects are still cheap to set up.

## Done

- **Password recovery** — "Forgot password?" on sign-in and a signed-out
  `/reset-password` route now close the loop (Aug 2026).
- **The rebrand is deployed** — `batwa.online` serves the Batwa manifest and
  theme colour; verified live.
- **`README.md` describes Batwa** — the monorepo, the Android capture app, and
  the live SMS pipeline, not the old "Finance Manager / Phase 2" framing.
- **MacroDroid is retired** — the app captures SMS itself; the forwarder setup
  instructions are gone from Settings and the codebase.
