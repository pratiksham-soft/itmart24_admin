import { API_BASE_URL } from "../config/api";
import {
  getAdminAuthHeaders,
  getAdminEventStreamUrl,
  readApiError,
} from "./adminApi";

export type NotificationCategory =
  | "vendors"
  | "products"
  | "users"
  | "guest_reports"
  | "payments";

export type NotificationSeverity =
  | "info"
  | "success"
  | "warning"
  | "error";

export type AdminNotification = {
  id: string;
  notificationId: string;
  adminId: number;
  type: string;
  category: NotificationCategory;
  title: string;
  message: string;
  severity: NotificationSeverity;
  targetUrl: string;
  entityType: string | null;
  entityId: string | null;
  eventKey: string;
  metadata: Record<string, unknown>;
  isRead: boolean;
  isArchived: boolean;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  occurredAt: string;
};

export type NotificationPreferences = Record<
  NotificationCategory,
  boolean
>;

export type PushStatus = {
  supported: boolean;
  publicKey: string | null;
  missingConfigKeys: string[];
  preferences: NotificationPreferences;
  subscriptions: Array<{
    id: string;
    endpoint: string;
    deviceLabel: string | null;
    userAgent: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
};

type NotificationsResponse = {
  success: boolean;
  data?: AdminNotification[];
  unreadCount?: number;
  total?: number;
  page?: number;
  pageSize?: number;
  message?: string;
};

const NOTIFICATIONS_CHANGED_EVENT = "notifications:changed";
let notificationStream: EventSource | null = null;
let notificationStreamStarted = false;

export const getNotificationCategoryLabel = (
  category: NotificationCategory
) => {
  switch (category) {
    case "vendors":
      return "Vendors";
    case "products":
      return "Products";
    case "users":
      return "Users";
    case "guest_reports":
      return "Guest reports";
    case "payments":
      return "Payments";
    default:
      return "Notifications";
  }
};

export const getNotificationTypeLabel = (type: string) => {
  switch (type) {
    case "vendor.registered":
      return "Vendor";
    case "product.submitted":
      return "Product";
    case "user.registered":
      return "User";
    case "guest-report.generated":
      return "Guest report";
    case "payment.initiated":
      return "Payment";
    case "payment.succeeded":
      return "Payment";
    case "payment.failed":
      return "Payment";
    default:
      return "Notification";
  }
};

export const emitNotificationsChanged = () => {
  window.dispatchEvent(
    new CustomEvent(NOTIFICATIONS_CHANGED_EVENT)
  );
};

export const subscribeToNotificationsChanged = (
  callback: () => void
) => {
  const handler = () => callback();
  window.addEventListener(
    NOTIFICATIONS_CHANGED_EVENT,
    handler
  );

  return () => {
    window.removeEventListener(
      NOTIFICATIONS_CHANGED_EVENT,
      handler
    );
  };
};

export const ensureNotificationStream = () => {
  if (notificationStreamStarted) {
    return;
  }

  notificationStreamStarted = true;

  try {
    notificationStream = new EventSource(
      getAdminEventStreamUrl("/api/notifications/stream")
    );

    const emitUpdate = () => emitNotificationsChanged();
    notificationStream.addEventListener(
      "notifications-updated",
      emitUpdate
    );
    notificationStream.addEventListener(
      "notification-read",
      emitUpdate
    );
    notificationStream.addEventListener(
      "notifications-read-all",
      emitUpdate
    );
    notificationStream.addEventListener(
      "notification-archived",
      emitUpdate
    );
    notificationStream.addEventListener(
      "preferences-updated",
      emitUpdate
    );
    notificationStream.addEventListener(
      "push-subscription-updated",
      emitUpdate
    );
    notificationStream.onerror = () => {
      emitNotificationsChanged();
    };
  } catch (error) {
    console.error("Failed to start notification stream", error);
  }
};

export const formatNotificationDate = (
  value: string | null
) => {
  if (!value) {
    return "Just now";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Just now";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
};

export const formatNotificationRelativeTime = (
  value: string | null
) => {
  if (!value) {
    return "Just now";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Just now";
  }

  const diffInSeconds = Math.round(
    (parsed.getTime() - Date.now()) / 1000
  );
  const formatter = new Intl.RelativeTimeFormat("en", {
    numeric: "auto",
  });

  const ranges = [
    { unit: "year", seconds: 60 * 60 * 24 * 365 },
    { unit: "month", seconds: 60 * 60 * 24 * 30 },
    { unit: "week", seconds: 60 * 60 * 24 * 7 },
    { unit: "day", seconds: 60 * 60 * 24 },
    { unit: "hour", seconds: 60 * 60 },
    { unit: "minute", seconds: 60 },
  ] as const;

  for (const range of ranges) {
    if (Math.abs(diffInSeconds) >= range.seconds) {
      return formatter.format(
        Math.round(diffInSeconds / range.seconds),
        range.unit
      );
    }
  }

  return formatter.format(diffInSeconds, "second");
};

export const fetchNotifications = async (options?: {
  page?: number;
  pageSize?: number;
  category?: NotificationCategory | "all";
  type?: string;
  severity?: NotificationSeverity | "all";
  readStatus?: "all" | "read" | "unread";
}) => {
  const query = new URLSearchParams();
  if (options?.page) query.set("page", String(options.page));
  if (options?.pageSize) query.set("pageSize", String(options.pageSize));
  if (options?.category && options.category !== "all") {
    query.set("category", options.category);
  }
  if (options?.type) query.set("type", options.type);
  if (options?.severity && options.severity !== "all") {
    query.set("severity", options.severity);
  }
  if (options?.readStatus) {
    query.set("readStatus", options.readStatus);
  }
  query.set("archived", "false");

  const response = await fetch(
    `${API_BASE_URL}/api/notifications?${query.toString()}`,
    {
      headers: {
        ...getAdminAuthHeaders(),
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Failed to fetch notifications.")
    );
  }

  const payload =
    (await response.json()) as NotificationsResponse;

  return {
    notifications: payload.data ?? [],
    unreadCount: payload.unreadCount ?? 0,
    total: payload.total ?? 0,
    page: payload.page ?? options?.page ?? 1,
    pageSize: payload.pageSize ?? options?.pageSize ?? 20,
  };
};

export const markNotificationAsRead = async (
  notificationId: string
) => {
  const response = await fetch(
    `${API_BASE_URL}/api/notifications/${notificationId}/read`,
    {
      method: "PATCH",
      headers: {
        ...getAdminAuthHeaders(),
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Failed to mark notification as read.")
    );
  }

  emitNotificationsChanged();
};

export const markAllNotificationsAsRead = async () => {
  const response = await fetch(
    `${API_BASE_URL}/api/notifications/read-all`,
    {
      method: "POST",
      headers: {
        ...getAdminAuthHeaders(),
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Failed to mark all notifications as read.")
    );
  }

  emitNotificationsChanged();
};

export const archiveNotification = async (
  notificationId: string
) => {
  const response = await fetch(
    `${API_BASE_URL}/api/notifications/${notificationId}/archive`,
    {
      method: "PATCH",
      headers: {
        ...getAdminAuthHeaders(),
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Failed to archive notification.")
    );
  }

  emitNotificationsChanged();
};

export const fetchNotificationPreferences = async () => {
  const response = await fetch(
    `${API_BASE_URL}/api/notifications/preferences`,
    {
      headers: {
        ...getAdminAuthHeaders(),
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Failed to load notification preferences.")
    );
  }

  const payload = (await response.json()) as {
    success: true;
    data: NotificationPreferences;
  };
  return payload.data;
};

export const updateNotificationPreferences = async (
  preferences: Partial<NotificationPreferences>
) => {
  const response = await fetch(
    `${API_BASE_URL}/api/notifications/preferences`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...getAdminAuthHeaders(),
      },
      body: JSON.stringify(preferences),
    }
  );

  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Failed to save notification preferences.")
    );
  }

  const payload = (await response.json()) as {
    success: true;
    data: NotificationPreferences;
  };
  emitNotificationsChanged();
  return payload.data;
};

export const fetchPushStatus = async () => {
  const response = await fetch(
    `${API_BASE_URL}/api/notifications/push`,
    {
      headers: {
        ...getAdminAuthHeaders(),
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Failed to load browser push settings.")
    );
  }

  const payload = (await response.json()) as {
    success: true;
    data: PushStatus;
  };
  return payload.data;
};

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
};

const getPushServiceWorkerRegistration = async () => {
  if (!("serviceWorker" in navigator)) {
    throw new Error("This browser does not support service workers.");
  }

  return navigator.serviceWorker.register(
    "/admin-notification-sw.js"
  );
};

const getCurrentPushSubscription = async () => {
  const registration = await getPushServiceWorkerRegistration();
  return registration.pushManager.getSubscription();
};

export const enableBrowserPushNotifications = async (options: {
  deviceLabel?: string;
}) => {
  const pushStatus = await fetchPushStatus();

  if (!pushStatus.supported || !pushStatus.publicKey) {
    const missingKeys =
      pushStatus.missingConfigKeys.length > 0
        ? ` Missing backend config: ${pushStatus.missingConfigKeys.join(", ")}.`
        : "";

    throw new Error(
      `Browser push is not configured on this environment yet.${missingKeys}`
    );
  }

  if (!("Notification" in window) || !("PushManager" in window)) {
    throw new Error("This browser does not support push notifications.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      granted: false,
      reason: permission,
    };
  }

  const registration = await getPushServiceWorkerRegistration();
  const existingSubscription =
    await registration.pushManager.getSubscription();
  const subscription =
    existingSubscription ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        pushStatus.publicKey
      ),
    }));

  await fetch(`${API_BASE_URL}/api/notifications/push/subscriptions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAdminAuthHeaders(),
    },
    body: JSON.stringify({
      subscription,
      deviceLabel: options.deviceLabel ?? null,
      userAgent: navigator.userAgent,
    }),
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(
        await readApiError(
          response,
          "Failed to save browser push subscription."
        )
      );
    }
  });

  emitNotificationsChanged();
  return {
    granted: true,
  };
};

export const disableBrowserPushNotifications = async () => {
  const subscription = await getCurrentPushSubscription();

  if (!subscription) {
    return false;
  }

  const endpoint = subscription.endpoint;
  await fetch(`${API_BASE_URL}/api/notifications/push/subscriptions`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...getAdminAuthHeaders(),
    },
    body: JSON.stringify({
      endpoint,
    }),
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(
        await readApiError(
          response,
          "Failed to disable browser push notifications."
        )
      );
    }
  });

  await subscription.unsubscribe();
  emitNotificationsChanged();
  return true;
};
