# Upload Login Gate — Master Task List

**Single source of truth for delivery.** Derived from `PLAN-upload-login-gate.md` (full detail) and
`PLAN-upload-login-gate-SUMMARY.md` (1-pager) at the repo root. Where this file and the plans
disagree, **this file wins** — the differences are deliberate and explained in §0.

| | |
|---|---|
| App repo | `custom-email-nisar/custom-email` — branch `feature/upload-login-gate` |
| App backup | `main-backup-08-08-2026` (snapshot of `main` @ `236e5a0`, taken 2026-08-08) |
| Theme repo | `logo-mat-central/logo-mat` — branch `feature/upload-login-gate` *(not yet created)* |
| Started | 2026-08-08 |
| Status | **F1 delivered and working on the test theme.** Only T8 (verification sweep) remains |

### Status at a glance — updated 2026-08-12

| | |
|---|---|
| **App (A0–A17)** | ✅ **complete** — built, deployed, verified in production |
| **Theme (T0–T7)** | ✅ **complete** — gate confirmed working end to end on test theme `190954144025` |
| **T8** | ⬜ **the only remaining task** — manual browser sweep (plan §9-D3) |
| **F2 (A8/A9/A11/A12)** | ⛔ declined — Shopify's new customer accounts already send a login OTP |
| **Open questions** | ✅ **none** — all 8 closed |
| **Blockers** | B1 ✅ · B2 ✅ · B3 ⬜ latent, does not affect this feature |

**Changes made after initial delivery** (all recorded in full below):

| | Where |
|---|---|
| F2 controls **removed** from the Settings page (checkbox, banners, 11-field card) | A7 |
| Per-template show/hide checkbox + app note | T7, Q6 |
| 4 MB upload size guard + shopper-facing message | §5.3 |
| Colour-gating fix — pre-existing, 13 sections | §5.1 |
| `email_verification_required` no longer opens the modal | §4.4 |

**Companion docs:** [SCHEMA.md](SCHEMA.md) — every table and column ·
[RUNBOOK.md](RUNBOOK.md) — operational commands (generate/rotate the secret, health checks,
turning the feature on and off, rollback, error-code triage, teardown).

**For the theme-side agent:** read §0 (ground rules), §3 (theme tasks), and §4 (the app↔theme
contract). §4 is the interface you code against. Every completed app task is written up in
§2 with the exact files and behaviour, so you can review what the app actually does.

---

## 0. Ground rules (non-negotiable — these override the plan documents)

The app is **live and working**. Therefore:

1. **No existing file is modified.** Every new behaviour goes in a new file. The only two
   exceptions are listed in §5, both are additive and both are called out at review time.
2. **The old code path stays live and reachable.** It is the rollback: point the endpoint /
   snippet back and everything is as it was, with no revert and no deploy.
3. **Ship OFF.** Every toggle defaults to off. Deploying the code changes nothing visible.
4. **One task at a time.** Each task is coded, then `bash scripts/check-no-break.sh` must pass
   (§0.6), then it is reviewed by Nisar, then marked done here with detail — before the next
   task starts.
5. **Segregated by job.** All new app code lives under `app/features/logo-upload/`, one module
   per responsibility. All new theme code is prefixed `mo-logo-upload-*`. A new developer should
   be able to delete the folder and the prefix and be back to today's behaviour.

### 0.1 Deliberate departures from `PLAN-upload-login-gate.md`

| Plan says | We do instead | Why |
|---|---|---|
| §5.2 — modify `app/routes/api.upload.jsx` | **New route** `app/routes/api.logo-upload.upload.jsx` → `POST /api/logo-upload/upload`. Old route untouched. | Editing it risks live uploads in 4 ways: (a) §10.3's own admission that the live theme starts 401-ing once the gate goes ON; (b) a `getSettings(shop)` DB read added before the upload throws → `500` if Vercel still points at Neon (blocker §2.3.3, unresolved); (c) there is no `shop` in the request today, so the settings lookup has no key; (d) narrowing CORS from `*` breaks the preflight if the origin list is wrong. |
| §5.4 — modify `snippets/mo-upload-image-js.liquid` | **New snippet** `snippets/mo-logo-upload-image-js.liquid`. Old snippet untouched. | It is one IIFE with no error handling, rendered on every product page. Adding `await window.MoUploadGate.ensureAllowed()` means a 404 or stale cache on `mo-logo-upload.js` makes `window.MoUploadGate` undefined → TypeError → uploads stop store-wide, silently. |
| §4.3.1 / §10.3 — `enforcement_mode` + `test_theme_ids` | **Dropped.** | Its only job was to stop the live theme 401-ing while we test on the test theme. With a separate endpoint the live theme never reaches the gated code at all, so the problem does not exist. The plan itself calls this setting "a rollout control, not a security boundary" — removing it removes a bypass rather than creating one. |
| §5.1 — `app/lib/*.server.js` | `app/features/logo-upload/server/*.server.js` | Ground rule 5. `app/lib/` holds shared code the live app already depends on; the feature gets its own tree so it is deletable in one move. |

Everything else follows the plan as written.

### 0.2 Open questions that block specific tasks

These come from plan §12. Tasks that depend on them are marked **[BLOCKED: Qn]** below.

| # | Question | Blocks |
|---|---|---|
| ~~Q1~~ | ✅ **ANSWERED 2026-08-11 — NEW customer accounts.** Verified against the live storefront: `/account/login` returns `302` to `https://shopify.com/93913186585/account`. Classic accounts render a login *form* on the shop's own domain and do not redirect. **→ F2 is redundant. See the decision box below.** | — |
| ~~Q2~~ | ✅ **ANSWERED 2026-08-11.** Accounts are enabled, and registration is self-serve *through the same flow*: `/account/register` lands on the **identical** `shopify.com/93913186585/account` URL as login. With new customer accounts, signing in with an unknown email creates the account. **→ the modal needs ONE button, not two.** | T3 simplified |
| ~~Q3~~ | ⛔ **MOOT 2026-08-11.** No OTP is sent — F2 is declined, so A8 (the mailer) was never built and no sender needs choosing. The forms keep their own hardcoded Gmail path, untouched. | — |
| ~~Q4~~ | ✅ **ACCEPTED.** `logo_upload_customer_files` starts empty; nothing was ever recorded before this feature, so no backfill is possible. Recording began the moment the test theme went live. | — |
| ~~Q5~~ | ✅ **ANSWERED — hardcoded**, as the plan assumed. Safe because Q7 confirmed the repo is private. A `settings_schema.json` setting would have exposed the secret in the theme-editor UI to anyone with theme access. | T2 done |
| ~~Q6~~ | ✅ **ANSWERED 2026-08-12 (Nisar).** No new control on the app Settings page — a **note** only. Per-template show/hide lives in the theme editor; default is ON for every template. The two override dropdowns are dropped (verification is declined; login stays global). | T7 done |
| ~~Q7~~ | ✅ **ANSWERED 2026-08-11 — private.** An anonymous `GET api.github.com/repos/Inventel-LLC/logo-mat` returns `404`; a public repo returns `200`. Safe for the secret to live in theme source. | — |
| ~~Q8~~ | ✅ **ANSWERED 2026-08-12 — out of scope, and now proven unreachable.** T7 found that in both `main-line-product*` sections our `#fileInput` widget sits inside a `{% comment %}` block and never renders, while the *active* condition wraps uploader #4. Both files were **excluded** from T7 so we cannot gate another app's uploader. | T7 done |

### 0.3 Pre-existing blockers (not caused by this work — plan §2.3)

Nothing reaches production until these are resolved. They do **not** block writing/reviewing code.

- [x] **B1** — ~~Vercel Hobby refuses commits from a non-owner~~ **RESOLVED 2026-08-11.** The app
      deploys; `/api/logo-upload/settings` returns 200 in production.
- [x] **B2** — ~~Vercel prod may still point at Neon~~ **RESOLVED 2026-08-11.** Proven by the
      production settings endpoint returning `degraded: false` — that flag is only false when the
      app has successfully read `logo_upload_app_settings`, a table that exists solely in Supabase.
- [ ] **B3** — `shopify.app.toml` client_id `7cc30be0…` ≠ runtime `SHOPIFY_API_KEY` `21daae00…`.
      Latent; no longer blocks F1/F2 (Liquid HMAC uses its own secret), but affects the embedded
      admin the new Settings page lives behind.

### 0.4 Upload inventory — exactly what is in scope

**Confirmed by Nisar 2026-08-08 and verified against the theme source.** The storefront has
**five** separate file-upload mechanisms. Only **one** gets the login gate.

| # | Uploader | Input | Posts to | Where | In scope? |
|---|---|---|---|---|---|
| **1** | **Product logo upload** (beside the product gallery) | `id="fileInput"` → `properties[Upload]` | `custom-email-pearl.vercel.app/api/upload` via `snippets/mo-upload-image-js.liquid` | 15 sections, 16 inputs | ✅ **YES — this is the only one** |
| 2 | Shipping-information form | `name="attachment"` in `#shipping-form2` | `/api/save-shipping-info` + `/api/save-shipping` via `snippets/quote-request-form-js.liquid` | `snippets/custom-logo-form.liquid`, rendered in **19** sections | ❌ no |
| 3 | Quote-request form (coin front/back logo) | `id="fileInput1"` / `id="fileInput2"` → `Coin Front Logo` / `Coin Back Logo` | same quote-request JS | `snippets/quote-request.liquid`, only in `sections/product-request-quote.liquid` | ❌ no |
| 4 | "Upload 1 / Upload 2" line-item uploads | `id="fileInput1"` / `id="fileInput2"` → `properties[Upload 1]`/`[Upload 2]` | **`/apps/file-upload`** — a Shopify **App Proxy** belonging to a *different app*, not this one | inline `setupUpload()` in `main-line-product.liquid` + `main-line-product-badge-display.liquid` | ❓ **see Q8** |
| 5 | — | | | | |

#### ⚠️ Hard rule for T5 — the selector

`snippets/mo-upload-image-js.liquid` binds with `getElementById('fileInput')`, which matches
**only** uploader #1. The new snippet must keep the selector **exactly** `#fileInput`:

```js
document.querySelectorAll('#fileInput')   // ✅ correct — 16 inputs, uploader #1 only
document.querySelectorAll('input[type=file]')  // ❌ NEVER — captures #2, #3 and #4 and breaks the live forms
```

Broadening the selector is the single easiest way to break the shipping and quote forms. Any
review of T5 must check this line first.

#### ⚠️ Hard rule for T6 — `layout/theme.liquid`

Line 548 renders `{% render 'quote-request-form-js' %}` **unconditionally**, with an existing
comment explaining that gating it on `custom.image_upload` previously broke the shipping-quote
modal's trigger and close button. T6 touches **only** the `image_upload` block at lines 538–540
and must leave line 548 and its comment alone.

#### Note on uploader #4

Those two sections (`main-line-product`, `main-line-product-badge-display`) contain **three** file
inputs each: `#fileInput` (ours, uploader #1) plus `#fileInput1`/`#fileInput2` (uploader #4).
Uploader #4 posts to `/apps/file-upload`, an App Proxy for a **different app** — this app has no
`[app_proxy]` config and never receives those requests. We therefore **cannot** gate #4 from here
even if it were wanted. See **Q8**.

### 0.5 Parallel-endpoint strategy (decided 2026-08-08)

**Decision:** build a completely separate endpoint, prove it on the test theme, then cut the live
theme over to it. The live endpoint is never edited, at any point.

#### Route naming is load-bearing — do not "tidy" it

This app is **Remix 2.16 with flat routes**, where dots in a filename are path segments *and*
nesting. Naming the new route `api.upload.v2.jsx` would make the **live** `api.upload.jsx` its
**parent layout route**, pulling the live file's `loader` (the one that returns
`405 Method Not Allowed`) into the new route's request lifecycle — recreating exactly the coupling
this whole approach exists to avoid, purely through the filename.

So every new endpoint uses the `logo-upload` segment, which shares no prefix with any existing
route:

| Route file | URL | Replaces |
|---|---|---|
| `api.logo-upload.upload.jsx` | `POST /api/logo-upload/upload` | the gated twin of `/api/upload` |
| `api.logo-upload.settings.jsx` | `GET /api/logo-upload/settings` | — |
| `api.logo-upload.verify-request.jsx` | `POST /api/logo-upload/verify-request` | — |
| `api.logo-upload.verify-confirm.jsx` | `POST /api/logo-upload/verify-confirm` | — |

Verified safe: no `api.jsx` or `api.logo-upload.jsx` parent exists, so these are standalone
resource routes. (`api.eps.upload.jsx` already works this way today with no `api.eps.jsx` parent.)

#### Why not `/api/upload/v2`? (asked and settled 2026-08-08)

It **was** achievable — Remix's trailing-underscore escape hatch (`api.upload_.v2.jsx`) produces
the URL `/api/upload/v2` without nesting. Rejected for two reasons:

1. **The underscore is load-bearing and invisible.** `api.upload_.v2.jsx` → `api.upload.v2.jsx`
   looks like a harmless typo fix, produces no error at review time, and silently re-parents the
   gated route under the **live** one. A booby trap in the one file we most need to stay isolated.
2. **It's four endpoints, not one.** Only the upload is a "v2 of" anything; settings and the two
   verification routes are not. `v2` would scatter the feature across three unrelated namespaces
   (`/api/upload/v2`, `/api/storefront/*`, `/api/verify-email/*`) instead of one greppable name
   that matches `app/features/logo-upload/` and the theme's `mo-logo-upload-*` prefix.

Also semantically: `v2` implies `/api/upload` is superseded outright. It isn't — per §0.4 four
other uploaders exist, and the new endpoint serves **only uploader #1**.

#### What this approach does and does not protect

| | |
|---|---|
| ✅ | `api.upload.jsx` byte-identical — proven by `git diff` in A17 |
| ✅ | Rollback is a **one-line theme change**, not a revert or a redeploy |
| ✅ | Deletes `enforcement_mode` / `test_theme_ids` entirely — the live theme can't 401 on a gate it never calls |
| ✅ | Blocker **B2** (Vercel possibly still on Neon) becomes a *test-theme-only* failure instead of a live one |
| ⚠️ | **Same Vercel deployment.** New routes ship in the same build. A broken build fails the deploy and the previous one keeps serving — a safe failure — but it can **block a future live hotfix**. |
| ⚠️ | **Same env vars.** They can't affect `/api/upload` (it reads none of the new ones), but env edits are deploy-wide. |
| ❌ | **Blocker B1 is untouched.** Vercel Hobby still refuses non-owner commits on a private repo. Nothing reaches production until it's fixed — start it in parallel, it gates everything. |

#### Cutover — "shifting to live"

Nothing is ever moved back into the old file. The cutover **is** the theme merge:

1. Test theme calls `/api/logo-upload/upload`, live theme still calls `/api/upload`.
2. Sign-off → merge the theme branch → the live theme now calls the new endpoint too.
3. **Keep `/api/upload` deployed and unused for a 30-day soak.** It costs nothing, and it keeps the
   rollback at one line in `theme.liquid` if a problem surfaces under real traffic weeks later.
4. Retire `/api/upload` after the soak, as its own small task. **Not before.**

### 0.6 The safety net — `scripts/check-no-break.sh`

"Nothing breaks" is a claim, so it is **mechanically verified** rather than promised.

```bash
bash scripts/check-no-break.sh          # full check incl. build
SKIP_BUILD=1 bash scripts/check-no-break.sh   # fast check, no build
THEME_DIR=/path/to/logo-mat bash scripts/check-no-break.sh
```

Three checks, exit 0 = safe:

| # | Check | Guards against |
|---|---|---|
| 1 | **Frozen files** — 20 files hash-matched against `docs/logo-upload/baseline.sha256` | Any edit to the live upload/form endpoints, shared libs, existing migrations or admin pages |
| 2 | **Markers** — 6 counts against `docs/logo-upload/baseline.counts` | The files we *do* edit (`theme.liquid`, the 15 sections) silently losing another uploader's wiring |
| 3 | **Build** — `npm run build` | A broken build, which blocks live hotfixes even though it can't corrupt live code |

**Rule: run it before every commit and at the top of every review.** A task is not "done" until
this passes.

> ⚠️ **`build/` is tracked in git** (28 files; `.gitignore` contains only `node_modules` and
> `.env`). Right now a build produces byte-identical output, so `git status` stays clean. **From
> A2 onward that stops being true** — adding routes changes the bundle, so `npm run build` (which
> this guard runs) will start showing modified tracked files under `build/`.
>
> That is derived output, not live source, so it is not a safety problem — but it will make
> `git status` noisy and could *mask* a real change. Decide before A2 whether to gitignore
> `build/` and `git rm -r --cached` it. **Not changed unilaterally**: if the Vercel deploy relies
> on committed build output, removing it would break the deploy — that needs checking first
> (related to blocker B1).

Baseline captured 2026-08-08 from app `main` @ `236e5a0`, theme `main` @ `638e458`.
Baseline build: **green**. Guard: **verified to fail correctly** on a deliberate tamper test of
`api.upload.jsx` (exit 1, hash mismatch reported), then restored.

If a check ever fails legitimately — because scope genuinely changed — the fix is **not** to
re-capture the baseline quietly. Add the file to §5, re-capture, and commit both in the same
change so the diff is visible at review.

---

## 1. Target file structure

### App (`custom-email`)

```
app/
  features/
    logo-upload/                        <- ALL new app code. Deletable in one move.
      README.md                            how it works, for a new developer
      config/
        defaults.js                        settings keys + default values (shared)
        errors.js                          error-code constants (login_required, ...)
      server/
        db.server.js                       table access primitives (reuses lib/supabase getSql)
        settings.server.js                 get/save/publicSettings + 60s cache
        customer-identity.server.js        HMAC verify — the ONLY trust decision
        uploads.server.js                  insert/list/get logo_uploads
        rate-limit.server.js               DB-backed counters
        mailer.server.js                   nodemailer transport + OTP template
        email-verification.server.js       issue/confirm code, mint/verify token
        cors.server.js                     CORS helper
      ui/
        SettingsForm.jsx                   Polaris form for the settings page
        UploadsTable.jsx                   Polaris table for the uploads page
  routes/                                <- thin route files, all NEW, all delegate to features/
    api.logo-upload.upload.jsx             POST  /api/logo-upload/upload
    api.logo-upload.settings.jsx           GET   /api/logo-upload/settings
    api.logo-upload.verify-request.jsx     POST  /api/logo-upload/verify-request
    api.logo-upload.verify-confirm.jsx     POST  /api/logo-upload/verify-confirm
    app.logo-upload.settings.jsx           admin Settings page
    app.logo-upload.uploads.jsx            admin Uploads list
supabase/migrations/                     <- 3 NEW files, additive only, no ALTER on live tables
docs/logo-upload/
  TASKS.md                                 this file
```

### Theme (`logo-mat`)

```
snippets/
  mo-logo-upload-config.liquid          NEW  per-section: HMAC signing + data-* config
  mo-logo-upload.liquid                 NEW  modal markup, rendered once from layout
  mo-logo-upload-image-js.liquid        NEW  gated copy of mo-upload-image-js
assets/
  mo-logo-upload.js                     NEW  all gate logic (cacheable, no Liquid)
  mo-logo-upload.css                    NEW  scoped styles under #mo-logo-upload
layout/theme.liquid                     MOD  one if/else: old snippet vs new
sections/*.liquid  (x15)                MOD  schema settings + wrapper if + one render
```

---

## 2. APP-SIDE TASKS

Legend: `[ ]` not started · `[~]` in review · `[x]` done

### Phase A1 — Foundation (no behaviour, deployable on its own)

- [x] **A0 — Branch + docs scaffold**
  <details><summary>Done 2026-08-08</summary>

  - Created `main-backup-08-08-2026` from `main` @ `236e5a0` (local snapshot; **not pushed**).
  - Created and checked out `feature/upload-login-gate` from the same commit.
  - Created `docs/logo-upload/TASKS.md` (this file).
  - No application code touched.
  </details>

- [x] **A1 — DB migrations (3 new SQL files)** — *written **and applied** 2026-08-08. Verified.*
  <details><summary>Applied to Supabase 2026-08-08 — 4 tables created, live data untouched</summary>

  ### ⚠️ `supabase db push` was NOT used — and must not be

  There is **no `supabase/config.toml`** and the project is **not linked** to the CLI. The four
  pre-existing migrations were applied by pasting into the Supabase SQL editor (their own headers
  say so), so the remote `supabase_migrations.schema_migrations` ledger does not reflect reality.

  `supabase db push` would therefore have tried to apply **all seven** migrations — including
  `20260718000000_add_shop_to_form_submissions.sql`, which contains

  ```sql
  update public.form_submissions set shop = '…' where shop is null;
  ```

  an `UPDATE` against **live production data**, for a change that is meant to be purely additive.

  Instead, the 3 files were applied by a throwaway script with a hardcoded 3-file allowlist, so it
  *could not* execute the pre-existing migrations even if asked. Each file ran in its own
  transaction; every statement is `if not exists`, so re-running is safe.

  **That script was deleted once the migrations were applied** — its job is done and no later task
  adds migrations. The knowledge it carried is preserved right here.

  ### If you ever need to apply a migration to this project

  1. **Do not run `supabase db push`** until the project is properly `supabase init` + `link`ed
     *and* the remote ledger is reconciled with the four already-applied migrations. Until then it
     will re-run them.
  2. Safe options: paste the SQL into the **Supabase SQL editor** (how every migration here has
     been applied so far), or run just the new file(s) over `DIRECT_URL` — not the pooled
     `DATABASE_URL`, which runs in transaction mode and is unreliable for DDL.

  ### Applied result

  | Table | Columns | RLS | FKs |
  |---|---|---|---|
  | `logo_upload_app_settings` | 3 | ✅ | none |
  | `logo_upload_customers` | 8 | ✅ | none |
  | `logo_upload_email_verifications` | 10 | ✅ | none |
  | `logo_upload_customer_files` | 16 | ✅ | none |

  **Live data proven untouched:** `form_submissions` had 39 rows before and 39 after; no
  pre-existing table was dropped or altered. Only `Session` and `form_submissions` existed
  beforehand.

  **Constraints proven to actually fire** (`--verify`, inside an always-rolled-back transaction):
  - rejects a row with neither `customer_gid` nor `email`
  - rejects `verified=true` with no `verified_at`
  - rejects `verified=false` *with* a `verified_at`
  - accepts a valid verified row

  ### Files

  Full column-level map: **[SCHEMA.md](SCHEMA.md)**.

  | File | Creates |
  |---|---|
  | `…20260808000000_create_logo_upload_app_settings.sql` | `logo_upload_app_settings` |
  | `…20260808000100_create_logo_upload_customers.sql` | `logo_upload_email_verifications` + `logo_upload_customers` |
  | `…20260808000200_create_logo_upload_customer_files.sql` | `logo_upload_customer_files` |

  **Revised twice during review (2026-08-08), before applying — so both changes cost nothing:**

  1. **Customer GID is the primary identity, not email.** Email is mutable; the GID
     (`gid://shopify/Customer/{{ customer.id }}`) is permanent. Keying on email meant a customer
     who changed their address was treated as a stranger and had to re-verify. `logo_upload_customers`
     now uses two *partial* unique indexes — GID for logged-in rows, email only for null-GID rows —
     and `logo_uploads.customer_email` is demoted to a labelled display copy. Email survives as a
     fallback for the one case with no customer: `require_login=false` + `require_email_verification=true`.
  2. **Every table holding customer detail carries `customer` in its name.** `app_settings` is the
     only one without, because it holds none.

  **No foreign keys, all customer columns nullable.** `customer_gid` references a *Shopify*
  customer, not a row in this database. A missing/unknown/deleted customer stores `null`; an upload
  is never lost because the identity was imperfect. Verified by grep: zero `references` / `foreign key`.
  Longest identifier 47 chars (Postgres limit 63).

  **One constraint can reject a write**, flagged for transparency:
  `logo_upload_customers` has `check (customer_gid is not null or email is not null)`.
  It can only fire on a code bug — you cannot verify *nothing* — and storing a meaningless row
  would be worse. Nothing on the live upload path (`customer_logo_uploads`) can reject an insert.

  **Additive-only, verified mechanically.** All 12 statements across the 3 files are
  `create table if not exists`, `create index if not exists`, or
  `alter table … enable row level security` on the **new** tables. No `drop`, `truncate`,
  `delete`, `update`, or any `alter` against `form_submissions` / `session`. Guard passes.

  **⚠️ Not applied.** Production and local share one Supabase (plan §10.5), so running these is a
  live-database operation. Files are written; **Nisar applies them** via `supabase db push` or the
  SQL editor. Reversible with `drop table` — nothing existing is modified, so a rollback cannot
  lose data.

  **Two deliberate departures from plan §7 — please confirm at review:**

  1. **Tables are prefixed `logo_upload_`** (plan said bare `app_settings`, `email_verifications`,
     `logo_upload_customers`, `logo_uploads`). Reasons: (a) prod and local share one database, and a
     table called plain `app_settings` is exactly the name a future unrelated feature would also
     want; (b) it mirrors `app/features/logo-upload/` and the theme's `mo-logo-upload-*` prefix, so
     one `grep logo_upload` finds the whole feature in the schema too; (c) it makes the teardown
     obvious — four tables, one prefix.
  2. **No rate-limit table.** Plan §5.1 called for a "DB-backed counter", but §7 never defined one.
     None is needed: a code request *is* a row in `logo_upload_email_verifications`, so both limits
     (3/email/15 min, 10/IP/hour) are counting queries over two indexes I added for exactly that.
     One less table, and a counter that can't drift from reality.

  **Also worth knowing:**
  - `email_verified` is stored **per upload row** rather than read from `logo_upload_customers` at
    display time — that table reflects *today's* state, the column records what was true *at upload
    time*.
  - Expired verification rows are **not** auto-pruned. A `pg_cron` job is a separate decision and
    an unattended `DELETE` isn't something to add silently; there's a comment in the file with the
    query if it ever matters.
  - `customer_id` is nullable by design: when `require_login` is OFF, anonymous uploads are legal.
  </details>

- [x] **A2 — Feature scaffold + config** — *done 2026-08-08*
  <details><summary>3 files, 38 assertions passing, no existing file touched</summary>

  | File | Purpose |
  |---|---|
  | `app/features/logo-upload/config/defaults.js` | Settings spec, defaults, validation, public projection |
  | `app/features/logo-upload/config/errors.js` | Error codes — **half of the theme contract** (§4.4) |
  | `app/features/logo-upload/README.md` | Orientation for a new developer |

  Both are **pure data + pure functions** — no imports, no DB, no framework — so they are safe to
  import from server modules, loaders, and the admin UI alike.

  **`SETTINGS_SPEC` is the single source of truth.** Four things previously destined to repeat a
  key list now read from it: defaults, save-time validation, the admin form (A7), and the public
  projection (A10). Adding a setting is a one-line change instead of a four-file change that drifts.

  **Design decisions worth reviewing:**

  1. **`public: true` is a whitelist, not a blacklist.** Only 3 of 9 settings reach the storefront
     (`require_login`, `require_email_verification`, `code_expiry_minutes`) plus all 10 copy
     strings. Security tuning — attempt caps, rate limits, `fail_mode` — is server-only. Publishing
     it tells an attacker how much room they have. A future sensitive setting cannot leak by
     omission.
  2. **`fail_mode` is deliberately NOT public.** If the storefront can't reach the settings
     endpoint it can't have read `fail_mode` either, so publishing it is useless — and it would
     reveal whether the gate can be bypassed by taking the endpoint down.
  3. **`mergeSettings()` can never throw.** Tested against `null`, `undefined`, `{}`, a string and
     an array — all produce valid settings with both features OFF. It runs on the upload path; a
     settings problem must never become a failed customer upload.
  4. **`code_expiry_minutes` IS public** so the modal can say "expires in 10 minutes" without the
     theme hardcoding a number that drifts from the real value.
  5. **Blank copy resets to default** rather than rendering nothing — an empty heading would leave
     the modal looking broken.
  6. **`errorBody()` keeps the legacy `error` key** alongside `code`, so the new endpoint stays
     drop-in compatible with the existing theme's `{ error: "..." }` handling.

  **Verified:** ships OFF · merge never throws (6 hostile inputs) · clamping (`999` days → `365`,
  `0` minutes → `1`) · unknown keys dropped · invalid enum rejected · overlong copy truncated ·
  6 server-only keys confirmed hidden from the public projection · override precedence · unknown
  error code returns 500 not 200.
  </details>

- [x] **A3 — `server/db.server.js` + `server/settings.server.js`** — *done 2026-08-10*
  <details><summary>2 files, 31 assertions passing against the real database</summary>

  `db.server.js` is the **single seam** to the database. Every other module in the feature goes
  through it rather than importing `app/lib/supabase.server.js` directly — that lib is a live file
  the form flows depend on and is frozen by the guard. We import it, never modify it. Table names
  live in one place too.

  ### The rule that shaped `settings.server.js`

  **A settings problem must never become a failed upload.** `getSettings()` never throws; it
  reports degradation and lets the caller apply `fail_mode`. `saveSettings()` **does** throw —
  the admin pressed Save and must be told if it did not persist.

  ### Degradation ladder (best → worst)

  | `source` | When | Tested |
  |---|---|---|
  | `cache` | Fresh read from the last 60 s | ✅ |
  | `db` | Live read | ✅ |
  | `stale-cache` | DB unreachable, but an expired real value is held | ⚠️ **not covered** |
  | `defaults` | DB unreachable, nothing cached. Both features OFF | ✅ real `CONNECTION_ENDED` |

  **`stale-cache` is preferred over `defaults` deliberately:** the merchant's actual settings,
  slightly old, beat silently reverting to "both features off" — which would drop the gate without
  anyone asking for it.

  > ⚠️ **Untested branch, stated plainly.** `stale-cache` needs a cache entry older than 60 s *and*
  > a dead database in the same process. Simulating it means either waiting 60 s or making the TTL
  > overridable, and adding production config purely for testability wasn't worth it. It is 3 lines
  > and readable, but it is **not** covered — worth a second pair of eyes at review.

  ### Honest limitation of the `defaults` rung

  `fail_mode` itself lives in the database, so when we have *never* successfully read it we cannot
  honour a merchant's `fail_mode: "closed"`. The default is `open`, so uploads proceed as they do
  today. Deliberate — it protects sales, and matches plan §8.

  ### Other decisions

  - **Failure backoff (5 s).** A failed read is cached briefly so a database outage isn't hammered
    once per upload. Short enough to recover fast.
  - **Patches accumulate.** Stored blob is `{ ...existing, ...coerced }`, and `copy` is merged one
    level deeper so saving one string doesn't wipe the other nine. Keys the merchant never touched
    stay **absent** from the row and keep following the code default — verified: after two saves,
    `fail_mode` is still not in the stored JSON.
  - **No second connection pool.** Everything inherits the existing `getSql()`.
  - **Cache is per-process.** Serverless runs many; cross-instance consistency comes from the 60 s
    TTL, which is why A10 will advertise `s-maxage=60` and no longer.

  **Verified against the live Supabase** (test rows created and deleted; `logo_upload_app_settings`
  left empty): missing row = valid defaults and *not* an error · cache hit/invalidate · form string
  `"on"` → `true` · `9999` days clamped to `365` · unknown keys dropped · persistence across cache
  clear · two patches accumulate without clobbering · public projection hides all 6 server-only
  keys · `tryRead` swallows a real SQL error · **connection killed mid-run → degraded to defaults,
  complete settings returned, never threw** · `saveSettings("")` throws.
  </details>

- [x] **A4 — `server/customer-identity.server.js`** — *done 2026-08-10*
  <details><summary>The security core. 34 adversarial assertions passing. Found and fixed 1 real bug.</summary>

  Exact payload format and the Liquid to produce it: **§4.2 above** — that is the theme contract.

  ### Two additions beyond the plan's payload

  The plan (§4.3.4) specified
  `login_override|verification_override|customer.id|customer.email`. Two fields were added:

  1. **`shop`.** Without it, a signature minted on store A verifies on store B — the secret is
     per-**app**, not per-shop. Any future second install would inherit a cross-store identity
     forgery. Tested.
  2. **`v1` version prefix.** Lets the payload format change later without every Shopify-cached
     page failing in an unexplainable way.

  Also: the payload signs the **full GID** (`gid://shopify/Customer/123`) rather than the bare
  numeric id, so what is signed is exactly what is stored — no transformation between verification
  and persistence where a mismatch bug could hide.

  ### Delimiter injection — guarded

  An email may legally contain `|` in a quoted local part. If it did, an attacker controlling that
  field could shift the others and produce a payload that verifies but *means* something else.
  Rather than reason about how unlikely that is, `buildPayload()` refuses outright and
  `resolveCustomer()` returns `malformed`.

  ### 🐛 Real bug found by the adversarial tests

  `resolveCustomer(null)` **threw**. A default parameter (`body = {}`) only applies to `undefined`,
  not `null` — and `null` is easy to produce from a failed JSON parse or an absent form body. On
  the upload path that would have been a 500. Fixed with `rawBody ?? {}`; `null`, numbers, arrays
  and a bare string are all now covered.

  I also caught a **bad test**: the rotation case re-signed with the *current* secret via
  `signIdentity`'s default, so it was not testing rotation at all. Now signs explicitly with the
  old secret.

  ### Verified

  Forgery: no signature · tampered signature · swapped GID · swapped email · signature minted for
  a *different* email. Cross-shop replay rejected. Forged `login_override=off` → untrusted, override
  forced back to `default`, identity discarded — while a *legitimately signed* `off` **is**
  honoured. Logged-out visitor: signed empty identity is trusted but yields `customerGid: null`.
  Rotation: old signature passes with `_PREVIOUS` set, fails without it. Misconfiguration returns
  `no_secret`, **not** `bad_signature`. Never throws on 6 hostile input shapes. Email lowercased
  only *after* verification.

  Timing-safe comparison via `crypto.timingSafeEqual`, with a length pre-check (digest length is
  fixed and public, so that is not a leak).
  </details>

- [x] **A5 — `server/uploads.server.js`** — *done 2026-08-10*
  <details><summary>25 assertions passing against the real database</summary>

  `insertLogoUpload()` · `listLogoUploads()` · `countLogoUploads()` · `getLogoUpload()` —
  every query scoped by `shop`, same rule as `listFormSubmissions`.

  ### ⚠️ Decision: `insertLogoUpload()` does NOT throw

  It runs **after** the file has already reached Shopify Files and a CDN URL exists — the
  customer's upload has genuinely succeeded by then.

  If the audit insert failed and we rethrew:
  - the route returns an error,
  - the theme never sets `properties[Upload]`,
  - **the order arrives with no logo attached at all**,
  - and the shopper retries, orphaning the first file in Shopify.

  So we would be destroying the actual deliverable to protect a secondary record. The insert
  therefore logs loudly and returns `null`; the upload completes.

  **The cost, stated plainly:** a database outage during uploads means rows missing from the admin
  list, with no gap visible in the UI. Two mitigations: the log line is deliberately worded
  `[logo-upload] AUDIT WRITE FAILED` so it is greppable and alarming, and **the order itself still
  carries the file URL in its line-item property** — so the merchant is never actually blind to the
  logo, only to our copy of the metadata.

  Reads are equally defensive: an invalid uuid in the URL renders "not found" rather than a 500.

  ### Other notes

  - **Column whitelist**, not a spread — a stray key from a request body can never become a column
    reference. Same pattern as `app/lib/supabase.server.js`.
  - **Pagination capped** at 200 (default 50) so a large store cannot render 50k rows.
  - **Two separate queries** for the customer filter rather than one with a conditional fragment,
    because it hits a different index — `(shop, customer_gid)` vs `(shop, created_at desc)`.
  - `file_size` is `bigint`, so postgres.js returns it as a **string**. Coerce at display time.

  **Verified:** insert + read-back · unknown key `evil` dropped with no column error · anonymous
  upload (no customer) succeeds · shop A cannot read shop B's row by id · empty shop returns
  empty/0/null everywhere · newest-first ordering · limit/offset · limit clamped to 200 · `limit: 0`
  falls back to default · negative offset treated as 0 · customer filter · invalid uuid → null, not
  a throw · empty/null/unknown-key rows → null. Test rows deleted; table left at 0.
  </details>

- [x] **A6 — `server/cors.server.js`** — *done 2026-08-10*
  <details><summary>31 assertions passing. Also the shared JSON/error response helpers.</summary>

  `corsHeaders()` · `preflight()` · `methodNotAllowed()` · `jsonWithCors()` · `errorWithCors()`

  ### Unconfigured = today's behaviour, byte for byte

  The live `/api/upload` sends `Access-Control-Allow-Origin: "*"`. With `STOREFRONT_ORIGIN` unset,
  so do we. Tightening it is plan step 13 — after go-live, as its own change. Getting an allowlist
  wrong breaks uploads on the first preflight, so it is opt-in.

  ### ⚠️ The test-theme trap (plan §10.2) — handled and tested

  An unpublished theme previews on `<shop>.myshopify.com`, **not** the live custom domain. So
  setting `STOREFRONT_ORIGIN=https://www.logomatcentral.com` alone would break **every test-theme
  upload** — exactly when we are trying to test the feature. Wildcards are supported for this:

  ```
  STOREFRONT_ORIGIN=https://www.logomatcentral.com, *.myshopify.com
  ```

  Tested: the live-domain-only list *does* block the preview host; the wildcard allows it; and the
  wildcard correctly rejects `evil-myshopify.com` and bare `myshopify.com`.

  ### Two subtleties

  - **The allowed origin is echoed, not the pattern.** A browser requires an exact match, so
    returning `*.myshopify.com` literally would fail. Echoing means the response varies by origin,
    hence `Vary: Origin` — without it a CDN could serve one store's allowed origin to another.
  - **An unknown origin does NOT fall back to `*`.** Otherwise the allowlist would silently
    disable itself the moment an unexpected origin appeared.

  ### Not a security boundary — stated so nobody assumes otherwise

  CORS restricts **browsers**, not `curl`. The real enforcement is the HMAC in A4. This reduces
  casual cross-site abuse and nothing more.

  **Verified:** unset → `*` with no `Vary` · configured → echo + `Vary` · foreign origin blocked
  and not `*`-fallback · wildcard matching incl. two near-miss attacks · garbage origin doesn't
  throw · preflight 204 · **405 carries CORS** (so the browser shows the real error, not an opaque
  CORS failure) · status always derived from the error code · **unknown code → 500, never 200** ·
  legacy `error` key present alongside `code`.
  </details>

### Phase A2 — Admin UI (visible, but controls nothing yet)

- [x] **A7 — `app.logo-upload.settings.jsx` + `ui/SettingsForm.jsx`** — *done 2026-08-10 · revised 2026-08-12*

  > **Revised 2026-08-12 — F2 controls removed from the page.** The `require_email_verification`
  > checkbox, its explanation, the classic-vs-new banner and the entire 11-field
  > "Email verification settings" card are gone, along with `login_create_account` (the modal renders
  > one button, so editing that label had no visible effect).
  >
  > Two **notes** were added in their place, per Nisar: where to show/hide the upload field (theme
  > editor, not this page) and the 4 MB size limit.
  >
  > The server-side guard stays: the action still strips `require_email_verification` from any
  > patch, so a crafted POST cannot enable a feature whose endpoints do not exist. Verified —
  > 9 assertions, including that existing `verify_*` copy is not wiped.
  <details><summary>18 assertions on loader/action. UI needs manual verification.</summary>

  Route nests under `routes/app` (verified in the build manifest), so it inherits the embedded
  admin shell. Fields are driven by `SETTINGS_SPEC` / `COPY_SPEC`, so labels, help text and numeric
  bounds cannot drift from what the server accepts.

  ### ⚠️ Email verification is shown but DISABLED

  F2's endpoints are held pending Q1, so a shopper has no way to *receive* a code. If a merchant
  switched `require_email_verification` on today, `/api/logo-upload/upload` would correctly return
  403 for **every** upload with no way out.

  The toggle is therefore **disabled with an explanation** rather than hidden (which would make the
  roadmap invisible) or left enabled (a live footgun). Flip `VERIFICATION_AVAILABLE` to `true` when
  A9/A11/A12 ship.

  **The guard is enforced server-side too** — the action deletes `require_email_verification` from
  the patch regardless of what was POSTed, so a crafted request cannot bypass the disabled
  checkbox. Tested: the key is not even written to the database, while other fields in the same
  POST still save.

  ### Other decisions

  - **Checkboxes submit via hidden inputs.** An unchecked native checkbox sends nothing, which is
    indistinguishable from "field omitted" — a feature could never be turned back OFF. Tested.
  - **Critical banner when `LOGO_UPLOAD_SECRET` is unset** (plan §8), stating plainly that turning
    the gate on would reject every upload.
  - **Save is disabled while degraded**, with a warning — saving fallback values would overwrite
    the merchant's real settings with defaults.
  - **The form remounts on saved values** (`key={JSON.stringify(settings)}`) so it shows what the
    server actually stored after clamping, not what was typed.

  **Verified:** loader returns settings + `secretConfigured` + `verificationAvailable: false` ·
  secret detection flips correctly · save persists · `9999` days → `365`, `0` minutes → `1`,
  `-5` attempts → `1` · `copy.*` parsed into the nested object with untouched strings left at
  default · a feature can be turned back **OFF** · unknown key `evil` not stored · invalid enum
  ignored · **crafted POST cannot enable verification**.

  > **Not covered by tests:** the rendered React UI. `authenticate` was stubbed and the component
  > stripped so Node could load the module — the loader and action bodies are byte-identical, but
  > the Polaris markup itself needs a look in the embedded admin. It is reachable only after A15
  > adds the nav link.
  </details>

- [~] **A8 — `server/mailer.server.js`** — ⛔ **DECLINED 2026-08-11** (see the F2 decision box). Kept for reference.
  Nodemailer transport reading `GMAIL_USER` / `GMAIL_APP_PASSWORD`, plus the OTP email template.

  > ⚠️ **This is a SEPARATE transport, used only for verification codes.**
  > `api.save-shipping.jsx` / `api.save-shipping-info.jsx` send their own emails with **hardcoded
  > Gmail credentials**, and are **deliberately not refactored** (plan §5.2). This is the one task
  > where overlap with the forms was even possible — do not "tidy" the forms into the new mailer.
  > Doing so would edit a live file, break the frozen-file guard, and put the two form flows at
  > risk for zero benefit to this feature.
  >
  > Moving those credentials to env vars **and rotating them** is plan delivery step 13 — scheduled
  > deliberately for *after* go-live, as its own change.

- [~] **A9 — `server/rate-limit.server.js` + `server/email-verification.server.js`** — ⛔ **DECLINED 2026-08-11.** Kept for reference.
  Issue/confirm 6-digit codes (hashed at rest, 10 min TTL, 5 attempts, single-use), mint and
  verify the 15-min signed token, `isContactVerified()`. Rate limits 3/email/15min, 10/IP/hour.

> ### ⛔ FINAL DECISION (2026-08-11) — F2 (email verification) is DECLINED, not deleted
>
> **Nisar, after testing the login flow on the test theme:** Shopify's own login already sends a
> one-time code, and it works as expected. A second code from us would verify an address Shopify
> verified seconds earlier. **Not building it.**
>
> **Declined:** A8 (mailer) · A9 (rate-limit + verification) · A11 (verify-request) ·
> A12 (verify-confirm). Marked `[~]` and left in this document **on purpose** — the design,
> the reasoning and the trade-offs stay available if the decision is ever revisited.
>
> **Nothing is being ripped out.** What already exists stays, because it is inert and removing it
> would be a change with risk and no benefit:
>
> | Exists | Status |
> |---|---|
> | `logo_upload_customers`, `logo_upload_email_verifications` tables | unused, empty, harmless |
> | `require_email_verification` setting | ships `false`, **disabled in the admin UI** |
> | The verification check in `api.logo-upload.upload.jsx` | never fires while the setting is off |
> | `customers.server.js` (`isCustomerVerified`) | called only when the setting is on |
> | Verification copy fields on the Settings page | saved, unused |
>
> **If you later want it gone entirely**, the teardown is in [RUNBOOK.md](RUNBOOK.md) §9. Until
> then leaving it inert costs nothing and keeps the option open.
>
> ⚠️ **Do not flip `VERIFICATION_AVAILABLE` to `true`** in `app.logo-upload.settings.jsx` — the
> endpoints do not exist, so enabling the setting would reject every upload.

> ### 📌 Superseded — F2 held pending Q1 (2026-08-11, now resolved above)
>
> **Q1 is answered: the store uses NEW customer accounts.** So Shopify's own login already emails a
> one-time code, and F2 would email a second 6-digit code to verify an address Shopify verified
> seconds earlier.
>
> **Nisar's call: keep F2 on hold until the F1 build has been tested end-to-end on the test theme,
> then decide.** Nothing is cancelled and nothing is built. Resuming stays purely additive — the
> tables, the setting and the enforcement in A13 all already exist.
>
> Revisit this once T0–T6 are testable. If F2 is then dropped, the removal is:
> A8/A9/A11/A12 cancelled · `require_email_verification` setting removed · the 11-field settings
> card removed · `logo_upload_email_verifications` and `logo_upload_customers` dropped · the
> verification modal removed from T3/T4.

> ### 📌 Phasing decision (2026-08-10) — F1 first, F2 held
>
> **Build all of F1 now; hold F2 until Q1 is answered.**
>
> This departs from plan §11, which builds the verify-email routes at step 3 ("idle until F2 is
> turned on"). It does **not** depart from the plan's *rollout* order — §11 already turns
> `require_login` ON at step 9 and `require_email_verification` ON at step 10, separately.
>
> The reason is the plan's own caveat, raised twice:
> > §4.2 — *"if the store uses Shopify's **new customer accounts**, login is already an email
> > one-time code, so Shopify has verified the address and F2 is largely redundant."*
> > §12 Q1 — *"worth confirming the client still wants it."*
>
> Q1 was never answered. Building F2 and *then* discovering the store uses new customer accounts
> would waste 4 app tasks, a mailer, 2 endpoints and the theme's verification modal.
>
> **In this phase:** A6, A10, A13, A7, A14, A15, A16, A17 — a complete, working login gate with
> nothing blocked.
> **Held pending Q1:** A8, A9, A11, A12. The database tables and the `require_email_verification`
> setting already exist, so resuming is additive with no rework.

### Phase A3 — Endpoints

> ⚠️ **Route naming is load-bearing — see §0.5.** Every new route uses the `api.logo-upload.*`
> segment specifically so that Remix flat routes create **no** parent/child relationship with the
> live `api.upload.jsx`.

- [x] **A10 — `api.logo-upload.settings.jsx`** — *done 2026-08-10*
  <details><summary>27 assertions passing. Route nesting verified against real build output.</summary>

  `GET /api/logo-upload/settings?shop=…` → public flags + merchant copy. Thin route; all logic in
  `app/features/logo-upload/`.

  ### ✅ Route nesting verified, not assumed

  Built the app and read the route manifest out of `build/server/index.js`:

  ```
  routes/api.logo-upload.settings  | parent: root
  routes/api.upload                | parent: root
  routes/api.eps.upload            | parent: root
  ```

  `parent: root` — the new route is **not** nested under the live `api.upload.jsx`. This is the
  §0.5 trap, now confirmed against the actual compiler output rather than reasoning about the
  convention.

  ### This endpoint never returns an error status

  The storefront calls it *before* letting a shopper pick a file, so a 4xx/5xx would either block a
  sale or force the theme to guess. Every path returns **200** with a usable payload:

  | Case | Response | `Cache-Control` |
  |---|---|---|
  | Normal | real settings, `degraded: false` | `s-maxage=60` |
  | No `shop` param | defaults (features **OFF**), `degraded: true` | `no-store` |
  | Unknown shop | defaults (features **OFF**) | `s-maxage=60` |
  | DB unreachable | fallback, `degraded: true` | `s-maxage=5` |

  **The degraded cache is short on purpose.** Serving fallback values with `s-maxage=60` would let
  a CDN hold "both features off" for a full minute *after* the database recovered.

  ### No auth, deliberately

  The payload is non-secret by construction — `toPublicSettings()` is a whitelist and omits all
  security tuning. Requiring auth would mean shipping a credential to every storefront page.

  **Verified:** exact key set returned (`requireLogin`, `requireEmailVerification`,
  `codeExpiryMinutes`, `copy`, `degraded`) — 6 server-only keys confirmed absent · saved settings
  and merchant copy reflected, untouched copy still default · missing/unknown shop → 200 + OFF ·
  shop normalised (uppercase, padded) · `OPTIONS` → 204 · `POST` → 405 **with CORS** so the browser
  shows the real error · preview origin echoed when `STOREFRONT_ORIGIN` is configured.
  </details>

- [~] **A11 — `api.logo-upload.verify-request.jsx`** — ⛔ **DECLINED 2026-08-11.** Kept for reference.
  `POST` → always `200 {ok:true}` (enumeration-safe), emails the code.

- [~] **A12 — `api.logo-upload.verify-confirm.jsx`** — ⛔ **DECLINED 2026-08-11.** Kept for reference.
  `POST` → validate code → signed token. `403 email_mismatch` if a logged-in user tries a
  different address.

- [x] **A13 — `api.logo-upload.upload.jsx` — the gated upload endpoint** — *done 2026-08-10*
  <details><summary>24 assertions. Found and fixed a REAL gate-bypass vulnerability.</summary>

  Field contract: **§4.3 above**. `api.upload.jsx` is **not touched** — verified by the guard.
  Reuses `app/lib/shopify-files.server.js` unmodified, so EPS handling and the `{url, fileId}`
  response are identical to today.

  Also added `server/customers.server.js` (read side of `logo_upload_customers`), symmetric with
  A5's files module. The **write** side — marking a customer verified — belongs to A9 and does not
  exist yet, which is why a customer can be *checked* but cannot yet *become* verified. Intentional;
  `require_email_verification` ships OFF.

  ### 🔴 Vulnerability found and fixed: shop-spoofing gate bypass

  The first implementation looked settings up by the **submitted** `shop` field:

  ```js
  const shop = (body.shop || process.env.SHOPIFY_SHOP || "").trim().toLowerCase();
  const { settings } = await getSettings(shop);   // ← body.shop is attacker-controlled
  ```

  **The bypass:** send `shop=anything-else.myshopify.com`. That shop has no settings row, so the
  defaults apply — `require_login: false` — and **the gate switches itself off**. No signature
  needed. One extra form field defeated the entire feature.

  **Why it happened:** the HMAC design correctly treats `customer_gid`, `customer_email` and both
  overrides as untrusted, but `shop` was quietly treated as trusted *because it is inside the signed
  payload*. Being signed protects it from tampering **only for requests that carry a signature** —
  it does nothing for a request that simply omits one.

  **The fix:** settings are looked up by `SHOPIFY_SHOP` — the store `uploadToShopifyFiles()`
  actually uploads to. Whatever the request claims, the file lands in that store, so that store's
  settings govern it. The submitted `shop` is still used *unmodified* for HMAC verification (the
  theme signed what it sent), so a mismatched shop now fails the signature on the normal path and
  is logged as either a misconfigured theme or a probe.

  **Caught by a test that was written to assert something else** — "sig from another shop →
  invalid_signature" passed the gates instead of failing, which is what exposed it.

  ### Verified — 24 assertions

  Basics: no file → `400 no_file` · `GET` → 405 · `OPTIONS` → 204.
  Gates OFF: no signature → reaches upload (identical to today).
  `require_login` ON: guest blocked · signed-but-logged-out blocked · signed + logged in passes.
  Forgery: tampered signature · claimed GID with no signature · forged `login_override=off`.
  **Shop spoofing: another shop with a signature, another shop without, empty shop, omitted shop —
  all still blocked.**
  Signed overrides: `off` + app ON passes; `on` + app OFF blocks.
  Misconfiguration: gate ON + no secret → `gate_secret_unconfigured`; gates OFF + no secret → works.
  Verification: unverified → 403 · verified → passes · **expired** → 403 · **revoked** → 403.
  And: **zero audit rows written for rejected uploads.**

  > **Not yet covered:** a real end-to-end success against Shopify Files. The tests deliberately
  > break `SHOPIFY_API_KEY` so a request that clears every gate fails at the upload step — proving
  > gate-passing without creating real files in the live store. A genuine upload is part of A17 /
  > manual test-theme testing.
  </details>

- [x] **A14 — `app.logo-upload.uploads.jsx` + `ui/UploadsTable.jsx`** — *done 2026-08-10*
  <details><summary>21 assertions on the loader. This is where F1's whole point becomes visible.</summary>

  Columns: customer · product · file (+ size) · verified badge · date.

  ### Server-side pagination, unlike the Submissions page

  `app._index.jsx` loads every submission and pages in the browser. This table grows with **every
  product-page upload**, so it must not depend on the whole history fitting in one response.
  25 per page, `?page=` in the URL.

  ### Details worth noting

  - **`file_size` is a `bigint`**, which postgres.js returns as a **string**. `formatBytes()`
    coerces with `Number()` rather than assuming — an easy `NaN` otherwise.
  - **"Unverified identity" badge.** A row with a customer but `identity_source !== 'liquid_hmac'`
    should be *impossible* — A13 only records a customer when the signature verified. If it ever
    appears, it means something bypassed the identity check, so it is surfaced rather than hidden.
  - **Anonymous rows render as "Guest — uploaded while the gate was off"**, which is a legitimate
    state, not an error.
  - **Empty-state wording depends on `require_login`.** With the gate off it explains that history
    starts empty because earlier uploads were never stored anywhere and cannot be imported (plan
    §12 Q4).
  - **Load failure renders a banner, not an error boundary**, matching the Submissions page — the
    admin keeps working.

  **Verified:** empty state · 30 rows → 25 + 5 across two pages · newest first · other shop's rows
  excluded · `page=0`, `page=-5`, `page=abc` all fall back to 1 · page beyond the end returns empty
  without crashing · gate flag drives the empty-state wording · anonymous row shape.

  > **Not covered:** the rendered React table (`UploadsTable.jsx`), same limitation as A7 — Node
  > cannot load JSX, so the component was stripped and `authenticate` stubbed. The loader body is
  > byte-identical. Needs eyes in the embedded admin once A15 adds the nav link.
  </details>

### Phase A4 — Wiring & docs

- [x] **A15 — Nav links in `app/routes/app.jsx`** ⚠️ *the only edit to existing app code* — *done 2026-08-11*
  <details><summary>2 lines added, 0 removed. The complete diff is below.</summary>

  ```diff
           <Link to="/app" rel="home">
             Home
           </Link>
  +        <Link to="/app/logo-upload/uploads">Logo uploads</Link>
  +        <Link to="/app/logo-upload/settings">Upload settings</Link>
         </NavMenu>
  ```

  `git diff --numstat` → `2  0  app/routes/app.jsx`. **That is the entire change this feature makes
  to pre-existing application code.** Unavoidable: without it both new pages exist but nothing
  links to them.

  Labels: "Logo uploads" (the list, used more often) before "Upload settings" — deliberately *not*
  "Logo upload" / "Logo uploads", which read almost identically in a sidebar.

  ### `app.jsx` is now frozen too

  It was deliberately **kept out** of the baseline until now, because this task was always going to
  edit it. With the edit made and the file in its final intended state, its hash
  (`fa39f7be…`) was added to `docs/logo-upload/baseline.sha256`, so **any further edit to the admin
  shell now fails the guard**. Tamper-tested: appending one newline produced `BROKEN` and exit 1.
  </details>

- [x] **A16 — `.env.example`** ⚠️ *documentation only, zero runtime effect* — *done 2026-08-11*
  <details><summary>+84 lines, −0. Three variables documented; two deliberately deferred.</summary>

  | Variable | Required? | Notes |
  |---|---|---|
  | `LOGO_UPLOAD_SECRET` | Only when a gate is ON | **Must match `MO_LOGO_UPLOAD_SECRET` in the theme snippet.** Includes a one-line generator command |
  | `LOGO_UPLOAD_SECRET_PREVIOUS` | Only while rotating | Documents the 4-step zero-downtime rotation |
  | `STOREFRONT_ORIGIN` | No | Empty = `*`, exactly as `/api/upload` behaves today |

  Each entry follows the file's existing house style — what it does, where to get the value, what
  breaks without it, and the exact format.

  Three warnings carried into the file itself, so they are found by whoever sets the vars rather
  than only in this document:
  - Secret drift between app and theme fails **every** gated upload — the single most likely way to
    break the feature.
  - `STOREFRONT_ORIGIN` **must** include `*.myshopify.com` or the unpublished test theme's uploads
    fail, because a preview runs on the myshopify host, not the live domain.
  - CORS is **not** the security boundary; the HMAC is.

  ### Deliberately NOT added: `GMAIL_USER` / `GMAIL_APP_PASSWORD`

  Plan §5.2 lists them, but **no shipped code reads them** — they belong to A8's mailer, which is
  held with F2. Documenting variables that nothing reads would imply the OTP email path exists.
  They go in when A8 does.

  `.env.example` is intentionally **not** added to the frozen baseline: it is expected to change
  again when A8 ships.
  </details>

- [x] **A17 — Regression proof (plan §9-A)** — *done 2026-08-11, incl. a real live upload*
  <details><summary>Proven against the live store AND production. Test artefacts deleted.</summary>

  ### 1. `/api/upload` is byte-identical

  ```
  git diff main -- app/routes/api.upload.jsx   →   ZERO changes
  ```

  Everything this branch changes in pre-existing code, in full:

  | File | Diff |
  |---|---|
  | `app/routes/app.jsx` | **+2 −0** (nav links) |
  | `.env.example` | **+84 −0** (docs only) |
  | 3 migration files | new files |

  Nothing else. No other pre-existing file differs from `main`.

  ### 2. Real end-to-end upload against the live store ✅

  Ran both routes against `logo-mat-central.myshopify.com` with real credentials:

  | | old `/api/upload` | new `/api/logo-upload/upload` |
  |---|---|---|
  | PNG | real CDN URL | real CDN URL |
  | EPS | real `.eps` CDN URL | real `.eps` CDN URL |

  **The EPS fix survives through the shared lib** — the risk worth checking, since `.eps` must
  register as `contentType: FILE` rather than `IMAGE` or the URL returns null.

  Audit row verified: `customer_gid` taken **from the signature**, `identity_source: liquid_hmac`,
  email, product handle, file size, `shopify_file_id`, `email_verified: null`.

  **Cleanup:** 4/4 files deleted from Shopify Files via `fileDelete`, 2/2 audit rows deleted. The
  store is exactly as it was.

  ### 3. Identical response shape — from source, not assumed

  ```js
  old:  return json({ url: finalUrl, fileId }, ...)
  new:  return jsonWithCors({ url: result.url, fileId: result.fileId }, ...)
  ```

  ### 4. Production verified after deploy ✅

  ```
  GET  /api/logo-upload/settings  → 200, degraded:false, no secrets in payload
  OPTS /api/logo-upload/settings  → 204, Access-Control-Allow-Origin: *
  POST /api/upload                → 400 "No file uploaded"  (unchanged)
  ```

  ### One difference worth knowing (an improvement, not a regression)

  A **bodyless** `POST /api/upload` returns `500 "Could not parse content as FormData"`; the new
  route returns `400 no_file`. Plan §9-A predicted `400` from the old route — that is not what it
  actually does. Only affects malformed requests; with a valid empty multipart body both return 400.
  </details>

---

## 3. THEME-SIDE TASKS

Not started. Do **not** begin until the app tasks they depend on are marked done and §4 is filled in.

> ### ✅ End-to-end secret verification (2026-08-11)
>
> A signed upload was POSTed to **production** using the secret read straight out of
> `mo-logo-upload-config.liquid`. Result: `200`, and the recorded row had
> `identity_source: liquid_hmac` with the correct `customer_gid`.
>
> **The theme's secret matches Vercel's, and the full chain works in production:** Liquid signs →
> app verifies → customer recorded. Test files and rows deleted afterwards.
>
> #### ⚠️ Observed once, not reproduced — intermittent `500 upload_failed`
>
> The **first** call to the new endpoint returned `500 upload_failed`; the next three succeeded
> (6.7s / 4.5s / 3.5s, vs the old route's 3.2s).
>
> Most likely a cold-start timeout — the new route does everything the old one does **plus** a
> database read, and `shopify-files.server.js` contains a hardcoded `setTimeout(2000)`. Vercel
> Hobby functions default to a **10s** limit. Unproven; recorded so it is not mistaken for a new
> bug later.
>
> **If shoppers report intermittent "Upload failed" during testing, suspect this first.** Cheap
> mitigation: `export const config = { maxDuration: 30 }` in `api.logo-upload.upload.jsx`.

- [x] **T0 — Test theme setup** ✅ *done 2026-08-11* — theme id **190954144025**, unpublished,
  auto-syncing from `feature/upload-login-gate` (`bf7f7f3`).
  Preview: `https://logomatcentral.com/?_ab=0&_fd=0&_sc=1&preview_theme_id=190954144025`

  <details><summary>Preview theme verified by fetching real rendered HTML</summary>

  | Check | Result |
  |---|---|
  | 🔒 **Secret in page source** (plan §9-D2) | **0 occurrences** — only the digest renders |
  | `mo-logo-upload.js` / `.css` / modal / sign-in button | present, once each |
  | Endpoint switched | old `/api/upload` **0** · new `/api/logo-upload` **2** |
  | `customerGid` / `customerEmail` signed out | `""` / `""` as specified |
  | `secretConfigured` | `true` |
  | `save-shipping` calls | **2 — shipping + quote forms untouched** |

  ### ✅ Liquid's HMAC matches the app byte for byte

  ```
  payload : "v1|logo-mat-central.myshopify.com|default|default||"
  liquid  : adf3fa39f6ebcb2878b6b76336eaeece845d1da7
  node    : adf3fa39f6ebcb2878b6b76336eaeece845d1da7
  ```

  Proves the field order, delimiter, empty-string rule and shared secret all agree.

  ### ⚠️ Gotcha for anyone scripting checks

  `preview_theme_id` sets a **cookie**. A bare `curl` silently returns the **LIVE** theme, not the
  preview — the first run of this check produced a completely misleading "gate not rendered"
  result. Use a cookie jar: hit the preview URL once with `-c jar`, then request pages with
  `-b jar`.
  </details>

- [ ] ~~T0 — Test theme setup (plan §10.2)~~ — superseded by the entry above
  ⚠️ **Pushing to `main` in the theme repo auto-publishes to the LIVE theme** (the
  `Update from Shopify for theme logo-mat/main` commits are the GitHub integration's write-back).
  1. `git checkout -b feature/upload-login-gate` in `logo-mat`
  2. Push the branch — nothing deploys, no theme is attached to it yet
  3. Admin → Online Store → Themes → Add theme → **Connect from GitHub** → that branch
     → creates an **unpublished** theme that auto-syncs
  4. Note the theme ID from `?preview_theme_id=…`
  5. Never run `shopify theme push` without an explicit `--theme <id>`
  6. Stop any running `shopify theme dev` before editing — it has reverted on-disk edits before

- [x] **T1 — `assets/mo-logo-upload.css`** ✅ *done 2026-08-11* — scoped under `#mo-logo-upload`, theme tokens from
  plan §6 (navy `#132852`, amber `#FFC107`/`#efb815`, red `#ed252c`, 8px radius, **no
  `font-family`** so it inherits). Cannot leak into the theme or the quote modal.

- [x] **T2 — `snippets/mo-logo-upload-config.liquid`** ✅ *done 2026-08-11 — Q5/Q7 resolved*
  Rendered **inside each section** (the only scope where `section.settings` exists — plan §4.3.5).
  Takes `login_override` / `verification_override`, computes the HMAC, emits per-widget `data-*`.
  **The only file that holds the secret.** Per-widget data attributes also fix
  `product-test.liquid`, which has two `#fileInput` on one page.

- [x] **T3 — `snippets/mo-logo-upload.liquid`** ✅ *done 2026-08-11*
  Modal markup, rendered once from the layout. Rendered **outside** the product `<form>` with
  unnamed inputs so it can never post as a line-item property. Focus trap, `Esc`, `aria-modal`,
  `aria-live`.

  > **Simplified by the Q2 answer: ONE button, not two.** With new customer accounts,
  > `routes.account_login_url` and `routes.account_register_url` resolve to the *same*
  > `shopify.com/<id>/account` URL, and signing in with an unknown email creates the account. A
  > separate "Create account" button would be a second button to the identical destination.
  >
  > The verification half of the modal is **not built** while F2 is held.

- [x] **T4 — `assets/mo-logo-upload.js`** ✅ *done 2026-08-11* — all gate logic: settings fetch + `sessionStorage`
  cache, transparent overlay (not a bare `click` handler — keyboard activation can race it),
  modal state machine, OTP flow, `ensureAllowed()` promise, `mo_upload_intent` post-login banner.
  Must no-op in `request.design_mode` so it never blocks a merchant in the theme editor.

- [x] **T5 — `snippets/mo-logo-upload-image-js.liquid`** ✅ *done 2026-08-11*
  Copy of `mo-upload-image-js.liquid` **(which stays untouched)** plus: `querySelectorAll('#fileInput')`
  loop for the duplicate-ID page (**see the hard rule in §0.4**), `await ensureAllowed()` before
  `xhr.send()`, `UPLOAD_ENDPOINT` → `https://custom-email-pearl.vercel.app/api/logo-upload/upload`,
  the extra `FormData` fields from §4, and 401/403 → friendly messages.
  Must be defensive: if `window.MoUploadGate` is missing, fall through to today's behaviour
  rather than throwing.

- [x] **T6 — `layout/theme.liquid`** ✅ *done 2026-08-11 (+24 −1)* ⚠️ *touches an existing file* — one `if/else` inside the
  existing `image_upload` condition (~line 538) choosing the new snippet or the old one. The old
  `{% render 'mo-upload-image-js' %}` line stays in the file as the else branch.

- [x] **T7 — product section files** ✅ *done 2026-08-12 — **13** files, not 15*
  <details><summary>Scope shrank twice, and two files had to be excluded to avoid breaking another app</summary>

  **Scope as built** — one setting per section, not three:

  ```json
  { "type": "header",   "content": "Logo upload" },
  { "type": "checkbox", "id": "enable_image_upload",
    "label": "Show the logo upload field", "default": true }
  ```

  Wrapper becomes:

  ```liquid
  {% if product.metafields.custom.image_upload == true
        and section.settings.enable_image_upload %}
  ```

  Both override dropdowns are **dropped**: `upload_require_verification` because F2 is declined,
  `upload_require_login` because the app Settings page already provides a global switch that is
  built and tested. The signing snippet still accepts override params, so they can be added later
  without touching the JS.

  ### 🔴 Two files EXCLUDED — this would have broken a different app

  `main-line-product.liquid` and `main-line-product-badge-display.liquid` were in the plan's list
  of 15. They must **not** be edited:

  | | |
  |---|---|
  | Their `#fileInput` widget | sits inside a `{% comment %}` block (lines 1713–1746 / 1760–…) and **never renders** |
  | Their *active* `image_upload` condition | wraps **uploader #4** — `#fileInput1`/`#fileInput2`, which post to `/apps/file-upload`, an **App Proxy belonging to a different app** |

  A bulk find-and-replace across all 15 would have attached our section setting to someone else's
  uploader, letting a merchant silently disable it. Caught by checking which condition wrapped
  which input rather than trusting the plan's file list.

  ### Notes

  - `product-test.liquid` has **two** widgets under **one** condition (1285→1353), so a single
    change covers both.
  - **Defaults to `true`**, and Shopify returns the schema default for section instances saved
    before the setting existed — so adding it changes nothing on any existing template.
  - **ANDed** with the existing `custom.image_upload` metafield, which is untouched: metafield =
    per product, checkbox = per template.

  **Verified:** `+156 −13` across 13 files · schema JSON re-parsed and valid in all 13 (3 settings
  each) · the two excluded files show **zero** diff · guard markers unchanged —
  `fileInput_exact = 16`, `app_proxy_file_upload = 2`.

- [ ] ~~T7 — ~15 product section files~~ *(superseded by the entry above)*
  Two mechanical edits each: 4 settings added to `{% schema %}`, and
  `{% if product.metafields.custom.image_upload == true %}` → `… and section.settings.enable_image_upload`
  plus one `{% render 'mo-logo-upload-config' … %}` line.
  Defaults (`enable_image_upload: true`, overrides `default`) mean **adding these changes nothing**
  until someone edits a template.

  **Verified 2026-08-08** — these are the exact `id="fileInput"` line numbers on disk (the plan
  document's numbers were stale by 5–75 lines; use these):

  | Section file | `id="fileInput"` at | Notes |
  |---|---|---|
  | `sections/main-product.liquid` | 1705 | |
  | `sections/main-product-pro.liquid` | 1594 | |
  | `sections/main-product-pro-new.liquid` | 1597 | |
  | `sections/main-product-checklist.liquid` | 1696 | |
  | `sections/main-product-default-free-quote.liquid` | 1725 | |
  | `sections/main-line-product.liquid` | 1725 | ⚠️ also has uploader #4 at 1832/1862 — do not touch |
  | `sections/main-line-product-badge-display.liquid` | 1772 | ⚠️ also has uploader #4 at 1922/1952 — do not touch |
  | `sections/custom-products-main.liquid` | 1988 | |
  | `sections/custom-products-main-free-quote.liquid` | 2098 | |
  | `sections/product-arearug.liquid` | 2020 | |
  | `sections/product-frontline.liquid` | 2044 | |
  | `sections/product-maintenancepro.liquid` | 2059 | |
  | `sections/product-spectrum.liquid` | 2047 | |
  | `sections/product-supervinyl.liquid` | 2023 | |
  | `sections/product-test.liquid` | 1297 **and** 1331 | two widgets — the only such file |

  **16 inputs across 15 files.** Confirmed with `grep -c 'id="fileInput"'` = 16.

  Not touched (no `#fileInput`): `main-product-monogram`, `main-product-personalized`,
  `main-product-residential`, `main-product-no-price`, `product-request-quote`.
  These **do** render `custom-logo-form.liquid` (uploader #2) — that is out of scope and stays as is.

- [ ] **T8 — Theme verification** — plan §9-D3: precedence matrix (3 override values × 2 app
  settings, per feature), `enable_image_upload` unchecked → widget gone but add-to-cart intact,
  settings appear for the 15 and **not** for the other 5, an untouched template behaves exactly
  as before, theme editor not blocked.

---

## 4. App ↔ theme contract

**Filled in as the app tasks complete.** The theme agent codes against this section, not against
the app source. Empty until A10/A13 land.

### 4.1 Endpoints
_TBD — A10, A11, A12, A13_

### 4.2 HMAC payload — **FINAL (A4)**

Source of truth: `app/features/logo-upload/server/customer-identity.server.js` → `buildPayload()`.

```
v1|<shop>|<login_override>|<verification_override>|<customer_gid>|<email>
```

HMAC-SHA256, hex, signed with `LOGO_UPLOAD_SECRET`. **Six fields, `|`-joined, in this exact order.**

| Field | Value | Notes |
|---|---|---|
| `v1` | literal | Format version |
| `shop` | `{{ shop.permanent_domain }}` | |
| `login_override` | `default` \| `on` \| `off` | Section setting |
| `verification_override` | `default` \| `on` \| `off` | Section setting |
| `customer_gid` | `gid://shopify/Customer/{{ customer.id }}` | **Empty string when logged out** |
| `email` | `{{ customer.email }}` | **Empty string when logged out.** Sign the ORIGINAL casing |

#### Liquid (goes in `mo-logo-upload-config.liquid`, T2)

```liquid
{%- assign gid = '' -%}
{%- assign mail = '' -%}
{%- if customer -%}
  {%- assign gid = 'gid://shopify/Customer/' | append: customer.id -%}
  {%- assign mail = customer.email -%}
{%- endif -%}
{%- assign payload = 'v1|' | append: shop.permanent_domain
      | append: '|' | append: login_override
      | append: '|' | append: verification_override
      | append: '|' | append: gid
      | append: '|' | append: mail -%}
{%- assign sig = payload | hmac_sha256: MO_LOGO_UPLOAD_SECRET -%}
```

#### Rules the theme must follow

1. **When logged out, send empty strings** — not `nil`, not the literal `gid://shopify/Customer/`.
   A signed empty identity is *trusted* (it proves the theme rendered it) but yields
   `customerGid: null`, which is exactly what makes `login_required` fire.
2. **Sign `customer.email` exactly as Liquid emits it.** The app lowercases only *after* the HMAC
   verifies — normalising in the theme would break every signature.
3. **Never let a field contain `|`.** The app returns `malformed` and discards the identity.
   Deliberate protection against delimiter injection shifting the fields.
4. The digest is compared case-insensitively, so `hmac_sha256`'s output casing does not matter.

#### Why each field is signed

| Field | Omitting it would allow |
|---|---|
| `shop` | A signature minted on store A to verify on store B — the secret is per-**app**, not per-shop |
| overrides | `curl` with `login_override=off` to switch the gate off entirely |
| gid **+** email together | Pairing customer A's id with customer B's email |

#### Failure behaviour (fail-restrictive)

Whenever the signature does not verify, the app discards the identity **and** forces both
overrides to `default`, so a forged `login_override=off` achieves nothing — the app-level setting
applies. Reasons: `no_secret`, `no_signature`, `bad_signature`, `malformed`.

#### Secret rotation

The app accepts `LOGO_UPLOAD_SECRET` **and** `LOGO_UPLOAD_SECRET_PREVIOUS`, so theme and app can be
updated in either order with no downtime. Set the old value as `_PREVIOUS`, deploy, update the
theme, then drop it. Verified: with `_PREVIOUS` set an old signature still passes; without it, the
same signature fails.

### 4.3 Upload FormData fields — **FINAL (A13)**

`POST /api/logo-upload/upload`, `multipart/form-data`.

| Field | Required | Value | Notes |
|---|---|---|---|
| `file` | **yes** | the File | Missing → `400 no_file`, same message as today |
| `shop` | yes | `{{ shop.permanent_domain }}` | **Must match the signed value.** See the security note below |
| `login_override` | yes | `default` \| `on` \| `off` | Section setting |
| `verification_override` | yes | `default` \| `on` \| `off` | Section setting |
| `customer_gid` | yes | `gid://shopify/Customer/…` | **Empty string when logged out** |
| `customer_email` | yes | `{{ customer.email }}` | **Empty string when logged out.** Original casing |
| `customer_sig` | yes | hex HMAC | Over the §4.2 payload |
| `product_id` | no | `{{ product.id }}` | Recorded only |
| `product_handle` | no | `{{ product.handle }}` | Recorded only |
| `product_url` | no | full URL | Recorded only |
| `verification_token` | — | — | **F2, not implemented yet** (held pending Q1) |

**Success response is unchanged from `/api/upload`:**

```json
{ "url": "https://cdn.shopify.com/…/logo.eps", "fileId": "gid://shopify/GenericFile/123" }
```

So the theme's existing `if (res && res.url)` keeps working with no change.

> #### ⚠️ `shop` is NOT trusted for settings
>
> The server looks settings up by `SHOPIFY_SHOP` (the store files are actually uploaded to), **not**
> by the submitted `shop`. The submitted value is used **only** for HMAC verification, because the
> theme signed what it sent — so a mismatched `shop` fails the signature and is rejected.
>
> Sending a different `shop` cannot switch the gate off. See A13 for the vulnerability this closed.

#### Order of checks (all before the file reaches Shopify)

```
1. no file                    -> 400 no_file
2. settings degraded + closed -> 500 server_error
3. gate on + no secret        -> 401 gate_secret_unconfigured
4. require_login + no trusted customer
      bad/malformed signature -> 401 invalid_signature
      nothing supplied        -> 401 login_required
5. require_verification + not verified -> 403 email_verification_required
6. upload to Shopify Files (existing lib, unmodified)
7. record the row (never throws)
8. 200 { url, fileId }
```

Nothing is uploaded on a rejected request — no orphaned files, no wasted storage.

### 4.4 Error codes — **FINAL (A2)**

Source of truth: `app/features/logo-upload/config/errors.js`. Every error response is:

```json
{ "error": "login_required", "code": "login_required",
  "message": "Please sign in to upload your logo.",
  "retryable": false, "reopenModal": true }
```

> **The theme must switch on `code`, never on the HTTP status or the message text.** Several codes
> share a status, and messages are merchant-editable. `error` duplicates `code` so the response
> stays compatible with the existing theme's `{ error: "..." }` handling.

| `code` | HTTP | retryable | reopenModal | Fires when |
|---|---|---|---|---|
| `no_file` | 400 | ✅ | — | No file in the request. **Message kept byte-identical to today's `/api/upload`** |
| `code_invalid` | 400 | ✅ | ✅ | Wrong / already-used / non-existent code. Deliberately does not say which |
| `code_expired` | 400 | ✅ | ✅ | Past `expires_at` |
| `too_many_attempts` | 400 | ❌ | ✅ | Attempt cap hit, code burned. **Not retryable — a new code is required** |
| `login_required` | 401 | ❌ | ✅ | Gate on, no trustworthy identity |
| `invalid_signature` | 401 | ❌ | ✅ | Identity supplied but HMAC failed — forgery, or a stale page after logout |
| `gate_secret_unconfigured` | 401 | ❌ | ❌ | **Operational, not a shopper problem.** `LOGO_UPLOAD_SECRET` unset or app/theme drift |
| `email_verification_required` | 403 | ❌ | ✅ | F2 on, contact not verified |

> **Note (2026-08-12):** the theme no longer opens the modal for
> `email_verification_required`. F2 is declined, so its endpoints do not exist and a shopper has no
> way to verify — a "Sign in" modal would be a dead end. The server message is shown in the status
> line instead. The code itself still exists server-side.
>
> ⚠️ **`verification_override` must still be SENT with every upload.** It is one of the six fields
> in the signed payload (§4.2). It looks like dead code now that F2 is gone, but removing it from
> the FormData changes what the server hashes and every signature fails with 401.
| `email_mismatch` | 403 | ❌ | ✅ | Signed-in customer tried to verify someone else's address |
| `rate_limited` | 429 | ✅ | ✅ | Per-email or per-IP limit hit |
| `upload_failed` | 500 | ✅ | ❌ | File never reached Shopify Files. Nothing recorded |
| `email_send_failed` | 500 | ✅ | ✅ | Could not send the code. **The upload is NOT silently allowed** |
| `server_error` | 500 | ✅ | ❌ | Catch-all |

**Why `gate_secret_unconfigured` is separate from `invalid_signature`:** with a shared secret,
app/theme drift is the single most likely failure mode (plan §8). Both look identical to a
shopper, but this one must be visible in logs as a **misconfiguration** rather than buried in a
pile of generic 401s.

**Public settings shape** (what `GET /api/logo-upload/settings` returns) — camelCase, whitelisted:

```json
{ "requireLogin": false, "requireEmailVerification": false, "codeExpiryMinutes": 10,
  "maxUploadMb": 4,
  "copy": { "login_heading": "…", "login_body": "…", "login_sign_in": "…",
            "login_create_account": "…", "login_close": "…",
            "verify_heading": "…", "verify_body": "…", "verify_send": "…",
            "verify_confirm": "…", "verify_resend": "…" } }
```

Server-only, never sent: `fail_mode`, `max_code_attempts`, `verification_validity_days`,
`verification_token_minutes`, `rate_limit_email_per_15min`, `rate_limit_ip_per_hour`.

---

## 5. Existing files this work touches (the full list)

Kept deliberately short. Anything added here needs a reason.

| Repo | File | Change | Why unavoidable |
|---|---|---|---|
| App | `app/routes/app.jsx` | **+2 lines, −0** (A15) ✅ done — now frozen in the baseline | New admin pages are otherwise unreachable |
| App | `.env.example` | **+84 lines, −0** (A16) ✅ done | Docs only, no runtime effect |
| App | `app/routes/app._index.jsx` | **+22 lines, −8** (A17) ✅ done — baseline re-captured | The delete button has to render on the page that lists submissions, and Remix takes the `action` from the route module. See §5.4 |
| Theme | `layout/theme.liquid` | one `if/else` (T6) | Only place that can choose old vs new snippet |
| Theme | `sections/*.liquid` ×15 | schema + one `if` + one render (T7) | A section setting can only be declared in its own `{% schema %}` (plan §4.3.5) |
| Theme | `sections/*.liquid` ×13 | **+8 −0 each — `toggleButton()` on load.** Separate commit, NOT part of the gate | Pre-existing bug the gate makes reproducible — see below |

### 5.1 Pre-existing bug fixed alongside (2026-08-11) — colour gating

**Not caused by this feature**, but the gate makes it reproducible, so it was fixed to deliver a
working flow.

13 sections disable Add to Cart on load and re-enable it via `toggleButton()`, which is bound
**only** to `change` and never called on load:

```js
addToCartBtn.disabled = true;                            // on DOMContentLoaded
colorSelect.addEventListener("change", toggleButton);    // ← never invoked on load
```

The colour `<select>` defaults to `<option value="">`, so a **fresh** page load works: pick a
colour → `change` → enabled. It breaks when the select already holds a value with no `change`
event — which is exactly what a browser does when it **restores the form after a sign-in round
trip**, a back navigation or a refresh. The gate sends shoppers to sign in and back, so it turns a
rare edge case into the normal path.

Verified **byte-identical on the live theme**, so it is live today independent of this work.

**Fix:** call `toggleButton();` once after binding, in all 13 files. Safe — it still honours the
`aria-disabled` guard from commit `6616c6f`, so it cannot override the variant resolver or an
in-flight submit.

Guard re-run after the change: `fileInput_exact = 16`, `app_proxy_file_upload = 2` and all other
markers unchanged, so the other uploaders inside those same files are untouched.

### 5.3 Platform limit — 4.5 MB request body (pre-existing, mitigated not solved)

**Vercel serverless functions reject any request body over ~4.5 MB at the edge.** This is a hard
platform limit and **cannot be raised** in settings, env vars or code.

#### It is NOT a regression — measured 2026-08-12

| File size | new `/api/logo-upload/upload` | old `/api/upload` |
|---|---|---|
| 3 MB | 401 *(gate on, unsigned — correct)* | **200** ✅ |
| 5 MB | **413** `FUNCTION_PAYLOAD_TOO_LARGE` | **413** — identical |

The live endpoint has always had this ceiling, so customers with large EPS artwork have been
hitting it silently. **It also affects the shipping and quote forms**, which post attachments
through the same platform — not specific to logo uploads.

#### Why it looked like a CORS bug

Vercel rejects the body **before any application code runs**, so the 413 carries **no CORS
headers**. The browser cannot read the response and reports it as:

```
Access to XMLHttpRequest ... has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present
```

CORS was never the problem. Anyone debugging a similar report should check the **status code**
(visible in the Network tab) before touching CORS configuration.

#### What was done (mitigation)

| Where | Change |
|---|---|
| `config/defaults.js` | `max_upload_mb: 4`, marked **public** so theme and app cannot drift |
| `assets/mo-logo-upload.js` | `checkSize()` — reads the served limit, falls back to 4 MB |
| `snippets/mo-logo-upload-image-js.liquid` | Calls it **before** sending; nothing is uploaded |
| Settings page | Warning banner: the limit exists and cannot be raised from there |

The shopper now sees *"That file is 6.2 MB. The maximum is 4 MB — please compress it…"* instead of
a bare "Upload failed". An unrecognised `file.size` **fails open** and lets the server decide.

4 MB rather than 4.5 leaves headroom for multipart overhead and the identity fields sent alongside.

#### The real fix, if large files matter — NOT built

**Direct-to-Shopify staged upload.** `stagedUploadsCreate` already returns a URL the *browser* can
POST to directly; the app would only mint the target and register the result afterwards. The file
never passes through Vercel, so the limit disappears entirely.

Cost: a meaningful change to the upload flow on both sides — the app gains a "create staged target"
endpoint, and the theme JS does a two-step upload. Deliberately **out of scope** here; raise it as
its own task if oversized artwork turns out to be common.

Worth noting it would fix the shipping and quote forms too, since they share
`shopify-files.server.js`.

### 5.2 Pre-existing, NOT fixed — `$ is not defined`

`layout/theme.liquid` loads jQuery with `defer`, while an inline `setTimeout` slick-slider init
uses `$` on the next tick and can beat it. Byte-identical on the live theme; my code uses jQuery
**zero** times. Left alone — unrelated to this feature, and fixing it means reordering script
loading on a live page.

**Explicitly NOT touched:**

*App* — `app/routes/api.upload.jsx`, `app/routes/api.save-shipping.jsx`,
`app/routes/api.save-shipping-info.jsx`, `app/routes/api.eps.*.jsx`,
`app/lib/shopify-files.server.js`, `app/lib/supabase.server.js`, all 4 existing migrations.

*Theme* — `snippets/mo-upload-image-js.liquid`, `snippets/quote-request-form-js.liquid`,
`snippets/quote-request.liquid`, `snippets/custom-logo-form.liquid`, `snippets/quote-form.liquid`,
the inline `setupUpload()` blocks in `main-line-product*.liquid`, and
`layout/theme.liquid:548` (the unconditional `quote-request-form-js` render).

Per §0.4 this means **uploaders #2, #3 and #4 are untouched end to end** — the shipping form, the
quote-request form and the App-Proxy `Upload 1`/`Upload 2` inputs keep working exactly as today,
with no login and no verification, on both the live and the test theme.

### 5.4 Admin row delete (A17, 2026-08-25) — why `app._index.jsx` had to move

Admin-only tooling for clearing test data: a delete button on both listing pages that removes the
database row **and** the file it put in Shopify Files. Nothing on the storefront changes, and no
write path a shopper touches is involved.

`app/routes/app._index.jsx` is the **only** frozen file that changed. It is unavoidable: the button
has to render in the table that lists submissions, and Remix reads `action` from the route module,
so neither half can live anywhere else. Its share is kept to an import, one `export const action =`,
and wrapping the existing View button in an `InlineStack` — all the logic sits in
`app/features/logo-upload/server/delete-actions.server.js`.

**Deliberately NOT changed, and the consequence:**

`app/routes/api.save-shipping.jsx` receives a `fileId` from `uploadToShopifyFiles()` and discards
it, so `form_submissions` has a `media_url` but no file id. Persisting it would mean editing the
live quote-request endpoint plus `insertFormSubmission` in the frozen `app/lib/supabase.server.js`
— a storefront write path in the diff of a test-data cleanup feature. Not worth it.

Instead the file id is resolved at delete time from the stored URL, and **only when exactly one
Shopify file's URL path matches**. File names are not unique (Shopify renames a second `logo.eps`
to `logo_1.eps`), so a looser match could delete a real customer's artwork. Zero or multiple
matches means the row is deleted and the file is left alone, and the UI says so.
`logo_upload_customer_files` has no such problem — it stores `shopify_file_id` at upload time, so
**no migration was needed for this work**.

Three other guards, all failing towards keeping data:

* **Shared files** — before deleting, both tables are checked for another row pointing at the same
  file. If the check itself errors it reports "shared", so the file survives.
* **Order** — file first, then row. The reverse loses the id and URL on a partial failure, leaving
  an orphan nothing can ever find; this way a failed row delete is just a retry.
* **Shop scoping** — every delete is `where id = $1 and shop = $2`, in the statement rather than a
  check beforehand, so there is no window between the two and no cross-store delete.

Deletes are hard, not soft: the feature exists to clear test data, and a tombstone column would
mean every read path in the feature starts filtering.

**Known limit — CDN caching.** `fileDelete` removes the file at origin, but Shopify serves Files
with a long `max-age` and exposes no CDN purge API. A deleted file's URL can therefore keep
serving from cached Cloudflare edges for a while (verified 2026-08-25: origin returned 404 while a
different edge still served the image). Fine for clearing test data; **not** sufficient if artwork
ever has to be provably unreachable immediately, e.g. for a privacy request.

---

## 6. Rollback

At every stage, in increasing order of scope:

1. **Toggle** — flip the setting OFF in the app Settings page. Instant, no deploy.
2. **Theme** — set the `theme.liquid` `if` to the old branch. The old snippet and old endpoint
   are still there, unmodified.
3. **Endpoint** — point `UPLOAD_ENDPOINT` back to `/api/upload`. The original route was never
   changed, so this is a guaranteed-good path. Available for the full 30-day soak after go-live
   (§0.5).
4. **Branch** — `git reset --hard main-backup-08-08-2026` in the app repo.
