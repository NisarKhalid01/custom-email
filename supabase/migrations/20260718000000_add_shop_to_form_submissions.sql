-- Multi-store scoping: record WHICH store each submission belongs to.
--
-- Without this, an app installed on multiple stores would mix everyone's
-- submissions and every store's admin would see all of them. `shop` is the
-- store's permanent .myshopify.com domain — the same value the embedded admin
-- gets from `session.shop`, so admin queries can filter on it.
--
-- Run with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

alter table public.form_submissions
  add column if not exists shop text;

create index if not exists form_submissions_shop_idx
  on public.form_submissions (shop);

-- Backfill existing rows: every submission so far came from the single live store.
update public.form_submissions
  set shop = 'logo-mat-central.myshopify.com'
  where shop is null;
