import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import DOMPurify from "isomorphic-dompurify";
import {
  ensureTables,
  getAnalyticsPool,
} from "./analyticsPostgres.service";
import {
  decryptEmailCredential,
  encryptEmailCredential,
} from "../utils/emailCredentialCrypto";

type JsonRecord = Record<string, unknown>;

type EmailAccountPayload = {
  displayName?: unknown;
  emailAddress?: unknown;
  username?: unknown;
  password?: unknown;
  imapUsername?: unknown;
  imapPassword?: unknown;
  smtpUsername?: unknown;
  smtpPassword?: unknown;
  imapHost?: unknown;
  imapPort?: unknown;
  imapSecure?: unknown;
  smtpHost?: unknown;
  smtpPort?: unknown;
  smtpSecure?: unknown;
  isDefault?: unknown;
  isActive?: unknown;
};

type MailboxQuery = {
  folder?: string;
  page?: number;
  limit?: number;
  search?: string;
  unreadOnly?: unknown;
  starredOnly?: unknown;
  attachmentsOnly?: unknown;
};

type ComposeAttachmentInput = {
  filename?: string;
  contentType?: string;
  contentBase64?: string;
};

type NormalizedComposeAttachment = {
  filename: string;
  contentType: string;
  contentBase64: string;
};

type ComposePayload = {
  to?: unknown;
  cc?: unknown;
  bcc?: unknown;
  subject?: unknown;
  bodyText?: unknown;
  bodyHtml?: unknown;
  attachments?: unknown;
};

type ForwardPayload = ComposePayload & {
  folder?: unknown;
  uid?: unknown;
  includeAttachments?: unknown;
};

type ReplyPayload = ComposePayload & {
  folder?: unknown;
  uid?: unknown;
};

type MarkPayload = {
  folder?: unknown;
  seen?: unknown;
  flagged?: unknown;
};

type EmailAccountRecord = {
  id: number;
  displayName: string;
  emailAddress: string;
  username: string;
  imapUsername: string;
  smtpUsername: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  lastTestError: string | null;
};

type EmailAccountRow = Record<string, unknown> & {
  encrypted_password?: string;
  encrypted_imap_password?: string;
  encrypted_smtp_password?: string;
};

type InternalEmailAccountRecord = EmailAccountRecord & {
  encryptedPassword: string;
  encryptedImapPassword: string;
  encryptedSmtpPassword: string;
};

type EmailAccountTestScope = "imap" | "smtp" | "both";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;
const MESSAGE_FETCH_MULTIPLIER = 3;
const IMAP_SOCKET_TIMEOUT_MS = 30000;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const toTrimmedString = (value: unknown) => String(value ?? "").trim();

const normalizeEmail = (value: unknown) =>
  toTrimmedString(value).toLowerCase();

const isValidEmail = (value: string) => EMAIL_REGEX.test(value);

const toBoolean = (value: unknown, fallback = false) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return fallback;
};

const toInteger = (value: unknown, fieldName: string) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a valid positive number.`);
  }

  return Math.round(parsed);
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const readErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const sanitizeHtml = (value: string) =>
  DOMPurify.sanitize(value, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "iframe", "object", "embed"],
    FORBID_ATTR: [
      "onerror",
      "onclick",
      "onload",
      "onmouseover",
      "onfocus",
      "onmouseenter",
    ],
  });

const normalizeAddress = (entry: unknown) => {
  const address = entry as {
    name?: string;
    address?: string;
  };

  return {
    name: address?.name ? String(address.name) : "",
    address: address?.address ? String(address.address) : "",
  };
};

const normalizeAddressList = (value: unknown) => {
  if (!value || typeof value !== "object" || !("value" in (value as object))) {
    return [] as Array<{ name: string; address: string }>;
  }

  const entries = Array.isArray((value as { value?: unknown[] }).value)
    ? (value as { value: unknown[] }).value
    : [];

  return entries
    .map((entry) => normalizeAddress(entry))
    .filter((entry) => entry.address);
};

const normalizeRecipients = (value: unknown, fieldName: string) => {
  const rawValue = toTrimmedString(value);

  if (!rawValue) {
    return [] as string[];
  }

  const recipients = rawValue
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const invalidRecipient = recipients.find((entry) => !isValidEmail(entry));

  if (invalidRecipient) {
    throw new Error(`Invalid ${fieldName} email address: ${invalidRecipient}`);
  }

  return recipients;
};

const normalizeComposeAttachments = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as NormalizedComposeAttachment[];
  }

  return value
    .map((entry) => {
      const record = (entry ?? {}) as ComposeAttachmentInput;
      const filename = toTrimmedString(record.filename);
      const contentType = toTrimmedString(record.contentType) || "application/octet-stream";
      const contentBase64 = toTrimmedString(record.contentBase64);

      if (!filename || !contentBase64) {
        return null;
      }

      return {
        filename,
        contentType,
        contentBase64,
      };
    })
    .filter((entry): entry is NormalizedComposeAttachment => Boolean(entry));
};

const mapEmailAccount = (row: EmailAccountRow): EmailAccountRecord => ({
  id: Number(row.id),
  displayName: String(row.display_name ?? ""),
  emailAddress: String(row.email_address ?? ""),
  username: String(row.username ?? ""),
  imapUsername: String(row.imap_username ?? row.username ?? ""),
  smtpUsername: String(row.smtp_username ?? row.username ?? ""),
  imapHost: String(row.imap_host ?? ""),
  imapPort: Number(row.imap_port ?? 0),
  imapSecure: Boolean(row.imap_secure),
  smtpHost: String(row.smtp_host ?? ""),
  smtpPort: Number(row.smtp_port ?? 0),
  smtpSecure: Boolean(row.smtp_secure),
  isDefault: Boolean(row.is_default),
  isActive: Boolean(row.is_active),
  createdAt: String(row.created_at ?? ""),
  updatedAt: String(row.updated_at ?? ""),
  lastTestedAt: row.last_tested_at ? String(row.last_tested_at) : null,
  lastTestStatus: row.last_test_status ? String(row.last_test_status) : null,
  lastTestError: row.last_test_error ? String(row.last_test_error) : null,
});

const mapInternalEmailAccount = (
  row: EmailAccountRow
): InternalEmailAccountRecord => ({
  ...mapEmailAccount(row),
  encryptedPassword: String(row.encrypted_password ?? ""),
  encryptedImapPassword: String(
    row.encrypted_imap_password ?? row.encrypted_password ?? ""
  ),
  encryptedSmtpPassword: String(
    row.encrypted_smtp_password ?? row.encrypted_password ?? ""
  ),
});

const isSchemaRecoveryError = (error: unknown) => {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: string }).code ?? "")
      : "";

  return ["42P01", "42703", "42P10"].includes(code);
};

const withSchemaRecovery = async <T>(operation: () => Promise<T>) => {
  try {
    return await operation();
  } catch (error) {
    if (!isSchemaRecoveryError(error)) {
      throw error;
    }

    await ensureTables();
    return operation();
  }
};

const sanitizeAccountPayload = (
  payload: EmailAccountPayload,
  options: { requirePassword: boolean }
) => {
  const displayName = toTrimmedString(payload.displayName);
  const emailAddress = normalizeEmail(payload.emailAddress);
  const username = toTrimmedString(payload.username) || emailAddress;
  const password = typeof payload.password === "string" ? payload.password : "";
  const imapUsername =
    toTrimmedString(payload.imapUsername) ||
    username ||
    emailAddress;
  const smtpUsername =
    toTrimmedString(payload.smtpUsername) ||
    username ||
    emailAddress;
  const imapPassword =
    typeof payload.imapPassword === "string" ? payload.imapPassword : password;
  const smtpPassword =
    typeof payload.smtpPassword === "string" ? payload.smtpPassword : password;
  const imapHost = toTrimmedString(payload.imapHost);
  const smtpHost = toTrimmedString(payload.smtpHost);

  if (!displayName) {
    throw new Error("Display name is required.");
  }

  if (!emailAddress || !isValidEmail(emailAddress)) {
    throw new Error("A valid email address is required.");
  }

  if (!username) {
    throw new Error("Username is required.");
  }

  if (!imapUsername) {
    throw new Error("IMAP username is required.");
  }

  if (!smtpUsername) {
    throw new Error("SMTP username is required.");
  }

  if (options.requirePassword && !imapPassword) {
    throw new Error("IMAP password is required.");
  }

  if (options.requirePassword && !smtpPassword) {
    throw new Error("SMTP password is required.");
  }

  if (!imapHost) {
    throw new Error("IMAP host is required.");
  }

  if (!smtpHost) {
    throw new Error("SMTP host is required.");
  }

  return {
    displayName,
    emailAddress,
    username,
    password,
    imapUsername,
    imapPassword,
    smtpUsername,
    smtpPassword,
    imapHost,
    imapPort: toInteger(payload.imapPort, "IMAP port"),
    imapSecure: toBoolean(payload.imapSecure, true),
    smtpHost,
    smtpPort: toInteger(payload.smtpPort, "SMTP port"),
    smtpSecure: toBoolean(payload.smtpSecure, true),
    isDefault: toBoolean(payload.isDefault),
    isActive: toBoolean(payload.isActive, true),
  };
};

const createImapClient = (account: InternalEmailAccountRecord) =>
  new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecure,
    auth: {
      user: account.imapUsername,
      pass: decryptEmailCredential(account.encryptedImapPassword),
    },
    logger: false,
    socketTimeout: IMAP_SOCKET_TIMEOUT_MS,
  });

const createSmtpTransport = (account: InternalEmailAccountRecord) =>
  nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSecure,
    auth: {
      user: account.smtpUsername,
      pass: decryptEmailCredential(account.encryptedSmtpPassword),
    },
    connectionTimeout: IMAP_SOCKET_TIMEOUT_MS,
    greetingTimeout: IMAP_SOCKET_TIMEOUT_MS,
    socketTimeout: IMAP_SOCKET_TIMEOUT_MS,
  });

const openMailbox = async (client: ImapFlow, folder: string) => {
  return client.mailboxOpen(folder || "INBOX");
};

const withImapClient = async <T>(
  account: InternalEmailAccountRecord,
  operation: (client: ImapFlow) => Promise<T>
) => {
  const client = createImapClient(account);

  try {
    await client.connect();
    return await operation(client);
  } finally {
    await client.logout().catch(() => undefined);
  }
};

const loadAccountById = async (id: number) => {
  return withSchemaRecovery(async () => {
    const pool = await getAnalyticsPool();
    const result = await pool.query(
      `
        SELECT id,
               display_name,
               email_address,
               username,
               encrypted_password,
               imap_username,
               encrypted_imap_password,
               smtp_username,
               encrypted_smtp_password,
               imap_host,
               imap_port,
               imap_secure,
               smtp_host,
               smtp_port,
               smtp_secure,
               is_default,
               is_active,
               created_at,
               updated_at,
               last_tested_at,
               last_test_status,
               last_test_error
        FROM email_accounts
        WHERE id = $1 AND deleted_at IS NULL
        LIMIT 1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      throw new Error("Email account not found.");
    }

    return mapInternalEmailAccount(result.rows[0] as EmailAccountRow);
  });
};

const ensureActiveAccount = (account: InternalEmailAccountRecord) => {
  if (!account.isActive) {
    throw new Error("This email account is inactive.");
  }
};

const parseMessagePreview = async (source: Buffer) => {
  const parsed = await simpleParser(source, {
    skipHtmlToText: false,
    skipImageLinks: true,
  });
  const text = String(parsed.text ?? parsed.html ?? "").replace(/\s+/g, " ").trim();

  return {
    text: String(parsed.text ?? ""),
    html: String(parsed.html ?? ""),
    preview: text.slice(0, 180),
    parsed,
  };
};

const formatFolderName = (folder: { path?: string; name?: string; specialUse?: string }) =>
  String(folder.path ?? folder.name ?? "").trim();

const detectTrashFolder = (folders: Array<{ path: string; specialUse?: string | null }>) => {
  const trashFolder =
    folders.find((folder) => folder.specialUse === "\\Trash") ??
    folders.find((folder) => /trash|deleted/i.test(folder.path));

  return trashFolder?.path ?? null;
};

const parseAttachmentId = (value: string) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Attachment not found.");
  }

  return Math.floor(parsed);
};

const sanitizeMessageUid = (value: unknown) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Message uid is invalid.");
  }

  return Math.floor(parsed);
};

const normalizeFolder = (value: unknown) => toTrimmedString(value) || "INBOX";

const buildReplyHeaders = async (
  account: InternalEmailAccountRecord,
  folder: string,
  uid: number
) => {
  const message = await getEmailMessage(account.id, uid, folder);

  const existingReferences = Array.isArray(message.references)
    ? message.references
    : message.references
      ? [message.references]
      : [];

  return {
    inReplyTo: message.messageId || undefined,
    references: [...existingReferences, message.messageId].filter(Boolean),
  };
};

const addSendLog = async (payload: {
  adminUserId: number;
  accountId: number;
  direction: "send" | "reply" | "forward";
  recipients: string[];
  subject: string;
  status: "success" | "failed";
  errorMessage?: string | null;
}) => {
  const pool = await getAnalyticsPool();
  await pool.query(
    `
      INSERT INTO email_activity_logs (
        admin_user_id,
        account_id,
        direction,
        recipients,
        subject,
        status,
        error_message,
        created_at
      )
      VALUES ($1, $2, $3, $4::text[], $5, $6, $7, NOW())
    `,
    [
      payload.adminUserId,
      payload.accountId,
      payload.direction,
      payload.recipients,
      payload.subject,
      payload.status,
      payload.errorMessage ?? null,
    ]
  );
};

export const listEmailAccounts = async () => {
  return withSchemaRecovery(async () => {
    const pool = await getAnalyticsPool();
    const result = await pool.query(
      `
        SELECT id,
               display_name,
               email_address,
               username,
               imap_username,
               smtp_username,
               imap_host,
               imap_port,
               imap_secure,
               smtp_host,
               smtp_port,
               smtp_secure,
               is_default,
               is_active,
               created_at,
               updated_at,
               last_tested_at,
               last_test_status,
               last_test_error
        FROM email_accounts
        WHERE deleted_at IS NULL
        ORDER BY is_default DESC, updated_at DESC, id DESC
      `
    );

    return result.rows.map((row: EmailAccountRow) => mapEmailAccount(row));
  });
};

export const createEmailAccount = async (payload: EmailAccountPayload) => {
  const input = sanitizeAccountPayload(payload, { requirePassword: true });
  const pool = await getAnalyticsPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (input.isDefault) {
      await client.query(
        "UPDATE email_accounts SET is_default = FALSE, updated_at = NOW() WHERE deleted_at IS NULL"
      );
    }

    const result = await client.query(
      `
        INSERT INTO email_accounts (
          display_name,
          email_address,
          username,
          encrypted_password,
          imap_username,
          encrypted_imap_password,
          smtp_username,
          encrypted_smtp_password,
          imap_host,
          imap_port,
          imap_secure,
          smtp_host,
          smtp_port,
          smtp_secure,
          is_default,
          is_active,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
        RETURNING id
      `,
      [
        input.displayName,
        input.emailAddress,
        input.username,
        encryptEmailCredential(input.imapPassword || input.password),
        input.imapUsername,
        encryptEmailCredential(input.imapPassword || input.password),
        input.smtpUsername,
        encryptEmailCredential(input.smtpPassword || input.password),
        input.imapHost,
        input.imapPort,
        input.imapSecure,
        input.smtpHost,
        input.smtpPort,
        input.smtpSecure,
        input.isDefault,
        input.isActive,
      ]
    );

    await client.query("COMMIT");
    return loadAccountById(Number(result.rows[0].id));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const updateEmailAccount = async (
  id: number,
  payload: EmailAccountPayload
) => {
  const input = sanitizeAccountPayload(payload, { requirePassword: false });
  const existing = await loadAccountById(id);
  const pool = await getAnalyticsPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (input.isDefault) {
      await client.query(
        "UPDATE email_accounts SET is_default = FALSE, updated_at = NOW() WHERE deleted_at IS NULL AND id <> $1",
        [id]
      );
    }

    const result = await client.query(
      `
        UPDATE email_accounts
        SET display_name = $2,
            email_address = $3,
            username = $4,
            encrypted_password = $5,
            imap_username = $6,
            encrypted_imap_password = $7,
            smtp_username = $8,
            encrypted_smtp_password = $9,
            imap_host = $10,
            imap_port = $11,
            imap_secure = $12,
            smtp_host = $13,
            smtp_port = $14,
            smtp_secure = $15,
            is_default = $16,
            is_active = $17,
            updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id
      `,
      [
        id,
        input.displayName,
        input.emailAddress,
        input.username,
        input.imapPassword
          ? encryptEmailCredential(input.imapPassword)
          : existing.encryptedPassword,
        input.imapUsername,
        input.imapPassword
          ? encryptEmailCredential(input.imapPassword)
          : existing.encryptedImapPassword,
        input.smtpUsername,
        input.smtpPassword
          ? encryptEmailCredential(input.smtpPassword)
          : existing.encryptedSmtpPassword,
        input.imapHost,
        input.imapPort,
        input.imapSecure,
        input.smtpHost,
        input.smtpPort,
        input.smtpSecure,
        input.isDefault,
        input.isActive,
      ]
    );

    if (result.rowCount === 0) {
      throw new Error("Email account not found.");
    }

    await client.query("COMMIT");
    return loadAccountById(id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const deleteEmailAccount = async (id: number) => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      UPDATE email_accounts
      SET is_active = FALSE,
          is_default = FALSE,
          deleted_at = NOW(),
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `,
    [id]
  );

  if (result.rowCount === 0) {
    throw new Error("Email account not found.");
  }

  return {
    success: true,
    message: "Email account disabled successfully.",
  };
};

export const testEmailAccountConnections = async (
  id: number,
  scope: EmailAccountTestScope = "both"
) => {
  const account = await loadAccountById(id);
  ensureActiveAccount(account);

  let imapResult = {
    success: false,
    message: "IMAP test not started.",
  };
  let smtpResult = {
    success: false,
    message: "SMTP test not started.",
  };

  if (scope === "imap" || scope === "both") {
    try {
      await withImapClient(account, async (client) => {
        await openMailbox(client, "INBOX");
      });
      imapResult = {
        success: true,
        message: "IMAP connection successful.",
      };
    } catch (error) {
      imapResult = {
        success: false,
        message: readErrorMessage(error, "IMAP connection failed."),
      };
    }
  }

  if (scope === "smtp" || scope === "both") {
    try {
      const transporter = createSmtpTransport(account);
      await transporter.verify();
      smtpResult = {
        success: true,
        message: "SMTP connection successful.",
      };
    } catch (error) {
      smtpResult = {
        success: false,
        message: readErrorMessage(error, "SMTP connection failed."),
      };
    }
  }

  const success =
    scope === "imap"
      ? imapResult.success
      : scope === "smtp"
        ? smtpResult.success
        : imapResult.success && smtpResult.success;
  const pool = await getAnalyticsPool();
  await pool.query(
    `
      UPDATE email_accounts
      SET last_tested_at = NOW(),
          last_test_status = $2,
          last_test_error = $3,
          updated_at = NOW()
      WHERE id = $1
    `,
    [
      id,
      success ? "success" : "failed",
      success
        ? null
        : [scope !== "smtp" ? imapResult.message : null, scope !== "imap" ? smtpResult.message : null]
            .filter(Boolean)
            .join(" ")
            .trim(),
    ]
  );

  return {
    success,
    imap: imapResult,
    smtp: smtpResult,
  };
};

export const listEmailFolders = async (accountId: number) => {
  const account = await loadAccountById(accountId);
  ensureActiveAccount(account);

  return withImapClient(account, async (client) => {
    const listedFolders = (await client.list()).map((folder: any) => ({
      path: formatFolderName(folder),
      name: String(folder.name ?? folder.path ?? ""),
      specialUse: folder.specialUse ? String(folder.specialUse) : null,
    }));

    const preferredFolderOrder = [
      "INBOX",
      "Sent",
      "Drafts",
      "Archive",
      "Junk",
      "Spam",
      "Trash",
    ];

    return listedFolders.sort((left, right) => {
      const leftIndex = preferredFolderOrder.findIndex(
        (entry) => entry.toLowerCase() === left.name.toLowerCase()
      );
      const rightIndex = preferredFolderOrder.findIndex(
        (entry) => entry.toLowerCase() === right.name.toLowerCase()
      );

      if (leftIndex === -1 && rightIndex === -1) {
        return left.name.localeCompare(right.name);
      }

      if (leftIndex === -1) {
        return 1;
      }

      if (rightIndex === -1) {
        return -1;
      }

      return leftIndex - rightIndex;
    });
  });
};

export const listEmailMessages = async (
  accountId: number,
  query: MailboxQuery
) => {
  const account = await loadAccountById(accountId);
  ensureActiveAccount(account);

  const folder = normalizeFolder(query.folder);
  const page = clamp(Number(query.page) || 1, 1, 100000);
  const limit = clamp(Number(query.limit) || DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const unreadOnly = toBoolean(query.unreadOnly);
  const starredOnly = toBoolean(query.starredOnly);
  const attachmentsOnly = toBoolean(query.attachmentsOnly);
  const search = toTrimmedString(query.search).toLowerCase();

  return withImapClient(account, async (client) => {
    const mailbox = await openMailbox(client, folder);
    const totalApprox = Number(mailbox.exists ?? 0);

    if (totalApprox <= 0) {
      return {
        messages: [],
        page,
        limit,
        totalApprox: 0,
        hasMore: false,
      };
    }

    const fetchCount = clamp(page * limit * MESSAGE_FETCH_MULTIPLIER, limit, 250);
    const startSeq = Math.max(totalApprox - fetchCount + 1, 1);
    const endSeq = totalApprox;
    const range = `${startSeq}:${endSeq}`;
    const summaries: Array<{
      uid: number;
      messageId: string | null;
      subject: string;
      from: Array<{ name: string; address: string }>;
      to: Array<{ name: string; address: string }>;
      date: string | null;
      preview: string;
      seen: boolean;
      flagged: boolean;
      hasAttachments: boolean;
    }> = [];

    for await (const message of client.fetch(range, {
      uid: true,
      envelope: true,
      flags: true,
      internalDate: true,
      bodyStructure: true,
      source: true,
    } as any)) {
      const sourceBuffer =
        message.source instanceof Buffer
          ? message.source
          : Buffer.from(message.source ?? "");
      const parsedPreview = await parseMessagePreview(sourceBuffer);
      const from = normalizeAddressList(message.envelope?.from);
      const to = normalizeAddressList(message.envelope?.to);
      const subject = String(message.envelope?.subject ?? "(No subject)");
      const preview = parsedPreview.preview;
      const seen = Array.isArray(message.flags) && message.flags.includes("\\Seen");
      const flagged =
        Array.isArray(message.flags) && message.flags.includes("\\Flagged");
      const hasAttachments = Boolean(message.bodyStructure?.childNodes?.length) ||
        parsedPreview.parsed.attachments.length > 0;

      if (unreadOnly && seen) {
        continue;
      }

      if (starredOnly && !flagged) {
        continue;
      }

      if (attachmentsOnly && !hasAttachments) {
        continue;
      }

      if (search) {
        const searchable = [
          subject,
          preview,
          from.map((entry) => `${entry.name} ${entry.address}`).join(" "),
          to.map((entry) => `${entry.name} ${entry.address}`).join(" "),
        ]
          .join(" ")
          .toLowerCase();

        if (!searchable.includes(search)) {
          continue;
        }
      }

      summaries.push({
        uid: Number(message.uid),
        messageId: message.envelope?.messageId
          ? String(message.envelope.messageId)
          : null,
        subject,
        from,
        to,
        date: message.internalDate
          ? new Date(message.internalDate).toISOString()
          : null,
        preview,
        seen,
        flagged,
        hasAttachments,
      });
    }

    const sorted = summaries.sort((left, right) => right.uid - left.uid);
    const offset = (page - 1) * limit;
    const messages = sorted.slice(offset, offset + limit);

    return {
      messages,
      page,
      limit,
      totalApprox,
      hasMore: offset + limit < sorted.length || offset + limit < totalApprox,
    };
  });
};

export const getEmailMessage = async (
  accountId: number,
  uid: number,
  folder: string
) => {
  const account = await loadAccountById(accountId);
  ensureActiveAccount(account);

  return withImapClient(account, async (client) => {
    await openMailbox(client, folder);
    const downloadResponse = await client.download(uid, undefined, {
      uid: true,
    } as any);

    const sourceBuffer = await downloadResponse.content;
    const chunks: Buffer[] = [];

    for await (const chunk of sourceBuffer) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const source = Buffer.concat(chunks);
    const parsed = await simpleParser(source, {
      skipHtmlToText: false,
      skipImageLinks: true,
    });

    const flagsResponse = [];
    for await (const message of client.fetch(String(uid), {
      uid: true,
      flags: true,
      envelope: true,
      internalDate: true,
    } as any)) {
      flagsResponse.push(message);
    }

    const fetchedMessage = flagsResponse[0] as any;
    const sanitizedHtml = sanitizeHtml(String(parsed.html ?? ""));

    return {
      uid,
      messageId: parsed.messageId ?? null,
      references: parsed.references ?? [],
      subject: parsed.subject ?? "(No subject)",
      from: normalizeAddressList(parsed.from),
      to: normalizeAddressList(parsed.to),
      cc: normalizeAddressList(parsed.cc),
      date:
        fetchedMessage?.internalDate != null
          ? new Date(fetchedMessage.internalDate).toISOString()
          : parsed.date
            ? parsed.date.toISOString()
            : null,
      text: String(parsed.text ?? ""),
      html: String(parsed.html ?? ""),
      sanitizedHtml,
      attachments: parsed.attachments.map((attachment: any, index: number) => ({
        filename: attachment.filename ?? `attachment-${index + 1}`,
        contentType: attachment.contentType,
        size: Number(attachment.size ?? 0),
        attachmentId: String(index),
      })),
      seen:
        Array.isArray(fetchedMessage?.flags) &&
        fetchedMessage.flags.includes("\\Seen"),
      flagged:
        Array.isArray(fetchedMessage?.flags) &&
        fetchedMessage.flags.includes("\\Flagged"),
    };
  });
};

export const downloadEmailAttachment = async (
  accountId: number,
  uid: number,
  folder: string,
  attachmentId: string
) => {
  const account = await loadAccountById(accountId);
  ensureActiveAccount(account);
  const attachmentIndex = parseAttachmentId(attachmentId);

  return withImapClient(account, async (client) => {
    await openMailbox(client, folder);
    const downloadResponse = await client.download(uid, undefined, {
      uid: true,
    } as any);

    const sourceBuffer = await downloadResponse.content;
    const chunks: Buffer[] = [];

    for await (const chunk of sourceBuffer) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const parsed = await simpleParser(Buffer.concat(chunks));
    const attachment = parsed.attachments[attachmentIndex] as
      | {
          filename?: string;
          contentType?: string;
          content: Buffer;
        }
      | undefined;

    if (!attachment) {
      throw new Error("Attachment not found.");
    }

    return {
      filename: attachment.filename ?? `attachment-${attachmentIndex + 1}`,
      contentType: attachment.contentType || "application/octet-stream",
      content: attachment.content,
    };
  });
};

export const sendEmailMessage = async (
  accountId: number,
  payload: ComposePayload,
  adminUserId: number
) => {
  const account = await loadAccountById(accountId);
  ensureActiveAccount(account);

  const to = normalizeRecipients(payload.to, "to");
  const cc = normalizeRecipients(payload.cc, "cc");
  const bcc = normalizeRecipients(payload.bcc, "bcc");
  const subject = toTrimmedString(payload.subject);
  const bodyText = String(payload.bodyText ?? "").trim();
  const bodyHtmlRaw = String(payload.bodyHtml ?? "").trim();
  const attachments = normalizeComposeAttachments(payload.attachments);

  if (to.length === 0) {
    throw new Error("At least one recipient is required.");
  }

  if (!subject) {
    throw new Error("Subject is required.");
  }

  if (!bodyText && !bodyHtmlRaw) {
    throw new Error("Email body is required.");
  }

  const transporter = createSmtpTransport(account);

  try {
    const info = await transporter.sendMail({
      from: `"${account.displayName}" <${account.emailAddress}>`,
      to,
      cc: cc.length > 0 ? cc : undefined,
      bcc: bcc.length > 0 ? bcc : undefined,
      subject,
      text: bodyText || undefined,
      html: bodyHtmlRaw ? sanitizeHtml(bodyHtmlRaw) : undefined,
      attachments: attachments.map((attachment) => ({
        filename: attachment.filename,
        contentType: attachment.contentType,
        content: Buffer.from(attachment.contentBase64 ?? "", "base64"),
      })),
    });

    await addSendLog({
      adminUserId,
      accountId,
      direction: "send",
      recipients: [...to, ...cc, ...bcc],
      subject,
      status: "success",
    });

    return {
      success: true,
      messageId: info.messageId,
      message: "Email sent successfully.",
    };
  } catch (error) {
    await addSendLog({
      adminUserId,
      accountId,
      direction: "send",
      recipients: [...to, ...cc, ...bcc],
      subject,
      status: "failed",
      errorMessage: readErrorMessage(error, "Failed to send email."),
    });
    throw error;
  }
};

export const replyToEmailMessage = async (
  accountId: number,
  payload: ReplyPayload,
  adminUserId: number
) => {
  const folder = normalizeFolder(payload.folder);
  const uid = sanitizeMessageUid(payload.uid);
  const headers = await buildReplyHeaders(
    await loadAccountById(accountId).then((account) => account),
    folder,
    uid
  );
  const account = await loadAccountById(accountId);
  ensureActiveAccount(account);

  const to = normalizeRecipients(payload.to, "to");
  const cc = normalizeRecipients(payload.cc, "cc");
  const bcc = normalizeRecipients(payload.bcc, "bcc");
  const subject = toTrimmedString(payload.subject);
  const bodyText = String(payload.bodyText ?? "").trim();
  const bodyHtmlRaw = String(payload.bodyHtml ?? "").trim();

  if (to.length === 0) {
    throw new Error("At least one recipient is required.");
  }

  if (!subject) {
    throw new Error("Subject is required.");
  }

  const transporter = createSmtpTransport(account);

  try {
    const info = await transporter.sendMail({
      from: `"${account.displayName}" <${account.emailAddress}>`,
      to,
      cc: cc.length > 0 ? cc : undefined,
      bcc: bcc.length > 0 ? bcc : undefined,
      subject,
      text: bodyText || undefined,
      html: bodyHtmlRaw ? sanitizeHtml(bodyHtmlRaw) : undefined,
      inReplyTo: headers.inReplyTo,
      references: headers.references.length ? headers.references : undefined,
    });

    await addSendLog({
      adminUserId,
      accountId,
      direction: "reply",
      recipients: [...to, ...cc, ...bcc],
      subject,
      status: "success",
    });

    return {
      success: true,
      messageId: info.messageId,
      message: "Reply sent successfully.",
    };
  } catch (error) {
    await addSendLog({
      adminUserId,
      accountId,
      direction: "reply",
      recipients: [...to, ...cc, ...bcc],
      subject,
      status: "failed",
      errorMessage: readErrorMessage(error, "Failed to send reply."),
    });
    throw error;
  }
};

export const forwardEmailMessage = async (
  accountId: number,
  payload: ForwardPayload,
  adminUserId: number
) => {
  const folder = normalizeFolder(payload.folder);
  const uid = sanitizeMessageUid(payload.uid);
  const account = await loadAccountById(accountId);
  ensureActiveAccount(account);
  const originalMessage = await getEmailMessage(accountId, uid, folder);

  const to = normalizeRecipients(payload.to, "to");
  const cc = normalizeRecipients(payload.cc, "cc");
  const bcc = normalizeRecipients(payload.bcc, "bcc");
  const bodyText = String(payload.bodyText ?? "").trim();
  const bodyHtmlRaw = String(payload.bodyHtml ?? "").trim();
  const includeAttachments = toBoolean(payload.includeAttachments);
  const attachments = includeAttachments
    ? await Promise.all(
        originalMessage.attachments.map(async (attachment: {
          attachmentId: string;
        }) => {
          const downloaded = await downloadEmailAttachment(
            accountId,
            uid,
            folder,
            attachment.attachmentId
          );
          return {
            filename: downloaded.filename,
            contentType: downloaded.contentType,
            content: downloaded.content,
          };
        })
      )
    : [];
  const subject =
    toTrimmedString(payload.subject) ||
    (originalMessage.subject.startsWith("Fwd:")
      ? originalMessage.subject
      : `Fwd: ${originalMessage.subject}`);

  if (to.length === 0) {
    throw new Error("At least one recipient is required.");
  }

  const quotedText = [
    "",
    "---------- Forwarded message ---------",
    `Subject: ${originalMessage.subject}`,
    `From: ${originalMessage.from.map((entry) => entry.address).join(", ")}`,
    `Date: ${originalMessage.date ?? ""}`,
    `To: ${originalMessage.to.map((entry) => entry.address).join(", ")}`,
    "",
    originalMessage.text ?? "",
  ]
    .join("\n")
    .trim();

  const quotedHtml = `
    <hr />
    <p><strong>Forwarded message</strong></p>
    <p><strong>Subject:</strong> ${sanitizeHtml(originalMessage.subject ?? "")}</p>
    <p><strong>From:</strong> ${sanitizeHtml(
      originalMessage.from.map((entry) => entry.address).join(", ")
    )}</p>
    <p><strong>Date:</strong> ${sanitizeHtml(originalMessage.date ?? "")}</p>
    <p><strong>To:</strong> ${sanitizeHtml(
      originalMessage.to.map((entry) => entry.address).join(", ")
    )}</p>
    ${originalMessage.sanitizedHtml || `<pre>${sanitizeHtml(originalMessage.text ?? "")}</pre>`}
  `;

  const transporter = createSmtpTransport(account);

  try {
    const info = await transporter.sendMail({
      from: `"${account.displayName}" <${account.emailAddress}>`,
      to,
      cc: cc.length > 0 ? cc : undefined,
      bcc: bcc.length > 0 ? bcc : undefined,
      subject,
      text: [bodyText, quotedText].filter(Boolean).join("\n\n"),
      html: [bodyHtmlRaw ? sanitizeHtml(bodyHtmlRaw) : "", quotedHtml]
        .filter(Boolean)
        .join(""),
      attachments,
    });

    await addSendLog({
      adminUserId,
      accountId,
      direction: "forward",
      recipients: [...to, ...cc, ...bcc],
      subject,
      status: "success",
    });

    return {
      success: true,
      messageId: info.messageId,
      message: "Email forwarded successfully.",
    };
  } catch (error) {
    await addSendLog({
      adminUserId,
      accountId,
      direction: "forward",
      recipients: [...to, ...cc, ...bcc],
      subject,
      status: "failed",
      errorMessage: readErrorMessage(error, "Failed to forward email."),
    });
    throw error;
  }
};

export const markEmailReadState = async (
  accountId: number,
  uid: number,
  payload: MarkPayload
) => {
  const account = await loadAccountById(accountId);
  ensureActiveAccount(account);
  const folder = normalizeFolder(payload.folder);
  const seen = toBoolean(payload.seen, true);

  await withImapClient(account, async (client) => {
    await openMailbox(client, folder);
    if (seen) {
      await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true } as any);
      return;
    }

    await client.messageFlagsRemove(uid, ["\\Seen"], { uid: true } as any);
  });

  return {
    success: true,
    message: seen ? "Message marked as read." : "Message marked as unread.",
  };
};

export const markEmailFlagState = async (
  accountId: number,
  uid: number,
  payload: MarkPayload
) => {
  const account = await loadAccountById(accountId);
  ensureActiveAccount(account);
  const folder = normalizeFolder(payload.folder);
  const flagged = toBoolean(payload.flagged, true);

  await withImapClient(account, async (client) => {
    await openMailbox(client, folder);
    if (flagged) {
      await client.messageFlagsAdd(uid, ["\\Flagged"], { uid: true } as any);
      return;
    }

    await client.messageFlagsRemove(uid, ["\\Flagged"], { uid: true } as any);
  });

  return {
    success: true,
    message: flagged ? "Message starred." : "Message unstarred.",
  };
};

export const deleteEmailMessage = async (
  accountId: number,
  uid: number,
  folder: string
) => {
  const account = await loadAccountById(accountId);
  ensureActiveAccount(account);

  return withImapClient(account, async (client) => {
    await openMailbox(client, folder);
    const folders = (await client.list()).map((entry: any) => ({
      path: formatFolderName(entry),
      specialUse: entry.specialUse ? String(entry.specialUse) : null,
    }));
    const trashFolder = detectTrashFolder(folders);

    if (trashFolder && trashFolder !== folder) {
      await client.messageMove(uid, trashFolder, { uid: true } as any);
      return {
        success: true,
        message: `Message moved to ${trashFolder}.`,
      };
    }

    await client.messageFlagsAdd(uid, ["\\Deleted"], { uid: true } as any);
    await client.mailboxClose();

    return {
      success: true,
      message: "Message deleted successfully.",
    };
  });
};
