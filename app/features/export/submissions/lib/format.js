/**
 * Formatters that know what a form submission is.
 *
 * PURE and isomorphic — no server imports. The generic ones (dates, cents,
 * lists) live one level up in `export/lib/format.js`; these three exist because
 * they encode facts about THIS data that were established by reading the live
 * table, not by reading the schema.
 */

/** `form_type` -> the label the admin already shows. Keep in step with app._index.jsx. */
export const FORM_LABELS = {
  shipping_form: "Shipping Info",
  request_quote: "Quote Request",
  request_quote_new: "Request Quote New",
};

/** What `Attachment URL` says when a name was recorded but no file was stored. */
export const UPLOAD_FAILED_NOTE = "Upload failed — emailed only";

/**
 * `email_status` -> something a human reads.
 *
 * The column is the STRING "true" / "false", not a boolean — both admin pages
 * test `email_status === "true"` and both are frozen, so the convention is
 * fixed. `pending` is what `insertSubmission()` writes before the send is
 * attempted; a row still saying that means the process died mid-request, which
 * is worth showing as itself rather than flattening into "Failed".
 */
export function formatEmailStatus(value) {
  if (value === "true") return "Sent";
  if (value === "pending") return "Pending";
  if (value === null || value === undefined || value === "") return "";
  return "Failed";
}

/**
 * Where WE are with this request — no Shopify call involved.
 *
 * Exactly the rule the list page's badge uses, so the export and the screen can
 * never disagree: an order wins over a draft, a draft wins over nothing.
 *
 * Blank, not "Not started", for the two legacy forms. Neither records a priced
 * variant, so neither can raise a draft order at all — printing a status for
 * them would imply someone had failed to action something actionable.
 */
export function formatOrderStatus(row) {
  if (row.form_type !== "request_quote_new") return "";
  if (row.order_id) return "Order completed";
  if (row.draft_order_id) return "Draft created";
  return "Not started";
}

/**
 * The attachment's file name.
 *
 * `media_name` is the record. `payload.attachment` is only the BROWSER's
 * description of the upload and is not trustworthy: live rows carry
 * `{name: "", size: 0, type: "application/octet-stream"}`, i.e. an attachment
 * object for a file that was never chosen. It is used as a fallback only when
 * it actually holds a name.
 */
export function formatAttachmentName(row, payload) {
  if (row.media_name) return String(row.media_name);
  const fromPayload = payload?.attachment?.name;
  return fromPayload ? String(fromPayload) : "";
}

/**
 * The attachment's URL — or an explanation of why there isn't one.
 *
 * ONE live row has a `media_name` and no `media_url`. Both legacy routes treat
 * `uploadToShopifyFiles()` as non-fatal and store the name regardless, so that
 * file went out as an email attachment and was never kept.
 *
 * A blank cell there would read as "no attachment". The truth is "there was one
 * and we do not have it", which is the difference between a salesperson moving
 * on and a salesperson asking the customer to resend.
 */
export function formatAttachmentUrl(row, payload) {
  if (row.media_url) return String(row.media_url);
  return formatAttachmentName(row, payload) ? UPLOAD_FAILED_NOTE : "";
}
