import { getUserPortalPool, normalizeDate } from "./userPortalUsers.service";

type GuestReportRow = {
  id: string;
  report_date: Date | string;
  report_time: string;
  website: string;
  report_type: string;
  created_at: Date | string;
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

export type GuestReportEntry = {
  id: string;
  reportDate: string | null;
  reportTime: string;
  website: string;
  reportType: string;
  createdAt: string | null;
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

const mapGuestReportRow = (row: GuestReportRow): GuestReportEntry => ({
  id: row.id,
  reportDate: normalizeDate(row.report_date),
  reportTime: row.report_time,
  website: row.website,
  reportType: row.report_type,
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

const normalizeToolName = (reportType: string, sourceTool: string | null | undefined) => {
  if (sourceTool) {
    return sourceTool;
  }

  const normalizedReportType = reportType.trim().toLowerCase();
  if (normalizedReportType.includes("seo")) return "guest_seo_health";
  if (normalizedReportType.includes("ai")) return "guest_ai_analysis";
  return "guest_competitor_comparison";
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
        id,
        report_date,
        report_time,
        website,
        report_type,
        created_at
      FROM guest_report
      ORDER BY report_date DESC, report_time DESC, created_at DESC
    `
  );

  return (result.rows as GuestReportRow[]).map(mapGuestReportRow);
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
