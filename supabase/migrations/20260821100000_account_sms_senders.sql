-- ============================================================================
-- 0008 · Route outgoing alerts by which bank sent them
--
-- An incoming alert names the user's account ("in your UBL A/C *5333"), so it
-- routes itself. An OUTGOING one usually does not: "Rs 5,000 sent to AHMED,
-- A/C: 1252..." names only the recipient. Booking it against that number would
-- post the debit to the wrong account -- or, when the recipient is the user's
-- own second account, to the very account the money arrived in.
--
-- The only remaining signal is which bank sent the SMS. This records that
-- mapping, so answering "which account is this?" once in the inbox fixes every
-- future message from that sender.
-- ============================================================================

alter table public.accounts
  add column sms_senders text[] not null default '{}';

-- Sender ids are matched case-insensitively against this list, so store them
-- uppercased and look up the same way.
create index accounts_sms_senders_idx
  on public.accounts using gin (sms_senders);

comment on column public.accounts.sms_senders is
  'SMS sender ids that belong to this account (uppercased), e.g. {MEEZAN,MBL}. '
  'Used to resolve outgoing transfer alerts, which name only the recipient.';
