import { useFetcher } from "@remix-run/react";
import {
  Banner,
  BlockStack,
  Button,
  Modal,
  Text,
  Tooltip,
} from "@shopify/polaris";
import { DeleteIcon } from "@shopify/polaris-icons";
import { useCallback, useEffect, useState } from "react";

/**
 * Delete button + confirmation dialog for one row of an admin listing.
 *
 * Shared by the Logo uploads table and the Form Submissions table. It posts
 * `{ intent: "delete", id }` to whatever route it is rendered on, so each page
 * supplies its own action — see `server/delete-actions.server.js`.
 *
 * Deliberately self-contained (own fetcher, own modal, own state): the Form
 * Submissions page is frozen live code, so the smaller its share of this feature
 * the better. Dropping this component into a cell is the whole integration.
 *
 * No Polaris `Toast` here on purpose — Toast requires a `Frame`, and `app.jsx`
 * renders the App Bridge `AppProvider` without one. Results are reported inside
 * the modal instead, which also means the outcome cannot be missed.
 */
export default function DeleteRowAction({
  id,
  resourceLabel = "record",
  primaryLabel,
  fileName,
}) {
  const fetcher = useFetcher();
  const [open, setOpen] = useState(false);

  const busy = fetcher.state !== "idle";
  const result = fetcher.data;
  const error = result && result.ok === false ? result.error : null;
  const fileNote = result?.ok ? result.fileNote : null;

  // A clean delete closes the dialog by itself — the row is about to vanish from
  // the revalidated table, so there is nothing left to confirm. When the file
  // could not be removed we stay open instead, because that is the one outcome
  // the admin has to actually read.
  useEffect(() => {
    if (fetcher.state === "idle" && result?.ok && !result.fileNote) {
      setOpen(false);
    }
  }, [fetcher.state, result]);

  const confirm = useCallback(() => {
    fetcher.submit({ intent: "delete", id: String(id) }, { method: "POST" });
  }, [fetcher, id]);

  const done = Boolean(fileNote);

  return (
    <>
      <Tooltip content={`Delete ${resourceLabel}`}>
        <Button
          icon={DeleteIcon}
          accessibilityLabel={`Delete ${resourceLabel}`}
          variant="tertiary"
          tone="critical"
          loading={busy && !open}
          onClick={() => setOpen(true)}
        />
      </Tooltip>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={done ? `${capitalise(resourceLabel)} deleted` : `Delete this ${resourceLabel}?`}
        primaryAction={
          done
            ? { content: "Done", onAction: () => setOpen(false) }
            : {
                content: "Delete",
                destructive: true,
                loading: busy,
                onAction: confirm,
              }
        }
        secondaryActions={
          done
            ? undefined
            : [{ content: "Cancel", disabled: busy, onAction: () => setOpen(false) }]
        }
      >
        <Modal.Section>
          <BlockStack gap="300">
            {error && (
              <Banner tone="critical" title="Could not delete">
                {error}
              </Banner>
            )}

            {fileNote && (
              <Banner tone="warning" title="The file was not removed">
                {`The record is gone, but ${fileNote}. Remove it by hand from Shopify admin → Content → Files if you need it gone.`}
              </Banner>
            )}

            {!done && (
              <>
                <Text as="p">
                  This permanently deletes the {resourceLabel}
                  {primaryLabel ? ` from ${primaryLabel}` : ""} and the file it
                  uploaded. It cannot be undone.
                </Text>

                {fileName && (
                  <Text as="p" tone="subdued" variant="bodySm">
                    File: {fileName}
                  </Text>
                )}
              </>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </>
  );
}

function capitalise(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
