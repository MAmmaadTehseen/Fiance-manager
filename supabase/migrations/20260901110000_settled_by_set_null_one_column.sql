-- ============================================================================
-- 0028 · Deleting a payment that settled a claim must not error
--
-- `settled_by_id` follows the composite-FK convention — (settled_by_id,
-- user_id) references (id, user_id) — which is what stops one user pointing at
-- another's row. Combined with ON DELETE SET NULL that convention misfires:
-- Postgres nulls EVERY column of the foreign key, so removing the settling
-- payment tries to write `user_id = NULL` on the claim, and the `freeze_owner`
-- trigger rejects it:
--
--     ERROR: user_id is immutable
--
-- So the delete does not clear the link — it fails outright, and the error
-- surfaces wherever the delete came from. It is reachable from ordinary use:
-- delete a repayment you had linked to a claim and the app shows a trigger's
-- error message. It also aborted the whole `sms-reprocess` rebuild pass, since
-- that deletes in one batch.
--
-- Postgres 15 added a column list for SET NULL, and this database is on 17.
-- Naming `settled_by_id` alone leaves `user_id` untouched, so the claim simply
-- reopens — which is the honest outcome, because the payment that closed it no
-- longer exists.
-- ============================================================================

alter table public.transactions
  drop constraint transactions_settled_by_fkey;

alter table public.transactions
  add constraint transactions_settled_by_fkey
  foreign key (settled_by_id, user_id)
  references public.transactions (id, user_id)
  on delete set null (settled_by_id);
