import { useEffect, useState } from "react";
import { Modal } from "../../../../components/ui/modal";
import Button from "../../../../components/ui/button/Button";
import InputField from "../../../../components/form/input/InputField";
import TextArea from "../../../../components/form/input/TextArea";
import type { CRMContact, CRMSettings } from "../types/crm.types";
import { defaultCRMSettings } from "../utils/crmHelpers";

type ContactFormModalProps = {
  isOpen: boolean;
  initialValue: CRMContact | null;
  settings?: CRMSettings;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
};

const selectClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

export default function ContactFormModal({
  isOpen,
  initialValue,
  settings = defaultCRMSettings,
  onClose,
  onSubmit,
}: ContactFormModalProps) {
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm({
      firstName: initialValue?.firstName || "",
      lastName: initialValue?.lastName || "",
      email: initialValue?.email || "",
      phone: initialValue?.phone || "",
      alternatePhone: initialValue?.alternatePhone || "",
      companyId: initialValue?.companyId || "",
      companyName: initialValue?.companyName || "",
      jobTitle: initialValue?.jobTitle || "",
      department: initialValue?.department || "",
      contactType: initialValue?.contactType || settings.contactTypes[0],
      lifecycleStage: initialValue?.lifecycleStage || settings.lifecycleStages[1],
      tags: Array.isArray(initialValue?.tags) ? initialValue.tags.join(", ") : "",
      nextFollowUpAt: initialValue?.nextFollowUpAt ? initialValue.nextFollowUpAt.slice(0, 16) : "",
      notesText: Array.isArray(initialValue?.notes)
        ? initialValue.notes.map((note) => String((note as { text?: string }).text ?? "")).join("\n")
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
        companyId: form.companyId ? Number(form.companyId) : null,
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
      setError(submitError instanceof Error ? submitError.message : "Failed to save contact.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-4xl p-6 lg:p-8">
      <div className="space-y-6">
        <div>
          <h3 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
            {initialValue ? "Edit Contact" : "Add Contact"}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Store contact channel details, company linkage, stage, and follow-up context.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            ["First Name", "firstName"],
            ["Last Name", "lastName"],
            ["Email", "email"],
            ["Phone", "phone"],
            ["Alternate Phone", "alternatePhone"],
            ["Company Id", "companyId"],
            ["Company Name", "companyName"],
            ["Job Title", "jobTitle"],
            ["Department", "department"],
            ["Tags", "tags"],
            ["Next Follow-up", "nextFollowUpAt"],
          ].map(([label, key]) => (
            <div key={key}>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
              <InputField
                type={key === "nextFollowUpAt" ? "datetime-local" : key === "companyId" ? "number" : "text"}
                value={String(form[key] ?? "")}
                onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
              />
            </div>
          ))}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Contact Type</label>
            <select
              className={selectClassName}
              value={String(form.contactType ?? settings.contactTypes[0])}
              onChange={(event) => setForm((current) => ({ ...current, contactType: event.target.value }))}
            >
              {settings.contactTypes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Lifecycle Stage</label>
            <select
              className={selectClassName}
              value={String(form.lifecycleStage ?? settings.lifecycleStages[1])}
              onChange={(event) => setForm((current) => ({ ...current, lifecycleStage: event.target.value }))}
            >
              {settings.lifecycleStages.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Notes</label>
          <TextArea rows={5} value={String(form.notesText ?? "")} onChange={(value) => setForm((current) => ({ ...current, notesText: value }))} />
        </div>

        {error ? <div className="rounded-xl bg-error-50 px-4 py-3 text-sm text-error-600">{error}</div> : null}

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? "Saving..." : initialValue ? "Update Contact" : "Create Contact"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
