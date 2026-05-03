"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const firebaseAdmin_1 = require("../config/firebaseAdmin");
const analyticsPostgres_service_1 = require("../services/analyticsPostgres.service");
const router = (0, express_1.Router)();
const buildHealthResponse = (service, connected, details) => ({
    service,
    connected,
    checkedAt: new Date().toISOString(),
    details,
});
const summarizeError = (error) => {
    if (error instanceof Error && error.message.trim()) {
        return error.message.trim();
    }
    return "Disconnected";
};
router.get("/firestore", async (_req, res) => {
    try {
        await firebaseAdmin_1.firestore.doc("health_check/connectivity").get();
        res.json(buildHealthResponse("firestore", true, {
            message: "Connected",
        }));
    }
    catch (error) {
        res.status(503).json(buildHealthResponse("firestore", false, {
            message: summarizeError(error),
        }));
    }
});
router.get("/postgres", async (_req, res) => {
    let configSummary = null;
    try {
        configSummary = (0, analyticsPostgres_service_1.getAnalyticsConfigSummary)();
        const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
        await pool.query("SELECT 1 AS ok");
        res.json(buildHealthResponse("postgres", true, {
            message: "Connected",
            host: configSummary.host,
            database: configSummary.database,
        }));
    }
    catch (error) {
        const message = (0, analyticsPostgres_service_1.formatAnalyticsConnectionError)(error).replace(/^PostgreSQL connection failed:\s*/i, "");
        res.status(503).json(buildHealthResponse("postgres", false, {
            message: message || summarizeError(error),
            host: configSummary?.host,
            database: configSummary?.database,
        }));
    }
});
exports.default = router;
