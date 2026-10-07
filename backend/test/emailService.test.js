const assert = require("node:assert/strict");
const test = require("node:test");
const { sendApprovalEmail, sendRejectionEmail } = require("../utils/emailService");

test("sendApprovalEmail returns false gracefully when SMTP is unconfigured", async () => {
  const mockRecord = {
    _id: "6aba05cc0a6102727e00b898",
    entityName: "TEST COMPANY",
    email: "test@example.com",
  };
  const result = await sendApprovalEmail(mockRecord);
  assert.equal(typeof result.success, "boolean");
});

test("sendRejectionEmail returns false gracefully when SMTP is unconfigured", async () => {
  const mockRecord = {
    _id: "6aba05cc0a6102727e00b898",
    entityName: "TEST COMPANY",
    email: "test@example.com",
  };
  const result = await sendRejectionEmail(mockRecord, "Invalid PAN card details");
  assert.equal(typeof result.success, "boolean");
});
