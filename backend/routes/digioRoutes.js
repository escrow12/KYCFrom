const express = require("express");
const mongoose = require("mongoose");
const KycForm = require("../models/KycForm");
const digio = require("../services/digioService");

const router = express.Router();

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function providerErrorResponse(res, error) {
  const status = error.code === "DIGIO_NOT_CONFIGURED" ? 503 : error.code === "DIGIO_PROVIDER_ERROR" ? 502 : 504;
  return res.status(status).json({ success: false, message: error.message, code: error.code });
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

function buildRequestPayload(record, body) {
  const payload = {
    customer_identifier: body.customer_identifier || record.email || record.authSignatoryEmail,
    customer_name: body.customer_name || record.entityName,
    reference_id: body.reference_id || String(record._id),
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

router.post("/:id/request", async (req, res) => {
  try {
    const record = await getRecord(req, res);
    if (!record) return;
    const payload = buildRequestPayload(record, req.body || {});
    const response = await digio.createRequest(payload);
    const identifiers = await saveProviderIdentifiers(record, "request", response.data, "requested");
    res.status(201).json({ success: true, data: { id: record._id, ...identifiers } });
  } catch (error) {
    if (error.code === "DIGIO_INVALID_REQUEST") return res.status(400).json({ success: false, message: error.message, code: error.code });
    console.error("DigiO KYC request error:", error);
    return providerErrorResponse(res, error);
  }
});

router.post("/:id/details", async (req, res) => {
  try {
    const record = await getRecord(req, res);
    if (!record) return;
    const kid = req.body.kid || getIdentifier(record, "kid");
    if (!kid) return res.status(400).json({ success: false, message: "A DigiO KID is required." });
    const response = await digio.getRequestDetails(kid);
    await saveProviderIdentifiers(record, "details", response.data);
    res.json({ success: true, data: digio.redactSecrets(response.data) });
  } catch (error) {
    console.error("DigiO request details error:", error);
    return providerErrorResponse(res, error);
  }
});

router.get("/:id/download", async (req, res) => {
  try {
    const record = await getRecord(req, res);
    if (!record) return;
    const rid = req.query.rid || getIdentifier(record, "rid");
    const docType = String(req.query.doc_type || "").trim();
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

router.post("/:id/approval", async (req, res) => {
  try {
    const record = await getRecord(req, res);
    if (!record) return;
    const kid = req.body.kid || getIdentifier(record, "kid");
    const status = req.body.status;
    if (!kid || status !== "approved") {
      return res.status(400).json({ success: false, message: "DigiO KID and status approved are required." });
    }
    const response = await digio.manageApproval(kid, status);
    await saveProviderIdentifiers(record, "approval", response.data, status);
    res.json({ success: true, data: { id: record._id, kid, status } });
  } catch (error) {
    console.error("DigiO approval error:", error);
    return providerErrorResponse(res, error);
  }
});

router.post("/:id/reattempt", async (req, res) => {
  try {
    const record = await getRecord(req, res);
    if (!record) return;
    const requestId = req.body.request_id || getIdentifier(record, "requestId");
    const payload = {
      action_ids: req.body.action_ids,
      reason: req.body.reason,
      notify_customer: req.body.notify_customer,
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

router.post("/:id/token", async (req, res) => {
  try {
    const record = await getRecord(req, res);
    if (!record) return;
    const entityId = req.body.entity_id || getIdentifier(record, "requestId") || String(record._id);
    const response = await digio.regenerateToken(entityId);
    await saveProviderIdentifiers(record, "token", response.data, "token_regenerated");
    res.json({ success: true, data: { id: record._id, tokenRegenerated: true } });
  } catch (error) {
    console.error("DigiO token regeneration error:", error);
    return providerErrorResponse(res, error);
  }
});

module.exports = router;