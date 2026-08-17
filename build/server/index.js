var _a;
import { jsx, jsxs } from "react/jsx-runtime";
import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { RemixServer, Meta, Links, Outlet, ScrollRestoration, Scripts, useLoaderData, useActionData, Form, Link, useRouteError, useNavigation, useNavigate, useSearchParams } from "@remix-run/react";
import { createReadableStreamFromReadable, json, redirect } from "@remix-run/node";
import { isbot } from "isbot";
import "@shopify/shopify-app-remix/adapters/node";
import { shopifyApp, AppDistribution, ApiVersion, LoginErrorType, boundary } from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { PrismaClient } from "@prisma/client";
import postgres from "postgres";
import crypto from "node:crypto";
import nodemailer from "nodemailer";
import { useState, useEffect, useMemo } from "react";
import { AppProvider, Page, Card, FormLayout, Text, TextField, Button, BlockStack, Banner, Checkbox, Select, Box, Layout, EmptyState, IndexTable, Link as Link$1, Badge, Icon, InlineStack, Pagination, LegacyCard, Thumbnail, Divider, Tooltip } from "@shopify/polaris";
import { AppProvider as AppProvider$1 } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { SearchIcon, ViewIcon } from "@shopify/polaris-icons";
if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}
const prisma = global.prismaGlobal ?? new PrismaClient();
const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: (_a = process.env.SCOPES) == null ? void 0 : _a.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    removeRest: true
  },
  ...process.env.SHOP_CUSTOM_DOMAIN ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] } : {}
});
ApiVersion.January25;
const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
const authenticate = shopify.authenticate;
shopify.unauthenticated;
const login = shopify.login;
shopify.registerWebhooks;
shopify.sessionStorage;
const streamTimeout = 5e3;
async function handleRequest(request, responseStatusCode, responseHeaders, remixContext) {
  addDocumentResponseHeaders(request, responseHeaders);
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? "") ? "onAllReady" : "onShellReady";
  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      /* @__PURE__ */ jsx(RemixServer, { context: remixContext, url: request.url }),
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        }
      }
    );
    setTimeout(abort, streamTimeout + 1e3);
  });
}
const entryServer = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: handleRequest,
  streamTimeout
}, Symbol.toStringTag, { value: "Module" }));
function App$2() {
  return /* @__PURE__ */ jsxs("html", { lang: "en", children: [
    /* @__PURE__ */ jsxs("head", { children: [
      /* @__PURE__ */ jsx("meta", { charSet: "utf-8" }),
      /* @__PURE__ */ jsx("meta", { name: "viewport", content: "width=device-width,initial-scale=1" }),
      /* @__PURE__ */ jsx("link", { rel: "preconnect", href: "https://cdn.shopify.com/" }),
      /* @__PURE__ */ jsx(
        "link",
        {
          rel: "stylesheet",
          href: "https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        }
      ),
      /* @__PURE__ */ jsx(Meta, {}),
      /* @__PURE__ */ jsx(Links, {})
    ] }),
    /* @__PURE__ */ jsxs("body", { children: [
      /* @__PURE__ */ jsx(Outlet, {}),
      /* @__PURE__ */ jsx(ScrollRestoration, {}),
      /* @__PURE__ */ jsx(Scripts, {})
    ] })
  ] });
}
const route0 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: App$2
}, Symbol.toStringTag, { value: "Module" }));
const action$a = async ({ request }) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  const current = payload.current;
  if (session) {
    await prisma.session.update({
      where: {
        id: session.id
      },
      data: {
        scope: current.toString()
      }
    });
  }
  return new Response();
};
const route1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$a
}, Symbol.toStringTag, { value: "Module" }));
const FORM_SUBMISSIONS_TABLE = "form_submissions";
let _sql = null;
function getSql() {
  const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Database not configured: set DATABASE_URL (or SUPABASE_DB_URL) env var"
    );
  }
  if (!_sql) {
    _sql = postgres(url, {
      // pgbouncer transaction pooling can't use prepared statements.
      prepare: false,
      ssl: "require",
      // Keep the serverless connection footprint small.
      max: 1,
      idle_timeout: 20
    });
  }
  return _sql;
}
const COLUMNS = [
  "form_type",
  "shop",
  "email",
  "phone",
  "company",
  "name",
  "product_url",
  "product_handle",
  "product_title",
  "product_id",
  "media_url",
  "media_name",
  "email_status",
  "payload"
];
async function insertFormSubmission(row) {
  const sql = getSql();
  const record = {};
  for (const col of COLUMNS) {
    if (row[col] !== void 0) {
      record[col] = col === "payload" ? sql.json(row[col] ?? {}) : row[col];
    }
  }
  const [inserted] = await sql`
    insert into ${sql(FORM_SUBMISSIONS_TABLE)} ${sql(record)}
    returning id
  `;
  return inserted;
}
async function listFormSubmissions(shop) {
  if (!shop) return [];
  const sql = getSql();
  return sql`
    select * from ${sql(FORM_SUBMISSIONS_TABLE)}
    where shop = ${shop}
    order by created_at desc
  `;
}
async function getFormSubmission(id, shop) {
  if (!shop) return null;
  const sql = getSql();
  const [row] = await sql`
    select * from ${sql(FORM_SUBMISSIONS_TABLE)}
    where id = ${id} and shop = ${shop}
    limit 1
  `;
  return row ?? null;
}
const TABLES = Object.freeze({
  settings: "logo_upload_app_settings",
  customers: "logo_upload_customers",
  verifications: "logo_upload_email_verifications",
  files: "logo_upload_customer_files"
});
async function tryRead(run, fallback, context) {
  try {
    return { value: await run(), ok: true };
  } catch (err) {
    console.error(`[logo-upload] read failed (${context}):`, (err == null ? void 0 : err.message) ?? err);
    return { value: fallback, ok: false };
  }
}
const FAIL_MODES = (
  /** @type {const} */
  ["open", "closed"]
);
const OVERRIDES = (
  /** @type {const} */
  ["default", "on", "off"]
);
const SETTINGS_SPEC = {
  // ---------------------------------------------------------------- features
  require_login: {
    type: "boolean",
    default: false,
    public: true,
    label: "Require customer login to upload",
    help: "When on, visitors must be signed in before they can attach a logo. There is no guest path."
  },
  require_email_verification: {
    type: "boolean",
    default: false,
    public: true,
    label: "Require email verification",
    help: "Sends a 6-digit code that must be entered before the upload is accepted."
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
    help: "Vercel serverless functions reject any request body over ~4.5 MB, and that ceiling cannot be raised. 4 MB leaves room for the multipart overhead and the identity fields sent alongside the file."
  },
  // ---------------------------------------------------------------- timings
  verification_validity_days: {
    type: "integer",
    default: 30,
    min: 0,
    max: 365,
    public: false,
    label: "Verification valid for (days)",
    help: "How long a verified customer stays verified. 0 means verify on every upload."
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
    help: "How long a verification code stays usable."
  },
  verification_token_minutes: {
    type: "integer",
    default: 15,
    min: 1,
    max: 120,
    public: false,
    label: "Verification token lifetime (minutes)",
    help: "How long the browser may use a confirmed verification before the upload must be re-verified."
  },
  // ---------------------------------------------------------------- hardening
  max_code_attempts: {
    type: "integer",
    default: 5,
    min: 1,
    max: 20,
    public: false,
    label: "Max wrong code attempts",
    help: "After this many wrong guesses the code is burned and a new one must be requested."
  },
  rate_limit_email_per_15min: {
    type: "integer",
    default: 3,
    min: 1,
    max: 50,
    public: false,
    label: "Code requests per email / 15 min",
    help: ""
  },
  rate_limit_ip_per_hour: {
    type: "integer",
    default: 10,
    min: 1,
    max: 500,
    public: false,
    label: "Code requests per IP / hour",
    help: ""
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
    help: "open = allow the upload (protects sales). closed = block it."
  }
};
const COPY_SPEC = {
  login_heading: { default: "Sign in to upload your logo", max: 120 },
  login_body: {
    default: "You'll need an account before you can attach artwork to this product.",
    max: 400
  },
  login_sign_in: { default: "Sign in", max: 40 },
  login_create_account: { default: "Create account", max: 40 },
  login_close: { default: "Close", max: 40 },
  verify_heading: { default: "Verify your email", max: 120 },
  verify_body: {
    default: "We'll email you a 6-digit code to confirm this address.",
    max: 400
  },
  verify_send: { default: "Send code", max: 40 },
  verify_confirm: { default: "Verify", max: 40 },
  verify_resend: { default: "Resend code", max: 40 }
};
const SETTINGS_DEFAULTS = Object.freeze({
  ...Object.fromEntries(
    Object.entries(SETTINGS_SPEC).map(([key, spec]) => [key, spec.default])
  ),
  copy: Object.freeze(
    Object.fromEntries(
      Object.entries(COPY_SPEC).map(([key, spec]) => [key, spec.default])
    )
  )
});
function mergeSettings(stored) {
  const source = stored && typeof stored === "object" ? stored : {};
  const merged = { ...SETTINGS_DEFAULTS, ...source };
  merged.copy = { ...SETTINGS_DEFAULTS.copy, ...source.copy ?? {} };
  return merged;
}
function coerceSettings(patch) {
  const out = {};
  if (!patch || typeof patch !== "object") return out;
  for (const [key, spec] of Object.entries(SETTINGS_SPEC)) {
    if (!(key in patch)) continue;
    const raw = patch[key];
    if (spec.type === "boolean") {
      if (typeof raw === "boolean") out[key] = raw;
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
      if (trimmed) copy[key] = trimmed;
    }
    if (Object.keys(copy).length) out.copy = copy;
  }
  return out;
}
function toPublicSettings(settings) {
  const merged = mergeSettings(settings);
  const out = {};
  for (const [key, spec] of Object.entries(SETTINGS_SPEC)) {
    if (spec.public) out[camel(key)] = merged[key];
  }
  out.copy = { ...merged.copy };
  return out;
}
function camel(key) {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
function resolveOverride(override, appValue) {
  if (override === "on") return true;
  if (override === "off") return false;
  return appValue;
}
const CACHE_TTL_MS = 6e4;
const FAILURE_BACKOFF_MS = 5e3;
const cache = /* @__PURE__ */ new Map();
async function getSettings(shop) {
  var _a2;
  if (!shop) {
    return { settings: mergeSettings(null), degraded: true, source: "defaults" };
  }
  const hit = cache.get(shop);
  const now = Date.now();
  if (hit) {
    const age = now - hit.at;
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
    `getSettings(${shop})`
  );
  if (ok) {
    const settings2 = mergeSettings(((_a2 = rows == null ? void 0 : rows[0]) == null ? void 0 : _a2.settings) ?? null);
    cache.set(shop, { settings: settings2, at: now, ok: true });
    return { settings: settings2, degraded: false, source: "db" };
  }
  if (hit) {
    cache.set(shop, { settings: hit.settings, at: now, ok: false });
    return { settings: hit.settings, degraded: true, source: "stale-cache" };
  }
  const settings = mergeSettings(null);
  cache.set(shop, { settings, at: now, ok: false });
  return { settings, degraded: true, source: "defaults" };
}
async function saveSettings(shop, patch) {
  if (!shop) throw new Error("saveSettings: shop is required");
  const clean = coerceSettings(patch);
  const sql = getSql();
  const [existing] = await sql`
    select settings from ${sql(TABLES.settings)}
    where shop = ${shop}
    limit 1
  `;
  const stored = (existing == null ? void 0 : existing.settings) ?? {};
  const next = { ...stored, ...clean };
  if (clean.copy || stored.copy) {
    next.copy = { ...stored.copy ?? {}, ...clean.copy ?? {} };
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
async function getPublicSettings(shop) {
  const { settings, degraded } = await getSettings(shop);
  return { settings: toPublicSettings(settings), degraded };
}
const ERRORS = {
  // ---------------------------------------------------------------- 400
  // Kept byte-identical to the existing /api/upload response so the theme's
  // current handling of an empty submit is unchanged.
  no_file: {
    code: "no_file",
    status: 400,
    message: "No file uploaded",
    retryable: true,
    reopenModal: false
  },
  // The code was wrong, already used, or never existed. Deliberately does NOT
  // distinguish those cases — telling an attacker which one it was is free
  // information.
  code_invalid: {
    code: "code_invalid",
    status: 400,
    message: "That code isn't right. Check the email and try again.",
    retryable: true,
    reopenModal: true
  },
  code_expired: {
    code: "code_expired",
    status: 400,
    message: "That code has expired. Request a new one.",
    retryable: true,
    reopenModal: true
  },
  // The attempt cap was hit and the code row is burned. A NEW code is required —
  // retrying the same one can never work, which is why retryable is false.
  too_many_attempts: {
    code: "too_many_attempts",
    status: 400,
    message: "Too many incorrect attempts. Request a new code.",
    retryable: false,
    reopenModal: true
  },
  // ---------------------------------------------------------------- 401
  // The gate is on and the request carried no trustworthy customer identity.
  login_required: {
    code: "login_required",
    status: 401,
    message: "Please sign in to upload your logo.",
    retryable: false,
    reopenModal: true
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
    reopenModal: true
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
    reopenModal: false
  },
  // ---------------------------------------------------------------- 403
  email_verification_required: {
    code: "email_verification_required",
    status: 403,
    message: "Please verify your email address to upload.",
    retryable: false,
    reopenModal: true
  },
  // A signed-in customer tried to verify an address that is not theirs. Without
  // this, one customer could verify someone else's email.
  email_mismatch: {
    code: "email_mismatch",
    status: 403,
    message: "That email doesn't match the account you're signed in with.",
    retryable: false,
    reopenModal: true
  },
  // ---------------------------------------------------------------- 429
  rate_limited: {
    code: "rate_limited",
    status: 429,
    message: "Too many requests. Please wait a few minutes and try again.",
    retryable: true,
    reopenModal: true
  },
  // ---------------------------------------------------------------- 5xx
  // The file never reached Shopify Files. Nothing is recorded.
  upload_failed: {
    code: "upload_failed",
    status: 500,
    message: "Upload failed. Please try again.",
    retryable: true,
    reopenModal: false
  },
  // Could not send the verification email. The upload is NOT silently allowed —
  // failing open here would defeat the whole feature.
  email_send_failed: {
    code: "email_send_failed",
    status: 500,
    message: "We couldn't send the code. Please try again or contact us.",
    retryable: true,
    reopenModal: true
  },
  server_error: {
    code: "server_error",
    status: 500,
    message: "Something went wrong. Please try again.",
    retryable: true,
    reopenModal: false
  }
};
function errorBody(code, over = {}) {
  const spec = ERRORS[code] ?? ERRORS.server_error;
  return {
    error: spec.code,
    code: spec.code,
    message: over.message ?? spec.message,
    retryable: spec.retryable,
    reopenModal: spec.reopenModal,
    ...over.detail ? { detail: over.detail } : {}
  };
}
function errorStatus(code) {
  return (ERRORS[code] ?? ERRORS.server_error).status;
}
const ALLOW_METHODS = "POST, GET, OPTIONS";
const ALLOW_HEADERS = "Content-Type, Authorization";
const MAX_AGE = "86400";
function allowlist() {
  return (process.env.STOREFRONT_ORIGIN ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}
function matches(origin, pattern) {
  if (pattern === "*") return true;
  if (pattern === origin) return true;
  if (pattern.startsWith("*.")) {
    let host;
    try {
      host = new URL(origin).host;
    } catch {
      return false;
    }
    const suffix = pattern.slice(1);
    return host.endsWith(suffix) && host.length > suffix.length;
  }
  return false;
}
function corsHeaders$4(request) {
  var _a2, _b;
  const list2 = allowlist();
  const origin = ((_b = (_a2 = request == null ? void 0 : request.headers) == null ? void 0 : _a2.get) == null ? void 0 : _b.call(_a2, "Origin")) ?? "";
  let allowOrigin;
  if (!list2.length) {
    allowOrigin = "*";
  } else if (origin && list2.some((p) => matches(origin, p))) {
    allowOrigin = origin;
  } else {
    allowOrigin = list2.find((p) => !p.includes("*")) ?? "null";
  }
  const headers2 = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": ALLOW_METHODS,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Max-Age": MAX_AGE
  };
  if (allowOrigin !== "*") headers2.Vary = "Origin";
  return headers2;
}
function preflight(request) {
  return new Response(null, { status: 204, headers: corsHeaders$4(request) });
}
function methodNotAllowed(request) {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: corsHeaders$4(request)
  });
}
function jsonWithCors(data, opts = {}) {
  return json(data, {
    status: opts.status ?? 200,
    headers: { ...corsHeaders$4(opts.request), ...opts.headers ?? {} }
  });
}
function errorWithCors(code, opts = {}) {
  return json(errorBody(code, { message: opts.message, detail: opts.detail }), {
    status: errorStatus(code),
    headers: { ...corsHeaders$4(opts.request), ...opts.headers ?? {} }
  });
}
async function loader$f({ request }) {
  if (request.method === "OPTIONS") return preflight(request);
  if (request.method !== "GET") return methodNotAllowed(request);
  const url = new URL(request.url);
  const shop = (url.searchParams.get("shop") ?? "").trim().toLowerCase();
  if (!shop) {
    const { settings: settings2 } = await getPublicSettings("");
    return jsonWithCors(
      { ...settings2, degraded: true },
      { request, headers: { "Cache-Control": "no-store" } }
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
        "Cache-Control": degraded ? "public, max-age=0, s-maxage=5" : "public, max-age=0, s-maxage=60"
      }
    }
  );
}
const route2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$f
}, Symbol.toStringTag, { value: "Module" }));
const action$9 = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  if (session) {
    await prisma.session.deleteMany({ where: { shop } });
  }
  return new Response();
};
const route3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$9
}, Symbol.toStringTag, { value: "Module" }));
function getCreds() {
  const SHOP = process.env.SHOPIFY_SHOP;
  const CLIENT_ID = process.env.SHOPIFY_API_KEY || process.env.SHOPIFY_CLIENT_ID;
  const CLIENT_SECRET = process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_CLIENT_SECRET;
  const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-07";
  if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      "Server missing SHOPIFY_SHOP / SHOPIFY_API_KEY / SHOPIFY_API_SECRET env vars"
    );
  }
  return { SHOP, CLIENT_ID, CLIENT_SECRET, API_VERSION };
}
async function getAdminToken({ SHOP, CLIENT_ID, CLIENT_SECRET }) {
  const tokenRes = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "client_credentials"
    })
  });
  const tokenJson = await tokenRes.json().catch(() => null);
  const token = tokenJson == null ? void 0 : tokenJson.access_token;
  if (!token) {
    throw new Error(
      `Failed to obtain Admin API access token: ${JSON.stringify(tokenJson)}`
    );
  }
  return token;
}
async function adminGraphql({ SHOP, API_VERSION }, token, query, variables) {
  const res = await fetch(
    `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token
      },
      body: JSON.stringify({ query, variables })
    }
  );
  return res.json();
}
async function uploadToShopifyFiles(file) {
  var _a2, _b, _c, _d, _e, _f, _g, _h;
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("uploadToShopifyFiles: expected a File");
  }
  const creds = getCreds();
  const token = await getAdminToken(creds);
  const mimeType = /\.eps$/i.test(file.name || "") ? "application/postscript" : file.type || "application/octet-stream";
  const stagedJson = await adminGraphql(
    creds,
    token,
    `
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets { url resourceUrl parameters { name value } }
          userErrors { field message }
        }
      }
    `,
    {
      input: [
        { resource: "FILE", filename: file.name, mimeType, httpMethod: "POST" }
      ]
    }
  );
  const target = (_c = (_b = (_a2 = stagedJson == null ? void 0 : stagedJson.data) == null ? void 0 : _a2.stagedUploadsCreate) == null ? void 0 : _b.stagedTargets) == null ? void 0 : _c[0];
  if (!target) {
    throw new Error(`Failed staged target: ${JSON.stringify(stagedJson)}`);
  }
  const resourceUrl = target.resourceUrl;
  const uploadForm = new FormData();
  for (const param of target.parameters) {
    uploadForm.append(param.name, param.value);
  }
  uploadForm.append("file", file);
  const uploadRes = await fetch(target.url, { method: "POST", body: uploadForm });
  if (!uploadRes.ok) {
    throw new Error("Staged bucket upload failed");
  }
  const isImage = (file.type || "").startsWith("image/") && !/\.eps$/i.test(file.name || "");
  const contentType = isImage ? "IMAGE" : "FILE";
  const fileCreateJson = await adminGraphql(
    creds,
    token,
    `
      mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            ... on MediaImage { image { url } }
            ... on GenericFile { url }
          }
          userErrors { field message }
        }
      }
    `,
    {
      files: [{ contentType, originalSource: resourceUrl, alt: file.name }]
    }
  );
  const createdFile = (_f = (_e = (_d = fileCreateJson == null ? void 0 : fileCreateJson.data) == null ? void 0 : _d.fileCreate) == null ? void 0 : _e.files) == null ? void 0 : _f[0];
  if (!createdFile) {
    throw new Error(`File not created: ${JSON.stringify(fileCreateJson)}`);
  }
  const fileId = createdFile.id;
  await new Promise((r) => setTimeout(r, 2e3));
  const queryData = await adminGraphql(
    creds,
    token,
    `
      query getFile($id: ID!) {
        node(id: $id) {
          ... on MediaImage { id image { url } }
          ... on GenericFile { id url }
        }
      }
    `,
    { id: fileId }
  );
  const node = (_g = queryData == null ? void 0 : queryData.data) == null ? void 0 : _g.node;
  const url = ((_h = node == null ? void 0 : node.image) == null ? void 0 : _h.url) || (node == null ? void 0 : node.url) || null;
  return { url, fileId };
}
const PAYLOAD_VERSION = "v1";
const DELIMITER = "|";
const GID_PATTERN = /^gid:\/\/shopify\/Customer\/\d+$/;
const UNTRUSTED = Object.freeze({
  NO_SECRET: "no_secret",
  // operational: LOGO_UPLOAD_SECRET is not set
  NO_SIGNATURE: "no_signature",
  // nothing was sent — old theme, or stripped
  BAD_SIGNATURE: "bad_signature",
  MALFORMED: "malformed"
  // a field contained the delimiter, or is unusable
});
function isSecretConfigured() {
  var _a2;
  return Boolean((_a2 = process.env.LOGO_UPLOAD_SECRET) == null ? void 0 : _a2.trim());
}
function secrets() {
  return [process.env.LOGO_UPLOAD_SECRET, process.env.LOGO_UPLOAD_SECRET_PREVIOUS].map((s) => s == null ? void 0 : s.trim()).filter(Boolean);
}
function buildPayload({ shop, loginOverride, verificationOverride, customerGid, email }) {
  const fields = [
    PAYLOAD_VERSION,
    shop ?? "",
    loginOverride ?? "default",
    verificationOverride ?? "default",
    customerGid ?? "",
    email ?? ""
  ].map(String);
  if (fields.some((f) => f.includes(DELIMITER))) return null;
  return fields.join(DELIMITER);
}
function sign(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}
function normalizeGid(raw) {
  const v = String(raw ?? "").trim();
  return GID_PATTERN.test(v) ? v : null;
}
function normalizeOverride(raw) {
  const v = String(raw ?? "default").trim();
  return OVERRIDES.includes(v) ? v : "default";
}
function resolveCustomer(rawBody) {
  const body = rawBody ?? {};
  const untrusted = (reason, secretConfigured = true) => ({
    trusted: false,
    customerGid: null,
    email: null,
    loginOverride: "default",
    verificationOverride: "default",
    reason,
    secretConfigured
  });
  const keys = secrets();
  if (!keys.length) return untrusted(UNTRUSTED.NO_SECRET, false);
  const providedSig = String(body.customer_sig ?? "").trim().toLowerCase();
  if (!providedSig) return untrusted(UNTRUSTED.NO_SIGNATURE);
  const payload = buildPayload({
    shop: body.shop,
    loginOverride: body.login_override,
    verificationOverride: body.verification_override,
    customerGid: body.customer_gid,
    email: body.customer_email
  });
  if (payload === null) return untrusted(UNTRUSTED.MALFORMED);
  const matched = keys.some((secret) => safeEqual(sign(payload, secret), providedSig));
  if (!matched) return untrusted(UNTRUSTED.BAD_SIGNATURE);
  const rawEmail = String(body.customer_email ?? "").trim().toLowerCase();
  return {
    trusted: true,
    customerGid: normalizeGid(body.customer_gid),
    email: rawEmail || null,
    loginOverride: normalizeOverride(body.login_override),
    verificationOverride: normalizeOverride(body.verification_override),
    reason: null,
    secretConfigured: true
  };
}
async function isCustomerVerified(shop, identity = {}, validityDays = 30) {
  if (!shop) return false;
  const gid = identity.customerGid || null;
  const email = identity.email ? String(identity.email).trim().toLowerCase() : null;
  if (!gid && !email) return false;
  const days = Number(validityDays);
  if (!Number.isFinite(days) || days <= 0) return false;
  const sql = getSql();
  const { value: rows } = await tryRead(
    () => gid ? sql`
            select verified, verified_at from ${sql(TABLES.customers)}
            where shop = ${shop} and customer_gid = ${gid}
            limit 1
          ` : sql`
            select verified, verified_at from ${sql(TABLES.customers)}
            where shop = ${shop} and customer_gid is null and email = ${email}
            limit 1
          `,
    [],
    `isCustomerVerified(${shop})`
  );
  const row = rows == null ? void 0 : rows[0];
  if (!(row == null ? void 0 : row.verified) || !row.verified_at) return false;
  const ageMs = Date.now() - new Date(row.verified_at).getTime();
  return ageMs <= days * 24 * 60 * 60 * 1e3;
}
const WRITABLE = [
  "shop",
  "customer_gid",
  "customer_email",
  "email_verified",
  "identity_source",
  "file_url",
  "file_name",
  "file_size",
  "mime_type",
  "shopify_file_id",
  "product_id",
  "product_handle",
  "product_url",
  "ip"
];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
async function insertLogoUpload(row) {
  const record = {};
  for (const col of WRITABLE) {
    if ((row == null ? void 0 : row[col]) !== void 0) record[col] = row[col];
  }
  if (!Object.keys(record).length) {
    console.error("[logo-upload] AUDIT WRITE FAILED: nothing writable in row");
    return null;
  }
  try {
    const sql = getSql();
    const [inserted] = await sql`
      insert into ${sql(TABLES.files)} ${sql(record)}
      returning id
    `;
    return inserted ?? null;
  } catch (err) {
    console.error(
      "[logo-upload] AUDIT WRITE FAILED — the file uploaded successfully but was NOT recorded.",
      { shop: row == null ? void 0 : row.shop, customer_gid: row == null ? void 0 : row.customer_gid, file_url: row == null ? void 0 : row.file_url },
      (err == null ? void 0 : err.message) ?? err
    );
    return null;
  }
}
function likePattern(q) {
  const trimmed = String(q ?? "").trim();
  if (!trimmed) return null;
  return `%${trimmed.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
function searchClause(sql, pattern) {
  return sql`and (
    customer_email ilike ${pattern}
    or file_name ilike ${pattern}
    or product_handle ilike ${pattern}
    or customer_gid ilike ${pattern}
  )`;
}
async function listLogoUploads(shop, opts = {}) {
  if (!shop) return [];
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(opts.limit) || DEFAULT_LIMIT));
  const offset = Math.max(0, Number(opts.offset) || 0);
  const sql = getSql();
  const pattern = likePattern(opts.search);
  if (opts.customerGid) {
    return sql`
      select * from ${sql(TABLES.files)}
      where shop = ${shop} and customer_gid = ${opts.customerGid}
      ${pattern ? searchClause(sql, pattern) : sql``}
      order by created_at desc
      limit ${limit} offset ${offset}
    `;
  }
  return sql`
    select * from ${sql(TABLES.files)}
    where shop = ${shop}
    ${pattern ? searchClause(sql, pattern) : sql``}
    order by created_at desc
    limit ${limit} offset ${offset}
  `;
}
async function countLogoUploads(shop, opts = {}) {
  if (!shop) return 0;
  const sql = getSql();
  const pattern = likePattern(opts.search);
  const [row] = await sql`
    select count(*)::int as count from ${sql(TABLES.files)}
    where shop = ${shop}
    ${pattern ? searchClause(sql, pattern) : sql``}
  `;
  return (row == null ? void 0 : row.count) ?? 0;
}
function clientIp(request) {
  const fwd = request.headers.get("x-forwarded-for") ?? "";
  return fwd.split(",")[0].trim() || request.headers.get("x-real-ip") || null;
}
async function loader$e({ request }) {
  if (request.method === "OPTIONS") return preflight(request);
  return methodNotAllowed(request);
}
async function action$8({ request }) {
  var _a2, _b;
  if (request.method === "OPTIONS") return preflight(request);
  if (request.method !== "POST") return methodNotAllowed(request);
  try {
    let form2;
    try {
      form2 = await request.formData();
    } catch {
      return errorWithCors("no_file", { request });
    }
    const file = form2.get("file");
    if (!file || typeof file.arrayBuffer !== "function") {
      return errorWithCors("no_file", { request });
    }
    const body = Object.fromEntries(
      [...form2.entries()].filter(([, v]) => typeof v === "string")
    );
    const authoritativeShop = (process.env.SHOPIFY_SHOP || "").trim().toLowerCase();
    const submittedShop = (body.shop || "").trim().toLowerCase();
    const shop = authoritativeShop || submittedShop || null;
    if (authoritativeShop && submittedShop && submittedShop !== authoritativeShop) {
      console.warn(
        `[logo-upload] shop mismatch — request claimed "${submittedShop}", server serves "${authoritativeShop}"`
      );
    }
    const { settings, degraded } = await getSettings(shop);
    if (degraded && settings.fail_mode === "closed") {
      return errorWithCors("server_error", {
        request,
        message: "Uploads are temporarily unavailable. Please try again shortly."
      });
    }
    const identity = resolveCustomer(body);
    const requireLogin = resolveOverride(
      identity.loginOverride,
      settings.require_login
    );
    const requireVerification = resolveOverride(
      identity.verificationOverride,
      settings.require_email_verification
    );
    const gated = requireLogin || requireVerification;
    if (gated && identity.reason === UNTRUSTED.NO_SECRET) {
      console.error(
        "[logo-upload] LOGO_UPLOAD_SECRET is not set, but a gate is enabled — every gated upload will fail."
      );
      return errorWithCors("gate_secret_unconfigured", { request });
    }
    if (requireLogin && !identity.customerGid) {
      const code = identity.reason === UNTRUSTED.BAD_SIGNATURE || identity.reason === UNTRUSTED.MALFORMED ? "invalid_signature" : "login_required";
      return errorWithCors(code, {
        request,
        message: (_a2 = settings.copy) == null ? void 0 : _a2.login_heading
      });
    }
    if (requireVerification) {
      const verified = await isCustomerVerified(
        shop,
        { customerGid: identity.customerGid, email: identity.email },
        settings.verification_validity_days
      );
      if (!verified) {
        return errorWithCors("email_verification_required", {
          request,
          message: (_b = settings.copy) == null ? void 0 : _b.verify_heading
        });
      }
    }
    let result;
    try {
      result = await uploadToShopifyFiles(file);
    } catch (err) {
      console.error("[logo-upload] Shopify Files upload failed:", (err == null ? void 0 : err.message) ?? err);
      return errorWithCors("upload_failed", { request });
    }
    if (!(result == null ? void 0 : result.url)) {
      return errorWithCors("upload_failed", { request });
    }
    await insertLogoUpload({
      shop,
      customer_gid: identity.customerGid,
      customer_email: identity.email,
      // Records whether verification was ENFORCED AND SATISFIED for this
      // specific upload, not the customer's state today. null = not required.
      email_verified: requireVerification ? true : null,
      identity_source: identity.trusted ? "liquid_hmac" : null,
      file_url: result.url,
      file_name: file.name ?? null,
      file_size: typeof file.size === "number" ? file.size : null,
      mime_type: file.type || null,
      shopify_file_id: result.fileId ?? null,
      product_id: body.product_id ?? null,
      product_handle: body.product_handle ?? null,
      product_url: body.product_url ?? null,
      ip: clientIp(request)
    });
    return jsonWithCors({ url: result.url, fileId: result.fileId }, { request });
  } catch (err) {
    console.error("[logo-upload] unexpected error:", err);
    return errorWithCors("server_error", { request });
  }
}
const route4 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$8,
  loader: loader$e
}, Symbol.toStringTag, { value: "Module" }));
const NOTIFY_RECIPIENTS$1 = [
  "sales@logomatcentral.com"
];
const REPLY_TO$1 = "sales@logomatcentral.com";
async function action$7({ request }) {
  var _a2;
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }
  try {
    const data = await request.json();
    const customerEmail = (data.email || "").trim();
    const hasCustomerEmail = customerEmail !== "";
    const shop = data.shop || process.env.SHOPIFY_SHOP || null;
    const productUrl = data.product_url || null;
    const productHandle = data.product_handle || null;
    const productId = data.product_id || null;
    let transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        // BACKUP senders (kept for reference):
        // user: 'sales.logomat@gmail.com', pass: "Sales@logomat@123*",
        user: "logomatcentral.sales@gmail.com",
        pass: "jaotjhnzpzkxjani"
      }
    });
    let email = `
      <h2>Shipping Quote</h2>
      <p>Product Name: ${data.title}</p>
      <p>Company: ${data.company}</p>
      <p>Street: ${data.street}</p>
      <p>Apt: ${data.apt}</p>
      <p>City: ${data.city}</p>
      <p>State: ${data.state}</p>
      <p>ZIP: ${data.zip}</p>
      <p>Loading Dock: ${data.loading_dock}</p>
      <p>Liftgate: ${data.liftgate}</p>
      <p>Email: ${data.email}</p>
      <p>Phone: ${data.phone}</p>
      <p>Cartons: ${data.cartons}</p>
      <p>Comments: ${data.comments}</p>
      <p>Size: ${data.variant_id}</p>
      <p>Thickness: ${data.thickness || ""}</p>
      <p>Product URL: ${data.product_url || ""}</p>
      <p>Product Handle: ${data.product_handle || ""}</p>
      <p>Store: ${data.shop || ""}</p>
    `;
    let info = await transporter.sendMail({
      // from: '"Shipping Info" <sales.logomat@gmail.com>',   // BACKUP
      from: '"Shipping Info" <logomatcentral.sales@gmail.com>',
      // Reply goes to the customer who submitted the form (falls back to company inbox).
      replyTo: hasCustomerEmail ? customerEmail : REPLY_TO$1,
      to: NOTIFY_RECIPIENTS$1.join(", "),
      subject: "Shipping Info",
      html: email
    });
    if (hasCustomerEmail) {
      await transporter.sendMail({
        // from: '"Logo Mat Central" <sales.logomat@gmail.com>',   // BACKUP
        from: '"Logo Mat Central" <logomatcentral.sales@gmail.com>',
        // Reply goes to the company inbox so customer replies reach sales.
        replyTo: REPLY_TO$1,
        to: customerEmail,
        subject: "Thank You from Logo Mat Central",
        html: `
          <div style="font-family: Arial, sans-serif; font-size: 15px; color: #333;">
            <p>Dear ${data.name || "Customer"},</p>
            <p>Thank you for choosing <strong>Logo Mat Central</strong>. We have received your email and will get back to you shortly.</p>
            <p>Our team is reviewing your information and will contact you soon.</p>
            <br>
            <p>Best regards,</p>
            <p><strong>Logo Mat Central Support Team</strong></p>
          </div>
        `
      });
    }
    const emailStatus = ((_a2 = info == null ? void 0 : info.accepted) == null ? void 0 : _a2.length) > 0 ? "true" : "false";
    try {
      await insertFormSubmission({
        form_type: "shipping_form",
        shop,
        email: data.email || null,
        phone: data.phone || null,
        company: data.company || null,
        name: data.name || null,
        product_url: productUrl,
        product_handle: productHandle,
        product_id: productId,
        product_title: data.title || null,
        email_status: emailStatus,
        payload: data
      });
    } catch (dbErr) {
      console.error("Failed to save shipping_form submission to Supabase:", dbErr);
    }
    return json(
      { message: "Shipping info saved successfully" },
      {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      }
    );
  } catch (error) {
    console.error("Error saving shipping info:", error);
    return json(
      { error: "Failed to save shipping info" },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      }
    );
  }
}
async function loader$d({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }
  return new Response("Method Not Allowed", {
    status: 405,
    headers: {
      "Allow": "POST, OPTIONS"
    }
  });
}
const route5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$7,
  loader: loader$d
}, Symbol.toStringTag, { value: "Module" }));
const NOTIFY_RECIPIENTS = [
  "sales@logomatcentral.com"
];
const REPLY_TO = "sales@logomatcentral.com";
const action$6 = async ({ request }) => {
  var _a2;
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }
  const formData = await request.formData();
  const data = {};
  formData.forEach((value, key) => {
    if (value instanceof File) {
      data[key] = {
        name: value.name,
        type: value.type,
        size: value.size
      };
    } else {
      data[key] = value;
    }
  });
  const customerEmail = (data.email || "").trim();
  const hasCustomerEmail = customerEmail !== "";
  const shop = data.shop || process.env.SHOPIFY_SHOP || null;
  const productUrl = data.product_url || null;
  const productHandle = data.product_handle || null;
  const productId = data.product_id || null;
  const file = formData.get("attachment");
  const hasFile = file instanceof File && file.name;
  const attachments = hasFile ? [
    {
      filename: file.name,
      content: Buffer.from(await file.arrayBuffer()),
      contentType: file.type
    }
  ] : [];
  let mediaUrl = null;
  let mediaName = hasFile ? file.name : null;
  if (hasFile) {
    try {
      const uploaded = await uploadToShopifyFiles(file);
      mediaUrl = uploaded.url;
    } catch (uploadErr) {
      console.error("Failed to upload attachment to Shopify Files:", uploadErr);
    }
  }
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      // BACKUP senders (kept for reference):
      // user: 'sales.logomat@gmail.com', pass: "Sales@logomat@123*",
      user: "logomatcentral.sales@gmail.com",
      pass: "jaotjhnzpzkxjani"
    }
  });
  let mydata = `<h1><b>New Logo Mat Order Submission</b></h1>`;
  if (data.mat_type) mydata += `<p>Product Name: ${data.mat_type}</p>`;
  if (data.quantity) mydata += `<p>Quantity: ${data.quantity}</p>`;
  if (data.company) mydata += `<p>Company: ${data.company}</p>`;
  if (data.name) mydata += `<p>Name: ${data.name}</p>`;
  if (data.email) mydata += `<p>Email: ${data.email}</p>`;
  if (data.city) mydata += `<p>City: ${data.city}</p>`;
  if (data.state) mydata += `<p>State: ${data.state}</p>`;
  if (data.phone) mydata += `<p>Phone: ${data.phone}</p>`;
  if (data.logo_orientation) mydata += `<p>Logo Orientation: ${data.logo_orientation}</p>`;
  if (data.background_color) mydata += `<p>Background Color: ${data.background_color}</p>`;
  if (data.variant_id) mydata += `<p>Size: ${data.variant_id}</p>`;
  if (data.logo_edging) mydata += `<p>Logo Edging: ${data.logo_edging}</p>`;
  if (data.address) mydata += `<p>Address: ${data.address}</p>`;
  if (data.address2) mydata += `<p>Address 2: ${data.address2}</p>`;
  if (data.zip) mydata += `<p>ZIP: ${data.zip}</p>`;
  if (data.comments) mydata += `<p>Comments: ${data.comments}</p>`;
  if (data.product_url) mydata += `<p>Product URL: ${data.product_url}</p>`;
  if (data.product_handle) mydata += `<p>Product Handle: ${data.product_handle}</p>`;
  if (data.shop) mydata += `<p>Store: ${data.shop}</p>`;
  try {
    const info = await transporter.sendMail({
      // from: '"Mat Order" <sales.logomat@gmail.com>',   // BACKUP
      from: '"Mat Order" <logomatcentral.sales@gmail.com>',
      // Reply goes to the customer who submitted the form (falls back to company inbox).
      replyTo: hasCustomerEmail ? customerEmail : REPLY_TO,
      to: NOTIFY_RECIPIENTS.join(", "),
      subject: "New Mat Order Submission",
      html: mydata,
      attachments
    });
    if (hasCustomerEmail) {
      await transporter.sendMail({
        // from: '"Logo Mat Central" <sales.logomat@gmail.com>',   // BACKUP
        from: '"Logo Mat Central" <logomatcentral.sales@gmail.com>',
        // Reply goes to the company inbox so customer replies reach sales.
        replyTo: REPLY_TO,
        to: customerEmail,
        subject: "Thank You from Logo Mat Central",
        html: `
          <div style="font-family: Arial, sans-serif; font-size: 15px; color: #333;">
            <p>Dear ${data.name || "Customer"},</p>
            <p>Thank you for choosing <strong>Logo Mat Central</strong>. We have received your email and will get back to you shortly.</p>
            <p>Our team is reviewing your information and will contact you soon.</p>
            <br>
            <p>Best regards,</p>
            <p><strong>Logo Mat Central Support Team</strong></p>
          </div>
        `
      });
    }
    const emailStatus = ((_a2 = info == null ? void 0 : info.accepted) == null ? void 0 : _a2.length) > 0 ? "true" : "false";
    try {
      await insertFormSubmission({
        form_type: "request_quote",
        shop,
        email: data.email || null,
        phone: data.phone || null,
        company: data.company || null,
        name: data.name || null,
        product_url: productUrl,
        product_handle: productHandle,
        product_id: productId,
        product_title: data.mat_type || null,
        media_url: mediaUrl,
        media_name: mediaName,
        email_status: emailStatus,
        payload: data
      });
    } catch (dbErr) {
      console.error("Failed to save request_quote submission to Supabase:", dbErr);
    }
    return json(
      { message: "Shipping info saved successfully" },
      {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      }
    );
  } catch (err) {
    console.error("❌ Email failed:", err);
    return json(
      { error: "Failed to send email" },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      }
    );
  }
};
const loader$c = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }
  return new Response("Method Not Allowed", {
    status: 405,
    headers: {
      Allow: "POST, OPTIONS"
    }
  });
};
const route6 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$6,
  loader: loader$c
}, Symbol.toStringTag, { value: "Module" }));
const runtime$1 = "nodejs";
const corsHeaders$3 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
async function action$5({ request }) {
  var _a2, _b, _c;
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders$3 });
  }
  const { resourceUrl, filename } = await request.json();
  const SHOP = process.env.SHOPIFY_STORE;
  const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
  const API_VERSION = "2025-01";
  const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": TOKEN
    },
    body: JSON.stringify({
      query: `
        mutation fileCreate($files: [FileCreateInput!]!) {
          fileCreate(files: $files) {
            files {
              id
              ... on GenericFile { url }
            }
            userErrors { message }
          }
        }
      `,
      variables: {
        files: [{
          contentType: "FILE",
          originalSource: resourceUrl,
          alt: filename
        }]
      }
    })
  });
  const data = await res.json();
  const file = (_c = (_b = (_a2 = data == null ? void 0 : data.data) == null ? void 0 : _a2.fileCreate) == null ? void 0 : _b.files) == null ? void 0 : _c[0];
  if (!file) {
    return json({ error: "File not created", data }, { status: 500, headers: corsHeaders$3 });
  }
  return json(file, { headers: corsHeaders$3 });
}
const route7 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$5,
  runtime: runtime$1
}, Symbol.toStringTag, { value: "Module" }));
const runtime = "nodejs";
const corsHeaders$2 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
async function loader$b({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders$2 });
  }
  return json(
    { ok: true },
    { headers: corsHeaders$2 }
  );
}
async function action$4({ request }) {
  var _a2, _b, _c;
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders$2 });
  }
  const { filename } = await request.json();
  if (!filename || !filename.toLowerCase().endsWith(".eps")) {
    return json({ error: "Only EPS allowed" }, { status: 400, headers: corsHeaders$2 });
  }
  const SHOP = process.env.SHOPIFY_STORE;
  const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
  const API_VERSION = "2025-01";
  const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": TOKEN
    },
    body: JSON.stringify({
      query: `
        mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
          stagedUploadsCreate(input: $input) {
            stagedTargets {
              url
              resourceUrl
              parameters { name value }
            }
            userErrors { message }
          }
        }
      `,
      variables: {
        input: [{
          resource: "FILE",
          filename,
          mimeType: "application/postscript",
          httpMethod: "POST"
        }]
      }
    })
  });
  const data = await res.json();
  const target = (_c = (_b = (_a2 = data == null ? void 0 : data.data) == null ? void 0 : _a2.stagedUploadsCreate) == null ? void 0 : _b.stagedTargets) == null ? void 0 : _c[0];
  if (!target) {
    return json({ error: "Failed staged upload", data }, { status: 500, headers: corsHeaders$2 });
  }
  return json(target, { headers: corsHeaders$2 });
}
const route8 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$4,
  loader: loader$b,
  runtime
}, Symbol.toStringTag, { value: "Module" }));
const corsHeaders$1 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400"
};
async function loader$a({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders$1,
        "Access-Control-Max-Age": "86400"
      }
    });
  }
  return json(
    {
      message: "EPS Upload API - Use POST to upload files",
      endpoint: "/api/eps/upload",
      methods: ["GET", "POST", "OPTIONS"]
    },
    { status: 200, headers: corsHeaders$1 }
  );
}
function createTimeoutSignal(ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cleanup: () => clearTimeout(timeout) };
}
async function action$3({ request }) {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j;
  const startTime = Date.now();
  console.log("API Request:", {
    method: request.method,
    url: request.url,
    headers: Object.fromEntries(request.headers.entries())
  });
  try {
    const ADMIN_API_TOKEN = "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";
    const SHOP = "nws-test-3.myshopify.com";
    const API_VERSION = "2025-01";
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file) {
      return json({ error: "No file uploaded" }, { status: 400, headers: corsHeaders$1 });
    }
    const fileName = file.name || (typeof file === "object" && "name" in file ? file.name : null);
    if (!fileName) {
      return json({ error: "File name not found" }, { status: 400, headers: corsHeaders$1 });
    }
    if (!fileName.toLowerCase().endsWith(".eps")) {
      return json({ error: "Only EPS files allowed" }, { status: 400, headers: corsHeaders$1 });
    }
    const timeout1 = createTimeoutSignal(15e3);
    try {
      const stagedRes = await fetch(
        `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": ADMIN_API_TOKEN
          },
          body: JSON.stringify({
            query: `mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
              stagedUploadsCreate(input: $input) {
                stagedTargets { url resourceUrl parameters { name value } }
                userErrors { field message }
              }
            }`,
            variables: {
              input: [{
                resource: "FILE",
                filename: fileName,
                mimeType: "application/postscript",
                httpMethod: "POST"
              }]
            }
          }),
          signal: timeout1.signal
        }
      );
      timeout1.cleanup();
      if (!stagedRes.ok) {
        return json(
          { error: "Failed to create staged upload" },
          { status: 500, headers: corsHeaders$1 }
        );
      }
      const stagedJson = await stagedRes.json();
      const userErrors = (_b = (_a2 = stagedJson == null ? void 0 : stagedJson.data) == null ? void 0 : _a2.stagedUploadsCreate) == null ? void 0 : _b.userErrors;
      if (userErrors && userErrors.length > 0) {
        return json(
          { error: "Staged upload failed", userErrors },
          { status: 400, headers: corsHeaders$1 }
        );
      }
      const target = (_e = (_d = (_c = stagedJson == null ? void 0 : stagedJson.data) == null ? void 0 : _c.stagedUploadsCreate) == null ? void 0 : _d.stagedTargets) == null ? void 0 : _e[0];
      if (!target) {
        return json(
          { error: "Failed to create staged upload" },
          { status: 500, headers: corsHeaders$1 }
        );
      }
      const uploadForm = new FormData();
      for (const param of target.parameters) {
        uploadForm.append(param.name, param.value);
      }
      uploadForm.append("file", file);
      const fileSize = file.size || 0;
      const uploadTimeout = Math.max(3e4, Math.min(12e4, fileSize / 1e3));
      const timeout2 = createTimeoutSignal(uploadTimeout);
      try {
        const uploadRes = await fetch(target.url, {
          method: "POST",
          body: uploadForm,
          signal: timeout2.signal
        });
        timeout2.cleanup();
        if (!uploadRes.ok) {
          return json(
            { error: "File upload failed" },
            { status: 500, headers: corsHeaders$1 }
          );
        }
        await uploadRes.text();
        const timeout3 = createTimeoutSignal(15e3);
        try {
          const fileCreateRes = await fetch(
            `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": ADMIN_API_TOKEN
              },
              body: JSON.stringify({
                query: `mutation fileCreate($files: [FileCreateInput!]!) {
                  fileCreate(files: $files) {
                    files { id createdAt ... on GenericFile { url } }
                    userErrors { field message }
                  }
                }`,
                variables: {
                  files: [{
                    contentType: "FILE",
                    originalSource: target.resourceUrl,
                    alt: fileName
                  }]
                }
              }),
              signal: timeout3.signal
            }
          );
          timeout3.cleanup();
          if (!fileCreateRes.ok) {
            return json(
              { error: "Failed to register file" },
              { status: 500, headers: corsHeaders$1 }
            );
          }
          const fileCreateJson = await fileCreateRes.json();
          const fileCreateErrors = (_g = (_f = fileCreateJson == null ? void 0 : fileCreateJson.data) == null ? void 0 : _f.fileCreate) == null ? void 0 : _g.userErrors;
          if (fileCreateErrors && fileCreateErrors.length > 0) {
            return json(
              { error: "File registration failed", userErrors: fileCreateErrors },
              { status: 400, headers: corsHeaders$1 }
            );
          }
          const createdFile = (_j = (_i = (_h = fileCreateJson == null ? void 0 : fileCreateJson.data) == null ? void 0 : _h.fileCreate) == null ? void 0 : _i.files) == null ? void 0 : _j[0];
          if (!createdFile) {
            return json(
              { error: "File not registered" },
              { status: 500, headers: corsHeaders$1 }
            );
          }
          const duration = Date.now() - startTime;
          console.log(`Upload completed in ${duration}ms`);
          return json(
            {
              fileId: createdFile.id,
              url: target.resourceUrl,
              createdAt: createdFile.createdAt
            },
            { headers: corsHeaders$1 }
          );
        } catch (timeoutErr) {
          timeout3.cleanup();
          if (timeoutErr.name === "AbortError") {
            throw new Error("File registration timeout");
          }
          throw timeoutErr;
        }
      } catch (timeoutErr) {
        timeout2.cleanup();
        if (timeoutErr.name === "AbortError") {
          throw new Error("File upload timeout");
        }
        throw timeoutErr;
      }
    } catch (timeoutErr) {
      timeout1.cleanup();
      if (timeoutErr.name === "AbortError") {
        throw new Error("Staged upload timeout");
      }
      throw timeoutErr;
    }
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`Upload error after ${duration}ms:`, {
      message: err.message,
      stack: err.stack,
      name: err.name
    });
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return json(
        { error: "Request timeout. Please try again." },
        { status: 408, headers: corsHeaders$1 }
      );
    }
    return json(
      {
        error: err.message || "Internal server error",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      },
      { status: 500, headers: corsHeaders$1 }
    );
  }
}
const route9 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$3,
  loader: loader$a
}, Symbol.toStringTag, { value: "Module" }));
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};
async function loader$9({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return new Response("Method Not Allowed", {
    status: 405,
    headers: corsHeaders
  });
}
async function action$2({ request }) {
  var _a2, _b, _c, _d, _e, _f, _g, _h;
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file) {
      return json({ error: "No file uploaded" }, { status: 400, headers: corsHeaders });
    }
    const SHOP = process.env.SHOPIFY_SHOP;
    const CLIENT_ID = process.env.SHOPIFY_API_KEY || process.env.SHOPIFY_CLIENT_ID;
    const CLIENT_SECRET = process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_CLIENT_SECRET;
    const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-07";
    if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
      return json(
        { error: "Server missing SHOPIFY_SHOP / SHOPIFY_API_KEY / SHOPIFY_API_SECRET env vars" },
        { status: 500, headers: corsHeaders }
      );
    }
    const tokenRes = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "client_credentials"
      })
    });
    const tokenJson = await tokenRes.json().catch(() => null);
    const ADMIN_API_TOKEN = tokenJson == null ? void 0 : tokenJson.access_token;
    if (!ADMIN_API_TOKEN) {
      return json(
        { error: "Failed to obtain Admin API access token", detail: tokenJson },
        { status: 500, headers: corsHeaders }
      );
    }
    const mimeType = /\.eps$/i.test(file.name || "") ? "application/postscript" : file.type || "application/octet-stream";
    const stagedRes = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": ADMIN_API_TOKEN
      },
      body: JSON.stringify({
        query: `
          mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
            stagedUploadsCreate(input: $input) {
              stagedTargets {
                url
                resourceUrl
                parameters { name value }
              }
              userErrors { field message }
            }
          }
        `,
        variables: {
          input: [
            {
              resource: "FILE",
              filename: file.name,
              mimeType,
              httpMethod: "POST"
            }
          ]
        }
      })
    });
    const stagedJson = await stagedRes.json();
    const target = (_c = (_b = (_a2 = stagedJson == null ? void 0 : stagedJson.data) == null ? void 0 : _a2.stagedUploadsCreate) == null ? void 0 : _b.stagedTargets) == null ? void 0 : _c[0];
    if (!target) {
      return json({ error: "Failed staged target", stagedJson }, { status: 500, headers: corsHeaders });
    }
    const resourceUrl = target.resourceUrl;
    const isImage = (file.type || "").startsWith("image/") && !/\.eps$/i.test(file.name || "");
    const contentType = isImage ? "IMAGE" : "FILE";
    const uploadForm = new FormData();
    for (const param of target.parameters) {
      uploadForm.append(param.name, param.value);
    }
    uploadForm.append("file", file);
    const uploadRes = await fetch(target.url, { method: "POST", body: uploadForm });
    if (!uploadRes.ok) {
      return json({ error: "S3/Google bucket upload failed" }, { status: 500, headers: corsHeaders });
    }
    const fileCreateRes = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": ADMIN_API_TOKEN
      },
      body: JSON.stringify({
        query: `
          mutation fileCreate($files: [FileCreateInput!]!) {
            fileCreate(files: $files) {
              files {
                id
                alt
                createdAt
                ... on MediaImage {
                  image { url }
                }
                ... on GenericFile {
                  url
                }
              }
              userErrors { field message }
            }
          }
        `,
        variables: {
          files: [
            {
              contentType,
              // EPS FIX: IMAGE for images, FILE for .eps
              originalSource: resourceUrl,
              alt: file.name
            }
          ]
        }
      })
    });
    const fileCreateJson = await fileCreateRes.json();
    const createdFile = (_f = (_e = (_d = fileCreateJson == null ? void 0 : fileCreateJson.data) == null ? void 0 : _d.fileCreate) == null ? void 0 : _e.files) == null ? void 0 : _f[0];
    if (!createdFile) {
      return json({ error: "File not created", fileCreateJson }, { status: 500, headers: corsHeaders });
    }
    const fileId = createdFile.id;
    await new Promise((r) => setTimeout(r, 2e3));
    const queryRes = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": ADMIN_API_TOKEN
      },
      body: JSON.stringify({
        query: `
          query getFile($id: ID!) {
            node(id: $id) {
              ... on MediaImage {
                id
                image {
                  url
                  altText
                }
              }
              ... on GenericFile {
                id
                url
              }
            }
          }
        `,
        variables: { id: fileId }
      })
    });
    const queryData = await queryRes.json();
    const node = (_g = queryData == null ? void 0 : queryData.data) == null ? void 0 : _g.node;
    const finalUrl = ((_h = node == null ? void 0 : node.image) == null ? void 0 : _h.url) || (node == null ? void 0 : node.url) || null;
    return json({ url: finalUrl, fileId }, { headers: corsHeaders });
  } catch (err) {
    console.error("Upload error:", err);
    return json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
}
const route10 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$2,
  loader: loader$9
}, Symbol.toStringTag, { value: "Module" }));
const Polaris = /* @__PURE__ */ JSON.parse('{"ActionMenu":{"Actions":{"moreActions":"More actions"},"RollupActions":{"rollupButton":"View actions"}},"ActionList":{"SearchField":{"clearButtonLabel":"Clear","search":"Search","placeholder":"Search actions"}},"Avatar":{"label":"Avatar","labelWithInitials":"Avatar with initials {initials}"},"Autocomplete":{"spinnerAccessibilityLabel":"Loading","ellipsis":"{content}…"},"Badge":{"PROGRESS_LABELS":{"incomplete":"Incomplete","partiallyComplete":"Partially complete","complete":"Complete"},"TONE_LABELS":{"info":"Info","success":"Success","warning":"Warning","critical":"Critical","attention":"Attention","new":"New","readOnly":"Read-only","enabled":"Enabled"},"progressAndTone":"{toneLabel} {progressLabel}"},"Banner":{"dismissButton":"Dismiss notification"},"Button":{"spinnerAccessibilityLabel":"Loading"},"Common":{"checkbox":"checkbox","undo":"Undo","cancel":"Cancel","clear":"Clear","close":"Close","submit":"Submit","more":"More"},"ContextualSaveBar":{"save":"Save","discard":"Discard"},"DataTable":{"sortAccessibilityLabel":"sort {direction} by","navAccessibilityLabel":"Scroll table {direction} one column","totalsRowHeading":"Totals","totalRowHeading":"Total"},"DatePicker":{"previousMonth":"Show previous month, {previousMonthName} {showPreviousYear}","nextMonth":"Show next month, {nextMonth} {nextYear}","today":"Today ","start":"Start of range","end":"End of range","months":{"january":"January","february":"February","march":"March","april":"April","may":"May","june":"June","july":"July","august":"August","september":"September","october":"October","november":"November","december":"December"},"days":{"monday":"Monday","tuesday":"Tuesday","wednesday":"Wednesday","thursday":"Thursday","friday":"Friday","saturday":"Saturday","sunday":"Sunday"},"daysAbbreviated":{"monday":"Mo","tuesday":"Tu","wednesday":"We","thursday":"Th","friday":"Fr","saturday":"Sa","sunday":"Su"}},"DiscardConfirmationModal":{"title":"Discard all unsaved changes","message":"If you discard changes, you’ll delete any edits you made since you last saved.","primaryAction":"Discard changes","secondaryAction":"Continue editing"},"DropZone":{"single":{"overlayTextFile":"Drop file to upload","overlayTextImage":"Drop image to upload","overlayTextVideo":"Drop video to upload","actionTitleFile":"Add file","actionTitleImage":"Add image","actionTitleVideo":"Add video","actionHintFile":"or drop file to upload","actionHintImage":"or drop image to upload","actionHintVideo":"or drop video to upload","labelFile":"Upload file","labelImage":"Upload image","labelVideo":"Upload video"},"allowMultiple":{"overlayTextFile":"Drop files to upload","overlayTextImage":"Drop images to upload","overlayTextVideo":"Drop videos to upload","actionTitleFile":"Add files","actionTitleImage":"Add images","actionTitleVideo":"Add videos","actionHintFile":"or drop files to upload","actionHintImage":"or drop images to upload","actionHintVideo":"or drop videos to upload","labelFile":"Upload files","labelImage":"Upload images","labelVideo":"Upload videos"},"errorOverlayTextFile":"File type is not valid","errorOverlayTextImage":"Image type is not valid","errorOverlayTextVideo":"Video type is not valid"},"EmptySearchResult":{"altText":"Empty search results"},"Frame":{"skipToContent":"Skip to content","navigationLabel":"Navigation","Navigation":{"closeMobileNavigationLabel":"Close navigation"}},"FullscreenBar":{"back":"Back","accessibilityLabel":"Exit fullscreen mode"},"Filters":{"moreFilters":"More filters","moreFiltersWithCount":"More filters ({count})","filter":"Filter {resourceName}","noFiltersApplied":"No filters applied","cancel":"Cancel","done":"Done","clearAllFilters":"Clear all filters","clear":"Clear","clearLabel":"Clear {filterName}","addFilter":"Add filter","clearFilters":"Clear all","searchInView":"in:{viewName}"},"FilterPill":{"clear":"Clear","unsavedChanges":"Unsaved changes - {label}"},"IndexFilters":{"searchFilterTooltip":"Search and filter","searchFilterTooltipWithShortcut":"Search and filter (F)","searchFilterAccessibilityLabel":"Search and filter results","sort":"Sort your results","addView":"Add a new view","newView":"Custom search","SortButton":{"ariaLabel":"Sort the results","tooltip":"Sort","title":"Sort by","sorting":{"asc":"Ascending","desc":"Descending","az":"A-Z","za":"Z-A"}},"EditColumnsButton":{"tooltip":"Edit columns","accessibilityLabel":"Customize table column order and visibility"},"UpdateButtons":{"cancel":"Cancel","update":"Update","save":"Save","saveAs":"Save as","modal":{"title":"Save view as","label":"Name","sameName":"A view with this name already exists. Please choose a different name.","save":"Save","cancel":"Cancel"}}},"IndexProvider":{"defaultItemSingular":"Item","defaultItemPlural":"Items","allItemsSelected":"All {itemsLength}+ {resourceNamePlural} are selected","selected":"{selectedItemsCount} selected","a11yCheckboxDeselectAllSingle":"Deselect {resourceNameSingular}","a11yCheckboxSelectAllSingle":"Select {resourceNameSingular}","a11yCheckboxDeselectAllMultiple":"Deselect all {itemsLength} {resourceNamePlural}","a11yCheckboxSelectAllMultiple":"Select all {itemsLength} {resourceNamePlural}"},"IndexTable":{"emptySearchTitle":"No {resourceNamePlural} found","emptySearchDescription":"Try changing the filters or search term","onboardingBadgeText":"New","resourceLoadingAccessibilityLabel":"Loading {resourceNamePlural}…","selectAllLabel":"Select all {resourceNamePlural}","selected":"{selectedItemsCount} selected","undo":"Undo","selectAllItems":"Select all {itemsLength}+ {resourceNamePlural}","selectItem":"Select {resourceName}","selectButtonText":"Select","sortAccessibilityLabel":"sort {direction} by"},"Loading":{"label":"Page loading bar"},"Modal":{"iFrameTitle":"body markup","modalWarning":"These required properties are missing from Modal: {missingProps}"},"Page":{"Header":{"rollupActionsLabel":"View actions for {title}","pageReadyAccessibilityLabel":"{title}. This page is ready"}},"Pagination":{"previous":"Previous","next":"Next","pagination":"Pagination"},"ProgressBar":{"negativeWarningMessage":"Values passed to the progress prop shouldn’t be negative. Resetting {progress} to 0.","exceedWarningMessage":"Values passed to the progress prop shouldn’t exceed 100. Setting {progress} to 100."},"ResourceList":{"sortingLabel":"Sort by","defaultItemSingular":"item","defaultItemPlural":"items","showing":"Showing {itemsCount} {resource}","showingTotalCount":"Showing {itemsCount} of {totalItemsCount} {resource}","loading":"Loading {resource}","selected":"{selectedItemsCount} selected","allItemsSelected":"All {itemsLength}+ {resourceNamePlural} in your store are selected","allFilteredItemsSelected":"All {itemsLength}+ {resourceNamePlural} in this filter are selected","selectAllItems":"Select all {itemsLength}+ {resourceNamePlural} in your store","selectAllFilteredItems":"Select all {itemsLength}+ {resourceNamePlural} in this filter","emptySearchResultTitle":"No {resourceNamePlural} found","emptySearchResultDescription":"Try changing the filters or search term","selectButtonText":"Select","a11yCheckboxDeselectAllSingle":"Deselect {resourceNameSingular}","a11yCheckboxSelectAllSingle":"Select {resourceNameSingular}","a11yCheckboxDeselectAllMultiple":"Deselect all {itemsLength} {resourceNamePlural}","a11yCheckboxSelectAllMultiple":"Select all {itemsLength} {resourceNamePlural}","Item":{"actionsDropdownLabel":"Actions for {accessibilityLabel}","actionsDropdown":"Actions dropdown","viewItem":"View details for {itemName}"},"BulkActions":{"actionsActivatorLabel":"Actions","moreActionsActivatorLabel":"More actions"}},"SkeletonPage":{"loadingLabel":"Page loading"},"Tabs":{"newViewAccessibilityLabel":"Create new view","newViewTooltip":"Create view","toggleTabsLabel":"More views","Tab":{"rename":"Rename view","duplicate":"Duplicate view","edit":"Edit view","editColumns":"Edit columns","delete":"Delete view","copy":"Copy of {name}","deleteModal":{"title":"Delete view?","description":"This can’t be undone. {viewName} view will no longer be available in your admin.","cancel":"Cancel","delete":"Delete view"}},"RenameModal":{"title":"Rename view","label":"Name","cancel":"Cancel","create":"Save","errors":{"sameName":"A view with this name already exists. Please choose a different name."}},"DuplicateModal":{"title":"Duplicate view","label":"Name","cancel":"Cancel","create":"Create view","errors":{"sameName":"A view with this name already exists. Please choose a different name."}},"CreateViewModal":{"title":"Create new view","label":"Name","cancel":"Cancel","create":"Create view","errors":{"sameName":"A view with this name already exists. Please choose a different name."}}},"Tag":{"ariaLabel":"Remove {children}"},"TextField":{"characterCount":"{count} characters","characterCountWithMaxLength":"{count} of {limit} characters used"},"TooltipOverlay":{"accessibilityLabel":"Tooltip: {label}"},"TopBar":{"toggleMenuLabel":"Toggle menu","SearchField":{"clearButtonLabel":"Clear","search":"Search"}},"MediaCard":{"dismissButton":"Dismiss","popoverButton":"Actions"},"VideoThumbnail":{"playButtonA11yLabel":{"default":"Play video","defaultWithDuration":"Play video of length {duration}","duration":{"hours":{"other":{"only":"{hourCount} hours","andMinutes":"{hourCount} hours and {minuteCount} minutes","andMinute":"{hourCount} hours and {minuteCount} minute","minutesAndSeconds":"{hourCount} hours, {minuteCount} minutes, and {secondCount} seconds","minutesAndSecond":"{hourCount} hours, {minuteCount} minutes, and {secondCount} second","minuteAndSeconds":"{hourCount} hours, {minuteCount} minute, and {secondCount} seconds","minuteAndSecond":"{hourCount} hours, {minuteCount} minute, and {secondCount} second","andSeconds":"{hourCount} hours and {secondCount} seconds","andSecond":"{hourCount} hours and {secondCount} second"},"one":{"only":"{hourCount} hour","andMinutes":"{hourCount} hour and {minuteCount} minutes","andMinute":"{hourCount} hour and {minuteCount} minute","minutesAndSeconds":"{hourCount} hour, {minuteCount} minutes, and {secondCount} seconds","minutesAndSecond":"{hourCount} hour, {minuteCount} minutes, and {secondCount} second","minuteAndSeconds":"{hourCount} hour, {minuteCount} minute, and {secondCount} seconds","minuteAndSecond":"{hourCount} hour, {minuteCount} minute, and {secondCount} second","andSeconds":"{hourCount} hour and {secondCount} seconds","andSecond":"{hourCount} hour and {secondCount} second"}},"minutes":{"other":{"only":"{minuteCount} minutes","andSeconds":"{minuteCount} minutes and {secondCount} seconds","andSecond":"{minuteCount} minutes and {secondCount} second"},"one":{"only":"{minuteCount} minute","andSeconds":"{minuteCount} minute and {secondCount} seconds","andSecond":"{minuteCount} minute and {secondCount} second"}},"seconds":{"other":"{secondCount} seconds","one":"{secondCount} second"}}}}}');
const polarisTranslations = {
  Polaris
};
const polarisStyles = "/assets/styles-BeiPL2RV.css";
function loginErrorMessage(loginErrors) {
  if ((loginErrors == null ? void 0 : loginErrors.shop) === LoginErrorType.MissingShop) {
    return { shop: "Please enter your shop domain to log in" };
  } else if ((loginErrors == null ? void 0 : loginErrors.shop) === LoginErrorType.InvalidShop) {
    return { shop: "Please enter a valid shop domain to log in" };
  }
  return {};
}
const links$1 = () => [{ rel: "stylesheet", href: polarisStyles }];
const loader$8 = async ({ request }) => {
  const errors = loginErrorMessage(await login(request));
  return { errors, polarisTranslations };
};
const action$1 = async ({ request }) => {
  const errors = loginErrorMessage(await login(request));
  return {
    errors
  };
};
function Auth() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;
  return /* @__PURE__ */ jsx(AppProvider, { i18n: loaderData.polarisTranslations, children: /* @__PURE__ */ jsx(Page, { children: /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsx(Form, { method: "post", children: /* @__PURE__ */ jsxs(FormLayout, { children: [
    /* @__PURE__ */ jsx(Text, { variant: "headingMd", as: "h2", children: "Log in" }),
    /* @__PURE__ */ jsx(
      TextField,
      {
        type: "text",
        name: "shop",
        label: "Shop domain",
        helpText: "example.myshopify.com",
        value: shop,
        onChange: setShop,
        autoComplete: "on",
        error: errors.shop
      }
    ),
    /* @__PURE__ */ jsx(Button, { submit: true, children: "Log in" })
  ] }) }) }) }) });
}
const route11 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$1,
  default: Auth,
  links: links$1,
  loader: loader$8
}, Symbol.toStringTag, { value: "Module" }));
const loader$7 = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};
const route12 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$7
}, Symbol.toStringTag, { value: "Module" }));
const loader$6 = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};
const route13 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$6
}, Symbol.toStringTag, { value: "Module" }));
const index = "_index_1hqgz_1";
const heading = "_heading_1hqgz_21";
const text = "_text_1hqgz_23";
const content = "_content_1hqgz_43";
const form = "_form_1hqgz_53";
const label = "_label_1hqgz_69";
const input = "_input_1hqgz_85";
const button = "_button_1hqgz_93";
const list = "_list_1hqgz_101";
const styles = {
  index,
  heading,
  text,
  content,
  form,
  label,
  input,
  button,
  list
};
const loader$5 = async ({ request }) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return { showForm: Boolean(login) };
};
function App$1() {
  const { showForm } = useLoaderData();
  return /* @__PURE__ */ jsx("div", { className: styles.index, children: /* @__PURE__ */ jsxs("div", { className: styles.content, children: [
    /* @__PURE__ */ jsx("h1", { className: styles.heading, children: "A short heading about [your app]" }),
    /* @__PURE__ */ jsx("p", { className: styles.text, children: "A tagline about [your app] that describes your value proposition." }),
    showForm && /* @__PURE__ */ jsxs(Form, { className: styles.form, method: "post", action: "/auth/login", children: [
      /* @__PURE__ */ jsxs("label", { className: styles.label, children: [
        /* @__PURE__ */ jsx("span", { children: "Shop domain" }),
        /* @__PURE__ */ jsx("input", { className: styles.input, type: "text", name: "shop" }),
        /* @__PURE__ */ jsx("span", { children: "e.g: my-shop-domain.myshopify.com" })
      ] }),
      /* @__PURE__ */ jsx("button", { className: styles.button, type: "submit", children: "Log in" })
    ] }),
    /* @__PURE__ */ jsxs("ul", { className: styles.list, children: [
      /* @__PURE__ */ jsxs("li", { children: [
        /* @__PURE__ */ jsx("strong", { children: "Product feature" }),
        ". Some detail about your feature and its benefit to your customer."
      ] }),
      /* @__PURE__ */ jsxs("li", { children: [
        /* @__PURE__ */ jsx("strong", { children: "Product feature" }),
        ". Some detail about your feature and its benefit to your customer."
      ] }),
      /* @__PURE__ */ jsxs("li", { children: [
        /* @__PURE__ */ jsx("strong", { children: "Product feature" }),
        ". Some detail about your feature and its benefit to your customer."
      ] })
    ] })
  ] }) });
}
const route14 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: App$1,
  loader: loader$5
}, Symbol.toStringTag, { value: "Module" }));
const links = () => [{ rel: "stylesheet", href: polarisStyles }];
const loader$4 = async ({ request }) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};
function App() {
  const { apiKey } = useLoaderData();
  return /* @__PURE__ */ jsxs(AppProvider$1, { isEmbeddedApp: true, apiKey, children: [
    /* @__PURE__ */ jsxs(NavMenu, { children: [
      /* @__PURE__ */ jsx(Link, { to: "/app", rel: "home", children: "Home" }),
      /* @__PURE__ */ jsx(Link, { to: "/app/logo-upload/uploads", children: "Logo uploads" }),
      /* @__PURE__ */ jsx(Link, { to: "/app/logo-upload/settings", children: "Upload settings" })
    ] }),
    /* @__PURE__ */ jsx(Outlet, {})
  ] });
}
function ErrorBoundary() {
  return boundary.error(useRouteError());
}
const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
const route15 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ErrorBoundary,
  default: App,
  headers,
  links,
  loader: loader$4
}, Symbol.toStringTag, { value: "Module" }));
const LOGIN_COPY = [
  "login_heading",
  "login_body",
  "login_sign_in",
  "login_close"
];
function SettingsForm({
  settings,
  secretConfigured,
  degraded,
  saving,
  saved,
  saveError
}) {
  const [values, setValues] = useState(settings);
  const set = (key) => (value) => setValues((v) => ({ ...v, [key]: value }));
  const setCopy = (key) => (value) => setValues((v) => ({ ...v, copy: { ...v.copy, [key]: value } }));
  const spec = (key) => SETTINGS_SPEC[key];
  return /* @__PURE__ */ jsx(Form, { method: "post", children: /* @__PURE__ */ jsxs(BlockStack, { gap: "400", children: [
    !secretConfigured && /* @__PURE__ */ jsx(Banner, { tone: "critical", title: "LOGO_UPLOAD_SECRET is not set", children: /* @__PURE__ */ jsxs(BlockStack, { gap: "200", children: [
      /* @__PURE__ */ jsxs(Text, { as: "p", children: [
        "The signing secret is missing from this environment. While it is unset, turning on ",
        /* @__PURE__ */ jsx("b", { children: "Require customer login" }),
        " will reject",
        " ",
        /* @__PURE__ */ jsx("b", { children: "every" }),
        " upload — the app cannot verify who the shopper is."
      ] }),
      /* @__PURE__ */ jsxs(Text, { as: "p", tone: "subdued", children: [
        "Set ",
        /* @__PURE__ */ jsx("code", { children: "LOGO_UPLOAD_SECRET" }),
        " in the app environment and use the same value in the theme snippet",
        " ",
        /* @__PURE__ */ jsx("code", { children: "mo-logo-upload-config.liquid" }),
        ". They must match exactly."
      ] })
    ] }) }),
    degraded && /* @__PURE__ */ jsx(Banner, { tone: "warning", title: "Showing fallback settings", children: "The database could not be reached, so these are defaults rather than your saved values. Saving now would overwrite your real settings — reload before making changes." }),
    saveError && /* @__PURE__ */ jsx(Banner, { tone: "critical", title: "Could not save", children: saveError }),
    saved && !saveError && /* @__PURE__ */ jsx(Banner, { tone: "success", title: "Settings saved", children: "Storefront changes take effect within about a minute." }),
    /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "400", children: [
      /* @__PURE__ */ jsx(Text, { as: "h2", variant: "headingMd", children: "Features" }),
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "hidden",
          name: "require_login",
          value: String(values.require_login)
        }
      ),
      /* @__PURE__ */ jsx(
        Checkbox,
        {
          label: spec("require_login").label,
          helpText: spec("require_login").help,
          checked: values.require_login,
          onChange: set("require_login")
        }
      ),
      /* @__PURE__ */ jsx(Banner, { tone: "warning", title: "Maximum upload size is 4 MB", children: /* @__PURE__ */ jsxs(BlockStack, { gap: "200", children: [
        /* @__PURE__ */ jsxs(Text, { as: "p", children: [
          "Files larger than this are rejected before they reach the app. This is a hard limit of the hosting platform (Vercel rejects any request body over ~4.5 MB) and ",
          /* @__PURE__ */ jsx("b", { children: "cannot be raised from this page" }),
          "."
        ] }),
        /* @__PURE__ */ jsx(Text, { as: "p", tone: "subdued", children: "The storefront now checks the size before uploading and tells the shopper the file is too large. Previously the upload simply failed with no explanation. This limit applies to the shipping and quote forms too — it is not specific to logo uploads." })
      ] }) }),
      /* @__PURE__ */ jsx(Banner, { tone: "info", title: "Showing or hiding the upload field", children: /* @__PURE__ */ jsxs(BlockStack, { gap: "200", children: [
        /* @__PURE__ */ jsxs(Text, { as: "p", children: [
          "The upload field is ",
          /* @__PURE__ */ jsx("b", { children: "shown by default on every product template" }),
          ". This page does not control that — it only controls whether shoppers must sign in first."
        ] }),
        /* @__PURE__ */ jsxs(Text, { as: "p", children: [
          "To hide it on a specific template: ",
          /* @__PURE__ */ jsx("b", { children: "Online Store → Themes → Customize" }),
          ", open a product page using that template, select the product section, and untick",
          " ",
          /* @__PURE__ */ jsx("b", { children: "“Show the logo upload field”" }),
          "."
        ] }),
        /* @__PURE__ */ jsxs(Text, { as: "p", tone: "subdued", children: [
          "That checkbox applies to every product using that template. To hide the field for one product only, use the product’s",
          " ",
          /* @__PURE__ */ jsx("code", { children: "custom.image_upload" }),
          " metafield instead. Both must be on for the field to appear."
        ] })
      ] }) })
    ] }) }),
    /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "400", children: [
      /* @__PURE__ */ jsxs(BlockStack, { gap: "100", children: [
        /* @__PURE__ */ jsx(Text, { as: "h2", variant: "headingMd", children: "Login popup wording" }),
        /* @__PURE__ */ jsx(Text, { as: "p", tone: "subdued", children: "Shown when a signed-out shopper tries to attach a logo. Leave a field blank to restore its default." })
      ] }),
      LOGIN_COPY.map((key) => /* @__PURE__ */ jsx(
        TextField,
        {
          name: `copy.${key}`,
          label: humanise(key),
          value: values.copy[key] ?? "",
          onChange: setCopy(key),
          maxLength: COPY_SPEC[key].max,
          showCharacterCount: true,
          multiline: COPY_SPEC[key].max > 200 ? 3 : void 0,
          autoComplete: "off"
        },
        key
      ))
    ] }) }),
    /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "400", children: [
      /* @__PURE__ */ jsx(Text, { as: "h2", variant: "headingMd", children: "Behaviour" }),
      /* @__PURE__ */ jsx(
        Select,
        {
          name: "fail_mode",
          label: spec("fail_mode").label,
          helpText: spec("fail_mode").help,
          options: FAIL_MODES.map((v) => ({
            label: v === "open" ? "Allow the upload (recommended)" : "Block the upload",
            value: v
          })),
          value: values.fail_mode,
          onChange: set("fail_mode")
        }
      )
    ] }) }),
    /* @__PURE__ */ jsx(Box, { paddingBlockEnd: "400", children: /* @__PURE__ */ jsx(Button, { submit: true, variant: "primary", loading: saving, disabled: degraded, children: "Save" }) })
  ] }) });
}
function humanise(key) {
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const loader$3 = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { settings, degraded, source } = await getSettings(session.shop);
  return json({
    settings,
    degraded,
    source,
    secretConfigured: isSecretConfigured()
  });
};
const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const form2 = await request.formData();
  const patch = { copy: {} };
  for (const [key, value] of form2.entries()) {
    if (typeof value !== "string") continue;
    if (key.startsWith("copy.")) patch.copy[key.slice(5)] = value;
    else patch[key] = value;
  }
  delete patch.require_email_verification;
  try {
    await saveSettings(session.shop, patch);
    return json({ saved: true, saveError: null });
  } catch (err) {
    console.error("[logo-upload] settings save failed:", err);
    return json({ saved: false, saveError: err.message }, { status: 500 });
  }
};
function LogoUploadSettings() {
  const { settings, degraded, secretConfigured } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const saving = navigation.state === "submitting" || navigation.state === "loading";
  return /* @__PURE__ */ jsx(
    Page,
    {
      title: "Logo upload",
      subtitle: "Control who can attach a logo on product pages",
      children: /* @__PURE__ */ jsx(Layout, { children: /* @__PURE__ */ jsx(Layout.Section, { children: /* @__PURE__ */ jsx(
        SettingsForm,
        {
          settings,
          secretConfigured,
          degraded,
          saving,
          saved: actionData == null ? void 0 : actionData.saved,
          saveError: actionData == null ? void 0 : actionData.saveError
        },
        JSON.stringify(settings)
      ) }) })
    }
  );
}
const route16 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action,
  default: LogoUploadSettings,
  loader: loader$3
}, Symbol.toStringTag, { value: "Module" }));
const HEADINGS = [
  { title: "#" },
  { title: "Customer" },
  { title: "Product" },
  { title: "File" },
  { title: "Verified" },
  { title: "Uploaded" }
];
function UploadsTable({
  uploads,
  total,
  page,
  pageSize,
  query,
  onQueryChange,
  searching,
  hasSearch,
  gateEverEnabled,
  onPage
}) {
  const start = (page - 1) * pageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (!total && !hasSearch) {
    return /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsx(EmptyState, { heading: "No logo uploads recorded yet", image: "", children: /* @__PURE__ */ jsxs(BlockStack, { gap: "200", children: [
      /* @__PURE__ */ jsx(Text, { as: "p", children: "Uploads appear here once a shopper attaches a logo on a product page." }),
      /* @__PURE__ */ jsx(Text, { as: "p", tone: "subdued", children: gateEverEnabled ? "The login gate is on, so every new upload will be recorded against a customer." : "Recording starts from the moment the new upload endpoint goes live on the theme. Earlier uploads were never stored anywhere, so there is no history to import." })
    ] }) }) });
  }
  const rows = uploads.map((item, index2) => /* @__PURE__ */ jsxs(IndexTable.Row, { id: String(item.id), position: index2, children: [
    /* @__PURE__ */ jsx(IndexTable.Cell, { children: /* @__PURE__ */ jsx(Text, { variant: "bodyMd", as: "span", tone: "subdued", children: start + index2 + 1 }) }),
    /* @__PURE__ */ jsx(IndexTable.Cell, { children: /* @__PURE__ */ jsx(CustomerCell, { item }) }),
    /* @__PURE__ */ jsx(IndexTable.Cell, { children: item.product_url ? /* @__PURE__ */ jsx(Link$1, { url: item.product_url, target: "_blank", children: item.product_handle || "View product" }) : item.product_handle || "N/A" }),
    /* @__PURE__ */ jsx(IndexTable.Cell, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "050", children: [
      item.file_url ? /* @__PURE__ */ jsx(Link$1, { url: item.file_url, target: "_blank", children: item.file_name || "Download" }) : /* @__PURE__ */ jsx(Text, { as: "span", children: item.file_name || "N/A" }),
      /* @__PURE__ */ jsx(Text, { as: "span", variant: "bodySm", tone: "subdued", children: formatBytes(item.file_size) })
    ] }) }),
    /* @__PURE__ */ jsx(IndexTable.Cell, { children: item.email_verified === true ? /* @__PURE__ */ jsx(Badge, { tone: "success", children: "Verified" }) : /* @__PURE__ */ jsx(Text, { as: "span", tone: "subdued", children: "—" }) }),
    /* @__PURE__ */ jsx(IndexTable.Cell, { children: formatDate$1(item.created_at) })
  ] }, item.id));
  return /* @__PURE__ */ jsxs(Card, { padding: "0", children: [
    /* @__PURE__ */ jsx(Box, { padding: "300", children: /* @__PURE__ */ jsx(
      TextField,
      {
        label: "Search uploads",
        labelHidden: true,
        value: query,
        onChange: onQueryChange,
        autoComplete: "off",
        placeholder: "Search by customer email, customer ID, file name or product",
        prefix: /* @__PURE__ */ jsx(Icon, { source: SearchIcon }),
        clearButton: true,
        onClearButtonClick: () => onQueryChange("")
      }
    ) }),
    /* @__PURE__ */ jsx(
      IndexTable,
      {
        resourceName: { singular: "upload", plural: "uploads" },
        itemCount: uploads.length,
        headings: HEADINGS,
        selectable: false,
        loading: searching,
        emptyState: /* @__PURE__ */ jsx(EmptyState, { heading: "No matching uploads", image: "", children: /* @__PURE__ */ jsxs(Text, { as: "p", children: [
          "Nothing matches “",
          query,
          "”. Try a customer email, a file name or a product handle."
        ] }) }),
        children: rows
      }
    ),
    totalPages > 1 && /* @__PURE__ */ jsx(Box, { padding: "400", children: /* @__PURE__ */ jsxs(InlineStack, { align: "center", gap: "400", blockAlign: "center", children: [
      /* @__PURE__ */ jsx(
        Pagination,
        {
          hasPrevious: page > 1,
          onPrevious: () => onPage(page - 1),
          hasNext: page < totalPages,
          onNext: () => onPage(page + 1)
        }
      ),
      /* @__PURE__ */ jsxs(Text, { as: "span", tone: "subdued", variant: "bodySm", children: [
        "Page ",
        page,
        " of ",
        totalPages,
        " · ",
        total,
        " ",
        hasSearch ? "matching" : "total"
      ] })
    ] }) })
  ] });
}
function CustomerCell({ item }) {
  if (!item.customer_gid && !item.customer_email) {
    return /* @__PURE__ */ jsxs(BlockStack, { gap: "050", children: [
      /* @__PURE__ */ jsx(Text, { as: "span", tone: "subdued", children: "Guest" }),
      /* @__PURE__ */ jsx(Text, { as: "span", variant: "bodySm", tone: "subdued", children: "Uploaded while the gate was off" })
    ] });
  }
  return /* @__PURE__ */ jsxs(BlockStack, { gap: "050", children: [
    /* @__PURE__ */ jsx(Text, { variant: "bodyMd", fontWeight: "semibold", as: "span", children: item.customer_email || "Unknown email" }),
    /* @__PURE__ */ jsxs(InlineStack, { gap: "100", blockAlign: "center", children: [
      /* @__PURE__ */ jsx(Text, { as: "span", variant: "bodySm", tone: "subdued", children: customerNumber(item.customer_gid) ?? "no customer id" }),
      item.identity_source !== "liquid_hmac" && /* @__PURE__ */ jsx(Badge, { tone: "attention", children: "Unverified identity" })
    ] })
  ] });
}
function customerNumber(gid) {
  if (!gid) return null;
  const n = String(gid).split("/").pop();
  return n ? `Customer ${n}` : null;
}
function formatBytes(size) {
  const n = Number(size);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
function formatDate$1(value) {
  if (!value) return "N/A";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "N/A" : d.toLocaleString(void 0, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
const PAGE_SIZE = 25;
const loader$2 = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const search = (url.searchParams.get("q") || "").trim().slice(0, 100);
  try {
    const [{ settings }, total] = await Promise.all([
      getSettings(shop),
      countLogoUploads(shop, { search })
    ]);
    const uploads = await listLogoUploads(shop, {
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      search
    });
    return json({
      uploads,
      total,
      page,
      pageSize: PAGE_SIZE,
      search,
      gateEverEnabled: Boolean(settings.require_login),
      error: null
    });
  } catch (err) {
    console.error("[logo-upload] failed to load uploads:", err);
    return json({
      uploads: [],
      total: 0,
      page: 1,
      pageSize: PAGE_SIZE,
      search,
      gateEverEnabled: false,
      error: err.message
    });
  }
};
const SEARCH_DEBOUNCE_MS = 300;
function LogoUploadUploads() {
  const { uploads, total, page, pageSize, search, gateEverEnabled, error } = useLoaderData();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(search);
  useEffect(() => {
    setQuery((current) => current.trim() === search ? current : search);
  }, [search]);
  useEffect(() => {
    if (query.trim() === search) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (query.trim()) params.set("q", query.trim());
      else params.delete("q");
      params.delete("page");
      navigate(params.toString() ? `?${params.toString()}` : "?", {
        replace: true
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, search, searchParams, navigate]);
  const goToPage = (next) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(next));
    navigate(`?${params.toString()}`);
  };
  return /* @__PURE__ */ jsx(
    Page,
    {
      title: "Logo uploads",
      subtitle: "Which customer attached which logo, and on which product",
      fullWidth: true,
      children: /* @__PURE__ */ jsx(Layout, { children: /* @__PURE__ */ jsx(Layout.Section, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "400", children: [
        error && /* @__PURE__ */ jsx(Banner, { tone: "critical", title: "Could not load uploads", children: error }),
        /* @__PURE__ */ jsx(
          UploadsTable,
          {
            uploads,
            total,
            page,
            pageSize,
            query,
            onQueryChange: setQuery,
            searching: navigation.state === "loading",
            hasSearch: Boolean(search),
            gateEverEnabled,
            onPage: goToPage
          }
        )
      ] }) }) })
    }
  );
}
const route17 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: LogoUploadUploads,
  loader: loader$2
}, Symbol.toStringTag, { value: "Module" }));
const loader$1 = async ({ request, params }) => {
  var _a2, _b, _c, _d, _e;
  const { session } = await authenticate.admin(request);
  const submission = await getFormSubmission(params.id, session.shop);
  const storeHandle = (session.shop || "").replace(/\.myshopify\.com$/, "");
  let productImage = null;
  if (submission == null ? void 0 : submission.product_url) {
    try {
      const res = await fetch(submission.product_url + ".json", {
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      if (res.ok) {
        const j = await res.json();
        const src = ((_b = (_a2 = j == null ? void 0 : j.product) == null ? void 0 : _a2.image) == null ? void 0 : _b.src) || ((_e = (_d = (_c = j == null ? void 0 : j.product) == null ? void 0 : _c.images) == null ? void 0 : _d[0]) == null ? void 0 : _e.src) || null;
        productImage = src ? `${src}${src.includes("?") ? "&" : "?"}width=200` : null;
      }
    } catch {
    }
  }
  return json({ submission, storeHandle, productImage });
};
const FORM_META$1 = {
  shipping_form: { label: "Shipping Info", tone: "info" },
  request_quote: { label: "Quote Request", tone: "attention" }
};
const HIDDEN_PAYLOAD_KEYS = /* @__PURE__ */ new Set([
  "product_url",
  "product_handle",
  "attachment"
]);
function humanize(key) {
  return key.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (c) => c.toUpperCase());
}
function isImageUrl(url) {
  return /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url || "");
}
function SubmissionDetail() {
  const { submission, storeHandle, productImage } = useLoaderData();
  if (!submission) {
    return /* @__PURE__ */ jsx(Page, { backAction: { content: "Submissions", url: "/app" }, title: "Not found", children: /* @__PURE__ */ jsx(LegacyCard, { sectioned: true, children: /* @__PURE__ */ jsx(EmptyState, { heading: "Submission not found", image: "", children: /* @__PURE__ */ jsx("p", { children: "This submission may have been deleted." }) }) }) });
  }
  const meta = FORM_META$1[submission.form_type] || {
    label: submission.form_type || "Unknown",
    tone: "new"
  };
  const adminBase = storeHandle ? `https://admin.shopify.com/store/${storeHandle}` : null;
  const adminProductUrl = !adminBase ? null : submission.product_id ? `${adminBase}/products/${submission.product_id}` : submission.product_handle ? `${adminBase}/products?query=${encodeURIComponent(
    "handle:" + submission.product_handle
  )}` : null;
  const payload = submission.payload && typeof submission.payload === "object" ? submission.payload : {};
  const payloadEntries = Object.entries(payload).filter(
    ([key, value]) => !HIDDEN_PAYLOAD_KEYS.has(key) && value !== null && value !== void 0 && String(value).trim() !== ""
  );
  return /* @__PURE__ */ jsx(
    Page,
    {
      backAction: { content: "Submissions", url: "/app" },
      title: submission.email || submission.company || "Submission",
      titleMetadata: /* @__PURE__ */ jsxs(InlineStack, { gap: "200", children: [
        /* @__PURE__ */ jsx(Badge, { tone: meta.tone, children: meta.label }),
        submission.email_status === "true" ? /* @__PURE__ */ jsx(Badge, { tone: "success", children: "Sent" }) : /* @__PURE__ */ jsx(Badge, { tone: "critical", children: "Failed" })
      ] }),
      children: /* @__PURE__ */ jsxs(Box, { paddingBlockEnd: "800", children: [
        /* @__PURE__ */ jsx("style", { children: `.lmc-submission-cards .Polaris-LegacyCard + .Polaris-LegacyCard { margin-top: 0; }` }),
        /* @__PURE__ */ jsx("div", { className: "lmc-submission-cards", children: /* @__PURE__ */ jsxs(BlockStack, { gap: "400", children: [
          /* @__PURE__ */ jsx(LegacyCard, { title: "Source", sectioned: true, children: /* @__PURE__ */ jsxs(InlineStack, { gap: "400", blockAlign: "center", wrap: false, children: [
            productImage ? /* @__PURE__ */ jsx(
              "img",
              {
                src: productImage,
                alt: submission.product_title || "Product",
                width: 84,
                height: 84,
                style: {
                  width: 84,
                  height: 84,
                  objectFit: "cover",
                  borderRadius: 10,
                  border: "1px solid var(--p-color-border, #e1e3e5)",
                  flexShrink: 0
                }
              }
            ) : /* @__PURE__ */ jsx(
              Thumbnail,
              {
                source: "",
                alt: submission.product_title || "Product",
                size: "large"
              }
            ),
            /* @__PURE__ */ jsxs(BlockStack, { gap: "100", children: [
              /* @__PURE__ */ jsx(Text, { variant: "headingMd", as: "h3", children: submission.product_title || submission.product_handle || "N/A" }),
              (submission.product_url || adminProductUrl) && /* @__PURE__ */ jsxs(InlineStack, { gap: "400", children: [
                submission.product_url && /* @__PURE__ */ jsx(Link$1, { url: submission.product_url, target: "_blank", children: "View on Frontend" }),
                adminProductUrl && /* @__PURE__ */ jsx(Link$1, { url: adminProductUrl, target: "_blank", children: "View in Admin" })
              ] }),
              /* @__PURE__ */ jsxs(Text, { variant: "bodySm", tone: "subdued", children: [
                "Submitted",
                " ",
                submission.created_at ? new Date(submission.created_at).toLocaleString() : "—"
              ] })
            ] })
          ] }) }),
          submission.media_url && /* @__PURE__ */ jsx(LegacyCard, { title: "Attachment", sectioned: true, children: /* @__PURE__ */ jsxs(InlineStack, { gap: "300", blockAlign: "center", children: [
            isImageUrl(submission.media_url) && /* @__PURE__ */ jsx(
              Thumbnail,
              {
                source: submission.media_url,
                alt: submission.media_name || "Attachment",
                size: "large"
              }
            ),
            /* @__PURE__ */ jsx(Link$1, { url: submission.media_url, target: "_blank", children: submission.media_name || "Download file" })
          ] }) }),
          /* @__PURE__ */ jsx(LegacyCard, { title: "Submitted details", sectioned: true, children: /* @__PURE__ */ jsxs(BlockStack, { gap: "300", children: [
            /* @__PURE__ */ jsx(Divider, {}),
            payloadEntries.length === 0 ? /* @__PURE__ */ jsx(Text, { variant: "bodySm", tone: "subdued", children: "No additional fields." }) : payloadEntries.map(([key, value]) => /* @__PURE__ */ jsxs(Text, { variant: "bodySm", children: [
              /* @__PURE__ */ jsxs("strong", { children: [
                humanize(key),
                ":"
              ] }),
              " ",
              String(value)
            ] }, key))
          ] }) })
        ] }) })
      ] })
    }
  );
}
const route18 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: SubmissionDetail,
  loader: loader$1
}, Symbol.toStringTag, { value: "Module" }));
const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  try {
    const submissions = await listFormSubmissions(session.shop);
    return json({ submissions, error: null });
  } catch (err) {
    console.error("Failed to load form submissions:", err);
    return json({ submissions: [], error: err.message });
  }
};
const FORM_META = {
  shipping_form: { label: "Shipping Info", tone: "info" },
  request_quote: { label: "Quote Request", tone: "attention" }
};
const FORM_OPTIONS = [
  { label: "All forms", value: "all" },
  { label: "Shipping Info", value: "shipping_form" },
  { label: "Quote Request", value: "request_quote" }
];
function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d) ? "—" : d.toLocaleString();
}
function Index() {
  var _a2, _b;
  const { submissions, error } = useLoaderData();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const pendingId = navigation.state !== "idle" && ((_b = (_a2 = navigation.location) == null ? void 0 : _a2.pathname) == null ? void 0 : _b.startsWith("/app/submissions/")) ? navigation.location.pathname.split("/").pop() : null;
  const [search, setSearch] = useState("");
  const [formType, setFormType] = useState("all");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return submissions.filter((s) => {
      const matchesForm = formType === "all" || s.form_type === formType;
      if (!matchesForm) return false;
      if (!q) return true;
      return [
        s.email,
        s.phone,
        s.company,
        s.name,
        s.product_handle,
        s.product_title
      ].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [submissions, search, formType]);
  const PAGE_SIZE2 = 20;
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [search, formType]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE2));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE2;
  const paged = filtered.slice(start, start + PAGE_SIZE2);
  const rowMarkup = paged.map((item, index2) => {
    const meta = FORM_META[item.form_type] || {
      label: item.form_type || "Unknown",
      tone: "new"
    };
    const fileName = item.media_name || (item.media_url ? decodeURIComponent(item.media_url.split("/").pop().split("?")[0]) : null);
    return /* @__PURE__ */ jsxs(IndexTable.Row, { id: String(item.id), position: index2, children: [
      /* @__PURE__ */ jsx(IndexTable.Cell, { children: /* @__PURE__ */ jsx(Text, { variant: "bodyMd", as: "span", tone: "subdued", children: start + index2 + 1 }) }),
      /* @__PURE__ */ jsx(IndexTable.Cell, { children: /* @__PURE__ */ jsx(Badge, { tone: meta.tone, children: meta.label }) }),
      /* @__PURE__ */ jsx(IndexTable.Cell, { children: /* @__PURE__ */ jsx(Text, { variant: "bodyMd", fontWeight: "semibold", as: "span", children: item.email || "N/A" }) }),
      /* @__PURE__ */ jsx(IndexTable.Cell, { children: item.phone || "N/A" }),
      /* @__PURE__ */ jsx(IndexTable.Cell, { children: item.product_url ? /* @__PURE__ */ jsx(Link$1, { url: item.product_url, target: "_blank", children: item.product_handle || item.product_title || "View product" }) : item.product_handle || item.product_title || "N/A" }),
      /* @__PURE__ */ jsx(IndexTable.Cell, { children: item.media_url ? /* @__PURE__ */ jsx(Link$1, { url: item.media_url, target: "_blank", children: /* @__PURE__ */ jsx(
        "span",
        {
          title: fileName,
          style: {
            display: "inline-block",
            maxWidth: 160,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            verticalAlign: "middle"
          },
          children: fileName
        }
      ) }) : "—" }),
      /* @__PURE__ */ jsx(IndexTable.Cell, { children: item.email_status === "true" ? /* @__PURE__ */ jsx(Badge, { tone: "success", children: "Sent" }) : /* @__PURE__ */ jsx(Badge, { tone: "critical", children: "Failed" }) }),
      /* @__PURE__ */ jsx(IndexTable.Cell, { children: formatDate(item.created_at) }),
      /* @__PURE__ */ jsx(IndexTable.Cell, { children: /* @__PURE__ */ jsx(Tooltip, { content: "View submission", children: /* @__PURE__ */ jsx(
        Button,
        {
          onClick: () => navigate(`/app/submissions/${item.id}`),
          icon: ViewIcon,
          accessibilityLabel: "View submission",
          variant: "tertiary",
          loading: pendingId === String(item.id)
        }
      ) }) })
    ] }, item.id);
  });
  const emptyStateMarkup = submissions.length === 0 ? /* @__PURE__ */ jsx(
    EmptyState,
    {
      heading: "No form submissions yet",
      image: "https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png",
      children: /* @__PURE__ */ jsx("p", { children: "Shipping Info and Quote Request submissions from the storefront will appear here." })
    }
  ) : /* @__PURE__ */ jsx(EmptyState, { heading: "No matching submissions", image: "", children: /* @__PURE__ */ jsx("p", { children: "Try a different search term or form filter." }) });
  return /* @__PURE__ */ jsxs(Page, { title: "Form Submissions", fullWidth: true, children: [
    error && /* @__PURE__ */ jsx("div", { style: { marginBottom: "1rem" }, children: /* @__PURE__ */ jsx(Banner, { tone: "critical", title: "Could not load submissions", children: /* @__PURE__ */ jsx("p", { children: error }) }) }),
    /* @__PURE__ */ jsx(Box, { paddingBlockEnd: "800", children: /* @__PURE__ */ jsxs(Card, { padding: "0", children: [
      /* @__PURE__ */ jsx(Box, { padding: "300", children: /* @__PURE__ */ jsxs(InlineStack, { gap: "200", blockAlign: "center", wrap: false, children: [
        /* @__PURE__ */ jsx("div", { style: { flexGrow: 1 }, children: /* @__PURE__ */ jsx(
          TextField,
          {
            label: "Search submissions",
            labelHidden: true,
            value: search,
            onChange: setSearch,
            autoComplete: "off",
            placeholder: "Search by email, phone, product or company",
            prefix: /* @__PURE__ */ jsx(Icon, { source: SearchIcon }),
            clearButton: true,
            onClearButtonClick: () => setSearch("")
          }
        ) }),
        /* @__PURE__ */ jsx(Box, { minWidth: "180px", children: /* @__PURE__ */ jsx(
          Select,
          {
            label: "Form",
            labelHidden: true,
            options: FORM_OPTIONS,
            value: formType,
            onChange: setFormType
          }
        ) })
      ] }) }),
      /* @__PURE__ */ jsx(
        IndexTable,
        {
          resourceName: { singular: "submission", plural: "submissions" },
          itemCount: filtered.length,
          selectable: false,
          emptyState: emptyStateMarkup,
          headings: [
            { title: "#" },
            { title: "Form" },
            { title: "Email" },
            { title: "Phone" },
            { title: "Product" },
            { title: "Attachment" },
            { title: "Status" },
            { title: "Submitted" },
            { title: "Actions" }
          ],
          pagination: filtered.length > PAGE_SIZE2 ? {
            hasNext: currentPage < totalPages,
            hasPrevious: currentPage > 1,
            onNext: () => setPage((p) => Math.min(p + 1, totalPages)),
            onPrevious: () => setPage((p) => Math.max(p - 1, 1)),
            label: `${start + 1}–${Math.min(
              start + PAGE_SIZE2,
              filtered.length
            )} of ${filtered.length}`
          } : void 0,
          children: rowMarkup
        }
      )
    ] }) })
  ] });
}
const route19 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: Index,
  loader
}, Symbol.toStringTag, { value: "Module" }));
const serverManifest = { "entry": { "module": "/assets/entry.client-CmQVAe6Q.js", "imports": ["/assets/components-BE8jlLcO.js"], "css": [] }, "routes": { "root": { "id": "root", "parentId": void 0, "path": "", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/root-DNY30ic-.js", "imports": ["/assets/components-BE8jlLcO.js"], "css": [] }, "routes/webhooks.app.scopes_update": { "id": "routes/webhooks.app.scopes_update", "parentId": "root", "path": "webhooks/app/scopes_update", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/webhooks.app.scopes_update-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/api.logo-upload.settings": { "id": "routes/api.logo-upload.settings", "parentId": "root", "path": "api/logo-upload/settings", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/api.logo-upload.settings-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/webhooks.app.uninstalled": { "id": "routes/webhooks.app.uninstalled", "parentId": "root", "path": "webhooks/app/uninstalled", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/webhooks.app.uninstalled-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/api.logo-upload.upload": { "id": "routes/api.logo-upload.upload", "parentId": "root", "path": "api/logo-upload/upload", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/api.logo-upload.upload-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/api.save-shipping-info": { "id": "routes/api.save-shipping-info", "parentId": "root", "path": "api/save-shipping-info", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/api.save-shipping-info-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/api.save-shipping": { "id": "routes/api.save-shipping", "parentId": "root", "path": "api/save-shipping", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/api.save-shipping-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/api.eps.register": { "id": "routes/api.eps.register", "parentId": "root", "path": "api/eps/register", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/api.eps.register-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/api.eps.staged": { "id": "routes/api.eps.staged", "parentId": "root", "path": "api/eps/staged", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/api.eps.staged-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/api.eps.upload": { "id": "routes/api.eps.upload", "parentId": "root", "path": "api/eps/upload", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/api.eps.upload-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/api.upload": { "id": "routes/api.upload", "parentId": "root", "path": "api/upload", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/api.upload-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/auth.login": { "id": "routes/auth.login", "parentId": "root", "path": "auth/login", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/route-DZIBfhvS.js", "imports": ["/assets/components-BE8jlLcO.js", "/assets/styles-CEQ6Xcqz.js", "/assets/Page-CQL44hIy.js", "/assets/Card-DPFolkhJ.js", "/assets/context-mCWl5Ndu.js"], "css": [] }, "routes/emailsend": { "id": "routes/emailsend", "parentId": "root", "path": "emailsend", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/emailsend-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/auth.$": { "id": "routes/auth.$", "parentId": "root", "path": "auth/*", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/auth._-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/_index": { "id": "routes/_index", "parentId": "root", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/route-DXikRpXY.js", "imports": ["/assets/components-BE8jlLcO.js"], "css": ["/assets/route-Cnm7FvdT.css"] }, "routes/app": { "id": "routes/app", "parentId": "root", "path": "app", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": true, "module": "/assets/app-CypE206i.js", "imports": ["/assets/components-BE8jlLcO.js", "/assets/styles-CEQ6Xcqz.js", "/assets/context-mCWl5Ndu.js"], "css": [] }, "routes/app.logo-upload.settings": { "id": "routes/app.logo-upload.settings", "parentId": "routes/app", "path": "logo-upload/settings", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/app.logo-upload.settings-WIgWYl93.js", "imports": ["/assets/components-BE8jlLcO.js", "/assets/Page-CQL44hIy.js", "/assets/Banner-CQEXZyL9.js", "/assets/Card-DPFolkhJ.js", "/assets/Select-nt8DHeqv.js", "/assets/Layout-b6WdYFpc.js", "/assets/context-mCWl5Ndu.js", "/assets/banner-context-CRODaTuw.js"], "css": [] }, "routes/app.logo-upload.uploads": { "id": "routes/app.logo-upload.uploads", "parentId": "routes/app", "path": "logo-upload/uploads", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/app.logo-upload.uploads-CfXMLlX0.js", "imports": ["/assets/components-BE8jlLcO.js", "/assets/Card-DPFolkhJ.js", "/assets/Link-DSjU_MwA.js", "/assets/Page-CQL44hIy.js", "/assets/IndexTable-Dgks7Y9P.js", "/assets/Layout-b6WdYFpc.js", "/assets/Banner-CQEXZyL9.js", "/assets/context-mCWl5Ndu.js", "/assets/banner-context-CRODaTuw.js"], "css": [] }, "routes/app.submissions.$id": { "id": "routes/app.submissions.$id", "parentId": "routes/app", "path": "submissions/:id", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/app.submissions._id-DghYUubF.js", "imports": ["/assets/components-BE8jlLcO.js", "/assets/Page-CQL44hIy.js", "/assets/Link-DSjU_MwA.js", "/assets/context-mCWl5Ndu.js", "/assets/banner-context-CRODaTuw.js"], "css": [] }, "routes/app._index": { "id": "routes/app._index", "parentId": "routes/app", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/app._index-BXam82hP.js", "imports": ["/assets/components-BE8jlLcO.js", "/assets/IndexTable-Dgks7Y9P.js", "/assets/Page-CQL44hIy.js", "/assets/Link-DSjU_MwA.js", "/assets/Banner-CQEXZyL9.js", "/assets/Card-DPFolkhJ.js", "/assets/Select-nt8DHeqv.js", "/assets/context-mCWl5Ndu.js", "/assets/banner-context-CRODaTuw.js"], "css": [] } }, "url": "/assets/manifest-0d975b85.js", "version": "0d975b85" };
const mode = "production";
const assetsBuildDirectory = "build\\client";
const basename = "/";
const future = { "v3_fetcherPersist": true, "v3_relativeSplatPath": true, "v3_throwAbortReason": true, "v3_routeConfig": true, "v3_singleFetch": false, "v3_lazyRouteDiscovery": true, "unstable_optimizeDeps": false };
const isSpaMode = false;
const publicPath = "/";
const entry = { module: entryServer };
const routes = {
  "root": {
    id: "root",
    parentId: void 0,
    path: "",
    index: void 0,
    caseSensitive: void 0,
    module: route0
  },
  "routes/webhooks.app.scopes_update": {
    id: "routes/webhooks.app.scopes_update",
    parentId: "root",
    path: "webhooks/app/scopes_update",
    index: void 0,
    caseSensitive: void 0,
    module: route1
  },
  "routes/api.logo-upload.settings": {
    id: "routes/api.logo-upload.settings",
    parentId: "root",
    path: "api/logo-upload/settings",
    index: void 0,
    caseSensitive: void 0,
    module: route2
  },
  "routes/webhooks.app.uninstalled": {
    id: "routes/webhooks.app.uninstalled",
    parentId: "root",
    path: "webhooks/app/uninstalled",
    index: void 0,
    caseSensitive: void 0,
    module: route3
  },
  "routes/api.logo-upload.upload": {
    id: "routes/api.logo-upload.upload",
    parentId: "root",
    path: "api/logo-upload/upload",
    index: void 0,
    caseSensitive: void 0,
    module: route4
  },
  "routes/api.save-shipping-info": {
    id: "routes/api.save-shipping-info",
    parentId: "root",
    path: "api/save-shipping-info",
    index: void 0,
    caseSensitive: void 0,
    module: route5
  },
  "routes/api.save-shipping": {
    id: "routes/api.save-shipping",
    parentId: "root",
    path: "api/save-shipping",
    index: void 0,
    caseSensitive: void 0,
    module: route6
  },
  "routes/api.eps.register": {
    id: "routes/api.eps.register",
    parentId: "root",
    path: "api/eps/register",
    index: void 0,
    caseSensitive: void 0,
    module: route7
  },
  "routes/api.eps.staged": {
    id: "routes/api.eps.staged",
    parentId: "root",
    path: "api/eps/staged",
    index: void 0,
    caseSensitive: void 0,
    module: route8
  },
  "routes/api.eps.upload": {
    id: "routes/api.eps.upload",
    parentId: "root",
    path: "api/eps/upload",
    index: void 0,
    caseSensitive: void 0,
    module: route9
  },
  "routes/api.upload": {
    id: "routes/api.upload",
    parentId: "root",
    path: "api/upload",
    index: void 0,
    caseSensitive: void 0,
    module: route10
  },
  "routes/auth.login": {
    id: "routes/auth.login",
    parentId: "root",
    path: "auth/login",
    index: void 0,
    caseSensitive: void 0,
    module: route11
  },
  "routes/emailsend": {
    id: "routes/emailsend",
    parentId: "root",
    path: "emailsend",
    index: void 0,
    caseSensitive: void 0,
    module: route12
  },
  "routes/auth.$": {
    id: "routes/auth.$",
    parentId: "root",
    path: "auth/*",
    index: void 0,
    caseSensitive: void 0,
    module: route13
  },
  "routes/_index": {
    id: "routes/_index",
    parentId: "root",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route14
  },
  "routes/app": {
    id: "routes/app",
    parentId: "root",
    path: "app",
    index: void 0,
    caseSensitive: void 0,
    module: route15
  },
  "routes/app.logo-upload.settings": {
    id: "routes/app.logo-upload.settings",
    parentId: "routes/app",
    path: "logo-upload/settings",
    index: void 0,
    caseSensitive: void 0,
    module: route16
  },
  "routes/app.logo-upload.uploads": {
    id: "routes/app.logo-upload.uploads",
    parentId: "routes/app",
    path: "logo-upload/uploads",
    index: void 0,
    caseSensitive: void 0,
    module: route17
  },
  "routes/app.submissions.$id": {
    id: "routes/app.submissions.$id",
    parentId: "routes/app",
    path: "submissions/:id",
    index: void 0,
    caseSensitive: void 0,
    module: route18
  },
  "routes/app._index": {
    id: "routes/app._index",
    parentId: "routes/app",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route19
  }
};
export {
  serverManifest as assets,
  assetsBuildDirectory,
  basename,
  entry,
  future,
  isSpaMode,
  mode,
  publicPath,
  routes
};
