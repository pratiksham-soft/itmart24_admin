"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const subscriptionPlans_service_1 = require("../services/subscriptionPlans.service");
const router = (0, express_1.Router)();
/**
 * GET /api/subscription-plans
 * List all plans
 */
router.get("/", async (_req, res) => {
    try {
        const plans = await (0, subscriptionPlans_service_1.getAllSubscriptionPlans)();
        res.json(plans);
    }
    catch (error) {
        console.error("Fetch plans error:", error);
        res.status(500).json({ error: "Failed to fetch subscription plans" });
    }
});
/**
 * GET /api/subscription-plans/:planId
 */
router.get("/:planId", async (req, res) => {
    try {
        const plan = await (0, subscriptionPlans_service_1.getSubscriptionPlanById)(req.params.planId);
        if (!plan) {
            return res.status(404).json({ error: "Plan not found" });
        }
        res.json(plan);
    }
    catch (error) {
        console.error("Fetch plan error:", error);
        res.status(500).json({ error: "Failed to fetch plan" });
    }
});
/**
 * POST /api/subscription-plans
 * Create plan (slug used as doc ID)
 */
router.post("/", async (req, res) => {
    try {
        const planId = await (0, subscriptionPlans_service_1.createSubscriptionPlan)(req.body);
        res.status(201).json({ id: planId });
    }
    catch (error) {
        console.error("Create plan error:", error);
        res.status(500).json({ error: "Failed to create plan" });
    }
});
/**
 * PUT /api/subscription-plans/:planId
 */
router.put("/:planId", async (req, res) => {
    try {
        await (0, subscriptionPlans_service_1.updateSubscriptionPlan)(req.params.planId, req.body);
        res.json({ success: true });
    }
    catch (error) {
        console.error("Update plan error:", error);
        res.status(500).json({ error: "Failed to update plan" });
    }
});
/**
 * DELETE /api/subscription-plans/:planId
 */
router.delete("/:planId", async (req, res) => {
    try {
        const { planId } = req.params;
        const inUse = await (0, subscriptionPlans_service_1.isSubscriptionPlanInUse)(planId);
        if (inUse) {
            return res.status(400).json({
                error: "Plan is currently in use and cannot be deleted",
            });
        }
        await (0, subscriptionPlans_service_1.deleteSubscriptionPlan)(planId);
        res.json({ success: true });
    }
    catch (error) {
        console.error("Delete plan error:", error);
        res.status(500).json({ error: "Failed to delete plan" });
    }
});
exports.default = router;
