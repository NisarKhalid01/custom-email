import { json } from "@remix-run/node";
import nodemailer from "nodemailer";
import { insertFormSubmission } from "../lib/supabase.server";
import { uploadToShopifyFiles } from "../lib/shopify-files.server";

// Internal notification recipients. Add/remove emails here as needed.
const NOTIFY_RECIPIENTS = [
  "sales@logomatcentral.com",
];

// Reply-To address applied to every outgoing email.
const REPLY_TO = "sales@logomatcentral.com";

export const action = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const formData = await request.formData();

  const data = {};
  formData.forEach((value, key) => {
    if (value instanceof File) {
      data[key] = {
        name: value.name,
        type: value.type,
        size: value.size,
      };
    } else {
      data[key] = value;
    }
  });


  // Customer email from the form (may be missing/blank).
  const customerEmail = (data.email || "").trim();
  const hasCustomerEmail = customerEmail !== "";
  // Which store + product page the form was submitted from (added to the form markup).
  const shop = data.shop || process.env.SHOPIFY_SHOP || null;
  const productUrl = data.product_url || null;
  const productHandle = data.product_handle || null;

  const file = formData.get("attachment");
  const hasFile = file instanceof File && file.name;
  const attachments = hasFile
    ? [
        {
          filename: file.name,
          content: Buffer.from(await file.arrayBuffer()),
          contentType: file.type,
        },
      ]
    : [];

  // Store the attachment in Shopify Files so the admin can reference it later.
  // Non-fatal: a failed upload must not block the email / submission.
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
      user: 'logomatcentral.sales@gmail.com',
      pass: "jaotjhnzpzkxjani",
    },
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
      attachments,
    });
    // Only send the customer confirmation when a valid email was provided.
    if (hasCustomerEmail) {
      await transporter.sendMail({
        // from: '"Logo Mat Central" <sales.logomat@gmail.com>',   // BACKUP
        from: '"Logo Mat Central" <logomatcentral.sales@gmail.com>',
        // Reply goes to the company inbox so customer replies reach sales.
        replyTo: REPLY_TO,
        to: customerEmail,
        subject: 'Thank You from Logo Mat Central',
        html: `
          <div style="font-family: Arial, sans-serif; font-size: 15px; color: #333;">
            <p>Dear ${data.name || 'Customer'},</p>
            <p>Thank you for choosing <strong>Logo Mat Central</strong>. We have received your email and will get back to you shortly.</p>
            <p>Our team is reviewing your information and will contact you soon.</p>
            <br>
            <p>Best regards,</p>
            <p><strong>Logo Mat Central Support Team</strong></p>
          </div>
        `,
      });
    }

    const emailStatus = info?.accepted?.length > 0 ? "true" : "false";

    // Persist to Supabase. Non-fatal so a DB hiccup can't fail the submission.
    try {
      await insertFormSubmission({
        form_type: "request_quote",
        shop,
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
        payload: data,
      });
    } catch (dbErr) {
      console.error("Failed to save request_quote submission to Supabase:", dbErr);
    }

    return json(
      { message: 'Shipping info saved successfully' },
      {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
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
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }
    );
  }
};

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  return new Response("Method Not Allowed", {
    status: 405,
    headers: {
      Allow: "POST, OPTIONS",
    },
  });
};
