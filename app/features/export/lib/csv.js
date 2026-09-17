/**
 * CSV writer — RFC 4180, hardened.
 *
 * SHARED across every export in this folder. PURE: no imports, no I/O, and no
 * knowledge of what a submission is. Do not teach it about form types.
 *
 * ---------------------------------------------------------------------------
 * THE INPUT SHAPE IS SHARED WITH xlsx.js — see PLAN-export-submissions.md D15
 * ---------------------------------------------------------------------------
 * Both writers take the same `(headers, rows)`, where a cell is
 * `{ value: string, href?: string }`. This one IGNORES `href`; the XLSX writer
 * turns it into a real hyperlink. That is the only difference between the two
 * output formats, and keeping it to that is deliberate: if the formats drifted
 * apart, "the export" would stop being one thing and a report built from the CSV
 * would break when someone re-ran it as Excel.
 */

/**
 * Characters that make a spreadsheet treat a text cell as a formula.
 *
 * `=` is the obvious one. `+`, `-` and `@` are the legacy Lotus-style triggers
 * Excel still honours — `+1+1` really does evaluate to 2. Tab and CR are in the
 * list because they can be used to shift a value into a leading position.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * Neutralise a value that a spreadsheet would otherwise execute.
 *
 * THIS IS THE ONE SECURITY-RELEVANT LINE IN THE EXPORT. Submission text is
 * attacker-controlled — a `comments` or `company` field can say anything — and
 * staff open these files in Excel. A leading `'` is the standard defence: Excel
 * and Sheets read it as "this cell is text" and do not display it.
 *
 * It also FIXES a real data bug rather than only preventing an attack. A phone
 * number stored as `+15555551234` is a formula to Excel, which evaluates it to
 * the number 15555551234 and loses the `+`. Prefixed, it survives as typed.
 */
function neutralise(text) {
  return FORMULA_LEAD.test(text) ? `'${text}` : text;
}

/**
 * Quote one field per RFC 4180.
 *
 * Embedded newlines are normalised to `\n` first. Real rows contain CRLF — the
 * `comments` field especially — and leaving those in place makes the file's own
 * CRLF record separator ambiguous to any parser that splits on it before it
 * understands quoting. Excel and Sheets both render `\n` inside a quoted field
 * as a line break within the cell, which is what the shopper typed.
 *
 * Leading and trailing spaces force quoting too: unquoted, several parsers trim
 * them, which silently edits the data.
 */
function quote(text) {
  const normalised = String(text ?? "").replace(/\r\n?/g, "\n");
  const guarded = neutralise(normalised);
  const mustQuote =
    /[",\n]/.test(guarded) || /^\s/.test(guarded) || /\s$/.test(guarded);
  return mustQuote ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/**
 * Serialise to a CSV string.
 *
 * Returns a string, not a Buffer — the caller hands it straight to a Response
 * and Remix encodes it as UTF-8.
 *
 * **The BOM is not optional.** Without it Excel on Windows reads a UTF-8 CSV as
 * the system codepage, which mangles PMS colour names, `×`, the `'` in sizes
 * like `3' x 4'`, and any accented customer name. Sheets and Numbers ignore it.
 *
 * @param {string[]} headers
 * @param {Array<Array<{value: string, href?: string}>>} rows
 * @returns {string}
 */
export function toCsv(headers, rows) {
  const lines = [headers.map(quote).join(",")];
  for (const row of rows) {
    lines.push(row.map((cell) => quote(cell?.value)).join(","));
  }
  // CRLF between records, and a trailing one — RFC 4180 allows it and some
  // parsers want the file to end on a record boundary.
  return `﻿${lines.join("\r\n")}\r\n`;
}

export const CSV_CONTENT_TYPE = "text/csv; charset=utf-8";
