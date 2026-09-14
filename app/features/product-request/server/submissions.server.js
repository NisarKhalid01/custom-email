import { getSql, FORM_SUBMISSIONS_TABLE, FORM_TYPE } from "./db.server.js";

/**
 * Persistence for Product Request Form submissions.
 *
 * SERVER ONLY.
 *
 * Writes to the same `form_submissions` table as the two legacy forms, but
 * through its own code path — see the long note in db.server.js. The legacy
 * routes' own insert is untouched and unaware of this file.
 *
 * ---------------------------------------------------------------------------
 * INSERT FIRST, SEND SECOND
 * ---------------------------------------------------------------------------
 * `insertSubmission()` runs BEFORE any mail. Both legacy routes do the reverse —
 * their insert sits after `sendMail` inside the same try — so a Gmail failure
 * returns 500 and the submission is lost entirely: no email AND no record.
 * Here the row lands first with email_status 'pending', and
 * `setEmailStatus()` corrects it once the send has been attempted.
 */

/**
 * Fields that must never reach the stored `payload`.
 *
 * Two different reasons, both ending in "don't store it":
 *
 *   * The identity trio is a security artefact, not shopper data. `customer_sig`
 *     is a bare HMAC digest of no use to anyone reading a quote request, and the
 *     overrides are theme plumbing. The VERIFIED result is stored in the
 *     customer_gid / customer_email columns instead, so the raw claims are
 *     redundant as well as noisy.
 *   * `prf_website` is the honeypot. It is only ever non-empty for a bot, and
 *     those never get this far.
 *
 * This matters because app/routes/app.submissions.$id.jsx renders EVERY payload
 * key and is a frozen file — it cannot be taught to hide these. Stripping them
 * here is what keeps the existing admin detail page clean without touching it.
 */
const PAYLOAD_STRIP = new Set([
  "customer_sig",
  "login_override",
  "verification_override",
  "prf_website",
]);

function cleanPayload(data) {
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (PAYLOAD_STRIP.has(key)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Insert one submission and return its id.
 *
 * Throws on failure — deliberately. The caller decides whether a failed insert
 * should stop the request; swallowing it here is how a data-loss bug hides.
 *
 * @param {object}      row
 * @param {string|null} row.customerGid   Verified GID, or null when anonymous.
 * @param {string|null} row.customerEmail Verified account email, or null.
 * @param {object}      row.payload       Full form payload (stripped here).
 * @returns {Promise<string|null>} The new row's id.
 */
export async function insertSubmission({
  shop,
  email,
  phone,
  company,
  name,
  productUrl,
  productHandle,
  productId,
  productTitle,
  mediaUrl,
  mediaName,
  customerGid,
  customerEmail,
  payload,
}) {
  const sql = getSql();
  const [inserted] = await sql`
    insert into ${sql(FORM_SUBMISSIONS_TABLE)} ${sql({
      form_type: FORM_TYPE,
      shop: shop ?? null,
      email: email ?? null,
      phone: phone ?? null,
      company: company ?? null,
      name: name ?? null,
      product_url: productUrl ?? null,
      product_handle: productHandle ?? null,
      product_id: productId ?? null,
      product_title: productTitle ?? null,
      media_url: mediaUrl ?? null,
      media_name: mediaName ?? null,
      customer_gid: customerGid ?? null,
      customer_email: customerEmail ?? null,
      // Corrected by setEmailStatus() once the send has been attempted. The
      // admin renders anything other than the string "true" as a red Failed
      // badge, so a row that never gets updated reads as failed — which is the
      // truthful default if the process dies mid-request.
      email_status: "pending",
      payload: sql.json(cleanPayload(payload ?? {})),
    })}
    returning id
  `;
  return inserted?.id ?? null;
}

/**
 * Record how the mail attempt went.
 *
 * `status` is the STRING "true"/"false", not a boolean — app._index.jsx and
 * app.submissions.$id.jsx both test `email_status === "true"`, and both are
 * frozen files, so the convention is fixed.
 *
 * Not shop-scoped: the only caller passes an id it created moments earlier in
 * the same request, so there is no user-supplied id to defend against.
 */
export async function setEmailStatus(id, status) {
  if (!id) return;
  const sql = getSql();
  await sql`
    update ${sql(FORM_SUBMISSIONS_TABLE)}
    set email_status = ${status}
    where id = ${id}
  `;
}

/* ------------------------------------------------------------ draft orders */

/**
 * Read one submission for the draft-order flow.
 *
 * SHOP-SCOPED, unlike the reads above. This one takes an id straight from a
 * button in the admin UI, so it is user-supplied: without the shop predicate one
 * store could raise a draft order against another store's submission by
 * guessing a uuid. Same rule as `getSubmissionForDelete`.
 *
 * Returns null when not found, when the id is malformed, or when it belongs to
 * another shop — the caller cannot tell those apart, which is the point.
 *
 * @returns {Promise<object|null>}
 */
export async function getSubmissionForDraft(id, shop) {
  if (!id || !shop) return null;
  const sql = getSql();
  try {
    const [row] = await sql`
      select id, shop, form_type, email, name, phone, company,
             product_title, customer_gid, customer_email,
             draft_order_id, draft_order_name, order_id, order_name,
             payload
      from ${sql(FORM_SUBMISSIONS_TABLE)}
      where id = ${id} and shop = ${shop}
      limit 1
    `;
    return row ?? null;
  } catch (err) {
    // A malformed uuid is Postgres 22P02, not a server fault — treat it as "not
    // found" rather than letting it 500 the admin page.
    console.error(
      "[product-request] getSubmissionForDraft failed:",
      err?.message ?? err,
    );
    return null;
  }
}

/**
 * Attach a newly created draft order to a submission.
 *
 * ---------------------------------------------------------------------------
 * THIS IS THE IDEMPOTENCY GUARD — read before changing the WHERE clause
 * ---------------------------------------------------------------------------
 * `and draft_order_id is null` is what stops a double-clicked button attaching
 * a second draft order over the first. The route also checks the column BEFORE
 * calling Shopify; this is the check that actually holds, because the Shopify
 * mutation and this write are not in one transaction and two requests can
 * interleave between them.
 *
 * Returns false when it changed nothing, which means a draft order already
 * existed. The caller MUST treat that as "you have just created an orphan in
 * Shopify" and log the new gid — it is real, it is not recorded here, and the
 * logs are the only way back to it.
 *
 * @returns {Promise<boolean>} true if this call is the one that attached it.
 */
export async function attachDraftOrder(id, { draftOrderId, draftOrderName }) {
  if (!id || !draftOrderId) return false;
  const sql = getSql();
  const rows = await sql`
    update ${sql(FORM_SUBMISSIONS_TABLE)}
    set draft_order_id = ${draftOrderId},
        draft_order_name = ${draftOrderName ?? null},
        draft_order_created_at = now()
    where id = ${id} and draft_order_id is null
    returning id
  `;
  return rows.length > 0;
}

/**
 * Attach the order a draft was completed into.
 *
 * Written by the Phase 4 status sweep, not by a user action, so it is keyed on
 * the draft rather than on a submission id: the sweep knows which draft order
 * now has an order, and one draft belongs to exactly one submission.
 *
 * `and order_id is null` keeps it write-once for the same reason as above — and
 * because the sweep re-runs on every list load, so without it every page view
 * would rewrite the same value.
 *
 * @returns {Promise<boolean>} true if this call is the one that attached it.
 */
export async function attachOrder(draftOrderId, { orderId, orderName }) {
  if (!draftOrderId || !orderId) return false;
  const sql = getSql();
  const rows = await sql`
    update ${sql(FORM_SUBMISSIONS_TABLE)}
    set order_id = ${orderId},
        order_name = ${orderName ?? null}
    where draft_order_id = ${draftOrderId} and order_id is null
    returning id
  `;
  return rows.length > 0;
}

/**
 * The open drafts on a page of submissions: raised, but not yet completed.
 *
 * Phase 4 feeds these gids to one batched Shopify lookup. Shop-scoped, and
 * capped: the admin list pages at 20, so a caller asking for hundreds is a bug
 * rather than a big store.
 *
 * @returns {Promise<string[]>} draft order gids
 */
export async function listOpenDraftOrderIds(shop, limit = 50) {
  if (!shop) return [];
  const sql = getSql();
  const rows = await sql`
    select draft_order_id
    from ${sql(FORM_SUBMISSIONS_TABLE)}
    where shop = ${shop}
      and draft_order_id is not null
      and order_id is null
    order by draft_order_created_at desc nulls last
    limit ${limit}
  `;
  return rows.map((r) => r.draft_order_id);
}
