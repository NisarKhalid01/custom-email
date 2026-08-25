import { json } from "@remix-run/node";
import {
  useLoaderData,
  useNavigate,
  useNavigation,
  useSearchParams,
} from "@remix-run/react";
import { Page, Banner, Box } from "@shopify/polaris";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import {
  listLogoUploads,
  countLogoUploads,
} from "../features/logo-upload/server/uploads.server.js";
import { getSettings } from "../features/logo-upload/server/settings.server.js";
import { deleteUploadAction } from "../features/logo-upload/server/delete-actions.server.js";
import UploadsTable from "../features/logo-upload/ui/UploadsTable.jsx";

/**
 * Embedded admin → Logo upload → Uploads.
 *
 * Server-side pagination, unlike the Submissions list which loads everything and
 * pages in the browser. This table is expected to grow with every product-page
 * upload, so it should not depend on the whole history fitting in one response.
 */

const PAGE_SIZE = 25;

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  // Search runs in Postgres, not in the browser: this list is paginated
  // server-side, so filtering the current page only would silently hide matches
  // sitting on page 2.
  const search = (url.searchParams.get("q") || "").trim().slice(0, 100);

  try {
    // Settings only to decide which empty-state wording is honest — the table
    // itself does not depend on them.
    const [{ settings }, total] = await Promise.all([
      getSettings(shop),
      countLogoUploads(shop, { search }),
    ]);

    const uploads = await listLogoUploads(shop, {
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      search,
    });

    return json({
      uploads,
      total,
      page,
      pageSize: PAGE_SIZE,
      search,
      gateEverEnabled: Boolean(settings.require_login),
      error: null,
    });
  } catch (err) {
    // Same shape as the Submissions page: render the page with a banner rather
    // than an error boundary, so the admin still works.
    console.error("[logo-upload] failed to load uploads:", err);
    return json({
      uploads: [],
      total: 0,
      page: 1,
      pageSize: PAGE_SIZE,
      search,
      gateEverEnabled: false,
      error: err.message,
    });
  }
};

/**
 * Deleting one upload — the Shopify file first, then the row.
 *
 * The implementation lives in the feature folder rather than inline, so it can be
 * shared with the Form Submissions page, whose route file is frozen live code and
 * cannot absorb this much logic.
 */
export const action = deleteUploadAction;

/** How long to wait after the last keystroke before hitting the server. */
const SEARCH_DEBOUNCE_MS = 300;

export default function LogoUploadUploads() {
  const { uploads, total, page, pageSize, search, gateEverEnabled, error } =
    useLoaderData();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();

  // The input is local so typing stays instant; the URL is the source of truth
  // and catches up on a debounce.
  const [query, setQuery] = useState(search);

  // Re-sync when the URL changes from outside the input — back button, or a
  // "clear search" link in the empty state. Comparing trimmed values keeps the
  // effect from stealing a trailing space the admin just typed.
  useEffect(() => {
    setQuery((current) => (current.trim() === search ? current : search));
  }, [search]);

  useEffect(() => {
    if (query.trim() === search) return;

    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (query.trim()) params.set("q", query.trim());
      else params.delete("q");
      // A new search invalidates the old offset — page 3 of the previous result
      // set is almost always empty for the new one.
      params.delete("page");
      navigate(params.toString() ? `?${params.toString()}` : "?", {
        replace: true,
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, search, searchParams, navigate]);

  const goToPage = (next) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(next));
    navigate(`?${params.toString()}`);
  };

  return (
    <Page
      title="Logo uploads"
      subtitle="Which customer attached which logo, and on which product"
      fullWidth
    >
      {error && (
        <div style={{ marginBottom: "1rem" }}>
          <Banner tone="critical" title="Could not load uploads">
            <p>{error}</p>
          </Banner>
        </div>
      )}

      {/* Same wrapper as the Submissions page: `Layout` adds its own spacing and
          made the two lists sit differently on the screen. The bottom padding
          keeps the pagination footer off the edge of the viewport. */}
      <Box paddingBlockEnd="800">
        <UploadsTable
          uploads={uploads}
          total={total}
          page={page}
          pageSize={pageSize}
          query={query}
          onQueryChange={setQuery}
          searching={navigation.state === "loading"}
          hasSearch={Boolean(search)}
          gateEverEnabled={gateEverEnabled}
          onPage={goToPage}
        />
      </Box>
    </Page>
  );
}
