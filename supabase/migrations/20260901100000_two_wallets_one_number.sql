-- ============================================================================
-- 0027 · Two wallets on one phone number
--
-- A Pakistani wallet's "account number" is a phone number, so JazzCash and
-- SadaPay opened on the same SIM both end 9904. Two things assumed that could
-- never happen:
--
-- 1. `accounts_user_last4_uniq` forbade a second account ending 9904 outright,
--    so the pair could not both be recorded. The index exists to stop
--    duplicates of the SAME account, which is still worth having — so the bank
--    joins the key rather than the rule being dropped. Two accounts may share
--    a number only if they are at different institutions, and an account with
--    no institution named still cannot be duplicated.
--
-- 2. Account resolution matched on four digits alone and took whatever came
--    back. A Faysal transfer to SadaPay was therefore booked against JazzCash:
--    real money against the wrong wallet, corrupting two balances at once and
--    saying nothing.
--
-- The message always carried the answer — "Receiver Bank:: SadaPay" — and no
-- template captured it. These patterns do, for both sides of the movement:
-- `counterparty_bank` names the far side, `bank` our own. The pipeline uses
-- them only to break a tie; where four digits are unique, nothing changes.
--
-- Where the bank does NOT settle it, the pipeline now resolves nothing and the
-- message goes to the Inbox to be asked about, rather than guessing. An even
-- chance of being wrong is worse than a question, because the wrong answer
-- here is invisible.
-- ============================================================================

-- 1 · The bank is part of what makes an account distinct --------------------

drop index if exists accounts_user_last4_uniq;

create unique index accounts_user_last4_uniq
  on public.accounts (user_id, last4, coalesce(lower(btrim(institution)), ''))
  where last4 is not null and archived_at is null;

-- 2 · Capture the bank beside each account number ---------------------------

update public.parser_templates
   set field_patterns = field_patterns
     || jsonb_build_object(
          'bank', jsonb_build_array(
            'Sender Bank[:\s]*([A-Za-z][A-Za-z0-9 .&''-]{1,40}?)\s*(?::|$|\n)'
          ),
          'counterparty_bank', jsonb_build_array(
            'Receiver Bank[:\s]*([A-Za-z][A-Za-z0-9 .&''-]{1,40}?)\s*(?::|$|\n)'
          )
        )
 where user_id is null
   and label = 'Email — money out';

-- On an incoming message the roles swap: the sender is the far side, and the
-- receiver is us.
update public.parser_templates
   set field_patterns = field_patterns
     || jsonb_build_object(
          'bank', jsonb_build_array(
            'Receiver Bank[:\s]*([A-Za-z][A-Za-z0-9 .&''-]{1,40}?)\s*(?::|$|\n)'
          ),
          'counterparty_bank', jsonb_build_array(
            'Sender Bank[:\s]*([A-Za-z][A-Za-z0-9 .&''-]{1,40}?)\s*(?::|$|\n)'
          )
        )
 where user_id is null
   and label = 'Email — money in';
