/**
 * sms-ingest — the automation entry point.
 *
 * The Batwa Android app POSTs a bank SMS here. We authenticate the device,
 * store the message verbatim, and hand it to the shared pipeline, which decides
 * whether it can be filed silently or needs a one-tap answer in the inbox.
 *
 * Auth is a per-device bearer token, NOT a Supabase JWT — capture runs in a
 * background receiver with no session to hold. `verify_jwt = false` is set for
 * this function in config.toml, so the request is authenticated by hand below.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { processStoredMessage } from '../_shared/pipeline.ts'

// Generous: forwarders sometimes batch several messages into one request, and
// a 413 silently loses a real transaction.
const MAX_BODY_BYTES = 32768

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-ingest-token, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  )
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

type IngestPayload = {
  sender?: string
  body?: string
  received_at?: string
  device?: string
}

/**
 * Reads the payload as JSON or as form encoding.
 *
 * Form encoding matters more than it looks. A forwarder app builds its JSON by
 * pasting the raw SMS into a template, and bank messages routinely contain
 * quotes, backslashes and newlines — none of which get escaped, so the JSON
 * arrives malformed and the message is lost. Form encoding is escaped by the
 * HTTP client itself, so it cannot be broken by the message text.
 */
function parsePayload(
  raw: string,
  contentType: string | null,
): IngestPayload | null {
  const type = (contentType ?? '').toLowerCase()

  if (type.includes('application/x-www-form-urlencoded')) {
    const form = new URLSearchParams(raw)
    return {
      sender: form.get('sender') ?? undefined,
      body: form.get('body') ?? undefined,
      received_at: form.get('received_at') ?? undefined,
      device: form.get('device') ?? undefined,
    }
  }

  try {
    return JSON.parse(raw) as IngestPayload
  } catch {
    // Some clients send form data without setting the header. Try that before
    // giving up, rather than dropping a message over a missing content-type.
    if (raw.includes('=') && raw.includes('sender')) {
      const form = new URLSearchParams(raw)
      const sender = form.get('sender')
      if (sender) {
        return {
          sender,
          body: form.get('body') ?? undefined,
          received_at: form.get('received_at') ?? undefined,
          device: form.get('device') ?? undefined,
        }
      }
    }
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    return await handle(req)
  } catch (e) {
    // An uncaught throw here would 500 without CORS headers. Worse, the phone
    // treats a 5xx as retryable and keeps the message queued, so a message
    // that reliably crashes the pipeline would retry forever. Report it.
    console.error('sms-ingest failed:', e)
    return json(
      { status: 'error', error: e instanceof Error ? e.message : 'ingest failed' },
      500,
    )
  }
})

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const token =
    req.headers.get('x-ingest-token') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    ''
  if (!token) return json({ error: 'missing ingest token' }, 401)

  const rawBody = await req.text()
  if (rawBody.length > MAX_BODY_BYTES) {
    return json({ error: 'payload too large' }, 413)
  }

  const payload = parsePayload(rawBody, req.headers.get('content-type'))
  if (!payload) return json({ error: 'could not read request body' }, 400)

  const sender = payload.sender?.trim()
  const body = payload.body?.trim()
  if (!sender || !body) {
    return json({ error: 'sender and body are required' }, 400)
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  // --- authenticate the device -------------------------------------------
  const tokenHash = await sha256Hex(token)
  const { data: tokenRow, error: tokenError } = await db
    .from('ingest_tokens')
    .select('id, user_id, revoked_at, use_count')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (tokenError) {
    console.error('ingest_tokens lookup failed:', tokenError.message)
    return json({ error: 'token lookup failed' }, 500)
  }
  if (!tokenRow || tokenRow.revoked_at) {
    return json({ error: 'invalid or revoked token' }, 401)
  }
  const userId = tokenRow.user_id as string

  // Awaited, not fire-and-forget: an un-awaited promise loses its race with
  // isolate teardown, so `last_used_at` silently never updated and the setup
  // screen kept reporting "Never used" for a device that was working. The
  // catch preserves the original intent -- failing to record usage must never
  // cost us the message.
  try {
    await db
      .from('ingest_tokens')
      .update({
        last_used_at: new Date().toISOString(),
        use_count: (tokenRow.use_count ?? 0) + 1,
      })
      .eq('id', tokenRow.id)
  } catch (err) {
    console.error('could not record token usage:', err)
  }

  // received_at comes from the forwarder and cannot be trusted to parse. An
  // Invalid Date would throw on toISOString BEFORE the message is stored --
  // permanently dropping a real transaction over a timestamp format. Fall
  // back to now(), and clamp implausible values since this feeds the dedupe
  // fingerprint and occurred_at.
  const receivedAt = (() => {
    const parsed = payload.received_at ? new Date(payload.received_at) : null
    if (!parsed || Number.isNaN(parsed.getTime())) return new Date().toISOString()
    const drift = Math.abs(parsed.getTime() - Date.now())
    const WEEK = 7 * 24 * 3600 * 1000
    return drift > WEEK ? new Date().toISOString() : parsed.toISOString()
  })()

  // --- store the message verbatim ----------------------------------------
  // body_hash is computed by a trigger, so duplicates are caught by the unique
  // index rather than by anything the caller controls.
  const { data: message, error: insertError } = await db
    .from('sms_messages')
    .insert({
      user_id: userId,
      sender,
      body,
      received_at: receivedAt,
      device_label: payload.device ?? null,
    })
    .select('id, sender, body, received_at, device_label')
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      return json({ status: 'duplicate', message: 'already received' })
    }
    console.error('sms_messages insert failed:', insertError.message)
    return json({ error: insertError.message }, 500)
  }

  const result = await processStoredMessage(db, userId, message)
  return json(result, result.status === 'error' ? 500 : 200)
}
