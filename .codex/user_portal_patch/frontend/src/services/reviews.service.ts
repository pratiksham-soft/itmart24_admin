import { api } from "../api/client";

export type ReviewCategoryKey = "software_saas" | "cloud_services" | "ai_tools" | "common";

export type ReviewDimension = {
  key: string;
  label: string;
};

export type ReviewCatalog = {
  categories: Array<{
    key: ReviewCategoryKey;
    label: string;
    dimensions: ReviewDimension[];
  }>;
};

export type ReviewTaxonomyRow = {
  topCategory: string;
  topSlug: string;
  subcategory: string;
  subcategorySlug: string;
  finalCategory: string;
  finalCategorySlug: string;
  collectionTitle: string;
  collectionHandle: string;
  collectionUrl: string;
  browsePageHandle: string;
  browsePageUrl: string;
  isFlatCategory: boolean;
};

export type ReviewCollectionProduct = {
  productName: string;
  vendorName: string;
  shopifyProductId: string;
  productHandle: string;
  productUrl: string;
  productLogoUrl: string;
};

export type ReviewRecord = {
  id: string;
  userId: string;
  productId: string | null;
  shopifyProductId: string | null;
  productHandle: string | null;
  productName: string;
  vendorName: string;
  productUrl: string | null;
  productLogoUrl: string | null;
  officialUrl: string | null;
  categoryKey: ReviewCategoryKey;
  reviewTitle: string;
  reviewBody: string;
  overallRating: number;
  ratingBreakdown: ReviewDimensionValue[];
  ratings: Record<string, number>;
  pros: string;
  cons: string;
  useCase: string;
  usageDuration: string;
  companySize: string;
  recommend: boolean;
  visibility: "public" | "anonymous_display_name";
  status: string;
  rejectionReason: string | null;
  isVerifiedReviewer: boolean;
  isProductUser: boolean;
  helpfulCount: number;
  notHelpfulCount: number;
  reportCount: number;
  currentUserVote: "helpful" | "not_helpful" | null;
  authorDisplayName: string;
  threadStatus: string;
  threadMessageCount: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  messages?: ReviewThreadMessage[];
};

export type ReviewDimensionValue = ReviewDimension & {
  value: number;
};

export type ReviewThreadMessage = {
  id: string;
  sender_type: string;
  message: string;
  created_at: string;
};

export type ReviewPayload = {
  productId?: string;
  shopifyProductId?: string;
  productHandle?: string;
  productUrl?: string;
  productLogoUrl?: string;
  officialUrl?: string;
  productName: string;
  vendorName: string;
  categoryKey: ReviewCategoryKey;
  ratings: Record<string, number>;
  pros?: string;
  cons?: string;
  useCase?: string;
  usageDuration?: string;
  companySize?: string;
  recommend: boolean;
  reviewTitle: string;
  reviewBody: string;
  visibility: "public" | "anonymous_display_name";
  submittedFrom?: string;
  metadata?: Record<string, unknown>;
};

type ApiEnvelope<T> = {
  success: true;
  data: T;
};

export const fetchReviewCatalog = async () => (await api.get<ApiEnvelope<ReviewCatalog>>("/public-reviews/catalog")).data.data;
export const fetchReviewTaxonomy = async () => (await api.get<ApiEnvelope<ReviewTaxonomyRow[]>>("/public-reviews/taxonomy")).data.data;
export const fetchReviewCollectionProducts = async (collectionHandle: string) =>
  (await api.get<ApiEnvelope<ReviewCollectionProduct[]>>("/public-reviews/collection-products", { params: { collectionHandle } })).data.data;
export const fetchPublicProductReviews = async (params: Record<string, string>) => (await api.get<ApiEnvelope<any>>("/public-reviews/product", { params })).data.data;
export const fetchMyReviews = async () => (await api.get<ApiEnvelope<ReviewRecord[]>>("/reviews/my")).data.data;
export const fetchReview = async (id: string) => (await api.get<ApiEnvelope<ReviewRecord>>(`/reviews/${id}`)).data.data;
export const createReview = async (payload: ReviewPayload) => (await api.post<ApiEnvelope<ReviewRecord>>("/reviews", payload)).data.data;
export const updateReview = async (id: string, payload: ReviewPayload) => (await api.put<ApiEnvelope<ReviewRecord>>(`/reviews/${id}`, payload)).data.data;
export const deleteReview = async (id: string) => (await api.delete<ApiEnvelope<{ deleted: boolean }>>(`/reviews/${id}`)).data.data;
export const markReviewUseful = async (id: string) => (await api.post<ApiEnvelope<any>>(`/reviews/${id}/useful`)).data.data;
export const voteOnReview = async (id: string, voteType: "helpful" | "not_helpful") => (await api.post<ApiEnvelope<any>>(`/reviews/${id}/vote`, { voteType })).data.data;
export const reportReview = async (id: string, payload: { reason: string; details?: string }) => (await api.post<ApiEnvelope<any>>(`/reviews/${id}/report`, payload)).data.data;
export const fetchReviewThread = async (id: string) => (await api.get<ApiEnvelope<any>>(`/reviews/${id}/thread`)).data.data;
export const addReviewThreadMessage = async (id: string, message: string) => (await api.post<ApiEnvelope<any>>(`/reviews/${id}/thread/messages`, { message })).data.data;
