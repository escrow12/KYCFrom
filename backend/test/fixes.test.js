const test = require("node:test");
const assert = require("node:assert/strict");
const agreementConfig = require("../config/agreementConfig");
const KycForm = require("../models/KycForm");

test("agreementConfig loads dynamic values", () => {
  assert.equal(typeof agreementConfig.companyName, "string");
  assert.equal(typeof agreementConfig.brandingTerm, "string");
  assert.ok(Array.isArray(agreementConfig.feeSchedule));
  assert.ok(agreementConfig.feeSchedule.length >= 4);
});

test("KycForm syncStatuses correctly decouples status fields", () => {
  const doc = new KycForm({
    entityName: "Test Entity",
    entityType: "Company",
    entityPan: "ABCDE1234F",
    registeredAddress: "Test Address",
    authSignatoryName: "Signatory",
    declarationAccepted: true,
    applicationStatus: "approved",
    directors: [
      { name: "Dir 1", email: "dir1@example.com", status: "completed" },
      { name: "Dir 2", email: "dir2@example.com", status: "completed" },
    ],
  });

  doc.syncStatuses();
  assert.equal(doc.applicationStatus, "approved");
  assert.equal(doc.kycStatus, "completed");
  assert.equal(doc.agreementStatus, "not_started");
  assert.equal(doc.status, "director_kyc_completed");

  doc.agreement = { status: "signed", signers: [] };
  doc.syncStatuses();
  assert.equal(doc.agreementStatus, "signed");
  assert.equal(doc.status, "completed");
});

test("Dynamic signature coordinate calculation algorithm handles 4+ signers", () => {
  const signers = [
    { identifier: "s1@example.com" },
    { identifier: "s2@example.com" },
    { identifier: "s3@example.com" },
    { identifier: "s4@example.com" },
  ];

  const signCoordinates = {};
  const boxWidth = 112;
  const boxHeight = 35;
  const marginX = 45;
  const spacingX = 20;
  const spacingY = 15;
  const startY = 60;
  const boxesPerRow = 3;

  signers.forEach((s, idx) => {
    const row = Math.floor(idx / boxesPerRow);
    const col = idx % boxesPerRow;
    const llx = marginX + col * (boxWidth + spacingX);
    const lly = startY + (row % 3) * (boxHeight + spacingY);
    const urx = llx + boxWidth;
    const ury = lly + boxHeight;
    const pageNo = String(1 + Math.floor(row / 3));

    if (!signCoordinates[s.identifier]) {
      signCoordinates[s.identifier] = {};
    }
    if (!signCoordinates[s.identifier][pageNo]) {
      signCoordinates[s.identifier][pageNo] = [];
    }
    signCoordinates[s.identifier][pageNo].push({ llx, lly, urx, ury });
  });

  assert.equal(Object.keys(signCoordinates).length, 4);
  assert.equal(signCoordinates["s1@example.com"]["1"][0].llx, 45);
  assert.equal(signCoordinates["s4@example.com"]["1"][0].llx, 45); // Row 2, Col 0
  assert.equal(signCoordinates["s4@example.com"]["1"][0].lly, 60 + (35 + 15)); // Row 2 Y offset
});
