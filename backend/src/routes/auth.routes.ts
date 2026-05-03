import { Router } from "express";
import {
  changeAdminPassword,
  requestForgotPasswordOtp,
  resetPasswordWithOtp,
  verifyForgotPasswordOtp,
} from "../services/auth.service";

const router = Router();

router.post("/forgot-password/send-otp", async (req, res) => {
  try {
    const email =
      typeof req.body?.email === "string" ? req.body.email : "";

    const result = await requestForgotPasswordOtp(email);
    res.json(result);
  } catch (error: any) {
    const message =
      error.message || "Unable to send OTP right now. Please try again later.";
    const status =
      /required|valid email|wait before requesting/i.test(message) ? 400 : 500;

    console.error("Admin forgot-password send OTP error:", message);
    res.status(status).json({
      success: false,
      message,
    });
  }
});

router.post("/forgot-password/verify-otp", async (req, res) => {
  try {
    const result = await verifyForgotPasswordOtp({
      email: typeof req.body?.email === "string" ? req.body.email : "",
      otp: typeof req.body?.otp === "string" ? req.body.otp : "",
    });

    res.json(result);
  } catch (error: any) {
    const message =
      error.message || "Unable to verify OTP right now. Please try again later.";
    const status =
      /required|invalid|expired|used|request a new code|no active otp|too many/i.test(
        message
      )
        ? 400
        : 500;

    console.error("Admin forgot-password verify OTP error:", message);
    res.status(status).json({
      success: false,
      message,
    });
  }
});

router.post("/forgot-password/reset", async (req, res) => {
  try {
    const result = await resetPasswordWithOtp({
      email: typeof req.body?.email === "string" ? req.body.email : "",
      resetToken:
        typeof req.body?.resetToken === "string" ? req.body.resetToken : "",
      newPassword:
        typeof req.body?.newPassword === "string" ? req.body.newPassword : "",
    });

    res.json(result);
  } catch (error: any) {
    const message =
      error.message || "Unable to reset the password right now.";
    const status =
      /required|valid email|new password|request|expired|invalid|used/i.test(
        message
      )
        ? 400
        : 500;

    console.error("Admin forgot-password reset error:", message);
    res.status(status).json({
      success: false,
      message,
    });
  }
});

router.post("/change-password", async (req, res) => {
  try {
    const authorization = String(req.headers.authorization || "");
    const idToken = authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : "";
    const result = await changeAdminPassword({
      idToken,
      currentPassword:
        typeof req.body?.currentPassword === "string"
          ? req.body.currentPassword
          : "",
      newPassword:
        typeof req.body?.newPassword === "string" ? req.body.newPassword : "",
    });

    res.json(result);
  } catch (error: any) {
    const message = error.message || "Unable to change password right now.";
    const status =
      /authentication is required|current password|required|incorrect|new password|valid email/i.test(
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
