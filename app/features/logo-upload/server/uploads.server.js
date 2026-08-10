import { getSql, TABLES } from "./db.server.js";

/**
 * Read/write access to `logo_upload_customer_files` — the record of which
 * customer uploaded which logo.
 *
 * SERVER ONLY.
 *
 * Scope reminder: this table is written by uploader #1 only (the product-page
 * `#fileInput`). The shipping form, the quote-request form and the App-Proxy
 * "Upload 1/2" inputs never reach it — see TASKS.md §0.4.
 */

/**
 * Columns that may be written. Anything else in the incoming object is ignored.
 *
 * A whitelist rather than a spread, so a stray key from a request body can never
 * become a column reference. Same pattern as `app/lib/supabase.server.js`.
 */
const WRITABLE = [
  "shop",
  "customer_gid",
  "customer_email",
  "email_verified",
  "identity_source",
  "file_url",
  "file_name",
  "file_size",
  "mime_type",
  "shopify_file_id",
  "product_id",
  "product_handle",
  "product_url",
  "ip",
];

/** Admin list page size. Capped so a huge store cannot render 50k rows. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Record one uploaded logo.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ THIS DELIBERATELY DOES NOT THROW — read before changing it.
 * ---------------------------------------------------------------------------
 * It runs AFTER the file has already landed in Shopify Files and a CDN URL
 * exists. At that point the customer's upload has genuinely succeeded.
 *
 * If this insert fails and we rethrow, the route returns an error, the shopper
 * sees "upload failed", and they retry — creating a SECOND file in Shopify while
 * the first is orphaned. We would have broken a working upload to protect an
 * audit row.
 *
 * So a failure here is logged loudly and swallowed: the shopper's upload
 * completes, and we lose one audit record. The trade is deliberate — the
 * storefront's job is to sell, and the audit table is secondary to that.
 *
 * The cost, stated plainly: a database outage during uploads means missing rows
 * in the admin list, with no gap visible in the UI. The `[logo-upload] AUDIT
 * WRITE FAILED` log line is the only trace, which is why it is worded to be
 * greppable and alarming.
 *
 * @param {object} row Keys from WRITABLE. Unknown keys are dropped.
 * @returns {Promise<{id: string}|null>} null if the write failed.
 */
export async function insertLogoUpload(row) {
  const record = {};
  for (const col of WRITABLE) {
    if (row?.[col] !== undefined) record[col] = row[col];
  }

  if (!Object.keys(record).length) {
    console.error("[logo-upload] AUDIT WRITE FAILED: nothing writable in row");
    return null;
  }

  try {
    const sql = getSql();
    const [inserted] = await sql`
      insert into ${sql(TABLES.files)} ${sql(record)}
      returning id
    `;
    return inserted ?? null;
  } catch (err) {
    // Deliberately loud. This is the one place where a silent failure means
    // permanently lost data rather than a retry.
    console.error(
      "[logo-upload] AUDIT WRITE FAILED — the file uploaded successfully but was NOT recorded.",
      { shop: row?.shop, customer_gid: row?.customer_gid, file_url: row?.file_url },
      err?.message ?? err,
    );
    return null;
  }
}

/**
 * List a store's uploads, newest first.
 *
 * Always scoped to a shop, so one store's admin can never see another's — same
 * rule as `listFormSubmissions`.
 *
 * @param {string} shop
 * @param {object} [opts]
 * @param {number} [opts.limit]
 * @param {number} [opts.offset]
 * @param {string} [opts.customerGid] Filter to one customer.
 */
export async function listLogoUploads(shop, opts = {}) {
  if (!shop) return [];

  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(opts.limit) || DEFAULT_LIMIT));
  const offset = Math.max(0, Number(opts.offset) || 0);
  const sql = getSql();

  // Two separate queries rather than one with a conditional fragment: the
  // customer filter hits a different index (shop, customer_gid) than the default
  // listing (shop, created_at desc), and keeping them apart makes that legible.
  if (opts.customerGid) {
    return sql`
      select * from ${sql(TABLES.files)}
      where shop = ${shop} and customer_gid = ${opts.customerGid}
      order by created_at desc
      limit ${limit} offset ${offset}
    `;
  }

  return sql`
    select * from ${sql(TABLES.files)}
    where shop = ${shop}
    order by created_at desc
    limit ${limit} offset ${offset}
  `;
}

/**
 * Total rows for a shop, for pagination.
 *
 * @param {string} shop
 * @returns {Promise<number>}
 */
export async function countLogoUploads(shop) {
  if (!shop) return 0;
  const sql = getSql();
  const [row] = await sql`
    select count(*)::int as count from ${sql(TABLES.files)}
    where shop = ${shop}
  `;
  return row?.count ?? 0;
}

/**
 * Fetch one upload, scoped to the shop so a store cannot open another store's
 * record by guessing an id.
 *
 * @returns {Promise<object|null>}
 */
export async function getLogoUpload(id, shop) {
  if (!id || !shop) return null;
  const sql = getSql();
  try {
    const [row] = await sql`
      select * from ${sql(TABLES.files)}
      where id = ${id} and shop = ${shop}
      limit 1
    `;
    return row ?? null;
  } catch (err) {
    // An invalid uuid is a 22P02 from Postgres, not a server fault — a bad id in
    // the URL should render "not found", not a 500.
    console.error("[logo-upload] getLogoUpload failed:", err?.message ?? err);
    return null;
  }
}
