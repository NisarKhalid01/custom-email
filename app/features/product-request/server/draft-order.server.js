import { groupPayload } from "../config/fields.js";
import { buildShippingAddress } from "./address.server.js";

/**
 * Shopify draft orders for Product Request submissions.
 *
 * SERVER ONLY. The ONLY module that talks to the draft-order API.
 *
 * Takes an `admin` GraphQL client from `authenticate.admin(request)` rather than
 * minting its own token. Unlike `shopify-files.server.js` — which runs on a
 * storefront route with no session and therefore needs a client-credentials
 * exchange — everything here runs inside the embedded admin, where a session
 * already exists.
 *
 * ---------------------------------------------------------------------------
 * SCOPES
 * ---------------------------------------------------------------------------
 * Needs `write_draft_orders` (create) and `read_products` (the belongs-to check).
 * As of 2026-09-15 the live installation has `read_products` (implied by
 * `write_products`) but NOT the draft-order scopes — the merchant has not
 * re-approved yet, so `createDraftOrder` will fail with an access error until
 * they do. That is expected, not a bug in this module.
 */

/** Why a submission cannot become a draft order. */
export const CANNOT_DRAFT = Object.freeze({
  NOT_FOUND: "not_found",
  WRONG_FORM: "wrong_form",
  ALREADY_DRAFTED: "already_drafted",
  NO_VARIANT: "no_variant",
  CLIENT_BROKEN: "client_broken",
  BAD_QUANTITY: "bad_quantity",
  VARIANT_MISMATCH: "variant_mismatch",
});

/** Human-facing text for each refusal. Shown verbatim in the admin. */
const REASON_TEXT = {
  [CANNOT_DRAFT.NOT_FOUND]: "That submission no longer exists.",
  [CANNOT_DRAFT.WRONG_FORM]:
    "Only Product Request submissions can become draft orders.",
  [CANNOT_DRAFT.ALREADY_DRAFTED]: "A draft order already exists for this request.",
  [CANNOT_DRAFT.NO_VARIANT]:
    "This request predates variant recording, so there is no product to put on an order. Ask the customer to resubmit.",
  [CANNOT_DRAFT.CLIENT_BROKEN]:
    "This request recorded a size but not a priced variant — the storefront form failed while resolving it. Do not order from it; report it.",
  [CANNOT_DRAFT.BAD_QUANTITY]: "This request has no usable quantity.",
  [CANNOT_DRAFT.VARIANT_MISMATCH]:
    "The recorded variant does not belong to the recorded product. Refusing to build an order from it.",
};

export function reasonText(reason) {
  return REASON_TEXT[reason] ?? "This request cannot become a draft order.";
}

/** Shopify caps a draft order note at 5000 characters. */
const NOTE_LIMIT = 5000;
/** Groups worth pinning to the LINE ITEM — the manufacturing spec. */
const LINE_ITEM_GROUPS = new Set([
  "Product Details",
  "Product Options",
  "Coin Specification",
]);

/**
 * Decide whether a submission can become a draft order.
 *
 * Pure, so the route can call it before touching Shopify and the UI can call the
 * same rules to decide what to render. Returns null when it may proceed.
 *
 * @returns {string|null} a CANNOT_DRAFT reason
 */
export function draftBlockedReason(submission, formType) {
  if (!submission) return CANNOT_DRAFT.NOT_FOUND;
  if (submission.form_type !== formType) return CANNOT_DRAFT.WRONG_FORM;
  if (submission.draft_order_id) return CANNOT_DRAFT.ALREADY_DRAFTED;

  const payload = submission.payload ?? {};
  const gid = String(payload.variant_gid ?? "").trim();

  if (!gid) {
    // Two very different situations that look identical in the database:
    //
    //   base present, gid empty -> the form's JS died before resolveVariant()
    //     ran. A CLIENT BUG. Never fall back to variant_base_gid: it is the
    //     PRE-TIER variant, so using it would put the wrong price on any order
    //     of 2 or more.
    //   both empty -> the submission simply predates variant recording.
    return String(payload.variant_base_gid ?? "").trim()
      ? CANNOT_DRAFT.CLIENT_BROKEN
      : CANNOT_DRAFT.NO_VARIANT;
  }

  const quantity = Number.parseInt(payload.quantity, 10);
  if (!Number.isInteger(quantity) || quantity < 1) return CANNOT_DRAFT.BAD_QUANTITY;

  return null;
}

/** `gid://shopify/Product/123` or `123` -> `gid://shopify/Product/123`. */
function toProductGid(raw) {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  return v.startsWith("gid://") ? v : `gid://shopify/Product/${v}`;
}

async function graphql(admin, query, variables) {
  const res = await admin.graphql(query, { variables });
  const body = await res.json();
  if (body?.errors?.length) {
    // Top-level errors are transport/permission failures — a missing scope
    // surfaces here, not in userErrors, which is why they are reported apart.
    throw new Error(
      body.errors.map((e) => e.message).join("; ") || "GraphQL request failed",
    );
  }
  return body?.data;
}

/**
 * Confirm the recorded variant is real AND belongs to the recorded product.
 *
 * The gid was resolved in a browser, so it is a claim, not a fact. Existence
 * alone is free — `draftOrderCreate` rejects an unknown variant — but a
 * *tampered yet valid* gid would otherwise be priced and ordered with nobody
 * noticing until a human read the line item.
 *
 * @returns {Promise<{ok: true, variant: object} | {ok: false, reason: string}>}
 */
export async function verifyVariant(admin, { variantGid, productId }) {
  const data = await graphql(
    admin,
    `#graphql
      query PrVerifyVariant($id: ID!) {
        productVariant(id: $id) {
          id
          title
          displayName
          price
          product { id title }
        }
      }
    `,
    { id: variantGid },
  );

  const variant = data?.productVariant;
  if (!variant) return { ok: false, reason: CANNOT_DRAFT.VARIANT_MISMATCH };

  const expected = toProductGid(productId);
  // Only enforce when the submission recorded a product to compare against.
  // Older rows may not have one; that is a missing check, not a mismatch.
  if (expected && variant.product?.id && variant.product.id !== expected) {
    return { ok: false, reason: CANNOT_DRAFT.VARIANT_MISMATCH };
  }
  return { ok: true, variant };
}

/**
 * The readable summary that goes on the draft order's note.
 *
 * Built from `groupPayload()` — the same function the notification email and the
 * admin detail page use — so all three describe one submission identically and a
 * new form field cannot appear in two of them but not the third.
 */
export function buildNote(submission, payload) {
  const lines = [];
  for (const { heading, rows } of groupPayload(payload)) {
    lines.push(heading);
    for (const row of rows) lines.push(`  ${row.label}: ${row.value}`);
    lines.push("");
  }
  lines.push(`Quote request ${submission.id}`);
  if (submission.customer_gid) lines.push(`Customer ${submission.customer_gid}`);
  const note = lines.join("\n").trim();
  return note.length > NOTE_LIMIT ? `${note.slice(0, NOTE_LIMIT - 1)}…` : note;
}

/** The manufacturing spec, pinned to the line item so it rides onto the order. */
export function buildLineItemAttributes(payload) {
  const attrs = [];
  for (const { heading, rows } of groupPayload(payload)) {
    if (!LINE_ITEM_GROUPS.has(heading)) continue;
    for (const row of rows) {
      attrs.push({ key: row.label, value: String(row.value).slice(0, 255) });
    }
  }
  return attrs;
}

/**
 * Read the current state of several draft orders in ONE request.
 *
 * `DraftOrder.order` is the authoritative link to the order a draft was
 * completed into — Shopify tells us, we never infer it from an order webhook or
 * from matching on customer/total.
 *
 * Batched via `nodes` because this runs on every admin list load; one query for
 * a page of drafts rather than one per row. `nodes` accepts up to 250 ids and
 * the caller caps well below that.
 *
 * @param {string[]} gids draft order gids
 * @returns {Promise<Array<{id: string, status: string, order: object|null}>>}
 */
export async function fetchDraftOrderStatuses(admin, gids) {
  if (!gids?.length) return [];
  const data = await graphql(
    admin,
    `#graphql
      query PrDraftOrderStatuses($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on DraftOrder {
            id
            name
            status
            order { id name }
          }
        }
      }
    `,
    { ids: gids },
  );
  // A deleted draft order comes back as null in the array — skip rather than
  // treating it as an error, since a merchant may legitimately have removed one.
  return (data?.nodes ?? []).filter((n) => n && n.id);
}

/**
 * Create the draft order.
 *
 * Priced by Shopify from the variant — `variant_price` in the payload is an
 * audit record of what the shopper was shown, NOT an input. A quote is answered
 * days later and prices move.
 *
 * @returns {Promise<{ok: true, draftOrder: object, warnings: string[]}
 *                 | {ok: false, userErrors: Array, warnings: string[]}>}
 */
export async function createDraftOrder(admin, submission) {
  const payload = submission.payload ?? {};
  const quantity = Number.parseInt(payload.quantity, 10);

  const { address, warnings } = buildShippingAddress(payload, {
    name: submission.name,
  });

  const input = {
    lineItems: [
      {
        variantId: String(payload.variant_gid).trim(),
        quantity,
        customAttributes: buildLineItemAttributes(payload),
      },
    ],
    note: buildNote(submission, payload),
    tags: ["product-request-form"],
    ...(submission.email ? { email: submission.email } : {}),
    ...(address ? { shippingAddress: address } : {}),
    // purchasingEntity replaced the deprecated `customerId` field. If a future
    // API version rejects it, that surfaces as a top-level GraphQL error naming
    // the field — not as a silent unattached customer.
    ...(submission.customer_gid
      ? { purchasingEntity: { customerId: submission.customer_gid } }
      : {}),
  };

  const data = await graphql(
    admin,
    `#graphql
      mutation PrDraftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder { id name invoiceUrl totalPriceSet { shopMoney { amount currencyCode } } }
          userErrors { field message }
        }
      }
    `,
    { input },
  );

  const result = data?.draftOrderCreate;
  const userErrors = result?.userErrors ?? [];
  if (userErrors.length || !result?.draftOrder) {
    return { ok: false, userErrors, warnings };
  }
  return { ok: true, draftOrder: result.draftOrder, warnings };
}
