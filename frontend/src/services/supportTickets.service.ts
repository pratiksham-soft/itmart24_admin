import { getAuth } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type FirestoreError,
  type Unsubscribe,
} from "firebase/firestore";
import firebaseApp from "../config/firebase";

export type TicketStatus = "Open" | "Resolved" | "Closed";
export type MessageSenderRole = "vendor" | "support";

export type SupportTicketAttachment = {
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  shopifyFileId: string | null;
};

export type SupportTicket = {
  id: string;
  ticketCode: string;
  vendorId: string;
  category: string;
  description: string;
  status: TicketStatus;
  attachment: SupportTicketAttachment | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  lastMessageSenderRole: MessageSenderRole | null;
};

export type SupportTicketMessage = {
  id: string;
  message: string;
  senderRole: MessageSenderRole;
  senderId: string;
  createdAt: Date | null;
};

export type VendorProfileSummary = {
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

const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

const readString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const readTimestamp = (value: unknown) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    const parsed = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
};

const readSenderRole = (value: unknown): MessageSenderRole | null =>
  value === "vendor" || value === "support" ? value : null;

const readStatus = (value: unknown): TicketStatus => {
  if (value === "Resolved" || value === "Closed") {
    return value;
  }

  return "Open";
};

const readAttachment = (value: unknown): SupportTicketAttachment | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const attachment = value as Record<string, unknown>;
  const url = readString(attachment.url);

  if (!url) {
    return null;
  }

  return {
    originalName: readString(attachment.originalName),
    mimeType: readString(attachment.mimeType),
    size:
      typeof attachment.size === "number" && Number.isFinite(attachment.size)
        ? attachment.size
        : 0,
    url,
    shopifyFileId: readString(attachment.shopifyFileId) || null,
  };
};

const mapTicket = (docSnapshot: { id: string; data: () => DocumentData }) => {
  const data = docSnapshot.data();

  return {
    id: docSnapshot.id,
    ticketCode: readString(data.ticketCode) || docSnapshot.id,
    vendorId: readString(data.vendorId),
    category: readString(data.category) || "General",
    description: readString(data.description),
    status: readStatus(data.status),
    attachment: readAttachment(data.attachment),
    createdAt: readTimestamp(data.createdAt),
    updatedAt: readTimestamp(data.updatedAt),
    lastMessageSenderRole: readSenderRole(data.lastMessageSenderRole),
  } satisfies SupportTicket;
};

const mapMessage = (docSnapshot: { id: string; data: () => DocumentData }) => {
  const data = docSnapshot.data();

  return {
    id: docSnapshot.id,
    message: readString(data.message),
    senderRole: readSenderRole(data.senderRole) ?? "vendor",
    senderId: readString(data.senderId),
    createdAt: readTimestamp(data.createdAt),
  } satisfies SupportTicketMessage;
};

export const resolveSupportAgentId = () => {
  const currentUser = auth.currentUser;

  if (currentUser?.uid) {
    return currentUser.uid;
  }

  if (currentUser?.email) {
    return currentUser.email;
  }

  const envSenderId = import.meta.env.VITE_SUPPORT_AGENT_ID?.trim();

  return envSenderId || "admin_support";
};

export const listenToSupportTickets = (
  callback: (tickets: SupportTicket[]) => void,
  onError?: (error: FirestoreError) => void
): Unsubscribe =>
  onSnapshot(
    query(collection(db, "support_tickets"), orderBy("updatedAt", "desc")),
    (snapshot) => {
      callback(snapshot.docs.map(mapTicket));
    },
    (error) => {
      onError?.(error);
    }
  );

export const listenToSupportTicketMessages = (
  ticketDocId: string,
  callback: (messages: SupportTicketMessage[]) => void,
  onError?: (error: FirestoreError) => void
): Unsubscribe =>
  onSnapshot(
    query(
      collection(db, "support_tickets", ticketDocId, "messages"),
      orderBy("createdAt", "asc")
    ),
    (snapshot) => {
      callback(snapshot.docs.map(mapMessage));
    },
    (error) => {
      onError?.(error);
    }
  );

export const loadVendorProfiles = async (
  vendorIds: string[]
): Promise<Record<string, VendorProfileSummary>> => {
  const uniqueVendorIds = [...new Set(vendorIds.map(readString).filter(Boolean))];

  if (uniqueVendorIds.length === 0) {
    return {};
  }

  const entries = await Promise.all(
    uniqueVendorIds.map(async (vendorId) => {
      const snapshot = await getDoc(doc(db, "vendor_profile", vendorId));
      const data = snapshot.exists() ? snapshot.data() : {};

      return [
        vendorId,
        {
          id: vendorId,
          businessName: readString(data.businessName),
          email: readString(data.email),
          contactName: readString(data.contactName),
          contactEmail: readString(data.contactEmail),
          phone: readString(data.phone),
          contactPhone: readString(data.contactPhone),
          website: readString(data.website),
          country: readString(data.country),
        } satisfies VendorProfileSummary,
      ] as const;
    })
  );

  return Object.fromEntries(entries);
};

export const sendSupportTicketMessage = async ({
  ticketDocId,
  message,
  senderId = resolveSupportAgentId(),
}: {
  ticketDocId: string;
  message: string;
  senderId?: string;
}) => {
  const trimmedMessage = message.trim();
  const trimmedSenderId = senderId.trim();

  if (!ticketDocId || !trimmedMessage || !trimmedSenderId) {
    throw new Error("ticketDocId, message, and senderId are required.");
  }

  await addDoc(collection(db, "support_tickets", ticketDocId, "messages"), {
    message: trimmedMessage,
    senderRole: "support",
    senderId: trimmedSenderId,
    createdAt: serverTimestamp(),
  });

  await updateDoc(doc(db, "support_tickets", ticketDocId), {
    updatedAt: serverTimestamp(),
    lastMessageSenderRole: "support",
  });
};

export const updateSupportTicketStatus = async ({
  ticketDocId,
  status,
}: {
  ticketDocId: string;
  status: TicketStatus;
}) => {
  if (!ticketDocId) {
    throw new Error("ticketDocId is required.");
  }

  await updateDoc(doc(db, "support_tickets", ticketDocId), {
    status,
    updatedAt: serverTimestamp(),
  });
};
