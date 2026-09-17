/**
 * Phase 4 checks — the export against the LIVE database.
 *
 *   node scripts/check-export-live.mjs
 *
 * READ ONLY. It runs the real query and the real writers over the real rows and
 * asserts the counts and the awkward values. It makes no Shopify call: the two
 * Shopify status columns are exercised in the browser, not here.
 *
 * Writes nothing to the database. Writes two sample files to `tmp/` so the
 * result can be opened in Excel and Sheets — that part of Phase 4 is a human
 * check and cannot be automated.
 */

import fs from "node:fs";
import path from "node:path";
import { listForExport } from "../app/features/export/submissions/server/query.server.js";
import { buildExport } from "../app/features/export/submissions/server/export.server.js";
import { headersFor, columnsFor } from "../app/features/export/submissions/config/columns.js";

// The app reads DATABASE_URL from the environment; locally that lives in .env,
// which nothing in this script's path loads for us.
if (!process.env.DATABASE_URL && !process.env.SUPABASE_DB_URL) {
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}

const SHOP = process.env.EXPORT_CHECK_SHOP || "logo-mat-central.myshopify.com";

let pass = 0;
let fail = 0;
function ok(name, condition, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`  ok    ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
  }
}

console.log(`\nLive export check — ${SHOP}`);

const all = await listForExport(SHOP);
console.log(`\n  ${all.rows.length} rows, truncated=${all.truncated}`);

const byForm = {};
for (const row of all.rows) byForm[row.form_type] = (byForm[row.form_type] ?? 0) + 1;
console.log(`  ${JSON.stringify(byForm)}\n`);

ok("the shop has rows to export", all.rows.length > 0);
ok("nothing was truncated", all.truncated === false);
ok("newest first", all.rows.every((r, i) => i === 0 || new Date(all.rows[i - 1].created_at) >= new Date(r.created_at)));
ok("every row belongs to this shop", all.rows.every((r) => r.shop === SHOP));

for (const formType of Object.keys(byForm)) {
  const scoped = await listForExport(SHOP, { formType });
  ok(
    `filter ${formType} returns exactly its own ${byForm[formType]} rows`,
    scoped.rows.length === byForm[formType] && scoped.rows.every((r) => r.form_type === formType),
    `got ${scoped.rows.length}`,
  );
}

const term = all.rows.find((r) => r.email)?.email ?? "";
if (term) {
  const searched = await listForExport(SHOP, { search: term });
  const expected = all.rows.filter((r) =>
    [r.email, r.phone, r.company, r.name, r.product_handle, r.product_title]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(term.toLowerCase())),
  ).length;
  ok(`search "${term}" matches the UI's own filter (${expected})`, searched.rows.length === expected, `got ${searched.rows.length}`);
}

const wildcard = await listForExport(SHOP, { search: "%" });
ok("a bare % is a literal, not a wildcard matching everything", wildcard.rows.length < all.rows.length, `got ${wildcard.rows.length} of ${all.rows.length}`);

/* ------------------------------------------------------------- the files */

const csv = await buildExport(all.rows, { formType: "all", format: "csv" });
const xlsx = await buildExport(all.rows, { formType: "all", format: "xlsx" });

const headers = headersFor(columnsFor("all"));
const lines = csv.body.trimEnd().split("\r\n");
// Quoted fields legitimately contain newlines, so a record count is not a line
// count — parse enough to count records properly.
let records = 0;
let inQuotes = false;
for (const char of csv.body.slice(1)) {
  if (char === '"') inQuotes = !inQuotes;
  if (char === "\n" && !inQuotes) records += 1;
}

ok("csv filename is dated and has the right extension", /^form-submissions-all-\d{4}-\d{2}-\d{2}\.csv$/.test(csv.filename), csv.filename);
ok("xlsx filename likewise", /^form-submissions-all-\d{4}-\d{2}-\d{2}\.xlsx$/.test(xlsx.filename), xlsx.filename);
ok("csv record count = header + every row", records === all.rows.length + 1, `${records} records for ${all.rows.length} rows (raw lines: ${lines.length})`);
ok("csv content type", csv.contentType === "text/csv; charset=utf-8");
ok("xlsx body is a zip buffer", Buffer.isBuffer(xlsx.body) && xlsx.body[0] === 0x50);

ok("no [object Object] in the whole file", !csv.body.includes("[object"));
ok("no literal 'undefined' cell", !/(^|,)undefined(,|\r)/.test(csv.body));
ok("no $NaN", !csv.body.includes("$NaN"));

// The address synonym trap: every form must have a populated Street.
const streetIndex = headers.indexOf("Street");
const { rowToCells } = await import("../app/features/export/submissions/config/columns.js");
const columns = columnsFor("all");
const formsWithStreet = new Set(
  all.rows
    .filter((r) => rowToCells(columns, r, {})[streetIndex].value !== "")
    .map((r) => r.form_type),
);
ok(
  "Street is populated for ALL three form types (the address synonym trap)",
  Object.keys(byForm).every((f) => formsWithStreet.has(f)),
  `populated for: ${[...formsWithStreet].join(", ")}`,
);

const orderStatusIndex = headers.indexOf("Order status");
const seenStatuses = new Set(
  all.rows
    .filter((r) => r.form_type === "request_quote_new")
    .map((r) => rowToCells(columns, r, {})[orderStatusIndex].value),
);
console.log(`\n  Order status values seen: ${JSON.stringify([...seenStatuses])}`);
ok("the new form's rows cover more than one lifecycle state", seenStatuses.size >= 2, [...seenStatuses].join(", "));

const outDir = path.join(process.cwd(), "tmp");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, csv.filename), csv.body, "utf8");
fs.writeFileSync(path.join(outDir, xlsx.filename), xlsx.body);
console.log(`\n  Samples written to tmp/ — open both to finish Phase 4 by hand:`);
console.log(`    tmp/${csv.filename}`);
console.log(`    tmp/${xlsx.filename}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
