/**
 * gmail-sync — reads bank transaction emails and files them.
 *
 * Uses the refresh token stored by gmail-connect to pull recent bank mail,
 * extracts each message's text, and hands it to the SAME pipeline the phone's
 * SMS go through — so account resolution, dedup and the review inbox all work
 * unchanged. Email bodies are just text; the parser templates do the rest.
 *
 * Callable two ways:
 *   POST with a user JWT              → sync that user now (the "sync" button)
 *   POST with x-cron-secret header    → sync every connected inbox (scheduled)
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { processStoredMessage } from '../_shared/pipeline.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''

// The Gmail search that finds bank transaction mail. Broad on purpose — the
// parser templates decide what is real; anything unmatched is kept in the
// inbox, never dropped.
const GMAIL_QUERY =
  'newer_than:30d ("Transaction Amount" OR "transaction details" OR RAAST OR IBFT OR credited OR debited OR "Funds Transfer")'
const MAX_MESSAGES = 40

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, content-type, apikey, x-client-info, x-supabase-api-version, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// --- Gmail helpers --------------------------------------------------------

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    console.error('token refresh failed:', await res.text())
    return null
  }
  const data = await res.json()
  return (data.access_token as string) ?? null
}

async function gmailFetch(accessToken: string, path: string): Promise<unknown> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`gmail ${path}: ${res.status} ${await res.text()}`)
  return res.json()
}

function b64urlToText(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/')
  const bytes = Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) =>
    c.charCodeAt(0),
  )
  return new TextDecoder().decode(bytes)
}

/** HTML → text that keeps label/value pairs on legible lines so the parser can
 *  see "Transaction Amount: PKR 1.00" rather than a run-together blob. */
function htmlToText(html: string): string {
  return html
    .replace(/<\s*(br|\/tr|\/p|\/div|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<\s*\/td\s*>/gi, ': ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ *\n */g, '\n')
    .trim()
}

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] }

/** Prefer text/plain; fall back to the HTML part, flattened. */
function extractText(payload: Part): string {
  const find = (part: Part, mime: string): string | null => {
    if (part.mimeType === mime && part.body?.data) return b64urlToText(part.body.data)
    for (const p of part.parts ?? []) {
      const hit = find(p, mime)
      if (hit) return hit
    }
    return null
  }
  const plain = find(payload, 'text/plain')
  if (plain && plain.trim()) return plain
  const html = find(payload, 'text/html')
  return html ? htmlToText(html) : ''
}

function header(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

// --- sync one inbox -------------------------------------------------------

type SyncResult = { email: string; scanned: number; new: number; filed: number }

async function syncAccount(
  db: ReturnType<typeof createClient>,
  account: { id: string; user_id: string; email_address: string; refresh_token: string },
): Promise<SyncResult> {
  const result: SyncResult = { email: account.email_address, scanned: 0, new: 0, filed: 0 }

  const accessToken = await refreshAccessToken(account.refresh_token)
  if (!accessToken) return result

  const list = (await gmailFetch(accessToken, `messages?q=${encodeURIComponent(GMAIL_QUERY)}&maxResults=${MAX_MESSAGES}`)) as {
    messages?: { id: string }[]
  }
  const ids = (list.messages ?? []).map((m) => m.id)
  result.scanned = ids.length

  for (const id of ids) {
    const msg = (await gmailFetch(accessToken, `messages/${id}?format=full`)) as {
      internalDate?: string
      payload?: Part & { headers?: { name: string; value: string }[] }
    }
    const headers = msg.payload?.headers ?? []
    const from = header(headers, 'From')
    const body = msg.payload ? extractText(msg.payload) : ''
    if (!from || !body) continue

    const receivedAt = msg.internalDate
      ? new Date(Number(msg.internalDate)).toISOString()
      : new Date().toISOString()

    // Store verbatim, same table as SMS. body_hash (a trigger) + its unique
    // index make re-syncing idempotent, so we never double-file an email.
    const { data: stored, error } = await db
      .from('sms_messages')
      .insert({
        user_id: account.user_id,
        sender: from,
        body,
        received_at: receivedAt,
        device_label: 'gmail',
      })
      .select('id, sender, body, received_at')
      .single()

    if (error) continue // 23505 duplicate → already filed on an earlier sync
    result.new += 1

    const outcome = await processStoredMessage(db, account.user_id, stored)
    if (outcome.status === 'parsed' || outcome.status === 'needs_account') result.filed += 1
  }

  await db
    .from('email_accounts')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', account.id)

  return result
}

// --- entry ----------------------------------------------------------------

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  if (!CLIENT_ID || !CLIENT_SECRET) return json({ error: 'Gmail is not configured' }, 503)

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // Cron path: sync everyone.
  const cron = req.headers.get('x-cron-secret')
  if (cron && CRON_SECRET && cron === CRON_SECRET) {
    const { data: accounts } = await db
      .from('email_accounts')
      .select('id, user_id, email_address, refresh_token')
      .is('revoked_at', null)
    const results: SyncResult[] = []
    for (const a of accounts ?? []) results.push(await syncAccount(db, a as never))
    return json({ synced: results.length, results })
  }

  // User path: sync just the caller.
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!jwt) return json({ error: 'not signed in' }, 401)
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  })
  const { data: userData, error: userError } = await asUser.auth.getUser()
  if (userError || !userData.user) return json({ error: 'not signed in' }, 401)

  const { data: account } = await db
    .from('email_accounts')
    .select('id, user_id, email_address, refresh_token')
    .eq('user_id', userData.user.id)
    .is('revoked_at', null)
    .maybeSingle()

  if (!account) return json({ error: 'no connected inbox' }, 404)

  const result = await syncAccount(db, account as never)
  return json({ status: 'ok', ...result })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    return await handle(req)
  } catch (e) {
    console.error('gmail-sync failed:', e)
    return json({ error: e instanceof Error ? e.message : 'sync failed' }, 500)
  }
})
