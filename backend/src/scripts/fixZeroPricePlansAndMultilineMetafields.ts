import "../config/env";
import fs from "fs";
import path from "path";
import { shopifyGraphQL } from "../services/shopifyHttp";

const APPLY_CHANGES = process.argv.includes("--apply");
const PRODUCT_GID_PREFIX = "gid://shopify/Product/";
const TARGET_KEYS = ["plans_pricing", "product_features", "pros_cons"] as const;
const TARGET_LINE_OLD =
  "- Pricing is not publicly available. Shopify price is set to 0 for this listing.";
const TARGET_LINE_OLD_NO_BULLET =
  "Pricing is not publicly available. Shopify price is set to 0 for this listing.";
const TARGET_LINE_NEW = 'To visit product official website click "Get Now".';
const MULTILINE_SEPARATOR = "\r\n";
const EXPORTS_DIR = path.resolve(__dirname, "../../exports");

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

const REPORT_PREFIX = getCliArgValue("--report-prefix");

type TargetKey = (typeof TARGET_KEYS)[number];

type ApplyReportRow = {
  status?: string;
  shopifyProductId?: number | string | null;
};

type ShopifyProductNode = {
  id: string;
  legacyResourceId: string;
  title: string;
  handle: string;
  variants?: {
    nodes?: Array<{
      price?: string | null;
    }>;
  };
  plansPricing?: {
    value?: string | null;
    type?: string | null;
  } | null;
  productFeatures?: {
    value?: string | null;
    type?: string | null;
  } | null;
  prosCons?: {
    value?: string | null;
    type?: string | null;
  } | null;
};

type ProductChange = {
  productId: string;
  legacyResourceId: string;
  title: string;
  handle: string;
  isZeroPriced: boolean;
  changes: Array<{
    key: TargetKey;
    oldValue: string;
    newValue: string;
  }>;
};

const normalizeNewlines = (value: string) =>
  value
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

const splitLines = (value: string) =>
  normalizeNewlines(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const rebuildMultiline = (lines: string[]) => lines.join(MULTILINE_SEPARATOR);

const normalizeMetafieldValue = (
  key: TargetKey,
  value: string,
  isZeroPriced: boolean
) => {
  const lines = splitLines(value);

  let updatedLines = [...lines];
  if (key === "plans_pricing" && isZeroPriced) {
    updatedLines = updatedLines.filter(
      (line) =>
        line !== TARGET_LINE_OLD &&
        line !== TARGET_LINE_OLD_NO_BULLET &&
        line !== `- ${TARGET_LINE_NEW}` &&
        line !== TARGET_LINE_NEW
    );
    updatedLines.push(TARGET_LINE_NEW);
  }

  if (key === "plans_pricing" && !isZeroPriced) {
    updatedLines = updatedLines.filter(
      (line) =>
        line !== TARGET_LINE_OLD &&
        line !== TARGET_LINE_OLD_NO_BULLET
    );
  }

  return rebuildMultiline(updatedLines);
};

const loadScopedLegacyIds = async () => {
  if (!REPORT_PREFIX) {
    return null;
  }

  const files = await fs.promises.readdir(EXPORTS_DIR);
  const matchingReports = files
    .filter(
      (fileName) =>
        fileName.startsWith(REPORT_PREFIX) && fileName.endsWith(".json")
    )
    .sort();

  if (matchingReports.length === 0) {
    throw new Error(`No apply reports found with prefix ${REPORT_PREFIX}`);
  }

  const ids = new Set<string>();

  for (const fileName of matchingReports) {
    const reportPath = path.join(EXPORTS_DIR, fileName);
    const raw = await fs.promises.readFile(reportPath, "utf8");
    const parsed = JSON.parse(raw) as { rows?: ApplyReportRow[] };
    const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
    for (const row of rows) {
      if (row.status !== "imported") {
        continue;
      }

      const legacyId = String(row.shopifyProductId ?? "").trim();
      if (legacyId) {
        ids.add(legacyId);
      }
    }
  }

  return ids;
};

const parseZeroPrice = (value?: string | null) => {
  if (typeof value !== "string") {
    return false;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric === 0;
};

const fetchAllProducts = async () => {
  const products: ShopifyProductNode[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response: any = await shopifyGraphQL.post("", {
      query: `
        query ProductsForMetafieldFix($first: Int!, $after: String) {
          products(first: $first, after: $after, sortKey: ID) {
            nodes {
              id
              legacyResourceId
              title
              handle
              variants(first: 1) {
                nodes {
                  price
                }
              }
              plansPricing: metafield(namespace: "custom", key: "plans_pricing") {
                value
                type
              }
              productFeatures: metafield(namespace: "custom", key: "product_features") {
                value
                type
              }
              prosCons: metafield(namespace: "custom", key: "pros_cons") {
                value
                type
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      variables: {
        first: 100,
        after: cursor,
      },
    });

    const errors = response.data?.errors ?? [];
    if (errors.length > 0) {
      throw new Error(JSON.stringify(errors));
    }

    const connection: any = response.data?.data?.products;
    const nodes = Array.isArray(connection?.nodes)
      ? (connection.nodes as ShopifyProductNode[])
      : [];
    products.push(...nodes);

    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage);
    cursor = connection?.pageInfo?.endCursor ?? null;
  }

  return products;
};

const collectChanges = (
  products: ShopifyProductNode[],
  scopedLegacyIds: Set<string> | null
) => {
  const changes: ProductChange[] = [];

  for (const product of products) {
    if (
      scopedLegacyIds !== null &&
      !scopedLegacyIds.has(String(product.legacyResourceId ?? "").trim())
    ) {
      continue;
    }

    const isZeroPriced = parseZeroPrice(product.variants?.nodes?.[0]?.price);
    const productChanges: ProductChange["changes"] = [];

    const valuesByKey: Record<TargetKey, string> = {
      plans_pricing: String(product.plansPricing?.value ?? ""),
      product_features: String(product.productFeatures?.value ?? ""),
      pros_cons: String(product.prosCons?.value ?? ""),
    };

    for (const key of TARGET_KEYS) {
      const oldValue = valuesByKey[key];
      if (!oldValue) {
        continue;
      }

      const newValue = normalizeMetafieldValue(key, oldValue, isZeroPriced);
      if (newValue !== oldValue) {
        productChanges.push({
          key,
          oldValue,
          newValue,
        });
      }
    }

    if (productChanges.length > 0) {
      changes.push({
        productId: product.id,
        legacyResourceId: String(product.legacyResourceId ?? "").trim(),
        title: String(product.title ?? ""),
        handle: String(product.handle ?? ""),
        isZeroPriced,
        changes: productChanges,
      });
    }
  }

  return changes;
};

const applyChanges = async (changes: ProductChange[]) => {
  for (const change of changes) {
    const metafields = change.changes.map((item) => ({
      ownerId: change.productId,
      namespace: "custom",
      key: item.key,
      type: "multi_line_text_field",
      value: item.newValue,
    }));

    const response = await shopifyGraphQL.post("", {
      query: `
        mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            userErrors {
              field
              message
            }
          }
        }
      `,
      variables: {
        metafields,
      },
    });

    const errors = response.data?.data?.metafieldsSet?.userErrors ?? [];
    if (errors.length > 0) {
      throw new Error(
        `Metafield update failed for ${change.handle || change.title}: ${JSON.stringify(errors)}`
      );
    }
  }
};

const main = async () => {
  const scopedLegacyIds = await loadScopedLegacyIds();
  const products = await fetchAllProducts();
  const changes = collectChanges(products, scopedLegacyIds);
  const zeroPricePlansCount = changes.filter(
    (change) =>
      change.isZeroPriced &&
      change.changes.some((item) => item.key === "plans_pricing")
  ).length;

  console.log(`Products scanned: ${products.length}`);
  if (scopedLegacyIds !== null) {
    console.log(`Scoped imported products: ${scopedLegacyIds.size}`);
  }
  console.log(`Products needing updates: ${changes.length}`);
  console.log(`Zero-price plans_pricing updates: ${zeroPricePlansCount}`);
  console.log(
    `Metafield updates queued: ${changes.reduce(
      (sum, change) => sum + change.changes.length,
      0
    )}`
  );

  if (!APPLY_CHANGES) {
    console.log("Dry run complete. Re-run with --apply to update Shopify metafields.");
    return;
  }

  await applyChanges(changes);
  console.log("Shopify multiline metafield fix applied successfully.");
};

main().catch((error) => {
  console.error("Fix zero price plans and multiline metafields failed:", error);
  process.exitCode = 1;
});
