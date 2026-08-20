-- ============================================================================
-- 0001 · Core ledger
--
-- Multi-user from day one: every row is owned by a user and RLS makes that
-- ownership the only way in. There is no cross-user visibility anywhere.
--
-- Money convention: `amount` is ALWAYS positive. Direction comes from `type`.
-- Cash is modelled as an ordinary account, which is what makes ATM
-- withdrawals just a transfer and keeps cash spending inside the ledger.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums ----

create type account_type as enum (
  'bank', 'wallet', 'cash', 'credit_card', 'savings'
);

create type category_kind as enum ('expense', 'income');

create type transaction_type as enum ('expense', 'income', 'transfer');

create type transaction_status as enum (
  'cleared',       -- confirmed, counts toward balance
  'pending',       -- expected but not yet confirmed (e.g. posted recurring)
  'needs_review',  -- really happened, but we don't know the category yet
  'void'
);

create type transaction_source as enum (
  'manual', 'sms', 'recurring', 'split', 'import', 'adjustment'
);

-- ------------------------------------------------------------- profiles ----

create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  display_name    text,
  currency        char(3)     not null default 'PKR',
  timezone        text        not null default 'Asia/Karachi',
  -- Salary rarely lands on the 1st; budget cycles start on this day.
  month_start_day smallint    not null default 1
                    check (month_start_day between 1 and 28),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ------------------------------------------------------------- accounts ----

create table public.accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid()
                    references auth.users (id) on delete cascade,
  name            text not null check (length(btrim(name)) > 0),
  type            account_type not null,
  institution     text,
  -- Bank SMS quote the last few digits; this is how a message finds its
  -- account without the user picking one.
  last4           text check (last4 ~ '^[0-9]{3,6}$'),
  currency        char(3)     not null default 'PKR',
  opening_balance numeric(14, 2) not null default 0,
  color           text,
  icon            text,
  is_primary      boolean     not null default false,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index accounts_user_idx on public.accounts (user_id)
  where archived_at is null;

-- Deterministic SMS routing depends on last4 being unambiguous per user.
create unique index accounts_user_last4_uniq
  on public.accounts (user_id, last4)
  where last4 is not null and archived_at is null;

create unique index accounts_one_primary_uniq
  on public.accounts (user_id)
  where is_primary and archived_at is null;

-- ----------------------------------------------------------- categories ----

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  kind        category_kind not null default 'expense',
  -- FK added below as a composite, so a parent cannot belong to another user.
  parent_id   uuid,
  icon        text,
  color       text,
  -- Fixed (rent, subscriptions, family support) vs variable (food, shops).
  is_fixed    boolean     not null default false,
  -- System categories are looked up by `slug` from code, so they must exist
  -- and must not be renamed out of existence.
  slug        text,
  is_system   boolean     not null default false,
  sort_order  int         not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

create unique index categories_user_name_kind_uniq
  on public.categories (user_id, lower(name), kind);

create unique index categories_user_slug_uniq
  on public.categories (user_id, slug) where slug is not null;

create index categories_user_kind_idx on public.categories (user_id, kind)
  where archived_at is null;

-- ------------------------------------------------------------ merchants ----

-- The learning table. Categorise a merchant once and every future SMS from
-- it is filed silently — this is what drives manual entry toward zero.
create table public.merchants (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid()
                        references auth.users (id) on delete cascade,
  -- Normalised match key (uppercased, punctuation and noise stripped).
  raw_name            text not null,
  display_name        text not null,
  default_category_id uuid,
  times_seen          int         not null default 0,
  last_seen_at        timestamptz,
  created_at          timestamptz not null default now()
);

create unique index merchants_user_raw_uniq
  on public.merchants (user_id, raw_name);

-- --------------------------------------------------------- transactions ----

create table public.transactions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null default auth.uid()
                            references auth.users (id) on delete cascade,
  -- Every one of these FKs is composite on (id, user_id) — see the integrity
  -- section below. That is what stops one user referencing another's rows.
  account_id              uuid not null,
  -- Destination account, transfers only.
  counterparty_account_id uuid,
  type                    transaction_type not null,
  amount                  numeric(14, 2) not null check (amount > 0),
  currency                char(3) not null default 'PKR',
  occurred_at             timestamptz not null default now(),
  category_id             uuid,
  merchant_id             uuid,
  note                    text,
  source                  transaction_source not null default 'manual',
  status                  transaction_status not null default 'cleared',
  -- Parser confidence, 0..1. Null for anything a human entered.
  confidence              numeric(3, 2) check (confidence between 0 and 1),
  tags                    text[] not null default '{}',
  -- Stops an SMS and a manual entry becoming two rows for one payment.
  dedupe_hash             text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint transfer_needs_counterparty check (
    (type = 'transfer'
      and counterparty_account_id is not null
      and counterparty_account_id <> account_id)
    or
    (type <> 'transfer' and counterparty_account_id is null)
  ),

  -- A transfer moves money between the user's own accounts, so it is not
  -- spending and must never land in category totals.
  constraint transfer_has_no_category check (
    type <> 'transfer' or category_id is null
  )
);

create index transactions_user_time_idx
  on public.transactions (user_id, occurred_at desc);

create index transactions_account_time_idx
  on public.transactions (account_id, occurred_at desc);

create index transactions_counterparty_idx
  on public.transactions (counterparty_account_id)
  where counterparty_account_id is not null;

create index transactions_review_idx
  on public.transactions (user_id, occurred_at desc)
  where status = 'needs_review';

create index transactions_category_idx
  on public.transactions (user_id, category_id, occurred_at desc);

create unique index transactions_dedupe_uniq
  on public.transactions (user_id, dedupe_hash)
  where dedupe_hash is not null;

-- --------------------------------------------- cross-user integrity ------
--
-- RLS alone is NOT enough here. A policy of `user_id = auth.uid()` is happy
-- with a row the caller owns even when that row points at somebody else's
-- account — the caller owns the transaction, so the check passes, and they
-- have just written into a stranger's account.
--
-- Making every foreign key composite on (id, user_id) closes that off in the
-- schema itself: a reference can only resolve to a row with the SAME owner.
-- It is declarative, race-free, and cannot be forgotten at a call site.
--
-- Nullable references are unaffected — a composite FK with MATCH SIMPLE (the
-- default) is not enforced when any of its columns is null.

alter table public.accounts
  add constraint accounts_id_user_uniq unique (id, user_id);
alter table public.categories
  add constraint categories_id_user_uniq unique (id, user_id);
alter table public.merchants
  add constraint merchants_id_user_uniq unique (id, user_id);

alter table public.categories
  add constraint categories_parent_id_fkey
  foreign key (parent_id, user_id)
  references public.categories (id, user_id) on delete set null;

alter table public.merchants
  add constraint merchants_default_category_id_fkey
  foreign key (default_category_id, user_id)
  references public.categories (id, user_id) on delete set null;

-- Constraint names are load-bearing: PostgREST resolves embedded selects
-- (`account:accounts!transactions_account_id_fkey`) by constraint name.
alter table public.transactions
  add constraint transactions_account_id_fkey
  foreign key (account_id, user_id)
  references public.accounts (id, user_id) on delete restrict;

alter table public.transactions
  add constraint transactions_counterparty_account_id_fkey
  foreign key (counterparty_account_id, user_id)
  references public.accounts (id, user_id) on delete restrict;

alter table public.transactions
  add constraint transactions_category_id_fkey
  foreign key (category_id, user_id)
  references public.categories (id, user_id) on delete set null;

alter table public.transactions
  add constraint transactions_merchant_id_fkey
  foreign key (merchant_id, user_id)
  references public.merchants (id, user_id) on delete set null;

-- ------------------------------------------------------------ balances ----

-- One signed movement row per side of every transaction. Transfers produce
-- two rows: money out of `account_id`, money into `counterparty_account_id`.
create or replace view public.account_movements
with (security_invoker = on) as
  select user_id, account_id, occurred_at, status,
         case when type = 'income' then amount else -amount end as delta
    from public.transactions
   where type in ('income', 'expense')
     and status <> 'void'
  union all
  select user_id, account_id, occurred_at, status, -amount
    from public.transactions
   where type = 'transfer' and status <> 'void'
  union all
  select user_id, counterparty_account_id, occurred_at, status, amount
    from public.transactions
   where type = 'transfer' and status <> 'void';

-- `balance` is what the money actually is: cleared plus needs_review, because
-- an uncategorised transaction still left the account. `projected_balance`
-- additionally folds in pending rows (posted recurring not yet confirmed).
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
         max(m.occurred_at) as last_activity_at
    from public.accounts a
    left join public.account_movements m on m.account_id = a.id
   group by a.id;

-- ------------------------------------------------------- updated_at ------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger accounts_touch before update on public.accounts
  for each row execute function public.touch_updated_at();
create trigger transactions_touch before update on public.transactions
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------- new user ----

-- Seeds a profile, a Cash account and a starter category set so a brand new
-- user can record a transaction immediately instead of doing setup admin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );

  insert into public.accounts (user_id, name, type, icon, is_primary)
  values (new.id, 'Cash', 'cash', 'banknote', false);

  insert into public.categories
    (user_id, name, kind, is_fixed, slug, is_system, icon, sort_order)
  values
    -- expenses · variable
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
    -- expenses · fixed
    (new.id, 'Rent',             'expense', true,  'rent',         false, 'house',          120),
    (new.id, 'Utilities',        'expense', true,  'utilities',    false, 'zap',            130),
    (new.id, 'Mobile & Internet','expense', true,  'connectivity', false, 'wifi',           140),
    (new.id, 'Subscriptions',    'expense', true,  'subscriptions',false, 'repeat',         150),
    (new.id, 'Family Support',   'expense', true,  'family',       false, 'users',          160),
    -- system
    (new.id, 'Unaccounted Cash', 'expense', false, 'unaccounted-cash', true, 'help-circle', 900),
    (new.id, 'Bank Charges',     'expense', false, 'bank-charges', false, 'landmark',       170),
    -- income
    (new.id, 'Salary',           'income',  false, 'salary',       false, 'briefcase',       10),
    (new.id, 'Freelance',        'income',  false, 'freelance',    false, 'laptop',          20),
    (new.id, 'Bonus',            'income',  false, 'bonus',        false, 'trending-up',     30),
    (new.id, 'Refund',           'income',  false, 'refund',       false, 'undo-2',          40),
    (new.id, 'Other Income',     'income',  false, 'other-income', false, 'plus-circle',     50);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------ RLS ----

alter table public.profiles     enable row level security;
alter table public.accounts     enable row level security;
alter table public.categories   enable row level security;
alter table public.merchants    enable row level security;
alter table public.transactions enable row level security;

create policy "own profile" on public.profiles
  for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "own accounts" on public.accounts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own categories" on public.categories
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own merchants" on public.merchants
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own transactions" on public.transactions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- --------------------------------------------------------------- grants ----

-- RLS only ever *restricts*. Without a GRANT the authenticated role cannot
-- reach the table at all, policies or no policies — so both are required.
grant usage on schema public to authenticated;

grant select, insert, update, delete on
  public.profiles,
  public.accounts,
  public.categories,
  public.merchants,
  public.transactions
to authenticated;

-- Views inherit RLS from their base tables via security_invoker, but the
-- anon role must never reach anything here at all.
grant select on public.account_movements to authenticated;
grant select on public.account_balances to authenticated;

revoke all on public.account_movements from anon;
revoke all on public.account_balances from anon;
revoke all on public.profiles from anon;
revoke all on public.accounts from anon;
revoke all on public.categories from anon;
revoke all on public.merchants from anon;
revoke all on public.transactions from anon;
