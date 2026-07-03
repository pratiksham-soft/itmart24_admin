import { useEffect, useState } from "react";
import Button from "../../../../components/ui/button/Button";
import { Modal } from "../../../../components/ui/modal";
import {
  applyLeadEmailCleanup,
  importLeads,
  previewLeadEmailCleanup,
  previewLeadImport,
} from "../services/crmApi";
import type {
  CRMLeadEmailCleanupPreview,
  CRMLeadEmailCleanupResult,
  CRMLeadImportPreview,
  CRMLeadImportResult,
} from "../types/crm.types";
import { readErrorMessage } from "../utils/crmHelpers";

type LeadImportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onImported: (result: CRMLeadImportResult) => void;
  onEmailCleanupApplied: (result: CRMLeadEmailCleanupResult) => void;
};

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const duplicateOptions = [
  { value: "skip", label: "Skip existing leads by email" },
  { value: "update", label: "Update existing leads by email" },
  { value: "allow", label: "Allow duplicates" },
] as const;

const formatFileSize = (size: number) => {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }

  return `${Math.max(1, Math.round(size / 1024))} KB`;
};

const createImportFormData = (
  file: File,
  duplicateStrategy: string,
  createActivityLogs: boolean
) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("duplicateStrategy", duplicateStrategy);
  formData.append("createActivityLogs", String(createActivityLogs));
  return formData;
};

const createCleanupFormData = (file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return formData;
};

export default function LeadImportModal({
  isOpen,
  onClose,
  onImported,
  onEmailCleanupApplied,
}: LeadImportModalProps) {
  const [mode, setMode] = useState<"import" | "cleanup">("import");
  const [file, setFile] = useState<File | null>(null);
  const [duplicateStrategy, setDuplicateStrategy] = useState("skip");
  const [createActivityLogs, setCreateActivityLogs] = useState(true);
  const [importPreviewResult, setImportPreviewResult] = useState<CRMLeadImportPreview | null>(null);
  const [importResult, setImportResult] = useState<CRMLeadImportResult | null>(null);
  const [cleanupPreviewResult, setCleanupPreviewResult] = useState<CRMLeadEmailCleanupPreview | null>(null);
  const [cleanupResult, setCleanupResult] = useState<CRMLeadEmailCleanupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [loadingCleanupPreview, setLoadingCleanupPreview] = useState(false);
  const [loadingCleanupApply, setLoadingCleanupApply] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setMode("import");
      setFile(null);
      setDuplicateStrategy("skip");
      setCreateActivityLogs(true);
      setImportPreviewResult(null);
      setImportResult(null);
      setCleanupPreviewResult(null);
      setCleanupResult(null);
      setError(null);
    }
  }, [isOpen]);

  const clearFeedback = () => {
    setImportPreviewResult(null);
    setImportResult(null);
    setCleanupPreviewResult(null);
    setCleanupResult(null);
    setError(null);
  };

  const setSelectionState = (nextFile: File | null) => {
    setFile(nextFile);
    clearFeedback();
  };

  const validateFile = (nextFile: File | null) => {
    if (!nextFile) {
      throw new Error("Please select a CSV file to continue.");
    }

    if (!nextFile.name.toLowerCase().endsWith(".csv")) {
      throw new Error("Only CSV files are allowed.");
    }

    if (nextFile.size > MAX_FILE_SIZE) {
      throw new Error("CSV file must be 5 MB or smaller.");
    }
  };

  const handlePreviewImport = async () => {
    try {
      validateFile(file);
      setLoadingPreview(true);
      setError(null);
      setImportResult(null);
      const response = await previewLeadImport(
        createImportFormData(file as File, duplicateStrategy, createActivityLogs)
      );
      setImportPreviewResult(response);
    } catch (previewError) {
      setImportPreviewResult(null);
      setError(readErrorMessage(previewError, "Failed to preview lead import."));
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleImport = async () => {
    if (!file || !importPreviewResult || importPreviewResult.willCreate + importPreviewResult.willUpdate <= 0) {
      return;
    }

    try {
      setLoadingImport(true);
      setError(null);
      const response = await importLeads(
        createImportFormData(file, duplicateStrategy, createActivityLogs)
      );
      setImportResult(response);
      onImported(response);
    } catch (importError) {
      setError(readErrorMessage(importError, "Failed to import leads."));
    } finally {
      setLoadingImport(false);
    }
  };

  const handlePreviewCleanup = async () => {
    try {
      validateFile(file);
      setLoadingCleanupPreview(true);
      setError(null);
      setCleanupResult(null);
      const response = await previewLeadEmailCleanup(createCleanupFormData(file as File));
      setCleanupPreviewResult(response);
    } catch (previewError) {
      setCleanupPreviewResult(null);
      setError(readErrorMessage(previewError, "Failed to preview lead email cleanup."));
    } finally {
      setLoadingCleanupPreview(false);
    }
  };

  const handleApplyCleanup = async () => {
    if (!file || !cleanupPreviewResult || cleanupPreviewResult.willUpdate <= 0) {
      return;
    }

    try {
      setLoadingCleanupApply(true);
      setError(null);
      const response = await applyLeadEmailCleanup(createCleanupFormData(file));
      setCleanupResult(response);
      onEmailCleanupApplied(response);
    } catch (applyError) {
      setError(readErrorMessage(applyError, "Failed to apply lead email cleanup."));
    } finally {
      setLoadingCleanupApply(false);
    }
  };

  const isBusy =
    loadingPreview || loadingImport || loadingCleanupPreview || loadingCleanupApply;

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-6xl p-6 lg:p-8">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-2xl font-semibold text-gray-800 dark:text-white/90">CRM Lead CSV Tools</h3>
            <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
              Use normal import for adding or updating leads, or use Email Cleanup mode to safely update only the selected best email for campaign preparation.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("import");
                clearFeedback();
              }}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                mode === "import"
                  ? "bg-brand-500 text-white"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
              }`}
            >
              Lead Import
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("cleanup");
                clearFeedback();
              }}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                mode === "cleanup"
                  ? "bg-brand-500 text-white"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
              }`}
            >
              Email Cleanup
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl bg-error-50 px-4 py-3 text-sm text-error-600">{error}</div>
        ) : null}

        {mode === "import" && importPreviewResult?.warnings?.length ? (
          <div className="rounded-2xl bg-warning-50 px-4 py-3 text-sm text-warning-700">
            {importPreviewResult.warnings.join(" ")}
          </div>
        ) : null}

        {mode === "cleanup" && cleanupPreviewResult?.warnings?.length ? (
          <div className="rounded-2xl bg-warning-50 px-4 py-3 text-sm text-warning-700">
            {cleanupPreviewResult.warnings.join(" ")}
          </div>
        ) : null}

        {mode === "import" && importResult ? (
          <div className="rounded-3xl border border-success-200 bg-success-50/70 p-5">
            <h4 className="text-lg font-semibold text-success-700">Import completed</h4>
            <p className="mt-1 text-sm text-success-700">
              Created {importResult.created}, updated {importResult.updated}, skipped {importResult.skipped}, failed {importResult.failed}.
            </p>
          </div>
        ) : null}

        {mode === "cleanup" && cleanupResult ? (
          <div className="rounded-3xl border border-success-200 bg-success-50/70 p-5">
            <h4 className="text-lg font-semibold text-success-700">Email cleanup completed</h4>
            <p className="mt-1 text-sm text-success-700">
              Updated {cleanupResult.updatedRows}, unmatched {cleanupResult.unmatchedRows}, skipped {cleanupResult.skippedRows}, failed {cleanupResult.failedRows}.
            </p>
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <div className="space-y-5 rounded-3xl border border-gray-200 bg-gray-50/70 p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <div>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Upload CSV</div>
              <label className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white px-5 py-8 text-center dark:border-gray-700 dark:bg-gray-900">
                <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 16V4M12 4L7 9M12 4l5 5M5 20h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="text-sm font-medium text-gray-800 dark:text-white/90">Choose CSV file</span>
                <span className="mt-1 text-xs text-gray-500 dark:text-gray-400">Only `.csv` files, up to 5 MB</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0] ?? null;
                    try {
                      if (nextFile) {
                        validateFile(nextFile);
                      }
                      setSelectionState(nextFile);
                    } catch (fileError) {
                      setSelectionState(null);
                      setError(readErrorMessage(fileError, "Invalid file."));
                    }
                  }}
                />
              </label>
              {file ? (
                <div className="mt-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                  <div className="font-medium text-gray-800 dark:text-white/90">{file.name}</div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatFileSize(file.size)}</div>
                </div>
              ) : null}
            </div>

            {mode === "import" ? (
              <>
                <div className="rounded-2xl border border-blue-light-100 bg-blue-light-50 px-4 py-4 text-sm text-blue-light-700 dark:border-blue-light-900/40 dark:bg-blue-light-500/10">
                  Email cleanup is automatically applied during import. The best email is used for campaigns and original emails are preserved.
                </div>

                <div>
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Duplicate handling</div>
                  <div className="mt-3 space-y-2">
                    {duplicateOptions.map((option) => (
                      <label
                        key={option.value}
                        className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm dark:border-gray-800 dark:bg-gray-900"
                      >
                        <input
                          type="radio"
                          name="duplicateStrategy"
                          value={option.value}
                          checked={duplicateStrategy === option.value}
                          onChange={(event) => {
                            setDuplicateStrategy(event.target.value);
                            clearFeedback();
                          }}
                          className="mt-1 h-4 w-4"
                        />
                        <span className="text-gray-700 dark:text-gray-300">{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm dark:border-gray-800 dark:bg-gray-900">
                  <input
                    type="checkbox"
                    checked={createActivityLogs}
                    onChange={(event) => {
                      setCreateActivityLogs(event.target.checked);
                      clearFeedback();
                    }}
                    className="mt-1 h-4 w-4"
                  />
                  <span className="text-gray-700 dark:text-gray-300">Create activity logs for imported leads</span>
                </label>
              </>
            ) : (
              <div className="rounded-2xl border border-blue-light-100 bg-blue-light-50 px-4 py-4 text-sm text-blue-light-700 dark:border-blue-light-900/40 dark:bg-blue-light-500/10">
                <div className="font-medium">Email cleanup update rules</div>
                <div className="mt-2">This mode only updates existing active leads.</div>
                <div className="mt-1">It changes only the main `email` field, tags, and notes.</div>
                <div className="mt-1">It does not delete original emails or create duplicate leads.</div>
                <div className="mt-1">Matching order: lead ID, company + website, then existing email list.</div>
              </div>
            )}
          </div>

          <div className="space-y-5">
            {mode === "import" ? (
              importPreviewResult ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      ["Total rows", importPreviewResult.totalRows],
                      ["Valid rows", importPreviewResult.validRows],
                      ["Invalid rows", importPreviewResult.invalidRows],
                      ["Duplicates", importPreviewResult.duplicateRows],
                      ["Will create", importPreviewResult.willCreate],
                      ["Will update", importPreviewResult.willUpdate],
                      ["Will skip", importPreviewResult.willSkip],
                      ["Best emails selected", importPreviewResult.validBestEmailsSelected],
                      ["Gmail/free selected", importPreviewResult.gmailSelectedCount],
                      ["Support selected", importPreviewResult.supportSelectedCount],
                      ["No safe email", importPreviewResult.noSafeEmailCount],
                      ["Duplicate emails removed", importPreviewResult.duplicateEmailsRemovedCount],
                      ["Excluded bad emails", importPreviewResult.excludedBadEmailsCount],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                        <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
                        <div className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</div>
                      </div>
                    ))}
                  </div>

                  {importPreviewResult.errors.length > 0 ? (
                    <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
                      <div className="mb-3 text-sm font-medium text-gray-800 dark:text-white/90">Validation errors</div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-800 dark:text-gray-400">
                              <th className="px-3 py-2 font-medium">Row</th>
                              <th className="px-3 py-2 font-medium">Field</th>
                              <th className="px-3 py-2 font-medium">Error</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importPreviewResult.errors.slice(0, 25).map((entry, index) => (
                              <tr key={`${entry.row}-${entry.field}-${index}`} className="border-b border-gray-100 last:border-b-0 dark:border-gray-800">
                                <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{entry.row}</td>
                                <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{entry.field}</td>
                                <td className="px-3 py-2 text-error-600">{entry.message}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-gray-800 dark:text-white/90">Preview rows</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Showing first 10 rows</div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-800 dark:text-gray-400">
                            <th className="px-3 py-2 font-medium">Row</th>
                            <th className="px-3 py-2 font-medium">Lead</th>
                            <th className="px-3 py-2 font-medium">Selected Best Email</th>
                            <th className="px-3 py-2 font-medium">Original Emails</th>
                            <th className="px-3 py-2 font-medium">Type</th>
                            <th className="px-3 py-2 font-medium">Company</th>
                            <th className="px-3 py-2 font-medium">Lead Type</th>
                            <th className="px-3 py-2 font-medium">Status</th>
                            <th className="px-3 py-2 font-medium">Priority</th>
                            <th className="px-3 py-2 font-medium">Result</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importPreviewResult.previewRows.map((row) => (
                            <tr key={row.row} className="border-b border-gray-100 last:border-b-0 dark:border-gray-800">
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.row}</td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                                {[row.firstName, row.lastName].filter(Boolean).join(" ") || "Unnamed lead"}
                              </td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.selectedEmail || row.email || "No safe email"}</td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                                {row.originalEmailValues.length > 0 ? row.originalEmailValues.join(", ") : "No valid emails"}
                              </td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                                {row.selectedEmailType ? row.selectedEmailType.replace(/_/g, " ") : "Needs review"}
                              </td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.companyName || "No company"}</td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.leadType || "Not Set"}</td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.leadStatus}</td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.leadPriority}</td>
                              <td className="px-3 py-2">
                                <span
                                  className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                                    row.status === "invalid"
                                      ? "bg-error-50 text-error-600"
                                      : row.status === "duplicate"
                                        ? "bg-warning-50 text-warning-700"
                                        : "bg-success-50 text-success-600"
                                  }`}
                                >
                                  {row.status}
                                </span>
                                {row.duplicateEmailsRemoved > 0 ? (
                                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    Removed duplicates: {row.duplicateEmailsRemoved}
                                  </div>
                                ) : null}
                                {row.excludedEmails.length > 0 ? (
                                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    Excluded: {row.excludedEmails.join(", ")}
                                  </div>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-dashed border-gray-300 bg-gray-50/70 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-400">
                  Upload a normal lead CSV, review the preview summary, and then import the valid rows into CRM.
                </div>
              )
            ) : cleanupPreviewResult ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  {[
                    ["Total rows", cleanupPreviewResult.totalRows],
                    ["Matched", cleanupPreviewResult.matchedRows],
                    ["Unmatched", cleanupPreviewResult.unmatchedRows],
                    ["Will update", cleanupPreviewResult.willUpdate],
                    ["Skipped", cleanupPreviewResult.skippedRows],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                      <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
                      <div className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</div>
                    </div>
                  ))}
                </div>

                {cleanupPreviewResult.errors.length > 0 ? (
                  <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
                    <div className="mb-3 text-sm font-medium text-gray-800 dark:text-white/90">Cleanup row issues</div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-800 dark:text-gray-400">
                            <th className="px-3 py-2 font-medium">Row</th>
                            <th className="px-3 py-2 font-medium">Field</th>
                            <th className="px-3 py-2 font-medium">Issue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cleanupPreviewResult.errors.slice(0, 25).map((entry, index) => (
                            <tr key={`${entry.row}-${entry.field}-${index}`} className="border-b border-gray-100 last:border-b-0 dark:border-gray-800">
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{entry.row}</td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{entry.field}</td>
                              <td className="px-3 py-2 text-error-600">{entry.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-gray-800 dark:text-white/90">Sample matched records</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Showing first 10 matched rows</div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-800 dark:text-gray-400">
                          <th className="px-3 py-2 font-medium">Row</th>
                          <th className="px-3 py-2 font-medium">Lead ID</th>
                          <th className="px-3 py-2 font-medium">Company</th>
                          <th className="px-3 py-2 font-medium">Current Email</th>
                          <th className="px-3 py-2 font-medium">Best Email</th>
                          <th className="px-3 py-2 font-medium">Type</th>
                          <th className="px-3 py-2 font-medium">Send Status</th>
                          <th className="px-3 py-2 font-medium">Matched By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cleanupPreviewResult.sampleMatchedRecords.length === 0 ? (
                          <tr>
                            <td className="px-3 py-6 text-gray-500 dark:text-gray-400" colSpan={8}>
                              No matched rows yet.
                            </td>
                          </tr>
                        ) : (
                          cleanupPreviewResult.sampleMatchedRecords.map((row) => (
                            <tr key={`${row.row}-${row.leadId}`} className="border-b border-gray-100 last:border-b-0 dark:border-gray-800">
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.row}</td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.leadId}</td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.companyName || "No company"}</td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.currentEmail || "No email"}</td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.bestEmail}</td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.bestEmailType || "Not set"}</td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.sendStatus || "Not set"}</td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.matchMethod}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-gray-800 dark:text-white/90">Sample unmatched records</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Showing first 10 unmatched rows</div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-800 dark:text-gray-400">
                          <th className="px-3 py-2 font-medium">Row</th>
                          <th className="px-3 py-2 font-medium">Company</th>
                          <th className="px-3 py-2 font-medium">Website</th>
                          <th className="px-3 py-2 font-medium">Best Email</th>
                          <th className="px-3 py-2 font-medium">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cleanupPreviewResult.sampleUnmatchedRecords.length === 0 ? (
                          <tr>
                            <td className="px-3 py-6 text-gray-500 dark:text-gray-400" colSpan={5}>
                              No unmatched rows in the sample.
                            </td>
                          </tr>
                        ) : (
                          cleanupPreviewResult.sampleUnmatchedRecords.map((row) => (
                            <tr key={`${row.row}-${row.bestEmail || "blank"}`} className="border-b border-gray-100 last:border-b-0 dark:border-gray-800">
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.row}</td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.companyName || "No company"}</td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.website || "No website"}</td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.bestEmail || "No best email"}</td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.reason}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-dashed border-gray-300 bg-gray-50/70 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-400">
                Upload the cleaned outreach CSV, preview which existing leads will be updated, and then apply the email cleanup safely.
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-200 pt-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
          {mode === "import" ? (
            <a
              href="/samples/crm-leads-sample.csv"
              download="crm-leads-sample.csv"
              className="text-sm font-medium text-brand-600 underline-offset-4 hover:underline"
            >
              Download sample CSV
            </a>
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Use your cleaned file with one selected best email per lead or company.
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={isBusy}>
              {importResult || cleanupResult ? "Done" : "Cancel"}
            </Button>
            {mode === "import" ? (
              <>
                <Button type="button" variant="outline" onClick={() => void handlePreviewImport()} disabled={isBusy}>
                  {loadingPreview ? "Previewing..." : "Preview Import"}
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleImport()}
                  disabled={isBusy || !importPreviewResult || importPreviewResult.willCreate + importPreviewResult.willUpdate <= 0}
                >
                  {loadingImport ? "Importing..." : "Import Leads"}
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => void handlePreviewCleanup()} disabled={isBusy}>
                  {loadingCleanupPreview ? "Previewing..." : "Preview Email Cleanup CSV"}
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleApplyCleanup()}
                  disabled={isBusy || !cleanupPreviewResult || cleanupPreviewResult.willUpdate <= 0}
                >
                  {loadingCleanupApply ? "Applying..." : "Apply Email Cleanup"}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
