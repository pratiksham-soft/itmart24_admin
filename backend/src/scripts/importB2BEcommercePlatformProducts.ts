import "../config/env";
import * as fs from "fs";
import * as path from "path";
import csv = require("csv-parser");
import axios from "axios";
import { execFile } from "child_process";
import { promisify } from "util";
import { getProductImportOverride } from "./lib/csCartB2BOverride";

const execFileAsync = promisify(execFile);

let shopifyClientsPromise:
  | Promise<typeof import("../services/shopifyHttp")>
  | null = null;

const CATEGORY_COLLECTIONS_PATH = path.resolve(
  __dirname,
  "../../imports/category-collections.csv"
);
const CATEGORIES_PATH = path.resolve(
  __dirname,
  "../../imports/categories.csv"
);
const FILTERS_CSV_PATH = path.resolve(
  __dirname,
  "../../doc/shopify-filter-definitions.csv"
);
const slugifyPathValue = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

const getCliArgValue = (flag: string) => {
  const prefixedArg = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (prefixedArg) {
    return prefixedArg.slice(flag.length + 1).trim();
  }

  const argIndex = process.argv.indexOf(flag);
  if (argIndex >= 0) {
    return String(process.argv[argIndex + 1] ?? "").trim();
  }

  return "";
};

const SOFTWARE_PRODUCTS_BASE_ROOT = path.resolve(
  __dirname,
  "../../exports/software-products"
);
const INPUT_ROOT_ARG =
  getCliArgValue("--root") || getCliArgValue("--input-root");
const SOFTWARE_PRODUCTS_ROOT = INPUT_ROOT_ARG
  ? path.resolve(process.cwd(), INPUT_ROOT_ARG)
  : SOFTWARE_PRODUCTS_BASE_ROOT;
const EXISTING_EXPORT_CSV_PATH = path.resolve(
  SOFTWARE_PRODUCTS_BASE_ROOT,
  "shopify-products-category-report.csv"
);
const EXPORTS_DIR = path.resolve(__dirname, "../../exports");
const LOGO_TEMP_ROOT = path.resolve(EXPORTS_DIR, "tmp-software-products-import-logos");
const IMPORT_SCOPE_SEGMENT =
  path.relative(SOFTWARE_PRODUCTS_BASE_ROOT, SOFTWARE_PRODUCTS_ROOT) ||
  path.basename(SOFTWARE_PRODUCTS_ROOT);
const IMPORT_SCOPE_SLUG = slugifyPathValue(IMPORT_SCOPE_SEGMENT) || "software-products";
const REPORT_PREFIX = `${IMPORT_SCOPE_SLUG}-import`;
const ATTENTION_REPORT_PREFIX = `${IMPORT_SCOPE_SLUG}-zero-pricing-or-missing-logo`;
const TARGET_CATEGORY_SLUG = "software";
const PRODUCT_GID = (productId: number) => `gid://shopify/Product/${productId}`;
const SHOPIFY_GRAPHQL_PAGE_SIZE = 100;
const ALLOW_ZERO_PRICE_FALLBACK = true;
const CATEGORY_MAPPING_ALIASES = new Map<string, string>([
  ["earthwork estimating software", "Construction Estimating Software"],
  ["hybrid events software", "Virtual Event Software"],
  ["nps software", "Customer Feedback Software"],
  ["nurse scheduling software", "Employee Scheduling Software"],
  ["nursing home software", "Long Term Care Software"],
  ["nutrition analysis software", "Medical Software"],
  ["nutritionist software", "Medical Software"],
  ["obgyn emr software", "Electronic Medical Records (EMR) Software"],
]);
const DIRECT_LOGO_SOURCE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".svg",
  ".webp",
  ".gif",
  ".bmp",
]);
const RASTER_LOGO_SOURCE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
]);
const DEFAULT_PRODUCT_CSV_HEADERS = [
  "Handle",
  "Title",
  "Body (HTML)",
  "Vendor",
  "Product Category",
  "Type",
  "product.metafields.custom.plans_pricing",
  "product.metafields.custom.product_features",
  "product.metafields.custom.pros_cons",
  "product.metafields.custom.custom",
  "product.metafields.custom.logo_image",
  "product.metafields.custom.target_use_case",
  "product.metafields.custom.pricing_billing",
  "product.metafields.custom.deployment_compatibility",
  "product.metafields.custom.features_functionality",
  "product.metafields.custom.security_backups",
  "product.metafields.custom.performance_specs",
  "product.metafields.custom.support",
  "product.metafields.custom.team_collaboration",
  "product.metafields.custom.developer_features",
  "Variant Price",
  "SEO Title",
  "SEO Description",
  "Status",
] as const;

type CsvRow = Record<string, string>;

type ExistingExportRow = {
  shopify_product_id: string;
  title: string;
  handle: string;
  vendor: string;
  collection_handles: string;
};

type FilterDefinition = {
  key: string;
  allowedValues: Set<string>;
};

type MarketplaceFilterReferenceMap = Record<
  string,
  {
    type: string;
    byLabel: Record<string, string>;
  }
>;

type CategoryMapping = {
  productCategory: string;
  collectionTitle: string;
  collectionHandle: string;
};

type ImportTarget = {
  folderName: string;
  folderPath: string;
  sourceCsvPath: string;
  logoDirs: string[];
  categoryMapping: CategoryMapping;
};

type SkippedFolder = {
  folderName: string;
  reason: string;
};

type PreparedProduct = {
  categoryFolder: string;
  sourceCsvPath: string;
  sourceTitle: string;
  title: string;
  vendor: string;
  handle: string;
  officialUrl: string;
  status: "active";
  published: true;
  productCategory: string;
  collectionTitle: string;
  collectionHandle: string;
  customTypeMultiple: string[];
  price: string;
  zeroPriceFallbackUsed: boolean;
  bodyHtml: string;
  seoTitle: string;
  seoDescription: string;
  imageAltText: string;
  productFeatures: string;
  plansPricing: string;
  prosCons: string;
  filterValues: Record<string, string[]>;
  sourceBodyText: string;
  pricingLines: string[];
  featureLines: string[];
  localLogoPath: string | null;
  rawRow: CsvRow;
};

type ImportStatus =
  | "imported"
  | "skipped_existing_shopify"
  | "skipped_existing_current_job"
  | "updated_existing_type_multiple"
  | "skipped_missing_required_data"
  | "skipped_pricing_unavailable"
  | "failed";

type LogoStatus =
  | "uploaded"
  | "missing"
  | "existing_not_checked";

type ImportLogRow = {
  categoryFolder: string;
  sourceCsvPath: string;
  sourceTitle: string;
  title: string;
  handle: string;
  vendor: string;
  status: ImportStatus;
  price: string;
  officialUrl: string;
  shopifyProductId: number | null;
  reason: string;
  logoSource: string | null;
  logoStatus: LogoStatus;
  reportNotes: string[];
};

type SummaryCounts = {
  totalRows: number;
  imported: number;
  skipped_existing_shopify: number;
  skipped_existing_current_job: number;
  updated_existing_type_multiple: number;
  skipped_missing_required_data: number;
  skipped_pricing_unavailable: number;
  failed: number;
};

type ExistingExportIndex = {
  rows: ExistingExportRow[];
  byHandle: Map<string, ExistingExportRow>;
  byCollectionHandle: Map<string, ExistingExportRow[]>;
};

type JobAction =
  | {
      kind: "create";
      product: PreparedProduct;
    }
  | {
      kind: "existing";
      categoryFolder: string;
      sourceCsvPath: string;
      sourceTitle: string;
      title: string;
      handle: string;
      vendor: string;
      price: string;
      officialUrl: string;
      collectionTitle: string;
      exportProductId: number | null;
      reason: string;
    };

type ExistingProductState = {
  productId: number;
  title: string;
  handle: string;
  customTypeMultiple: string[];
};

const localLogoCache = new Map<string, Array<{ filePath: string; stem: string }>>();

const normalizeRowKey = (value: string) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const getRowValue = (row: CsvRow, ...candidates: string[]) => {
  for (const candidate of candidates) {
    if (candidate in row) {
      return String(row[candidate] ?? "").trim();
    }
  }

  const normalizedCandidates = new Set(candidates.map(normalizeRowKey));
  for (const [key, value] of Object.entries(row)) {
    if (normalizedCandidates.has(normalizeRowKey(key))) {
      return String(value ?? "").trim();
    }
  }

  return "";
};

const getRowHandle = (row: CsvRow) => getRowValue(row, "Handle", "handle");
const getRowTitle = (row: CsvRow) => getRowValue(row, "Title", "title");
const getRowVendor = (row: CsvRow) => getRowValue(row, "Vendor", "vendor");
const getRowBodyHtml = (row: CsvRow) =>
  getRowValue(row, "Body (HTML)", "body_html");
const getRowVariantPrice = (row: CsvRow) =>
  getRowValue(row, "Variant Price", "variant_price");
const getRowSeoTitle = (row: CsvRow) =>
  getRowValue(row, "SEO Title", "seo_title");
const getRowSeoDescription = (row: CsvRow) =>
  getRowValue(row, "SEO Description", "seo_description");
const getRowStatus = (row: CsvRow) => getRowValue(row, "Status", "status");
const getRowOfficialUrl = (row: CsvRow) =>
  getRowValue(
    row,
    "product.metafields.custom.custom",
    "Product Metafields Custom Custom"
  );
const getRowLogoImage = (row: CsvRow) =>
  getRowValue(
    row,
    "product.metafields.custom.logo_image",
    "Product Metafields Custom Logo Image"
  );
const getRowTargetUseCase = (row: CsvRow) =>
  getRowValue(
    row,
    "product.metafields.custom.target_use_case",
    "Product Metafields Custom Target Use Case"
  );
const getRowPlansPricing = (row: CsvRow) =>
  getRowValue(
    row,
    "product.metafields.custom.plans_pricing",
    "Product Metafields Custom Plans Pricing"
  );
const getRowProductFeatures = (row: CsvRow) =>
  getRowValue(
    row,
    "product.metafields.custom.product_features",
    "Product Metafields Custom Product Features"
  );

const normalizeCsvRow = (row: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/^\uFEFF/, "").replace(/^"|"$/g, ""),
      typeof value === "string" ? value.trim() : String(value ?? ""),
    ])
  );

const isEmptyCsvRow = (row: CsvRow) =>
  Object.keys(row).length === 0 ||
  Object.values(row).every((value) => !String(value ?? "").trim());

const shouldUseDefaultProductHeaders = (filePath: string, fileText: string) => {
  const normalizedFilePath = path.normalize(filePath).toLowerCase();
  const softwareProductsSegment = path
    .normalize(path.join("exports", "software-products"))
    .toLowerCase();
  if (!normalizedFilePath.includes(softwareProductsSegment)) {
    return false;
  }

  const firstNonEmptyLine =
    fileText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? "";

  if (!firstNonEmptyLine) {
    return false;
  }

  const normalizedFirstLine = firstNonEmptyLine.toLowerCase();
  return !(
    normalizedFirstLine.startsWith("handle,") ||
    normalizedFirstLine.startsWith("\"handle\",") ||
    normalizedFirstLine.startsWith("title,") ||
    normalizedFirstLine.startsWith("\"title\",")
  );
};

const readCsv = async (filePath: string) =>
  new Promise<CsvRow[]>((resolve, reject) => {
    const rows: CsvRow[] = [];
    const rawFileText = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    const parserOptions = shouldUseDefaultProductHeaders(filePath, rawFileText)
      ? { headers: [...DEFAULT_PRODUCT_CSV_HEADERS] }
      : {};

    fs.createReadStream(filePath)
      .pipe(csv(parserOptions))
      .on("data", (row) => {
        const normalizedRow = normalizeCsvRow(row);
        if (isEmptyCsvRow(normalizedRow)) {
          return;
        }
        rows.push(normalizedRow);
      })
      .on("end", () => resolve(rows))
      .on("error", reject);
  });

const ensureDir = async (dirPath: string) => {
  await fs.promises.mkdir(dirPath, { recursive: true });
};

const dedupe = <T>(values: T[]) => Array.from(new Set(values));

const stripHtml = (value: string) =>
  value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

const normalizeText = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

const normalizeHandle = (value: string) => slugify(value);

const normalizeComparableTitle = (value: string) =>
  normalizeText(value)
    .replace(/\bb2b\b/g, " ")
    .replace(/\bedition\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeComparableVendor = (value: string) =>
  normalizeText(value)
    .replace(/\b(inc|incorporated|llc|ltd|limited|holdings|corp|corporation|co)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const countWords = (value: string) =>
  stripHtml(value)
    .split(/\s+/)
    .filter(Boolean).length;

const MULTILINE_SEPARATOR = "\r\n";

const parsePositivePrice = (value: string) => {
  const numeric = Number(String(value ?? "").replace(/[^0-9.]+/g, "").trim());
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return numeric;
};

const parseAnyNumericPrice = (value: string) => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return null;
  }

  const numeric = Number(trimmed.replace(/[^0-9.]+/g, ""));
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  return numeric;
};

const formatNumericPrice = (value: number) => {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(value).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
};

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableShopifyError = (error: any) => {
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
    message.includes("econnaborted") ||
    message.includes("throttled")
  );
};

const withShopifyRetries = async <T>(
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

      if (!isRetryableShopifyError(error) || attempt === maxAttempts) {
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

const formatShopifyError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const responseData = (error as any)?.response?.data;
  const details =
    typeof responseData === "string"
      ? responseData
      : responseData
      ? JSON.stringify(responseData)
      : "";

  return details && !message.includes(details)
    ? `${message} | ${details}`
    : message;
};

const isHandleAlreadyTakenError = (error: unknown) =>
  formatShopifyError(error).toLowerCase().includes("has already been taken");

const extractFirstUrlCandidate = (value: string) => {
  const source = String(value ?? "").trim();
  if (!source) {
    return "";
  }

  const markdownMatch = source.match(/\((https?:\/\/[^)\s]+)\)?/i);
  if (markdownMatch?.[1]) {
    return markdownMatch[1];
  }

  const httpMatch = source.match(/https?:\/\/[^\s)\]"']+/i);
  if (httpMatch?.[0]) {
    return httpMatch[0];
  }

  const wwwMatch = source.match(/www\.[^\s)\]"']+/i);
  if (wwwMatch?.[0]) {
    return wwwMatch[0];
  }

  return "";
};

const isLikelyPublicUrl = (value: string) => {
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

const cleanOfficialUrl = (value: string) => {
  const extractedCandidate = extractFirstUrlCandidate(value);
  let trimmed = (extractedCandidate || String(value ?? ""))
    .trim()
    .replace(/^[\["'\s]+/, "")
    .replace(/[\]"'\s]+$/, "");

  trimmed = trimmed
    .replace(/^\[[^\]]*\]\(/, "")
    .replace(/[)\]"'\s]+$/, "")
    .trim();

  if (!trimmed) {
    return "";
  }

  if (!/^(https?:\/\/|www\.)/i.test(trimmed)) {
    return "";
  }

  if (/^www\./i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }

  try {
    const url = new URL(trimmed);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return trimmed;
  }
};

const resolveOfficialUrl = (row: CsvRow, overrideOfficialUrl?: string | null) => {
  const prioritizedValues = [
    overrideOfficialUrl ?? "",
    getRowOfficialUrl(row),
    getRowLogoImage(row),
    getRowTargetUseCase(row),
    getRowBodyHtml(row),
    getRowSeoDescription(row),
    ...Object.values(row),
  ];

  for (const value of prioritizedValues) {
    const cleaned = cleanOfficialUrl(value);
    if (isLikelyPublicUrl(cleaned)) {
      return cleaned;
    }
  }

  return "";
};

const splitAllowedValues = (value: string) =>
  value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

const normalizeMultilineSourceText = (value: string) =>
  String(value ?? "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

const extractCleanLines = (value: string) =>
  normalizeMultilineSourceText(value)
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/^[-*.\u2022]+\s*/, "")
        .replace(/\s+/g, " ")
    )
    .filter(Boolean)
    .filter((line) => !/^pros:?$/i.test(line) && !/^cons:?$/i.test(line));

const toSentence = (value: string) => {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const joinAsSentence = (items: string[]) => {
  const normalized = items.map(toSentence).filter(Boolean);
  if (normalized.length === 0) {
    return "";
  }
  if (normalized.length === 1) {
    return normalized[0];
  }
  if (normalized.length === 2) {
    return `${normalized[0]} and ${normalized[1]}`;
  }
  return `${normalized.slice(0, -1).join(", ")}, and ${normalized[normalized.length - 1]}`;
};

const mimeTypeFromPath = (filePath: string) => {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".svg":
      return "image/svg+xml";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
};

const normalizeLogoExtension = (extension: string) =>
  extension.toLowerCase() === ".jpg" ? ".jpeg" : extension.toLowerCase();

const extensionFromContentType = (contentType: string) =>
  ({
    "image/png": ".png",
    "image/jpeg": ".jpeg",
    "image/svg+xml": ".svg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/bmp": ".bmp",
    "image/x-icon": ".ico",
    "image/vnd.microsoft.icon": ".ico",
  }[contentType] ?? "");

const absoluteUrl = (baseUrl: string, maybeRelativeUrl: string) => {
  try {
    return new URL(maybeRelativeUrl, baseUrl).toString();
  } catch {
    return maybeRelativeUrl;
  }
};

const buildSummaryCounts = (
  totalRows: number,
  logRows: ImportLogRow[]
): SummaryCounts => ({
  totalRows,
  imported: logRows.filter((row) => row.status === "imported").length,
  skipped_existing_shopify: logRows.filter(
    (row) => row.status === "skipped_existing_shopify"
  ).length,
  skipped_existing_current_job: logRows.filter(
    (row) => row.status === "skipped_existing_current_job"
  ).length,
  updated_existing_type_multiple: logRows.filter(
    (row) => row.status === "updated_existing_type_multiple"
  ).length,
  skipped_missing_required_data: logRows.filter(
    (row) => row.status === "skipped_missing_required_data"
  ).length,
  skipped_pricing_unavailable: logRows.filter(
    (row) => row.status === "skipped_pricing_unavailable"
  ).length,
  failed: logRows.filter((row) => row.status === "failed").length,
});

const csvEscape = (value: unknown) => {
  const stringValue =
    value === null || value === undefined ? "" : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
};

const writeJsonReport = async (
  sourceRowsCount: number,
  logRows: ImportLogRow[],
  mode: "dry-run" | "apply",
  skippedFolders: SkippedFolder[]
) => {
  await ensureDir(EXPORTS_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const summary = buildSummaryCounts(sourceRowsCount, logRows);
  const reportPath = path.join(
    EXPORTS_DIR,
    `${REPORT_PREFIX}-${mode}-${timestamp}.json`
  );
  await fs.promises.writeFile(
    reportPath,
    JSON.stringify(
      {
        mode,
        summary,
        skippedFolders,
        rows: logRows,
      },
      null,
      2
    ),
    "utf8"
  );

  return { reportPath, summary, timestamp };
};

const writeAttentionCsvReport = async (
  logRows: ImportLogRow[],
  timestamp: string
) => {
  const rows = logRows.filter(
    (row) =>
      row.shopifyProductId !== null &&
      (row.price === "0" || row.logoStatus === "missing")
  );

  const reportPath = path.join(
    EXPORTS_DIR,
    `${ATTENTION_REPORT_PREFIX}-${timestamp}.csv`
  );

  const header = [
    "Product Name",
    "Product ID",
    "Pricing",
    "logo status",
    "official URL",
  ];
  const lines = [
    header.map(csvEscape).join(","),
    ...rows.map((row) =>
      [
        row.title,
        row.shopifyProductId ?? "",
        row.price,
        row.logoStatus,
        row.officialUrl,
      ]
        .map(csvEscape)
        .join(",")
    ),
  ];

  await fs.promises.writeFile(reportPath, lines.join("\n"), "utf8");
  return reportPath;
};

const loadFilterDefinitions = async () => {
  const rows = await readCsv(FILTERS_CSV_PATH);
  const definitions = rows
    .filter(
      (row) =>
        row.category_slug === TARGET_CATEGORY_SLUG &&
        row.namespace === "marketplace"
    )
    .map<FilterDefinition>((row) => ({
      key: String(row.metafield_key ?? "").trim(),
      allowedValues: new Set(splitAllowedValues(String(row.allowed_values ?? ""))),
    }))
    .filter((definition) => definition.key);

  return new Map(definitions.map((definition) => [definition.key, definition]));
};

const loadSoftwareCategoryRows = async () => {
  const rows = await readCsv(CATEGORY_COLLECTIONS_PATH);
  return rows.filter((row) => row.top_slug === TARGET_CATEGORY_SLUG);
};

const resolveCategoryMapping = async (
  folderName: string,
  sourceCsvPath: string,
  softwareCategoryRows: CsvRow[]
): Promise<CategoryMapping> => {
  const sourceRows = await readCsv(sourceCsvPath);
  const csvStem = path.basename(sourceCsvPath, path.extname(sourceCsvPath)).replace(/_/g, " ");
  const sourceTypes = dedupe(
    sourceRows
      .map((row) => getRowValue(row, "Type", "type"))
      .filter(Boolean)
  );
  const aliasValues = dedupe(
    [folderName, csvStem, ...sourceTypes]
      .map((value) => CATEGORY_MAPPING_ALIASES.get(normalizeText(value)) ?? "")
      .filter(Boolean)
  );
  const candidateHandles = dedupe([
    normalizeHandle(folderName),
    normalizeHandle(csvStem),
    ...sourceTypes.map((value) => normalizeHandle(value)),
    ...aliasValues.map((value) => normalizeHandle(value)),
  ]);
  const candidateNames = dedupe([
    normalizeText(folderName),
    normalizeText(csvStem),
    ...sourceTypes.map((value) => normalizeText(value)),
    ...aliasValues.map((value) => normalizeText(value)),
  ]);

  const mappingRow =
    softwareCategoryRows.find((row) =>
      candidateHandles.includes(normalizeHandle(String(row.collection_handle ?? "")))
    ) ??
    softwareCategoryRows.find((row) =>
      candidateNames.includes(normalizeText(String(row.final_category ?? "")))
    ) ??
    softwareCategoryRows.find((row) =>
      candidateNames.includes(normalizeText(String(row.collection_title ?? "")))
    );

  if (!mappingRow) {
    throw new Error(
      `Could not resolve category mapping for folder "${folderName}" (${sourceCsvPath})`
    );
  }

  const categories = await readCsv(CATEGORIES_PATH);
  const categoryExists = categories.some(
    (row) =>
      normalizeText(row.mainCategory ?? row.Category ?? "") ===
        normalizeText("Software") &&
      normalizeText(row.subCategory ?? row.Subcategory ?? "") ===
        normalizeText(String(mappingRow.final_category ?? ""))
  );

  if (!categoryExists) {
    throw new Error(
      `Category mapping for ${mappingRow.final_category} is missing in ${CATEGORIES_PATH}`
    );
  }

  return {
    productCategory: String(mappingRow.top_category ?? "Software"),
    collectionTitle: String(mappingRow.final_category ?? ""),
    collectionHandle: String(mappingRow.collection_handle ?? ""),
  };
};

const discoverImportTargets = async () => {
  const rootStats = await fs.promises.stat(SOFTWARE_PRODUCTS_ROOT).catch(() => null);
  if (!rootStats?.isDirectory()) {
    throw new Error(`Import root does not exist or is not a directory: ${SOFTWARE_PRODUCTS_ROOT}`);
  }

  const softwareCategoryRows = await loadSoftwareCategoryRows();
  const dirents = await fs.promises.readdir(SOFTWARE_PRODUCTS_ROOT, {
    withFileTypes: true,
  });
  const targets: ImportTarget[] = [];
  const skippedFolders: SkippedFolder[] = [];

  for (const dirent of dirents
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const folderPath = path.join(SOFTWARE_PRODUCTS_ROOT, dirent.name);
    const fileNames = await fs.promises.readdir(folderPath);
    const csvFiles = fileNames
      .filter((fileName) => fileName.toLowerCase().endsWith(".csv"))
      .sort();

    if (csvFiles.length === 0) {
      skippedFolders.push({
        folderName: dirent.name,
        reason: "No valid CSV file found in folder.",
      });
      continue;
    }

    const preferredCsv =
      csvFiles.find(
        (fileName) =>
          normalizeText(path.basename(fileName, path.extname(fileName)).replace(/_/g, " ")) ===
          normalizeText(dirent.name)
      ) ?? csvFiles[0];

    const sourceCsvPath = path.join(folderPath, preferredCsv);
    let categoryMapping: CategoryMapping;
    try {
      categoryMapping = await resolveCategoryMapping(
        dirent.name,
        sourceCsvPath,
        softwareCategoryRows
      );
    } catch (error) {
      skippedFolders.push({
        folderName: dirent.name,
        reason: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    const logoDirs = ["fabicon", "logos"]
      .map((name) => path.join(folderPath, name))
      .filter((logoDir) => fs.existsSync(logoDir));

    targets.push({
      folderName: dirent.name,
      folderPath,
      sourceCsvPath,
      logoDirs,
      categoryMapping,
    });
  }

  return {
    targets,
    skippedFolders,
  };
};

const loadExistingExport = async (): Promise<ExistingExportIndex> => {
  const rows = (await readCsv(EXISTING_EXPORT_CSV_PATH)) as ExistingExportRow[];
  const byHandle = new Map<string, ExistingExportRow>();
  const byCollectionHandle = new Map<string, ExistingExportRow[]>();

  rows.forEach((row) => {
    const normalized = normalizeHandle(row.handle ?? "");
    if (normalized) {
      byHandle.set(normalized, row);
    }

    String(row.collection_handles ?? "")
      .split("|")
      .map((item) => normalizeHandle(item))
      .filter(Boolean)
      .forEach((handle) => {
        const current = byCollectionHandle.get(handle) ?? [];
        current.push(row);
        byCollectionHandle.set(handle, current);
      });
  });

  return {
    rows,
    byHandle,
    byCollectionHandle,
  };
};

const findExistingMatch = (
  row: CsvRow,
  existing: ExistingExportIndex,
  collectionHandle: string
) => {
  const sourceHandle = normalizeHandle(getRowHandle(row));
  if (sourceHandle) {
    const handleMatch = existing.byHandle.get(sourceHandle);
    if (handleMatch) {
      return handleMatch;
    }
  }

  const sourceVendor = normalizeText(getRowVendor(row));
  const comparableSourceVendor = normalizeComparableVendor(getRowVendor(row));
  const sourceTitle = normalizeComparableTitle(getRowTitle(row));
  const sourceUrl = resolveOfficialUrl(row);

  if (!sourceVendor || !sourceTitle || !sourceUrl) {
    return null;
  }

  const collectionRows = existing.byCollectionHandle.get(collectionHandle) ?? [];
  const titleMatches = collectionRows.filter(
    (candidate) =>
      normalizeComparableTitle(candidate.title ?? "") === sourceTitle
  );

  if (titleMatches.length === 1) {
    return titleMatches[0];
  }

  return (
    titleMatches.find((candidate) => {
      const candidateVendor = normalizeComparableVendor(candidate.vendor ?? "");
      return (
        candidateVendor === comparableSourceVendor ||
        candidateVendor === sourceVendor ||
        comparableSourceVendor.includes(candidateVendor) ||
        candidateVendor.includes(comparableSourceVendor)
      );
    }) ?? null
  );
};

const buildCurrentJobKeys = (row: CsvRow) => {
  const handleKey = normalizeHandle(getRowHandle(row)) || normalizeHandle(getRowTitle(row));
  const titleKey = normalizeComparableTitle(getRowTitle(row));
  const officialUrl = resolveOfficialUrl(row);
  const titleUrlKey =
    titleKey && officialUrl ? `${titleKey}::${cleanOfficialUrl(officialUrl)}` : "";

  return {
    handleKey,
    titleKey,
    titleUrlKey,
  };
};

const parseTypeMultipleValues = (value: string) => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return dedupe(
        parsed
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
      );
    }
  } catch {
    // ignore and fall back
  }

  return dedupe(
    normalizeMultilineSourceText(trimmed)
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean)
  );
};

const inferPricingModel = (
  pricingLines: string[],
  numericPrice: number | null
) => {
  const pricingText = normalizeText(pricingLines.join(" "));
  const values: string[] = [];

  if (/\bone time\b/.test(pricingText) || /\bone-time\b/.test(pricingText)) {
    values.push("One-time purchase");
  }

  if (
    /\bmonth\b/.test(pricingText) ||
    /\bmonthly\b/.test(pricingText) ||
    /\bannual\b/.test(pricingText) ||
    /\byear\b/.test(pricingText) ||
    /\bsubscription\b/.test(pricingText)
  ) {
    values.push("Subscription");
  }

  if (/\bfree plan\b/.test(pricingText) || /\bfreemium\b/.test(pricingText)) {
    values.push("Freemium");
  }

  if (/\bfree trial\b/.test(pricingText) && !values.includes("Freemium")) {
    values.push("Subscription");
  }

  if (
    numericPrice === 0 ||
    /\bnot publicly (available|disclosed)\b/.test(pricingText) ||
    /\bcustom quote\b/.test(pricingText)
  ) {
    values.push("Custom quote");
  }

  return dedupe(values);
};

const inferPriceBand = (numericPrice: number | null) => {
  if (numericPrice === null) {
    return [];
  }
  if (numericPrice === 0) {
    return [];
  }
  if (numericPrice < 10) {
    return ["Under $10/month"];
  }
  if (numericPrice <= 50) {
    return ["$10-$50/month"];
  }
  if (numericPrice <= 200) {
    return ["$51-$200/month"];
  }
  if (numericPrice <= 500) {
    return ["$201-$500/month"];
  }
  return ["Over $500/month"];
};

const inferDeploymentModel = (bodyText: string, featureLines: string[]) => {
  const text = normalizeText([bodyText, ...featureLines].join(" "));
  const values: string[] = [];
  if (/\bself hosted\b/.test(text) || /\bself-hosted\b/.test(text)) {
    values.push("Self-hosted");
  }
  if (/\bon premise\b/.test(text) || /\bon-premise\b/.test(text)) {
    values.push("On-premise");
  }
  if (/\bapi\b/.test(text) || /\bapi first\b/.test(text) || /\bapi-first\b/.test(text)) {
    values.push("API-first");
  }
  if (/\bcloud\b/.test(text) || /\bsaas\b/.test(text) || /\bhosted\b/.test(text)) {
    values.push("Cloud / SaaS");
  }
  return dedupe(values);
};

const inferCollaborationMode = (bodyText: string, featureLines: string[]) => {
  const text = normalizeText([bodyText, ...featureLines].join(" "));
  const values: string[] = [];
  if (/\brole based\b/.test(text) || /\brole-based\b/.test(text) || /\bpermissions\b/.test(text)) {
    values.push("Roles & permissions");
  }
  if (/\bteam\b/.test(text) || /\bshared\b/.test(text)) {
    values.push("Team sharing");
  }
  return dedupe(values);
};

const inferDeveloperFeatures = (bodyText: string, featureLines: string[]) => {
  const text = normalizeText([bodyText, ...featureLines].join(" "));
  const values: string[] = [];
  if (/\bapi\b/.test(text)) {
    values.push("API access");
  }
  if (/\bsdk\b/.test(text)) {
    values.push("SDKs");
  }
  if (/\bwebhook\b/.test(text)) {
    values.push("Webhooks");
  }
  if (/\boauth\b/.test(text) || /\bsso\b/.test(text)) {
    values.push("OAuth / SSO");
  }
  return dedupe(values);
};

const buildFilterValues = (
  price: number | null,
  bodyText: string,
  featureLines: string[],
  pricingLines: string[],
  definitions: Map<string, FilterDefinition>
) => {
  const candidateValues: Record<string, string[]> = {
    pricing_model: inferPricingModel(pricingLines, price),
    price_band: inferPriceBand(price),
    deployment_model: inferDeploymentModel(bodyText, featureLines),
    collaboration_mode: inferCollaborationMode(bodyText, featureLines),
    developer_features: inferDeveloperFeatures(bodyText, featureLines),
  };

  return Object.fromEntries(
    Object.entries(candidateValues)
      .map(([key, values]) => {
        const definition = definitions.get(key);
        if (!definition) {
          return [key, []] as const;
        }
        return [
          key,
          values.filter((value) => definition.allowedValues.has(value)),
        ] as const;
      })
      .filter(([, values]) => values.length > 0)
  );
};

const buildProductFeatures = (featureLines: string[]) =>
  featureLines.map((line) => `- ${toSentence(line)}`).join(MULTILINE_SEPARATOR);

const buildPlansPricingWithFallback = (
  pricingLines: string[],
  usedZeroPriceFallback: boolean
) => {
  const lines = [...pricingLines];
  if (usedZeroPriceFallback) {
    lines.push('To visit product official website click "Get Now".');
  }
  return lines
    .map((line) =>
      line === 'To visit product official website click "Get Now".'
        ? line
        : `- ${toSentence(line)}`
    )
    .join(MULTILINE_SEPARATOR);
};

const buildProsCons = (
  featureLines: string[],
  pricingLines: string[],
  numericPrice: number,
  usedZeroPriceFallback: boolean
) => {
  const pricingText = pricingLines.join(" ");
  const planPrices = dedupe(
    Array.from(pricingText.matchAll(/\$?\s*(\d[\d,]*(?:\.\d+)?)/g))
      .map((match) => match[1]?.replace(/,/g, "") ?? "")
      .filter(Boolean)
  );

  const pros = [
    ...(usedZeroPriceFallback
      ? ["Pro: The listing stays comparable even though public base pricing is not disclosed."]
      : [`Pro: Public starting price is listed at ${formatNumericPrice(numericPrice)}.`]),
    ...featureLines.slice(0, 2).map((line) => `Pro: ${toSentence(line)}.`),
  ];

  const cons: string[] = [];
  if (usedZeroPriceFallback) {
    cons.push("Con: Public pricing is not currently available on the referenced source.");
  } else if (planPrices.length > 1) {
    cons.push(
      `Con: Pricing varies by plan, with higher visible tiers up to ${planPrices[planPrices.length - 1]}.`
    );
  } else {
    cons.push(
      "Con: Feature availability should be checked against the specific plan before purchase."
    );
  }

  cons.push(
    "Con: Buyers should confirm integration scope, account structure, and rollout effort against their operational needs."
  );

  return [...pros, ...cons]
    .map((line) => `- ${line}`)
    .join(MULTILINE_SEPARATOR);
};

const buildBodyHtml = (
  title: string,
  vendor: string,
  collectionTitle: string,
  bodyText: string,
  featureLines: string[],
  pricingLines: string[],
  numericPrice: number,
  filterValues: Record<string, string[]>,
  usedZeroPriceFallback: boolean
) => {
  const primaryFeatures = featureLines.slice(0, 4);
  const featureSentence = joinAsSentence(primaryFeatures);
  const pricingSentence = joinAsSentence(
    [
      ...pricingLines.slice(0, 3),
      ...(usedZeroPriceFallback
        ? ["Pricing is not publicly available and the marketplace price is set to 0 for this listing"]
        : []),
    ].filter(Boolean)
  );
  const deploymentSentence =
    filterValues.deployment_model?.length > 0
      ? `${title} follows a ${filterValues.deployment_model
          .map((value) => value.toLowerCase())
          .join(" and ")} delivery model based on the available source material.`
      : "Deployment expectations should still be validated directly against the vendor's current product documentation.";
  const collaborationSentence =
    filterValues.collaboration_mode?.length > 0
      ? `The documented workflow also points to ${filterValues.collaboration_mode
          .map((value) => value.toLowerCase())
          .join(" and ")} where team operations matter.`
      : "Team buyers should still confirm how the product handles shared access, role controls, and operational oversight.";
  const developerSentence =
    filterValues.developer_features?.length > 0
      ? `Technical buyers can also note the presence of ${filterValues.developer_features
          .map((value) => value.toLowerCase())
          .join(" and ")} where implementation depth is relevant.`
      : "Implementation and extensibility requirements should be checked against the vendor's current setup and support model.";

  const paragraphs = [
    `<p>${title} is ${collectionTitle.toLowerCase()} from ${vendor} for teams that need software aligned with this category's operational workflow. It belongs in the ${collectionTitle} collection because the product description, feature set, and commercial positioning align with buyers comparing tools in this segment rather than general-purpose software. Shoppers in this category usually need focused workflow support, clearer operational controls, and fit for the specific process the software is designed to manage.</p>`,
    `<p>${bodyText}. The source material highlights capabilities such as ${featureSentence}. Those capabilities matter because buyers comparing products in this category often need a tool that improves consistency, reduces manual coordination, and provides more structure around recurring work. When the product clearly supports the target workflow, it becomes easier for teams to evaluate suitability against internal operating requirements and expected rollout complexity.</p>`,
    `<p>${title} is best assessed in terms of workflow fit, deployment expectations, pricing visibility, and day-to-day usability for the intended audience. ${deploymentSentence} ${collaborationSentence} ${developerSentence} In practical terms, the documented features indicate that the product can support category-specific tasks, buyer comparison needs, and implementation decisions without relying on unsupported assumptions about adjacent use cases.</p>`,
    `<p>The marketplace price for this listing is ${formatNumericPrice(numericPrice)}. ${pricingSentence}. This keeps the Shopify price field numeric and comparable while leaving the detailed plan context inside the pricing metafield for shoppers who need extra commercial clarity. Buyers should still review plan conditions, usage thresholds, contract terms, and any service limitations on the official site before making a final purchase decision.</p>`,
    `<p>From a marketplace perspective, ${title} stands out for documented relevance to ${collectionTitle.toLowerCase()} buyers, a visible feature set, and a neutral presentation that supports comparison shopping. At the same time, organizations should validate final fit against deployment preferences, integration needs, governance requirements, and the scale of the workflow they expect the software to handle. That keeps the listing clear, practical, and trustworthy for buyers evaluating software options in this category.</p>`,
  ];

  const html = paragraphs.join("");
  if (countWords(html) < 300) {
    throw new Error(`Generated description below 300 words for ${title}`);
  }
  return html;
};

const loadLocalLogoFiles = async (logoDirs: string[]) => {
  const cacheKey = logoDirs.join("|");
  const cached = localLogoCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const entries: Array<{ filePath: string; stem: string }> = [];
  for (const directory of logoDirs) {
    if (!fs.existsSync(directory)) {
      continue;
    }
    const fileNames = await fs.promises.readdir(directory);
    fileNames.forEach((fileName) => {
      const fullPath = path.join(directory, fileName);
      const extension = normalizeLogoExtension(path.extname(fileName));
      if (!DIRECT_LOGO_SOURCE_EXTENSIONS.has(extension)) {
        return;
      }
      const stem = normalizeHandle(path.basename(fileName, path.extname(fileName)));
      entries.push({ filePath: fullPath, stem });
    });
  }

  localLogoCache.set(cacheKey, entries);
  return entries;
};

const findBestLocalLogo = async (row: CsvRow, logoDirs: string[]) => {
  const files = await loadLocalLogoFiles(logoDirs);
  const officialUrl = cleanOfficialUrl(
    getRowOfficialUrl(row)
  );
  const hostToken = (() => {
    try {
      return normalizeHandle(new URL(officialUrl).hostname.replace(/^www\./, ""));
    } catch {
      return "";
    }
  })();

  const candidates = dedupe(
    [
      normalizeHandle(getRowHandle(row)),
      normalizeHandle(getRowTitle(row)),
      normalizeHandle(getRowVendor(row)),
      hostToken,
    ].filter(Boolean)
  );

  for (const candidate of candidates) {
    const exact = files.find((file) => file.stem === candidate);
    if (exact) {
      return exact.filePath;
    }
  }

  for (const candidate of candidates) {
    const partial = files.find(
      (file) => file.stem.includes(candidate) || candidate.includes(file.stem)
    );
    if (partial) {
      return partial.filePath;
    }
  }

  return null;
};

const resizeRasterLogoTo120 = async (inputPath: string, outputPath: string) => {
  const psScript = `
Add-Type -AssemblyName System.Drawing;
$inputPath = '${inputPath.replace(/'/g, "''")}';
$outputPath = '${outputPath.replace(/'/g, "''")}';
$image = [System.Drawing.Image]::FromFile($inputPath);
$newWidth = 120;
$newHeight = [int]([Math]::Round($image.Height * ($newWidth / [double]$image.Width)));
$bitmap = New-Object System.Drawing.Bitmap($newWidth, $newHeight);
$graphics = [System.Drawing.Graphics]::FromImage($bitmap);
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic;
$graphics.DrawImage($image, 0, 0, $newWidth, $newHeight);
$bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png);
$graphics.Dispose();
$bitmap.Dispose();
$image.Dispose();
`;

  await execFileAsync("powershell", ["-Command", psScript], {
    windowsHide: true,
  });
};

const convertRasterLogoToWebp120 = async (inputPath: string, outputPath: string) => {
  await execFileAsync(
    "magick",
    [
      inputPath,
      "-resize",
      "120x",
      "-quality",
      "90",
      outputPath,
    ],
    {
      windowsHide: true,
    }
  );
};

const prepareLocalLogoAsset = async (localPath: string) => {
  await ensureDir(LOGO_TEMP_ROOT);
  const extension = normalizeLogoExtension(path.extname(localPath));
  const baseName = path.basename(localPath, path.extname(localPath));

  if (extension === ".svg" || extension === ".webp") {
    return localPath;
  }

  if (RASTER_LOGO_SOURCE_EXTENSIONS.has(extension)) {
    const webpOutputPath = path.join(LOGO_TEMP_ROOT, `${baseName}-120.webp`);
    const pngOutputPath = path.join(LOGO_TEMP_ROOT, `${baseName}-120.png`);
    try {
      await convertRasterLogoToWebp120(localPath, webpOutputPath);
      return webpOutputPath;
    } catch {
      try {
        await resizeRasterLogoTo120(localPath, pngOutputPath);
        return pngOutputPath;
      } catch {
        return localPath;
      }
    }
  }

  return localPath;
};

const extractLogoCandidates = (baseUrl: string, html: string) => {
  const candidates: string[] = [];
  const patterns = [
    /<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*(?:logo|brand)/gi,
    /<link[^>]+rel=["'][^"']*(?:apple-touch-icon|icon)[^"']*["'][^>]+href=["']([^"']+)["']/gi,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
  ];

  patterns.forEach((pattern) => {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
      candidates.push(absoluteUrl(baseUrl, match[1]));
    }
  });

  candidates.push(absoluteUrl(baseUrl, "/favicon.png"));
  candidates.push(absoluteUrl(baseUrl, "/apple-touch-icon.png"));
  return dedupe(candidates);
};

const resolveRemoteLogoSourceUrl = async (officialUrl: string) => {
  const directExtension = normalizeLogoExtension(
    path.extname(new URL(officialUrl).pathname)
  );
  if (DIRECT_LOGO_SOURCE_EXTENSIONS.has(directExtension)) {
    return officialUrl;
  }

  const response = await axios.get(officialUrl, {
    timeout: 30000,
    responseType: "text",
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  const html = String(response.data ?? "");
  const candidates = extractLogoCandidates(officialUrl, html);

  for (const candidate of candidates) {
    try {
      const logoResponse = await axios.get<ArrayBuffer>(candidate, {
        timeout: 30000,
        responseType: "arraybuffer",
        maxRedirects: 5,
        headers: {
          "User-Agent": "Mozilla/5.0",
          Referer: officialUrl,
        },
      });

      if (Number(logoResponse.status) >= 200 && Number(logoResponse.status) < 400) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  throw new Error(`Could not resolve a remote logo source for ${officialUrl}`);
};

const downloadRemoteLogoAsset = async (
  officialUrl: string,
  fileStem: string
) => {
  await ensureDir(LOGO_TEMP_ROOT);
  const sourceUrl = await resolveRemoteLogoSourceUrl(officialUrl);
  const response = await axios.get<ArrayBuffer>(sourceUrl, {
    timeout: 30000,
    responseType: "arraybuffer",
    maxRedirects: 5,
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: officialUrl,
      Accept: "image/webp,image/png,image/jpeg,image/svg+xml,image/*,*/*;q=0.8",
    },
  });

  const contentType = String(response.headers["content-type"] ?? "").split(";")[0];
  const extensionFromUrl = normalizeLogoExtension(
    path.extname(new URL(sourceUrl).pathname)
  );
  const extension = extensionFromUrl || extensionFromContentType(contentType);

  if (!extension) {
    throw new Error(`Unsupported remote logo format for ${officialUrl}`);
  }

  const originalPath = path.join(LOGO_TEMP_ROOT, `${fileStem}${extension}`);
  await fs.promises.writeFile(originalPath, Buffer.from(response.data));
  return prepareLocalLogoAsset(originalPath);
};

const getShopifyClients = async () => {
  if (!shopifyClientsPromise) {
    shopifyClientsPromise = import("../services/shopifyHttp");
  }
  return shopifyClientsPromise;
};

const fetchPublicationIds = async () => {
  const { shopifyGraphQL } = await getShopifyClients();
  const publicationIds: string[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response: any = await withShopifyRetries("fetch Shopify publications", () =>
      shopifyGraphQL.post("", {
        query: `
          query FetchPublications($first: Int!, $after: String) {
            publications(first: $first, after: $after) {
              nodes {
                id
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
      throw new Error(JSON.stringify(response.data.errors));
    }

    const connection: any = response.data?.data?.publications;
    const nodes = Array.isArray(connection?.nodes) ? connection.nodes : [];
    nodes.forEach((node: any) => {
      if (node?.id) {
        publicationIds.push(String(node.id));
      }
    });

    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage);
    cursor = connection?.pageInfo?.endCursor ?? null;
  }

  return dedupe(publicationIds);
};

const publishProduct = async (productId: number) => {
  const { shopifyGraphQL } = await getShopifyClients();
  const publicationIds = await fetchPublicationIds();
  if (publicationIds.length === 0) {
    return;
  }

  const response = await withShopifyRetries(`publish product ${productId}`, () =>
    shopifyGraphQL.post("", {
      query: `
        mutation PublishProduct($id: ID!, $input: [PublicationInput!]!) {
          publishablePublish(id: $id, input: $input) {
            userErrors {
              field
              message
            }
          }
        }
      `,
      variables: {
        id: PRODUCT_GID(productId),
        input: publicationIds.map((publicationId) => ({
          publicationId,
        })),
      },
    })
  );

  const errors = response.data?.data?.publishablePublish?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`Publish failed: ${JSON.stringify(errors)}`);
  }
};

const buildMarketplaceFilterReferenceMap = async (
  filterKeys: string[]
): Promise<MarketplaceFilterReferenceMap> => {
  const { shopifyGraphQL } = await getShopifyClients();
  const definitionsResponse = await withShopifyRetries(
    "load marketplace metafield definitions",
    () =>
      shopifyGraphQL.post("", {
        query: `
          query MarketplaceMetafieldDefinitions {
            metafieldDefinitions(first: 50, ownerType: PRODUCT, namespace: "marketplace") {
              nodes {
                key
                type {
                  name
                }
                validations {
                  name
                  value
                }
              }
            }
          }
        `,
      })
  );

  const definitionNodes = Array.isArray(
    definitionsResponse.data?.data?.metafieldDefinitions?.nodes
  )
    ? definitionsResponse.data.data.metafieldDefinitions.nodes
    : [];

  const definitionByKey = new Map<string, any>();
  definitionNodes.forEach((node: any) => {
    if (filterKeys.includes(String(node?.key ?? ""))) {
      definitionByKey.set(String(node.key), node);
    }
  });

  const map: MarketplaceFilterReferenceMap = {};

  for (const key of filterKeys) {
    const definition = definitionByKey.get(key);
    if (!definition) {
      continue;
    }

    const metaobjectDefinitionId = (definition.validations ?? []).find(
      (validation: any) => validation?.name === "metaobject_definition_id"
    )?.value;

    if (!metaobjectDefinitionId) {
      continue;
    }

    const metaobjectDefinitionResponse = await shopifyGraphQL.post("", {
      query: `
        query MetaobjectDefinition($id: ID!) {
          metaobjectDefinition(id: $id) {
            type
          }
        }
      `,
      variables: {
        id: metaobjectDefinitionId,
      },
    });

    const metaobjectType =
      metaobjectDefinitionResponse.data?.data?.metaobjectDefinition?.type ?? null;
    if (!metaobjectType) {
      continue;
    }

    const metaobjectsResponse = await shopifyGraphQL.post("", {
      query: `
        query MetaobjectsByType($type: String!) {
          metaobjects(type: $type, first: 100) {
            nodes {
              id
              displayName
              fields {
                key
                value
              }
            }
          }
        }
      `,
      variables: {
        type: metaobjectType,
      },
    });

    const nodes = Array.isArray(metaobjectsResponse.data?.data?.metaobjects?.nodes)
      ? metaobjectsResponse.data.data.metaobjects.nodes
      : [];
    const byLabel: Record<string, string> = {};

    nodes.forEach((node: any) => {
      const labelField = Array.isArray(node?.fields)
        ? node.fields.find((field: any) => field?.key === "label")?.value
        : null;
      const label = String(labelField ?? node?.displayName ?? "").trim();
      const id = String(node?.id ?? "").trim();
      if (label && id) {
        byLabel[label] = id;
      }
    });

    map[key] = {
      type: String(definition.type?.name ?? "list.metaobject_reference"),
      byLabel,
    };
  }

  return map;
};

const fetchProductByHandle = async (handle: string) => {
  const { shopifyRest } = await getShopifyClients();
  const response = await withShopifyRetries(`fetch product by handle ${handle}`, () =>
    shopifyRest.get("/products.json", {
      params: {
        handle,
        limit: 1,
      },
    })
  );

  const products = Array.isArray(response.data?.products)
    ? response.data.products
    : [];
  return products[0] ?? null;
};

const fetchExistingProductStateById = async (
  productId: number
): Promise<ExistingProductState | null> => {
  const { shopifyGraphQL } = await getShopifyClients();
  const response = await withShopifyRetries(
    `fetch existing product state ${productId}`,
    () =>
      shopifyGraphQL.post("", {
        query: `
          query ExistingProductState($id: ID!) {
            product(id: $id) {
              id
              legacyResourceId
              title
              handle
              typeMultiple: metafield(namespace: "custom", key: "type_multiple") {
                value
              }
            }
          }
        `,
        variables: {
          id: PRODUCT_GID(productId),
        },
      })
  );

  const product = response.data?.data?.product;
  const legacyResourceId = Number(product?.legacyResourceId ?? 0);
  if (!legacyResourceId) {
    return null;
  }

  return {
    productId: legacyResourceId,
    title: String(product?.title ?? "").trim(),
    handle: String(product?.handle ?? "").trim(),
    customTypeMultiple: parseTypeMultipleValues(
      String(product?.typeMultiple?.value ?? "")
    ),
  };
};

const updateTypeMultipleMetafield = async (
  productId: number,
  values: string[]
) => {
  const { shopifyGraphQL } = await getShopifyClients();
  const response = await withShopifyRetries(
    `update type_multiple for ${productId}`,
    () =>
      shopifyGraphQL.post("", {
        query: `
          mutation UpdateTypeMultiple($metafields: [MetafieldsSetInput!]!) {
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
              ownerId: PRODUCT_GID(productId),
              namespace: "custom",
              key: "type_multiple",
              type: "list.single_line_text_field",
              value: JSON.stringify(dedupe(values.filter(Boolean))),
            },
          ],
        },
      })
  );

  const errors = response.data?.data?.metafieldsSet?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`Type multiple update failed: ${JSON.stringify(errors)}`);
  }
};

const resolveExistingProductAfterHandleConflict = async (
  product: PreparedProduct
) => {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const liveExisting = await fetchProductByHandle(product.handle);
    if (liveExisting?.id) {
      const existingState = await fetchExistingProductStateById(
        Number(liveExisting.id)
      );
      const mergedTypeMultiple = dedupe([
        ...(existingState?.customTypeMultiple ?? []),
        product.collectionTitle,
      ]);
      const changed =
        existingState !== null &&
        mergedTypeMultiple.length !== existingState.customTypeMultiple.length;

      if (changed) {
        await updateTypeMultipleMetafield(Number(liveExisting.id), mergedTypeMultiple);
      }

      return {
        productId: Number(liveExisting.id),
        title: String(existingState?.title ?? liveExisting.title ?? product.title).trim(),
        handle: String(existingState?.handle ?? liveExisting.handle ?? product.handle).trim(),
        changed,
      };
    }

    await sleep(attempt * 1500);
  }

  return null;
};

const createShopifyProduct = async (product: PreparedProduct) => {
  const { shopifyRest } = await getShopifyClients();
  const response = await withShopifyRetries(`create product ${product.handle}`, () =>
    shopifyRest.post("/products.json", {
      product: {
        title: product.title,
        handle: product.handle,
        body_html: product.bodyHtml,
        vendor: product.vendor,
        product_type: product.collectionTitle,
        status: product.status,
        published: product.published,
        metafields_global_title_tag: product.seoTitle,
        metafields_global_description_tag: product.seoDescription,
        variants: [
          {
            option1: "Default Title",
            price: product.price,
            taxable: false,
            requires_shipping: false,
            inventory_management: null,
            inventory_policy: "continue",
          },
        ],
      },
    })
  );

  const productId = Number(response.data?.product?.id ?? 0);
  if (!productId) {
    throw new Error(`Shopify product ID missing after create for ${product.title}`);
  }

  return productId;
};

const findExistingShopifyFileUrl = async (fileName: string) => {
  const { shopifyGraphQL } = await getShopifyClients();
  const response = await withShopifyRetries(`find Shopify file ${fileName}`, () =>
    shopifyGraphQL.post("", {
      query: `
        query FindExistingFile($first: Int!, $query: String!) {
          files(first: $first, query: $query) {
            nodes {
              __typename
              ... on MediaImage {
                image {
                  url
                }
              }
              ... on GenericFile {
                url
              }
            }
          }
        }
      `,
      variables: {
        first: 20,
        query: fileName,
      },
    })
  );

  const nodes = Array.isArray(response.data?.data?.files?.nodes)
    ? response.data.data.files.nodes
    : [];

  for (const node of nodes) {
    const candidateUrl =
      typeof node?.image?.url === "string"
        ? node.image.url
        : typeof node?.url === "string"
        ? node.url
        : "";
    if (!candidateUrl) {
      continue;
    }

    try {
      const candidateName = path.posix.basename(new URL(candidateUrl).pathname);
      if (candidateName === fileName) {
        return candidateUrl;
      }
    } catch {
      continue;
    }
  }

  return null;
};

const uploadFileToShopify = async (localPath: string, altText: string) => {
  const { shopifyGraphQL } = await getShopifyClients();
  const fileName = path.basename(localPath);
  const existingUrl = await findExistingShopifyFileUrl(fileName);
  if (existingUrl) {
    return existingUrl;
  }
  const mimeType = mimeTypeFromPath(localPath);
  const fileBytes = await fs.promises.readFile(localPath);
  const stagedUploadResponse = await withShopifyRetries(
    `create staged upload for ${fileName}`,
    () =>
      shopifyGraphQL.post("", {
        query: `
          mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
            stagedUploadsCreate(input: $input) {
              stagedTargets {
                url
                resourceUrl
                parameters {
                  name
                  value
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        variables: {
          input: [
            {
              filename: fileName,
              mimeType,
              httpMethod: "PUT",
              resource: "FILE",
            },
          ],
        },
      })
  );

  const stagedErrors =
    stagedUploadResponse.data?.data?.stagedUploadsCreate?.userErrors ?? [];
  if (stagedErrors.length > 0) {
    throw new Error(`Staged upload failed: ${JSON.stringify(stagedErrors)}`);
  }

  const target =
    stagedUploadResponse.data?.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target?.url || !target?.resourceUrl) {
    throw new Error("Shopify did not return a staged upload target");
  }

  const uploadHeaders: Record<string, string> = {
    "Content-Type": mimeType,
  };
  (target.parameters ?? []).forEach((parameter: any) => {
    if (parameter?.name && parameter?.value) {
      uploadHeaders[String(parameter.name)] = String(parameter.value);
    }
  });

  await axios.put(target.url, fileBytes, {
    headers: uploadHeaders,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  const fileCreateResponse = await withShopifyRetries(
    `create Shopify file ${fileName}`,
    () =>
      shopifyGraphQL.post("", {
        query: `
          mutation FileCreate($files: [FileCreateInput!]!) {
            fileCreate(files: $files) {
              files {
                id
                fileStatus
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        variables: {
          files: [
            {
              alt: altText,
              contentType: "IMAGE",
              originalSource: target.resourceUrl,
            },
          ],
        },
      })
  );

  const fileErrors = fileCreateResponse.data?.data?.fileCreate?.userErrors ?? [];
  if (fileErrors.length > 0) {
    throw new Error(`File create failed: ${JSON.stringify(fileErrors)}`);
  }

  const fileNode = fileCreateResponse.data?.data?.fileCreate?.files?.[0];
  const fileId = fileNode?.id ? String(fileNode.id) : null;
  if (!fileId) {
    throw new Error("Shopify file ID was not returned");
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const pollResponse = await withShopifyRetries(
      `poll Shopify file ${fileName}`,
      () =>
        shopifyGraphQL.post("", {
          query: `
            query CheckFileStatus($id: ID!) {
              node(id: $id) {
                ... on File {
                  fileStatus
                  preview {
                    status
                    image {
                      url
                    }
                  }
                }
                ... on MediaImage {
                  image {
                    url
                  }
                }
                ... on GenericFile {
                  url
                }
              }
            }
          `,
          variables: {
            id: fileId,
          },
        })
    );

    const node = pollResponse.data?.data?.node;
    const url =
      node?.image?.url ?? node?.preview?.image?.url ?? node?.url ?? null;
    const status =
      node?.fileStatus ?? node?.preview?.status ?? fileNode?.fileStatus ?? null;

    if (url && (status === "READY" || status === "UPLOADED" || !status)) {
      return String(url);
    }

    if (status === "FAILED") {
      throw new Error(`Shopify file processing failed for ${fileName}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  throw new Error("Shopify file URL was not returned");
};

const setShopifyMetafields = async (
  productId: number,
  product: PreparedProduct,
  logoFileUrl: string | null,
  marketplaceFilterReferences: MarketplaceFilterReferenceMap
) => {
  const { shopifyGraphQL } = await getShopifyClients();
  const inputs = [
    {
      namespace: "custom",
      key: "custom",
      type: "url",
      value: product.officialUrl,
    },
    ...(logoFileUrl
      ? [
          {
            namespace: "custom",
            key: "logo_image",
            type: "url",
            value: logoFileUrl,
          },
        ]
      : []),
    {
      namespace: "custom",
      key: "type_multiple",
      type: "list.single_line_text_field",
      value: JSON.stringify(product.customTypeMultiple),
    },
    {
      namespace: "custom",
      key: "product_features",
      type: "multi_line_text_field",
      value: product.productFeatures,
    },
    {
      namespace: "custom",
      key: "plans_pricing",
      type: "multi_line_text_field",
      value: product.plansPricing,
    },
    {
      namespace: "custom",
      key: "pros_cons",
      type: "multi_line_text_field",
      value: product.prosCons,
    },
    ...Object.entries(product.filterValues).map(([key, values]) => {
      const referenceDefinition = marketplaceFilterReferences[key];
      if (!referenceDefinition) {
        throw new Error(`Marketplace filter definition missing for ${key}`);
      }

      const ids = values.map((value) => {
        const metaobjectId = referenceDefinition.byLabel[value];
        if (!metaobjectId) {
          throw new Error(`No metaobject found for ${key}: ${value}`);
        }
        return metaobjectId;
      });

      return {
        namespace: "marketplace",
        key,
        type: referenceDefinition.type,
        value: JSON.stringify(ids),
      };
    }),
  ];

  const response = await withShopifyRetries(`set metafields for ${product.handle}`, () =>
    shopifyGraphQL.post("", {
      query: `
        mutation SetProductMetafields($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            userErrors {
              field
              message
            }
          }
        }
      `,
      variables: {
        metafields: inputs.map((input) => ({
          ownerId: PRODUCT_GID(productId),
          ...input,
        })),
      },
    })
  );

  const errors = response.data?.data?.metafieldsSet?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`Metafields failed: ${JSON.stringify(errors)}`);
  }
};

const shouldUseZeroPriceFallback = (
  rawNumericPrice: number | null,
  pricingLines: string[]
) => {
  if (!ALLOW_ZERO_PRICE_FALLBACK) {
    return false;
  }

  if (rawNumericPrice === 0) {
    return true;
  }

  const pricingText = normalizeText(pricingLines.join(" "));
  return (
    /\bnot publicly available\b/.test(pricingText) ||
    /\bnot publicly disclosed\b/.test(pricingText) ||
    /\bpricing not publicly disclosed\b/.test(pricingText) ||
    /\bpricing unavailable\b/.test(pricingText)
  );
};

const prepareProduct = async (
  row: CsvRow,
  target: ImportTarget,
  filterDefinitions: Map<string, FilterDefinition>
) => {
  const normalizedSourceHandle = normalizeHandle(getRowHandle(row));
  const override = getProductImportOverride(normalizedSourceHandle);
  const title = getRowTitle(row);
  const vendor = getRowVendor(row);
  const sourceBodyText = override?.bodyText
    ? override.bodyText
    : stripHtml(getRowBodyHtml(row));
  const officialUrl = resolveOfficialUrl(row, override?.officialUrl ?? null);
  const featureLines = override?.featureLines
    ? [...override.featureLines]
    : extractCleanLines(getRowProductFeatures(row));
  const pricingLines = override?.pricingLines
    ? [...override.pricingLines]
    : extractCleanLines(getRowPlansPricing(row));
  const explicitPrice =
    typeof override?.price === "number"
      ? override.price
      : parsePositivePrice(getRowVariantPrice(row));
  const rawNumericPrice = parseAnyNumericPrice(getRowVariantPrice(row));
  const zeroPriceFallbackUsed =
    explicitPrice === null && shouldUseZeroPriceFallback(rawNumericPrice, pricingLines);
  const priceValue = explicitPrice ?? (zeroPriceFallbackUsed ? 0 : null);
  const handle = normalizeHandle(getRowHandle(row)) || normalizeHandle(title);
  const localLogoPath = await findBestLocalLogo(row, target.logoDirs);

  const missingFields = [
    !title || /^title$/i.test(title) || title.length > 255 ? "Title" : "",
    !vendor || /^vendor$/i.test(vendor) || vendor.length > 255 ? "Vendor" : "",
    !handle || /^handle$/i.test(handle) ? "Handle" : "",
    !officialUrl ? "product.metafields.custom.custom" : "",
    featureLines.length === 0 ? "product.metafields.custom.product_features" : "",
    pricingLines.length === 0 ? "product.metafields.custom.plans_pricing" : "",
  ].filter(Boolean);

  if (missingFields.length > 0) {
    return {
      prepared: null,
      skipStatus: "skipped_missing_required_data" as const,
      reason: `Missing required data: ${missingFields.join(", ")}`,
    };
  }

  if (priceValue === null) {
    return {
      prepared: null,
      skipStatus: "skipped_pricing_unavailable" as const,
      reason:
        "Pricing was blank or non-numeric, and no safe zero-pricing fallback was justified from the source data.",
    };
  }

  const filterValues = buildFilterValues(
    priceValue,
    sourceBodyText,
    featureLines,
    pricingLines,
    filterDefinitions
  );
  const productFeatures = buildProductFeatures(featureLines);
  const plansPricing = buildPlansPricingWithFallback(
    pricingLines,
    zeroPriceFallbackUsed
  );
  const prosCons = buildProsCons(
    featureLines,
    pricingLines,
    priceValue,
    zeroPriceFallbackUsed
  );
  const bodyHtml = buildBodyHtml(
    title,
    vendor,
    target.categoryMapping.collectionTitle,
    sourceBodyText,
    featureLines,
    pricingLines,
    priceValue,
    filterValues,
    zeroPriceFallbackUsed
  );
  const seoTitle =
    override?.seoTitle ??
    getRowSeoTitle(row) ??
    `${title} | ${vendor} ${target.categoryMapping.collectionTitle}`;
  const seoDescription =
    override?.seoDescription ??
    getRowSeoDescription(row) ??
    `${title} for ${target.categoryMapping.collectionTitle.toLowerCase()} buyers with pricing, features, and workflow support.`;
  const imageAltText = `${title} ${target.categoryMapping.collectionTitle.toLowerCase()} logo`;

  return {
    prepared: {
      categoryFolder: target.folderName,
      sourceCsvPath: target.sourceCsvPath,
      sourceTitle: title,
      title,
      vendor,
      handle,
      officialUrl,
      status: "active" as const,
      published: true as const,
      productCategory: target.categoryMapping.productCategory,
      collectionTitle: target.categoryMapping.collectionTitle,
      collectionHandle: target.categoryMapping.collectionHandle,
      customTypeMultiple: [target.categoryMapping.collectionTitle],
      price: formatNumericPrice(priceValue),
      zeroPriceFallbackUsed,
      bodyHtml,
      seoTitle,
      seoDescription,
      imageAltText,
      productFeatures,
      plansPricing,
      prosCons,
      filterValues,
      sourceBodyText,
      pricingLines,
      featureLines,
      localLogoPath,
      rawRow: row,
    } satisfies PreparedProduct,
    skipStatus: null,
    reason: "",
  };
};

const buildDryRunRows = async () => {
  const [{ targets, skippedFolders }, filterDefinitions, existing] = await Promise.all([
    discoverImportTargets(),
    loadFilterDefinitions(),
    loadExistingExport(),
  ]);

  const jobActions: JobAction[] = [];
  const logRows: ImportLogRow[] = [];
  const handledHandleKeys = new Set<string>();
  const handledTitleUrlKeys = new Set<string>();
  const handledTitleKeys = new Set<string>();
  let totalRows = 0;

  for (const target of targets) {
    const sourceRows = await readCsv(target.sourceCsvPath);
    totalRows += sourceRows.length;

    for (const row of sourceRows) {
      const currentJobKeys = buildCurrentJobKeys(row);
      const alreadyHandledInCurrentJob =
        (currentJobKeys.handleKey && handledHandleKeys.has(currentJobKeys.handleKey)) ||
        (currentJobKeys.titleUrlKey &&
          handledTitleUrlKeys.has(currentJobKeys.titleUrlKey)) ||
        (!currentJobKeys.titleUrlKey &&
          currentJobKeys.titleKey &&
          handledTitleKeys.has(currentJobKeys.titleKey));

      if (alreadyHandledInCurrentJob) {
        logRows.push({
          categoryFolder: target.folderName,
          sourceCsvPath: target.sourceCsvPath,
          sourceTitle: getRowTitle(row),
          title: getRowTitle(row),
          handle: normalizeHandle(getRowHandle(row)),
          vendor: getRowVendor(row),
          status: "skipped_existing_current_job",
          price:
            parseAnyNumericPrice(getRowVariantPrice(row)) === 0
              ? "0"
              : getRowVariantPrice(row),
          officialUrl: resolveOfficialUrl(row),
          shopifyProductId: null,
          reason: "Duplicate row detected within the current import job.",
          logoSource: null,
          logoStatus: "existing_not_checked",
          reportNotes: [],
        });
        continue;
      }

      if (currentJobKeys.handleKey) {
        handledHandleKeys.add(currentJobKeys.handleKey);
      }
      if (currentJobKeys.titleUrlKey) {
        handledTitleUrlKeys.add(currentJobKeys.titleUrlKey);
      } else if (currentJobKeys.titleKey) {
        handledTitleKeys.add(currentJobKeys.titleKey);
      }

      const existingMatch = findExistingMatch(
        row,
        existing,
        target.categoryMapping.collectionHandle
      );
      if (existingMatch) {
        jobActions.push({
          kind: "existing",
          categoryFolder: target.folderName,
          sourceCsvPath: target.sourceCsvPath,
          sourceTitle: getRowTitle(row),
          title: getRowTitle(row),
          handle: normalizeHandle(getRowHandle(row)),
          vendor: getRowVendor(row),
          price:
            parseAnyNumericPrice(getRowVariantPrice(row)) === 0
              ? "0"
              : getRowVariantPrice(row),
          officialUrl: resolveOfficialUrl(row),
          collectionTitle: target.categoryMapping.collectionTitle,
          exportProductId: Number(existingMatch.shopify_product_id ?? 0) || null,
          reason: `Matched existing Shopify export row ${existingMatch.handle}`,
        });
        continue;
      }

      const preparedResult = await prepareProduct(row, target, filterDefinitions);
      if (!preparedResult.prepared || preparedResult.skipStatus) {
        logRows.push({
          categoryFolder: target.folderName,
          sourceCsvPath: target.sourceCsvPath,
          sourceTitle: getRowTitle(row),
          title: getRowTitle(row),
          handle: normalizeHandle(getRowHandle(row)),
          vendor: getRowVendor(row),
          status: preparedResult.skipStatus ?? "failed",
          price:
            parseAnyNumericPrice(getRowVariantPrice(row)) === 0
              ? "0"
              : getRowVariantPrice(row),
          officialUrl: resolveOfficialUrl(row),
          shopifyProductId: null,
          reason: preparedResult.reason || "Unable to prepare row",
          logoSource: null,
          logoStatus: "missing",
          reportNotes: [],
        });
        continue;
      }

      jobActions.push({
        kind: "create",
        product: preparedResult.prepared,
      });
    }
  }

  return {
    totalRows,
    jobActions,
    logRows,
    skippedFolders,
  };
};

const applyImport = async (
  jobActions: JobAction[],
  initialLogRows: ImportLogRow[],
  totalRows: number,
  skippedFolders: SkippedFolder[]
) => {
  const filterKeys = dedupe(
    jobActions.flatMap((action) =>
      action.kind === "create" ? Object.keys(action.product.filterValues ?? {}) : []
    )
  );
  const marketplaceFilterReferences =
    filterKeys.length > 0
      ? await buildMarketplaceFilterReferenceMap(filterKeys)
      : {};
  const logRows = [...initialLogRows];

  for (const action of jobActions) {
    const currentCreateProduct = action.kind === "create" ? action.product : null;
    try {
      if (action.kind === "existing") {
        if (!action.exportProductId) {
          logRows.push({
            categoryFolder: action.categoryFolder,
            sourceCsvPath: action.sourceCsvPath,
            sourceTitle: action.sourceTitle,
            title: action.title,
            handle: action.handle,
            vendor: action.vendor,
            status: "skipped_existing_shopify",
            price: action.price,
            officialUrl: action.officialUrl,
            shopifyProductId: null,
            reason: action.reason,
            logoSource: null,
            logoStatus: "existing_not_checked",
            reportNotes: [],
          });
          continue;
        }

        const existingState = await fetchExistingProductStateById(action.exportProductId);
        if (!existingState?.productId) {
          logRows.push({
            categoryFolder: action.categoryFolder,
            sourceCsvPath: action.sourceCsvPath,
            sourceTitle: action.sourceTitle,
            title: action.title,
            handle: action.handle,
            vendor: action.vendor,
            status: "skipped_existing_shopify",
            price: action.price,
            officialUrl: action.officialUrl,
            shopifyProductId: action.exportProductId,
            reason: `${action.reason}. Existing product was not available for update.`,
            logoSource: null,
            logoStatus: "existing_not_checked",
            reportNotes: [],
          });
          continue;
        }

        const mergedTypeMultiple = dedupe([
          ...existingState.customTypeMultiple,
          action.collectionTitle,
        ]);
        const changed =
          mergedTypeMultiple.length !== existingState.customTypeMultiple.length;

        if (changed) {
          await updateTypeMultipleMetafield(existingState.productId, mergedTypeMultiple);
        }

        logRows.push({
          categoryFolder: action.categoryFolder,
          sourceCsvPath: action.sourceCsvPath,
          sourceTitle: action.sourceTitle,
          title: existingState.title || action.title,
          handle: existingState.handle || action.handle,
          vendor: action.vendor,
          status: changed
            ? "updated_existing_type_multiple"
            : "skipped_existing_shopify",
          price: action.price,
          officialUrl: action.officialUrl,
          shopifyProductId: existingState.productId,
          reason: changed
            ? `Added ${action.collectionTitle} to custom.type_multiple.`
            : action.reason,
          logoSource: null,
          logoStatus: "existing_not_checked",
          reportNotes: [],
        });
        continue;
      }

      const product = action.product;
      const liveExisting = await fetchProductByHandle(product.handle);
      if (liveExisting?.id) {
        const existingState = await fetchExistingProductStateById(Number(liveExisting.id));
        const mergedTypeMultiple = dedupe([
          ...(existingState?.customTypeMultiple ?? []),
          product.collectionTitle,
        ]);
        const changed =
          existingState !== null &&
          mergedTypeMultiple.length !== existingState.customTypeMultiple.length;

        if (changed) {
          await updateTypeMultipleMetafield(Number(liveExisting.id), mergedTypeMultiple);
        }

        logRows.push({
          categoryFolder: product.categoryFolder,
          sourceCsvPath: product.sourceCsvPath,
          sourceTitle: product.sourceTitle,
          title: product.title,
          handle: product.handle,
          vendor: product.vendor,
          status: changed
            ? "updated_existing_type_multiple"
            : "skipped_existing_shopify",
          price: product.price,
          officialUrl: product.officialUrl,
          shopifyProductId: Number(liveExisting.id),
          reason: changed
            ? `Added ${product.collectionTitle} to custom.type_multiple.`
            : `Handle already exists in Shopify as ${product.handle}`,
          logoSource: null,
          logoStatus: "existing_not_checked",
          reportNotes: [],
        });
        continue;
      }

      const productId = await createShopifyProduct(product);
      let logoFileUrl: string | null = null;
      let logoSource: string | null = product.localLogoPath;
      let logoStatus: LogoStatus = "missing";
      const reportNotes: string[] = [
        `Collection mapping: ${product.collectionTitle}`,
          `Filters: ${Object.keys(product.filterValues).join(", ") || "none"}`,
      ];

      try {
        const preparedLogoPath =
          product.localLogoPath !== null
            ? await prepareLocalLogoAsset(product.localLogoPath)
            : await downloadRemoteLogoAsset(product.officialUrl, product.handle);
        logoSource = preparedLogoPath;
        logoFileUrl = await uploadFileToShopify(
          preparedLogoPath,
          product.imageAltText
        );
        logoStatus = "uploaded";
      } catch (logoError) {
        reportNotes.push(
          `Logo unavailable: ${
            logoError instanceof Error ? logoError.message : String(logoError)
          }`
        );
      }
      await setShopifyMetafields(
        productId,
        product,
        logoFileUrl,
        marketplaceFilterReferences
      );
      await publishProduct(productId);

      logRows.push({
        categoryFolder: product.categoryFolder,
        sourceCsvPath: product.sourceCsvPath,
        sourceTitle: product.sourceTitle,
        title: product.title,
        handle: product.handle,
        vendor: product.vendor,
        status: "imported",
        price: product.price,
        officialUrl: product.officialUrl,
        shopifyProductId: productId,
        reason: "Imported into Shopify successfully.",
        logoSource,
        logoStatus,
        reportNotes,
      });
    } catch (error) {
      if (!currentCreateProduct) {
        throw error;
      }

      if (isHandleAlreadyTakenError(error)) {
        const resolvedExisting = await resolveExistingProductAfterHandleConflict(
          currentCreateProduct
        );

        if (resolvedExisting) {
          logRows.push({
            categoryFolder: currentCreateProduct.categoryFolder,
            sourceCsvPath: currentCreateProduct.sourceCsvPath,
            sourceTitle: currentCreateProduct.sourceTitle,
            title: resolvedExisting.title,
            handle: resolvedExisting.handle,
            vendor: currentCreateProduct.vendor,
            status: resolvedExisting.changed
              ? "updated_existing_type_multiple"
              : "skipped_existing_shopify",
            price: currentCreateProduct.price,
            officialUrl: currentCreateProduct.officialUrl,
            shopifyProductId: resolvedExisting.productId,
            reason: resolvedExisting.changed
              ? `Added ${currentCreateProduct.collectionTitle} to custom.type_multiple after Shopify reported an existing handle.`
              : `Handle already exists in Shopify as ${resolvedExisting.handle}.`,
            logoSource: null,
            logoStatus: "existing_not_checked",
            reportNotes: [],
          });
          continue;
        }
      }

      logRows.push({
        categoryFolder: currentCreateProduct.categoryFolder,
        sourceCsvPath: currentCreateProduct.sourceCsvPath,
        sourceTitle: currentCreateProduct.sourceTitle,
        title: currentCreateProduct.title,
        handle: currentCreateProduct.handle,
        vendor: currentCreateProduct.vendor,
        status: "failed",
        price: currentCreateProduct.price,
        officialUrl: currentCreateProduct.officialUrl,
        shopifyProductId: null,
        reason: formatShopifyError(error),
        logoSource: currentCreateProduct.localLogoPath,
        logoStatus: "missing",
        reportNotes: [],
      });
    }
  }

  const jsonReport = await writeJsonReport(totalRows, logRows, "apply", skippedFolders);
  const attentionCsvPath = await writeAttentionCsvReport(
    logRows,
    jsonReport.timestamp
  );

  return {
    ...jsonReport,
    attentionCsvPath,
  };
};

const main = async () => {
  const shouldApply = process.argv.includes("--apply");
  const { totalRows, jobActions, logRows, skippedFolders } = await buildDryRunRows();

  if (!shouldApply) {
    const report = await writeJsonReport(totalRows, logRows, "dry-run", skippedFolders);
    console.log(`Import root: ${SOFTWARE_PRODUCTS_ROOT}`);
    console.log(`Existing export: ${EXISTING_EXPORT_CSV_PATH}`);
    console.log(`Report: ${report.reportPath}`);
    console.log(`Total rows: ${report.summary.totalRows}`);
    console.log(`Imported: ${report.summary.imported}`);
    console.log(
      `Skipped existing in Shopify: ${report.summary.skipped_existing_shopify}`
    );
    console.log(
      `Skipped existing in current job: ${report.summary.skipped_existing_current_job}`
    );
    console.log(
      `Updated existing type_multiple: ${report.summary.updated_existing_type_multiple}`
    );
    console.log(
      `Skipped missing required data: ${report.summary.skipped_missing_required_data}`
    );
    console.log(
      `Skipped pricing unavailable: ${report.summary.skipped_pricing_unavailable}`
    );
    console.log(`Failed: ${report.summary.failed}`);
    console.log(
      `Action rows ready on apply: ${jobActions.length}`
    );
    console.log(`Folders skipped: ${skippedFolders.length}`);
    return;
  }

  const report = await applyImport(jobActions, logRows, totalRows, skippedFolders);
  console.log(`Import root: ${SOFTWARE_PRODUCTS_ROOT}`);
  console.log(`Existing export: ${EXISTING_EXPORT_CSV_PATH}`);
  console.log(`Report: ${report.reportPath}`);
  console.log(`Attention CSV: ${report.attentionCsvPath}`);
  console.log(`Total rows: ${report.summary.totalRows}`);
  console.log(`Imported: ${report.summary.imported}`);
  console.log(
    `Skipped existing in Shopify: ${report.summary.skipped_existing_shopify}`
  );
  console.log(
    `Skipped existing in current job: ${report.summary.skipped_existing_current_job}`
  );
  console.log(
    `Updated existing type_multiple: ${report.summary.updated_existing_type_multiple}`
  );
  console.log(
    `Skipped missing required data: ${report.summary.skipped_missing_required_data}`
  );
  console.log(
    `Skipped pricing unavailable: ${report.summary.skipped_pricing_unavailable}`
  );
  console.log(`Failed: ${report.summary.failed}`);
  console.log(`Folders skipped: ${skippedFolders.length}`);
};

main().catch((error) => {
  console.error("Software products folder import failed:", error);
  process.exitCode = 1;
});
