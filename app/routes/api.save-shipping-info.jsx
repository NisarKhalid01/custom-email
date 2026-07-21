import { json } from '@remix-run/node';
import nodemailer from 'nodemailer';
import { insertFormSubmission } from '../lib/supabase.server';

// Internal notification recipients. Add/remove emails here as needed.
const NOTIFY_RECIPIENTS = [
  "sales@logomatcentral.com",
];

// Reply-To address applied to every outgoing email.
const REPLY_TO = "sales@logomatcentral.com";

export async function action({ request }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  try {
    const data = await request.json();
    // Customer email from the form (may be missing/blank).
    const customerEmail = (data.email || "").trim();
    const hasCustomerEmail = customerEmail !== "";
    // Which store + product page the form was submitted from (added to the form JS).
    const shop = data.shop || process.env.SHOPIFY_SHOP || null;
    const productUrl = data.product_url || null;
    const productHandle = data.product_handle || null;
    let transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        // BACKUP senders (kept for reference):
        // user: 'sales.logomat@gmail.com', pass: "Sales@logomat@123*",
        user: 'logomatcentral.sales@gmail.com',
        pass: "jaotjhnzpzkxjani",
      },
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
      replyTo: hasCustomerEmail ? customerEmail : REPLY_TO,
      to: NOTIFY_RECIPIENTS.join(", "),
      subject: 'Shipping Info',
      html: email,
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

    // Persist to Supabase. Never let a DB hiccup fail the customer's submission
    // (the emails already went out), so log and continue on error.
    try {
      await insertFormSubmission({
        form_type: "shipping_form",
        shop,
        email: data.email || null,
        phone: data.phone || null,
        company: data.company || null,
        name: data.name || null,
        product_url: productUrl,
        product_handle: productHandle,
        product_title: data.title || null,
        email_status: emailStatus,
        payload: data,
      });
    } catch (dbErr) {
      console.error("Failed to save shipping_form submission to Supabase:", dbErr);
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
  } catch (error) {
    console.error("Error saving shipping info:", error);

    return json(
      { error: 'Failed to save shipping info' },
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  }
}

export async function loader({ request }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  return new Response('Method Not Allowed', {
    status: 405,
    headers: {
      'Allow': 'POST, OPTIONS',
    },
  });
}
