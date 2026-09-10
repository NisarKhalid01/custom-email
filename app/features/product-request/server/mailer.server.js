import nodemailer from "nodemailer";

/**
 * Email for the Product Request Form.
 *
 * SERVER ONLY. Entirely separate from the two legacy routes' mail code: they
 * keep their own inline transports and hardcoded templates, and nothing here can
 * change how they behave.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ WHAT THIS SEPARATION DOES *NOT* BUY YOU
 * ---------------------------------------------------------------------------
 * If GMAIL_USER points at the same mailbox the legacy routes hardcode, the three
 * forms still share one Gmail account and its ~500/day cap. A flood through this
 * form can get that sender throttled, which would silently break the other two.
 * Code isolation cannot fix that — only a distinct sender credential here, or a
 * real mail service, actually isolates the quota.
 */

// Internal notification recipients. Add/remove emails here as needed.
// Deliberately a local copy rather than a shared constants module: sharing one
// would mean editing files that are live in production.
const NOTIFY_RECIPIENTS = ["sales@logomatcentral.com"];

// Reply-To on the customer confirmation, so replies reach sales.
const REPLY_TO = "sales@logomatcentral.com";

/**
 * Keys that never appear in the emailed field list.
 *
 * Context fields are shown in the header line or stored as columns; the identity
 * trio and the honeypot are plumbing that would otherwise render as rows like
 * "Customer Sig: 7f3a9c…" in every notification to sales.
 */
const NOT_A_FIELD = new Set([
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

/**
 * Mirrors `prf_field_order` in snippets/product-request-form.liquid, so the
 * notification reads in the order the shopper filled it in.
 *
 * Anything NOT listed here is still emailed, under "Other details". The form is
 * designed to grow by adding a key to that order list, and a new field must
 * never silently vanish from the email because this map was not updated with it.
 */
const SECTIONS = [
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
  ["Delivery Requirements", ["loading_dock", "liftgate", "cartons"]],
  ["Artwork and Notes", ["comments"]],
];

/** Labels whose humanised form would be wrong or unhelpful. */
const LABELS = {
  apt: "Apt / Suite",
  zip: "ZIP / Postal Code",
  mat_type: "Type of Mat",
  variant_id: "Size",
  variation_option: "Thickness / Logo Colors",
  logo_colors: "Color Options",
  background_color: "Base Mate Color",
  coin_quantity: "Coin Quantity",
  loading_dock: "Loading Dock",
};

/**
 * Escape before interpolating into HTML.
 *
 * Both legacy routes drop raw form input straight into their templates, so a
 * shopper's comment can inject markup into the sales inbox. Not repeated here.
 */
function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

function labelFor(key) {
  return (
    LABELS[key] ||
    key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function isBlank(value) {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  return String(value).trim() === "";
}

/** `logo_colors` is an array; join it rather than letting String() give "A,B". */
function formatValue(value) {
  return Array.isArray(value) ? value.join(", ") : String(value ?? "");
}

function row(key, value) {
  if (isBlank(value)) return "";
  return `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top;white-space:nowrap;">${escapeHtml(
    labelFor(key),
  )}</td><td style="padding:4px 0;color:#111;"><strong>${escapeHtml(
    formatValue(value),
  )}</strong></td></tr>`;
}

function table(body) {
  return `<table style="border-collapse:collapse;font-size:14px;">${body}</table>`;
}

function heading(text) {
  return `<h3 style="margin:22px 0 6px;font-size:15px;border-bottom:1px solid #e5e5e5;padding-bottom:5px;">${escapeHtml(
    text,
  )}</h3>`;
}

/**
 * The internal notification.
 *
 * @param {object}      data
 * @param {object}      opts
 * @param {string|null} opts.mediaUrl
 * @param {string|null} opts.mediaName
 * @param {string|null} opts.customerGid   Verified identity, or null.
 * @param {string|null} opts.droppedFile   Filename refused for lack of identity.
 */
export function buildNotification(data, opts = {}) {
  const { mediaUrl, mediaName, customerGid, droppedFile } = opts;
  const blocks = [];
  const used = new Set();

  for (const [title, keys] of SECTIONS) {
    const body = keys
      .map((key) => {
        used.add(key);
        return row(key, data[key]);
      })
      .join("");
    if (body) blocks.push(heading(title) + table(body));
  }

  const leftovers = Object.keys(data).filter(
    (key) => !used.has(key) && !NOT_A_FIELD.has(key) && !isBlank(data[key]),
  );
  if (leftovers.length) {
    blocks.push(
      heading("Other details") +
        table(leftovers.map((key) => row(key, data[key])).join("")),
    );
  }

  const product = data.product_url
    ? `<p style="font-size:13px;color:#666;">Product: <a href="${escapeHtml(
        data.product_url,
      )}">${escapeHtml(
        data.title || data.mat_type || data.product_handle || "View",
      )}</a>${data.shop ? ` &middot; ${escapeHtml(data.shop)}` : ""}</p>`
    : "";

  const account = customerGid
    ? `<p style="font-size:13px;color:#0a7;">Signed in customer &middot; ${escapeHtml(
        customerGid,
      )}</p>`
    : `<p style="font-size:13px;color:#666;">Guest (not signed in)</p>`;

  let attachment = "";
  if (mediaUrl) {
    attachment = `<p style="font-size:13px;">Attachment: <a href="${escapeHtml(
      mediaUrl,
    )}">${escapeHtml(mediaName || "Download file")}</a></p>`;
  } else if (droppedFile) {
    // Surfaced rather than hidden: sales should know artwork was attempted, and
    // an unexplained missing file is exactly the kind of thing that gets blamed
    // on "the form is broken" months later.
    attachment = `<p style="font-size:13px;color:#a33;">A file ("${escapeHtml(
      droppedFile,
    )}") was submitted without a verified customer account and was not stored. Ask the customer to sign in and resend it.</p>`;
  } else if (mediaName) {
    attachment = `<p style="font-size:13px;color:#a33;">Attachment "${escapeHtml(
      mediaName,
    )}" was received but could not be stored — it is attached to this email only.</p>`;
  }

  return `<div style="font-family:Arial,sans-serif;color:#333;">
    <h2 style="margin:0 0 4px;">New Quote Request</h2>
    ${product}
    ${account}
    ${attachment}
    ${blocks.join("")}
  </div>`;
}

export function buildConfirmation(name) {
  return `
    <div style="font-family: Arial, sans-serif; font-size: 15px; color: #333;">
      <p>Dear ${escapeHtml(name || "Customer")},</p>
      <p>Thank you for choosing <strong>Logo Mat Central</strong>. We have received your request and will get back to you shortly.</p>
      <p>Our team is reviewing your information and will contact you soon.</p>
      <br>
      <p>Best regards,</p>
      <p><strong>Logo Mat Central Support Team</strong></p>
    </div>
  `;
}

/**
 * Build the transport from env vars.
 *
 * Throws when unset. The legacy routes hardcode the app password inline (and it
 * is in git history); this feature refuses to start without GMAIL_USER and
 * GMAIL_APP_PASSWORD so that credential is never committed again.
 *
 * NOTE: rotating that password breaks BOTH legacy routes, which still carry the
 * old value inline. Rotation is its own coordinated change.
 */
function transport() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      "Mail not configured: set GMAIL_USER and GMAIL_APP_PASSWORD env vars",
    );
  }
  return {
    user,
    transporter: nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user, pass },
    }),
  };
}

/**
 * Send the notification, then the customer confirmation.
 *
 * The confirmation is non-fatal: sales already has the lead, so failing to thank
 * the customer must not present them with an error.
 *
 * @returns {Promise<"true"|"false">} email_status for the row.
 * @throws if the internal NOTIFICATION fails — that one matters.
 */
export async function sendSubmissionEmails(data, opts) {
  const { user, transporter } = transport();
  const customerEmail = String(data.email ?? "").trim();

  const info = await transporter.sendMail({
    from: `"Quote Request" <${user}>`,
    // Reply goes straight to the shopper who submitted the form.
    replyTo: customerEmail || REPLY_TO,
    to: NOTIFY_RECIPIENTS.join(", "),
    subject: `New Quote Request — ${data.title || data.mat_type || "Product"}`,
    html: buildNotification(data, opts),
    attachments: opts.attachments ?? [],
  });

  if (customerEmail) {
    try {
      await transporter.sendMail({
        from: `"Logo Mat Central" <${user}>`,
        replyTo: REPLY_TO,
        to: customerEmail,
        subject: "Thank You from Logo Mat Central",
        html: buildConfirmation(data.name),
      });
    } catch (err) {
      console.error("[product-request] customer confirmation failed:", err);
    }
  }

  return info?.accepted?.length > 0 ? "true" : "false";
}
