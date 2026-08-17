# Logo Upload — Login Gate + Email Verification · 1-page summary

Short version for discussion. Full detail: **`PLAN-upload-login-gate.md`**.
Status: **plan approved in principle, no code written yet.**

---

## What we're building

Three things on the product-page logo upload (the "Upload / Formats: EPS, JPG, PNG" field):

| | Feature | Behaviour |
|---|---|---|
| **1** | **Login gate** | Click the upload field while logged out → popup: *"Sign in to upload your logo."* Login is **mandatory** — no guest uploads. Logged in → uploads normally and the file is **recorded against that customer**. |
| **2** | **Email verification** | Optional extra layer: a 6-digit code is emailed and must be entered before the upload is accepted. Remembered for 30 days per customer. |
| **3** | **Admin toggles** | Both features have ON/OFF switches on a new **Settings** page in the app. No deploy, no theme edit to change them. |
| **3b** | **Theme-editor controls** *(added 1 Aug)* | Additionally, each product template's section gets settings in the **theme editor sidebar**: *Enable image attachment* (show/hide the field) plus per-template overrides for login and verification. The app page stays; a template can force the feature off. |

Both features **ship OFF**. Nothing on the storefront changes until someone flips a switch —
and flipping it back is instant.

---

## Two facts that shaped the plan

**1. Uploads are currently not saved anywhere.** Today `/api/upload` pushes the file to Shopify
Files, returns a URL, and forgets it. So "record the customer" means a **new database table**
(`logo_uploads`) plus a new admin page to view it — not just adding a column somewhere.

**2. The upload JavaScript lives in one shared file** — but the theme-editor settings don't.
The widget's HTML is copy-pasted across **15 product section files** while all its JS sits in one
snippet, so the *logic* stays centralised. However, a theme-editor setting can only be declared in
its own section's `{% schema %}` block — so all ~15 sections now get a small mechanical edit
(4 settings + one `if` condition + one `{% render %}` line). This is the widest-reaching part of
the work and it replaced the earlier "zero section files" plan.

---

## How the security works (the important bit)

Browser data can't be trusted — anyone can send `customer_id=123` to our upload endpoint. So:

1. The **theme** signs the customer's identity — and the template's own settings — in Liquid,
   server-side on Shopify's machines:
   `hmac_sha256(login_setting + "|" + verification_setting + "|" + customer.id + "|" + customer.email, SECRET)`
2. The browser only ever sees the **signature**, never the secret.
3. Our **app** recomputes the signature with the same secret. Mismatch → the theme's settings are
   discarded and the app's own settings apply; a missing/forged identity → rejected (401).

So the gate is enforced **on the server**, not just hidden in JavaScript. Blocking only in JS
would be cosmetic — anyone could bypass it with a single curl command.

*(The alternative, Shopify App Proxy, is deliberately out of scope — decided.)*

**Accepted trade-off:** the shared secret lives in the theme's source code. The theme repo must
stay private. The main operational risk is the secret in the theme drifting from the one in the
app — that would break *all* gated uploads, so the app reports that specific error clearly and
supports two secrets at once during rotation.

---

## Scope of changes

| Where | New | Modified |
|---|---|---|
| **App** (`custom-email`) | 15 files — 3 DB migrations, 7 logic modules, 5 routes (Settings page, Uploads list, settings API, 2 verification endpoints) | 4 — mainly `api.upload.jsx` (additive: check settings → verify identity → save the record) |
| **Theme** (`logo-mat`) | 3 — modal + styles, the gate JS, and the per-widget config snippet that does the signing | 2 — the upload JS snippet and `layout/theme.liquid` |
| **Product sections** | — | **~15** — schema settings + one `if` + one render line each |

Everything is split into separate modules by job (settings / identity / verification / mailer /
rate-limiting / DB access) rather than piled into the upload route.

**Look & feel:** the popup reuses the existing quote-modal design and the theme's own colours —
navy `#132852`, amber button `#FFC107` (hover `#efb815`), red `#ed252c`, 8px corners — with no
font declared, so it inherits the site's typography. Styles are scoped so they can't leak into
the rest of the theme.

---

## How we roll it out safely

1. Work happens on a **branch connected to a separate unpublished test theme** — because the theme
   repo auto-deploys to the live theme on every push to `main`.
2. Test the full flow on the test theme's **preview URL** (customer login works there normally).
3. On sign-off: publish that theme / merge to `main`.

⚠️ **One catch we had to design around:** the server-side check applies **per store, not per
theme** — the app can't tell which theme called it. So turning the gate ON to test would have
made the **live** theme's uploads start failing (it has no gate code, so it sends no signature).
Fix: a rollout setting that limits enforcement to the test theme's ID while testing, then switches
to "all themes" once live. This is a rollout control, not a security boundary — noted explicitly
in the full plan, and it must be switched over after go-live.

---

## Pre-existing blockers (not caused by this work, but they gate delivery)

1. **Vercel won't deploy** — Hobby plan refuses commits from a non-owner on a private repo.
   Nothing reaches production until this is solved.
2. **Vercel may still point at the old Neon database** instead of Supabase — the new Settings page
   would read the wrong DB.
3. Minor/latent: the app config and the runtime environment reference **two different Shopify
   apps** (`7cc30be0…` vs `21daae00…`). No longer blocks this feature, but should be reconciled.

---

## Worth raising in the discussion (theme-editor controls)

- **Per-template means 20 places to configure.** Each of the 20 product templates uses its own
  section file, so "turn this on for the whole site" = 20 edits in the theme editor. A single
  **global theme setting** would be one switch, cheaper to build and to operate. Worth deciding
  whether per-template control is genuinely needed.
- **A checkbox can't mean "inherit".** If the theme setting is a plain on/off checkbox it silently
  overrides the app page on every template, making that page pointless. So the two gate settings
  are a 3-option dropdown — *Use app setting / Always require / Never require*.
- **The theme's setting has to be signed.** Our server can't read theme settings; the value arrives
  via the browser, so without a signature anyone could send "login not required" and walk through
  the gate. It's included in the signed payload, and if the signature fails we fall back to the
  app's own setting.
- Defaults are chosen so that **adding all this changes nothing** until someone edits a template.

## Open questions to settle

1. **Classic or new customer accounts?** With *new* accounts, Shopify's own login is already an
   emailed code — so feature 2 largely duplicates it. Worth confirming it's still wanted.
2. Are customer accounts enabled with **self-serve registration**? Otherwise the popup's
   "Create account" button has nowhere to go.
3. **Who sends the verification code** — the existing Gmail account (~500 emails/day cap, password
   currently hardcoded in the code) or a proper email service (Resend/SendGrid)?
4. The upload history **starts empty** — nothing was ever recorded, so no backfill is possible. OK?
5. Is the theme repo definitely **private**? (The signing secret will live in it.)
6. **The theme-editor controls — detail + screenshot still coming from the client.** Specifically:
   3 settings or just show/hide the field? Per-template or one global switch? And does the new
   checkbox replace the existing `custom.image_upload` metafield or combine with it (we assume
   combine)?
