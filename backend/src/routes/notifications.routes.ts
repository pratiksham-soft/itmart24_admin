import { Router } from "express";
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  syncNotifications,
} from "../services/notifications.service";

const router = Router();

router.get("/", async (req, res) => {
  try {
    await syncNotifications();

    const limit =
      typeof req.query.limit === "string"
        ? Number(req.query.limit)
        : 50;

    const [notifications, unreadCount] = await Promise.all([
      listNotifications(limit),
      getUnreadNotificationCount(),
    ]);

    res.json({
      success: true,
      data: notifications,
      unreadCount,
    });
  } catch (error: any) {
    console.error("Notifications fetch error:", error);
    res.status(500).json({
      success: false,
      message:
        error?.message || "Failed to fetch notifications",
    });
  }
});

router.post("/sync", async (_req, res) => {
  try {
    const result = await syncNotifications();

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error("Notifications sync error:", error);
    res.status(500).json({
      success: false,
      message:
        error?.message || "Failed to sync notifications",
    });
  }
});

router.patch("/:notificationId/read", async (req, res) => {
  try {
    const found = await markNotificationAsRead(
      req.params.notificationId
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
    console.error("Notification read error:", error);
    res.status(500).json({
      success: false,
      message:
        error?.message || "Failed to update notification",
    });
  }
});

router.post("/read-all", async (_req, res) => {
  try {
    const updatedCount = await markAllNotificationsAsRead();

    res.json({
      success: true,
      updatedCount,
    });
  } catch (error: any) {
    console.error("Notifications read-all error:", error);
    res.status(500).json({
      success: false,
      message:
        error?.message || "Failed to mark all notifications as read",
    });
  }
});

export default router;
