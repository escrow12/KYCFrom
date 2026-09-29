require("dotenv").config();
const https = require("https");

const url = new URL("https://ext.digio.in/client/kyc/v2/KID260929130117386JN5FG3AM95VYZE/response");
const auth = "Basic " + Buffer.from(`${process.env.DIGIO_CLIENT_ID}:${process.env.DIGIO_CLIENT_SECRET}`).toString("base64");

const req = https.request({
  method: "POST",
  hostname: url.hostname,
  port: 443,
  path: url.pathname,
  headers: {
    Authorization: auth,
    "Content-Type": "application/json"
  }
}, (res) => {
  const chunks = [];
  res.on("data", c => chunks.push(c));
  res.on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf8");
    console.log("Status:", res.statusCode);
    console.log("Headers:", res.headers);
    console.log("Full Body length:", raw.length);
    console.log("Body content:\n", raw);
  });
});
req.write("{}");
req.end();
