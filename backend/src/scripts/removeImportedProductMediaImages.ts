import "../config/env";
import fs from "fs";
import path from "path";
import { shopifyGraphQL, shopifyRest } from "../services/shopifyHttp";

const EXPORTS_DIR = path.resolve(__dirname, "../../exports");
const DEFAULT_REPORT_PREFIX = "software-products-folder-import-apply-";
const APPLY_CHANGES = process.argv.includes("--apply");
const PRODUCT_GID = (productId: number) => `gid://shopify/Product/${productId}`;
const SHOPIFY_GRAPHQL_PAGE_SIZE = 50;

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

type ApplyReportRow = {
  status?: string;
  title?: string;
  handle?: string;
  shopifyProductId?: number | null;
};

type ApplyReport = {
  rows?: ApplyReportRow[];
};

type ShopifyMediaImage = {
  id: string;
  imageSrc: string;
};

type CleanupRow = {
  productId: number;
  title: string;
  handle: string;
  imageId: string;
  imageSrc: string;
  applied: boolean;
  error: string | null;
};

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableError = (error: any) => {
  const status = error?.response?.status;
  const message =
    typeof error?.message === "string"
      ? error.message.toLowerCase()
      : "";
  const apiErrors = error?.response?.data?.errors;

  if (status === 429 || status === 502 || status === 503 || status === 504) {
    return true;
  }

  const apiErrorText =
    typeof apiErrors === "string" ? apiErrors.toLowerCase() : "";

  return (
    message.includes("timeout") ||
    message.includes("socket hang up") ||
    message.includes("econnreset") ||
    message.includes("econnaborted") ||
    message.includes("throttled") ||
    apiErrorText.includes("reduce request rates")
  );
};

const getRetryDelayMs = (error: any, attempt: number) => {
  const retryAfterHeader = error?.response?.headers?.["retry-after"];
  const retryAfterSeconds = Number(retryAfterHeader);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.ceil(retryAfterSeconds * 1000);
  }
  return attempt * 1500;
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

      const delayMs = getRetryDelayMs(error, attempt);
      console.warn(
        `[retry] ${label} failed on attempt ${attempt}/${maxAttempts}. Retrying in ${delayMs}ms...`
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
};

const csvEscape = (value: unknown) => {
  const stringValue =
    value === null || value === undefined ? "" : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
};

const REPORT_PREFIX = getCliArgValue("--report-prefix") || DEFAULT_REPORT_PREFIX;
const REPORT_PATH_ARG = getCliArgValue("--report");

const findApplyReports = async () => {
  if (REPORT_PATH_ARG) {
    return [path.resolve(process.cwd(), REPORT_PATH_ARG)];
  }

  const files = await fs.promises.readdir(EXPORTS_DIR);
  const matches = files
    .filter(
      (fileName) =>
        fileName.startsWith(REPORT_PREFIX) && fileName.endsWith(".json")
    )
    .sort();

  if (matches.length === 0) {
    throw new Error(`No apply report found in ${EXPORTS_DIR} with prefix ${REPORT_PREFIX}`);
  }

  return matches.map((fileName) => path.join(EXPORTS_DIR, fileName));
};

const loadImportedProductsFromReport = async (reportPath: string) => {
  const raw = await fs.promises.readFile(reportPath, "utf8");
  const parsed = JSON.parse(raw) as ApplyReport;
  const rows = Array.isArray(parsed.rows) ? parsed.rows : [];

  return rows
    .filter(
      (row) =>
        row.status === "imported" &&
        typeof row.shopifyProductId === "number" &&
        row.shopifyProductId > 0
    )
    .map((row) => ({
      productId: Number(row.shopifyProductId),
      title: String(row.title ?? ""),
      handle: String(row.handle ?? ""),
    }));
};

const loadImportedProductsFromReports = async (reportPaths: string[]) => {
  const byProductId = new Map<
    number,
    {
      productId: number;
      title: string;
      handle: string;
    }
  >();

  for (const reportPath of reportPaths) {
    const products = await loadImportedProductsFromReport(reportPath);
    for (const product of products) {
      byProductId.set(product.productId, product);
    }
  }

  return Array.from(byProductId.values()).sort((a, b) => a.productId - b.productId);
};

const fetchProductTitleAndHandle = async (productId: number) => {
  const response = await withRetries(`fetch product ${productId}`, () =>
    shopifyRest.get(`/products/${productId}.json`, {
      params: {
        fields: "id,title,handle",
      },
    })
  );

  const product = response.data?.product ?? null;

  return {
    title: String(product?.title ?? ""),
    handle: String(product?.handle ?? ""),
  };
};

const fetchProductMediaImages = async (productId: number) => {
  const media: ShopifyMediaImage[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await withRetries(`fetch product media ${productId}`, () =>
      shopifyGraphQL.post("", {
        query: `
          query ProductMediaImages($id: ID!, $first: Int!, $after: String) {
            product(id: $id) {
              media(first: $first, after: $after) {
                nodes {
                  __typename
                  ... on MediaImage {
                    id
                    image {
                      url
                    }
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
          id: PRODUCT_GID(productId),
          first: SHOPIFY_GRAPHQL_PAGE_SIZE,
          after: cursor,
        },
      })
    );

    const connection = response.data?.data?.product?.media;
    const nodes = Array.isArray(connection?.nodes) ? connection.nodes : [];
    for (const node of nodes) {
      if (node?.__typename === "MediaImage" && node?.id) {
        media.push({
          id: String(node.id),
          imageSrc: String(node?.image?.url ?? ""),
        });
      }
    }

    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage);
    cursor = connection?.pageInfo?.endCursor ?? null;
    await sleep(600);
  }

  return media;
};

const deleteProductImage = async (productId: number, imageId: string) => {
  const response = await withRetries(`delete product media ${productId}/${imageId}`, () =>
    shopifyGraphQL.post("", {
      query: `
        mutation DeleteProductMedia($productId: ID!, $mediaIds: [ID!]!) {
          productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
            deletedMediaIds
            mediaUserErrors {
              field
              message
            }
          }
        }
      `,
      variables: {
        productId: PRODUCT_GID(productId),
        mediaIds: [imageId],
      },
    })
  );

  const errors =
    response.data?.data?.productDeleteMedia?.mediaUserErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`Delete product media failed: ${JSON.stringify(errors)}`);
  }
};

const writeCleanupReport = async (
  rows: CleanupRow[],
  reportPaths: string[]
) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(
    EXPORTS_DIR,
    `remove-imported-product-media-images-${timestamp}.csv`
  );

  const lines = [
    [
      "Product ID",
      "Product Name",
      "Handle",
      "Image ID",
      "Image Src",
      "Applied",
      "Error",
      "Source Apply Reports",
    ]
      .map(csvEscape)
      .join(","),
    ...rows.map((row) =>
      [
        row.productId,
        row.title,
        row.handle,
        row.imageId,
        row.imageSrc,
        row.applied,
        row.error,
        reportPaths.join(" | "),
      ]
        .map(csvEscape)
        .join(",")
    ),
  ];

  await fs.promises.writeFile(outputPath, lines.join("\n"), "utf8");
  return outputPath;
};

const main = async () => {
  const reportPaths = await findApplyReports();
  const importedProducts = await loadImportedProductsFromReports(reportPaths);
  const cleanupRows: CleanupRow[] = [];

  for (const imported of importedProducts) {
    const product = await fetchProductTitleAndHandle(imported.productId);
    const images = await fetchProductMediaImages(imported.productId);
    await sleep(600);
    for (const image of images) {
      let error: string | null = null;
      if (APPLY_CHANGES) {
        try {
          await deleteProductImage(imported.productId, image.id);
          await sleep(600);
        } catch (deleteError) {
          error =
            deleteError instanceof Error ? deleteError.message : String(deleteError);
        }
      }

      cleanupRows.push({
        productId: imported.productId,
        title: imported.title || product.title,
        handle: imported.handle || product.handle,
        imageId: image.id,
        imageSrc: image.imageSrc,
        applied: APPLY_CHANGES && !error,
        error,
      });
    }
  }

  const outputPath = await writeCleanupReport(cleanupRows, reportPaths);
  const deletedCount = cleanupRows.filter((row) => row.applied).length;
  const errorCount = cleanupRows.filter((row) => row.error).length;

  console.log(`Source apply reports: ${reportPaths.join(", ")}`);
  console.log(`Imported products scanned: ${importedProducts.length}`);
  console.log(`Product media images found: ${cleanupRows.length}`);
  console.log(`Deleted product media images: ${deletedCount}`);
  console.log(`Delete errors: ${errorCount}`);
  console.log(`Cleanup CSV: ${outputPath}`);
  if (!APPLY_CHANGES) {
    console.log("Dry run complete. Re-run with --apply to delete product media images.");
  }
};

main().catch((error) => {
  console.error("Remove imported product media images failed:", error);
  process.exitCode = 1;
});
