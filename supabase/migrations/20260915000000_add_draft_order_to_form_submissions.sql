-- Draft orders raised from Product Request Form submissions.
--
-- A submission is a quote request. Staff turn it into a Shopify DRAFT order from
-- the app's submissions list, then complete that draft into a real order in the
-- Shopify admin. These columns record both ends of that journey so the list can
-- show, per row: "Create Draft Order" -> "Draft Created" -> "Order Completed".
--
-- WHY IDs *AND* NAMES. The id is the durable handle (deep links, API lookups);
-- the name is what a human recognises ("#D123", "#1001") and what the admin
-- list prints. Storing only the id would mean an API round trip just to render a
-- label; storing only the name would leave nothing to link to. Shopify treats
-- the name as display text and it can change, so the id stays authoritative.
--
-- All nullable, and null is the normal state:
--   * every existing row predates this feature,
--   * both legacy forms never raise draft orders at all,
--   * a submission that no one has actioned yet has neither.
--
-- No columns for the resolved variant (`variant_gid` and friends). Those arrive
-- inside `payload` and the draft-order action reads ONE ROW BY ID, so an index
-- would buy nothing. See PLAN-draft-orders.md Phase 1.1.
--
-- ADDITIVE ONLY: five new nullable columns and one partial index. No existing
-- row changes, nothing is rewritten, and neither legacy route selects columns by
-- name (`insertFormSubmission` writes a fixed list, the admin does `select *`),
-- so nothing that runs today is affected.
--
-- Run with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

alter table public.form_submissions
  add column if not exists draft_order_id text;

alter table public.form_submissions
  add column if not exists draft_order_name text;

alter table public.form_submissions
  add column if not exists order_id text;

alter table public.form_submissions
  add column if not exists order_name text;

alter table public.form_submissions
  add column if not exists draft_order_created_at timestamptz;

-- Two jobs, one index:
--   1. the idempotency guard's `where id = ... and draft_order_id is null`,
--   2. Phase 4's "which drafts are still open" sweep, which reads the rows that
--      have a draft but no order yet.
-- Partial because the column is null on every legacy row and every un-actioned
-- submission — there is no point indexing those.
create index if not exists form_submissions_draft_order_idx
  on public.form_submissions (shop, draft_order_id)
  where draft_order_id is not null;
