import { useEffect, useState } from "react";
import EcommerceMetrics from "../../components/ecommerce/EcommerceMetrics";
import MonthlySalesChart from "../../components/ecommerce/MonthlySalesChart";
import StatisticsChart from "../../components/ecommerce/StatisticsChart";
import MonthlyTarget from "../../components/ecommerce/MonthlyTarget";
import RecentOrders from "../../components/ecommerce/RecentOrders";
import DemographicCard from "../../components/ecommerce/DemographicCard";
import PageMeta from "../../components/common/PageMeta";
import { fetchDashboardOverview } from "../../services/dashboard.service";
import type { DashboardOverview } from "../../types/dashboard";

export default function Home() {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadDashboard = async () => {
      try {
        setLoading(true);
        setError(null);
        const nextOverview = await fetchDashboardOverview();

        if (isMounted) {
          setOverview(nextOverview);
        }
      } catch (loadError) {
        if (isMounted) {
          setError("Failed to load dashboard business data.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <>
      <PageMeta
        title="Business Dashboard | ITMart24 Admin"
        description="Live business overview for vendors, subscriptions, revenue, and monthly targets."
      />
      <div className="mb-6 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-800 dark:text-white/90">
            Business Command Center
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Live admin summary for vendor onboarding, subscriptions, and payment performance.
          </p>
        </div>
        {overview ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Updated{" "}
            {new Intl.DateTimeFormat("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            }).format(new Date(overview.generatedAt))}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12 space-y-6 xl:col-span-7">
          <EcommerceMetrics overview={overview} isLoading={loading} error={error} />

          <MonthlySalesChart
            data={overview?.monthlyTrends ?? []}
            isLoading={loading}
            error={error}
          />
        </div>

        <div className="col-span-12 xl:col-span-5">
          <MonthlyTarget
            target={overview?.monthlyTarget ?? null}
            todayRevenue={overview?.summary.todayRevenue ?? 0}
            isLoading={loading}
            error={error}
          />
        </div>

        <div className="col-span-12">
          <StatisticsChart
            data={overview?.monthlyTrends ?? []}
            isLoading={loading}
            error={error}
          />
        </div>

        <div className="col-span-12 xl:col-span-5">
          <DemographicCard
            countries={overview?.countryDistribution ?? []}
            isLoading={loading}
            error={error}
          />
        </div>

        <div className="col-span-12 xl:col-span-7">
          <RecentOrders
            items={overview?.recentActivity ?? []}
            isLoading={loading}
            error={error}
          />
        </div>
      </div>
    </>
  );
}
