# PLAN — Logo Upload: Login Gate + Email Verification + Admin Feature Toggles

**Date:** 2026-07-31
**App repo:** `custom-email-nisar/custom-email` (Remix + Shopify embedded app, Vercel, Supabase)
**Theme repo:** `logo-mat-central/logo-mat` (`Inventel-LLC/logo-mat`, branch `main`)
**Status:** PLAN ONLY — no code written yet. Awaiting review sign-off.

### Decisions locked (2026-07-31)
1. **Identity = Liquid HMAC (Option B) — ONLY.** App Proxy is **out of scope** and will not be
   built. See §3.
2. **Login is mandatory** when the gate is ON — no guest upload path. See §4.1.
3. **All theme work happens in a separate TEST theme first**, merged/published only after sign-off.
   See **§10 — Test-theme workflow**, which also covers the one non-obvious side effect this
   creates (server-side enforcement is per-*shop*, not per-*theme* → it would break the LIVE
   theme's uploads the moment the toggle goes ON). §10.3 is the fix.

---

## 1. Goal (what the client asked for)

On product pages, the logo upload widget (`#fileInput`, hidden field `properties[Upload]`) must:

1. **F1 — Login gate.** When a visitor clicks to attach a file and is **not logged in**, show a
   popup asking them to log in / create an account. When they *are* logged in, the upload must be
   recorded **against that customer** (customer reference stored with the file).
2. **F2 — Email verification.** A security layer that verifies the uploader's email address
   (one-time code) before the upload is accepted.
3. **F3 — Admin toggles.** F1 and F2 must each be switchable **ON/OFF from the app's admin
   settings page** — no code deploy, no theme edit.
4. Code must be **properly segregated** into folders/files in the app (and theme).
5. Storefront UI must **match the existing theme colour scheme**.

---

## 2. Verified current state (read before changing anything)

Facts confirmed by reading the current code on disk (app `main`, clean tree, incl. the newest
`236e5a0 Detail page: remove doubled LegacyCard top margin`).

### 2.1 Theme side

| Fact | Evidence |
|---|---|
| Widget markup is **duplicated in 15 section files**, each gated by `{% if product.metafields.custom.image_upload == true %}` | `sections/main-product.liquid:1693-1726` + 14 more |
| All of them use the **same hardcoded IDs** (`#fileInput`, `#uploadArea`, `#progressBar`, `#percent`, `#uploadStatus`, `#previewArea`, `#previewImg`, `#uploadedImageUrl`) | ibid. |
| `sections/product-test.liquid` contains **two** `id="fileInput"` on one page → duplicate IDs | `grep -c 'id="fileInput"'` = 2 |
| All upload JS lives in **one global snippet** | `snippets/mo-upload-image-js.liquid` (77 lines, IIFE, `getElementById` + `XMLHttpRequest`) |
| Rendered once globally, gated on the same metafield | `layout/theme.liquid:538-540` |
| Endpoint | `const UPLOAD_ENDPOINT = "https://custom-email-pearl.vercel.app/api/upload"` (`mo-upload-image-js.liquid:4`) |
| Success path writes the CDN URL into the line-item property | `uploadedImageUrl.value = res.url` |
| Customer accounts are used by the theme (`shop.customer_accounts_enabled`, `routes.account_login_url`) | `sections/header.liquid:928-930, 1063-1065, 1335-1337`; `snippets/header-drawer.liquid:139-141` |
| **No customer data is sent with the upload today.** Uploads are **not persisted anywhere** — the app returns a URL and forgets it. | `app/routes/api.upload.jsx` (whole file) |

> **Consequence:** because the JS is centralised in one snippet, all the upload *logic* lives in
> one place and stays there.
>
> ⚠️ **Revised 2026-08-01:** the original plan claimed **zero** section-file edits. The
> theme-editor requirement (§4.3.2) breaks that — a section setting can only be declared in that
> section's own `{% schema %}`, so all ~15 get a small, mechanical edit. See **§5.5**. The logic
> is still centralised; only the schema block and one `if` condition change per file.

### 2.2 App side

| Fact | Evidence |
|---|---|
| Upload route is standalone, no auth, `Access-Control-Allow-Origin: "*"` | `app/routes/api.upload.jsx:3-7` |
| Auth to Shopify = **client-credentials grant per request** (`SHOPIFY_API_KEY`/`SHOPIFY_API_SECRET`) | `api.upload.jsx:37-67` |
| Shopify Files upload flow already extracted for reuse | `app/lib/shopify-files.server.js` |
| DB access layer = `postgres.js` against Supabase, `form_submissions` only | `app/lib/supabase.server.js` |
| Admin app = 2 pages: list + detail; **no settings page, no NavMenu entries beyond Home** | `app/routes/app._index.jsx`, `app/routes/app.submissions.$id.jsx`, `app/routes/app.jsx:21-25` |
| Migrations are hand-written SQL, applied via Supabase | `supabase/migrations/*.sql` (4 files) |
| Scopes | `read_files,write_files` (`shopify.app.toml`) |
| Mailer = nodemailer Gmail SMTP, **credentials hardcoded in 2 route files** | `api.save-shipping.jsx:76-86`, `api.save-shipping-info.jsx` |

### 2.3 ⚠️ Pre-existing blockers that will stop this feature going live

These are **not caused by this plan** but they gate delivery (from `HANDOVER-eps-upload.md`):

1. **Vercel Hobby cannot deploy** commits authored by a non-owner on a private repo (§5.1).
   Nothing reaches production until this is resolved (CLI `vercel --prod`, or move the project
   to the commit author's Vercel account).
2. **Two different Shopify app client_ids in play:** `shopify.app.toml` = `7cc30be0…`, while
   runtime `.env SHOPIFY_API_KEY` = `21daae00…`. They are different apps.
   **↓ Downgraded by the Liquid-HMAC decision.** App Proxy would have needed the *right* client
   secret to verify signatures, making this a hard blocker. Liquid HMAC uses its own
   `UPLOAD_GATE_SECRET` and never touches the app secret, so **this no longer blocks F1/F2.**
   It remains a latent risk for the embedded admin (`authenticate.admin` uses
   `SHOPIFY_API_KEY`/`SECRET`, and the new Settings page lives behind it) and for any future
   `shopify app deploy`. Worth fixing, not a prerequisite.
3. **Vercel production env may still point at Neon**, not Supabase (`DATABASE_URL`, `DIRECT_URL`)
   (§13.4). New tables live in Supabase, so this must be fixed or the settings page reads the
   wrong DB.
4. Theme edits on disk are **not published** yet.

---

## 3. Security model — Liquid HMAC identity (locked, only approach)

Client-side JS can never be trusted: anyone can POST `customer_id=123` to `/api/upload`.
So the customer reference has to be **cryptographically provable server-side**.

**Approach:** the theme signs the customer identity **in Liquid**, server-side, where the browser
cannot tamper with it:

```liquid
{%- comment -%} snippets/mo-upload-gate-config.liquid — runs on Shopify's servers {%- endcomment -%}
{%- comment -%} login_override / verification_override are the section settings passed in as
    params ('default' | 'on' | 'off'). They must be inside the signature — see §4.3.4.
    NOTE: this snippet is rendered from INSIDE each section, not from the layout — the layout
    cannot see section.settings (§4.3.5). {%- endcomment -%}
{%- assign gate_payload = login_override | append: '|' | append: verification_override
                          | append: '|' | append: customer.id
                          | append: '|' | append: customer.email -%}
{%- assign gate_sig = gate_payload | hmac_sha256: MO_UPLOAD_GATE_SECRET -%}
```

The browser receives only `customer_id`, `customer_email` and the **digest**. `/api/upload`
recomputes the HMAC with `UPLOAD_GATE_SECRET` and rejects any mismatch:

```js
// app/lib/customer-identity.server.js
resolveCustomer(body) -> { customerId, email, trusted: boolean }
```

Properties and honest limitations:

| | |
|---|---|
| ✅ Ships now | No Shopify app config, no `shopify app deploy`, no App Proxy, endpoint stays `/api/upload` |
| ✅ Not forgeable | Without the secret you cannot mint a valid `customer_sig` for any id/email |
| ✅ Secret never reaches the browser | Only the digest is rendered; the secret stays in theme source (private repo `Inventel-LLC/logo-mat`) |
| ⚠️ No expiry in the payload | Shopify full-page caching would serve a stale timestamp, so the token is identity-bound and long-lived |
| ⚠️ Replay | A user's own signed blob can be replayed — but only to act as **themselves**, which changes nothing. Accepted. |
| ⚠️ Secret rotation | Rotating means editing the snippet + `UPLOAD_GATE_SECRET` together. The app will accept **two** secrets (`UPLOAD_GATE_SECRET`, `UPLOAD_GATE_SECRET_PREVIOUS`) so rotation is not a hard cutover. |

The check lives in **one module** (`app/lib/customer-identity.server.js`) — never inlined into
route files — so the rule exists in exactly one place and is testable on its own.

> **App Proxy is explicitly out of scope** and will not be built. (For the record only: it would
> be the alternative that eliminates the shared secret and the replay caveat, at the cost of
> `[app_proxy]` config + `shopify app deploy` + resolving the two-client_id mismatch in §2.3.2.)

---

## 4. Behaviour specification

### 4.1 F1 — Login gate

**Login is mandatory** when this is ON — there is **no "continue as guest" path**. A visitor with
no account cannot attach a file, full stop. That guarantees every stored upload carries a real
customer reference, which is the whole point of the feature.

```
user clicks / focuses #fileInput
      │
      ├─ settings.require_login == false ─────────────────► native picker (today's behaviour)
      │
      └─ true ──► logged in? (Liquid-rendered, not guessable)
                    ├─ yes ─► native picker → upload w/ signed identity → recorded to customer
                    └─ no  ─► preventDefault() + show "Sign in to upload your logo" modal
                              ├─ [Sign in]        → routes.account_login_url + return_url
                              ├─ [Create account] → routes.account_register_url + return_url
                              └─ [Close]
```

- The click is intercepted with a **transparent overlay** on the input's wrapper, not just a
  `click` handler — a bare handler on `<input type=file>` can be raced by keyboard activation.
  Overlay + `pointer-events` is deterministic and keyboard-safe (`Enter`/`Space` handled too).
- After login, Shopify returns to the product page; the gate reads
  `sessionStorage['mo_upload_intent']` and shows an inline "You're signed in — choose your file"
  banner and focuses/highlights the input. **We cannot auto-open the OS file dialog** (browsers
  require a fresh user gesture) — an honest limitation, handled with the banner.
- Server-side, `/api/upload` **independently re-checks** the setting and the signature. Blocking
  in JS alone would be theatre.

### 4.2 F2 — Email verification

```
upload allowed by F1, settings.require_email_verification == true
      │
      ├─ contact already verified within validity window (default 30 days) ─► proceed
      └─ not verified ─► verification modal
             1. email pre-filled from customer.email (read-only when logged in)
             2. POST /api/verify-email/request   → 6-digit code emailed, hash stored
             3. user enters code
             4. POST /api/verify-email/confirm   → returns short-lived signed token (15 min)
             5. upload POSTs with that token → server validates → verified_contacts row upserted
```

Hardening (all server-side):
- Code = 6 digits, **hashed** (HMAC-SHA256) at rest, never logged.
- TTL 10 min (configurable), **max 5 wrong attempts**, single-use (`consumed_at`).
- Rate limits: 3 code requests / email / 15 min, 10 / IP / hour → HTTP 429.
- Confirm returns an HMAC token (`shop|email|customerId|exp`), 15-min expiry — the browser never
  holds a "verified: true" boolean the server trusts.
- Enumeration-safe: `request` always answers `200 {ok:true}` regardless of email validity.
- When logged in, the email is **forced** to the signed `customer.email`; a mismatch is a 403.
  (Otherwise a logged-in user could verify someone else's address.)

> **Check first:** if the store uses Shopify's **new customer accounts**, login is *already* an
> email one-time code, so Shopify has verified the address and F2 is largely redundant. With
> **classic** accounts (email + password) F2 adds real value. See §11 Q3. A cheaper alternative
> exists — read `customer.verifiedEmail` from the Admin API — but it needs the `read_customers`
> scope and only reflects Shopify's own activation flag, so the OTP flow above is the primary
> design.

### 4.3 F3 — Two layers of control: app Settings page **+** theme section settings

> **Revised 2026-08-01.** The theme-editor control is an **addition**, not a replacement. Both
> layers exist; the theme layer can force the feature off for one template. More detail (incl. a
> screenshot) is still coming from the client — see §12 Q6.

| Layer | Where the merchant clicks | Scope | What it controls |
|---|---|---|---|
| **A — App Settings page** | Embedded app → Settings | **Per shop** (global) | Master on/off for login + verification, plus all server-side tuning (TTLs, copy, rate limits, rollout scope) |
| **B — Theme section settings** | Theme editor → product template → the section → right sidebar | **Per template** (~15 sections) | Whether the upload field renders at all, plus a per-template override of login / verification |

#### 4.3.1 Layer A — app Settings page (unchanged from the original plan)

New page **Settings** in the embedded app, Polaris, saved per-shop:

| Setting | Key | Default | Notes |
|---|---|---|---|
| Require login to upload | `require_login` | `false` | Ships OFF → zero behaviour change on deploy |
| Require email verification | `require_email_verification` | `false` | Ships OFF |
| Login modal heading / body / button labels | `login_modal.*` | copy defaults | Merchant-editable text |
| Verification validity (days) | `verification_validity_days` | `30` | 0 = verify every upload |
| Code expiry (minutes) | `code_expiry_minutes` | `10` | |
| Behaviour if settings unreachable | `fail_mode` | `open` | `open` = allow upload (protects sales); `closed` = block |
| Enforce on which themes | `enforcement_mode` | `test_themes` | `test_themes` = only the theme IDs below (live theme untouched during testing); `all_themes` = full enforcement. **See §10.3 — this is required for the test-theme workflow.** |
| Test theme IDs | `test_theme_ids` | `[]` | The duplicated test theme's ID, entered as text. **Deliberately not a theme picker** — listing themes needs the `read_themes` scope, and a scope change means `shopify app deploy` + re-consent + resolving the client_id mismatch (§2.3.2). The ID is right there in the preview URL (`?preview_theme_id=123456789`), so a text field costs nothing and avoids all of that. |

Defaults **ship OFF** so deploying the code changes nothing visible until the merchant flips a
switch. That is the safety valve for "must be 100% working".

#### 4.3.2 Layer B — theme section settings (NEW)

Added to the `{% schema %}` block of each of the **~15 product sections** that contain the widget,
so it appears in the theme editor's right sidebar when that section is selected:

```json
{ "type": "header",   "content": "Logo upload" },
{ "type": "checkbox", "id": "enable_image_upload", "label": "Enable image attachment", "default": true },
{ "type": "select",   "id": "upload_require_login",        "label": "Require customer login",
  "default": "default",
  "options": [ { "value": "default", "label": "Use app setting" },
               { "value": "on",      "label": "Always require" },
               { "value": "off",     "label": "Never require" } ] },
{ "type": "select",   "id": "upload_require_verification", "label": "Require email verification",
  "default": "default", "options": [ /* same three */ ] }
```

**Why `select` and not a plain checkbox for the two gate settings:** a checkbox has only two
states, so it can never mean "leave this to the app setting" — it would silently override Layer A
on every template and make the app page decorative. A three-state select makes
"inherit / force on / force off" explicit. `enable_image_upload` stays a **checkbox** because it is
a pure theme-rendering concern the app has no opinion on.

#### 4.3.3 Precedence (must be exact)

| | Effective result |
|---|---|
| `enable_image_upload` unchecked | Widget is not rendered. Nothing else applies. |
| Existing metafield `custom.image_upload` false | Widget is not rendered (**unchanged** — this gate stays as-is and is ANDed with the checkbox above) |
| Section override = `default` | App setting decides |
| Section override = `on` | Required, **even if the app setting is OFF** |
| Section override = `off` | Not required, **even if the app setting is ON** |

`enable_image_upload` defaults to `true` and both overrides default to `default`, so **adding these
settings changes nothing** on any existing template until someone edits it.

#### 4.3.4 Security consequence — the overrides must be signed

The app server **cannot read theme section settings**; they exist only in Liquid at render time.
So if the theme is allowed to say "login not required here", that claim arrives from the browser
and would be trivially forgeable — a `curl` with `require_login=off` would disable the gate.

**Fix:** the two **override values** go inside the HMAC payload that Liquid signs (§3), alongside
the identity:

```
payload = login_override | verification_override | customer.id | customer.email
          ('default' | 'on' | 'off')
sig     = hmac_sha256(payload, UPLOAD_GATE_SECRET)
```

Note it signs the **override**, not a resolved true/false — Liquid doesn't know the app-level
setting (that lives in our database). **The app does the resolving**, which is where it belongs:

```js
const effective = override === "on"  ? true
                : override === "off" ? false
                : appSettings.require_login;   // 'default'
```

If the signature doesn't match, the app **ignores the submitted overrides and uses the app-level
settings** (fail-restrictive), so a forged `login_override=off` achieves nothing.

#### 4.3.5 ⚠️ Where the signature can actually be computed

`layout/theme.liquid` — where `mo-upload-image-js` is rendered today (line 538) — **has no access
to `section.settings`**. `section` is only defined inside a section's own render scope. So the
current single global include cannot see the new settings at all.

**Structure that follows from this:**

| Piece | Rendered from | Why |
|---|---|---|
| `snippets/mo-upload-gate-config.liquid` — resolves the overrides, computes the HMAC, emits `data-*` attributes on that widget | **inside each section**, next to the widget markup | only place `section.settings` exists |
| `snippets/mo-upload-gate.liquid` — modal markup + CSS + endpoints | `layout/theme.liquid` (once) | shared, no section data needed |
| `assets/mo-upload-gate.js` — all logic | `layout/theme.liquid` (once) | reads each widget's own `data-*` |

Per-widget `data-*` attributes (rather than one global JS object) also fix
`product-test.liquid` for free: it has **two** widgets on one page, and each carries its own
config instead of fighting over a single global.

The **secret appears in exactly one file** (`mo-upload-gate-config.liquid`) even though 15 sections
render it — the sections only pass the two override values as parameters.

---

## 5. Files — complete change list

### 5.1 APP — new files (15: 3 migrations · 7 lib modules · 5 routes)

| File | Purpose |
|---|---|
| `supabase/migrations/20260801000000_create_app_settings.sql` | `app_settings(shop pk, settings jsonb, updated_at)` |
| `supabase/migrations/20260801000100_create_email_verifications.sql` | `email_verifications` (code hash, attempts, expiry, consumed) + `verified_contacts` |
| `supabase/migrations/20260801000200_create_logo_uploads.sql` | `logo_uploads` — the customer reference per uploaded file |
| `app/lib/settings.server.js` | `getSettings(shop)` / `saveSettings(shop, patch)`, defaults merge, 60 s in-process cache, `publicSettings()` projection |
| `app/lib/customer-identity.server.js` | §3 — the only place that decides "who is this and is it trustworthy" |
| `app/lib/email-verification.server.js` | issue/confirm codes, mint & verify the signed token, `isContactVerified()` |
| `app/lib/rate-limit.server.js` | DB-backed counter used by the verify routes |
| `app/lib/mailer.server.js` | shared nodemailer transport, reads `GMAIL_USER`/`GMAIL_APP_PASSWORD` with today's values as fallback (so nothing breaks) + the OTP email template |
| `app/lib/cors.server.js` | one CORS helper, origin locked to `STOREFRONT_ORIGIN` (falls back to `*` if unset, so behaviour is unchanged until configured). **Note the Liquid-HMAC consequence:** the storefront still calls `custom-email-pearl.vercel.app` cross-origin, so CORS can only be *narrowed*, never removed — and `STOREFRONT_ORIGIN` must allow the `*.myshopify.com` preview host as well, or the test theme's uploads fail (§10.2). |
| `app/lib/uploads.server.js` | `insertLogoUpload()` / `listLogoUploads()` / `getLogoUpload()` |
| `app/routes/app.settings.jsx` | the admin settings UI (F3) — the two feature toggles, modal copy, TTLs, `fail_mode`, plus the `enforcement_mode` / `test_theme_ids` rollout scope (§10.3) |
| `app/routes/api.storefront.settings.jsx` | `GET /api/storefront/settings?shop=…` → public flags + copy, `Cache-Control: s-maxage=60` |
| `app/routes/api.verify-email.request.jsx` | `POST` → send code |
| `app/routes/api.verify-email.confirm.jsx` | `POST` → validate code, return signed token |
| `app/routes/app.uploads.jsx` | admin list of logo uploads with customer, product, file, verified badge (this is where "which customer attached which logo" is actually *visible*) |

### 5.2 APP — modified files (4)

| File | Change |
|---|---|
| `app/routes/api.upload.jsx` | **Only additions, existing upload logic untouched:** (1) load settings for shop; (2) `resolveCustomer()` → 401 `login_required` if `require_login` and untrusted; (3) verification-token/`verified_contacts` check → 403 `email_verification_required`; (4) after success, `insertLogoUpload()` with customer + product refs; (5) use `cors.server.js`. Response shape stays `{url, fileId}` so the theme's `if(res && res.url)` keeps working. |
| `app/routes/app.jsx` | add `Settings` + `Uploads` links to `<NavMenu>` |
| `app/lib/supabase.server.js` | no schema change — export the shared `getSql()` only (already exported); new tables get their own modules |
| `.env.example` | document `UPLOAD_GATE_SECRET`, `UPLOAD_GATE_SECRET_PREVIOUS` (rotation, §3), `STOREFRONT_ORIGIN`, `GMAIL_USER`, `GMAIL_APP_PASSWORD` |

> `api.save-shipping.jsx` / `api.save-shipping-info.jsx` are **deliberately not refactored** in
> this scope. They keep working exactly as they do today.

### 5.3 THEME — new files (3)

| File | Purpose |
|---|---|
| `snippets/mo-upload-gate-config.liquid` | **Rendered inside each section** (§4.3.5). Takes `login_override` / `verification_override` params, computes the `hmac_sha256` signature over overrides + customer identity, and emits the per-widget `data-*` config. **The only file holding the secret.** |
| `snippets/mo-upload-gate.liquid` | Modal markup (login + verification), scoped `<style>` using theme colours (§6), the `hmac_sha256` signature over flags + identity (§3, §4.3.4), and the Liquid-rendered config blob: `window.MO_UPLOAD_GATE = { requireLogin, requireVerification, loggedIn, customerId, email, sig, shop, productId, productHandle, productUrl, endpoints, loginUrl, registerUrl }`. Accepts the two section overrides as `{% render %}` params. |
| `assets/mo-upload-gate.js` | All gate logic (settings fetch + cache, overlay, modal state machine, OTP flow, `ensureAllowed()` promise) and it reads `window.Shopify.theme.{id,role}` for the §10.3 rollout scoping. Cacheable asset, no Liquid inside. |

### 5.4 THEME — modified files (2)

| File | Change |
|---|---|
| `snippets/mo-upload-image-js.liquid` | (1) `getElementById` → `querySelectorAll('#fileInput')` loop so the duplicate-ID page works; (2) `await window.MoUploadGate.ensureAllowed()` before `xhr.send()`; (3) append `shop`, `customer_id`, `customer_email`, `customer_sig`, `verification_token`, `product_id`, `product_handle`, `product_url` to the `FormData`; (4) map the new 401/403 error codes to friendly messages. **When both features are OFF the code path is byte-for-byte equivalent to today.** |
| `layout/theme.liquid` | render `{% render 'mo-upload-gate' %}` immediately before `{% render 'mo-upload-image-js' %}` (line ~538, inside the same `image_upload` condition) |

### 5.5 THEME — the ~15 product section files (NEW in the 2026-08-01 revision)

Adding the theme-editor controls (§4.3.2) means these **do** get edited after all — two small,
mechanical changes each:

1. Add the 4 settings to the `{% schema %}` block (each currently holds only an `instruction`
   textarea, e.g. `sections/main-product.liquid:2788`).
2. Wrap the existing widget markup: `{% if product.metafields.custom.image_upload == true %}` →
   `{% if product.metafields.custom.image_upload == true and section.settings.enable_image_upload %}`
   and add one line inside it:
   ```liquid
   {% render 'mo-upload-gate-config',
        login_override: section.settings.upload_require_login,
        verification_override: section.settings.upload_require_verification %}
   ```

| Section file | Widget at |
|---|---|
| `sections/main-product.liquid` | 1694 |
| `sections/main-product-pro.liquid` | 1583 |
| `sections/main-product-pro-new.liquid` | 1586 |
| `sections/main-product-checklist.liquid` | 1685 |
| `sections/main-product-default-free-quote.liquid` | 1714 |
| `sections/main-line-product.liquid` | 1714 |
| `sections/main-line-product-badge-display.liquid` | 1761 |
| `sections/custom-products-main.liquid` | 1977 |
| `sections/custom-products-main-free-quote.liquid` | 2083 |
| `sections/product-arearug.liquid` | 2009 |
| `sections/product-frontline.liquid` | 2033 |
| `sections/product-maintenancepro.liquid` | 1982 |
| `sections/product-spectrum.liquid` | 2036 |
| `sections/product-supervinyl.liquid` | 2012 |
| `sections/product-test.liquid` | 1286 **and** 1320 (two widgets — the only such file) |

> **This reverses an earlier claim in this plan.** Before the theme-editor requirement, all
> 15 sections could be left untouched because the JS is centralised. That is no longer true —
> section *settings* only exist in the section's own `{% schema %}`. The upload **logic** still
> stays centralised in one snippet; only the schema + one `if` condition changes per file.
>
> Because 20 product templates each use a different section, a merchant configures this
> **per template**. Sections without the widget (`main-product-monogram`,
> `main-product-personalized`, `main-product-residential`, `main-product-no-price`,
> `product-request-quote`) are not touched.

---

## 6. Frontend design tokens — matching the existing theme

Extracted from `assets/nws-custom.css` and `snippets/quote-form.liquid` (the existing modal):

| Token | Value | Where it comes from |
|---|---|---|
| Brand navy (headings, body emphasis) | `#132852` | dominant colour in `nws-custom.css` (14 uses) |
| Primary CTA / hover | `#FFC107` → `#efb815` | `quote-form.liquid:96,106` (existing modal button) |
| Error / critical | `#ed252c` | `nws-custom.css` |
| Accent | `#3bd8e5` | `nws-custom.css` |
| Success (progress bar — keep) | `#4caf50` | existing widget markup |
| Body text / labels | `#333` | `quote-form.liquid:33,63` |
| Input border / focus ring | `#ccc` / `rgba(19,40,82,.25)` | existing `#ccc`; focus ring re-tinted from the existing blue to **brand navy** |
| Radius | `8px` | existing modal + inputs |
| Overlay | `rgba(0,0,0,.5)`, `z-index: 1000` | existing `.modal` |
| Card | `#fff`, `box-shadow: 0 5px 15px rgba(0,0,0,.3)` | `quote-form.liquid:19-25` |
| Width | `max-width: 480px` (gate is smaller than the 800 px quote modal) | new |
| Padding | `40px` desktop → `24px` ≤768px | mirrors `quote-form.liquid:108-111` |
| Close button | `×` 35px, absolute top-right | `quote-form.liquid:35-43` |
| Font | **inherit** — no `font-family` declared anywhere in the new CSS | matches theme typography automatically |

Rules the new CSS must follow:
- Everything scoped under `#mo-upload-gate` (same pattern as `#email-app`) → **cannot leak** into
  the theme or the quote modal.
- Reuse the class vocabulary of the existing modal (`.modal`, `.modal-content`, `.close`,
  `.form-group`) inside that scope, so it reads as the same design system.
- Responsive, keyboard accessible (focus trap, `Esc` to close, `aria-modal="true"`,
  `aria-live` on status text), and it must **not** interfere with the product `<form>` — the
  modal is rendered outside it and its inputs are unnamed so they never post as line-item
  properties.

---

## 7. Data model (SQL)

```
app_settings
  shop text primary key
  settings jsonb not null default '{}'
  updated_at timestamptz not null default now()

email_verifications
  id uuid pk, shop text, email text, customer_id text,
  code_hash text, attempts int default 0,
  expires_at timestamptz, consumed_at timestamptz,
  ip text, created_at timestamptz default now()
  idx (shop, email, created_at desc)

verified_contacts
  shop text, email text, customer_id text,
  verified_at timestamptz, 
  primary key (shop, email)

logo_uploads
  id uuid pk, shop text,
  customer_id text, customer_email text, email_verified bool,
  identity_source text,   -- 'liquid_hmac' when signature-verified, null when the gate was OFF
                          -- (kept as a column so old rows stay meaningful if the mechanism ever changes)
  file_url text, file_name text, file_size bigint, mime_type text, shopify_file_id text,
  product_id text, product_handle text, product_url text,
  ip text, created_at timestamptz default now()
  idx (shop, created_at desc), idx (shop, customer_id)
```

All tables: `enable row level security` with no public policies — same convention as
`form_submissions` (we connect as the DB owner server-side, RLS just blocks any anon key).

---

## 8. Failure modes & edge cases (the "100% working" checklist)

| Case | Handling |
|---|---|
| Settings endpoint down / slow | `fail_mode: open` (default) → upload proceeds as today. Client caches settings in `sessionStorage` for 5 min; a click before settings resolve **waits** on the promise rather than racing. |
| Features OFF | New code short-circuits before any DB/network call. Identical behaviour to today. |
| Product page without the `image_upload` metafield | No widget, no gate snippet rendered — unaffected. |
| `product-test.liquid` (two `#fileInput`) | `querySelectorAll` loop + per-input state; gate keyed by element, not by ID. |
| Customer logs out in another tab | Server-side check fails → 401 → modal reopens with "Your session ended, please sign in again". |
| Forged `customer_id` in the POST | `customer_sig` HMAC mismatch → 401. Nothing is recorded. |
| `UPLOAD_GATE_SECRET` missing/mismatched between app and theme | **Every** signature fails → all gated uploads 401. Mitigations: the app logs a distinct `gate_secret_unconfigured` error (not a generic 401), the Settings page shows a red banner when the env var is unset, and §9-B is run before the toggle goes ON. This is the single biggest operational footgun of the HMAC approach. |
| Secret rotation | App accepts `UPLOAD_GATE_SECRET` **and** `UPLOAD_GATE_SECRET_PREVIOUS`, so theme and app can be updated in either order without downtime. |
| Replayed / expired OTP | `consumed_at` set + `expires_at` check → 400 `code_invalid`. |
| Brute-forcing the 6-digit code | 5 attempts then the row is burned; per-email + per-IP rate limits → 429. |
| Email send fails (Gmail down / 500/day cap) | Modal shows "Couldn't send the code, try again or contact us" — the upload is **not** silently allowed. |
| Logged-in user tries to verify a different email | 403 `email_mismatch`. |
| EPS vs PNG | Untouched — `contentType` IMAGE/FILE logic and `.eps` MIME hardening stay exactly as-is. |
| Cart line-item property | `properties[Upload]` still set from `res.url`; verified by adding to cart and checking the cart page. |
| Multi-store install | Every query is scoped by `shop`, like `form_submissions`. |
| Same customer uploads twice | Second `logo_uploads` row; `verified_contacts` reused, no re-verification within the validity window. |
| Forged `login_override=off` in the POST | Signature no longer matches → overrides discarded, app-level settings apply (§4.3.4). |
| Section settings added but nobody configures them | `enable_image_upload` defaults `true`, overrides default `default` → **behaviour identical to today** on all 20 templates. |
| Merchant unchecks `enable_image_upload` | Widget not rendered → no `properties[Upload]` on that template. Confirm with the client that removing the field is the intent, not just gating it. |
| Two widgets on one page (`product-test.liquid`) | Each carries its own `data-*` config and its own signature — no shared global state (§4.3.5). |
| Template using a section **without** the widget | Untouched; no new settings appear in its sidebar. |

---

## 9. Test plan

**A. Local, features OFF (regression — must be indistinguishable from today)**
1. `npm run build` passes; `shopify app dev` + theme dev session.
2. Upload PNG → `{url, fileId}`, preview + `properties[Upload]` set.
3. Upload EPS → real `cdn.shopify.com/...eps` URL (the §3/§4 fix still works).
4. `curl -X POST .../api/upload` → `400 {"error":"No file uploaded"}`.

**B. F1 matrix (4 cases):** `require_login` × {ON, OFF} × visitor {guest, logged-in}
→ modal appears only for (ON, guest); upload succeeds in the other three; a `logo_uploads` row
with the correct `customer_id` exists for (ON, logged-in) and (OFF, logged-in).

**C. F2 matrix (4 cases):** `require_email_verification` × {ON, OFF} × contact {verified, new}
→ code email arrives, wrong code rejected, correct code returns a token, upload succeeds,
`verified_contacts` row written, second upload skips verification.

**D. Adversarial (curl, no browser)**
- POST with `customer_id` but no `customer_sig` → 401.
- POST with a tampered `customer_sig` → 401.
- POST with a valid `customer_id` but a `customer_sig` signed for a *different* email → 401
  (payload binds id **and** email together).
- Replay of a user's own signed blob → succeeds by design, recorded as that same customer
  (documented + accepted, §3).
- POST with `verification_token` for a different email → 403.
- Expired token (mock clock / short TTL) → 403.
- 4 wrong codes then the correct one → rejected (attempt cap).
- 4 code requests in a minute → 429.

**D2. HMAC-specific (added by the Option B decision)**
- Theme secret ≠ app secret → 401 with the distinct `gate_secret_unconfigured` signal, and the
  Settings page shows the misconfiguration banner (not a silent generic failure).
- `UPLOAD_GATE_SECRET` rotated in the app while the theme still holds the old one, with the old
  value in `UPLOAD_GATE_SECRET_PREVIOUS` → uploads keep working (no downtime).
- Same, but without `_PREVIOUS` set → uploads 401 (proves the fallback is what saves us).
- Confirm the rendered page source contains the **digest only** — grep the live preview HTML for
  the secret string and expect zero matches.
- Cross-origin: upload from the **preview theme host** (`…myshopify.com`) once
  `STOREFRONT_ORIGIN` is locked → must still pass the CORS preflight (§5.1 note).

**D3. Theme-editor controls (added by the 2026-08-01 revision)**
- Precedence matrix — for each override value {`default`, `on`, `off`} × app setting {ON, OFF}:
  6 cases per feature, results must match the §4.3.3 table exactly.
- `enable_image_upload` unchecked → widget gone, page otherwise intact, add-to-cart still works.
- Settings appear in the theme editor sidebar for all ~15 sections, and **not** for the 5 sections
  without the widget.
- Fresh template that was never edited → behaves exactly as before the change (defaults).
- Theme editor preview (`request.design_mode`) → gate must not block the merchant while editing.

**E. Admin UI**
Toggle each switch → save → reload → value persists; storefront reflects it within 60 s (cache);
existing Submissions list + detail pages still render.

**F. Cross-browser / device**
Chrome + Safari desktop, iOS Safari, Android Chrome: modal layout, `Esc`, focus trap, file picker
opens after the gate passes, keyboard-only activation of the input.

---

## 10. Test-theme workflow (decision 3)

All theme work lands in a **separate test theme** and is merged/published only after sign-off.

### 10.1 ⚠️ The theme repo auto-deploys to the live theme
Recent commits include `e6046b8 Update from Shopify for theme logo-mat/main` and
`ccbf700 Update from Shopify for theme logo-mat/main` — that write-back is the signature of the
**Shopify ↔ GitHub integration**, connected to theme **`logo-mat`** on branch **`main`**.

> **Therefore: pushing anything to `main` publishes it to the live theme.** All work must happen
> on a feature branch. Do **not** run `shopify theme push` without an explicit `--theme <id>`
> either — the default target is the live theme.

### 10.2 Recommended setup (uses the integration you already have)
1. `git checkout -b feature/upload-login-gate` in `logo-mat`.
2. Push the branch (no theme is attached to it yet → nothing deploys anywhere).
3. Shopify admin → **Online Store → Themes → Add theme → Connect from GitHub** → repo
   `Inventel-LLC/logo-mat`, branch `feature/upload-login-gate`.
   → creates an **unpublished** theme that auto-syncs on every push to that branch.
4. Note its **theme ID** from the preview URL (`?preview_theme_id=…`) → paste into
   `test_theme_ids` in the app settings page.
5. Test on the preview URL. Customer login works normally on an unpublished theme, so the whole
   F1/F2 flow is testable without touching the live store.
6. On sign-off, either **publish** that theme, or merge `feature/upload-login-gate` → `main`
   (which auto-deploys to the live theme).
7. **Then** flip `enforcement_mode` → `all_themes` (§10.3).

*Caution from the handover (§13.6): theme edits on disk once got reverted by a running
`shopify theme dev`/pull. Stop any live-sync session while editing, and always pass
`--theme <test id>` if you use the CLI at all.*

### 10.3 The non-obvious side effect — and the fix
Server-side enforcement in `/api/upload` is scoped **per shop**, not per theme. The app has no
idea which theme a request came from. So the naive version breaks:

```
require_login = ON  (to test on the test theme)
   test theme  → sends customer_sig → 200 OK ✅
   LIVE theme  → has no gate code → sends no customer_sig → 401 ❌  ← every real customer breaks
```

**Fix:** the gate sends `theme_id` + `theme_role` (read from `window.Shopify.theme`, which Shopify
injects via `content_for_header`), and the app enforces conditionally:

```js
// api.upload.jsx
const enforced =
  settings.enforcement_mode === "all_themes" ||
  settings.test_theme_ids.includes(String(body.theme_id));
```

- `enforcement_mode: 'test_themes'` → live theme keeps working exactly as today while you test.
- `enforcement_mode: 'all_themes'` → real enforcement everywhere, and `theme_id` stops mattering.

**This is a rollout control, not a security boundary** — during the test window a crafted request
could omit/spoof `theme_id` and skip the gate. That is acceptable for a short rollout window and
must be closed by switching to `all_themes` (delivery step 10). The plan states this explicitly
rather than pretending `test_themes` mode is secure.

### 10.4 The HMAC secret is shared by both themes
The test theme is a branch of the same repo, so it carries the **same** `UPLOAD_GATE_SECRET` as
the live theme — no per-theme secret juggling, and signatures minted on the preview theme validate
against the same production app. When the branch merges to `main`, the secret merges with it.
(Consequence: the secret is in the branch from the first commit, so treat
`Inventel-LLC/logo-mat` as private — confirm it is.)

### 10.5 Which app instance the test theme talks to
The test theme keeps `UPLOAD_ENDPOINT = https://custom-email-pearl.vercel.app/api/upload`
(production app), because production and local share **one** Supabase database — so a locally-run
admin would be editing the same settings row anyway. Combined with §10.3 that is safe: production
app + production DB + live theme unaffected.

---

## 11. Delivery sequence (order matters)

| # | Step | Why this order |
|---|---|---|
| 0 | Resolve the two **hard** blockers in §2.3: the Vercel deploy path (§2.3.1) and Vercel `DATABASE_URL`/`DIRECT_URL` → Supabase (§2.3.3). Generate `UPLOAD_GATE_SECRET` and set it in Vercel + the theme snippet. *(client_id reconciliation §2.3.2 is no longer a prerequisite — see the note there.)* | Nothing can ship otherwise, and the settings page would read the wrong DB |
| 1 | Run the 3 migrations in Supabase | Code reads these tables |
| 2 | App: `lib/*` modules + settings page + storefront settings endpoint | Deployable on its own, changes no behaviour |
| 3 | App: verify-email routes | Idle until F2 is turned on |
| 4 | App: `api.upload.jsx` enforcement + `logo_uploads` recording, **defaults OFF** | Still no visible change |
| 5 | Deploy app → smoke test §9-A | Prove the regression suite before the theme moves |
| 6 | Create branch `feature/upload-login-gate` + connect it as an **unpublished test theme** (§10.2) | Live theme must never see work-in-progress |
| 7 | Theme: 3 new files + 2 modified + **~15 section `{% schema %}` edits** (§5.5), pushed **only** to that branch | Auto-syncs to the test theme only |
| 7b | Verify the new settings appear in the theme editor sidebar and that untouched templates behave exactly as before | The section edits are the widest-reaching change in this plan |
| 8 | Put the test theme's ID in `test_theme_ids`, leave `enforcement_mode: test_themes` | Live theme's uploads keep working (§10.3) |
| 9 | Turn `require_login` ON → run §9-B on the **preview URL** | One switch, instantly reversible |
| 10 | Turn `require_email_verification` ON → run §9-C on the preview URL | Same |
| 11 | Sign-off → publish the test theme **or** merge the branch into `main` | Goes live |
| 12 | Switch `enforcement_mode` → `all_themes` | Closes the rollout-window bypass (§10.3) |
| 13 | Lock CORS to `STOREFRONT_ORIGIN`; move the Gmail app password to env vars + rotate | Cleans up the pre-existing risks in handover §9/§12.5 |

Rollback at any point: flip the toggle OFF (instant) → the storefront returns to today's flow
without a deploy or a theme change.

---

## 12. Questions to confirm before coding

**Answered (2026-07-31):** identity = Liquid HMAC only (App Proxy out of scope) · login mandatory,
no guest path · all theme work in a separate test theme first.

Still open:

1. **Customer accounts type** — Shopify admin → Settings → Customer accounts: *classic* or *new*?
   If **new**, F2 duplicates Shopify's own email code login (§4.2) — worth confirming the client
   still wants it.
2. **`shop.customer_accounts_enabled` must be true** and self-serve registration allowed — confirm
   in the admin, otherwise the "Create account" button has nowhere to go.
3. **OTP sender** — reuse `logomatcentral.sales@gmail.com` (Gmail, ~500/day, currently a hardcoded
   app password), or move to a transactional provider (Resend/SendGrid) for the code emails?
4. **Existing uploads** — nothing was ever recorded, so the `logo_uploads` history starts empty.
   Confirm that's acceptable (no backfill possible).
5. **Where the theme-side secret lives** — hardcoded in `snippets/mo-upload-gate-config.liquid`, or
   a theme setting in `config/settings_schema.json`? Hardcoding keeps it out of the theme-editor UI
   (safer); a theme setting is easier to rotate. **Plan assumes hardcoded in the snippet.**
6. **Theme-editor controls — awaiting the client's detail + screenshot.** Confirm against §4.3.2–5:
   - Are 3 settings right (*enable attachment* + *require login* + *require verification*), or is
     the sidebar control only meant to show/hide the upload field?
   - Is per-template configuration acceptable? 20 templates each use a different section, so
     "turn it on everywhere" = 20 edits in the theme editor. A **global theme setting** would be
     one switch for the whole site — cheaper to build *and* to operate, if per-template control
     isn't actually needed.
   - Does the new checkbox **replace** the `custom.image_upload` metafield gate, or AND with it
     (plan assumes **AND**, metafield untouched)?
