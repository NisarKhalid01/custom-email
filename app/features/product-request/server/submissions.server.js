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
