import pg from "pg";
import { DEFAULT_USER_PORTAL_DATABASE } from "../config/databaseTargets";

const { Pool } = pg as any;

type UserPortalPool = InstanceType<typeof Pool>;

export type UserPlanCountryPricing = {
  id: string;
  countryCode?: string;
  countryName: string;
  currencyCode: string;
  price: number;
  discountPercentage?: number;
};

export type UserPlanPeriod = {
  id: string;
  label: string;
  durationInMonths: number;
  price: number;
  discountPercentage?: number;
  countryPricing?: UserPlanCountryPricing[];
};

export type UserPlanFeature = {
  title: string;
  description: string;
};

export const USER_PLAN_PROJECT_KEYS = [
  "user-portal",
  "b2b-lead-zone",
] as const;

export type UserPlanProjectKey = (typeof USER_PLAN_PROJECT_KEYS)[number];

export type UserPlanRecord = {
  id: string;
  projectKey: UserPlanProjectKey;
  name: string;
  slug: string;
  description: string;
  periods: UserPlanPeriod[];
  features: UserPlanFeature[];
  isActive: boolean;
  sortOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
};

type UserPlanPayload = Omit<
  UserPlanRecord,
  "id" | "createdAt" | "updatedAt" | "sortOrder"
> & {
  sortOrder?: number;
};

type UserPlanRow = {
  id: string;
  project_key: string | null;
  name: string;
  slug: string;
  description: string | null;
  periods: unknown;
  features: unknown;
  is_active: boolean;
  sort_order: number | string | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
};

let userPortalPool: UserPortalPool | null = null;
let schemaReady = false;

const DEFAULT_USER_PLAN_PROJECT_KEY: UserPlanProjectKey = "user-portal";
const B2B_LEAD_ZONE_PROJECT_KEY: UserPlanProjectKey = "b2b-lead-zone";

const B2B_LEAD_ZONE_DEFAULT_PLANS: UserPlanPayload[] = [
  {
    projectKey: B2B_LEAD_ZONE_PROJECT_KEY,
    name: "Free",
    slug: "free",
    description: "Try the core extraction workflow for smaller searches.",
    periods: [
      {
        id: "monthly-1",
        label: "Monthly",
        durationInMonths: 1,
        price: 0,
        discountPercentage: 0,
        countryPricing: [],
      },
    ],
    features: [
      { title: "Google Maps supported", description: "" },
      { title: "Bing Maps supported", description: "" },
      { title: "Up to 30 leads per extraction", description: "" },
      { title: "Business name", description: "" },
      { title: "Phone number", description: "" },
      { title: "Email address", description: "" },
      { title: "Website", description: "" },
      { title: "Social media URL", description: "" },
      { title: "Map URL", description: "" },
      { title: "Export collected leads", description: "" },
    ],
    isActive: true,
    sortOrder: 1,
  },
  {
    projectKey: B2B_LEAD_ZONE_PROJECT_KEY,
    name: "Pro",
    slug: "pro",
    description: "Automate larger, multi-location lead collection.",
    periods: [
      {
        id: "monthly-1",
        label: "Monthly",
        durationInMonths: 1,
        price: 599,
        discountPercentage: 0,
        countryPricing: [],
      },
    ],
    features: [
      { title: "Everything in Free", description: "" },
      { title: "Multiple-location support", description: "" },
      { title: "CSV location-list upload", description: "" },
      {
        title: "Unlimited lead extraction, subject to browser and platform constraints",
        description: "",
      },
      { title: "Automatic location-by-location searching", description: "" },
      { title: "Automatic lead collection across queued locations", description: "" },
      {
        title: "Start once and let the app process your location queue automatically",
        description: "",
      },
      { title: "Combined lead export", description: "" },
      { title: "Designed for larger lead-research tasks", description: "" },
    ],
    isActive: true,
    sortOrder: 2,
  },
];

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
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const createPeriodId = (label: string, durationInMonths: number, index: number) =>
  `${slugify(label) || "period"}-${durationInMonths || index + 1}-${index + 1}`;

const createCountryPricingId = (countryName: string, currencyCode: string, index: number) =>
  `${slugify(countryName) || "country"}-${slugify(currencyCode) || "currency"}-${index + 1}`;

const buildPlanId = (projectKey: UserPlanProjectKey, slug: string) =>
  projectKey === DEFAULT_USER_PLAN_PROJECT_KEY ? slug : `${projectKey}:${slug}`;

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
        "User portal plans PostgreSQL pool error:",
        error instanceof Error ? error.message : String(error)
      );
    });
  }

  return userPortalPool;
};

const ensureUserPlansSchema = async () => {
  if (schemaReady) {
    return;
  }

  const pool = getUserPortalPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_subscription_plans (
      id TEXT PRIMARY KEY,
      project_key TEXT NOT NULL DEFAULT 'user-portal',
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      periods JSONB NOT NULL DEFAULT '[]'::jsonb,
      features JSONB NOT NULL DEFAULT '[]'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_user_subscription_plans_sort_order ON user_subscription_plans (sort_order ASC, created_at ASC)`
  );
  await pool.query(
    `ALTER TABLE user_subscription_plans ADD COLUMN IF NOT EXISTS project_key TEXT NOT NULL DEFAULT 'user-portal'`
  );
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_subscription_plans_slug_key'
      ) THEN
        ALTER TABLE user_subscription_plans
        DROP CONSTRAINT user_subscription_plans_slug_key;
      END IF;
    END
    $$;
  `);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_subscription_plans_project_slug ON user_subscription_plans (project_key, slug)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_user_subscription_plans_project_sort_order ON user_subscription_plans (project_key ASC, sort_order ASC, created_at ASC)`
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

const normalizeProjectKey = (value: unknown): UserPlanProjectKey => {
  const normalizedValue = String(value ?? "")
    .trim()
    .toLowerCase();

  if (
    USER_PLAN_PROJECT_KEYS.includes(normalizedValue as UserPlanProjectKey)
  ) {
    return normalizedValue as UserPlanProjectKey;
  }

  return DEFAULT_USER_PLAN_PROJECT_KEY;
};

const normalizeCountryPricing = (countryPricing: unknown): UserPlanCountryPricing[] => {
  if (!Array.isArray(countryPricing)) {
    return [];
  }

  const normalized: UserPlanCountryPricing[] = [];

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

const normalizePeriods = (periods: unknown): UserPlanPeriod[] => {
  if (!Array.isArray(periods)) {
    return [];
  }

  const normalized: UserPlanPeriod[] = [];

  periods.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") {
      return;
    }

    const item = entry as Record<string, unknown>;
    const label = String(item.label ?? "").trim();
    const durationInMonths = Number(item.durationInMonths);
    const price = Number(item.price);

    if (
      !label ||
      !Number.isFinite(durationInMonths) ||
      durationInMonths <= 0 ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      return;
    }

    normalized.push({
      id:
        typeof item.id === "string" && item.id.trim() !== ""
          ? item.id
          : createPeriodId(label, durationInMonths, index),
      label,
      durationInMonths,
      price,
      discountPercentage: normalizeDiscountPercentage(item.discountPercentage),
      countryPricing: normalizeCountryPricing(item.countryPricing),
    });
  });

  return normalized;
};

const normalizeFeatures = (features: unknown): UserPlanFeature[] => {
  if (!Array.isArray(features)) {
    return [];
  }

  return features
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const item = entry as Record<string, unknown>;
      const title = String(item.title ?? "").trim();
      const description = String(item.description ?? "").trim();

      if (!title) {
        return null;
      }

      return {
        title,
        description,
      };
    })
    .filter((item): item is UserPlanFeature => item !== null);
};

const validateCountryPricing = (countryPricing: unknown): UserPlanCountryPricing[] => {
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

const validatePeriods = (periods: unknown): UserPlanPeriod[] => {
  const normalized = normalizePeriods(periods);

  if (normalized.length === 0) {
    throw new Error("At least one billing period is required.");
  }

  const seenDurations = new Set<number>();

  normalized.forEach((period) => {
    assertNonEmptyString(period.label, "Each billing period needs a label.");
    assertNumber(
      period.durationInMonths,
      "Each duration must be a positive number of months.",
      { min: 1 }
    );
    assertNumber(period.price, "Each global price must be zero or greater.", {
      min: 0,
    });

    if (seenDurations.has(period.durationInMonths)) {
      throw new Error(`Duplicate duration found: ${period.durationInMonths} months.`);
    }

    seenDurations.add(period.durationInMonths);
    period.countryPricing = validateCountryPricing(period.countryPricing);
  });

  return normalized;
};

const validateFeatures = (features: unknown): UserPlanFeature[] => {
  const normalized = normalizeFeatures(features);

  if (normalized.length === 0) {
    throw new Error("At least one plan feature is required.");
  }

  return normalized;
};

const mapUserPlanRow = (row: UserPlanRow): UserPlanRecord => ({
  id: row.id,
  projectKey: normalizeProjectKey(row.project_key),
  name: row.name,
  slug: row.slug,
  description: row.description ?? "",
  periods: normalizePeriods(row.periods),
  features: normalizeFeatures(row.features),
  isActive: Boolean(row.is_active),
  sortOrder: Number(row.sort_order ?? 0) || 0,
  createdAt: normalizeDate(row.created_at),
  updatedAt: normalizeDate(row.updated_at),
});

const resolveNextSortOrder = async () => {
  return resolveNextSortOrderForProject(DEFAULT_USER_PLAN_PROJECT_KEY);
};

const resolveNextSortOrderForProject = async (projectKey: UserPlanProjectKey) => {
  await ensureUserPlansSchema();
  const pool = getUserPortalPool();
  const result = (await pool.query(
    `
      SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort_order
      FROM user_subscription_plans
      WHERE project_key = $1
    `,
    [projectKey]
  )) as { rows: Array<{ next_sort_order: number }> };

  return Number(result.rows[0]?.next_sort_order ?? 1);
};

const validatePlanPayload = async (payload: UserPlanPayload) => {
  const projectKey = normalizeProjectKey(payload.projectKey);
  const name = assertNonEmptyString(payload.name, "Plan name is required.");
  const slug = slugify(payload.slug || payload.name);

  if (!slug) {
    throw new Error("Plan slug could not be generated.");
  }

  return {
    id: buildPlanId(projectKey, slug),
    projectKey,
    name,
    slug,
    description: String(payload.description ?? "").trim(),
    periods: validatePeriods(payload.periods),
    features: validateFeatures(payload.features),
    isActive: Boolean(payload.isActive),
    sortOrder: Number.isFinite(Number(payload.sortOrder))
      ? Number(payload.sortOrder)
      : await resolveNextSortOrderForProject(projectKey),
  };
};

export const listUserPortalPlans = async (
  projectKey: UserPlanProjectKey = DEFAULT_USER_PLAN_PROJECT_KEY
) => {
  await ensureUserPlansSchema();
  const pool = getUserPortalPool();
  const result = (await pool.query(
    `
      SELECT
        id,
        project_key,
        name,
        slug,
        description,
        periods,
        features,
        is_active,
        sort_order,
        created_at,
        updated_at
      FROM user_subscription_plans
      WHERE project_key = $1
      ORDER BY sort_order ASC, created_at ASC
    `,
    [projectKey]
  )) as { rows: UserPlanRow[] };

  return result.rows.map(mapUserPlanRow);
};

export const getUserPortalPlanById = async (
  planId: string,
  projectKey?: UserPlanProjectKey
) => {
  await ensureUserPlansSchema();
  const pool = getUserPortalPool();
  const hasProjectKey = Boolean(projectKey);
  const result = hasProjectKey
    ? ((await pool.query(
        `
          SELECT
            id,
            project_key,
            name,
            slug,
            description,
            periods,
            features,
            is_active,
            sort_order,
            created_at,
            updated_at
          FROM user_subscription_plans
          WHERE id = $1 AND project_key = $2
          LIMIT 1
        `,
        [planId, projectKey]
      )) as { rows: UserPlanRow[] })
    : ((await pool.query(
        `
          SELECT
            id,
            project_key,
            name,
            slug,
            description,
            periods,
            features,
            is_active,
            sort_order,
            created_at,
            updated_at
          FROM user_subscription_plans
          WHERE id = $1
          LIMIT 1
        `,
        [planId]
      )) as { rows: UserPlanRow[] });

  const row = result.rows[0];
  return row ? mapUserPlanRow(row) : null;
};

export const createUserPortalPlan = async (payload: UserPlanPayload) => {
  await ensureUserPlansSchema();
  const pool = getUserPortalPool();
  const validated = await validatePlanPayload(payload);

  await pool.query(
    `
      INSERT INTO user_subscription_plans (
        id,
        project_key,
        name,
        slug,
        description,
        periods,
        features,
        is_active,
        sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)
    `,
    [
      validated.id,
      validated.projectKey,
      validated.name,
      validated.slug,
      validated.description,
      JSON.stringify(validated.periods),
      JSON.stringify(validated.features),
      validated.isActive,
      validated.sortOrder,
    ]
  );

  return getUserPortalPlanById(validated.id, validated.projectKey);
};

export const updateUserPortalPlan = async (
  planId: string,
  payload: Partial<UserPlanPayload>
) => {
  await ensureUserPlansSchema();
  const existing = await getUserPortalPlanById(planId);

  if (!existing) {
    throw new Error("User plan not found.");
  }

  const validated = await validatePlanPayload({
    ...existing,
    ...payload,
    projectKey: existing.projectKey,
    slug: existing.slug,
  });

  await getUserPortalPool().query(
    `
      UPDATE user_subscription_plans
      SET
        name = $2,
        description = $3,
        periods = $4::jsonb,
        features = $5::jsonb,
        is_active = $6,
        sort_order = $7,
        updated_at = NOW()
      WHERE id = $1
    `,
    [
      planId,
      validated.name,
      validated.description,
      JSON.stringify(validated.periods),
      JSON.stringify(validated.features),
      validated.isActive,
      validated.sortOrder,
    ]
  );

  return getUserPortalPlanById(planId, existing.projectKey);
};

export const deleteUserPortalPlan = async (planId: string) => {
  await ensureUserPlansSchema();
  await getUserPortalPool().query(
    `DELETE FROM user_subscription_plans WHERE id = $1`,
    [planId]
  );
};

export const seedB2BLeadZonePlans = async () => {
  await ensureUserPlansSchema();
  const pool = getUserPortalPool();

  for (const plan of B2B_LEAD_ZONE_DEFAULT_PLANS) {
    const validated = await validatePlanPayload(plan);

    await pool.query(
      `
        INSERT INTO user_subscription_plans (
          id,
          project_key,
          name,
          slug,
          description,
          periods,
          features,
          is_active,
          sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)
        ON CONFLICT (id) DO UPDATE
        SET
          name = EXCLUDED.name,
          slug = EXCLUDED.slug,
          description = EXCLUDED.description,
          periods = EXCLUDED.periods,
          features = EXCLUDED.features,
          is_active = EXCLUDED.is_active,
          sort_order = EXCLUDED.sort_order,
          updated_at = NOW()
      `,
      [
        validated.id,
        validated.projectKey,
        validated.name,
        validated.slug,
        validated.description,
        JSON.stringify(validated.periods),
        JSON.stringify(validated.features),
        validated.isActive,
        validated.sortOrder,
      ]
    );
  }

  return listUserPortalPlans(B2B_LEAD_ZONE_PROJECT_KEY);
};
