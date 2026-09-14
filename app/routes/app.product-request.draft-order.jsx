import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { FORM_TYPE } from "../features/product-request/config/fields.js";
import {
  getSubmissionForDraft,
  attachDraftOrder,
} from "../features/product-request/server/submissions.server.js";
import {
  createDraftOrder,
  draftBlockedReason,
  verifyVariant,
  reasonText,
  CANNOT_DRAFT,
} from "../features/product-request/server/draft-order.server.js";

/**
 * POST /app/product-request/draft-order — raise a draft order from a submission.
 *
 * Action only, no UI. The button lives in the submissions list
 * (`app/routes/app._index.jsx`) and posts here with an explicit `action:` URL.
 *
 * ---------------------------------------------------------------------------
 * WHY ITS OWN ROUTE
 * ---------------------------------------------------------------------------
 * `app._index.jsx` is a FROZEN file whose action is already delegated to
 * `deleteSubmissionAction`. Turning that into an intent dispatcher would mean
 * editing a frozen file to gain nothing — a `useFetcher` can post anywhere.
 *
 * ---------------------------------------------------------------------------
 * ORDER OF OPERATIONS, AND WHY
 * ---------------------------------------------------------------------------
 *   1. read the submission SHOP-SCOPED       (never trust the posted id)
 *   2. refuse early on any blocking reason   (cheap, before touching Shopify)
 *   3. verify the variant belongs to the product
 *   4. create the draft order in Shopify
 *   5. attach it to the row — and handle losing that race
 *
 * Steps 4 and 5 are not atomic. If 5 reports that a draft was already attached,
 * the draft just created in step 4 is an ORPHAN: real, billable to nobody, and
 * recorded nowhere. It is logged loudly with its gid, because the log is the
 * only way back to it.
 */

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method Not Allowed" }, { status: 405 });
  }

  const { admin, session } = await authenticate.admin(request);

  const form = await request.formData();
  const id = String(form.get("id") ?? "").trim();
  if (!id) return json({ ok: false, error: "Missing submission id." }, { status: 400 });

  // Shop-scoped: the id comes from a button, so it is user input. Without this
  // one store could raise a draft order against another store's submission.
  const submission = await getSubmissionForDraft(id, session.shop);

  const blocked = draftBlockedReason(submission, FORM_TYPE);
  if (blocked) {
    // ALREADY_DRAFTED is the expected outcome of a double click, not a fault —
    // answer with the existing draft so the UI can just show it.
    if (blocked === CANNOT_DRAFT.ALREADY_DRAFTED) {
      return json({
        ok: true,
        alreadyExisted: true,
        draftOrderId: submission.draft_order_id,
        draftOrderName: submission.draft_order_name,
      });
    }
    if (blocked === CANNOT_DRAFT.CLIENT_BROKEN) {
      // A storefront bug, not a shopper mistake. Distinct log line so it is
      // greppable rather than buried among "no variant" refusals.
      console.error(
        `[product-request] submission ${id} has variant_base_gid but no ` +
          "variant_gid — the form's JS failed before resolveVariant() ran.",
      );
    }
    return json(
      { ok: false, reason: blocked, error: reasonText(blocked) },
      { status: blocked === CANNOT_DRAFT.NOT_FOUND ? 404 : 409 },
    );
  }

  const payload = submission.payload ?? {};

  try {
    const check = await verifyVariant(admin, {
      variantGid: String(payload.variant_gid).trim(),
      productId: payload.variant_product_id,
    });
    if (!check.ok) {
      console.error(
        `[product-request] submission ${id}: variant ${payload.variant_gid} ` +
          `does not belong to product ${payload.variant_product_id}`,
      );
      return json(
        { ok: false, reason: check.reason, error: reasonText(check.reason) },
        { status: 409 },
      );
    }

    const created = await createDraftOrder(admin, submission);
    if (!created.ok) {
      const detail = created.userErrors
        .map((e) => `${(e.field ?? []).join(".")}: ${e.message}`.trim())
        .join("; ");
      console.error(`[product-request] draftOrderCreate rejected for ${id}: ${detail}`);
      return json(
        {
          ok: false,
          error: detail || "Shopify rejected the draft order.",
          userErrors: created.userErrors,
        },
        { status: 422 },
      );
    }

    const { id: draftOrderId, name: draftOrderName } = created.draftOrder;

    // Log BEFORE the write. If the process dies between the two, this line is
    // the only record that the draft order exists at all.
    console.log(
      `[product-request] created draft order ${draftOrderName} (${draftOrderId}) for submission ${id}`,
    );

    const attached = await attachDraftOrder(id, { draftOrderId, draftOrderName });
    if (!attached) {
      console.error(
        `[product-request] ORPHANED DRAFT ORDER ${draftOrderName} (${draftOrderId}): ` +
          `submission ${id} already had one attached. Cancel it in Shopify.`,
      );
      return json(
        {
          ok: false,
          orphanedDraftOrderId: draftOrderId,
          error:
            `A draft order already existed, so ${draftOrderName} was created but not linked. ` +
            "Please cancel it in Shopify.",
        },
        { status: 409 },
      );
    }

    return json({
      ok: true,
      draftOrderId,
      draftOrderName,
      // Surfaced, not swallowed: a draft order missing its province is fixable
      // in ten seconds if someone is told, and invisible if they are not.
      warnings: created.warnings,
    });
  } catch (err) {
    // A missing scope lands here as a top-level GraphQL error, not a userError.
    const message = err?.message ?? String(err);
    console.error(`[product-request] draft order failed for ${id}:`, message);
    const scopeIssue = /access denied|not approved|required scope|permission/i.test(message);
    return json(
      {
        ok: false,
        error: scopeIssue
          ? "The app is not approved for draft orders yet. Re-approve it in Shopify, then try again."
          : "Could not create the draft order. Please try again.",
        detail: message,
      },
      { status: scopeIssue ? 403 : 500 },
    );
  }
};

/** No UI at this path — it exists only to receive the button's POST. */
export const loader = async () =>
  json({ ok: false, error: "Method Not Allowed" }, { status: 405 });
