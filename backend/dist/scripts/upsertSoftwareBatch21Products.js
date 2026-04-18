"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("../config/env");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const csv = require("csv-parser");
const axios_1 = __importDefault(require("axios"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
let shopifyClientsPromise = null;
const CATEGORY_CSV_PATH = path.resolve(__dirname, "../../imports/category-collections.csv");
const FILTERS_CSV_PATH = path.resolve(__dirname, "../../doc/shopify-filter-definitions.csv");
const EXPORTS_DIR = path.resolve(__dirname, "../../exports");
const BATCH_LABEL = "software-batch21";
const LOGO_TEMP_DIR = path.resolve(EXPORTS_DIR, "tmp-software-batch21-logos");
const SHOPIFY_GRAPHQL_PAGE_SIZE = 100;
const TARGET_CATEGORY_SLUG = "software";
const PREVIEW_FILE_PREFIX = "software-batch21-preview-";
const TARGET_COLLECTION_HANDLES = new Set([
    "app-building-software",
    "app-design-software",
]);
const PRODUCT_GID = (productId) => `gid://shopify/Product/${productId}`;
const readCsv = async (filePath) => new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", (row) => {
        const normalizedRow = Object.fromEntries(Object.entries(row).map(([key, value]) => [
            key.replace(/^\uFEFF/, "").replace(/^"|"$/g, ""),
            typeof value === "string" ? value.trim() : String(value ?? ""),
        ]));
        rows.push(normalizedRow);
    })
        .on("end", () => resolve(rows))
        .on("error", reject);
});
const ensureDir = async (dirPath) => {
    await fs.promises.mkdir(dirPath, { recursive: true });
};
const dedupe = (values) => Array.from(new Set(values));
const splitAllowedValues = (value) => value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
const stripHtml = (value) => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const slugify = (value) => value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
const mimeTypeFromPath = (filePath) => {
    const extension = path.extname(filePath).toLowerCase();
    switch (extension) {
        case ".png":
            return "image/png";
        case ".jpg":
        case ".jpeg":
            return "image/jpeg";
        case ".gif":
            return "image/gif";
        case ".svg":
            return "image/svg+xml";
        case ".webp":
            return "image/webp";
        case ".ico":
            return "image/x-icon";
        default:
            return "application/octet-stream";
    }
};
const absoluteUrl = (baseUrl, maybeRelativeUrl) => {
    try {
        return new URL(maybeRelativeUrl, baseUrl).toString();
    }
    catch {
        return maybeRelativeUrl;
    }
};
const findArgValue = (name) => {
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
        .filter((fileName) => fileName.startsWith(PREVIEW_FILE_PREFIX) && fileName.endsWith(".json"))
        .sort();
    if (matches.length === 0) {
        throw new Error(`No preview files found in ${EXPORTS_DIR} with prefix ${PREVIEW_FILE_PREFIX}`);
    }
    return path.join(EXPORTS_DIR, matches[matches.length - 1]);
};
const loadFilterDefinitions = async () => {
    const rows = await readCsv(FILTERS_CSV_PATH);
    return rows
        .filter((row) => row.category_slug === TARGET_CATEGORY_SLUG &&
        row.namespace === "marketplace")
        .map((row) => ({
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
const loadPreviewRows = async (inputPath) => {
    const raw = await fs.promises.readFile(inputPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
        throw new Error(`Preview file is not an array: ${inputPath}`);
    }
    return parsed;
};
const validatePreviewRows = async (rows, inputPath) => {
    const validationErrors = [];
    const warnings = [];
    const filterDefinitions = await loadFilterDefinitions();
    const categoryRows = await loadCategoryRows();
    const categoryByHandle = new Map(categoryRows.map((row) => [String(row.collection_handle), row]));
    const allowedFinalCategories = new Set(categoryRows.map((row) => String(row.final_category)));
    const filterDefinitionByKey = new Map(filterDefinitions.map((definition) => [definition.key, definition]));
    const seenHandles = new Set();
    const seenTitles = new Set();
    const collectionCounts = new Map();
    const confidenceCounts = rows.reduce((acc, row) => {
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
                validationErrors.push(`${rowLabel} collection handle outside batch 21 scope: ${handle}`);
            }
            if (title && String(categoryRow.collection_title) !== title) {
                warnings.push(`${rowLabel} collection title mismatch for ${handle}: dataset="${title}" csv="${String(categoryRow.collection_title)}"`);
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
                validationErrors.push(`${rowLabel} invalid customTypeMultiple category ${finalCategory}`);
            }
        });
        Object.entries(row.filterValues ?? {}).forEach(([key, values]) => {
            const definition = filterDefinitionByKey.get(key);
            if (!definition) {
                validationErrors.push(`${rowLabel} unknown filter key ${key}`);
                return;
            }
            const invalidValues = values.filter((value) => !definition.allowedValues.includes(value));
            if (invalidValues.length > 0) {
                validationErrors.push(`${rowLabel} invalid values for ${key}: ${invalidValues.join(", ")}`);
            }
        });
        if (row.missingFields.some((field) => field !== "custom.logo_image")) {
            warnings.push(`${rowLabel} preview still reports missing fields: ${row.missingFields.join(", ")}`);
        }
    });
    TARGET_COLLECTION_HANDLES.forEach((handle) => {
        const coverageCount = rows.filter((row) => row.collectionHandles.includes(handle)).length;
        if (coverageCount < 2) {
            validationErrors.push(`batch coverage insufficient for ${handle}: expected at least 2 products`);
        }
    });
    return {
        inputPath,
        totalRows: rows.length,
        confidenceCounts,
        collectionCoverage: Array.from(collectionCounts.values()).sort((a, b) => a.title.localeCompare(b.title)),
        validationErrors,
        warnings,
    };
};
const writePreflightReport = async (summary) => {
    await ensureDir(EXPORTS_DIR);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportPath = path.join(EXPORTS_DIR, `${BATCH_LABEL}-upload-preflight-${timestamp}.json`);
    await fs.promises.writeFile(reportPath, JSON.stringify(summary, null, 2), "utf8");
    return reportPath;
};
const getShopifyClients = async () => {
    if (!shopifyClientsPromise) {
        shopifyClientsPromise = Promise.resolve().then(() => __importStar(require("../services/shopifyHttp")));
    }
    return shopifyClientsPromise;
};
const fetchAllExistingProducts = async () => {
    const { shopifyRest } = await getShopifyClients();
    const products = [];
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
        pageProducts.forEach((product) => {
            if (typeof product?.id === "number") {
                products.push(product);
            }
        });
        hasMore = pageProducts.length === 250;
        sinceId = hasMore ? Number(pageProducts[pageProducts.length - 1].id) : sinceId;
    }
    return products;
};
const fetchProductById = async (productId) => {
    const { shopifyRest } = await getShopifyClients();
    const response = await shopifyRest.get(`/products/${productId}.json`);
    return response.data?.product ?? null;
};
const fetchProductByHandle = async (handle) => {
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
    const publicationIds = [];
    let cursor = null;
    let hasNextPage = true;
    while (hasNextPage) {
        const response = await shopifyGraphQL.post("", {
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
        const connection = response.data?.data?.publications;
        const nodes = Array.isArray(connection?.nodes) ? connection.nodes : [];
        nodes.forEach((node) => {
            if (node?.id) {
                publicationIds.push(String(node.id));
            }
        });
        hasNextPage = Boolean(connection?.pageInfo?.hasNextPage);
        cursor = connection?.pageInfo?.endCursor ?? null;
    }
    return dedupe(publicationIds);
};
const publishProduct = async (productId) => {
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
const buildMarketplaceFilterReferenceMap = async (filterKeys) => {
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
    const definitionNodes = Array.isArray(definitionsResponse.data?.data?.metafieldDefinitions?.nodes)
        ? definitionsResponse.data.data.metafieldDefinitions.nodes
        : [];
    const definitionByKey = new Map();
    definitionNodes.forEach((node) => {
        if (filterKeys.includes(String(node?.key ?? ""))) {
            definitionByKey.set(String(node.key), node);
        }
    });
    const map = {};
    for (const key of filterKeys) {
        const definition = definitionByKey.get(key);
        if (!definition) {
            continue;
        }
        const metaobjectDefinitionId = (definition.validations ?? []).find((validation) => validation?.name === "metaobject_definition_id")?.value;
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
        const metaobjectType = metaobjectDefinitionResponse.data?.data?.metaobjectDefinition?.type ?? null;
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
        const byLabel = {};
        nodes.forEach((node) => {
            const labelField = Array.isArray(node?.fields)
                ? node.fields.find((field) => field?.key === "label")?.value
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
const setShopifyMetafields = async (productId, row, logoFileUrl, marketplaceFilterReferences) => {
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
const extractLogoCandidates = (baseUrl, html) => {
    const candidates = [];
    const patterns = [
        /<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*(?:logo|brand)/gi,
        /<link[^>]+rel=["'][^"']*(?:apple-touch-icon|icon)[^"']*["'][^>]+href=["']([^"']+)["']/gi,
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
    ];
    patterns.forEach((pattern) => {
        let match;
        while ((match = pattern.exec(html))) {
            candidates.push(absoluteUrl(baseUrl, match[1]));
        }
    });
    candidates.push(absoluteUrl(baseUrl, "/favicon.ico"));
    return dedupe(candidates);
};
const resolveLogoSourceUrl = async (row) => {
    if (/\.(png|jpe?g|svg|webp|gif|ico)(\?.*)?$/i.test(row.logoSourceUrl)) {
        return row.logoSourceUrl;
    }
    const response = await axios_1.default.get(row.logoSourceUrl, {
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
            const headResponse = await axios_1.default.get(candidate, {
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
        }
        catch {
            continue;
        }
    }
    throw new Error(`Could not resolve logo source for ${row.vendor}`);
};
const resizeRasterLogoTo120 = async (inputPath, outputPath) => {
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
const downloadLogoAsset = async (row) => {
    await ensureDir(LOGO_TEMP_DIR);
    const sourceUrl = await resolveLogoSourceUrl(row);
    const response = await axios_1.default.get(sourceUrl, {
        timeout: 30000,
        responseType: "arraybuffer",
        maxRedirects: 5,
        headers: {
            "User-Agent": "Mozilla/5.0",
            Referer: row.logoSourceUrl,
            Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
    });
    const contentType = String(response.headers["content-type"] ?? "").split(";")[0];
    const urlPath = new URL(sourceUrl).pathname;
    const extensionFromUrl = path.extname(urlPath);
    const extension = extensionFromUrl ||
        ({
            "image/png": ".png",
            "image/jpeg": ".jpg",
            "image/svg+xml": ".svg",
            "image/webp": ".webp",
            "image/gif": ".gif",
            "image/x-icon": ".ico",
            "image/vnd.microsoft.icon": ".ico",
        }[contentType] ?? ".bin");
    const baseName = slugify(row.vendor || row.handle);
    const originalPath = path.join(LOGO_TEMP_DIR, `${baseName}${extension}`);
    await fs.promises.writeFile(originalPath, Buffer.from(response.data));
    if (extension.toLowerCase() === ".webp" || extension.toLowerCase() === ".svg") {
        return {
            sourceUrl,
            filePath: originalPath,
        };
    }
    if ([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico"].includes(extension.toLowerCase())) {
        const outputPath = path.join(LOGO_TEMP_DIR, `${baseName}-120.png`);
        try {
            await resizeRasterLogoTo120(originalPath, outputPath);
            return {
                sourceUrl,
                filePath: outputPath,
            };
        }
        catch {
            return {
                sourceUrl,
                filePath: originalPath,
            };
        }
    }
    return {
        sourceUrl,
        filePath: originalPath,
    };
};
const uploadFileToShopify = async (localPath, altText) => {
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
    const stagedErrors = stagedUploadResponse.data?.data?.stagedUploadsCreate?.userErrors ?? [];
    if (stagedErrors.length > 0) {
        throw new Error(`Staged upload failed: ${JSON.stringify(stagedErrors)}`);
    }
    const target = stagedUploadResponse.data?.data?.stagedUploadsCreate?.stagedTargets?.[0];
    if (!target?.url || !target?.resourceUrl) {
        throw new Error("Shopify did not return a staged upload target");
    }
    const uploadHeaders = {
        "Content-Type": mimeType,
    };
    (target.parameters ?? []).forEach((parameter) => {
        if (parameter?.name && parameter?.value) {
            uploadHeaders[String(parameter.name)] = String(parameter.value);
        }
    });
    await axios_1.default.put(target.url, fileBytes, {
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
        const url = node?.image?.url ?? node?.preview?.image?.url ?? node?.url ?? null;
        const status = node?.fileStatus ?? node?.preview?.status ?? fileNode?.fileStatus ?? null;
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
const upsertProductImage = async (productId, logoFileUrl, altText) => {
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
        return "updated";
    }
    await shopifyRest.post(`/products/${productId}/images.json`, {
        image: {
            src: logoFileUrl,
            alt: altText,
        },
    });
    return "created";
};
const upsertShopifyProduct = async (row) => {
    const { shopifyRest } = await getShopifyClients();
    const existingProduct = (row.existingProductId ? await fetchProductById(row.existingProductId) : null) ??
        (await fetchProductByHandle(row.handle));
    const existingVariant = Array.isArray(existingProduct?.variants)
        ? existingProduct.variants[0]
        : null;
    const primaryType = row.customTypeMultiple[0] ?? row.collectionTitles[0] ?? "Software";
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
        const response = await shopifyRest.put(`/products/${existingProduct.id}.json`, payload);
        return {
            action: "updated",
            productId: Number(response.data?.product?.id ?? existingProduct.id),
        };
    }
    const response = await shopifyRest.post("/products.json", payload);
    return {
        action: "created",
        productId: Number(response.data?.product?.id),
    };
};
const applyDataset = async (rows) => {
    const existingProducts = await fetchAllExistingProducts();
    const marketplaceFilterReferences = await buildMarketplaceFilterReferenceMap(dedupe(rows.flatMap((row) => Object.keys(row.filterValues ?? {}))));
    const duplicateHandles = rows.filter((row) => existingProducts.some((product) => product.handle === row.handle &&
        product.id !== (row.existingProductId ?? product.id)));
    if (duplicateHandles.length > 0) {
        throw new Error(`Duplicate Shopify handles already exist: ${duplicateHandles
            .map((row) => row.handle)
            .join(", ")}`);
    }
    const logoCache = new Map();
    const results = [];
    const normalizeVerificationNotes = (baseNotes, logoStatus, logoError) => {
        const withoutPendingLogoNote = baseNotes.replace(/\s*Logo processing and Shopify Files upload are still pending\.?/gi, "").trim();
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
            let logo = logoCache.get(logoCacheKey) ?? null;
            let logoError = null;
            if (!logo) {
                try {
                    const downloaded = await downloadLogoAsset(row);
                    const fileUrl = await uploadFileToShopify(downloaded.filePath, row.imageAltText);
                    logo = {
                        fileUrl,
                        sourceUrl: downloaded.sourceUrl,
                    };
                    logoCache.set(logoCacheKey, logo);
                }
                catch (error) {
                    logoError = error instanceof Error ? error.message : String(error);
                    logo = null;
                }
            }
            const productResult = await upsertShopifyProduct(row);
            await setShopifyMetafields(productResult.productId, row, logo?.fileUrl ?? null, marketplaceFilterReferences);
            await publishProduct(productResult.productId);
            const imageAction = "skipped";
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
                verificationNotes: normalizeVerificationNotes(row.verificationNotes, logo?.fileUrl ? "uploaded" : logoError ? "failed" : "unchanged", logoError),
            });
        }
        catch (error) {
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
    const reportPath = path.join(EXPORTS_DIR, `${BATCH_LABEL}-upload-report-${timestamp}.json`);
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
    console.log(`Confidence counts: ${Object.entries(summary.confidenceCounts)
        .map(([key, count]) => `${key}=${count}`)
        .join(", ")}`);
    console.log(`Warnings: ${summary.warnings.length}`);
    console.log(`Validation errors: ${summary.validationErrors.length}`);
    if (summary.validationErrors.length > 0) {
        throw new Error(`Preflight validation failed with ${summary.validationErrors.length} errors`);
    }
    if (!shouldApply) {
        console.log("Dry run complete. Re-run with --apply to upload/update Shopify.");
        return;
    }
    const applied = await applyDataset(rows);
    console.log(`Upload report: ${applied.reportPath}`);
    console.log(`Created: ${applied.results.filter((item) => item.action === "created").length}`);
    console.log(`Updated: ${applied.results.filter((item) => item.action === "updated").length}`);
    console.log(`Skipped: ${applied.results.filter((item) => item.action === "skipped").length}`);
};
main().catch((error) => {
    console.error("Software batch 21 upsert failed:", error);
    process.exitCode = 1;
});
