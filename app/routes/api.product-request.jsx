import { json } from "@remix-run/node";
import { uploadToShopifyFiles } from "../lib/shopify-files.server.js";
import {
  corsHeaders,
  isAllowedOrigin,
} from "../features/product-request/server/cors.server.js";
import {
  identify,
  fileRefusalReason,
} from "../features/product-request/server/identity.server.js";
import {
  insertSubmission,
  setEmailStatus,
} from "../features/product-request/server/submissions.server.js";
import { sendSubmissionEmails } from "../features/product-request/server/mailer.server.js";

/**
 * POST /api/product-request — the THIRD storefront form.
 *
 * Theme: snippets/product-request-form.liquid (#prf-modal), which merges the two
 * legacy quote forms. Contract: docs/PRODUCT-REQUEST-FORM-payload.md.
 *
 * ---------------------------------------------------------------------------
 * THE LEGACY ROUTES ARE NOT TOUCHED
 * ---------------------------------------------------------------------------
 * api.save-shipping.jsx and api.save-shipping-info.jsx are live and frozen
 * (scripts/check-no-break.sh / docs/logo-upload/baseline.sha256). So is
 * app/lib/supabase.server.js, which both call. This route shares the
 * `form_submissions` TABLE with them but none of their code: its own insert,
 * its own mailer, its own CORS, all under app/features/product-request/.
 *
 * The one genuine coupling left is the Gmail account — see the warning at the
 * top of mailer.server.js.
 *
 * This file is orchestration only. Anything with a rule in it belongs in a
 * module, so the rule has one testable home.
 */

// Matches data-max-bytes in snippets/product-request-form-field.liquid exactly
// (4.2 MiB). Vercel rejects bodies over ~4.5 MB at the edge, which the legacy
// Free Quote form reported to the customer as a success.
const MAX_ATTACHMENT_BYTES = 4404019;

/**
 * Build the payload from the multipart body.
 *
 * FormData.forEach() and Object.fromEntries() both keep only the LAST value of a
 * repeated key. `logo_colors` is a <select multiple> submitting one entry per
 * colour, so either would silently store a single colour with no error anywhere.
 * getAll() is the only correct read — the same trap the theme's own comment
 * warns about.
 */
function toPayload(formData) {
  const data = {};
  for (const key of new Set(formData.keys())) {
    const values = formData
      .getAll(key)
      .map((v) =>
        v instanceof File ? { name: v.name, type: v.type, size: v.size } : v,
      );
    data[key] = values.length > 1 ? values : values[0];
  }
  return data;
}

function isBlank(value) {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  return String(value).trim() === "";
}

/**
 * How many logo colours `variation_option` demands.
 *
 * Same rule as the theme's JS: first integer in the chosen value, so "3 Color"
 * gives 3. Only meaningful when the value IS a colour count — where that chooser
 * holds a thickness ("3/8\"") there is no such relationship and the client emits
 * no cap either.
 */
function requiredColorCount(variationOption) {
  const value = String(variationOption ?? "");
  if (!/color/i.test(value)) return 0;
  const digits = value.match(/\d+/);
  return digits ? parseInt(digits[0], 10) : 0;
}

export const action = async ({ request }) => {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") {
    return json({ error: "Method Not Allowed" }, { status: 405, headers });
  }
  if (!isAllowedOrigin(origin)) {
    console.warn("[product-request] rejected origin:", origin);
    return json({ error: "Forbidden" }, { status: 403, headers });
  }

  let formData;
  try {
    formData = await request.formData();
  } catch (err) {
    console.error("[product-request] could not parse the form body:", err);
    return json(
      { error: "Could not read the submitted form." },
      { status: 400, headers },
    );
  }

  const data = toPayload(formData);

  /* ---- honeypot -------------------------------------------------------
     `prf_website` is off-screen and out of the tab order, so a real shopper can
     never fill it. The theme checks it too, but that check is in the browser and
     anything posting directly skips it — which is precisely what a bot does.

     Answer 200 and do nothing. A 4xx tells the script what tripped it; a success
     it can never distinguish from the real thing costs it nothing to learn from. */
  if (!isBlank(data.prf_website)) {
    console.warn("[product-request] honeypot tripped; discarding submission");
    return json({ ok: true, message: "Request submitted successfully" }, {
      status: 200,
      headers,
    });
  }

  /* ---- validation. The client checks all of this too, but client validation
     is a convenience, not a guarantee. ---- */

  const customerEmail = String(data.email ?? "").trim();
  if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    return json(
      { error: "Please provide a valid email address." },
      { status: 400, headers },
    );
  }

  // Quantity: min/max come from product metafields the form does not post, so
  // only the shape can be checked here — the bounds cannot be. Worth knowing
  // that the form is `novalidate` and its own validate() never checks them
  // either, so an out-of-range quantity does reach us.
  if (!isBlank(data.quantity)) {
    const quantity = Number(data.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      return json(
        { error: "Please enter a valid quantity." },
        { status: 400, headers },
      );
    }
  }

  const needColors = requiredColorCount(data.variation_option);
  if (needColors > 0) {
    const picked = Array.isArray(data.logo_colors)
      ? data.logo_colors.length
      : isBlank(data.logo_colors)
        ? 0
        : 1;
    if (picked !== needColors) {
      return json(
        {
          error: `Please select exactly ${needColors} ${
            needColors === 1 ? "color" : "colors"
          } — ${picked} were submitted.`,
        },
        { status: 400, headers },
      );
    }
  }

  /* ---- identity + attachment ------------------------------------------
     Identity is resolved for every submission (so the account can be recorded)
     but only ENFORCED when a file is attached. A guest submitting without a file
     is the common case and must always succeed. */

  const identity = identify(data);

  const file = formData.get("attachment");
  const hasFile = file instanceof File && file.name && file.size > 0;

  if (hasFile && file.size > MAX_ATTACHMENT_BYTES) {
    return json(
      { error: "That file is too large. Please keep it under 4 MB." },
      { status: 413, headers },
    );
  }

  // A file with no verifiable owner is dropped, and the submission continues.
  // Rejecting the whole request would throw away the lead; storing the file
  // would let anyone host arbitrary content on the store's CDN.
  let droppedFile = null;
  let storeFile = hasFile;
  if (hasFile) {
    const refusal = fileRefusalReason(identity);
    if (refusal) {
      droppedFile = file.name;
      storeFile = false;
      console.warn(
        `[product-request] attachment "${file.name}" refused (${refusal}); ` +
          "keeping the submission without it",
      );
    }
  }

  const attachments = storeFile
    ? [
        {
          filename: file.name,
          content: Buffer.from(await file.arrayBuffer()),
          contentType: file.type,
        },
      ]
    : [];

  // Shopify Files gives the admin a durable link and lets the submission-delete
  // cleanup find the file. Non-fatal: a failed upload must not cost us the
  // submission, and the bytes still ride along on the email.
  let mediaUrl = null;
  const mediaName = storeFile ? file.name : null;
  if (storeFile) {
    try {
      const uploaded = await uploadToShopifyFiles(file);
      mediaUrl = uploaded.url;
    } catch (err) {
      console.error("[product-request] Shopify Files upload failed:", err);
    }
  }

  /* ---- 1. persist FIRST, so mail trouble can never lose the submission ---- */

  let submissionId = null;
  try {
    submissionId = await insertSubmission({
      shop: data.shop || process.env.SHOPIFY_SHOP || null,
      email: customerEmail,
      phone: data.phone,
      company: data.company,
      name: data.name,
      productUrl: data.product_url,
      productHandle: data.product_handle,
      productId: data.product_id,
      // The raw Shopify product title, NOT mat_type: this column is what the
      // admin lists and searches on, and mat_type carries the
      // product_custom_title override where a product sets one.
      productTitle: data.title || data.mat_type,
      mediaUrl,
      mediaName,
      customerGid: identity.customerGid,
      customerEmail: identity.customerEmail,
      payload: data,
    });
  } catch (err) {
    // Non-fatal so the lead still reaches sales by email, but never silent: the
    // legacy routes swallow this, which is how a failure here could go unnoticed
    // for weeks.
    if (err?.code === "23514") {
      console.error(
        "[product-request] form_type was rejected by the form_submissions check " +
          "constraint. Run 20260909000000_allow_request_quote_new_form_type.sql.",
      );
    } else if (err?.code === "42703") {
      console.error(
        "[product-request] a column is missing. Run " +
          "20260909000100_add_customer_identity_to_form_submissions.sql.",
      );
    }
    console.error("[product-request] insert failed:", err);
  }

  /* ---- 2. send ---- */

  let emailStatus = "false";
  let emailFailed = false;
  try {
    emailStatus = await sendSubmissionEmails(data, {
      mediaUrl,
      mediaName,
      customerGid: identity.customerGid,
      droppedFile,
      attachments,
    });
  } catch (err) {
    console.error("[product-request] notification email failed:", err);
    emailFailed = true;
  }

  /* ---- 3. record how the send went ---- */

  try {
    await setEmailStatus(submissionId, emailFailed ? "false" : emailStatus);
  } catch (err) {
    console.error("[product-request] email_status update failed:", err);
  }

  /* ---- 4. answer -------------------------------------------------------
     A mail failure still answers 200 when the row was saved.

     The shopper's submission genuinely succeeded — it is recorded and visible in
     the admin, where email_status "false" renders as a red Failed badge for the
     team to act on. Returning 500 here would leave the theme's draft in
     localStorage (prfClearDraft is only called on res.ok), the shopper would
     resubmit, and one enquiry would become two rows.

     Only a submission that saved NOTHING and emailed nothing is a real failure. */
  if (emailFailed && !submissionId) {
    return json(
      { error: "We could not send your request. Please try again." },
      { status: 500, headers },
    );
  }

  return json(
    {
      ok: true,
      message: "Request submitted successfully",
      id: submissionId,
      saved: Boolean(submissionId),
      emailSent: !emailFailed && emailStatus === "true",
      // So the theme can tell the shopper their artwork needs re-sending after
      // signing in, rather than assuming it arrived.
      attachmentStored: Boolean(mediaUrl),
      attachmentRefused: Boolean(droppedFile),
    },
    { status: 200, headers },
  );
};

export const loader = async ({ request }) => {
  const headers = corsHeaders(request.headers.get("origin"));

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  return json(
    { error: "Method Not Allowed" },
    { status: 405, headers: { ...headers, Allow: "POST, OPTIONS" } },
  );
};
