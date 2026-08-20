-- ============================================================================
-- 0004 · Built-in parser templates (Pakistan)
--
-- IMPORTANT — these are written against the *shapes* Pakistani bank SMS take,
-- not against verified captures from every bank. Wording varies by bank, by
-- product, and over time. Treat them as a strong starting point:
--
--   * anything that fails to match lands in the inbox as 'unmatched'
--   * the rule builder turns a real message into a working template in the UI
--   * a user template (user_id = auth.uid()) always beats a built-in
--
-- So a wrong pattern here is a nuisance, never data loss: the message is still
-- stored verbatim and can be re-processed once the template is corrected.
--
-- Regex escaping: text columns are SQL literals (single \ ), jsonb values are
-- JSON strings (double \\ ). Dollar-quoting avoids apostrophe doubling.
-- ============================================================================

-- Ignore rules run first. An OTP that became a transaction would be far worse
-- than one that failed to parse.
insert into public.parser_templates
  (user_id, bank_key, label, country, sender_pattern, match_pattern, kind, priority, sample)
values
  (null, 'generic', 'OTP and verification codes', 'PK',
   '.*',
   '\b(?:OTP|One[- ]Time[- ]Password|verification code|security code|activation code)\b',
   'ignore', 10,
   'Your OTP for login is 123456. Do not share it with anyone.'),

  (null, 'generic', 'Promotional and informational', 'PK',
   '.*',
   '(?:congratulations|offer|discount|\bwin\b|subscribe|unsubscribe|dear valued customer, we)',
   'ignore', 20,
   'Congratulations! Get 20% discount on your next purchase.'),

  (null, 'generic', 'Balance enquiry reply', 'PK',
   '.*',
   '^(?:your\s+)?(?:a\/c\s+)?(?:available\s+)?balance\s+(?:is|as of)',
   'ignore', 30,
   'Your available balance is PKR 45,678.00 as of 12-Aug-25.');

-- --------------------------------------------------------------- banks ----

insert into public.parser_templates
  (user_id, bank_key, label, country, sender_pattern, match_pattern,
   field_patterns, kind, priority, sample)
values
  -- HBL ---------------------------------------------------------------
  (null, 'hbl', 'HBL card purchase', 'PK',
   '^(?:HBL|HBLBank|HBL-?Bank)$',
   '(?:used\s+for|purchase|spent|debited)',
   $json${
     "amount":   "(?:used\\s+for|purchase\\s+of|spent|debited(?:\\s+with)?)[^\\d]{0,30}?(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "last4":    "(?:ending(?:\\s+(?:with|in))?|card\\s+no\\.?)\\s*[*x#]*\\s*(\\d{3,6})",
     "merchant": "\\bat\\s+([A-Za-z][A-Za-z0-9 &._-]{1,40}?)(?:\\s+on\\b|\\s*[.,;]|\\s*$)",
     "balance":  "(?:(?:avl|avail(?:able)?|closing|new)\\.?\\s*bal(?:ance)?|balance)\\.?\\s*(?:is)?[:\\s]*(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "datetime": "(\\d{1,2}[-/\\s](?:[A-Za-z]{3}|\\d{1,2})[-/\\s]\\d{2,4}(?:[\\s,]+\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?)?)"
   }$json$::jsonb,
   'purchase', 100,
   'Your HBL Debit Card ending 4821 was used for PKR 2,500.00 at CAFE ZOUK on 12-Aug-25. Available balance: PKR 45,678.00'),

  (null, 'hbl', 'HBL ATM withdrawal', 'PK',
   '^(?:HBL|HBLBank|HBL-?Bank)$',
   '(?:cash\s+with?drawal|withdrawn|ATM\s+with?drawal)',
   $json${
     "amount":   "(?:with?drawal\\s+of|withdrawn)[^\\d]{0,30}?(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "last4":    "(?:ending(?:\\s+(?:with|in))?|card\\s+no\\.?)\\s*[*x#]*\\s*(\\d{3,6})",
     "balance":  "(?:(?:avl|avail(?:able)?|closing|new)\\.?\\s*bal(?:ance)?|balance)\\.?\\s*(?:is)?[:\\s]*(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "datetime": "(\\d{1,2}[-/\\s](?:[A-Za-z]{3}|\\d{1,2})[-/\\s]\\d{2,4}(?:[\\s,]+\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?)?)"
   }$json$::jsonb,
   'atm', 90,
   'Cash withdrawal of PKR 10,000.00 from ATM using card ending 4821 on 12-Aug-25. Available balance PKR 35,000.00'),

  -- Meezan ------------------------------------------------------------
  (null, 'meezan', 'Meezan account debit', 'PK',
   '(?:Meezan|MeezanBnk)',
   '(?:has\s+been\s+debited|debited\s+with|debit\s+of)',
   $json${
     "amount":   "debited(?:\\s+with)?[^\\d]{0,30}?(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "last4":    "(?:a\\/c|acct?|account|card)\\s*[*x#]*\\s*(\\d{3,6})",
     "merchant": "\\bat\\s+([A-Za-z][A-Za-z0-9 &._-]{1,40}?)(?:\\s+on\\b|\\s*[.,;]|\\s*$)",
     "balance":  "(?:(?:avl|avail(?:able)?|closing|new)\\.?\\s*bal(?:ance)?|balance)\\.?\\s*(?:is)?[:\\s]*(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "datetime": "(\\d{1,2}[-/\\s](?:[A-Za-z]{3}|\\d{1,2})[-/\\s]\\d{2,4}(?:[\\s,]+\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?)?)"
   }$json$::jsonb,
   'purchase', 100,
   'Dear Customer, your a/c ****1234 has been debited with PKR 2,500.00 on 12/08/2025 at KFC. Avl Bal: PKR 45,678.00'),

  (null, 'meezan', 'Meezan account credit', 'PK',
   '(?:Meezan|MeezanBnk)',
   '(?:has\s+been\s+credited|credited\s+with|credit\s+of)',
   $json${
     "amount":   "credited(?:\\s+with)?[^\\d]{0,30}?(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "last4":    "(?:a\\/c|acct?|account)\\s*[*x#]*\\s*(\\d{3,6})",
     "merchant": "\\bfrom\\s+([A-Za-z0-9][A-Za-z0-9 &._-]{2,40}?)(?:\\s+on\\b|\\s*[.,;]|\\s*$)",
     "balance":  "(?:(?:avl|avail(?:able)?|closing|new)\\.?\\s*bal(?:ance)?|balance)\\.?\\s*(?:is)?[:\\s]*(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "datetime": "(\\d{1,2}[-/\\s](?:[A-Za-z]{3}|\\d{1,2})[-/\\s]\\d{2,4}(?:[\\s,]+\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?)?)"
   }$json$::jsonb,
   'credit', 100,
   'Dear Customer, your a/c ****1234 has been credited with PKR 50,000.00 on 01/08/2025. Avl Bal: PKR 95,678.00'),

  -- UBL / Alfalah / MCB share the card-transaction shape ---------------
  (null, 'ubl', 'UBL card transaction', 'PK',
   '(?:^UBL|UBLBank|UBL-?Digital)',
   '(?:txn|transaction|debited|purchase|spent)',
   $json${
     "amount":   "(?:txn|transaction|debited|purchase|spent)[^\\d]{0,30}?(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "last4":    "(?:ending(?:\\s+(?:with|in))?|card\\s*(?:no\\.?)?)\\s*[*x#]*\\s*(\\d{3,6})",
     "merchant": "\\bat\\s+([A-Za-z][A-Za-z0-9 &._-]{1,40}?)(?:\\s+on\\b|\\s*[.,;]|\\s*$)",
     "balance":  "(?:(?:avl|avail(?:able)?|closing|new)\\.?\\s*bal(?:ance)?|balance)\\.?\\s*(?:is)?[:\\s]*(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "datetime": "(\\d{1,2}[-/\\s](?:[A-Za-z]{3}|\\d{1,2})[-/\\s]\\d{2,4}(?:[\\s,]+\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?)?)"
   }$json$::jsonb,
   'purchase', 100,
   'Txn of PKR 1,500.00 at DAKA on card ending 4821. Avail Bal PKR 20,000.00'),

  (null, 'alfalah', 'Bank Alfalah card transaction', 'PK',
   '(?:Alfalah|BAFL)',
   '(?:debited|purchase|spent|used\s+for)',
   $json${
     "amount":   "(?:debited(?:\\s+with)?|purchase\\s+of|spent|used\\s+for)[^\\d]{0,30}?(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "last4":    "(?:ending(?:\\s+(?:with|in))?|card\\s*(?:no\\.?)?|a\\/c)\\s*[*x#]*\\s*(\\d{3,6})",
     "merchant": "\\bat\\s+([A-Za-z][A-Za-z0-9 &._-]{1,40}?)(?:\\s+on\\b|\\s*[.,;]|\\s*$)",
     "balance":  "(?:(?:avl|avail(?:able)?|closing|new)\\.?\\s*bal(?:ance)?|balance)\\.?\\s*(?:is)?[:\\s]*(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "datetime": "(\\d{1,2}[-/\\s](?:[A-Za-z]{3}|\\d{1,2})[-/\\s]\\d{2,4}(?:[\\s,]+\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?)?)"
   }$json$::jsonb,
   'purchase', 100,
   'Your Alfalah card ending 4821 was used for PKR 3,200.00 at METRO on 12-Aug-25. Available balance PKR 18,000.00'),

  (null, 'mcb', 'MCB card transaction', 'PK',
   '(?:^MCB|MCBBank|MCB-?Bank)',
   '(?:debited|purchase|spent|withdrawn)',
   $json${
     "amount":   "(?:debited(?:\\s+with)?|purchase\\s+of|spent)[^\\d]{0,30}?(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "last4":    "(?:ending(?:\\s+(?:with|in))?|card\\s*(?:no\\.?)?|a\\/c)\\s*[*x#]*\\s*(\\d{3,6})",
     "merchant": "\\bat\\s+([A-Za-z][A-Za-z0-9 &._-]{1,40}?)(?:\\s+on\\b|\\s*[.,;]|\\s*$)",
     "balance":  "(?:(?:avl|avail(?:able)?|closing|new)\\.?\\s*bal(?:ance)?|balance)\\.?\\s*(?:is)?[:\\s]*(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "datetime": "(\\d{1,2}[-/\\s](?:[A-Za-z]{3}|\\d{1,2})[-/\\s]\\d{2,4}(?:[\\s,]+\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?)?)"
   }$json$::jsonb,
   'purchase', 100,
   'MCB: Your account 1234 debited PKR 900.00 at PSO PUMP on 12-Aug-25. Avail Bal PKR 12,000.00'),

  -- Wallets -----------------------------------------------------------
  (null, 'jazzcash', 'JazzCash money out', 'PK',
   '(?:JazzCash|Jazz-?Cash|JAZZCASH)',
   '(?:you\s+have\s+sent|sent\s+Rs|payment\s+of|paid)',
   $json${
     "amount":   "(?:sent|paid|payment\\s+of|transferred)[^\\d]{0,20}?(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "merchant": "\\bto\\s+([A-Za-z0-9][A-Za-z0-9 &._-]{2,40}?)(?:\\s*[.,;]|\\s*$)",
     "balance":  "(?:(?:avl|avail(?:able)?|new|remaining)\\.?\\s*bal(?:ance)?|balance)\\.?\\s*(?:is)?[:\\s]*(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "reference":"(?:TID|Trx\\s*ID|Txn\\s*ID)\\s*(?:No\\.?|#|:)?\\s*([A-Za-z0-9]{4,20})"
   }$json$::jsonb,
   'purchase', 100,
   'You have sent Rs 1,000.00 to 03001234567. Balance Rs 5,000.00. TID 123456789'),

  (null, 'jazzcash', 'JazzCash money in', 'PK',
   '(?:JazzCash|Jazz-?Cash|JAZZCASH)',
   '(?:you\s+have\s+received|received\s+Rs)',
   $json${
     "amount":   "received[^\\d]{0,20}?(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "merchant": "\\bfrom\\s+([A-Za-z0-9][A-Za-z0-9 &._-]{2,40}?)(?:\\s*[.,;]|\\s*$)",
     "balance":  "(?:(?:avl|avail(?:able)?|new|remaining)\\.?\\s*bal(?:ance)?|balance)\\.?\\s*(?:is)?[:\\s]*(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "reference":"(?:TID|Trx\\s*ID|Txn\\s*ID)\\s*(?:No\\.?|#|:)?\\s*([A-Za-z0-9]{4,20})"
   }$json$::jsonb,
   'credit', 100,
   'You have received Rs 5,000.00 from 03001234567. Your balance is Rs 10,000.00. TID: 987654321'),

  (null, 'easypaisa', 'Easypaisa money out', 'PK',
   '(?:Easypaisa|EasyPaisa|EP-?Mobile)',
   '(?:you\s+have\s+sent|sent\s+Rs|payment\s+of|paid)',
   $json${
     "amount":   "(?:sent|paid|payment\\s+of|transferred)[^\\d]{0,20}?(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "merchant": "\\bto\\s+([A-Za-z0-9][A-Za-z0-9 &._-]{2,40}?)(?:\\s*[.,;]|\\s*$)",
     "balance":  "(?:(?:avl|avail(?:able)?|new|remaining)\\.?\\s*bal(?:ance)?|balance)\\.?\\s*(?:is)?[:\\s]*(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "reference":"(?:TID|Trx\\s*ID|Txn\\s*ID)\\s*(?:No\\.?|#|:)?\\s*([A-Za-z0-9]{4,20})"
   }$json$::jsonb,
   'purchase', 100,
   'You have sent Rs 2,000.00 to Ali Khan. Your balance is Rs 8,000.00. TID 555444333'),

  (null, 'easypaisa', 'Easypaisa money in', 'PK',
   '(?:Easypaisa|EasyPaisa|EP-?Mobile)',
   '(?:you\s+have\s+received|received\s+Rs)',
   $json${
     "amount":   "received[^\\d]{0,20}?(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "merchant": "\\bfrom\\s+([A-Za-z0-9][A-Za-z0-9 &._-]{2,40}?)(?:\\s*[.,;]|\\s*$)",
     "balance":  "(?:(?:avl|avail(?:able)?|new|remaining)\\.?\\s*bal(?:ance)?|balance)\\.?\\s*(?:is)?[:\\s]*(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "reference":"(?:TID|Trx\\s*ID|Txn\\s*ID)\\s*(?:No\\.?|#|:)?\\s*([A-Za-z0-9]{4,20})"
   }$json$::jsonb,
   'credit', 100,
   'You have received Rs 15,000.00 from 03211234567. Your balance is Rs 23,000.00. TID: 111222333'),

  (null, 'sadapay', 'SadaPay spend', 'PK',
   '(?:SadaPay|SADAPAY)',
   '(?:you\s+spent|spent|paid)',
   $json${
     "amount":   "(?:spent|paid)[^\\d]{0,20}?(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "merchant": "\\b(?:at|to)\\s+([A-Za-z0-9][A-Za-z0-9 &._-]{2,40}?)(?:\\s*[.,;]|\\s*$)",
     "balance":  "(?:(?:avl|avail(?:able)?|new|remaining)\\.?\\s*bal(?:ance)?|balance)\\.?\\s*(?:is)?[:\\s]*(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)"
   }$json$::jsonb,
   'purchase', 100,
   'You spent PKR 1,200.00 at Foodpanda. Balance: PKR 8,800.00'),

  (null, 'nayapay', 'NayaPay transfer out', 'PK',
   '(?:NayaPay|NAYAPAY)',
   '(?:sent|paid|spent)',
   $json${
     "amount":   "(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s*(?:sent|paid|spent)|(?:sent|paid|spent)[^\\d]{0,20}?(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "merchant": "\\b(?:to|at)\\s+([A-Za-z0-9][A-Za-z0-9 &._-]{2,40}?)(?:\\s*[.,;]|\\s*$)",
     "balance":  "(?:(?:avl|avail(?:able)?|new|remaining)\\.?\\s*bal(?:ance)?|balance)\\.?\\s*(?:is)?[:\\s]*(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)"
   }$json$::jsonb,
   'purchase', 100,
   'PKR 500.00 sent to Ali Khan. NayaPay balance: PKR 3,500.00'),

  -- Generic fallbacks. High priority number = last resort, but far better
  -- than dropping a message from a bank we have not templated yet.
  (null, 'generic', 'Any bank — money out', 'PK',
   '.*',
   '(?:debited|withdrawn|spent|purchase|paid|sent|transferred)',
   $json${
     "amount":   "(?:debited(?:\\s+with)?|withdrawn|spent|purchase\\s+of|paid|sent|transferred)[^\\d]{0,30}?(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "last4":    "(?:ending(?:\\s+(?:with|in))?|card\\s*(?:no\\.?)?|a\\/c|acct?|account)\\s*[*x#]*\\s*(\\d{3,6})",
     "merchant": "\\b(?:at|to)\\s+([A-Za-z0-9][A-Za-z0-9 &._-]{2,40}?)(?:\\s+on\\b|\\s*[.,;]|\\s*$)",
     "balance":  "(?:(?:avl|avail(?:able)?|closing|new|remaining)\\.?\\s*bal(?:ance)?|balance)\\.?\\s*(?:is)?[:\\s]*(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "datetime": "(\\d{1,2}[-/\\s](?:[A-Za-z]{3}|\\d{1,2})[-/\\s]\\d{2,4}(?:[\\s,]+\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?)?)"
   }$json$::jsonb,
   'purchase', 900,
   'Your account was debited PKR 750.00 at SHOP on 12-Aug-25.'),

  (null, 'generic', 'Any bank — money in', 'PK',
   '.*',
   '(?:credited|received)',
   $json${
     "amount":   "(?:credited(?:\\s+with)?|received)[^\\d]{0,30}?(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "last4":    "(?:ending(?:\\s+(?:with|in))?|card\\s*(?:no\\.?)?|a\\/c|acct?|account)\\s*[*x#]*\\s*(\\d{3,6})",
     "merchant": "\\bfrom\\s+([A-Za-z0-9][A-Za-z0-9 &._-]{2,40}?)(?:\\s+on\\b|\\s*[.,;]|\\s*$)",
     "balance":  "(?:(?:avl|avail(?:able)?|closing|new|remaining)\\.?\\s*bal(?:ance)?|balance)\\.?\\s*(?:is)?[:\\s]*(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "datetime": "(\\d{1,2}[-/\\s](?:[A-Za-z]{3}|\\d{1,2})[-/\\s]\\d{2,4}(?:[\\s,]+\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?)?)"
   }$json$::jsonb,
   'credit', 910,
   'Your account has been credited with PKR 20,000.00 on 12-Aug-25.'),

  (null, 'generic', 'Any bank — ATM withdrawal', 'PK',
   '.*',
   '(?:cash\s+with?drawal|atm\s+with?drawal|withdrawn\s+from\s+atm)',
   $json${
     "amount":   "(?:with?drawal\\s+of|withdrawn)[^\\d]{0,30}?(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "last4":    "(?:ending(?:\\s+(?:with|in))?|card\\s*(?:no\\.?)?|a\\/c|acct?|account)\\s*[*x#]*\\s*(\\d{3,6})",
     "balance":  "(?:(?:avl|avail(?:able)?|closing|new|remaining)\\.?\\s*bal(?:ance)?|balance)\\.?\\s*(?:is)?[:\\s]*(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "datetime": "(\\d{1,2}[-/\\s](?:[A-Za-z]{3}|\\d{1,2})[-/\\s]\\d{2,4}(?:[\\s,]+\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?)?)"
   }$json$::jsonb,
   'atm', 890,
   'Cash withdrawal of PKR 5,000.00 from ATM. Available balance PKR 30,000.00'),

  (null, 'generic', 'Any bank — fees and charges', 'PK',
   '.*',
   '(?:service\s+charge|bank\s+charge|fee\s+of|withholding\s+tax|\bWHT\b)',
   $json${
     "amount":   "(?:charge[sd]?|fee|tax)[^\\d]{0,30}?(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
     "last4":    "(?:a\\/c|acct?|account)\\s*[*x#]*\\s*(\\d{3,6})",
     "balance":  "(?:(?:avl|avail(?:able)?|closing|new)\\.?\\s*bal(?:ance)?|balance)\\.?\\s*(?:is)?[:\\s]*(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)"
   }$json$::jsonb,
   'fee', 880,
   'Service charge of PKR 150.00 debited from a/c 1234. Available balance PKR 29,850.00');
