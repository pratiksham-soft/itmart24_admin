import { useEffect, useState } from "react";
import { Modal } from "../../../../components/ui/modal";
import Button from "../../../../components/ui/button/Button";
import InputField from "../../../../components/form/input/InputField";
import TextArea from "../../../../components/form/input/TextArea";
import type { CRMCampaign, CRMSettings } from "../types/crm.types";
import { defaultCRMSettings } from "../utils/crmHelpers";

type CampaignFormModalProps = {
  isOpen: boolean;
  initialValue: CRMCampaign | null;
  settings?: CRMSettings;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
};

const selectClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

export default function CampaignFormModal({
  isOpen,
  initialValue,
  settings = defaultCRMSettings,
  onClose,
  onSubmit,
}: CampaignFormModalProps) {
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm({
      name: initialValue?.name || "",
      subject: initialValue?.subject || "",
      body: initialValue?.body || "Hello {{firstName}},\n\nWe would love to connect with {{companyName}}.\n",
      status: initialValue?.status || settings.campaignStatuses[0],
      recipientType: initialValue?.recipientType || settings.recipientTypes[0],
      segmentId: initialValue?.segmentId || "",
      scheduledAt: initialValue?.scheduledAt ? initialValue.scheduledAt.slice(0, 16) : "",
    });
    setError(null);
  }, [initialValue, isOpen, settings]);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        ...form,
        segmentId: form.segmentId ? Number(form.segmentId) : null,
      });
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save campaign.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-5xl p-6 lg:p-8">
      <div className="space-y-6">
        <div>
          <h3 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
            {initialValue ? "Edit Campaign" : "Create Email Campaign"}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Variables available: {"{{firstName}}"}, {"{{lastName}}"}, {"{{companyName}}"}, {"{{email}}"}, {"{{website}}"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            ["Campaign Name", "name"],
            ["Subject", "subject"],
            ["Segment Id", "segmentId"],
            ["Schedule", "scheduledAt"],
          ].map(([label, key]) => (
            <div key={key}>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
              <InputField
                type={key === "segmentId" ? "number" : key === "scheduledAt" ? "datetime-local" : "text"}
                value={String(form[key] ?? "")}
                onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
              />
            </div>
          ))}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Recipient Type</label>
            <select className={selectClassName} value={String(form.recipientType ?? settings.recipientTypes[0])} onChange={(event) => setForm((current) => ({ ...current, recipientType: event.target.value }))}>
              {settings.recipientTypes.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
            <select className={selectClassName} value={String(form.status ?? settings.campaignStatuses[0])} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
              {settings.campaignStatuses.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Email Body</label>
          <TextArea rows={12} value={String(form.body ?? "")} onChange={(value) => setForm((current) => ({ ...current, body: value }))} />
        </div>

        {error ? <div className="rounded-xl bg-error-50 px-4 py-3 text-sm text-error-600">{error}</div> : null}

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? "Saving..." : initialValue ? "Update Campaign" : "Create Campaign"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
