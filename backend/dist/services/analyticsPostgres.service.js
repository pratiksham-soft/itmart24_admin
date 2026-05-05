"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAnalyticsPreaggregated = exports.getAnalyticsPool = exports.initializeAnalyticsPostgres = exports.ensureTables = exports.ensureDatabase = exports.formatAnalyticsConnectionError = exports.getLastSuccessfulAnalyticsConfigSummary = exports.getAnalyticsConfigSummary = void 0;
const pg_1 = __importDefault(require("pg"));
const { Client, Pool } = pg_1.default;
const DEFAULT_DATABASE_NAME = "itmart24_analytics";
const DEFAULT_PORT = 5432;
const ADMIN_DATABASE_CANDIDATES = ["postgres", "template1", "defaultdb"];
let analyticsPool = null;
let analyticsInitPromise = null;
let analyticsInitError = null;
let analyticsInitFailedAt = 0;
let lastSuccessfulConfigSummary = null;
const INIT_RETRY_COOLDOWN_MS = 60000;
const parseBooleanEnv = (value, fallback = false) => {
    if (value == null || value === "") {
        return fallback;
    }
    return ["1", "true", "yes", "on", "require"].includes(value.trim().toLowerCase());
};
const parseIntegerEnv = (value, fallback) => {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const readConfig = () => {
    const host = process.env.ANALYTICS_PG_HOST ??
        process.env.PGHOST ??
        process.env.POSTGRES_HOST;
    const user = process.env.ANALYTICS_PG_USER ??
        process.env.PGUSER ??
        process.env.POSTGRES_USER;
    const password = process.env.ANALYTICS_PG_PASSWORD ??
        process.env.PGPASSWORD ??
        process.env.POSTGRES_PASSWORD;
    if (!host || !user || !password) {
        throw new Error("Missing PostgreSQL analytics configuration. Set ANALYTICS_PG_HOST, ANALYTICS_PG_USER, and ANALYTICS_PG_PASSWORD.");
    }
    const database = process.env.ANALYTICS_PG_DATABASE ??
        process.env.PGDATABASE ??
        process.env.POSTGRES_DATABASE ??
        DEFAULT_DATABASE_NAME;
    const sslEnabled = parseBooleanEnv(process.env.ANALYTICS_PG_SSL ?? process.env.PGSSLMODE, false);
    return {
        host,
        port: parseIntegerEnv(process.env.ANALYTICS_PG_PORT ?? process.env.PGPORT, DEFAULT_PORT),
        connectionTimeoutMillis: parseIntegerEnv(process.env.ANALYTICS_PG_CONNECT_TIMEOUT_MS, 15000),
        user,
        password,
        database,
        max: parseIntegerEnv(process.env.ANALYTICS_PG_POOL_MAX, 8),
        idleTimeoutMillis: parseIntegerEnv(process.env.ANALYTICS_PG_IDLE_TIMEOUT_MS, 30000),
        ssl: sslEnabled
            ? {
                rejectUnauthorized: false,
            }
            : undefined,
    };
};
const quoteIdentifier = (value) => `"${String(value).replace(/"/g, "\"\"")}"`;
const buildClientConfig = (database) => {
    const config = readConfig();
    return {
        host: config.host,
        port: config.port,
        connectionTimeoutMillis: config.connectionTimeoutMillis,
        user: config.user,
        password: config.password,
        database,
        ssl: config.ssl,
    };
};
const getPoolConfig = () => {
    const config = readConfig();
    return {
        host: config.host,
        port: config.port,
        connectionTimeoutMillis: config.connectionTimeoutMillis,
        user: config.user,
        password: config.password,
        database: config.database,
        max: config.max,
        idleTimeoutMillis: config.idleTimeoutMillis,
        query_timeout: parseIntegerEnv(process.env.ANALYTICS_PG_QUERY_TIMEOUT_MS, 60000),
        statement_timeout: parseIntegerEnv(process.env.ANALYTICS_PG_STATEMENT_TIMEOUT_MS, 60000),
        keepAlive: true,
        ssl: config.ssl,
    };
};
const getAnalyticsConfigSummary = () => {
    const config = readConfig();
    return {
        host: config.host,
        port: config.port,
        database: config.database,
    };
};
exports.getAnalyticsConfigSummary = getAnalyticsConfigSummary;
const getLastSuccessfulAnalyticsConfigSummary = () => lastSuccessfulConfigSummary;
exports.getLastSuccessfulAnalyticsConfigSummary = getLastSuccessfulAnalyticsConfigSummary;
const formatAnalyticsConnectionError = (error) => {
    if (error instanceof Error) {
        return `PostgreSQL connection failed: ${error.message}`;
    }
    return "PostgreSQL connection failed";
};
exports.formatAnalyticsConnectionError = formatAnalyticsConnectionError;
const canCreateDatabase = (error) => (error?.code ?? "") === "3D000";
const tryConnect = async (database) => {
    const client = new Client(buildClientConfig(database));
    try {
        await client.connect();
        return client;
    }
    catch (error) {
        await client.end().catch(() => undefined);
        throw error;
    }
};
const resolveAdminClient = async (config) => {
    const candidates = [
        ...new Set([
            process.env.ANALYTICS_PG_ADMIN_DATABASE,
            ...ADMIN_DATABASE_CANDIDATES,
            config.user,
        ].filter(Boolean)),
    ];
    let lastError = null;
    for (const databaseName of candidates) {
        try {
            const client = await tryConnect(databaseName);
            return client;
        }
        catch (error) {
            lastError = error;
            if (!canCreateDatabase(error)) {
                throw error;
            }
        }
    }
    throw (lastError ??
        new Error("Unable to connect to an administrative PostgreSQL database."));
};
const ensureDatabase = async () => {
    const config = readConfig();
    let targetClient = null;
    try {
        targetClient = await tryConnect(config.database);
        return;
    }
    catch (error) {
        if (!canCreateDatabase(error)) {
            throw error;
        }
    }
    finally {
        if (targetClient) {
            await targetClient.end().catch(() => undefined);
        }
    }
    const adminClient = await resolveAdminClient(config);
    try {
        const existingDatabase = await adminClient.query("SELECT 1 FROM pg_database WHERE datname = $1", [config.database]);
        if (existingDatabase.rowCount === 0) {
            await adminClient.query(`CREATE DATABASE ${quoteIdentifier(config.database)}`);
        }
    }
    finally {
        await adminClient.end();
    }
};
exports.ensureDatabase = ensureDatabase;
const TABLE_STATEMENTS = [
    `
    CREATE TABLE IF NOT EXISTS ai_insight_snapshots (
      product_id TEXT NOT NULL,
      vendor_id TEXT,
      date DATE NOT NULL,
      insights JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (product_id, date)
    )
  `,
    `
    CREATE TABLE IF NOT EXISTS ai_weekly_reports (
      product_id TEXT NOT NULL,
      vendor_id TEXT,
      week_start DATE NOT NULL,
      week_end DATE NOT NULL,
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      insights JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (product_id, week_start)
    )
  `,
    `
    CREATE TABLE IF NOT EXISTS analytics_preaggregated (
      product_id TEXT NOT NULL,
      vendor_id TEXT,
      range TEXT NOT NULL,
      success BOOLEAN NOT NULL DEFAULT FALSE,
      totals JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (product_id, range)
    )
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_analytics_preaggregated_range
    ON analytics_preaggregated (range, success)
  `,
    `
    CREATE TABLE IF NOT EXISTS analytics_snapshots (
      product_id TEXT NOT NULL,
      date DATE NOT NULL,
      totals JSONB NOT NULL DEFAULT '{}'::jsonb,
      traffic_sources JSONB NOT NULL DEFAULT '{}'::jsonb,
      device_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (product_id, date)
    )
  `,
    `
    CREATE TABLE IF NOT EXISTS blog_templates (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `,
    `
    CREATE TABLE IF NOT EXISTS blog_jobs (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      template_id BIGINT REFERENCES blog_templates(id) ON DELETE SET NULL,
      image_prompt_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      status TEXT NOT NULL DEFAULT 'inactive',
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `,
    `
    CREATE TABLE IF NOT EXISTS blog_job_categories (
      id BIGSERIAL PRIMARY KEY,
      job_id BIGINT NOT NULL REFERENCES blog_jobs(id) ON DELETE CASCADE,
      category_name TEXT NOT NULL,
      blog_count INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `,
    `
    CREATE TABLE IF NOT EXISTS blog_job_topics (
      id BIGSERIAL PRIMARY KEY,
      job_category_id BIGINT NOT NULL REFERENCES blog_job_categories(id) ON DELETE CASCADE,
      topic TEXT NOT NULL,
      image_urls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      topic_status TEXT NOT NULL DEFAULT 'pending',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `,
    `
    CREATE TABLE IF NOT EXISTS blog_job_source_links (
      id BIGSERIAL PRIMARY KEY,
      job_id BIGINT NOT NULL REFERENCES blog_jobs(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `,
    `
    CREATE TABLE IF NOT EXISTS blog_posts (
      id BIGSERIAL PRIMARY KEY,
      job_id BIGINT REFERENCES blog_jobs(id) ON DELETE SET NULL,
      template_id BIGINT REFERENCES blog_templates(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      cover_image_url TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `,
    `
    CREATE TABLE IF NOT EXISTS admin_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `,
    `
    CREATE TABLE IF NOT EXISTS admins (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'admin',
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `,
    `
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id BIGSERIAL PRIMARY KEY,
      admin_id BIGINT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
      token_hash VARCHAR(255) NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id
    ON admin_sessions (admin_id, expires_at DESC)
  `,
    `
    ALTER TABLE blog_jobs
    ADD COLUMN IF NOT EXISTS shopify_publish_enabled BOOLEAN NOT NULL DEFAULT FALSE
  `,
    `
    ALTER TABLE blog_jobs
    ADD COLUMN IF NOT EXISTS auto_publish_enabled BOOLEAN NOT NULL DEFAULT FALSE
  `,
    `
    ALTER TABLE blog_job_topics
    ADD COLUMN IF NOT EXISTS used_at TIMESTAMP
  `,
    `
    ALTER TABLE blog_job_topics
    ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
  `,
    `
    ALTER TABLE blog_posts
    ADD COLUMN IF NOT EXISTS shopify_blog_id BIGINT
  `,
    `
    ALTER TABLE blog_posts
    ADD COLUMN IF NOT EXISTS shopify_article_id BIGINT
  `,
    `
    ALTER TABLE blog_posts
    ADD COLUMN IF NOT EXISTS shopify_article_handle TEXT
  `,
    `
    ALTER TABLE blog_posts
    ADD COLUMN IF NOT EXISTS shopify_article_url TEXT
  `,
    `
    ALTER TABLE blog_posts
    ADD COLUMN IF NOT EXISTS topic TEXT
  `,
    `
    ALTER TABLE blog_posts
    ADD COLUMN IF NOT EXISTS slug TEXT
  `,
    `
    ALTER TABLE blog_posts
    ADD COLUMN IF NOT EXISTS meta_title TEXT
  `,
    `
    ALTER TABLE blog_posts
    ADD COLUMN IF NOT EXISTS meta_description TEXT
  `,
    `
    ALTER TABLE blog_posts
    ADD COLUMN IF NOT EXISTS excerpt TEXT
  `,
    `
    ALTER TABLE blog_posts
    ADD COLUMN IF NOT EXISTS content_html TEXT NOT NULL DEFAULT ''
  `,
    `
    ALTER TABLE blog_posts
    ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
  `,
    `
    ALTER TABLE blog_posts
    ADD COLUMN IF NOT EXISTS openai_usage JSONB NOT NULL DEFAULT '{}'::jsonb
  `,
    `
    ALTER TABLE blog_posts
    ADD COLUMN IF NOT EXISTS error_message TEXT
  `,
    `
    ALTER TABLE blog_posts
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMP
  `,
    `
    ALTER TABLE blog_posts
    ADD COLUMN IF NOT EXISTS publish_error TEXT
  `,
    `
    CREATE TABLE IF NOT EXISTS blog_job_runs (
      id BIGSERIAL PRIMARY KEY,
      job_id BIGINT NOT NULL REFERENCES blog_jobs(id) ON DELETE CASCADE,
      run_status TEXT NOT NULL DEFAULT 'pending',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP
    )
  `,
    `
    CREATE TABLE IF NOT EXISTS blog_job_run_logs (
      id BIGSERIAL PRIMARY KEY,
      run_id BIGINT NOT NULL REFERENCES blog_job_runs(id) ON DELETE CASCADE,
      log_level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `,
    `
    ALTER TABLE blog_job_runs
    ADD COLUMN IF NOT EXISTS trigger_mode TEXT NOT NULL DEFAULT 'manual'
  `,
    `
    ALTER TABLE blog_job_runs
    ADD COLUMN IF NOT EXISTS total_topics INTEGER NOT NULL DEFAULT 0
  `,
    `
    ALTER TABLE blog_job_runs
    ADD COLUMN IF NOT EXISTS success_count INTEGER NOT NULL DEFAULT 0
  `,
    `
    ALTER TABLE blog_job_runs
    ADD COLUMN IF NOT EXISTS failure_count INTEGER NOT NULL DEFAULT 0
  `,
    `
    ALTER TABLE blog_job_runs
    ADD COLUMN IF NOT EXISTS summary JSONB NOT NULL DEFAULT '{}'::jsonb
  `,
    `
    ALTER TABLE blog_job_run_logs
    ADD COLUMN IF NOT EXISTS step TEXT
  `,
    `
    ALTER TABLE blog_job_run_logs
    ADD COLUMN IF NOT EXISTS category_name TEXT
  `,
    `
    ALTER TABLE blog_job_run_logs
    ADD COLUMN IF NOT EXISTS topic TEXT
  `,
    `
    ALTER TABLE blog_job_run_logs
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_blog_jobs_status
    ON blog_jobs (status, updated_at DESC)
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_blog_job_categories_job_id
    ON blog_job_categories (job_id, sort_order)
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_blog_job_topics_category_id
    ON blog_job_topics (job_category_id, topic_status, sort_order)
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_blog_job_source_links_job_id
    ON blog_job_source_links (job_id, sort_order)
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_blog_posts_category_status
    ON blog_posts (category, status, created_at DESC)
  `,
    `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_posts_job_category_topic_unique
    ON blog_posts (job_id, category, topic)
    WHERE topic IS NOT NULL AND status IN ('generated', 'published')
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_blog_job_runs_job_id
    ON blog_job_runs (job_id, started_at DESC)
  `,
];
const ensureTables = async () => {
    const pool = await (0, exports.getAnalyticsPool)();
    const client = await pool.connect();
    try {
        for (const statement of TABLE_STATEMENTS) {
            await client.query(statement);
        }
    }
    finally {
        client.release();
    }
};
exports.ensureTables = ensureTables;
const initializeAnalyticsPostgres = async () => {
    if (analyticsInitError &&
        Date.now() - analyticsInitFailedAt < INIT_RETRY_COOLDOWN_MS) {
        throw analyticsInitError;
    }
    if (!analyticsInitPromise) {
        analyticsInitPromise = (async () => {
            const configSummary = (0, exports.getAnalyticsConfigSummary)();
            console.log(`Initializing Analytics PostgreSQL host=${configSummary.host} port=${configSummary.port} db=${configSummary.database}`);
            await (0, exports.ensureDatabase)();
            analyticsPool = new Pool(getPoolConfig());
            analyticsPool.on("error", (error) => {
                console.error("Analytics PostgreSQL pool error:", error instanceof Error ? error.message : String(error));
            });
            const pingResult = await analyticsPool.query("SELECT 1 AS ok");
            if (pingResult.rows[0]?.ok !== 1) {
                throw new Error("PostgreSQL connectivity check failed");
            }
            await (0, exports.ensureTables)();
            lastSuccessfulConfigSummary = configSummary;
            analyticsInitError = null;
            analyticsInitFailedAt = 0;
            console.log(`Analytics PostgreSQL connection ready host=${configSummary.host} port=${configSummary.port} db=${configSummary.database}`);
            return analyticsPool;
        })().catch((error) => {
            analyticsInitPromise = null;
            analyticsPool = null;
            analyticsInitError =
                error instanceof Error ? error : new Error(String(error));
            analyticsInitFailedAt = Date.now();
            throw analyticsInitError;
        });
    }
    return analyticsInitPromise;
};
exports.initializeAnalyticsPostgres = initializeAnalyticsPostgres;
const getAnalyticsPool = async () => {
    if (analyticsPool) {
        return analyticsPool;
    }
    await (0, exports.initializeAnalyticsPostgres)();
    if (!analyticsPool) {
        throw new Error("Analytics PostgreSQL pool failed to initialize");
    }
    return analyticsPool;
};
exports.getAnalyticsPool = getAnalyticsPool;
const listAnalyticsPreaggregated = async (range, success = true) => {
    const pool = await (0, exports.getAnalyticsPool)();
    const result = await pool.query(`
      SELECT product_id, vendor_id, range, success, totals, updated_at
      FROM analytics_preaggregated
      WHERE range = $1 AND success = $2
    `, [range, success]);
    return result.rows.map((row) => ({
        productId: row.product_id,
        vendorId: row.vendor_id ?? null,
        range: row.range,
        success: Boolean(row.success),
        totals: row.totals && typeof row.totals === "object"
            ? row.totals
            : {},
        updatedAt: row.updated_at,
    }));
};
exports.listAnalyticsPreaggregated = listAnalyticsPreaggregated;
