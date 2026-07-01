import { Fragment, useEffect, useMemo, useState } from "react";
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
import { downloadCsv, downloadXlsx } from "../../utils/spreadsheetExport";

type GuestReportEntry = {
  id: string;
  reportDate: string | null;
  reportTime: string;
  website: string;
  reportType: string;
  createdAt: string | null;
  hasSuccessfulPayment: boolean;
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
    subscriptionPlanViewed: boolean;
    subscriptionBillingCycleChanged: boolean;
    oneTimeUnlockSectionViewed: boolean;
    oneTimePlanViewed: boolean;
    oneTimePlanSelected: boolean;
    oneTimeOtpModalOpened: boolean;
    oneTimeEmailEntered: boolean;
    oneTimeOtpSendClicked: boolean;
    oneTimeOtpSent: boolean;
    oneTimeOtpSendFailed: boolean;
    oneTimeOtpVerifyClicked: boolean;
    oneTimeOtpVerified: boolean;
    oneTimeOtpVerifyFailed: boolean;
    oneTimeWorkspaceRedirectStarted: boolean;
    oneTimeReportPaymentStarted: boolean;
    oneTimeReportPaymentSuccessful: boolean;
    oneTimeReportPaymentFailed: boolean;
    subscriptionPaymentSuccessful: boolean;
    subscriptionPaymentFailed: boolean;
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

type GuestFeedbackEntry = {
  id: string;
  guestReportId: string | null;
  sourceTool: string | null;
  reportType: string | null;
  websiteUrl: string | null;
  normalizedDomain: string | null;
  competitorUrl1: string | null;
  competitorUrl2: string | null;
  businessType: string | null;
  businessCategory: string | null;
  targetCountry: string | null;
  businessGoal: string | null;
  brandName: string | null;
  previewUsefulness: string | null;
  unlockBlocker: string | null;
  optionalMessage: string | null;
  contactValue: string | null;
  createdAt: string | null;
};

type GuestDuplicateAuditAttemptEntry = {
  guestReportId: string;
  createdAt: string | null;
  generatedAt: string | null;
  website: string;
  websiteUrl: string | null;
  sourceTool: string | null;
  anonymousVisitorId: string | null;
  sessionId: string | null;
  ipHash: string | null;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrer: string | null;
  landingPageUrl: string | null;
  currentUrl: string | null;
};

type GuestDuplicateAuditGroup = {
  normalizedDomain: string;
  reportType: "SEO_HEALTH" | "AI_VISIBILITY" | "COMPETITOR_COMPARISON";
  reportTypeLabel: string;
  isExcluded: boolean;
  totalAttempts: number;
  firstGeneratedAt: string | null;
  latestGeneratedAt: string | null;
  uniqueAnonymousVisitors: number;
  uniqueSessions: number;
  uniqueIpHashes: number;
  attempts: GuestDuplicateAuditAttemptEntry[];
};

type GuestDuplicateExclusionEntry = {
  id: string;
  normalizedDomain: string;
  websiteInput: string;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

const PAGE_SIZE = 25;
const EXPORT_BASE_EVENT_NAMES = [
  "GuestSEOHealthPageView",
  "GuestAIAnalysisPageView",
  "GuestCompetitorPageView",
  "SEOHealthFormStarted",
  "AIAnalysisFormStarted",
  "CompetitorFormStarted",
  "WebsiteUrlFocused",
  "WebsiteUrlChanged",
  "BusinessTypeChanged",
  "BusinessCategoryChanged",
  "BrandNameChanged",
  "TargetCountryChanged",
  "CompetitorUrl1Changed",
  "CompetitorUrl2Changed",
  "BusinessDescriptionChanged",
  "SEOHealthAnalyzeClicked",
  "AIAnalysisAnalyzeClicked",
  "CompetitorAnalyzeClicked",
  "SEOHealthReportGenerationStarted",
  "AIAnalysisReportGenerationStarted",
  "CompetitorReportGenerationStarted",
  "SEOHealthReportGenerated",
  "AIAnalysisReportGenerated",
  "CompetitorReportGenerated",
  "SEOHealthReportFailed",
  "AIAnalysisReportFailed",
  "CompetitorReportFailed",
  "SEOHealthReportViewed",
  "AIAnalysisReportViewed",
  "CompetitorReportViewed",
  "GuestUnlockFullReportClicked",
  "GuestCreateAccountClicked",
  "GuestPricingViewed",
  "GuestPlanSelected",
  "GuestRegistrationStarted",
  "GuestSubscriptionPlanViewed",
  "GuestSubscriptionBillingCycleChanged",
  "GuestOneTimeUnlockSectionViewed",
  "GuestOneTimePlanViewed",
  "GuestOneTimePlanSelected",
  "GuestOneTimeOtpModalOpened",
  "GuestOneTimeEmailEntered",
  "GuestOneTimeOtpSendClicked",
  "GuestOneTimeOtpSent",
  "GuestOneTimeOtpSendFailed",
  "GuestOneTimeOtpVerifyClicked",
  "GuestOneTimeOtpVerified",
  "GuestOneTimeOtpVerifyFailed",
  "GuestOneTimeWorkspaceRedirectStarted",
  "OneTimeReportPaymentStarted",
  "OneTimeReportPaymentSuccessful",
  "OneTimeReportPaymentFailed",
  "SubscriptionPaymentSuccessful",
  "SubscriptionPaymentFailed",
] as const;

const FUNNEL_STATUS_ITEMS: Array<{
  key: keyof GuestTrackingDetails["funnel"];
  label: string;
  eventNames: string[];
}> = [
  { key: "pageViewed", label: "Page viewed", eventNames: ["GuestSEOHealthPageView", "GuestAIAnalysisPageView", "GuestCompetitorPageView"] },
  { key: "formStarted", label: "Form started", eventNames: ["SEOHealthFormStarted", "AIAnalysisFormStarted", "CompetitorFormStarted"] },
  { key: "analyzeClicked", label: "Analyze clicked", eventNames: ["SEOHealthAnalyzeClicked", "AIAnalysisAnalyzeClicked", "CompetitorAnalyzeClicked"] },
  { key: "reportGenerationStarted", label: "Generation started", eventNames: ["SEOHealthReportGenerationStarted", "AIAnalysisReportGenerationStarted", "CompetitorReportGenerationStarted"] },
  { key: "reportGenerated", label: "Report generated", eventNames: ["SEOHealthReportGenerated", "AIAnalysisReportGenerated", "CompetitorReportGenerated"] },
  { key: "reportViewed", label: "Report viewed", eventNames: ["SEOHealthReportViewed", "AIAnalysisReportViewed", "CompetitorReportViewed"] },
  { key: "unlockClicked", label: "Unlock clicked", eventNames: ["GuestUnlockFullReportClicked"] },
  { key: "pricingViewed", label: "Pricing viewed", eventNames: ["GuestPricingViewed"] },
  { key: "planSelected", label: "Plan selected", eventNames: ["GuestPlanSelected"] },
  { key: "createAccountClicked", label: "Create account clicked", eventNames: ["GuestCreateAccountClicked"] },
  { key: "registrationStarted", label: "Registration started", eventNames: ["GuestRegistrationStarted"] },
  { key: "subscriptionPlanViewed", label: "Subscription plan viewed", eventNames: ["GuestSubscriptionPlanViewed"] },
  { key: "subscriptionBillingCycleChanged", label: "Billing cycle changed", eventNames: ["GuestSubscriptionBillingCycleChanged"] },
  { key: "oneTimeUnlockSectionViewed", label: "One-time unlock viewed", eventNames: ["GuestOneTimeUnlockSectionViewed"] },
  { key: "oneTimePlanViewed", label: "One-time plan viewed", eventNames: ["GuestOneTimePlanViewed"] },
  { key: "oneTimePlanSelected", label: "One-time plan selected", eventNames: ["GuestOneTimePlanSelected"] },
  { key: "oneTimeOtpModalOpened", label: "OTP modal opened", eventNames: ["GuestOneTimeOtpModalOpened"] },
  { key: "oneTimeEmailEntered", label: "Email entered", eventNames: ["GuestOneTimeEmailEntered"] },
  { key: "oneTimeOtpSendClicked", label: "OTP send clicked", eventNames: ["GuestOneTimeOtpSendClicked"] },
  { key: "oneTimeOtpSent", label: "OTP sent", eventNames: ["GuestOneTimeOtpSent"] },
  { key: "oneTimeOtpSendFailed", label: "OTP send failed", eventNames: ["GuestOneTimeOtpSendFailed"] },
  { key: "oneTimeOtpVerifyClicked", label: "OTP verify clicked", eventNames: ["GuestOneTimeOtpVerifyClicked"] },
  { key: "oneTimeOtpVerified", label: "OTP verified", eventNames: ["GuestOneTimeOtpVerified"] },
  { key: "oneTimeOtpVerifyFailed", label: "OTP verify failed", eventNames: ["GuestOneTimeOtpVerifyFailed"] },
  { key: "oneTimeWorkspaceRedirectStarted", label: "Workspace redirect started", eventNames: ["GuestOneTimeWorkspaceRedirectStarted"] },
  { key: "oneTimeReportPaymentStarted", label: "One-time payment started", eventNames: ["OneTimeReportPaymentStarted"] },
  { key: "oneTimeReportPaymentSuccessful", label: "One-time payment successful", eventNames: ["OneTimeReportPaymentSuccessful"] },
  { key: "oneTimeReportPaymentFailed", label: "One-time payment failed", eventNames: ["OneTimeReportPaymentFailed"] },
  { key: "subscriptionPaymentSuccessful", label: "Subscription payment successful", eventNames: ["SubscriptionPaymentSuccessful"] },
  { key: "subscriptionPaymentFailed", label: "Subscription payment failed", eventNames: ["SubscriptionPaymentFailed"] },
];

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

const getWebsitePreview = (website: string, extraCharacters = 12) => {
  const normalizedWebsite = website.trim();
  if (!normalizedWebsite) return website;

  try {
    const parsedUrl = new URL(normalizedWebsite);
    const mainWebsite = `${parsedUrl.origin}/`;
    const remainder = `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`.replace(
      /^\/+/,
      "",
    );

    if (!remainder) {
      return mainWebsite;
    }

    if (remainder.length <= extraCharacters) {
      return `${mainWebsite}${remainder}`;
    }

    return `${mainWebsite}${remainder.slice(0, extraCharacters)}...`;
  } catch {
    if (normalizedWebsite.length <= extraCharacters + 3) {
      return normalizedWebsite;
    }

    return `${normalizedWebsite.slice(0, extraCharacters)}...`;
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

const getReportRowClasses = (hasSuccessfulPayment: boolean) =>
  hasSuccessfulPayment ? "bg-amber-50/70 dark:bg-amber-500/10" : "";

const getDuplicateAuditKey = (group: GuestDuplicateAuditGroup) =>
  `${group.normalizedDomain}::${group.reportType}`;

const SummaryCard = ({
  title,
  value,
  caption,
  accentClassName,
  onClick,
}: {
  title: string;
  value: string;
  caption: string;
  accentClassName: string;
  onClick?: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={[
      "rounded-2xl border border-gray-200 bg-white p-5 text-left dark:border-gray-800 dark:bg-white/[0.03]",
      onClick
        ? "transition hover:border-sky-300 hover:shadow-sm dark:hover:border-sky-500/30"
        : "cursor-default",
    ].join(" ")}
  >
    <div className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${accentClassName}`}>
      {title}
    </div>
    <div className="mt-4 text-3xl font-semibold text-gray-900 dark:text-white">
      {value}
    </div>
    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{caption}</p>
  </button>
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

const getEventTimelineText = (details: GuestTrackingDetails) =>
  details.events.length > 0
    ? details.events
        .map((event) => `${formatDateTime(event.time)} :: ${event.event} :: ${event.details}`)
        .join(" || ")
    : "-";

const getFiredAndUnfiredEvents = (details: GuestTrackingDetails) => {
  const firedFromTimeline = new Set(details.events.map((event) => event.event));
  const firedFromFunnel = FUNNEL_STATUS_ITEMS.flatMap((item) =>
    details.funnel[item.key] ? item.eventNames : []
  );
  const firedEvents = Array.from(
    new Set([...EXPORT_BASE_EVENT_NAMES, ...firedFromTimeline, ...firedFromFunnel].filter((eventName) => firedFromTimeline.has(eventName) || firedFromFunnel.includes(eventName)))
  );
  const unfiredEvents = EXPORT_BASE_EVENT_NAMES.filter(
    (eventName) => !firedEvents.includes(eventName)
  );

  return {
    firedEvents: firedEvents.join(", ") || "-",
    unfiredEvents: unfiredEvents.join(", ") || "-",
  };
};

const buildExportRow = (
  report: GuestReportEntry,
  details: GuestTrackingDetails
) => {
  const { firedEvents, unfiredEvents } = getFiredAndUnfiredEvents(details);

  return {
    "List Website": report.website,
    "List Report Type": report.reportType,
    "List Report Date": formatDate(report.reportDate),
    "List Report Time": formatTime(report.reportTime),
    "List Logged At": formatDateTime(report.createdAt),
    "Report Summary - Website": details.report.website,
    "Report Summary - Normalized Domain": details.report.normalizedDomain ?? "-",
    "Report Summary - Report Type": details.report.reportType,
    "Report Summary - Report ID": details.report.reportId ?? "-",
    "Report Summary - Guest Report ID": details.report.guestReportId,
    "Report Summary - Logged At": formatDateTime(details.report.loggedAt),
    "Report Summary - Report Schedule": details.report.reportSchedule,
    "Report Summary - Source Tool": details.report.sourceTool ?? "-",
    "Report Summary - Report Viewed": details.report.reportViewed ? "Yes" : "No",
    "Report Summary - Report Generated At": formatDateTime(details.report.reportGeneratedAt),
    "Report Summary - Report Viewed At": formatDateTime(details.report.reportViewedAt),
    "Visitor / Session - Anonymous Visitor ID": details.visitor.anonymousVisitorId ?? "-",
    "Visitor / Session - Session ID": details.visitor.sessionId ?? "-",
    "Visitor / Session - Device Type": details.visitor.deviceType ?? "-",
    "Visitor / Session - Browser": details.visitor.browser ?? "-",
    "Visitor / Session - OS": details.visitor.os ?? "-",
    "Visitor / Session - Screen Size": details.visitor.screenSize ?? "-",
    "Visitor / Session - Referrer": details.visitor.referrer ?? "-",
    "Visitor / Session - Landing Page URL": details.visitor.landingPageUrl ?? "-",
    "Visitor / Session - Current URL": details.visitor.currentUrl ?? "-",
    "Campaign / UTM - utm_source": details.campaign.utmSource ?? "-",
    "Campaign / UTM - utm_medium": details.campaign.utmMedium ?? "-",
    "Campaign / UTM - utm_campaign": details.campaign.utmCampaign ?? "-",
    "Campaign / UTM - utm_content": details.campaign.utmContent ?? "-",
    "Campaign / UTM - utm_audience": details.campaign.utmAudience ?? "-",
    "Input Details - Website URL": details.inputs.websiteUrl,
    "Input Details - Normalized Domain": details.inputs.normalizedDomain ?? "-",
    "Input Details - Business Type": details.inputs.businessType ?? "-",
    "Input Details - Business Category": details.inputs.businessCategory ?? "-",
    "Input Details - Target Country": details.inputs.targetCountry ?? "-",
    "Input Details - Business Goal": details.inputs.businessGoal ?? "-",
    "Input Details - Brand Name": details.inputs.brandName ?? "-",
    "Input Details - Competitor URL 1": details.inputs.competitorUrl1 ?? "-",
    "Input Details - Competitor URL 2": details.inputs.competitorUrl2 ?? "-",
    "Input Details - Competitor Domain 1": details.inputs.competitorDomain1 ?? "-",
    "Input Details - Competitor Domain 2": details.inputs.competitorDomain2 ?? "-",
    ...Object.fromEntries(
      FUNNEL_STATUS_ITEMS.map((item) => [
        `Funnel Status - ${item.label}`,
        details.funnel[item.key] ? "Fired" : "Unfired",
      ])
    ),
    "Fired Events": firedEvents,
    "Unfired Events": unfiredEvents,
    "Events Timeline": getEventTimelineText(details),
    "Events Timeline - Count": details.events.length,
    "Duplicate / Repeat Signals - Same Visitor Report Count": details.duplicateSignals.sameVisitorReportCount,
    "Duplicate / Repeat Signals - Same Session Report Count": details.duplicateSignals.sameSessionReportCount,
    "Duplicate / Repeat Signals - Same Domain Report Count": details.duplicateSignals.sameDomainReportCount,
    "Duplicate / Repeat Signals - Is Repeated Domain": details.duplicateSignals.isRepeatedDomain ? "Yes" : "No",
    "Duplicate / Repeat Signals - Is Repeated Visitor": details.duplicateSignals.isRepeatedVisitor ? "Yes" : "No",
    "Duplicate / Repeat Signals - Is Repeated Session": details.duplicateSignals.isRepeatedSession ? "Yes" : "No",
  };
};

const GuestUsers = () => {
  const [reports, setReports] = useState<GuestReportEntry[]>([]);
  const [feedback, setFeedback] = useState<GuestFeedbackEntry[]>([]);
  const [duplicateGroups, setDuplicateGroups] = useState<GuestDuplicateAuditGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackLoading, setFeedbackLoading] = useState(true);
  const [duplicateLoading, setDuplicateLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [duplicateDomainFilter, setDuplicateDomainFilter] = useState("");
  const [duplicateReportTypeFilter, setDuplicateReportTypeFilter] = useState("");
  const [expandedDuplicateKeys, setExpandedDuplicateKeys] = useState<string[]>([]);
  const [isDuplicateAuditExpanded, setIsDuplicateAuditExpanded] = useState(false);
  const [duplicateExclusions, setDuplicateExclusions] = useState<GuestDuplicateExclusionEntry[]>([]);
  const [duplicateExclusionModalOpen, setDuplicateExclusionModalOpen] = useState(false);
  const [duplicateExclusionWebsite, setDuplicateExclusionWebsite] = useState("");
  const [duplicateExclusionNotes, setDuplicateExclusionNotes] = useState("");
  const [duplicateExclusionLoading, setDuplicateExclusionLoading] = useState(true);
  const [duplicateExclusionSaving, setDuplicateExclusionSaving] = useState(false);
  const [duplicateExclusionError, setDuplicateExclusionError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selectedReport, setSelectedReport] = useState<GuestReportEntry | null>(null);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [trackingDetails, setTrackingDetails] = useState<GuestTrackingDetails | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<"csv" | "xlsx" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

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

  useEffect(() => {
    const fetchFeedback = async () => {
      setFeedbackLoading(true);
      setFeedbackError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/api/users/guest-feedback`);
        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || "Failed to fetch guest feedback");
        }

        setFeedback(Array.isArray(result.data) ? result.data : []);
      } catch (fetchError) {
        console.error("Failed to fetch guest feedback", fetchError);
        setFeedbackError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to fetch guest feedback"
        );
      } finally {
        setFeedbackLoading(false);
      }
    };

    void fetchFeedback();
  }, []);

  useEffect(() => {
    const fetchDuplicateGroups = async () => {
      setDuplicateLoading(true);
      setDuplicateError(null);

      try {
        const params = new URLSearchParams();
        params.set("limit", "100");

        if (duplicateDomainFilter.trim()) {
          params.set("domain", duplicateDomainFilter.trim());
        }

        if (duplicateReportTypeFilter) {
          params.set("reportType", duplicateReportTypeFilter);
        }

        const response = await fetch(
          `${API_BASE_URL}/api/users/guest-report-duplicates?${params.toString()}`
        );
        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || "Failed to fetch duplicate guest audit");
        }

        const nextGroups = Array.isArray(result.data) ? result.data : [];
        setDuplicateGroups(nextGroups);
        setExpandedDuplicateKeys((current) =>
          current.filter((key) =>
            nextGroups.some((group: GuestDuplicateAuditGroup) => getDuplicateAuditKey(group) === key)
          )
        );
      } catch (fetchError) {
        console.error("Failed to fetch duplicate guest audit", fetchError);
        setDuplicateError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to fetch duplicate guest audit"
        );
      } finally {
        setDuplicateLoading(false);
      }
    };

    void fetchDuplicateGroups();
  }, [duplicateDomainFilter, duplicateReportTypeFilter]);

  useEffect(() => {
    const fetchDuplicateExclusions = async () => {
      setDuplicateExclusionLoading(true);
      setDuplicateExclusionError(null);

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/users/guest-report-duplicate-exclusions`
        );
        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(
            result.message || "Failed to fetch excluded guest websites"
          );
        }

        setDuplicateExclusions(Array.isArray(result.data) ? result.data : []);
      } catch (fetchError) {
        console.error("Failed to fetch duplicate exclusions", fetchError);
        setDuplicateExclusionError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to fetch excluded guest websites"
        );
      } finally {
        setDuplicateExclusionLoading(false);
      }
    };

    void fetchDuplicateExclusions();
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
  const totalFeedback = feedback.length;
  const totalDuplicateGroups = duplicateGroups.length;
  const totalDuplicateAttempts = duplicateGroups.reduce(
    (sum, group) => sum + group.totalAttempts,
    0
  );
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

  function openDuplicateExclusionModal(prefillWebsite?: string) {
    setDuplicateExclusionError(null);
    setDuplicateExclusionWebsite(prefillWebsite ?? "");
    setDuplicateExclusionNotes("");
    setDuplicateExclusionModalOpen(true);
  }

  function closeDuplicateExclusionModal() {
    setDuplicateExclusionModalOpen(false);
    setDuplicateExclusionWebsite("");
    setDuplicateExclusionNotes("");
    setDuplicateExclusionError(null);
  }

  async function saveDuplicateExclusion() {
    const website = duplicateExclusionWebsite.trim();
    if (!website) {
      setDuplicateExclusionError("Enter a website or domain to exclude.");
      return;
    }

    setDuplicateExclusionSaving(true);
    setDuplicateExclusionError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/users/guest-report-duplicate-exclusions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            website,
            notes: duplicateExclusionNotes.trim(),
          }),
        }
      );
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to save excluded website");
      }

      const savedExclusion = result.data as GuestDuplicateExclusionEntry;
      setDuplicateExclusions((current) => {
        const next = current.filter(
          (entry) => entry.normalizedDomain !== savedExclusion.normalizedDomain
        );
        return [savedExclusion, ...next].sort((left, right) =>
          left.normalizedDomain.localeCompare(right.normalizedDomain)
        );
      });
      setDuplicateGroups((current) =>
        current.map((group) =>
          group.normalizedDomain === savedExclusion.normalizedDomain
            ? { ...group, isExcluded: true }
            : group
        )
      );
      closeDuplicateExclusionModal();
    } catch (saveError) {
      console.error("Failed to save duplicate exclusion", saveError);
      setDuplicateExclusionError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save excluded website"
      );
    } finally {
      setDuplicateExclusionSaving(false);
    }
  }

  async function removeDuplicateExclusion(exclusionId: string) {
    setDuplicateExclusionError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/users/guest-report-duplicate-exclusions/${exclusionId}`,
        {
          method: "DELETE",
        }
      );
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to remove excluded website");
      }

      setDuplicateExclusions((current) => {
        const removedEntry = current.find((entry) => entry.id === exclusionId);
        const next = current.filter((entry) => entry.id !== exclusionId);

        if (removedEntry) {
          setDuplicateGroups((groups) =>
            groups.map((group) =>
              group.normalizedDomain === removedEntry.normalizedDomain
                ? { ...group, isExcluded: false }
                : group
            )
          );
        }

        return next;
      });
    } catch (removeError) {
      console.error("Failed to remove duplicate exclusion", removeError);
      setDuplicateExclusionError(
        removeError instanceof Error
          ? removeError.message
          : "Failed to remove excluded website"
      );
    }
  }

  async function fetchTrackingDetailsById(reportId: string) {
    const response = await fetch(
      `${API_BASE_URL}/api/users/guest-users/${reportId}/tracking`
    );
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Failed to fetch guest tracking details");
    }

    return result.data as GuestTrackingDetails;
  }

  async function openTrackingModal(report: GuestReportEntry) {
    setSelectedReport(report);
    setTrackingDetails(null);
    setTrackingError(null);
    setTrackingLoading(true);

    try {
      const details = await fetchTrackingDetailsById(report.id);
      setTrackingDetails(details);
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

  function openFeedbackModal() {
    setFeedbackModalOpen(true);
  }

  function closeFeedbackModal() {
    setFeedbackModalOpen(false);
  }

  function toggleDuplicateDetails(group: GuestDuplicateAuditGroup) {
    const key = getDuplicateAuditKey(group);
    setExpandedDuplicateKeys((current) =>
      current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key]
    );
  }

  async function handleExport(format: "csv" | "xlsx") {
    if (filteredReports.length === 0 || exportingFormat) {
      return;
    }

    setExportingFormat(format);
    setExportError(null);

    try {
      const exportRows: Array<Record<string, string | number>> = [];

      for (const report of filteredReports) {
        const details = await fetchTrackingDetailsById(report.id);
        exportRows.push(buildExportRow(report, details));
      }

      const dateTag = new Date().toISOString().slice(0, 10);
      const fileBaseName = `guest-users-tracking-${dateTag}`;

      if (format === "csv") {
        downloadCsv(`${fileBaseName}.csv`, exportRows);
      } else {
        downloadXlsx(`${fileBaseName}.xlsx`, exportRows);
      }
    } catch (fetchError) {
      console.error("Failed to export guest tracking details", fetchError);
      setExportError(
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to export guest tracking details"
      );
    } finally {
      setExportingFormat(null);
    }
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
            title="Feedback"
            value={feedbackLoading ? "..." : String(totalFeedback)}
            caption="Guest feedback submissions captured from the preview and unlock flow."
            accentClassName="bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300"
            onClick={openFeedbackModal}
          />
          <SummaryCard
            title="Duplicate Audits"
            value={duplicateLoading ? "..." : String(totalDuplicateGroups)}
            caption={
              duplicateLoading
                ? "Checking repeated same-domain report activity."
                : `${totalDuplicateAttempts} repeated attempts grouped by normalized domain + report type.`
            }
            accentClassName="bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
          />
          <SummaryCard
            title="Latest Report Date"
            value={formatDate(latestReportDate)}
            caption="Most recent report date based on the guest_report feed ordering."
            accentClassName="bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
          />
        </div>

        <ComponentCard
          title="Duplicate Guest Sample Audit"
          desc="Audit repeated free sample activity by normalized domain and report type, then expand a row to inspect every historical attempt."
          headerAction={
            <button
              type="button"
              onClick={() => setIsDuplicateAuditExpanded((current) => !current)}
              className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
            >
              {isDuplicateAuditExpanded ? "Collapse" : "Expand"}
            </button>
          }
        >
          {!isDuplicateAuditExpanded ? (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-600 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-gray-300">
              Expand this section to view the table with columns Domain, Report Type, Attempts, Visitor Signals, Latest Attempt, and Action.
            </div>
          ) : null}

          {isDuplicateAuditExpanded ? (
            <>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-center">
            <ProductSearchBar
              id="duplicate-guest-search"
              label="Filter duplicate domains"
              value={duplicateDomainFilter}
              onChange={setDuplicateDomainFilter}
              placeholder="Search normalized domain"
            />

            <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <span>Report type</span>
              <select
                value={duplicateReportTypeFilter}
                onChange={(event) => setDuplicateReportTypeFilter(event.target.value)}
                className="h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm text-gray-800 outline-none transition focus:border-sky-400 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white"
              >
                <option value="">All report types</option>
                <option value="SEO_HEALTH">SEO Health</option>
                <option value="AI_VISIBILITY">AI Analysis</option>
                <option value="COMPETITOR_COMPARISON">Competitor Comparison</option>
              </select>
            </label>

            <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
              Same-domain repeats only. No new rows are created from this admin audit view.
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200">
            <div>
              Excluded websites bypass the guest sample repeat lock in `seo-health`, `ai-analysis`, and `compare-competitors`.
            </div>
            <button
              type="button"
              onClick={() => openDuplicateExclusionModal(duplicateDomainFilter.trim())}
              className="rounded-full border border-sky-200 bg-white px-4 py-2 text-xs font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 dark:border-sky-400/30 dark:bg-sky-500/10 dark:text-sky-200"
            >
              Exclude Website
            </button>
          </div>

          {duplicateError ? (
            <div className="rounded-2xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300">
              {duplicateError}
            </div>
          ) : null}

          {duplicateLoading ? (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-600 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-gray-300">
              Loading duplicate guest sample audit...
            </div>
          ) : null}

          {!duplicateLoading && !duplicateError && duplicateGroups.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-600 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-gray-300">
              No duplicate guest sample groups matched the current filters.
            </div>
          ) : null}

          {!duplicateLoading && !duplicateError && duplicateGroups.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
              <div className="max-w-full overflow-x-auto">
                <Table>
                  <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                    <TableRow>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Domain
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Report Type
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Attempts
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Visitor Signals
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Latest Attempt
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Action
                      </TableCell>
                    </TableRow>
                  </TableHeader>

                  <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                    {duplicateGroups.map((group) => {
                      const isExpanded = expandedDuplicateKeys.includes(
                        getDuplicateAuditKey(group)
                      );

                      return (
                        <Fragment key={getDuplicateAuditKey(group)}>
                          <TableRow key={getDuplicateAuditKey(group)}>
                            <TableCell className="px-5 py-4 text-start">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                                    {group.normalizedDomain}
                                  </div>
                                  {group.isExcluded ? (
                                    <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                                      Excluded
                                    </span>
                                  ) : null}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  First seen {formatDateTime(group.firstGeneratedAt)}
                                </div>
                              </div>
                            </TableCell>

                            <TableCell className="px-5 py-4">
                              <span
                                className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getReportTypeClasses(
                                  group.reportTypeLabel
                                )}`}
                              >
                                {group.reportTypeLabel}
                              </span>
                            </TableCell>

                            <TableCell className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                              <div className="font-semibold text-gray-900 dark:text-white">
                                {group.totalAttempts}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                guest sample rows
                              </div>
                            </TableCell>

                            <TableCell className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                              <div>Visitors: {group.uniqueAnonymousVisitors}</div>
                              <div>Sessions: {group.uniqueSessions}</div>
                              <div>IP hashes: {group.uniqueIpHashes}</div>
                            </TableCell>

                            <TableCell className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                              {formatDateTime(group.latestGeneratedAt)}
                            </TableCell>

                            <TableCell className="px-5 py-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleDuplicateDetails(group)}
                                  className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
                                >
                                  {isExpanded ? "Hide Attempts" : "View Attempts"}
                                </button>
                                {!group.isExcluded ? (
                                  <button
                                    type="button"
                                    onClick={() => openDuplicateExclusionModal(group.normalizedDomain)}
                                    className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300"
                                  >
                                    Exclude
                                  </button>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>

                          {isExpanded ? (
                            <TableRow>
                              <TableCell colSpan={6} className="px-5 py-5">
                                <div className="space-y-4">
                                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                                    <span>
                                      Showing {group.attempts.length} attempt
                                      {group.attempts.length === 1 ? "" : "s"}
                                    </span>
                                    <span>Latest: {formatDateTime(group.latestGeneratedAt)}</span>
                                  </div>

                                  <div className="grid gap-4 xl:grid-cols-2">
                                    {group.attempts.map((attempt, index) => (
                                      <div
                                        key={attempt.guestReportId || `${getDuplicateAuditKey(group)}-${index}`}
                                        className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/[0.06] dark:bg-white/[0.03]"
                                      >
                                        <div className="flex flex-col gap-3 border-b border-gray-200 pb-3 dark:border-white/[0.06] sm:flex-row sm:items-start sm:justify-between">
                                          <div>
                                            <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                              Attempt {index + 1}
                                            </p>
                                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                              Generated {formatDateTime(attempt.generatedAt)}
                                            </p>
                                          </div>
                                          <div className="text-xs text-gray-500 dark:text-gray-400">
                                            Row ID: {attempt.guestReportId}
                                          </div>
                                        </div>

                                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                          <DetailItem label="Website" value={attempt.websiteUrl || attempt.website} />
                                          <DetailItem label="Source Tool" value={attempt.sourceTool} />
                                          <DetailItem label="Anonymous Visitor ID" value={attempt.anonymousVisitorId} />
                                          <DetailItem label="Session ID" value={attempt.sessionId} />
                                          <DetailItem label="IP Hash" value={attempt.ipHash} />
                                          <DetailItem
                                            label="Device"
                                            value={[attempt.deviceType, attempt.browser, attempt.os].filter(Boolean).join(" | ") || "-"}
                                          />
                                          <DetailItem
                                            label="UTM"
                                            value={[attempt.utmSource, attempt.utmMedium, attempt.utmCampaign].filter(Boolean).join(" | ") || "-"}
                                          />
                                          <DetailItem label="Referrer" value={attempt.referrer} />
                                          <DetailItem label="Landing Page" value={attempt.landingPageUrl} />
                                          <DetailItem label="Current URL" value={attempt.currentUrl} />
                                          <DetailItem label="Created At" value={formatDateTime(attempt.createdAt)} />
                                          <DetailItem label="Generated At" value={formatDateTime(attempt.generatedAt)} />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
            </>
          ) : null}
        </ComponentCard>

        <ComponentCard
          title="Guest Users"
          desc="Guest activity records from the user_portal PostgreSQL guest_report table."
          headerAction={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => void handleExport("csv")}
                disabled={filteredReports.length === 0 || exportingFormat !== null}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
              >
                {exportingFormat === "csv" ? "Exporting CSV..." : "Export CSV"}
              </button>
              <button
                type="button"
                onClick={() => void handleExport("xlsx")}
                disabled={filteredReports.length === 0 || exportingFormat !== null}
                className="rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-xs font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300"
              >
                {exportingFormat === "xlsx" ? "Exporting XLSX..." : "Export XLSX"}
              </button>
            </div>
          }
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

          {exportError ? (
            <div className="rounded-2xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300">
              {exportError}
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
                      <TableRow
                        key={report.id}
                        className={getReportRowClasses(report.hasSuccessfulPayment)}
                      >
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
                              {getWebsitePreview(report.website)}
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
                  {FUNNEL_STATUS_ITEMS.map((item) => (
                    <FunnelBadge key={item.key} label={item.label} active={trackingDetails.funnel[item.key]} />
                  ))}
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

      <Modal isOpen={duplicateExclusionModalOpen} onClose={closeDuplicateExclusionModal} className="max-w-[980px] m-4">
        <div className="max-h-[85vh] overflow-y-auto rounded-3xl bg-white p-6 dark:bg-gray-900 md:p-8">
          <div className="space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-300">
                Duplicate Audit Exclusions
              </p>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                Exclude websites from guest sample repeat lock
              </h2>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Added websites can generate fresh sample previews again in SEO Health, AI Analysis, and Compare Competitors.
              </p>
            </div>

            <div className="grid gap-4 rounded-3xl border border-gray-200 bg-gray-50 p-5 dark:border-white/[0.08] dark:bg-white/[0.03]">
              <label className="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <span>Website or domain</span>
                <input
                  type="text"
                  value={duplicateExclusionWebsite}
                  onChange={(event) => setDuplicateExclusionWebsite(event.target.value)}
                  placeholder="example.com or https://example.com/path"
                  className="h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm text-gray-800 outline-none transition focus:border-sky-400 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-white"
                />
              </label>

              <label className="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <span>Notes (optional)</span>
                <textarea
                  value={duplicateExclusionNotes}
                  onChange={(event) => setDuplicateExclusionNotes(event.target.value)}
                  placeholder="Why this website should bypass the duplicate preview lock"
                  rows={3}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-none transition focus:border-sky-400 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-white"
                />
              </label>

              {duplicateExclusionError ? (
                <div className="rounded-2xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300">
                  {duplicateExclusionError}
                </div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={closeDuplicateExclusionModal}
                  className="rounded-full border border-gray-200 px-5 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 dark:border-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.03]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void saveDuplicateExclusion()}
                  disabled={duplicateExclusionSaving}
                  className="rounded-full border border-sky-200 bg-sky-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-400/20"
                >
                  {duplicateExclusionSaving ? "Saving..." : "Save Exclusion"}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Current excluded websites
                </h3>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {duplicateExclusions.length} total
                </div>
              </div>

              {duplicateExclusionLoading ? (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-600 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-gray-300">
                  Loading excluded websites...
                </div>
              ) : null}

              {!duplicateExclusionLoading && duplicateExclusions.length === 0 ? (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-600 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-gray-300">
                  No excluded websites yet.
                </div>
              ) : null}

              {!duplicateExclusionLoading && duplicateExclusions.length > 0 ? (
                <div className="space-y-3">
                  {duplicateExclusions.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-4 dark:border-white/[0.06] dark:bg-white/[0.02] sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-gray-900 dark:text-white">
                          {entry.normalizedDomain}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Input: {entry.websiteInput}
                        </div>
                        {entry.notes ? (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Notes: {entry.notes}
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => void removeDuplicateExclusion(entry.id)}
                        className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </Modal>

      <Modal isOpen={feedbackModalOpen} onClose={closeFeedbackModal} className="max-w-[1240px] m-4">
        <div className="max-h-[85vh] overflow-y-auto rounded-3xl bg-white p-6 dark:bg-gray-900 md:p-8">
          <div className="flex flex-col gap-3 border-b border-gray-200 pb-5 dark:border-white/[0.06] sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-300">
                Guest Feedback
              </p>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                Preview and unlock feedback log
              </h2>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Review what guest users found useful and what stopped them from unlocking the full report.
              </p>
            </div>
            <div className="rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300">
              {feedbackLoading ? "Loading..." : `${totalFeedback} feedback item${totalFeedback === 1 ? "" : "s"}`}
            </div>
          </div>

          {feedbackError ? (
            <div className="mt-6 rounded-2xl border border-error-200 bg-error-50 px-5 py-4 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300">
              {feedbackError}
            </div>
          ) : null}

          {feedbackLoading ? (
            <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-600 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-gray-300">
              Loading feedback...
            </div>
          ) : null}

          {!feedbackLoading && !feedbackError && feedback.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-600 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-gray-300">
              No guest feedback has been submitted yet.
            </div>
          ) : null}

          {!feedbackLoading && !feedbackError && feedback.length > 0 ? (
            <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.06]">
              <div className="max-w-full overflow-x-auto">
                <Table>
                  <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                    <TableRow>
                      <TableCell isHeader className="px-4 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Date
                      </TableCell>
                      <TableCell isHeader className="px-4 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Website / Report
                      </TableCell>
                      <TableCell isHeader className="px-4 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Useful?
                      </TableCell>
                      <TableCell isHeader className="px-4 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Unlock blocker
                      </TableCell>
                      <TableCell isHeader className="px-4 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Message
                      </TableCell>
                      <TableCell isHeader className="px-4 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Contact
                      </TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                    {feedback.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                          {formatDateTime(entry.createdAt)}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                          <div className="space-y-1">
                            <div className="font-medium text-gray-900 dark:text-white">
                              {entry.normalizedDomain || entry.websiteUrl || "Anonymous guest"}
                            </div>
                            <div>
                              {entry.reportType || entry.sourceTool || "-"}
                            </div>
                            {entry.guestReportId ? (
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                Report ID: {entry.guestReportId}
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                          {entry.previewUsefulness || "-"}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                          {entry.unlockBlocker || "-"}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                          <div className="max-w-[320px] whitespace-pre-wrap break-words">
                            {entry.optionalMessage || "-"}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                          <div className="space-y-1">
                            <div>{entry.contactValue || "-"}</div>
                            {(entry.businessType || entry.businessCategory || entry.brandName || entry.targetCountry) ? (
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {[entry.brandName, entry.businessType, entry.businessCategory, entry.targetCountry]
                                  .filter(Boolean)
                                  .join(" | ")}
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={closeFeedbackModal}
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
