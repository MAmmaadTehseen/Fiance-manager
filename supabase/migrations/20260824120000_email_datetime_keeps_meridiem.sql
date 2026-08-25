-- ============================================================================
-- 0020 · Stop the email templates dropping AM/PM
--
-- The datetime pattern for both email templates read:
--
--   Date and Time[:\s]*(\d{1,2}-[A-Za-z]{3}-\d{2,4}\s+\d{1,2}:\d{2}[^\n]*?(?:AM|PM)?)
--
-- `[^\n]*?` is lazy and `(?:AM|PM)?` is optional, so the shortest match that
-- satisfies both is empty and empty: the capture stopped at "05:30" and the
-- meridiem was never seen. A real Faysal alert reading
--
--   Date and Time:: 24-AUG-2026 05:30 PM
--
-- was therefore filed at 05:30 in the morning — twelve hours early.
--
-- The damage is not only a wrong timestamp on the row. It breaks the transfer
-- sibling matcher, which pairs the two halves of an internal transfer inside a
-- ten-minute window: the debit leg landing twelve hours from the credit leg
-- can never be matched, so a transfer between two of the user's own accounts
-- is booked twice — once as a transfer and once as income — and the ledger
-- overstates what came in.
--
-- Replacing the lazy fill with `\s*` fixes it. A greedy `\s*` takes the space
-- and then the meridiem matches, while an alert that genuinely has no AM/PM
-- still parses, because the group stays optional.
-- ============================================================================

update public.parser_templates
set field_patterns = jsonb_set(
      field_patterns,
      '{datetime}',
      jsonb_build_array(
        'Date and Time[:\s]*(\d{1,2}-[A-Za-z]{3}-\d{2,4}\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)',
        'Transaction Date[:\s]*(\d{1,2}-[A-Za-z]{3}-\d{2,4})'
      )
    )
where user_id is null
  and bank_key = 'email'
  and field_patterns->>'datetime' like '%*?%';
