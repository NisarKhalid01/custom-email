# Logo Upload — Runbook

Operational commands and procedures. Keep this open while working on the feature.

Delivery status → [TASKS.md](TASKS.md) · Database → [SCHEMA.md](SCHEMA.md) · Code →
`app/features/logo-upload/`

---

## 1. Generate the signing secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Prints a 64-character hex string. `openssl rand -hex 32` does the same.

**Nobody issues this value — you invent it.** It is not a Shopify or Vercel credential. Its only
job is to be byte-identical in two places:

| Where | Variable |
|---|---|
| Vercel → Settings → Environment Variables → **Production** | `LOGO_UPLOAD_SECRET` |
| `logo-mat/snippets/mo-logo-upload-config.liquid` (theme, T2) | `MO_LOGO_UPLOAD_SECRET` |

Also add it to local `.env` for local testing.

> ⚠️ Store it in a password manager. If it only exists in Vercel and the theme, rotating or
> debugging later means reading it back out of production.
>
> ⚠️ It lives in the theme's source, so **`Inventel-LLC/logo-mat` must be private** (plan Q7).

---

## 2. Rotate the secret (zero downtime)

The app accepts signatures from **either** secret, so app and theme can be updated in any order.

```
1. Vercel: LOGO_UPLOAD_SECRET_PREVIOUS = <current secret>     → redeploy
2. Vercel: LOGO_UPLOAD_SECRET          = <new secret>         → redeploy
3. Theme:  MO_LOGO_UPLOAD_SECRET       = <new secret>         → push
4. Vercel: clear LOGO_UPLOAD_SECRET_PREVIOUS                  → redeploy
```

**Skipping step 1 breaks every Shopify-cached page** that still carries an old signature, until the
theme catches up.

---

## 3. Health checks

```bash
# Is the feature live in production?
curl "https://custom-email-pearl.vercel.app/api/logo-upload/settings?shop=logo-mat-central.myshopify.com"
```

Expect `200` and `"degraded":false`.

| Response | Meaning |
|---|---|
| `200`, `degraded:false` | Healthy — settings read from Supabase |
| `200`, `degraded:true` | **Database unreachable.** Serving fallbacks; features read as OFF |
| `404` | The new code is not deployed |

```bash
# The OLD endpoint must keep working — it is the rollback
curl -X POST https://custom-email-pearl.vercel.app/api/upload -F "x=1"
# expect: 400 {"error":"No file uploaded"}

# CORS preflight
curl -I -X OPTIONS "https://custom-email-pearl.vercel.app/api/logo-upload/settings?shop=logo-mat-central.myshopify.com"
```

---

## 4. Prove no live code was touched

```bash
bash scripts/check-no-break.sh              # frozen files + markers + build
SKIP_BUILD=1 bash scripts/check-no-break.sh # fast
THEME_DIR=/path/to/logo-mat bash scripts/check-no-break.sh
```

Exit 0 = safe. **Run before every commit.** If it fails legitimately because scope changed, add the
file to TASKS.md §5 and re-capture the baseline in the *same* commit so the diff is visible.

```bash
# The single most important regression check
git diff main -- app/routes/api.upload.jsx     # must be EMPTY
```

---

## 5. Turn the feature on / off

**On:** embedded admin → **Upload settings** → tick *Require customer login* → Save.
**Off:** untick and Save. Takes effect on the storefront within ~60s (the settings cache TTL).

Direct database access, if the admin is unavailable:

```sql
-- current settings
select * from logo_upload_app_settings where shop = 'logo-mat-central.myshopify.com';

-- emergency: turn everything off
update logo_upload_app_settings
   set settings = settings || '{"require_login":false,"require_email_verification":false}'::jsonb,
       updated_at = now()
 where shop = 'logo-mat-central.myshopify.com';
```

The change reaches shoppers within ~60s. It does **not** require a deploy.

---

## 6. Rollback, in increasing order of scope

| # | Action | Speed |
|---|---|---|
| 1 | Untick the toggle in the admin | instant, no deploy |
| 2 | Theme: point the `theme.liquid` `if` back to the old snippet | one line |
| 3 | Theme: `UPLOAD_ENDPOINT` back to `/api/upload` | one line — the old route is untouched and still deployed |
| 4 | `git reset --hard main-backup-08-08-2026` | full |

Rollback 3 stays available for the whole 30-day soak after go-live (TASKS.md §0.5).

---

## 7. Error codes → what actually went wrong

Full table in [TASKS.md §4.4](TASKS.md). The ones that mean *you* have a problem, not the shopper:

| Code | Real cause | Fix |
|---|---|---|
| `gate_secret_unconfigured` | `LOGO_UPLOAD_SECRET` unset in Vercel, **or** app and theme secrets differ | §1 / §2 above |
| `invalid_signature` on **every** request | Secret drift, or the theme is signing a different payload | Compare against TASKS.md §4.2 field-by-field |
| `invalid_signature` on **some** requests | Normal — usually a shopper whose session ended on a cached page | None |
| `login_required` when the shopper **is** signed in | The theme sent no signature — check `mo-logo-upload-config.liquid` renders inside the section | T2 |
| `degraded:true` in settings | Database unreachable | Check Supabase + Vercel `DATABASE_URL` |
| **413 / "blocked by CORS policy"** on upload | **File over ~4.5 MB.** Vercel rejects it at the edge with no CORS headers, so the browser misreports it as CORS. **Not a CORS problem** | Check the status code first. See TASKS.md §5.3 |

Grep production logs for `[logo-upload]`. Two lines matter most:

```
[logo-upload] AUDIT WRITE FAILED   ← the upload SUCCEEDED but was not recorded
[logo-upload] LOGO_UPLOAD_SECRET is not set, but a gate is enabled
```

---

## 8. Database

Full map in [SCHEMA.md](SCHEMA.md). Four tables, all prefixed `logo_upload_`.

```sql
-- who uploaded what, newest first
select created_at, customer_email, customer_gid, product_handle, file_name, file_url
  from logo_upload_customer_files
 where shop = 'logo-mat-central.myshopify.com'
 order by created_at desc limit 50;

-- everything one customer ever uploaded
select * from logo_upload_customer_files
 where shop = 'logo-mat-central.myshopify.com'
   and customer_gid = 'gid://shopify/Customer/123';

-- force a customer to re-verify (F2)
update logo_upload_customers
   set verified = false, verified_at = null, updated_at = now()
 where shop = 'logo-mat-central.myshopify.com'
   and customer_gid = 'gid://shopify/Customer/123';
```

### ⚠️ Do NOT run `supabase db push`

The project has no `supabase/config.toml` and is not linked, so the remote migration ledger does
not reflect reality. `db push` would try to re-run **all** migrations — including
`20260718000000_add_shop_to_form_submissions.sql`, which contains an `UPDATE` against live
`form_submissions` data.

To apply a new migration: paste it into the **Supabase SQL editor** (how every migration here has
been applied), or run just that file over `DIRECT_URL` — not the pooled `DATABASE_URL`, which is
transaction-mode and unreliable for DDL.

---

## 9. Teardown — removing the feature entirely

```bash
rm -rf app/features/logo-upload
rm app/routes/api.logo-upload.*.jsx app/routes/app.logo-upload.*.jsx
# revert the 2 NavMenu lines in app/routes/app.jsx
```

```sql
drop table if exists logo_upload_customer_files;
drop table if exists logo_upload_email_verifications;
drop table if exists logo_upload_customers;
drop table if exists logo_upload_app_settings;
```

Theme: delete `snippets/mo-logo-upload-*`, `assets/mo-logo-upload.*`, and revert the `theme.liquid`
`if/else` plus the section `{% schema %}` additions.

Nothing else in the app depends on any of it.
