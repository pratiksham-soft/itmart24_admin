import {
  ArrowDownIcon,
  ArrowUpIcon,
  BoxIconLine,
  DollarLineIcon,
  GroupIcon,
  UserCircleIcon,
} from "../../icons";
import Badge from "../ui/badge/Badge";
import type { DashboardOverview } from "../../types/dashboard";

type EcommerceMetricsProps = {
  overview: DashboardOverview | null;
  isLoading: boolean;
  error: string | null;
};

type MetricCard = {
  key: string;
  label: string;
  value: string;
  meta: string;
  icon: React.ReactNode;
  trendValue: number;
  trendLabel: string;
  trendColor: "success" | "error" | "warning";
  neutral?: boolean;
};

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

export default function EcommerceMetrics({
  overview,
  isLoading,
  error,
}: EcommerceMetricsProps) {
  if (isLoading && !overview) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6"
          >
            <div className="h-12 w-12 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
            <div className="mt-5 space-y-3">
              <div className="h-4 w-28 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
              <div className="h-8 w-24 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
              <div className="h-4 w-36 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error && !overview) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-500/10 dark:text-red-300">
        {error}
      </div>
    );
  }

  if (!overview) {
    return null;
  }

  const { summary, growth } = overview;
  const approvalRate =
    summary.totalVendors > 0
      ? (summary.activeVendors / summary.totalVendors) * 100
      : 0;

  const cards: MetricCard[] = [
    {
      key: "total-vendors",
      label: "Total Vendors",
      value: formatNumber(summary.totalVendors),
      meta: `${formatNumber(summary.activeVendors)} approved · ${formatNumber(
        summary.vendorsWithIncompleteDocuments
      )} incomplete`,
      icon: <GroupIcon className="text-gray-800 size-6 dark:text-white/90" />,
      trendValue: growth.vendorGrowthPct,
      trendLabel: "new vendors vs last month",
      trendColor: growth.vendorGrowthPct >= 0 ? "success" : "error",
    },
    {
      key: "active-vendors",
      label: "Active Vendors",
      value: formatNumber(summary.activeVendors),
      meta: `${formatNumber(summary.pendingVendors)} pending · ${formatNumber(
        summary.rejectedVendors
      )} rejected`,
      icon: (
        <UserCircleIcon className="text-gray-800 size-6 dark:text-white/90" />
      ),
      trendValue: approvalRate,
      trendLabel: "approval rate",
      trendColor: approvalRate >= 60 ? "success" : "warning",
      neutral: true,
    },
    {
      key: "subscriptions",
      label: "Total Subscriptions",
      value: formatNumber(summary.totalSubscriptions),
      meta: `${formatNumber(summary.activeSubscriptions)} active · ${formatNumber(
        summary.inactiveSubscriptions
      )} inactive`,
      icon: <BoxIconLine className="text-gray-800 size-6 dark:text-white/90" />,
      trendValue: growth.subscriptionGrowthPct,
      trendLabel: "activations vs last month",
      trendColor: growth.subscriptionGrowthPct >= 0 ? "success" : "error",
    },
    {
      key: "revenue",
      label: "Revenue This Month",
      value: formatCurrency(summary.currentMonthRevenue),
      meta: `${formatCurrency(summary.todayRevenue)} today · ${formatCurrency(
        summary.totalRevenue
      )} total`,
      icon: (
        <DollarLineIcon className="text-gray-800 size-6 dark:text-white/90" />
      ),
      trendValue: growth.revenueGrowthPct,
      trendLabel: "vs previous month",
      trendColor: growth.revenueGrowthPct >= 0 ? "success" : "error",
    },
  ] as const;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6">
      {cards.map((card) => (
        <div
          key={card.key}
          className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6"
        >
          <div className="flex items-center justify-center w-12 h-12 bg-gray-100 rounded-xl dark:bg-gray-800">
            {card.icon}
          </div>

          <div className="mt-5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {card.label}
              </span>
              <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">
                {card.value}
              </h4>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {card.meta}
              </p>
            </div>

            <Badge color={card.trendColor}>
              {!card.neutral ? (
                card.trendValue >= 0 ? (
                  <ArrowUpIcon />
                ) : (
                  <ArrowDownIcon />
                )
              ) : null}
              {formatTrend(card.trendValue)}
            </Badge>
          </div>

          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            {card.trendLabel}
          </p>
        </div>
      ))}
    </div>
  );
}
