-- Record WHICH Shopify customer sent a Product Request Form submission.
--
-- Needed because that form takes a logo upload, and an uploaded file must have a
-- verifiable owner. The identity is HMAC-signed by the theme and verified by
-- app/features/logo-upload/server/customer-identity.server.js — these columns
-- store the result, never the raw claim from the browser.
--
-- Both nullable, and they stay null for:
--   * every existing row (the two legacy forms never collected this),
--   * every logged-out submission of the new form, which is the common case —
--     the file input is disabled when logged out, so most submissions have no
--     customer and no file.
--
-- Deliberately NOT reusing the existing `email` column: that one is free text the
-- shopper typed into the form and is contact information. `customer_email` is
-- the address on the Shopify account, and only ever written after the signature
-- verifies. Conflating them would make a typed address look like proof of
-- identity.
--
-- ADDITIVE ONLY: two new nullable columns. No existing row changes, no default
-- is written, no rewrite. Neither legacy route selects columns by name
-- (`insertFormSubmission` writes a fixed list, the admin does `select *`), so
-- nothing that runs today is affected.
--
-- Run with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

alter table public.form_submissions
  add column if not exists customer_gid text;

alter table public.form_submissions
  add column if not exists customer_email text;

-- "Everything this customer has ever asked us to quote." Partial, because the
-- column is null on every legacy row and on every logged-out submission — there
-- is no point indexing those.
create index if not exists form_submissions_customer_gid_idx
  on public.form_submissions (shop, customer_gid)
  where customer_gid is not null;
