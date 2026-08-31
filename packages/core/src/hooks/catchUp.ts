import { getSupabase } from '../client'

/**
 * Everything that was waiting on a fact the user has just supplied.
 *
 * Naming an account used to fix one message. Bank alerts arrive in runs — the
 * same account quoted three times in a morning — so answering "which account
 * is 0508?" left two identical questions behind it, and answering the same
 * question three times is the app failing to learn.
 *
 * Two shapes of waiting are caught. A message parked on a card number sits in
 * `pending_last4`. A message parked because its sender was unknown has no
 * digits at all, so it is matched on the sender itself.
 *
 * `resolved_at` is stamped before the replay rather than after: the replay is
 * what changes `parse_status` away from the waiting states, and once it has,
 * there is no longer anything identifying these particular messages as ones
 * the user just dealt with — they would look like any other parsed message and
 * vanish from the Inbox, which is the thing this is meant to prevent.
 */
export async function catchUpWaiting(match: {
  last4?: string | null
  sender?: string | null
}): Promise<number> {
  const db = getSupabase()

  let q = db
    .from('sms_messages')
    .select('id')
    .in('parse_status', ['unmatched', 'needs_account'])
    .is('dismissed_at', null)

  if (match.last4) q = q.eq('pending_last4', match.last4)
  else if (match.sender) q = q.eq('sender', match.sender)
  else return 0

  const { data, error } = await q
  if (error) throw error

  const ids = (data ?? []).map((m) => m.id)

  // Knowing an account changes more than what was waiting on it. The pipeline
  // decides whether a payment is an internal transfer by asking, as it parses,
  // whether the counterparty's account exists — so every message that arrived
  // before this account did was booked against a wrong answer, and replaying
  // only the waiting ones leaves those wrong forever. `rebuild` drops the
  // transactions the user has not filed yet and lets the pipeline conclude
  // again; anything already categorised is settled and left alone.
  if (match.last4) {
    const { error: rebuildError } = await db.functions.invoke('sms-reprocess', {
      body: { rebuild: true },
    })
    if (rebuildError) throw rebuildError
  }

  if (ids.length === 0) return 0

  const { error: markError } = await db
    .from('sms_messages')
    .update({ resolved_at: new Date().toISOString() })
    .in('id', ids)
  if (markError) throw markError

  // The replay is a single call: it picks up everything still waiting for this
  // user, which is a superset of the ids above and costs no more than asking
  // for them one at a time would.
  const { error: replayError } = await db.functions.invoke('sms-reprocess', {
    body: {},
  })
  if (replayError) throw replayError

  return ids.length
}
