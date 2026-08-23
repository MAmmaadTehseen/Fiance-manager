-- Broaden the email templates against more real formats, and add Meezan.
--
-- Two more layouts turned up in real mail:
--
--   Faysal "Inter Bank Funds Transfer" — same table, different labels:
--     "Amount Transferred: PKR 20,000.00/-", "Receiver Account No: 3430****7432"
--   Meezan — free text, not a table:
--     "PKR 6.00 received to your account xxx0508 ... Beneficiary Account: ... PK94..."
--
-- So the money-in / money-out field patterns gain label variants, and Meezan
-- gets its own template keyed on its distinctive "received to your account".

-- Money in — accept "Amount Transferred" and "Account No" spellings ---------
update public.parser_templates
   set field_patterns = $json${
     "amount": [
       "(?:Transaction Amount|Amount Transferred|Amount)[:\\s]*(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)"
     ],
     "last4": [
       "Receiver Account(?:\\s*(?:Number|No\\.?))?[:\\s]*([A-Z0-9*]{5,})"
     ],
     "counterparty_last4": [
       "Sender Account(?:\\s*(?:Number|No\\.?))?[:\\s]*([A-Z0-9*]{5,})"
     ],
     "merchant": [
       "Sender Name[:\\s]*([A-Za-z][^\\n:]{1,45})"
     ],
     "reference": [
       "Transaction Reference[:\\s]*([A-Za-z0-9]{5,})"
     ],
     "datetime": [
       "Date and Time[:\\s]*(\\d{1,2}-[A-Za-z]{3}-\\d{2,4}\\s+\\d{1,2}:\\d{2}[^\\n]*?(?:AM|PM)?)",
       "Transaction Date[:\\s]*(\\d{1,2}-[A-Za-z]{3}-\\d{2,4})"
     ]
   }$json$::jsonb
 where user_id is null and bank_key = 'email' and label = 'Email — money in';

-- Money out — same label variants, receiver/sender swapped ------------------
update public.parser_templates
   set field_patterns = $json${
     "amount": [
       "(?:Transaction Amount|Amount Transferred|Amount)[:\\s]*(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)"
     ],
     "last4": [
       "Sender Account(?:\\s*(?:Number|No\\.?))?[:\\s]*([A-Z0-9*]{5,})"
     ],
     "counterparty_last4": [
       "Receiver Account(?:\\s*(?:Number|No\\.?))?[:\\s]*([A-Z0-9*]{5,})"
     ],
     "merchant": [
       "Receiver Name[:\\s]*([A-Za-z][^\\n:]{1,45})"
     ],
     "reference": [
       "Transaction Reference[:\\s]*([A-Za-z0-9]{5,})"
     ],
     "datetime": [
       "Date and Time[:\\s]*(\\d{1,2}-[A-Za-z]{3}-\\d{2,4}\\s+\\d{1,2}:\\d{2}[^\\n]*?(?:AM|PM)?)",
       "Transaction Date[:\\s]*(\\d{1,2}-[A-Za-z]{3}-\\d{2,4})"
     ]
   }$json$::jsonb
 where user_id is null and bank_key = 'email' and label = 'Email — money out';

-- Meezan free-text credit --------------------------------------------------
insert into public.parser_templates
  (user_id, bank_key, label, country, sender_pattern, match_pattern,
   field_patterns, kind, priority, sample)
values
  (null, 'email', 'Email — Meezan received', 'PK',
   '@',
   'received to your account',
   $json${
     "amount": [
       "(?:PKR|Rs)\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s*received"
     ],
     "last4": [
       "received to your account[:\\s]*x*(\\d{3,})"
     ],
     "counterparty_last4": [
       "Beneficiary Account[^\\n]*?([A-Z]{2}\\d{2}[A-Z0-9]{4,})"
     ],
     "merchant": [
       "Beneficiary Account[:\\s]*([^\\n]{1,30}?)\\s*(?:AC#|A\\/C|RAAST|$)"
     ],
     "reference": [
       "RAAST\\s*PYMT\\s*([A-Z0-9]{5,})"
     ],
     "datetime": [
       "Transaction Date[:\\s]*(\\d{1,2}-[A-Za-z]{3}-\\d{2,4})"
     ]
   }$json$::jsonb,
   'credit', 25,
   'PKR 6.00 received to your account xxx0508 with the following details: Beneficiary Account : M.IMAD AC# RAAST PYMT PK94FAYS34307 Transaction Date : 23-Aug-2026 Transaction Time : 23:11');
