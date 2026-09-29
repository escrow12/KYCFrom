require("dotenv").config();
const nodemailer = require("nodemailer");

async function testEmail() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  console.log("Testing SMTP connection with:", { host, port, user });

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: false, // 587 uses STARTTLS
    auth: { user, pass },
  });

  try {
    console.log("Verifying SMTP connection...");
    await transporter.verify();
    console.log("SUCCESS: SMTP connection verified successfully!");

    console.log("Sending test email to:", user);
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || user,
      to: user,
      subject: "KYC Application System - Email Test",
      html: "<h3>SMTP Email Test Passed!</h3><p>This is a confirmation email from your KYC Application system.</p>",
    });

    console.log("SUCCESS: Email sent successfully! Message ID:", info.messageId);
  } catch (error) {
    console.error("ERROR testing email:", error.message);
  }
}

testEmail();
