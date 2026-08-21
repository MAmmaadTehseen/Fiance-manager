# TODO

Open work, roughly in priority order. Each item says what is missing and why it
matters, so it can be picked up cold.

## 1. Password recovery is unreachable

`resetPassword()` exists in [`apps/web/src/lib/auth.tsx`](apps/web/src/lib/auth.tsx)
and calls `resetPasswordForEmail` with a `redirectTo` of
`${window.location.origin}/reset-password`. Nothing reaches it:

- No "Forgot password?" link on `apps/web/src/features/auth/SignInPage.tsx`
- No `/reset-password` route in `apps/web/src/app/App.tsx` — the email link
  lands on `*` and redirects to `/`

This was survivable while `mailer_autoconfirm` was on and accounts were
effectively disposable. It is not survivable now: email confirmation is
required, so a user who forgets their password has no route back into their
account and no way to reach their ledger.

To close it:

- Add a "Forgot password?" link on the sign-in screen that calls
  `resetPassword(email)` and shows a "check your inbox" confirmation
- Add a `/reset-password` route, reachable **signed out**, that reads the
  recovery session Supabase puts in the URL and calls `updateUser({ password })`
- The Supabase redirect allow-list already permits `https://batwa.online/**`,
  so no dashboard change is needed

## 2. `dev.batwa.online` has no environment behind it

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

- **The rebrand is committed but not deployed.** `batwa.online` still serves a
  manifest reading `Finance Manager` / `#0f172a`, and the Open Graph tags are
  absent, so shared links render no card. One `vercel --prod` fixes it.
- **`README.md` still says "Finance Manager"** and describes SMS capture as
  Phase 2, which no longer matches the Android app in `apps/mobile`.
- **Domain renewal.** `batwa.online` renews around Aug 2027 at roughly $30–40 —
  `.online` is one of the steep-renewal TLDs. Decide before then whether to keep
  it or move to a `.com`/`.xyz` while redirects are still cheap to set up.
