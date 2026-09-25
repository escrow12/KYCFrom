const express = require("express");
const router = express.Router();
const KycForm = require("../models/KycForm");
const generateKycPdf = require("../utils/generatePdf");
const digio = require("../services/digioService");
const crypto = require("crypto");

function normalizeDirectors(body) {
  const source = Array.isArray(body.directors) && body.directors.length ? body.directors : body.beneficialOwners;
  return (source || [])
    .filter((director) => director && director.name && director.email)
    .map((director) => ({
      name: String(director.name).trim(),
      email: String(director.email).trim().toLowerCase(),
      designation: director.designation,
      din: director.din,
      status: "pending",
    }));
}

function referenceId(prefix, id) {
  return `${prefix}-${id}-${crypto.randomBytes(6).toString("hex")}`;
}

// Create a new KYC form submission
router.post("/", async (req, res) => {
  try {
    const record = await KycForm.create({ ...req.body, directors: normalizeDirectors(req.body) });
    let digioData;
    if (String(process.env.DIGIO_AUTO_REQUEST).toLowerCase() === "true") {
      const director = record.directors[0];
      const payload = {
        customer_identifier: director?.email || record.email || record.authSignatoryEmail,
        customer_name: director?.name || record.entityName,
        reference_id: referenceId("kyc", record._id),
        template_name: process.env.DIGIO_TEMPLATE_NAME,
        notify_customer: true,
        generate_access_token: true,
        request_details: {},
      };
      const providerResponse = await digio.createRequest(payload);
      const identifiers = digio.extractIdentifiers(providerResponse.data);
      if (!identifiers.kid && !identifiers.requestId) {
        const error = new Error("DigiO response did not contain a request identifier.");
        error.code = "DIGIO_INVALID_RESPONSE";
        throw error;
      }
      record.digio = {
        customerIdentifier: payload.customer_identifier,
        referenceId: payload.reference_id,
        ...identifiers,
        accessLink: identifiers.accessLink,
        status: "requested",
        lastAction: "request",
        lastSyncedAt: new Date(),
      };
      await record.save();
      digioData = { ...identifiers, accessToken: undefined };
    }
    console.log(`KYC application saved: ${record._id}`);
    res.status(201).json({ success: true, id: record._id, ...(digioData ? { digio: digioData } : {}) });
  } catch (err) {
    console.error("KYC application save error:", err.code || err.message);
    if (err.code && err.code.startsWith("DIGIO_")) {
      return res.status(err.code === "DIGIO_NOT_CONFIGURED" ? 503 : 502).json({
        success: false,
        message: err.message,
        code: err.code,
      });
    }
    res.status(400).json({
      success: false,
      message: err.message,
      error: err.name,
    });
  }
});

// Get all submissions (basic list, newest first)
router.get("/", async (req, res) => {
  try {
    const forms = await KycForm.find().sort({ createdAt: -1 });
    res.json({ success: true, data: forms });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get one submission by id
router.get("/:id", async (req, res) => {
  try {
    const form = await KycForm.findById(req.params.id);
    if (!form) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: form });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Download/print-ready PDF for a submission
router.get("/:id/pdf", async (req, res) => {
  try {
    const form = await KycForm.findById(req.params.id);
    if (!form) {
      console.error(`KYC PDF request: record not found (${req.params.id})`);
      return res.status(404).send("Form not found");
    }

    const pdfBuffer = await generateKycPdf(form);
    console.log(`KYC PDF generated: ${form._id}`);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="KYC_${form.entityName || form._id}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error(`KYC PDF generation error (${req.params.id}):`, err);
    res.status(500).send("Error generating PDF: " + err.message);
  }
});

module.exports = router;
