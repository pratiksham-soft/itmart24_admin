import { useEffect, useState } from "react";
import axios from "axios";
import PlanForm from "./PlanForm";
import PlanTable from "./PlanTable";
import PlanView from "./PlanView";
import OneTimeReportPlanForm from "./OneTimeReportPlanForm";
import OneTimeReportPlanTable from "./OneTimeReportPlanTable";
import OneTimeReportPlanView from "./OneTimeReportPlanView";
import { OneTimeReportPlan, SubscriptionPlan, UserPlanProjectKey } from "./types";

const PROJECT_OPTIONS: Array<{
  key: UserPlanProjectKey;
  label: string;
  description: string;
}> = [
  {
    key: "user-portal",
    label: "User Portal",
    description: "Current public pricing and subscription plans used by the user portal.",
  },
  {
    key: "b2b-lead-zone",
    label: "B2B Lead Zone",
    description: "Recurring plans shown only inside the B2B Lead Zone desktop app.",
  },
];

const ManagePlans = () => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [oneTimePlans, setOneTimePlans] = useState<OneTimeReportPlan[]>([]);
  const [selectedProjectKey, setSelectedProjectKey] =
    useState<UserPlanProjectKey>("user-portal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [viewPlan, setViewPlan] = useState<SubscriptionPlan | null>(null);
  const [selectedOneTimePlan, setSelectedOneTimePlan] =
    useState<OneTimeReportPlan | null>(null);
  const [isOneTimeFormOpen, setIsOneTimeFormOpen] = useState(false);
  const [viewOneTimePlan, setViewOneTimePlan] = useState<OneTimeReportPlan | null>(null);
  const [isOneTimeSectionOpen, setIsOneTimeSectionOpen] = useState(true);
  const [seedingB2BDefaults, setSeedingB2BDefaults] = useState(false);

  const selectedProject =
    PROJECT_OPTIONS.find((project) => project.key === selectedProjectKey) ?? PROJECT_OPTIONS[0];

  const pricingOverrideCount = plans.reduce(
    (count, plan) =>
      count +
      (plan.periods ?? []).reduce(
        (periodCount, period) => periodCount + (period.countryPricing?.length ?? 0),
        0
      ),
    0
  );
  const oneTimePricingOverrideCount = oneTimePlans.reduce(
    (count, plan) => count + (plan.countryPricing?.length ?? 0),
    0
  );

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setLoading(true);
        setError(null);
        const subscriptionPlansResponse = await axios.get("/api/user-plans", {
          params: { projectKey: selectedProjectKey },
        });
        setPlans(subscriptionPlansResponse.data);
        if (selectedProjectKey === "user-portal") {
          const oneTimePlansResponse = await axios.get("/api/user-one-time-report-plans");
          setOneTimePlans(oneTimePlansResponse.data);
        } else {
          setOneTimePlans([]);
        }
      } catch (err) {
        console.error(err);
        setError("Failed to load user billing plans");
      } finally {
        setLoading(false);
      }
    };

    void fetchPlans();
  }, [selectedProjectKey]);

  const handleCreate = () => {
    setSelectedPlan({
      projectKey: selectedProjectKey,
      name: "",
      slug: "",
      description: "",
      periods: [],
      features: [],
      isActive: true,
    });
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

  const handleSeedB2BDefaults = async () => {
    try {
      setSeedingB2BDefaults(true);
      const response = await axios.post("/api/user-plans/seed/b2b-lead-zone");
      setPlans(response.data?.plans ?? []);
    } catch (seedError: any) {
      alert(seedError?.response?.data?.error || "Failed to seed B2B Lead Zone plans");
    } finally {
      setSeedingB2BDefaults(false);
    }
  };

  const handleCreateOneTimePlan = () => {
    setSelectedOneTimePlan(null);
    setIsOneTimeFormOpen(true);
  };

  const handleEditOneTimePlan = (plan: OneTimeReportPlan) => {
    setSelectedOneTimePlan(plan);
    setIsOneTimeFormOpen(true);
  };

  const handleDeleteOneTimePlan = async (planId: string) => {
    if (!confirm("Are you sure you want to delete this one-time report plan?")) {
      return;
    }

    try {
      await axios.delete(`/api/user-one-time-report-plans/${planId}`);
      setOneTimePlans((prev) => prev.filter((plan) => plan.id !== planId));
    } catch (deleteError: any) {
      alert(deleteError?.response?.data?.error || "Failed to delete one-time report plan");
    }
  };

  const handleCloseOneTimeForm = () => {
    setSelectedOneTimePlan(null);
    setIsOneTimeFormOpen(false);
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
              Maintain recurring plan catalogs by project with global pricing,
              country-specific overrides, and feature lists while keeping each
              app’s public pricing isolated to its own experience.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {selectedProjectKey === "b2b-lead-zone" ? (
              <button
                type="button"
                onClick={handleSeedB2BDefaults}
                disabled={seedingB2BDefaults}
                className="rounded-full border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-400 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200"
              >
                {seedingB2BDefaults ? "Seeding defaults..." : "Seed Current B2B Defaults"}
              </button>
            ) : null}
            <button
              onClick={handleCreate}
              className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              + Create {selectedProject.label} Plan
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-2">
          {PROJECT_OPTIONS.map((project) => {
            const isSelected = project.key === selectedProjectKey;

            return (
              <button
                key={project.key}
                type="button"
                onClick={() => setSelectedProjectKey(project.key)}
                className={`rounded-2xl border px-4 py-4 text-left transition ${
                  isSelected
                    ? "border-sky-200 bg-sky-50 shadow-sm dark:border-sky-900/60 dark:bg-sky-950/20"
                    : "border-white bg-white/80 hover:border-slate-200 dark:border-white/[0.05] dark:bg-white/[0.03]"
                }`}
              >
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {project.label}
                </p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {project.description}
                </p>
              </button>
            );
          })}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
          <div className="rounded-2xl border border-white bg-white/80 px-4 py-3 shadow-sm dark:border-white/[0.05] dark:bg-white/[0.03]">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Active project
            </p>
            <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
              {selectedProject.label}
            </p>
          </div>
        </div>
      </div>

      {loading ? <div className="text-gray-500">Loading user billing plans...</div> : null}
      {error ? <div className="text-red-600">{error}</div> : null}

      {!loading && !error ? (
        <PlanTable
          plans={plans}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onView={setViewPlan}
        />
      ) : null}

      {!loading && !error && selectedProjectKey === "user-portal" ? (
        <div className="rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-white/[0.02]">
          <div className="flex flex-col gap-4 border-b border-gray-200 px-6 py-5 dark:border-white/[0.08] lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-500">
                One-Time Report Pricing
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                One-Time Report Plans & Pricing
              </h2>
              <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
                Manage one-time report plan rows separately from subscription plans, including
                base INR pricing and country-level overrides for each analyzer workflow.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setIsOneTimeSectionOpen((prev) => !prev)}
                className="rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-400 dark:border-gray-700 dark:text-gray-200"
              >
                {isOneTimeSectionOpen ? "Collapse section" : "Expand section"}
              </button>
              <button
                type="button"
                onClick={handleCreateOneTimePlan}
                className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                + Create One-Time Report Plan
              </button>
            </div>
          </div>

          {isOneTimeSectionOpen ? (
            <div className="space-y-6 p-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-gray-200 bg-gray-50/70 px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Total one-time plans
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                    {oneTimePlans.length}
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50/70 px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Active now
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                    {oneTimePlans.filter((plan) => plan.isActive).length}
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50/70 px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Country overrides
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                    {oneTimePricingOverrideCount}
                  </p>
                </div>
              </div>

              <OneTimeReportPlanTable
                plans={oneTimePlans}
                onEdit={handleEditOneTimePlan}
                onDelete={handleDeleteOneTimePlan}
                onView={setViewOneTimePlan}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {viewPlan ? (
        <PlanView
          plan={viewPlan}
          onClose={() => setViewPlan(null)}
          projectLabel={selectedProject.label}
        />
      ) : null}
      {viewOneTimePlan ? (
        <OneTimeReportPlanView
          plan={viewOneTimePlan}
          onClose={() => setViewOneTimePlan(null)}
        />
      ) : null}

      {isFormOpen ? (
        <PlanForm
          plan={selectedPlan}
          projectKey={selectedProjectKey}
          projectLabel={selectedProject.label}
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

      {isOneTimeFormOpen ? (
        <OneTimeReportPlanForm
          plan={selectedOneTimePlan}
          onClose={handleCloseOneTimeForm}
          onSaved={(updatedPlan) => {
            setOneTimePlans((prev) => {
              const exists = prev.find((plan) => plan.id === updatedPlan.id);
              if (exists) {
                return prev.map((plan) =>
                  plan.id === updatedPlan.id ? updatedPlan : plan
                );
              }

              return [...prev, updatedPlan];
            });
            handleCloseOneTimeForm();
          }}
        />
      ) : null}
    </div>
  );
};

export default ManagePlans;
