# Handover — EPS Upload Fix & Redeployment

**Project:** `custom-email` (Remix + Shopify app, deployed on Vercel)
**Repo:** `findsection/custom-email` (branch `main`)
**Prepared:** 2026-07-09 · **Updated:** 2026-07-10

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
