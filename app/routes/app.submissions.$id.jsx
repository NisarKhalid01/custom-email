import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
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
  return json({ submission });
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
  const { submission } = useLoaderData();

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
      <BlockStack gap="400">
        <LegacyCard title="Source" sectioned>
          <BlockStack gap="300">
            <Text variant="bodySm">
              <strong>Form:</strong> {meta.label}
            </Text>
            <Text variant="bodySm">
              <strong>Product:</strong>{" "}
              {submission.product_url ? (
                <Link url={submission.product_url} target="_blank">
                  {submission.product_title ||
                    submission.product_handle ||
                    submission.product_url}
                </Link>
              ) : (
                submission.product_title || submission.product_handle || "N/A"
              )}
            </Text>
            {submission.product_handle && (
              <Text variant="bodySm">
                <strong>Handle:</strong> {submission.product_handle}
              </Text>
            )}
            <Text variant="bodySm">
              <strong>Submitted:</strong>{" "}
              {submission.created_at
                ? new Date(submission.created_at).toLocaleString()
                : "—"}
            </Text>
          </BlockStack>
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
    </Page>
  );
}
