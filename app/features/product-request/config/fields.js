/**
 * Field order, labels and grouping for the Product Request Form.
 *
 * ISOMORPHIC — no server-only imports. This is loaded by the admin detail page
 * (which renders in the browser) as well as by the mailer, so it must stay pure
 * JavaScript. Do not import nodemailer, postgres, or anything *.server.js here.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS SHARED
 * ---------------------------------------------------------------------------
 * The notification email and the admin detail page both have to present the same
 * submission. Kept apart they drift: a field gets a friendlier label in one and
 * not the other, or a new form field appears in the email but not the admin.
 * Both now call `groupPayload()`, so there is one answer to "what order, what
 * label, what is hidden".
 *
 * The stored payload cannot supply the order itself. Postgres sorts jsonb keys
 * by length and then bytewise, so reading `Object.keys(payload)` gives
 * "Zip, City, Name, Shop, Email…" — which is why the admin looked scrambled.
 */

/** form_type value for this form. */
export const FORM_TYPE = "request_quote_new";

/**
 * Mirrors `prf_field_order` in snippets/product-request-form.liquid, headings
 * included, so both the email and the admin read in the order the shopper
 * actually filled the form in.
 *
 * Anything NOT listed here still gets shown, under "Other details". The form is
 * designed to grow by adding a key to that Liquid list, and a new field must
 * never silently disappear just because this map was not updated with it.
 */
export const SECTIONS = [
  ["Your Details", ["name", "company", "email", "phone"]],
  ["Shipping Address", ["street", "apt", "country", "state", "city", "zip"]],
  [
    "Product Details",
    [
      "mat_type",
      "variant_id",
      // Deliberately NOT where the storefront puts it. The form shows the price
      // in a summary block far lower down, next to Delivery Requirements,
      // because it has to sit under everything that can change it. In a text
      // listing there is no such constraint and the price belongs with the size
      // it prices.
      "variant_price",
      "quantity",
      "logo_orientation",
      "background_color",
      // Logo Colors then Color Options, both revealed by Base Mate Color above
      // them — the storefront gates them on it, mirroring the PDP.
      "variation_option",
      "logo_colors",
      "logo_edging",
      "logo_corners",
    ],
  ],
  [
    "Product Options",
    [
      "surface",
      "style",
      "backing",
      "border",
      "pattern",
      "line_1",
      "line_2",
      "line_3",
      "line_4",
      "line_5",
    ],
  ],
  [
    "Coin Specification",
    [
      "coin_quantity",
      "coin_diameter",
      "coin_thickness",
      "coin_metal",
      "coin_shape",
    ],
  ],
  // `cartons` was removed from the storefront form. The legacy Shipping Info
  // form still collects it, but that one has its own route and templates.
  ["Delivery Requirements", ["loading_dock", "liftgate"]],
  ["Artwork and Notes", ["comments"]],
];

/**
 * Keys that are not shopper answers.
 *
 * Page context is already shown on the Source card (product, store, submitted
 * date), so repeating it as "Shop: logo-mat-central.myshopify.com" is noise. The
 * identity trio and the honeypot are stripped before storage anyway — listed
 * here as belt and braces, since older rows or a future change could reintroduce
 * them.
 */
export const HIDDEN_KEYS = new Set([
  "form_source",
  "title",
  "product_url",
  "product_handle",
  "product_id",
  "shop",
  "attachment",
  // Machine identifiers for the resolved variant. STORED but not shown: they
  // are what the draft order is built from, and three lines of
  // "gid://shopify/ProductVariant/44…" in a sales email tell a human nothing.
  // What a human needs from them is already on the row as Size, the colour
  // count and the unit price. Read them from `payload` if you need them.
  "variant_gid",
  "variant_base_gid",
  "variant_product_id",
  "customer_gid",
  "customer_email",
  "customer_sig",
  "login_override",
  "verification_override",
  "prf_website",
]);

/** Labels whose humanised form would be wrong or unhelpful. */
const LABELS = {
  apt: "Apt / Suite",
  zip: "ZIP / Postal Code",
  mat_type: "Type of Mat",
  variant_id: "Size",
  variant_price: "Unit price at request",
  // "Logo Color Options" on the storefront since 2026-09-16. Kept identical
  // here on purpose: a quote must read the same in the shopper's form, the
  // sales email and the admin, which is the whole reason this map exists.
  logo_colors: "Logo Color Options",
  background_color: "Base Mate Color",
  coin_quantity: "Coin Quantity",
  loading_dock: "Loading Dock",
  liftgate: "Liftgate",
  comments: "Comments / Special Instructions",
};

export function isBlank(value) {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  return String(value).trim() === "";
}

/**
 * Cents to money. Anything that is not a whole number of cents comes back
 * untouched, so a bad value shows as itself rather than as "$NaN".
 *
 * USD symbol, matching the storefront this app serves. If a second currency is
 * ever added, the form would need to send one alongside the price -- the
 * payload carries no currency today.
 */
function formatCents(value) {
  const cents = parseInt(value, 10);
  if (!Number.isFinite(cents) || String(value).trim() === "") {
    return String(value ?? "");
  }
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * `logo_colors` is an array; join it rather than letting String() give "A,B".
 *
 * `variant_price` is an INTEGER NUMBER OF CENTS. That is what Liquid hands the
 * form and what gets stored, and storing it that way is right -- but printing
 * "9900" at a salesperson is not, hence the one key-specific case.
 */
export function formatValue(value, key) {
  if (Array.isArray(value)) return value.join(", ");
  if (key === "variant_price") return formatCents(value);
  return String(value ?? "");
}

/**
 * Label for a key.
 *
 * `variation_option` is deliberately value-dependent: that one chooser holds a
 * thickness on some products and a logo-colour count ("2 Color") on others, and
 * the storefront labels it accordingly. Naming it statically would caption half
 * the submissions wrongly — the same reason the column is not called `thickness`.
 */
export function labelFor(key, value) {
  if (key === "variation_option") {
    return /color/i.test(String(value ?? "")) ? "Logo Colors" : "Thickness";
  }
  return (
    LABELS[key] ||
    key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/**
 * Group a stored payload into the form's own sections.
 *
 * Empty fields are dropped, empty sections are dropped, and anything unknown
 * lands in "Other details" rather than vanishing.
 *
 * @param {object} payload
 * @returns {Array<{heading: string, rows: Array<{key: string, label: string, value: string}>}>}
 */
export function groupPayload(payload) {
  const data = payload && typeof payload === "object" ? payload : {};
  const groups = [];
  const used = new Set();

  const toRow = (key) => ({
    key,
    label: labelFor(key, data[key]),
    value: formatValue(data[key], key),
  });

  for (const [heading, keys] of SECTIONS) {
    const rows = [];
    for (const key of keys) {
      used.add(key);
      if (!isBlank(data[key])) rows.push(toRow(key));
    }
    if (rows.length) groups.push({ heading, rows });
  }

  const leftovers = Object.keys(data).filter(
    (key) => !used.has(key) && !HIDDEN_KEYS.has(key) && !isBlank(data[key]),
  );
  if (leftovers.length) {
    groups.push({ heading: "Other details", rows: leftovers.map(toRow) });
  }

  return groups;
}
