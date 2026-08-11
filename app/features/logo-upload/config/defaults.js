/**
 * Settings: defaults, spec, and the public projection.
 *
 * PURE DATA + PURE FUNCTIONS — no imports, no DB, no framework. Safe to import
 * from anywhere (server modules, route loaders, the admin UI).
 *
 * SINGLE SOURCE OF TRUTH. Four things need to agree about what a setting is:
 *   - the defaults used when a shop has no row      (A3  settings.server.js)
 *   - validation/clamping when the admin saves      (A3  settings.server.js)
 *   - the fields the admin form renders             (A7  SettingsForm.jsx)
 *   - what the storefront is allowed to see         (A10 the public endpoint)
 * They all read SETTINGS_SPEC below rather than repeating a key list, so adding
 * a setting is a one-line change instead of a four-file change that drifts.
 *
 * EVERYTHING SHIPS OFF. Both feature flags default to false, so deploying this
 * code changes nothing on the storefront until a merchant flips a switch.
 */

/** `fail_mode` — what the server does when it cannot read its own settings. */
export const FAIL_MODES = /** @type {const} */ (["open", "closed"]);

/**
 * Per-template override values, signed by the theme in Liquid (plan §4.3.4).
 * The theme signs the OVERRIDE, not a resolved boolean, because Liquid has no
 * idea what the app-level setting is — resolving is the app's job.
 */
export const OVERRIDES = /** @type {const} */ (["default", "on", "off"]);

/**
 * The spec. `public: true` means the value is sent to the storefront.
 *
 * Nothing that describes the *security tuning* is public — attempt caps and
 * rate limits stay server-side. Publishing them tells an attacker exactly how
 * much room they have, and the storefront has no use for them.
 *
 * @type {Record<string, {type: string, default: any, min?: number, max?: number, values?: readonly string[], public: boolean, label: string, help: string}>}
 */
export const SETTINGS_SPEC = {
  // ---------------------------------------------------------------- features
  require_login: {
    type: "boolean",
    default: false,
    public: true,
    label: "Require customer login to upload",
    help: "When on, visitors must be signed in before they can attach a logo. There is no guest path.",
  },
  require_email_verification: {
    type: "boolean",
    default: false,
    public: true,
    label: "Require email verification",
    help: "Sends a 6-digit code that must be entered before the upload is accepted.",
  },

  // ---------------------------------------------------------------- limits
  max_upload_mb: {
    type: "integer",
    default: 4,
    min: 1,
    max: 4,
    // PUBLIC so the storefront can reject an oversized file BEFORE sending it.
    // Without this the browser posts the whole thing, Vercel rejects it at the
    // edge with 413 FUNCTION_PAYLOAD_TOO_LARGE, and — because that rejection
    // happens before any of our code runs — the response carries no CORS
    // headers. The shopper sees "Upload failed" and the console shows a
    // misleading CORS error instead of "your file is too big".
    public: true,
    label: "Maximum upload size (MB)",
    help:
      "Vercel serverless functions reject any request body over ~4.5 MB, and that ceiling cannot be raised. 4 MB leaves room for the multipart overhead and the identity fields sent alongside the file.",
  },

  // ---------------------------------------------------------------- timings
  verification_validity_days: {
    type: "integer",
    default: 30,
    min: 0,
    max: 365,
    public: false,
    label: "Verification valid for (days)",
    help: "How long a verified customer stays verified. 0 means verify on every upload.",
  },
  code_expiry_minutes: {
    type: "integer",
    default: 10,
    min: 1,
    max: 60,
    // Public so the modal can say "this code expires in 10 minutes" without the
    // number being hardcoded in the theme and drifting from the real value.
    public: true,
    label: "Code expires after (minutes)",
    help: "How long a verification code stays usable.",
  },
  verification_token_minutes: {
    type: "integer",
    default: 15,
    min: 1,
    max: 120,
    public: false,
    label: "Verification token lifetime (minutes)",
    help: "How long the browser may use a confirmed verification before the upload must be re-verified.",
  },

  // ---------------------------------------------------------------- hardening
  max_code_attempts: {
    type: "integer",
    default: 5,
    min: 1,
    max: 20,
    public: false,
    label: "Max wrong code attempts",
    help: "After this many wrong guesses the code is burned and a new one must be requested.",
  },
  rate_limit_email_per_15min: {
    type: "integer",
    default: 3,
    min: 1,
    max: 50,
    public: false,
    label: "Code requests per email / 15 min",
    help: "",
  },
  rate_limit_ip_per_hour: {
    type: "integer",
    default: 10,
    min: 1,
    max: 500,
    public: false,
    label: "Code requests per IP / hour",
    help: "",
  },

  // ---------------------------------------------------------------- behaviour
  fail_mode: {
    type: "enum",
    values: FAIL_MODES,
    default: "open",
    // Server-only ON PURPOSE. If the storefront cannot reach the settings
    // endpoint it also cannot have read fail_mode, so publishing it would be
    // useless — and it would tell an attacker whether the gate can be bypassed
    // by taking the endpoint down.
    public: false,
    label: "If settings are unreachable",
    help: "open = allow the upload (protects sales). closed = block it.",
  },
};

/**
 * Merchant-editable copy. All public — the storefront has to render it.
 * `max` is enforced on save so a runaway paste cannot break the modal layout.
 */
export const COPY_SPEC = {
  login_heading: { default: "Sign in to upload your logo", max: 120 },
  login_body: {
    default: "You'll need an account before you can attach artwork to this product.",
    max: 400,
  },
  login_sign_in: { default: "Sign in", max: 40 },
  login_create_account: { default: "Create account", max: 40 },
  login_close: { default: "Close", max: 40 },

  verify_heading: { default: "Verify your email", max: 120 },
  verify_body: {
    default: "We'll email you a 6-digit code to confirm this address.",
    max: 400,
  },
  verify_send: { default: "Send code", max: 40 },
  verify_confirm: { default: "Verify", max: 40 },
  verify_resend: { default: "Resend code", max: 40 },
};

/** Defaults for every scalar setting, derived from the spec. */
export const SETTINGS_DEFAULTS = Object.freeze({
  ...Object.fromEntries(
    Object.entries(SETTINGS_SPEC).map(([key, spec]) => [key, spec.default]),
  ),
  copy: Object.freeze(
    Object.fromEntries(
      Object.entries(COPY_SPEC).map(([key, spec]) => [key, spec.default]),
    ),
  ),
});

/**
 * Merge a stored settings blob over the defaults.
 *
 * Tolerant by design: a shop with no row, a null, or a partial/corrupt blob all
 * produce a complete, valid settings object with both features OFF. This runs on
 * the upload path, so it must never throw — a settings problem must not become a
 * failed customer upload.
 *
 * @param {object|null|undefined} stored The `settings` jsonb column.
 * @returns {typeof SETTINGS_DEFAULTS}
 */
export function mergeSettings(stored) {
  const source = stored && typeof stored === "object" ? stored : {};
  const merged = { ...SETTINGS_DEFAULTS, ...source };
  // `copy` is one level deep, so a stored blob holding only login_heading must
  // not wipe the other nine strings. Spread it explicitly rather than letting
  // the shallow merge above replace the whole object.
  merged.copy = { ...SETTINGS_DEFAULTS.copy, ...(source.copy ?? {}) };
  return merged;
}

/**
 * Clamp and coerce an incoming patch from the admin form.
 *
 * Unknown keys are dropped, wrong types are ignored (the default survives), and
 * numbers are clamped to the spec's min/max. The admin UI validates too, but the
 * server must not trust it — the settings endpoint is reachable directly.
 *
 * @param {object} patch
 * @returns {object} A patch containing only valid, in-range values.
 */
export function coerceSettings(patch) {
  const out = {};
  if (!patch || typeof patch !== "object") return out;

  for (const [key, spec] of Object.entries(SETTINGS_SPEC)) {
    if (!(key in patch)) continue;
    const raw = patch[key];

    if (spec.type === "boolean") {
      if (typeof raw === "boolean") out[key] = raw;
      // Accept the strings a form POST produces, so the admin form does not have
      // to hand-convert every checkbox.
      else if (raw === "true" || raw === "on") out[key] = true;
      else if (raw === "false" || raw === "off") out[key] = false;
    } else if (spec.type === "integer") {
      const n = Number.parseInt(raw, 10);
      if (Number.isFinite(n)) {
        out[key] = Math.min(spec.max ?? n, Math.max(spec.min ?? n, n));
      }
    } else if (spec.type === "enum") {
      if (spec.values.includes(raw)) out[key] = raw;
    }
  }

  if (patch.copy && typeof patch.copy === "object") {
    const copy = {};
    for (const [key, spec] of Object.entries(COPY_SPEC)) {
      const raw = patch.copy[key];
      if (typeof raw !== "string") continue;
      const trimmed = raw.trim().slice(0, spec.max);
      // An empty string means "reset to default" rather than "render nothing" —
      // a blank heading would leave the modal looking broken.
      if (trimmed) copy[key] = trimmed;
    }
    if (Object.keys(copy).length) out.copy = copy;
  }

  return out;
}

/**
 * Project settings down to what the storefront may see (A10).
 *
 * Whitelist, not blacklist: only keys explicitly marked `public: true` are
 * included, so adding a sensitive setting later cannot leak by omission.
 *
 * Keys are camelCased here because this is the JSON the theme's JavaScript
 * consumes; snake_case stays on the server and in the database.
 *
 * @param {object} settings A merged settings object.
 */
export function toPublicSettings(settings) {
  const merged = mergeSettings(settings);
  const out = {};
  for (const [key, spec] of Object.entries(SETTINGS_SPEC)) {
    if (spec.public) out[camel(key)] = merged[key];
  }
  out.copy = { ...merged.copy };
  return out;
}

/** snake_case -> camelCase. */
function camel(key) {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Resolve a per-template override against the app-level setting (plan §4.3.4).
 *
 * The theme signs `'default' | 'on' | 'off'`; the app decides what that means,
 * because only the app knows the shop-level setting.
 *
 * IMPORTANT: only call this with an override whose HMAC signature verified. An
 * unverified override must be discarded and `appValue` used instead, or a forged
 * `off` would disable the gate — see customer-identity.server.js (A4).
 *
 * @param {string}  override One of OVERRIDES.
 * @param {boolean} appValue The shop-level setting.
 */
export function resolveOverride(override, appValue) {
  if (override === "on") return true;
  if (override === "off") return false;
  return appValue;
}
