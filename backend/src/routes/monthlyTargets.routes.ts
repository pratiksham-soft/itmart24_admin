import { Router } from "express";
import {
  getMonthlyTargetByMonth,
  getMonthlyTargetRecommendation,
  getMonthlyTargets,
  upsertMonthlyTarget,
} from "../services/monthlyTargets.service";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const targets = await getMonthlyTargets();
    res.json(targets);
  } catch (error) {
    console.error("Monthly targets fetch error:", error);
    res.status(500).json({
      error: "Failed to fetch monthly targets",
    });
  }
});

router.get("/recommendation", async (req, res) => {
  try {
    const month = String(req.query.month ?? "").trim();

    if (!month) {
      res.status(400).json({
        error: "month query parameter is required",
      });
      return;
    }

    const recommendation = await getMonthlyTargetRecommendation(month);
    res.json(recommendation);
  } catch (error) {
    console.error("Monthly target recommendation error:", error);
    res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to generate monthly target recommendation",
    });
  }
});

router.get("/:month", async (req, res) => {
  try {
    const target = await getMonthlyTargetByMonth(req.params.month);

    if (!target) {
      res.status(404).json({
        error: "Monthly target not found",
      });
      return;
    }

    res.json(target);
  } catch (error) {
    console.error("Monthly target fetch error:", error);
    res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch monthly target",
    });
  }
});

router.put("/:month", async (req, res) => {
  try {
    const savedTarget = await upsertMonthlyTarget(req.params.month, req.body ?? {});
    res.json(savedTarget);
  } catch (error) {
    console.error("Monthly target save error:", error);
    res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to save monthly target",
    });
  }
});

export default router;
