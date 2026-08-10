import { getSql } from "../../../lib/supabase.server.js";

/**
 * Database seam for the logo-upload feature.
 *
 * SERVER ONLY. Import from *.server.js modules, route loaders and actions only.
 *
 * Every other module in this feature goes through here rather than importing
 * `app/lib/supabase.server.js` directly. Two reasons:
 *
 *   1. `app/lib/supabase.server.js` is a LIVE file the existing form flows depend
 *      on, and is frozen by scripts/check-no-break.sh. We import it; we never
 *      modify it. Funnelling through one seam makes that boundary obvious — if
 *      you find yourself wanting to change the lib, change this file instead.
 *
 *   2. Table names live in exactly one place, so a rename is a one-line change
 *      rather than a grep-and-hope across seven modules.
 *
 * The connection itself (pooling, SSL, prepared-statement config) is entirely
 * inherited from the existing `getSql()` — this feature adds no second pool.
 */

/** The four tables this feature owns. Nothing else may be written by it. */
export const TABLES = Object.freeze({
  settings: "logo_upload_app_settings",
  customers: "logo_upload_customers",
  verifications: "logo_upload_email_verifications",
  files: "logo_upload_customer_files",
});

export { getSql };

/**
 * Run a query, returning a fallback instead of throwing.
 *
 * Used on the READ paths that sit in front of a customer upload. A settings
 * lookup or a verification check must never turn a database blip into a failed
 * upload — the caller decides what a degraded read means (see `fail_mode`).
 *
 * Deliberately NOT used for writes. A failed insert must surface, or we would
 * silently lose an upload record and report success.
 *
 * @template T
 * @param {() => Promise<T>} run       The query.
 * @param {T}                fallback  Returned if the query throws.
 * @param {string}           context   Label for the log line.
 * @returns {Promise<{ value: T, ok: boolean }>}
 */
export async function tryRead(run, fallback, context) {
  try {
    return { value: await run(), ok: true };
  } catch (err) {
    // Logged, not swallowed silently — a persistent failure here is an outage
    // that must be visible, even though we degrade gracefully for the shopper.
    console.error(`[logo-upload] read failed (${context}):`, err?.message ?? err);
    return { value: fallback, ok: false };
  }
}
