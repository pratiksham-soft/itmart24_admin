import {
  ProductRankingSyncResult,
  syncProductRankingToShopify,
} from "./productRankingSync.service";

const PRODUCT_RANKING_SYNC_INTERVAL_MS = 3 * 60 * 60 * 1000;

let productRankingSchedulerStarted = false;
let activeRankingSync: Promise<ProductRankingSyncResult> | null = null;

const runProductRankingSync = async (trigger: string) => {
  if (activeRankingSync) {
    console.log(
      `[product-ranking-sync] Existing run still in progress, skipping ${trigger} trigger`
    );
    return activeRankingSync;
  }

  activeRankingSync = (async () => {
    const startedAt = new Date().toISOString();
    console.log(
      `[product-ranking-sync] Starting ${trigger} run at ${startedAt}`
    );

    try {
      const result = await syncProductRankingToShopify();
      console.log(
        `[product-ranking-sync] Completed ${trigger} run`,
        JSON.stringify(result)
      );
      return result;
    } catch (error) {
      console.error(
        `[product-ranking-sync] Failed ${trigger} run`,
        error
      );
      throw error;
    } finally {
      activeRankingSync = null;
    }
  })();

  return activeRankingSync;
};

export const startProductRankingScheduler = () => {
  if (productRankingSchedulerStarted) {
    return;
  }

  if (process.env.DISABLE_PRODUCT_RANK_SYNC === "true") {
    console.log(
      "[product-ranking-sync] Scheduler disabled via DISABLE_PRODUCT_RANK_SYNC=true"
    );
    return;
  }

  productRankingSchedulerStarted = true;

  console.log(
    `[product-ranking-sync] Scheduler enabled. Interval: ${PRODUCT_RANKING_SYNC_INTERVAL_MS}ms`
  );

  void runProductRankingSync("startup");

  const timer = setInterval(() => {
    void runProductRankingSync("interval");
  }, PRODUCT_RANKING_SYNC_INTERVAL_MS);

  if (typeof timer.unref === "function") {
    timer.unref();
  }
};

export const runProductRankingSyncOnce = () =>
  runProductRankingSync("manual");
