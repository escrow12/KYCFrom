const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");

// Put your logo file at backend/public/logo.png (any size, PNG/JPG)
const LOGO_PATH = path.join(__dirname, "..", "public", "logo.png");

function contentWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function sectionTitle(doc, text) {
  doc.moveDown(0.5);
  const x = doc.page.margins.left;
  const y = doc.y;
  const w = contentWidth(doc);
  doc.rect(x, y, w, 20).fill("#1f3b57");
  doc.fillColor("#ffffff").fontSize(11).font("Helvetica-Bold").text(text, x + 6, y + 5);
  doc.fillColor("#000000");
  doc.y = y + 26;
  doc.x = x;
}

function subHeading(doc, text) {
  doc.moveDown(0.3);
  doc.fontSize(9.5).font("Helvetica-Bold").fillColor("#1f3b57").text(text);
  doc.fillColor("#000000");
  doc.moveDown(0.15);
}

function fieldRow(doc, label, value) {
  const labelWidth = 190;
  const x = doc.page.margins.left;
  const y = doc.y;
  doc.fontSize(9).font("Helvetica-Bold").text(label, x, y, { width: labelWidth });
  const labelHeight = doc.heightOfString(label, { width: labelWidth });
  const valText = value && String(value).trim() ? String(value) : "-";
  doc.font("Helvetica").text(valText, x + labelWidth, y, {
    width: contentWidth(doc) - labelWidth,
  });
  const valueHeight = doc.heightOfString(valText, { width: contentWidth(doc) - labelWidth });
  doc.y = y + Math.max(labelHeight, valueHeight) + 5;
  doc.x = x;
}

function checkboxLine(doc, label, checked) {
  const box = checked ? "[X]" : "[ ]";
  doc.fontSize(9).font("Helvetica").text(`${box}  ${label}`, doc.page.margins.left, doc.y, {
    width: contentWidth(doc),
  });
  doc.moveDown(0.2);
}

function ensureSpace(doc, neededHeight) {
  if (doc.y + neededHeight > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

/**
 * Generates a PDF Buffer for a single KYC form submission.
 * @param {Object} formDoc - Mongoose document (or plain object) of the KYC form
 * @returns {Promise<Buffer>}
 */
function generateKycPdf(formDoc) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ----- Header with logo -----
    const headerTop = doc.y;
    let logoLoaded = false;
    if (fs.existsSync(LOGO_PATH)) {
      try {
        doc.image(LOGO_PATH, doc.page.margins.left, headerTop, { height: 40 });
        logoLoaded = true;
      } catch (e) {
        console.error("KYC PDF logo load error:", e.message);
      }
    }
    
    const headerOffset = logoLoaded ? 45 : 0;
    doc.fontSize(12).font("Helvetica").text("Know Your Customer (KYC) Form", 0, headerTop + headerOffset, { align: "center" });
    doc.fontSize(10).text("(Non-Individuals Only)", { align: "center" });
    doc.y = Math.max(doc.y, headerTop + headerOffset + 30) + 8;
    doc.x = doc.page.margins.left;
    doc
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .lineWidth(2)
      .strokeColor("#1f3b57")
      .stroke();
    doc.moveDown(0.6);

    // ----- A. Identity Details -----
    sectionTitle(doc, "A. Identity Details");
    fieldRow(doc, "Entity Name", formDoc.entityName);
    fieldRow(doc, "Entity Type", formDoc.entityType);
    fieldRow(doc, "Entity PAN No.", formDoc.entityPan);
    fieldRow(doc, "Incorporation / Registration Date", formDoc.incorporationDate ? new Date(formDoc.incorporationDate).toLocaleDateString("en-IN") : "");
    fieldRow(doc, "Registration No.", formDoc.registrationNo);
    fieldRow(doc, "Nature of Business", formDoc.natureOfBusiness);
    fieldRow(doc, "Corporate ID / SAP ID", formDoc.corporateIdOrSapId);
    fieldRow(
      doc,
      "Product Type",
      formDoc.productType === "Other" ? `Other - ${formDoc.productTypeOther || ""}` : formDoc.productType
    );
    fieldRow(doc, "GST No. (if applicable)", formDoc.gstNo);

    // ----- B. Address Details -----
    sectionTitle(doc, "B. Address Details (Entity)");
    fieldRow(doc, "Registered Address", formDoc.registeredAddress);
    fieldRow(doc, "City / Pincode / State / Country", [formDoc.registeredCity, formDoc.registeredPincode, formDoc.registeredState, formDoc.registeredCountry].filter(Boolean).join(", "));
    fieldRow(doc, "Phone No.", formDoc.phone);
    fieldRow(doc, "Website", formDoc.website);
    fieldRow(doc, "Email", formDoc.email);
    fieldRow(doc, "Correspondence Address", [formDoc.correspondenceCity, formDoc.correspondencePincode, formDoc.correspondenceState, formDoc.correspondenceCountry].filter(Boolean).join(", "));

    subHeading(doc, "Authorized Signatory");
    fieldRow(doc, "Name", formDoc.authSignatoryName);
    fieldRow(doc, "DOB", formDoc.dob ? new Date(formDoc.dob).toLocaleDateString("en-IN") : "");
    fieldRow(doc, "PAN No.", formDoc.authSignatoryPan);
    fieldRow(doc, "OVD Type", formDoc.authSignatoryOvdType);
    fieldRow(doc, "OVD No.", formDoc.authSignatoryOvdNo);
    fieldRow(doc, "Telephone / Fax / Email", [formDoc.authSignatoryTel, formDoc.authSignatoryFax, formDoc.authSignatoryEmail].filter(Boolean).join(" / "));

    // ----- C. Other Details -----
    sectionTitle(doc, "C. Other Details");
    subHeading(doc, "1. Politically Exposed Person (PEP)");
    checkboxLine(
      doc,
      "Authorised signatory/promoter/karta/trustee/whole-time director is a PEP or RPEP",
      formDoc.isPep
    );
    if (formDoc.isPep) fieldRow(doc, "PEP / RPEP Details", formDoc.pepDetails);

    subHeading(doc, "2. Gross Annual Income");
    fieldRow(doc, "Income Range (per annum)", formDoc.incomeRange);
    fieldRow(doc, "Networth (Rs., as on date)", formDoc.netWorth);
    fieldRow(doc, "Networth As On Date", formDoc.netWorthDate ? new Date(formDoc.netWorthDate).toLocaleDateString("en-IN") : "");

    subHeading(doc, "3. Activity Involvement");
    checkboxLine(doc, "Foreign Exchange / Money Changer", formDoc.isForexMoneyChanger);
    checkboxLine(doc, "Gambling/Gaming/Lottery Services (Casino, Betting Syndicate)", formDoc.isGamblingGamingLottery);
    checkboxLine(doc, "Money Lending / Pawning", formDoc.isMoneyLendingPawning);

    // ----- D. KYC Details -----
    ensureSpace(doc, 150);
    sectionTitle(doc, "D. KYC Details - Documents Verified");
    const documentList = formDoc.documentChecklist && formDoc.documentChecklist.length
      ? formDoc.documentChecklist
      : (formDoc.documentsVerified || []).map((name) => ({ name, selected: true }));
    if (documentList.length) {
      documentList.forEach((document) => {
        const label = document.verificationMethod && document.verificationMethod !== "N/A"
          ? `${document.name} (${document.verificationMethod})`
          : document.name;
        checkboxLine(doc, label, document.selected !== false);
      });
    } else {
      doc.fontSize(9).font("Helvetica").text("No documents listed.", doc.page.margins.left, doc.y);
      doc.moveDown(0.3);
    }

    subHeading(doc, "Details of Beneficial Ownership");
    if (formDoc.beneficialOwners && formDoc.beneficialOwners.length) {
      const colX = doc.page.margins.left;
      const colWidths = [140, 100, 80, 90, 65];
      const headers = ["Name", "Designation", "DIN No.", "PAN No.", "% Holding"];
      let y = doc.y;
      doc.fontSize(9).font("Helvetica-Bold");
      headers.forEach((h, i) => {
        doc.text(h, colX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y, { width: colWidths[i] });
      });
      doc.y = y + 14;
      doc.font("Helvetica");
      formDoc.beneficialOwners.forEach((bo) => {
        ensureSpace(doc, 16);
        y = doc.y;
        const rowVals = [bo.name, bo.designation, bo.din, bo.panNo, bo.percentageHolding];
        rowVals.forEach((v, i) => {
          doc.text(v && String(v).trim() ? String(v) : "-", colX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y, {
            width: colWidths[i],
          });
        });
        doc.y = y + 14;
      });
      doc.x = doc.page.margins.left;
    } else {
      doc.fontSize(9).font("Helvetica").text("None listed.", doc.page.margins.left, doc.y);
      doc.moveDown(0.3);
    }

    // ----- Declaration -----
    ensureSpace(doc, 180);
    sectionTitle(doc, "Declaration");
    doc
      .fontSize(8)
      .font("Helvetica")
      .text(
        "I/We hereby declare that the details furnished above are true and correct to the best of my/our " +
          "knowledge and belief, and I/we undertake to inform " +
          "the Company of any changes thereon. In case any information submitted is found to be false, untrue, misleading " +
          "or misrepresenting, I/we am/are aware that I/we may be held liable for the same.",
        doc.page.margins.left,
        doc.y,
        { width: contentWidth(doc), align: "justify" }
      );
    doc.moveDown(0.5);
    checkboxLine(doc, "Declaration accepted by the applicant", formDoc.declarationAccepted);
    doc.moveDown(0.3);
    fieldRow(doc, "Place", formDoc.signedPlace);
    fieldRow(doc, "Date", formDoc.signedDate ? new Date(formDoc.signedDate).toLocaleDateString("en-IN") : "");
    fieldRow(doc, "Client Date", formDoc.clientDate ? new Date(formDoc.clientDate).toLocaleDateString("en-IN") : "");
    fieldRow(doc, "Client Name / Designation / Place", [formDoc.clientName, formDoc.clientDesignation, formDoc.clientPlace].filter(Boolean).join(" / "));

    doc.moveDown(1.2);
    const sigY = doc.y;
    doc.fontSize(9).text("_______________________", doc.page.margins.left, sigY);
    doc.text("Authorized Signatory / Company Stamp", doc.page.margins.left, sigY + 15);
    doc.y = sigY + 35;
    doc.x = doc.page.margins.left;

    // ----- Internal verification block -----
    ensureSpace(doc, 90);
    sectionTitle(doc, "Internal Verification");
    fieldRow(doc, "Verified By (Relationship Manager)", formDoc.verifiedByRmName);
    fieldRow(doc, "RM Date", formDoc.rmDate ? new Date(formDoc.rmDate).toLocaleDateString("en-IN") : "");
    fieldRow(doc, "RM Designation / Place", [formDoc.rmDesignation, formDoc.rmPlace].filter(Boolean).join(" / "));
    checkboxLine(doc, "Original documents verified", formDoc.originalVerified);
    checkboxLine(doc, "Self-attested documents received", formDoc.selfAttested);
    checkboxLine(doc, "Client signature verified", formDoc.clientSignatureVerified);
    checkboxLine(doc, "Entity documents seen and verified", formDoc.documentsSeenAndVerified);
    checkboxLine(doc, "Entity authorized person signed in presence", formDoc.signedInPresence);

    doc.end();
  });
}

module.exports = generateKycPdf;
