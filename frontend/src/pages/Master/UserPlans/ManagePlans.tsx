import { useEffect, useState } from "react";
import axios from "axios";
import PlanForm from "./PlanForm";
import PlanTable from "./PlanTable";
import PlanView from "./PlanView";
import { SubscriptionPlan } from "./types";

const ManagePlans = () => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [viewPlan, setViewPlan] = useState<SubscriptionPlan | null>(null);

  const pricingOverrideCount = plans.reduce(
    (count, plan) =>
      count +
      (plan.periods ?? []).reduce(
        (periodCount, period) => periodCount + (period.countryPricing?.length ?? 0),
        0
      ),
    0
  );

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await axios.get("/api/user-plans");
        setPlans(res.data);
      } catch (err) {
        console.error(err);
        setError("Failed to load user plans");
      } finally {
        setLoading(false);
      }
    };

    void fetchPlans();
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
    if (!confirm("Are you sure you want to delete this user plan?")) {
      return;
    }

    try {
      await axios.delete(`/api/user-plans/${planId}`);
      setPlans((prev) => prev.filter((plan) => plan.id !== planId));
    } catch (error: any) {
      alert(error?.response?.data?.error || "Failed to delete user plan");
    }
  };

  const handleCloseForm = () => {
    setSelectedPlan(null);
    setIsFormOpen(false);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="rounded-3xl border border-gray-200 bg-gradient-to-r from-slate-50 via-white to-sky-50 p-6 shadow-sm dark:border-white/[0.05] dark:from-gray-900 dark:via-gray-900 dark:to-slate-900">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-500">
              User Portal Billing Control
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-800 dark:text-white/90">
              Manage User Plans
            </h1>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
              Maintain the user portal plan catalog with global pricing,
              country-specific overrides, and feature lists that feed the account
              plans experience.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleCreate}
              className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              + Create User Plan
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white bg-white/80 px-4 py-3 shadow-sm dark:border-white/[0.05] dark:bg-white/[0.03]">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Total plans
            </p>
            <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
              {plans.length}
            </p>
          </div>
          <div className="rounded-2xl border border-white bg-white/80 px-4 py-3 shadow-sm dark:border-white/[0.05] dark:bg-white/[0.03]">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Active now
            </p>
            <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
              {plans.filter((plan) => plan.isActive).length}
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

      {loading ? <div className="text-gray-500">Loading user plans...</div> : null}
      {error ? <div className="text-red-600">{error}</div> : null}

      {!loading && !error ? (
        <PlanTable
          plans={plans}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onView={setViewPlan}
        />
      ) : null}

      {viewPlan ? <PlanView plan={viewPlan} onClose={() => setViewPlan(null)} /> : null}

      {isFormOpen ? (
        <PlanForm
          plan={selectedPlan}
          onClose={handleCloseForm}
          onSaved={(updatedPlan) => {
            setPlans((prev) => {
              const exists = prev.find((plan) => plan.id === updatedPlan.id);
              if (exists) {
                return prev.map((plan) =>
                  plan.id === updatedPlan.id ? updatedPlan : plan
                );
              }

              return [...prev, updatedPlan];
            });
            handleCloseForm();
          }}
        />
      ) : null}
    </div>
  );
};

export default ManagePlans;
