import { Link } from "react-router";
import { useCallback, useEffect, useState } from "react";
import PageMeta from "../../components/common/PageMeta";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import ComponentCard from "../../components/common/ComponentCard";
import Button from "../../components/ui/button/Button";
import Badge from "../../components/ui/badge/Badge";
import {
  BoxCubeIcon,
  ChatIcon,
  UserCircleIcon,
} from "../../icons";
import {
  fetchNotifications,
  formatNotificationDate,
  formatNotificationRelativeTime,
  getNotificationTypeLabel,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  subscribeToNotificationsChanged,
  type AdminNotification,
} from "../../services/notifications.service";

const iconClassName =
  "flex h-11 w-11 items-center justify-center rounded-2xl";

const NotificationTypeIcon = ({
  notification,
}: {
  notification: AdminNotification;
}) => {
  if (notification.icon === "vendor") {
    return (
      <span
        className={`${iconClassName} bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500`}
      >
        <UserCircleIcon className="h-5 w-5" />
      </span>
    );
  }

  if (notification.icon === "product") {
    return (
      <span
        className={`${iconClassName} bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400`}
      >
        <BoxCubeIcon className="h-5 w-5" />
      </span>
    );
  }

  return (
    <span
      className={`${iconClassName} bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-orange-400`}
    >
      <ChatIcon className="h-5 w-5" />
    </span>
  );
};

const Notifications = () => {
  const [notifications, setNotifications] = useState<
    AdminNotification[]
  >([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);

    try {
      const result = await fetchNotifications(100);
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
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
  }, []);

  useEffect(() => {
    void loadNotifications();

    return subscribeToNotificationsChanged(() => {
      void loadNotifications();
    });
  }, [loadNotifications]);

  const handleMarkAsRead = async (
    notificationId: string
  ) => {
    setIsSubmitting(true);

    try {
      await markNotificationAsRead(notificationId);
      await loadNotifications();
    } catch (actionError) {
      console.error(
        "Failed to mark notification as read",
        actionError
      );
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Failed to update notification"
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
      console.error(
        "Failed to mark all notifications as read",
        actionError
      );
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Failed to update notifications"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <PageMeta
        title="Notifications | ITMart24 Admin"
        description="Review vendor, product, and support ticket notifications."
      />
      <PageBreadcrumb pageTitle="Notifications" />
      <div className="space-y-6">
        <ComponentCard
          title="Notifications"
          desc="Real-time admin alerts generated from vendors, products, and support tickets."
        >
          <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/30 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {notifications.length} total notification
                {notifications.length === 1 ? "" : "s"}
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {unreadCount} unread
              </p>
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
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Loading notifications...
            </p>
          ) : notifications.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center dark:border-gray-700">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                No notifications yet
              </p>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                New vendors, products, and support tickets will appear here.
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
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex gap-4">
                      <NotificationTypeIcon notification={notification} />
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            {notification.title}
                          </p>
                          <Badge
                            size="sm"
                            color={notification.badgeColor}
                          >
                            {getNotificationTypeLabel(
                              notification.type
                            )}
                          </Badge>
                          <Badge
                            size="sm"
                            color={
                              notification.isRead
                                ? "light"
                                : "primary"
                            }
                            variant="light"
                          >
                            {notification.isRead ? "Read" : "Unread"}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          {notification.message}
                        </p>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                          <span
                            title={formatNotificationDate(
                              notification.eventAt
                            )}
                          >
                            {formatNotificationRelativeTime(
                              notification.eventAt
                            )}
                          </span>
                          <span>
                            {formatNotificationDate(
                              notification.eventAt
                            )}
                          </span>
                          <span>Source ID: {notification.sourceId}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 md:justify-end">
                      {notification.relatedRoute ? (
                        <Link
                          to={notification.relatedRoute}
                          className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/[0.03]"
                          onClick={() => {
                            if (!notification.isRead) {
                              void handleMarkAsRead(
                                notification.id
                              );
                            }
                          }}
                        >
                          Open
                        </Link>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          isSubmitting || notification.isRead
                        }
                        onClick={() => {
                          void handleMarkAsRead(
                            notification.id
                          );
                        }}
                      >
                        Mark as read
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </ComponentCard>
      </div>
    </>
  );
};

export default Notifications;
