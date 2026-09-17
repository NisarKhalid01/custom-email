/**
 * Shopify's own status for the orders on an export. SERVER ONLY.
 *
 * Fills the `Payment status` and `Fulfillment status` columns. The third status
 * column, `Order status`, is derived from the row itself and never comes near
 * this file — that separation is deliberate, so a Shopify problem can cost you
 * two columns but never the whole export.
 *
 * ---------------------------------------------------------------------------
 * THIS MUST NEVER BREAK AN EXPORT
 * ---------------------------------------------------------------------------
 * Same contract `syncDraftOrderStatuses()` holds for the list page. Everything
 * is wrapped; a failure logs and returns `{}`, the two columns come out blank,
 * and the merchant still gets their file. An outage, a revoked token or a
 * missing scope must degrade to "two empty columns", never to "no download".
 *
 * Cheap when there is nothing to do: rows with no `order_id` are filtered out
 * before anything is sent, so an export containing no completed orders — the
 * common case, 1 row in 75 today — makes no Shopify call at all.
 */

/** Shopify's `nodes(ids:)` accepts at most 250 ids per call. */
const CHUNK = 250;

const QUERY = `#graphql
  query ExportOrderStatuses($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Order {
        id
        displayFinancialStatus
        displayFulfillmentStatus
      }
    }
  }
`;

/**
 * `PARTIALLY_REFUNDED` -> `Partially refunded`.
 *
 * Shopify returns SCREAMING_SNAKE enums. Printing those in a spreadsheet next to
 * "Order completed" and "Sent" would look like a leaked internal value.
 */
function humanise(value) {
  if (!value) return "";
  const text = String(value).replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Look up payment and fulfilment status for the orders on these rows.
 *
 * @param {object} admin  The GraphQL client from `authenticate.admin(request)`.
 * @param {object[]} rows The rows about to be exported.
 * @returns {Promise<Record<string, {payment: string, fulfillment: string}>>}
 *   Keyed by order GID. Always an object — never throws, never rejects.
 */
export async function fetchOrderStatuses(admin, rows) {
  const statuses = {};
  if (!admin || !rows?.length) return statuses;

  const ids = [...new Set(rows.map((r) => r.order_id).filter(Boolean))];
  if (!ids.length) return statuses;

  try {
    for (const batch of chunk(ids, CHUNK)) {
      const response = await admin.graphql(QUERY, { variables: { ids: batch } });
      const body = await response.json();

      if (body?.errors?.length) {
        // A partial failure still yields usable nodes, so this is logged rather
        // than thrown — but it is logged, because a silently half-filled column
        // is worse than an empty one.
        console.error(
          "[export] order status query returned errors:",
          body.errors.map((e) => e.message).join("; "),
        );
      }

      for (const node of body?.data?.nodes ?? []) {
        // A deleted order comes back as null. Skip it: the row keeps its stored
        // order number and simply has no live status, which is the truth.
        if (!node?.id) continue;
        statuses[node.id] = {
          payment: humanise(node.displayFinancialStatus),
          fulfillment: humanise(node.displayFulfillmentStatus),
        };
      }
    }
  } catch (err) {
    // Logged, not thrown. The likely causes are a Shopify outage or the
    // `read_orders` scope not being granted — neither is a reason to deny the
    // merchant a spreadsheet of their own form submissions.
    console.error(
      "[export] order status lookup failed; exporting without it:",
      err?.message ?? err,
    );
    return {};
  }

  return statuses;
}
