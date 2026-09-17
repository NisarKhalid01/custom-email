import {
  BlockStack,
  Box,
  Button,
  Checkbox,
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
 * Asks what to export and in which format, then downloads. Everything specific
 * to this export lives here; the fetch-and-save mechanics are the shared
 * `DownloadButton`.
 *
 * Deliberately self-contained — own popover, own state, own busy and error
 * display — for the same reason as `DeleteRowAction` and `DraftOrderAction`:
 * `app/routes/app._index.jsx` is FROZEN live code, so dropping this into the
 * filter row should be the entire integration. One import, one element.
 *
 * It reads from its OWN route by GET. The page's `action` still delegates to
 * `deleteSubmissionAction` and is untouched.
 *
 * ---------------------------------------------------------------------------
 * WHAT GETS EXPORTED, AND WHY THE DEFAULT IS NOT "EVERYTHING"
 * ---------------------------------------------------------------------------
 *   searching       -> every row that matches, across all pages. A search IS the
 *                      selection; paging through it is incidental.
 *   not searching   -> exactly the rows on screen, unless "all records" is
 *                      ticked. Defaulting to the whole table is how someone ends
 *                      up mailing 75 customers' details to answer one question.
 *
 * The form filter applies in every case, so the choice is only ever "this page"
 * versus "all of what I am looking at" — never "all of something else". The
 * button label always states the actual number, so there is nothing to infer.
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

const plural = (n, noun) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/**
 * @param {string}   form      the page's form-type filter
 * @param {string}   q         the page's search term
 * @param {number}   count     rows matching the current filter + search (all pages)
 * @param {string[]} pageIds   ids of the rows currently on screen
 */
export default function ExportButton({ form = "all", q = "", count = 0, pageIds = [] }) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState("csv");
  const [allRecords, setAllRecords] = useState(false);

  const searching = Boolean(q);
  // Every matching row is already on screen, so "this page" and "all records"
  // would produce the same file. Offering the choice would be noise.
  const pageIsEverything = pageIds.length >= count;
  const exportAll = searching || allRecords || pageIsEverything;

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
  // Naming the rows is what makes "this page" mean the rows actually on screen
  // rather than whatever an offset would have selected.
  if (!exportAll) params.set("ids", pageIds.join(","));

  const rowCount = exportAll ? count : pageIds.length;
  const label = searching
    ? `Export ${plural(rowCount, "result")}`
    : exportAll
      ? `Export all ${plural(rowCount, "record")}`
      : `Export ${plural(rowCount, "row")} on this page`;

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
      <Box padding="400" minWidth="340px">
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

          {searching ? (
            // No choice to offer: a search is the selection the merchant just
            // made, and exporting only part of it would be surprising.
            <Text as="p" variant="bodySm" tone="subdued">
              Exports the {plural(count, "row")} matching your search.
            </Text>
          ) : pageIsEverything ? null : (
            <Checkbox
              label={`Export all ${plural(count, "record")}`}
              helpText="Otherwise only the rows on this page are exported."
              checked={allRecords}
              onChange={setAllRecords}
            />
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
