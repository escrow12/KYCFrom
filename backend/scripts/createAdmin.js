const path = require("path");
const readline = require("readline");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const Admin = require("../models/Admin");
const { hashPassword } = require("../services/adminAuthService");

function ask(question) {
  const input = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => input.question(question, (answer) => { input.close(); resolve(answer.trim()); }));
}

function askPassword(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
      reject(new Error("Run admin creation in an interactive terminal to enter the password securely."));
      return;
    }

    process.stdout.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let password = "";
    const handleInput = (chunk) => {
      const input = chunk.toString("utf8");
      if (input === "\u0003") {
        finish();
        reject(new Error("Admin creation cancelled."));
      } else if (input === "\r" || input === "\n") {
        finish();
        process.stdout.write("\n");
        resolve(password);
      } else if (input === "\u007f" || input === "\b") {
        password = password.slice(0, -1);
      } else {
        password += input;
      }
    };
    const finish = () => {
      process.stdin.removeListener("data", handleInput);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };

    process.stdin.on("data", handleInput);
  });
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) throw new Error("MONGODB_URI or MONGO_URI is missing.");

  const username = (process.env.ADMIN_SEED_USERNAME || await ask("Admin username/email: ")).toLowerCase();
  const email = (process.env.ADMIN_SEED_EMAIL || await ask("Admin email: ")).toLowerCase();
  const password = process.env.ADMIN_SEED_PASSWORD || await askPassword("Admin password: ");
  if (!username || !email || !password) throw new Error("Username, email, and password are required.");

  await mongoose.connect(mongoUri);
  const existing = await Admin.findOne({ $or: [{ username }, { email }] }).select("_id");
  if (existing) throw new Error("An admin with this username or email already exists.");

  const admin = await Admin.create({ username, email, passwordHash: hashPassword(password), role: "admin", active: true, status: "active" });
  console.log(`Admin created: ${admin._id}`);
}

main()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(async () => { if (mongoose.connection.readyState) await mongoose.disconnect(); });
