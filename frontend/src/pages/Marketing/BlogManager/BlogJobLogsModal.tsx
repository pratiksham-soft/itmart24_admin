import { useMemo } from "react";
import { Modal } from "../../../components/ui/modal";
import Button from "../../../components/ui/button/Button";
import type { BlogJobRunLog } from "../../../types/blogManager";

type BlogJobLogsModalProps = {
  isOpen: boolean;
  logs: BlogJobRunLog[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
};

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const BlogJobLogsModal = ({
  isOpen,
  logs,
  loading,
  error,
  onClose,
}: BlogJobLogsModalProps) => {
  const copyableLogs = useMemo(
    () =>
      logs
        .map((log) =>
          [
            `[${formatDateTime(log.createdAt)}]`,
            `job=${log.jobName ?? log.jobId}`,
            `run=${log.runId}`,
            `level=${log.level}`,
            log.step ? `step=${log.step}` : null,
            log.categoryName ? `category=${log.categoryName}` : null,
            log.topic ? `topic=${log.topic}` : null,
            `message=${log.message}`,
            Object.keys(log.metadata).length > 0
              ? `metadata=${JSON.stringify(log.metadata)}`
              : null,
          ]
            .filter(Boolean)
            .join(" | ")
        )
        .join("\n"),
    [logs]
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyableLogs);
    } catch (_error) {
      window.prompt("Copy logs:", copyableLogs);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-6xl p-6 lg:p-8">
      <div className="space-y-6">
        <div className="border-b border-gray-200 pb-4">
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
            Blog Job Logs
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Latest entries from `blog_job_run_logs`. Use Copy Logs to share or inspect the output.
          </p>
        </div>

        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={handleCopy}
            disabled={loading || logs.length === 0}
          >
            Copy Logs
          </Button>
        </div>

        {loading ? <div className="text-sm text-gray-500">Loading logs...</div> : null}
        {error ? <div className="text-sm text-red-600">{error}</div> : null}

        {!loading && !error ? (
          logs.length > 0 ? (
            <textarea
              readOnly
              value={copyableLogs}
              className="min-h-[420px] w-full rounded-xl border border-gray-300 bg-gray-50 p-4 font-mono text-xs leading-6 text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            />
          ) : (
            <div className="rounded-xl border border-dashed border-gray-300 p-8 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              No logs found yet.
            </div>
          )
        ) : null}

        <div className="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-800">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default BlogJobLogsModal;
