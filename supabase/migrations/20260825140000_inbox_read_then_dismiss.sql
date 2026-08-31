-- ============================================================================
-- 0026 · An Inbox item stays until you dismiss it
--
-- Answering "which account is 0508?" made the message vanish. The answer is
-- the moment you most want to read the thing — you have just been told a
-- payment exists and given no chance to see what it was — and the only way
-- back to it was the capture feed.
--
-- Two columns, each meaning one thing:
--
-- `resolved_at` marks a message that WAS waiting on you and no longer is. It
-- is what keeps the item on screen after it has been answered: the Inbox
-- lists anything unresolved plus anything resolved-but-not-yet-dismissed.
-- Without it the Inbox could not tell a message it had just resolved from the
-- thousands of ordinary parsed messages it must never show.
--
-- `dismissed_at` is the user saying "I have read this, take it away".
--
-- Dismissing used to overwrite `parse_status` with 'ignored', which threw away
-- what the parser had actually decided — a message dismissed after being
-- booked became indistinguishable from spam the parser had rejected, and the
-- capture feed, whose whole job is showing what the templates did, was being
-- quietly falsified by a UI action. Dismissal is now recorded beside the
-- verdict instead of on top of it.
-- ============================================================================

alter table public.sms_messages
  add column resolved_at  timestamptz,
  add column dismissed_at timestamptz;

comment on column public.sms_messages.resolved_at is
  'Set when a message that was waiting on the user stops waiting, so the Inbox can keep showing it until dismissed.';
comment on column public.sms_messages.dismissed_at is
  'Set when the user clears a message from the Inbox. Never changes parse_status: the verdict is what the parser decided, not what the user filed.';

-- The Inbox reads exactly this shape: not dismissed, and either still waiting
-- or recently resolved.
create index sms_messages_inbox_idx
  on public.sms_messages (user_id, received_at desc)
  where dismissed_at is null;
