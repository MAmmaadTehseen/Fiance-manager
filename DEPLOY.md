# Deploying

Two pieces: the database and Edge Functions go to **Supabase**, the PWA goes
to **Vercel**. Both have free tiers that comfortably fit personal use.

Once deployed, SMS capture keeps working when your computer is off — which is
the whole reason to do this before the app is finished.

## 1. Supabase project

Create a project at <https://supabase.com/dashboard>. Pick a region close to
you (Singapore or Frankfurt are the nearest to Pakistan). Save the database
password it gives you — it is needed once, below, and cannot be read back.

From **Project Settings → API**, note:

- **Project URL** — `https://<ref>.supabase.co`
- **anon / publishable key** — safe to ship in the browser; RLS is what
  actually protects the data

Then push the schema and functions:

```bash
npx supabase login                     # opens a browser, or use --token
npx supabase link --project-ref <ref>  # asks for the database password
npx supabase db push                   # applies all migrations in order
npx supabase functions deploy sms-ingest --no-verify-jwt
npx supabase functions deploy sms-reprocess
```

`--no-verify-jwt` on `sms-ingest` is deliberate and load-bearing: the phone
authenticates with its own ingest token, not a Supabase session, and the
function verifies that token itself before touching anything.

## 2. Auth settings

In **Authentication → URL Configuration**, set:

- **Site URL** — your deployed origin, e.g. `https://batwa.online`
- **Redirect URLs** — add the same origin plus `/**`

Skip this and confirmation and password-reset emails will point at
`localhost`, which works for nobody.

**On email confirmations:** Supabase's built-in SMTP is rate limited to a
handful of messages per hour and is not meant for real traffic. For a personal
app with a few users, either turn confirmations off (**Authentication →
Sign In / Providers → Email → Confirm email**), or connect a real sender under
**Project Settings → Auth → SMTP** — Resend's free tier is enough.

## 3. Frontend

```bash
npm i -g vercel
vercel link
vercel env add VITE_SUPABASE_URL production        # https://<ref>.supabase.co
vercel env add VITE_SUPABASE_ANON_KEY production   # the anon key
vercel --prod
```

`vercel.json` already handles the SPA rewrite (so `/inbox` doesn't 404 on a
hard refresh), long-lived asset caching, and a no-cache rule on `sw.js` so a
stale service worker can never pin someone to an old build.

Cloudflare Pages works identically — build `npm run build`, output `dist`, and
add an SPA fallback to `/index.html`.

## 4. Point your phone at it

Open the deployed app → **Settings → Connect your phone**. The local-address
warning disappears on a real origin, so the webhook URL shown is the one to
use. Generate a token and update the MacroDroid action's URL and
`X-Ingest-Token` header.

The old ingest token keeps working — tokens belong to your account, not to any
particular URL — but the tunnel URL it was pointed at will not.

## Notes

- **Free-tier projects pause after 7 days of inactivity.** Daily SMS traffic
  keeps it awake; a long quiet spell does not, and a paused project drops
  incoming webhooks. Resume it from the dashboard.
- **After any migration**, run `npx supabase db push` again, then
  `npm run db:types` locally and commit the regenerated types.
- The `service_role` grants in migration 0005 matter in production too: without
  them the Edge Functions cannot read their own tables.
