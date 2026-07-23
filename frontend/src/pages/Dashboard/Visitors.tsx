import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import ReactApexChart from "react-apexcharts";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
import { Modal } from "../../components/ui/modal";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "../../components/ui/table";
import {
  exportVisitorsCsv,
  fetchLiveVisitors,
  fetchVisitorDetails,
  fetchVisitorLocations,
  fetchVisitorPages,
  fetchVisitorSessionDetails,
  fetchVisitors,
  fetchVisitorSummary,
} from "../../services/visitorAnalytics.service";
import type {
  LiveVisitor,
  VisitorDetails,
  VisitorFilters,
  VisitorListItem,
  VisitorLocationItem,
  VisitorPageItem,
  VisitorSessionDetails,
  VisitorSummaryResponse,
} from "../../types/visitors";

type VisitorsTab = "overview" | "live" | "today" | "last7" | "all" | "locations" | "pages";

const TABS: Array<{ key: VisitorsTab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "live", label: "Live" },
  { key: "today", label: "Today" },
  { key: "last7", label: "Last 7 Days" },
  { key: "all", label: "All Visitors" },
  { key: "locations", label: "Locations" },
  { key: "pages", label: "Pages" },
];

const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
};

function useDateRange(tab: VisitorsTab) {
  const today = new Date().toISOString().slice(0, 10);
  const last7 = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  if (tab === "today") {
    return { startDate: today, endDate: today };
  }

  if (tab === "last7" || tab === "overview" || tab === "live" || tab === "locations" || tab === "pages") {
    return { startDate: last7, endDate: today };
  }

  return { startDate: "", endDate: "" };
}

export default function VisitorsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [summary, setSummary] = useState<VisitorSummaryResponse | null>(null);
  const [liveVisitors, setLiveVisitors] = useState<LiveVisitor[]>([]);
  const [visitorRows, setVisitorRows] = useState<VisitorListItem[]>([]);
  const [locationRows, setLocationRows] = useState<VisitorLocationItem[]>([]);
  const [pageRows, setPageRows] = useState<VisitorPageItem[]>([]);
  const [selectedVisitor, setSelectedVisitor] = useState<VisitorDetails | null>(null);
  const [selectedSession, setSelectedSession] = useState<VisitorSessionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [totalVisitors, setTotalVisitors] = useState(0);
  const [isLiveAutoRefreshPaused, setIsLiveAutoRefreshPaused] = useState(false);
  const currentTab = (searchParams.get("tab") as VisitorsTab) || "overview";
  const filters = useMemo<VisitorFilters>(() => {
    const baseRange = useDateRange(currentTab);
    return {
      page: Number(searchParams.get("page") || "1"),
      limit: 25,
      portal: searchParams.get("portal") || "all",
      visitorType: searchParams.get("visitorType") || "all",
      country: searchParams.get("country") || "",
      city: searchParams.get("city") || "",
      device: searchParams.get("device") || "",
      browser: searchParams.get("browser") || "",
      search: searchParams.get("search") || "",
      pagePath: searchParams.get("pagePath") || "",
      referrer: searchParams.get("referrer") || "",
      utmSource: searchParams.get("utmSource") || "",
      utmCampaign: searchParams.get("utmCampaign") || "",
      botStatus: searchParams.get("botStatus") || "exclude",
      startDate: searchParams.get("startDate") || baseRange.startDate,
      endDate: searchParams.get("endDate") || baseRange.endDate,
    };
  }, [currentTab, searchParams]);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    void fetchVisitorSummary()
      .then((data) => {
        if (isMounted) setSummary(data);
      })
      .catch((loadError) => {
        if (isMounted) setError(loadError instanceof Error ? loadError.message : "Unable to load visitors summary.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadTabData = async () => {
      setTableLoading(true);
      setTableError(null);
      try {
        if (currentTab === "live") {
          const data = await fetchLiveVisitors();
          if (isMounted) setLiveVisitors(data);
          return;
        }

        if (currentTab === "locations") {
          const data = await fetchVisitorLocations(filters);
          if (isMounted) setLocationRows(data);
          return;
        }

        if (currentTab === "pages") {
          const data = await fetchVisitorPages(filters);
          if (isMounted) setPageRows(data);
          return;
        }

        const data = await fetchVisitors(filters);
        if (isMounted) {
          setVisitorRows(data.items);
          setTotalVisitors(data.total);
        }
      } catch (loadError) {
        if (isMounted) {
          setTableError(loadError instanceof Error ? loadError.message : "Unable to load visitors.");
        }
      } finally {
        if (isMounted) {
          setTableLoading(false);
        }
      }
    };

    void loadTabData();
    return () => {
      isMounted = false;
    };
  }, [currentTab, filters]);

  useEffect(() => {
    if (currentTab !== "live" || isLiveAutoRefreshPaused) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void fetchLiveVisitors()
        .then((data) => {
          setLiveVisitors(data);
        })
        .catch(() => undefined);
    }, 20_000);

    return () => window.clearInterval(intervalId);
  }, [currentTab, isLiveAutoRefreshPaused]);

  const visitorsSeries = useMemo(
    () => [
      {
        name: "Visitors",
        data: summary?.charts.visitorsOverTime.map((item) => item.visitors) ?? [],
      },
      {
        name: "Page Views",
        data: summary?.charts.pageViewsOverTime.map((item) => item.pageViews) ?? [],
      },
    ],
    [summary]
  );

  const portalSplitSeries = useMemo(
    () => summary?.charts.portalSplit.map((item) => item.sessions) ?? [],
    [summary]
  );

  const deviceSeries = useMemo(
    () => summary?.charts.deviceDistribution.map((item) => item.sessions) ?? [],
    [summary]
  );

  const newVsReturningSeries = useMemo(
    () => [summary?.summary.newVisitors ?? 0, summary?.summary.returningVisitors ?? 0],
    [summary]
  );

  const topCountriesSeries = useMemo(
    () => [
      {
        name: "Visitors",
        data: summary?.charts.topCountries.map((item) => item.visitors) ?? [],
      },
    ],
    [summary]
  );

  const topCitiesSeries = useMemo(
    () => [
      {
        name: "Visitors",
        data: summary?.charts.topCities.map((item) => item.visitors) ?? [],
      },
    ],
    [summary]
  );

  const topPagesSeries = useMemo(
    () => [
      {
        name: "Page Views",
        data: summary?.charts.topPages.map((item) => item.pageViews) ?? [],
      },
    ],
    [summary]
  );

  const topReferrersSeries = useMemo(
    () => [
      {
        name: "Sessions",
        data: summary?.charts.topReferrers.map((item) => item.sessions) ?? [],
      },
    ],
    [summary]
  );

  const utmCampaignSeries = useMemo(
    () => [
      {
        name: "Sessions",
        data: summary?.charts.utmCampaigns.map((item) => item.sessions) ?? [],
      },
    ],
    [summary]
  );

  const openVisitorDetails = async (visitorId: string) => {
    try {
      setDetailLoading(true);
      setDetailError(null);
      const data = await fetchVisitorDetails(visitorId);
      setSelectedVisitor(data);
    } catch (loadError) {
      setDetailError(loadError instanceof Error ? loadError.message : "Unable to load visitor details.");
    } finally {
      setDetailLoading(false);
    }
  };

  const openSessionDetails = async (sessionId: string) => {
    try {
      setDetailLoading(true);
      setDetailError(null);
      const data = await fetchVisitorSessionDetails(sessionId);
      setSelectedSession(data);
    } catch (loadError) {
      setDetailError(loadError instanceof Error ? loadError.message : "Unable to load session details.");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    next.set("page", "1");
    setSearchParams(next);
  };

  const handleTabChange = (tab: VisitorsTab) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    next.set("page", "1");
    setSearchParams(next);
  };

  const handleExport = async () => {
    const csv = await exportVisitorsCsv(filters);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `visitors-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePageChange = (nextPage: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(Math.max(1, nextPage)));
    setSearchParams(next);
  };

  const totalPages = Math.max(1, Math.ceil(totalVisitors / Math.max(1, filters.limit ?? 25)));
  const summaryCards = [
    ["Live visitors now", summary?.summary.liveVisitorsNow ?? 0, "count"],
    ["Unique visitors today", summary?.summary.uniqueVisitorsToday ?? 0, "count"],
    ["Sessions today", summary?.summary.sessionsToday ?? 0, "count"],
    ["Page views today", summary?.summary.pageViewsToday ?? 0, "count"],
    ["Unique visitors in last 7 days", summary?.summary.uniqueVisitorsLast7Days ?? 0, "count"],
    ["New visitors", summary?.summary.newVisitors ?? 0, "count"],
    ["Returning visitors", summary?.summary.returningVisitors ?? 0, "count"],
    ["Avg session duration", summary?.summary.averageSessionDurationSeconds ?? 0, "duration"],
    ["Bounce rate", summary?.summary.bounceRate ?? 0, "percent"],
  ] as const;

  return (
    <>
      <PageMeta title="Visitors Analytics | ITMart24 Admin" description="Visitor analytics across the User Portal and Vendor Portal." />
      <div className="mb-6 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-800 dark:text-white/90">
            Visitors Analytics
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Cross-portal traffic visibility for the User Portal and Vendor Portal.
          </p>
        </div>
        {summary ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Timezone {summary.timezone} · Updated {formatDateTime(summary.generatedAt)}
          </p>
        ) : null}
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => handleTabChange(tab.key)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              currentTab === tab.key
                ? "bg-brand-500 text-white"
                : "border border-gray-200 bg-white text-gray-600 hover:border-brand-200 hover:text-brand-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="mb-6 rounded-2xl border border-error-200 bg-error-50 px-5 py-4 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300">
          {error}
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {summaryCards.map(([label, value, kind]) => (
          <ComponentCard key={label} title={String(label)}>
            <p className="text-3xl font-semibold text-gray-900 dark:text-white/90">
              {loading
                ? "..."
                : kind === "duration"
                  ? formatDuration(Number(value))
                  : kind === "percent"
                    ? formatPercent(Number(value))
                    : formatNumber(Number(value))}
            </p>
          </ComponentCard>
        ))}
      </div>

      {summary ? (
        <div className="mb-6 grid grid-cols-12 gap-4 md:gap-6">
          <div className="col-span-12 xl:col-span-8">
            <ComponentCard title="Visitors And Page Views">
              <ReactApexChart
                type="line"
                height={320}
                options={{
                  chart: { toolbar: { show: false } },
                  xaxis: { categories: summary.charts.visitorsOverTime.map((item) => item.day) },
                  stroke: { curve: "smooth", width: 3 },
                  legend: { position: "top" },
                }}
                series={visitorsSeries}
              />
            </ComponentCard>
          </div>
          <div className="col-span-12 xl:col-span-4">
            <ComponentCard title="Portal Split">
              <ReactApexChart
                type="donut"
                height={320}
                options={{
                  labels: summary.charts.portalSplit.map((item) => item.portal.replace(/_/g, " ")),
                  legend: { position: "bottom" },
                }}
                series={portalSplitSeries}
              />
            </ComponentCard>
          </div>
          <div className="col-span-12 xl:col-span-4">
            <ComponentCard title="Device Distribution">
              <ReactApexChart
                type="pie"
                height={300}
                options={{
                  labels: summary.charts.deviceDistribution.map((item) => item.device),
                  legend: { position: "bottom" },
                }}
                series={deviceSeries}
              />
            </ComponentCard>
          </div>
          <div className="col-span-12 xl:col-span-8">
            <ComponentCard title="Top Countries">
              <ReactApexChart
                type="bar"
                height={300}
                options={{
                  chart: { toolbar: { show: false } },
                  xaxis: { categories: summary.charts.topCountries.map((item) => item.country) },
                }}
                series={topCountriesSeries}
              />
            </ComponentCard>
          </div>
          <div className="col-span-12 xl:col-span-4">
            <ComponentCard title="New Vs Returning">
              <ReactApexChart
                type="donut"
                height={300}
                options={{
                  labels: ["New", "Returning"],
                  legend: { position: "bottom" },
                }}
                series={newVsReturningSeries}
              />
            </ComponentCard>
          </div>
          <div className="col-span-12 xl:col-span-8">
            <ComponentCard title="Top Cities">
              <ReactApexChart
                type="bar"
                height={300}
                options={{
                  chart: { toolbar: { show: false } },
                  xaxis: { categories: summary.charts.topCities.map((item) => item.city) },
                }}
                series={topCitiesSeries}
              />
            </ComponentCard>
          </div>
          <div className="col-span-12 xl:col-span-6">
            <ComponentCard title="Top Pages">
              <ReactApexChart
                type="bar"
                height={320}
                options={{
                  chart: { toolbar: { show: false } },
                  xaxis: { categories: summary.charts.topPages.map((item) => item.path) },
                }}
                series={topPagesSeries}
              />
            </ComponentCard>
          </div>
          <div className="col-span-12 xl:col-span-6">
            <ComponentCard title="Top Referrers">
              <ReactApexChart
                type="bar"
                height={320}
                options={{
                  chart: { toolbar: { show: false } },
                  xaxis: { categories: summary.charts.topReferrers.map((item) => item.referrer) },
                }}
                series={topReferrersSeries}
              />
            </ComponentCard>
          </div>
          <div className="col-span-12">
            <ComponentCard title="UTM Campaign Performance">
              <ReactApexChart
                type="bar"
                height={320}
                options={{
                  chart: { toolbar: { show: false } },
                  xaxis: { categories: summary.charts.utmCampaigns.map((item) => item.campaign) },
                }}
                series={utmCampaignSeries}
              />
            </ComponentCard>
          </div>
        </div>
      ) : null}

      <ComponentCard title="Filters">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input
            value={filters.search ?? ""}
            onChange={(event) => handleFilterChange("search", event.target.value)}
            placeholder="Search visitor, account, location"
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-800 dark:bg-gray-900"
          />
          <select value={filters.portal ?? "all"} onChange={(event) => handleFilterChange("portal", event.target.value)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-800 dark:bg-gray-900">
            <option value="all">All portals</option>
            <option value="user_portal">User Portal</option>
            <option value="vendor_portal">Vendor Portal</option>
          </select>
          <select value={filters.visitorType ?? "all"} onChange={(event) => handleFilterChange("visitorType", event.target.value)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-800 dark:bg-gray-900">
            <option value="all">All visitor types</option>
            <option value="anonymous">Anonymous</option>
            <option value="user">User</option>
            <option value="vendor">Vendor</option>
          </select>
          <input value={filters.country ?? ""} onChange={(event) => handleFilterChange("country", event.target.value)} placeholder="Country" className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-800 dark:bg-gray-900" />
          <input value={filters.city ?? ""} onChange={(event) => handleFilterChange("city", event.target.value)} placeholder="City" className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-800 dark:bg-gray-900" />
          <input value={filters.device ?? ""} onChange={(event) => handleFilterChange("device", event.target.value)} placeholder="Device" className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-800 dark:bg-gray-900" />
          <input value={filters.browser ?? ""} onChange={(event) => handleFilterChange("browser", event.target.value)} placeholder="Browser" className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-800 dark:bg-gray-900" />
          <input value={filters.pagePath ?? ""} onChange={(event) => handleFilterChange("pagePath", event.target.value)} placeholder="Page path" className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-800 dark:bg-gray-900" />
          <input value={filters.referrer ?? ""} onChange={(event) => handleFilterChange("referrer", event.target.value)} placeholder="Referrer" className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-800 dark:bg-gray-900" />
          <input value={filters.utmSource ?? ""} onChange={(event) => handleFilterChange("utmSource", event.target.value)} placeholder="UTM source" className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-800 dark:bg-gray-900" />
          <input value={filters.utmCampaign ?? ""} onChange={(event) => handleFilterChange("utmCampaign", event.target.value)} placeholder="UTM campaign" className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-800 dark:bg-gray-900" />
          <select value={filters.botStatus ?? "exclude"} onChange={(event) => handleFilterChange("botStatus", event.target.value)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-800 dark:bg-gray-900">
            <option value="exclude">Exclude bots</option>
            <option value="bots_only">Bots only</option>
          </select>
          <input type="date" value={filters.startDate ?? ""} onChange={(event) => handleFilterChange("startDate", event.target.value)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-800 dark:bg-gray-900" />
          <input type="date" value={filters.endDate ?? ""} onChange={(event) => handleFilterChange("endDate", event.target.value)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-800 dark:bg-gray-900" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setSearchParams({ tab: currentTab })} className="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 dark:border-gray-800 dark:text-gray-300">
            Clear filters
          </button>
          <button type="button" onClick={() => void handleExport()} className="rounded-full bg-brand-500 px-4 py-2 text-sm font-medium text-white">
            Export CSV
          </button>
          {currentTab === "live" ? (
            <button type="button" onClick={() => setIsLiveAutoRefreshPaused((value) => !value)} className="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 dark:border-gray-800 dark:text-gray-300">
              {isLiveAutoRefreshPaused ? "Resume live refresh" : "Pause live refresh"}
            </button>
          ) : null}
        </div>
      </ComponentCard>

      <div className="mt-6">
        {tableError ? (
          <div className="rounded-2xl border border-error-200 bg-error-50 px-5 py-4 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300">
            {tableError}
          </div>
        ) : null}

        {currentTab === "live" ? (
          <ComponentCard title="Live Visitors">
            {tableLoading ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading live visitors...</p>
            ) : liveVisitors.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No active visitors.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-gray-100 dark:border-gray-800">
                      {["Portal", "Current page", "Location", "Visitor type", "Device", "Browser", "Source", "Started", "Last activity", "Views"].map((label) => (
                        <TableCell key={label} isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                          {label}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {liveVisitors.map((visitor) => (
                      <TableRow key={visitor.id} className="border-b border-gray-100 dark:border-gray-800">
                        <TableCell className="px-4 py-3 text-sm">{visitor.portal}</TableCell>
                        <TableCell className="px-4 py-3 text-sm">
                          <button type="button" onClick={() => void openSessionDetails(visitor.id)} className="text-left font-medium text-brand-600 hover:underline">
                            {visitor.currentPath ?? visitor.pageTitle ?? "-"}
                          </button>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm">{visitor.location}</TableCell>
                        <TableCell className="px-4 py-3 text-sm">{visitor.visitorType}</TableCell>
                        <TableCell className="px-4 py-3 text-sm">{visitor.device ?? "-"}</TableCell>
                        <TableCell className="px-4 py-3 text-sm">{visitor.browser ?? "-"}</TableCell>
                        <TableCell className="px-4 py-3 text-sm">{visitor.source ?? visitor.referrer ?? "-"}</TableCell>
                        <TableCell className="px-4 py-3 text-sm">{formatDateTime(visitor.startedAt)}</TableCell>
                        <TableCell className="px-4 py-3 text-sm">{formatDateTime(visitor.lastActivityAt)}</TableCell>
                        <TableCell className="px-4 py-3 text-sm">{formatNumber(visitor.pageViews)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </ComponentCard>
        ) : null}

        {currentTab !== "live" && currentTab !== "locations" && currentTab !== "pages" ? (
          <ComponentCard title={`${currentTab === "today" ? "Today's" : currentTab === "last7" ? "Last 7 Days" : "All"} Visitors`}>
            {tableLoading ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading visitors...</p>
            ) : visitorRows.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No visitor records match the current filters.</p>
            ) : (
              <>
                <div className="mb-3 text-sm text-gray-500 dark:text-gray-400">
                  {formatNumber(totalVisitors)} matching visitors
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-gray-100 dark:border-gray-800">
                        {["Visitor", "Portal", "First seen", "Last seen", "Location", "Sessions", "Page views", "Duration", "Latest page", "Device / Browser", "Association", "Source"].map((label) => (
                          <TableCell key={label} isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                            {label}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visitorRows.map((row) => (
                        <TableRow key={row.visitorId} className="border-b border-gray-100 dark:border-gray-800">
                          <TableCell className="px-4 py-3 text-sm">
                            <button type="button" onClick={() => void openVisitorDetails(row.visitorId)} className="text-left font-medium text-brand-600 hover:underline">
                              {row.visitorId}
                            </button>
                          </TableCell>
                          <TableCell className="px-4 py-3 text-sm">{row.portal}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{formatDateTime(row.firstSeen)}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{formatDateTime(row.lastSeen)}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{row.location}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{formatNumber(row.sessions)}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{formatNumber(row.pageViews)}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{formatDuration(row.totalDurationSeconds)}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{row.latestPage ?? "-"}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{[row.device, row.browser].filter(Boolean).join(" / ") || "-"}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{row.associatedUserId ?? row.associatedVendorId ?? "-"}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{row.acquisitionSource ?? "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 text-sm text-gray-500 dark:text-gray-400">
                  <span>
                    Page {filters.page ?? 1} of {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => handlePageChange((filters.page ?? 1) - 1)} disabled={(filters.page ?? 1) <= 1} className="rounded-full border border-gray-200 px-4 py-2 font-medium text-gray-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:text-gray-300">
                      Previous
                    </button>
                    <button type="button" onClick={() => handlePageChange((filters.page ?? 1) + 1)} disabled={(filters.page ?? 1) >= totalPages} className="rounded-full border border-gray-200 px-4 py-2 font-medium text-gray-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:text-gray-300">
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </ComponentCard>
        ) : null}

        {currentTab === "locations" ? (
          <ComponentCard title="Locations">
            {tableLoading ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading locations...</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-gray-100 dark:border-gray-800">
                      {["Country", "Region", "City", "Portal", "Visitors", "Sessions", "Page views"].map((label) => (
                        <TableCell key={label} isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                          {label}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {locationRows.map((row, index) => (
                      <TableRow key={`${row.country}-${row.region}-${row.city}-${index}`} className="border-b border-gray-100 dark:border-gray-800">
                        <TableCell className="px-4 py-3 text-sm">{row.country}</TableCell>
                        <TableCell className="px-4 py-3 text-sm">{row.region}</TableCell>
                        <TableCell className="px-4 py-3 text-sm">{row.city}</TableCell>
                        <TableCell className="px-4 py-3 text-sm">{row.portal}</TableCell>
                        <TableCell className="px-4 py-3 text-sm">{formatNumber(row.visitors)}</TableCell>
                        <TableCell className="px-4 py-3 text-sm">{formatNumber(row.sessions)}</TableCell>
                        <TableCell className="px-4 py-3 text-sm">{formatNumber(row.pageViews)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </ComponentCard>
        ) : null}

        {currentTab === "pages" ? (
          <ComponentCard title="Pages">
            {tableLoading ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading pages...</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-gray-100 dark:border-gray-800">
                      {["Path", "Portal", "Visitors", "Sessions", "Page views", "Avg time", "Entries", "Exits", "Exit rate", "Last viewed"].map((label) => (
                        <TableCell key={label} isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                          {label}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((row) => (
                      <TableRow key={`${row.portal}-${row.path}`} className="border-b border-gray-100 dark:border-gray-800">
                        <TableCell className="px-4 py-3 text-sm">{row.path}</TableCell>
                        <TableCell className="px-4 py-3 text-sm">{row.portal}</TableCell>
                        <TableCell className="px-4 py-3 text-sm">{formatNumber(row.uniqueVisitors)}</TableCell>
                        <TableCell className="px-4 py-3 text-sm">{formatNumber(row.sessions)}</TableCell>
                        <TableCell className="px-4 py-3 text-sm">{formatNumber(row.pageViews)}</TableCell>
                        <TableCell className="px-4 py-3 text-sm">{formatDuration(row.averageTimeOnPageSeconds)}</TableCell>
                        <TableCell className="px-4 py-3 text-sm">{formatNumber(row.entries)}</TableCell>
                        <TableCell className="px-4 py-3 text-sm">{formatNumber(row.exits)}</TableCell>
                        <TableCell className="px-4 py-3 text-sm">{formatPercent(row.exitRate)}</TableCell>
                        <TableCell className="px-4 py-3 text-sm">{formatDateTime(row.lastViewed)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </ComponentCard>
        ) : null}
      </div>

      <Modal isOpen={Boolean(selectedVisitor) || detailLoading || Boolean(detailError)} onClose={() => { setSelectedVisitor(null); setDetailError(null); }} className="max-w-4xl p-6 lg:p-8">
        <div className="space-y-6">
          <div className="border-b border-gray-200 pb-4 dark:border-gray-800">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white/90">Visitor details</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Journey, acquisition, device, and session activity for the selected visitor.</p>
          </div>
          {detailLoading ? <p className="text-sm text-gray-500 dark:text-gray-400">Loading visitor details...</p> : null}
          {detailError ? <p className="text-sm text-error-600 dark:text-error-300">{detailError}</p> : null}
          {selectedVisitor ? (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <DetailCard label="Visitor ID" value={selectedVisitor.visitor.visitorId} />
                <DetailCard label="First activity" value={formatDateTime(selectedVisitor.visitor.firstSeenAt)} />
                <DetailCard label="Last activity" value={formatDateTime(selectedVisitor.visitor.lastSeenAt)} />
                <DetailCard label="Portal" value={selectedVisitor.visitor.portal} />
                <DetailCard label="Visitor type" value={selectedVisitor.visitor.visitorType} />
                <DetailCard label="Location" value={selectedVisitor.visitor.location} />
                <DetailCard label="Device" value={selectedVisitor.visitor.device ?? "-"} />
                <DetailCard label="Browser" value={selectedVisitor.visitor.browser ?? "-"} />
                <DetailCard label="Associated account" value={selectedVisitor.visitor.associatedUserId ?? selectedVisitor.visitor.associatedVendorId ?? "-"} />
              </div>
              <ComponentCard title="Sessions">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-gray-100 dark:border-gray-800">
                        {["Session", "Portal", "Started", "Last activity", "Landing", "Exit", "Views", "Duration"].map((label) => (
                          <TableCell key={label} isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                            {label}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedVisitor.sessions.map((session) => (
                        <TableRow key={session.sessionId} className="border-b border-gray-100 dark:border-gray-800">
                          <TableCell className="px-4 py-3 text-sm">{session.sessionId}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{session.portal}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{formatDateTime(session.startedAt)}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{formatDateTime(session.lastActivityAt)}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{session.landingPath ?? "-"}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{session.exitPath ?? "-"}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{formatNumber(session.pageViews)}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{formatDuration(session.durationSeconds)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </ComponentCard>
              <ComponentCard title="Page journey">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-gray-100 dark:border-gray-800">
                        {["Viewed", "Page", "Title", "Exited", "Duration"].map((label) => (
                          <TableCell key={label} isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                            {label}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedVisitor.pageJourney.map((row) => (
                        <TableRow key={row.pageViewId} className="border-b border-gray-100 dark:border-gray-800">
                          <TableCell className="px-4 py-3 text-sm">{formatDateTime(row.viewedAt)}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{row.path ?? "-"}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{row.pageTitle ?? "-"}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{formatDateTime(row.exitedAt)}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{formatDuration(row.durationSeconds)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </ComponentCard>
            </>
          ) : null}
        </div>
      </Modal>

      <Modal isOpen={Boolean(selectedSession)} onClose={() => setSelectedSession(null)} className="max-w-4xl p-6 lg:p-8">
        <div className="space-y-6">
          <div className="border-b border-gray-200 pb-4 dark:border-gray-800">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white/90">Session details</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Live session context and page journey for the selected visitor session.</p>
          </div>
          {selectedSession ? (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <DetailCard label="Session ID" value={selectedSession.session.sessionId} />
                <DetailCard label="Portal" value={selectedSession.session.portal} />
                <DetailCard label="Visitor type" value={selectedSession.session.visitorType} />
                <DetailCard label="Started" value={formatDateTime(selectedSession.session.startedAt)} />
                <DetailCard label="Last activity" value={formatDateTime(selectedSession.session.lastActivityAt)} />
                <DetailCard label="Location" value={selectedSession.session.location} />
                <DetailCard label="Device" value={selectedSession.session.device ?? "-"} />
                <DetailCard label="Browser" value={selectedSession.session.browser ?? "-"} />
                <DetailCard label="Referrer" value={selectedSession.session.referrer ?? "-"} />
                <DetailCard label="Landing page" value={selectedSession.session.landingPath ?? "-"} />
                <DetailCard label="Exit page" value={selectedSession.session.exitPath ?? "-"} />
                <DetailCard label="Session duration" value={formatDuration(selectedSession.session.durationSeconds)} />
              </div>
              <ComponentCard title="Session journey">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-gray-100 dark:border-gray-800">
                        {["Viewed", "Page", "Title", "Entry", "Exit", "Duration"].map((label) => (
                          <TableCell key={label} isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                            {label}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedSession.pageJourney.map((row) => (
                        <TableRow key={row.pageViewId} className="border-b border-gray-100 dark:border-gray-800">
                          <TableCell className="px-4 py-3 text-sm">{formatDateTime(row.viewedAt)}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{row.path ?? "-"}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{row.pageTitle ?? "-"}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{row.isEntry ? "Yes" : "-"}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{row.isExit ? "Yes" : "-"}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{formatDuration(row.durationSeconds)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </ComponentCard>
            </>
          ) : null}
        </div>
      </Modal>
    </>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-sm text-gray-900 dark:text-white/90">{value}</p>
    </div>
  );
}
