require("dotenv").config();
const nodemailer = require("nodemailer");

function createTransporter() {
  require("dotenv").config(); // Refresh env variables
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";

  if (!host || !user || !pass) {
    console.warn(`[EMAIL WARNING] Cannot send email: SMTP_HOST (${host || "empty"}), SMTP_USER (${user || "empty"}), or SMTP_PASS is missing in .env`);
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

function getRecipientEmail(record) {
  return String(record.email || record.authSignatoryEmail || "").trim();
}

function getFromAddress() {
  return process.env.EMAIL_FROM || process.env.SMTP_USER || '"KYC Support" <no-reply@kycapp.com>';
}

/**
 * Sends an email when a KYC application is APPROVED by Admin.
 */
async function sendApprovalEmail(record) {
  const recipient = getRecipientEmail(record);
  if (!recipient) {
    console.warn(`[EmailService] No recipient email found for KYC record ${record._id}`);
    return false;
  }

  const transporter = createTransporter();
  if (!transporter) {
    console.info(`[EmailService] SMTP credentials not set (SMTP_HOST/SMTP_USER). Skipping approval email to ${recipient}`);
    return false;
  }

  const entityName = record.entityName || "Your Entity";
  const mailOptions = {
    from: getFromAddress(),
    to: recipient,
    subject: `KYC Application Approved - ${entityName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #1f3b57; margin-top: 0;">KYC Application Approved</h2>
        <p>Dear Customer,</p>
        <p>We are pleased to inform you that the KYC application for <strong>${entityName}</strong> has been <strong>APPROVED</strong> by our admin team.</p>
        
        <div style="background-color: #f4f8fb; padding: 15px; border-left: 4px solid #28a745; margin: 20px 0;">
          <p style="margin: 0; font-weight: bold; color: #155724;">Status: Approved</p>
          <p style="margin: 5px 0 0 0; font-size: 14px; color: #555;">Application Reference ID: <code>${record.digio?.referenceId || record._id}</code></p>
        </div>

        <h3>Next Steps:</h3>
        <ul>
          <li>If required, each Director/Authorized Signatory must complete individual DigiO KYC verification.</li>
          <li>Once all director KYCs are verified, the Master Agent Onboarding Agreement will be dispatched for Aadhaar e-signing.</li>
        </ul>

        <p>If you have any questions, feel free to reply to this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #888;">Escrowind Private Limited — Compliance & Operations Team</p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`\n==================================================`);
    console.log(`[EMAIL SUCCESS] Approval email sent successfully!`);
    console.log(`Recipient: ${recipient}`);
    console.log(`Message ID: ${info.messageId}`);
    console.log(`==================================================\n`);
    return true;
  } catch (error) {
    console.error(`[EMAIL ERROR] Failed to send approval email to ${recipient}:`, error.message);
    return false;
  }
}

/**
 * Sends an email when a KYC application is REJECTED by Admin.
 */
async function sendRejectionEmail(record, reason) {
  const recipient = getRecipientEmail(record);
  if (!recipient) {
    console.warn(`[EMAIL WARNING] Cannot send rejection email: No recipient email found for KYC record ${record._id}`);
    return false;
  }

  const transporter = createTransporter();
  if (!transporter) {
    return false;
  }

  const entityName = record.entityName || "Your Entity";
  const rejectionReason = reason || record.rejectionReason || "Requirements not met.";

  const mailOptions = {
    from: getFromAddress(),
    to: recipient,
    subject: `KYC Application Status Update - ${entityName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #dc3545; margin-top: 0;">KYC Application Status Update</h2>
        <p>Dear Customer,</p>
        <p>Thank you for submitting your KYC application for <strong>${entityName}</strong>.</p>
        
        <div style="background-color: #fdf2f2; padding: 15px; border-left: 4px solid #dc3545; margin: 20px 0;">
          <p style="margin: 0; font-weight: bold; color: #721c24;">Status: Rejected</p>
          <p style="margin: 10px 0 0 0; font-size: 14px; color: #333;"><strong>Reason for Rejection:</strong></p>
          <p style="margin: 5px 0 0 0; font-size: 14px; color: #555; font-style: italic;">"${rejectionReason}"</p>
        </div>

        <p>Please review the reason above and make the necessary corrections before submitting a fresh application or contacting our support team.</p>

        <p>If you need assistance, please contact our support desk.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #888;">Escrowind Private Limited — Compliance & Operations Team</p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`\n==================================================`);
    console.log(`[EMAIL SUCCESS] Rejection email sent successfully!`);
    console.log(`Recipient: ${recipient}`);
    console.log(`Rejection Reason: ${rejectionReason}`);
    console.log(`Message ID: ${info.messageId}`);
    console.log(`==================================================\n`);
    return true;
  } catch (error) {
    console.error(`[EMAIL ERROR] Failed to send rejection email to ${recipient}:`, error.message);
    return false;
  }
}

/**
 * Sends an email to a Director to complete their individual DigiO KYC verification.
 */
async function sendDirectorKycEmail(director, record) {
  const recipient = String(director.email || "").trim();
  if (!recipient) {
    console.warn(`[EMAIL WARNING] Cannot send director KYC email: No email for director ${director.name}`);
    return false;
  }

  const transporter = createTransporter();
  if (!transporter) return false;

  const entityName = record.entityName || "Your Entity";
  const directorName = director.name || "Director";
  const kycLink = director.digio?.accessLink || `https://app.digio.in/#/gateway/login/${director.digio?.kid || ""}`;

  const mailOptions = {
    from: getFromAddress(),
    to: recipient,
    subject: `Director KYC Verification Required - ${entityName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #1f3b57; margin-top: 0;">Director KYC Verification</h2>
        <p>Dear <strong>${directorName}</strong>,</p>
        <p>The corporate KYC application for <strong>${entityName}</strong> has been approved by admin. As a designated Director / Partner, you are required to complete your individual KYC verification.</p>
        
        <div style="background-color: #f4f8fb; padding: 15px; border-left: 4px solid #1f3b57; margin: 20px 0;">
          <p style="margin: 0; font-weight: bold; color: #1f3b57;">Entity: ${entityName}</p>
          <p style="margin: 5px 0 0 0; font-size: 14px; color: #555;">Designation: ${director.designation || "Director"}</p>
          <p style="margin: 5px 0 0 0; font-size: 14px; color: #555;">KYC Reference: <code>${director.digio?.referenceId || director.digio?.kid || "N/A"}</code></p>
        </div>

        ${director.digio?.accessLink ? `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${director.digio.accessLink}" target="_blank" style="background-color: #1f3b57; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; display: inline-block;">
            Complete Director KYC Now
          </a>
        </div>
        ` : `
        <p>You will receive an official DigiO KYC verification link directly from DigiO on your email/mobile.</p>
        `}

        <p style="font-size: 13px; color: #666;">Once all directors complete their verification, the Master Onboarding Agreement will be generated for digital signing.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #888;">Escrowind Private Limited — Compliance & Operations Team</p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL SUCCESS] Director KYC email sent to ${recipient} (Message ID: ${info.messageId})`);
    return true;
  } catch (error) {
    console.error(`[EMAIL ERROR] Failed to send director KYC email to ${recipient}:`, error.message);
    return false;
  }
}

/**
 * Sends an email to signers when the Master Agent Agreement is dispatched for signing.
 */
async function sendAgreementSigningEmail(signer, record, signingUrl) {
  const recipient = String(signer.email || signer.identifier || "").trim();
  if (!recipient) return false;

  const transporter = createTransporter();
  if (!transporter) return false;

  const entityName = record.entityName || "Your Entity";
  const signerName = signer.name || "Authorized Signatory";
  const link = signingUrl || `https://ext.digio.in/#/gateway/login/${record.agreement?.documentId || ""}/${encodeURIComponent(recipient)}/`;

  const mailOptions = {
    from: getFromAddress(),
    to: recipient,
    subject: `Action Required: Sign Master Onboarding Agreement - ${entityName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #1f3b57; margin-top: 0;">Master Onboarding Agreement Ready for Signing</h2>
        <p>Dear <strong>${signerName}</strong>,</p>
        <p>All director KYCs have been verified for <strong>${entityName}</strong>. The <strong>Master Agent Onboarding Agreement</strong> is now ready for digital Aadhaar e-signing.</p>
        
        <div style="background-color: #f4f8fb; padding: 15px; border-left: 4px solid #28a745; margin: 20px 0;">
          <p style="margin: 0; font-weight: bold; color: #155724;">Document ID: <code>${record.agreement?.documentId || record.agreement?.providerRequestId || "N/A"}</code></p>
          <p style="margin: 5px 0 0 0; font-size: 14px; color: #555;">Entity: ${entityName}</p>
          <p style="margin: 5px 0 0 0; font-size: 14px; color: #555;">Sign Method: Aadhaar OTP e-Sign</p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${link}" target="_blank" style="background-color: #28a745; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; display: inline-block;">
            Sign Agreement Online
          </a>
        </div>

        <p style="font-size: 13px; color: #666;">After all signers complete their signatures, the agreement and KYC onboarding will be officially marked as COMPLETED.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #888;">Escrowind Private Limited — Compliance & Operations Team</p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL SUCCESS] Agreement signing email sent to ${recipient} (Message ID: ${info.messageId})`);
    return true;
  } catch (error) {
    console.error(`[EMAIL ERROR] Failed to send agreement signing email to ${recipient}:`, error.message);
    return false;
  }
}

/**
 * Sends an email when agreement signing is completed and KYC is fully finalized.
 */
async function sendKycCompletedEmail(record) {
  const recipient = getRecipientEmail(record);
  if (!recipient) return false;

  const transporter = createTransporter();
  if (!transporter) return false;

  const entityName = record.entityName || "Your Entity";

  const mailOptions = {
    from: getFromAddress(),
    to: recipient,
    subject: `KYC & Onboarding Successfully Completed - ${entityName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #28a745; margin-top: 0;">Congratulations! KYC Completed</h2>
        <p>Dear Customer,</p>
        <p>We are delighted to inform you that the KYC process and Master Agent Onboarding Agreement for <strong>${entityName}</strong> have been <strong>FULLY SIGNED &amp; COMPLETED</strong>.</p>
        
        <div style="background-color: #f4f8fb; padding: 15px; border-left: 4px solid #28a745; margin: 20px 0;">
          <p style="margin: 0; font-weight: bold; color: #155724;">Final Status: Completed</p>
          <p style="margin: 5px 0 0 0; font-size: 14px; color: #555;">Document ID: <code>${record.agreement?.documentId || "N/A"}</code></p>
          <p style="margin: 5px 0 0 0; font-size: 14px; color: #555;">Application Reference: <code>${record.digio?.referenceId || record._id}</code></p>
        </div>

        <p>Your business onboarding is complete and your account is now ready for operations.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #888;">Escrowind Private Limited — Compliance & Operations Team</p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL SUCCESS] KYC completed email sent to ${recipient} (Message ID: ${info.messageId})`);
    return true;
  } catch (error) {
    console.error(`[EMAIL ERROR] Failed to send KYC completed email to ${recipient}:`, error.message);
    return false;
  }
}

module.exports = {
  sendApprovalEmail,
  sendRejectionEmail,
  sendDirectorKycEmail,
  sendAgreementSigningEmail,
  sendKycCompletedEmail,
};

