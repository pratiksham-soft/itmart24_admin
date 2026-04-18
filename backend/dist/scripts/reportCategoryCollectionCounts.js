"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("../config/env");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const csv_parser_1 = __importDefault(require("csv-parser"));
const shopifyHttp_1 = require("../services/shopifyHttp");
const SHOPIFY_PAGE_LIMIT = 250;
const SHOPIFY_GRAPHQL_PAGE_SIZE = 100;
const EXPORTS_DIR = path_1.default.join(__dirname, "../../exports");
const CSV_FILE_PATH = path_1.default.join(__dirname, "../../imports/category-collections.csv");
const normalizeWhitespace = (value) => String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
const normalizeCollectionKey = (value) => normalizeWhitespace(value).toLowerCase();
const csvEscape = (value) => {
    const stringValue = value === null || value === undefined ? "" : String(value);
    return `"${stringValue.replace(/"/g, '""')}"`;
};
const extractNextPageInfo = (linkHeader) => {
    if (!linkHeader) {
        return null;
    }
    const nextLink = linkHeader
        .split(",")
        .find((entry) => entry.includes('rel="next"'));
    if (!nextLink) {
        return null;
    }
    const match = nextLink.match(/<([^>]+)>/);
    if (!match?.[1]) {
        return null;
    }
    return new URL(match[1]).searchParams.get("page_info");
};
const fetchAllShopifyResources = async (resourcePath, responseKey) => {
    const results = [];
    let pageInfo = null;
    do {
        const params = pageInfo
            ? { limit: SHOPIFY_PAGE_LIMIT, page_info: pageInfo }
            : { limit: SHOPIFY_PAGE_LIMIT };
        const response = await shopifyHttp_1.shopifyRest.get(resourcePath, { params });
        const pageItems = Array.isArray(response.data?.[responseKey])
            ? response.data[responseKey]
            : [];
        results.push(...pageItems);
        pageInfo = extractNextPageInfo(response.headers.link);
    } while (pageInfo);
    return results;
};
const getStoreDomain = () => normalizeWhitespace(process.env.SHOPIFY_STORE_DOMAIN) ||
    "www.itmart24.com";
const fetchAllShopifyCollectionsSummary = async () => {
    const [customCollections, smartCollections] = await Promise.all([
        fetchAllShopifyResources("/custom_collections.json", "custom_collections"),
        fetchAllShopifyResources("/smart_collections.json", "smart_collections"),
    ]);
    const storeDomain = getStoreDomain();
    return [
        ...customCollections.map((collection) => ({
            id: collection.id,
            title: normalizeWhitespace(collection.title) || "Untitled Collection",
            handle: normalizeWhitespace(collection.handle) || null,
            type: "custom",
            published: Boolean(collection.published_at),
            updatedAt: collection.updated_at ?? null,
            collectionUrl: collection.handle
                ? `https://${storeDomain}/collections/${collection.handle}`
                : null,
        })),
        ...smartCollections.map((collection) => ({
            id: collection.id,
            title: normalizeWhitespace(collection.title) || "Untitled Collection",
            handle: normalizeWhitespace(collection.handle) || null,
            type: "smart",
            published: Boolean(collection.published_at),
            updatedAt: collection.updated_at ?? null,
            collectionUrl: collection.handle
                ? `https://${storeDomain}/collections/${collection.handle}`
                : null,
        })),
    ];
};
const fetchAllShopifyCollectionCounts = async () => {
    const counts = new Map();
    let cursor = null;
    let hasNextPage = true;
    const query = `
    query ShopifyCollectionCounts($first: Int!, $after: String) {
      collections(first: $first, after: $after) {
        nodes {
          legacyResourceId
          productsCount {
            count
            precision
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;
    while (hasNextPage) {
        const response = await shopifyHttp_1.shopifyGraphQL.post("", {
            query,
            variables: {
                first: SHOPIFY_GRAPHQL_PAGE_SIZE,
                after: cursor,
            },
        });
        if (response.data?.errors?.length) {
            const message = response.data.errors
                .map((error) => normalizeWhitespace(error.message))
                .filter(Boolean)
                .join(", ");
            throw new Error(message || "Failed to load Shopify collection counts");
        }
        const collectionsConnection = response.data?.data?.collections;
        const pageCollections = Array.isArray(collectionsConnection?.nodes)
            ? collectionsConnection.nodes
            : [];
        pageCollections.forEach((collection) => {
            const collectionId = Number(collection.legacyResourceId);
            if (Number.isNaN(collectionId)) {
                return;
            }
            counts.set(collectionId, {
                productCount: Number(collection.productsCount?.count ?? 0),
                precision: collection.productsCount?.precision ?? null,
            });
        });
        hasNextPage = Boolean(collectionsConnection?.pageInfo?.hasNextPage);
        cursor = collectionsConnection?.pageInfo?.endCursor ?? null;
    }
    return counts;
};
const readCsvRows = async () => new Promise((resolve, reject) => {
    const rows = [];
    fs_1.default.createReadStream(CSV_FILE_PATH)
        .pipe((0, csv_parser_1.default)({
        mapHeaders: ({ header }) => header
            .replace(/^\uFEFF/, "")
            .replace(/^"(.*)"$/, "$1"),
    }))
        .on("data", (row) => {
        rows.push(row);
    })
        .on("end", () => resolve(rows))
        .on("error", reject);
});
const buildReportRows = async () => {
    const [csvRows, liveCollections, collectionCounts] = await Promise.all([
        readCsvRows(),
        fetchAllShopifyCollectionsSummary(),
        fetchAllShopifyCollectionCounts(),
    ]);
    const liveCollectionsByHandle = new Map();
    liveCollections.forEach((collection) => {
        const handleKey = normalizeCollectionKey(collection.handle);
        if (handleKey) {
            liveCollectionsByHandle.set(handleKey, collection);
        }
    });
    return csvRows
        .map((row) => {
        const topCategory = normalizeWhitespace(row.top_category);
        const parentCategory = normalizeWhitespace(row.subcategory);
        const finalCategory = normalizeWhitespace(row.final_category);
        const collectionName = normalizeWhitespace(row.collection_title) || finalCategory;
        const collectionHandle = normalizeWhitespace(row.collection_handle);
        if (!collectionHandle || !collectionName) {
            return null;
        }
        const liveCollection = liveCollectionsByHandle.get(normalizeCollectionKey(collectionHandle));
        return {
            topCategory,
            parentCategory,
            finalCategory,
            collectionName,
            collectionHandle,
            collectionType: liveCollection?.type ?? "missing",
            liveCollectionFound: Boolean(liveCollection),
            productCount: liveCollection
                ? collectionCounts.get(liveCollection.id)?.productCount ?? 0
                : 0,
            productCountPrecision: liveCollection
                ? collectionCounts.get(liveCollection.id)?.precision ?? null
                : null,
            published: liveCollection?.published ?? false,
            updatedAt: liveCollection?.updatedAt ?? null,
            collectionUrl: liveCollection?.collectionUrl ?? null,
        };
    })
        .filter((row) => Boolean(row))
        .sort((left, right) => {
        if (right.productCount !== left.productCount) {
            return right.productCount - left.productCount;
        }
        return left.collectionName.localeCompare(right.collectionName);
    });
};
const writeReportFiles = async (rows) => {
    await fs_1.default.promises.mkdir(EXPORTS_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseName = `category-collection-product-counts-${timestamp}`;
    const csvPath = path_1.default.join(EXPORTS_DIR, `${baseName}.csv`);
    const jsonPath = path_1.default.join(EXPORTS_DIR, `${baseName}.json`);
    const csvLines = [
        [
            "top_category",
            "parent_category",
            "final_category",
            "collection_name",
            "collection_handle",
            "collection_type",
            "live_collection_found",
            "product_count",
            "product_count_precision",
            "published",
            "updated_at",
            "collection_url",
        ]
            .map((value) => csvEscape(value))
            .join(","),
        ...rows.map((row) => [
            row.topCategory,
            row.parentCategory,
            row.finalCategory,
            row.collectionName,
            row.collectionHandle,
            row.collectionType,
            row.liveCollectionFound,
            row.productCount,
            row.productCountPrecision,
            row.published,
            row.updatedAt,
            row.collectionUrl,
        ]
            .map((value) => csvEscape(value))
            .join(",")),
    ].join("\n");
    const summary = {
        generatedAt: new Date().toISOString(),
        rowCount: rows.length,
        collectionsWithProducts: rows.filter((row) => row.productCount > 0)
            .length,
        missingCollections: rows.filter((row) => !row.liveCollectionFound)
            .length,
    };
    await Promise.all([
        fs_1.default.promises.writeFile(csvPath, csvLines, "utf8"),
        fs_1.default.promises.writeFile(jsonPath, JSON.stringify({ summary, rows }, null, 2), "utf8"),
    ]);
    return { csvPath, jsonPath, summary };
};
const main = async () => {
    const rows = await buildReportRows();
    const reportPaths = await writeReportFiles(rows);
    console.log(`Category collection CSV report: ${reportPaths.csvPath}`);
    console.log(`Category collection JSON report: ${reportPaths.jsonPath}`);
    console.log(`Rows: ${reportPaths.summary.rowCount}, With products: ${reportPaths.summary.collectionsWithProducts}, Missing collections: ${reportPaths.summary.missingCollections}`);
};
main().catch((error) => {
    console.error("Category collection report failed:", error);
    process.exitCode = 1;
});
