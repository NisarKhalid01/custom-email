# `logo-upload` — customer login gate for the product-page logo upload

Everything for this feature lives in this folder. **Delete the folder, the
`api.logo-upload.*` / `app.logo-upload.*` routes, and the four `logo_upload_*` tables, and the
app is exactly as it was before.**

Delivery status, task list and the theme-side contract: **[`docs/logo-upload/TASKS.md`](../../../docs/logo-upload/TASKS.md)**
Database map: **[`docs/logo-upload/SCHEMA.md`](../../../docs/logo-upload/SCHEMA.md)**

---

## What it does

On product pages there is a logo upload field (`#fileInput` → `properties[Upload]`). This feature
adds two optional gates in front of it, plus a record of who uploaded what:

| | Feature | Default |
|---|---|---|
| **F1** | Require the visitor to be **signed in**, and record the upload against that customer | **OFF** |
| **F2** | Require an **emailed 6-digit code** before the upload is accepted | **OFF** |
| **F3** | Both switchable from an admin **Settings** page — no deploy, no theme edit | — |

Both ship **OFF**. Deploying this code changes nothing on the storefront.

---

## The two rules that shape everything here

### 1. Nothing existing is modified

The app is live. `app/routes/api.upload.jsx` is **not touched** — this feature adds a parallel
endpoint at `/api/logo-upload/upload`. The live theme keeps calling the old one until we
deliberately cut over, and pointing it back is a one-line rollback.

`scripts/check-no-break.sh` enforces this mechanically (hash-checks 20 live files). It must pass
before every commit.

### 2. Only ONE of five uploaders is in scope

The storefront has **five** separate file-upload mechanisms. This feature touches exactly one.

| # | Uploader | Gated? |
|---|---|---|
| **1** | Product logo upload — `id="fileInput"` | ✅ **yes, this one** |
| 2 | Shipping-information form — `name="attachment"` | ❌ |
| 3 | Quote-request form — coin front/back logo | ❌ |
| 4 | "Upload 1 / Upload 2" — posts to `/apps/file-upload`, a **different app's** App Proxy | ❌ |

> ⚠️ The theme-side selector must stay **exactly** `#fileInput`. Broadening it to
> `input[type=file]` would capture uploaders #2, #3 and #4 and break the live shipping and quote
> forms. See TASKS.md §0.4.

---

## Layout

```
config/
  defaults.js   settings spec, defaults, validation, public projection   [A2 ✅]
  errors.js     error codes — half of the app<->theme contract           [A2 ✅]
server/
  db.server.js                 table access primitives                   [A3]
  settings.server.js           get/save settings + cache                 [A3]
  customer-identity.server.js  HMAC verify — the only trust decision     [A4]
  uploads.server.js            insert/list/get uploaded files            [A5]
  cors.server.js               CORS + JSON response helpers              [A6]
  mailer.server.js             transport + OTP email template            [A8]
  rate-limit.server.js         DB-backed counters                        [A9]
  email-verification.server.js issue/confirm codes, tokens               [A9]
ui/
  SettingsForm.jsx   admin settings form                                 [A7]
  UploadsTable.jsx   admin uploads list                                  [A14]
```

Route files stay thin and live in `app/routes/` (Remix requires it); they delegate here.

---

## Security model in one paragraph

The browser cannot be trusted — anyone can POST `customer_gid=123`. So the **theme** signs the
customer's identity in Liquid, on Shopify's servers, with a shared secret
(`LOGO_UPLOAD_SECRET`). The browser only ever sees the digest. The app recomputes the HMAC and
rejects any mismatch. The gate is therefore enforced **server-side** — blocking in JavaScript
alone would be cosmetic, since one `curl` bypasses it.

That check lives in exactly one module, `server/customer-identity.server.js`, and is never
inlined into a route.

---

## Working on `config/defaults.js`

`SETTINGS_SPEC` is the single source of truth. Four things read it instead of repeating a key
list: the defaults, save-time validation, the admin form, and the public projection. **Adding a
setting is a one-line change** — add it to the spec and all four follow.

Two things to keep in mind:

- **`public: true` is a whitelist.** Only flagged keys reach the storefront. Security tuning
  (attempt caps, rate limits, `fail_mode`) is deliberately server-only — publishing it tells an
  attacker how much room they have.
- **`mergeSettings()` must never throw.** It runs on the upload path. A missing row, a null, or a
  corrupt blob must all produce valid settings with both features OFF. A settings problem must
  never become a failed customer upload.

## Working on `config/errors.js`

The `code` strings are a **contract with the theme**. The theme switches on `code` to pick the
message a customer sees. Renaming one is a breaking change — update TASKS.md §4.4 and the theme
in the same change.

`gate_secret_unconfigured` is deliberately separate from `invalid_signature`: with a shared
secret, app/theme drift is the single most likely failure, and it needs to be visible in logs as
a misconfiguration rather than buried in generic 401s.
