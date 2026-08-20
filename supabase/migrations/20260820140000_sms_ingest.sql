-- ============================================================================
-- 0003 · SMS ingest pipeline
--
-- The automation spine. A bank SMS arrives from the user's phone, gets matched
-- against a parser template, and becomes a transaction — silently when we
-- recognise the merchant, and as a one-tap question when we don't.
--
-- Templates are DATA, not code: adding a bank is an insert, not a deploy.
-- ============================================================================

-- ---------------------------------------------------------------- enums ----

create type sms_parse_status as enum (
  'parsed',        -- matched, and a transaction now exists
  'needs_account', -- matched, but the card's last4 maps to no known account
  'unmatched',     -- no template matched; shows up in the rule builder
  'ignored',       -- matched an ignore template (OTP, promo, balance enquiry)
  'duplicate'      -- this exact message was already received
);

create type template_kind as enum (
  'purchase',      -- card spend / online payment  -> expense
  'credit',        -- money in                     -> income
  'atm',           -- cash withdrawal              -> transfer to Cash
  'fee',           -- bank charges                 -> expense
  'ignore'         -- OTP, marketing, balance enquiry -> never a transaction
);

-- ------------------------------------------------------- ingest tokens ----

-- MacroDroid cannot hold a Supabase session, so the phone authenticates with
-- a bearer token instead. Only the hash is ever stored: the raw token is
-- generated in the browser, shown once, and never transmitted to us.
create table public.ingest_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid()
                 references auth.users (id) on delete cascade,
  token_hash   text not null unique,
  label        text not null,
  last_used_at timestamptz,
  use_count    int         not null default 0,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index ingest_tokens_user_idx on public.ingest_tokens (user_id);

-- ---------------------------------------------------- parser templates ----

-- One table holds both the built-in templates (user_id is null, readable by
-- everyone) and a user's own additions, which take precedence. Keeping them
-- together means the matcher has exactly one place to look.
create table public.parser_templates (
  id             uuid primary key default gen_random_uuid(),
  -- null = built-in, shared by all users and not editable by them.
  user_id        uuid references auth.users (id) on delete cascade,
  bank_key       text not null,
  label          text not null,
  country        char(2) not null default 'PK',
  -- Regex, case-insensitive, tested against the SMS sender id.
  sender_pattern text not null,
  -- Regex deciding whether this template applies at all. Deliberately kept
  -- separate from field extraction: one regex that must match amount AND
  -- merchant AND balance in sequence fails entirely when a bank reworks a
  -- single clause. Independent extraction degrades one field instead.
  match_pattern  text not null,
  -- { field: regex } with one capture group each. Recognised fields:
  -- amount, merchant, last4, balance, datetime, reference.
  field_patterns jsonb not null default '{}'::jsonb,
  kind           template_kind not null default 'purchase',
  -- Lower runs first. User templates get a head start over built-ins.
  priority       int         not null default 100,
  sample         text,
  enabled        boolean     not null default true,
  created_at     timestamptz not null default now()
);

create index parser_templates_lookup_idx
  on public.parser_templates (country, priority)
  where enabled;

create index parser_templates_user_idx on public.parser_templates (user_id)
  where user_id is not null;

-- ---------------------------------------------------------- sms inbox ----

create table public.sms_messages (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid()
                 references auth.users (id) on delete cascade,
  sender       text not null,
  body         text not null,
  received_at  timestamptz not null default now(),
  device_label text,
  -- Set by trigger; the client never supplies it. See sms_fingerprint().
  body_hash    text not null,
  parse_status sms_parse_status not null default 'unmatched',
  -- Whatever the template extracted, kept verbatim so a parsing bug can be
  -- diagnosed later without the original message being re-sent.
  parsed       jsonb,
  -- The last4 we read but could not map to an account, for the inbox prompt.
  pending_last4 text,
  error        text,
  created_at   timestamptz not null default now()
);

-- The same message arriving twice (MacroDroid retry, flaky signal) must not
-- become two transactions.
create unique index sms_messages_dedupe_uniq
  on public.sms_messages (user_id, body_hash);

create index sms_messages_user_time_idx
  on public.sms_messages (user_id, received_at desc);

create index sms_messages_open_idx
  on public.sms_messages (user_id, received_at desc)
  where parse_status in ('unmatched', 'needs_account');

alter table public.sms_messages
  add column matched_template_id uuid
    references public.parser_templates (id) on delete set null;

alter table public.sms_messages
  add constraint sms_messages_id_user_uniq unique (id, user_id);

-- The message -> transaction link is held on the transaction only. Storing it
-- on both sides would be two facts that can disagree; PostgREST can embed the
-- reverse direction from this one FK anyway.
alter table public.transactions
  add column sms_message_id uuid;

alter table public.transactions
  add constraint transactions_sms_message_id_fkey
  foreign key (sms_message_id, user_id)
  references public.sms_messages (id, user_id) on delete set null;

-- A transaction that came from an SMS should carry the evidence.
create index transactions_sms_idx on public.transactions (sms_message_id)
  where sms_message_id is not null;

-- --------------------------------------------------- message fingerprint ---

-- Dedupe key. Timestamps are rounded to the minute because a resend carries a
-- slightly different clock reading, while two genuinely separate purchases of
-- the same amount at the same shop inside one minute are vanishingly rare —
-- and the phone would report them with different bodies anyway (balance
-- differs). Computed server-side so a client cannot bypass deduplication.
create or replace function public.sms_fingerprint()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.body_hash := encode(
    extensions.digest(
      new.user_id::text || '|' ||
      new.sender || '|' ||
      new.body || '|' ||
      (extract(epoch from new.received_at)::bigint / 60)::text,
      'sha256'
    ),
    'hex'
  );
  return new;
end;
$$;

revoke all on function public.sms_fingerprint() from public, anon, authenticated;

create trigger sms_messages_fingerprint
  before insert on public.sms_messages
  for each row execute function public.sms_fingerprint();

-- --------------------------------------------------- balance assertions ---

-- Pakistani bank SMS almost always quote "Avail Bal". Storing that and
-- comparing it to our own arithmetic turns every message into a free audit:
-- if they disagree, a transaction is missing and the app can say so rather
-- than quietly drifting.
create table public.balance_assertions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid()
                     references auth.users (id) on delete cascade,
  account_id       uuid not null,
  asserted_balance numeric(14, 2) not null,
  computed_balance numeric(14, 2),
  drift            numeric(14, 2),
  observed_at      timestamptz not null default now(),
  sms_message_id   uuid,
  acknowledged_at  timestamptz,
  created_at       timestamptz not null default now()
);

alter table public.balance_assertions
  add constraint balance_assertions_account_id_fkey
  foreign key (account_id, user_id)
  references public.accounts (id, user_id) on delete cascade,
  add constraint balance_assertions_sms_message_id_fkey
  foreign key (sms_message_id, user_id)
  references public.sms_messages (id, user_id) on delete set null;

create index balance_assertions_account_idx
  on public.balance_assertions (account_id, observed_at desc);

create index balance_assertions_drift_idx
  on public.balance_assertions (user_id, observed_at desc)
  where drift is distinct from 0 and acknowledged_at is null;

-- ------------------------------------------------------ push endpoints ----

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid()
               references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ------------------------------------------------------------------ RLS ----

alter table public.ingest_tokens       enable row level security;
alter table public.parser_templates    enable row level security;
alter table public.sms_messages        enable row level security;
alter table public.balance_assertions  enable row level security;
alter table public.push_subscriptions  enable row level security;

create policy "own ingest tokens" on public.ingest_tokens
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Built-ins are readable by everybody; only your own are writable.
create policy "read builtin and own templates" on public.parser_templates
  for select to authenticated
  using (user_id is null or user_id = (select auth.uid()));

create policy "write own templates" on public.parser_templates
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "update own templates" on public.parser_templates
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "delete own templates" on public.parser_templates
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "own sms messages" on public.sms_messages
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own balance assertions" on public.balance_assertions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own push subscriptions" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- --------------------------------------------------------------- grants ----

grant select, insert, update, delete on
  public.ingest_tokens,
  public.balance_assertions,
  public.push_subscriptions
to authenticated;

grant select on public.parser_templates to authenticated;
grant insert, update, delete on public.parser_templates to authenticated;

-- Column-level grants on sms_messages. The pipeline fields (parse_status,
-- parsed, transaction_id, matched_template_id, body_hash) are written by the
-- ingest function under the service role — a client that could set them could
-- fake a "parsed" message or bypass deduplication.
grant select on public.sms_messages to authenticated;
grant insert (sender, body, received_at, device_label)
  on public.sms_messages to authenticated;
grant update (parse_status) on public.sms_messages to authenticated;
grant delete on public.sms_messages to authenticated;

revoke all on public.ingest_tokens      from anon;
revoke all on public.parser_templates   from anon;
revoke all on public.sms_messages       from anon;
revoke all on public.balance_assertions from anon;
revoke all on public.push_subscriptions from anon;

-- ------------------------------------------------------- owner immutable ---

create trigger ingest_tokens_freeze_owner before update on public.ingest_tokens
  for each row execute function public.freeze_owner();
create trigger sms_messages_freeze_owner before update on public.sms_messages
  for each row execute function public.freeze_owner();
create trigger balance_assertions_freeze_owner before update on public.balance_assertions
  for each row execute function public.freeze_owner();
create trigger push_subscriptions_freeze_owner before update on public.push_subscriptions
  for each row execute function public.freeze_owner();
