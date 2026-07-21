-- Storefront form submissions (both quote/shipping forms in one table).
--
-- form_type distinguishes the two storefront forms:
--   'shipping_form'  -> #shipping-form  / api/save-shipping-info (JSON)
--   'request_quote'  -> #shipping-form2 / api/save-shipping     (multipart + attachment)
--
-- Common/listing fields are real columns; the full per-form field set is kept
-- in `payload` (jsonb) so either form renders on the admin detail page without
-- a schema change.
--
-- Run with the Supabase CLI (`supabase db push`) or paste into the
-- Supabase SQL editor.

create table if not exists public.form_submissions (
  id             uuid primary key default gen_random_uuid(),
  form_type      text not null check (form_type in ('shipping_form', 'request_quote')),

  -- Which store this submission belongs to (permanent .myshopify.com domain).
  -- Matches the embedded admin's session.shop, so listings scope per store.
  shop           text,

  -- Listing columns
  email          text,
  phone          text,
  company        text,
  name           text,

  -- Which product page the form was submitted from
  product_url    text,
  product_handle text,
  product_title  text,

  -- Attachment reference (uploaded to Shopify Files)
  media_url      text,
  media_name     text,

  email_status   text,
  payload        jsonb,

  created_at     timestamptz not null default now()
);

create index if not exists form_submissions_form_type_idx  on public.form_submissions (form_type);
create index if not exists form_submissions_created_at_idx  on public.form_submissions (created_at desc);
create index if not exists form_submissions_shop_idx        on public.form_submissions (shop);

-- The app connects with the service_role key (server-side only), which bypasses
-- RLS. Enable RLS with no public policies so that the anon/public key cannot
-- read or write this table if it is ever used from the browser.
alter table public.form_submissions enable row level security;
