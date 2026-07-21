"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPushStatus = exports.getPushPublicKey = exports.startNotificationsSyncLoop = exports.emitNotificationUpdate = exports.registerNotificationStream = exports.archiveNotification = exports.markAllNotificationsAsRead = exports.markNotificationAsRead = exports.getUnreadNotificationCount = exports.listNotifications = exports.disablePushSubscriptionForEndpoint = exports.upsertPushSubscription = exports.listPushSubscriptionsForAdmin = exports.listNotificationPreferences = exports.updateNotificationPreferences = void 0;
exports.syncNotifications = syncNotifications;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const firebase_1 = require("../config/firebase");
const analyticsPostgres_service_1 = require("./analyticsPostgres.service");
const userPortalUsers_service_1 = require("./userPortalUsers.service");
const adminNotifications_helpers_1 = require("./adminNotifications.helpers");
const webPush_service_1 = require("./webPush.service");
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const NOTIFICATION_SYNC_INTERVAL_MS = 20 * 1000;
const firestoreTimestampNow = () => firebase_admin_1.default.firestore.Timestamp.now();
let syncPromise = null;
let syncIntervalHandle = null;
const sseClients = new Map();
const GENERATED_GUEST_REPORT_EVENT_NAMES = new Set([
    "SEOHealthReportGenerated",
    "AIAnalysisReportGenerated",
    "CompetitorReportGenerated",
]);
const PAYMENT_FAILURE_STATUSES = new Set([
    "failed",
    "payment_failed",
    "cancelled",
]);
const toIsoString = (value) => {
    if (!value) {
        return null;
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (value instanceof firebase_admin_1.default.firestore.Timestamp) {
        return value.toDate().toISOString();
    }
    if (typeof value === "object" &&
        value &&
        "_seconds" in value &&
        typeof value._seconds === "number") {
        return new Date(Number(value._seconds) * 1000).toISOString();
    }
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};
const toDate = (value) => {
    const isoString = toIsoString(value);
    return isoString ? new Date(isoString) : null;
};
const readString = (value) => String(value ?? "").trim();
const readNullableString = (value) => {
    const normalized = readString(value);
    return normalized || null;
};
const readNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const readPgJson = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }
    return value;
};
const getNotificationPreferencesDefaults = () => ({
    vendors: true,
    products: true,
    users: true,
    guest_reports: true,
    payments: true,
});
const getCategoryLabel = (category) => {
    switch (category) {
        case "vendors":
            return "vendors";
        case "products":
            return "products";
        case "users":
            return "users";
        case "guest_reports":
            return "guest reports";
        case "payments":
            return "payments";
        default:
            return "notifications";
    }
};
const formatCurrency = (amount, currencyCode) => {
    try {
        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: currencyCode || "INR",
            maximumFractionDigits: 2,
        }).format(amount);
    }
    catch {
        return `${currencyCode || "INR"} ${amount.toFixed(2)}`;
    }
};
const mapNotificationRow = (row) => ({
    id: String(row.recipient_id),
    notificationId: String(row.notification_id),
    adminId: Number(row.admin_id),
    type: row.type,
    category: row.category,
    title: String(row.title),
    message: String(row.message),
    severity: row.severity,
    targetUrl: String(row.target_url),
    entityType: readNullableString(row.entity_type),
    entityId: readNullableString(row.entity_id),
    eventKey: String(row.event_key),
    metadata: (0, adminNotifications_helpers_1.sanitizeNotificationMetadata)(row.metadata),
    isRead: Boolean(row.is_read),
    isArchived: Boolean(row.is_archived),
    readAt: row.read_at,
    archivedAt: row.archived_at,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    occurredAt: String(row.occurred_at),
});
async function withAnalyticsTransaction(callback) {
    const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await callback(client);
        await client.query("COMMIT");
        return result;
    }
    catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
    }
    finally {
        client.release();
    }
}
const getSyncState = async (key) => {
    const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
    const result = await pool.query(`
      SELECT cursor_value
      FROM admin_notification_sync_state
      WHERE source_key = $1
      LIMIT 1
    `, [key]);
    return readNullableString(result.rows[0]?.cursor_value);
};
const setSyncState = async (client, key, value) => {
    await client.query(`
      INSERT INTO admin_notification_sync_state (
        source_key,
        cursor_value,
        created_at,
        updated_at
      )
      VALUES ($1, $2, NOW(), NOW())
      ON CONFLICT (source_key)
      DO UPDATE
      SET
        cursor_value = EXCLUDED.cursor_value,
        updated_at = NOW()
    `, [key, value]);
};
const createNotificationEvent = async (input) => {
    const sanitizedTargetUrl = (0, adminNotifications_helpers_1.sanitizeTargetUrl)(input.targetUrl);
    const sanitizedMetadata = (0, adminNotifications_helpers_1.sanitizeNotificationMetadata)(input.metadata ?? {});
    return withAnalyticsTransaction(async (client) => {
        const eventInsertResult = await client.query(`
        INSERT INTO admin_notification_events (
          type,
          category,
          title,
          message,
          severity,
          target_url,
          entity_type,
          entity_id,
          event_key,
          metadata,
          occurred_at,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb,
          COALESCE($11::timestamp, NOW()),
          NOW(),
          NOW()
        )
        ON CONFLICT (event_key)
        DO NOTHING
        RETURNING id
      `, [
            input.type,
            input.category,
            input.title,
            input.message,
            input.severity,
            sanitizedTargetUrl,
            input.entityType,
            input.entityId,
            input.eventKey,
            JSON.stringify(sanitizedMetadata),
            input.occurredAt ? input.occurredAt.toISOString() : null,
        ]);
        const insertedEventId = readNullableString(eventInsertResult.rows[0]?.id);
        if (!insertedEventId) {
            return {
                created: false,
                recipientAdminIds: [],
                category: input.category,
                title: input.title,
                targetUrl: sanitizedTargetUrl,
            };
        }
        const recipientsInsertResult = await client.query(`
        INSERT INTO admin_notification_recipients (
          notification_id,
          admin_id,
          created_at,
          updated_at
        )
        SELECT $1, a.id, NOW(), NOW()
        FROM admins a
        WHERE LOWER(COALESCE(a.status, 'active')) = 'active'
        RETURNING admin_id
      `, [insertedEventId]);
        return {
            created: true,
            recipientAdminIds: recipientsInsertResult.rows.map((row) => Number(row.admin_id)),
            eventId: insertedEventId,
            category: input.category,
            title: input.title,
            targetUrl: sanitizedTargetUrl,
        };
    });
};
const getNotificationPreferences = async (adminId) => {
    const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
    const result = await pool.query(`
      SELECT preferences
      FROM admin_notification_preferences
      WHERE admin_id = $1
      LIMIT 1
    `, [adminId]);
    const defaults = getNotificationPreferencesDefaults();
    const raw = readPgJson(result.rows[0]?.preferences);
    return adminNotifications_helpers_1.ADMIN_NOTIFICATION_CATEGORIES.reduce((accumulator, category) => {
        accumulator[category] =
            typeof raw[category] === "boolean"
                ? Boolean(raw[category])
                : defaults[category];
        return accumulator;
    }, { ...defaults });
};
const updateNotificationPreferences = async (adminId, input) => {
    const nextPreferences = adminNotifications_helpers_1.ADMIN_NOTIFICATION_CATEGORIES.reduce((accumulator, category) => {
        accumulator[category] =
            typeof input[category] === "boolean"
                ? Boolean(input[category])
                : getNotificationPreferencesDefaults()[category];
        return accumulator;
    }, getNotificationPreferencesDefaults());
    const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
    await pool.query(`
      INSERT INTO admin_notification_preferences (
        admin_id,
        preferences,
        created_at,
        updated_at
      )
      VALUES ($1, $2::jsonb, NOW(), NOW())
      ON CONFLICT (admin_id)
      DO UPDATE
      SET
        preferences = EXCLUDED.preferences,
        updated_at = NOW()
    `, [adminId, JSON.stringify(nextPreferences)]);
    (0, exports.emitNotificationUpdate)(adminId, "preferences-updated");
    return nextPreferences;
};
exports.updateNotificationPreferences = updateNotificationPreferences;
const listNotificationPreferences = async (adminId) => getNotificationPreferences(adminId);
exports.listNotificationPreferences = listNotificationPreferences;
const listActivePushSubscriptions = async (adminId) => {
    const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
    const result = await pool.query(`
      SELECT
        id,
        admin_id,
        endpoint,
        p256dh_key,
        auth_key,
        user_agent,
        device_label,
        is_active,
        created_at,
        updated_at
      FROM admin_push_subscriptions
      WHERE admin_id = $1
        AND is_active = TRUE
      ORDER BY updated_at DESC
    `, [adminId]);
    return result.rows.map((row) => ({
        id: String(row.id),
        adminId: Number(row.admin_id),
        endpoint: String(row.endpoint),
        p256dhKey: String(row.p256dh_key),
        authKey: String(row.auth_key),
        userAgent: readNullableString(row.user_agent),
        deviceLabel: readNullableString(row.device_label),
        isActive: Boolean(row.is_active),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
    }));
};
const deactivatePushSubscriptionById = async (subscriptionId) => {
    const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
    await pool.query(`
      UPDATE admin_push_subscriptions
      SET
        is_active = FALSE,
        updated_at = NOW()
      WHERE id = $1
    `, [subscriptionId]);
};
const listPushSubscriptionsForAdmin = async (adminId) => listActivePushSubscriptions(adminId);
exports.listPushSubscriptionsForAdmin = listPushSubscriptionsForAdmin;
const upsertPushSubscription = async (input) => {
    const endpoint = readString(input.subscription.endpoint);
    const p256dhKey = readString(input.subscription.keys?.p256dh);
    const authKey = readString(input.subscription.keys?.auth);
    if (!endpoint || !p256dhKey || !authKey) {
        throw new Error("A valid push subscription is required.");
    }
    const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
    const result = await pool.query(`
      INSERT INTO admin_push_subscriptions (
        admin_id,
        endpoint,
        p256dh_key,
        auth_key,
        user_agent,
        device_label,
        expiration_time,
        is_active,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, TRUE, NOW(), NOW()
      )
      ON CONFLICT (admin_id, endpoint)
      DO UPDATE
      SET
        p256dh_key = EXCLUDED.p256dh_key,
        auth_key = EXCLUDED.auth_key,
        user_agent = EXCLUDED.user_agent,
        device_label = EXCLUDED.device_label,
        expiration_time = EXCLUDED.expiration_time,
        is_active = TRUE,
        updated_at = NOW()
      RETURNING id
    `, [
        input.adminId,
        endpoint,
        p256dhKey,
        authKey,
        readNullableString(input.userAgent),
        readNullableString(input.deviceLabel),
        input.subscription.expirationTime ?? null,
    ]);
    (0, exports.emitNotificationUpdate)(input.adminId, "push-subscription-updated");
    return {
        id: String(result.rows[0]?.id ?? ""),
        endpoint,
    };
};
exports.upsertPushSubscription = upsertPushSubscription;
const disablePushSubscriptionForEndpoint = async (adminId, endpoint) => {
    const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
    const result = await pool.query(`
      UPDATE admin_push_subscriptions
      SET
        is_active = FALSE,
        updated_at = NOW()
      WHERE admin_id = $1
        AND endpoint = $2
      RETURNING id
    `, [adminId, endpoint]);
    (0, exports.emitNotificationUpdate)(adminId, "push-subscription-updated");
    return result.rowCount > 0;
};
exports.disablePushSubscriptionForEndpoint = disablePushSubscriptionForEndpoint;
const sendPushForNotification = async (input) => {
    if (!(0, webPush_service_1.isWebPushConfigured)() || input.recipientAdminIds.length === 0) {
        return;
    }
    await Promise.allSettled(input.recipientAdminIds.map(async (adminId) => {
        const preferences = await getNotificationPreferences(adminId);
        if (!preferences[input.category]) {
            return;
        }
        const subscriptions = await listActivePushSubscriptions(adminId);
        await Promise.allSettled(subscriptions.map(async (subscription) => {
            const result = await (0, webPush_service_1.sendWebPushNotification)({
                endpoint: subscription.endpoint,
                keys: {
                    p256dh: subscription.p256dhKey,
                    auth: subscription.authKey,
                },
            }, {
                title: input.title,
                body: (0, adminNotifications_helpers_1.buildPushMessageForCategory)(input.category),
                targetUrl: (0, adminNotifications_helpers_1.sanitizeTargetUrl)(input.targetUrl),
            });
            if (result.shouldDeactivate) {
                await deactivatePushSubscriptionById(subscription.id);
            }
        }));
    }));
};
const listNotifications = async (adminId, filters = {}) => {
    await syncNotifications();
    const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
    const pageSize = Math.max(1, Math.min(Number(filters.pageSize ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE));
    const page = Math.max(1, Number(filters.page ?? 1));
    const values = [adminId];
    const conditions = ["r.admin_id = $1"];
    if (filters.archived === false) {
        conditions.push("r.archived_at IS NULL");
    }
    else if (filters.archived === true) {
        conditions.push("r.archived_at IS NOT NULL");
    }
    if (filters.category) {
        values.push(filters.category);
        conditions.push(`e.category = $${values.length}`);
    }
    if (filters.type) {
        values.push(filters.type);
        conditions.push(`e.type = $${values.length}`);
    }
    if (filters.severity) {
        values.push(filters.severity);
        conditions.push(`e.severity = $${values.length}`);
    }
    if (filters.readStatus === "read") {
        conditions.push("r.read_at IS NOT NULL");
    }
    else if (filters.readStatus === "unread") {
        conditions.push("r.read_at IS NULL");
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    values.push(pageSize);
    values.push((page - 1) * pageSize);
    const itemsResult = await pool.query(`
      SELECT
        r.id AS recipient_id,
        r.notification_id,
        r.admin_id,
        (r.read_at IS NOT NULL) AS is_read,
        (r.archived_at IS NOT NULL) AS is_archived,
        r.read_at,
        r.archived_at,
        r.created_at,
        r.updated_at,
        e.type,
        e.category,
        e.title,
        e.message,
        e.severity,
        e.target_url,
        e.entity_type,
        e.entity_id,
        e.event_key,
        e.metadata,
        e.created_at AS event_created_at,
        e.updated_at AS event_updated_at,
        e.occurred_at
      FROM admin_notification_recipients r
      INNER JOIN admin_notification_events e
        ON e.id = r.notification_id
      ${whereClause}
      ORDER BY e.occurred_at DESC, e.created_at DESC, r.id DESC
      LIMIT $${values.length - 1}
      OFFSET $${values.length}
    `, values);
    const countValues = values.slice(0, values.length - 2);
    const countResult = await pool.query(`
      SELECT COUNT(*)::int AS total
      FROM admin_notification_recipients r
      INNER JOIN admin_notification_events e
        ON e.id = r.notification_id
      ${whereClause}
    `, countValues);
    return {
        items: itemsResult.rows.map((row) => mapNotificationRow(row)),
        total: Number(countResult.rows[0]?.total ?? 0),
        page,
        pageSize,
    };
};
exports.listNotifications = listNotifications;
const getUnreadNotificationCount = async (adminId) => {
    await syncNotifications();
    const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
    const result = await pool.query(`
      SELECT COUNT(*)::int AS unread_count
      FROM admin_notification_recipients
      WHERE admin_id = $1
        AND read_at IS NULL
        AND archived_at IS NULL
    `, [adminId]);
    return Number(result.rows[0]?.unread_count ?? 0);
};
exports.getUnreadNotificationCount = getUnreadNotificationCount;
const markNotificationAsRead = async (adminId, recipientId) => {
    const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
    const result = await pool.query(`
      UPDATE admin_notification_recipients
      SET
        read_at = COALESCE(read_at, NOW()),
        updated_at = NOW()
      WHERE id = $1
        AND admin_id = $2
      RETURNING id
    `, [recipientId, adminId]);
    if (result.rowCount > 0) {
        (0, exports.emitNotificationUpdate)(adminId, "notification-read");
        return true;
    }
    return false;
};
exports.markNotificationAsRead = markNotificationAsRead;
const markAllNotificationsAsRead = async (adminId) => {
    const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
    const result = await pool.query(`
      UPDATE admin_notification_recipients
      SET
        read_at = COALESCE(read_at, NOW()),
        updated_at = NOW()
      WHERE admin_id = $1
        AND read_at IS NULL
        AND archived_at IS NULL
    `, [adminId]);
    (0, exports.emitNotificationUpdate)(adminId, "notifications-read-all");
    return result.rowCount;
};
exports.markAllNotificationsAsRead = markAllNotificationsAsRead;
const archiveNotification = async (adminId, recipientId) => {
    const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
    const result = await pool.query(`
      UPDATE admin_notification_recipients
      SET
        archived_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
        AND admin_id = $2
      RETURNING id
    `, [recipientId, adminId]);
    if (result.rowCount > 0) {
        (0, exports.emitNotificationUpdate)(adminId, "notification-archived");
        return true;
    }
    return false;
};
exports.archiveNotification = archiveNotification;
const registerNotificationStream = (adminId, response) => {
    const existingClients = sseClients.get(adminId) ?? new Set();
    existingClients.add(response);
    sseClients.set(adminId, existingClients);
    response.write(`event: ready\ndata: ${JSON.stringify({
        unreadCount: 0,
    })}\n\n`);
    return () => {
        const clients = sseClients.get(adminId);
        if (!clients) {
            return;
        }
        clients.delete(response);
        if (clients.size === 0) {
            sseClients.delete(adminId);
        }
    };
};
exports.registerNotificationStream = registerNotificationStream;
const emitNotificationUpdate = (adminId, eventType = "notifications-updated") => {
    const clients = sseClients.get(adminId);
    if (!clients || clients.size === 0) {
        return;
    }
    clients.forEach((client) => {
        client.write(`event: ${eventType}\ndata: ${JSON.stringify({
            eventType,
            at: new Date().toISOString(),
        })}\n\n`);
    });
};
exports.emitNotificationUpdate = emitNotificationUpdate;
const broadcastRecipients = (adminIds) => {
    adminIds.forEach((adminId) => (0, exports.emitNotificationUpdate)(adminId));
};
const getNestedString = (data, path) => {
    let current = data;
    for (const segment of path) {
        if (!current || typeof current !== "object") {
            return "";
        }
        current = current[segment];
    }
    return readString(current);
};
const syncVendorNotifications = async () => {
    const cursor = await getSyncState("vendors");
    const query = firebase_1.firestore.collection("vendor_profile").orderBy("createdAt", "asc");
    const snapshot = cursor
        ? await query.startAfter(firebase_admin_1.default.firestore.Timestamp.fromDate(new Date(cursor))).get()
        : await query.get();
    let latestCursor = cursor;
    let createdCount = 0;
    for (const doc of snapshot.docs) {
        const data = doc.data();
        const createdAt = toDate(data.createdAt) ?? new Date();
        const vendorName = readString(data.businessName) || "Unnamed vendor";
        const result = await createNotificationEvent({
            type: "vendor.registered",
            category: "vendors",
            title: "New Vendor Registered",
            message: `${vendorName} has registered as a vendor.`,
            severity: "success",
            targetUrl: `/vendors?vendorId=${encodeURIComponent(doc.id)}`,
            entityType: "vendor",
            entityId: doc.id,
            eventKey: `vendor.registered:${doc.id}`,
            metadata: {
                vendorId: doc.id,
                vendorName,
                onboardingStatus: readNullableString(data.onboardingStatus),
            },
            occurredAt: createdAt,
        });
        if (result.created) {
            createdCount += 1;
            broadcastRecipients(result.recipientAdminIds);
            void sendPushForNotification({
                category: result.category,
                title: result.title,
                targetUrl: result.targetUrl,
                recipientAdminIds: result.recipientAdminIds,
            });
        }
        latestCursor = createdAt.toISOString();
    }
    if (latestCursor) {
        await withAnalyticsTransaction((client) => setSyncState(client, "vendors", latestCursor));
    }
    return createdCount;
};
const resolveProductSubmissionVersion = (data) => {
    const explicitSubmissionDate = toIsoString(data.resubmittedAt ??
        data.submittedAt ??
        data.reviewSubmittedAt ??
        data.pendingSince) ?? null;
    return explicitSubmissionDate || toIsoString(data.createdAt) || "unknown";
};
const syncProductNotifications = async () => {
    const cursor = await getSyncState("products");
    const query = firebase_1.firestore.collection("products").orderBy("updatedAt", "asc");
    const snapshot = cursor
        ? await query.startAfter(firebase_admin_1.default.firestore.Timestamp.fromDate(new Date(cursor))).get()
        : await query.get();
    let latestCursor = cursor;
    let createdCount = 0;
    for (const doc of snapshot.docs) {
        const data = doc.data();
        const lifecycleStatus = readString(data.lifecycleStatus ?? data.status).toLowerCase();
        if (lifecycleStatus !== "pending") {
            latestCursor = toIsoString(data.updatedAt) ?? latestCursor;
            continue;
        }
        const occurredAt = toDate(data.updatedAt ?? data.createdAt) ?? new Date();
        const productName = getNestedString(data, ["vendor", "basic", "productName"]) ||
            getNestedString(data, ["product", "title"]) ||
            "Unnamed product";
        const vendorName = getNestedString(data, ["vendorResolved", "businessName"]) ||
            getNestedString(data, ["vendor", "companyName"]) ||
            readString(data.vendorId) ||
            "Unknown vendor";
        const submissionVersion = resolveProductSubmissionVersion(data);
        if (submissionVersion === "unknown") {
            latestCursor = occurredAt.toISOString();
            continue;
        }
        const result = await createNotificationEvent({
            type: "product.submitted",
            category: "products",
            title: "New Product Awaiting Review",
            message: `${productName} was submitted by ${vendorName}.`,
            severity: "info",
            targetUrl: `/products/pending?productId=${encodeURIComponent(doc.id)}`,
            entityType: "product",
            entityId: doc.id,
            eventKey: `product.submitted:${doc.id}:${submissionVersion}`,
            metadata: {
                productId: doc.id,
                productName,
                vendorName,
                vendorId: readNullableString(data.vendorId),
                submissionVersion,
            },
            occurredAt,
        });
        if (result.created) {
            createdCount += 1;
            broadcastRecipients(result.recipientAdminIds);
            void sendPushForNotification({
                category: result.category,
                title: result.title,
                targetUrl: result.targetUrl,
                recipientAdminIds: result.recipientAdminIds,
            });
        }
        latestCursor = occurredAt.toISOString();
    }
    if (latestCursor) {
        await withAnalyticsTransaction((client) => setSyncState(client, "products", latestCursor));
    }
    return createdCount;
};
const syncUserNotifications = async () => {
    const cursor = await getSyncState("users");
    const pool = (0, userPortalUsers_service_1.getUserPortalPool)();
    const values = [];
    let whereClause = "";
    if (cursor) {
        values.push(cursor);
        whereClause = "WHERE created_at > $1::timestamp";
    }
    const result = await pool.query(`
      SELECT id, full_name, email, created_at
      FROM users
      ${whereClause}
      ORDER BY created_at ASC
    `, values);
    let latestCursor = cursor;
    let createdCount = 0;
    for (const row of result.rows) {
        const createdAt = toDate(row.created_at) ?? new Date();
        const userLabel = readString(row.full_name) || readString(row.email) || "New user";
        const notificationResult = await createNotificationEvent({
            type: "user.registered",
            category: "users",
            title: "New User Registered",
            message: `${userLabel} created a new account.`,
            severity: "success",
            targetUrl: "/users",
            entityType: "user",
            entityId: readNullableString(row.id),
            eventKey: `user.registered:${readString(row.id)}`,
            metadata: {
                userId: readNullableString(row.id),
                userName: readNullableString(row.full_name),
                email: readNullableString(row.email),
            },
            occurredAt: createdAt,
        });
        if (notificationResult.created) {
            createdCount += 1;
            broadcastRecipients(notificationResult.recipientAdminIds);
            void sendPushForNotification({
                category: notificationResult.category,
                title: notificationResult.title,
                targetUrl: notificationResult.targetUrl,
                recipientAdminIds: notificationResult.recipientAdminIds,
            });
        }
        latestCursor = createdAt.toISOString();
    }
    if (latestCursor) {
        await withAnalyticsTransaction((client) => setSyncState(client, "users", latestCursor));
    }
    return createdCount;
};
const syncGuestReportNotifications = async () => {
    const cursor = await getSyncState("guest_reports");
    const pool = (0, userPortalUsers_service_1.getUserPortalPool)();
    const values = [];
    let whereClause = "";
    if (cursor) {
        values.push(cursor);
        whereClause = `
      WHERE COALESCE(gr.report_generated_at, gr.created_at) > $1::timestamp
    `;
    }
    const result = await pool.query(`
      SELECT
        gr.id,
        gr.report_type,
        gr.normalized_domain,
        gr.website,
        gr.created_at,
        gr.report_generated_at
      FROM guest_report gr
      ${whereClause ? `${whereClause} AND` : "WHERE"}
      (
        gr.report_generated_at IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM guest_activity_events e
          WHERE e.guest_report_id = gr.id
            AND e.event_name = ANY($${values.length + 1}::text[])
        )
      )
      ORDER BY COALESCE(gr.report_generated_at, gr.created_at) ASC
    `, [...values, Array.from(GENERATED_GUEST_REPORT_EVENT_NAMES)]);
    let latestCursor = cursor;
    let createdCount = 0;
    for (const row of result.rows) {
        const occurredAt = toDate(row.report_generated_at ?? row.created_at) ?? new Date();
        const reportType = readString(row.report_type) || "Guest Report";
        const domain = readString(row.normalized_domain) || readString(row.website) || "unknown domain";
        const notificationResult = await createNotificationEvent({
            type: "guest-report.generated",
            category: "guest_reports",
            title: "New Guest Report Generated",
            message: `A guest generated a ${reportType} for ${domain}.`,
            severity: "info",
            targetUrl: "/users/guest-users",
            entityType: "guest_report",
            entityId: readNullableString(row.id),
            eventKey: `guest-report.generated:${readString(row.id)}`,
            metadata: {
                guestReportId: readNullableString(row.id),
                reportType,
                domain,
            },
            occurredAt,
        });
        if (notificationResult.created) {
            createdCount += 1;
            broadcastRecipients(notificationResult.recipientAdminIds);
            void sendPushForNotification({
                category: notificationResult.category,
                title: notificationResult.title,
                targetUrl: notificationResult.targetUrl,
                recipientAdminIds: notificationResult.recipientAdminIds,
            });
        }
        latestCursor = occurredAt.toISOString();
    }
    if (latestCursor) {
        await withAnalyticsTransaction((client) => setSyncState(client, "guest_reports", latestCursor));
    }
    return createdCount;
};
const mapPaymentTransactionToNotification = async (row) => {
    const eventType = readString(row.event_type).toLowerCase();
    const gateway = readString(row.gateway) || "unknown";
    const orderId = readString(row.order_id);
    const userId = readString(row.user_id);
    const userLabel = readString(row.full_name) || readString(row.email) || "Unknown customer";
    const planName = readString(row.plan_name) || "Plan";
    const amount = readNumber(row.total_amount, readNumber(row.amount_paid, 0));
    const currencyCode = readString(row.currency_code) || "INR";
    const targetUrl = "/users";
    const providerEventKey = `${readString(row.id)}:${readString(row.status)}`;
    if (eventType === "payment_verified") {
        return {
            type: "payment.succeeded",
            title: "Payment Successful",
            message: `${formatCurrency(amount, currencyCode)} received from ${userLabel} for ${planName}.`,
            severity: "success",
            eventKey: `payment:${gateway}:${providerEventKey}`,
            targetUrl,
            entityId: orderId,
            metadata: {
                orderId,
                userId,
                customerName: readNullableString(row.full_name),
                email: readNullableString(row.email),
                amount,
                currencyCode,
                paymentPurpose: planName,
                provider: gateway,
                status: readNullableString(row.status),
            },
        };
    }
    if (eventType === "order_created" || eventType === "gateway_order_created") {
        return {
            type: "payment.initiated",
            title: "Payment Initiated",
            message: `${userLabel} started a ${formatCurrency(amount, currencyCode)} payment for ${planName}.`,
            severity: "info",
            eventKey: `payment:${gateway}:${providerEventKey}`,
            targetUrl,
            entityId: orderId,
            metadata: {
                orderId,
                userId,
                customerName: readNullableString(row.full_name),
                email: readNullableString(row.email),
                amount,
                currencyCode,
                paymentPurpose: planName,
                provider: gateway,
                status: readNullableString(row.status),
            },
        };
    }
    return null;
};
const syncPaymentTransactionNotifications = async () => {
    const cursor = await getSyncState("payments");
    const pool = (0, userPortalUsers_service_1.getUserPortalPool)();
    const values = [];
    let whereClause = "";
    if (cursor) {
        values.push(cursor);
        whereClause = "WHERE t.created_at > $1::timestamp";
    }
    const result = await pool.query(`
      SELECT
        t.id,
        t.order_id,
        t.user_id,
        t.gateway,
        t.event_type,
        t.status,
        t.currency_code,
        t.total_amount,
        o.plan_name,
        o.amount_paid,
        u.full_name,
        u.email,
        t.created_at
      FROM user_plan_payment_transactions t
      INNER JOIN user_plan_orders o
        ON o.id = t.order_id
      INNER JOIN users u
        ON u.id = t.user_id
      ${whereClause}
      ORDER BY t.created_at ASC
    `, values);
    let latestCursor = cursor;
    let createdCount = 0;
    for (const row of result.rows) {
        const notification = await mapPaymentTransactionToNotification(row);
        const occurredAt = toDate(row.created_at) ?? new Date();
        if (!notification) {
            latestCursor = occurredAt.toISOString();
            continue;
        }
        const notificationResult = await createNotificationEvent({
            type: notification.type,
            category: "payments",
            title: notification.title,
            message: notification.message,
            severity: notification.severity,
            targetUrl: notification.targetUrl,
            entityType: "payment_order",
            entityId: notification.entityId,
            eventKey: notification.eventKey,
            metadata: notification.metadata,
            occurredAt,
        });
        if (notificationResult.created) {
            createdCount += 1;
            broadcastRecipients(notificationResult.recipientAdminIds);
            void sendPushForNotification({
                category: notificationResult.category,
                title: notificationResult.title,
                targetUrl: notificationResult.targetUrl,
                recipientAdminIds: notificationResult.recipientAdminIds,
            });
        }
        latestCursor = occurredAt.toISOString();
    }
    if (latestCursor) {
        await withAnalyticsTransaction((client) => setSyncState(client, "payments", latestCursor));
    }
    return createdCount;
};
const syncPaymentOrderStatusNotifications = async () => {
    const cursor = await getSyncState("payment_order_status");
    const pool = (0, userPortalUsers_service_1.getUserPortalPool)();
    const values = [];
    let whereClause = "";
    if (cursor) {
        values.push(cursor);
        whereClause = "WHERE o.updated_at > $1::timestamp";
    }
    const result = await pool.query(`
      SELECT
        o.id,
        o.user_id,
        o.plan_name,
        o.gateway,
        o.currency_code,
        o.total_amount,
        o.amount_paid,
        o.status,
        o.updated_at,
        u.full_name,
        u.email
      FROM user_plan_orders o
      INNER JOIN users u
        ON u.id = o.user_id
      ${whereClause}
      ORDER BY o.updated_at ASC
    `, values);
    let latestCursor = cursor;
    let createdCount = 0;
    for (const row of result.rows) {
        const status = readString(row.status).toLowerCase();
        const occurredAt = toDate(row.updated_at) ?? new Date();
        latestCursor = occurredAt.toISOString();
        if (!PAYMENT_FAILURE_STATUSES.has(status)) {
            continue;
        }
        const amount = readNumber(row.total_amount, readNumber(row.amount_paid, 0));
        const currencyCode = readString(row.currency_code) || "INR";
        const userLabel = readString(row.full_name) || readString(row.email) || "Unknown customer";
        const planName = readString(row.plan_name) || "Plan";
        const notificationResult = await createNotificationEvent({
            type: "payment.failed",
            category: "payments",
            title: "Payment Failed",
            message: `${formatCurrency(amount, currencyCode)} from ${userLabel} for ${planName} is ${status.replace(/_/g, " ")}.`,
            severity: "error",
            targetUrl: "/users",
            entityType: "payment_order",
            entityId: readNullableString(row.id),
            eventKey: `payment:${readString(row.gateway)}:${readString(row.id)}:${status}`,
            metadata: {
                orderId: readNullableString(row.id),
                userId: readNullableString(row.user_id),
                customerName: readNullableString(row.full_name),
                email: readNullableString(row.email),
                amount,
                currencyCode,
                paymentPurpose: planName,
                provider: readNullableString(row.gateway),
                status,
            },
            occurredAt,
        });
        if (notificationResult.created) {
            createdCount += 1;
            broadcastRecipients(notificationResult.recipientAdminIds);
            void sendPushForNotification({
                category: notificationResult.category,
                title: notificationResult.title,
                targetUrl: notificationResult.targetUrl,
                recipientAdminIds: notificationResult.recipientAdminIds,
            });
        }
    }
    if (latestCursor) {
        await withAnalyticsTransaction((client) => setSyncState(client, "payment_order_status", latestCursor));
    }
    return createdCount;
};
async function syncNotifications({ force = false, } = {}) {
    if (syncPromise && !force) {
        return syncPromise;
    }
    syncPromise = (async () => {
        let createdCount = 0;
        createdCount += await syncVendorNotifications();
        createdCount += await syncProductNotifications();
        createdCount += await syncUserNotifications();
        createdCount += await syncGuestReportNotifications();
        createdCount += await syncPaymentTransactionNotifications();
        createdCount += await syncPaymentOrderStatusNotifications();
        return { createdCount };
    })();
    try {
        return await syncPromise;
    }
    finally {
        syncPromise = null;
    }
}
const startNotificationsSyncLoop = () => {
    if (syncIntervalHandle) {
        return;
    }
    void syncNotifications().catch((error) => {
        console.error("Initial notification sync failed:", error instanceof Error ? error.message : String(error));
    });
    syncIntervalHandle = setInterval(() => {
        void syncNotifications().catch((error) => {
            console.error("Notification sync failed:", error instanceof Error ? error.message : String(error));
        });
    }, NOTIFICATION_SYNC_INTERVAL_MS);
};
exports.startNotificationsSyncLoop = startNotificationsSyncLoop;
const getPushPublicKey = () => (0, webPush_service_1.getWebPushPublicKey)();
exports.getPushPublicKey = getPushPublicKey;
const getPushStatus = async (adminId) => ({
    supported: (0, webPush_service_1.isWebPushConfigured)(),
    publicKey: (0, webPush_service_1.getWebPushPublicKey)(),
    preferences: await getNotificationPreferences(adminId),
    subscriptions: await listActivePushSubscriptions(adminId),
});
exports.getPushStatus = getPushStatus;
