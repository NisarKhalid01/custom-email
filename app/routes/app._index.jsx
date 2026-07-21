import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  LegacyCard,
  DataTable,
  Badge,
  Button,
  Tooltip,
  Link,
  EmptyState,
  Banner,
} from "@shopify/polaris";
import { ViewIcon } from "@shopify/polaris-icons";
import React from "react";
import { listFormSubmissions } from "../lib/supabase.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  try {
    const submissions = await listFormSubmissions();
    return json({ submissions, error: null });
  } catch (err) {
    console.error("Failed to load form submissions:", err);
    return json({ submissions: [], error: err.message });
  }
};

// form_type -> human label + badge tone
const FORM_META = {
  shipping_form: { label: "Shipping Info", tone: "info" },
  request_quote: { label: "Quote Request", tone: "attention" },
};

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d) ? "—" : d.toLocaleString();
}

export default function Index() {
  const { submissions, error } = useLoaderData();
  const navigate = useNavigate();

  const rows = submissions.map((item) => {
    const meta = FORM_META[item.form_type] || {
      label: item.form_type || "Unknown",
      tone: "new",
    };
    return [
      <Badge tone={meta.tone}>{meta.label}</Badge>,
      item.email || "N/A",
      item.phone || "N/A",
      item.product_url ? (
        <Link url={item.product_url} target="_blank">
          {item.product_handle || item.product_title || "View product"}
        </Link>
      ) : (
        item.product_handle || item.product_title || "N/A"
      ),
      item.media_url ? (
        <Link url={item.media_url} target="_blank">
          {item.media_name || "View file"}
        </Link>
      ) : (
        "—"
      ),
      item.email_status === "true" ? (
        <Badge tone="success">Sent</Badge>
      ) : (
        <Badge tone="critical">Failed</Badge>
      ),
      formatDate(item.created_at),
      <Tooltip content="View submission">
        <Button
          onClick={() => navigate(`/app/submissions/${item.id}`)}
          icon={ViewIcon}
          accessibilityLabel="View submission"
        />
      </Tooltip>,
    ];
  });

  return (
    <Page title="Form Submissions" fullWidth>
      {error && (
        <div style={{ marginBottom: "1rem" }}>
          <Banner tone="critical" title="Could not load submissions">
            <p>{error}</p>
          </Banner>
        </div>
      )}
      <LegacyCard>
        {submissions.length === 0 && !error ? (
          <EmptyState
            heading="No form submissions yet"
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>
              Shipping Info and Quote Request submissions from the storefront
              will appear here.
            </p>
          </EmptyState>
        ) : (
          <DataTable
            columnContentTypes={[
              "text",
              "text",
              "text",
              "text",
              "text",
              "text",
              "text",
              "text",
            ]}
            headings={[
              "Form",
              "Email",
              "Phone",
              "Product",
              "Attachment",
              "Status",
              "Submitted",
              "Actions",
            ]}
            rows={rows}
            footerContent={`Showing ${rows.length} of ${rows.length} results`}
          />
        )}
      </LegacyCard>
    </Page>
  );
}
