import { Request, Router } from "express";
import {
  createUserPortalPlan,
  deleteUserPortalPlan,
  getUserPortalPlanById,
  listUserPortalPlans,
  updateUserPortalPlan,
} from "../services/userPortalPlans.service";
import {
  detectVisitorCountryCode,
  resolvePricingDetails,
} from "../services/subscriptionPlanPricing";

const router = Router();

const resolveRequestedCountryCode = (req: Request) => {
  const queryCountryCode =
    typeof req.query.countryCode === "string" ? req.query.countryCode : null;

  return (
    (queryCountryCode ? queryCountryCode.trim().toUpperCase() : null) ??
    detectVisitorCountryCode(req.headers)
  );
};

router.get("/", async (_req, res) => {
  try {
    const plans = await listUserPortalPlans();
    res.json(plans);
  } catch (error) {
    console.error("Fetch user plans error:", error);
    res.status(500).json({ error: "Failed to fetch user plans" });
  }
});

router.get("/public", async (req, res) => {
  try {
    const requestedCountryCode = resolveRequestedCountryCode(req);
    const plans = await listUserPortalPlans();

    const activePlans = plans
      .filter((plan: Awaited<typeof plans>[number]) => plan.isActive)
      .sort(
        (left: Awaited<typeof plans>[number], right: Awaited<typeof plans>[number]) =>
          left.sortOrder - right.sortOrder
      );

    res.json({
      detectedCountryCode: requestedCountryCode,
      plans: activePlans.map((plan: Awaited<typeof plans>[number]) => {
        const monthlyReference =
          plan.periods.find(
            (period: Awaited<typeof plans>[number]["periods"][number]) =>
              Number(period.durationInMonths) === 1
          ) ??
          plan.periods[0] ??
          null;

        return {
          id: plan.id,
          name: plan.name,
          slug: plan.slug,
          description: plan.description,
          features: plan.features,
          periods: plan.periods.map(
            (period: Awaited<typeof plans>[number]["periods"][number]) => ({
              id: period.id,
              label: period.label,
              durationInMonths: period.durationInMonths,
              usdPricing: resolvePricingDetails(period, null, monthlyReference),
              inrPricing: resolvePricingDetails(period, "IN", monthlyReference),
              pricing: resolvePricingDetails(
                period,
                requestedCountryCode,
                monthlyReference
              ),
            })
          ),
        };
      }),
    });
  } catch (error) {
    console.error("Fetch public user plans error:", error);
    res.status(500).json({ error: "Failed to fetch public user plans" });
  }
});

router.get("/:planId", async (req, res) => {
  try {
    const plan = await getUserPortalPlanById(req.params.planId);

    if (!plan) {
      return res.status(404).json({ error: "User plan not found" });
    }

    res.json(plan);
  } catch (error) {
    console.error("Fetch user plan error:", error);
    res.status(500).json({ error: "Failed to fetch user plan" });
  }
});

router.post("/", async (req, res) => {
  try {
    const plan = await createUserPortalPlan(req.body);
    res.status(201).json(plan);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create user plan";
    console.error("Create user plan error:", error);
    res.status(400).json({ error: message });
  }
});

router.put("/:planId", async (req, res) => {
  try {
    const plan = await updateUserPortalPlan(req.params.planId, req.body);
    res.json(plan);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update user plan";
    console.error("Update user plan error:", error);
    res.status(400).json({ error: message });
  }
});

router.delete("/:planId", async (req, res) => {
  try {
    await deleteUserPortalPlan(req.params.planId);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete user plan error:", error);
    res.status(500).json({ error: "Failed to delete user plan" });
  }
});

export default router;
