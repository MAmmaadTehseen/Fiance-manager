-- ============================================================================
-- 0007 · Templates rewritten against real Pakistani bank SMS
--
-- The shipped templates matched zero of the first seven real messages. They
-- assumed the verb came before the amount ("debited with PKR 500"), but every
-- Pakistani IBFT/RAAST alert puts the amount first:
--
--   Rs 1.00 sent to MUHAMMAD ... A/C: 1252... on 21/08/2026 at 00:39:08.
--            Fee: Rs 1.55, TID:721344773916 via IBFT
--   PKR 1 received from MUHAMMAD ... in your UBL A/C *5333 on 21-AUG-2026
--            00:39 via IBFT. Tx ID 7014061940. For info: 111825888.
--   PKR 1.00 received from ... MBL A/C *0508 via RAAST in FBL A/C *7432
--            on 21-Aug-26 at 12:46 AM Ref # 270046018669
--   Rs 1.00 received in your JazzCash Mobile Account:03046249904 via Raast.
--
-- Three things these forced:
--
-- 1. Amount must be read on either side of the verb.
-- 2. "Fee: Rs 1.55" sits in the same message as the amount, so a naive
--    first-number rule books the fee as the transaction.
-- 3. A transfer names BOTH accounts. The user's is the one after "in", so
--    last4 needs an ordered list of patterns, specific before general.
-- ============================================================================

-- Retire the built-ins that encoded the wrong assumption. User templates and
-- the card-purchase formats (which really do put the verb first) are untouched.
update public.parser_templates
   set enabled = false
 where user_id is null
   and bank_key = 'generic'
   and label in ('Any bank — money out', 'Any bank — money in');

insert into public.parser_templates
  (user_id, bank_key, label, country, sender_pattern, match_pattern,
   field_patterns, kind, priority, sample)
values
  -- Outgoing IBFT / RAAST -----------------------------------------------
  (null, 'generic', 'Pakistan — transfer sent', 'PK',
   '.*',
   '(?:sent\s+to|transferred\s+to|paid\s+to|\bsent\b)',
   $json${
     "amount": [
       "(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s*(?:has\\s+been\\s+)?(?:sent|transferred|paid|debited)",
       "(?:sent|transferred|paid|debited)[^\\d]{0,25}?(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)"
     ],
     "merchant": [
       "(?:sent|transferred|paid)\\s+to\\s+([A-Za-z][A-Za-z0-9 .'*-]{2,45}?)\\s*(?:,|\\.|;|\\bA\\/?C\\b|\\bon\\b|\\bvia\\b|$)"
     ],
     "last4": [
       "\\bfrom\\s+(?:your\\s+)?(?:[A-Za-z]+\\s+){0,3}?A\\/?C(?:count)?\\s*[:#*\\s]*(\\d{3,})"
     ],
     "counterparty_last4": [
       "\\bA\\/?C(?:count)?\\s*[:#*\\s]*(\\d{3,})"
     ],
     "fee": [
       "Fee[:\\s]*(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)"
     ],
     "reference": [
       "(?:TID|Tx\\s*ID|TX\\s*ID|Trx\\s*ID)\\s*[:#]?\\s*([A-Za-z0-9]{5,25})",
       "Ref\\s*#?\\s*:?\\s*([A-Za-z0-9]{5,25})"
     ],
     "datetime": [
       "(\\d{1,2}[-/][A-Za-z]{3}[-/]\\d{2,4}(?:\\s+(?:at\\s+)?\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?)?)",
       "(\\d{1,2}[-/]\\d{1,2}[-/]\\d{2,4}(?:\\s+(?:at\\s+)?\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?)?)"
     ]
   }$json$::jsonb,
   'purchase', 200,
   'Rs 1.00 sent to MUHAMMAD AMMAAD TEHSEEN, A/C:  12520110590508 on 21/08/2026 at 00:39:08. Fee: Rs 1.55,  TID:721344773916 via IBFT'),

  -- Incoming IBFT / RAAST -----------------------------------------------
  (null, 'generic', 'Pakistan — money received', 'PK',
   '.*',
   '\breceived\b',
   $json${
     "amount": [
       "(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s*(?:has\\s+been\\s+)?(?:received|credited)",
       "(?:received|credited)[^\\d]{0,25}?(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)"
     ],
     "merchant": [
       "received\\s+from\\s+([A-Za-z][A-Za-z0-9 .'*-]{2,45}?)\\s*(?:,|\\.|;|\\bin\\s|\\bvia\\b|\\bA\\/?C\\b|\\bon\\b|$)"
     ],
     "last4": [
       "\\bin\\s+(?:your\\s+)?(?:[A-Za-z]+\\s+){0,3}?(?:Mobile\\s+)?A(?:\\/?C|ccount)\\s*[:#*\\s]*(\\d{3,})",
       "\\bA\\/?C(?:count)?\\s*[:#*\\s]*(\\d{3,})"
     ],
     "counterparty_last4": [
       "\\bfrom\\s+[^.]{0,60}?A\\/?C(?:count)?\\s*[:#*\\s]*(\\d{3,})\\s+via"
     ],
     "reference": [
       "(?:TID|Tx\\s*ID|TX\\s*ID|Trx\\s*ID)\\s*[:#]?\\s*([A-Za-z0-9]{5,25})",
       "Ref\\s*#?\\s*:?\\s*([A-Za-z0-9]{5,25})"
     ],
     "datetime": [
       "(\\d{1,2}[-/][A-Za-z]{3}[-/]\\d{2,4}(?:\\s+(?:at\\s+)?\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?)?)",
       "(\\d{1,2}[-/]\\d{1,2}[-/]\\d{2,4}(?:\\s+(?:at\\s+)?\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?)?)"
     ]
   }$json$::jsonb,
   'credit', 200,
   'PKR 1.00 received from MUHAMMAD AMMAAD T* MBL A/C *0508 via RAAST in FBL A/C *7432 on 21-Aug-26 at 12:46 AM Ref # 270046018669'),

  -- Card / POS spend, amount first --------------------------------------
  (null, 'generic', 'Pakistan — card spend', 'PK',
   '.*',
   '(?:spent|purchase|used\s+(?:for|at)|debited|withdraw)',
   $json${
     "amount": [
       "(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s*(?:has\\s+been\\s+)?(?:spent|debited|withdrawn|used)",
       "(?:spent|debited(?:\\s+with)?|withdrawn|used\\s+for|purchase\\s+of)[^\\d]{0,25}?(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)"
     ],
     "merchant": [
       "\\bat\\s+([A-Za-z][A-Za-z0-9 &.'*-]{2,45}?)\\s*(?:,|\\.|;|\\bon\\b|\\bvia\\b|$)"
     ],
     "last4": [
       "(?:ending(?:\\s+(?:with|in))?|card\\s*(?:no\\.?)?)\\s*[*x#]*\\s*(\\d{3,})",
       "\\bA\\/?C(?:count)?\\s*[:#*\\s]*(\\d{3,})"
     ],
     "balance": [
       "(?:(?:avl|avail(?:able)?|closing|new|remaining)\\.?\\s*bal(?:ance)?|balance)\\.?\\s*(?:is)?[:\\s]*(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)"
     ],
     "datetime": [
       "(\\d{1,2}[-/][A-Za-z]{3}[-/]\\d{2,4}(?:\\s+(?:at\\s+)?\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?)?)",
       "(\\d{1,2}[-/]\\d{1,2}[-/]\\d{2,4}(?:\\s+(?:at\\s+)?\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?)?)"
     ]
   }$json$::jsonb,
   'purchase', 210,
   'PKR 2,500.00 spent at CAFE ZOUK using card ending 4821 on 21-Aug-26. Available balance PKR 45,678.00');
