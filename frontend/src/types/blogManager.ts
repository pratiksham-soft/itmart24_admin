export type BlogTemplate = {
  id: number;
  name: string;
  content: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AIProviderSettings = {
  provider: "openai" | "groq_replicate";
  groqApiKeyConfigured: boolean;
  groqApiKeyPreview: string | null;
  replicateApiTokenConfigured: boolean;
  replicateApiTokenPreview: string | null;
  fallbackToOpenai: boolean;
};

export type AIProviderSettingsPayload = {
  provider: "openai" | "groq_replicate";
  groqApiKey?: string;
  replicateApiToken?: string;
};

export type BlogJobTopic = {
  id?: number;
  topic: string;
  status: string;
  imageUrls: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type BlogJobCategory = {
  id?: number;
  category: string;
  blogCount: number;
  topics: BlogJobTopic[];
};

export type BlogJobSourceLink = {
  id?: number;
  url: string;
};

export type BlogJob = {
  id: number;
  name: string;
  cronExpression: string;
  templateId: number | null;
  templateName: string | null;
  effectiveTemplateId: number | null;
  effectiveTemplateName: string | null;
  imagePromptEnabled: boolean;
  autoPublishEnabled?: boolean;
  status: string;
  settings: Record<string, unknown>;
  categories: BlogJobCategory[];
  sourceLinks: BlogJobSourceLink[];
  createdAt: string;
  updatedAt: string;
};

export type BlogJobPayload = {
  name: string;
  cronExpression: string;
  templateId: number | null;
  imagePromptEnabled: boolean;
  autoPublishEnabled: boolean;
  status: string;
  settings: {
    templateNotes: string;
    contentGuidance: string;
  };
  categories: BlogJobCategory[];
  sourceLinks: string[];
};

export type BlogPost = {
  id: number;
  jobId: number | null;
  templateId: number | null;
  shopifyBlogId: number | null;
  shopifyArticleId: number | null;
  shopifyArticleHandle: string | null;
  shopifyArticleUrl: string | null;
  templateName: string | null;
  title: string;
  category: string;
  topic: string | null;
  slug: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  excerpt: string | null;
  content: string;
  contentHtml: string;
  tags: string[];
  coverImageUrl: string | null;
  status: string;
  errorMessage: string | null;
  publishError: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BlogPostPayload = {
  jobId: number | null;
  templateId: number | null;
  title: string;
  category: string;
  topic?: string | null;
  slug?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  excerpt?: string | null;
  content: string;
  contentHtml?: string;
  tags?: string[];
  coverImageUrl: string;
  status: string;
};

export type ShopifyBlog = {
  id: number;
  title: string;
  handle: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type BlogRunSummary = {
  runId: number;
  jobId: number;
  totalTopicsProcessed: number;
  successCount: number;
  failureCount: number;
  skippedCount?: number;
  rateLimitCount?: number;
  quotaErrorCount?: number;
  startedAt?: string;
  completedAt?: string | null;
};

export type BlogJobRunLog = {
  id: number;
  runId: number;
  jobId: number;
  jobName: string | null;
  level: string;
  step: string | null;
  categoryName: string | null;
  topic: string | null;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};
