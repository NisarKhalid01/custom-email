-- Logo upload (2/3): customers, and the codes sent to them.
--
-- Two tables, both holding customer detail:
--   logo_upload_customers           -- one row per customer      (long-lived)
--   logo_upload_email_verifications -- one row per 6-digit code  (minutes)
--
-- IDENTITY MODEL (revised 2026-08-08 -- see TASKS.md A1)
-- The canonical identity is the Shopify customer GID, NOT the email address.
--   * The GID is permanent for the life of the customer record.
--   * The email is mutable -- a customer who updates their address in their
--     account is still the same customer, and must not be forced to re-verify.
--   * When the gate is ON, login is mandatory (plan §4.1) and the email is
--     forced to the HMAC-signed customer.email (plan §4.2), so the email is
--     DERIVED from the customer rather than independent of them.
-- Email remains as a fallback key for the one combination where there is no
-- customer at all: require_login = false AND require_email_verification = true.
--
-- NO FOREIGN KEYS, and every customer_gid is NULLABLE -- see the note in
-- 20260808000200_create_logo_upload_customer_files.sql.
--
-- ADDITIVE ONLY: creates two new tables. Touches nothing that exists.
-- Run with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

-- ---------------------------------------------------------------------------
-- Customers  (long-lived)
-- ---------------------------------------------------------------------------
-- One row per customer known to this feature. Today the only thing tracked is
-- verification state; the table is named for the subject rather than the state
-- so that future per-customer data has an obvious home.
--
-- HOW "IS THIS CUSTOMER CURRENTLY VERIFIED?" IS ANSWERED -- read this before
-- writing any query against this table. It is TWO conditions, never one:
--
--     verified = true
--       AND verified_at > now() - (settings.verification_validity_days || ' days')::interval
--
--   * `verified` is the STORED FACT -- they completed the code flow, and an
--     admin has not revoked it.
--   * `verified_at` drives the EXPIRY WINDOW, which is computed at read time
--     from the current setting. That is why the window is not stored: changing
--     verification_validity_days in the admin then applies to everyone
--     immediately, with no backfill and no rewrite of these rows.
--
-- Checking only `verified` silently ignores expiry. Checking only `verified_at`
-- silently ignores revocation. Both are bugs. The rule lives in exactly one
-- place in code: app/features/logo-upload/server/email-verification.server.js
-- (`isCustomerVerified()`); do not re-implement it inline.
--
-- Why `verified` exists at all, given it looks derivable from `verified_at`:
-- it is the REVOCATION switch. Without it, forcing a customer to re-verify
-- means deleting their row or corrupting a timestamp. With it, an admin (or a
-- future support action) sets verified = false and the next upload re-runs the
-- code flow. The CHECK below stops the two columns drifting apart.
create table if not exists public.logo_upload_customers (
  id           uuid primary key default gen_random_uuid(),

  shop         text not null,

  -- PRIMARY identity. Looked up FIRST. Survives an email change.
  customer_gid text,

  -- FALLBACK identity, used only when customer_gid is null (logged-out
  -- verification). Also kept alongside a GID for admin display.
  email        text,

  -- Stored fact + revocation switch. See the long note above.
  verified     boolean not null default false,

  -- When verification was completed. Null while verified = false.
  verified_at  timestamptz,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- At least one identity must be present, or the row means nothing.
  constraint logo_upload_customers_identity_present
    check (customer_gid is not null or email is not null),

  -- Keeps the two verification columns honest in both directions:
  --   verified = true  requires a verified_at
  --   verified = false requires verified_at to be null
  -- Without this, a revoked row could keep a stale timestamp and a query that
  -- (wrongly) checked only verified_at would still let them through.
  constraint logo_upload_customers_verified_consistent
    check (
      (verified = true  and verified_at is not null)
      or
      (verified = false and verified_at is null)
    )
);

-- One row per customer per shop. Partial, so the many logged-out rows (which
-- have a null GID) do not collide with each other.
create unique index if not exists logo_upload_customers_gid_key
  on public.logo_upload_customers (shop, customer_gid)
  where customer_gid is not null;

-- One row per email per shop, but ONLY for rows with no customer. A logged-in
-- customer is keyed by GID above; without the WHERE clause, one customer
-- before and after logging in would collide here.
create unique index if not exists logo_upload_customers_email_key
  on public.logo_upload_customers (shop, email)
  where customer_gid is null and email is not null;

alter table public.logo_upload_customers enable row level security;

-- ---------------------------------------------------------------------------
-- Issued codes  (transient: minutes)
-- ---------------------------------------------------------------------------
create table if not exists public.logo_upload_email_verifications (
  id           uuid primary key default gen_random_uuid(),

  shop         text not null,

  -- The address the code is sent to. This table is the ONE place a plaintext
  -- email is unavoidable -- we cannot email a hash. Mitigated by lifetime:
  -- these rows expire in ~10 minutes and are the shortest-lived data we hold.
  email        text not null,

  -- 'gid://shopify/Customer/123'. Null only when the visitor is logged out.
  -- When present, the app forces `email` to the signed customer.email and
  -- rejects a mismatch with 403 email_mismatch -- so one customer can never
  -- verify someone else's address.
  customer_gid text,

  -- NEVER the code itself. HMAC-SHA256, so a database leak does not hand over
  -- live codes and the plaintext exists only in the email that was sent.
  code_hash    text not null,

  -- Wrong guesses so far. At the cap (default 5) the row is burned rather than
  -- the account locked -- 6 digits is only 10^6, so an uncapped endpoint is a
  -- few minutes of brute force.
  attempts     int  not null default 0,

  expires_at   timestamptz not null,

  -- Set the moment a code is accepted. Enforces single use: a correct code
  -- replayed after success must fail, or an intercepted code stays valid for
  -- its whole TTL.
  consumed_at  timestamptz,

  -- Also the per-IP rate-limit key. See the note on the indexes below.
  ip           text,

  created_at   timestamptz not null default now()
);

-- Lookup: "the newest live code for this shop+email".
create index if not exists logo_upload_email_verif_lookup_idx
  on public.logo_upload_email_verifications (shop, email, created_at desc);

-- Rate limiting is derived from THIS table rather than a separate counters
-- table: a "code request" is exactly a row here, so the limits in the plan
-- (3 per email / 15 min, 10 per IP / hour) are two counting queries over these
-- two indexes. One less table, and the counter can never drift from reality.
create index if not exists logo_upload_email_verif_ip_idx
  on public.logo_upload_email_verifications (shop, ip, created_at desc);

-- Rows here are disposable once expired. Nothing prunes them yet; if the table
-- ever grows enough to matter, delete where expires_at < now() - interval '7 days'.
-- Left out of this migration deliberately: pg_cron is a separate concern and an
-- unattended DELETE job is not something to add silently.

alter table public.logo_upload_email_verifications enable row level security;
