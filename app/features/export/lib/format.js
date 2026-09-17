/**
 * Value formatters that know nothing about any particular export.
 *
 * SHARED and PURE. Anything here must make sense for a future `export/logos/`
 * as much as for submissions; anything that needs to know what a `form_type` or
 * a `draft_order_id` is belongs in that export's own `lib/format.js`.
 */

/**
 * A timestamp as ISO 8601 in UTC — `2026-09-16T14:03:22Z`.
 *
 * NOT `toLocaleString()`. A locale string means something different to whoever
 * opens the file, and it sorts as text: "10/09" lands before "9/09". ISO sorts
 * correctly as a plain string and is unambiguous everywhere.
 */
export function formatDate(value) {
  if (value === null || value === undefined || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * An integer number of cents as money — `"8700"` → `$87.00`.
 *
 * Same logic as `formatCents` in `features/product-request/config/fields.js`,
 * which cannot be imported here: this file must stay subject-agnostic, and that
 * one is part of a specific form's config. Anything that is not a whole number
 * of cents comes back untouched, so a bad value shows as itself rather than as
 * `$NaN`.
 *
 * USD, matching the single storefront this app serves. The payload carries no
 * currency, so a second one would need the form to send it.
 */
export function formatCents(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return "";
  }
  const cents = parseInt(value, 10);
  if (!Number.isFinite(cents)) return String(value);
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Line endings, normalised to `\n`.
 *
 * DONE HERE, ONCE, AND NOT IN THE WRITERS. Live `comments` values contain CRLF,
 * and the two formats would otherwise disagree about them: the CSV writer has to
 * normalise (an un-normalised CRLF makes the file's own record separator
 * ambiguous) while XLSX has no such constraint and would keep the CR. The result
 * was a cell that read the same but compared differently — the exact drift D15
 * exists to prevent, caught by its check.
 *
 * `csv.js` still normalises defensively. A writer must not depend on its caller
 * having done this.
 */
function normaliseNewlines(text) {
  return text.replace(/\r\n?/g, "\n");
}

/**
 * One value or many, as one cell.
 *
 * `logo_colors` arrives as a STRING when the shopper ticked one colour and an
 * ARRAY when they ticked several — both shapes exist in live rows. Joining with
 * `; ` rather than `, ` keeps it readable in a CSV, where the reader's eye is
 * already using commas to find the column boundaries.
 */
export function formatList(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return normaliseNewlines(
      value.filter((v) => v !== null && v !== undefined && v !== "").join("; "),
    );
  }
  return normaliseNewlines(String(value));
}

/** Plain text, with `null` / `undefined` as an empty cell rather than "null". */
export function formatText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return formatList(value);
  return normaliseNewlines(String(value));
}

/** True for values that should not occupy a cell at all. */
export function isBlank(value) {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return String(value).trim() === "";
}
