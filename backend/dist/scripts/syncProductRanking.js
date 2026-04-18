"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const productRankingScheduler_service_1 = require("../services/productRankingScheduler.service");
async function main() {
    try {
        const result = await (0, productRankingScheduler_service_1.runProductRankingSyncOnce)();
        console.log("[product-ranking-sync] Manual run completed", JSON.stringify(result, null, 2));
    }
    catch (error) {
        console.error("[product-ranking-sync] Manual run failed", error);
        process.exit(1);
    }
}
void main();
