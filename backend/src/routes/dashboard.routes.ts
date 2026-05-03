import { Router } from "express";
import { getDashboardOverview, getGrowthInsights } from "../services/dashboard.service";

const router = Router();

router.get("/overview", async (_req, res) => {
  try {
    const overview = await getDashboardOverview();
    const growth = getGrowthInsights(overview);

    res.json({
      ...overview,
      growth,
    });
  } catch (error) {
    console.error("Dashboard overview error:", error);
    res.status(500).json({
      error: "Failed to load dashboard overview",
    });
  }
});

export default router;
