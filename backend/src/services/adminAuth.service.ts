import bcrypt from "bcrypt";
import crypto from "crypto";
import { getAnalyticsPool } from "./analyticsPostgres.service";

const BCRYPT_ROUNDS = 12;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * ONE_DAY_MS;

type SignUpPayload = {
  name: string;
  email: string;
  password: string;
};

type SignInPayload = {
  email: string;
  password: string;
  rememberMe?: boolean;
};

type ChangePasswordPayload = {
  sessionToken: string;
  currentPassword: string;
  newPassword: string;
};

type AdminRecord = {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const validateEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));

const validatePassword = (value: string) =>
  value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);

const hashSessionToken = (sessionToken: string) =>
  crypto.createHash("sha256").update(sessionToken).digest("hex");

const createSessionToken = () => crypto.randomBytes(48).toString("hex");

const mapAdminRecord = (row: Record<string, unknown>): AdminRecord => ({
  id: Number(row.id),
  name: String(row.name ?? ""),
  email: String(row.email ?? ""),
  role: String(row.role ?? "admin"),
  status: String(row.status ?? "active"),
  createdAt: String(row.created_at ?? ""),
  updatedAt: String(row.updated_at ?? ""),
});

const getSessionExpiry = (rememberMe: boolean) =>
  new Date(Date.now() + (rememberMe ? THIRTY_DAYS_MS : ONE_DAY_MS));

export async function createAdminSessionForAdmin(
  admin: Record<string, unknown>,
  rememberMe = true
) {
  if (String(admin.status ?? "").toLowerCase() !== "active") {
    throw new Error("This admin account is inactive. Contact the system administrator.");
  }

  const sessionToken = createSessionToken();
  const tokenHash = hashSessionToken(sessionToken);
  const expiresAt = getSessionExpiry(Boolean(rememberMe));
  const pool = await getAnalyticsPool();

  await pool.query(
    `
      INSERT INTO admin_sessions (admin_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
    `,
    [admin.id, tokenHash, expiresAt]
  );

  return {
    success: true,
    sessionToken,
    user: mapAdminRecord(admin),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function signUpAdmin({
  name,
  email,
  password,
}: SignUpPayload) {
  const trimmedName = name.trim();
  const normalizedEmail = normalizeEmail(email);

  if (!trimmedName) {
    throw new Error("Name is required.");
  }

  if (!normalizedEmail) {
    throw new Error("Email is required.");
  }

  if (!validateEmail(normalizedEmail)) {
    throw new Error("Enter a valid email address.");
  }

  if (!password) {
    throw new Error("Password is required.");
  }

  if (!validatePassword(password)) {
    throw new Error("Use at least 8 characters with letters and numbers.");
  }

  const pool = await getAnalyticsPool();
  const existingAdmin = await pool.query(
    "SELECT id FROM admins WHERE email = $1 LIMIT 1",
    [normalizedEmail]
  );

  if (existingAdmin.rowCount > 0) {
    throw new Error("An admin account with this email already exists.");
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const insertResult = await pool.query(
    `
      INSERT INTO admins (name, email, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id, name, email, role, status, created_at, updated_at
    `,
    [trimmedName, normalizedEmail, passwordHash]
  );

  return {
    success: true,
    user: mapAdminRecord(insertResult.rows[0] as Record<string, unknown>),
  };
}

export async function signInAdmin({
  email,
  password,
  rememberMe = true,
}: SignInPayload) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw new Error("Email is required.");
  }

  if (!validateEmail(normalizedEmail)) {
    throw new Error("Enter a valid email address.");
  }

  if (!password) {
    throw new Error("Password is required.");
  }

  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      SELECT id, name, email, password_hash, role, status, created_at, updated_at
      FROM admins
      WHERE email = $1
      LIMIT 1
    `,
    [normalizedEmail]
  );

  if (result.rowCount === 0) {
    throw new Error("Invalid email or password.");
  }

  const admin = result.rows[0] as Record<string, unknown>;

  if (String(admin.status ?? "").toLowerCase() !== "active") {
    throw new Error("This admin account is inactive. Contact the system administrator.");
  }

  const passwordMatches = await bcrypt.compare(
    password,
    String(admin.password_hash ?? "")
  );

  if (!passwordMatches) {
    throw new Error("Invalid email or password.");
  }

  return createAdminSessionForAdmin(admin, Boolean(rememberMe));
}

export async function getAdminProfile(sessionToken: string) {
  if (!sessionToken.trim()) {
    throw new Error("Authentication is required.");
  }

  const tokenHash = hashSessionToken(sessionToken.trim());
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      SELECT
        a.id,
        a.name,
        a.email,
        a.role,
        a.status,
        a.created_at,
        a.updated_at,
        s.id AS session_id,
        s.expires_at
      FROM admin_sessions s
      INNER JOIN admins a ON a.id = s.admin_id
      WHERE s.token_hash = $1
      LIMIT 1
    `,
    [tokenHash]
  );

  if (result.rowCount === 0) {
    throw new Error("Authentication is required.");
  }

  const row = result.rows[0] as Record<string, unknown>;
  const expiresAt = new Date(String(row.expires_at ?? ""));

  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    await pool.query("DELETE FROM admin_sessions WHERE id = $1", [row.session_id]);
    throw new Error("Your admin session has expired. Please sign in again.");
  }

  if (String(row.status ?? "").toLowerCase() !== "active") {
    await pool.query("DELETE FROM admin_sessions WHERE id = $1", [row.session_id]);
    throw new Error("This admin account is inactive. Contact the system administrator.");
  }

  return {
    success: true,
    user: mapAdminRecord(row),
  };
}

export async function logoutAdmin(sessionToken: string) {
  if (!sessionToken.trim()) {
    return {
      success: true,
      message: "Signed out.",
    };
  }

  const tokenHash = hashSessionToken(sessionToken.trim());
  const pool = await getAnalyticsPool();
  await pool.query("DELETE FROM admin_sessions WHERE token_hash = $1", [tokenHash]);

  return {
    success: true,
    message: "Signed out successfully.",
  };
}

export async function changeAdminPassword({
  sessionToken,
  currentPassword,
  newPassword,
}: ChangePasswordPayload) {
  if (!currentPassword) {
    throw new Error("Current password is required.");
  }

  if (!newPassword) {
    throw new Error("New password is required.");
  }

  if (!validatePassword(newPassword)) {
    throw new Error("Use at least 8 characters with letters and numbers.");
  }

  const profile = await getAdminProfile(sessionToken);
  const pool = await getAnalyticsPool();
  const adminResult = await pool.query(
    "SELECT id, password_hash FROM admins WHERE id = $1 LIMIT 1",
    [profile.user.id]
  );

  if (adminResult.rowCount === 0) {
    throw new Error("Authentication is required.");
  }

  const admin = adminResult.rows[0] as Record<string, unknown>;
  const currentPasswordMatches = await bcrypt.compare(
    currentPassword,
    String(admin.password_hash ?? "")
  );

  if (!currentPasswordMatches) {
    throw new Error("Current password is incorrect.");
  }

  const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await pool.query(
    `
      UPDATE admins
      SET password_hash = $2, updated_at = NOW()
      WHERE id = $1
    `,
    [profile.user.id, newPasswordHash]
  );

  return {
    success: true,
    message: "Password updated successfully.",
  };
}
