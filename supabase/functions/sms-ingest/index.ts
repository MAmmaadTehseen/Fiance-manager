/**
 * sms-ingest — the automation entry point.
 *
 * The user's phone (MacroDroid, Tasker, or a companion app) POSTs a bank SMS
 * here. We authenticate the device, store the message verbatim, and hand it to
 * the shared pipeline, which decides whether it can be filed silently or needs
 * a one-tap answer in the inbox.
 *
 * Auth is a per-device bearer token, NOT a Supabase JWT — MacroDroid cannot
 * hold a session. `verify_jwt = false` is set for this function in
 * config.toml, so the request is authenticated by hand below.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { processStoredMessage } from '../_shared/pipeline.ts'

const MAX_BODY_BYTES = 4096

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
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

  let payload: {
    sender?: string
    body?: string
    received_at?: string
    device?: string
  }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return json({ error: 'invalid json' }, 400)
  }

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
    .select('id, user_id, revoked_at')
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

  // Fire-and-forget: failing to record usage must not drop the message.
  void db
    .from('ingest_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', tokenRow.id)

  const receivedAt = payload.received_at
    ? new Date(payload.received_at).toISOString()
    : new Date().toISOString()

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
    .select('id, sender, body, received_at')
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
})
