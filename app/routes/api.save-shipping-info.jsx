import { json } from '@remix-run/node';
import nodemailer from 'nodemailer';

// Internal notification recipients. Add/remove emails here as needed.
const NOTIFY_RECIPIENTS = [
  "sales@logomatcentral.com",
  "nisar@inventel.net",
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
    let transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        // OLD credentials (kept for reference):
        // user: 'logomatcentral.sales@gmail.com', pass: "gioxgtlzcsbthdnh",
        // user: 'sales.logomat@gmail.com', pass: "Sales@logomat@123*",   // BACKUP
        user: 'nisar@inventel.net',
        pass: "cvxamwmzrcfuytst",
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
      // from: '"Shipping Info" <logomatcentral.sales@gmail.com>',  // OLD
      // from: '"Shipping Info" <sales.logomat@gmail.com>',         // BACKUP
      from: '"Shipping Info" <nisar@inventel.net>',
      // Reply goes to the customer who submitted the form (falls back to company inbox).
      replyTo: hasCustomerEmail ? customerEmail : REPLY_TO,
      to: NOTIFY_RECIPIENTS.join(", "),
      subject: 'Shipping Info',
      html: email,
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
    // let emailStatus = info.accepted.length > 0 ? 'true' : 'false';
    // await prisma.shippingData.create({
    //   data: {
    //     company: data.company,
    //     street: data.street,
    //     apt: data.apt,
    //     city: data.city,
    //     state: data.state,
    //     zip: data.zip,
    //     loading_dock: data.loading_dock,
    //     liftgate: data.liftgate,
    //     email: data.email,
    //     phone: data.phone,
    //     cartons: data.cartons,
    //     comments: data.comments,
    //     variant_id: data.variant_id,
    //     emailStatus: emailStatus,
    //   },
    // });

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
