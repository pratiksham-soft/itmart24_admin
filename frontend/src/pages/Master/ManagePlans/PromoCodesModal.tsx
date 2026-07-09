import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Button from "../../../components/ui/button/Button";
import Badge from "../../../components/ui/badge/Badge";
import Alert from "../../../components/ui/alert/Alert";
import { Modal } from "../../../components/ui/modal";
import type {
  PlanPromoCode,
  PromoDiscountType,
  PromoMarketScope,
  PromoScope,
  SubscriptionPlan,
} from "./types";

type PromoCodesModalProps = {
  isOpen: boolean;
  onClose: () => void;
  plans: SubscriptionPlan[];
};

type PromoFormState = {
  id: number | null;
  code: string;
  offerName: string;
  description: string;
  promoScope: PromoScope;
  active: boolean;
  startsAt: string;
  expiresAt: string;
  maxUsesPerVendor: number;
  applicablePlanId: string;
  applicablePortfolioPlanId: string;
  applicablePeriodId: string;
  applicableMarketScope: PromoMarketScope;
  applicableCountryCode: string;
  applicableCountryName: string;
  applicableBillingCycle: string;
  applicablePeriodLabel: string;
  applicableDurationMonths: number;
  applicablePlanName: string;
  applicablePlanSlug: string;
  applicablePortfolioPlanTitle: string;
  discountType: PromoDiscountType;
  discountValue: number;
  discountedPrice: string;
  currency: string;
  durationDays: string;
  allowedTopCategories: string;
  allowedSubCategories: string;
  allowedFinalCategories: string;
};

type PeriodTarget = {
  planId: string;
  planName: string;
  planSlug: string;
  portfolioPlanId: string;
  portfolioPlanTitle: string;
  periodId: string;
  periodLabel: string;
  billingCycle: string;
  durationMonths: number;
  globalPrice: number;
  globalCurrency: string;
  marketOptions: Array<{
    key: string;
    scope: PromoMarketScope;
    countryCode: string;
    countryName: string;
    currency: string;
    price: number;
  }>;
};

const emptyForm: PromoFormState = {
  id: null,
  code: "",
  offerName: "",
  description: "",
  promoScope: "subscription",
  active: true,
  startsAt: "",
  expiresAt: "",
  maxUsesPerVendor: 1,
  applicablePlanId: "",
  applicablePortfolioPlanId: "",
  applicablePeriodId: "",
  applicableMarketScope: "all",
  applicableCountryCode: "",
  applicableCountryName: "",
  applicableBillingCycle: "",
  applicablePeriodLabel: "",
  applicableDurationMonths: 0,
  applicablePlanName: "",
  applicablePlanSlug: "",
  applicablePortfolioPlanTitle: "",
  discountType: "fixed_price",
  discountValue: 0,
  discountedPrice: "",
  currency: "USD",
  durationDays: "",
  allowedTopCategories: "",
  allowedSubCategories: "",
  allowedFinalCategories: "",
};

const normalizeBillingCycle = (label: string, durationInMonths: number) => {
  const normalized = String(label || "").trim().toLowerCase();
  if (durationInMonths === 1 || normalized.includes("month")) {
    return "monthly";
  }
  if (durationInMonths === 12 || normalized.includes("year")) {
    return "yearly";
  }
  if (durationInMonths === 36 || normalized.includes("founder") || normalized.includes("3")) {
    return "3-year";
  }
  return normalized || `${durationInMonths}-month`;
};

const formatMoney = (amount: number, currency = "USD") =>
  new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));

const parseCommaSeparatedValues = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const formatDateForInput = (value: string | null) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 16);
};

const PromoCodesModal = ({ isOpen, onClose, plans }: PromoCodesModalProps) => {
  const [promos, setPromos] = useState<PlanPromoCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PromoFormState>(emptyForm);
  const [statusMessage, setStatusMessage] = useState<{
    variant: "success" | "error" | "warning" | "info";
    title: string;
    message: string;
  } | null>(null);

  const subscriptionTargets = useMemo<PeriodTarget[]>(() => {
    return plans.flatMap((plan) =>
      (plan.periods ?? []).map((period) => ({
        planId: plan.id ?? plan.slug,
        planName: plan.name,
        planSlug: plan.slug,
        portfolioPlanId: "",
        portfolioPlanTitle: "",
        periodId: period.id,
        periodLabel: period.label,
        billingCycle: normalizeBillingCycle(period.label, Number(period.durationInMonths || 0)),
        durationMonths: Number(period.durationInMonths || 0),
        globalPrice: Number(period.price || 0),
        globalCurrency: "USD",
        marketOptions: [
          {
            key: "all",
            scope: "all",
            countryCode: "",
            countryName: "All Markets",
            currency: "USD",
            price: Number(period.price || 0),
          },
          ...((period.countryPricing ?? []).map((market) => ({
            key: market.id,
            scope: "country" as const,
            countryCode: String(market.countryCode || "").toUpperCase(),
            countryName: market.countryName,
            currency: market.currencyCode,
            price: Number(market.price || 0),
          })) ?? []),
        ],
      }))
    );
  }, [plans]);

  const portfolioTargets = useMemo<PeriodTarget[]>(() => {
    return plans.flatMap((plan) =>
      (plan.portfolioPlans ?? []).flatMap((portfolioPlan) =>
        portfolioPlan.pricingOptions.map((option) => ({
          planId: plan.id ?? plan.slug,
          planName: plan.name,
          planSlug: plan.slug,
          portfolioPlanId: portfolioPlan.id,
          portfolioPlanTitle: `${portfolioPlan.title} (${portfolioPlan.minProducts}-${portfolioPlan.maxProducts})`,
          periodId: option.id,
          periodLabel: option.durationUnitName,
          billingCycle: normalizeBillingCycle(
            option.durationUnitName,
            Number(option.periodInMonths || 0)
          ),
          durationMonths: Number(option.periodInMonths || 0),
          globalPrice: Number(option.price || 0),
          globalCurrency: "USD",
          marketOptions: [
            {
              key: "all",
              scope: "all",
              countryCode: "",
              countryName: "All Markets",
              currency: "USD",
              price: Number(option.price || 0),
            },
            ...((option.countryPricing ?? []).map((market) => ({
              key: market.id,
              scope: "country" as const,
              countryCode: String(market.countryCode || "").toUpperCase(),
              countryName: market.countryName,
              currency: market.currencyCode,
              price: Number(market.price || 0),
            })) ?? []),
          ],
        }))
      )
    );
  }, [plans]);

  const availableTargets = form.promoScope === "portfolio" ? portfolioTargets : subscriptionTargets;
  const selectedTarget = useMemo(
    () =>
      availableTargets.find(
        (target) =>
          target.periodId === form.applicablePeriodId &&
          target.planId === form.applicablePlanId &&
          target.portfolioPlanId === form.applicablePortfolioPlanId
      ) || null,
    [availableTargets, form.applicablePeriodId, form.applicablePlanId, form.applicablePortfolioPlanId]
  );

  const selectedMarket = useMemo(() => {
    if (!selectedTarget) {
      return null;
    }

    return (
      selectedTarget.marketOptions.find((market) =>
        form.applicableMarketScope === "country"
          ? market.scope === "country" && market.countryCode === form.applicableCountryCode
          : market.scope === "all"
      ) || selectedTarget.marketOptions[0]
    );
  }, [form.applicableCountryCode, form.applicableMarketScope, selectedTarget]);

  const loadPromos = async () => {
    try {
      setLoading(true);
      setStatusMessage(null);
      const response = await axios.get<PlanPromoCode[]>("/api/subscription-plans/promos");
      setPromos(response.data);
    } catch (error) {
      console.error("Failed to fetch promo codes", error);
      setStatusMessage({
        variant: "error",
        title: "Unable to load promo codes",
        message: "Please try again in a moment.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void loadPromos();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!selectedTarget) {
      return;
    }

    const nextMarket = selectedTarget.marketOptions[0];
    setForm((current) => ({
      ...current,
      applicableBillingCycle: selectedTarget.billingCycle,
      applicablePeriodLabel: selectedTarget.periodLabel,
      applicableDurationMonths: selectedTarget.durationMonths,
      applicablePlanName: selectedTarget.planName,
      applicablePlanSlug: selectedTarget.planSlug,
      applicablePortfolioPlanTitle: selectedTarget.portfolioPlanTitle,
      currency:
        current.applicableMarketScope === "country" && current.applicableCountryCode
          ? current.currency
          : nextMarket?.currency || current.currency,
    }));
  }, [selectedTarget]);

  const resetForm = () => {
    setForm(emptyForm);
    setStatusMessage(null);
  };

  const handleSelectTarget = (targetKey: string) => {
    const target = availableTargets.find(
      (candidate) =>
        `${candidate.planId}__${candidate.portfolioPlanId}__${candidate.periodId}` === targetKey
    );

    if (!target) {
      return;
    }

    const firstMarket = target.marketOptions[0];
    setForm((current) => ({
      ...current,
      applicablePlanId: target.planId,
      applicablePortfolioPlanId: target.portfolioPlanId,
      applicablePeriodId: target.periodId,
      applicableBillingCycle: target.billingCycle,
      applicablePeriodLabel: target.periodLabel,
      applicableDurationMonths: target.durationMonths,
      applicablePlanName: target.planName,
      applicablePlanSlug: target.planSlug,
      applicablePortfolioPlanTitle: target.portfolioPlanTitle,
      applicableMarketScope: firstMarket?.scope ?? "all",
      applicableCountryCode: firstMarket?.countryCode ?? "",
      applicableCountryName: firstMarket?.countryName ?? "",
      currency: firstMarket?.currency ?? "USD",
    }));
  };

  const handleSelectMarket = (marketKey: string) => {
    const market = selectedTarget?.marketOptions.find((candidate) => candidate.key === marketKey);
    if (!market) {
      return;
    }

    setForm((current) => ({
      ...current,
      applicableMarketScope: market.scope,
      applicableCountryCode: market.countryCode,
      applicableCountryName: market.scope === "country" ? market.countryName : "",
      currency: market.currency,
    }));
  };

  const savePromo = async () => {
    if (!form.code.trim() || !form.offerName.trim()) {
      setStatusMessage({
        variant: "warning",
        title: "Promo details missing",
        message: "Please enter a promo code and offer name.",
      });
      return;
    }

    try {
      setSaving(true);
      setStatusMessage(null);

      const payload = {
        code: form.code.trim().toUpperCase(),
        offerName: form.offerName.trim(),
        description: form.description.trim() || null,
        promoScope: form.promoScope,
        active: form.active,
        startsAt: form.startsAt || null,
        expiresAt: form.expiresAt || null,
        maxUsesPerVendor: Number(form.maxUsesPerVendor || 1),
        applicablePlanId: form.applicablePlanId || null,
        applicablePlanName: form.applicablePlanName || null,
        applicablePlanSlug: form.applicablePlanSlug || null,
        applicablePortfolioPlanId: form.applicablePortfolioPlanId || null,
        applicablePortfolioPlanTitle: form.applicablePortfolioPlanTitle || null,
        applicableBillingCycle: form.applicableBillingCycle || null,
        applicablePeriodId: form.applicablePeriodId || null,
        applicablePeriodLabel: form.applicablePeriodLabel || null,
        applicableDurationMonths: Number(form.applicableDurationMonths || 0) || null,
        applicableMarketScope: form.applicableMarketScope,
        applicableCountryCode: form.applicableCountryCode || null,
        applicableCountryName: form.applicableCountryName || null,
        discountType: form.discountType,
        discountValue: Number(form.discountValue || 0),
        discountedPrice:
          form.discountedPrice.trim() === "" ? null : Number(form.discountedPrice),
        currency: form.currency,
        durationDays: form.durationDays.trim() === "" ? null : Number(form.durationDays),
        allowedTopCategories: parseCommaSeparatedValues(form.allowedTopCategories),
        allowedSubCategories: parseCommaSeparatedValues(form.allowedSubCategories),
        allowedFinalCategories: parseCommaSeparatedValues(form.allowedFinalCategories),
        metadata: {
          source: "manage-plans",
          targetBasePrice: selectedMarket?.price ?? selectedTarget?.globalPrice ?? 0,
        },
      };

      const response = form.id
        ? await axios.put<PlanPromoCode>(
            `/api/subscription-plans/promos/${form.id}`,
            payload
          )
        : await axios.post<PlanPromoCode>(
            "/api/subscription-plans/promos",
            payload
          );

      const savedPromo = response.data;
      setPromos((current) => {
        const exists = current.some((promo) => promo.id === savedPromo.id);
        return exists
          ? current.map((promo) => (promo.id === savedPromo.id ? savedPromo : promo))
          : [savedPromo, ...current];
      });
      setStatusMessage({
        variant: "success",
        title: form.id ? "Promo updated" : "Promo created",
        message: `${savedPromo.code} is ready to use.`,
      });
      resetForm();
    } catch (error: any) {
      setStatusMessage({
        variant: "error",
        title: "Save failed",
        message: error?.response?.data?.error || "Unable to save this promo code.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (promo: PlanPromoCode) => {
    setForm({
      id: promo.id,
      code: promo.code,
      offerName: promo.offerName,
      description: promo.description || "",
      promoScope: promo.promoScope,
      active: promo.active,
      startsAt: formatDateForInput(promo.startsAt),
      expiresAt: formatDateForInput(promo.expiresAt),
      maxUsesPerVendor: promo.maxUsesPerVendor,
      applicablePlanId: promo.applicablePlanId || "",
      applicablePortfolioPlanId: promo.applicablePortfolioPlanId || "",
      applicablePeriodId: promo.applicablePeriodId || "",
      applicableMarketScope: promo.applicableMarketScope,
      applicableCountryCode: promo.applicableCountryCode || "",
      applicableCountryName: promo.applicableCountryName || "",
      applicableBillingCycle: promo.applicableBillingCycle || "",
      applicablePeriodLabel: promo.applicablePeriodLabel || "",
      applicableDurationMonths: Number(promo.applicableDurationMonths || 0),
      applicablePlanName: promo.applicablePlanName || "",
      applicablePlanSlug: promo.applicablePlanSlug || "",
      applicablePortfolioPlanTitle: promo.applicablePortfolioPlanTitle || "",
      discountType: promo.discountType,
      discountValue: Number(promo.discountValue || 0),
      discountedPrice:
        promo.discountedPrice == null ? "" : String(promo.discountedPrice),
      currency: promo.currency,
      durationDays: promo.durationDays == null ? "" : String(promo.durationDays),
      allowedTopCategories: (promo.allowedTopCategories ?? []).join(", "),
      allowedSubCategories: (promo.allowedSubCategories ?? []).join(", "),
      allowedFinalCategories: (promo.allowedFinalCategories ?? []).join(", "),
    });
    setStatusMessage(null);
  };

  const toggleStatus = async (promo: PlanPromoCode) => {
    try {
      const response = await axios.patch<PlanPromoCode>(
        `/api/subscription-plans/promos/${promo.id}/status`,
        { active: !promo.active }
      );

      setPromos((current) =>
        current.map((entry) => (entry.id === promo.id ? response.data : entry))
      );
    } catch (error) {
      console.error("Failed to update promo status", error);
    }
  };

  const handleDelete = async (promo: PlanPromoCode) => {
    const confirmed = window.confirm(
      `Delete promo code ${promo.code}? This cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    try {
      await axios.delete(`/api/subscription-plans/promos/${promo.id}`);
      setPromos((current) => current.filter((entry) => entry.id !== promo.id));

      if (form.id === promo.id) {
        resetForm();
      }

      setStatusMessage({
        variant: "success",
        title: "Promo deleted",
        message: `${promo.code} was removed successfully.`,
      });
    } catch (error: any) {
      setStatusMessage({
        variant: "error",
        title: "Delete failed",
        message: error?.response?.data?.error || "Unable to delete this promo code.",
      });
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="m-4 w-full max-w-7xl overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-slate-950"
      showCloseButton={false}
    >
      <div className="max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5 dark:border-white/[0.08]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-500">
                Plan Offer Studio
              </p>
              <h2 className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                Manage Promo Codes
              </h2>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Create targeted promos for subscription or portfolio plans by period and market,
                without changing the base plan prices.
              </p>
            </div>

            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>

          <div className="grid gap-0 overflow-hidden lg:grid-cols-[1.1fr_0.9fr]">
            <div className="overflow-y-auto border-r border-gray-200 p-6 dark:border-white/[0.08]">
              <div className="space-y-6">
                {statusMessage && (
                  <Alert
                    variant={statusMessage.variant}
                    title={statusMessage.title}
                    message={statusMessage.message}
                  />
                )}

                <div className="rounded-3xl border border-gray-200 bg-gradient-to-br from-slate-50 to-white p-5 dark:border-white/[0.08] dark:from-white/[0.03] dark:to-white/[0.01]">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        form.promoScope === "subscription"
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-700 dark:bg-white/[0.06] dark:text-gray-300"
                      }`}
                      onClick={() => setForm((current) => ({ ...emptyForm, promoScope: "subscription", code: current.code, offerName: current.offerName }))}
                    >
                      Subscription Plans
                    </button>
                    <button
                      type="button"
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        form.promoScope === "portfolio"
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-700 dark:bg-white/[0.06] dark:text-gray-300"
                      }`}
                      onClick={() => setForm((current) => ({ ...emptyForm, promoScope: "portfolio", code: current.code, offerName: current.offerName }))}
                    >
                      Portfolio Plans
                    </button>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Promo Code
                      </label>
                      <input
                        className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm uppercase dark:border-white/[0.08] dark:bg-slate-900 dark:text-white"
                        value={form.code}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))
                        }
                        placeholder="PARTNER99"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Offer Name
                      </label>
                      <input
                        className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm dark:border-white/[0.08] dark:bg-slate-900 dark:text-white"
                        value={form.offerName}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, offerName: event.target.value }))
                        }
                        placeholder="ITMart24 Vendor Launch Partner Offer"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Internal Notes
                      </label>
                      <textarea
                        className="min-h-[88px] w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm dark:border-white/[0.08] dark:bg-slate-900 dark:text-white"
                        value={form.description}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, description: event.target.value }))
                        }
                        placeholder="Optional context for the admin team"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-white/[0.08] dark:bg-white/[0.02]">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Target Plan, Period, and Market
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Pick an existing plan configuration first, then choose whether the promo
                        applies globally or to a country override.
                      </p>
                    </div>
                    <Badge color="info" size="sm">
                      {availableTargets.length} targets
                    </Badge>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Plan Target
                      </label>
                      <select
                        className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm dark:border-white/[0.08] dark:bg-slate-900 dark:text-white"
                        value={
                          form.applicablePeriodId
                            ? `${form.applicablePlanId}__${form.applicablePortfolioPlanId}__${form.applicablePeriodId}`
                            : ""
                        }
                        onChange={(event) => handleSelectTarget(event.target.value)}
                      >
                        <option value="">Select a plan and period</option>
                        {availableTargets.map((target) => (
                          <option
                            key={`${target.planId}-${target.portfolioPlanId}-${target.periodId}`}
                            value={`${target.planId}__${target.portfolioPlanId}__${target.periodId}`}
                          >
                            {target.planName}
                            {target.portfolioPlanTitle ? ` / ${target.portfolioPlanTitle}` : ""} -{" "}
                            {target.periodLabel}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Market Target
                      </label>
                      <select
                        className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm dark:border-white/[0.08] dark:bg-slate-900 dark:text-white"
                        value={
                          selectedMarket?.key ||
                          (form.applicableMarketScope === "country"
                            ? form.applicableCountryCode
                            : "all")
                        }
                        onChange={(event) => handleSelectMarket(event.target.value)}
                        disabled={!selectedTarget}
                      >
                        <option value="all">All Markets</option>
                        {(selectedTarget?.marketOptions ?? []).map((market) => (
                          <option key={market.key} value={market.key}>
                            {market.scope === "country"
                              ? `${market.countryName} (${market.currency})`
                              : `All Markets (${market.currency})`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {selectedTarget && (
                    <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
                      Base price preview:{" "}
                      <strong>
                        {formatMoney(selectedMarket?.price ?? selectedTarget.globalPrice, selectedMarket?.currency ?? selectedTarget.globalCurrency)}
                      </strong>{" "}
                      for {selectedTarget.planName}
                      {selectedTarget.portfolioPlanTitle
                        ? ` / ${selectedTarget.portfolioPlanTitle}`
                        : ""}
                      {" - "}
                      {selectedTarget.periodLabel}.
                    </div>
                  )}
                </div>

                <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-white/[0.08] dark:bg-white/[0.02]">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Offer Rules
                  </h3>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Discount Strategy
                      </label>
                      <select
                        className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm dark:border-white/[0.08] dark:bg-slate-900 dark:text-white"
                        value={form.discountType}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            discountType: event.target.value as PromoDiscountType,
                          }))
                        }
                      >
                        <option value="fixed_price">Set final promo price</option>
                        <option value="amount_off">Flat amount off</option>
                        <option value="percent_off">Percent off</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Discount Value
                      </label>
                      <input
                        type="number"
                        min={0}
                        className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm dark:border-white/[0.08] dark:bg-slate-900 dark:text-white"
                        value={form.discountValue}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            discountValue: Number(event.target.value),
                          }))
                        }
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Final Promo Price
                      </label>
                      <input
                        type="number"
                        min={0}
                        className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm dark:border-white/[0.08] dark:bg-slate-900 dark:text-white"
                        value={form.discountedPrice}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            discountedPrice: event.target.value,
                          }))
                        }
                        placeholder="Required for fixed-price promos"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Currency
                      </label>
                      <input
                        className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm uppercase dark:border-white/[0.08] dark:bg-slate-900 dark:text-white"
                        value={form.currency}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            currency: event.target.value.toUpperCase(),
                          }))
                        }
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Starts At
                      </label>
                      <input
                        type="datetime-local"
                        className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm dark:border-white/[0.08] dark:bg-slate-900 dark:text-white"
                        value={form.startsAt}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, startsAt: event.target.value }))
                        }
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Expires At
                      </label>
                      <input
                        type="datetime-local"
                        className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm dark:border-white/[0.08] dark:bg-slate-900 dark:text-white"
                        value={form.expiresAt}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, expiresAt: event.target.value }))
                        }
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Max Uses Per Vendor
                      </label>
                      <input
                        type="number"
                        min={1}
                        className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm dark:border-white/[0.08] dark:bg-slate-900 dark:text-white"
                        value={form.maxUsesPerVendor}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            maxUsesPerVendor: Number(event.target.value),
                          }))
                        }
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Promo Duration Days
                      </label>
                      <input
                        type="number"
                        min={1}
                        className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm dark:border-white/[0.08] dark:bg-slate-900 dark:text-white"
                        value={form.durationDays}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, durationDays: event.target.value }))
                        }
                        placeholder="365"
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Allowed Top Categories
                      </label>
                      <input
                        className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm dark:border-white/[0.08] dark:bg-slate-900 dark:text-white"
                        value={form.allowedTopCategories}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            allowedTopCategories: event.target.value,
                          }))
                        }
                        placeholder="Optional, comma separated"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Allowed Sub Categories
                      </label>
                      <input
                        className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm dark:border-white/[0.08] dark:bg-slate-900 dark:text-white"
                        value={form.allowedSubCategories}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            allowedSubCategories: event.target.value,
                          }))
                        }
                        placeholder="Optional, comma separated"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Allowed Final Categories
                      </label>
                      <input
                        className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm dark:border-white/[0.08] dark:bg-slate-900 dark:text-white"
                        value={form.allowedFinalCategories}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            allowedFinalCategories: event.target.value,
                          }))
                        }
                        placeholder="Optional, comma separated"
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between rounded-2xl border border-dashed border-gray-300 px-4 py-3 dark:border-white/[0.08]">
                    <label className="flex items-center gap-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={form.active}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, active: event.target.checked }))
                        }
                      />
                      Active promo code
                    </label>

                    <div className="flex gap-3">
                      <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>
                        Reset
                      </Button>
                      <Button type="button" onClick={savePromo} disabled={saving}>
                        {saving ? "Saving..." : form.id ? "Update Promo" : "Create Promo"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-y-auto bg-slate-50/60 p-6 dark:bg-white/[0.01]">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Saved Promo Codes
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Review current offers, switch them on or off, or reopen one for editing.
                  </p>
                </div>
                <Badge color="light" size="sm">
                  {promos.length} promos
                </Badge>
              </div>

              <div className="space-y-4">
                {loading ? (
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-gray-400">
                    Loading promo codes...
                  </div>
                ) : promos.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-5 text-sm text-gray-500 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-gray-400">
                    No promo codes have been created yet.
                  </div>
                ) : (
                  promos.map((promo) => (
                    <div
                      key={promo.id}
                      className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.02]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                              {promo.code}
                            </h4>
                            <Badge color={promo.active ? "success" : "error"} size="sm">
                              {promo.active ? "Active" : "Inactive"}
                            </Badge>
                            <Badge color="info" size="sm">
                              {promo.promoScope === "portfolio" ? "Portfolio" : "Subscription"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm font-medium text-gray-700 dark:text-gray-200">
                            {promo.offerName}
                          </p>
                          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                            {promo.applicablePlanName}
                            {promo.applicablePortfolioPlanTitle
                              ? ` / ${promo.applicablePortfolioPlanTitle}`
                              : ""}
                            {" - "}
                            {promo.applicablePeriodLabel || promo.applicableBillingCycle || "Any period"}
                          </p>
                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            {promo.applicableMarketScope === "country"
                              ? `${promo.applicableCountryName || promo.applicableCountryCode} market`
                              : "All markets"}{" "}
                            | {promo.discountType === "fixed_price"
                              ? `Final price ${formatMoney(Number(promo.discountedPrice || 0), promo.currency)}`
                              : promo.discountType === "amount_off"
                                ? `${formatMoney(promo.discountValue, promo.currency)} off`
                                : `${promo.discountValue}% off`}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => handleEdit(promo)}>
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(promo)}
                          >
                            Delete
                          </Button>
                          <Button type="button" size="sm" onClick={() => toggleStatus(promo)}>
                            {promo.active ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
      </div>
    </Modal>
  );
};

export default PromoCodesModal;
