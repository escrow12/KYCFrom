const express = require("express");

const auth = require("../services/adminAuthService");

const router = express.Router();


// =====================================================
// ADMIN LOGIN
// POST /api/admin/auth/login
// =====================================================

router.post("/login", async (req, res) => {
  try {
    const identifier =
      req.body &&
      (
        req.body.identifier ||
        req.body.username ||
        req.body.email
      );

    const password =
      req.body &&
      req.body.password;


    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Username/email and password are required.",
      });
    }


    const token = await auth.authenticate(
      identifier,
      password
    );


    res.setHeader(
      "Set-Cookie",
      auth.sessionCookie(token)
    );


    return res.json({
      success: true,
      data: {
        role: "admin",
        expiresIn: auth.TOKEN_TTL_SECONDS,
      },
    });

  } catch (error) {

    if (
      error.code ===
      "ADMIN_AUTH_NOT_CONFIGURED"
    ) {
      return res.status(503).json({
        success: false,
        message: error.message,
        code: error.code,
      });
    }


    if (
      error.code ===
      "ADMIN_INVALID_CREDENTIALS"
    ) {
      return res.status(401).json({
        success: false,
        message: error.message,
        code: error.code,
      });
    }


    console.error(
      "Admin login error:",
      error
    );


    return res.status(500).json({
      success: false,
      message:
        "Unable to authenticate admin.",
    });
  }
});


// =====================================================
// CHECK ADMIN SESSION
// GET /api/admin/auth/check
// =====================================================

router.get("/check", async (req, res) => {
  try {
    const authorization = String(
      req.get("authorization") || ""
    );

    const bearerToken =
      authorization.startsWith("Bearer ")
        ? authorization.slice(7).trim()
        : "";

    const sessionToken =
      bearerToken ||
      auth.getCookie(
        req,
        auth.COOKIE_NAME
      );


    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        message:
          "Admin authentication required.",
      });
    }


    const claims =
      auth.verifyToken(sessionToken);


    const admin =
      await auth.getActiveAdmin(
        claims.sub
      );


    if (
      !admin ||
      claims.role !== "admin"
    ) {
      return res.status(401).json({
        success: false,
        message:
          "Admin session is invalid.",
      });
    }


    return res.json({
      success: true,
      admin: {
        id: String(admin._id),
        email: admin.email,
        username: admin.username,
        role: admin.role,
      },
    });

  } catch (error) {
    return res.status(401).json({
      success: false,
      message:
        "Admin session is invalid or expired.",
    });
  }
});


// =====================================================
// ADMIN LOGOUT
// POST /api/admin/auth/logout
// =====================================================

router.post("/logout", (req, res) => {
  res.setHeader(
    "Set-Cookie",
    `${auth.COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict`
  );

  return res.json({
    success: true,
    message: "Logged out successfully.",
  });
});


module.exports = router;