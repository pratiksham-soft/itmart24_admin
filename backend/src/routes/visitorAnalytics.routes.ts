import { RequestHandler, Router } from "express";
import { requireAdminAuth } from "../middleware/adminAuth.middleware";
import {
  getB2BLeadZoneDownloadAnalytics,
  getLiveVisitors,
  getLocationAnalytics,
  getPageAnalytics,
  getVisitorAnalyticsSummary,
  getVisitorDetails,
  getVisitorSessionDetails,
  getVisitorTrends,
  listVisitors,
} from "../services/visitorAnalytics.service";

const router = Router();

router.use(requireAdminAuth);

function withRouteErrorLogging(label: string, handler: RequestHandler): RequestHandler {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      console.error(`[visitor-analytics] ${label} failed`, {
        path: req.originalUrl,
        method: req.method,
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
    }
  };
}

router.get("/summary", withRouteErrorLogging("summary", async (_req, res) => {
  res.json({
    success: true,
    data: await getVisitorAnalyticsSummary(),
  });
}));

router.get("/live", withRouteErrorLogging("live", async (_req, res) => {
  res.json({
    success: true,
    data: await getLiveVisitors(),
  });
}));

router.get("/downloads/b2b-lead-zone", withRouteErrorLogging("downloads-b2b-lead-zone", async (req, res) => {
  res.json({
    success: true,
    data: await getB2BLeadZoneDownloadAnalytics(req.query as Record<string, string | null | undefined>),
  });
}));

router.get("/locations", withRouteErrorLogging("locations", async (req, res) => {
  res.json({
    success: true,
    data: await getLocationAnalytics(req.query as Record<string, string | null | undefined>),
  });
}));

router.get("/pages", withRouteErrorLogging("pages", async (req, res) => {
  res.json({
    success: true,
    data: await getPageAnalytics(req.query as Record<string, string | null | undefined>),
  });
}));

router.get("/trends", withRouteErrorLogging("trends", async (_req, res) => {
  res.json({
    success: true,
    data: await getVisitorTrends(),
  });
}));

router.get("/sessions/:sessionId", withRouteErrorLogging("session-details", async (req, res) => {
  const data = await getVisitorSessionDetails(String(req.params.sessionId));
  if (!data) {
    res.status(404).json({
      success: false,
      message: "Visitor session not found.",
    });
    return;
  }

  res.json({
    success: true,
    data,
  });
}));

router.get("/:visitorId", withRouteErrorLogging("visitor-details", async (req, res) => {
  const data = await getVisitorDetails(String(req.params.visitorId));
  if (!data) {
    res.status(404).json({
      success: false,
      message: "Visitor not found.",
    });
    return;
  }

  res.json({
    success: true,
    data,
  });
}));

router.get("/", withRouteErrorLogging("list", async (req, res) => {
  const result = await listVisitors(req.query as Record<string, string | null | undefined>);

  if ("csv" in result) {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="visitor-analytics-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(result.csv);
    return;
  }

  res.json({
    success: true,
    data: result,
  });
}));

export default router;
