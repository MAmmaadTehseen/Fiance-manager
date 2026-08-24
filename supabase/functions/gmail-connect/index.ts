/**
 * gmail-connect — the "Connect Gmail" OAuth flow.
 *
 * Two entry points on one function:
 *   POST /gmail-connect           → authenticated; returns the Google consent URL
 *   GET  /gmail-connect/callback  → Google redirects here with an auth code
 *
 * The callback has no Batwa session (it is a browser redirect from Google), so
 * the user is carried across in a signed `state` value rather than a JWT. We
 * exchange the code for a refresh token and store it server-side only — it
 * never returns to the browser. `verify_jwt = false` in config.toml because the
 * callback cannot present a JWT; the start path checks the JWT by hand.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/gmail-connect/callback`
// openid+email so the id_token tells us which mailbox was connected; gmail
// readonly is the working scope; offline access is what yields a refresh token.
const SCOPE = 'openid email https://www.googleapis.com/auth/gmail.readonly'
/**
 * Where to send the user back when the caller supplies no redirect.
 *
 * Derived from the project this function is deployed to, so the dev deployment
 * cannot bounce someone into production — a different database, where the
 * session they started with does not exist. The web app always passes its own
 * origin; this only covers a caller that does not.
 */
const PROD_SUPABASE_REF = 'byjytsoeayopmcaabgyj'
const DEFAULT_APP = SUPABASE_URL.includes(PROD_SUPABASE_REF)
  ? 'https://batwa.online'
  : 'https://dev.batwa.online'
const STATE_TTL_MS = 10 * 60 * 1000

const CORS = {
  'Access-Control-Allow-Origin': '*',
  // supabase-js's functions.invoke sends x-client-info (and a version header);
  // both must be allowed or the browser's preflight rejects the call.
  'Access-Control-Allow-Headers':
    'authorization, content-type, apikey, x-client-info, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// --- signed state (HMAC over the service key) -----------------------------

const encoder = new TextEncoder()

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : ''
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(SERVICE_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

async function signState(payload: object): Promise<string> {
  const body = b64url(encoder.encode(JSON.stringify(payload)))
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(), encoder.encode(body))
  return `${body}.${b64url(new Uint8Array(sig))}`
}

async function verifyState(state: string): Promise<{ uid: string; ret: string } | null> {
  const [body, sig] = state.split('.')
  if (!body || !sig) return null
  const ok = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(),
    b64urlDecode(sig),
    encoder.encode(body),
  )
  if (!ok) return null
  try {
    const p = JSON.parse(new TextDecoder().decode(b64urlDecode(body)))
    if (typeof p.exp !== 'number' || Date.now() > p.exp) return null
    return { uid: p.uid, ret: p.ret }
  } catch {
    return null
  }
}

/** The email claim out of Google's id_token (a JWT; we only need its payload). */
function emailFromIdToken(idToken: string): string | null {
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(idToken.split('.')[1])))
    return typeof payload.email === 'string' ? payload.email : null
  } catch {
    return null
  }
}

// --- start: hand back the consent URL -------------------------------------

async function handleStart(req: Request): Promise<Response> {
  if (!CLIENT_ID) return json({ error: 'Gmail connect is not configured' }, 503)

  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!jwt) return json({ error: 'not signed in' }, 401)

  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  })
  const { data, error } = await asUser.auth.getUser()
  if (error || !data.user) return json({ error: 'not signed in' }, 401)

  let ret = DEFAULT_APP
  try {
    const bodyText = await req.text()
    if (bodyText) {
      const parsed = JSON.parse(bodyText)
      if (typeof parsed.redirect === 'string' && /^https?:\/\//.test(parsed.redirect)) {
        ret = parsed.redirect.replace(/\/+$/, '')
      }
    }
  } catch {
    // fall back to the default app origin
  }

  const state = await signState({ uid: data.user.id, ret, exp: Date.now() + STATE_TTL_MS })

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', SCOPE)
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('include_granted_scopes', 'true')
  // consent every time so a re-connect always returns a refresh token, which
  // Google otherwise only sends on the very first authorisation.
  authUrl.searchParams.set('prompt', 'consent')
  authUrl.searchParams.set('state', state)

  return json({ url: authUrl.toString() })
}

// --- callback: exchange the code, store the token -------------------------

function appRedirect(ret: string, status: 'connected' | 'error'): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: `${ret}/settings?gmail=${status}` },
  })
}

async function handleCallback(url: URL): Promise<Response> {
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') ?? ''
  const verified = await verifyState(state)
  const ret = verified?.ret ?? DEFAULT_APP

  if (url.searchParams.get('error') || !code || !verified) {
    return appRedirect(ret, 'error')
  }

  // Exchange the auth code for tokens.
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })
  if (!tokenRes.ok) {
    console.error('gmail token exchange failed:', await tokenRes.text())
    return appRedirect(ret, 'error')
  }
  const tokens = await tokenRes.json()
  const refreshToken = tokens.refresh_token as string | undefined
  const email = tokens.id_token ? emailFromIdToken(tokens.id_token) : null

  if (!refreshToken || !email) {
    // No refresh token means Google returned only an access token (a re-auth
    // without prompt=consent). Without it we cannot sync later, so treat as a
    // failure rather than storing a dead connection.
    console.error('gmail connect: missing refresh token or email')
    return appRedirect(ret, 'error')
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { error } = await db.from('email_accounts').upsert(
    {
      user_id: verified.uid,
      provider: 'gmail',
      email_address: email,
      refresh_token: refreshToken,
      access_token: tokens.access_token ?? null,
      token_expires_at: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
      revoked_at: null,
    },
    { onConflict: 'user_id,email_address' },
  )
  if (error) {
    console.error('gmail connect: store failed:', error.message)
    return appRedirect(ret, 'error')
  }

  return appRedirect(ret, 'connected')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const url = new URL(req.url)
  try {
    if (url.pathname.endsWith('/callback')) return await handleCallback(url)
    if (req.method === 'POST') return await handleStart(req)
    return json({ error: 'POST to start, or hit /callback' }, 405)
  } catch (e) {
    console.error('gmail-connect failed:', e)
    // On the callback path, keep the user moving rather than showing a raw 500.
    if (url.pathname.endsWith('/callback')) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${DEFAULT_APP}/settings?gmail=error` },
      })
    }
    return json({ error: e instanceof Error ? e.message : 'connect failed' }, 500)
  }
})
