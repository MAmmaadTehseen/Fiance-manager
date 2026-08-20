/**
 * sms-ingest — the automation entry point.
 *
 * The user's phone (MacroDroid, Tasker, or a companion app) POSTs a bank SMS
 * here. We deduplicate it, match it against a parser template, resolve the
 * account, look up what we already know about the merchant, and either file
 * the transaction silently or leave it in the inbox as a one-tap question.
 *
 * Auth is a per-device bearer token, NOT a Supabase JWT — MacroDroid cannot
 * hold a session. `verify_jwt = false` is set for this function in
 * config.toml, so every request must be authenticated by hand below.
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import {
  parseSms,
  kindToTransactionType,
  type ParserTemplate,
} from '../_shared/parser.ts'

const MAX_BODY_BYTES = 4096
/** A resend or a manual entry within this window is the same payment. */
const DEDUPE_WINDOW_SECONDS = 90

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
 * Resolves which account a message belongs to.
 *
 * Guessing wrong corrupts balances silently, which is much worse than asking,
 * so we only fall back to a sole candidate account when there is genuinely no
 * ambiguity. Otherwise the inbox asks once and `last4` is remembered.
 */
async function resolveAccount(
  db: SupabaseClient,
  userId: string,
  last4: string | null,
): Promise<{ id: string; currency: string } | null> {
  if (last4) {
    const { data } = await db
      .from('accounts')
      .select('id, currency')
      .eq('user_id', userId)
      .eq('last4', last4)
      .is('archived_at', null)
      .maybeSingle()
    if (data) return data
    return null
  }

  // No card digits in the message (common for wallets). If the user has
  // exactly one non-cash account, it cannot be anything else.
  const { data } = await db
    .from('accounts')
    .select('id, currency')
    .eq('user_id', userId)
    .neq('type', 'cash')
    .is('archived_at', null)
  return data?.length === 1 ? data[0]! : null
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
  if (rawBody.length > MAX_BODY_BYTES) return json({ error: 'payload too large' }, 413)

  let payload: IngestPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return json({ error: 'invalid json' }, 400)
  }

  const sender = payload.sender?.trim()
  const body = payload.body?.trim()
  if (!sender || !body) return json({ error: 'sender and body are required' }, 400)

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
    console.error('ingest_tokens lookup failed', tokenError.message)
    return json({ error: 'token lookup failed' }, 500)
  }
  if (!tokenRow || tokenRow.revoked_at) {
    return json({ error: 'invalid or revoked token' }, 401)
  }
  const userId = tokenRow.user_id as string

  // Fire-and-forget: a failure to record usage must not drop the message.
  void db
    .from('ingest_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', tokenRow.id)

  const receivedAt = payload.received_at
    ? new Date(payload.received_at).toISOString()
    : new Date().toISOString()

  // --- store the message verbatim ----------------------------------------
  // body_hash is computed by a trigger, so a duplicate is caught by the
  // unique index rather than by anything the caller controls.
  const { data: message, error: insertError } = await db
    .from('sms_messages')
    .insert({
      user_id: userId,
      sender,
      body,
      received_at: receivedAt,
      device_label: payload.device ?? null,
    })
    .select('id')
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      return json({ status: 'duplicate', message: 'already received' })
    }
    return json({ error: insertError.message }, 500)
  }
  const messageId = message.id as string

  const finish = async (
    patch: Record<string, unknown>,
    response: Record<string, unknown>,
    status = 200,
  ) => {
    await db.from('sms_messages').update(patch).eq('id', messageId)
    return json({ ...response, message_id: messageId }, status)
  }

  // --- match a template ---------------------------------------------------
  const { data: templates } = await db
    .from('parser_templates')
    .select(
      'id, user_id, bank_key, label, sender_pattern, match_pattern, field_patterns, kind, priority',
    )
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .eq('enabled', true)

  const result = parseSms(sender, body, (templates ?? []) as ParserTemplate[])

  if (!result.matched) {
    return await finish(
      { parse_status: 'unmatched' },
      { status: 'unmatched', hint: 'add a template in Settings > SMS rules' },
    )
  }

  if (result.kind === 'ignore') {
    return await finish(
      { parse_status: 'ignored', matched_template_id: result.template.id },
      { status: 'ignored', template: result.template.label },
    )
  }

  const fields = result.fields
  const occurredAt = fields.occurredAt ?? receivedAt

  // --- resolve the account ------------------------------------------------
  const account = await resolveAccount(db, userId, fields.last4)
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
        last4: fields.last4,
        hint: 'tell the app which account this card belongs to',
      },
    )
  }

  const txType = kindToTransactionType(result.kind)

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

  // An ATM withdrawal is money moving into the user's own cash, so it needs
  // the Cash account as its destination rather than a category.
  let counterpartyId: string | null = null
  if (txType === 'transfer') {
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
        { status: 'needs_account', hint: 'no Cash account to withdraw into' },
      )
    }
    counterpartyId = cash.id
  }

  // --- do not double-count ------------------------------------------------
  // The same payment may already be here as a manual entry or a posted
  // recurring instance.
  const windowStart = new Date(
    new Date(occurredAt).getTime() - DEDUPE_WINDOW_SECONDS * 1000,
  ).toISOString()
  const windowEnd = new Date(
    new Date(occurredAt).getTime() + DEDUPE_WINDOW_SECONDS * 1000,
  ).toISOString()

  const { data: twin } = await db
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('account_id', account.id)
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
      { status: 'linked', transaction_id: twin.id, note: 'matched an existing entry' },
    )
  }

  // --- write the transaction ---------------------------------------------
  // Known merchant with a remembered category means we can file it silently.
  // Otherwise it goes to the inbox, which is the only thing we ever ask about.
  const knowsCategory = categoryId !== null
  const status =
    txType === 'transfer' ? 'cleared' : knowsCategory ? 'cleared' : 'needs_review'

  const { data: tx, error: txError } = await db
    .from('transactions')
    .insert({
      user_id: userId,
      account_id: account.id,
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
      { status: 'error', error: txError.message },
      500,
    )
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
      transaction_id: tx.id,
      type: txType,
      amount: fields.amount,
      merchant: fields.merchant,
      template: result.template.label,
      balance_drift: drift,
    },
  )
})
