import {
  useEffect,
  useState,
} from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";

type SyncLog = {
  id: string;
  time: string;
  imported: number;
  skipped: number;
  status: "success" | "error";
  message?: string;
};

type SyncResult = {
  imported: number;
  skipped: number;
};

type SyncResponse = {
  message?: string;
  data?: SyncResult;
  log?: Partial<SyncLog> | null;
  progress?: SyncProgress | null;
};

type SyncProgress = {
  status: "idle" | "running" | "success" | "error";
  percentage: number;
  totalProducts: number;
  processedProducts: number;
  imported: number;
  skipped: number;
  message: string;
};

const normalizeSyncLog = (
  log: Partial<SyncLog> | null | undefined
): SyncLog => ({
  id:
    typeof log?.id === "string" && log.id
      ? log.id
      : crypto.randomUUID(),
  time:
    typeof log?.time === "string" && log.time
      ? log.time
      : new Date().toISOString(),
  imported:
    typeof log?.imported === "number"
      ? log.imported
      : 0,
  skipped:
    typeof log?.skipped === "number"
      ? log.skipped
      : 0,
  status:
    log?.status === "error"
      ? "error"
      : "success",
  message:
    typeof log?.message === "string" &&
    log.message.trim().length > 0
      ? log.message.trim()
      : undefined,
});

const formatLogTime = (time: string) => {
  const parsedDate = new Date(time);

  return Number.isNaN(parsedDate.getTime())
    ? time
    : parsedDate.toLocaleString();
};

const upsertSyncLog = (
  currentLogs: SyncLog[],
  latestLog: SyncLog
) => [
  latestLog,
  ...currentLogs.filter(
    (log) => log.id !== latestLog.id
  ),
];

const fetchSyncLogs = async (): Promise<SyncLog[]> => {
  const response = await fetch(
    "/api/products/import/shopify/logs"
  );
  const payload = await response
    .json()
    .catch(() => null);

  if (!response.ok) {
    throw new Error(
      payload?.message ||
        `Failed to load sync logs (HTTP ${response.status})`
    );
  }

  return Array.isArray(payload?.data)
    ? payload.data.map((log: Partial<SyncLog>) =>
        normalizeSyncLog(log)
      )
    : [];
};

const fetchSyncProgress =
  async (): Promise<SyncProgress> => {
    const response = await fetch(
      "/api/products/import/shopify/status"
    );
    const payload = await response
      .json()
      .catch(() => null);

    if (!response.ok) {
      throw new Error(
        payload?.message ||
          `Failed to load sync progress (HTTP ${response.status})`
      );
    }

    return payload?.data ?? null;
  };

export default function Sync() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] =
    useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<
    "success" | "error" | null
  >(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [logsLoading, setLogsLoading] =
    useState(true);
  const [logsError, setLogsError] = useState<
    string | null
  >(null);
  const [progressMessage, setProgressMessage] =
    useState("Preparing Shopify sync...");
  const [progressStats, setProgressStats] =
    useState<SyncProgress | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadLogs = async () => {
      try {
        setLogsLoading(true);
        setLogsError(null);

        const savedLogs = await fetchSyncLogs();

        if (mounted) {
          setLogs(savedLogs);
        }
      } catch (err: any) {
        console.error("Sync logs fetch failed:", err);

        if (mounted) {
          setLogsError(
            err.message || "Failed to load sync logs"
          );
        }
      } finally {
        if (mounted) {
          setLogsLoading(false);
        }
      }
    };

    void loadLogs();

    return () => {
      mounted = false;
    };
  }, []);

  const applyProgress = (
    nextProgress: SyncProgress | null | undefined
  ) => {
    if (!nextProgress) {
      return;
    }

    setProgress(nextProgress.percentage ?? 0);
    setProgressStats(nextProgress);
    setProgressMessage(
      nextProgress.message ||
        "Syncing Shopify products..."
    );
  };

  const handleShopifySync = async () => {
    let progressInterval:
      | ReturnType<typeof setInterval>
      | undefined;

    try {
      setLoading(true);
      setError(null);
      setResult(null);
      setProgress(0);
      setProgressStats(null);
      setProgressMessage("Preparing Shopify sync...");

      const pollProgress = async () => {
        try {
          const currentProgress =
            await fetchSyncProgress();
          applyProgress(currentProgress);
        } catch (progressError) {
          console.error(
            "Failed to fetch sync progress:",
            progressError
          );
        }
      };

      const syncRequest = fetch(
        "/api/products/import/shopify",
        { method: "POST" }
      );

      progressInterval = setInterval(() => {
        void pollProgress();
      }, 800);

      const res = await syncRequest;

      const text = await res.text();
      console.log("Shopify sync response status:", res.status);
      console.log("Shopify sync raw response:", text);

      let data: SyncResponse | null = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (parseError) {
        console.error("JSON parse failed:", parseError);
      }

      if (!res.ok) {
        const syncError = new Error(
          data?.message ||
            `Shopify sync failed (HTTP ${res.status})`
        );

        (
          syncError as Error & {
            syncLog?: SyncLog;
          }
        ).syncLog = normalizeSyncLog({
          id: data?.log?.id,
          time: data?.log?.time,
          imported:
            data?.log?.imported ??
            data?.progress?.imported ??
            0,
          skipped:
            data?.log?.skipped ??
            data?.progress?.skipped ??
            0,
          status: "error",
          message:
            data?.log?.message || syncError.message,
        });

        (
          syncError as Error & {
            syncProgress?: SyncProgress | null;
          }
        ).syncProgress = data?.progress ?? null;

        throw syncError;
      }

      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = undefined;
      }

      const finalProgress =
        (await fetchSyncProgress().catch(() => null)) ||
        data?.progress ||
        null;

      applyProgress(finalProgress);
      setProgress(100);
      setProgressMessage("Shopify sync completed.");

      if (data?.data) {
        setResult(data.data);

        const latestLog = normalizeSyncLog({
          id: data?.log?.id,
          time: data?.log?.time,
          imported: data.data.imported,
          skipped: data.data.skipped,
          status: "success",
          message: data?.log?.message,
        });

        setLogs((prev) =>
          upsertSyncLog(prev, latestLog)
        );
        setModalType("success");
        setShowModal(true);
      }
    } catch (err: any) {
      applyProgress(err.syncProgress);
      setError(err.message);
      setProgressMessage(
        err.syncProgress?.message || err.message
      );

      const failedLog = normalizeSyncLog(
        err.syncLog || {
          status: "error",
          imported: 0,
          skipped: 0,
          message: err.message,
        }
      );

      setLogs((prev) =>
        upsertSyncLog(prev, failedLog)
      );
      setModalType("error");
      setShowModal(true);
    } finally {
      if (progressInterval) {
        clearInterval(progressInterval);
      }

      setLoading(false);
    }
  };

  return (
    <div>
      <PageMeta
        title="Master Sync"
        description="Sync master data"
      />
      <PageBreadcrumb pageTitle="Sync" />

      <div className="min-h-screen rounded-2xl border border-gray-200 bg-white px-5 py-7 dark:border-gray-800 dark:bg-white/[0.03] xl:px-10 xl:py-12">
        <div className="mx-auto w-full max-w-[630px] text-center">
          <h3 className="mb-4 text-theme-xl font-semibold text-gray-800 dark:text-white/90 sm:text-2xl">
            Master Sync
          </h3>

          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400 sm:text-base">
            Sync master data from here.
          </p>

          <button
            onClick={handleShopifySync}
            disabled={loading}
            className={`rounded-lg px-6 py-3 font-medium text-white transition ${
              loading
                ? "cursor-not-allowed bg-gray-400"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {loading
              ? "Syncing Shopify Products..."
              : "Sync Shopify Products"}
          </button>

          {loading && (
            <div className="mt-6">
              <div className="h-3 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-3 rounded-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {progressMessage} {progress}%
              </p>

              {progressStats && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Processed {progressStats.processedProducts} of{" "}
                  {progressStats.totalProducts || progressStats.processedProducts} |
                  {" "}Imported {progressStats.imported} | Skipped{" "}
                  {progressStats.skipped}
                </p>
              )}
            </div>
          )}

          {result && (
            <div className="mt-6 text-sm text-green-600">
              Imported: {result.imported} <br />
              Skipped: {result.skipped}
            </div>
          )}

          {error && (
            <div className="mt-6 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="mt-10 overflow-x-auto">
        <h4 className="mb-4 text-left text-lg font-semibold text-gray-800 dark:text-white">
          Sync Logs
        </h4>

        {logsLoading ? (
          <div className="rounded-lg border border-gray-200 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            Loading sync logs...
          </div>
        ) : logsError ? (
          <div className="rounded-lg border border-red-200 px-4 py-6 text-sm text-red-600 dark:border-red-900/40">
            {logsError}
          </div>
        ) : logs.length === 0 ? (
          <div className="rounded-lg border border-gray-200 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No sync logs available yet.
          </div>
        ) : (
          <table className="w-full border border-gray-200 text-sm dark:border-gray-700">
            <thead className="bg-gray-100 dark:bg-gray-800">
              <tr>
                <th className="border px-3 py-2 text-left">
                  Time
                </th>
                <th className="border px-3 py-2 text-left">
                  Imported
                </th>
                <th className="border px-3 py-2 text-left">
                  Skipped
                </th>
                <th className="border px-3 py-2 text-left">
                  Status
                </th>
                <th className="border px-3 py-2 text-left">
                  Message
                </th>
              </tr>
            </thead>

            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-900"
                >
                  <td className="border px-3 py-2">
                    {formatLogTime(log.time)}
                  </td>
                  <td className="border px-3 py-2">
                    {log.imported}
                  </td>
                  <td className="border px-3 py-2">
                    {log.skipped}
                  </td>
                  <td
                    className={`border px-3 py-2 font-medium ${
                      log.status === "success"
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {log.status}
                  </td>
                  <td className="border px-3 py-2">
                    {log.message || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg dark:bg-gray-900">
            <h3
              className={`mb-4 text-lg font-semibold ${
                modalType === "success"
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              {modalType === "success"
                ? "Shopify Sync Completed"
                : "Shopify Sync Failed"}
            </h3>

            {modalType === "success" && result && (
              <div className="text-sm text-gray-700 dark:text-gray-300">
                <p>
                  <strong>Imported:</strong>{" "}
                  {result.imported}
                </p>
                <p>
                  <strong>Skipped:</strong>{" "}
                  {result.skipped}
                </p>
              </div>
            )}

            {modalType === "error" && (
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {error}
              </p>
            )}

            <div className="mt-6 text-right">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
