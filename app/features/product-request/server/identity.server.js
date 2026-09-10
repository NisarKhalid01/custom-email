import {
  resolveCustomer,
  UNTRUSTED,
} from "../../logo-upload/server/customer-identity.server.js";

/**
 * Customer identity seam for the product-request feature.
 *
 * SERVER ONLY.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IMPORTS ACROSS A FEATURE BOUNDARY
 * ---------------------------------------------------------------------------
 * The HMAC contract has exactly ONE producer — snippets/mo-logo-upload-config.liquid,
 * the only file holding the signing secret — and this form renders that same
 * snippet (product-request-form.liquid:360-362, guarded so it appears exactly
 * once per page). One signed payload therefore needs one verifier.
 *
 * Copying customer-identity.server.js would give the codebase two
 * implementations of a security check that must agree byte-for-byte with a
 * Liquid template. When they inevitably drift, the failure is a signature that
 * verifies in one route and not the other — the worst kind of bug to diagnose.
 *
 * So the cross-feature dependency is deliberate, and confined to THIS file so
 * there is exactly one place to change if the two features are ever split apart.
 * It is a read-only import: nothing here modifies the logo-upload feature, and
 * that module is not on the frozen list — the frozen files are the live routes
 * and libs, none of which this touches.
 */

/** Why an upload was refused, for logging and for the sales notification. */
export const FILE_REFUSED = Object.freeze({
  NO_IDENTITY: "no_identity",   // signature absent or forged
  NO_CUSTOMER: "no_customer",   // validly signed, but nobody was logged in
});

/**
 * Resolve who sent this submission.
 *
 * @param {object} body Flat payload values.
 * @returns {{
 *   customerGid: string|null,
 *   customerEmail: string|null,
 *   trusted: boolean,
 *   secretConfigured: boolean,
 *   reason: string|null,
 * }}
 */
export function identify(body) {
  const id = resolveCustomer(body);
  return {
    customerGid: id.customerGid,
    customerEmail: id.email,
    trusted: id.trusted,
    secretConfigured: id.secretConfigured,
    reason: id.reason,
  };
}

/**
 * May this submission's file be stored?
 *
 * The rule (docs/PRODUCT-REQUEST-FORM-payload.md §2): verify identity ONLY when
 * a file is attached. A submission with no file is always accepted — the file
 * input is disabled when logged out, so most submissions have none, and gating
 * the whole request on login would throw away every guest quote request.
 *
 * Returns `null` when the file may be stored, otherwise a FILE_REFUSED reason.
 *
 * MISCONFIGURATION IS NOT AN ATTACK. When no signing secret is set, every
 * visitor resolves as untrusted — so refusing here would silently discard real
 * customers' artwork because of a missing env var. The file is accepted and the
 * problem is logged loudly instead.
 */
export function fileRefusalReason(identity) {
  if (!identity.secretConfigured) {
    console.error(
      "[product-request] LOGO_UPLOAD_SECRET is not set — cannot verify customer " +
        "identity, so the attachment is being accepted unverified. Set it in the " +
        "app environment to the value in snippets/mo-logo-upload-config.liquid.",
    );
    return null;
  }
  if (!identity.trusted) return FILE_REFUSED.NO_IDENTITY;
  // A signature over an empty identity is legitimately trusted — it proves the
  // theme rendered it — but it yields no customer, which is exactly how an
  // anonymous shopper is told apart from a forged customer id.
  if (!identity.customerGid) return FILE_REFUSED.NO_CUSTOMER;
  return null;
}

export { UNTRUSTED };
