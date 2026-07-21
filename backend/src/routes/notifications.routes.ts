import { Router } from "express";
import {
  archiveNotification,
  disablePushSubscriptionForEndpoint,
  getPushStatus,
  getUnreadNotificationCount,
  listNotificationPreferences,
  listNotifications,
  listPushSubscriptionsForAdmin,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  registerNotificationStream,
  syncNotifications,
  updateNotificationPreferences,
  upsertPushSubscription,
} from "../services/notifications.service";
import {
  normalizeNotificationCategory,
  normalizeNotificationSeverity,
} from "../services/adminNotifications.helpers";
import {
  requireAdminAuth,
  type AuthenticatedAdminRequest,
} from "../middleware/adminAuth.middleware";

const router = Router();

router.use(requireAdminAuth);

router.get("/", async (req: AuthenticatedAdminRequest, res) => {
  try {
    const adminId = Number(req.adminUser?.id ?? 0);
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? req.query.limit ?? 20);
    const category = normalizeNotificationCategory(req.query.category);
    const severity = normalizeNotificationSeverity(req.query.severity);
    const type =
      typeof req.query.type === "string" ? req.query.type.trim() : null;
    const readStatus =
      req.query.readStatus === "read" ||
      req.query.readStatus === "unread" ||
      req.query.readStatus === "all"
        ? req.query.readStatus
        : "all";
    const archived =
      req.query.archived === "true"
        ? true
        : req.query.archived === "false"
          ? false
          : false;

    const [listing, unreadCount] = await Promise.all([
      listNotifications(adminId, {
        page,
        pageSize,
        category,
        severity,
        type,
        readStatus,
        archived,
      }),
      getUnreadNotificationCount(adminId),
    ]);

    res.json({
      success: true,
      data: listing.items,
      total: listing.total,
      page: listing.page,
      pageSize: listing.pageSize,
      unreadCount,
    });
  } catch (error: any) {
    console.error("Notifications fetch error:", error);
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to fetch notifications",
    });
  }
});

router.get("/stream", async (req: AuthenticatedAdminRequest, res) => {
  const adminId = Number(req.adminUser?.id ?? 0);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const unsubscribe = registerNotificationStream(adminId, res);
  const keepAliveHandle = setInterval(() => {
    res.write(`event: ping\ndata: ${Date.now()}\n\n`);
  }, 15000);

  void syncNotifications().catch((error) => {
    console.error(
      "Notification sync during stream failed:",
      error instanceof Error ? error.message : String(error)
    );
  });

  req.on("close", () => {
    clearInterval(keepAliveHandle);
    unsubscribe();
    res.end();
  });
});

router.patch("/:notificationId/read", async (req: AuthenticatedAdminRequest, res) => {
  try {
    const found = await markNotificationAsRead(
      Number(req.adminUser?.id ?? 0),
      String(req.params.notificationId ?? "")
    );

    if (!found) {
      res.status(404).json({
        success: false,
        message: "Notification not found",
      });
      return;
    }

    res.json({
      success: true,
      message: "Notification marked as read",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to update notification",
    });
  }
});

router.post("/read-all", async (req: AuthenticatedAdminRequest, res) => {
  try {
    const updatedCount = await markAllNotificationsAsRead(
      Number(req.adminUser?.id ?? 0)
    );

    res.json({
      success: true,
      updatedCount,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to mark all notifications as read",
    });
  }
});

router.patch("/:notificationId/archive", async (req: AuthenticatedAdminRequest, res) => {
  try {
    const archived = await archiveNotification(
      Number(req.adminUser?.id ?? 0),
      String(req.params.notificationId ?? "")
    );

    if (!archived) {
      res.status(404).json({
        success: false,
        message: "Notification not found",
      });
      return;
    }

    res.json({
      success: true,
      message: "Notification archived",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to archive notification",
    });
  }
});

router.post("/sync", async (_req: AuthenticatedAdminRequest, res) => {
  try {
    const result = await syncNotifications({ force: true });
    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to sync notifications",
    });
  }
});

router.get("/preferences", async (req: AuthenticatedAdminRequest, res) => {
  try {
    const preferences = await listNotificationPreferences(
      Number(req.adminUser?.id ?? 0)
    );

    res.json({
      success: true,
      data: preferences,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to load preferences",
    });
  }
});

router.put("/preferences", async (req: AuthenticatedAdminRequest, res) => {
  try {
    const preferences = await updateNotificationPreferences(
      Number(req.adminUser?.id ?? 0),
      req.body && typeof req.body === "object" ? req.body : {}
    );

    res.json({
      success: true,
      data: preferences,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error?.message || "Failed to save preferences",
    });
  }
});

router.get("/push", async (req: AuthenticatedAdminRequest, res) => {
  try {
    const status = await getPushStatus(Number(req.adminUser?.id ?? 0));
    res.json({
      success: true,
      data: status,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to load push settings",
    });
  }
});

router.get("/push/subscriptions", async (req: AuthenticatedAdminRequest, res) => {
  try {
    const subscriptions = await listPushSubscriptionsForAdmin(
      Number(req.adminUser?.id ?? 0)
    );
    res.json({
      success: true,
      data: subscriptions,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to load push subscriptions",
    });
  }
});

router.post("/push/subscriptions", async (req: AuthenticatedAdminRequest, res) => {
  try {
    const subscription = await upsertPushSubscription({
      adminId: Number(req.adminUser?.id ?? 0),
      subscription:
        req.body?.subscription && typeof req.body.subscription === "object"
          ? req.body.subscription
          : req.body,
      userAgent:
        typeof req.body?.userAgent === "string" ? req.body.userAgent : null,
      deviceLabel:
        typeof req.body?.deviceLabel === "string" ? req.body.deviceLabel : null,
    });

    res.status(201).json({
      success: true,
      data: subscription,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error?.message || "Failed to save push subscription",
    });
  }
});

router.delete("/push/subscriptions", async (req: AuthenticatedAdminRequest, res) => {
  try {
    const removed = await disablePushSubscriptionForEndpoint(
      Number(req.adminUser?.id ?? 0),
      typeof req.body?.endpoint === "string" ? req.body.endpoint : ""
    );

    if (!removed) {
      res.status(404).json({
        success: false,
        message: "Push subscription not found",
      });
      return;
    }

    res.json({
      success: true,
      message: "Push subscription disabled",
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error?.message || "Failed to disable push subscription",
    });
  }
});

export default router;
