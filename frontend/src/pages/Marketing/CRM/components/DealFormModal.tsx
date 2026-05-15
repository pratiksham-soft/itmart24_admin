import { useEffect, useState } from "react";
import { Modal } from "../../../../components/ui/modal";
import Button from "../../../../components/ui/button/Button";
import InputField from "../../../../components/form/input/InputField";
import TextArea from "../../../../components/form/input/TextArea";
import type { CRMDeal, CRMSettings } from "../types/crm.types";
import { defaultCRMSettings } from "../utils/crmHelpers";

type DealFormModalProps = {
  isOpen: boolean;
  initialValue: CRMDeal | null;
  settings?: CRMSettings;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
};

const selectClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

export default function DealFormModal({
  isOpen,
  initialValue,
  settings = defaultCRMSettings,
  onClose,
  onSubmit,
}: DealFormModalProps) {
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm({
      title: initialValue?.title || "",
      leadId: initialValue?.leadId || "",
      contactId: initialValue?.contactId || "",
      companyId: initialValue?.companyId || "",
      stage: initialValue?.stage || settings.dealStages[0],
      value: initialValue?.value || 0,
      currency: initialValue?.currency || settings.defaultCurrency,
      probability: initialValue?.probability || 0,
      expectedCloseDate: initialValue?.expectedCloseDate ? initialValue.expectedCloseDate.slice(0, 16) : "",
      source: initialValue?.source || "",
      description: initialValue?.description || "",
      lostReason: initialValue?.lostReason || "",
    });
    setError(null);
  }, [initialValue, isOpen, settings]);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);

    try {
      await onSubmit({
        ...form,
        leadId: form.leadId ? Number(form.leadId) : null,
        contactId: form.contactId ? Number(form.contactId) : null,
        companyId: form.companyId ? Number(form.companyId) : null,
      });
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save deal.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-4xl p-6 lg:p-8">
      <div className="space-y-6">
        <div>
          <h3 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
            {initialValue ? "Edit Deal" : "Add Deal"}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Track pipeline stage, value, close timing, and relationship links in one place.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            ["Deal Title", "title"],
            ["Lead Id", "leadId"],
            ["Contact Id", "contactId"],
            ["Company Id", "companyId"],
            ["Value", "value"],
            ["Currency", "currency"],
            ["Probability", "probability"],
            ["Expected Close", "expectedCloseDate"],
            ["Source", "source"],
            ["Lost Reason", "lostReason"],
          ].map(([label, key]) => (
            <div key={key}>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
              <InputField
                type={["leadId", "contactId", "companyId", "value", "probability"].includes(key) ? "number" : key === "expectedCloseDate" ? "datetime-local" : "text"}
                value={String(form[key] ?? "")}
                onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
              />
            </div>
          ))}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Stage</label>
            <select className={selectClassName} value={String(form.stage ?? settings.dealStages[0])} onChange={(event) => setForm((current) => ({ ...current, stage: event.target.value }))}>
              {settings.dealStages.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
          <TextArea rows={5} value={String(form.description ?? "")} onChange={(value) => setForm((current) => ({ ...current, description: value }))} />
        </div>

        {error ? <div className="rounded-xl bg-error-50 px-4 py-3 text-sm text-error-600">{error}</div> : null}

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? "Saving..." : initialValue ? "Update Deal" : "Create Deal"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
