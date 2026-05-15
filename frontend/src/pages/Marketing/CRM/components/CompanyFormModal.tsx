import { useEffect, useState } from "react";
import { Modal } from "../../../../components/ui/modal";
import Button from "../../../../components/ui/button/Button";
import InputField from "../../../../components/form/input/InputField";
import TextArea from "../../../../components/form/input/TextArea";
import type { CRMCompany, CRMSettings } from "../types/crm.types";
import { defaultCRMSettings } from "../utils/crmHelpers";

type CompanyFormModalProps = {
  isOpen: boolean;
  initialValue: CRMCompany | null;
  settings?: CRMSettings;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
};

const selectClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

export default function CompanyFormModal({
  isOpen,
  initialValue,
  settings = defaultCRMSettings,
  onClose,
  onSubmit,
}: CompanyFormModalProps) {
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm({
      name: initialValue?.name || "",
      website: initialValue?.website || "",
      industry: initialValue?.industry || "",
      companySize: initialValue?.companySize || settings.companySizes[0],
      country: initialValue?.country || "",
      city: initialValue?.city || "",
      email: initialValue?.email || "",
      phone: initialValue?.phone || "",
      linkedinUrl: initialValue?.linkedinUrl || "",
      twitterUrl: initialValue?.twitterUrl || "",
      facebookUrl: initialValue?.facebookUrl || "",
      description: initialValue?.description || "",
      status: initialValue?.status || settings.companyStatuses[0],
      tags: Array.isArray(initialValue?.tags) ? initialValue.tags.join(", ") : "",
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
      });
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save company.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-5xl p-6 lg:p-8">
      <div className="space-y-6">
        <div>
          <h3 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
            {initialValue ? "Edit Company" : "Add Company"}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Centralize company profile, ownership, social links, and status for sales handoff.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            ["Company Name", "name"],
            ["Website", "website"],
            ["Industry", "industry"],
            ["Country", "country"],
            ["City", "city"],
            ["Email", "email"],
            ["Phone", "phone"],
            ["LinkedIn URL", "linkedinUrl"],
            ["Twitter URL", "twitterUrl"],
            ["Facebook URL", "facebookUrl"],
            ["Tags", "tags"],
          ].map(([label, key]) => (
            <div key={key}>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
              <InputField value={String(form[key] ?? "")} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} />
            </div>
          ))}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Company Size</label>
            <select className={selectClassName} value={String(form.companySize ?? settings.companySizes[0])} onChange={(event) => setForm((current) => ({ ...current, companySize: event.target.value }))}>
              {settings.companySizes.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
            <select className={selectClassName} value={String(form.status ?? settings.companyStatuses[0])} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
              {settings.companyStatuses.map((item) => (
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
            {saving ? "Saving..." : initialValue ? "Update Company" : "Create Company"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
