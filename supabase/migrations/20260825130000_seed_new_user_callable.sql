-- ============================================================================
-- 0025 · Make the signup seeding callable
--
-- What a new account starts with — a profile, a Cash account and the default
-- categories — lived inside `handle_new_user`, a trigger function that can
-- only run as `auth.users` gains a row. So the only way to return an existing
-- account to its first-run state was to retype the seed list somewhere else,
-- and the copy would drift from the real thing the first time a category was
-- added to one and not the other.
--
-- The body moves into `seed_new_user(uuid, text)` and the trigger becomes a
-- one-line caller. Signup is unchanged — it runs the same statements it always
-- did — but resetting a test account is now a single call to the one
-- definition, and there is no second list to keep in step.
--
-- Idempotent by construction: a profile insert collides on its primary key,
-- so re-seeding a live account fails rather than quietly duplicating it. Clear
-- the account's rows first.
-- ============================================================================

create or replace function public.seed_new_user(
  p_user_id uuid,
  p_display_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (p_user_id, p_display_name);

  insert into public.accounts (user_id, name, type, icon, is_primary)
  values (p_user_id, 'Cash', 'cash', 'banknote', false);

  insert into public.categories
    (user_id, name, kind, is_fixed, slug, is_system, icon, sort_order)
  values
    -- expenses · variable
    (p_user_id, 'Groceries',        'expense', false, 'groceries',    false, 'shopping-basket', 10),
    (p_user_id, 'Eating Out',       'expense', false, 'eating-out',   false, 'utensils',        20),
    (p_user_id, 'Transport',        'expense', false, 'transport',    false, 'car',             30),
    (p_user_id, 'Fuel',             'expense', false, 'fuel',         false, 'fuel',            40),
    (p_user_id, 'Shopping',         'expense', false, 'shopping',     false, 'shopping-bag',    50),
    (p_user_id, 'Health',           'expense', false, 'health',       false, 'heart-pulse',     60),
    (p_user_id, 'Personal Care',    'expense', false, 'personal-care',false, 'scissors',        70),
    (p_user_id, 'Charity',          'expense', false, 'charity',      false, 'hand-heart',      80),
    (p_user_id, 'Gifts',            'expense', false, 'gifts',        false, 'gift',            90),
    (p_user_id, 'Education',        'expense', false, 'education',    false, 'graduation-cap', 100),
    (p_user_id, 'Misc',             'expense', false, 'misc',         false, 'circle-ellipsis',110),
    -- expenses · fixed
    (p_user_id, 'Rent',             'expense', true,  'rent',         false, 'house',          120),
    (p_user_id, 'Utilities',        'expense', true,  'utilities',    false, 'zap',            130),
    (p_user_id, 'Mobile & Internet','expense', true,  'connectivity', false, 'wifi',           140),
    (p_user_id, 'Subscriptions',    'expense', true,  'subscriptions',false, 'repeat',         150),
    (p_user_id, 'Family Support',   'expense', true,  'family',       false, 'users',          160),
    -- system
    (p_user_id, 'Unaccounted Cash', 'expense', false, 'unaccounted-cash', true, 'help-circle', 900),
    (p_user_id, 'Bank Charges',     'expense', false, 'bank-charges', false, 'landmark',       170),
    -- income
    (p_user_id, 'Salary',           'income',  false, 'salary',       false, 'briefcase',       10),
    (p_user_id, 'Freelance',        'income',  false, 'freelance',    false, 'laptop',          20),
    (p_user_id, 'Bonus',            'income',  false, 'bonus',        false, 'trending-up',     30),
    (p_user_id, 'Refund',           'income',  false, 'refund',       false, 'undo-2',          40),
    (p_user_id, 'Other Income',     'income',  false, 'other-income', false, 'plus-circle',     50);
end;
$$;

-- Only the trigger and the service role may seed; a signed-in user must not be
-- able to re-run this against their own account and duplicate every category.
revoke all on function public.seed_new_user(uuid, text) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_new_user(
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;
