import "../config/env";
import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { shopifyGraphQL, shopifyRest } from "../services/shopifyHttp";

const SHOPIFY_PAGE_LIMIT = 250;
const SHOPIFY_GRAPHQL_PAGE_SIZE = 100;
const EXPORTS_DIR = path.join(__dirname, "../../exports");
const CSV_FILE_PATH = path.join(
  __dirname,
  "../../imports/category-collections.csv"
);

type CsvRow = {
  top_category?: string;
  subcategory?: string;
  final_category?: string;
  collection_title?: string;
  collection_handle?: string;
};

type ShopifyCollection = {
  id: number;
  title?: string;
  handle?: string | null;
  sort_order?: string;
  published_at?: string | null;
  updated_at?: string | null;
};

type ShopifyCollectionSummary = {
  id: number;
  title: string;
  handle: string | null;
  type: "custom" | "smart";
  published: boolean;
  updatedAt: string | null;
  collectionUrl: string | null;
};

type ShopifyCollectionCountNode = {
  legacyResourceId?: string | number | null;
  productsCount?: {
    count?: number | null;
    precision?: string | null;
  } | null;
};

type ReportRow = {
  topCategory: string;
  parentCategory: string;
  finalCategory: string;
  collectionName: string;
  collectionHandle: string;
  collectionType: "custom" | "smart" | "missing";
  liveCollectionFound: boolean;
  productCount: number;
  productCountPrecision: string | null;
  published: boolean;
  updatedAt: string | null;
  collectionUrl: string | null;
};

const normalizeWhitespace = (value: string | null | undefined) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeCollectionKey = (
  value: string | null | undefined
) => normalizeWhitespace(value).toLowerCase();

const csvEscape = (
  value: string | number | boolean | null | undefined
) => {
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

const fetchAllShopifyResources = async <T>(
  resourcePath: string,
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
    } = await shopifyRest.get(resourcePath, { params });

    const pageItems = Array.isArray(response.data?.[responseKey])
      ? response.data[responseKey]
      : [];

    results.push(...pageItems);
    pageInfo = extractNextPageInfo(response.headers.link);
  } while (pageInfo);

  return results;
};

const getStoreDomain = () =>
  normalizeWhitespace(process.env.SHOPIFY_STORE_DOMAIN) ||
  "www.itmart24.com";

const fetchAllShopifyCollectionsSummary = async () => {
  const [customCollections, smartCollections] = await Promise.all([
    fetchAllShopifyResources<ShopifyCollection>(
      "/custom_collections.json",
      "custom_collections"
    ),
    fetchAllShopifyResources<ShopifyCollection>(
      "/smart_collections.json",
      "smart_collections"
    ),
  ]);

  const storeDomain = getStoreDomain();

  return [
    ...customCollections.map((collection) => ({
      id: collection.id,
      title: normalizeWhitespace(collection.title) || "Untitled Collection",
      handle: normalizeWhitespace(collection.handle) || null,
      type: "custom" as const,
      published: Boolean(collection.published_at),
      updatedAt: collection.updated_at ?? null,
      collectionUrl: collection.handle
        ? `https://${storeDomain}/collections/${collection.handle}`
        : null,
    })),
    ...smartCollections.map((collection) => ({
      id: collection.id,
      title: normalizeWhitespace(collection.title) || "Untitled Collection",
      handle: normalizeWhitespace(collection.handle) || null,
      type: "smart" as const,
      published: Boolean(collection.published_at),
      updatedAt: collection.updated_at ?? null,
      collectionUrl: collection.handle
        ? `https://${storeDomain}/collections/${collection.handle}`
        : null,
    })),
  ] satisfies ShopifyCollectionSummary[];
};

const fetchAllShopifyCollectionCounts = async () => {
  const counts = new Map<
    number,
    { productCount: number; precision: string | null }
  >();
  let cursor: string | null = null;
  let hasNextPage = true;

  const query = `
    query ShopifyCollectionCounts($first: Int!, $after: String) {
      collections(first: $first, after: $after) {
        nodes {
          legacyResourceId
          productsCount {
            count
            precision
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  while (hasNextPage) {
    const response: {
      data?: {
        data?: {
          collections?: {
            nodes?: ShopifyCollectionCountNode[];
            pageInfo?: {
              hasNextPage?: boolean;
              endCursor?: string | null;
            };
          };
        };
        errors?: Array<{ message?: string }>;
      };
    } = await shopifyGraphQL.post("", {
      query,
      variables: {
        first: SHOPIFY_GRAPHQL_PAGE_SIZE,
        after: cursor,
      },
    });

    if (response.data?.errors?.length) {
      const message = response.data.errors
        .map((error) => normalizeWhitespace(error.message))
        .filter(Boolean)
        .join(", ");
      throw new Error(
        message || "Failed to load Shopify collection counts"
      );
    }

    const collectionsConnection = response.data?.data?.collections;
    const pageCollections = Array.isArray(collectionsConnection?.nodes)
      ? collectionsConnection.nodes
      : [];

    pageCollections.forEach((collection) => {
      const collectionId = Number(collection.legacyResourceId);

      if (Number.isNaN(collectionId)) {
        return;
      }

      counts.set(collectionId, {
        productCount: Number(collection.productsCount?.count ?? 0),
        precision: collection.productsCount?.precision ?? null,
      });
    });

    hasNextPage = Boolean(collectionsConnection?.pageInfo?.hasNextPage);
    cursor = collectionsConnection?.pageInfo?.endCursor ?? null;
  }

  return counts;
};

const readCsvRows = async () =>
  new Promise<CsvRow[]>((resolve, reject) => {
    const rows: CsvRow[] = [];

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
        rows.push(row);
      })
      .on("end", () => resolve(rows))
      .on("error", reject);
  });

const buildReportRows = async () => {
  const [csvRows, liveCollections, collectionCounts] = await Promise.all([
    readCsvRows(),
    fetchAllShopifyCollectionsSummary(),
    fetchAllShopifyCollectionCounts(),
  ]);

  const liveCollectionsByHandle = new Map<string, ShopifyCollectionSummary>();

  liveCollections.forEach((collection) => {
    const handleKey = normalizeCollectionKey(collection.handle);

    if (handleKey) {
      liveCollectionsByHandle.set(handleKey, collection);
    }
  });

  return csvRows
    .map((row) => {
      const topCategory = normalizeWhitespace(row.top_category);
      const parentCategory = normalizeWhitespace(row.subcategory);
      const finalCategory = normalizeWhitespace(row.final_category);
      const collectionName =
        normalizeWhitespace(row.collection_title) || finalCategory;
      const collectionHandle = normalizeWhitespace(
        row.collection_handle
      );

      if (!collectionHandle || !collectionName) {
        return null;
      }

      const liveCollection = liveCollectionsByHandle.get(
        normalizeCollectionKey(collectionHandle)
      );

      return {
        topCategory,
        parentCategory,
        finalCategory,
        collectionName,
        collectionHandle,
        collectionType: liveCollection?.type ?? "missing",
        liveCollectionFound: Boolean(liveCollection),
        productCount: liveCollection
          ? collectionCounts.get(liveCollection.id)?.productCount ?? 0
          : 0,
        productCountPrecision: liveCollection
          ? collectionCounts.get(liveCollection.id)?.precision ?? null
          : null,
        published: liveCollection?.published ?? false,
        updatedAt: liveCollection?.updatedAt ?? null,
        collectionUrl: liveCollection?.collectionUrl ?? null,
      } satisfies ReportRow;
    })
    .filter((row): row is ReportRow => Boolean(row))
    .sort((left, right) => {
      if (right.productCount !== left.productCount) {
        return right.productCount - left.productCount;
      }

      return left.collectionName.localeCompare(right.collectionName);
    });
};

const writeReportFiles = async (rows: ReportRow[]) => {
  await fs.promises.mkdir(EXPORTS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = `category-collection-product-counts-${timestamp}`;
  const csvPath = path.join(EXPORTS_DIR, `${baseName}.csv`);
  const jsonPath = path.join(EXPORTS_DIR, `${baseName}.json`);

  const csvLines = [
    [
      "top_category",
      "parent_category",
      "final_category",
      "collection_name",
      "collection_handle",
      "collection_type",
      "live_collection_found",
      "product_count",
      "product_count_precision",
      "published",
      "updated_at",
      "collection_url",
    ]
      .map((value) => csvEscape(value))
      .join(","),
    ...rows.map((row) =>
      [
        row.topCategory,
        row.parentCategory,
        row.finalCategory,
        row.collectionName,
        row.collectionHandle,
        row.collectionType,
        row.liveCollectionFound,
        row.productCount,
        row.productCountPrecision,
        row.published,
        row.updatedAt,
        row.collectionUrl,
      ]
        .map((value) => csvEscape(value))
        .join(",")
    ),
  ].join("\n");

  const summary = {
    generatedAt: new Date().toISOString(),
    rowCount: rows.length,
    collectionsWithProducts: rows.filter((row) => row.productCount > 0)
      .length,
    missingCollections: rows.filter((row) => !row.liveCollectionFound)
      .length,
  };

  await Promise.all([
    fs.promises.writeFile(csvPath, csvLines, "utf8"),
    fs.promises.writeFile(
      jsonPath,
      JSON.stringify({ summary, rows }, null, 2),
      "utf8"
    ),
  ]);

  return { csvPath, jsonPath, summary };
};

const main = async () => {
  const rows = await buildReportRows();
  const reportPaths = await writeReportFiles(rows);

  console.log(`Category collection CSV report: ${reportPaths.csvPath}`);
  console.log(`Category collection JSON report: ${reportPaths.jsonPath}`);
  console.log(
    `Rows: ${reportPaths.summary.rowCount}, With products: ${reportPaths.summary.collectionsWithProducts}, Missing collections: ${reportPaths.summary.missingCollections}`
  );
};

main().catch((error) => {
  console.error("Category collection report failed:", error);
  process.exitCode = 1;
});
