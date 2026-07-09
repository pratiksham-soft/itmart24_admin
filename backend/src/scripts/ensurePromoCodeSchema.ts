import path from "path";
import dotenv from "dotenv";
import {
  ensureDatabase,
  getAnalyticsPool,
} from "../services/analyticsPostgres.service";
import {
  ensureDefaultPromoCodeSeeds,
} from "../services/planPromoCodes.service";
import { PROMO_CODE_TABLE_STATEMENTS } from "../services/planPromoCodes.schema";

const normalizeEnvironment = (value?: string) =>
  value === "production" ? "production" : "development";

const requestedEnvironment = normalizeEnvironment(process.argv[2]);
const backendRoot = path.resolve(__dirname, "..", "..");
const envFile = path.join(backendRoot, `.env.${requestedEnvironment}`);

dotenv.config({ path: envFile, override: true });

const run = async () => {
  await ensureDatabase();
  const pool = await getAnalyticsPool();
  const client = await pool.connect();

  try {
    for (const statement of PROMO_CODE_TABLE_STATEMENTS) {
      await client.query(statement);
    }

    await ensureDefaultPromoCodeSeeds(client);
    console.log(
      `Promo code schema ensured for ${requestedEnvironment} database ${process.env.ANALYTICS_PG_DATABASE}`
    );
  } finally {
    client.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error(
    "Failed to ensure promo code schema:",
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
});
