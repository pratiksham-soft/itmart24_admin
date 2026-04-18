import "../config/env";
import * as fs from "fs";
import * as path from "path";
import csv = require("csv-parser");
import axios from "axios";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

let shopifyClientsPromise:
  | Promise<typeof import("../services/shopifyHttp")>
  | null = null;

const CATEGORY_CSV_PATH = path.resolve(
  __dirname,
  "../../imports/category-collections.csv"
);
const FILTERS_CSV_PATH = path.resolve(
  __dirname,
  "../../doc/shopify-filter-definitions.csv"
);
const EXPORTS_DIR = path.resolve(__dirname, "../../exports");
const BATCH_LABEL = "software-batch41";
const LOGO_TEMP_DIR = path.resolve(EXPORTS_DIR, "tmp-software-batch41-logos");
const SHOPIFY_GRAPHQL_PAGE_SIZE = 100;
const TARGET_CATEGORY_SLUG = "software";
const PREVIEW_FILE_PREFIX = "software-batch41-preview-";
const TARGET_COLLECTION_HANDLES = new Set([
  "bar-pos-software",
  "barbershop-software",
]);
const PRODUCT_GID = (productId: number) => `gid://shopify/Product/${productId}`;
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
const ALLOWED_UPLOADED_LOGO_EXTENSIONS = new Set([
  ".png",
  ".jpeg",
  ".svg",
  ".webp",
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

type FilterDefinition = {
  categorySlug: string;
  namespace: string;
  key: string;
  displayLabel: string;
  input: string;
  allowedValues: string[];
};

type MarketplaceFilterReferenceMap = Record<
  string,
  {
    type: string;
    byLabel: Record<string, string>;
  }
>;

type PreviewRow = {
  title: string;
  handle: string;
  bodyHtml: string;
  vendor: string;
  status: "active";
  published: boolean;
  price: string;
  chargeTax: boolean;
  requiresShipping: boolean;
  imageAltText: string;
  seoTitle: string;
  seoDescription: string;
  existingProductId?: number | null;
  collectionHandles: string[];
  collectionTitles: string[];
  sourceUrl: string;
  sourceUrls?: string[];
  sourceLabel: string;
  logoSourceUrl: string;
  customUrl: string;
  customLogoImage?: string;
  customTypeMultiple: string[];
  productFeatures: string;
  plansPricing: string;
  prosCons: string;
  filterValues: Record<string, string[]>;
  verificationNotes: string;
  confidence: "high" | "medium" | "low";
  missingFields: string[];
};

type UploadResult = {
  action: "created" | "updated" | "skipped";
  handle: string;
  title: string;
  vendor: string;
  shopifyProductId: number | null;
  sourceUrl: string;
  collectionHandles: string[];
  collectionTitles: string[];
  logoFileUrl: string | null;
  imageAction: "created" | "updated" | "skipped";
  missingFields: string[];
  verificationNotes: string;
  error?: string;
};

type ShopifyProductRecord = {
  id: number;
  title: string;
  handle: string;
  vendor: string;
  status: string;
};

type ValidationSummary = {
  inputPath: string;
  totalRows: number;
  confidenceCounts: Record<string, number>;
  collectionCoverage: Array<{
    handle: string;
    title: string;
    count: number;
  }>;
  validationErrors: string[];
  warnings: string[];
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

const splitAllowedValues = (value: string) =>
  value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

const stripHtml = (value: string) =>
  value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

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

const findArgValue = (name: string) => {
  const match = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
};

const resolveInputPath = async () => {
  const explicit = findArgValue("--input");
  if (explicit) {
    return path.resolve(process.cwd(), explicit);
  }

  const files = await fs.promises.readdir(EXPORTS_DIR);
  const matches = files
    .filter(
      (fileName) =>
        fileName.startsWith(PREVIEW_FILE_PREFIX) && fileName.endsWith(".json")
    )
    .sort();

  if (matches.length === 0) {
    throw new Error(
      `No preview files found in ${EXPORTS_DIR} with prefix ${PREVIEW_FILE_PREFIX}`
    );
  }

  return path.join(EXPORTS_DIR, matches[matches.length - 1]);
};

const loadFilterDefinitions = async () => {
  const rows = await readCsv(FILTERS_CSV_PATH);
  return rows
    .filter(
      (row) =>
        row.category_slug === TARGET_CATEGORY_SLUG &&
        row.namespace === "marketplace"
    )
    .map<FilterDefinition>((row) => ({
      categorySlug: row.category_slug,
      namespace: row.namespace,
      key: row.metafield_key,
      displayLabel: row.display_label,
      input: row.input,
      allowedValues: splitAllowedValues(row.allowed_values ?? ""),
    }));
};

const loadCategoryRows = async () => {
  const rows = await readCsv(CATEGORY_CSV_PATH);
  return rows.filter((row) => row.top_slug === TARGET_CATEGORY_SLUG);
};

const loadPreviewRows = async (inputPath: string) => {
  const raw = await fs.promises.readFile(inputPath, "utf8");
  const parsed = JSON.parse(raw) as PreviewRow[];
  if (!Array.isArray(parsed)) {
    throw new Error(`Preview file is not an array: ${inputPath}`);
  }
  return parsed;
};

const validatePreviewRows = async (
  rows: PreviewRow[],
  inputPath: string
): Promise<ValidationSummary> => {
  const validationErrors: string[] = [];
  const warnings: string[] = [];
  const filterDefinitions = await loadFilterDefinitions();
  const categoryRows = await loadCategoryRows();
  const categoryByHandle = new Map(
    categoryRows.map((row) => [String(row.collection_handle), row])
  );
  const allowedFinalCategories = new Set(
    categoryRows.map((row) => String(row.final_category))
  );
  const filterDefinitionByKey = new Map(
    filterDefinitions.map((definition) => [definition.key, definition])
  );
  const seenHandles = new Set<string>();
  const seenTitles = new Set<string>();
  const collectionCounts = new Map<string, { handle: string; title: string; count: number }>();
  const confidenceCounts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.confidence] = (acc[row.confidence] ?? 0) + 1;
    return acc;
  }, {});

  rows.forEach((row, index) => {
    const rowLabel = `${index + 1}:${row.handle}`;
    const wordCount = stripHtml(row.bodyHtml).split(/\s+/).filter(Boolean).length;

    if (!row.title) {
      validationErrors.push(`${rowLabel} missing title`);
    }
    if (!row.handle || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.handle)) {
      validationErrors.push(`${rowLabel} has invalid handle`);
    }
    if (!row.bodyHtml || wordCount < 300) {
      validationErrors.push(`${rowLabel} description below 300 words`);
    }
    if (!row.vendor) {
      validationErrors.push(`${rowLabel} missing vendor`);
    }
    if (row.status !== "active") {
      validationErrors.push(`${rowLabel} status must be active`);
    }
    if (row.published !== true) {
      validationErrors.push(`${rowLabel} published must be true`);
    }
    if (row.price !== "" && !/^\d+(\.\d+)?$/.test(String(row.price))) {
      validationErrors.push(`${rowLabel} price must be numeric only`);
    }
    if (row.chargeTax !== false) {
      validationErrors.push(`${rowLabel} chargeTax must be false`);
    }
    if (row.requiresShipping !== false) {
      validationErrors.push(`${rowLabel} requiresShipping must be false`);
    }
    if (!row.imageAltText) {
      validationErrors.push(`${rowLabel} missing image alt text`);
    }
    if (!row.seoTitle) {
      validationErrors.push(`${rowLabel} missing SEO title`);
    }
    if (!row.seoDescription) {
      validationErrors.push(`${rowLabel} missing SEO description`);
    }
    if (!row.sourceUrl || !/^https?:\/\//.test(row.sourceUrl)) {
      validationErrors.push(`${rowLabel} missing or invalid sourceUrl`);
    }
    if (!row.customUrl || !/^https?:\/\//.test(row.customUrl)) {
      validationErrors.push(`${rowLabel} missing or invalid customUrl`);
    }
    if (!row.logoSourceUrl || !/^https?:\/\//.test(row.logoSourceUrl)) {
      validationErrors.push(`${rowLabel} missing or invalid logoSourceUrl`);
    }
    if (!Array.isArray(row.collectionHandles) || row.collectionHandles.length === 0) {
      validationErrors.push(`${rowLabel} missing collectionHandles`);
    }
    if (!Array.isArray(row.collectionTitles) || row.collectionTitles.length === 0) {
      validationErrors.push(`${rowLabel} missing collectionTitles`);
    }
    if (!Array.isArray(row.customTypeMultiple) || row.customTypeMultiple.length === 0) {
      validationErrors.push(`${rowLabel} missing customTypeMultiple`);
    }
    if (!row.productFeatures) {
      validationErrors.push(`${rowLabel} missing productFeatures`);
    }
    if (!row.plansPricing) {
      validationErrors.push(`${rowLabel} missing plansPricing`);
    }
    if (!row.prosCons) {
      validationErrors.push(`${rowLabel} missing prosCons`);
    }

    if (seenHandles.has(row.handle)) {
      validationErrors.push(`${rowLabel} duplicate handle in dataset`);
    }
    seenHandles.add(row.handle);

    if (seenTitles.has(row.title)) {
      validationErrors.push(`${rowLabel} duplicate title in dataset`);
    }
    seenTitles.add(row.title);

    row.collectionHandles.forEach((handle, collectionIndex) => {
      const categoryRow = categoryByHandle.get(handle);
      const title = row.collectionTitles[collectionIndex] ?? "";
      if (!categoryRow) {
        validationErrors.push(`${rowLabel} unknown collection handle ${handle}`);
        return;
      }
      if (!TARGET_COLLECTION_HANDLES.has(handle)) {
        validationErrors.push(
          `${rowLabel} collection handle outside batch 41 scope: ${handle}`
        );
      }
      if (title && String(categoryRow.collection_title) !== title) {
        warnings.push(
          `${rowLabel} collection title mismatch for ${handle}: dataset="${title}" csv="${String(
            categoryRow.collection_title
          )}"`
        );
      }

      const key = `${handle}::${String(categoryRow.collection_title)}`;
      const current = collectionCounts.get(key) ?? {
        handle,
        title: String(categoryRow.collection_title),
        count: 0,
      };
      current.count += 1;
      collectionCounts.set(key, current);
    });

    row.customTypeMultiple.forEach((finalCategory) => {
      if (!allowedFinalCategories.has(finalCategory)) {
        validationErrors.push(
          `${rowLabel} invalid customTypeMultiple category ${finalCategory}`
        );
      }
    });

    Object.entries(row.filterValues ?? {}).forEach(([key, values]) => {
      const definition = filterDefinitionByKey.get(key);
      if (!definition) {
        validationErrors.push(`${rowLabel} unknown filter key ${key}`);
        return;
      }

      const invalidValues = values.filter(
        (value) => !definition.allowedValues.includes(value)
      );
      if (invalidValues.length > 0) {
        validationErrors.push(
          `${rowLabel} invalid values for ${key}: ${invalidValues.join(", ")}`
        );
      }
    });

    if (row.missingFields.some((field) => field !== "custom.logo_image")) {
      warnings.push(
        `${rowLabel} preview still reports missing fields: ${row.missingFields.join(
          ", "
        )}`
      );
    }
  });

  TARGET_COLLECTION_HANDLES.forEach((handle) => {
    const coverageCount = rows.filter((row) =>
      row.collectionHandles.includes(handle)
    ).length;
    if (coverageCount < 2) {
      validationErrors.push(
        `batch coverage insufficient for ${handle}: expected at least 2 products`
      );
    }
  });

  return {
    inputPath,
    totalRows: rows.length,
    confidenceCounts,
    collectionCoverage: Array.from(collectionCounts.values()).sort((a, b) =>
      a.title.localeCompare(b.title)
    ),
    validationErrors,
    warnings,
  };
};

const writePreflightReport = async (summary: ValidationSummary) => {
  await ensureDir(EXPORTS_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(
    EXPORTS_DIR,
    `${BATCH_LABEL}-upload-preflight-${timestamp}.json`
  );
  await fs.promises.writeFile(reportPath, JSON.stringify(summary, null, 2), "utf8");
  return reportPath;
};

const getShopifyClients = async () => {
  if (!shopifyClientsPromise) {
    shopifyClientsPromise = import("../services/shopifyHttp");
  }
  return shopifyClientsPromise;
};

const fetchAllExistingProducts = async () => {
  const { shopifyRest } = await getShopifyClients();
  const products: ShopifyProductRecord[] = [];
  let sinceId = 0;
  let hasMore = true;

  while (hasMore) {
    const response = await shopifyRest.get("/products.json", {
      params: {
        limit: 250,
        since_id: sinceId,
        fields: "id,title,handle,vendor,status",
      },
    });

    const pageProducts = Array.isArray(response.data?.products)
      ? response.data.products
      : [];
    pageProducts.forEach((product: any) => {
      if (typeof product?.id === "number") {
        products.push(product as ShopifyProductRecord);
      }
    });

    hasMore = pageProducts.length === 250;
    sinceId = hasMore ? Number(pageProducts[pageProducts.length - 1].id) : sinceId;
  }

  return products;
};

const fetchProductById = async (productId: number) => {
  const { shopifyRest } = await getShopifyClients();
  const response = await shopifyRest.get(`/products/${productId}.json`);
  return response.data?.product ?? null;
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

const setShopifyMetafields = async (
  productId: number,
  row: PreviewRow,
  logoFileUrl: string | null,
  marketplaceFilterReferences: MarketplaceFilterReferenceMap
) => {
  const { shopifyGraphQL } = await getShopifyClients();
  const inputs = [
    {
      namespace: "custom",
      key: "custom",
      type: "url",
      value: row.customUrl,
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
      value: JSON.stringify(row.customTypeMultiple),
    },
    {
      namespace: "custom",
      key: "product_features",
      type: "multi_line_text_field",
      value: row.productFeatures,
    },
    {
      namespace: "custom",
      key: "plans_pricing",
      type: "multi_line_text_field",
      value: row.plansPricing,
    },
    {
      namespace: "custom",
      key: "pros_cons",
      type: "multi_line_text_field",
      value: row.prosCons,
    },
    ...Object.entries(row.filterValues).map(([key, values]) => {
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

const resolveLogoSourceUrl = async (row: PreviewRow) => {
  const directExtension = normalizeLogoExtension(
    path.extname(new URL(row.logoSourceUrl).pathname)
  );
  if (DIRECT_LOGO_SOURCE_EXTENSIONS.has(directExtension)) {
    return row.logoSourceUrl;
  }

  const response = await axios.get(row.logoSourceUrl, {
    timeout: 30000,
    responseType: "text",
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  const html = String(response.data ?? "");
  const candidates = extractLogoCandidates(row.logoSourceUrl, html);

  for (const candidate of candidates) {
    try {
      const headResponse = await axios.get(candidate, {
        timeout: 30000,
        responseType: "arraybuffer",
        maxRedirects: 5,
        headers: {
          "User-Agent": "Mozilla/5.0",
          Referer: row.logoSourceUrl,
        },
      });
      if (Number(headResponse.status) >= 200 && Number(headResponse.status) < 400) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  throw new Error(`Could not resolve logo source for ${row.vendor}`);
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

const downloadLogoAsset = async (row: PreviewRow) => {
  await ensureDir(LOGO_TEMP_DIR);
  const sourceUrl = await resolveLogoSourceUrl(row);
  const response = await axios.get<ArrayBuffer>(sourceUrl, {
    timeout: 30000,
    responseType: "arraybuffer",
    maxRedirects: 5,
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: row.logoSourceUrl,
      Accept: "image/webp,image/png,image/jpeg,image/svg+xml,image/*,*/*;q=0.8",
    },
  });

  const contentType = String(response.headers["content-type"] ?? "").split(";")[0];
  const urlPath = new URL(sourceUrl).pathname;
  const extensionFromUrl = normalizeLogoExtension(path.extname(urlPath));
  const extension = extensionFromUrl || extensionFromContentType(contentType);

  if (!extension) {
    throw new Error(
      `Unsupported logo format for ${row.vendor}: ${contentType || "unknown"}`
    );
  }

  const baseName = slugify(row.vendor || row.handle);
  const originalPath = path.join(LOGO_TEMP_DIR, `${baseName}${extension}`);
  await fs.promises.writeFile(originalPath, Buffer.from(response.data));

  if (!ALLOWED_UPLOADED_LOGO_EXTENSIONS.has(extension) &&
      !RASTER_LOGO_SOURCE_EXTENSIONS.has(extension)) {
    throw new Error(
      `Unsupported logo extension for ${row.vendor}: ${extension}`
    );
  }

  if (extension === ".webp" || extension === ".svg") {
    return {
      sourceUrl,
      filePath: originalPath,
    };
  }

  if (RASTER_LOGO_SOURCE_EXTENSIONS.has(extension)) {
    const outputPath = path.join(LOGO_TEMP_DIR, `${baseName}-120.png`);
    await resizeRasterLogoTo120(originalPath, outputPath);
    return {
      sourceUrl,
      filePath: outputPath,
    };
  }

  throw new Error(`Unsupported logo extension for ${row.vendor}: ${extension}`);
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
  const product = await fetchProductById(productId);
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
    return "updated" as const;
  }

  await shopifyRest.post(`/products/${productId}/images.json`, {
    image: {
      src: logoFileUrl,
      alt: altText,
    },
  });
  return "created" as const;
};

const upsertShopifyProduct = async (row: PreviewRow) => {
  const { shopifyRest } = await getShopifyClients();
  const existingProduct =
    (row.existingProductId ? await fetchProductById(row.existingProductId) : null) ??
    (await fetchProductByHandle(row.handle));

  const existingVariant = Array.isArray(existingProduct?.variants)
    ? existingProduct.variants[0]
    : null;
  const primaryType =
    row.customTypeMultiple[0] ?? row.collectionTitles[0] ?? "Software";

  const payload = {
    product: {
      ...(existingProduct?.id ? { id: existingProduct.id } : {}),
      title: row.title,
      handle: row.handle,
      body_html: row.bodyHtml,
      vendor: row.vendor,
      product_type: primaryType,
      status: row.status,
      published: row.published,
      metafields_global_title_tag: row.seoTitle,
      metafields_global_description_tag: row.seoDescription,
      variants: [
        existingVariant?.id
          ? {
              id: existingVariant.id,
              ...(row.price !== "" ? { price: row.price } : {}),
              taxable: row.chargeTax,
              requires_shipping: row.requiresShipping,
            }
          : {
              option1: "Default Title",
              ...(row.price !== "" ? { price: row.price } : {}),
              taxable: row.chargeTax,
              requires_shipping: row.requiresShipping,
            },
      ],
    },
  };

  if (existingProduct?.id) {
    const response = await shopifyRest.put(
      `/products/${existingProduct.id}.json`,
      payload
    );
    return {
      action: "updated" as const,
      productId: Number(response.data?.product?.id ?? existingProduct.id),
    };
  }

  const response = await shopifyRest.post("/products.json", payload);
  return {
    action: "created" as const,
    productId: Number(response.data?.product?.id),
  };
};

const applyDataset = async (rows: PreviewRow[]) => {
  const existingProducts = await fetchAllExistingProducts();
  const marketplaceFilterReferences = await buildMarketplaceFilterReferenceMap(
    dedupe(rows.flatMap((row) => Object.keys(row.filterValues ?? {})))
  );
  const duplicateHandles = rows.filter(
    (row) =>
      existingProducts.some(
        (product) =>
          product.handle === row.handle &&
          product.id !== (row.existingProductId ?? product.id)
      )
  );

  if (duplicateHandles.length > 0) {
    throw new Error(
      `Duplicate Shopify handles already exist: ${duplicateHandles
        .map((row) => row.handle)
        .join(", ")}`
    );
  }

  const logoCache = new Map<string, { fileUrl: string; sourceUrl: string }>();
  const results: UploadResult[] = [];

  const normalizeVerificationNotes = (
    baseNotes: string,
    logoStatus: "uploaded" | "failed" | "unchanged",
    logoError?: string | null
  ) => {
    const withoutPendingLogoNote = baseNotes.replace(
      /\s*Logo processing and Shopify Files upload are still pending\.?/gi,
      ""
    ).trim();

    if (logoStatus === "uploaded") {
      return `${withoutPendingLogoNote}\nLogo uploaded to Shopify Files during apply.`.trim();
    }

    if (logoStatus === "failed" && logoError) {
      return `${withoutPendingLogoNote}\nLogo not uploaded: ${logoError}`.trim();
    }

    return withoutPendingLogoNote;
  };

  for (const row of rows) {
    const logoCacheKey = `${row.vendor}::${row.logoSourceUrl}`;

    try {
      let logo: { fileUrl: string; sourceUrl: string } | null =
        logoCache.get(logoCacheKey) ?? null;
      let logoError: string | null = null;

      if (!logo) {
        try {
          const downloaded = await downloadLogoAsset(row);
          const fileUrl = await uploadFileToShopify(
            downloaded.filePath,
            row.imageAltText
          );
          logo = {
            fileUrl,
            sourceUrl: downloaded.sourceUrl,
          };
          logoCache.set(logoCacheKey, logo);
        } catch (error) {
          logoError = error instanceof Error ? error.message : String(error);
          logo = null;
        }
      }

      const productResult = await upsertShopifyProduct(row);
      await setShopifyMetafields(
        productResult.productId,
        row,
        logo?.fileUrl ?? null,
        marketplaceFilterReferences
      );
      await publishProduct(productResult.productId);
      const imageAction = "skipped" as const;

      const remainingMissingFields = [
        ...row.missingFields.filter((field) => field !== "custom.logo_image"),
        ...(logo?.fileUrl ? [] : ["custom.logo_image"]),
      ];

      results.push({
        action: productResult.action,
        handle: row.handle,
        title: row.title,
        vendor: row.vendor,
        shopifyProductId: productResult.productId,
        sourceUrl: row.sourceUrl,
        collectionHandles: row.collectionHandles,
        collectionTitles: row.collectionTitles,
        logoFileUrl: logo?.fileUrl ?? null,
        imageAction,
        missingFields: remainingMissingFields,
        verificationNotes: normalizeVerificationNotes(
          row.verificationNotes,
          logo?.fileUrl ? "uploaded" : logoError ? "failed" : "unchanged",
          logoError
        ),
      });
    } catch (error) {
      results.push({
        action: "skipped",
        handle: row.handle,
        title: row.title,
        vendor: row.vendor,
        shopifyProductId: row.existingProductId ?? null,
        sourceUrl: row.sourceUrl,
        collectionHandles: row.collectionHandles,
        collectionTitles: row.collectionTitles,
        logoFileUrl: null,
        imageAction: "skipped",
        missingFields: row.missingFields,
        verificationNotes: row.verificationNotes,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(
    EXPORTS_DIR,
    `${BATCH_LABEL}-upload-report-${timestamp}.json`
  );
  await fs.promises.writeFile(reportPath, JSON.stringify(results, null, 2), "utf8");

  return {
    reportPath,
    results,
  };
};

const main = async () => {
  const shouldApply = process.argv.includes("--apply");
  const inputPath = await resolveInputPath();
  const rows = await loadPreviewRows(inputPath);
  const summary = await validatePreviewRows(rows, inputPath);
  const preflightPath = await writePreflightReport(summary);

  console.log(`Input JSON: ${inputPath}`);
  console.log(`Preflight report: ${preflightPath}`);
  console.log(`Rows: ${summary.totalRows}`);
  console.log(
    `Confidence counts: ${Object.entries(summary.confidenceCounts)
      .map(([key, count]) => `${key}=${count}`)
      .join(", ")}`
  );
  console.log(`Warnings: ${summary.warnings.length}`);
  console.log(`Validation errors: ${summary.validationErrors.length}`);

  if (summary.validationErrors.length > 0) {
    throw new Error(
      `Preflight validation failed with ${summary.validationErrors.length} errors`
    );
  }

  if (!shouldApply) {
    console.log("Dry run complete. Re-run with --apply to upload/update Shopify.");
    return;
  }

  const applied = await applyDataset(rows);
  console.log(`Upload report: ${applied.reportPath}`);
  console.log(
    `Created: ${applied.results.filter((item) => item.action === "created").length}`
  );
  console.log(
    `Updated: ${applied.results.filter((item) => item.action === "updated").length}`
  );
  console.log(
    `Skipped: ${applied.results.filter((item) => item.action === "skipped").length}`
  );
};

main().catch((error) => {
  console.error("Software batch 41 upsert failed:", error);
  process.exitCode = 1;
});
