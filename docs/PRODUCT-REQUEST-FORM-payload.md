# Product Request Form — payload contract

**Written:** 2026-09-09 · **Last updated:** 2026-09-09 (see Change log below)
**Route:** `app/routes/api.product-request.jsx` — exists, in progress.
**Form lives in:** theme repo `logo-mat`, `snippets/product-request-form.liquid`
(+ `snippets/product-request-form-field.liquid`, which draws one input).

This is the third storefront form. It merges the two legacy ones and will
eventually replace both on every product page:

| Legacy form | Snippet | Existing route |
|---|---|---|
| Shipping Info (`#shipping-form`) | `quote-form.liquid` | `api.save-shipping-info.jsx` (JSON) |
| Free Quote (`#shipping-form2`) | `custom-logo-form.liquid` | `api.save-shipping.jsx` (multipart) |

Both legacy forms keep working untouched. Nothing here changes them.

---

## Change log — read this if you started the route before 2026-09-09

The theme side gained three things after the first version of this doc. If the
route was scaffolded against that version, these are what is new:

1. **Signed customer identity now ships with every submission** — five new
   fields (`customer_gid`, `customer_email`, `customer_sig`, `login_override`,
   `verification_override`). This was previously written up as an OPEN
   DECISION; it is decided and built. **This is the mechanism that enforces
   "no stored logo without a customer reference."** See *Login gate* §2.

2. **A login gate and draft persistence** — the file input is disabled for
   logged-out shoppers, and the form auto-saves so the login redirect loses
   nothing. Two client hooks the route's success path must call:
   `window.prfClearDraft()` and `window.prfMarkSubmitted()`. See *Login gate* §1
   and *Abuse controls*.

3. **A honeypot field `prf_website`** plus a client-side time trap and cooldown.
   The honeypot is submitted so the server can check it too. See
   *Abuse controls*.

Nothing about the ordinary field list changed.

---

## Transport

`POST` **multipart/form-data** — the form carries a file input, so it must be
multipart, like `api.save-shipping.jsx` and unlike `api.save-shipping-info.jsx`.

Route: `app/routes/api.product-request.jsx`.

**The client is still a stub — it sends nothing yet.** In
`product-request-form.liquid`, search `PRF_SUBMIT_STUB`: that block validates,
logs the payload it *would* send, and shows an alert saying the form is not
connected. Wiring it to the live route is a theme-side job, done once the route
is ready.

To see the exact payload without a round trip: open the form in a browser, fill
it in, submit, and read the object logged to the console.

When the `fetch()` does go in, its success path must call all three of these —
they are already exposed on `window` by the form:

```js
.then(function (res) {
  if (!res.ok) { window.prfResetButton(); /* show error */ return; }
  window.prfMarkSubmitted();   // starts the 5-minute cooldown
  window.prfClearDraft();      // clears the saved draft
  /* show success */
})
```

---

## Fields

`form_source` is always `"product-request-form"` — use it to tell these
submissions apart from the two legacy forms if they share a table.

### Always present

| Name | Notes |
|---|---|
| `form_source` | literal `product-request-form` |
| `prf_website` | **honeypot — must be empty.** Non-empty means a bot; see Abuse controls |
| `customer_gid`, `customer_email`, `customer_sig`, `login_override`, `verification_override` | signed identity — see Login gate. Empty identity + valid signature = genuine logged-out shopper; invalid signature = reject |
| `title` | product title |
| `product_url`, `product_handle`, `product_id` | page the submission came from |
| `shop` | `shop.permanent_domain` |
| `name` | **new** — the Shipping Info form never collected this, which is why its confirmation email always said "Dear Customer" |
| `company`, `email`, `phone` | |
| `street`, `apt`, `city`, `zip` | |
| `country` | **new** — full country list, from Shopify's `all_country_option_tags` |
| `state` | **may be absent.** Hidden and un-required for countries with no subregions |
| `mat_type` | hidden input, product title |
| `quantity` | number. `min`/`max` attributes are rendered from `special_requirements` / `maximum_order`, but they are **advisory only** — the form is `novalidate` and its `validate()` checks emptiness, not bounds. **Validate the range server-side.** |
| `variant_id` | size, as a variant **title** string, not an id — same as both legacy forms |
| `loading_dock`, `liftgate` | `"Yes"` / `"No"`, default `"No"` |
| `cartons` | may be empty |
| `comments` | may be empty |

### Conditional — metafield driven (any template)

Present only when the product has the metafield set:

| Name | Metafield |
|---|---|
| `variation_option` | `custom_product_link` + `variation_value` |
| `background_color` | any of the 15 `*_colors` lists |
| `logo_orientation` | `orientations` |
| `logo_edging` | `edging` |
| `logo_corners` | `corners` |

`variation_option` is **not always a thickness.** It carries whatever
`variation_value` holds — a thickness on some products, a logo-colour count
("3 Color") on Olefin/Berber. Do not name the column `thickness`.

### Conditional — template driven

Present only when the calling section passes the matching `show_*` flag AND the
metafield is set:

| Name | Flag |
|---|---|
| `logo_colors` | `show_logo_colors` |
| `surface`, `style`, `backing`, `border`, `pattern` | `show_surface` etc. |
| `line_1` … `line_5` | `show_personalization` |
| `coin_quantity`, `coin_diameter`, `coin_thickness`, `coin_metal`, `coin_shape` | `show_coin` |

### Conditional — login driven

| Name | When present |
|---|---|
| `attachment` | Only when a **logged-in** shopper actually picks a file. |

Two things about `attachment` that are easy to get wrong:

- **The key is absent, not empty, for logged-out shoppers.** The input is
  rendered `disabled`, and a disabled input is not submitted at all. Do not
  write `formData.get('attachment')` and expect `""` — you get `null`.
- **It is optional even when logged in.** Expect a large share of submissions
  with no artwork.

Size: capped client-side at **4,404,019 bytes (~4.2 MB)**; the form's own hint
rounds this to "4 MB" for shoppers. Vercel rejects request bodies over ~4.5 MB
at the edge, which is where that number comes from. The client cap is a
courtesy — re-check the size server-side.

---

## Gotcha: `logo_colors` repeats

It is a `<select multiple>`. Multiple values arrive under the **same key**:

```js
const colors = formData.getAll('logo_colors');   // ["Purple (PMS 2627U)", "Blue (PMS 286U)"]
formData.get('logo_colors');                     // WRONG — first value only
```

Values are `Name (Code)` when the metaobject has a code, `Name` alone otherwise.
Do not rebuild them by splitting a joined string: names and PMS codes can
contain commas, and Black / Burgundy / Charcoal / Silver Grey / Navy Blue exist
in both the base-mat and logo palettes, so the bare code is ambiguous.

The client enforces that the number of colours equals the count in
`variation_option`, but re-check server-side — client validation is a
convenience, not a guarantee.

---

## Do not repeat these from the existing routes

Reviewed 2026-09-08; all three still open in the two live routes:

1. **Write to Supabase BEFORE sending mail.** In both existing routes the
   `insertFormSubmission` call sits inside the same `try` as `sendMail`, so a
   Gmail failure returns 500 and the row is never written — no email *and* no
   record. Insert first, then send, then update the row with `email_status`.

2. **Gmail credentials belong in env vars.** The password is inline and
   committed in **two** places: `api.save-shipping.jsx:84` and
   `api.save-shipping-info.jsx:43` (line 83 / 42 is the `user`). Use `GMAIL_USER` / `GMAIL_APP_PASSWORD` here
   from the start, and rotate the shared one separately — it is in git history.

3. **CORS is `*` on both existing routes.** Worth narrowing, but be clear
   about what it buys: **CORS does not stop the request being sent.**
   `multipart/form-data` is a CORS-safelisted content type, so the browser
   fires this POST with **no preflight** — response headers only stop a hostile
   page *reading the reply*, not triggering the mail. `api.product-request.jsx`
   already says as much in its own comment. Server-side rate limiting is what
   actually closes the spam-relay hole; an App Proxy (HMAC-signed requests)
   closes it structurally.

Also: return a real status the client can branch on. The legacy Free Quote
handler never checked `response.ok`, so failures rendered as success.

---

## Login gate + customer identity

Added to the form 2026-09-09. Approach chosen: **warn upfront, save the draft.**

How the storefront behaves now:

- **Logged in** — name, email, phone and the default address are prefilled from
  the `customer` object. The file input is enabled.
- **Logged out** — a banner sits above the fields ("Log in to attach your logo
  file. You can fill everything else in first — we will keep it for you") and
  the file input is `disabled` with the hint "Log in to attach a file."
- The form auto-saves to `localStorage` on every keystroke, so the login
  redirect costs the shopper nothing. On return the values are restored, the
  modal reopens and the page scrolls to the Upload field. Drafts expire after
  **24 hours**.
- The file itself is never saved — browsers forbid setting a file input's
  value — so the artwork is always re-picked after login. That is the step the
  shopper was on anyway.

This store uses **new customer accounts**, so login is a hosted full-page
redirect. There is no way to sign in without leaving the page; an inline login
form is not an option.

### 1. Call `window.prfClearDraft()` after a confirmed success

Exposed by the form next to `window.prfResetButton()`. Without it the shopper's
answers stay in `localStorage` and get restored into the form the next time they
open it, after they have already submitted.

```js
.then(function (res) {
  if (!res.ok) { window.prfResetButton(); /* show error */ return; }
  window.prfClearDraft();
  /* show success */
})
```

`prfResetButton()` is the matching failure call — the legacy forms never reset
their spinner, so a failed submit left the button looking permanently dead.

### 2. RESOLVED — signed customer identity now ships with every submission

**This was previously listed as an open decision. It is decided and built.**
The form now sends a signed identity on every submission, so an uploaded logo
can never be stored without a verifiable owner.

#### The five extra fields

| Field | Contents |
|---|---|
| `customer_gid` | `gid://shopify/Customer/123…`, or **empty string** when logged out |
| `customer_email` | the account email in its **original casing**, or empty string |
| `customer_sig` | HMAC-SHA256 hex over the payload below |
| `login_override` | `default` \| `on` \| `off` |
| `verification_override` | `default` \| `on` \| `off` |

Plus `shop`, which is already in the payload as a normal hidden input.

#### Verifying

Rebuild this string and HMAC it with `LOGO_UPLOAD_SECRET`, then compare against
`customer_sig`:

```
v1|<shop>|<login_override>|<verification_override>|<customer_gid>|<customer_email>
```

Six fields, `|`-joined, in exactly that order. This is the **same contract**
`api/logo-upload/upload` already uses, so
`app/features/logo-upload/server/customer-identity.server.js` verifies it as-is
— no new mechanism to build.

Rules that are easy to get wrong (from the theme snippet's own notes):

- Logged out sends **empty strings**, not `null` and not
  `gid://shopify/Customer/` with a blank id.
- Lowercase the email only **after** the signature verifies. Normalising first
  breaks every signature.
- No field may contain `|`. Reject the whole payload as malformed if one does.

#### Why an empty identity is still signed — and why that matters

A signature over empty identity is **valid**. It proves the *theme* rendered the
request, while yielding no customer. That is exactly what lets you tell apart:

| Case | `customer_gid` | `customer_sig` | Meaning |
|---|---|---|---|
| Logged-in shopper | populated | valid | trusted, owner known |
| Logged-out shopper | empty | valid | genuine anonymous request |
| Forged / tampered | anything | invalid | reject the whole submission |

So the check is not "is there a customer" — it is "does the signature verify",
and *then* "is there a customer".

#### Where it comes from in the theme

- `snippets/mo-logo-upload-config.liquid` computes the HMAC and publishes it on
  `window.MO_LOGO_UPLOAD`. It is the **only** file holding the secret.
- `layout/theme.liquid:559` renders it when `custom.image_upload == true`.
- `product-request-form.liquid` renders it when that is **false**, so exactly
  one instance exists on every page the form appears on.
- The form's JS copies the values into hidden inputs on `DOMContentLoaded`.

If `customer_sig` ever arrives empty, that config did not render — treat it as
a misconfiguration, not as an anonymous shopper.

#### What the route must do

1. **Accept submissions with no file.** Upload is optional and disabled for
   logged-out shoppers, so expect a large share with no artwork at all.

2. **Verify `customer_sig` on every submission.** Invalid signature → reject
   outright, file or no file.

3. **Reject a file when the identity is empty.** A logged-out shopper should
   never be able to attach artwork; the theme disables the input, but that is a
   browser-side control and proves nothing. This is the check that actually
   enforces *"no logo without a customer reference."*

4. **Store `customer_gid` and the verified `customer_email` on the row**, not
   the `email` form field. Link the stored file to that customer so artwork can
   always be traced back to an account.

5. **Never treat the `email` FIELD as identity.** It is free text the shopper
   types and can say anything. Use it for correspondence only.

---

## Abuse controls

Added 2026-09-09. **All of this runs in the browser and is trivially bypassed by
anything that posts directly** — it stops ordinary form-spam scripts, nothing
more. It is not a substitute for server-side limits.

Why it matters more than usual: this route sends email through a Gmail account
with a ~500/day cap that the two legacy forms share. A bot does not need to
break anything — repeated submissions flood the sales inbox and can get the
sender throttled, which would silently break `save-shipping` and
`save-shipping-info` as well.

### What the form does now

| Control | Behaviour |
|---|---|
| **Honeypot** | Hidden field `prf_website`, positioned off-screen (not `display:none`, which cruder bots skip). Non-empty → submit is silently dropped, with no message. |
| **Time trap** | Submits arriving under **5 seconds** after the modal opened are rejected. Timer resets per modal open, not per page load. |
| **Cooldown** | One successful submission per **5 minutes**, per product, per browser. Keyed in `localStorage`. |

### What the route must do

1. **Reject when `prf_website` is non-empty.** It is submitted with the payload
   precisely so the server can check it too rather than trusting the browser.
   Return a normal-looking 200 rather than an error — an error tells the script
   what tripped it.

2. **Call `window.prfMarkSubmitted()` from the client on success.** Exposed
   alongside `prfClearDraft()` and `prfResetButton()`. Without it the cooldown
   never starts and the same request can be fired repeatedly.

   ```js
   .then(function (res) {
     if (!res.ok) { window.prfResetButton(); /* show error */ return; }
     window.prfMarkSubmitted();
     window.prfClearDraft();
   })
   ```

3. **Add server-side rate limiting.** The browser-side cooldown is cleared by
   any incognito window. `features/logo-upload/config/defaults.js` already has
   the pattern worth copying — `rate_limit_email_per_15min` (default 3) and
   `rate_limit_ip_per_hour` (default 10).

4. **Known residual gap, already noted in `api.product-request.jsx`:** multipart
   is a CORS-safelisted content type, so the POST fires with no preflight, and a
   missing `Origin` header is allowed through. CORS cannot close this. Rate
   limiting is the near-term answer; a Shopify App Proxy (HMAC-signed requests)
   is the structural one if abuse actually appears.

Not implemented, deliberately: no CAPTCHA. Turnstile for logged-out shoppers
only would be the next step if the above proves insufficient — logged-in
shoppers do not need it, the account is already the proof.

---

## Related

- `docs/HANDOVER-eps-upload.md` §12 — the two legacy forms, how their handler JS
  was recovered from the live page. §12.5 covers the email wiring both routes
  share and which config constants to edit.
- Theme repo `docs/` — the form's own notes.
