-- Store the Shopify product ID so the admin can deep-link straight to the
-- product's edit page (admin.shopify.com/store/<store>/products/<product_id>).
-- Records without a product_id fall back to a handle-filtered admin search.
--
-- Run with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

alter table public.form_submissions
  add column if not exists product_id text;
