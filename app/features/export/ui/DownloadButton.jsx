import { Button, InlineStack, Text } from "@shopify/polaris";
import { useCallback, useState } from "react";

/**
 * Fetch a URL and save the response as a file.
 *
 * SHARED by every export in this folder. It knows a URL and a label; it does not
 * know what it is downloading. Anything subject-specific — which filters, which
 * columns, which wording — belongs in that export's own button.
 *
 * ---------------------------------------------------------------------------
 * WHY fetch + blob AND NOT AN ANCHOR OR A FORM
 * ---------------------------------------------------------------------------
 * This renders inside Shopify's admin iframe. A plain `<a href>` would navigate
 * the iframe to the export route, which loses the session token the embedded app
 * authenticates with — the request arrives unauthenticated and bounces to the
 * OAuth flow instead of downloading anything.
 *
 * App Bridge patches `window.fetch` to attach that token automatically, so
 * fetching the route works where linking to it does not. The response is read
 * into a Blob and handed to a temporary anchor, which is a same-origin download
 * the browser performs without navigating.
 *
 * The blob's type comes from the RESPONSE, not from a constant here: an .xlsx
 * saved with a text/csv type is a file Excel refuses to open.
 */

/** Pull the server's filename out of Content-Disposition, if it gave one. */
function filenameFrom(response, fallback) {
  const header = response.headers.get("Content-Disposition") || "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  return match ? decodeURIComponent(match[1]) : fallback;
}

/**
 * @param {string}  url        What to fetch.
 * @param {string}  label      Button text.
 * @param {string}  [filename] Used only if the response carries no filename.
 * @param {boolean} [disabled]
 * @param {Function} [onDone]  Called after a successful save, with the Response.
 */
export default function DownloadButton({
  url,
  label,
  filename = "export",
  disabled = false,
  variant,
  onDone,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const download = useCallback(async () => {
    setBusy(true);
    setError(null);
    let objectUrl = null;
    try {
      const response = await fetch(url);

      if (!response.ok) {
        // The route reports failures as JSON so there is something to show
        // beyond a status code.
        let message = `The export failed (${response.status}).`;
        try {
          const body = await response.json();
          if (body?.error) message = body.error;
        } catch {
          /* not JSON — keep the generic message */
        }
        setError(message);
        return;
      }

      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);

      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filenameFrom(response, filename);
      // Must be in the document for the click to count as a user-initiated
      // download in every browser, not just the forgiving ones.
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      onDone?.(response);
    } catch (err) {
      // The realistic causes are a network failure or an iframe that refuses
      // the download. Either way the merchant needs to be told, not left
      // watching a spinner stop with nothing saved.
      setError(err?.message || "The export could not be downloaded.");
    } finally {
      // Revoked on the next tick: revoking synchronously can cancel the save in
      // some browsers before it has read the blob.
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
      setBusy(false);
    }
  }, [url, filename, onDone]);

  return (
    <InlineStack gap="200" blockAlign="center" wrap={false}>
      <Button onClick={download} loading={busy} disabled={disabled} variant={variant}>
        {label}
      </Button>
      {/* Rendered in place rather than as a Toast: Toast needs a `Frame`, and
          app.jsx renders the App Bridge AppProvider without one — the same
          constraint DraftOrderAction.jsx and DeleteRowAction.jsx record. */}
      {error ? (
        <Text as="span" variant="bodySm" tone="critical">
          {error}
        </Text>
      ) : null}
    </InlineStack>
  );
}
