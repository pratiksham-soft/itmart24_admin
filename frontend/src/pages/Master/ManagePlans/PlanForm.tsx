import { useEffect, useState } from "react";
import axios from "axios";
import { SubscriptionPlan } from "./types";

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

const PlanForm = ({ plan, onClose, onSaved }: PlanFormProps) => {
  const [form, setForm] = useState<SubscriptionPlan>(DEFAULT_PLAN);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (plan) {
      setForm(plan);
    } else {
      setForm(DEFAULT_PLAN);
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
        { title: "", description: "" },
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

      const payload = {
        ...form,
        slug,
        features: form.features.filter(
          (f) => f.title.trim() !== ""
        ),
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
                key={index}
                className="border rounded p-3 space-y-2"
              >
                <div className="flex justify-between items-center">
                  <p className="text-sm font-semibold">
                    Feature {index + 1}
                  </p>
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
