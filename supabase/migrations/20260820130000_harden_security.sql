-- ============================================================================
-- 0002 · Security hardening
--
-- 0001 established ownership (RLS + composite FKs). This migration closes the
-- surface around it: privilege defaults, function exposure, and the search
-- path of the one SECURITY DEFINER function in the system.
-- ============================================================================

-- ------------------------------------------------- schema-level privileges --

-- Nothing client-facing should ever be able to create objects in `public`.
-- A table created by a user would arrive with no RLS at all.
revoke create on schema public from public;
revoke create on schema public from anon;
revoke create on schema public from authenticated;

revoke usage on schema public from anon;

-- Future tables must not inherit privileges by accident. Every new table has
-- to opt in with an explicit GRANT, next to its RLS policies.
alter default privileges in schema public
  revoke all on tables from anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges in schema public
  revoke all on functions from anon, authenticated;

-- ---------------------------------------------------- SECURITY DEFINER fn --

-- `search_path = ''` is the safe setting: with a non-empty path, a schema the
-- caller controls could shadow an unqualified name and run attacker code with
-- the definer's privileges. Every reference below is already schema-qualified,
-- and pg_catalog is always implicitly available for the built-ins.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1)
    )
  );

  insert into public.accounts (user_id, name, type, icon, is_primary)
  values (new.id, 'Cash', 'cash', 'banknote', false);

  insert into public.categories
    (user_id, name, kind, is_fixed, slug, is_system, icon, sort_order)
  values
    (new.id, 'Groceries',        'expense', false, 'groceries',    false, 'shopping-basket', 10),
    (new.id, 'Eating Out',       'expense', false, 'eating-out',   false, 'utensils',        20),
    (new.id, 'Transport',        'expense', false, 'transport',    false, 'car',             30),
    (new.id, 'Fuel',             'expense', false, 'fuel',         false, 'fuel',            40),
    (new.id, 'Shopping',         'expense', false, 'shopping',     false, 'shopping-bag',    50),
    (new.id, 'Health',           'expense', false, 'health',       false, 'heart-pulse',     60),
    (new.id, 'Personal Care',    'expense', false, 'personal-care',false, 'scissors',        70),
    (new.id, 'Charity',          'expense', false, 'charity',      false, 'hand-heart',      80),
    (new.id, 'Gifts',            'expense', false, 'gifts',        false, 'gift',            90),
    (new.id, 'Education',        'expense', false, 'education',    false, 'graduation-cap', 100),
    (new.id, 'Misc',             'expense', false, 'misc',         false, 'circle-ellipsis',110),
    (new.id, 'Rent',             'expense', true,  'rent',         false, 'house',          120),
    (new.id, 'Utilities',        'expense', true,  'utilities',    false, 'zap',            130),
    (new.id, 'Mobile & Internet','expense', true,  'connectivity', false, 'wifi',           140),
    (new.id, 'Subscriptions',    'expense', true,  'subscriptions',false, 'repeat',         150),
    (new.id, 'Family Support',   'expense', true,  'family',       false, 'users',          160),
    (new.id, 'Unaccounted Cash', 'expense', false, 'unaccounted-cash', true, 'help-circle', 900),
    (new.id, 'Bank Charges',     'expense', false, 'bank-charges', false, 'landmark',       170),
    (new.id, 'Salary',           'income',  false, 'salary',       false, 'briefcase',       10),
    (new.id, 'Freelance',        'income',  false, 'freelance',    false, 'laptop',          20),
    (new.id, 'Bonus',            'income',  false, 'bonus',        false, 'trending-up',     30),
    (new.id, 'Refund',           'income',  false, 'refund',       false, 'undo-2',          40),
    (new.id, 'Other Income',     'income',  false, 'other-income', false, 'plus-circle',     50);

  return new;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Postgres grants EXECUTE to PUBLIC on new functions by default. These are
-- trigger functions with no legitimate direct caller.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;

-- ------------------------------------------------------ profile lifecycle --

-- A profile is created by the signup trigger and must not be deletable: the
-- trigger only fires once, so a deleted profile could never come back and
-- would leave the account in a half-initialised state. Replacing the blanket
-- FOR ALL policy with explicit per-operation ones removes DELETE entirely.
drop policy if exists "own profile" on public.profiles;

create policy "read own profile" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "create own profile" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke delete on public.profiles from authenticated;

-- ------------------------------------------------------------- immutables --

-- `user_id` is the entire basis of ownership, so it must never move. The RLS
-- WITH CHECK already refuses to hand a row to someone else, but this also
-- refuses the no-op-looking rewrite and states the invariant in one place.
create or replace function public.freeze_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id is immutable';
  end if;
  return new;
end;
$$;

revoke all on function public.freeze_owner() from public, anon, authenticated;

create trigger accounts_freeze_owner before update on public.accounts
  for each row execute function public.freeze_owner();
create trigger categories_freeze_owner before update on public.categories
  for each row execute function public.freeze_owner();
create trigger merchants_freeze_owner before update on public.merchants
  for each row execute function public.freeze_owner();
create trigger transactions_freeze_owner before update on public.transactions
  for each row execute function public.freeze_owner();
