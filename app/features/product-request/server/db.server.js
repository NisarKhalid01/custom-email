import { getSql } from "../../../lib/supabase.server.js";

/**
 * Database seam for the product-request feature.
 *
 * SERVER ONLY. Import from *.server.js modules, route loaders and actions only.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------
 * Every module in this feature goes through here rather than importing
 * `app/lib/supabase.server.js` directly — the same rule the logo-upload feature
 * follows, and for the same reason:
 *
 *   `app/lib/supabase.server.js` is a LIVE file that both legacy form routes
 *   depend on. It is frozen by scripts/check-no-break.sh against
 *   docs/logo-upload/baseline.sha256. We import it; we never modify it. If you
 *   find yourself wanting to change the lib, change THIS file instead.
 *
 * The connection itself (pooling, SSL, prepared-statement config) is inherited
 * from the existing `getSql()`. This feature adds no second pool.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FEATURE WRITES ITS OWN INSERT INSTEAD OF REUSING THE LIB'S
 * ---------------------------------------------------------------------------
 * `insertFormSubmission()` in the frozen lib copies a HARDCODED column list, so
 * any key it does not know about — `customer_gid`, `customer_email` — is
 * silently dropped rather than rejected. Extending that list would mean editing
 * a frozen file that both live routes call.
 *
 * So this feature owns its own write path to the same table. The two legacy
 * routes keep using the lib's insert, unchanged; nothing this feature does can
 * alter their behaviour.
 */

/** The table this feature writes to. Shared with the two legacy forms. */
export const FORM_SUBMISSIONS_TABLE = "form_submissions";

/**
 * form_type value for this form.
 *
 * The column carries a CHECK constraint listing the permitted values, extended
 * by 20260909000000_allow_request_quote_new_form_type.sql. Without that
 * migration every insert fails with SQLSTATE 23514.
 */
export const FORM_TYPE = "request_quote_new";

export { getSql };
