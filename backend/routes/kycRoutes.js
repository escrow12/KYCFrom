const express = require("express");
const router = express.Router();
const KycForm = require("../models/KycForm");
const generateKycPdf = require("../utils/generatePdf");

// Create a new KYC form submission
router.post("/", async (req, res) => {
  try {
    const record = await KycForm.create(req.body);
    console.log(`KYC application saved: ${record._id}`);
    res.status(201).json({ success: true, id: record._id });
  } catch (err) {
    console.error("KYC application save error:", err);
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
