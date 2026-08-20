-- ============================================================================
-- 0005 · Service-role privileges for the ingest pipeline
--
-- Edge Functions connect as `service_role`, which this Supabase version grants
-- no DML on tables created by `postgres` — the ingest function could not even
-- read its own auth table.
--
-- service_role carries BYPASSRLS, so these grants are the *only* thing
-- bounding what a compromised or buggy function can touch. They are therefore
-- deliberately narrow: exactly the tables the pipeline uses, exactly the verbs
-- it needs. Nothing here grants access to `profiles`, and nothing grants
-- DELETE on `transactions` — an ingest bug must not be able to erase history.
-- ============================================================================

-- Authenticate the device and record that the token was used.
grant select, update on public.ingest_tokens to service_role;

-- Store the message, then mark how it was resolved.
grant select, insert, update on public.sms_messages to service_role;

-- Match against built-in and user templates.
grant select on public.parser_templates to service_role;

-- Route a message to the right account; read balances to compute drift.
grant select on public.accounts to service_role;
grant select on public.account_balances to service_role;
grant select on public.account_movements to service_role;

-- Remember merchants so a category only ever has to be chosen once.
grant select, insert, update on public.merchants to service_role;

-- Categories are read to validate a learned mapping, never written.
grant select on public.categories to service_role;

-- Write the transaction, and link one that already existed. No DELETE.
grant select, insert, update on public.transactions to service_role;

-- The free audit: what the bank says the balance is.
grant select, insert on public.balance_assertions to service_role;

-- Needed by the push sender (Phase 2 notifications).
grant select, delete on public.push_subscriptions to service_role;
