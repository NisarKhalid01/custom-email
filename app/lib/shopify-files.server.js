// Upload a File to Shopify Files (Shopify's CDN — no S3, per HANDOVER §10) and
// return its permanent CDN URL. Shared by /api/upload (logo EPS uploads) and
// /api/save-shipping (quote-form attachment), so the attachment gets a durable
// reference we can show in the admin.
//
// Auth: client-credentials grant. Legacy static shpat_ tokens can no longer be
// created (Shopify disabled new custom apps 2026-01-01), so we exchange the Dev
// Dashboard app's client id/secret for a short-lived Admin API token per
// request. Never hardcode secrets.

function getCreds() {
  const SHOP = process.env.SHOPIFY_SHOP;
  const CLIENT_ID = process.env.SHOPIFY_API_KEY || process.env.SHOPIFY_CLIENT_ID;
  const CLIENT_SECRET =
    process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_CLIENT_SECRET;
  const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-07";

  if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      "Server missing SHOPIFY_SHOP / SHOPIFY_API_KEY / SHOPIFY_API_SECRET env vars",
    );
  }
  return { SHOP, CLIENT_ID, CLIENT_SECRET, API_VERSION };
}

async function getAdminToken({ SHOP, CLIENT_ID, CLIENT_SECRET }) {
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
  const token = tokenJson?.access_token;
  if (!token) {
    throw new Error(
      `Failed to obtain Admin API access token: ${JSON.stringify(tokenJson)}`,
    );
  }
  return token;
}

async function adminGraphql({ SHOP, API_VERSION }, token, query, variables) {
  const res = await fetch(
    `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    },
  );
  return res.json();
}

/**
 * Upload a File to Shopify Files.
 * @param {File} file - a web File (from request.formData()).
 * @returns {Promise<{ url: string|null, fileId: string|null }>}
 */
export async function uploadToShopifyFiles(file) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("uploadToShopifyFiles: expected a File");
  }

  const creds = getCreds();
  const { SHOP, API_VERSION } = creds;
  const token = await getAdminToken(creds);

  // Browsers send inconsistent MIME for .eps (often empty or octet-stream), so
  // force the correct type; otherwise fall back to the browser's value.
  const mimeType = /\.eps$/i.test(file.name || "")
    ? "application/postscript"
    : file.type || "application/octet-stream";

  // 1. Staged upload target
  const stagedJson = await adminGraphql(
    creds,
    token,
    `
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets { url resourceUrl parameters { name value } }
          userErrors { field message }
        }
      }
    `,
    {
      input: [
        { resource: "FILE", filename: file.name, mimeType, httpMethod: "POST" },
      ],
    },
  );
  const target = stagedJson?.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) {
    throw new Error(`Failed staged target: ${JSON.stringify(stagedJson)}`);
  }
  const resourceUrl = target.resourceUrl;

  // 2. Upload the bytes to the staged (Google/S3) bucket
  const uploadForm = new FormData();
  for (const param of target.parameters) {
    uploadForm.append(param.name, param.value);
  }
  uploadForm.append("file", file);
  const uploadRes = await fetch(target.url, { method: "POST", body: uploadForm });
  if (!uploadRes.ok) {
    throw new Error("Staged bucket upload failed");
  }

  // 3. Register with Shopify. Images render as IMAGE (MediaImage.image.url);
  //    non-images (.eps, .pdf, …) must register as FILE (GenericFile.url) or
  //    the image.url comes back null. (See HANDOVER §3 EPS fix.)
  const isImage =
    (file.type || "").startsWith("image/") && !/\.eps$/i.test(file.name || "");
  const contentType = isImage ? "IMAGE" : "FILE";

  const fileCreateJson = await adminGraphql(
    creds,
    token,
    `
      mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            ... on MediaImage { image { url } }
            ... on GenericFile { url }
          }
          userErrors { field message }
        }
      }
    `,
    {
      files: [{ contentType, originalSource: resourceUrl, alt: file.name }],
    },
  );
  const createdFile = fileCreateJson?.data?.fileCreate?.files?.[0];
  if (!createdFile) {
    throw new Error(`File not created: ${JSON.stringify(fileCreateJson)}`);
  }
  const fileId = createdFile.id;

  // 4. Files process async; give Shopify a moment, then read the final URL.
  await new Promise((r) => setTimeout(r, 2000));
  const queryData = await adminGraphql(
    creds,
    token,
    `
      query getFile($id: ID!) {
        node(id: $id) {
          ... on MediaImage { id image { url } }
          ... on GenericFile { id url }
        }
      }
    `,
    { id: fileId },
  );
  const node = queryData?.data?.node;
  const url = node?.image?.url || node?.url || null;

  return { url, fileId };
}
