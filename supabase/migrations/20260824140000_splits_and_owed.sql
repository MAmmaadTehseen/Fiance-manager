-- ============================================================================
-- 0022 · Splitting a payment, and money you expect back
--
-- Two everyday shapes the ledger could not hold.
--
-- One payment is often several things. Handing over 23,000 for a flat is
-- 12,000 rent, 10,000 deposit and 1,000 in stamp duty, and filing all of it
-- under one category makes every total downstream wrong.
--
-- And you often pay for someone else. The rent goes out in full, but half is
-- a flatmate's — money that is not really an expense, and not income when it
-- comes back either. Without somewhere to record the claim it is either
-- forgotten or double-counted.
--
-- Deliberately NOT modelled as a parent row with children. A parent holding
-- the full amount alongside parts that repeat it would need every balance
-- view, every total and every export taught to skip one of them, and the
-- first place that forgot would silently double the payment. Instead the
-- original row becomes the first part and the rest are ordinary siblings, so
-- everything that already sums transactions stays correct without knowing
-- splits exist. `split_group_id` only records that they arrived together.
-- ============================================================================

alter table public.transactions
  add column split_group_id uuid,
  -- Who owes it back. Free text, because a flatmate is a person, not an
  -- account in the ledger, and forcing one into existence to note a debt is
  -- more bookkeeping than the debt is worth.
  add column owed_by text,
  add column owed_amount numeric(14, 2),
  -- The income row that repaid it, once it arrives.
  add column settled_by_id uuid;

alter table public.transactions
  add constraint transactions_owed_coherent check (
    (owed_amount is null and owed_by is null)
    or (
      owed_amount is not null
      and owed_by is not null
      and length(btrim(owed_by)) > 0
      -- You cannot be owed more than you paid, and being owed nothing is
      -- simply not being owed.
      and owed_amount > 0
      and owed_amount <= amount
    )
  );

alter table public.transactions
  add constraint transactions_settled_needs_claim check (
    settled_by_id is null or owed_amount is not null
  );

-- Composite, like every other FK here: RLS stops a user reading another's
-- rows, but only the composite key stops one being referenced. See the
-- integrity section of the core schema. Transactions never needed the
-- matching unique key before, because nothing referenced a transaction until
-- now — `id` alone is the primary key, so this only makes the pair
-- addressable, it constrains nothing new.
alter table public.transactions
  add constraint transactions_id_user_uniq unique (id, user_id);

alter table public.transactions
  add constraint transactions_settled_by_fkey
  foreign key (settled_by_id, user_id)
  references public.transactions (id, user_id) on delete set null;

create index transactions_split_group_idx
  on public.transactions (user_id, split_group_id)
  where split_group_id is not null;

-- Outstanding claims, newest first — what "who owes me" reads.
create index transactions_owed_idx
  on public.transactions (user_id, occurred_at desc)
  where owed_amount is not null and settled_by_id is null;

comment on column public.transactions.split_group_id is
  'Marks rows that came from splitting one payment. Every row is a real part; '
  'there is no parent holding the total, so sums need no special casing.';

comment on column public.transactions.owed_amount is
  'How much of this payment someone else is expected to repay. The row stays '
  'a full expense — the money did leave — while the claim is tracked beside it.';
