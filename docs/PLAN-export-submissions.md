# Export from the Form Submissions page — plan

**Written:** 2026-09-17 · **Status:** built, awaiting a browser test · **Branch:** `feature/new-combined-form`

Add an **Export** control to the Form Submissions page
(`/app` → `app/routes/app._index.jsx`, live at
`admin.shopify.com/store/logo-mat-central/apps/image-upload-new/app`) that
downloads submissions as a spreadsheet file.

All **three** form types must come out with their own fields intact, and the
combined form's rows must carry its **order reference and order status**.

## Progress

| Phase | State |
|---|---|
| **0** — iframe download spike | ⚠️ **folded into Phase 3 and NOT yet proven** — see below |
| **1** — registry + formatters + both writers | ✅ **done 2026-09-17** — 54/54 checks |
| **2** — server read + export assembly | ✅ **done 2026-09-17** |
| **3** — route + Export button (frozen-file edit) | ✅ **built 2026-09-17**, baseline re-blessed |
| **4** — verification against live data | 🟡 **19/19 automated pass; the browser half is outstanding** |
| **5** — live Shopify payment/fulfilment status | ✅ **built** — never exercised against Shopify |
| **6** — deferred extras (date range, scheduled export) | ⬜ out of scope |

**What "built" does and does not mean.** Everything runs and is checked against
the live database — 75 rows, all three form types, both formats. Two things have
never happened in a browser, and both are Phase 4:

1. **The download inside the admin iframe (D8).** Phase 0 was meant to prove this
   first; it was folded into Phase 3 because the writers and the route do not
   depend on the answer and the button is the spike. **This is still the one
   genuine unknown.** Test with the **.xlsx** option — a binary body is where a
   download path that mangles encoding shows up; CSV alone would pass and prove
   nothing.
2. **The two Shopify status columns (Phase 5).** `read_orders` is granted and the
   code is best-effort by contract, but no real `nodes(ids:)` call has run. Only
   one live row has an order (`#2044`), which is the row to check.

**Run the checks any time:**

```
node scripts/check-export.mjs        # pure core, no DB, no network
node scripts/check-export-live.mjs   # real rows, read-only; writes samples to tmp/
bash scripts/check-no-break.sh       # frozen files (save_shipping_calls is a known
                                     # pre-existing failure — see §2.1)
```

Keep this table current as each phase lands.

## Open questions — none. All three answered 2026-09-17

| # | Question | Answer |
|---|---|---|
| **Q1** | Status column: submission lifecycle, or Shopify's own Paid / Fulfilled? | **Both**, in their own columns — see D6. This puts Phase 5 **in scope**, not optional |
| **Q2** | Must links be one-click in Excel? | **Merchant's choice, asked at export time.** CSV → links as plain text. Excel (.xlsx) → clickable links, like the app's own submissions list. Revised 2026-09-17 — reopened and settled D1 |
| **Q3** | Should staff pick which columns to export? | **No.** Every column, every time. Not built, not deferred-with-intent — dropped |

Nothing is waiting on an answer. Phases 0–5 are all specified.

---

## 1. What exists today (verified 2026-09-17, against the live database)

**One table, three form types.** `public.form_submissions`, 23 columns, with the
per-form field set in the `payload` jsonb column. Live counts:

| `form_type` | Label in the admin | Rows | With attachment | With draft | With order |
|---|---|---:|---:|---:|---:|
| `request_quote` | Quote Request | 71 | 70 | 0 | 0 |
| `request_quote_new` | Request Quote New | 3 | 1 | 2 | 1 |
| `shipping_form` | Shipping Info | 1 | 0 | 0 | 0 |

75 rows total, all on `logo-mat-central.myshopify.com`. The three
`request_quote_new` rows happen to cover all three draft-order states (none /
draft `#D1361` / order `#2044`), which makes them a complete test set for the
status column.

**The page already holds every row.** `app._index.jsx`'s loader calls
`listFormSubmissions(session.shop)` — unbounded — then filters and paginates in
the browser (20 per page, search over email / phone / company / name /
product_handle / product_title, plus the form-type `Select`).

**Draft-order columns are already in place** from `PLAN-draft-orders.md` Phase 1:
`draft_order_id`, `draft_order_name`, `order_id`, `order_name`,
`draft_order_created_at`. `syncDraftOrderStatuses()` refreshes them on every list
load, so by the time an export runs the values are as current as the page is.

**Scopes are already granted** — `read_orders` and `read_draft_orders` are on the
app (Dev Dashboard, applied 2026-09-15). Phase 5 needs **no merchant
re-approval**.

**No CSV or XLSX library is installed today.** CSV needs none; XLSX needs one —
`exceljs`, the single dependency this feature adds. See D1.

### 1.1 Payload keys per form type (live, not inferred)

Counts in brackets are rows carrying that key, where it is not all of them.

**`shipping_form` — 19 keys**
`apt`, `cartons`, `city`, `comments`, `company`, `email`, `liftgate`,
`loading_dock`, `phone`, `product_handle`, `product_id`, `product_url`, `shop`,
`state`, `street`, `thickness`, `title`, `variant_id`, `zip`

**`request_quote` — 21 keys**
`address`, `address2`, `attachment`, `city`, `comments`, `company`, `email`,
`logo_orientation`, `mat_type`, `name`, `phone`, `product_handle`,
`product_url`, `quantity`, `shop`, `state`, `variant_id`, `zip`,
`background_color` (65), `product_id` (54), `logo_edging` (5)

**`request_quote_new` — 33 keys**
the `config/fields.js` set plus `form_source`, `title`, `country`,
`variant_gid`, `variant_base_gid`, `variant_price`, `variant_product_id`,
`customer_gid`, `customer_email`, `attachment` (2 of 3)

### 1.2 Six data facts that will bite an implementation that assumes otherwise

1. **The three forms use different names for the same thing.**
   `request_quote` stores the street as `address` / `address2`; the other two use
   `street` / `apt`. `shipping_form` has `thickness`; the new form has
   `variation_option`. Any export that keys on one vocabulary silently blanks
   two-thirds of the address column.
2. **`shipping_form` never collected `name`.** The `name` *column* is null on
   that row. Documented in `PRODUCT-REQUEST-FORM-payload.md` — it is why the old
   confirmation email said "Dear Customer".
3. **`logo_colors` is sometimes a string and sometimes an array.** Live rows hold
   both `"Black"` and `["Black","Charcoal"]`. A single checkbox selection
   collapses to a scalar.
4. **`attachment` in `payload` is an object**, `{name, size, type}` — and it can
   be `{name: "", size: 0, type: "application/octet-stream"}`, i.e. present but
   empty. `String(value)` on it yields `[object Object]`. `media_url` /
   `media_name` on the row are the real attachment record; `payload.attachment`
   is only the browser's description of the upload.
5. **`comments` contains embedded CRLF.** Real rows do
   (`"ILLUSIONS BARBER LOUNGE  (0n the top of Logo)\r\nEST. 2017 (In…"`). The
   writer must quote and normalise them, or every such row splits into two rows
   in the spreadsheet. See D9.
6. **One row has an attachment name but no attachment URL.** 72 rows carry
   `media_name`, only 71 carry `media_url`. That gap is a **failed upload**: both
   legacy routes treat `uploadToShopifyFiles()` as non-fatal and store the name
   regardless, so the file went out as an email attachment and was never stored.
   An export that prints the name alone implies artwork that cannot be retrieved.
   See D12.

### 1.3 What the link columns actually have to work with

| | `request_quote` | `request_quote_new` | `shipping_form` |
|---|---:|---:|---:|
| `product_url` / `product_handle` / `product_id` / `product_title` | 71 / 71 | 3 / 3 | 1 / 1 |
| `media_url` | 70 | 1 | 0 |
| `media_name` | 71 | 1 | 0 |

- **`product_url` is populated on all 75 rows**, and points at the custom domain,
  `logomatcentral.com/products/…`, not `*.myshopify.com`. It is taken from the
  column as-is — nothing is constructed.
- **`product_id` is also on all 75 rows.** It ships as its own `Product ID`
  column so an admin lookup is a paste away, but no admin URL is built from it
  (D12).
- **Every `media_url` is on `cdn.shopify.com`** — a public CDN, no session
  required. That is what makes the link useful in a spreadsheet, and it is also
  the reason the exported file needs handling care. See Risk 8.

Two more from the existing docs, still true: `variant_price` is an **integer
number of cents** (`"8700"` → `$87.00`), and jsonb key order is **length then
bytewise**, not insertion order — which is why a header built from
`Object.keys(payload)` reshuffles between exports.

---

## 2. Separation rules for this work

Same rules as the draft-order work. Everything new lives under
**`app/features/export/`** — `submissions/` for this one, with the generic
pieces one level up so the next export (`export/logos/`, …) reuses them rather
than copying them. See §4. The two legacy forms, both of their routes, and the
insert path are not touched at all.

**Frozen files this work MUST touch** (`docs/logo-upload/baseline.sha256`,
verified by `scripts/check-no-break.sh`) — re-bless in the same commit:

- `app/routes/app._index.jsx` — one import plus the `<ExportButton>` in the
  existing filter row. Unavoidable: that is where the toolbar is.

**Frozen files this work MUST NOT touch:**

- `app/lib/supabase.server.js` — the export gets its **own** query module, the
  same way `features/product-request/server/db.server.js` did. Do not add an
  export query to the shared lib.
- `app/routes/app.submissions.$id.jsx` — nothing to do there.
- Both legacy API routes, and every existing migration.

**No migration.** Every value the export needs is already a column or already in
`payload`. Nothing to apply, nothing to roll back, no risk to existing rows.

**The export does not extend `app._index.jsx`'s `action`.** That route already
delegates to `deleteSubmissionAction`. The export is a **GET** on its own route,
so that line stays exactly as it is — same reasoning as the draft-order button.

### 2.1 Pre-existing guard failure — do not "fix" it here

`scripts/check-no-break.sh` currently reports
`save_shipping_calls — expected 2, found 5`. **Unrelated to this work**, already
written up in `PLAN-draft-orders.md` → *Known issue*: `count_of()` greps the
whole theme recursively while the marker is scoped to one file, and the extra
hits are comment mentions in `product-request-form.liquid`. **Do not re-bless
that count.** Expect it to be red before and after this feature; everything else
in the guard must stay green.

---

## 3. Decisions — settled

### D1. TWO formats — the merchant picks ✅ revised 2026-09-17

Originally CSV only. Revised: the Export control **asks for the format first**,
the same way Shopify's own export modal does.

| Choice | Wording in the UI | Links |
|---|---|---|
| **CSV** | "CSV for Excel, Numbers, or other spreadsheet programs" | plain text |
| **Excel** | "Excel (.xlsx) — with clickable links" | real hyperlinks |

**CSV** — UTF-8 **with a BOM**, `CRLF` line endings, RFC 4180 quoting. The BOM is
not optional: Excel on Windows reads a BOM-less UTF-8 CSV as the system codepage,
which mangles PMS colour names, `×`, `'` in sizes like `3' x 4'`, and accented
customer names.

**XLSX** — needs a writer library; CSV needs none. That is the whole cost of this
decision, and it buys two things, not one:

1. **Clickable links** (the reason it was asked for) — D12.
2. **A stronger safety guarantee than CSV can give.** In XLSX a text cell is
   *typed* as a string and a hyperlink is a *cell property*. Neither can be
   re-interpreted as a formula, so the D9 injection guard becomes structural
   rather than a rule the writer has to keep obeying. The `.xlsx` file is the
   safer of the two to hand to someone who will open it in Excel.

**Library: `exceljs`.** Well established, writes hyperlinks as
`cell.value = { text, hyperlink }`, and works server-side on Node with no native
build step. It is ~1 MB — irrelevant against Vercel's function limit, but check
the built bundle at implementation time and consider a lighter write-only
alternative if it bloats the cold start. **Do not hand-roll the format**: XLSX is
a ZIP of XML parts with a relationships file per sheet for the hyperlinks, and
that is a real maintenance burden for no gain.

**Both formats produce identical columns** — see D15.

### D2. An explicit column registry, not a dump of payload keys ✅

Columns are declared in code, per form type. Dynamic headers are rejected for two
reasons: jsonb key order is length-then-bytewise (so the header would reshuffle
between exports), and a column only appears once some row happens to carry the
key, so two exports of the same data can have different shapes.

### D3. "All forms" is ONE file with union columns ✅

Layout: `Form` first, then the shared core block, then per-form blocks. A column
a given row's form does not have is **empty**, not absent.

**Synonyms are merged into one column** where the two names mean the same thing:
`address` → *Street*, `address2` → *Apt / Suite*. `thickness` and
`variation_option` are **kept separate** — `PRODUCT-REQUEST-FORM-payload.md` is
explicit that `variation_option` is not always a thickness (it holds a colour
count on Olefin/Berber), and merging them would caption half the rows wrongly.

Alternatives declined: a **ZIP of three CSVs** (needs a hand-rolled zip writer,
and three files is worse for a merchant who wants to sort one sheet); an **XLSX
with three sheets** (dependency, see D1).

### D4. Nothing is silently lost ✅

Any `payload` key not in the registry lands in a final **`Other fields`** column
as `key=value; key=value`. This mirrors `groupPayload()`'s "Other details"
behaviour and its reasoning — *a new form field must never disappear just because
a map was not updated with it*. The header stays stable, and a field the theme
starts sending tomorrow is in the export tomorrow, with no code change.

### D5. Order reference and order status ✅ — the explicit ask

Six columns, present on **every** form. Blank for the two legacy forms, which
cannot raise draft orders (only the new form records a priced variant).

| Column | Source |
|---|---|
| `Order status` | **Derived, no API call** — `Not started` / `Draft created` / `Order completed` |
| `Draft order` | `draft_order_name` (`#D1361`) |
| `Draft order created` | `draft_order_created_at`, ISO 8601 UTC |
| `Order` | `order_name` (`#2044`) |
| `Payment status` | **From Shopify** — `displayFinancialStatus`: Paid / Pending / Refunded … |
| `Fulfillment status` | **From Shopify** — `displayFulfillmentStatus`: Fulfilled / Unfulfilled … |

**Numbers only — no admin URLs for these two.** `#D1361` and `#2044` are what
staff search on in the Shopify admin, and the number is the thing a human
recognises. A deep link would add two wide columns of
`admin.shopify.com/store/…/draft_orders/1234567890` to every row to save one
paste into the admin search box.

`Order status` is computed from the row's own columns with exactly the rule the
UI badge uses (`order_id` → completed, else `draft_order_id` → draft, else not
started) — **no Shopify call**, so the export cannot fail because Shopify is
slow or a token expired.

Because no admin URLs are built, the export needs nothing from
`DraftOrderAction.jsx`'s `numericId()` / `adminUrl()` helpers. **Leave them where
they are** — there is no second caller to justify lifting them.

### D6. BOTH statuses ship — resolved 2026-09-17 ✅

"Order status" was ambiguous between two readings. The answer is **both**:

- **(a) The submission's lifecycle** — `Not started` / `Draft created` /
  `Order completed`. Derived from the row, free, cannot fail. Ships in Phase 3.
- **(b) Shopify's own status** — read from the order at export time. Ships in
  **Phase 5, now in scope rather than optional.**

**Three columns, not two — and that is the "appropriately".** The request was for
both statuses in two columns, but (b) is **not one value**. Shopify tracks
payment and fulfilment as two independent things: an order can be Paid and
Unfulfilled, or Refunded and Fulfilled. Shopify's own Orders list shows them as
two separate columns for that reason.

Merging them into one cell (`Paid · Unfulfilled`) would save a column and cost
the ability to filter — the first thing anyone does with a spreadsheet of orders
is "show me everything unfulfilled", and that does not work against a combined
string. So:

| | Column | Answers |
|---|---|---|
| ours | `Order status` | Have we actioned this request? |
| Shopify's | `Payment status` | Has the customer paid? |
| Shopify's | `Fulfillment status` | Have we shipped it? |

Say so if you want the two Shopify ones merged into a single `Shopify status`
column anyway — it is a one-line change in the registry.

**The Phase 5 columns are additive.** Nothing in Phases 1–4 changes to
accommodate them; they are two more registry entries fed by one lookup.

### D7. A server route, not client-side generation ✅

New resource route, loader only, returning `text/csv`.

The page's loader already holds every row, so a purely client-side CSV would work
*today* with zero server code. Rejected: it welds the export to whatever the page
happened to load, and that unbounded load is the first thing that will change
when the list gets server-side pagination. A server route also keeps the
shop-scoping in one place and reads only the columns it needs.

**Route file: `app/routes/app.export.submissions.jsx`** → `/app/export/submissions`.

The URL mirrors the folder layout, so the next export is
`app.export.logos.jsx` → `/app/export/logos` and nothing has to be renamed to
make room for it.

Deliberately **not** `app.submissions.export.jsx`. That would put a static
segment under the same parent as the `$id` detail route and rely on
static-beats-dynamic precedence to avoid being read as a submission id. It works,
and it is exactly the kind of thing that breaks quietly during a router upgrade.

There is no `app.export.jsx` parent layout and none is needed — these are leaf
resource routes with no shared UI.

### D8. Download mechanism inside the embedded admin ⚠️ spike first

The app renders inside Shopify's admin **iframe**. A plain `<a href>` to the
export route navigates the iframe and loses the session token, so it cannot be
used.

Chosen: the button calls `fetch()` — App Bridge patches `window.fetch` to attach
the session token — reads the body as a `Blob`, and clicks a temporary
`<a download>` built from `URL.createObjectURL()`.

This depends on the admin iframe's sandbox allowing downloads. **Phase 0 proves
it before anything else is written.** If it fails, the fallback is a short-lived
signed download URL opened in a new tab via App Bridge — a whole extra mechanism,
which is precisely why it is worth ten minutes to find out first.

### D9. Hardening the CSV writer ✅

Three things, all cheap, all load-bearing:

1. **Formula injection.** A value starting with `=`, `+`, `-`, `@`, TAB or CR is
   prefixed with `'`. Submission text is attacker-controlled (a `comments` or
   `company` field can say anything) and staff open these files in Excel. This is
   the only security-relevant line in the feature.
2. **Embedded newlines.** Quote the field and normalise `\r\n`/`\r` inside it to
   `\n`, so the file's own `CRLF` record separator stays unambiguous for naive
   parsers. Real rows contain CRLF — see §1.2.5.
3. **Quoting.** Double the `"` inside a quoted field; quote any value containing
   `"`, `,`, `\n` or a leading/trailing space.

**All three are CSV problems**, and all three are artefacts of CSV being an
untyped text format. XLSX has none of them: cells are typed, so a leading `=` in
a string cell is just text, newlines live inside a cell by definition, and there
is no delimiter to escape. The XLSX writer therefore needs **no equivalent
guards** — but it does need every cell written as an explicit string type (1.1b),
or the library will helpfully turn `#D1361` and a leading-zero ZIP into something
else.

### D10. Three export scopes — revised 2026-09-17 ✅

The button passes the current `form` (the `Select`) and `q` (the search box) as
query params; the route re-applies them **server-side** over the same fields the
UI searches. **The form filter applies in every case** — someone looking at
Quote Requests must never find Shipping Info rows in their file.

What gets exported is then one of three things:

| Situation | Scope | Why |
|---|---|---|
| Search typed | every matching row, all pages | The search *is* the selection; exporting part of it would surprise |
| No search | **the rows on screen** | The default is not "everything" — see below |
| No search, "Export all records" ticked | everything the filter allows | The deliberate choice |

**Why the default is the page and not the whole table.** Exporting 75 customers'
names, emails, phone numbers and artwork links is a different act from exporting
the twenty someone is looking at, and the difference should be a decision rather
than an accident. The checkbox carries the real number — `Export all 75 records`
— so there is nothing to infer, and the button label always states exactly what
is about to happen.

**"This page" means the rows on screen, named explicitly.** The button sends
`ids=<uuid,…>`. The alternative — `offset (page - 1) * 20` — only agrees with the
screen while this query's ordering, filtering and page size stay in step with the
client's, and the day one of them changes the file quietly stops matching what
the merchant was looking at. Shop-scoping still applies, so an id from another
store matches nothing.

**A partial export says so in its filename** — `…-page-2026-09-17.csv`,
`…-search-2026-09-17.csv`, versus plain `…-2026-09-17.csv` for the full one.
Three files in a Downloads folder a fortnight later, and nothing else
distinguishes "what I was looking at" from "the whole table".

Two cases deliberately collapse: when every matching row already fits on one
page, the checkbox is hidden (both choices would produce the same file), and a
search never offers it.

Date range is deferred to Phase 6. At 75 rows it buys nothing.

### D11. Machine identifiers ARE exported ✅

`variant_gid`, `variant_base_gid`, `variant_product_id` and `customer_gid` are in
`HIDDEN_KEYS` in `config/fields.js` — deliberately, because
`gid://shopify/ProductVariant/44…` tells a salesperson nothing in an email.

A spreadsheet is the one place they **do** belong: it is what reconciliation
against Shopify is done with. The export therefore diverges from `HIDDEN_KEYS`
on purpose, in its own registry, without touching `fields.js`.

### D12. Which links ship, and how each format renders them ✅

**Two link columns ship: `Product URL` (storefront) and `Attachment URL`.**

No `Product admin URL`, no `Draft order URL`, no `Order URL` — decided
2026-09-17. The product's storefront page is the one a human actually wants to
look at, and the draft/order columns carry the numbers staff search on. Three
columns of `admin.shopify.com/store/…` per row is width spent on a paste.

**How they render depends on the format the merchant picked (D1):**

| | CSV | XLSX |
|---|---|---|
| `Product URL`, `Attachment URL` | plain text | plain text |
| `Product` (title) | plain text | **hyperlink** → `product_url` |
| `Attachment name` | plain text | **hyperlink** → `media_url` |

**In XLSX the clickable cell is the NAME, not the URL** — the product title links
to the product, the file name links to the file. That is exactly how the app's
own submissions list reads, which is what was asked for, and it is what makes the
sheet skimmable: a column of `Flocked Olefin Indoor Logo Mat.png` beats a column
of `cdn.shopify.com/s/files/1/0939/1318/6585/files/…?v=1789506248`.

The raw URL columns stay in **both** formats regardless. They are what someone
pastes into a script, a browser or an email, and they are the only readable form
when the file is converted, diffed or opened as text.

**In CSV the links stay plain text and that is final.** Google Sheets auto-links
them on import; Excel does not — it only linkifies a URL you type, not one it
reads from a CSV. The fix that suggests itself, `=HYPERLINK("https://…","Open")`,
is **rejected outright**: it is a formula, and D9's guarantee is that the CSV
contains none, because the same file carries attacker-controlled `comments` and
`company` text. A writer that emits formulas for the columns you trust and
refuses them for the ones you do not has turned the guard into a policy, and
policies get edited by someone in a hurry. **Clickable links in Excel are exactly
why the XLSX option exists** — take that route, not this one.

Nothing here is constructed: `product_url` and `media_url` are stored columns,
used as they are. The export builds no Shopify admin URL anywhere, so there is no
gid parsing and no deep-link helper to keep in step with the admin pages.
`Product ID` is still a column, so anyone who wants the admin page has the id to
paste.

### D13. An attachment name without a URL is reported as such ✅

`Attachment name` is `media_name`; `Attachment URL` is `media_url`. When the
name is present and the URL is not — one live row, §1.2.6 — the export writes
`Upload failed — emailed only` into `Attachment URL` rather than leaving it
blank.

A blank cell reads as "no attachment"; the truth is "there was one and we did not
keep it", which is the difference between a salesperson moving on and a
salesperson asking the customer to resend. `payload.attachment.name` is **not** a
fallback source here (§1.2.4) — it is the browser's description of a file that
may never have been stored.

In XLSX that cell carries **no hyperlink** — there is nothing to link to. It must
not silently become a dead link to the file that failed to upload.

### D14. Shopify's native export cannot be reused — investigated 2026-09-17 ✅

Asked directly: the admin already has CSV export, can we inherit it? **No.**
Recorded here so it is not re-asked.

1. **App Bridge has no export or download API.** The reference lists 25 APIs —
   App, Config, Environment, ID Token, Scopes, User, Resource Fetching, Intents,
   Navigation, Picker, Resource Picker, Loading, Modal, Save Bar, Toast, Reviews,
   Support, Tools, POS, Print, Scanner, Share, Web Vitals. There is a **Print**
   API and a **Share** API; there is nothing for producing a file.
2. **The native CSV export is a closed, fixed-schema feature.** No extension
   target, webhook or API lets an app add a column to it. The merchant gets
   Shopify's own columns — including empty ones — and the only choices are
   current page / all / date range.
3. **It cannot even export Shopify's own line item properties.** This kills the
   one idea that looked promising: putting form answers on the draft order as
   custom attributes and letting the native order export carry them out. Those
   fields are exactly what the paid export apps advertise as *"missing from
   default Order Exports"*. Confirmed, having flagged it as unverified earlier.
4. **Metaobjects have no native CSV export either** (still true in 2026), so
   "restructure storage into Shopify so export comes free" does not work. That
   was the only theoretical route to inheriting it, and it does not exist.
5. **What real apps do is what this plan already does:** build the file
   server-side from your own data and hand back a download. Confirmed against the
   published architecture of EZ Exporter, Exportify and Matrixify.

Two findings that **validate existing decisions** rather than change them:

- **Admin UI extensions run in a sandboxed worker and cannot trigger a browser
  download at all** — they must open an app page to do it. So the app-route
  approach in D7 is not merely simpler than an extension, it is the only one that
  can produce a file.
- **Shopify's own export downloads directly up to 50 orders and emails anything
  larger.** Good precedent for the 2.3 row cap if this ever outgrows a direct
  download. At 75 rows it does not apply.

**Where native export still earns its keep:** reconciling completed orders.
`createDraftOrder` tags its drafts `product-request-form`, so the admin's own
Orders / Draft orders export gives a proper financial view of the ones that
converted — 2 rows of 75 today. It is a complement, not an alternative: the other
73 are quote requests Shopify has never heard of.

### D15. Both formats produce identical columns ✅

Same headers, same order, same count, same values. The **only** difference is
that three XLSX cells carry a hyperlink property (D12).

This matters more than it sounds. If the two formats had different shapes, "the
export" would stop being one thing: a report built from the CSV would break when
someone re-ran it as Excel, and any future automation would have to ask which
button was pressed. One registry, two writers, one output shape.

Concretely: `export.server.js` maps rows to a **format-neutral** structure —
`{ header, value, href? }` per cell — and hands it to either writer. `csv.js`
ignores `href`; `xlsx.js` uses it. Neither writer knows what a submission is, and
neither decides what the columns are.

## 4. Folder layout

`export/` is a **capability folder**, not a domain one: the two existing features
(`logo-upload/`, `product-request/`) are things the store does, while this is one
mechanism — "turn rows into a file the merchant downloads" — that several
subjects will want. The generic half of it sits at the top; each subject gets its
own sub-folder beneath.

```
app/features/export/
  lib/
    csv.js              # SHARED. RFC 4180 writer + the D9 guards. Pure, no imports.
    xlsx.js             # SHARED. exceljs wrapper — same input as csv.js, plus hyperlinks
    format.js           # SHARED. Subject-agnostic values: ISO dates, cents, list joining
  ui/
    DownloadButton.jsx  # SHARED. fetch -> blob -> <a download>, busy + error state (D8)
  submissions/
    config/
      columns.js        # THE registry: per-form column lists + the combined profile
    lib/
      format.js         # submission-specific: the attachment object, email + order status
    server/
      db.server.js      # getSql + table name, same shape as product-request/server/db.server.js
      query.server.js   # shop-scoped, filtered read
      export.server.js  # rows -> { filename, csv }
      order-status.server.js   # PHASE 5 ONLY — Shopify payment/fulfilment lookup
    ui/
      ExportButton.jsx  # format chooser + wraps DownloadButton with URL and params
app/routes/
  app.export.submissions.jsx   # loader -> text/csv (no action, no UI)
```

Nothing outside `export/` is created or moved. `product-request/` is read from
(`config/fields.js`, for labels) and otherwise left alone.

Adding the next export — `export/logos/`, say — is then a `config/`, a
`server/`, a thin `ui/` wrapper and one route. The CSV writer, the download
mechanics and the date/number formatting come for free.

**The rule for what goes up a level:** anything that has no idea what a
submission is. `csv.js` takes headers and rows. `DownloadButton` takes a URL and
a label. Everything that knows a `form_type` from a `draft_order_id` stays in
`submissions/`.

**Do not pre-abstract past those three files.** They are shared because they are
provably subject-agnostic today, not because a second export might arrive. A
shared `query.server.js` or a shared column registry would be guessing at a
schema nobody has written yet — let the second export show what it actually needs
in common, then lift that.

**Why a `lib/` folder appears here** when the other two features only have
`config/`, `server/` and `ui/`: the CSV writer and the formatters are pure,
isomorphic and have nothing to do with configuration. Calling a serialiser
"config" to avoid a folder would be worse than the folder.

`submissions/config/columns.js` must stay **isomorphic** — the same rule
`config/fields.js` states at the top of the file. The `ExportButton` may want a
column count; no server imports in there.

---

## 5. The columns

Header text comes from `labelFor()` in `features/product-request/config/fields.js`
wherever the key exists there, so the export cannot drift from the email and the
admin page — the whole reason that file exists. Two documented overrides:

- `variation_option` — `labelFor()` returns a **value-dependent** label
  ("Logo Colors" or "Thickness"). A column header cannot vary per row, so the
  export uses the static **`Color count / Thickness`**.
- Keys the legacy forms own (`address`, `address2`, `cartons`, `thickness`) are
  not in `fields.js` at all and get their labels from the registry.

### Core block — every form

`Submission ID` · `Form` · `Submitted` · `Name` · `Company` · `Email` · `Phone` ·
`Customer account email` · `Customer ID` · `Product` · `Product handle` ·
`Product ID` · `Product URL` · `Attachment name` · `Attachment URL` ·
`Email status` · `Order status` · `Draft order` · `Draft order created` ·
`Order` · `Payment status` · `Fulfillment status`

- `Form` — the friendly label (`Shipping Info` / `Quote Request` /
  `Request Quote New`), from the same map the page's badge uses.
- `Submitted`, `Draft order created` — **ISO 8601 UTC** (`2026-09-16T14:03:22Z`).
  Not `toLocaleString()`: a locale string is ambiguous between viewers and sorts
  as text.
- `Email status` — `true`/`false`/`pending` → `Sent` / `Failed` / `Pending`. All
  75 live rows are `true`; the other two states exist in code (`pending` is what
  `insertSubmission()` writes before the send).
- `Product URL` is the storefront page, stored as-is. No admin URL column — D12.
- `Draft order` and `Order` are the **numbers** (`#D1361`, `#2044`), not links.
- `Order status` is ours; `Payment status` and `Fulfillment status` are
  Shopify's, read live at export time (D6). All three blank for the two legacy
  forms, and the last two blank for any row with no order yet.
- `Attachment name` — `media_name`, falling back to `payload.attachment.name`
  **only when non-empty** (§1.2.4). `Attachment URL` is `media_url`, or
  `Upload failed — emailed only` when a name exists without one (D13).
- Both URL columns are **plain text**, not `=HYPERLINK()` — D12.

### Address block

`Street` (`street` ‖ `address`) · `Apt / Suite` (`apt` ‖ `address2`) · `City` ·
`State` · `ZIP / Postal Code` · `Country` (new form only)

### Product block

`Type of Mat` · `Size` (`variant_id`, a title, not an id) ·
`Unit price at request` (`variant_price` cents → `$87.00`) · `Quantity` ·
`Thickness` (`shipping_form` only) · `Color count / Thickness`
(`variation_option`) · `Base Mate Color` · `Logo Color Options` (`logo_colors`,
string **or** array → joined with `; `) · `Logo Orientation` · `Logo Edging` ·
`Logo Corners`

### Product options block — new form

`Surface` · `Style` · `Backing` · `Border` · `Pattern` · `Line 1` … `Line 5`

### Coin block — new form

`Coin Quantity` · `Coin Diameter` · `Coin Thickness` · `Coin Metal` · `Coin Shape`

### Delivery block

`Loading Dock` · `Liftgate` · `Cartons` (`shipping_form` only)

### Notes and identifiers

`Comments / Special Instructions` · `Variant GID` · `Base variant GID` ·
`Variant product ID` · `Other fields`

Single-form exports emit only that form's blocks (Shipping Info lands at ~28
columns). The combined export is ~60 columns wide, most of them sparse — which is
the honest shape of three different forms in one sheet.

---

## 6. Phases and tasks

### Phase 0 — Prove the download works in the iframe ⬜

Half an hour, and it decides D8. **Nothing else is worth writing until this
passes.**

- **0.1** Temporary button on `/app` that `fetch`es a route returning two
  hard-coded CSV lines, and triggers the blob download.
- **0.2** Load it in the **real embedded admin** (`admin.shopify.com/store/…`),
  not `localhost` standalone — the sandbox attributes are the whole question.
- **0.3** Confirm the file lands with the right name and opens in Excel.
- **0.4** If it fails: record the exact browser error here, then design the
  signed-URL fallback before continuing. Do not carry on hoping.
- **0.5** Revert the spike. It is a probe, not the feature.

### Phase 1 — Pure core: registry, formatters, both writers ⬜

No I/O, no Remix, no database. Runnable and checkable with `node`.

- **1.0** Define the **format-neutral cell** first (D15): `{ value, href? }`, with
  the header list alongside. Both writers take this and nothing else. Getting this
  shape agreed before either writer is written is what stops the two formats
  drifting apart later.
- **1.1** `export/lib/csv.js` — `toCsv(headers, rows)`. RFC 4180 quoting, CRLF
  records, UTF-8 BOM, and all three D9 guards. Ignores `href` entirely.
  **Shared** — it must never import anything that knows what a submission is.
- **1.1b** `export/lib/xlsx.js` — `toXlsx(headers, rows)` via `exceljs`. Same
  input as `toCsv`; writes `href` as a cell hyperlink
  (`{ text, hyperlink }`). One sheet, named for the form. Returns a Buffer.
  **Write every cell as a string type** — do not let the library infer, or
  `#D1361` and ZIP codes with leading zeros get mangled.
  `npm i exceljs` is the only dependency this feature adds.
- **1.2** `export/lib/format.js` — the subject-agnostic formatters: `formatDate`
  (ISO 8601 UTC), `formatCents` (reuse the logic already in `fields.js`),
  `formatList` (string **or** array → `; `).
- **1.3** `export/submissions/lib/format.js` — the ones that know this data:
  `formatAttachment` (object → name, empty name → blank), `formatEmailStatus`,
  `formatOrderStatus`.
- **1.4** `export/submissions/config/columns.js` — the registry from §5: one
  entry per column, `{ key, header, from, format }`, plus `COLUMNS_FOR(formType)`
  and `COMBINED_COLUMNS`. Headers pull from `labelFor()` with the two documented
  overrides.
- **1.5** `Other fields` (D4) — the leftover collector, driven by the set of keys
  the registry consumed, exactly like `groupPayload()`'s leftovers.
- **1.6** Checks: a value of `=cmd|' /c calc'!A0` comes out prefixed **in CSV**
  and is an inert text cell **in XLSX**; a comment containing `\r\n` stays one
  record; `["Black","Charcoal"]` and `"Black"` both render; `"8700"` → `$87.00`;
  `{name:""}` → blank; a key absent from the registry appears in `Other fields`;
  a `media_name` with no `media_url` yields `Upload failed — emailed only`; no
  URL column ever comes out starting with `=`.
- **1.6b** **The D15 check — run both writers over the same input and diff the
  headers and the visible values.** They must be identical; only the hyperlink
  properties may differ. This is the test that keeps the two formats one feature
  instead of two.

### Phase 2 — Server read and assembly ⬜

- **2.1** `export/submissions/server/db.server.js` — `getSql()` + the table name,
  mirroring `features/product-request/server/db.server.js`. **Do not import from
  `app/lib/supabase.server.js`** beyond what that pattern already does; that file
  is frozen.
- **2.2** `export/submissions/server/query.server.js` —
  `listForExport(shop, { formType, search })`.
  Shop-scoped (non-negotiable — one store must never export another's rows),
  `order by created_at desc`, search re-applied over the same six fields the UI
  searches, `form_type` filter when not `all`.
- **2.3** A **hard row cap** (10,000) with the reason in a comment: the whole file
  is built in memory in a serverless function. 75 rows today; the cap is what
  stops a future 50k-row store turning an export into an OOM. Log when it trips.
- **2.4** `export/submissions/server/export.server.js` —
  `buildExport(rows, { formType, format, storeHandle })` →
  `{ filename, contentType, body }`. Picks the registry profile, maps rows to the
  1.0 neutral cells, then serialises through `csv.js` **or** `xlsx.js`. The
  mapping runs once and is shared; `format` only chooses the writer.
- **2.5** Filename: `form-submissions-<form>-YYYY-MM-DD.<csv|xlsx>`
  (`form-submissions-all-2026-09-17.csv`). Dated, so two downloads do not
  overwrite each other in the Downloads folder.
- **2.6** `format` is validated against an allowlist of exactly `csv` and `xlsx`,
  defaulting to `csv`. Never interpolate it into the filename or the content type
  unchecked.

### Phase 3 — Route and button ⬜

- **3.1** `app/routes/app.export.submissions.jsx` — loader only.
  `authenticate.admin(request)`, read `form` / `q` / `format` from the URL, call
  2.2 and 2.4, return the body with the content type 2.4 reports
  (`text/csv; charset=utf-8` or
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) and
  `Content-Disposition: attachment; filename="…"`.
- **3.2** Failures return a **JSON error**, not a half-written file. A truncated
  spreadsheet that looks complete is worse than a visible failure.
- **3.3** `export/ui/DownloadButton.jsx` — the shared half: Polaris `Button` with
  `ExportIcon`, the D8 fetch → blob → `<a download>` dance, own busy state, own
  error `Text` in place. Props are a URL, a label and nothing else. The blob must
  take its type from the **response**, not a hardcoded string, or the `.xlsx`
  saves as something Excel refuses to open. **No Polaris `Toast`**: that needs a
  `Frame`, and `app.jsx` renders the App Bridge `AppProvider` without one — the
  same constraint `DraftOrderAction.jsx` records.
- **3.3b** `export/submissions/ui/ExportButton.jsx` — the **format chooser**, then
  the download. A Polaris `Popover` opened by the Export button, holding a
  two-option `ChoiceList` and a confirm action:

  > ⦿ **CSV** — for Excel, Numbers, or other spreadsheet programs
  > ○ **Excel (.xlsx)** — with clickable links

  Wording deliberately echoes Shopify's own export dialog, so it reads as part of
  the admin rather than as this app's invention. On confirm it builds
  `/app/export/submissions?form=…&q=…&format=…` and hands it to `DownloadButton`.

  **`Popover`, not Polaris `Modal`** — that component is deprecated in favour of
  the App Bridge Modal API, and a two-line choice does not warrant either. Default
  to CSV, and remember the last choice in `localStorage`: whoever exports weekly
  wants the same format every week.
- **3.4** Self-contained by design: dropping `<ExportButton form={formType}
  q={search} count={filtered.length} />` into the filter row is the **entire**
  integration with the frozen file — one import, one element. The format chooser
  lives inside the component, so adding it costs the frozen file nothing.
- **3.5** Edit `app/routes/app._index.jsx`: add the import and place the button in
  the existing `InlineStack` beside the `Select`.
- **3.6** **Re-bless** `docs/logo-upload/baseline.sha256` for
  `APP:app/routes/app._index.jsx` **in the same commit**, with a comment saying
  what changed and why — the convention every previous frozen edit followed.
  Leave `save_shipping_calls` alone (§2.1).

### Phase 4 — Verification against live data ⬜

Against the real 75 rows, not fixtures.

- **4.1** Export **All forms**: 75 data rows + 1 header. Every row's `Form`
  column populated; no `[object Object]`; no `undefined`; no `$NaN`.
- **4.2** Export each form type alone: 71 / 3 / 1 rows, and only that form's
  blocks present.
- **4.3** The three `request_quote_new` rows show all three `Order status`
  values, and `#D1361` / `#D1372` / `#2044` appear in the `Draft order` /
  `Order` columns.
- **4.4** Address columns are populated for **all three** forms — the §1.2.1
  synonym trap.
- **4.5** Open the **CSV** in Excel **and** Google Sheets: accents and `3' x 4'`
  intact (the BOM), the CRLF comment stays in one cell, no cell renders as a
  formula.
- **4.5a** Open the **XLSX** in Excel: `Product` and `Attachment name` are
  clickable and land on the right page/file; `#D1361` and any leading-zero ZIP are
  still text, not mangled into numbers; the injection sample is inert. Then
  **export the same filter as both formats and compare** — identical headers,
  identical visible values (D15, 1.6b).
- **4.5b** **Click both links**, from the exported file, in both apps: a
  `Product URL` and an `Attachment URL`. Confirm the attachment opens **without**
  being logged into the admin (it is a public CDN URL), and that the one row with
  a failed upload reads `Upload failed — emailed only` rather than an empty cell.
  Expect the links to be plain text in Excel — that is D12, not a bug.
- **4.6** Search + filter parity: type a term, note the count the page shows,
  export, confirm the row count matches.
- **4.7** `bash scripts/check-no-break.sh` — every hash green, every marker green
  except the known `save_shipping_calls`. `npm run build` and `npm run lint`
  clean.
- **4.8** The two legacy forms' pages, emails and inserts are untouched —
  nothing in this feature writes, and no route of theirs was edited.
- **4.9** *(after Phase 5)* Order `#2044` carries a real `Payment status` and
  `Fulfillment status`; the `#D1361` row has an `Order status` of
  `Draft created` with **both Shopify columns blank** — it has no order yet, so
  there is nothing to look up. Then **break it on purpose**: make the lookup
  throw, and confirm the export still downloads with those two columns empty
  (5.3).

### Phase 5 — Live Shopify order status ⬜ IN SCOPE (Q1 answered "both")

Two columns, `Payment status` and `Fulfillment status`, fed by one lookup. Purely
additive — nothing in Phases 1–4 changes for it, which is why it stays a separate
phase rather than being folded into Phase 2.

- **5.1** `export/submissions/server/order-status.server.js` — one batched
  `nodes(ids: [...]) { ... on Order { displayFinancialStatus
  displayFulfillmentStatus } }`, chunked at 250 ids.
- **5.2** Two columns: `Payment status`, `Fulfillment status`.
- **5.3** **Best-effort, never fatal.** One try/catch around the whole thing;
  on failure the two columns come out blank and the export still downloads —
  the same contract `syncDraftOrderStatuses()` holds for the list page.
- **5.4** Only queries rows that actually have an `order_id` (1 row today), so
  the common export makes no Shopify call at all.

### Phase 6 — Deferred, not in scope ⬜

Written down so they are not rediscovered as "missing":

- Date-range filter on the export.
- **One sheet per form** in the XLSX — now that the workbook exists, "All forms"
  could be three sheets instead of one union table. Revisit only if the union
  columns prove unwieldy in real use; that is a usage question, not a design one,
  and D15 would need restating for it.
- Streaming for large exports (only past the 2.3 cap).
- A scheduled/emailed export.
- Exporting attachments themselves. **Both formats carry links, not files** —
  worth saying out loud, because "export the submissions" can be heard as "give
  me the artwork too".

---

## 7. Risks

1. **The iframe download (D8).** The one genuine unknown. Phase 0 exists solely
   to retire it before any code depends on the answer. **Test it with a binary
   body, not just text** — an `.xlsx` blob is where a download path that mangles
   encoding shows up, and a CSV-only spike would pass and tell you nothing.
2. **`exceljs` is the first dependency this app adds for a feature.** It is a
   build-time and cold-start cost on Vercel for a format some merchants will
   never pick. Check the built function size after 1.1b. If it is material, the
   fallback is to keep CSV dependency-free and load the XLSX writer lazily
   (`await import("exceljs")` inside the writer) so it never enters the CSV path.
3. **The frozen-file edit.** `app._index.jsx` is live code for all three forms.
   The edit is an import and one element, and the baseline must be re-blessed in
   the same commit or the guard fails for everyone afterwards.
4. **In-memory assembly on serverless.** Fine at 75 rows, wrong at 50,000. The
   2.3 cap is the guard; streaming is the answer if it is ever reached. XLSX is
   the heavier of the two here — the workbook is built in memory before a single
   byte is written.
5. **Label drift.** If the registry hard-codes header text instead of pulling
   from `labelFor()`, the export becomes a fourth place to update when a form
   field is renamed — the exact failure `config/fields.js` was created to end.
   (`logo_colors` was renamed to "Logo Color Options" as recently as 2026-09-16.)
6. **Two of the three forms have almost no rows.** `shipping_form` has **one**
   row and `request_quote_new` has **three**. Column mapping bugs for those forms
   will not show up as obviously wrong output — check them field by field against
   the detail page, not by eyeballing the file.
7. **`payload.attachment` looks authoritative and is not.** Rows exist with an
   `attachment` object whose `name` is empty. Trust `media_url`.
8. **The file hands out public links to customer artwork.** Every `media_url` is
   an unauthenticated `cdn.shopify.com` URL — anyone who receives the file can
   open the logos, admin access or not. **The XLSX makes this one click easier**,
   which is the point of it and also the reason to say so. Not a defect (the same
   URLs are already in the admin list), but the exported file is a
   **redistribution of those links** alongside names, emails and phone numbers.
   Worth one sentence to whoever will be emailing it around.
9. **Phase 5 puts a Shopify call on the download path.** Until now an export
   could only fail for reasons inside our own data; now a slow or unreachable
   Shopify can affect it too. 5.3 is what contains that — one try/catch, blank
   columns, export still downloads — and 4.9 is the test that proves it. **Do not
   let the two status columns become a reason a merchant cannot get their
   data out.** Cheap in practice: only rows with an `order_id` are looked up,
   which is 1 row of 75 today, and an export with none makes no call at all.
9. **Exported links can go dead.** Deleting a submission deletes its Shopify file
   first, then the row — `deleteSubmissionAction` via
   `shopify-files-delete.server.js`. A CSV from last month can therefore point at
   artwork that no longer exists. The export is a **snapshot**, not a mirror;
   nothing to fix, but do not let anyone treat an old export as an archive of the
   files themselves (see Phase 6 — exporting the artwork is a different feature).

---

## 8. Related

- `docs/PLAN-draft-orders.md` — where `draft_order_*` / `order_*` came from, and
  the separation rules this plan follows.
- `docs/PRODUCT-REQUEST-FORM-payload.md` — the new form's field contract:
  `variant_price` in cents, `logo_colors` repeating, `variation_option` not being
  a thickness.
- `docs/HANDOVER-eps-upload.md` §12–13 — the two legacy forms and the original
  submissions viewer.
- `app/features/product-request/config/fields.js` — the label/order source of
  truth the export must not fork.
