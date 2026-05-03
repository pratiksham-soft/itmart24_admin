import { Router } from "express";
import { firestore } from "../config/firebaseAdmin";
import {
  formatAnalyticsConnectionError,
  getAnalyticsConfigSummary,
  getAnalyticsPool,
} from "../services/analyticsPostgres.service";

type HealthService = "firestore" | "postgres";

type HealthResponse = {
  service: HealthService;
  connected: boolean;
  checkedAt: string;
  details: {
    message: string;
    host?: string;
    database?: string;
  };
};

const router = Router();

const buildHealthResponse = (
  service: HealthService,
  connected: boolean,
  details: HealthResponse["details"]
): HealthResponse => ({
  service,
  connected,
  checkedAt: new Date().toISOString(),
  details,
});

const summarizeError = (error: unknown) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "Disconnected";
};

router.get("/firestore", async (_req, res) => {
  try {
    await firestore.doc("health_check/connectivity").get();

    res.json(
      buildHealthResponse("firestore", true, {
        message: "Connected",
      })
    );
  } catch (error) {
    res.status(503).json(
      buildHealthResponse("firestore", false, {
        message: summarizeError(error),
      })
    );
  }
});

router.get("/postgres", async (_req, res) => {
  let configSummary: ReturnType<typeof getAnalyticsConfigSummary> | null = null;

  try {
    configSummary = getAnalyticsConfigSummary();
    const pool = await getAnalyticsPool();
    await pool.query("SELECT 1 AS ok");

    res.json(
      buildHealthResponse("postgres", true, {
        message: "Connected",
        host: configSummary.host,
        database: configSummary.database,
      })
    );
  } catch (error) {
    const message = formatAnalyticsConnectionError(error).replace(
      /^PostgreSQL connection failed:\s*/i,
      ""
    );

    res.status(503).json(
      buildHealthResponse("postgres", false, {
        message: message || summarizeError(error),
        host: configSummary?.host,
        database: configSummary?.database,
      })
    );
  }
});

export default router;
