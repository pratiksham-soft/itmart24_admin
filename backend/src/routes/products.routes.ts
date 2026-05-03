import { Router } from "express";
import { firestore } from "../config/firebase";
import admin from "firebase-admin";
import {
  getShopifyProductHandle,
  syncProductWithShopify,
} from "../services/shopifyProductSync";
import { enrichProductsWithVendors } from "../utils/enrichProductsWithVendors";
import {
  importShopifyProductsToFirestore,
} from "../services/shopifyProductImport";
import {
  createProductsSyncLog,
  getProductsSyncLogs,
} from "../services/productsSyncLogs.service";
import {
  completeProductsSyncProgress,
  failProductsSyncProgress,
  getProductsSyncProgress,
  isProductsSyncRunning,
  startProductsSyncProgress,
  updateProductsSyncProgress,
} from "../services/productsSyncProgress.service";
import {
  buildFirestoreExport,
  listFirestoreRootCollections,
} from "../services/firestoreExport.service";
import {
  buildActiveSubscriptionLookup,
  deleteProductEverywhere,
  normalizeDeleteListItem,
} from "../services/productDeletion.service";

type FirestoreProductData = {
  vendorId: string;
  status: string;

  // 🆕 unified schema (optional for backward compatibility)
  source?: "vendor" | "shopify";

  lifecycleStatus?: string;
  shopifyStatus?: "active" | "draft" | "archived";

  ownership?: {
    claimed: boolean;
    claimedByVendorId: string | null;
    claimedAt: admin.firestore.Timestamp | null;
  };

  product?: {
    title: string;
    handle: string | null;
    descriptionHtml: string;
    category: string;
    productType: string;
    vendor: string;
    tags: string[];
    published: boolean;
    shopifyProductURL: string;
  };

  vendor?: {
    basic?: {
      productName?: string;
      category?: string;
      subCategoryName?: string;
      description?: string;
      keywords?: string[];
      demoLink?: string | null;
    };
    features?: {
      name: string;
      description: string;
    }[];
    pricing?: {
      selectedPlan?: string;
      price?: number;
      affiliateUrl?: string;
      plans?: any[];
    };
    media?: {
      thumbnailUrl?: string;
      shopifyFileId?: string;
      width?: number | null;
      height?: number | null;
    };
    metadata?: any;
    verification?: any;
  };

  shopify?: {
    productId?: number;
    graphqlId?: string | null;
    handle?: string | null;
    shopifyStatus?: "active" | "draft";
    syncAction?: string;
    syncedAt?: admin.firestore.Timestamp;
    lastError?: string;
  };

  [key: string]: any;
};

type FirestoreProduct = FirestoreProductData & {
  id: string;
};

const router = Router();
const PRODUCT_ADMIN_LIST_PAGE_SIZE = 25;
const PRODUCT_ADMIN_LIST_MAX_PAGE_SIZE = 100;
const getStorefrontProductUrl = (handle: string) => {
  const storefrontDomain =
    process.env.SHOPIFY_STOREFRONT_DOMAIN ||
    process.env.SHOPIFY_STORE_DOMAIN;

  if (!storefrontDomain) {
    throw new Error("Shopify storefront domain is not configured.");
  }

  return `https://${storefrontDomain.replace(/^https?:\/\//, "").replace(/\/$/, "")}/products/${handle}`;
};
const parseShopifyProductId = (value: unknown) => {
  const numericId =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").split("/").pop());

  if (!numericId || Number.isNaN(numericId)) {
    throw new Error("Shopify product ID is invalid for this item.");
  }

  return numericId;
};

type FirestoreTimestampLike =
  | admin.firestore.Timestamp
  | {
      _seconds?: number;
      _nanoseconds?: number;
    }
  | string
  | number
  | null
  | undefined;

const normalizeFirestoreValue = (value: unknown): unknown => {
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeFirestoreValue(item));
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
      (accumulator, [key, nestedValue]) => {
        accumulator[key] = normalizeFirestoreValue(nestedValue);
        return accumulator;
      },
      {}
    );
  }

  return value;
};

const toFirestoreTimestamp = (
  value: FirestoreTimestampLike
) => {
  if (value instanceof admin.firestore.Timestamp) {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    typeof value._seconds === "number"
  ) {
    return admin.firestore.Timestamp.fromMillis(
      value._seconds * 1000 +
        Math.round((value._nanoseconds ?? 0) / 1000000)
    );
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
      return admin.firestore.Timestamp.fromDate(date);
    }
  }

  return value;
};

const sanitizeUpdatePayload = (
  value: unknown,
  path: string[] = []
): unknown => {
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      sanitizeUpdatePayload(item, [...path, String(index)])
    );
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
      (accumulator, [key, nestedValue]) => {
        if (
          path.length === 0 &&
          [
            "id",
            "createdAt",
            "updatedAt",
            "businessName",
            "claimedByBusinessName",
            "vendorResolved",
          ].includes(key)
        ) {
          return accumulator;
        }

        if (nestedValue === undefined) {
          return accumulator;
        }

        accumulator[key] = sanitizeUpdatePayload(
          nestedValue,
          [...path, key]
        );

        return accumulator;
      },
      {}
    );
  }

  const currentKey = path[path.length - 1] ?? "";
  if (/At$/i.test(currentKey)) {
    return toFirestoreTimestamp(value as FirestoreTimestampLike);
  }

  return value;
};

const mergeDeep = (target: unknown, source: unknown): unknown => {
  if (Array.isArray(source)) {
    return source.map((item) => mergeDeep(undefined, item));
  }

  if (source && typeof source === "object") {
    const sourceRecord = source as Record<string, unknown>;
    const targetRecord =
      target && typeof target === "object" && !Array.isArray(target)
        ? (target as Record<string, unknown>)
        : {};

    return Object.entries(sourceRecord).reduce<Record<string, unknown>>(
      (accumulator, [key, value]) => {
        accumulator[key] = mergeDeep(targetRecord[key], value);
        return accumulator;
      },
      { ...targetRecord }
    );
  }

  return source === undefined ? target : source;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parseBooleanFlag = (
  value: unknown,
  fallback = false
) => {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
};

type ProductAdminListItem = {
  id: string;
  vendorId: string;
  businessName: string;
  status: string;
  shopifyProductURL: string | null;
  vendor: {
    basic: {
      subCategoryName: string;
    };
  };
  basic: {
    productName: string;
    category: string;
    description: string;
  };
  pricing: {
    selectedPlan: string;
    price: number;
  };
};

type ProductDeleteListItem = ProductAdminListItem & {
  shopifyStatus: string;
  shopifyProductId: number | null;
  shopifyHandle: string | null;
  activeSubscription: {
    hasActiveSubscription: boolean;
    activeSubscriptionCount: number;
    activeSubscriptionMessage: string | null;
  };
};

const parsePositiveIntegerQuery = (
  value: unknown,
  fallback: number,
  max?: number
) => {
  const parsedValue = Number.parseInt(
    typeof value === "string" ? value : "",
    10
  );

  if (!Number.isFinite(parsedValue) || parsedValue < 1) {
    return fallback;
  }

  if (typeof max === "number") {
    return Math.min(parsedValue, max);
  }

  return parsedValue;
};

const normalizeSearchValue = (
  value: string | number | null | undefined
) => String(value ?? "").trim().toLowerCase();

const filterAdminProductsBySearch = (
  products: ProductAdminListItem[],
  searchQuery: string
) => {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  if (!normalizedQuery) {
    return products;
  }

  return products.filter((product) =>
    [
      product.id,
      product.vendorId,
      product.businessName,
      product.status,
      product.vendor?.basic?.subCategoryName,
      product.basic?.productName,
      product.basic?.category,
      product.basic?.description,
      product.pricing?.selectedPlan,
      product.pricing?.price,
    ].some((value) => normalizeSearchValue(value).includes(normalizedQuery))
  );
};

const filterDeleteProductsBySearch = (
  products: ProductDeleteListItem[],
  searchQuery: string
) => {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  if (!normalizedQuery) {
    return products;
  }

  return products.filter((product) =>
    [
      product.id,
      product.vendorId,
      product.businessName,
      product.status,
      product.shopifyStatus,
      product.shopifyProductId,
      product.shopifyHandle,
      product.shopifyProductURL,
      product.vendor?.basic?.subCategoryName,
      product.basic?.productName,
      product.basic?.category,
      product.basic?.description,
      product.pricing?.selectedPlan,
      product.activeSubscription?.activeSubscriptionMessage,
    ].some((value) => normalizeSearchValue(value).includes(normalizedQuery))
  );
};

const normalizeAdminProductListItem = (
  product: any
): ProductAdminListItem => ({
  id: product.id,
  vendorId: product.vendorId,
  businessName: product.vendorResolved.businessName,
  status: product.lifecycleStatus,
  shopifyProductURL: product.shopify?.shopifyProductURL ?? null,
  vendor: {
    basic: {
      subCategoryName: product.vendor?.basic?.subCategoryName ?? "-",
    },
  },
  basic: {
    productName:
      product.vendor?.basic?.productName ??
      product.shopify?.product?.title ??
      "Unnamed Product",
    category:
      product.vendor?.basic?.category ??
      product.shopify?.product?.category ??
      "-",
    description:
      product.vendor?.basic?.description ??
      product.shopify?.product?.descriptionHtml ??
      "",
  },
  pricing: {
    selectedPlan:
      product.vendor?.pricing?.selectedPlan ??
      product.shopify?.shopifyData?.metafields?.plan ??
      "default",
    price: Number(
      product.vendor?.pricing?.price ??
      product.shopify?.shopifyData?.variants?.[0]?.price ??
      0
    ),
  },
});

const buildAdminProductListItems = async (
  docs: FirebaseFirestore.QueryDocumentSnapshot[]
) => {
  const products: FirestoreProduct[] = docs.map((doc) => {
    const data = doc.data() as FirestoreProductData;

    return {
      id: doc.id,
      ...data,
    };
  });

  const enrichedProducts = await enrichProductsWithVendors(products);

  return enrichedProducts.map((product: any) =>
    normalizeAdminProductListItem(product)
  );
};

const buildDeleteAdminProductListItems = async (
  docs: FirebaseFirestore.QueryDocumentSnapshot[]
) => {
  const products: FirestoreProduct[] = docs.map((doc) => {
    const data = doc.data() as FirestoreProductData;

    return {
      id: doc.id,
      ...data,
    };
  });

  const enrichedProducts = await enrichProductsWithVendors(products);
  const activeSubscriptionLookup =
    await buildActiveSubscriptionLookup(enrichedProducts as any[]);

  return enrichedProducts.map((product: any) => {
    const normalizedItem = normalizeDeleteListItem(
      product,
      activeSubscriptionLookup.get(product.id) ?? {
        hasActiveSubscription: false,
        activeSubscriptionCount: 0,
        activeSubscriptionMessage: null,
      }
    );

    return {
      ...normalizedItem,
      businessName: product.vendorResolved?.businessName ?? "",
    } satisfies ProductDeleteListItem;
  });
};

const sendPaginatedAdminProductsResponse = async ({
  req,
  res,
  filterQuery,
  orderedQuery,
  errorMessage,
}: {
  req: any;
  res: any;
  filterQuery: FirebaseFirestore.Query;
  orderedQuery: FirebaseFirestore.Query;
  errorMessage: string;
}) => {
  const pageSize = parsePositiveIntegerQuery(
    req.query.pageSize,
    PRODUCT_ADMIN_LIST_PAGE_SIZE,
    PRODUCT_ADMIN_LIST_MAX_PAGE_SIZE
  );
  const requestedPage = parsePositiveIntegerQuery(req.query.page, 1);
  const searchQuery =
    typeof req.query.search === "string" ? req.query.search.trim() : "";

  try {
    if (searchQuery) {
      const snapshot = await orderedQuery.get();
      const filteredProducts = filterAdminProductsBySearch(
        await buildAdminProductListItems(snapshot.docs),
        searchQuery
      );
      const totalCount = filteredProducts.length;
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      const page = Math.min(requestedPage, totalPages);
      const startIndex = (page - 1) * pageSize;

      res.json({
        success: true,
        count: totalCount,
        data: filteredProducts.slice(startIndex, startIndex + pageSize),
        page,
        pageSize,
        totalPages,
        hasMore: page < totalPages,
        nextCursor: null,
      });
      return;
    }

    const [countSnapshot] = await Promise.all([filterQuery.count().get()]);
    const totalCount = Number(countSnapshot.data().count ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const paginatedQuery = orderedQuery
      .offset((page - 1) * pageSize)
      .limit(pageSize);

    const snapshot = await paginatedQuery.get();

    res.json({
      success: true,
      count: totalCount,
      data: await buildAdminProductListItems(snapshot.docs),
      page,
      pageSize,
      totalPages,
      hasMore: page < totalPages,
      nextCursor: null,
    });
  } catch (error: any) {
    console.error(errorMessage, error);
    res.status(500).json({
      success: false,
      message: error.message || errorMessage,
    });
  }
};

/**
 * GET /api/products/firestore-export/collections
 * Fetch root Firestore collections for export selection
 */
router.get(
  "/firestore-export/collections",
  async (_req, res) => {
    try {
      const collections =
        await listFirestoreRootCollections();

      res.json({
        success: true,
        data: collections,
      });
    } catch (error: any) {
      console.error(
        "Firestore export collections error:",
        error
      );
      res.status(500).json({
        success: false,
        message:
          error.message ||
          "Failed to load Firestore collections",
      });
    }
  }
);

/**
 * POST /api/products/firestore-export
 * Export selected Firestore collections as JSON
 */
router.post(
  "/firestore-export",
  async (req, res) => {
    try {
      const collections = Array.isArray(
        req.body?.collections
      )
        ? req.body.collections
        : [];
      const options =
        req.body?.options ?? {};

      const exportPayload =
        await buildFirestoreExport(
          collections,
          {
            schema: parseBooleanFlag(
              options.schema,
              false
            ),
            structure: parseBooleanFlag(
              options.structure,
              false
            ),
            dataFields: parseBooleanFlag(
              options.dataFields,
              false
            ),
            values: parseBooleanFlag(
              options.values,
              false
            ),
            topDocuments:
              parseBooleanFlag(
                options.topDocuments,
                false
              ),
          },
          {
            fromDate:
              typeof req.body?.fromDate ===
              "string"
                ? req.body.fromDate
                : null,
            toDate:
              typeof req.body?.toDate ===
              "string"
                ? req.body.toDate
                : null,
          }
        );

      const fileStamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-");
      const filename = `firestore-export-${fileStamp}.json`;

      res.setHeader(
        "Content-Type",
        "application/json; charset=utf-8"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      res.send(
        JSON.stringify(exportPayload, null, 2)
      );
    } catch (error: any) {
      console.error(
        "Firestore export error:",
        error
      );
      res.status(400).json({
        success: false,
        message:
          error.message ||
          "Failed to export Firestore data",
      });
    }
  }
);

router.get("/delete-list", async (req, res) => {
  const pageSize = parsePositiveIntegerQuery(
    req.query.pageSize,
    PRODUCT_ADMIN_LIST_PAGE_SIZE,
    PRODUCT_ADMIN_LIST_MAX_PAGE_SIZE
  );
  const requestedPage = parsePositiveIntegerQuery(req.query.page, 1);
  const searchQuery =
    typeof req.query.search === "string" ? req.query.search.trim() : "";

  try {
    const productsQuery = firestore
      .collection("products")
      .orderBy("createdAt", "desc");

    if (searchQuery) {
      const snapshot = await productsQuery.get();
      const filteredProducts = filterDeleteProductsBySearch(
        await buildDeleteAdminProductListItems(snapshot.docs),
        searchQuery
      );
      const totalCount = filteredProducts.length;
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      const page = Math.min(requestedPage, totalPages);
      const startIndex = (page - 1) * pageSize;

      res.json({
        success: true,
        count: totalCount,
        data: filteredProducts.slice(startIndex, startIndex + pageSize),
        page,
        pageSize,
        totalPages,
        hasMore: page < totalPages,
        nextCursor: null,
      });
      return;
    }

    const countSnapshot = await firestore.collection("products").count().get();
    const totalCount = Number(countSnapshot.data().count ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const snapshot = await productsQuery
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    res.json({
      success: true,
      count: totalCount,
      data: await buildDeleteAdminProductListItems(snapshot.docs),
      page,
      pageSize,
      totalPages,
      hasMore: page < totalPages,
      nextCursor: null,
    });
  } catch (error: any) {
    console.error("Failed to fetch delete products list", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch delete products list",
    });
  }
});

/**
 * GET /api/products/pending
 * Fetch all pending products
 */
router.get("/pending", async (req, res) => {
  const filterQuery = firestore
    .collection("products")
    .where("lifecycleStatus", "==", "pending")
    .where("ownership.claimed", "!=", true);
  const orderedQuery = filterQuery
    .orderBy("ownership.claimed")
    .orderBy("createdAt", "desc");

  return await sendPaginatedAdminProductsResponse({
    req,
    res,
    filterQuery,
    orderedQuery,
    errorMessage: "Failed to fetch pending products",
  });
  try {
    const snapshot = await firestore
      .collection("products")
      .where("lifecycleStatus", "==", "pending")
      .where("ownership.claimed", "!=", true)
      .orderBy("ownership.claimed")
      .orderBy("createdAt", "desc")
      .get();

    const products: FirestoreProduct[] = snapshot.docs.map((doc) => {
      const data = doc.data() as FirestoreProductData;

      return {
        id: doc.id,
        ...data,
      };
    });


    const enrichedProducts = await enrichProductsWithVendors(products);

    const normalizedProducts = enrichedProducts.map((product: any) => ({
      id: product.id,
      vendorId: product.vendorId,

      // ✅ ALWAYS SHOW BUSINESS NAME
      businessName: product.vendorResolved.businessName,

      status: product.lifecycleStatus,

      shopifyProductURL: product.shopify?.shopifyProductURL ?? null,
      vendor: {
        basic: {
          subCategoryName: product.vendor?.basic?.subCategoryName ?? "-",
        },
      },

      // ✅ ALWAYS SHOW PRODUCT NAME
      basic: {
        productName:
          product.vendor?.basic?.productName ??
          product.shopify?.product?.title ??
          "Unnamed Product",

        category:
          product.vendor?.basic?.category ??
          product.shopify?.product?.category ??
          "—",

        description:
          product.vendor?.basic?.description ??
          product.shopify?.product?.descriptionHtml ??
          "",
      },

      pricing: {
        selectedPlan:
          product.vendor?.pricing?.selectedPlan ??
          product.shopify?.shopifyData?.metafields?.plan ??
          "default",

        price: Number(
          product.vendor?.pricing?.price ??
          product.shopify?.shopifyData?.variants?.[0]?.price ??
          0
        ),
      },
    }));
    /* ================= RESPONSE ================= */

    res.json({
      success: true,
      count: normalizedProducts.length,
      data: normalizedProducts,
    });
  } catch (error: any) {
    console.error("Firestore error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Unknown Firestore error",
    });
  }
});


/**
 * GET /api/products/claimed
 * Fetch claimed + pending products
 */
router.get("/claimed", async (req, res) => {
  const filterQuery = firestore
    .collection("products")
    .where("ownership.claimed", "==", true)
    .where("lifecycleStatus", "==", "pending");
  const orderedQuery = filterQuery.orderBy("createdAt", "desc");

  return await sendPaginatedAdminProductsResponse({
    req,
    res,
    filterQuery,
    orderedQuery,
    errorMessage: "Failed to fetch claimed products",
  });
  try {
    const snapshot = await firestore
      .collection("products")
      .where("ownership.claimed", "==", true)
      .where("lifecycleStatus", "==", "pending")
      .orderBy("createdAt", "desc")
      .get();

    const products: FirestoreProduct[] = snapshot.docs.map((doc) => {
      const data = doc.data() as FirestoreProductData;

      return {
        id: doc.id,
        ...data,
      };
    });

    const enrichedProducts = await enrichProductsWithVendors(products);

    const normalizedProducts = enrichedProducts.map((product: any) => ({
      id: product.id,
      vendorId: product.vendorId,

      businessName: product.vendorResolved.businessName,

      status: product.lifecycleStatus,

      shopifyProductURL: product.shopify?.shopifyProductURL ?? null,

      vendor: {
        basic: {
          subCategoryName: product.vendor?.basic?.subCategoryName ?? "-",
        },
      },

      basic: {
        productName:
          product.vendor?.basic?.productName ??
          product.shopify?.product?.title ??
          "Unnamed Product",

        category:
          product.vendor?.basic?.category ??
          product.shopify?.product?.category ??
          "—",

        description:
          product.vendor?.basic?.description ??
          product.shopify?.product?.descriptionHtml ??
          "",
      },

      pricing: {
        selectedPlan:
          product.vendor?.pricing?.selectedPlan ??
          product.shopify?.shopifyData?.metafields?.plan ??
          "default",

        price: Number(
          product.vendor?.pricing?.price ??
          product.shopify?.shopifyData?.variants?.[0]?.price ??
          0
        ),
      },
    }));

    res.json({
      success: true,
      count: normalizedProducts.length,
      data: normalizedProducts,
    });
  } catch (error: any) {
    console.error("Claimed products error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch claimed products",
    });
  }
});


/**
 * GET /api/products/active
 * Fetch all active products
 */
router.get("/active", async (req, res) => {
  const filterQuery = firestore
    .collection("products")
    .where("lifecycleStatus", "==", "active")
    .where("shopify.shopifyStatus", "==", "active");
  const orderedQuery = filterQuery.orderBy("createdAt", "desc");

  return await sendPaginatedAdminProductsResponse({
    req,
    res,
    filterQuery,
    orderedQuery,
    errorMessage: "Failed to fetch active products",
  });
  try {
    const PAGE_SIZE = 25;
    const shouldFetchAll = req.query.all === "true";
    const cursor = req.query.cursor as string | undefined;

    let query = firestore
      .collection("products")
      .where("lifecycleStatus", "==", "active")
      .where("shopify.shopifyStatus", "==", "active")
      .orderBy("createdAt", "desc");

    if (!shouldFetchAll) {
      query = query.limit(PAGE_SIZE);
    }

    if (!shouldFetchAll && cursor) {
      const cursorDate = admin.firestore.Timestamp.fromMillis(
        Number(cursor)
      );

      query = query.startAfter(cursorDate);
    }

    const snapshot = await query.get();

    const products: FirestoreProduct[] = snapshot.docs.map((doc) => {
      const data = doc.data() as FirestoreProductData;

      return {
        id: doc.id,
        ...data,
      };
    });

    const enrichedProducts = await enrichProductsWithVendors(products);

    const normalizedProducts = enrichedProducts.map((product: any) => ({
      id: product.id,
      vendorId: product.vendorId,

      // ✅ ALWAYS SHOW BUSINESS NAME
      businessName: product.vendorResolved.businessName,

      status: product.lifecycleStatus,

      shopifyProductURL: product.shopify?.shopifyProductURL ?? null,

      vendor: {
        basic: {
          subCategoryName: product.vendor?.basic?.subCategoryName ?? "-",
        },
      },

      // ✅ ALWAYS SHOW PRODUCT NAME
      basic: {
        productName:
          product.vendor?.basic?.productName ??
          product.shopify?.product?.title ??
          "Unnamed Product",

        category:
          product.vendor?.basic?.category ??
          product.shopify?.product?.category ??
          "—",

        description:
          product.vendor?.basic?.description ??
          product.shopify?.product?.descriptionHtml ??
          "",
      },

      pricing: {
        selectedPlan:
          product.vendor?.pricing?.selectedPlan ??
          product.shopify?.shopifyData?.metafields?.plan ??
          "default",

        price: Number(
          product.vendor?.pricing?.price ??
          product.shopify?.shopifyData?.variants?.[0]?.price ??
          0
        ),
      },
    }));


    /* ================= RESPONSE ================= */

    const lastDoc = snapshot.docs[snapshot.docs.length - 1];

    res.json({
      success: true,
      count: normalizedProducts.length,
      data: normalizedProducts,
      nextCursor: shouldFetchAll
        ? null
        : lastDoc
        ? lastDoc.get("createdAt").toMillis()
        : null,
      hasMore: shouldFetchAll ? false : snapshot.docs.length === PAGE_SIZE,
    });

  } catch (error: any) {
    console.error("Active products error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch active products",
    });
  }
});


/**
 * GET /api/products/rejected
 * Fetch rejected products
 */
router.get("/rejected", async (req, res) => {
  const filterQuery = firestore
    .collection("products")
    .where("lifecycleStatus", "==", "rejected");
  const orderedQuery = filterQuery.orderBy("createdAt", "desc");

  return await sendPaginatedAdminProductsResponse({
    req,
    res,
    filterQuery,
    orderedQuery,
    errorMessage: "Failed to fetch rejected products",
  });
  try {
    const snapshot = await firestore
      .collection("products")
      .where("lifecycleStatus", "==", "rejected")
      .orderBy("createdAt", "desc")
      .get();

    const products: FirestoreProduct[] = snapshot.docs.map((doc) => {
      const data = doc.data() as FirestoreProductData;

      return {
        id: doc.id,
        ...data,
      };
    });


    const enrichedProducts = await enrichProductsWithVendors(products);

    const normalizedProducts = enrichedProducts.map((product: any) => ({
      id: product.id,
      vendorId: product.vendorId,

      // ✅ ALWAYS SHOW BUSINESS NAME
      businessName: product.vendorResolved.businessName,

      status: product.lifecycleStatus,

      shopifyProductURL: product.shopify?.shopifyProductURL ?? null,

      vendor: {
        basic: {
          subCategoryName: product.vendor?.basic?.subCategoryName ?? "-",
        },
      },

      // ✅ ALWAYS SHOW PRODUCT NAME
      basic: {
        productName:
          product.vendor?.basic?.productName ??
          product.shopify?.product?.title ??
          "Unnamed Product",

        category:
          product.vendor?.basic?.category ??
          product.shopify?.product?.category ??
          "—",

        description:
          product.vendor?.basic?.description ??
          product.shopify?.product?.descriptionHtml ??
          "",
      },

      pricing: {
        selectedPlan:
          product.vendor?.pricing?.selectedPlan ??
          product.shopify?.shopifyData?.metafields?.plan ??
          "default",

        price: Number(
          product.vendor?.pricing?.price ??
          product.shopify?.shopifyData?.variants?.[0]?.price ??
          0
        ),
      },
    }));

    /* ================= RESPONSE ================= */

    res.json({
      success: true,
      count: normalizedProducts.length,
      data: normalizedProducts,
    });
  } catch (error: any) {
    console.error("Rejected products error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch rejected products",
    });
  }
});


/**
 * GET /api/products/on-hold
 * Fetch on-hold products
 */
router.get("/on-hold", async (req, res) => {
  const filterQuery = firestore
    .collection("products")
    .where("lifecycleStatus", "==", "on-hold");
  const orderedQuery = filterQuery.orderBy("createdAt", "desc");

  return await sendPaginatedAdminProductsResponse({
    req,
    res,
    filterQuery,
    orderedQuery,
    errorMessage: "Failed to fetch on-hold products",
  });
  try {
    const snapshot = await firestore
      .collection("products")
      .where("lifecycleStatus", "==", "on-hold")
      .orderBy("createdAt", "desc")
      .get();

    const products: FirestoreProduct[] = snapshot.docs.map((doc) => {
      const data = doc.data() as FirestoreProductData;

      return {
        id: doc.id,
        ...data,
      };
    });


    const enrichedProducts = await enrichProductsWithVendors(products);
    const normalizedProducts = enrichedProducts.map((product: any) => ({
      id: product.id,
      vendorId: product.vendorId,

      // ✅ ALWAYS SHOW BUSINESS NAME
      businessName: product.vendorResolved.businessName,

      status: product.lifecycleStatus,

      shopifyProductURL: product.shopify?.shopifyProductURL ?? null,

      vendor: {
        basic: {
          subCategoryName: product.vendor?.basic?.subCategoryName ?? "-",
        },
      },

      // ✅ ALWAYS SHOW PRODUCT NAME
      basic: {
        productName:
          product.vendor?.basic?.productName ??
          product.shopify?.product?.title ??
          "Unnamed Product",

        category:
          product.vendor?.basic?.category ??
          product.shopify?.product?.category ??
          "—",

        description:
          product.vendor?.basic?.description ??
          product.shopify?.product?.descriptionHtml ??
          "",
      },

      pricing: {
        selectedPlan:
          product.vendor?.pricing?.selectedPlan ??
          product.shopify?.shopifyData?.metafields?.plan ??
          "default",

        price: Number(
          product.vendor?.pricing?.price ??
          product.shopify?.shopifyData?.variants?.[0]?.price ??
          0
        ),
      },
    }));

    /* ================= RESPONSE ================= */

    res.json({
      success: true,
      count: normalizedProducts.length,
      data: normalizedProducts,
    });
  } catch (error: any) {
    console.error("On-hold products error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch on-hold products",
    });
  }
});



/**
 * POST /api/products/:id/decision
 * Approve or reject a product
 */
router.post("/:id/decision", async (req, res) => {
  try {
    const { id } = req.params;
    const { decision } = req.body; // "approve" | "reject"

    if (!["approve", "reject"].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: "Invalid decision",
      });
    }

    const productRef = firestore.collection("products").doc(id);

    const updatePayload: any = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (decision === "approve") {

      updatePayload.lifecycleStatus = "active";

      // Shopify product will be created via /status route
      updatePayload["shopify.shopifyStatus"] = "draft";

      updatePayload.approvedAt =
        admin.firestore.FieldValue.serverTimestamp();
      updatePayload["verification.isProductActive"] = true;
      updatePayload["verification.productVerified"] = true;
    }

    if (decision === "reject") {
      updatePayload.status = "rejected";

      updatePayload.lifecycleStatus = "rejected";
      updatePayload["shopify.shopifyStatus"] = "draft";

      updatePayload.rejectedAt = admin.firestore.FieldValue.serverTimestamp();
      updatePayload["verification.isProductActive"] = false;
    }

    await productRef.update(updatePayload);

    res.json({
      success: true,
      message: `Product ${decision}d successfully`,
    });
  } catch (error: any) {
    console.error("Decision error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Decision failed",
    });
  }
});


/**
 * POST /api/products/:id/status
 * Update product status (admin)
 */
router.post("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { lifecycleStatus } = req.body;
    console.log("STATUS API HIT:", id, lifecycleStatus);

    const allowedLifecycleStatuses = [
      "pending",
      "active",
      "rejected",
      "on-hold",
    ];

    if (!allowedLifecycleStatuses.includes(lifecycleStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid lifecycleStatus value",
      });
    }

    const productRef = firestore
      .collection("products")
      .doc(id);

    const productSnap = await productRef.get();

    if (!productSnap.exists) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const baseProduct: FirestoreProduct = {
      id: productSnap.id,
      ...(productSnap.data() as FirestoreProductData),
    };

    const previousLifecycleStatus =
  baseProduct.lifecycleStatus ?? "pending";
    const previousShopifyStatus =
      baseProduct.shopify?.shopifyStatus ?? "draft";
    const existingShopifyProductId =
      baseProduct.shopify?.productId ??
      baseProduct.shopifyProductId ??
      (baseProduct.shopify as any)?.identifiers?.productId ??
      null;
    const numericShopifyProductId = existingShopifyProductId
      ? parseShopifyProductId(existingShopifyProductId)
      : null;
    const shopifyApiStatus: "active" | "draft" =
  lifecycleStatus === "active" ? "active" : "draft";

    if (
      previousLifecycleStatus === lifecycleStatus &&
      previousShopifyStatus === shopifyApiStatus &&
      (lifecycleStatus !== "active" || Boolean(numericShopifyProductId))
    ) {
      return res.json({
        success: true,
        message: `Product lifecycle already ${lifecycleStatus}`,
      });
    }

  const shouldSyncWithShopify =
  lifecycleStatus === "active" ||
  previousLifecycleStatus === "active";

    /* ================= ACTIVE (SHOPIFY FIRST) ================= */
    
     if (shouldSyncWithShopify){
      try {

        console.log("Attempting Shopify sync for product:", id);
        if (!numericShopifyProductId) {
          const missingShopifyMessage =
            "Shopify product is missing for this item. Please create/sync it from vendor_portal first.";

          await productRef.update({
            "shopify.lastError": missingShopifyMessage,
          });

          return res.status(400).json({
            success: false,
            message: missingShopifyMessage,
          });
        }

        const normalizedProduct = {
          ...baseProduct,

          basic: {
            productName:
              baseProduct.vendor?.basic?.productName ?? "",
            category:
              baseProduct.vendor?.basic?.category ?? "",
            description:
              baseProduct.vendor?.basic?.description ?? "",
          },

          features: baseProduct.vendor?.features ?? [],

          pricing: baseProduct.vendor?.pricing ?? {},

          media: baseProduct.vendor?.media ?? {},
        };



        const shopifyResult =
          await syncProductWithShopify({
            product: {
              ...normalizedProduct,
              shopify: {
                ...normalizedProduct.shopify,
                productId: numericShopifyProductId,
              },
            },
            shopifyApiStatus,
            allowCreate: false,
          });

        const nextHandle =
          baseProduct.shopify?.handle ??
          baseProduct.shopifyHandle ??
          shopifyResult.handle ??
          (await getShopifyProductHandle(numericShopifyProductId));
        const storefrontProductUrl = getStorefrontProductUrl(nextHandle);

        await productRef.update({
          status: lifecycleStatus,
          lifecycleStatus,
          source: baseProduct.source ?? "vendor",
          ownership: {
            claimed: true,
            claimedByVendorId: baseProduct.vendorId,
            claimedAt:
              baseProduct.ownership?.claimedAt ??
              admin.firestore.FieldValue.serverTimestamp(),
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          "verification.isProductActive": true,
          "verification.productVerified": true,
          "shopify.productId":
            numericShopifyProductId,
          "shopify.graphqlId":
            baseProduct.shopify?.graphqlId ??
            shopifyResult.shopifyGraphqlId ??
            null,
          "shopify.handle": nextHandle,
          "shopify.shopifyProductURL": storefrontProductUrl,
          "shopify.shopifyProductUrl": storefrontProductUrl,
          "shopify.shopifyStatus": "active",
          "shopify.syncAction": shopifyResult.action,
          "shopify.syncedAt": admin.firestore.FieldValue.serverTimestamp(),
          "shopify.lastError": admin.firestore.FieldValue.delete(),
          shopifyProductId: numericShopifyProductId,
          shopifyHandle: nextHandle,
          shopifyProductURL: storefrontProductUrl,
          shopifyProductUrl: storefrontProductUrl,
          shopifyStatus: "active",
        });

        console.log("Shopify sync SUCCESS:", shopifyResult);

        console.log("Sending SUCCESS response");

        return res.json({
          success: true,
          message: "Product activated successfully",
        });
      } catch (err: any) {
        console.log("Shopify sync FAILED (caught):", err.message);
        console.error(
          "Shopify activation failed:",
          err.message
        );

        await productRef.update({
          "shopify.lastError": err.message,
        });

        console.log("Sending FAILURE response");
        return res.status(400).json({
          success: false,
          message: err.message,
        });
      }
    }

    /* ================= NON-ACTIVE ================= */

    const shopifyResult = await syncProductWithShopify({
      product: baseProduct,
      shopifyApiStatus,
    });

    await productRef.update({
      status: lifecycleStatus,
      lifecycleStatus,
      "shopify.shopifyStatus":
        shopifyApiStatus === "active" ? "active" : "draft",
      "shopify.syncAction": shopifyResult.action,
      "shopify.syncedAt": admin.firestore.FieldValue.serverTimestamp(),
      "shopify.lastError": admin.firestore.FieldValue.delete(),
      shopifyStatus: shopifyApiStatus === "active" ? "active" : "draft",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 🔑 Shopify sync only when product already exists OR needs unlisting
    // try {
    //   const refreshedSnap = await productRef.get();
    //   const refreshedProduct = {
    //     id: refreshedSnap.id,
    //     ...(refreshedSnap.data() as FirestoreProductData),
    //   };

    //   await syncProductWithShopify({
    //     product: refreshedProduct,
    //     shopifyApiStatus,
    //   });
    // } catch (err) {
    //   console.error("Shopify sync failed:", err);
    // }


    console.log("Sending SUCCESS response");
    return res.json({
      success: true,
      message: `Product lifecycle updated to ${lifecycleStatus}`,
    });
  } catch (error: any) {
    console.error("Status update error:", error);
    console.log("Sending FAILURE response");
    res.status(500).json({
      success: false,
      message:
        error.message ||
        "Status update failed",
    });
  }
});


/**
 * GET /api/products/import/shopify/status
 * Fetch the live Shopify import progress
 */
router.get("/import/shopify/status", async (_req, res) => {
  res.json({
    success: true,
    data: getProductsSyncProgress(),
  });
});

/**
 * GET /api/products/import/shopify/logs
 * Fetch persisted Shopify import logs
 */
router.get("/import/shopify/logs", async (_req, res) => {
  try {
    const logs = await getProductsSyncLogs();

    res.json({
      success: true,
      data: logs,
    });
  } catch (error: any) {
    console.error(
      "Products sync logs fetch error:",
      error
    );
    res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to fetch sync logs",
    });
  }
});

/**
 * POST /api/products/import/shopify
 * Import existing Shopify products into Firestore
 */
router.post("/import/shopify", async (_req, res) => {
  if (isProductsSyncRunning()) {
    res.status(409).json({
      success: false,
      message:
        "A Shopify sync is already running. Please wait for it to finish.",
      progress: getProductsSyncProgress(),
    });
    return;
  }

  startProductsSyncProgress();

  try {
    const result =
      await importShopifyProductsToFirestore({
        onProgress: async (progress) => {
          updateProductsSyncProgress({
            status: "running",
            totalProducts: progress.totalProducts,
            processedProducts:
              progress.processedProducts,
            imported: progress.imported,
            skipped: progress.skipped,
            message: progress.message,
          });
        },
      });

    completeProductsSyncProgress(
      "Shopify sync completed."
    );

    const log = await createProductsSyncLog({
      imported: result.imported,
      skipped: result.skipped,
      status: "success",
      message: "Shopify products imported",
    });

    res.json({
      success: true,
      message: "Shopify products imported",
      data: result,
      log,
    });
  } catch (error: any) {
    console.error("Shopify import error:", error);
    const failedProgress =
      failProductsSyncProgress(
        error.message || "Shopify import failed"
      );
    let log = null;

    try {
      log = await createProductsSyncLog({
        imported: failedProgress.imported,
        skipped: failedProgress.skipped,
        status: "error",
        message:
          error.message || "Shopify import failed",
      });
    } catch (logError) {
      console.error(
        "Products sync log save error:",
        logError
      );
    }

    res.status(500).json({
      success: false,
      message:
        error.message || "Shopify import failed",
      log,
      progress: failedProgress,
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const confirmationName =
      typeof req.body?.confirmationName === "string"
        ? req.body.confirmationName
        : "";
    const result = await deleteProductEverywhere({
      productId: req.params.id,
      confirmationName,
    });

    res.json({
      success: true,
      message:
        result.warnings.length > 0
          ? `Product "${result.deletedProductName}" deleted with warnings`
          : `Product "${result.deletedProductName}" deleted successfully`,
      data: result,
    });
  } catch (error: any) {
    const message = error.message || "Failed to delete product";
    const status =
      message === "Product not found"
        ? 404
        : message === "Product name confirmation is required" ||
            message === "Typed product name does not match exactly"
          ? 400
          : 500;

    console.error("Failed to delete product", error);
    res.status(status).json({
      success: false,
      message,
    });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      res.status(400).json({
        success: false,
        message: "Invalid product payload",
      });
      return;
    }

    const productRef = firestore.collection("products").doc(req.params.id);
    const existingProduct = await productRef.get();

    if (!existingProduct.exists) {
      res.status(404).json({
        success: false,
        message: "Product not found",
      });
      return;
    }

    const existingProductData =
      existingProduct.data() as FirestoreProductData;
    const sanitizedPayload = sanitizeUpdatePayload(
      req.body
    ) as Record<string, unknown>;

    const mergedProduct = {
      id: existingProduct.id,
      ...(mergeDeep(existingProductData, sanitizedPayload) as Record<string, unknown>),
    } as FirestoreProduct;

    const [enrichedProductForSync] = await enrichProductsWithVendors([mergedProduct]);
    const desiredShopifyStatus =
      enrichedProductForSync?.shopify?.shopifyStatus === "active" ||
      enrichedProductForSync?.lifecycleStatus === "active"
        ? "active"
        : "draft";

    const shouldSyncShopify =
      Boolean(enrichedProductForSync?.shopify?.productId) ||
      desiredShopifyStatus === "active";

    let shopifySyncResult:
      | Awaited<ReturnType<typeof syncProductWithShopify>>
      | null = null;

    if (shouldSyncShopify) {
      shopifySyncResult = await syncProductWithShopify({
        product: enrichedProductForSync,
        shopifyApiStatus: desiredShopifyStatus,
      });
    }

    const nextHandle =
      shopifySyncResult?.handle ??
      enrichedProductForSync?.shopify?.handle ??
      enrichedProductForSync?.shopify?.identifiers?.handle ??
      null;

    const nextShopifyState = shouldSyncShopify
      ? {
          ...(isRecord(existingProductData.shopify) ? existingProductData.shopify : {}),
          ...(isRecord(enrichedProductForSync?.shopify) ? enrichedProductForSync.shopify : {}),
          ...(shopifySyncResult?.shopifyProductId
            ? { productId: shopifySyncResult.shopifyProductId }
            : {}),
          ...(shopifySyncResult?.shopifyGraphqlId
            ? { graphqlId: shopifySyncResult.shopifyGraphqlId }
            : {}),
          ...(nextHandle ? { handle: nextHandle } : {}),
          shopifyStatus: desiredShopifyStatus,
          syncAction: shopifySyncResult?.action ?? "updated",
          syncedAt: admin.firestore.FieldValue.serverTimestamp(),
          ...(nextHandle
            ? {
                shopifyProductURL: `https://${process.env.SHOPIFY_STORE_DOMAIN}/products/${nextHandle}`,
              }
            : {}),
        }
      : null;

    await productRef.set(
      {
        ...sanitizedPayload,
        ...(nextShopifyState ? { shopify: nextShopifyState } : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    if (shouldSyncShopify) {
      await productRef.update({
        "shopify.lastError": admin.firestore.FieldValue.delete(),
      });
    }

    const updatedSnapshot = await productRef.get();
    const updatedProduct: FirestoreProduct = {
      id: updatedSnapshot.id,
      ...(updatedSnapshot.data() as FirestoreProductData),
    };

    const [enrichedProduct] = await enrichProductsWithVendors([updatedProduct]);
    const normalizedProduct = normalizeFirestoreValue(
      enrichedProduct ?? updatedProduct
    ) as Record<string, unknown>;

    res.json({
      success: true,
      message:
        shouldSyncShopify && shopifySyncResult
          ? `Product updated successfully and Shopify ${shopifySyncResult.action}`
          : "Product updated successfully",
      data: {
        ...normalizedProduct,
        businessName:
          enrichedProduct?.vendorResolved?.businessName ?? null,
        claimedByBusinessName:
          enrichedProduct?.vendorResolved?.claimedByBusinessName ?? null,
      },
    });
  } catch (error: any) {
    console.error("Failed to update product:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update product",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const snapshot = await firestore
      .collection("products")
      .doc(id)
      .get();

    if (!snapshot.exists) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const product: FirestoreProduct = {
      id: snapshot.id,
      ...(snapshot.data() as FirestoreProductData),
    };

    const [enrichedProduct] =
      await enrichProductsWithVendors([product]);

    res.json({
      success: true,
      data: {
        ...enrichedProduct,
        businessName:
          enrichedProduct?.vendorResolved
            ?.businessName ?? null,
      },
    });
  } catch (error: any) {
    console.error(
      "Product details error:",
      error
    );
    res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to fetch product details",
    });
  }
});


export default router;



