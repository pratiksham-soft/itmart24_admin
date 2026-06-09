import fs from "fs";
import path from "path";
import { query } from "../../db/pool";
import { createId } from "../../utils/crypto";
import { AppError } from "../../utils/errors";
import { createNotification } from "../notifications/notifications.service";
import { awardPoints } from "../rewards/rewards.service";
import { reviewDimensionsByCategory } from "./reviews.schemas";

type ReviewCategoryKey = keyof typeof reviewDimensionsByCategory;
type ReviewPayload = Record<string, unknown>;
type TaxonomyRow = {
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

type ShopifyCollectionProductsResponse = {
  data?: {
    collectionByHandle?: {
      products?: {
        nodes?: Array<{
          title?: string | null;
          vendor?: string | null;
          handle?: string | null;
          legacyResourceId?: string | number | null;
          onlineStoreUrl?: string | null;
          featuredImage?: {
            url?: string | null;
          } | null;
        }>;
      };
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

const dimensionLabels: Record<string, string> = {
  overall_rating: "Overall Rating",
  ease_of_use: "Ease of Use",
  features: "Features",
  integrations: "Integrations",
  customization: "Customization",
  performance: "Performance",
  support: "Support",
  value_for_money: "Value for Money",
  uptime: "Uptime",
  speed: "Speed",
  ease_of_setup: "Ease of Setup",
  security: "Security",
  scalability: "Scalability",
  output_quality: "Output Quality",
  accuracy: "Accuracy",
  pricing_fairness: "Pricing Fairness",
};

function normalizeCategory(input: unknown): ReviewCategoryKey {
  const value = String(input ?? "common").trim().toLowerCase();

  if (value === "software / saas" || value === "software" || value === "saas") return "software_saas";
  if (value === "cloud" || value === "cloud services") return "cloud_services";
  if (value === "ai" || value === "ai tools") return "ai_tools";
  if (value in reviewDimensionsByCategory) return value as ReviewCategoryKey;

  return "common";
}

function sanitizeOptionalText(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function buildRatings(payload: ReviewPayload) {
  const categoryKey = normalizeCategory(payload.categoryKey);
  const dimensions = reviewDimensionsByCategory[categoryKey];
  const ratingsInput = (payload.ratings && typeof payload.ratings === "object" ? payload.ratings : {}) as Record<string, unknown>;
  const legacyRatings: Record<string, unknown> = {
    overall_rating: payload.overallRating,
    ease_of_use: payload.easeOfUseRating,
    features: payload.featuresRating,
    support: payload.supportRating,
    value_for_money: payload.pricingValueRating,
    performance: payload.reliabilityRating,
  };

  const ratings: Record<string, number> = {};
  for (const dimension of dimensions) {
    const candidate = ratingsInput[dimension] ?? legacyRatings[dimension];
    const numeric = Number(candidate);
    if (!Number.isFinite(numeric) || numeric < 1 || numeric > 5) {
      throw new AppError(`Invalid rating provided for ${dimension.replace(/_/g, " ")}.`, 400);
    }
    ratings[dimension] = numeric;
  }

  return {
    categoryKey,
    ratings,
    overallRating: ratings.overall_rating,
  };
}

function buildProductWhere(identity: Record<string, unknown>) {
  const strongClauses: string[] = [];
  const params: string[] = [];

  if (sanitizeOptionalText(identity.productHandle)) {
    strongClauses.push(`product_handle = $${params.length + 1}`);
    params.push(String(identity.productHandle).trim());
  }
  if (sanitizeOptionalText(identity.shopifyProductId)) {
    strongClauses.push(`shopify_product_id = $${params.length + 1}`);
    params.push(String(identity.shopifyProductId).trim());
  }
  if (sanitizeOptionalText(identity.productId)) {
    strongClauses.push(`product_id = $${params.length + 1}`);
    params.push(String(identity.productId).trim());
  }

  if (strongClauses.length > 0) {
    return {
      whereSql: strongClauses.join(" OR "),
      params,
    };
  }

  const fallbackClauses: string[] = [];
  if (sanitizeOptionalText(identity.productName)) {
    fallbackClauses.push(`LOWER(product_name) = LOWER($${params.length + 1})`);
    params.push(String(identity.productName).trim());
  }
  if (sanitizeOptionalText(identity.vendorName)) {
    fallbackClauses.push(`LOWER(vendor_name) = LOWER($${params.length + 1})`);
    params.push(String(identity.vendorName).trim());
  }

  if (fallbackClauses.length === 0) {
    throw new AppError("A product identifier is required.", 400);
  }

  return {
    whereSql: fallbackClauses.join(" AND "),
    params,
  };
}

function mapRatingBreakdown(categoryKey: ReviewCategoryKey, ratings: Record<string, number>) {
  return reviewDimensionsByCategory[categoryKey].map((dimension) => ({
    key: dimension,
    label: dimensionLabels[dimension] ?? dimension.replace(/_/g, " "),
    value: Number(ratings[dimension] ?? 0),
  }));
}

function buildAuthorDisplayName(row: Record<string, unknown>) {
  if (String(row.visibility ?? "public") === "anonymous_display_name") {
    return "Verified ITMart24 Member";
  }

  const explicitDisplayName = String(row.public_review_display_name ?? "").trim();
  if (explicitDisplayName) return explicitDisplayName;

  const fullName = String(row.full_name ?? "").trim();
  if (fullName) return fullName;

  return "ITMart24 Member";
}

function transformReviewRow(row: Record<string, unknown>) {
  const categoryKey = normalizeCategory(row.category_key);
  const ratings = ((row.rating_breakdown as Record<string, unknown>) ?? {}) as Record<string, number>;

  return {
    id: String(row.id),
    userId: String(row.user_id),
    productId: row.product_id ?? null,
    shopifyProductId: row.shopify_product_id ?? null,
    productHandle: row.product_handle ?? null,
    productName: row.product_name ?? "",
    vendorName: row.vendor_name ?? "",
    productUrl: row.product_url ?? null,
    productLogoUrl: row.product_logo_url ?? null,
    officialUrl: row.official_url ?? null,
    categoryKey,
    reviewTitle: row.review_title ?? "",
    reviewBody: row.review_body ?? "",
    overallRating: Number(row.overall_rating ?? 0),
    ratingBreakdown: mapRatingBreakdown(categoryKey, ratings),
    ratings,
    pros: row.pros ?? "",
    cons: row.cons ?? "",
    useCase: row.use_case ?? "",
    usageDuration: row.usage_duration ?? "",
    companySize: row.company_size ?? "",
    recommend: Boolean(row.recommend ?? true),
    screenshots: Array.isArray(row.screenshots) ? row.screenshots : [],
    visibility: row.visibility ?? "public",
    status: row.status ?? "approved",
    rejectionReason: row.rejection_reason ?? null,
    isVerifiedReviewer: Boolean(row.is_verified_reviewer),
    isProductUser: Boolean(row.is_product_user),
    helpfulCount: Number(row.useful_count ?? 0),
    notHelpfulCount: Number(row.not_helpful_count ?? 0),
    reportCount: Number(row.report_count ?? 0),
    currentUserVote: row.current_user_vote ? String(row.current_user_vote) : null,
    authorDisplayName: buildAuthorDisplayName(row),
    threadStatus: row.thread_status ?? "open",
    threadMessageCount: Number(row.thread_message_count ?? 0),
    metadata: (row.metadata as Record<string, unknown> | null) ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at ?? row.created_at,
    messages: row.messages ?? [],
  };
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === "\"") {
      const nextCharacter = line[index + 1];
      if (inQuotes && nextCharacter === "\"") {
        current += "\"";
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current);
  return values;
}

function getCategoryCollectionsCsvPath() {
  const candidates = [
    path.resolve(__dirname, "../../../../../shopify_theme/docs/category-collections.csv"),
    path.resolve(__dirname, "../../../../shopify_theme/docs/category-collections.csv"),
    path.resolve(process.cwd(), "../shopify_theme/docs/category-collections.csv"),
    path.resolve(process.cwd(), "../../shopify_theme/docs/category-collections.csv"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

export async function getCategoryCollectionTaxonomy(): Promise<TaxonomyRow[]> {
  const csvPath = getCategoryCollectionsCsvPath();
  if (!fs.existsSync(csvPath)) {
    return [];
  }

  const raw = await fs.promises.readFile(csvPath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));

    return {
      topCategory: String(record.top_category ?? ""),
      topSlug: String(record.top_slug ?? ""),
      subcategory: String(record.subcategory ?? ""),
      subcategorySlug: String(record.subcategory_slug ?? ""),
      finalCategory: String(record.final_category ?? ""),
      finalCategorySlug: String(record.final_category_slug ?? ""),
      collectionTitle: String(record.collection_title ?? ""),
      collectionHandle: String(record.collection_handle ?? ""),
      collectionUrl: String(record.collection_url ?? ""),
      browsePageHandle: String(record.browse_page_handle ?? ""),
      browsePageUrl: String(record.browse_page_url ?? ""),
      isFlatCategory: String(record.is_flat_category ?? "").toLowerCase() === "true",
    };
  });
}

export async function getCollectionProductsForHandle(collectionHandle: string) {
  const normalizedHandle = collectionHandle.trim();
  if (!normalizedHandle) {
    throw new AppError("Collection handle is required.", 400);
  }

  const storeDomain = String(process.env.SHOPIFY_STORE_DOMAIN ?? "").trim();
  const adminApiToken = String(process.env.SHOPIFY_ADMIN_API_TOKEN ?? "").trim();
  const apiVersion = String(process.env.SHOPIFY_API_VERSION ?? "2024-01").trim();

  if (!storeDomain || !adminApiToken) {
    return [];
  }

  const response = await fetch(`https://${storeDomain}/admin/api/${apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": adminApiToken,
    },
    body: JSON.stringify({
      query: `
        query ReviewCollectionProducts($handle: String!) {
          collectionByHandle(handle: $handle) {
            products(first: 250, sortKey: TITLE) {
              nodes {
                title
                vendor
                handle
                legacyResourceId
                onlineStoreUrl
                featuredImage {
                  url
                }
              }
            }
          }
        }
      `,
      variables: {
        handle: normalizedHandle,
      },
    }),
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as ShopifyCollectionProductsResponse;
  const nodes = payload.data?.collectionByHandle?.products?.nodes ?? [];

  return nodes
    .map((node) => {
      const productName = String(node.title ?? "").trim();
      const productHandle = String(node.handle ?? "").trim();

      if (!productName || !productHandle) {
        return null;
      }

      return {
        productName,
        vendorName: String(node.vendor ?? "").trim(),
        shopifyProductId: String(node.legacyResourceId ?? "").trim(),
        productHandle,
        productUrl: String(node.onlineStoreUrl ?? `https://${storeDomain}/products/${productHandle}`).trim(),
        productLogoUrl: String(node.featuredImage?.url ?? "").trim(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

async function getUserFlags(userId: string, productName: string, vendorName: string) {
  const [verificationResult, productUseResult] = await Promise.all([
    query<{ status: string }>(`SELECT status FROM reviewer_verifications WHERE user_id = $1 LIMIT 1`, [userId]),
    query<{ id: string }>(
      `SELECT id
       FROM products_in_use
       WHERE user_id = $1
         AND LOWER(product_name) = LOWER($2)
         AND LOWER(vendor_name) = LOWER($3)
       LIMIT 1`,
      [userId, productName, vendorName]
    ),
  ]);

  return {
    isVerifiedReviewer: String(verificationResult.rows[0]?.status ?? "") === "verified",
    isProductUser: (productUseResult.rowCount ?? 0) > 0,
  };
}

async function hydrateThread(reviewId: string) {
  const threadResult = await query(
    `SELECT id, review_id, status, resolved_at, created_at, updated_at
     FROM review_threads
     WHERE review_id = $1
     LIMIT 1`,
    [reviewId]
  );

  if ((threadResult.rowCount ?? 0) === 0) {
    return { thread: null, messages: [] };
  }

  const thread = threadResult.rows[0];
  const messagesResult = await query(
    `SELECT id, thread_id, sender_type, sender_id, message, is_official_vendor_response, created_at
     FROM review_thread_messages
     WHERE thread_id = $1
     ORDER BY created_at ASC`,
    [String(thread.id)]
  );

  return {
    thread,
    messages: messagesResult.rows,
  };
}

async function fetchReviewRow(reviewId: string, currentUserId?: string) {
  const params: Array<string> = [reviewId];
  const voteJoin = currentUserId
    ? `LEFT JOIN review_feedback_votes my_vote
         ON my_vote.review_id = r.id
        AND my_vote.user_id = $2`
    : "";

  if (currentUserId) params.push(currentUserId);

  const result = await query(
    `SELECT r.*, u.full_name, u.public_review_display_name,
            COALESCE(rt.status, 'open') AS thread_status,
            (SELECT COUNT(*)::int FROM review_thread_messages rtm WHERE rtm.thread_id = rt.id) AS thread_message_count
            ${currentUserId ? ", my_vote.vote_type AS current_user_vote" : ""}
     FROM reviews r
     JOIN users u ON u.id = r.user_id
     LEFT JOIN review_threads rt ON rt.review_id = r.id
     ${voteJoin}
     WHERE r.id = $1
     LIMIT 1`,
    params
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new AppError("Review not found.", 404);
  }

  return result.rows[0] as Record<string, unknown>;
}

export async function getReviewCatalog() {
  return {
    categories: Object.entries(reviewDimensionsByCategory).map(([key, dimensions]) => ({
      key,
      label: key === "software_saas" ? "Software / SaaS" : key === "cloud_services" ? "Cloud Services" : key === "ai_tools" ? "AI Tools" : "Common",
      dimensions: dimensions.map((dimension) => ({
        key: dimension,
        label: dimensionLabels[dimension] ?? dimension.replace(/_/g, " "),
      })),
    })),
  };
}

export async function listPublicProductReviews(identity: Record<string, unknown>, currentUserId?: string) {
  const { whereSql, params } = buildProductWhere(identity);
  const currentVoteSelect = currentUserId ? ", my_vote.vote_type AS current_user_vote" : "";
  const currentVoteJoin = currentUserId
    ? `LEFT JOIN review_feedback_votes my_vote
         ON my_vote.review_id = r.id
        AND my_vote.user_id = $${params.length + 1}`
    : "";
  const queryParams = currentUserId ? [...params, currentUserId] : params;

  const result = await query(
    `SELECT r.*, u.full_name, u.public_review_display_name${currentVoteSelect}
     FROM reviews r
     JOIN users u ON u.id = r.user_id
     ${currentVoteJoin}
     WHERE (${whereSql})
       AND r.status = 'approved'
     ORDER BY r.created_at DESC`,
    queryParams
  );

  const reviews = result.rows.map((row) => transformReviewRow(row as Record<string, unknown>));
  const firstReview = reviews[0];
  const stars = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((review) => Math.round(review.overallRating) === star).length,
  }));
  const averageOverall = reviews.length
    ? Number((reviews.reduce((total, review) => total + review.overallRating, 0) / reviews.length).toFixed(2))
    : 0;

  const categoryKey = firstReview?.categoryKey ?? normalizeCategory(identity.categoryKey);
  const dimensionAverages = reviewDimensionsByCategory[categoryKey].map((dimension) => {
    const nonZero = reviews.map((review) => Number(review.ratings[dimension] ?? 0)).filter((value) => value > 0);
    const average = nonZero.length ? Number((nonZero.reduce((total, value) => total + value, 0) / nonZero.length).toFixed(2)) : 0;
    return {
      key: dimension,
      label: dimensionLabels[dimension] ?? dimension.replace(/_/g, " "),
      average,
    };
  });

  const product = firstReview
    ? {
        productId: firstReview.productId,
        shopifyProductId: firstReview.shopifyProductId,
        productHandle: firstReview.productHandle,
        productName: firstReview.productName,
        vendorName: firstReview.vendorName,
        productUrl: firstReview.productUrl,
        productLogoUrl: firstReview.productLogoUrl,
        officialUrl: firstReview.officialUrl,
        categoryKey,
      }
    : {
        productId: identity.productId ?? null,
        shopifyProductId: identity.shopifyProductId ?? null,
        productHandle: identity.productHandle ?? null,
        productName: identity.productName ?? "",
        vendorName: identity.vendorName ?? "",
        productUrl: null,
        productLogoUrl: null,
        officialUrl: null,
        categoryKey,
      };

  const summary = {
      totalReviews: reviews.length,
      averageOverall,
      stars,
      dimensionAverages,
    };

  return {
    // Keep legacy top-level fields for cached storefront scripts that
    // still read data.averageOverall / data.totalReviews / data.productId.
    productId: product.productId,
    shopifyProductId: product.shopifyProductId,
    productHandle: product.productHandle,
    productName: product.productName,
    vendorName: product.vendorName,
    productUrl: product.productUrl,
    productLogoUrl: product.productLogoUrl,
    officialUrl: product.officialUrl,
    categoryKey: product.categoryKey,
    totalReviews: summary.totalReviews,
    averageOverall: summary.averageOverall,
    stars: summary.stars,
    dimensionAverages: summary.dimensionAverages,
    product,
    summary,
    reviews,
  };
}

export async function listMyReviews(userId: string) {
  const result = await query(
    `SELECT r.*, u.full_name, u.public_review_display_name,
            COALESCE(rt.status, 'open') AS thread_status,
            (SELECT COUNT(*)::int FROM review_thread_messages rtm WHERE rtm.thread_id = rt.id) AS thread_message_count
     FROM reviews r
     JOIN users u ON u.id = r.user_id
     LEFT JOIN review_threads rt ON rt.review_id = r.id
     WHERE r.user_id = $1
     ORDER BY r.created_at DESC`,
    [userId]
  );

  return result.rows.map((row) => transformReviewRow(row as Record<string, unknown>));
}

export async function getReviewById(userId: string, reviewId: string) {
  const row = await fetchReviewRow(reviewId, userId);
  if (String(row.user_id) !== userId) {
    throw new AppError("Review not found.", 404);
  }

  const thread = await hydrateThread(reviewId);
  return {
    ...transformReviewRow(row),
    ...thread,
  };
}

export async function createReview(userId: string, payload: ReviewPayload) {
  const id = createId();
  const { categoryKey, ratings, overallRating } = buildRatings(payload);
  const productName = String(payload.productName ?? "").trim();
  const vendorName = String(payload.vendorName ?? "").trim();
  const flags = await getUserFlags(userId, productName, vendorName);
  const status = String(payload.status ?? "approved");

  await query(
    `INSERT INTO reviews (
      id, user_id, product_id, shopify_product_id, product_handle, product_name, vendor_name,
      product_url, product_logo_url, official_url, category_key,
      overall_rating, rating_breakdown, review_title, review_body,
      pros, cons, use_case, usage_duration, company_size, recommend,
      screenshots, visibility, status, is_verified_reviewer, is_product_user,
      submitted_from, published_at, metadata
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11,
      $12, $13::jsonb, $14, $15,
      $16, $17, $18, $19, $20, $21,
      $22::jsonb, $23, $24, $25, $26,
      $27, $28, $29::jsonb
    )`,
    [
      id,
      userId,
      sanitizeOptionalText(payload.productId),
      sanitizeOptionalText(payload.shopifyProductId),
      sanitizeOptionalText(payload.productHandle),
      productName,
      vendorName,
      sanitizeOptionalText(payload.productUrl),
      sanitizeOptionalText(payload.productLogoUrl),
      sanitizeOptionalText(payload.officialUrl),
      categoryKey,
      overallRating,
      JSON.stringify(ratings),
      String(payload.reviewTitle),
      String(payload.reviewBody),
      sanitizeOptionalText(payload.pros),
      sanitizeOptionalText(payload.cons),
      sanitizeOptionalText(payload.useCase),
      sanitizeOptionalText(payload.usageDuration),
      sanitizeOptionalText(payload.companySize),
      Boolean(payload.recommend ?? true),
      JSON.stringify(payload.screenshots ?? []),
      payload.visibility ?? "public",
      status,
      flags.isVerifiedReviewer,
      flags.isProductUser,
      sanitizeOptionalText(payload.submittedFrom) ?? "user_portal",
      status === "approved" ? new Date() : null,
      JSON.stringify(payload.metadata ?? {}),
    ]
  );

  await query(
    `INSERT INTO review_threads (id, review_id, status)
     VALUES ($1, $2, 'open')
     ON CONFLICT (review_id) DO NOTHING`,
    [createId(), id]
  );

  if (status === "approved") {
    await awardPoints({
      userId,
      actionKey: "approved_review",
      sourceType: "review",
      sourceId: id,
      description: `Approved review for ${productName}`,
    });

    const hasDetailBonus = [payload.pros, payload.cons, payload.useCase].filter((value) => typeof value === "string" && value.trim().length > 0).length >= 2;
    if (hasDetailBonus) {
      await awardPoints({
        userId,
        actionKey: "detailed_review_bonus",
        sourceType: "review_detail_bonus",
        sourceId: id,
        description: `Detailed review bonus for ${productName}`,
      });
    }
  }

  return getReviewById(userId, id);
}

export async function updateReview(userId: string, reviewId: string, payload: ReviewPayload) {
  await getReviewById(userId, reviewId);

  const { categoryKey, ratings, overallRating } = buildRatings(payload);
  const productName = String(payload.productName ?? "").trim();
  const vendorName = String(payload.vendorName ?? "").trim();
  const flags = await getUserFlags(userId, productName, vendorName);

  await query(
    `UPDATE reviews SET
      product_id = $3,
      shopify_product_id = $4,
      product_handle = $5,
      product_name = $6,
      vendor_name = $7,
      product_url = $8,
      product_logo_url = $9,
      official_url = $10,
      category_key = $11,
      overall_rating = $12,
      rating_breakdown = $13::jsonb,
      review_title = $14,
      review_body = $15,
      pros = $16,
      cons = $17,
      use_case = $18,
      usage_duration = $19,
      company_size = $20,
      recommend = $21,
      screenshots = $22::jsonb,
      visibility = $23,
      is_verified_reviewer = $24,
      is_product_user = $25,
      metadata = $26::jsonb,
      updated_at = NOW()
     WHERE id = $1
       AND user_id = $2`,
    [
      reviewId,
      userId,
      sanitizeOptionalText(payload.productId),
      sanitizeOptionalText(payload.shopifyProductId),
      sanitizeOptionalText(payload.productHandle),
      productName,
      vendorName,
      sanitizeOptionalText(payload.productUrl),
      sanitizeOptionalText(payload.productLogoUrl),
      sanitizeOptionalText(payload.officialUrl),
      categoryKey,
      overallRating,
      JSON.stringify(ratings),
      String(payload.reviewTitle),
      String(payload.reviewBody),
      sanitizeOptionalText(payload.pros),
      sanitizeOptionalText(payload.cons),
      sanitizeOptionalText(payload.useCase),
      sanitizeOptionalText(payload.usageDuration),
      sanitizeOptionalText(payload.companySize),
      Boolean(payload.recommend ?? true),
      JSON.stringify(payload.screenshots ?? []),
      payload.visibility ?? "public",
      flags.isVerifiedReviewer,
      flags.isProductUser,
      JSON.stringify(payload.metadata ?? {}),
    ]
  );

  return getReviewById(userId, reviewId);
}

export async function deleteReview(userId: string, reviewId: string) {
  const result = await query(`DELETE FROM reviews WHERE id = $1 AND user_id = $2 RETURNING id`, [reviewId, userId]);
  if ((result.rowCount ?? 0) === 0) {
    throw new AppError("Review not found.", 404);
  }

  return { deleted: true };
}

export async function voteOnReview(userId: string, reviewId: string, voteType: "helpful" | "not_helpful") {
  const reviewResult = await query<{ id: string; user_id: string; product_name: string }>(
    `SELECT id, user_id, product_name
     FROM reviews
     WHERE id = $1
     LIMIT 1`,
    [reviewId]
  );

  if ((reviewResult.rowCount ?? 0) === 0) {
    throw new AppError("Review not found.", 404);
  }

  const review = reviewResult.rows[0];
  if (String(review.user_id) === userId) {
    throw new AppError(
      voteType === "helpful"
        ? "You cannot mark your own review as helpful."
        : "You cannot mark your own review as not helpful.",
      400
    );
  }

  const existingVoteResult = await query<{ id: string; vote_type: string }>(
    `SELECT id, vote_type
     FROM review_feedback_votes
     WHERE review_id = $1
       AND user_id = $2
     LIMIT 1`,
    [reviewId, userId]
  );

  const existingVote = existingVoteResult.rows[0];

  if (!existingVote) {
    await query(
      `INSERT INTO review_feedback_votes (id, review_id, user_id, vote_type)
       VALUES ($1, $2, $3, $4)`,
      [createId(), reviewId, userId, voteType]
    );

    await query(
      `UPDATE reviews
       SET ${voteType === "helpful" ? "useful_count" : "not_helpful_count"} = ${voteType === "helpful" ? "useful_count" : "not_helpful_count"} + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [reviewId]
    );

    if (voteType === "helpful") {
      await awardPoints({
        userId: String(review.user_id),
        actionKey: "review_useful_vote",
        sourceType: "review_useful_vote",
        sourceId: `${reviewId}:${userId}`,
        description: `Helpful vote received on ${review.product_name}`,
      });

      await createNotification({
        userId: String(review.user_id),
        type: "review-helpful",
        title: "Your review helped another buyer",
        message: `Someone marked your ${review.product_name} review as helpful.`,
        linkUrl: "/reviews",
        metadata: { reviewId },
      });
    }
  } else if (existingVote.vote_type === voteType) {
    await query(`DELETE FROM review_feedback_votes WHERE id = $1`, [existingVote.id]);
    await query(
      `UPDATE reviews
       SET ${voteType === "helpful" ? "useful_count" : "not_helpful_count"} = GREATEST(${voteType === "helpful" ? "useful_count" : "not_helpful_count"} - 1, 0),
           updated_at = NOW()
       WHERE id = $1`,
      [reviewId]
    );
  } else {
    await query(
      `UPDATE review_feedback_votes
       SET vote_type = $3, updated_at = NOW()
       WHERE id = $1`,
      [existingVote.id, reviewId, voteType]
    );
    await query(
      `UPDATE reviews
       SET useful_count = GREATEST(useful_count + $2, 0),
           not_helpful_count = GREATEST(not_helpful_count + $3, 0),
           updated_at = NOW()
       WHERE id = $1`,
      [reviewId, voteType === "helpful" ? 1 : -1, voteType === "not_helpful" ? 1 : -1]
    );
  }

  const refreshed = await fetchReviewRow(reviewId, userId);
  return {
    reviewId,
    helpfulCount: Number(refreshed.useful_count ?? 0),
    notHelpfulCount: Number(refreshed.not_helpful_count ?? 0),
    currentUserVote: refreshed.current_user_vote ? String(refreshed.current_user_vote) : null,
  };
}

export async function markReviewUseful(userId: string, reviewId: string) {
  return voteOnReview(userId, reviewId, "helpful");
}

export async function reportReview(userId: string, reviewId: string, payload: { reason: string; details?: string }) {
  const reviewResult = await query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM reviews WHERE id = $1 LIMIT 1`,
    [reviewId]
  );
  if ((reviewResult.rowCount ?? 0) === 0) {
    throw new AppError("Review not found.", 404);
  }

  if (String(reviewResult.rows[0].user_id) === userId) {
    throw new AppError("You cannot report your own review.", 400);
  }

  await query(
    `INSERT INTO review_reports (id, review_id, user_id, reason, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [createId(), reviewId, userId, payload.reason, sanitizeOptionalText(payload.details)]
  );

  await query(
    `UPDATE reviews
     SET report_count = report_count + 1,
         updated_at = NOW()
     WHERE id = $1`,
    [reviewId]
  );

  const refreshed = await fetchReviewRow(reviewId, userId);
  return {
    reviewId,
    reportCount: Number(refreshed.report_count ?? 0),
  };
}

export async function getReviewThread(userId: string, reviewId: string) {
  await getReviewById(userId, reviewId);
  return hydrateThread(reviewId);
}

export async function addReviewThreadMessage(userId: string, reviewId: string, message: string) {
  await getReviewById(userId, reviewId);

  let threadResult = await query(`SELECT id FROM review_threads WHERE review_id = $1 LIMIT 1`, [reviewId]);
  if ((threadResult.rowCount ?? 0) === 0) {
    await query(`INSERT INTO review_threads (id, review_id, status) VALUES ($1, $2, 'open')`, [createId(), reviewId]);
    threadResult = await query(`SELECT id FROM review_threads WHERE review_id = $1 LIMIT 1`, [reviewId]);
  }

  const threadId = String(threadResult.rows[0]?.id);
  await query(
    `INSERT INTO review_thread_messages (id, thread_id, sender_type, sender_id, message, is_official_vendor_response)
     VALUES ($1, $2, 'user', $3, $4, FALSE)`,
    [createId(), threadId, userId, message]
  );
  await query(`UPDATE review_threads SET updated_at = NOW() WHERE id = $1`, [threadId]);

  return hydrateThread(reviewId);
}
