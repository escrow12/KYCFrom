const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const kycRoutes = require("./routes/kycRoutes");
const clientVerificationRoutes = require("./routes/clientverificationRoutes");
const adminRoutes = require("./routes/adminRoutes");
const digioRoutes = require("./routes/digioRoutes");
const adminAuthRoutes = require("./routes/adminAuthRoutes");
const adminAuthService =
  require("./services/adminAuthService");

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!mongoUri) {
  throw new Error("MONGODB_URI or MONGO_URI is missing. Create backend/.env from backend/.env.example and set your MongoDB connection string.");
}

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Serve the frontend (index.html, style.css, script.js) from /public
app.use(express.static(path.join(__dirname, "public")));

// API routes
app.use("/api/kyc", kycRoutes);
app.use("/api/client-verification", clientVerificationRoutes);
app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/admin/kyc", adminRoutes);
app.use("/api/kyc", digioRoutes);

// Fallback to index.html for the root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = Number(process.env.PORT) || 5000;

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      const nextPort = port + 1;
      console.warn(`Port ${port} is busy. Retrying on ${nextPort}...`);
      startServer(nextPort);
      return;
    }

    console.error("Server startup error:", err.message);
    process.exit(1);
  });
}

mongoose
  .connect(mongoUri)
  .then(async () => {

    console.log(
      "Connected to MongoDB Atlas"
    );

    // VERY IMPORTANT
    await adminAuthService.ensureAdmin();

    startServer(PORT);
  })
  .catch((err) => {

    console.error(
      "MongoDB connection error:",
      err.message
    );

    process.exit(1);
  });
