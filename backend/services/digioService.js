const https = require("https");

const DEFAULT_TIMEOUT_MS = 15000;

function getConfig() {
  const baseUrl = String(process.env.DIGIO_BASE_URL || "").trim().replace(/\/$/, "");
  const clientId = String(process.env.DIGIO_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.DIGIO_CLIENT_SECRET || "").trim();

  if (!baseUrl || !clientId || !clientSecret) {
    const error = new Error("DigiO is not configured. Set DIGIO_BASE_URL, DIGIO_CLIENT_ID, and DIGIO_CLIENT_SECRET.");
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
        }

        resolve({
          statusCode: providerResponse.statusCode || 502,
          headers: providerResponse.headers,
          data,
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
    const error = new Error(`DigiO returned HTTP ${response.statusCode}.`);
    error.code = "DIGIO_PROVIDER_ERROR";
    error.statusCode = response.statusCode;
    error.providerData = response.data;
    console.error("DigiO provider error", {
      statusCode: response.statusCode,
      data: redactSecrets(response.data),
    });
    throw error;
  }
  return response;
}

function logProviderResponse(operation, response) {
  console.info(`DigiO ${operation} response`, {
    statusCode: response.statusCode,
    ...safeResponseSummary(response.data),
  });
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

function extractIdentifiers(data) {
  return {
    requestId: findValue(data, ["request_id", "requestid"]),
    kid: findValue(data, ["kid", "kyc_id", "kycid"]),
    rid: findValue(data, ["rid", "response_id", "responseid"]),
    accessToken: findValue(data, ["access_token", "accesstoken"]),
    accessLink: findValue(data, ["access_url", "accessurl", "kyc_url", "kycurl", "redirect_url", "redirecturl", "signing_url", "signingurl", "link"]),
  };
}

function extractStatus(data) {
  return findValue(data, ["status", "request_status", "kyc_status"]);
}

function safeResponseSummary(data) {
  const identifiers = extractIdentifiers(data);
  return {
    requestId: identifiers.requestId,
    kid: identifiers.kid,
    rid: identifiers.rid,
    status: extractStatus(data),
    hasAccessLink: Boolean(identifiers.accessLink),
  };
}

async function createRequest(payload) {
  return logProviderResponse("KYC request", assertSuccessful(await request("POST", "/client/kyc/v2/request/with_template", payload)));
}

async function createSigningRequest(payload) {
  const response = assertSuccessful(await request("POST", "/v2/client/document/uploadpdf", payload, undefined, getSignConfig()));
  return logProviderResponse("DigiSign request", response);
}

async function getRequestDetails(kid) {
  return assertSuccessful(await request("POST", `/client/kyc/v2/${encodeURIComponent(kid)}/response`));
}

async function downloadMedia(rid, docType, xml) {
  return assertSuccessful(await request("GET", `/client/kyc/v2/media/${encodeURIComponent(rid)}`, undefined, { doc_type: docType, xml }));
}

async function manageApproval(kid, status) {
  if (status !== "approved") {
    const error = new Error('The supplied DigiO collection documents only the "approved" manage_approval status.');
    error.code = "DIGIO_REJECTION_UNCONFIRMED";
    throw error;
  }
  return logProviderResponse("approval", assertSuccessful(await request("POST", `/client/kyc/v2/request/${encodeURIComponent(kid)}/manage_approval`, { status })));
}

async function reattempt(requestId, payload) {
  return assertSuccessful(await request("POST", `/client/kyc/v2/request/${encodeURIComponent(requestId)}/reattempt`, payload));
}

async function regenerateToken(entityId) {
  const config = getTokenConfig();
  return assertSuccessful(await request("POST", "/user/auth/generate_token", { entity_id: entityId }, undefined, config));
}

module.exports = {
  createRequest,
  createSigningRequest,
  getRequestDetails,
  downloadMedia,
  manageApproval,
  reattempt,
  regenerateToken,
  extractIdentifiers,
  extractStatus,
  safeResponseSummary,
  redactSecrets,
};