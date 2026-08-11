import { useState } from "react";
import { Form } from "@remix-run/react";
import {
  Card,
  BlockStack,
  Checkbox,
  TextField,
  Select,
  Button,
  Banner,
  Text,
  Box,
} from "@shopify/polaris";
import { SETTINGS_SPEC, COPY_SPEC, FAIL_MODES } from "../config/defaults.js";

/**
 * Admin settings form for the logo-upload gate.
 *
 * Fields are driven by SETTINGS_SPEC / COPY_SPEC (config/defaults.js) so labels,
 * help text and numeric bounds cannot drift from what the server actually
 * accepts. Adding a setting to the spec surfaces it here automatically once it
 * is placed in a group below.
 *
 * Checkboxes submit via hidden inputs rather than a native checked attribute:
 * an unchecked native checkbox sends nothing, which would be indistinguishable
 * from "field omitted" and would silently fail to turn a feature OFF.
 */

/* Only the login modal's wording is editable. The five `verify_*` strings and
   the six verification tuning numbers still exist in config/defaults.js — they
   are simply not surfaced while F2 is declined. */
/* `login_create_account` is intentionally absent. This store uses Shopify's new
   customer accounts, where login and registration are the same hosted URL, so
   the modal renders ONE button. Showing an editable label for a button that is
   never rendered would just be a field with no visible effect. */
const LOGIN_COPY = [
  "login_heading",
  "login_body",
  "login_sign_in",
  "login_close",
];

export default function SettingsForm({
  settings,
  secretConfigured,
  degraded,
  saving,
  saved,
  saveError,
}) {
  const [values, setValues] = useState(settings);

  const set = (key) => (value) => setValues((v) => ({ ...v, [key]: value }));
  const setCopy = (key) => (value) =>
    setValues((v) => ({ ...v, copy: { ...v.copy, [key]: value } }));

  const spec = (key) => SETTINGS_SPEC[key];

  return (
    <Form method="post">
      <BlockStack gap="400">
        {/* ---------------------------------------------------------------- */}
        {/* Misconfiguration is the single most likely failure with a shared  */}
        {/* secret (plan §8), so it gets a critical banner rather than a note. */}
        {/* ---------------------------------------------------------------- */}
        {!secretConfigured && (
          <Banner tone="critical" title="LOGO_UPLOAD_SECRET is not set">
            <BlockStack gap="200">
              <Text as="p">
                The signing secret is missing from this environment. While it is
                unset, turning on <b>Require customer login</b> will reject{" "}
                <b>every</b> upload — the app cannot verify who the shopper is.
              </Text>
              <Text as="p" tone="subdued">
                Set <code>LOGO_UPLOAD_SECRET</code> in the app environment and
                use the same value in the theme snippet{" "}
                <code>mo-logo-upload-config.liquid</code>. They must match
                exactly.
              </Text>
            </BlockStack>
          </Banner>
        )}

        {degraded && (
          <Banner tone="warning" title="Showing fallback settings">
            The database could not be reached, so these are defaults rather than
            your saved values. Saving now would overwrite your real settings —
            reload before making changes.
          </Banner>
        )}

        {saveError && (
          <Banner tone="critical" title="Could not save">
            {saveError}
          </Banner>
        )}

        {saved && !saveError && (
          <Banner tone="success" title="Settings saved">
            Storefront changes take effect within about a minute.
          </Banner>
        )}

        {/* ------------------------------------------------------- features */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Features
            </Text>

            <input
              type="hidden"
              name="require_login"
              value={String(values.require_login)}
            />
            <Checkbox
              label={spec("require_login").label}
              helpText={spec("require_login").help}
              checked={values.require_login}
              onChange={set("require_login")}
            />

            {/* Deliberately a NOTE, not a control.

                Whether the upload field is SHOWN is a theme concern, and the
                theme already owns it in two places: the product's
                custom.image_upload metafield, and (since T7) a per-template
                checkbox in the theme editor. Adding a third switch here would
                mean three places to check when the field does not appear, and
                this one could not even see the other two. */}
            <Banner tone="info" title="Showing or hiding the upload field">
              <BlockStack gap="200">
                <Text as="p">
                  The upload field is <b>shown by default on every product
                  template</b>. This page does not control that — it only
                  controls whether shoppers must sign in first.
                </Text>
                <Text as="p">
                  To hide it on a specific template: <b>Online Store → Themes →
                  Customize</b>, open a product page using that template, select
                  the product section, and untick{" "}
                  <b>&ldquo;Show the logo upload field&rdquo;</b>.
                </Text>
                <Text as="p" tone="subdued">
                  That checkbox applies to every product using that template. To
                  hide the field for one product only, use the product&rsquo;s{" "}
                  <code>custom.image_upload</code> metafield instead. Both must
                  be on for the field to appear.
                </Text>
              </BlockStack>
            </Banner>

            {/* Email verification (F2) was DECLINED on 2026-08-11: this store
                uses Shopify's new customer accounts, which already sign shoppers
                in with an emailed one-time code. A second code would verify an
                address Shopify verified seconds earlier.

                The setting still exists in config/defaults.js and is still
                enforced by the upload route, so it can be revived without
                rework — but it is deliberately NOT shown here. Offering a
                control whose endpoints do not exist would be a trap: switching
                it on rejects every upload. The action strips the field
                server-side too, so a crafted POST cannot enable it either.

                See docs/logo-upload/TASKS.md, the F2 decision block. */}
          </BlockStack>
        </Card>

        {/* --------------------------------------------------- login modal */}
        <Card>
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                Login popup wording
              </Text>
              <Text as="p" tone="subdued">
                Shown when a signed-out shopper tries to attach a logo. Leave a
                field blank to restore its default.
              </Text>
            </BlockStack>

            {LOGIN_COPY.map((key) => (
              <TextField
                key={key}
                name={`copy.${key}`}
                label={humanise(key)}
                value={values.copy[key] ?? ""}
                onChange={setCopy(key)}
                maxLength={COPY_SPEC[key].max}
                showCharacterCount
                multiline={COPY_SPEC[key].max > 200 ? 3 : undefined}
                autoComplete="off"
              />
            ))}
          </BlockStack>
        </Card>

        {/* ------------------------------------------------------- behaviour */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Behaviour
            </Text>

            <Select
              name="fail_mode"
              label={spec("fail_mode").label}
              helpText={spec("fail_mode").help}
              options={FAIL_MODES.map((v) => ({
                label:
                  v === "open"
                    ? "Allow the upload (recommended)"
                    : "Block the upload",
                value: v,
              }))}
              value={values.fail_mode}
              onChange={set("fail_mode")}
            />
          </BlockStack>
        </Card>

        {/* The "Email verification settings" card (6 numeric fields + 5 copy
            strings) lived here. Removed with the F2 decline — 11 controls for a
            feature that will not ship was the largest block on the page.

            The values themselves are untouched in config/defaults.js and in the
            database; nothing was migrated or deleted. Reviving F2 means
            restoring this card, not re-deriving the settings. */}

        <Box paddingBlockEnd="400">
          <Button submit variant="primary" loading={saving} disabled={degraded}>
            Save
          </Button>
        </Box>
      </BlockStack>
    </Form>
  );
}

/** `login_sign_in` -> `Login sign in` */
function humanise(key) {
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
