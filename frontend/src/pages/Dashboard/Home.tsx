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
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BoxIconLine,
  DollarLineIcon,
  GroupIcon,
  UserCircleIcon,
} from "../../icons";

const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);

const formatTrend = (value: number) => `${Math.abs(value).toFixed(1)}%`;

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

      {overview ? (
        <div className="mb-6 grid grid-cols-12 gap-4 md:gap-6">
          <div className="col-span-12 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="grid gap-0 lg:grid-cols-2">
              <div className="border-b border-gray-200 bg-gradient-to-br from-slate-50 via-white to-white p-5 dark:border-gray-800 dark:from-white/[0.04] dark:via-white/[0.02] dark:to-transparent sm:p-6 lg:border-b-0 lg:border-r">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                      Vendor Commerce
                    </p>
                    <h2 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white/90">
                      Supply-side performance
                    </h2>
                  </div>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-500/10 dark:text-emerald-300">
                    {formatCurrency(overview.summary.currentMonthRevenue)} this month
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-gray-200/80 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Approved Vendors
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white/90">
                      {formatNumber(overview.summary.activeVendors)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-200/80 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Active Subscriptions
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white/90">
                      {formatNumber(overview.summary.activeSubscriptions)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-200/80 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Total Revenue
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white/90">
                      {formatCurrency(overview.summary.totalRevenue)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-blue-50 via-white to-white p-5 dark:from-blue-500/10 dark:via-white/[0.02] dark:to-transparent sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">
                      User Business
                    </p>
                    <h2 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white/90">
                      Demand-side growth snapshot
                    </h2>
                  </div>
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:border-blue-900/40 dark:bg-blue-500/10 dark:text-blue-300">
                    {formatCurrency(overview.userBusiness.summary.currentMonthRevenue)} this month
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900/30 dark:bg-blue-500/5">
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Active Users
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white/90">
                      {formatNumber(overview.userBusiness.summary.activeUsers)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900/30 dark:bg-blue-500/5">
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Represented Businesses
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white/90">
                      {formatNumber(overview.userBusiness.summary.totalBusinesses)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900/30 dark:bg-blue-500/5">
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Paid Orders
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white/90">
                      {formatNumber(overview.userBusiness.summary.paidOrders)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="col-span-12">
            <div className="mb-4 flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white/90">
                User Portal Business Metrics
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Commercial health from the user portal database, aligned with the vendor-side dashboard.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 md:gap-6">
              {[
                {
                  key: "users-total",
                  label: "Total Users",
                  value: formatNumber(overview.userBusiness.summary.totalUsers),
                  meta: `${formatNumber(overview.userBusiness.summary.activeUsers)} active · ${formatNumber(overview.userBusiness.summary.verifiedUsers)} verified`,
                  trend: overview.userBusiness.growth.userGrowthPct,
                  trendLabel: "new users vs last month",
                  icon: <GroupIcon className="size-6 text-gray-800 dark:text-white/90" />,
                },
                {
                  key: "users-businesses",
                  label: "Businesses Represented",
                  value: formatNumber(overview.userBusiness.summary.totalBusinesses),
                  meta: `${formatNumber(overview.userBusiness.summary.subscribedBusinesses)} with active paid access`,
                  trend:
                    overview.userBusiness.summary.totalBusinesses > 0
                      ? (overview.userBusiness.summary.subscribedBusinesses /
                          overview.userBusiness.summary.totalBusinesses) *
                        100
                      : 0,
                  trendLabel: "business conversion to paid access",
                  icon: (
                    <UserCircleIcon className="size-6 text-gray-800 dark:text-white/90" />
                  ),
                },
                {
                  key: "users-subscriptions",
                  label: "User Plan Subscriptions",
                  value: formatNumber(overview.userBusiness.summary.totalSubscriptions),
                  meta: `${formatNumber(overview.userBusiness.summary.activeSubscriptions)} active · ${formatNumber(overview.userBusiness.summary.inactiveSubscriptions)} inactive`,
                  trend: overview.userBusiness.growth.subscriptionGrowthPct,
                  trendLabel: "active plans vs inactive base",
                  icon: (
                    <BoxIconLine className="size-6 text-gray-800 dark:text-white/90" />
                  ),
                },
                {
                  key: "users-revenue",
                  label: "User Revenue This Month",
                  value: formatCurrency(overview.userBusiness.summary.currentMonthRevenue),
                  meta: `${formatCurrency(overview.userBusiness.summary.todayRevenue)} today · ${formatCurrency(overview.userBusiness.summary.totalRevenue)} total`,
                  trend: overview.userBusiness.growth.revenueGrowthPct,
                  trendLabel: "vs previous month",
                  icon: (
                    <DollarLineIcon className="size-6 text-gray-800 dark:text-white/90" />
                  ),
                },
              ].map((card) => {
                const isPositive = card.trend >= 0;

                return (
                  <div
                    key={card.key}
                    className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/[0.03] md:p-6"
                  >
                    <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-gray-100 dark:bg-gray-800">
                      {card.icon}
                    </div>

                    <div className="mt-5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-500 dark:text-gray-400">{card.label}</p>
                        <h3 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white/90">
                          {card.value}
                        </h3>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                          {card.meta}
                        </p>
                      </div>

                      <div
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                          isPositive
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                            : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"
                        }`}
                      >
                        {isPositive ? (
                          <ArrowUpIcon className="size-4" />
                        ) : (
                          <ArrowDownIcon className="size-4" />
                        )}
                        {formatTrend(card.trend)}
                      </div>
                    </div>

                    <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                      {card.trendLabel}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

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
