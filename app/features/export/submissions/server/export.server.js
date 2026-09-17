import { toCsv, CSV_CONTENT_TYPE } from "../../lib/csv.js";
import { toXlsx, XLSX_CONTENT_TYPE } from "../../lib/xlsx.js";
import { columnsFor, headersFor, rowToCells } from "../config/columns.js";
import { FORM_LABELS } from "../lib/format.js";

/**
 * Turn rows into a downloadable file. SERVER ONLY.
 *
 * ---------------------------------------------------------------------------
 * THE MAPPING RUNS ONCE, THE FORMAT ONLY CHOOSES A WRITER
 * ---------------------------------------------------------------------------
 * `rowToCells()` produces format-neutral `{ value, href }` cells, and both
 * writers consume exactly that. `format` picks which one runs and nothing else.
 *
 * This is what makes the guarantee in the plan (D15) structural rather than a
 * promise: the two files cannot have different columns, because only one piece
 * of code decides what the columns are.
 */

/** The only formats that exist. Anything else is rejected, not coerced. */
export const FORMATS = {
  csv: { extension: "csv", contentType: CSV_CONTENT_TYPE },
  xlsx: { extension: "xlsx", contentType: XLSX_CONTENT_TYPE },
};

export const DEFAULT_FORMAT = "csv";

/**
 * Normalise a format from the query string.
 *
 * Allowlist, not sanitisation. The value reaches a filename and a Content-Type
 * header, and "clean the string" is how something eventually gets through.
 */
export function resolveFormat(value) {
  const wanted = String(value ?? "").toLowerCase();
  return Object.hasOwn(FORMATS, wanted) ? wanted : DEFAULT_FORMAT;
}

/** `all` -> `all`; a form_type -> a short readable slug for the filename. */
function formSlug(formType) {
  if (!formType || formType === "all") return "all";
  return String(formType).replace(/_/g, "-");
}

/** The sheet name inside an .xlsx. Excel caps these at 31 characters. */
function sheetName(formType) {
  return formType && formType !== "all"
    ? FORM_LABELS[formType] || "Submissions"
    : "All forms";
}

/**
 * Build the file.
 *
 * @param {object[]} rows
 * @param {object}   options
 * @param {string}   options.formType       a form_type, or "all"
 * @param {string}   options.format         "csv" | "xlsx" (already resolved)
 * @param {object}   [options.orderStatuses] from fetchOrderStatuses(); may be {}
 * @param {Date}     [options.now]          injectable, so the filename is testable
 * @returns {Promise<{filename: string, contentType: string, body: string|Buffer, rowCount: number}>}
 */
export async function buildExport(
  rows,
  { formType = "all", format = DEFAULT_FORMAT, orderStatuses = {}, now = new Date() } = {},
) {
  const columns = columnsFor(formType);
  const headers = headersFor(columns);
  const ctx = { orderStatuses };
  const cells = rows.map((row) => rowToCells(columns, row, ctx));

  const chosen = FORMATS[format] ?? FORMATS[DEFAULT_FORMAT];
  // Dated, so two downloads in one day do not silently overwrite each other in
  // the Downloads folder.
  const date = now.toISOString().slice(0, 10);
  const filename = `form-submissions-${formSlug(formType)}-${date}.${chosen.extension}`;

  const body =
    format === "xlsx"
      ? await toXlsx(headers, cells, { sheetName: sheetName(formType) })
      : toCsv(headers, cells);

  return { filename, contentType: chosen.contentType, body, rowCount: rows.length };
}
