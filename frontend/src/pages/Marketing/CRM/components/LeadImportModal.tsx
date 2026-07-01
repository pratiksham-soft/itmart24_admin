import { useEffect, useState } from "react";
import Button from "../../../../components/ui/button/Button";
import { Modal } from "../../../../components/ui/modal";
import { importLeads, previewLeadImport } from "../services/crmApi";
import type { CRMLeadImportPreview, CRMLeadImportResult } from "../types/crm.types";
import { readErrorMessage } from "../utils/crmHelpers";

type LeadImportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onImported: (result: CRMLeadImportResult) => void;
};

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const duplicateOptions = [
  {
    value: "skip",
    label: "Skip existing leads by email",
  },
  {
    value: "update",
    label: "Update existing leads by email",
  },
  {
    value: "allow",
    label: "Allow duplicates",
  },
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

export default function LeadImportModal({
  isOpen,
  onClose,
  onImported,
}: LeadImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [duplicateStrategy, setDuplicateStrategy] = useState("skip");
  const [createActivityLogs, setCreateActivityLogs] = useState(true);
  const [preview, setPreview] = useState<CRMLeadImportPreview | null>(null);
  const [result, setResult] = useState<CRMLeadImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setDuplicateStrategy("skip");
      setCreateActivityLogs(true);
      setPreview(null);
      setResult(null);
      setError(null);
    }
  }, [isOpen]);

  const setSelectionState = (nextFile: File | null) => {
    setFile(nextFile);
    setPreview(null);
    setResult(null);
    setError(null);
  };

  const validateFile = (nextFile: File | null) => {
    if (!nextFile) {
      throw new Error("Please select a CSV file to import.");
    }

    if (!nextFile.name.toLowerCase().endsWith(".csv")) {
      throw new Error("Only CSV files are allowed.");
    }

    if (nextFile.size > MAX_FILE_SIZE) {
      throw new Error("CSV file must be 5 MB or smaller.");
    }
  };

  const handlePreview = async () => {
    try {
      validateFile(file);
      setLoadingPreview(true);
      setError(null);
      setResult(null);
      const response = await previewLeadImport(
        createImportFormData(file as File, duplicateStrategy, createActivityLogs)
      );
      setPreview(response);
    } catch (previewError) {
      setPreview(null);
      setError(readErrorMessage(previewError, "Failed to preview lead import."));
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleImport = async () => {
    if (!file || !preview || preview.willCreate + preview.willUpdate <= 0) {
      return;
    }

    try {
      setLoadingImport(true);
      setError(null);
      const response = await importLeads(
        createImportFormData(file, duplicateStrategy, createActivityLogs)
      );
      setResult(response);
      onImported(response);
    } catch (importError) {
      setError(readErrorMessage(importError, "Failed to import leads."));
    } finally {
      setLoadingImport(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-6xl p-6 lg:p-8">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Import Leads</h3>
            <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
              Upload a CSV file to bulk import CRM leads. For multiple emails or phone numbers, separate values with commas in the same cell.
            </p>
          </div>
          <a
            href="/samples/crm-leads-sample.csv"
            download="crm-leads-sample.csv"
            className="text-sm font-medium text-brand-600 underline-offset-4 hover:underline"
          >
            Download sample CSV
          </a>
        </div>

        {error ? (
          <div className="rounded-2xl bg-error-50 px-4 py-3 text-sm text-error-600">{error}</div>
        ) : null}

        {preview?.warnings?.length ? (
          <div className="rounded-2xl bg-warning-50 px-4 py-3 text-sm text-warning-700">
            {preview.warnings.join(" ")}
          </div>
        ) : null}

        {result ? (
          <div className="rounded-3xl border border-success-200 bg-success-50/70 p-5">
            <h4 className="text-lg font-semibold text-success-700">Import completed</h4>
            <p className="mt-1 text-sm text-success-700">
              Created {result.created}, updated {result.updated}, skipped {result.skipped}, failed {result.failed}.
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
                        setPreview(null);
                        setResult(null);
                        setError(null);
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
                  setPreview(null);
                  setResult(null);
                  setError(null);
                }}
                className="mt-1 h-4 w-4"
              />
              <span className="text-gray-700 dark:text-gray-300">Create activity logs for imported leads</span>
            </label>
          </div>

          <div className="space-y-5">
            {preview ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {[
                    ["Total rows", preview.totalRows],
                    ["Valid rows", preview.validRows],
                    ["Invalid rows", preview.invalidRows],
                    ["Duplicates", preview.duplicateRows],
                    ["Will create", preview.willCreate],
                    ["Will update", preview.willUpdate],
                    ["Will skip", preview.willSkip],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                      <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
                      <div className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</div>
                    </div>
                  ))}
                </div>

                {preview.invalidRows > 0 ? (
                  <div className="rounded-2xl bg-warning-50 px-4 py-3 text-sm text-warning-700">
                    Invalid rows will be skipped. Please fix the CSV and upload again if needed.
                  </div>
                ) : null}

                {preview.errors.length > 0 ? (
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
                          {preview.errors.slice(0, 25).map((entry, index) => (
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
                          <th className="px-3 py-2 font-medium">Email</th>
                          <th className="px-3 py-2 font-medium">Company</th>
                          <th className="px-3 py-2 font-medium">Lead Type</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium">Priority</th>
                          <th className="px-3 py-2 font-medium">Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.previewRows.map((row) => (
                          <tr key={row.row} className="border-b border-gray-100 last:border-b-0 dark:border-gray-800">
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.row}</td>
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                              {[row.firstName, row.lastName].filter(Boolean).join(" ") || "Unnamed lead"}
                            </td>
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.email || "No email"}</td>
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
                Upload a CSV file, review the preview summary, and then import the valid rows into CRM.
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-200 pt-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
          <a
            href="/samples/crm-leads-sample.csv"
            download="crm-leads-sample.csv"
            className="text-sm font-medium text-brand-600 underline-offset-4 hover:underline"
          >
            Download sample CSV
          </a>
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={loadingPreview || loadingImport}>
              {result ? "Done" : "Cancel"}
            </Button>
            <Button type="button" variant="outline" onClick={() => void handlePreview()} disabled={loadingPreview || loadingImport}>
              {loadingPreview ? "Previewing..." : "Preview Import"}
            </Button>
            <Button
              type="button"
              onClick={() => void handleImport()}
              disabled={
                loadingPreview ||
                loadingImport ||
                !preview ||
                preview.willCreate + preview.willUpdate <= 0
              }
            >
              {loadingImport ? "Importing..." : "Import Leads"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
