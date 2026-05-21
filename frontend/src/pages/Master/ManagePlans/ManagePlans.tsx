import { useEffect, useState } from "react";
import PlanTable from "./PlanTable";
import PlanForm from "./PlanForm";
import { SubscriptionPlan } from "./types";
import axios from "axios";
import PlanView from "./PlanView";
import PortfolioPlansSection from "./PortfolioPlansSection";

const ManagePlans = () => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [viewPlan, setViewPlan] = useState<SubscriptionPlan | null>(null);


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
      <div className="flex justify-between items-center">
        <h1  className="text-2xl font-semibold tracking-tight text-gray-800 dark:text-white/90">
          Manage Subscription Plans
        </h1>

        <button
          onClick={handleCreate}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          + Create Plan
        </button>
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
    </div>
  );
};

export default ManagePlans;
