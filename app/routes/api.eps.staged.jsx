import { json } from "@remix-run/node";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function loader({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  return json(
    { ok: true },
    { headers: corsHeaders }
  );
}

export async function action({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const { filename } = await request.json();

  if (!filename || !filename.toLowerCase().endsWith(".eps")) {
    return json({ error: "Only EPS allowed" }, { status: 400, headers: corsHeaders });
  }

  const SHOP = process.env.SHOPIFY_STORE;
  const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
  const API_VERSION = "2025-01";

  const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": TOKEN,
    },
    body: JSON.stringify({
      query: `
        mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
          stagedUploadsCreate(input: $input) {
            stagedTargets {
              url
              resourceUrl
              parameters { name value }
            }
            userErrors { message }
          }
        }
      `,
      variables: {
        input: [{
          resource: "FILE",
          filename,
          mimeType: "application/postscript",
          httpMethod: "POST",
        }],
      },
    }),
  });

  const data = await res.json();
  const target = data?.data?.stagedUploadsCreate?.stagedTargets?.[0];

  if (!target) {
    return json({ error: "Failed staged upload", data }, { status: 500, headers: corsHeaders });
  }

  return json(target, { headers: corsHeaders });
}
