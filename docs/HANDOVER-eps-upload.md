# Handover — EPS Upload Fix & Redeployment

**Project:** `custom-email` (Remix + Shopify app, deployed on Vercel)
**Repo:** `findsection/custom-email` (branch `main`)
**Prepared:** 2026-07-09 · **Updated:** 2026-07-17

---

## 0. STATUS (read this first)

The code fix is **done and committed**. Auth has been **re-architected** (see §4) because
Shopify changed how tokens work. All env vars are known. **The ONLY thing blocking go-live
is a Vercel deploy-permission issue (§5) + the one theme URL change (§8).**

**What's done ✅**
- EPS root cause fixed (`contentType` IMAGE vs FILE) — commit `a90b226`.
- Refactored to **client-credentials auth** + env vars (no hardcoded token) — commit `e7e7f47`.
- New Vercel project created: **`custom-email-pearl.vercel.app`**.
- Dev Dashboard app created, **installed on the store**, client-credentials token exchange
  **tested working** (returns a real `shpat_` with `write_files`).
- Neon Postgres DB created; all 5 Vercel env vars identified (§7).

**What's blocking / TODO ⛔**
1. **Vercel Hobby plan won't deploy** commits from a non-owner on a **private** repo (§5.1).
   → pick a deploy method (§5.1) — nothing else can proceed until a deploy succeeds.
2. **Uncommitted local change:** `.eps` MIME hardening in `api.upload.jsx` (§9.4) — staged in
   working tree, not committed (deploy was blocked before we could push it).
3. **Theme URL change** not yet made (§8) — do AFTER a successful deploy + smoke test.
4. Fix Dev Dashboard **App URL** typo (§6, currently `logo-mat-central.com`, real domain is
   `logomatcentral.com`). Not blocking client credentials.
5. Rotate old hardcoded token `shpat_ad61…` still in git history + `api.eps.upload.jsx` (§9.1).
6. **(Enhancement — IMPLEMENTED)** Quote/logo **forms** are a *second* storefront integration
   path. Handler moved into theme snippet `quote-request-form-js.liquid` and repointed to
   `custom-email-pearl.vercel.app`; email logic reworked. Full details in **§12** (esp. §12.3a/§12.5).
7. **(Enhancement — IMPLEMENTED, NEW 2026-07-17)** **Admin submissions viewer + Supabase.** Both
   forms now **persist to a Supabase `form_submissions` table** and are viewed in the embedded
   admin app (Home page = list, detail page per submission). The DB moved from Prisma/Neon to
   **Supabase** (one DB for sessions + form data). App **renamed** to `Logomat Custom Forms` and
   **scopes reduced** to `read_files,write_files`. Full details in **§13**. Code complete + DB
   schema live in Supabase + locally verified; **nothing committed/pushed/deployed yet**.

---

## 1. TL;DR

The storefront lets customers upload a logo file (EPS) on custom product pages. The upload
goes to this app's `/api/upload` endpoint, which pushes the file into Shopify Files and
returns a URL. **EPS uploads were returning `{"url": null, ...}`** even though the file was
stored. Root cause fixed in code. The fix isn't live because the original Vercel project is
inaccessible, so we're standing up a **new** Vercel project + a **one-line Shopify theme URL
change**.

---

## 2. The problem

Storefront upload widget calls (multipart, field `file`):
```
POST https://<app-domain>/api/upload
```
- PNG/JPG uploads → valid `cdn.shopify.com/.../files/...png` URL. ✅
- **EPS uploads → `"url": null`** (only `fileId` came back). ❌

The theme JS treats a null `url` as "Upload failed", so customers saw a failure even though
the file uploaded.

## 3. Root cause

In `app/routes/api.upload.jsx`, every file was registered as `contentType: "IMAGE"` → node
is a `MediaImage`, we read `image.url`. EPS (PostScript) is **not a renderable web image**;
Shopify stores it but never produces a `MediaImage.image.url` → `null`. Non-image files must
be registered as `FILE` → `GenericFile` (read `.url`).

## 4. Fixes applied (in `app/routes/api.upload.jsx`)

### 4a. EPS content-type fix — commit `a90b226`
1. Detect type: `const isImage = (file.type||"").startsWith("image/") && !/\.eps$/i.test(file.name||"");`
   `const contentType = isImage ? "IMAGE" : "FILE";`
2. `fileCreate` uses dynamic `contentType` and requests both fragments:
   `... on MediaImage { image { url } }` and `... on GenericFile { url }`.
3. Final query reads whichever applies: `const finalUrl = node?.image?.url || node?.url || null;`

Result: images behave exactly as before; **EPS now returns a real Shopify CDN URL**.

### 4b. Auth re-architecture (client credentials) — commit `e7e7f47`
**Why:** As of **2026-01-01 Shopify no longer lets you create legacy custom apps** (the only
thing that produced a static, viewable `shpat_` token). New apps are created in the **Dev
Dashboard** and only expose a **Client ID + Client Secret** (OAuth). Existing legacy apps'
tokens aren't viewable.

**Solution:** the **client credentials grant** — the route exchanges the Dev Dashboard app's
client id/secret for a short-lived Admin API token **at request time**:
```js
POST https://<shop>/admin/oauth/access_token
{ client_id, client_secret, grant_type: "client_credentials" }
// → { access_token: "shpat_…", scope: "write_files,…", expires_in: 86399 }
```
- Token is used immediately (one upload ≈ 2–3s) then discarded. It expires in ~24h, but we
  **never reuse it**, so there is **no expiry handling to maintain** — every request mints a
  fresh token. No static secret in source, no OAuth redirect, no DB needed for the upload.
- `write_files` implies `read_files` in Shopify's scope model, so it covers both the upload
  and the final-URL query.
- **Requirement:** the Dev Dashboard app must be **installed on the store** (else the
  exchange returns `app_not_installed`). It is installed. ✅

### 4c. `.eps` MIME hardening (§9.4) — **UNCOMMITTED**, in working tree
`api.upload.jsx` now sets `mimeType = /\.eps$/i.test(name) ? "application/postscript" :
(file.type || "application/octet-stream")` for the staged request. Verified `npm run build`
passes. Needs to be committed + deployed with the next deploy.

---

## 5. Deployment situation

- Original Vercel project (`customemail.vercel.app`) is **inaccessible** (can't read logs,
  env vars, or redeploy). Env vars are write-only and unrecoverable.
- **New Vercel project stood up: `custom-email-pearl.vercel.app`** (confirm the stable
  Production domain in Vercel → Settings → Domains; prefer a clean `custom-email.vercel.app`
  if one exists, since it won't change).

### 5.1 ⛔ CURRENT BLOCKER — Vercel Hobby can't deploy these commits
Pushing to `main` is blocked by Vercel:
> *"Deployment blocked — the commit author did not have contributing access. The Hobby Plan
> does not support collaboration for private repositories. Please upgrade to Pro to add team
> members."*

Cause: the Vercel project is on a **Hobby (free)** account whose connected GitHub identity is
**not** the commit author (`NisarKhalid01` / `nisar@inventel.net`). On Hobby + **private**
repo, only the account owner's commits deploy; adding a member is a Pro feature. Git author
identity is already correct (`nisar@inventel.net`) — this is purely a Vercel plan/ownership
limit, not a git-config problem.

**Options to unblock (pick one):**
- **A · Vercel CLI (free, immediate):** `npm i -g vercel && vercel login` (as the project
  owner) `&& vercel --prod`. Uploads the local build directly, bypasses the git-author check.
  Manual each time.
- **B · Own the project (free, best long-term):** recreate/transfer the Vercel project under
  **NisarKhalid01's own** Vercel account (the GitHub identity that authors commits). Then
  `git push` auto-deploys forever.
- **C · Make repo public (free):** Hobby allows collaboration on **public** repos. But git
  history contains the old `shpat_ad61…` token — scrub history first, and code becomes public.
- **D · Upgrade to Vercel Pro ($20/mo):** enables team members on private repos.

### 5.2 Boot crash to be aware of (already solved via env vars)
The embedded Shopify admin app boots before any route. If `SHOPIFY_APP_URL` or `DATABASE_URL`
are missing, `shopifyApp()` / `new PrismaClient()` **throw at startup** and crash the WHOLE
function (`FUNCTION_INVOCATION_FAILED`) — even the standalone `/api/upload` 500s. Both vars
are set now (§7).

---

## 6. Shopify Dev Dashboard app (source of client credentials)

- Created in **Dev Dashboard** (dev.shopify.com/dashboard) under the **Logo Mat Central** org.
- **Client ID:** `21daae00dae59e8e33590a826e1e73bb` · **Secret:** `shpss_…` (in `.env`/Vercel).
- **Scopes:** includes `write_files` (implies `read_files`). ✅
- **Installed on the store.** ✅ (client-credentials exchange tested → returns `shpat_`.)
- ⚠️ **App URL** is set to the wrong `https://logo-mat-central.com` (DNS doesn't resolve; real
  domain is `logomatcentral.com`). It caused a harmless post-install redirect error — Shopify
  records the install before redirecting, so the app installed fine. **Fix it** (Dev Dashboard
  → Versions → URLs → App URL) to `https://logomatcentral.com` or the Vercel URL so any future
  reinstall doesn't hit a dead redirect.
- To **rotate** the secret if leaked: Dev Dashboard → Settings → Secret → Rotate → update
  `SHOPIFY_CLIENT_SECRET` in `.env` + Vercel.

---

## 7. Environment variables (all 5 required)

Set in **Vercel → Settings → Environment Variables (Production)** and mirrored in local `.env`
(gitignored). See `.env.example` for a full inline guide.

| Var | Value | Purpose |
|---|---|---|
| `SHOPIFY_SHOP` | `logo-mat-central.myshopify.com` | Target store (production) |
| `SHOPIFY_CLIENT_ID` | `21daae00dae59e8e33590a826e1e73bb` | Dev Dashboard app (client credentials) |
| `SHOPIFY_CLIENT_SECRET` | `shpss_…` | Dev Dashboard app secret |
| `SHOPIFY_APP_URL` | `https://custom-email-pearl.vercel.app` | **Boot var** — empty appUrl crashes `shopifyApp()` |
| `DATABASE_URL` | Neon **pooled** connection string | **Boot var** — Prisma throws at construction if unset |
| `SHOPIFY_API_VERSION` | `2025-07` (optional; code default) | Admin API version |

**Neon gotcha:** the Neon↔Vercel integration created **prefixed** vars
(`custom_email_…_POSTGRES_URL`, etc.) which the app does **NOT** read. A var named **exactly
`DATABASE_URL`** had to be added manually. Use Neon's **pooled** string (host contains
`-pooler`, includes `?sslmode=require`) — required for serverless. `/api/upload` never queries
the DB, so even a wrong password still lets uploads work; the DB only needs to satisfy Prisma
at boot (and for the admin app later, run `npx prisma db push` to create the `Session` table).

---

## 8. Theme side (separate repo: `logo-mat-central/logo-mat`)

> ⚠️ **This is the ONE required theme change** to make the fix live. Do it **after** a
> successful Vercel deploy + smoke test (so the storefront never points at a dead endpoint).

### 8.1 THE change — `snippets/mo-upload-image-js.liquid`, line 4
The **only** place the theme references the app URL (verified repo-wide). Local path:
`f:/wamp64/inventel.net/logo-mat-central/logo-mat/snippets/mo-upload-image-js.liquid`.
```js
// line 4 — BEFORE
const UPLOAD_ENDPOINT = "https://customemail.vercel.app/api/upload";
// line 4 — AFTER (host only; keep the /api/upload path)
const UPLOAD_ENDPOINT = "https://custom-email-pearl.vercel.app/api/upload";
```
Then **publish/deploy the theme**. Notes:
- Change host only. Keep `/api/upload` (do NOT switch to `/api/eps/upload` — that's the unused
  S3 route, see §10).
- Snippet is included once globally in `layout/theme.liquid` (`{% render 'mo-upload-image-js' %}`),
  so this one edit covers every product page.
- There are 4 copies of this file on disk (repo, `live/`, two exports) — the **`logo-mat`
  repo** copy is the source; editing an export does nothing to the live store.

### 8.2 How the widget works (context)
- File input `<input id="fileInput" type="file" accept=".eps,.EPS">` lives in product section
  files (e.g. `sections/custom-products-main-free-quote.liquid` ~line 2034), shown only when
  metafield `custom.image_upload == true`. Duplicated across ~15 section files, all driven by
  the same global JS.
- On success the JS writes the returned value into hidden input `name="properties[Upload]"` →
  a line-item property on the order, shown in cart + order pages.

### 8.3 JS response handling (optional)
Theme JS treats only a response containing `url` as success (`if(res && res.url){...}`). With
the fix, EPS returns a real `url`, so **no JS change required**. Optional: also accept
`res.fileId` as a fallback.

---

## 9. Security / cleanup (should-fix)

1. 🔴 **Old hardcoded Admin API token** `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` (test store
   `nws-test-3`) — still in **git history** and in `app/routes/api.eps.upload.jsx` (~line 64).
   The live `api.upload.jsx` no longer uses it (now client credentials). **Revoke it** and
   consider scrubbing history if the repo is ever shared/made public (§5.1 option C).
2. ✅ **Store confirmed: production `logo-mat-central`** (no longer `nws-test-3`).
3. 🟠 **CORS `Access-Control-Allow-Origin: "*"`** in `api.upload.jsx` — any site can POST.
   Consider locking to the storefront domain (`https://logomatcentral.com`).
4. ✅/🟠 **`.eps` MIME** — hardened to `application/postscript` (§4c), **uncommitted**.

---

## 10. Related routes (context)

- `app/routes/api.upload.jsx` — **the live endpoint the theme uses.** Shopify storage only
  (no S3). All fixes live here.
- `app/routes/api.eps.upload.jsx` — newer, **unused** variant that uploads to **AWS S3**
  (`logo-mat-app` bucket). NOT called by the theme. Still has the old hardcoded token.
- `app/routes/api.eps.staged.jsx`, `api.eps.register.jsx` — unused EPS experiments.

**Requirement confirmed with owner:** keep it on **Shopify storage, no S3**. The live
`/api/upload` route already satisfies this.

---

## 11. Checklist to finish

- [ ] **Unblock Vercel deploy** — pick §5.1 option (CLI / own-project / public / Pro).
- [ ] Commit the uncommitted `.eps` MIME change (§4c) and deploy.
- [ ] Confirm all 5 env vars set in Vercel Production (§7), incl. an exactly-named `DATABASE_URL`.
- [ ] **Smoke test:** `curl -X POST https://custom-email-pearl.vercel.app/api/upload`
      → expect `400 {"error":"No file uploaded"}` = boots & runs OK.
      (500 `FUNCTION_INVOCATION_FAILED` = boot var missing; 500 "Server missing … env vars"
      = a SHOPIFY_* var missing.)
- [ ] Update `UPLOAD_ENDPOINT` in theme `snippets/mo-upload-image-js.liquid` **line 4** →
      publish theme (§8.1).
- [ ] **Real test:** EPS upload from a product page → expect
      `{"url":"https://cdn.shopify.com/.../files/....eps","fileId":"..."}`.
- [ ] Fix Dev Dashboard **App URL** typo (§6).
- [ ] Revoke old `shpat_ad61…` token; scrub from history if repo shared (§9.1).

> Secrets that live only in `.env` / Vercel (not repeated in full here):
> `SHOPIFY_CLIENT_SECRET`, `DATABASE_URL` password.

---

## 12. ENHANCEMENT — Quote/Logo forms (second integration path) — NOT YET DONE

> Status: **investigated + documented only.** No code changed. This is separate from the
> upload fix (§1–§11) and blocks nothing there — but the forms are currently broken/at-risk
> because they still call the dead old domain.

### 12.1 What was found
Besides the upload widget, the storefront has **two quote forms** that submit to this app:

| Storefront form | Snippet (theme `logo-mat`) | App route (this repo) | Payload | Currently posts to |
|---|---|---|---|---|
| `#shipping-form` (`submitBtn1`) | `snippets/quote-form.liquid` | `app/routes/api.save-shipping-info.jsx` | **JSON** | ✅ `custom-email-pearl.vercel.app/api/save-shipping-info` (was 🔴 `customemail.vercel.app`) |
| `#shipping-form2` (`submitBtn2`) | `snippets/custom-logo-form.liquid` | `app/routes/api.save-shipping.jsx` | **multipart** (+ `attachment` file) | ✅ `custom-email-pearl.vercel.app/api/save-shipping` (was 🔴 `customemail.vercel.app`) |

- Both app routes **email** via nodemailer (Gmail SMTP) — an internal notification plus a
  customer confirmation. Full recipients / reply-to / credential details in **§12.5**.
  **DB save is commented out** — submissions are email-only, nothing persisted.
- Field names in the theme forms match the route handlers one-for-one (verified).
- `snippets/quote-request.liquid` (`#quote-request-form`, the "coin" form) has **NO handler**
  in the injected script — it does not submit anywhere yet (WIP/incomplete).

### 12.2 Where the handler lives (the problem)
The JS that wires these forms is **injected by the `custom-email` app embed block** (theme app
extension), enabled in the theme (`config/settings_data.json` →
`shopify://apps/custom-email/blocks/custom-email/...`, `"disabled": false`). It is:
- **NOT** in the theme repo (searched every file + full git history), and
- **NOT** in this app repo (no `extensions/` folder in any commit; no reference anywhere on disk).

So it cannot be edited from any code we hold. It was recovered **only** from the live page
source (view-source / inspect element). The `myModalshipping2` / `openModal_shipping2` /
`closeModal2()` references in it are **dead code** — the theme defines no such modal/button, and
the `if (openBtn2 && modal2)` guard means that branch never runs. Only `myModalshipping`
(modal 1) is real.

### 12.3 Recommended enhancement (owner-approved approach)
Move the recovered handler into a **theme snippet** so it's version-controlled and editable,
repoint the two `save-shipping*` URLs to `custom-email-pearl.vercel.app`, render it globally,
then **disable the `custom-email` app embed** (else handlers double-bind).

- New file: `snippets/quote-form-js.liquid` (theme repo `logo-mat`).
- Render once globally in `layout/theme.liquid` (like `mo-upload-image-js`).
- Owner decisions: **keep the dead modal-2 branch as-is** (zero behavior change); **create
  snippet only** — owner disables the app embed manually in the theme customizer.
- Depends on the app being live at `custom-email-pearl` first (the `save-shipping*` routes
  deploy with the same app — no extra env vars; they use hardcoded Gmail creds, see §12.5).

### 12.3a IMPLEMENTED — inline theme snippet
The recovered handler now lives in a **theme snippet** (repo `logo-mat`), version-controlled
and editable, rendered next to the upload snippet:
- **New file:** `snippets/quote-request-form-js.liquid` — the §12.4 handler, wrapped in an IIFE,
  with both `fetch()` URLs repointed to `custom-email-pearl.vercel.app`. `closeModal1/2` are
  assigned to `window` (they'd be private inside the IIFE otherwise, breaking the theme's inline
  `onclick="closeModal1()"`).
- **Rendered in** `layout/theme.liquid`, inside the existing `image_upload == true` block:
  ```liquid
  {% render 'mo-upload-image-js' %}
  {% render 'quote-request-form-js' %}
  ```
- Old `customemail.vercel.app` app-embed is already gone from the live page (verified via raw
  HTML), so there's **no double-binding** to disable.
- ⚠️ Loads only when `product.metafields.custom.image_upload == true` — if any product shows the
  shipping forms WITHOUT that metafield, the handler won't load there (render it unconditionally
  if so).
- ⚠️ Success box is still the abbreviated placeholder `<div>…Form Submitted success box…</div>`
  — swap in the exact live markup (§12.4) for a pixel match.
- NOTE: an earlier `app/routes/[quote-form.js].jsx` served-route (a prior approach) has been
  **deleted** — the snippet replaced it.

### 12.4 Recovered handler script (source, URLs repointed)
Recovered from the live page (it was the only surviving copy). Shown below **already repointed**
to `custom-email-pearl.vercel.app` — this matches the implemented snippet
`quote-request-form-js.liquid` (§12.3a/§12.5a). The original live copy used the dead
`customemail.vercel.app`.
```html
<script type="text/javascript">
  document.addEventListener('DOMContentLoaded', function () {
    const openBtn1 = document.getElementById('openModal_shipping');
    const openBtn1_2 = document.getElementById('openModal_shipping_2');
    const modal1 = document.getElementById('myModalshipping');
    const openBtn2 = document.getElementById('openModal_shipping2');   // dead: no such element
    const modal2 = document.getElementById('myModalshipping2');        // dead: no such element
    if (openBtn1 && modal1) openBtn1.addEventListener('click', () => { modal1.style.display = 'block'; });
    if (openBtn1_2 && modal1) openBtn1_2.addEventListener('click', () => { modal1.style.display = 'block'; });
    if (openBtn2 && modal2) openBtn2.addEventListener('click', () => { modal2.style.display = 'block'; });
    window.addEventListener('click', function (event) {
      if (event.target === modal1) modal1.style.display = 'none';
      if (event.target === modal2) modal2.style.display = 'none';
    });
  });
  function closeModal1() { document.getElementById('myModalshipping').style.display = 'none'; }
  function closeModal2() { document.getElementById('myModalshipping2').style.display = 'none'; } // dead
  document.addEventListener('DOMContentLoaded', function () {
    const form1 = document.getElementById('shipping-form');
    const form2 = document.getElementById('shipping-form2');
    if (form1) {
      form1.addEventListener('submit', function (event) {
        event.preventDefault();
        const formData = new FormData(form1);
        const btn = document.getElementById('submitBtn1');
        const text = btn.querySelector('.btn-text');
        const loader = btn.querySelector('.btn-loader');
        text.style.display = 'none'; loader.style.display = 'inline-block'; btn.style.padding = '23px';
        const data = {
          title: formData.get('title'), company: formData.get('company'), street: formData.get('street'),
          apt: formData.get('apt'), city: formData.get('city'), state: formData.get('state'),
          zip: formData.get('zip'), loading_dock: formData.get('loading_dock'), liftgate: formData.get('liftgate'),
          email: formData.get('email'), phone: formData.get('phone'), cartons: formData.get('cartons'),
          comments: formData.get('comments'), variant_id: formData.get('variant_id'),
        };
        fetch('https://custom-email-pearl.vercel.app/api/save-shipping-info', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
        })
          .then((response) => {
            if (response.ok) { form1.innerHTML = `<div>…Form Submitted success box…</div>`; }
            else { alert('Failed to save data.'); }
          })
          .catch((error) => { console.error('Backend error:', error); alert('Error saving data to the database.'); });
      });
    }
    if (form2) {
      form2.addEventListener('submit', function (event) {
        event.preventDefault();
        const formData2 = new FormData(form2);
        const btn = document.getElementById('submitBtn2');
        const text = btn.querySelector('.btn-text');
        const loader = btn.querySelector('.btn-loader');
        text.style.display = 'none'; loader.style.display = 'inline-block'; btn.style.padding = '23px';
        fetch('https://custom-email-pearl.vercel.app/api/save-shipping', {
          method: 'POST', body: formData2,
        })
          .then((response) => response.json())
          .then((result) => { form2.innerHTML = `<div>…Form Submitted success box…</div>`; })
          .catch((error) => { console.error('Error submitting form2:', error); });
      });
    }
  });
</script>
```
> The two success-box `innerHTML` snippets are abbreviated above; the full green confirmation
> markup is in the live page source and should be preserved verbatim when creating the snippet.

### 12.5 IMPLEMENTED — email handling (both `save-shipping*` routes)
Both routes (`api.save-shipping.jsx` multipart, `api.save-shipping-info.jsx` JSON) send via
nodemailer over **Gmail SMTP** (`smtp.gmail.com:587`, STARTTLS). Each submission sends up to two
emails, wired identically in both files:

| Email | To | Reply-To | Sent when |
|---|---|---|---|
| Internal notification (full form details) | `NOTIFY_RECIPIENTS` | **the customer's form email** (falls back to `REPLY_TO` if none) | always |
| Customer confirmation (thank-you) | the customer's form email | **`REPLY_TO`** (company inbox) | only if the form email is non-empty |

Config lives in two constants at the top of each file — **edit here to change behavior:**
```js
const NOTIFY_RECIPIENTS = ["sales@logomatcentral.com"]; // add more emails to CC the team
const REPLY_TO = "sales@logomatcentral.com";            // company inbox replies route to
```
- **Customer-email guard:** `const customerEmail = (data.email || "").trim();` — a missing/blank
  email skips the customer confirmation entirely and makes the notification's Reply-To fall back
  to `REPLY_TO`.
- **Reply-To logic (intentional):** team replying to the *notification* reaches the **customer**;
  customer replying to their *confirmation* reaches **sales**.
- **DB save still commented out** — email-only, nothing persisted.

**Sender credentials (current):**
```js
auth: { user: 'logomatcentral.sales@gmail.com', pass: "jaotjhnzpzkxjani" } // Gmail App Password
```
`from:` on all sends uses the same address (display names: "Mat Order" / "Shipping Info" /
"Logo Mat Central"). Prior senders are kept as commented `// BACKUP` lines
(`sales.logomat@gmail.com`).

⚠️ **Gmail SMTP requires an App Password, NOT the account password** — a normal password returns
`535-5.7.8 … BadCredentials`. App Passwords need 2-Step Verification ON, and **brand-new Gmail
accounts can't create them for days** (Google restriction) — that's why an interim
`sales.logomat@gmail.com` attempt failed and we reverted to the established account. Use the
16-char App Password **without spaces**. To change sender: update `user`/`pass` + the `from:`
lines in both files, then rebuild.

**Security (still open):**
- 🔴 **Hardcoded App Password** in both files (committed to git). Rotate + move to env vars
  (e.g. `GMAIL_USER` / `GMAIL_APP_PASSWORD`) when possible.
- 🟠 **CORS `*`** on both routes — any site can POST and trigger emails (spam risk). Lock to the
  storefront origin.
- 🟠 If forms get real volume, Gmail's ~500/day limit + fragility argue for a transactional
  provider (Resend/SendGrid/Brevo).

### 12.5a IMPLEMENTED — form handler delivery (theme snippet)
See §12.3a: the recovered handler is a theme snippet `snippets/quote-request-form-js.liquid`
(repo `logo-mat`), URLs repointed to `custom-email-pearl`, rendered from `layout/theme.liquid`
inside the `image_upload == true` block alongside `mo-upload-image-js`. The old app-served
`/quote-form.js` route was removed.

### 12.6 How this code was found (provenance — so it can be re-recovered)
The handler is in no repo, so it was located by elimination then pulled from the live site:
1. **Theme repo searched** (`logo-mat`) — every `.liquid`/`.js` + full git history
   (`git log --all -S "save-shipping"`, `-S "myModalshipping"`, `-S "shipping-form"`).
   Result: only the form **markup** exists (buttons `openModal_shipping`, modal
   `myModalshipping`, `onclick="closeModal1()"`, the `<form>`s). **No handler/fetch ever.**
2. **App repo searched** (this repo, new + old clones) — working tree, `build/`, `public/`,
   and full history for `email-app`/`myModalshipping`/`quote-request-form`/`extensions/*`.
   Result: **no `extensions/` folder ever**, no client JS — only the server routes.
3. **Whole disk searched** — `grep -rl` across `F:/wamp64/inventel.net/` (minus node_modules
   /.git). Result: the IDs appear **only** in the theme markup snippets. Handler nowhere.
4. **Concluded** the JS is injected at runtime by the `custom-email` **app embed** (a theme
   app extension whose source we don't have), confirmed by locating the `<script>` inside a
   `shopify-app-block` wrapper in the rendered HTML.
5. **Recovered from the live page** — fetched the storefront HTML and extracted the script:
   ```bash
   curl -s -A "Mozilla/5.0" https://logomatcentral.com/products/toughtop-all-purpose-customized-logo-mat > prod.html
   grep -noiE "https://[a-z0-9.-]*vercel.app/api/[a-z-]+" prod.html   # → the two save-shipping URLs
   # then read the surrounding <script> block (also visible via browser View-Source / Inspect Element)
   ```
   The endpoints confirmed on the live product page **at investigation time**: upload →
   `custom-email-pearl` (already migrated); both `save-shipping*` forms → old
   `customemail.vercel.app`. **Both forms have since been migrated** to `custom-email-pearl`
   via the theme snippet (§12.3a/§12.5a).

**Definitive source proof (page-source wrapper).** On
`/products/toughtop-all-purpose-customized-logo-mat` the script sits inside a Shopify
**app-block** wrapper, which is the unambiguous signature of an app-provided (theme app
extension) block — NOT theme code (theme renders inside `class="shopify-section"`):
```
<div id="shopify-block-AWHFaNXJHM0VjdTQ0Z__8965416079986996527" class="shopify-block shopify-app-block">
   <style data-shopify> #email-app #shipping-form-container {…} </style>   ← form CSS
   <script type="text/javascript"> … modal logic + both fetch()s … </script>  ← the handler
</div>
```
It renders **once**, right after the footer section and next to the `accessibly` app block
(i.e. the end-of-body app-embed region). This maps to the `custom-email` embed in
`config/settings_data.json` (`shopify://apps/custom-email/blocks/custom-email/…`,
`"disabled": false`).

**One script, two forms** (confirmed with owner). The single script handles both:
- `<form id="shipping-form" method="post" enctype="multipart/form-data">` (quote-form.liquid)
  → `form1` → JSON → `/api/save-shipping-info`.
- `<form id="shipping-form2">` (custom-logo-form.liquid) → `form2` → multipart → `/api/save-shipping`.
`save-shipping-info` appears exactly once in the page; the "two scripts" seen while
inspecting are the same block copied twice.

**Why it's absent from the app repo:** the theme app extension source
(`extensions/custom-email/` with the block `.liquid` + this inline script) was never in this
clone — the deployed app was built from a project/version that included it. So the block's
source is unrecoverable from code we hold; the rendered page IS the complete, static copy.

> To re-verify at any time: open the product page → View Source (or DevTools → Elements) →
> search `save-shipping`. The full script (incl. the complete success-box markup) is there,
> inside the `class="shopify-block shopify-app-block"` div.

### 12.7 Mini-checklist (when this enhancement is picked up)
- [x] Handler in theme snippet `snippets/quote-request-form-js.liquid`, URLs → `custom-email-pearl` (§12.3a).
- [x] Rendered in `layout/theme.liquid` inside the `image_upload == true` block.
- [x] `[quote-form.js].jsx` served-route deleted (replaced by the snippet).
- [x] Email logic implemented: `NOTIFY_RECIPIENTS` list, reply-to swap, empty-email guard (§12.5).
- [x] Sender set to `logomatcentral.sales@gmail.com` with a working Gmail App Password (§12.5).
- [ ] Confirm app is live at `custom-email-pearl` (so `/api/save-shipping*` respond).
- [ ] **Publish the theme** (push `logo-mat` / `shopify theme push`) — edits are on disk only.
- [ ] (Optional) Paste the exact live success-box markup into the snippet for a pixel match.
- [ ] Test both forms end-to-end (email received at `NOTIFY_RECIPIENTS` + customer copy).
- [ ] Decide what to do with `quote-request.liquid` (coin form) — no handler exists yet.
- [ ] Rotate the Gmail App Password; move Gmail creds to env vars + consider CORS lockdown (§12.5).

---

## 13. ENHANCEMENT — Admin submissions viewer + Supabase migration (NEW 2026-07-17)

> Status: **code complete, DB schema live in Supabase, locally verified end-to-end. NOTHING
> committed / pushed / deployed yet.** Branch `admin-pages` (never pushed; no upstream).

### 13.1 What was built
1. **Both storefront forms now persist to a database** (previously email-only, §12.5). Each
   submission writes one row to a **single Supabase table `form_submissions`**, distinguished by
   a `form_type` column.
2. **Embedded admin app shows the submissions:**
   - **Home page** (`app/routes/app._index.jsx`) — unified list of ALL submissions (both forms),
     newest first: Form badge, Email, Phone, Product (linked), Attachment (linked), Status,
     Submitted date, View. Proper empty state (the old page threw a 404 on empty).
   - **Detail page** (`app/routes/app.submissions.$id.jsx`) — form type, product link, attachment
     preview/link, and every `payload` field. Replaces the old `app.shipping-data.$id.jsx`.
3. **Product provenance captured:** each form now submits **`product_url`**, **`product_handle`**,
   and the product title, so the admin shows **which product page** each submission came from.
4. **Attachment reference:** form 2's uploaded file is pushed to **Shopify Files** (reusing the
   §3/§4 upload flow) and its CDN URL stored in `media_url`, so the admin can link/preview it.
5. **DB consolidated on Supabase:** the Shopify **session storage moved from Neon to Supabase**
   too — one database for everything. Prisma is now a **client only** (no Prisma Migrate).
6. **App config:** `shopify.app.toml` **name → `Logomat Custom Forms`**, **scopes → `read_files,write_files`**
   (removed unused `write_products,read_content,write_content` — the app only ever calls Shopify
   Files APIs).

### 13.2 form_type mapping
| form_type | Storefront form | App route | Product title source |
|---|---|---|---|
| `shipping_form` | `#shipping-form` (`quote-form.liquid`) | `api.save-shipping-info.jsx` (JSON) | `data.title` |
| `request_quote` | `#shipping-form2` (`custom-logo-form.liquid`) | `api.save-shipping.jsx` (multipart) | `data.mat_type` |

### 13.3 Database (Supabase)
- **ONE Supabase project** now holds two tables. Migrations are **SQL files in `supabase/migrations/`**
  (Supabase is the source of truth — do NOT run `prisma migrate dev`, it would try to drop
  `form_submissions`):
  - `20250618074915_create_session.sql` — the `Session` table (converted verbatim from the old
    Prisma migration; exact quoted PascalCase column names so `PrismaSessionStorage` still works).
    The old `ShippingData` table was **not** recreated (superseded by `form_submissions`).
  - `20260717000000_create_form_submissions.sql` — the submissions table (listing columns +
    `product_url/handle/title` + `media_url/name` + `email_status` + `payload jsonb` + `created_at`,
    RLS enabled).
- **Both migrations already applied** to the live Supabase DB and verified (columns present;
  insert → jsonb read-back → list → delete round-trip passed; `prisma.session.count()` connects
  through the pooler).
- **Access code:**
  - `app/lib/supabase.server.js` — `postgres.js` client (`getSql`, `insertFormSubmission`,
    `listFormSubmissions`, `getFormSubmission`). Reads `DATABASE_URL` (SUPABASE_DB_URL optional
    override).
  - `app/db.server.js` / `app/shopify.server.js` — unchanged Prisma session storage, now pointed
    at Supabase via `DATABASE_URL`.
  - `app/lib/shopify-files.server.js` — the Shopify Files upload flow extracted from
    `api.upload.jsx` (reused by form 2's attachment). `api.upload.jsx` itself was left untouched.

### 13.4 Environment variables (CHANGED — supersedes §7 DATABASE_URL row)
| Var | Value | Purpose |
|---|---|---|
| `DATABASE_URL` | Supabase **transaction pooler** (`…pooler.supabase.com:6543/…?pgbouncer=true`) | Runtime — Prisma sessions **and** postgres.js form data. Replaces the old Neon URL. |
| `DIRECT_URL` | Supabase **session/direct** (`…pooler.supabase.com:5432/postgres`) | Migrations / Prisma introspection only. New. |

- Neon is **no longer used** — drop it. Existing Neon sessions are abandoned (one-time re-auth).
- `.env` (local) is set and working. `.env.example` documents both vars.
- ⚠️ **Vercel Production still has the OLD Neon `DATABASE_URL` and no `DIRECT_URL`** — update both
  before redeploying or the deployed app connects to the wrong DB / can't migrate.

### 13.5 Dependencies
- Added **`postgres`** (postgres.js). `@supabase/supabase-js` was briefly added then removed (the
  connection is a raw Postgres string, not the REST API). Prisma/nodemailer unchanged.
- `package.json` `setup` script changed `prisma generate && prisma migrate deploy` → `prisma generate`
  (Supabase owns migrations now).

### 13.6 Theme changes (repo `logo-mat`) — needed for product provenance
Hidden inputs added so the browser submits the product page URL + handle:
- `snippets/quote-form.liquid` (form 1) — `product_url` = `{{ shop.secure_url }}{{ product.url }}`,
  `product_handle` = `{{ product.handle }}`; plus these forwarded in the JSON body in
  `snippets/quote-request-form-js.liquid`.
- `snippets/custom-logo-form.liquid` (form 2) — same two hidden inputs (multipart sends them
  automatically).
- ⚠️ These theme edits **reverted once** on disk (a running `shopify theme dev` / theme pull is the
  likely cause). Re-applied and verified present. **Publish the theme** and stop any live sync
  while editing.

### 13.7 Checklist to finish (this enhancement)
- [x] `form_submissions` + `Session` migrations written and **applied to Supabase**.
- [x] Both handlers persist submissions (product url/handle/title, media_url, payload, email_status).
- [x] Admin Home list + detail pages built (Supabase-backed).
- [x] Product url/handle/title flow theme → handler → DB **verified** (replayed both payloads).
- [x] App renamed + scopes reduced in `shopify.app.toml`.
- [x] `npm run build` passes.
- [ ] **Commit + push** branch `admin-pages`; **deploy to Vercel** (Vercel Hobby blocker §5.1 still applies).
- [ ] **Update Vercel env:** `DATABASE_URL` → Supabase pooler, add `DIRECT_URL`, remove Neon; redeploy.
- [ ] **`shopify app deploy`** to apply the new name + scopes (may prompt scope re-consent).
- [ ] **Publish the theme** (`logo-mat`) — snippet edits are on disk only.
- [ ] **Live test:** submit both forms → row in `form_submissions` + shows in admin + emails sent;
      confirm form-2 attachment uploads to Shopify Files and `media_url` is stored (only path not
      yet exercised end-to-end).
- [ ] (Verify) `shopify.app.toml` `client_id` (`7cc30be0…`) vs the file-upload `SHOPIFY_API_KEY`
      (`21daae00…`) are **different apps** — reconcile if they should be one (affects which app's
      scopes matter).

> Secrets (Supabase password, Gmail App Password) live only in `.env` / Vercel — not repeated here.
