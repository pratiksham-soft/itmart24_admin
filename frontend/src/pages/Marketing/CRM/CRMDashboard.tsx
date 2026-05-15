import { useEffect, useState } from "react";
import PageMeta from "../../../components/common/PageMeta";
import Button from "../../../components/ui/button/Button";
import CRMPageHeader from "./components/CRMPageHeader";
import CRMStatCard from "./components/CRMStatCard";
import ActivityTimeline from "./components/ActivityTimeline";
import { getCRMDashboard } from "./services/crmApi";
import type { CRMDashboardData } from "./types/crm.types";
import { formatCurrency, formatDateTime, readErrorMessage } from "./utils/crmHelpers";
import { Link } from "react-router";

const ChartBlock = ({
  title,
  items,
  valueKey,
}: {
  title: string;
  items: Array<Record<string, unknown>>;
  valueKey: string;
}) => (
  <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{title}</h3>
    <div className="mt-5 space-y-4">
      {items.length === 0 ? (
        <div className="text-sm text-gray-500 dark:text-gray-400">No data yet.</div>
      ) : (
        items.map((item, index) => {
          const value = Number(item[valueKey] ?? 0);
          const maxValue = Math.max(...items.map((entry) => Number(entry[valueKey] ?? 0)), 1);
          return (
            <div key={`${item.label}-${index}`} className="space-y-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-300">{String(item.label ?? "")}</span>
                <span className="text-gray-500 dark:text-gray-400">{value}</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800">
                <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(value / maxValue) * 100}%` }} />
              </div>
            </div>
          );
        })
      )}
    </div>
  </div>
);

export default function CRMDashboard() {
  const [dashboard, setDashboard] = useState<CRMDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getCRMDashboard();
        if (isMounted) {
          setDashboard(response);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(readErrorMessage(loadError, "Failed to load CRM dashboard."));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      isMounted = false;
    };
  }, []);

  const summary = dashboard?.summary;

  return (
    <>
      <PageMeta title="CRM Dashboard | ITMart24 Admin" description="CRM overview for leads, companies, deals, tasks, campaigns, and follow-ups." />
      <CRMPageHeader
        title="CRM Dashboard"
        description="Monitor the full ITMart24 CRM funnel across vendor leads, customers, deal flow, campaigns, and task execution."
      />

      {error ? <div className="mb-4 rounded-2xl bg-error-50 px-4 py-3 text-sm text-error-600">{error}</div> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <CRMStatCard label="Total Leads" value={loading ? "..." : summary?.totalLeads ?? 0} />
        <CRMStatCard label="New Leads" value={loading ? "..." : summary?.newLeads ?? 0} tone="info" />
        <CRMStatCard label="Qualified Leads" value={loading ? "..." : summary?.qualifiedLeads ?? 0} tone="success" />
        <CRMStatCard label="Active Deals" value={loading ? "..." : summary?.activeDeals ?? 0} tone="warning" />
        <CRMStatCard label="Won Deals" value={loading ? "..." : summary?.wonDeals ?? 0} tone="success" />
        <CRMStatCard label="Lost Deals" value={loading ? "..." : summary?.lostDeals ?? 0} tone="error" />
        <CRMStatCard label="Pending Follow-ups" value={loading ? "..." : summary?.pendingFollowUps ?? 0} tone="info" />
        <CRMStatCard label="Overdue Tasks" value={loading ? "..." : summary?.overdueTasks ?? 0} tone="error" />
        <CRMStatCard label="Campaigns Sent" value={loading ? "..." : summary?.emailCampaignsSent ?? 0} />
        <CRMStatCard label="Conversion Rate" value={loading ? "..." : `${summary?.conversionRate ?? 0}%`} tone="success" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <ChartBlock
          title="Leads by Source"
          items={dashboard?.leadsBySource ?? []}
          valueKey="value"
        />
        <ChartBlock
          title="Deals by Stage"
          items={dashboard?.dealsByStage ?? []}
          valueKey="value"
        />
        <ChartBlock
          title="Monthly Lead Growth"
          items={(dashboard?.monthlyLeadGrowth ?? []).map((item) => ({ label: item.label, value: item.count }))}
          valueKey="value"
        />
        <ChartBlock
          title="Revenue Forecast"
          items={(dashboard?.revenueForecast ?? []).map((item) => ({ label: item.label, value: item.amount }))}
          valueKey="value"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Recent Activity</h3>
              <Link to="/marketing/crm/activities" className="text-sm font-medium text-brand-500">
                View all
              </Link>
            </div>
            <div className="mt-5">
              <ActivityTimeline activities={dashboard?.recentActivity ?? []} />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Today&apos;s Follow-ups</h3>
            <div className="mt-4 space-y-3">
              {(dashboard?.todaysFollowUps ?? []).length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">No follow-ups due today.</div>
              ) : (
                (dashboard?.todaysFollowUps ?? []).map((task) => (
                  <div key={task.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
                    <div className="text-sm font-semibold text-gray-800 dark:text-white/90">{task.title}</div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{task.taskType}</div>
                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{formatDateTime(task.dueAt)}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Task Completion Overview</h3>
            <div className="mt-5 grid grid-cols-2 gap-4">
              <CRMStatCard label="Completed" value={dashboard?.taskCompletionOverview.completed ?? 0} tone="success" />
              <CRMStatCard label="Pending" value={dashboard?.taskCompletionOverview.pending ?? 0} tone="warning" />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Quick Actions</h3>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Link to="/marketing/crm/leads"><Button type="button" className="w-full">Add Lead</Button></Link>
              <Link to="/marketing/crm/contacts"><Button type="button" className="w-full">Add Contact</Button></Link>
              <Link to="/marketing/crm/companies"><Button type="button" className="w-full">Add Company</Button></Link>
              <Link to="/marketing/crm/deals"><Button type="button" className="w-full">Add Deal</Button></Link>
              <Link to="/marketing/crm/tasks"><Button type="button" className="w-full">Create Task</Button></Link>
              <Link to="/marketing/crm/email-campaigns"><Button type="button" className="w-full">Create Campaign</Button></Link>
            </div>
            <div className="mt-4 rounded-2xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              Pipeline forecast: {formatCurrency((dashboard?.dealsByStage ?? []).reduce((sum, item) => sum + Number(item.amount ?? 0), 0))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
