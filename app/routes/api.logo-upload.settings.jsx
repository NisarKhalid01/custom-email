import { getPublicSettings } from "../features/logo-upload/server/settings.server.js";
import {
  preflight,
  methodNotAllowed,
  jsonWithCors,
} from "../features/logo-upload/server/cors.server.js";

/**
 * GET /api/logo-upload/settings?shop=<shop>.myshopify.com
 *
 * Public, unauthenticated. Tells the storefront gate whether either feature is
 * on, and supplies the merchant's modal copy.
 *
 * Thin by design — all logic lives in `app/features/logo-upload/`.
 *
 * ---------------------------------------------------------------------------
 * ROUTE NAMING — DO NOT "TIDY" THIS FILENAME
 * ---------------------------------------------------------------------------
 * Remix flat routes treat dots as both path separators AND nesting. The segment
 * is `logo-upload` specifically so this shares no prefix with the LIVE
 * `api.upload.jsx`. Renaming this to `api.upload.settings.jsx` would make the
 * live upload route this one's PARENT LAYOUT, pulling its loader (which returns
 * 405) into this route's lifecycle. See TASKS.md §0.5.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS NEVER RETURNS AN ERROR STATUS
 * ---------------------------------------------------------------------------
 * The storefront calls this before letting a shopper pick a file. A 4xx/5xx here
 * would either block a sale or force the theme to guess. So every path returns
 * 200 with a usable payload; `degraded` reports the truth for debugging, and the
 * cache header shortens when we are serving fallback values.
 *
 * Settings are non-secret by construction — `toPublicSettings()` is a whitelist
 * and omits all security tuning (TASKS.md §4.4). Nothing here is worth
 * protecting with auth, and requiring auth would mean shipping a credential to
 * every storefront page.
 */

export async function loader({ request }) {
  if (request.method === "OPTIONS") return preflight(request);
  if (request.method !== "GET") return methodNotAllowed(request);

  const url = new URL(request.url);
  const shop = (url.searchParams.get("shop") ?? "").trim().toLowerCase();

  // No shop: return defaults (both features OFF) rather than an error. That is
  // identical to today's behaviour — no gate — so a malformed call from an old
  // cached page can never block an upload. `degraded` makes it visible.
  if (!shop) {
    const { settings } = await getPublicSettings("");
    return jsonWithCors(
      { ...settings, degraded: true },
      { request, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { settings, degraded } = await getPublicSettings(shop);

  return jsonWithCors(
    { ...settings, degraded },
    {
      request,
      headers: {
        // 60s matches the in-process settings cache (A3), so a toggle in the
        // admin reaches shoppers within about a minute.
        //
        // When degraded we are serving fallback values, so a CDN must NOT hold
        // them for a full minute after the database recovers — 5s lets it
        // self-heal quickly while still absorbing a burst.
        "Cache-Control": degraded
          ? "public, max-age=0, s-maxage=5"
          : "public, max-age=0, s-maxage=60",
      },
    },
  );
}
