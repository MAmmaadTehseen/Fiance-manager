-- Monthly budgets: a spending limit per category.
--
-- One budget per category per user. Spending against a budget is computed from
-- the transactions themselves (current-month expenses in that category), so
-- there is nothing to keep in sync here — the table only holds the limit.

create table public.budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
  category_id uuid not null,
  amount      numeric(14,2) not null check (amount > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One budget per category. Upserts target this.
create unique index budgets_user_category_uniq
  on public.budgets (user_id, category_id);

create index budgets_user_idx on public.budgets (user_id);

-- Composite uniqueness so this table can itself be referenced by (id, user_id),
-- matching every other table in the schema.
alter table public.budgets
  add constraint budgets_id_user_uniq unique (id, user_id);

-- The category FK is composite on (id, user_id): RLS alone would let a user
-- point a budget at another user's category id, which they own the row for.
-- Deleting the category removes its budget.
alter table public.budgets
  add constraint budgets_category_id_fkey
  foreign key (category_id, user_id)
  references public.categories (id, user_id) on delete cascade;

alter table public.budgets enable row level security;

create policy "own budgets" on public.budgets
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.budgets to authenticated;
revoke all on public.budgets from anon;
