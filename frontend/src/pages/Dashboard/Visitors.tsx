import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import ReactApexChart from "react-apexcharts";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
import Badge from "../../components/ui/badge/Badge";
import { Modal } from "../../components/ui/modal";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "../../components/ui/table";
import { CopyIcon, InfoIcon } from "../../icons";
import {
  exportVisitorsCsv,
  fetchB2BLeadZoneDownloadAnalytics,
  fetchLiveVisitors,
  fetchVisitorDetails,
  fetchVisitorLocations,
  fetchVisitorPages,
  fetchVisitorSessionDetails,
  fetchVisitors,
  fetchVisitorSummary,
} from "../../services/visitorAnalytics.service";
import type {
  B2BLeadZoneDownloadAnalyticsResponse,
  LiveVisitor,
  VisitorDetails,
  VisitorFilters,
  VisitorListItem,
  VisitorLocationItem,
  VisitorPageItem,
  VisitorSessionDetails,
  VisitorSummaryResponse,
} from "../../types/visitors";

type VisitorsTab = "overview" | "live" | "today" | "last7" | "all" | "locations" | "pages" | "b2bLeadZone";
type B2BDeviceMetric = "uniqueVisitors" | "downloadEvents" | "linkSaveActions" | "windowsDownloads";
type B2BDownloadMetric = "downloadEvents" | "uniqueDownloaders";
type B2BLocationMetric = "uniqueVisitors" | "mobileVisitors" | "linkRequests" | "windowsDownloads" | "appFirstOpens" | "payments";
type B2BSourceMetric = "uniqueVisitors" | "mobileVisitors" | "linkSaveConversions" | "windowsDownloads" | "appFirstOpens" | "firstExtractions" | "checkoutStarts" | "payments";

const TABS: Array<{ key: VisitorsTab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "live", label: "Live" },
  { key: "today", label: "Today" },
  { key: "last7", label: "Last 7 Days" },
  { key: "all", label: "All Visitors" },
  { key: "locations", label: "Locations" },
  { key: "pages", label: "Pages" },
  { key: "b2bLeadZone", label: "B2B Lead Zone" },
];

const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);

const formatPercent = (value: number) => `${value.toFixed(1)}%`;
const formatMetricValue = (value: number | null | undefined, kind: "count" | "percent" | "duration" = "count") => {
  if (value == null) return "Not yet available";
  if (kind === "percent") return formatPercent(value);
  if (kind === "duration") return formatDuration(value);
  return formatNumber(value);
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  const formatSecondsPart = (value: number) => value.toFixed(2).replace(/\.00$/, "");
  if (seconds < 60) return `${formatSecondsPart(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${formatSecondsPart(remainingSeconds)}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
};

const filterControlClassName =
  "rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500";
const filterLabelClassName = "mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400";

const dataCellClassName = "px-4 py-3 text-sm text-gray-700 dark:text-gray-200";
const headerCellClassName =
  "px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400";
const sectionTitleClassName = "text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400";
const b2bCardToneClassNames: Record<string, string> = {
  blue: "border-blue-200/70 dark:border-blue-500/20",
  purple: "border-violet-200/70 dark:border-violet-500/20",
  green: "border-emerald-200/70 dark:border-emerald-500/20",
  amber: "border-amber-200/70 dark:border-amber-500/20",
  red: "border-error-200/70 dark:border-error-500/20",
};

const defaultB2BTimeSeriesKeys = ["windowsDownloads", "mobileExeDownloads", "linkSaveActions"] as const;
const b2bTimeSeriesOptions = [
  { key: "windowsDownloads", label: "Windows downloads" },
  { key: "mobileExeDownloads", label: "Mobile .exe downloads" },
  { key: "linkSaveActions", label: "Link-save actions" },
  { key: "allDownloads", label: "All installer downloads" },
  { key: "uniqueDownloaders", label: "Unique downloaders" },
  { key: "emailLinkRequests", label: "Email link requests" },
  { key: "successfulLinkShares", label: "Successful link shares" },
  { key: "downloadLinkCopies", label: "Download-link copies" },
  { key: "appFirstOpens", label: "App first opens" },
  { key: "firstExtractions", label: "First extractions" },
  { key: "payments", label: "Payments" },
] as const;
const b2bLocationMetricOptions: Array<{ value: B2BLocationMetric; label: string }> = [
  { value: "uniqueVisitors", label: "Unique visitors" },
  { value: "mobileVisitors", label: "Mobile visitors" },
  { value: "linkRequests", label: "Link requests" },
  { value: "windowsDownloads", label: "Windows downloads" },
  { value: "appFirstOpens", label: "App first opens" },
  { value: "payments", label: "Payments" },
];
const b2bSourceMetricOptions: Array<{ value: B2BSourceMetric; label: string }> = [
  { value: "uniqueVisitors", label: "Unique visitors" },
  { value: "mobileVisitors", label: "Mobile visitors" },
  { value: "linkSaveConversions", label: "Saved links" },
  { value: "windowsDownloads", label: "Windows downloads" },
  { value: "appFirstOpens", label: "App first opens" },
  { value: "firstExtractions", label: "First extractions" },
  { value: "checkoutStarts", label: "Checkout starts" },
  { value: "payments", label: "Payments" },
];
const ANALYTICS_REFRESH_INTERVAL_MS = 20_000;

function shortId(value: string | null | undefined) {
  if (!value) return "-";
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function getDateRangeDefaults(tab: VisitorsTab) {
  const today = new Date().toISOString().slice(0, 10);
  const last7 = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const last30 = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  if (tab === "today") {
    return { startDate: today, endDate: today };
  }

  if (tab === "last7" || tab === "overview" || tab === "live" || tab === "locations" || tab === "pages") {
    return { startDate: last7, endDate: today };
  }

  if (tab === "b2bLeadZone") {
    return { startDate: last30, endDate: today };
  }

  return { startDate: "", endDate: "" };
}

export default function VisitorsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [summary, setSummary] = useState<VisitorSummaryResponse | null>(null);
  const [b2bDownloadAnalytics, setB2BDownloadAnalytics] = useState<B2BLeadZoneDownloadAnalyticsResponse | null>(null);
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
  const [b2bFiltersExpanded, setB2BFiltersExpanded] = useState(false);
  const [b2bDeviceMetric, setB2BDeviceMetric] = useState<B2BDeviceMetric>("uniqueVisitors");
  const [b2bDownloadMetric, setB2BDownloadMetric] = useState<B2BDownloadMetric>("downloadEvents");
  const [b2bLocationMetric, setB2BLocationMetric] = useState<B2BLocationMetric>("uniqueVisitors");
  const [b2bSourceMetric, setB2BSourceMetric] = useState<B2BSourceMetric>("windowsDownloads");
  const [b2bSelectedSeries, setB2BSelectedSeries] = useState<string[]>([...defaultB2BTimeSeriesKeys]);
  const currentTab = (searchParams.get("tab") as VisitorsTab) || "overview";
  const filters = useMemo<VisitorFilters>(() => {
    const baseRange = getDateRangeDefaults(currentTab);
    return {
      page: Number(searchParams.get("page") || "1"),
      limit: 25,
      portal: searchParams.get("portal") || "all",
      visitorType: searchParams.get("visitorType") || "all",
      country: searchParams.get("country") || "",
      city: searchParams.get("city") || "",
      device: searchParams.get("device") || "",
      operatingSystem: searchParams.get("operatingSystem") || "",
      browser: searchParams.get("browser") || "",
      search: searchParams.get("search") || "",
      pagePath: searchParams.get("pagePath") || "",
      referrer: searchParams.get("referrer") || "",
      utmSource: searchParams.get("utmSource") || "",
      utmCampaign: searchParams.get("utmCampaign") || "",
      source: searchParams.get("source") || "",
      medium: searchParams.get("medium") || "",
      campaign: searchParams.get("campaign") || "",
      actionType: searchParams.get("actionType") || "",
      recentMobileActionsPage: Number(searchParams.get("recentMobileActionsPage") || "1"),
      recentDownloadsPage: Number(searchParams.get("recentDownloadsPage") || "1"),
      botStatus: searchParams.get("botStatus") || "exclude",
      startDate: searchParams.get("startDate") || baseRange.startDate,
      endDate: searchParams.get("endDate") || baseRange.endDate,
    };
  }, [currentTab, searchParams]);

  useEffect(() => {
    let isMounted = true;

    const loadSummary = async (isBackgroundRefresh = false) => {
      if (!isBackgroundRefresh) {
        setLoading(true);
        setError(null);
      }

      try {
        const data = await fetchVisitorSummary();
        if (isMounted) {
          setSummary(data);
          if (!isBackgroundRefresh) {
            setError(null);
          }
        }
      } catch (loadError) {
        if (isMounted && !isBackgroundRefresh) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load visitors summary.");
        }
      } finally {
        if (isMounted && !isBackgroundRefresh) {
          setLoading(false);
        }
      }
    };

    void loadSummary();
    const intervalId = window.setInterval(() => {
      void loadSummary(true);
    }, ANALYTICS_REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadTabData = async (isBackgroundRefresh = false) => {
      if (!isBackgroundRefresh) {
        setTableLoading(true);
        setTableError(null);
      }

      try {
        if (currentTab === "b2bLeadZone") {
          const data = await fetchB2BLeadZoneDownloadAnalytics(filters);
          if (isMounted) {
            setB2BDownloadAnalytics(data);
            if (!isBackgroundRefresh) {
              setTableError(null);
            }
          }
          return;
        }

        if (currentTab === "live") {
          const data = await fetchLiveVisitors();
          if (isMounted) {
            setLiveVisitors(data);
            if (!isBackgroundRefresh) {
              setTableError(null);
            }
          }
          return;
        }

        if (currentTab === "locations") {
          const data = await fetchVisitorLocations(filters);
          if (isMounted) {
            setLocationRows(data);
            if (!isBackgroundRefresh) {
              setTableError(null);
            }
          }
          return;
        }

        if (currentTab === "pages") {
          const data = await fetchVisitorPages(filters);
          if (isMounted) {
            setPageRows(data);
            if (!isBackgroundRefresh) {
              setTableError(null);
            }
          }
          return;
        }

        const data = await fetchVisitors(filters);
        if (isMounted) {
          setVisitorRows(data.items);
          setTotalVisitors(data.total);
          if (!isBackgroundRefresh) {
            setTableError(null);
          }
        }
      } catch (loadError) {
        if (isMounted && !isBackgroundRefresh) {
          setTableError(loadError instanceof Error ? loadError.message : "Unable to load visitors.");
        }
      } finally {
        if (isMounted && !isBackgroundRefresh) {
          setTableLoading(false);
        }
      }
    };

    void loadTabData();
    const intervalId = window.setInterval(() => {
      void loadTabData(true);
    }, ANALYTICS_REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [currentTab, filters]);

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

  const b2bDownloadsSeries = useMemo(
    () =>
      b2bTimeSeriesOptions
        .filter((option) => b2bSelectedSeries.includes(option.key))
        .map((option) => ({
          name: option.label,
          data:
            b2bDownloadAnalytics?.insights.downloadsOverTime.map((item) => {
              if (option.key === "linkSaveActions") {
                return item.emailLinkRequests + item.successfulLinkShares + item.downloadLinkCopies;
              }
              return Number(item[option.key as keyof typeof item] ?? 0);
            }) ?? [],
        })),
    [b2bDownloadAnalytics, b2bSelectedSeries]
  );

  const b2bDeviceSeries = useMemo(
    () => b2bDownloadAnalytics?.insights.deviceBreakdown.map((item) => Number(item[b2bDeviceMetric])) ?? [],
    [b2bDeviceMetric, b2bDownloadAnalytics]
  );

  const b2bDownloadClassificationSeries = useMemo(
    () => b2bDownloadAnalytics?.insights.downloadClassification.map((item) => Number(item[b2bDownloadMetric])) ?? [],
    [b2bDownloadAnalytics, b2bDownloadMetric]
  );

  const b2bCountrySeries = useMemo(
    () => [
      {
        name: b2bLocationMetricOptions.find((option) => option.value === b2bLocationMetric)?.label ?? "Metric",
        data: b2bDownloadAnalytics?.insights.topCountries.map((item) => Number(item[b2bLocationMetric])) ?? [],
      },
    ],
    [b2bDownloadAnalytics, b2bLocationMetric]
  );

  const b2bCitySeries = useMemo(
    () => [
      {
        name: b2bLocationMetricOptions.find((option) => option.value === b2bLocationMetric)?.label ?? "Metric",
        data: b2bDownloadAnalytics?.insights.topCities.map((item) => Number(item[b2bLocationMetric])) ?? [],
      },
    ],
    [b2bDownloadAnalytics, b2bLocationMetric]
  );

  const b2bSourceSeries = useMemo(
    () => [
      {
        name: b2bSourceMetricOptions.find((option) => option.value === b2bSourceMetric)?.label ?? "Metric",
        data: b2bDownloadAnalytics?.insights.sourcePerformance.map((item) => Number(item[b2bSourceMetric])) ?? [],
      },
    ],
    [b2bDownloadAnalytics, b2bSourceMetric]
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
    if (currentTab === "b2bLeadZone") {
      next.set("recentMobileActionsPage", "1");
      next.set("recentDownloadsPage", "1");
    } else {
      next.set("page", "1");
    }
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

  const handleB2BTablePageChange = (key: "recentMobileActionsPage" | "recentDownloadsPage", nextPage: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "b2bLeadZone");
    next.set(key, String(Math.max(1, nextPage)));
    setSearchParams(next);
  };

  const resetB2BFilters = () => {
    const baseRange = getDateRangeDefaults("b2bLeadZone");
    setSearchParams({
      tab: "b2bLeadZone",
      startDate: baseRange.startDate,
      endDate: baseRange.endDate,
    });
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

  const b2bInsights = b2bDownloadAnalytics?.insights ?? null;

  return (
    <>
      <PageMeta title="Visitors Analytics | ITMart24 Admin" description="Visitor analytics across the User Portal and Vendor Portal." />
      <div className="mb-6 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-800 dark:text-white/90">
            Visitors Analytics
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {currentTab === "b2bLeadZone"
              ? "Enterprise download intelligence for B2B Lead Zone installer activity on /guest/map-scraper."
              : "Cross-portal traffic visibility for the User Portal and Vendor Portal."}
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

      {currentTab !== "b2bLeadZone" ? (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {summaryCards.map(([label, value, kind]) => (
            <ComponentCard key={label} title={String(label)}>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white/90 xl:text-[30px]">
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
      ) : null}

      {currentTab === "b2bLeadZone" ? (
        <div className="mb-6 space-y-6">
          <ComponentCard
            title="Filters"
            desc="Keep tab-specific filters in the URL while preserving the current date range and Asia/Kolkata reporting."
            headerAction={(
              <button
                type="button"
                onClick={() => setB2BFiltersExpanded((current) => !current)}
                className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-brand-200 hover:text-brand-600 dark:border-gray-800 dark:text-gray-300"
              >
                {b2bFiltersExpanded ? "Collapse" : "Expand"}
              </button>
            )}
          >
            {b2bFiltersExpanded ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
              <B2BFilterField label="Start date">
                <input
                  type="date"
                  value={filters.startDate ?? ""}
                  onChange={(event) => handleFilterChange("startDate", event.target.value)}
                  className={filterControlClassName}
                />
              </B2BFilterField>
              <B2BFilterField label="End date">
                <input
                  type="date"
                  value={filters.endDate ?? ""}
                  onChange={(event) => handleFilterChange("endDate", event.target.value)}
                  className={filterControlClassName}
                />
              </B2BFilterField>
              <B2BFilterField label="Device category">
                <select value={filters.device ?? ""} onChange={(event) => handleFilterChange("device", event.target.value)} className={filterControlClassName}>
                  <option value="">All devices</option>
                  {b2bInsights?.filterOptions.deviceCategories.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </B2BFilterField>
              <B2BFilterField label="Operating system">
                <select value={filters.operatingSystem ?? ""} onChange={(event) => handleFilterChange("operatingSystem", event.target.value)} className={filterControlClassName}>
                  <option value="">All operating systems</option>
                  {b2bInsights?.filterOptions.operatingSystems.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </B2BFilterField>
              <B2BFilterField label="Browser">
                <select value={filters.browser ?? ""} onChange={(event) => handleFilterChange("browser", event.target.value)} className={filterControlClassName}>
                  <option value="">All browsers</option>
                  {b2bInsights?.filterOptions.browsers.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </B2BFilterField>
              <B2BFilterField label="Country">
                <select value={filters.country ?? ""} onChange={(event) => handleFilterChange("country", event.target.value)} className={filterControlClassName}>
                  <option value="">All countries</option>
                  {b2bInsights?.filterOptions.countries.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </B2BFilterField>
              <B2BFilterField label="City">
                <select value={filters.city ?? ""} onChange={(event) => handleFilterChange("city", event.target.value)} className={filterControlClassName}>
                  <option value="">All cities</option>
                  {b2bInsights?.filterOptions.cities.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </B2BFilterField>
              <B2BFilterField label="Source">
                <select value={filters.source ?? ""} onChange={(event) => handleFilterChange("source", event.target.value)} className={filterControlClassName}>
                  <option value="">All sources</option>
                  {b2bInsights?.filterOptions.sources.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </B2BFilterField>
              <B2BFilterField label="Medium">
                <select value={filters.medium ?? ""} onChange={(event) => handleFilterChange("medium", event.target.value)} className={filterControlClassName}>
                  <option value="">All mediums</option>
                  {b2bInsights?.filterOptions.mediums.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </B2BFilterField>
              <B2BFilterField label="Campaign">
                <select value={filters.campaign ?? ""} onChange={(event) => handleFilterChange("campaign", event.target.value)} className={filterControlClassName}>
                  <option value="">All campaigns</option>
                  {b2bInsights?.filterOptions.campaigns.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </B2BFilterField>
              <B2BFilterField label="Event or action type">
                <select value={filters.actionType ?? ""} onChange={(event) => handleFilterChange("actionType", event.target.value)} className={filterControlClassName}>
                  <option value="">All tracked actions</option>
                  {b2bInsights?.filterOptions.actionTypes.map((item) => (
                    <option key={item.value} value={item.value} disabled={!item.available}>
                      {item.label}{item.available ? "" : " (Tracking not available yet)"}
                    </option>
                  ))}
                </select>
              </B2BFilterField>
              <B2BFilterField label="Application version">
                <select disabled className={`${filterControlClassName} cursor-not-allowed opacity-70`}>
                  <option>{b2bInsights?.availability.appVersion ? "Available" : "Tracking not available yet"}</option>
                </select>
              </B2BFilterField>
              <B2BFilterField label="Authentication status">
                <select disabled className={`${filterControlClassName} cursor-not-allowed opacity-70`}>
                  <option>{b2bInsights?.availability.authenticationStatus ? "Available" : "Tracking not available yet"}</option>
                </select>
              </B2BFilterField>
            </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-300">
                Filters are collapsed by default. Expand to refine device, source, campaign, and event reporting for this tab.
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={resetB2BFilters}
                className="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 dark:border-gray-800 dark:text-gray-200"
              >
                Reset filters
              </button>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-300">
              Reporting window: {b2bDownloadAnalytics?.range.startDate ?? filters.startDate} to {b2bDownloadAnalytics?.range.endDate ?? filters.endDate}. Some funnel events became available after tracking was introduced; earlier activity may not contain every stage.
            </div>
          </ComponentCard>

          {b2bInsights ? (
            <>
              <B2BMetricSection title="Traffic">
                <B2BMetricCard title="Total landing-page visitors" value={b2bInsights.traffic.totalLandingPageVisitors} tone="blue" description="All landing-page visits recorded for the B2B Lead Zone page in the selected period." />
                <B2BMetricCard title="Unique visitors" value={b2bInsights.traffic.uniqueVisitors} tone="blue" description="Distinct visitors seen on the landing page within the selected period." />
                <B2BMetricCard title="Mobile or tablet visitors" value={b2bInsights.traffic.mobileTabletVisitors} tone="blue" description="Visitors identified as Android, iPhone, iPad, or another tablet-class device." />
                <B2BMetricCard title="Windows desktop visitors" value={b2bInsights.traffic.windowsDesktopVisitors} tone="green" description="Desktop visitors whose operating system was identified as Windows." />
                <B2BMetricCard title="Other desktop visitors" value={b2bInsights.traffic.otherDesktopVisitors} tone="amber" description="Desktop visitors identified as macOS, Linux, or another non-Windows desktop system." />
                <B2BMetricCard title="Unknown-device visitors" value={b2bInsights.traffic.unknownDeviceVisitors} tone="amber" description="Visitors whose device class or operating system could not be safely normalized." />
                <B2BMetricCard title="Mobile visitor percentage" value={b2bInsights.traffic.mobileVisitorPercentage} tone="blue" kind="percent" description="Mobile or tablet visitors divided by unique landing-page visitors." />
                <B2BMetricCard title="Mobile landing views" value={b2bInsights.traffic.mobileLandingViews} tone="purple" description="Landing page views generated from mobile or tablet traffic." />
              </B2BMetricSection>

              <B2BMetricSection title="Mobile Actions">
                <B2BMetricCard title="Mobile landing views" value={b2bInsights.mobileActions.mobileLandingViews} tone="purple" description="Mobile landing page views tracked on the B2B Lead Zone entry page." />
                <B2BMetricCard title="Email link requests" value={b2bInsights.mobileActions.emailLinkRequests} tone="purple" description="Requests for a Windows download link from a mobile visitor. Shows zero until the producer is available." />
                <B2BMetricCard title="Successful link shares" value={b2bInsights.mobileActions.successfulLinkShares} tone="purple" description="Share actions confirmed as successful from mobile visitors." />
                <B2BMetricCard title="Download-link copies" value={b2bInsights.mobileActions.downloadLinkCopies} tone="purple" description="Copy actions for the download link, deduplicated only in the conversion card below." />
                <B2BMetricCard title="Mobile .exe downloads" value={b2bInsights.mobileActions.mobileExeDownloads} tone="amber" description="Installer downloads attempted from mobile devices. These are not counted as valid Windows conversions." />
                <B2BMetricCard title="Mobile link-save conversion rate" value={b2bInsights.mobileActions.mobileLinkSaveConversionRate ?? 0} tone="purple" kind="percent" description="Unique mobile visitors completing at least one successful request, share, or copy divided by unique mobile visitors." />
              </B2BMetricSection>

              <B2BMetricSection title="Windows App Funnel">
                <B2BMetricCard title="Windows installer downloads" value={b2bInsights.windowsFunnel.windowsInstallerDownloads} tone="green" description="Installer download events from recognized Windows desktop devices only." />
                <B2BMetricCard title="Unique Windows downloaders" value={b2bInsights.windowsFunnel.uniqueWindowsDownloaders} tone="green" description="Distinct visitors with at least one valid Windows installer download." />
                <B2BMetricCard title="App first opens" value={b2bInsights.windowsFunnel.appFirstOpens} tone="green" description="First-open events received from the Windows app. Shows Not yet available until those events arrive." />
                <B2BMetricCard title="First extractions completed" value={b2bInsights.windowsFunnel.firstExtractionsCompleted} tone="green" description="First extraction completion events from the Windows application." />
                <B2BMetricCard title="Free 30-limit reached" value={b2bInsights.windowsFunnel.free30LimitReached} tone="amber" description="Number of users who reached the free 30-lead limit." />
                <B2BMetricCard title="Plans opened" value={b2bInsights.windowsFunnel.plansOpened} tone="amber" description="Plan-selection opens from the Windows application." />
                <B2BMetricCard title="Checkout started" value={b2bInsights.windowsFunnel.checkoutStarted} tone="amber" description="Checkout-start events from the Windows application or linked purchase flow." />
                <B2BMetricCard title="Payments completed" value={b2bInsights.windowsFunnel.paymentsCompleted} tone="green" description="Completed payments reliably attributed in analytics." />
              </B2BMetricSection>

              <B2BMetricSection title="Conversion Rates">
                <B2BMetricCard title="Visitor → Windows download rate" value={b2bInsights.conversionRates.visitorToWindowsDownloadRate} tone="blue" kind="percent" description="Unique Windows downloaders divided by unique landing-page visitors." />
                <B2BMetricCard title="Windows download → First-open rate" value={b2bInsights.conversionRates.windowsDownloadToFirstOpenRate} tone="green" kind="percent" description="App first opens divided by unique Windows downloaders." />
                <B2BMetricCard title="First open → First extraction rate" value={b2bInsights.conversionRates.firstOpenToFirstExtractionRate} tone="green" kind="percent" description="First extractions completed divided by app first opens." />
                <B2BMetricCard title="First extraction → Free-limit rate" value={b2bInsights.conversionRates.firstExtractionToFreeLimitRate} tone="amber" kind="percent" description="Free 30-limit reached divided by first extractions completed." />
                <B2BMetricCard title="Free limit → Plans-opened rate" value={b2bInsights.conversionRates.freeLimitToPlansOpenedRate} tone="amber" kind="percent" description="Plans opened divided by free 30-limit reached." />
                <B2BMetricCard title="Plans opened → Checkout rate" value={b2bInsights.conversionRates.plansOpenedToCheckoutRate} tone="amber" kind="percent" description="Checkout starts divided by plans opened." />
                <B2BMetricCard title="Checkout → Payment rate" value={b2bInsights.conversionRates.checkoutToPaymentRate} tone="green" kind="percent" description="Payments completed divided by checkout starts." />
                <B2BMetricCard title="Overall visitor → Payment rate" value={b2bInsights.conversionRates.overallVisitorToPaymentRate} tone="green" kind="percent" description="Payments completed divided by unique landing-page visitors." />
              </B2BMetricSection>

              <div className="grid grid-cols-12 gap-4 md:gap-6">
                <div className="col-span-12 xl:col-span-7">
                  <ComponentCard
                    title="Downloads Over Time"
                    desc="Default view compares valid Windows downloads, mobile .exe downloads, and link-save actions."
                    headerAction={
                      <div className="max-w-full overflow-x-auto pb-1">
                        <div className="flex min-w-max flex-wrap justify-end gap-2">
                          {b2bTimeSeriesOptions.map((option) => (
                            <button
                              key={option.key}
                              type="button"
                              onClick={() =>
                                setB2BSelectedSeries((current) =>
                                  current.includes(option.key)
                                    ? current.length === 1
                                      ? current
                                      : current.filter((item) => item !== option.key)
                                    : [...current, option.key]
                                )
                              }
                              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                                b2bSelectedSeries.includes(option.key)
                                  ? "border-brand-500 bg-brand-500 text-white"
                                  : "border-gray-200 text-gray-600 dark:border-gray-800 dark:text-gray-300"
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    }
                  >
                    {b2bDownloadsSeries.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No time-series activity was recorded for this period.</p>
                    ) : (
                      <ReactApexChart
                        type="line"
                        height={340}
                        options={{
                          chart: { toolbar: { show: false } },
                          stroke: { curve: "smooth", width: 3 },
                          legend: { position: "top" },
                          xaxis: { categories: b2bInsights.downloadsOverTime.map((item) => item.day) },
                          yaxis: { labels: { formatter: (value) => formatNumber(Number(value)) } },
                        }}
                        series={b2bDownloadsSeries}
                      />
                    )}
                  </ComponentCard>
                </div>
                <div className="col-span-12 xl:col-span-5">
                  <ComponentCard
                    title="Device Mix"
                    desc="Commercially important operating systems stay separated instead of collapsing all desktop traffic together."
                    headerAction={
                      <select value={b2bDeviceMetric} onChange={(event) => setB2BDeviceMetric(event.target.value as B2BDeviceMetric)} className={filterControlClassName}>
                        <option value="uniqueVisitors">Unique visitors</option>
                        <option value="downloadEvents">Download events</option>
                        <option value="linkSaveActions">Link-save actions</option>
                        <option value="windowsDownloads">Windows installer downloads</option>
                      </select>
                    }
                  >
                    {b2bInsights.deviceBreakdown.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No device mix data was recorded for this period.</p>
                    ) : (
                      <ReactApexChart
                        type="donut"
                        height={340}
                        options={{
                          labels: b2bInsights.deviceBreakdown.map((item) => item.segment),
                          legend: { position: "bottom" },
                          tooltip: { y: { formatter: (value) => formatNumber(Number(value)) } },
                        }}
                        series={b2bDeviceSeries}
                      />
                    )}
                  </ComponentCard>
                </div>

                <div className="col-span-12 xl:col-span-7">
                  <ComponentCard title="Mobile Interest → Windows Use" desc={b2bInsights.mobileFunnel.note}>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {b2bInsights.mobileFunnel.stages.map((stage) => (
                        <div key={stage.key} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
                          <p className={sectionTitleClassName}>{stage.label}</p>
                          <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white/90">
                            {stage.available ? formatNumber(stage.value) : "Not yet available"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </ComponentCard>
                </div>

                <div className="col-span-12 xl:col-span-5">
                  <ComponentCard
                    title="Installer Downloads by Device"
                    desc="Only Windows downloads are counted as valid Windows installer conversions."
                    headerAction={
                      <select value={b2bDownloadMetric} onChange={(event) => setB2BDownloadMetric(event.target.value as B2BDownloadMetric)} className={filterControlClassName}>
                        <option value="downloadEvents">Total download events</option>
                        <option value="uniqueDownloaders">Unique downloaders</option>
                      </select>
                    }
                  >
                    {b2bInsights.downloadClassification.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No installer downloads were recorded for this period.</p>
                    ) : (
                      <ReactApexChart
                        type="bar"
                        height={340}
                        options={{
                          chart: { toolbar: { show: false } },
                          plotOptions: { bar: { borderRadius: 8, horizontal: true } },
                          xaxis: { categories: b2bInsights.downloadClassification.map((item) => item.classification) },
                          tooltip: { y: { formatter: (value) => formatNumber(Number(value)) } },
                        }}
                        series={[{ name: b2bDownloadMetric === "downloadEvents" ? "Download events" : "Unique downloaders", data: b2bDownloadClassificationSeries }]}
                      />
                    )}
                  </ComponentCard>
                </div>

                <div className="col-span-12">
                  <ComponentCard
                    title="Acquisition Sources"
                    desc="Compare Meta, direct, organic, email, and other sources without assuming missing attribution belongs to Meta."
                    headerAction={
                      <select value={b2bSourceMetric} onChange={(event) => setB2BSourceMetric(event.target.value as B2BSourceMetric)} className={filterControlClassName}>
                        {b2bSourceMetricOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    }
                  >
                    <ReactApexChart
                      type="bar"
                      height={320}
                      options={{
                        chart: { toolbar: { show: false } },
                        plotOptions: { bar: { borderRadius: 8, horizontal: false } },
                        xaxis: { categories: b2bInsights.sourcePerformance.map((item) => item.label) },
                        yaxis: { labels: { formatter: (value) => formatNumber(Number(value)) } },
                      }}
                      series={b2bSourceSeries}
                    />
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b border-gray-100 dark:border-gray-800">
                            {["Source / campaign", "Visitors", "Mobile", "Saved links", "Windows downloads", "First opens", "First extractions", "Payments", "Visitor → payment"].map((label) => (
                              <TableCell key={label} isHeader className={headerCellClassName}>
                                {label}
                              </TableCell>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {b2bInsights.sourcePerformance.map((row) => (
                            <TableRow key={`${row.label}-${row.campaign}`} className="border-b border-gray-100 dark:border-gray-800">
                              <TableCell className={dataCellClassName}>
                                <div className="font-medium text-gray-900 dark:text-white/90">{row.label}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {row.medium || "Direct / Unknown"}{row.campaign ? ` · ${row.campaign}` : ""}
                                </div>
                              </TableCell>
                              <TableCell className={dataCellClassName}>{formatNumber(row.uniqueVisitors)}</TableCell>
                              <TableCell className={dataCellClassName}>{formatNumber(row.mobileVisitors)}</TableCell>
                              <TableCell className={dataCellClassName}>{formatNumber(row.linkSaveConversions)}</TableCell>
                              <TableCell className={dataCellClassName}>{formatNumber(row.windowsDownloads)}</TableCell>
                              <TableCell className={dataCellClassName}>{formatNumber(row.appFirstOpens)}</TableCell>
                              <TableCell className={dataCellClassName}>{formatNumber(row.firstExtractions)}</TableCell>
                              <TableCell className={dataCellClassName}>{formatNumber(row.payments)}</TableCell>
                              <TableCell className={dataCellClassName}>{row.visitorToPaymentRateAvailable ? formatPercent(row.visitorToPaymentRate) : "Not yet available"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </ComponentCard>
                </div>

                <div className="col-span-12 xl:col-span-6">
                  <ComponentCard
                    title="Top Countries"
                    headerAction={
                      <select value={b2bLocationMetric} onChange={(event) => setB2BLocationMetric(event.target.value as B2BLocationMetric)} className={filterControlClassName}>
                        {b2bLocationMetricOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    }
                  >
                    <ReactApexChart
                      type="bar"
                      height={320}
                      options={{
                        chart: { toolbar: { show: false } },
                        xaxis: { categories: b2bInsights.topCountries.map((item) => item.country) },
                      }}
                      series={b2bCountrySeries}
                    />
                  </ComponentCard>
                </div>
                <div className="col-span-12 xl:col-span-6">
                  <ComponentCard title="Top Cities">
                    <ReactApexChart
                      type="bar"
                      height={320}
                      options={{
                        chart: { toolbar: { show: false } },
                        xaxis: { categories: b2bInsights.topCities.map((item) => `${item.city}, ${item.country}`) },
                      }}
                      series={b2bCitySeries}
                    />
                  </ComponentCard>
                </div>

                <div className="col-span-12 xl:col-span-6">
                  <ComponentCard title="Failed Link Requests" desc="Safe categories only. Private errors, raw exceptions, and provider details stay hidden.">
                    <B2BMetricCard
                      title="Failed link requests"
                      value={b2bInsights.failedLinkRequests.available ? b2bInsights.failedLinkRequests.total : null}
                      tone={b2bInsights.failedLinkRequests.available ? "red" : "amber"}
                      description="Counts mobile visitors who attempted to request a link but the request did not complete successfully."
                    />
                    {b2bInsights.failedLinkRequests.available ? (
                      b2bInsights.failedLinkRequests.breakdown.length > 0 ? (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="border-b border-gray-100 dark:border-gray-800">
                                {["Safe failure category", "Count"].map((label) => (
                                  <TableCell key={label} isHeader className={headerCellClassName}>
                                    {label}
                                  </TableCell>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {b2bInsights.failedLinkRequests.breakdown.map((row) => (
                                <TableRow key={row.category} className="border-b border-gray-100 dark:border-gray-800">
                                  <TableCell className={dataCellClassName}>{row.category}</TableCell>
                                  <TableCell className={dataCellClassName}>{formatNumber(row.count)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">No failed link requests were recorded for this period.</p>
                      )
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400">This event is not yet being received from the landing page or Windows application.</p>
                    )}
                  </ComponentCard>
                </div>

                <div className="col-span-12 xl:col-span-6">
                  <ComponentCard title="Tracking Coverage" desc={b2bInsights.historicalNote}>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {b2bInsights.trackedEvents.map((event) => (
                        <div key={event.eventName} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-gray-900 dark:text-white/90">{event.eventName}</p>
                            <Badge size="sm" color={event.status === "available" ? "success" : "warning"}>
                              {event.status === "available" ? "Available" : "Tracking not available yet"}
                            </Badge>
                          </div>
                          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            Table {event.table ?? "Not yet available"} · Timestamp {event.timestampColumn ?? "-"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </ComponentCard>
                </div>
              </div>

              <ComponentCard title="Top Download Pages">
                {(b2bDownloadAnalytics?.charts.pageBreakdown.length ?? 0) === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No download pages matched the current filters.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-gray-100 dark:border-gray-800">
                          {["Path", "Downloads", "Unique visitors"].map((label) => (
                            <TableCell key={label} isHeader className={headerCellClassName}>
                              {label}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(b2bDownloadAnalytics?.charts.pageBreakdown ?? []).map((row) => (
                          <TableRow key={row.path} className="border-b border-gray-100 dark:border-gray-800">
                            <TableCell className={dataCellClassName}>{row.path}</TableCell>
                            <TableCell className={dataCellClassName}>{formatNumber(row.downloads)}</TableCell>
                            <TableCell className={dataCellClassName}>{formatNumber(row.uniqueVisitors)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </ComponentCard>

              <ComponentCard title="Recent Mobile Visitor Actions">
                {b2bInsights.recentMobileActions.items.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No mobile link-saving activity was recorded for this period.</p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b border-gray-100 dark:border-gray-800">
                            {["Date and time", "Action", "Device", "Operating system", "Browser", "Location", "Source / campaign", "Page", "Visitor ID", "Attribution"].map((label) => (
                              <TableCell key={label} isHeader className={headerCellClassName}>
                                {label}
                              </TableCell>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {b2bInsights.recentMobileActions.items.map((row, index) => (
                            <TableRow key={`${row.occurredAt}-${row.visitorId}-${index}`} className="border-b border-gray-100 dark:border-gray-800">
                              <TableCell className={dataCellClassName}>{formatDateTime(row.occurredAt)}</TableCell>
                              <TableCell className={dataCellClassName}>{row.action}</TableCell>
                              <TableCell className={dataCellClassName}>{row.device}</TableCell>
                              <TableCell className={dataCellClassName}>{row.operatingSystem}</TableCell>
                              <TableCell className={dataCellClassName}>{row.browser}</TableCell>
                              <TableCell className={dataCellClassName}>{row.location}</TableCell>
                              <TableCell className={dataCellClassName}>{row.sourceCampaign}</TableCell>
                              <TableCell className={dataCellClassName}>{row.page}</TableCell>
                              <TableCell className={dataCellClassName}>
                                <CopyableIdentifier value={row.visitorId} />
                              </TableCell>
                              <TableCell className={dataCellClassName}>{row.attributionStatus}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <TablePagination
                      page={b2bInsights.recentMobileActions.pagination.page}
                      totalPages={b2bInsights.recentMobileActions.pagination.totalPages}
                      totalItems={b2bInsights.recentMobileActions.pagination.total}
                      onPrevious={() => handleB2BTablePageChange("recentMobileActionsPage", b2bInsights.recentMobileActions.pagination.page - 1)}
                      onNext={() => handleB2BTablePageChange("recentMobileActionsPage", b2bInsights.recentMobileActions.pagination.page + 1)}
                    />
                  </>
                )}
              </ComponentCard>

              <ComponentCard title="Recent Downloads">
                {b2bInsights.recentDownloadTable.items.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No download events found for the selected range.</p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b border-gray-100 dark:border-gray-800">
                            {["Downloaded at", "Device", "Operating system", "Browser", "Location", "Source / campaign", "Classification", "Version", "Repeat", "Visitor ID", "First open", "First extraction", "Payment", "Page"].map((label) => (
                              <TableCell key={label} isHeader className={headerCellClassName}>
                                {label}
                              </TableCell>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {b2bInsights.recentDownloadTable.items.map((row, index) => (
                            <TableRow key={`${row.downloadedAt}-${row.visitorId}-${index}`} className="border-b border-gray-100 dark:border-gray-800">
                              <TableCell className={dataCellClassName}>{formatDateTime(row.downloadedAt)}</TableCell>
                              <TableCell className={dataCellClassName}>{row.deviceCategory}</TableCell>
                              <TableCell className={dataCellClassName}>{row.operatingSystem}</TableCell>
                              <TableCell className={dataCellClassName}>{row.browser}</TableCell>
                              <TableCell className={dataCellClassName}>{row.location}</TableCell>
                              <TableCell className={dataCellClassName}>{row.sourceCampaign}</TableCell>
                              <TableCell className={dataCellClassName}>
                                <Badge size="sm" color={downloadClassificationBadgeColor(row.downloadClassification)}>
                                  {row.downloadClassification}
                                </Badge>
                              </TableCell>
                              <TableCell className={dataCellClassName}>{row.installerVersion ?? "Unknown"}</TableCell>
                              <TableCell className={dataCellClassName}>{row.isRepeatDownload ? "Repeat" : "Unique"}</TableCell>
                              <TableCell className={dataCellClassName}>
                                <CopyableIdentifier value={row.visitorId} />
                              </TableCell>
                              <TableCell className={dataCellClassName}>{formatBooleanState(row.laterAppFirstOpen)}</TableCell>
                              <TableCell className={dataCellClassName}>{formatBooleanState(row.laterFirstExtraction)}</TableCell>
                              <TableCell className={dataCellClassName}>{formatBooleanState(row.paymentStatus)}</TableCell>
                              <TableCell className={dataCellClassName}>{row.pagePath}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <TablePagination
                      page={b2bInsights.recentDownloadTable.pagination.page}
                      totalPages={b2bInsights.recentDownloadTable.pagination.totalPages}
                      totalItems={b2bInsights.recentDownloadTable.pagination.total}
                      onPrevious={() => handleB2BTablePageChange("recentDownloadsPage", b2bInsights.recentDownloadTable.pagination.page - 1)}
                      onNext={() => handleB2BTablePageChange("recentDownloadsPage", b2bInsights.recentDownloadTable.pagination.page + 1)}
                    />
                  </>
                )}
              </ComponentCard>
            </>
          ) : tableLoading ? (
            <ComponentCard title="B2B Lead Zone">
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading B2B Lead Zone analytics...</p>
            </ComponentCard>
          ) : null}
        </div>
      ) : null}

      {currentTab !== "b2bLeadZone" && summary ? (
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

      {currentTab !== "b2bLeadZone" ? (
      <ComponentCard title="Filters">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input
            value={filters.search ?? ""}
            onChange={(event) => handleFilterChange("search", event.target.value)}
            placeholder="Search visitor, account, location"
            className={filterControlClassName}
          />
          <select value={filters.portal ?? "all"} onChange={(event) => handleFilterChange("portal", event.target.value)} className={filterControlClassName}>
            <option value="all">All portals</option>
            <option value="user_portal">User Portal</option>
            <option value="vendor_portal">Vendor Portal</option>
          </select>
          <select value={filters.visitorType ?? "all"} onChange={(event) => handleFilterChange("visitorType", event.target.value)} className={filterControlClassName}>
            <option value="all">All visitor types</option>
            <option value="anonymous">Anonymous</option>
            <option value="user">User</option>
            <option value="vendor">Vendor</option>
          </select>
          <input value={filters.country ?? ""} onChange={(event) => handleFilterChange("country", event.target.value)} placeholder="Country" className={filterControlClassName} />
          <input value={filters.city ?? ""} onChange={(event) => handleFilterChange("city", event.target.value)} placeholder="City" className={filterControlClassName} />
          <input value={filters.device ?? ""} onChange={(event) => handleFilterChange("device", event.target.value)} placeholder="Device" className={filterControlClassName} />
          <input value={filters.browser ?? ""} onChange={(event) => handleFilterChange("browser", event.target.value)} placeholder="Browser" className={filterControlClassName} />
          <input value={filters.pagePath ?? ""} onChange={(event) => handleFilterChange("pagePath", event.target.value)} placeholder="Page path" className={filterControlClassName} />
          <input value={filters.referrer ?? ""} onChange={(event) => handleFilterChange("referrer", event.target.value)} placeholder="Referrer" className={filterControlClassName} />
          <input value={filters.utmSource ?? ""} onChange={(event) => handleFilterChange("utmSource", event.target.value)} placeholder="UTM source" className={filterControlClassName} />
          <input value={filters.utmCampaign ?? ""} onChange={(event) => handleFilterChange("utmCampaign", event.target.value)} placeholder="UTM campaign" className={filterControlClassName} />
          <select value={filters.botStatus ?? "exclude"} onChange={(event) => handleFilterChange("botStatus", event.target.value)} className={filterControlClassName}>
            <option value="exclude">Exclude bots</option>
            <option value="bots_only">Bots only</option>
          </select>
          <input type="date" value={filters.startDate ?? ""} onChange={(event) => handleFilterChange("startDate", event.target.value)} className={filterControlClassName} />
          <input type="date" value={filters.endDate ?? ""} onChange={(event) => handleFilterChange("endDate", event.target.value)} className={filterControlClassName} />
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
      ) : null}

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
                        <TableCell key={label} isHeader className={headerCellClassName}>
                          {label}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {liveVisitors.map((visitor) => (
                      <TableRow key={visitor.id} className="border-b border-gray-100 dark:border-gray-800">
                        <TableCell className={dataCellClassName}>{visitor.portal}</TableCell>
                        <TableCell className={dataCellClassName}>
                          <button type="button" onClick={() => void openSessionDetails(visitor.id)} className="text-left font-medium text-brand-600 hover:underline">
                            {visitor.currentPath ?? visitor.pageTitle ?? "-"}
                          </button>
                        </TableCell>
                        <TableCell className={dataCellClassName}>{visitor.location}</TableCell>
                        <TableCell className={dataCellClassName}>{visitor.visitorType}</TableCell>
                        <TableCell className={dataCellClassName}>{visitor.device ?? "-"}</TableCell>
                        <TableCell className={dataCellClassName}>{visitor.browser ?? "-"}</TableCell>
                        <TableCell className={dataCellClassName}>{visitor.source ?? visitor.referrer ?? "-"}</TableCell>
                        <TableCell className={dataCellClassName}>{formatDateTime(visitor.startedAt)}</TableCell>
                        <TableCell className={dataCellClassName}>{formatDateTime(visitor.lastActivityAt)}</TableCell>
                        <TableCell className={dataCellClassName}>{formatNumber(visitor.pageViews)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </ComponentCard>
        ) : null}

        {currentTab !== "live" && currentTab !== "locations" && currentTab !== "pages" && currentTab !== "b2bLeadZone" ? (
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
                          <TableCell key={label} isHeader className={headerCellClassName}>
                            {label}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visitorRows.map((row) => (
                        <TableRow key={row.visitorId} className="border-b border-gray-100 dark:border-gray-800">
                          <TableCell className={dataCellClassName}>
                            <button type="button" onClick={() => void openVisitorDetails(row.visitorId)} className="text-left font-medium text-brand-600 hover:underline">
                              {row.visitorId}
                            </button>
                          </TableCell>
                          <TableCell className={dataCellClassName}>{row.portal}</TableCell>
                          <TableCell className={dataCellClassName}>{formatDateTime(row.firstSeen)}</TableCell>
                          <TableCell className={dataCellClassName}>{formatDateTime(row.lastSeen)}</TableCell>
                          <TableCell className={dataCellClassName}>{row.location}</TableCell>
                          <TableCell className={dataCellClassName}>{formatNumber(row.sessions)}</TableCell>
                          <TableCell className={dataCellClassName}>{formatNumber(row.pageViews)}</TableCell>
                          <TableCell className={dataCellClassName}>{formatDuration(row.totalDurationSeconds)}</TableCell>
                          <TableCell className={dataCellClassName}>{row.latestPage ?? "-"}</TableCell>
                          <TableCell className={dataCellClassName}>{[row.device, row.browser].filter(Boolean).join(" / ") || "-"}</TableCell>
                          <TableCell className={dataCellClassName}>{row.associatedUserId ?? row.associatedVendorId ?? "-"}</TableCell>
                          <TableCell className={dataCellClassName}>{row.acquisitionSource ?? "-"}</TableCell>
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

function B2BFilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <span className={filterLabelClassName}>{label}</span>
      {children}
    </label>
  );
}

function B2BMetricSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <p className={sectionTitleClassName}>{title}</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{children}</div>
    </section>
  );
}

function B2BMetricCard({
  title,
  value,
  tone,
  description,
  kind = "count",
}: {
  title: string;
  value: number | null | undefined;
  tone: "blue" | "purple" | "green" | "amber" | "red";
  description: string;
  kind?: "count" | "percent" | "duration";
}) {
  return (
    <div className={`rounded-2xl border bg-white p-5 dark:bg-white/[0.03] ${b2bCardToneClassNames[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{title}</p>
        <button
          type="button"
          title={description}
          aria-label={description}
          className="text-gray-400 transition hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:hover:text-gray-200"
        >
          <InfoIcon className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-4 text-3xl font-semibold text-gray-900 dark:text-white/90">{formatMetricValue(value, kind)}</p>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{description}</p>
    </div>
  );
}

function TablePagination({
  page,
  totalPages,
  totalItems,
  onPrevious,
  onNext,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between dark:text-gray-400">
      <span>
        Page {page} of {Math.max(1, totalPages)} · {formatNumber(totalItems)} records
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onPrevious}
          disabled={page <= 1}
          className="rounded-full border border-gray-200 px-4 py-2 font-medium text-gray-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:text-gray-300"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={page >= totalPages}
          className="rounded-full border border-gray-200 px-4 py-2 font-medium text-gray-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:text-gray-300"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function formatBooleanState(value: boolean | null) {
  if (value == null) return "Not yet available";
  return value ? "Yes" : "No";
}

function downloadClassificationBadgeColor(classification: string): "success" | "warning" | "info" | "light" {
  if (classification === "Valid Windows download") return "success";
  if (classification === "Mobile .exe download") return "warning";
  if (classification === "Other non-Windows download") return "info";
  return "light";
}

function CopyableIdentifier({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span>{shortId(value)}</span>
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="text-gray-400 transition hover:text-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
        aria-label={`Copy visitor identifier ${shortId(value)}`}
        title={copied ? "Copied" : "Copy identifier"}
      >
        <CopyIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
