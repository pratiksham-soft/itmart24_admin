"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const visitorAnalytics_service_1 = require("./src/services/visitorAnalytics.service");
const analyticsPostgres_service_1 = require("./src/services/analyticsPostgres.service");
async function main() {
    await (0, analyticsPostgres_service_1.initializeAnalyticsPostgres)();
    try {
        const summary = await (0, visitorAnalytics_service_1.getVisitorAnalyticsSummary)();
        console.log("SUMMARY_OK", JSON.stringify(summary).slice(0, 500));
    }
    catch (error) {
        console.error("SUMMARY_ERROR", error);
    }
    try {
        const visitors = await (0, visitorAnalytics_service_1.listVisitors)({
            page: "1",
            limit: "25",
            botStatus: "exclude",
            startDate: "2026-07-17",
            endDate: "2026-07-23",
        });
        console.log("VISITORS_OK", JSON.stringify(visitors).slice(0, 500));
    }
    catch (error) {
        console.error("VISITORS_ERROR", error);
    }
}
void main().catch((error) => {
    console.error("FATAL", error);
    process.exitCode = 1;
});
