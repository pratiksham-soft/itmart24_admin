import "../config/env";
import fs from "fs";
import path from "path";
import csv from "csv-parser";
import axios, { AxiosResponse } from "axios";
import { shopifyGraphQL, shopifyRest } from "../services/shopifyHttp";

const CATEGORY_CSV_PATH = path.join(
  __dirname,
  "../../imports/category-collections.csv"
);
const EXPORT_DIR = path.join(
  __dirname,
  "../../exports/crm-leads"
);
const OUTPUT_CSV_PATH = path.join(
  EXPORT_DIR,
  "cloud-services-leads.csv"
);
const SKIPPED_LOG_PATH = path.join(
  EXPORT_DIR,
  "cloud-services-leads.skipped.json"
);
const SHOPIFY_PAGE_LIMIT = 250;
const SHOPIFY_MAX_ATTEMPTS = 5;
const WEBSITE_MAX_ATTEMPTS = 2;
const WEBSITE_TIMEOUT_MS = 12000;
const WEBSITE_MAX_PAGES_PER_DOMAIN = 5;
const WEBSITE_CONCURRENCY = 3;
const PRODUCT_BATCH_SIZE = 40;
const TARGET_TOP_CATEGORY = "Cloud Services";
const STOREFRONT_ORIGIN = "https://itmart24.com";
const PRODUCT_LIMIT_ARG = process.argv.find((arg) =>
  arg.startsWith("--limit=")
);
const PRODUCT_LIMIT = PRODUCT_LIMIT_ARG
  ? Number(PRODUCT_LIMIT_ARG.split("=")[1])
  : null;
const PRODUCT_IDS_ARG = process.argv.find((arg) =>
  arg.startsWith("--product-ids=")
);
const PRODUCT_IDS = PRODUCT_IDS_ARG
  ? new Set(
      PRODUCT_IDS_ARG
        .split("=")[1]
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => !Number.isNaN(value))
    )
  : null;
const CRM_HEADERS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "companyName",
  "jobTitle",
  "website",
  "leadSource",
  "leadStatus",
  "leadPriority",
  "leadScore",
  "estimatedValue",
  "currency",
  "assignedTo",
  "tags",
  "notes",
  "nextFollowUpAt",
] as const;

const WEBSITE_HEADERS = {
  "User-Agent":
    "ITMart24AdminLeadGenerator/1.0 (+https://itmart24.com)",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.8",
};

const NON_OFFICIAL_DOMAIN_PATTERNS = [
  /(^|\.)itmart24\.com$/i,
  /(^|\.)myshopify\.com$/i,
  /(^|\.)facebook\.com$/i,
  /(^|\.)instagram\.com$/i,
  /(^|\.)linkedin\.com$/i,
  /(^|\.)youtube\.com$/i,
  /(^|\.)youtu\.be$/i,
  /(^|\.)x\.com$/i,
  /(^|\.)twitter\.com$/i,
  /(^|\.)tiktok\.com$/i,
  /(^|\.)reddit\.com$/i,
  /(^|\.)pinterest\.com$/i,
  /(^|\.)g2\.com$/i,
  /(^|\.)capterra\.com$/i,
  /(^|\.)trustpilot\.com$/i,
];

type CsvRow = {
  top_category?: string;
  collection_title?: string;
  collection_handle?: string;
};

type ShopifyCollection = {
  id: number;
  title?: string;
  handle?: string | null;
  published_at?: string | null;
};

type ShopifyCollectionSummary = {
  id: number;
  title: string;
  handle: string;
  type: "custom" | "smart";
};

type ShopifyProduct = {
  id: number;
  title?: string;
  handle?: string;
  vendor?: string;
  status?: string;
  body_html?: string;
  tags?: string;
  product_type?: string;
  metafields_global_title_tag?: string;
  metafields_global_description_tag?: string;
};

type ShopifyMetafield = {
  namespace?: string;
  key?: string;
  type?: string;
  value?: string;
};

type ProductRecord = {
  product: ShopifyProduct;
  metafields: ShopifyMetafield[];
  collectionHandles: string[];
  collectionTitles: string[];
};

type ShopifyProductNode = {
  legacyResourceId?: string | number | null;
  title?: string | null;
  handle?: string | null;
  vendor?: string | null;
  status?: string | null;
  descriptionHtml?: string | null;
  productType?: string | null;
  tags?: string[];
  seo?: {
    title?: string | null;
    description?: string | null;
  } | null;
  customUrlMetafield?: ShopifyMetafield | null;
  vendorProfileUrlMetafield?: ShopifyMetafield | null;
  sourceUrlMetafield?: ShopifyMetafield | null;
  sourceUrlsMetafield?: ShopifyMetafield | null;
  websiteMetafield?: ShopifyMetafield | null;
  officialWebsiteMetafield?: ShopifyMetafield | null;
  companyMetafield?: ShopifyMetafield | null;
  contactEmailMetafield?: ShopifyMetafield | null;
  emailMetafield?: ShopifyMetafield | null;
  phoneMetafield?: ShopifyMetafield | null;
};

type WebsiteCandidate = {
  url: string;
  source: string;
  priority: number;
};

type WebsiteProfile = {
  website: string | null;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  pagesVisited: string[];
  notes: string[];
};

type LeadDraft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName: string;
  jobTitle: string;
  website: string;
  leadSource: string;
  leadStatus: string;
  leadPriority: string;
  leadScore: string;
  estimatedValue: string;
  currency: string;
  assignedTo: string;
  tags: string;
  notes: string;
  nextFollowUpAt: string;
  score: number;
  noteRefs: Set<string>;
};

type SkippedProduct = {
  productId: number;
  title: string;
  handle: string;
  vendor: string;
  collectionHandles: string[];
  reason: string;
  details?: string;
};

const domainProfileCache = new Map<string, WebsiteProfile>();

const normalizeWhitespace = (value: unknown) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeKey = (value: unknown) =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const stripHtml = (value: string) =>
  decodeHtmlEntities(
    value
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const extractNextPageInfo = (linkHeader?: string): string | null => {
  if (!linkHeader) {
    return null;
  }

  const nextLink = linkHeader
    .split(",")
    .find((entry) => entry.includes('rel="next"'));
  const match = nextLink?.match(/<([^>]+)>/);

  return match?.[1]
    ? new URL(match[1]).searchParams.get("page_info")
    : null;
};

const isRetryableError = (error: any) => {
  const status = Number(error?.response?.status ?? 0);
  const message =
    typeof error?.message === "string"
      ? error.message.toLowerCase()
      : "";

  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    message.includes("timeout") ||
    message.includes("socket hang up") ||
    message.includes("econnreset") ||
    message.includes("econnaborted")
  );
};

const withRetries = async <T>(
  label: string,
  fn: () => Promise<T>,
  maxAttempts: number
): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error) || attempt === maxAttempts) {
        throw error;
      }

      const delayMs = attempt * 1500;
      console.warn(
        `[retry] ${label} failed on attempt ${attempt}/${maxAttempts}. Retrying in ${delayMs}ms...`
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
};

const csvEscape = (value: string | number | boolean | null | undefined) => {
  const stringValue =
    value === null || value === undefined ? "" : String(value);

  if (!/[",\r\n]/.test(stringValue)) {
    return stringValue;
  }

  return `"${stringValue.replace(/"/g, '""')}"`;
};

const dedupe = <T>(values: T[]) => Array.from(new Set(values));

const chunk = <T>(values: T[], size: number) => {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
};

const parseListLikeValue = (value: string | null | undefined) => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(normalized);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => normalizeWhitespace(item))
        .filter(Boolean);
    }
  } catch {
    // Ignore and fall back to string splitting.
  }

  return normalized
    .split(/[|,;\n]/)
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean);
};

const sanitizeUrl = (value: string) => {
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
  } catch {
    return value.trim();
  }
};

const toOriginUrl = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const getHostname = (value: string | null | undefined) => {
  if (!value) {
    return "";
  }

  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

const isHttpUrl = (value: string | null | undefined) => {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const isNonOfficialDomain = (value: string | null | undefined) => {
  const hostname = getHostname(value);
  return NON_OFFICIAL_DOMAIN_PATTERNS.some((pattern) =>
    pattern.test(hostname)
  );
};

const buildStorefrontProductUrl = (handle: string) =>
  `${STOREFRONT_ORIGIN}/products/${handle}`;

const absoluteUrl = (baseUrl: string, maybeRelativeUrl: string) => {
  try {
    return new URL(maybeRelativeUrl, baseUrl).toString();
  } catch {
    return maybeRelativeUrl;
  }
};

const extractUrls = (value: string) => {
  const matches = value.match(/https?:\/\/[^\s"'<>]+/gi) ?? [];
  return dedupe(
    matches
      .map((url) => sanitizeUrl(url.replace(/[),.;]+$/, "")))
      .filter((url) => isHttpUrl(url))
  );
};

const extractEmails = (value: string) => {
  const text = decodeHtmlEntities(value);
  const matches =
    text.match(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
    ) ?? [];

  return dedupe(
    matches
      .map((email) => email.trim().toLowerCase())
      .filter((email) => !isFakeEmail(email))
  );
};

const extractPhones = (value: string) => {
  const matches =
    decodeHtmlEntities(value).match(
      /(?:\+?\d[\d().\-\s]{6,}\d)/g
    ) ?? [];

  return dedupe(
    matches
      .map((phone) => normalizeWhitespace(phone))
      .filter((phone) => {
        const digits = phone.replace(/\D/g, "");
        const separatorCount = (phone.match(/[\s\-()]/g) ?? []).length;
        return (
          digits.length >= 10 &&
          digits.length <= 16 &&
          (phone.startsWith("+") || /[()]/.test(phone) || separatorCount >= 2)
        );
      })
  );
};

const isFakeEmail = (email: string) => {
  const lowered = email.toLowerCase();
  const domain = lowered.split("@")[1] ?? "";
  return (
    lowered.endsWith("@example.com") ||
    lowered.endsWith("@example.org") ||
    lowered.endsWith("@example.net") ||
    lowered.includes("yourname@") ||
    lowered.includes("name@example") ||
    lowered.includes("email@example") ||
    lowered.includes("test@") ||
    lowered.includes("noreply@example") ||
    /\.(png|jpe?g|gif|svg|webp|ico|pdf|css|js|json|xml|mp4|mp3|woff2?|ttf)$/i.test(
      domain
    )
  );
};

const scoreEmail = (email: string, website: string | null) => {
  const lowered = email.toLowerCase();
  const localPart = lowered.split("@")[0] ?? "";
  const domain = lowered.split("@")[1] ?? "";
  const websiteDomain = getHostname(website);
  let score = 0;

  if (
    /^(support|sales|partners|hello|contact|info|team|marketing)([.+_-].+)?$/i.test(
      localPart
    )
  ) {
    score += 10;
  }

  if (/^(admin|billing|office|business)([.+_-].+)?$/i.test(localPart)) {
    score += 7;
  }

  if (localPart.includes("no-reply") || localPart.includes("noreply")) {
    score -= 8;
  }

  if (websiteDomain && domain === websiteDomain) {
    score += 6;
  }

  if (websiteDomain && domain.endsWith(`.${websiteDomain}`)) {
    score += 4;
  }

  if (localPart.includes("privacy") || localPart.includes("legal")) {
    score -= 4;
  }

  if (
    /(abuse|reportphishing|phishing|security|spam|fraud|dmca)/i.test(
      localPart
    )
  ) {
    score -= 10;
  }

  return score;
};

const pickBestEmail = (
  emails: string[],
  website: string | null
) => {
  const ranked = dedupe(emails)
    .map((email) => ({
      email,
      score: scoreEmail(email, website),
    }))
    .sort((left, right) => right.score - left.score);

  if (!ranked[0] || ranked[0].score < 0) {
    return null;
  }

  return ranked[0];
};

const extractTagText = (html: string, tagName: string) => {
  const match = html.match(
    new RegExp(
      `<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`,
      "i"
    )
  );
  return match?.[1] ? stripHtml(match[1]) : "";
};

const extractMetaContent = (
  html: string,
  attrName: "name" | "property",
  attrValue: string
) => {
  const pattern = new RegExp(
    `<meta[^>]+${attrName}=["']${attrValue}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  return normalizeWhitespace(
    decodeHtmlEntities(pattern.exec(html)?.[1] ?? "")
  );
};

const extractLinkedPages = (html: string, baseUrl: string) => {
  const results: string[] = [];
  const pattern =
    /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html))) {
    const href = normalizeWhitespace(match[1]);
    const anchorText = stripHtml(match[2] ?? "");
    const lowered = `${href} ${anchorText}`.toLowerCase();

    if (
      !/(contact|support|about|help|privacy|terms|company)/i.test(
        lowered
      )
    ) {
      continue;
    }

    const absolute = absoluteUrl(baseUrl, href);
    if (!isHttpUrl(absolute)) {
      continue;
    }

    if (getHostname(absolute) !== getHostname(baseUrl)) {
      continue;
    }

    results.push(sanitizeUrl(absolute));
  }

  return dedupe(results);
};

const extractCompanySignals = (html: string) => {
  const candidates = [
    extractMetaContent(html, "property", "og:site_name"),
    extractMetaContent(html, "name", "application-name"),
    extractTagText(html, "title"),
  ].filter(Boolean);

  const copyrightMatch = html.match(
    /(?:copyright|©)\s*(?:\d{4}\s*)?([^<\n\r|]{2,120})/i
  );
  if (copyrightMatch?.[1]) {
    candidates.push(stripHtml(copyrightMatch[1]));
  }

  const logoAltMatches = Array.from(
    html.matchAll(
      /<img[^>]+alt=["']([^"']{2,120})["'][^>]*(?:logo|brand)|<img[^>]*(?:logo|brand)[^>]+alt=["']([^"']{2,120})["']/gi
    )
  )
    .map((match) => normalizeWhitespace(match[1] ?? match[2] ?? ""))
    .filter(Boolean);
  candidates.push(...logoAltMatches);

  const organizationMatches = Array.from(
    html.matchAll(
      /"@type"\s*:\s*"(?:Organization|Corporation|LocalBusiness|ProfessionalService)".{0,300}?"name"\s*:\s*"([^"]+)"/gi
    )
  )
    .map((match) => normalizeWhitespace(match[1]))
    .filter(Boolean);
  candidates.push(...organizationMatches);

  return dedupe(
    candidates
      .map((candidate) =>
        candidate
          .replace(/\s*[|\-–:]\s*[^|–:\-]+$/, "")
          .replace(/\b(home|homepage)\b/i, "")
          .trim()
      )
      .filter((candidate) => candidate.length >= 2)
  );
};

const pickBestCompanyName = (
  companyCandidates: string[],
  fallbackVendor: string
) => {
  const normalizedFallback = normalizeWhitespace(fallbackVendor);
  const cleanedCandidates = companyCandidates
    .map((candidate) => normalizeWhitespace(candidate))
    .filter(Boolean)
    .sort((left, right) => left.length - right.length);

  if (normalizedFallback) {
    return normalizedFallback;
  }

  return cleanedCandidates[0] ?? null;
};

const mapWithConcurrency = async <T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>
) => {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= values.length) {
        return;
      }

      results[currentIndex] = await mapper(
        values[currentIndex],
        currentIndex
      );
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, values.length) },
      () => worker()
    )
  );

  return results;
};

const readCategoryRows = async () =>
  new Promise<CsvRow[]>((resolve, reject) => {
    const rows: CsvRow[] = [];

    fs.createReadStream(CATEGORY_CSV_PATH)
      .pipe(
        csv({
          mapHeaders: ({ header }) =>
            header
              .replace(/^\uFEFF/, "")
              .replace(/^"(.*)"$/, "$1"),
        })
      )
      .on("data", (row: CsvRow) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });

const fetchAllShopifyResources = async <T>(
  resourcePath: string,
  responseKey: string
): Promise<T[]> => {
  const results: T[] = [];
  let pageInfo: string | null = null;

  do {
    const params = pageInfo
      ? { limit: SHOPIFY_PAGE_LIMIT, page_info: pageInfo }
      : { limit: SHOPIFY_PAGE_LIMIT };
    const response: {
      data: Record<string, T[] | undefined>;
      headers: { link?: string };
    } = await withRetries(
      `GET ${resourcePath}`,
      () => shopifyRest.get(resourcePath, { params }),
      SHOPIFY_MAX_ATTEMPTS
    );

    const pageItems = Array.isArray(response.data?.[responseKey])
      ? response.data[responseKey]
      : [];
    results.push(...pageItems);
    pageInfo = extractNextPageInfo(response.headers.link);
  } while (pageInfo);

  return results;
};

const fetchAllCollections = async () => {
  const [customCollections, smartCollections] = await Promise.all([
    fetchAllShopifyResources<ShopifyCollection>(
      "/custom_collections.json",
      "custom_collections"
    ),
    fetchAllShopifyResources<ShopifyCollection>(
      "/smart_collections.json",
      "smart_collections"
    ),
  ]);

  return [
    ...customCollections.map((collection) => ({
      id: collection.id,
      title:
        normalizeWhitespace(collection.title) || "Untitled Collection",
      handle: normalizeWhitespace(collection.handle),
      type: "custom" as const,
    })),
    ...smartCollections.map((collection) => ({
      id: collection.id,
      title:
        normalizeWhitespace(collection.title) || "Untitled Collection",
      handle: normalizeWhitespace(collection.handle),
      type: "smart" as const,
    })),
  ] satisfies ShopifyCollectionSummary[];
};

const resolveCloudServiceCollections = async () => {
  const [categoryRows, liveCollections] = await Promise.all([
    readCategoryRows(),
    fetchAllCollections(),
  ]);
  const desiredHandles = dedupe(
    categoryRows
      .filter(
        (row) =>
          normalizeWhitespace(row.top_category) === TARGET_TOP_CATEGORY
      )
      .map((row) => normalizeWhitespace(row.collection_handle))
      .filter(Boolean)
  );
  const liveByHandle = new Map(
    liveCollections.map((collection) => [collection.handle, collection])
  );
  const resolvedCollections = desiredHandles
    .map((handle) => liveByHandle.get(handle))
    .filter(
      (collection): collection is ShopifyCollectionSummary =>
        Boolean(collection)
    );

  if (resolvedCollections.length === 0) {
    throw new Error(
      `No live Shopify collections matched the ${TARGET_TOP_CATEGORY} category handles in ${CATEGORY_CSV_PATH}.`
    );
  }

  return resolvedCollections;
};

const fetchCollectionProductIds = async (collectionId: number) => {
  const productIds: number[] = [];
  let pageInfo: string | null = null;

  do {
    const params = pageInfo
      ? {
          limit: SHOPIFY_PAGE_LIMIT,
          page_info: pageInfo,
          fields: "id",
        }
      : {
          limit: SHOPIFY_PAGE_LIMIT,
          fields: "id",
        };
    const response: {
      data: { products?: Array<{ id?: number }> };
      headers: { link?: string };
    } = await withRetries(
      `Fetch products for collection ${collectionId}`,
      () =>
        shopifyRest.get(`/collections/${collectionId}/products.json`, {
          params,
        }),
      SHOPIFY_MAX_ATTEMPTS
    );

    const products = Array.isArray(response.data?.products)
      ? response.data.products
      : [];
    products.forEach((product) => {
      if (typeof product.id === "number") {
        productIds.push(product.id);
      }
    });
    pageInfo = extractNextPageInfo(response.headers.link);
  } while (pageInfo);

  return productIds;
};

const fetchProductsBatch = async (productIds: number[]) => {
  const gids = productIds.map(
    (productId) => `gid://shopify/Product/${productId}`
  );
  const response: {
    data?: {
      data?: {
        nodes?: Array<ShopifyProductNode | null>;
      };
      errors?: Array<{ message?: string }>;
    };
  } = await withRetries(
    `Fetch product batch ${productIds[0]}-${productIds[productIds.length - 1]}`,
    () =>
      shopifyGraphQL.post("", {
        query: `
          query FetchProductsBatch($ids: [ID!]!) {
            nodes(ids: $ids) {
              ... on Product {
                legacyResourceId
                title
                handle
                vendor
                status
                descriptionHtml
                productType
                tags
                seo {
                  title
                  description
                }
                customUrlMetafield: metafield(namespace: "custom", key: "custom") {
                  namespace
                  key
                  type
                  value
                }
                vendorProfileUrlMetafield: metafield(namespace: "custom", key: "vendor_profile_url") {
                  namespace
                  key
                  type
                  value
                }
                sourceUrlMetafield: metafield(namespace: "custom", key: "source_url") {
                  namespace
                  key
                  type
                  value
                }
                sourceUrlsMetafield: metafield(namespace: "custom", key: "source_urls") {
                  namespace
                  key
                  type
                  value
                }
                websiteMetafield: metafield(namespace: "custom", key: "website") {
                  namespace
                  key
                  type
                  value
                }
                officialWebsiteMetafield: metafield(namespace: "custom", key: "official_website") {
                  namespace
                  key
                  type
                  value
                }
                companyMetafield: metafield(namespace: "custom", key: "company_name") {
                  namespace
                  key
                  type
                  value
                }
                contactEmailMetafield: metafield(namespace: "custom", key: "contact_email") {
                  namespace
                  key
                  type
                  value
                }
                emailMetafield: metafield(namespace: "custom", key: "email") {
                  namespace
                  key
                  type
                  value
                }
                phoneMetafield: metafield(namespace: "custom", key: "phone") {
                  namespace
                  key
                  type
                  value
                }
              }
            }
          }
        `,
        variables: { ids: gids },
      }),
    SHOPIFY_MAX_ATTEMPTS
  );

  if (response.data?.errors?.length) {
    throw new Error(
      response.data.errors
        .map((error) => normalizeWhitespace(error.message))
        .filter(Boolean)
        .join(", ") || "Failed to fetch Shopify product batch"
    );
  }

  const nodes = Array.isArray(response.data?.data?.nodes)
    ? response.data.data.nodes
    : [];

  return nodes;
};

const extractMetafieldTextCandidates = (metafields: ShopifyMetafield[]) =>
  metafields.flatMap((metafield) => {
    const key = normalizeWhitespace(metafield.key);
    const namespace = normalizeWhitespace(metafield.namespace);
    const value = normalizeWhitespace(metafield.value);

    if (!value) {
      return [] as string[];
    }

    return [
      value,
      `${namespace}.${key}: ${value}`,
    ];
  });

const collectWebsiteCandidates = (
  product: ShopifyProduct,
  metafields: ShopifyMetafield[]
) => {
  const candidates: WebsiteCandidate[] = [];
  const pushCandidate = (
    rawUrl: string,
    source: string,
    priority: number
  ) => {
    if (!isHttpUrl(rawUrl)) {
      return;
    }

    const sanitized = sanitizeUrl(rawUrl);
    if (isNonOfficialDomain(sanitized)) {
      return;
    }

    candidates.push({
      url: sanitized,
      source,
      priority,
    });
  };

  metafields.forEach((metafield) => {
    const namespace = normalizeWhitespace(metafield.namespace);
    const key = normalizeWhitespace(metafield.key);
    const type = normalizeWhitespace(metafield.type).toLowerCase();
    const compositeKey = `${namespace}.${key}`.toLowerCase();
    const rawValue = normalizeWhitespace(metafield.value);

    if (!rawValue) {
      return;
    }

    const urls = [
      ...parseListLikeValue(rawValue).flatMap((item) => extractUrls(item)),
      ...extractUrls(rawValue),
    ];

    let priority = 40;
    if (compositeKey === "custom.custom") {
      priority = 100;
    } else if (
      /(official|website|web_site|company_website|vendor_website)/i.test(
        compositeKey
      )
    ) {
      priority = 90;
    } else if (/source_url|source_urls|product_url/i.test(compositeKey)) {
      priority = 80;
    } else if (type === "url") {
      priority = 70;
    } else if (/url|website|site/.test(compositeKey)) {
      priority = 60;
    }

    urls.forEach((url) =>
      pushCandidate(url, `metafield:${namespace}.${key}`, priority)
    );
  });

  [
    product.body_html ?? "",
    product.metafields_global_description_tag ?? "",
  ].forEach((value, index) => {
    extractUrls(value).forEach((url) =>
      pushCandidate(
        url,
        index === 0 ? "product:body_html" : "product:seo_description",
        50 - index * 5
      )
    );
  });

  return candidates.sort((left, right) => right.priority - left.priority);
};

const extractShopifyCompanyCandidates = (
  product: ShopifyProduct,
  metafields: ShopifyMetafield[]
) => {
  const candidates = [
    normalizeWhitespace(product.vendor),
    ...metafields
      .filter((metafield) =>
        /(company|business|vendor_name|vendor)/i.test(
          `${metafield.namespace}.${metafield.key}`
        )
      )
      .flatMap((metafield) => parseListLikeValue(metafield.value)),
  ];

  return dedupe(candidates.filter(Boolean));
};

const extractShopifyEmails = (
  product: ShopifyProduct,
  metafields: ShopifyMetafield[]
) => {
  const textBlobs = [
    normalizeWhitespace(product.body_html),
    normalizeWhitespace(product.metafields_global_title_tag),
    normalizeWhitespace(product.metafields_global_description_tag),
    normalizeWhitespace(product.tags),
    ...extractMetafieldTextCandidates(metafields),
  ];

  return dedupe(textBlobs.flatMap((value) => extractEmails(value)));
};

const extractShopifyPhones = (
  product: ShopifyProduct,
  metafields: ShopifyMetafield[]
) => {
  const textBlobs = [
    normalizeWhitespace(product.body_html),
    normalizeWhitespace(product.metafields_global_description_tag),
    ...extractMetafieldTextCandidates(metafields),
  ];

  return dedupe(textBlobs.flatMap((value) => extractPhones(value)));
};

const fetchWebsitePage = async (url: string) =>
  withRetries(
    `Fetch website ${url}`,
    async () => {
      const response = await axios.get<string>(url, {
        timeout: WEBSITE_TIMEOUT_MS,
        maxRedirects: 5,
        headers: WEBSITE_HEADERS,
        responseType: "text",
        transformResponse: [
          (data) =>
            typeof data === "string" ? data : String(data ?? ""),
        ],
        validateStatus: () => true,
      });

      return response;
    },
    WEBSITE_MAX_ATTEMPTS
  );

const getFinalResponseUrl = (
  response: AxiosResponse,
  fallbackUrl: string
) => {
  const request = response.request as
    | {
        res?: { responseUrl?: string };
        _redirectable?: { _currentUrl?: string };
      }
    | undefined;

  return (
    request?.res?.responseUrl ||
    request?._redirectable?._currentUrl ||
    fallbackUrl
  );
};

const resolveWebsiteProfile = async (
  websiteCandidate: string,
  fallbackVendor: string
) => {
  const origin = toOriginUrl(websiteCandidate);
  if (!origin) {
    return {
      website: null,
      email: null,
      phone: null,
      companyName: null,
      pagesVisited: [],
      notes: ["invalid_website_candidate"],
    } satisfies WebsiteProfile;
  }

  const cached = domainProfileCache.get(origin);
  if (cached) {
    return cached;
  }

  const pagesToVisit: string[] = [sanitizeUrl(websiteCandidate)];
  if (sanitizeUrl(websiteCandidate) !== origin) {
    pagesToVisit.push(origin);
  }

  const visited = new Set<string>();
  const pageSnapshots: Array<{ url: string; html: string }> = [];
  const notes: string[] = [];

  while (
    pagesToVisit.length > 0 &&
    visited.size < WEBSITE_MAX_PAGES_PER_DOMAIN
  ) {
    const nextUrl = pagesToVisit.shift();
    if (!nextUrl || visited.has(nextUrl)) {
      continue;
    }

    visited.add(nextUrl);

    try {
      const response = await fetchWebsitePage(nextUrl);
      const finalUrl = sanitizeUrl(
        getFinalResponseUrl(response, nextUrl)
      );
      const contentType = normalizeWhitespace(
        response.headers["content-type"]
      ).toLowerCase();

      if (response.status >= 400) {
        notes.push(`http_${response.status}:${nextUrl}`);
        continue;
      }

      if (!contentType.includes("text/html")) {
        notes.push(`non_html:${nextUrl}`);
        continue;
      }

      const html = typeof response.data === "string" ? response.data : "";
      pageSnapshots.push({ url: finalUrl, html });

      extractLinkedPages(html, finalUrl).forEach((linkedUrl) => {
        if (
          !visited.has(linkedUrl) &&
          !pagesToVisit.includes(linkedUrl) &&
          pagesToVisit.length + visited.size <
            WEBSITE_MAX_PAGES_PER_DOMAIN + 2
        ) {
          pagesToVisit.push(linkedUrl);
        }
      });
    } catch (error: any) {
      notes.push(
        `${nextUrl}:${
          normalizeWhitespace(error?.code || error?.message) ||
          "request_failed"
        }`
      );
    }
  }

  const emailCandidates = dedupe(
    pageSnapshots.flatMap(({ html }) => extractEmails(html))
  );
  const bestEmail = pickBestEmail(emailCandidates, origin);
  const phoneCandidates = dedupe(
    pageSnapshots.flatMap(({ html }) => extractPhones(stripHtml(html)))
  );
  const companyCandidates = dedupe(
    pageSnapshots.flatMap(({ html }) => extractCompanySignals(html))
  );
  const profile: WebsiteProfile = {
    website: origin,
    email: bestEmail?.email ?? null,
    phone: phoneCandidates[0] ?? null,
    companyName: pickBestCompanyName(companyCandidates, fallbackVendor),
    pagesVisited: Array.from(visited),
    notes,
  };

  domainProfileCache.set(origin, profile);
  return profile;
};

const mergeLead = (
  existing: LeadDraft,
  incoming: LeadDraft
) => {
  if (incoming.score > existing.score) {
    existing.email = incoming.email;
    existing.score = incoming.score;
  }

  if (!existing.phone && incoming.phone) {
    existing.phone = incoming.phone;
  }

  if (!existing.companyName && incoming.companyName) {
    existing.companyName = incoming.companyName;
  }

  if (!existing.website && incoming.website) {
    existing.website = incoming.website;
  }

  incoming.noteRefs.forEach((ref) => existing.noteRefs.add(ref));
  existing.notes = Array.from(existing.noteRefs).join("; ");
};

const productLabel = (product: ShopifyProduct) =>
  `${normalizeWhitespace(product.title) || "Untitled Product"} (${normalizeWhitespace(
    product.handle
  ) || product.id})`;

const buildLeadDraft = async (
  record: ProductRecord
) => {
  const product = record.product;
  const handle = normalizeWhitespace(product.handle);
  const vendor = normalizeWhitespace(product.vendor);
  const companyCandidates = extractShopifyCompanyCandidates(
    product,
    record.metafields
  );
  const websiteCandidates = collectWebsiteCandidates(
    product,
    record.metafields
  );
  const initialWebsiteCandidate = websiteCandidates[0]?.url ?? null;
  const shopifyEmails = extractShopifyEmails(product, record.metafields);
  const shopifyPhones = extractShopifyPhones(product, record.metafields);
  const websiteProfile =
    initialWebsiteCandidate &&
    (!shopifyEmails.length || !companyCandidates.length || !vendor)
      ? await resolveWebsiteProfile(initialWebsiteCandidate, vendor)
      : initialWebsiteCandidate
        ? await resolveWebsiteProfile(initialWebsiteCandidate, vendor)
        : null;
  const website =
    toOriginUrl(initialWebsiteCandidate) ??
    websiteProfile?.website ??
    null;
  const rankedEmail = pickBestEmail(
    [
      ...shopifyEmails,
      ...(websiteProfile?.email ? [websiteProfile.email] : []),
    ],
    website
  );
  const companyName =
    pickBestCompanyName(
      [
        ...companyCandidates,
        ...(websiteProfile?.companyName
          ? [websiteProfile.companyName]
          : []),
      ],
      vendor
    ) ?? "";
  const phone =
    shopifyPhones[0] ??
    websiteProfile?.phone ??
    "";
  const missingFields = [
    !rankedEmail?.email ? "email" : null,
    !companyName ? "companyName" : null,
    !website ? "website" : null,
  ].filter((field): field is string => Boolean(field));

  if (missingFields.length > 0) {
    return {
      skipped: {
        productId: product.id,
        title: normalizeWhitespace(product.title),
        handle,
        vendor,
        collectionHandles: record.collectionHandles,
        reason: `Missing mandatory field(s): ${missingFields.join(", ")}`,
        details: [
          websiteCandidates[0]
            ? `best website candidate from ${websiteCandidates[0].source}: ${websiteCandidates[0].url}`
            : "no official website candidate found in Shopify data",
          websiteProfile?.notes.length
            ? `website notes: ${websiteProfile.notes.join(" | ")}`
            : "",
        ]
          .filter(Boolean)
          .join(" | "),
      } satisfies SkippedProduct,
    };
  }

  const noteRef = `Product URL: ${buildStorefrontProductUrl(
    handle
  )} | Product ID: ${product.id}`;
  const leadDraft: LeadDraft = {
    firstName: "",
    lastName: "",
    email: rankedEmail?.email ?? "",
    phone,
    companyName,
    jobTitle: "",
    website: website ?? "",
    leadSource: "Shopify Cloud Services Product",
    leadStatus: "New",
    leadPriority: "Medium",
    leadScore: "50",
    estimatedValue: "",
    currency: "USD",
    assignedTo: "",
    tags: "Cloud Services, Shopify Product, Vendor Lead",
    notes: noteRef,
    nextFollowUpAt: "",
    score: rankedEmail?.score ?? 0,
    noteRefs: new Set([noteRef]),
  };

  return {
    skipped: null,
    leadDraft,
  };
};

const writeOutputs = async (
  leads: LeadDraft[],
  skippedProducts: SkippedProduct[]
) => {
  await fs.promises.mkdir(EXPORT_DIR, { recursive: true });

  const csvLines = [
    CRM_HEADERS.join(","),
    ...leads.map((lead) =>
      [
        lead.firstName,
        lead.lastName,
        lead.email,
        lead.phone,
        lead.companyName,
        lead.jobTitle,
        lead.website,
        lead.leadSource,
        lead.leadStatus,
        lead.leadPriority,
        lead.leadScore,
        lead.estimatedValue,
        lead.currency,
        lead.assignedTo,
        lead.tags,
        lead.notes,
        lead.nextFollowUpAt,
      ]
        .map((value) => csvEscape(value))
        .join(",")
    ),
  ].join("\n");

  await Promise.all([
    fs.promises.writeFile(OUTPUT_CSV_PATH, csvLines, "utf8"),
    fs.promises.writeFile(
      SKIPPED_LOG_PATH,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          skippedCount: skippedProducts.length,
          skippedProducts,
        },
        null,
        2
      ),
      "utf8"
    ),
  ]);
};

const main = async () => {
  const cloudCollections = await resolveCloudServiceCollections();
  console.log(
    `Resolved ${cloudCollections.length} live Shopify collection${cloudCollections.length === 1 ? "" : "s"} for ${TARGET_TOP_CATEGORY}.`
  );

  const productCollections = new Map<
    number,
    { handles: Set<string>; titles: Set<string> }
  >();

  for (const collection of cloudCollections) {
    const productIds = await fetchCollectionProductIds(collection.id);
    console.log(
      `Collection ${collection.handle} (${collection.id}) returned ${productIds.length} product reference${productIds.length === 1 ? "" : "s"}.`
    );

    productIds.forEach((productId) => {
      const current = productCollections.get(productId) ?? {
        handles: new Set<string>(),
        titles: new Set<string>(),
      };
      current.handles.add(collection.handle);
      current.titles.add(collection.title);
      productCollections.set(productId, current);
    });
  }

  let selectedProductIds = Array.from(productCollections.keys()).sort(
    (left, right) => left - right
  );

  if (PRODUCT_IDS && PRODUCT_IDS.size > 0) {
    selectedProductIds = selectedProductIds.filter((productId) =>
      PRODUCT_IDS.has(productId)
    );
  }

  if (PRODUCT_LIMIT && PRODUCT_LIMIT > 0) {
    selectedProductIds = selectedProductIds.slice(0, PRODUCT_LIMIT);
  }

  console.log(
    `Scanning ${selectedProductIds.length} unique Cloud Services product${selectedProductIds.length === 1 ? "" : "s"}.`
  );

  const skippedProducts: SkippedProduct[] = [];
  const completeRecords: ProductRecord[] = [];
  const batches = chunk(selectedProductIds, PRODUCT_BATCH_SIZE);

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    console.log(
      `[detail batch ${batchIndex + 1}/${batches.length}] Fetching ${batch.length} Shopify product${batch.length === 1 ? "" : "s"}`
    );
    const batchNodes = await fetchProductsBatch(batch);

    batchNodes.forEach((node, nodeIndex) => {
      const fallbackProductId = batch[nodeIndex];
      const productId = Number(node?.legacyResourceId ?? fallbackProductId);
      const collectionMeta = productCollections.get(productId);

      if (!node || Number.isNaN(productId)) {
        skippedProducts.push({
          productId: fallbackProductId,
          title: "",
          handle: "",
          vendor: "",
          collectionHandles: collectionMeta
            ? Array.from(collectionMeta.handles).sort()
            : [],
          reason: "Shopify product details were not returned",
        });
        return;
      }

      const metafields = [
        node.customUrlMetafield,
        node.vendorProfileUrlMetafield,
        node.sourceUrlMetafield,
        node.sourceUrlsMetafield,
        node.websiteMetafield,
        node.officialWebsiteMetafield,
        node.companyMetafield,
        node.contactEmailMetafield,
        node.emailMetafield,
        node.phoneMetafield,
      ].filter(
        (metafield): metafield is ShopifyMetafield => Boolean(metafield)
      );

      completeRecords.push({
        product: {
          id: productId,
          title: node.title ?? "",
          handle: node.handle ?? "",
          vendor: node.vendor ?? "",
          status: node.status ?? "",
          body_html: node.descriptionHtml ?? "",
          tags: Array.isArray(node.tags) ? node.tags.join(", ") : "",
          product_type: node.productType ?? "",
          metafields_global_title_tag: node.seo?.title ?? "",
          metafields_global_description_tag:
            node.seo?.description ?? "",
        },
        metafields,
        collectionHandles: collectionMeta
          ? Array.from(collectionMeta.handles).sort()
          : [],
        collectionTitles: collectionMeta
          ? Array.from(collectionMeta.titles).sort()
          : [],
      });
    });
  }

  const leadBuildResults = await mapWithConcurrency(
    completeRecords,
    WEBSITE_CONCURRENCY,
    async (record, index) => {
      console.log(
        `[lead ${index + 1}/${completeRecords.length}] Processing ${productLabel(
          record.product
        )}`
      );
      return buildLeadDraft(record);
    }
  );

  const leadsByEmail = new Map<string, LeadDraft>();
  const websiteCompanyIndex = new Map<string, LeadDraft>();
  let duplicateLeadsMerged = 0;

  leadBuildResults.forEach((result) => {
    if (result.skipped) {
      skippedProducts.push(result.skipped);
      return;
    }

    const lead = result.leadDraft;
    const emailKey = lead.email.toLowerCase();
    const websiteCompanyKey = `${lead.website.toLowerCase()}::${normalizeKey(
      lead.companyName
    )}`;
    const existing =
      leadsByEmail.get(emailKey) ??
      websiteCompanyIndex.get(websiteCompanyKey) ??
      null;

    if (existing) {
      duplicateLeadsMerged += 1;
      mergeLead(existing, lead);
      leadsByEmail.set(existing.email.toLowerCase(), existing);
      websiteCompanyIndex.set(websiteCompanyKey, existing);
      return;
    }

    leadsByEmail.set(emailKey, lead);
    websiteCompanyIndex.set(websiteCompanyKey, lead);
  });

  const leads = Array.from(
    new Set(leadsByEmail.values())
  ).sort((left, right) =>
    left.companyName.localeCompare(right.companyName)
  );

  await writeOutputs(leads, skippedProducts);

  console.log("");
  console.log("Cloud Services CRM leads export complete.");
  console.log(`Total products scanned: ${selectedProductIds.length}`);
  console.log(`Leads generated: ${leads.length}`);
  console.log(`Products skipped: ${skippedProducts.length}`);
  console.log(`Duplicate leads merged: ${duplicateLeadsMerged}`);
  console.log(`Output file path: ${OUTPUT_CSV_PATH}`);
  console.log(`Skipped log path: ${SKIPPED_LOG_PATH}`);

  if (skippedProducts.length > 0) {
    console.log("Skipped product reasons:");
    skippedProducts.forEach((item) => {
      console.log(
        `- ${item.productId || "unknown"} ${item.title || item.handle || "untitled"}: ${item.reason}${
          item.details ? ` | ${item.details}` : ""
        }`
      );
    });
  }
};

main().catch((error: any) => {
  console.error(
    "Failed to generate Cloud Services CRM leads CSV:",
    error?.message ?? error
  );
  process.exitCode = 1;
});
