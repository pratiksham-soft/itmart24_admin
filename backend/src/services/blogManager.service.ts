import {
  ensureTables,
  getAnalyticsPool,
} from "./analyticsPostgres.service";

type JsonObject = Record<string, unknown>;

type BlogTemplateInput = {
  name: string;
  content: string;
  isDefault?: boolean;
};

type BlogJobTopicInput = {
  id?: number;
  topic: string;
  status?: string;
  imageUrls?: string[];
};

type BlogJobCategoryInput = {
  id?: number;
  category: string;
  blogCount: number;
  topics: BlogJobTopicInput[];
};

type BlogJobInput = {
  name: string;
  cronExpression: string;
  templateId: number | null;
  imagePromptEnabled: boolean;
  autoPublishEnabled: boolean;
  status: string;
  settings?: JsonObject;
  categories: BlogJobCategoryInput[];
  sourceLinks: string[];
};

type BlogPostInput = {
  jobId: number | null;
  templateId: number | null;
  title: string;
  category: string;
  topic?: string | null;
  content: string;
  contentHtml?: string;
  excerpt?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  slug?: string | null;
  tags?: string[];
  coverImageUrl: string | null;
  status: string;
};

const JOB_STATUSES = new Set(["active", "inactive"]);
const BLOG_STATUSES = new Set([
  "draft",
  "generated",
  "published",
  "failed",
  "publish_failed",
]);
const TOPIC_STATUSES = new Set(["pending", "used", "archived"]);
const SIMPLE_CRON_PATTERN =
  /^(\*|[0-5]?\d)\s+(\*|[01]?\d|2[0-3])\s+(\*|0?[1-9]|[12]\d|3[01])\s+(\*|0?[1-9]|1[0-2])\s+(\*|[0-6])$/;

const toTrimmedString = (value: unknown) => String(value ?? "").trim();

const toNumberOrNull = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isValidUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_error) {
    return false;
  }
};

const isValidImageUrl = (value: string) => {
  if (!isValidUrl(value)) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return /\.(png|jpe?g|webp)$/i.test(parsed.pathname);
  } catch (_error) {
    return false;
  }
};

const normalizeJobStatus = (value: unknown) => {
  const status = toTrimmedString(value).toLowerCase();
  return JOB_STATUSES.has(status) ? status : "inactive";
};

const normalizeBlogStatus = (value: unknown) => {
  const status = toTrimmedString(value).toLowerCase();
  return BLOG_STATUSES.has(status) ? status : "draft";
};

const normalizeTopicStatus = (value: unknown) => {
  const status = toTrimmedString(value).toLowerCase();
  return TOPIC_STATUSES.has(status) ? status : "pending";
};

const validateCronExpression = (value: string) => {
  if (!value) {
    throw new Error("Cron schedule is required");
  }

  if (!SIMPLE_CRON_PATTERN.test(value)) {
    throw new Error("Cron schedule must be a valid 5-part cron expression");
  }
};

const sanitizeTemplateInput = (payload: Record<string, unknown>): BlogTemplateInput => {
  const name = toTrimmedString(payload.name);
  const content = toTrimmedString(payload.content);

  if (!name) {
    throw new Error("Template name is required");
  }

  return {
    name,
    content,
    isDefault: Boolean(payload.isDefault),
  };
};

const isTopicInput = (
  value: BlogJobTopicInput | null
): value is BlogJobTopicInput => Boolean(value);

const sanitizeJobInput = (payload: Record<string, unknown>): BlogJobInput => {
  const name = toTrimmedString(payload.name);
  const cronExpression = toTrimmedString(payload.cronExpression);
  const categoriesPayload = Array.isArray(payload.categories)
    ? payload.categories
    : [];
  const sourceLinksPayload = Array.isArray(payload.sourceLinks)
    ? payload.sourceLinks
    : [];

  if (!name) {
    throw new Error("Job name is required");
  }

  validateCronExpression(cronExpression);

  if (categoriesPayload.length === 0) {
    throw new Error("At least one category is required");
  }

  const categories: BlogJobCategoryInput[] = categoriesPayload.map((entry, index) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    const category = toTrimmedString(record.category);
    const blogCount = Number(record.blogCount);
    const topicsPayload = Array.isArray(record.topics) ? record.topics : [];

    if (!category) {
      throw new Error(`Category name is required for row ${index + 1}`);
    }

    if (!Number.isFinite(blogCount) || blogCount <= 0) {
      throw new Error(`Blog count must be greater than 0 for ${category}`);
    }

    const rawTopics: Array<BlogJobTopicInput | null> = topicsPayload
      .map((topicEntry) => {
        const topicRecord = (topicEntry ?? {}) as Record<string, unknown>;
        const topic = toTrimmedString(topicRecord.topic);

        if (!topic) {
          return null;
        }

        return {
          id: toNumberOrNull(topicRecord.id) ?? undefined,
          topic,
          status: normalizeTopicStatus(topicRecord.status),
          imageUrls: Array.isArray(topicRecord.imageUrls)
            ? topicRecord.imageUrls
                .map((entry) => toTrimmedString(entry))
                .filter(Boolean)
            : [],
        };
      });
    const topics = rawTopics.filter(isTopicInput);

    return {
      id: toNumberOrNull(record.id) ?? undefined,
      category,
      blogCount: Math.round(blogCount),
      topics,
    };
  });

  for (const category of categories) {
    for (const topic of category.topics) {
      for (const imageUrl of topic.imageUrls ?? []) {
        if (!isValidImageUrl(imageUrl)) {
          throw new Error(`Invalid topic image URL: ${imageUrl}`);
        }
      }
    }
  }

  const sourceLinks = sourceLinksPayload
    .map((entry) => toTrimmedString(entry))
    .filter(Boolean);

  for (const url of sourceLinks) {
    if (!isValidUrl(url)) {
      throw new Error(`Invalid source URL: ${url}`);
    }
  }

  const templateId = toNumberOrNull(payload.templateId);

  return {
    name,
    cronExpression,
    templateId,
    imagePromptEnabled: Boolean(payload.imagePromptEnabled),
    autoPublishEnabled: Boolean(payload.autoPublishEnabled),
    status: normalizeJobStatus(payload.status),
    settings:
      payload.settings && typeof payload.settings === "object"
        ? (payload.settings as JsonObject)
        : {},
    categories,
    sourceLinks,
  };
};

const sanitizeBlogPostInput = (payload: Record<string, unknown>): BlogPostInput => {
  const title = toTrimmedString(payload.title);
  const category = toTrimmedString(payload.category);

  if (!title) {
    throw new Error("Blog title is required");
  }

  if (!category) {
    throw new Error("Blog category is required");
  }

  return {
    jobId: toNumberOrNull(payload.jobId),
    templateId: toNumberOrNull(payload.templateId),
    title,
    category,
    topic: toTrimmedString(payload.topic) || null,
    content: String(payload.content ?? ""),
    contentHtml: String(payload.contentHtml ?? payload.content ?? ""),
    excerpt: toTrimmedString(payload.excerpt) || null,
    metaTitle: toTrimmedString(payload.metaTitle) || null,
    metaDescription: toTrimmedString(payload.metaDescription) || null,
    slug: toTrimmedString(payload.slug) || null,
    tags: Array.isArray(payload.tags)
      ? payload.tags.map((tag) => String(tag ?? "").trim()).filter(Boolean)
      : [],
    coverImageUrl: toTrimmedString(payload.coverImageUrl) || null,
    status: normalizeBlogStatus(payload.status),
  };
};

const isSchemaRecoveryError = (error: unknown) => {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: string }).code ?? "")
      : "";

  return ["42P01", "42703", "42P10"].includes(code);
};

const withSchemaRecovery = async <T>(operation: () => Promise<T>) => {
  try {
    return await operation();
  } catch (error) {
    if (!isSchemaRecoveryError(error)) {
      throw error;
    }

    await ensureTables();
    return operation();
  }
};

const mapTemplate = (row: Record<string, unknown>) => ({
  id: Number(row.id),
  name: String(row.name ?? ""),
  content: String(row.content ?? ""),
  isDefault: Boolean(row.is_default),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const loadTemplates = async () => {
  return withSchemaRecovery(async () => {
    const pool = await getAnalyticsPool();
    const result = await pool.query(
      `
        SELECT id, name, content, is_default, created_at, updated_at
        FROM blog_templates
        ORDER BY is_default DESC, updated_at DESC, id DESC
      `
    );

    return result.rows.map((row: Record<string, unknown>) => mapTemplate(row));
  });
};

export const listBlogTemplates = loadTemplates;

export const createBlogTemplate = async (payload: Record<string, unknown>) => {
  const input = sanitizeTemplateInput(payload);
  const pool = await getAnalyticsPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (input.isDefault) {
      await client.query("UPDATE blog_templates SET is_default = FALSE");
    }

    const result = await client.query(
      `
        INSERT INTO blog_templates (name, content, is_default, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
        RETURNING id, name, content, is_default, created_at, updated_at
      `,
      [input.name, input.content, Boolean(input.isDefault)]
    );

    await client.query("COMMIT");
    return mapTemplate(result.rows[0] as Record<string, unknown>);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const updateBlogTemplate = async (
  id: number,
  payload: Record<string, unknown>
) => {
  const input = sanitizeTemplateInput(payload);
  const pool = await getAnalyticsPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (input.isDefault) {
      await client.query("UPDATE blog_templates SET is_default = FALSE");
    }

    const result = await client.query(
      `
        UPDATE blog_templates
        SET name = $2,
            content = $3,
            is_default = $4,
            updated_at = NOW()
        WHERE id = $1
        RETURNING id, name, content, is_default, created_at, updated_at
      `,
      [id, input.name, input.content, Boolean(input.isDefault)]
    );

    if (result.rowCount === 0) {
      throw new Error("Template not found");
    }

    await client.query("COMMIT");
    return mapTemplate(result.rows[0] as Record<string, unknown>);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const deleteBlogTemplate = async (id: number) => {
  const pool = await getAnalyticsPool();
  await pool.query("DELETE FROM blog_templates WHERE id = $1", [id]);
};

const mapJob = (
  row: Record<string, unknown>,
  categoriesByJobId: Map<number, Array<Record<string, unknown>>>,
  topicsByCategoryId: Map<number, Array<Record<string, unknown>>>,
  sourceLinksByJobId: Map<number, Array<Record<string, unknown>>>,
  defaultTemplate: ReturnType<typeof mapTemplate> | null
) => {
  const jobId = Number(row.id);
  const categories = (categoriesByJobId.get(jobId) ?? []).map((categoryRow) => {
    const categoryId = Number(categoryRow.id);
    const topics = (topicsByCategoryId.get(categoryId) ?? []).map((topicRow) => ({
      id: Number(topicRow.id),
      topic: String(topicRow.topic ?? ""),
      status: String(topicRow.topic_status ?? "pending"),
      imageUrls: Array.isArray(topicRow.image_urls)
        ? topicRow.image_urls.map((entry: unknown) => String(entry ?? "")).filter(Boolean)
        : [],
      createdAt: topicRow.created_at,
      updatedAt: topicRow.updated_at,
    }));

    return {
      id: categoryId,
      category: String(categoryRow.category_name ?? ""),
      blogCount: Number(categoryRow.blog_count ?? 0),
      topics,
    };
  });

  const sourceLinks = (sourceLinksByJobId.get(jobId) ?? []).map((sourceLinkRow) => ({
    id: Number(sourceLinkRow.id),
    url: String(sourceLinkRow.url ?? ""),
  }));

  return {
    id: jobId,
    name: String(row.name ?? ""),
    cronExpression: String(row.cron_expression ?? ""),
    templateId: row.template_id == null ? null : Number(row.template_id),
    templateName: row.template_name ? String(row.template_name) : null,
    effectiveTemplateId:
      row.template_id == null && defaultTemplate ? defaultTemplate.id : row.template_id == null ? null : Number(row.template_id),
    effectiveTemplateName:
      row.template_name ? String(row.template_name) : defaultTemplate?.name ?? null,
    imagePromptEnabled: Boolean(row.image_prompt_enabled),
    autoPublishEnabled: Boolean(row.auto_publish_enabled ?? row.shopify_publish_enabled),
    status: String(row.status ?? "inactive"),
    settings:
      row.settings && typeof row.settings === "object"
        ? (row.settings as JsonObject)
        : {},
    categories,
    sourceLinks,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export const listBlogJobs = async () => {
  return withSchemaRecovery(async () => {
    const pool = await getAnalyticsPool();
    const [jobsResult, categoriesResult, topicsResult, sourceLinksResult, templates] =
      await Promise.all([
        pool.query(
          `
            SELECT jobs.id,
                   jobs.name,
                   jobs.cron_expression,
                   jobs.template_id,
                   templates.name AS template_name,
                   jobs.image_prompt_enabled,
                   jobs.auto_publish_enabled,
                   jobs.shopify_publish_enabled,
                   jobs.status,
                   jobs.settings,
                   jobs.created_at,
                   jobs.updated_at
            FROM blog_jobs jobs
            LEFT JOIN blog_templates templates ON templates.id = jobs.template_id
            ORDER BY jobs.updated_at DESC, jobs.id DESC
          `
        ),
        pool.query(
          `
            SELECT id, job_id, category_name, blog_count, sort_order
            FROM blog_job_categories
            ORDER BY job_id ASC, sort_order ASC, id ASC
          `
        ),
        pool.query(
          `
            SELECT id, job_category_id, topic, topic_status, image_urls, sort_order, created_at, updated_at
            FROM blog_job_topics
            ORDER BY job_category_id ASC, sort_order ASC, id ASC
          `
        ),
        pool.query(
          `
            SELECT id, job_id, url, sort_order
            FROM blog_job_source_links
            ORDER BY job_id ASC, sort_order ASC, id ASC
          `
        ),
        loadTemplates(),
      ]);

    const categoriesByJobId = new Map<number, Array<Record<string, unknown>>>();
    for (const row of categoriesResult.rows as Array<Record<string, unknown>>) {
      const jobId = Number(row.job_id);
      const existing = categoriesByJobId.get(jobId) ?? [];
      existing.push(row);
      categoriesByJobId.set(jobId, existing);
    }

    const topicsByCategoryId = new Map<number, Array<Record<string, unknown>>>();
    for (const row of topicsResult.rows as Array<Record<string, unknown>>) {
      const categoryId = Number(row.job_category_id);
      const existing = topicsByCategoryId.get(categoryId) ?? [];
      existing.push(row);
      topicsByCategoryId.set(categoryId, existing);
    }

    const sourceLinksByJobId = new Map<number, Array<Record<string, unknown>>>();
    for (const row of sourceLinksResult.rows as Array<Record<string, unknown>>) {
      const jobId = Number(row.job_id);
      const existing = sourceLinksByJobId.get(jobId) ?? [];
      existing.push(row);
      sourceLinksByJobId.set(jobId, existing);
    }

    const defaultTemplate =
      templates.find((template: ReturnType<typeof mapTemplate>) => template.isDefault) ??
      null;

    return (jobsResult.rows as Array<Record<string, unknown>>).map((row) =>
      mapJob(row, categoriesByJobId, topicsByCategoryId, sourceLinksByJobId, defaultTemplate)
    );
  });
};

const replaceJobRelations = async (
  client: {
    query: (queryText: string, values?: unknown[]) => Promise<{
      rows: Array<Record<string, unknown>>;
    }>;
  },
  jobId: number,
  categories: BlogJobCategoryInput[],
  sourceLinks: string[]
) => {
  await client.query("DELETE FROM blog_job_source_links WHERE job_id = $1", [jobId]);
  await client.query("DELETE FROM blog_job_categories WHERE job_id = $1", [jobId]);

  for (let index = 0; index < categories.length; index += 1) {
    const category = categories[index];
    const insertedCategory = await client.query(
      `
        INSERT INTO blog_job_categories (job_id, category_name, blog_count, sort_order)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
      [jobId, category.category, category.blogCount, index]
    );

    const jobCategoryId = Number(insertedCategory.rows[0].id);

    for (let topicIndex = 0; topicIndex < category.topics.length; topicIndex += 1) {
      const topic = category.topics[topicIndex];
      await client.query(
        `
          INSERT INTO blog_job_topics (
            job_category_id,
            topic,
            topic_status,
            image_urls,
            sort_order,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4::text[], $5, NOW(), NOW())
        `,
        [
          jobCategoryId,
          topic.topic,
          topic.status ?? "pending",
          topic.imageUrls ?? [],
          topicIndex,
        ]
      );
    }
  }

  for (let index = 0; index < sourceLinks.length; index += 1) {
    await client.query(
      `
        INSERT INTO blog_job_source_links (job_id, url, sort_order, created_at)
        VALUES ($1, $2, $3, NOW())
      `,
      [jobId, sourceLinks[index], index]
    );
  }
};

export const createBlogJob = async (payload: Record<string, unknown>) => {
  const input = sanitizeJobInput(payload);
  const pool = await getAnalyticsPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
        INSERT INTO blog_jobs (
          name,
          cron_expression,
          template_id,
          image_prompt_enabled,
          auto_publish_enabled,
          status,
          settings,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW(), NOW())
        RETURNING id
      `,
      [
        input.name,
        input.cronExpression,
        input.templateId,
        input.imagePromptEnabled,
        input.autoPublishEnabled,
        input.status,
        JSON.stringify(input.settings ?? {}),
      ]
    );

    const jobId = Number(result.rows[0].id);
    await replaceJobRelations(client, jobId, input.categories, input.sourceLinks);
    await client.query("COMMIT");

    const jobs = await listBlogJobs();
    return jobs.find((job) => job.id === jobId) ?? null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const updateBlogJob = async (
  id: number,
  payload: Record<string, unknown>
) => {
  const input = sanitizeJobInput(payload);
  const pool = await getAnalyticsPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
        UPDATE blog_jobs
        SET name = $2,
            cron_expression = $3,
            template_id = $4,
            image_prompt_enabled = $5,
            auto_publish_enabled = $6,
            status = $7,
            settings = $8::jsonb,
            updated_at = NOW()
        WHERE id = $1
        RETURNING id
      `,
      [
        id,
        input.name,
        input.cronExpression,
        input.templateId,
        input.imagePromptEnabled,
        input.autoPublishEnabled,
        input.status,
        JSON.stringify(input.settings ?? {}),
      ]
    );

    if (result.rowCount === 0) {
      throw new Error("Job not found");
    }

    await replaceJobRelations(client, id, input.categories, input.sourceLinks);
    await client.query("COMMIT");

    const jobs = await listBlogJobs();
    return jobs.find((job) => job.id === id) ?? null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const deleteBlogJob = async (id: number) => {
  const pool = await getAnalyticsPool();
  await pool.query("DELETE FROM blog_jobs WHERE id = $1", [id]);
};

export const toggleBlogJobStatus = async (id: number, isActive: boolean) => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      UPDATE blog_jobs
      SET status = $2,
          updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
    [id, isActive ? "active" : "inactive"]
  );

  if (result.rowCount === 0) {
    throw new Error("Job not found");
  }

  const jobs = await listBlogJobs();
  return jobs.find((job) => job.id === id) ?? null;
};

const mapBlogPost = (row: Record<string, unknown>) => ({
  id: Number(row.id),
  jobId: row.job_id == null ? null : Number(row.job_id),
  templateId: row.template_id == null ? null : Number(row.template_id),
  shopifyBlogId: row.shopify_blog_id == null ? null : Number(row.shopify_blog_id),
  shopifyArticleId:
    row.shopify_article_id == null ? null : Number(row.shopify_article_id),
  shopifyArticleHandle: row.shopify_article_handle
    ? String(row.shopify_article_handle)
    : null,
  shopifyArticleUrl: row.shopify_article_url ? String(row.shopify_article_url) : null,
  templateName: row.template_name ? String(row.template_name) : null,
  title: String(row.title ?? ""),
  category: String(row.category ?? ""),
  topic: row.topic ? String(row.topic) : null,
  slug: row.slug ? String(row.slug) : null,
  metaTitle: row.meta_title ? String(row.meta_title) : null,
  metaDescription: row.meta_description ? String(row.meta_description) : null,
  excerpt: row.excerpt ? String(row.excerpt) : null,
  content: String(row.content ?? ""),
  contentHtml: String(row.content_html ?? row.content ?? ""),
  tags: Array.isArray(row.tags)
    ? row.tags.map((tag: unknown) => String(tag ?? "")).filter(Boolean)
    : [],
  coverImageUrl: row.cover_image_url ? String(row.cover_image_url) : null,
  status: String(row.status ?? "draft"),
  errorMessage: row.error_message ? String(row.error_message) : null,
  publishError: row.publish_error ? String(row.publish_error) : null,
  publishedAt: row.published_at ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const listBlogPosts = async (filters: {
  category?: string;
  startDate?: string;
  endDate?: string;
}) => {
  return withSchemaRecovery(async () => {
    const pool = await getAnalyticsPool();
    const whereClauses: string[] = [];
    const values: unknown[] = [];

    if (filters.category) {
      values.push(filters.category.trim());
      whereClauses.push(`posts.category = $${values.length}`);
    }

    if (filters.startDate) {
      values.push(filters.startDate);
      whereClauses.push(`posts.created_at::date >= $${values.length}`);
    }

    if (filters.endDate) {
      values.push(filters.endDate);
      whereClauses.push(`posts.created_at::date <= $${values.length}`);
    }

    const whereSql =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const result = await pool.query(
      `
        SELECT posts.id,
               posts.job_id,
               posts.template_id,
               posts.shopify_blog_id,
               posts.shopify_article_id,
               posts.shopify_article_handle,
               posts.shopify_article_url,
               templates.name AS template_name,
               posts.title,
               posts.category,
               posts.topic,
               posts.slug,
               posts.meta_title,
               posts.meta_description,
               posts.excerpt,
               posts.content,
               posts.content_html,
               posts.tags,
               posts.cover_image_url,
               posts.status,
               posts.error_message,
               posts.publish_error,
               posts.published_at,
               posts.created_at,
               posts.updated_at
        FROM blog_posts posts
        LEFT JOIN blog_templates templates ON templates.id = posts.template_id
        ${whereSql}
        ORDER BY posts.created_at DESC, posts.id DESC
      `,
      values
    );

    return result.rows.map((row: Record<string, unknown>) => mapBlogPost(row));
  });
};

export const getBlogPostById = async (id: number) => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      SELECT posts.id,
             posts.job_id,
             posts.template_id,
             posts.shopify_blog_id,
             posts.shopify_article_id,
             posts.shopify_article_handle,
             posts.shopify_article_url,
             templates.name AS template_name,
             posts.title,
             posts.category,
             posts.topic,
             posts.slug,
             posts.meta_title,
             posts.meta_description,
             posts.excerpt,
             posts.content,
             posts.content_html,
             posts.tags,
             posts.cover_image_url,
             posts.status,
             posts.error_message,
             posts.publish_error,
             posts.published_at,
             posts.created_at,
             posts.updated_at
      FROM blog_posts posts
      LEFT JOIN blog_templates templates ON templates.id = posts.template_id
      WHERE posts.id = $1
    `,
    [id]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapBlogPost(result.rows[0] as Record<string, unknown>);
};

export const createBlogPost = async (payload: Record<string, unknown>) => {
  const input = sanitizeBlogPostInput(payload);
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      INSERT INTO blog_posts (
        job_id,
        template_id,
        title,
        category,
        topic,
        slug,
        meta_title,
        meta_description,
        excerpt,
        content,
        content_html,
        tags,
        cover_image_url,
        status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::text[], $13, $14, NOW(), NOW())
      RETURNING id
    `,
    [
      input.jobId,
      input.templateId,
      input.title,
      input.category,
      input.topic,
      input.slug,
      input.metaTitle,
      input.metaDescription,
      input.excerpt,
      input.content,
      input.contentHtml || input.content,
      input.tags ?? [],
      input.coverImageUrl,
      input.status,
    ]
  );

  return getBlogPostById(Number(result.rows[0].id));
};

export const updateBlogPost = async (
  id: number,
  payload: Record<string, unknown>
) => {
  const input = sanitizeBlogPostInput(payload);
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      UPDATE blog_posts
      SET job_id = $2,
          template_id = $3,
          title = $4,
          category = $5,
          topic = $6,
          slug = $7,
          meta_title = $8,
          meta_description = $9,
          excerpt = $10,
          content = $11,
          content_html = $12,
          tags = $13::text[],
          cover_image_url = $14,
          status = $15,
          updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
    [
      id,
      input.jobId,
      input.templateId,
      input.title,
      input.category,
      input.topic,
      input.slug,
      input.metaTitle,
      input.metaDescription,
      input.excerpt,
      input.content,
      input.contentHtml || input.content,
      input.tags ?? [],
      input.coverImageUrl,
      input.status,
    ]
  );

  if (result.rowCount === 0) {
    throw new Error("Blog post not found");
  }

  return getBlogPostById(id);
};

export const deleteBlogPost = async (id: number) => {
  const pool = await getAnalyticsPool();
  await pool.query("DELETE FROM blog_posts WHERE id = $1", [id]);
};

export const listBlogJobRunLogs = async (filters?: {
  jobId?: number;
  limit?: number;
}) => {
  return withSchemaRecovery(async () => {
    const pool = await getAnalyticsPool();
    const whereClauses: string[] = [];
    const values: unknown[] = [];

    if (filters?.jobId != null && Number.isFinite(filters.jobId)) {
      values.push(filters.jobId);
      whereClauses.push(`runs.job_id = $${values.length}`);
    }

    const limit =
      filters?.limit && Number.isFinite(filters.limit)
        ? Math.max(1, Math.min(500, Math.round(filters.limit)))
        : 200;

    values.push(limit);
    const whereSql =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const result = await pool.query(
      `
        SELECT logs.id,
               logs.run_id,
               runs.job_id,
               jobs.name AS job_name,
               logs.log_level,
               logs.step,
               logs.category_name,
               logs.topic,
               logs.message,
               logs.metadata,
               logs.created_at
        FROM blog_job_run_logs logs
        INNER JOIN blog_job_runs runs ON runs.id = logs.run_id
        LEFT JOIN blog_jobs jobs ON jobs.id = runs.job_id
        ${whereSql}
        ORDER BY logs.created_at DESC, logs.id DESC
        LIMIT $${values.length}
      `,
      values
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      id: Number(row.id),
      runId: Number(row.run_id),
      jobId: Number(row.job_id),
      jobName: row.job_name ? String(row.job_name) : null,
      level: String(row.log_level ?? "info"),
      step: row.step ? String(row.step) : null,
      categoryName: row.category_name ? String(row.category_name) : null,
      topic: row.topic ? String(row.topic) : null,
      message: String(row.message ?? ""),
      metadata:
        row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>)
          : {},
      createdAt: row.created_at,
    }));
  });
};

export const getBlogManagerTodoNotes = () => ({
  researchFlow: "TODO: implement research flow for job execution",
  contentGeneration: "TODO: implement blog content generation",
  imageGeneration: "TODO: implement cover image generation",
  posting: "TODO: implement publishing workflow",
  logging: "TODO: implement job run logging workflow",
});
