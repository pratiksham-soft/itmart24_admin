"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAnalyticsPreaggregated = exports.getAnalyticsPool = exports.initializeAnalyticsPostgres = exports.ensureTables = exports.ensureDatabase = exports.formatAnalyticsConnectionError = exports.getLastSuccessfulAnalyticsConfigSummary = exports.getAnalyticsConfigSummary = void 0;
const pg_1 = __importDefault(require("pg"));
const databaseTargets_1 = require("../config/databaseTargets");
const planPromoCodes_schema_1 = require("./planPromoCodes.schema");
const planPromoCodes_service_1 = require("./planPromoCodes.service");
const { Client, Pool } = pg_1.default;
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
        databaseTargets_1.DEFAULT_ANALYTICS_DATABASE;
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
    `
    CREATE TABLE IF NOT EXISTS email_accounts (
      id BIGSERIAL PRIMARY KEY,
      display_name TEXT NOT NULL,
      email_address TEXT NOT NULL,
      username TEXT NOT NULL,
      encrypted_password TEXT NOT NULL,
      imap_host TEXT NOT NULL,
      imap_port INTEGER NOT NULL,
      imap_secure BOOLEAN NOT NULL DEFAULT TRUE,
      smtp_host TEXT NOT NULL,
      smtp_port INTEGER NOT NULL,
      smtp_secure BOOLEAN NOT NULL DEFAULT TRUE,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      last_tested_at TIMESTAMP,
      last_test_status TEXT,
      last_test_error TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMP
    )
  `,
    `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_email_accounts_email_address_active
    ON email_accounts (email_address)
    WHERE deleted_at IS NULL
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_email_accounts_default_active
    ON email_accounts (is_default DESC, is_active DESC, updated_at DESC)
    WHERE deleted_at IS NULL
  `,
    `
    CREATE TABLE IF NOT EXISTS email_activity_logs (
      id BIGSERIAL PRIMARY KEY,
      admin_user_id BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      account_id BIGINT REFERENCES email_accounts(id) ON DELETE SET NULL,
      direction TEXT NOT NULL,
      recipients TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      subject TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'success',
      error_message TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_email_activity_logs_account_created
    ON email_activity_logs (account_id, created_at DESC)
  `,
    `
    CREATE TABLE IF NOT EXISTS crm_leads (
      id BIGSERIAL PRIMARY KEY,
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      phone TEXT,
      emails JSONB NOT NULL DEFAULT '[]'::jsonb,
      phones JSONB NOT NULL DEFAULT '[]'::jsonb,
      address TEXT,
      company_name TEXT,
      job_title TEXT,
      website TEXT,
      country TEXT,
      city TEXT,
      state TEXT,
      industry TEXT,
      category TEXT,
      sub_category TEXT,
      lifecycle_stage TEXT,
      lead_type TEXT,
      lead_source TEXT NOT NULL DEFAULT 'Other',
      lead_status TEXT NOT NULL DEFAULT 'New',
      lead_priority TEXT NOT NULL DEFAULT 'Medium',
      lead_score NUMERIC(5,2) NOT NULL DEFAULT 0,
      estimated_value NUMERIC(14,2) NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      assigned_to BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      notes JSONB NOT NULL DEFAULT '[]'::jsonb,
      unsubscribed BOOLEAN NOT NULL DEFAULT FALSE,
      bounced BOOLEAN NOT NULL DEFAULT FALSE,
      bounce_type TEXT,
      spam_complaint BOOLEAN NOT NULL DEFAULT FALSE,
      do_not_contact BOOLEAN NOT NULL DEFAULT FALSE,
      email_consent_status TEXT NOT NULL DEFAULT 'unknown',
      last_email_sent_at TIMESTAMP,
      email_sent_count INTEGER NOT NULL DEFAULT 0,
      last_email_opened_at TIMESTAMP,
      email_open_count INTEGER NOT NULL DEFAULT 0,
      last_email_clicked_at TIMESTAMP,
      email_click_count INTEGER NOT NULL DEFAULT 0,
      last_email_replied_at TIMESTAMP,
      email_reply_count INTEGER NOT NULL DEFAULT 0,
      last_campaign_name TEXT,
      last_campaign_status TEXT,
      last_campaign_id TEXT,
      next_follow_up_at TIMESTAMP,
      last_activity_at TIMESTAMP,
      converted_contact_id BIGINT,
      converted_company_id BIGINT,
      converted_deal_id BIGINT,
      created_by BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      updated_by BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMP
    )
  `,
    `
    CREATE TABLE IF NOT EXISTS crm_custom_leads (
      id BIGSERIAL PRIMARY KEY,
      lead_type TEXT NOT NULL DEFAULT 'custom_portfolio_pricing',
      company_name TEXT NOT NULL,
      website TEXT NOT NULL,
      business_email TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      job_title TEXT,
      country TEXT,
      product_count_range TEXT NOT NULL,
      categories JSONB NOT NULL DEFAULT '[]'::jsonb,
      promotion_goals JSONB NOT NULL DEFAULT '[]'::jsonb,
      visibility_level TEXT NOT NULL,
      budget_range TEXT,
      message TEXT,
      source_page TEXT NOT NULL DEFAULT 'vendor_page',
      shopify_page_id TEXT NOT NULL DEFAULT '124057551087',
      status TEXT NOT NULL DEFAULT 'new',
      assigned_to BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      sales_notes TEXT,
      follow_up_status TEXT NOT NULL DEFAULT 'not_started',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_custom_leads_email_created
    ON crm_custom_leads (business_email, created_at DESC)
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_custom_leads_status_created
    ON crm_custom_leads (status, created_at DESC)
  `,
    `
    CREATE TABLE IF NOT EXISTS crm_companies (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      website TEXT,
      industry TEXT,
      company_size TEXT,
      country TEXT,
      city TEXT,
      email TEXT,
      phone TEXT,
      linkedin_url TEXT,
      twitter_url TEXT,
      facebook_url TEXT,
      description TEXT,
      owner BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'Prospect',
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      updated_by BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMP
    )
  `,
    `
    CREATE TABLE IF NOT EXISTS crm_contacts (
      id BIGSERIAL PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT,
      email TEXT,
      phone TEXT,
      alternate_phone TEXT,
      company_id BIGINT REFERENCES crm_companies(id) ON DELETE SET NULL,
      company_name TEXT,
      job_title TEXT,
      department TEXT,
      contact_type TEXT NOT NULL DEFAULT 'Prospect',
      lifecycle_stage TEXT NOT NULL DEFAULT 'Lead',
      owner BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      notes JSONB NOT NULL DEFAULT '[]'::jsonb,
      last_contacted_at TIMESTAMP,
      next_follow_up_at TIMESTAMP,
      created_by BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      updated_by BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMP
    )
  `,
    `
    CREATE TABLE IF NOT EXISTS crm_deals (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      lead_id BIGINT REFERENCES crm_leads(id) ON DELETE SET NULL,
      contact_id BIGINT REFERENCES crm_contacts(id) ON DELETE SET NULL,
      company_id BIGINT REFERENCES crm_companies(id) ON DELETE SET NULL,
      stage TEXT NOT NULL DEFAULT 'New',
      value NUMERIC(14,2) NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      probability NUMERIC(5,2) NOT NULL DEFAULT 0,
      expected_close_date TIMESTAMP,
      owner BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      source TEXT,
      description TEXT,
      lost_reason TEXT,
      won_at TIMESTAMP,
      lost_at TIMESTAMP,
      created_by BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      updated_by BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMP
    )
  `,
    `
    CREATE TABLE IF NOT EXISTS crm_tasks (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      task_type TEXT NOT NULL DEFAULT 'Follow-up',
      priority TEXT NOT NULL DEFAULT 'Medium',
      status TEXT NOT NULL DEFAULT 'Pending',
      due_at TIMESTAMP,
      reminder_at TIMESTAMP,
      assigned_to BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      related_type TEXT,
      related_id BIGINT,
      completed_at TIMESTAMP,
      created_by BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      updated_by BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMP
    )
  `,
    `
    CREATE TABLE IF NOT EXISTS crm_segments (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      entity_type TEXT NOT NULL,
      conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
      match_type TEXT NOT NULL DEFAULT 'all',
      segment_limit INTEGER,
      sort_by TEXT,
      sort_direction TEXT NOT NULL DEFAULT 'desc',
      randomize BOOLEAN NOT NULL DEFAULT FALSE,
      created_by BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      updated_by BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMP
    )
  `,
    `
    CREATE TABLE IF NOT EXISTS crm_activities (
      id BIGSERIAL PRIMARY KEY,
      activity_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      related_type TEXT,
      related_id BIGINT,
      actor_id BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      actor_name TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMP
    )
  `,
    `
    CREATE TABLE IF NOT EXISTS crm_campaigns (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      sender_account_id BIGINT REFERENCES email_accounts(id) ON DELETE SET NULL,
      sender_email TEXT,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      body_mode TEXT NOT NULL DEFAULT 'html',
      status TEXT NOT NULL DEFAULT 'Draft',
      recipient_type TEXT NOT NULL DEFAULT 'leads',
      segment_id BIGINT REFERENCES crm_segments(id) ON DELETE SET NULL,
      delay_seconds INTEGER NOT NULL DEFAULT 10,
      total_recipients INTEGER NOT NULL DEFAULT 0,
      recipient_count INTEGER NOT NULL DEFAULT 0,
      sent_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      opened_count INTEGER NOT NULL DEFAULT 0,
      clicked_count INTEGER NOT NULL DEFAULT 0,
      scheduled_at TIMESTAMP,
      started_at TIMESTAMP,
      sent_at TIMESTAMP,
      completed_at TIMESTAMP,
      cancelled_at TIMESTAMP,
      last_error TEXT,
      last_activity_at TIMESTAMP NOT NULL DEFAULT NOW(),
      created_by BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      updated_by BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMP
    )
  `,
    `
    ALTER TABLE crm_campaigns
    ADD COLUMN IF NOT EXISTS sender_account_id BIGINT REFERENCES email_accounts(id) ON DELETE SET NULL
  `,
    `
    ALTER TABLE crm_campaigns
    ADD COLUMN IF NOT EXISTS sender_email TEXT
  `,
    `
    ALTER TABLE crm_campaigns
    ADD COLUMN IF NOT EXISTS from_name TEXT
  `,
    `
    ALTER TABLE crm_campaigns
    ADD COLUMN IF NOT EXISTS reply_to TEXT
  `,
    `
    ALTER TABLE crm_campaigns
    ADD COLUMN IF NOT EXISTS body_mode TEXT NOT NULL DEFAULT 'html'
  `,
    `
    ALTER TABLE crm_campaigns
    ADD COLUMN IF NOT EXISTS body_html TEXT
  `,
    `
    ALTER TABLE crm_campaigns
    ADD COLUMN IF NOT EXISTS body_text TEXT
  `,
    `
    ALTER TABLE crm_campaigns
    ADD COLUMN IF NOT EXISTS campaign_type TEXT NOT NULL DEFAULT 'cold_outreach'
  `,
    `
    ALTER TABLE crm_campaigns
    ADD COLUMN IF NOT EXISTS send_limit INTEGER
  `,
    `
    ALTER TABLE crm_campaigns
    ADD COLUMN IF NOT EXISTS delay_seconds INTEGER NOT NULL DEFAULT 10
  `,
    `
    ALTER TABLE crm_campaigns
    ADD COLUMN IF NOT EXISTS delay_min_seconds INTEGER NOT NULL DEFAULT 45
  `,
    `
    ALTER TABLE crm_campaigns
    ADD COLUMN IF NOT EXISTS delay_max_seconds INTEGER NOT NULL DEFAULT 90
  `,
    `
    ALTER TABLE crm_campaigns
    ADD COLUMN IF NOT EXISTS track_opens BOOLEAN NOT NULL DEFAULT TRUE
  `,
    `
    ALTER TABLE crm_campaigns
    ADD COLUMN IF NOT EXISTS track_clicks BOOLEAN NOT NULL DEFAULT TRUE
  `,
    `
    ALTER TABLE crm_campaigns
    ADD COLUMN IF NOT EXISTS unsubscribe_required BOOLEAN NOT NULL DEFAULT TRUE
  `,
    `
    ALTER TABLE crm_campaigns
    ADD COLUMN IF NOT EXISTS total_recipients INTEGER NOT NULL DEFAULT 0
  `,
    `
    ALTER TABLE crm_campaigns
    ADD COLUMN IF NOT EXISTS skipped_count INTEGER NOT NULL DEFAULT 0
  `,
    `
    ALTER TABLE crm_campaigns
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMP
  `,
    `
    ALTER TABLE crm_campaigns
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP
  `,
    `
    ALTER TABLE crm_campaigns
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP
  `,
    `
    ALTER TABLE crm_campaigns
    ADD COLUMN IF NOT EXISTS last_error TEXT
  `,
    `
    ALTER TABLE crm_campaigns
    ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP NOT NULL DEFAULT NOW()
  `,
    `
    CREATE TABLE IF NOT EXISTS crm_campaign_recipients (
      id BIGSERIAL PRIMARY KEY,
      campaign_id BIGINT NOT NULL REFERENCES crm_campaigns(id) ON DELETE CASCADE,
      lead_id BIGINT REFERENCES crm_leads(id) ON DELETE SET NULL,
      email TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      address TEXT,
      company_name TEXT,
      job_title TEXT,
      website TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      personalized_subject TEXT,
      personalized_body_html TEXT,
      error_message TEXT,
      sent_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `,
    `
    CREATE TABLE IF NOT EXISTS crm_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS lead_type TEXT
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS emails JSONB NOT NULL DEFAULT '[]'::jsonb
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS phones JSONB NOT NULL DEFAULT '[]'::jsonb
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS address TEXT
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS country TEXT
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS city TEXT
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS state TEXT
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS industry TEXT
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS category TEXT
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS sub_category TEXT
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS unsubscribed BOOLEAN NOT NULL DEFAULT FALSE
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS bounced BOOLEAN NOT NULL DEFAULT FALSE
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS bounce_type TEXT
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS spam_complaint BOOLEAN NOT NULL DEFAULT FALSE
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN NOT NULL DEFAULT FALSE
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS email_consent_status TEXT NOT NULL DEFAULT 'unknown'
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS last_email_sent_at TIMESTAMP
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS email_sent_count INTEGER NOT NULL DEFAULT 0
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS last_email_opened_at TIMESTAMP
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS email_open_count INTEGER NOT NULL DEFAULT 0
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS last_email_clicked_at TIMESTAMP
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS email_click_count INTEGER NOT NULL DEFAULT 0
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS last_email_replied_at TIMESTAMP
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS email_reply_count INTEGER NOT NULL DEFAULT 0
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS last_campaign_name TEXT
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS last_campaign_status TEXT
  `,
    `
    ALTER TABLE crm_leads
    ADD COLUMN IF NOT EXISTS last_campaign_id TEXT
  `,
    `
    UPDATE crm_leads
    SET unsubscribed = FALSE
    WHERE unsubscribed IS NULL
  `,
    `
    UPDATE crm_leads
    SET bounced = FALSE
    WHERE bounced IS NULL
  `,
    `
    UPDATE crm_leads
    SET spam_complaint = FALSE
    WHERE spam_complaint IS NULL
  `,
    `
    UPDATE crm_leads
    SET do_not_contact = FALSE
    WHERE do_not_contact IS NULL
  `,
    `
    UPDATE crm_leads
    SET email_sent_count = 0
    WHERE email_sent_count IS NULL
  `,
    `
    UPDATE crm_leads
    SET email_open_count = 0
    WHERE email_open_count IS NULL
  `,
    `
    UPDATE crm_leads
    SET email_click_count = 0
    WHERE email_click_count IS NULL
  `,
    `
    UPDATE crm_leads
    SET email_reply_count = 0
    WHERE email_reply_count IS NULL
  `,
    `
    UPDATE crm_leads
    SET email_consent_status = 'unknown'
    WHERE email_consent_status IS NULL OR BTRIM(email_consent_status) = ''
  `,
    `
    ALTER TABLE crm_segments
    ADD COLUMN IF NOT EXISTS segment_limit INTEGER
  `,
    `
    ALTER TABLE crm_segments
    ADD COLUMN IF NOT EXISTS sort_by TEXT
  `,
    `
    ALTER TABLE crm_segments
    ADD COLUMN IF NOT EXISTS sort_direction TEXT NOT NULL DEFAULT 'desc'
  `,
    `
    ALTER TABLE crm_segments
    ADD COLUMN IF NOT EXISTS randomize BOOLEAN NOT NULL DEFAULT FALSE
  `,
    `
    ALTER TABLE crm_campaign_recipients
    ADD COLUMN IF NOT EXISTS address TEXT
  `,
    `
    ALTER TABLE crm_campaign_recipients
    ADD COLUMN IF NOT EXISTS contact_name TEXT
  `,
    `
    ALTER TABLE crm_campaign_recipients
    ADD COLUMN IF NOT EXISTS blocked_reason TEXT
  `,
    `
    ALTER TABLE crm_campaign_recipients
    ADD COLUMN IF NOT EXISTS skip_reason TEXT
  `,
    `
    ALTER TABLE crm_campaign_recipients
    ADD COLUMN IF NOT EXISTS message_id TEXT
  `,
    `
    ALTER TABLE crm_campaign_recipients
    ADD COLUMN IF NOT EXISTS provider_message_id TEXT
  `,
    `
    ALTER TABLE crm_campaign_recipients
    ADD COLUMN IF NOT EXISTS tracking_token TEXT
  `,
    `
    ALTER TABLE crm_campaign_recipients
    ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP
  `,
    `
    ALTER TABLE crm_campaign_recipients
    ADD COLUMN IF NOT EXISTS first_opened_at TIMESTAMP
  `,
    `
    ALTER TABLE crm_campaign_recipients
    ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMP
  `,
    `
    ALTER TABLE crm_campaign_recipients
    ADD COLUMN IF NOT EXISTS open_count INTEGER NOT NULL DEFAULT 0
  `,
    `
    ALTER TABLE crm_campaign_recipients
    ADD COLUMN IF NOT EXISTS first_clicked_at TIMESTAMP
  `,
    `
    ALTER TABLE crm_campaign_recipients
    ADD COLUMN IF NOT EXISTS last_clicked_at TIMESTAMP
  `,
    `
    ALTER TABLE crm_campaign_recipients
    ADD COLUMN IF NOT EXISTS click_count INTEGER NOT NULL DEFAULT 0
  `,
    `
    ALTER TABLE crm_campaign_recipients
    ADD COLUMN IF NOT EXISTS replied_at TIMESTAMP
  `,
    `
    ALTER TABLE crm_campaign_recipients
    ADD COLUMN IF NOT EXISTS bounce_at TIMESTAMP
  `,
    `
    ALTER TABLE crm_campaign_recipients
    ADD COLUMN IF NOT EXISTS bounce_type TEXT
  `,
    `
    ALTER TABLE crm_campaign_recipients
    ADD COLUMN IF NOT EXISTS bounce_reason TEXT
  `,
    `
    ALTER TABLE crm_campaign_recipients
    ADD COLUMN IF NOT EXISTS complained_at TIMESTAMP
  `,
    `
    ALTER TABLE crm_campaign_recipients
    ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMP
  `,
    `
    ALTER TABLE crm_campaign_recipients
    ADD COLUMN IF NOT EXISTS failed_at TIMESTAMP
  `,
    `
    ALTER TABLE crm_campaign_recipients
    ADD COLUMN IF NOT EXISTS failure_reason TEXT
  `,
    `
    ALTER TABLE crm_campaign_recipients
    ADD COLUMN IF NOT EXISTS last_event_type TEXT
  `,
    `
    ALTER TABLE crm_campaign_recipients
    ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMP
  `,
    `
    CREATE TABLE IF NOT EXISTS crm_email_events (
      id BIGSERIAL PRIMARY KEY,
      campaign_id BIGINT REFERENCES crm_campaigns(id) ON DELETE CASCADE,
      recipient_id BIGINT REFERENCES crm_campaign_recipients(id) ON DELETE CASCADE,
      lead_id BIGINT REFERENCES crm_leads(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      event_source TEXT NOT NULL DEFAULT 'internal',
      email TEXT,
      ip_address TEXT,
      user_agent TEXT,
      url TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `,
    `
    CREATE TABLE IF NOT EXISTS crm_email_clicks (
      id BIGSERIAL PRIMARY KEY,
      campaign_id BIGINT NOT NULL REFERENCES crm_campaigns(id) ON DELETE CASCADE,
      recipient_id BIGINT NOT NULL REFERENCES crm_campaign_recipients(id) ON DELETE CASCADE,
      lead_id BIGINT REFERENCES crm_leads(id) ON DELETE SET NULL,
      original_url TEXT NOT NULL,
      tracking_url TEXT,
      clicked_at TIMESTAMP NOT NULL DEFAULT NOW(),
      ip_address TEXT,
      user_agent TEXT
    )
  `,
    `
    CREATE TABLE IF NOT EXISTS crm_email_unsubscribes (
      id BIGSERIAL PRIMARY KEY,
      lead_id BIGINT REFERENCES crm_leads(id) ON DELETE SET NULL,
      email TEXT NOT NULL,
      campaign_id BIGINT REFERENCES crm_campaigns(id) ON DELETE SET NULL,
      recipient_id BIGINT REFERENCES crm_campaign_recipients(id) ON DELETE SET NULL,
      reason TEXT,
      unsubscribed_at TIMESTAMP NOT NULL DEFAULT NOW(),
      source TEXT NOT NULL DEFAULT 'unsubscribe_link'
    )
  `,
    `
    CREATE TABLE IF NOT EXISTS crm_email_links (
      id BIGSERIAL PRIMARY KEY,
      campaign_id BIGINT NOT NULL REFERENCES crm_campaigns(id) ON DELETE CASCADE,
      recipient_id BIGINT NOT NULL REFERENCES crm_campaign_recipients(id) ON DELETE CASCADE,
      lead_id BIGINT REFERENCES crm_leads(id) ON DELETE SET NULL,
      click_token TEXT NOT NULL UNIQUE,
      original_url TEXT NOT NULL,
      tracking_url TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_leads_email ON crm_leads (email) WHERE deleted_at IS NULL
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_leads_status_source ON crm_leads (lead_status, lead_source, created_at DESC) WHERE deleted_at IS NULL
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_leads_created_at ON crm_leads (created_at DESC) WHERE deleted_at IS NULL
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_leads_lead_type ON crm_leads (lead_type, created_at DESC) WHERE deleted_at IS NULL
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_leads_lead_status ON crm_leads (lead_status, created_at DESC) WHERE deleted_at IS NULL
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_leads_lead_source ON crm_leads (lead_source, created_at DESC) WHERE deleted_at IS NULL
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_leads_lifecycle_stage ON crm_leads (lifecycle_stage, created_at DESC) WHERE deleted_at IS NULL
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_leads_assigned_to ON crm_leads (assigned_to, next_follow_up_at, created_at DESC) WHERE deleted_at IS NULL
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_leads_unsubscribed ON crm_leads (unsubscribed, created_at DESC) WHERE deleted_at IS NULL
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_leads_bounced ON crm_leads (bounced, created_at DESC) WHERE deleted_at IS NULL
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_leads_spam_complaint ON crm_leads (spam_complaint, created_at DESC) WHERE deleted_at IS NULL
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_leads_do_not_contact ON crm_leads (do_not_contact, created_at DESC) WHERE deleted_at IS NULL
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_leads_last_email_sent_at ON crm_leads (last_email_sent_at DESC) WHERE deleted_at IS NULL
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_leads_tags_gin ON crm_leads USING GIN (tags)
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_contacts_email ON crm_contacts (email) WHERE deleted_at IS NULL
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_contacts_company_id ON crm_contacts (company_id, owner, created_at DESC) WHERE deleted_at IS NULL
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_companies_owner_status ON crm_companies (owner, status, created_at DESC) WHERE deleted_at IS NULL
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_deals_stage_owner ON crm_deals (stage, owner, expected_close_date, created_at DESC) WHERE deleted_at IS NULL
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_tasks_due_status ON crm_tasks (due_at, status, assigned_to) WHERE deleted_at IS NULL
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_activities_related ON crm_activities (related_type, related_id, created_at DESC)
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_campaigns_status ON crm_campaigns (status, sent_at DESC, created_at DESC) WHERE deleted_at IS NULL
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_campaigns_sender_account ON crm_campaigns (sender_account_id, created_at DESC) WHERE deleted_at IS NULL
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_campaign_recipients_campaign_id ON crm_campaign_recipients (campaign_id)
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_campaign_recipients_campaign_status ON crm_campaign_recipients (campaign_id, status, created_at DESC)
  `,
    `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_campaign_recipients_tracking_token
    ON crm_campaign_recipients (tracking_token)
    WHERE tracking_token IS NOT NULL
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_campaign_recipients_email ON crm_campaign_recipients (email)
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_campaign_recipients_lead_id ON crm_campaign_recipients (lead_id)
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_campaign_recipients_status ON crm_campaign_recipients (status)
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_email_events_campaign_id ON crm_email_events (campaign_id)
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_email_events_recipient_id ON crm_email_events (recipient_id)
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_email_events_event_type ON crm_email_events (event_type)
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_email_events_created_at ON crm_email_events (created_at DESC)
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_email_clicks_campaign_id ON crm_email_clicks (campaign_id)
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_email_clicks_recipient_id ON crm_email_clicks (recipient_id)
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_email_links_campaign_id ON crm_email_links (campaign_id)
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_email_links_recipient_id ON crm_email_links (recipient_id)
  `,
    `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_email_links_click_token ON crm_email_links (click_token)
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_email_unsubscribes_email ON crm_email_unsubscribes (email)
  `,
    `
    CREATE INDEX IF NOT EXISTS idx_crm_segments_entity_type ON crm_segments (entity_type, created_at DESC) WHERE deleted_at IS NULL
  `,
    ...planPromoCodes_schema_1.PROMO_CODE_TABLE_STATEMENTS,
];
const ensureTables = async () => {
    const pool = await (0, exports.getAnalyticsPool)();
    const client = await pool.connect();
    try {
        for (const statement of TABLE_STATEMENTS) {
            await client.query(statement);
        }
        await (0, planPromoCodes_service_1.ensureDefaultPromoCodeSeeds)(client);
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
