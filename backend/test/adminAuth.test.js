const assert = require("node:assert/strict");
const test = require("node:test");

process.env.ADMIN_AUTH_SECRET = "test-admin-auth-secret";

const Admin = require("../models/Admin");
const auth = require("../services/adminAuthService");
const requireAdmin = require("../middleware/adminAuth");

const originalFindOne = Admin.findOne;
const originalGetActiveAdmin = auth.getActiveAdmin;

async function mockAdmin(overrides = {}) {
  return {
    _id: "507f1f77bcf86cd799439011",
    username: "admin@example.com",
    email: "admin@example.com",
    passwordHash: await auth.hashPassword("CorrectPassword123!"),
    role: "admin",
    active: true,
    status: "active",
    ...overrides,
  };
}

function setAdminResult(admin) {
  const mockQuery = Promise.resolve(admin);
  mockQuery.select = () => mockQuery;
  Admin.findOne = () => mockQuery;
}

test.afterEach(() => {
  Admin.findOne = originalFindOne;
  auth.getActiveAdmin = originalGetActiveAdmin;
});

test("correct MongoDB admin credentials create a valid session token", async () => {
  const admin = await mockAdmin();
  setAdminResult(admin);
  const token = await auth.authenticate("ADMIN@example.com", "CorrectPassword123!");
  const claims = auth.verifyToken(token);
  assert.equal(claims.sub, admin._id);
  assert.equal(claims.role, "admin");
});

test("wrong password is rejected", async () => {
  setAdminResult(await mockAdmin());
  await assert.rejects(() => auth.authenticate("admin@example.com", "wrong"), { code: "ADMIN_INVALID_CREDENTIALS" });
});

test("unknown admin is rejected", async () => {
  setAdminResult(null);
  await assert.rejects(() => auth.authenticate("unknown@example.com", "CorrectPassword123!"), { code: "ADMIN_INVALID_CREDENTIALS" });
});

test("inactive admin is rejected", async () => {
  setAdminResult(await mockAdmin({ active: false, status: "inactive" }));
  await assert.rejects(() => auth.authenticate("admin@example.com", "CorrectPassword123!"), { code: "ADMIN_INVALID_CREDENTIALS" });
});

test("valid admin session reaches protected middleware", async () => {
  const admin = await mockAdmin();
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

test("client verification reads require admin auth while public submissions remain available", () => {
  const routes = require("../routes/clientverificationRoutes");
  const getRoutes = routes.stack.filter((layer) => layer.route && layer.route.methods.get);
  const postRoutes = routes.stack.filter((layer) => layer.route && layer.route.methods.post);
  const requireAdminMiddleware = require("../middleware/adminAuth");

  assert.equal(getRoutes.length, 3);
  for (const layer of getRoutes) {
    assert.equal(layer.route.stack[0].handle, requireAdminMiddleware);
  }
  assert.equal(postRoutes.length, 1);
  assert.notEqual(postRoutes[0].route.stack[0].handle, requireAdminMiddleware);
});
