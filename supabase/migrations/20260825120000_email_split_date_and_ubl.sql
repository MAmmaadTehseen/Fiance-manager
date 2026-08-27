-- ============================================================================
-- 0024 · Two gaps the real inbox showed us
--
-- Found by running the current parser over a month of real bank email before
-- clearing it out. 32 of 44 messages came through clean; every remaining gap
-- was one of these two shapes. The five unmatched messages were correct —
-- three Namecheap receipts priced only in USD, two CDS securities notices —
-- so they are left to land in the review Inbox rather than being taught away.
--
-- 1. Faysal's Inter Bank Funds Transfer *credit* labels the moment as two
--    separate fields:
--
--        Transaction Date:: 23-Aug-2026: Transaction Time:: 04:10 PM:
--
--    while its debit uses a single `Date and Time::`. Only the debit had a
--    pattern, so five credits carried no time at all — and `parseDateTime`
--    deliberately returns null for a date with no time (a midnight guess was
--    splitting transfer siblings across a day and booking them twice). The
--    fallback is `received_at`, which for mail synced on a 15-minute cron can
--    be an hour or more after the payment.
--
--    One capture group spans both labels, which works because parseDateTime
--    searches its input for a date and a time independently rather than
--    requiring them adjacent. It goes first: the old date-only pattern still
--    matches this text and would win, and a date alone parses to nothing.
--
-- 2. UBL's Raast email had no template at all and was being caught by the
--    generic SMS "transfer sent" rule, which found the amount and nothing
--    else — no payee, no time, and no account, which is why a UBL payment
--    showed as `****` in the ledger and could not be opened.
--
--    Its account is masked to two digits (`32*****33`), so this template
--    deliberately captures NO last4. Manufacturing a four-digit key from
--    `32*****33` would invent an account number and could match the wrong
--    account outright. UBL email resolves to its account by sender instead —
--    Inbox → "this sender is this account" — which is exactly the mapping
--    `accounts.sms_senders` exists for.
-- ============================================================================

-- 1 · Date and time under separate labels ------------------------------------

update public.parser_templates
   set field_patterns = jsonb_set(
         field_patterns,
         '{datetime}',
         jsonb_build_array(
           -- "Transaction Date:: 23-Aug-2026: Transaction Time:: 04:10 PM"
           'Transaction Date[:\s]*(\d{1,2}-[A-Za-z]{3}-\d{2,4}[\s\S]{0,40}?Transaction Time[:\s]*\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)',
           -- "Date and Time:: 18-AUG-2026 06:45 AM"
           'Date and Time[:\s]*(\d{1,2}-[A-Za-z]{3}-\d{2,4}\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)',
           -- Date alone: parses to nothing, but keeps the shape documented.
           'Transaction Date[:\s]*(\d{1,2}-[A-Za-z]{3}-\d{2,4})'
         )
       )
 where user_id is null
   and label in ('Email — money in', 'Email — money out');

-- 2 · UBL Raast payment email ------------------------------------------------

insert into public.parser_templates
  (user_id, bank_key, label, country, sender_pattern, match_pattern,
   field_patterns, kind, priority, sample, enabled)
values (
  null,
  'ubl',
  'Email — UBL Raast paid',
  'PK',
  '@ubl\.com\.pk',
  'You paid\s+(?:PKR|Rs)',
  jsonb_build_object(
    'amount', jsonb_build_array(
      'You paid\s+(?:PKR|Rs)\.?\s*([\d,]+(?:\.\d{1,2})?)'
    ),
    'merchant', jsonb_build_array(
      'You paid\s+(?:PKR|Rs)\.?\s*[\d,.]+\s+to\s+([A-Za-z][^\n:]{1,45}?)\s+via\b'
    ),
    'datetime', jsonb_build_array(
      'Date[:\s]*(\d{1,2}-[A-Za-z]{3}-\d{2,4}[\s\S]{0,20}?Time[:\s]*\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)'
    ),
    'reference', jsonb_build_array(
      'Transaction ID[:\s]*(\d{5,})'
    )
  ),
  'purchase',
  -- Ahead of the generic rules that were mis-claiming it.
  50,
  'Dear CUSTOMER , You paid PKR. 1.00 to SOME PAYEE via Raast. Here are the details: Account Title: CUSTOMER Account Details: Town, City - 32*****33 Date: 21-Aug-2026 Time: 12:41:27 AM Transaction ID: 1328017674 Transaction Type: Inter Bank Funds Transfer Raast',
  true
);
