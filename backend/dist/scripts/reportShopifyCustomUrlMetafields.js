"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("../config/env");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const axios_1 = __importDefault(require("axios"));
const shopifyHttp_1 = require("../services/shopifyHttp");
const SHOPIFY_GRAPHQL_PAGE_SIZE = 100;
const EXPORTS_DIR = path_1.default.join(__dirname, "../../exports");
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const CONCURRENCY_ARG = process.argv.find((arg) => arg.startsWith("--concurrency="));
const REQUEST_TIMEOUT_ARG = process.argv.find((arg) => arg.startsWith("--timeout-ms="));
const PRODUCT_LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : null;
const WORKER_CONCURRENCY = CONCURRENCY_ARG
    ? Math.max(1, Number(CONCURRENCY_ARG.split("=")[1]) || 1)
    : 6;
const REQUEST_TIMEOUT_MS = REQUEST_TIMEOUT_ARG
    ? Math.max(1000, Number(REQUEST_TIMEOUT_ARG.split("=")[1]) || 1000)
    : 10000;
const REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};
const GENERIC_TOKENS = new Set([
    "app",
    "apps",
    "tool",
    "tools",
    "software",
    "platform",
    "service",
    "services",
    "solution",
    "solutions",
    "system",
    "systems",
    "cloud",
    "online",
    "digital",
]);
const NON_OFFICIAL_DOMAIN_PATTERNS = [
    /(^|\.)facebook\.com$/i,
    /(^|\.)instagram\.com$/i,
    /(^|\.)linkedin\.com$/i,
    /(^|\.)youtube\.com$/i,
    /(^|\.)youtu\.be$/i,
    /(^|\.)x\.com$/i,
    /(^|\.)twitter\.com$/i,
    /(^|\.)pinterest\.com$/i,
    /(^|\.)reddit\.com$/i,
    /(^|\.)tiktok\.com$/i,
    /(^|\.)wa\.me$/i,
    /(^|\.)whatsapp\.com$/i,
    /(^|\.)amazon\./i,
    /(^|\.)flipkart\.com$/i,
    /(^|\.)ebay\./i,
    /(^|\.)etsy\.com$/i,
    /(^|\.)g2\.com$/i,
    /(^|\.)capterra\.com$/i,
    /(^|\.)sourceforge\.net$/i,
    /(^|\.)trustpilot\.com$/i,
];
const normalizeWhitespace = (value) => value.replace(/\s+/g, " ").trim();
const csvEscape = (value) => {
    const stringValue = value === null || value === undefined ? "" : String(value);
    return `"${stringValue.replace(/"/g, '""')}"`;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const countMatches = (tokens, haystack) => tokens.filter((token) => haystack.includes(token)).length;
const tokenize = (value) => normalizeWhitespace((value ?? "").toLowerCase())
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !GENERIC_TOKENS.has(token));
const stripHtml = (value) => normalizeWhitespace(value
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">"));
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
const getHostname = (value) => {
    if (!value) {
        return "";
    }
    try {
        return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    }
    catch {
        return "";
    }
};
const getPathname = (value) => {
    if (!value) {
        return "";
    }
    try {
        return new URL(value).pathname || "/";
    }
    catch {
        return "";
    }
};
const areRelatedDomains = (left, right) => Boolean(left &&
    right &&
    (left === right ||
        left.endsWith(`.${right}`) ||
        right.endsWith(`.${left}`)));
const isNonOfficialDomain = (domain) => NON_OFFICIAL_DOMAIN_PATTERNS.some((pattern) => pattern.test(domain));
const isHomePagePath = (pathname) => {
    const normalized = (pathname || "/").trim().toLowerCase();
    return (normalized === "/" ||
        normalized === "" ||
        normalized === "/home" ||
        normalized === "/index.html" ||
        normalized === "/index.htm");
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
const extractTagText = (html, tagName) => {
    const match = html.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
    return match?.[1] ? stripHtml(match[1]) : "";
};
const getFinalResponseUrl = (response, fallbackUrl) => {
    const request = response.request;
    return (request?.res?.responseUrl ||
        request?._redirectable?._currentUrl ||
        fallbackUrl);
};
const getRedirectCount = (response) => {
    const request = response.request;
    return request?._redirectable?._redirectCount ?? 0;
};
const hasProductSchema = (html) => /"@type"\s*:\s*"(?:product|[\w:]+product)"/i.test(html.toLowerCase()) ||
    /"@type"\s*:\s*\[[^\]]*"product"/i.test(html.toLowerCase());
const classifyProbeResult = ({ product, requestedUrl, finalUrl, httpStatus, pageTitle, heading, html, failureReason, redirectCount, contentType, }) => {
    const normalizedRequestedUrl = requestedUrl && isLikelyHttpUrl(requestedUrl)
        ? sanitizeUrl(requestedUrl)
        : requestedUrl;
    const finalDomain = getHostname(finalUrl);
    const finalPath = getPathname(finalUrl);
    const haystack = normalizeWhitespace([
        finalDomain.replace(/[.-]+/g, " "),
        finalPath.replace(/[-_/]+/g, " "),
        pageTitle,
        heading,
    ].join(" ")).toLowerCase();
    const titleTokens = tokenize(product.title);
    const vendorTokens = tokenize(product.vendor);
    const titleMatches = countMatches(titleTokens, haystack);
    const vendorMatches = countMatches(vendorTokens, haystack);
    const productSchema = html ? hasProductSchema(html) : false;
    const urlStatus = httpStatus !== null && httpStatus >= 200 && httpStatus < 400
        ? "working"
        : "unreachable";
    let officialWebsiteAssessment = "unclear";
    if (!normalizedRequestedUrl || !isLikelyHttpUrl(normalizedRequestedUrl)) {
        officialWebsiteAssessment = "invalid_url";
    }
    else if (areRelatedDomains(finalDomain || getHostname(normalizedRequestedUrl), getHostname(product.onlineStoreUrl)) ||
        areRelatedDomains(finalDomain || getHostname(normalizedRequestedUrl), getHostname(`https://${process.env.SHOPIFY_STORE_DOMAIN ?? ""}`)) ||
        /(^|\.)myshopify\.com$/i.test(finalDomain || getHostname(normalizedRequestedUrl))) {
        officialWebsiteAssessment = "shopify_storefront_url";
    }
    else if (isNonOfficialDomain(finalDomain || getHostname(normalizedRequestedUrl))) {
        officialWebsiteAssessment = "social_or_marketplace_url";
    }
    else if (vendorMatches >= 1 ||
        titleMatches >= Math.min(2, Math.max(1, titleTokens.length)) ||
        productSchema) {
        officialWebsiteAssessment = "likely_official_website";
    }
    else if (urlStatus === "working" && !finalDomain) {
        officialWebsiteAssessment = "unclear";
    }
    let landingType = "unreachable";
    if (urlStatus === "working") {
        if (productSchema ||
            titleMatches >= Math.min(2, Math.max(1, titleTokens.length)) ||
            (titleMatches >= 1 && vendorMatches >= 1)) {
            landingType = "product_page";
        }
        else if (isHomePagePath(finalPath)) {
            landingType = "home_page";
        }
        else {
            landingType = "other_page";
        }
    }
    const notes = [];
    if (redirectCount > 0) {
        notes.push(`redirected_${redirectCount}_time${redirectCount === 1 ? "" : "s"}`);
    }
    if (titleMatches > 0) {
        notes.push(`title_token_matches:${titleMatches}`);
    }
    if (vendorMatches > 0) {
        notes.push(`vendor_token_matches:${vendorMatches}`);
    }
    if (productSchema) {
        notes.push("jsonld_product_schema");
    }
    if (failureReason) {
        notes.push(failureReason);
    }
    return {
        requestedUrl,
        normalizedRequestedUrl,
        finalUrl,
        finalDomain,
        finalPath,
        httpStatus,
        urlStatus,
        officialWebsiteAssessment,
        landingType,
        redirectCount,
        pageTitle,
        heading,
        contentType,
        failureReason,
        notes,
    };
};
const fetchAllProducts = async () => {
    const products = [];
    let cursor = null;
    let hasNextPage = true;
    while (hasNextPage) {
        const response = await withRetries("Fetch Shopify products for custom URL report", () => shopifyHttp_1.shopifyGraphQL.post("", {
            query: `
          query FetchProductsForCustomUrlReport($first: Int!, $after: String) {
            products(first: $first, after: $after) {
              nodes {
                id
                legacyResourceId
                title
                handle
                vendor
                status
                onlineStoreUrl
                customUrlMetafield: metafield(namespace: "custom", key: "custom") {
                  type
                  value
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        `,
            variables: {
                first: SHOPIFY_GRAPHQL_PAGE_SIZE,
                after: cursor,
            },
        }));
        if (response.data?.errors?.length) {
            throw new Error(getGraphQlErrorMessage(response.data.errors, "Failed to fetch Shopify products for the custom URL report"));
        }
        const connection = response.data?.data?.products;
        const nodes = Array.isArray(connection?.nodes) ? connection.nodes : [];
        nodes.forEach((node) => {
            const productId = Number(node.legacyResourceId);
            if (!node.id || Number.isNaN(productId)) {
                return;
            }
            const rawUrl = normalizeWhitespace(node.customUrlMetafield?.value ?? "");
            products.push({
                graphqlId: node.id,
                productId,
                title: normalizeWhitespace(node.title ?? "Untitled Product"),
                handle: node.handle?.trim() ?? null,
                vendor: normalizeWhitespace(node.vendor ?? ""),
                status: normalizeWhitespace(node.status ?? ""),
                onlineStoreUrl: normalizeWhitespace(node.onlineStoreUrl ?? "") || null,
                customUrlType: normalizeWhitespace(node.customUrlMetafield?.type ?? "") || null,
                customUrlRaw: rawUrl || null,
                customUrl: rawUrl ? sanitizeUrl(rawUrl) : null,
            });
        });
        hasNextPage = Boolean(connection?.pageInfo?.hasNextPage);
        cursor = connection?.pageInfo?.endCursor ?? null;
    }
    return products;
};
const probeProductUrl = async (product) => {
    const requestedUrl = product.customUrl;
    if (!requestedUrl || !isLikelyHttpUrl(requestedUrl)) {
        const invalidProbe = classifyProbeResult({
            product,
            requestedUrl,
            finalUrl: null,
            httpStatus: null,
            pageTitle: "",
            heading: "",
            html: "",
            failureReason: "invalid_or_missing_http_url",
            redirectCount: 0,
            contentType: "",
        });
        return {
            productId: product.productId,
            graphqlId: product.graphqlId,
            title: product.title,
            handle: product.handle,
            vendor: product.vendor,
            status: product.status,
            onlineStoreUrl: product.onlineStoreUrl,
            metafieldType: product.customUrlType,
            metafieldUrl: product.customUrlRaw,
            normalizedMetafieldUrl: invalidProbe.normalizedRequestedUrl,
            urlStatus: invalidProbe.urlStatus,
            httpStatus: invalidProbe.httpStatus,
            finalUrl: invalidProbe.finalUrl,
            finalDomain: invalidProbe.finalDomain,
            redirectCount: invalidProbe.redirectCount,
            officialWebsiteAssessment: invalidProbe.officialWebsiteAssessment,
            landingType: invalidProbe.landingType,
            pageTitle: invalidProbe.pageTitle,
            heading: invalidProbe.heading,
            failureReason: invalidProbe.failureReason,
            notes: invalidProbe.notes,
        };
    }
    try {
        const response = await withRetries(`Probe ${product.productId} ${requestedUrl}`, () => axios_1.default.get(requestedUrl, {
            timeout: REQUEST_TIMEOUT_MS,
            maxRedirects: 5,
            responseType: "text",
            headers: REQUEST_HEADERS,
            validateStatus: () => true,
            transformResponse: [
                (data) => typeof data === "string" ? data : String(data ?? ""),
            ],
        }), 2);
        const html = typeof response.data === "string" ? response.data : "";
        const pageTitle = extractTagText(html, "title");
        const heading = extractTagText(html, "h1");
        const finalUrl = sanitizeUrl(getFinalResponseUrl(response, requestedUrl));
        const contentType = typeof response.headers["content-type"] === "string"
            ? response.headers["content-type"]
            : Array.isArray(response.headers["content-type"])
                ? response.headers["content-type"].join(", ")
                : "";
        const probe = classifyProbeResult({
            product,
            requestedUrl,
            finalUrl,
            httpStatus: response.status ?? null,
            pageTitle,
            heading,
            html,
            failureReason: response.status >= 400 ? `http_${response.status}` : null,
            redirectCount: getRedirectCount(response),
            contentType,
        });
        return {
            productId: product.productId,
            graphqlId: product.graphqlId,
            title: product.title,
            handle: product.handle,
            vendor: product.vendor,
            status: product.status,
            onlineStoreUrl: product.onlineStoreUrl,
            metafieldType: product.customUrlType,
            metafieldUrl: product.customUrlRaw,
            normalizedMetafieldUrl: probe.normalizedRequestedUrl,
            urlStatus: probe.urlStatus,
            httpStatus: probe.httpStatus,
            finalUrl: probe.finalUrl,
            finalDomain: probe.finalDomain,
            redirectCount: probe.redirectCount,
            officialWebsiteAssessment: probe.officialWebsiteAssessment,
            landingType: probe.landingType,
            pageTitle: probe.pageTitle,
            heading: probe.heading,
            failureReason: probe.failureReason,
            notes: probe.notes,
        };
    }
    catch (error) {
        const failureReason = typeof error?.code === "string"
            ? error.code
            : typeof error?.message === "string"
                ? normalizeWhitespace(error.message)
                : "request_failed";
        const probe = classifyProbeResult({
            product,
            requestedUrl,
            finalUrl: null,
            httpStatus: null,
            pageTitle: "",
            heading: "",
            html: "",
            failureReason,
            redirectCount: 0,
            contentType: "",
        });
        return {
            productId: product.productId,
            graphqlId: product.graphqlId,
            title: product.title,
            handle: product.handle,
            vendor: product.vendor,
            status: product.status,
            onlineStoreUrl: product.onlineStoreUrl,
            metafieldType: product.customUrlType,
            metafieldUrl: product.customUrlRaw,
            normalizedMetafieldUrl: probe.normalizedRequestedUrl,
            urlStatus: probe.urlStatus,
            httpStatus: probe.httpStatus,
            finalUrl: probe.finalUrl,
            finalDomain: probe.finalDomain,
            redirectCount: probe.redirectCount,
            officialWebsiteAssessment: probe.officialWebsiteAssessment,
            landingType: probe.landingType,
            pageTitle: probe.pageTitle,
            heading: probe.heading,
            failureReason: probe.failureReason,
            notes: probe.notes,
        };
    }
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
const writeReportFiles = async (rows) => {
    await fs_1.default.promises.mkdir(EXPORTS_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseName = `shopify-product-custom-url-report-${timestamp}`;
    const jsonPath = path_1.default.join(EXPORTS_DIR, `${baseName}.json`);
    const csvPath = path_1.default.join(EXPORTS_DIR, `${baseName}.csv`);
    const summary = {
        generatedAt: new Date().toISOString(),
        concurrency: WORKER_CONCURRENCY,
        timeoutMs: REQUEST_TIMEOUT_MS,
        productCount: rows.length,
        workingCount: rows.filter((row) => row.urlStatus === "working").length,
        unreachableCount: rows.filter((row) => row.urlStatus === "unreachable")
            .length,
        homePageCount: rows.filter((row) => row.landingType === "home_page").length,
        productPageCount: rows.filter((row) => row.landingType === "product_page")
            .length,
        otherPageCount: rows.filter((row) => row.landingType === "other_page").length,
        officialWebsiteBreakdown: rows.reduce((accumulator, row) => {
            accumulator[row.officialWebsiteAssessment] =
                (accumulator[row.officialWebsiteAssessment] ?? 0) + 1;
            return accumulator;
        }, {}),
        rows,
    };
    await fs_1.default.promises.writeFile(jsonPath, JSON.stringify(summary, null, 2), "utf8");
    const csvLines = [
        [
            "product_id",
            "graphql_id",
            "title",
            "handle",
            "vendor",
            "status",
            "online_store_url",
            "metafield_type",
            "metafield_url",
            "normalized_metafield_url",
            "url_status",
            "http_status",
            "final_url",
            "final_domain",
            "redirect_count",
            "official_website_assessment",
            "landing_type",
            "page_title",
            "heading",
            "failure_reason",
            "notes",
        ]
            .map((value) => csvEscape(value))
            .join(","),
        ...rows.map((row) => [
            row.productId,
            row.graphqlId,
            row.title,
            row.handle,
            row.vendor,
            row.status,
            row.onlineStoreUrl,
            row.metafieldType,
            row.metafieldUrl,
            row.normalizedMetafieldUrl,
            row.urlStatus,
            row.httpStatus,
            row.finalUrl,
            row.finalDomain,
            row.redirectCount,
            row.officialWebsiteAssessment,
            row.landingType,
            row.pageTitle,
            row.heading,
            row.failureReason,
            row.notes.join(" | "),
        ]
            .map((value) => csvEscape(value))
            .join(",")),
    ].join("\n");
    await fs_1.default.promises.writeFile(csvPath, csvLines, "utf8");
    return { jsonPath, csvPath };
};
const main = async () => {
    console.log("Fetching Shopify products...");
    const allProducts = await fetchAllProducts();
    const urlTypeProducts = allProducts.filter((product) => product.customUrlType?.toLowerCase() === "url");
    const selectedProducts = PRODUCT_LIMIT && PRODUCT_LIMIT > 0
        ? urlTypeProducts.slice(0, PRODUCT_LIMIT)
        : urlTypeProducts;
    console.log(`Fetched ${allProducts.length} Shopify products.`);
    console.log(`Found ${urlTypeProducts.length} products where custom.custom is typed as URL.`);
    if (selectedProducts.length === 0) {
        throw new Error('No Shopify products were found with the "custom.custom" metafield typed as URL.');
    }
    console.log(`Probing ${selectedProducts.length} URL${selectedProducts.length === 1 ? "" : "s"} with concurrency ${WORKER_CONCURRENCY}...`);
    const rows = await mapWithConcurrency(selectedProducts, WORKER_CONCURRENCY, async (product, index) => {
        console.log(`[${index + 1}/${selectedProducts.length}] Checking ${product.productId}: ${product.title}`);
        return probeProductUrl(product);
    });
    const reportPaths = await writeReportFiles(rows);
    console.log(`Custom URL JSON report: ${reportPaths.jsonPath}`);
    console.log(`Custom URL CSV report: ${reportPaths.csvPath}`);
};
main().catch((error) => {
    console.error("Failed to generate the Shopify custom URL report:", error?.message ?? error);
    process.exitCode = 1;
});
