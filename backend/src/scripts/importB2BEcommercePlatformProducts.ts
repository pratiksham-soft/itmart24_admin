import "../config/env";
import * as fs from "fs";
import * as path from "path";
import csv = require("csv-parser");
import axios from "axios";
import { execFile } from "child_process";
import { promisify } from "util";
import { CS_CART_B2B_HANDLE, CS_CART_B2B_OVERRIDE } from "./lib/csCartB2BOverride";

const execFileAsync = promisify(execFile);

let shopifyClientsPromise:
  | Promise<typeof import("../services/shopifyHttp")>
  | null = null;

const SOURCE_CSV_PATH = path.resolve(
  __dirname,
  "../../exports/software-products/B2B eCommerce Platform.csv"
);
const EXISTING_EXPORT_CSV_PATH = path.resolve(
  __dirname,
  "../../exports/software-products/shopify-products-category-report-2026-04-18T18-33-21-029Z.csv"
);
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
const EXPORTS_DIR = path.resolve(__dirname, "../../exports");
const LOCAL_LOGO_DIRS = [
  path.resolve(__dirname, "../../exports/software-products/fabicon"),
  path.resolve(__dirname, "../../exports/software-products/logos"),
];
const LOGO_TEMP_DIR = path.resolve(
  EXPORTS_DIR,
  "tmp-b2b-ecommerce-platform-logos"
);
const REPORT_PREFIX = "b2b-ecommerce-platform-import";
const TARGET_CATEGORY_SLUG = "software";
const TARGET_COLLECTION_HANDLE = "b2b-ecommerce-platform";
const PRODUCT_GID = (productId: number) => `gid://shopify/Product/${productId}`;
const SHOPIFY_GRAPHQL_PAGE_SIZE = 100;
const DIRECT_LOGO_SOURCE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".svg",
  ".webp",
  ".gif",
  ".bmp",
  ".ico",
]);
const RASTER_LOGO_SOURCE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".ico",
]);

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

type PreparedProduct = {
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
  | "skipped_existing"
  | "skipped_missing_required_data"
  | "skipped_pricing_unavailable"
  | "failed";

type ImportLogRow = {
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
  reportNotes: string[];
};

type SummaryCounts = {
  totalRows: number;
  imported: number;
  skipped_existing: number;
  skipped_missing_required_data: number;
  skipped_pricing_unavailable: number;
  failed: number;
};

const readCsv = async (filePath: string) =>
  new Promise<CsvRow[]>((resolve, reject) => {
    const rows: CsvRow[] = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        const normalizedRow = Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key.replace(/^\uFEFF/, "").replace(/^"|"$/g, ""),
            typeof value === "string" ? value.trim() : String(value ?? ""),
          ])
        );
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

const countWords = (value: string) =>
  stripHtml(value)
    .split(/\s+/)
    .filter(Boolean).length;

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

const cleanOfficialUrl = (value: string) => {
  const trimmed = String(value ?? "")
    .trim()
    .replace(/^[\["'\s]+/, "")
    .replace(/[\]"'\s]+$/, "");

  if (!trimmed) {
    return "";
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

const splitAllowedValues = (value: string) =>
  value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

const extractCleanLines = (value: string) =>
  String(value ?? "")
    .replace(/\r/g, "\n")
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
  skipped_existing: logRows.filter((row) => row.status === "skipped_existing")
    .length,
  skipped_missing_required_data: logRows.filter(
    (row) => row.status === "skipped_missing_required_data"
  ).length,
  skipped_pricing_unavailable: logRows.filter(
    (row) => row.status === "skipped_pricing_unavailable"
  ).length,
  failed: logRows.filter((row) => row.status === "failed").length,
});

const writeReport = async (
  sourceRowsCount: number,
  logRows: ImportLogRow[],
  mode: "dry-run" | "apply"
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
        rows: logRows,
      },
      null,
      2
    ),
    "utf8"
  );

  return { reportPath, summary };
};

const loadCategoryMapping = async (): Promise<CategoryMapping> => {
  const categoryRows = await readCsv(CATEGORY_COLLECTIONS_PATH);
  const mappingRow = categoryRows.find(
    (row) =>
      row.top_slug === TARGET_CATEGORY_SLUG &&
      row.collection_handle === TARGET_COLLECTION_HANDLE
  );

  if (!mappingRow) {
    throw new Error(
      `Could not find ${TARGET_COLLECTION_HANDLE} in ${CATEGORY_COLLECTIONS_PATH}`
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
    collectionTitle: String(mappingRow.final_category ?? "B2B eCommerce Platform"),
    collectionHandle: String(mappingRow.collection_handle ?? TARGET_COLLECTION_HANDLE),
  };
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

const loadExistingExport = async () => {
  const rows = (await readCsv(EXISTING_EXPORT_CSV_PATH)) as ExistingExportRow[];
  const byHandle = new Map<string, ExistingExportRow>();
  const targetCollectionRows = rows.filter((row) =>
    String(row.collection_handles ?? "")
      .split("|")
      .map((item) => normalizeHandle(item))
      .includes(TARGET_COLLECTION_HANDLE)
  );

  rows.forEach((row) => {
    const normalized = normalizeHandle(row.handle ?? "");
    if (normalized) {
      byHandle.set(normalized, row);
    }
  });

  return {
    rows,
    byHandle,
    targetCollectionRows,
  };
};

const findExistingMatch = (
  row: CsvRow,
  existing: Awaited<ReturnType<typeof loadExistingExport>>
) => {
  const sourceHandle = normalizeHandle(String(row.Handle ?? ""));
  if (sourceHandle) {
    const handleMatch = existing.byHandle.get(sourceHandle);
    if (handleMatch) {
      return handleMatch;
    }
  }

  const sourceVendor = normalizeText(String(row.Vendor ?? ""));
  const sourceTitle = normalizeComparableTitle(String(row.Title ?? ""));
  const sourceUrl = cleanOfficialUrl(
    String(row["product.metafields.custom.custom"] ?? "")
  );

  if (!sourceVendor || !sourceTitle || !sourceUrl) {
    return null;
  }

  return (
    existing.targetCollectionRows.find((candidate) => {
      if (normalizeText(candidate.vendor ?? "") !== sourceVendor) {
        return false;
      }

      return normalizeComparableTitle(candidate.title ?? "") === sourceTitle;
    }) ?? null
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
    /\buser month\b/.test(pricingText)
  ) {
    values.push("Subscription");
  }

  if (/\bfree plan\b/.test(pricingText) || /\bfree trial\b/.test(pricingText)) {
    values.push("Freemium");
  }

  if (numericPrice === null && /not publicly disclosed/.test(pricingText)) {
    values.push("Custom quote");
  }

  if (numericPrice === 0) {
    values.push("Custom quote");
  }

  return dedupe(values);
};

const inferPriceBand = (numericPrice: number | null) => {
  if (numericPrice === null) {
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
  if (/\bself hosted\b/.test(text)) {
    return ["Self-hosted"];
  }
  if (
    /\bcloud\b/.test(text) ||
    /\bsaas\b/.test(text) ||
    /\bplatform\b/.test(text) ||
    /\bmonthly\b/.test(text)
  ) {
    return ["Cloud / SaaS"];
  }
  return [];
};

const inferCollaborationMode = (bodyText: string, featureLines: string[]) => {
  const text = normalizeText([bodyText, ...featureLines].join(" "));
  if (/\brole based\b/.test(text) || /\bpermissions\b/.test(text)) {
    return ["Roles & permissions"];
  }
  return [];
};

const inferDeveloperFeatures = (bodyText: string, featureLines: string[]) => {
  const text = normalizeText([bodyText, ...featureLines].join(" "));
  const values: string[] = [];
  if (/\bapi\b/.test(text)) {
    values.push("API access");
  }
  if (/\bwebhooks\b/.test(text)) {
    values.push("Webhooks");
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
    software_type: ["E-commerce tools"],
    primary_use_case: ["E-commerce operations"],
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
  featureLines.map((line) => `- ${toSentence(line)}`).join("\n");

const buildPlansPricing = (pricingLines: string[]) =>
  pricingLines.map((line) => `- ${toSentence(line)}`).join("\n");

const buildPlansPricingWithFallback = (
  pricingLines: string[],
  usedZeroPriceFallback: boolean
) => {
  const lines = [...pricingLines];
  if (usedZeroPriceFallback) {
    lines.push(
      "Price field is set to 0 because no public numeric base price was available in the source import data."
    );
  }
  return buildPlansPricing(lines);
};

const buildProsCons = (
  featureLines: string[],
  pricingLines: string[],
  numericPrice: number
) => {
  const pricingText = pricingLines.join(" ");
  const planPrices = dedupe(
    Array.from(pricingText.matchAll(/\$?\s*(\d[\d,]*(?:\.\d+)?)/g))
      .map((match) => match[1]?.replace(/,/g, "") ?? "")
      .filter(Boolean)
  );

  const pros = [
    `Pro: Public starting price is listed at ${formatNumericPrice(numericPrice)}.`,
    ...featureLines.slice(0, 2).map((line) => `Pro: ${toSentence(line)}.`),
  ];

  const cons: string[] = [];
  if (planPrices.length > 1) {
    cons.push(
      `Con: Pricing varies by plan, with higher visible tiers up to ${planPrices[planPrices.length - 1]}.`
    );
  } else {
    cons.push(
      "Con: Feature availability should be checked against the specific plan before purchase."
    );
  }

  if (normalizeText(featureLines.join(" ")).includes("self hosted")) {
    cons.push(
      "Con: Self-hosted deployment means the buyer needs to manage hosting and implementation."
    );
  } else {
    cons.push(
      "Con: Buyers should confirm integration scope, account structure, and rollout effort against their operational needs."
    );
  }

  return [...pros, ...cons].map((line) => `- ${line}`).join("\n");
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
        ? ["No public numeric base price was available, so the marketplace price is set to 0 for this listing"]
        : []),
    ].filter(Boolean)
  );
  const deploymentSentence =
    filterValues.deployment_model?.length > 0
      ? `${title} follows a ${filterValues.deployment_model
          .map((value) => value.toLowerCase())
          .join(" and ")} delivery model based on the source material.`
      : "Deployment details should be reviewed against the official product information before rollout.";
  const collaborationSentence =
    filterValues.collaboration_mode?.length > 0
      ? `The documented workflow also indicates support for ${filterValues.collaboration_mode
          .map((value) => value.toLowerCase())
          .join(" and ")}.`
      : "Teams should still confirm how the product handles buyer roles, approvals, and account management in their own operating model.";
  const developerSentence =
    filterValues.developer_features?.length > 0
      ? `Technical buyers can also note the presence of ${filterValues.developer_features
          .map((value) => value.toLowerCase())
          .join(" and ")} where implementation depth matters.`
      : "Integration and extensibility requirements should be reviewed directly against the vendor's implementation documentation.";

  const paragraphs = [
    `<p>${title} is ${collectionTitle.toLowerCase()} from ${vendor} for organizations that need structured wholesale and business buying workflows. It belongs in the ${collectionTitle} collection because the product focuses on account-based commerce operations, buyer-specific pricing, catalog control, and repeat ordering rather than generic storefront functionality. Buyers evaluating products in this category typically need software that can support operational complexity across business customers, pricing policies, and internal approval requirements.</p>`,
    `<p>${bodyText}. The source material highlights capabilities such as ${featureSentence}. Those capabilities are relevant for teams that want to centralize B2B buying experiences, improve ordering consistency, and reduce manual coordination across business accounts. When a platform supports clearer account rules, pricing logic, and catalog management, it is easier to align the storefront with how distributors, manufacturers, or wholesalers actually sell.</p>`,
    `<p>${title} is suited to buyers comparing workflow fit, deployment model, and pricing visibility across B2B commerce options. ${deploymentSentence} ${collaborationSentence} ${developerSentence} In practical terms, the available feature set points to product usage in areas such as private storefront access, customer-specific catalog experiences, order capture, quote or invoice workflows, and account-level commerce administration.</p>`,
    `<p>The visible pricing information for this listing is based on the marketplace import value of ${formatNumericPrice(numericPrice)}. ${pricingSentence}. This keeps the Shopify price field numeric and comparable while leaving plan-specific details inside the pricing metafield. Buyers should still review plan limits, contract terms, implementation services, and any usage conditions on the official site before making a final purchase decision.</p>`,
    `<p>From a marketplace perspective, ${title} stands out for clearly documented B2B workflow relevance, structured commerce controls, and pricing visibility that helps comparison shopping. At the same time, businesses should confirm category fit against their own catalog size, integration requirements, internal approval model, and expected rollout complexity. That balanced view helps keep the listing informative, neutral, and useful for buyers who need ${collectionTitle.toLowerCase()} with practical fit for business selling operations.</p>`,
  ];

  const html = paragraphs.join("");
  if (countWords(html) < 300) {
    throw new Error(`Generated description below 300 words for ${title}`);
  }
  return html;
};

const loadLocalLogoFiles = async () => {
  const entries: Array<{ filePath: string; stem: string }> = [];
  for (const directory of LOCAL_LOGO_DIRS) {
    const fileNames = await fs.promises.readdir(directory);
    fileNames.forEach((fileName) => {
      const fullPath = path.join(directory, fileName);
      const stem = normalizeHandle(path.basename(fileName, path.extname(fileName)));
      entries.push({ filePath: fullPath, stem });
    });
  }
  return entries;
};

const findBestLocalLogo = async (row: CsvRow) => {
  const files = await loadLocalLogoFiles();
  const officialUrl = cleanOfficialUrl(
    String(row["product.metafields.custom.custom"] ?? "")
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
      normalizeHandle(String(row.Handle ?? "")),
      normalizeHandle(String(row.Title ?? "")),
      normalizeHandle(
        String(row.Title ?? "")
          .replace(/\bB2B\b/gi, "")
          .replace(/\bEdition\b/gi, "")
      ),
      normalizeHandle(String(row.Vendor ?? "")),
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

const prepareLocalLogoAsset = async (localPath: string) => {
  await ensureDir(LOGO_TEMP_DIR);
  const extension = normalizeLogoExtension(path.extname(localPath));
  const baseName = path.basename(localPath, path.extname(localPath));

  if (extension === ".svg" || extension === ".webp") {
    return localPath;
  }

  if (RASTER_LOGO_SOURCE_EXTENSIONS.has(extension)) {
    const outputPath = path.join(LOGO_TEMP_DIR, `${baseName}-120.png`);
    try {
      await resizeRasterLogoTo120(localPath, outputPath);
      return outputPath;
    } catch {
      return localPath;
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

  candidates.push(absoluteUrl(baseUrl, "/favicon.ico"));
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
  await ensureDir(LOGO_TEMP_DIR);
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

  const originalPath = path.join(LOGO_TEMP_DIR, `${fileStem}${extension}`);
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
    const response: any = await shopifyGraphQL.post("", {
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
    });

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

  const response = await shopifyGraphQL.post("", {
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
  });

  const errors = response.data?.data?.publishablePublish?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`Publish failed: ${JSON.stringify(errors)}`);
  }
};

const buildMarketplaceFilterReferenceMap = async (
  filterKeys: string[]
): Promise<MarketplaceFilterReferenceMap> => {
  const { shopifyGraphQL } = await getShopifyClients();
  const definitionsResponse = await shopifyGraphQL.post("", {
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
  });

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
  const response = await shopifyRest.get("/products.json", {
    params: {
      handle,
      limit: 1,
    },
  });

  const products = Array.isArray(response.data?.products)
    ? response.data.products
    : [];
  return products[0] ?? null;
};

const createShopifyProduct = async (product: PreparedProduct) => {
  const { shopifyRest } = await getShopifyClients();
  const response = await shopifyRest.post("/products.json", {
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
  });

  const productId = Number(response.data?.product?.id ?? 0);
  if (!productId) {
    throw new Error(`Shopify product ID missing after create for ${product.title}`);
  }

  return productId;
};

const uploadFileToShopify = async (localPath: string, altText: string) => {
  const { shopifyGraphQL } = await getShopifyClients();
  const fileName = path.basename(localPath);
  const mimeType = mimeTypeFromPath(localPath);
  const fileBytes = await fs.promises.readFile(localPath);
  const stagedUploadResponse = await shopifyGraphQL.post("", {
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
  });

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

  const fileCreateResponse = await shopifyGraphQL.post("", {
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
  });

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
    const pollResponse = await shopifyGraphQL.post("", {
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
    });

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

const upsertProductImage = async (
  productId: number,
  logoFileUrl: string,
  altText: string
) => {
  const { shopifyRest } = await getShopifyClients();
  const productResponse = await shopifyRest.get(`/products/${productId}.json`);
  const product = productResponse.data?.product ?? null;
  const images = Array.isArray(product?.images) ? product.images : [];
  const primaryImage = images[0];

  if (primaryImage?.id) {
    await shopifyRest.put(`/products/${productId}/images/${primaryImage.id}.json`, {
      image: {
        id: primaryImage.id,
        src: logoFileUrl,
        alt: altText,
      },
    });
    return;
  }

  await shopifyRest.post(`/products/${productId}/images.json`, {
    image: {
      src: logoFileUrl,
      alt: altText,
    },
  });
};

const setShopifyMetafields = async (
  productId: number,
  product: PreparedProduct,
  logoFileUrl: string,
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
    {
      namespace: "custom",
      key: "logo_image",
      type: "url",
      value: logoFileUrl,
    },
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

  const response = await shopifyGraphQL.post("", {
    query: `
      mutation SetProductMetafields($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            key
          }
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
  });

  const errors = response.data?.data?.metafieldsSet?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`Metafields failed: ${JSON.stringify(errors)}`);
  }
};

const prepareProduct = async (
  row: CsvRow,
  categoryMapping: CategoryMapping,
  filterDefinitions: Map<string, FilterDefinition>
) => {
  const normalizedSourceHandle = normalizeHandle(String(row.Handle ?? ""));
  const isCsCartB2B = normalizedSourceHandle === CS_CART_B2B_HANDLE;
  const title = String(row.Title ?? "").trim();
  const vendor = String(row.Vendor ?? "").trim();
  const sourceBodyText = isCsCartB2B
    ? CS_CART_B2B_OVERRIDE.bodyText
    : stripHtml(String(row["Body (HTML)"] ?? ""));
  const officialUrl = isCsCartB2B
    ? CS_CART_B2B_OVERRIDE.officialUrl
    : cleanOfficialUrl(String(row["product.metafields.custom.custom"] ?? ""));
  const explicitPrice = isCsCartB2B
    ? CS_CART_B2B_OVERRIDE.price
    : parsePositivePrice(String(row["Variant Price"] ?? ""));
  const rawNumericPrice = parseAnyNumericPrice(String(row["Variant Price"] ?? ""));
  const usedZeroPriceFallback = explicitPrice === null && rawNumericPrice === 0;
  const priceValue = explicitPrice ?? (usedZeroPriceFallback ? 0 : null);
  const handle = normalizeHandle(String(row.Handle ?? "")) || normalizeHandle(title);
  const featureLines = isCsCartB2B
    ? [...CS_CART_B2B_OVERRIDE.featureLines]
    : extractCleanLines(
        String(row["product.metafields.custom.product_features"] ?? "")
      );
  const pricingLines = isCsCartB2B
    ? [...CS_CART_B2B_OVERRIDE.pricingLines]
    : extractCleanLines(
        String(row["product.metafields.custom.plans_pricing"] ?? "")
      );
  const localLogoPath = await findBestLocalLogo(row);

  const missingFields = [
    !title ? "Title" : "",
    !vendor ? "Vendor" : "",
    !handle ? "Handle" : "",
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
        "Pricing was blank or non-numeric, so a safe numeric price could not be assigned.",
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
    usedZeroPriceFallback
  );
  const prosCons = buildProsCons(featureLines, pricingLines, priceValue);
  const bodyHtml = buildBodyHtml(
    title,
    vendor,
    categoryMapping.collectionTitle,
    sourceBodyText,
    featureLines,
    pricingLines,
    priceValue,
    filterValues,
    usedZeroPriceFallback
  );
  const seoTitle =
    (isCsCartB2B ? CS_CART_B2B_OVERRIDE.seoTitle : String(row["SEO Title"] ?? "").trim()) ||
    `${title} | ${vendor} ${categoryMapping.collectionTitle}`;
  const seoDescription =
    (isCsCartB2B
      ? CS_CART_B2B_OVERRIDE.seoDescription
      : String(row["SEO Description"] ?? "").trim()) ||
    `${title} for ${categoryMapping.collectionTitle.toLowerCase()} buyers with pricing, features, and B2B workflow support.`;
  const imageAltText = `${title} ${categoryMapping.collectionTitle.toLowerCase()} logo`;

  return {
    prepared: {
      sourceTitle: title,
      title,
      vendor,
      handle,
      officialUrl,
      status: "active" as const,
      published: true as const,
      productCategory: categoryMapping.productCategory,
      collectionTitle: categoryMapping.collectionTitle,
      collectionHandle: categoryMapping.collectionHandle,
      customTypeMultiple: [categoryMapping.collectionTitle],
      price: formatNumericPrice(priceValue),
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
  const [sourceRows, categoryMapping, filterDefinitions, existing] = await Promise.all([
    readCsv(SOURCE_CSV_PATH),
    loadCategoryMapping(),
    loadFilterDefinitions(),
    loadExistingExport(),
  ]);

  const logRows: ImportLogRow[] = [];
  const preparedRows: PreparedProduct[] = [];

  for (const row of sourceRows) {
    const existingMatch = findExistingMatch(row, existing);
    if (existingMatch) {
      logRows.push({
        sourceTitle: String(row.Title ?? "").trim(),
        title: String(row.Title ?? "").trim(),
        handle: normalizeHandle(String(row.Handle ?? "")),
        vendor: String(row.Vendor ?? "").trim(),
        status: "skipped_existing",
        price: String(row["Variant Price"] ?? "").trim(),
        officialUrl: cleanOfficialUrl(String(row["product.metafields.custom.custom"] ?? "")),
        shopifyProductId: Number(existingMatch.shopify_product_id ?? 0) || null,
        reason: `Matched existing Shopify export row ${existingMatch.handle}`,
        logoSource: null,
        reportNotes: [],
      });
      continue;
    }

    const preparedResult = await prepareProduct(row, categoryMapping, filterDefinitions);
    if (!preparedResult.prepared || preparedResult.skipStatus) {
      logRows.push({
        sourceTitle: String(row.Title ?? "").trim(),
        title: String(row.Title ?? "").trim(),
        handle: normalizeHandle(String(row.Handle ?? "")),
        vendor: String(row.Vendor ?? "").trim(),
        status: preparedResult.skipStatus ?? "failed",
        price: String(row["Variant Price"] ?? "").trim(),
        officialUrl: cleanOfficialUrl(String(row["product.metafields.custom.custom"] ?? "")),
        shopifyProductId: null,
        reason: preparedResult.reason || "Unable to prepare row",
        logoSource: null,
        reportNotes: [],
      });
      continue;
    }

    preparedRows.push(preparedResult.prepared);
  }

  return {
    sourceRows,
    preparedRows,
    logRows,
  };
};

const applyImport = async (
  preparedRows: PreparedProduct[],
  initialLogRows: ImportLogRow[],
  sourceRowsCount: number
) => {
  const filterKeys = dedupe(
    preparedRows.flatMap((row) => Object.keys(row.filterValues ?? {}))
  );
  const marketplaceFilterReferences =
    filterKeys.length > 0
      ? await buildMarketplaceFilterReferenceMap(filterKeys)
      : {};
  const logRows = [...initialLogRows];

  for (const product of preparedRows) {
    try {
      const liveExisting = await fetchProductByHandle(product.handle);
      if (liveExisting?.id) {
        logRows.push({
          sourceTitle: product.sourceTitle,
          title: product.title,
          handle: product.handle,
          vendor: product.vendor,
          status: "skipped_existing",
          price: product.price,
          officialUrl: product.officialUrl,
          shopifyProductId: Number(liveExisting.id),
          reason: `Handle already exists in Shopify as ${product.handle}`,
          logoSource: null,
          reportNotes: [],
        });
        continue;
      }

      let preparedLogoPath: string;
      try {
        preparedLogoPath =
          product.localLogoPath !== null
            ? await prepareLocalLogoAsset(product.localLogoPath)
            : await downloadRemoteLogoAsset(product.officialUrl, product.handle);
      } catch (logoError) {
        if (!product.officialUrl) {
          throw logoError;
        }
        preparedLogoPath = await downloadRemoteLogoAsset(
          product.officialUrl,
          product.handle
        );
      }

      const logoFileUrl = await uploadFileToShopify(
        preparedLogoPath,
        product.imageAltText
      );
      const productId = await createShopifyProduct(product);
      await setShopifyMetafields(
        productId,
        product,
        logoFileUrl,
        marketplaceFilterReferences
      );
      await upsertProductImage(productId, logoFileUrl, product.imageAltText);
      await publishProduct(productId);

      logRows.push({
        sourceTitle: product.sourceTitle,
        title: product.title,
        handle: product.handle,
        vendor: product.vendor,
        status: "imported",
        price: product.price,
        officialUrl: product.officialUrl,
        shopifyProductId: productId,
        reason: "Imported into Shopify successfully.",
        logoSource: preparedLogoPath,
        reportNotes: [
          `Collection mapping: ${product.collectionTitle}`,
          `Filters: ${Object.keys(product.filterValues).join(", ") || "none"}`,
        ],
      });
    } catch (error) {
      logRows.push({
        sourceTitle: product.sourceTitle,
        title: product.title,
        handle: product.handle,
        vendor: product.vendor,
        status: "failed",
        price: product.price,
        officialUrl: product.officialUrl,
        shopifyProductId: null,
        reason: error instanceof Error ? error.message : String(error),
        logoSource: product.localLogoPath,
        reportNotes: [],
      });
    }
  }

  return writeReport(sourceRowsCount, logRows, "apply");
};

const main = async () => {
  const shouldApply = process.argv.includes("--apply");
  const { sourceRows, preparedRows, logRows } = await buildDryRunRows();

  if (!shouldApply) {
    const report = await writeReport(sourceRows.length, logRows, "dry-run");
    console.log(`Report: ${report.reportPath}`);
    console.log(`Total rows: ${report.summary.totalRows}`);
    console.log(`Imported: ${report.summary.imported}`);
    console.log(`Skipped existing: ${report.summary.skipped_existing}`);
    console.log(
      `Skipped missing required data: ${report.summary.skipped_missing_required_data}`
    );
    console.log(
      `Skipped pricing unavailable: ${report.summary.skipped_pricing_unavailable}`
    );
    console.log(`Failed: ${report.summary.failed}`);
    console.log(`Ready to import on apply: ${preparedRows.length}`);
    return;
  }

  const report = await applyImport(preparedRows, logRows, sourceRows.length);
  console.log(`Report: ${report.reportPath}`);
  console.log(`Total rows: ${report.summary.totalRows}`);
  console.log(`Imported: ${report.summary.imported}`);
  console.log(`Skipped existing: ${report.summary.skipped_existing}`);
  console.log(
    `Skipped missing required data: ${report.summary.skipped_missing_required_data}`
  );
  console.log(
    `Skipped pricing unavailable: ${report.summary.skipped_pricing_unavailable}`
  );
  console.log(`Failed: ${report.summary.failed}`);
};

main().catch((error) => {
  console.error("B2B eCommerce Platform import failed:", error);
  process.exitCode = 1;
});
