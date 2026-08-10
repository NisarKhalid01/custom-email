import { useState } from "react";
import { Form } from "@remix-run/react";
import {
  Card,
  BlockStack,
  InlineGrid,
  Checkbox,
  TextField,
  Select,
  Button,
  Banner,
  Text,
  Divider,
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

const NUMBER_FIELDS = [
  "verification_validity_days",
  "code_expiry_minutes",
  "verification_token_minutes",
  "max_code_attempts",
  "rate_limit_email_per_15min",
  "rate_limit_ip_per_hour",
];

const LOGIN_COPY = [
  "login_heading",
  "login_body",
  "login_sign_in",
  "login_create_account",
  "login_close",
];

const VERIFY_COPY = [
  "verify_heading",
  "verify_body",
  "verify_send",
  "verify_confirm",
  "verify_resend",
];

export default function SettingsForm({
  settings,
  secretConfigured,
  degraded,
  verificationAvailable,
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

            <input
              type="hidden"
              name="require_email_verification"
              value={String(values.require_email_verification)}
            />
            <Checkbox
              label={spec("require_email_verification").label}
              helpText={
                verificationAvailable
                  ? spec("require_email_verification").help
                  : "Not available yet — the verification endpoints have not been built. Turning this on would reject every upload, because shoppers would have no way to receive a code."
              }
              checked={values.require_email_verification}
              onChange={set("require_email_verification")}
              disabled={!verificationAvailable}
            />

            {!verificationAvailable && (
              <Banner tone="info">
                Email verification is on hold pending confirmation of whether the
                store uses <b>classic</b> or <b>new</b> customer accounts. With
                new customer accounts, Shopify already signs shoppers in with an
                emailed code, which would make this largely redundant.
              </Banner>
            )}
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

        {/* ------------------------------------------- verification tuning */}
        <Card>
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                Email verification settings
              </Text>
              <Text as="p" tone="subdued">
                These take effect once email verification is available. Saving
                them now is harmless.
              </Text>
            </BlockStack>

            <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
              {NUMBER_FIELDS.map((key) => (
                <TextField
                  key={key}
                  name={key}
                  type="number"
                  label={spec(key).label}
                  helpText={spec(key).help || undefined}
                  min={spec(key).min}
                  max={spec(key).max}
                  value={String(values[key] ?? "")}
                  onChange={set(key)}
                  autoComplete="off"
                />
              ))}
            </InlineGrid>

            <Divider />

            {VERIFY_COPY.map((key) => (
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
