import { useEffect, useState } from "react";
import PageMeta from "../../../components/common/PageMeta";
import CRMPageHeader from "./components/CRMPageHeader";
import CRMStatCard from "./components/CRMStatCard";
import { getCRMReports } from "./services/crmApi";
import type { CRMReportsData } from "./types/crm.types";
import { formatCurrency, readErrorMessage } from "./utils/crmHelpers";

const ReportChart = ({ title, items }: { title: string; items: Array<{ label: string; value: number }> }) => (
  <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{title}</h3>
    <div className="mt-5 space-y-4">
      {items.length === 0 ? (
        <div className="text-sm text-gray-500 dark:text-gray-400">No data for this report yet.</div>
      ) : (
        items.map((item) => {
          const maxValue = Math.max(...items.map((entry) => entry.value), 1);
          return (
            <div key={item.label}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-300">{item.label}</span>
                <span className="text-gray-500 dark:text-gray-400">{item.value}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-gray-100 dark:bg-gray-800">
                <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(item.value / maxValue) * 100}%` }} />
              </div>
            </div>
          );
        })
      )}
    </div>
  </div>
);

export default function ReportsPage() {
  const [reports, setReports] = useState<CRMReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState("30");

  useEffect(() => {
    let isMounted = true;
    const loadReports = async () => {
      try {
        setLoading(true);
        setError(null);
        const dateFrom = new Date(Date.now() - Number(dateRange) * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        const response = await getCRMReports({ dateFrom });
        if (isMounted) {
          setReports(response);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(readErrorMessage(loadError, "Failed to load reports."));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadReports();
    return () => {
      isMounted = false;
    };
  }, [dateRange]);

  return (
    <>
      <PageMeta title="CRM Reports | ITMart24 Admin" description="Review CRM funnel, source, conversion, productivity, owner, and campaign reports." />
      <CRMPageHeader
        title="Reports"
        description="Measure lead flow, pipeline quality, task execution, conversion rates, and campaign outcomes across the CRM."
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {[
          ["7", "Last 7 days"],
          ["30", "Last 30 days"],
          ["90", "Last 90 days"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setDateRange(value)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              dateRange === value
                ? "bg-brand-500 text-white"
                : "bg-white text-gray-600 ring-1 ring-gray-300 dark:bg-white/[0.03] dark:text-gray-300 dark:ring-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <div className="mb-4 rounded-2xl bg-error-50 px-4 py-3 text-sm text-error-600">{error}</div> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <CRMStatCard label="Total Leads" value={loading ? "..." : reports?.conversion.totalLeads ?? 0} />
        <CRMStatCard label="Converted Leads" value={loading ? "..." : reports?.conversion.convertedLeads ?? 0} tone="success" />
        <CRMStatCard label="Conversion Rate" value={loading ? "..." : `${reports?.conversion.rate ?? 0}%`} tone="info" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <ReportChart title="Lead Funnel" items={reports?.leadFunnel ?? []} />
        <ReportChart title="Lead Source Report" items={reports?.leadSource ?? []} />
        <ReportChart title="Task Productivity" items={reports?.taskProductivity ?? []} />
        <ReportChart
          title="Sales Pipeline Value"
          items={(reports?.salesPipeline ?? []).map((item) => ({
            label: `${item.label} (${formatCurrency(item.amount)})`,
            value: item.value,
          }))}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Owner Performance</h3>
          <div className="mt-5 space-y-4">
            {(reports?.ownerPerformance ?? []).map((entry) => (
              <div key={entry.owner} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
                <div className="font-semibold text-gray-800 dark:text-white/90">{entry.owner}</div>
                <div className="mt-2 grid grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-300">
                  <div>Leads: {entry.leadsAssigned}</div>
                  <div>Won: {entry.dealsWon}</div>
                  <div>Completed: {entry.followupsCompleted}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Campaign Report</h3>
          <div className="mt-5 space-y-4">
            {(reports?.campaignReport ?? []).map((entry, index) => (
              <div key={`${String(entry.name ?? "campaign")}-${index}`} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
                <div className="font-semibold text-gray-800 dark:text-white/90">{String(entry.name ?? "Campaign")}</div>
                <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  {String(entry.status ?? "Unknown")} · Sent {Number(entry.sentCount ?? 0)} · Failed {Number(entry.failedCount ?? 0)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
