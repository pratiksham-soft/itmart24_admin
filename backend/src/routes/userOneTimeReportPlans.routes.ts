import { Router } from "express";
import {
  createUserOneTimeReportPlan,
  deleteUserOneTimeReportPlan,
  getUserOneTimeReportPlanById,
  listUserOneTimeReportPlans,
  updateUserOneTimeReportPlan,
} from "../services/userOneTimeReportPlans.service";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const plans = await listUserOneTimeReportPlans();
    res.json(plans);
  } catch (error) {
    console.error("Fetch one-time report plans error:", error);
    res.status(500).json({ error: "Failed to fetch one-time report plans" });
  }
});

router.get("/:planId", async (req, res) => {
  try {
    const plan = await getUserOneTimeReportPlanById(req.params.planId);

    if (!plan) {
      return res.status(404).json({ error: "One-time report plan not found" });
    }

    res.json(plan);
  } catch (error) {
    console.error("Fetch one-time report plan error:", error);
    res.status(500).json({ error: "Failed to fetch one-time report plan" });
  }
});

router.post("/", async (req, res) => {
  try {
    const plan = await createUserOneTimeReportPlan(req.body);
    res.status(201).json(plan);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create one-time report plan";
    console.error("Create one-time report plan error:", error);
    res.status(400).json({ error: message });
  }
});

router.put("/:planId", async (req, res) => {
  try {
    const plan = await updateUserOneTimeReportPlan(req.params.planId, req.body);
    res.json(plan);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update one-time report plan";
    console.error("Update one-time report plan error:", error);
    res.status(400).json({ error: message });
  }
});

router.delete("/:planId", async (req, res) => {
  try {
    await deleteUserOneTimeReportPlan(req.params.planId);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete one-time report plan error:", error);
    res.status(500).json({ error: "Failed to delete one-time report plan" });
  }
});

export default router;
