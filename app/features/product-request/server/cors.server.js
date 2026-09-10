/**
 * CORS for the product-request endpoint.
 *
 * SERVER ONLY. A local copy rather than an import from the logo-upload feature:
 * that one defaults to `*` when unconfigured, deliberately, to preserve the live
 * /api/upload behaviour. This endpoint is new and has no legacy behaviour to
 * preserve, so it ships locked down instead.
 *
 * ---------------------------------------------------------------------------
 * CORS IS NOT THE ABUSE CONTROL
 * ---------------------------------------------------------------------------
 * `multipart/form-data` is a CORS-safelisted content type, so a cross-origin
 * POST arrives with NO preflight: response headers only stop the attacker
 * READING the reply, not the request landing and sending mail. And `curl`
 * ignores CORS entirely.
 *
 * That is why isAllowedOrigin() is checked server-side and the request is
 * refused outright, rather than relying on the browser to enforce the header.
 * Even so, the real protections against a mail-sending endpoint being abused are
 * the honeypot, server-side rate limiting, and — if abuse actually appears — a
 * Shopify App Proxy so the endpoint stops being publicly callable.
 */

// Comma-separated. The SAME env var the logo-upload feature reads, so one value
// configures every storefront-facing endpoint: two near-identical names would be
// a trap where setting one silently leaves the other on its default.
//
// A leading `*.` wildcard is supported because an unpublished theme previews on
// <shop>.myshopify.com, not on the live custom domain.
const ALLOWED_ORIGINS = (
  process.env.STOREFRONT_ORIGIN ||
  "https://logomatcentral.com,https://www.logomatcentral.com,https://logo-mat-central.myshopify.com"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function matches(origin, pattern) {
  if (pattern === "*" || pattern === origin) return true;
  if (!pattern.startsWith("*.")) return false;
  // Host-only comparison, so a scheme difference is not a false negative.
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const suffix = pattern.slice(1); // "*.myshopify.com" -> ".myshopify.com"
  return host.endsWith(suffix) && host.length > suffix.length;
}

/**
 * A missing Origin is allowed through: `curl` and server-side callers omit it,
 * and so does a same-origin request. That is a known residual gap which CORS
 * cannot close — see the header note.
 */
export function isAllowedOrigin(origin) {
  if (!origin) return true;
  return ALLOWED_ORIGINS.some((p) => matches(origin, p));
}

export function corsHeaders(origin) {
  // Vary matters: the header below depends on the request's Origin, so a shared
  // cache must not reuse one storefront's response for another.
  const headers = { Vary: "Origin" };
  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}
