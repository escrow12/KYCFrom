const express = require("express");
const mongoose = require("mongoose");
const KycForm = require("../models/KycForm");

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

router.get("/", async (req, res) => {
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

router.get("/:id", async (req, res) => {
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

module.exports = router;
