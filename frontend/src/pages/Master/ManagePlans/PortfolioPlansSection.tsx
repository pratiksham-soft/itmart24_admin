import { Dispatch, SetStateAction, useMemo, useState } from "react";
import axios from "axios";
import Alert from "../../../components/ui/alert/Alert";
import Badge from "../../../components/ui/badge/Badge";
import Button from "../../../components/ui/button/Button";
import CountryPricingEditor from "./CountryPricingEditor";
import type {
  CountryPricing,
  PortfolioPlan,
  PortfolioPlanPricingOption,
  SubscriptionPlan,
} from "./types";
import {
  calculateDiscountedPrice,
  createCountryPricingDraft,
  createTempId,
  formatMoney,
  getCountryPricingKey,
  normalizeDiscountPercentage,
} from "./pricingConfig";

type PortfolioPlansSectionProps = {
  plans: SubscriptionPlan[];
  setPlans: Dispatch<SetStateAction<SubscriptionPlan[]>>;
  loading: boolean;
};

type PortfolioPlanPricingOptionFormState = {
  tempId: string;
  periodInMonths: number;
  price: number;
  durationUnitName: string;
  discountPercentage?: number;
  countryPricing?: CountryPricing[];
};

type PortfolioPlanFormState = {
  id?: string;
  basePlanId: string;
  title: string;
  minProducts: number;
  maxProducts: number;
  pricingOptions: PortfolioPlanPricingOptionFormState[];
  isActive: boolean;
  sortOrder: number;
};

type StatusMessage = {
  variant: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
};

const PORTFOLIO_BASE_PLAN_ORDER = ["starter", "business", "enterprise"];

const createPricingOptionTempId = () => createTempId("pricing_option");

const createDefaultPricingOption = (
  overrides?: Partial<PortfolioPlanPricingOptionFormState>
): PortfolioPlanPricingOptionFormState => ({
  tempId: createPricingOptionTempId(),
  periodInMonths: 12,
  price: 0,
  durationUnitName: "",
  discountPercentage: 0,
  countryPricing: [],
  ...overrides,
});

const createDefaultFormState = (
  basePlanId = PORTFOLIO_BASE_PLAN_ORDER[0],
  basePlanName = "Starter"
): PortfolioPlanFormState => ({
  basePlanId,
  title: `${basePlanName} Portfolio`,
  minProducts: 3,
  maxProducts: 5,
  pricingOptions: [
    createDefaultPricingOption({
      periodInMonths: 12,
      durationUnitName: "Yearly",
    }),
  ],
  isActive: true,
  sortOrder: 1,
});

const formatRange = (portfolioPlan: Pick<PortfolioPlan, "minProducts" | "maxProducts">) =>
  `${portfolioPlan.minProducts}-${portfolioPlan.maxProducts}`;

const sortPortfolioPlans = (portfolioPlans: PortfolioPlan[]) =>
  [...portfolioPlans].sort((left, right) => {
    const sortOrderDifference = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);

    if (sortOrderDifference !== 0) {
      return sortOrderDifference;
    }

    if (left.minProducts !== right.minProducts) {
      return left.minProducts - right.minProducts;
    }

    return left.maxProducts - right.maxProducts;
  });

const sortPricingOptions = (
  pricingOptions: PortfolioPlanPricingOption[]
): PortfolioPlanPricingOption[] =>
  [...pricingOptions].sort((left, right) => left.periodInMonths - right.periodInMonths);

const rangesOverlap = (
  minA: number,
  maxA: number,
  minB: number,
  maxB: number
) => minA <= maxB && minB <= maxA;

const PortfolioPlansSection = ({
  plans,
  setPlans,
  loading,
}: PortfolioPlansSectionProps) => {
  const [form, setForm] = useState<PortfolioPlanFormState>(() =>
    createDefaultFormState()
  );
  const [editingPortfolioPlanId, setEditingPortfolioPlanId] = useState<string | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null);

  const basePlans = useMemo(
    () =>
      PORTFOLIO_BASE_PLAN_ORDER.map((planId) =>
        plans.find(
          (plan) =>
            (plan.id ?? plan.slug)?.toLowerCase() === planId ||
            plan.slug?.toLowerCase() === planId
        )
      ).filter((plan): plan is SubscriptionPlan => Boolean(plan)),
    [plans]
  );

  const portfolioPlansByBasePlan = useMemo(() => {
    const grouped = new Map<string, PortfolioPlan[]>();

    basePlans.forEach((plan) => {
      grouped.set(plan.id ?? plan.slug, sortPortfolioPlans(plan.portfolioPlans ?? []));
    });

    return grouped;
  }, [basePlans]);

  const activeBasePlanName =
    basePlans.find((plan) => (plan.id ?? plan.slug) === form.basePlanId)?.name ?? "Starter";

  const resetForm = () => {
    setEditingPortfolioPlanId(null);
    setForm(
      createDefaultFormState(
        basePlans[0]?.id ?? basePlans[0]?.slug ?? PORTFOLIO_BASE_PLAN_ORDER[0],
        basePlans[0]?.name ?? "Starter"
      )
    );
  };

  const syncPlans = (updatedPlans: SubscriptionPlan[]) => {
    setPlans(updatedPlans);
  };

  const upsertPortfolioPlanInState = (
    basePlanId: string,
    portfolioPlan: PortfolioPlan
  ) => {
    setPlans((previousPlans) =>
      previousPlans.map((plan) => {
        const planKey = plan.id ?? plan.slug;

        if (planKey !== basePlanId) {
          return plan;
        }

        const existingPortfolioPlans = plan.portfolioPlans ?? [];
        const alreadyExists = existingPortfolioPlans.some(
          (existingPlan) => existingPlan.id === portfolioPlan.id
        );
        const nextPortfolioPlans = alreadyExists
          ? existingPortfolioPlans.map((existingPlan) =>
              existingPlan.id === portfolioPlan.id ? portfolioPlan : existingPlan
            )
          : [...existingPortfolioPlans, portfolioPlan];

        return {
          ...plan,
          portfolioPlans: sortPortfolioPlans(nextPortfolioPlans),
        };
      })
    );
  };

  const addPricingOption = () => {
    setForm((previousForm) => ({
      ...previousForm,
      pricingOptions: [...previousForm.pricingOptions, createDefaultPricingOption()],
    }));
  };

  const updatePricingOption = (
    tempId: string,
    field:
      | "periodInMonths"
      | "price"
      | "durationUnitName"
      | "discountPercentage",
    value: number | string
  ) => {
    setForm((previousForm) => ({
      ...previousForm,
      pricingOptions: previousForm.pricingOptions.map((option) =>
        option.tempId === tempId
          ? {
              ...option,
              [field]:
                field === "discountPercentage"
                  ? normalizeDiscountPercentage(Number(value))
                  : value,
            }
          : option
      ),
    }));
  };

  const updatePricingOptionCountryPricing = (
    tempId: string,
    countryPricing: CountryPricing[]
  ) => {
    setForm((previousForm) => ({
      ...previousForm,
      pricingOptions: previousForm.pricingOptions.map((option) =>
        option.tempId === tempId ? { ...option, countryPricing } : option
      ),
    }));
  };

  const removePricingOption = (tempId: string) => {
    setForm((previousForm) => ({
      ...previousForm,
      pricingOptions: previousForm.pricingOptions.filter(
        (option) => option.tempId !== tempId
      ),
    }));
  };

  const validateForm = () => {
    const basePlanId = form.basePlanId.trim();

    if (!basePlanId) {
      return "Base plan is required";
    }

    if (!form.title.trim()) {
      return "Portfolio plan title is required";
    }

    if (!Number.isFinite(form.minProducts) || form.minProducts <= 0) {
      return "Min product count must be a positive number";
    }

    if (!Number.isFinite(form.maxProducts) || form.maxProducts < form.minProducts) {
      return "Max product count must be greater than or equal to min product count";
    }

    if (form.pricingOptions.length === 0) {
      return "At least one pricing option is required";
    }

    const seenPeriods = new Set<number>();

    for (const pricingOption of form.pricingOptions) {
      if (
        !Number.isFinite(pricingOption.periodInMonths) ||
        pricingOption.periodInMonths <= 0
      ) {
        return "Each period in months value must be a positive number";
      }

      if (!Number.isFinite(pricingOption.price) || pricingOption.price < 0) {
        return "Each price value must be zero or positive";
      }

      if (
        !Number.isFinite(pricingOption.discountPercentage ?? 0) ||
        normalizeDiscountPercentage(pricingOption.discountPercentage) !==
          Number(pricingOption.discountPercentage ?? 0)
      ) {
        return "Each discount percentage must stay between 0 and 100";
      }

      if (!pricingOption.durationUnitName.trim()) {
        return "Each duration unit name is required";
      }

      const seenCountries = new Set<string>();

      for (const market of pricingOption.countryPricing ?? []) {
        if (!market.countryName.trim()) {
          return "Each country pricing row needs a country name";
        }

        if (!market.currencyCode.trim()) {
          return `Currency code is required for ${market.countryName}`;
        }

        if (!Number.isFinite(market.price) || market.price < 0) {
          return `Country price for ${market.countryName} must be zero or positive`;
        }

        const countryKey = getCountryPricingKey(market);

        if (seenCountries.has(countryKey)) {
          return `Duplicate country pricing found for ${market.countryName}`;
        }

        seenCountries.add(countryKey);
      }

      if (seenPeriods.has(pricingOption.periodInMonths)) {
        return `Duplicate period in months value found: ${pricingOption.periodInMonths}`;
      }

      seenPeriods.add(pricingOption.periodInMonths);
    }

    const existingPortfolioPlans = portfolioPlansByBasePlan.get(basePlanId) ?? [];
    const overlappingPortfolioPlan = existingPortfolioPlans.find(
      (portfolioPlan) =>
        portfolioPlan.id !== editingPortfolioPlanId &&
        rangesOverlap(
          portfolioPlan.minProducts,
          portfolioPlan.maxProducts,
          form.minProducts,
          form.maxProducts
        )
    );

    if (overlappingPortfolioPlan) {
      return `Range ${form.minProducts}-${form.maxProducts} overlaps with existing range ${formatRange(
        overlappingPortfolioPlan
      )}`;
    }

    return null;
  };

  const handleBasePlanChange = (basePlanId: string) => {
    const selectedBasePlan = basePlans.find(
      (plan) => (plan.id ?? plan.slug) === basePlanId
    );

    setForm((previousForm) => {
      const previousBasePlanName =
        basePlans.find((plan) => (plan.id ?? plan.slug) === previousForm.basePlanId)?.name ??
        "Starter";
      const previousDefaultTitle = `${previousBasePlanName} Portfolio`;
      const nextDefaultTitle = `${selectedBasePlan?.name ?? "Starter"} Portfolio`;

      return {
        ...previousForm,
        basePlanId,
        title:
          editingPortfolioPlanId ||
          (previousForm.title.trim() !== "" &&
            previousForm.title.trim() !== previousDefaultTitle)
            ? previousForm.title
            : nextDefaultTitle,
        sortOrder:
          previousForm.sortOrder > 0
            ? previousForm.sortOrder
            : (portfolioPlansByBasePlan.get(basePlanId)?.length ?? 0) + 1,
      };
    });
  };

  const handleEdit = (portfolioPlan: PortfolioPlan) => {
    setEditingPortfolioPlanId(portfolioPlan.id);
    setStatusMessage(null);
    setForm({
      id: portfolioPlan.id,
      basePlanId: portfolioPlan.basePlanId,
      title: portfolioPlan.title,
      minProducts: portfolioPlan.minProducts,
      maxProducts: portfolioPlan.maxProducts,
      pricingOptions: sortPricingOptions(portfolioPlan.pricingOptions).map((option) => ({
        tempId: option.id,
        periodInMonths: option.periodInMonths,
        price: option.price,
        durationUnitName: option.durationUnitName,
        discountPercentage: normalizeDiscountPercentage(option.discountPercentage),
        countryPricing: (option.countryPricing ?? []).map((market) => ({
          ...market,
          id: market.id || createCountryPricingDraft().id,
          discountPercentage: normalizeDiscountPercentage(market.discountPercentage),
        })),
      })),
      isActive: portfolioPlan.isActive,
      sortOrder: portfolioPlan.sortOrder ?? 1,
    });
  };

  const handleSave = async () => {
    const validationMessage = validateForm();

    if (validationMessage) {
      alert(validationMessage);
      return;
    }

    const payload = {
      basePlanId: form.basePlanId,
      title: form.title.trim(),
      minProducts: form.minProducts,
      maxProducts: form.maxProducts,
      pricingOptions: form.pricingOptions.map((option) => ({
        periodInMonths: option.periodInMonths,
        price: option.price,
        durationUnitName: option.durationUnitName.trim(),
        discountPercentage: normalizeDiscountPercentage(option.discountPercentage),
        countryPricing: (option.countryPricing ?? [])
          .map((market) => ({
            ...market,
            countryCode: market.countryCode?.trim().toUpperCase() || "",
            countryName: market.countryName.trim(),
            currencyCode: market.currencyCode.trim().toUpperCase(),
            price: Number(market.price),
            discountPercentage: normalizeDiscountPercentage(
              market.discountPercentage
            ),
          }))
          .filter((market) => market.countryName && market.currencyCode),
      })),
      isActive: form.isActive,
      sortOrder: form.sortOrder,
    };

    try {
      setSaving(true);
      setStatusMessage(null);

      if (editingPortfolioPlanId) {
        const response = await axios.put<PortfolioPlan>(
          `/api/subscription-plans/${form.basePlanId}/portfolio/${editingPortfolioPlanId}`,
          payload
        );

        upsertPortfolioPlanInState(form.basePlanId, response.data);
        setStatusMessage({
          variant: "success",
          title: "Portfolio plan updated",
          message: `${response.data.title} ${formatRange(response.data)} was updated successfully.`,
        });
      } else {
        const response = await axios.post<PortfolioPlan>(
          "/api/subscription-plans/portfolio",
          payload
        );

        upsertPortfolioPlanInState(form.basePlanId, response.data);
        setStatusMessage({
          variant: "success",
          title: "Portfolio plan created",
          message: `${response.data.title} ${formatRange(response.data)} was added successfully.`,
        });
      }

      resetForm();
    } catch (error: any) {
      const message =
        error?.response?.data?.error ?? "Failed to save portfolio plan";

      console.error("Portfolio plan save failed:", error);
      setStatusMessage({
        variant: "error",
        title: "Save failed",
        message,
      });
      alert(message);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusToggle = async (portfolioPlan: PortfolioPlan) => {
    const nextIsActive = !portfolioPlan.isActive;
    const actionLabel = nextIsActive ? "activate" : "deactivate";

    if (
      !window.confirm(
        `Are you sure you want to ${actionLabel} ${portfolioPlan.title} ${formatRange(
          portfolioPlan
        )}?`
      )
    ) {
      return;
    }

    try {
      setSaving(true);
      setStatusMessage(null);

      const response = await axios.patch<PortfolioPlan>(
        `/api/subscription-plans/${portfolioPlan.basePlanId}/portfolio/${portfolioPlan.id}/status`,
        { isActive: nextIsActive }
      );

      upsertPortfolioPlanInState(portfolioPlan.basePlanId, response.data);
      setStatusMessage({
        variant: "success",
        title: nextIsActive ? "Portfolio plan activated" : "Portfolio plan deactivated",
        message: `${response.data.title} ${formatRange(response.data)} is now ${
          nextIsActive ? "active" : "inactive"
        }.`,
      });
    } catch (error: any) {
      const message =
        error?.response?.data?.error ??
        "Failed to update portfolio plan status";

      console.error("Portfolio plan status update failed:", error);
      setStatusMessage({
        variant: "error",
        title: "Status update failed",
        message,
      });
      alert(message);
    } finally {
      setSaving(false);
    }
  };

  const handleSeedPortfolioPlans = async () => {
    if (
      !window.confirm(
        "Seed the default Starter, Business, and Enterprise portfolio plans where they do not already exist?"
      )
    ) {
      return;
    }

    try {
      setSeeding(true);
      setStatusMessage(null);

      const response = await axios.post<{ success: boolean; plans: SubscriptionPlan[] }>(
        "/api/subscription-plans/portfolio/seed"
      );

      syncPlans(response.data.plans);
      resetForm();
      setStatusMessage({
        variant: "success",
        title: "Portfolio plans seeded",
        message:
          "Default portfolio plans were added where missing. Existing ranges were left untouched.",
      });
    } catch (error: any) {
      const message =
        error?.response?.data?.error ?? "Failed to seed portfolio plans";

      console.error("Seed portfolio plans failed:", error);
      setStatusMessage({
        variant: "error",
        title: "Seed failed",
        message,
      });
      alert(message);
    } finally {
      setSeeding(false);
    }
  };

  const basePlanCount = basePlans.length;
  const portfolioPlanCount = basePlans.reduce(
    (count, plan) => count + (plan.portfolioPlans?.length ?? 0),
    0
  );

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/[0.05] dark:bg-white/[0.03]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">
                Portfolio Plans
              </h2>
              <Badge color="info" size="sm">
                {portfolioPlanCount} total
              </Badge>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Manage package-based pricing for vendors listing multiple products
              under Starter, Business, and Enterprise tiers.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={resetForm}
              disabled={saving || seeding}
            >
              New Portfolio Plan
            </Button>
            <Button
              type="button"
              onClick={handleSeedPortfolioPlans}
              disabled={loading || saving || seeding || basePlanCount === 0}
            >
              {seeding ? "Seeding..." : "Seed Default Plans"}
            </Button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {basePlans.map((plan) => (
            <Badge
              key={plan.id ?? plan.slug}
              color={
                (plan.id ?? plan.slug) === "starter"
                  ? "primary"
                  : (plan.id ?? plan.slug) === "business"
                    ? "warning"
                    : "dark"
              }
            >
              {plan.name}
            </Badge>
          ))}
        </div>
      </div>

      {statusMessage && (
        <Alert
          variant={statusMessage.variant}
          title={statusMessage.title}
          message={statusMessage.message}
        />
      )}

      <div className="grid gap-6 xl:grid-cols-[460px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/[0.05] dark:bg-white/[0.03]">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                {editingPortfolioPlanId ? "Edit Portfolio Plan" : "Add Portfolio Plan"}
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Create package pricing under an existing subscription plan.
              </p>
            </div>
            {editingPortfolioPlanId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Base Plan
              </label>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                value={form.basePlanId}
                onChange={(event) => handleBasePlanChange(event.target.value)}
                disabled={Boolean(editingPortfolioPlanId)}
              >
                {basePlans.map((plan) => (
                  <option key={plan.id ?? plan.slug} value={plan.id ?? plan.slug}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Portfolio Plan Title
              </label>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                value={form.title}
                placeholder={`${activeBasePlanName} Portfolio`}
                onChange={(event) =>
                  setForm((previousForm) => ({
                    ...previousForm,
                    title: event.target.value,
                  }))
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Min Product Count
                </label>
                <input
                  type="number"
                  min={1}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  value={form.minProducts}
                  onChange={(event) =>
                    setForm((previousForm) => ({
                      ...previousForm,
                      minProducts: Number(event.target.value),
                    }))
                  }
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Max Product Count
                </label>
                <input
                  type="number"
                  min={1}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  value={form.maxProducts}
                  onChange={(event) =>
                    setForm((previousForm) => ({
                      ...previousForm,
                      maxProducts: Number(event.target.value),
                    }))
                  }
                />
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-4 dark:border-white/[0.05]">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-800 dark:text-white/90">
                    Pricing Options
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Add one or more duration-based pricing rows for this portfolio range.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addPricingOption}
                  className="text-sm font-medium text-brand-500 hover:text-brand-600"
                >
                  + Add Option
                </button>
              </div>

              <div className="space-y-3">
                    {form.pricingOptions.map((pricingOption, index) => (
                      <div
                        key={pricingOption.tempId}
                        className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.05] dark:bg-gray-950/40"
                      >
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                        Option {index + 1}
                      </p>
                      {form.pricingOptions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removePricingOption(pricingOption.tempId)}
                          className="text-sm text-red-600 hover:text-red-700"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-4">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Period In Months
                        </label>
                        <input
                          type="number"
                          min={1}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                          value={pricingOption.periodInMonths}
                          onChange={(event) =>
                            updatePricingOption(
                              pricingOption.tempId,
                              "periodInMonths",
                              Number(event.target.value)
                            )
                          }
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Price
                        </label>
                        <input
                          type="number"
                          min={0}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                          value={pricingOption.price}
                          onChange={(event) =>
                            updatePricingOption(
                              pricingOption.tempId,
                              "price",
                              Number(event.target.value)
                            )
                          }
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Discount %
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                          value={pricingOption.discountPercentage ?? 0}
                          onChange={(event) =>
                            updatePricingOption(
                              pricingOption.tempId,
                              "discountPercentage",
                              Number(event.target.value)
                            )
                          }
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Duration Unit Name
                        </label>
                        <input
                          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                          placeholder="Yearly or Founder Lock"
                          value={pricingOption.durationUnitName}
                          onChange={(event) =>
                            updatePricingOption(
                              pricingOption.tempId,
                              "durationUnitName",
                              event.target.value
                            )
                          }
                        />
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                      <span className="font-semibold">Global preview:</span>{" "}
                      {formatMoney(pricingOption.price, "USD")} with{" "}
                      {pricingOption.discountPercentage ?? 0}% off becomes{" "}
                      {formatMoney(
                        calculateDiscountedPrice(
                          pricingOption.price,
                          pricingOption.discountPercentage
                        ),
                        "USD"
                      )}
                      .
                    </div>

                    <div className="mt-3">
                      <CountryPricingEditor
                        items={pricingOption.countryPricing ?? []}
                        onChange={(items) =>
                          updatePricingOptionCountryPricing(pricingOption.tempId, items)
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Sort Order
                </label>
                <input
                  type="number"
                  min={1}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  value={form.sortOrder}
                  onChange={(event) =>
                    setForm((previousForm) => ({
                      ...previousForm,
                      sortOrder: Number(event.target.value),
                    }))
                  }
                />
              </div>

              <div className="flex items-end">
                <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) =>
                      setForm((previousForm) => ({
                        ...previousForm,
                        isActive: event.target.checked,
                      }))
                    }
                  />
                  Active Portfolio Plan
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm dark:border-gray-700 dark:bg-gray-900/30">
              <p className="font-medium text-gray-800 dark:text-white/90">Preview</p>
              <div className="mt-2 space-y-2 text-gray-600 dark:text-gray-400">
                {sortPricingOptions(
                  form.pricingOptions.map((option) => ({
                    id: option.tempId,
                    periodInMonths: option.periodInMonths,
                    price: option.price,
                    durationUnitName: option.durationUnitName.trim() || "Unnamed",
                    discountPercentage: normalizeDiscountPercentage(
                      option.discountPercentage
                    ),
                    countryPricing: option.countryPricing ?? [],
                  }))
                ).map((option) => (
                  <p key={option.id}>
                    {option.periodInMonths} month{option.periodInMonths === 1 ? "" : "s"}:{" "}
                    {formatMoney(
                      calculateDiscountedPrice(option.price, option.discountPercentage),
                      "USD"
                    )}{" "}
                    ({option.durationUnitName}) with {option.countryPricing?.length ?? 0} market
                    {((option.countryPricing?.length ?? 0) === 1) ? "" : "s"}
                  </p>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-white/[0.05]">
              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving || loading}>
                {saving
                  ? editingPortfolioPlanId
                    ? "Saving..."
                    : "Creating..."
                  : editingPortfolioPlanId
                    ? "Save Portfolio Plan"
                    : "Add Portfolio Plan"}
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {loading ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm dark:border-white/[0.05] dark:bg-white/[0.03] dark:text-gray-400">
              Loading portfolio plans...
            </div>
          ) : basePlans.length === 0 ? (
            <Alert
              variant="warning"
              title="Portfolio base plans not found"
              message="Create or restore the Starter, Business, and Enterprise subscription plans before managing portfolio plans."
            />
          ) : (
            basePlans.map((plan) => {
              const planKey = plan.id ?? plan.slug;
              const portfolioPlans = portfolioPlansByBasePlan.get(planKey) ?? [];

              return (
                <div
                  key={planKey}
                  className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/[0.05] dark:bg-white/[0.03]"
                >
                  <div className="border-b border-gray-200 px-6 py-4 dark:border-white/[0.05]">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                            {plan.name} Portfolio
                          </h3>
                          <Badge
                            color={
                              planKey === "starter"
                                ? "primary"
                                : planKey === "business"
                                  ? "warning"
                                  : "dark"
                            }
                            size="sm"
                          >
                            {plan.name}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {portfolioPlans.length} portfolio plan
                          {portfolioPlans.length === 1 ? "" : "s"} configured.
                        </p>
                      </div>

                      <button
                        type="button"
                        className="text-sm font-medium text-brand-500 hover:text-brand-600"
                        onClick={() => handleBasePlanChange(planKey)}
                      >
                        Add under {plan.name}
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                    {portfolioPlans.length === 0 ? (
                      <div className="px-6 py-5 text-sm text-gray-500 dark:text-gray-400">
                        No portfolio plans added yet for {plan.name}.
                      </div>
                    ) : (
                      portfolioPlans.map((portfolioPlan) => (
                        <div key={portfolioPlan.id} className="px-6 py-5">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-base font-semibold text-gray-800 dark:text-white/90">
                                  {portfolioPlan.title}
                                </span>
                                <Badge
                                  color={portfolioPlan.isActive ? "success" : "error"}
                                  size="sm"
                                >
                                  {portfolioPlan.isActive ? "Active" : "Inactive"}
                                </Badge>
                                <Badge color="light" size="sm">
                                  {formatRange(portfolioPlan)} products
                                </Badge>
                                <Badge color="info" size="sm">
                                  Sort {portfolioPlan.sortOrder}
                                </Badge>
                              </div>

                              <div className="space-y-2">
                                {sortPricingOptions(portfolioPlan.pricingOptions).map((option) => (
                                  <div
                                    key={option.id}
                                    className="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
                                  >
                                    <Badge color="light" size="sm">
                                      {option.periodInMonths} month
                                      {option.periodInMonths === 1 ? "" : "s"}
                                    </Badge>
                                    <Badge color="warning" size="sm">
                                      {formatMoney(
                                        calculateDiscountedPrice(
                                          option.price,
                                          option.discountPercentage
                                        ),
                                        "USD"
                                      )}
                                    </Badge>
                                    <Badge color="dark" size="sm">
                                      {option.durationUnitName}
                                    </Badge>
                                    <Badge color="success" size="sm">
                                      {option.discountPercentage ?? 0}% off
                                    </Badge>
                                    {(option.countryPricing?.length ?? 0) > 0 && (
                                      <Badge color="info" size="sm">
                                        {option.countryPricing?.length} country override
                                        {(option.countryPricing?.length ?? 0) === 1 ? "" : "s"}
                                      </Badge>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-3 lg:justify-end">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleEdit(portfolioPlan)}
                                disabled={saving}
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => handleStatusToggle(portfolioPlan)}
                                disabled={saving}
                              >
                                {portfolioPlan.isActive ? "Deactivate" : "Activate"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
};

export default PortfolioPlansSection;
