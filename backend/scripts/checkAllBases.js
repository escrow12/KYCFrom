require("dotenv").config();
const https = require("https");

const bases = [
  "https://api.digio.in",
  "https://ext.digio.in",
  "https://ext.digio.in:444"
];

const auths = [
  { name: "DIGIO", creds: Buffer.from(`${process.env.DIGIO_CLIENT_ID}:${process.env.DIGIO_CLIENT_SECRET}`).toString("base64") },
  { name: "DIGISIGN", creds: Buffer.from(`${process.env.DIGISIGN_CLIENT_ID}:${process.env.DIGISIGN_CLIENT_SECRET}`).toString("base64") }
];

const kid = "KID260929130117386JN5FG3AM95VYZE";

function check(urlStr, auth) {
  return new Promise((resolve) => {
    const url = new URL(urlStr);
    const req = https.request({
      method: "POST",
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      headers: {
        Authorization: "Basic " + auth,
        "Content-Type": "application/json"
      }
    }, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve({
          url: urlStr,
          status: res.statusCode,
          contentType: res.headers["content-type"],
          isHtml: raw.trim().startsWith("<"),
          snippet: raw.slice(0, 200)
        });
      });
    });
    req.on("error", err => resolve({ url: urlStr, error: err.message }));
    req.write("{}");
    req.end();
  });
}

async function run() {
  for (const base of bases) {
    for (const auth of auths) {
      console.log(`Checking ${base} with ${auth.name}...`);
      const res = await check(`${base}/client/kyc/v2/${kid}/response`, auth.creds);
      console.log(res);
    }
  }
}

run();
