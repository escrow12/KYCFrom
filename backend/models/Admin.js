const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true, lowercase: true, unique: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["admin"], default: "admin", required: true },
    active: { type: Boolean, default: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true, collection: "admins" }
);

module.exports = mongoose.model("Admin", adminSchema);
