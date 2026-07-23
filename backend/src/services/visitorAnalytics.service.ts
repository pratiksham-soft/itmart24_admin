import { queryAnalytics } from "./analyticsPostgres.service";

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

export async function getLiveVisitors() {
  const result = await queryAnalytics(
    `
      SELECT
        s.id,
        s.portal,
        s.current_path,
        s.current_page_title,
        COALESCE(s.city, s.region, s.country_name, 'Unknown') AS location,
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
    location: String(row.location ?? "Unknown"),
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
        [row.country_name, row.region, row.city].filter(Boolean).join(" / "),
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
      location: [row.country_name, row.region, row.city].filter(Boolean).join(" / ") || "Unknown",
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
      location: [visitor.country_name, visitor.region, visitor.city].filter(Boolean).join(" / ") || "Unknown",
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
      location: [session.country_name, session.region, session.city].filter(Boolean).join(" / ") || "Unknown",
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
