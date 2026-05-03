"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeDeleteListItem = exports.deleteProductEverywhere = exports.getActiveSubscriptionSummaryForProduct = exports.buildActiveSubscriptionLookup = void 0;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const firebase_1 = require("../config/firebase");
const dashboard_service_1 = require("./dashboard.service");
const shopifyHttp_1 = require("./shopifyHttp");
const PENDING_SUBSCRIPTION_STATUSES = new Set(["pending", "payment_failed"]);
const INACTIVE_SUBSCRIPTION_STATUSES = new Set([
    "expired",
    "cancelled",
    "replaced",
    "refunded",
    "inactive",
]);
const normalizeText = (value) => String(value ?? "").trim();
const toDate = (value) => {
    if (!value) {
        return null;
    }
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }
    if (value instanceof firebase_admin_1.default.firestore.Timestamp) {
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
const getSubscriptionLifecycle = (subscription, now = new Date()) => {
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
const getSubscriptionSortDate = (subscription) => toDate(subscription.updatedAt) ??
    toDate(subscription.createdAt) ??
    toDate(subscription.startDate) ??
    toDate(subscription.endDate) ??
    new Date(0);
const toProductName = (product) => normalizeText(product.vendor?.basic?.productName ??
    product.basic?.productName ??
    product.product?.title ??
    product.id);
const toCategoryName = (product) => normalizeText(product.vendor?.basic?.category ??
    product.basic?.category ??
    product.product?.category ??
    "");
const toShopifyProductId = (product) => {
    const rawValue = product.shopify?.productId ??
        product.shopifyProductId ??
        null;
    const numericId = typeof rawValue === "number"
        ? rawValue
        : Number(String(rawValue ?? "").split("/").pop());
    return Number.isFinite(numericId) && numericId > 0 ? numericId : null;
};
const cleanComparableUrl = (value) => {
    const trimmed = normalizeText(value);
    if (!trimmed) {
        return "";
    }
    try {
        const url = new URL(trimmed);
        url.hash = "";
        url.search = "";
        return url.toString();
    }
    catch {
        return trimmed;
    }
};
const toUniqueValues = (values) => [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))];
const collectProductReferenceKeys = (product) => new Set(toUniqueValues([
    product.id,
    toShopifyProductId(product)?.toString(),
]));
const resolveActiveSubscriptionSummary = (product, subscriptions) => {
    const referenceKeys = collectProductReferenceKeys(product);
    const vendorKeys = new Set(toUniqueValues([
        product.vendorId,
        product.ownership?.claimedByVendorId ?? undefined,
    ]));
    const latestByKey = new Map();
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
    const activeSubscriptions = Array.from(latestByKey.values()).filter((subscription) => getSubscriptionLifecycle(subscription) === "active");
    if (activeSubscriptions.length === 0) {
        return {
            hasActiveSubscription: false,
            activeSubscriptionCount: 0,
            activeSubscriptionMessage: null,
        };
    }
    const planNames = toUniqueValues(activeSubscriptions.map((subscription) => subscription.plan?.planName));
    return {
        hasActiveSubscription: true,
        activeSubscriptionCount: activeSubscriptions.length,
        activeSubscriptionMessage: planNames.length > 0
            ? `Active subscription found: ${planNames.join(", ")}`
            : "Active subscription found for this product.",
    };
};
const buildActiveSubscriptionLookup = async (products) => {
    const { subscriptions } = await (0, dashboard_service_1.fetchDashboardCollections)();
    const lookup = new Map();
    products.forEach((product) => {
        lookup.set(product.id, resolveActiveSubscriptionSummary(product, subscriptions));
    });
    return lookup;
};
exports.buildActiveSubscriptionLookup = buildActiveSubscriptionLookup;
const getActiveSubscriptionSummaryForProduct = async (product) => {
    const { subscriptions } = await (0, dashboard_service_1.fetchDashboardCollections)();
    return resolveActiveSubscriptionSummary(product, subscriptions);
};
exports.getActiveSubscriptionSummaryForProduct = getActiveSubscriptionSummaryForProduct;
const toProductGid = (productId) => `gid://shopify/Product/${productId}`;
const isShopifyNotFoundError = (error) => Boolean(error?.response?.status === 404);
const fetchShopifyProductMedia = async (shopifyProductId) => {
    const media = [];
    let cursor = null;
    let hasNextPage = true;
    while (hasNextPage) {
        const response = await shopifyHttp_1.shopifyGraphQL.post("", {
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
        const connection = response.data?.data?.product?.media;
        const nodes = Array.isArray(connection?.nodes) ? connection.nodes : [];
        nodes.forEach((node) => {
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
const deleteShopifyProductMedia = async (shopifyProductId, mediaIds) => {
    if (mediaIds.length === 0) {
        return 0;
    }
    let deletedCount = 0;
    const chunks = [];
    for (let index = 0; index < mediaIds.length; index += 20) {
        chunks.push(mediaIds.slice(index, index + 20));
    }
    for (const chunk of chunks) {
        const response = await shopifyHttp_1.shopifyGraphQL.post("", {
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
        const errors = response.data?.data?.productDeleteMedia?.mediaUserErrors ?? [];
        if (errors.length > 0) {
            throw new Error(errors.map((error) => error.message).filter(Boolean).join(", ") ||
                "Failed to delete Shopify product media");
        }
        const deletedIds = response.data?.data?.productDeleteMedia?.deletedMediaIds ?? [];
        deletedCount += Array.isArray(deletedIds) ? deletedIds.length : 0;
    }
    return deletedCount;
};
const fetchShopifyLogoMetafieldUrl = async (shopifyProductId) => {
    const response = await shopifyHttp_1.shopifyRest.get(`/products/${shopifyProductId}/metafields.json`);
    const metafields = Array.isArray(response.data?.metafields)
        ? response.data.metafields
        : [];
    const logoMetafield = metafields.find((metafield) => metafield?.namespace === "custom" && metafield?.key === "logo_image");
    return normalizeText(logoMetafield?.value);
};
const findShopifyFileIdByUrl = async (url) => {
    const comparableUrl = cleanComparableUrl(url);
    if (!comparableUrl) {
        return null;
    }
    let basename = "";
    try {
        basename = new URL(comparableUrl).pathname.split("/").pop() ?? "";
    }
    catch {
        return null;
    }
    if (!basename) {
        return null;
    }
    const response = await shopifyHttp_1.shopifyGraphQL.post("", {
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
        const nodeUrl = normalizeText(node?.image?.url) || normalizeText(node?.url);
        if (cleanComparableUrl(nodeUrl) === comparableUrl) {
            return normalizeText(node?.id) || null;
        }
    }
    return null;
};
const collectCandidateFiles = async (product, shopifyProductId) => {
    const candidates = new Map();
    const addCandidate = (url, fileId, source) => {
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
    addCandidate(product.vendor?.media?.thumbnailUrl ?? product.media?.thumbnailUrl, product.vendor?.media?.shopifyFileId ?? product.media?.shopifyFileId, "product thumbnail");
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
        }
        catch (error) {
            addCandidate("", "", `custom.logo_image lookup failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }
    return Array.from(candidates.values());
};
const countFirestoreFileReferences = async (fileId, url, currentProductId) => {
    const normalizedUrl = cleanComparableUrl(url);
    const normalizedFileId = normalizeText(fileId);
    let referenceCount = 0;
    const [productSnapshot, vendorSnapshot] = await Promise.all([
        firebase_1.firestore
            .collection("products")
            .select("vendor.media.thumbnailUrl", "vendor.media.shopifyFileId", "media.thumbnailUrl", "media.shopifyFileId")
            .get(),
        firebase_1.firestore
            .collection("vendor_profile")
            .select("media.companyLogo.url", "media.companyLogo.shopifyFileId", "media.coverPhoto.url", "media.coverPhoto.shopifyFileId")
            .get(),
    ]);
    productSnapshot.docs.forEach((doc) => {
        if (doc.id === currentProductId) {
            return;
        }
        const data = doc.data();
        const candidateUrls = [
            cleanComparableUrl(data?.vendor?.media?.thumbnailUrl),
            cleanComparableUrl(data?.media?.thumbnailUrl),
        ].filter(Boolean);
        const candidateFileIds = [
            normalizeText(data?.vendor?.media?.shopifyFileId),
            normalizeText(data?.media?.shopifyFileId),
        ].filter(Boolean);
        if ((normalizedUrl && candidateUrls.includes(normalizedUrl)) ||
            (normalizedFileId && candidateFileIds.includes(normalizedFileId))) {
            referenceCount += 1;
        }
    });
    vendorSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const candidateUrls = [
            cleanComparableUrl(data?.media?.companyLogo?.url),
            cleanComparableUrl(data?.media?.coverPhoto?.url),
        ].filter(Boolean);
        const candidateFileIds = [
            normalizeText(data?.media?.companyLogo?.shopifyFileId),
            normalizeText(data?.media?.coverPhoto?.shopifyFileId),
        ].filter(Boolean);
        if ((normalizedUrl && candidateUrls.includes(normalizedUrl)) ||
            (normalizedFileId && candidateFileIds.includes(normalizedFileId))) {
            referenceCount += 1;
        }
    });
    return referenceCount;
};
const deleteShopifyFiles = async (fileIds) => {
    if (fileIds.length === 0) {
        return [];
    }
    const response = await shopifyHttp_1.shopifyGraphQL.post("", {
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
        throw new Error(errors.map((error) => error.message).filter(Boolean).join(", ") ||
            "Failed to delete Shopify files");
    }
    const deletedFileIds = response.data?.data?.fileDelete?.deletedFileIds ?? [];
    return Array.isArray(deletedFileIds)
        ? deletedFileIds.map((value) => normalizeText(value)).filter(Boolean)
        : [];
};
const deleteProductEverywhere = async ({ productId, confirmationName, }) => {
    const productRef = firebase_1.firestore.collection("products").doc(productId);
    const snapshot = await productRef.get();
    if (!snapshot.exists) {
        throw new Error("Product not found");
    }
    const product = {
        ...snapshot.data(),
        id: snapshot.id,
    };
    const expectedConfirmationName = toProductName(product);
    if (!normalizeText(confirmationName)) {
        throw new Error("Product name confirmation is required");
    }
    if (confirmationName !== expectedConfirmationName) {
        throw new Error("Typed product name does not match exactly");
    }
    const activeSubscription = await (0, exports.getActiveSubscriptionSummaryForProduct)(product);
    const shopifyProductId = toShopifyProductId(product);
    const warnings = [];
    const deletedFileIds = [];
    const skippedFileUrls = [];
    let deletedMediaCount = 0;
    let shopifyDeleted = false;
    if (shopifyProductId) {
        let productExistsInShopify = true;
        try {
            await shopifyHttp_1.shopifyRest.get(`/products/${shopifyProductId}.json`, {
                params: { fields: "id,title,handle" },
            });
        }
        catch (error) {
            if (isShopifyNotFoundError(error)) {
                productExistsInShopify = false;
                warnings.push("Shopify product was already missing. Continued with local deletion.");
            }
            else {
                throw error;
            }
        }
        if (productExistsInShopify) {
            try {
                const media = await fetchShopifyProductMedia(shopifyProductId);
                deletedMediaCount = await deleteShopifyProductMedia(shopifyProductId, media.map((item) => item.id));
            }
            catch (error) {
                warnings.push(`Shopify product media cleanup was only partially completed: ${error instanceof Error ? error.message : "Unknown media delete error"}`);
            }
            try {
                const candidateFiles = await collectCandidateFiles(product, shopifyProductId);
                const safeFileIdsToDelete = [];
                for (const candidate of candidateFiles) {
                    if (!candidate.fileId && !candidate.url) {
                        continue;
                    }
                    const referenceCount = await countFirestoreFileReferences(candidate.fileId, candidate.url, product.id);
                    if (referenceCount > 0) {
                        if (candidate.url) {
                            skippedFileUrls.push(candidate.url);
                        }
                        warnings.push(`Skipped ${candidate.source} file cleanup because it appears to be shared by another record.`);
                        continue;
                    }
                    if (!candidate.fileId) {
                        if (candidate.url) {
                            skippedFileUrls.push(candidate.url);
                        }
                        warnings.push(`Skipped ${candidate.source} file cleanup because a safe Shopify file ID could not be verified.`);
                        continue;
                    }
                    safeFileIdsToDelete.push(candidate.fileId);
                }
                const deletedFiles = await deleteShopifyFiles(toUniqueValues(safeFileIdsToDelete));
                deletedFileIds.push(...deletedFiles);
            }
            catch (error) {
                warnings.push(`Shopify file cleanup was only partially completed: ${error instanceof Error ? error.message : "Unknown file delete error"}`);
            }
            await shopifyHttp_1.shopifyRest.delete(`/products/${shopifyProductId}.json`);
            shopifyDeleted = true;
        }
    }
    try {
        await productRef.delete();
    }
    catch (error) {
        console.error("Local product deletion failed after Shopify cleanup", {
            productId,
            shopifyProductId,
            error,
        });
        throw new Error(shopifyDeleted
            ? "Shopify product deletion succeeded, but local product deletion failed. Check server logs for recovery details."
            : "Failed to delete local product record.");
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
exports.deleteProductEverywhere = deleteProductEverywhere;
const normalizeDeleteListItem = (product, activeSubscription) => {
    const shopifyProductId = toShopifyProductId(product);
    const shopifyHandle = normalizeText(product.shopify?.handle) ||
        normalizeText(product.shopifyHandle) ||
        normalizeText(product.product?.handle) ||
        "";
    const shopifyUrl = normalizeText(product.shopify?.shopifyProductURL) ||
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
        shopifyStatus: normalizeText(product.shopify?.shopifyStatus ?? product.shopifyStatus) || "missing",
        shopifyProductId,
        shopifyHandle: shopifyHandle || null,
        activeSubscription,
    };
};
exports.normalizeDeleteListItem = normalizeDeleteListItem;
