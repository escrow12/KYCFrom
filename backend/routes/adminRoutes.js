const express = require("express");
const mongoose = require("mongoose");
const KycForm = require("../models/KycForm");
const digio = require("../services/digioService");
const requireAdmin = require("../middleware/adminAuth");
const crypto = require("crypto");
const generateKycPdf = require("../utils/generatePdf");

const router = express.Router();
const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 100;

function getDateRanges() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  const day = startOfWeek.getDay();
  startOfWeek.setDate(startOfWeek.getDate() - (day === 0 ? 6 : day - 1));
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return { startOfToday, startOfWeek, startOfMonth };
}

function buildSearchFilter(search) {
  if (!search) return {};
  const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const conditions = [
    { entityName: regex },
    { entityPan: regex },
    { corporateIdOrSapId: regex },
    { registrationNo: regex },
  ];
  if (mongoose.Types.ObjectId.isValid(search.trim())) {
    conditions.push({ _id: search.trim() });
  }
  return { $or: conditions };
}

function getSort(sort) {
  switch (sort) {
    case "oldest":
      return { createdAt: 1 };
    case "name":
      return { entityName: 1, createdAt: -1 };
    case "type":
      return { entityType: 1, createdAt: -1 };
    default:
      return { createdAt: -1 };
  }
}

function directorPayload(record, director) {
  return {
    customer_identifier: director.email,
    customer_name: director.name,
    reference_id: `${record._id}:director:${director._id}:${crypto.randomBytes(5).toString("hex")}`,
    template_name: process.env.DIGIO_TEMPLATE_NAME || "KYC",
    notify_customer: true,
    generate_access_token: true,
    request_details: { director_id: String(director._id), application_id: String(record._id) },
  };
}

function parentPayload(record) {
  return {
    customer_identifier: record.email || record.authSignatoryEmail,
    customer_name: record.entityName,
    reference_id: `${record._id}:application:${crypto.randomBytes(6).toString("hex")}`,
    template_name: process.env.DIGIO_TEMPLATE_NAME || "KYC",
    notify_customer: true,
    generate_access_token: true,
    request_details: { application_id: String(record._id) },
  };
}

async function requestParentKyc(record) {
  const payload = parentPayload(record);
  if (!payload.customer_identifier || !payload.customer_name) {
    const error = new Error("A customer email and name are required before DigiO approval.");
    error.code = "DIGIO_INVALID_REQUEST";
    throw error;
  }
  const response = await digio.createRequest(payload);
  const identifiers = digio.extractIdentifiers(response.data);
  const requestId = identifiers.kid || identifiers.requestId;
  if (!requestId) {
    const error = new Error("DigiO response did not contain a request identifier.");
    error.code = "DIGIO_INVALID_RESPONSE";
    throw error;
  }
  record.digio = {
    ...(record.digio ? record.digio.toObject() : {}),
    customerIdentifier: payload.customer_identifier,
    referenceId: payload.reference_id,
    ...identifiers,
    status: "requested",
    lastAction: "request",
    lastSyncedAt: new Date(),
  };
  return requestId;
}

async function requestDirectorKyc(record, director) {
  if (director.digio && (director.digio.kid || director.digio.requestId)) return;
  const payload = directorPayload(record, director);
  const response = await digio.createRequest(payload);
  const identifiers = digio.extractIdentifiers(response.data);
  if (!identifiers.kid && !identifiers.requestId) {
    const error = new Error("DigiO director KYC response did not contain a request identifier.");
    error.code = "DIGIO_INVALID_RESPONSE";
    throw error;
  }
  director.digio = {
    customerIdentifier: director.email,
    referenceId: payload.reference_id,
    ...identifiers,
    accessLink: identifiers.accessLink,
    status: "requested",
    lastAction: "request",
    lastSyncedAt: new Date(),
  };
  director.status = "requested";
}

router.get("/", requireAdmin, async (req, res) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || PAGE_SIZE_DEFAULT, 1),
      PAGE_SIZE_MAX
    );
    const search = String(req.query.search || "").trim();
    const filter = buildSearchFilter(search);
    const { startOfToday, startOfWeek, startOfMonth } = getDateRanges();

    const [records, total, totalKyc, todayKyc, weekKyc, monthKyc] = await Promise.all([
      KycForm.find(filter)
        .sort(getSort(req.query.sort))
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      KycForm.countDocuments(filter),
      KycForm.countDocuments(),
      KycForm.countDocuments({ createdAt: { $gte: startOfToday } }),
      KycForm.countDocuments({ createdAt: { $gte: startOfWeek } }),
      KycForm.countDocuments({ createdAt: { $gte: startOfMonth } }),
    ]);

    res.json({
      success: true,
      data: records,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      summary: {
        total: totalKyc,
        today: todayKyc,
        week: weekKyc,
        month: monthKyc,
      },
    });
  } catch (err) {
    console.error("Admin KYC list error:", err);
    res.status(500).json({ success: false, message: "Unable to load KYC records." });
  }
});

router.get("/:id", requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid KYC ID." });
    }

    const record = await KycForm.findById(req.params.id).lean();
    if (!record) {
      return res.status(404).json({ success: false, message: "KYC record not found." });
    }

    res.json({ success: true, data: record });
  } catch (err) {
    console.error(`Admin KYC detail error (${req.params.id}):`, err);
    res.status(500).json({ success: false, message: "Unable to load KYC record." });
  }
});

router.post("/:id/approve", requireAdmin, async (req, res) => {
  let record;
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid KYC ID." });
    }

    record = await KycForm.findOneAndUpdate(
      { _id: req.params.id, status: { $in: ["pending", null] }, approvalInProgress: { $ne: true } },
      { $set: { approvalInProgress: true } },
      { new: true }
    );
    if (!record) {
      const existing = await KycForm.findById(req.params.id).select("status").lean();
      if (!existing) return res.status(404).json({ success: false, message: "KYC record not found." });
      return res.status(409).json({ success: false, message: `KYC record is already ${existing.status || "being processed"}.` });
    }

    let kid = record.digio && (record.digio.kid || record.digio.requestId);
    if (!kid) kid = await requestParentKyc(record);

    if (record.directors && record.directors.length && record.directors.some((director) => !director.email)) {
      await KycForm.updateOne({ _id: record._id }, { $set: { approvalInProgress: false } });
      return res.status(400).json({ success: false, message: "Every required director must have a name and email before approval." });
    }

    if (record.digio.status !== "approved") await digio.manageApproval(kid, "approved");
    for (const director of record.directors || []) {
      await requestDirectorKyc(record, director);
      await record.save();
    }
    const nextStatus = record.directors && record.directors.length ? "director_kyc_pending" : "approved";
    const approved = await KycForm.findOneAndUpdate(
      { _id: record._id, status: { $in: ["pending", null] } },
      { $set: { status: nextStatus, approvedBy: req.adminId, approvedAt: new Date(), approvalInProgress: false, "digio.status": "approved", "digio.lastAction": "approval", "digio.lastSyncedAt": new Date(), directors: record.directors } },
      { new: true }
    ).lean();
    return res.json({ success: true, data: { id: approved._id, status: approved.status } });
  } catch (error) {
    if (record) await KycForm.updateOne({ _id: record._id }, { $set: { approvalInProgress: false } });
    console.error(`Admin KYC approval error (${req.params.id}):`, error.code || error.message);
    if (error.code === "DIGIO_NOT_CONFIGURED") return res.status(503).json({ success: false, message: error.message, code: error.code });
    if (error.code === "DIGIO_INVALID_REQUEST") return res.status(400).json({ success: false, message: error.message, code: error.code });
    if (error.code === "DIGIO_PROVIDER_ERROR") return res.status(502).json({ success: false, message: error.providerData?.message || error.message, code: error.code, providerCode: error.providerData?.code });
    return res.status(500).json({ success: false, message: "Unable to approve KYC record." });
  }
});

router.post("/:id/directors/:directorId/sync", requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id) || !mongoose.Types.ObjectId.isValid(req.params.directorId)) {
      return res.status(400).json({ success: false, message: "Invalid KYC or director ID." });
    }
    const record = await KycForm.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: "KYC record not found." });
    const director = record.directors.id(req.params.directorId);
    const kid = director && director.digio && director.digio.kid;
    if (!director || !kid) return res.status(400).json({ success: false, message: "Director has no DigiO KID." });

    const response = await digio.getRequestDetails(kid);
    const providerStatus = String(digio.extractStatus(response.data) || "").toLowerCase();
    director.digio.lastAction = "details";
    director.digio.lastSyncedAt = new Date();
    if (["completed", "success", "successful", "approved"].includes(providerStatus)) {
      director.status = "completed";
      director.digio.status = providerStatus;
      director.completedAt = director.completedAt || new Date();
    }
    if (record.directors.length && record.directors.every((item) => item.status === "completed")) {
      record.status = "agreement_pending";
    }
    await record.save();
    return res.json({ success: true, data: { directorId: director._id, status: director.status, providerStatus } });
  } catch (error) {
    console.error(`Director KYC sync error (${req.params.id}):`, error.message);
    if (error.code && error.code.startsWith("DIGIO_")) return res.status(error.code === "DIGIO_PROVIDER_ERROR" ? 502 : 503).json({ success: false, message: error.message, code: error.code });
    return res.status(500).json({ success: false, message: "Unable to sync director KYC." });
  }
});

router.post("/:id/agreement", requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid KYC ID." });
    }
    const record = await KycForm.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: "KYC record not found." });
    if (record.status !== "agreement_pending") {
      return res.status(409).json({ success: false, message: "Agreement signing is available after every director KYC is completed." });
    }
    if (record.agreement && record.agreement.providerRequestId) {
      return res.status(409).json({ success: false, message: "An agreement signing request already exists for this application." });
    }

    const signerEmail = String(req.body.email || record.authSignatoryEmail || record.email || "").trim().toLowerCase();
    const signerName = String(req.body.name || record.authSignatoryName || record.entityName || "").trim();
    if (!signerEmail || !signerName) return res.status(400).json({ success: false, message: "An agreement signer name and email are required." });

    const pdfBuffer = await generateKycPdf(record);
    const signCoordinates = req.body.sign_coordinates || {
      [signerEmail]: {
        "1": [{ llx: 433, lly: 80, urx: 545, ury: 115 }],
      },
    };
    const payload = {
      signers: [{ identifier: signerEmail, name: signerName, sign_type: "aadhaar", reason: "KYC agreement signing" }],
      expire_in_days: Number(req.body.expire_in_days) || 10,
      display_on_page: "Custom",
      notify_signers: true,
      send_sign_link: true,
      file_name: `KYC_${String(record.entityName || record._id).replace(/[^a-z0-9_-]/gi, "_")}.pdf`,
      file_data: pdfBuffer.toString("base64"),
      sign_coordinates: signCoordinates,
    };
    const providerResponse = await digio.createSigningRequest(payload);
    const identifiers = digio.extractIdentifiers(providerResponse.data);
    const providerData = providerResponse.data && typeof providerResponse.data === "object" ? providerResponse.data : {};
    const providerRequestId = identifiers.requestId || identifiers.rid || identifiers.kid || providerData.document_id;
    if (!providerRequestId) {
      const error = new Error("DigiSign response did not contain a request identifier.");
      error.code = "DIGIO_INVALID_RESPONSE";
      throw error;
    }
    record.agreement = {
      status: "sent",
      providerRequestId,
      documentId: providerData.document_id,
      signingUrl: identifiers.accessLink,
      signers: [{ name: signerName, email: signerEmail, status: "pending" }],
      lastAction: "create",
      lastSyncedAt: new Date(),
    };
    record.status = "agreement_sent";
    await record.save();
    return res.status(201).json({ success: true, data: { id: record._id, providerRequestId, signingUrl: identifiers.accessLink } });
  } catch (error) {
    console.error(`DigiSign agreement error (${req.params.id}):`, error.code || error.message);
    if (error.code === "DIGISIGN_NOT_CONFIGURED") return res.status(503).json({ success: false, message: error.message, code: error.code });
    if (error.code === "DIGIO_PROVIDER_ERROR" || error.code === "DIGIO_INVALID_RESPONSE") return res.status(502).json({ success: false, message: error.message, code: error.code });
    return res.status(500).json({ success: false, message: "Unable to create agreement signing request." });
  }
});

router.post("/:id/reject", requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid KYC ID." });
    }
    const reason = String(req.body.reason || "").trim();
    if (!reason) return res.status(400).json({ success: false, message: "Rejection reason is required." });

    const rejected = await KycForm.findOneAndUpdate(
      { _id: req.params.id, status: { $in: ["pending", null] }, approvalInProgress: { $ne: true } },
      { $set: { status: "rejected", rejectionReason: reason, rejectedBy: req.adminId, rejectedAt: new Date() } },
      { new: true }
    ).lean();
    if (!rejected) {
      const existing = await KycForm.findById(req.params.id).select("status").lean();
      if (!existing) return res.status(404).json({ success: false, message: "KYC record not found." });
      return res.status(409).json({ success: false, message: `KYC record is already ${existing.status || "being processed"}.` });
    }
    return res.json({ success: true, data: { id: rejected._id, status: rejected.status } });
  } catch (error) {
    console.error(`Admin KYC rejection error (${req.params.id}):`, error);
    return res.status(500).json({ success: false, message: "Unable to reject KYC record." });
  }
});

module.exports = router;
