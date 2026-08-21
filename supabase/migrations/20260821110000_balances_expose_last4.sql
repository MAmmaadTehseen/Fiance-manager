-- ============================================================================
-- 0009 · Expose the card digits on the balances view
--
-- The accounts screen shows which card feeds each account ("Bank · **4821")
-- and badges the ones SMS can route to. That meant fetching `accounts`
-- alongside `account_balances` purely to read one column, and joining the two
-- in the client.
--
-- `last4` is appended at the end so CREATE OR REPLACE accepts it — Postgres
-- allows new columns on a replaced view only after the existing ones, which
-- must keep their position and type.
-- ============================================================================

create or replace view public.account_balances
with (security_invoker = on) as
  select a.id as account_id,
         a.user_id,
         a.name,
         a.type,
         a.currency,
         a.opening_balance,
         a.is_primary,
         a.archived_at,
         a.opening_balance + coalesce(sum(m.delta)
           filter (where m.status in ('cleared', 'needs_review')), 0) as balance,
         a.opening_balance + coalesce(sum(m.delta), 0) as projected_balance,
         max(m.occurred_at) as last_activity_at,
         a.last4,
         a.institution
    from public.accounts a
    left join public.account_movements m on m.account_id = a.id
   group by a.id;

grant select on public.account_balances to authenticated;
grant select on public.account_balances to service_role;
revoke all on public.account_balances from anon;
