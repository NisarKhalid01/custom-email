-- Logo upload (3/3): the customer's uploaded logo files.
--
-- This table is the actual point of feature F1. Today /api/upload pushes the
-- file to Shopify Files, returns a URL and forgets it -- there is no record
-- anywhere of WHO uploaded WHAT. "Record the upload against that customer"
-- therefore means a new table, not a new column.
--
-- One row per uploaded file. Named "customer_files" rather than
-- "customer_logo_uploads" to avoid stuttering against the logo_upload_ prefix.
--
-- Written only by /api/logo-upload/upload (TASKS.md A13), and only AFTER the
-- file has successfully landed in Shopify Files -- so a row here always
-- corresponds to a real file. Read by the admin Uploads page (A14).
--
-- Scope: uploader #1 only -- the product-page logo input (#fileInput). The
-- shipping form, the quote-request form and the App-Proxy "Upload 1/2" inputs
-- are out of scope and unaffected. See TASKS.md §0.4.
--
-- History starts empty. Nothing was ever recorded, so no backfill is possible
-- (plan §12 Q4).
--
-- NO FOREIGN KEYS -- deliberate, and true of all four logo_upload_ tables.
-- customer_gid points at a SHOPIFY customer, not a row in this database, so
-- there is nothing to reference. Every customer column is also NULLABLE. An
-- insert here can therefore never fail on a constraint: a missing, unknown or
-- deleted customer simply stores null. An upload must never be lost because
-- the identity was imperfect.
--
-- ADDITIVE ONLY: creates one new table. Touches nothing that exists.
-- Run with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

create table if not exists public.logo_upload_customer_files (
  id              uuid primary key default gen_random_uuid(),

  shop            text,

  -- ------------------------------------------------------------------
  -- Who  (all nullable -- see the NO FOREIGN KEYS note above)
  -- ------------------------------------------------------------------
  -- CANONICAL IDENTITY: 'gid://shopify/Customer/123', built in Liquid from
  -- customer.id. Populated ONLY from an HMAC signature the theme computed
  -- server-side, never from a raw browser field -- a forged value fails the
  -- signature check and is rejected with 401 before reaching this table, so a
  -- row here is a claim the server actually verified.
  --
  -- The GID, not the email, is the identity: it is permanent for the life of
  -- the customer record, whereas an email can be changed in the account.
  --
  -- Nullable by design: when require_login is OFF, anonymous uploads are legal
  -- and legitimately have no customer.
  customer_gid    text,

  -- DENORMALISED DISPLAY COPY -- not an identity. Never join or look up on
  -- this; use customer_gid.
  --
  -- Stored rather than fetched from Shopify at display time because the app's
  -- scopes are read_files,write_files -- there is no read_customers. Adding it
  -- would mean `shopify app deploy` + re-consent + resolving the client_id
  -- mismatch (TASKS.md B3), which is out of scope here.
  --
  -- Snapshot at upload time: if the customer later changes their address this
  -- value is intentionally NOT updated, because it records what was true then.
  customer_email  text,

  -- Whether F2 was satisfied for this specific upload. Kept per row rather than
  -- read from logo_upload_verified_customers at display time, because that
  -- table reflects TODAY's state -- this column records what was true at
  -- upload time.
  email_verified  boolean,

  -- How the identity above was established: 'liquid_hmac' when signature
  -- verified, null when the gate was off. Kept as a column, not inferred from
  -- customer_gid being non-null, so historic rows stay unambiguous if the
  -- mechanism is ever replaced (e.g. by an App Proxy).
  identity_source text,

  -- ------------------------------------------------------------------
  -- What was uploaded
  -- ------------------------------------------------------------------
  file_url        text,
  file_name       text,
  file_size       bigint,
  mime_type       text,
  shopify_file_id text,

  -- ------------------------------------------------------------------
  -- Where it came from
  -- ------------------------------------------------------------------
  product_id      text,
  product_handle  text,
  product_url     text,

  ip              text,

  created_at      timestamptz not null default now()
);

-- Admin list: newest first, per store.
create index if not exists logo_upload_customer_files_shop_created_idx
  on public.logo_upload_customer_files (shop, created_at desc);

-- "Everything this customer has ever uploaded" -- the question the feature
-- exists to answer. Keyed on the GID, so it keeps working across an email change.
create index if not exists logo_upload_customer_files_customer_idx
  on public.logo_upload_customer_files (shop, customer_gid);

alter table public.logo_upload_customer_files enable row level security;
