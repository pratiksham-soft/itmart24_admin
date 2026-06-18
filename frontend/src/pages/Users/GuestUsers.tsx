import { useEffect, useMemo, useState } from "react";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
import { Modal } from "../../components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import ProductSearchBar from "../Products/ProductSearchBar";
import { API_BASE_URL } from "../../config/api";

type GuestReportEntry = {
  id: string;
  reportDate: string | null;
  reportTime: string;
  website: string;
  reportType: string;
  createdAt: string | null;
};

type GuestTrackingDetails = {
  report: {
    website: string;
    normalizedDomain: string | null;
    reportType: string;
    reportId: string | null;
    guestReportId: string;
    loggedAt: string | null;
    reportSchedule: string;
    sourceTool: string | null;
    reportViewed: boolean;
    reportGeneratedAt: string | null;
    reportViewedAt: string | null;
  };
  visitor: {
    anonymousVisitorId: string | null;
    sessionId: string | null;
    deviceType: string | null;
    browser: string | null;
    os: string | null;
    screenSize: string | null;
    referrer: string | null;
    landingPageUrl: string | null;
    currentUrl: string | null;
  };
  campaign: {
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmContent: string | null;
    utmAudience: string | null;
  };
  inputs: {
    websiteUrl: string;
    normalizedDomain: string | null;
    businessType: string | null;
    businessCategory: string | null;
    targetCountry: string | null;
    businessGoal: string | null;
    brandName: string | null;
    competitorUrl1: string | null;
    competitorUrl2: string | null;
    competitorDomain1: string | null;
    competitorDomain2: string | null;
  };
  funnel: {
    pageViewed: boolean;
    formStarted: boolean;
    analyzeClicked: boolean;
    reportGenerationStarted: boolean;
    reportGenerated: boolean;
    reportViewed: boolean;
    unlockClicked: boolean;
    pricingViewed: boolean;
    planSelected: boolean;
    createAccountClicked: boolean;
    registrationStarted: boolean;
  };
  duplicateSignals: {
    sameVisitorReportCount: number;
    sameSessionReportCount: number;
    sameDomainReportCount: number;
    isRepeatedDomain: boolean;
    isRepeatedVisitor: boolean;
    isRepeatedSession: boolean;
  };
  events: Array<{
    id: string;
    time: string | null;
    event: string;
    details: string;
  }>;
};

const PAGE_SIZE = 25;

const formatDate = (value: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatDateTime = (value: string | null) => {
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

const formatTime = (value: string) => {
  const [hours, minutes] = value.split(":");
  if (!hours || !minutes) return value || "-";
  const parsedHours = Number(hours);
  const parsedMinutes = Number(minutes);
  if (!Number.isFinite(parsedHours) || !Number.isFinite(parsedMinutes)) return value;
  const now = new Date();
  now.setHours(parsedHours, parsedMinutes, 0, 0);
  return now.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getWebsiteHost = (website: string) => {
  try {
    return new URL(website).hostname.replace(/^www\./i, "");
  } catch {
    return website;
  }
};

const getReportTypeClasses = (reportType: string) => {
  const normalized = reportType.trim().toLowerCase();

  if (normalized.includes("seo")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300";
  }

  if (normalized.includes("ai")) {
    return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300";
  }

  return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300";
};

const SummaryCard = ({
  title,
  value,
  caption,
  accentClassName,
}: {
  title: string;
  value: string;
  caption: string;
  accentClassName: string;
}) => (
  <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
    <div className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${accentClassName}`}>
      {title}
    </div>
    <div className="mt-4 text-3xl font-semibold text-gray-900 dark:text-white">
      {value}
    </div>
    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{caption}</p>
  </div>
);

const DetailItem = ({ label, value }: { label: string; value: string | null | undefined }) => (
  <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
      {label}
    </p>
    <p className="mt-2 break-words text-sm text-gray-800 dark:text-white/90">
      {value || "-"}
    </p>
  </div>
);

const FunnelBadge = ({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) => (
  <span
    className={[
      "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
      active
        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
        : "border-gray-200 bg-gray-50 text-gray-500 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-gray-400",
    ].join(" ")}
  >
    {label}
  </span>
);

const GuestUsers = () => {
  const [reports, setReports] = useState<GuestReportEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedReport, setSelectedReport] = useState<GuestReportEntry | null>(null);
  const [trackingDetails, setTrackingDetails] = useState<GuestTrackingDetails | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReports = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/api/users/guest-users`);
        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || "Failed to fetch guest users");
        }

        setReports(Array.isArray(result.data) ? result.data : []);
      } catch (fetchError) {
        console.error("Failed to fetch guest users", fetchError);
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to fetch guest users"
        );
      } finally {
        setLoading(false);
      }
    };

    void fetchReports();
  }, []);

  const filteredReports = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return reports;

    return reports.filter((report) =>
      [
        report.id,
        report.website,
        getWebsiteHost(report.website),
        report.reportType,
        report.reportDate,
        report.reportTime,
      ]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(query))
    );
  }, [reports, searchQuery]);

  const totalReports = reports.length;
  const uniqueWebsites = new Set(reports.map((report) => report.website)).size;
  const uniqueReportTypes = new Set(
    reports.map((report) => report.reportType.trim()).filter(Boolean)
  ).size;
  const latestReportDate = reports[0]?.reportDate ?? null;

  const totalCount = filteredReports.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const paginatedReports = filteredReports.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );
  const startItem = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, totalCount);

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  async function openTrackingModal(report: GuestReportEntry) {
    setSelectedReport(report);
    setTrackingDetails(null);
    setTrackingError(null);
    setTrackingLoading(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/users/guest-users/${report.id}/tracking`
      );
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to fetch guest tracking details");
      }

      setTrackingDetails(result.data as GuestTrackingDetails);
    } catch (fetchError) {
      console.error("Failed to fetch guest tracking details", fetchError);
      setTrackingError(
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to fetch guest tracking details"
      );
    } finally {
      setTrackingLoading(false);
    }
  }

  function closeTrackingModal() {
    setSelectedReport(null);
    setTrackingDetails(null);
    setTrackingError(null);
    setTrackingLoading(false);
  }

  if (loading) {
    return <div>Loading guest users...</div>;
  }

  return (
    <>
      <PageMeta
        title="Guest Users | ITMart24 Admin"
        description="Browse guest report activity captured in the user_portal database."
      />

      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Guest Reports"
            value={String(totalReports)}
            caption="All guest usage records currently available from the guest_report table."
            accentClassName="bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"
          />
          <SummaryCard
            title="Tracked Websites"
            value={String(uniqueWebsites)}
            caption="Distinct websites that generated guest reports."
            accentClassName="bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
          />
          <SummaryCard
            title="Report Types"
            value={String(uniqueReportTypes)}
            caption="Unique guest report categories currently present in the database."
            accentClassName="bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300"
          />
          <SummaryCard
            title="Latest Report Date"
            value={formatDate(latestReportDate)}
            caption="Most recent report date based on the guest_report feed ordering."
            accentClassName="bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
          />
        </div>

        <ComponentCard
          title="Guest Users"
          desc="Guest activity records from the user_portal PostgreSQL guest_report table."
        >
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <ProductSearchBar
              id="guest-users-search"
              label="Search guest users"
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search by website, report type, date, time, or report ID"
            />
            <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300">
              Read-only guest website report feed from user_portal.
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300">
              {error}
            </div>
          ) : null}

          {searchQuery ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {totalCount} matching report{totalCount === 1 ? "" : "s"} found.
            </p>
          ) : null}

          {filteredReports.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {searchQuery
                ? "No guest reports match your search."
                : "No guest reports found."}
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
              <div className="max-w-full overflow-x-auto">
                <Table>
                  <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                    <TableRow>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Website
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Report Type
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Report Schedule
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Logged At
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Action
                      </TableCell>
                    </TableRow>
                  </TableHeader>

                  <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                    {paginatedReports.map((report) => (
                      <TableRow key={report.id}>
                        <TableCell className="px-5 py-4 text-start">
                          <div className="space-y-1">
                            <a
                              href={report.website}
                              target="_blank"
                              rel="noreferrer"
                              className="block text-theme-sm font-medium text-sky-700 transition hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200"
                            >
                              {getWebsiteHost(report.website)}
                            </a>
                            <div className="text-theme-xs text-gray-500 dark:text-gray-400">
                              {report.website}
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="px-5 py-4">
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getReportTypeClasses(report.reportType)}`}>
                            {report.reportType}
                          </span>
                        </TableCell>

                        <TableCell className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                          <div className="space-y-1">
                            <div className="font-medium text-gray-800 dark:text-white/90">
                              {formatDate(report.reportDate)}
                            </div>
                            <div>{formatTime(report.reportTime)}</div>
                          </div>
                        </TableCell>

                        <TableCell className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                          {formatDateTime(report.createdAt)}
                        </TableCell>

                        <TableCell className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                          <button
                            type="button"
                            onClick={() => void openTrackingModal(report)}
                            className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300"
                          >
                            View
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {filteredReports.length > 0 ? (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {startItem}-{endItem} / {totalCount}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                  className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
                >
                  Previous
                </button>

                {Array.from({ length: totalPages }, (_, index) => index + 1)
                  .slice(Math.max(0, page - 3), Math.min(totalPages, page + 2))
                  .map((pageNumber) => (
                    <button
                      key={pageNumber}
                      type="button"
                      onClick={() => setPage(pageNumber)}
                      className={`rounded-md px-3 py-1 text-sm ${pageNumber === page ? "bg-sky-600 text-white" : "border"}`}
                    >
                      {pageNumber}
                    </button>
                  ))}

                {page + 2 < totalPages ? <span className="px-1 text-sm">...</span> : null}

                <button
                  type="button"
                  disabled={page === totalPages}
                  onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
                  className="rounded-md bg-sky-600 px-3 py-1 text-sm text-white disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </ComponentCard>
      </div>

      <Modal isOpen={Boolean(selectedReport)} onClose={closeTrackingModal} className="max-w-[1100px] m-4">
        <div className="max-h-[85vh] overflow-y-auto rounded-3xl bg-white p-6 dark:bg-gray-900 md:p-8">
          <div className="flex flex-col gap-3 border-b border-gray-200 pb-5 dark:border-white/[0.06]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-300">
              Guest Tracking Details
            </p>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {selectedReport ? getWebsiteHost(selectedReport.website) : "Guest report"}
            </h2>
          </div>

          {trackingLoading ? (
            <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-600 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-gray-300">
              Loading tracking details...
            </div>
          ) : null}

          {!trackingLoading && trackingError ? (
            <div className="mt-6 rounded-2xl border border-error-200 bg-error-50 px-5 py-4 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300">
              {trackingError}
            </div>
          ) : null}

          {!trackingLoading && !trackingError && trackingDetails ? (
            <div className="mt-6 space-y-6">
              <section className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Report Summary</h3>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <DetailItem label="Website" value={trackingDetails.report.website} />
                  <DetailItem label="Normalized Domain" value={trackingDetails.report.normalizedDomain} />
                  <DetailItem label="Report Type" value={trackingDetails.report.reportType} />
                  <DetailItem label="Report ID" value={trackingDetails.report.reportId} />
                  <DetailItem label="Guest Report ID" value={trackingDetails.report.guestReportId} />
                  <DetailItem label="Logged At" value={formatDateTime(trackingDetails.report.loggedAt)} />
                  <DetailItem label="Report Schedule" value={trackingDetails.report.reportSchedule} />
                  <DetailItem label="Source Tool" value={trackingDetails.report.sourceTool} />
                  <DetailItem label="Report Viewed" value={trackingDetails.report.reportViewed ? "Yes" : "No"} />
                  <DetailItem label="Report Generated At" value={formatDateTime(trackingDetails.report.reportGeneratedAt)} />
                  <DetailItem label="Report Viewed At" value={formatDateTime(trackingDetails.report.reportViewedAt)} />
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Visitor / Session</h3>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <DetailItem label="Anonymous Visitor ID" value={trackingDetails.visitor.anonymousVisitorId} />
                  <DetailItem label="Session ID" value={trackingDetails.visitor.sessionId} />
                  <DetailItem label="Device Type" value={trackingDetails.visitor.deviceType} />
                  <DetailItem label="Browser" value={trackingDetails.visitor.browser} />
                  <DetailItem label="OS" value={trackingDetails.visitor.os} />
                  <DetailItem label="Screen Size" value={trackingDetails.visitor.screenSize} />
                  <DetailItem label="Referrer" value={trackingDetails.visitor.referrer} />
                  <DetailItem label="Landing Page URL" value={trackingDetails.visitor.landingPageUrl} />
                  <DetailItem label="Current URL" value={trackingDetails.visitor.currentUrl} />
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Campaign / UTM</h3>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <DetailItem label="utm_source" value={trackingDetails.campaign.utmSource} />
                  <DetailItem label="utm_medium" value={trackingDetails.campaign.utmMedium} />
                  <DetailItem label="utm_campaign" value={trackingDetails.campaign.utmCampaign} />
                  <DetailItem label="utm_content" value={trackingDetails.campaign.utmContent} />
                  <DetailItem label="utm_audience" value={trackingDetails.campaign.utmAudience} />
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Input Details</h3>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <DetailItem label="Website URL" value={trackingDetails.inputs.websiteUrl} />
                  <DetailItem label="Normalized Domain" value={trackingDetails.inputs.normalizedDomain} />
                  <DetailItem label="Business Type" value={trackingDetails.inputs.businessType} />
                  <DetailItem label="Business Category" value={trackingDetails.inputs.businessCategory} />
                  <DetailItem label="Target Country" value={trackingDetails.inputs.targetCountry} />
                  <DetailItem label="Business Goal" value={trackingDetails.inputs.businessGoal} />
                  <DetailItem label="Brand Name" value={trackingDetails.inputs.brandName} />
                  <DetailItem label="Competitor URL 1" value={trackingDetails.inputs.competitorUrl1} />
                  <DetailItem label="Competitor URL 2" value={trackingDetails.inputs.competitorUrl2} />
                  <DetailItem label="Competitor Domain 1" value={trackingDetails.inputs.competitorDomain1} />
                  <DetailItem label="Competitor Domain 2" value={trackingDetails.inputs.competitorDomain2} />
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Funnel Status</h3>
                <div className="flex flex-wrap gap-2">
                  <FunnelBadge label="Page viewed" active={trackingDetails.funnel.pageViewed} />
                  <FunnelBadge label="Form started" active={trackingDetails.funnel.formStarted} />
                  <FunnelBadge label="Analyze clicked" active={trackingDetails.funnel.analyzeClicked} />
                  <FunnelBadge label="Generation started" active={trackingDetails.funnel.reportGenerationStarted} />
                  <FunnelBadge label="Report generated" active={trackingDetails.funnel.reportGenerated} />
                  <FunnelBadge label="Report viewed" active={trackingDetails.funnel.reportViewed} />
                  <FunnelBadge label="Unlock clicked" active={trackingDetails.funnel.unlockClicked} />
                  <FunnelBadge label="Pricing viewed" active={trackingDetails.funnel.pricingViewed} />
                  <FunnelBadge label="Plan selected" active={trackingDetails.funnel.planSelected} />
                  <FunnelBadge label="Create account clicked" active={trackingDetails.funnel.createAccountClicked} />
                  <FunnelBadge label="Registration started" active={trackingDetails.funnel.registrationStarted} />
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Events Timeline</h3>
                {trackingDetails.events.length === 0 ? (
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-600 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-gray-300">
                    No tracking events were found for this guest report yet.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.06]">
                    <div className="max-w-full overflow-x-auto">
                      <Table>
                        <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                          <TableRow>
                            <TableCell isHeader className="px-4 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                              Time
                            </TableCell>
                            <TableCell isHeader className="px-4 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                              Event
                            </TableCell>
                            <TableCell isHeader className="px-4 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                              Details
                            </TableCell>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                          {trackingDetails.events.map((event) => (
                            <TableRow key={event.id}>
                              <TableCell className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                                {formatDateTime(event.time)}
                              </TableCell>
                              <TableCell className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                                {event.event}
                              </TableCell>
                              <TableCell className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                                {event.details}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </section>

              <section className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Duplicate / Repeat Signals</h3>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <DetailItem label="Same Visitor Report Count" value={String(trackingDetails.duplicateSignals.sameVisitorReportCount)} />
                  <DetailItem label="Same Session Report Count" value={String(trackingDetails.duplicateSignals.sameSessionReportCount)} />
                  <DetailItem label="Same Domain Report Count" value={String(trackingDetails.duplicateSignals.sameDomainReportCount)} />
                  <DetailItem label="Is Repeated Domain?" value={trackingDetails.duplicateSignals.isRepeatedDomain ? "Yes" : "No"} />
                  <DetailItem label="Is Repeated Visitor?" value={trackingDetails.duplicateSignals.isRepeatedVisitor ? "Yes" : "No"} />
                  <DetailItem label="Is Repeated Session?" value={trackingDetails.duplicateSignals.isRepeatedSession ? "Yes" : "No"} />
                </div>
              </section>
            </div>
          ) : null}

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={closeTrackingModal}
              className="rounded-full border border-gray-200 px-5 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 dark:border-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.03]"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default GuestUsers;
