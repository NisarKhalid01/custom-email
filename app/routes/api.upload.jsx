import { json } from "@remix-run/node";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function loader({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return new Response("Method Not Allowed", {
    status: 405,
    headers: corsHeaders,
  });
}

export async function action({ request }) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file) {
      return json({ error: "No file uploaded" }, { status: 400, headers: corsHeaders });
    }

    // Credentials come from env vars (see HANDOVER §7 / .env.example).
    // Legacy static shpat_ tokens can no longer be created (Shopify disabled
    // new custom apps on 2026-01-01), so we use the client credentials grant:
    // exchange the Dev Dashboard app's client id/secret for a short-lived
    // Admin API token at request time. Never hardcode secrets.
    const SHOP = process.env.SHOPIFY_SHOP;
    const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
    const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
    const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-07";

    if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
      return json(
        { error: "Server missing SHOPIFY_SHOP / SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET env vars" },
        { status: 500, headers: corsHeaders },
      );
    }

    // Client credentials grant -> { access_token: "shpat_...", scope, expires_in }.
    // Tokens last ~24h; we fetch a fresh one per request (simple + stateless).
    const tokenRes = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "client_credentials",
      }),
    });
    const tokenJson = await tokenRes.json().catch(() => null);
    const ADMIN_API_TOKEN = tokenJson?.access_token;
    if (!ADMIN_API_TOKEN) {
      return json(
        { error: "Failed to obtain Admin API access token", detail: tokenJson },
        { status: 500, headers: corsHeaders },
      );
    }

    // Browsers send inconsistent MIME for .eps (often empty or octet-stream),
    // so force the correct type; otherwise fall back to the browser's value.
    const mimeType = /\.eps$/i.test(file.name || "")
      ? "application/postscript"
      : (file.type || "application/octet-stream");

    // staged upload request
    const stagedRes = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": ADMIN_API_TOKEN,
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
              userErrors { field message }
            }
          }
        `,
        variables: {
          input: [
            {
              resource: "FILE",
              filename: file.name,
              mimeType,
              httpMethod: "POST",
            },
          ],
        },
      }),
    });

    const stagedJson = await stagedRes.json();
    const target = stagedJson?.data?.stagedUploadsCreate?.stagedTargets?.[0];
    if (!target) {
      return json({ error: "Failed staged target", stagedJson }, { status: 500, headers: corsHeaders });
    }

    const resourceUrl = target.resourceUrl;

    // EPS FIX: Images register as IMAGE (MediaImage → image.url). Non-images
    // like .eps can't render, so registering them as IMAGE returns a null
    // image.url. Register those as FILE (GenericFile → url) instead.
    const isImage = (file.type || "").startsWith("image/") && !/\.eps$/i.test(file.name || "");
    const contentType = isImage ? "IMAGE" : "FILE";

    // upload to bucket
    const uploadForm = new FormData();
    for (const param of target.parameters) {
      uploadForm.append(param.name, param.value);
    }
    uploadForm.append("file", file);

    const uploadRes = await fetch(target.url, { method: "POST", body: uploadForm });
    if (!uploadRes.ok) {
      return json({ error: "S3/Google bucket upload failed" }, { status: 500, headers: corsHeaders });
    }

    // Register file with Shopify
    const fileCreateRes = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": ADMIN_API_TOKEN,
      },
      body: JSON.stringify({
        query: `
          mutation fileCreate($files: [FileCreateInput!]!) {
            fileCreate(files: $files) {
              files {
                id
                alt
                createdAt
                ... on MediaImage {
                  image { url }
                }
                ... on GenericFile {
                  url
                }
              }
              userErrors { field message }
            }
          }
        `,
        variables: {
          files: [
            {
              contentType, // EPS FIX: IMAGE for images, FILE for .eps
              originalSource: resourceUrl,
              alt: file.name,
            },
          ],
        },
      }),
    });

    const fileCreateJson = await fileCreateRes.json();
    const createdFile = fileCreateJson?.data?.fileCreate?.files?.[0];
    if (!createdFile) {
      return json({ error: "File not created", fileCreateJson }, { status: 500, headers: corsHeaders });
    }

    const fileId = createdFile.id;

    // Query final URL
    await new Promise(r => setTimeout(r, 2000));

    const queryRes = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": ADMIN_API_TOKEN,
      },
      body: JSON.stringify({
        query: `
          query getFile($id: ID!) {
            node(id: $id) {
              ... on MediaImage {
                id
                image {
                  url
                  altText
                }
              }
              ... on GenericFile {
                id
                url
              }
            }
          }
        `,
        variables: { id: fileId },
      }),
    });

    const queryData = await queryRes.json();
    const node = queryData?.data?.node;
    // EPS FIX: images expose image.url; generic files (.eps) expose url directly.
    const finalUrl = node?.image?.url || node?.url || null;

    return json({ url: finalUrl, fileId }, { headers: corsHeaders });

  } catch (err) {
    console.error("Upload error:", err);
    return json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
}
