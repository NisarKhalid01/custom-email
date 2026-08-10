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
 * EMAIL VERIFICATION IS SHOWN BUT DISABLED
 * ---------------------------------------------------------------------------
 * The F2 endpoints (verify-request / verify-confirm) are held pending Q1, so a
 * shopper currently has no way to *receive* a code. If a merchant switched
 * `require_email_verification` on today, `/api/logo-upload/upload` would
 * correctly return 403 for every upload and there would be no route out of it.
 *
 * The toggle is therefore disabled in the UI with an explanation, rather than
 * hidden (hiding it would make the roadmap invisible) or left enabled (which
 * would be a live footgun). The server still enforces the setting if it is set
 * directly in the database — the UI is a guard rail, not the rule.
 */

/** Flip to true when A9/A11/A12 ship. */
const VERIFICATION_AVAILABLE = false;

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const { settings, degraded, source } = await getSettings(session.shop);

  return json({
    settings,
    degraded,
    source,
    secretConfigured: isSecretConfigured(),
    verificationAvailable: VERIFICATION_AVAILABLE,
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
  const { settings, degraded, secretConfigured, verificationAvailable } =
    useLoaderData();
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
            verificationAvailable={verificationAvailable}
            saving={saving}
            saved={actionData?.saved}
            saveError={actionData?.saveError}
          />
        </Layout.Section>
      </Layout>
    </Page>
  );
}
