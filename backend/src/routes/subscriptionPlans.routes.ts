import { Router } from "express";
import {
  createPortfolioPlan,
  createSubscriptionPlan,
  deleteSubscriptionPlan,
  getAllSubscriptionPlans,
  getSubscriptionPlanById,
  isSubscriptionPlanInUse,
  seedPortfolioPlans,
  setPortfolioPlanActiveState,
  updatePortfolioPlan,
  updateSubscriptionPlan,
} from "../services/subscriptionPlans.service";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const plans = await getAllSubscriptionPlans();
    res.json(plans);
  } catch (error) {
    console.error("Fetch plans error:", error);
    res.status(500).json({ error: "Failed to fetch subscription plans" });
  }
});

router.post("/portfolio/seed", async (_req, res) => {
  try {
    await seedPortfolioPlans();
    const plans = await getAllSubscriptionPlans();
    res.json({ success: true, plans });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to seed portfolio plans";
    console.error("Seed portfolio plans error:", error);
    res.status(400).json({ error: message });
  }
});

router.post("/portfolio", async (req, res) => {
  try {
    const portfolioPlan = await createPortfolioPlan(req.body);
    res.status(201).json(portfolioPlan);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create portfolio plan";
    console.error("Create portfolio plan error:", error);
    res.status(400).json({ error: message });
  }
});

router.put("/:planId/portfolio/:portfolioPlanId", async (req, res) => {
  try {
    const portfolioPlan = await updatePortfolioPlan(
      req.params.planId,
      req.params.portfolioPlanId,
      req.body
    );

    res.json(portfolioPlan);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update portfolio plan";
    console.error("Update portfolio plan error:", error);
    res.status(400).json({ error: message });
  }
});

router.patch("/:planId/portfolio/:portfolioPlanId/status", async (req, res) => {
  try {
    const portfolioPlan = await setPortfolioPlanActiveState(
      req.params.planId,
      req.params.portfolioPlanId,
      Boolean(req.body?.isActive)
    );

    res.json(portfolioPlan);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update portfolio plan status";
    console.error("Update portfolio plan status error:", error);
    res.status(400).json({ error: message });
  }
});

router.get("/:planId", async (req, res) => {
  try {
    const plan = await getSubscriptionPlanById(req.params.planId);

    if (!plan) {
      return res.status(404).json({ error: "Plan not found" });
    }

    res.json(plan);
  } catch (error) {
    console.error("Fetch plan error:", error);
    res.status(500).json({ error: "Failed to fetch plan" });
  }
});

router.post("/", async (req, res) => {
  try {
    const planId = await createSubscriptionPlan(req.body);
    res.status(201).json({ id: planId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create plan";
    console.error("Create plan error:", error);
    res.status(400).json({ error: message });
  }
});

router.put("/:planId", async (req, res) => {
  try {
    await updateSubscriptionPlan(req.params.planId, req.body);
    res.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update plan";
    console.error("Update plan error:", error);
    res.status(400).json({ error: message });
  }
});

router.delete("/:planId", async (req, res) => {
  try {
    const { planId } = req.params;
    const inUse = await isSubscriptionPlanInUse(planId);

    if (inUse) {
      return res.status(400).json({
        error: "Plan is currently in use and cannot be deleted",
      });
    }

    await deleteSubscriptionPlan(planId);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete plan error:", error);
    res.status(500).json({ error: "Failed to delete plan" });
  }
});

export default router;
