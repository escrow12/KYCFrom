const express = require("express");
const router = express.Router();
const KycForm = require("../models/KycForm");
const generateKycPdf = require("../utils/generatePdf");
const digio = require("../services/digioService");
const crypto = require("crypto");

function normalizeDirectors(body) {
  const source = Array.isArray(body.directors) && body.directors.length ? body.directors : body.beneficialOwners;
  const directors = (source || [])
    .filter((director) => director && director.name && (director.email || director.phone))
    .map((director) => ({
      name: String(director.name).trim(),
      email: String(director.email || "").trim().toLowerCase(),
      phone: String(director.phone || "").trim(),
      designation: director.designation || "Director",
      din: director.din || "",
      status: "pending",
    }));

  if (directors.length === 0 && (body.authSignatoryEmail || body.email || body.phone)) {
    directors.push({
      name: String(body.authSignatoryName || body.entityName || "Authorized Signatory").trim(),
      email: String(body.authSignatoryEmail || body.email || "").trim().toLowerCase(),
      phone: String(body.authSignatoryTel || body.phone || "").trim(),
      designation: "Authorized Signatory",
      din: "",
      status: "pending",
    });
  }
  return directors;
}

const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadsDir = path.join(__dirname, "../public/uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 15 * 1024 * 1024 },
});

const kycUpload = upload.fields([
  { name: "aadhaarCard", maxCount: 1 },
  { name: "panCard", maxCount: 1 },
]);

function referenceId(prefix, id) {
  return `${prefix}-${id}-${crypto.randomBytes(6).toString("hex")}`;
}

// Create or update a KYC form submission (supports multipart/form-data & uploads)
router.post("/", kycUpload, async (req, res) => {
  try {
    let bodyData = req.body;
    if (req.body && req.body.payload) {
      try {
        bodyData = JSON.parse(req.body.payload);
      } catch (e) {
        console.warn("Could not parse req.body.payload JSON, using req.body");
      }
    }

    let uploadedDocuments = {};
    if (req.files) {
      if (req.files.aadhaarCard && req.files.aadhaarCard[0]) {
        uploadedDocuments.aadhaarCard = req.files.aadhaarCard[0].filename;
        uploadedDocuments.aadhaarCardOriginalName = req.files.aadhaarCard[0].originalname;
      }
      if (req.files.panCard && req.files.panCard[0]) {
        uploadedDocuments.panCard = req.files.panCard[0].filename;
        uploadedDocuments.panCardOriginalName = req.files.panCard[0].originalname;
      }
    }

    const targetId = bodyData._id || bodyData.kycId || req.query.kycId;
    let record;

    const directorsList = normalizeDirectors(bodyData);

    if (targetId && require("mongoose").Types.ObjectId.isValid(targetId)) {
      record = await KycForm.findById(targetId);
    }

    if (record) {
      // Update existing record
      Object.assign(record, bodyData);
      record.directors = directorsList.length ? directorsList : record.directors;
      if (uploadedDocuments.aadhaarCard || uploadedDocuments.panCard) {
        record.uploadedDocuments = {
          ...(record.uploadedDocuments ? record.uploadedDocuments.toObject() : {}),
          ...uploadedDocuments,
        };
      }
      record.applicationStatus = "pending";
      await record.save();
    } else {
      // Create new record
      record = await KycForm.create({
        ...bodyData,
        directors: directorsList,
        ...(uploadedDocuments.aadhaarCard || uploadedDocuments.panCard ? { uploadedDocuments } : {}),
      });
    }

    let digioData;
    if (String(process.env.DIGIO_AUTO_REQUEST).toLowerCase() === "true") {
      const director = record.directors[0];
      const payload = {
        customer_identifier: director?.email || record.email || record.authSignatoryEmail,
        customer_name: director?.name || record.entityName,
        reference_id: digio.generate15CharReferenceId(),
        template_name: process.env.DIGIO_TEMPLATE_NAME,
        notify_customer: true,
        generate_access_token: true,
        request_details: {},
      };
      const providerResponse = await digio.createRequest(payload);
      const identifiers = digio.extractIdentifiers(providerResponse.data);
      if (!identifiers.kid) {
        const error = new Error("DigiO response did not contain a valid KID.");
        error.code = "DIGIO_INVALID_RESPONSE";
        throw error;
      }
      record.digio = {
        customerIdentifier: payload.customer_identifier,
        referenceId: identifiers.referenceId || payload.reference_id,
        ...identifiers,
        accessLink: identifiers.accessLink,
        status: "requested",
        lastAction: "request",
        lastSyncedAt: new Date(),
      };
      if (director) {
        director.digio = { ...record.digio };
        director.status = "requested";
      }
      record.markModified("directors");
      await record.save();
      digioData = { ...identifiers, accessToken: undefined };
    }
    console.log(`KYC application saved/updated: ${record._id}`);
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

// Webhook for DigiO and DigiSign real-time status updates
router.post("/webhook", async (req, res) => {
  try {
    const webhookSecret = process.env.WEBHOOK_SECRET || process.env.DIGIO_WEBHOOK_SECRET;
    if (webhookSecret) {
      const incomingSecret =
        req.get("x-webhook-secret") ||
        req.get("x-digio-token") ||
        req.get("x-digisign-secret") ||
        req.get("authorization");

      const cleanIncoming = incomingSecret ? String(incomingSecret).replace(/^Bearer\s+/i, "").trim() : "";
      if (!cleanIncoming || cleanIncoming !== webhookSecret.trim()) {
        console.warn("[WEBHOOK UNAUTHORIZED] Webhook request failed secret token validation.");
        return res.status(401).json({ success: false, message: "Unauthorized webhook request." });
      }
    }

    const payload = req.body || {};
    console.log("[DIGIO WEBHOOK RECEIVED]:", JSON.stringify(payload));
    const event = String(payload.event || payload.action || "").toUpperCase();
    const documentId = payload.document_id || payload.id || payload.payload_id;
    const kycId = payload.kyc_id || payload.kid || payload.request_id;

    if (documentId) {
      const record = await KycForm.findOne({
        $or: [
          { "agreement.documentId": documentId },
          { "agreement.providerRequestId": documentId },
        ],
      });
      if (record && record.agreement) {
        if (event.includes("SIGN") || event.includes("COMPLETE") || payload.status === "completed") {
          record.agreement.status = "signed";
          record.agreementStatus = "signed";
          record.agreement.lastSyncedAt = new Date();
          if (record.agreement.signers) {
            record.agreement.signers.forEach((s) => {
              s.status = "signed";
              s.signedAt = s.signedAt || new Date();
            });
          }
          await record.save();
          console.log(`[WEBHOOK] Agreement signed for record ${record._id}. Agreement status set to signed.`);
        }
      }
    }

    if (kycId) {
      const record = await KycForm.findOne({
        $or: [
          { "digio.kid": kycId },
          { "directors.digio.kid": kycId },
          { "directors.digio.requestId": kycId },
        ],
      });
      if (record) {
        const director = (record.directors || []).find((d) => d.digio && (d.digio.kid === kycId || d.digio.requestId === kycId));
        if (director && (event.includes("APPROV") || event.includes("SUCCESS") || event.includes("COMPLETE") || payload.status === "completed")) {
          director.status = "completed";
          director.completedAt = new Date();
          if (record.directors.every((d) => d.status === "completed")) {
            record.kycStatus = "completed";
          } else {
            record.kycStatus = "in_progress";
          }
          record.markModified("directors");
          await record.save();
          console.log(`[WEBHOOK] Director ${director.name} KYC verified for record ${record._id}.`);
        }
      }
    }

    res.json({ success: true, message: "Webhook processed" });
  } catch (err) {
    console.error("Webhook processing error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
