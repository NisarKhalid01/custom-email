var _a;
import { jsx, jsxs } from "react/jsx-runtime";
import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { RemixServer, Meta, Links, Outlet, ScrollRestoration, Scripts, useLoaderData, useActionData, Form, Link, useRouteError, useNavigate } from "@remix-run/react";
import { createReadableStreamFromReadable, json, redirect } from "@remix-run/node";
import { isbot } from "isbot";
import "@shopify/shopify-app-remix/adapters/node";
import { shopifyApp, AppDistribution, ApiVersion, LoginErrorType, boundary } from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { PrismaClient } from "@prisma/client";
import { useEffect, useState } from "react";
import nodemailer from "nodemailer";
import postgres from "postgres";
import { AppProvider, Page, Card, FormLayout, Text, TextField, Button, LegacyCard, EmptyState, BlockStack, Link as Link$1, InlineStack, Thumbnail, Divider, Badge, Tooltip, Banner, DataTable } from "@shopify/polaris";
import { AppProvider as AppProvider$1 } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { ViewIcon } from "@shopify/polaris-icons";
if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}
const prisma = global.prismaGlobal ?? new PrismaClient();
const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: (_a = process.env.SCOPES) == null ? void 0 : _a.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    removeRest: true
  },
  ...process.env.SHOP_CUSTOM_DOMAIN ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] } : {}
});
ApiVersion.January25;
const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
const authenticate = shopify.authenticate;
shopify.unauthenticated;
const login = shopify.login;
shopify.registerWebhooks;
shopify.sessionStorage;
const streamTimeout = 5e3;
async function handleRequest(request, responseStatusCode, responseHeaders, remixContext) {
  addDocumentResponseHeaders(request, responseHeaders);
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? "") ? "onAllReady" : "onShellReady";
  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      /* @__PURE__ */ jsx(RemixServer, { context: remixContext, url: request.url }),
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        }
      }
    );
    setTimeout(abort, streamTimeout + 1e3);
  });
}
const entryServer = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: handleRequest,
  streamTimeout
}, Symbol.toStringTag, { value: "Module" }));
function App$2() {
  useEffect(() => {
    (function() {
      emailjs.init({
        publicKey: "q6ITPQW2dDGcPkce9"
        // Replace with your actual public key
      });
    })();
  }, []);
  return /* @__PURE__ */ jsxs("html", { lang: "en", children: [
    /* @__PURE__ */ jsxs("head", { children: [
      /* @__PURE__ */ jsx("meta", { charSet: "utf-8" }),
      /* @__PURE__ */ jsx("meta", { name: "viewport", content: "width=device-width,initial-scale=1" }),
      /* @__PURE__ */ jsx("link", { rel: "preconnect", href: "https://cdn.shopify.com/" }),
      /* @__PURE__ */ jsx(
        "link",
        {
          rel: "stylesheet",
          href: "https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        }
      ),
      /* @__PURE__ */ jsx(Meta, {}),
      /* @__PURE__ */ jsx(Links, {})
    ] }),
    /* @__PURE__ */ jsxs("body", { children: [
      /* @__PURE__ */ jsx(Outlet, {}),
      /* @__PURE__ */ jsx(ScrollRestoration, {}),
      /* @__PURE__ */ jsx(Scripts, {}),
      /* @__PURE__ */ jsx(
        "script",
        {
          type: "text/javascript",
          src: "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js"
        }
      )
    ] })
  ] });
}
const route0 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: App$2
}, Symbol.toStringTag, { value: "Module" }));
const action$8 = async ({ request }) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  const current = payload.current;
  if (session) {
    await prisma.session.update({
      where: {
        id: session.id
      },
      data: {
        scope: current.toString()
      }
    });
  }
  return new Response();
};
const route1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$8
}, Symbol.toStringTag, { value: "Module" }));
const action$7 = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  if (session) {
    await prisma.session.deleteMany({ where: { shop } });
  }
  return new Response();
};
const route2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$7
}, Symbol.toStringTag, { value: "Module" }));
const FORM_SUBMISSIONS_TABLE = "form_submissions";
let _sql = null;
function getSql() {
  const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Database not configured: set DATABASE_URL (or SUPABASE_DB_URL) env var"
    );
  }
  if (!_sql) {
    _sql = postgres(url, {
      // pgbouncer transaction pooling can't use prepared statements.
      prepare: false,
      ssl: "require",
      // Keep the serverless connection footprint small.
      max: 1,
      idle_timeout: 20
    });
  }
  return _sql;
}
const COLUMNS = [
  "form_type",
  "email",
  "phone",
  "company",
  "name",
  "product_url",
  "product_handle",
  "product_title",
  "media_url",
  "media_name",
  "email_status",
  "payload"
];
async function insertFormSubmission(row) {
  const sql = getSql();
  const record = {};
  for (const col of COLUMNS) {
    if (row[col] !== void 0) {
      record[col] = col === "payload" ? sql.json(row[col] ?? {}) : row[col];
    }
  }
  const [inserted] = await sql`
    insert into ${sql(FORM_SUBMISSIONS_TABLE)} ${sql(record)}
    returning id
  `;
  return inserted;
}
async function listFormSubmissions() {
  const sql = getSql();
  return sql`
    select * from ${sql(FORM_SUBMISSIONS_TABLE)}
    order by created_at desc
  `;
}
async function getFormSubmission(id) {
  const sql = getSql();
  const [row] = await sql`
    select * from ${sql(FORM_SUBMISSIONS_TABLE)}
    where id = ${id}
    limit 1
  `;
  return row ?? null;
}
const NOTIFY_RECIPIENTS$1 = [
  "sales@logomatcentral.com"
];
const REPLY_TO$1 = "sales@logomatcentral.com";
async function action$6({ request }) {
  var _a2;
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }
  try {
    const data = await request.json();
    const customerEmail = (data.email || "").trim();
    const hasCustomerEmail = customerEmail !== "";
    const productUrl = data.product_url || null;
    const productHandle = data.product_handle || null;
    let transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        // BACKUP senders (kept for reference):
        // user: 'sales.logomat@gmail.com', pass: "Sales@logomat@123*",
        user: "logomatcentral.sales@gmail.com",
        pass: "jaotjhnzpzkxjani"
      }
    });
    let email = `
      <h2>Shipping Quote</h2>
      <p>Product Name: ${data.title}</p>
      <p>Company: ${data.company}</p>
      <p>Street: ${data.street}</p>
      <p>Apt: ${data.apt}</p>
      <p>City: ${data.city}</p>
      <p>State: ${data.state}</p>
      <p>ZIP: ${data.zip}</p>
      <p>Loading Dock: ${data.loading_dock}</p>
      <p>Liftgate: ${data.liftgate}</p>
      <p>Email: ${data.email}</p>
      <p>Phone: ${data.phone}</p>
      <p>Cartons: ${data.cartons}</p>
      <p>Comments: ${data.comments}</p>
      <p>Size: ${data.variant_id}</p>
    `;
    let info = await transporter.sendMail({
      // from: '"Shipping Info" <sales.logomat@gmail.com>',   // BACKUP
      from: '"Shipping Info" <logomatcentral.sales@gmail.com>',
      // Reply goes to the customer who submitted the form (falls back to company inbox).
      replyTo: hasCustomerEmail ? customerEmail : REPLY_TO$1,
      to: NOTIFY_RECIPIENTS$1.join(", "),
      subject: "Shipping Info",
      html: email
    });
    if (hasCustomerEmail) {
      await transporter.sendMail({
        // from: '"Logo Mat Central" <sales.logomat@gmail.com>',   // BACKUP
        from: '"Logo Mat Central" <logomatcentral.sales@gmail.com>',
        // Reply goes to the company inbox so customer replies reach sales.
        replyTo: REPLY_TO$1,
        to: customerEmail,
        subject: "Thank You from Logo Mat Central",
        html: `
          <div style="font-family: Arial, sans-serif; font-size: 15px; color: #333;">
            <p>Dear ${data.name || "Customer"},</p>
            <p>Thank you for choosing <strong>Logo Mat Central</strong>. We have received your email and will get back to you shortly.</p>
            <p>Our team is reviewing your information and will contact you soon.</p>
            <br>
            <p>Best regards,</p>
            <p><strong>Logo Mat Central Support Team</strong></p>
          </div>
        `
      });
    }
    const emailStatus = ((_a2 = info == null ? void 0 : info.accepted) == null ? void 0 : _a2.length) > 0 ? "true" : "false";
    try {
      await insertFormSubmission({
        form_type: "shipping_form",
        email: data.email || null,
        phone: data.phone || null,
        company: data.company || null,
        name: data.name || null,
        product_url: productUrl,
        product_handle: productHandle,
        product_title: data.title || null,
        email_status: emailStatus,
        payload: data
      });
    } catch (dbErr) {
      console.error("Failed to save shipping_form submission to Supabase:", dbErr);
    }
    return json(
      { message: "Shipping info saved successfully" },
      {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      }
    );
  } catch (error) {
    console.error("Error saving shipping info:", error);
    return json(
      { error: "Failed to save shipping info" },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      }
    );
  }
}
async function loader$b({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }
  return new Response("Method Not Allowed", {
    status: 405,
    headers: {
      "Allow": "POST, OPTIONS"
    }
  });
}
const route3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$6,
  loader: loader$b
}, Symbol.toStringTag, { value: "Module" }));
function getCreds() {
  const SHOP = process.env.SHOPIFY_SHOP;
  const CLIENT_ID = process.env.SHOPIFY_API_KEY || process.env.SHOPIFY_CLIENT_ID;
  const CLIENT_SECRET = process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_CLIENT_SECRET;
  const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-07";
  if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      "Server missing SHOPIFY_SHOP / SHOPIFY_API_KEY / SHOPIFY_API_SECRET env vars"
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
      grant_type: "client_credentials"
    })
  });
  const tokenJson = await tokenRes.json().catch(() => null);
  const token = tokenJson == null ? void 0 : tokenJson.access_token;
  if (!token) {
    throw new Error(
      `Failed to obtain Admin API access token: ${JSON.stringify(tokenJson)}`
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
        "X-Shopify-Access-Token": token
      },
      body: JSON.stringify({ query, variables })
    }
  );
  return res.json();
}
async function uploadToShopifyFiles(file) {
  var _a2, _b, _c, _d, _e, _f, _g, _h;
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("uploadToShopifyFiles: expected a File");
  }
  const creds = getCreds();
  const token = await getAdminToken(creds);
  const mimeType = /\.eps$/i.test(file.name || "") ? "application/postscript" : file.type || "application/octet-stream";
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
        { resource: "FILE", filename: file.name, mimeType, httpMethod: "POST" }
      ]
    }
  );
  const target = (_c = (_b = (_a2 = stagedJson == null ? void 0 : stagedJson.data) == null ? void 0 : _a2.stagedUploadsCreate) == null ? void 0 : _b.stagedTargets) == null ? void 0 : _c[0];
  if (!target) {
    throw new Error(`Failed staged target: ${JSON.stringify(stagedJson)}`);
  }
  const resourceUrl = target.resourceUrl;
  const uploadForm = new FormData();
  for (const param of target.parameters) {
    uploadForm.append(param.name, param.value);
  }
  uploadForm.append("file", file);
  const uploadRes = await fetch(target.url, { method: "POST", body: uploadForm });
  if (!uploadRes.ok) {
    throw new Error("Staged bucket upload failed");
  }
  const isImage = (file.type || "").startsWith("image/") && !/\.eps$/i.test(file.name || "");
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
      files: [{ contentType, originalSource: resourceUrl, alt: file.name }]
    }
  );
  const createdFile = (_f = (_e = (_d = fileCreateJson == null ? void 0 : fileCreateJson.data) == null ? void 0 : _d.fileCreate) == null ? void 0 : _e.files) == null ? void 0 : _f[0];
  if (!createdFile) {
    throw new Error(`File not created: ${JSON.stringify(fileCreateJson)}`);
  }
  const fileId = createdFile.id;
  await new Promise((r) => setTimeout(r, 2e3));
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
    { id: fileId }
  );
  const node = (_g = queryData == null ? void 0 : queryData.data) == null ? void 0 : _g.node;
  const url = ((_h = node == null ? void 0 : node.image) == null ? void 0 : _h.url) || (node == null ? void 0 : node.url) || null;
  return { url, fileId };
}
const NOTIFY_RECIPIENTS = [
  "sales@logomatcentral.com"
];
const REPLY_TO = "sales@logomatcentral.com";
const action$5 = async ({ request }) => {
  var _a2;
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }
  const formData = await request.formData();
  const data = {};
  formData.forEach((value, key) => {
    if (value instanceof File) {
      data[key] = {
        name: value.name,
        type: value.type,
        size: value.size
      };
    } else {
      data[key] = value;
    }
  });
  const customerEmail = (data.email || "").trim();
  const hasCustomerEmail = customerEmail !== "";
  const productUrl = data.product_url || null;
  const productHandle = data.product_handle || null;
  const file = formData.get("attachment");
  const hasFile = file instanceof File && file.name;
  const attachments = hasFile ? [
    {
      filename: file.name,
      content: Buffer.from(await file.arrayBuffer()),
      contentType: file.type
    }
  ] : [];
  let mediaUrl = null;
  let mediaName = hasFile ? file.name : null;
  if (hasFile) {
    try {
      const uploaded = await uploadToShopifyFiles(file);
      mediaUrl = uploaded.url;
    } catch (uploadErr) {
      console.error("Failed to upload attachment to Shopify Files:", uploadErr);
    }
  }
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      // BACKUP senders (kept for reference):
      // user: 'sales.logomat@gmail.com', pass: "Sales@logomat@123*",
      user: "logomatcentral.sales@gmail.com",
      pass: "jaotjhnzpzkxjani"
    }
  });
  let mydata = `<h1><b>New Logo Mat Order Submission</b></h1>`;
  if (data.mat_type) mydata += `<p>Product Name: ${data.mat_type}</p>`;
  if (data.quantity) mydata += `<p>Quantity: ${data.quantity}</p>`;
  if (data.company) mydata += `<p>Company: ${data.company}</p>`;
  if (data.name) mydata += `<p>Name: ${data.name}</p>`;
  if (data.email) mydata += `<p>Email: ${data.email}</p>`;
  if (data.city) mydata += `<p>City: ${data.city}</p>`;
  if (data.state) mydata += `<p>State: ${data.state}</p>`;
  if (data.phone) mydata += `<p>Phone: ${data.phone}</p>`;
  if (data.logo_orientation) mydata += `<p>Logo Orientation: ${data.logo_orientation}</p>`;
  if (data.background_color) mydata += `<p>Background Color: ${data.background_color}</p>`;
  if (data.variant_id) mydata += `<p>Size: ${data.variant_id}</p>`;
  if (data.logo_edging) mydata += `<p>Logo Edging: ${data.logo_edging}</p>`;
  try {
    const info = await transporter.sendMail({
      // from: '"Mat Order" <sales.logomat@gmail.com>',   // BACKUP
      from: '"Mat Order" <logomatcentral.sales@gmail.com>',
      // Reply goes to the customer who submitted the form (falls back to company inbox).
      replyTo: hasCustomerEmail ? customerEmail : REPLY_TO,
      to: NOTIFY_RECIPIENTS.join(", "),
      subject: "New Mat Order Submission",
      html: mydata,
      attachments
    });
    if (hasCustomerEmail) {
      await transporter.sendMail({
        // from: '"Logo Mat Central" <sales.logomat@gmail.com>',   // BACKUP
        from: '"Logo Mat Central" <logomatcentral.sales@gmail.com>',
        // Reply goes to the company inbox so customer replies reach sales.
        replyTo: REPLY_TO,
        to: customerEmail,
        subject: "Thank You from Logo Mat Central",
        html: `
          <div style="font-family: Arial, sans-serif; font-size: 15px; color: #333;">
            <p>Dear ${data.name || "Customer"},</p>
            <p>Thank you for choosing <strong>Logo Mat Central</strong>. We have received your email and will get back to you shortly.</p>
            <p>Our team is reviewing your information and will contact you soon.</p>
            <br>
            <p>Best regards,</p>
            <p><strong>Logo Mat Central Support Team</strong></p>
          </div>
        `
      });
    }
    const emailStatus = ((_a2 = info == null ? void 0 : info.accepted) == null ? void 0 : _a2.length) > 0 ? "true" : "false";
    try {
      await insertFormSubmission({
        form_type: "request_quote",
        email: data.email || null,
        phone: data.phone || null,
        company: data.company || null,
        name: data.name || null,
        product_url: productUrl,
        product_handle: productHandle,
        product_title: data.mat_type || null,
        media_url: mediaUrl,
        media_name: mediaName,
        email_status: emailStatus,
        payload: data
      });
    } catch (dbErr) {
      console.error("Failed to save request_quote submission to Supabase:", dbErr);
    }
    return json(
      { message: "Shipping info saved successfully" },
      {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      }
    );
  } catch (err) {
    console.error("❌ Email failed:", err);
    return json(
      { error: "Failed to send email" },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      }
    );
  }
};
const loader$a = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }
  return new Response("Method Not Allowed", {
    status: 405,
    headers: {
      Allow: "POST, OPTIONS"
    }
  });
};
const route4 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$5,
  loader: loader$a
}, Symbol.toStringTag, { value: "Module" }));
const runtime$1 = "nodejs";
const corsHeaders$3 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
async function action$4({ request }) {
  var _a2, _b, _c;
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders$3 });
  }
  const { resourceUrl, filename } = await request.json();
  const SHOP = process.env.SHOPIFY_STORE;
  const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
  const API_VERSION = "2025-01";
  const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": TOKEN
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
          alt: filename
        }]
      }
    })
  });
  const data = await res.json();
  const file = (_c = (_b = (_a2 = data == null ? void 0 : data.data) == null ? void 0 : _a2.fileCreate) == null ? void 0 : _b.files) == null ? void 0 : _c[0];
  if (!file) {
    return json({ error: "File not created", data }, { status: 500, headers: corsHeaders$3 });
  }
  return json(file, { headers: corsHeaders$3 });
}
const route5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$4,
  runtime: runtime$1
}, Symbol.toStringTag, { value: "Module" }));
const runtime = "nodejs";
const corsHeaders$2 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
async function loader$9({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders$2 });
  }
  return json(
    { ok: true },
    { headers: corsHeaders$2 }
  );
}
async function action$3({ request }) {
  var _a2, _b, _c;
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders$2 });
  }
  const { filename } = await request.json();
  if (!filename || !filename.toLowerCase().endsWith(".eps")) {
    return json({ error: "Only EPS allowed" }, { status: 400, headers: corsHeaders$2 });
  }
  const SHOP = process.env.SHOPIFY_STORE;
  const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
  const API_VERSION = "2025-01";
  const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": TOKEN
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
          httpMethod: "POST"
        }]
      }
    })
  });
  const data = await res.json();
  const target = (_c = (_b = (_a2 = data == null ? void 0 : data.data) == null ? void 0 : _a2.stagedUploadsCreate) == null ? void 0 : _b.stagedTargets) == null ? void 0 : _c[0];
  if (!target) {
    return json({ error: "Failed staged upload", data }, { status: 500, headers: corsHeaders$2 });
  }
  return json(target, { headers: corsHeaders$2 });
}
const route6 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$3,
  loader: loader$9,
  runtime
}, Symbol.toStringTag, { value: "Module" }));
const corsHeaders$1 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400"
};
async function loader$8({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders$1,
        "Access-Control-Max-Age": "86400"
      }
    });
  }
  return json(
    {
      message: "EPS Upload API - Use POST to upload files",
      endpoint: "/api/eps/upload",
      methods: ["GET", "POST", "OPTIONS"]
    },
    { status: 200, headers: corsHeaders$1 }
  );
}
function createTimeoutSignal(ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cleanup: () => clearTimeout(timeout) };
}
async function action$2({ request }) {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j;
  const startTime = Date.now();
  console.log("API Request:", {
    method: request.method,
    url: request.url,
    headers: Object.fromEntries(request.headers.entries())
  });
  try {
    const ADMIN_API_TOKEN = "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";
    const SHOP = "nws-test-3.myshopify.com";
    const API_VERSION = "2025-01";
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file) {
      return json({ error: "No file uploaded" }, { status: 400, headers: corsHeaders$1 });
    }
    const fileName = file.name || (typeof file === "object" && "name" in file ? file.name : null);
    if (!fileName) {
      return json({ error: "File name not found" }, { status: 400, headers: corsHeaders$1 });
    }
    if (!fileName.toLowerCase().endsWith(".eps")) {
      return json({ error: "Only EPS files allowed" }, { status: 400, headers: corsHeaders$1 });
    }
    const timeout1 = createTimeoutSignal(15e3);
    try {
      const stagedRes = await fetch(
        `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": ADMIN_API_TOKEN
          },
          body: JSON.stringify({
            query: `mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
              stagedUploadsCreate(input: $input) {
                stagedTargets { url resourceUrl parameters { name value } }
                userErrors { field message }
              }
            }`,
            variables: {
              input: [{
                resource: "FILE",
                filename: fileName,
                mimeType: "application/postscript",
                httpMethod: "POST"
              }]
            }
          }),
          signal: timeout1.signal
        }
      );
      timeout1.cleanup();
      if (!stagedRes.ok) {
        return json(
          { error: "Failed to create staged upload" },
          { status: 500, headers: corsHeaders$1 }
        );
      }
      const stagedJson = await stagedRes.json();
      const userErrors = (_b = (_a2 = stagedJson == null ? void 0 : stagedJson.data) == null ? void 0 : _a2.stagedUploadsCreate) == null ? void 0 : _b.userErrors;
      if (userErrors && userErrors.length > 0) {
        return json(
          { error: "Staged upload failed", userErrors },
          { status: 400, headers: corsHeaders$1 }
        );
      }
      const target = (_e = (_d = (_c = stagedJson == null ? void 0 : stagedJson.data) == null ? void 0 : _c.stagedUploadsCreate) == null ? void 0 : _d.stagedTargets) == null ? void 0 : _e[0];
      if (!target) {
        return json(
          { error: "Failed to create staged upload" },
          { status: 500, headers: corsHeaders$1 }
        );
      }
      const uploadForm = new FormData();
      for (const param of target.parameters) {
        uploadForm.append(param.name, param.value);
      }
      uploadForm.append("file", file);
      const fileSize = file.size || 0;
      const uploadTimeout = Math.max(3e4, Math.min(12e4, fileSize / 1e3));
      const timeout2 = createTimeoutSignal(uploadTimeout);
      try {
        const uploadRes = await fetch(target.url, {
          method: "POST",
          body: uploadForm,
          signal: timeout2.signal
        });
        timeout2.cleanup();
        if (!uploadRes.ok) {
          return json(
            { error: "File upload failed" },
            { status: 500, headers: corsHeaders$1 }
          );
        }
        await uploadRes.text();
        const timeout3 = createTimeoutSignal(15e3);
        try {
          const fileCreateRes = await fetch(
            `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": ADMIN_API_TOKEN
              },
              body: JSON.stringify({
                query: `mutation fileCreate($files: [FileCreateInput!]!) {
                  fileCreate(files: $files) {
                    files { id createdAt ... on GenericFile { url } }
                    userErrors { field message }
                  }
                }`,
                variables: {
                  files: [{
                    contentType: "FILE",
                    originalSource: target.resourceUrl,
                    alt: fileName
                  }]
                }
              }),
              signal: timeout3.signal
            }
          );
          timeout3.cleanup();
          if (!fileCreateRes.ok) {
            return json(
              { error: "Failed to register file" },
              { status: 500, headers: corsHeaders$1 }
            );
          }
          const fileCreateJson = await fileCreateRes.json();
          const fileCreateErrors = (_g = (_f = fileCreateJson == null ? void 0 : fileCreateJson.data) == null ? void 0 : _f.fileCreate) == null ? void 0 : _g.userErrors;
          if (fileCreateErrors && fileCreateErrors.length > 0) {
            return json(
              { error: "File registration failed", userErrors: fileCreateErrors },
              { status: 400, headers: corsHeaders$1 }
            );
          }
          const createdFile = (_j = (_i = (_h = fileCreateJson == null ? void 0 : fileCreateJson.data) == null ? void 0 : _h.fileCreate) == null ? void 0 : _i.files) == null ? void 0 : _j[0];
          if (!createdFile) {
            return json(
              { error: "File not registered" },
              { status: 500, headers: corsHeaders$1 }
            );
          }
          const duration = Date.now() - startTime;
          console.log(`Upload completed in ${duration}ms`);
          return json(
            {
              fileId: createdFile.id,
              url: target.resourceUrl,
              createdAt: createdFile.createdAt
            },
            { headers: corsHeaders$1 }
          );
        } catch (timeoutErr) {
          timeout3.cleanup();
          if (timeoutErr.name === "AbortError") {
            throw new Error("File registration timeout");
          }
          throw timeoutErr;
        }
      } catch (timeoutErr) {
        timeout2.cleanup();
        if (timeoutErr.name === "AbortError") {
          throw new Error("File upload timeout");
        }
        throw timeoutErr;
      }
    } catch (timeoutErr) {
      timeout1.cleanup();
      if (timeoutErr.name === "AbortError") {
        throw new Error("Staged upload timeout");
      }
      throw timeoutErr;
    }
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`Upload error after ${duration}ms:`, {
      message: err.message,
      stack: err.stack,
      name: err.name
    });
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return json(
        { error: "Request timeout. Please try again." },
        { status: 408, headers: corsHeaders$1 }
      );
    }
    return json(
      {
        error: err.message || "Internal server error",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      },
      { status: 500, headers: corsHeaders$1 }
    );
  }
}
const route7 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$2,
  loader: loader$8
}, Symbol.toStringTag, { value: "Module" }));
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};
async function loader$7({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return new Response("Method Not Allowed", {
    status: 405,
    headers: corsHeaders
  });
}
async function action$1({ request }) {
  var _a2, _b, _c, _d, _e, _f, _g, _h;
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file) {
      return json({ error: "No file uploaded" }, { status: 400, headers: corsHeaders });
    }
    const SHOP = process.env.SHOPIFY_SHOP;
    const CLIENT_ID = process.env.SHOPIFY_API_KEY || process.env.SHOPIFY_CLIENT_ID;
    const CLIENT_SECRET = process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_CLIENT_SECRET;
    const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-07";
    if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
      return json(
        { error: "Server missing SHOPIFY_SHOP / SHOPIFY_API_KEY / SHOPIFY_API_SECRET env vars" },
        { status: 500, headers: corsHeaders }
      );
    }
    const tokenRes = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "client_credentials"
      })
    });
    const tokenJson = await tokenRes.json().catch(() => null);
    const ADMIN_API_TOKEN = tokenJson == null ? void 0 : tokenJson.access_token;
    if (!ADMIN_API_TOKEN) {
      return json(
        { error: "Failed to obtain Admin API access token", detail: tokenJson },
        { status: 500, headers: corsHeaders }
      );
    }
    const mimeType = /\.eps$/i.test(file.name || "") ? "application/postscript" : file.type || "application/octet-stream";
    const stagedRes = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": ADMIN_API_TOKEN
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
              httpMethod: "POST"
            }
          ]
        }
      })
    });
    const stagedJson = await stagedRes.json();
    const target = (_c = (_b = (_a2 = stagedJson == null ? void 0 : stagedJson.data) == null ? void 0 : _a2.stagedUploadsCreate) == null ? void 0 : _b.stagedTargets) == null ? void 0 : _c[0];
    if (!target) {
      return json({ error: "Failed staged target", stagedJson }, { status: 500, headers: corsHeaders });
    }
    const resourceUrl = target.resourceUrl;
    const isImage = (file.type || "").startsWith("image/") && !/\.eps$/i.test(file.name || "");
    const contentType = isImage ? "IMAGE" : "FILE";
    const uploadForm = new FormData();
    for (const param of target.parameters) {
      uploadForm.append(param.name, param.value);
    }
    uploadForm.append("file", file);
    const uploadRes = await fetch(target.url, { method: "POST", body: uploadForm });
    if (!uploadRes.ok) {
      return json({ error: "S3/Google bucket upload failed" }, { status: 500, headers: corsHeaders });
    }
    const fileCreateRes = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": ADMIN_API_TOKEN
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
              contentType,
              // EPS FIX: IMAGE for images, FILE for .eps
              originalSource: resourceUrl,
              alt: file.name
            }
          ]
        }
      })
    });
    const fileCreateJson = await fileCreateRes.json();
    const createdFile = (_f = (_e = (_d = fileCreateJson == null ? void 0 : fileCreateJson.data) == null ? void 0 : _d.fileCreate) == null ? void 0 : _e.files) == null ? void 0 : _f[0];
    if (!createdFile) {
      return json({ error: "File not created", fileCreateJson }, { status: 500, headers: corsHeaders });
    }
    const fileId = createdFile.id;
    await new Promise((r) => setTimeout(r, 2e3));
    const queryRes = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": ADMIN_API_TOKEN
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
        variables: { id: fileId }
      })
    });
    const queryData = await queryRes.json();
    const node = (_g = queryData == null ? void 0 : queryData.data) == null ? void 0 : _g.node;
    const finalUrl = ((_h = node == null ? void 0 : node.image) == null ? void 0 : _h.url) || (node == null ? void 0 : node.url) || null;
    return json({ url: finalUrl, fileId }, { headers: corsHeaders });
  } catch (err) {
    console.error("Upload error:", err);
    return json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
}
const route8 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$1,
  loader: loader$7
}, Symbol.toStringTag, { value: "Module" }));
const Polaris = /* @__PURE__ */ JSON.parse('{"ActionMenu":{"Actions":{"moreActions":"More actions"},"RollupActions":{"rollupButton":"View actions"}},"ActionList":{"SearchField":{"clearButtonLabel":"Clear","search":"Search","placeholder":"Search actions"}},"Avatar":{"label":"Avatar","labelWithInitials":"Avatar with initials {initials}"},"Autocomplete":{"spinnerAccessibilityLabel":"Loading","ellipsis":"{content}…"},"Badge":{"PROGRESS_LABELS":{"incomplete":"Incomplete","partiallyComplete":"Partially complete","complete":"Complete"},"TONE_LABELS":{"info":"Info","success":"Success","warning":"Warning","critical":"Critical","attention":"Attention","new":"New","readOnly":"Read-only","enabled":"Enabled"},"progressAndTone":"{toneLabel} {progressLabel}"},"Banner":{"dismissButton":"Dismiss notification"},"Button":{"spinnerAccessibilityLabel":"Loading"},"Common":{"checkbox":"checkbox","undo":"Undo","cancel":"Cancel","clear":"Clear","close":"Close","submit":"Submit","more":"More"},"ContextualSaveBar":{"save":"Save","discard":"Discard"},"DataTable":{"sortAccessibilityLabel":"sort {direction} by","navAccessibilityLabel":"Scroll table {direction} one column","totalsRowHeading":"Totals","totalRowHeading":"Total"},"DatePicker":{"previousMonth":"Show previous month, {previousMonthName} {showPreviousYear}","nextMonth":"Show next month, {nextMonth} {nextYear}","today":"Today ","start":"Start of range","end":"End of range","months":{"january":"January","february":"February","march":"March","april":"April","may":"May","june":"June","july":"July","august":"August","september":"September","october":"October","november":"November","december":"December"},"days":{"monday":"Monday","tuesday":"Tuesday","wednesday":"Wednesday","thursday":"Thursday","friday":"Friday","saturday":"Saturday","sunday":"Sunday"},"daysAbbreviated":{"monday":"Mo","tuesday":"Tu","wednesday":"We","thursday":"Th","friday":"Fr","saturday":"Sa","sunday":"Su"}},"DiscardConfirmationModal":{"title":"Discard all unsaved changes","message":"If you discard changes, you’ll delete any edits you made since you last saved.","primaryAction":"Discard changes","secondaryAction":"Continue editing"},"DropZone":{"single":{"overlayTextFile":"Drop file to upload","overlayTextImage":"Drop image to upload","overlayTextVideo":"Drop video to upload","actionTitleFile":"Add file","actionTitleImage":"Add image","actionTitleVideo":"Add video","actionHintFile":"or drop file to upload","actionHintImage":"or drop image to upload","actionHintVideo":"or drop video to upload","labelFile":"Upload file","labelImage":"Upload image","labelVideo":"Upload video"},"allowMultiple":{"overlayTextFile":"Drop files to upload","overlayTextImage":"Drop images to upload","overlayTextVideo":"Drop videos to upload","actionTitleFile":"Add files","actionTitleImage":"Add images","actionTitleVideo":"Add videos","actionHintFile":"or drop files to upload","actionHintImage":"or drop images to upload","actionHintVideo":"or drop videos to upload","labelFile":"Upload files","labelImage":"Upload images","labelVideo":"Upload videos"},"errorOverlayTextFile":"File type is not valid","errorOverlayTextImage":"Image type is not valid","errorOverlayTextVideo":"Video type is not valid"},"EmptySearchResult":{"altText":"Empty search results"},"Frame":{"skipToContent":"Skip to content","navigationLabel":"Navigation","Navigation":{"closeMobileNavigationLabel":"Close navigation"}},"FullscreenBar":{"back":"Back","accessibilityLabel":"Exit fullscreen mode"},"Filters":{"moreFilters":"More filters","moreFiltersWithCount":"More filters ({count})","filter":"Filter {resourceName}","noFiltersApplied":"No filters applied","cancel":"Cancel","done":"Done","clearAllFilters":"Clear all filters","clear":"Clear","clearLabel":"Clear {filterName}","addFilter":"Add filter","clearFilters":"Clear all","searchInView":"in:{viewName}"},"FilterPill":{"clear":"Clear","unsavedChanges":"Unsaved changes - {label}"},"IndexFilters":{"searchFilterTooltip":"Search and filter","searchFilterTooltipWithShortcut":"Search and filter (F)","searchFilterAccessibilityLabel":"Search and filter results","sort":"Sort your results","addView":"Add a new view","newView":"Custom search","SortButton":{"ariaLabel":"Sort the results","tooltip":"Sort","title":"Sort by","sorting":{"asc":"Ascending","desc":"Descending","az":"A-Z","za":"Z-A"}},"EditColumnsButton":{"tooltip":"Edit columns","accessibilityLabel":"Customize table column order and visibility"},"UpdateButtons":{"cancel":"Cancel","update":"Update","save":"Save","saveAs":"Save as","modal":{"title":"Save view as","label":"Name","sameName":"A view with this name already exists. Please choose a different name.","save":"Save","cancel":"Cancel"}}},"IndexProvider":{"defaultItemSingular":"Item","defaultItemPlural":"Items","allItemsSelected":"All {itemsLength}+ {resourceNamePlural} are selected","selected":"{selectedItemsCount} selected","a11yCheckboxDeselectAllSingle":"Deselect {resourceNameSingular}","a11yCheckboxSelectAllSingle":"Select {resourceNameSingular}","a11yCheckboxDeselectAllMultiple":"Deselect all {itemsLength} {resourceNamePlural}","a11yCheckboxSelectAllMultiple":"Select all {itemsLength} {resourceNamePlural}"},"IndexTable":{"emptySearchTitle":"No {resourceNamePlural} found","emptySearchDescription":"Try changing the filters or search term","onboardingBadgeText":"New","resourceLoadingAccessibilityLabel":"Loading {resourceNamePlural}…","selectAllLabel":"Select all {resourceNamePlural}","selected":"{selectedItemsCount} selected","undo":"Undo","selectAllItems":"Select all {itemsLength}+ {resourceNamePlural}","selectItem":"Select {resourceName}","selectButtonText":"Select","sortAccessibilityLabel":"sort {direction} by"},"Loading":{"label":"Page loading bar"},"Modal":{"iFrameTitle":"body markup","modalWarning":"These required properties are missing from Modal: {missingProps}"},"Page":{"Header":{"rollupActionsLabel":"View actions for {title}","pageReadyAccessibilityLabel":"{title}. This page is ready"}},"Pagination":{"previous":"Previous","next":"Next","pagination":"Pagination"},"ProgressBar":{"negativeWarningMessage":"Values passed to the progress prop shouldn’t be negative. Resetting {progress} to 0.","exceedWarningMessage":"Values passed to the progress prop shouldn’t exceed 100. Setting {progress} to 100."},"ResourceList":{"sortingLabel":"Sort by","defaultItemSingular":"item","defaultItemPlural":"items","showing":"Showing {itemsCount} {resource}","showingTotalCount":"Showing {itemsCount} of {totalItemsCount} {resource}","loading":"Loading {resource}","selected":"{selectedItemsCount} selected","allItemsSelected":"All {itemsLength}+ {resourceNamePlural} in your store are selected","allFilteredItemsSelected":"All {itemsLength}+ {resourceNamePlural} in this filter are selected","selectAllItems":"Select all {itemsLength}+ {resourceNamePlural} in your store","selectAllFilteredItems":"Select all {itemsLength}+ {resourceNamePlural} in this filter","emptySearchResultTitle":"No {resourceNamePlural} found","emptySearchResultDescription":"Try changing the filters or search term","selectButtonText":"Select","a11yCheckboxDeselectAllSingle":"Deselect {resourceNameSingular}","a11yCheckboxSelectAllSingle":"Select {resourceNameSingular}","a11yCheckboxDeselectAllMultiple":"Deselect all {itemsLength} {resourceNamePlural}","a11yCheckboxSelectAllMultiple":"Select all {itemsLength} {resourceNamePlural}","Item":{"actionsDropdownLabel":"Actions for {accessibilityLabel}","actionsDropdown":"Actions dropdown","viewItem":"View details for {itemName}"},"BulkActions":{"actionsActivatorLabel":"Actions","moreActionsActivatorLabel":"More actions"}},"SkeletonPage":{"loadingLabel":"Page loading"},"Tabs":{"newViewAccessibilityLabel":"Create new view","newViewTooltip":"Create view","toggleTabsLabel":"More views","Tab":{"rename":"Rename view","duplicate":"Duplicate view","edit":"Edit view","editColumns":"Edit columns","delete":"Delete view","copy":"Copy of {name}","deleteModal":{"title":"Delete view?","description":"This can’t be undone. {viewName} view will no longer be available in your admin.","cancel":"Cancel","delete":"Delete view"}},"RenameModal":{"title":"Rename view","label":"Name","cancel":"Cancel","create":"Save","errors":{"sameName":"A view with this name already exists. Please choose a different name."}},"DuplicateModal":{"title":"Duplicate view","label":"Name","cancel":"Cancel","create":"Create view","errors":{"sameName":"A view with this name already exists. Please choose a different name."}},"CreateViewModal":{"title":"Create new view","label":"Name","cancel":"Cancel","create":"Create view","errors":{"sameName":"A view with this name already exists. Please choose a different name."}}},"Tag":{"ariaLabel":"Remove {children}"},"TextField":{"characterCount":"{count} characters","characterCountWithMaxLength":"{count} of {limit} characters used"},"TooltipOverlay":{"accessibilityLabel":"Tooltip: {label}"},"TopBar":{"toggleMenuLabel":"Toggle menu","SearchField":{"clearButtonLabel":"Clear","search":"Search"}},"MediaCard":{"dismissButton":"Dismiss","popoverButton":"Actions"},"VideoThumbnail":{"playButtonA11yLabel":{"default":"Play video","defaultWithDuration":"Play video of length {duration}","duration":{"hours":{"other":{"only":"{hourCount} hours","andMinutes":"{hourCount} hours and {minuteCount} minutes","andMinute":"{hourCount} hours and {minuteCount} minute","minutesAndSeconds":"{hourCount} hours, {minuteCount} minutes, and {secondCount} seconds","minutesAndSecond":"{hourCount} hours, {minuteCount} minutes, and {secondCount} second","minuteAndSeconds":"{hourCount} hours, {minuteCount} minute, and {secondCount} seconds","minuteAndSecond":"{hourCount} hours, {minuteCount} minute, and {secondCount} second","andSeconds":"{hourCount} hours and {secondCount} seconds","andSecond":"{hourCount} hours and {secondCount} second"},"one":{"only":"{hourCount} hour","andMinutes":"{hourCount} hour and {minuteCount} minutes","andMinute":"{hourCount} hour and {minuteCount} minute","minutesAndSeconds":"{hourCount} hour, {minuteCount} minutes, and {secondCount} seconds","minutesAndSecond":"{hourCount} hour, {minuteCount} minutes, and {secondCount} second","minuteAndSeconds":"{hourCount} hour, {minuteCount} minute, and {secondCount} seconds","minuteAndSecond":"{hourCount} hour, {minuteCount} minute, and {secondCount} second","andSeconds":"{hourCount} hour and {secondCount} seconds","andSecond":"{hourCount} hour and {secondCount} second"}},"minutes":{"other":{"only":"{minuteCount} minutes","andSeconds":"{minuteCount} minutes and {secondCount} seconds","andSecond":"{minuteCount} minutes and {secondCount} second"},"one":{"only":"{minuteCount} minute","andSeconds":"{minuteCount} minute and {secondCount} seconds","andSecond":"{minuteCount} minute and {secondCount} second"}},"seconds":{"other":"{secondCount} seconds","one":"{secondCount} second"}}}}}');
const polarisTranslations = {
  Polaris
};
const polarisStyles = "/assets/styles-BeiPL2RV.css";
function loginErrorMessage(loginErrors) {
  if ((loginErrors == null ? void 0 : loginErrors.shop) === LoginErrorType.MissingShop) {
    return { shop: "Please enter your shop domain to log in" };
  } else if ((loginErrors == null ? void 0 : loginErrors.shop) === LoginErrorType.InvalidShop) {
    return { shop: "Please enter a valid shop domain to log in" };
  }
  return {};
}
const links$1 = () => [{ rel: "stylesheet", href: polarisStyles }];
const loader$6 = async ({ request }) => {
  const errors = loginErrorMessage(await login(request));
  return { errors, polarisTranslations };
};
const action = async ({ request }) => {
  const errors = loginErrorMessage(await login(request));
  return {
    errors
  };
};
function Auth() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;
  return /* @__PURE__ */ jsx(AppProvider, { i18n: loaderData.polarisTranslations, children: /* @__PURE__ */ jsx(Page, { children: /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsx(Form, { method: "post", children: /* @__PURE__ */ jsxs(FormLayout, { children: [
    /* @__PURE__ */ jsx(Text, { variant: "headingMd", as: "h2", children: "Log in" }),
    /* @__PURE__ */ jsx(
      TextField,
      {
        type: "text",
        name: "shop",
        label: "Shop domain",
        helpText: "example.myshopify.com",
        value: shop,
        onChange: setShop,
        autoComplete: "on",
        error: errors.shop
      }
    ),
    /* @__PURE__ */ jsx(Button, { submit: true, children: "Log in" })
  ] }) }) }) }) });
}
const route9 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action,
  default: Auth,
  links: links$1,
  loader: loader$6
}, Symbol.toStringTag, { value: "Module" }));
const loader$5 = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};
const route10 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$5
}, Symbol.toStringTag, { value: "Module" }));
const loader$4 = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};
const route11 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$4
}, Symbol.toStringTag, { value: "Module" }));
const index = "_index_1hqgz_1";
const heading = "_heading_1hqgz_21";
const text = "_text_1hqgz_23";
const content = "_content_1hqgz_43";
const form = "_form_1hqgz_53";
const label = "_label_1hqgz_69";
const input = "_input_1hqgz_85";
const button = "_button_1hqgz_93";
const list = "_list_1hqgz_101";
const styles = {
  index,
  heading,
  text,
  content,
  form,
  label,
  input,
  button,
  list
};
const loader$3 = async ({ request }) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return { showForm: Boolean(login) };
};
function App$1() {
  const { showForm } = useLoaderData();
  return /* @__PURE__ */ jsx("div", { className: styles.index, children: /* @__PURE__ */ jsxs("div", { className: styles.content, children: [
    /* @__PURE__ */ jsx("h1", { className: styles.heading, children: "A short heading about [your app]" }),
    /* @__PURE__ */ jsx("p", { className: styles.text, children: "A tagline about [your app] that describes your value proposition." }),
    showForm && /* @__PURE__ */ jsxs(Form, { className: styles.form, method: "post", action: "/auth/login", children: [
      /* @__PURE__ */ jsxs("label", { className: styles.label, children: [
        /* @__PURE__ */ jsx("span", { children: "Shop domain" }),
        /* @__PURE__ */ jsx("input", { className: styles.input, type: "text", name: "shop" }),
        /* @__PURE__ */ jsx("span", { children: "e.g: my-shop-domain.myshopify.com" })
      ] }),
      /* @__PURE__ */ jsx("button", { className: styles.button, type: "submit", children: "Log in" })
    ] }),
    /* @__PURE__ */ jsxs("ul", { className: styles.list, children: [
      /* @__PURE__ */ jsxs("li", { children: [
        /* @__PURE__ */ jsx("strong", { children: "Product feature" }),
        ". Some detail about your feature and its benefit to your customer."
      ] }),
      /* @__PURE__ */ jsxs("li", { children: [
        /* @__PURE__ */ jsx("strong", { children: "Product feature" }),
        ". Some detail about your feature and its benefit to your customer."
      ] }),
      /* @__PURE__ */ jsxs("li", { children: [
        /* @__PURE__ */ jsx("strong", { children: "Product feature" }),
        ". Some detail about your feature and its benefit to your customer."
      ] })
    ] })
  ] }) });
}
const route12 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: App$1,
  loader: loader$3
}, Symbol.toStringTag, { value: "Module" }));
const links = () => [{ rel: "stylesheet", href: polarisStyles }];
const loader$2 = async ({ request }) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};
function App() {
  const { apiKey } = useLoaderData();
  return /* @__PURE__ */ jsxs(AppProvider$1, { isEmbeddedApp: true, apiKey, children: [
    /* @__PURE__ */ jsx(NavMenu, { children: /* @__PURE__ */ jsx(Link, { to: "/app", rel: "home", children: "Home" }) }),
    /* @__PURE__ */ jsx(Outlet, {})
  ] });
}
function ErrorBoundary() {
  return boundary.error(useRouteError());
}
const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
const route13 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ErrorBoundary,
  default: App,
  headers,
  links,
  loader: loader$2
}, Symbol.toStringTag, { value: "Module" }));
const loader$1 = async ({ request, params }) => {
  await authenticate.admin(request);
  const submission = await getFormSubmission(params.id);
  return json({ submission });
};
const FORM_META$1 = {
  shipping_form: { label: "Shipping Info", tone: "info" },
  request_quote: { label: "Quote Request", tone: "attention" }
};
const HIDDEN_PAYLOAD_KEYS = /* @__PURE__ */ new Set([
  "product_url",
  "product_handle",
  "attachment"
]);
function humanize(key) {
  return key.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (c) => c.toUpperCase());
}
function isImageUrl(url) {
  return /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url || "");
}
function SubmissionDetail() {
  const { submission } = useLoaderData();
  if (!submission) {
    return /* @__PURE__ */ jsx(Page, { backAction: { content: "Submissions", url: "/app" }, title: "Not found", children: /* @__PURE__ */ jsx(LegacyCard, { sectioned: true, children: /* @__PURE__ */ jsx(EmptyState, { heading: "Submission not found", image: "", children: /* @__PURE__ */ jsx("p", { children: "This submission may have been deleted." }) }) }) });
  }
  const meta = FORM_META$1[submission.form_type] || {
    label: submission.form_type || "Unknown",
    tone: "new"
  };
  const payload = submission.payload && typeof submission.payload === "object" ? submission.payload : {};
  const payloadEntries = Object.entries(payload).filter(
    ([key, value]) => !HIDDEN_PAYLOAD_KEYS.has(key) && value !== null && value !== void 0 && String(value).trim() !== ""
  );
  return /* @__PURE__ */ jsx(
    Page,
    {
      backAction: { content: "Submissions", url: "/app" },
      title: submission.email || submission.company || "Submission",
      titleMetadata: /* @__PURE__ */ jsxs(InlineStack, { gap: "200", children: [
        /* @__PURE__ */ jsx(Badge, { tone: meta.tone, children: meta.label }),
        submission.email_status === "true" ? /* @__PURE__ */ jsx(Badge, { tone: "success", children: "Sent" }) : /* @__PURE__ */ jsx(Badge, { tone: "critical", children: "Failed" })
      ] }),
      children: /* @__PURE__ */ jsxs(BlockStack, { gap: "400", children: [
        /* @__PURE__ */ jsx(LegacyCard, { title: "Source", sectioned: true, children: /* @__PURE__ */ jsxs(BlockStack, { gap: "300", children: [
          /* @__PURE__ */ jsxs(Text, { variant: "bodySm", children: [
            /* @__PURE__ */ jsx("strong", { children: "Form:" }),
            " ",
            meta.label
          ] }),
          /* @__PURE__ */ jsxs(Text, { variant: "bodySm", children: [
            /* @__PURE__ */ jsx("strong", { children: "Product:" }),
            " ",
            submission.product_url ? /* @__PURE__ */ jsx(Link$1, { url: submission.product_url, target: "_blank", children: submission.product_title || submission.product_handle || submission.product_url }) : submission.product_title || submission.product_handle || "N/A"
          ] }),
          submission.product_handle && /* @__PURE__ */ jsxs(Text, { variant: "bodySm", children: [
            /* @__PURE__ */ jsx("strong", { children: "Handle:" }),
            " ",
            submission.product_handle
          ] }),
          /* @__PURE__ */ jsxs(Text, { variant: "bodySm", children: [
            /* @__PURE__ */ jsx("strong", { children: "Submitted:" }),
            " ",
            submission.created_at ? new Date(submission.created_at).toLocaleString() : "—"
          ] })
        ] }) }),
        submission.media_url && /* @__PURE__ */ jsx(LegacyCard, { title: "Attachment", sectioned: true, children: /* @__PURE__ */ jsxs(InlineStack, { gap: "300", blockAlign: "center", children: [
          isImageUrl(submission.media_url) && /* @__PURE__ */ jsx(
            Thumbnail,
            {
              source: submission.media_url,
              alt: submission.media_name || "Attachment",
              size: "large"
            }
          ),
          /* @__PURE__ */ jsx(Link$1, { url: submission.media_url, target: "_blank", children: submission.media_name || "Download file" })
        ] }) }),
        /* @__PURE__ */ jsx(LegacyCard, { title: "Submitted details", sectioned: true, children: /* @__PURE__ */ jsxs(BlockStack, { gap: "300", children: [
          /* @__PURE__ */ jsx(Divider, {}),
          payloadEntries.length === 0 ? /* @__PURE__ */ jsx(Text, { variant: "bodySm", tone: "subdued", children: "No additional fields." }) : payloadEntries.map(([key, value]) => /* @__PURE__ */ jsxs(Text, { variant: "bodySm", children: [
            /* @__PURE__ */ jsxs("strong", { children: [
              humanize(key),
              ":"
            ] }),
            " ",
            String(value)
          ] }, key))
        ] }) })
      ] })
    }
  );
}
const route14 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: SubmissionDetail,
  loader: loader$1
}, Symbol.toStringTag, { value: "Module" }));
const loader = async ({ request }) => {
  await authenticate.admin(request);
  try {
    const submissions = await listFormSubmissions();
    return json({ submissions, error: null });
  } catch (err) {
    console.error("Failed to load form submissions:", err);
    return json({ submissions: [], error: err.message });
  }
};
const FORM_META = {
  shipping_form: { label: "Shipping Info", tone: "info" },
  request_quote: { label: "Quote Request", tone: "attention" }
};
function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d) ? "—" : d.toLocaleString();
}
function Index() {
  const { submissions, error } = useLoaderData();
  const navigate = useNavigate();
  const rows = submissions.map((item) => {
    const meta = FORM_META[item.form_type] || {
      label: item.form_type || "Unknown",
      tone: "new"
    };
    return [
      /* @__PURE__ */ jsx(Badge, { tone: meta.tone, children: meta.label }),
      item.email || "N/A",
      item.phone || "N/A",
      item.product_url ? /* @__PURE__ */ jsx(Link$1, { url: item.product_url, target: "_blank", children: item.product_handle || item.product_title || "View product" }) : item.product_handle || item.product_title || "N/A",
      item.media_url ? /* @__PURE__ */ jsx(Link$1, { url: item.media_url, target: "_blank", children: item.media_name || "View file" }) : "—",
      item.email_status === "true" ? /* @__PURE__ */ jsx(Badge, { tone: "success", children: "Sent" }) : /* @__PURE__ */ jsx(Badge, { tone: "critical", children: "Failed" }),
      formatDate(item.created_at),
      /* @__PURE__ */ jsx(Tooltip, { content: "View submission", children: /* @__PURE__ */ jsx(
        Button,
        {
          onClick: () => navigate(`/app/submissions/${item.id}`),
          icon: ViewIcon,
          accessibilityLabel: "View submission"
        }
      ) })
    ];
  });
  return /* @__PURE__ */ jsxs(Page, { title: "Form Submissions", children: [
    error && /* @__PURE__ */ jsx("div", { style: { marginBottom: "1rem" }, children: /* @__PURE__ */ jsx(Banner, { tone: "critical", title: "Could not load submissions", children: /* @__PURE__ */ jsx("p", { children: error }) }) }),
    /* @__PURE__ */ jsx(LegacyCard, { children: submissions.length === 0 && !error ? /* @__PURE__ */ jsx(
      EmptyState,
      {
        heading: "No form submissions yet",
        image: "https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png",
        children: /* @__PURE__ */ jsx("p", { children: "Shipping Info and Quote Request submissions from the storefront will appear here." })
      }
    ) : /* @__PURE__ */ jsx(
      DataTable,
      {
        columnContentTypes: [
          "text",
          "text",
          "text",
          "text",
          "text",
          "text",
          "text",
          "text"
        ],
        headings: [
          "Form",
          "Email",
          "Phone",
          "Product",
          "Attachment",
          "Status",
          "Submitted",
          "Actions"
        ],
        rows,
        footerContent: `Showing ${rows.length} of ${rows.length} results`
      }
    ) })
  ] });
}
const route15 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: Index,
  loader
}, Symbol.toStringTag, { value: "Module" }));
const serverManifest = { "entry": { "module": "/assets/entry.client-CCetTxSu.js", "imports": ["/assets/components-Df0w2LiA.js"], "css": [] }, "routes": { "root": { "id": "root", "parentId": void 0, "path": "", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/root-CIjoxbYf.js", "imports": ["/assets/components-Df0w2LiA.js"], "css": [] }, "routes/webhooks.app.scopes_update": { "id": "routes/webhooks.app.scopes_update", "parentId": "root", "path": "webhooks/app/scopes_update", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/webhooks.app.scopes_update-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/webhooks.app.uninstalled": { "id": "routes/webhooks.app.uninstalled", "parentId": "root", "path": "webhooks/app/uninstalled", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/webhooks.app.uninstalled-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/api.save-shipping-info": { "id": "routes/api.save-shipping-info", "parentId": "root", "path": "api/save-shipping-info", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/api.save-shipping-info-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/api.save-shipping": { "id": "routes/api.save-shipping", "parentId": "root", "path": "api/save-shipping", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/api.save-shipping-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/api.eps.register": { "id": "routes/api.eps.register", "parentId": "root", "path": "api/eps/register", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/api.eps.register-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/api.eps.staged": { "id": "routes/api.eps.staged", "parentId": "root", "path": "api/eps/staged", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/api.eps.staged-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/api.eps.upload": { "id": "routes/api.eps.upload", "parentId": "root", "path": "api/eps/upload", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/api.eps.upload-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/api.upload": { "id": "routes/api.upload", "parentId": "root", "path": "api/upload", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/api.upload-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/auth.login": { "id": "routes/auth.login", "parentId": "root", "path": "auth/login", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/route-Bwy9g9h5.js", "imports": ["/assets/components-Df0w2LiA.js", "/assets/styles-3X1Sl-w8.js", "/assets/Page-BvWabV9L.js", "/assets/context-BNaXih0K.js"], "css": [] }, "routes/emailsend": { "id": "routes/emailsend", "parentId": "root", "path": "emailsend", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/emailsend-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/auth.$": { "id": "routes/auth.$", "parentId": "root", "path": "auth/*", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/auth._-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/_index": { "id": "routes/_index", "parentId": "root", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/route-BJV-LXEe.js", "imports": ["/assets/components-Df0w2LiA.js"], "css": ["/assets/route-Cnm7FvdT.css"] }, "routes/app": { "id": "routes/app", "parentId": "root", "path": "app", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": true, "module": "/assets/app-daYT2rQu.js", "imports": ["/assets/components-Df0w2LiA.js", "/assets/styles-3X1Sl-w8.js", "/assets/context-BNaXih0K.js"], "css": [] }, "routes/app.submissions.$id": { "id": "routes/app.submissions.$id", "parentId": "routes/app", "path": "submissions/:id", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/app.submissions._id-ka9ID3Z3.js", "imports": ["/assets/components-Df0w2LiA.js", "/assets/Page-BvWabV9L.js", "/assets/Link-B9FjQ-4J.js", "/assets/context-BNaXih0K.js"], "css": [] }, "routes/app._index": { "id": "routes/app._index", "parentId": "routes/app", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/app._index-rO_Mu1o7.js", "imports": ["/assets/components-Df0w2LiA.js", "/assets/Page-BvWabV9L.js", "/assets/Link-B9FjQ-4J.js", "/assets/context-BNaXih0K.js"], "css": [] } }, "url": "/assets/manifest-e9ce172d.js", "version": "e9ce172d" };
const mode = "production";
const assetsBuildDirectory = "build\\client";
const basename = "/";
const future = { "v3_fetcherPersist": true, "v3_relativeSplatPath": true, "v3_throwAbortReason": true, "v3_routeConfig": true, "v3_singleFetch": false, "v3_lazyRouteDiscovery": true, "unstable_optimizeDeps": false };
const isSpaMode = false;
const publicPath = "/";
const entry = { module: entryServer };
const routes = {
  "root": {
    id: "root",
    parentId: void 0,
    path: "",
    index: void 0,
    caseSensitive: void 0,
    module: route0
  },
  "routes/webhooks.app.scopes_update": {
    id: "routes/webhooks.app.scopes_update",
    parentId: "root",
    path: "webhooks/app/scopes_update",
    index: void 0,
    caseSensitive: void 0,
    module: route1
  },
  "routes/webhooks.app.uninstalled": {
    id: "routes/webhooks.app.uninstalled",
    parentId: "root",
    path: "webhooks/app/uninstalled",
    index: void 0,
    caseSensitive: void 0,
    module: route2
  },
  "routes/api.save-shipping-info": {
    id: "routes/api.save-shipping-info",
    parentId: "root",
    path: "api/save-shipping-info",
    index: void 0,
    caseSensitive: void 0,
    module: route3
  },
  "routes/api.save-shipping": {
    id: "routes/api.save-shipping",
    parentId: "root",
    path: "api/save-shipping",
    index: void 0,
    caseSensitive: void 0,
    module: route4
  },
  "routes/api.eps.register": {
    id: "routes/api.eps.register",
    parentId: "root",
    path: "api/eps/register",
    index: void 0,
    caseSensitive: void 0,
    module: route5
  },
  "routes/api.eps.staged": {
    id: "routes/api.eps.staged",
    parentId: "root",
    path: "api/eps/staged",
    index: void 0,
    caseSensitive: void 0,
    module: route6
  },
  "routes/api.eps.upload": {
    id: "routes/api.eps.upload",
    parentId: "root",
    path: "api/eps/upload",
    index: void 0,
    caseSensitive: void 0,
    module: route7
  },
  "routes/api.upload": {
    id: "routes/api.upload",
    parentId: "root",
    path: "api/upload",
    index: void 0,
    caseSensitive: void 0,
    module: route8
  },
  "routes/auth.login": {
    id: "routes/auth.login",
    parentId: "root",
    path: "auth/login",
    index: void 0,
    caseSensitive: void 0,
    module: route9
  },
  "routes/emailsend": {
    id: "routes/emailsend",
    parentId: "root",
    path: "emailsend",
    index: void 0,
    caseSensitive: void 0,
    module: route10
  },
  "routes/auth.$": {
    id: "routes/auth.$",
    parentId: "root",
    path: "auth/*",
    index: void 0,
    caseSensitive: void 0,
    module: route11
  },
  "routes/_index": {
    id: "routes/_index",
    parentId: "root",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route12
  },
  "routes/app": {
    id: "routes/app",
    parentId: "root",
    path: "app",
    index: void 0,
    caseSensitive: void 0,
    module: route13
  },
  "routes/app.submissions.$id": {
    id: "routes/app.submissions.$id",
    parentId: "routes/app",
    path: "submissions/:id",
    index: void 0,
    caseSensitive: void 0,
    module: route14
  },
  "routes/app._index": {
    id: "routes/app._index",
    parentId: "routes/app",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route15
  }
};
export {
  serverManifest as assets,
  assetsBuildDirectory,
  basename,
  entry,
  future,
  isSpaMode,
  mode,
  publicPath,
  routes
};
