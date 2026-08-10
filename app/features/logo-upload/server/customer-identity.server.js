import crypto from "node:crypto";
import { OVERRIDES } from "../config/defaults.js";

/**
 * Customer identity — the ONLY place that decides "who is this, and can we
 * trust it".
 *
 * SERVER ONLY. Never inline this logic into a route: the rule must exist in
 * exactly one testable place.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * The browser cannot be trusted. Anyone can POST
 * `customer_gid=gid://shopify/Customer/1` to the upload endpoint and claim to be
 * someone else. Blocking in JavaScript is cosmetic — one `curl` bypasses it.
 *
 * So the THEME signs the identity in Liquid, on Shopify's servers, using a
 * secret the browser never sees. The browser only ever carries the digest. This
 * module recomputes the HMAC and rejects any mismatch.
 *
 * ---------------------------------------------------------------------------
 * THE SIGNED PAYLOAD  (contract with the theme — TASKS.md §4.2)
 * ---------------------------------------------------------------------------
 *   v1|<shop>|<login_override>|<verification_override>|<customer_gid>|<email>
 *
 * Signed with LOGO_UPLOAD_SECRET using HMAC-SHA256, hex-encoded.
 *
 * Field-by-field, and why each is in there:
 *
 *   v1        Format version. Lets the payload change later without every old
 *             cached page failing in an unexplainable way.
 *
 *   shop      WITHOUT this, a signature minted on store A would verify on store
 *             B, because the secret is per-APP, not per-shop. Any future second
 *             install would inherit a cross-store identity forgery.
 *
 *   overrides The per-template theme settings ('default' | 'on' | 'off'). They
 *             MUST be signed: the app cannot read theme settings, so the claim
 *             arrives from the browser. Unsigned, `curl` with
 *             `login_override=off` would simply switch the gate off. Note it
 *             signs the OVERRIDE, not a resolved boolean — Liquid has no idea
 *             what the app-level setting is. Resolving is the app's job.
 *
 *   gid+email BOUND TOGETHER in one signature. Signing them separately would let
 *             an attacker pair customer A's id with customer B's email.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ---------------------------------------------------------------------------
 * No expiry in the payload. Shopify's full-page cache would serve a stale
 * timestamp and break every upload at random. The token is therefore
 * identity-bound and long-lived.
 *
 * Consequence, accepted: a user's own signed blob can be replayed — but only to
 * act as THEMSELVES, which changes nothing. (Plan §3.)
 */

const PAYLOAD_VERSION = "v1";
const DELIMITER = "|";
const GID_PATTERN = /^gid:\/\/shopify\/Customer\/\d+$/;

/** Why a verification failed. `null` means it succeeded. */
export const UNTRUSTED = Object.freeze({
  NO_SECRET: "no_secret",       // operational: LOGO_UPLOAD_SECRET is not set
  NO_SIGNATURE: "no_signature", // nothing was sent — old theme, or stripped
  BAD_SIGNATURE: "bad_signature",
  MALFORMED: "malformed",       // a field contained the delimiter, or is unusable
});

/**
 * @typedef {object} Identity
 * @property {boolean}     trusted              Did the HMAC verify?
 * @property {string|null} customerGid          Only ever set when trusted.
 * @property {string|null} email                Only ever set when trusted. Lowercased.
 * @property {string}      loginOverride        'default' unless trusted.
 * @property {string}      verificationOverride 'default' unless trusted.
 * @property {string|null} reason               One of UNTRUSTED, or null.
 * @property {boolean}     secretConfigured     False = misconfiguration, not an attack.
 */

/** True if at least one signing secret is configured. */
export function isSecretConfigured() {
  return Boolean(process.env.LOGO_UPLOAD_SECRET?.trim());
}

/**
 * Current + previous secrets, in the order they are tried.
 *
 * Two secrets exist so rotation is not a hard cutover: the theme and the app can
 * be updated in either order without downtime. Set the old value as
 * LOGO_UPLOAD_SECRET_PREVIOUS, deploy, update the theme, then drop it.
 */
function secrets() {
  return [process.env.LOGO_UPLOAD_SECRET, process.env.LOGO_UPLOAD_SECRET_PREVIOUS]
    .map((s) => s?.trim())
    .filter(Boolean);
}

/**
 * Build the exact string the theme must sign.
 *
 * Exported so the tests, the docs and the Liquid snippet all derive the format
 * from one place instead of three hand-copied versions that drift.
 *
 * @returns {string|null} null if any field contains the delimiter (see below).
 */
export function buildPayload({ shop, loginOverride, verificationOverride, customerGid, email }) {
  const fields = [
    PAYLOAD_VERSION,
    shop ?? "",
    loginOverride ?? "default",
    verificationOverride ?? "default",
    customerGid ?? "",
    email ?? "",
  ].map(String);

  // Delimiter injection: if a field could contain '|', an attacker who controls
  // one field could shift the others and produce a payload that means something
  // different while still verifying. Emails are the only remotely plausible
  // vector (a quoted local part may legally contain '|'), so rather than reason
  // about how unlikely that is, refuse outright.
  if (fields.some((f) => f.includes(DELIMITER))) return null;

  return fields.join(DELIMITER);
}

/** HMAC-SHA256 hex digest. */
function sign(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

/**
 * Constant-time comparison.
 *
 * A plain `===` on a digest leaks how many leading characters matched via timing,
 * which is enough to forge a signature byte by byte given enough attempts.
 *
 * Length is checked first because `timingSafeEqual` throws on a length mismatch.
 * That is not a leak: the digest length is fixed and public.
 */
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

/** Only a well-formed customer GID counts. Logged-out visitors send "". */
function normalizeGid(raw) {
  const v = String(raw ?? "").trim();
  return GID_PATTERN.test(v) ? v : null;
}

/** Overrides must be one of the three known values; anything else is 'default'. */
function normalizeOverride(raw) {
  const v = String(raw ?? "default").trim();
  return OVERRIDES.includes(v) ? v : "default";
}

/**
 * Resolve and verify the identity on an incoming request.
 *
 * **Fail-restrictive.** Whenever the signature does not verify, the returned
 * identity is empty AND both overrides fall back to `'default'` — so a forged
 * `login_override=off` achieves exactly nothing; the app-level setting applies.
 *
 * Never throws: this sits on the upload path.
 *
 * @param {object} body Flat values from the request (FormData or JSON).
 * @returns {Identity}
 */
export function resolveCustomer(rawBody) {
  // `rawBody ?? {}` rather than a default parameter: a default only applies to
  // `undefined`, and an explicit `null` is very easy to produce from a failed
  // JSON parse or an absent form body. This sits on the upload path and must
  // never throw.
  const body = rawBody ?? {};

  const untrusted = (reason, secretConfigured = true) => ({
    trusted: false,
    customerGid: null,
    email: null,
    loginOverride: "default",
    verificationOverride: "default",
    reason,
    secretConfigured,
  });

  const keys = secrets();
  // Operational failure, NOT an attack. Reported distinctly so it surfaces in
  // logs as a misconfiguration instead of hiding among genuine 401s — with a
  // shared secret this is the most likely thing to break (plan §8).
  if (!keys.length) return untrusted(UNTRUSTED.NO_SECRET, false);

  const providedSig = String(body.customer_sig ?? "").trim().toLowerCase();
  if (!providedSig) return untrusted(UNTRUSTED.NO_SIGNATURE);

  // Signed exactly as Liquid emitted it. Do NOT normalise before verifying —
  // lowercasing the email here while the theme signed the original casing would
  // break every signature. Normalisation happens only AFTER the HMAC matches.
  const payload = buildPayload({
    shop: body.shop,
    loginOverride: body.login_override,
    verificationOverride: body.verification_override,
    customerGid: body.customer_gid,
    email: body.customer_email,
  });
  if (payload === null) return untrusted(UNTRUSTED.MALFORMED);

  const matched = keys.some((secret) => safeEqual(sign(payload, secret), providedSig));
  if (!matched) return untrusted(UNTRUSTED.BAD_SIGNATURE);

  // Verified. Only now is it safe to trust — and to normalise.
  const rawEmail = String(body.customer_email ?? "").trim().toLowerCase();
  return {
    trusted: true,
    customerGid: normalizeGid(body.customer_gid),
    email: rawEmail || null,
    loginOverride: normalizeOverride(body.login_override),
    verificationOverride: normalizeOverride(body.verification_override),
    reason: null,
    secretConfigured: true,
  };
}

/**
 * Test/dev helper: produce a signature the way the theme's Liquid will.
 *
 * Exists so tests never hand-roll the payload format — if `buildPayload` changes,
 * the tests follow automatically instead of silently testing the old shape.
 *
 * @returns {string|null} null if the payload is unusable.
 */
export function signIdentity(parts, secret = process.env.LOGO_UPLOAD_SECRET) {
  const payload = buildPayload(parts);
  if (payload === null || !secret) return null;
  return sign(payload, secret);
}
