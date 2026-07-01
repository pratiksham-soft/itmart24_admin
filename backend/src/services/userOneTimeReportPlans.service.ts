import crypto from "crypto";
import pg from "pg";
import { DEFAULT_USER_PORTAL_DATABASE } from "../config/databaseTargets";

const { Pool } = pg as any;

type UserPortalPool = InstanceType<typeof Pool>;

const AI_ANALYSIS_TOOL_KEY = "ai_analysis" as const;

export type CountryPricing = {
  id: string;
  countryCode?: string;
  countryName: string;
  currencyCode: string;
  price: number;
  discountPercentage?: number;
};

export type UserOneTimeReportPlanRecord = {
  id: string;
  toolKey: string;
  planKey: string;
  displayName: string;
  fallbackPriceUsd: number;
  priceInr: number;
  taxInclusive: boolean;
  sortOrder: number;
  badgeLabel: string | null;
  summaryLine: string;
  publicFeatures: string[];
  maxCompetitors: number;
  pdfExportEnabled: boolean;
  isActive: boolean;
  countryPricing: CountryPricing[];
  createdAt: string | null;
  updatedAt: string | null;
};

type UserOneTimeReportPlanPayload = Omit<
  UserOneTimeReportPlanRecord,
  "id" | "createdAt" | "updatedAt"
> & {
  id?: string;
  sortOrder?: number;
};

type WorkspacePlanRow = {
  id: string;
  tool_key: string;
  plan_key: string;
  display_name: string;
  fallback_price_usd: number | string | null;
  price_inr: number | string;
  tax_inclusive: boolean;
  sort_order: number | string | null;
  badge_label: string | null;
  summary_line: string | null;
  public_features: unknown;
  max_competitors: number | string | null;
  pdf_export_enabled: boolean;
  is_active: boolean;
  country_pricing: unknown;
  created_at: Date | string | null;
  updated_at: Date | string | null;
};

type GuestAiPlanRow = {
  id: string;
  plan_key: string;
  display_name: string;
  fallback_price_usd: number | string | null;
  price_inr: number | string;
  tax_inclusive: boolean;
  sort_order: number | string | null;
  badge_label: string | null;
  summary_line: string | null;
  public_features: unknown;
  max_competitors: number | string | null;
  pdf_export_enabled: boolean;
  is_active: boolean;
  country_pricing: unknown;
  allowed_engine_labels: unknown;
  allowed_engines: unknown;
  internal_cost_cap_usd: number | string | null;
  max_prompts_per_engine: number | string | null;
  max_keywords: number | string | null;
  max_output_tokens: number | string | null;
  max_provider_retries: number | string | null;
  provider_timeout_ms: number | string | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
};

let userPortalPool: UserPortalPool | null = null;
let schemaReady = false;

const parseBooleanEnv = (value: string | undefined, fallback = false) => {
  if (value == null || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on", "require"].includes(
    value.trim().toLowerCase()
  );
};

const parseIntegerEnv = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeDate = (value: Date | string | null) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const createCountryPricingId = (
  countryName: string,
  currencyCode: string,
  index: number
) =>
  `${slugify(countryName) || "country"}_${slugify(currencyCode) || "currency"}_${index + 1}`;

const getUserPortalPoolConfig = () => {
  const connectionString =
    process.env.USER_PORTAL_DATABASE_URL ??
    process.env.USER_PORTAL_DB_URL ??
    process.env.USER_PORTAL_DATABASE_URI;

  const sslEnabled = parseBooleanEnv(
    process.env.USER_PORTAL_DB_SSL ??
      process.env.USER_PORTAL_SSL ??
      process.env.PGSSLMODE,
    false
  );

  if (connectionString) {
    return {
      connectionString,
      max: parseIntegerEnv(process.env.USER_PORTAL_DB_POOL_MAX, 6),
      idleTimeoutMillis: parseIntegerEnv(
        process.env.USER_PORTAL_DB_IDLE_TIMEOUT_MS,
        30000
      ),
      connectionTimeoutMillis: parseIntegerEnv(
        process.env.USER_PORTAL_DB_CONNECT_TIMEOUT_MS,
        15000
      ),
      query_timeout: parseIntegerEnv(
        process.env.USER_PORTAL_DB_QUERY_TIMEOUT_MS,
        30000
      ),
      statement_timeout: parseIntegerEnv(
        process.env.USER_PORTAL_DB_STATEMENT_TIMEOUT_MS,
        30000
      ),
      keepAlive: true,
      ssl: sslEnabled
        ? {
            rejectUnauthorized: false,
          }
        : undefined,
    };
  }

  const host =
    process.env.USER_PORTAL_DB_HOST ??
    process.env.USER_PORTAL_HOST ??
    process.env.ANALYTICS_PG_HOST ??
    process.env.PGHOST;
  const user =
    process.env.USER_PORTAL_DB_USER ??
    process.env.USER_PORTAL_USER ??
    process.env.ANALYTICS_PG_USER ??
    process.env.PGUSER;
  const password =
    process.env.USER_PORTAL_DB_PASSWORD ??
    process.env.USER_PORTAL_PASSWORD ??
    process.env.ANALYTICS_PG_PASSWORD ??
    process.env.PGPASSWORD;

  if (!host || !user || !password) {
    throw new Error(
      "Missing user portal PostgreSQL configuration. Set USER_PORTAL_DATABASE_URL or USER_PORTAL_DB_HOST, USER_PORTAL_DB_USER, and USER_PORTAL_DB_PASSWORD."
    );
  }

  return {
    host,
    port: parseIntegerEnv(
      process.env.USER_PORTAL_DB_PORT ??
        process.env.USER_PORTAL_PORT ??
        process.env.ANALYTICS_PG_PORT ??
        process.env.PGPORT,
      5432
    ),
    user,
    password,
    database:
      process.env.USER_PORTAL_DB_NAME ??
      process.env.USER_PORTAL_DATABASE ??
      DEFAULT_USER_PORTAL_DATABASE,
    max: parseIntegerEnv(process.env.USER_PORTAL_DB_POOL_MAX, 6),
    idleTimeoutMillis: parseIntegerEnv(
      process.env.USER_PORTAL_DB_IDLE_TIMEOUT_MS,
      30000
    ),
    connectionTimeoutMillis: parseIntegerEnv(
      process.env.USER_PORTAL_DB_CONNECT_TIMEOUT_MS,
      15000
    ),
    query_timeout: parseIntegerEnv(
      process.env.USER_PORTAL_DB_QUERY_TIMEOUT_MS,
      30000
    ),
    statement_timeout: parseIntegerEnv(
      process.env.USER_PORTAL_DB_STATEMENT_TIMEOUT_MS,
      30000
    ),
    keepAlive: true,
    ssl: sslEnabled
      ? {
          rejectUnauthorized: false,
        }
      : undefined,
  };
};

const getUserPortalPool = () => {
  if (!userPortalPool) {
    userPortalPool = new Pool(getUserPortalPoolConfig());
    userPortalPool.on("error", (error: Error) => {
      console.error(
        "User one-time report plans PostgreSQL pool error:",
        error instanceof Error ? error.message : String(error)
      );
    });
  }

  return userPortalPool;
};

const ensureSchema = async () => {
  if (schemaReady) {
    return;
  }

  const pool = getUserPortalPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_one_time_report_plans (
      id UUID PRIMARY KEY,
      tool_key TEXT NOT NULL,
      plan_key TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      fallback_price_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
      price_inr INTEGER NOT NULL,
      tax_inclusive BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 1,
      badge_label TEXT,
      summary_line TEXT NOT NULL DEFAULT '',
      public_features JSONB NOT NULL DEFAULT '[]'::jsonb,
      max_competitors INTEGER NOT NULL DEFAULT 0,
      pdf_export_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `ALTER TABLE user_one_time_report_plans ADD COLUMN IF NOT EXISTS fallback_price_usd NUMERIC(12,2) NOT NULL DEFAULT 0`
  );
  await pool.query(
    `ALTER TABLE user_one_time_report_plans ADD COLUMN IF NOT EXISTS country_pricing JSONB NOT NULL DEFAULT '[]'::jsonb`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_user_one_time_report_plans_tool_sort ON user_one_time_report_plans (tool_key, sort_order ASC, created_at ASC)`
  );

  await pool.query(
    `ALTER TABLE guest_ai_report_plans ADD COLUMN IF NOT EXISTS fallback_price_usd NUMERIC(12,2) NOT NULL DEFAULT 0`
  );
  await pool.query(
    `ALTER TABLE guest_ai_report_plans ADD COLUMN IF NOT EXISTS country_pricing JSONB NOT NULL DEFAULT '[]'::jsonb`
  );

  schemaReady = true;
};

const assertNonEmptyString = (value: unknown, message: string) => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(message);
  }

  return value.trim();
};

const assertNumber = (
  value: unknown,
  message: string,
  options?: { min?: number; max?: number }
) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    throw new Error(message);
  }

  if (options?.min !== undefined && numericValue < options.min) {
    throw new Error(message);
  }

  if (options?.max !== undefined && numericValue > options.max) {
    throw new Error(message);
  }

  return numericValue;
};

const normalizeDiscountPercentage = (value: unknown) => {
  const parsedValue = Number(value ?? 0);

  if (!Number.isFinite(parsedValue)) {
    return 0;
  }

  return Math.min(100, Math.max(0, parsedValue));
};

const normalizeStringArray = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item ?? "").trim())
    .filter((item) => item !== "");
};

const normalizeCountryPricing = (countryPricing: unknown): CountryPricing[] => {
  if (!Array.isArray(countryPricing)) {
    return [];
  }

  const normalized: CountryPricing[] = [];

  countryPricing.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") {
      return;
    }

    const item = entry as Record<string, unknown>;
    const countryName = String(item.countryName ?? "").trim();
    const currencyCode = String(item.currencyCode ?? "")
      .trim()
      .toUpperCase();
    const price = Number(item.price);

    if (!countryName || !currencyCode || !Number.isFinite(price) || price < 0) {
      return;
    }

    normalized.push({
      id:
        typeof item.id === "string" && item.id.trim() !== ""
          ? item.id
          : createCountryPricingId(countryName, currencyCode, index),
      countryCode: String(item.countryCode ?? "")
        .trim()
        .toUpperCase(),
      countryName,
      currencyCode,
      price,
      discountPercentage: normalizeDiscountPercentage(item.discountPercentage),
    });
  });

  return normalized;
};

const validateCountryPricing = (countryPricing: unknown) => {
  const normalized = normalizeCountryPricing(countryPricing);
  const seen = new Set<string>();

  normalized.forEach((item) => {
    const key = `${item.countryCode || item.countryName}`.trim().toUpperCase();

    if (!key) {
      throw new Error("Each country pricing row needs a country.");
    }

    if (seen.has(key)) {
      throw new Error(`Duplicate country pricing found for ${item.countryName}.`);
    }

    seen.add(key);
  });

  return normalized;
};

const mapWorkspacePlanRow = (row: WorkspacePlanRow): UserOneTimeReportPlanRecord => ({
  id: row.id,
  toolKey: row.tool_key,
  planKey: row.plan_key,
  displayName: row.display_name,
  fallbackPriceUsd: Number(row.fallback_price_usd ?? 0),
  priceInr: Number(row.price_inr ?? 0),
  taxInclusive: Boolean(row.tax_inclusive),
  sortOrder: Number(row.sort_order ?? 0) || 0,
  badgeLabel: row.badge_label,
  summaryLine: row.summary_line ?? "",
  publicFeatures: normalizeStringArray(row.public_features),
  maxCompetitors: Number(row.max_competitors ?? 0) || 0,
  pdfExportEnabled: Boolean(row.pdf_export_enabled),
  isActive: Boolean(row.is_active),
  countryPricing: normalizeCountryPricing(row.country_pricing),
  createdAt: normalizeDate(row.created_at),
  updatedAt: normalizeDate(row.updated_at),
});

const mapGuestAiPlanRow = (row: GuestAiPlanRow): UserOneTimeReportPlanRecord => ({
  id: row.id,
  toolKey: AI_ANALYSIS_TOOL_KEY,
  planKey: row.plan_key,
  displayName: row.display_name,
  fallbackPriceUsd: Number(row.fallback_price_usd ?? 0),
  priceInr: Number(row.price_inr ?? 0),
  taxInclusive: Boolean(row.tax_inclusive),
  sortOrder: Number(row.sort_order ?? 0) || 0,
  badgeLabel: row.badge_label,
  summaryLine: row.summary_line ?? "",
  publicFeatures: normalizeStringArray(row.public_features),
  maxCompetitors: Number(row.max_competitors ?? 0) || 0,
  pdfExportEnabled: Boolean(row.pdf_export_enabled),
  isActive: Boolean(row.is_active),
  countryPricing: normalizeCountryPricing(row.country_pricing),
  createdAt: normalizeDate(row.created_at),
  updatedAt: normalizeDate(row.updated_at),
});

const inferGuestAiDefaults = (planKey: string) => {
  const normalized = planKey.toLowerCase();

  if (normalized.includes("complete")) {
    return {
      allowedEngineLabels: [
        "ChatGPT",
        "Perplexity",
        "Google CSE",
        "Google Search",
        "Gemini",
        "Claude",
        "xAI",
      ],
      allowedEngines: [
        "openai",
        "perplexity",
        "google_cse",
        "google_search",
        "gemini",
        "claude",
        "xai",
      ],
      internalCostCapUsd: 3,
      maxPromptsPerEngine: 2,
      maxKeywords: 10,
      maxOutputTokens: 1400,
      maxProviderRetries: 1,
      providerTimeoutMs: 26000,
    };
  }

  if (normalized.includes("growth")) {
    return {
      allowedEngineLabels: [
        "ChatGPT",
        "Perplexity",
        "Google CSE",
        "Google Search",
      ],
      allowedEngines: ["openai", "perplexity", "google_cse", "google_search"],
      internalCostCapUsd: 2,
      maxPromptsPerEngine: 2,
      maxKeywords: 7,
      maxOutputTokens: 1100,
      maxProviderRetries: 0,
      providerTimeoutMs: 24000,
    };
  }

  return {
    allowedEngineLabels: ["ChatGPT", "Perplexity"],
    allowedEngines: ["openai", "perplexity"],
    internalCostCapUsd: 1,
    maxPromptsPerEngine: 2,
    maxKeywords: 5,
    maxOutputTokens: 900,
    maxProviderRetries: 0,
    providerTimeoutMs: 22000,
  };
};

const resolveNextSortOrder = async (toolKey: string) => {
  await ensureSchema();
  const tableName =
    toolKey === AI_ANALYSIS_TOOL_KEY
      ? "guest_ai_report_plans"
      : "user_one_time_report_plans";
  const whereClause = toolKey === AI_ANALYSIS_TOOL_KEY ? "" : "WHERE tool_key = $1";
  const result = (await getUserPortalPool().query(
    `
      SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort_order
      FROM ${tableName}
      ${whereClause}
    `,
    toolKey === AI_ANALYSIS_TOOL_KEY ? [] : [toolKey]
  )) as { rows: Array<{ next_sort_order: number }> };

  return Number(result.rows[0]?.next_sort_order ?? 1);
};

const validatePayload = async (payload: UserOneTimeReportPlanPayload) => {
  const toolKey = assertNonEmptyString(payload.toolKey, "Tool key is required.");
  const displayName = assertNonEmptyString(
    payload.displayName,
    "Display name is required."
  );
  const planKey = assertNonEmptyString(payload.planKey, "Plan key is required.");
  const publicFeatures = normalizeStringArray(payload.publicFeatures);

  if (publicFeatures.length === 0) {
    throw new Error("At least one public feature is required.");
  }

  return {
    id: payload.id && payload.id.trim() ? payload.id : crypto.randomUUID(),
    toolKey,
    planKey,
    displayName,
    fallbackPriceUsd: assertNumber(
      payload.fallbackPriceUsd,
      "Fallback USD price must be zero or greater.",
      { min: 0 }
    ),
    priceInr: assertNumber(
      payload.priceInr,
      "Base INR price must be zero or greater.",
      { min: 0 }
    ),
    taxInclusive: Boolean(payload.taxInclusive),
    sortOrder: Number.isFinite(Number(payload.sortOrder))
      ? Number(payload.sortOrder)
      : await resolveNextSortOrder(toolKey),
    badgeLabel:
      typeof payload.badgeLabel === "string" && payload.badgeLabel.trim() !== ""
        ? payload.badgeLabel.trim()
        : null,
    summaryLine: String(payload.summaryLine ?? "").trim(),
    publicFeatures,
    maxCompetitors: assertNumber(
      payload.maxCompetitors,
      "Max competitors must be zero or greater.",
      { min: 0 }
    ),
    pdfExportEnabled: Boolean(payload.pdfExportEnabled),
    isActive: Boolean(payload.isActive),
    countryPricing: validateCountryPricing(payload.countryPricing),
  };
};

const listWorkspacePlans = async () => {
  const result = (await getUserPortalPool().query(
    `
      SELECT
        id,
        tool_key,
        plan_key,
        display_name,
        fallback_price_usd,
        price_inr,
        tax_inclusive,
        sort_order,
        badge_label,
        summary_line,
        public_features,
        max_competitors,
        pdf_export_enabled,
        is_active,
        country_pricing,
        created_at,
        updated_at
      FROM user_one_time_report_plans
      ORDER BY tool_key ASC, sort_order ASC, created_at ASC
    `
  )) as { rows: WorkspacePlanRow[] };

  return result.rows.map(mapWorkspacePlanRow);
};

const listGuestAiPlans = async () => {
  const result = (await getUserPortalPool().query(
    `
      SELECT
        id,
        plan_key,
        display_name,
        fallback_price_usd,
        price_inr,
        tax_inclusive,
        sort_order,
        badge_label,
        summary_line,
        public_features,
        max_competitors,
        pdf_export_enabled,
        is_active,
        country_pricing,
        allowed_engine_labels,
        allowed_engines,
        internal_cost_cap_usd,
        max_prompts_per_engine,
        max_keywords,
        max_output_tokens,
        max_provider_retries,
        provider_timeout_ms,
        created_at,
        updated_at
      FROM guest_ai_report_plans
      ORDER BY sort_order ASC, created_at ASC
    `
  )) as { rows: GuestAiPlanRow[] };

  return result.rows.map(mapGuestAiPlanRow);
};

const getWorkspacePlanById = async (planId: string) => {
  const result = (await getUserPortalPool().query(
    `
      SELECT
        id,
        tool_key,
        plan_key,
        display_name,
        fallback_price_usd,
        price_inr,
        tax_inclusive,
        sort_order,
        badge_label,
        summary_line,
        public_features,
        max_competitors,
        pdf_export_enabled,
        is_active,
        country_pricing,
        created_at,
        updated_at
      FROM user_one_time_report_plans
      WHERE id = $1
      LIMIT 1
    `,
    [planId]
  )) as { rows: WorkspacePlanRow[] };

  const row = result.rows[0];
  return row ? mapWorkspacePlanRow(row) : null;
};

const getGuestAiPlanById = async (planId: string) => {
  const result = (await getUserPortalPool().query(
    `
      SELECT
        id,
        plan_key,
        display_name,
        fallback_price_usd,
        price_inr,
        tax_inclusive,
        sort_order,
        badge_label,
        summary_line,
        public_features,
        max_competitors,
        pdf_export_enabled,
        is_active,
        country_pricing,
        allowed_engine_labels,
        allowed_engines,
        internal_cost_cap_usd,
        max_prompts_per_engine,
        max_keywords,
        max_output_tokens,
        max_provider_retries,
        provider_timeout_ms,
        created_at,
        updated_at
      FROM guest_ai_report_plans
      WHERE id = $1
      LIMIT 1
    `,
    [planId]
  )) as { rows: GuestAiPlanRow[] };

  const row = result.rows[0];
  return row ? mapGuestAiPlanRow(row) : null;
};

export const listUserOneTimeReportPlans = async () => {
  await ensureSchema();
  const [workspacePlans, guestAiPlans] = await Promise.all([
    listWorkspacePlans(),
    listGuestAiPlans(),
  ]);

  return [...workspacePlans, ...guestAiPlans].sort((left, right) => {
    const toolCompare = left.toolKey.localeCompare(right.toolKey);
    if (toolCompare !== 0) {
      return toolCompare;
    }

    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return (left.createdAt ?? "").localeCompare(right.createdAt ?? "");
  });
};

export const getUserOneTimeReportPlanById = async (planId: string) => {
  await ensureSchema();
  const workspacePlan = await getWorkspacePlanById(planId);
  if (workspacePlan) {
    return workspacePlan;
  }

  return getGuestAiPlanById(planId);
};

export const createUserOneTimeReportPlan = async (
  payload: UserOneTimeReportPlanPayload
) => {
  await ensureSchema();
  const validated = await validatePayload(payload);

  if (validated.toolKey === AI_ANALYSIS_TOOL_KEY) {
    const defaults = inferGuestAiDefaults(validated.planKey);
    await getUserPortalPool().query(
      `
        INSERT INTO guest_ai_report_plans (
          id,
          plan_key,
          display_name,
          fallback_price_usd,
          price_inr,
          tax_inclusive,
          sort_order,
          badge_label,
          summary_line,
          public_features,
          allowed_engine_labels,
          allowed_engines,
          max_competitors,
          pdf_export_enabled,
          internal_cost_cap_usd,
          max_prompts_per_engine,
          max_keywords,
          max_output_tokens,
          max_provider_retries,
          provider_timeout_ms,
          is_active,
          country_pricing
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22::jsonb
        )
      `,
      [
        validated.id,
        validated.planKey,
        validated.displayName,
        validated.fallbackPriceUsd,
        validated.priceInr,
        validated.taxInclusive,
        validated.sortOrder,
        validated.badgeLabel,
        validated.summaryLine,
        JSON.stringify(validated.publicFeatures),
        JSON.stringify(defaults.allowedEngineLabels),
        JSON.stringify(defaults.allowedEngines),
        validated.maxCompetitors,
        validated.pdfExportEnabled,
        defaults.internalCostCapUsd,
        defaults.maxPromptsPerEngine,
        defaults.maxKeywords,
        defaults.maxOutputTokens,
        defaults.maxProviderRetries,
        defaults.providerTimeoutMs,
        validated.isActive,
        JSON.stringify(validated.countryPricing),
      ]
    );

    return getGuestAiPlanById(validated.id);
  }

  await getUserPortalPool().query(
    `
      INSERT INTO user_one_time_report_plans (
        id,
        tool_key,
        plan_key,
        display_name,
        fallback_price_usd,
        price_inr,
        tax_inclusive,
        sort_order,
        badge_label,
        summary_line,
        public_features,
        max_competitors,
        pdf_export_enabled,
        is_active,
        country_pricing
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15::jsonb
      )
    `,
    [
      validated.id,
      validated.toolKey,
      validated.planKey,
      validated.displayName,
      validated.fallbackPriceUsd,
      validated.priceInr,
      validated.taxInclusive,
      validated.sortOrder,
      validated.badgeLabel,
      validated.summaryLine,
      JSON.stringify(validated.publicFeatures),
      validated.maxCompetitors,
      validated.pdfExportEnabled,
      validated.isActive,
      JSON.stringify(validated.countryPricing),
    ]
  );

  return getWorkspacePlanById(validated.id);
};

export const updateUserOneTimeReportPlan = async (
  planId: string,
  payload: Partial<UserOneTimeReportPlanPayload>
) => {
  await ensureSchema();
  const existing = await getUserOneTimeReportPlanById(planId);

  if (!existing) {
    throw new Error("One-time report plan not found.");
  }

  const validated = await validatePayload({
    ...existing,
    ...payload,
    id: existing.id,
    planKey: existing.planKey,
    toolKey: existing.toolKey,
  });

  if (existing.toolKey === AI_ANALYSIS_TOOL_KEY) {
    const current = (await getUserPortalPool().query(
      `
        SELECT
          allowed_engine_labels,
          allowed_engines,
          internal_cost_cap_usd,
          max_prompts_per_engine,
          max_keywords,
          max_output_tokens,
          max_provider_retries,
          provider_timeout_ms
        FROM guest_ai_report_plans
        WHERE id = $1
        LIMIT 1
      `,
      [planId]
    )) as {
      rows: Array<{
        allowed_engine_labels: unknown;
        allowed_engines: unknown;
        internal_cost_cap_usd: number | string | null;
        max_prompts_per_engine: number | string | null;
        max_keywords: number | string | null;
        max_output_tokens: number | string | null;
        max_provider_retries: number | string | null;
        provider_timeout_ms: number | string | null;
      }>;
    };

    const fallbackDefaults = inferGuestAiDefaults(existing.planKey);
    const currentRow = current.rows[0];

    await getUserPortalPool().query(
      `
        UPDATE guest_ai_report_plans
        SET
          display_name = $2,
          fallback_price_usd = $3,
          price_inr = $4,
          tax_inclusive = $5,
          sort_order = $6,
          badge_label = $7,
          summary_line = $8,
          public_features = $9::jsonb,
          allowed_engine_labels = $10::jsonb,
          allowed_engines = $11::jsonb,
          max_competitors = $12,
          pdf_export_enabled = $13,
          internal_cost_cap_usd = $14,
          max_prompts_per_engine = $15,
          max_keywords = $16,
          max_output_tokens = $17,
          max_provider_retries = $18,
          provider_timeout_ms = $19,
          is_active = $20,
          country_pricing = $21::jsonb,
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        planId,
        validated.displayName,
        validated.fallbackPriceUsd,
        validated.priceInr,
        validated.taxInclusive,
        validated.sortOrder,
        validated.badgeLabel,
        validated.summaryLine,
        JSON.stringify(validated.publicFeatures),
        JSON.stringify(
          normalizeStringArray(currentRow?.allowed_engine_labels).length > 0
            ? normalizeStringArray(currentRow?.allowed_engine_labels)
            : fallbackDefaults.allowedEngineLabels
        ),
        JSON.stringify(
          normalizeStringArray(currentRow?.allowed_engines).length > 0
            ? normalizeStringArray(currentRow?.allowed_engines)
            : fallbackDefaults.allowedEngines
        ),
        validated.maxCompetitors,
        validated.pdfExportEnabled,
        Number(currentRow?.internal_cost_cap_usd ?? fallbackDefaults.internalCostCapUsd),
        Number(currentRow?.max_prompts_per_engine ?? fallbackDefaults.maxPromptsPerEngine),
        Number(currentRow?.max_keywords ?? fallbackDefaults.maxKeywords),
        Number(currentRow?.max_output_tokens ?? fallbackDefaults.maxOutputTokens),
        Number(currentRow?.max_provider_retries ?? fallbackDefaults.maxProviderRetries),
        Number(currentRow?.provider_timeout_ms ?? fallbackDefaults.providerTimeoutMs),
        validated.isActive,
        JSON.stringify(validated.countryPricing),
      ]
    );

    return getGuestAiPlanById(planId);
  }

  await getUserPortalPool().query(
    `
      UPDATE user_one_time_report_plans
      SET
        tool_key = $2,
        display_name = $3,
        fallback_price_usd = $4,
        price_inr = $5,
        tax_inclusive = $6,
        sort_order = $7,
        badge_label = $8,
        summary_line = $9,
        public_features = $10::jsonb,
        max_competitors = $11,
        pdf_export_enabled = $12,
        is_active = $13,
        country_pricing = $14::jsonb,
        updated_at = NOW()
      WHERE id = $1
    `,
    [
      planId,
      validated.toolKey,
      validated.displayName,
      validated.fallbackPriceUsd,
      validated.priceInr,
      validated.taxInclusive,
      validated.sortOrder,
      validated.badgeLabel,
      validated.summaryLine,
      JSON.stringify(validated.publicFeatures),
      validated.maxCompetitors,
      validated.pdfExportEnabled,
      validated.isActive,
      JSON.stringify(validated.countryPricing),
    ]
  );

  return getWorkspacePlanById(planId);
};

export const deleteUserOneTimeReportPlan = async (planId: string) => {
  await ensureSchema();
  const existing = await getUserOneTimeReportPlanById(planId);

  if (!existing) {
    return;
  }

  const tableName =
    existing.toolKey === AI_ANALYSIS_TOOL_KEY
      ? "guest_ai_report_plans"
      : "user_one_time_report_plans";
  await getUserPortalPool().query(`DELETE FROM ${tableName} WHERE id = $1`, [planId]);
};
