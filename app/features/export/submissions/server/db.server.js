import { getSql } from "../../../../lib/supabase.server.js";

/**
 * Database seam for the submissions export.
 *
 * SERVER ONLY. Import from *.server.js modules, route loaders and actions only.
 *
 * Same rule the product-request and logo-upload features follow, for the same
 * reason: `app/lib/supabase.server.js` is a LIVE file that both legacy form
 * routes depend on, and it is frozen by `scripts/check-no-break.sh` against
 * `docs/logo-upload/baseline.sha256`. We import it; we never modify it. If you
 * find yourself wanting to change the lib, change THIS file instead.
 *
 * The connection — pooling, SSL, prepared-statement config — is inherited from
 * the existing `getSql()`. This feature adds no second pool.
 *
 * THIS FEATURE ONLY READS. There is no insert, no update and no delete anywhere
 * under `features/export/`, which is the strongest guarantee available that
 * adding an export cannot damage the data it exports.
 */

/** The table the three storefront forms all write to. */
export const FORM_SUBMISSIONS_TABLE = "form_submissions";

export { getSql };
