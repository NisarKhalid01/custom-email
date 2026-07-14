import { json } from "@remix-run/node";
import nodemailer from "nodemailer";

// Internal notification recipients. Add/remove emails here as needed.
const NOTIFY_RECIPIENTS = [
  "sales@logomatcentral.com",
  "nisar@inventel.net",
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

  const file = formData.get("attachment");
  const attachments =
    file instanceof File && file.name
      ? [
          {
            filename: file.name,
            content: Buffer.from(await file.arrayBuffer()),
            contentType: file.type,
          },
        ]
      : [];

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      // OLD credentials (kept for reference):
      // user: 'logomatcentral.sales@gmail.com', pass: "gioxgtlzcsbthdnh",
      // user: 'sales.logomat@gmail.com', pass: "Sales@logomat@123*",
      user: 'nisar@inventel.net',
      pass: "cvxamwmzrcfuytst",
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
    await transporter.sendMail({
      // from: '"Mat Order" <logomatcentral.sales@gmail.com>',  // OLD
      // from: '"Mat Order" <sales.logomat@gmail.com>',         // BACKUP
      from: '"Mat Order" <nisar@inventel.net>',
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
        // from: '"Logo Mat Central" <logomatcentral.sales@gmail.com>',  // OLD
        // from: '"Logo Mat Central" <sales.logomat@gmail.com>',         // BACKUP
        from: '"Logo Mat Central" <nisar@inventel.net>',
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
