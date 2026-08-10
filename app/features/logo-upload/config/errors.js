/**
 * Error codes for the logo-upload feature.
 *
 * PURE DATA — no imports, no framework, no server-only code. This file is half of
 * the app <-> theme contract (TASKS.md §4.4): the theme maps these `code` strings
 * to the messages a customer actually sees, so they must stay stable. Changing a
 * string here is a breaking change for the theme.
 *
 * The theme should switch on `code`, NEVER on the HTTP status or the message text
 * — several codes share a status, and messages are merchant-editable.
 *
 * `message` here is the fallback the app returns. The theme is free to override
 * it with merchant copy; it exists so a raw curl gets something intelligible and
 * so the theme has a sane default before settings load.
 */

/**
 * @typedef {object} LogoUploadError
 * @property {string}  code      Stable identifier. The theme switches on this.
 * @property {number}  status    HTTP status to respond with.
 * @property {string}  message   Customer-safe fallback message.
 * @property {boolean} retryable Whether retrying the same action could succeed.
 * @property {boolean} reopenModal Whether the theme should re-open the gate modal.
 */

/** @type {Record<string, LogoUploadError>} */
export const ERRORS = {
  // ---------------------------------------------------------------- 400
  // Kept byte-identical to the existing /api/upload response so the theme's
  // current handling of an empty submit is unchanged.
  no_file: {
    code: "no_file",
    status: 400,
    message: "No file uploaded",
    retryable: true,
    reopenModal: false,
  },

  // The code was wrong, already used, or never existed. Deliberately does NOT
  // distinguish those cases — telling an attacker which one it was is free
  // information.
  code_invalid: {
    code: "code_invalid",
    status: 400,
    message: "That code isn't right. Check the email and try again.",
    retryable: true,
    reopenModal: true,
  },

  code_expired: {
    code: "code_expired",
    status: 400,
    message: "That code has expired. Request a new one.",
    retryable: true,
    reopenModal: true,
  },

  // The attempt cap was hit and the code row is burned. A NEW code is required —
  // retrying the same one can never work, which is why retryable is false.
  too_many_attempts: {
    code: "too_many_attempts",
    status: 400,
    message: "Too many incorrect attempts. Request a new code.",
    retryable: false,
    reopenModal: true,
  },

  // ---------------------------------------------------------------- 401
  // The gate is on and the request carried no trustworthy customer identity.
  login_required: {
    code: "login_required",
    status: 401,
    message: "Please sign in to upload your logo.",
    retryable: false,
    reopenModal: true,
  },

  // An identity WAS supplied but the HMAC did not verify. Either a forgery, or
  // the customer's session ended and the page is serving a stale signature.
  // Same customer-facing treatment as login_required — the distinction matters
  // for logs, not for the shopper.
  invalid_signature: {
    code: "invalid_signature",
    status: 401,
    message: "Your session has ended. Please sign in again.",
    retryable: false,
    reopenModal: true,
  },

  // OPERATIONAL, NOT A SHOPPER PROBLEM. Raised when LOGO_UPLOAD_SECRET is unset
  // in the app, or does not match the secret in the theme snippet. Kept distinct
  // from invalid_signature precisely so this shows up as a misconfiguration in
  // logs instead of hiding inside a pile of generic 401s — with a shared secret
  // this is the single most likely thing to break (plan §8).
  gate_secret_unconfigured: {
    code: "gate_secret_unconfigured",
    status: 401,
    message: "Uploads are temporarily unavailable. Please contact us.",
    retryable: false,
    reopenModal: false,
  },

  // ---------------------------------------------------------------- 403
  email_verification_required: {
    code: "email_verification_required",
    status: 403,
    message: "Please verify your email address to upload.",
    retryable: false,
    reopenModal: true,
  },

  // A signed-in customer tried to verify an address that is not theirs. Without
  // this, one customer could verify someone else's email.
  email_mismatch: {
    code: "email_mismatch",
    status: 403,
    message: "That email doesn't match the account you're signed in with.",
    retryable: false,
    reopenModal: true,
  },

  // ---------------------------------------------------------------- 429
  rate_limited: {
    code: "rate_limited",
    status: 429,
    message: "Too many requests. Please wait a few minutes and try again.",
    retryable: true,
    reopenModal: true,
  },

  // ---------------------------------------------------------------- 5xx
  // The file never reached Shopify Files. Nothing is recorded.
  upload_failed: {
    code: "upload_failed",
    status: 500,
    message: "Upload failed. Please try again.",
    retryable: true,
    reopenModal: false,
  },

  // Could not send the verification email. The upload is NOT silently allowed —
  // failing open here would defeat the whole feature.
  email_send_failed: {
    code: "email_send_failed",
    status: 500,
    message: "We couldn't send the code. Please try again or contact us.",
    retryable: true,
    reopenModal: true,
  },

  server_error: {
    code: "server_error",
    status: 500,
    message: "Something went wrong. Please try again.",
    retryable: true,
    reopenModal: false,
  },
};

/** Every valid code, for validation and for the theme's exhaustiveness checks. */
export const ERROR_CODES = Object.keys(ERRORS);

/**
 * Build the JSON body for an error response.
 *
 * Returns `{ error, code, message, retryable }`. `error` duplicates `code` on
 * purpose: the existing /api/upload returns `{ error: "..." }` and the current
 * theme reads that shape, so keeping it means the new endpoint stays
 * drop-in compatible with any handling that already exists.
 *
 * @param {string} code   A key of ERRORS.
 * @param {object} [over] Optional overrides, e.g. a merchant-configured message.
 */
export function errorBody(code, over = {}) {
  const spec = ERRORS[code] ?? ERRORS.server_error;
  return {
    error: spec.code,
    code: spec.code,
    message: over.message ?? spec.message,
    retryable: spec.retryable,
    reopenModal: spec.reopenModal,
    ...(over.detail ? { detail: over.detail } : {}),
  };
}

/**
 * HTTP status for a code. Falls back to 500 for anything unrecognised, so a typo
 * can never accidentally return a 200.
 *
 * @param {string} code
 */
export function errorStatus(code) {
  return (ERRORS[code] ?? ERRORS.server_error).status;
}
