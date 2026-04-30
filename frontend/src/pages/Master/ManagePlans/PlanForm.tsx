import { DragEvent, useEffect, useState } from "react";
import axios from "axios";
import { PlanFeature, SubscriptionPlan } from "./types";

type PlanFormProps = {
  plan: SubscriptionPlan | null;
  onClose: () => void;
  onSaved: (plan: SubscriptionPlan) => void;
};

const DEFAULT_PLAN: SubscriptionPlan = {
  name: "",
  slug: "",
  periods: [],
  features: [],
  isActive: true,
};

type FormFeature = PlanFeature & {
  tempId: string;
};

type PlanFormState = Omit<SubscriptionPlan, "features"> & {
  features: FormFeature[];
};

const createFeatureTempId = () =>
  `feature_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const mapFeaturesForForm = (features: PlanFeature[]): FormFeature[] =>
  features.map((feature) => ({
    ...feature,
    tempId: createFeatureTempId(),
  }));

const createDefaultPlan = (): PlanFormState => ({
  ...DEFAULT_PLAN,
  features: [],
});

const mapPlanForForm = (plan: SubscriptionPlan): PlanFormState => ({
  ...plan,
  features: mapFeaturesForForm(plan.features ?? []),
});

const stripFeatureTempIds = (features: FormFeature[]): PlanFeature[] =>
  features.map(({ tempId, ...feature }) => feature);

const reorderFeatures = (
  features: FormFeature[],
  fromIndex: number,
  toIndex: number
) => {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= features.length ||
    toIndex >= features.length ||
    fromIndex === toIndex
  ) {
    return features;
  }

  const updated = [...features];
  const [movedFeature] = updated.splice(fromIndex, 1);
  updated.splice(toIndex, 0, movedFeature);
  return updated;
};

const PlanForm = ({ plan, onClose, onSaved }: PlanFormProps) => {
  const [form, setForm] = useState<PlanFormState>(createDefaultPlan);
  const [saving, setSaving] = useState(false);
  const [draggedFeatureIndex, setDraggedFeatureIndex] = useState<number | null>(null);

  useEffect(() => {
    if (plan) {
      setForm(mapPlanForForm(plan));
    } else {
      setForm(createDefaultPlan());
    }
  }, [plan]);

  /* =======================
     PERIOD HELPERS
     ======================= */

  const addPeriod = () => {
    setForm((prev) => ({
      ...prev,
      periods: [
        ...prev.periods,
        {
          id: `period_${Date.now()}`,
          label: "",
          durationInMonths: 1,
          price: 0,
        },
      ],
    }));
  };

  const updatePeriod = (
    index: number,
    field: "label" | "durationInMonths" | "price",
    value: string | number
  ) => {
    const updated = [...form.periods];
    updated[index] = { ...updated[index], [field]: value };
    setForm({ ...form, periods: updated });
  };

  const removePeriod = (index: number) => {
    setForm({
      ...form,
      periods: form.periods.filter((_, i) => i !== index),
    });
  };

  /* =======================
     FEATURE HELPERS
     ======================= */

  const addFeature = () => {
    setForm((prev) => ({
      ...prev,
      features: [
        ...prev.features,
        { title: "", description: "", tempId: createFeatureTempId() },
      ],
    }));
  };

  const updateFeature = (
    index: number,
    field: "title" | "description",
    value: string
  ) => {
    const updated = [...form.features];
    updated[index] = { ...updated[index], [field]: value };
    setForm({ ...form, features: updated });
  };

  const removeFeature = (index: number) => {
    setForm({
      ...form,
      features: form.features.filter((_, i) => i !== index),
    });
  };

  const handleFeatureDragStart = (
    event: DragEvent<HTMLButtonElement>,
    index: number
  ) => {
    setDraggedFeatureIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  };

  const handleFeatureDragOver = (
    event: DragEvent<HTMLDivElement>
  ) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleFeatureDrop = (
    event: DragEvent<HTMLDivElement>,
    targetIndex: number
  ) => {
    event.preventDefault();

    const sourceIndex =
      draggedFeatureIndex ??
      Number(event.dataTransfer.getData("text/plain"));

    if (Number.isNaN(sourceIndex)) {
      setDraggedFeatureIndex(null);
      return;
    }

    setForm((prev) => ({
      ...prev,
      features: reorderFeatures(prev.features, sourceIndex, targetIndex),
    }));
    setDraggedFeatureIndex(null);
  };

  const handleFeatureDragEnd = () => {
    setDraggedFeatureIndex(null);
  };
  /* =======================
     SAVE HANDLER
     ======================= */

  const handleSave = async () => {
    if (!form.name.trim()) {
      alert("Plan name is required");
      return;
    }

    if (form.periods.length === 0) {
      alert("At least one period is required");
      return;
    }

    if (form.features.length === 0) {
      alert("At least one feature is required");
      return;
    }

    try {
      setSaving(true);

      const slug = form.name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-");

      const sanitizedFeatures = stripFeatureTempIds(form.features).filter(
        (f) => f.title.trim() !== ""
      );

      const payload = {
        ...form,
        slug,
        features: sanitizedFeatures,
      };

      let savedPlan: SubscriptionPlan;

      if (form.id) {
        await axios.put(
          `/api/subscription-plans/${form.id}`,
          payload
        );

        savedPlan = { ...form, slug };
      } else {
        await axios.post("/api/subscription-plans", payload);

        savedPlan = {
          ...form,
          id: slug,
          slug,
        };
      }

      savedPlan = {
        ...savedPlan,
        features: sanitizedFeatures,
      };

      onSaved(savedPlan);
    } catch (error) {
      console.error("Save plan failed:", error);
      alert("Failed to save subscription plan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex justify-end z-50">
      <div className="bg-white w-[420px] h-full p-6 space-y-6 overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">
            {plan ? "Edit Plan" : "Create Plan"}
          </h2>
          <button onClick={onClose} className="text-gray-500 text-xl">
            ×
          </button>
        </div>

        {/* Plan Name */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Plan Name
          </label>
          <input
            className="w-full border rounded px-3 py-2"
            placeholder="e.g. Business"
            value={form.name}
            onChange={(e) =>
              setForm({ ...form, name: e.target.value })
            }
          />
        </div>

        {/* Periods */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <p className="font-medium">Periods & Pricing</p>
            <button
              type="button"
              onClick={addPeriod}
              className="text-sm text-blue-600 hover:underline"
            >
              + Add Period
            </button>
          </div>

          {form.periods.length === 0 && (
            <p className="text-sm text-gray-500">
              No periods added yet.
            </p>
          )}

          <div className="space-y-3">
            {form.periods.map((period, index) => (
              <div
                key={period.id}
                className="border rounded p-3 space-y-2"
              >
                <div className="flex justify-between items-center">
                  <p className="text-sm font-semibold">
                    Period {index + 1}
                  </p>
                  <button
                    type="button"
                    onClick={() => removePeriod(index)}
                    className="text-red-600 text-sm"
                  >
                    Remove
                  </button>
                </div>

                <input
                  className="w-full border rounded px-2 py-1"
                  placeholder="Label (e.g. Monthly, 18 Months)"
                  value={period.label}
                  onChange={(e) =>
                    updatePeriod(index, "label", e.target.value)
                  }
                />

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    className="w-full border rounded px-2 py-1"
                    placeholder="Duration (months)"
                    value={period.durationInMonths}
                    onChange={(e) =>
                      updatePeriod(
                        index,
                        "durationInMonths",
                        Number(e.target.value)
                      )
                    }
                  />

                  <input
                    type="number"
                    className="w-full border rounded px-2 py-1"
                    placeholder="Price"
                    value={period.price}
                    onChange={(e) =>
                      updatePeriod(
                        index,
                        "price",
                        Number(e.target.value)
                      )
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Features */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <p className="font-medium">Plan Features</p>
            <button
              type="button"
              onClick={addFeature}
              className="text-sm text-blue-600 hover:underline"
            >
              + Add Feature
            </button>
          </div>

          {form.features.length === 0 && (
            <p className="text-sm text-gray-500">
              No features added yet.
            </p>
          )}

          <div className="space-y-3">
            {form.features.map((feature, index) => (
              <div
                key={feature.tempId}
                className={`border rounded p-3 space-y-2 ${
                  draggedFeatureIndex === index ? "opacity-60" : ""
                }`}
                onDragOver={handleFeatureDragOver}
                onDrop={(event) => handleFeatureDrop(event, index)}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      draggable
                      onDragStart={(event) =>
                        handleFeatureDragStart(event, index)
                      }
                      onDragEnd={handleFeatureDragEnd}
                      className="cursor-grab text-gray-400 hover:text-gray-600 active:cursor-grabbing"
                      aria-label={`Drag feature ${index + 1}`}
                      title="Drag to reorder"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-5 w-5"
                        aria-hidden="true"
                      >
                        <path d="M7 4a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM7 10a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM7 16a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM16 4a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM16 10a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM16 16a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
                      </svg>
                    </button>
                    <p className="text-sm font-semibold">
                      Feature {index + 1}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFeature(index)}
                    className="text-red-600 text-sm"
                  >
                    Remove
                  </button>
                </div>

                <input
                  className="w-full border rounded px-2 py-1"
                  placeholder="Feature title (e.g. Verified Product Badge)"
                  value={feature.title}
                  onChange={(e) =>
                    updateFeature(index, "title", e.target.value)
                  }
                />

                <textarea
                  className="w-full border rounded px-2 py-1 text-sm"
                  placeholder="Feature description"
                  rows={2}
                  value={feature.description}
                  onChange={(e) =>
                    updateFeature(index, "description", e.target.value)
                  }
                />
              </div>
            ))}
          </div>
        </div>

        {/* Status */}
        <label className="flex gap-2 items-center">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) =>
              setForm({ ...form, isActive: e.target.checked })
            }
          />
          Active Plan
        </label>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Plan"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlanForm;
