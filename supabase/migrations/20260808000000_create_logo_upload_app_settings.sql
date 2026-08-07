-- Logo upload (1/3): per-shop feature settings.
--
-- Backs the admin Settings page (TASKS.md A7) and the public settings endpoint
-- (A10). One row per store; the app merges it over the defaults in
-- app/features/logo-upload/config/defaults.js, so a missing row means
-- "everything off, behave exactly as before".
--
-- The only logo_upload_* table with NO customer data, hence no "customer" in
-- its name.
--
-- Why jsonb and not real columns: these are feature flags and copy strings that
-- will churn while the feature is tuned. A column per setting would mean a
-- migration every time the client changes a modal heading. Nothing here is ever
-- queried by value or joined on -- it is always read whole, by shop -- so jsonb
-- costs nothing and avoids a migration treadmill.
--
-- Every setting defaults to OFF/inert in code, NOT in this table. Inserting a
-- row is therefore never required for the store to work.
--
-- ADDITIVE ONLY: creates one new table. Touches nothing that exists.
-- Run with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

create table if not exists public.logo_upload_app_settings (
  -- The store's permanent .myshopify.com domain. Same value as
  -- session.shop in the embedded admin and form_submissions.shop, so
  -- multi-store installs stay isolated.
  shop       text primary key,

  settings   jsonb       not null default '{}'::jsonb,

  updated_at timestamptz not null default now()
);

-- The app connects server-side with the service_role key, which bypasses RLS.
-- Enable RLS with no public policies so the anon/public key cannot read or
-- write this table if it is ever exposed to the browser. Same convention as
-- public.form_submissions.
alter table public.logo_upload_app_settings enable row level security;
