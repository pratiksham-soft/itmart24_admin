import { API_BASE_URL } from "../config/api";
import { getAdminAuthHeaders, readApiError } from "./adminApi";

export type VendorTicketStatus = "Open" | "Resolved" | "Closed";
export type VendorMessageSenderRole = "vendor" | "support";

export type VendorSupportTicketAttachment = {
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  shopifyFileId: string | null;
};

export type VendorSupportProfile = {
  id: string;
  businessName: string;
  email: string;
  contactName: string;
  contactEmail: string;
  phone: string;
  contactPhone: string;
  website: string;
  country: string;
};

export type VendorSupportTicket = {
  id: string;
  ticketCode: string;
  vendorId: string;
  category: string;
  description: string;
  status: VendorTicketStatus;
  attachment: VendorSupportTicketAttachment | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastMessageSenderRole: VendorMessageSenderRole | null;
  vendor: VendorSupportProfile | null;
};

export type VendorSupportTicketMessage = {
  id: string;
  message: string;
  senderRole: VendorMessageSenderRole;
  senderId: string;
  createdAt: string | null;
};

export type UserSupportMessageSenderType = "user" | "support" | string;

export type UserSupportUserProfile = {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  country: string | null;
  companyName: string | null;
  role: string | null;
  status: string | null;
};

export type UserSupportAttachment = {
  id: string;
  messageId: string | null;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  publicUrl: string | null;
  createdAt: string | null;
};

export type UserSupportMessage = {
  id: string;
  senderType: UserSupportMessageSenderType;
  senderId: string | null;
  messageType: string;
  message: string;
  attachmentCount: number;
  createdAt: string | null;
};

export type UserSupportEvent = {
  eventType: string;
  eventTitle: string;
  eventDescription: string | null;
  createdAt: string | null;
};

export type UserSupportTicket = {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  subcategory: string | null;
  source: string;
  status: string;
  priority: string;
  conversationStatus: string;
  relatedProductId: string | null;
  updatedAt: string | null;
  createdAt: string | null;
  lastMessageAt: string | null;
  lastMessageSenderType: UserSupportMessageSenderType | null;
  messageCount: number;
  attachmentCount: number;
  nextResponseDueAt: string | null;
  autoCloseAt: string | null;
  closedReason: string | null;
  description: string;
  user: UserSupportUserProfile | null;
  messages?: UserSupportMessage[];
  attachments?: UserSupportAttachment[];
  events?: UserSupportEvent[];
};

type ApiEnvelope<T> = {
  success: true;
  data: T;
};

const apiGet = async <T>(path: string) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      ...getAdminAuthHeaders(),
    },
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Request failed."));
  }

  return (await response.json()) as ApiEnvelope<T>;
};

const apiSend = async <T>(path: string, method: "POST" | "PATCH", body: Record<string, unknown>) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...getAdminAuthHeaders(),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Request failed."));
  }

  return (await response.json()) as T;
};

export const fetchVendorSupportTickets = async () =>
  (await apiGet<VendorSupportTicket[]>("/api/admin/support/vendor-tickets")).data;

export const fetchVendorSupportTicket = async (ticketId: string) =>
  (
    await apiGet<{
      ticket: VendorSupportTicket;
      messages: VendorSupportTicketMessage[];
    }>(`/api/admin/support/vendor-tickets/${ticketId}`)
  ).data;

export const sendVendorSupportReply = async (ticketId: string, message: string) =>
  apiSend(`/api/admin/support/vendor-tickets/${ticketId}/reply`, "POST", {
    message,
  });

export const updateVendorSupportTicketStatus = async (
  ticketId: string,
  status: VendorTicketStatus
) =>
  apiSend(`/api/admin/support/vendor-tickets/${ticketId}/status`, "PATCH", {
    status,
  });

export const fetchUserSupportTickets = async () =>
  (await apiGet<UserSupportTicket[]>("/api/admin/support/user-tickets")).data;

export const fetchUserSupportTicket = async (ticketId: string) =>
  (
    await apiGet<UserSupportTicket>(
      `/api/admin/support/user-tickets/${ticketId}`
    )
  ).data;

export const sendUserSupportReply = async (ticketId: string, message: string) =>
  apiSend(`/api/admin/support/user-tickets/${ticketId}/reply`, "POST", {
    message,
  });

export const updateUserSupportTicketStatus = async (
  ticketId: string,
  status: "open" | "resolved" | "closed"
) =>
  apiSend(`/api/admin/support/user-tickets/${ticketId}/status`, "PATCH", {
    status,
  });
