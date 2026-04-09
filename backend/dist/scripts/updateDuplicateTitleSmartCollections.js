"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("../config/env");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const shopifyHttp_1 = require("../services/shopifyHttp");
const SHOPIFY_PAGE_LIMIT = 250;
const SHOPIFY_GRAPHQL_PAGE_SIZE = 100;
const EXPORTS_DIR = path_1.default.join(__dirname, "../../exports");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalizeKey = (value) => typeof value === "string" ? value.trim().toLowerCase() : "";
const csvEscape = (value) => {
    const stringValue = value === null || value === undefined ? "" : String(value);
    return `"${stringValue.replace(/"/g, '""')}"`;
};
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
const parseNumericIdFromGid = (gid) => {
    if (typeof gid !== "string") {
        return null;
    }
    const match = gid.match(/\/(\d+)$/);
    return match?.[1] ? Number(match[1]) : null;
};
const toCollectionGid = (collectionId) => `gid://shopify/Collection/${collectionId}`;
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
const formatUserErrors = (userErrors, fallback) => {
    const message = userErrors
        .map((error) => {
        const field = Array.isArray(error.field) && error.field.length > 0
            ? `${error.field.join(".")}: `
            : "";
        return `${field}${error.message?.trim() ?? ""}`.trim();
    })
        .filter(Boolean)
        .join(", ");
    return message || fallback;
};
const isRetryableError = (error) => {
    const status = error?.response?.status;
    const errors = error?.response?.data?.errors;
    const message = typeof error?.message === "string"
        ? error.message.toLowerCase()
        : "";
    if (status === 429 || status === 502 || status === 503 || status === 504) {
        return true;
    }
    if (Array.isArray(errors)) {
        const joinedErrors = errors
            .map((item) => typeof item?.message === "string" ? item.message.toLowerCase() : "")
            .join(" ");
        if (joinedErrors.includes("throttled")) {
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
const fetchAllShopifyResources = async (pathName, responseKey) => {
    const results = [];
    let pageInfo = null;
    do {
        const params = pageInfo
            ? { limit: SHOPIFY_PAGE_LIMIT, page_info: pageInfo }
            : { limit: SHOPIFY_PAGE_LIMIT };
        const response = await withRetries(`GET ${pathName}`, () => shopifyHttp_1.shopifyRest.get(pathName, { params }));
        const pageItems = Array.isArray(response.data?.[responseKey])
            ? response.data[responseKey]
            : [];
        results.push(...pageItems);
        pageInfo = extractNextPageInfo(response.headers.link);
    } while (pageInfo);
    return results;
};
const fetchAllSmartCollections = async () => fetchAllShopifyResources("/smart_collections.json", "smart_collections");
const fetchTypeMultipleMetafieldDefinition = async () => {
    const response = await withRetries("Fetch type_multiple metafield definition", () => shopifyHttp_1.shopifyGraphQL.post("", {
        query: `
        query GetTypeMultipleMetafieldDefinition(
          $identifier: MetafieldDefinitionIdentifierInput!
        ) {
          metafieldDefinition(identifier: $identifier) {
            id
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
    }));
    if (response.data?.errors?.length) {
        throw new Error(getGraphQlErrorMessage(response.data.errors, "Failed to load the Type Multiple metafield definition"));
    }
    return response.data?.data?.metafieldDefinition ?? null;
};
const fetchCollectionDetails = async (collectionId) => {
    const response = await withRetries(`Fetch collection details ${collectionId}`, () => shopifyHttp_1.shopifyGraphQL.post("", {
        query: `
        query GetCollectionDetails($id: ID!) {
          node(id: $id) {
            ... on Collection {
              id
              title
              handle
              ruleSet {
                appliedDisjunctively
                rules {
                  column
                  relation
                  condition
                }
              }
            }
          }
        }
      `,
        variables: {
            id: toCollectionGid(collectionId),
        },
    }));
    if (response.data?.errors?.length) {
        throw new Error(getGraphQlErrorMessage(response.data.errors, `Failed to load collection ${collectionId} details`));
    }
    return response.data?.data?.node ?? null;
};
const updateCollectionRuleSet = async ({ collectionId, title, handle, metafieldDefinitionId, }) => {
    const response = await withRetries(`Update collection ${collectionId}`, () => shopifyHttp_1.shopifyGraphQL.post("", {
        query: `
        mutation UpdateDuplicateTitleCollectionRules($input: CollectionInput!) {
          collectionUpdate(input: $input) {
            collection {
              id
              title
              handle
              ruleSet {
                appliedDisjunctively
                rules {
                  column
                  relation
                  condition
                }
              }
            }
            job {
              id
              done
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
        variables: {
            input: {
                id: toCollectionGid(collectionId),
                ruleSet: {
                    appliedDisjunctively: true,
                    rules: [
                        {
                            column: "PRODUCT_METAFIELD_DEFINITION",
                            relation: "EQUALS",
                            condition: title,
                            conditionObjectId: metafieldDefinitionId,
                        },
                        {
                            column: "PRODUCT_METAFIELD_DEFINITION",
                            relation: "EQUALS",
                            condition: handle,
                            conditionObjectId: metafieldDefinitionId,
                        },
                    ],
                },
            },
        },
    }));
    if (response.data?.errors?.length) {
        throw new Error(getGraphQlErrorMessage(response.data.errors, `Failed to update collection "${title}"`));
    }
    const payload = response.data?.data?.collectionUpdate;
    const userErrors = payload?.userErrors ?? [];
    if (userErrors.length > 0) {
        throw new Error(formatUserErrors(userErrors, `Failed to update collection "${title}"`));
    }
    return {
        collection: payload?.collection ?? null,
        jobId: payload?.job?.id ?? null,
    };
};
const isDesiredRuleSet = (ruleSet, title, handle) => {
    const rules = Array.isArray(ruleSet?.rules) ? ruleSet.rules : [];
    const normalizedRuleKeys = rules
        .map((rule) => [
        normalizeKey(rule.column),
        normalizeKey(rule.relation),
        normalizeKey(rule.condition),
    ].join("|"))
        .sort();
    const expectedKeys = [
        [
            "product_metafield_definition",
            "equals",
            normalizeKey(title),
        ].join("|"),
        [
            "product_metafield_definition",
            "equals",
            normalizeKey(handle),
        ].join("|"),
    ].sort();
    if (!ruleSet?.appliedDisjunctively) {
        return false;
    }
    if (normalizedRuleKeys.length !== expectedKeys.length) {
        return false;
    }
    return normalizedRuleKeys.every((ruleKey, index) => ruleKey === expectedKeys[index]);
};
const waitForDesiredRuleSet = async ({ collectionId, title, handle, }) => {
    for (let attempt = 0; attempt < 120; attempt += 1) {
        const details = await fetchCollectionDetails(collectionId);
        if (isDesiredRuleSet(details?.ruleSet, title, handle)) {
            return details;
        }
        await sleep(1500);
    }
    throw new Error(`Timed out waiting for collection ${collectionId} to reflect the updated rule set`);
};
const writeReportFiles = async ({ updated, skipped, }) => {
    await fs_1.default.promises.mkdir(EXPORTS_DIR, { recursive: true });
    const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-");
    const baseName = `shopify-duplicate-title-collection-rules-${timestamp}`;
    const summaryPath = path_1.default.join(EXPORTS_DIR, `${baseName}.json`);
    const skippedCsvPath = path_1.default.join(EXPORTS_DIR, `${baseName}-skipped.csv`);
    const summary = {
        generatedAt: new Date().toISOString(),
        updatedCount: updated.length,
        skippedCount: skipped.length,
        updated,
        skipped,
    };
    await fs_1.default.promises.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");
    const skippedCsv = [
        ["collection_id", "title", "handle", "duplicate_count", "reason"]
            .map((value) => csvEscape(value))
            .join(","),
        ...skipped.map((record) => [
            record.collectionId,
            record.title,
            record.handle,
            record.duplicateCount,
            record.reason,
        ]
            .map((value) => csvEscape(value))
            .join(",")),
    ].join("\n");
    await fs_1.default.promises.writeFile(skippedCsvPath, skippedCsv, "utf8");
    return {
        summaryPath,
        skippedCsvPath,
    };
};
const main = async () => {
    const [smartCollections, metafieldDefinition] = await Promise.all([
        fetchAllSmartCollections(),
        fetchTypeMultipleMetafieldDefinition(),
    ]);
    if (!metafieldDefinition?.id) {
        throw new Error('Missing metafield definition for custom.type_multiple');
    }
    const duplicateGroups = smartCollections
        .filter((collection) => Boolean(collection.title?.trim()))
        .reduce((accumulator, collection) => {
        const key = normalizeKey(collection.title);
        const existing = accumulator.get(key) ?? [];
        existing.push(collection);
        accumulator.set(key, existing);
        return accumulator;
    }, new Map());
    const duplicateCollections = Array.from(duplicateGroups.values())
        .filter((group) => group.length > 1)
        .flatMap((group) => group.map((collection) => ({
        collection,
        duplicateCount: group.length,
    })))
        .sort((left, right) => {
        const titleCompare = (left.collection.title ?? "").localeCompare(right.collection.title ?? "");
        if (titleCompare !== 0) {
            return titleCompare;
        }
        return (left.collection.handle ?? "").localeCompare(right.collection.handle ?? "");
    });
    console.log(`Found ${duplicateCollections.length} duplicate-title smart collections across ${Array.from(duplicateGroups.values()).filter((group) => group.length > 1).length} title groups.`);
    const updated = [];
    const skipped = [];
    for (const item of duplicateCollections) {
        const collectionId = item.collection.id;
        const title = item.collection.title?.trim() ?? "";
        const handle = item.collection.handle?.trim() ?? "";
        const duplicateCount = item.duplicateCount;
        if (!title || !handle) {
            skipped.push({
                collectionId: collectionId || null,
                title,
                handle,
                duplicateCount,
                reason: "Collection is missing a title or handle",
            });
            continue;
        }
        console.log(`Processing duplicate smart collection ${collectionId}: "${title}" -> "${handle}".`);
        const currentDetails = await fetchCollectionDetails(collectionId);
        if (!currentDetails?.id) {
            skipped.push({
                collectionId,
                title,
                handle,
                duplicateCount,
                reason: "Collection details could not be loaded",
            });
            continue;
        }
        if (isDesiredRuleSet(currentDetails.ruleSet, title, handle)) {
            updated.push({
                collectionId,
                title,
                handle,
                duplicateCount,
                status: "already_configured",
            });
            continue;
        }
        const updateResult = await updateCollectionRuleSet({
            collectionId,
            title,
            handle,
            metafieldDefinitionId: metafieldDefinition.id,
        });
        const refreshedDetails = updateResult.jobId || !isDesiredRuleSet(updateResult.collection?.ruleSet, title, handle)
            ? await waitForDesiredRuleSet({
                collectionId,
                title,
                handle,
            })
            : updateResult.collection;
        if (!isDesiredRuleSet(refreshedDetails?.ruleSet, title, handle)) {
            skipped.push({
                collectionId,
                title,
                handle,
                duplicateCount,
                reason: "Collection update completed but the expected title+handle rule set was not present afterward",
            });
            continue;
        }
        updated.push({
            collectionId,
            title,
            handle,
            duplicateCount,
            status: "updated",
        });
    }
    const reportPaths = await writeReportFiles({ updated, skipped });
    console.log(`Updated/already configured: ${updated.length}`);
    console.log(`Skipped: ${skipped.length}`);
    console.log(`Summary report: ${reportPaths.summaryPath}`);
    console.log(`Skipped CSV: ${reportPaths.skippedCsvPath}`);
};
main()
    .then(() => {
    process.exit(0);
})
    .catch((error) => {
    console.error("Duplicate-title smart collection rule update failed:", error);
    process.exit(1);
});
