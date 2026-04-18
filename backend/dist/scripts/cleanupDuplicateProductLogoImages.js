"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("../config/env");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const axios_1 = __importDefault(require("axios"));
const shopifyHttp_1 = require("../services/shopifyHttp");
const EXPORTS_DIR = path_1.default.join(__dirname, "../../exports");
const APPLY_CHANGES = process.argv.includes("--apply");
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const CONCURRENCY_ARG = process.argv.find((arg) => arg.startsWith("--concurrency="));
const REQUEST_TIMEOUT_ARG = process.argv.find((arg) => arg.startsWith("--timeout-ms="));
const PRODUCT_LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : null;
const WORKER_CONCURRENCY = CONCURRENCY_ARG
    ? Math.max(1, Number(CONCURRENCY_ARG.split("=")[1]) || 1)
    : 4;
const REQUEST_TIMEOUT_MS = REQUEST_TIMEOUT_ARG
    ? Math.max(1000, Number(REQUEST_TIMEOUT_ARG.split("=")[1]) || 1000)
    : 15000;
const REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
};
const normalizeWhitespace = (value) => value.replace(/\s+/g, " ").trim();
const csvEscape = (value) => {
    const stringValue = value === null || value === undefined ? "" : String(value);
    return `"${stringValue.replace(/"/g, '""')}"`;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SHOPIFY_REQUEST_GAP_MS = 350;
let shopifyRestQueue = Promise.resolve();
let lastShopifyRestRequestAt = 0;
const getGraphQlErrorMessage = (errors, fallback = "Shopify request failed") => {
    if (!Array.isArray(errors) || errors.length === 0) {
        return fallback;
    }
    const message = errors
        .map((error) => error.message?.trim())
        .filter(Boolean)
        .join(", ");
    return message || fallback;
};
const isRetryableError = (error) => {
    const status = error?.response?.status;
    const message = typeof error?.message === "string"
        ? error.message.toLowerCase()
        : "";
    const graphQlErrors = error?.response?.data?.errors;
    if (status === 429 || status === 502 || status === 503 || status === 504) {
        return true;
    }
    if (Array.isArray(graphQlErrors)) {
        const joined = graphQlErrors
            .map((item) => typeof item?.message === "string" ? item.message.toLowerCase() : "")
            .join(" ");
        if (joined.includes("throttled")) {
            return true;
        }
    }
    return (message.includes("timeout") ||
        message.includes("socket hang up") ||
        message.includes("econnreset") ||
        message.includes("econnaborted") ||
        message.includes("throttled"));
};
const withRetries = async (label, fn, maxAttempts = 3) => {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            if (!isRetryableError(error) || attempt === maxAttempts) {
                throw error;
            }
            const delayMs = attempt * 1500;
            console.warn(`[retry] ${label} failed on attempt ${attempt}/${maxAttempts}. Retrying in ${delayMs}ms...`);
            await sleep(delayMs);
        }
    }
    throw lastError;
};
const isLikelyHttpUrl = (value) => {
    if (!value) {
        return false;
    }
    try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    }
    catch {
        return false;
    }
};
const sanitizeUrl = (value) => {
    try {
        const parsed = new URL(value.trim());
        [
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "utm_term",
            "utm_content",
            "fbclid",
            "gclid",
            "ref",
            "ref_src",
            "mc_cid",
            "mc_eid",
        ].forEach((key) => parsed.searchParams.delete(key));
        const search = parsed.searchParams.toString();
        return `${parsed.origin}${parsed.pathname}${search ? `?${search}` : ""}`;
    }
    catch {
        return value.trim();
    }
};
const getFinalResponseUrl = (response, fallbackUrl) => {
    const request = response.request;
    return (request?.res?.responseUrl ||
        request?._redirectable?._currentUrl ||
        fallbackUrl);
};
const imageFetchCache = new Map();
const runShopifyRestRequest = async (fn) => {
    const scheduled = shopifyRestQueue.then(async () => {
        const waitMs = Math.max(0, SHOPIFY_REQUEST_GAP_MS - (Date.now() - lastShopifyRestRequestAt));
        if (waitMs > 0) {
            await sleep(waitMs);
        }
        try {
            return await fn();
        }
        finally {
            lastShopifyRestRequestAt = Date.now();
        }
    });
    shopifyRestQueue = scheduled.then(() => undefined, () => undefined);
    return scheduled;
};
const fetchImageDescriptor = async (url) => {
    const normalizedUrl = sanitizeUrl(url);
    const existing = imageFetchCache.get(normalizedUrl);
    if (existing) {
        return existing;
    }
    const promise = withRetries(`Fetch image ${normalizedUrl}`, async () => {
        const response = await axios_1.default.get(normalizedUrl, {
            timeout: REQUEST_TIMEOUT_MS,
            maxRedirects: 5,
            responseType: "arraybuffer",
            headers: REQUEST_HEADERS,
            validateStatus: (status) => status >= 200 && status < 400,
        });
        const bytes = Buffer.from(response.data);
        const sha256 = crypto_1.default
            .createHash("sha256")
            .update(bytes)
            .digest("hex");
        const contentType = typeof response.headers["content-type"] === "string"
            ? response.headers["content-type"]
            : Array.isArray(response.headers["content-type"])
                ? response.headers["content-type"].join(", ")
                : "";
        return {
            normalizedUrl,
            finalUrl: sanitizeUrl(getFinalResponseUrl(response, normalizedUrl)),
            contentType,
            sha256,
            sizeBytes: bytes.length,
        };
    }, 2);
    imageFetchCache.set(normalizedUrl, promise);
    return promise;
};
const fetchAllProductsWithImages = async () => {
    const products = [];
    let sinceId = 0;
    let hasMore = true;
    while (hasMore) {
        const response = await withRetries("Fetch Shopify products with images", () => runShopifyRestRequest(() => shopifyHttp_1.shopifyRest.get("/products.json", {
            params: {
                limit: 250,
                since_id: sinceId,
                fields: "id,title,handle,status,image,images",
            },
        })));
        const pageProducts = Array.isArray(response.data?.products)
            ? response.data.products
            : [];
        pageProducts.forEach((product) => {
            if (typeof product?.id !== "number") {
                return;
            }
            const images = Array.isArray(product?.images)
                ? product.images
                    .filter((image) => typeof image?.id === "number" && image?.src)
                    .map((image) => ({
                    id: image.id,
                    src: typeof image.src === "string" && image.src.trim()
                        ? image.src.trim()
                        : null,
                    alt: typeof image.alt === "string" && image.alt.trim()
                        ? image.alt.trim()
                        : null,
                    width: typeof image.width === "number" ? image.width : null,
                    height: typeof image.height === "number" ? image.height : null,
                    position: typeof image.position === "number" ? image.position : null,
                    admin_graphql_api_id: typeof image.admin_graphql_api_id === "string" &&
                        image.admin_graphql_api_id.trim()
                        ? image.admin_graphql_api_id.trim()
                        : null,
                }))
                : [];
            if (images.length === 0) {
                return;
            }
            products.push({
                id: product.id,
                title: normalizeWhitespace(product.title ?? "Untitled Product"),
                handle: typeof product.handle === "string" && product.handle.trim()
                    ? product.handle.trim()
                    : null,
                status: normalizeWhitespace(product.status ?? ""),
                featuredImageId: typeof product?.image?.id === "number" ? product.image.id : null,
                images,
            });
        });
        hasMore = pageProducts.length === 250;
        sinceId = hasMore ? Number(pageProducts[pageProducts.length - 1].id) : sinceId;
    }
    return products;
};
const fetchLogoMetafieldUrl = async (productId) => {
    const response = await withRetries(`Fetch metafields for product ${productId}`, () => runShopifyRestRequest(() => shopifyHttp_1.shopifyRest.get(`/products/${productId}/metafields.json`)));
    const metafields = Array.isArray(response.data?.metafields)
        ? response.data.metafields
        : [];
    const logoMetafield = metafields.find((metafield) => metafield.namespace === "custom" && metafield.key === "logo_image");
    return typeof logoMetafield?.value === "string"
        ? logoMetafield.value.trim()
        : "";
};
const deleteProductImage = async ({ productId, imageId, }) => {
    await withRetries(`Delete product image ${imageId} from ${productId}`, () => runShopifyRestRequest(() => shopifyHttp_1.shopifyRest.delete(`/products/${productId}/images/${imageId}.json`)));
};
const mapWithConcurrency = async (values, concurrency, mapper) => {
    const results = new Array(values.length);
    let nextIndex = 0;
    const worker = async () => {
        while (true) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            if (currentIndex >= values.length) {
                return;
            }
            results[currentIndex] = await mapper(values[currentIndex], currentIndex);
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
    return results;
};
const processProduct = async (product) => {
    let logoUrl = "";
    try {
        logoUrl = await fetchLogoMetafieldUrl(product.id);
    }
    catch (error) {
        return {
            duplicateRows: [],
            skippedProduct: {
                productId: product.id,
                title: product.title,
                handle: product.handle,
                status: product.status,
                reason: "metafield_fetch_failed",
                logoUrl: null,
                error: typeof error?.message === "string"
                    ? normalizeWhitespace(error.message)
                    : "Failed to fetch product metafields",
            },
        };
    }
    if (!logoUrl) {
        return {
            duplicateRows: [],
            skippedProduct: {
                productId: product.id,
                title: product.title,
                handle: product.handle,
                status: product.status,
                reason: "missing_logo_metafield",
                logoUrl: null,
                error: null,
            },
        };
    }
    if (!isLikelyHttpUrl(logoUrl)) {
        return {
            duplicateRows: [],
            skippedProduct: {
                productId: product.id,
                title: product.title,
                handle: product.handle,
                status: product.status,
                reason: "invalid_logo_url",
                logoUrl,
                error: null,
            },
        };
    }
    let logoDescriptor;
    try {
        logoDescriptor = await fetchImageDescriptor(logoUrl);
    }
    catch (error) {
        return {
            duplicateRows: [],
            skippedProduct: {
                productId: product.id,
                title: product.title,
                handle: product.handle,
                status: product.status,
                reason: "logo_fetch_failed",
                logoUrl,
                error: typeof error?.message === "string"
                    ? normalizeWhitespace(error.message)
                    : "Failed to fetch logo image",
            },
        };
    }
    const duplicateRows = [];
    for (const image of product.images) {
        if (!image.src || !isLikelyHttpUrl(image.src)) {
            continue;
        }
        let imageDescriptor;
        try {
            imageDescriptor = await fetchImageDescriptor(image.src);
        }
        catch (error) {
            console.warn(`Skipping image ${image.id} on product ${product.id}: ${typeof error?.message === "string"
                ? normalizeWhitespace(error.message)
                : "Failed to fetch image"}`);
            continue;
        }
        if (imageDescriptor.sha256 !== logoDescriptor.sha256) {
            continue;
        }
        let applied = false;
        let deleteError = null;
        if (APPLY_CHANGES) {
            try {
                await deleteProductImage({
                    productId: product.id,
                    imageId: image.id,
                });
                applied = true;
            }
            catch (error) {
                deleteError =
                    typeof error?.message === "string"
                        ? normalizeWhitespace(error.message)
                        : "Failed to delete Shopify product image";
            }
        }
        duplicateRows.push({
            productId: product.id,
            title: product.title,
            handle: product.handle,
            status: product.status,
            logoUrl: logoDescriptor.finalUrl,
            logoHash: logoDescriptor.sha256,
            logoContentType: logoDescriptor.contentType,
            logoSizeBytes: logoDescriptor.sizeBytes,
            productImageId: image.id,
            productImageUrl: imageDescriptor.finalUrl,
            productImageHash: imageDescriptor.sha256,
            productImageContentType: imageDescriptor.contentType,
            productImageSizeBytes: imageDescriptor.sizeBytes,
            productImagePosition: image.position,
            isFeaturedImage: product.featuredImageId === image.id,
            applied,
            deleteError,
        });
    }
    return {
        duplicateRows,
        skippedProduct: null,
    };
};
const writeReportFiles = async ({ duplicateRows, skippedProducts, selectedProductCount, scannedProductCount, }) => {
    await fs_1.default.promises.mkdir(EXPORTS_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseName = `shopify-product-logo-image-cleanup-${timestamp}${APPLY_CHANGES ? "-applied" : "-dry-run"}`;
    const jsonPath = path_1.default.join(EXPORTS_DIR, `${baseName}.json`);
    const csvPath = path_1.default.join(EXPORTS_DIR, `${baseName}.csv`);
    const summary = {
        generatedAt: new Date().toISOString(),
        applyChanges: APPLY_CHANGES,
        concurrency: WORKER_CONCURRENCY,
        timeoutMs: REQUEST_TIMEOUT_MS,
        scannedProductCount,
        selectedProductCount,
        skippedProductCount: skippedProducts.length,
        duplicateProductCount: new Set(duplicateRows.map((row) => row.productId))
            .size,
        duplicateImageCount: duplicateRows.length,
        deletedImageCount: duplicateRows.filter((row) => row.applied).length,
        deleteErrorCount: duplicateRows.filter((row) => row.deleteError).length,
        skippedReasonBreakdown: skippedProducts.reduce((accumulator, row) => {
            accumulator[row.reason] = (accumulator[row.reason] ?? 0) + 1;
            return accumulator;
        }, {}),
        duplicateRows,
        skippedProducts,
    };
    await fs_1.default.promises.writeFile(jsonPath, JSON.stringify(summary, null, 2), "utf8");
    const csvLines = [
        [
            "product_id",
            "title",
            "handle",
            "status",
            "logo_url",
            "logo_hash",
            "logo_content_type",
            "logo_size_bytes",
            "product_image_id",
            "product_image_url",
            "product_image_hash",
            "product_image_content_type",
            "product_image_size_bytes",
            "product_image_position",
            "is_featured_image",
            "applied",
            "delete_error",
        ]
            .map((value) => csvEscape(value))
            .join(","),
        ...duplicateRows.map((row) => [
            row.productId,
            row.title,
            row.handle,
            row.status,
            row.logoUrl,
            row.logoHash,
            row.logoContentType,
            row.logoSizeBytes,
            row.productImageId,
            row.productImageUrl,
            row.productImageHash,
            row.productImageContentType,
            row.productImageSizeBytes,
            row.productImagePosition,
            row.isFeaturedImage,
            row.applied,
            row.deleteError,
        ]
            .map((value) => csvEscape(value))
            .join(",")),
    ].join("\n");
    await fs_1.default.promises.writeFile(csvPath, csvLines, "utf8");
    return { jsonPath, csvPath };
};
const main = async () => {
    console.log("Fetching Shopify products that currently have attached product images...");
    const scannedProducts = await fetchAllProductsWithImages();
    const selectedProducts = PRODUCT_LIMIT && PRODUCT_LIMIT > 0
        ? scannedProducts.slice(0, PRODUCT_LIMIT)
        : scannedProducts;
    console.log(`Found ${scannedProducts.length} Shopify products with attached images.`);
    console.log(`Processing ${selectedProducts.length} product${selectedProducts.length === 1 ? "" : "s"} with concurrency ${WORKER_CONCURRENCY}...`);
    const results = await mapWithConcurrency(selectedProducts, WORKER_CONCURRENCY, async (product, index) => {
        console.log(`[${index + 1}/${selectedProducts.length}] Checking ${product.id}: ${product.title}`);
        return processProduct(product);
    });
    const duplicateRows = results.flatMap((result) => result.duplicateRows);
    const skippedProducts = results
        .map((result) => result.skippedProduct)
        .filter((row) => Boolean(row));
    const reportPaths = await writeReportFiles({
        duplicateRows,
        skippedProducts,
        selectedProductCount: selectedProducts.length,
        scannedProductCount: scannedProducts.length,
    });
    console.log(`Duplicate image rows found: ${duplicateRows.length}`);
    console.log(`Distinct products with duplicate logo images: ${new Set(duplicateRows.map((row) => row.productId)).size}`);
    console.log(`Skipped products: ${skippedProducts.length}`);
    console.log(`Cleanup JSON report: ${reportPaths.jsonPath}`);
    console.log(`Cleanup CSV report: ${reportPaths.csvPath}`);
};
main().catch((error) => {
    const graphQlErrors = error?.response?.data?.errors;
    console.error("Failed to clean duplicate Shopify product logo images:", Array.isArray(graphQlErrors)
        ? getGraphQlErrorMessage(graphQlErrors, typeof error?.message === "string"
            ? error.message
            : "Unknown error")
        : error?.message ?? error);
    process.exitCode = 1;
});
