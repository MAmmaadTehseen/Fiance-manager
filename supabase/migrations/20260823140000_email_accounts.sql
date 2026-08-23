-- Connected email inboxes (Gmail to start).
--
-- One row per connected mailbox. The refresh token is the crown jewel: it lets
-- the server read the user's bank mail forever, so it must never reach the
-- browser. RLS scopes rows to their owner, and a COLUMN grant then hides the
-- token columns from the authenticated role entirely — the client can read the
-- connection's status and address, never its credentials. Only service_role
-- (the Edge Functions) sees the tokens, and it bypasses RLS.

create table public.email_accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid()
                    references auth.users (id) on delete cascade,
  provider        text not null default 'gmail' check (provider in ('gmail')),
  email_address   text not null,
  -- credentials — service_role only, see the grant below
  refresh_token   text not null,
  access_token    text,
  token_expires_at timestamptz,
  -- Gmail incremental sync cursor, so a sync only pulls what is new.
  history_id      text,
  last_synced_at  timestamptz,
  connected_at    timestamptz not null default now(),
  revoked_at      timestamptz
);

create index email_accounts_user_idx on public.email_accounts (user_id);

-- Plain unique so the OAuth callback can upsert on it: re-connecting the same
-- mailbox updates the existing row (and clears any prior revoked_at) rather
-- than piling up dead connections.
alter table public.email_accounts
  add constraint email_accounts_user_email_uniq unique (user_id, email_address);

alter table public.email_accounts
  add constraint email_accounts_id_user_uniq unique (id, user_id);

alter table public.email_accounts enable row level security;

create policy "own email accounts" on public.email_accounts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Column-level grant: the client reads the connection's status and address,
-- but the token columns are omitted, so a compromised browser session still
-- cannot lift the credential. The server (service_role) writes the row after
-- OAuth and does the actual mail reading; the client only ever disconnects.
grant select (id, user_id, provider, email_address, last_synced_at,
              connected_at, revoked_at)
  on public.email_accounts to authenticated;
grant delete on public.email_accounts to authenticated;

revoke all on public.email_accounts from anon;
