
const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");
const agreementConfig = require("../config/agreementConfig");

const LOGO_PATH = path.join(__dirname, "..", "public", "logo.png");
const SIGNATURE_PATH = path.join(
  __dirname, "..", "public", "images", "signature.jpeg"
);

function ensureSpace(doc, neededHeight = 30) {
  if (doc.y + neededHeight > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function addHeading(doc, text, level = 2) {
  ensureSpace(doc, 34);
  doc.x = doc.page.margins.left;
  doc.moveDown(0.35);
  doc.font("Helvetica-Bold")
    .fontSize(level === 1 ? 13 : level === 2 ? 11 : 10)
    .fillColor("#1f3b57")
    .text(text, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    });
  doc.fillColor("#000000").moveDown(0.2);
}

function addParagraph(doc, text, options = {}) {
  doc.font(
    options.bold
      ? "Helvetica-Bold"
      : options.italic
        ? "Helvetica-Oblique"
        : "Helvetica"
  ).fontSize(options.fontSize || 9.2).fillColor("#000000");

  const width =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const height =
    doc.heightOfString(String(text ?? ""), {
      width,
      lineGap: 2,
    }) + 12;

  ensureSpace(
    doc,
    Math.min(
      height,
      doc.page.height - doc.page.margins.top - doc.page.margins.bottom
    )
  );

  doc.x = doc.page.margins.left;
  doc.text(String(text ?? ""), {
    width,
    align: options.align || "left",
    lineGap: 2,
  });

  doc.moveDown(0.35);
}

function addTable(doc, headers, rows, widths) {
  const totalWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const scale = totalWidth / widths.reduce((a, b) => a + b, 0);
  const colWidths = widths.map((w) => w * scale);

  const drawRow = (values, isHeader = false) => {
    const font = isHeader ? "Helvetica-Bold" : "Helvetica";
    const fontSize = isHeader ? 7.6 : 7.4;
    const padding = 5;

    const heights = values.map((value, i) =>
      doc.heightOfString(String(value ?? ""), {
        width: colWidths[i] - padding * 2,
        font,
        fontSize,
        lineGap: 1,
      }) + padding * 2
    );

    const rowHeight = Math.max(22, ...heights);
    ensureSpace(doc, rowHeight + 2);

    const startX = doc.page.margins.left;
    const startY = doc.y;
    let x = startX;

    values.forEach((value, i) => {
      doc.save();
      doc.lineWidth(0.5).strokeColor("#666666");

      if (isHeader) {
        doc.rect(x, startY, colWidths[i], rowHeight)
          .fillAndStroke("#eaf0f5", "#666666");
      } else {
        doc.rect(x, startY, colWidths[i], rowHeight).stroke();
      }

      doc.restore();

      doc.font(font).fontSize(fontSize).fillColor("#000000")
        .text(String(value ?? ""), x + padding, startY + padding, {
          width: colWidths[i] - padding * 2,
          height: rowHeight - padding * 2,
          lineGap: 1,
        });

      x += colWidths[i];
    });

    doc.y = startY + rowHeight;
    doc.x = doc.page.margins.left;
  };

  drawRow(headers, true);
  rows.forEach((row) => drawRow(row, false));
  doc.moveDown(0.5);
}

function formatDate(d = new Date()) {
  const dateObj = new Date(d);

  return `${dateObj.getDate()} day of ${dateObj.toLocaleString("en-US", {
    month: "long",
  })}, ${dateObj.getFullYear()}`;
}

/**
 * Generates the Master Agent / API Partner Agreement PDF.
 * @param {Object} record - KYC application record
 * @returns {Promise<Buffer>}
 */
function generateAgreementPdf(record) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 48, bottom: 48, left: 45, right: 45 },
        bufferPages: true,
      });

      const chunks = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const entityName = String(
        record.entityName || record.company_name || "API PARTNER"
      ).toUpperCase();

      const entityType = String(record.entityType || "Company");

      const address = [
        record.registeredAddress,
        record.registeredCity,
        record.registeredState,
        record.registeredPincode,
        record.registeredCountry,
      ].filter(Boolean).join(", ") || record.address || "[Registered Address]";

      const gstin = record.gstNo || record.gstin || "";
      const website = record.website || record.website_url || "[Not Provided]";

      const agrNumber =
        `AGR-${String(record._id || "PARTNER").slice(-6).toUpperCase()}-${new Date().getFullYear()}`;

      const effectiveDate = formatDate(record.createdAt || new Date());

      const companyName =
        agreementConfig.companyName || "ESCROWIND PRIVATE LIMITED";

      const brandingTerm = agreementConfig.brandingTerm || "BBPS AI";

      // Company logo
      if (fs.existsSync(LOGO_PATH)) {
        try {
          doc.image(LOGO_PATH, doc.page.margins.left, doc.y, {
            height: 32,
          });
          doc.moveDown(2.3);
        } catch (_) {}
      }

      // Agreement title
      doc.font("Helvetica-Bold")
        .fontSize(13)
        .fillColor("#1f3b57")
        .text("MASTER AGENT / API PARTNER ONBOARDING AGREEMENT", {
          align: "center",
        });

      doc.fillColor("#000000").moveDown(0.7);

      addParagraph(
        doc,
        `Agreement No.: ${agrNumber}\nVersion: ${agreementConfig.agreementVersion || "2.0"}`
      );

      addParagraph(
        doc,
        `This Master Agent / API Partner Onboarding Agreement ("Agreement") is executed on this ${effectiveDate} ("Effective Date").`
      );

      addHeading(doc, "BETWEEN", 3);

      addParagraph(
        doc,
        `${companyName}, a company incorporated under the Companies Act, 2013, having its registered office at India (hereinafter referred to as "${brandingTerm}", which expression shall unless repugnant to the context include its successors, affiliates and permitted assigns);`
      );

      addHeading(doc, "AND", 3);

      addParagraph(
        doc,
        `${entityName}, a ${entityType} duly organized under the laws of India and having its principal office at ${address} (hereinafter referred to as the "API Partner", which expression shall include its successors and permitted assigns).`
      );

      addParagraph(
        doc,
        `${brandingTerm} and the API Partner are individually referred to as a "Party" and collectively as the "Parties".`
      );

      if (gstin) {
        addParagraph(doc, `GSTIN of API Partner: ${gstin}`, {
          bold: true,
        });
      }

      // Recitals
      addHeading(doc, "RECITALS");

      addParagraph(
        doc,
        `WHEREAS ${brandingTerm} is engaged in providing onboarding, compliance, technology integration, operational support, consulting, transaction facilitation and related services in connection with the Bharat Bill Payment System ("BBPS"), digital payment ecosystem and related financial technology infrastructure, and has established relationships with various BBPS Operating Units (BBPOUs), technology providers, banking institutions, payment processors, aggregators and ecosystem participants.`
      );

      addParagraph(
        doc,
        "WHEREAS the API Partner desires to avail onboarding, integration, technology, operational and compliance support services from BBPS AI for participation in the BBPS ecosystem, including but not limited to bill aggregation, payment collection, and related services."
      );

      addParagraph(
        doc,
        `WHEREAS ${brandingTerm} has agreed to provide such services on the terms and conditions set forth herein, subject to all applicable laws, regulations, and approvals from NPCI, RBI, and BBPOUs.`
      );

      addParagraph(
        doc,
        "NOW THEREFORE, in consideration of the mutual covenants, promises, representations, warranties, and conditions contained herein, the Parties agree as follows:"
      );

      // Agreement articles
      const sections = [
        [
          "ARTICLE 1: DEFINITIONS AND INTERPRETATION",
          [
            [
              "1.1 Definitions",
              "In this Agreement, unless the context otherwise requires, the following terms shall have the meanings assigned to them:",
            ],
            [
              null,
              '"Affiliate" means, with respect to a Party, any entity that directly or indirectly controls, is controlled by, or is under common control with such Party, where "control" means the power to direct or cause the direction of the management and policies of such entity, whether through ownership of more than 50% of the voting securities, by contract, or otherwise.',
            ],
            [
              null,
              '"Agreement" means this Master Agent / API Partner Onboarding Agreement, together with all Schedules, Annexures, and any amendments hereto.',
            ],
            [
              null,
              '"AML/CFT" means Anti-Money Laundering and Counter-Financing of Terrorism, as per the Prevention of Money Laundering Act, 2002 (PMLA), rules, and guidelines issued by RBI, FIU-IND, and other authorities.',
            ],
            [
              null,
              '"API" means Application Programming Interface, including all specifications, endpoints, authentication methods, request/response formats, and related documentation provided by BBPS AI.',
            ],
            [
              null,
              '"Applicable Laws" means all statutes, acts, rules, regulations, ordinances, treaties, guidelines, circulars, notifications, orders, decrees, judgments, directives, or requirements of any governmental authority, court, or regulator having jurisdiction, including but not limited to: (i) Reserve Bank of India Act, 1934; (ii) Payment and Settlement Systems Act, 2007; (iii) Information Technology Act, 2000; (iv) Digital Personal Data Protection Act, 2023; (v) Prevention of Money Laundering Act, 2002; (vi) Indian Contract Act, 1872; (vii) Goods and Services Tax Act, 2017; (viii) Companies Act, 2013; (ix) All NPCI circulars, BBPS procedural guidelines, and RBI directions on BBPS.',
            ],
            [
              null,
              '"BBPS" means the Bharat Bill Payment System, a centralized bill payment system regulated by the Reserve Bank of India and operated under the framework prescribed by the National Payments Corporation of India (NPCI).',
            ],
            [
              null,
              '"BBPOU" means Bharat Bill Payment Operating Unit, an entity authorized by NPCI to operate as a bill payment operating unit within the BBPS ecosystem.',
            ],
            [
              null,
              '"Business Day" means a day (other than Saturday, Sunday, and public holidays) on which banks are open for general business in New Delhi, India.',
            ],
            [
              null,
              '"Confidential Information" means all information disclosed by either Party (Disclosing Party) to the other (Receiving Party), whether orally, in writing, or in electronic form, that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and circumstances of disclosure.',
            ],
            [
              null,
              '"Customer" means any end-user, consumer, or entity whose bill payment transaction is processed through the API Partner using the Services provided by BBPS AI.',
            ],
            [
              null,
              '"Customer Data" means any personal data, personally identifiable information (PII), transaction data, financial information, bank account details, bill details, payment history, or any other information relating to a Customer that is processed, stored, transmitted, or accessed under this Agreement.',
            ],
            [
              null,
              '"Effective Date" means the date first written above. "NPCI" means National Payments Corporation of India. "RBI" means the Reserve Bank of India. "Services" means onboarding, compliance, technology, integration, operational, support, and consulting services provided under Article 4. "Term" has the meaning set forth in Article 20.1. "Transaction" means any bill payment, collection, remittance, or other payment instruction processed through the BBPS platform via the API Partner\'s integration with BBPS AI.',
            ],
          ],
        ],
        [
          "ARTICLE 2: APPOINTMENT AND SCOPE",
          [
            [
              "2.1 Appointment",
              "BBPS AI hereby appoints the API Partner, and the API Partner accepts such appointment, as a non-exclusive API partner / agent for participation in the BBPS ecosystem through integration and use of BBPS AI's platform, subject to this Agreement; necessary BBPOU, NPCI, RBI and regulatory approvals; successful KYC, due diligence, technical integration and UAT; and payment of applicable fees.",
            ],
            [
              "2.2 Independent Contractor Status",
              "The relationship between the Parties is that of independent contractors. Nothing in this Agreement creates a partnership, joint venture, employer-employee relationship, or any other relationship giving rise to fiduciary duties beyond those expressly set forth.",
            ],
            [
              "2.3 No Authority to Bind",
              "The API Partner shall have no authority to bind, represent, or act as an agent of BBPS AI for any purpose unless expressly authorized in writing.",
            ],
          ],
        ],
        [
          "ARTICLE 3: BUSINESS DESCRIPTION AND USE CASE",
          [
            [
              "3.1 Business of API Partner",
              `The API Partner, ${entityName}, is engaged in digital payment facilitation and bill aggregation services. The API Partner's website: ${website}.`,
            ],
            [
              "3.2 Permitted Use Cases",
              "The API Partner shall use the Services only for bill payment processing, collection services, and payment aggregation activities as permitted under BBPS guidelines and agreed in writing with BBPS AI.",
            ],
            [
              "3.3 Prohibited Use Cases",
              "The API Partner shall not use the Services for any illegal or prohibited transactions including gambling, betting, cryptocurrency, adult content, money laundering, terrorist financing, or any activity that violates RBI or NPCI limits, caps, or prohibitions.",
            ],
          ],
        ],
        [
          "ARTICLE 4: SCOPE OF SERVICES",
          [
            [
              null,
              "BBPS AI shall provide the following Services (each at its discretion, subject to payment of applicable fees): (a) Onboarding Services — document collection, due diligence, KYC verification, risk assessment, and business validation. (b) Technology Services — API integration support, sandbox access (up to 30 days), UAT assistance, production deployment support, and technical documentation. (c) Compliance Services — regulatory coordination, documentation review, AML/KYC support, and audit assistance. (d) Operational Support — training, reporting support, escalation management, and merchant management.",
            ],
          ],
        ],
        [
          "ARTICLE 5: REGULATORY COMPLIANCE",
          [
            [
              null,
              "The API Partner shall at all times comply with all Applicable Laws including the Payment and Settlement Systems Act 2007, Prevention of Money Laundering Act 2002, Digital Personal Data Protection Act 2023, Information Technology Act 2000, and all NPCI/RBI guidelines relating to BBPS. The API Partner shall maintain all licenses, registrations, and approvals required to operate its business and shall immediately notify BBPS AI of any regulatory inquiry, penalty, or material adverse change in its business or ownership within 24 hours.",
            ],
          ],
        ],
        [
          "ARTICLE 6: KYC, AML AND DUE DILIGENCE",
          [
            [
              null,
              "The API Partner shall submit all required KYC documents as per the checklist provided by BBPS AI. BBPS AI may conduct background checks, financial verification, physical site inspection, and video-based KYC. The API Partner shall conduct periodic KYC refresh every 2 years, file Suspicious Transaction Reports (STRs) with FIU-IND within 7 days of forming suspicion, and maintain all KYC and transaction records for a minimum of 5 years.",
            ],
          ],
        ],
        [
          "ARTICLE 7: FEES, CHARGES, AND PAYMENT TERMS",
          [
            [
              null,
              "The API Partner shall pay all fees as per the commercial schedule agreed in writing. All invoices are due within 7 calendar days from the date of invoice. Late payment attracts interest at 18% per annum. All fees paid (except the Security Deposit) are strictly non-refundable. All amounts are exclusive of GST.",
            ],
          ],
        ],
        [
          "ARTICLE 8: CUSTOMER DATA AND PRIVACY",
          [
            [
              null,
              "The API Partner shall process Customer Data only for permitted purposes, obtain valid consent from Customers, implement reasonable security safeguards, and notify BBPS AI within 24 hours of any data breach. The API Partner shall not sell, rent, trade, or commercially exploit Customer Data, and shall not transfer Customer Data outside India except in compliance with the DPDP Act.",
            ],
          ],
        ],
        [
          "ARTICLE 9: INFORMATION SECURITY",
          [
            [
              null,
              "The API Partner shall implement and maintain security controls including role-based access control, multi-factor authentication, TLS 1.2+ encryption in transit, AES-256 for data at rest, quarterly vulnerability scans, annual penetration tests, and a written incident response plan. Any security breach must be notified to BBPS AI within 1 hour.",
            ],
          ],
        ],
        [
          "ARTICLE 10: ANTI-FRAUD AND ANTI-MONEY LAUNDERING",
          [
            [
              null,
              "The API Partner shall establish a fraud prevention program with real-time transaction monitoring, appoint a Principal Officer and Designated Director under PMLA, conduct customer due diligence for all customers, screen all customers against sanctions lists daily, and maintain an AML register of suspicious transactions. BBPS AI may reject, suspend, or block any transaction or access without prior notice if fraud or suspicious activity is detected.",
            ],
          ],
        ],
        [
          "ARTICLE 11: AUDIT RIGHTS",
          [
            [
              null,
              "BBPS AI may conduct audits of the API Partner's operations, systems, records, and premises once per calendar year (routine) or at any time without notice (for cause). The API Partner shall provide full cooperation and access to all auditors. Any deficiencies identified must be remediated within 30 days.",
            ],
          ],
        ],
        [
          "ARTICLE 12: INTELLECTUAL PROPERTY",
          [
            [
              null,
              "All Intellectual Property Rights in BBPS AI's platform, APIs, software, documentation, and trademarks remain the sole and exclusive property of BBPS AI. The API Partner receives a limited, non-exclusive, non-transferable, revocable license during the Term solely to integrate with BBPS AI's platform for processing Transactions. The API Partner shall not reverse engineer, decompile, or attempt to derive source code from any BBPS AI system.",
            ],
          ],
        ],
        [
          "ARTICLE 13: CONFIDENTIALITY",
          [
            [
              null,
              "Each Party shall keep all Confidential Information strictly confidential for ten (10) years after termination of this Agreement. Trade secrets shall survive indefinitely. Upon termination, all Confidential Information must be returned or destroyed within 15 days with written certification.",
            ],
          ],
        ],
        [
          "ARTICLE 14: NON-CIRCUMVENTION",
          [
            [
              null,
              "The API Partner shall not, directly or indirectly, approach, engage, or contract with any BBPS AI Introduced Party (including BBPOUs, banks, technology providers, and aggregators introduced through this relationship) during the Term and for five (5) years after termination. Breach attracts liquidated damages of INR 50,00,000/- (Rupees Fifty Lakhs) per occurrence, plus actual damages and legal costs.",
            ],
          ],
        ],
        [
          "ARTICLE 15: NON-SOLICITATION",
          [
            [
              null,
              "The API Partner shall not solicit, induce, or hire any employee, consultant, advisor, or contractor of BBPS AI during the Term and for three (3) years after termination.",
            ],
          ],
        ],
        [
          "ARTICLE 16: REPRESENTATIONS AND WARRANTIES",
          [
            [
              null,
              "Each Party represents and warrants that it is duly organized, has full authority to execute this Agreement, and its performance does not conflict with any other agreement or Applicable Law. The API Partner further warrants that all documents provided to BBPS AI are true, accurate, and complete; it has all required licenses and approvals; it has not engaged in any fraudulent activity; and it is not a Sanctioned Person.",
            ],
            [
              null,
              'EXCEPT AS EXPRESSLY SET FORTH IN THIS AGREEMENT, BBPS AI PROVIDES THE SERVICES ON AN "AS IS" AND "AS AVAILABLE" BASIS AND DISCLAIMS ALL OTHER WARRANTIES, EXPRESS OR IMPLIED.',
              true,
            ],
          ],
        ],
        [
          "ARTICLE 17: INDEMNITY",
          [
            [
              null,
              "The API Partner shall defend, indemnify, and hold harmless BBPS AI and its directors, officers, employees, and agents from and against all losses, damages, liabilities, penalties, fines, costs, and expenses arising out of any Third Party Claim, Fraudulent Activity, Data Breach, AML/KYC violation, regulatory penalty, tax liability, breach of warranty, or negligence or willful misconduct of the API Partner. Indemnity obligations survive termination indefinitely.",
            ],
          ],
        ],
        [
          "ARTICLE 18: LIMITATION OF LIABILITY",
          [
            [
              null,
              "TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, NEITHER PARTY SHALL BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES. BBPS AI'S TOTAL AGGREGATE LIABILITY SHALL NOT EXCEED THE TOTAL FEES ACTUALLY RECEIVED FROM THE API PARTNER DURING THE TWELVE (12) MONTHS PRECEDING THE FIRST EVENT GIVING RISE TO LIABILITY.",
              true,
            ],
          ],
        ],
        [
          "ARTICLE 19: SUSPENSION",
          [
            [
              null,
              "BBPS AI may suspend the API Partner's access immediately if fraudulent activity is suspected, a security incident occurs, payment is overdue, a regulatory directive is received, or KYC documentation is found false or expired. During suspension, no new Transactions may be processed and all API keys shall be revoked.",
            ],
          ],
        ],
        [
          "ARTICLE 20: TERM AND TERMINATION",
          [
            [
              null,
              "This Agreement commences on the Effective Date and continues until terminated. Either Party may terminate without cause upon thirty (30) days' prior written notice. BBPS AI may terminate immediately for fraud, misrepresentation, insolvency, regulatory revocation, or sanctions listing. All fees paid are non-refundable upon termination.",
            ],
          ],
        ],
        [
          "ARTICLE 21: CONSEQUENCES OF TERMINATION",
          [
            [
              null,
              "Upon termination: (a) all API keys and credentials are immediately revoked; (b) all outstanding fees become immediately due; (c) all Confidential Information must be returned or destroyed within 15 days; (d) all Customer Data must be permanently deleted. Articles 13 (Confidentiality — 10 years), Article 14 (Non-Circumvention — 5 years), Article 15 (Non-Solicitation — 3 years), Article 17 (Indemnity), and Article 25 (Dispute Resolution) survive termination.",
            ],
          ],
        ],
        [
          "ARTICLE 22: FORCE MAJEURE",
          [
            [
              null,
              "Neither Party shall be liable for delay or failure to perform (other than payment obligations) caused by events beyond its reasonable control including acts of God, war, terrorism, pandemic, governmental action, or cyberattacks not due to the Party's own security failures. If a Force Majeure Event continues for more than 30 consecutive days, either Party may terminate immediately.",
            ],
          ],
        ],
        [
          "ARTICLE 25: DISPUTE RESOLUTION",
          [
            [
              null,
              "Any dispute shall first be referred to senior executives for good-faith negotiation for 30 days. If unresolved, disputes shall be finally settled by arbitration under the Arbitration and Conciliation Act, 1996, by a Sole Arbitrator, with the seat and venue at New Delhi, India, conducted in English. Either Party may seek emergency injunctive relief from courts at New Delhi without waiving the right to arbitrate.",
            ],
          ],
        ],
        [
          "ARTICLE 26: GOVERNING LAW",
          [
            [
              null,
              "This Agreement shall be governed by the laws of India. The courts at New Delhi shall have exclusive jurisdiction for matters not subject to arbitration.",
            ],
          ],
        ],
        [
          "ARTICLE 27: GENERAL PROVISIONS",
          [
            [
              null,
              "This Agreement constitutes the entire agreement between the Parties and supersedes all prior agreements, understandings, and negotiations. No amendment shall be effective unless in writing and signed by authorized representatives of both Parties. The API Partner shall not assign this Agreement without BBPS AI's prior written consent.",
            ],
          ],
        ],
      ];

      sections.forEach(([heading, paragraphs]) => {
        addHeading(doc, heading, 2);

        paragraphs.forEach(([subheading, content, disclaimer]) => {
          if (subheading) addHeading(doc, subheading, 3);

          addParagraph(doc, content, {
            bold: Boolean(disclaimer),
          });
        });
      });

      // SCHEDULE A: DOCUMENT CHECKLIST
      addHeading(doc, "SCHEDULE A: DOCUMENT CHECKLIST", 2);

      addTable(
        doc,
        ["S. No.", "Document Type", "Details"],
        [
          ["1", "Certificate of Incorporation / Registration", "Issued by ROC / Registrar of Firms. Must be current."],
          ["2", "PAN Card", "Issued by Income Tax Department."],
          ["3", "GST Registration Certificate", "Active status on GST portal."],
          ["4", "Board Resolution / Partner Resolution", "Authorizing execution of this Agreement and naming authorized signatories."],
          ["5", "MOA & AOA (for companies)", "Certified true copy by director or CS."],
          ["6", "Address Proof (Registered Office)", "Utility bill or property tax receipt not older than 3 months."],
          ["7", "Bank Account Details", "Cancelled cheque or bank confirmation letter."],
          ["8", "Director/Partner KYC", "For each director/partner: PAN, Aadhaar, Voter ID/Passport/Driving License."],
          ["9", "UBO Declaration", "As per PMLA rules — identify each natural person with >10% ownership or control."],
          ["11", "AML/CFT Policy", "Board-approved policy document."],
          ["12", "Data Protection Policy", "If available, else undertaking to implement within 90 days."],
        ],
        [45, 155, 255]
      );

      // SCHEDULE B: COMMERCIALS AND FEES
      addHeading(doc, "SCHEDULE B: COMMERCIALS AND FEES", 2);

      const feeSchedule = Array.isArray(agreementConfig.feeSchedule)
        ? agreementConfig.feeSchedule
        : [];

      const feeHeaders = [
        "Fee Type",
        "Amount (INR)",
        "Frequency",
        "Due Date",
        "Refundable?",
      ];

      const feeRows = feeSchedule.length
        ? feeSchedule.slice(1).map((row) =>
            row.map((value) => String(value ?? ""))
          )
        : [];

      if (feeRows.length) {
        addTable(doc, feeHeaders, feeRows, [130, 85, 90, 80, 70]);
      } else {
        addParagraph(
          doc,
          "Commercial fees will be as per the commercial schedule agreed in writing by the Parties."
        );
      }

      addParagraph(
        doc,
        "Late Payment Interest: 18% per annum (compounded daily).\nCurrency: Indian Rupees (INR).\nGST: All amounts are exclusive of GST at the prevailing rate."
      );

      // EXECUTION & SIGNATURES
      addHeading(doc, "EXECUTION & SIGNATURES", 2);

      addParagraph(
        doc,
        `For and on behalf of ${companyName} (${brandingTerm}):`,
        { bold: true }
      );

      addParagraph(
        doc,
        "Authorized Signatory\nName: ______________________________\nDesignation: ________________________\nSignature: __________________________\nDate: _______________________________\nPlace: New Delhi"
      );

      addParagraph(doc, `For and on behalf of ${entityName}:`, {
        bold: true,
      });

      const directors = Array.isArray(record.directors)
        ? record.directors
        : [];

      if (directors.length) {
        directors.forEach((director, index) => {
          addParagraph(
            doc,
            `Authorized Signatory ${index + 1}\nName: ${director.name || "______________________________"}\nEmail: ${director.email || "______________________________"}\nDesignation: ${director.designation || "Director"}\nSignature: __________________________\nDate: _______________________________\nPlace: ______________________________`
          );
        });
      } else {
        addParagraph(
          doc,
          `Authorized Signatory\nName: ${record.authSignatoryName || entityName}\nEmail: ${record.authSignatoryEmail || record.email || "N/A"}\nDesignation: ________________________\nSignature: __________________________\nDate: _______________________________\nPlace: ______________________________`
        );
      }

      // Authorized signature image
      if (fs.existsSync(SIGNATURE_PATH)) {
        try {
          ensureSpace(doc, 55);
          doc.image(SIGNATURE_PATH, doc.page.margins.left, doc.y, {
            width: 100,
          });
          doc.moveDown(3.5);
        } catch (_) {}
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = generateAgreementPdf;
