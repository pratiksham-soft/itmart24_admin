import { useEffect, useState } from "react";
import PlanTable from "./PlanTable";
import PlanForm from "./PlanForm";
import { SubscriptionPlan } from "./types";
import axios from "axios";
import PlanView from "./PlanView";
import PortfolioPlansSection from "./PortfolioPlansSection";
import PromoCodesModal from "./PromoCodesModal";

const ManagePlans = () => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [viewPlan, setViewPlan] = useState<SubscriptionPlan | null>(null);
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);

  const pricingOverrideCount = plans.reduce(
    (count, plan) =>
      count +
      (plan.periods ?? []).reduce(
        (periodCount, period) => periodCount + (period.countryPricing?.length ?? 0),
        0
      ) +
      (plan.portfolioPlans ?? []).reduce(
        (portfolioCount, portfolioPlan) =>
          portfolioCount +
          portfolioPlan.pricingOptions.reduce(
            (optionCount, option) => optionCount + (option.countryPricing?.length ?? 0),
            0
          ),
        0
      ),
    0
  );

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setLoading(true);
        setError(null);


        const res = await axios.get(
          "/api/subscription-plans"
        );

        setPlans(res.data);
      } catch (err) {
        console.error(err);
        setError("Failed to load subscription plans");
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, []);

  const handleCreate = () => {
    setSelectedPlan(null);
    setIsFormOpen(true);
  };

  const handleEdit = (plan: SubscriptionPlan) => {
    setSelectedPlan(plan);
    setIsFormOpen(true);
  };

  const handleDelete = async (planId: string) => {
    if (!confirm("Are you sure you want to delete this plan?")) {
      return;
    }

    try {
      await axios.delete(`/api/subscription-plans/${planId}`);
      setPlans((prev) => prev.filter((p) => p.id !== planId));
    } catch (error: any) {
      alert(
        error?.response?.data?.error ||
        "Failed to delete subscription plan"
      );
    }
  };

  const handleCloseForm = () => {
    setSelectedPlan(null);
    setIsFormOpen(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="rounded-3xl border border-gray-200 bg-gradient-to-r from-slate-50 via-white to-sky-50 p-6 shadow-sm dark:border-white/[0.05] dark:from-gray-900 dark:via-gray-900 dark:to-slate-900">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-500">
              Enterprise Billing Control
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-800 dark:text-white/90">
              Manage Subscription Plans
            </h1>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
              Maintain standard plans and portfolio plans from one workspace, now with
              country-specific pricing overrides and percentage-based discounts built
              directly into each billing option.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setIsPromoModalOpen(true)}
              className="rounded-full border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-blue-300 hover:text-blue-700 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white"
            >
              Manage Promo Codes
            </button>
            <button
              onClick={handleCreate}
              className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              + Create Plan
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white bg-white/80 px-4 py-3 shadow-sm dark:border-white/[0.05] dark:bg-white/[0.03]">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Standard plans
            </p>
            <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
              {plans.length}
            </p>
          </div>
          <div className="rounded-2xl border border-white bg-white/80 px-4 py-3 shadow-sm dark:border-white/[0.05] dark:bg-white/[0.03]">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Portfolio plans
            </p>
            <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
              {plans.reduce(
                (count, plan) => count + (plan.portfolioPlans?.length ?? 0),
                0
              )}
            </p>
          </div>
          <div className="rounded-2xl border border-white bg-white/80 px-4 py-3 shadow-sm dark:border-white/[0.05] dark:bg-white/[0.03]">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Country overrides
            </p>
            <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
              {pricingOverrideCount}
            </p>
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-gray-500">Loading plans...</div>
      )}

      {error && (
        <div className="text-red-600">{error}</div>
      )}

      {!loading && !error && (
        <>
          <PlanTable
            plans={plans}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onView={setViewPlan}
          />

          <PortfolioPlansSection
            plans={plans}
            setPlans={setPlans}
            loading={loading}
          />
        </>
      )}

      {viewPlan && (
        <PlanView
          plan={viewPlan}
          onClose={() => setViewPlan(null)}
        />
      )}

      {isFormOpen && (
        <PlanForm
          plan={selectedPlan}
          onClose={handleCloseForm}
          onSaved={(updatedPlan) => {
            setPlans((prev) => {
              const exists = prev.find(p => p.id === updatedPlan.id);
              if (exists) {
                return prev.map(p => p.id === updatedPlan.id ? updatedPlan : p);
              }
              return [...prev, updatedPlan];
            });
            handleCloseForm();
          }}
        />
      )}

      <PromoCodesModal
        isOpen={isPromoModalOpen}
        onClose={() => setIsPromoModalOpen(false)}
        plans={plans}
      />
    </div>
  );
};

export default ManagePlans;
