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

export type StoredMessage = {
  id: string
  sender: string
  body: string
  received_at: string
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
  const byLast4 = await findAccountByLast4(db, userId, last4)
  if (byLast4) return byLast4

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

  // Checked first so a reprocess is idempotent: a message that already
  // produced a transaction must never produce a second one.
  const { data: mine } = await db
    .from('transactions')
    .select('id')
    .eq('sms_message_id', messageId)
    .eq('type', txType)
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

    const { data: sibling } = await db
      .from('transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'transfer')
      .eq('amount', fields.amount)
      .gte('occurred_at', tStart)
      .lte('occurred_at', tEnd)
      .or(
        `and(account_id.eq.${sourceId},counterparty_account_id.eq.${counterpartyId}),` +
          `and(account_id.eq.${counterpartyId},counterparty_account_id.eq.${sourceId})`,
      )
      .limit(1)
      .maybeSingle()

    if (sibling) {
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
    })
    .select('id')
    .single()

  if (txError) {
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
