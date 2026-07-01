import { useEffect, useState } from "react";
import { Modal } from "../../../../components/ui/modal";
import Button from "../../../../components/ui/button/Button";
import InputField from "../../../../components/form/input/InputField";
import TextArea from "../../../../components/form/input/TextArea";
import type { CRMLead, CRMSettings } from "../types/crm.types";
import { crmLeadTypes, defaultCRMSettings } from "../utils/crmHelpers";

type LeadFormModalProps = {
  isOpen: boolean;
  initialValue: CRMLead | null;
  settings?: CRMSettings;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
};

const selectClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

export default function LeadFormModal({
  isOpen,
  initialValue,
  settings = defaultCRMSettings,
  onClose,
  onSubmit,
}: LeadFormModalProps) {
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm({
      firstName: initialValue?.firstName || "",
      lastName: initialValue?.lastName || "",
      email: Array.isArray(initialValue?.emails) && initialValue.emails.length > 0 ? initialValue.emails.join(", ") : initialValue?.email || "",
      phone: Array.isArray(initialValue?.phones) && initialValue.phones.length > 0 ? initialValue.phones.join(", ") : initialValue?.phone || "",
      companyName: initialValue?.companyName || "",
      jobTitle: initialValue?.jobTitle || "",
      website: initialValue?.website || "",
      leadType: initialValue?.leadType || "Consumer",
      leadSource: initialValue?.leadSource || settings.leadSources[0],
      leadStatus: initialValue?.leadStatus || settings.leadStatuses[0],
      leadPriority: initialValue?.leadPriority || settings.leadPriorities[1],
      leadScore: initialValue?.leadScore || 0,
      estimatedValue: initialValue?.estimatedValue || 0,
      currency: initialValue?.currency || settings.defaultCurrency,
      tags: Array.isArray(initialValue?.tags) ? initialValue?.tags.join(", ") : "",
      nextFollowUpAt: initialValue?.nextFollowUpAt ? initialValue.nextFollowUpAt.slice(0, 16) : "",
      notesText: Array.isArray(initialValue?.notes)
        ? initialValue.notes
            .map((note) => String((note as { text?: string }).text ?? ""))
            .filter(Boolean)
            .join("\n")
        : "",
    });
    setError(null);
  }, [initialValue, isOpen, settings]);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);

    try {
      await onSubmit({
        ...form,
        tags: String(form.tags ?? "")
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
        notes: String(form.notesText ?? "")
          .split("\n")
          .map((entry) => entry.trim())
          .filter(Boolean)
          .map((text) => ({ text })),
      });
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save lead.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-5xl p-6 lg:p-8">
      <div className="space-y-6">
        <div>
          <h3 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
            {initialValue ? "Edit Lead" : "Add Lead"}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Capture lead source, follow-up timing, priority, score, and estimated value.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            ["First Name", "firstName"],
            ["Last Name", "lastName"],
            ["Email ID(s)", "email"],
            ["Phone Number(s)", "phone"],
            ["Company", "companyName"],
            ["Job Title", "jobTitle"],
            ["Website", "website"],
            ["Lead Score", "leadScore"],
            ["Estimated Value", "estimatedValue"],
            ["Currency", "currency"],
            ["Tags", "tags"],
            ["Next Follow-up", "nextFollowUpAt"],
          ].map(([label, key]) => (
            <div key={key}>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {label}
              </label>
              <InputField
                type={key === "leadScore" || key === "estimatedValue" ? "number" : key === "nextFollowUpAt" ? "datetime-local" : "text"}
                value={String(form[key] ?? "")}
                hint={key === "email" || key === "phone" ? "Separate multiple values with commas." : undefined}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
              />
            </div>
          ))}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Lead Type</label>
            <select
              className={selectClassName}
              value={String(form.leadType ?? "Consumer")}
              onChange={(event) => setForm((current) => ({ ...current, leadType: event.target.value }))}
            >
              {crmLeadTypes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Lead Source</label>
            <select
              className={selectClassName}
              value={String(form.leadSource ?? settings.leadSources[0])}
              onChange={(event) => setForm((current) => ({ ...current, leadSource: event.target.value }))}
            >
              {settings.leadSources.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Lead Status</label>
            <select
              className={selectClassName}
              value={String(form.leadStatus ?? settings.leadStatuses[0])}
              onChange={(event) => setForm((current) => ({ ...current, leadStatus: event.target.value }))}
            >
              {settings.leadStatuses.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Priority</label>
            <select
              className={selectClassName}
              value={String(form.leadPriority ?? settings.leadPriorities[1])}
              onChange={(event) => setForm((current) => ({ ...current, leadPriority: event.target.value }))}
            >
              {settings.leadPriorities.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Notes</label>
          <TextArea
            rows={5}
            value={String(form.notesText ?? "")}
            onChange={(value) => setForm((current) => ({ ...current, notesText: value }))}
          />
        </div>

        {error ? <div className="rounded-xl bg-error-50 px-4 py-3 text-sm text-error-600">{error}</div> : null}

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? "Saving..." : initialValue ? "Update Lead" : "Create Lead"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
