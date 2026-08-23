/**
 * sms-reprocess — re-run the pipeline over messages already stored.
 *
 * The reason this exists: nothing is ever dropped. A message from a bank we
 * could not parse, or one quoting a card the app did not know, sits in the
 * inbox with its original text intact. Once the user adds a rule or names the
 * card, this replays those messages so the backlog resolves itself instead of
 * being retyped by hand.
 *
 * Authenticated with the user's own JWT — this is a normal in-app action.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { processStoredMessage, type PipelineResult } from '../_shared/pipeline.ts'

/** Bounded so one call cannot run unboundedly long. */
const MAX_BATCH = 100

const CORS = {
  'Access-Control-Allow-Origin': '*',
  // supabase-js's functions.invoke sends x-client-info and a version header.
  'Access-Control-Allow-Headers':
    'authorization, content-type, apikey, x-client-info, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    return await handle(req)
  } catch (e) {
    // Any uncaught throw would otherwise become a bare 500 with no CORS
    // headers, which the browser reports as a CORS error and the UI cannot
    // read. Route it through json() so the real message reaches the client.
    console.error('sms-reprocess failed:', e)
    return json(
      { error: e instanceof Error ? e.message : 'reprocess failed' },
      500,
    )
  }
})

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const authHeader = req.headers.get('authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'not signed in' }, 401)

  const url = Deno.env.get('SUPABASE_URL')!

  // Identify the caller with the anon client and their own token, so the JWT
  // is verified by GoTrue rather than trusted.
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  })

  const { data: userData, error: userError } = await asUser.auth.getUser()
  if (userError || !userData.user) return json({ error: 'not signed in' }, 401)
  const userId = userData.user.id

  let payload: { message_id?: string; all?: boolean } = {}
  try {
    const raw = await req.text()
    if (raw) payload = JSON.parse(raw)
  } catch {
    return json({ error: 'invalid json' }, 400)
  }

  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  // Always scope by user_id as well as id. service_role bypasses RLS, so this
  // filter is the thing stopping one user replaying another's messages.
  let query = db
    .from('sms_messages')
    .select('id, sender, body, received_at')
    .eq('user_id', userId)
    .order('received_at', { ascending: true })
    .limit(MAX_BATCH)

  if (payload.message_id) {
    query = query.eq('id', payload.message_id)
  } else {
    // Only the ones still waiting on something. Already-parsed messages are
    // left alone so replaying cannot disturb settled history.
    query = query.in('parse_status', ['unmatched', 'needs_account'])
  }

  const { data: messages, error } = await query
  if (error) return json({ error: error.message }, 500)
  if (!messages?.length) return json({ processed: 0, results: [] })

  const results: PipelineResult[] = []
  for (const message of messages) {
    // One malformed message must not abort the whole batch — the others are
    // still worth processing, and the failure is surfaced per message.
    try {
      results.push(await processStoredMessage(db, userId, message))
    } catch (e) {
      console.error('reprocess of', message.id, 'failed:', e)
      results.push({
        status: 'error',
        message_id: message.id,
        error: e instanceof Error ? e.message : 'processing failed',
      })
    }
  }

  const summary = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1
    return acc
  }, {})

  return json({ processed: results.length, summary, results })
}
