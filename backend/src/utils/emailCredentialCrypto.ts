import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

const readSecret = () => {
  const secret = String(process.env.EMAIL_CREDENTIAL_SECRET ?? "").trim();

  if (secret.length < 32) {
    throw new Error(
      "EMAIL_CREDENTIAL_SECRET must be set to a strong 32+ character secret."
    );
  }

  return crypto.createHash("sha256").update(secret).digest();
};

export const encryptEmailCredential = (plainText: string) => {
  const value = String(plainText ?? "");

  if (!value) {
    throw new Error("Email credential is required.");
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, readSecret(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
};

export const decryptEmailCredential = (cipherText: string) => {
  const [ivRaw, authTagRaw, encryptedRaw] = String(cipherText ?? "").split(".");

  if (!ivRaw || !authTagRaw || !encryptedRaw) {
    throw new Error("Stored email credential is invalid.");
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    readSecret(),
    Buffer.from(ivRaw, "base64url")
  );
  decipher.setAuthTag(Buffer.from(authTagRaw, "base64url"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
};
