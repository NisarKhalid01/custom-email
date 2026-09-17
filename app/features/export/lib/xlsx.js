/**
 * XLSX writer.
 *
 * SHARED across every export in this folder. Takes the SAME `(headers, rows)`
 * as `csv.js` — see the note there — and differs in exactly one way: a cell
 * carrying `href` becomes a real hyperlink.
 *
 * SERVER ONLY in practice (it returns a Buffer and loads `exceljs`), but it is
 * not named `.server.js` because it knows nothing about requests or the
 * database. It is a writer, like its sibling.
 *
 * ---------------------------------------------------------------------------
 * WHY XLSX IS THE SAFER OF THE TWO FORMATS
 * ---------------------------------------------------------------------------
 * Every hardening rule in `csv.js` exists because CSV is untyped text: a cell
 * beginning `=` is a formula, a newline is a record separator, a comma is a
 * delimiter. None of that is true here. Cells are typed, so a leading `=` in a
 * string cell is inert by construction, and a hyperlink is a cell PROPERTY
 * rather than content. There is deliberately no `neutralise()` equivalent below
 * — adding one would imply this format has the problem, and it does not.
 *
 * What it does need is the opposite discipline: every value is written as an
 * explicit string, because a library left to infer types turns `#D1361`,
 * `01234` and `3 x 4` into things they are not.
 */

// Loaded lazily, inside the one function that needs it. `exceljs` is ~1 MB and
// the CSV path — the default, and the one most exports will take — must not pay
// for it on a cold start. This is the fallback recorded in the plan's Risk 2,
// applied up front because it costs one `await`.
let ExcelJS = null;
async function loadExcelJs() {
  if (!ExcelJS) {
    const mod = await import("exceljs");
    ExcelJS = mod.default ?? mod;
  }
  return ExcelJS;
}

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Excel's own limit. A sheet name over this, or containing []:*?/\, is rejected. */
function safeSheetName(name) {
  const cleaned = String(name || "Export").replace(/[[\]:*?/\\]/g, " ");
  return cleaned.slice(0, 31) || "Export";
}

/**
 * Column widths, from the content.
 *
 * Without this every column is the default width and a sheet of URLs and
 * comments is unreadable until the merchant drags 60 borders. Capped at 60
 * characters so one long `comments` value cannot produce a single column wider
 * than the screen.
 */
function columnWidth(header, rows, index) {
  let longest = String(header).length;
  for (const row of rows) {
    const length = String(row[index]?.value ?? "").length;
    if (length > longest) longest = length;
  }
  return Math.min(Math.max(longest + 2, 10), 60);
}

/**
 * Serialise to an .xlsx Buffer.
 *
 * @param {string[]} headers
 * @param {Array<Array<{value: string, href?: string}>>} rows
 * @param {{sheetName?: string}} [options]
 * @returns {Promise<Buffer>}
 */
export async function toXlsx(headers, rows, { sheetName } = {}) {
  const Excel = await loadExcelJs();
  const workbook = new Excel.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(safeSheetName(sheetName));

  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true };
  // Freeze the header so scrolling 75 rows does not lose the column names.
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const row of rows) {
    // Add the row empty, then write each cell individually — `addRow(values)`
    // lets the library infer types, which is exactly what must not happen.
    const added = sheet.addRow([]);
    row.forEach((cell, index) => {
      const target = added.getCell(index + 1);
      const value = String(cell?.value ?? "");
      if (cell?.href) {
        // The NAME is the clickable thing, not the URL — the product title links
        // to the product, the file name links to the file. That is how the app's
        // own submissions list reads, and a column of readable names beats a
        // column of cdn.shopify.com/s/files/1/0939/… every time.
        target.value = { text: value, hyperlink: cell.href };
        target.font = { color: { argb: "FF0066CC" }, underline: true };
      } else {
        target.value = value;
      }
      // Force text for EVERY cell, linked or not. Without it Excel reads
      // `#D1361` as something to interpret and eats the leading zero off a ZIP.
      target.numFmt = "@";
    });
  }

  headers.forEach((header, index) => {
    sheet.getColumn(index + 1).width = columnWidth(header, rows, index);
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
