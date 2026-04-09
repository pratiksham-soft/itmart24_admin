import "../config/env";
import fs from "fs";
import path from "path";
import { shopifyGraphQL, shopifyRest } from "../services/shopifyHttp";

const SHOPIFY_PAGE_LIMIT = 250;
const EXPORTS_DIR = path.join(__dirname, "../../exports");

const KEEP_HANDLES = new Set([
  "managed-hosting-managed-wordpress-hosting",
  "wordpress-hosting-woocommerce-hosting",
]);

const DELETE_HANDLES = new Set([
  "wordpress-hosting-managed-wordpress-hosting",
  "e-commerce-hosting-woocommerce-hosting",
]);

type ShopifyCollection = {
  id: number;
  title?: string;
  handle?: string | null;
};

type MutationUserError = {
  field?: string[] | null;
  message?: string;
};

type DeletedRecord = {
  collectionId: number;
  title: string;
  handle: string;
};

type SkippedRecord = {
  handle: string;
  reason: string;
};

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const csvEscape = (value: string | number | null | undefined) => {
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

const deleteCollection = async (collectionId: number) => {
  const response: {
    data?: {
      data?: {
        collectionDelete?: {
          deletedCollectionId?: string | null;
          userErrors?: MutationUserError[];
        };
      };
      errors?: Array<{ message?: string }>;
    };
  } = await withRetries(`Delete collection ${collectionId}`, () =>
    shopifyGraphQL.post("", {
      query: `
        mutation DeleteCollection($input: CollectionDeleteInput!) {
          collectionDelete(input: $input) {
            deletedCollectionId
            userErrors {
              field
              message
            }
          }
        }
      `,
      variables: {
        input: {
          id: `gid://shopify/Collection/${collectionId}`,
        },
      },
    })
  );

  if (response.data?.errors?.length) {
    throw new Error(
      getGraphQlErrorMessage(
        response.data.errors,
        `Failed to delete collection ${collectionId}`
      )
    );
  }

  const payload = response.data?.data?.collectionDelete;
  const userErrors = payload?.userErrors ?? [];

  if (userErrors.length > 0) {
    throw new Error(
      formatUserErrors(
        userErrors,
        `Failed to delete collection ${collectionId}`
      )
    );
  }

  if (!payload?.deletedCollectionId) {
    throw new Error(
      `Shopify did not confirm deletion for collection ${collectionId}`
    );
  }
};

const writeReportFiles = async ({
  deleted,
  skipped,
  remainingTargets,
}: {
  deleted: DeletedRecord[];
  skipped: SkippedRecord[];
  remainingTargets: ShopifyCollection[];
}) => {
  await fs.promises.mkdir(EXPORTS_DIR, { recursive: true });

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");
  const baseName = `shopify-delete-specific-duplicates-${timestamp}`;

  const summaryPath = path.join(EXPORTS_DIR, `${baseName}.json`);
  const skippedCsvPath = path.join(EXPORTS_DIR, `${baseName}-skipped.csv`);

  const summary = {
    generatedAt: new Date().toISOString(),
    keepHandles: Array.from(KEEP_HANDLES),
    deleteHandles: Array.from(DELETE_HANDLES),
    deletedCount: deleted.length,
    skippedCount: skipped.length,
    deleted,
    skipped,
    remainingTargets: remainingTargets.map((collection) => ({
      id: collection.id,
      title: collection.title ?? "",
      handle: collection.handle ?? "",
    })),
  };

  await fs.promises.writeFile(
    summaryPath,
    JSON.stringify(summary, null, 2),
    "utf8"
  );

  const skippedCsv = [
    ["handle", "reason"].map((value) => csvEscape(value)).join(","),
    ...skipped.map((record) =>
      [record.handle, record.reason]
        .map((value) => csvEscape(value))
        .join(",")
    ),
  ].join("\n");

  await fs.promises.writeFile(skippedCsvPath, skippedCsv, "utf8");

  return {
    summaryPath,
    skippedCsvPath,
  };
};

const main = async () => {
  const initialCollections = await fetchAllSmartCollections();
  const byHandle = new Map(
    initialCollections
      .filter((collection) => collection.handle)
      .map((collection) => [collection.handle as string, collection])
  );

  const deleted: DeletedRecord[] = [];
  const skipped: SkippedRecord[] = [];

  for (const keepHandle of KEEP_HANDLES) {
    if (!byHandle.has(keepHandle)) {
      skipped.push({
        handle: keepHandle,
        reason: "Keep handle was not found in Shopify",
      });
    }
  }

  for (const deleteHandle of DELETE_HANDLES) {
    const collection = byHandle.get(deleteHandle);

    if (!collection) {
      skipped.push({
        handle: deleteHandle,
        reason: "Delete handle was not found in Shopify",
      });
      continue;
    }

    console.log(
      `Deleting smart collection ${collection.id}: "${collection.title ?? ""}" (${deleteHandle}).`
    );

    await deleteCollection(collection.id);

    deleted.push({
      collectionId: collection.id,
      title: collection.title?.trim() ?? "",
      handle: deleteHandle,
    });
  }

  const remainingCollections = await fetchAllSmartCollections();
  const remainingTargets = remainingCollections.filter((collection) => {
    const handle = collection.handle?.trim() ?? "";
    return KEEP_HANDLES.has(handle) || DELETE_HANDLES.has(handle);
  });

  const reportPaths = await writeReportFiles({
    deleted,
    skipped,
    remainingTargets,
  });

  console.log(`Deleted: ${deleted.length}`);
  console.log(`Skipped: ${skipped.length}`);
  console.log(`Summary report: ${reportPaths.summaryPath}`);
  console.log(`Skipped CSV: ${reportPaths.skippedCsvPath}`);
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Delete specific duplicate collections failed:", error);
    process.exit(1);
  });
