"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const firebase_1 = require("../config/firebase");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const shopifyProductSync_1 = require("../services/shopifyProductSync");
const enrichProductsWithVendors_1 = require("../utils/enrichProductsWithVendors");
const shopifyProductImport_1 = require("../services/shopifyProductImport");
const productsSyncLogs_service_1 = require("../services/productsSyncLogs.service");
const productsSyncProgress_service_1 = require("../services/productsSyncProgress.service");
const router = (0, express_1.Router)();
const normalizeFirestoreValue = (value) => {
    if (value instanceof firebase_admin_1.default.firestore.Timestamp) {
        return value.toDate().toISOString();
    }
    if (Array.isArray(value)) {
        return value.map((item) => normalizeFirestoreValue(item));
    }
    if (value && typeof value === "object") {
        return Object.entries(value).reduce((accumulator, [key, nestedValue]) => {
            accumulator[key] = normalizeFirestoreValue(nestedValue);
            return accumulator;
        }, {});
    }
    return value;
};
const toFirestoreTimestamp = (value) => {
    if (value instanceof firebase_admin_1.default.firestore.Timestamp) {
        return value;
    }
    if (value &&
        typeof value === "object" &&
        typeof value._seconds === "number") {
        return firebase_admin_1.default.firestore.Timestamp.fromMillis(value._seconds * 1000 +
            Math.round((value._nanoseconds ?? 0) / 1000000));
    }
    if (typeof value === "string" || typeof value === "number") {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
            return firebase_admin_1.default.firestore.Timestamp.fromDate(date);
        }
    }
    return value;
};
const sanitizeUpdatePayload = (value, path = []) => {
    if (Array.isArray(value)) {
        return value.map((item, index) => sanitizeUpdatePayload(item, [...path, String(index)]));
    }
    if (value && typeof value === "object") {
        return Object.entries(value).reduce((accumulator, [key, nestedValue]) => {
            if (path.length === 0 &&
                [
                    "id",
                    "createdAt",
                    "updatedAt",
                    "businessName",
                    "claimedByBusinessName",
                    "vendorResolved",
                ].includes(key)) {
                return accumulator;
            }
            if (nestedValue === undefined) {
                return accumulator;
            }
            accumulator[key] = sanitizeUpdatePayload(nestedValue, [...path, key]);
            return accumulator;
        }, {});
    }
    const currentKey = path[path.length - 1] ?? "";
    if (/At$/i.test(currentKey)) {
        return toFirestoreTimestamp(value);
    }
    return value;
};
const mergeDeep = (target, source) => {
    if (Array.isArray(source)) {
        return source.map((item) => mergeDeep(undefined, item));
    }
    if (source && typeof source === "object") {
        const sourceRecord = source;
        const targetRecord = target && typeof target === "object" && !Array.isArray(target)
            ? target
            : {};
        return Object.entries(sourceRecord).reduce((accumulator, [key, value]) => {
            accumulator[key] = mergeDeep(targetRecord[key], value);
            return accumulator;
        }, { ...targetRecord });
    }
    return source === undefined ? target : source;
};
const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
/**
 * GET /api/products/pending
 * Fetch all pending products
 */
router.get("/pending", async (_req, res) => {
    try {
        const snapshot = await firebase_1.firestore
            .collection("products")
            .where("lifecycleStatus", "==", "pending")
            .where("ownership.claimed", "!=", true)
            .orderBy("ownership.claimed")
            .orderBy("createdAt", "desc")
            .get();
        const products = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
            };
        });
        const enrichedProducts = await (0, enrichProductsWithVendors_1.enrichProductsWithVendors)(products);
        const normalizedProducts = enrichedProducts.map((product) => ({
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
                productName: product.vendor?.basic?.productName ??
                    product.shopify?.product?.title ??
                    "Unnamed Product",
                category: product.vendor?.basic?.category ??
                    product.shopify?.product?.category ??
                    "—",
                description: product.vendor?.basic?.description ??
                    product.shopify?.product?.descriptionHtml ??
                    "",
            },
            pricing: {
                selectedPlan: product.vendor?.pricing?.selectedPlan ??
                    product.shopify?.shopifyData?.metafields?.plan ??
                    "default",
                price: Number(product.vendor?.pricing?.price ??
                    product.shopify?.shopifyData?.variants?.[0]?.price ??
                    0),
            },
        }));
        /* ================= RESPONSE ================= */
        res.json({
            success: true,
            count: normalizedProducts.length,
            data: normalizedProducts,
        });
    }
    catch (error) {
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
router.get("/claimed", async (_req, res) => {
    try {
        const snapshot = await firebase_1.firestore
            .collection("products")
            .where("ownership.claimed", "==", true)
            .where("lifecycleStatus", "==", "pending")
            .orderBy("createdAt", "desc")
            .get();
        const products = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
            };
        });
        const enrichedProducts = await (0, enrichProductsWithVendors_1.enrichProductsWithVendors)(products);
        const normalizedProducts = enrichedProducts.map((product) => ({
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
                productName: product.vendor?.basic?.productName ??
                    product.shopify?.product?.title ??
                    "Unnamed Product",
                category: product.vendor?.basic?.category ??
                    product.shopify?.product?.category ??
                    "—",
                description: product.vendor?.basic?.description ??
                    product.shopify?.product?.descriptionHtml ??
                    "",
            },
            pricing: {
                selectedPlan: product.vendor?.pricing?.selectedPlan ??
                    product.shopify?.shopifyData?.metafields?.plan ??
                    "default",
                price: Number(product.vendor?.pricing?.price ??
                    product.shopify?.shopifyData?.variants?.[0]?.price ??
                    0),
            },
        }));
        res.json({
            success: true,
            count: normalizedProducts.length,
            data: normalizedProducts,
        });
    }
    catch (error) {
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
    try {
        const PAGE_SIZE = 25;
        const shouldFetchAll = req.query.all === "true";
        const cursor = req.query.cursor;
        let query = firebase_1.firestore
            .collection("products")
            .where("lifecycleStatus", "==", "active")
            .where("shopify.shopifyStatus", "==", "active")
            .orderBy("createdAt", "desc");
        if (!shouldFetchAll) {
            query = query.limit(PAGE_SIZE);
        }
        if (!shouldFetchAll && cursor) {
            const cursorDate = firebase_admin_1.default.firestore.Timestamp.fromMillis(Number(cursor));
            query = query.startAfter(cursorDate);
        }
        const snapshot = await query.get();
        const products = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
            };
        });
        const enrichedProducts = await (0, enrichProductsWithVendors_1.enrichProductsWithVendors)(products);
        const normalizedProducts = enrichedProducts.map((product) => ({
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
                productName: product.vendor?.basic?.productName ??
                    product.shopify?.product?.title ??
                    "Unnamed Product",
                category: product.vendor?.basic?.category ??
                    product.shopify?.product?.category ??
                    "—",
                description: product.vendor?.basic?.description ??
                    product.shopify?.product?.descriptionHtml ??
                    "",
            },
            pricing: {
                selectedPlan: product.vendor?.pricing?.selectedPlan ??
                    product.shopify?.shopifyData?.metafields?.plan ??
                    "default",
                price: Number(product.vendor?.pricing?.price ??
                    product.shopify?.shopifyData?.variants?.[0]?.price ??
                    0),
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
    }
    catch (error) {
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
router.get("/rejected", async (_req, res) => {
    try {
        const snapshot = await firebase_1.firestore
            .collection("products")
            .where("lifecycleStatus", "==", "rejected")
            .orderBy("createdAt", "desc")
            .get();
        const products = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
            };
        });
        const enrichedProducts = await (0, enrichProductsWithVendors_1.enrichProductsWithVendors)(products);
        const normalizedProducts = enrichedProducts.map((product) => ({
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
                productName: product.vendor?.basic?.productName ??
                    product.shopify?.product?.title ??
                    "Unnamed Product",
                category: product.vendor?.basic?.category ??
                    product.shopify?.product?.category ??
                    "—",
                description: product.vendor?.basic?.description ??
                    product.shopify?.product?.descriptionHtml ??
                    "",
            },
            pricing: {
                selectedPlan: product.vendor?.pricing?.selectedPlan ??
                    product.shopify?.shopifyData?.metafields?.plan ??
                    "default",
                price: Number(product.vendor?.pricing?.price ??
                    product.shopify?.shopifyData?.variants?.[0]?.price ??
                    0),
            },
        }));
        /* ================= RESPONSE ================= */
        res.json({
            success: true,
            count: normalizedProducts.length,
            data: normalizedProducts,
        });
    }
    catch (error) {
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
router.get("/on-hold", async (_req, res) => {
    try {
        const snapshot = await firebase_1.firestore
            .collection("products")
            .where("lifecycleStatus", "==", "on-hold")
            .orderBy("createdAt", "desc")
            .get();
        const products = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
            };
        });
        const enrichedProducts = await (0, enrichProductsWithVendors_1.enrichProductsWithVendors)(products);
        const normalizedProducts = enrichedProducts.map((product) => ({
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
                productName: product.vendor?.basic?.productName ??
                    product.shopify?.product?.title ??
                    "Unnamed Product",
                category: product.vendor?.basic?.category ??
                    product.shopify?.product?.category ??
                    "—",
                description: product.vendor?.basic?.description ??
                    product.shopify?.product?.descriptionHtml ??
                    "",
            },
            pricing: {
                selectedPlan: product.vendor?.pricing?.selectedPlan ??
                    product.shopify?.shopifyData?.metafields?.plan ??
                    "default",
                price: Number(product.vendor?.pricing?.price ??
                    product.shopify?.shopifyData?.variants?.[0]?.price ??
                    0),
            },
        }));
        /* ================= RESPONSE ================= */
        res.json({
            success: true,
            count: normalizedProducts.length,
            data: normalizedProducts,
        });
    }
    catch (error) {
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
        const productRef = firebase_1.firestore.collection("products").doc(id);
        const updatePayload = {
            updatedAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp(),
        };
        if (decision === "approve") {
            updatePayload.lifecycleStatus = "active";
            // Shopify product will be created via /status route
            updatePayload["shopify.shopifyStatus"] = "draft";
            updatePayload.approvedAt =
                firebase_admin_1.default.firestore.FieldValue.serverTimestamp();
            updatePayload["verification.isProductActive"] = true;
            updatePayload["verification.productVerified"] = true;
        }
        if (decision === "reject") {
            updatePayload.status = "rejected";
            updatePayload.lifecycleStatus = "rejected";
            updatePayload["shopify.shopifyStatus"] = "draft";
            updatePayload.rejectedAt = firebase_admin_1.default.firestore.FieldValue.serverTimestamp();
            updatePayload["verification.isProductActive"] = false;
        }
        await productRef.update(updatePayload);
        res.json({
            success: true,
            message: `Product ${decision}d successfully`,
        });
    }
    catch (error) {
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
        const productRef = firebase_1.firestore
            .collection("products")
            .doc(id);
        const productSnap = await productRef.get();
        if (!productSnap.exists) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }
        const baseProduct = {
            id: productSnap.id,
            ...productSnap.data(),
        };
        const previousLifecycleStatus = baseProduct.lifecycleStatus ?? "pending";
        const shouldSyncWithShopify = lifecycleStatus === "active" ||
            previousLifecycleStatus === "active";
        const shopifyApiStatus = lifecycleStatus === "active" ? "active" : "draft";
        /* ================= ACTIVE (SHOPIFY FIRST) ================= */
        if (shouldSyncWithShopify) {
            try {
                console.log("Attempting Shopify sync for product:", id);
                if (baseProduct.shopify?.productId) {
                    console.log("Shopify product already exists, skipping CREATE", baseProduct.shopify.productId);
                }
                const normalizedProduct = {
                    ...baseProduct,
                    basic: {
                        productName: baseProduct.vendor?.basic?.productName ?? "",
                        category: baseProduct.vendor?.basic?.category ?? "",
                        description: baseProduct.vendor?.basic?.description ?? "",
                    },
                    features: baseProduct.vendor?.features ?? [],
                    pricing: baseProduct.vendor?.pricing ?? {},
                    media: baseProduct.vendor?.media ?? {},
                };
                const shopifyResult = await (0, shopifyProductSync_1.syncProductWithShopify)({
                    product: {
                        ...normalizedProduct,
                        shopify: {
                            ...normalizedProduct.shopify,
                            productId: normalizedProduct.shopify?.productId ?? null,
                        },
                    },
                    shopifyApiStatus,
                });
                await productRef.update({
                    lifecycleStatus,
                    updatedAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp(),
                });
                await productRef.update({
                    // lifecycleStatus: "active",
                    source: baseProduct.source ?? "vendor",
                    ownership: {
                        claimed: true,
                        claimedByVendorId: baseProduct.vendorId,
                        claimedAt: baseProduct.ownership?.claimedAt ??
                            firebase_admin_1.default.firestore.FieldValue.serverTimestamp(),
                    },
                    updatedAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp(),
                    "verification.isProductActive": true,
                    "verification.productVerified": true,
                    shopify: {
                        ...baseProduct.shopify,
                        productId: baseProduct.shopify?.productId ??
                            shopifyResult.shopifyProductId,
                        graphqlId: baseProduct.shopify?.graphqlId ??
                            shopifyResult.shopifyGraphqlId ??
                            null,
                        handle: baseProduct.shopify?.handle ??
                            shopifyResult.handle ??
                            null,
                        shopifyProductURL: (baseProduct.shopify?.handle ?? shopifyResult.handle)
                            ? `https://${process.env.SHOPIFY_STORE_DOMAIN}/products/${baseProduct.shopify?.handle ?? shopifyResult.handle}`
                            : null,
                        shopifyStatus: "active",
                        syncAction: shopifyResult.action,
                        syncedAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp(),
                    },
                });
                await productRef.update({
                    "shopify.lastError": firebase_admin_1.default.firestore.FieldValue.delete(),
                });
                console.log("Shopify sync SUCCESS:", shopifyResult);
                console.log("Sending SUCCESS response");
                return res.json({
                    success: true,
                    message: "Product activated successfully",
                });
            }
            catch (err) {
                console.log("Shopify sync FAILED (caught):", err.message);
                console.error("Shopify activation failed:", err.message);
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
        const shopifyResult = await (0, shopifyProductSync_1.syncProductWithShopify)({
            product: baseProduct,
            shopifyApiStatus,
        });
        await productRef.update({
            lifecycleStatus,
            "shopify.shopifyStatus": shopifyApiStatus === "active" ? "active" : "draft",
            "shopify.syncAction": shopifyResult.action,
            updatedAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp(),
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
    }
    catch (error) {
        console.error("Status update error:", error);
        console.log("Sending FAILURE response");
        res.status(500).json({
            success: false,
            message: error.message ||
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
        data: (0, productsSyncProgress_service_1.getProductsSyncProgress)(),
    });
});
/**
 * GET /api/products/import/shopify/logs
 * Fetch persisted Shopify import logs
 */
router.get("/import/shopify/logs", async (_req, res) => {
    try {
        const logs = await (0, productsSyncLogs_service_1.getProductsSyncLogs)();
        res.json({
            success: true,
            data: logs,
        });
    }
    catch (error) {
        console.error("Products sync logs fetch error:", error);
        res.status(500).json({
            success: false,
            message: error.message ||
                "Failed to fetch sync logs",
        });
    }
});
/**
 * POST /api/products/import/shopify
 * Import existing Shopify products into Firestore
 */
router.post("/import/shopify", async (_req, res) => {
    if ((0, productsSyncProgress_service_1.isProductsSyncRunning)()) {
        res.status(409).json({
            success: false,
            message: "A Shopify sync is already running. Please wait for it to finish.",
            progress: (0, productsSyncProgress_service_1.getProductsSyncProgress)(),
        });
        return;
    }
    (0, productsSyncProgress_service_1.startProductsSyncProgress)();
    try {
        const result = await (0, shopifyProductImport_1.importShopifyProductsToFirestore)({
            onProgress: async (progress) => {
                (0, productsSyncProgress_service_1.updateProductsSyncProgress)({
                    status: "running",
                    totalProducts: progress.totalProducts,
                    processedProducts: progress.processedProducts,
                    imported: progress.imported,
                    skipped: progress.skipped,
                    message: progress.message,
                });
            },
        });
        (0, productsSyncProgress_service_1.completeProductsSyncProgress)("Shopify sync completed.");
        const log = await (0, productsSyncLogs_service_1.createProductsSyncLog)({
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
    }
    catch (error) {
        console.error("Shopify import error:", error);
        const failedProgress = (0, productsSyncProgress_service_1.failProductsSyncProgress)(error.message || "Shopify import failed");
        let log = null;
        try {
            log = await (0, productsSyncLogs_service_1.createProductsSyncLog)({
                imported: failedProgress.imported,
                skipped: failedProgress.skipped,
                status: "error",
                message: error.message || "Shopify import failed",
            });
        }
        catch (logError) {
            console.error("Products sync log save error:", logError);
        }
        res.status(500).json({
            success: false,
            message: error.message || "Shopify import failed",
            log,
            progress: failedProgress,
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
        const productRef = firebase_1.firestore.collection("products").doc(req.params.id);
        const existingProduct = await productRef.get();
        if (!existingProduct.exists) {
            res.status(404).json({
                success: false,
                message: "Product not found",
            });
            return;
        }
        const existingProductData = existingProduct.data();
        const sanitizedPayload = sanitizeUpdatePayload(req.body);
        const mergedProduct = {
            id: existingProduct.id,
            ...mergeDeep(existingProductData, sanitizedPayload),
        };
        const [enrichedProductForSync] = await (0, enrichProductsWithVendors_1.enrichProductsWithVendors)([mergedProduct]);
        const desiredShopifyStatus = enrichedProductForSync?.shopify?.shopifyStatus === "active" ||
            enrichedProductForSync?.lifecycleStatus === "active"
            ? "active"
            : "draft";
        const shouldSyncShopify = Boolean(enrichedProductForSync?.shopify?.productId) ||
            desiredShopifyStatus === "active";
        let shopifySyncResult = null;
        if (shouldSyncShopify) {
            shopifySyncResult = await (0, shopifyProductSync_1.syncProductWithShopify)({
                product: enrichedProductForSync,
                shopifyApiStatus: desiredShopifyStatus,
            });
        }
        const nextHandle = shopifySyncResult?.handle ??
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
                syncedAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp(),
                ...(nextHandle
                    ? {
                        shopifyProductURL: `https://${process.env.SHOPIFY_STORE_DOMAIN}/products/${nextHandle}`,
                    }
                    : {}),
            }
            : null;
        await productRef.set({
            ...sanitizedPayload,
            ...(nextShopifyState ? { shopify: nextShopifyState } : {}),
            updatedAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        if (shouldSyncShopify) {
            await productRef.update({
                "shopify.lastError": firebase_admin_1.default.firestore.FieldValue.delete(),
            });
        }
        const updatedSnapshot = await productRef.get();
        const updatedProduct = {
            id: updatedSnapshot.id,
            ...updatedSnapshot.data(),
        };
        const [enrichedProduct] = await (0, enrichProductsWithVendors_1.enrichProductsWithVendors)([updatedProduct]);
        const normalizedProduct = normalizeFirestoreValue(enrichedProduct ?? updatedProduct);
        res.json({
            success: true,
            message: shouldSyncShopify && shopifySyncResult
                ? `Product updated successfully and Shopify ${shopifySyncResult.action}`
                : "Product updated successfully",
            data: {
                ...normalizedProduct,
                businessName: enrichedProduct?.vendorResolved?.businessName ?? null,
                claimedByBusinessName: enrichedProduct?.vendorResolved?.claimedByBusinessName ?? null,
            },
        });
    }
    catch (error) {
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
        const snapshot = await firebase_1.firestore
            .collection("products")
            .doc(id)
            .get();
        if (!snapshot.exists) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }
        const product = {
            id: snapshot.id,
            ...snapshot.data(),
        };
        const [enrichedProduct] = await (0, enrichProductsWithVendors_1.enrichProductsWithVendors)([product]);
        res.json({
            success: true,
            data: {
                ...enrichedProduct,
                businessName: enrichedProduct?.vendorResolved
                    ?.businessName ?? null,
            },
        });
    }
    catch (error) {
        console.error("Product details error:", error);
        res.status(500).json({
            success: false,
            message: error.message ||
                "Failed to fetch product details",
        });
    }
});
exports.default = router;
