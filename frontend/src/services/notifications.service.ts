export type NotificationType =
  | "vendor_joined"
  | "product_inserted"
  | "support_ticket_generated";

export type NotificationIconType = "vendor" | "product" | "ticket";
export type NotificationBadgeColor =
  | "primary"
  | "success"
  | "warning";

export type AdminNotification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  entityLabel: string;
  sourceCollection: string;
  sourceId: string;
  relatedRoute: string | null;
  icon: NotificationIconType;
  badgeColor: NotificationBadgeColor;
  isRead: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  readAt: string | null;
  eventAt: string | null;
  metadata: Record<string, unknown>;
};

type NotificationsResponse = {
  success: boolean;
  data?: AdminNotification[];
  unreadCount?: number;
  message?: string;
};

type ReadAllResponse = {
  success: boolean;
  updatedCount?: number;
  message?: string;
};

const NOTIFICATIONS_CHANGED_EVENT = "notifications:changed";

const toErrorMessage = async (response: Response) => {
  try {
    const payload = (await response.json()) as {
      message?: string;
    };

    return payload.message || "Request failed";
  } catch {
    return "Request failed";
  }
};

export const getNotificationTypeLabel = (
  type: NotificationType
) => {
  switch (type) {
    case "vendor_joined":
      return "Vendor";
    case "product_inserted":
      return "Product";
    case "support_ticket_generated":
      return "Support";
    default:
      return "Notification";
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

export const emitNotificationsChanged = () => {
  window.dispatchEvent(
    new CustomEvent(NOTIFICATIONS_CHANGED_EVENT)
  );
};

export const subscribeToNotificationsChanged = (
  callback: () => void
) => {
  const handler = () => {
    callback();
  };

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

export const fetchNotifications = async (
  limit = 20
) => {
  const response = await fetch(`/api/notifications?limit=${limit}`);

  if (!response.ok) {
    throw new Error(await toErrorMessage(response));
  }

  const payload =
    (await response.json()) as NotificationsResponse;

  return {
    notifications: payload.data ?? [],
    unreadCount: payload.unreadCount ?? 0,
  };
};

export const markNotificationAsRead = async (
  notificationId: string
) => {
  const response = await fetch(
    `/api/notifications/${notificationId}/read`,
    {
      method: "PATCH",
    }
  );

  if (!response.ok) {
    throw new Error(await toErrorMessage(response));
  }

  emitNotificationsChanged();
};

export const markAllNotificationsAsRead = async () => {
  const response = await fetch("/api/notifications/read-all", {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(await toErrorMessage(response));
  }

  const payload = (await response.json()) as ReadAllResponse;
  emitNotificationsChanged();
  return payload.updatedCount ?? 0;
};
