import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import CountryPricingEditor from "./CountryPricingEditor";
import { createCountryPricingDraft, formatMoney } from "./pricingConfig";
import { OneTimeReportPlan } from "./types";

type Props = {
  plan: OneTimeReportPlan | null;
  onClose: () => void;
  onSaved: (plan: OneTimeReportPlan) => void;
};

type FormState = OneTimeReportPlan;

const createUsdDefaultPricing = (price = 0) =>
  createCountryPricingDraft({
    countryCode: "US",
    countryName: "United States",
    currencyCode: "USD",
    price,
    discountPercentage: 0,
  });

const DEFAULT_PLAN: FormState = {
  toolKey: "seo_health",
  planKey: "",
  displayName: "",
  fallbackPriceUsd: 0,
  priceInr: 0,
  taxInclusive: true,
  sortOrder: 1,
  badgeLabel: "",
  summaryLine: "",
  publicFeatures: [""],
  maxCompetitors: 0,
  pdfExportEnabled: true,
  isActive: true,
  countryPricing: [createUsdDefaultPricing()],
};

const TOOL_OPTIONS = [
  { value: "seo_health", label: "SEO Health Analyzer" },
  { value: "ai_analysis", label: "AI Analysis" },
  { value: "competitor_comparison", label: "Competitor Comparison" },
] as const;

const OneTimeReportPlanForm = ({ plan, onClose, onSaved }: Props) => {
  const [form, setForm] = useState<FormState>(DEFAULT_PLAN);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (plan) {
      setForm({
        ...plan,
        badgeLabel: plan.badgeLabel ?? "",
        publicFeatures: plan.publicFeatures.length ? plan.publicFeatures : [""],
        countryPricing:
          (plan.countryPricing ?? []).length > 0
            ? (plan.countryPricing ?? []).map((item) => ({
                ...item,
                id: item.id || createCountryPricingDraft().id,
              }))
            : [createUsdDefaultPricing(plan.fallbackPriceUsd)],
      });
      return;
    }

    setForm({
      ...DEFAULT_PLAN,
      countryPricing: [createUsdDefaultPricing()],
    });
  }, [plan]);

  const stats = useMemo(
    () => ({
      features: form.publicFeatures.filter((feature) => feature.trim() !== "").length,
      localizedMarkets: form.countryPricing.length,
    }),
    [form.countryPricing.length, form.publicFeatures]
  );

  const updateFeature = (index: number, value: string) => {
    setForm((prev) => {
      const publicFeatures = [...prev.publicFeatures];
      publicFeatures[index] = value;
      return { ...prev, publicFeatures };
    });
  };

  const addFeature = () => {
    setForm((prev) => ({
      ...prev,
      publicFeatures: [...prev.publicFeatures, ""],
    }));
  };

  const removeFeature = (index: number) => {
    setForm((prev) => ({
      ...prev,
      publicFeatures: prev.publicFeatures.filter((_, featureIndex) => featureIndex !== index),
    }));
  };

  const validateForm = () => {
    if (!form.planKey.trim()) {
      return "Plan key is required";
    }

    if (!form.displayName.trim()) {
      return "Display name is required";
    }

    if (!Number.isFinite(form.fallbackPriceUsd) || form.fallbackPriceUsd < 0) {
      return "Fallback USD price must be zero or greater";
    }

    if (!Number.isFinite(form.sortOrder) || form.sortOrder < 1) {
      return "Sort order must be 1 or greater";
    }

    if (!Number.isFinite(form.maxCompetitors) || form.maxCompetitors < 0) {
      return "Max competitors must be zero or greater";
    }

    const filteredFeatures = form.publicFeatures.filter(
      (feature) => feature.trim() !== ""
    );

    if (filteredFeatures.length === 0) {
      return "At least one public feature is required";
    }

    return null;
  };

  const handleSave = async () => {
    const validationMessage = validateForm();

    if (validationMessage) {
      alert(validationMessage);
      return;
    }

    try {
      setSaving(true);

      const payload = {
        ...form,
        badgeLabel: form.badgeLabel?.trim() || null,
        summaryLine: form.summaryLine.trim(),
        publicFeatures: form.publicFeatures
          .map((feature) => feature.trim())
          .filter((feature) => feature !== ""),
      };

      const response = form.id
        ? await axios.put(`/api/user-one-time-report-plans/${form.id}`, payload)
        : await axios.post("/api/user-one-time-report-plans", payload);

      onSaved(response.data as OneTimeReportPlan);
    } catch (error) {
      console.error("Save one-time report plan failed:", error);
      alert("Failed to save one-time report plan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm">
      <div className="absolute inset-y-0 right-0 flex w-full justify-end">
        <div className="flex h-full w-full max-w-[860px] flex-col overflow-hidden bg-white shadow-2xl dark:bg-gray-900">
          <div className="border-b border-gray-200 bg-gradient-to-r from-slate-50 via-white to-sky-50 px-6 py-5 dark:border-white/[0.08] dark:from-gray-900 dark:via-gray-900 dark:to-slate-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-500">
                  One-Time Report Plan
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {plan ? "Update one-time report pricing" : "Create one-time report plan"}
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
                  Manage tool-specific one-time report pricing with a default US dollar market,
                  optional country-level overrides, a USD fallback amount, and an INR checkout base.
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 transition hover:border-gray-300 hover:text-gray-900 dark:border-white/[0.08] dark:text-gray-300 dark:hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white bg-white/80 px-4 py-3 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Public features
                </p>
                <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {stats.features}
                </p>
              </div>
              <div className="rounded-2xl border border-white bg-white/80 px-4 py-3 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Localized markets
                </p>
                <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {stats.localizedMarkets}
                </p>
              </div>
              <div className="rounded-2xl border border-white bg-white/80 px-4 py-3 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  USD fallback
                </p>
                <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {formatMoney(form.fallbackPriceUsd, "USD")}
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="space-y-6">
              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.02]">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Tool
                    </label>
                    <select
                      value={form.toolKey}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          toolKey: event.target.value as FormState["toolKey"],
                        }))
                      }
                      className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                    >
                      {TOOL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Plan key
                    </label>
                    <input
                      className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-brand-400 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-950 dark:text-white dark:disabled:bg-gray-900"
                      placeholder="seo_health_once_growth"
                      value={form.planKey}
                      disabled={Boolean(plan?.id)}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, planKey: event.target.value }))
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Display name
                    </label>
                    <input
                      className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                      placeholder="One Time Report"
                      value={form.displayName}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, displayName: event.target.value }))
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Badge label
                    </label>
                    <input
                      className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                      placeholder="Recommended"
                      value={form.badgeLabel ?? ""}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, badgeLabel: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-5">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Fallback price in USD
                    </label>
                    <input
                      type="number"
                      min={0}
                      className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                      value={form.fallbackPriceUsd}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          fallbackPriceUsd: Number(event.target.value),
                        }))
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      India checkout price in INR
                    </label>
                    <input
                      type="number"
                      min={0}
                      className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                      value={form.priceInr}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, priceInr: Number(event.target.value) }))
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Sort order
                    </label>
                    <input
                      type="number"
                      min={1}
                      className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                      value={form.sortOrder}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, sortOrder: Number(event.target.value) }))
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Max competitors
                    </label>
                    <input
                      type="number"
                      min={0}
                      className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                      value={form.maxCompetitors}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          maxCompetitors: Number(event.target.value),
                        }))
                      }
                    />
                  </div>

                  <label className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-gray-200">
                    <input
                      type="checkbox"
                      checked={form.taxInclusive}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, taxInclusive: event.target.checked }))
                      }
                    />
                    Tax inclusive
                  </label>
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Summary line
                  </label>
                  <textarea
                    rows={3}
                    className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                    placeholder="Short summary shown for this one-time plan"
                    value={form.summaryLine}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, summaryLine: event.target.value }))
                    }
                  />
                </div>
              </div>

              <CountryPricingEditor
                title="Country pricing"
                description="The form starts with a United States USD row by default. Add more markets only where needed and keep the USD fallback plus INR checkout base aligned with your pricing strategy."
                items={form.countryPricing}
                onChange={(items) => setForm((prev) => ({ ...prev, countryPricing: items }))}
              />

              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.02]">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Public Features
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Keep the visible value points separate from subscription features.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addFeature}
                    className="inline-flex items-center justify-center rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-brand-300 hover:text-brand-600 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200"
                  >
                    + Add Feature
                  </button>
                </div>

                <div className="space-y-3">
                  {form.publicFeatures.map((feature, index) => (
                    <div
                      key={`${form.planKey || "feature"}_${index}`}
                      className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50/60 p-4 dark:border-white/[0.08] dark:bg-white/[0.02]"
                    >
                      <textarea
                        rows={2}
                        className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                        placeholder="Feature line"
                        value={feature}
                        onChange={(event) => updateFeature(index, event.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => removeFeature(index)}
                        className="pt-2 text-sm font-semibold text-red-600 transition hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-4 text-sm font-semibold text-gray-700 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={form.pdfExportEnabled}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        pdfExportEnabled: event.target.checked,
                      }))
                    }
                  />
                  PDF export enabled
                </label>

                <label className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-4 text-sm font-semibold text-gray-700 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, isActive: event.target.checked }))
                    }
                  />
                  Active plan
                </label>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 bg-white px-6 py-4 dark:border-white/[0.08] dark:bg-gray-900">
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-400 dark:border-gray-700 dark:text-gray-200"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
              >
                {saving ? "Saving..." : plan ? "Save changes" : "Create plan"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OneTimeReportPlanForm;
