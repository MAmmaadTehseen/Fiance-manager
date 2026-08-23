-- Parser templates for bank *email* alerts.
--
-- Real Pakistani bank RAAST/IBFT emails come as a labelled table, e.g. Faysal:
--
--   Your account has been credited via RAAST payment.
--   Receiver Name: MUHAMMAD IMAD TEH*
--   Receiver Account Number: PK94FAYS******7432
--   Sender Name: MUHAMMAD AMMAAD T*
--   Sender Account Number: PK35MEZN******0508
--   Transaction Amount: PKR 1.00
--   Date and Time: 23-Aug-26 11:51 PM
--   Transaction Reference: 292351307606
--
-- These are cleaner than SMS: every field is labelled. sender_pattern is `@`
-- so these only ever match an email (an SMS shortcode has no @), and priority
-- is low so they are tried before the free-text SMS templates.

insert into public.parser_templates
  (user_id, bank_key, label, country, sender_pattern, match_pattern,
   field_patterns, kind, priority, sample)
values
  -- Money in — "your account has been credited" -------------------------
  (null, 'email', 'Email — money in', 'PK',
   '@',
   'credited',
   $json${
     "amount": [
       "Transaction Amount[:\\s]*(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)"
     ],
     "last4": [
       "Receiver Account(?:\\s*Number)?[:\\s]*([A-Z0-9*]{6,})"
     ],
     "counterparty_last4": [
       "Sender Account(?:\\s*Number)?[:\\s]*([A-Z0-9*]{6,})"
     ],
     "merchant": [
       "Sender Name[:\\s]*([A-Za-z][^\\n:]{1,40})"
     ],
     "reference": [
       "Transaction Reference[:\\s]*([A-Za-z0-9]{5,})"
     ],
     "datetime": [
       "Date and Time[:\\s]*(\\d{1,2}-[A-Za-z]{3}-\\d{2,4}\\s+\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?)"
     ]
   }$json$::jsonb,
   'credit', 30,
   'Your account has been credited via RAAST payment. Receiver Name: A Receiver Account Number: PK94FAYS******7432 Sender Name: B Sender Account Number: PK35MEZN******0508 Transaction Amount: PKR 1.00 Date and Time: 23-Aug-26 11:51 PM Transaction Reference: 292351307606'),

  -- Money out — "your account has been debited" -------------------------
  (null, 'email', 'Email — money out', 'PK',
   '@',
   'debited',
   $json${
     "amount": [
       "Transaction Amount[:\\s]*(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)"
     ],
     "last4": [
       "Sender Account(?:\\s*Number)?[:\\s]*([A-Z0-9*]{6,})"
     ],
     "counterparty_last4": [
       "Receiver Account(?:\\s*Number)?[:\\s]*([A-Z0-9*]{6,})"
     ],
     "merchant": [
       "Receiver Name[:\\s]*([A-Za-z][^\\n:]{1,40})"
     ],
     "reference": [
       "Transaction Reference[:\\s]*([A-Za-z0-9]{5,})"
     ],
     "datetime": [
       "Date and Time[:\\s]*(\\d{1,2}-[A-Za-z]{3}-\\d{2,4}\\s+\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?)"
     ]
   }$json$::jsonb,
   'purchase', 30,
   'Your account has been debited. Receiver Name: A Receiver Account Number: PK94FAYS******7432 Sender Name: B Sender Account Number: PK35MEZN******0508 Transaction Amount: PKR 500.00 Date and Time: 23-Aug-26 03:06 PM Transaction Reference: 291506002516');
