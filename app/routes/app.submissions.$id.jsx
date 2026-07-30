import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Box,
  LegacyCard,
  BlockStack,
  InlineStack,
  Badge,
  Text,
  Divider,
  Link,
  Thumbnail,
  EmptyState,
} from "@shopify/polaris";
import React from "react";
import { getFormSubmission } from "../lib/supabase.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  // Scoped to the authenticated store so one store can't open another's record.
  const submission = await getFormSubmission(params.id, session.shop);
  // Store handle for building admin deep-links (logo-mat-central.myshopify.com -> logo-mat-central).
  const storeHandle = (session.shop || "").replace(/\.myshopify\.com$/, "");

  // Product image from the PUBLIC storefront product JSON (no scope needed).
  // Non-fatal: just show no image if it can't be fetched.
  let productImage = null;
  if (submission?.product_url) {
    try {
      const res = await fetch(submission.product_url + ".json", {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (res.ok) {
        const j = await res.json();
        const src = j?.product?.image?.src || j?.product?.images?.[0]?.src || null;
        productImage = src
          ? `${src}${src.includes("?") ? "&" : "?"}width=200`
          : null;
      }
    } catch {
      /* ignore */
    }
  }

  return json({ submission, storeHandle, productImage });
};

const FORM_META = {
  shipping_form: { label: "Shipping Info", tone: "info" },
  request_quote: { label: "Quote Request", tone: "attention" },
};

// Columns already shown as structured fields — don't repeat them in the raw list.
const HIDDEN_PAYLOAD_KEYS = new Set([
  "product_url",
  "product_handle",
  "attachment",
]);

// Turn a snake_case / camelCase key into a readable label.
function humanize(key) {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isImageUrl(url) {
  return /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url || "");
}

export default function SubmissionDetail() {
  const { submission, storeHandle, productImage } = useLoaderData();

  if (!submission) {
    return (
      <Page backAction={{ content: "Submissions", url: "/app" }} title="Not found">
        <LegacyCard sectioned>
          <EmptyState heading="Submission not found" image="">
            <p>This submission may have been deleted.</p>
          </EmptyState>
        </LegacyCard>
      </Page>
    );
  }

  const meta = FORM_META[submission.form_type] || {
    label: submission.form_type || "Unknown",
    tone: "new",
  };
  // Prefer a DIRECT link to the product's admin page (needs the product id);
  // otherwise fall back to an admin product search filtered by handle.
  const adminBase = storeHandle
    ? `https://admin.shopify.com/store/${storeHandle}`
    : null;
  const adminProductUrl = !adminBase
    ? null
    : submission.product_id
      ? `${adminBase}/products/${submission.product_id}`
      : submission.product_handle
        ? `${adminBase}/products?query=${encodeURIComponent(
            "handle:" + submission.product_handle,
          )}`
        : null;
  const payload =
    submission.payload && typeof submission.payload === "object"
      ? submission.payload
      : {};
  const payloadEntries = Object.entries(payload).filter(
    ([key, value]) =>
      !HIDDEN_PAYLOAD_KEYS.has(key) &&
      value !== null &&
      value !== undefined &&
      String(value).trim() !== "",
  );

  return (
    <Page
      backAction={{ content: "Submissions", url: "/app" }}
      title={submission.email || submission.company || "Submission"}
      titleMetadata={
        <InlineStack gap="200">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {submission.email_status === "true" ? (
            <Badge tone="success">Sent</Badge>
          ) : (
            <Badge tone="critical">Failed</Badge>
          )}
        </InlineStack>
      }
    >
      <Box paddingBlockEnd="800">
      {/* BlockStack already spaces the cards; remove Polaris's extra
          LegacyCard-to-LegacyCard margin so the gap isn't doubled. */}
      <style>{`.lmc-submission-cards .Polaris-LegacyCard + .Polaris-LegacyCard { margin-top: 0; }`}</style>
      <div className="lmc-submission-cards">
      <BlockStack gap="400">
        <LegacyCard title="Source" sectioned>
          <InlineStack gap="400" blockAlign="center" wrap={false}>
            {productImage ? (
              <img
                src={productImage}
                alt={submission.product_title || "Product"}
                width={84}
                height={84}
                style={{
                  width: 84,
                  height: 84,
                  objectFit: "cover",
                  borderRadius: 10,
                  border: "1px solid var(--p-color-border, #e1e3e5)",
                  flexShrink: 0,
                }}
              />
            ) : (
              <Thumbnail
                source=""
                alt={submission.product_title || "Product"}
                size="large"
              />
            )}
            <BlockStack gap="100">
              <Text variant="headingMd" as="h3">
                {submission.product_title || submission.product_handle || "N/A"}
              </Text>
              {(submission.product_url || adminProductUrl) && (
                <InlineStack gap="400">
                  {submission.product_url && (
                    <Link url={submission.product_url} target="_blank">
                      View on Frontend
                    </Link>
                  )}
                  {adminProductUrl && (
                    <Link url={adminProductUrl} target="_blank">
                      View in Admin
                    </Link>
                  )}
                </InlineStack>
              )}
              <Text variant="bodySm" tone="subdued">
                Submitted{" "}
                {submission.created_at
                  ? new Date(submission.created_at).toLocaleString()
                  : "—"}
              </Text>
            </BlockStack>
          </InlineStack>
        </LegacyCard>

        {submission.media_url && (
          <LegacyCard title="Attachment" sectioned>
            <InlineStack gap="300" blockAlign="center">
              {isImageUrl(submission.media_url) && (
                <Thumbnail
                  source={submission.media_url}
                  alt={submission.media_name || "Attachment"}
                  size="large"
                />
              )}
              <Link url={submission.media_url} target="_blank">
                {submission.media_name || "Download file"}
              </Link>
            </InlineStack>
          </LegacyCard>
        )}

        <LegacyCard title="Submitted details" sectioned>
          <BlockStack gap="300">
            <Divider />
            {payloadEntries.length === 0 ? (
              <Text variant="bodySm" tone="subdued">
                No additional fields.
              </Text>
            ) : (
              payloadEntries.map(([key, value]) => (
                <Text key={key} variant="bodySm">
                  <strong>{humanize(key)}:</strong> {String(value)}
                </Text>
              ))
            )}
          </BlockStack>
        </LegacyCard>
      </BlockStack>
      </div>
      </Box>
    </Page>
  );
}
