-- Allow the THIRD storefront form (Product Request Form) to be stored.
--
-- The form needs NO new columns: all ~40 of its fields live in `payload` (jsonb)
-- exactly like both existing forms. The only blocker is the form_type CHECK
-- constraint, which was written inline with the two original values and rejects
-- anything else (SQLSTATE 23514).
--
--   'shipping_form'     -> #shipping-form  / api/save-shipping-info (JSON)
--   'request_quote'     -> #shipping-form2 / api/save-shipping      (multipart)
--   'request_quote_new' -> #prf-modal      / api/product-request    (multipart)
--
-- Safe for production data. The new list is a SUPERSET of the old one, so every
-- existing row still satisfies the constraint: nothing is rewritten, no record
-- changes, and neither legacy route is affected. The re-validation scan takes an
-- ACCESS EXCLUSIVE lock, which is milliseconds on a table this size.
--
-- Run with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

begin;

-- Postgres auto-named the inline check `<table>_<column>_check`. `if exists`
-- keeps this re-runnable, but it also means a differently-named constraint would
-- be skipped silently and the ADD below would then fail as a duplicate rule.
-- Confirm the name first with:
--   select conname from pg_constraint
--   where conrelid = 'public.form_submissions'::regclass and contype = 'c';
alter table public.form_submissions
  drop constraint if exists form_submissions_form_type_check;

alter table public.form_submissions
  add constraint form_submissions_form_type_check
  check (form_type in ('shipping_form', 'request_quote', 'request_quote_new'));

commit;
