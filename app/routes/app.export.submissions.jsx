import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { listForExport } from "../features/export/submissions/server/query.server.js";
import {
  buildExport,
  resolveFormat,
} from "../features/export/submissions/server/export.server.js";
import { fetchOrderStatuses } from "../features/export/submissions/server/order-status.server.js";

/**
 * Download the Form Submissions export. Loader only — no UI, no action.
 *
 * GET /app/export/submissions?form=<form_type|all>&q=<search>&format=<csv|xlsx>
 *
 * ---------------------------------------------------------------------------
 * WHY THIS URL
 * ---------------------------------------------------------------------------
 * `app.export.submissions.jsx` and not `app.submissions.export.jsx`. The latter
 * would put a static segment under the same parent as the `$id` detail route and
 * lean on static-beats-dynamic precedence to avoid being read as a submission
 * id. It works, and it is exactly the kind of thing that breaks quietly during a
 * router upgrade. The URL also mirrors the folder layout, so the next export is
 * `/app/export/logos` with nothing renamed to make room.
 *
 * ---------------------------------------------------------------------------
 * THIS ROUTE ONLY READS
 * ---------------------------------------------------------------------------
 * No insert, no update, no delete — here or anywhere under `features/export/`.
 * The submissions list, both legacy form routes and the draft-order flow are
 * untouched by this feature and cannot be affected by it.
 */
export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const formType = url.searchParams.get("form") || "all";
  const search = url.searchParams.get("q") || "";
  // Allowlisted, never sanitised — it reaches a filename and a Content-Type.
  const format = resolveFormat(url.searchParams.get("format"));

  try {
    const { rows, truncated } = await listForExport(session.shop, { formType, search });

    // Best effort, by contract: this returns {} rather than throwing, so a
    // Shopify outage costs two columns and never the download. Makes no call at
    // all when no exported row has an order.
    const orderStatuses = await fetchOrderStatuses(admin, rows);

    const { filename, contentType, body, rowCount } = await buildExport(rows, {
      formType,
      format,
      orderStatuses,
    });

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        // Read by the button to report what actually happened. A merchant who
        // asked for everything and silently got the first 10,000 rows would have
        // no way of knowing.
        "X-Export-Rows": String(rowCount),
        "X-Export-Truncated": truncated ? "1" : "0",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    // A JSON error, never a partial file. A truncated spreadsheet that looks
    // complete is worse than a visible failure.
    console.error("[export] submissions export failed:", err);
    return json(
      { ok: false, error: "The export could not be generated. Please try again." },
      { status: 500 },
    );
  }
};
