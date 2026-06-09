import { getUserPortalPool, normalizeDate } from "./userPortalUsers.service";

type ActiveSubscriptionRow = {
  id: string;
  plan_name: string;
  plan_slug: string;
  period_label: string;
  currency_code: string;
  amount_paid: string | number;
  status: string;
  starts_at: Date | string;
  expires_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
};

type AccessOverrideRow = {
  user_id: string;
  unlimited_access: boolean;
  feature_limits: unknown;
  updated_at: Date | string | null;
};

type CountRow = {
  count: string | number | null;
};

type FeatureLimitKey =
  | "maxProjects"
  | "monthlyUrlChecks"
  | "monthlyProjectAnalysisReports"
  | "maxCompetitorsPerComparison"
  | "monthlyGrowthPlans"
  | "reportHistoryLimit";

type FeatureFlagKey =
  | "canUseProjectAnalyzer"
  | "canUseCompetitorComparison"
  | "canUseGrowthAdvisor"
  | "canExportReports"
  | "canUseTrustAndConversionGapAnalyzer"
  | "canUseNinetyDayRoadmap"
  | "canUseSearchConsoleInsights"
  | "canUseAdvancedMonitoringSuggestions"
  | "canUseAgencyReadyExports";

type PlanAccessTemplate = Record<FeatureLimitKey, number> &
  Record<FeatureFlagKey, boolean> & {
    hasActivePlan: boolean;
    planKey: "none" | "basic" | "enterprise";
  };

export type ActiveSubscriptionSummary = {
  id: string;
  planName: string;
  planSlug: string;
  periodLabel: string;
  currencyCode: string;
  amountPaid: number;
  status: string;
  startsAt: string | null;
  expiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type FeatureUsageSummary = {
  key: FeatureLimitKey | FeatureFlagKey;
  label: string;
  description: string;
  kind: "limit" | "capability";
  editable: boolean;
  unit: string;
  enabled: boolean;
  limit: number | null;
  used: number | null;
  remaining: number | null;
  dueDate: string | null;
};

export type UserPortalAccessDetails = {
  activeSubscription: ActiveSubscriptionSummary | null;
  unlimitedAccess: boolean;
  overrideUpdatedAt: string | null;
  editableLimits: Record<FeatureLimitKey, number>;
  usage: FeatureUsageSummary[];
};

export type UpdateUserPortalAccessInput = {
  unlimitedAccess: boolean;
  expiresAt: string | null;
  featureLimits: Partial<Record<FeatureLimitKey, number>>;
};

const NO_PLAN_ACCESS: PlanAccessTemplate = {
  hasActivePlan: false,
  planKey: "none",
  maxProjects: 0,
  monthlyUrlChecks: 0,
  monthlyProjectAnalysisReports: 0,
  maxCompetitorsPerComparison: 0,
  monthlyGrowthPlans: 0,
  reportHistoryLimit: 0,
  canUseProjectAnalyzer: false,
  canUseCompetitorComparison: false,
  canUseGrowthAdvisor: false,
  canExportReports: false,
  canUseTrustAndConversionGapAnalyzer: false,
  canUseNinetyDayRoadmap: false,
  canUseSearchConsoleInsights: false,
  canUseAdvancedMonitoringSuggestions: false,
  canUseAgencyReadyExports: false,
};

const BASIC_PLAN_ACCESS: PlanAccessTemplate = {
  hasActivePlan: true,
  planKey: "basic",
  maxProjects: 1,
  monthlyUrlChecks: 50,
  monthlyProjectAnalysisReports: 3,
  maxCompetitorsPerComparison: 2,
  monthlyGrowthPlans: 1,
  reportHistoryLimit: 5,
  canUseProjectAnalyzer: true,
  canUseCompetitorComparison: true,
  canUseGrowthAdvisor: true,
  canExportReports: true,
  canUseTrustAndConversionGapAnalyzer: false,
  canUseNinetyDayRoadmap: false,
  canUseSearchConsoleInsights: false,
  canUseAdvancedMonitoringSuggestions: false,
  canUseAgencyReadyExports: false,
};

const ENTERPRISE_PLAN_ACCESS: PlanAccessTemplate = {
  hasActivePlan: true,
  planKey: "enterprise",
  maxProjects: 10,
  monthlyUrlChecks: 1000,
  monthlyProjectAnalysisReports: 50,
  maxCompetitorsPerComparison: 5,
  monthlyGrowthPlans: 20,
  reportHistoryLimit: 50,
  canUseProjectAnalyzer: true,
  canUseCompetitorComparison: true,
  canUseGrowthAdvisor: true,
  canExportReports: true,
  canUseTrustAndConversionGapAnalyzer: true,
  canUseNinetyDayRoadmap: true,
  canUseSearchConsoleInsights: true,
  canUseAdvancedMonitoringSuggestions: true,
  canUseAgencyReadyExports: true,
};

const LIMIT_KEYS: FeatureLimitKey[] = [
  "maxProjects",
  "monthlyUrlChecks",
  "monthlyProjectAnalysisReports",
  "maxCompetitorsPerComparison",
  "monthlyGrowthPlans",
  "reportHistoryLimit",
];

const FLAG_KEYS: FeatureFlagKey[] = [
  "canUseProjectAnalyzer",
  "canUseCompetitorComparison",
  "canUseGrowthAdvisor",
  "canExportReports",
  "canUseTrustAndConversionGapAnalyzer",
  "canUseNinetyDayRoadmap",
  "canUseSearchConsoleInsights",
  "canUseAdvancedMonitoringSuggestions",
  "canUseAgencyReadyExports",
];

let schemaReady = false;

const ensureUserAccessSchema = async () => {
  if (schemaReady) {
    return;
  }

  const pool = getUserPortalPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_plan_access_overrides (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      unlimited_access BOOLEAN NOT NULL DEFAULT FALSE,
      feature_limits JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  schemaReady = true;
};

const normalizeCount = (value: string | number | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const mapActiveSubscriptionRow = (
  row: ActiveSubscriptionRow
): ActiveSubscriptionSummary => ({
  id: row.id,
  planName: row.plan_name,
  planSlug: row.plan_slug,
  periodLabel: row.period_label,
  currencyCode: row.currency_code,
  amountPaid: normalizeCount(row.amount_paid),
  status: row.status,
  startsAt: normalizeDate(row.starts_at),
  expiresAt: normalizeDate(row.expires_at),
  createdAt: normalizeDate(row.created_at),
  updatedAt: normalizeDate(row.updated_at),
});

const resolvePlanTemplate = (
  activeSubscription: ActiveSubscriptionSummary | null
): PlanAccessTemplate => {
  if (!activeSubscription) {
    return NO_PLAN_ACCESS;
  }

  const normalizedSlug = activeSubscription.planSlug.trim().toLowerCase();
  return normalizedSlug === "enterprise"
    ? ENTERPRISE_PLAN_ACCESS
    : BASIC_PLAN_ACCESS;
};

const normalizeFeatureLimits = (
  value: unknown,
  baseTemplate: PlanAccessTemplate,
  unlimitedAccess: boolean
): Record<FeatureLimitKey, number> => {
  const normalized = {} as Record<FeatureLimitKey, number>;
  const source =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  LIMIT_KEYS.forEach((key) => {
    const parsed = Number(source[key]);
    if (Number.isFinite(parsed) && parsed >= 0) {
      normalized[key] = Math.floor(parsed);
      return;
    }

    normalized[key] = unlimitedAccess ? Number.MAX_SAFE_INTEGER : baseTemplate[key];
  });

  return normalized;
};

const buildUsageItems = (input: {
  dueDate: string | null;
  unlimitedAccess: boolean;
  limits: Record<FeatureLimitKey, number>;
  usageCounts: {
    projectsUsed: number;
    urlChecksUsed: number;
    analysisReportsUsed: number;
    growthPlansUsed: number;
  };
  template: PlanAccessTemplate;
}): FeatureUsageSummary[] => {
  const { dueDate, unlimitedAccess, limits, usageCounts, template } = input;

  const limitItem = (
    key: FeatureLimitKey,
    label: string,
    description: string,
    used: number | null,
    unit: string
  ): FeatureUsageSummary => {
    const limit = unlimitedAccess ? null : limits[key];
    const effectiveLimit = limit ?? 0;
    const remaining =
      unlimitedAccess || used == null ? null : Math.max(effectiveLimit - used, 0);

    return {
      key,
      label,
      description,
      kind: "limit",
      editable: true,
      unit,
      enabled: unlimitedAccess ? true : effectiveLimit > 0,
      limit,
      used,
      remaining,
      dueDate,
    };
  };

  const capabilityItem = (
    key: FeatureFlagKey,
    label: string,
    description: string
  ): FeatureUsageSummary => ({
    key,
    label,
    description,
    kind: "capability",
    editable: false,
    unit: "access",
    enabled: unlimitedAccess ? true : template[key],
    limit: null,
    used: null,
    remaining: null,
    dueDate,
  });

  return [
    limitItem(
      "maxProjects",
      "Workspace Projects",
      "Maximum active projects the user can keep in the project workspace.",
      usageCounts.projectsUsed,
      "projects"
    ),
    limitItem(
      "monthlyUrlChecks",
      "Monthly URL Checks",
      "Total URL checks available across Project Analyzer runs in the current month.",
      usageCounts.urlChecksUsed,
      "checks / month"
    ),
    limitItem(
      "monthlyProjectAnalysisReports",
      "Monthly Project Analyzer Reports",
      "Project Analyzer reports the user can generate within the current month.",
      usageCounts.analysisReportsUsed,
      "reports / month"
    ),
    limitItem(
      "maxCompetitorsPerComparison",
      "Competitors Per Comparison",
      "Maximum competitors the user can analyze in a single comparison run.",
      null,
      "competitors / run"
    ),
    limitItem(
      "monthlyGrowthPlans",
      "Monthly AI Growth Plans",
      "AI Growth Advisor reports the user can generate within the current month.",
      usageCounts.growthPlansUsed,
      "plans / month"
    ),
    limitItem(
      "reportHistoryLimit",
      "Report History Window",
      "Maximum saved reports surfaced per workspace listing.",
      null,
      "reports visible"
    ),
    capabilityItem(
      "canUseProjectAnalyzer",
      "Project Analyzer Access",
      "Allows the user to run Project Analyzer reports."
    ),
    capabilityItem(
      "canUseCompetitorComparison",
      "Competitor Comparison Access",
      "Allows the user to run competitor comparison reports."
    ),
    capabilityItem(
      "canUseGrowthAdvisor",
      "AI Growth Advisor Access",
      "Allows the user to generate AI Project Growth Advisor reports."
    ),
    capabilityItem(
      "canExportReports",
      "Report Export Access",
      "Allows the user to export generated reports."
    ),
    capabilityItem(
      "canUseTrustAndConversionGapAnalyzer",
      "Trust And Conversion Gap Analyzer",
      "Enables advanced trust and conversion analysis features."
    ),
    capabilityItem(
      "canUseNinetyDayRoadmap",
      "90-Day Roadmap",
      "Unlocks the 90-day roadmap planning features."
    ),
    capabilityItem(
      "canUseSearchConsoleInsights",
      "Search Console Insights",
      "Unlocks Search Console based insights and related flows."
    ),
    capabilityItem(
      "canUseAdvancedMonitoringSuggestions",
      "Advanced Monitoring Suggestions",
      "Unlocks advanced monitoring recommendation features."
    ),
    capabilityItem(
      "canUseAgencyReadyExports",
      "Agency-Ready Exports",
      "Unlocks agency-ready output and deliverable features."
    ),
  ];
};

const readUsageCounts = async (userId: string) => {
  const pool = getUserPortalPool();
  const [projectsResult, urlChecksResult, analysesResult, growthPlansResult] =
    await Promise.all([
      pool.query(
        `
          SELECT COUNT(*)::text AS count
          FROM user_projects
          WHERE user_id = $1
        `,
        [userId]
      ),
      pool.query(
        `
          SELECT COALESCE(SUM(COALESCE(url_checks_used, 1)), 0)::text AS count
          FROM user_project_analyses
          WHERE user_id = $1
            AND created_at >= DATE_TRUNC('month', NOW())
            AND created_at < DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
        `,
        [userId]
      ),
      pool.query(
        `
          SELECT COUNT(*)::text AS count
          FROM user_project_analyses
          WHERE user_id = $1
            AND created_at >= DATE_TRUNC('month', NOW())
            AND created_at < DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
        `,
        [userId]
      ),
      pool.query(
        `
          SELECT COUNT(*)::text AS count
          FROM user_project_growth_advisor_reports
          WHERE user_id = $1
            AND created_at >= DATE_TRUNC('month', NOW())
            AND created_at < DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
        `,
        [userId]
      ),
    ]);

  return {
    projectsUsed: normalizeCount(projectsResult.rows[0]?.count),
    urlChecksUsed: normalizeCount(urlChecksResult.rows[0]?.count),
    analysisReportsUsed: normalizeCount(analysesResult.rows[0]?.count),
    growthPlansUsed: normalizeCount(growthPlansResult.rows[0]?.count),
  };
};

const getActiveSubscriptionRow = async (userId: string) => {
  const pool = getUserPortalPool();
  const result = (await pool.query(
    `
      SELECT
        id,
        plan_name,
        plan_slug,
        period_label,
        currency_code,
        amount_paid,
        status,
        starts_at,
        expires_at,
        created_at,
        updated_at
      FROM user_plan_subscriptions
      WHERE user_id = $1
        AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [userId]
  )) as { rows: ActiveSubscriptionRow[] };

  return result.rows[0] ? mapActiveSubscriptionRow(result.rows[0]) : null;
};

const getAccessOverrideRow = async (userId: string) => {
  await ensureUserAccessSchema();
  const result = (await getUserPortalPool().query(
    `
      SELECT user_id, unlimited_access, feature_limits, updated_at
      FROM user_plan_access_overrides
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId]
  )) as { rows: AccessOverrideRow[] };

  return result.rows[0] ?? null;
};

export const getUserPortalAccessDetails = async (
  userId: string
): Promise<UserPortalAccessDetails> => {
  const normalizedUserId = userId.trim();

  if (!normalizedUserId) {
    throw new Error("User ID is required.");
  }

  const [activeSubscription, accessOverride, usageCounts] = await Promise.all([
    getActiveSubscriptionRow(normalizedUserId),
    getAccessOverrideRow(normalizedUserId),
    readUsageCounts(normalizedUserId),
  ]);

  const template = resolvePlanTemplate(activeSubscription);
  const unlimitedAccess = Boolean(accessOverride?.unlimited_access);
  const editableLimits = normalizeFeatureLimits(
    accessOverride?.feature_limits,
    template,
    unlimitedAccess
  );

  return {
    activeSubscription,
    unlimitedAccess,
    overrideUpdatedAt: normalizeDate(accessOverride?.updated_at ?? null),
    editableLimits,
    usage: buildUsageItems({
      dueDate: activeSubscription?.expiresAt ?? null,
      unlimitedAccess,
      limits: editableLimits,
      usageCounts,
      template,
    }),
  };
};

export const updateUserPortalAccessDetails = async (
  userId: string,
  input: UpdateUserPortalAccessInput
): Promise<UserPortalAccessDetails> => {
  const normalizedUserId = userId.trim();

  if (!normalizedUserId) {
    throw new Error("User ID is required.");
  }

  await ensureUserAccessSchema();

  const currentActiveSubscription = await getActiveSubscriptionRow(normalizedUserId);
  const template = resolvePlanTemplate(currentActiveSubscription);
  const unlimitedAccess = Boolean(input.unlimitedAccess);
  const normalizedFeatureLimits = normalizeFeatureLimits(
    input.featureLimits,
    template,
    unlimitedAccess
  );

  const pool = getUserPortalPool();

  await pool.query(
    `
      INSERT INTO user_plan_access_overrides (
        user_id,
        unlimited_access,
        feature_limits,
        updated_at
      ) VALUES ($1, $2, $3::jsonb, NOW())
      ON CONFLICT (user_id) DO UPDATE
      SET
        unlimited_access = EXCLUDED.unlimited_access,
        feature_limits = EXCLUDED.feature_limits,
        updated_at = NOW()
    `,
    [
      normalizedUserId,
      unlimitedAccess,
      JSON.stringify(normalizedFeatureLimits),
    ]
  );

  if (input.expiresAt) {
    const parsedExpiresAt = new Date(input.expiresAt);

    if (Number.isNaN(parsedExpiresAt.getTime())) {
      throw new Error("Provide a valid expiry date.");
    }

    const updateResult = await pool.query(
      `
        UPDATE user_plan_subscriptions
        SET expires_at = $2, updated_at = NOW()
        WHERE user_id = $1
          AND status = 'active'
      `,
      [normalizedUserId, parsedExpiresAt.toISOString()]
    );

    if ((updateResult.rowCount ?? 0) === 0) {
      throw new Error(
        "No active subscription was found for this user, so the expiry date could not be updated."
      );
    }
  }

  return getUserPortalAccessDetails(normalizedUserId);
};
