-- Savings goals: a named target to save toward, with progress tracked by hand.
--
-- saved_amount is a simple running figure the user tops up ("I moved 5,000 to
-- the Umrah fund"), not a live join against an account. That keeps a goal
-- independent of which account the money actually sits in, which is how people
-- think about goals — the money for one goal is often spread across places.

create table public.savings_goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid()
                  references auth.users (id) on delete cascade,
  name          text not null check (length(btrim(name)) > 0),
  target_amount numeric(14,2) not null check (target_amount > 0),
  saved_amount  numeric(14,2) not null default 0 check (saved_amount >= 0),
  target_date   date,
  created_at    timestamptz not null default now()
);

create index savings_goals_user_idx on public.savings_goals (user_id);

alter table public.savings_goals
  add constraint savings_goals_id_user_uniq unique (id, user_id);

alter table public.savings_goals enable row level security;

create policy "own savings goals" on public.savings_goals
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.savings_goals to authenticated;
revoke all on public.savings_goals from anon;
