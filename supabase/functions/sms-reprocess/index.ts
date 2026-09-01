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

  let payload: { message_id?: string; all?: boolean; rebuild?: boolean } = {}
  try {
    const raw = await req.text()
    if (raw) payload = JSON.parse(raw)
  } catch {
    return json({ error: 'invalid json' }, 400)
  }

  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  // Rebuilding what the user has not filed yet.
  //
  // The pipeline decides whether a payment is an internal transfer at the
  // moment it parses, by asking whether the counterparty's account exists. Add
  // the account two minutes later — which is the normal order, since you add
  // an account *because* its messages arrived — and that decision is already
  // wrong and never revisited: replaying only touches messages still waiting,
  // and these were booked, just booked as the wrong thing. The result is one
  // transfer permanently split into an expense and an income that inflate both
  // sides of the ledger and can never pair up.
  //
  // So the rows are dropped and their messages replayed, letting the pipeline
  // reach its conclusions again now that the accounts are known. Only rows
  // still `needs_review` are touched: a transaction the user has categorised
  // is settled history and rebuilding it would silently overwrite their
  // decision. A correctly-detected transfer is already 'cleared', so this
  // never disturbs one that worked.
  if (payload.rebuild) {
    // Transfers are included even though they are 'cleared', because nothing
    // about that state came from the user: the pipeline clears a transfer the
    // moment it detects one, and detection is exactly what a new account
    // changes. A transfer booked against the wrong wallet would otherwise be
    // permanent, being neither `needs_review` nor something anyone touched.
    // Rows carrying the user's own work — a split, a claim — are left alone
    // whatever their state. `note` is NOT such a marker: the pipeline writes
    // one itself on most rows, so treating it as evidence of a human edit
    // excluded everything and the rebuild silently did nothing.
    const { data: unfiled, error: unfiledError } = await db
      .from('transactions')
      .select('id, sms_message_id')
      .eq('user_id', userId)
      .or('status.eq.needs_review,type.eq.transfer')
      .neq('status', 'void')
      .not('sms_message_id', 'is', null)
      .is('split_group_id', null)
      .is('owed_amount', null)
    if (unfiledError) return json({ error: unfiledError.message }, 500)

    // A transaction that settled someone's debt must survive.
    //
    // Deleting it is legal — migration 0028 makes the link clear cleanly — but
    // the claim reopens, because the payment that closed it is gone. The
    // replay then inserts that payment again under a NEW id, which the claim
    // does not point at. Nothing looks broken and the ledger is simply wrong:
    // someone who paid you back is shown as owing you again. Editing an
    // account should not be able to do that, so these are left alone.
    const { data: settlements, error: settlementError } = await db
      .from('transactions')
      .select('settled_by_id')
      .eq('user_id', userId)
      .not('settled_by_id', 'is', null)
    if (settlementError) return json({ error: settlementError.message }, 500)
    const settling = new Set(
      (settlements ?? []).map((t) => t.settled_by_id as string),
    )

    const rebuildable = (unfiled ?? []).filter((t) => !settling.has(t.id))
    const ids = rebuildable.map((t) => t.id)
    if (ids.length > 0) {
      const { error: dropError } = await db
        .from('transactions')
        .delete()
        .eq('user_id', userId)
        .in('id', ids)
      if (dropError) return json({ error: dropError.message }, 500)
    }

    const messageIds = [
      ...new Set(rebuildable.map((t) => t.sms_message_id as string)),
    ]
    if (messageIds.length === 0) return json({ processed: 0, results: [] })

    const { data: messages, error: readError } = await db
      .from('sms_messages')
      .select('id, sender, body, received_at, device_label')
      .eq('user_id', userId)
      // Oldest first: the sending bank's alert is what teaches the pipeline
      // that a movement was internal, and the receiving half can only be
      // absorbed into a transfer that already exists.
      .order('received_at', { ascending: true })
      .in('id', messageIds)
      .limit(MAX_BATCH)
    if (readError) return json({ error: readError.message }, 500)

    const rebuilt: PipelineResult[] = []
    for (const message of messages ?? []) {
      try {
        rebuilt.push(await processStoredMessage(db, userId, message))
      } catch (e) {
        console.error('rebuild of', message.id, 'failed:', e)
        rebuilt.push({
          status: 'error',
          message_id: message.id,
          error: e instanceof Error ? e.message : 'processing failed',
        })
      }
    }

    const rebuiltSummary = rebuilt.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1
      return acc
    }, {})
    return json({
      processed: rebuilt.length,
      summary: rebuiltSummary,
      results: rebuilt,
    })
  }

  // Always scope by user_id as well as id. service_role bypasses RLS, so this
  // filter is the thing stopping one user replaying another's messages.
  let query = db
    .from('sms_messages')
    .select('id, sender, body, received_at, device_label')
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
