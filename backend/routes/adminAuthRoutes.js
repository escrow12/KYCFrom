const express = require("express");
const auth = require("../services/adminAuthService");

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const identifier = req.body && (req.body.identifier || req.body.username || req.body.email);
    const password = req.body && req.body.password;
    if (!identifier || !password) return res.status(400).json({ success: false, message: "Username/email and password are required." });
    const token = await auth.authenticate(identifier, password);
    res.setHeader("Set-Cookie", auth.sessionCookie(token));
    return res.json({ success: true, data: { role: "admin", expiresIn: auth.TOKEN_TTL_SECONDS } });
  } catch (error) {
    if (error.code === "ADMIN_AUTH_NOT_CONFIGURED") return res.status(503).json({ success: false, message: error.message, code: error.code });
    if (error.code === "ADMIN_INVALID_CREDENTIALS") return res.status(401).json({ success: false, message: error.message, code: error.code });
    console.error("Admin login error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to authenticate admin." });
  }
});

router.post("/logout", (req, res) => {
  res.setHeader("Set-Cookie", "admin_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict");
  res.json({ success: true });
});

module.exports = router;