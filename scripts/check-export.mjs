/**
 * Checks for the Form Submissions export — PLAN-export-submissions.md 1.6 / 1.6b.
 *
 *   node scripts/check-export.mjs
 *
 * No database, no network, no Shopify: it runs the pure core over row shapes
 * copied from LIVE data, including the awkward ones that motivated the design
 * (legacy `address` vs `street`, `logo_colors` as string and as array, the
 * attachment object with an empty name, the one row whose upload failed,
 * `comments` carrying CRLF).
 *
 * The last block is the D15 check: run both writers over the same input and
 * prove the visible output is identical. That is what keeps CSV and XLSX one
 * feature rather than two that drift.
 */

import { toCsv } from "../app/features/export/lib/csv.js";
import { toXlsx } from "../app/features/export/lib/xlsx.js";
import {
  columnsFor,
  headersFor,
  rowToCells,
} from "../app/features/export/submissions/config/columns.js";

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
function section(title) {
  console.log(`\n${title}`);
}

const cell = (value) => ({ value });

/* ------------------------------------------------------------- CSV hardening */

section("CSV writer — the D9 guards");

let csv = toCsv(["A", "B"], [[cell("=cmd|' /c calc'!A0"), cell("plain")]]);
ok("a leading = is neutralised with '", csv.includes("'=cmd"), csv);
ok(
  "a value containing a comma gets quoted",
  toCsv(["A"], [[cell("=SUM(A1,B1)")]]).includes(`"'=SUM(A1,B1)"`),
  toCsv(["A"], [[cell("=SUM(A1,B1)")]]),
);

csv = toCsv(["A"], [[cell("+15555551234")]]);
ok(
  "a phone number starting + survives as text (Excel would evaluate it)",
  csv.includes("'+15555551234"),
  csv,
);

csv = toCsv(["A"], [[cell("PROOF BEFORE ORDERING\r\nEST. 2017")]]);
ok("embedded CRLF becomes \\n inside a quoted field", csv.includes('"PROOF BEFORE ORDERING\nEST. 2017"'), JSON.stringify(csv));
ok("so the row is still ONE record", csv.trimEnd().split("\r\n").length === 2, JSON.stringify(csv));

csv = toCsv(["A"], [[cell('say "hi", ok')]]);
ok("inner quotes are doubled", csv.includes('"say ""hi"", ok"'), csv);

ok("the file starts with a UTF-8 BOM", toCsv(["A"], []).charCodeAt(0) === 0xfeff);

/* -------------------------------------------------------------- row fixtures */

const legacyRow = {
  id: "11111111-1111-1111-1111-111111111111",
  form_type: "request_quote",
  created_at: new Date("2026-09-16T14:03:22.961Z"),
  name: "Jo",
  company: "ACME",
  email: "jo@example.com",
  phone: "555-0100",
  product_title: "ToughTop All Purpose Mat",
  product_handle: "toughtop-all-purpose-customized-logo-mat",
  product_id: "9924310466841",
  product_url: "https://logomatcentral.com/products/toughtop-all-purpose-customized-logo-mat",
  media_url: "https://cdn.shopify.com/s/files/1/0939/1318/6585/files/bell_logo.png?v=1789502298",
  media_name: "bell logo.png",
  email_status: "true",
  payload: {
    address: "12 High St",
    address2: "Unit 4",
    city: "Austin",
    state: "Texas",
    zip: "78701",
    mat_type: "ToughTop",
    variant_id: "3' x 4'",
    quantity: "2",
    background_color: "Black",
    logo_orientation: "Horizontal",
    comments: "PLEASE PROVIDE PROOF\r\nBEFORE ORDERING",
    attachment: { name: "bell logo.png", size: 25547, type: "image/png" },
    shop: "logo-mat-central.myshopify.com",
    product_url: "https://logomatcentral.com/products/toughtop-all-purpose-customized-logo-mat",
    surprise_new_field: "hello",
  },
};

const newRow = {
  id: "22222222-2222-2222-2222-222222222222",
  form_type: "request_quote_new",
  created_at: new Date("2026-09-15T21:00:00.000Z"),
  name: "Sam",
  company: "Beta Co",
  email: "sam@example.com",
  phone: "+15555551234",
  product_title: "Flocked Olefin Custom Logo Mat",
  product_handle: "flocked-olefin-custom-logo-mat",
  product_id: "9924960321817",
  product_url: "https://logomatcentral.com/products/flocked-olefin-custom-logo-mat",
  media_url: "https://cdn.shopify.com/s/files/1/0939/1318/6585/files/Flocked.png?v=1789506248",
  media_name: "Flocked Olefin Indoor Logo Mat.png",
  email_status: "true",
  customer_email: "sam@account.com",
  customer_gid: "gid://shopify/Customer/1",
  draft_order_id: "gid://shopify/DraftOrder/9",
  draft_order_name: "#D1372",
  draft_order_created_at: new Date("2026-09-15T21:04:50.961Z"),
  order_id: "gid://shopify/Order/5",
  order_name: "#2044",
  payload: {
    street: "1 Main",
    apt: "",
    city: "Miami",
    state: "Florida",
    zip: "33101",
    country: "United States",
    variant_id: "3' x 4'",
    variant_price: "12400",
    quantity: "3",
    variation_option: "2 Color",
    logo_colors: ["Black", "Charcoal"],
    variant_gid: "gid://shopify/ProductVariant/44",
    comments: "",
  },
};

// The one live row with a name and no stored file.
const failedUploadRow = { ...legacyRow, id: "33", media_url: null, media_name: "lost-logo.png" };
// The other live shape: one colour ticked arrives as a bare string.
const singleColourRow = {
  ...newRow,
  id: "44",
  order_id: null,
  order_name: null,
  payload: { ...newRow.payload, logo_colors: "Brown" },
};

const ctx = {
  orderStatuses: {
    "gid://shopify/Order/5": { payment: "Paid", fulfillment: "Unfulfilled" },
  },
};

const allColumns = columnsFor("all");
const H = headersFor(allColumns);
const valueOf = (row, header) => rowToCells(allColumns, row, ctx)[H.indexOf(header)];

/* ------------------------------------------------------------ the data facts */

section("Column registry — the six live-data facts");

ok("legacy `address` reaches the Street column", valueOf(legacyRow, "Street").value === "12 High St", valueOf(legacyRow, "Street").value);
ok("legacy `address2` reaches Apt / Suite", valueOf(legacyRow, "Apt / Suite").value === "Unit 4");
ok("the new form's `street` reaches the SAME column", valueOf(newRow, "Street").value === "1 Main");
ok("`logo_colors` as an array joins with ; ", valueOf(newRow, "Logo Color Options").value === "Black; Charcoal", valueOf(newRow, "Logo Color Options").value);
ok("`logo_colors` as a bare string also renders", valueOf(singleColourRow, "Logo Color Options").value === "Brown", valueOf(singleColourRow, "Logo Color Options").value);
ok("`variant_price` cents become money", valueOf(newRow, "Unit price at request").value === "$124.00", valueOf(newRow, "Unit price at request").value);
ok("no cell anywhere renders as [object Object]", !rowToCells(allColumns, legacyRow, ctx).some((c) => c.value.includes("[object")));
// media_name null AND an attachment object whose name is empty — the live shape
// of "the shopper opened the file picker and chose nothing".
ok(
  "an empty attachment object yields a blank name, not [object Object]",
  rowToCells(
    allColumns,
    {
      ...newRow,
      media_url: null,
      media_name: null,
      payload: { ...newRow.payload, attachment: { name: "", size: 0, type: "application/octet-stream" } },
    },
    ctx,
  )[H.indexOf("Attachment name")].value === "",
);
ok("`shipping_form` has no `name` key and does not crash", rowToCells(allColumns, { id: "x", form_type: "shipping_form", created_at: null, payload: { street: "1 A", cartons: "3" } }, ctx).length === H.length);

section("Attachment — the failed upload");

ok("the name is still reported", valueOf(failedUploadRow, "Attachment name").value === "lost-logo.png");
ok("the URL cell explains itself instead of being blank", valueOf(failedUploadRow, "Attachment URL").value === "Upload failed — emailed only", valueOf(failedUploadRow, "Attachment URL").value);
ok("and it carries NO hyperlink to a file that does not exist", valueOf(failedUploadRow, "Attachment name").href === null);

section("Dates, status and links");

ok("dates are ISO 8601 UTC", valueOf(newRow, "Submitted").value === "2026-09-15T21:00:00Z", valueOf(newRow, "Submitted").value);
ok("Order status = Order completed when an order exists", valueOf(newRow, "Order status").value === "Order completed");
ok("Order status = Draft created when only a draft exists", valueOf(singleColourRow, "Order status").value === "Draft created", valueOf(singleColourRow, "Order status").value);
ok("Order status is BLANK for a legacy form, not 'Not started'", valueOf(legacyRow, "Order status").value === "");
ok("Payment status comes from the Shopify lookup", valueOf(newRow, "Payment status").value === "Paid");
ok("Fulfillment status likewise", valueOf(newRow, "Fulfillment status").value === "Unfulfilled");
ok("both are blank when the row has no order", valueOf(singleColourRow, "Payment status").value === "" && valueOf(singleColourRow, "Fulfillment status").value === "");
ok("email_status 'true' reads as Sent", valueOf(legacyRow, "Email status").value === "Sent");
ok("the Product cell links to the storefront page", valueOf(legacyRow, "Product").href === legacyRow.product_url);
ok("the Attachment name cell links to the file", valueOf(legacyRow, "Attachment name").href === legacyRow.media_url);

section("Nothing is lost, nothing is noise");

ok("an unknown payload key appears in Other fields", valueOf(legacyRow, "Other fields").value.includes("surprise_new_field=hello"), valueOf(legacyRow, "Other fields").value);
ok("page context (`shop`) does NOT", !valueOf(legacyRow, "Other fields").value.includes("shop="));
ok("nor does the payload's duplicate product_url", !valueOf(legacyRow, "Other fields").value.includes("product_url="));
// Every form writes contact details into the payload AND into its own column.
// The columns are what we export, so the payload copies must not be repeated.
ok(
  "nor do contact details that already have their own columns",
  !/\b(name|company|email|phone)=/.test(
    rowToCells(
      allColumns,
      { ...legacyRow, payload: { ...legacyRow.payload, name: "Jo", company: "ACME", email: "jo@example.com", phone: "555-0100" } },
      ctx,
    )[H.indexOf("Other fields")].value,
  ),
  rowToCells(
    allColumns,
    { ...legacyRow, payload: { ...legacyRow.payload, name: "Jo", company: "ACME", email: "jo@example.com", phone: "555-0100" } },
    ctx,
  )[H.indexOf("Other fields")].value,
);
ok("Other fields is the last column", H[H.length - 1] === "Other fields");

section("Per-form column scoping");

const shipping = headersFor(columnsFor("shipping_form"));
const quote = headersFor(columnsFor("request_quote"));
const fresh = headersFor(columnsFor("request_quote_new"));

ok("Shipping Info keeps Cartons and Thickness", shipping.includes("Cartons") && shipping.includes("Thickness"));
ok("Shipping Info has no draft-order columns", !shipping.includes("Order status") && !shipping.includes("Draft order"));
ok("Shipping Info has no coin columns", !shipping.includes("Coin Metal"));
ok("Quote Request has no Cartons", !quote.includes("Cartons"));
ok("Quote Request has no Country (never collected)", !quote.includes("Country"));
ok("the new form has coin columns and variant identifiers", fresh.includes("Coin Metal") && fresh.includes("Variant GID"));
ok("the new form carries both Shopify status columns", fresh.includes("Payment status") && fresh.includes("Fulfillment status"));
ok("single-form exports are narrower than the combined one", shipping.length < H.length && quote.length < H.length);

section("Headers");

ok("labels come from fields.js (variant_id -> Size)", H.includes("Size"));
ok("and its renames follow (logo_colors -> Logo Color Options)", H.includes("Logo Color Options"));
ok("variation_option gets the static override, not a value-dependent label", H.includes("Color count / Thickness") && !H.includes("Logo Colors"));
ok("no duplicate headers", new Set(H).size === H.length, H.filter((h, i) => H.indexOf(h) !== i).join(", "));

/* ------------------------------------------------------------------ D15 */

section("D15 — both formats, one shape");

const fixtures = [legacyRow, newRow, failedUploadRow, singleColourRow];
const rows = fixtures.map((r) => rowToCells(allColumns, r, ctx));
const buffer = await toXlsx(H, rows, { sheetName: "All forms" });

ok("the xlsx is a real zip archive", buffer[0] === 0x50 && buffer[1] === 0x4b);

const ExcelJS = (await import("exceljs")).default;
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(buffer);
const sheet = workbook.worksheets[0];

const xlsxHeaders = sheet.getRow(1).values.slice(1).map(String);
ok("xlsx headers are identical to the CSV's", JSON.stringify(xlsxHeaders) === JSON.stringify(H));

let mismatch = null;
for (let r = 0; r < rows.length && !mismatch; r += 1) {
  const visible = sheet
    .getRow(r + 2)
    .values.slice(1)
    .map((v) => (v && typeof v === "object" && "text" in v ? v.text : String(v ?? "")));
  for (let c = 0; c < H.length; c += 1) {
    const expected = rows[r][c].value;
    const actual = visible[c] ?? "";
    if (expected !== actual) {
      mismatch = `row ${r + 1}, column "${H[c]}": xlsx=${JSON.stringify(actual)} csv=${JSON.stringify(expected)}`;
      break;
    }
  }
}
ok("xlsx visible values are identical to the CSV's, every row", mismatch === null, mismatch ?? "");

const productCell = sheet.getRow(2).getCell(H.indexOf("Product") + 1);
ok("in xlsx the Product cell is a hyperlink", Boolean(productCell.value?.hyperlink));
ok("and its text is the NAME, not the URL", productCell.value?.text === "ToughTop All Purpose Mat", JSON.stringify(productCell.value));

const draftCell = sheet.getRow(3).getCell(H.indexOf("Draft order") + 1);
ok("#D1372 stayed text in xlsx", draftCell.value === "#D1372" && draftCell.numFmt === "@", `${JSON.stringify(draftCell.value)} numFmt=${draftCell.numFmt}`);

const zipCell = sheet.getRow(2).getCell(H.indexOf("ZIP / Postal Code") + 1);
ok("a ZIP is text, so a leading zero could not be eaten", typeof zipCell.value === "string" && zipCell.numFmt === "@");

const injBuffer = await toXlsx(["A"], [[{ value: "=1+1" }]]);
const injWorkbook = new ExcelJS.Workbook();
await injWorkbook.xlsx.load(injBuffer);
const injCell = injWorkbook.worksheets[0].getRow(2).getCell(1);
ok(
  "in xlsx a formula-looking value is inert text — no ' prefix needed",
  injCell.value === "=1+1" && !injCell.formula,
  `${JSON.stringify(injCell.value)} formula=${injCell.formula}`,
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
