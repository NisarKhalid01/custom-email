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
      "quantity",
      "background_color",
      "variant_id",
      "variation_option",
      "logo_orientation",
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
  logo_colors: "Color Options",
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

/** `logo_colors` is an array; join it rather than letting String() give "A,B". */
export function formatValue(value) {
  return Array.isArray(value) ? value.join(", ") : String(value ?? "");
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
    value: formatValue(data[key]),
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
