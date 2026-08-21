-- ============================================================================
-- 0010 · Three gaps found against a real message backlog
--
-- 1. DECLINED TRANSACTIONS. "Your transaction was not completed due to
--    insufficient limit" arrived four times. Nothing matched it, which was
--    luck rather than design: these messages quote a merchant and, in other
--    banks' wording, an amount. A decline that becomes a ledger entry is
--    money the user never spent, so this is matched FIRST, ahead of even the
--    OTP rule.
--
-- 2. TELCO PROMOS. A Ufone bonus advert. Written narrowly around promo
--    framing rather than around the word "recharge", because a wallet top-up
--    is a real transaction that says almost the same thing.
--
-- 3. CARD PURCHASE, AMOUNT FIRST. Real message, and a real transaction that
--    was being dropped:
--      PKR 330.87 Debit Card purchase at Name-Cheap.Com * from FBL A/C *7432
--    The existing card template only reads the amount when a verb precedes
--    it; here the verb phrase is "Debit Card purchase" and it follows.
-- ============================================================================

insert into public.parser_templates
  (user_id, bank_key, label, country, sender_pattern, match_pattern, kind, priority, sample)
values
  (null, 'generic', 'Declined or failed transaction', 'PK',
   '.*',
   '(?:was not completed|not completed due to|could not be completed|has been declined|\bdeclined\b|transaction (?:failed|reversed|unsuccessful)|insufficient (?:balance|funds|limit))',
   'ignore', 5,
   'Dear Customer, Your transaction was not completed due to insufficient limit. You may apply for limit enhancement. Call 021 111 06 06 06'),

  (null, 'generic', 'Telco promotional offer', 'PK',
   '.*',
   '(?:free bonus|abhi recharge|sirf ap k|\d+\s*GB\s*(?:whatsapp|facebook|internet|data)|offer valid|subscribe now|tum hi to ho)',
   'ignore', 15,
   'FREE BONUS Sirf Ap K lye, Rs 100 ya us se ziada k recharge per. Abhi recharge karen aur payen 2GB WhatsApp aur Facebook 3 din k liye');

insert into public.parser_templates
  (user_id, bank_key, label, country, sender_pattern, match_pattern,
   field_patterns, kind, priority, sample)
values
  (null, 'generic', 'Pakistan — card purchase, amount first', 'PK',
   '.*',
   '(?:card\s+purchase|purchase\s+at)',
   $json${
     "amount": [
       "(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s*(?:\\w+\\s+){0,3}?purchase",
       "purchase[^\\d]{0,25}?(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)"
     ],
     "merchant": [
       "purchase\\s+at\\s+([A-Za-z0-9][A-Za-z0-9 &.'-]{2,45}?)\\s*(?:\\*|\\bfrom\\b|\\bon\\b|,|;|$)"
     ],
     "last4": [
       "\\bfrom\\s+(?:[A-Za-z]+\\s+){0,2}?A\\/?C(?:count)?\\s*[:#*\\s]*(\\d{3,})",
       "(?:ending(?:\\s+(?:with|in))?|card\\s*(?:no\\.?)?)\\s*[*x#]*\\s*(\\d{3,})"
     ],
     "balance": [
       "(?:(?:avl|avail(?:able)?|closing|new|remaining)\\.?\\s*bal(?:ance)?|balance)\\.?\\s*(?:is)?[:\\s]*(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)"
     ],
     "datetime": [
       "(\\d{1,2}[-/][A-Za-z]{3}[-/]\\d{2,4}(?:\\s+(?:at\\s+)?\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?)?)",
       "(\\d{1,2}[-/]\\d{1,2}[-/]\\d{2,4}(?:\\s+(?:at\\s+)?\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?)?)"
     ]
   }$json$::jsonb,
   'purchase', 205,
   'PKR 330.87 Debit Card purchase at Name-Cheap.Com  * from FBL A/C *7432 on 21/AUG/2026 at 01:38:55 PM');
