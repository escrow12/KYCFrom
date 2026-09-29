const assert = require("node:assert/strict");
const test = require("node:test");
const generateAgreementPdf = require("../utils/generateAgreementPdf");

test("generateAgreementPdf generates a valid Master Agent Agreement PDF Buffer", async () => {
  const mockRecord = {
    _id: "6aba05cc0a6102727e00b898",
    entityName: "ACME PAYMENTS PRIVATE LIMITED",
    entityType: "Company",
    registeredAddress: "123 Tech Park",
    registeredCity: "New Delhi",
    registeredState: "Delhi",
    registeredPincode: "110001",
    gstNo: "07AAAAA0000A1Z5",
    website: "https://acmepay.com",
    email: "admin@acmepay.com",
    directors: [
      { name: "John Doe", email: "john@acmepay.com", designation: "Director" },
    ],
    createdAt: new Date(),
  };

  const pdfBuffer = await generateAgreementPdf(mockRecord);
  assert.ok(Buffer.isBuffer(pdfBuffer));
  assert.ok(pdfBuffer.length > 500);
  assert.equal(pdfBuffer.subarray(0, 4).toString(), "%PDF");
});
