import { runProductRankingSyncOnce } from "../services/productRankingScheduler.service";

async function main() {
  try {
    const result = await runProductRankingSyncOnce();
    console.log(
      "[product-ranking-sync] Manual run completed",
      JSON.stringify(result, null, 2)
    );
  } catch (error) {
    console.error("[product-ranking-sync] Manual run failed", error);
    process.exit(1);
  }
}

void main();
