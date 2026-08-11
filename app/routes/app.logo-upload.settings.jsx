import { json } from "@remix-run/node";
import { useLoaderData, useActionData, useNavigation } from "@remix-run/react";
import { Page, Layout } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import {
  getSettings,
  saveSettings,
} from "../features/logo-upload/server/settings.server.js";
import { isSecretConfigured } from "../features/logo-upload/server/customer-identity.server.js";
import SettingsForm from "../features/logo-upload/ui/SettingsForm.jsx";

/**
 * Embedded admin → Logo upload → Settings.
 *
 * Thin route: auth, load, save, render. All rules live in
 * `app/features/logo-upload/`.
 *
 * ---------------------------------------------------------------------------
 * EMAIL VERIFICATION (F2) IS DECLINED — AND HIDDEN
 * ---------------------------------------------------------------------------
 * Decided 2026-08-11: this store uses Shopify's NEW customer accounts, which
 * already sign shoppers in with an emailed one-time code. A second code from us
 * would verify an address Shopify verified seconds earlier.
 *
 * The controls were removed from the form entirely. An earlier version showed
 * them disabled-with-an-explanation, but advertising a feature that will not
 * ship is just clutter — and a control that rejects every upload if switched on
 * is a trap worth removing rather than labelling.
 *
 * NOTHING WAS DELETED BELOW THE UI. The setting still exists in
 * config/defaults.js, the enforcement still exists in the upload route, and the
 * tables still exist (empty). Reviving F2 means building A8/A9/A11/A12 and
 * restoring the form fields — no migration, no rework.
 *
 * The guard below stays REGARDLESS of the UI: a crafted POST straight to this
 * action must not be able to enable a feature whose endpoints do not exist.
 */

/** Flip to true only when A8/A9/A11/A12 actually ship. */
const VERIFICATION_AVAILABLE = false;

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const { settings, degraded, source } = await getSettings(session.shop);

  return json({
    settings,
    degraded,
    source,
    secretConfigured: isSecretConfigured(),
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const form = await request.formData();

  // Rebuild the nested `copy` object from `copy.<key>` fields. Everything else
  // is passed through flat — `coerceSettings()` on the server drops unknown
  // keys, ignores wrong types and clamps numbers, so nothing here is trusted.
  const patch = { copy: {} };
  for (const [key, value] of form.entries()) {
    if (typeof value !== "string") continue;
    if (key.startsWith("copy.")) patch.copy[key.slice(5)] = value;
    else patch[key] = value;
  }

  // Never let the UI turn on a feature whose endpoints do not exist. A crafted
  // POST straight to this action would otherwise bypass the disabled checkbox.
  if (!VERIFICATION_AVAILABLE) delete patch.require_email_verification;

  try {
    await saveSettings(session.shop, patch);
    return json({ saved: true, saveError: null });
  } catch (err) {
    // saveSettings throws on purpose — the merchant pressed Save and must be
    // told plainly if it did not persist.
    console.error("[logo-upload] settings save failed:", err);
    return json({ saved: false, saveError: err.message }, { status: 500 });
  }
};

export default function LogoUploadSettings() {
  const { settings, degraded, secretConfigured } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();

  const saving =
    navigation.state === "submitting" || navigation.state === "loading";

  return (
    <Page
      title="Logo upload"
      subtitle="Control who can attach a logo on product pages"
    >
      <Layout>
        <Layout.Section>
          <SettingsForm
            // Remount when the saved values change so the form reflects what the
            // server actually stored (numbers get clamped, blank copy resets to
            // default) rather than what was typed.
            key={JSON.stringify(settings)}
            settings={settings}
            secretConfigured={secretConfigured}
            degraded={degraded}
            saving={saving}
            saved={actionData?.saved}
            saveError={actionData?.saveError}
          />
        </Layout.Section>
      </Layout>
    </Page>
  );
}
