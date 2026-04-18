"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("../config/env");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const axios_1 = __importDefault(require("axios"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const shopifyHttp_1 = require("../services/shopifyHttp");
const SHOPIFY_GRAPHQL_PAGE_SIZE = 100;
const EXPORTS_DIR = path_1.default.join(__dirname, "../../exports");
const APPLY_CHANGES = process.argv.includes("--apply");
const INCLUDE_NON_ACTIVE = process.argv.includes("--include-non-active");
const FORCE_REWRITE = process.argv.includes("--force");
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const PRODUCT_LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : null;
const START_INDEX_ARG = process.argv.find((arg) => arg.startsWith("--start-index="));
const START_INDEX = START_INDEX_ARG
    ? Math.max(0, Number(START_INDEX_ARG.split("=")[1]) || 0)
    : 0;
const SKIPPED_REPORT_ARG = process.argv.find((arg) => arg.startsWith("--skipped-report="));
const PRODUCT_IDS_ARG = process.argv.find((arg) => arg.startsWith("--product-ids="));
const MIN_WORDS_ARG = process.argv.find((arg) => arg.startsWith("--min-words="));
const MIN_WORDS = MIN_WORDS_ARG
    ? Math.max(0, Number(MIN_WORDS_ARG.split("=")[1]) || 0)
    : 400;
const CONCURRENCY_ARG = process.argv.find((arg) => arg.startsWith("--concurrency="));
const WORKER_CONCURRENCY = CONCURRENCY_ARG
    ? Math.max(1, Number(CONCURRENCY_ARG.split("=")[1]) || 1)
    : APPLY_CHANGES
        ? 2
        : 4;
const SUMMARY_ONLY = process.argv.includes("--summary-only");
const CUSTOM_URL_ONLY = process.argv.includes("--custom-url-only");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
};
const EXCLUDED_SEARCH_DOMAINS = new Set([
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "youtube.com",
    "x.com",
    "twitter.com",
    "pinterest.com",
    "reddit.com",
    "zhihu.com",
    "quora.com",
    "itmart24.com",
]);
const TRUSTED_DOMAIN_PATTERNS = [
    /(^|\.)wikipedia\.org$/,
    /(^|\.)g2\.com$/,
    /(^|\.)capterra\.com$/,
    /(^|\.)softwareadvice\.com$/,
    /(^|\.)pcmag\.com$/,
    /(^|\.)techradar\.com$/,
    /(^|\.)forbes\.com$/,
    /(^|\.)zdnet\.com$/,
    /(^|\.)crunchbase\.com$/,
    /(^|\.)sourceforge\.net$/,
    /(^|\.)investopedia\.com$/,
    /(^|\.)nerdwallet\.com$/,
    /(^|\.)trustpilot\.com$/,
];
const GENERIC_SEARCH_TOKENS = new Set([
    "ai",
    "app",
    "tool",
    "tools",
    "platform",
    "software",
    "service",
    "services",
    "assistant",
    "generator",
    "generating",
    "creating",
    "editing",
    "design",
    "analytics",
    "automation",
    "customer",
    "support",
]);
const normalizeWhitespace = (value) => value.replace(/\s+/g, " ").trim();
const decodeHtmlEntities = (value) => value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
const sanitizeUrl = (value) => {
    if (!value) {
        return "";
    }
    try {
        const parsed = new URL(value);
        [
            "msockid",
            "fbclid",
            "gclid",
            "mc_cid",
            "mc_eid",
            "ref",
            "ref_src",
        ].forEach((key) => parsed.searchParams.delete(key));
        Array.from(parsed.searchParams.keys()).forEach((key) => {
            if (/^utm_/i.test(key)) {
                parsed.searchParams.delete(key);
            }
        });
        const search = parsed.searchParams.toString();
        return `${parsed.origin}${parsed.pathname}${search ? `?${search}` : ""}`;
    }
    catch {
        return value;
    }
};
const stripHtml = (value) => normalizeWhitespace(decodeHtmlEntities(value
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")));
const normalizeKey = (value) => typeof value === "string"
    ? normalizeWhitespace(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
    : "";
const tokenize = (value) => normalizeKey(value)
    .split(" ")
    .filter((token) => token.length > 1);
const toUniqueList = (values) => {
    const seen = new Set();
    const result = [];
    values.forEach((value) => {
        const normalized = normalizeKey(value);
        if (!normalized || seen.has(normalized)) {
            return;
        }
        seen.add(normalized);
        result.push(normalizeWhitespace(value));
    });
    return result;
};
const countWords = (value) => normalizeWhitespace(value)
    .split(" ")
    .filter((word) => /[A-Za-z0-9]/.test(word)).length;
const extractCoreProductName = (value) => {
    const trimmed = normalizeWhitespace(value);
    const candidates = [
        trimmed.split(":")[0],
        trimmed.split("(")[0],
        trimmed.split(" - ")[0],
        trimmed.replace(/\s+by\s+[^()]+$/i, ""),
    ]
        .map((item) => normalizeWhitespace(item).replace(/\s+by\s+[A-Za-z0-9 .&-]+$/i, ""))
        .filter((item) => item.length >= 3);
    const chosen = candidates.sort((left, right) => left.length - right.length)[0] ?? trimmed;
    return chosen.length <= 70 ? chosen : truncateSmart(chosen, 70);
};
const stripPlanModifiers = (value) => normalizeWhitespace(value.replace(/\b(beginner|enterprise|professional|turbo|starter|basic|premium|pro|plus|business|standard|advanced)\b/gi, " "));
const buildSearchNameVariants = (value) => {
    const coreName = extractCoreProductName(value);
    const beforeColon = normalizeWhitespace(value).split(":")[0] ?? coreName;
    const simplifiedCoreName = stripPlanModifiers(coreName);
    const simplifiedBeforeColon = stripPlanModifiers(beforeColon);
    return toUniqueList([
        coreName,
        beforeColon,
        simplifiedCoreName,
        simplifiedBeforeColon,
        coreName.replace(/[·•]/g, "-"),
        coreName.replace(/[·•]/g, " "),
        coreName.replace(/[()]/g, " "),
        coreName.replace(/[^\p{L}\p{N}\s.+-]+/gu, " "),
        beforeColon.replace(/[·•]/g, "-"),
        beforeColon.replace(/[^\p{L}\p{N}\s.+-]+/gu, " "),
    ]
        .map((item) => normalizeWhitespace(item))
        .filter((item) => item.length >= 3)).slice(0, 5);
};
const escapeHtml = (value) => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hashString = (value) => {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }
    return hash;
};
const pickVariant = (values, seed) => values[seed % values.length];
const resolveInputPath = (value) => path_1.default.isAbsolute(value) ? value : path_1.default.resolve(process.cwd(), value);
const loadProductIdsFromSkippedReport = (reportArg) => {
    if (!reportArg) {
        return null;
    }
    const reportPath = resolveInputPath(reportArg.split("=")[1]);
    const payload = JSON.parse(fs_1.default.readFileSync(reportPath, "utf8"));
    const rows = Array.isArray(payload.skipped)
        ? payload.skipped
        : Array.isArray(payload.updates)
            ? payload.updates.filter((item) => item.updated === false)
            : [];
    return new Set(rows
        .map((row) => Number(row.productId))
        .filter((value) => !Number.isNaN(value)));
};
const PRODUCT_IDS = (PRODUCT_IDS_ARG
    ? new Set(PRODUCT_IDS_ARG
        .split("=")[1]
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => !Number.isNaN(value)))
    : null) ?? loadProductIdsFromSkippedReport(SKIPPED_REPORT_ARG);
const csvEscape = (value) => {
    const stringValue = value === null || value === undefined ? "" : String(value);
    return `"${stringValue.replace(/"/g, '""')}"`;
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
        message.includes("throttled"));
};
const withRetries = async (label, fn, maxAttempts = 5) => {
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
const fetchAllProducts = async () => {
    const products = [];
    let cursor = null;
    let hasNextPage = true;
    while (hasNextPage) {
        const response = await withRetries("Fetch Shopify products for SEO refresh", () => shopifyHttp_1.shopifyGraphQL.post("", {
            query: `
          query FetchProductsForSeoRefresh($first: Int!, $after: String) {
            products(first: $first, after: $after) {
              nodes {
                id
                legacyResourceId
                title
                handle
                descriptionHtml
                productType
                vendor
                tags
                status
                seo {
                  title
                  description
                }
                customUrlMetafield: metafield(namespace: "custom", key: "custom") {
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
            throw new Error(getGraphQlErrorMessage(response.data.errors, "Failed to fetch Shopify products for SEO refresh"));
        }
        const connection = response.data?.data?.products;
        const nodes = Array.isArray(connection?.nodes) ? connection.nodes : [];
        nodes.forEach((node) => {
            const productId = Number(node.legacyResourceId);
            if (!node.id || Number.isNaN(productId)) {
                return;
            }
            const descriptionHtml = node.descriptionHtml ?? "";
            const descriptionText = stripHtml(descriptionHtml);
            products.push({
                graphqlId: node.id,
                productId,
                title: normalizeWhitespace(node.title ?? "Untitled Product"),
                handle: node.handle?.trim() ?? null,
                descriptionHtml,
                descriptionText,
                descriptionWordCount: countWords(descriptionText),
                productType: normalizeWhitespace(node.productType ?? ""),
                vendor: normalizeWhitespace(node.vendor ?? ""),
                tags: Array.isArray(node.tags)
                    ? node.tags.map((tag) => normalizeWhitespace(tag)).filter(Boolean)
                    : [],
                status: normalizeWhitespace(node.status ?? ""),
                seoTitle: normalizeWhitespace(node.seo?.title ?? ""),
                seoDescription: normalizeWhitespace(node.seo?.description ?? ""),
                customUrl: normalizeWhitespace(node.customUrlMetafield?.value ?? "") || null,
            });
        });
        hasNextPage = Boolean(connection?.pageInfo?.hasNextPage);
        cursor = connection?.pageInfo?.endCursor ?? null;
    }
    return products;
};
const buildSelectionSummary = (products) => {
    const activeProducts = products.filter((product) => product.status.toLowerCase() === "active");
    const withCustomUrl = activeProducts.filter((product) => isLikelyHttpUrl(product.customUrl));
    const withoutCustomUrl = activeProducts.length - withCustomUrl.length;
    const belowWordTarget = activeProducts.filter((product) => product.descriptionWordCount < MIN_WORDS).length;
    return {
        totalProducts: products.length,
        activeProducts: activeProducts.length,
        inactiveProducts: products.length - activeProducts.length,
        activeWithCustomUrl: withCustomUrl.length,
        activeWithoutCustomUrl: withoutCustomUrl,
        activeBelowWordTarget: belowWordTarget,
    };
};
const collectJsonLdStrings = (value, keyHint = "") => {
    if (typeof value === "string") {
        const normalized = normalizeWhitespace(value);
        if (!normalized) {
            return [];
        }
        const key = keyHint.toLowerCase();
        if (key.includes("description") ||
            key.includes("name") ||
            key.includes("feature") ||
            key.includes("benefit") ||
            key.includes("keyword") ||
            key.includes("category")) {
            return [normalized];
        }
        return [];
    }
    if (Array.isArray(value)) {
        return value.flatMap((item) => collectJsonLdStrings(item, keyHint));
    }
    if (value && typeof value === "object") {
        return Object.entries(value).flatMap(([key, nestedValue]) => collectJsonLdStrings(nestedValue, key));
    }
    return [];
};
const filterContentLine = (value) => {
    const normalized = normalizeWhitespace(value);
    if (!normalized) {
        return false;
    }
    const lowered = normalized.toLowerCase();
    if (lowered.includes("cookie") ||
        lowered.includes("privacy policy") ||
        lowered.includes("terms of service") ||
        lowered.includes("all rights reserved") ||
        lowered.includes("sign in") ||
        lowered.includes("log in") ||
        lowered.includes("request a demo") ||
        lowered === "home" ||
        lowered === "pricing" ||
        lowered === "contact us") {
        return false;
    }
    if (normalized.length < 20) {
        return /[A-Za-z]/.test(normalized) && normalized.split(" ").length >= 2;
    }
    return true;
};
const extractMatchedText = (html, pattern, limit) => {
    const matches = html.match(pattern) ?? [];
    return toUniqueList(matches
        .slice(0, limit)
        .map((value) => stripHtml(value))
        .filter(filterContentLine));
};
const extractMetaContent = (html, attr, name) => {
    const pattern = new RegExp(`<meta[^>]+${attr}=["']${name}["'][^>]+content=["']([^"']+)["']`, "i");
    const match = html.match(pattern);
    return match?.[1] ? stripHtml(match[1]) : "";
};
const extractSourceProfile = (url, html) => {
    const cleanedHtml = html
        .replace(/<header[\s\S]*?<\/header>/gi, " ")
        .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
        .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
        .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
        .replace(/<form[\s\S]*?<\/form>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ");
    const titleMatch = cleanedHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const pageTitle = titleMatch?.[1] ? stripHtml(titleMatch[1]) : "";
    const metaDescription = extractMetaContent(cleanedHtml, "name", "description") ||
        extractMetaContent(cleanedHtml, "property", "og:description");
    const headings = toUniqueList([
        ...extractMatchedText(cleanedHtml, /<h1[^>]*>[\s\S]*?<\/h1>/gi, 3),
        ...extractMatchedText(cleanedHtml, /<h2[^>]*>[\s\S]*?<\/h2>/gi, 8),
        ...extractMatchedText(cleanedHtml, /<h3[^>]*>[\s\S]*?<\/h3>/gi, 8),
    ]).slice(0, 12);
    const paragraphs = extractMatchedText(cleanedHtml, /<p[^>]*>[\s\S]*?<\/p>/gi, 18).slice(0, 12);
    const featureBullets = extractMatchedText(cleanedHtml, /<li[^>]*>[\s\S]*?<\/li>/gi, 30)
        .filter((value) => value.length <= 220)
        .slice(0, 10);
    const jsonLdMatches = cleanedHtml.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
    const jsonLdStrings = toUniqueList(jsonLdMatches.flatMap((block) => {
        const inner = block.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)?.[1] ?? "";
        if (!inner.trim()) {
            return [];
        }
        try {
            return collectJsonLdStrings(JSON.parse(inner));
        }
        catch {
            return [];
        }
    })).slice(0, 12);
    const text = toUniqueList([
        pageTitle,
        metaDescription,
        ...headings,
        ...paragraphs,
        ...featureBullets,
        ...jsonLdStrings,
        new URL(url).pathname.replace(/[-_/]+/g, " "),
    ])
        .join(" ")
        .trim();
    return {
        url,
        domain: getHostname(url),
        pageTitle,
        metaDescription,
        headings,
        paragraphs,
        featureBullets,
        text,
        wordCount: countWords(text),
    };
};
const sourceProfileCache = new Map();
const searchCache = new Map();
const fetchSourceProfile = async (url) => {
    if (sourceProfileCache.has(url)) {
        return sourceProfileCache.get(url) ?? null;
    }
    try {
        const response = await withRetries(`Fetch source URL ${url}`, () => axios_1.default.get(url, {
            timeout: 9000,
            maxRedirects: 5,
            headers: REQUEST_HEADERS,
            validateStatus: (status) => status >= 200 && status < 400,
        }), 2);
        const profile = extractSourceProfile(url, String(response.data ?? ""));
        sourceProfileCache.set(url, profile);
        return profile;
    }
    catch {
        sourceProfileCache.set(url, null);
        return null;
    }
};
const decodeDuckDuckGoUrl = (href) => {
    const directMatch = href.match(/uddg=([^&]+)/i);
    if (directMatch?.[1]) {
        return decodeURIComponent(directMatch[1]);
    }
    if (href.startsWith("http://") || href.startsWith("https://")) {
        return href;
    }
    return "";
};
const decodeBingUrl = (href) => {
    if (!href) {
        return "";
    }
    const normalizedHref = decodeHtmlEntities(href).startsWith("/")
        ? `https://www.bing.com${decodeHtmlEntities(href)}`
        : decodeHtmlEntities(href);
    if (normalizedHref.startsWith("http://") || normalizedHref.startsWith("https://")) {
        const encodedMatch = normalizedHref.match(/[?&]u=([^&]+)/i);
        const encoded = encodedMatch?.[1] ? decodeURIComponent(encodedMatch[1]) : "";
        if (encoded.startsWith("a1")) {
            try {
                return sanitizeUrl(Buffer.from(encoded.slice(2), "base64").toString("utf8"));
            }
            catch {
                return sanitizeUrl(normalizedHref);
            }
        }
        return sanitizeUrl(normalizedHref);
    }
    return "";
};
const normalizeSearchResults = (results) => results.filter((result) => result.url &&
    result.domain &&
    !EXCLUDED_SEARCH_DOMAINS.has(result.domain));
const getSearchIdentityTokens = (product) => tokenize(extractCoreProductName(product.title)).filter((token) => token.length >= 3 && !GENERIC_SEARCH_TOKENS.has(token));
const getVendorSearchTokens = (product) => tokenize(product.vendor).filter((token) => token.length >= 3);
const getSearchContextTokens = (product) => {
    const identityTokens = new Set([
        ...getSearchIdentityTokens(product),
        ...getVendorSearchTokens(product),
    ]);
    return tokenize([product.title, product.productType, product.tags.join(" ")].join(" "))
        .filter((token) => token.length >= 4 &&
        !GENERIC_SEARCH_TOKENS.has(token) &&
        !identityTokens.has(token))
        .slice(0, 8);
};
const isTrustedSearchDomain = (domain) => TRUSTED_DOMAIN_PATTERNS.some((pattern) => pattern.test(domain));
const areRelatedDomains = (left, right) => Boolean(left &&
    right &&
    (left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`)));
const isHighConfidenceSearchDomain = ({ domain, preferredDomain, }) => areRelatedDomains(domain, preferredDomain) || isTrustedSearchDomain(domain);
const isRelevantSearchResult = ({ result, product, preferredDomain, }) => {
    const haystack = normalizeKey([result.title, result.snippet, result.domain].join(" "));
    const coreName = normalizeKey(extractCoreProductName(product.title));
    const productTokens = getSearchIdentityTokens(product);
    const vendorTokens = getVendorSearchTokens(product);
    const contextTokens = getSearchContextTokens(product);
    const matchedProductTokens = productTokens.filter((token) => haystack.includes(token));
    const matchedVendorTokens = vendorTokens.filter((token) => haystack.includes(token) || result.domain.includes(token));
    const matchedContextTokens = contextTokens.filter((token) => haystack.includes(token));
    const trustedDomain = isTrustedSearchDomain(result.domain);
    const ambiguousName = productTokens.length <= 1 || coreName.split(" ").length <= 1;
    if (preferredDomain && result.domain === preferredDomain) {
        return true;
    }
    if (coreName && haystack.includes(coreName)) {
        if (!ambiguousName) {
            return true;
        }
        return (trustedDomain ||
            matchedContextTokens.length > 0 ||
            (matchedVendorTokens.length > 0 && matchedContextTokens.length > 0));
    }
    if (matchedProductTokens.length >= Math.min(2, productTokens.length)) {
        return true;
    }
    if (matchedProductTokens.length >= 1 && matchedVendorTokens.length >= 1) {
        return true;
    }
    if (trustedDomain && matchedProductTokens.length >= 1) {
        return true;
    }
    if (ambiguousName &&
        matchedContextTokens.length > 0 &&
        (matchedProductTokens.length > 0 || matchedVendorTokens.length > 0)) {
        return true;
    }
    return false;
};
const fetchHtmlViaPowerShell = async (url) => {
    const escapedUrl = url.replace(/'/g, "''");
    const command = `$ProgressPreference='SilentlyContinue';` +
        `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;` +
        `$r = Invoke-WebRequest -UseBasicParsing -Uri '${escapedUrl}';` +
        `Write-Output $r.Content`;
    const powershellPath = process.env.ComSpec?.toLowerCase().includes("system32")
        ? "powershell.exe"
        : "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
    const { stdout } = await execFileAsync(powershellPath, ["-NoLogo", "-NoProfile", "-Command", command], {
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
        timeout: 15000,
    });
    return String(stdout ?? "");
};
const searchDuckDuckGo = async (query) => {
    const response = await withRetries(`Web search ${query}`, () => axios_1.default.get("https://html.duckduckgo.com/html/", {
        timeout: 9000,
        params: {
            q: query,
        },
        headers: REQUEST_HEADERS,
        validateStatus: (status) => status >= 200 && status < 400,
    }), 2);
    const html = String(response.data ?? "");
    const resultMatches = html.match(/<div class="result[\s\S]*?<\/div>\s*<\/div>/gi) ?? [];
    return normalizeSearchResults(resultMatches
        .slice(0, 10)
        .map((chunk) => {
        const title = chunk.match(/class="result__a"[\s\S]*?>([\s\S]*?)<\/a>/i)?.[1] ?? "";
        const href = chunk.match(/class="result__a"[^>]+href="([^"]+)"/i)?.[1] ?? "";
        const snippet = chunk.match(/class="result__snippet"[\s\S]*?>([\s\S]*?)<\/a>/i)?.[1] ??
            chunk.match(/class="result__snippet"[\s\S]*?>([\s\S]*?)<\/div>/i)?.[1] ??
            "";
        const url = decodeDuckDuckGoUrl(href);
        const domain = getHostname(url);
        return {
            title: stripHtml(title),
            snippet: stripHtml(snippet),
            url,
            domain,
        };
    }));
};
const searchBing = async (query) => {
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=en-US`;
    let html = "";
    try {
        html = await fetchHtmlViaPowerShell(searchUrl);
    }
    catch {
        const response = await withRetries(`Bing search ${query}`, () => axios_1.default.get("https://www.bing.com/search", {
            timeout: 9000,
            params: {
                q: query,
                setlang: "en-US",
            },
            headers: REQUEST_HEADERS,
            validateStatus: (status) => status >= 200 && status < 400,
        }), 2);
        html = String(response.data ?? "");
    }
    const chunkMatches = html.match(/<li class="b_algo"[\s\S]*?(?=<li class="b_algo"|<li class="b_ans"|<nav role="navigation"|<\/ol>)/gi) ?? [];
    const chunkResults = chunkMatches
        .slice(0, 10)
        .map((chunk) => {
        const href = chunk.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"/i)?.[1] ??
            chunk.match(/<a[^>]+href="([^"]+)"[^>]*h="ID=SERP/i)?.[1] ??
            "";
        const title = chunk.match(/<h2[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? "";
        const snippet = chunk.match(/<div class="b_caption"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ??
            chunk.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ??
            "";
        const url = decodeBingUrl(href);
        return {
            title: stripHtml(title),
            snippet: stripHtml(snippet),
            url,
            domain: getHostname(url),
        };
    })
        .filter((result) => result.title || result.snippet);
    if (chunkResults.length > 0) {
        return normalizeSearchResults(chunkResults);
    }
    const resultRegex = /<h2[^>]*><a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>[\s\S]{0,1800}?(?:<div class="b_caption"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>|<p[^>]*>([\s\S]*?)<\/p>)/gi;
    const fallbackResults = [];
    let match = null;
    while ((match = resultRegex.exec(html)) !== null && fallbackResults.length < 10) {
        const url = decodeBingUrl(match[1] ?? "");
        const title = stripHtml(match[2] ?? "");
        const snippet = stripHtml(match[3] ?? match[4] ?? "");
        fallbackResults.push({
            title,
            snippet,
            url,
            domain: getHostname(url),
        });
    }
    return normalizeSearchResults(fallbackResults);
};
const searchWeb = async (query) => {
    if (searchCache.has(query)) {
        return searchCache.get(query) ?? [];
    }
    try {
        const candidates = await Promise.allSettled([
            searchDuckDuckGo(query),
            searchBing(query),
        ]);
        const results = Array.from(new Map(candidates
            .flatMap((candidate) => candidate.status === "fulfilled" ? candidate.value : [])
            .map((item) => [item.url, item])).values());
        searchCache.set(query, results);
        return results;
    }
    catch {
        searchCache.set(query, []);
        return [];
    }
};
const scoreSearchResult = ({ result, product, preferredDomain, }) => {
    let score = 0;
    const haystack = normalizeKey([result.title, result.snippet, result.domain].join(" "));
    tokenize(product.title).forEach((token) => {
        if (haystack.includes(token)) {
            score += 5;
        }
    });
    tokenize(product.vendor).forEach((token) => {
        if (haystack.includes(token)) {
            score += 4;
        }
    });
    tokenize(product.productType).forEach((token) => {
        if (haystack.includes(token)) {
            score += 2;
        }
    });
    if (preferredDomain && result.domain === preferredDomain) {
        score += 20;
    }
    if (!preferredDomain) {
        tokenize(product.vendor).forEach((token) => {
            if (result.domain.includes(token)) {
                score += 4;
            }
        });
    }
    if (TRUSTED_DOMAIN_PATTERNS.some((pattern) => pattern.test(result.domain))) {
        score += 8;
    }
    if (result.url.toLowerCase().includes("pricing")) {
        score -= 1;
    }
    return score;
};
const mergeSourceProfiles = (profiles, fallbackUrl) => {
    if (profiles.length === 0) {
        return null;
    }
    const primary = profiles[0];
    const mergedText = toUniqueList(profiles.flatMap((profile) => [
        profile.pageTitle,
        profile.metaDescription,
        ...profile.headings,
        ...profile.paragraphs,
        ...profile.featureBullets,
    ])).join(" ");
    return {
        url: primary.url || fallbackUrl,
        domain: primary.domain || getHostname(fallbackUrl),
        pageTitle: primary.pageTitle,
        metaDescription: primary.metaDescription ||
            profiles.find((profile) => profile.metaDescription)?.metaDescription ||
            "",
        headings: toUniqueList(profiles.flatMap((profile) => profile.headings)).slice(0, 16),
        paragraphs: toUniqueList(profiles.flatMap((profile) => profile.paragraphs)).slice(0, 16),
        featureBullets: toUniqueList(profiles.flatMap((profile) => profile.featureBullets)).slice(0, 14),
        text: mergedText,
        wordCount: countWords(mergedText),
    };
};
const fetchProfilesFromResults = async (results, product, preferredDomain) => {
    const sorted = [...results].sort((left, right) => scoreSearchResult({
        result: right,
        product,
        preferredDomain,
    }) -
        scoreSearchResult({
            result: left,
            product,
            preferredDomain,
        }));
    const profiles = [];
    for (const result of sorted.slice(0, 6)) {
        const profile = await fetchSourceProfile(result.url);
        if (!profile) {
            continue;
        }
        profiles.push(profile);
    }
    return profiles;
};
const filterRelevantSearchResults = ({ results, product, preferredDomain, }) => results.filter((result) => isRelevantSearchResult({
    result,
    product,
    preferredDomain,
}));
const hasSufficientSourceDepth = (profile, product, preferredDomain = "") => {
    if (!profile) {
        return false;
    }
    if (preferredDomain &&
        areRelatedDomains(profile.domain, preferredDomain) &&
        (profile.wordCount >= 20 ||
            (!!profile.metaDescription &&
                (profile.headings.length > 0 || profile.paragraphs.length > 0)))) {
        return true;
    }
    if (profile.wordCount >= 70) {
        return true;
    }
    const haystack = normalizeKey([profile.pageTitle, profile.metaDescription, profile.text].join(" "));
    const productTokens = tokenize(product.title).slice(0, 4);
    const matchedTokens = productTokens.filter((token) => haystack.includes(token));
    return (matchedTokens.length >= Math.min(2, productTokens.length) &&
        profile.wordCount >= 35);
};
const extractSearchSnippetProfile = (results, fallbackUrl) => {
    const relevantResults = results.slice(0, 5);
    const text = toUniqueList(relevantResults.flatMap((result) => [result.title, result.snippet])).join(" ");
    if (!text) {
        return null;
    }
    return {
        url: fallbackUrl,
        domain: getHostname(fallbackUrl),
        pageTitle: relevantResults[0]?.title ?? "",
        metaDescription: relevantResults[0]?.snippet ?? "",
        headings: relevantResults.map((result) => result.title).filter(Boolean),
        paragraphs: relevantResults.map((result) => result.snippet).filter(Boolean),
        featureBullets: [],
        text,
        wordCount: countWords(text),
    };
};
const resolveSourceForProduct = async (product) => {
    const preferredDomain = getHostname(product.customUrl);
    const searchNameVariants = buildSearchNameVariants(product.title);
    const searchableName = searchNameVariants[0] ?? extractCoreProductName(product.title);
    const contextPhrase = getSearchContextTokens(product).slice(0, 3).join(" ");
    const runFallbackSearch = async (query) => {
        try {
            return await searchBing(query);
        }
        catch (error) {
            console.warn(`[search:error] ${product.productId} "${query}" -> ${error?.message ?? "unknown error"}`);
            return [];
        }
    };
    if (isLikelyHttpUrl(product.customUrl)) {
        const directProfile = await fetchSourceProfile(product.customUrl);
        if (directProfile &&
            (CUSTOM_URL_ONLY ||
                hasSufficientSourceDepth(directProfile, product, preferredDomain))) {
            return {
                sourceMethod: "custom metafield",
                sourceUrl: product.customUrl,
                profile: directProfile,
            };
        }
        if (CUSTOM_URL_ONLY) {
            return {
                sourceMethod: "insufficient",
                sourceUrl: product.customUrl,
                profile: null,
            };
        }
        if (preferredDomain) {
            const domainResultsMap = new Map();
            for (const nameVariant of searchNameVariants.slice(0, 3)) {
                const domainQueries = toUniqueList([
                    `${nameVariant} site:${preferredDomain}`,
                    contextPhrase
                        ? `${nameVariant} ${contextPhrase} site:${preferredDomain}`
                        : "",
                ]).filter(Boolean);
                for (const domainQuery of domainQueries) {
                    const results = (await runFallbackSearch(domainQuery)).slice(0, 5);
                    results.forEach((result) => {
                        if (!domainResultsMap.has(result.url)) {
                            domainResultsMap.set(result.url, result);
                        }
                    });
                    if (domainResultsMap.size >= 5) {
                        break;
                    }
                }
                if (domainResultsMap.size >= 5) {
                    break;
                }
            }
            const domainResults = Array.from(domainResultsMap.values()).slice(0, 5);
            const relevantDomainResults = filterRelevantSearchResults({
                results: domainResults,
                product,
                preferredDomain,
            });
            const domainProfiles = await fetchProfilesFromResults(relevantDomainResults, product, preferredDomain);
            const mergedDomainProfile = mergeSourceProfiles(domainProfiles, product.customUrl);
            if (hasSufficientSourceDepth(mergedDomainProfile, product, preferredDomain)) {
                return {
                    sourceMethod: domainProfiles.length > 1 ? "multi-source web" : "domain search",
                    sourceUrl: domainProfiles[0]?.url ??
                        relevantDomainResults[0]?.url ??
                        product.customUrl,
                    profile: mergedDomainProfile,
                };
            }
        }
    }
    const queries = toUniqueList(searchNameVariants.flatMap((nameVariant) => [
        [nameVariant, product.vendor].filter(Boolean).join(" "),
        nameVariant,
        contextPhrase ? [nameVariant, contextPhrase].filter(Boolean).join(" ") : "",
        product.vendor && normalizeKey(nameVariant) !== normalizeKey(product.vendor)
            ? [product.vendor, nameVariant].filter(Boolean).join(" ")
            : "",
        contextPhrase ? [product.vendor, contextPhrase].filter(Boolean).join(" ") : "",
    ]))
        .filter(Boolean)
        .slice(0, 6);
    const webResultsMap = new Map();
    for (const query of queries) {
        const results = await runFallbackSearch(query);
        results.forEach((result) => {
            if (!webResultsMap.has(result.url)) {
                webResultsMap.set(result.url, result);
            }
        });
    }
    const webResults = filterRelevantSearchResults({
        results: Array.from(webResultsMap.values()),
        product,
        preferredDomain,
    })
        .sort((left, right) => scoreSearchResult({
        result: right,
        product,
        preferredDomain,
    }) -
        scoreSearchResult({
            result: left,
            product,
            preferredDomain,
        }))
        .slice(0, 8);
    const highConfidenceWebResults = webResults.filter((result) => isHighConfidenceSearchDomain({
        domain: result.domain,
        preferredDomain,
    }));
    const preferredDomainWebResults = highConfidenceWebResults.filter((result) => areRelatedDomains(result.domain, preferredDomain));
    const prioritizedWebResults = preferredDomainWebResults.length > 0
        ? preferredDomainWebResults
        : highConfidenceWebResults;
    const snippetProfile = extractSearchSnippetProfile(prioritizedWebResults, prioritizedWebResults[0]?.url ?? product.customUrl ?? "");
    if (snippetProfile &&
        (snippetProfile.wordCount >= 35 ||
            hasSufficientSourceDepth(snippetProfile, product, preferredDomain))) {
        return {
            sourceMethod: "search snippets",
            sourceUrl: snippetProfile.url || null,
            profile: snippetProfile,
        };
    }
    const webProfiles = await fetchProfilesFromResults(prioritizedWebResults, product, preferredDomain);
    const mergedWebProfile = mergeSourceProfiles(webProfiles, prioritizedWebResults[0]?.url ?? product.customUrl ?? "");
    if (hasSufficientSourceDepth(mergedWebProfile, product, preferredDomain)) {
        return {
            sourceMethod: webProfiles.length > 1 ? "multi-source web" : "web search",
            sourceUrl: webProfiles[0]?.url ??
                prioritizedWebResults[0]?.url ??
                product.customUrl,
            profile: mergedWebProfile,
        };
    }
    if (snippetProfile) {
        return {
            sourceMethod: "search snippets",
            sourceUrl: snippetProfile.url || null,
            profile: snippetProfile,
        };
    }
    return {
        sourceMethod: "insufficient",
        sourceUrl: null,
        profile: null,
    };
};
const inferProductFamily = (product) => {
    const combined = normalizeKey([product.title, product.productType, product.tags.join(" ")].join(" "));
    if (/\b(hosting|server|cloud|wordpress|infrastructure|vps|dedicated)\b/.test(combined)) {
        return "infrastructure";
    }
    if (/\b(seo|marketing|copy|content|email|crm)\b/.test(combined)) {
        return "marketing";
    }
    if (/\b(analytics|forecast|insight|intelligence|dashboard)\b/.test(combined)) {
        return "analytics";
    }
    if (/\b(security|compliance|governance|risk|privacy)\b/.test(combined)) {
        return "security";
    }
    if (/\b(ai|automation|chatbot|assistant|vision|model)\b/.test(combined)) {
        return "ai";
    }
    return "software";
};
const humanizeCategory = (product) => product.productType ||
    (product.tags.length > 0 ? product.tags[0] : "software platform");
const summarizeAudience = (product, profile) => {
    const sentences = profile.paragraphs
        .filter((sentence) => /\bfor\b/i.test(sentence))
        .slice(0, 2)
        .join(" ");
    if (sentences) {
        const match = sentences.match(/\bfor\s+([^.,;]+)/i);
        if (match?.[1]) {
            const extracted = normalizeWhitespace(match[1])
                .replace(/^(the|a|an)\s+/i, "")
                .replace(/\s+(who|that|looking|seeking).*$/i, "");
            if (extracted.length >= 6 && extracted.length <= 70) {
                return extracted;
            }
        }
    }
    const family = inferProductFamily(product);
    if (family === "infrastructure") {
        return "teams that need dependable performance and room to scale";
    }
    if (family === "marketing") {
        return "marketing and growth teams that need faster execution";
    }
    if (family === "analytics") {
        return "operators who need clearer reporting and faster decisions";
    }
    if (family === "security") {
        return "teams that need stronger oversight, visibility, and control";
    }
    if (family === "ai") {
        return "teams that want automation without losing workflow visibility";
    }
    return "business teams evaluating practical software for daily operations";
};
const buildFeaturePool = (product, profile) => {
    const rawFeatures = toUniqueList([
        ...profile.featureBullets,
        ...profile.headings,
        ...profile.paragraphs.flatMap((paragraph) => paragraph
            .split(/[.;]/)
            .map((part) => normalizeWhitespace(part))
            .filter((part) => part.length >= 24 && part.length <= 160)),
    ]);
    return rawFeatures
        .filter((feature) => {
        const lowered = feature.toLowerCase();
        if (lowered.includes("cookie") ||
            lowered.includes("privacy") ||
            lowered.includes("learn more") ||
            lowered.includes("contact sales")) {
            return false;
        }
        if (feature.length < 18 || feature.length > 180) {
            return false;
        }
        const tokenHits = tokenize(product.title).filter((token) => normalizeKey(feature).includes(token));
        return tokenHits.length < tokenize(product.title).length;
    })
        .slice(0, 8);
};
const rewriteFeatureSentence = ({ feature, product, seed, }) => {
    const category = humanizeCategory(product).toLowerCase();
    const stems = [
        `One of the clearest strengths highlighted around ${product.title} is ${feature.toLowerCase()}, which gives buyers a better sense of how the ${category} fits into real work.`,
        `${product.title} also leans into ${feature.toLowerCase()}, a detail that matters when teams want a ${category} that contributes measurable value instead of adding another disconnected tool.`,
        `The product story is reinforced by ${feature.toLowerCase()}, showing that ${product.title} is being positioned as a practical ${category} rather than a vague promise.`,
        `${feature} is another useful signal, especially for buyers who care about how quickly a ${category} can support day-to-day execution.`,
    ];
    return pickVariant(stems, seed);
};
const buildUseCaseSentences = ({ product, profile, seed, }) => {
    const family = inferProductFamily(product);
    const audience = summarizeAudience(product, profile);
    const category = humanizeCategory(product);
    const paragraphs = profile.paragraphs.slice(0, 3).join(" ");
    const clues = normalizeKey(paragraphs);
    const sentences = [];
    if (family === "infrastructure") {
        sentences.push(`${product.title} is most relevant for ${audience}, especially when uptime, delivery speed, and manageable scaling costs are part of the buying conversation.`);
        sentences.push(`In infrastructure categories, the difference between a basic service and a production-ready platform usually comes down to consistency under load, operational controls, and the amount of hands-on maintenance a team has to absorb.`);
    }
    else if (family === "ai") {
        sentences.push(`${product.title} makes the strongest case for ${audience} that want automation, analysis, or generation features while still keeping workflow quality and oversight in view.`);
        sentences.push(`For AI-led tools, buyers usually care about practical adoption questions such as where the output appears, how quickly it can be reviewed, and whether the experience helps users move from experiment to production.`);
    }
    else if (family === "marketing") {
        sentences.push(`${product.title} is likely to appeal to ${audience} that need stronger output, faster campaign execution, and clearer content workflows without expanding headcount for every task.`);
        sentences.push(`In marketing software, the real test is whether the platform shortens production cycles, supports repeatable quality, and gives teams enough control to keep messaging aligned across channels.`);
    }
    else if (family === "analytics") {
        sentences.push(`${product.title} fits best with ${audience}, particularly when scattered data, slow reporting, or hard-to-interpret performance signals are making decisions more reactive than strategic.`);
        sentences.push(`Analytics products tend to stand out when they can turn raw information into usable direction for planning, prioritization, and faster course correction.`);
    }
    else if (family === "security") {
        sentences.push(`${product.title} is positioned well for ${audience} that need stronger policy visibility, more reliable controls, and a clearer operational view of risk.`);
        sentences.push(`Security and governance platforms earn trust when they reduce ambiguity, document important decisions, and help teams respond with more confidence when requirements change.`);
    }
    else {
        sentences.push(`${product.title} reads like a ${category} built for ${audience}, with the strongest value coming from how easily it can fit into routine business work.`);
        sentences.push(`For general software categories, buyers often compare products based on usability, operational clarity, and how quickly the tool can become useful after implementation starts.`);
    }
    if (clues.includes("integration")) {
        sentences.push(`That positioning becomes more convincing when integration language appears in the source material, because it suggests the product is designed to sit inside an existing stack instead of forcing teams to rebuild their process around it.`);
    }
    return sentences.slice(0, seed % 2 === 0 ? 3 : 2);
};
const buildClosingParagraph = ({ product, profile, }) => {
    const domain = profile.domain || getHostname(profile.url);
    const vendorLabel = product.vendor
        ? `${product.vendor} presents`
        : `${domain || "The vendor"} presents`;
    const category = humanizeCategory(product).toLowerCase();
    return `${vendorLabel} ${product.title} as a ${category} with a more specific role than generic product listings usually reveal. Buyers who want a clearer sense of fit should look at the workflow language, the operational promises, and the feature emphasis across the reviewed sources, because those details do a better job of showing where the product can create value, where it may require change management, and whether it matches the maturity level of the team evaluating it.`;
};
const padBodyText = ({ paragraphs, product, profile, }) => {
    const result = [...paragraphs];
    const family = inferProductFamily(product);
    const category = humanizeCategory(product).toLowerCase();
    while (countWords(result.join(" ")) < MIN_WORDS) {
        if (family === "infrastructure") {
            result.push(`Another useful way to evaluate ${product.title} is to look beyond headline capacity claims and focus on the operational experience. Infrastructure buyers usually care about deployment speed, day-two management, troubleshooting visibility, and whether the provider helps reduce the amount of reactive work required from internal teams. When a hosting or cloud platform communicates clearly around stability, support, and repeatable delivery, it often points to a better long-term fit than feature volume alone.`);
        }
        else if (family === "ai") {
            result.push(`The practical value of an AI product is rarely just the model itself. Teams also need predictable workflows, useful controls, and an experience that helps them move from first output to dependable ongoing use. That is why the surrounding context for ${product.title} matters: the strongest products in this space do more than generate results, they also help users review, apply, and improve those results in a repeatable way.`);
        }
        else {
            result.push(`It is also worth evaluating how a ${category} like ${product.title} supports adoption after the initial setup phase. The best products tend to reduce friction over time, make everyday work easier to manage, and give teams a clearer path from implementation to measurable business value. Those practical considerations usually have more impact on long-term satisfaction than surface-level positioning alone.`);
        }
        if (profile.metaDescription) {
            result.push(`The official messaging around ${product.title} suggests that the product is being framed with a specific operational promise, which is helpful for buyers who want to compare stated value against the workflows and feature signals they see elsewhere on the site.`);
        }
    }
    return result;
};
const toTitleCase = (value) => value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
const withIndefiniteArticle = (value) => {
    const normalized = normalizeWhitespace(value);
    if (!normalized) {
        return normalized;
    }
    return `${/^[aeiou]/i.test(normalized) ? "an" : "a"} ${normalized}`;
};
const truncateSmart = (value, maxLength) => {
    const normalized = normalizeWhitespace(value);
    if (normalized.length <= maxLength) {
        return normalized;
    }
    const trimmed = normalized.slice(0, maxLength + 1);
    const lastSpace = trimmed.lastIndexOf(" ");
    return normalizeWhitespace(`${trimmed.slice(0, lastSpace > 40 ? lastSpace : maxLength).trim()}`);
};
const truncateWithEllipsis = (value, maxLength) => {
    const normalized = normalizeWhitespace(value);
    if (normalized.length <= maxLength) {
        return normalized;
    }
    const trimmed = truncateSmart(normalized, Math.max(20, maxLength - 3));
    return `${trimmed.replace(/[.,;:!?-]+$/g, "")}...`;
};
const deriveSeoQualifier = ({ product, profile, featurePool, }) => {
    const combined = normalizeKey([
        product.title,
        product.productType,
        profile.pageTitle,
        profile.metaDescription,
        featurePool.join(" "),
        profile.paragraphs.slice(0, 4).join(" "),
    ].join(" "));
    if (/\b360\b.*\bfeedback\b|\bdegree feedback\b/.test(combined)) {
        return "360 Feedback Software";
    }
    if (/\bwordpress\b/.test(combined) && /\bhosting\b/.test(combined)) {
        return "Managed WordPress Hosting";
    }
    if (/\bshared hosting\b/.test(combined)) {
        return "Shared Hosting";
    }
    if (/\bvps\b/.test(combined) && /\bhosting\b/.test(combined)) {
        return "VPS Hosting";
    }
    if (/\bdedicated\b/.test(combined) && /\bhosting|server\b/.test(combined)) {
        return "Dedicated Server Hosting";
    }
    if (/\bcloud\b/.test(combined) && /\bhosting|server\b/.test(combined)) {
        return "Cloud Hosting Platform";
    }
    if (/\bpodcast\b/.test(combined) && /\bvideo\b/.test(combined)) {
        return "AI Podcast Video Creator";
    }
    if (/\bpodcast\b/.test(combined)) {
        return "Podcast Creation Suite";
    }
    if (/\btext to speech\b|\bvoice generator\b|\bvoiceover\b|\bvoice cloning\b/.test(combined)) {
        return "AI Voice Generator";
    }
    if (/\btranscription\b|\bmeeting assistant\b|\bcall summary\b|\bnote-taking\b/.test(combined)) {
        return "Meeting Assistant";
    }
    if (/\bsearch engine\b|\bresearch assistant\b|\bliterature review\b/.test(combined)) {
        return "AI Research Assistant";
    }
    if (/\bvoice assistant\b|\bsmart home\b|\bpersonal assistant\b/.test(combined)) {
        return "AI Assistant Platform";
    }
    if (/\bchatbot\b|\bconversational ai\b/.test(combined)) {
        return "AI Chatbot Platform";
    }
    if (/\bform builder\b|\bsurveys\b|\bquizzes\b|\bdata collection\b/.test(combined)) {
        return "Form Builder";
    }
    if (/\bgovernance\b|\bcompliance\b|\brisk\b/.test(combined)) {
        return "AI Governance Platform";
    }
    if (/\banalytics\b|\binsight\b|\bdashboard\b/.test(combined)) {
        return "Analytics Platform";
    }
    if (/\bseo\b|\bcontent\b|\bcopy\b/.test(combined)) {
        return "SEO Content Tool";
    }
    if (/\barchitecture\b|\barchitectural\b|\bbim\b|\b3d\b|\brendering\b|\bvisualization\b/.test(combined)) {
        return "Architecture Design Software";
    }
    if (/\bdesign\b|\bimage\b|\bphoto\b|\bvisual\b|\bart\b|\bbackground removal\b|\bupscaling\b/.test(combined)) {
        return "Creative AI Tool";
    }
    if (/\bmusic\b|\bsoundtrack\b|\baudio editing\b/.test(combined)) {
        return "AI Audio Tool";
    }
    if (/\bautomation\b/.test(combined)) {
        return "Workflow Automation Tool";
    }
    if (/\bhosting\b|\bcloud\b|\bserver\b/.test(combined)) {
        return "Cloud Hosting Platform";
    }
    const category = humanizeCategory(product);
    if (category &&
        normalizeKey(category) !== "software platform" &&
        normalizeKey(category) !== "software") {
        return category;
    }
    const fallbackFeature = featurePool[0]
        ?.split(" ")
        .slice(0, 4)
        .join(" ")
        .replace(/[^\w\s-]/g, "");
    if (fallbackFeature) {
        return toTitleCase(normalizeKey(fallbackFeature));
    }
    return "Software Platform";
};
const buildSeoTitle = ({ product, profile, featurePool, }) => {
    const coreName = extractCoreProductName(product.title);
    const qualifier = deriveSeoQualifier({
        product,
        profile,
        featurePool,
    });
    const candidates = toUniqueList([
        [coreName, qualifier].filter(Boolean).join(" | "),
        [coreName, product.vendor].filter(Boolean).join(" | "),
        [coreName, humanizeCategory(product)].filter(Boolean).join(" | "),
    ].map((candidate) => normalizeWhitespace(candidate).replace(/\s+[|:-]\s*$/g, "")));
    const chosen = candidates.find((candidate) => candidate.length <= 68) ?? candidates[0] ?? coreName;
    return truncateSmart(chosen, 68).replace(/\s+[|:-]\s*$/g, "");
};
const buildSeoDescription = ({ product, profile, audience, }) => {
    const coreName = extractCoreProductName(product.title);
    const qualifier = deriveSeoQualifier({
        product,
        profile,
        featurePool: buildFeaturePool(product, profile),
    }).toLowerCase();
    const shortAudience = truncateSmart(audience, 48);
    const sourceHint = profile.featureBullets[0] || profile.headings[0] || profile.metaDescription;
    const hintPhrase = sourceHint
        ? truncateSmart(sourceHint
            .replace(/[.]+$/g, "")
            .split(" ")
            .slice(0, 8)
            .join(" "), 48).toLowerCase()
        : "";
    const candidates = toUniqueList([
        `${coreName} is ${withIndefiniteArticle(qualifier)}. Review its features, workflow fit, and overall value before you compare options.`,
        `${coreName} helps ${shortAudience}. See how its ${hintPhrase || "core workflow"} supports evaluation before you shortlist a new platform.`,
        `${coreName} is built for ${shortAudience}. Explore the product story, standout capabilities, and fit before making a buying decision.`,
    ]);
    return (candidates.find((candidate) => candidate.length <= 158) ??
        truncateWithEllipsis(candidates[0], 158));
};
const buildBodyHtml = ({ introParagraphs, featureSentences, useCaseSentences, closingParagraph, }) => {
    const featureItems = featureSentences
        .map((sentence) => `<li>${escapeHtml(sentence)}</li>`)
        .join("");
    return [
        ...introParagraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
        `<h2>Key Capabilities</h2>`,
        `<ul>${featureItems}</ul>`,
        ...useCaseSentences.map((sentence) => `<p>${escapeHtml(sentence)}</p>`),
        `<h2>Why It Deserves Attention</h2>`,
        `<p>${escapeHtml(closingParagraph)}</p>`,
    ].join("");
};
const createContentPackage = ({ product, profile, }) => {
    const seed = hashString(`${product.productId}-${profile.url}`);
    const category = humanizeCategory(product);
    const audience = summarizeAudience(product, profile);
    const featurePool = buildFeaturePool(product, profile);
    const openingLines = [
        `${product.title} is a ${category.toLowerCase()} that appears to be built for ${audience}. Based on the official messaging and the supporting product language available online, the platform is positioned around practical value rather than vague feature inflation.`,
        product.vendor
            ? `${product.vendor} frames ${product.title} as a product with a defined role inside a larger workflow, which is useful for buyers who want to understand where the tool can save time, improve visibility, or strengthen execution before committing to a new platform.`
            : `${product.title} is presented with enough product context to show where it belongs inside a broader workflow, which matters for buyers who want to move past surface-level positioning and judge the product on fit.`,
        profile.metaDescription
            ? `The strongest signals on the source site point toward a product that is being marketed with a clear promise: ${truncateSmart(profile.metaDescription, 220)}. That promise is more credible when it is supported by concrete feature references, workflow language, and implementation clues rather than headline marketing alone.`
            : `Even without relying on hype-heavy language, the source material gives a useful picture of how ${product.title} is expected to support day-to-day work, what problems it aims to reduce, and why the product may deserve a place on a serious shortlist.`,
    ];
    const featureSentences = (featurePool.length > 0
        ? featurePool.slice(0, 5).map((feature, index) => rewriteFeatureSentence({
            feature,
            product,
            seed: seed + index,
        }))
        : [
            `${product.title} is presented as a more focused option than many generic entries in the same category, which can be useful for buyers who want a tighter match with a known workflow or business need.`,
            `The official positioning also suggests that the product is meant to contribute to repeatable execution, not just one-off experimentation, which is often a sign of stronger operational fit.`,
            `A closer review should focus on how the platform handles configuration, review steps, and adoption inside existing processes, because those details usually shape long-term value more than headline claims.`,
        ]).slice(0, 5);
    const useCaseSentences = buildUseCaseSentences({
        product,
        profile,
        seed,
    });
    const closingParagraph = buildClosingParagraph({ product, profile });
    const paddedIntroParagraphs = padBodyText({
        paragraphs: openingLines,
        product,
        profile,
    });
    const bodyHtml = buildBodyHtml({
        introParagraphs: paddedIntroParagraphs,
        featureSentences,
        useCaseSentences,
        closingParagraph,
    });
    const bodyText = stripHtml(bodyHtml);
    const bodyWordCount = countWords(bodyText);
    return {
        bodyHtml,
        bodyText,
        bodyWordCount,
        seoTitle: buildSeoTitle({
            product,
            profile,
            featurePool,
        }),
        seoDescription: buildSeoDescription({
            product,
            profile,
            audience,
        }),
    };
};
const shouldSkipWithoutForce = (product, content) => {
    if (FORCE_REWRITE) {
        return false;
    }
    return (product.descriptionWordCount >= MIN_WORDS &&
        product.seoTitle.trim() !== "" &&
        product.seoDescription.trim() !== "" &&
        product.descriptionText === content.bodyText &&
        product.seoTitle === content.seoTitle &&
        product.seoDescription === content.seoDescription);
};
const updateShopifyProduct = async ({ product, content, }) => {
    await withRetries(`Update Shopify product ${product.productId}`, () => shopifyHttp_1.shopifyRest.put(`/products/${product.productId}.json`, {
        product: {
            id: product.productId,
            body_html: content.bodyHtml,
            metafields_global_title_tag: content.seoTitle,
            metafields_global_description_tag: content.seoDescription,
        },
    }));
};
const writeReportFiles = async (updates) => {
    await fs_1.default.promises.mkdir(EXPORTS_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseName = `shopify-product-seo-refresh-${timestamp}${APPLY_CHANGES ? "-applied" : "-dry-run"}`;
    const summaryPath = path_1.default.join(EXPORTS_DIR, `${baseName}.json`);
    const csvPath = path_1.default.join(EXPORTS_DIR, `${baseName}.csv`);
    const summary = {
        generatedAt: new Date().toISOString(),
        applyChanges: APPLY_CHANGES,
        minWords: MIN_WORDS,
        includeNonActive: INCLUDE_NON_ACTIVE,
        forceRewrite: FORCE_REWRITE,
        processedCount: updates.length,
        updatedCount: updates.filter((item) => item.updated).length,
        skippedCount: updates.filter((item) => !item.updated).length,
        sourceMethodBreakdown: updates.reduce((accumulator, item) => {
            accumulator[item.sourceMethod] =
                (accumulator[item.sourceMethod] ?? 0) + 1;
            return accumulator;
        }, {}),
        updates,
    };
    await fs_1.default.promises.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");
    const csvLines = [
        [
            "product_id",
            "title",
            "status",
            "source_method",
            "source_url",
            "current_word_count",
            "generated_word_count",
            "updated",
            "skipped_reason",
            "seo_title",
            "seo_description",
        ]
            .map((value) => csvEscape(value))
            .join(","),
        ...updates.map((item) => [
            item.productId,
            item.title,
            item.status,
            item.sourceMethod,
            item.sourceUrl,
            item.currentWordCount,
            item.generatedWordCount,
            item.updated,
            item.skippedReason,
            item.seoTitle,
            item.seoDescription,
        ]
            .map((value) => csvEscape(value))
            .join(",")),
    ].join("\n");
    await fs_1.default.promises.writeFile(csvPath, csvLines, "utf8");
    return {
        summaryPath,
        csvPath,
    };
};
const processProduct = async ({ product, index, total, }) => {
    console.log(`[${index + 1}/${total}] Preparing SEO copy for ${product.productId}: ${product.title}`);
    const source = await resolveSourceForProduct(product);
    if (!source.profile) {
        return {
            productId: product.productId,
            title: product.title,
            status: product.status,
            sourceMethod: source.sourceMethod,
            sourceUrl: source.sourceUrl,
            currentWordCount: product.descriptionWordCount,
            generatedWordCount: 0,
            updated: false,
            skippedReason: "Could not gather enough trustworthy source material",
            seoTitle: product.seoTitle,
            seoDescription: product.seoDescription,
        };
    }
    const content = createContentPackage({
        product,
        profile: source.profile,
    });
    if (content.bodyWordCount < MIN_WORDS) {
        return {
            productId: product.productId,
            title: product.title,
            status: product.status,
            sourceMethod: source.sourceMethod,
            sourceUrl: source.sourceUrl,
            currentWordCount: product.descriptionWordCount,
            generatedWordCount: content.bodyWordCount,
            updated: false,
            skippedReason: `Generated copy stayed below the ${MIN_WORDS}-word minimum`,
            seoTitle: content.seoTitle,
            seoDescription: content.seoDescription,
        };
    }
    if (shouldSkipWithoutForce(product, content)) {
        return {
            productId: product.productId,
            title: product.title,
            status: product.status,
            sourceMethod: source.sourceMethod,
            sourceUrl: source.sourceUrl,
            currentWordCount: product.descriptionWordCount,
            generatedWordCount: content.bodyWordCount,
            updated: false,
            skippedReason: "Existing Shopify content already matches the generated output",
            seoTitle: content.seoTitle,
            seoDescription: content.seoDescription,
        };
    }
    if (APPLY_CHANGES) {
        await updateShopifyProduct({
            product,
            content,
        });
        await sleep(250);
    }
    return {
        productId: product.productId,
        title: product.title,
        status: product.status,
        sourceMethod: source.sourceMethod,
        sourceUrl: source.sourceUrl,
        currentWordCount: product.descriptionWordCount,
        generatedWordCount: content.bodyWordCount,
        updated: true,
        skippedReason: null,
        seoTitle: content.seoTitle,
        seoDescription: content.seoDescription,
    };
};
const runWithConcurrency = async ({ items, concurrency, worker, }) => {
    const results = new Array(items.length);
    let nextIndex = 0;
    const launchWorker = async () => {
        while (true) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            if (currentIndex >= items.length) {
                return;
            }
            results[currentIndex] = await worker(items[currentIndex], currentIndex);
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => launchWorker()));
    return results;
};
const main = async () => {
    console.log("Fetching Shopify products for SEO copy refresh...");
    const allProducts = await fetchAllProducts();
    const selectionSummary = buildSelectionSummary(allProducts);
    console.log(`Catalog summary: total=${selectionSummary.totalProducts}, active=${selectionSummary.activeProducts}, active_with_custom_url=${selectionSummary.activeWithCustomUrl}, active_without_custom_url=${selectionSummary.activeWithoutCustomUrl}, active_below_${MIN_WORDS}_words=${selectionSummary.activeBelowWordTarget}`);
    if (SUMMARY_ONLY) {
        return;
    }
    const activeFilteredProducts = INCLUDE_NON_ACTIVE
        ? allProducts
        : allProducts.filter((product) => product.status.toLowerCase() === "active");
    const idFilteredProducts = PRODUCT_IDS
        ? activeFilteredProducts.filter((product) => PRODUCT_IDS.has(product.productId))
        : activeFilteredProducts;
    const offsetProducts = START_INDEX > 0 ? idFilteredProducts.slice(START_INDEX) : idFilteredProducts;
    const products = PRODUCT_LIMIT
        ? offsetProducts.slice(0, PRODUCT_LIMIT)
        : offsetProducts;
    console.log(`Products selected: ${products.length} (start index ${START_INDEX})`);
    console.log(`Worker concurrency: ${WORKER_CONCURRENCY}`);
    const updates = await runWithConcurrency({
        items: products,
        concurrency: WORKER_CONCURRENCY,
        worker: (product, index) => processProduct({
            product,
            index,
            total: products.length,
        }),
    });
    const reportPaths = await writeReportFiles(updates);
    console.log(`SEO refresh summary: ${reportPaths.summaryPath}`);
    console.log(`SEO refresh CSV: ${reportPaths.csvPath}`);
    console.log(`Completed ${updates.length} products. Updated: ${updates.filter((item) => item.updated).length}.`);
};
main()
    .then(() => {
    process.exit(0);
})
    .catch((error) => {
    console.error("Shopify SEO copy refresh failed:", error);
    process.exit(1);
});
