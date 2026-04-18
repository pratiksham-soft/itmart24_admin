"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const express_1 = require("express");
const csv_parser_1 = __importDefault(require("csv-parser"));
const shopifyHttp_1 = require("../services/shopifyHttp");
const router = (0, express_1.Router)();
const DEFAULT_STORE_DOMAIN = "www.itmart24.com";
const SHOPIFY_PAGE_LIMIT = 250;
const SHOPIFY_PRODUCTS_CACHE_TTL_MS = 60 * 1000;
const SHOPIFY_COLLECTIONS_CACHE_TTL_MS = 60 * 1000;
const SHOPIFY_GRAPHQL_PAGE_SIZE = 100;
const SHOPIFY_ADMIN_LIST_PAGE_SIZE = 25;
const SHOPIFY_ADMIN_LIST_MAX_PAGE_SIZE = 100;
const CATEGORY_COLLECTIONS_CSV_PATH = path_1.default.join(__dirname, "../../imports/category-collections.csv");
let cachedShopifyProductsResponse = null;
let cachedShopifyProductsFetchedAt = 0;
let cachedShopifyCollectionsResponse = null;
let cachedShopifyCollectionsFetchedAt = 0;
let cachedCategoryCollectionRows = null;
const isShopifyProductsCacheFresh = () => cachedShopifyProductsResponse !== null &&
    Date.now() - cachedShopifyProductsFetchedAt <
        SHOPIFY_PRODUCTS_CACHE_TTL_MS;
const isShopifyCollectionsCacheFresh = () => cachedShopifyCollectionsResponse !== null &&
    Date.now() - cachedShopifyCollectionsFetchedAt <
        SHOPIFY_COLLECTIONS_CACHE_TTL_MS;
const clearShopifyCollectionsCache = () => {
    cachedShopifyCollectionsResponse = null;
    cachedShopifyCollectionsFetchedAt = 0;
};
const clearShopifyProductsCache = () => {
    cachedShopifyProductsResponse = null;
    cachedShopifyProductsFetchedAt = 0;
};
const normalizeWhitespace = (value) => typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
const toSortableTime = (value) => value ? new Date(value).getTime() : 0;
const getStoreDomain = () => process.env.SHOPIFY_STORE_DOMAIN || DEFAULT_STORE_DOMAIN;
const normalizeCollectionKey = (value) => normalizeWhitespace(value).toLowerCase();
const csvEscape = (value) => {
    const stringValue = value === null || value === undefined ? "" : String(value);
    return `"${stringValue.replace(/"/g, '""')}"`;
};
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
const parseNumericIdFromGid = (gid) => {
    if (typeof gid !== "string") {
        return null;
    }
    const match = gid.match(/\/(\d+)$/);
    return match?.[1] ? Number(match[1]) : null;
};
const toCollectionGid = (collectionId) => `gid://shopify/Collection/${collectionId}`;
const toProductGid = (productId) => `gid://shopify/Product/${productId}`;
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
const fetchAllShopifyResources = async (path, responseKey) => {
    const results = [];
    let pageInfo = null;
    do {
        const params = pageInfo
            ? { limit: SHOPIFY_PAGE_LIMIT, page_info: pageInfo }
            : { limit: SHOPIFY_PAGE_LIMIT };
        const response = await shopifyHttp_1.shopifyRest.get(path, { params });
        const pageItems = Array.isArray(response.data?.[responseKey])
            ? response.data[responseKey]
            : [];
        results.push(...pageItems);
        pageInfo = extractNextPageInfo(response.headers.link);
    } while (pageInfo);
    return results;
};
const fetchAllShopifyCollectionsSummary = async () => {
    const [customCollections, smartCollections] = await Promise.all([
        fetchAllShopifyResources("/custom_collections.json", "custom_collections"),
        fetchAllShopifyResources("/smart_collections.json", "smart_collections"),
    ]);
    const storeDomain = getStoreDomain();
    return [
        ...customCollections.map((collection) => ({
            id: collection.id,
            title: collection.title ?? "Untitled Collection",
            handle: collection.handle ?? null,
            type: "custom",
            sortOrder: collection.sort_order ?? "-",
            published: Boolean(collection.published_at),
            updatedAt: collection.updated_at ?? null,
            publishedAt: collection.published_at ?? null,
            collectionUrl: collection.handle
                ? `https://${storeDomain}/collections/${collection.handle}`
                : null,
        })),
        ...smartCollections.map((collection) => ({
            id: collection.id,
            title: collection.title ?? "Untitled Collection",
            handle: collection.handle ?? null,
            type: "smart",
            sortOrder: collection.sort_order ?? "-",
            published: Boolean(collection.published_at),
            updatedAt: collection.updated_at ?? null,
            publishedAt: collection.published_at ?? null,
            collectionUrl: collection.handle
                ? `https://${storeDomain}/collections/${collection.handle}`
                : null,
        })),
    ];
};
const parseListMetafield = (value) => {
    if (typeof value !== "string" || value.trim() === "") {
        return [];
    }
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
            return parsed
                .map((item) => String(item).trim())
                .filter(Boolean);
        }
    }
    catch {
        // Fall back to treating the raw value as a single collection name.
    }
    return [value.trim()].filter(Boolean);
};
const addCollectionLookupValue = (lookup, key, collectionId) => {
    const normalizedKey = normalizeCollectionKey(key);
    if (!normalizedKey) {
        return;
    }
    const existingIds = lookup.get(normalizedKey) ?? new Set();
    existingIds.add(collectionId);
    lookup.set(normalizedKey, existingIds);
};
const extractProductCollectionNames = (product) => {
    const collectionNames = new Map();
    const defaultCollections = Array.isArray(product.collections?.nodes)
        ? product.collections.nodes
        : [];
    defaultCollections.forEach((collection) => {
        const title = typeof collection.title === "string" ? collection.title.trim() : "";
        if (!title) {
            return;
        }
        collectionNames.set(normalizeCollectionKey(title), title);
    });
    parseListMetafield(product.metafield?.value).forEach((collectionName) => {
        const normalizedName = normalizeCollectionKey(collectionName);
        if (!normalizedName || collectionNames.has(normalizedName)) {
            return;
        }
        collectionNames.set(normalizedName, collectionName);
    });
    return Array.from(collectionNames.values()).sort((left, right) => left.localeCompare(right));
};
const readCategoryCollectionRows = async () => {
    if (cachedCategoryCollectionRows) {
        return cachedCategoryCollectionRows;
    }
    const rows = await new Promise((resolve, reject) => {
        const nextRows = [];
        fs_1.default.createReadStream(CATEGORY_COLLECTIONS_CSV_PATH)
            .pipe((0, csv_parser_1.default)({
            mapHeaders: ({ header }) => header
                .replace(/^\uFEFF/, "")
                .replace(/^"(.*)"$/, "$1"),
        }))
            .on("data", (row) => {
            nextRows.push(row);
        })
            .on("end", () => resolve(nextRows))
            .on("error", reject);
    });
    cachedCategoryCollectionRows = rows;
    return rows;
};
const parseCategoryFilters = (query) => ({
    topCategory: typeof query.topCategory === "string"
        ? normalizeWhitespace(query.topCategory)
        : "",
    parentCategory: typeof query.parentCategory === "string"
        ? normalizeWhitespace(query.parentCategory)
        : "",
    finalCategory: typeof query.finalCategory === "string"
        ? normalizeWhitespace(query.finalCategory)
        : "",
});
const parsePositiveIntegerQuery = (value, fallback, max) => {
    const parsedValue = Number.parseInt(typeof value === "string" ? value : "", 10);
    if (!Number.isFinite(parsedValue) || parsedValue < 1) {
        return fallback;
    }
    if (typeof max === "number") {
        return Math.min(parsedValue, max);
    }
    return parsedValue;
};
const paginateItems = (items, pageQuery, pageSizeQuery) => {
    const pageSize = parsePositiveIntegerQuery(pageSizeQuery, SHOPIFY_ADMIN_LIST_PAGE_SIZE, SHOPIFY_ADMIN_LIST_MAX_PAGE_SIZE);
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    const page = Math.min(parsePositiveIntegerQuery(pageQuery, 1), totalPages);
    const startIndex = (page - 1) * pageSize;
    return {
        count: items.length,
        page,
        pageSize,
        totalPages,
        data: items.slice(startIndex, startIndex + pageSize),
    };
};
const filterShopifyProductsBySearch = (products, searchQuery) => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
        return products;
    }
    return products.filter((product) => [
        product.title,
        product.vendor,
        product.handle ?? "",
        product.shopifyProductId?.toString() ?? "",
        product.collectionNames.join(" "),
        product.tags.join(" "),
    ].some((value) => value.toLowerCase().includes(normalizedQuery)));
};
const filterShopifyCollectionsBySearch = (collections, searchQuery) => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
        return collections;
    }
    return collections.filter((collection) => [
        collection.title,
        collection.type,
        collection.handle ?? "",
        collection.sortOrder,
        collection.id.toString(),
    ].some((value) => value.toLowerCase().includes(normalizedQuery)));
};
const ensureAllShopifyProductsData = async () => {
    if (isShopifyProductsCacheFresh() && cachedShopifyProductsResponse) {
        return cachedShopifyProductsResponse.data;
    }
    const [shopifyProducts, productMemberships, allCollections] = await Promise.all([
        fetchAllShopifyResources("/products.json", "products"),
        fetchAllShopifyProductMemberships(),
        fetchAllShopifyCollectionsSummary(),
    ]);
    const storeDomain = getStoreDomain();
    const productMembershipMap = new Map();
    const collectionById = new Map();
    const smartCollectionIdsByTitle = new Map();
    allCollections.forEach((collection) => {
        collectionById.set(collection.id, collection);
        if (collection.type === "smart") {
            const normalizedTitle = normalizeCollectionKey(collection.title);
            if (!normalizedTitle) {
                return;
            }
            const existingTitleIds = smartCollectionIdsByTitle.get(normalizedTitle) ?? [];
            smartCollectionIdsByTitle.set(normalizedTitle, [
                ...existingTitleIds,
                collection.id,
            ]);
        }
    });
    productMemberships.forEach((product) => {
        const productId = product.legacyResourceId !== undefined &&
            product.legacyResourceId !== null
            ? String(product.legacyResourceId)
            : "";
        if (!productId) {
            return;
        }
        productMembershipMap.set(productId, product);
    });
    const data = shopifyProducts
        .map((product) => {
        const productMembership = productMembershipMap.get(String(product.id));
        const tags = product.tags
            ? product.tags
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean)
            : [];
        return {
            id: String(product.id),
            shopifyProductId: product.id,
            title: product.title ?? "Untitled Product",
            handle: product.handle ?? null,
            vendor: product.vendor?.trim() || "Unknown Vendor",
            editableCollectionIds: productMembership
                ? [
                    ...new Set([
                        ...(Array.isArray(productMembership.collections?.nodes)
                            ? productMembership.collections.nodes
                                .map((collection) => Number(collection.legacyResourceId))
                                .filter((collectionId) => !Number.isNaN(collectionId) &&
                                collectionById.has(collectionId))
                            : []),
                        ...parseListMetafield(productMembership.metafield?.value)
                            .flatMap((collectionName) => smartCollectionIdsByTitle.get(normalizeCollectionKey(collectionName)) ?? [])
                            .filter((collectionId) => collectionById.has(collectionId)),
                    ]),
                ].sort((left, right) => left - right)
                : [],
            collectionNames: productMembership
                ? extractProductCollectionNames(productMembership)
                : [],
            tags,
            productUrl: product.handle
                ? `https://${storeDomain}/products/${product.handle}`
                : null,
            updatedAt: product.updated_at ?? null,
        };
    })
        .sort((left, right) => toSortableTime(right.updatedAt) -
        toSortableTime(left.updatedAt));
    cachedShopifyProductsResponse = {
        success: true,
        count: data.length,
        data,
    };
    cachedShopifyProductsFetchedAt = Date.now();
    return data;
};
const ensureAllShopifyCollectionsData = async () => {
    if (isShopifyCollectionsCacheFresh() && cachedShopifyCollectionsResponse) {
        return cachedShopifyCollectionsResponse.data;
    }
    const [collections, productMemberships] = await Promise.all([
        fetchAllShopifyCollectionsSummary(),
        fetchAllShopifyProductMemberships(),
    ]);
    const collectionLookup = new Map();
    const smartCollectionTitleLookup = new Map();
    const collectionCounts = new Map();
    collections.forEach((collection) => {
        collectionCounts.set(collection.id, 0);
        addCollectionLookupValue(collectionLookup, collection.title, collection.id);
        addCollectionLookupValue(collectionLookup, collection.handle, collection.id);
        if (collection.type === "smart") {
            addCollectionLookupValue(smartCollectionTitleLookup, collection.title, collection.id);
        }
    });
    productMemberships.forEach((product) => {
        const matchedCollectionIds = new Set();
        const defaultCollections = Array.isArray(product.collections?.nodes)
            ? product.collections.nodes
            : [];
        defaultCollections.forEach((collection) => {
            const resourceId = Number(collection.legacyResourceId);
            if (!Number.isNaN(resourceId) && collectionCounts.has(resourceId)) {
                matchedCollectionIds.add(resourceId);
            }
            const byTitle = collectionLookup.get(normalizeCollectionKey(collection.title));
            const byHandle = collectionLookup.get(normalizeCollectionKey(collection.handle));
            byTitle?.forEach((collectionId) => matchedCollectionIds.add(collectionId));
            byHandle?.forEach((collectionId) => matchedCollectionIds.add(collectionId));
        });
        parseListMetafield(product.metafield?.value).forEach((collectionName) => {
            const matchedIds = smartCollectionTitleLookup.get(normalizeCollectionKey(collectionName));
            matchedIds?.forEach((collectionId) => matchedCollectionIds.add(collectionId));
        });
        matchedCollectionIds.forEach((collectionId) => {
            collectionCounts.set(collectionId, (collectionCounts.get(collectionId) ?? 0) + 1);
        });
    });
    const data = collections
        .map((collection) => ({
        ...collection,
        productCount: collectionCounts.get(collection.id) ?? 0,
    }))
        .sort((left, right) => toSortableTime(right.updatedAt) -
        toSortableTime(left.updatedAt));
    cachedShopifyCollectionsResponse = {
        success: true,
        count: data.length,
        data,
    };
    cachedShopifyCollectionsFetchedAt = Date.now();
    return data;
};
const createUniqueList = (values) => {
    const uniqueValues = new Set();
    values.forEach((value) => {
        const normalizedValue = normalizeWhitespace(value);
        if (normalizedValue) {
            uniqueValues.add(normalizedValue);
        }
    });
    return Array.from(uniqueValues.values()).sort((left, right) => left.localeCompare(right));
};
const buildCategoryPaths = (csvRows) => {
    const uniquePaths = new Map();
    csvRows.forEach((row) => {
        const path = {
            topCategory: normalizeWhitespace(row.top_category),
            parentCategory: normalizeWhitespace(row.subcategory),
            finalCategory: normalizeWhitespace(row.final_category),
            collectionName: normalizeWhitespace(row.collection_title) ||
                normalizeWhitespace(row.final_category),
            collectionHandle: normalizeWhitespace(row.collection_handle),
        };
        if (!path.collectionHandle || !path.collectionName) {
            return;
        }
        uniquePaths.set([
            normalizeCollectionKey(path.topCategory),
            normalizeCollectionKey(path.parentCategory),
            normalizeCollectionKey(path.finalCategory),
            normalizeCollectionKey(path.collectionHandle),
        ].join("|"), path);
    });
    return Array.from(uniquePaths.values());
};
const matchesCategoryFilters = (path, filters) => {
    if (filters.topCategory &&
        normalizeCollectionKey(path.topCategory) !==
            normalizeCollectionKey(filters.topCategory)) {
        return false;
    }
    if (filters.parentCategory &&
        normalizeCollectionKey(path.parentCategory) !==
            normalizeCollectionKey(filters.parentCategory)) {
        return false;
    }
    if (filters.finalCategory &&
        normalizeCollectionKey(path.finalCategory) !==
            normalizeCollectionKey(filters.finalCategory)) {
        return false;
    }
    return true;
};
const hasActiveCategoryFilters = (filters) => Boolean(filters.topCategory || filters.parentCategory || filters.finalCategory);
const buildCategoryPathLookups = (paths) => {
    const pathsByHandle = new Map();
    const pathsByTitle = new Map();
    paths.forEach((path) => {
        const handleKey = normalizeCollectionKey(path.collectionHandle);
        const titleKey = normalizeCollectionKey(path.collectionName);
        pathsByHandle.set(handleKey, [...(pathsByHandle.get(handleKey) ?? []), path]);
        pathsByTitle.set(titleKey, [...(pathsByTitle.get(titleKey) ?? []), path]);
    });
    return { pathsByHandle, pathsByTitle };
};
const filterShopifyCollectionsByCategory = (collections, filters, allCategoryPaths) => {
    if (!hasActiveCategoryFilters(filters)) {
        return collections;
    }
    const { pathsByHandle, pathsByTitle } = buildCategoryPathLookups(allCategoryPaths.filter((path) => matchesCategoryFilters(path, filters)));
    return collections.filter((collection) => {
        const handleMatches = pathsByHandle.get(normalizeCollectionKey(collection.handle));
        const titleMatches = pathsByTitle.get(normalizeCollectionKey(collection.title));
        return Boolean((handleMatches && handleMatches.length > 0) ||
            (titleMatches && titleMatches.length > 0));
    });
};
const getMatchedProductCategoryPaths = (product, collectionsById, pathLookups) => {
    const matchedPathMap = new Map();
    const matchedCollections = product.editableCollectionIds
        .map((collectionId) => collectionsById.get(collectionId))
        .filter((collection) => Boolean(collection));
    matchedCollections.forEach((collection) => {
        const paths = pathLookups.pathsByHandle.get(normalizeCollectionKey(collection.handle));
        paths?.forEach((path) => {
            matchedPathMap.set(`${path.collectionHandle}|${path.topCategory}|${path.parentCategory}|${path.finalCategory}`, path);
        });
    });
    product.collectionNames.forEach((collectionName) => {
        const titleKey = normalizeCollectionKey(collectionName);
        const pathsByTitle = pathLookups.pathsByTitle.get(titleKey) ?? [];
        if (pathsByTitle.length !== 1) {
            return;
        }
        const [path] = pathsByTitle;
        matchedPathMap.set(`${path.collectionHandle}|${path.topCategory}|${path.parentCategory}|${path.finalCategory}`, path);
    });
    return Array.from(matchedPathMap.values()).sort((left, right) => {
        const topCompare = left.topCategory.localeCompare(right.topCategory);
        if (topCompare !== 0) {
            return topCompare;
        }
        const parentCompare = left.parentCategory.localeCompare(right.parentCategory);
        if (parentCompare !== 0) {
            return parentCompare;
        }
        return left.finalCategory.localeCompare(right.finalCategory);
    });
};
const filterShopifyProductsByCategory = (products, collections, filters, allCategoryPaths) => {
    if (!hasActiveCategoryFilters(filters)) {
        return products;
    }
    const filteredPaths = allCategoryPaths.filter((path) => matchesCategoryFilters(path, filters));
    const pathLookups = buildCategoryPathLookups(filteredPaths);
    const collectionsById = new Map();
    collections.forEach((collection) => {
        collectionsById.set(collection.id, collection);
    });
    return products.filter((product) => getMatchedProductCategoryPaths(product, collectionsById, pathLookups).length > 0);
};
const buildCollectionCategoryReport = async (searchQuery = "", filters = {
    topCategory: "",
    parentCategory: "",
    finalCategory: "",
}) => {
    const [csvRows, liveCollections] = await Promise.all([
        readCategoryCollectionRows(),
        ensureAllShopifyCollectionsData(),
    ]);
    const allCategoryPaths = buildCategoryPaths(csvRows);
    const liveCollectionsByHandle = new Map();
    const liveCollectionsByTitle = new Map();
    liveCollections.forEach((collection) => {
        const handleKey = normalizeCollectionKey(collection.handle);
        const titleKey = normalizeCollectionKey(collection.title);
        if (handleKey) {
            liveCollectionsByHandle.set(handleKey, collection);
        }
        if (titleKey) {
            liveCollectionsByTitle.set(titleKey, collection);
        }
    });
    const normalizedSearchQuery = searchQuery.trim().toLowerCase();
    const rows = allCategoryPaths
        .filter((path) => matchesCategoryFilters(path, filters))
        .map((path) => {
        const liveCollection = liveCollectionsByHandle.get(normalizeCollectionKey(path.collectionHandle)) ??
            liveCollectionsByTitle.get(normalizeCollectionKey(path.collectionName));
        return {
            topCategory: path.topCategory,
            parentCategory: path.parentCategory,
            finalCategory: path.finalCategory,
            collectionName: path.collectionName,
            collectionHandle: path.collectionHandle,
            collectionType: liveCollection?.type ?? "missing",
            liveCollectionFound: Boolean(liveCollection),
            productCount: liveCollection?.productCount ?? 0,
            published: liveCollection?.published ?? false,
            updatedAt: liveCollection?.updatedAt ?? null,
            collectionUrl: liveCollection?.collectionUrl ?? null,
        };
    })
        .filter((row) => {
        if (!normalizedSearchQuery) {
            return true;
        }
        return [
            row.collectionName,
            row.collectionHandle,
            row.collectionType,
            row.topCategory,
            row.parentCategory,
            row.finalCategory,
        ].some((value) => value.toLowerCase().includes(normalizedSearchQuery));
    })
        .filter((row) => Boolean(row))
        .sort((left, right) => {
        if (right.productCount !== left.productCount) {
            return right.productCount - left.productCount;
        }
        return left.collectionName.localeCompare(right.collectionName);
    });
    const summary = {
        generatedAt: new Date().toISOString(),
        rowCount: rows.length,
        collectionsWithProducts: rows.filter((row) => row.productCount > 0).length,
        missingCollections: rows.filter((row) => !row.liveCollectionFound).length,
    };
    return { rows, summary };
};
const buildProductCategoryReport = async (searchQuery = "", filters = {
    topCategory: "",
    parentCategory: "",
    finalCategory: "",
}) => {
    const [csvRows, products, collections] = await Promise.all([
        readCategoryCollectionRows(),
        ensureAllShopifyProductsData(),
        ensureAllShopifyCollectionsData(),
    ]);
    const allCategoryPaths = buildCategoryPaths(csvRows);
    const filteredProducts = filterShopifyProductsByCategory(filterShopifyProductsBySearch(products, searchQuery), collections, filters, allCategoryPaths);
    const collectionsById = new Map();
    const pathLookups = buildCategoryPathLookups(allCategoryPaths);
    collections.forEach((collection) => {
        collectionsById.set(collection.id, collection);
    });
    const rows = filteredProducts
        .map((product) => {
        const matchedCollections = product.editableCollectionIds
            .map((collectionId) => collectionsById.get(collectionId))
            .filter((collection) => Boolean(collection));
        const matchedCategoryPaths = getMatchedProductCategoryPaths(product, collectionsById, pathLookups);
        return {
            id: product.id,
            shopifyProductId: product.shopifyProductId,
            title: product.title,
            handle: product.handle,
            vendor: product.vendor,
            productUrl: product.productUrl,
            collectionNames: createUniqueList(product.collectionNames),
            collectionHandles: createUniqueList(matchedCollections
                .map((collection) => collection.handle ?? "")
                .filter(Boolean)),
            topCategories: createUniqueList(matchedCategoryPaths.map((path) => path.topCategory)),
            parentCategories: createUniqueList(matchedCategoryPaths.map((path) => path.parentCategory)),
            finalCategories: createUniqueList(matchedCategoryPaths.map((path) => path.finalCategory)),
            matchedCategoryPaths,
            tags: createUniqueList(product.tags),
            updatedAt: product.updatedAt,
        };
    })
        .sort((left, right) => left.title.localeCompare(right.title));
    const summary = {
        generatedAt: new Date().toISOString(),
        rowCount: rows.length,
        productsWithMappedCategories: rows.filter((row) => row.matchedCategoryPaths.length > 0).length,
        productsWithoutMappedCategories: rows.filter((row) => row.matchedCategoryPaths.length === 0).length,
    };
    return { rows, summary };
};
const wrapPdfLine = (value, maxLength = 96) => {
    const normalizedValue = normalizeWhitespace(value).replace(/[^\x20-\x7E]/g, "?");
    if (normalizedValue.length <= maxLength) {
        return [normalizedValue];
    }
    const words = normalizedValue.split(" ");
    const lines = [];
    let currentLine = "";
    words.forEach((word) => {
        const nextLine = currentLine ? `${currentLine} ${word}` : word;
        if (nextLine.length <= maxLength) {
            currentLine = nextLine;
            return;
        }
        if (currentLine) {
            lines.push(currentLine);
        }
        currentLine = word;
    });
    if (currentLine) {
        lines.push(currentLine);
    }
    return lines;
};
const escapePdfText = (value) => value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const buildPdfBuffer = (lines) => {
    const linesPerPage = 48;
    const pages = [];
    for (let index = 0; index < lines.length; index += linesPerPage) {
        pages.push(lines.slice(index, index + linesPerPage));
    }
    if (pages.length === 0) {
        pages.push(["No data"]);
    }
    const fontObjectId = 3 + pages.length * 2;
    const objects = [];
    const pageObjectIds = [];
    objects.push("<< /Type /Catalog /Pages 2 0 R >>");
    objects.push("");
    pages.forEach((pageLines, pageIndex) => {
        const pageObjectId = 3 + pageIndex * 2;
        const contentObjectId = pageObjectId + 1;
        const textLines = pageLines.flatMap((line) => wrapPdfLine(line));
        const contentStream = [
            "BT",
            "/F1 10 Tf",
            "14 TL",
            "40 760 Td",
            ...textLines.map((line, index) => `${index === 0 ? "" : "T* "}(${escapePdfText(line)}) Tj`.trim()),
            "ET",
        ].join("\n");
        pageObjectIds.push(pageObjectId);
        objects[pageObjectId - 1] =
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
        objects[contentObjectId - 1] =
            `<< /Length ${Buffer.byteLength(contentStream, "utf8")} >>\nstream\n${contentStream}\nendstream`;
    });
    objects[1] = `<< /Type /Pages /Kids [${pageObjectIds
        .map((pageObjectId) => `${pageObjectId} 0 R`)
        .join(" ")}] /Count ${pageObjectIds.length} >>`;
    objects[fontObjectId - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>";
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((object, index) => {
        offsets.push(Buffer.byteLength(pdf, "utf8"));
        pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = Buffer.byteLength(pdf, "utf8");
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += "0000000000 65535 f \n";
    offsets.slice(1).forEach((offset) => {
        pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return Buffer.from(pdf, "utf8");
};
router.get("/category-filters", async (_req, res) => {
    try {
        const paths = buildCategoryPaths(await readCategoryCollectionRows());
        return res.json({
            success: true,
            data: {
                paths,
            },
        });
    }
    catch (error) {
        console.error("Shopify category filters fetch error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to load Shopify category filters",
        });
    }
});
const fetchShopifyProductMembership = async (productId) => {
    const response = await shopifyHttp_1.shopifyGraphQL.post("", {
        query: `
      query GetShopifyProductMembership($id: ID!) {
        node(id: $id) {
          ... on Product {
            legacyResourceId
            metafield(namespace: "custom", key: "type_multiple") {
              value
            }
            collections(first: 250) {
              nodes {
                legacyResourceId
                title
                handle
              }
            }
          }
        }
      }
    `,
        variables: {
            id: toProductGid(productId),
        },
    });
    if (response.data?.errors?.length) {
        throw new Error(getGraphQlErrorMessage(response.data.errors, "Failed to load Shopify product collections"));
    }
    return response.data?.data?.node ?? null;
};
const setProductTypeMultipleValues = async (productId, values) => {
    const productGid = toProductGid(productId);
    if (values.length === 0) {
        const deleteResponse = await shopifyHttp_1.shopifyGraphQL.post("", {
            query: `
        mutation DeleteTypeMultipleMetafield(
          $metafields: [MetafieldIdentifierInput!]!
        ) {
          metafieldsDelete(metafields: $metafields) {
            userErrors {
              message
            }
          }
        }
      `,
            variables: {
                metafields: [
                    {
                        ownerId: productGid,
                        namespace: "custom",
                        key: "type_multiple",
                    },
                ],
            },
        });
        if (deleteResponse.data?.errors?.length) {
            throw new Error(getGraphQlErrorMessage(deleteResponse.data.errors, "Failed to clear Type Multiple collections"));
        }
        const deleteUserErrors = deleteResponse.data?.data?.metafieldsDelete?.userErrors ?? [];
        if (deleteUserErrors.length > 0) {
            throw new Error(getGraphQlErrorMessage(deleteUserErrors, "Failed to clear Type Multiple collections"));
        }
        return;
    }
    const setResponse = await shopifyHttp_1.shopifyGraphQL.post("", {
        query: `
      mutation SetTypeMultipleMetafield(
        $metafields: [MetafieldsSetInput!]!
      ) {
        metafieldsSet(metafields: $metafields) {
          userErrors {
            message
          }
        }
      }
    `,
        variables: {
            metafields: [
                {
                    ownerId: productGid,
                    namespace: "custom",
                    key: "type_multiple",
                    type: "list.single_line_text_field",
                    value: JSON.stringify(values),
                },
            ],
        },
    });
    if (setResponse.data?.errors?.length) {
        throw new Error(getGraphQlErrorMessage(setResponse.data.errors, "Failed to update Type Multiple collections"));
    }
    const setUserErrors = setResponse.data?.data?.metafieldsSet?.userErrors ?? [];
    if (setUserErrors.length > 0) {
        throw new Error(getGraphQlErrorMessage(setUserErrors, "Failed to update Type Multiple collections"));
    }
};
const syncProductCustomCollections = async ({ productId, currentCustomCollectionIds, desiredCustomCollectionIds, }) => {
    const currentCustomSet = new Set(currentCustomCollectionIds);
    const desiredCustomSet = new Set(desiredCustomCollectionIds);
    const collectionsToAdd = desiredCustomCollectionIds.filter((collectionId) => !currentCustomSet.has(collectionId));
    const collectionsToRemove = currentCustomCollectionIds.filter((collectionId) => !desiredCustomSet.has(collectionId));
    await Promise.all(collectionsToAdd.map((collectionId) => shopifyHttp_1.shopifyRest.post("/collects.json", {
        collect: {
            product_id: productId,
            collection_id: collectionId,
        },
    })));
    if (collectionsToRemove.length === 0) {
        return;
    }
    const collectsResponse = await shopifyHttp_1.shopifyRest.get("/collects.json", {
        params: {
            product_id: productId,
            limit: 250,
        },
    });
    const collects = Array.isArray(collectsResponse.data?.collects)
        ? collectsResponse.data?.collects ?? []
        : [];
    const collectIdsToDelete = collects
        .filter((collect) => collectionsToRemove.includes(collect.collection_id))
        .map((collect) => collect.id);
    await Promise.all(collectIdsToDelete.map((collectId) => shopifyHttp_1.shopifyRest.delete(`/collects/${collectId}.json`)));
};
const fetchAllShopifyProductMemberships = async () => {
    const products = [];
    let cursor = null;
    let hasNextPage = true;
    const query = `
    query ShopifyProductsForCollections($first: Int!, $after: String) {
      products(first: $first, after: $after) {
        nodes {
          legacyResourceId
          metafield(namespace: "custom", key: "type_multiple") {
            value
          }
          collections(first: 250) {
            nodes {
              legacyResourceId
              title
              handle
            }
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
        const productsConnection = response.data?.data?.products;
        const pageProducts = Array.isArray(productsConnection?.nodes)
            ? productsConnection.nodes
            : [];
        products.push(...pageProducts);
        hasNextPage = Boolean(productsConnection?.pageInfo?.hasNextPage);
        cursor = productsConnection?.pageInfo?.endCursor ?? null;
    }
    return products;
};
const fetchAllPublications = async () => {
    const publications = [];
    let cursor = null;
    let hasNextPage = true;
    const query = `
    query GetPublications($first: Int!, $after: String) {
      publications(first: $first, after: $after) {
        nodes {
          id
          name
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
            throw new Error(getGraphQlErrorMessage(response.data.errors, "Failed to load Shopify sales channels"));
        }
        const publicationsConnection = response.data?.data?.publications;
        const pagePublications = Array.isArray(publicationsConnection?.nodes)
            ? publicationsConnection.nodes
            : [];
        publications.push(...pagePublications);
        hasNextPage = Boolean(publicationsConnection?.pageInfo?.hasNextPage);
        cursor = publicationsConnection?.pageInfo?.endCursor ?? null;
    }
    return publications;
};
const publishCollectionToAllPublications = async (collectionId) => {
    const publications = await fetchAllPublications();
    if (publications.length === 0) {
        return {
            publicationCount: 0,
        };
    }
    const publishResponse = await shopifyHttp_1.shopifyGraphQL.post("", {
        query: `
      mutation PublishCollectionToAllChannels(
        $id: ID!
        $input: [PublicationInput!]!
      ) {
        publishablePublish(id: $id, input: $input) {
          userErrors {
            message
          }
        }
      }
    `,
        variables: {
            id: collectionId,
            input: publications.map((publication) => ({
                publicationId: publication.id,
            })),
        },
    });
    if (publishResponse.data?.errors?.length) {
        throw new Error(getGraphQlErrorMessage(publishResponse.data.errors, "Collection was created but could not be published to sales channels"));
    }
    const publishUserErrors = publishResponse.data?.data?.publishablePublish?.userErrors ?? [];
    if (publishUserErrors.length > 0) {
        throw new Error(getGraphQlErrorMessage(publishUserErrors, "Collection was created but could not be published to sales channels"));
    }
    return {
        publicationCount: publications.length,
    };
};
const fetchPublishedPublicationIdsForCollection = async (collectionId) => {
    const publicationIds = [];
    let cursor = null;
    let hasNextPage = true;
    const query = `
    query GetPublishedCollectionPublications(
      $id: ID!
      $first: Int!
      $after: String
    ) {
      node(id: $id) {
        ... on Collection {
          resourcePublications(first: $first, after: $after) {
            nodes {
              isPublished
              publication {
                id
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    }
  `;
    while (hasNextPage) {
        const response = await shopifyHttp_1.shopifyGraphQL.post("", {
            query,
            variables: {
                id: collectionId,
                first: SHOPIFY_GRAPHQL_PAGE_SIZE,
                after: cursor,
            },
        });
        if (response.data?.errors?.length) {
            throw new Error(getGraphQlErrorMessage(response.data.errors, "Failed to load Shopify collection publications"));
        }
        const publicationsConnection = response.data?.data?.node?.resourcePublications;
        const publicationNodes = Array.isArray(publicationsConnection?.nodes)
            ? publicationsConnection.nodes
            : [];
        publicationNodes.forEach((publicationNode) => {
            if (publicationNode.isPublished && publicationNode.publication?.id) {
                publicationIds.push(publicationNode.publication.id);
            }
        });
        hasNextPage = Boolean(publicationsConnection?.pageInfo?.hasNextPage);
        cursor = publicationsConnection?.pageInfo?.endCursor ?? null;
    }
    return [...new Set(publicationIds)];
};
const unpublishCollectionFromAllPublications = async (collectionId) => {
    const publicationIds = await fetchPublishedPublicationIdsForCollection(collectionId);
    if (publicationIds.length === 0) {
        return {
            publicationCount: 0,
        };
    }
    const unpublishResponse = await shopifyHttp_1.shopifyGraphQL.post("", {
        query: `
      mutation UnpublishCollectionFromAllChannels(
        $id: ID!
        $input: [PublicationInput!]!
      ) {
        publishableUnpublish(id: $id, input: $input) {
          userErrors {
            message
          }
        }
      }
    `,
        variables: {
            id: collectionId,
            input: publicationIds.map((publicationId) => ({
                publicationId,
            })),
        },
    });
    if (unpublishResponse.data?.errors?.length) {
        throw new Error(getGraphQlErrorMessage(unpublishResponse.data.errors, "Failed to unpublish Shopify collection from sales channels"));
    }
    const unpublishUserErrors = unpublishResponse.data?.data?.publishableUnpublish?.userErrors ?? [];
    if (unpublishUserErrors.length > 0) {
        throw new Error(getGraphQlErrorMessage(unpublishUserErrors, "Failed to unpublish Shopify collection from sales channels"));
    }
    return {
        publicationCount: publicationIds.length,
    };
};
const fetchTypeMultipleMetafieldDefinition = async () => {
    const response = await shopifyHttp_1.shopifyGraphQL.post("", {
        query: `
      query GetTypeMultipleMetafieldDefinition(
        $identifier: MetafieldDefinitionIdentifierInput!
      ) {
        metafieldDefinition(identifier: $identifier) {
          id
          name
          namespace
          key
          type {
            name
          }
          capabilities {
            smartCollectionCondition {
              enabled
            }
          }
        }
      }
    `,
        variables: {
            identifier: {
                ownerType: "PRODUCT",
                namespace: "custom",
                key: "type_multiple",
            },
        },
    });
    if (response.data?.errors?.length) {
        throw new Error(getGraphQlErrorMessage(response.data.errors, "Failed to load the Type Multiple metafield definition"));
    }
    return response.data?.data?.metafieldDefinition ?? null;
};
const fetchCollectionById = async (collectionGid) => {
    const response = await shopifyHttp_1.shopifyGraphQL.post("", {
        query: `
      query GetCollectionForDelete($id: ID!) {
        node(id: $id) {
          ... on Collection {
            id
            title
            handle
          }
        }
      }
    `,
        variables: {
            id: collectionGid,
        },
    });
    if (response.data?.errors?.length) {
        throw new Error(getGraphQlErrorMessage(response.data.errors, "Failed to load Shopify collection details"));
    }
    return response.data?.data?.node ?? null;
};
const ensureTypeMultipleSmartCollectionDefinition = async () => {
    const existingDefinition = await fetchTypeMultipleMetafieldDefinition();
    if (existingDefinition?.capabilities?.smartCollectionCondition?.enabled) {
        return existingDefinition;
    }
    if (!existingDefinition) {
        const createResponse = await shopifyHttp_1.shopifyGraphQL.post("", {
            query: `
        mutation CreateTypeMultipleMetafieldDefinition(
          $definition: MetafieldDefinitionInput!
        ) {
          metafieldDefinitionCreate(definition: $definition) {
            createdDefinition {
              id
              name
              namespace
              key
              type {
                name
              }
              capabilities {
                smartCollectionCondition {
                  enabled
                }
              }
            }
            userErrors {
              message
            }
          }
        }
      `,
            variables: {
                definition: {
                    name: "Type Multiple",
                    namespace: "custom",
                    key: "type_multiple",
                    ownerType: "PRODUCT",
                    type: "list.single_line_text_field",
                    capabilities: {
                        smartCollectionCondition: {
                            enabled: true,
                        },
                    },
                },
            },
        });
        if (createResponse.data?.errors?.length) {
            throw new Error(getGraphQlErrorMessage(createResponse.data.errors, "Failed to create the Type Multiple metafield definition"));
        }
        const createPayload = createResponse.data?.data?.metafieldDefinitionCreate;
        const createUserErrors = createPayload?.userErrors ?? [];
        if (createUserErrors.length > 0) {
            throw new Error(getGraphQlErrorMessage(createUserErrors, "Failed to enable Type Multiple as a smart collection condition"));
        }
        if (!createPayload?.createdDefinition) {
            throw new Error("Shopify did not return the created Type Multiple metafield definition");
        }
        return createPayload.createdDefinition;
    }
    const updateResponse = await shopifyHttp_1.shopifyGraphQL.post("", {
        query: `
      mutation UpdateTypeMultipleMetafieldDefinition(
        $definition: MetafieldDefinitionUpdateInput!
      ) {
        metafieldDefinitionUpdate(definition: $definition) {
          updatedDefinition {
            id
            name
            namespace
            key
            type {
              name
            }
            capabilities {
              smartCollectionCondition {
                enabled
              }
            }
          }
          userErrors {
            message
          }
        }
      }
    `,
        variables: {
            definition: {
                namespace: "custom",
                key: "type_multiple",
                ownerType: "PRODUCT",
                capabilities: {
                    smartCollectionCondition: {
                        enabled: true,
                    },
                },
            },
        },
    });
    if (updateResponse.data?.errors?.length) {
        throw new Error(getGraphQlErrorMessage(updateResponse.data.errors, "Failed to update the Type Multiple metafield definition"));
    }
    const updatePayload = updateResponse.data?.data?.metafieldDefinitionUpdate;
    const updateUserErrors = updatePayload?.userErrors ?? [];
    if (updateUserErrors.length > 0) {
        throw new Error(getGraphQlErrorMessage(updateUserErrors, "Failed to enable Type Multiple as a smart collection condition"));
    }
    if (!updatePayload?.updatedDefinition) {
        throw new Error("Shopify did not return the updated Type Multiple metafield definition");
    }
    return updatePayload.updatedDefinition;
};
router.get("/products", async (req, res) => {
    const searchQuery = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const shouldPaginate = req.query.page !== undefined || req.query.pageSize !== undefined;
    const categoryFilters = parseCategoryFilters(req.query);
    try {
        const [products, collections, csvRows] = await Promise.all([
            ensureAllShopifyProductsData(),
            ensureAllShopifyCollectionsData(),
            readCategoryCollectionRows(),
        ]);
        const filteredData = filterShopifyProductsByCategory(filterShopifyProductsBySearch(products, searchQuery), collections, categoryFilters, buildCategoryPaths(csvRows));
        if (!shouldPaginate) {
            return res.json({
                success: true,
                count: filteredData.length,
                data: filteredData,
            });
        }
        return res.json({
            success: true,
            ...paginateItems(filteredData, req.query.page, req.query.pageSize),
        });
    }
    catch (error) {
        console.error("Shopify products fetch error:", error);
        if (cachedShopifyProductsResponse) {
            const categoryPaths = buildCategoryPaths(await readCategoryCollectionRows());
            const collections = cachedShopifyCollectionsResponse?.data ??
                (await ensureAllShopifyCollectionsData());
            const filteredData = filterShopifyProductsByCategory(filterShopifyProductsBySearch(cachedShopifyProductsResponse.data, searchQuery), collections, categoryFilters, categoryPaths);
            if (!shouldPaginate) {
                return res.json({
                    success: true,
                    count: filteredData.length,
                    data: filteredData,
                });
            }
            return res.json({
                success: true,
                ...paginateItems(filteredData, req.query.page, req.query.pageSize),
            });
        }
        res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch Shopify products",
        });
    }
});
router.get("/collections", async (req, res) => {
    const searchQuery = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const shouldPaginate = req.query.page !== undefined || req.query.pageSize !== undefined;
    const categoryFilters = parseCategoryFilters(req.query);
    try {
        const [collections, csvRows] = await Promise.all([
            ensureAllShopifyCollectionsData(),
            readCategoryCollectionRows(),
        ]);
        const filteredData = filterShopifyCollectionsBySearch(filterShopifyCollectionsByCategory(collections, categoryFilters, buildCategoryPaths(csvRows)), searchQuery);
        if (!shouldPaginate) {
            return res.json({
                success: true,
                count: filteredData.length,
                data: filteredData,
            });
        }
        return res.json({
            success: true,
            ...paginateItems(filteredData, req.query.page, req.query.pageSize),
        });
    }
    catch (error) {
        console.error("Shopify collections fetch error:", error);
        if (cachedShopifyCollectionsResponse) {
            const categoryPaths = buildCategoryPaths(await readCategoryCollectionRows());
            const filteredData = filterShopifyCollectionsBySearch(filterShopifyCollectionsByCategory(cachedShopifyCollectionsResponse.data, categoryFilters, categoryPaths), searchQuery);
            if (!shouldPaginate) {
                return res.json({
                    success: true,
                    count: filteredData.length,
                    data: filteredData,
                });
            }
            return res.json({
                success: true,
                ...paginateItems(filteredData, req.query.page, req.query.pageSize),
            });
        }
        res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch Shopify collections",
        });
    }
});
router.get("/collections/export", async (req, res) => {
    const format = typeof req.query.format === "string"
        ? req.query.format.trim().toLowerCase()
        : "csv";
    const searchQuery = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const categoryFilters = parseCategoryFilters(req.query);
    if (!["csv", "json", "pdf"].includes(format)) {
        return res.status(400).json({
            success: false,
            message: "Export format must be csv, json, or pdf",
        });
    }
    try {
        const report = await buildCollectionCategoryReport(searchQuery, categoryFilters);
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const fileBaseName = `shopify-collections-category-report-${timestamp}`;
        if (format === "json") {
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.setHeader("Content-Disposition", `attachment; filename="${fileBaseName}.json"`);
            return res.send(JSON.stringify({
                summary: report.summary,
                rows: report.rows,
            }, null, 2));
        }
        if (format === "csv") {
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
                    "published",
                    "updated_at",
                    "collection_url",
                ]
                    .map((value) => csvEscape(value))
                    .join(","),
                ...report.rows.map((row) => [
                    row.topCategory,
                    row.parentCategory,
                    row.finalCategory,
                    row.collectionName,
                    row.collectionHandle,
                    row.collectionType,
                    row.liveCollectionFound,
                    row.productCount,
                    row.published,
                    row.updatedAt,
                    row.collectionUrl,
                ]
                    .map((value) => csvEscape(value))
                    .join(",")),
            ].join("\n");
            res.setHeader("Content-Type", "text/csv; charset=utf-8");
            res.setHeader("Content-Disposition", `attachment; filename="${fileBaseName}.csv"`);
            return res.send(csvLines);
        }
        const pdfLines = [
            "Shopify Collections Category Report",
            `Generated: ${report.summary.generatedAt}`,
            `Rows: ${report.summary.rowCount}`,
            `Collections with products: ${report.summary.collectionsWithProducts}`,
            `Missing collections: ${report.summary.missingCollections}`,
            "",
            ...report.rows.flatMap((row, index) => [
                `${index + 1}. ${row.collectionName} (${row.collectionHandle})`,
                `Top: ${row.topCategory || "-"} | Parent: ${row.parentCategory || "-"} | Final: ${row.finalCategory || "-"}`,
                `Type: ${row.collectionType} | Product count: ${row.productCount} | Published: ${row.published ? "Yes" : "No"}`,
                `Updated: ${row.updatedAt || "-"} | URL: ${row.collectionUrl || "-"}`,
                "",
            ]),
        ];
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${fileBaseName}.pdf"`);
        return res.send(buildPdfBuffer(pdfLines));
    }
    catch (error) {
        console.error("Shopify collections export error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to export Shopify collections report",
        });
    }
});
router.get("/products/export", async (req, res) => {
    const format = typeof req.query.format === "string"
        ? req.query.format.trim().toLowerCase()
        : "csv";
    const searchQuery = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const categoryFilters = parseCategoryFilters(req.query);
    if (!["csv", "json", "pdf"].includes(format)) {
        return res.status(400).json({
            success: false,
            message: "Export format must be csv, json, or pdf",
        });
    }
    try {
        const report = await buildProductCategoryReport(searchQuery, categoryFilters);
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const fileBaseName = `shopify-products-category-report-${timestamp}`;
        if (format === "json") {
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.setHeader("Content-Disposition", `attachment; filename="${fileBaseName}.json"`);
            return res.send(JSON.stringify({
                summary: report.summary,
                rows: report.rows,
            }, null, 2));
        }
        if (format === "csv") {
            const csvLines = [
                [
                    "shopify_product_id",
                    "title",
                    "handle",
                    "vendor",
                    "product_url",
                    "collection_names",
                    "collection_handles",
                    "top_categories",
                    "parent_categories",
                    "final_categories",
                    "tags",
                    "matched_category_paths_json",
                    "updated_at",
                ]
                    .map((value) => csvEscape(value))
                    .join(","),
                ...report.rows.map((row) => [
                    row.shopifyProductId,
                    row.title,
                    row.handle,
                    row.vendor,
                    row.productUrl,
                    row.collectionNames.join(" | "),
                    row.collectionHandles.join(" | "),
                    row.topCategories.join(" | "),
                    row.parentCategories.join(" | "),
                    row.finalCategories.join(" | "),
                    row.tags.join(" | "),
                    JSON.stringify(row.matchedCategoryPaths),
                    row.updatedAt,
                ]
                    .map((value) => csvEscape(value))
                    .join(",")),
            ].join("\n");
            res.setHeader("Content-Type", "text/csv; charset=utf-8");
            res.setHeader("Content-Disposition", `attachment; filename="${fileBaseName}.csv"`);
            return res.send(csvLines);
        }
        const pdfLines = [
            "Shopify Products Category Report",
            `Generated: ${report.summary.generatedAt}`,
            `Rows: ${report.summary.rowCount}`,
            `Products with mapped categories: ${report.summary.productsWithMappedCategories}`,
            `Products without mapped categories: ${report.summary.productsWithoutMappedCategories}`,
            "",
            ...report.rows.flatMap((row, index) => [
                `${index + 1}. ${row.title} (${row.shopifyProductId ?? row.id})`,
                `Vendor: ${row.vendor} | Handle: ${row.handle || "-"} | URL: ${row.productUrl || "-"}`,
                `Parent categories: ${row.parentCategories.join(", ") || "-"}`,
                `Top categories: ${row.topCategories.join(", ") || "-"}`,
                `Final categories: ${row.finalCategories.join(", ") || "-"}`,
                `Collections: ${row.collectionNames.join(", ") || "-"}`,
                "",
            ]),
        ];
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${fileBaseName}.pdf"`);
        return res.send(buildPdfBuffer(pdfLines));
    }
    catch (error) {
        console.error("Shopify products export error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to export Shopify products report",
        });
    }
});
router.post("/collections", async (req, res) => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const ruleValueInput = typeof req.body?.ruleValue === "string"
        ? req.body.ruleValue.trim()
        : "";
    const descriptionHtml = typeof req.body?.descriptionHtml === "string"
        ? req.body.descriptionHtml.trim()
        : "";
    if (!title) {
        return res.status(400).json({
            success: false,
            message: "Collection name is required",
        });
    }
    const ruleValue = ruleValueInput || title;
    try {
        const metafieldDefinition = await ensureTypeMultipleSmartCollectionDefinition();
        const createCollectionResponse = await shopifyHttp_1.shopifyGraphQL.post("", {
            query: `
        mutation CreateSmartCollection($input: CollectionInput!) {
          collectionCreate(input: $input) {
            collection {
              id
              title
              handle
              sortOrder
              updatedAt
              ruleSet {
                appliedDisjunctively
              }
            }
            userErrors {
              message
            }
          }
        }
      `,
            variables: {
                input: {
                    title,
                    ...(descriptionHtml ? { descriptionHtml } : {}),
                    ruleSet: {
                        appliedDisjunctively: true,
                        rules: [
                            {
                                column: "PRODUCT_METAFIELD_DEFINITION",
                                relation: "EQUALS",
                                condition: ruleValue,
                                conditionObjectId: metafieldDefinition.id,
                            },
                        ],
                    },
                },
            },
        });
        if (createCollectionResponse.data?.errors?.length) {
            throw new Error(getGraphQlErrorMessage(createCollectionResponse.data.errors, "Failed to create Shopify collection"));
        }
        const createPayload = createCollectionResponse.data?.data?.collectionCreate;
        const createUserErrors = createPayload?.userErrors ?? [];
        if (createUserErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: getGraphQlErrorMessage(createUserErrors, "Failed to create Shopify collection"),
            });
        }
        if (!createPayload?.collection) {
            throw new Error("Shopify did not return the created collection");
        }
        const publishResult = await publishCollectionToAllPublications(createPayload.collection.id ?? "");
        clearShopifyCollectionsCache();
        return res.status(201).json({
            success: true,
            message: publishResult.publicationCount > 0
                ? `Shopify collection created and published to ${publishResult.publicationCount} sales channel${publishResult.publicationCount === 1 ? "" : "s"}`
                : "Shopify collection created successfully",
            data: {
                id: parseNumericIdFromGid(createPayload.collection.id),
                title: createPayload.collection.title ?? title,
                handle: createPayload.collection.handle ?? null,
                type: "smart",
                sortOrder: createPayload.collection.sortOrder ?? "-",
                productCount: 0,
                published: publishResult.publicationCount > 0,
                publishedAt: publishResult.publicationCount > 0
                    ? new Date().toISOString()
                    : null,
                updatedAt: createPayload.collection.updatedAt ?? null,
                ruleValue,
                publicationCount: publishResult.publicationCount,
                collectionUrl: createPayload.collection.handle
                    ? `https://${getStoreDomain()}/collections/${createPayload.collection.handle}`
                    : null,
            },
        });
    }
    catch (error) {
        console.error("Shopify collection create error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to create Shopify collection",
        });
    }
});
router.patch("/collections/:id/publish", async (req, res) => {
    const rawCollectionId = req.params.id;
    const collectionId = Number(rawCollectionId);
    const published = typeof req.body?.published === "boolean" ? req.body.published : null;
    if (!rawCollectionId || Number.isNaN(collectionId)) {
        return res.status(400).json({
            success: false,
            message: "Valid collection ID is required",
        });
    }
    if (published === null) {
        return res.status(400).json({
            success: false,
            message: "Publish state is required",
        });
    }
    try {
        const collectionGid = toCollectionGid(collectionId);
        const [existingCollection, currentCollections] = await Promise.all([
            fetchCollectionById(collectionGid),
            fetchAllShopifyCollectionsSummary(),
        ]);
        if (!existingCollection?.id || !existingCollection.title) {
            return res.status(404).json({
                success: false,
                message: "Collection not found in Shopify",
            });
        }
        const currentCollection = currentCollections.find((collection) => collection.id === collectionId);
        if (!currentCollection) {
            return res.status(404).json({
                success: false,
                message: "Collection not found in Shopify",
            });
        }
        if (currentCollection.published === published) {
            return res.json({
                success: true,
                message: published
                    ? `Collection "${currentCollection.title}" is already published`
                    : `Collection "${currentCollection.title}" is already unpublished`,
                data: currentCollection,
            });
        }
        const publicationResult = published
            ? await publishCollectionToAllPublications(collectionGid)
            : await unpublishCollectionFromAllPublications(collectionGid);
        clearShopifyCollectionsCache();
        const refreshedCollection = (await fetchAllShopifyCollectionsSummary()).find((collection) => collection.id === collectionId);
        return res.json({
            success: true,
            message: published
                ? `Collection "${existingCollection.title}" published to ${publicationResult.publicationCount} sales channel${publicationResult.publicationCount === 1 ? "" : "s"}`
                : `Collection "${existingCollection.title}" unpublished from ${publicationResult.publicationCount} sales channel${publicationResult.publicationCount === 1 ? "" : "s"}`,
            data: {
                ...(refreshedCollection ?? currentCollection),
                publicationCount: publicationResult.publicationCount,
            },
        });
    }
    catch (error) {
        console.error("Shopify collection publish update error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to update Shopify collection publish state",
        });
    }
});
router.patch("/products/:id/collections", async (req, res) => {
    const rawProductId = req.params.id;
    const productId = Number(rawProductId);
    const selectedCollectionIds = Array.isArray(req.body?.selectedCollectionIds)
        ? req.body.selectedCollectionIds
            .map((collectionId) => Number(collectionId))
            .filter((collectionId) => !Number.isNaN(collectionId))
        : [];
    if (!rawProductId || Number.isNaN(productId)) {
        return res.status(400).json({
            success: false,
            message: "Valid product ID is required",
        });
    }
    try {
        const [productMembership, allCollections] = await Promise.all([
            fetchShopifyProductMembership(productId),
            fetchAllShopifyCollectionsSummary(),
        ]);
        if (!productMembership?.legacyResourceId) {
            return res.status(404).json({
                success: false,
                message: "Product not found in Shopify",
            });
        }
        const collectionById = new Map(allCollections.map((collection) => [collection.id, collection]));
        const smartCollectionsByTitle = new Map();
        allCollections
            .filter((collection) => collection.type === "smart")
            .forEach((collection) => {
            smartCollectionsByTitle.set(normalizeCollectionKey(collection.title), collection);
        });
        const invalidCollectionId = selectedCollectionIds.find((collectionId) => !collectionById.has(collectionId));
        if (invalidCollectionId) {
            return res.status(400).json({
                success: false,
                message: `Collection ${invalidCollectionId} is not a valid Shopify collection`,
            });
        }
        const desiredCollections = selectedCollectionIds
            .map((collectionId) => collectionById.get(collectionId))
            .filter((collection) => Boolean(collection));
        const desiredCustomCollectionIds = desiredCollections
            .filter((collection) => collection.type === "custom")
            .map((collection) => collection.id);
        const desiredSmartValues = desiredCollections
            .filter((collection) => collection.type === "smart")
            .map((collection) => collection.title);
        const currentCollections = Array.isArray(productMembership.collections?.nodes)
            ? productMembership.collections.nodes
            : [];
        const currentCustomCollectionIds = currentCollections
            .map((collection) => Number(collection.legacyResourceId))
            .filter((collectionId) => {
            if (Number.isNaN(collectionId)) {
                return false;
            }
            return collectionById.get(collectionId)?.type === "custom";
        });
        const currentTypeMultipleValues = parseListMetafield(productMembership.metafield?.value);
        const preservedSmartValues = currentTypeMultipleValues.filter((value) => {
            const matchedCollection = smartCollectionsByTitle.get(normalizeCollectionKey(value));
            return !matchedCollection;
        });
        const nextTypeMultipleValues = [
            ...new Set([
                ...preservedSmartValues,
                ...desiredSmartValues,
            ]),
        ];
        await Promise.all([
            syncProductCustomCollections({
                productId,
                currentCustomCollectionIds,
                desiredCustomCollectionIds,
            }),
            setProductTypeMultipleValues(productId, nextTypeMultipleValues),
        ]);
        clearShopifyProductsCache();
        clearShopifyCollectionsCache();
        const refreshedMembership = await fetchShopifyProductMembership(productId);
        const refreshedCollectionNames = refreshedMembership
            ? extractProductCollectionNames(refreshedMembership)
            : [];
        return res.json({
            success: true,
            message: "Product collections updated in Shopify",
            data: {
                productId,
                collectionNames: refreshedCollectionNames,
                selectedCollectionIds: selectedCollectionIds.sort((left, right) => left - right),
            },
        });
    }
    catch (error) {
        console.error("Shopify product collection update error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to update Shopify product collections",
        });
    }
});
router.delete("/collections/:id", async (req, res) => {
    const rawCollectionId = req.params.id;
    const collectionId = Number(rawCollectionId);
    const confirmationName = typeof req.body?.confirmationName === "string"
        ? req.body.confirmationName.trim()
        : "";
    if (!rawCollectionId || Number.isNaN(collectionId)) {
        return res.status(400).json({
            success: false,
            message: "Valid collection ID is required",
        });
    }
    if (!confirmationName) {
        return res.status(400).json({
            success: false,
            message: "Collection name confirmation is required",
        });
    }
    try {
        const collectionGid = toCollectionGid(collectionId);
        const existingCollection = await fetchCollectionById(collectionGid);
        if (!existingCollection?.id || !existingCollection.title) {
            return res.status(404).json({
                success: false,
                message: "Collection not found in Shopify",
            });
        }
        if (confirmationName !== existingCollection.title) {
            return res.status(400).json({
                success: false,
                message: "Typed collection name does not match exactly",
            });
        }
        const deleteResponse = await shopifyHttp_1.shopifyGraphQL.post("", {
            query: `
        mutation DeleteCollection($input: CollectionDeleteInput!) {
          collectionDelete(input: $input) {
            deletedCollectionId
            userErrors {
              message
            }
          }
        }
      `,
            variables: {
                input: {
                    id: collectionGid,
                },
            },
        });
        if (deleteResponse.data?.errors?.length) {
            throw new Error(getGraphQlErrorMessage(deleteResponse.data.errors, "Failed to delete Shopify collection"));
        }
        const deletePayload = deleteResponse.data?.data?.collectionDelete;
        const deleteUserErrors = deletePayload?.userErrors ?? [];
        if (deleteUserErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: getGraphQlErrorMessage(deleteUserErrors, "Failed to delete Shopify collection"),
            });
        }
        if (!deletePayload?.deletedCollectionId) {
            throw new Error("Shopify did not confirm the collection deletion");
        }
        clearShopifyCollectionsCache();
        return res.json({
            success: true,
            message: `Collection "${existingCollection.title}" deleted from Shopify`,
            data: {
                id: collectionId,
                title: existingCollection.title,
            },
        });
    }
    catch (error) {
        console.error("Shopify collection delete error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to delete Shopify collection",
        });
    }
});
exports.default = router;
