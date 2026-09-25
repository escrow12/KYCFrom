const crypto = require("crypto");
const Admin = require("../models/Admin");

const TOKEN_TTL_SECONDS = 60 * 60 * 8;

function configuration() {
  const secret = String(process.env.ADMIN_AUTH_SECRET || "").trim();
  const temporaryUsername = String(process.env.ADMIN_USERNAME || "").trim().toLowerCase();
  const temporaryPassword = String(process.env.ADMIN_PASSWORD || "");
  if (!secret) {
    const error = new Error("Admin authentication is not configured. Set ADMIN_AUTH_SECRET.");
    error.code = "ADMIN_AUTH_NOT_CONFIGURED";
    throw error;
  }
  return { secret, temporaryUsername, temporaryPassword };
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 32, { N: 16384, r: 8, p: 1 }).toString("hex");
  return `scrypt$16384$8$1$${salt}$${hash}`;
}

function verifyPassword(password, passwordHash) {
  const parts = String(passwordHash).split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, cost, blockSize, parallel, salt, expected] = parts;
  const derived = crypto.scryptSync(String(password), salt, 32, {
    N: Number(cost),
    r: Number(blockSize),
    p: Number(parallel),
  }).toString("hex");
  return safeEqual(derived, expected);
}

async function authenticate(identifier, password) {
  const config = configuration();
  const suppliedIdentifier = String(identifier || "").trim().toLowerCase();
  if (config.temporaryUsername && config.temporaryPassword) {
    if (!safeEqual(suppliedIdentifier, config.temporaryUsername) || !safeEqual(password, config.temporaryPassword)) {
      const error = new Error("Invalid admin credentials.");
      error.code = "ADMIN_INVALID_CREDENTIALS";
      throw error;
    }
    return createToken(config.temporaryUsername, "admin", config.secret, "env");
  }
  const admin = await Admin.findOne({
    $or: [{ username: suppliedIdentifier }, { email: suppliedIdentifier }],
  }).select("+passwordHash");
  const validPassword = admin ? verifyPassword(password, admin.passwordHash) : false;
  if (!admin || !admin.active || admin.status !== "active" || !validPassword) {
    const error = new Error("Invalid admin credentials.");
    error.code = "ADMIN_INVALID_CREDENTIALS";
    throw error;
  }
  return createToken(String(admin._id), admin.role, config.secret, "mongo");
}

function createToken(subject, role, secret, authMode = "mongo") {
  const payload = Buffer.from(JSON.stringify({ sub: subject, role, authMode, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyToken(token) {
  const { secret } = configuration();
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) throw new Error("Invalid admin session.");
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  if (!safeEqual(signature, expected)) throw new Error("Invalid admin session.");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (claims.role !== "admin" || !claims.sub || Number(claims.exp) <= Math.floor(Date.now() / 1000)) throw new Error("Expired admin session.");
  return claims;
}

async function getActiveAdmin(adminId) {
  return Admin.findOne({ _id: adminId, active: true, status: "active" }).select("username email role active status").lean();
}

function getTemporaryAdmin(username) {
  const config = configuration();
  return config.temporaryUsername && config.temporaryPassword && safeEqual(username, config.temporaryUsername)
    ? { _id: config.temporaryUsername, username: config.temporaryUsername, email: config.temporaryUsername, role: "admin", active: true, status: "active" }
    : null;
}

function getCookie(req, name) {
  const cookies = String(req.headers.cookie || "").split(";");
  const entry = cookies.find((cookie) => cookie.trim().startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.trim().slice(name.length + 1)) : "";
}

function sessionCookie(token) {
  const secure = String(process.env.ADMIN_COOKIE_SECURE || "").toLowerCase() === "true" || process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `admin_session=${encodeURIComponent(token)}; Max-Age=${TOKEN_TTL_SECONDS}; Path=/; HttpOnly; SameSite=Strict${secure}`;
}

module.exports = { authenticate, verifyToken, getActiveAdmin, getTemporaryAdmin, createToken, hashPassword, verifyPassword, getCookie, sessionCookie, TOKEN_TTL_SECONDS };