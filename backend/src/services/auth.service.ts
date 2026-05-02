import crypto from "crypto";
import axios from "axios";
import admin, { firestore } from "../config/firebaseAdmin";
import { sendSmtpEmail } from "./email.service";

const OTP_COLLECTION = "auth_password_reset_otps";
const OTP_EXPIRY_MINUTES = 10;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;
const RESET_TOKEN_EXPIRY_MINUTES = 15;
const MIN_PASSWORD_LENGTH = 8;

const normalizeEmail = (value: unknown) =>
  String(value ?? "").trim().toLowerCase();

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));

const createOtpCode = () =>
  String(crypto.randomInt(0, 1000000)).padStart(6, "0");

const hashOtp = ({
  otp,
  salt,
  email,
}: {
  otp: string;
  salt: string;
  email: string;
}) =>
  crypto
    .createHash("sha256")
    .update(`${normalizeEmail(email)}:${salt}:${String(otp || "").trim()}`)
    .digest("hex");

const createResetToken = () => crypto.randomBytes(32).toString("hex");

const hashResetToken = ({
  token,
  salt,
  email,
}: {
  token: string;
  salt: string;
  email: string;
}) =>
  crypto
    .createHash("sha256")
    .update(`${normalizeEmail(email)}:${salt}:${token}`)
    .digest("hex");

const getOtpDocumentRef = (uid: string) =>
  firestore.collection(OTP_COLLECTION).doc(uid);

const getFirebaseWebApiKey = () => {
  const key =
    process.env.FIREBASE_WEB_API_KEY?.trim() ||
    process.env.VITE_FIREBASE_API_KEY?.trim() ||
    "";

  if (!key) {
    throw new Error(
      "Firebase web API key is not configured. Set FIREBASE_WEB_API_KEY or VITE_FIREBASE_API_KEY."
    );
  }

  return key;
};

const buildForgotPasswordOtpEmail = (otp: string) => {
  const subject = "Your ITMart24 admin password reset OTP";
  const text = [
    "We received a request to reset your ITMart24 admin password.",
    "",
    `Your one-time password is: ${otp}`,
    "",
    `This code will expire in ${OTP_EXPIRY_MINUTES} minutes.`,
    "If you did not request this code, you can ignore this email.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
      <p>We received a request to reset your ITMart24 admin password.</p>
      <p style="margin: 24px 0;">
        <span style="display: inline-block; padding: 12px 18px; border-radius: 12px; background: #eff6ff; border: 1px solid #bfdbfe; font-size: 28px; font-weight: 700; letter-spacing: 0.22em;">
          ${otp}
        </span>
      </p>
      <p>This code will expire in ${OTP_EXPIRY_MINUTES} minutes.</p>
      <p>If you did not request this code, you can ignore this email.</p>
    </div>
  `;

  return { subject, text, html };
};

const getFriendlyAuthError = (message: string, fallback: string) =>
  message || fallback;

const verifyEmailPassword = async ({
  email,
  password,
}: {
  email: string;
  password: string;
}) => {
  const apiKey = getFirebaseWebApiKey();
  const response = await axios.post(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      email,
      password,
      returnSecureToken: true,
    }
  );

  return response.data as {
    localId?: string;
    email?: string;
    idToken?: string;
  };
};

const ensureAdminUser = async (uid: string) => {
  const adminDoc = await firestore.collection("admins").doc(uid).get();

  if (!adminDoc.exists) {
    throw new Error("This account does not have access to the ITMart24 admin workspace.");
  }

  return adminDoc;
};

export const requestForgotPasswordOtp = async (emailInput: string) => {
  const email = normalizeEmail(emailInput);

  if (!email) {
    throw new Error("Email is required.");
  }

  if (!isValidEmail(email)) {
    throw new Error("Enter a valid email address.");
  }

  let userRecord: admin.auth.UserRecord;

  try {
    userRecord = await admin.auth().getUserByEmail(email);
    await ensureAdminUser(userRecord.uid);
  } catch (error: any) {
    if (
      error?.code === "auth/user-not-found" ||
      error?.message?.includes("does not have access")
    ) {
      return {
        success: true,
        message:
          "If an admin account exists for that email, a password reset OTP has been sent.",
        retryAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      };
    }

    throw error;
  }

  const otpRef = getOtpDocumentRef(userRecord.uid);
  const otpSnap = await otpRef.get();
  const otpData = otpSnap.exists ? otpSnap.data() ?? {} : {};
  const lastRequestedAt =
    typeof otpData.requestedAt?.toDate === "function"
      ? otpData.requestedAt.toDate()
      : otpData.requestedAt
        ? new Date(otpData.requestedAt)
        : null;

  if (
    lastRequestedAt instanceof Date &&
    !Number.isNaN(lastRequestedAt.getTime()) &&
    Date.now() - lastRequestedAt.getTime() <
      OTP_RESEND_COOLDOWN_SECONDS * 1000
  ) {
    throw new Error("Please wait before requesting another OTP.");
  }

  const otp = createOtpCode();
  const salt = crypto.randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await otpRef.set(
    {
      email,
      otpHash: hashOtp({ otp, salt, email }),
      salt,
      expiresAt,
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      attempts: 0,
      maxAttempts: OTP_MAX_ATTEMPTS,
      used: false,
      verifiedAt: null,
      resetTokenHash: admin.firestore.FieldValue.delete(),
      resetTokenExpiresAt: admin.firestore.FieldValue.delete(),
      resetTokenUsedAt: admin.firestore.FieldValue.delete(),
    },
    { merge: true }
  );

  await sendSmtpEmail({
    to: email,
    ...buildForgotPasswordOtpEmail(otp),
  });

  return {
    success: true,
    message:
      "If an admin account exists for that email, a password reset OTP has been sent.",
    retryAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
  };
};

export const verifyForgotPasswordOtp = async ({
  email: emailInput,
  otp,
}: {
  email: string;
  otp: string;
}) => {
  const email = normalizeEmail(emailInput);
  const trimmedOtp = String(otp || "").trim();

  if (!email || !trimmedOtp) {
    throw new Error("Email and OTP are required.");
  }

  if (!isValidEmail(email)) {
    throw new Error("Enter a valid email address.");
  }

  if (!/^\d{6}$/.test(trimmedOtp)) {
    throw new Error("Enter the 6-digit OTP.");
  }

  let userRecord: admin.auth.UserRecord;

  try {
    userRecord = await admin.auth().getUserByEmail(email);
    await ensureAdminUser(userRecord.uid);
  } catch {
    throw new Error("Invalid OTP or email.");
  }

  const otpRef = getOtpDocumentRef(userRecord.uid);
  const otpSnap = await otpRef.get();

  if (!otpSnap.exists) {
    throw new Error("No active OTP was found. Request a new code.");
  }

  const otpData = otpSnap.data() ?? {};
  const expiresAt =
    typeof otpData.expiresAt?.toDate === "function"
      ? otpData.expiresAt.toDate()
      : new Date(otpData.expiresAt);
  const attempts = Number(otpData.attempts || 0);
  const maxAttempts = Number(otpData.maxAttempts || OTP_MAX_ATTEMPTS);

  if (otpData.used) {
    throw new Error("This OTP has already been used. Request a new code.");
  }

  if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) {
    throw new Error("This OTP is invalid. Request a new code.");
  }

  if (expiresAt.getTime() < Date.now()) {
    await otpRef.set(
      {
        used: true,
        expiredAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    throw new Error("This OTP has expired. Request a new code.");
  }

  if (attempts >= maxAttempts) {
    throw new Error("Too many invalid attempts. Request a new code.");
  }

  const expectedHash = hashOtp({
    otp: trimmedOtp,
    salt: String(otpData.salt || ""),
    email,
  });

  if (expectedHash !== otpData.otpHash) {
    await otpRef.set(
      {
        attempts: attempts + 1,
        lastFailedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    throw new Error("Invalid OTP or email.");
  }

  const resetToken = createResetToken();
  const resetTokenSalt = crypto.randomBytes(16).toString("hex");
  const resetTokenExpiresAt = new Date(
    Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000
  );

  await otpRef.set(
    {
      used: true,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      otpHash: admin.firestore.FieldValue.delete(),
      salt: admin.firestore.FieldValue.delete(),
      resetTokenHash: hashResetToken({
        token: resetToken,
        salt: resetTokenSalt,
        email,
      }),
      resetTokenSalt,
      resetTokenExpiresAt,
      resetTokenUsedAt: null,
    },
    { merge: true }
  );

  return {
    success: true,
    message: "OTP verified successfully.",
    resetToken,
    resetTokenExpiresInMinutes: RESET_TOKEN_EXPIRY_MINUTES,
  };
};

export const resetPasswordWithOtp = async ({
  email: emailInput,
  resetToken,
  newPassword,
}: {
  email: string;
  resetToken: string;
  newPassword: string;
}) => {
  const email = normalizeEmail(emailInput);
  const trimmedResetToken = String(resetToken || "").trim();
  const password = String(newPassword || "");

  if (!email || !trimmedResetToken || !password) {
    throw new Error("Email, reset token, and new password are required.");
  }

  if (!isValidEmail(email)) {
    throw new Error("Enter a valid email address.");
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error("Use at least 8 characters for the new password.");
  }

  let userRecord: admin.auth.UserRecord;

  try {
    userRecord = await admin.auth().getUserByEmail(email);
    await ensureAdminUser(userRecord.uid);
  } catch {
    throw new Error("Unable to reset the password for this account.");
  }

  const otpRef = getOtpDocumentRef(userRecord.uid);
  const otpSnap = await otpRef.get();

  if (!otpSnap.exists) {
    throw new Error("No verified password reset request was found.");
  }

  const otpData = otpSnap.data() ?? {};
  const resetExpiresAt =
    typeof otpData.resetTokenExpiresAt?.toDate === "function"
      ? otpData.resetTokenExpiresAt.toDate()
      : new Date(otpData.resetTokenExpiresAt);

  if (!otpData.resetTokenHash || !otpData.resetTokenSalt) {
    throw new Error("No verified password reset request was found.");
  }

  if (otpData.resetTokenUsedAt) {
    throw new Error("This password reset request has already been used.");
  }

  if (!(resetExpiresAt instanceof Date) || Number.isNaN(resetExpiresAt.getTime())) {
    throw new Error("This password reset session is invalid. Request a new OTP.");
  }

  if (resetExpiresAt.getTime() < Date.now()) {
    throw new Error("This password reset session has expired. Request a new OTP.");
  }

  const expectedResetHash = hashResetToken({
    token: trimmedResetToken,
    salt: String(otpData.resetTokenSalt || ""),
    email,
  });

  if (expectedResetHash !== otpData.resetTokenHash) {
    throw new Error("This password reset session is invalid. Request a new OTP.");
  }

  await admin.auth().updateUser(userRecord.uid, {
    password,
  });

  await otpRef.set(
    {
      resetTokenUsedAt: admin.firestore.FieldValue.serverTimestamp(),
      passwordResetAt: admin.firestore.FieldValue.serverTimestamp(),
      resetTokenHash: admin.firestore.FieldValue.delete(),
      resetTokenSalt: admin.firestore.FieldValue.delete(),
      resetTokenExpiresAt: admin.firestore.FieldValue.delete(),
    },
    { merge: true }
  );

  return {
    success: true,
    message: "Password reset successfully. Please sign in with your new password.",
  };
};

export const changeAdminPassword = async ({
  idToken,
  currentPassword,
  newPassword,
}: {
  idToken: string;
  currentPassword: string;
  newPassword: string;
}) => {
  const trimmedIdToken = String(idToken || "").trim();
  const password = String(newPassword || "");
  const existingPassword = String(currentPassword || "");

  if (!trimmedIdToken) {
    throw new Error("Authentication is required.");
  }

  if (!existingPassword) {
    throw new Error("Current password is required.");
  }

  if (!password) {
    throw new Error("New password is required.");
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error("Use at least 8 characters for the new password.");
  }

  let decodedToken: admin.auth.DecodedIdToken;

  try {
    decodedToken = await admin.auth().verifyIdToken(trimmedIdToken);
  } catch {
    throw new Error("Authentication is required.");
  }

  await ensureAdminUser(decodedToken.uid);
  const userRecord = await admin.auth().getUser(decodedToken.uid);
  const email = normalizeEmail(userRecord.email);

  if (!email) {
    throw new Error("This account does not have a valid email address.");
  }

  try {
    await verifyEmailPassword({
      email,
      password: existingPassword,
    });
  } catch (error: any) {
    const code = error?.response?.data?.error?.message;
    if (
      code === "INVALID_PASSWORD" ||
      code === "EMAIL_NOT_FOUND" ||
      code === "INVALID_LOGIN_CREDENTIALS"
    ) {
      throw new Error("Current password is incorrect.");
    }

    throw new Error(
      getFriendlyAuthError(
        error?.message,
        "Unable to verify the current password right now."
      )
    );
  }

  await admin.auth().updateUser(decodedToken.uid, {
    password,
  });

  await firestore.collection("admins").doc(decodedToken.uid).set(
    {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      passwordUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    success: true,
    message: "Password updated successfully.",
  };
};
