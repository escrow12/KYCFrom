const express = require("express");
const mongoose = require("mongoose");
const ClientVerification = require("../models/clientverification");
const generatePdf = require("../utils/clientverificationPdf");

const router = express.Router();

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

router.post("/", async (req, res) => {
  try {
    const form = await ClientVerification.create(req.body);
    res.status(201).json({ success: true, id: form._id, data: form });
  } catch (err) {
    console.error("Client verification save error:", err);
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const forms = await ClientVerification.find().sort({ createdAt: -1 });
    res.json({ success: true, data: forms });
  } catch (err) {
    console.error("Client verification list error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid form ID" });
    }

    const form = await ClientVerification.findById(req.params.id);
    if (!form) {
      return res.status(404).json({ success: false, message: "Client verification form not found" });
    }

    res.json({ success: true, data: form });
  } catch (err) {
    console.error("Client verification detail error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/:id/pdf", async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).send("Invalid form ID");
    }

    const form = await ClientVerification.findById(req.params.id);
    if (!form) return res.status(404).send("Client verification form not found");

    const pdf = await generatePdf(form);
    const name = String(form.client.legalName || form._id).replace(/[^a-z0-9_-]+/gi, "_");
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Client_Verification_${name}.pdf"`,
      "Content-Length": pdf.length,
    });
    res.send(pdf);
  } catch (err) {
    console.error("Client verification PDF error:", err);
    res.status(500).send(`Error generating PDF: ${err.message}`);
  }
});

module.exports = router;
