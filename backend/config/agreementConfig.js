require("dotenv").config();

const agreementConfig = {
  companyName: process.env.AGREEMENT_COMPANY_NAME || "ESCROWIND PRIVATE LIMITED",
  brandingTerm: process.env.AGREEMENT_BRANDING_TERM || "BBPS AI",
  agreementVersion: process.env.AGREEMENT_VERSION || "2.0",
  feeSchedule: [
    ["Fee Type", "Amount (INR)", "Frequency", "Due Date", "Refundable?"],
    ["Onboarding & Setup Fee", process.env.FEE_ONBOARDING || "50,000", "One-Time", "Immediate", "No"],
    ["Security Deposit", process.env.FEE_DEPOSIT || "1,00,000", "One-Time", "On Signing", "Yes"],
    ["Annual Support & Maintenance", process.env.FEE_MAINTENANCE || "25,000", "Annual", "Yearly", "No"],
  ],
};

module.exports = agreementConfig;
