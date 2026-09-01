import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

interface OrderEmailData {
  id: string | number;
  customer_name: string;
  customer_email: string;
  product_name: string;
  factory_name: string;
}

// Generate a test account on the fly and create a reusable transporter
let transporter: Transporter | null = null;

async function initTransporter() {
  if (transporter) return transporter;

  try {
    // Generate test SMTP service account from ethereal.email
    const testAccount = await nodemailer.createTestAccount();

    // Create a transporter object
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: testAccount.user, // generated ethereal user
        pass: testAccount.pass, // generated ethereal password
      },
    });

    console.log(`[Email Service] Ethereal SMTP Ready. Account: ${testAccount.user}`);
    return transporter;
  } catch (err) {
    console.error("[Email Service] Failed to initialize Ethereal account:", err);
    return null;
  }
}

export async function sendOrderStatusEmail(
  order: OrderEmailData,
  newStatus: string,
) {
  const mailTransporter = await initTransporter();

  if (!mailTransporter) {
    console.warn("Email transporter not ready. Skipping email dispatch.");
    return;
  }

  // Construct email based on status
  let subject = "";
  let messageBody = "";

  if (newStatus === "In production") {
    subject = `Your Opticus Order ${order.id} is now In Production!`;
    messageBody = `
      <h2>Great news, ${order.customer_name}!</h2>
      <p>Your custom 3D frame design (<strong>${order.product_name}</strong>) has been routed to <strong>${order.factory_name}</strong> and is currently in production.</p>
      <p>Our artisans are crafting your frame precisely to your specifications.</p>
      <p>We will notify you again once it has been shipped and delivered!</p>
      <br />
      <p>Best regards,</p>
      <p><strong>Opticus Eyewear Team</strong></p>
    `;
  } else if (newStatus === "Delivered") {
    subject = `Your Opticus Order ${order.id} has been Delivered!`;
    messageBody = `
      <h2>It's here, ${order.customer_name}!</h2>
      <p>Your custom frame (<strong>${order.product_name}</strong>) has been marked as <strong>Delivered</strong>.</p>
      <p>We hope you love your new personalized eyewear. Feel free to share your style on social media!</p>
      <br />
      <p>Best regards,</p>
      <p><strong>Opticus Eyewear Team</strong></p>
    `;
  } else {
    // No email for other statuses like Queued or Pending Payment
    return;
  }

  try {
    const info = await mailTransporter.sendMail({
      from: '"Opticus Notifications" <no-reply@opticus.com>', // sender address
      to: order.customer_email, // list of receivers
      subject: subject, // Subject line
      html: messageBody, // html body
    });

    console.log(`[Email Service] Message sent successfully to ${order.customer_email} (Order ${order.id})`);
    // Preview only available when sending through an Ethereal account
    console.log(`[Email Service] 🟢 PREVIEW URL: ${nodemailer.getTestMessageUrl(info)}`);
  } catch (err) {
    console.error("[Email Service] Failed to send email:", err);
  }
}
