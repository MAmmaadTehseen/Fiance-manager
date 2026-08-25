-- ============================================================================
-- 0021 · Give Meezan credits a real time, and repair the rows filed 12h early
--
-- Two halves of the same problem: an internal transfer between the user's own
-- accounts was being booked twice, once as a transfer from the sending bank's
-- debit alert and once as income from the receiving bank's credit alert. The
-- sibling matcher that exists to pair those two legs works on a ten-minute
-- window, and neither leg was landing anywhere near the truth.
--
-- 1. The Meezan credit template captured only "Transaction Date", never
--    "Transaction Time" on the line below it, so every credit fell back to the
--    moment Gmail happened to sync — minutes to hours late, and dependent on
--    cron timing rather than on the payment. One capture group spanning both
--    lines fixes it: parseDateTime looks for a date and a time anywhere inside
--    what it is given, so the two lines can travel together.
--
-- 2. Migration 0020 stopped the money-in/money-out templates dropping AM/PM,
--    but rows already written are still twelve hours early. Those are repaired
--    here.
--
-- The predicate for the repair is deliberately narrow: the message's own
-- "Date and Time" field must say PM, and the stored time must nonetheless be
-- before noon Karachi time. A row satisfying both is provably wrong, because
-- a PM alert cannot describe a morning. Anything else is left alone.
-- ============================================================================

update public.parser_templates
set field_patterns = jsonb_set(
      field_patterns,
      '{datetime}',
      jsonb_build_array(
        'Transaction Date[:\s]*(\d{1,2}-[A-Za-z]{3}-\d{2,4}[\s\S]{0,60}?Transaction Time[:\s]*\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)',
        'Transaction Date[:\s]*(\d{1,2}-[A-Za-z]{3}-\d{2,4})'
      )
    )
where user_id is null
  and bank_key = 'email'
  and label = 'Email — Meezan received';

update public.transactions t
set occurred_at = t.occurred_at + interval '12 hours'
from public.sms_messages m
where m.id = t.sms_message_id
  and t.status <> 'void'
  and m.device_label = 'gmail'
  and m.body ~* 'Date and Time[^0-9]*[0-9]{1,2}-[A-Za-z]{3}-[0-9]{2,4}[^0-9]*[0-9]{1,2}:[0-9]{2}[^A-Za-z]*PM'
  and extract(hour from t.occurred_at at time zone 'Asia/Karachi') < 12;
