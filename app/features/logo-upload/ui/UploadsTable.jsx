import {
  Card,
  IndexTable,
  Badge,
  Text,
  Link,
  EmptyState,
  Pagination,
  BlockStack,
  InlineStack,
  Box,
  TextField,
  Icon,
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";
import DeleteRowAction from "./DeleteRowAction.jsx";

/**
 * Admin list of logo uploads.
 *
 * This table is the point of feature F1 — it is where "which customer attached
 * which logo" becomes visible. Before this feature, that question had no answer
 * anywhere: `/api/upload` returned a URL and forgot it.
 */

const HEADINGS = [
  { title: "#" },
  { title: "Customer" },
  { title: "Product" },
  { title: "File" },
  { title: "Verified" },
  { title: "Uploaded" },
  { title: "Actions" },
];

export default function UploadsTable({
  uploads,
  total,
  page,
  pageSize,
  query,
  onQueryChange,
  searching,
  hasSearch,
  gateEverEnabled,
  onPage,
}) {
  const start = (page - 1) * pageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Nothing at all AND nothing typed — the store has simply never had an
  // upload, so a search box over an empty table would just be noise.
  if (!total && !hasSearch) {
    return (
      <Card>
        <EmptyState heading="No logo uploads recorded yet" image="">
          <BlockStack gap="200">
            <Text as="p">
              Uploads appear here once a shopper attaches a logo on a product
              page.
            </Text>
            <Text as="p" tone="subdued">
              {gateEverEnabled
                ? "The login gate is on, so every new upload will be recorded against a customer."
                : "Recording starts from the moment the new upload endpoint goes live on the theme. Earlier uploads were never stored anywhere, so there is no history to import."}
            </Text>
          </BlockStack>
        </EmptyState>
      </Card>
    );
  }

  const rows = uploads.map((item, index) => (
    <IndexTable.Row id={String(item.id)} key={item.id} position={index}>
      <IndexTable.Cell>
        <Text variant="bodyMd" as="span" tone="subdued">
          {start + index + 1}
        </Text>
      </IndexTable.Cell>

      <IndexTable.Cell>
        <CustomerCell item={item} />
      </IndexTable.Cell>

      <IndexTable.Cell>
        {item.product_url ? (
          <Link url={item.product_url} target="_blank">
            {item.product_handle || "View product"}
          </Link>
        ) : (
          item.product_handle || "N/A"
        )}
      </IndexTable.Cell>

      <IndexTable.Cell>
        <BlockStack gap="050">
          {item.file_url ? (
            <Link url={item.file_url} target="_blank">
              {item.file_name || "Download"}
            </Link>
          ) : (
            <Text as="span">{item.file_name || "N/A"}</Text>
          )}
          <Text as="span" variant="bodySm" tone="subdued">
            {formatBytes(item.file_size)}
          </Text>
        </BlockStack>
      </IndexTable.Cell>

      <IndexTable.Cell>
        {item.email_verified === true ? (
          <Badge tone="success">Verified</Badge>
        ) : (
          <Text as="span" tone="subdued">
            —
          </Text>
        )}
      </IndexTable.Cell>

      <IndexTable.Cell>{formatDate(item.created_at)}</IndexTable.Cell>

      <IndexTable.Cell>
        <DeleteRowAction
          id={item.id}
          resourceLabel="upload"
          primaryLabel={item.customer_email || "a guest"}
          fileName={item.file_name}
        />
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Card padding="0">
      <Box padding="300">
        <TextField
          label="Search uploads"
          labelHidden
          value={query}
          onChange={onQueryChange}
          autoComplete="off"
          placeholder="Search by customer email, customer ID, file name or product"
          prefix={<Icon source={SearchIcon} />}
          clearButton
          onClearButtonClick={() => onQueryChange("")}
        />
      </Box>

      <IndexTable
        resourceName={{ singular: "upload", plural: "uploads" }}
        itemCount={uploads.length}
        headings={HEADINGS}
        selectable={false}
        loading={searching}
        emptyState={
          <EmptyState heading="No matching uploads" image="">
            <Text as="p">
              Nothing matches “{query}”. Try a customer email, a file name or a
              product handle.
            </Text>
          </EmptyState>
        }
      >
        {rows}
      </IndexTable>

      {totalPages > 1 && (
        <Box padding="400">
          <InlineStack align="center" gap="400" blockAlign="center">
            <Pagination
              hasPrevious={page > 1}
              onPrevious={() => onPage(page - 1)}
              hasNext={page < totalPages}
              onNext={() => onPage(page + 1)}
            />
            <Text as="span" tone="subdued" variant="bodySm">
              Page {page} of {totalPages} · {total}{" "}
              {hasSearch ? "matching" : "total"}
            </Text>
          </InlineStack>
        </Box>
      )}
    </Card>
  );
}

/**
 * Who uploaded it.
 *
 * `identity_source` matters here: a row with a customer but no `liquid_hmac`
 * source would mean the identity was never cryptographically proven. That should
 * be impossible — the upload route only records a customer when the signature
 * verified — so if it ever appears, it is worth seeing rather than hiding.
 */
function CustomerCell({ item }) {
  if (!item.customer_gid && !item.customer_email) {
    return (
      <BlockStack gap="050">
        <Text as="span" tone="subdued">
          Guest
        </Text>
        <Text as="span" variant="bodySm" tone="subdued">
          Uploaded while the gate was off
        </Text>
      </BlockStack>
    );
  }

  return (
    <BlockStack gap="050">
      <Text variant="bodyMd" fontWeight="semibold" as="span">
        {item.customer_email || "Unknown email"}
      </Text>
      <InlineStack gap="100" blockAlign="center">
        <Text as="span" variant="bodySm" tone="subdued">
          {customerNumber(item.customer_gid) ?? "no customer id"}
        </Text>
        {item.identity_source !== "liquid_hmac" && (
          <Badge tone="attention">Unverified identity</Badge>
        )}
      </InlineStack>
    </BlockStack>
  );
}

/** `gid://shopify/Customer/123` -> `123` */
function customerNumber(gid) {
  if (!gid) return null;
  const n = String(gid).split("/").pop();
  return n ? `Customer ${n}` : null;
}

/**
 * `file_size` is a bigint, which postgres.js returns as a STRING — so this must
 * not assume a number.
 */
function formatBytes(size) {
  const n = Number(size);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return "N/A";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "N/A"
    : d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}
