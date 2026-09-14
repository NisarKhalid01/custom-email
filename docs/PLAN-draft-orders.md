# Draft Orders from Product Request submissions — plan

**Written:** 2026-09-12 · **Decisions settled:** 2026-09-14

## Progress

| Phase | State |
|---|---|
| **T** — theme sends a real variant | ✅ **verified live** — a submission carried a real `variant_gid` |
| **0** — scopes | ✅ **complete** — proven by a real draft order (#D1361) |
| **1** — data layer | ✅ **done 2026-09-15** — migration applied, 13/13 checks pass |
| **2** — draft order creation | ✅ **working against live Shopify** (#D1361, 2026-09-15) |
| **3** — admin UI | ✅ **done** — list + detail page (3.7) |
| **4** — completion tracking | ✅ **built 2026-09-15**, 6/6 checks · 4.4 webhook deferred |
| **5** — email | ⬜ waiting on requirements |

Keep this table current as each phase lands — it is the first thing anyone
picking this up will read.

Turn a `request_quote_new` submission into a Shopify **draft order** from the
app's submissions list, then track it through to a completed order.

Target behaviour in the Actions column:

| Row state | Shows |
|---|---|
| `draft_order_id` is null | **Create Draft Order** button |
| draft set, `order_id` null | info badge **Draft Created** + link to the draft order |
| `order_id` set | success badge **Order Completed** + link to the order |

---

## Separation rules for this work

Same rules that governed the form route. Everything new lives in
`app/features/product-request/`; the two legacy forms and their routes are not
touched at all.

**Frozen files this work MUST touch** (`docs/logo-upload/baseline.sha256`,
verified by `scripts/check-no-break.sh`) — each needs re-blessing in the same
commit:

- `app/routes/app._index.jsx` — the Actions cell and the new status column live
  here. Unavoidable: that is where the table is.
- `app/routes/app.submissions.$id.jsx` — only if we also show status on the
  detail page (Phase 3b, optional).

**Not frozen, safe to edit:** `shopify.app.toml`.

**Everything else is new:** the Shopify draft-order client, the action route, the
DB module, and the UI component.

The new action does **not** extend `app._index.jsx`'s action. That route already
delegates to `deleteSubmissionAction`; turning it into an intent dispatcher would
mean editing a frozen file for no gain. The button posts to its own route with an
explicit `action:` URL, exactly as a `useFetcher` allows.

---

## Phase T — theme dependency ✅ BUILT (2026-09-14), untested in a browser

**The app cannot build a correct draft order until the form submits a real
variant.** The theme side is now done and reviewed — uncommitted on
`feature/new-request-form`. What remains is a browser test (see Risks 2).

Previously `variant_id` was a size **title** (`"3' x 4'"`), deduplicated across
the linked collection's products — so it did not identify a variant, and the same
title existed on several products at different prices.

The theme now mirrors the PDP
(`sections/custom-products-main-free-quote-multi-color.liquid:1199-1240` and
`assets/nws-high-variant.js:200-245`), where three inputs resolve one variant:

1. **Colour count** — `custom.variation_value` selects WHICH linked product,
   via a `data-set` attribute the size list is filtered by.
2. **Size** — selects the variant within that product.
3. **Quantity** — swaps to a sibling variant through the `price_for_2` / `_3` /
   `_11` / `_26` metafields. Highest qualifying tier wins, checked descending.
   This changes the variant ID itself, not just a displayed price.

**New payload fields the app will read:**

| Field | Meaning |
|---|---|
| `variant_gid` | `gid://shopify/ProductVariant/…` — final, tier-applied. **This is what the draft order uses.** |
| `variant_price` | Unit price in cents at submission. **Audit only** — see below. |
| `variant_base_gid` | Pre-tier variant, for audit. **This is the size `<select>` itself**, so it arrives as a gid, not a bare id |
| `variant_product_id` | The linked product owning the variant |

`variant_id` is unchanged as a *contract* — still the size title, still displayed
as "Size". Renaming it would break every stored row.

**But it is no longer the select's own value.** The original spec asked for two
things that cannot both hold — option values as variant ids, *and* `variant_id`
submitting a title. The select is now `name="variant_base_gid"` with gid values,
and `variant_id` is a hidden input the JS writes. Reviewed and accepted: gid
values are unique, so a draft restore cannot land on another linked product's
identically-titled size, which title-valued options did silently.

**Consequence to guard for:** if the JS fails before `resolveVariant()` runs, the
select still submits `variant_base_gid` while all four derived fields stay empty.
`variant_base_gid` present + `variant_gid` empty is the detectable signature of a
broken client — see Phase 2.2.

Also new but payload-neutral: a `price_summary` block renders the resolved price
to the shopper. It is a display-only branch with no input, so it adds no key.

**These live in the `payload` jsonb — no migration needed for them.** Only the
draft-order columns in Phase 1 need schema changes.

**The app must not trust `variant_price`.** It passes `variant_gid` to
`draftOrderCreate` and lets Shopify price the line. A client-submitted price is
not authoritative, and prices change between quote and order anyway.

---

## Decisions — settled

### D1. What goes on the draft order line item ✅

**A real product variant.** `variant_gid` + `quantity`, priced by Shopify. The
custom/placeholder line item idea is dropped.

Consequence worth knowing: because the quantity tier is resolved **at submission
time**, the line is bound to whichever tier variant applied then. If staff later
change the quantity on the draft order, Shopify will **not** re-tier it — the
line stays on the submitted variant. Flag this to whoever works the drafts.

Every other form field still reaches the draft order as custom attributes plus a
readable note (Phase 2.3), so nothing is lost by moving off a custom line item.

### D2. How "Order Completed" is detected ✅

**Poll on list load** — least code, no guessing. One batched GraphQL
`nodes(ids: [...])` query for rows that have a `draft_order_id` but no
`order_id`, reading `DraftOrder.order`.

This reads the authoritative link from Shopify rather than inferring one, needs
no webhook registration or HMAC verification to maintain, and self-heals if an
event is ever missed. A `draft_orders/update` webhook is the instant-update
version and can be added later (Phase 4b) without touching the schema.

### D3. Deleting a submission that has a draft order ✅

**Block it** once `draft_order_id` is set, with a message telling the user to
cancel the draft order in Shopify first. Cheaper and safer than cascading a
delete into Shopify, and leaves no orphans.

---

## Phase 0 — Scopes

The app currently requests `read_files,write_files` only. Draft orders are
completely inaccessible today; every call would 403.

- **0.1** Add `write_draft_orders`, `read_orders` and `read_products` to `scopes`
  in `shopify.app.toml`. `write_draft_orders` covers creating and reading drafts;
  `read_orders` is needed to see the resulting order and its name.

  `read_products` is for the 2.2 belongs-to check. An earlier draft of this plan
  said it was unnecessary because the theme resolves the variant — that was
  wrong: confirming a submitted gid belongs to `variant_product_id` means
  reading the product. Existence alone is free (`draftOrderCreate` rejects an
  unknown variant), but a *tampered yet valid* gid would otherwise go unnoticed
  until a human spotted the wrong line item.

  **Batch it now.** Every scope change costs another merchant re-approval
  (0.3), so adding this later means a second round trip for one query.
- **0.2** ~~`shopify app deploy`~~ — **not applicable, and it fails.** Discovered
  2026-09-15: `shopify.app.toml`'s `client_id` is `7cc30be0…`, an app in an
  organization this account is not a member of, so `deploy` returns 403 *"You are
  not a member of the requested organization"*. Switching accounts does not help
  — the client_id is what is wrong.

  The app that actually runs is **`21daae00…`** (`.env SHOPIFY_API_KEY` →
  `shopify.server.js:11`). `SCOPES` is unset and
  `unstable_newEmbeddedAuthStrategy` is on, so the live app's granted scopes come
  from its **Dev Dashboard configuration**, not from the toml.

  ✅ **Done** — scopes set in the Dev Dashboard on `21daae00…`.

  ⚠️ Do NOT "fix" the toml by pointing `client_id` at `21daae00…` and deploying:
  `include_config_on_deploy = true` pushes the whole block, and this file's
  `name` / `handle` / `redirect_urls` belong to the other app. The live handle is
  `image-upload-new`; the toml says `custom-email-3`, which would break
  `/apps/image-upload-new/app`. Reconciling the two apps is its own task
  (TASKS.md B3). Full reasoning is in the `[access_scopes]` comment.
- **0.3** ⚠️ **The merchant must re-approve the app.** Until they do, the new
  scopes are not granted and draft-order calls fail with 403. The app already has
  a `webhooks.app.scopes_update` route, so the grant change is observable.
- **0.4** ✅ Confirmed by a successful `draftOrderCreate` (#D1361).

  ⚠️ **Do NOT use the `Session.scope` column to check this.** It still reads
  `write_files, write_products, write_content` even though draft orders demonstrably
  work. With `unstable_newEmbeddedAuthStrategy` the app uses token exchange, minting
  a token per request with scopes resolved then; `Session.scope` holds whatever the
  ORIGINAL OAuth install recorded and is only refreshed by the `scopes_update`
  webhook. It gives a false negative. A successful mutation is the evidence.

**0.3 and 0.4 still gate Phase 2.** Phase 1 is pure database work and does not
depend on either.

---

## Phase 1 — Data layer ✅ DONE (2026-09-15)

**Landed:**

- `supabase/migrations/20260915000000_add_draft_order_to_form_submissions.sql`
  — applied to the live database. 69 rows before, 69 after, none backfilled.
- Five functions in `app/features/product-request/server/submissions.server.js`:
  `getSubmissionForDraft`, `attachDraftOrder`, `attachOrder`,
  `listOpenDraftOrderIds` (plus the existing insert/status pair).

**Verified, 13/13:** the legacy `insertFormSubmission` path still inserts with
the new columns present; `getSubmissionForDraft` returns null for a foreign shop
and for a malformed uuid without throwing; both attach functions refuse a second
call and preserve the original value; a completed draft drops out of the open
sweep. Build, lint and all 16 frozen-file hashes clean.

**For Phase 2 to honour:** `attachDraftOrder` returning `false` means a draft
already existed — which means the Shopify mutation that just ran created an
**orphan**. Log the new gid; the logs are the only way back to it.



- **1.1** Migration `..._add_draft_order_to_form_submissions.sql`, additive and
  nullable, same shape as the customer-identity migration:
  - `draft_order_id text` — GID, `gid://shopify/DraftOrder/123`
  - `draft_order_name text` — `#D123`, for display
  - `order_id text` — GID of the completed order
  - `order_name text` — `#1001`
  - `draft_order_created_at timestamptz`
  - partial index on `(shop, draft_order_id) where draft_order_id is not null`

  No columns for the variant fields — they arrive inside `payload`.

  **Decided, do not re-litigate:** the theme agent suggested promoting the five
  variant fields to real columns in this same migration, since jsonb is
  queryable but unindexed. Declined. The draft-order action reads *one row by
  id*, so an index buys nothing, and widening `insertSubmission()` adds surface
  for a query need that does not exist. Revisit only if filtering or sorting by
  variant is actually wanted.
- **1.2** Extend `app/features/product-request/server/submissions.server.js`:
  - `attachDraftOrder(id, { draftOrderId, draftOrderName })`
  - `attachOrder(id, { orderId, orderName })`
  - `getSubmissionForDraft(id, shop)` — shop-scoped read, so one store cannot
    address another's row by guessing a uuid (same rule as
    `getSubmissionForDelete`).
- **1.3** **Idempotency guard.** `attachDraftOrder` must write with
  `where id = $1 and draft_order_id is null` and report whether it updated a row.
  A double-clicked button must not create two draft orders. The route checks the
  column *before* calling Shopify and the update enforces it *after* — belt and
  braces, because the Shopify call is not transactional with the database.
- **1.4** Verify existing rows are untouched and both legacy routes still insert
  (same check used for the customer-identity migration).

---

## Phase 2 — Draft order creation ✅ BUILT (2026-09-15)

**Landed:** `server/address.server.js`, `server/draft-order.server.js`,
`app/routes/app.product-request.draft-order.jsx`. 28/28 logic checks; build,
lint and all 16 frozen hashes clean.

**⚠️ Never exercised against Shopify.** `write_draft_orders` is still not
granted, so `createDraftOrder` returns 403 today — the route detects that
specific failure and says "re-approve the app" rather than "try again". And no
stored row has a `variant_gid`, so every existing submission refuses with
`no_variant`. Both are expected; neither is a defect in this code.

**2.4 resolved against real data.** Stored rows carry `country = "United States"`
and `state = "District of Columbia"` — display NAMES, while `MailingAddressInput`
on 2025-01 takes codes and has no string fallback. An unmapped name is not
rejected, it is silently dropped, producing a draft order with no country that
cannot be rated for shipping. Country codes come from the runtime's ICU data via
`Intl.DisplayNames` (plus an alias map); provinces from a US/CA table. Anything
unmapped is **omitted and reported**, never guessed.

**The guard worth keeping:** `variant_base_gid` present + `variant_gid` empty →
`CLIENT_BROKEN`, refused and logged distinctly. It must never fall back to
`variant_base_gid`, which is the PRE-TIER variant and would mis-price any order
of 2 or more.



- **2.1** New `app/features/product-request/server/draft-order.server.js` — the
  only module that talks to the Shopify draft-order API. Takes an `admin`
  GraphQL client from `authenticate.admin(request)`; does not build its own
  credentials (unlike `shopify-files.server.js`, which needs client-credentials
  because it runs on a storefront route — this one runs in the embedded admin,
  where a session already exists).
- **2.2** `draftOrderCreate` mutation with:
  - `lineItems: [{ variantId: <variant_gid>, quantity }]` — priced by Shopify
  - **guard:** if `variant_gid` is missing (a submission taken before the theme
    change, or an unresolvable one), refuse with a clear message rather than
    inventing a line item. Older rows simply cannot become draft orders.
  - **log the broken-client case distinctly.** `variant_base_gid` present while
    `variant_gid` is empty means the form's JS failed before `resolveVariant()`
    ran — the shopper picked a size and the derived fields never got written.
    That is a client bug to fix, not a shopper mistake, and it must not be
    silently lumped in with "no variant". Do **not** fall back to
    `variant_base_gid`: it is the pre-tier variant, so quietly using it would
    put the wrong price on any order of 2 or more.
  - **re-validate server-side.** Confirm the gid exists and belongs to
    `variant_product_id` before creating the draft. Everything above was
    resolved in a browser.
  - `email` from the submission
  - `purchasingEntity: { customerId }` when `customer_gid` is present, so the
    draft attaches to the real customer account
  - `shippingAddress` mapped from `street / apt / city / state / zip / country`
  - `note` — human-readable summary
- **2.3** Field mapping module, reusing `config/fields.js`. `groupPayload()`
  already produces the form's own sections and labels, so the draft order's note
  and custom attributes can be generated from the same source the email and the
  admin page use. No fourth place to update when a form field changes.
- **2.4** Country/province mapping. The form submits `country` as a **display
  name** ("United States") and `state` as a **province name** ("Colorado"), but
  `MailingAddressInput` wants `countryCode`/`provinceCode`. Needs a lookup, or
  pass names and let Shopify resolve them — verify which actually works before
  relying on it.
- **2.5** Error handling: surface `userErrors` from the mutation to the UI rather
  than a generic failure. A draft order rejected for a bad address should say so.
- **2.6** New route `app/routes/app.product-request.draft-order.jsx` — action
  only, no UI. Authenticates, re-reads the submission shop-scoped, calls 2.1,
  persists via 1.2, returns JSON.

---

## Phase 3 — Admin UI ✅ BUILT (2026-09-15)

**Landed:** `ui/DraftOrderAction.jsx` (new) plus a frozen edit to
`app/routes/app._index.jsx` — loader now returns `storeHandle`, a "Draft order"
column was added, and the cell renders the action only for `request_quote_new`.
The two legacy forms show "—" and are otherwise untouched. Baseline re-blessed
`5c49aeda…` -> `4b17145a…`; all 16 frozen hashes pass.

The button posts to its OWN route, so `export const action = deleteSubmissionAction`
in that frozen file is unchanged.

**Untested in a browser.** It cannot show anything but the button today: no row
has a `draft_order_id`, and creating one needs the scopes.



- **3.1** New `app/features/product-request/ui/DraftOrderAction.jsx`, modelled on
  `DeleteRowAction.jsx`: own `useFetcher`, own busy state, own error display,
  posting to the Phase 2.6 route with an explicit `action:` URL.
- **3.2** Renders by state — button / **Draft Created** badge / **Order
  Completed** badge, per the table at the top.
- **3.3** Admin deep links, reusing the `storeHandle` pattern already in
  `app.submissions.$id.jsx`:
  - draft — `https://admin.shopify.com/store/<handle>/draft_orders/<numeric id>`
  - order — `https://admin.shopify.com/store/<handle>/orders/<numeric id>`
  - the numeric id is the last segment of the GID.
- **3.4** **Frozen edit:** `app/routes/app._index.jsx` — pass `storeHandle` from
  the loader, render `<DraftOrderAction>` in the Actions cell, and add the
  draft/order number column. Re-bless `baseline.sha256` in the same commit.
- **3.5** Gate on form type: only `request_quote_new` rows get the action. The two
  legacy forms render exactly as they do today.
- **3.6** Block the delete action when `draft_order_id` is set (D3), with the
  "cancel the draft in Shopify first" message.
- **3.7** ✅ **DONE (2026-09-15)** — `DraftOrderAction` now also renders on
  `app/routes/app.submissions.$id.jsx`, inline with the Sent/Failed badge, since
  both answer the same question: what has happened to this request so far.
  Gated on form type; the two legacy forms render exactly as before. Baseline
  re-blessed `be2fe9bf…` -> `5aa4fc98…`.

---

## Phase 4 — Completion tracking ✅ BUILT (2026-09-15)

**Landed:** `fetchDraftOrderStatuses()` in `draft-order.server.js` (one batched
`nodes` query) and `server/status-sync.server.js` holding the sweep. The frozen
`app._index.jsx` gained one import and one `await` in its loader; baseline
re-blessed `4b17145a…` -> `875c5e6e…`.

**6/6 checks against the real database**, including the two that matter: a
Shopify 403 — today's actual state — is swallowed and the listing still renders,
and a shop with no open drafts makes **zero** Shopify calls, which is what makes
this acceptable on every page load.

**The contract:** this runs in front of a listing the two LEGACY forms also
depend on, so it swallows every failure by design. A Shopify outage, a missing
scope or a revoked token degrades to "shows the last known status", never to a
broken page. `attachOrder` is write-once, so two concurrent loads cannot both
claim the same completion.



- **4.1** Batched status read per D2, in
  `app/features/product-request/server/draft-order.server.js`: given the open
  draft GIDs on the current page, one `nodes(ids: [...])` query reading
  `DraftOrder { id status order { id name } }`.
- **4.2** Called from the list loader; any draft that now has an order is written
  back via `attachOrder` so the next load needs no lookup.
- **4.3** Non-fatal. A Shopify outage must degrade to "shows the last known
  status", never to a broken submissions list — same rule as the product-image
  fetch already in the detail loader.
- **4.4 (later)** `draft_orders/update` webhook for instant updates. Additive;
  the polling path stays as the self-healing fallback.

---

## Phase 5 — Email confirmation

**Details to come from the client** — what is sent, to whom, and at which
transition (draft created? order completed? both?).

- **5.1** Confirm triggers and recipients.
- **5.2** Build in `mailer.server.js`, reusing `groupPayload()` and the existing
  transport. No new credentials.
- **5.3** ⚠️ Shared Gmail quota still applies — all three forms plus this send
  through one account at ~500/day. Noted in `mailer.server.js`.

---

## Sequencing

**Phase T (theme) blocks Phase 2.** Phase 0 gates everything that talks to
Shopify. Phase 1 can be built and tested independently of both. Phases 2 → 3 → 4
are strictly ordered. Phase 5 is independent and can land any time after its
requirements arrive.

Phase T is built, so Phase 0 (needs a merchant action) and Phase 1 (pure DB) are
the live work and can run in parallel.

---

## Already done in the app repo — do not redo

The theme agent made two app-side changes alongside Phase T. Both reviewed:

- `app/features/product-request/config/fields.js` — `variation_option` now sorts
  before `variant_id` (the count picks the product, so the size reads
  unqualified the other way round); `variant_price` labelled "Unit price at
  request" and formatted from cents; `variant_gid` / `variant_base_gid` /
  `variant_product_id` added to `HIDDEN_KEYS` (stored, not printed). The
  `formatValue(value)` → `formatValue(value, key)` signature change has exactly
  one caller and it was updated.
- `docs/PRODUCT-REQUEST-FORM-payload.md` — the four fields plus a *resolved
  variant* section.

**No route change was needed.** `toPayload()` builds from every key in the body
and `PAYLOAD_STRIP` does not touch the variant fields, so all five already store.

## Known issue — unrelated guard failure

`scripts/check-no-break.sh` fails on `save_shipping_calls — expected 2, found 4`.
Not a regression: `quote-request-form-js.liquid` still has exactly 2, which is
what the marker's own comment says it guards. The other 2 are
`product-request-form.liquid`'s header comment naming both legacy routes.

The guard is what is wrong — `count_of()` greps the **whole theme recursively**
while the marker is scoped to one file. **Do not re-bless the count to 4:** that
would let a future deletion from `quote-request-form-js.liquid` be masked by
comment mentions elsewhere, so the marker would pass while the thing it protects
was gone. Fix by scoping that grep to the file it names. `check-no-break.sh` is
not frozen.

## Risks

1. **Scope re-approval** — needs a merchant action outside the codebase, now for
   three scopes. Plan around the delay.
2. **Phase T is untested in a browser.** Built and code-reviewed, not exercised.
   Before building 2.2, load an Olefin product, flip colour counts, push quantity
   past 11 and 26, and confirm a real submission carries a sane `variant_gid`.
   The tier path is the part that has never run.
3. **Submissions taken before Phase T** — including the existing test row — have
   no `variant_gid` and can never become draft orders. Accepted: they predate the
   feature. The UI must say so rather than failing obscurely.
4. **A broken client is indistinguishable from an old row unless 2.2 logs it.**
   `variant_base_gid` present + `variant_gid` empty is the signature. Never fall
   back to `variant_base_gid` — it is pre-tier, so it carries the wrong price for
   any quantity of 2 or more.
5. **Address mapping (2.4)** — country/province names vs codes is the most likely
   source of a rejected `draftOrderCreate`. Prove it with one real submission
   early.
6. **Idempotency (1.3)** — the Shopify call and the DB write are not atomic. If
   the mutation succeeds and the write fails, a draft order exists with no record
   of it. Log the GID before writing so it is recoverable from logs.
7. **Quantity tiers are frozen at submission** (D1) — staff changing quantity on
   a draft order will not re-tier the price.
