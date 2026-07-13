import { json } from "@remix-run/node";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function action({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const { resourceUrl, filename } = await request.json();

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
        mutation fileCreate($files: [FileCreateInput!]!) {
          fileCreate(files: $files) {
            files {
              id
              ... on GenericFile { url }
            }
            userErrors { message }
          }
        }
      `,
      variables: {
        files: [{
          contentType: "FILE",
          originalSource: resourceUrl,
          alt: filename,
        }],
      },
    }),
  });

  const data = await res.json();
  const file = data?.data?.fileCreate?.files?.[0];

  if (!file) {
    return json({ error: "File not created", data }, { status: 500, headers: corsHeaders });
  }

  return json(file, { headers: corsHeaders });
}
