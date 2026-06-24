import { getUserPortalPool, normalizeDate } from "./userPortalUsers.service";

type GuestReportRow = {
  id: string;
  report_date: Date | string;
  report_time: string;
  website: string;
  report_type: string;
  created_at: Date | string;
  has_successful_payment?: boolean;
  report_id?: string | null;
  source_tool?: string | null;
  website_url?: string | null;
  normalized_domain?: string | null;
  competitor_url_1?: string | null;
  competitor_url_2?: string | null;
  competitor_domain_1?: string | null;
  competitor_domain_2?: string | null;
  business_type?: string | null;
  business_category?: string | null;
  target_country?: string | null;
  business_goal?: string | null;
  brand_name?: string | null;
  anonymous_visitor_id?: string | null;
  session_id?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_audience?: string | null;
  referrer?: string | null;
  landing_page_url?: string | null;
  current_url?: string | null;
  device_type?: string | null;
  browser?: string | null;
  os?: string | null;
  screen_width?: number | string | null;
  screen_height?: number | string | null;
  report_generated_at?: Date | string | null;
  report_viewed_at?: Date | string | null;
  unlock_clicked_at?: Date | string | null;
  create_account_clicked_at?: Date | string | null;
  pricing_viewed_at?: Date | string | null;
  plan_selected?: string | null;
  registration_started_at?: Date | string | null;
};

type GuestActivityEventRow = {
  id: string;
  guest_report_id: string | null;
  event_name: string;
  source_tool: string | null;
  created_at: Date | string | null;
  metadata: Record<string, unknown> | null;
  page_path: string | null;
  current_url: string | null;
  normalized_domain: string | null;
  anonymous_visitor_id: string | null;
  session_id: string | null;
  website_url: string | null;
  business_type: string | null;
  business_category: string | null;
  target_country: string | null;
  brand_name: string | null;
  competitor_domain_1: string | null;
  competitor_domain_2: string | null;
};

type GuestFeedbackRow = {
  id: string;
  guest_report_id: string | null;
  source_tool: string | null;
  report_type: string | null;
  website_url: string | null;
  normalized_domain: string | null;
  competitor_url_1: string | null;
  competitor_url_2: string | null;
  business_type: string | null;
  business_category: string | null;
  target_country: string | null;
  business_goal: string | null;
  brand_name: string | null;
  preview_usefulness: string | null;
  unlock_blocker: string | null;
  optional_message: string | null;
  contact_value: string | null;
  created_at: Date | string | null;
};

type GuestDuplicateAttemptRow = {
  guestReportId?: unknown;
  createdAt?: unknown;
  generatedAt?: unknown;
  website?: unknown;
  websiteUrl?: unknown;
  sourceTool?: unknown;
  anonymousVisitorId?: unknown;
  sessionId?: unknown;
  ipHash?: unknown;
  deviceType?: unknown;
  browser?: unknown;
  os?: unknown;
  utmSource?: unknown;
  utmMedium?: unknown;
  utmCampaign?: unknown;
  referrer?: unknown;
  landingPageUrl?: unknown;
  currentUrl?: unknown;
};

export type GuestReportEntry = {
  id: string;
  reportDate: string | null;
  reportTime: string;
  website: string;
  reportType: string;
  createdAt: string | null;
  hasSuccessfulPayment: boolean;
};

export type GuestTrackingDetails = {
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

export type GuestFeedbackEntry = {
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

export type GuestDuplicateAuditAttemptEntry = {
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

export type GuestDuplicateAuditGroup = {
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

export type GuestDuplicateAuditFilters = {
  reportType?: "SEO_HEALTH" | "AI_VISIBILITY" | "COMPETITOR_COMPARISON";
  domain?: string;
  limit?: number;
};

export type GuestDuplicateExclusionEntry = {
  id: string;
  normalizedDomain: string;
  websiteInput: string;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

const DUPLICATE_EXCLUSION_TABLE = "guest_report_duplicate_exclusions";

const mapGuestReportRow = (row: GuestReportRow): GuestReportEntry => ({
  id: row.id,
  reportDate: normalizeDate(row.report_date),
  reportTime: row.report_time,
  website: row.website,
  reportType: row.report_type,
  createdAt: normalizeDate(row.created_at),
  hasSuccessfulPayment: Boolean(row.has_successful_payment),
});

const mapGuestFeedbackRow = (row: GuestFeedbackRow): GuestFeedbackEntry => ({
  id: row.id,
  guestReportId: normalizeText(row.guest_report_id),
  sourceTool: normalizeText(row.source_tool),
  reportType: normalizeText(row.report_type),
  websiteUrl: normalizeText(row.website_url),
  normalizedDomain: normalizeText(row.normalized_domain),
  competitorUrl1: normalizeText(row.competitor_url_1),
  competitorUrl2: normalizeText(row.competitor_url_2),
  businessType: normalizeText(row.business_type),
  businessCategory: normalizeText(row.business_category),
  targetCountry: normalizeText(row.target_country),
  businessGoal: normalizeText(row.business_goal),
  brandName: normalizeText(row.brand_name),
  previewUsefulness: normalizeText(row.preview_usefulness),
  unlockBlocker: normalizeText(row.unlock_blocker),
  optionalMessage: normalizeText(row.optional_message),
  contactValue: normalizeText(row.contact_value),
  createdAt: normalizeDate(row.created_at),
});

const normalizeCount = (value: string | number | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeText = (value: string | null | undefined) => {
  const normalized = String(value ?? "").trim();
  return normalized || null;
};

const normalizeDuplicateExclusionDomain = (value: string) => {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  try {
    return new URL(trimmedValue).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    try {
      return new URL(`https://${trimmedValue}`).hostname.replace(/^www\./i, "").toLowerCase();
    } catch {
      return (
        trimmedValue
          .toLowerCase()
          .replace(/^https?:\/\//i, "")
          .split("/")[0]
          .split("?")[0]
          .replace(/^www\./i, "")
          .trim() || null
      );
    }
  }
};

const ensureGuestDuplicateExclusionsTable = async () => {
  const pool = getUserPortalPool();
  await pool.query(
    `
      CREATE TABLE IF NOT EXISTS guest_report_duplicate_exclusions (
        id UUID PRIMARY KEY,
        normalized_domain TEXT NOT NULL UNIQUE,
        website_input TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `
  );
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_guest_report_duplicate_exclusions_domain_unique ON guest_report_duplicate_exclusions (normalized_domain)`
  );
};

const normalizeToolName = (reportType: string, sourceTool: string | null | undefined) => {
  if (sourceTool) {
    return sourceTool;
  }

  const normalizedReportType = reportType.trim().toLowerCase();
  if (normalizedReportType.includes("seo")) return "guest_seo_health";
  if (normalizedReportType.includes("ai")) return "guest_ai_analysis";
  return "guest_competitor_comparison";
};

const DUPLICATE_REPORT_TYPE_LABELS: Record<
  GuestDuplicateAuditGroup["reportType"],
  string
> = {
  SEO_HEALTH: "SEO Health",
  AI_VISIBILITY: "AI Analysis",
  COMPETITOR_COMPARISON: "Competitor Comparison",
};

const DUPLICATE_REPORT_TYPE_ALIASES: Record<
  GuestDuplicateAuditGroup["reportType"],
  string[]
> = {
  SEO_HEALTH: ["SEO Health", "SEO_HEALTH"],
  AI_VISIBILITY: ["AI Analyzer", "AI_VISIBILITY"],
  COMPETITOR_COMPARISON: [
    "Competitor Comparison",
    "COMPETITOR_COMPARISON",
  ],
};

const eventSetHas = (events: GuestActivityEventRow[], names: string[]) =>
  events.some((event) => names.includes(event.event_name));

const FUNNEL_EVENT_GROUPS = {
  pageViewed: [
    "GuestSEOHealthPageView",
    "GuestAIAnalysisPageView",
    "GuestCompetitorPageView",
  ],
  formStarted: [
    "SEOHealthFormStarted",
    "AIAnalysisFormStarted",
    "CompetitorFormStarted",
  ],
  analyzeClicked: [
    "SEOHealthAnalyzeClicked",
    "AIAnalysisAnalyzeClicked",
    "CompetitorAnalyzeClicked",
  ],
  reportGenerationStarted: [
    "SEOHealthReportGenerationStarted",
    "AIAnalysisReportGenerationStarted",
    "CompetitorReportGenerationStarted",
  ],
  reportGenerated: [
    "SEOHealthReportGenerated",
    "AIAnalysisReportGenerated",
    "CompetitorReportGenerated",
  ],
  reportViewed: [
    "SEOHealthReportViewed",
    "AIAnalysisReportViewed",
    "CompetitorReportViewed",
  ],
  unlockClicked: ["GuestUnlockFullReportClicked"],
  pricingViewed: ["GuestPricingViewed"],
  planSelected: ["GuestPlanSelected"],
  createAccountClicked: ["GuestCreateAccountClicked"],
  registrationStarted: ["GuestRegistrationStarted"],
  subscriptionPlanViewed: ["GuestSubscriptionPlanViewed"],
  subscriptionBillingCycleChanged: ["GuestSubscriptionBillingCycleChanged"],
  oneTimeUnlockSectionViewed: ["GuestOneTimeUnlockSectionViewed"],
  oneTimePlanViewed: ["GuestOneTimePlanViewed"],
  oneTimePlanSelected: ["GuestOneTimePlanSelected"],
  oneTimeOtpModalOpened: ["GuestOneTimeOtpModalOpened"],
  oneTimeEmailEntered: ["GuestOneTimeEmailEntered"],
  oneTimeOtpSendClicked: ["GuestOneTimeOtpSendClicked"],
  oneTimeOtpSent: ["GuestOneTimeOtpSent"],
  oneTimeOtpSendFailed: ["GuestOneTimeOtpSendFailed"],
  oneTimeOtpVerifyClicked: ["GuestOneTimeOtpVerifyClicked"],
  oneTimeOtpVerified: ["GuestOneTimeOtpVerified"],
  oneTimeOtpVerifyFailed: ["GuestOneTimeOtpVerifyFailed"],
  oneTimeWorkspaceRedirectStarted: ["GuestOneTimeWorkspaceRedirectStarted"],
  oneTimeReportPaymentStarted: ["OneTimeReportPaymentStarted"],
  oneTimeReportPaymentSuccessful: ["OneTimeReportPaymentSuccessful"],
  oneTimeReportPaymentFailed: ["OneTimeReportPaymentFailed"],
  subscriptionPaymentSuccessful: ["SubscriptionPaymentSuccessful"],
  subscriptionPaymentFailed: ["SubscriptionPaymentFailed"],
} as const;

const buildEventDetails = (event: GuestActivityEventRow) => {
  const detailParts = [
    event.page_path ? `page: ${event.page_path}` : null,
    event.current_url ? `url: ${event.current_url}` : null,
    event.normalized_domain ? `domain: ${event.normalized_domain}` : null,
    event.website_url ? `website: ${event.website_url}` : null,
    event.business_type ? `business type: ${event.business_type}` : null,
    event.business_category ? `business category: ${event.business_category}` : null,
    event.target_country ? `target country: ${event.target_country}` : null,
    event.brand_name ? `brand: ${event.brand_name}` : null,
    event.competitor_domain_1 ? `competitor 1: ${event.competitor_domain_1}` : null,
    event.competitor_domain_2 ? `competitor 2: ${event.competitor_domain_2}` : null,
  ].filter(Boolean);

  const metadataJson =
    event.metadata && Object.keys(event.metadata).length > 0
      ? JSON.stringify(event.metadata)
      : null;

  return [...detailParts, metadataJson].filter(Boolean).join(" | ") || "-";
};

export const listGuestReports = async (): Promise<GuestReportEntry[]> => {
  const pool = getUserPortalPool();
  const result = await pool.query(
    `
      SELECT
        gr.id,
        gr.report_date,
        gr.report_time,
        gr.website,
        gr.report_type,
        gr.created_at,
        EXISTS (
          SELECT 1
          FROM guest_activity_events e
          WHERE e.guest_report_id = gr.id
            AND e.event_name IN ('OneTimeReportPaymentSuccessful', 'SubscriptionPaymentSuccessful')
        ) AS has_successful_payment
      FROM guest_report gr
      ORDER BY gr.report_date DESC, gr.report_time DESC, gr.created_at DESC
    `
  );

  return (result.rows as GuestReportRow[]).map(mapGuestReportRow);
};

export const listGuestFeedback = async (): Promise<GuestFeedbackEntry[]> => {
  const pool = getUserPortalPool();
  const result = await pool.query(
    `
      SELECT
        gf.id,
        gf.guest_report_id,
        gf.source_tool,
        gf.report_type,
        gf.website_url,
        gf.normalized_domain,
        gf.competitor_url_1,
        gf.competitor_url_2,
        gf.business_type,
        gf.business_category,
        gf.target_country,
        gf.business_goal,
        gf.brand_name,
        gf.preview_usefulness,
        gf.unlock_blocker,
        gf.optional_message,
        gf.contact_value,
        gf.created_at
      FROM guest_feedback gf
      ORDER BY gf.created_at DESC
    `
  );

  return (result.rows as GuestFeedbackRow[]).map(mapGuestFeedbackRow);
};

export const listGuestReportDuplicates = async (
  filters: GuestDuplicateAuditFilters = {}
): Promise<GuestDuplicateAuditGroup[]> => {
  const pool = getUserPortalPool();
  await ensureGuestDuplicateExclusionsTable();
  const columnsResult = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = ANY (current_schemas(false))
        AND table_name = 'guest_report'
    `
  );
  const availableColumns = new Set(
    (columnsResult.rows as Array<{ column_name: string }>).map((row) =>
      String(row.column_name)
    )
  );
  const hasColumn = (name: string) => availableColumns.has(name);
  const websiteSourceExpression = hasColumn("website_url")
    ? "COALESCE(website_url, website)"
    : "website";
  const normalizedDomainExpression = hasColumn("normalized_domain")
    ? `COALESCE(NULLIF(BTRIM(normalized_domain), ''), LOWER(REGEXP_REPLACE(SPLIT_PART(SPLIT_PART(SPLIT_PART(COALESCE(${websiteSourceExpression}, website), '://', 2), '/', 1), '?', 1), '^www\\.', '')))`
    : `LOWER(REGEXP_REPLACE(SPLIT_PART(SPLIT_PART(SPLIT_PART(COALESCE(${websiteSourceExpression}, website), '://', 2), '/', 1), '?', 1), '^www\\.', ''))`;
  const generatedAtExpression = hasColumn("report_generated_at")
    ? "COALESCE(report_generated_at, created_at)"
    : "created_at";
  const optionalColumnExpression = (name: string) =>
    hasColumn(name) ? name : `NULL::text`;
  const ipHashExpression = hasColumn("ip_hash") ? "ip_hash" : "NULL::text";
  const whereClauses: string[] = [
    `${normalizedDomainExpression} IS NOT NULL`,
    `BTRIM(${normalizedDomainExpression}) <> ''`,
  ];
  const values: unknown[] = [];

  if (filters.reportType) {
    values.push(DUPLICATE_REPORT_TYPE_ALIASES[filters.reportType]);
    whereClauses.push(`report_type = ANY($${values.length}::text[])`);
  }

  if (filters.domain?.trim()) {
    values.push(`%${filters.domain.trim().toLowerCase()}%`);
    whereClauses.push(`LOWER(${normalizedDomainExpression}) LIKE $${values.length}`);
  }

  values.push(Math.min(Math.max(Number(filters.limit ?? 100), 1), 250));

  const result = await pool.query(
    `
      WITH duplicate_groups AS (
        SELECT
          ${normalizedDomainExpression} AS normalized_domain,
          CASE
            WHEN report_type IN ('SEO Health', 'SEO_HEALTH') THEN 'SEO_HEALTH'
            WHEN report_type IN ('AI Analyzer', 'AI_VISIBILITY') THEN 'AI_VISIBILITY'
            WHEN report_type IN ('Competitor Comparison', 'COMPETITOR_COMPARISON') THEN 'COMPETITOR_COMPARISON'
            ELSE NULL
          END AS report_type_key,
          COUNT(*)::int AS attempt_count,
          MIN(${generatedAtExpression}) AS first_generated_at,
          MAX(${generatedAtExpression}) AS latest_generated_at,
          COUNT(DISTINCT ${optionalColumnExpression("anonymous_visitor_id")})::int AS unique_anonymous_visitors,
          COUNT(DISTINCT ${optionalColumnExpression("session_id")})::int AS unique_sessions,
          COUNT(DISTINCT ${ipHashExpression})::int AS unique_ip_hashes
        FROM guest_report
        WHERE ${whereClauses.join(" AND ")}
        GROUP BY normalized_domain, report_type_key
        HAVING COUNT(*) > 1 AND report_type_key IS NOT NULL
      )
      SELECT
        g.normalized_domain,
        g.report_type_key,
        EXISTS (
          SELECT 1
          FROM guest_report_duplicate_exclusions ex
          WHERE ex.normalized_domain = g.normalized_domain
        ) AS is_excluded,
        g.attempt_count,
        g.first_generated_at,
        g.latest_generated_at,
        g.unique_anonymous_visitors,
        g.unique_sessions,
        g.unique_ip_hashes,
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'guestReportId', gr.id,
              'createdAt', gr.created_at,
              'generatedAt', ${hasColumn("report_generated_at") ? "COALESCE(gr.report_generated_at, gr.created_at)" : "gr.created_at"},
              'website', gr.website,
              'websiteUrl', ${hasColumn("website_url") ? "gr.website_url" : "NULL::text"},
              'sourceTool', ${hasColumn("source_tool") ? "gr.source_tool" : "NULL::text"},
              'anonymousVisitorId', ${hasColumn("anonymous_visitor_id") ? "gr.anonymous_visitor_id" : "NULL::text"},
              'sessionId', ${hasColumn("session_id") ? "gr.session_id" : "NULL::text"},
              'ipHash', ${hasColumn("ip_hash") ? "gr.ip_hash" : "NULL::text"},
              'deviceType', ${hasColumn("device_type") ? "gr.device_type" : "NULL::text"},
              'browser', ${hasColumn("browser") ? "gr.browser" : "NULL::text"},
              'os', ${hasColumn("os") ? "gr.os" : "NULL::text"},
              'utmSource', ${hasColumn("utm_source") ? "gr.utm_source" : "NULL::text"},
              'utmMedium', ${hasColumn("utm_medium") ? "gr.utm_medium" : "NULL::text"},
              'utmCampaign', ${hasColumn("utm_campaign") ? "gr.utm_campaign" : "NULL::text"},
              'referrer', ${hasColumn("referrer") ? "gr.referrer" : "NULL::text"},
              'landingPageUrl', ${hasColumn("landing_page_url") ? "gr.landing_page_url" : "NULL::text"},
              'currentUrl', ${hasColumn("current_url") ? "gr.current_url" : "NULL::text"}
            )
            ORDER BY ${hasColumn("report_generated_at") ? "COALESCE(gr.report_generated_at, gr.created_at)" : "gr.created_at"} DESC, gr.created_at DESC
          )
          FROM guest_report gr
          WHERE ${hasColumn("normalized_domain")
            ? `COALESCE(NULLIF(BTRIM(gr.normalized_domain), ''), LOWER(REGEXP_REPLACE(SPLIT_PART(SPLIT_PART(SPLIT_PART(COALESCE(${hasColumn("website_url") ? "gr.website_url" : "gr.website"}, gr.website), '://', 2), '/', 1), '?', 1), '^www\\.', '')))`
            : `LOWER(REGEXP_REPLACE(SPLIT_PART(SPLIT_PART(SPLIT_PART(COALESCE(${hasColumn("website_url") ? "gr.website_url" : "gr.website"}, gr.website), '://', 2), '/', 1), '?', 1), '^www\\.', ''))`} = g.normalized_domain
            AND (
              (g.report_type_key = 'SEO_HEALTH' AND gr.report_type IN ('SEO Health', 'SEO_HEALTH'))
              OR (g.report_type_key = 'AI_VISIBILITY' AND gr.report_type IN ('AI Analyzer', 'AI_VISIBILITY'))
              OR (g.report_type_key = 'COMPETITOR_COMPARISON' AND gr.report_type IN ('Competitor Comparison', 'COMPETITOR_COMPARISON'))
            )
        ) AS attempts_json
      FROM duplicate_groups g
      ORDER BY g.latest_generated_at DESC
      LIMIT $${values.length}
    `,
    values
  );

  return (result.rows as Array<{
    normalized_domain: string;
    report_type_key: GuestDuplicateAuditGroup["reportType"];
    is_excluded: boolean;
    attempt_count: string | number;
    first_generated_at: string | Date | null;
    latest_generated_at: string | Date | null;
    unique_anonymous_visitors: string | number;
    unique_sessions: string | number;
    unique_ip_hashes: string | number;
    attempts_json: unknown;
  }>).map((row) => {
    const reportType = String(row.report_type_key) as GuestDuplicateAuditGroup["reportType"];
    const attemptsJson = Array.isArray(row.attempts_json)
      ? (row.attempts_json as GuestDuplicateAttemptRow[])
      : [];

    return {
      normalizedDomain: String(row.normalized_domain),
      reportType,
      reportTypeLabel: DUPLICATE_REPORT_TYPE_LABELS[reportType] ?? reportType,
      isExcluded: Boolean(row.is_excluded),
      totalAttempts: normalizeCount(row.attempt_count),
      firstGeneratedAt: normalizeDate(row.first_generated_at),
      latestGeneratedAt: normalizeDate(row.latest_generated_at),
      uniqueAnonymousVisitors: normalizeCount(row.unique_anonymous_visitors),
      uniqueSessions: normalizeCount(row.unique_sessions),
      uniqueIpHashes: normalizeCount(row.unique_ip_hashes),
      attempts: attemptsJson.map((attempt) => ({
        guestReportId: String(attempt.guestReportId ?? ""),
        createdAt: normalizeDate((attempt.createdAt as string | Date | null | undefined) ?? null),
        generatedAt: normalizeDate(
          (attempt.generatedAt as string | Date | null | undefined) ?? null
        ),
        website: String(attempt.website ?? ""),
        websiteUrl: normalizeText(attempt.websiteUrl as string | null | undefined),
        sourceTool: normalizeText(attempt.sourceTool as string | null | undefined),
        anonymousVisitorId: normalizeText(
          attempt.anonymousVisitorId as string | null | undefined
        ),
        sessionId: normalizeText(attempt.sessionId as string | null | undefined),
        ipHash: normalizeText(attempt.ipHash as string | null | undefined),
        deviceType: normalizeText(attempt.deviceType as string | null | undefined),
        browser: normalizeText(attempt.browser as string | null | undefined),
        os: normalizeText(attempt.os as string | null | undefined),
        utmSource: normalizeText(attempt.utmSource as string | null | undefined),
        utmMedium: normalizeText(attempt.utmMedium as string | null | undefined),
        utmCampaign: normalizeText(attempt.utmCampaign as string | null | undefined),
        referrer: normalizeText(attempt.referrer as string | null | undefined),
        landingPageUrl: normalizeText(
          attempt.landingPageUrl as string | null | undefined
        ),
        currentUrl: normalizeText(attempt.currentUrl as string | null | undefined),
      })),
    };
  });
};

export const listGuestReportDuplicateExclusions = async (): Promise<
  GuestDuplicateExclusionEntry[]
> => {
  const pool = getUserPortalPool();
  await ensureGuestDuplicateExclusionsTable();
  const result = await pool.query(
    `
      SELECT
        id,
        normalized_domain,
        website_input,
        notes,
        created_at,
        updated_at
      FROM guest_report_duplicate_exclusions
      ORDER BY normalized_domain ASC, created_at DESC
    `
  );

  return (result.rows as Array<{
    id: string;
    normalized_domain: string;
    website_input: string;
    notes: string | null;
    created_at: string | Date | null;
    updated_at: string | Date | null;
  }>).map((row) => ({
    id: String(row.id),
    normalizedDomain: String(row.normalized_domain),
    websiteInput: String(row.website_input),
    notes: normalizeText(row.notes),
    createdAt: normalizeDate(row.created_at),
    updatedAt: normalizeDate(row.updated_at),
  }));
};

export const addGuestReportDuplicateExclusion = async (input: {
  website: string;
  notes?: string;
}): Promise<GuestDuplicateExclusionEntry> => {
  const pool = getUserPortalPool();
  await ensureGuestDuplicateExclusionsTable();

  const normalizedDomain = normalizeDuplicateExclusionDomain(input.website);
  if (!normalizedDomain) {
    throw new Error("A valid website or domain is required.");
  }

  const result = await pool.query(
    `
      INSERT INTO guest_report_duplicate_exclusions (
        id,
        normalized_domain,
        website_input,
        notes,
        created_at,
        updated_at
      )
      VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())
      ON CONFLICT (normalized_domain)
      DO UPDATE
      SET
        website_input = EXCLUDED.website_input,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING
        id,
        normalized_domain,
        website_input,
        notes,
        created_at,
        updated_at
    `,
    [normalizedDomain, input.website.trim(), input.notes?.trim() ?? ""]
  );

  const row = result.rows[0] as {
    id: string;
    normalized_domain: string;
    website_input: string;
    notes: string | null;
    created_at: string | Date | null;
    updated_at: string | Date | null;
  };

  return {
    id: String(row.id),
    normalizedDomain: String(row.normalized_domain),
    websiteInput: String(row.website_input),
    notes: normalizeText(row.notes),
    createdAt: normalizeDate(row.created_at),
    updatedAt: normalizeDate(row.updated_at),
  };
};

export const removeGuestReportDuplicateExclusion = async (
  exclusionId: string
): Promise<{ id: string }> => {
  const pool = getUserPortalPool();
  await ensureGuestDuplicateExclusionsTable();
  const result = await pool.query(
    `
      DELETE FROM guest_report_duplicate_exclusions
      WHERE id = $1
      RETURNING id
    `,
    [exclusionId]
  );

  if (!result.rowCount) {
    throw new Error("Excluded website not found.");
  }

  return {
    id: String(result.rows[0]?.id ?? exclusionId),
  };
};

export const getGuestReportTrackingDetails = async (
  guestReportId: string
): Promise<GuestTrackingDetails> => {
  const pool = getUserPortalPool();
  const reportResult = await pool.query(
    `
      SELECT *
      FROM guest_report
      WHERE id = $1
      LIMIT 1
    `,
    [guestReportId]
  );

  const report = reportResult.rows[0] as GuestReportRow | undefined;
  if (!report) {
    throw new Error("Guest report not found.");
  }

  const eventsResult = await pool.query(
    `
      WITH ctx AS (
        SELECT *
        FROM guest_report
        WHERE id = $1
      )
      SELECT
        e.id,
        e.guest_report_id,
        e.event_name,
        e.source_tool,
        e.created_at,
        e.metadata,
        e.page_path,
        e.current_url,
        e.normalized_domain,
        e.anonymous_visitor_id,
        e.session_id,
        e.website_url,
        e.business_type,
        e.business_category,
        e.target_country,
        e.brand_name,
        e.competitor_domain_1,
        e.competitor_domain_2
      FROM guest_activity_events e
      CROSS JOIN ctx
      WHERE e.guest_report_id = ctx.id
         OR (
           e.guest_report_id IS NULL
           AND e.created_at BETWEEN ctx.created_at - INTERVAL '6 hours' AND ctx.created_at + INTERVAL '6 hours'
           AND e.source_tool = COALESCE(ctx.source_tool, e.source_tool)
           AND (
             (ctx.session_id IS NOT NULL AND e.session_id = ctx.session_id)
             OR (
               ctx.anonymous_visitor_id IS NOT NULL
               AND e.anonymous_visitor_id = ctx.anonymous_visitor_id
               AND COALESCE(e.normalized_domain, '') = COALESCE(ctx.normalized_domain, '')
             )
           )
         )
      ORDER BY e.created_at ASC
    `,
    [guestReportId]
  );

  const events = eventsResult.rows as GuestActivityEventRow[];

  const duplicateSignalsResult = await pool.query(
    `
      SELECT
        CASE WHEN $1::text IS NULL OR BTRIM($1::text) = '' THEN 0 ELSE (SELECT COUNT(*)::int FROM guest_report WHERE anonymous_visitor_id = $1) END AS same_visitor_report_count,
        CASE WHEN $2::text IS NULL OR BTRIM($2::text) = '' THEN 0 ELSE (SELECT COUNT(*)::int FROM guest_report WHERE session_id = $2) END AS same_session_report_count,
        CASE WHEN $3::text IS NULL OR BTRIM($3::text) = '' THEN 0 ELSE (SELECT COUNT(*)::int FROM guest_report WHERE normalized_domain = $3) END AS same_domain_report_count
    `,
    [
      normalizeText(report.anonymous_visitor_id),
      normalizeText(report.session_id),
      normalizeText(report.normalized_domain),
    ]
  );

  const duplicateCounts = duplicateSignalsResult.rows[0] as
    | {
        same_visitor_report_count: number | string;
        same_session_report_count: number | string;
        same_domain_report_count: number | string;
      }
    | undefined;

  const reportViewed =
    Boolean(report.report_viewed_at) ||
    eventSetHas(events, [...FUNNEL_EVENT_GROUPS.reportViewed]);

  return {
    report: {
      website: report.website,
      normalizedDomain: normalizeText(report.normalized_domain),
      reportType: report.report_type,
      reportId: normalizeText(report.report_id),
      guestReportId: report.id,
      loggedAt: normalizeDate(report.created_at),
      reportSchedule: `${normalizeDate(report.report_date) ?? "-"} ${report.report_time ?? "-"}`.trim(),
      sourceTool: normalizeToolName(report.report_type, report.source_tool),
      reportViewed,
      reportGeneratedAt: normalizeDate(report.report_generated_at ?? report.created_at),
      reportViewedAt: normalizeDate(report.report_viewed_at ?? null),
    },
    visitor: {
      anonymousVisitorId: normalizeText(report.anonymous_visitor_id),
      sessionId: normalizeText(report.session_id),
      deviceType: normalizeText(report.device_type),
      browser: normalizeText(report.browser),
      os: normalizeText(report.os),
      screenSize:
        report.screen_width && report.screen_height
          ? `${report.screen_width} x ${report.screen_height}`
          : null,
      referrer: normalizeText(report.referrer),
      landingPageUrl: normalizeText(report.landing_page_url),
      currentUrl: normalizeText(report.current_url),
    },
    campaign: {
      utmSource: normalizeText(report.utm_source),
      utmMedium: normalizeText(report.utm_medium),
      utmCampaign: normalizeText(report.utm_campaign),
      utmContent: normalizeText(report.utm_content),
      utmAudience: normalizeText(report.utm_audience),
    },
    inputs: {
      websiteUrl: normalizeText(report.website_url) ?? report.website,
      normalizedDomain: normalizeText(report.normalized_domain),
      businessType: normalizeText(report.business_type),
      businessCategory: normalizeText(report.business_category),
      targetCountry: normalizeText(report.target_country),
      businessGoal: normalizeText(report.business_goal),
      brandName: normalizeText(report.brand_name),
      competitorUrl1: normalizeText(report.competitor_url_1),
      competitorUrl2: normalizeText(report.competitor_url_2),
      competitorDomain1: normalizeText(report.competitor_domain_1),
      competitorDomain2: normalizeText(report.competitor_domain_2),
    },
    funnel: {
      pageViewed: eventSetHas(events, [...FUNNEL_EVENT_GROUPS.pageViewed]),
      formStarted: eventSetHas(events, [...FUNNEL_EVENT_GROUPS.formStarted]),
      analyzeClicked: eventSetHas(events, [...FUNNEL_EVENT_GROUPS.analyzeClicked]),
      reportGenerationStarted: eventSetHas(events, [
        ...FUNNEL_EVENT_GROUPS.reportGenerationStarted,
      ]),
      reportGenerated:
        Boolean(report.report_generated_at) ||
        eventSetHas(events, [...FUNNEL_EVENT_GROUPS.reportGenerated]),
      reportViewed,
      unlockClicked:
        Boolean(report.unlock_clicked_at) ||
        eventSetHas(events, [...FUNNEL_EVENT_GROUPS.unlockClicked]),
      pricingViewed:
        Boolean(report.pricing_viewed_at) ||
        eventSetHas(events, [...FUNNEL_EVENT_GROUPS.pricingViewed]),
      planSelected:
        Boolean(report.plan_selected) ||
        eventSetHas(events, [...FUNNEL_EVENT_GROUPS.planSelected]),
      createAccountClicked:
        Boolean(report.create_account_clicked_at) ||
        eventSetHas(events, [...FUNNEL_EVENT_GROUPS.createAccountClicked]),
      registrationStarted:
        Boolean(report.registration_started_at) ||
        eventSetHas(events, [...FUNNEL_EVENT_GROUPS.registrationStarted]),
      subscriptionPlanViewed: eventSetHas(events, [
        ...FUNNEL_EVENT_GROUPS.subscriptionPlanViewed,
      ]),
      subscriptionBillingCycleChanged: eventSetHas(events, [
        ...FUNNEL_EVENT_GROUPS.subscriptionBillingCycleChanged,
      ]),
      oneTimeUnlockSectionViewed: eventSetHas(events, [
        ...FUNNEL_EVENT_GROUPS.oneTimeUnlockSectionViewed,
      ]),
      oneTimePlanViewed: eventSetHas(events, [...FUNNEL_EVENT_GROUPS.oneTimePlanViewed]),
      oneTimePlanSelected: eventSetHas(events, [
        ...FUNNEL_EVENT_GROUPS.oneTimePlanSelected,
      ]),
      oneTimeOtpModalOpened: eventSetHas(events, [
        ...FUNNEL_EVENT_GROUPS.oneTimeOtpModalOpened,
      ]),
      oneTimeEmailEntered: eventSetHas(events, [
        ...FUNNEL_EVENT_GROUPS.oneTimeEmailEntered,
      ]),
      oneTimeOtpSendClicked: eventSetHas(events, [
        ...FUNNEL_EVENT_GROUPS.oneTimeOtpSendClicked,
      ]),
      oneTimeOtpSent: eventSetHas(events, [...FUNNEL_EVENT_GROUPS.oneTimeOtpSent]),
      oneTimeOtpSendFailed: eventSetHas(events, [
        ...FUNNEL_EVENT_GROUPS.oneTimeOtpSendFailed,
      ]),
      oneTimeOtpVerifyClicked: eventSetHas(events, [
        ...FUNNEL_EVENT_GROUPS.oneTimeOtpVerifyClicked,
      ]),
      oneTimeOtpVerified: eventSetHas(events, [
        ...FUNNEL_EVENT_GROUPS.oneTimeOtpVerified,
      ]),
      oneTimeOtpVerifyFailed: eventSetHas(events, [
        ...FUNNEL_EVENT_GROUPS.oneTimeOtpVerifyFailed,
      ]),
      oneTimeWorkspaceRedirectStarted: eventSetHas(events, [
        ...FUNNEL_EVENT_GROUPS.oneTimeWorkspaceRedirectStarted,
      ]),
      oneTimeReportPaymentStarted: eventSetHas(events, [
        ...FUNNEL_EVENT_GROUPS.oneTimeReportPaymentStarted,
      ]),
      oneTimeReportPaymentSuccessful: eventSetHas(events, [
        ...FUNNEL_EVENT_GROUPS.oneTimeReportPaymentSuccessful,
      ]),
      oneTimeReportPaymentFailed: eventSetHas(events, [
        ...FUNNEL_EVENT_GROUPS.oneTimeReportPaymentFailed,
      ]),
      subscriptionPaymentSuccessful: eventSetHas(events, [
        ...FUNNEL_EVENT_GROUPS.subscriptionPaymentSuccessful,
      ]),
      subscriptionPaymentFailed: eventSetHas(events, [
        ...FUNNEL_EVENT_GROUPS.subscriptionPaymentFailed,
      ]),
    },
    duplicateSignals: {
      sameVisitorReportCount: normalizeCount(
        duplicateCounts?.same_visitor_report_count
      ),
      sameSessionReportCount: normalizeCount(
        duplicateCounts?.same_session_report_count
      ),
      sameDomainReportCount: normalizeCount(
        duplicateCounts?.same_domain_report_count
      ),
      isRepeatedDomain:
        normalizeCount(duplicateCounts?.same_domain_report_count) > 1,
      isRepeatedVisitor:
        normalizeCount(duplicateCounts?.same_visitor_report_count) > 1,
      isRepeatedSession:
        normalizeCount(duplicateCounts?.same_session_report_count) > 1,
    },
    events: events.map((event) => ({
      id: event.id,
      time: normalizeDate(event.created_at),
      event: event.event_name,
      details: buildEventDetails(event),
    })),
  };
};
