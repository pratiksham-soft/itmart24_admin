import { useEffect, useMemo, useState } from "react";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
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

const PAGE_SIZE = 25;

const formatDate = (value: string | null) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

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
  if (!hours || !minutes) {
    return value || "-";
  }

  const parsedHours = Number(hours);
  const parsedMinutes = Number(minutes);
  if (!Number.isFinite(parsedHours) || !Number.isFinite(parsedMinutes)) {
    return value;
  }

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

  if (normalized.includes("performance")) {
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
    <div
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${accentClassName}`}
    >
      {title}
    </div>
    <div className="mt-4 text-3xl font-semibold text-gray-900 dark:text-white">
      {value}
    </div>
    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{caption}</p>
  </div>
);

const GuestUsers = () => {
  const [reports, setReports] = useState<GuestReportEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);

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

    if (!query) {
      return reports;
    }

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
                      <TableCell
                        isHeader
                        className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                      >
                        Website
                      </TableCell>
                      <TableCell
                        isHeader
                        className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                      >
                        Report Type
                      </TableCell>
                      <TableCell
                        isHeader
                        className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                      >
                        Report Schedule
                      </TableCell>
                      <TableCell
                        isHeader
                        className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                      >
                        Logged At
                      </TableCell>
                      <TableCell
                        isHeader
                        className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                      >
                        Report ID
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
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getReportTypeClasses(report.reportType)}`}
                          >
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
                          <span className="block max-w-[220px] truncate" title={report.id}>
                            {report.id}
                          </span>
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
                  onClick={() =>
                    setPage((currentPage) => Math.max(1, currentPage - 1))
                  }
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
                      className={`rounded-md px-3 py-1 text-sm ${
                        pageNumber === page ? "bg-sky-600 text-white" : "border"
                      }`}
                    >
                      {pageNumber}
                    </button>
                  ))}

                {page + 2 < totalPages ? (
                  <span className="px-1 text-sm">...</span>
                ) : null}

                <button
                  type="button"
                  disabled={page === totalPages}
                  onClick={() =>
                    setPage((currentPage) =>
                      Math.min(totalPages, currentPage + 1)
                    )
                  }
                  className="rounded-md bg-sky-600 px-3 py-1 text-sm text-white disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </ComponentCard>
      </div>
    </>
  );
};

export default GuestUsers;
