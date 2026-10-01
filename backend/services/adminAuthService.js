const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

const COOKIE_NAME = "admin_session";
const TOKEN_TTL_SECONDS = 24 * 60 * 60;


// ==========================================
// SECRET
// ==========================================

function getAuthSecret() {
  const secret = String(
    process.env.ADMIN_AUTH_SECRET || ""
  ).trim();

  if (!secret) {
    const error = new Error(
      "Admin authentication is not configured. Set ADMIN_AUTH_SECRET."
    );

    error.code = "ADMIN_AUTH_NOT_CONFIGURED";

    throw error;
  }

  return secret;
}


// ==========================================
// HASH PASSWORD
// ==========================================

async function hashPassword(password) {
  return bcrypt.hash(String(password), 12);
}


// ==========================================
// CREATE TOKEN
// ==========================================

function createToken(adminId, role = "admin") {
  return jwt.sign(
    {
      sub: String(adminId),
      role,
    },
    getAuthSecret(),
    {
      expiresIn: TOKEN_TTL_SECONDS,
    }
  );
}


// ==========================================
// VERIFY TOKEN
// ==========================================

function verifyToken(token) {
  return jwt.verify(
    token,
    getAuthSecret()
  );
}


// ==========================================
// GET COOKIE
// ==========================================

function getCookie(req, name) {
  const cookieHeader =
    req.headers.cookie || "";

  const cookies = {};

  cookieHeader.split(";").forEach((item) => {
    const index = item.indexOf("=");

    if (index === -1) return;

    const key = item
      .slice(0, index)
      .trim();

    const value = item
      .slice(index + 1)
      .trim();

    cookies[key] =
      decodeURIComponent(value);
  });

  return cookies[name] || null;
}


// ==========================================
// SESSION COOKIE
// ==========================================

function sessionCookie(token) {
  const secure =
    process.env.NODE_ENV === "production"
      ? "; Secure"
      : "";

  return [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${TOKEN_TTL_SECONDS}`,
    secure,
  ]
    .filter(Boolean)
    .join("; ");
}


// ==========================================
// GET ACTIVE ADMIN
// ==========================================

async function getActiveAdmin(adminId) {
  const admin =
    await Admin.findById(adminId);

  if (!admin) {
    return null;
  }

  if (admin.role !== "admin") {
    return null;
  }

  if (admin.active === false) {
    return null;
  }

  if (admin.status === "inactive") {
    return null;
  }

  return admin;
}


// ==========================================
// LOGIN
// ==========================================

async function authenticate(
  identifier,
  password
) {
  const normalized =
    String(identifier || "")
      .trim()
      .toLowerCase();

  const enteredPassword =
    String(password || "");


  console.log(
    "Admin login attempt:",
    normalized
  );


  if (
    !normalized ||
    !enteredPassword
  ) {
    const error = new Error(
      "Username/email and password are required."
    );

    error.code =
      "ADMIN_INVALID_CREDENTIALS";

    throw error;
  }


  // Find by email OR username
  const admin =
    await Admin.findOne({
      $or: [
        {
          email: normalized,
        },
        {
          username: normalized,
        },
      ],
    });


  console.log(
    "Admin found:",
    !!admin
  );


  if (!admin) {
    const error = new Error(
      "Invalid email or password."
    );

    error.code =
      "ADMIN_INVALID_CREDENTIALS";

    throw error;
  }


  console.log(
    "Admin email:",
    admin.email
  );

  console.log(
    "Admin role:",
    admin.role
  );

  console.log(
    "Admin active:",
    admin.active
  );


  if (
    admin.role !== "admin" ||
    admin.active === false ||
    admin.status === "inactive"
  ) {
    const error = new Error(
      "Invalid email or password."
    );

    error.code =
      "ADMIN_INVALID_CREDENTIALS";

    throw error;
  }


  if (!admin.passwordHash) {
    console.error(
      "Admin passwordHash is missing."
    );

    const error = new Error(
      "Admin password is not configured in MongoDB."
    );

    error.code =
      "ADMIN_INVALID_CREDENTIALS";

    throw error;
  }


  const passwordCorrect =
    await bcrypt.compare(
      enteredPassword,
      admin.passwordHash
    );


  console.log(
    "Password match:",
    passwordCorrect
  );


  if (!passwordCorrect) {
    const error = new Error(
      "Invalid email or password."
    );

    error.code =
      "ADMIN_INVALID_CREDENTIALS";

    throw error;
  }


  return createToken(
    admin._id,
    admin.role
  );
}


// ==========================================
// CREATE / RESET ADMIN
// ==========================================

async function ensureAdmin() {
  const email =
    String(
      process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME || ""
    )
      .trim()
      .toLowerCase();

  const password =
    String(
      process.env.ADMIN_PASSWORD || ""
    );

  if (!email || !password) {
    console.warn("[ADMIN WARN] ADMIN_EMAIL / ADMIN_PASSWORD not configured in .env. Skipping default admin initialization.");
    return null;
  }


  const passwordHash =
    await hashPassword(password);


  let admin =
    await Admin.findOne({
      email,
    });


  // ----------------------------------------
  // CREATE
  // ----------------------------------------

  if (!admin) {
    admin =
      await Admin.create({
        username: email,
        email,
        passwordHash,
        role: "admin",
        active: true,
        status: "active",
      });

    console.log(
      "===================================="
    );

    console.log(
      "NEW ADMIN CREATED"
    );

    console.log(
      "Email:",
      email
    );

    console.log(
      "===================================="
    );

    return admin;
  }


  // ----------------------------------------
  // RESET EXISTING ADMIN PASSWORD
  // ----------------------------------------

  admin.username = email;
  admin.email = email;
  admin.passwordHash = passwordHash;
  admin.role = "admin";
  admin.active = true;
  admin.status = "active";

  await admin.save();


  console.log(
    "===================================="
  );

  console.log(
    "ADMIN PASSWORD RESET SUCCESSFULLY"
  );

  console.log(
    "Email:",
    email
  );

  console.log(
    "===================================="
  );


  return admin;
}


module.exports = {
  COOKIE_NAME,
  TOKEN_TTL_SECONDS,
  hashPassword,
  createToken,
  verifyToken,
  getCookie,
  sessionCookie,
  getActiveAdmin,
  authenticate,
  ensureAdmin,
};