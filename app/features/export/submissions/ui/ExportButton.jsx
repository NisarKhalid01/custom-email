import {
  BlockStack,
  Box,
  Button,
  ChoiceList,
  Popover,
  Text,
} from "@shopify/polaris";
import { ExportIcon } from "@shopify/polaris-icons";
import { useCallback, useEffect, useState } from "react";
import DownloadButton from "../../ui/DownloadButton.jsx";

/**
 * Export control for the Form Submissions page.
 *
 * Asks for the format, then downloads. Everything specific to this export lives
 * here; the fetch-and-save mechanics are the shared `DownloadButton`.
 *
 * Deliberately self-contained — own popover, own state, own busy and error
 * display — for the same reason as `DeleteRowAction` and `DraftOrderAction`:
 * `app/routes/app._index.jsx` is FROZEN live code, so dropping this into the
 * filter row should be the entire integration. One import, one element.
 *
 * It reads from its OWN route by GET. The page's `action` still delegates to
 * `deleteSubmissionAction` and is untouched.
 */

const ENDPOINT = "/app/export/submissions";
const STORAGE_KEY = "lmc-export-format";

/**
 * Wording lifted from Shopify's own export dialog, on purpose. A merchant who
 * has exported orders before already knows what the first option means, and the
 * control reads as part of the admin rather than as this app's invention.
 */
const FORMAT_CHOICES = [
  {
    label: "CSV for Excel, Numbers, or other spreadsheet programs",
    value: "csv",
  },
  {
    label: "Excel (.xlsx) — with clickable links",
    value: "xlsx",
  },
];

export default function ExportButton({ form = "all", q = "", count = 0 }) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState("csv");

  // Whoever exports weekly wants the same format every week. Read after mount so
  // the server and first client render agree.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "csv" || saved === "xlsx") setFormat(saved);
    } catch {
      /* private mode, or storage disabled — the default is fine */
    }
  }, []);

  const choose = useCallback((value) => {
    const chosen = value[0];
    setFormat(chosen);
    try {
      window.localStorage.setItem(STORAGE_KEY, chosen);
    } catch {
      /* not worth failing an export over */
    }
  }, []);

  const params = new URLSearchParams({ format });
  if (form && form !== "all") params.set("form", form);
  if (q) params.set("q", q);

  // Says what will actually happen. The export honours the page's search and
  // form filter, so a merchant looking at 12 filtered rows should not be left
  // wondering whether they are about to download 12 or 75.
  const label = count === 1 ? "Export 1 submission" : `Export ${count} submissions`;

  return (
    <Popover
      active={open}
      onClose={() => setOpen(false)}
      preferredAlignment="right"
      activator={
        <Button
          icon={ExportIcon}
          onClick={() => setOpen((was) => !was)}
          disabled={count === 0}
          disclosure={open ? "up" : "down"}
        >
          Export
        </Button>
      }
    >
      <Box padding="400" minWidth="320px">
        <BlockStack gap="300">
          <ChoiceList
            title="Export as"
            choices={FORMAT_CHOICES}
            selected={[format]}
            onChange={choose}
          />
          {format === "csv" ? (
            <Text as="p" variant="bodySm" tone="subdued">
              Links are included as plain text.
            </Text>
          ) : (
            <Text as="p" variant="bodySm" tone="subdued">
              Product names and attachments are clickable links.
            </Text>
          )}
          <DownloadButton
            url={`${ENDPOINT}?${params.toString()}`}
            label={label}
            variant="primary"
            onDone={() => setOpen(false)}
          />
        </BlockStack>
      </Box>
    </Popover>
  );
}
