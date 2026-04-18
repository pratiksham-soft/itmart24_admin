import {
  useEffect,
  useState,
  type FormEvent,
} from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import MultiSelect from "../../components/form/MultiSelect";
import Checkbox from "../../components/form/input/Checkbox";
import InputField from "../../components/form/input/InputField";
import { Modal } from "../../components/ui/modal";

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

type FirestoreExportOptions = {
  schema: boolean;
  structure: boolean;
  dataFields: boolean;
  values: boolean;
  topDocuments: boolean;
};

type ActiveTask =
  | "shopifySync"
  | "firestoreExport"
  | null;

const DEFAULT_EXPORT_OPTIONS: FirestoreExportOptions =
  {
    schema: true,
    structure: true,
    dataFields: true,
    values: true,
    topDocuments: true,
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

const getDownloadFilename = (
  dispositionHeader: string | null,
  fallbackName: string
) => {
  const match = dispositionHeader?.match(
    /filename="([^"]+)"/i
  );

  return match?.[1] || fallbackName;
};

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
    ? payload.data.map(
        (log: Partial<SyncLog>) =>
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

const fetchFirestoreCollections =
  async (): Promise<string[]> => {
    const response = await fetch(
      "/api/products/firestore-export/collections"
    );
    const payload = await response
      .json()
      .catch(() => null);

    if (!response.ok) {
      throw new Error(
        payload?.message ||
          `Failed to load Firestore collections (HTTP ${response.status})`
      );
    }

    return Array.isArray(payload?.data)
      ? payload.data.filter(
          (value: unknown): value is string =>
            typeof value === "string" &&
            value.trim().length > 0
        )
      : [];
  };

export default function Sync() {
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] =
    useState(false);
  const [activeTask, setActiveTask] =
    useState<ActiveTask>(null);
  const [result, setResult] =
    useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(
    null
  );
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
  const [isExportModalOpen, setIsExportModalOpen] =
    useState(false);
  const [availableCollections, setAvailableCollections] =
    useState<string[]>([]);
  const [
    availableCollectionsLoading,
    setAvailableCollectionsLoading,
  ] = useState(false);
  const [
    availableCollectionsError,
    setAvailableCollectionsError,
  ] = useState<string | null>(null);
  const [selectedCollections, setSelectedCollections] =
    useState<string[]>([]);
  const [exportOptions, setExportOptions] =
    useState<FirestoreExportOptions>(
      DEFAULT_EXPORT_OPTIONS
    );
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [exportError, setExportError] = useState<
    string | null
  >(null);
  const [exportSuccess, setExportSuccess] =
    useState<string | null>(null);

  const isBusy = loading || exportLoading;

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
            err.message ||
              "Failed to load sync logs"
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

  useEffect(() => {
    if (
      !isExportModalOpen ||
      availableCollections.length > 0 ||
      availableCollectionsLoading ||
      availableCollectionsError
    ) {
      return;
    }

    void handleLoadFirestoreCollections();
  }, [
    isExportModalOpen,
    availableCollections.length,
    availableCollectionsLoading,
    availableCollectionsError,
  ]);

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

  const resetExportForm = () => {
    setSelectedCollections([]);
    setExportOptions(DEFAULT_EXPORT_OPTIONS);
    setFromDate("");
    setToDate("");
    setExportError(null);
  };

  const openExportModal = () => {
    setExportSuccess(null);
    setExportError(null);
    if (availableCollections.length === 0) {
      setAvailableCollectionsError(null);
    }
    setIsExportModalOpen(true);
  };

  const closeExportModal = () => {
    if (exportLoading) {
      return;
    }

    setIsExportModalOpen(false);
    setExportError(null);
  };

  const handleLoadFirestoreCollections =
    async () => {
      try {
        setAvailableCollectionsLoading(true);
        setAvailableCollectionsError(null);

        const collections =
          await fetchFirestoreCollections();
        setAvailableCollections(collections);
      } catch (err: any) {
        console.error(
          "Firestore collections fetch failed:",
          err
        );
        setAvailableCollectionsError(
          err.message ||
            "Failed to load Firestore collections"
        );
      } finally {
        setAvailableCollectionsLoading(false);
      }
    };

  const updateExportOption = (
    key: keyof FirestoreExportOptions,
    checked: boolean
  ) => {
    setExportOptions((previous) => ({
      ...previous,
      [key]: checked,
    }));
  };

  const handleShopifySync = async () => {
    let progressInterval:
      | ReturnType<typeof setInterval>
      | undefined;

    try {
      setLoading(true);
      setActiveTask("shopifySync");
      setError(null);
      setExportSuccess(null);
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
      console.log(
        "Shopify sync response status:",
        res.status
      );
      console.log(
        "Shopify sync raw response:",
        text
      );

      let data: SyncResponse | null = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (parseError) {
        console.error(
          "JSON parse failed:",
          parseError
        );
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
            data?.log?.message ||
            syncError.message,
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
        (await fetchSyncProgress().catch(
          () => null
        )) ||
        data?.progress ||
        null;

      applyProgress(finalProgress);
      setProgress(100);
      setProgressMessage(
        "Shopify sync completed."
      );

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
        err.syncProgress?.message ||
          err.message
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
      setActiveTask(null);
    }
  };

  const handleFirestoreExport = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (selectedCollections.length === 0) {
      setExportError(
        "Select at least one Firestore collection."
      );
      return;
    }

    if (fromDate && toDate && fromDate > toDate) {
      setExportError(
        "From Date cannot be later than To Date."
      );
      return;
    }

    try {
      setExportLoading(true);
      setActiveTask("firestoreExport");
      setExportError(null);
      setExportSuccess(null);
      setResult(null);
      setProgressStats(null);
      setProgress(15);
      setProgressMessage(
        "Preparing Firestore export..."
      );

      const response = await fetch(
        "/api/products/firestore-export",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            collections: selectedCollections,
            options: exportOptions,
            fromDate: fromDate || null,
            toDate: toDate || null,
          }),
        }
      );

      if (!response.ok) {
        const payload = await response
          .json()
          .catch(() => null);
        throw new Error(
          payload?.message ||
            `Failed to export Firestore data (HTTP ${response.status})`
        );
      }

      setProgress(70);
      setProgressMessage(
        "Downloading Firestore export..."
      );

      const blob = await response.blob();
      const downloadUrl =
        URL.createObjectURL(blob);
      const link =
        document.createElement("a");

      link.href = downloadUrl;
      link.download = getDownloadFilename(
        response.headers.get(
          "Content-Disposition"
        ),
        `firestore-export-${new Date()
          .toISOString()
          .slice(0, 10)}.json`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);

      setProgress(100);
      setProgressMessage(
        "Firestore export completed."
      );
      setExportSuccess(
        "Firestore export downloaded successfully."
      );
      setIsExportModalOpen(false);
      resetExportForm();
    } catch (err: any) {
      console.error(
        "Firestore export failed:",
        err
      );
      setExportError(
        err.message ||
          "Failed to export Firestore data"
      );
      setProgressMessage(
        err.message ||
          "Firestore export failed."
      );
    } finally {
      setExportLoading(false);
      setActiveTask(null);
    }
  };

  const firestoreCollectionOptions =
    availableCollections.map((collection) => ({
      value: collection,
      text: collection,
    }));

  return (
    <div>
      <PageMeta
        title="Master Sync"
        description="Sync master data"
      />
      <PageBreadcrumb pageTitle="Sync" />

      <div className="min-h-screen rounded-2xl border border-gray-200 bg-white px-5 py-7 dark:border-gray-800 dark:bg-white/[0.03] xl:px-10 xl:py-12">
        <div className="mx-auto w-full max-w-[760px] text-center">
          <h3 className="mb-4 text-theme-xl font-semibold text-gray-800 dark:text-white/90 sm:text-2xl">
            Master Sync
          </h3>

          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400 sm:text-base">
            Sync master data from here.
          </p>

          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <button
              onClick={handleShopifySync}
              disabled={isBusy}
              className={`rounded-lg px-6 py-3 font-medium text-white transition ${
                isBusy
                  ? "cursor-not-allowed bg-gray-400"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {loading
                ? "Syncing Shopify Products..."
                : "Sync Shopify Products"}
            </button>

            <button
              onClick={openExportModal}
              disabled={isBusy}
              className={`rounded-lg px-6 py-3 font-medium transition ${
                isBusy
                  ? "cursor-not-allowed border border-gray-300 bg-gray-100 text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500"
                  : "border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300"
              }`}
            >
              {exportLoading
                ? "Exporting Firestore Data..."
                : "Export Firestore Data"}
            </button>
          </div>

          {isBusy && (
            <div className="mt-6">
              <div className="h-3 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className={`h-3 rounded-full transition-all duration-300 ${
                    activeTask ===
                    "firestoreExport"
                      ? "bg-emerald-600"
                      : "bg-blue-600"
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>

              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {progressMessage} {progress}%
              </p>

              {loading && progressStats && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Processed{" "}
                  {progressStats.processedProducts} of{" "}
                  {progressStats.totalProducts ||
                    progressStats.processedProducts}{" "}
                  | Imported{" "}
                  {progressStats.imported} |
                  {" "}Skipped{" "}
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

          {exportSuccess && (
            <div className="mt-6 text-sm text-green-600">
              {exportSuccess}
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

      <Modal
        isOpen={isExportModalOpen}
        onClose={closeExportModal}
        className="m-4 w-full max-w-[720px] overflow-hidden rounded-3xl"
      >
        <div className="border-b border-gray-200 bg-gradient-to-r from-blue-50 to-white px-6 py-6 dark:border-gray-800 dark:from-blue-500/10 dark:to-gray-900 sm:px-8">
          <div className="pr-12">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">
              Firestore Export
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
              Export Firestore Data
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Choose the collections, sections, and date range to include in the JSON export.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleFirestoreExport}
          className="space-y-6 px-6 py-6 sm:px-8"
        >
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  Firestore Collections
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Select one or more root collections to export.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  void handleLoadFirestoreCollections()
                }
                disabled={
                  availableCollectionsLoading ||
                  exportLoading
                }
                className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                {availableCollectionsLoading
                  ? "Loading..."
                  : "Refresh"}
              </button>
            </div>

            <MultiSelect
              label="Collections"
              options={firestoreCollectionOptions}
              value={selectedCollections}
              onChange={setSelectedCollections}
              disabled={
                availableCollectionsLoading ||
                exportLoading
              }
              placeholder={
                availableCollectionsLoading
                  ? "Loading Firestore collections..."
                  : "Select Firestore collections"
              }
            />

            {availableCollectionsError && (
              <p className="text-sm text-red-600">
                {availableCollectionsError}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Export Sections
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Use the checkboxes to control which parts of each collection are included.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/40">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={exportOptions.schema}
                    onChange={(checked) =>
                      updateExportOption(
                        "schema",
                        checked
                      )
                    }
                    disabled={exportLoading}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Schema
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Include detected field types for the selected collections.
                    </p>
                  </div>
                </div>
              </label>

              <label className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/40">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={exportOptions.structure}
                    onChange={(checked) =>
                      updateExportOption(
                        "structure",
                        checked
                      )
                    }
                    disabled={exportLoading}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Structure
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Include document counts and discovered subcollection paths.
                    </p>
                  </div>
                </div>
              </label>

              <label className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/40">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={exportOptions.dataFields}
                    onChange={(checked) =>
                      updateExportOption(
                        "dataFields",
                        checked
                      )
                    }
                    disabled={exportLoading}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Data Fields
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Include the unique field paths found in the exported data.
                    </p>
                  </div>
                </div>
              </label>

              <label className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/40">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={exportOptions.values}
                    onChange={(checked) =>
                      updateExportOption(
                        "values",
                        checked
                      )
                    }
                    disabled={exportLoading}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Values
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Include serialized Firestore document values in the export.
                    </p>
                  </div>
                </div>
              </label>

              <label className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/40 sm:col-span-2">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={exportOptions.topDocuments}
                    onChange={(checked) =>
                      updateExportOption(
                        "topDocuments",
                        checked
                      )
                    }
                    disabled={exportLoading}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Top 10 documents
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Include a sample of up to 10 exported documents per collection.
                    </p>
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Date Range
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Leave blank to export all matching documents. Date filtering uses timestamp-like fields such as
                <code> createdAt </code>
                and
                <code> updatedAt</code>.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  From Date
                </label>
                <InputField
                  type="date"
                  value={fromDate}
                  onChange={(event) =>
                    setFromDate(
                      event.target.value
                    )
                  }
                  disabled={exportLoading}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  To Date
                </label>
                <InputField
                  type="date"
                  value={toDate}
                  onChange={(event) =>
                    setToDate(event.target.value)
                  }
                  disabled={exportLoading}
                />
              </div>
            </div>
          </div>

          {exportError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/20">
              {exportError}
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeExportModal}
              disabled={exportLoading}
              className="rounded-lg border border-gray-300 px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={
                exportLoading ||
                availableCollectionsLoading
              }
              className="rounded-lg bg-emerald-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-400"
            >
              {exportLoading
                ? "Exporting..."
                : "Export"}
            </button>
          </div>
        </form>
      </Modal>

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
