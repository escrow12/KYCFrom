function requireAdmin(req, res, next) {
  const configuredKey = String(process.env.ADMIN_API_KEY || "").trim();
  const suppliedKey = String(req.get("x-admin-api-key") || "").trim();

  if (!configuredKey) {
    return res.status(503).json({ success: false, message: "Admin authorization is not configured." });
  }

  if (!suppliedKey || suppliedKey !== configuredKey) {
    return res.status(401).json({ success: false, message: "Admin authorization required." });
  }

  req.adminId = String(req.get("x-admin-id") || "admin").trim() || "admin";
  return next();
}

module.exports = requireAdmin;