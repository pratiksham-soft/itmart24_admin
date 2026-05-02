import { Router } from "express";
import {
  changeAdminPassword,
  getAdminProfile,
  logoutAdmin,
  signInAdmin,
  signUpAdmin,
} from "../services/adminAuth.service";

const router = Router();

const getBearerToken = (authorizationHeader: string | undefined) => {
  const authorization = String(authorizationHeader ?? "");
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
};

router.post("/signup", async (req, res) => {
  try {
    const result = await signUpAdmin({
      name: typeof req.body?.name === "string" ? req.body.name : "",
      email: typeof req.body?.email === "string" ? req.body.email : "",
      password: typeof req.body?.password === "string" ? req.body.password : "",
    });

    res.status(201).json(result);
  } catch (error: any) {
    const message = error.message || "Unable to create the admin account.";
    const status =
      /required|valid email|already exists|characters with letters and numbers/i.test(
        message
      )
        ? 400
        : 500;

    console.error("Admin signup error:", message);
    res.status(status).json({
      success: false,
      message,
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const result = await signInAdmin({
      email: typeof req.body?.email === "string" ? req.body.email : "",
      password: typeof req.body?.password === "string" ? req.body.password : "",
      rememberMe: Boolean(req.body?.rememberMe),
    });

    res.json(result);
  } catch (error: any) {
    const message = error.message || "Unable to sign in right now.";
    const status =
      /required|valid email|invalid email or password|inactive/i.test(message)
        ? 400
        : 500;

    console.error("Admin login error:", message);
    res.status(status).json({
      success: false,
      message,
    });
  }
});

router.get("/me", async (req, res) => {
  try {
    const result = await getAdminProfile(getBearerToken(req.headers.authorization));
    res.json(result);
  } catch (error: any) {
    const message = error.message || "Authentication is required.";
    const status = /authentication is required|expired|inactive/i.test(message)
      ? 401
      : 500;

    res.status(status).json({
      success: false,
      message,
    });
  }
});

router.post("/logout", async (req, res) => {
  try {
    const result = await logoutAdmin(getBearerToken(req.headers.authorization));
    res.json(result);
  } catch (error: any) {
    const message = error.message || "Unable to sign out right now.";
    res.status(500).json({
      success: false,
      message,
    });
  }
});

router.post("/change-password", async (req, res) => {
  try {
    const result = await changeAdminPassword({
      sessionToken: getBearerToken(req.headers.authorization),
      newPassword:
        typeof req.body?.newPassword === "string" ? req.body.newPassword : "",
    });

    res.json(result);
  } catch (error: any) {
    const message = error.message || "Unable to change password right now.";
    const status =
      /authentication is required|expired|required|characters with letters and numbers/i.test(
        message
      )
        ? 400
        : 500;

    console.error("Admin change-password error:", message);
    res.status(status).json({
      success: false,
      message,
    });
  }
});

export default router;
