const auth = require("../services/adminAuthService");

async function requireAdmin(req, res, next) {
  const authorization = String(req.get("authorization") || "");
  const bearerToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const sessionToken = bearerToken || auth.getCookie(req, "admin_session");
  if (sessionToken) {
    try {
      const claims = auth.verifyToken(sessionToken);
      const admin = await auth.getActiveAdmin(claims.sub);
      if (claims.role === "admin" && admin && admin.role === "admin") {
        req.adminId = String(admin._id || claims.sub);
        req.adminRole = admin.role;
        req.admin = admin;
        return next();
      }
      return res.status(401).json({ success: false, message: "Admin account is inactive or unavailable." });
    } catch {
      return res.status(401).json({ success: false, message: "Admin session is invalid or expired." });
    }
  }
  return res.status(401).json({ success: false, message: "Admin authentication required." });
}

module.exports = requireAdmin;