import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import { Page, Layout, Banner, BlockStack } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import {
  listLogoUploads,
  countLogoUploads,
} from "../features/logo-upload/server/uploads.server.js";
import { getSettings } from "../features/logo-upload/server/settings.server.js";
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

  try {
    // Settings only to decide which empty-state wording is honest — the table
    // itself does not depend on them.
    const [{ settings }, total] = await Promise.all([
      getSettings(shop),
      countLogoUploads(shop),
    ]);

    const uploads = await listLogoUploads(shop, {
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    });

    return json({
      uploads,
      total,
      page,
      pageSize: PAGE_SIZE,
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
      gateEverEnabled: false,
      error: err.message,
    });
  }
};

export default function LogoUploadUploads() {
  const { uploads, total, page, pageSize, gateEverEnabled, error } =
    useLoaderData();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const goToPage = (next) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(next));
    navigate(`?${params.toString()}`);
  };

  return (
    <Page
      title="Logo uploads"
      subtitle="Which customer attached which logo, and on which product"
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {error && (
              <Banner tone="critical" title="Could not load uploads">
                {error}
              </Banner>
            )}

            <UploadsTable
              uploads={uploads}
              total={total}
              page={page}
              pageSize={pageSize}
              gateEverEnabled={gateEverEnabled}
              onPage={goToPage}
            />
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
