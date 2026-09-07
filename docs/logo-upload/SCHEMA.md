# Logo Upload — Schema Map

Visual reference for the 3 migrations written in **A1**. See [TASKS.md](TASKS.md) for delivery
status. **Nothing here is applied yet.**

Revised 2026-08-08 after review:
1. Customer GID is the primary identity (was email).
2. Namespace is `logo_upload_` (was `upload_gate_`) — domain, not mechanism.
3. Tables holding customer detail carry `customer`/`customers` in the name.
4. `logo_upload_customers` (was `..._verified_customers`) now carries an explicit
   `verified` boolean instead of encoding the state in the table name.

---

## 1. The four tables at a glance

| Table | Purpose | Row lifetime | Written by | Read by |
|---|---|---|---|---|
| `logo_upload_app_settings` | Feature flags + modal copy, per store | Forever (1 row/shop) | Settings page (A7) | Every gated request (A10, A13) |
| `logo_upload_email_verifications` | One row per 6-digit code issued | **Minutes** (10 min TTL) | verify-request (A11) | verify-confirm (A12), rate limiter |
| `logo_upload_customers` | One row per customer + verification state | **Permanent** (verification expires, row does not) | verify-confirm (A12) | Upload (A13) |
| `logo_upload_customer_files` | The audit record — who uploaded what | Forever | Upload (A13), **after success only** | Uploads page (A14) |

`app_settings` is the only table with no customer data, hence no `customer` in its name.

---

## 2. Identity model — GID first, email fallback

**The canonical identity is the Shopify customer GID, not the email.**

```liquid
gid://shopify/Customer/{{ customer.id }}
```

| | GID | Email |
|---|---|---|
| Stable? | **Permanent** for the life of the customer record | **Mutable** — changeable in the account |
| Role | Primary key for lookups | Fallback key, and a display copy |
| When null | Visitor is logged out | Practically never |

Why this matters: when the gate is ON, login is mandatory (plan §4.1) and the email is *forced*
to the HMAC-signed `customer.email` (plan §4.2) — so the email is **derived from** the customer,
not independent of them. Keying on email would mean a customer who changes their address is
treated as a stranger and must re-verify.

Email survives as a fallback for exactly one combination: `require_login = false` **and**
`require_email_verification = true` — a logged-out visitor who must still verify.

---

## 3. Constraints — what can and cannot reject a write

> **There are no foreign keys in any of the four tables.** `customer_gid` points at a *Shopify*
> customer, not a row in this database, so there is nothing to reference. Every customer column is
> also **nullable**. A missing, unknown or deleted customer stores `null` — an upload is never
> lost because the identity was imperfect.

Tables are joined logically on `customer_gid`, and on `email` only as a fallback.

**Two constraints can reject a write**, both on `logo_upload_customers`, both only reachable via a
code bug:

| Constraint | Fires when | Why it's worth the risk |
|---|---|---|
| `…_identity_present` | `customer_gid` **and** `email` are both null | You cannot verify *nothing*. Silently storing an identity-less row would be worse than failing loudly |
| `…_verified_consistent` | `verified=true` with no `verified_at`, or `verified=false` **with** one | Stops a revoked customer keeping a stale timestamp, which would let a query that (wrongly) checked only `verified_at` pass them through |

**Nothing in `logo_upload_customer_files` can reject an insert.** That is deliberate — it is the
table on the live upload path, and an upload must never be lost to a constraint.

---

## 4. `logo_upload_app_settings` — the toggles

| Column | Type | Null | Default | Holds |
|---|---|---|---|---|
| `shop` | `text` | **PK** | — | `logo-mat-central.myshopify.com` |
| `settings` | `jsonb` | no | `'{}'` | All flags + copy (below) |
| `updated_at` | `timestamptz` | no | `now()` | Last save |

**Why jsonb, not columns:** these are feature flags and merchant-editable copy that will churn. A
column per setting means a migration every time the client rewords a modal heading. Nothing here
is ever queried *by value* or joined on — it is always read whole, by `shop`.

**A missing row is valid and means "everything off".** Defaults live in code
(`app/features/logo-upload/config/defaults.js`, A2), so the store works perfectly with this table
empty.

| Key | Default | Effect |
|---|---|---|
| `require_login` | `false` | F1 master switch |
| `require_email_verification` | `false` | F2 master switch |
| `verification_validity_days` | `30` | `0` = verify every upload |
| `code_expiry_minutes` | `10` | OTP TTL |
| `fail_mode` | `"open"` | Settings unreachable → allow upload |
| `login_modal.*` | copy | Merchant-editable text |

---

## 5. `logo_upload_email_verifications` — the codes

| Column | Type | Null | Holds |
|---|---|---|---|
| `id` | `uuid` | **PK** | |
| `shop` | `text` | no | Store scope |
| `email` | `text` | no | Address being proven |
| `customer_gid` | `text` | **yes** | Null when logged out |
| `code_hash` | `text` | no | **HMAC-SHA256 of the code — never the code** |
| `attempts` | `int` | no | Wrong guesses; burned at 5 |
| `expires_at` | `timestamptz` | no | Now + `code_expiry_minutes` |
| `consumed_at` | `timestamptz` | yes | Set on success → single use |
| `ip` | `text` | yes | Per-IP rate-limit key |
| `created_at` | `timestamptz` | no | Rate-limit clock |

This is the **one place a plaintext email is unavoidable** — we cannot email a hash. Mitigated by
lifetime: these rows expire in ~10 minutes and are the shortest-lived data we hold.

### Indexes — and why there is no rate-limit table

| Index | Columns | Serves |
|---|---|---|
| `…_lookup_idx` | `(shop, email, created_at desc)` | Newest live code **+** 3/email/15 min |
| `…_ip_idx` | `(shop, ip, created_at desc)` | 10/IP/hour |

A code request **is** a row here, so both limits are `count(*)` queries over these two indexes. No
separate counters table, and a counter that cannot drift from reality.

### Four guards make brute force impractical

| Guard | Column | Without it |
|---|---|---|
| Hashed at rest | `code_hash` | A DB leak hands over live codes |
| 5-attempt cap | `attempts` | 6 digits = 10⁶, brute-forced in minutes |
| 10-minute TTL | `expires_at` | Unlimited time to guess |
| Single use | `consumed_at` | An intercepted code stays valid for its whole TTL |

---

## 6. `logo_upload_customers` — the customers

One row per customer known to this feature. Named for the *subject*, not the state, so future
per-customer data has an obvious home.

| Column | Type | Null | Holds |
|---|---|---|---|
| `id` | `uuid` | **PK** | Surrogate key |
| `shop` | `text` | no | Store scope |
| `customer_gid` | `text` | **yes** | **Primary identity** — looked up first |
| `email` | `text` | **yes** | Fallback identity + display |
| `verified` | `boolean` | no (`false`) | **Stored fact + revocation switch** |
| `verified_at` | `timestamptz` | yes | Drives the expiry window. Null while `verified = false` |
| `created_at` / `updated_at` | `timestamptz` | no | |

### ⚠️ "Is this customer verified?" is **two** conditions, never one

```sql
verified = true
  AND verified_at > now() - (verification_validity_days || ' days')::interval
```

| Checking only… | Silently ignores | Result |
|---|---|---|
| `verified` | expiry | A customer verified 2 years ago still passes |
| `verified_at` | revocation | A revoked customer still passes |

Both are bugs. The rule lives in **one** place —
`app/features/logo-upload/server/email-verification.server.js` → `isCustomerVerified()`. Never
re-implement it inline.

**Why `verified` exists when it looks derivable from `verified_at`:** it is the **revocation
switch**. Without it, forcing a re-verification means deleting the row or corrupting a timestamp.
With it, set `verified = false` and the next upload re-runs the code flow.

**Why the window isn't stored:** it's computed at read time from the current setting, so changing
`verification_validity_days` in the admin applies to everyone immediately — no backfill.

### Constraints

| Constraint | Enforces |
|---|---|
| `…_identity_present` | `customer_gid` or `email` must be present — a row with neither means nothing |
| `…_verified_consistent` | `verified=true` ⟺ `verified_at is not null`. Stops a revoked row keeping a stale timestamp |

### Indexes — two **partial** unique indexes, not one composite key

| Index | Condition | Prevents |
|---|---|---|
| `…_gid_key` on `(shop, customer_gid)` | `where customer_gid is not null` | Duplicate rows per customer. Partial, so the many logged-out rows (null GID) don't collide with each other |
| `…_email_key` on `(shop, email)` | `where customer_gid is null and email is not null` | Duplicate logged-out rows. Scoped to null-GID rows, so one customer before and after logging in doesn't collide |

Two **partial** unique indexes rather than one composite primary key:

| Index | Condition | Prevents |
|---|---|---|
| `…_gid_key` on `(shop, customer_gid)` | `where customer_gid is not null` | Duplicate rows per customer. Partial, so the many logged-out rows (null GID) don't collide with each other |
| `…_email_key` on `(shop, email)` | `where customer_gid is null and email is not null` | Duplicate logged-out rows. Scoped to null-GID rows only, so one customer before and after logging in doesn't collide |

**Expiry is computed, not stored.** The app compares `verified_at` against
`verification_validity_days`, so shortening the window in the admin takes effect *immediately for
everyone* — no backfill, no rewrite.

---

## 7. `logo_upload_customer_files` — the audit record

The point of feature F1. Today nothing records who uploaded what; this table is that record.

| Group | Column | Type | Holds |
|---|---|---|---|
| | `id` | `uuid` **PK** | |
| | `shop` | `text` | Store scope |
| **Who** | `customer_gid` | `text` **null** | **Canonical identity.** Only ever from a verified HMAC signature |
| | `customer_email` | `text` **null** | Denormalised display copy — *never* join on this |
| | `email_verified` | `boolean` | F2 satisfied *for this upload* |
| | `identity_source` | `text` | `'liquid_hmac'`, or null when the gate was off |
| **What** | `file_url` | `text` | Shopify CDN URL |
| | `file_name` | `text` | |
| | `file_size` | `bigint` | |
| | `mime_type` | `text` | |
| | `shopify_file_id` | `text` | `gid://shopify/…` |
| **Where from** | `product_id` | `text` | |
| | `product_handle` | `text` | |
| | `product_url` | `text` | |
| | `ip` | `text` | |
| | `created_at` | `timestamptz` | `now()` |

| Index | Columns | Serves |
|---|---|---|
| `…_shop_created_idx` | `(shop, created_at desc)` | Admin list, newest first |
| `…_customer_idx` | `(shop, customer_gid)` | "Everything this customer ever uploaded" — survives an email change |

### Three design points

| Point | Why |
|---|---|
| `customer_gid` is **nullable** | With `require_login` OFF, anonymous uploads are legal. The name says "customer" because that's the question the table answers — not because it's guaranteed present |
| `customer_email` stored, not looked up | The app has `read_files,write_files` only — no `read_customers`. Adding it needs `shopify app deploy` + re-consent + the client_id fix (B3) |
| `email_verified` per row, not looked up | `logo_upload_customers` shows *today's* state; this column records what was true *at upload time* |

**Scope reminder:** written by uploader **#1 only** (the product-page `#fileInput`). The shipping
form, quote-request form and App-Proxy "Upload 1/2" inputs never reach this table — see
[TASKS.md §0.4](TASKS.md).

---

## 8. One gated upload, end to end

```
 Customer clicks #fileInput on a product page
        │
        ▼
 ┌──────────────────────────────────────────────────────────┐
 │ GET /api/logo-upload/settings?shop=…                      │
 │   READ   logo_upload_app_settings                         │──► require_login?
 └──────────────────────────────────────────────────────────┘    require_verification?
        │
        ├─ both false ──────────────────────────────► native picker (today's behaviour)
        │
        ├─ require_login && not logged in ──────────► login modal, STOP
        │
        └─ require_verification?
                 │
                 │  READ  logo_upload_customers
                 │        by customer_gid  (fallback: email)
                 │        verified_at within validity window?
                 │
                 ├─ yes ─────────────────────────────► proceed
                 └─ no ──► OTP flow
                             │
                             │ POST /api/logo-upload/verify-request
                             │   COUNT  email_verifications          (rate limits)
                             │   INSERT email_verifications          (code_hash, expires_at)
                             │   → email sent
                             │
                             │ POST /api/logo-upload/verify-confirm
                             │   READ   email_verifications          (newest, unconsumed)
                             │   UPDATE attempts / consumed_at
                             │   UPSERT logo_upload_customers            (keyed on GID)
                             │   → signed token (15 min)
                             ▼
 ┌──────────────────────────────────────────────────────────┐
 │ POST /api/logo-upload/upload                              │
 │   1. READ   app_settings          (re-check server-side)  │
 │   2. VERIFY HMAC signature        ── mismatch → 401 ──────┤
 │   3. READ   logo_upload_customers    ── missing  → 403 ──────┤
 │   4. Upload to Shopify Files  (existing shopify-files lib)│
 │   5. INSERT customer_logo_uploads      ◄── ONLY on success│
 └──────────────────────────────────────────────────────────┘
        │
        ▼
 properties[Upload] = res.url   →   visible on the admin Uploads page
```

**Step 2 is the whole security model.** The browser can send any `customer_gid` it likes; only a
signature minted by Liquid on Shopify's servers, using a secret the browser never sees, is
accepted. Steps 1 and 3 are re-checked server-side because blocking in JavaScript alone is
cosmetic — a single `curl` would bypass it.

**Step 5 runs only after step 4 succeeds**, so a row always corresponds to a real file in Shopify
Files.
