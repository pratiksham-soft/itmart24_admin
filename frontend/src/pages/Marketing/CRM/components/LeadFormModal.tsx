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
  const [showSafetySection, setShowSafetySection] = useState(true);

  useEffect(() => {
    const existingEmails = Array.isArray(initialValue?.emails) ? initialValue.emails : [];
    const primaryEmail = initialValue?.email || existingEmails[0] || "";
    const additionalEmails = existingEmails.filter((entry) => entry !== primaryEmail);

    setForm({
      firstName: initialValue?.firstName || "",
      lastName: initialValue?.lastName || "",
      primaryEmail,
      additionalEmails: additionalEmails.join(", "),
      phone: Array.isArray(initialValue?.phones) && initialValue.phones.length > 0 ? initialValue.phones.join(", ") : initialValue?.phone || "",
      address: initialValue?.address || "",
      companyName: initialValue?.companyName || "",
      jobTitle: initialValue?.jobTitle || "",
      website: initialValue?.website || "",
      country: initialValue?.country || "",
      city: initialValue?.city || "",
      state: initialValue?.state || "",
      industry: initialValue?.industry || "",
      category: initialValue?.category || "",
      subCategory: initialValue?.subCategory || "",
      lifecycleStage: initialValue?.lifecycleStage || settings.lifecycleStages[0],
      leadType: initialValue?.leadType || "Consumer",
      leadSource: initialValue?.leadSource || settings.leadSources[0],
      leadStatus: initialValue?.leadStatus || settings.leadStatuses[0],
      leadPriority: initialValue?.leadPriority || settings.leadPriorities[1],
      leadScore: initialValue?.leadScore || 0,
      estimatedValue: initialValue?.estimatedValue || 0,
      currency: initialValue?.currency || settings.defaultCurrency,
      tags: Array.isArray(initialValue?.tags) ? initialValue.tags.join(", ") : "",
      nextFollowUpAt: initialValue?.nextFollowUpAt ? initialValue.nextFollowUpAt.slice(0, 16) : "",
      emailConsentStatus: initialValue?.emailConsentStatus || "unknown",
      unsubscribed: Boolean(initialValue?.unsubscribed),
      bounced: Boolean(initialValue?.bounced),
      bounceType: initialValue?.bounceType || "",
      spamComplaint: Boolean(initialValue?.spamComplaint),
      doNotContact: Boolean(initialValue?.doNotContact),
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
      const primaryEmail = String(form.primaryEmail ?? "").trim();
      const additionalEmails = String(form.additionalEmails ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const allEmails = [primaryEmail, ...additionalEmails].filter(Boolean);
      const unsubscribed = Boolean(form.unsubscribed);
      const doNotContact = Boolean(form.doNotContact);

      await onSubmit({
        ...form,
        email: primaryEmail,
        emails: allEmails,
        tags: String(form.tags ?? "")
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
        notes: String(form.notesText ?? "")
          .split("\n")
          .map((entry) => entry.trim())
          .filter(Boolean)
          .map((text) => ({ text })),
        emailConsentStatus: doNotContact
          ? "do_not_contact"
          : unsubscribed
            ? "unsubscribed"
            : String(form.emailConsentStatus ?? "unknown"),
      });
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save lead.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-6xl p-6 lg:p-8">
      <div className="space-y-6">
        <div>
          <h3 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
            {initialValue ? "Edit Lead" : "Add Lead"}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage lead details, preserved emails, follow-up timing, and campaign safety settings together.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            ["First Name", "firstName"],
            ["Last Name", "lastName"],
            ["Primary Email", "primaryEmail"],
            ["Additional Emails", "additionalEmails"],
            ["Phone Number(s)", "phone"],
            ["Company", "companyName"],
            ["Job Title", "jobTitle"],
            ["Website", "website"],
            ["Country", "country"],
            ["City", "city"],
            ["State", "state"],
            ["Industry", "industry"],
            ["Category", "category"],
            ["Sub Category", "subCategory"],
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
                hint={key === "additionalEmails" || key === "phone" ? "Separate multiple values with commas." : undefined}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
              />
            </div>
          ))}

          <div className="xl:col-span-3">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Address / Legacy Address</label>
            <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              Keep old imported location text here when city, state, and country were not separated yet.
            </div>
            <TextArea rows={3} value={String(form.address ?? "")} onChange={(value) => setForm((current) => ({ ...current, address: value }))} />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Lead Type</label>
            <select className={selectClassName} value={String(form.leadType ?? "Consumer")} onChange={(event) => setForm((current) => ({ ...current, leadType: event.target.value }))}>
              {crmLeadTypes.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Lead Source</label>
            <select className={selectClassName} value={String(form.leadSource ?? settings.leadSources[0])} onChange={(event) => setForm((current) => ({ ...current, leadSource: event.target.value }))}>
              {settings.leadSources.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Lead Status</label>
            <select className={selectClassName} value={String(form.leadStatus ?? settings.leadStatuses[0])} onChange={(event) => setForm((current) => ({ ...current, leadStatus: event.target.value }))}>
              {settings.leadStatuses.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Priority</label>
            <select className={selectClassName} value={String(form.leadPriority ?? settings.leadPriorities[1])} onChange={(event) => setForm((current) => ({ ...current, leadPriority: event.target.value }))}>
              {settings.leadPriorities.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Lifecycle Stage</label>
            <select className={selectClassName} value={String(form.lifecycleStage ?? settings.lifecycleStages[0])} onChange={(event) => setForm((current) => ({ ...current, lifecycleStage: event.target.value }))}>
              {settings.lifecycleStages.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-gray-50/70 p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <button
            type="button"
            onClick={() => setShowSafetySection((current) => !current)}
            className="flex w-full items-center justify-between text-left"
          >
            <div>
              <div className="text-base font-semibold text-gray-800 dark:text-white/90">Email & Campaign Safety</div>
              <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Unsubscribed, bounced, spam complaint, and do not contact always block sending.
              </div>
            </div>
            <span className="text-sm text-brand-600">{showSafetySection ? "Hide" : "Show"}</span>
          </button>

          {showSafetySection ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Email Consent Status</label>
                <select className={selectClassName} value={String(form.emailConsentStatus ?? "unknown")} onChange={(event) => setForm((current) => ({ ...current, emailConsentStatus: event.target.value }))}>
                  {["unknown", "opted_in", "legitimate_interest", "unsubscribed", "do_not_contact"].map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Bounce Type</label>
                <select className={selectClassName} value={String(form.bounceType ?? "")} onChange={(event) => setForm((current) => ({ ...current, bounceType: event.target.value }))}>
                  <option value="">blank</option>
                  {["hard", "soft", "unknown"].map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div className="rounded-2xl border border-blue-light-100 bg-blue-light-50 px-4 py-4 text-sm text-blue-light-700 dark:border-blue-light-900/40 dark:bg-blue-light-500/10">
                The main `email` field is the primary campaign send email. All valid imported emails stay preserved in `emails`.
              </div>

              {[
                ["Unsubscribed", "unsubscribed"],
                ["Bounced", "bounced"],
                ["Spam Complaint", "spamComplaint"],
                ["Do Not Contact", "doNotContact"],
              ].map(([label, key]) => (
                <label key={key} className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm dark:border-gray-800 dark:bg-gray-900">
                  <input
                    type="checkbox"
                    checked={Boolean(form[key])}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        [key]: event.target.checked,
                        emailConsentStatus:
                          key === "unsubscribed" && event.target.checked
                            ? "unsubscribed"
                            : key === "doNotContact" && event.target.checked
                              ? "do_not_contact"
                              : current.emailConsentStatus,
                      }))
                    }
                    className="mt-1 h-4 w-4"
                  />
                  <span className="text-gray-700 dark:text-gray-300">{label}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Notes</label>
          <TextArea rows={5} value={String(form.notesText ?? "")} onChange={(value) => setForm((current) => ({ ...current, notesText: value }))} />
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
