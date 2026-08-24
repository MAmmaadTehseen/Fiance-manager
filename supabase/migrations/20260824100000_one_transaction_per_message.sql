-- ============================================================================
-- 0018 · One transaction per message
--
-- Dev had 24 duplicate rows out of 61. Seven messages had produced three
-- identical transactions each and ten had produced two — same message id, same
-- amount, same type, created milliseconds apart. Milliseconds is the tell:
-- sequential code would have found the first row through the pipeline's own
-- "have I already booked this message?" check, so these came from concurrent
-- runs that each read "nothing here yet" and each inserted.
--
-- No application check can close that, because the read and the write are two
-- statements with a gap between them. Only the database can, so the rule moves
-- into an index.
--
-- The key is (user_id, sms_message_id, type, amount) rather than just the
-- message, because one message legitimately produces two rows: a transfer and
-- the fee the bank quoted inside the same text. Those differ in both type and
-- amount, so they survive; a second copy of the transfer does not.
--
-- `status <> 'void'` keeps the index out of the way of the cleanup below —
-- voided rows stay on the table as history, and the ledger already hides them.
-- ============================================================================

-- Void the duplicates, keeping the earliest of each set. Void rather than
-- delete: these rows are almost certainly wrong, but "almost certainly" is not
-- a licence to destroy someone's financial history, and a voided row can be
-- brought back by hand if this ever misjudges.
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, sms_message_id, type, amount
      order by created_at, id
    ) as copy_number
  from public.transactions
  where sms_message_id is not null
    and status <> 'void'
)
update public.transactions t
set status = 'void',
    note = coalesce(t.note || ' ', '') || '(voided: duplicate of the same message)'
from ranked r
where t.id = r.id
  and r.copy_number > 1;

create unique index transactions_one_per_message_uniq
  on public.transactions (user_id, sms_message_id, type, amount)
  where sms_message_id is not null and status <> 'void';

comment on index public.transactions_one_per_message_uniq is
  'One transaction per (message, type, amount). Lets a transfer and the fee '
  'quoted in the same message coexist, while making a duplicate insert from a '
  'concurrent pipeline run fail rather than double-count.';
