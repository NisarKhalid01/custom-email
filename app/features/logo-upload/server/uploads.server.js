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
 * Turn a user's search box input into an ILIKE pattern.
 *
 * `%` and `_` are wildcards and `\` is the default escape character, so all
 * three must be escaped — otherwise a shopper email containing an underscore
 * would match far more rows than the admin typed, and a lone `%` would match
 * everything.
 *
 * @param {string} q
 * @returns {string|null} null when there is nothing to search for.
 */
function likePattern(q) {
  const trimmed = String(q ?? "").trim();
  if (!trimmed) return null;
  return `%${trimmed.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * The columns the admin search box looks at.
 *
 * Deliberately the same set the table renders — an admin searching for
 * something they can see on screen should find it, and nothing else is
 * discoverable enough to be worth the extra scan cost.
 */
function searchClause(sql, pattern) {
  return sql`and (
    customer_email ilike ${pattern}
    or file_name ilike ${pattern}
    or product_handle ilike ${pattern}
    or customer_gid ilike ${pattern}
  )`;
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
 * @param {string} [opts.search] Free-text filter over customer/file/product.
 */
export async function listLogoUploads(shop, opts = {}) {
  if (!shop) return [];

  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(opts.limit) || DEFAULT_LIMIT));
  const offset = Math.max(0, Number(opts.offset) || 0);
  const sql = getSql();
  const pattern = likePattern(opts.search);

  // Two separate queries rather than one with a conditional fragment: the
  // customer filter hits a different index (shop, customer_gid) than the default
  // listing (shop, created_at desc), and keeping them apart makes that legible.
  if (opts.customerGid) {
    return sql`
      select * from ${sql(TABLES.files)}
      where shop = ${shop} and customer_gid = ${opts.customerGid}
      ${pattern ? searchClause(sql, pattern) : sql``}
      order by created_at desc
      limit ${limit} offset ${offset}
    `;
  }

  return sql`
    select * from ${sql(TABLES.files)}
    where shop = ${shop}
    ${pattern ? searchClause(sql, pattern) : sql``}
    order by created_at desc
    limit ${limit} offset ${offset}
  `;
}

/**
 * Total rows for a shop, for pagination.
 *
 * Takes the same `search` as `listLogoUploads` so the pager counts the filtered
 * set — otherwise a search that matches three rows would still offer page 2.
 *
 * @param {string} shop
 * @param {object} [opts]
 * @param {string} [opts.search]
 * @returns {Promise<number>}
 */
export async function countLogoUploads(shop, opts = {}) {
  if (!shop) return 0;
  const sql = getSql();
  const pattern = likePattern(opts.search);
  const [row] = await sql`
    select count(*)::int as count from ${sql(TABLES.files)}
    where shop = ${shop}
    ${pattern ? searchClause(sql, pattern) : sql``}
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

/**
 * Is this Shopify file referenced by any OTHER upload row in the same shop?
 *
 * Guards the delete path. A file is normally one-to-one with a row, but nothing
 * enforces that, and Shopify will happily hand back the same file if the same
 * bytes were registered twice. Deleting the file for row A when row B still
 * points at it would silently break B's download link — and B may be real
 * customer artwork, not test data.
 *
 * @param {string} shopifyFileId
 * @param {string} shop
 * @param {string} exceptId  The row being deleted.
 * @returns {Promise<boolean>} true when someone else still needs the file.
 */
export async function isFileSharedByOtherUploads(shopifyFileId, shop, exceptId) {
  if (!shopifyFileId || !shop) return false;
  const sql = getSql();
  try {
    const [row] = await sql`
      select count(*)::int as count from ${sql(TABLES.files)}
      where shop = ${shop}
        and shopify_file_id = ${shopifyFileId}
        and id <> ${exceptId}
    `;
    return (row?.count ?? 0) > 0;
  } catch (err) {
    // Fail CLOSED: if we cannot prove the file is unshared, keep it. An orphaned
    // file is tidy-up; a deleted file another row depends on is data loss.
    console.error(
      "[logo-upload] shared-file check failed, keeping the file:",
      err?.message ?? err,
    );
    return true;
  }
}

/**
 * Delete one upload row.
 *
 * Hard delete — there is no soft-delete column on this table and the feature
 * exists to clear test data, so a tombstone would just be clutter.
 *
 * Scoped to the shop in the WHERE clause, not checked beforehand, so there is no
 * window between the check and the delete and no way to remove another store's
 * row by guessing a uuid.
 *
 * Unlike `insertLogoUpload`, this DOES throw: the admin pressed a button and is
 * waiting for an answer, so a failure must surface rather than silently report
 * success.
 *
 * @returns {Promise<boolean>} false when nothing matched (already deleted).
 */
export async function deleteLogoUpload(id, shop) {
  if (!id || !shop) return false;
  const sql = getSql();
  const deleted = await sql`
    delete from ${sql(TABLES.files)}
    where id = ${id} and shop = ${shop}
    returning id
  `;
  return deleted.length > 0;
}
