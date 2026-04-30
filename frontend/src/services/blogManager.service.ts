import axios from "axios";
import type {
  AIProviderSettings,
  AIProviderSettingsPayload,
  BlogJob,
  BlogJobRunLog,
  BlogJobPayload,
  BlogPost,
  BlogPostPayload,
  BlogRunSummary,
  BlogTemplate,
  ShopifyBlog,
} from "../types/blogManager";

export const fetchBlogJobs = async () => {
  const response = await axios.get<BlogJob[]>("/api/blog-manager/jobs");
  return response.data;
};

export const fetchAIProviderSettings = async () => {
  const response = await axios.get<AIProviderSettings>(
    "/api/blog-manager/settings/ai-provider"
  );
  return response.data;
};

export const updateAIProviderSettings = async (
  payload: AIProviderSettingsPayload
) => {
  const response = await axios.put<AIProviderSettings>(
    "/api/blog-manager/settings/ai-provider",
    payload
  );
  return response.data;
};

export const createBlogJob = async (payload: BlogJobPayload) => {
  const response = await axios.post<BlogJob>("/api/blog-manager/jobs", payload);
  return response.data;
};

export const updateBlogJob = async (id: number, payload: BlogJobPayload) => {
  const response = await axios.put<BlogJob>(`/api/blog-manager/jobs/${id}`, payload);
  return response.data;
};

export const toggleBlogJobStatus = async (id: number, isActive: boolean) => {
  const response = await axios.patch<BlogJob>(
    `/api/blog-manager/jobs/${id}/status`,
    { isActive }
  );
  return response.data;
};

export const deleteBlogJob = async (id: number) => {
  await axios.delete(`/api/blog-manager/jobs/${id}`);
};

export const runBlogJobOnce = async (id: number) => {
  const response = await axios.post<{
    success: boolean;
    message: string;
    summary: BlogRunSummary;
  }>(
    `/api/blog-manager/jobs/${id}/run-once`
  );
  return response.data.summary;
};

export const fetchShopifyBlogs = async () => {
  const response = await axios.get<ShopifyBlog[]>("/api/blog-manager/shopify-blogs");
  return response.data;
};

export const fetchBlogTemplates = async () => {
  const response = await axios.get<BlogTemplate[]>("/api/blog-manager/templates");
  return response.data;
};

export const createBlogTemplate = async (payload: {
  name: string;
  content: string;
  isDefault: boolean;
}) => {
  const response = await axios.post<BlogTemplate>(
    "/api/blog-manager/templates",
    payload
  );
  return response.data;
};

export const updateBlogTemplate = async (
  id: number,
  payload: {
    name: string;
    content: string;
    isDefault: boolean;
  }
) => {
  const response = await axios.put<BlogTemplate>(
    `/api/blog-manager/templates/${id}`,
    payload
  );
  return response.data;
};

export const fetchBlogPosts = async (filters?: {
  category?: string;
  startDate?: string;
  endDate?: string;
}) => {
  const response = await axios.get<BlogPost[]>("/api/blog-manager/blogs", {
    params: filters,
  });
  return response.data;
};

export const fetchBlogPost = async (id: number) => {
  const response = await axios.get<BlogPost>(`/api/blog-manager/blogs/${id}`);
  return response.data;
};

export const createBlogPost = async (payload: BlogPostPayload) => {
  const response = await axios.post<BlogPost>("/api/blog-manager/blogs", payload);
  return response.data;
};

export const updateBlogPost = async (id: number, payload: BlogPostPayload) => {
  const response = await axios.put<BlogPost>(`/api/blog-manager/blogs/${id}`, payload);
  return response.data;
};

export const deleteBlogPost = async (id: number) => {
  await axios.delete(`/api/blog-manager/blogs/${id}`);
};

export const publishBlogPostToShopify = async (id: number, publish = false) => {
  const response = await axios.post<{
    success: boolean;
    message: string;
    post: BlogPost;
  }>(`/api/blog-manager/posts/${id}/publish`, {
    publish,
  });
  return response.data;
};

export const fetchBlogJobRunLogs = async (filters?: {
  jobId?: number;
  limit?: number;
}) => {
  const response = await axios.get<{
    success: boolean;
    logs: BlogJobRunLog[];
  }>("/api/blog-manager/logs", {
    params: filters,
  });
  return response.data.logs ?? [];
};
