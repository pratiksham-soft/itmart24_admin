import { firestore } from "../config/firebaseAdmin";
import { shopifyGraphQL } from "./shopifyHttp";
import { setCustomProductMetafields } from "./shopifyMetafields";

const ANALYTICS_COLLECTION = "analytics_preaggregated";
const PRODUCTS_COLLECTION = "products";
const SHOPIFY_QUERY_BATCH_SIZE = 50;
const SHOPIFY_UPDATE_CONCURRENCY = 4;

const PLAN_SCORES: Record<string, number> = {
  free: 10,
  starter: 22,
  business: 30,
  enterprise: 36,
};

const PLAN_FALLBACK_PRIORITIES: Record<string, number> = {
  free: 1,
  starter: 2,
  business: 3,
  enterprise: 4,
};

type AnalyticsAggregate = {
  firestoreProductId: string;
  clicks30d: number;
  impressions30d: number;
  views30d: number;
  ctr30d: number | null;
  groupingHints: string[];
};

type FirestoreProductRecord = {
  id: string;
  vendor?: {
    basic?: {
      subCategoryName?: string;
      category?: string;
    };
  };
  shopify?: {
    productId?: number;
    product?: {
      category?: string;
    };
    identifiers?: {
      productId?: number;
    };
    shopifyData?: {
      metafields?: {
        subscription_plan?: string;
        type_multiple?: string[] | string;
        avg_rating?: string | number | null;
        review_count?: string | number | null;
      };
    };
  };
};

type ShopifyRankingNode = {
  id?: string | null;
  legacyResourceId?: string | number | null;
  subscriptionPlan?: {
    value?: string | null;
  } | null;
  typeMultiple?: {
    value?: string | null;
  } | null;
  reviewsRating?: {
    value?: string | null;
  } | null;
  reviewsRatingCount?: {
    value?: string | null;
  } | null;
  customAvgRating?: {
    value?: string | null;
  } | null;
  customReviewCount?: {
    value?: string | null;
  } | null;
};

type ShopifyRankingInput = {
  subscriptionPlan: string | null;
  typeMultiple: string[];
  avgRating: number;
  reviewCount: number;
};

type RankingCandidate = {
  firestoreProductId: string;
  shopifyProductId: number;
  clicks30d: number;
  impressions30d: number;
  views30d: number;
  ctr30d: number | null;
  groupingHints: string[];
  cachedTypeMultiple: string[];
  fallbackGroupCategory: string;
  cachedSubscriptionPlan: string | null;
  cachedAvgRating: number | null;
  cachedReviewCount: number | null;
};

type RankingEntry = RankingCandidate & {
  subscriptionPlan: string | null;
  groupKey: string;
  avgRating: number;
  reviewCount: number;
  planScore: number;
  clickScore: number;
  reviewScore: number;
  penalty: number;
  rankScore: number;
};

type RankingSyncSkipped = {
  invalidAnalyticsProductId: number;
  missingFirestoreProduct: number;
  missingShopifyProductId: number;
  missingShopifyNode: number;
};

export type ProductRankingSyncResult = {
  startedAt: string;
  completedAt: string;
  analyticsDocumentsRead: number;
  analyticsProductsAggregated: number;
  eligibleProducts: number;
  syncedProducts: number;
  failedProducts: number;
  groupsEvaluated: number;
  skipped: RankingSyncSkipped;
  metafieldsUpdated: string[];
};

const RANKING_METAFIELDS = [
  "custom.clicks_30d",
  "custom.avg_rating",
  "custom.review_count",
  "custom.rank_score",
  "custom.rank_updated_at",
];

const normalizeText = (value: unknown): string => {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const roundTo = (value: number, precision = 4) => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const parseStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeText(item))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => normalizeText(item))
          .filter(Boolean);
      }
    } catch {
      return [trimmed];
    }

    return [trimmed];
  }

  return [];
};

const getNestedValue = (
  input: Record<string, unknown>,
  path: string[]
): unknown => {
  let current: unknown = input;

  for (const segment of path) {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
};

const parseRatingValue = (value: unknown): number | null => {
  const directNumber = toFiniteNumber(value);
  if (directNumber !== null) {
    return clamp(directNumber, 0, 5);
  }

  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const parsedValue = toFiniteNumber(
      parsed.value ?? parsed.rating ?? parsed.average
    );

    if (parsedValue === null) {
      return null;
    }

    const scaleMax =
      toFiniteNumber(parsed.scale_max) ??
      toFiniteNumber(parsed.scaleMax) ??
      5;

    if (!scaleMax || scaleMax <= 0) {
      return clamp(parsedValue, 0, 5);
    }

    return clamp((parsedValue / scaleMax) * 5, 0, 5);
  } catch {
    return null;
  }
};

const parseReviewCountValue = (value: unknown): number | null => {
  const directNumber = toFiniteNumber(value);
  if (directNumber !== null) {
    return Math.max(0, Math.round(directNumber));
  }

  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const parsedValue = toFiniteNumber(
      parsed.count ?? parsed.value ?? parsed.review_count
    );

    return parsedValue === null
      ? null
      : Math.max(0, Math.round(parsedValue));
  } catch {
    return null;
  }
};

const normalizePlanKey = (value: string | null): string => {
  const normalized = normalizeText(value).toLowerCase();

  if (!normalized) {
    return "";
  }

  if (normalized.includes("enterprise")) {
    return "enterprise";
  }

  if (normalized.includes("business")) {
    return "business";
  }

  if (normalized.includes("starter")) {
    return "starter";
  }

  if (normalized.includes("free")) {
    return "free";
  }

  return normalized;
};

const getPlanScore = (plan: string | null) =>
  PLAN_SCORES[normalizePlanKey(plan)] ?? 0;

const getPlanFallbackPriority = (plan: string | null) =>
  PLAN_FALLBACK_PRIORITIES[normalizePlanKey(plan)] ?? 0;

const isEffectivelyZero = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value) || value === 0;

const extractAnalyticsGroupingHints = (
  data: Record<string, unknown>
): string[] => {
  const hints = [
    normalizeText(data.collection),
    normalizeText(data.collectionTitle),
    normalizeText(data.collection_title),
    normalizeText(data.category),
    normalizeText(data.group),
    normalizeText(data.groupKey),
    normalizeText(data.group_key),
    ...parseStringList(data.collections),
    ...parseStringList(data.typeMultiple),
  ].filter(Boolean);

  return Array.from(new Set(hints));
};

const extractCachedMetafields = (
  product: FirestoreProductRecord
) => product.shopify?.shopifyData?.metafields ?? {};

const extractShopifyProductId = (
  product: FirestoreProductRecord
): number | null => {
  const directId =
    toFiniteNumber(product.shopify?.productId) ??
    toFiniteNumber(product.shopify?.identifiers?.productId);

  if (directId === null) {
    return null;
  }

  const roundedId = Math.round(directId);
  return roundedId > 0 ? roundedId : null;
};

const resolveFallbackGroupCategory = (
  product: FirestoreProductRecord
) =>
  normalizeText(product.vendor?.basic?.subCategoryName) ||
  normalizeText(product.vendor?.basic?.category) ||
  normalizeText(product.shopify?.product?.category) ||
  "all-products";

const resolveGroupingKey = (
  candidate: RankingCandidate,
  shopifyInput: ShopifyRankingInput | undefined
) =>
  candidate.groupingHints[0] ||
  shopifyInput?.typeMultiple[0] ||
  candidate.cachedTypeMultiple[0] ||
  candidate.fallbackGroupCategory ||
  "all-products";

const compareRankingEntries = (left: RankingEntry, right: RankingEntry) => {
  if (right.rankScore !== left.rankScore) {
    return right.rankScore - left.rankScore;
  }

  if (right.avgRating !== left.avgRating) {
    return right.avgRating - left.avgRating;
  }

  if (right.reviewCount !== left.reviewCount) {
    return right.reviewCount - left.reviewCount;
  }

  return right.clicks30d - left.clicks30d;
};

const chunk = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

const fetchProductsById = async (
  productIds: string[]
): Promise<Map<string, FirestoreProductRecord>> => {
  const productMap = new Map<string, FirestoreProductRecord>();
  const productIdChunks = chunk(productIds, 250);

  for (const productIdChunk of productIdChunks) {
    const refs = productIdChunk.map((productId) =>
      firestore.collection(PRODUCTS_COLLECTION).doc(productId)
    );
    const snapshots = await firestore.getAll(...refs);

    snapshots.forEach((snapshot) => {
      if (!snapshot.exists) {
        return;
      }

      productMap.set(snapshot.id, {
        id: snapshot.id,
        ...(snapshot.data() as Omit<FirestoreProductRecord, "id">),
      });
    });
  }

  return productMap;
};

const fetchShopifyRankingInputs = async (
  shopifyProductIds: number[]
): Promise<Map<number, ShopifyRankingInput>> => {
  const inputMap = new Map<number, ShopifyRankingInput>();
  const productIdChunks = chunk(shopifyProductIds, SHOPIFY_QUERY_BATCH_SIZE);

  const query = `
    query RankingSyncProducts($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Product {
          id
          legacyResourceId
          subscriptionPlan: metafield(namespace: "custom", key: "subscription_plan") {
            value
          }
          typeMultiple: metafield(namespace: "custom", key: "type_multiple") {
            value
          }
          reviewsRating: metafield(namespace: "reviews", key: "rating") {
            value
          }
          reviewsRatingCount: metafield(namespace: "reviews", key: "rating_count") {
            value
          }
          customAvgRating: metafield(namespace: "custom", key: "avg_rating") {
            value
          }
          customReviewCount: metafield(namespace: "custom", key: "review_count") {
            value
          }
        }
      }
    }
  `;

  for (const productIdChunk of productIdChunks) {
    const response: {
      data?: {
        data?: {
          nodes?: Array<ShopifyRankingNode | null>;
        };
        errors?: Array<{ message?: string }>;
      };
    } = await shopifyGraphQL.post("", {
      query,
      variables: {
        ids: productIdChunk.map(
          (productId) => `gid://shopify/Product/${productId}`
        ),
      },
    });

    if (response.data?.errors?.length) {
      throw new Error(
        response.data.errors
          .map((error) => error.message?.trim())
          .filter(Boolean)
          .join(", ") || "Failed to fetch Shopify ranking inputs"
      );
    }

    const nodes = Array.isArray(response.data?.data?.nodes)
      ? response.data?.data?.nodes ?? []
      : [];

    nodes.forEach((node) => {
      if (!node) {
        return;
      }

      const shopifyProductId =
        toFiniteNumber(node.legacyResourceId) ??
        toFiniteNumber(
          typeof node.id === "string" ? node.id.split("/").pop() : null
        );

      if (shopifyProductId === null) {
        return;
      }

      const roundedProductId = Math.round(shopifyProductId);

      const avgRating =
        parseRatingValue(node.reviewsRating?.value) ??
        parseRatingValue(node.customAvgRating?.value) ??
        0;
      const reviewCount =
        parseReviewCountValue(node.reviewsRatingCount?.value) ??
        parseReviewCountValue(node.customReviewCount?.value) ??
        0;

      inputMap.set(roundedProductId, {
        subscriptionPlan: normalizeText(node.subscriptionPlan?.value) || null,
        typeMultiple: parseStringList(node.typeMultiple?.value),
        avgRating,
        reviewCount,
      });
    });
  }

  return inputMap;
};

const mapWithConcurrency = async <T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
) => {
  let index = 0;

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (index < items.length) {
        const currentIndex = index;
        index += 1;
        await worker(items[currentIndex]);
      }
    }
  );

  await Promise.all(workers);
};

export const syncProductRankingToShopify =
  async (): Promise<ProductRankingSyncResult> => {
    const startedAt = new Date().toISOString();
    const skipped: RankingSyncSkipped = {
      invalidAnalyticsProductId: 0,
      missingFirestoreProduct: 0,
      missingShopifyProductId: 0,
      missingShopifyNode: 0,
    };

    const analyticsSnapshot = await firestore
      .collection(ANALYTICS_COLLECTION)
      .where("success", "==", true)
      .where("range", "==", "30d")
      .get();

    const aggregatedAnalytics = new Map<string, AnalyticsAggregate>();

    analyticsSnapshot.docs.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const firestoreProductId = normalizeText(data.productId);

      if (!firestoreProductId) {
        skipped.invalidAnalyticsProductId += 1;
        return;
      }

      const totals =
        data.totals && typeof data.totals === "object"
          ? (data.totals as Record<string, unknown>)
          : {};

      const existing =
        aggregatedAnalytics.get(firestoreProductId) ??
        ({
          firestoreProductId,
          clicks30d: 0,
          impressions30d: 0,
          views30d: 0,
          ctr30d: null,
          groupingHints: [],
        } satisfies AnalyticsAggregate);

      existing.clicks30d += Math.max(0, toFiniteNumber(totals.clicks) ?? 0);
      existing.impressions30d += Math.max(
        0,
        toFiniteNumber(totals.impressions) ?? 0
      );
      existing.views30d += Math.max(0, toFiniteNumber(totals.views) ?? 0);

      const ctr = toFiniteNumber(totals.ctr);
      if (ctr !== null) {
        existing.ctr30d = ctr;
      }

      existing.groupingHints = Array.from(
        new Set([
          ...existing.groupingHints,
          ...extractAnalyticsGroupingHints(data),
        ])
      );

      aggregatedAnalytics.set(firestoreProductId, existing);
    });

    const analyticsByProductId = Array.from(aggregatedAnalytics.values());
    const productMap = await fetchProductsById(
      analyticsByProductId.map((item) => item.firestoreProductId)
    );

    const rankingCandidates: RankingCandidate[] = [];

    analyticsByProductId.forEach((analytics) => {
      const product = productMap.get(analytics.firestoreProductId);

      if (!product) {
        skipped.missingFirestoreProduct += 1;
        return;
      }

      const shopifyProductId = extractShopifyProductId(product);
      if (!shopifyProductId) {
        skipped.missingShopifyProductId += 1;
        return;
      }

      const cachedMetafields = extractCachedMetafields(product);

      rankingCandidates.push({
        firestoreProductId: analytics.firestoreProductId,
        shopifyProductId,
        clicks30d: analytics.clicks30d,
        impressions30d: analytics.impressions30d,
        views30d: analytics.views30d,
        ctr30d: analytics.ctr30d,
        groupingHints: analytics.groupingHints,
        cachedTypeMultiple: parseStringList(cachedMetafields.type_multiple),
        fallbackGroupCategory: resolveFallbackGroupCategory(product),
        cachedSubscriptionPlan:
          normalizeText(cachedMetafields.subscription_plan) || null,
        cachedAvgRating: parseRatingValue(cachedMetafields.avg_rating),
        cachedReviewCount: parseReviewCountValue(cachedMetafields.review_count),
      });
    });

    const shopifyInputs = await fetchShopifyRankingInputs(
      Array.from(
        new Set(
          rankingCandidates.map((candidate) => candidate.shopifyProductId)
        )
      )
    );

    const eligibleCandidates = rankingCandidates.filter((candidate) => {
      if (shopifyInputs.has(candidate.shopifyProductId)) {
        return true;
      }

      skipped.missingShopifyNode += 1;
      return false;
    });

    const maxClicksByGroup = new Map<string, number>();

    eligibleCandidates.forEach((candidate) => {
      const shopifyInput = shopifyInputs.get(candidate.shopifyProductId);
      const groupKey = resolveGroupingKey(candidate, shopifyInput);
      const currentMax = maxClicksByGroup.get(groupKey) ?? 0;
      maxClicksByGroup.set(groupKey, Math.max(currentMax, candidate.clicks30d));
    });

    const rankingEntries = eligibleCandidates
      .map((candidate) => {
        const shopifyInput = shopifyInputs.get(candidate.shopifyProductId);
        const subscriptionPlan =
          shopifyInput?.subscriptionPlan ??
          candidate.cachedSubscriptionPlan ??
          null;
        const avgRating =
          shopifyInput?.avgRating ??
          candidate.cachedAvgRating ??
          0;
        const reviewCount =
          shopifyInput?.reviewCount ??
          candidate.cachedReviewCount ??
          0;
        const groupKey = resolveGroupingKey(candidate, shopifyInput);
        const maxClicksInGroup = maxClicksByGroup.get(groupKey) ?? 0;
        const clickScore =
          maxClicksInGroup > 0
            ? Math.min(
                24,
                (candidate.clicks30d / maxClicksInGroup) * 24
              )
            : 0;
        const reviewScore =
          (clamp(avgRating, 0, 5) / 5) * 28 +
          Math.min(12, (Math.max(reviewCount, 0) / 50) * 12);
        const penalty =
          avgRating < 3 ? 12 : avgRating < 3.5 ? 6 : 0;
        const calculatedRankScore =
          getPlanScore(subscriptionPlan) +
          clickScore +
          reviewScore -
          penalty;
        const shouldUsePlanFallback =
          isEffectivelyZero(candidate.clicks30d) &&
          isEffectivelyZero(avgRating) &&
          isEffectivelyZero(reviewCount);
        const rankScore = shouldUsePlanFallback
          ? getPlanFallbackPriority(subscriptionPlan)
          : calculatedRankScore;

        return {
          ...candidate,
          subscriptionPlan,
          groupKey,
          avgRating: roundTo(clamp(avgRating, 0, 5), 4),
          reviewCount: Math.max(0, Math.round(reviewCount)),
          planScore: getPlanScore(subscriptionPlan),
          clickScore: roundTo(clickScore, 4),
          reviewScore: roundTo(reviewScore, 4),
          penalty,
          rankScore: roundTo(rankScore, 4),
        } satisfies RankingEntry;
      })
      .sort(compareRankingEntries);

    const rankUpdatedAt = new Date().toISOString();
    let syncedProducts = 0;
    let failedProducts = 0;

    await mapWithConcurrency(
      rankingEntries,
      SHOPIFY_UPDATE_CONCURRENCY,
      async (entry) => {
        try {
          await setCustomProductMetafields({
            shopifyProductId: entry.shopifyProductId,
            metafields: [
              {
                key: "clicks_30d",
                type: "number_integer",
                value: String(Math.max(0, Math.round(entry.clicks30d))),
              },
              {
                key: "avg_rating",
                type: "number_decimal",
                value: entry.avgRating.toFixed(4),
              },
              {
                key: "review_count",
                type: "number_integer",
                value: String(entry.reviewCount),
              },
              {
                key: "rank_score",
                type: "number_decimal",
                value: entry.rankScore.toFixed(4),
              },
              {
                key: "rank_updated_at",
                type: "date_time",
                value: rankUpdatedAt,
              },
            ],
          });

          syncedProducts += 1;
        } catch (error) {
          failedProducts += 1;
          console.error(
            `[product-ranking-sync] Failed to update Shopify product ${entry.shopifyProductId} (Firestore product ${entry.firestoreProductId})`,
            error
          );
        }
      }
    );

    return {
      startedAt,
      completedAt: new Date().toISOString(),
      analyticsDocumentsRead: analyticsSnapshot.size,
      analyticsProductsAggregated: analyticsByProductId.length,
      eligibleProducts: rankingEntries.length,
      syncedProducts,
      failedProducts,
      groupsEvaluated: maxClicksByGroup.size,
      skipped,
      metafieldsUpdated: RANKING_METAFIELDS,
    };
  };
