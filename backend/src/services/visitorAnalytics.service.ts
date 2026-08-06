import { queryAnalytics } from "./analyticsPostgres.service";
import { getUserPortalPool } from "./userPortalUsers.service";

type AnalyticsRow = Record<string, unknown>;

type PortalFilter = "user_portal" | "vendor_portal" | "all";
type SortDirection = "asc" | "desc";

type VisitorsFilterInput = {
  page?: string | null;
  limit?: string | null;
  portal?: string | null;
  visitorType?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  device?: string | null;
  browser?: string | null;
  search?: string | null;
  pagePath?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmCampaign?: string | null;
  botStatus?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  sortBy?: string | null;
  sortDirection?: string | null;
  format?: string | null;
};

type ParsedVisitorsFilters = {
  page: number;
  limit: number;
  offset: number;
  portal: PortalFilter;
  visitorType: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  device: string | null;
  browser: string | null;
  search: string | null;
  pagePath: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  botStatus: string | null;
  startDate: string | null;
  endDate: string | null;
  sortBy: string;
  sortDirection: SortDirection;
  format: "json" | "csv";
};

const DEFAULT_TIMEZONE = process.env.VISITOR_ANALYTICS_TIMEZONE || "Asia/Kolkata";
const LIVE_WINDOW_MINUTES = Number.parseInt(process.env.LIVE_VISITOR_WINDOW_MINUTES || "5", 10) || 5;

function toPositiveInteger(value: string | null | undefined, fallback: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(1, parsed));
}

function normalizeText(value: string | null | undefined, maxLength = 255) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizePortal(value: string | null | undefined): PortalFilter {
  if (value === "user_portal" || value === "vendor_portal") {
    return value;
  }

  return "all";
}

function normalizeSortDirection(value: string | null | undefined): SortDirection {
  return String(value ?? "").toLowerCase() === "asc" ? "asc" : "desc";
}

function normalizeDate(value: string | null | undefined) {
  const normalized = normalizeText(value, 32);
  if (!normalized) {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function normalizeLocationPart(value: unknown) {
  const normalized = normalizeText(typeof value === "string" ? value : value == null ? undefined : String(value), 120);
  if (!normalized || normalized.toLowerCase() === "unknown") {
    return null;
  }

  return normalized;
}

function formatLocationLabel(city: unknown, region: unknown, country: unknown) {
  const parts = [
    normalizeLocationPart(city),
    normalizeLocationPart(region),
    normalizeLocationPart(country),
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "Unknown";
}

function getDatePartsInTimezone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return { year, month, day };
}

function shiftDateString(dateString: string, days: number) {
  const base = new Date(`${dateString}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function getCurrentTimezoneDate(timeZone = DEFAULT_TIMEZONE) {
  const parts = getDatePartsInTimezone(new Date(), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getRelativeDateRange(period: "today" | "last7", timeZone = DEFAULT_TIMEZONE) {
  const today = getCurrentTimezoneDate(timeZone);
  if (period === "today") {
    return {
      startDate: today,
      endDate: today,
    };
  }

  return {
    startDate: shiftDateString(today, -6),
    endDate: today,
  };
}

function getLastNDaysRange(days: number, timeZone = DEFAULT_TIMEZONE) {
  const today = getCurrentTimezoneDate(timeZone);
  return {
    startDate: shiftDateString(today, -(Math.max(1, days) - 1)),
    endDate: today,
  };
}

function parseVisitorsFilters(input: VisitorsFilterInput): ParsedVisitorsFilters {
  const page = toPositiveInteger(input.page, 1, 5000);
  const limit = toPositiveInteger(input.limit, 25, 200);
  const defaultRange = getRelativeDateRange("last7");
  const startDate = normalizeDate(input.startDate) ?? defaultRange.startDate;
  const endDate = normalizeDate(input.endDate) ?? defaultRange.endDate;

  return {
    page,
    limit,
    offset: (page - 1) * limit,
    portal: normalizePortal(input.portal),
    visitorType: normalizeText(input.visitorType, 32),
    country: normalizeText(input.country, 120),
    region: normalizeText(input.region, 120),
    city: normalizeText(input.city, 120),
    device: normalizeText(input.device, 64),
    browser: normalizeText(input.browser, 120),
    search: normalizeText(input.search, 160),
    pagePath: normalizeText(input.pagePath, 255),
    referrer: normalizeText(input.referrer, 255),
    utmSource: normalizeText(input.utmSource, 160),
    utmCampaign: normalizeText(input.utmCampaign, 160),
    botStatus: normalizeText(input.botStatus, 32),
    startDate,
    endDate,
    sortBy: normalizeText(input.sortBy, 64) ?? "last_seen",
    sortDirection: normalizeSortDirection(input.sortDirection),
    format: String(input.format ?? "").toLowerCase() === "csv" ? "csv" : "json",
  };
}

function parseDownloadAnalyticsRange(input: Pick<VisitorsFilterInput, "startDate" | "endDate">) {
  const defaultRange = getLastNDaysRange(30);
  const startDate = normalizeDate(input.startDate) ?? defaultRange.startDate;
  const endDate = normalizeDate(input.endDate) ?? defaultRange.endDate;

  return { startDate, endDate };
}

const B2B_LEAD_ZONE_PROJECT_KEY = "b2b-lead-zone";
const B2B_LEAD_ZONE_ROUTE = "/guest/map-scraper";
const B2B_TABLE_PAGE_SIZE = 10;
const B2B_FILTER_OPTION_LIMIT = 50;

const B2B_UNAVAILABLE_EVENT_KEYS = new Set([
  "failed_link_request",
  "app_first_open",
  "first_extraction",
  "free_limit_reached",
  "plans_opened",
  "checkout_started",
  "payment_completed",
]);

type B2BActionType =
  | "all"
  | "landing_view"
  | "mobile_landing_view"
  | "valid_windows_download"
  | "mobile_exe_download"
  | "other_non_windows_download"
  | "unknown_device_download"
  | "email_link_request"
  | "link_shared"
  | "link_copied"
  | "failed_link_request"
  | "app_first_open"
  | "first_extraction"
  | "free_limit_reached"
  | "plans_opened"
  | "checkout_started"
  | "payment_completed";

type ParsedB2BLeadZoneFilters = {
  startDate: string;
  endDate: string;
  device: string | null;
  operatingSystem: string | null;
  browser: string | null;
  country: string | null;
  city: string | null;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  actionType: B2BActionType;
  recentMobileActionsPage: number;
  recentDownloadsPage: number;
};

type QueryFilterClause = {
  whereClause: string;
  values: unknown[];
};

export function normalizeB2BOperatingSystem(value: string | null | undefined) {
  const normalized = normalizeText(value, 120);
  if (!normalized) {
    return "Other / Unknown";
  }

  if (/^windows/i.test(normalized)) return "Windows";
  if (/^android/i.test(normalized)) return "Android";
  if (/^ios/i.test(normalized) || /^ipad/i.test(normalized)) return "iOS / iPadOS";
  if (/^mac/i.test(normalized)) return "macOS";
  if (/^linux/i.test(normalized)) return "Linux";

  return "Other / Unknown";
}

export function normalizeB2BBrowser(value: string | null | undefined) {
  const normalized = normalizeText(value, 120);
  if (!normalized) {
    return "Other / Unknown";
  }

  if (/instagram/i.test(normalized)) return "Instagram in-app browser";
  if (/facebook/i.test(normalized)) return "Facebook in-app browser";
  if (/edge/i.test(normalized)) return "Edge";
  if (/chrome/i.test(normalized)) return "Chrome";
  if (/safari/i.test(normalized)) return "Safari";
  if (/firefox/i.test(normalized)) return "Firefox";

  return "Other / Unknown";
}

export function classifyB2BDeviceSegment(
  deviceCategory: string | null | undefined,
  operatingSystem: string | null | undefined
) {
  const normalizedDevice = normalizeText(deviceCategory, 32)?.toLowerCase() ?? "unknown";
  const normalizedOs = normalizeB2BOperatingSystem(operatingSystem);

  if (normalizedDevice === "desktop" && normalizedOs === "Windows") return "Windows desktop";
  if (normalizedOs === "Android") return "Android";
  if (normalizedOs === "iOS / iPadOS") return "iPhone/iPad";
  if (normalizedOs === "macOS") return "macOS";
  if (normalizedOs === "Linux") return "Linux";

  return "Other / Unknown";
}

export function classifyB2BDownload(
  deviceCategory: string | null | undefined,
  operatingSystem: string | null | undefined
) {
  const normalizedDevice = normalizeText(deviceCategory, 32)?.toLowerCase() ?? "unknown";
  const normalizedOs = normalizeB2BOperatingSystem(operatingSystem);

  if (normalizedDevice === "desktop" && normalizedOs === "Windows") {
    return "Valid Windows download";
  }

  if (normalizedDevice === "mobile" || normalizedDevice === "tablet") {
    return "Mobile .exe download";
  }

  if (normalizedDevice === "desktop") {
    return "Other non-Windows download";
  }

  return "Unknown device";
}

export function calculateSafeRate(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }

  return (numerator / denominator) * 100;
}

function isMobileDevice(deviceCategory: string | null | undefined) {
  const normalized = normalizeText(deviceCategory, 32)?.toLowerCase();
  return normalized === "mobile" || normalized === "tablet";
}

function getAcquisitionSourceLabel(utmSource: unknown, referrer: unknown) {
  const normalizedSource = normalizeText(typeof utmSource === "string" ? utmSource : utmSource == null ? undefined : String(utmSource), 160);
  if (normalizedSource) {
    return normalizedSource;
  }

  const normalizedReferrer = normalizeText(typeof referrer === "string" ? referrer : referrer == null ? undefined : String(referrer), 255);
  if (!normalizedReferrer) {
    return "Direct / Unknown";
  }

  const match = normalizedReferrer.match(/^https?:\/\/([^/?#]+)/i);
  if (match?.[1]) {
    return match[1].toLowerCase();
  }

  return normalizedReferrer;
}

function formatCampaignLabel(source: unknown, medium: unknown, campaign: unknown) {
  const normalizedSource = normalizeText(typeof source === "string" ? source : source == null ? undefined : String(source), 160) ?? "Direct / Unknown";
  const normalizedMedium = normalizeText(typeof medium === "string" ? medium : medium == null ? undefined : String(medium), 160) ?? "Unknown";
  const normalizedCampaign = normalizeText(typeof campaign === "string" ? campaign : campaign == null ? undefined : String(campaign), 160) ?? "Unknown";

  return `${normalizedSource} / ${normalizedMedium} / ${normalizedCampaign}`;
}

function normalizeActionType(value: string | null | undefined): B2BActionType {
  const normalized = normalizeText(value, 64)?.toLowerCase() ?? "all";
  const allowed: B2BActionType[] = [
    "all",
    "landing_view",
    "mobile_landing_view",
    "valid_windows_download",
    "mobile_exe_download",
    "other_non_windows_download",
    "unknown_device_download",
    "email_link_request",
    "link_shared",
    "link_copied",
    "failed_link_request",
    "app_first_open",
    "first_extraction",
    "free_limit_reached",
    "plans_opened",
    "checkout_started",
    "payment_completed",
  ];

  return allowed.includes(normalized as B2BActionType) ? (normalized as B2BActionType) : "all";
}

function parseB2BLeadZoneFilters(input: VisitorsFilterInput): ParsedB2BLeadZoneFilters {
  const range = parseDownloadAnalyticsRange(input);

  return {
    ...range,
    device: normalizeText(input.device, 32),
    operatingSystem: normalizeText((input as Record<string, string | null | undefined>).operatingSystem, 120),
    browser: normalizeText(input.browser, 120),
    country: normalizeText(input.country, 120),
    city: normalizeText(input.city, 120),
    source: normalizeText((input as Record<string, string | null | undefined>).source, 160),
    medium: normalizeText((input as Record<string, string | null | undefined>).medium, 160),
    campaign: normalizeText((input as Record<string, string | null | undefined>).campaign, 160),
    actionType: normalizeActionType((input as Record<string, string | null | undefined>).actionType),
    recentMobileActionsPage: toPositiveInteger(
      (input as Record<string, string | null | undefined>).recentMobileActionsPage,
      1,
      500
    ),
    recentDownloadsPage: toPositiveInteger(
      (input as Record<string, string | null | undefined>).recentDownloadsPage,
      1,
      500
    ),
  };
}

function buildB2BLandingFilterClause(filters: ParsedB2BLeadZoneFilters): QueryFilterClause {
  const conditions = [
    `timezone($1, p.viewed_at)::date BETWEEN $2::date AND $3::date`,
    `p.portal = 'user_portal'`,
    `COALESCE(p.route_template, p.path, '') = $4`,
    `s.is_bot = FALSE`,
  ];
  const values: unknown[] = [DEFAULT_TIMEZONE, filters.startDate, filters.endDate, B2B_LEAD_ZONE_ROUTE];

  const push = (condition: string, value: unknown) => {
    values.push(value);
    conditions.push(condition.replace("?", `$${values.length}`));
  };

  if (filters.device) {
    if (filters.device === "unknown") {
      conditions.push(`COALESCE(NULLIF(LOWER(s.device_category), ''), 'unknown') = 'unknown'`);
    } else if (filters.device === "mobile_or_tablet") {
      conditions.push(`COALESCE(LOWER(s.device_category), '') IN ('mobile', 'tablet')`);
    } else {
      push(`COALESCE(LOWER(s.device_category), 'unknown') = ?`, filters.device.toLowerCase());
    }
  }

  if (filters.operatingSystem) {
    push(
      `CASE
        WHEN COALESCE(s.operating_system, '') ILIKE 'windows%%' THEN 'Windows'
        WHEN COALESCE(s.operating_system, '') ILIKE 'android%%' THEN 'Android'
        WHEN COALESCE(s.operating_system, '') ILIKE 'ios%%' OR COALESCE(s.operating_system, '') ILIKE 'ipad%%' THEN 'iOS / iPadOS'
        WHEN COALESCE(s.operating_system, '') ILIKE 'mac%%' THEN 'macOS'
        WHEN COALESCE(s.operating_system, '') ILIKE 'linux%%' THEN 'Linux'
        ELSE 'Other / Unknown'
      END = ?`,
      filters.operatingSystem
    );
  }

  if (filters.browser) {
    push(
      `CASE
        WHEN COALESCE(s.browser, '') ILIKE '%%instagram%%' THEN 'Instagram in-app browser'
        WHEN COALESCE(s.browser, '') ILIKE '%%facebook%%' THEN 'Facebook in-app browser'
        WHEN COALESCE(s.browser, '') ILIKE '%%edge%%' THEN 'Edge'
        WHEN COALESCE(s.browser, '') ILIKE '%%chrome%%' THEN 'Chrome'
        WHEN COALESCE(s.browser, '') ILIKE '%%safari%%' THEN 'Safari'
        WHEN COALESCE(s.browser, '') ILIKE '%%firefox%%' THEN 'Firefox'
        ELSE 'Other / Unknown'
      END = ?`,
      filters.browser
    );
  }

  if (filters.country) push(`COALESCE(s.country_name, '') ILIKE ?`, `%${filters.country}%`);
  if (filters.city) push(`COALESCE(s.city, '') ILIKE ?`, `%${filters.city}%`);
  if (filters.source) {
    push(
      `COALESCE(NULLIF(s.utm_source, ''), NULLIF(REGEXP_REPLACE(COALESCE(s.referrer, ''), '^https?://([^/?#]+).*$', '\\1'), ''), 'Direct / Unknown') = ?`,
      filters.source
    );
  }
  if (filters.medium) push(`COALESCE(NULLIF(s.utm_medium, ''), 'Unknown') = ?`, filters.medium);
  if (filters.campaign) push(`COALESCE(NULLIF(s.utm_campaign, ''), 'Unknown') = ?`, filters.campaign);

  if (filters.actionType !== "all") {
    if (filters.actionType === "mobile_landing_view") {
      conditions.push(`COALESCE(LOWER(s.device_category), '') IN ('mobile', 'tablet')`);
    } else if (filters.actionType !== "landing_view") {
      conditions.push(`1 = 0`);
    }
  }

  return {
    whereClause: conditions.join(" AND "),
    values,
  };
}

function buildB2BDownloadFilterClause(filters: ParsedB2BLeadZoneFilters): QueryFilterClause {
  const conditions = [
    `timezone($1, d.created_at)::date BETWEEN $2::date AND $3::date`,
    `d.project_key = $4`,
    `d.is_bot = FALSE`,
  ];
  const values: unknown[] = [DEFAULT_TIMEZONE, filters.startDate, filters.endDate, B2B_LEAD_ZONE_PROJECT_KEY];

  const push = (condition: string, value: unknown) => {
    values.push(value);
    conditions.push(condition.replace("?", `$${values.length}`));
  };

  if (filters.device) {
    if (filters.device === "unknown") {
      conditions.push(`COALESCE(NULLIF(LOWER(d.device_category), ''), 'unknown') = 'unknown'`);
    } else if (filters.device === "mobile_or_tablet") {
      conditions.push(`COALESCE(LOWER(d.device_category), '') IN ('mobile', 'tablet')`);
    } else {
      push(`COALESCE(LOWER(d.device_category), 'unknown') = ?`, filters.device.toLowerCase());
    }
  }

  if (filters.operatingSystem) {
    push(
      `CASE
        WHEN COALESCE(d.operating_system, '') ILIKE 'windows%%' THEN 'Windows'
        WHEN COALESCE(d.operating_system, '') ILIKE 'android%%' THEN 'Android'
        WHEN COALESCE(d.operating_system, '') ILIKE 'ios%%' OR COALESCE(d.operating_system, '') ILIKE 'ipad%%' THEN 'iOS / iPadOS'
        WHEN COALESCE(d.operating_system, '') ILIKE 'mac%%' THEN 'macOS'
        WHEN COALESCE(d.operating_system, '') ILIKE 'linux%%' THEN 'Linux'
        ELSE 'Other / Unknown'
      END = ?`,
      filters.operatingSystem
    );
  }

  if (filters.browser) {
    push(
      `CASE
        WHEN COALESCE(d.browser, '') ILIKE '%%instagram%%' THEN 'Instagram in-app browser'
        WHEN COALESCE(d.browser, '') ILIKE '%%facebook%%' THEN 'Facebook in-app browser'
        WHEN COALESCE(d.browser, '') ILIKE '%%edge%%' THEN 'Edge'
        WHEN COALESCE(d.browser, '') ILIKE '%%chrome%%' THEN 'Chrome'
        WHEN COALESCE(d.browser, '') ILIKE '%%safari%%' THEN 'Safari'
        WHEN COALESCE(d.browser, '') ILIKE '%%firefox%%' THEN 'Firefox'
        ELSE 'Other / Unknown'
      END = ?`,
      filters.browser
    );
  }

  if (filters.country) push(`COALESCE(d.country_name, '') ILIKE ?`, `%${filters.country}%`);
  if (filters.city) push(`COALESCE(d.city, '') ILIKE ?`, `%${filters.city}%`);
  if (filters.source) {
    push(
      `COALESCE(NULLIF(d.utm_source, ''), NULLIF(REGEXP_REPLACE(COALESCE(d.referrer, ''), '^https?://([^/?#]+).*$', '\\1'), ''), 'Direct / Unknown') = ?`,
      filters.source
    );
  }
  if (filters.medium) push(`COALESCE(NULLIF(d.utm_medium, ''), 'Unknown') = ?`, filters.medium);
  if (filters.campaign) push(`COALESCE(NULLIF(d.utm_campaign, ''), 'Unknown') = ?`, filters.campaign);

  if (filters.actionType !== "all") {
    if (filters.actionType === "valid_windows_download") {
      conditions.push(`COALESCE(LOWER(d.device_category), '') = 'desktop'`);
      conditions.push(`COALESCE(d.operating_system, '') ILIKE 'windows%'`);
    } else if (filters.actionType === "mobile_exe_download") {
      conditions.push(`COALESCE(LOWER(d.device_category), '') IN ('mobile', 'tablet')`);
    } else if (filters.actionType === "other_non_windows_download") {
      conditions.push(`COALESCE(LOWER(d.device_category), '') = 'desktop'`);
      conditions.push(`COALESCE(d.operating_system, '') NOT ILIKE 'windows%'`);
    } else if (filters.actionType === "unknown_device_download") {
      conditions.push(`COALESCE(NULLIF(LOWER(d.device_category), ''), 'unknown') = 'unknown'`);
    } else if (filters.actionType === "landing_view" || filters.actionType === "mobile_landing_view" || B2B_UNAVAILABLE_EVENT_KEYS.has(filters.actionType)) {
      conditions.push(`1 = 0`);
    }
  }

  return {
    whereClause: conditions.join(" AND "),
    values,
  };
}

function buildB2BGuestEventFilterClause(filters: ParsedB2BLeadZoneFilters): QueryFilterClause {
  const conditions = [
    `timezone($1, e.created_at)::date BETWEEN $2::date AND $3::date`,
    `e.source_tool = 'guest_map_scraper'`,
    `e.event_name IN ('MapScraperWindowsLinkRequested', 'MapScraperDownloadLinkShared', 'MapScraperDownloadLinkCopied', 'MapScraperWindowsLinkRequestFailed')`,
  ];
  const values: unknown[] = [DEFAULT_TIMEZONE, filters.startDate, filters.endDate];

  const push = (condition: string, value: unknown) => {
    values.push(value);
    conditions.push(condition.replace("?", `$${values.length}`));
  };

  if (filters.device) {
    if (filters.device === "unknown") {
      conditions.push(`COALESCE(NULLIF(LOWER(e.device_type), ''), 'unknown') = 'unknown'`);
    } else if (filters.device === "mobile_or_tablet") {
      conditions.push(`COALESCE(LOWER(e.device_type), '') IN ('mobile', 'tablet')`);
    } else {
      push(`COALESCE(LOWER(e.device_type), 'unknown') = ?`, filters.device.toLowerCase());
    }
  }

  if (filters.operatingSystem) {
    push(
      `CASE
        WHEN COALESCE(e.os, '') ILIKE 'windows%%' THEN 'Windows'
        WHEN COALESCE(e.os, '') ILIKE 'android%%' THEN 'Android'
        WHEN COALESCE(e.os, '') ILIKE 'ios%%' OR COALESCE(e.os, '') ILIKE 'ipad%%' THEN 'iOS / iPadOS'
        WHEN COALESCE(e.os, '') ILIKE 'mac%%' THEN 'macOS'
        WHEN COALESCE(e.os, '') ILIKE 'linux%%' THEN 'Linux'
        ELSE 'Other / Unknown'
      END = ?`,
      filters.operatingSystem
    );
  }

  if (filters.browser) {
    push(
      `CASE
        WHEN COALESCE(e.browser, '') ILIKE '%%instagram%%' THEN 'Instagram in-app browser'
        WHEN COALESCE(e.browser, '') ILIKE '%%facebook%%' THEN 'Facebook in-app browser'
        WHEN COALESCE(e.browser, '') ILIKE '%%edge%%' THEN 'Edge'
        WHEN COALESCE(e.browser, '') ILIKE '%%chrome%%' THEN 'Chrome'
        WHEN COALESCE(e.browser, '') ILIKE '%%safari%%' THEN 'Safari'
        WHEN COALESCE(e.browser, '') ILIKE '%%firefox%%' THEN 'Firefox'
        ELSE 'Other / Unknown'
      END = ?`,
      filters.browser
    );
  }

  if (filters.source) push(`COALESCE(NULLIF(e.utm_source, ''), 'Direct / Unknown') = ?`, filters.source);
  if (filters.medium) push(`COALESCE(NULLIF(e.utm_medium, ''), 'Unknown') = ?`, filters.medium);
  if (filters.campaign) push(`COALESCE(NULLIF(e.utm_campaign, ''), 'Unknown') = ?`, filters.campaign);

  if (filters.country || filters.city) {
    conditions.push(`1 = 0`);
  }

  if (filters.actionType !== "all") {
    if (filters.actionType === "email_link_request") {
      conditions.push(`e.event_name = 'MapScraperWindowsLinkRequested'`);
    } else if (filters.actionType === "link_shared") {
      conditions.push(`e.event_name = 'MapScraperDownloadLinkShared'`);
    } else if (filters.actionType === "link_copied") {
      conditions.push(`e.event_name = 'MapScraperDownloadLinkCopied'`);
    } else if (filters.actionType === "failed_link_request") {
      conditions.push(`e.event_name = 'MapScraperWindowsLinkRequestFailed'`);
    } else if (
      filters.actionType === "landing_view" ||
      filters.actionType === "mobile_landing_view" ||
      filters.actionType === "valid_windows_download" ||
      filters.actionType === "mobile_exe_download" ||
      filters.actionType === "other_non_windows_download" ||
      filters.actionType === "unknown_device_download" ||
      B2B_UNAVAILABLE_EVENT_KEYS.has(filters.actionType)
    ) {
      conditions.push(`1 = 0`);
    }
  }

  return {
    whereClause: conditions.join(" AND "),
    values,
  };
}

function buildB2BAppEventFilterClause(filters: ParsedB2BLeadZoneFilters): QueryFilterClause {
  const conditions = [
    `timezone($1, e.created_at)::date BETWEEN $2::date AND $3::date`,
    `e.source_tool = 'b2b_lead_zone_app'`,
    `e.event_name IN ('B2BLeadZoneAppFirstOpen', 'B2BLeadZoneFirstExtractionCompleted', 'B2BLeadZoneFree30LimitReached', 'B2BLeadZonePlansOpened', 'B2BLeadZoneCheckoutStarted', 'B2BLeadZonePaymentCompleted')`,
  ];
  const values: unknown[] = [DEFAULT_TIMEZONE, filters.startDate, filters.endDate];

  if (filters.actionType !== "all") {
    if (filters.actionType === "app_first_open") {
      conditions.push(`e.event_name = 'B2BLeadZoneAppFirstOpen'`);
    } else if (filters.actionType === "first_extraction") {
      conditions.push(`e.event_name = 'B2BLeadZoneFirstExtractionCompleted'`);
    } else if (filters.actionType === "free_limit_reached") {
      conditions.push(`e.event_name = 'B2BLeadZoneFree30LimitReached'`);
    } else if (filters.actionType === "plans_opened") {
      conditions.push(`e.event_name = 'B2BLeadZonePlansOpened'`);
    } else if (filters.actionType === "checkout_started") {
      conditions.push(`e.event_name = 'B2BLeadZoneCheckoutStarted'`);
    } else if (filters.actionType === "payment_completed") {
      conditions.push(`e.event_name = 'B2BLeadZonePaymentCompleted'`);
    } else {
      conditions.push(`1 = 0`);
    }
  }

  return {
    whereClause: conditions.join(" AND "),
    values,
  };
}

function buildSessionFilterClause(filters: ParsedVisitorsFilters) {
  const conditions = [
    `timezone($1, s.last_activity_at)::date BETWEEN $2::date AND $3::date`,
  ];
  const values: unknown[] = [DEFAULT_TIMEZONE, filters.startDate, filters.endDate];

  const push = (condition: string, value: unknown) => {
    values.push(value);
    conditions.push(condition.replace("?", `$${values.length}`));
  };

  if (filters.portal !== "all") {
    push(`s.portal = ?`, filters.portal);
  }
  if (filters.visitorType && filters.visitorType !== "all") {
    push(`s.visitor_type = ?`, filters.visitorType);
  }
  if (filters.country) push(`COALESCE(s.country_name, '') ILIKE ?`, `%${filters.country}%`);
  if (filters.region) push(`COALESCE(s.region, '') ILIKE ?`, `%${filters.region}%`);
  if (filters.city) push(`COALESCE(s.city, '') ILIKE ?`, `%${filters.city}%`);
  if (filters.device) push(`COALESCE(s.device_category, '') ILIKE ?`, `%${filters.device}%`);
  if (filters.browser) push(`COALESCE(s.browser, '') ILIKE ?`, `%${filters.browser}%`);
  if (filters.referrer) push(`COALESCE(s.referrer, '') ILIKE ?`, `%${filters.referrer}%`);
  if (filters.utmSource) push(`COALESCE(s.utm_source, '') ILIKE ?`, `%${filters.utmSource}%`);
  if (filters.utmCampaign) push(`COALESCE(s.utm_campaign, '') ILIKE ?`, `%${filters.utmCampaign}%`);
  if (filters.botStatus === "bots_only") {
    conditions.push(`s.is_bot = TRUE`);
  } else {
    conditions.push(`s.is_bot = FALSE`);
  }

  return {
    whereClause: conditions.join(" AND "),
    values,
  };
}

export async function getVisitorAnalyticsSummary() {
  const todayRange = getRelativeDateRange("today");
  const last7Range = getRelativeDateRange("last7");
  const liveWindow = `${LIVE_WINDOW_MINUTES} minutes`;

  const [summaryResult, dailyVisitorsResult, dailyPageViewsResult, portalSplitResult, deviceResult, countriesResult, citiesResult, pagesResult, referrersResult, utmResult] =
    await Promise.all([
      queryAnalytics(
        `
          WITH sessions_today AS (
            SELECT *
            FROM analytics_visitor_sessions
            WHERE is_bot = FALSE
              AND timezone($1, last_activity_at)::date = $2::date
          ),
          sessions_last7 AS (
            SELECT *
            FROM analytics_visitor_sessions
            WHERE is_bot = FALSE
              AND timezone($1, last_activity_at)::date BETWEEN $3::date AND $4::date
          )
          SELECT
            (SELECT COUNT(*) FROM analytics_visitor_sessions WHERE is_bot = FALSE AND last_activity_at >= NOW() - $5::interval) AS live_visitors_now,
            (SELECT COUNT(DISTINCT anonymous_visitor_id) FROM sessions_today) AS unique_visitors_today,
            (SELECT COUNT(*) FROM sessions_today) AS sessions_today,
            (SELECT COALESCE(SUM(page_view_count), 0) FROM sessions_today) AS page_views_today,
            (SELECT COUNT(DISTINCT anonymous_visitor_id) FROM sessions_last7) AS unique_visitors_last7,
            (SELECT COUNT(*) FROM analytics_visitors v WHERE v.is_bot = FALSE AND timezone($1, v.first_seen_at)::date = $2::date) AS new_visitors_today,
            (SELECT COUNT(*) FROM analytics_visitors v WHERE v.is_bot = FALSE AND timezone($1, v.first_seen_at)::date < $2::date AND EXISTS (
              SELECT 1 FROM sessions_today st WHERE st.anonymous_visitor_id = v.anonymous_visitor_id
            )) AS returning_visitors_today,
            (SELECT COALESCE(AVG(duration_seconds), 0) FROM sessions_today) AS average_session_duration_seconds,
            (SELECT COUNT(*) FROM sessions_today WHERE page_view_count <= 1) AS bounce_sessions_today
        `,
        [DEFAULT_TIMEZONE, todayRange.startDate, last7Range.startDate, last7Range.endDate, liveWindow]
      ),
      queryAnalytics(
        `
          SELECT timezone($1, s.last_activity_at)::date AS day, COUNT(DISTINCT s.anonymous_visitor_id) AS visitors
          FROM analytics_visitor_sessions s
          WHERE s.is_bot = FALSE
            AND timezone($1, s.last_activity_at)::date BETWEEN $2::date AND $3::date
          GROUP BY day
          ORDER BY day ASC
        `,
        [DEFAULT_TIMEZONE, last7Range.startDate, last7Range.endDate]
      ),
      queryAnalytics(
        `
          SELECT timezone($1, p.viewed_at)::date AS day, COUNT(*) AS page_views
          FROM analytics_visitor_page_views p
          INNER JOIN analytics_visitor_sessions s ON s.id = p.session_id
          WHERE s.is_bot = FALSE
            AND timezone($1, p.viewed_at)::date BETWEEN $2::date AND $3::date
          GROUP BY day
          ORDER BY day ASC
        `,
        [DEFAULT_TIMEZONE, last7Range.startDate, last7Range.endDate]
      ),
      queryAnalytics(
        `
          SELECT s.portal, COUNT(DISTINCT s.anonymous_visitor_id) AS visitors, COUNT(*) AS sessions
          FROM analytics_visitor_sessions s
          WHERE s.is_bot = FALSE
            AND timezone($1, s.last_activity_at)::date BETWEEN $2::date AND $3::date
          GROUP BY s.portal
          ORDER BY sessions DESC
        `,
        [DEFAULT_TIMEZONE, last7Range.startDate, last7Range.endDate]
      ),
      queryAnalytics(
        `
          SELECT COALESCE(s.device_category, 'unknown') AS device, COUNT(*) AS sessions
          FROM analytics_visitor_sessions s
          WHERE s.is_bot = FALSE
            AND timezone($1, s.last_activity_at)::date BETWEEN $2::date AND $3::date
          GROUP BY COALESCE(s.device_category, 'unknown')
          ORDER BY sessions DESC
        `,
        [DEFAULT_TIMEZONE, last7Range.startDate, last7Range.endDate]
      ),
      queryAnalytics(
        `
          SELECT COALESCE(s.country_name, 'Unknown') AS country, COUNT(DISTINCT s.anonymous_visitor_id) AS visitors
          FROM analytics_visitor_sessions s
          WHERE s.is_bot = FALSE
            AND timezone($1, s.last_activity_at)::date BETWEEN $2::date AND $3::date
          GROUP BY COALESCE(s.country_name, 'Unknown')
          ORDER BY visitors DESC
          LIMIT 10
        `,
        [DEFAULT_TIMEZONE, last7Range.startDate, last7Range.endDate]
      ),
      queryAnalytics(
        `
          SELECT COALESCE(s.city, 'Unknown') AS city, COUNT(DISTINCT s.anonymous_visitor_id) AS visitors
          FROM analytics_visitor_sessions s
          WHERE s.is_bot = FALSE
            AND timezone($1, s.last_activity_at)::date BETWEEN $2::date AND $3::date
          GROUP BY COALESCE(s.city, 'Unknown')
          ORDER BY visitors DESC
          LIMIT 10
        `,
        [DEFAULT_TIMEZONE, last7Range.startDate, last7Range.endDate]
      ),
      queryAnalytics(
        `
          SELECT COALESCE(p.route_template, p.path, 'Unknown') AS path, p.portal, COUNT(*) AS page_views, COUNT(DISTINCT p.anonymous_visitor_id) AS visitors
          FROM analytics_visitor_page_views p
          INNER JOIN analytics_visitor_sessions s ON s.id = p.session_id
          WHERE s.is_bot = FALSE
            AND timezone($1, p.viewed_at)::date BETWEEN $2::date AND $3::date
          GROUP BY COALESCE(p.route_template, p.path, 'Unknown'), p.portal
          ORDER BY page_views DESC
          LIMIT 10
        `,
        [DEFAULT_TIMEZONE, last7Range.startDate, last7Range.endDate]
      ),
      queryAnalytics(
        `
          SELECT COALESCE(NULLIF(s.referrer, ''), 'Direct / None') AS referrer, COUNT(*) AS sessions
          FROM analytics_visitor_sessions s
          WHERE s.is_bot = FALSE
            AND timezone($1, s.last_activity_at)::date BETWEEN $2::date AND $3::date
          GROUP BY COALESCE(NULLIF(s.referrer, ''), 'Direct / None')
          ORDER BY sessions DESC
          LIMIT 10
        `,
        [DEFAULT_TIMEZONE, last7Range.startDate, last7Range.endDate]
      ),
      queryAnalytics(
        `
          SELECT COALESCE(NULLIF(s.utm_campaign, ''), 'Unknown') AS campaign, COUNT(*) AS sessions
          FROM analytics_visitor_sessions s
          WHERE s.is_bot = FALSE
            AND timezone($1, s.last_activity_at)::date BETWEEN $2::date AND $3::date
          GROUP BY COALESCE(NULLIF(s.utm_campaign, ''), 'Unknown')
          ORDER BY sessions DESC
          LIMIT 10
        `,
        [DEFAULT_TIMEZONE, last7Range.startDate, last7Range.endDate]
      ),
    ]);

  const summaryRow = summaryResult.rows[0] ?? {};
  const sessionsToday = Number(summaryRow.sessions_today ?? 0);
  const bounceSessionsToday = Number(summaryRow.bounce_sessions_today ?? 0);

  return {
    timezone: DEFAULT_TIMEZONE,
    liveVisitorWindowMinutes: LIVE_WINDOW_MINUTES,
    generatedAt: new Date().toISOString(),
    summary: {
      liveVisitorsNow: Number(summaryRow.live_visitors_now ?? 0),
      uniqueVisitorsToday: Number(summaryRow.unique_visitors_today ?? 0),
      sessionsToday,
      pageViewsToday: Number(summaryRow.page_views_today ?? 0),
      uniqueVisitorsLast7Days: Number(summaryRow.unique_visitors_last7 ?? 0),
      newVisitors: Number(summaryRow.new_visitors_today ?? 0),
      returningVisitors: Number(summaryRow.returning_visitors_today ?? 0),
      averageSessionDurationSeconds: Number(summaryRow.average_session_duration_seconds ?? 0),
      bounceRate: sessionsToday > 0 ? (bounceSessionsToday / sessionsToday) * 100 : 0,
    },
    charts: {
      visitorsOverTime: dailyVisitorsResult.rows.map((row: AnalyticsRow) => ({
        day: String(row.day),
        visitors: Number(row.visitors ?? 0),
      })),
      pageViewsOverTime: dailyPageViewsResult.rows.map((row: AnalyticsRow) => ({
        day: String(row.day),
        pageViews: Number(row.page_views ?? 0),
      })),
      portalSplit: portalSplitResult.rows.map((row: AnalyticsRow) => ({
        portal: String(row.portal),
        visitors: Number(row.visitors ?? 0),
        sessions: Number(row.sessions ?? 0),
      })),
      deviceDistribution: deviceResult.rows.map((row: AnalyticsRow) => ({
        device: String(row.device),
        sessions: Number(row.sessions ?? 0),
      })),
      topCountries: countriesResult.rows.map((row: AnalyticsRow) => ({
        country: String(row.country),
        visitors: Number(row.visitors ?? 0),
      })),
      topCities: citiesResult.rows.map((row: AnalyticsRow) => ({
        city: String(row.city),
        visitors: Number(row.visitors ?? 0),
      })),
      topPages: pagesResult.rows.map((row: AnalyticsRow) => ({
        path: String(row.path),
        portal: String(row.portal),
        pageViews: Number(row.page_views ?? 0),
        visitors: Number(row.visitors ?? 0),
      })),
      topReferrers: referrersResult.rows.map((row: AnalyticsRow) => ({
        referrer: String(row.referrer),
        sessions: Number(row.sessions ?? 0),
      })),
      utmCampaigns: utmResult.rows.map((row: AnalyticsRow) => ({
        campaign: String(row.campaign),
        sessions: Number(row.sessions ?? 0),
      })),
    },
  };
}

export async function getB2BLeadZoneDownloadAnalytics(input: VisitorsFilterInput) {
  const filters = parseB2BLeadZoneFilters(input);
  const todayRange = getRelativeDateRange("today");
  const last7Range = getRelativeDateRange("last7");
  const last30Range = getLastNDaysRange(30);
  const landingFilters = buildB2BLandingFilterClause(filters);
  const downloadFilters = buildB2BDownloadFilterClause(filters);
  const guestEventFilters = buildB2BGuestEventFilterClause(filters);
  const appEventFilters = buildB2BAppEventFilterClause(filters);
  const recentMobileActionsOffset = (filters.recentMobileActionsPage - 1) * B2B_TABLE_PAGE_SIZE;
  const recentDownloadsOffset = (filters.recentDownloadsPage - 1) * B2B_TABLE_PAGE_SIZE;
  const userPortalPool = getUserPortalPool();

  const [
    landingSummaryResult,
    downloadSummaryResult,
    downloadsByDayResult,
    landingByDayResult,
    landingDeviceBreakdownResult,
    downloadDeviceBreakdownResult,
    downloadClassificationResult,
    sourceLandingResult,
    sourceDownloadResult,
    countryLandingResult,
    countryDownloadResult,
    cityLandingResult,
    cityDownloadResult,
    pageBreakdownResult,
    landingMobileActionsCountResult,
    downloadMobileActionsCountResult,
    landingMobileActionsResult,
    downloadMobileActionsResult,
    recentDownloadsCountResult,
    recentDownloadsResult,
    filterOptionsResult,
    guestEventSummaryResult,
    guestEventsByDayResult,
    guestEventSourceResult,
    guestEventDeviceBreakdownResult,
    guestRecentActionsCountResult,
    guestRecentActionsResult,
    appEventSummaryResult,
    appEventsByDayResult,
  ] = await Promise.all([
    queryAnalytics(
      `
        WITH filtered_landing AS (
          SELECT
            p.anonymous_visitor_id,
            p.session_id,
            s.device_category,
            s.operating_system
          FROM analytics_visitor_page_views p
          INNER JOIN analytics_visitor_sessions s ON s.id = p.session_id
          WHERE ${landingFilters.whereClause}
        )
        SELECT
          COUNT(DISTINCT session_id) AS landing_sessions,
          COUNT(DISTINCT anonymous_visitor_id) AS unique_visitors,
          COUNT(DISTINCT anonymous_visitor_id) FILTER (WHERE COALESCE(LOWER(device_category), '') IN ('mobile', 'tablet')) AS mobile_visitors,
          COUNT(DISTINCT anonymous_visitor_id) FILTER (
            WHERE COALESCE(LOWER(device_category), '') = 'desktop'
              AND COALESCE(operating_system, '') ILIKE 'windows%'
          ) AS windows_desktop_visitors,
          COUNT(DISTINCT anonymous_visitor_id) FILTER (
            WHERE COALESCE(LOWER(device_category), '') = 'desktop'
              AND COALESCE(operating_system, '') <> ''
              AND COALESCE(operating_system, '') NOT ILIKE 'windows%'
          ) AS other_desktop_visitors,
          COUNT(DISTINCT anonymous_visitor_id) FILTER (
            WHERE COALESCE(NULLIF(LOWER(device_category), ''), 'unknown') = 'unknown'
          ) AS unknown_device_visitors,
          COUNT(*) FILTER (WHERE COALESCE(LOWER(device_category), '') IN ('mobile', 'tablet')) AS mobile_landing_views
        FROM filtered_landing
      `,
      landingFilters.values
    ),
    queryAnalytics(
      `
        WITH filtered_downloads AS (
          SELECT
            d.*,
            CASE
              WHEN COALESCE(LOWER(d.device_category), '') = 'desktop' AND COALESCE(d.operating_system, '') ILIKE 'windows%' THEN 'Valid Windows download'
              WHEN COALESCE(LOWER(d.device_category), '') IN ('mobile', 'tablet') THEN 'Mobile .exe download'
              WHEN COALESCE(LOWER(d.device_category), '') = 'desktop' THEN 'Other non-Windows download'
              ELSE 'Unknown device'
            END AS download_classification
          FROM analytics_download_events d
          WHERE ${downloadFilters.whereClause}
        )
        SELECT
          COUNT(*) AS total_downloads,
          COUNT(DISTINCT anonymous_visitor_id) AS unique_visitors,
          COUNT(DISTINCT session_id) AS unique_sessions,
          COUNT(*) FILTER (WHERE timezone($1, created_at)::date = $5::date) AS downloads_today,
          COUNT(*) FILTER (WHERE timezone($1, created_at)::date BETWEEN $6::date AND $7::date) AS downloads_last7_days,
          COUNT(*) FILTER (WHERE timezone($1, created_at)::date BETWEEN $8::date AND $9::date) AS downloads_last30_days,
          COUNT(*) FILTER (
            WHERE COALESCE(NULLIF(country_name, ''), NULLIF(region, ''), NULLIF(city, '')) IS NOT NULL
          ) AS known_location_downloads,
          COUNT(*) FILTER (WHERE download_classification = 'Valid Windows download') AS windows_downloads,
          COUNT(DISTINCT anonymous_visitor_id) FILTER (WHERE download_classification = 'Valid Windows download') AS unique_windows_downloaders,
          COUNT(*) FILTER (WHERE download_classification = 'Mobile .exe download') AS mobile_exe_downloads,
          COUNT(*) FILTER (WHERE download_classification = 'Other non-Windows download') AS other_non_windows_downloads,
          COUNT(*) FILTER (WHERE download_classification = 'Unknown device') AS unknown_device_downloads
        FROM filtered_downloads
      `,
      [
        ...downloadFilters.values,
        todayRange.startDate,
        last7Range.startDate,
        last7Range.endDate,
        last30Range.startDate,
        last30Range.endDate,
      ]
    ),
    queryAnalytics(
      `
        WITH filtered_downloads AS (
          SELECT
            timezone($1, d.created_at)::date AS day,
            d.anonymous_visitor_id,
            CASE
              WHEN COALESCE(LOWER(d.device_category), '') = 'desktop' AND COALESCE(d.operating_system, '') ILIKE 'windows%' THEN 'Valid Windows download'
              WHEN COALESCE(LOWER(d.device_category), '') IN ('mobile', 'tablet') THEN 'Mobile .exe download'
              WHEN COALESCE(LOWER(d.device_category), '') = 'desktop' THEN 'Other non-Windows download'
              ELSE 'Unknown device'
            END AS download_classification
          FROM analytics_download_events d
          WHERE ${downloadFilters.whereClause}
        )
        SELECT
          day,
          download_classification,
          COUNT(*) AS downloads,
          COUNT(DISTINCT anonymous_visitor_id) AS unique_downloaders
        FROM filtered_downloads
        GROUP BY day, download_classification
        ORDER BY day ASC
      `,
      downloadFilters.values
    ),
    queryAnalytics(
      `
        SELECT
          timezone($1, p.viewed_at)::date AS day,
          COUNT(*) FILTER (WHERE COALESCE(LOWER(s.device_category), '') IN ('mobile', 'tablet')) AS mobile_landing_views,
          COUNT(DISTINCT p.anonymous_visitor_id) FILTER (WHERE COALESCE(LOWER(s.device_category), '') IN ('mobile', 'tablet')) AS unique_mobile_visitors
        FROM analytics_visitor_page_views p
        INNER JOIN analytics_visitor_sessions s ON s.id = p.session_id
        WHERE ${landingFilters.whereClause}
        GROUP BY day
        ORDER BY day ASC
      `,
      landingFilters.values
    ),
    queryAnalytics(
      `
        SELECT
          CASE
            WHEN COALESCE(LOWER(s.device_category), '') = 'desktop' AND COALESCE(s.operating_system, '') ILIKE 'windows%' THEN 'Windows desktop'
            WHEN COALESCE(s.operating_system, '') ILIKE 'android%' THEN 'Android'
            WHEN COALESCE(s.operating_system, '') ILIKE 'ios%' OR COALESCE(s.operating_system, '') ILIKE 'ipad%' THEN 'iPhone/iPad'
            WHEN COALESCE(s.operating_system, '') ILIKE 'mac%' THEN 'macOS'
            WHEN COALESCE(s.operating_system, '') ILIKE 'linux%' THEN 'Linux'
            ELSE 'Other / Unknown'
          END AS device_segment,
          COUNT(DISTINCT p.anonymous_visitor_id) AS unique_visitors
        FROM analytics_visitor_page_views p
        INNER JOIN analytics_visitor_sessions s ON s.id = p.session_id
        WHERE ${landingFilters.whereClause}
        GROUP BY device_segment
      `,
      landingFilters.values
    ),
    queryAnalytics(
      `
        SELECT
          CASE
            WHEN COALESCE(LOWER(d.device_category), '') = 'desktop' AND COALESCE(d.operating_system, '') ILIKE 'windows%' THEN 'Windows desktop'
            WHEN COALESCE(d.operating_system, '') ILIKE 'android%' THEN 'Android'
            WHEN COALESCE(d.operating_system, '') ILIKE 'ios%' OR COALESCE(d.operating_system, '') ILIKE 'ipad%' THEN 'iPhone/iPad'
            WHEN COALESCE(d.operating_system, '') ILIKE 'mac%' THEN 'macOS'
            WHEN COALESCE(d.operating_system, '') ILIKE 'linux%' THEN 'Linux'
            ELSE 'Other / Unknown'
          END AS device_segment,
          COUNT(*) AS download_events,
          COUNT(DISTINCT d.anonymous_visitor_id) AS unique_downloaders,
          COUNT(*) FILTER (
            WHERE COALESCE(LOWER(d.device_category), '') = 'desktop'
              AND COALESCE(d.operating_system, '') ILIKE 'windows%'
          ) AS windows_downloads
        FROM analytics_download_events d
        WHERE ${downloadFilters.whereClause}
        GROUP BY device_segment
      `,
      downloadFilters.values
    ),
    queryAnalytics(
      `
        WITH filtered_downloads AS (
          SELECT
            d.anonymous_visitor_id,
            CASE
              WHEN COALESCE(LOWER(d.device_category), '') = 'desktop' AND COALESCE(d.operating_system, '') ILIKE 'windows%' THEN 'Valid Windows download'
              WHEN COALESCE(LOWER(d.device_category), '') IN ('mobile', 'tablet') THEN 'Mobile .exe download'
              WHEN COALESCE(LOWER(d.device_category), '') = 'desktop' THEN 'Other non-Windows download'
              ELSE 'Unknown device'
            END AS download_classification
          FROM analytics_download_events d
          WHERE ${downloadFilters.whereClause}
        )
        SELECT
          download_classification,
          COUNT(*) AS download_events,
          COUNT(DISTINCT anonymous_visitor_id) AS unique_downloaders
        FROM filtered_downloads
        GROUP BY download_classification
      `,
      downloadFilters.values
    ),
    queryAnalytics(
      `
        SELECT
          COALESCE(NULLIF(s.utm_source, ''), NULLIF(REGEXP_REPLACE(COALESCE(s.referrer, ''), '^https?://([^/?#]+).*$','\\1'), ''), 'Direct / Unknown') AS source,
          COALESCE(NULLIF(s.utm_medium, ''), 'Unknown') AS medium,
          COALESCE(NULLIF(s.utm_campaign, ''), 'Unknown') AS campaign,
          NULLIF(REGEXP_REPLACE(COALESCE(s.referrer, ''), '^https?://([^/?#]+).*$','\\1'), '') AS referrer_domain,
          COUNT(DISTINCT p.anonymous_visitor_id) AS unique_visitors,
          COUNT(DISTINCT p.anonymous_visitor_id) FILTER (WHERE COALESCE(LOWER(s.device_category), '') IN ('mobile', 'tablet')) AS mobile_visitors
        FROM analytics_visitor_page_views p
        INNER JOIN analytics_visitor_sessions s ON s.id = p.session_id
        WHERE ${landingFilters.whereClause}
        GROUP BY source, medium, campaign, referrer_domain
        ORDER BY unique_visitors DESC
        LIMIT 100
      `,
      landingFilters.values
    ),
    queryAnalytics(
      `
        WITH filtered_downloads AS (
          SELECT
            d.*,
            CASE
              WHEN COALESCE(LOWER(d.device_category), '') = 'desktop' AND COALESCE(d.operating_system, '') ILIKE 'windows%' THEN 'Valid Windows download'
              WHEN COALESCE(LOWER(d.device_category), '') IN ('mobile', 'tablet') THEN 'Mobile .exe download'
              WHEN COALESCE(LOWER(d.device_category), '') = 'desktop' THEN 'Other non-Windows download'
              ELSE 'Unknown device'
            END AS download_classification
          FROM analytics_download_events d
          WHERE ${downloadFilters.whereClause}
        )
        SELECT
          COALESCE(NULLIF(utm_source, ''), NULLIF(REGEXP_REPLACE(COALESCE(referrer, ''), '^https?://([^/?#]+).*$','\\1'), ''), 'Direct / Unknown') AS source,
          COALESCE(NULLIF(utm_medium, ''), 'Unknown') AS medium,
          COALESCE(NULLIF(utm_campaign, ''), 'Unknown') AS campaign,
          NULLIF(REGEXP_REPLACE(COALESCE(referrer, ''), '^https?://([^/?#]+).*$','\\1'), '') AS referrer_domain,
          COUNT(*) AS download_events,
          COUNT(*) FILTER (WHERE download_classification = 'Valid Windows download') AS windows_downloads,
          COUNT(DISTINCT anonymous_visitor_id) FILTER (WHERE download_classification = 'Valid Windows download') AS unique_windows_downloaders
        FROM filtered_downloads
        GROUP BY source, medium, campaign, referrer_domain
        ORDER BY download_events DESC
        LIMIT 100
      `,
      downloadFilters.values
    ),
    queryAnalytics(
      `
        SELECT
          COALESCE(NULLIF(s.country_name, ''), 'Unknown') AS country,
          COUNT(DISTINCT p.anonymous_visitor_id) AS unique_visitors,
          COUNT(DISTINCT p.anonymous_visitor_id) FILTER (WHERE COALESCE(LOWER(s.device_category), '') IN ('mobile', 'tablet')) AS mobile_visitors
        FROM analytics_visitor_page_views p
        INNER JOIN analytics_visitor_sessions s ON s.id = p.session_id
        WHERE ${landingFilters.whereClause}
        GROUP BY country
        ORDER BY unique_visitors DESC
        LIMIT 20
      `,
      landingFilters.values
    ),
    queryAnalytics(
      `
        WITH filtered_downloads AS (
          SELECT
            d.country_name,
            d.anonymous_visitor_id,
            CASE
              WHEN COALESCE(LOWER(d.device_category), '') = 'desktop' AND COALESCE(d.operating_system, '') ILIKE 'windows%' THEN 1
              ELSE 0
            END AS is_windows_download
          FROM analytics_download_events d
          WHERE ${downloadFilters.whereClause}
        )
        SELECT
          COALESCE(NULLIF(country_name, ''), 'Unknown') AS country,
          COUNT(*) FILTER (WHERE is_windows_download = 1) AS windows_downloads
        FROM filtered_downloads
        GROUP BY country
      `,
      downloadFilters.values
    ),
    queryAnalytics(
      `
        SELECT
          COALESCE(NULLIF(s.city, ''), 'Unknown') AS city,
          COALESCE(NULLIF(s.country_name, ''), 'Unknown') AS country,
          COUNT(DISTINCT p.anonymous_visitor_id) AS unique_visitors,
          COUNT(DISTINCT p.anonymous_visitor_id) FILTER (WHERE COALESCE(LOWER(s.device_category), '') IN ('mobile', 'tablet')) AS mobile_visitors
        FROM analytics_visitor_page_views p
        INNER JOIN analytics_visitor_sessions s ON s.id = p.session_id
        WHERE ${landingFilters.whereClause}
        GROUP BY city, country
        ORDER BY unique_visitors DESC
        LIMIT 20
      `,
      landingFilters.values
    ),
    queryAnalytics(
      `
        WITH filtered_downloads AS (
          SELECT
            d.city,
            d.country_name,
            CASE
              WHEN COALESCE(LOWER(d.device_category), '') = 'desktop' AND COALESCE(d.operating_system, '') ILIKE 'windows%' THEN 1
              ELSE 0
            END AS is_windows_download
          FROM analytics_download_events d
          WHERE ${downloadFilters.whereClause}
        )
        SELECT
          COALESCE(NULLIF(city, ''), 'Unknown') AS city,
          COALESCE(NULLIF(country_name, ''), 'Unknown') AS country,
          COUNT(*) FILTER (WHERE is_windows_download = 1) AS windows_downloads
        FROM filtered_downloads
        GROUP BY city, country
      `,
      downloadFilters.values
    ),
    queryAnalytics(
      `
        SELECT
          COALESCE(NULLIF(d.route_template, ''), NULLIF(d.page_path, ''), 'Unknown') AS path,
          COUNT(*) AS downloads,
          COUNT(DISTINCT d.anonymous_visitor_id) AS unique_visitors
        FROM analytics_download_events d
        WHERE ${downloadFilters.whereClause}
        GROUP BY path
        ORDER BY downloads DESC, unique_visitors DESC
        LIMIT 10
      `,
      downloadFilters.values
    ),
    queryAnalytics(
      `
        SELECT COUNT(*) AS total
        FROM analytics_visitor_page_views p
        INNER JOIN analytics_visitor_sessions s ON s.id = p.session_id
        WHERE ${landingFilters.whereClause}
          AND COALESCE(LOWER(s.device_category), '') IN ('mobile', 'tablet')
      `,
      landingFilters.values
    ),
    queryAnalytics(
      `
        SELECT COUNT(*) AS total
        FROM analytics_download_events d
        WHERE ${downloadFilters.whereClause}
          AND COALESCE(LOWER(d.device_category), '') IN ('mobile', 'tablet')
      `,
      downloadFilters.values
    ),
    queryAnalytics(
      `
        SELECT
          p.viewed_at AS occurred_at,
          'Mobile landing viewed' AS action_label,
          COALESCE(s.device_category, 'unknown') AS device_category,
          s.operating_system,
          s.browser,
          s.country_name,
          s.region,
          s.city,
          COALESCE(NULLIF(s.utm_source, ''), NULLIF(REGEXP_REPLACE(COALESCE(s.referrer, ''), '^https?://([^/?#]+).*$','\\1'), ''), 'Direct / Unknown') AS source,
          COALESCE(NULLIF(s.utm_campaign, ''), 'Unknown') AS campaign,
          COALESCE(p.route_template, p.path, 'Unknown') AS page_path,
          p.anonymous_visitor_id,
          'First-party visitor ID' AS attribution_status
        FROM analytics_visitor_page_views p
        INNER JOIN analytics_visitor_sessions s ON s.id = p.session_id
        WHERE ${landingFilters.whereClause}
          AND COALESCE(LOWER(s.device_category), '') IN ('mobile', 'tablet')
        ORDER BY p.viewed_at DESC
        LIMIT 100
      `,
      landingFilters.values
    ),
    queryAnalytics(
      `
        SELECT
          d.created_at AS occurred_at,
          'Mobile .exe downloaded' AS action_label,
          COALESCE(d.device_category, 'unknown') AS device_category,
          d.operating_system,
          d.browser,
          d.country_name,
          d.region,
          d.city,
          COALESCE(NULLIF(d.utm_source, ''), NULLIF(REGEXP_REPLACE(COALESCE(d.referrer, ''), '^https?://([^/?#]+).*$','\\1'), ''), 'Direct / Unknown') AS source,
          COALESCE(NULLIF(d.utm_campaign, ''), 'Unknown') AS campaign,
          COALESCE(d.route_template, d.page_path, 'Unknown') AS page_path,
          d.anonymous_visitor_id,
          'First-party visitor ID' AS attribution_status
        FROM analytics_download_events d
        WHERE ${downloadFilters.whereClause}
          AND COALESCE(LOWER(d.device_category), '') IN ('mobile', 'tablet')
        ORDER BY d.created_at DESC
        LIMIT 100
      `,
      downloadFilters.values
    ),
    queryAnalytics(
      `
        WITH filtered_downloads AS (
          SELECT
            d.*,
            ROW_NUMBER() OVER (PARTITION BY d.anonymous_visitor_id ORDER BY d.created_at ASC) AS visitor_download_index
          FROM analytics_download_events d
          WHERE ${downloadFilters.whereClause}
        )
        SELECT COUNT(*) AS total
        FROM filtered_downloads
      `,
      downloadFilters.values
    ),
    queryAnalytics(
      `
        WITH filtered_downloads AS (
          SELECT
            d.*,
            ROW_NUMBER() OVER (PARTITION BY d.anonymous_visitor_id ORDER BY d.created_at ASC) AS visitor_download_index
          FROM analytics_download_events d
          WHERE ${downloadFilters.whereClause}
        )
        SELECT
          id,
          anonymous_visitor_id,
          session_id,
          asset_label,
          page_path,
          route_template,
          utm_source,
          utm_medium,
          utm_campaign,
          referrer,
          device_category,
          operating_system,
          browser,
          country_name,
          region,
          city,
          created_at,
          visitor_download_index
        FROM filtered_downloads
        ORDER BY created_at DESC
        LIMIT $${downloadFilters.values.length + 1}
        OFFSET $${downloadFilters.values.length + 2}
      `,
      [...downloadFilters.values, B2B_TABLE_PAGE_SIZE, recentDownloadsOffset]
    ),
    queryAnalytics(
      `
        WITH landing_filter_options AS (
          SELECT
            COALESCE(NULLIF(s.country_name, ''), 'Unknown') AS country,
            COALESCE(NULLIF(s.city, ''), 'Unknown') AS city,
            COALESCE(NULLIF(s.utm_source, ''), NULLIF(REGEXP_REPLACE(COALESCE(s.referrer, ''), '^https?://([^/?#]+).*$','\\1'), ''), 'Direct / Unknown') AS source,
            COALESCE(NULLIF(s.utm_medium, ''), 'Unknown') AS medium,
            COALESCE(NULLIF(s.utm_campaign, ''), 'Unknown') AS campaign,
            CASE
              WHEN COALESCE(s.operating_system, '') ILIKE 'windows%%' THEN 'Windows'
              WHEN COALESCE(s.operating_system, '') ILIKE 'android%%' THEN 'Android'
              WHEN COALESCE(s.operating_system, '') ILIKE 'ios%%' OR COALESCE(s.operating_system, '') ILIKE 'ipad%%' THEN 'iOS / iPadOS'
              WHEN COALESCE(s.operating_system, '') ILIKE 'mac%%' THEN 'macOS'
              WHEN COALESCE(s.operating_system, '') ILIKE 'linux%%' THEN 'Linux'
              ELSE 'Other / Unknown'
            END AS operating_system,
            CASE
              WHEN COALESCE(s.browser, '') ILIKE '%%instagram%%' THEN 'Instagram in-app browser'
              WHEN COALESCE(s.browser, '') ILIKE '%%facebook%%' THEN 'Facebook in-app browser'
              WHEN COALESCE(s.browser, '') ILIKE '%%edge%%' THEN 'Edge'
              WHEN COALESCE(s.browser, '') ILIKE '%%chrome%%' THEN 'Chrome'
              WHEN COALESCE(s.browser, '') ILIKE '%%safari%%' THEN 'Safari'
              WHEN COALESCE(s.browser, '') ILIKE '%%firefox%%' THEN 'Firefox'
              ELSE 'Other / Unknown'
            END AS browser
          FROM analytics_visitor_page_views p
          INNER JOIN analytics_visitor_sessions s ON s.id = p.session_id
          WHERE timezone($1, p.viewed_at)::date BETWEEN $2::date AND $3::date
            AND p.portal = 'user_portal'
            AND COALESCE(p.route_template, p.path, '') = $4
            AND s.is_bot = FALSE
        ),
        download_filter_options AS (
          SELECT
            COALESCE(NULLIF(country_name, ''), 'Unknown') AS country,
            COALESCE(NULLIF(city, ''), 'Unknown') AS city,
            COALESCE(NULLIF(utm_source, ''), NULLIF(REGEXP_REPLACE(COALESCE(referrer, ''), '^https?://([^/?#]+).*$','\\1'), ''), 'Direct / Unknown') AS source,
            COALESCE(NULLIF(utm_medium, ''), 'Unknown') AS medium,
            COALESCE(NULLIF(utm_campaign, ''), 'Unknown') AS campaign,
            CASE
              WHEN COALESCE(operating_system, '') ILIKE 'windows%%' THEN 'Windows'
              WHEN COALESCE(operating_system, '') ILIKE 'android%%' THEN 'Android'
              WHEN COALESCE(operating_system, '') ILIKE 'ios%%' OR COALESCE(operating_system, '') ILIKE 'ipad%%' THEN 'iOS / iPadOS'
              WHEN COALESCE(operating_system, '') ILIKE 'mac%%' THEN 'macOS'
              WHEN COALESCE(operating_system, '') ILIKE 'linux%%' THEN 'Linux'
              ELSE 'Other / Unknown'
            END AS operating_system,
            CASE
              WHEN COALESCE(browser, '') ILIKE '%%instagram%%' THEN 'Instagram in-app browser'
              WHEN COALESCE(browser, '') ILIKE '%%facebook%%' THEN 'Facebook in-app browser'
              WHEN COALESCE(browser, '') ILIKE '%%edge%%' THEN 'Edge'
              WHEN COALESCE(browser, '') ILIKE '%%chrome%%' THEN 'Chrome'
              WHEN COALESCE(browser, '') ILIKE '%%safari%%' THEN 'Safari'
              WHEN COALESCE(browser, '') ILIKE '%%firefox%%' THEN 'Firefox'
              ELSE 'Other / Unknown'
            END AS browser
          FROM analytics_download_events
          WHERE timezone($1, created_at)::date BETWEEN $2::date AND $3::date
            AND project_key = $5
            AND is_bot = FALSE
        ),
        combined AS (
          SELECT * FROM landing_filter_options
          UNION ALL
          SELECT * FROM download_filter_options
        )
        SELECT
          ARRAY(SELECT DISTINCT country FROM combined ORDER BY country ASC LIMIT ${B2B_FILTER_OPTION_LIMIT}) AS countries,
          ARRAY(SELECT DISTINCT city FROM combined ORDER BY city ASC LIMIT ${B2B_FILTER_OPTION_LIMIT}) AS cities,
          ARRAY(SELECT DISTINCT source FROM combined ORDER BY source ASC LIMIT ${B2B_FILTER_OPTION_LIMIT}) AS sources,
          ARRAY(SELECT DISTINCT medium FROM combined ORDER BY medium ASC LIMIT ${B2B_FILTER_OPTION_LIMIT}) AS mediums,
          ARRAY(SELECT DISTINCT campaign FROM combined ORDER BY campaign ASC LIMIT ${B2B_FILTER_OPTION_LIMIT}) AS campaigns,
          ARRAY(SELECT DISTINCT operating_system FROM combined ORDER BY operating_system ASC LIMIT ${B2B_FILTER_OPTION_LIMIT}) AS operating_systems,
          ARRAY(SELECT DISTINCT browser FROM combined ORDER BY browser ASC LIMIT ${B2B_FILTER_OPTION_LIMIT}) AS browsers
      `,
      [DEFAULT_TIMEZONE, filters.startDate, filters.endDate, B2B_LEAD_ZONE_ROUTE, B2B_LEAD_ZONE_PROJECT_KEY]
    ),
    userPortalPool.query(
      `
        SELECT
          COUNT(*) FILTER (WHERE e.event_name = 'MapScraperWindowsLinkRequested') AS email_link_requests,
          COUNT(*) FILTER (WHERE e.event_name = 'MapScraperDownloadLinkShared') AS successful_link_shares,
          COUNT(*) FILTER (WHERE e.event_name = 'MapScraperDownloadLinkCopied') AS download_link_copies,
          COUNT(*) FILTER (WHERE e.event_name = 'MapScraperWindowsLinkRequestFailed') AS failed_link_requests,
          COUNT(DISTINCT e.anonymous_visitor_id) FILTER (
            WHERE e.event_name IN ('MapScraperWindowsLinkRequested', 'MapScraperDownloadLinkShared', 'MapScraperDownloadLinkCopied')
              AND COALESCE(LOWER(e.device_type), '') IN ('mobile', 'tablet')
          ) AS unique_mobile_link_save_visitors
        FROM guest_activity_events e
        WHERE ${guestEventFilters.whereClause}
      `,
      guestEventFilters.values
    ),
    userPortalPool.query(
      `
        SELECT
          timezone($1, e.created_at)::date AS day,
          COUNT(*) FILTER (WHERE e.event_name = 'MapScraperWindowsLinkRequested') AS email_link_requests,
          COUNT(*) FILTER (WHERE e.event_name = 'MapScraperDownloadLinkShared') AS successful_link_shares,
          COUNT(*) FILTER (WHERE e.event_name = 'MapScraperDownloadLinkCopied') AS download_link_copies,
          COUNT(*) FILTER (WHERE e.event_name = 'MapScraperWindowsLinkRequestFailed') AS failed_link_requests
        FROM guest_activity_events e
        WHERE ${guestEventFilters.whereClause}
        GROUP BY day
        ORDER BY day ASC
      `,
      guestEventFilters.values
    ),
    userPortalPool.query(
      `
        SELECT
          COALESCE(NULLIF(e.utm_source, ''), 'Direct / Unknown') AS source,
          COALESCE(NULLIF(e.utm_medium, ''), 'Unknown') AS medium,
          COALESCE(NULLIF(e.utm_campaign, ''), 'Unknown') AS campaign,
          COUNT(DISTINCT e.anonymous_visitor_id) FILTER (
            WHERE e.event_name IN ('MapScraperWindowsLinkRequested', 'MapScraperDownloadLinkShared', 'MapScraperDownloadLinkCopied')
          ) AS unique_link_save_visitors,
          COUNT(*) FILTER (WHERE e.event_name = 'MapScraperWindowsLinkRequested') AS email_link_requests,
          COUNT(*) FILTER (WHERE e.event_name = 'MapScraperDownloadLinkShared') AS successful_link_shares,
          COUNT(*) FILTER (WHERE e.event_name = 'MapScraperDownloadLinkCopied') AS download_link_copies
        FROM guest_activity_events e
        WHERE ${guestEventFilters.whereClause}
        GROUP BY source, medium, campaign
        ORDER BY unique_link_save_visitors DESC, successful_link_shares DESC
        LIMIT 100
      `,
      guestEventFilters.values
    ),
    userPortalPool.query(
      `
        SELECT
          CASE
            WHEN COALESCE(LOWER(e.device_type), '') = 'desktop' AND COALESCE(e.os, '') ILIKE 'windows%' THEN 'Windows desktop'
            WHEN COALESCE(e.os, '') ILIKE 'android%' THEN 'Android'
            WHEN COALESCE(e.os, '') ILIKE 'ios%' OR COALESCE(e.os, '') ILIKE 'ipad%' THEN 'iPhone/iPad'
            WHEN COALESCE(e.os, '') ILIKE 'mac%' THEN 'macOS'
            WHEN COALESCE(e.os, '') ILIKE 'linux%' THEN 'Linux'
            ELSE 'Other / Unknown'
          END AS device_segment,
          COUNT(*) FILTER (
            WHERE e.event_name IN ('MapScraperWindowsLinkRequested', 'MapScraperDownloadLinkShared', 'MapScraperDownloadLinkCopied')
          ) AS link_save_actions
        FROM guest_activity_events e
        WHERE ${guestEventFilters.whereClause}
        GROUP BY device_segment
      `,
      guestEventFilters.values
    ),
    userPortalPool.query(
      `
        SELECT COUNT(*) AS total
        FROM guest_activity_events e
        WHERE ${guestEventFilters.whereClause}
      `,
      guestEventFilters.values
    ),
    userPortalPool.query(
      `
        SELECT
          e.created_at AS occurred_at,
          CASE
            WHEN e.event_name = 'MapScraperWindowsLinkRequested' THEN 'Email link requested'
            WHEN e.event_name = 'MapScraperDownloadLinkShared' THEN 'Link shared'
            WHEN e.event_name = 'MapScraperDownloadLinkCopied' THEN 'Link copied'
            WHEN e.event_name = 'MapScraperWindowsLinkRequestFailed' THEN 'Link request failed'
            ELSE e.event_name
          END AS action_label,
          COALESCE(e.device_type, 'unknown') AS device_category,
          e.os AS operating_system,
          e.browser,
          NULL::text AS country_name,
          NULL::text AS region,
          NULL::text AS city,
          COALESCE(NULLIF(e.utm_source, ''), 'Direct / Unknown') AS source,
          COALESCE(NULLIF(e.utm_campaign, ''), 'Unknown') AS campaign,
          COALESCE(NULLIF(e.page_path, ''), '${B2B_LEAD_ZONE_ROUTE}') AS page_path,
          COALESCE(NULLIF(e.anonymous_visitor_id, ''), 'unknown_visitor') AS anonymous_visitor_id,
          'First-party visitor ID' AS attribution_status
        FROM guest_activity_events e
        WHERE ${guestEventFilters.whereClause}
        ORDER BY e.created_at DESC
        LIMIT 100
      `,
      guestEventFilters.values
    ),
    userPortalPool.query(
      `
        SELECT
          COUNT(*) FILTER (WHERE e.event_name = 'B2BLeadZoneAppFirstOpen') AS app_first_opens,
          COUNT(*) FILTER (WHERE e.event_name = 'B2BLeadZoneFirstExtractionCompleted') AS first_extractions_completed,
          COUNT(*) FILTER (WHERE e.event_name = 'B2BLeadZoneFree30LimitReached') AS free_30_limit_reached,
          COUNT(*) FILTER (WHERE e.event_name = 'B2BLeadZonePlansOpened') AS plans_opened,
          COUNT(*) FILTER (WHERE e.event_name = 'B2BLeadZoneCheckoutStarted') AS checkout_started,
          COUNT(*) FILTER (WHERE e.event_name = 'B2BLeadZonePaymentCompleted') AS payments_completed
        FROM guest_activity_events e
        WHERE ${appEventFilters.whereClause}
      `,
      appEventFilters.values
    ),
    userPortalPool.query(
      `
        SELECT
          timezone($1, e.created_at)::date AS day,
          COUNT(*) FILTER (WHERE e.event_name = 'B2BLeadZoneAppFirstOpen') AS app_first_opens,
          COUNT(*) FILTER (WHERE e.event_name = 'B2BLeadZoneFirstExtractionCompleted') AS first_extractions_completed,
          COUNT(*) FILTER (WHERE e.event_name = 'B2BLeadZonePaymentCompleted') AS payments_completed
        FROM guest_activity_events e
        WHERE ${appEventFilters.whereClause}
        GROUP BY day
        ORDER BY day ASC
      `,
      appEventFilters.values
    ),
  ]);

  const landingSummaryRow = landingSummaryResult.rows[0] ?? {};
  const downloadSummaryRow = downloadSummaryResult.rows[0] ?? {};

  const landingSessions = Number(landingSummaryRow.landing_sessions ?? 0);
  const uniqueVisitors = Number(landingSummaryRow.unique_visitors ?? 0);
  const mobileVisitors = Number(landingSummaryRow.mobile_visitors ?? 0);
  const windowsDesktopVisitors = Number(landingSummaryRow.windows_desktop_visitors ?? 0);
  const otherDesktopVisitors = Number(landingSummaryRow.other_desktop_visitors ?? 0);
  const unknownDeviceVisitors = Number(landingSummaryRow.unknown_device_visitors ?? 0);
  const mobileLandingViews = Number(landingSummaryRow.mobile_landing_views ?? 0);

  const totalDownloads = Number(downloadSummaryRow.total_downloads ?? 0);
  const uniqueDownloadVisitors = Number(downloadSummaryRow.unique_visitors ?? 0);
  const uniqueDownloadSessions = Number(downloadSummaryRow.unique_sessions ?? 0);
  const windowsDownloads = Number(downloadSummaryRow.windows_downloads ?? 0);
  const uniqueWindowsDownloaders = Number(downloadSummaryRow.unique_windows_downloaders ?? 0);
  const mobileExeDownloads = Number(downloadSummaryRow.mobile_exe_downloads ?? 0);
  const otherNonWindowsDownloads = Number(downloadSummaryRow.other_non_windows_downloads ?? 0);
  const unknownDeviceDownloads = Number(downloadSummaryRow.unknown_device_downloads ?? 0);
  const knownLocationDownloads = Number(downloadSummaryRow.known_location_downloads ?? 0);
  const guestEventSummaryRow = guestEventSummaryResult.rows[0] ?? {};
  const emailLinkRequests = Number(guestEventSummaryRow.email_link_requests ?? 0);
  const successfulLinkShares = Number(guestEventSummaryRow.successful_link_shares ?? 0);
  const downloadLinkCopies = Number(guestEventSummaryRow.download_link_copies ?? 0);
  const failedLinkRequests = Number(guestEventSummaryRow.failed_link_requests ?? 0);
  const uniqueMobileLinkSaveVisitors = Number(guestEventSummaryRow.unique_mobile_link_save_visitors ?? 0);
  const appEventSummaryRow = appEventSummaryResult.rows[0] ?? {};
  const appFirstOpens = Number(appEventSummaryRow.app_first_opens ?? 0);
  const firstExtractionsCompleted = Number(appEventSummaryRow.first_extractions_completed ?? 0);
  const free30LimitReached = Number(appEventSummaryRow.free_30_limit_reached ?? 0);
  const plansOpened = Number(appEventSummaryRow.plans_opened ?? 0);
  const checkoutStarted = Number(appEventSummaryRow.checkout_started ?? 0);
  const paymentsCompleted = Number(appEventSummaryRow.payments_completed ?? 0);

  const timelineMap = new Map<string, {
    day: string;
    allDownloads: number;
    uniqueDownloaders: number;
    windowsDownloads: number;
    mobileExeDownloads: number;
    otherNonWindowsDownloads: number;
    unknownDeviceDownloads: number;
    mobileLandingViews: number;
  }>();

  for (const row of downloadsByDayResult.rows) {
    const day = String(row.day);
    const current = timelineMap.get(day) ?? {
      day,
      allDownloads: 0,
      uniqueDownloaders: 0,
      windowsDownloads: 0,
      mobileExeDownloads: 0,
      otherNonWindowsDownloads: 0,
      unknownDeviceDownloads: 0,
      mobileLandingViews: 0,
    };
    const classification = String(row.download_classification);
    const downloads = Number(row.downloads ?? 0);
    current.allDownloads += downloads;
    current.uniqueDownloaders += Number(row.unique_downloaders ?? 0);
    if (classification === "Valid Windows download") current.windowsDownloads += downloads;
    if (classification === "Mobile .exe download") current.mobileExeDownloads += downloads;
    if (classification === "Other non-Windows download") current.otherNonWindowsDownloads += downloads;
    if (classification === "Unknown device") current.unknownDeviceDownloads += downloads;
    timelineMap.set(day, current);
  }

  for (const row of landingByDayResult.rows) {
    const day = String(row.day);
    const current = timelineMap.get(day) ?? {
      day,
      allDownloads: 0,
      uniqueDownloaders: 0,
      windowsDownloads: 0,
      mobileExeDownloads: 0,
      otherNonWindowsDownloads: 0,
      unknownDeviceDownloads: 0,
      mobileLandingViews: 0,
    };
    current.mobileLandingViews = Number(row.mobile_landing_views ?? 0);
    timelineMap.set(day, current);
  }

  for (const row of guestEventsByDayResult.rows) {
    const day = String(row.day);
    const current = timelineMap.get(day) ?? {
      day,
      allDownloads: 0,
      uniqueDownloaders: 0,
      windowsDownloads: 0,
      mobileExeDownloads: 0,
      otherNonWindowsDownloads: 0,
      unknownDeviceDownloads: 0,
      mobileLandingViews: 0,
    };
    (current as typeof current & {
      emailLinkRequests?: number;
      successfulLinkShares?: number;
      downloadLinkCopies?: number;
      failedLinkRequests?: number;
    }).emailLinkRequests = Number(row.email_link_requests ?? 0);
    (current as typeof current & {
      emailLinkRequests?: number;
      successfulLinkShares?: number;
      downloadLinkCopies?: number;
      failedLinkRequests?: number;
    }).successfulLinkShares = Number(row.successful_link_shares ?? 0);
    (current as typeof current & {
      emailLinkRequests?: number;
      successfulLinkShares?: number;
      downloadLinkCopies?: number;
      failedLinkRequests?: number;
    }).downloadLinkCopies = Number(row.download_link_copies ?? 0);
    (current as typeof current & {
      emailLinkRequests?: number;
      successfulLinkShares?: number;
      downloadLinkCopies?: number;
      failedLinkRequests?: number;
    }).failedLinkRequests = Number(row.failed_link_requests ?? 0);
    timelineMap.set(day, current);
  }

  for (const row of appEventsByDayResult.rows) {
    const day = String(row.day);
    const current = timelineMap.get(day) ?? {
      day,
      allDownloads: 0,
      uniqueDownloaders: 0,
      windowsDownloads: 0,
      mobileExeDownloads: 0,
      otherNonWindowsDownloads: 0,
      unknownDeviceDownloads: 0,
      mobileLandingViews: 0,
    };
    (current as typeof current & { appFirstOpens?: number }).appFirstOpens = Number(row.app_first_opens ?? 0);
    (current as typeof current & { firstExtractions?: number }).firstExtractions = Number(row.first_extractions_completed ?? 0);
    (current as typeof current & { payments?: number }).payments = Number(row.payments_completed ?? 0);
    timelineMap.set(day, current);
  }

  const downloadsOverTime = Array.from(timelineMap.values()).sort((a, b) => a.day.localeCompare(b.day));

  const deviceBreakdownMap = new Map<string, {
    segment: string;
    uniqueVisitors: number;
    downloadEvents: number;
    uniqueDownloaders: number;
    windowsDownloads: number;
    linkSaveActions: number;
  }>();

  for (const row of landingDeviceBreakdownResult.rows) {
    const segment = String(row.device_segment);
    deviceBreakdownMap.set(segment, {
      segment,
      uniqueVisitors: Number(row.unique_visitors ?? 0),
      downloadEvents: 0,
      uniqueDownloaders: 0,
      windowsDownloads: 0,
      linkSaveActions: 0,
    });
  }

  for (const row of downloadDeviceBreakdownResult.rows) {
    const segment = String(row.device_segment);
    const current = deviceBreakdownMap.get(segment) ?? {
      segment,
      uniqueVisitors: 0,
      downloadEvents: 0,
      uniqueDownloaders: 0,
      windowsDownloads: 0,
      linkSaveActions: 0,
    };
    current.downloadEvents = Number(row.download_events ?? 0);
    current.uniqueDownloaders = Number(row.unique_downloaders ?? 0);
    current.windowsDownloads = Number(row.windows_downloads ?? 0);
    deviceBreakdownMap.set(segment, current);
  }

  for (const row of guestEventDeviceBreakdownResult.rows) {
    const segment = String(row.device_segment);
    const current = deviceBreakdownMap.get(segment) ?? {
      segment,
      uniqueVisitors: 0,
      downloadEvents: 0,
      uniqueDownloaders: 0,
      windowsDownloads: 0,
      linkSaveActions: 0,
    };
    current.linkSaveActions = Number(row.link_save_actions ?? 0);
    deviceBreakdownMap.set(segment, current);
  }

  const orderedDeviceSegments = ["Windows desktop", "Android", "iPhone/iPad", "macOS", "Linux", "Other / Unknown"];
  const deviceBreakdown = orderedDeviceSegments.map((segment) => deviceBreakdownMap.get(segment) ?? {
    segment,
    uniqueVisitors: 0,
    downloadEvents: 0,
    uniqueDownloaders: 0,
    windowsDownloads: 0,
    linkSaveActions: 0,
  });

  const classificationBreakdownMap = new Map<string, { classification: string; downloadEvents: number; uniqueDownloaders: number }>();
  for (const row of downloadClassificationResult.rows) {
    const classification = String(row.download_classification);
    classificationBreakdownMap.set(classification, {
      classification,
      downloadEvents: Number(row.download_events ?? 0),
      uniqueDownloaders: Number(row.unique_downloaders ?? 0),
    });
  }

  const downloadClassification = [
    "Valid Windows download",
    "Mobile .exe download",
    "Other non-Windows download",
    "Unknown device",
  ].map((classification) => classificationBreakdownMap.get(classification) ?? {
    classification,
    downloadEvents: 0,
    uniqueDownloaders: 0,
  });

  const sourcePerformanceMap = new Map<string, {
    source: string;
    medium: string;
    campaign: string;
    referrerDomain: string | null;
    label: string;
    uniqueVisitors: number;
    mobileVisitors: number;
    linkSaveConversions: number;
    windowsDownloads: number;
    appFirstOpens: number;
    firstExtractions: number;
    checkoutStarts: number;
    payments: number;
  }>();

  for (const row of sourceLandingResult.rows) {
    const source = String(row.source);
    const medium = String(row.medium);
    const campaign = String(row.campaign);
    const key = `${source}__${medium}__${campaign}`;
    sourcePerformanceMap.set(key, {
      source,
      medium,
      campaign,
      referrerDomain: row.referrer_domain ? String(row.referrer_domain) : null,
      label: formatCampaignLabel(source, medium, campaign),
      uniqueVisitors: Number(row.unique_visitors ?? 0),
      mobileVisitors: Number(row.mobile_visitors ?? 0),
      linkSaveConversions: 0,
      windowsDownloads: 0,
      appFirstOpens: 0,
      firstExtractions: 0,
      checkoutStarts: 0,
      payments: 0,
    });
  }

  for (const row of sourceDownloadResult.rows) {
    const source = String(row.source);
    const medium = String(row.medium);
    const campaign = String(row.campaign);
    const key = `${source}__${medium}__${campaign}`;
    const current = sourcePerformanceMap.get(key) ?? {
      source,
      medium,
      campaign,
      referrerDomain: row.referrer_domain ? String(row.referrer_domain) : null,
      label: formatCampaignLabel(source, medium, campaign),
      uniqueVisitors: 0,
      mobileVisitors: 0,
      linkSaveConversions: 0,
      windowsDownloads: 0,
      appFirstOpens: 0,
      firstExtractions: 0,
      checkoutStarts: 0,
      payments: 0,
    };
    current.windowsDownloads = Number(row.windows_downloads ?? 0);
    sourcePerformanceMap.set(key, current);
  }

  for (const row of guestEventSourceResult.rows) {
    const source = String(row.source);
    const medium = String(row.medium);
    const campaign = String(row.campaign);
    const key = `${source}__${medium}__${campaign}`;
    const current = sourcePerformanceMap.get(key) ?? {
      source,
      medium,
      campaign,
      referrerDomain: null,
      label: formatCampaignLabel(source, medium, campaign),
      uniqueVisitors: 0,
      mobileVisitors: 0,
      linkSaveConversions: 0,
      windowsDownloads: 0,
      appFirstOpens: 0,
      firstExtractions: 0,
      checkoutStarts: 0,
      payments: 0,
    };
    current.linkSaveConversions = Number(row.unique_link_save_visitors ?? 0);
    sourcePerformanceMap.set(key, current);
  }

  const sourcePerformance = Array.from(sourcePerformanceMap.values())
    .map((row) => ({
      ...row,
      visitorToPaymentRate: 0,
      visitorToPaymentRateAvailable: false,
    }))
    .sort((a, b) => (b.windowsDownloads + b.uniqueVisitors) - (a.windowsDownloads + a.uniqueVisitors))
    .slice(0, 25);

  const countryMetricsMap = new Map<string, {
    country: string;
    uniqueVisitors: number;
    mobileVisitors: number;
    linkRequests: number;
    windowsDownloads: number;
    appFirstOpens: number;
    payments: number;
  }>();

  for (const row of countryLandingResult.rows) {
    const country = String(row.country);
    countryMetricsMap.set(country, {
      country,
      uniqueVisitors: Number(row.unique_visitors ?? 0),
      mobileVisitors: Number(row.mobile_visitors ?? 0),
      linkRequests: 0,
      windowsDownloads: 0,
      appFirstOpens: 0,
      payments: 0,
    });
  }

  for (const row of countryDownloadResult.rows) {
    const country = String(row.country);
    const current = countryMetricsMap.get(country) ?? {
      country,
      uniqueVisitors: 0,
      mobileVisitors: 0,
      linkRequests: 0,
      windowsDownloads: 0,
      appFirstOpens: 0,
      payments: 0,
    };
    current.windowsDownloads = Number(row.windows_downloads ?? 0);
    countryMetricsMap.set(country, current);
  }

  const topCountries = Array.from(countryMetricsMap.values())
    .sort((a, b) => (b.uniqueVisitors + b.windowsDownloads) - (a.uniqueVisitors + a.windowsDownloads))
    .slice(0, 10);

  const cityMetricsMap = new Map<string, {
    city: string;
    country: string;
    uniqueVisitors: number;
    mobileVisitors: number;
    linkRequests: number;
    windowsDownloads: number;
    appFirstOpens: number;
    payments: number;
  }>();

  for (const row of cityLandingResult.rows) {
    const city = String(row.city);
    const country = String(row.country);
    const key = `${city}__${country}`;
    cityMetricsMap.set(key, {
      city,
      country,
      uniqueVisitors: Number(row.unique_visitors ?? 0),
      mobileVisitors: Number(row.mobile_visitors ?? 0),
      linkRequests: 0,
      windowsDownloads: 0,
      appFirstOpens: 0,
      payments: 0,
    });
  }

  for (const row of cityDownloadResult.rows) {
    const city = String(row.city);
    const country = String(row.country);
    const key = `${city}__${country}`;
    const current = cityMetricsMap.get(key) ?? {
      city,
      country,
      uniqueVisitors: 0,
      mobileVisitors: 0,
      linkRequests: 0,
      windowsDownloads: 0,
      appFirstOpens: 0,
      payments: 0,
    };
    current.windowsDownloads = Number(row.windows_downloads ?? 0);
    cityMetricsMap.set(key, current);
  }

  const topCities = Array.from(cityMetricsMap.values())
    .sort((a, b) => (b.uniqueVisitors + b.windowsDownloads) - (a.uniqueVisitors + a.windowsDownloads))
    .slice(0, 10);

  const recentMobileActionsTotal =
    Number(landingMobileActionsCountResult.rows[0]?.total ?? 0) +
    Number(downloadMobileActionsCountResult.rows[0]?.total ?? 0) +
    Number(guestRecentActionsCountResult.rows[0]?.total ?? 0);
  const recentDownloadsTotal = Number(recentDownloadsCountResult.rows[0]?.total ?? 0);

  const recentMobileActionsItems = [
    ...landingMobileActionsResult.rows,
    ...downloadMobileActionsResult.rows,
    ...guestRecentActionsResult.rows,
  ]
    .map((row: AnalyticsRow) => ({
      occurredAt: String(row.occurred_at),
      action: String(row.action_label),
      device: row.device_category ? String(row.device_category) : "unknown",
      operatingSystem: row.operating_system ? String(row.operating_system) : "Other / Unknown",
      browser: row.browser ? String(row.browser) : "Other / Unknown",
      location: formatLocationLabel(row.city, row.region, row.country_name),
      sourceCampaign: formatCampaignLabel(row.source, "Unknown", row.campaign),
      page: String(row.page_path ?? "Unknown"),
      visitorId: String(row.anonymous_visitor_id),
      attributionStatus: String(row.attribution_status),
    }))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(recentMobileActionsOffset, recentMobileActionsOffset + B2B_TABLE_PAGE_SIZE);

  const availability = {
    emailLinkRequests: true,
    linkShares: true,
    linkCopies: true,
    failedLinkRequests: true,
    appFirstOpen: true,
    firstExtraction: true,
    freeLimitReached: true,
    plansOpened: true,
    checkoutStarted: true,
    paymentCompleted: true,
    crossDeviceAttribution: false,
    appVersion: false,
    authenticationStatus: false,
  };

  const filterOptionsRow = filterOptionsResult.rows[0] ?? {};
  const filterOptions = {
    deviceCategories: [
      { value: "mobile_or_tablet", label: "Mobile / Tablet", available: true },
      { value: "desktop", label: "Desktop", available: true },
      { value: "mobile", label: "Mobile only", available: true },
      { value: "tablet", label: "Tablet only", available: true },
      { value: "unknown", label: "Unknown", available: true },
    ],
    operatingSystems: Array.isArray(filterOptionsRow.operating_systems) ? filterOptionsRow.operating_systems.map((value: unknown) => String(value)) : [],
    browsers: Array.isArray(filterOptionsRow.browsers) ? filterOptionsRow.browsers.map((value: unknown) => String(value)) : [],
    countries: Array.isArray(filterOptionsRow.countries) ? filterOptionsRow.countries.map((value: unknown) => String(value)) : [],
    cities: Array.isArray(filterOptionsRow.cities) ? filterOptionsRow.cities.map((value: unknown) => String(value)) : [],
    sources: Array.isArray(filterOptionsRow.sources) ? filterOptionsRow.sources.map((value: unknown) => String(value)) : [],
    mediums: Array.isArray(filterOptionsRow.mediums) ? filterOptionsRow.mediums.map((value: unknown) => String(value)) : [],
    campaigns: Array.isArray(filterOptionsRow.campaigns) ? filterOptionsRow.campaigns.map((value: unknown) => String(value)) : [],
    actionTypes: [
      { value: "all", label: "All activity", available: true },
      { value: "landing_view", label: "Landing page views", available: true },
      { value: "mobile_landing_view", label: "Mobile landing views", available: true },
      { value: "valid_windows_download", label: "Valid Windows downloads", available: true },
      { value: "mobile_exe_download", label: "Mobile .exe downloads", available: true },
      { value: "other_non_windows_download", label: "Other non-Windows downloads", available: true },
      { value: "unknown_device_download", label: "Unknown-device downloads", available: true },
      { value: "email_link_request", label: "Email link requests", available: true },
      { value: "link_shared", label: "Successful link shares", available: true },
      { value: "link_copied", label: "Download-link copies", available: true },
      { value: "failed_link_request", label: "Failed link requests", available: true },
      { value: "app_first_open", label: "App first open", available: true },
      { value: "first_extraction", label: "First extraction", available: true },
      { value: "free_limit_reached", label: "Free 30-limit reached", available: true },
      { value: "plans_opened", label: "Plans opened", available: true },
      { value: "checkout_started", label: "Checkout started", available: true },
      { value: "payment_completed", label: "Payment completed", available: true },
    ],
    applicationVersions: [] as string[],
    authenticationStatuses: [] as string[],
  };

  return {
    timezone: DEFAULT_TIMEZONE,
    generatedAt: new Date().toISOString(),
    range: {
      startDate: filters.startDate,
      endDate: filters.endDate,
    },
    summary: {
      totalDownloads,
      uniqueVisitors: uniqueDownloadVisitors,
      uniqueSessions: uniqueDownloadSessions,
      downloadsToday: Number(downloadSummaryRow.downloads_today ?? 0),
      downloadsLast7Days: Number(downloadSummaryRow.downloads_last7_days ?? 0),
      downloadsLast30Days: Number(downloadSummaryRow.downloads_last30_days ?? 0),
      knownLocationDownloads,
      locationCoverageRate: calculateSafeRate(knownLocationDownloads, totalDownloads),
    },
    charts: {
      downloadsOverTime: downloadsOverTime.map((row) => ({
        day: row.day,
        downloads: row.allDownloads,
        uniqueVisitors: row.uniqueDownloaders,
      })),
      topCountries: topCountries.map((row) => ({
        country: row.country,
        downloads: row.windowsDownloads,
        uniqueVisitors: row.uniqueVisitors,
      })),
      topCities: topCities.map((row) => ({
        city: row.city,
        country: row.country,
        downloads: row.windowsDownloads,
        uniqueVisitors: row.uniqueVisitors,
      })),
      sourceBreakdown: sourcePerformance.map((row) => ({
        source: row.label,
        downloads: row.windowsDownloads,
      })),
      pageBreakdown: pageBreakdownResult.rows.map((row: AnalyticsRow) => ({
        path: String(row.path),
        downloads: Number(row.downloads ?? 0),
        uniqueVisitors: Number(row.unique_visitors ?? 0),
      })),
      deviceBreakdown: deviceBreakdown.map((row) => ({
        device: row.segment,
        downloads: row.downloadEvents,
      })),
    },
    recentDownloads: recentDownloadsResult.rows.map((row: AnalyticsRow) => ({
      id: String(row.id),
      anonymousVisitorId: String(row.anonymous_visitor_id),
      sessionId: String(row.session_id),
      assetLabel: row.asset_label ? String(row.asset_label) : null,
      downloadUrl: null,
      pagePath: row.route_template ? String(row.route_template) : row.page_path ? String(row.page_path) : null,
      referrer: row.referrer ? String(row.referrer) : null,
      utmSource: row.utm_source ? String(row.utm_source) : null,
      browser: row.browser ? String(row.browser) : null,
      operatingSystem: row.operating_system ? String(row.operating_system) : null,
      location: formatLocationLabel(row.city, row.region, row.country_name),
      createdAt: String(row.created_at),
    })),
    insights: {
      availability,
      trackedEvents: [
        {
          eventName: "landing_view",
          status: "available",
          table: "analytics_visitor_page_views",
          timestampColumn: "viewed_at",
          visitorIdColumn: "anonymous_visitor_id",
          sessionIdColumn: "session_id",
        },
        {
          eventName: "windows_installer_downloaded",
          status: "available",
          table: "analytics_download_events",
          timestampColumn: "created_at",
          visitorIdColumn: "anonymous_visitor_id",
          sessionIdColumn: "session_id",
        },
        {
          eventName: "mobile_landing_view",
          status: "derived",
          table: "analytics_visitor_page_views",
          timestampColumn: "viewed_at",
          visitorIdColumn: "anonymous_visitor_id",
          sessionIdColumn: "session_id",
        },
        {
          eventName: "windows_link_requested",
          status: "available",
          table: "guest_activity_events",
          timestampColumn: "created_at",
          visitorIdColumn: "anonymous_visitor_id",
          sessionIdColumn: "session_id",
        },
        {
          eventName: "download_link_shared",
          status: "available",
          table: "guest_activity_events",
          timestampColumn: "created_at",
          visitorIdColumn: "anonymous_visitor_id",
          sessionIdColumn: "session_id",
        },
        {
          eventName: "download_link_copied",
          status: "available",
          table: "guest_activity_events",
          timestampColumn: "created_at",
          visitorIdColumn: "anonymous_visitor_id",
          sessionIdColumn: "session_id",
        },
        {
          eventName: "app_first_open",
          status: "available",
          table: "guest_activity_events",
          timestampColumn: "created_at",
          visitorIdColumn: "anonymous_visitor_id",
          sessionIdColumn: "session_id",
        },
        {
          eventName: "first_extraction_completed",
          status: "available",
          table: "guest_activity_events",
          timestampColumn: "created_at",
          visitorIdColumn: "anonymous_visitor_id",
          sessionIdColumn: "session_id",
        },
        {
          eventName: "free_30_limit_reached",
          status: "available",
          table: "guest_activity_events",
          timestampColumn: "created_at",
          visitorIdColumn: "anonymous_visitor_id",
          sessionIdColumn: "session_id",
        },
        {
          eventName: "plans_opened",
          status: "available",
          table: "guest_activity_events",
          timestampColumn: "created_at",
          visitorIdColumn: "anonymous_visitor_id",
          sessionIdColumn: "session_id",
        },
        {
          eventName: "checkout_started",
          status: "available",
          table: "guest_activity_events",
          timestampColumn: "created_at",
          visitorIdColumn: "anonymous_visitor_id",
          sessionIdColumn: "session_id",
        },
        {
          eventName: "payment_completed",
          status: "available",
          table: "guest_activity_events",
          timestampColumn: "created_at",
          visitorIdColumn: "anonymous_visitor_id",
          sessionIdColumn: "session_id",
        },
        ...Array.from(B2B_UNAVAILABLE_EVENT_KEYS).map((eventName) => ({
          eventName,
          status: "not_available",
          table: null,
          timestampColumn: null,
          visitorIdColumn: null,
          sessionIdColumn: null,
        })),
      ],
      traffic: {
        totalLandingPageVisitors: landingSessions,
        uniqueVisitors,
        mobileTabletVisitors: mobileVisitors,
        windowsDesktopVisitors,
        otherDesktopVisitors,
        unknownDeviceVisitors,
        mobileVisitorPercentage: calculateSafeRate(mobileVisitors, uniqueVisitors),
        mobileLandingViews,
      },
      mobileActions: {
        mobileLandingViews,
        emailLinkRequests,
        successfulLinkShares,
        downloadLinkCopies,
        mobileExeDownloads,
        mobileLinkSaveConversionRate: calculateSafeRate(uniqueMobileLinkSaveVisitors, mobileVisitors),
      },
      windowsFunnel: {
        windowsInstallerDownloads: windowsDownloads,
        uniqueWindowsDownloaders,
        appFirstOpens,
        firstExtractionsCompleted,
        free30LimitReached,
        plansOpened,
        checkoutStarted,
        paymentsCompleted,
      },
      conversionRates: {
        visitorToWindowsDownloadRate: calculateSafeRate(uniqueWindowsDownloaders, uniqueVisitors),
        windowsDownloadToFirstOpenRate: calculateSafeRate(appFirstOpens, uniqueWindowsDownloaders),
        firstOpenToFirstExtractionRate: calculateSafeRate(firstExtractionsCompleted, appFirstOpens),
        firstExtractionToFreeLimitRate: calculateSafeRate(free30LimitReached, firstExtractionsCompleted),
        freeLimitToPlansOpenedRate: calculateSafeRate(plansOpened, free30LimitReached),
        plansOpenedToCheckoutRate: calculateSafeRate(checkoutStarted, plansOpened),
        checkoutToPaymentRate: calculateSafeRate(paymentsCompleted, checkoutStarted),
        overallVisitorToPaymentRate: calculateSafeRate(paymentsCompleted, uniqueVisitors),
      },
      deviceBreakdown,
      downloadClassification,
      downloadsOverTime: downloadsOverTime.map((row) => ({
        day: row.day,
        allDownloads: row.allDownloads,
        uniqueDownloaders: row.uniqueDownloaders,
        windowsDownloads: row.windowsDownloads,
        mobileExeDownloads: row.mobileExeDownloads,
        emailLinkRequests: Number((row as AnalyticsRow).emailLinkRequests ?? 0),
        successfulLinkShares: Number((row as AnalyticsRow).successfulLinkShares ?? 0),
        downloadLinkCopies: Number((row as AnalyticsRow).downloadLinkCopies ?? 0),
        appFirstOpens: Number((row as AnalyticsRow).appFirstOpens ?? 0),
        firstExtractions: Number((row as AnalyticsRow).firstExtractions ?? 0),
        payments: Number((row as AnalyticsRow).payments ?? 0),
      })),
      sourcePerformance,
      topCountries,
      topCities,
      mobileFunnel: {
        crossDeviceAttributionAvailable: false,
        note: "Cross-device attribution is not yet available. Mobile visitors and later Windows/app stages are shown separately.",
        stages: [
          { key: "unique_mobile_visitors", label: "Unique mobile visitors", value: mobileVisitors, available: true },
          { key: "link_saved_or_requested", label: "Link saved/requested", value: uniqueMobileLinkSaveVisitors, available: true },
          { key: "later_windows_download", label: "Later Windows download", value: windowsDownloads, available: false },
          { key: "app_first_open", label: "App first open", value: appFirstOpens, available: true },
          { key: "first_extraction", label: "First extraction", value: firstExtractionsCompleted, available: true },
          { key: "free_limit_reached", label: "Free limit reached", value: free30LimitReached, available: true },
          { key: "checkout_started", label: "Checkout started", value: checkoutStarted, available: true },
          { key: "payment_completed", label: "Payment completed", value: paymentsCompleted, available: true },
        ],
      },
      failedLinkRequests: {
        available: true,
        total: failedLinkRequests,
        breakdown: [
          { category: "Validation rejected", count: 0 },
          { category: "Rate limited", count: 0 },
          { category: "Email provider failure", count: 0 },
          { category: "Network/server failure", count: failedLinkRequests },
          { category: "Unknown safe category", count: 0 },
        ],
      },
      recentMobileActions: {
        items: recentMobileActionsItems,
        pagination: {
          page: filters.recentMobileActionsPage,
          limit: B2B_TABLE_PAGE_SIZE,
          total: recentMobileActionsTotal,
          totalPages: Math.max(1, Math.ceil(recentMobileActionsTotal / B2B_TABLE_PAGE_SIZE)),
        },
      },
      recentDownloadTable: {
        items: recentDownloadsResult.rows.map((row: AnalyticsRow) => {
          const classification = classifyB2BDownload(
            row.device_category ? String(row.device_category) : null,
            row.operating_system ? String(row.operating_system) : null
          );
          return {
            downloadedAt: String(row.created_at),
            deviceCategory: row.device_category ? String(row.device_category) : "unknown",
            operatingSystem: row.operating_system ? String(row.operating_system) : "Other / Unknown",
            browser: row.browser ? String(row.browser) : "Other / Unknown",
            location: formatLocationLabel(row.city, row.region, row.country_name),
            sourceCampaign: formatCampaignLabel(
              row.utm_source ? String(row.utm_source) : null,
              row.utm_medium ? String(row.utm_medium) : null,
              row.utm_campaign ? String(row.utm_campaign) : null
            ),
            downloadClassification: classification,
            installerVersion: null,
            isRepeatDownload: Number(row.visitor_download_index ?? 1) > 1,
            visitorId: String(row.anonymous_visitor_id),
            laterAppFirstOpen: null,
            laterFirstExtraction: null,
            paymentStatus: null,
            pagePath: row.route_template ? String(row.route_template) : row.page_path ? String(row.page_path) : "Unknown",
            assetLabel: row.asset_label ? String(row.asset_label) : "Installer",
          };
        }),
        pagination: {
          page: filters.recentDownloadsPage,
          limit: B2B_TABLE_PAGE_SIZE,
          total: recentDownloadsTotal,
          totalPages: Math.max(1, Math.ceil(recentDownloadsTotal / B2B_TABLE_PAGE_SIZE)),
        },
      },
      filterOptions,
      historicalNote:
        "Some funnel events became available after tracking was introduced; earlier activity may not contain every stage. App lifecycle events may still be incomplete for older periods.",
    },
  };
}

export async function getLiveVisitors() {
  const result = await queryAnalytics(
    `
      SELECT
        s.id,
        s.portal,
        s.current_path,
        s.current_page_title,
        s.country_name,
        s.region,
        s.city,
        s.visitor_type,
        s.authenticated_user_id,
        s.authenticated_vendor_id,
        s.device_category,
        s.browser,
        s.referrer,
        s.utm_source,
        s.started_at,
        s.last_activity_at,
        s.page_view_count
      FROM analytics_visitor_sessions s
      WHERE s.is_bot = FALSE
        AND s.last_activity_at >= NOW() - $1::interval
      ORDER BY s.last_activity_at DESC
    `,
    [`${LIVE_WINDOW_MINUTES} minutes`]
  );

  return result.rows.map((row: AnalyticsRow) => ({
    id: String(row.id),
    portal: String(row.portal),
    currentPath: row.current_path ? String(row.current_path) : null,
    pageTitle: row.current_page_title ? String(row.current_page_title) : null,
    location: formatLocationLabel(row.city, row.region, row.country_name),
    visitorType: String(row.visitor_type ?? "anonymous"),
    associatedUserId: row.authenticated_user_id ? String(row.authenticated_user_id) : null,
    associatedVendorId: row.authenticated_vendor_id ? String(row.authenticated_vendor_id) : null,
    device: row.device_category ? String(row.device_category) : null,
    browser: row.browser ? String(row.browser) : null,
    referrer: row.referrer ? String(row.referrer) : null,
    source: row.utm_source ? String(row.utm_source) : null,
    startedAt: row.started_at,
    lastActivityAt: row.last_activity_at,
    pageViews: Number(row.page_view_count ?? 0),
  }));
}

export async function listVisitors(input: VisitorsFilterInput) {
  const filters = parseVisitorsFilters(input);
  const { whereClause, values } = buildSessionFilterClause(filters);
  const searchIndex = values.length + 1;
  const queryValues = [...values];

  let searchClause = "";
  if (filters.search) {
    queryValues.push(`%${filters.search}%`);
    searchClause = `
      AND (
        v.anonymous_visitor_id ILIKE $${searchIndex}
        OR COALESCE(v.associated_user_id, '') ILIKE $${searchIndex}
        OR COALESCE(v.associated_vendor_id, '') ILIKE $${searchIndex}
        OR COALESCE(v.country_name, '') ILIKE $${searchIndex}
        OR COALESCE(v.city, '') ILIKE $${searchIndex}
      )
    `;
  }

  if (filters.pagePath) {
    queryValues.push(`%${filters.pagePath}%`);
    searchClause += ` AND EXISTS (
      SELECT 1 FROM analytics_visitor_page_views p
      WHERE p.anonymous_visitor_id = v.anonymous_visitor_id
        AND COALESCE(p.route_template, p.path, '') ILIKE $${queryValues.length}
    )`;
  }

  const sortableColumns: Record<string, string> = {
    first_seen: "first_seen",
    last_seen: "last_seen",
    sessions: "sessions",
    page_views: "page_views",
    total_duration: "total_duration",
  };

  const sortColumn = sortableColumns[filters.sortBy] ?? "last_seen";
  const summarySql = `
    WITH filtered_sessions AS (
      SELECT s.*
      FROM analytics_visitor_sessions s
      WHERE ${whereClause}
    ),
    visitor_rollup AS (
      SELECT
        v.anonymous_visitor_id AS visitor_id,
        MIN(fs.started_at) AS first_seen,
        MAX(fs.last_activity_at) AS last_seen,
        COUNT(*) AS sessions,
        COALESCE(SUM(fs.page_view_count), 0) AS page_views,
        COALESCE(SUM(fs.duration_seconds), 0) AS total_duration,
        CASE WHEN COUNT(DISTINCT fs.portal) = 1 THEN MAX(fs.portal) ELSE 'mixed' END AS portal,
        MAX(v.country_name) AS country_name,
        MAX(v.region) AS region,
        MAX(v.city) AS city,
        MAX(v.device_category) AS device_category,
        MAX(v.browser) AS browser,
        MAX(v.associated_user_id) AS associated_user_id,
        MAX(v.associated_vendor_id) AS associated_vendor_id,
        MAX(v.last_visitor_type) AS visitor_type,
        (ARRAY_AGG(fs.current_path ORDER BY fs.last_activity_at DESC NULLS LAST))[1] AS latest_page,
        (ARRAY_AGG(COALESCE(fs.utm_source, fs.referrer) ORDER BY fs.last_activity_at DESC NULLS LAST))[1] AS acquisition_source
      FROM analytics_visitors v
      INNER JOIN filtered_sessions fs ON fs.anonymous_visitor_id = v.anonymous_visitor_id
      WHERE 1 = 1
      ${searchClause}
      GROUP BY v.anonymous_visitor_id
    )
    SELECT *
    FROM visitor_rollup
    ORDER BY ${sortColumn} ${filters.sortDirection.toUpperCase()}
  `;

  const countResult = await queryAnalytics(`SELECT COUNT(*) AS total FROM (${summarySql}) visitor_rollup`, queryValues);
  const total = Number(countResult.rows[0]?.total ?? 0);

  if (filters.format === "csv") {
    const exportLimit = Math.min(total, 1000);
    const exportResult = await queryAnalytics(`${summarySql} LIMIT ${exportLimit}`, queryValues);
    const header = [
      "Visitor",
      "Portal",
      "First Seen",
      "Last Seen",
      "Location",
      "Sessions",
      "Page Views",
      "Total Duration Seconds",
      "Latest Page",
      "Device",
      "Browser",
      "Associated User",
      "Associated Vendor",
      "Acquisition Source",
    ];
    const rows = exportResult.rows.map((row: AnalyticsRow) =>
      [
        row.visitor_id,
        row.portal,
        row.first_seen,
        row.last_seen,
        formatLocationLabel(row.city, row.region, row.country_name),
        row.sessions,
        row.page_views,
        row.total_duration,
        row.latest_page ?? "",
        row.device_category ?? "",
        row.browser ?? "",
        row.associated_user_id ?? "",
        row.associated_vendor_id ?? "",
        row.acquisition_source ?? "",
      ]
        .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );

    return {
      csv: [header.join(","), ...rows].join("\n"),
      total,
    };
  }

  queryValues.push(filters.limit, filters.offset);
  const result = await queryAnalytics(
    `${summarySql} LIMIT $${queryValues.length - 1} OFFSET $${queryValues.length}`,
    queryValues
  );

  return {
    total,
    page: filters.page,
    limit: filters.limit,
    items: result.rows.map((row: AnalyticsRow) => ({
      visitorId: String(row.visitor_id),
      portal: String(row.portal),
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      location: formatLocationLabel(row.city, row.region, row.country_name),
      sessions: Number(row.sessions ?? 0),
      pageViews: Number(row.page_views ?? 0),
      totalDurationSeconds: Number(row.total_duration ?? 0),
      latestPage: row.latest_page ? String(row.latest_page) : null,
      device: row.device_category ? String(row.device_category) : null,
      browser: row.browser ? String(row.browser) : null,
      visitorType: row.visitor_type ? String(row.visitor_type) : "anonymous",
      associatedUserId: row.associated_user_id ? String(row.associated_user_id) : null,
      associatedVendorId: row.associated_vendor_id ? String(row.associated_vendor_id) : null,
      acquisitionSource: row.acquisition_source ? String(row.acquisition_source) : null,
    })),
  };
}

export async function getLocationAnalytics(input: VisitorsFilterInput) {
  const filters = parseVisitorsFilters(input);
  const { whereClause, values } = buildSessionFilterClause(filters);
  const result = await queryAnalytics(
    `
      SELECT
        COALESCE(s.country_name, 'Unknown') AS country,
        COALESCE(s.region, 'Unknown') AS region,
        COALESCE(s.city, 'Unknown') AS city,
        s.portal,
        COUNT(DISTINCT s.anonymous_visitor_id) AS visitors,
        COUNT(*) AS sessions,
        COALESCE(SUM(s.page_view_count), 0) AS page_views
      FROM analytics_visitor_sessions s
      WHERE ${whereClause}
      GROUP BY COALESCE(s.country_name, 'Unknown'), COALESCE(s.region, 'Unknown'), COALESCE(s.city, 'Unknown'), s.portal
      ORDER BY visitors DESC, sessions DESC
      LIMIT 200
    `,
    values
  );

  return result.rows.map((row: AnalyticsRow) => ({
    country: String(row.country),
    region: String(row.region),
    city: String(row.city),
    portal: String(row.portal),
    visitors: Number(row.visitors ?? 0),
    sessions: Number(row.sessions ?? 0),
    pageViews: Number(row.page_views ?? 0),
  }));
}

export async function getPageAnalytics(input: VisitorsFilterInput) {
  const filters = parseVisitorsFilters(input);
  const { whereClause, values } = buildSessionFilterClause(filters);
  const result = await queryAnalytics(
    `
      SELECT
        COALESCE(p.route_template, p.path, 'Unknown') AS path,
        p.portal,
        MAX(p.page_title) AS page_title,
        COUNT(DISTINCT p.anonymous_visitor_id) AS unique_visitors,
        COUNT(DISTINCT p.session_id) AS sessions,
        COUNT(*) AS page_views,
        COALESCE(AVG(p.duration_seconds), 0) AS average_time_on_page_seconds,
        COUNT(*) FILTER (WHERE p.is_entry = TRUE) AS entries,
        COUNT(*) FILTER (WHERE p.is_exit = TRUE) AS exits,
        MAX(p.viewed_at) AS last_viewed
      FROM analytics_visitor_page_views p
      INNER JOIN analytics_visitor_sessions s ON s.id = p.session_id
      WHERE ${whereClause.replace(/s\./g, "s.")}
      GROUP BY COALESCE(p.route_template, p.path, 'Unknown'), p.portal
      ORDER BY page_views DESC
      LIMIT 200
    `,
    values
  );

  return result.rows.map((row: AnalyticsRow) => ({
    path: String(row.path),
    portal: String(row.portal),
    pageTitle: row.page_title ? String(row.page_title) : null,
    uniqueVisitors: Number(row.unique_visitors ?? 0),
    sessions: Number(row.sessions ?? 0),
    pageViews: Number(row.page_views ?? 0),
    averageTimeOnPageSeconds: Number(row.average_time_on_page_seconds ?? 0),
    entries: Number(row.entries ?? 0),
    exits: Number(row.exits ?? 0),
    exitRate: Number(row.page_views ?? 0) > 0 ? (Number(row.exits ?? 0) / Number(row.page_views ?? 0)) * 100 : 0,
    lastViewed: row.last_viewed,
  }));
}

export async function getVisitorTrends() {
  return getVisitorAnalyticsSummary();
}

export async function getVisitorDetails(visitorId: string) {
  const [visitorResult, sessionsResult, pageViewsResult] = await Promise.all([
    queryAnalytics(
      `
        SELECT *
        FROM analytics_visitors
        WHERE anonymous_visitor_id = $1
        LIMIT 1
      `,
      [visitorId]
    ),
    queryAnalytics(
      `
        SELECT *
        FROM analytics_visitor_sessions
        WHERE anonymous_visitor_id = $1
        ORDER BY started_at DESC
      `,
      [visitorId]
    ),
    queryAnalytics(
      `
        SELECT p.*
        FROM analytics_visitor_page_views p
        WHERE p.anonymous_visitor_id = $1
        ORDER BY p.viewed_at DESC
        LIMIT 200
      `,
      [visitorId]
    ),
  ]);

  const visitor = visitorResult.rows[0];
  if (!visitor) {
    return null;
  }

  return {
    visitor: {
      visitorId: String(visitor.anonymous_visitor_id),
      firstSeenAt: visitor.first_seen_at,
      lastSeenAt: visitor.last_seen_at,
      portal: String(visitor.last_portal),
      visitorType: String(visitor.last_visitor_type ?? "anonymous"),
      associatedUserId: visitor.associated_user_id ? String(visitor.associated_user_id) : null,
      associatedVendorId: visitor.associated_vendor_id ? String(visitor.associated_vendor_id) : null,
      location: formatLocationLabel(visitor.city, visitor.region, visitor.country_name),
      device: visitor.device_category ? String(visitor.device_category) : null,
      browser: visitor.browser ? String(visitor.browser) : null,
      operatingSystem: visitor.operating_system ? String(visitor.operating_system) : null,
      language: visitor.language ? String(visitor.language) : null,
      maskedIp: visitor.masked_ip ? String(visitor.masked_ip) : null,
    },
    sessions: sessionsResult.rows.map((row: AnalyticsRow) => ({
      sessionId: String(row.id),
      portal: String(row.portal),
      startedAt: row.started_at,
      lastActivityAt: row.last_activity_at,
      endedAt: row.ended_at,
      landingPath: row.landing_path ? String(row.landing_path) : null,
      exitPath: row.exit_path ? String(row.exit_path) : null,
      referrer: row.referrer ? String(row.referrer) : null,
      utmSource: row.utm_source ? String(row.utm_source) : null,
      utmCampaign: row.utm_campaign ? String(row.utm_campaign) : null,
      pageViews: Number(row.page_view_count ?? 0),
      durationSeconds: Number(row.duration_seconds ?? 0),
    })),
    pageJourney: pageViewsResult.rows.map((row: AnalyticsRow) => ({
      pageViewId: String(row.id),
      sessionId: String(row.session_id),
      path: row.path ? String(row.path) : null,
      pageTitle: row.page_title ? String(row.page_title) : null,
      viewedAt: row.viewed_at,
      exitedAt: row.exited_at,
      durationSeconds: Number(row.duration_seconds ?? 0),
    })),
  };
}

export async function getVisitorSessionDetails(sessionId: string) {
  const [sessionResult, pageViewsResult] = await Promise.all([
    queryAnalytics(
      `
        SELECT *
        FROM analytics_visitor_sessions
        WHERE id = $1
        LIMIT 1
      `,
      [sessionId]
    ),
    queryAnalytics(
      `
        SELECT *
        FROM analytics_visitor_page_views
        WHERE session_id = $1
        ORDER BY viewed_at ASC
      `,
      [sessionId]
    ),
  ]);

  const session = sessionResult.rows[0];
  if (!session) {
    return null;
  }

  return {
    session: {
      sessionId: String(session.id),
      visitorId: String(session.anonymous_visitor_id),
      portal: String(session.portal),
      visitorType: String(session.visitor_type ?? "anonymous"),
      associatedUserId: session.authenticated_user_id ? String(session.authenticated_user_id) : null,
      associatedVendorId: session.authenticated_vendor_id ? String(session.authenticated_vendor_id) : null,
      startedAt: session.started_at,
      lastActivityAt: session.last_activity_at,
      endedAt: session.ended_at,
      landingPath: session.landing_path ? String(session.landing_path) : null,
      exitPath: session.exit_path ? String(session.exit_path) : null,
      referrer: session.referrer ? String(session.referrer) : null,
      utmSource: session.utm_source ? String(session.utm_source) : null,
      utmCampaign: session.utm_campaign ? String(session.utm_campaign) : null,
      location: formatLocationLabel(session.city, session.region, session.country_name),
      device: session.device_category ? String(session.device_category) : null,
      browser: session.browser ? String(session.browser) : null,
      pageViews: Number(session.page_view_count ?? 0),
      durationSeconds: Number(session.duration_seconds ?? 0),
    },
    pageJourney: pageViewsResult.rows.map((row: AnalyticsRow) => ({
      pageViewId: String(row.id),
      path: row.path ? String(row.path) : null,
      pageTitle: row.page_title ? String(row.page_title) : null,
      viewedAt: row.viewed_at,
      exitedAt: row.exited_at,
      durationSeconds: Number(row.duration_seconds ?? 0),
      isEntry: Boolean(row.is_entry),
      isExit: Boolean(row.is_exit),
    })),
  };
}
