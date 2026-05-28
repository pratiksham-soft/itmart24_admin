import { DragEvent, useEffect, useMemo, useState } from "react";
import axios from "axios";
import CountryPricingEditor from "./CountryPricingEditor";
import { PlanFeature, PlanPeriod, SubscriptionPlan } from "./types";
import {
  calculateDiscountedPrice,
  createCountryPricingDraft,
  createTempId,
  formatMoney,
  getCountryPricingKey,
  normalizeDiscountPercentage,
} from "./pricingConfig";

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

type FormPeriod = PlanPeriod;

type PlanFormState = Omit<SubscriptionPlan, "features" | "periods"> & {
  periods: FormPeriod[];
  features: FormFeature[];
};

const createFeatureTempId = () => createTempId("feature");
const createPeriodTempId = () => createTempId("period");

const mapFeaturesForForm = (features: PlanFeature[]): FormFeature[] =>
  features.map((feature) => ({
    ...feature,
    tempId: createFeatureTempId(),
  }));

const mapPeriodsForForm = (periods: PlanPeriod[]): FormPeriod[] =>
  periods.map((period) => ({
    ...period,
    id: period.id || createPeriodTempId(),
    discountPercentage: normalizeDiscountPercentage(period.discountPercentage),
    countryPricing: (period.countryPricing ?? []).map((countryPricing) => ({
      ...countryPricing,
      id: countryPricing.id || createCountryPricingDraft().id,
      discountPercentage: normalizeDiscountPercentage(
        countryPricing.discountPercentage
      ),
    })),
  }));

const createDefaultPlan = (): PlanFormState => ({
  ...DEFAULT_PLAN,
  periods: [],
  features: [],
});

const mapPlanForForm = (plan: SubscriptionPlan): PlanFormState => ({
  ...plan,
  periods: mapPeriodsForForm(plan.periods ?? []),
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

const sanitizeCountryPricing = (countryPricing: FormPeriod["countryPricing"] = []) =>
  countryPricing
    .map((item) => ({
      ...item,
      countryCode: item.countryCode?.trim().toUpperCase() || "",
      countryName: item.countryName.trim(),
      currencyCode: item.currencyCode.trim().toUpperCase(),
      price: Number(item.price ?? 0),
      discountPercentage: normalizeDiscountPercentage(item.discountPercentage),
    }))
    .filter((item) => item.countryName && item.currencyCode);

const sanitizePeriods = (periods: FormPeriod[]) =>
  periods.map((period) => ({
    ...period,
    label: period.label.trim(),
    durationInMonths: Number(period.durationInMonths),
    price: Number(period.price),
    discountPercentage: normalizeDiscountPercentage(period.discountPercentage),
    countryPricing: sanitizeCountryPricing(period.countryPricing),
  }));

const PlanForm = ({ plan, onClose, onSaved }: PlanFormProps) => {
  const [form, setForm] = useState<PlanFormState>(createDefaultPlan);
  const [saving, setSaving] = useState(false);
  const [draggedFeatureIndex, setDraggedFeatureIndex] = useState<number | null>(null);

  useEffect(() => {
    if (plan) {
      setForm(mapPlanForForm(plan));
      return;
    }

    setForm(createDefaultPlan());
  }, [plan]);

  const planHealth = useMemo(() => {
    const activePeriods = form.periods.length;
    const localizedMarkets = form.periods.reduce(
      (count, period) => count + (period.countryPricing?.length ?? 0),
      0
    );

    return { activePeriods, localizedMarkets };
  }, [form.periods]);

  const addPeriod = () => {
    setForm((prev) => ({
      ...prev,
      periods: [
        ...prev.periods,
        {
          id: createPeriodTempId(),
          label: "",
          durationInMonths: 1,
          price: 0,
          discountPercentage: 0,
          countryPricing: [],
        },
      ],
    }));
  };

  const updatePeriod = (
    index: number,
    field:
      | "label"
      | "durationInMonths"
      | "price"
      | "discountPercentage",
    value: string | number
  ) => {
    setForm((prev) => {
      const updated = [...prev.periods];
      updated[index] = {
        ...updated[index],
        [field]:
          field === "discountPercentage"
            ? normalizeDiscountPercentage(Number(value))
            : value,
      };

      return {
        ...prev,
        periods: updated,
      };
    });
  };

  const updatePeriodCountryPricing = (index: number, items: FormPeriod["countryPricing"]) => {
    setForm((prev) => {
      const updated = [...prev.periods];
      updated[index] = {
        ...updated[index],
        countryPricing: items,
      };

      return {
        ...prev,
        periods: updated,
      };
    });
  };

  const removePeriod = (index: number) => {
    setForm((prev) => ({
      ...prev,
      periods: prev.periods.filter((_, periodIndex) => periodIndex !== index),
    }));
  };

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
    setForm((prev) => {
      const updated = [...prev.features];
      updated[index] = { ...updated[index], [field]: value };

      return {
        ...prev,
        features: updated,
      };
    });
  };

  const removeFeature = (index: number) => {
    setForm((prev) => ({
      ...prev,
      features: prev.features.filter((_, featureIndex) => featureIndex !== index),
    }));
  };

  const handleFeatureDragStart = (
    event: DragEvent<HTMLButtonElement>,
    index: number
  ) => {
    setDraggedFeatureIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  };

  const handleFeatureDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleFeatureDrop = (
    event: DragEvent<HTMLDivElement>,
    targetIndex: number
  ) => {
    event.preventDefault();

    const sourceIndex =
      draggedFeatureIndex ?? Number(event.dataTransfer.getData("text/plain"));

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

  const validateForm = () => {
    if (!form.name.trim()) {
      return "Plan name is required";
    }

    if (form.periods.length === 0) {
      return "At least one billing period is required";
    }

    if (form.features.length === 0) {
      return "At least one feature is required";
    }

    const seenPeriods = new Set<number>();

    for (const period of form.periods) {
      if (!period.label.trim()) {
        return "Each billing period needs a label";
      }

      if (!Number.isFinite(period.durationInMonths) || period.durationInMonths <= 0) {
        return "Each duration must be a positive number of months";
      }

      if (seenPeriods.has(period.durationInMonths)) {
        return `Duplicate duration found: ${period.durationInMonths} months`;
      }

      seenPeriods.add(period.durationInMonths);

      if (!Number.isFinite(period.price) || period.price < 0) {
        return "Each global price must be zero or greater";
      }

      if (
        !Number.isFinite(period.discountPercentage ?? 0) ||
        normalizeDiscountPercentage(period.discountPercentage) !==
          Number(period.discountPercentage ?? 0)
      ) {
        return "Discount percentage must stay between 0 and 100";
      }

      const seenCountries = new Set<string>();

      for (const market of sanitizeCountryPricing(period.countryPricing)) {
        if (!Number.isFinite(market.price) || market.price < 0) {
          return `Country price for ${market.countryName} must be zero or greater`;
        }

        const key = getCountryPricingKey(market);

        if (!key) {
          return "Each country pricing row needs a country";
        }

        if (seenCountries.has(key)) {
          return `Duplicate country pricing found for ${market.countryName}`;
        }

        seenCountries.add(key);
      }
    }

    const sanitizedFeatures = stripFeatureTempIds(form.features).filter(
      (feature) => feature.title.trim() !== ""
    );

    if (sanitizedFeatures.length === 0) {
      return "At least one non-empty feature title is required";
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

      const slug = form.name.toLowerCase().trim().replace(/\s+/g, "-");
      const sanitizedFeatures = stripFeatureTempIds(form.features).filter(
        (feature) => feature.title.trim() !== ""
      );
      const sanitizedPeriods = sanitizePeriods(form.periods);

      const payload = {
        ...form,
        slug,
        periods: sanitizedPeriods,
        features: sanitizedFeatures,
      };

      let savedPlan: SubscriptionPlan;

      if (form.id) {
        await axios.put(`/api/subscription-plans/${form.id}`, payload);
        savedPlan = { ...form, slug };
      } else {
        await axios.post("/api/subscription-plans", payload);
        savedPlan = {
          ...form,
          id: slug,
          slug,
        };
      }

      onSaved({
        ...savedPlan,
        periods: sanitizedPeriods,
        features: sanitizedFeatures,
      });
    } catch (error) {
      console.error("Save plan failed:", error);
      alert("Failed to save subscription plan");
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
                  Subscription Plan
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {plan ? "Refine plan pricing" : "Create a new plan"}
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
                  Configure global pricing, country-specific overrides, and discount
                  percentages without disrupting the existing plan experience.
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
                  Billing periods
                </p>
                <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {planHealth.activePeriods}
                </p>
              </div>
              <div className="rounded-2xl border border-white bg-white/80 px-4 py-3 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Localized markets
                </p>
                <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {planHealth.localizedMarkets}
                </p>
              </div>
              <div className="rounded-2xl border border-white bg-white/80 px-4 py-3 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Status
                </p>
                <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {form.isActive ? "Active" : "Draft"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="space-y-6">
              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.02]">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Plan Name
                    </label>
                    <input
                      className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                      placeholder="e.g. Business"
                      value={form.name}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                    />
                  </div>

                  <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-4 dark:border-sky-900/40 dark:bg-sky-950/20">
                    <p className="text-sm font-semibold text-sky-900 dark:text-sky-100">
                      Pricing model
                    </p>
                    <p className="mt-2 text-sm text-sky-800/80 dark:text-sky-200/80">
                      Each billing period now supports one global base price plus as
                      many country overrides as you need, each with its own local
                      discount percentage.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.02]">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Periods & Pricing
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Keep one default billing price, then localize by market only where
                      needed.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={addPeriod}
                    className="inline-flex items-center justify-center rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
                  >
                    + Add Period
                  </button>
                </div>

                {form.periods.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    No billing period added yet.
                  </div>
                ) : (
                  <div className="space-y-5">
                    {form.periods.map((period, index) => {
                      const discountedGlobalPrice = calculateDiscountedPrice(
                        period.price,
                        period.discountPercentage
                      );

                      return (
                        <div
                          key={period.id}
                          className="rounded-3xl border border-gray-200 bg-gray-50/60 p-5 dark:border-white/[0.08] dark:bg-white/[0.02]"
                        >
                          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                              <p className="text-base font-semibold text-gray-900 dark:text-white">
                                Period {index + 1}
                              </p>
                              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                Effective global price{" "}
                                <span className="font-semibold text-gray-800 dark:text-white/90">
                                  {formatMoney(discountedGlobalPrice, "USD")}
                                </span>
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => removePeriod(index)}
                              className="text-sm font-semibold text-red-600 transition hover:text-red-700"
                            >
                              Remove Period
                            </button>
                          </div>

                          <div className="grid gap-4 lg:grid-cols-4">
                            <div>
                              <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">
                                Label
                              </label>
                              <input
                                className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                                placeholder="Monthly or Yearly"
                                value={period.label}
                                onChange={(event) =>
                                  updatePeriod(index, "label", event.target.value)
                                }
                              />
                            </div>

                            <div>
                              <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">
                                Duration in months
                              </label>
                              <input
                                type="number"
                                min={1}
                                className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                                value={period.durationInMonths}
                                onChange={(event) =>
                                  updatePeriod(
                                    index,
                                    "durationInMonths",
                                    Number(event.target.value)
                                  )
                                }
                              />
                            </div>

                            <div>
                              <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">
                                Global base price
                              </label>
                              <input
                                type="number"
                                min={0}
                                className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                                value={period.price}
                                onChange={(event) =>
                                  updatePeriod(index, "price", Number(event.target.value))
                                }
                              />
                            </div>

                            <div>
                              <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">
                                Global discount %
                              </label>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                                value={period.discountPercentage ?? 0}
                                onChange={(event) =>
                                  updatePeriod(
                                    index,
                                    "discountPercentage",
                                    Number(event.target.value)
                                  )
                                }
                              />
                            </div>
                          </div>

                          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200">
                            <span className="font-semibold">Global preview:</span>{" "}
                            {formatMoney(period.price, "USD")} with{" "}
                            {period.discountPercentage ?? 0}% off becomes{" "}
                            {formatMoney(discountedGlobalPrice, "USD")}.
                          </div>

                          <div className="mt-4">
                            <CountryPricingEditor
                              items={period.countryPricing ?? []}
                              onChange={(items) => updatePeriodCountryPricing(index, items)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.02]">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Plan Features
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Reorder the value points to match how you want the plan to sell.
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

                {form.features.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    No features added yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {form.features.map((feature, index) => (
                      <div
                        key={feature.tempId}
                        className={`rounded-2xl border border-gray-200 bg-gray-50/60 p-4 dark:border-white/[0.08] dark:bg-white/[0.02] ${
                          draggedFeatureIndex === index ? "opacity-60" : ""
                        }`}
                        onDragOver={handleFeatureDragOver}
                        onDrop={(event) => handleFeatureDrop(event, index)}
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              draggable
                              onDragStart={(event) => handleFeatureDragStart(event, index)}
                              onDragEnd={handleFeatureDragEnd}
                              className="cursor-grab rounded-lg border border-gray-200 px-2 py-1 text-gray-400 transition hover:text-gray-700 active:cursor-grabbing dark:border-gray-700 dark:hover:text-white"
                              aria-label={`Drag feature ${index + 1}`}
                              title="Drag to reorder"
                            >
                              ::
                            </button>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">
                              Feature {index + 1}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeFeature(index)}
                            className="text-sm font-semibold text-red-600 transition hover:text-red-700"
                          >
                            Remove
                          </button>
                        </div>

                        <div className="grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                          <input
                            className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                            placeholder="Feature title"
                            value={feature.title}
                            onChange={(event) =>
                              updateFeature(index, "title", event.target.value)
                            }
                          />

                          <textarea
                            className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                            placeholder="Feature description"
                            rows={2}
                            value={feature.description}
                            onChange={(event) =>
                              updateFeature(index, "description", event.target.value)
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

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

export default PlanForm;
