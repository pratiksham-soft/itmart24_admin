import "../config/env";
import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { shopifyGraphQL, shopifyRest } from "../services/shopifyHttp";

const SHOPIFY_PAGE_LIMIT = 250;
const SHOPIFY_GRAPHQL_PAGE_SIZE = 100;
const CSV_FILE_PATH = path.join(
  __dirname,
  "../../imports/category-collections.csv"
);
const EXPORTS_DIR = path.join(__dirname, "../../exports");
const APPLY_CHANGES = process.argv.includes("--apply");

type CsvRow = {
  subcategory?: string;
  final_category?: string;
  collection_title?: string;
  collection_handle?: string;
};

type OtherCollectionTarget = {
  parentTitle: string;
  currentCsvTitle: string;
  finalCategory: string;
  collectionHandle: string;
  desiredTitle: string;
  rowNumbers: number[];
};

type ShopifyCollection = {
  id: number;
  title?: string;
  handle?: string | null;
};

type ShopifyMetafieldDefinition = {
  id: string;
};

type MutationUserError = {
  field?: string[] | null;
  message?: string;
};

type CollectionRule = {
  column?: string | null;
  relation?: string | null;
  condition?: string | null;
};

type CollectionDetails = {
  id?: string;
  title?: string;
  handle?: string | null;
  ruleSet?: {
    appliedDisjunctively?: boolean | null;
    rules?: CollectionRule[] | null;
  } | null;
};

type ShopifyCollectionProductNode = {
  id?: string;
  legacyResourceId?: string | number | null;
  title?: string;
  typeMultipleMetafield?: {
    value?: string | null;
  } | null;
};

type LiveTarget = {
  collectionId: number;
  handle: string;
  currentTitle: string;
  desiredTitle: string;
  parentTitle: string;
  rowNumbers: number[];
  currentConditions: string[];
  transitionalConditions: string[];
  products: Array<{
    graphqlId: string;
    productId: number;
    title: string;
    currentTypeMultiple: string[];
  }>;
};

type ProductMigration = {
  graphqlId: string;
  productId: number;
  title: string;
  currentValues: string[];
  nextValues: string[];
  affectedCollectionHandles: string[];
};

type CollectionReportRecord = {
  collectionId: number | null;
  handle: string;
  currentTitle: string | null;
  desiredTitle: string;
  parentTitle: string;
  productCount: number;
  currentConditions: string[];
  rowNumbers: number[];
  status: "ready" | "already_migrated" | "skipped_missing" | "skipped_invalid";
  reason?: string;
};

type ProductReportRecord = {
  productId: number;
  title: string;
  currentValues: string[];
  nextValues: string[];
  affectedCollectionHandles: string[];
  updated: boolean;
};

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const normalizeWhitespace = (value: string | null | undefined) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

const normalizeKey = (value: string | null | undefined) =>
  normalizeWhitespace(value).toLowerCase();

const toCollectionGid = (collectionId: number | string) =>
  `gid://shopify/Collection/${collectionId}`;

const csvEscape = (value: string | number | boolean | null | undefined) => {
  const stringValue =
    value === null || value === undefined ? "" : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
};

const toUniqueList = (values: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];

  values.forEach((value) => {
    const trimmed = normalizeWhitespace(value);
    const key = normalizeKey(trimmed);

    if (!trimmed || seen.has(key)) {
      return;
    }

    seen.add(key);
    result.push(trimmed);
  });

  return result;
};

const parseListMetafield = (value?: string | null) => {
  const trimmed = normalizeWhitespace(value);

  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed)
      ? parsed
          .map((item) => normalizeWhitespace(String(item)))
          .filter(Boolean)
      : [trimmed];
  } catch {
    return [trimmed];
  }
};

const sameNormalizedStringSet = (
  left: string[],
  right: string[]
) => {
  const leftSet = new Set(left.map((value) => normalizeKey(value)).filter(Boolean));
  const rightSet = new Set(
    right.map((value) => normalizeKey(value)).filter(Boolean)
  );

  if (leftSet.size !== rightSet.size) {
    return false;
  }

  return Array.from(leftSet).every((value) => rightSet.has(value));
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
  const errors = error?.response?.data?.errors;
  const message =
    typeof error?.message === "string"
      ? error.message.toLowerCase()
      : "";

  if (status === 429 || status === 502 || status === 503 || status === 504) {
    return true;
  }

  if (Array.isArray(errors)) {
    const joinedErrors = errors
      .map((item) =>
        typeof item?.message === "string" ? item.message.toLowerCase() : ""
      )
      .join(" ");
    if (joinedErrors.includes("throttled")) {
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
  fetchAllShopifyResources<ShopifyCollection>(
    "/smart_collections.json",
    "smart_collections"
  );

const fetchTypeMultipleMetafieldDefinition = async () => {
  const response: {
    data?: {
      data?: {
        metafieldDefinition?: ShopifyMetafieldDefinition | null;
      };
      errors?: Array<{ message?: string }>;
    };
  } = await withRetries("Fetch type_multiple metafield definition", () =>
    shopifyGraphQL.post("", {
      query: `
        query GetTypeMultipleMetafieldDefinition(
          $identifier: MetafieldDefinitionIdentifierInput!
        ) {
          metafieldDefinition(identifier: $identifier) {
            id
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
    })
  );

  if (response.data?.errors?.length) {
    throw new Error(
      getGraphQlErrorMessage(
        response.data.errors,
        "Failed to load the Type Multiple metafield definition"
      )
    );
  }

  return response.data?.data?.metafieldDefinition ?? null;
};

const fetchCollectionDetails = async (collectionId: number) => {
  const response: {
    data?: {
      data?: {
        node?: CollectionDetails | null;
      };
      errors?: Array<{ message?: string }>;
    };
  } = await withRetries(`Fetch collection details ${collectionId}`, () =>
    shopifyGraphQL.post("", {
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
    })
  );

  if (response.data?.errors?.length) {
    throw new Error(
      getGraphQlErrorMessage(
        response.data.errors,
        `Failed to load collection ${collectionId} details`
      )
    );
  }

  return response.data?.data?.node ?? null;
};

const fetchCollectionProducts = async (collectionId: number) => {
  const products: LiveTarget["products"] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response: {
      data?: {
        data?: {
          collection?: {
            products?: {
              nodes?: ShopifyCollectionProductNode[];
              pageInfo?: {
                hasNextPage?: boolean;
                endCursor?: string | null;
              };
            } | null;
          } | null;
        };
        errors?: Array<{ message?: string }>;
      };
    } = await withRetries(`Fetch collection ${collectionId} products`, () =>
      shopifyGraphQL.post("", {
        query: `
          query GetCollectionProducts($id: ID!, $first: Int!, $after: String) {
            collection(id: $id) {
              products(first: $first, after: $after) {
                nodes {
                  id
                  legacyResourceId
                  title
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
          }
        `,
        variables: {
          id: toCollectionGid(collectionId),
          first: SHOPIFY_GRAPHQL_PAGE_SIZE,
          after: cursor,
        },
      })
    );

    if (response.data?.errors?.length) {
      throw new Error(
        getGraphQlErrorMessage(
          response.data.errors,
          `Failed to fetch products for collection ${collectionId}`
        )
      );
    }

    const connection = response.data?.data?.collection?.products;
    const nodes = Array.isArray(connection?.nodes) ? connection.nodes : [];

    nodes.forEach((product) => {
      const productId = Number(product.legacyResourceId);

      if (!product.id || Number.isNaN(productId)) {
        return;
      }

      products.push({
        graphqlId: product.id,
        productId,
        title: normalizeWhitespace(product.title ?? "Untitled Product"),
        currentTypeMultiple: parseListMetafield(
          product.typeMultipleMetafield?.value
        ),
      });
    });

    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage);
    cursor = connection?.pageInfo?.endCursor ?? null;
  }

  return products;
};

const updateCollection = async ({
  collectionId,
  title,
  conditions,
  metafieldDefinitionId,
}: {
  collectionId: number;
  title: string;
  conditions: string[];
  metafieldDefinitionId: string;
}) => {
  const response: {
    data?: {
      data?: {
        collectionUpdate?: {
          collection?: CollectionDetails | null;
          job?: {
            id?: string;
          } | null;
          userErrors?: MutationUserError[];
        };
      };
      errors?: Array<{ message?: string }>;
    };
  } = await withRetries(`Update collection ${collectionId}`, () =>
    shopifyGraphQL.post("", {
      query: `
        mutation UpdateCollectionTitleAndRules($input: CollectionInput!) {
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
          title,
          ruleSet: {
            appliedDisjunctively: true,
            rules: conditions.map((condition) => ({
              column: "PRODUCT_METAFIELD_DEFINITION",
              relation: "EQUALS",
              condition,
              conditionObjectId: metafieldDefinitionId,
            })),
          },
        },
      },
    })
  );

  if (response.data?.errors?.length) {
    throw new Error(
      getGraphQlErrorMessage(
        response.data.errors,
        `Failed to update collection ${collectionId}`
      )
    );
  }

  const payload = response.data?.data?.collectionUpdate;
  const userErrors = payload?.userErrors ?? [];

  if (userErrors.length > 0) {
    throw new Error(
      formatUserErrors(
        userErrors,
        `Failed to update collection ${collectionId}`
      )
    );
  }

  return {
    collection: payload?.collection ?? null,
    jobId: payload?.job?.id ?? null,
  };
};

const setProductTypeMultipleValues = async (
  productGraphqlId: string,
  values: string[]
) => {
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

const getRuleConditions = (ruleSet: CollectionDetails["ruleSet"]) => {
  const rules = Array.isArray(ruleSet?.rules) ? ruleSet.rules : [];

  if (rules.length === 0 || !ruleSet?.appliedDisjunctively) {
    return null;
  }

  const unsupportedRule = rules.find((rule) => {
    const column = normalizeKey(rule.column);
    const relation = normalizeKey(rule.relation);
    const condition = normalizeWhitespace(rule.condition);

    return (
      column !== "product_metafield_definition" ||
      relation !== "equals" ||
      !condition
    );
  });

  if (unsupportedRule) {
    return null;
  }

  return toUniqueList(
    rules
      .map((rule) => normalizeWhitespace(rule.condition))
      .filter(Boolean)
  );
};

const readOtherCollectionTargets = async () =>
  new Promise<OtherCollectionTarget[]>((resolve, reject) => {
    const targetsByHandle = new Map<string, OtherCollectionTarget>();
    let rowNumber = 1;

    fs.createReadStream(CSV_FILE_PATH)
      .pipe(
        csv({
          mapHeaders: ({ header }) =>
            header
              .replace(/^\uFEFF/, "")
              .replace(/^"(.*)"$/, "$1"),
        })
      )
      .on("data", (row: CsvRow) => {
        rowNumber += 1;

        const parentTitle = normalizeWhitespace(row.subcategory);
        const finalCategory = normalizeWhitespace(row.final_category);
        const currentCsvTitle = normalizeWhitespace(row.collection_title);
        const collectionHandle = normalizeWhitespace(row.collection_handle);
        const isOtherRow =
          normalizeKey(currentCsvTitle) === "other" ||
          normalizeKey(finalCategory) === "other";

        if (!isOtherRow || !parentTitle || !collectionHandle) {
          return;
        }

        const desiredTitle = `${parentTitle} - Other`;
        const key = normalizeKey(collectionHandle);
        const existing = targetsByHandle.get(key);

        if (existing) {
          existing.rowNumbers.push(rowNumber);
          return;
        }

        targetsByHandle.set(key, {
          parentTitle,
          currentCsvTitle: currentCsvTitle || "Other",
          finalCategory,
          collectionHandle,
          desiredTitle,
          rowNumbers: [rowNumber],
        });
      })
      .on("end", () =>
        resolve(
          Array.from(targetsByHandle.values()).sort((left, right) =>
            left.collectionHandle.localeCompare(right.collectionHandle)
          )
        )
      )
      .on("error", reject);
  });

const ensureExportsDir = async () => {
  await fs.promises.mkdir(EXPORTS_DIR, { recursive: true });
};

const writeReportFiles = async ({
  applyChanges,
  collections,
  products,
}: {
  applyChanges: boolean;
  collections: CollectionReportRecord[];
  products: ProductReportRecord[];
}) => {
  await ensureExportsDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = `rename-other-collections-${timestamp}-${
    applyChanges ? "applied" : "dry-run"
  }`;
  const summaryPath = path.join(EXPORTS_DIR, `${baseName}.json`);
  const collectionCsvPath = path.join(
    EXPORTS_DIR,
    `${baseName}-collections.csv`
  );
  const productCsvPath = path.join(
    EXPORTS_DIR,
    `${baseName}-products.csv`
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    applyChanges,
    collectionCount: collections.length,
    readyCollectionCount: collections.filter(
      (record) => record.status === "ready"
    ).length,
    alreadyMigratedCollectionCount: collections.filter(
      (record) => record.status === "already_migrated"
    ).length,
    skippedCollectionCount: collections.filter((record) =>
      record.status.startsWith("skipped")
    ).length,
    productCount: products.length,
    changedProductCount: products.filter((record) => record.updated).length,
    collections,
    products,
  };

  await fs.promises.writeFile(
    summaryPath,
    JSON.stringify(summary, null, 2),
    "utf8"
  );

  const collectionCsv = [
    [
      "collection_id",
      "handle",
      "current_title",
      "desired_title",
      "parent_title",
      "product_count",
      "current_conditions",
      "row_numbers",
      "status",
      "reason",
    ]
      .map((value) => csvEscape(value))
      .join(","),
    ...collections.map((record) =>
      [
        record.collectionId,
        record.handle,
        record.currentTitle,
        record.desiredTitle,
        record.parentTitle,
        record.productCount,
        record.currentConditions.join(" | "),
        record.rowNumbers.join(" | "),
        record.status,
        record.reason ?? "",
      ]
        .map((value) => csvEscape(value))
        .join(",")
    ),
  ].join("\n");

  const productCsv = [
    [
      "product_id",
      "title",
      "current_values",
      "next_values",
      "affected_collection_handles",
      "updated",
    ]
      .map((value) => csvEscape(value))
      .join(","),
    ...products.map((record) =>
      [
        record.productId,
        record.title,
        record.currentValues.join(" | "),
        record.nextValues.join(" | "),
        record.affectedCollectionHandles.join(" | "),
        record.updated,
      ]
        .map((value) => csvEscape(value))
        .join(",")
    ),
  ].join("\n");

  await Promise.all([
    fs.promises.writeFile(collectionCsvPath, collectionCsv, "utf8"),
    fs.promises.writeFile(productCsvPath, productCsv, "utf8"),
  ]);

  return {
    summaryPath,
    collectionCsvPath,
    productCsvPath,
  };
};

const main = async () => {
  const [targets, smartCollections, metafieldDefinition] =
    await Promise.all([
      readOtherCollectionTargets(),
      fetchAllSmartCollections(),
      fetchTypeMultipleMetafieldDefinition(),
    ]);

  if (!metafieldDefinition?.id) {
    throw new Error(
      'Missing metafield definition for custom.type_multiple'
    );
  }

  const collectionsByHandle = new Map<string, ShopifyCollection>();
  smartCollections.forEach((collection) => {
    const handleKey = normalizeKey(collection.handle);

    if (handleKey) {
      collectionsByHandle.set(handleKey, collection);
    }
  });

  const collectionReports: CollectionReportRecord[] = [];
  const liveTargets: LiveTarget[] = [];
  const productMemberships = new Map<
    string,
    {
      graphqlId: string;
      productId: number;
      title: string;
      currentValues: string[];
      desiredValues: Set<string>;
      removalValues: Set<string>;
      affectedCollectionHandles: Set<string>;
    }
  >();

  for (const target of targets) {
    const liveCollection = collectionsByHandle.get(
      normalizeKey(target.collectionHandle)
    );

    if (!liveCollection?.id) {
      collectionReports.push({
        collectionId: null,
        handle: target.collectionHandle,
        currentTitle: null,
        desiredTitle: target.desiredTitle,
        parentTitle: target.parentTitle,
        productCount: 0,
        currentConditions: [],
        rowNumbers: target.rowNumbers,
        status: "skipped_missing",
        reason: "No live Shopify smart collection exists for this handle",
      });
      continue;
    }

    const details = await fetchCollectionDetails(liveCollection.id);
    const currentTitle =
      normalizeWhitespace(details?.title) ||
      normalizeWhitespace(liveCollection.title);
    const currentConditions = getRuleConditions(details?.ruleSet);

    if (!details?.id || !currentConditions || currentConditions.length === 0) {
      collectionReports.push({
        collectionId: liveCollection.id,
        handle: target.collectionHandle,
        currentTitle: currentTitle || null,
        desiredTitle: target.desiredTitle,
        parentTitle: target.parentTitle,
        productCount: 0,
        currentConditions: currentConditions ?? [],
        rowNumbers: target.rowNumbers,
        status: "skipped_invalid",
        reason:
          "Collection rule set is missing or not a simple OR of type_multiple equality rules",
      });
      continue;
    }

    const products = await fetchCollectionProducts(liveCollection.id);
    const transitionalConditions = toUniqueList([
      ...currentConditions,
      target.desiredTitle,
    ]);

    const alreadyMigrated =
      normalizeKey(currentTitle) === normalizeKey(target.desiredTitle) &&
      sameNormalizedStringSet(currentConditions, [target.desiredTitle]);

    collectionReports.push({
      collectionId: liveCollection.id,
      handle: target.collectionHandle,
      currentTitle: currentTitle || null,
      desiredTitle: target.desiredTitle,
      parentTitle: target.parentTitle,
      productCount: products.length,
      currentConditions,
      rowNumbers: target.rowNumbers,
      status: alreadyMigrated ? "already_migrated" : "ready",
    });

    if (alreadyMigrated) {
      continue;
    }

    liveTargets.push({
      collectionId: liveCollection.id,
      handle: target.collectionHandle,
      currentTitle,
      desiredTitle: target.desiredTitle,
      parentTitle: target.parentTitle,
      rowNumbers: target.rowNumbers,
      currentConditions,
      transitionalConditions,
      products,
    });

    products.forEach((product) => {
      const existing = productMemberships.get(product.graphqlId) ?? {
        graphqlId: product.graphqlId,
        productId: product.productId,
        title: product.title,
        currentValues: product.currentTypeMultiple,
        desiredValues: new Set<string>(),
        removalValues: new Set<string>(),
        affectedCollectionHandles: new Set<string>(),
      };

      existing.desiredValues.add(target.desiredTitle);
      existing.removalValues.add("Other");
      existing.removalValues.add(target.collectionHandle);
      existing.affectedCollectionHandles.add(target.collectionHandle);
      currentConditions.forEach((condition) => {
        if (normalizeKey(condition) !== normalizeKey(target.desiredTitle)) {
          existing.removalValues.add(condition);
        }
      });

      productMemberships.set(product.graphqlId, existing);
    });
  }

  const productMigrations: ProductMigration[] = Array.from(
    productMemberships.values()
  )
    .map((product) => {
      const removalKeys = new Set(
        Array.from(product.removalValues)
          .map((value) => normalizeKey(value))
          .filter(Boolean)
      );
      const retainedValues = product.currentValues.filter(
        (value) => !removalKeys.has(normalizeKey(value))
      );
      const nextValues = toUniqueList([
        ...retainedValues,
        ...Array.from(product.desiredValues),
      ]);

      return {
        graphqlId: product.graphqlId,
        productId: product.productId,
        title: product.title,
        currentValues: product.currentValues,
        nextValues,
        affectedCollectionHandles: Array.from(
          product.affectedCollectionHandles
        ).sort(),
      };
    })
    .sort((left, right) => left.title.localeCompare(right.title));

  console.log(`CSV "Other" targets found: ${targets.length}`);
  console.log(`Live collections ready to migrate: ${liveTargets.length}`);
  console.log(
    `Products needing evaluation across those collections: ${productMigrations.length}`
  );

  if (APPLY_CHANGES) {
    console.log("Applying transitional collection updates...");
    for (const target of liveTargets) {
      await updateCollection({
        collectionId: target.collectionId,
        title: target.desiredTitle,
        conditions: target.transitionalConditions,
        metafieldDefinitionId: metafieldDefinition.id,
      });
    }

    console.log("Updating product custom.type_multiple values...");
    for (const product of productMigrations) {
      if (sameNormalizedStringSet(product.currentValues, product.nextValues)) {
        continue;
      }

      await setProductTypeMultipleValues(product.graphqlId, product.nextValues);
    }

    console.log("Finalizing collection rules to the new unique titles...");
    for (const target of liveTargets) {
      await updateCollection({
        collectionId: target.collectionId,
        title: target.desiredTitle,
        conditions: [target.desiredTitle],
        metafieldDefinitionId: metafieldDefinition.id,
      });
    }
  } else {
    console.log(
      "Dry run only. Re-run with --apply to update Shopify collections and product metafields."
    );
  }

  const reportPaths = await writeReportFiles({
    applyChanges: APPLY_CHANGES,
    collections: collectionReports,
    products: productMigrations.map((product) => ({
      productId: product.productId,
      title: product.title,
      currentValues: product.currentValues,
      nextValues: product.nextValues,
      affectedCollectionHandles: product.affectedCollectionHandles,
      updated: !sameNormalizedStringSet(
        product.currentValues,
        product.nextValues
      ),
    })),
  });

  console.log(`Summary report: ${reportPaths.summaryPath}`);
  console.log(`Collection CSV: ${reportPaths.collectionCsvPath}`);
  console.log(`Product CSV: ${reportPaths.productCsvPath}`);
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(
      'Rename "Other" collections to parent-title form failed:',
      error
    );
    process.exit(1);
  });
