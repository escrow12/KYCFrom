require("dotenv").config();
const https = require("https");

const baseUrl = process.env.BASE_URL || "https://api.digio.in";
const clientId = process.env.DIGIO_CLIENT_ID;
const clientSecret = process.env.DIGIO_CLIENT_SECRET;
const kid = "KID260929130117386JN5FG3AM95VYZE"; // from our previous test
const auth = "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

function testPostmanStyle(headers, body = {}) {
  return new Promise((resolve) => {
    const url = new URL(`${baseUrl}/client/kyc/v2/${kid}/response`);
    const payload = JSON.stringify(body);
    const req = https.request({
      method: "POST",
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      headers: {
        Authorization: auth,
        ...headers,
      }
    }, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve({
          statusCode: res.statusCode,
          contentType: res.headers["content-type"],
          contentLength: res.headers["content-length"],
          isHtml: raw.trim().startsWith("<"),
          snippet: raw.slice(0, 300)
        });
      });
    });
    req.on("error", err => resolve({ error: err.message }));
    req.write(payload);
    req.end();
  });
}

async function run() {
  console.log("--- 1. Without Accept header ---");
  const r1 = await testPostmanStyle({ "Content-Type": "application/json" });
  console.log(r1);

  console.log("--- 2. With Accept: text/html ---");
  const r2 = await testPostmanStyle({ "Content-Type": "application/json", "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" });
  console.log(r2);

  console.log("--- 3. With Accept: application/json ---");
  const r3 = await testPostmanStyle({ "Content-Type": "application/json", "Accept": "application/json" });
  console.log(r3);

  console.log("--- 4. Empty headers (like raw Postman without Content-Type or Accept) ---");
  const r4 = await testPostmanStyle({});
  console.log(r4);
}

run();
