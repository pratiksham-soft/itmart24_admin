import admin from "firebase-admin";
import { firestore } from "../config/firebase";
import { fetchDashboardCollections } from "./dashboard.service";
import { shopifyGraphQL, shopifyRest } from "./shopifyHttp";

type TimestampLike =
  | admin.firestore.Timestamp
  | Date
  | string
  | number
  | {
      seconds?: number;
      _seconds?: number;
      toDate?: () => Date;
      toMillis?: () => number;
    }
  | null
  | undefined;

type SubscriptionRecord = {
  id: string;
  vendorId?: string;
  productId?: string;
  plan?: {
    planId?: string;
    planName?: string;
    price?: number;
  };
  payment?: {
    status?: string;
    amount?: number | string;
  };
  status?: string;
  startDate?: TimestampLike;
  endDate?: TimestampLike;
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
};

type ProductDeletionRecord = {
  id: string;
  vendorId?: string;
  lifecycleStatus?: string;
  shopifyStatus?: string;
  shopifyProductId?: number | string | null;
  shopifyHandle?: string | null;
  shopifyProductURL?: string | null;
  status?: string;
  basic?: {
    productName?: string;
    category?: string;
    description?: string;
  };
  vendor?: {
    basic?: {
      productName?: string;
      category?: string;
      subCategoryName?: string;
      description?: string;
    };
    pricing?: {
      selectedPlan?: string;
    };
    media?: {
      thumbnailUrl?: string;
      shopifyFileId?: string;
      gallery?: Array<{
        url?: string;
        shopifyFileId?: string;
      }>;
    };
  };
  ownership?: {
    claimedByVendorId?: string | null;
  };
  shopify?: {
    productId?: number | string | null;
    handle?: string | null;
    shopifyProductURL?: string | null;
    shopifyProductUrl?: string | null;
    shopifyStatus?: string | null;
  };
  product?: {
    title?: string;
    handle?: string | null;
    category?: string;
    shopifyProductURL?: string | null;
  };
  media?: {
    thumbnailUrl?: string;
    shopifyFileId?: string;
    gallery?: Array<{
      url?: string;
      shopifyFileId?: string;
    }>;
  };
  [key: string]: unknown;
};

type ActiveSubscriptionSummary = {
  hasActiveSubscription: boolean;
  activeSubscriptionCount: number;
  activeSubscriptionMessage: string | null;
};

type ShopifyMediaNode = {
  id: string;
  imageUrl: string;
};

type ShopifyProductMediaResponse = {
  data?: {
    data?: {
      product?: {
        media?: ShopifyProductMediaConnection;
      };
    };
  };
};

type ShopifyProductMediaConnection = {
  nodes?: Array<{
    __typename?: string;
    id?: string;
    image?: {
      url?: string;
    };
  }>;
  pageInfo?: {
    hasNextPage?: boolean;
    endCursor?: string | null;
  };
};

type ShopifyFileCandidate = {
  fileId: string | null;
  url: string;
  source: string;
};

type ProductDeletionResult = {
  deletedProductId: string;
  deletedProductName: string;
  shopifyDeleted: boolean;
  localDeleted: boolean;
  warnings: string[];
  deletedMediaCount: number;
  deletedFileIds: string[];
  skippedFileUrls: string[];
  activeSubscription: ActiveSubscriptionSummary;
};

const PENDING_SUBSCRIPTION_STATUSES = new Set(["pending", "payment_failed"]);
const INACTIVE_SUBSCRIPTION_STATUSES = new Set([
  "expired",
  "cancelled",
  "replaced",
  "refunded",
  "inactive",
]);

const normalizeText = (value: unknown) => String(value ?? "").trim();

const toDate = (value: TimestampLike): Date | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate();
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value.toDate === "function") {
    const parsed = value.toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value.toMillis === "function") {
    const parsed = new Date(value.toMillis());
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value.seconds === "number") {
    return new Date(value.seconds * 1000);
  }

  if (typeof value._seconds === "number") {
    return new Date(value._seconds * 1000);
  }

  return null;
};

const getSubscriptionLifecycle = (
  subscription: SubscriptionRecord,
  now = new Date()
) => {
  const normalizedStatus = normalizeText(subscription.status).toLowerCase();
  const endDate = toDate(subscription.endDate);

  if (normalizedStatus === "active" && endDate && endDate < now) {
    return "inactive";
  }

  if (normalizedStatus === "active") {
    return "active";
  }

  if (PENDING_SUBSCRIPTION_STATUSES.has(normalizedStatus)) {
    return "pending";
  }

  if (INACTIVE_SUBSCRIPTION_STATUSES.has(normalizedStatus) || normalizedStatus) {
    return "inactive";
  }

  return "inactive";
};

const getSubscriptionSortDate = (subscription: SubscriptionRecord) =>
  toDate(subscription.updatedAt) ??
  toDate(subscription.createdAt) ??
  toDate(subscription.startDate) ??
  toDate(subscription.endDate) ??
  new Date(0);

const toProductName = (product: ProductDeletionRecord) =>
  normalizeText(
    product.vendor?.basic?.productName ??
      product.basic?.productName ??
      product.product?.title ??
      product.id
  );

const toCategoryName = (product: ProductDeletionRecord) =>
  normalizeText(
    product.vendor?.basic?.category ??
      product.basic?.category ??
      product.product?.category ??
      ""
  );

const toShopifyProductId = (product: ProductDeletionRecord) => {
  const rawValue =
    product.shopify?.productId ??
    product.shopifyProductId ??
    null;
  const numericId =
    typeof rawValue === "number"
      ? rawValue
      : Number(String(rawValue ?? "").split("/").pop());

  return Number.isFinite(numericId) && numericId > 0 ? numericId : null;
};

const cleanComparableUrl = (value: unknown) => {
  const trimmed = normalizeText(value);

  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return trimmed;
  }
};

const toUniqueValues = (values: Array<string | null | undefined>) =>
  [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))];

const collectProductReferenceKeys = (product: ProductDeletionRecord) =>
  new Set(
    toUniqueValues([
      product.id,
      toShopifyProductId(product)?.toString(),
    ])
  );

const resolveActiveSubscriptionSummary = (
  product: ProductDeletionRecord,
  subscriptions: SubscriptionRecord[]
): ActiveSubscriptionSummary => {
  const referenceKeys = collectProductReferenceKeys(product);
  const vendorKeys = new Set(
    toUniqueValues([
      product.vendorId,
      product.ownership?.claimedByVendorId ?? undefined,
    ])
  );
  const latestByKey = new Map<string, SubscriptionRecord>();

  subscriptions.forEach((subscription) => {
    const subscriptionProductId = normalizeText(subscription.productId);

    if (!referenceKeys.has(subscriptionProductId)) {
      return;
    }

    const subscriptionVendorId = normalizeText(subscription.vendorId);
    if (vendorKeys.size > 0 && subscriptionVendorId && !vendorKeys.has(subscriptionVendorId)) {
      return;
    }

    const key = `${subscriptionVendorId}:${subscriptionProductId}`;
    const existing = latestByKey.get(key);

    if (!existing || getSubscriptionSortDate(subscription) > getSubscriptionSortDate(existing)) {
      latestByKey.set(key, subscription);
    }
  });

  const activeSubscriptions = Array.from(latestByKey.values()).filter(
    (subscription) => getSubscriptionLifecycle(subscription) === "active"
  );

  if (activeSubscriptions.length === 0) {
    return {
      hasActiveSubscription: false,
      activeSubscriptionCount: 0,
      activeSubscriptionMessage: null,
    };
  }

  const planNames = toUniqueValues(
    activeSubscriptions.map((subscription) => subscription.plan?.planName)
  );

  return {
    hasActiveSubscription: true,
    activeSubscriptionCount: activeSubscriptions.length,
    activeSubscriptionMessage:
      planNames.length > 0
        ? `Active subscription found: ${planNames.join(", ")}`
        : "Active subscription found for this product.",
  };
};

export const buildActiveSubscriptionLookup = async (
  products: ProductDeletionRecord[]
) => {
  const { subscriptions } = await fetchDashboardCollections();
  const lookup = new Map<string, ActiveSubscriptionSummary>();

  products.forEach((product) => {
    lookup.set(product.id, resolveActiveSubscriptionSummary(product, subscriptions));
  });

  return lookup;
};

export const getActiveSubscriptionSummaryForProduct = async (
  product: ProductDeletionRecord
) => {
  const { subscriptions } = await fetchDashboardCollections();
  return resolveActiveSubscriptionSummary(product, subscriptions);
};

const toProductGid = (productId: number | string) =>
  `gid://shopify/Product/${productId}`;

const isShopifyNotFoundError = (error: unknown) =>
  Boolean(
    (error as { response?: { status?: number } })?.response?.status === 404
  );

const fetchShopifyProductMedia = async (shopifyProductId: number) => {
  const media: ShopifyMediaNode[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response: ShopifyProductMediaResponse = await shopifyGraphQL.post("", {
      query: `
        query ProductMediaForDelete($id: ID!, $first: Int!, $after: String) {
          product(id: $id) {
            media(first: $first, after: $after) {
              nodes {
                __typename
                ... on MediaImage {
                  id
                  image {
                    url
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      `,
      variables: {
        id: toProductGid(shopifyProductId),
        first: 50,
        after: cursor,
      },
    });

    const connection: ShopifyProductMediaConnection | undefined =
      response.data?.data?.product?.media;
    const nodes = Array.isArray(connection?.nodes) ? connection.nodes : [];

    nodes.forEach((node: any) => {
      if (node?.__typename === "MediaImage" && node?.id) {
        media.push({
          id: String(node.id),
          imageUrl: normalizeText(node?.image?.url),
        });
      }
    });

    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage);
    cursor = connection?.pageInfo?.endCursor ?? null;
  }

  return media;
};

const deleteShopifyProductMedia = async (
  shopifyProductId: number,
  mediaIds: string[]
) => {
  if (mediaIds.length === 0) {
    return 0;
  }

  let deletedCount = 0;
  const chunks: string[][] = [];

  for (let index = 0; index < mediaIds.length; index += 20) {
    chunks.push(mediaIds.slice(index, index + 20));
  }

  for (const chunk of chunks) {
    const response = await shopifyGraphQL.post("", {
      query: `
        mutation DeleteProductMedia($productId: ID!, $mediaIds: [ID!]!) {
          productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
            deletedMediaIds
            mediaUserErrors {
              field
              message
            }
          }
        }
      `,
      variables: {
        productId: toProductGid(shopifyProductId),
        mediaIds: chunk,
      },
    });

    const errors =
      response.data?.data?.productDeleteMedia?.mediaUserErrors ?? [];

    if (errors.length > 0) {
      throw new Error(
        errors.map((error: { message?: string }) => error.message).filter(Boolean).join(", ") ||
          "Failed to delete Shopify product media"
      );
    }

    const deletedIds = response.data?.data?.productDeleteMedia?.deletedMediaIds ?? [];
    deletedCount += Array.isArray(deletedIds) ? deletedIds.length : 0;
  }

  return deletedCount;
};

const fetchShopifyLogoMetafieldUrl = async (shopifyProductId: number) => {
  const response = await shopifyRest.get(`/products/${shopifyProductId}/metafields.json`);
  const metafields = Array.isArray(response.data?.metafields)
    ? response.data.metafields
    : [];
  const logoMetafield = metafields.find(
    (metafield: any) =>
      metafield?.namespace === "custom" && metafield?.key === "logo_image"
  );

  return normalizeText(logoMetafield?.value);
};

const findShopifyFileIdByUrl = async (url: string) => {
  const comparableUrl = cleanComparableUrl(url);

  if (!comparableUrl) {
    return null;
  }

  let basename = "";

  try {
    basename = new URL(comparableUrl).pathname.split("/").pop() ?? "";
  } catch {
    return null;
  }

  if (!basename) {
    return null;
  }

  const response = await shopifyGraphQL.post("", {
    query: `
      query FindDeleteCandidateFile($first: Int!, $query: String!) {
        files(first: $first, query: $query) {
          nodes {
            __typename
            ... on MediaImage {
              id
              image {
                url
              }
            }
            ... on GenericFile {
              id
              url
            }
          }
        }
      }
    `,
    variables: {
      first: 20,
      query: basename,
    },
  });

  const nodes = Array.isArray(response.data?.data?.files?.nodes)
    ? response.data.data.files.nodes
    : [];

  for (const node of nodes) {
    const nodeUrl =
      normalizeText(node?.image?.url) || normalizeText(node?.url);

    if (cleanComparableUrl(nodeUrl) === comparableUrl) {
      return normalizeText(node?.id) || null;
    }
  }

  return null;
};

const collectCandidateFiles = async (
  product: ProductDeletionRecord,
  shopifyProductId: number | null
) => {
  const candidates = new Map<string, ShopifyFileCandidate>();
  const addCandidate = (
    url: string | null | undefined,
    fileId: string | null | undefined,
    source: string
  ) => {
    const normalizedUrl = cleanComparableUrl(url);
    const normalizedFileId = normalizeText(fileId) || null;

    if (!normalizedUrl && !normalizedFileId) {
      return;
    }

    const key = normalizedFileId ?? normalizedUrl;
    candidates.set(key, {
      fileId: normalizedFileId,
      url: normalizedUrl,
      source,
    });
  };

  addCandidate(
    product.vendor?.media?.thumbnailUrl ?? product.media?.thumbnailUrl,
    product.vendor?.media?.shopifyFileId ?? product.media?.shopifyFileId,
    "product thumbnail"
  );

  const galleryItems = [
    ...(Array.isArray(product.vendor?.media?.gallery)
      ? product.vendor?.media?.gallery
      : []),
    ...(Array.isArray(product.media?.gallery) ? product.media?.gallery : []),
  ];

  galleryItems.forEach((galleryItem) => {
    addCandidate(galleryItem?.url, galleryItem?.shopifyFileId, "product gallery");
  });

  if (shopifyProductId) {
    try {
      const logoUrl = await fetchShopifyLogoMetafieldUrl(shopifyProductId);

      if (logoUrl) {
        addCandidate(logoUrl, await findShopifyFileIdByUrl(logoUrl), "custom.logo_image");
      }
    } catch (error) {
      addCandidate("", "", `custom.logo_image lookup failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  return Array.from(candidates.values());
};

const countFirestoreFileReferences = async (
  fileId: string | null,
  url: string,
  currentProductId: string
) => {
  const normalizedUrl = cleanComparableUrl(url);
  const normalizedFileId = normalizeText(fileId);
  let referenceCount = 0;

  const [productSnapshot, vendorSnapshot] = await Promise.all([
    firestore
      .collection("products")
      .select("vendor.media.thumbnailUrl", "vendor.media.shopifyFileId", "media.thumbnailUrl", "media.shopifyFileId")
      .get(),
    firestore
      .collection("vendor_profile")
      .select("media.companyLogo.url", "media.companyLogo.shopifyFileId", "media.coverPhoto.url", "media.coverPhoto.shopifyFileId")
      .get(),
  ]);

  productSnapshot.docs.forEach((doc) => {
    if (doc.id === currentProductId) {
      return;
    }

    const data = doc.data() as any;
    const candidateUrls = [
      cleanComparableUrl(data?.vendor?.media?.thumbnailUrl),
      cleanComparableUrl(data?.media?.thumbnailUrl),
    ].filter(Boolean);
    const candidateFileIds = [
      normalizeText(data?.vendor?.media?.shopifyFileId),
      normalizeText(data?.media?.shopifyFileId),
    ].filter(Boolean);

    if (
      (normalizedUrl && candidateUrls.includes(normalizedUrl)) ||
      (normalizedFileId && candidateFileIds.includes(normalizedFileId))
    ) {
      referenceCount += 1;
    }
  });

  vendorSnapshot.docs.forEach((doc) => {
    const data = doc.data() as any;
    const candidateUrls = [
      cleanComparableUrl(data?.media?.companyLogo?.url),
      cleanComparableUrl(data?.media?.coverPhoto?.url),
    ].filter(Boolean);
    const candidateFileIds = [
      normalizeText(data?.media?.companyLogo?.shopifyFileId),
      normalizeText(data?.media?.coverPhoto?.shopifyFileId),
    ].filter(Boolean);

    if (
      (normalizedUrl && candidateUrls.includes(normalizedUrl)) ||
      (normalizedFileId && candidateFileIds.includes(normalizedFileId))
    ) {
      referenceCount += 1;
    }
  });

  return referenceCount;
};

const deleteShopifyFiles = async (fileIds: string[]) => {
  if (fileIds.length === 0) {
    return [];
  }

  const response = await shopifyGraphQL.post("", {
    query: `
      mutation DeleteProductFiles($fileIds: [ID!]!) {
        fileDelete(fileIds: $fileIds) {
          deletedFileIds
          userErrors {
            message
          }
        }
      }
    `,
    variables: {
      fileIds,
    },
  });

  const errors = response.data?.data?.fileDelete?.userErrors ?? [];

  if (errors.length > 0) {
    throw new Error(
      errors.map((error: { message?: string }) => error.message).filter(Boolean).join(", ") ||
        "Failed to delete Shopify files"
    );
  }

  const deletedFileIds = response.data?.data?.fileDelete?.deletedFileIds ?? [];
  return Array.isArray(deletedFileIds)
    ? deletedFileIds.map((value: unknown) => normalizeText(value)).filter(Boolean)
    : [];
};

export const deleteProductEverywhere = async ({
  productId,
  confirmationName,
}: {
  productId: string;
  confirmationName: string;
}): Promise<ProductDeletionResult> => {
  const productRef = firestore.collection("products").doc(productId);
  const snapshot = await productRef.get();

  if (!snapshot.exists) {
    throw new Error("Product not found");
  }

  const product = {
    ...(snapshot.data() as ProductDeletionRecord),
    id: snapshot.id,
  } satisfies ProductDeletionRecord;
  const expectedConfirmationName = toProductName(product);

  if (!normalizeText(confirmationName)) {
    throw new Error("Product name confirmation is required");
  }

  if (confirmationName !== expectedConfirmationName) {
    throw new Error("Typed product name does not match exactly");
  }

  const activeSubscription = await getActiveSubscriptionSummaryForProduct(product);
  const shopifyProductId = toShopifyProductId(product);
  const warnings: string[] = [];
  const deletedFileIds: string[] = [];
  const skippedFileUrls: string[] = [];
  let deletedMediaCount = 0;
  let shopifyDeleted = false;

  if (shopifyProductId) {
    let productExistsInShopify = true;

    try {
      await shopifyRest.get(`/products/${shopifyProductId}.json`, {
        params: { fields: "id,title,handle" },
      });
    } catch (error) {
      if (isShopifyNotFoundError(error)) {
        productExistsInShopify = false;
        warnings.push("Shopify product was already missing. Continued with local deletion.");
      } else {
        throw error;
      }
    }

    if (productExistsInShopify) {
      try {
        const media = await fetchShopifyProductMedia(shopifyProductId);
        deletedMediaCount = await deleteShopifyProductMedia(
          shopifyProductId,
          media.map((item) => item.id)
        );
      } catch (error) {
        warnings.push(
          `Shopify product media cleanup was only partially completed: ${
            error instanceof Error ? error.message : "Unknown media delete error"
          }`
        );
      }

      try {
        const candidateFiles = await collectCandidateFiles(product, shopifyProductId);
        const safeFileIdsToDelete: string[] = [];

        for (const candidate of candidateFiles) {
          if (!candidate.fileId && !candidate.url) {
            continue;
          }

          const referenceCount = await countFirestoreFileReferences(
            candidate.fileId,
            candidate.url,
            product.id
          );

          if (referenceCount > 0) {
            if (candidate.url) {
              skippedFileUrls.push(candidate.url);
            }
            warnings.push(
              `Skipped ${candidate.source} file cleanup because it appears to be shared by another record.`
            );
            continue;
          }

          if (!candidate.fileId) {
            if (candidate.url) {
              skippedFileUrls.push(candidate.url);
            }
            warnings.push(
              `Skipped ${candidate.source} file cleanup because a safe Shopify file ID could not be verified.`
            );
            continue;
          }

          safeFileIdsToDelete.push(candidate.fileId);
        }

        const deletedFiles = await deleteShopifyFiles(toUniqueValues(safeFileIdsToDelete));
        deletedFileIds.push(...deletedFiles);
      } catch (error) {
        warnings.push(
          `Shopify file cleanup was only partially completed: ${
            error instanceof Error ? error.message : "Unknown file delete error"
          }`
        );
      }

      await shopifyRest.delete(`/products/${shopifyProductId}.json`);
      shopifyDeleted = true;
    }
  }

  try {
    await productRef.delete();
  } catch (error) {
    console.error("Local product deletion failed after Shopify cleanup", {
      productId,
      shopifyProductId,
      error,
    });

    throw new Error(
      shopifyDeleted
        ? "Shopify product deletion succeeded, but local product deletion failed. Check server logs for recovery details."
        : "Failed to delete local product record."
    );
  }

  return {
    deletedProductId: product.id,
    deletedProductName: expectedConfirmationName,
    shopifyDeleted,
    localDeleted: true,
    warnings,
    deletedMediaCount,
    deletedFileIds: toUniqueValues(deletedFileIds),
    skippedFileUrls: toUniqueValues(skippedFileUrls),
    activeSubscription,
  };
};

export const normalizeDeleteListItem = (
  product: ProductDeletionRecord,
  activeSubscription: ActiveSubscriptionSummary
) => {
  const shopifyProductId = toShopifyProductId(product);
  const shopifyHandle =
    normalizeText(product.shopify?.handle) ||
    normalizeText(product.shopifyHandle) ||
    normalizeText(product.product?.handle) ||
    "";
  const shopifyUrl =
    normalizeText(product.shopify?.shopifyProductURL) ||
    normalizeText(product.shopify?.shopifyProductUrl) ||
    normalizeText(product.shopifyProductURL) ||
    normalizeText(product.product?.shopifyProductURL) ||
    "";

  return {
    id: product.id,
    vendorId: normalizeText(product.vendorId),
    businessName: normalizeText(product.vendor?.basic?.subCategoryName) || "",
    shopifyProductURL: shopifyUrl || null,
    vendor: {
      basic: {
        subCategoryName: normalizeText(product.vendor?.basic?.subCategoryName) || "-",
      },
    },
    basic: {
      productName: toProductName(product),
      category: toCategoryName(product) || "-",
      description: normalizeText(product.vendor?.basic?.description ?? product.basic?.description),
    },
    pricing: {
      selectedPlan: normalizeText(product.vendor?.pricing?.selectedPlan) || "default",
      price: 0,
    },
    status: normalizeText(product.lifecycleStatus ?? product.status) || "unknown",
    shopifyStatus:
      normalizeText(product.shopify?.shopifyStatus ?? product.shopifyStatus) || "missing",
    shopifyProductId,
    shopifyHandle: shopifyHandle || null,
    activeSubscription,
  };
};
