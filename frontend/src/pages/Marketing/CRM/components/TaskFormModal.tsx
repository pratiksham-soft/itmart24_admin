import { useEffect, useState } from "react";
import { Modal } from "../../../../components/ui/modal";
import Button from "../../../../components/ui/button/Button";
import InputField from "../../../../components/form/input/InputField";
import TextArea from "../../../../components/form/input/TextArea";
import type { CRMSettings, CRMTask } from "../types/crm.types";
import { defaultCRMSettings } from "../utils/crmHelpers";

type TaskFormModalProps = {
  isOpen: boolean;
  initialValue: CRMTask | null;
  settings?: CRMSettings;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
};

const selectClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

export default function TaskFormModal({
  isOpen,
  initialValue,
  settings = defaultCRMSettings,
  onClose,
  onSubmit,
}: TaskFormModalProps) {
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm({
      title: initialValue?.title || "",
      description: initialValue?.description || "",
      taskType: initialValue?.taskType || settings.taskTypes[0],
      priority: initialValue?.priority || settings.taskPriorities[1],
      status: initialValue?.status || settings.taskStatuses[0],
      dueAt: initialValue?.dueAt ? initialValue.dueAt.slice(0, 16) : "",
      reminderAt: initialValue?.reminderAt ? initialValue.reminderAt.slice(0, 16) : "",
      relatedType: initialValue?.relatedType || "lead",
      relatedId: initialValue?.relatedId || "",
    });
    setError(null);
  }, [initialValue, isOpen, settings]);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);

    try {
      await onSubmit({
        ...form,
        relatedId: form.relatedId ? Number(form.relatedId) : null,
      });
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save task.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-4xl p-6 lg:p-8">
      <div className="space-y-6">
        <div>
          <h3 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
            {initialValue ? "Edit Task" : "Add Task"}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage follow-up ownership, due windows, reminder timing, and related CRM record.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            ["Task Title", "title"],
            ["Due At", "dueAt"],
            ["Reminder At", "reminderAt"],
            ["Related Id", "relatedId"],
          ].map(([label, key]) => (
            <div key={key}>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
              <InputField
                type={key === "relatedId" ? "number" : key.includes("At") ? "datetime-local" : "text"}
                value={String(form[key] ?? "")}
                onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
              />
            </div>
          ))}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Task Type</label>
            <select className={selectClassName} value={String(form.taskType ?? settings.taskTypes[0])} onChange={(event) => setForm((current) => ({ ...current, taskType: event.target.value }))}>
              {settings.taskTypes.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Priority</label>
            <select className={selectClassName} value={String(form.priority ?? settings.taskPriorities[1])} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}>
              {settings.taskPriorities.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
            <select className={selectClassName} value={String(form.status ?? settings.taskStatuses[0])} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
              {settings.taskStatuses.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Related Type</label>
            <select className={selectClassName} value={String(form.relatedType ?? "lead")} onChange={(event) => setForm((current) => ({ ...current, relatedType: event.target.value }))}>
              {["lead", "contact", "company", "deal"].map((item) => (
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
            {saving ? "Saving..." : initialValue ? "Update Task" : "Create Task"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
