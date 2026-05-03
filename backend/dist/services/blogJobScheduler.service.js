"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startBlogJobScheduler = exports.syncBlogJobSchedules = void 0;
const blogAutomation_service_1 = require("./blogAutomation.service");
const blogManager_service_1 = require("./blogManager.service");
const TICK_INTERVAL_MS = 30000;
let schedulerTimer = null;
let scheduledJobs = new Map();
let lastRunKeyByJobId = new Map();
let syncInFlight = null;
const parseCronPart = (part, value) => {
    if (part === "*") {
        return true;
    }
    return Number(part) === value;
};
const matchesCronExpression = (cronExpression, date) => {
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length !== 5) {
        return false;
    }
    return (parseCronPart(parts[0], date.getMinutes()) &&
        parseCronPart(parts[1], date.getHours()) &&
        parseCronPart(parts[2], date.getDate()) &&
        parseCronPart(parts[3], date.getMonth() + 1) &&
        parseCronPart(parts[4], date.getDay()));
};
const buildMinuteKey = (date) => [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
].join("-");
const syncScheduledJobsInternal = async (reason) => {
    const jobs = await (0, blogManager_service_1.listBlogJobs)();
    const activeJobs = jobs.filter((job) => job.status === "active");
    const nextScheduledJobs = new Map();
    const currentMinuteKey = buildMinuteKey(new Date());
    activeJobs.forEach((job) => {
        nextScheduledJobs.set(job.id, {
            id: job.id,
            name: job.name,
            cronExpression: job.cronExpression,
        });
    });
    jobs
        .filter((job) => job.status !== "active")
        .forEach((job) => {
        console.log(`Blog job skipped for scheduler (inactive) id=${job.id} name="${job.name}" reason=${reason}`);
    });
    scheduledJobs.forEach((job, jobId) => {
        if (!nextScheduledJobs.has(jobId)) {
            console.log(`Blog job deactivated id=${jobId} name="${job.name}"`);
            lastRunKeyByJobId.delete(jobId);
        }
    });
    nextScheduledJobs.forEach((job, jobId) => {
        const previous = scheduledJobs.get(jobId);
        if (!previous) {
            lastRunKeyByJobId.set(jobId, currentMinuteKey);
            console.log(`Blog job activated id=${jobId} name="${job.name}" cron="${job.cronExpression}"`);
            return;
        }
        if (previous.cronExpression !== job.cronExpression) {
            lastRunKeyByJobId.set(jobId, currentMinuteKey);
            console.log(`Blog job schedule updated id=${jobId} name="${job.name}" cron="${job.cronExpression}"`);
        }
    });
    scheduledJobs = nextScheduledJobs;
    console.log(`Active blog jobs scheduled count=${scheduledJobs.size} reason=${reason}`);
};
const syncBlogJobSchedules = async (reason = "manual-sync") => {
    if (!syncInFlight) {
        syncInFlight = syncScheduledJobsInternal(reason).finally(() => {
            syncInFlight = null;
        });
    }
    return syncInFlight;
};
exports.syncBlogJobSchedules = syncBlogJobSchedules;
const tickScheduledJobs = async () => {
    const now = new Date();
    const minuteKey = buildMinuteKey(now);
    for (const [jobId, job] of scheduledJobs) {
        if (!matchesCronExpression(job.cronExpression, now)) {
            continue;
        }
        if (lastRunKeyByJobId.get(jobId) === minuteKey) {
            continue;
        }
        lastRunKeyByJobId.set(jobId, minuteKey);
        console.log(`Scheduled blog job triggered id=${jobId} name="${job.name}"`);
        (0, blogAutomation_service_1.runBlogJob)(jobId, {
            triggerMode: "active_batch",
            requireActive: true,
        }).catch((error) => {
            console.error(`Scheduled blog job failed id=${jobId} name="${job.name}":`, error instanceof Error ? error.message : error);
        });
    }
};
const startBlogJobScheduler = async () => {
    if (schedulerTimer) {
        return;
    }
    await (0, exports.syncBlogJobSchedules)("startup");
    schedulerTimer = setInterval(() => {
        tickScheduledJobs().catch((error) => {
            console.error("Blog job scheduler tick failed:", error instanceof Error ? error.message : error);
        });
    }, TICK_INTERVAL_MS);
};
exports.startBlogJobScheduler = startBlogJobScheduler;
