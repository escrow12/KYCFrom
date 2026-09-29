const express = require("express");
const mongoose = require("mongoose");
const KycForm = require("../models/KycForm");
const digio = require("../services/digioService");
const requireAdmin = require("../middleware/adminAuth");

const router = express.Router();

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function providerErrorResponse(res, error) {
  const status = error.code === "DIGIO_NOT_CONFIGURED" ? 503 : ["DIGIO_PROVIDER_ERROR", "DIGIO_INVALID_RESPONSE"].includes(error.code) ? 502 : 504;
  return res.status(status).json({ success: false, message: error.providerData?.message || error.message, code: error.code, providerCode: error.providerData?.code });
}

function validateObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    const error = new Error(`${name} must be an object.`);
    error.code = "DIGIO_INVALID_REQUEST";
    throw error;
  }
}

function getIdentifier(record, key) {
  const value = record.digio && record.digio[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getCustomerIdentifier(record) {
  return record.email || record.authSignatoryEmail;
}

async function getRecord(req, res) {
  if (!isValidId(req.params.id)) {
    res.status(400).json({ success: false, message: "Invalid KYC ID." });
    return null;
  }
  const record = await KycForm.findById(req.params.id);
  if (!record) {
    res.status(404).json({ success: false, message: "KYC record not found." });
    return null;
  }
  return record;
}

function sanitizeReferenceId(ref) {
  if (!ref || typeof ref !== "string") return "";
  return ref.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function buildRequestPayload(record, body) {
  const payload = {
    customer_identifier: String(body.customer_identifier || record.email || record.authSignatoryEmail || "").trim().toLowerCase(),
    customer_name: String(body.customer_name || record.entityName || "").trim(),
    reference_id: body.reference_id && String(body.reference_id).trim().length === 15 ? sanitizeReferenceId(body.reference_id) : digio.generate15CharReferenceId(),
    template_name: body.template_name || process.env.DIGIO_TEMPLATE_NAME,
    notify_customer: body.notify_customer === undefined ? true : body.notify_customer,
    generate_access_token: body.generate_access_token === undefined ? true : body.generate_access_token,
    request_details: body.request_details || {},
  };

  if (!payload.customer_identifier || !payload.customer_name || !payload.template_name) {
    const error = new Error("customer_identifier, customer_name, and template_name are required for DigiO KYC request.");
    error.code = "DIGIO_INVALID_REQUEST";
    throw error;
  }
  validateObject(payload.request_details, "request_details");
  return payload;
}

async function saveProviderIdentifiers(record, action, responseData, status) {
  const identifiers = digio.extractIdentifiers(responseData);
  const current = record.digio ? record.digio.toObject() : {};
  record.digio = {
    ...current,
    customerIdentifier: current.customerIdentifier || getCustomerIdentifier(record),
    referenceId: current.referenceId || String(record._id),
    ...Object.fromEntries(Object.entries(identifiers).filter(([, value]) => value)),
    status: status || current.status,
    lastAction: action,
    lastSyncedAt: new Date(),
  };
  await record.save();
  return identifiers;
}

router.post("/:id/request", requireAdmin, async (req, res) => {
  try {
    const record = await getRecord(req, res);
    if (!record) return;
    if (record.digio && (record.digio.kid || record.digio.requestId)) {
      return res.status(409).json({ success: false, message: "A DigiO KYC request already exists for this application." });
    }
    const payload = buildRequestPayload(record, req.body || {});
    const response = await digio.createRequest(payload);
    const identifiers = digio.extractIdentifiers(response.data);
    if (!identifiers.kid && !identifiers.requestId) {
      return res.status(502).json({ success: false, message: "DigiO response did not contain a request identifier.", code: "DIGIO_INVALID_RESPONSE" });
    }
    await saveProviderIdentifiers(record, "request", response.data, "requested");
    res.status(201).json({ success: true, data: { id: record._id, ...identifiers } });
  } catch (error) {
    if (error.code === "DIGIO_INVALID_REQUEST") return res.status(400).json({ success: false, message: error.message, code: error.code });
    console.error("DigiO KYC request error:", error.code || error.message);
    return providerErrorResponse(res, error);
  }
});

router.post("/:id/details", requireAdmin, async (req, res) => {
  try {
    const record = await getRecord(req, res);
    if (!record) return;
    const director = req.body.director_id && record.directors ? record.directors.id(req.body.director_id) : null;
    const kid = req.body.kid || (director && director.digio && director.digio.kid) || getIdentifier(record, "kid");
    if (!kid) {
      return res.status(400).json({ success: false, message: "Director DigiO KID is missing. DigiO KYC request was not successfully registered." });
    }
    const response = await digio.getRequestDetails(kid);
    await saveProviderIdentifiers(record, "details", response.data);
    res.json({ success: true, data: digio.redactSecrets(response.data) });
  } catch (error) {
    console.error("DigiO request details error:", error.code || error.message);
    return providerErrorResponse(res, error);
  }
});

router.get("/:id/download", requireAdmin, async (req, res) => {
  try {
    const record = await getRecord(req, res);
    if (!record) return;
    const director = req.query.director_id && record.directors ? record.directors.id(req.query.director_id) : null;
    const rid = req.query.rid || (director && director.digio && director.digio.rid) || getIdentifier(record, "rid");
    const docType = String(req.query.doc_type || "AADHAAR").trim();
    const xml = String(req.query.xml || "true").toLowerCase() === "true";
    if (!rid || !docType) return res.status(400).json({ success: false, message: "DigiO RID and doc_type are required." });
    const response = await digio.downloadMedia(rid, docType, xml);
    res.set("Content-Type", response.headers["content-type"] || "application/octet-stream");
    res.send(response.data);
  } catch (error) {
    console.error("DigiO media download error:", error);
    return providerErrorResponse(res, error);
  }
});

router.post("/:id/approval", requireAdmin, async (req, res) => {
  try {
    const record = await getRecord(req, res);
    if (!record) return;
    const director = req.body.director_id && record.directors ? record.directors.id(req.body.director_id) : null;
    const kid = req.body.kid || (director && director.digio && director.digio.kid) || getIdentifier(record, "kid");
    const status = req.body.status;
    if (!kid) {
      return res.status(400).json({ success: false, message: "Director DigiO KID is missing. DigiO KYC request was not successfully registered." });
    }
    if (status !== "approved") {
      return res.status(400).json({ success: false, message: "Status must be approved." });
    }
    const response = await digio.manageApproval(kid, status);
    await saveProviderIdentifiers(record, "approval", response.data, status);
    res.json({ success: true, data: { id: record._id, kid, status } });
  } catch (error) {
    console.error("DigiO approval error:", error);
    return providerErrorResponse(res, error);
  }
});

router.post("/:id/reattempt", requireAdmin, async (req, res) => {
  try {
    const record = await getRecord(req, res);
    if (!record) return;
    const director = req.body.director_id && record.directors ? record.directors.id(req.body.director_id) : null;
    const requestId = req.body.request_id || (director && director.digio && (director.digio.requestId || director.digio.kid)) || getIdentifier(record, "requestId") || getIdentifier(record, "kid");
    const payload = {
      action_ids: req.body.action_ids,
      reason: req.body.reason,
      notify_customer: req.body.notify_customer === undefined ? true : req.body.notify_customer,
    };
    if (!requestId || !Array.isArray(payload.action_ids) || !payload.action_ids.length || !payload.reason) {
      return res.status(400).json({ success: false, message: "request_id, action_ids, and reason are required." });
    }
    const response = await digio.reattempt(requestId, payload);
    const identifiers = await saveProviderIdentifiers(record, "reattempt", response.data, "reattempted");
    res.json({ success: true, data: { id: record._id, ...identifiers } });
  } catch (error) {
    console.error("DigiO reattempt error:", error);
    return providerErrorResponse(res, error);
  }
});

router.post("/:id/token", requireAdmin, async (req, res) => {
  try {
    const record = await getRecord(req, res);
    if (!record) return;
    const director = req.body.director_id && record.directors ? record.directors.id(req.body.director_id) : null;
    const entityId = req.body.entity_id || (director && director.digio && (director.digio.requestId || director.digio.kid)) || getIdentifier(record, "requestId") || getIdentifier(record, "kid") || String(record._id);
    const response = await digio.regenerateToken(entityId);
    await saveProviderIdentifiers(record, "token", response.data, "token_regenerated");
    res.json({ success: true, data: { id: record._id, tokenRegenerated: true } });
  } catch (error) {
    console.error("DigiO token regeneration error:", error);
    return providerErrorResponse(res, error);
  }
});

module.exports = router;