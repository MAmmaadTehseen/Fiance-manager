-- ============================================================================
-- 0006 · Default owner for user-authored parser templates
--
-- `parser_templates.user_id` is nullable because a null means "built-in,
-- shared by everyone". But leaving it without a default made every other
-- table's convention a trap here: a client inserting a rule without naming
-- itself produced a null row, which reads as an attempt to create a built-in
-- and is correctly refused by the RLS check.
--
-- The insert failing was right. Failing for a reason the caller could not see
-- was not. Defaulting to auth.uid() makes the common case work and keeps the
-- policy as the thing that refuses a genuine forgery. Seeds are unaffected:
-- they pass an explicit null, which overrides a default.
-- ============================================================================

alter table public.parser_templates
  alter column user_id set default auth.uid();
