/**
 * The message -> transaction pipeline.
 *
 * Lives apart from any one entry point because two things run it: `sms-ingest`
 * when the phone forwards a new message, and `sms-reprocess` when the user
 * fixes a template or names an unknown card and wants their backlog resolved.
 * Those two must behave identically, so they share this code rather than
 * describing it twice.
 */

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { parseSms, kindToTransactionType, type ParserTemplate } from './parser.ts'

/** A resend, or the same payment typed by hand, within this window. */
const DEDUPE_WINDOW_SECONDS = 90

/**
 * How far apart the two halves of an internal transfer may arrive. Both banks
 * announce the same movement, and RAAST legs can lag, so this is deliberately
 * wider than the general dedupe window.
 */
const TRANSFER_MATCH_WINDOW_SECONDS = 600

/**
 * How far apart two channels may announce the same payment.
 *
 * An email alert can trail its SMS by minutes, and a Gmail sync only runs
 * periodically — but `occurred_at` comes from the message body, not from when
 * we saw it, so both channels describe the same instant and this only has to
 * absorb the banks' own clock skew.
 */
const CHANNEL_MATCH_WINDOW_SECONDS = 900

/**
 * The bank's own reference, normalised into a dedupe key.
 *
 * This is the only identifier that survives the trip across channels: the SMS
 * and the email for one payment share a reference but share almost no wording,
 * so text fingerprints cannot see that they are the same event. Writing it to
 * `dedupe_hash` puts the guarantee in the unique index rather than in a check
 * that a concurrent insert could race past.
 *
 * Short values are rejected — a two-character capture from a loose pattern
 * would collide across genuinely unrelated payments.
 */
function referenceKey(reference: string | null | undefined): string | null {
  if (!reference) return null
  const normalised = String(reference).toUpperCase().replace(/[^A-Z0-9]/g, '')
  return normalised.length >= 5 ? `ref:${normalised}` : null
}

export type StoredMessage = {
  id: string
  sender: string
  body: string
  received_at: string
  /**
   * Which capture path stored this — the phone's label for SMS and for the
   * notification listener, `gmail` for a synced email. Used to tell whether an
   * existing transaction came from a different channel; see the cross-channel
   * check below.
   */
  device_label?: string | null
}

export type PipelineResult = {
  status:
    | 'filed'
    | 'needs_review'
    | 'needs_account'
    | 'unmatched'
    | 'ignored'
    | 'linked'
    | 'error'
  message_id: string
  transaction_id?: string
  type?: string
  amount?: number
  merchant?: string | null
  template?: string
  last4?: string | null
  balance_drift?: number | null
  hint?: string
  error?: string
}

type OwnAccount = { id: string; currency: string }

/** Looks up one of the user's own accounts by its stored short identifier. */
async function findAccountByLast4(
  db: SupabaseClient,
  userId: string,
  last4: string | null,
): Promise<OwnAccount | null> {
  if (!last4) return null
  const { data } = await db
    .from('accounts')
    .select('id, currency')
    .eq('user_id', userId)
    .eq('last4', last4)
    .is('archived_at', null)
    .maybeSingle()
  return data ?? null
}

/**
 * Resolves which of the user's accounts a message is about.
 *
 * Tried in order of how much the message actually tells us. Guessing wrong
 * corrupts balances silently, which is worse than asking, so the last resort
 * is to give up and let the inbox ask once.
 */
async function resolveAccount(
  db: SupabaseClient,
  userId: string,
  last4: string | null,
  sender: string,
): Promise<OwnAccount | null> {
  // 1. The message named the account outright.
  if (last4) {
    // And if it named one we do not recognise, STOP. The fallbacks below are
    // guesses, and a guess here posts real money to the wrong account without
    // saying so. An unknown card is a question, not a default — answering it
    // once in the inbox teaches it permanently.
    return await findAccountByLast4(db, userId, last4)
  }

  // 2. Outgoing alerts name only the recipient, so fall back to which bank
  //    sent the message. Learned once via the inbox, then automatic.
  const senderKey = sender.trim().toUpperCase()
  if (senderKey) {
    const { data } = await db
      .from('accounts')
      .select('id, currency')
      .eq('user_id', userId)
      .is('archived_at', null)
      .contains('sms_senders', [senderKey])
      .limit(1)
      .maybeSingle()
    if (data) return data
  }

  // 3. Wallet messages often carry no digits at all. If there is exactly one
  //    non-cash account it cannot be anything else.
  const { data } = await db
    .from('accounts')
    .select('id, currency')
    .eq('user_id', userId)
    .neq('type', 'cash')
    .is('archived_at', null)
  return data?.length === 1 ? data[0]! : null
}

export async function processStoredMessage(
  db: SupabaseClient,
  userId: string,
  message: StoredMessage,
): Promise<PipelineResult> {
  const messageId = message.id
  const receivedAt = message.received_at

  const finish = async (
    patch: Record<string, unknown>,
    result: PipelineResult,
  ): Promise<PipelineResult> => {
    await db
      .from('sms_messages')
      // Clear stale pipeline state so a reprocess never leaves a half-written
      // verdict from the previous attempt behind.
      .update({
        matched_template_id: null,
        parsed: null,
        pending_last4: null,
        error: null,
        ...patch,
      })
      .eq('id', messageId)
    return result
  }

  const thisChannel = message.device_label ?? null

  /**
   * Record this message against a transaction another message already created.
   *
   * The second slot exists so both announcements of one payment stay attached
   * to the row: a reprocess of either then finds it through the `mine` check
   * rather than booking a second copy. When both slots are already taken the
   * row is simply left alone — it is still the right answer, and overwriting a
   * slot would orphan whichever message was there.
   */
  const linkIntoExisting = async (
    existing: {
      id: string
      sms_message_id?: string | null
      sms_message_id_2?: string | null
    },
    hint: string,
    templateId: string,
  ): Promise<PipelineResult> => {
    if (!existing.sms_message_id) {
      await db
        .from('transactions')
        .update({ sms_message_id: messageId })
        .eq('id', existing.id)
    } else if (!existing.sms_message_id_2) {
      await db
        .from('transactions')
        .update({ sms_message_id_2: messageId })
        .eq('id', existing.id)
    }

    return await finish(
      { parse_status: 'duplicate', matched_template_id: templateId },
      {
        status: 'linked',
        message_id: messageId,
        transaction_id: existing.id,
        hint,
      },
    )
  }

  const { data: templates } = await db
    .from('parser_templates')
    .select(
      'id, user_id, bank_key, label, sender_pattern, match_pattern, field_patterns, kind, priority',
    )
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .eq('enabled', true)

  const result = parseSms(
    message.sender,
    message.body,
    (templates ?? []) as ParserTemplate[],
  )

  if (!result.matched) {
    return await finish(
      { parse_status: 'unmatched' },
      {
        status: 'unmatched',
        message_id: messageId,
        hint: 'add a rule in Settings to teach the app this format',
      },
    )
  }

  if (result.kind === 'ignore') {
    return await finish(
      { parse_status: 'ignored', matched_template_id: result.template.id },
      { status: 'ignored', message_id: messageId, template: result.template.label },
    )
  }

  const fields = result.fields
  const occurredAt = fields.occurredAt ?? receivedAt

  const account = await resolveAccount(db, userId, fields.last4, message.sender)
  if (!account) {
    return await finish(
      {
        parse_status: 'needs_account',
        matched_template_id: result.template.id,
        parsed: fields,
        pending_last4: fields.last4,
      },
      {
        status: 'needs_account',
        message_id: messageId,
        last4: fields.last4,
        hint: 'tell the app which account this card belongs to',
      },
    )
  }

  const parsedType = kindToTransactionType(result.kind)

  // --- is this money moving between the user's own accounts? --------------
  // Both banks announce the same movement, so treating each half as spending
  // and income would invent two transactions and leave the ledger showing no
  // net change on the destination while the source is never touched. One
  // transfer is the truth: out of one account, into the other.
  const ownCounterparty = await findAccountByLast4(
    db,
    userId,
    fields.counterpartyLast4,
  )
  const isInternalTransfer =
    ownCounterparty !== null && ownCounterparty.id !== account.id

  const txType = isInternalTransfer ? 'transfer' : parsedType

  // --- learn the merchant -------------------------------------------------
  let categoryId: string | null = null
  let merchantId: string | null = null

  if (fields.merchantKey && txType !== 'transfer') {
    const { data: existing } = await db
      .from('merchants')
      .select('id, default_category_id, times_seen')
      .eq('user_id', userId)
      .eq('raw_name', fields.merchantKey)
      .maybeSingle()

    if (existing) {
      merchantId = existing.id
      categoryId = existing.default_category_id
      await db
        .from('merchants')
        .update({
          times_seen: (existing.times_seen ?? 0) + 1,
          last_seen_at: occurredAt,
        })
        .eq('id', existing.id)
    } else {
      const { data: created } = await db
        .from('merchants')
        .insert({
          user_id: userId,
          raw_name: fields.merchantKey,
          display_name: fields.merchant ?? fields.merchantKey,
          times_seen: 1,
          last_seen_at: occurredAt,
        })
        .select('id')
        .single()
      merchantId = created?.id ?? null
    }
  }

  // A transfer is stored as one row: money leaves `sourceId` and lands in
  // `counterpartyId`. Which of the two resolved accounts plays which role
  // depends on whether this message announced the sending or the receiving.
  let sourceId = account.id
  let counterpartyId: string | null = null

  if (isInternalTransfer && ownCounterparty) {
    if (parsedType === 'income') {
      // This is the arrival half: `account` is where the money landed.
      sourceId = ownCounterparty.id
      counterpartyId = account.id
    } else {
      sourceId = account.id
      counterpartyId = ownCounterparty.id
    }
  } else if (txType === 'transfer') {
    // An ATM withdrawal moves money into the user's own cash, so it needs the
    // Cash account as a destination rather than a category.
    const { data: cash } = await db
      .from('accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'cash')
      .is('archived_at', null)
      .limit(1)
      .maybeSingle()

    if (!cash) {
      return await finish(
        {
          parse_status: 'needs_account',
          matched_template_id: result.template.id,
          parsed: fields,
        },
        {
          status: 'needs_account',
          message_id: messageId,
          hint: 'no Cash account to withdraw into',
        },
      )
    }
    counterpartyId = cash.id
  }

  // --- do not double-count ------------------------------------------------
  const at = new Date(occurredAt).getTime()

  // Telco redelivery, or the SMS path and the notification path both seeing
  // one message: the server-side body_hash fingerprint buckets received_at to
  // the minute, so a copy arriving in a different minute inserts as a fresh
  // sms_messages row and none of the checks below can see the first copy's
  // transaction. Catch it here: another already-parsed message with the same
  // body inside the transfer window is the same real-world event.
  //
  // Matched on body alone, not sender and body. The two capture paths label
  // the sender differently for one message — the broadcast carries the
  // originating address while a notification carries whatever the SMS app put
  // in its title — so requiring both to agree let the second copy through and
  // booked the payment twice. Identical body text is the stronger signal
  // anyway: two distinct payments differ in amount, balance or reference, so
  // a byte-identical body inside the window is always one event seen twice.
  {
    const rStart = new Date(at - TRANSFER_MATCH_WINDOW_SECONDS * 1000).toISOString()
    const rEnd = new Date(at + TRANSFER_MATCH_WINDOW_SECONDS * 1000).toISOString()
    const { data: earlierCopy } = await db
      .from('sms_messages')
      .select('id')
      .eq('user_id', userId)
      .eq('body', message.body)
      .eq('parse_status', 'parsed')
      .neq('id', messageId)
      .gte('received_at', rStart)
      .lte('received_at', rEnd)
      .limit(1)
      .maybeSingle()

    if (earlierCopy) {
      return await finish(
        { parse_status: 'duplicate', matched_template_id: result.template.id },
        {
          status: 'linked',
          message_id: messageId,
          hint: 'a copy of this message was already processed',
        },
      )
    }
  }

  // Checked first so a reprocess is idempotent: a message that already
  // produced OR linked into a transaction must never produce a second one.
  // Deliberately type-agnostic: if a template edit changes the computed kind
  // between runs (expense yesterday, transfer today), filtering on type would
  // miss the existing row and insert alongside it -- and re-post the fee too.
  // Ordered by created_at so the main transaction wins over its fee row.
  const { data: mine } = await db
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .or(`sms_message_id.eq.${messageId},sms_message_id_2.eq.${messageId}`)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (mine) {
    return await finish(
      {
        parse_status: 'parsed',
        matched_template_id: result.template.id,
        parsed: fields,
      },
      { status: 'linked', message_id: messageId, transaction_id: mine.id },
    )
  }

  // The sibling half of an internal transfer: the other bank announcing the
  // same movement. Matched on the account pair in EITHER orientation, because
  // whichever message arrives second describes the same row from the far end.
  if (isInternalTransfer && counterpartyId) {
    const tStart = new Date(
      at - TRANSFER_MATCH_WINDOW_SECONDS * 1000,
    ).toISOString()
    const tEnd = new Date(
      at + TRANSFER_MATCH_WINDOW_SECONDS * 1000,
    ).toISOString()

    // Only transfers whose second slot is still empty are candidates: a
    // transfer that already absorbed its opposite leg is complete, and a
    // third equal-amount message is a genuinely separate movement that must
    // become its own row -- splitting a payment under a per-transaction limit
    // produces exactly this shape.
    const { data: candidates } = await db
      .from('transactions')
      .select('id, sms_message_id')
      .eq('user_id', userId)
      .eq('type', 'transfer')
      .eq('amount', fields.amount)
      .is('sms_message_id_2', null)
      .gte('occurred_at', tStart)
      .lte('occurred_at', tEnd)
      .or(
        `and(account_id.eq.${sourceId},counterparty_account_id.eq.${counterpartyId}),` +
          `and(account_id.eq.${counterpartyId},counterparty_account_id.eq.${sourceId})`,
      )
      .order('occurred_at', { ascending: true })
      .limit(5)

    // The two legs of one transfer come from two different banks, so their
    // sender ids differ. A candidate created by a message from the SAME
    // sender is the same bank announcing a SECOND movement -- fall through
    // and book it separately rather than merging two real transfers.
    let sibling: { id: string } | null = null
    for (const candidate of candidates ?? []) {
      if (!candidate.sms_message_id) {
        sibling = candidate
        break
      }
      const { data: creator } = await db
        .from('sms_messages')
        .select('sender')
        .eq('id', candidate.sms_message_id)
        .maybeSingle()
      if (creator && creator.sender !== message.sender) {
        sibling = candidate
        break
      }
    }

    if (sibling) {
      // Record this message as the second leg, so the row is complete and a
      // reprocess of either message finds it via the mine check above.
      await db
        .from('transactions')
        .update({ sms_message_id_2: messageId })
        .eq('id', sibling.id)
      return await finish(
        {
          parse_status: 'parsed',
          matched_template_id: result.template.id,
          parsed: fields,
        },
        {
          status: 'linked',
          message_id: messageId,
          transaction_id: sibling.id,
          type: 'transfer',
          amount: fields.amount,
          hint: 'the other half of a transfer already recorded',
        },
      )
    }
  }

  // The same payment, announced by a different channel.
  //
  // The checks above cannot see this one. `body_hash` and the body match need
  // identical text, and an email alert shares none of its SMS's wording; the
  // twin check below only considers rows a human or a recurring rule created,
  // never one another message already booked. So without this, turning on a
  // second channel books every payment twice.
  //
  // The bank's reference is what ties them together. It is written to
  // `dedupe_hash` on insert, so this lookup is an index probe — and the unique
  // index behind it is what actually guarantees the invariant when two
  // channels arrive at once.
  const dedupeHash = referenceKey(fields.reference)

  if (dedupeHash) {
    const { data: sameRef } = await db
      .from('transactions')
      .select('id, sms_message_id, sms_message_id_2')
      .eq('user_id', userId)
      .eq('dedupe_hash', dedupeHash)
      .limit(1)
      .maybeSingle()

    if (sameRef) {
      return await linkIntoExisting(
        sameRef,
        'the same payment arrived on another channel',
        result.template.id,
      )
    }
  }

  // No reference to match on — some wallets send none. Fall back to the shape
  // of the payment, but only accept a candidate that a DIFFERENT channel
  // recorded: two identical amounts on one account within the window are
  // usually a genuine pair (a split payment, a retried top-up), and merging
  // those would silently lose money from the ledger. Requiring the other row
  // to have come from another device_label means we only merge when two
  // sources are describing one event, which is exactly the case this exists
  // for.
  if (!dedupeHash) {
    const cStart = new Date(at - CHANNEL_MATCH_WINDOW_SECONDS * 1000).toISOString()
    const cEnd = new Date(at + CHANNEL_MATCH_WINDOW_SECONDS * 1000).toISOString()

    const { data: candidates } = await db
      .from('transactions')
      .select('id, sms_message_id, sms_message_id_2')
      .eq('user_id', userId)
      .eq('account_id', sourceId)
      .eq('type', txType)
      .eq('amount', fields.amount)
      .not('sms_message_id', 'is', null)
      .gte('occurred_at', cStart)
      .lte('occurred_at', cEnd)
      .order('occurred_at', { ascending: true })
      .limit(5)

    for (const candidate of candidates ?? []) {
      const { data: creator } = await db
        .from('sms_messages')
        .select('device_label')
        .eq('id', candidate.sms_message_id!)
        .maybeSingle()

      if (creator && (creator.device_label ?? null) !== (thisChannel ?? null)) {
        return await linkIntoExisting(
          candidate,
          'the same payment was already reported by another channel',
          result.template.id,
        )
      }
    }
  }

  // The same payment already entered by hand, or by a posted recurring rule.
  const windowStart = new Date(at - DEDUPE_WINDOW_SECONDS * 1000).toISOString()
  const windowEnd = new Date(at + DEDUPE_WINDOW_SECONDS * 1000).toISOString()

  const { data: twin } = await db
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('account_id', sourceId)
    .eq('type', txType)
    .eq('amount', fields.amount)
    .is('sms_message_id', null)
    .gte('occurred_at', windowStart)
    .lte('occurred_at', windowEnd)
    .limit(1)
    .maybeSingle()

  if (twin) {
    await db
      .from('transactions')
      .update({ sms_message_id: messageId, source: 'sms' })
      .eq('id', twin.id)
    return await finish(
      {
        parse_status: 'parsed',
        matched_template_id: result.template.id,
        parsed: fields,
      },
      {
        status: 'linked',
        message_id: messageId,
        transaction_id: twin.id,
        hint: 'matched an entry that was already here',
      },
    )
  }

  // --- write the transaction ---------------------------------------------
  // A remembered merchant category means this can be filed silently. That is
  // the whole point: the inbox should only ever hold genuine unknowns.
  const knowsCategory = categoryId !== null
  const status =
    txType === 'transfer' || knowsCategory ? 'cleared' : 'needs_review'

  const { data: tx, error: txError } = await db
    .from('transactions')
    .insert({
      user_id: userId,
      account_id: sourceId,
      counterparty_account_id: counterpartyId,
      type: txType,
      amount: fields.amount,
      currency: account.currency,
      occurred_at: occurredAt,
      category_id: txType === 'transfer' ? null : categoryId,
      merchant_id: merchantId,
      note: fields.reference ? `Ref ${fields.reference}` : null,
      source: 'sms',
      status,
      confidence: knowsCategory ? 0.95 : 0.6,
      sms_message_id: messageId,
      // The unique partial index on (user_id, dedupe_hash) is what actually
      // guarantees one row per bank reference. The lookup above is the fast
      // path; this is the one that holds when two channels land at once.
      dedupe_hash: dedupeHash,
    })
    .select('id')
    .single()

  if (txError) {
    // The other channel won the race. Between the lookup above and this insert
    // its message booked the same reference, and the unique index rejected the
    // duplicate — which is the index doing its job, not a failure. Attach this
    // message to the row that won instead of reporting an error the user would
    // see as a lost transaction.
    if (txError.code === '23505' && dedupeHash) {
      const { data: winner } = await db
        .from('transactions')
        .select('id, sms_message_id, sms_message_id_2')
        .eq('user_id', userId)
        .eq('dedupe_hash', dedupeHash)
        .limit(1)
        .maybeSingle()

      if (winner) {
        return await linkIntoExisting(
          winner,
          'the same payment arrived on another channel',
          result.template.id,
        )
      }
    }

    return await finish(
      { parse_status: 'unmatched', error: txError.message },
      { status: 'error', message_id: messageId, error: txError.message },
    )
  }

  // --- the transfer fee is real money too ---------------------------------
  // Banks quote it inside the same message ("Fee: Rs 1.55"). Ignoring it makes
  // the balance drift by exactly the fee every time, which then looks like a
  // missing transaction.
  if (fields.fee && fields.fee > 0) {
    const { data: feeCategory } = await db
      .from('categories')
      .select('id')
      .eq('user_id', userId)
      .eq('slug', 'bank-charges')
      .maybeSingle()

    const { error: feeError } = await db.from('transactions').insert({
      user_id: userId,
      account_id: sourceId,
      type: 'expense',
      amount: fields.fee,
      currency: account.currency,
      occurred_at: occurredAt,
      category_id: feeCategory?.id ?? null,
      note: 'Transfer fee',
      source: 'sms',
      status: 'cleared',
      confidence: 0.95,
      sms_message_id: messageId,
    })
    if (feeError) console.error('could not post fee:', feeError.message)
  }

  // --- free audit: does the bank's balance agree with ours? ---------------
  let drift: number | null = null
  if (fields.balance !== null) {
    const { data: computed } = await db
      .from('account_balances')
      .select('balance')
      .eq('account_id', account.id)
      .maybeSingle()

    const computedBalance = computed?.balance ?? null
    drift =
      computedBalance === null
        ? null
        : Math.round((fields.balance - Number(computedBalance)) * 100) / 100

    await db.from('balance_assertions').insert({
      user_id: userId,
      account_id: account.id,
      asserted_balance: fields.balance,
      computed_balance: computedBalance,
      drift,
      observed_at: occurredAt,
      sms_message_id: messageId,
    })
  }

  return await finish(
    {
      parse_status: 'parsed',
      matched_template_id: result.template.id,
      parsed: fields,
    },
    {
      status: status === 'cleared' ? 'filed' : 'needs_review',
      message_id: messageId,
      transaction_id: tx.id,
      type: txType,
      amount: fields.amount,
      merchant: fields.merchant,
      template: result.template.label,
      balance_drift: drift,
    },
  )
}
