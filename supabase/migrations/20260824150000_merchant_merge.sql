-- ============================================================================
-- 0023 · One payee, many names
--
-- The same shopkeeper collects through several accounts — a real ledger shows
-- Yasir, Amir, Fayyaz, Umair and "Kashmir Tobacco" all being the one cigarette
-- shop. Merchants key on the message's raw name, so each alias learns its
-- category separately and the daily purchase keeps landing in the Inbox once
-- per name.
--
-- `merged_into` points an alias at its canonical payee. The alias row stays,
-- because it is the match key for future messages — the pipeline resolves the
-- raw name to the alias, then follows the pointer one hop. History is
-- repointed at merge time, so per-person totals and teach-once operate on one
-- payee from then on.
--
-- One hop only, enforced below: a canonical payee cannot itself be an alias,
-- so there are no chains to walk and no cycles to guard against.
-- ============================================================================

alter table public.merchants
  add column merged_into uuid;

alter table public.merchants
  add constraint merchants_merged_into_fkey
  foreign key (merged_into, user_id)
  references public.merchants (id, user_id) on delete set null;

alter table public.merchants
  add constraint merchants_no_self_merge check (merged_into <> id);

create index merchants_merged_into_idx
  on public.merchants (user_id, merged_into)
  where merged_into is not null;

-- A canonical payee must not itself point anywhere; without this, resolving a
-- name could require walking a chain, and a careless merge could close a loop.
create or replace function public.merchants_one_hop() returns trigger
language plpgsql as $$
begin
  if new.merged_into is not null then
    if exists (
      select 1 from public.merchants
       where id = new.merged_into and merged_into is not null
    ) then
      raise exception 'cannot merge into a payee that is itself merged';
    end if;
    if exists (
      select 1 from public.merchants
       where merged_into = new.id
    ) and new.merged_into is not null then
      raise exception 'cannot merge a payee that others are merged into';
    end if;
  end if;
  return new;
end $$;

create trigger merchants_one_hop before insert or update on public.merchants
  for each row execute function public.merchants_one_hop();
