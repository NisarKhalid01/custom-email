import { getSql, TABLES, tryRead } from "./db.server.js";

/**
 * Read access to `logo_upload_customers`.
 *
 * SERVER ONLY.
 *
 * This module owns the READ side only. The write side — marking a customer
 * verified after a correct code — belongs to A9 (`email-verification.server.js`)
 * and does not exist yet, because F2 is held pending Q1. That is why a customer
 * can currently be *checked* but never *becomes* verified: intentional, and the
 * `require_email_verification` setting ships OFF.
 */

/**
 * Is this customer currently verified?
 *
 * ---------------------------------------------------------------------------
 * TWO CONDITIONS, NEVER ONE — see the long comment in the migration.
 * ---------------------------------------------------------------------------
 *   verified = true                      the stored fact, and not revoked
 *   AND verified_at is within the window computed from validityDays
 *
 * Checking only `verified` ignores expiry — someone verified two years ago
 * would still pass. Checking only `verified_at` ignores revocation — an admin
 * who set `verified = false` would be overruled. Both are bugs, which is why
 * this rule lives here and nowhere else.
 *
 * The window is computed at read time from the CURRENT setting rather than
 * stored, so shortening `verification_validity_days` in the admin applies to
 * everyone immediately, with no backfill.
 *
 * Never throws — this sits on the upload path. A failed read returns `false`,
 * which is the restrictive answer: it asks the customer to verify rather than
 * silently letting an unverified upload through.
 *
 * @param {string} shop
 * @param {{customerGid?: string|null, email?: string|null}} identity
 * @param {number} validityDays 0 = verify on every upload.
 * @returns {Promise<boolean>}
 */
export async function isCustomerVerified(shop, identity = {}, validityDays = 30) {
  if (!shop) return false;

  const gid = identity.customerGid || null;
  const email = identity.email ? String(identity.email).trim().toLowerCase() : null;
  if (!gid && !email) return false;

  // 0 days means "never trust a previous verification".
  const days = Number(validityDays);
  if (!Number.isFinite(days) || days <= 0) return false;

  const sql = getSql();

  // GID first: it survives an email change, so it is the identity that lasts.
  // Email is only a fallback for the logged-out case (require_login off,
  // require_email_verification on), where there is no customer at all.
  const { value: rows } = await tryRead(
    () =>
      gid
        ? sql`
            select verified, verified_at from ${sql(TABLES.customers)}
            where shop = ${shop} and customer_gid = ${gid}
            limit 1
          `
        : sql`
            select verified, verified_at from ${sql(TABLES.customers)}
            where shop = ${shop} and customer_gid is null and email = ${email}
            limit 1
          `,
    [],
    `isCustomerVerified(${shop})`,
  );

  const row = rows?.[0];
  if (!row?.verified || !row.verified_at) return false;

  const ageMs = Date.now() - new Date(row.verified_at).getTime();
  return ageMs <= days * 24 * 60 * 60 * 1000;
}
