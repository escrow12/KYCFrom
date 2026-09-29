const https = require("https");

const DEFAULT_TIMEOUT_MS = 15000;

function getConfig() {
  const baseUrl = String(process.env.BASE_URL || "").trim().replace(/\/$/, "");
  const clientId = String(process.env.DIGIO_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.DIGIO_CLIENT_SECRET || "").trim();

  if (!baseUrl || !clientId || !clientSecret) {
    const error = new Error("DigiO is not configured. Set BASE_URL, DIGIO_CLIENT_ID, and DIGIO_CLIENT_SECRET.");
    error.code = "DIGIO_NOT_CONFIGURED";
    throw error;
  }

  return { baseUrl, clientId, clientSecret };
}

function getSignConfig() {
  const baseUrl = String(process.env.DIGISIGN_BASE_URL || "").trim().replace(/\/$/, "");
  const clientId = String(process.env.DIGISIGN_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.DIGISIGN_CLIENT_SECRET || "").trim();

  if (!baseUrl || !clientId || !clientSecret) {
    const error = new Error("DigiSign is not configured. Set DIGISIGN_BASE_URL, DIGISIGN_CLIENT_ID, and DIGISIGN_CLIENT_SECRET.");
    error.code = "DIGISIGN_NOT_CONFIGURED";
    throw error;
  }

  return { baseUrl, clientId, clientSecret };
}

function getTokenConfig() {
  const config = getConfig();
  return {
    ...config,
    clientId: String(process.env.DIGIO_TOKEN_CLIENT_ID || config.clientId).trim(),
    clientSecret: String(process.env.DIGIO_TOKEN_CLIENT_SECRET || config.clientSecret).trim(),
  };
}

function basicAuth(clientId, clientSecret) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

function request(method, path, body, query, authConfig = getConfig()) {
  const url = new URL(`${authConfig.baseUrl}${path}`);
  Object.entries(query || {}).forEach(([key, value]) => url.searchParams.set(key, String(value)));

  console.log("[DIGIO REQUEST]", {
    method,
    path,
    url: `${authConfig.baseUrl}${path}`,
    payload: redactSecrets(body),
  });

  return new Promise((resolve, reject) => {
    const requestBody = body === undefined ? null : JSON.stringify(body);
    const requestOptions = {
      method,
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      headers: {
        Authorization: basicAuth(authConfig.clientId, authConfig.clientSecret),
        "Content-Type": "application/json",
        ...(requestBody ? { "Content-Length": Buffer.byteLength(requestBody) } : {}),
      },
      timeout: Number(process.env.DIGIO_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    };

    const providerRequest = https.request(requestOptions, (providerResponse) => {
      const chunks = [];
      providerResponse.on("data", (chunk) => chunks.push(chunk));
      providerResponse.on("end", () => {
        const responseBuffer = Buffer.concat(chunks);
        const contentType = String(providerResponse.headers["content-type"] || "");
        let data = responseBuffer;
        if (contentType.includes("application/json")) {
          try {
            data = JSON.parse(responseBuffer.toString("utf8"));
          } catch {
            data = responseBuffer.toString("utf8");
          }
        } else if (contentType.includes("application/pdf") || responseBuffer.subarray(0, 4).toString() === "%PDF") {
          data = responseBuffer;
        } else {
          const text = responseBuffer.toString("utf8");
          if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
            try {
              data = JSON.parse(text);
            } catch {
              data = text;
            }
          } else if (contentType.includes("text/") || text.trim().startsWith("<")) {
            data = text;
          } else {
            data = responseBuffer;
          }
        }

        const isHtml = typeof data === "string" && (data.trim().startsWith("<") || contentType.includes("text/html"));
        if (isHtml) {
          console.log("[DIGIO RESPONSE]", {
            statusCode: providerResponse.statusCode || 200,
            contentType: contentType || "text/html",
            bodyType: "html",
            snippet: typeof data === "string" ? data.trim().slice(0, 150) : "",
          });
        } else if (data && typeof data === "object") {
          console.log("[DIGIO RESPONSE]", {
            statusCode: providerResponse.statusCode || 200,
            contentType: contentType || "application/json",
            keys: Object.keys(data),
            data: redactSecrets(data),
          });
        } else {
          console.log("[DIGIO RESPONSE]", {
            statusCode: providerResponse.statusCode || 200,
            contentType,
            bodyType: typeof data,
          });
        }

        resolve({
          statusCode: providerResponse.statusCode || 502,
          headers: providerResponse.headers,
          data,
          isHtml,
        });
      });
    });

    providerRequest.on("timeout", () => {
      providerRequest.destroy(new Error("DigiO request timed out."));
    });
    providerRequest.on("error", (error) => {
      const networkError = new Error(`DigiO network request failed: ${error.message}`);
      networkError.code = "DIGIO_NETWORK_ERROR";
      reject(networkError);
    });

    if (requestBody) providerRequest.write(requestBody);
    providerRequest.end();
  });
}

function assertSuccessful(response) {
  if (response.statusCode < 200 || response.statusCode >= 300) {
    let providerMsg = null;
    let providerCode = null;
    let providerDetails = null;

    if (response.data && typeof response.data === "object") {
      providerMsg = response.data.message || response.data.error || response.data.details;
      providerCode = response.data.code || response.data.error_code;
      providerDetails = response.data.details;
    } else if (typeof response.data === "string" && !response.data.trim().startsWith("<")) {
      providerMsg = response.data.trim();
    }

    const error = new Error(`DigiO KYC request failed: ${providerMsg || `HTTP ${response.statusCode}`}`);
    error.code = "DIGIO_PROVIDER_ERROR";
    error.statusCode = response.statusCode;
    error.providerCode = providerCode;
    error.providerDetails = providerDetails;
    error.providerData = typeof response.data === "object" ? response.data : { message: providerMsg };
    error.providerMessage = providerMsg;
    console.error("DigiO provider error", {
      statusCode: response.statusCode,
      code: providerCode,
      message: providerMsg,
      details: providerDetails,
    });
    throw error;
  }
  return response;
}

function logProviderResponse(operation, response) {
  return response;
}


function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !/(token|secret|password|authorization|client.?id)/i.test(key))
      .map(([key, entry]) => [key, redactSecrets(entry)])
  );
}

function findValue(value, names) {
  if (!value || typeof value !== "object") return undefined;
  for (const [key, entry] of Object.entries(value)) {
    if (names.includes(key.toLowerCase()) && (typeof entry === "string" || typeof entry === "number")) {
      return String(entry);
    }
    const nested = findValue(entry, names);
    if (nested) return nested;
  }
  return undefined;
}

function extractIdentifiers(data, customBaseUrl) {
  if (!data || typeof data !== "object") {
    return {
      kid: undefined,
      requestId: undefined,
      rid: undefined,
      actionIds: [],
      accessToken: undefined,
      accessLink: undefined,
      referenceId: undefined,
      status: undefined,
    };
  }

  // Handle nested containers if present (e.g. data.data or data.response)
  const target = (data.data && typeof data.data === "object" && (data.data.id || data.data.kid || data.data.request_id))
    ? data.data
    : (data.response && typeof data.response === "object" && (data.response.id || data.response.kid || data.response.entity_id))
    ? data.response
    : data;

  // 1. KID Extraction:
  // - Top priority: target.kid, target.kyc_id, target.kycid
  // - Next: target.id if it starts with "KID" or "DID" or if it is a string ID
  // - Next: target.access_token.entity_id (if starts with "KID")
  // - Next: recursive find for "kid", "kyc_id"
  let kid = undefined;
  if (typeof target.kid === "string" && target.kid.trim()) {
    kid = target.kid.trim();
  } else if (typeof target.kyc_id === "string" && target.kyc_id.trim()) {
    kid = target.kyc_id.trim();
  } else if (typeof target.kycid === "string" && target.kycid.trim()) {
    kid = target.kycid.trim();
  } else if (typeof target.id === "string" && target.id.trim().startsWith("KID")) {
    kid = target.id.trim();
  } else if (target.access_token && typeof target.access_token === "object" && typeof target.access_token.entity_id === "string" && target.access_token.entity_id.trim().startsWith("KID")) {
    kid = target.access_token.entity_id.trim();
  } else if (typeof target.id === "string" && target.id.trim()) {
    kid = target.id.trim();
  } else {
    kid = findValue(target, ["kid", "kyc_id", "kycid"]);
  }

  // 2. Request ID Extraction:
  let requestId = undefined;
  if (typeof target.request_id === "string" && target.request_id.trim()) {
    requestId = target.request_id.trim();
  } else if (typeof target.requestId === "string" && target.requestId.trim()) {
    requestId = target.requestId.trim();
  } else if (typeof target.id === "string" && target.id.trim()) {
    requestId = target.id.trim();
  } else if (kid) {
    requestId = kid;
  } else {
    requestId = findValue(target, ["request_id", "requestid"]);
  }

  // 3. RID (execution_request_id) Extraction:
  let rid = undefined;
  if (typeof target.rid === "string" && target.rid.trim()) {
    rid = target.rid.trim();
  } else if (typeof target.execution_request_id === "string" && target.execution_request_id.trim()) {
    rid = target.execution_request_id.trim();
  } else if (Array.isArray(target.actions)) {
    for (const action of target.actions) {
      if (typeof action.execution_request_id === "string" && action.execution_request_id.trim().startsWith("RID")) {
        rid = action.execution_request_id.trim();
        break;
      }
      if (typeof action.rid === "string" && action.rid.trim()) {
        rid = action.rid.trim();
        break;
      }
    }
  }
  if (!rid) {
    rid = findValue(target, ["execution_request_id", "rid", "response_id", "responseid"]);
  }

  // 4. Action IDs:
  const actionIds = [];
  if (Array.isArray(target.actions)) {
    for (const action of target.actions) {
      if (typeof action.id === "string" && action.id.trim()) {
        actionIds.push(action.id.trim());
      }
    }
  }

  // 5. Reference ID:
  let referenceId = undefined;
  if (typeof target.reference_id === "string" && target.reference_id.trim()) {
    referenceId = target.reference_id.trim();
  } else if (typeof target.transaction_id === "string" && target.transaction_id.trim()) {
    referenceId = target.transaction_id.trim();
  } else {
    referenceId = findValue(target, ["reference_id", "referenceid", "transaction_id"]);
  }

  // 6. Access Token & Token ID:
  let accessToken = undefined;
  let tokenId = undefined;
  if (target.access_token) {
    if (typeof target.access_token === "string" && target.access_token.trim()) {
      accessToken = target.access_token.trim();
      tokenId = accessToken;
    } else if (typeof target.access_token === "object") {
      tokenId = target.access_token.id || target.access_token.token_id;
      accessToken = tokenId || JSON.stringify(target.access_token);
    }
  }

  // 7. Access Link:
  let accessLink = undefined;
  const directLink = target.access_url || target.accessurl || target.kyc_url || target.kycurl || target.redirect_url || target.redirecturl || target.signing_url || target.signingurl || target.link;
  if (typeof directLink === "string" && directLink.trim()) {
    accessLink = directLink.trim();
  } else if (kid) {
    const configuredBase = customBaseUrl || process.env.BASE_URL || "";
    const gatewayHost = configuredBase.includes("ext.digio.in") ? "https://ext.digio.in" : "https://app.digio.in";
    const tokenPart = tokenId || (target.customer_identifier ? encodeURIComponent(target.customer_identifier) : "");
    accessLink = tokenPart ? `${gatewayHost}/#/gateway/login/${kid}/${tokenPart}` : `${gatewayHost}/#/gateway/login/${kid}`;
  }

  // 8. Status:
  const status = extractStatus(target);

  const result = {
    kid,
    requestId,
    rid,
    actionIds,
    accessToken,
    accessLink,
    referenceId,
    status,
  };

  console.log("[DIGIO PARSED IDS]", {
    kid: result.kid,
    requestId: result.requestId,
    rid: result.rid,
    accessLink: result.accessLink,
    status: result.status,
    actionCount: result.actionIds?.length || 0,
  });

  return result;
}


function extractStatus(data) {
  if (!data || typeof data !== "object") return undefined;
  const raw = data.status || data.request_status || data.kyc_status || data.agreement_status;
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim().toLowerCase();
  }
  const found = findValue(data, ["status", "request_status", "kyc_status", "agreement_status"]);
  return typeof found === "string" ? found.trim().toLowerCase() : undefined;
}

function safeResponseSummary(data) {
  const identifiers = extractIdentifiers(data);
  return {
    requestId: identifiers.requestId,
    kid: identifiers.kid,
    rid: identifiers.rid,
    status: identifiers.status,
    hasAccessLink: Boolean(identifiers.accessLink),
    actionCount: (identifiers.actionIds || []).length,
  };
}

const crypto = require("crypto");

function generate15CharReferenceId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.randomBytes(15);
  let result = "";
  for (let i = 0; i < 15; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

async function createRequest(payload) {
  if (!payload || typeof payload !== "object") {
    const error = new Error("DigiO request payload must be an object.");
    error.code = "DIGIO_INVALID_REQUEST";
    throw error;
  }

  if (!payload.reference_id || String(payload.reference_id).trim().length === 0) {
    payload.reference_id = generate15CharReferenceId();
  } else {
    payload.reference_id = String(payload.reference_id).replace(/[^a-zA-Z0-9_-]/g, "-");
  }

  payload.template_name = String(payload.template_name || process.env.DIGIO_TEMPLATE_NAME || "KYC").trim();
  if (!payload.template_name) {
    payload.template_name = "KYC";
  }

  payload.customer_identifier = String(payload.customer_identifier || "").trim().toLowerCase();
  if (!payload.customer_identifier) {
    const error = new Error("Customer Email / Phone (customer_identifier) cannot be empty for DigiO request.");
    error.code = "DIGIO_INVALID_REQUEST";
    throw error;
  }

  payload.customer_name = String(payload.customer_name || "").trim();
  if (!payload.customer_name) {
    const error = new Error("Customer / Entity Name (customer_name) cannot be empty for DigiO request.");
    error.code = "DIGIO_INVALID_REQUEST";
    throw error;
  }

  console.info("Sending DigiO KYC request payload:", {
    customer_identifier: payload.customer_identifier,
    customer_name: payload.customer_name,
    reference_id: payload.reference_id,
    template_name: payload.template_name,
  });

  return logProviderResponse("KYC request", assertSuccessful(await request("POST", "/client/kyc/v2/request/with_template", payload)));
}

async function createSigningRequest(payload) {
  const response = assertSuccessful(await request("POST", "/v2/client/document/uploadpdf", payload, undefined, getSignConfig()));
  return logProviderResponse("DigiSign request", response);
}

async function getDocumentDetails(documentId) {
  return assertSuccessful(await request("GET", `/v2/client/document/${encodeURIComponent(documentId)}`, undefined, undefined, getSignConfig()));
}

async function downloadDocument(documentId) {
  return assertSuccessful(await request("GET", `/v2/client/document/download`, undefined, { document_id: documentId }, getSignConfig()));
}

async function cancelDocument(documentId) {
  return assertSuccessful(await request("POST", `/v2/client/document/${encodeURIComponent(documentId)}/cancel`, {}, undefined, getSignConfig()));
}

async function getRequestDetails(kid) {
  if (!kid || typeof kid !== "string" || !kid.trim()) {
    const error = new Error("Director DigiO KID is missing. DigiO KYC request was not successfully registered.");
    error.code = "DIGIO_MISSING_KID";
    throw error;
  }
  const cleanKid = kid.trim();
  try {
    // DigiO documentation notes POST for /client/kyc/v2/{KID}/response
    return assertSuccessful(await request("POST", `/client/kyc/v2/${encodeURIComponent(cleanKid)}/response`, {}));
  } catch (err) {
    if (err.statusCode === 405) {
      return assertSuccessful(await request("GET", `/client/kyc/v2/${encodeURIComponent(cleanKid)}/response`));
    }
    throw err;
  }
}

async function downloadMedia(rid, docType = "AADHAAR", xml = true) {
  if (!rid || typeof rid !== "string" || !rid.trim()) {
    const error = new Error("DigiO RID is required to download media.");
    error.code = "DIGIO_MISSING_RID";
    throw error;
  }
  return assertSuccessful(await request("GET", `/client/kyc/v2/media/${encodeURIComponent(rid.trim())}`, undefined, { doc_type: docType, xml: String(xml) }));
}

async function manageApproval(kid, status) {
  if (!kid || typeof kid !== "string" || !kid.trim()) {
    const error = new Error("Director DigiO KID is missing. DigiO KYC request was not successfully registered.");
    error.code = "DIGIO_MISSING_KID";
    throw error;
  }
  if (status !== "approved") {
    const error = new Error('The supplied DigiO collection documents only the "approved" manage_approval status.');
    error.code = "DIGIO_REJECTION_UNCONFIRMED";
    throw error;
  }
  return logProviderResponse("approval", assertSuccessful(await request("POST", `/client/kyc/v2/request/${encodeURIComponent(kid.trim())}/manage_approval`, { status })));
}

async function reattempt(requestId, payload) {
  if (!requestId || typeof requestId !== "string" || !requestId.trim()) {
    const error = new Error("DigiO request ID is required for reattempt.");
    error.code = "DIGIO_MISSING_REQUEST_ID";
    throw error;
  }
  if (!payload || !Array.isArray(payload.action_ids) || payload.action_ids.length === 0) {
    const error = new Error("action_ids array is required for reattempt.");
    error.code = "DIGIO_INVALID_REQUEST";
    throw error;
  }
  return assertSuccessful(await request("POST", `/client/kyc/v2/request/${encodeURIComponent(requestId.trim())}/reattempt`, payload));
}

async function regenerateToken(entityId) {
  if (!entityId || typeof entityId !== "string" || !entityId.trim()) {
    const error = new Error("DigiO entity_id (KID / Request ID) is required to generate token.");
    error.code = "DIGIO_MISSING_ENTITY_ID";
    throw error;
  }
  const config = getTokenConfig();
  return assertSuccessful(await request("POST", "/user/auth/generate_token", { entity_id: entityId.trim() }, undefined, config));
}

module.exports = {
  createRequest,
  createSigningRequest,
  getDocumentDetails,
  downloadDocument,
  cancelDocument,
  getRequestDetails,
  downloadMedia,
  manageApproval,
  reattempt,
  regenerateToken,
  extractIdentifiers,
  extractStatus,
  safeResponseSummary,
  redactSecrets,
  generate15CharReferenceId,
};