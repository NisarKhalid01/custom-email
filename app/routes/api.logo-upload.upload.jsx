import { uploadToShopifyFiles } from "../lib/shopify-files.server.js";
import { getSettings } from "../features/logo-upload/server/settings.server.js";
import {
  resolveCustomer,
  UNTRUSTED,
} from "../features/logo-upload/server/customer-identity.server.js";
import { isCustomerVerified } from "../features/logo-upload/server/customers.server.js";
import { insertLogoUpload } from "../features/logo-upload/server/uploads.server.js";
import {
  preflight,
  methodNotAllowed,
  jsonWithCors,
  errorWithCors,
} from "../features/logo-upload/server/cors.server.js";
import { resolveOverride } from "../features/logo-upload/config/defaults.js";

/**
 * POST /api/logo-upload/upload — the gated twin of /api/upload.
 *
 * ---------------------------------------------------------------------------
 * `app/routes/api.upload.jsx` IS NOT TOUCHED
 * ---------------------------------------------------------------------------
 * This is a SEPARATE route. The live theme keeps posting to /api/upload until we
 * deliberately cut over, and pointing it back is a one-line theme change — the
 * rollback for this entire feature. The old route stays deployed and unmodified
 * for a 30-day soak after go-live (TASKS.md §0.5).
 *
 * Do not rename this file to anything sharing a prefix with `api.upload`:
 * Remix flat routes would make the live route this one's parent layout.
 *
 * ---------------------------------------------------------------------------
 * RESPONSE SHAPE IS UNCHANGED
 * ---------------------------------------------------------------------------
 * Success returns `{ url, fileId }`, exactly like /api/upload, so the theme's
 * existing `if (res && res.url)` keeps working with no change.
 *
 * ---------------------------------------------------------------------------
 * ORDER OF OPERATIONS — deliberate
 * ---------------------------------------------------------------------------
 * Every gate is checked BEFORE the file is sent to Shopify. Uploading first and
 * rejecting after would burn Shopify Files storage on requests we then refuse,
 * and would leave orphaned files behind on every blocked attempt.
 */

/** Best-effort client IP. Vercel sets x-forwarded-for. */
function clientIp(request) {
  const fwd = request.headers.get("x-forwarded-for") ?? "";
  return fwd.split(",")[0].trim() || request.headers.get("x-real-ip") || null;
}

export async function loader({ request }) {
  if (request.method === "OPTIONS") return preflight(request);
  return methodNotAllowed(request);
}

export async function action({ request }) {
  if (request.method === "OPTIONS") return preflight(request);
  if (request.method !== "POST") return methodNotAllowed(request);

  try {
    let form;
    try {
      form = await request.formData();
    } catch {
      // A malformed multipart body is a client problem, not a server fault.
      return errorWithCors("no_file", { request });
    }

    const file = form.get("file");
    // Matches /api/upload's existing behaviour and message byte for byte.
    if (!file || typeof file.arrayBuffer !== "function") {
      return errorWithCors("no_file", { request });
    }

    const body = Object.fromEntries(
      [...form.entries()].filter(([, v]) => typeof v === "string"),
    );

    // ------------------------------------------------------------------ shop
    // ⚠️ SECURITY: settings MUST be looked up by the shop the server knows, not
    // the one the request claims.
    //
    // `body.shop` is attacker-controlled. An earlier version keyed the settings
    // lookup on it, which meant sending `shop=anything-else.myshopify.com`
    // found no settings row, fell back to the defaults (both features OFF), and
    // switched the gate off completely — no signature required. Caught by the
    // "sig from another shop" test.
    //
    // `SHOPIFY_SHOP` is authoritative because it is the store
    // `uploadToShopifyFiles()` actually uploads to: whatever the request claims,
    // the file lands in that store, so that store's settings are the ones that
    // govern it.
    //
    // `body.shop` is still used — unmodified — for HMAC verification, because
    // the theme signed the value it sent. A mismatched shop therefore fails the
    // signature and is rejected on the normal path.
    const authoritativeShop = (process.env.SHOPIFY_SHOP || "").trim().toLowerCase();
    const submittedShop = (body.shop || "").trim().toLowerCase();
    const shop = authoritativeShop || submittedShop || null;

    if (authoritativeShop && submittedShop && submittedShop !== authoritativeShop) {
      // Not rejected here: with a gate on, the signature check below fails and
      // returns 401 anyway; with gates off, behaviour matches today's endpoint.
      // Logged because it is either a misconfigured theme or a probe.
      console.warn(
        `[logo-upload] shop mismatch — request claimed "${submittedShop}", server serves "${authoritativeShop}"`,
      );
    }

    // ------------------------------------------------------------------ gates
    const { settings, degraded } = await getSettings(shop);

    // `fail_mode: closed` means "block rather than let anything through while we
    // cannot read our own configuration". Only reachable from a stale cache that
    // held `closed`; on a cold instance we have never read fail_mode and default
    // to `open` (see settings.server.js).
    if (degraded && settings.fail_mode === "closed") {
      return errorWithCors("server_error", {
        request,
        message: "Uploads are temporarily unavailable. Please try again shortly.",
      });
    }

    const identity = resolveCustomer(body);

    // Untrusted input already forces both overrides to 'default', so a forged
    // `login_override=off` cannot reach this line with any effect.
    const requireLogin = resolveOverride(
      identity.loginOverride,
      settings.require_login,
    );
    const requireVerification = resolveOverride(
      identity.verificationOverride,
      settings.require_email_verification,
    );

    // Nothing is enforced -> behave exactly like /api/upload does today.
    const gated = requireLogin || requireVerification;

    if (gated && identity.reason === UNTRUSTED.NO_SECRET) {
      // Operational, not an attack. Distinct code so app/theme secret drift
      // shows up in logs as a misconfiguration instead of a pile of 401s.
      console.error(
        "[logo-upload] LOGO_UPLOAD_SECRET is not set, but a gate is enabled — every gated upload will fail.",
      );
      return errorWithCors("gate_secret_unconfigured", { request });
    }

    if (requireLogin && !identity.customerGid) {
      // A supplied-but-invalid signature is reported separately from nothing at
      // all: it usually means the shopper's session ended and the page is
      // serving a stale signature, which deserves "sign in again" rather than
      // "sign in".
      const code =
        identity.reason === UNTRUSTED.BAD_SIGNATURE ||
        identity.reason === UNTRUSTED.MALFORMED
          ? "invalid_signature"
          : "login_required";
      return errorWithCors(code, {
        request,
        message: settings.copy?.login_heading,
      });
    }

    if (requireVerification) {
      const verified = await isCustomerVerified(
        shop,
        { customerGid: identity.customerGid, email: identity.email },
        settings.verification_validity_days,
      );
      if (!verified) {
        return errorWithCors("email_verification_required", {
          request,
          message: settings.copy?.verify_heading,
        });
      }
    }

    // ----------------------------------------------------------------- upload
    // Reuses the EXISTING, UNMODIFIED lib — same EPS handling, same staged
    // upload flow, same `{url, fileId}` result as /api/upload.
    let result;
    try {
      result = await uploadToShopifyFiles(file);
    } catch (err) {
      console.error("[logo-upload] Shopify Files upload failed:", err?.message ?? err);
      return errorWithCors("upload_failed", { request });
    }

    if (!result?.url) {
      return errorWithCors("upload_failed", { request });
    }

    // ------------------------------------------------------------------ audit
    // Deliberately never throws — the file is already in Shopify and the
    // shopper's upload has genuinely succeeded. See uploads.server.js.
    await insertLogoUpload({
      shop,
      customer_gid: identity.customerGid,
      customer_email: identity.email,
      // Records whether verification was ENFORCED AND SATISFIED for this
      // specific upload, not the customer's state today. null = not required.
      email_verified: requireVerification ? true : null,
      identity_source: identity.trusted ? "liquid_hmac" : null,
      file_url: result.url,
      file_name: file.name ?? null,
      file_size: typeof file.size === "number" ? file.size : null,
      mime_type: file.type || null,
      shopify_file_id: result.fileId ?? null,
      product_id: body.product_id ?? null,
      product_handle: body.product_handle ?? null,
      product_url: body.product_url ?? null,
      ip: clientIp(request),
    });

    // Same shape as /api/upload so the theme needs no change here.
    return jsonWithCors({ url: result.url, fileId: result.fileId }, { request });
  } catch (err) {
    console.error("[logo-upload] unexpected error:", err);
    return errorWithCors("server_error", { request });
  }
}
