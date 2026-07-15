import { API_BASE_URL } from "../config/api";
import { getStoredAdminSessionToken } from "./adminAuth.service";

export type EmailAccount = {
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

export type EmailFolder = {
  path: string;
  name: string;
  specialUse: string | null;
};

export type EmailMessageSummary = {
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
};

export type EmailMessageDetail = {
  uid: number;
  messageId: string | null;
  references?: string[] | string | null;
  subject: string;
  from: Array<{ name: string; address: string }>;
  to: Array<{ name: string; address: string }>;
  cc: Array<{ name: string; address: string }>;
  date: string | null;
  text: string;
  html: string;
  sanitizedHtml: string;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    attachmentId: string;
  }>;
  seen: boolean;
  flagged: boolean;
};

export type EmailAccountPayload = {
  displayName: string;
  emailAddress: string;
  username?: string;
  password?: string;
  imapUsername: string;
  imapPassword?: string;
  smtpUsername: string;
  smtpPassword?: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  isDefault: boolean;
  isActive: boolean;
};

export type ComposeAttachmentPayload = {
  filename: string;
  contentType: string;
  contentBase64: string;
};

export type ComposePayload = {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: ComposeAttachmentPayload[];
};

const getAuthHeaders = () => {
  const token = getStoredAdminSessionToken();

  if (!token) {
    throw new Error("Authentication is required.");
  }

  return {
    Authorization: `Bearer ${token}`,
  };
};

const readApiError = async (response: Response, fallbackMessage: string) => {
  const raw = await response.text();

  try {
    const parsed = JSON.parse(raw) as { message?: string; error?: string };
    return parsed.message || parsed.error || fallbackMessage;
  } catch {
    return raw || fallbackMessage;
  }
};

const fetchJson = async <T>(input: string, init?: RequestInit, fallbackMessage?: string) => {
  const response = await fetch(`${API_BASE_URL}${input}`, {
    ...init,
    headers: {
      ...getAuthHeaders(),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, fallbackMessage ?? "Request failed."));
  }

  return response.json() as Promise<T>;
};

export const fetchEmailAccounts = async () => {
  const result = await fetchJson<{ success: true; accounts: EmailAccount[] }>(
    "/api/admin/email/accounts",
    undefined,
    "Failed to load email accounts."
  );
  return result.accounts;
};

export const createEmailAccount = async (payload: EmailAccountPayload) => {
  const result = await fetchJson<{ success: true; account: EmailAccount }>(
    "/api/admin/email/accounts",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    "Failed to create email account."
  );
  return result.account;
};

export const updateEmailAccount = async (
  id: number,
  payload: EmailAccountPayload
) => {
  const result = await fetchJson<{ success: true; account: EmailAccount }>(
    `/api/admin/email/accounts/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    "Failed to update email account."
  );
  return result.account;
};

export const deleteEmailAccount = async (id: number) => {
  return fetchJson<{ success: true; message: string }>(
    `/api/admin/email/accounts/${id}`,
    {
      method: "DELETE",
    },
    "Failed to disable email account."
  );
};

export const testEmailAccount = async (
  id: number,
  scope: "imap" | "smtp" | "both" = "both"
) => {
  return fetchJson<{
    success: boolean;
    imap: { success: boolean; message: string };
    smtp: { success: boolean; message: string };
  }>(
    `/api/admin/email/accounts/${id}/test`,
    {
      method: "POST",
      body: JSON.stringify({ scope }),
    },
    "Failed to test email account."
  );
};

export const fetchEmailFolders = async (accountId: number) => {
  const result = await fetchJson<{ success: true; folders: EmailFolder[] }>(
    `/api/admin/email/accounts/${accountId}/folders`,
    undefined,
    "Failed to load folders."
  );
  return result.folders;
};

export const fetchEmailMessages = async (
  accountId: number,
  params: Record<string, string | number | boolean | undefined>
) => {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    query.set(key, String(value));
  });

  return fetchJson<{
    messages: EmailMessageSummary[];
    page: number;
    limit: number;
    totalApprox: number;
    hasMore: boolean;
  }>(
    `/api/admin/email/accounts/${accountId}/messages?${query.toString()}`,
    undefined,
    "Failed to load messages."
  );
};

export const fetchEmailMessage = async (
  accountId: number,
  uid: number,
  folder: string
) => {
  const query = new URLSearchParams({ folder });
  return fetchJson<EmailMessageDetail>(
    `/api/admin/email/accounts/${accountId}/messages/${uid}?${query.toString()}`,
    undefined,
    "Failed to load message details."
  );
};

export const sendEmail = async (accountId: number, payload: ComposePayload) => {
  return fetchJson<{ success: true; messageId: string; message: string }>(
    `/api/admin/email/accounts/${accountId}/send`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    "Failed to send email."
  );
};

export const replyToEmail = async (
  accountId: number,
  payload: ComposePayload & { folder: string; uid: number }
) => {
  return fetchJson<{ success: true; messageId: string; message: string }>(
    `/api/admin/email/accounts/${accountId}/reply`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    "Failed to send reply."
  );
};

export const forwardEmail = async (
  accountId: number,
  payload: ComposePayload & { folder: string; uid: number; includeAttachments: boolean }
) => {
  return fetchJson<{ success: true; messageId: string; message: string }>(
    `/api/admin/email/accounts/${accountId}/forward`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    "Failed to forward email."
  );
};

export const markEmailRead = async (
  accountId: number,
  uid: number,
  folder: string,
  seen: boolean
) => {
  return fetchJson<{ success: true; message: string }>(
    `/api/admin/email/accounts/${accountId}/messages/${uid}/mark-read`,
    {
      method: "POST",
      body: JSON.stringify({ folder, seen }),
    },
    "Failed to update read state."
  );
};

export const markEmailFlag = async (
  accountId: number,
  uid: number,
  folder: string,
  flagged: boolean
) => {
  return fetchJson<{ success: true; message: string }>(
    `/api/admin/email/accounts/${accountId}/messages/${uid}/flag`,
    {
      method: "POST",
      body: JSON.stringify({ folder, flagged }),
    },
    "Failed to update star state."
  );
};

export const deleteEmailMessage = async (
  accountId: number,
  uid: number,
  folder: string
) => {
  const query = new URLSearchParams({ folder });
  return fetchJson<{ success: true; message: string }>(
    `/api/admin/email/accounts/${accountId}/messages/${uid}?${query.toString()}`,
    {
      method: "DELETE",
    },
    "Failed to delete message."
  );
};

export const downloadEmailAttachment = async (
  accountId: number,
  uid: number,
  folder: string,
  attachmentId: string
) => {
  const response = await fetch(
    `${API_BASE_URL}/api/admin/email/accounts/${accountId}/messages/${uid}/attachments/${attachmentId}?${new URLSearchParams({ folder }).toString()}`,
    {
      headers: getAuthHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Failed to download attachment.")
    );
  }

  return {
    blob: await response.blob(),
    filename:
      response.headers
        .get("content-disposition")
        ?.match(/filename="?([^"]+)"?/)?.[1] ?? "attachment",
  };
};
