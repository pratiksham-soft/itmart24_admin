"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const notifications_service_1 = require("../services/notifications.service");
const router = (0, express_1.Router)();
router.get("/", async (req, res) => {
    try {
        await (0, notifications_service_1.syncNotifications)();
        const limit = typeof req.query.limit === "string"
            ? Number(req.query.limit)
            : 50;
        const [notifications, unreadCount] = await Promise.all([
            (0, notifications_service_1.listNotifications)(limit),
            (0, notifications_service_1.getUnreadNotificationCount)(),
        ]);
        res.json({
            success: true,
            data: notifications,
            unreadCount,
        });
    }
    catch (error) {
        console.error("Notifications fetch error:", error);
        res.status(500).json({
            success: false,
            message: error?.message || "Failed to fetch notifications",
        });
    }
});
router.post("/sync", async (_req, res) => {
    try {
        const result = await (0, notifications_service_1.syncNotifications)();
        res.json({
            success: true,
            ...result,
        });
    }
    catch (error) {
        console.error("Notifications sync error:", error);
        res.status(500).json({
            success: false,
            message: error?.message || "Failed to sync notifications",
        });
    }
});
router.patch("/:notificationId/read", async (req, res) => {
    try {
        const found = await (0, notifications_service_1.markNotificationAsRead)(req.params.notificationId);
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
    }
    catch (error) {
        console.error("Notification read error:", error);
        res.status(500).json({
            success: false,
            message: error?.message || "Failed to update notification",
        });
    }
});
router.post("/read-all", async (_req, res) => {
    try {
        const updatedCount = await (0, notifications_service_1.markAllNotificationsAsRead)();
        res.json({
            success: true,
            updatedCount,
        });
    }
    catch (error) {
        console.error("Notifications read-all error:", error);
        res.status(500).json({
            success: false,
            message: error?.message || "Failed to mark all notifications as read",
        });
    }
});
exports.default = router;
