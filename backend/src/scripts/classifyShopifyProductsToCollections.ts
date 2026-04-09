import "../config/env";
import fs from "fs";
import path from "path";
import csv from "csv-parser";
import axios from "axios";
import { shopifyGraphQL, shopifyRest } from "../services/shopifyHttp";

const SHOPIFY_PAGE_LIMIT = 250;
const SHOPIFY_GRAPHQL_PAGE_SIZE = 100;
const EXPORTS_DIR = path.join(__dirname, "../../exports");
const CSV_FILE_PATH = path.join(
  __dirname,
  "../../imports/category-collections.csv"
);
const APPLY_CHANGES = process.argv.includes("--apply");
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

type CsvRow = {
  top_category?: string;
  subcategory?: string;
  final_category?: string;
  collection_title?: string;
  collection_handle?: string;
};

type ShopifySmartCollection = {
  id: number;
  title?: string;
  handle?: string | null;
};

type ShopifyProductNode = {
  id?: string;
  legacyResourceId?: string | number | null;
  title?: string;
  handle?: string | null;
  descriptionHtml?: string | null;
  productType?: string | null;
  vendor?: string | null;
  tags?: string[];
  status?: string | null;
  customUrlMetafield?: {
    value?: string | null;
  } | null;
  typeMultipleMetafield?: {
    value?: string | null;
  } | null;
};

type TaxonomyEntry = {
  topCategory: string;
  subcategory: string;
  finalCategory: string;
  collectionTitle: string;
  collectionHandle: string;
  collectionId: number;
  storeValue: string;
  storeValueKind: "name" | "handle";
  isDuplicateTitle: boolean;
  normalizedTitle: string;
  normalizedHandle: string;
  normalizedStoreValue: string;
  keywordPhrases: string[];
  keywordTokens: string[];
};

type ProductForClassification = {
  graphqlId: string;
  productId: number;
  title: string;
  handle: string | null;
  descriptionText: string;
  productType: string;
  vendor: string;
  tags: string[];
  customUrl: string | null;
  currentTypeMultiple: string[];
  status: string;
};

type ClassificationSource = "description" | "product URL" | "web search";

type ProductClassification = {
  productId: number;
  title: string;
  assignedValues: string[];
  assignedValueKinds: Array<{
    value: string;
    kind: "name" | "handle";
    title: string;
    handle: string;
  }>;
  sourceUsed: ClassificationSource;
  changed: boolean;
  classificationReason: string;
  matchedCollections: Array<{
    title: string;
    handle: string;
    score: number;
    matchedPhrases: string[];
  }>;
  urlUsed: string | null;
  webSearchQuery: string | null;
};

type MutationUserError = {
  field?: string[] | null;
  message?: string;
};

type UpdateResult = {
  productId: number;
  title: string;
  assignedValues: string[];
  sourceUsed: ClassificationSource;
  updated: boolean;
};

const PRODUCT_TYPE_SUBCATEGORY_ALIASES: Record<string, string> = {
  "wordpress hosting": "WordPress Hosting",
  "dedicated hosting": "Dedicated Servers",
  "ethics ai": "Ethics AI",
  "ai tools": "AI Tools",
};

const MANUAL_ASSIGNMENT_OVERRIDES: Record<number, string[]> = {
  9112045060335: ["Responsible AI Governance"],
  9112045125871: ["Responsible AI Governance"],
  9112045191407: ["Responsible AI Governance"],
  9147062976751: ["High Traffic WordPress Hosting"],
  9147141259503: ["High Traffic WordPress Hosting"],
};

const RELATED_SUBCATEGORY_HINTS: Record<string, string[]> = {
  "visual ai": ["Visual AI", "Creative AI", "Video AI"],
  "creative ai": ["Creative AI", "Visual AI"],
  "video ai": ["Video AI", "Visual AI", "Creative AI"],
};

const COLLECTION_ALIASES: Record<string, string[]> = {
  "AI Art Generation": [
    "image generation",
    "image generator",
    "text to image",
    "art generation",
    "art generator",
    "generative art",
    "creative images",
    "custom images",
    "photorealistic images",
  ],
  "Business Intelligence AI": [
    "analytics",
    "insights",
    "business intelligence",
    "conversation analytics",
    "reporting",
  ],
  "CRM AI": [
    "crm",
    "customer engagement",
    "lead nurturing",
    "sales automation",
    "pipeline",
  ],
  "Decision Support AI": [
    "decision support",
    "decision making",
    "decision intelligence",
    "strategic planning",
  ],
  "Process Automation AI": [
    "workflow automation",
    "task automation",
    "process automation",
    "orchestration",
    "workflow optimization",
  ],
  "Revenue Forecasting AI": [
    "revenue forecasting",
    "sales forecasting",
    "forecasting",
    "forecast",
  ],
  "Clinical Decision Support AI": [
    "clinical decision support",
    "symptom checker",
    "triage",
    "care recommendations",
  ],
  "Responsible AI Governance": [
    "responsible ai",
    "responsible ai governance",
    "ethical ai",
    "ethical model development",
    "fairness",
    "bias auditing",
    "ai governance",
    "trustworthy ai",
  ],
  "Drug Discovery AI": [
    "drug discovery",
    "pharma",
    "pharmaceutical",
    "molecule",
    "biotech",
  ],
  "Medical Imaging AI": [
    "medical imaging",
    "radiology",
    "imaging",
    "ultrasound",
    "diagnostic imaging",
  ],
  "Remote Patient Monitoring AI": [
    "remote patient monitoring",
    "patient monitoring",
    "wearable monitoring",
    "remote care",
  ],
  "High Traffic WordPress Hosting": [
    "high traffic wordpress",
    "heavy traffic",
    "high intensity sites",
    "demanding sites",
    "high performance wordpress",
    "wordpress performance",
  ],
  "Managed WordPress Hosting": [
    "managed wordpress hosting",
    "wordpress managed hosting",
    "premium wordpress hosting",
  ],
  "High Availability Cloud": [
    "high availability cloud",
    "high performance cloud",
    "high capacity cloud",
    "enterprise workloads",
    "cloud performance",
  ],
  "Real Estate Chatbots": [
    "real estate chatbot",
    "property chatbot",
    "real estate assistant",
  ],
  "Visual Search AI": ["visual search", "image search", "camera search"],
  "Graphic Design AI": [
    "design platform",
    "graphic design",
    "visual design",
    "design templates",
    "creative design",
    "marketing design",
    "social media graphics",
    "marketing creative",
  ],
  "Computer Vision AI": [
    "computer vision",
    "image analysis",
    "visual analysis",
    "image recognition",
    "vision model",
  ],
  "Image Enhancement AI": [
    "image enhancement",
    "image editing",
    "photo editing",
    "background removal",
    "image upscaling",
    "photo upscaling",
    "detail enhancement",
    "image restoration",
  ],
  "Object Detection AI": [
    "object detection",
    "object extraction",
    "object recognition",
    "image segmentation",
  ],
  "Recommendation Engines": [
    "recommendation",
    "personalization",
    "recommended products",
  ],
  "Demand Forecasting AI": ["demand forecasting", "forecasting", "forecast"],
  "Market Analysis AI": [
    "market analysis",
    "market intelligence",
    "market insights",
  ],
  "Grammar Correction AI": [
    "grammar",
    "spelling",
    "proofreading",
    "writing correction",
  ],
  "Machine Translation AI": [
    "translation",
    "translate",
    "multilingual",
    "localization",
  ],
  "Text Summarization AI": ["summarization", "summary", "summarize"],
  "Conversational AI": [
    "chatbot",
    "conversational",
    "conversation",
    "assistant",
  ],
  "Intent Recognition AI": [
    "intent recognition",
    "intent detection",
    "intent analysis",
  ],
  "AI Copywriting": ["copywriting", "marketing copy", "ad copy"],
  "Email Writing AI": ["email writing", "email assistant", "compose email"],
  "Long-Form Content AI": [
    "long form",
    "article writing",
    "blog writing",
    "content generation",
  ],
  "Product Description AI": [
    "product description",
    "product copy",
    "catalog copy",
  ],
  "SEO Content AI": ["seo", "search engine optimization", "keyword content"],
  "Email Assistant AI": [
    "email assistant",
    "email",
    "inbox",
    "compose email",
    "mail drafting",
  ],
  "Meeting Assistant AI": [
    "meeting assistant",
    "meeting",
    "call summary",
    "meeting notes",
    "transcription",
    "action items",
  ],
  "Enterprise AI Assistants": [
    "enterprise assistant",
    "workspace assistant",
    "microsoft 365",
    "google workspace",
    "business productivity",
  ],
  "Personal AI Assistants": [
    "personal assistant",
    "voice assistant",
    "smart home",
    "device control",
    "mobile assistant",
  ],
  "Task Automation AI": [
    "task automation",
    "workflow automation",
    "task management",
    "productivity tasks",
  ],
  "Video Editing AI": [
    "video editing",
    "video editor",
    "generative video",
    "video creation",
    "image and video editing",
  ],
};

const GENERIC_TOKENS = new Set([
  "ai",
  "software",
  "hosting",
  "host",
  "services",
  "service",
  "management",
  "system",
  "systems",
  "tool",
  "tools",
  "platform",
  "platforms",
  "solution",
  "solutions",
  "multiple",
  "assistant",
  "image",
  "video",
  "text",
  "photo",
]);

const LOW_SIGNAL_TOKENS = new Set([
  "audio",
  "background",
  "check",
  "code",
  "data",
  "editing",
  "editor",
  "generation",
  "management",
  "quality",
  "removal",
  "software",
  "source",
]);

const TEXT_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "or",
  "for",
  "of",
  "the",
  "to",
  "with",
  "on",
  "in",
  "by",
  "from",
  "at",
  "as",
  "is",
  "are",
  "be",
  "this",
  "that",
  "it",
  "its",
  "into",
  "your",
  "their",
]);

const SOURCE_WEIGHTS = {
  title: 5,
  tags: 4,
  productType: 4,
  description: 3,
  vendor: 2,
  url: 2,
  search: 1,
};

const DIRECT_MATCH_THRESHOLD = 12;
const MULTI_MATCH_THRESHOLD = 9;

const normalizeWhitespace = (value: string) =>
  value.replace(/\s+/g, " ").trim();

const stripHtml = (value: string) =>
  normalizeWhitespace(
    value
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
  );

const normalizeKey = (value: string | null | undefined) =>
  typeof value === "string"
    ? normalizeWhitespace(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
    : "";

const tokenize = (value: string | null | undefined) =>
  normalizeKey(value)
    .split(" ")
    .filter(
      (token) =>
        Boolean(token) &&
        !TEXT_STOPWORDS.has(token) &&
        token.length > 1
    );

const parseListMetafield = (value?: string | null): string[] => {
  if (typeof value !== "string" || value.trim() === "") {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => normalizeWhitespace(String(item)))
        .filter(Boolean);
    }
  } catch {
    // Fall back to a raw string value.
  }

  return [normalizeWhitespace(value)].filter(Boolean);
};

const toUniqueList = (values: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];

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

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const csvEscape = (value: string | number | boolean | null | undefined) => {
  const stringValue =
    value === null || value === undefined ? "" : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
};

const extractNextPageInfo = (
  linkHeader?: string
): string | null => {
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

const getGraphQlErrorMessage = (
  errors?: Array<{ message?: string }> | null,
  fallback = "Shopify request failed"
) => {
  if (!Array.isArray(errors) || errors.length === 0) {
    return fallback;
  }

  const message = errors
    .map((error) => error.message?.trim())
    .filter(Boolean)
    .join(", ");

  return message || fallback;
};

const formatUserErrors = (
  userErrors: MutationUserError[],
  fallback: string
) => {
  const message = userErrors
    .map((error) => {
      const field =
        Array.isArray(error.field) && error.field.length > 0
          ? `${error.field.join(".")}: `
          : "";
      return `${field}${error.message?.trim() ?? ""}`.trim();
    })
    .filter(Boolean)
    .join(", ");

  return message || fallback;
};

const isRetryableError = (error: any) => {
  const status = error?.response?.status;
  const message =
    typeof error?.message === "string"
      ? error.message.toLowerCase()
      : "";
  const graphQlErrors = error?.response?.data?.errors;

  if (status === 429 || status === 502 || status === 503 || status === 504) {
    return true;
  }

  if (Array.isArray(graphQlErrors)) {
    const joined = graphQlErrors
      .map((item) =>
        typeof item?.message === "string" ? item.message.toLowerCase() : ""
      )
      .join(" ");
    if (joined.includes("throttled")) {
      return true;
    }
  }

  return (
    message.includes("timeout") ||
    message.includes("socket hang up") ||
    message.includes("econnreset") ||
    message.includes("throttled")
  );
};

const withRetries = async <T>(
  label: string,
  fn: () => Promise<T>,
  maxAttempts = 5
): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error: any) {
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

const fetchAllShopifyResources = async <T>(
  pathName: string,
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
    } = await withRetries(`GET ${pathName}`, () =>
      shopifyRest.get(pathName, { params })
    );

    const pageItems = Array.isArray(response.data?.[responseKey])
      ? response.data[responseKey]
      : [];

    results.push(...pageItems);
    pageInfo = extractNextPageInfo(response.headers.link);
  } while (pageInfo);

  return results;
};

const fetchAllSmartCollections = async () =>
  fetchAllShopifyResources<ShopifySmartCollection>(
    "/smart_collections.json",
    "smart_collections"
  );

const fetchAllProducts = async () => {
  const products: ProductForClassification[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response: {
      data?: {
        data?: {
          products?: {
            nodes?: ShopifyProductNode[];
            pageInfo?: {
              hasNextPage?: boolean;
              endCursor?: string | null;
            };
          };
        };
        errors?: Array<{ message?: string }>;
      };
    } = await withRetries("Fetch Shopify products for classification", () =>
      shopifyGraphQL.post("", {
        query: `
          query FetchProductsForClassification($first: Int!, $after: String) {
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
                customUrlMetafield: metafield(namespace: "custom", key: "custom") {
                  value
                }
                typeMultipleMetafield: metafield(namespace: "custom", key: "type_multiple") {
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
      })
    );

    if (response.data?.errors?.length) {
      throw new Error(
        getGraphQlErrorMessage(
          response.data.errors,
          "Failed to fetch Shopify products for classification"
        )
      );
    }

    const connection = response.data?.data?.products;
    const nodes = Array.isArray(connection?.nodes) ? connection.nodes : [];

    nodes.forEach((node) => {
      const productId = Number(node.legacyResourceId);

      if (!node.id || Number.isNaN(productId)) {
        return;
      }

      products.push({
        graphqlId: node.id,
        productId,
        title: normalizeWhitespace(node.title ?? "Untitled Product"),
        handle: node.handle?.trim() ?? null,
        descriptionText: stripHtml(node.descriptionHtml ?? ""),
        productType: normalizeWhitespace(node.productType ?? ""),
        vendor: normalizeWhitespace(node.vendor ?? ""),
        tags: Array.isArray(node.tags)
          ? node.tags.map((tag) => normalizeWhitespace(tag)).filter(Boolean)
          : [],
        customUrl: normalizeWhitespace(
          node.customUrlMetafield?.value ?? ""
        ) || null,
        currentTypeMultiple: parseListMetafield(
          node.typeMultipleMetafield?.value
        ),
        status: normalizeWhitespace(node.status ?? ""),
      });
    });

    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage);
    cursor = connection?.pageInfo?.endCursor ?? null;
  }

  return products;
};

const readCsvRows = async () => {
  const rows: CsvRow[] = [];

  return new Promise<CsvRow[]>((resolve, reject) => {
    fs.createReadStream(CSV_FILE_PATH)
      .pipe(csv())
      .on("data", (row: CsvRow) => {
        rows.push(row);
      })
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
};

const buildTaxonomy = async () => {
  const [csvRows, smartCollections] = await Promise.all([
    readCsvRows(),
    fetchAllSmartCollections(),
  ]);

  const collectionsByHandle = new Map<string, ShopifySmartCollection>();
  const titleCounts = new Map<string, number>();

  smartCollections.forEach((collection) => {
    const handle = collection.handle?.trim() ?? "";
    const title = collection.title?.trim() ?? "";

    if (handle) {
      collectionsByHandle.set(normalizeKey(handle), collection);
    }

    if (title) {
      const titleKey = normalizeKey(title);
      titleCounts.set(titleKey, (titleCounts.get(titleKey) ?? 0) + 1);
    }
  });

  const taxonomy: TaxonomyEntry[] = [];

  csvRows.forEach((row) => {
    const collectionHandle = normalizeWhitespace(
      row.collection_handle ?? ""
    );
    const collectionTitle = normalizeWhitespace(
      row.collection_title ?? ""
    );
    const subcategory = normalizeWhitespace(row.subcategory ?? "");
    const finalCategory = normalizeWhitespace(row.final_category ?? "");
    const topCategory = normalizeWhitespace(row.top_category ?? "");

    if (!collectionHandle || !collectionTitle || !subcategory) {
      return;
    }

    const liveCollection = collectionsByHandle.get(
      normalizeKey(collectionHandle)
    );

    if (!liveCollection) {
      return;
    }

    const isDuplicateTitle =
      (titleCounts.get(normalizeKey(collectionTitle)) ?? 0) > 1;
    const storeValue = isDuplicateTitle
      ? collectionHandle
      : collectionTitle;
    const basePhrases = [
      collectionTitle,
      collectionHandle.replace(/-/g, " "),
      finalCategory,
      ...(COLLECTION_ALIASES[collectionTitle] ?? []),
    ];
    const keywordPhrases = toUniqueList(
      basePhrases.map((phrase) => normalizeWhitespace(phrase)).filter(Boolean)
    );
    const keywordTokens = toUniqueList(
      keywordPhrases
        .flatMap((phrase) => tokenize(phrase))
        .filter((token) => !GENERIC_TOKENS.has(token))
    );

    taxonomy.push({
      topCategory,
      subcategory,
      finalCategory,
      collectionTitle,
      collectionHandle,
      collectionId: liveCollection.id,
      storeValue,
      storeValueKind: isDuplicateTitle ? "handle" : "name",
      isDuplicateTitle,
      normalizedTitle: normalizeKey(collectionTitle),
      normalizedHandle: normalizeKey(collectionHandle),
      normalizedStoreValue: normalizeKey(storeValue),
      keywordPhrases,
      keywordTokens,
    });
  });

  return taxonomy;
};

const getResolvedSubcategory = (
  productType: string,
  taxonomy: TaxonomyEntry[]
) => {
  const normalizedProductType = normalizeKey(productType);
  const aliasedSubcategory =
    PRODUCT_TYPE_SUBCATEGORY_ALIASES[normalizedProductType] ?? productType;

  if (
    taxonomy.some(
      (entry) =>
        normalizeKey(entry.subcategory) === normalizeKey(aliasedSubcategory)
    )
  ) {
    return aliasedSubcategory;
  }

  return productType;
};

const extractHtmlSignals = (html: string) => {
  const pieces: string[] = [];
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]) {
    pieces.push(stripHtml(titleMatch[1]));
  }

  const metaPatterns = [
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
  ];

  metaPatterns.forEach((pattern) => {
    const match = html.match(pattern);
    if (match?.[1]) {
      pieces.push(stripHtml(match[1]));
    }
  });

  const headingMatches = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) ?? [];
  headingMatches.slice(0, 3).forEach((heading) => {
    pieces.push(stripHtml(heading));
  });

  return toUniqueList(pieces).join(" ");
};

const isLikelyHttpUrl = (value: string | null) => {
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

const urlTextCache = new Map<string, string>();
const webSearchCache = new Map<string, string>();

const fetchUrlText = async (url: string) => {
  if (urlTextCache.has(url)) {
    return urlTextCache.get(url) ?? "";
  }

  try {
    const response = await withRetries(`Fetch product URL ${url}`, () =>
      axios.get(url, {
        timeout: 15000,
        maxRedirects: 5,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        },
        validateStatus: (status) => status >= 200 && status < 400,
      })
    );

    const text = `${extractHtmlSignals(String(response.data ?? ""))} ${new URL(
      url
    ).pathname.replace(/[-_/]+/g, " ")}`.trim();
    urlTextCache.set(url, text);
    return text;
  } catch {
    urlTextCache.set(url, "");
    return "";
  }
};

const extractDuckDuckGoSnippets = (html: string) => {
  const snippets: string[] = [];
  const snippetMatches = html.match(
    /class="result__snippet"[\s\S]*?>([\s\S]*?)<\/a>/gi
  );
  snippetMatches?.slice(0, 5).forEach((match) => {
    snippets.push(stripHtml(match));
  });
  const titleMatches = html.match(
    /class="result__a"[\s\S]*?>([\s\S]*?)<\/a>/gi
  );
  titleMatches?.slice(0, 5).forEach((match) => {
    snippets.push(stripHtml(match));
  });

  return toUniqueList(snippets).join(" ");
};

const fetchWebSearchText = async (query: string) => {
  if (webSearchCache.has(query)) {
    return webSearchCache.get(query) ?? "";
  }

  try {
    const response = await withRetries(`Web search ${query}`, () =>
      axios.get("https://html.duckduckgo.com/html/", {
        timeout: 15000,
        params: {
          q: query,
        },
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        },
        validateStatus: (status) => status >= 200 && status < 400,
      })
    );

    const text = extractDuckDuckGoSnippets(String(response.data ?? ""));
    webSearchCache.set(query, text);
    return text;
  } catch {
    webSearchCache.set(query, "");
    return "";
  }
};

const buildCandidatePool = (
  product: ProductForClassification,
  taxonomy: TaxonomyEntry[]
) => {
  const normalizedProductType = normalizeKey(product.productType);
  const hintTokens = new Set(
    tokenize(
      [product.title, product.tags.join(" "), product.descriptionText].join(" ")
    )
  );
  const hintedCandidates = taxonomy.filter((entry) =>
    entry.keywordTokens.some((token) => hintTokens.has(token))
  );
  const exactTitleMatches = taxonomy.filter(
    (entry) => entry.normalizedTitle === normalizedProductType
  );

  if (exactTitleMatches.length > 0) {
    return exactTitleMatches;
  }

  const resolvedSubcategory = getResolvedSubcategory(
    product.productType,
    taxonomy
  );
  const subcategoryMatches = taxonomy.filter(
    (entry) =>
      normalizeKey(entry.subcategory) === normalizeKey(resolvedSubcategory)
  );

  if (subcategoryMatches.length > 0) {
    const relatedSubcategories =
      RELATED_SUBCATEGORY_HINTS[normalizeKey(resolvedSubcategory)] ?? [];

    if (relatedSubcategories.length === 0) {
      return subcategoryMatches;
    }

    const primaryTopCategory = normalizeKey(subcategoryMatches[0].topCategory);
    const relatedMatches = hintedCandidates.filter(
      (entry) =>
        normalizeKey(entry.topCategory) === primaryTopCategory &&
        relatedSubcategories.some(
          (subcategory) =>
            normalizeKey(entry.subcategory) === normalizeKey(subcategory)
        )
    );

    return Array.from(
      new Map(
        [...subcategoryMatches, ...relatedMatches].map((entry) => [
          entry.collectionId,
          entry,
        ])
      ).values()
    );
  }

  if (normalizedProductType === "ai tools") {
    return taxonomy.filter(
      (entry) => normalizeKey(entry.topCategory) === "ai tools"
    );
  }

  if (hintedCandidates.length > 0) {
    const inferredTopCategory = product.title.toLowerCase().includes("hosting")
      ? "cloud services"
      : product.title.toLowerCase().includes("software")
        ? "software"
        : product.title.toLowerCase().includes(" ai") ||
            product.descriptionText.toLowerCase().includes(" ai")
          ? "ai tools"
          : "";

    return inferredTopCategory
      ? hintedCandidates.filter(
          (entry) =>
            normalizeKey(entry.topCategory) === inferredTopCategory
        )
      : hintedCandidates;
  }

  return [];
};

const phraseAppears = (text: string, phrase: string) => {
  const normalizedText = normalizeKey(text);
  const normalizedPhrase = normalizeKey(phrase);

  if (!normalizedText || !normalizedPhrase) {
    return false;
  }

  return normalizedText.includes(normalizedPhrase);
};

const scoreCandidate = ({
  entry,
  sources,
}: {
  entry: TaxonomyEntry;
  sources: {
    title: string;
    tags: string;
    productType: string;
    description: string;
    vendor: string;
    url: string;
    search: string;
  };
}) => {
  let score = 0;
  const matchedPhrases: string[] = [];
  const sourceEntries = Object.entries(sources) as Array<
    [keyof typeof sources, string]
  >;

  sourceEntries.forEach(([sourceName, sourceText]) => {
    if (!sourceText) {
      return;
    }

    entry.keywordPhrases.forEach((phrase) => {
      if (!phraseAppears(sourceText, phrase)) {
        return;
      }

      const weight = SOURCE_WEIGHTS[sourceName];
      const exactBonus =
        normalizeKey(phrase) === entry.normalizedTitle ||
        normalizeKey(phrase) === entry.normalizedHandle
          ? 3
          : 1;
      score += weight + exactBonus;
      matchedPhrases.push(`${sourceName}:${phrase}`);
    });

    const tokens = tokenize(sourceText);
    const tokenSet = new Set(tokens);
    const tokenHits = entry.keywordTokens.filter((token) => tokenSet.has(token));
    const meaningfulTokenHits = tokenHits.filter(
      (token) => !LOW_SIGNAL_TOKENS.has(token)
    );

    if (meaningfulTokenHits.length > 0) {
      score +=
        meaningfulTokenHits.length * Math.max(1, SOURCE_WEIGHTS[sourceName] - 1);
      matchedPhrases.push(
        ...meaningfulTokenHits.map((token) => `${sourceName}:${token}`)
      );
    }
  });

  if (
    normalizeKey(sources.productType) === normalizeKey(entry.collectionTitle)
  ) {
    score += 12;
    matchedPhrases.push("productType:exact-collection-title");
  }

  if (
    normalizeKey(sources.productType) === normalizeKey(entry.subcategory)
  ) {
    score += 2;
    matchedPhrases.push("productType:subcategory-context");
  }

  if (entry.collectionTitle === "Other") {
    score -= 2;
  }

  return {
    score,
    matchedPhrases: toUniqueList(matchedPhrases),
  };
};

const chooseAssignments = (
  scoredCandidates: Array<{
    entry: TaxonomyEntry;
    score: number;
    matchedPhrases: string[];
  }>
) => {
  const positiveCandidates = scoredCandidates
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  if (positiveCandidates.length === 0) {
    return [];
  }

  const topSpecificCandidates = positiveCandidates.filter(
    (candidate) => candidate.entry.collectionTitle !== "Other"
  );
  const primaryCandidate =
    topSpecificCandidates[0] ?? positiveCandidates[0];
  const normalizedPrimaryTopCategory = normalizeKey(
    primaryCandidate.entry.topCategory
  );
  const normalizedPrimarySubcategory = normalizeKey(
    primaryCandidate.entry.subcategory
  );
  const additionalCandidates = positiveCandidates.filter((candidate) => {
    if (candidate.entry.collectionId === primaryCandidate.entry.collectionId) {
      return false;
    }

    return (
      normalizeKey(candidate.entry.topCategory) ===
        normalizedPrimaryTopCategory &&
      normalizeKey(candidate.entry.subcategory) ===
        normalizedPrimarySubcategory &&
      candidate.score >= Math.max(MULTI_MATCH_THRESHOLD, primaryCandidate.score - 2) &&
      candidate.matchedPhrases.length >= 3
    );
  });

  if (primaryCandidate.score >= DIRECT_MATCH_THRESHOLD) {
    return [primaryCandidate, ...additionalCandidates.slice(0, 1)];
  }

  if (primaryCandidate.score >= MULTI_MATCH_THRESHOLD) {
    return [primaryCandidate, ...additionalCandidates.slice(0, 1)];
  }

  if (primaryCandidate.entry.collectionTitle === "Other") {
    return [primaryCandidate];
  }

  return [primaryCandidate];
};

const classifyProduct = async (
  product: ProductForClassification,
  taxonomy: TaxonomyEntry[]
): Promise<ProductClassification> => {
  const overrideValues = MANUAL_ASSIGNMENT_OVERRIDES[product.productId];

  if (overrideValues?.length) {
    const assignedEntries = overrideValues
      .map((value) => {
        const normalizedValue = normalizeKey(value);
        return (
          taxonomy.find(
            (entry) =>
              entry.normalizedStoreValue === normalizedValue ||
              entry.normalizedTitle === normalizedValue ||
              entry.normalizedHandle === normalizedValue
          ) ?? null
        );
      })
      .filter((entry): entry is TaxonomyEntry => Boolean(entry));
    const assignedValues = toUniqueList(
      assignedEntries.map((entry) => entry.storeValue)
    );
    const assignedValueKinds = assignedEntries.map((entry) => ({
      value: entry.storeValue,
      kind: entry.storeValueKind,
      title: entry.collectionTitle,
      handle: entry.collectionHandle,
    }));
    const currentValues = toUniqueList(product.currentTypeMultiple);
    const changed =
      normalizeKey(JSON.stringify(currentValues)) !==
      normalizeKey(JSON.stringify(assignedValues));

    return {
      productId: product.productId,
      title: product.title,
      assignedValues,
      assignedValueKinds,
      sourceUsed: "description",
      changed,
      classificationReason: assignedEntries
        .map((entry) => `${entry.collectionTitle} via manual override`)
        .join("; "),
      matchedCollections: assignedEntries.map((entry) => ({
        title: entry.collectionTitle,
        handle: entry.collectionHandle,
        score: 999,
        matchedPhrases: ["manual-override"],
      })),
      urlUsed: product.customUrl,
      webSearchQuery: null,
    };
  }

  const candidatePool = buildCandidatePool(product, taxonomy);
  const resolvedSubcategory = getResolvedSubcategory(
    product.productType,
    taxonomy
  );
  const resolvedSubcategoryEntries = taxonomy.filter(
    (entry) =>
      normalizeKey(entry.subcategory) === normalizeKey(resolvedSubcategory)
  );
  const resolvedTopCategoryKey =
    resolvedSubcategoryEntries.length > 0
      ? normalizeKey(resolvedSubcategoryEntries[0].topCategory)
      : "";
  const productContextTopCategoryKey = /\bhosting\b/i.test(
    `${product.productType} ${product.title}`
  )
    ? "cloud services"
    : /\bsoftware\b/i.test(`${product.productType} ${product.title}`)
      ? "software"
      : /\bai\b/i.test(
            `${product.productType} ${product.title} ${product.descriptionText} ${product.tags.join(
              " "
            )}`
          )
        ? "ai tools"
        : "";
  const baseSources = {
    title: product.title,
    tags: product.tags.join(" "),
    productType: product.productType,
    description: product.descriptionText,
    vendor: product.vendor,
    url: "",
    search: "",
  };

  const initialScored = candidatePool.map((entry) => {
    const result = scoreCandidate({
      entry,
      sources: baseSources,
    });

    return {
      entry,
      ...result,
    };
  });

  let chosen = chooseAssignments(initialScored);
  let sourceUsed: ClassificationSource = "description";
  let urlUsed: string | null = null;
  let webSearchQuery: string | null = null;
  let finalScored = initialScored;

  const needsMoreContext =
    chosen.length === 0 ||
    Math.max(...finalScored.map((candidate) => candidate.score), 0) <
      DIRECT_MATCH_THRESHOLD;

  if (needsMoreContext && isLikelyHttpUrl(product.customUrl)) {
    urlUsed = product.customUrl;
    const urlText = await fetchUrlText(product.customUrl as string);

    if (urlText) {
      finalScored = candidatePool.map((entry) => {
        const result = scoreCandidate({
          entry,
          sources: {
            ...baseSources,
            url: urlText,
          },
        });

        return {
          entry,
          ...result,
        };
      });
      chosen = chooseAssignments(finalScored);
      sourceUsed = "product URL";
    }
  }

  const stillUnclear =
    chosen.length === 0 ||
    Math.max(...finalScored.map((candidate) => candidate.score), 0) <
      DIRECT_MATCH_THRESHOLD;

  if (stillUnclear) {
    webSearchQuery = toUniqueList(
      [product.title, product.vendor, product.productType].filter(Boolean)
    ).join(" ");
    const searchText = await fetchWebSearchText(webSearchQuery);

    if (searchText) {
      finalScored = candidatePool.map((entry) => {
        const result = scoreCandidate({
          entry,
          sources: {
            ...baseSources,
            url:
              sourceUsed === "product URL" && urlUsed
                ? urlTextCache.get(urlUsed) ?? ""
                : "",
            search: searchText,
          },
        });

        return {
          entry,
          ...result,
        };
      });
      chosen = chooseAssignments(finalScored);
      sourceUsed = "web search";
    }
  }

  let assignedEntries = chosen.map((candidate) => candidate.entry);
  const enforcedTopCategoryKey =
    resolvedTopCategoryKey || productContextTopCategoryKey;
  if (enforcedTopCategoryKey) {
    const topCategoryFiltered = assignedEntries.filter(
      (entry) => normalizeKey(entry.topCategory) === enforcedTopCategoryKey
    );

    if (topCategoryFiltered.length > 0) {
      assignedEntries = topCategoryFiltered;
    }
  }

  if (
    assignedEntries.length === 0 &&
    resolvedSubcategoryEntries.length > 0
  ) {
    const otherEntry = resolvedSubcategoryEntries.find(
      (entry) => entry.collectionTitle === "Other"
    );

    if (otherEntry) {
      assignedEntries = [otherEntry];
    }
  }

  const assignedValues = toUniqueList(
    assignedEntries.map((entry) => entry.storeValue)
  );
  const assignedValueKinds = assignedEntries.map((entry) => ({
    value: entry.storeValue,
    kind: entry.storeValueKind,
    title: entry.collectionTitle,
    handle: entry.collectionHandle,
  }));
  const currentValues = toUniqueList(product.currentTypeMultiple);
  const changed =
    normalizeKey(JSON.stringify(currentValues)) !==
    normalizeKey(JSON.stringify(assignedValues));

  let classificationReason = "No confident collection match found.";
  if (assignedEntries.length > 0) {
    classificationReason = assignedEntries
      .map((entry) =>
        `${entry.collectionTitle} via ${entry.storeValueKind === "handle" ? "handle" : "name"}`
      )
      .join("; ");
  }

  return {
    productId: product.productId,
    title: product.title,
    assignedValues,
    assignedValueKinds,
    sourceUsed,
    changed,
    classificationReason,
    matchedCollections: chosen.map((candidate) => ({
      title: candidate.entry.collectionTitle,
      handle: candidate.entry.collectionHandle,
      score: candidate.score,
      matchedPhrases: candidate.matchedPhrases,
    })),
    urlUsed,
    webSearchQuery,
  };
};

const clearProductTypeMultipleValues = async (productGraphqlId: string) => {
  const response: {
    data?: {
      data?: {
        metafieldsDelete?: {
          userErrors?: MutationUserError[];
        };
      };
      errors?: Array<{ message?: string }>;
    };
  } = await withRetries(`Clear type_multiple for ${productGraphqlId}`, () =>
    shopifyGraphQL.post("", {
      query: `
        mutation DeleteTypeMultipleMetafield(
          $metafields: [MetafieldIdentifierInput!]!
        ) {
          metafieldsDelete(metafields: $metafields) {
            userErrors {
              field
              message
            }
          }
        }
      `,
      variables: {
        metafields: [
          {
            ownerId: productGraphqlId,
            namespace: "custom",
            key: "type_multiple",
          },
        ],
      },
    })
  );

  if (response.data?.errors?.length) {
    throw new Error(
      getGraphQlErrorMessage(
        response.data.errors,
        `Failed to clear type_multiple for ${productGraphqlId}`
      )
    );
  }

  const userErrors =
    response.data?.data?.metafieldsDelete?.userErrors ?? [];

  if (userErrors.length > 0) {
    throw new Error(
      formatUserErrors(
        userErrors,
        `Failed to clear type_multiple for ${productGraphqlId}`
      )
    );
  }
};

const setProductTypeMultipleValues = async (
  productGraphqlId: string,
  values: string[]
) => {
  if (values.length === 0) {
    return;
  }

  const response: {
    data?: {
      data?: {
        metafieldsSet?: {
          userErrors?: MutationUserError[];
        };
      };
      errors?: Array<{ message?: string }>;
    };
  } = await withRetries(`Set type_multiple for ${productGraphqlId}`, () =>
    shopifyGraphQL.post("", {
      query: `
        mutation SetTypeMultipleMetafield(
          $metafields: [MetafieldsSetInput!]!
        ) {
          metafieldsSet(metafields: $metafields) {
            userErrors {
              field
              message
            }
          }
        }
      `,
      variables: {
        metafields: [
          {
            ownerId: productGraphqlId,
            namespace: "custom",
            key: "type_multiple",
            type: "list.single_line_text_field",
            value: JSON.stringify(values),
          },
        ],
      },
    })
  );

  if (response.data?.errors?.length) {
    throw new Error(
      getGraphQlErrorMessage(
        response.data.errors,
        `Failed to set type_multiple for ${productGraphqlId}`
      )
    );
  }

  const userErrors = response.data?.data?.metafieldsSet?.userErrors ?? [];

  if (userErrors.length > 0) {
    throw new Error(
      formatUserErrors(
        userErrors,
        `Failed to set type_multiple for ${productGraphqlId}`
      )
    );
  }
};

const writeReportFiles = async ({
  classifications,
  updates,
  applyChanges,
}: {
  classifications: ProductClassification[];
  updates: UpdateResult[];
  applyChanges: boolean;
}) => {
  await fs.promises.mkdir(EXPORTS_DIR, { recursive: true });

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");
  const baseName = `shopify-product-classification-${timestamp}${
    applyChanges ? "-applied" : "-dry-run"
  }`;

  const summaryPath = path.join(EXPORTS_DIR, `${baseName}.json`);
  const csvPath = path.join(EXPORTS_DIR, `${baseName}.csv`);

  const summary = {
    generatedAt: new Date().toISOString(),
    applyChanges,
    productCount: classifications.length,
    updatedCount: updates.filter((update) => update.updated).length,
    unchangedCount: updates.filter((update) => !update.updated).length,
    sourceBreakdown: classifications.reduce<Record<string, number>>(
      (accumulator, item) => {
        accumulator[item.sourceUsed] =
          (accumulator[item.sourceUsed] ?? 0) + 1;
        return accumulator;
      },
      {}
    ),
    classifications,
    updates,
  };

  await fs.promises.writeFile(
    summaryPath,
    JSON.stringify(summary, null, 2),
    "utf8"
  );

  const csvLines = [
    [
      "product_id",
      "title",
      "assigned_values",
      "assigned_kinds",
      "source_used",
      "changed",
      "classification_reason",
      "url_used",
      "web_search_query",
    ]
      .map((value) => csvEscape(value))
      .join(","),
    ...classifications.map((item) =>
      [
        item.productId,
        item.title,
        item.assignedValues.join(" | "),
        item.assignedValueKinds
          .map((entry) => `${entry.value}:${entry.kind}`)
          .join(" | "),
        item.sourceUsed,
        item.changed,
        item.classificationReason,
        item.urlUsed,
        item.webSearchQuery,
      ]
        .map((value) => csvEscape(value))
        .join(",")
    ),
  ].join("\n");

  await fs.promises.writeFile(csvPath, csvLines, "utf8");

  return {
    summaryPath,
    csvPath,
  };
};

const main = async () => {
  console.log("Loading taxonomy and live smart collections...");
  const taxonomy = await buildTaxonomy();
  console.log(`Taxonomy entries available in Shopify: ${taxonomy.length}`);

  console.log("Fetching Shopify products for classification...");
  const allProducts = await fetchAllProducts();
  const idFilteredProducts = PRODUCT_IDS
    ? allProducts.filter((product) => PRODUCT_IDS.has(product.productId))
    : allProducts;
  const products = PRODUCT_LIMIT
    ? idFilteredProducts.slice(0, PRODUCT_LIMIT)
    : idFilteredProducts;
  console.log(`Products to process: ${products.length}`);

  const classifications: ProductClassification[] = [];
  const updates: UpdateResult[] = [];

  for (const [index, product] of products.entries()) {
    console.log(
      `[${index + 1}/${products.length}] Classifying product ${product.productId}: ${product.title}`
    );

    const classification = await classifyProduct(product, taxonomy);
    classifications.push(classification);

    if (APPLY_CHANGES) {
      await clearProductTypeMultipleValues(product.graphqlId);
      await setProductTypeMultipleValues(
        product.graphqlId,
        classification.assignedValues
      );

      updates.push({
        productId: product.productId,
        title: product.title,
        assignedValues: classification.assignedValues,
        sourceUsed: classification.sourceUsed,
        updated: true,
      });
    } else {
      updates.push({
        productId: product.productId,
        title: product.title,
        assignedValues: classification.assignedValues,
        sourceUsed: classification.sourceUsed,
        updated: classification.changed,
      });
    }

    await sleep(200);
  }

  const reportPaths = await writeReportFiles({
    classifications,
    updates,
    applyChanges: APPLY_CHANGES,
  });

  console.log(`Classification report: ${reportPaths.summaryPath}`);
  console.log(`Classification CSV: ${reportPaths.csvPath}`);
  console.log(
    `Products classified: ${classifications.length}. Apply mode: ${APPLY_CHANGES}`
  );
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Shopify product classification failed:", error);
    process.exit(1);
  });
