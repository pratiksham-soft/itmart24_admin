"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const analyticsPostgres_service_1 = require("./src/services/analyticsPostgres.service");
const crmEmailTracking_service_1 = require("./src/services/crmEmailTracking.service");
const main = async () => {
    const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
    const result = await pool.query(`
      SELECT tracking_token
      FROM crm_campaign_recipients
      WHERE tracking_token IS NOT NULL
      ORDER BY id DESC
      LIMIT 1
    `);
    const token = String(result.rows[0]?.tracking_token ?? "");
    if (!token) {
        throw new Error("No tracking token found for unsubscribe verification.");
    }
    const first = await (0, crmEmailTracking_service_1.unsubscribeByToken)(token, "unsubscribe_link");
    const second = await (0, crmEmailTracking_service_1.unsubscribeByToken)(token, "unsubscribe_link");
    console.log(JSON.stringify({
        token,
        first,
        second,
    }, null, 2));
    await pool.end();
};
void main().catch(async (error) => {
    console.error("verify unsubscribe idempotent failed:", error instanceof Error ? error.message : error);
    try {
        const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
        await pool.end();
    }
    catch { }
    process.exitCode = 1;
});
