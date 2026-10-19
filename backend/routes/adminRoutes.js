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
  sendDigioKycInviteEmail,
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
  const identifiers = digio.extractIdentifiers(response.data, null, director.email || payload.customer_identifier);
  if (!identifiers.kid || typeof identifiers.kid !== "string" || !identifiers.kid.trim()) {
    const error = new Error(`DigiO KYC request succeeded but KID could not be extracted for director "${director.name}".`);
    error.code = "DIGIO_INVALID_RESPONSE";
    throw error;
  }

  const directorEmail = String(director.email || payload.customer_identifier || "").trim();
  const gatewayHost = (process.env.BASE_URL || "").includes("ext.digio.in") ? "https://ext.digio.in" : "https://app.digio.in";
  const gwtFormatted = digio.formatGwtCode(identifiers.accessToken);
  const formattedAccessLink = (identifiers.kid && gwtFormatted && directorEmail)
    ? `${gatewayHost}/#/gateway/login/${identifiers.kid}/${gwtFormatted}/${directorEmail}`
    : identifiers.accessLink;

  director.digio = {
    customerIdentifier: payload.customer_identifier,
    referenceId: identifiers.referenceId || payload.reference_id,
    requestId: identifiers.requestId || identifiers.kid,
    kid: identifiers.kid,
    rid: identifiers.rid,
    actionIds: identifiers.actionIds || [],
    accessToken: identifiers.accessToken,
    accessLink: formattedAccessLink,
    status: identifiers.status || "requested",
    lastAction: "request",
    lastSyncedAt: new Date(),
  };
  director.status = "requested";
  director.rejectionReason = undefined;
  record.markModified("directors");
  return identifiers.kid;
}

// POST /api/admin/kyc/send-invite
router.post("/send-invite", requireAdmin, async (req, res) => {
  try {
    const { name, email, phone, entityName } = req.body;
    if (!name || !email) {
      return res.status(400).json({ success: false, message: "Director Name and Email are required." });
    }

    const cleanName = String(name).trim();
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPhone = String(phone || "").trim();
    const cleanEntity = String(entityName || "Corporate KYC").trim();

    // Create initial KYC record for Director
    const newRecord = await KycForm.create({
      entityName: cleanEntity,
      entityType: "Company",
      entityPan: "PENDING",
      registeredAddress: "Pending filling by Director",
      authSignatoryName: cleanName,
      authSignatoryEmail: cleanEmail,
      authSignatoryTel: cleanPhone,
      email: cleanEmail,
      phone: cleanPhone,
      declarationAccepted: true,
      directors: [
        {
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          designation: "Director",
          status: "requested",
        },
      ],
      applicationStatus: "pending",
      kycStatus: "in_progress",
    });

    let digioKid = null;
    let digioAccessLink = null;
    try {
      digioKid = await requestDirectorKyc(newRecord, newRecord.directors[0]);
      digioAccessLink = newRecord.directors[0]?.digio?.accessLink;
      await newRecord.save();
    } catch (digioErr) {
      console.warn("DigiO API invite note:", digioErr.message);
    }

    const protocol = req.protocol;
    const host = req.get("host");
    const baseUrl = `${protocol}://${host}`;

    const emailRes = await sendDigioKycInviteEmail({
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      entityName: cleanEntity,
      kycId: newRecord._id,
      baseUrl,
    });

    if (!emailRes.success) {
      newRecord.emailError = emailRes.error;
      await newRecord.save();
    }

    res.status(201).json({
      success: true,
      message: "DigiO KYC invitation link created & sent to Director!",
      kycId: newRecord._id,
      kid: digioKid,
      digioAccessLink: digioAccessLink || emailRes.kycLink,
      kycLink: emailRes.kycLink,
      emailSent: emailRes.success,
      emailError: emailRes.error,
    });
  } catch (err) {
    console.error("Error sending KYC invite:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/kyc/:id/match-digio
router.post("/:id/match-digio", requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid KYC ID." });
    }
    const record = await KycForm.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: "KYC record not found." });

    const director = (record.directors && record.directors[0]) || null;
    const kid = director?.digio?.kid || record.digio?.kid;

    let digioData = null;
    let digioError = null;

    if (kid) {
      try {
        const digioRes = await digio.getRequestDetails(kid);
        digioData = digioRes.data || {};
      } catch (err) {
        digioError = err.message;
      }
    }

    const submittedName = String(director?.name || record.authSignatoryName || record.entityName || "").trim();
    const submittedEmail = String(director?.email || record.email || record.authSignatoryEmail || "").trim().toLowerCase();
    const submittedPhone = String(director?.phone || record.phone || record.authSignatoryTel || "").trim();
    const submittedPan = String(record.entityPan || record.authSignatoryPan || "").trim().toUpperCase();

    const digioCustomerName = String(digioData?.customer_name || digioData?.name || "").trim();
    const digioCustomerEmail = String(digioData?.customer_identifier || digioData?.email || "").trim().toLowerCase();
    const digioStatus = String(digioData?.status || director?.digio?.status || "requested").toLowerCase();

    const nameMatched = submittedName && digioCustomerName ? submittedName.toLowerCase() === digioCustomerName.toLowerCase() : true;
    const emailMatched = submittedEmail && digioCustomerEmail ? submittedEmail === digioCustomerEmail : true;

    res.json({
      success: true,
      data: {
        kycId: record._id,
        kid: kid || "Not Generated",
        directorId: director?._id,
        digioStatus,
        submitted: {
          name: submittedName,
          email: submittedEmail,
          phone: submittedPhone,
          pan: submittedPan,
          documents: record.uploadedDocuments,
        },
        digioResponse: digioData,
        matchReport: {
          nameMatched,
          emailMatched,
          statusMatched: ["completed", "approved", "success"].includes(digioStatus),
          overallMatch: nameMatched && emailMatched,
        },
        digioError,
      },
    });
  } catch (err) {
    console.error("Match DigiO data error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

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

    if (record.directors && Array.isArray(record.directors)) {
      record.directors.forEach((director) => {
        if (director.digio) {
          director.digio.accessLink = digio.formatDigioKycLink(
            director.digio.accessLink,
            director.digio.kid,
            director.digio.accessToken,
            director.email
          );
        }
      });
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
      { _id: req.params.id, applicationStatus: { $in: ["pending", null] }, approvalInProgress: { $ne: true } },
      { $set: { approvalInProgress: true } },
      { new: true }
    );
    if (!record) {
      const existing = await KycForm.findById(req.params.id).select("applicationStatus status").lean();
      if (!existing) return res.status(404).json({ success: false, message: "KYC record not found." });
      return res.status(409).json({ success: false, message: `KYC record is already ${existing.applicationStatus || existing.status || "being processed"}.` });
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

    record.applicationStatus = "approved";
    record.kycStatus = record.kycStatus || (record.directors && record.directors.some((d) => d.status === "requested" || d.status === "completed") ? "in_progress" : "not_started");
    record.approvedBy = req.adminId;
    record.approvedAt = new Date();
    record.approvalInProgress = false;
    if (record.digio) {
      record.digio.status = record.digio?.status || "approved";
      record.digio.lastAction = "approval";
      record.digio.lastSyncedAt = new Date();
    }
    await record.save();

    // Send main approval email asynchronously & capture any failure
    const apprEmailRes = await sendApprovalEmail(record).catch((err) => ({ success: false, error: err.message }));
    if (!apprEmailRes.success) {
      record.emailError = apprEmailRes.error;
    } else {
      record.emailError = undefined;
    }
    await record.save();

    return res.json({
      success: true,
      data: {
        id: record._id,
        applicationStatus: record.applicationStatus,
        kycStatus: record.kycStatus,
        agreementStatus: record.agreementStatus,
        status: record.status,
      },
    });
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
      record.kycStatus = "completed";
    } else {
      record.kycStatus = "in_progress";
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
        kycStatus: record.kycStatus,
        agreementStatus: record.agreementStatus,
        status: record.status,
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

    if (record.applicationStatus !== "approved" && record.status !== "approved") {
      return res.status(400).json({ success: false, message: "Please approve the application form details before approving Director KYC." });
    }

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
      record.kycStatus = "completed";
    } else {
      record.kycStatus = "in_progress";
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
        kycStatus: record.kycStatus,
        agreementStatus: record.agreementStatus,
        status: record.status,
      },
    });
  } catch (error) {
    console.error(`Director KYC manual approval error (${req.params.id}):`, error);
    return res.status(500).json({ success: false, message: "Unable to approve director KYC." });
  }
});

router.post("/:id/directors", requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid KYC ID." });
    }
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const phone = String(req.body.phone || "").trim();
    const designation = String(req.body.designation || "Director").trim();
    const din = String(req.body.din || "").trim();

    if (!name || (!email && !phone)) {
      return res.status(400).json({ success: false, message: "Director Name and Email or Phone are required." });
    }

    const record = await KycForm.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: "KYC record not found." });

    const newDirector = {
      name,
      email,
      phone,
      designation,
      din,
      status: "pending",
    };
    record.directors.push(newDirector);
    record.markModified("directors");
    await record.save();

    const addedDirector = record.directors[record.directors.length - 1];

    return res.status(201).json({
      success: true,
      data: {
        director: addedDirector,
        kycStatus: record.kycStatus,
        agreementStatus: record.agreementStatus,
        status: record.status,
      },
    });
  } catch (error) {
    console.error(`Add director error (${req.params.id}):`, error);
    return res.status(500).json({ success: false, message: "Unable to add director." });
  }
});

router.post("/:id/directors/:directorId/send-kyc", requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id) || !mongoose.Types.ObjectId.isValid(req.params.directorId)) {
      return res.status(400).json({ success: false, message: "Invalid KYC or director ID." });
    }
    const record = await KycForm.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: "KYC record not found." });
    const director = record.directors.id(req.params.directorId);
    if (!director) return res.status(404).json({ success: false, message: "Director not found." });

    if (record.applicationStatus !== "approved" && record.status !== "approved") {
      return res.status(400).json({ success: false, message: "Please approve the application form details before sending Director KYC." });
    }

    director.digio = undefined;
    director.status = "pending";
    record.markModified("directors");

    const kid = await requestDirectorKyc(record, director);
    record.kycStatus = "in_progress";
    record.markModified("directors");
    await record.save();

    const emailRes = await sendDirectorKycEmail(director, record).catch((err) => ({ success: false, error: err.message }));
    if (!emailRes.success) {
      director.emailError = emailRes.error;
    } else {
      director.emailError = undefined;
    }
    record.markModified("directors");
    await record.save();

    return res.json({
      success: true,
      data: {
        directorId: director._id,
        status: director.status,
        kid: director.digio?.kid,
        accessLink: director.digio?.accessLink,
        kycStatus: record.kycStatus,
        agreementStatus: record.agreementStatus,
        status: record.status,
        emailError: director.emailError,
      },
    });
  } catch (error) {
    console.error(`Send director KYC error (${req.params.id}):`, error.message);
    if (error.code && error.code.startsWith("DIGIO_")) {
      return res.status(error.code === "DIGIO_PROVIDER_ERROR" ? 502 : 503).json({ success: false, message: error.message, code: error.code });
    }
    return res.status(500).json({ success: false, message: error.message || "Failed to send director KYC." });
  }
});

router.post("/:id/directors/:directorId/send-agreement", requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id) || !mongoose.Types.ObjectId.isValid(req.params.directorId)) {
      return res.status(400).json({ success: false, message: "Invalid KYC or director ID." });
    }
    const record = await KycForm.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: "KYC record not found." });
    const director = record.directors.id(req.params.directorId);
    if (!director) return res.status(404).json({ success: false, message: "Director not found." });

    if (record.applicationStatus !== "approved" && record.status !== "approved") {
      return res.status(400).json({ success: false, message: "Application form details must be approved before sending Agreement." });
    }

    if (record.agreementStatus === "signed" || record.agreement?.status === "signed" || record.status === "completed") {
      return res.status(409).json({ success: false, message: "Agreement has already been completed and signed." });
    }

    if (director.status !== "completed") {
      return res.status(400).json({ success: false, message: "Director KYC must be completed before sending the agreement." });
    }

    const signerEmail = String(director.email || "").trim().toLowerCase();
    const signerName = String(director.name || "").trim();

    if (!signerEmail) {
      return res.status(400).json({ success: false, message: "Director email is required for sending the agreement." });
    }

    const pdfBuffer = await generateAgreementPdf(record);
    const signers = [{
      identifier: signerEmail,
      name: signerName,
      sign_type: "aadhaar",
      reason: "Master Agent Onboarding Agreement Signing",
    }];

    const signCoordinates = {};
    const boxWidth = 120;
    const boxHeight = 40;
    const llx = 45;
    const lly = 60;
    const urx = llx + boxWidth;
    const ury = lly + boxHeight;
    signCoordinates[signerEmail] = {
      "1": [{ llx, lly, urx, ury }]
    };

    const fileName = `Master_Agent_Agreement_${String(record.entityName || record._id).replace(/[^a-z0-9_-]/gi, "_")}_${String(signerName).replace(/[^a-z0-9_-]/gi, "_")}.pdf`;
    const payload = {
      signers,
      expire_in_days: 10,
      display_on_page: "Custom",
      notify_signers: true,
      send_sign_link: true,
      file_name: fileName,
      file_data: pdfBuffer.toString("base64"),
      sign_coordinates: signCoordinates,
    };

    const providerResponse = await digio.createSigningRequest(payload);
    const identifiers = digio.extractIdentifiers(providerResponse.data);
    const providerData = providerResponse.data && typeof providerResponse.data === "object" ? providerResponse.data : {};
    const documentId = providerData.id || providerData.document_id || identifiers.requestId;
    if (!documentId) {
      const error = new Error("DigiSign response did not contain a document identifier.");
      error.code = "DIGIO_INVALID_RESPONSE";
      throw error;
    }

    const signBase = process.env.DIGISIGN_BASE_URL || "";
    const signGatewayHost = signBase.includes("ext.digio.in") ? "https://ext.digio.in" : "https://app.digio.in";

    let signingToken = "";
    try {
      const tokenRes = await digio.regenerateSigningToken(documentId);
      signingToken = (tokenRes.data && (tokenRes.data.id || tokenRes.data.response?.id || tokenRes.data.token_id)) || "";
    } catch (tokenErr) {
      console.warn("Could not generate gateway token for document:", tokenErr.message);
    }

    const encodedId = encodeURIComponent(signerEmail);
    const signingUrl = signingToken
      ? `${signGatewayHost}/#/gateway/login/${documentId}/${signingToken}/${encodedId}`
      : `${signGatewayHost}/#/gateway/login/${documentId}/${encodedId}/`;

    director.agreement = {
      status: "sent",
      documentId,
      signingUrl,
      sentAt: new Date(),
    };

    if (!record.agreement) {
      record.agreement = {
        status: "sent",
        documentId,
        signingUrl,
        signers: [],
        selectedDirectorId: String(director._id),
        lastAction: "create_director_agreement",
        lastSyncedAt: new Date(),
      };
    } else {
      record.agreement.status = "sent";
      record.agreement.documentId = documentId;
      record.agreement.signingUrl = signingUrl;
      record.agreement.selectedDirectorId = String(director._id);
      record.agreement.lastSyncedAt = new Date();
    }
    record.agreementStatus = "sent";

    if (!record.agreement.signers) record.agreement.signers = [];
    const existingSignerIndex = record.agreement.signers.findIndex((s) => s.email && s.email.toLowerCase() === signerEmail);
    if (existingSignerIndex >= 0) {
      record.agreement.signers[existingSignerIndex].status = "pending";
      record.agreement.signers[existingSignerIndex].providerSignerId = documentId;
    } else {
      record.agreement.signers.push({
        name: signerName,
        email: signerEmail,
        providerSignerId: documentId,
        status: "pending",
      });
    }

    const emailRes = await sendAgreementSigningEmail({ name: signerName, identifier: signerEmail }, record, signingUrl).catch((err) => ({ success: false, error: err.message }));
    if (!emailRes.success) {
      director.agreement.emailError = emailRes.error;
      const targetSigner = record.agreement.signers.find((s) => s.email === signerEmail);
      if (targetSigner) targetSigner.emailError = emailRes.error;
    } else {
      director.agreement.emailError = undefined;
    }

    record.markModified("directors");
    record.markModified("agreement");
    await record.save();

    return res.status(201).json({
      success: true,
      data: {
        id: record._id,
        directorId: director._id,
        documentId,
        signingUrl,
        agreementStatus: record.agreementStatus,
        directorAgreement: director.agreement,
        emailError: director.agreement?.emailError,
      },
    });
  } catch (error) {
    console.error(`Send director agreement error (${req.params.id}, director ${req.params.directorId}):`, error.message);
    if (error.code && error.code.startsWith("DIGIO_")) {
      return res.status(error.code === "DIGIO_PROVIDER_ERROR" ? 502 : 503).json({ success: false, message: error.message, code: error.code });
    }
    return res.status(500).json({ success: false, message: error.message || "Failed to send agreement to director." });
  }
});

router.delete("/:id/directors/:directorId", requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id) || !mongoose.Types.ObjectId.isValid(req.params.directorId)) {
      return res.status(400).json({ success: false, message: "Invalid KYC or director ID." });
    }
    const record = await KycForm.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: "KYC record not found." });

    record.directors.pull({ _id: req.params.directorId });
    record.markModified("directors");
    await record.save();

    return res.json({ success: true, message: "Director removed successfully.", data: { id: record._id } });
  } catch (error) {
    console.error(`Delete director error (${req.params.id}):`, error);
    return res.status(500).json({ success: false, message: "Unable to remove director." });
  }
});

router.post("/:id/agreement", requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid KYC ID." });
    }
    const record = await KycForm.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: "KYC record not found." });
    
    // Application KYC must be approved by Admin before creating an agreement
    const isApproved = record.applicationStatus === "approved" || ["approved", "director_kyc_pending", "director_kyc_completed", "agreement_pending"].includes(record.status);
    if (!isApproved) {
      return res.status(409).json({ success: false, message: "Application KYC must be approved by Admin before creating an agreement." });
    }

    // Director KYC must be completed before sending an agreement
    const hasIncompleteDirector = record.directors && record.directors.length > 0 && record.directors.some((d) => d.status !== "completed");
    if (hasIncompleteDirector) {
      return res.status(409).json({ success: false, message: "All directors must complete KYC verification before sending the agreement." });
    }

    // Check if agreement is already signed / completed
    const isAlreadySigned = record.agreementStatus === "signed" || record.agreement?.status === "signed" || record.status === "completed";
    if (isAlreadySigned) {
      return res.status(409).json({ success: false, message: "Agreement has already been completed and signed." });
    }

    if (record.agreement && record.agreement.providerRequestId && record.agreement.status === "sent") {
      return res.status(409).json({ success: false, message: "An agreement signing request is already active for this application." });
    }

    // Determine target director for agreement
    let selectedDirector = null;
    if (req.body.directorId) {
      selectedDirector = (record.directors && record.directors.id) ? record.directors.id(req.body.directorId) : (record.directors && record.directors.find((d) => String(d._id) === String(req.body.directorId)));
      if (!selectedDirector) {
        return res.status(400).json({ success: false, message: "Selected director not found in this application." });
      }
    } else if (record.directors && record.directors.length === 1) {
      selectedDirector = record.directors[0];
    } else if (record.directors && record.directors.length > 1) {
      return res.status(400).json({ success: false, message: "Multiple directors found. Please select which director to send the agreement to." });
    }

    if (selectedDirector) {
      if (selectedDirector.status !== "completed") {
        return res.status(400).json({ success: false, message: `Director ${selectedDirector.name} must complete KYC verification before receiving the agreement.` });
      }
    } else {
      const hasIncompleteDirector = record.directors && record.directors.length > 0 && record.directors.some((d) => d.status !== "completed");
      if (hasIncompleteDirector) {
        return res.status(409).json({ success: false, message: "All directors must complete KYC verification before sending the agreement." });
      }
    }

    const signerEmail = selectedDirector
      ? String(selectedDirector.email || "").trim().toLowerCase()
      : String(req.body.email || record.authSignatoryEmail || record.email || "").trim().toLowerCase();
    const signerName = selectedDirector
      ? String(selectedDirector.name || "").trim()
      : String(req.body.name || record.authSignatoryName || record.entityName || "").trim();

    if (!signerEmail) {
      return res.status(400).json({ success: false, message: "Director email is required for sending the agreement." });
    }

    const pdfBuffer = await generateAgreementPdf(record);
    const signers = [{
      identifier: signerEmail,
      name: signerName,
      sign_type: "aadhaar",
      reason: "Master Agent Onboarding Agreement Signing",
    }];

    const signCoordinates = {};
    const boxWidth = 120;
    const boxHeight = 40;
    const llx = 45;
    const lly = 60;
    const urx = llx + boxWidth;
    const ury = lly + boxHeight;
    signCoordinates[signerEmail] = {
      "1": [{ llx, lly, urx, ury }]
    };

    const fileName = `Master_Agent_Agreement_${String(record.entityName || record._id).replace(/[^a-z0-9_-]/gi, "_")}_${String(signerName).replace(/[^a-z0-9_-]/gi, "_")}.pdf`;
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
    const documentId = providerData.id || providerData.document_id || identifiers.requestId;
    if (!documentId) {
      const error = new Error("DigiSign response did not contain a document identifier.");
      error.code = "DIGIO_INVALID_RESPONSE";
      throw error;
    }

    const signBase = process.env.DIGISIGN_BASE_URL || "";
    const signGatewayHost = signBase.includes("ext.digio.in") ? "https://ext.digio.in" : "https://app.digio.in";

    let signingToken = "";
    try {
      const tokenRes = await digio.regenerateSigningToken(documentId);
      signingToken = (tokenRes.data && (tokenRes.data.id || tokenRes.data.response?.id || tokenRes.data.token_id)) || "";
    } catch (tokenErr) {
      console.warn("Could not generate gateway token for document:", tokenErr.message);
    }

    const firstSignerIdentifier = (signers && signers[0] && signers[0].identifier) || signerEmail || "";
    const buildSignUrl = (ident) => {
      const encodedId = encodeURIComponent(ident);
      if (signingToken) {
        return `${signGatewayHost}/#/gateway/login/${documentId}/${signingToken}/${encodedId}`;
      }
      return `${signGatewayHost}/#/gateway/login/${documentId}/${encodedId}/`;
    };

    const signingUrl = buildSignUrl(firstSignerIdentifier);

    if (selectedDirector) {
      selectedDirector.agreement = {
        status: "sent",
        documentId,
        signingUrl,
        sentAt: new Date(),
      };
    }

    record.agreement = {
      status: "sent",
      providerRequestId: documentId,
      documentId: documentId,
      signingUrl,
      signers: [{ name: signerName, email: signerEmail, status: "pending", providerSignerId: documentId }],
      selectedDirectorId: selectedDirector ? String(selectedDirector._id) : undefined,
      lastAction: "create",
      lastSyncedAt: new Date(),
    };
    record.agreementStatus = "sent";

    // Send email to the selected director with the agreement signing link & capture failures
    let agreementEmailError = null;
    const emailRes = await sendAgreementSigningEmail({ name: signerName, identifier: signerEmail }, record, signingUrl).catch((err) => ({ success: false, error: err.message }));
    if (!emailRes.success) {
      agreementEmailError = emailRes.error;
      record.agreement.signers[0].emailError = emailRes.error;
      if (selectedDirector) selectedDirector.agreement.emailError = emailRes.error;
    } else {
      if (selectedDirector) selectedDirector.agreement.emailError = undefined;
    }
    record.agreement.emailError = agreementEmailError || undefined;
    record.markModified("directors");
    record.markModified("agreement");
    await record.save();

    return res.status(201).json({
      success: true,
      data: {
        id: record._id,
        documentId,
        providerRequestId: documentId,
        signingUrl,
        signers: record.agreement.signers,
        agreementStatus: record.agreementStatus,
        kycStatus: record.kycStatus,
        status: record.status,
        emailError: record.agreement.emailError,
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
      record.agreementStatus = "signed";
      if (record.agreement.signers && record.agreement.signers.length) {
        record.agreement.signers.forEach((s) => {
          s.status = "signed";
          s.signedAt = s.signedAt || new Date();
        });
      }
      if (record.directors && record.directors.length) {
        record.directors.forEach((d) => {
          if (
            (record.agreement.selectedDirectorId && String(d._id) === String(record.agreement.selectedDirectorId)) ||
            (record.agreement.signers && record.agreement.signers.some((s) => s.email && s.email.toLowerCase() === (d.email || "").toLowerCase()))
          ) {
            if (!d.agreement) d.agreement = {};
            d.agreement.status = "signed";
            d.agreement.signedAt = d.agreement.signedAt || new Date();
          }
        });
        record.markModified("directors");
      }
      const completeRes = await sendKycCompletedEmail(record).catch((err) => ({ success: false, error: err.message }));
      if (!completeRes.success) {
        record.emailError = completeRes.error;
      } else {
        record.emailError = undefined;
      }
    }

    await record.save();
    return res.json({
      success: true,
      data: {
        id: record._id,
        documentId: docId,
        agreementStatus: record.agreementStatus,
        kycStatus: record.kycStatus,
        applicationStatus: record.applicationStatus,
        status: record.status,
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
    record.agreementStatus = "signed";
    record.agreement.lastSyncedAt = new Date();
    if (record.agreement.signers) {
      record.agreement.signers.forEach((s) => {
        s.status = "signed";
        s.signedAt = s.signedAt || new Date();
      });
    }
    if (record.directors && record.directors.length) {
      record.directors.forEach((d) => {
        if (
          (record.agreement.selectedDirectorId && String(d._id) === String(record.agreement.selectedDirectorId)) ||
          (record.agreement.signers && record.agreement.signers.some((s) => s.email && s.email.toLowerCase() === (d.email || "").toLowerCase()))
        ) {
          if (!d.agreement) d.agreement = {};
          d.agreement.status = "signed";
          d.agreement.signedAt = d.agreement.signedAt || new Date();
        }
      });
      record.markModified("directors");
    }
    const completeRes = await sendKycCompletedEmail(record).catch((err) => ({ success: false, error: err.message }));
    if (!completeRes.success) {
      record.emailError = completeRes.error;
    } else {
      record.emailError = undefined;
    }
    await record.save();
    return res.json({
      success: true,
      data: {
        id: record._id,
        agreementStatus: record.agreementStatus,
        kycStatus: record.kycStatus,
        applicationStatus: record.applicationStatus,
        status: record.status,
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

    const record = await KycForm.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: "KYC record not found." });
    if (record.applicationStatus === "rejected") {
      return res.status(409).json({ success: false, message: "KYC record is already rejected." });
    }

    record.applicationStatus = "rejected";
    record.status = "rejected";
    record.rejectionReason = reason;
    record.rejectedBy = req.adminId;
    record.rejectedAt = new Date();

    const baseUrl = process.env.APP_URL || process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const rejEmailRes = await sendRejectionEmail(record, reason, baseUrl).catch((err) => ({ success: false, error: err.message }));
    if (!rejEmailRes.success) {
      record.emailError = rejEmailRes.error;
    } else {
      record.emailError = undefined;
    }
    await record.save();

    return res.json({
      success: true,
      data: {
        id: record._id,
        applicationStatus: record.applicationStatus,
        kycStatus: record.kycStatus,
        agreementStatus: record.agreementStatus,
        status: record.status,
        editUrl: rejEmailRes.editUrl,
      },
    });
  } catch (error) {
    console.error(`Admin KYC rejection error (${req.params.id}):`, error);
    return res.status(500).json({ success: false, message: "Unable to reject KYC record." });
  }
});

module.exports = router;
