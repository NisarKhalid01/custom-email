/**
 * Deleting files from Shopify Files.
 *
 * SERVER ONLY. Used by the admin delete actions on the Uploads and Form
 * Submissions listing pages, so a test row can be removed without leaving its
 * artwork sitting on the CDN behind a public URL.
 *
 * ---------------------------------------------------------------------------
 * Why this is a new module and not an addition to app/lib/shopify-files.server.js
 * ---------------------------------------------------------------------------
 * That file is frozen (docs/logo-upload/baseline.sha256) — it runs the live
 * upload path for every storefront form. We import from it elsewhere; we never
 * edit it.
 *
 * There is also a real behavioural difference. `uploadToShopifyFiles()` talks to
 * Shopify with a client-credentials token built from the SHOPIFY_SHOP env var,
 * because it runs on public storefront endpoints where there is no session.
 * Everything here runs behind `authenticate.admin(request)` in the embedded
 * admin, so it uses that request's own `admin` GraphQL client instead. That
 * matters: it deletes from the store whose admin actually clicked the button,
 * not from whatever SHOPIFY_SHOP happens to point at.
 *
 * Scope: `write_files` (shopify.app.toml) covers fileDelete. An older session
 * missing the scope gets ACCESS_DENIED back, which callers surface rather than
 * treat as success.
 */

/**
 * Compare two Shopify CDN URLs ignoring the query string.
 *
 * Shopify appends a cache-busting `?v=1234` that changes over time, so the URL
 * stored in the database months ago will not be string-equal to the one the API
 * returns today. The path is the stable part.
 *
 * @returns {string|null} Comparable form, or null if it isn't a usable URL.
 */
function urlPath(value) {
  if (!value) return null;
  try {
    const parsed = new URL(String(value));
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return null;
  }
}

/** Pull the file name out of a CDN URL, for use as a lookup key. */
function fileNameFromUrl(value) {
  const path = urlPath(value);
  if (!path) return null;
  try {
    return decodeURIComponent(path.split("/").pop() || "") || null;
  } catch {
    return path.split("/").pop() || null;
  }
}

/**
 * Find the Shopify file ID for a stored CDN URL.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ THIS IS THE DANGEROUS PATH — read before loosening it.
 * ---------------------------------------------------------------------------
 * Used only for `form_submissions`, which records `media_url` but never stored a
 * file ID. The only key available is the file name, and file names are NOT
 * unique: Shopify silently renames a second `logo.eps` to `logo_1.eps`, and two
 * unrelated customers uploading `logo.png` a year apart are entirely normal.
 *
 * So a name search alone could resolve to a REAL customer's artwork and delete
 * it. The rule that stops that:
 *
 *     delete only when EXACTLY ONE candidate's URL path equals the stored one.
 *
 * Zero matches, or more than one, returns null and the caller leaves the file
 * alone. Refusing to delete is always recoverable; deleting the wrong customer's
 * file is not.
 *
 * @param {object} admin  The `admin` client from authenticate.admin(request).
 * @param {string} mediaUrl  The URL as stored on the row.
 * @returns {Promise<string|null>} A file GID, or null when it cannot be proven.
 */
export async function resolveShopifyFileId(admin, mediaUrl) {
  const wantedPath = urlPath(mediaUrl);
  const name = fileNameFromUrl(mediaUrl);
  if (!wantedPath || !name) return null;

  // Strip the extension: Shopify's `filename:` filter matches on the stored
  // name, and quoting the whole thing with a dot can behave like a phrase
  // search. Over-fetching is fine — the exact-path check below is the real
  // filter, this query only narrows the candidate set.
  const stem = name.replace(/\.[^.]+$/, "");

  try {
    const response = await admin.graphql(
      `#graphql
        query findFileByName($query: String!) {
          files(first: 50, query: $query) {
            nodes {
              id
              ... on GenericFile { url }
              ... on MediaImage { image { url } }
            }
          }
        }
      `,
      { variables: { query: `filename:${stem}` } },
    );

    const body = await response.json();
    const nodes = body?.data?.files?.nodes ?? [];

    const matches = nodes.filter((node) => {
      const candidate = urlPath(node?.url ?? node?.image?.url);
      return candidate && candidate === wantedPath;
    });

    // Exactly one, or we do not touch it. See the warning above.
    if (matches.length !== 1) {
      console.warn(
        `[logo-upload] file lookup inconclusive for ${name}: ${matches.length} exact URL matches among ${nodes.length} candidates — leaving the file in place.`,
      );
      return null;
    }

    return matches[0].id ?? null;
  } catch (err) {
    console.error(
      "[logo-upload] file lookup failed:",
      err?.message ?? err,
    );
    return null;
  }
}

/**
 * Delete one file from Shopify Files.
 *
 * Never throws. The caller has already decided the database row is going, and a
 * file that cannot be removed must not strand that row forever — the commonest
 * cause is the file having been deleted by hand in the Shopify admin already,
 * which would otherwise make the row permanently undeletable.
 *
 * @param {object} admin   The `admin` client from authenticate.admin(request).
 * @param {string} fileId  A `gid://shopify/GenericFile/...` or MediaImage GID.
 * @returns {Promise<{ok: boolean, reason: string|null}>}
 */
export async function deleteShopifyFile(admin, fileId) {
  if (!fileId) return { ok: false, reason: "no file id" };

  try {
    const response = await admin.graphql(
      `#graphql
        mutation deleteFile($fileIds: [ID!]!) {
          fileDelete(fileIds: $fileIds) {
            deletedFileIds
            userErrors { field message }
          }
        }
      `,
      { variables: { fileIds: [fileId] } },
    );

    const body = await response.json();
    const result = body?.data?.fileDelete;

    // Top-level errors (bad scope, throttling) never reach userErrors.
    const topLevel = body?.errors?.[0]?.message;
    if (topLevel) return { ok: false, reason: topLevel };

    const userError = result?.userErrors?.[0]?.message;
    if (userError) return { ok: false, reason: userError };

    if (result?.deletedFileIds?.includes(fileId)) {
      return { ok: true, reason: null };
    }

    // Shopify reported no error but did not list the id. Most often the file was
    // already gone. Not a success, but not worth alarming the admin about.
    return { ok: false, reason: "file not found in Shopify Files" };
  } catch (err) {
    console.error("[logo-upload] fileDelete failed:", err?.message ?? err);
    return { ok: false, reason: err?.message ?? "request failed" };
  }
}
