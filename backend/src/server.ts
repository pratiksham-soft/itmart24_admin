import "./config/env";
import app from "./app";
import {
    formatAnalyticsConnectionError,
    getAnalyticsConfigSummary,
    initializeAnalyticsPostgres,
} from "./services/analyticsPostgres.service";
import { startBlogJobScheduler } from "./services/blogJobScheduler.service";
import { startNotificationsSyncLoop } from "./services/notifications.service";
//import { startProductRankingScheduler } from "./services/productRankingScheduler.service";

const PORT = process.env.PORT || 5000;

process.on("unhandledRejection", (error) => {
    console.error(
        "Unhandled promise rejection:",
        error instanceof Error ? error.message : String(error)
    );
});

process.on("uncaughtException", (error) => {
    console.error(
        "Uncaught exception:",
        error instanceof Error ? error.message : String(error)
    );
});

app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
    //startProductRankingScheduler();
});

const analyticsConfig = getAnalyticsConfigSummary();
console.log(
    `Analytics PostgreSQL configured host=${analyticsConfig.host} port=${analyticsConfig.port} db=${analyticsConfig.database}`
);

initializeAnalyticsPostgres()
    .then(() => {
        startNotificationsSyncLoop();
        return startBlogJobScheduler();
    })
    .then(() => {
        console.log("Blog job scheduler ready");
    })
    .catch((error) => {
        console.error(
            "Analytics PostgreSQL init failed:",
            formatAnalyticsConnectionError(error)
        );
    });
