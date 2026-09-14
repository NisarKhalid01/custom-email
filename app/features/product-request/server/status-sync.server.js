import {
  listOpenDraftOrderIds,
  attachOrder,
} from "./submissions.server.js";
import { fetchDraftOrderStatuses } from "./draft-order.server.js";

/**
 * Keep "Order Completed" up to date.
 *
 * SERVER ONLY. Called from the submissions list loader.
 *
 * ---------------------------------------------------------------------------
 * WHY POLLING AND NOT A WEBHOOK
 * ---------------------------------------------------------------------------
 * Staff complete a draft order inside the Shopify admin, where this app is not
 * involved, so something has to notice afterwards. A `draft_orders/update`
 * webhook would be instant, but it needs registration, HMAC verification and a
 * public endpoint to maintain — and a single missed delivery leaves a row
 * permanently stale with nothing to correct it.
 *
 * Reading `DraftOrder.order` on list load is less code and cannot drift: it asks
 * Shopify for the authoritative link rather than inferring one, and re-asks every
 * time the page is opened, so a missed anything heals on the next view. The
 * webhook remains a later optimisation (plan 4.4), not a prerequisite.
 *
 * ---------------------------------------------------------------------------
 * THIS MUST NEVER BREAK THE PAGE
 * ---------------------------------------------------------------------------
 * It runs in front of a listing the merchant depends on, including for the two
 * LEGACY forms which have nothing to do with draft orders. A Shopify outage, a
 * missing scope or a revoked token must degrade to "shows the last known
 * status", never to a broken submissions page. Hence: one try/catch around
 * everything, and the result is advisory.
 */

/**
 * Sweep this shop's open draft orders and record any that became orders.
 *
 * Cheap when there is nothing to do: with no open drafts it performs one indexed
 * query and makes no Shopify call at all — which is the common case, and the
 * reason this is acceptable on every page load.
 *
 * @returns {Promise<{checked: number, completed: number, ok: boolean}>}
 */
export async function syncDraftOrderStatuses(admin, shop) {
  const result = { checked: 0, completed: 0, ok: true };
  if (!admin || !shop) return result;

  try {
    const gids = await listOpenDraftOrderIds(shop);
    if (!gids.length) return result;

    result.checked = gids.length;
    const nodes = await fetchDraftOrderStatuses(admin, gids);

    for (const node of nodes) {
      const orderId = node.order?.id;
      if (!orderId) continue;

      // Write-once at the database level too, so two concurrent page loads
      // cannot both claim to have recorded the same completion.
      const wrote = await attachOrder(node.id, {
        orderId,
        orderName: node.order?.name ?? null,
      });
      if (wrote) {
        result.completed += 1;
        console.log(
          `[product-request] draft ${node.name ?? node.id} completed as order ${node.order?.name ?? orderId}`,
        );
      }
    }
  } catch (err) {
    // Logged, not thrown. The most likely cause today is the draft-order scopes
    // not being granted yet, which would otherwise 403 the whole listing.
    result.ok = false;
    console.error(
      "[product-request] draft order status sync failed:",
      err?.message ?? err,
    );
  }

  return result;
}
