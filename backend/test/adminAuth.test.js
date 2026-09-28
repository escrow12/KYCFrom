const assert = require("node:assert/strict");
const test = require("node:test");

process.env.ADMIN_AUTH_SECRET = "test-admin-auth-secret";

const Admin = require("../models/Admin");
const auth = require("../services/adminAuthService");
const requireAdmin = require("../middleware/adminAuth");

const originalFindOne = Admin.findOne;
const originalGetActiveAdmin = auth.getActiveAdmin;

function mockAdmin(overrides = {}) {
  return {
    _id: "507f1f77bcf86cd799439011",
    username: "admin@example.com",
    email: "admin@example.com",
    passwordHash: auth.hashPassword("CorrectPassword123!"),
    role: "admin",
    active: true,
    status: "active",
    ...overrides,
  };
}

function setAdminResult(admin) {
  Admin.findOne = () => ({ select: async () => admin });
}

test.afterEach(() => {
  Admin.findOne = originalFindOne;
  auth.getActiveAdmin = originalGetActiveAdmin;
});

test("correct MongoDB admin credentials create a valid session token", async () => {
  const admin = mockAdmin();
  setAdminResult(admin);
  const previousUsername = process.env.ADMIN_USERNAME;
  const previousPassword = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_USERNAME = "legacy-admin";
  process.env.ADMIN_PASSWORD = "legacy-password";
  try {
    const token = await auth.authenticate("ADMIN@example.com", "CorrectPassword123!");
    const claims = auth.verifyToken(token);
    assert.equal(claims.sub, admin._id);
    assert.equal(claims.role, "admin");
    assert.equal(claims.authMode, undefined);
  } finally {
    if (previousUsername === undefined) delete process.env.ADMIN_USERNAME;
    else process.env.ADMIN_USERNAME = previousUsername;
    if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousPassword;
  }
});

test("wrong password is rejected", async () => {
  setAdminResult(mockAdmin());
  await assert.rejects(() => auth.authenticate("admin@example.com", "wrong"), { code: "ADMIN_INVALID_CREDENTIALS" });
});

test("unknown admin is rejected", async () => {
  setAdminResult(null);
  await assert.rejects(() => auth.authenticate("unknown@example.com", "CorrectPassword123!"), { code: "ADMIN_INVALID_CREDENTIALS" });
});

test("inactive admin is rejected", async () => {
  setAdminResult(mockAdmin({ active: false, status: "inactive" }));
  await assert.rejects(() => auth.authenticate("admin@example.com", "CorrectPassword123!"), { code: "ADMIN_INVALID_CREDENTIALS" });
});

test("valid admin session reaches protected middleware", async () => {
  const admin = mockAdmin();
  const token = auth.createToken ? auth.createToken(admin._id, admin.role, process.env.ADMIN_AUTH_SECRET) : await (async () => {
    setAdminResult(admin);
    return auth.authenticate(admin.email, "CorrectPassword123!");
  })();
  auth.getActiveAdmin = async () => admin;
  let nextCalled = false;
  const req = { get: (name) => name === "authorization" ? `Bearer ${token}` : "", headers: {} };
  const res = { status: () => ({ json: () => {} }), json: () => {} };
  await requireAdmin(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(req.adminId, admin._id);
});

test("missing or invalid admin session is rejected", async () => {
  let responseStatus;
  const res = { status: (status) => { responseStatus = status; return { json: () => {} }; } };
  await requireAdmin({ get: () => "", headers: {} }, res, () => {});
  assert.equal(responseStatus, 401);

  responseStatus = undefined;
  await requireAdmin({ get: () => "Bearer invalid", headers: {} }, res, () => {});
  assert.equal(responseStatus, 401);
});

test("existing KYC and DigiO route modules still load", () => {
  assert.ok(require("../routes/kycRoutes"));
  assert.ok(require("../routes/digioRoutes"));
});
