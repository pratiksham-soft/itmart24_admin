import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import ComponentCard from "../../components/common/ComponentCard";
import Button from "../../components/ui/button/Button";
import Badge from "../../components/ui/badge/Badge";
import {
  AlertIcon,
  BoxCubeIcon,
  CheckCircleIcon,
  InfoIcon,
  UserCircleIcon,
} from "../../icons";
import {
  archiveNotification,
  disableBrowserPushNotifications,
  enableBrowserPushNotifications,
  ensureNotificationStream,
  fetchNotificationPreferences,
  fetchNotifications,
  fetchPushStatus,
  formatNotificationDate,
  formatNotificationRelativeTime,
  getNotificationCategoryLabel,
  getNotificationTypeLabel,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  subscribeToNotificationsChanged,
  updateNotificationPreferences,
  type AdminNotification,
  type NotificationCategory,
  type NotificationPreferences,
  type NotificationSeverity,
  type PushStatus,
} from "../../services/notifications.service";

const categoryOptions: Array<NotificationCategory | "all"> = [
  "all",
  "vendors",
  "products",
  "users",
  "guest_reports",
  "payments",
];

const severityOptions: Array<NotificationSeverity | "all"> = [
  "all",
  "info",
  "success",
  "warning",
  "error",
];

const readStatusOptions = ["all", "unread", "read"] as const;

const iconClassName =
  "flex h-11 w-11 items-center justify-center rounded-2xl";

const NotificationTypeIcon = ({
  notification,
}: {
  notification: AdminNotification;
}) => {
  if (notification.category === "vendors" || notification.category === "users") {
    return (
      <span
        className={`${iconClassName} bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500`}
      >
        <UserCircleIcon className="h-5 w-5" />
      </span>
    );
  }

  if (notification.category === "products") {
    return (
      <span
        className={`${iconClassName} bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400`}
      >
        <BoxCubeIcon className="h-5 w-5" />
      </span>
    );
  }

  if (notification.severity === "success") {
    return (
      <span
        className={`${iconClassName} bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500`}
      >
        <CheckCircleIcon className="h-5 w-5" />
      </span>
    );
  }

  if (notification.severity === "error") {
    return (
      <span
        className={`${iconClassName} bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400`}
      >
        <AlertIcon className="h-5 w-5" />
      </span>
    );
  }

  return (
    <span
      className={`${iconClassName} bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-300`}
    >
      <InfoIcon className="h-5 w-5" />
    </span>
  );
};

const selectClassName =
  "h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const Notifications = () => {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [category, setCategory] = useState<NotificationCategory | "all">("all");
  const [severity, setSeverity] = useState<NotificationSeverity | "all">("all");
  const [readStatus, setReadStatus] = useState<(typeof readStatusOptions)[number]>("all");
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);

    try {
      const [notificationResult, preferenceResult, pushResult] = await Promise.all([
        fetchNotifications({
          page,
          pageSize,
          category,
          severity,
          readStatus,
        }),
        fetchNotificationPreferences().catch(() => null),
        fetchPushStatus().catch(() => null),
      ]);

      setNotifications(notificationResult.notifications);
      setUnreadCount(notificationResult.unreadCount);
      setTotal(notificationResult.total);
      if (preferenceResult) {
        setPreferences(preferenceResult);
      }
      if (pushResult) {
        setPushStatus(pushResult);
      }
      setError(null);
    } catch (loadError) {
      console.error("Failed to load notifications", loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load notifications"
      );
    } finally {
      setIsLoading(false);
    }
  }, [category, page, pageSize, readStatus, severity]);

  useEffect(() => {
    ensureNotificationStream();
    void loadNotifications();

    return subscribeToNotificationsChanged(() => {
      void loadNotifications();
    });
  }, [loadNotifications]);

  useEffect(() => {
    setPage(1);
  }, [category, severity, readStatus]);

  const pushEnabled = useMemo(
    () => Boolean(pushStatus?.subscriptions?.length),
    [pushStatus]
  );

  const handleMarkAsRead = async (notificationId: string) => {
    setIsSubmitting(true);
    try {
      await markNotificationAsRead(notificationId);
      await loadNotifications();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Failed to update notification"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchive = async (notificationId: string) => {
    setIsSubmitting(true);
    try {
      await archiveNotification(notificationId);
      await loadNotifications();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Failed to archive notification"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkAllAsRead = async () => {
    setIsSubmitting(true);
    try {
      await markAllNotificationsAsRead();
      await loadNotifications();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Failed to update notifications"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePreferenceToggle = async (
    nextCategory: NotificationCategory
  ) => {
    if (!preferences) {
      return;
    }

    const nextPreferences = {
      ...preferences,
      [nextCategory]: !preferences[nextCategory],
    };

    setPreferences(nextPreferences);

    try {
      const savedPreferences = await updateNotificationPreferences({
        [nextCategory]: nextPreferences[nextCategory],
      });
      setPreferences(savedPreferences);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save notification preferences"
      );
      setPreferences(preferences);
    }
  };

  const handlePushToggle = async () => {
    setPushBusy(true);
    setPushError(null);

    try {
      if (pushEnabled) {
        await disableBrowserPushNotifications();
      } else {
        const result = await enableBrowserPushNotifications({
          deviceLabel: "Current browser",
        });

        if (!result.granted) {
          setPushError(
            "Browser permission was not granted. In-app notifications still work normally."
          );
        }
      }

      const nextPushStatus = await fetchPushStatus();
      setPushStatus(nextPushStatus);
    } catch (toggleError) {
      setPushError(
        toggleError instanceof Error
          ? toggleError.message
          : "Failed to update browser push settings."
      );
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <>
      <PageMeta
        title="Notifications | ITMart24 Admin"
        description="Review admin notifications for vendors, products, users, guest reports, and payments."
      />
      <PageBreadcrumb pageTitle="Notifications" />
      <div className="space-y-6">
        <ComponentCard
          title="Notification Center"
          desc="Persistent in-app admin notifications with browser push support for approved devices."
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
                  <p className="text-xs uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                    Total
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                    {total}
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
                  <p className="text-xs uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                    Unread
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                    {unreadCount}
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
                  <p className="text-xs uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                    Push
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                    {pushEnabled ? "On" : "Off"}
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
                  <p className="text-xs uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                    Page
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                    {page}/{totalPages}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap gap-3">
                  <select
                    aria-label="Filter by category"
                    className={selectClassName}
                    value={category}
                    onChange={(event) =>
                      setCategory(event.target.value as NotificationCategory | "all")
                    }
                  >
                    {categoryOptions.map((option) => (
                      <option key={option} value={option}>
                        {option === "all"
                          ? "All categories"
                          : getNotificationCategoryLabel(option)}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter by severity"
                    className={selectClassName}
                    value={severity}
                    onChange={(event) =>
                      setSeverity(event.target.value as NotificationSeverity | "all")
                    }
                  >
                    {severityOptions.map((option) => (
                      <option key={option} value={option}>
                        {option === "all"
                          ? "All severities"
                          : option.charAt(0).toUpperCase() + option.slice(1)}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter by read status"
                    className={selectClassName}
                    value={readStatus}
                    onChange={(event) =>
                      setReadStatus(
                        event.target.value as (typeof readStatusOptions)[number]
                      )
                    }
                  >
                    {readStatusOptions.map((option) => (
                      <option key={option} value={option}>
                        {option === "all"
                          ? "All items"
                          : option.charAt(0).toUpperCase() + option.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  disabled={isSubmitting || unreadCount === 0}
                  onClick={() => {
                    void handleMarkAllAsRead();
                  }}
                >
                  Mark all as read
                </Button>
              </div>

              {error ? (
                <div className="rounded-2xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
                  {error}
                </div>
              ) : null}

              {isLoading ? (
                <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  Loading notifications...
                </div>
              ) : notifications.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    No notifications found
                  </p>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    Adjust the filters or wait for the next platform event.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {notifications.map((notification) => (
                    <article
                      key={notification.id}
                      className={`rounded-2xl border px-4 py-4 transition ${
                        notification.isRead
                          ? "border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
                          : "border-brand-200 bg-brand-50/40 dark:border-brand-500/30 dark:bg-brand-500/10"
                      }`}
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex gap-4">
                          <NotificationTypeIcon notification={notification} />
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                {notification.title}
                              </p>
                              <Badge
                                size="sm"
                                color={
                                  notification.severity === "success"
                                    ? "success"
                                    : notification.severity === "error"
                                      ? "error"
                                      : notification.severity === "warning"
                                        ? "warning"
                                        : "primary"
                                }
                              >
                                {getNotificationCategoryLabel(notification.category)}
                              </Badge>
                              <Badge
                                size="sm"
                                color={notification.isRead ? "light" : "primary"}
                                variant="light"
                              >
                                {notification.isRead ? "Read" : "Unread"}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                              {notification.message}
                            </p>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                              <span title={formatNotificationDate(notification.occurredAt)}>
                                {formatNotificationRelativeTime(notification.occurredAt)}
                              </span>
                              <span>{formatNotificationDate(notification.occurredAt)}</span>
                              <span>{getNotificationTypeLabel(notification.type)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          <Link
                            to={notification.targetUrl}
                            className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/[0.03]"
                            onClick={() => {
                              if (!notification.isRead) {
                                void handleMarkAsRead(notification.id);
                              }
                            }}
                          >
                            Open
                          </Link>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isSubmitting || notification.isRead}
                            onClick={() => {
                              void handleMarkAsRead(notification.id);
                            }}
                          >
                            Mark as read
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isSubmitting}
                            onClick={() => {
                              void handleArchive(notification.id);
                            }}
                          >
                            Archive
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900/40">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Showing page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= totalPages}
                    onClick={() =>
                      setPage((current) => Math.min(totalPages, current + 1))
                    }
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                      Browser Push
                    </h3>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      Request permission only when you choose to enable push on this device.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={pushEnabled ? "outline" : "primary"}
                    disabled={pushBusy}
                    onClick={() => {
                      void handlePushToggle();
                    }}
                  >
                    {pushBusy
                      ? "Working..."
                      : pushEnabled
                        ? "Disable"
                        : "Enable"}
                  </Button>
                </div>
                <p className="mt-4 text-sm font-medium text-gray-900 dark:text-white">
                  Status: {pushEnabled ? "Enabled on this device" : "Disabled"}
                </p>
                {pushError ? (
                  <p className="mt-2 text-sm text-error-600 dark:text-error-400">
                    {pushError}
                  </p>
                ) : null}
                {pushStatus && pushStatus.subscriptions.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {pushStatus.subscriptions.map((subscription) => (
                      <div
                        key={subscription.id}
                        className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300"
                      >
                        <p className="font-medium text-gray-900 dark:text-white">
                          {subscription.deviceLabel || "Current device"}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Updated {formatNotificationDate(subscription.updatedAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  Push Preferences
                </h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  In-app notifications stay recorded. These toggles control browser push by category.
                </p>

                <div className="mt-4 space-y-3">
                  {categoryOptions
                    .filter((option): option is NotificationCategory => option !== "all")
                    .map((option) => (
                      <label
                        key={option}
                        className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700"
                      >
                        <span className="font-medium text-gray-900 dark:text-white">
                          {getNotificationCategoryLabel(option)}
                        </span>
                        <input
                          type="checkbox"
                          checked={Boolean(preferences?.[option])}
                          onChange={() => {
                            void handlePreferenceToggle(option);
                          }}
                          aria-label={`Toggle ${option} browser push`}
                        />
                      </label>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </ComponentCard>
      </div>
    </>
  );
};

export default Notifications;
