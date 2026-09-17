import { getSql, FORM_SUBMISSIONS_TABLE } from "./db.server.js";

/**
 * The read behind the export. SERVER ONLY.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS RATHER THAN REUSING listFormSubmissions()
 * ---------------------------------------------------------------------------
 * The list page loads every row for the shop and then filters in the browser.
 * The export cannot borrow that: it must return what the merchant asked for
 * whether or not a page happened to load it, and the page's unbounded load is
 * the first thing that will change when the list gets server-side pagination.
 *
 * So the filters are re-applied HERE, in SQL, over the same six fields the UI
 * searches — see the note on `search` below.
 */

/**
 * Hard ceiling on one export.
 *
 * The whole file is assembled in memory inside a serverless function, and the
 * XLSX path builds a workbook object before writing a single byte. 75 rows today;
 * this is what stops a future 50,000-row store turning a download into an
 * out-of-memory crash. Raising it is not the fix — streaming is.
 */
export const MAX_EXPORT_ROWS = 10000;

/**
 * Escape a user's search term for LIKE.
 *
 * Not a SQL-injection concern — the term is a bound parameter either way. This
 * is about WILDCARD semantics: without it, a shopper's company name containing
 * `%` would match every row, and `_` would match any character. The backslash
 * must be escaped first or it would escape the escapes.
 */
function likePattern(term) {
  const escaped = term.replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}

/**
 * Rows for one export, newest first.
 *
 * SHOP-SCOPED, and that is not negotiable: without the predicate one store could
 * export another store's submissions. Same rule as every other read in this app.
 *
 * `select *` deliberately. The column registry decides what is actually written,
 * and listing columns here as well would mean a column added to the table in
 * future is silently blank in the export until someone remembers this file too.
 *
 * @param {string} shop                 `session.shop`
 * @param {object} [options]
 * @param {string} [options.formType]   a form_type, or "all"
 * @param {string} [options.search]     the UI's search term
 * @returns {Promise<{rows: object[], truncated: boolean}>}
 */
export async function listForExport(shop, { formType = "all", search = "" } = {}) {
  if (!shop) return { rows: [], truncated: false };

  const sql = getSql();
  const term = String(search ?? "").trim();
  const scoped = formType && formType !== "all";
  const pattern = likePattern(term);

  // The same six fields the page's search box matches on. Written out rather
  // than generated from a list: a bound parameter per column is what keeps this
  // parameterised, and building the OR from strings would mean `sql.unsafe`.
  // `ilike` is the SQL equivalent of the UI's `toLowerCase().includes()`.
  const matchesSearch = term
    ? sql`and (
        coalesce(email, '')          ilike ${pattern} escape '\\'
        or coalesce(phone, '')          ilike ${pattern} escape '\\'
        or coalesce(company, '')        ilike ${pattern} escape '\\'
        or coalesce(name, '')           ilike ${pattern} escape '\\'
        or coalesce(product_handle, '') ilike ${pattern} escape '\\'
        or coalesce(product_title, '')  ilike ${pattern} escape '\\'
      )`
    : sql``;

  // One row over the cap, so truncation is detectable without a second COUNT.
  const rows = await sql`
    select *
    from ${sql(FORM_SUBMISSIONS_TABLE)}
    where shop = ${shop}
    ${scoped ? sql`and form_type = ${formType}` : sql``}
    ${matchesSearch}
    order by created_at desc
    limit ${MAX_EXPORT_ROWS + 1}
  `;

  const truncated = rows.length > MAX_EXPORT_ROWS;
  if (truncated) {
    console.warn(
      `[export] ${shop} asked for more than ${MAX_EXPORT_ROWS} rows; truncated. ` +
        `If this is routine, the answer is streaming, not a bigger cap.`,
    );
  }

  return { rows: truncated ? rows.slice(0, MAX_EXPORT_ROWS) : rows, truncated };
}
