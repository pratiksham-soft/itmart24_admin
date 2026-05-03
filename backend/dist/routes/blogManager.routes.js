"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const aiProvider_service_1 = require("../services/aiProvider.service");
const analyticsPostgres_service_1 = require("../services/analyticsPostgres.service");
const blogJobScheduler_service_1 = require("../services/blogJobScheduler.service");
const blogAutomation_service_1 = require("../services/blogAutomation.service");
const blogManager_service_1 = require("../services/blogManager.service");
const shopifyBlog_service_1 = require("../services/shopifyBlog.service");
const router = (0, express_1.Router)();
const toSafeRouteError = (error) => error instanceof Error ? error.message : "Request failed";
const sendDatabaseError = (res, error, fallbackMessage) => {
    const message = (0, analyticsPostgres_service_1.formatAnalyticsConnectionError)(error);
    const isConnectionError = message.includes("timeout") ||
        message.includes("ECONN") ||
        message.includes("ENOTFOUND") ||
        message.includes("PostgreSQL connection failed");
    res.status(500).json({
        error: isConnectionError ? message : fallbackMessage,
    });
};
router.get("/jobs", async (_req, res) => {
    try {
        const jobs = await (0, blogManager_service_1.listBlogJobs)();
        res.json(jobs);
    }
    catch (error) {
        console.error("Blog jobs fetch error:", error);
        sendDatabaseError(res, error, "Failed to fetch blog jobs");
    }
});
router.get("/settings/ai-provider", async (_req, res) => {
    try {
        const settings = await (0, aiProvider_service_1.getPublicAIProviderSettings)();
        res.json(settings);
    }
    catch (error) {
        console.error("AI provider settings fetch error:", error);
        sendDatabaseError(res, error, "Failed to fetch AI provider settings");
    }
});
router.put("/settings/ai-provider", async (req, res) => {
    try {
        const settings = await (0, aiProvider_service_1.updateAIProviderSettings)(req.body ?? {});
        res.json(settings);
    }
    catch (error) {
        console.error("AI provider settings update error:", error);
        res.status(400).json({
            error: error instanceof Error
                ? error.message
                : "Failed to update AI provider settings",
        });
    }
});
router.post("/jobs", async (req, res) => {
    try {
        const job = await (0, blogManager_service_1.createBlogJob)(req.body ?? {});
        await (0, blogJobScheduler_service_1.syncBlogJobSchedules)("job-created");
        console.log(`Blog job created id=${job?.id ?? "unknown"} name="${job?.name ?? ""}"`);
        res.status(201).json(job);
    }
    catch (error) {
        console.error("Blog job create error:", error);
        res.status(400).json({
            error: error instanceof Error ? error.message : "Failed to create blog job",
        });
    }
});
router.put("/jobs/:id", async (req, res) => {
    try {
        const job = await (0, blogManager_service_1.updateBlogJob)(Number(req.params.id), req.body ?? {});
        await (0, blogJobScheduler_service_1.syncBlogJobSchedules)("job-updated");
        console.log(`Blog job updated id=${job?.id ?? "unknown"} name="${job?.name ?? ""}"`);
        res.json(job);
    }
    catch (error) {
        console.error("Blog job update error:", error);
        res.status(400).json({
            error: error instanceof Error ? error.message : "Failed to update blog job",
        });
    }
});
router.patch("/jobs/:id/status", async (req, res) => {
    try {
        const job = await (0, blogManager_service_1.toggleBlogJobStatus)(Number(req.params.id), Boolean(req.body?.isActive));
        await (0, blogJobScheduler_service_1.syncBlogJobSchedules)("job-status-changed");
        console.log(`Blog job ${job?.status === "active" ? "activated" : "deactivated"} id=${job?.id ?? "unknown"} name="${job?.name ?? ""}"`);
        res.json(job);
    }
    catch (error) {
        console.error("Blog job toggle error:", error);
        res.status(400).json({
            error: error instanceof Error ? error.message : "Failed to update job status",
        });
    }
});
router.delete("/jobs/:id", async (req, res) => {
    try {
        await (0, blogManager_service_1.deleteBlogJob)(Number(req.params.id));
        await (0, blogJobScheduler_service_1.syncBlogJobSchedules)("job-deleted");
        res.status(204).send();
    }
    catch (error) {
        console.error("Blog job delete error:", error);
        res.status(500).json({ error: "Failed to delete blog job" });
    }
});
router.post("/jobs/:id/run-once", async (req, res) => {
    try {
        const jobId = Number(req.params.id);
        console.log(`Blog run-once API started jobId=${jobId}`);
        const summary = await (0, blogAutomation_service_1.runBlogJob)(Number(req.params.id), {
            triggerMode: "manual",
            requireActive: true,
        });
        res.json({
            success: true,
            message: "Blog job run completed.",
            summary,
        });
    }
    catch (error) {
        console.error("Blog job run error:", error);
        const safeError = toSafeRouteError(error);
        const isInactiveError = safeError.includes("Only active blog jobs can run in this mode") ||
            safeError.includes("Activate job before running");
        res.status(isInactiveError ? 400 : 500).json({
            success: false,
            message: isInactiveError
                ? "Activate job before running."
                : "Blog job run failed.",
            error: isInactiveError ? "Job is inactive" : safeError,
        });
    }
});
router.post("/jobs/run-active", async (_req, res) => {
    try {
        const summaries = await (0, blogAutomation_service_1.runAllActiveBlogJobs)();
        res.json(summaries);
    }
    catch (error) {
        console.error("Active blog jobs run error:", error);
        res.status(400).json({
            error: error instanceof Error ? error.message : "Failed to run active blog jobs",
        });
    }
});
router.get("/shopify-blogs", async (_req, res) => {
    try {
        const blogs = await (0, shopifyBlog_service_1.listShopifyBlogs)();
        res.json(blogs);
    }
    catch (error) {
        console.error("Shopify blogs fetch error:", error);
        sendDatabaseError(res, error, "Failed to fetch Shopify blogs");
    }
});
router.get("/templates", async (_req, res) => {
    try {
        const templates = await (0, blogManager_service_1.listBlogTemplates)();
        res.json(templates);
    }
    catch (error) {
        console.error("Blog templates fetch error:", error);
        sendDatabaseError(res, error, "Failed to fetch blog templates");
    }
});
router.post("/templates", async (req, res) => {
    try {
        const template = await (0, blogManager_service_1.createBlogTemplate)(req.body ?? {});
        res.status(201).json(template);
    }
    catch (error) {
        console.error("Blog template create error:", error);
        res.status(400).json({
            error: error instanceof Error ? error.message : "Failed to create blog template",
        });
    }
});
router.put("/templates/:id", async (req, res) => {
    try {
        const template = await (0, blogManager_service_1.updateBlogTemplate)(Number(req.params.id), req.body ?? {});
        res.json(template);
    }
    catch (error) {
        console.error("Blog template update error:", error);
        res.status(400).json({
            error: error instanceof Error ? error.message : "Failed to update blog template",
        });
    }
});
router.delete("/templates/:id", async (req, res) => {
    try {
        await (0, blogManager_service_1.deleteBlogTemplate)(Number(req.params.id));
        res.status(204).send();
    }
    catch (error) {
        console.error("Blog template delete error:", error);
        res.status(500).json({ error: "Failed to delete blog template" });
    }
});
router.get("/blogs", async (req, res) => {
    try {
        const blogs = await (0, blogManager_service_1.listBlogPosts)({
            category: typeof req.query.category === "string" ? req.query.category : undefined,
            startDate: typeof req.query.startDate === "string" ? req.query.startDate : undefined,
            endDate: typeof req.query.endDate === "string" ? req.query.endDate : undefined,
        });
        res.json(blogs);
    }
    catch (error) {
        console.error("Blog posts fetch error:", error);
        sendDatabaseError(res, error, "Failed to fetch blog posts");
    }
});
router.get("/blogs/:id", async (req, res) => {
    try {
        const blog = await (0, blogManager_service_1.getBlogPostById)(Number(req.params.id));
        if (!blog) {
            res.status(404).json({ error: "Blog post not found" });
            return;
        }
        res.json(blog);
    }
    catch (error) {
        console.error("Blog post fetch error:", error);
        res.status(500).json({ error: "Failed to fetch blog post" });
    }
});
router.post("/blogs", async (req, res) => {
    try {
        const blog = await (0, blogManager_service_1.createBlogPost)(req.body ?? {});
        res.status(201).json(blog);
    }
    catch (error) {
        console.error("Blog post create error:", error);
        res.status(400).json({
            error: error instanceof Error ? error.message : "Failed to create blog post",
        });
    }
});
router.put("/blogs/:id", async (req, res) => {
    try {
        const blog = await (0, blogManager_service_1.updateBlogPost)(Number(req.params.id), req.body ?? {});
        res.json(blog);
    }
    catch (error) {
        console.error("Blog post update error:", error);
        res.status(400).json({
            error: error instanceof Error ? error.message : "Failed to update blog post",
        });
    }
});
router.delete("/blogs/:id", async (req, res) => {
    try {
        await (0, blogManager_service_1.deleteBlogPost)(Number(req.params.id));
        res.status(204).send();
    }
    catch (error) {
        console.error("Blog post delete error:", error);
        res.status(500).json({ error: "Failed to delete blog post" });
    }
});
router.post("/posts/:id/publish", async (req, res) => {
    try {
        const publish = Boolean(req.body?.publish);
        const result = await (0, blogAutomation_service_1.createShopifyArticle)(Number(req.params.id), publish);
        res.json({
            success: true,
            message: "Blog post published to Shopify successfully.",
            post: result.blogPost,
        });
    }
    catch (error) {
        console.error("Shopify article create error:", error);
        res.status(400).json({
            success: false,
            message: "Failed to publish blog post to Shopify.",
            error: error instanceof Error ? error.message : "Failed to create Shopify article",
        });
    }
});
router.post("/posts/publish-bulk", async (req, res) => {
    try {
        const ids = Array.isArray(req.body?.ids)
            ? req.body.ids.map((value) => Number(value)).filter(Number.isFinite)
            : [];
        const results = [];
        for (const id of ids) {
            results.push(await (0, blogAutomation_service_1.createShopifyArticle)(id, true));
        }
        res.json({
            success: true,
            message: "Selected blog posts published to Shopify successfully.",
            posts: results.map((entry) => entry.blogPost),
        });
    }
    catch (error) {
        console.error("Shopify bulk publish error:", error);
        res.status(400).json({
            success: false,
            message: "Failed to publish selected blog posts to Shopify.",
            error: error instanceof Error ? error.message : "Failed to publish selected blog posts",
        });
    }
});
router.post("/blogs/:id/publish-shopify", async (req, res) => {
    try {
        const result = await (0, blogAutomation_service_1.createShopifyArticle)(Number(req.params.id), Boolean(req.body?.publish));
        res.json(result);
    }
    catch (error) {
        console.error("Legacy Shopify article create error:", error);
        res.status(400).json({
            error: error instanceof Error
                ? error.message
                : "Failed to create Shopify article",
        });
    }
});
router.get("/todo-notes", (_req, res) => {
    res.json((0, blogManager_service_1.getBlogManagerTodoNotes)());
});
router.get("/logs", async (req, res) => {
    try {
        const jobId = typeof req.query.jobId === "string" && req.query.jobId
            ? Number(req.query.jobId)
            : undefined;
        const limit = typeof req.query.limit === "string" && req.query.limit
            ? Number(req.query.limit)
            : undefined;
        const logs = await (0, blogManager_service_1.listBlogJobRunLogs)({
            jobId,
            limit,
        });
        res.json({
            success: true,
            logs,
        });
    }
    catch (error) {
        console.error("Blog job logs fetch error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch blog job logs.",
            error: (0, analyticsPostgres_service_1.formatAnalyticsConnectionError)(error),
            logs: [],
        });
    }
});
exports.default = router;
