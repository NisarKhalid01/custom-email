import { getSql, TABLES, tryRead } from "./db.server.js";
import {
  SETTINGS_DEFAULTS,
  mergeSettings,
  coerceSettings,
  toPublicSettings,
} from "../config/defaults.js";

/**
 * Per-shop settings: read, write, cache.
 *
 * SERVER ONLY.
 *
 * The read path sits directly in front of a customer upload, so the guiding rule
 * is: **a settings problem must never become a failed upload.** `getSettings()`
 * therefore never throws. It reports degradation instead, and the caller decides
 * what to do with it via `fail_mode`.
 */

/** How long a successful read is reused. */
const CACHE_TTL_MS = 60_000;

/**
 * How long a *failed* read suppresses retries. Short, so we recover quickly, but
 * non-zero so a database outage does not turn every upload into its own retry
 * and pile load onto something already struggling.
 */
const FAILURE_BACKOFF_MS = 5_000;

/** @type {Map<string, { settings: object, at: number, ok: boolean }>} */
const cache = new Map();

/**
 * @typedef {object} SettingsResult
 * @property {object}  settings  Always complete and valid — defaults merged in.
 * @property {boolean} degraded  True if we could not read the database this time.
 * @property {'db'|'cache'|'stale-cache'|'defaults'} source Where the value came from.
 */

/**
 * Load a shop's settings. **Never throws.**
 *
 * Degradation ladder, best to worst:
 *   1. `cache`       — a fresh read from the last 60s
 *   2. `db`          — a live read
 *   3. `stale-cache` — DB unreachable, but we hold an expired real value.
 *                      Preferred over defaults: the merchant's actual settings,
 *                      slightly old, beat silently reverting to "both features
 *                      off" — which would drop the gate without anyone asking.
 *   4. `defaults`    — DB unreachable and nothing cached (e.g. a cold serverless
 *                      instance during an outage). Both features OFF.
 *
 * ⚠️ Honest limitation of step 4: `fail_mode` itself lives in the database, so
 * when we have never successfully read it we cannot honour a merchant's
 * `fail_mode: "closed"`. The default is `open`, so uploads proceed as they do
 * today. This is the documented, deliberate trade — it protects sales, and it
 * matches plan §8.
 *
 * @param {string} shop
 * @returns {Promise<SettingsResult>}
 */
export async function getSettings(shop) {
  if (!shop) {
    return { settings: mergeSettings(null), degraded: true, source: "defaults" };
  }

  const hit = cache.get(shop);
  const now = Date.now();

  if (hit) {
    const age = now - hit.at;
    // A fresh success is reused. A fresh *failure* is also reused, briefly, so a
    // down database is not hammered once per upload.
    if (hit.ok && age < CACHE_TTL_MS) {
      return { settings: hit.settings, degraded: false, source: "cache" };
    }
    if (!hit.ok && age < FAILURE_BACKOFF_MS) {
      return { settings: hit.settings, degraded: true, source: "stale-cache" };
    }
  }

  const sql = getSql();
  const { value: rows, ok } = await tryRead(
    () => sql`
      select settings from ${sql(TABLES.settings)}
      where shop = ${shop}
      limit 1
    `,
    null,
    `getSettings(${shop})`,
  );

  if (ok) {
    // No row is a perfectly normal state, not an error: it means this shop has
    // never opened the Settings page, so every default applies and both features
    // are off.
    const settings = mergeSettings(rows?.[0]?.settings ?? null);
    cache.set(shop, { settings, at: now, ok: true });
    return { settings, degraded: false, source: "db" };
  }

  // Read failed. Prefer a stale real value over defaults.
  if (hit) {
    cache.set(shop, { settings: hit.settings, at: now, ok: false });
    return { settings: hit.settings, degraded: true, source: "stale-cache" };
  }

  const settings = mergeSettings(null);
  cache.set(shop, { settings, at: now, ok: false });
  return { settings, degraded: true, source: "defaults" };
}

/**
 * Save a settings patch for a shop.
 *
 * **Throws on failure** — unlike the read path. The admin pressed Save and must
 * be told plainly if it did not persist; silently succeeding would be worse than
 * an error banner.
 *
 * The patch is passed through `coerceSettings()` first, so unknown keys are
 * dropped, wrong types ignored and numbers clamped to the spec. The admin UI
 * validates too, but the server cannot trust it.
 *
 * Patches ACCUMULATE: the stored blob is `{ ...existing, ...coerced }`. A key the
 * merchant has never touched stays absent from the row and keeps following the
 * code default, so changing a default in `config/defaults.js` still reaches
 * shops that never overrode it.
 *
 * @param {string} shop
 * @param {object} patch
 * @returns {Promise<object>} The full merged settings after saving.
 */
export async function saveSettings(shop, patch) {
  if (!shop) throw new Error("saveSettings: shop is required");

  const clean = coerceSettings(patch);
  const sql = getSql();

  const [existing] = await sql`
    select settings from ${sql(TABLES.settings)}
    where shop = ${shop}
    limit 1
  `;

  const stored = existing?.settings ?? {};
  const next = { ...stored, ...clean };
  // `copy` is one level deep — spread it explicitly so saving a single string
  // does not wipe the other nine.
  if (clean.copy || stored.copy) {
    next.copy = { ...(stored.copy ?? {}), ...(clean.copy ?? {}) };
  }

  await sql`
    insert into ${sql(TABLES.settings)} (shop, settings, updated_at)
    values (${shop}, ${sql.json(next)}, now())
    on conflict (shop) do update
      set settings = excluded.settings,
          updated_at = now()
  `;

  const settings = mergeSettings(next);
  cache.set(shop, { settings, at: Date.now(), ok: true });
  return settings;
}

/**
 * The storefront-safe projection (A10).
 *
 * Returns `degraded` too so the endpoint can shorten its cache header when it is
 * serving fallback values — otherwise a CDN could hold defaults for a full
 * minute after the database has already recovered.
 *
 * @param {string} shop
 * @returns {Promise<{ settings: object, degraded: boolean }>}
 */
export async function getPublicSettings(shop) {
  const { settings, degraded } = await getSettings(shop);
  return { settings: toPublicSettings(settings), degraded };
}

/**
 * Drop cached settings.
 *
 * The cache is per-process, and serverless runs many processes, so this only
 * clears the instance it runs in — it is a test helper and a
 * save-time invalidation, not a cluster-wide purge. Cross-instance consistency
 * comes from the 60s TTL, which is why the storefront endpoint advertises
 * `s-maxage=60` and not longer.
 *
 * @param {string} [shop] Omit to clear every shop.
 */
export function clearSettingsCache(shop) {
  shop ? cache.delete(shop) : cache.clear();
}

export { SETTINGS_DEFAULTS };
