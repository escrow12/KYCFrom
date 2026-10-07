const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");
const agreementConfig = require("../config/agreementConfig");

const LOGO_PATH = path.join(__dirname, "..", "public", "logo.png");

function contentWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function ensureSpace(doc, neededHeight) {
  if (doc.y + neededHeight > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function addHeading(doc, text, level = 2) {
  const fontSize = level === 1 ? 14 : level === 2 ? 11 : 10;
  ensureSpace(doc, 25);
  doc.x = doc.page.margins.left;
  doc.moveDown(0.4);
  doc.fontSize(fontSize).font("Helvetica-Bold").fillColor("#1f3b57").text(text);
  doc.fillColor("#000000");
  doc.moveDown(0.2);
}

function addParagraph(doc, text, options = {}) {
  ensureSpace(doc, 20);
  doc.x = doc.page.margins.left;
  doc.fontSize(9.5).font(options.bold ? "Helvetica-Bold" : options.italic ? "Helvetica-Oblique" : "Helvetica");
  doc.fillColor("#000000").text(text, { align: options.align || "left", lineGap: 2 });
  doc.moveDown(0.3);
}

function formatDate(d = new Date()) {
  const dateObj = new Date(d);
  const day = dateObj.getDate();
  const monthStr = dateObj.toLocaleString("en-US", { month: "long" });
  const year = dateObj.getFullYear();
  return `${day} day of ${monthStr}, ${year}`;
}

/**
 * Generates the Agreement PDF Buffer for a given KYC application record.
 * Follows the Master Agent / API Partner Onboarding Agreement template.
 * @param {Object} record - KycForm document
 * @returns {Promise<Buffer>}
 */
function generateAgreementPdf(record) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 45 });
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const entityName = String(record.entityName || "API PARTNER").toUpperCase();
      const entityType = String(record.entityType || "Company");
      const address = [record.registeredAddress, record.registeredCity, record.registeredState, record.registeredPincode, record.registeredCountry]
        .filter(Boolean)
        .join(", ") || "[Registered Address]";
      const gstin = record.gstNo || "";
      const website = record.website || "[Not Provided]";
      const agrNumber = `AGR-${record._id.toString().slice(-6).toUpperCase()}-${new Date().getFullYear()}`;
      const effectiveDate = formatDate(record.createdAt || new Date());

      // Header Logo
      if (fs.existsSync(LOGO_PATH)) {
        try {
          doc.image(LOGO_PATH, doc.page.margins.left, doc.y, { height: 35 });
          doc.moveDown(2);
        } catch {
          // ignore logo fail
        }
      }

      // Title Block
      doc.fontSize(13).font("Helvetica-Bold").fillColor("#1f3b57").text("MASTER AGENT / API PARTNER ONBOARDING AGREEMENT", { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(9.5).font("Helvetica").fillColor("#000000");
      doc.text(`Agreement No.: ${agrNumber}`, { align: "left" });
      doc.text(`Version: ${agreementConfig.agreementVersion}`, { align: "left" });
      doc.moveDown(0.5);

      addParagraph(doc, `This Master Agent / API Partner Onboarding Agreement ("Agreement") is executed on this ${effectiveDate} ("Effective Date").`);
      
      addHeading(doc, "BETWEEN", 3);
      addParagraph(doc, `${agreementConfig.companyName}, a company incorporated under the Companies Act, 2013, having its registered office at India (hereinafter referred to as "${agreementConfig.brandingTerm}", which expression shall unless repugnant to the context include its successors, affiliates and permitted assigns);`);

      addHeading(doc, "AND", 3);
      addParagraph(doc, `${entityName}, a ${entityType} duly organized under the laws of India and having its principal office at ${address} (hereinafter referred to as the "API Partner", which expression shall include its successors and permitted assigns).`);

      addParagraph(doc, `${agreementConfig.brandingTerm} and the API Partner are individually referred to as a "Party" and collectively as the "Parties".`);
      if (gstin) addParagraph(doc, `GSTIN of API Partner: ${gstin}`, { bold: true });

      addHeading(doc, "RECITALS", 2);
      addParagraph(doc, `WHEREAS ${agreementConfig.brandingTerm} is engaged in providing onboarding, compliance, technology integration, operational support, consulting, transaction facilitation and related services in connection with the Bharat Bill Payment System ("BBPS"), digital payment ecosystem and related financial technology infrastructure, and has established relationships with various BBPS Operating Units (BBPOUs), technology providers, banking institutions, payment processors, aggregators and ecosystem participants.`);
      addParagraph(doc, `WHEREAS the API Partner desires to avail onboarding, integration, technology, operational and compliance support services from ${agreementConfig.brandingTerm} for participation in the BBPS ecosystem, including but not limited to bill aggregation, payment collection, and related services.`);
      addParagraph(doc, `WHEREAS ${agreementConfig.brandingTerm} has agreed to provide such services on the terms and conditions set forth herein, subject to all applicable laws, regulations, and approvals from NPCI, RBI, and BBPOUs.`);
      addParagraph(doc, 'NOW THEREFORE, in consideration of the mutual covenants, promises, representations, warranties, and conditions contained herein, the Parties agree as follows:');

      addHeading(doc, "ARTICLE 1: DEFINITIONS AND INTERPRETATION", 2);
      addParagraph(doc, '1.1 Definitions: In this Agreement, unless the context otherwise requires, terms shall have the following meanings: "Affiliate", "Agreement", "AML/CFT", "API", "Applicable Laws" (including PSS Act 2007, IT Act 2000, DPDP Act 2023, PMLA 2002), "BBPS", "BBPOU", "Business Day", "Confidential Information", "Customer Data", "Effective Date", "NPCI", "RBI", "Services", "Term", and "Transaction".');

      addHeading(doc, "ARTICLE 2: APPOINTMENT AND SCOPE", 2);
      addParagraph(doc, `2.1 Appointment: ${agreementConfig.brandingTerm} hereby appoints the API Partner as a non-exclusive API partner/agent for participating in the BBPS ecosystem.`);
      addParagraph(doc, "2.2 Independent Contractor Status: The relationship between the Parties is that of independent contractors.");
      addParagraph(doc, `2.3 No Authority to Bind: The API Partner shall have no authority to bind or represent ${agreementConfig.brandingTerm} unless expressly authorized in writing.`);

      addHeading(doc, "ARTICLE 3: BUSINESS DESCRIPTION AND USE CASE", 2);
      addParagraph(doc, `3.1 Business of API Partner: ${entityName} is engaged in digital payment facilitation and bill aggregation services. Website: ${website}.`);
      addParagraph(doc, "3.2 Permitted Use Cases: The API Partner shall use the Services only for bill payment processing and collection services as permitted under BBPS guidelines.");
      addParagraph(doc, "3.3 Prohibited Use Cases: Illegal/prohibited transactions including gambling, betting, cryptocurrency, or money laundering are strictly prohibited.");

      addHeading(doc, "ARTICLE 4: SCOPE OF SERVICES", 2);
      addParagraph(doc, `${agreementConfig.brandingTerm} shall provide Onboarding Services, Technology Services (API integration, sandbox access up to 30 days, UAT assistance), Compliance Services, and Operational Support.`);

      addHeading(doc, "ARTICLE 5: REGULATORY COMPLIANCE", 2);
      addParagraph(doc, "The API Partner shall at all times comply with all Applicable Laws including PSS Act, PMLA, DPDP Act, IT Act, and all NPCI/RBI guidelines relating to BBPS.");

      addHeading(doc, "ARTICLE 6: KYC, AML AND DUE DILIGENCE", 2);
      addParagraph(doc, "The API Partner shall submit all required KYC documents, conduct periodic KYC refresh every 2 years, file STRs with FIU-IND, and maintain records for at least 5 years.");

      addHeading(doc, "ARTICLE 7: FEES, CHARGES, AND PAYMENT TERMS", 2);
      addParagraph(doc, "The API Partner shall pay all fees per the commercial schedule. Invoices are due within 7 calendar days. Late payments attract interest at 18% p.a. Fees are non-refundable (except Security Deposit).");

      addHeading(doc, "ARTICLE 8: CUSTOMER DATA AND PRIVACY", 2);
      addParagraph(doc, `Customer Data shall be processed only for permitted purposes under DPDP Act 2023. Data breach notifications must be sent to ${agreementConfig.brandingTerm} within 24 hours.`);

      addHeading(doc, "ARTICLE 9: INFORMATION SECURITY", 2);
      addParagraph(doc, "The API Partner shall maintain TLS 1.2+ encryption in transit, AES-256 at rest, quarterly vulnerability scans, and an incident response plan.");

      addHeading(doc, "ARTICLE 10: ANTI-FRAUD AND ANTI-MONEY LAUNDERING", 2);
      addParagraph(doc, "Real-time transaction monitoring and customer sanctions screening must be maintained. Suspicious transactions may be blocked immediately.");

      addHeading(doc, "ARTICLE 11: AUDIT RIGHTS", 2);
      addParagraph(doc, `${agreementConfig.brandingTerm} may audit the API Partner's operations, systems, and records annually or for cause without prior notice.`);

      addHeading(doc, "ARTICLE 12: INTELLECTUAL PROPERTY", 2);
      addParagraph(doc, `All IP in ${agreementConfig.brandingTerm} platform and APIs remains exclusive property of ${agreementConfig.brandingTerm}.`);

      addHeading(doc, "ARTICLE 13: CONFIDENTIALITY", 2);
      addParagraph(doc, "Confidential Information shall be kept confidential for 10 years post-termination. Trade secrets survive indefinitely.");

      addHeading(doc, "ARTICLE 14: NON-CIRCUMVENTION", 2);
      addParagraph(doc, `API Partner shall not approach ${agreementConfig.brandingTerm} introduced parties during Term and for 5 years after termination. Liquidated damages: INR 50,00,000/- per occurrence.`);

      addHeading(doc, "ARTICLE 15: NON-SOLICITATION", 2);
      addParagraph(doc, `API Partner shall not solicit ${agreementConfig.brandingTerm} employees or contractors during Term and for 3 years post-termination.`);

      addHeading(doc, "ARTICLE 16 - 22: GENERAL COVENANTS & FORCE MAJEURE", 2);
      addParagraph(doc, "Covering Representations & Warranties, Indemnity (unlimited for fraud/breach), Limitation of Liability, Suspension, Term & Termination (30 days notice), and Force Majeure.");

      addHeading(doc, "ARTICLE 25 - 27: DISPUTE RESOLUTION & GOVERNING LAW", 2);
      addParagraph(doc, "Governed by the laws of India. Arbitration at New Delhi, India under Arbitration and Conciliation Act 1996.");

      // SCHEDULE A
      addHeading(doc, "SCHEDULE A: DOCUMENT CHECKLIST", 2);
      const docsList = [
        "1. Certificate of Incorporation / Registration",
        "2. PAN Card of Entity",
        "3. GST Registration Certificate",
        "4. Board Resolution / Partner Resolution",
        "5. MOA & AOA (for companies)",
        "6. Address Proof of Registered Office",
        "7. Bank Account Details (Cancelled Cheque)",
        "8. Director / Partner KYC Documents",
        "9. Beneficial Ownership (UBO) Declaration",
        "10. Board Approved AML/CFT Policy",
      ];
      docsList.forEach((item) => addParagraph(doc, item));

      // SCHEDULE B
      addHeading(doc, "SCHEDULE B: COMMERCIALS AND FEES", 2);
      const feeTable = agreementConfig.feeSchedule;
      
      let y = doc.y;
      const colX = doc.page.margins.left;
      const colWidths = [150, 80, 80, 80, 80];
      ensureSpace(doc, 80);
      
      doc.fontSize(8.5).font("Helvetica-Bold");
      feeTable[0].forEach((h, i) => {
        doc.text(h, colX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y, { width: colWidths[i] });
      });
      doc.y = y + 14;
      doc.font("Helvetica");
      feeTable.slice(1).forEach((row) => {
        y = doc.y;
        row.forEach((v, i) => {
          doc.text(v, colX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y, { width: colWidths[i] });
        });
        doc.y = y + 14;
      });
      doc.x = doc.page.margins.left;
      doc.moveDown(0.8);

      // EXECUTION BLOCK
      ensureSpace(doc, 120);
      addHeading(doc, "EXECUTION & SIGNATURES", 2);
      addParagraph(doc, `For and on behalf of ${agreementConfig.companyName} (${agreementConfig.brandingTerm}):`, { bold: true });
      addParagraph(doc, "Authorized Signatory");
      doc.moveDown(0.5);

      addParagraph(doc, `For and on behalf of ${entityName}:`, { bold: true });
      const directors = record.directors || [];
      if (directors.length > 0) {
        directors.forEach((dir, idx) => {
          addParagraph(doc, `Signer ${idx + 1}: ${dir.name} (${dir.email}) - Designation: ${dir.designation || "Director"}`);
        });
      } else {
        addParagraph(doc, `Authorized Signatory: ${record.authSignatoryName || entityName} (${record.authSignatoryEmail || record.email || "N/A"})`);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = generateAgreementPdf;
