const PDFDocument = require("pdfkit");

const MARGIN = 36;
const DARK = "#263238";
const LIGHT = "#f1f3f4";

const text = (value) => {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "-";
  return value === undefined || value === null || value === "" ? "-" : String(value);
};

const date = (value) => (value ? new Date(value).toLocaleString("en-IN") : "-");

function generateClientVerificationPdf(form) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const section = (title) => {
      if (doc.y > doc.page.height - 100) doc.addPage();
      const y = doc.y + 5;
      doc.rect(MARGIN, y, doc.page.width - MARGIN * 2, 25).fill(DARK);
      doc.fillColor("#fff").font("Helvetica-Bold").fontSize(11).text(title, MARGIN + 8, y + 7);
      doc.fillColor("#111").y = y + 31;
    };

    const row = (label, value, height = 25) => {
      const x = MARGIN;
      const width = doc.page.width - MARGIN * 2;
      const labelWidth = 155;
      const y = doc.y;
      doc.rect(x, y, width, height).stroke("#c5c9cc");
      doc.rect(x, y, labelWidth, height).fill(LIGHT).stroke("#c5c9cc");
      doc.fillColor("#111").font("Helvetica-Bold").fontSize(8.5).text(label, x + 7, y + 8, { width: labelWidth - 14 });
      doc.font("Helvetica").fontSize(8.5).text(text(value), x + labelWidth + 8, y + 8, { width: width - labelWidth - 16 });
      doc.y = y + height;
    };

    const a = form.assignment || {};
    const c = form.client || {};
    const s = form.site || {};
    const e = form.evidence || {};
    const contact = form.contact || {};
    const statutory = form.statutory || {};
    const operations = form.operations || {};
    const observations = form.observations || {};
    const outcome = form.outcome || {};
    const certification = form.certification || {};

    doc.font("Helvetica-Bold").fontSize(18).text("CLIENT VERIFICATION & DUE DILIGENCE FORM", { align: "center" });
    doc.font("Helvetica").fontSize(10).fillColor("#555").text("For Physical Site Verification, Corporate Due Diligence & Client Onboarding", { align: "center" });
    doc.fillColor("#111").moveDown(0.7);

    section("1. VERIFICATION ASSIGNMENT");
    row("Verification Reference No.", a.referenceNo);
    row("Date of Assignment", date(a.dateOfAssignment));
    row("Date / Time of Visit", date(a.visitDateTime));
    row("Verification Agency / Executive", a.agencyExecutive);
    row("Purpose of Verification", a.purpose);
    row("Requested By", a.requestedBy);

    section("2. CLIENT / COMPANY DETAILS");
    row("Legal / Registered Name", c.legalName);
    row("Trade / Brand Name", c.tradeName);
    row("Constitution", c.constitution);
    row("CIN / LLPIN / Registration No.", c.registrationNo);
    row("PAN", c.pan);
    row("GSTIN", c.gstin);
    row("Date of Incorporation / Establishment", date(c.incorporationDate));
    row("Registered Office Address", c.registeredAddress, 36);
    row("Operational / Site Address", c.siteAddress, 36);
    row("Nature / Line of Business", c.businessNature, 36);
    row("Website / Business Email", c.websiteEmail);
    row("Approx. Years in Operation", c.yearsInOperation);

    section("3. PHYSICAL SITE VERIFICATION");
    row("Premises Type", s.premisesType);
    row("Signboard / Branding Visible", `${text(s.signboardVisible)}${s.signboardRemarks ? ` - ${s.signboardRemarks}` : ""}`);
    row("Office Operational at Visit", `${text(s.officeOperational)}${s.operationalRemarks ? ` - ${s.operationalRemarks}` : ""}`);
    row("Business Activity Observed", s.businessActivityObserved);
    row("Approx. Office Area", s.officeArea);
    row("Employees / Staff Observed", s.staffObserved);
    row("Neighbourhood / Accessibility", s.accessibility);
    row("Premises Ownership / Occupancy Evidence", s.ownershipEvidence);
    row("Address Matched With Records", s.addressMatched);
    row("Overall Site Observation", s.observation, 40);

    section("4. GEO-TAGGED LOCATION & PHOTOGRAPHIC EVIDENCE");
    row("GPS Latitude", e.latitude);
    row("GPS Longitude", e.longitude);
    row("Geo-tag / Map Location", e.mapLocation);
    row("Date & Time Captured", date(e.capturedAt));
    row("Office Exterior Photograph", e.exteriorPhoto);
    row("Office Interior Photograph", e.interiorPhoto);
    row("Company Signboard Photograph", e.signboardPhoto);
    row("Building / Address Landmark", e.landmarkPhoto);
    row("Director / Authorized Person Photograph", e.personPhoto);
    row("Photo File / Evidence Reference Nos.", e.fileReferences);

    section("5. PERSON CONTACTED DURING VERIFICATION");
    row("Name", contact.name);
    row("Designation", contact.designation);
    row("Department", contact.department);
    row("Mobile No.", contact.mobile);
    row("Email ID", contact.email);
    row("Relationship With Client", contact.relationship);
    row("ID / Business Card Verified", contact.idVerified);
    row("Statement / Confirmation Given", contact.statement, 40);

    section("6. DIRECTORS / PARTNERS / KEY PERSONS");
    if (form.keyPersons && form.keyPersons.length) {
      form.keyPersons.forEach((person, index) => {
        row(`${index + 1}. ${text(person.name)}`, [person.designation, person.dinId, person.remarks].filter(Boolean).join(" | "), 30);
      });
    } else {
      row("Key Persons", "-");
    }

    section("7. STATUTORY / CORPORATE VERIFICATION");
    row("GST Status", statutory.gstStatus);
    row("GST Legal Name Match", statutory.gstNameMatch);
    row("PAN / Corporate Identity", statutory.panIdentity);
    row("MCA / Corporate Records", statutory.mcaRecords);
    row("Registered Address Match", statutory.addressMatch);
    row("Business Activity Consistency", statutory.activityConsistency);
    row("Other Registration / Licence", statutory.otherLicence);
    row("Verification Sources / Reference", statutory.sources, 36);

    section("8. BUSINESS & OPERATIONAL ASSESSMENT");
    row("Nature of Operations Observed", operations.natureObserved, 36);
    row("Products / Services", operations.productsServices, 36);
    row("Customer / Vendor Activity Observed", operations.customerVendorActivity, 36);
    row("Operational Infrastructure", operations.infrastructure);
    row("Business Signage / Branding", operations.branding);
    row("Approx. Business Scale", operations.businessScale);
    row("Overall Business Presence", operations.businessPresence);

    section("9. VERIFICATION OBSERVATIONS & RED FLAGS");
    row("Positive Observations", observations.positive, 40);
    row("Discrepancies Identified", observations.discrepancies, 40);
    row("Red Flags / Risk Indicators", observations.redFlags);
    row("Other Red Flag", observations.otherRedFlag);
    row("Additional Remarks", observations.remarks, 45);

    section("10. VERIFICATION OUTCOME");
    row("Overall Result", outcome.overallResult);
    row("Recommended Action", outcome.recommendedAction);
    row("Verifier's Summary", outcome.summary, 75);

    section("11. VERIFIER CERTIFICATION");
    doc.font("Helvetica").fontSize(8.5).text("I certify that the above verification was conducted at the stated location and that the information recorded in this form reflects the observations and documents available to me at the time of verification. Photographs, GPS/location information and personal information should be collected and processed only where permitted by applicable law and the engagement instructions.");
    doc.moveDown(0.4);
    row("Verifier Name", certification.verifierName);
    row("Designation / Agency", certification.designationAgency);
    row("Signature", certification.signature);
    row("Date", date(certification.date));
    row("Reviewer Name / Signature", certification.reviewer);
    row("Final Review Date", date(certification.reviewDate));
    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(8).fillColor("#555").text("Confidentiality: This document may contain confidential business and personal information and should be handled, stored and shared only for the authorised verification purpose.");

    const pages = doc.bufferedPageRange();
    for (let index = pages.start; index < pages.start + pages.count; index += 1) {
      doc.switchToPage(index);
      doc.font("Helvetica").fontSize(8).fillColor("#777")
        .text("Client Verification & Due Diligence Form", MARGIN, doc.page.height - 28)
        .text(`Page ${index + 1}`, doc.page.width - 80, doc.page.height - 28, { width: 44, align: "right" });
    }
    doc.end();
  });
}

module.exports = generateClientVerificationPdf;
