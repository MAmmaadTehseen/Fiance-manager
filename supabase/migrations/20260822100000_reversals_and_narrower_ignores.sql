-- ============================================================================
-- 0012 · Reversals are money; ignore rules were swallowing real transactions
--
-- Three independent reviewers converged on the same two defects in migration
-- 0010's ignore templates:
--
-- 1. The decline rule's `transaction (?:failed|reversed|unsuccessful)`
--    alternate silently ignored REVERSALS — "Your transaction of Rs 5,000 has
--    been reversed" is money returned to the account, not a non-event. The
--    original expense stood, the credit never landed, and the balance drifted
--    by exactly the refund with nothing in the inbox to explain it. Before
--    0010 these at least surfaced as 'unmatched'.
--
-- 2. The telco-promo rule's structural `\d+ GB (whatsapp|internet|...)` branch
--    matched genuine paid-bundle confirmations: "Rs 120 deducted. Enjoy 5GB
--    internet" was classified 'ignored' before any purchase template ran —
--    the precise recharge-vs-promo trap 0010's own comment promised to avoid.
--    Its `offer valid` / `subscribe now` branches were also strict subsets of
--    the older promo rule at priority 20, giving one wording two owners.
-- ============================================================================

-- A reversal/refund that quotes an amount books as a credit. One that quotes
-- no amount falls through this template (parseSms skips amount-less matches)
-- and lands in the inbox as unmatched — visible, not vanished. Priority 4:
-- ahead of the decline rule, since reversal notices often also contain the
-- word "declined" or "failed" describing the original attempt.
insert into public.parser_templates
  (user_id, bank_key, label, country, sender_pattern, match_pattern,
   field_patterns, kind, priority, sample)
values
  (null, 'generic', 'Reversal or refund credit', 'PK',
   '.*',
   '(?:revers(?:ed|al)|refund(?:ed)?|amount\s+returned)',
   $json${
     "amount": [
       "(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)[^.]{0,60}?(?:revers|refund|returned|credited)",
       "(?:revers(?:ed|al)|refund(?:ed)?|returned|credited)[^\\d]{0,40}?(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)"
     ],
     "last4": [
       "\\b(?:in|to)\\s+(?:your\\s+)?(?:[A-Za-z]+\\s+){0,3}?A\\/?C(?:count)?\\s*[:#*\\s]*(\\d{3,})",
       "\\bA\\/?C(?:count)?\\s*[:#*\\s]*(\\d{3,})",
       "(?:ending(?:\\s+(?:with|in))?|card\\s*(?:no\\.?)?)\\s*[*x#]*\\s*(\\d{3,})"
     ],
     "reference": [
       "(?:TID|Tx\\s*ID|TX\\s*ID|Trx\\s*ID)\\s*[:#]?\\s*([A-Za-z0-9]{5,25})",
       "Ref\\s*#?\\s*:?\\s*([A-Za-z0-9]{5,25})"
     ]
   }$json$::jsonb,
   'credit', 4,
   'Your transaction has been reversed. PKR 5,000.00 credited to your account ending 4821. Ref # 990011223');

-- The pre-existing 'Promotional and informational' rule (migration 0004,
-- priority 20) matched a BARE 'subscribe'/'offer'/'discount', so any real
-- transaction whose text merely contained one — "You have subscribed to
-- Weekly Internet. Rs 120 deducted" — was ignored before a purchase template
-- could run. Anchor those words to promotional framing so a stray occurrence
-- in a debit alert no longer swallows it.
update public.parser_templates
   set match_pattern = '(?:congratulations|special\s+offer|get\s+\d+%|%\s+discount|discount\s+on|\bwin\b|subscribe\s+now|to\s+unsubscribe|dear valued customer, we)'
 where user_id is null
   and label = 'Promotional and informational';

-- Narrow the decline rule: pure declines stay ignored, but 'reversed' leaves
-- the alternates so a reversal can reach the credit template above.
update public.parser_templates
   set match_pattern = '(?:was not completed|not completed due to|could not be completed|has been declined|was declined|transaction (?:failed|unsuccessful)|insufficient (?:balance|funds|limit))'
 where user_id is null
   and label = 'Declined or failed transaction';

-- Narrow the telco-promo rule: keep only promo-specific wording. The GB
-- branch matched paid bundles ("Rs 300 deducted. Enjoy 5GB internet"), and
-- 'offer valid'/'subscribe now' were already owned by the older promo rule.
-- The added branches catch bank marketing that names an amount without any
-- money moving — "Har card purchase per Rs 50 cashback. Min purchase Rs 500"
-- was parsing as a real Rs 50 expense. Credited cashback is untouched: those
-- messages say "credited", which none of these branches match.
update public.parser_templates
   set match_pattern = '(?:free bonus|abhi recharge|sirf ap k|muft\b|tum hi to ho|dhamaka offer|(?:har|per|every)\s+card\s+purchase|min(?:imum)?\s+purchase\s+(?:PKR|Rs)|cashback\s+offer)'
 where user_id is null
   and label = 'Telco promotional offer';
