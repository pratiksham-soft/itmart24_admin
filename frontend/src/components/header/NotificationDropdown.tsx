import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { Dropdown } from "../ui/dropdown/Dropdown";
import Badge from "../ui/badge/Badge";
import {
  AlertIcon,
  BoxCubeIcon,
  CheckCircleIcon,
  InfoIcon,
  UserCircleIcon,
} from "../../icons";
import Button from "../ui/button/Button";
import {
  disableBrowserPushNotifications,
  enableBrowserPushNotifications,
  ensureNotificationStream,
  fetchNotifications,
  fetchPushStatus,
  formatNotificationRelativeTime,
  getNotificationCategoryLabel,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  subscribeToNotificationsChanged,
  type AdminNotification,
  type PushStatus,
} from "../../services/notifications.service";

const renderIcon = (notification: AdminNotification) => {
  if (notification.category === "vendors" || notification.category === "users") {
    return (
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500">
        <UserCircleIcon className="h-5 w-5" />
      </span>
    );
  }

  if (notification.category === "products") {
    return (
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400">
        <BoxCubeIcon className="h-5 w-5" />
      </span>
    );
  }

  if (notification.severity === "success") {
    return (
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500">
        <CheckCircleIcon className="h-5 w-5" />
      </span>
    );
  }

  if (notification.severity === "error") {
    return (
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400">
        <AlertIcon className="h-5 w-5" />
      </span>
    );
  }

  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-300">
      <InfoIcon className="h-5 w-5" />
    </span>
  );
};

export default function NotificationDropdown() {
  const staleMs = 20_000;
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const lastLoadedAtRef = useRef(0);

  const loadNotifications = useCallback(async (force = false) => {
    if (
      !force &&
      lastLoadedAtRef.current > 0 &&
      Date.now() - lastLoadedAtRef.current < staleMs
    ) {
      return;
    }

    setIsLoading(true);
    try {
      const [notificationResult, pushResult] = await Promise.all([
        fetchNotifications({
          page: 1,
          pageSize: 6,
          readStatus: "all",
        }),
        fetchPushStatus().catch(() => null),
      ]);

      setNotifications(notificationResult.notifications);
      setUnreadCount(notificationResult.unreadCount);
      setPushStatus(pushResult);
      lastLoadedAtRef.current = Date.now();
    } catch (error) {
      console.error("Failed to load notifications", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    ensureNotificationStream();
    void loadNotifications(true);

    return subscribeToNotificationsChanged(() => {
      void loadNotifications(true);
    });
  }, [loadNotifications]);

  const hasCurrentDevicePush = useMemo(
    () => Boolean(pushStatus?.subscriptions?.length),
    [pushStatus]
  );

  const handleNotificationClick = async (
    notification: AdminNotification
  ) => {
    if (!notification.isRead) {
      try {
        await markNotificationAsRead(notification.id);
      } catch (error) {
        console.error("Failed to mark notification as read", error);
      }
    }
  };

  const handlePushToggle = async () => {
    setPushBusy(true);
    setPushError(null);

    try {
      if (hasCurrentDevicePush) {
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

      await loadNotifications(true);
    } catch (error) {
      setPushError(
        error instanceof Error
          ? error.message
          : "Failed to update browser push settings."
      );
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <div className="relative">
      <button
        className="relative flex items-center justify-center text-gray-500 transition-colors bg-white border border-gray-200 rounded-full dropdown-toggle hover:text-gray-700 h-11 w-11 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        onClick={() => {
          const next = !isOpen;
          setIsOpen(next);
          if (next) {
            void loadNotifications(true);
          }
        }}
        aria-label="Open notifications"
      >
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 z-10 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
        <svg
          className="fill-current"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H4.37504H15.625H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z"
            fill="currentColor"
          />
        </svg>
      </button>
      <Dropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        className="absolute -right-[240px] mt-[17px] flex h-[520px] w-[360px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark sm:w-[380px] lg:right-0"
      >
        <div className="mb-3 flex items-start justify-between gap-3 border-b border-gray-100 pb-3 dark:border-gray-700">
          <div>
            <h5 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              Notifications
            </h5>
            <p className="text-theme-xs text-gray-500 dark:text-gray-400">
              {unreadCount} unread
            </p>
          </div>
          {unreadCount > 0 ? (
            <button
              onClick={() => {
                void markAllNotificationsAsRead().then(() =>
                  loadNotifications(true)
                );
              }}
              className="text-theme-xs font-medium text-brand-500 transition hover:text-brand-600"
            >
              Mark all read
            </button>
          ) : null}
        </div>

        <div className="mb-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/40">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Browser push
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {hasCurrentDevicePush
                  ? "This device is receiving admin push notifications."
                  : "Enable push on this device after granting browser permission."}
              </p>
            </div>
            <Button
              size="sm"
              variant={hasCurrentDevicePush ? "outline" : "primary"}
              disabled={pushBusy}
              onClick={() => {
                void handlePushToggle();
              }}
            >
              {pushBusy
                ? "Working..."
                : hasCurrentDevicePush
                  ? "Disable"
                  : "Enable"}
            </Button>
          </div>
          {pushError ? (
            <p className="mt-2 text-xs text-error-600 dark:text-error-400">
              {pushError}
            </p>
          ) : null}
        </div>

        <ul className="flex h-auto flex-1 flex-col overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <li className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              Loading notifications...
            </li>
          ) : notifications.length === 0 ? (
            <li className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                No notifications yet
              </p>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Vendor, product, user, guest report, and payment alerts will show up here.
              </p>
            </li>
          ) : (
            notifications.map((notification) => (
              <li key={notification.id}>
                <Link
                  to={notification.targetUrl}
                  onClick={() => {
                    void handleNotificationClick(notification);
                    setIsOpen(false);
                  }}
                  className={`flex gap-3 rounded-lg border-b border-gray-100 p-3 px-4.5 py-3 hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-white/5 ${
                    notification.isRead
                      ? ""
                      : "bg-brand-50/40 dark:bg-brand-500/10"
                  }`}
                >
                  {renderIcon(notification)}
                  <span className="block min-w-0 flex-1">
                    <span className="mb-1.5 block text-theme-sm text-gray-700 dark:text-gray-300">
                      <span className="font-medium text-gray-800 dark:text-white/90">
                        {notification.title}
                      </span>
                      <span className="mt-1 block text-gray-500 dark:text-gray-400">
                        {notification.message}
                      </span>
                    </span>

                    <span className="flex flex-wrap items-center gap-2 text-theme-xs text-gray-500 dark:text-gray-400">
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
                      <span>
                        {formatNotificationRelativeTime(
                          notification.occurredAt
                        )}
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
        <Link
          to="/notifications"
          onClick={() => setIsOpen(false)}
          className="mt-3 flex items-center justify-center rounded-lg border border-gray-200 p-3 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
        >
          View all notifications
        </Link>
      </Dropdown>
    </div>
  );
}
