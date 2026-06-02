import admin from "firebase-admin";
import pg from "pg";
import { firestore } from "../config/firebase";

const { Pool } = pg as any;

type TimestampLike =
  | admin.firestore.Timestamp
  | Date
  | string
  | number
  | {
      seconds?: number;
      _seconds?: number;
      toDate?: () => Date;
      toMillis?: () => number;
    }
  | null
  | undefined;

type VendorRecord = {
  id: string;
  businessName?: string;
  country?: string;
  website?: string;
  address?: string;
  agreement?: boolean;
  contactEmail?: string;
  contactPhone?: string;
  email?: string;
  phone?: string;
  regNo?: string;
  taxNumber?: string;
  taxRegistered?: string;
  onboardingStatus?: string;
  logoUrl?: string;
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
  media?: {
    companyLogo?: {
      url?: string;
    };
  };
  [key: string]: unknown;
};

type SubscriptionRecord = {
  id: string;
  vendorId?: string;
  productId?: string;
  plan?: {
    planId?: string;
    planName?: string;
    price?: number;
  };
  payment?: {
    status?: string;
    amount?: number | string;
  };
  status?: string;
  startDate?: TimestampLike;
  endDate?: TimestampLike;
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
  [key: string]: unknown;
};

type InvoiceRecord = {
  id: string;
  subscriptionId?: string;
  status?: string;
  vendor?: {
    id?: string;
    name?: string;
  };
  product?: {
    id?: string;
    name?: string;
  };
  amounts?: {
    total?: number;
    baseAfterAdjustment?: number;
  };
  paidAt?: TimestampLike;
  createdAt?: TimestampLike;
  [key: string]: unknown;
};

type MonthlyTargetRecord = {
  month?: string;
  targetRevenue?: number;
  targetSubscriptions?: number;
  targetVendorOnboarding?: number;
  remarks?: string;
  status?: string;
  [key: string]: unknown;
};

export type MonthlyAchievement = {
  revenue: number;
  subscriptions: number;
  vendorOnboarding: number;
};

export type DashboardOverview = {
  generatedAt: string;
  summary: {
    totalVendors: number;
    activeVendors: number;
    pendingVendors: number;
    rejectedVendors: number;
    vendorsWithIncompleteDocuments: number;
    totalSubscriptions: number;
    activeSubscriptions: number;
    pendingSubscriptions: number;
    inactiveSubscriptions: number;
    totalRevenue: number;
    currentMonthRevenue: number;
    previousMonthRevenue: number;
    todayRevenue: number;
    totalPaidInvoices: number;
    pendingPaymentSubscriptions: number;
    currentMonthNewVendors: number;
    previousMonthNewVendors: number;
    currentMonthNewSubscriptions: number;
    previousMonthNewSubscriptions: number;
  };
  planBreakdown: Array<{
    planId: string;
    planName: string;
    total: number;
    active: number;
    pending: number;
    inactive: number;
    revenue: number;
  }>;
  monthlyTrends: Array<{
    month: string;
    label: string;
    revenue: number;
    subscriptions: number;
    vendors: number;
  }>;
  countryDistribution: Array<{
    country: string;
    count: number;
    share: number;
  }>;
  recentActivity: Array<{
    id: string;
    vendorName: string;
    country: string;
    planName: string;
    amount: number;
    status: string;
    paymentStatus: string;
    productName: string;
    createdAt: string | null;
  }>;
  monthlyTarget: {
    month: string;
    label: string;
    status: string;
    isSuggested: boolean;
    remarks: string;
    targetRevenue: number;
    targetSubscriptions: number;
    targetVendorOnboarding: number;
    actualRevenue: number;
    actualSubscriptions: number;
    actualVendorOnboarding: number;
    progressPct: number;
  };
  userBusiness: {
    summary: {
      totalUsers: number;
      activeUsers: number;
      verifiedUsers: number;
      totalBusinesses: number;
      subscribedBusinesses: number;
      totalSubscriptions: number;
      activeSubscriptions: number;
      inactiveSubscriptions: number;
      totalRevenue: number;
      currentMonthRevenue: number;
      previousMonthRevenue: number;
      todayRevenue: number;
      paidOrders: number;
      currentMonthNewUsers: number;
      previousMonthNewUsers: number;
    };
    growth: {
      userGrowthPct: number;
      subscriptionGrowthPct: number;
      revenueGrowthPct: number;
    };
  };
};

type DashboardCollections = {
  vendors: VendorRecord[];
  subscriptions: SubscriptionRecord[];
  invoices: InvoiceRecord[];
};

const MONTHLY_TARGETS_COLLECTION = "monthly_targets";
const DASHBOARD_COLLECTIONS_CACHE_TTL_MS = 30 * 1000;
const ACTIVE_VENDOR_STATUSES = new Set(["approved", "active", "verified"]);
const PENDING_VENDOR_STATUSES = new Set([
  "registered",
  "pending",
  "under-review",
  "under_review",
  "review",
]);
const REJECTED_VENDOR_STATUSES = new Set(["rejected", "inactive", "blocked"]);
const PENDING_SUBSCRIPTION_STATUSES = new Set(["pending", "payment_failed"]);
const INACTIVE_SUBSCRIPTION_STATUSES = new Set([
  "expired",
  "cancelled",
  "replaced",
  "refunded",
  "inactive",
]);

const COUNTRY_NAME_ALIASES: Record<string, string> = {
  usa: "United States",
  us: "United States",
  uae: "United Arab Emirates",
  uk: "United Kingdom",
};

const roundToTwo = (value: number) => Math.round(value * 100) / 100;
let dashboardCollectionsCache: {
  value: DashboardCollections;
  cachedAt: number;
} | null = null;
let dashboardCollectionsPromise: Promise<DashboardCollections> | null = null;
let userPortalPool: InstanceType<typeof Pool> | null = null;

const normalizeText = (value: unknown) => String(value ?? "").trim();

const parseBooleanEnv = (value: string | undefined, fallback = false) => {
  if (value == null || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on", "require"].includes(value.trim().toLowerCase());
};

const parseIntegerEnv = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

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
      max: parseIntegerEnv(process.env.USER_PORTAL_DB_POOL_MAX, 4),
      idleTimeoutMillis: parseIntegerEnv(process.env.USER_PORTAL_DB_IDLE_TIMEOUT_MS, 30000),
      connectionTimeoutMillis: parseIntegerEnv(
        process.env.USER_PORTAL_DB_CONNECT_TIMEOUT_MS,
        15000
      ),
      query_timeout: parseIntegerEnv(process.env.USER_PORTAL_DB_QUERY_TIMEOUT_MS, 30000),
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
      process.env.USER_PORTAL_DB_NAME ?? process.env.USER_PORTAL_DATABASE ?? "user_portal",
    max: parseIntegerEnv(process.env.USER_PORTAL_DB_POOL_MAX, 4),
    idleTimeoutMillis: parseIntegerEnv(process.env.USER_PORTAL_DB_IDLE_TIMEOUT_MS, 30000),
    connectionTimeoutMillis: parseIntegerEnv(
      process.env.USER_PORTAL_DB_CONNECT_TIMEOUT_MS,
      15000
    ),
    query_timeout: parseIntegerEnv(process.env.USER_PORTAL_DB_QUERY_TIMEOUT_MS, 30000),
    statement_timeout: parseIntegerEnv(process.env.USER_PORTAL_DB_STATEMENT_TIMEOUT_MS, 30000),
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
        "User portal PostgreSQL pool error:",
        error instanceof Error ? error.message : String(error)
      );
    });
  }

  return userPortalPool;
};

const normalizeCountry = (value: unknown) => {
  const normalized = normalizeText(value);

  if (!normalized) {
    return "Unspecified";
  }

  const alias = COUNTRY_NAME_ALIASES[normalized.toLowerCase()];

  return alias ?? normalized;
};

const toDate = (value: TimestampLike): Date | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate();
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value.toDate === "function") {
    const parsed = value.toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value.toMillis === "function") {
    const parsed = new Date(value.toMillis());
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value.seconds === "number") {
    return new Date(value.seconds * 1000);
  }

  if (typeof value._seconds === "number") {
    return new Date(value._seconds * 1000);
  }

  return null;
};

export const toIsoString = (value: TimestampLike) =>
  toDate(value)?.toISOString() ?? null;

const startOfMonth = (value: Date) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));

const addMonths = (value: Date, delta: number) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + delta, 1));

const toMonthKey = (value: Date) => {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
};

export const formatMonthLabel = (monthKey: string) => {
  const parsed = parseMonthKey(monthKey);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
};

export const parseMonthKey = (monthKey: string) => {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Month must use YYYY-MM format");
  }

  return new Date(Date.UTC(year, month - 1, 1));
};

export const getMonthRange = (monthKey: string) => {
  const start = parseMonthKey(monthKey);
  const end = addMonths(start, 1);

  return { start, end };
};

const isWithinRange = (value: TimestampLike, start: Date, end: Date) => {
  const parsed = toDate(value);

  if (!parsed) {
    return false;
  }

  return parsed >= start && parsed < end;
};

const calculatePercentChange = (current: number, previous: number) => {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }

  return roundToTwo(((current - previous) / previous) * 100);
};

const getEmptyUserBusinessOverview = (): DashboardOverview["userBusiness"] => ({
  summary: {
    totalUsers: 0,
    activeUsers: 0,
    verifiedUsers: 0,
    totalBusinesses: 0,
    subscribedBusinesses: 0,
    totalSubscriptions: 0,
    activeSubscriptions: 0,
    inactiveSubscriptions: 0,
    totalRevenue: 0,
    currentMonthRevenue: 0,
    previousMonthRevenue: 0,
    todayRevenue: 0,
    paidOrders: 0,
    currentMonthNewUsers: 0,
    previousMonthNewUsers: 0,
  },
  growth: {
    userGrowthPct: 0,
    subscriptionGrowthPct: 0,
    revenueGrowthPct: 0,
  },
});

const getUserBusinessOverview = async (now: Date): Promise<DashboardOverview["userBusiness"]> => {
  try {
    const pool = getUserPortalPool();
    const currentMonthStart = startOfMonth(now);
    const nextMonthStart = addMonths(currentMonthStart, 1);
    const previousMonthStart = addMonths(currentMonthStart, -1);
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const [
      userSummaryResult,
      businessSummaryResult,
      subscriptionSummaryResult,
      revenueSummaryResult,
    ] = await Promise.all([
      pool.query(
        `
          SELECT
            COUNT(*)::int AS total_users,
            COUNT(*) FILTER (WHERE LOWER(COALESCE(status, 'active')) = 'active')::int AS active_users,
            COUNT(*) FILTER (WHERE email_verified = TRUE)::int AS verified_users,
            COUNT(DISTINCT NULLIF(BTRIM(company_name), ''))::int AS total_businesses,
            COUNT(*) FILTER (WHERE created_at >= $1 AND created_at < $2)::int AS current_month_new_users,
            COUNT(*) FILTER (WHERE created_at >= $3 AND created_at < $1)::int AS previous_month_new_users
          FROM users
        `,
        [currentMonthStart, nextMonthStart, previousMonthStart]
      ),
      pool.query(
        `
          SELECT
            COUNT(DISTINCT NULLIF(BTRIM(u.company_name), ''))::int AS subscribed_businesses
          FROM user_plan_subscriptions s
          INNER JOIN users u ON u.id = s.user_id
          WHERE LOWER(COALESCE(s.status, 'active')) = 'active'
            AND s.expires_at >= $1
            AND NULLIF(BTRIM(u.company_name), '') IS NOT NULL
        `,
        [now]
      ),
      pool.query(
        `
          SELECT
            COUNT(*)::int AS total_subscriptions,
            COUNT(*) FILTER (
              WHERE LOWER(COALESCE(status, 'active')) = 'active' AND expires_at >= $1
            )::int AS active_subscriptions,
            COUNT(*) FILTER (
              WHERE LOWER(COALESCE(status, 'active')) <> 'active' OR expires_at < $1
            )::int AS inactive_subscriptions
          FROM user_plan_subscriptions
        `,
        [now]
      ),
      pool.query(
        `
          SELECT
            COALESCE(SUM(amount_paid), 0)::numeric AS total_revenue,
            COALESCE(SUM(amount_paid) FILTER (WHERE paid_at >= $1 AND paid_at < $2), 0)::numeric AS current_month_revenue,
            COALESCE(SUM(amount_paid) FILTER (WHERE paid_at >= $3 AND paid_at < $1), 0)::numeric AS previous_month_revenue,
            COALESCE(SUM(amount_paid) FILTER (WHERE paid_at >= $4 AND paid_at < $5), 0)::numeric AS today_revenue,
            COUNT(*) FILTER (WHERE LOWER(COALESCE(status, 'created')) = 'paid')::int AS paid_orders
          FROM user_plan_orders
          WHERE LOWER(COALESCE(status, 'created')) = 'paid'
        `,
        [currentMonthStart, nextMonthStart, previousMonthStart, todayStart, tomorrowStart]
      ),
    ]);

    const userRow = (userSummaryResult.rows[0] ?? {}) as Record<string, unknown>;
    const businessRow = (businessSummaryResult.rows[0] ?? {}) as Record<string, unknown>;
    const subscriptionRow = (subscriptionSummaryResult.rows[0] ?? {}) as Record<string, unknown>;
    const revenueRow = (revenueSummaryResult.rows[0] ?? {}) as Record<string, unknown>;

    const summary = {
      totalUsers: Number(userRow.total_users ?? 0),
      activeUsers: Number(userRow.active_users ?? 0),
      verifiedUsers: Number(userRow.verified_users ?? 0),
      totalBusinesses: Number(userRow.total_businesses ?? 0),
      subscribedBusinesses: Number(businessRow.subscribed_businesses ?? 0),
      totalSubscriptions: Number(subscriptionRow.total_subscriptions ?? 0),
      activeSubscriptions: Number(subscriptionRow.active_subscriptions ?? 0),
      inactiveSubscriptions: Number(subscriptionRow.inactive_subscriptions ?? 0),
      totalRevenue: roundToTwo(Number(revenueRow.total_revenue ?? 0)),
      currentMonthRevenue: roundToTwo(Number(revenueRow.current_month_revenue ?? 0)),
      previousMonthRevenue: roundToTwo(Number(revenueRow.previous_month_revenue ?? 0)),
      todayRevenue: roundToTwo(Number(revenueRow.today_revenue ?? 0)),
      paidOrders: Number(revenueRow.paid_orders ?? 0),
      currentMonthNewUsers: Number(userRow.current_month_new_users ?? 0),
      previousMonthNewUsers: Number(userRow.previous_month_new_users ?? 0),
    };

    return {
      summary,
      growth: {
        userGrowthPct: calculatePercentChange(
          summary.currentMonthNewUsers,
          summary.previousMonthNewUsers
        ),
        subscriptionGrowthPct: calculatePercentChange(
          summary.activeSubscriptions,
          Math.max(0, summary.totalSubscriptions - summary.activeSubscriptions)
        ),
        revenueGrowthPct: calculatePercentChange(
          summary.currentMonthRevenue,
          summary.previousMonthRevenue
        ),
      },
    };
  } catch (error) {
    console.error(
      "User portal dashboard metrics unavailable:",
      error instanceof Error ? error.message : String(error)
    );
    return getEmptyUserBusinessOverview();
  }
};

const getInvoiceAmount = (invoice: InvoiceRecord) => {
  const total = Number(invoice.amounts?.total ?? invoice.amounts?.baseAfterAdjustment ?? 0);

  return Number.isFinite(total) ? total : 0;
};

const getSubscriptionAmount = (subscription: SubscriptionRecord) => {
  const paymentAmount = Number(subscription.payment?.amount ?? NaN);

  if (Number.isFinite(paymentAmount) && paymentAmount > 0) {
    return paymentAmount;
  }

  const planAmount = Number(subscription.plan?.price ?? 0);

  return Number.isFinite(planAmount) ? planAmount : 0;
};

const normalizeVendorLifecycle = (status: unknown) => {
  const normalized = normalizeText(status).toLowerCase();

  if (ACTIVE_VENDOR_STATUSES.has(normalized)) {
    return "active";
  }

  if (REJECTED_VENDOR_STATUSES.has(normalized)) {
    return "rejected";
  }

  if (PENDING_VENDOR_STATUSES.has(normalized) || !normalized) {
    return "pending";
  }

  return "other";
};

const isVendorIncomplete = (vendor: VendorRecord) => {
  const hasLogo =
    Boolean(normalizeText(vendor.logoUrl)) ||
    Boolean(normalizeText(vendor.media?.companyLogo?.url));
  const requiresTaxNumber = normalizeText(vendor.taxRegistered).toLowerCase() === "yes";
  const requiredValues = [
    vendor.businessName,
    vendor.regNo,
    vendor.address,
    vendor.country,
    vendor.website,
    vendor.contactEmail ?? vendor.email,
    vendor.contactPhone ?? vendor.phone,
  ];

  const hasMissingRequiredField = requiredValues.some((value) => !normalizeText(value));

  if (!Boolean(vendor.agreement)) {
    return true;
  }

  if (hasMissingRequiredField || !hasLogo) {
    return true;
  }

  if (requiresTaxNumber && !normalizeText(vendor.taxNumber)) {
    return true;
  }

  return false;
};

const getSubscriptionLifecycle = (subscription: SubscriptionRecord, now = new Date()) => {
  const normalizedStatus = normalizeText(subscription.status).toLowerCase();
  const endDate = toDate(subscription.endDate);

  if (normalizedStatus === "active" && endDate && endDate < now) {
    return "inactive";
  }

  if (normalizedStatus === "active") {
    return "active";
  }

  if (PENDING_SUBSCRIPTION_STATUSES.has(normalizedStatus)) {
    return "pending";
  }

  if (INACTIVE_SUBSCRIPTION_STATUSES.has(normalizedStatus) || normalizedStatus) {
    return "inactive";
  }

  return "inactive";
};

const getSubscriptionSortDate = (subscription: SubscriptionRecord) =>
  toDate(subscription.updatedAt) ??
  toDate(subscription.createdAt) ??
  toDate(subscription.startDate) ??
  toDate(subscription.endDate) ??
  new Date(0);

const getSubscriptionActivationDate = (subscription: SubscriptionRecord) =>
  toDate(subscription.startDate) ??
  toDate(subscription.updatedAt) ??
  toDate(subscription.createdAt);

const pickLatestSubscriptions = (subscriptions: SubscriptionRecord[]) => {
  const grouped = new Map<string, SubscriptionRecord>();

  subscriptions.forEach((subscription) => {
    const key = `${normalizeText(subscription.vendorId)}:${normalizeText(subscription.productId)}`;

    if (!key || key === ":") {
      return;
    }

    const existing = grouped.get(key);

    if (!existing || getSubscriptionSortDate(subscription) > getSubscriptionSortDate(existing)) {
      grouped.set(key, subscription);
    }
  });

  return Array.from(grouped.values());
};

const buildMonthBuckets = (monthsBack: number, now: Date) => {
  const currentMonthStart = startOfMonth(now);
  const months: Array<{
    month: string;
    label: string;
    revenue: number;
    subscriptions: number;
    vendors: number;
  }> = [];

  for (let index = monthsBack - 1; index >= 0; index -= 1) {
    const monthDate = addMonths(currentMonthStart, -index);
    const monthKey = toMonthKey(monthDate);

    months.push({
      month: monthKey,
      label: new Intl.DateTimeFormat("en-US", {
        month: "short",
        timeZone: "UTC",
      }).format(monthDate),
      revenue: 0,
      subscriptions: 0,
      vendors: 0,
    });
  }

  return months;
};

export const fetchDashboardCollections = async ({
  forceRefresh = false,
}: {
  forceRefresh?: boolean;
} = {}): Promise<DashboardCollections> => {
  const now = Date.now();

  if (
    !forceRefresh &&
    dashboardCollectionsCache &&
    now - dashboardCollectionsCache.cachedAt < DASHBOARD_COLLECTIONS_CACHE_TTL_MS
  ) {
    return dashboardCollectionsCache.value;
  }

  if (dashboardCollectionsPromise) {
    return dashboardCollectionsPromise;
  }

  dashboardCollectionsPromise = (async () => {
    const [vendorSnapshot, subscriptionSnapshot, invoiceSnapshot] = await Promise.all([
      firestore
        .collection("vendor_profile")
        .select(
          "businessName",
          "country",
          "website",
          "address",
          "agreement",
          "contactEmail",
          "contactPhone",
          "email",
          "phone",
          "regNo",
          "taxNumber",
          "taxRegistered",
          "onboardingStatus",
          "logoUrl",
          "createdAt",
          "updatedAt",
          "media.companyLogo.url"
        )
        .get(),
      firestore
        .collection("subscriptions")
        .select(
          "vendorId",
          "productId",
          "plan.planId",
          "plan.planName",
          "plan.price",
          "payment.status",
          "payment.amount",
          "status",
          "startDate",
          "endDate",
          "createdAt",
          "updatedAt"
        )
        .get(),
      firestore
        .collection("invoices")
        .select(
          "subscriptionId",
          "status",
          "vendor.id",
          "vendor.name",
          "product.id",
          "product.name",
          "amounts.total",
          "amounts.baseAfterAdjustment",
          "paidAt",
          "createdAt"
        )
        .get(),
    ]);

    const collections = {
      vendors: vendorSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<VendorRecord, "id">),
      })),
      subscriptions: subscriptionSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<SubscriptionRecord, "id">),
      })),
      invoices: invoiceSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<InvoiceRecord, "id">),
      })),
    } satisfies DashboardCollections;

    dashboardCollectionsCache = {
      value: collections,
      cachedAt: Date.now(),
    };

    return collections;
  })();

  try {
    return await dashboardCollectionsPromise;
  } finally {
    dashboardCollectionsPromise = null;
  }
};

export const computeMonthlyAchievement = (
  monthKey: string,
  collections: DashboardCollections
): MonthlyAchievement => {
  const { start, end } = getMonthRange(monthKey);

  const revenue = roundToTwo(
    collections.invoices
      .filter((invoice) => {
        const status = normalizeText(invoice.status).toLowerCase();
        return status === "paid" && isWithinRange(invoice.paidAt ?? invoice.createdAt, start, end);
      })
      .reduce((sum, invoice) => sum + getInvoiceAmount(invoice), 0)
  );

  const activatedSubscriptions = collections.subscriptions.filter((subscription) => {
    const lifecycle = getSubscriptionLifecycle(subscription);
    const activationDate = getSubscriptionActivationDate(subscription);

    return lifecycle !== "pending" && Boolean(activationDate) && isWithinRange(activationDate, start, end);
  }).length;

  const vendorOnboarding = collections.vendors.filter((vendor) =>
    isWithinRange(vendor.createdAt, start, end)
  ).length;

  return {
    revenue,
    subscriptions: activatedSubscriptions,
    vendorOnboarding,
  };
};

export const buildSuggestedMonthlyTarget = (previousAchievement: MonthlyAchievement) => ({
  targetRevenue: roundToTwo(previousAchievement.revenue * 1.2),
  targetSubscriptions: Math.ceil(previousAchievement.subscriptions * 1.2),
  targetVendorOnboarding: Math.ceil(previousAchievement.vendorOnboarding * 1.2),
});

const resolveCurrentMonthlyTarget = async (
  now: Date,
  collections: DashboardCollections
) => {
  const currentMonth = toMonthKey(startOfMonth(now));
  const previousMonth = toMonthKey(addMonths(startOfMonth(now), -1));
  const [currentTargetSnapshot] = await Promise.all([
    firestore.collection(MONTHLY_TARGETS_COLLECTION).doc(currentMonth).get(),
  ]);

  const previousAchievement = computeMonthlyAchievement(previousMonth, collections);
  const actualAchievement = computeMonthlyAchievement(currentMonth, collections);
  const suggestion = buildSuggestedMonthlyTarget(previousAchievement);
  const currentTarget = currentTargetSnapshot.exists
    ? (currentTargetSnapshot.data() as MonthlyTargetRecord)
    : null;

  const targetRevenue = Number(currentTarget?.targetRevenue ?? suggestion.targetRevenue ?? 0);
  const progressPct =
    targetRevenue > 0
      ? Math.min(100, roundToTwo((actualAchievement.revenue / targetRevenue) * 100))
      : 0;

  return {
    month: currentMonth,
    label: formatMonthLabel(currentMonth),
    status: normalizeText(currentTarget?.status) || "draft",
    isSuggested: !currentTargetSnapshot.exists,
    remarks: normalizeText(currentTarget?.remarks),
    targetRevenue,
    targetSubscriptions: Number(
      currentTarget?.targetSubscriptions ?? suggestion.targetSubscriptions ?? 0
    ),
    targetVendorOnboarding: Number(
      currentTarget?.targetVendorOnboarding ?? suggestion.targetVendorOnboarding ?? 0
    ),
    actualRevenue: actualAchievement.revenue,
    actualSubscriptions: actualAchievement.subscriptions,
    actualVendorOnboarding: actualAchievement.vendorOnboarding,
    progressPct,
  };
};

export const getDashboardOverview = async (): Promise<DashboardOverview> => {
  const now = new Date();
  const collections = await fetchDashboardCollections();
  const userBusiness = await getUserBusinessOverview(now);
  const latestSubscriptions = pickLatestSubscriptions(collections.subscriptions);
  const vendorById = new Map(collections.vendors.map((vendor) => [vendor.id, vendor]));
  const subscriptionById = new Map(
    collections.subscriptions.map((subscription) => [subscription.id, subscription])
  );
  const monthBuckets = buildMonthBuckets(12, now);
  const monthIndex = new Map(monthBuckets.map((bucket) => [bucket.month, bucket]));
  const currentMonthKey = toMonthKey(startOfMonth(now));
  const previousMonthKey = toMonthKey(addMonths(startOfMonth(now), -1));
  const todayKey = now.toISOString().slice(0, 10);

  let activeVendors = 0;
  let pendingVendors = 0;
  let rejectedVendors = 0;
  let incompleteVendors = 0;

  collections.vendors.forEach((vendor) => {
    const lifecycle = normalizeVendorLifecycle(vendor.onboardingStatus);

    if (lifecycle === "active") {
      activeVendors += 1;
    } else if (lifecycle === "rejected") {
      rejectedVendors += 1;
    } else {
      pendingVendors += 1;
    }

    if (isVendorIncomplete(vendor)) {
      incompleteVendors += 1;
    }

    const createdAt = toDate(vendor.createdAt);

    if (!createdAt) {
      return;
    }

    const bucket = monthIndex.get(toMonthKey(startOfMonth(createdAt)));

    if (bucket) {
      bucket.vendors += 1;
    }
  });

  let activeSubscriptions = 0;
  let pendingSubscriptions = 0;
  let inactiveSubscriptions = 0;

  const planBreakdown = new Map<
    string,
    {
      planId: string;
      planName: string;
      total: number;
      active: number;
      pending: number;
      inactive: number;
      revenue: number;
    }
  >();

  latestSubscriptions.forEach((subscription) => {
    const lifecycle = getSubscriptionLifecycle(subscription, now);
    const planId = normalizeText(subscription.plan?.planId) || "unmapped-plan";
    const planName = normalizeText(subscription.plan?.planName) || "Unmapped plan";
    const planEntry =
      planBreakdown.get(planId) ??
      {
        planId,
        planName,
        total: 0,
        active: 0,
        pending: 0,
        inactive: 0,
        revenue: 0,
      };

    planEntry.total += 1;

    if (lifecycle === "active") {
      activeSubscriptions += 1;
      planEntry.active += 1;
    } else if (lifecycle === "pending") {
      pendingSubscriptions += 1;
      planEntry.pending += 1;
    } else {
      inactiveSubscriptions += 1;
      planEntry.inactive += 1;
    }

    const activationDate = getSubscriptionActivationDate(subscription);

    if (activationDate) {
      const bucket = monthIndex.get(toMonthKey(startOfMonth(activationDate)));

      if (bucket) {
        bucket.subscriptions += 1;
      }
    }

    planBreakdown.set(planId, planEntry);
  });

  let totalRevenue = 0;
  let currentMonthRevenue = 0;
  let previousMonthRevenue = 0;
  let todayRevenue = 0;
  let totalPaidInvoices = 0;

  if (collections.invoices.length > 0) {
    collections.invoices.forEach((invoice) => {
      const status = normalizeText(invoice.status).toLowerCase();

      if (status !== "paid") {
        return;
      }

      const amount = getInvoiceAmount(invoice);
      const paidAt = toDate(invoice.paidAt ?? invoice.createdAt);

      totalRevenue += amount;
      totalPaidInvoices += 1;

      if (paidAt) {
        const monthKey = toMonthKey(startOfMonth(paidAt));
        const bucket = monthIndex.get(monthKey);

        if (bucket) {
          bucket.revenue = roundToTwo(bucket.revenue + amount);
        }

        if (monthKey === currentMonthKey) {
          currentMonthRevenue += amount;
        }

        if (monthKey === previousMonthKey) {
          previousMonthRevenue += amount;
        }

        if (paidAt.toISOString().slice(0, 10) === todayKey) {
          todayRevenue += amount;
        }
      }

      const subscription = subscriptionById.get(normalizeText(invoice.subscriptionId));

      if (subscription) {
        const planId = normalizeText(subscription.plan?.planId) || "unmapped-plan";
        const planEntry = planBreakdown.get(planId);

        if (planEntry) {
          planEntry.revenue = roundToTwo(planEntry.revenue + amount);
        }
      }
    });
  } else {
    collections.subscriptions.forEach((subscription) => {
      const paymentStatus = normalizeText(subscription.payment?.status).toLowerCase();
      const amount = getSubscriptionAmount(subscription);
      const revenueDate = getSubscriptionActivationDate(subscription);

      if (paymentStatus !== "paid" || !revenueDate) {
        return;
      }

      totalRevenue += amount;

      const monthKey = toMonthKey(startOfMonth(revenueDate));
      const bucket = monthIndex.get(monthKey);

      if (bucket) {
        bucket.revenue = roundToTwo(bucket.revenue + amount);
      }

      if (monthKey === currentMonthKey) {
        currentMonthRevenue += amount;
      }

      if (monthKey === previousMonthKey) {
        previousMonthRevenue += amount;
      }

      if (revenueDate.toISOString().slice(0, 10) === todayKey) {
        todayRevenue += amount;
      }
    });
  }

  const currentMonthNewVendors = monthIndex.get(currentMonthKey)?.vendors ?? 0;
  const previousMonthNewVendors = monthIndex.get(previousMonthKey)?.vendors ?? 0;
  const currentMonthNewSubscriptions = monthIndex.get(currentMonthKey)?.subscriptions ?? 0;
  const previousMonthNewSubscriptions = monthIndex.get(previousMonthKey)?.subscriptions ?? 0;

  const countryCounts = collections.vendors.reduce<Map<string, number>>((accumulator, vendor) => {
    const country = normalizeCountry(vendor.country);
    accumulator.set(country, (accumulator.get(country) ?? 0) + 1);
    return accumulator;
  }, new Map());

  const countryDistribution = Array.from(countryCounts.entries())
    .map(([country, count]) => ({
      country,
      count,
      share: collections.vendors.length
        ? roundToTwo((count / collections.vendors.length) * 100)
        : 0,
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 6);

  const recentActivity = [...latestSubscriptions]
    .sort((left, right) => getSubscriptionSortDate(right).getTime() - getSubscriptionSortDate(left).getTime())
    .slice(0, 8)
    .map((subscription) => {
      const vendor = vendorById.get(normalizeText(subscription.vendorId));
      const relatedInvoice = collections.invoices.find(
        (invoice) => normalizeText(invoice.subscriptionId) === subscription.id
      );

      return {
        id: subscription.id,
        vendorName:
          normalizeText(vendor?.businessName) ||
          normalizeText(relatedInvoice?.vendor?.name) ||
          "Unknown vendor",
        country: normalizeCountry(vendor?.country),
        planName: normalizeText(subscription.plan?.planName) || "Unmapped plan",
        amount: roundToTwo(
          relatedInvoice ? getInvoiceAmount(relatedInvoice) : getSubscriptionAmount(subscription)
        ),
        status: getSubscriptionLifecycle(subscription, now),
        paymentStatus: normalizeText(subscription.payment?.status).toLowerCase() || "unpaid",
        productName:
          normalizeText(relatedInvoice?.product?.name) ||
          `Product ${normalizeText(subscription.productId).slice(0, 8) || "N/A"}`,
        createdAt: toIsoString(getSubscriptionActivationDate(subscription)),
      };
    });

  const monthlyTarget = await resolveCurrentMonthlyTarget(now, collections);

  return {
    generatedAt: now.toISOString(),
    summary: {
      totalVendors: collections.vendors.length,
      activeVendors,
      pendingVendors,
      rejectedVendors,
      vendorsWithIncompleteDocuments: incompleteVendors,
      totalSubscriptions: latestSubscriptions.length,
      activeSubscriptions,
      pendingSubscriptions,
      inactiveSubscriptions,
      totalRevenue: roundToTwo(totalRevenue),
      currentMonthRevenue: roundToTwo(currentMonthRevenue),
      previousMonthRevenue: roundToTwo(previousMonthRevenue),
      todayRevenue: roundToTwo(todayRevenue),
      totalPaidInvoices,
      pendingPaymentSubscriptions: collections.subscriptions.filter((subscription) =>
        PENDING_SUBSCRIPTION_STATUSES.has(
          normalizeText(subscription.status).toLowerCase()
        )
      ).length,
      currentMonthNewVendors,
      previousMonthNewVendors,
      currentMonthNewSubscriptions,
      previousMonthNewSubscriptions,
    },
    planBreakdown: Array.from(planBreakdown.values()).sort((left, right) => right.total - left.total),
    monthlyTrends: monthBuckets,
    countryDistribution,
    recentActivity,
    monthlyTarget,
    userBusiness,
  };
};

export const getGrowthInsights = (overview: DashboardOverview) => {
  return {
    vendorGrowthPct: calculatePercentChange(
      overview.summary.currentMonthNewVendors,
      overview.summary.previousMonthNewVendors
    ),
    subscriptionGrowthPct: calculatePercentChange(
      overview.summary.currentMonthNewSubscriptions,
      overview.summary.previousMonthNewSubscriptions
    ),
    revenueGrowthPct: calculatePercentChange(
      overview.summary.currentMonthRevenue,
      overview.summary.previousMonthRevenue
    ),
  };
};
