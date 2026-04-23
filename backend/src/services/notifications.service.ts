import admin from "firebase-admin";
import { firestore } from "../config/firebase";
import { sendNotificationEmail } from "./email.service";

const NOTIFICATIONS_COLLECTION = "admin_notifications";
const NOTIFICATION_SYNC_STATE_COLLECTION =
  "admin_notification_sync_state";
const NOTIFICATION_SYNC_COOLDOWN_MS = 60 * 1000;

export type NotificationType =
  | "vendor_joined"
  | "product_inserted"
  | "support_ticket_generated";

type NotificationColor = "primary" | "success" | "warning";

type SourceConfig = {
  collectionName: "vendor_profile" | "products" | "support_tickets";
  route: string;
  type: NotificationType;
  icon: "vendor" | "product" | "ticket";
  badgeColor: NotificationColor;
  buildPayload: (
    docId: string,
    data: FirebaseFirestore.DocumentData
  ) => {
    title: string;
    message: string;
    entityLabel: string;
    metadata: Record<string, unknown>;
  };
};

type NotificationDocument = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  entityLabel: string;
  sourceCollection: string;
  sourceId: string;
  relatedRoute: string | null;
  icon: SourceConfig["icon"];
  badgeColor: NotificationColor;
  isRead: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  readAt: string | null;
  eventAt: string | null;
  metadata: Record<string, unknown>;
};

const timestampNow = () => admin.firestore.Timestamp.now();
let lastNotificationsSyncStartedAt = 0;
let notificationsSyncPromise:
  | Promise<{ createdCount: number }>
  | null = null;

const readString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const toIsoString = (value: unknown) => {
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }

  if (
    value &&
    typeof value === "object" &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return new Date(
      (value as { _seconds: number })._seconds * 1000
    ).toISOString();
  }

  return null;
};

const normalizeFirestoreValue = (value: unknown): unknown => {
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeFirestoreValue(item));
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).reduce<
      Record<string, unknown>
    >((accumulator, [key, nestedValue]) => {
      accumulator[key] = normalizeFirestoreValue(nestedValue);
      return accumulator;
    }, {});
  }

  return value;
};

const getNestedString = (
  data: FirebaseFirestore.DocumentData,
  path: string[]
) => {
  let current: unknown = data;

  for (const key of path) {
    if (!current || typeof current !== "object") {
      return "";
    }

    current = (current as Record<string, unknown>)[key];
  }

  return readString(current);
};

const SOURCE_CONFIGS: SourceConfig[] = [
  {
    collectionName: "vendor_profile",
    route: "/vendors",
    type: "vendor_joined",
    icon: "vendor",
    badgeColor: "success",
    buildPayload: (docId, data) => {
      const businessName = readString(data.businessName) || "Unnamed vendor";
      const country = readString(data.country);
      const contactEmail =
        readString(data.contactEmail) || readString(data.email);

      return {
        title: "New vendor joined",
        message: [
          businessName,
          country ? `from ${country}` : "",
          contactEmail ? `(${contactEmail})` : "",
        ]
          .filter(Boolean)
          .join(" "),
        entityLabel: businessName,
        metadata: {
          vendorId: docId,
          businessName,
          country,
          contactEmail,
        },
      };
    },
  },
  {
    collectionName: "products",
    route: "/products/pending",
    type: "product_inserted",
    icon: "product",
    badgeColor: "primary",
    buildPayload: (docId, data) => {
      const productName =
        getNestedString(data, ["vendor", "basic", "productName"]) ||
        getNestedString(data, ["product", "title"]) ||
        "Unnamed product";
      const category =
        getNestedString(data, ["vendor", "basic", "category"]) ||
        getNestedString(data, ["product", "category"]);
      const vendorId = readString(data.vendorId);

      return {
        title: "New product inserted",
        message: [
          productName,
          category ? `in ${category}` : "",
          vendorId ? `for vendor ${vendorId}` : "",
        ]
          .filter(Boolean)
          .join(" "),
        entityLabel: productName,
        metadata: {
          productId: docId,
          productName,
          category,
          vendorId,
        },
      };
    },
  },
  {
    collectionName: "support_tickets",
    route: "/support",
    type: "support_ticket_generated",
    icon: "ticket",
    badgeColor: "warning",
    buildPayload: (docId, data) => {
      const ticketCode = readString(data.ticketCode) || docId;
      const category = readString(data.category) || "General";
      const vendorId = readString(data.vendorId);

      return {
        title: "New support ticket generated",
        message: [
          `Ticket ${ticketCode}`,
          category ? `(${category})` : "",
          vendorId ? `from vendor ${vendorId}` : "",
        ]
          .filter(Boolean)
          .join(" "),
        entityLabel: ticketCode,
        metadata: {
          ticketId: docId,
          ticketCode,
          category,
          vendorId,
        },
      };
    },
  },
];

const mapNotificationDoc = (
  doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
): NotificationDocument => {
  const data = doc.data();

  return {
    id: doc.id,
    type: data.type as NotificationType,
    title: readString(data.title),
    message: readString(data.message),
    entityLabel: readString(data.entityLabel),
    sourceCollection: readString(data.sourceCollection),
    sourceId: readString(data.sourceId),
    relatedRoute: readString(data.relatedRoute) || null,
    icon:
      data.icon === "vendor" ||
      data.icon === "product" ||
      data.icon === "ticket"
        ? data.icon
        : "ticket",
    badgeColor:
      data.badgeColor === "success" ||
      data.badgeColor === "warning" ||
      data.badgeColor === "primary"
        ? data.badgeColor
        : "primary",
    isRead: Boolean(data.isRead),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
    readAt: toIsoString(data.readAt),
    eventAt: toIsoString(data.eventAt),
    metadata:
      (normalizeFirestoreValue(data.metadata) as Record<string, unknown>) ??
      {},
  };
};

const getNotificationDocumentId = (
  type: NotificationType,
  sourceId: string
) => `${type}__${sourceId}`;

const initializeSourceStateIfNeeded = async (
  source: SourceConfig
) => {
  const stateRef = firestore
    .collection(NOTIFICATION_SYNC_STATE_COLLECTION)
    .doc(source.collectionName);
  const stateSnapshot = await stateRef.get();

  if (stateSnapshot.exists) {
    return;
  }

  const now = timestampNow();

  await stateRef.set({
    collectionName: source.collectionName,
    initializedAt: now,
    lastProcessedAt: now,
    lastSyncedAt: now,
  });
};

const syncSourceNotifications = async (
  source: SourceConfig
) => {
  await initializeSourceStateIfNeeded(source);

  const stateRef = firestore
    .collection(NOTIFICATION_SYNC_STATE_COLLECTION)
    .doc(source.collectionName);
  const stateSnapshot = await stateRef.get();
  const lastProcessedAt =
    (stateSnapshot.data()?.lastProcessedAt as
      | admin.firestore.Timestamp
      | undefined) ?? timestampNow();

  const snapshot = await firestore
    .collection(source.collectionName)
    .where("createdAt", ">", lastProcessedAt)
    .orderBy("createdAt", "asc")
    .get();

  let createdCount = 0;
  let newestProcessedAt = lastProcessedAt;

  for (const sourceDoc of snapshot.docs) {
    const data = sourceDoc.data();
    const eventAt =
      data.createdAt instanceof admin.firestore.Timestamp
        ? data.createdAt
        : timestampNow();

    if (eventAt.toMillis() > newestProcessedAt.toMillis()) {
      newestProcessedAt = eventAt;
    }

    const payload = source.buildPayload(sourceDoc.id, data);
    const notificationId = getNotificationDocumentId(
      source.type,
      sourceDoc.id
    );
    const notificationRef = firestore
      .collection(NOTIFICATIONS_COLLECTION)
      .doc(notificationId);

    try {
      await notificationRef.create({
        type: source.type,
        title: payload.title,
        message: payload.message,
        entityLabel: payload.entityLabel,
        sourceCollection: source.collectionName,
        sourceId: sourceDoc.id,
        relatedRoute: source.route,
        icon: source.icon,
        badgeColor: source.badgeColor,
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        readAt: null,
        eventAt,
        metadata: payload.metadata,
      });

      createdCount += 1;

      try {
        await sendNotificationEmail({
          type: source.type,
          title: payload.title,
          message: payload.message,
          occurredAt: eventAt.toDate().toISOString(),
          sourceId: sourceDoc.id,
          relatedRoute: source.route,
        });
      } catch (emailError) {
        console.error(
          `[notifications] Failed to send email for ${notificationId}:`,
          emailError
        );
      }
    } catch (error: any) {
      if (error?.code === 6 || error?.code === "already-exists") {
        continue;
      }

      throw error;
    }
  }

  await stateRef.set(
    {
      lastProcessedAt: newestProcessedAt,
      lastSyncedAt: timestampNow(),
    },
    { merge: true }
  );

  return createdCount;
};

export async function syncNotifications({
  force = false,
}: {
  force?: boolean;
} = {}) {
  const now = Date.now();

  if (
    !force &&
    notificationsSyncPromise &&
    now - lastNotificationsSyncStartedAt < NOTIFICATION_SYNC_COOLDOWN_MS
  ) {
    return notificationsSyncPromise;
  }

  if (
    !force &&
    !notificationsSyncPromise &&
    now - lastNotificationsSyncStartedAt < NOTIFICATION_SYNC_COOLDOWN_MS
  ) {
    return { createdCount: 0 };
  }

  lastNotificationsSyncStartedAt = now;
  notificationsSyncPromise = (async () => {
    let createdCount = 0;

    for (const source of SOURCE_CONFIGS) {
      createdCount += await syncSourceNotifications(source);
    }

    return { createdCount };
  })();

  try {
    return await notificationsSyncPromise;
  } finally {
    notificationsSyncPromise = null;
  }
}

export async function listNotifications(limit = 50) {
  const clampedLimit = Math.max(1, Math.min(limit, 100));
  const snapshot = await firestore
    .collection(NOTIFICATIONS_COLLECTION)
    .orderBy("eventAt", "desc")
    .limit(clampedLimit)
    .get();

  return snapshot.docs.map(mapNotificationDoc);
}

export async function getUnreadNotificationCount() {
  const snapshot = await firestore
    .collection(NOTIFICATIONS_COLLECTION)
    .where("isRead", "==", false)
    .count()
    .get();

  return Number(snapshot.data().count ?? 0);
}

export async function markNotificationAsRead(
  notificationId: string
) {
  const notificationRef = firestore
    .collection(NOTIFICATIONS_COLLECTION)
    .doc(notificationId);
  const snapshot = await notificationRef.get();

  if (!snapshot.exists) {
    return false;
  }

  if (snapshot.data()?.isRead) {
    return true;
  }

  await notificationRef.update({
    isRead: true,
    readAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return true;
}

export async function markAllNotificationsAsRead() {
  const unreadSnapshot = await firestore
    .collection(NOTIFICATIONS_COLLECTION)
    .where("isRead", "==", false)
    .get();

  if (unreadSnapshot.empty) {
    return 0;
  }

  const batch = firestore.batch();

  unreadSnapshot.docs.forEach((doc) => {
    batch.update(doc.ref, {
      isRead: true,
      readAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();

  return unreadSnapshot.size;
}
