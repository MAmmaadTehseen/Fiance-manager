-- ============================================================================
-- 0011 · Track both legs of an internal transfer
--
-- An internal transfer produces two SMS — the debit from the sending bank and
-- the credit from the receiving one. The transfer row stored only the message
-- that created it, so the sibling matcher had no way to know whether a
-- candidate transfer had already absorbed its opposite leg. Consequence: two
-- genuinely distinct transfers of the same amount between the same accounts
-- within ten minutes (splitting a payment under a per-transaction limit is
-- exactly when this happens) merged into one row, and the second movement
-- vanished from both balances.
--
-- With a second slot, the matcher links a message only into an empty slot,
-- and a third equal-amount message falls through and creates its own row.
-- ============================================================================

alter table public.transactions
  add column sms_message_id_2 uuid;

alter table public.transactions
  add constraint transactions_sms_message_id_2_fkey
  foreign key (sms_message_id_2, user_id)
  references public.sms_messages (id, user_id) on delete set null;

comment on column public.transactions.sms_message_id_2 is
  'The second SMS announcing the same movement — the opposite leg of an '
  'internal transfer. Filled by the pipeline''s sibling matcher.';
