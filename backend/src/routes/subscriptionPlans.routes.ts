import { Request, Router } from "express";
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
    const plans = await getAllSubscriptionPlans();
    res.json(plans);
  } catch (error) {
    console.error("Fetch plans error:", error);
    res.status(500).json({ error: "Failed to fetch subscription plans" });
  }
});

router.get("/vendor-pricing", async (req, res) => {
  try {
    const requestedCountryCode = resolveRequestedCountryCode(req);
    const pricingCountryCode = requestedCountryCode === "IN" ? "IN" : null;
    const plans = await getAllSubscriptionPlans();

    const activePlans = plans
      .filter((plan) => plan.isActive !== false)
      .sort(
        (left, right) =>
          Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0)
      );

    const payload = activePlans.map((plan) => {
      const monthlyPeriod =
        plan.periods.find((period) =>
          String(period.label ?? "").toLowerCase().includes("month")
        ) ?? plan.periods[0];

      return {
        id: plan.id,
        slug: plan.slug,
        periods: plan.periods.map((period) => ({
          id: period.id,
          pricing: resolvePricingDetails(period, pricingCountryCode, monthlyPeriod),
        })),
        portfolioPlans: (plan.portfolioPlans ?? [])
          .filter((portfolioPlan) => portfolioPlan.isActive !== false)
          .map((portfolioPlan) => {
            const monthlyOption =
              portfolioPlan.pricingOptions.find(
                (option) => Number(option.periodInMonths) === 1
              ) ??
              (monthlyPeriod
                ? {
                    periodInMonths: 1,
                    price:
                      Number(monthlyPeriod.price ?? 0) *
                      Number(portfolioPlan.minProducts ?? 1),
                    discountPercentage: 0,
                    countryPricing: [],
                  }
                : null);

            return {
              id: portfolioPlan.id,
              pricingOptions: portfolioPlan.pricingOptions.map((option) => ({
                id: option.id,
                pricing: resolvePricingDetails(
                  {
                    durationInMonths: option.periodInMonths,
                    price: option.price,
                    discountPercentage: option.discountPercentage,
                    countryPricing: option.countryPricing,
                  },
                  pricingCountryCode,
                  monthlyOption
                    ? {
                        durationInMonths: monthlyOption.periodInMonths,
                        price: monthlyOption.price,
                        discountPercentage: monthlyOption.discountPercentage,
                        countryPricing: monthlyOption.countryPricing,
                      }
                    : null
                ),
              })),
            };
          }),
      };
    });

    res.json({
      detectedCountryCode: requestedCountryCode,
      pricingCountryCode: pricingCountryCode ?? "GLOBAL",
      currencyCode: pricingCountryCode === "IN" ? "INR" : "USD",
      plans: payload,
    });
  } catch (error) {
    console.error("Fetch vendor pricing error:", error);
    res.status(500).json({ error: "Failed to fetch vendor pricing" });
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
