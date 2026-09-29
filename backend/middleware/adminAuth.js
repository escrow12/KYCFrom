const auth = require("../services/adminAuthService");

async function requireAdmin(req, res, next) {
  try {
    const authorization = String(
      req.get("authorization") || ""
    );

    const bearerToken = authorization.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : "";

    const sessionToken =
      bearerToken ||
      auth.getCookie(req, auth.COOKIE_NAME);


    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        message: "Admin authentication required.",
      });
    }


    const claims = auth.verifyToken(sessionToken);

    const admin = await auth.getActiveAdmin(
      claims.sub
    );


    if (
      claims.role === "admin" &&
      admin &&
      admin.role === "admin"
    ) {
      req.adminId = String(
        admin._id || claims.sub
      );

      req.adminRole = admin.role;

      req.admin = admin;

      return next();
    }


    return res.status(401).json({
      success: false,
      message:
        "Admin account is inactive or unavailable.",
    });

  } catch (error) {
    return res.status(401).json({
      success: false,
      message:
        "Admin session is invalid or expired.",
    });
  }
}

module.exports = requireAdmin;