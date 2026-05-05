"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.changeAdminPassword = exports.resetPasswordWithOtp = exports.verifyForgotPasswordOtp = exports.requestForgotPasswordOtp = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const crypto_1 = __importDefault(require("crypto"));
const firebaseAdmin_1 = __importStar(require("../config/firebaseAdmin"));
const analyticsPostgres_service_1 = require("./analyticsPostgres.service");
const email_service_1 = require("./email.service");
const adminAuth_service_1 = require("./adminAuth.service");
const adminAuth_service_2 = require("./adminAuth.service");
const OTP_COLLECTION = "auth_password_reset_otps";
const OTP_EXPIRY_MINUTES = 10;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;
const MIN_PASSWORD_LENGTH = 8;
const normalizeEmail = (value) => String(value ?? "").trim().toLowerCase();
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
const isStrongEnoughPassword = (value) => value.length >= MIN_PASSWORD_LENGTH &&
    /[A-Za-z]/.test(value) &&
    /\d/.test(value);
const createOtpCode = () => String(crypto_1.default.randomInt(0, 1000000)).padStart(6, "0");
const hashOtp = ({ otp, salt, email, }) => crypto_1.default
    .createHash("sha256")
    .update(`${normalizeEmail(email)}:${salt}:${String(otp || "").trim()}`)
    .digest("hex");
const getOtpDocumentRef = (adminId) => firebaseAdmin_1.firestore.collection(OTP_COLLECTION).doc(adminId);
const buildForgotPasswordOtpEmail = (otp) => {
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
const findAdminByEmail = async (emailInput) => {
    const email = normalizeEmail(emailInput);
    const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
    const result = await pool.query(`
      SELECT id, name, email, status, password_hash
      FROM admins
      WHERE email = $1
      LIMIT 1
    `, [email]);
    if (result.rowCount === 0) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: String(row.id ?? ""),
        email: String(row.email ?? ""),
        name: String(row.name ?? ""),
        status: String(row.status ?? ""),
        passwordHash: String(row.password_hash ?? ""),
    };
};
const requestForgotPasswordOtp = async (emailInput) => {
    const email = normalizeEmail(emailInput);
    if (!email) {
        throw new Error("Email is required.");
    }
    if (!isValidEmail(email)) {
        throw new Error("Enter a valid email address.");
    }
    const adminRecord = await findAdminByEmail(email);
    if (!adminRecord || adminRecord.status.toLowerCase() !== "active") {
        return {
            success: true,
            message: "If an admin account exists for that email, a password reset OTP has been sent.",
            retryAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
        };
    }
    const otpRef = getOtpDocumentRef(adminRecord.id);
    const otpSnap = await otpRef.get();
    const otpData = otpSnap.exists ? otpSnap.data() ?? {} : {};
    const lastRequestedAt = typeof otpData.requestedAt?.toDate === "function"
        ? otpData.requestedAt.toDate()
        : otpData.requestedAt
            ? new Date(otpData.requestedAt)
            : null;
    if (lastRequestedAt instanceof Date &&
        !Number.isNaN(lastRequestedAt.getTime()) &&
        Date.now() - lastRequestedAt.getTime() <
            OTP_RESEND_COOLDOWN_SECONDS * 1000) {
        throw new Error("Please wait before requesting another OTP.");
    }
    const otp = createOtpCode();
    const salt = crypto_1.default.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    await otpRef.set({
        adminId: adminRecord.id,
        email,
        otpHash: hashOtp({ otp, salt, email }),
        salt,
        expiresAt,
        requestedAt: firebaseAdmin_1.default.firestore.FieldValue.serverTimestamp(),
        attempts: 0,
        maxAttempts: OTP_MAX_ATTEMPTS,
        used: false,
        verifiedAt: null,
    }, { merge: true });
    await (0, email_service_1.sendSmtpEmail)({
        to: email,
        ...buildForgotPasswordOtpEmail(otp),
    });
    return {
        success: true,
        message: "If an admin account exists for that email, a password reset OTP has been sent.",
        retryAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    };
};
exports.requestForgotPasswordOtp = requestForgotPasswordOtp;
const verifyForgotPasswordOtp = async ({ email: emailInput, otp, }) => {
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
    const adminRecord = await findAdminByEmail(email);
    if (!adminRecord || adminRecord.status.toLowerCase() !== "active") {
        throw new Error("Invalid OTP or email.");
    }
    const otpRef = getOtpDocumentRef(adminRecord.id);
    const otpSnap = await otpRef.get();
    if (!otpSnap.exists) {
        throw new Error("No active OTP was found. Request a new code.");
    }
    const otpData = otpSnap.data() ?? {};
    const expiresAt = typeof otpData.expiresAt?.toDate === "function"
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
        await otpRef.set({
            used: true,
            expiredAt: firebaseAdmin_1.default.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
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
        await otpRef.set({
            attempts: attempts + 1,
            lastFailedAt: firebaseAdmin_1.default.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        throw new Error("Invalid OTP or email.");
    }
    await otpRef.set({
        used: true,
        verifiedAt: firebaseAdmin_1.default.firestore.FieldValue.serverTimestamp(),
        otpHash: firebaseAdmin_1.default.firestore.FieldValue.delete(),
        salt: firebaseAdmin_1.default.firestore.FieldValue.delete(),
    }, { merge: true });
    const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
    const adminResult = await pool.query(`
      SELECT id, name, email, role, status, created_at, updated_at
      FROM admins
      WHERE id = $1
      LIMIT 1
    `, [adminRecord.id]);
    if (adminResult.rowCount === 0) {
        throw new Error("Unable to create an admin session right now.");
    }
    const sessionResult = await (0, adminAuth_service_2.createAdminSessionForAdmin)(adminResult.rows[0], true);
    return {
        ...sessionResult,
        message: "OTP verified successfully. Redirecting to your account settings.",
    };
};
exports.verifyForgotPasswordOtp = verifyForgotPasswordOtp;
const resetPasswordWithOtp = async ({ email: emailInput, resetToken, newPassword, }) => {
    void emailInput;
    void resetToken;
    void newPassword;
    throw new Error("Password reset after OTP verification is no longer required.");
};
exports.resetPasswordWithOtp = resetPasswordWithOtp;
const changeAdminPassword = async ({ idToken, currentPassword, newPassword, }) => {
    const sessionToken = String(idToken || "").trim();
    const existingPassword = String(currentPassword || "");
    const password = String(newPassword || "");
    if (!sessionToken) {
        throw new Error("Authentication is required.");
    }
    if (!existingPassword) {
        throw new Error("Current password is required.");
    }
    if (!password) {
        throw new Error("New password is required.");
    }
    if (!isStrongEnoughPassword(password)) {
        throw new Error("Use at least 8 characters with letters and numbers.");
    }
    const profile = await (0, adminAuth_service_1.getAdminProfile)(sessionToken);
    const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
    const adminResult = await pool.query("SELECT id, password_hash FROM admins WHERE id = $1 LIMIT 1", [profile.user.id]);
    if (adminResult.rowCount === 0) {
        throw new Error("Authentication is required.");
    }
    const adminRecord = adminResult.rows[0];
    const passwordMatches = await bcrypt_1.default.compare(existingPassword, String(adminRecord.password_hash ?? ""));
    if (!passwordMatches) {
        throw new Error("Current password is incorrect.");
    }
    const newPasswordHash = await bcrypt_1.default.hash(password, 12);
    await pool.query(`
      UPDATE admins
      SET password_hash = $2, updated_at = NOW()
      WHERE id = $1
    `, [profile.user.id, newPasswordHash]);
    return {
        success: true,
        message: "Password updated successfully.",
    };
};
exports.changeAdminPassword = changeAdminPassword;
