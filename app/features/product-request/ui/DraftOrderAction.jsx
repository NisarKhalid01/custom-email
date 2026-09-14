import { useFetcher } from "@remix-run/react";
import { Badge, BlockStack, Button, InlineStack, Link, Text } from "@shopify/polaris";
import { useCallback } from "react";

/**
 * Draft-order cell for one row of the Form Submissions table.
 *
 * Renders one of three states, driven entirely by the row's own columns:
 *
 *   no draft          -> "Create Draft Order" button
 *   draft, no order   -> "Draft Created" badge + link to the draft order
 *   order             -> "Order Completed" badge + link to the order
 *
 * Deliberately self-contained — own fetcher, own busy state, own error display —
 * for the same reason as DeleteRowAction: `app/routes/app._index.jsx` is FROZEN
 * live code, so dropping this into a cell should be the entire integration.
 *
 * It posts to its OWN route rather than the page's action. That route already
 * delegates to `deleteSubmissionAction`, and turning it into an intent
 * dispatcher would mean editing a frozen file for nothing.
 *
 * No Polaris `Toast`: that needs a `Frame`, and `app.jsx` renders the App Bridge
 * `AppProvider` without one. Errors render in the cell, where they cannot be
 * missed and do not disappear after a few seconds.
 */

const ENDPOINT = "/app/product-request/draft-order";

/** `gid://shopify/DraftOrder/123` -> `123`, for building an admin deep link. */
function numericId(gid) {
  const raw = String(gid ?? "");
  const last = raw.slice(raw.lastIndexOf("/") + 1);
  return /^\d+$/.test(last) ? last : null;
}

function adminUrl(storeHandle, kind, gid) {
  const id = numericId(gid);
  if (!storeHandle || !id) return null;
  return `https://admin.shopify.com/store/${storeHandle}/${kind}/${id}`;
}

/**
 * @param {boolean} inline Put the badge and its number on ONE line. The detail
 *   page sits them beside the Sent/Failed badge, where a two-line block breaks
 *   the run of badges; the list has a narrow column where stacking reads better.
 */
export default function DraftOrderAction({
  id,
  storeHandle,
  draftOrderId,
  draftOrderName,
  orderId,
  orderName,
  inline = false,
}) {
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";
  const result = fetcher.data;

  const create = useCallback(() => {
    fetcher.submit({ id: String(id) }, { method: "POST", action: ENDPOINT });
  }, [fetcher, id]);

  // The row's own columns are the source of truth, but after a successful
  // create the fetcher knows before the table revalidates — so prefer its
  // answer to avoid the button flashing back for a moment.
  const draftGid = result?.ok ? (result.draftOrderId ?? draftOrderId) : draftOrderId;
  const draftName = result?.ok ? (result.draftOrderName ?? draftOrderName) : draftOrderName;

  // Badge and number share a line when `inline`, stack otherwise. The outer
  // BlockStack stays either way so warnings never land beside the badge.
  const Pair = inline ? InlineStack : BlockStack;
  const pairGap = inline ? "150" : "050";

  /* ---- completed ---- */
  if (orderId) {
    const url = adminUrl(storeHandle, "orders", orderId);
    return (
      <Pair gap={pairGap} blockAlign="center">
        <Badge tone="success">Order Completed</Badge>
        {url ? (
          <Link url={url} target="_blank">
            {orderName || "View order"}
          </Link>
        ) : (
          <Text variant="bodySm" as="span">{orderName || "—"}</Text>
        )}
      </Pair>
    );
  }

  /* ---- drafted, awaiting completion ---- */
  if (draftGid) {
    const url = adminUrl(storeHandle, "draft_orders", draftGid);
    return (
      <BlockStack gap="050">
        <Pair gap={pairGap} blockAlign="center">
          <Badge tone="info">Draft Created</Badge>
          {url ? (
            <Link url={url} target="_blank">
              {draftName || "View draft order"}
            </Link>
          ) : (
            <Text variant="bodySm" as="span">{draftName || "—"}</Text>
          )}
        </Pair>
        {/* An address field that could not be mapped is fixable in seconds if
            someone is told, and invisible if they are not. */}
        {result?.ok && result.warnings?.length ? (
          <Text variant="bodySm" tone="caution" as="span">
            {result.warnings.join("; ")}
          </Text>
        ) : null}
      </BlockStack>
    );
  }

  /* ---- not drafted yet ---- */
  const error = result && result.ok === false ? result.error : null;

  return (
    <BlockStack gap="050">
      <InlineStack gap="200" blockAlign="center">
        <Button size="slim" loading={busy} onClick={create}>
          Create Draft Order
        </Button>
      </InlineStack>
      {error ? (
        // Refusals carry a reason the merchant can act on ("re-approve the
        // app", "ask the customer to resubmit"), so show it rather than a
        // generic failure.
        <Text variant="bodySm" tone="critical" as="span">
          {error}
        </Text>
      ) : null}
    </BlockStack>
  );
}
