/**
 * THE column registry for the Form Submissions export.
 *
 * ISOMORPHIC — no server-only imports. The Export button reads the column count
 * from here, so this must stay loadable in the browser, exactly like
 * `features/product-request/config/fields.js` which it borrows its labels from.
 *
 * ---------------------------------------------------------------------------
 * WHY THE COLUMNS ARE DECLARED AND NOT DISCOVERED
 * ---------------------------------------------------------------------------
 * The obvious implementation is "one column per key found in `payload`". It is
 * wrong twice over. Postgres orders jsonb keys by LENGTH then bytewise, so the
 * header would come out "Zip, City, Name, Shop, Email…" and reshuffle whenever
 * the data changed; and a column would only exist once some row happened to
 * carry the key, so two exports of the same table could have different shapes.
 *
 * Declaring them fixes the order and the shape. `Other fields` (below) is what
 * stops that costing us completeness.
 *
 * ---------------------------------------------------------------------------
 * HEADERS COME FROM labelFor(), NOT FROM STRINGS TYPED HERE
 * ---------------------------------------------------------------------------
 * `config/fields.js` exists so that a form field is called the same thing in the
 * shopper's form, the sales email and the admin page. Typing the names again
 * here would make this a fourth place to update — and that file changes: as
 * recently as 2026-09-16 `logo_colors` became "Logo Color Options".
 *
 * Two deliberate exceptions, both documented at their definition: the
 * legacy-only keys `labelFor()` has never heard of, and `variation_option`,
 * whose label is VALUE-dependent in the UI and cannot be in a column header.
 */

import { labelFor } from "../../../product-request/config/fields.js";
import {
  formatCents,
  formatDate,
  formatList,
  formatText,
  isBlank,
} from "../../lib/format.js";
import {
  FORM_LABELS,
  formatAttachmentName,
  formatAttachmentUrl,
  formatEmailStatus,
  formatOrderStatus,
} from "../lib/format.js";

const SHIPPING = "shipping_form";
const QUOTE = "request_quote";
const NEW = "request_quote_new";

/** Every form type, in the order the filter dropdown lists them. */
export const FORM_TYPES = [SHIPPING, QUOTE, NEW];
const ALL = FORM_TYPES;

/**
 * One column.
 *
 * @param {object}   spec
 * @param {string}   spec.header       Column title.
 * @param {string[]} spec.forms        Which form types get this column.
 * @param {Function} spec.value        (row, payload, ctx) => string
 * @param {Function} [spec.href]       (row, payload, ctx) => string|null — a
 *   hyperlink target. The XLSX writer makes the cell clickable; CSV ignores it.
 * @param {string[]} [spec.consumes]   payload keys this column accounts for, so
 *   they do not also appear in `Other fields`.
 */
function column({ header, forms, value, href = null, consumes = [] }) {
  return { header, forms, value, href, consumes };
}

/** A column reading one payload key, labelled by `labelFor()`. */
function payloadColumn(key, forms, { header, format = formatText } = {}) {
  return column({
    header: header ?? labelFor(key),
    forms,
    value: (_row, payload) => format(payload[key]),
    consumes: [key],
  });
}

/**
 * A column reading whichever of several payload keys the form happens to use.
 *
 * This is here because the three forms use DIFFERENT NAMES FOR THE SAME THING:
 * `request_quote` stores the street as `address` / `address2` while the other
 * two use `street` / `apt`. Keying on one vocabulary silently blanks the
 * address for two-thirds of the rows — verified against live data, where 71 of
 * 75 rows are the legacy spelling.
 */
function firstOfColumn(keys, forms, { header, format = formatText } = {}) {
  return column({
    header: header ?? labelFor(keys[0]),
    forms,
    value: (_row, payload) => {
      for (const key of keys) {
        if (!isBlank(payload[key])) return format(payload[key]);
      }
      return "";
    },
    consumes: keys,
  });
}

/* ------------------------------------------------------------------ columns */

const CORE = [
  column({ header: "Submission ID", forms: ALL, value: (row) => formatText(row.id) }),
  column({
    header: "Form",
    forms: ALL,
    value: (row) => FORM_LABELS[row.form_type] || formatText(row.form_type),
  }),
  column({ header: "Submitted", forms: ALL, value: (row) => formatDate(row.created_at) }),
  column({ header: "Name", forms: ALL, value: (row) => formatText(row.name) }),
  column({ header: "Company", forms: ALL, value: (row) => formatText(row.company) }),
  column({ header: "Email", forms: ALL, value: (row) => formatText(row.email) }),
  column({ header: "Phone", forms: ALL, value: (row) => formatText(row.phone) }),

  // The VERIFIED account address, not the free text the shopper typed into the
  // form. Only the new form collects it, and only when logged in.
  column({
    header: "Customer account email",
    forms: [NEW],
    value: (row) => formatText(row.customer_email),
  }),
  column({
    header: "Customer ID",
    forms: [NEW],
    value: (row) => formatText(row.customer_gid),
  }),

  // The product TITLE is the clickable cell in XLSX — a readable name that opens
  // the page, exactly as the submissions list reads. The raw URL keeps its own
  // column for pasting into a script or an email.
  column({
    header: "Product",
    forms: ALL,
    value: (row) => formatText(row.product_title),
    href: (row) => row.product_url || null,
  }),
  column({ header: "Product handle", forms: ALL, value: (row) => formatText(row.product_handle) }),
  // No admin URL column: `Product ID` is here so an admin lookup is a paste
  // away, and three columns of admin.shopify.com/store/… per row is width spent
  // to save one paste.
  column({ header: "Product ID", forms: ALL, value: (row) => formatText(row.product_id) }),
  column({ header: "Product URL", forms: ALL, value: (row) => formatText(row.product_url) }),

  column({
    header: "Attachment name",
    forms: ALL,
    value: (row, payload) => formatAttachmentName(row, payload),
    // No link when there is no stored file. The one live row with a name and no
    // URL must not get a dead hyperlink to a file that failed to upload.
    href: (row) => row.media_url || null,
  }),
  column({
    header: "Attachment URL",
    forms: ALL,
    value: (row, payload) => formatAttachmentUrl(row, payload),
  }),

  column({ header: "Email status", forms: ALL, value: (row) => formatEmailStatus(row.email_status) }),

  /* --- the draft order / order block: ours, then Shopify's --- */
  column({ header: "Order status", forms: [NEW], value: (row) => formatOrderStatus(row) }),
  column({ header: "Draft order", forms: [NEW], value: (row) => formatText(row.draft_order_name) }),
  column({
    header: "Draft order created",
    forms: [NEW],
    value: (row) => formatDate(row.draft_order_created_at),
  }),
  column({ header: "Order", forms: [NEW], value: (row) => formatText(row.order_name) }),
  // Read live from Shopify at export time and passed in on `ctx`. Blank when the
  // row has no order, and blank when the lookup failed — an export must not fail
  // because Shopify was slow.
  column({
    header: "Payment status",
    forms: [NEW],
    value: (row, _payload, ctx) => formatText(ctx?.orderStatuses?.[row.order_id]?.payment),
  }),
  column({
    header: "Fulfillment status",
    forms: [NEW],
    value: (row, _payload, ctx) => formatText(ctx?.orderStatuses?.[row.order_id]?.fulfillment),
  }),
];

const ADDRESS = [
  firstOfColumn(["street", "address"], ALL, { header: "Street" }),
  firstOfColumn(["apt", "address2"], ALL, { header: labelFor("apt") }),
  payloadColumn("city", ALL),
  payloadColumn("state", ALL),
  payloadColumn("zip", ALL),
  // Added with the new form; the two legacy ones never asked.
  payloadColumn("country", [NEW]),
];

const PRODUCT = [
  payloadColumn("mat_type", [QUOTE, NEW]),
  // A size TITLE ("3' x 4'"), not an id — unchanged across all three forms on
  // purpose, since renaming it would break every stored row.
  payloadColumn("variant_id", ALL),
  payloadColumn("variant_price", [NEW], { format: formatCents }),
  payloadColumn("quantity", [QUOTE, NEW]),
  // The legacy Shipping Info form's own field. `labelFor()` humanises it
  // correctly, but it is not one of the new form's keys.
  payloadColumn("thickness", [SHIPPING]),
  // OVERRIDE. `labelFor("variation_option", value)` answers "Logo Colors" or
  // "Thickness" depending on the VALUE — right for a row in the admin, and
  // impossible for a column header that has to caption every row at once.
  payloadColumn("variation_option", [NEW], { header: "Color count / Thickness" }),
  payloadColumn("background_color", [QUOTE, NEW]),
  // String when one colour was ticked, array when several. Both shapes are live.
  payloadColumn("logo_colors", [NEW], { format: formatList }),
  payloadColumn("logo_orientation", [QUOTE, NEW]),
  payloadColumn("logo_edging", [QUOTE, NEW]),
  payloadColumn("logo_corners", [NEW]),
];

const OPTIONS = ["surface", "style", "backing", "border", "pattern"].map((key) =>
  payloadColumn(key, [NEW]),
);

const PERSONALISATION = ["line_1", "line_2", "line_3", "line_4", "line_5"].map((key) =>
  payloadColumn(key, [NEW]),
);

const COIN = [
  "coin_quantity",
  "coin_diameter",
  "coin_thickness",
  "coin_metal",
  "coin_shape",
].map((key) => payloadColumn(key, [NEW]));

const DELIVERY = [
  payloadColumn("loading_dock", [SHIPPING, NEW]),
  payloadColumn("liftgate", [SHIPPING, NEW]),
  // Removed from the new form along with the field type that drew it; the
  // legacy Shipping Info form still collects it.
  payloadColumn("cartons", [SHIPPING]),
];

const NOTES = [payloadColumn("comments", ALL)];

/**
 * The resolved variant's machine identifiers.
 *
 * These are in `HIDDEN_KEYS` in `config/fields.js` — deliberately, because
 * `gid://shopify/ProductVariant/44…` tells a salesperson nothing in an email.
 * A spreadsheet is the one place they DO belong: reconciling against Shopify is
 * what it is for. The divergence is intentional and lives here, so `fields.js`
 * is untouched.
 */
const IDENTIFIERS = [
  payloadColumn("variant_gid", [NEW], { header: "Variant GID" }),
  payloadColumn("variant_base_gid", [NEW], { header: "Base variant GID" }),
  payloadColumn("variant_product_id", [NEW], { header: "Variant product ID" }),
];

const COLUMNS = [
  ...CORE,
  ...ADDRESS,
  ...PRODUCT,
  ...OPTIONS,
  ...PERSONALISATION,
  ...COIN,
  ...DELIVERY,
  ...NOTES,
  ...IDENTIFIERS,
];

/**
 * Payload keys that are page context or duplicates of a real column, not
 * shopper answers — so they belong in neither a column nor `Other fields`.
 *
 * TWO GROUPS, and the second is easy to miss.
 *
 * Page context: `form_source`, `title`, `shop`, the `product_*` trio.
 * `attachment` is the browser's description of the upload, covered by the two
 * attachment columns. The identity pair is exported from the VERIFIED columns,
 * never from the payload copy.
 *
 * CONTACT DETAILS ARE STORED TWICE. Every form writes `name` / `company` /
 * `email` / `phone` into the payload AND into its own table column — the insert
 * copies them out. The columns are what the export uses, so without these four
 * lines every row's `Other fields` ends with
 * `company=…; email=…; name=…; phone=…`, repeating four columns it already has.
 * Found by reading a real exported row, not by reading the schema.
 */
const IGNORED_PAYLOAD_KEYS = new Set([
  "form_source",
  "title",
  "shop",
  "product_url",
  "product_handle",
  "product_id",
  "attachment",
  "customer_gid",
  "customer_email",
  "name",
  "company",
  "email",
  "phone",
]);

/** Every payload key some column already accounts for. */
const CONSUMED = new Set(COLUMNS.flatMap((c) => c.consumes));

/**
 * The catch-all, always last.
 *
 * Mirrors `groupPayload()`'s "Other details": anything the registry does not
 * know about is still exported rather than silently dropped. This is what lets
 * the header stay fixed without the export going stale — a field the theme
 * starts sending tomorrow appears in this column tomorrow, with no code change,
 * and whoever notices can promote it to a real column at their leisure.
 */
const OTHER_FIELDS = column({
  header: "Other fields",
  forms: ALL,
  value: (_row, payload) =>
    Object.keys(payload)
      .filter(
        (key) =>
          !CONSUMED.has(key) && !IGNORED_PAYLOAD_KEYS.has(key) && !isBlank(payload[key]),
      )
      .sort()
      .map((key) => `${key}=${formatList(payload[key])}`)
      .join("; "),
});

/**
 * The columns for one export.
 *
 * @param {string} formType One of FORM_TYPES, or "all" for the combined export.
 * @returns {Array<object>}
 */
export function columnsFor(formType) {
  const chosen =
    formType && formType !== "all"
      ? COLUMNS.filter((c) => c.forms.includes(formType))
      : COLUMNS;
  return [...chosen, OTHER_FIELDS];
}

/**
 * Map one row to the format-neutral cells both writers accept.
 *
 * `{ value, href }` per cell: the CSV writer ignores `href`, the XLSX writer
 * turns it into a hyperlink. Doing the mapping ONCE, here, is what guarantees
 * the two formats produce identical columns.
 */
export function rowToCells(columns, row, ctx = {}) {
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  return columns.map((col) => ({
    value: col.value(row, payload, ctx),
    href: col.href ? col.href(row, payload, ctx) : null,
  }));
}

/** Header strings, in order. */
export function headersFor(columns) {
  return columns.map((col) => col.header);
}
