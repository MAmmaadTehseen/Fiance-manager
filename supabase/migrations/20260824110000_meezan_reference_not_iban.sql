-- ============================================================================
-- 0019 · Stop the Meezan template reading an IBAN as a reference
--
-- The pattern was RAAST\s*PYMT\s*([A-Z0-9]{5,}), and a real Meezan credit
-- alert reads:
--
--   Beneficiary Account : M.IMAD AC# RAAST PYMT PK94FAYS34307
--
-- so it captured PK94FAYS34307 — the beneficiary's IBAN, not a reference.
-- That was cosmetic while the value only decorated a note. It stopped being
-- cosmetic once references became identity: an IBAN is identical on every
-- payment to that beneficiary, so the second such payment would look like a
-- duplicate of the first and be swallowed.
--
-- These alerts carry no transaction reference at all, so the honest fix is to
-- capture one only when it is plainly numeric. No match means no reference,
-- which simply leaves the payment to the other duplicate checks.
--
-- `referenceKey` in the pipeline refuses IBAN-shaped values regardless; that
-- guard covers every template, including ones not yet written. This migration
-- fixes the template that is actually wrong.
-- ============================================================================

update public.parser_templates
set field_patterns = jsonb_set(
      field_patterns,
      '{reference}',
      '["RAAST\\s*PYMT\\s*(\\d{6,})"]'::jsonb
    )
where user_id is null
  and bank_key = 'email'
  and label = 'Email — Meezan received'
  and field_patterns->>'reference' like '%[A-Z0-9]%';
