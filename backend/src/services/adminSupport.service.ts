import admin from "firebase-admin";
import { firestore } from "../config/firebase";
import {
  getUserPortalPool,
  normalizeDate,
} from "./userPortalUsers.service";

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

export type UserSupportTicketStatus =
  | "open"
  | "resolved"
  | "closed"
  | "waiting_for_response";
export type UserSupportConversationStatus =
  | "awaiting_support"
  | "awaiting_user"
  | "resolved"
  | "closed";
export type UserSupportMessageSenderType = "user" | "support";

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
  status: UserSupportTicketStatus | string;
  priority: string;
  conversationStatus: UserSupportConversationStatus | string;
  relatedProductId: string | null;
  updatedAt: string | null;
  createdAt: string | null;
  lastMessageAt: string | null;
  lastMessageSenderType: UserSupportMessageSenderType | string | null;
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

const readString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const readNullableString = (value: unknown) => {
  const normalized = readString(value);
  return normalized || null;
};

const readNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeVendorTimestamp = (value: unknown) => {
  if (!value) {
    return null;
  }

  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    const parsed = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  return null;
};

const normalizeVendorStatus = (value: unknown): VendorTicketStatus => {
  if (value === "Resolved" || value === "Closed") {
    return value;
  }

  return "Open";
};

const normalizeVendorSenderRole = (
  value: unknown
): VendorMessageSenderRole | null =>
  value === "vendor" || value === "support" ? value : null;

const normalizeVendorAttachment = (
  value: unknown
): VendorSupportTicketAttachment | null => {
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
    size: readNumber(attachment.size, 0),
    url,
    shopifyFileId: readNullableString(attachment.shopifyFileId),
  };
};

const mapVendorProfile = (
  vendorId: string,
  data: Record<string, unknown> | undefined
): VendorSupportProfile => ({
  id: vendorId,
  businessName: readString(data?.businessName),
  email: readString(data?.email),
  contactName: readString(data?.contactName),
  contactEmail: readString(data?.contactEmail),
  phone: readString(data?.phone),
  contactPhone: readString(data?.contactPhone),
  website: readString(data?.website),
  country: readString(data?.country),
});

const mapVendorTicket = (
  docSnapshot: admin.firestore.QueryDocumentSnapshot,
  vendor: VendorSupportProfile | null
): VendorSupportTicket => {
  const data = docSnapshot.data();

  return {
    id: docSnapshot.id,
    ticketCode: readString(data.ticketCode) || docSnapshot.id,
    vendorId: readString(data.vendorId),
    category: readString(data.category) || "General",
    description: readString(data.description),
    status: normalizeVendorStatus(data.status),
    attachment: normalizeVendorAttachment(data.attachment),
    createdAt: normalizeVendorTimestamp(data.createdAt),
    updatedAt: normalizeVendorTimestamp(data.updatedAt),
    lastMessageSenderRole: normalizeVendorSenderRole(data.lastMessageSenderRole),
    vendor,
  };
};

const mapVendorMessage = (
  docSnapshot: admin.firestore.QueryDocumentSnapshot
): VendorSupportTicketMessage => {
  const data = docSnapshot.data();

  return {
    id: docSnapshot.id,
    message: readString(data.message),
    senderRole: normalizeVendorSenderRole(data.senderRole) ?? "vendor",
    senderId: readString(data.senderId),
    createdAt: normalizeVendorTimestamp(data.createdAt),
  };
};

const fetchVendorProfiles = async (vendorIds: string[]) => {
  const uniqueVendorIds = [...new Set(vendorIds.map(readString).filter(Boolean))];
  const entries = await Promise.all(
    uniqueVendorIds.map(async (vendorId) => {
      const snapshot = await firestore.collection("vendor_profile").doc(vendorId).get();
      return [
        vendorId,
        mapVendorProfile(
          vendorId,
          snapshot.exists ? (snapshot.data() as Record<string, unknown>) : undefined
        ),
      ] as const;
    })
  );

  return Object.fromEntries(entries);
};

export const listVendorSupportTickets = async () => {
  const snapshot = await firestore
    .collection("support_tickets")
    .orderBy("updatedAt", "desc")
    .get();

  const vendorProfiles = await fetchVendorProfiles(
    snapshot.docs.map((docSnapshot) => readString(docSnapshot.data().vendorId))
  );

  return snapshot.docs.map((docSnapshot) =>
    mapVendorTicket(
      docSnapshot,
      vendorProfiles[readString(docSnapshot.data().vendorId)] ?? null
    )
  );
};

export const getVendorSupportTicket = async (ticketId: string) => {
  const ticketSnapshot = await firestore.collection("support_tickets").doc(ticketId).get();

  if (!ticketSnapshot.exists) {
    throw new Error("Vendor support ticket not found.");
  }

  const ticketData = ticketSnapshot.data() as Record<string, unknown>;
  const vendorId = readString(ticketData.vendorId);
  const vendorSnapshot = vendorId
    ? await firestore.collection("vendor_profile").doc(vendorId).get()
    : null;

  const vendor = vendorId
    ? mapVendorProfile(
        vendorId,
        vendorSnapshot?.exists
          ? (vendorSnapshot.data() as Record<string, unknown>)
          : undefined
      )
    : null;

  const messagesSnapshot = await firestore
    .collection("support_tickets")
    .doc(ticketId)
    .collection("messages")
    .orderBy("createdAt", "asc")
    .get();

  return {
    ticket: mapVendorTicket(
      ticketSnapshot as admin.firestore.QueryDocumentSnapshot,
      vendor
    ),
    messages: messagesSnapshot.docs.map(mapVendorMessage),
  };
};

export const sendVendorSupportReply = async (input: {
  ticketId: string;
  message: string;
  senderId: string;
}) => {
  const ticketId = readString(input.ticketId);
  const message = readString(input.message);
  const senderId = readString(input.senderId);

  if (!ticketId || !message || !senderId) {
    throw new Error("ticketId, message, and senderId are required.");
  }

  await firestore.collection("support_tickets").doc(ticketId).collection("messages").add({
    message,
    senderRole: "support",
    senderId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await firestore.collection("support_tickets").doc(ticketId).update({
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastMessageSenderRole: "support",
    status: "Open",
  });
};

export const updateVendorSupportTicketStatus = async (input: {
  ticketId: string;
  status: VendorTicketStatus;
}) => {
  const ticketId = readString(input.ticketId);
  if (!ticketId) {
    throw new Error("ticketId is required.");
  }

  await firestore.collection("support_tickets").doc(ticketId).update({
    status: input.status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
};

type UserSupportTicketRow = Record<string, unknown>;

const mapUserSupportUser = (row: UserSupportTicketRow): UserSupportUserProfile | null => {
  const id = readNullableString(row.user_id);

  if (!id) {
    return null;
  }

  return {
    id,
    fullName: readNullableString(row.full_name),
    email: readString(row.email),
    phone: readNullableString(row.phone),
    country: readNullableString(row.country),
    companyName: readNullableString(row.company_name),
    role: readNullableString(row.user_role),
    status: readNullableString(row.user_status),
  };
};

const mapUserSupportTicketSummary = (row: UserSupportTicketRow): UserSupportTicket => ({
  id: readString(row.id),
  ticketNumber: readString(row.ticket_number),
  subject: readString(row.subject),
  category: readString(row.category),
  subcategory: readNullableString(row.subcategory),
  source: readString(row.source) || "portal",
  status: readString(row.status) || "open",
  priority: readString(row.priority) || "medium",
  conversationStatus: readString(row.conversation_status) || "awaiting_support",
  relatedProductId: readNullableString(row.related_product_id),
  updatedAt: normalizeDate(row.updated_at as Date | string | null),
  createdAt: normalizeDate(row.created_at as Date | string | null),
  lastMessageAt: normalizeDate(row.last_message_at as Date | string | null),
  lastMessageSenderType: readNullableString(row.last_message_sender_type),
  messageCount: readNumber(row.message_count, 0),
  attachmentCount: readNumber(row.attachment_count, 0),
  nextResponseDueAt: normalizeDate(row.next_response_due_at as Date | string | null),
  autoCloseAt: normalizeDate(row.auto_close_at as Date | string | null),
  closedReason: readNullableString(row.closed_reason),
  description: readString(row.description),
  user: mapUserSupportUser(row),
});

const mapUserSupportMessage = (row: UserSupportTicketRow): UserSupportMessage => ({
  id: readString(row.id),
  senderType: readString(row.sender_type) === "support" ? "support" : "user",
  senderId: readNullableString(row.sender_id),
  messageType: readString(row.message_type) || "message",
  message: readString(row.message),
  attachmentCount: readNumber(row.attachment_count, 0),
  createdAt: normalizeDate(row.created_at as Date | string | null),
});

const mapUserSupportAttachment = (
  row: UserSupportTicketRow
): UserSupportAttachment => ({
  id: readString(row.id),
  messageId: readNullableString(row.message_id),
  fileName: readString(row.file_name),
  mimeType: readString(row.mime_type),
  fileSizeBytes: readNumber(row.file_size_bytes, 0),
  publicUrl: readNullableString(row.public_url),
  createdAt: normalizeDate(row.created_at as Date | string | null),
});

const mapUserSupportEvent = (row: UserSupportTicketRow): UserSupportEvent => ({
  eventType: readString(row.event_type),
  eventTitle: readString(row.event_title),
  eventDescription: readNullableString(row.event_description),
  createdAt: normalizeDate(row.created_at as Date | string | null),
});

export const listUserSupportTickets = async () => {
  const pool = getUserPortalPool();
  const result = await pool.query(
    `
      SELECT
        st.*,
        u.full_name,
        u.email,
        u.phone,
        u.country,
        u.company_name,
        u.role AS user_role,
        u.status AS user_status,
        COALESCE(first_message.message, '') AS description
      FROM support_tickets st
      INNER JOIN users u
        ON u.id = st.user_id
      LEFT JOIN LATERAL (
        SELECT message
        FROM support_ticket_messages
        WHERE ticket_id = st.id
          AND sender_type = 'user'
          AND COALESCE(is_internal, FALSE) = FALSE
        ORDER BY created_at ASC
        LIMIT 1
      ) first_message ON TRUE
      ORDER BY st.updated_at DESC, st.created_at DESC
    `
  );

  return result.rows.map((row: any) =>
    mapUserSupportTicketSummary(row as UserSupportTicketRow)
  );
};

export const getUserSupportTicket = async (ticketId: string) => {
  const normalizedTicketId = readString(ticketId);
  if (!normalizedTicketId) {
    throw new Error("ticketId is required.");
  }

  const pool = getUserPortalPool();
  const ticketResult = await pool.query(
    `
      SELECT
        st.*,
        u.full_name,
        u.email,
        u.phone,
        u.country,
        u.company_name,
        u.role AS user_role,
        u.status AS user_status,
        COALESCE(first_message.message, '') AS description
      FROM support_tickets st
      INNER JOIN users u
        ON u.id = st.user_id
      LEFT JOIN LATERAL (
        SELECT message
        FROM support_ticket_messages
        WHERE ticket_id = st.id
          AND sender_type = 'user'
          AND COALESCE(is_internal, FALSE) = FALSE
        ORDER BY created_at ASC
        LIMIT 1
      ) first_message ON TRUE
      WHERE st.id = $1
      LIMIT 1
    `,
    [normalizedTicketId]
  );

  const ticketRow = ticketResult.rows[0] as UserSupportTicketRow | undefined;
  if (!ticketRow) {
    throw new Error("User support ticket not found.");
  }

  const [messagesResult, attachmentsResult, eventsResult] = await Promise.all([
    pool.query(
      `
        SELECT *
        FROM support_ticket_messages
        WHERE ticket_id = $1
          AND COALESCE(is_internal, FALSE) = FALSE
        ORDER BY created_at ASC
      `,
      [normalizedTicketId]
    ),
    pool.query(
      `
        SELECT *
        FROM support_ticket_attachments
        WHERE ticket_id = $1
        ORDER BY created_at ASC
      `,
      [normalizedTicketId]
    ),
    pool.query(
      `
        SELECT *
        FROM support_ticket_events
        WHERE ticket_id = $1
        ORDER BY created_at ASC
      `,
      [normalizedTicketId]
    ),
  ]);

  return {
    ...mapUserSupportTicketSummary(ticketRow),
    messages: messagesResult.rows.map((row: any) =>
      mapUserSupportMessage(row as UserSupportTicketRow)
    ),
    attachments: attachmentsResult.rows.map((row: any) =>
      mapUserSupportAttachment(row as UserSupportTicketRow)
    ),
    events: eventsResult.rows.map((row: any) =>
      mapUserSupportEvent(row as UserSupportTicketRow)
    ),
  };
};

export const sendUserSupportReply = async (input: {
  ticketId: string;
  message: string;
  senderId: string;
}) => {
  const ticketId = readString(input.ticketId);
  const message = readString(input.message);
  const senderId = readString(input.senderId);

  if (!ticketId || !message || !senderId) {
    throw new Error("ticketId, message, and senderId are required.");
  }

  const pool = getUserPortalPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existingResult = await client.query(
      `
        SELECT ticket_number
        FROM support_tickets
        WHERE id = $1
        LIMIT 1
      `,
      [ticketId]
    );

    if ((existingResult.rowCount ?? 0) === 0) {
      throw new Error("User support ticket not found.");
    }

    const messageResult = await client.query(
      `
        INSERT INTO support_ticket_messages (
          id,
          ticket_id,
          sender_type,
          sender_id,
          message
        )
        VALUES (gen_random_uuid(), $1, 'support', $2, $3)
        RETURNING id
      `,
      [ticketId, senderId, message]
    );

    await client.query(
      `
        UPDATE support_tickets
        SET
          status = 'open',
          conversation_status = 'awaiting_user',
          updated_at = NOW(),
          last_message_at = NOW(),
          last_message_sender_type = 'support',
          last_support_reply_at = NOW(),
          auto_close_at = NOW() + INTERVAL '7 days',
          message_count = COALESCE(message_count, 0) + 1
        WHERE id = $1
      `,
      [ticketId]
    );

    await client.query(
      `
        INSERT INTO support_ticket_events (
          id,
          ticket_id,
          actor_type,
          actor_id,
          event_type,
          event_title,
          event_description,
          metadata
        )
        VALUES (
          gen_random_uuid(),
          $1,
          'support',
          $2,
          'support_replied',
          'Support replied',
          'The support team sent a reply.',
          $3::jsonb
        )
      `,
      [
        ticketId,
        senderId,
        JSON.stringify({
          messageId: readNullableString(messageResult.rows[0]?.id),
        }),
      ]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

export const updateUserSupportTicketStatus = async (input: {
  ticketId: string;
  status: "open" | "resolved" | "closed";
  actorId: string;
}) => {
  const ticketId = readString(input.ticketId);
  const actorId = readString(input.actorId);

  if (!ticketId || !actorId) {
    throw new Error("ticketId and actorId are required.");
  }

  const normalizedStatus = input.status;
  const conversationStatus =
    normalizedStatus === "resolved"
      ? "resolved"
      : normalizedStatus === "closed"
        ? "closed"
        : "awaiting_support";

  const pool = getUserPortalPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
        UPDATE support_tickets
        SET
          status = $2,
          conversation_status = $3,
          updated_at = NOW(),
          resolved_at = CASE WHEN $2 = 'resolved' THEN NOW() ELSE resolved_at END,
          closed_at = CASE WHEN $2 = 'closed' THEN NOW() ELSE NULL END,
          closed_reason = CASE
            WHEN $2 = 'closed' THEN COALESCE(closed_reason, 'Closed by support team')
            WHEN $2 = 'resolved' THEN NULL
            ELSE NULL
          END,
          auto_close_at = CASE WHEN $2 IN ('resolved', 'closed') THEN NULL ELSE auto_close_at END
        WHERE id = $1
        RETURNING ticket_number
      `,
      [ticketId, normalizedStatus, conversationStatus]
    );

    if ((result.rowCount ?? 0) === 0) {
      throw new Error("User support ticket not found.");
    }

    await client.query(
      `
        INSERT INTO support_ticket_events (
          id,
          ticket_id,
          actor_type,
          actor_id,
          event_type,
          event_title,
          event_description,
          metadata
        )
        VALUES (
          gen_random_uuid(),
          $1,
          'support',
          $2,
          $3,
          $4,
          $5,
          $6::jsonb
        )
      `,
      [
        ticketId,
        actorId,
        `ticket_${normalizedStatus}`,
        normalizedStatus === "closed" ? "Ticket closed" : "Ticket resolved",
        normalizedStatus === "closed"
          ? "The support team closed the ticket."
          : "The support team resolved the ticket.",
        JSON.stringify({
          status: normalizedStatus,
          conversationStatus,
        }),
      ]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};
