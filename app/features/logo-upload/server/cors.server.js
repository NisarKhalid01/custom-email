import { json } from "@remix-run/node";
import { errorBody, errorStatus } from "../config/errors.js";

/**
 * CORS and JSON response helpers for the storefront-facing endpoints.
 *
 * SERVER ONLY.
 *
 * ---------------------------------------------------------------------------
 * WHY CORS IS NEEDED AT ALL, AND WHY IT CAN ONLY BE NARROWED
 * ---------------------------------------------------------------------------
 * The storefront runs on the Shopify domain and calls this app on
 * `custom-email-pearl.vercel.app` — a genuinely cross-origin request. The
 * Liquid-HMAC design keeps it that way (an App Proxy would have made it
 * same-origin, but that is out of scope). So CORS cannot be removed, only
 * tightened.
 *
 * ---------------------------------------------------------------------------
 * DEFAULT IS `*` — DELIBERATELY
 * ---------------------------------------------------------------------------
 * The live `/api/upload` sends `Access-Control-Allow-Origin: "*"` today. If
 * STOREFRONT_ORIGIN is unset, we do the same, so behaviour is unchanged until
 * someone deliberately configures it. Tightening it is plan delivery step 13 —
 * after go-live, as its own change.
 *
 * Getting the allowlist wrong breaks uploads on the very first preflight, which
 * is why this is opt-in rather than on by default.
 *
 * ⚠️ The list MUST include the test theme's preview host. An unpublished theme
 * is previewed on `<shop>.myshopify.com`, NOT the live custom domain, so a list
 * containing only `https://www.logomatcentral.com` would break every test-theme
 * upload (plan §10.2). `*.myshopify.com` wildcards are supported for exactly
 * this reason.
 *
 * Note this is not a security boundary for the gate: CORS restricts *browsers*,
 * not `curl`. The real enforcement is the HMAC in customer-identity.server.js.
 * CORS here reduces casual cross-site abuse, nothing more.
 */

const ALLOW_METHODS = "POST, GET, OPTIONS";
const ALLOW_HEADERS = "Content-Type, Authorization";
const MAX_AGE = "86400"; // cache the preflight for a day

/** Parse STOREFRONT_ORIGIN into a list. Empty means "allow anything". */
function allowlist() {
  return (process.env.STOREFRONT_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Does `origin` match `pattern`? Supports a leading `*.` wildcard so one entry
 * can cover every myshopify preview host.
 */
function matches(origin, pattern) {
  if (pattern === "*") return true;
  if (pattern === origin) return true;

  if (pattern.startsWith("*.")) {
    // Compare host only, so scheme differences don't cause a false negative.
    let host;
    try {
      host = new URL(origin).host;
    } catch {
      return false;
    }
    const suffix = pattern.slice(1); // "*.myshopify.com" -> ".myshopify.com"
    return host.endsWith(suffix) && host.length > suffix.length;
  }

  return false;
}

/**
 * Build CORS headers for a request.
 *
 * When an allowlist is configured we echo the caller's own Origin rather than
 * returning the pattern, because a browser requires an exact match — returning
 * `*.myshopify.com` literally would fail. Echoing means the response varies by
 * Origin, hence `Vary: Origin`, without which a CDN could serve one store's
 * allowed origin to another and break it.
 *
 * @param {Request} [request]
 */
export function corsHeaders(request) {
  const list = allowlist();
  const origin = request?.headers?.get?.("Origin") ?? "";

  let allowOrigin;
  if (!list.length) {
    // Unconfigured: match today's live behaviour exactly.
    allowOrigin = "*";
  } else if (origin && list.some((p) => matches(origin, p))) {
    allowOrigin = origin;
  } else {
    // Not allowed. Return a value that will not match the caller, so the browser
    // blocks it — rather than falling back to "*" and silently disabling the
    // allowlist the moment an unknown origin appears.
    allowOrigin = list.find((p) => !p.includes("*")) ?? "null";
  }

  const headers = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": ALLOW_METHODS,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Max-Age": MAX_AGE,
  };

  if (allowOrigin !== "*") headers.Vary = "Origin";

  return headers;
}

/**
 * Standard preflight response.
 *
 * @param {Request} [request]
 */
export function preflight(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

/**
 * A method the route does not serve.
 *
 * Still carries CORS headers: without them the browser reports an opaque CORS
 * failure instead of the actual 405, which is needlessly hard to debug.
 */
export function methodNotAllowed(request) {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: corsHeaders(request),
  });
}

/**
 * JSON success response with CORS headers.
 *
 * @param {any}      data
 * @param {object}   [opts]
 * @param {Request}  [opts.request]
 * @param {number}   [opts.status]
 * @param {object}   [opts.headers] Extra headers, e.g. Cache-Control.
 */
export function jsonWithCors(data, opts = {}) {
  return json(data, {
    status: opts.status ?? 200,
    headers: { ...corsHeaders(opts.request), ...(opts.headers ?? {}) },
  });
}

/**
 * JSON error response built from a code in `config/errors.js`.
 *
 * The status is derived from the code, so a route can never accidentally pair
 * `login_required` with a 200. An unknown code yields 500, never 200.
 *
 * @param {string}  code
 * @param {object}  [opts]
 * @param {Request} [opts.request]
 * @param {string}  [opts.message] Merchant-configured override.
 * @param {any}     [opts.detail]  Extra debug info (avoid anything sensitive).
 */
export function errorWithCors(code, opts = {}) {
  return json(errorBody(code, { message: opts.message, detail: opts.detail }), {
    status: errorStatus(code),
    headers: { ...corsHeaders(opts.request), ...(opts.headers ?? {}) },
  });
}
