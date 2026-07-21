import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Card,
  Box,
  InlineStack,
  IndexTable,
  Badge,
  Button,
  Tooltip,
  Link,
  Text,
  TextField,
  Select,
  Icon,
  EmptyState,
  Banner,
} from "@shopify/polaris";
import { SearchIcon, ViewIcon } from "@shopify/polaris-icons";
import { useMemo, useState } from "react";
import { listFormSubmissions } from "../lib/supabase.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  try {
    // Scoped to the authenticated store only.
    const submissions = await listFormSubmissions(session.shop);
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

const FORM_OPTIONS = [
  { label: "All forms", value: "all" },
  { label: "Shipping Info", value: "shipping_form" },
  { label: "Quote Request", value: "request_quote" },
];

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d) ? "—" : d.toLocaleString();
}

export default function Index() {
  const { submissions, error } = useLoaderData();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [formType, setFormType] = useState("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return submissions.filter((s) => {
      const matchesForm = formType === "all" || s.form_type === formType;
      if (!matchesForm) return false;
      if (!q) return true;
      return [
        s.email,
        s.phone,
        s.company,
        s.name,
        s.product_handle,
        s.product_title,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [submissions, search, formType]);

  const rowMarkup = filtered.map((item, index) => {
    const meta = FORM_META[item.form_type] || {
      label: item.form_type || "Unknown",
      tone: "new",
    };
    return (
      <IndexTable.Row id={String(item.id)} key={item.id} position={index}>
        <IndexTable.Cell>
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="semibold" as="span">
            {item.email || "N/A"}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{item.phone || "N/A"}</IndexTable.Cell>
        <IndexTable.Cell>
          {item.product_url ? (
            <Link url={item.product_url} target="_blank">
              {item.product_handle || item.product_title || "View product"}
            </Link>
          ) : (
            item.product_handle || item.product_title || "N/A"
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>
          {item.media_url ? (
            <Link url={item.media_url} target="_blank">
              {item.media_name || "View file"}
            </Link>
          ) : (
            "—"
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>
          {item.email_status === "true" ? (
            <Badge tone="success">Sent</Badge>
          ) : (
            <Badge tone="critical">Failed</Badge>
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>{formatDate(item.created_at)}</IndexTable.Cell>
        <IndexTable.Cell>
          <Tooltip content="View submission">
            <Button
              onClick={() => navigate(`/app/submissions/${item.id}`)}
              icon={ViewIcon}
              accessibilityLabel="View submission"
              variant="tertiary"
            />
          </Tooltip>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  const emptyStateMarkup =
    submissions.length === 0 ? (
      <EmptyState
        heading="No form submissions yet"
        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
      >
        <p>
          Shipping Info and Quote Request submissions from the storefront will
          appear here.
        </p>
      </EmptyState>
    ) : (
      <EmptyState heading="No matching submissions" image="">
        <p>Try a different search term or form filter.</p>
      </EmptyState>
    );

  return (
    <Page title="Form Submissions" fullWidth>
      {error && (
        <div style={{ marginBottom: "1rem" }}>
          <Banner tone="critical" title="Could not load submissions">
            <p>{error}</p>
          </Banner>
        </div>
      )}
      <Card padding="0">
        <Box padding="300">
          <InlineStack gap="200" blockAlign="center" wrap={false}>
            <div style={{ flexGrow: 1 }}>
              <TextField
                label="Search submissions"
                labelHidden
                value={search}
                onChange={setSearch}
                autoComplete="off"
                placeholder="Search by email, phone, product or company"
                prefix={<Icon source={SearchIcon} />}
                clearButton
                onClearButtonClick={() => setSearch("")}
              />
            </div>
            <Box minWidth="180px">
              <Select
                label="Form"
                labelHidden
                options={FORM_OPTIONS}
                value={formType}
                onChange={setFormType}
              />
            </Box>
          </InlineStack>
        </Box>
        <IndexTable
          resourceName={{ singular: "submission", plural: "submissions" }}
          itemCount={filtered.length}
          selectable={false}
          emptyState={emptyStateMarkup}
          headings={[
            { title: "Form" },
            { title: "Email" },
            { title: "Phone" },
            { title: "Product" },
            { title: "Attachment" },
            { title: "Status" },
            { title: "Submitted" },
            { title: "Actions" },
          ]}
        >
          {rowMarkup}
        </IndexTable>
      </Card>
    </Page>
  );
}
