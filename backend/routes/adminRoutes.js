const express = require("express");
const mongoose = require("mongoose");
const KycForm = require("../models/KycForm");
const digio = require("../services/digioService");
const requireAdmin = require("../middleware/adminAuth");
const crypto = require("crypto");
const generateKycPdf = require("../utils/generatePdf");
const generateAgreementPdf = require("../utils/generateAgreementPdf");
const {
  sendApprovalEmail,
  sendRejectionEmail,
  sendDirectorKycEmail,
  sendAgreementSigningEmail,
  sendKycCompletedEmail,
} = require("../utils/emailService");

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

function isValidCustomerIdentifier(val) {
  if (!val || typeof val !== "string") return false;
  const trimmed = val.trim();
  if (trimmed.length < 3) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^\+?[0-9]{10,15}$/;
  return emailRegex.test(trimmed) || phoneRegex.test(trimmed);
}

function directorPayload(record, director) {
  const rawId = String(director.email || director.phone || "").trim();
  const customerIdentifier = rawId.includes("@") ? rawId.toLowerCase() : rawId;
  return {
    customer_identifier: customerIdentifier,
    customer_name: String(director.name || "").trim(),
    reference_id: digio.generate15CharReferenceId(),
    template_name: "KYC",
    notify_customer: true,
    generate_access_token: true,
    request_details: {},
  };
}

function parentPayload(record) {
  const customerIdentifier = String(record.email || record.authSignatoryEmail || "").trim().toLowerCase();
  return {
    customer_identifier: customerIdentifier,
    customer_name: String(record.entityName || record.authSignatoryName || "").trim(),
    reference_id: digio.generate15CharReferenceId(),
    template_name: "KYC",
    notify_customer: true,
    generate_access_token: true,
    request_details: {},
  };
}

async function requestParentKyc(record) {
  const payload = parentPayload(record);
  if (!payload.customer_identifier || !payload.customer_name) {
    const error = new Error("A customer email/phone and entity name are required before DigiO approval.");
    error.code = "DIGIO_INVALID_REQUEST";
    throw error;
  }
  if (!isValidCustomerIdentifier(payload.customer_identifier)) {
    const error = new Error(`Invalid customer email or phone number format ("${payload.customer_identifier}"). Please update application email before approval.`);
    error.code = "DIGIO_INVALID_REQUEST";
    throw error;
  }
  const response = await digio.createRequest(payload);
  const identifiers = digio.extractIdentifiers(response.data);
  if (!identifiers.kid || typeof identifiers.kid !== "string" || !identifiers.kid.trim()) {
    const error = new Error("DigiO response did not contain a valid KID.");
    error.code = "DIGIO_INVALID_RESPONSE";
    throw error;
  }
  record.digio = {
    ...(record.digio ? record.digio.toObject() : {}),
    customerIdentifier: payload.customer_identifier,
    referenceId: identifiers.referenceId || payload.reference_id,
    ...identifiers,
    status: identifiers.status || "requested",
    lastAction: "request",
    lastSyncedAt: new Date(),
  };
  return identifiers.kid;
}

async function requestDirectorKyc(record, director) {
  if (director.digio && director.digio.kid) return director.digio.kid;
  const payload = directorPayload(record, director);
  if (!isValidCustomerIdentifier(payload.customer_identifier)) {
    const error = new Error(`Invalid email or phone format ("${payload.customer_identifier}") for director "${director.name}".`);
    error.code = "DIGIO_INVALID_REQUEST";
    throw error;
  }
  const response = await digio.createRequest(payload);
  const identifiers = digio.extractIdentifiers(response.data);
  if (!identifiers.kid || typeof identifiers.kid !== "string" || !identifiers.kid.trim()) {
    const error = new Error(`DigiO KYC request succeeded but KID could not be extracted for director "${director.name}".`);
    error.code = "DIGIO_INVALID_RESPONSE";
    throw error;
  }

  director.digio = {
    customerIdentifier: payload.customer_identifier,
    referenceId: identifiers.referenceId || payload.reference_id,
    requestId: identifiers.requestId || identifiers.kid,
    kid: identifiers.kid,
    rid: identifiers.rid,
    actionIds: identifiers.actionIds || [],
    accessToken: identifiers.accessToken,
    accessLink: identifiers.accessLink,
    status: identifiers.status || "requested",
    lastAction: "request",
    lastSyncedAt: new Date(),
  };
  director.status = "requested";
  director.rejectionReason = undefined;
  record.markModified("directors");
  return identifiers.kid;
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

    let kid = record.digio && record.digio.kid;
    if (!kid) {
      try {
        kid = await requestParentKyc(record);
      } catch (parentErr) {
        console.warn("Parent DigiO request creation note:", parentErr.message);
      }
    }

    if (record.directors && record.directors.length && record.directors.some((director) => !director.email && !director.phone)) {
      await KycForm.updateOne({ _id: record._id }, { $set: { approvalInProgress: false } });
      return res.status(400).json({ success: false, message: "Every required director must have a name and email or phone before approval." });
    }

    // Try DigiO parent approval if in completed/submitted state
    if (kid && record.digio?.status !== "approved" && ["completed", "submitted"].includes(record.digio?.status)) {
      try {
        await digio.manageApproval(kid, "approved");
        record.digio.status = "approved";
      } catch (apprErr) {
        console.warn("DigiO manageApproval note:", apprErr.message);
      }
    }

    // Request DigiO KYC for each director
    const directorErrors = [];
    for (const director of record.directors || []) {
      try {
        await requestDirectorKyc(record, director);
      } catch (dirErr) {
        const msg = dirErr.providerData?.message || dirErr.message;
        console.error(`Director ${director.name} DigiO request error:`, msg);
        director.rejectionReason = msg;
        directorErrors.push(`${director.name}: ${msg}`);
      }
    }

    record.markModified("directors");
    await record.save();

    // If directors exist and all failed to get a real KID:
    if (record.directors && record.directors.length > 0 && record.directors.every(d => !d.digio?.kid)) {
      await KycForm.updateOne({ _id: record._id }, { $set: { approvalInProgress: false, directors: record.directors } });
      return res.status(502).json({
        success: false,
        message: `Director DigiO KYC request failed: ${directorErrors.join("; ")}`,
        errors: directorErrors
      });
    }

    const nextStatus = record.directors && record.directors.length ? "director_kyc_pending" : "agreement_pending";
    const approved = await KycForm.findOneAndUpdate(
      { _id: record._id },
      {
        $set: {
          status: nextStatus,
          approvedBy: req.adminId,
          approvedAt: new Date(),
          approvalInProgress: false,
          "digio.status": record.digio?.status || "approved",
          "digio.lastAction": "approval",
          "digio.lastSyncedAt": new Date(),
          directors: record.directors,
        },
      },
      { new: true }
    ).lean();

    // Send main approval email asynchronously
    sendApprovalEmail(approved).catch((err) => console.error("Error sending approval email:", err.message));

    // Send Director KYC emails to each director's email ID
    for (const director of approved.directors || []) {
      sendDirectorKycEmail(director, approved).catch((err) =>
        console.error(`Error sending KYC email to director ${director.email}:`, err.message)
      );
    }

    return res.json({ success: true, data: { id: approved._id, status: approved.status } });
  } catch (error) {
    if (record) await KycForm.updateOne({ _id: record._id }, { $set: { approvalInProgress: false } });
    console.error(`Admin KYC approval error (${req.params.id}):`, error.code || error.message);
    if (error.code === "DIGIO_NOT_CONFIGURED") return res.status(503).json({ success: false, message: error.message, code: error.code });
    if (error.code === "DIGIO_INVALID_REQUEST") return res.status(400).json({ success: false, message: error.message, code: error.code });
    if (error.code === "DIGIO_PROVIDER_ERROR") {
      const providerMsg = error.providerData?.message || error.message;
      return res.status(502).json({ success: false, message: `DigiO Provider Error: ${providerMsg}`, code: error.code, providerCode: error.providerData?.code });
    }
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
    if (!director || !kid) {
      return res.status(400).json({
        success: false,
        message: "Director DigiO KID is missing. DigiO KYC request was not successfully registered."
      });
    }

    const response = await digio.getRequestDetails(kid);
    const identifiers = digio.extractIdentifiers(response.data);
    const providerStatus = String(identifiers.status || digio.extractStatus(response.data) || "").toLowerCase();
    director.digio.lastAction = "details";
    director.digio.lastSyncedAt = new Date();
    if (identifiers.rid) {
      director.digio.rid = identifiers.rid;
    }
    if (identifiers.actionIds && identifiers.actionIds.length) {
      director.digio.actionIds = identifiers.actionIds;
    }
    if (["completed", "success", "successful", "approved"].includes(providerStatus)) {
      director.status = "completed";
      director.digio.status = providerStatus;
      director.completedAt = director.completedAt || new Date();
    } else if (providerStatus) {
      director.digio.status = providerStatus;
    }
    if (record.directors.length && record.directors.every((item) => item.status === "completed")) {
      record.status = "agreement_pending";
    }
    record.markModified("directors");
    await record.save();
    return res.json({
      success: true,
      data: {
        directorId: director._id,
        status: director.status,
        providerStatus,
        kid: director.digio.kid,
        rid: director.digio.rid,
        actionIds: director.digio.actionIds,
        kycStatus: record.status
      }
    });
  } catch (error) {
    console.error(`Director KYC sync error (${req.params.id}):`, error.message);
    if (error.code && error.code.startsWith("DIGIO_")) return res.status(error.code === "DIGIO_PROVIDER_ERROR" ? 502 : 503).json({ success: false, message: error.message, code: error.code });
    return res.status(500).json({ success: false, message: "Unable to sync director KYC." });
  }
});

router.post("/:id/directors/:directorId/approve", requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id) || !mongoose.Types.ObjectId.isValid(req.params.directorId)) {
      return res.status(400).json({ success: false, message: "Invalid KYC or director ID." });
    }
    const record = await KycForm.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: "KYC record not found." });
    const director = record.directors.id(req.params.directorId);
    if (!director) return res.status(404).json({ success: false, message: "Director not found." });

    const kid = director.digio && director.digio.kid;
    if (!kid) {
      return res.status(400).json({
        success: false,
        message: "Director DigiO KID is missing. DigiO KYC request was not successfully registered."
      });
    }

    let providerApproved = false;
    let providerNote = null;
    try {
      await digio.manageApproval(kid, "approved");
      providerApproved = true;
    } catch (apprErr) {
      providerNote = apprErr.providerData?.message || apprErr.message;
      console.warn(`DigiO manageApproval note for director ${director.name} (${kid}):`, providerNote);
    }

    director.status = "completed";
    director.completedAt = new Date();
    if (director.digio) {
      director.digio.status = "approved";
      director.digio.lastAction = "admin_approval";
      director.digio.lastSyncedAt = new Date();
    }

    if (record.directors.length && record.directors.every((item) => item.status === "completed")) {
      record.status = "agreement_pending";
    }
    record.markModified("directors");
    await record.save();
    return res.json({
      success: true,
      data: {
        directorId: director._id,
        status: director.status,
        kid: director.digio?.kid,
        providerApproved,
        providerNote,
        kycStatus: record.status
      },
    });
  } catch (error) {
    console.error(`Director KYC manual approval error (${req.params.id}):`, error);
    return res.status(500).json({ success: false, message: "Unable to approve director KYC." });
  }
});


router.post("/:id/agreement", requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid KYC ID." });
    }
    const record = await KycForm.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: "KYC record not found." });
    if (!["agreement_pending", "director_kyc_completed"].includes(record.status)) {
      return res.status(409).json({ success: false, message: "Agreement signing is available after every director KYC is completed." });
    }
    if (record.agreement && record.agreement.providerRequestId && record.agreement.status === "sent") {
      return res.status(409).json({ success: false, message: "An agreement signing request is already active for this application." });
    }

    const signerEmail = String(req.body.email || record.authSignatoryEmail || record.email || "").trim().toLowerCase();
    const signerName = String(req.body.name || record.authSignatoryName || record.entityName || "").trim();

    const pdfBuffer = await generateAgreementPdf(record);
    const signers = (record.directors && record.directors.length > 0)
      ? record.directors.map((d) => ({
          identifier: String(d.email).trim().toLowerCase(),
          name: String(d.name).trim(),
          sign_type: "aadhaar",
          reason: "Master Agent Onboarding Agreement Signing",
        }))
      : [{
          identifier: signerEmail,
          name: signerName,
          sign_type: "aadhaar",
          reason: "Master Agent Onboarding Agreement Signing",
        }];

    // Generate sign coordinates matching the Postman collection
    const signCoordinates = {};
    signers.forEach((s, idx) => {
      const baseX = Math.max(50, 433 - (idx * 130));
      signCoordinates[s.identifier] = {
        "1": [
          {
            llx: baseX,
            lly: 80,
            urx: baseX + 112,
            ury: 115,
          },
        ],
      };
    });

    const fileName = `Master_Agent_Agreement_${String(record.entityName || record._id).replace(/[^a-z0-9_-]/gi, "_")}.pdf`;
    const payload = {
      signers,
      expire_in_days: Number(req.body.expire_in_days) || 10,
      display_on_page: "Custom",
      notify_signers: true,
      send_sign_link: true,
      file_name: req.body.file_name || fileName,
      file_data: req.body.file_data || pdfBuffer.toString("base64"),
      sign_coordinates: req.body.sign_coordinates || signCoordinates,
    };

    const providerResponse = await digio.createSigningRequest(payload);
    const identifiers = digio.extractIdentifiers(providerResponse.data);
    const providerData = providerResponse.data && typeof providerResponse.data === "object" ? providerResponse.data : {};
    const documentId = providerData.id || providerData.document_id || identifiers.requestId || identifiers.kid;
    if (!documentId) {
      const error = new Error("DigiSign response did not contain a document identifier.");
      error.code = "DIGIO_INVALID_RESPONSE";
      throw error;
    }

    const signingUrl = identifiers.accessLink || `https://ext.digio.in/#/gateway/login/${documentId}/${encodeURIComponent(signers[0].identifier)}/`;

    record.agreement = {
      status: "sent",
      providerRequestId: documentId,
      documentId: documentId,
      signingUrl,
      signers: signers.map((s) => ({ name: s.name, email: s.identifier, status: "pending" })),
      lastAction: "create",
      lastSyncedAt: new Date(),
    };
    record.status = "agreement_sent";
    await record.save();

    // Send email to all signers with the agreement signing link
    signers.forEach((signer) => {
      const signerUrl = identifiers.accessLink || `https://ext.digio.in/#/gateway/login/${documentId}/${encodeURIComponent(signer.identifier)}/`;
      sendAgreementSigningEmail(signer, record, signerUrl).catch((err) =>
        console.error(`Error sending agreement email to ${signer.identifier}:`, err.message)
      );
    });

    return res.status(201).json({
      success: true,
      data: {
        id: record._id,
        documentId,
        providerRequestId: documentId,
        signingUrl,
        signers: record.agreement.signers,
      },
    });
  } catch (error) {
    console.error(`DigiSign agreement error (${req.params.id}):`, error.code || error.message);
    if (error.code === "DIGISIGN_NOT_CONFIGURED") return res.status(503).json({ success: false, message: error.message, code: error.code });
    if (error.code === "DIGIO_PROVIDER_ERROR" || error.code === "DIGIO_INVALID_RESPONSE") {
      return res.status(502).json({ success: false, message: error.message, code: error.code, providerData: error.providerData });
    }
    return res.status(500).json({ success: false, message: "Unable to create agreement signing request." });
  }
});

router.post("/:id/agreement/sync", requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid KYC ID." });
    }
    const record = await KycForm.findById(req.params.id);
    if (!record || !record.agreement || (!record.agreement.documentId && !record.agreement.providerRequestId)) {
      return res.status(400).json({ success: false, message: "No active agreement signing request found." });
    }

    const docId = record.agreement.documentId || record.agreement.providerRequestId;
    let providerStatus = "sent";
    let docData = {};
    try {
      const response = await digio.getDocumentDetails(docId);
      docData = response.data || {};
      providerStatus = String(docData.agreement_status || docData.status || "sent").toLowerCase();
    } catch (err) {
      console.warn("DigiSign getDocumentDetails note:", err.message);
    }

    record.agreement.lastSyncedAt = new Date();

    // Update individual signers if returned by provider
    const signingParties = docData.signing_parties || docData.signers || [];
    if (Array.isArray(signingParties) && signingParties.length) {
      signingParties.forEach((p) => {
        const target = record.agreement.signers.find((s) => s.email === p.identifier || s.name === p.name);
        if (target) {
          if (p.status === "signed") {
            target.status = "signed";
            target.signedAt = target.signedAt || new Date();
          }
        }
      });
    }

    const isSigned = ["signed", "completed", "success", "successful"].includes(providerStatus) ||
      (record.agreement.signers.length > 0 && record.agreement.signers.every((s) => s.status === "signed"));

    if (isSigned) {
      record.agreement.status = "signed";
      record.status = "completed";
      if (record.agreement.signers && record.agreement.signers.length) {
        record.agreement.signers.forEach((s) => {
          s.status = "signed";
          s.signedAt = s.signedAt || new Date();
        });
      }
      sendKycCompletedEmail(record).catch((err) => console.error("Error sending KYC completed email:", err.message));
    }

    await record.save();
    return res.json({
      success: true,
      data: {
        id: record._id,
        documentId: docId,
        agreementStatus: record.agreement.status,
        kycStatus: record.status,
        providerStatus,
        signers: record.agreement.signers,
      },
    });
  } catch (error) {
    console.error(`Agreement sync error (${req.params.id}):`, error.message);
    return res.status(500).json({ success: false, message: "Unable to sync agreement status." });
  }
});

router.post("/:id/agreement/approve", requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid KYC ID." });
    }
    const record = await KycForm.findById(req.params.id);
    if (!record || !record.agreement) {
      return res.status(400).json({ success: false, message: "No active agreement found." });
    }

    record.agreement.status = "signed";
    record.agreement.lastSyncedAt = new Date();
    record.status = "completed";
    if (record.agreement.signers) {
      record.agreement.signers.forEach((s) => {
        s.status = "signed";
        s.signedAt = s.signedAt || new Date();
      });
    }
    await record.save();
    sendKycCompletedEmail(record).catch((err) => console.error("Error sending KYC completed email:", err.message));
    return res.json({
      success: true,
      data: {
        id: record._id,
        agreementStatus: record.agreement.status,
        kycStatus: record.status,
      },
    });
  } catch (error) {
    console.error(`Agreement manual approval error (${req.params.id}):`, error);
    return res.status(500).json({ success: false, message: "Unable to approve agreement." });
  }
});

router.get("/:id/agreement/download", requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid KYC ID." });
    }
    const record = await KycForm.findById(req.params.id);
    if (!record) return res.status(404).send("KYC record not found");

    const docId = record.agreement?.documentId || record.agreement?.providerRequestId;
    if (docId) {
      try {
        const providerRes = await digio.downloadDocument(docId);
        res.set("Content-Type", providerRes.headers["content-type"] || "application/pdf");
        res.set("Content-Disposition", `inline; filename="Signed_Agreement_${record.entityName || record._id}.pdf"`);
        return res.send(providerRes.data);
      } catch (err) {
        console.warn(`Could not fetch signed PDF from DigiSign provider (${err.message}). Falling back to generated PDF.`);
      }
    }

    // Fallback: generate and serve agreement PDF
    const pdfBuffer = await generateAgreementPdf(record);
    res.set("Content-Type", "application/pdf");
    res.set("Content-Disposition", `inline; filename="Agreement_${record.entityName || record._id}.pdf"`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error(`Agreement download error (${req.params.id}):`, error);
    return res.status(500).send("Unable to download agreement PDF.");
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
      { _id: req.params.id, status: { $ne: "rejected" }, approvalInProgress: { $ne: true } },
      { $set: { status: "rejected", rejectionReason: reason, rejectedBy: req.adminId, rejectedAt: new Date() } },
      { new: true }
    ).lean();
    if (!rejected) {
      const existing = await KycForm.findById(req.params.id).select("status").lean();
      if (!existing) return res.status(404).json({ success: false, message: "KYC record not found." });
      return res.status(409).json({ success: false, message: `KYC record is already ${existing.status || "being processed"}.` });
    }

    // Trigger rejection email asynchronously
    sendRejectionEmail(rejected, reason).catch((err) => console.error("Error sending rejection email:", err.message));

    return res.json({ success: true, data: { id: rejected._id, status: rejected.status } });
  } catch (error) {
    console.error(`Admin KYC rejection error (${req.params.id}):`, error);
    return res.status(500).json({ success: false, message: "Unable to reject KYC record." });
  }
});

module.exports = router;
