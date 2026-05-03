"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("../config/env");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const shopifyHttp_1 = require("../services/shopifyHttp");
const EXPORTS_DIR = path_1.default.resolve(__dirname, "../../exports");
const APPLY_CHANGES = process.argv.includes("--apply");
const DEFAULT_REPORT_PREFIX = "all-e-softwares-import-apply-";
const PRODUCT_GID = (productId) => `gid://shopify/Product/${productId}`;
const getCliArgValue = (flag) => {
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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isRetryableError = (error) => {
    const status = error?.response?.status;
    const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";
    const apiErrors = error?.response?.data?.errors;
    const apiErrorText = typeof apiErrors === "string" ? apiErrors.toLowerCase() : "";
    return (status === 429 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        message.includes("timeout") ||
        message.includes("socket hang up") ||
        message.includes("econnreset") ||
        message.includes("econnaborted") ||
        message.includes("throttled") ||
        apiErrorText.includes("reduce request rates"));
};
const getRetryDelayMs = (error, attempt) => {
    const retryAfterHeader = error?.response?.headers?.["retry-after"];
    const retryAfterSeconds = Number(retryAfterHeader);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        return Math.ceil(retryAfterSeconds * 1000);
    }
    return attempt * 1500;
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
            const delayMs = getRetryDelayMs(error, attempt);
            console.warn(`[retry] ${label} failed on attempt ${attempt}/${maxAttempts}. Retrying in ${delayMs}ms...`);
            await sleep(delayMs);
        }
    }
    throw lastError;
};
const csvEscape = (value) => {
    const stringValue = value === null || value === undefined ? "" : String(value);
    return `"${stringValue.replace(/"/g, '""')}"`;
};
const cleanComparableUrl = (value) => {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) {
        return "";
    }
    try {
        const url = new URL(trimmed);
        url.hash = "";
        url.search = "";
        return url.toString();
    }
    catch {
        return trimmed;
    }
};
const getReportPaths = async () => {
    const reportPrefix = getCliArgValue("--report-prefix") || DEFAULT_REPORT_PREFIX;
    const files = await fs_1.default.promises.readdir(EXPORTS_DIR);
    const matches = files
        .filter((fileName) => fileName.startsWith(reportPrefix) && fileName.endsWith(".json"))
        .sort();
    if (matches.length === 0) {
        throw new Error(`No apply reports found in ${EXPORTS_DIR} with prefix ${reportPrefix}`);
    }
    return matches.map((fileName) => path_1.default.join(EXPORTS_DIR, fileName));
};
const loadImportedProductRefs = async (reportPaths) => {
    const byId = new Map();
    for (const reportPath of reportPaths) {
        const raw = await fs_1.default.promises.readFile(reportPath, "utf8");
        const parsed = JSON.parse(raw);
        const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
        for (const row of rows) {
            if (row.status !== "imported") {
                continue;
            }
            const productId = Number(row.shopifyProductId ?? 0);
            if (productId > 0) {
                byId.set(productId, { productId });
            }
        }
    }
    return Array.from(byId.values()).sort((a, b) => a.productId - b.productId);
};
const chunk = (values, size) => {
    const chunks = [];
    for (let index = 0; index < values.length; index += size) {
        chunks.push(values.slice(index, index + size));
    }
    return chunks;
};
const fetchProductsByIds = async (productIds) => {
    const products = new Map();
    for (const idsChunk of chunk(productIds, 200)) {
        const response = await withRetries(`fetch live products chunk starting ${idsChunk[0]}`, () => shopifyHttp_1.shopifyRest.get("/products.json", {
            params: {
                ids: idsChunk.join(","),
                fields: "id,title,handle,status",
                limit: idsChunk.length,
            },
        }));
        const rows = Array.isArray(response.data?.products)
            ? response.data.products
            : [];
        for (const row of rows) {
            const productId = Number(row?.id ?? 0);
            if (!productId) {
                continue;
            }
            products.set(productId, {
                id: productId,
                title: String(row?.title ?? "").trim(),
                handle: String(row?.handle ?? "").trim(),
                status: String(row?.status ?? "").trim(),
            });
        }
        await sleep(400);
    }
    return products;
};
const fetchProductByHandle = async (handle) => {
    const response = await withRetries(`fetch product by handle ${handle}`, () => shopifyHttp_1.shopifyRest.get("/products.json", {
        params: {
            handle,
            limit: 1,
            fields: "id,title,handle,status",
        },
    }));
    const rows = Array.isArray(response.data?.products)
        ? response.data.products
        : [];
    const row = rows[0];
    if (!row?.id) {
        return null;
    }
    return {
        id: Number(row.id),
        title: String(row.title ?? "").trim(),
        handle: String(row.handle ?? "").trim(),
        status: String(row.status ?? "").trim(),
    };
};
const fetchLogoUrl = async (productId) => {
    const response = await withRetries(`fetch metafields for ${productId}`, () => shopifyHttp_1.shopifyRest.get(`/products/${productId}/metafields.json`));
    const metafields = Array.isArray(response.data?.metafields)
        ? response.data.metafields
        : [];
    const logoMetafield = metafields.find((metafield) => metafield?.namespace === "custom" && metafield?.key === "logo_image");
    return typeof logoMetafield?.value === "string"
        ? logoMetafield.value.trim()
        : "";
};
const findFileNodeIdByUrl = async (logoUrl) => {
    if (!logoUrl) {
        return null;
    }
    const comparableUrl = cleanComparableUrl(logoUrl);
    let basename = "";
    try {
        basename = path_1.default.posix.basename(new URL(comparableUrl).pathname);
    }
    catch {
        return null;
    }
    if (!basename) {
        return null;
    }
    const response = await withRetries(`find file for ${basename}`, () => shopifyHttp_1.shopifyGraphQL.post("", {
        query: `
        query FindFileBySearch($first: Int!, $query: String!) {
          files(first: $first, query: $query) {
            nodes {
              __typename
              ... on MediaImage {
                id
                image {
                  url
                }
              }
              ... on GenericFile {
                id
                url
              }
            }
          }
        }
      `,
        variables: {
            first: 20,
            query: basename,
        },
    }));
    const nodes = Array.isArray(response.data?.data?.files?.nodes)
        ? response.data.data.files.nodes
        : [];
    for (const node of nodes) {
        const nodeUrl = typeof node?.image?.url === "string"
            ? node.image.url
            : typeof node?.url === "string"
                ? node.url
                : "";
        if (cleanComparableUrl(nodeUrl) === comparableUrl) {
            return String(node.id);
        }
    }
    return null;
};
const deleteProduct = async (productId) => {
    await withRetries(`delete product ${productId}`, () => shopifyHttp_1.shopifyRest.delete(`/products/${productId}.json`));
};
const deleteFile = async (fileId) => {
    const response = await withRetries(`delete file ${fileId}`, () => shopifyHttp_1.shopifyGraphQL.post("", {
        query: `
        mutation DeleteFile($fileIds: [ID!]!) {
          fileDelete(fileIds: $fileIds) {
            deletedFileIds
            userErrors {
              field
              message
            }
          }
        }
      `,
        variables: {
            fileIds: [fileId],
        },
    }));
    const errors = response.data?.data?.fileDelete?.userErrors ?? [];
    if (errors.length > 0) {
        throw new Error(`File delete failed: ${JSON.stringify(errors)}`);
    }
};
const writeReport = async (rows, reportPaths) => {
    await fs_1.default.promises.mkdir(EXPORTS_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseName = `all-e-softwares-duplicate-products-${timestamp}${APPLY_CHANGES ? "-applied" : "-dry-run"}`;
    const jsonPath = path_1.default.join(EXPORTS_DIR, `${baseName}.json`);
    const csvPath = path_1.default.join(EXPORTS_DIR, `${baseName}.csv`);
    const payload = {
        generatedAt: new Date().toISOString(),
        applyChanges: APPLY_CHANGES,
        duplicateCount: rows.length,
        deletedProductCount: rows.filter((row) => row.deleteProductApplied).length,
        deletedLogoCount: rows.filter((row) => row.deleteLogoApplied).length,
        errorCount: rows.filter((row) => row.error).length,
        sourceApplyReports: reportPaths,
        rows,
    };
    await fs_1.default.promises.writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf8");
    const csvLines = [
        [
            "Duplicate Product ID",
            "Duplicate Title",
            "Duplicate Handle",
            "Base Product ID",
            "Base Handle",
            "Logo URL",
            "Logo File ID",
            "Delete Product Applied",
            "Delete Logo Applied",
            "Error",
        ]
            .map(csvEscape)
            .join(","),
        ...rows.map((row) => [
            row.duplicateProductId,
            row.duplicateTitle,
            row.duplicateHandle,
            row.baseProductId,
            row.baseHandle,
            row.logoUrl,
            row.logoFileId,
            row.deleteProductApplied,
            row.deleteLogoApplied,
            row.error,
        ]
            .map(csvEscape)
            .join(",")),
    ];
    await fs_1.default.promises.writeFile(csvPath, csvLines.join("\n"), "utf8");
    return { jsonPath, csvPath };
};
const main = async () => {
    const reportPaths = await getReportPaths();
    const importedRefs = await loadImportedProductRefs(reportPaths);
    const liveProducts = await fetchProductsByIds(importedRefs.map((row) => row.productId));
    const liveByHandle = new Map();
    liveProducts.forEach((product) => {
        if (product.handle) {
            liveByHandle.set(product.handle, product);
        }
    });
    const duplicates = Array.from(liveProducts.values()).filter((product) => /-1$/.test(product.handle));
    const rows = [];
    for (const duplicate of duplicates) {
        const baseHandle = duplicate.handle.replace(/-1$/, "");
        const baseProduct = liveByHandle.get(baseHandle) ?? (await fetchProductByHandle(baseHandle));
        if (!baseProduct?.id || baseProduct.id === duplicate.id) {
            continue;
        }
        const logoUrl = await fetchLogoUrl(duplicate.id);
        const duplicateLogoUrl = cleanComparableUrl(logoUrl);
        const baseLogoUrl = cleanComparableUrl(await fetchLogoUrl(baseProduct.id));
        const logoFileId = duplicateLogoUrl && duplicateLogoUrl !== baseLogoUrl
            ? await findFileNodeIdByUrl(duplicateLogoUrl)
            : null;
        let deleteProductApplied = false;
        let deleteLogoApplied = false;
        let error = null;
        if (APPLY_CHANGES) {
            try {
                await deleteProduct(duplicate.id);
                deleteProductApplied = true;
                await sleep(500);
                if (logoFileId) {
                    await deleteFile(logoFileId);
                    deleteLogoApplied = true;
                    await sleep(500);
                }
            }
            catch (deleteError) {
                error =
                    deleteError instanceof Error ? deleteError.message : String(deleteError);
            }
        }
        rows.push({
            duplicateProductId: duplicate.id,
            duplicateTitle: duplicate.title,
            duplicateHandle: duplicate.handle,
            baseProductId: baseProduct.id,
            baseHandle: baseProduct.handle,
            logoUrl: duplicateLogoUrl,
            logoFileId,
            deleteProductApplied,
            deleteLogoApplied,
            error,
        });
        await sleep(300);
    }
    const report = await writeReport(rows, reportPaths);
    console.log(`Source apply reports: ${reportPaths.join(", ")}`);
    console.log(`Imported products scanned: ${importedRefs.length}`);
    console.log(`Live duplicate products found: ${rows.length}`);
    console.log(`Products deleted: ${rows.filter((row) => row.deleteProductApplied).length}`);
    console.log(`Logo files deleted: ${rows.filter((row) => row.deleteLogoApplied).length}`);
    console.log(`Errors: ${rows.filter((row) => row.error).length}`);
    console.log(`JSON report: ${report.jsonPath}`);
    console.log(`CSV report: ${report.csvPath}`);
    if (!APPLY_CHANGES) {
        console.log("Dry run complete. Re-run with --apply to delete duplicate products.");
    }
};
main().catch((error) => {
    console.error("Delete All E software duplicate products failed:", error);
    process.exitCode = 1;
});
