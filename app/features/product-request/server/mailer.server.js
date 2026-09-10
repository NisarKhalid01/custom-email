import nodemailer from "nodemailer";
import { groupPayload } from "../config/fields.js";

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

function renderGroups(payload) {
  // Field order, labels and grouping come from config/fields.js, which the admin
  // detail page also uses -- so the email and the admin can never disagree about
  // how a submission reads.
  return groupPayload(payload)
    .map(({ heading, rows }) => {
      const body = rows
        .map(
          (r) =>
            `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top;white-space:nowrap;">${escapeHtml(
              r.label,
            )}</td><td style="padding:4px 0;color:#111;"><strong>${escapeHtml(
              r.value,
            )}</strong></td></tr>`,
        )
        .join("");
      return `<h3 style="margin:22px 0 6px;font-size:15px;border-bottom:1px solid #e5e5e5;padding-bottom:5px;">${escapeHtml(
        heading,
      )}</h3><table style="border-collapse:collapse;font-size:14px;">${body}</table>`;
    })
    .join("");
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
  const blocks = renderGroups(data);

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
    ${blocks}
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
