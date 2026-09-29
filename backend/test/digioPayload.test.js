const assert = require("node:assert/strict");
const test = require("node:test");
const digioService = require("../services/digioService");

test("generate15CharReferenceId generates an exact 15-character alphanumeric reference ID", () => {
  const refId = digioService.generate15CharReferenceId();
  assert.equal(typeof refId, "string");
  assert.equal(refId.length, 15);
  assert.match(refId, /^[A-Z0-9]{15}$/);
});

test("digioService sanitizes reference_id characters before calling provider", async () => {
  const payload = {
    customer_identifier: "user@example.com",
    customer_name: "Test Entity",
    reference_id: "6aba05cc0a6102727e00b898:application:a1b2c3d4",
  };

  try {
    await digioService.createRequest(payload);
  } catch (err) {
    assert.equal(payload.reference_id, "6aba05cc0a6102727e00b898-application-a1b2c3d4");
  }
});

test("extractIdentifiers correctly parses actual DigiO with_template response", () => {
  const rawResponse = {
    id: "KID260929124452422MR8NM444ESPT87",
    created_at: "2026-09-29 12:44:52",
    status: "requested",
    customer_identifier: "director@example.com",
    reference_id: "U9XL5WMGX4TZ95W",
    transaction_id: "U9XL5WMGX4TZ95W",
    customer_name: "Director Name",
    access_token: {
      entity_id: "KID260929124452422MR8NM444ESPT87",
      id: "GWT2609291244524384EZJ281YUUWJUS",
      valid_till: "2026-09-30 12:44:52",
    },
  };

  const parsed = digioService.extractIdentifiers(rawResponse);
  assert.equal(parsed.kid, "KID260929124452422MR8NM444ESPT87");
  assert.equal(parsed.requestId, "KID260929124452422MR8NM444ESPT87");
  assert.equal(parsed.referenceId, "U9XL5WMGX4TZ95W");
  assert.equal(parsed.accessToken, "GWT2609291244524384EZJ281YUUWJUS");
  assert.ok(parsed.accessLink.includes("KID260929124452422MR8NM444ESPT87"));
  assert.equal(parsed.status, "requested");
});

test("extractIdentifiers correctly parses actual DigiO details response with RID and actionIds", () => {
  const rawResponse = {
    id: "KID260929124452422MR8NM444ESPT87",
    status: "requested",
    customer_identifier: "director@example.com",
    reference_id: "U9XL5WMGX4TZ95W",
    actions: [
      {
        id: "KIA260929124452423FYW48TZFVWA58I",
        action_ref: "digilocker-1",
        type: "digilocker",
        status: "requested",
        execution_request_id: "RID2609291244524234EAUQ1AMIIO3DS",
      },
      {
        id: "KIA2609291244524231CAMLD6Z1VWVDG",
        action_ref: "video-1",
        type: "video",
        status: "requested",
      },
    ],
  };

  const parsed = digioService.extractIdentifiers(rawResponse);
  assert.equal(parsed.kid, "KID260929124452422MR8NM444ESPT87");
  assert.equal(parsed.rid, "RID2609291244524234EAUQ1AMIIO3DS");
  assert.deepEqual(parsed.actionIds, [
    "KIA260929124452423FYW48TZFVWA58I",
    "KIA2609291244524231CAMLD6Z1VWVDG",
  ]);
});

test("manageApproval and getRequestDetails reject missing KID with required error message", async () => {
  await assert.rejects(
    () => digioService.manageApproval("", "approved"),
    /Director DigiO KID is missing\. DigiO KYC request was not successfully registered\./
  );

  await assert.rejects(
    () => digioService.manageApproval(null, "approved"),
    /Director DigiO KID is missing\. DigiO KYC request was not successfully registered\./
  );

  await assert.rejects(
    () => digioService.getRequestDetails(undefined),
    /Director DigiO KID is missing\. DigiO KYC request was not successfully registered\./
  );
});

