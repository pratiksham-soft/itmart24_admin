"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dashboard_service_1 = require("../services/dashboard.service");
const router = (0, express_1.Router)();
router.get("/overview", async (_req, res) => {
    try {
        const overview = await (0, dashboard_service_1.getDashboardOverview)();
        const growth = (0, dashboard_service_1.getGrowthInsights)(overview);
        res.json({
            ...overview,
            growth,
        });
    }
    catch (error) {
        console.error("Dashboard overview error:", error);
        res.status(500).json({
            error: "Failed to load dashboard overview",
        });
    }
});
exports.default = router;
