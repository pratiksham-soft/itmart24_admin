import pg from "pg";

const { Pool } = pg as any;

export type UserPortalPool = InstanceType<typeof Pool>;

type UserPortalUserRow = {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  country: string | null;
  company_name: string | null;
  job_role: string | null;
  avatar_url: string | null;
  public_review_display_name: string | null;
  email_verified: boolean;
  role: string;
  status: string;
  created_at: Date | string | null;
  updated_at: Date | string | null;
  saved_products_count: string | number | null;
  saved_comparisons_count: string | number | null;
  products_in_use_count: string | number | null;
  reviews_count: string | number | null;
  support_tickets_count: string | number | null;
};

export type UserPortalUser = {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  country: string | null;
  companyName: string | null;
  jobRole: string | null;
  avatarUrl: string | null;
  publicReviewDisplayName: string | null;
  emailVerified: boolean;
  role: string;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  savedProductsCount: number;
  savedComparisonsCount: number;
  productsInUseCount: number;
  reviewsCount: number;
  supportTicketsCount: number;
};

export type DeleteUserPortalUserResult = {
  id: string;
  fullName: string | null;
  email: string;
};

let userPortalPool: UserPortalPool | null = null;

const parseBooleanEnv = (
  value: string | undefined,
  fallback = false
) => {
  if (value == null || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on", "require"].includes(
    value.trim().toLowerCase()
  );
};

const parseIntegerEnv = (
  value: string | undefined,
  fallback: number
) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const normalizeDate = (value: Date | string | null) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const normalizeCount = (value: string | number | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
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
      "user_portal",
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

export const getUserPortalPool = () => {
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

const mapUserRow = (row: UserPortalUserRow): UserPortalUser => ({
  id: row.id,
  fullName: row.full_name,
  email: row.email,
  phone: row.phone,
  country: row.country,
  companyName: row.company_name,
  jobRole: row.job_role,
  avatarUrl: row.avatar_url,
  publicReviewDisplayName: row.public_review_display_name,
  emailVerified: Boolean(row.email_verified),
  role: row.role,
  status: row.status,
  createdAt: normalizeDate(row.created_at),
  updatedAt: normalizeDate(row.updated_at),
  savedProductsCount: normalizeCount(row.saved_products_count),
  savedComparisonsCount: normalizeCount(row.saved_comparisons_count),
  productsInUseCount: normalizeCount(row.products_in_use_count),
  reviewsCount: normalizeCount(row.reviews_count),
  supportTicketsCount: normalizeCount(row.support_tickets_count),
});

export const listUserPortalUsers = async (): Promise<UserPortalUser[]> => {
  const pool = getUserPortalPool();
  const result = await pool.query(
    `
      SELECT
        u.id,
        u.full_name,
        u.email,
        u.phone,
        u.country,
        u.company_name,
        u.job_role,
        u.avatar_url,
        u.public_review_display_name,
        u.email_verified,
        u.role,
        u.status,
        u.created_at,
        u.updated_at,
        COALESCE(sp.saved_products_count, 0) AS saved_products_count,
        COALESCE(sc.saved_comparisons_count, 0) AS saved_comparisons_count,
        COALESCE(piu.products_in_use_count, 0) AS products_in_use_count,
        COALESCE(rv.reviews_count, 0) AS reviews_count,
        COALESCE(st.support_tickets_count, 0) AS support_tickets_count
      FROM users u
      LEFT JOIN (
        SELECT user_id, COUNT(*)::int AS saved_products_count
        FROM saved_products
        GROUP BY user_id
      ) sp ON sp.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*)::int AS saved_comparisons_count
        FROM saved_comparisons
        GROUP BY user_id
      ) sc ON sc.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*)::int AS products_in_use_count
        FROM products_in_use
        GROUP BY user_id
      ) piu ON piu.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*)::int AS reviews_count
        FROM reviews
        GROUP BY user_id
      ) rv ON rv.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*)::int AS support_tickets_count
        FROM support_tickets
        GROUP BY user_id
      ) st ON st.user_id = u.id
      ORDER BY u.created_at DESC, u.email ASC
    `
  );

  return (result.rows as UserPortalUserRow[]).map(mapUserRow);
};

export const deleteUserPortalUser = async (input: {
  userId: string;
  confirmationName: string;
}): Promise<DeleteUserPortalUserResult> => {
  const pool = getUserPortalPool();
  const normalizedUserId = input.userId.trim();
  const normalizedConfirmationName = input.confirmationName.trim();

  if (!normalizedUserId) {
    throw new Error("User ID is required.");
  }

  const existingResult = await pool.query(
    `
      SELECT id, full_name, email
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [normalizedUserId]
  );

  const existingUser = existingResult.rows[0] as
    | {
        id: string;
        full_name: string | null;
        email: string;
      }
    | undefined;

  if (!existingUser) {
    throw new Error("User not found.");
  }

  const confirmationTarget =
    existingUser.full_name?.trim() || existingUser.email.trim() || existingUser.id;

  if (!normalizedConfirmationName) {
    throw new Error("Confirmation name is required.");
  }

  if (normalizedConfirmationName !== confirmationTarget) {
    throw new Error("Confirmation name does not match the selected user.");
  }

  await pool.query(
    `
      DELETE FROM users
      WHERE id = $1
    `,
    [normalizedUserId]
  );

  return {
    id: existingUser.id,
    fullName: existingUser.full_name,
    email: existingUser.email,
  };
};
