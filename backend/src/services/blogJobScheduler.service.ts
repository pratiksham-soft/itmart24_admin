import { runBlogJob } from "./blogAutomation.service";
import { listBlogJobs } from "./blogManager.service";

type ScheduledJob = {
  id: number;
  name: string;
  cronExpression: string;
};

const TICK_INTERVAL_MS = 30000;

let schedulerTimer: NodeJS.Timeout | null = null;
let scheduledJobs = new Map<number, ScheduledJob>();
let lastRunKeyByJobId = new Map<number, string>();
let syncInFlight: Promise<void> | null = null;

const parseCronPart = (part: string, value: number) => {
  if (part === "*") {
    return true;
  }

  return Number(part) === value;
};

const matchesCronExpression = (cronExpression: string, date: Date) => {
  const parts = cronExpression.trim().split(/\s+/);

  if (parts.length !== 5) {
    return false;
  }

  return (
    parseCronPart(parts[0], date.getMinutes()) &&
    parseCronPart(parts[1], date.getHours()) &&
    parseCronPart(parts[2], date.getDate()) &&
    parseCronPart(parts[3], date.getMonth() + 1) &&
    parseCronPart(parts[4], date.getDay())
  );
};

const buildMinuteKey = (date: Date) =>
  [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
  ].join("-");

const syncScheduledJobsInternal = async (reason: string) => {
  const jobs = await listBlogJobs();
  const activeJobs = jobs.filter((job) => job.status === "active");
  const nextScheduledJobs = new Map<number, ScheduledJob>();
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
      console.log(
        `Blog job skipped for scheduler (inactive) id=${job.id} name="${job.name}" reason=${reason}`
      );
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
      console.log(
        `Blog job schedule updated id=${jobId} name="${job.name}" cron="${job.cronExpression}"`
      );
    }
  });

  scheduledJobs = nextScheduledJobs;
  console.log(
    `Active blog jobs scheduled count=${scheduledJobs.size} reason=${reason}`
  );
};

export const syncBlogJobSchedules = async (reason = "manual-sync") => {
  if (!syncInFlight) {
    syncInFlight = syncScheduledJobsInternal(reason).finally(() => {
      syncInFlight = null;
    });
  }

  return syncInFlight;
};

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

    runBlogJob(jobId, {
      triggerMode: "active_batch",
      requireActive: true,
    }).catch((error) => {
      console.error(
        `Scheduled blog job failed id=${jobId} name="${job.name}":`,
        error instanceof Error ? error.message : error
      );
    });
  }
};

export const startBlogJobScheduler = async () => {
  if (schedulerTimer) {
    return;
  }

  await syncBlogJobSchedules("startup");
  schedulerTimer = setInterval(() => {
    tickScheduledJobs().catch((error) => {
      console.error(
        "Blog job scheduler tick failed:",
        error instanceof Error ? error.message : error
      );
    });
  }, TICK_INTERVAL_MS);
};
