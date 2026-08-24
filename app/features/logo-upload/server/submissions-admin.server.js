import { getSql, TABLES } from "./db.server.js";
import { FORM_SUBMISSIONS_TABLE } from "../../../lib/supabase.server.js";

/**
 * Delete support for `form_submissions`, used by the Form Submissions admin page
 * to clear test data.
 *
 * SERVER ONLY.
 *
 * ---------------------------------------------------------------------------
 * Why this lives here rather than in app/lib/supabase.server.js
 * ---------------------------------------------------------------------------
 * That file is frozen (docs/logo-upload/baseline.sha256) — `insertFormSubmission`
 * runs on every live storefront submission. Adding a delete to it would put the
 * live write path into the diff of a test-data cleanup feature, which is exactly
 * what the freeze exists to prevent.
 *
 * So we IMPORT the table name and the connection from it and add nothing. Same
 * pool, same config, no second connection — see db.server.js.
 *
 * Note this module reaches across the feature boundary: `form_submissions` is
 * not a logo_upload_ table. It sits here because it is admin-only delete
 * tooling that ships with this feature and can be removed with it.
 */

/**
 * Read the fields the delete flow needs: what to show in the confirm dialog, and
 * what file to clean up.
 *
 * Shop-scoped so one store cannot address another store's row by guessing a
 * uuid.
 *
 * @returns {Promise<object|null>} null when not found or the id is malformed.
 */
export async function getSubmissionForDelete(id, shop) {
  if (!id || !shop) return null;
  const sql = getSql();
  try {
    const [row] = await sql`
      select id, email, media_url, media_name, form_type
      from ${sql(FORM_SUBMISSIONS_TABLE)}
      where id = ${id} and shop = ${shop}
      limit 1
    `;
    return row ?? null;
  } catch (err) {
    // A malformed uuid is Postgres 22P02, not a server fault — treat it as "not
    // found" rather than letting it 500 the admin page.
    console.error(
      "[logo-upload] getSubmissionForDelete failed:",
      err?.message ?? err,
    );
    return null;
  }
}

/**
 * Is this file URL referenced anywhere else in the same shop?
 *
 * Checked across BOTH tables that record a Shopify Files URL — another
 * submission, or a product-page logo upload. The two uploaders run
 * independently and would normally produce distinct files, but "normally" is not
 * a guarantee worth deleting a customer's artwork on.
 *
 * The row being deleted must be excluded, or it counts itself and nothing is
 * ever removable. Which id to exclude depends on which table the caller is
 * deleting from, hence two separate options rather than one — passing an upload
 * id as a submission id would silently exclude nothing.
 *
 * Fails CLOSED. If the check itself errors we report the file as shared, so it
 * survives. An orphaned file costs storage; a wrongly deleted one costs a
 * customer their order artwork.
 *
 * @param {string} url
 * @param {string} shop
 * @param {object} [except]
 * @param {string} [except.submissionId] Row being deleted from form_submissions.
 * @param {string} [except.uploadId]     Row being deleted from the files table.
 * @returns {Promise<boolean>} true when something else still points at it.
 */
export async function isMediaSharedElsewhere(url, shop, except = {}) {
  if (!url || !shop) return false;
  const sql = getSql();

  // postgres.js needs a real value to compare against; `id <> null` is null, not
  // true, which would drop every row and always report "not shared". A uuid that
  // cannot exist keeps the comparison honest when there is nothing to exclude.
  const NO_MATCH = "00000000-0000-0000-0000-000000000000";
  const exceptSubmission = except.submissionId ?? NO_MATCH;
  const exceptUpload = except.uploadId ?? NO_MATCH;

  try {
    const [submissions] = await sql`
      select count(*)::int as count
      from ${sql(FORM_SUBMISSIONS_TABLE)}
      where shop = ${shop}
        and media_url = ${url}
        and id <> ${exceptSubmission}
    `;
    if ((submissions?.count ?? 0) > 0) return true;

    const [uploads] = await sql`
      select count(*)::int as count
      from ${sql(TABLES.files)}
      where shop = ${shop}
        and file_url = ${url}
        and id <> ${exceptUpload}
    `;
    return (uploads?.count ?? 0) > 0;
  } catch (err) {
    console.error(
      "[logo-upload] shared-media check failed, keeping the file:",
      err?.message ?? err,
    );
    return true;
  }
}

/**
 * Delete one submission row.
 *
 * Hard delete, shop-scoped in the WHERE clause. Throws on failure — the admin is
 * waiting on the result and must not be told a delete succeeded when it did not.
 *
 * @returns {Promise<boolean>} false when nothing matched (already deleted).
 */
export async function deleteFormSubmissionRow(id, shop) {
  if (!id || !shop) return false;
  const sql = getSql();
  const deleted = await sql`
    delete from ${sql(FORM_SUBMISSIONS_TABLE)}
    where id = ${id} and shop = ${shop}
    returning id
  `;
  return deleted.length > 0;
}
