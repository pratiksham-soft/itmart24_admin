import { useEffect, useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import Button from "../../../components/ui/button/Button";
import { Modal } from "../../../components/ui/modal";
import BlogJobFormModal from "./BlogJobFormModal";
import {
  createBlogJob,
  fetchBlogJobRunLogs,
  createBlogTemplate,
  deleteBlogJob,
  fetchBlogJobs,
  fetchBlogPosts,
  fetchShopifyBlogs,
  fetchBlogTemplates,
  runBlogJobOnce,
  toggleBlogJobStatus,
  updateBlogJob,
  updateBlogTemplate,
} from "../../../services/blogManager.service";
import type {
  BlogJob,
  BlogJobPayload,
  BlogJobRunLog,
  BlogRunSummary,
  BlogTemplate,
} from "../../../types/blogManager";

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const formatLogText = (logs: BlogJobRunLog[]) =>
  logs
    .map((log) => {
      const metadata =
        log.metadata && Object.keys(log.metadata).length > 0
          ? `\nmetadata: ${JSON.stringify(log.metadata, null, 2)}`
          : "";

      return [
        `[${formatDateTime(log.createdAt)}] ${String(log.level ?? "info").toUpperCase()}`,
        `job: ${log.jobName ?? `Job #${log.jobId}`}`,
        `run: ${log.runId}`,
        `step: ${log.step ?? "-"}`,
        `category: ${log.categoryName ?? "-"}`,
        `topic: ${log.topic ?? "-"}`,
        `message: ${log.message}`,
      ].join("\n") + metadata;
    })
    .join("\n\n");

const StatusBadge = ({ status }: { status: string }) => (
  <span
    className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
      status === "active"
        ? "bg-green-100 text-green-700"
        : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
    }`}
  >
    {status === "active" ? "Active" : "Inactive"}
  </span>
);

const StatusToggle = ({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle: () => void;
}) => (
  <button
    type="button"
    onClick={onToggle}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
      checked ? "bg-brand-500" : "bg-gray-300 dark:bg-gray-700"
    }`}
  >
    <span
      className={`inline-block h-5 w-5 rounded-full bg-white transition ${
        checked ? "translate-x-5" : "translate-x-1"
      }`}
    />
  </button>
);

const BlogJobs = () => {
  const [jobs, setJobs] = useState<BlogJob[]>([]);
  const [templates, setTemplates] = useState<BlogTemplate[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [runSummary, setRunSummary] = useState<BlogRunSummary | null>(null);
  const [selectedJob, setSelectedJob] = useState<BlogJob | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [runningJobId, setRunningJobId] = useState<number | null>(null);
  const [logs, setLogs] = useState<BlogJobRunLog[]>([]);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [jobResponse, templateResponse, blogResponse, shopifyBlogsResponse] =
        await Promise.allSettled([
          fetchBlogJobs(),
          fetchBlogTemplates(),
          fetchBlogPosts(),
          fetchShopifyBlogs(),
        ]);

      if (
        jobResponse.status === "rejected" ||
        templateResponse.status === "rejected" ||
        blogResponse.status === "rejected"
      ) {
        const firstError =
          jobResponse.status === "rejected"
            ? jobResponse.reason
            : templateResponse.status === "rejected"
            ? templateResponse.reason
            : blogResponse.status === "rejected"
            ? blogResponse.reason
            : null;

        throw firstError;
      }

      setJobs(jobResponse.value);
      setTemplates(templateResponse.value);

      const mergedCategories = new Set<string>();
      if (shopifyBlogsResponse.status === "fulfilled") {
        shopifyBlogsResponse.value.forEach((blog) => mergedCategories.add(blog.title));
      }
      jobResponse.value.forEach((job) =>
        job.categories.forEach((category) => mergedCategories.add(category.category))
      );
      blogResponse.value.forEach((blog) => mergedCategories.add(blog.category));
      setCategoryOptions(Array.from(mergedCategories).sort((left, right) => left.localeCompare(right)));
    } catch (requestError) {
      console.error(requestError);
      setError(
        (requestError as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "Failed to load blog jobs"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const pendingTopicsByCategory = useMemo(() => {
    const result: Record<string, string[]> = {};

    jobs.forEach((job) => {
      job.categories.forEach((category) => {
        category.topics
          .filter((topic) => topic.status === "pending" && topic.topic.trim())
          .forEach((topic) => {
            const existing = result[category.category] ?? [];
            if (!existing.includes(topic.topic)) {
              existing.push(topic.topic);
            }
            result[category.category] = existing;
          });
      });
    });

    return result;
  }, [jobs]);

  const handleDelete = async (jobId: number) => {
    if (!confirm("Delete this blog job?")) {
      return;
    }

    try {
      await deleteBlogJob(jobId);
      setJobs((previous) => previous.filter((job) => job.id !== jobId));
      setSuccessMessage("Blog job deleted successfully.");
    } catch (requestError: any) {
      alert(requestError?.response?.data?.error ?? "Failed to delete blog job");
    }
  };

  const handleSaveJob = async (payload: BlogJobPayload, jobId?: number) => {
    try {
      setIsSaving(true);
      const savedJob = jobId
        ? await updateBlogJob(jobId, payload)
        : await createBlogJob(payload);
      setJobs((previous) => {
        const hasExisting = previous.some((job) => job.id === savedJob.id);
        if (hasExisting) {
          return previous.map((job) => (job.id === savedJob.id ? savedJob : job));
        }

        return [savedJob, ...previous];
      });
      setIsModalOpen(false);
      setSelectedJob(null);
      setRunSummary(null);
      setSuccessMessage(jobId ? "Blog job updated successfully." : "Blog job created successfully.");
    } catch (requestError: any) {
      alert(requestError?.response?.data?.error ?? "Failed to save blog job");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTemplate = async (payload: {
    id?: number;
    name: string;
    content: string;
    isDefault: boolean;
  }) => {
    const savedTemplate = payload.id
      ? await updateBlogTemplate(payload.id, payload)
      : await createBlogTemplate(payload);

    setTemplates((previous) => {
      const nextTemplates = previous.some((template) => template.id === savedTemplate.id)
        ? previous.map((template) =>
            template.id === savedTemplate.id ? savedTemplate : savedTemplate.isDefault ? { ...template, isDefault: false } : template
          )
        : [
            savedTemplate,
            ...previous.map((template) =>
              savedTemplate.isDefault ? { ...template, isDefault: false } : template
            ),
          ];

      return nextTemplates.sort((left, right) => Number(right.isDefault) - Number(left.isDefault));
    });
    setSuccessMessage("Blog template saved successfully.");
    return savedTemplate;
  };

  const handleToggleStatus = async (job: BlogJob) => {
    try {
      const updatedJob = await toggleBlogJobStatus(job.id, job.status !== "active");
      setJobs((previous) =>
        previous.map((entry) => (entry.id === updatedJob.id ? updatedJob : entry))
      );
      setSuccessMessage("Job status updated successfully.");
    } catch (requestError: any) {
      alert(requestError?.response?.data?.error ?? "Failed to update job status");
    }
  };

  const handleRunOnce = async (job: BlogJob) => {
    if (job.status !== "active") {
      setError("Activate job before running.");
      return;
    }

    try {
      setRunningJobId(job.id);
      setSuccessMessage(null);
      setError(null);
      const summary = await runBlogJobOnce(job.id);
      setRunSummary(summary);
      setSuccessMessage(`Run completed for "${job.name}".`);
    } catch (requestError: any) {
      setError(
        requestError?.response?.data?.message ??
          requestError?.response?.data?.error ??
          "Failed to run blog job"
      );
    } finally {
      setRunningJobId(null);
    }
  };

  const handleViewLogs = async () => {
    try {
      setLogsLoading(true);
      setLogsError(null);
      setIsLogsOpen(true);
      const response = await fetchBlogJobRunLogs({ limit: 200 });
      setLogs(response);
    } catch (requestError) {
      const message =
        (requestError as { response?: { data?: { message?: string; error?: string } } })
          ?.response?.data?.message ??
        (requestError as { response?: { data?: { message?: string; error?: string } } })
          ?.response?.data?.error ??
        "Failed to load blog job logs";
      setLogs([]);
      setLogsError(message);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleCopyLogs = async () => {
    if (logs.length === 0) {
      return;
    }

    try {
      await navigator.clipboard.writeText(formatLogText(logs));
      setSuccessMessage("Blog job logs copied successfully.");
    } catch (_error) {
      alert("Failed to copy logs");
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-800 dark:text-white/90">
            Blog Jobs
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Configure category-focused blog jobs with manual topics, preferred sources, templates, and status controls.
          </p>
        </div>
        <Button
          onClick={() => {
            setSelectedJob(null);
            setIsModalOpen(true);
          }}
        >
          Create Job
        </Button>
      </div>

      {successMessage ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {successMessage}
        </div>
      ) : null}

      {runSummary ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          Processed {runSummary.totalTopicsProcessed} topic(s). Success: {runSummary.successCount}. Failure: {runSummary.failureCount}.
        </div>
      ) : null}

      {loading ? <div className="text-gray-500">Loading blog jobs...</div> : null}
      {error ? <div className="text-red-600">{error}</div> : null}

      {!loading && !error ? (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
            <div className="max-w-full overflow-x-auto">
              <Table>
                <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                  <TableRow>
                    {[
                      "Job name/title",
                      "Blog categories",
                      "Cron schedule/expression",
                      "Status",
                      "Toggle",
                      "Created date",
                      "Updated date",
                      "Actions",
                    ].map((label) => (
                      <TableCell
                        key={label}
                        isHeader
                        className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                      >
                        {label}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {jobs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="px-5 py-8 text-center text-sm text-gray-500">
                        No blog jobs found yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    jobs.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell className="px-5 py-4 text-sm font-medium text-gray-800 dark:text-white/90">
                          <div>{job.name}</div>
                          <div className="mt-1 text-xs text-gray-500">
                            Template: {job.effectiveTemplateName ?? "Default not set"}
                          </div>
                        </TableCell>
                        <TableCell className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                          {job.categories.map((category) => `${category.category} (${category.blogCount})`).join(", ")}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                          {job.cronExpression}
                        </TableCell>
                        <TableCell className="px-5 py-4">
                          <StatusBadge status={job.status} />
                        </TableCell>
                        <TableCell className="px-5 py-4">
                          <StatusToggle
                            checked={job.status === "active"}
                            onToggle={() => handleToggleStatus(job)}
                          />
                        </TableCell>
                        <TableCell className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                          {formatDateTime(job.createdAt)}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                          {formatDateTime(job.updatedAt)}
                        </TableCell>
                        <TableCell className="px-5 py-4">
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              onClick={() => handleRunOnce(job)}
                              disabled={runningJobId === job.id}
                            >
                              {runningJobId === job.id ? "Running..." : "Run Once"}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setSelectedJob(job);
                                setIsModalOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                            <Button variant="outline" onClick={() => handleDelete(job.id)}>
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={handleViewLogs} disabled={logsLoading}>
              {logsLoading ? "Loading Logs..." : "View Logs"}
            </Button>
          </div>
        </div>
      ) : null}

      <Modal isOpen={isLogsOpen} onClose={() => setIsLogsOpen(false)} className="max-w-5xl p-0">
        <div className="flex max-h-[calc(100vh-2rem)] flex-col">
          <div className="border-b border-gray-200 px-6 py-4 dark:border-white/[0.05]">
            <div className="pr-12">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                Blog Job Logs
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Recent entries from the <code>blog_job_run_logs</code> table.
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {logsLoading ? (
              <div className="text-sm text-gray-500">Loading blog job logs...</div>
            ) : logsError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {logsError}
              </div>
            ) : logs.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500 dark:border-white/[0.05] dark:bg-white/[0.02] dark:text-gray-400">
                No logs found yet.
              </div>
            ) : (
              <textarea
                readOnly
                value={formatLogText(logs)}
                className="min-h-[420px] w-full rounded-xl border border-gray-200 bg-gray-50 p-4 font-mono text-xs leading-6 text-gray-800 outline-none dark:border-white/[0.05] dark:bg-gray-950 dark:text-gray-200"
              />
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-white/[0.05]">
            <Button variant="outline" onClick={() => setIsLogsOpen(false)}>
              Close
            </Button>
            <Button onClick={handleCopyLogs} disabled={logsLoading || logs.length === 0}>
              Copy Logs
            </Button>
          </div>
        </div>
      </Modal>

      <BlogJobFormModal
        job={selectedJob}
        templates={templates}
        categoryOptions={categoryOptions}
        pendingTopicsByCategory={pendingTopicsByCategory}
        isSaving={isSaving}
        isOpen={isModalOpen}
        onClose={() => {
          setSelectedJob(null);
          setIsModalOpen(false);
        }}
        onSubmit={handleSaveJob}
        onSaveTemplate={handleSaveTemplate}
      />
    </div>
  );
};

export default BlogJobs;
