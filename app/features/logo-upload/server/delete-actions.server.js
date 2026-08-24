import { json } from "@remix-run/node";
import { authenticate } from "../../../shopify.server.js";
import {
  getLogoUpload,
  deleteLogoUpload,
  isFileSharedByOtherUploads,
} from "./uploads.server.js";
import {
  getSubmissionForDelete,
  deleteFormSubmissionRow,
  isMediaSharedElsewhere,
} from "./submissions-admin.server.js";
import {
  deleteShopifyFile,
  resolveShopifyFileId,
} from "./shopify-files-delete.server.js";

/**
 * The admin "delete this row" actions for both listing pages.
 *
 * SERVER ONLY.
 *
 * Whole-action functions rather than helpers, so the route files stay tiny —
 * `app/routes/app._index.jsx` is frozen (docs/logo-upload/baseline.sha256) and
 * every line added to it has to be justified at review. Its entire share of this
 * feature is an import and `export const action = deleteSubmissionAction`.
 *
 * ---------------------------------------------------------------------------
 * ORDER OF OPERATIONS — file first, then row. Do not swap these.
 * ---------------------------------------------------------------------------
 * Deleting the row first and then failing on the file loses the only record of
 * which file belonged to it: the id and URL are gone, so the orphan can never be
 * found again. Deleting the file first and then failing on the row leaves a
 * visible row the admin can simply click delete on again — and the retry is
 * safe, because Shopify reports the already-deleted file as "not found" and the
 * flow carries on to the row.
 *
 * Both are hard deletes. This exists to clear test data; neither table has a
 * soft-delete column and adding one would mean every read path in the feature
 * has to start filtering.
 */

/** Wording used in the UI for a file we deliberately did not delete. */
const KEPT_SHARED = "the file is still used by another record, so it was kept";
const KEPT_UNKNOWN =
  "the file could not be identified in Shopify Files, so it was left in place";

/**
 * Remove one logo upload: the Shopify file, then the row.
 *
 * The easy case of the two — `logo_upload_customer_files` stores
 * `shopify_file_id` at upload time, so there is an exact handle and no guessing.
 * The URL lookup is only a fallback for any row written before that column was
 * populated.
 */
export async function deleteUploadAction({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const form = await request.formData();
  if (form.get("intent") !== "delete") {
    return json({ ok: false, error: "Unsupported action." }, { status: 400 });
  }

  const id = String(form.get("id") || "");
  if (!id) {
    return json({ ok: false, error: "Missing upload id." }, { status: 400 });
  }

  // Shop-scoped read. Also confirms the row exists before anything destructive.
  const row = await getLogoUpload(id, shop);
  if (!row) {
    return json(
      { ok: false, error: "That upload no longer exists." },
      { status: 404 },
    );
  }

  // Two questions, both of which must be "no" before the file goes: does another
  // upload row carry the same Shopify file id, and does any row in either table
  // point at the same URL. A row written before `shopify_file_id` was populated
  // only answers the second, which is why the URL check is not optional.
  const fileNote = await removeFile({
    admin,
    fileId: row.shopify_file_id,
    url: row.file_url,
    isShared: async () =>
      (await isFileSharedByOtherUploads(row.shopify_file_id, shop, id)) ||
      (await isMediaSharedElsewhere(row.file_url, shop, { uploadId: id })),
  });

  try {
    const removed = await deleteLogoUpload(id, shop);
    if (!removed) {
      return json(
        { ok: false, error: "That upload no longer exists." },
        { status: 404 },
      );
    }
  } catch (err) {
    console.error("[logo-upload] delete upload failed:", err?.message ?? err);
    return json(
      { ok: false, error: `Could not delete the record: ${err.message}` },
      { status: 500 },
    );
  }

  return json({ ok: true, fileNote });
}

/**
 * Remove one form submission: the attachment, then the row.
 *
 * Harder than the upload case. `form_submissions` records `media_url` and
 * `media_name` but never a file id — `api.save-shipping.jsx` receives one from
 * `uploadToShopifyFiles()` and discards it. That route is frozen live code, so
 * rather than edit the storefront write path we resolve the id at delete time
 * from the URL, and accept that it sometimes cannot be proven.
 *
 * When it cannot be proven the row still goes and the file stays, and the UI says
 * so. See `resolveShopifyFileId` for why guessing is not an option.
 */
export async function deleteSubmissionAction({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const form = await request.formData();
  if (form.get("intent") !== "delete") {
    return json({ ok: false, error: "Unsupported action." }, { status: 400 });
  }

  const id = String(form.get("id") || "");
  if (!id) {
    return json({ ok: false, error: "Missing submission id." }, { status: 400 });
  }

  const row = await getSubmissionForDelete(id, shop);
  if (!row) {
    return json(
      { ok: false, error: "That submission no longer exists." },
      { status: 404 },
    );
  }

  const fileNote = await removeFile({
    admin,
    fileId: null, // never stored for this table — always resolved from the URL
    url: row.media_url,
    isShared: () =>
      isMediaSharedElsewhere(row.media_url, shop, { submissionId: id }),
  });

  try {
    const removed = await deleteFormSubmissionRow(id, shop);
    if (!removed) {
      return json(
        { ok: false, error: "That submission no longer exists." },
        { status: 404 },
      );
    }
  } catch (err) {
    console.error("[logo-upload] delete submission failed:", err?.message ?? err);
    return json(
      { ok: false, error: `Could not delete the record: ${err.message}` },
      { status: 500 },
    );
  }

  return json({ ok: true, fileNote });
}

/**
 * Best-effort removal of the stored file.
 *
 * Never throws and never blocks the row delete. A file that cannot be removed —
 * already deleted by hand, shared with another record, or not identifiable —
 * must not leave the admin unable to clear the row.
 *
 * @returns {string|null} A note for the UI, or null when the file is gone
 *                        cleanly (or there was never one).
 */
async function removeFile({ admin, fileId, url, isShared }) {
  if (!fileId && !url) return null; // nothing was ever attached

  // Checked before resolving as well as before deleting: if another record needs
  // the file there is no point spending an API call to look it up.
  if (await isShared()) return KEPT_SHARED;

  const resolvedId = fileId || (await resolveShopifyFileId(admin, url));
  if (!resolvedId) return KEPT_UNKNOWN;

  const { ok, reason } = await deleteShopifyFile(admin, resolvedId);
  if (ok) return null;

  // "Already gone" is the expected outcome when a test file was tidied up by
  // hand, and is not worth alarming anyone about.
  if (reason === "file not found in Shopify Files") return null;

  return `the record was deleted, but the file could not be removed (${reason})`;
}
