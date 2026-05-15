import "../config/env";
import fs from "fs";
import path from "path";
import csv = require("csv-parser");
import { shopifyGraphQL, shopifyRest } from "../services/shopifyHttp";

const PRODUCT_GID = (productId: number) => `gid://shopify/Product/${productId}`;
const CATEGORY_CSV_PATH = path.resolve(__dirname, "../../imports/category-collections.csv");
const FILTERS_CSV_PATH = path.resolve(
  __dirname,
  "../../doc/shopify-filter-definitions.csv"
);
const EXPORTS_DIR = path.resolve(__dirname, "../../exports");
const MULTILINE_SEPARATOR = "\r\n";
const SHOPIFY_GRAPHQL_PAGE_SIZE = 50;
const INMOTION_VENDOR = "InMotion Hosting";
const INMOTION_LOGO_URL =
  "https://cdn.shopify.com/s/files/1/0770/5192/0623/files/inmotion-hosting.svg";

type CsvRow = Record<string, string>;

type ShopifyMetafieldRecord = {
  namespace?: string;
  key?: string;
  type?: string;
  value?: string;
};

type ShopifyVariantRecord = {
  id: number;
  price?: string | null;
  taxable?: boolean | null;
  requires_shipping?: boolean | null;
  inventory_management?: string | null;
};

type ShopifyProductRecord = {
  id: number;
  title: string;
  handle: string;
  vendor: string;
  status: string;
  body_html?: string | null;
  product_type?: string | null;
  variants?: ShopifyVariantRecord[];
  metafields_global_title_tag?: string | null;
  metafields_global_description_tag?: string | null;
};

type CurrentProductState = {
  product: ShopifyProductRecord | null;
  metafieldMap: Map<string, ShopifyMetafieldRecord>;
  typeMultiple: string[];
  officialUrl: string | null;
  logoUrl: string | null;
};

type FilterDefinition = {
  key: string;
  allowedValues: string[];
};

type MarketplaceFilterReferenceMap = Record<
  string,
  {
    type: string;
    byLabel: Record<string, string>;
  }
>;

type MatchType = "product_id" | "handle" | "title_url" | "title" | "created";

type FeatureGroup = {
  heading: string;
  items: string[];
};

type ProductSpec = {
  title: string;
  preferredProductId?: number;
  handle: string;
  vendor: string;
  officialUrl: string;
  price: string;
  productType: string;
  bodyCategory: string;
  categoryHints: string[];
  filters: Record<string, string[]>;
  seoTitle: string;
  seoDescription: string;
  audience: string;
  introTheme: string;
  useCases: string[];
  pricingNotes: string[];
  featureGroups: FeatureGroup[];
  factualPros: string[];
  factualCons: string[];
  buyerConsiderations: string[];
  productCategoryLabel: string;
  assumptionNotes: string[];
};

type SummaryRow = {
  title: string;
  requestedProductId: number | null;
  finalProductId: number | null;
  matchedBy: MatchType;
  priceUsed: string;
  seoUpdated: boolean;
  metafieldsUpdated: string[];
  logoAction: "skipped_logo_existing" | "logo_uploaded";
  finalStatus:
    | "updated_existing_product"
    | "created_missing_product"
    | "skipped_existing_current_job"
    | "skipped_missing_required_data"
    | "skipped_pricing_unavailable"
    | "updated_type_multiple"
    | "failed";
  assumptionNotes: string[];
  error: string | null;
};

type DeletedProductRow = {
  productId: number;
  title: string;
  handle: string;
  reason: "deleted_non_matching_existing_product" | "deleted_duplicate_exact_match";
};

type VpsPlanSeed = {
  title: string;
  planName: string;
  preferredProductId?: number;
  officialUrl: string;
  price: string;
  recommendedPrice: string;
  renewalPrice: string;
  termPrices: string[];
  vcpu: string;
  ram: string;
  storage: string;
  bandwidth: string;
  dedicatedIps: string;
  extraFeatures?: string[];
  performanceTier: "Standard" | "Premium";
};

type ManagedDedicatedSeed = {
  title: string;
  planName: string;
  officialUrl: string;
  price: string;
  headlinePrice: string;
  renewalPrice: string;
  termPrices: string[];
  cpu: string;
  threads: string;
  ram: string;
  storage: string;
  bandwidth: string;
  dedicatedIps: string;
  extraFeatures?: string[];
  supportFeatures?: string[];
  performanceTier: "Standard" | "Premium" | "Enterprise";
};

type DedicatedSeed = {
  title: string;
  planName: string;
  officialUrl: string;
  price: string;
  headlinePrice: string;
  renewalPrice: string;
  termPrices: string[];
  cpu: string;
  threads: string;
  ram: string;
  storage: string;
  bandwidth: string;
  dedicatedIps: string;
  extraFeatures?: string[];
  categoryHints: string[];
  productCategoryLabel: string;
  performanceTier: "Standard" | "Premium" | "Enterprise";
};

type EcoSeed = {
  title: string;
  planName: string;
  officialUrl: string;
  price: string;
  actualPrice: string;
  cpu: string;
  cores: string;
  threads: string;
  ram: string;
  storage: string;
  bandwidth: string;
};

type WordPressSeed = {
  title: string;
  planName: string;
  officialUrl: string;
  price: string;
  renewalPrice: string;
  websites: string;
  storage: string;
  bandwidth: string;
  phpWorkers: string;
  performanceClaim: string;
  support: string;
  extraFeatures: string[];
  performanceTier: "Standard" | "Premium";
};

type UltraStackSeed = {
  title: string;
  planName: string;
  officialUrl: string;
  price: string;
  monthlyPrice: string;
  renewalPrice: string;
  vcpu: string;
  ram: string;
  storage: string;
  phpWorkers: string;
  redis: string;
  extraFeatures: string[];
  performanceTier: "Premium" | "Enterprise";
  supportValues: string[];
};

type ResellerSeed = {
  title: string;
  planName: string;
  preferredProductId?: number;
  officialUrl: string;
  price: string;
  promoPrice: string;
  altPrice: string;
  renewalPrice: string;
  storage: string;
  bandwidth: string;
  licenses: string;
  dedicatedIps: string;
  extraFeatures: string[];
  support: string;
  performanceTier: "Standard" | "Premium";
};

const normalizeText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const dedupe = <T>(values: T[]) => Array.from(new Set(values));

const ensureDir = async (dirPath: string) => {
  await fs.promises.mkdir(dirPath, { recursive: true });
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const parseListMetafieldValue = (value: string | undefined) => {
  const trimmed = normalizeText(value);
  if (!trimmed) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => normalizeText(item)).filter(Boolean);
    }
  } catch {
    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const normalizeComparisonText = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const normalizeUrlForCompare = (value: string | null | undefined) => {
  const raw = normalizeText(value);
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    return `${url.hostname}${url.pathname}`.replace(/\/+$/, "").toLowerCase();
  } catch {
    return raw.toLowerCase().replace(/\/+$/, "");
  }
};

const getWordCount = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean).length;

const priceBand = (value: string) => {
  const price = Number(value.replace(/,/g, ""));
  if (Number.isNaN(price) || price <= 0) {
    return "Free";
  }
  if (price < 10) {
    return "Under $10/month";
  }
  if (price <= 50) {
    return "$10-$50/month";
  }
  if (price <= 200) {
    return "$51-$200/month";
  }
  if (price <= 500) {
    return "$201-$500/month";
  }
  return "Over $500/month";
};

const buildPlainTextSection = (heading: string, items: string[]) => {
  const normalizedItems = dedupe(items.map((item) => normalizeText(item)).filter(Boolean));
  if (normalizedItems.length === 0) {
    return "";
  }

  return [heading, ...normalizedItems.map((item) => `- ${item}`)].join(MULTILINE_SEPARATOR);
};

const htmlList = (items: string[]) =>
  `<ul>${dedupe(items).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;

const htmlSection = (heading: string, items: string[]) =>
  items.length === 0 ? "" : `<h3>${escapeHtml(heading)}</h3>${htmlList(items)}`;

const buildPlansPricing = (spec: ProductSpec) =>
  buildPlainTextSection("Pricing", spec.pricingNotes);

const buildProductFeatures = (spec: ProductSpec) =>
  spec.featureGroups
    .map((group) => buildPlainTextSection(group.heading, group.items))
    .filter(Boolean)
    .join(MULTILINE_SEPARATOR);

const buildProsCons = (spec: ProductSpec) =>
  [
    buildPlainTextSection("Pros", spec.factualPros),
    buildPlainTextSection("Cons", spec.factualCons),
  ]
    .filter(Boolean)
    .join(MULTILINE_SEPARATOR);

const buildBodyHtml = (spec: ProductSpec) => {
  const featuresHtml = spec.featureGroups
    .map((group) => htmlSection(group.heading, group.items))
    .join("");
  const useCasesHtml = htmlList(spec.useCases);
  const pricingHtml = htmlList(spec.pricingNotes);
  const considerationsHtml = htmlList(spec.buyerConsiderations);

  const html = [
    `<h2>${escapeHtml(spec.title)}</h2>`,
    `<p>${escapeHtml(
      `${spec.title} is ${spec.introTheme}. The focus here is on the details that matter when choosing a plan: resources, pricing, renewal terms, support coverage, and the kind of workload the package is built to handle.`
    )}</p>`,
    `<p>${escapeHtml(
      `It is a strong fit for ${spec.audience}. A quick headline price rarely tells the full story, so the description takes a closer look at what is included, where the plan fits best, and which limits or billing details deserve attention before you commit.`
    )}</p>`,
    `<h3>What This Plan Covers</h3>`,
    `<p>${escapeHtml(
      `This plan sits in the ${spec.bodyCategory} space. That distinction matters because shared WordPress hosting, managed environments, VPS plans, reseller packages, and dedicated servers all serve very different needs. Clear plan-level details make it easier to judge whether the service matches your budget, technical requirements, and growth plans.`
    )}</p>`,
    `<p>${escapeHtml(
      `For customers evaluating ${spec.title}, the strongest practical scenarios usually look like the following. The goal is to keep the copy specific and useful, with enough detail to support a real buying decision without drifting into vague claims or filler language.`
    )}</p>`,
    useCasesHtml,
    `<h3>Features And Practical Fit</h3>`,
    `<p>${escapeHtml(
      `The value of a hosting product often comes from the details that are easiest to miss in a short plan table. Resource allocations, support inclusions, onboarding help, data-center choice, PHP worker counts, dedicated IP availability, cache resources, backup storage, or billing structure can all materially change whether a plan is a good fit. The feature sections below keep those decision points visible in a cleaner format.`
    )}</p>`,
    featuresHtml,
    `<h3>Pricing And Renewal Notes</h3>`,
    `<p>${escapeHtml(
      `The starting price highlights the lowest visible paid option for the exact plan, but that number should be read alongside the term and renewal notes. Some plans have a wider gap between shorter-term pricing and longer commitments, while others are much more straightforward. Keeping those details visible helps buyers compare the real cost more confidently.`
    )}</p>`,
    pricingHtml,
    `<h3>Buyer Considerations</h3>`,
    `<p>${escapeHtml(
      `A good plan description should be just as clear about tradeoffs as it is about strengths. The lowest rate may depend on a longer term, higher tiers may include the extras some teams need, and the right plan size depends heavily on the workload. These points are worth weighing before you decide.`
    )}</p>`,
    considerationsHtml,
    `<p>${escapeHtml(
      `Overall, ${spec.title} gives buyers a clearer way to evaluate ${spec.productCategoryLabel.toLowerCase()} options without losing sight of practical details like performance headroom, pricing structure, and long-term fit.`
    )}</p>`,
  ].join("");

  if (getWordCount(html) < 300) {
    throw new Error(`Body HTML for ${spec.title} did not reach 300 words`);
  }

  return html;
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

const buildAllowedTypeValues = async () => {
  const rows = await readCsv(CATEGORY_CSV_PATH);
  const values = new Set<string>();

  rows.forEach((row) => {
    [row.top_category, row.subcategory, row.final_category, row.collection_title]
      .map((value) => normalizeText(value))
      .filter(Boolean)
      .forEach((value) => values.add(value));
  });

  return values;
};

const buildCloudFilterDefinitions = async () => {
  const rows = await readCsv(FILTERS_CSV_PATH);
  const definitions = new Map<string, FilterDefinition>();

  rows
    .filter((row) => normalizeText(row.category_slug) === "cloud-services")
    .forEach((row) => {
      const key = normalizeText(row.metafield_key);
      if (!key) {
        return;
      }

      const allowedValues = normalizeText(row.allowed_values)
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean);

      definitions.set(key, {
        key,
        allowedValues,
      });
    });

  return definitions;
};

const validateFilterValues = (
  spec: ProductSpec,
  filterDefinitions: Map<string, FilterDefinition>
) => {
  const validFilters: Record<string, string[]> = {};

  Object.entries(spec.filters).forEach(([key, values]) => {
    const definition = filterDefinitions.get(key);
    if (!definition) {
      return;
    }

    const allowed = dedupe(values.filter((value) => definition.allowedValues.includes(value)));
    if (allowed.length > 0) {
      validFilters[key] = allowed;
    }
  });

  return validFilters;
};

const buildMarketplaceFilterReferenceMap = async (keys: string[]) => {
  const definitionsResponse = await shopifyGraphQL.post("", {
    query: `
      query MarketplaceMetafieldDefinitions {
        metafieldDefinitions(first: 50, ownerType: PRODUCT, namespace: "marketplace") {
          nodes {
            key
            namespace
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

  const definitions = Array.isArray(
    definitionsResponse.data?.data?.metafieldDefinitions?.nodes
  )
    ? definitionsResponse.data.data.metafieldDefinitions.nodes
    : [];
  const map: MarketplaceFilterReferenceMap = {};

  for (const key of keys) {
    const definition = definitions.find((row: any) => normalizeText(row?.key) === key);
    if (!definition) {
      continue;
    }

    const metaobjectDefinitionId = Array.isArray(definition.validations)
      ? definition.validations.find((validation: any) => validation?.name === "metaobject_definition_id")
          ?.value ?? null
      : null;

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

const fetchProductStateById = async (productId: number): Promise<CurrentProductState | null> => {
  try {
    const [productResponse, metafieldsResponse] = await Promise.all([
      shopifyRest.get(`/products/${productId}.json`),
      shopifyRest.get(`/products/${productId}/metafields.json`),
    ]);

    const product = (productResponse.data?.product ?? null) as ShopifyProductRecord | null;
    if (!product?.id) {
      return null;
    }

    const metafields = Array.isArray(metafieldsResponse.data?.metafields)
      ? (metafieldsResponse.data.metafields as ShopifyMetafieldRecord[])
      : [];

    const metafieldMap = new Map<string, ShopifyMetafieldRecord>();
    metafields.forEach((metafield) => {
      const namespace = normalizeText(metafield.namespace);
      const key = normalizeText(metafield.key);
      if (namespace && key) {
        metafieldMap.set(`${namespace}.${key}`, metafield);
      }
    });

    return {
      product,
      metafieldMap,
      typeMultiple: parseListMetafieldValue(metafieldMap.get("custom.type_multiple")?.value),
      officialUrl: normalizeText(metafieldMap.get("custom.custom")?.value) || null,
      logoUrl: normalizeText(metafieldMap.get("custom.logo_image")?.value) || null,
    };
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return null;
    }
    throw error;
  }
};

const fetchProductStateByHandle = async (
  handle: string
): Promise<CurrentProductState | null> => {
  const response = await shopifyRest.get("/products.json", {
    params: {
      handle,
      limit: 1,
    },
  });

  const product = Array.isArray(response.data?.products)
    ? (response.data.products[0] as ShopifyProductRecord | undefined)
    : undefined;

  if (!product?.id) {
    return null;
  }

  return fetchProductStateById(product.id);
};

const searchProductsByTitle = async (title: string) => {
  const nodes: Array<{ id?: string; title?: string; handle?: string }> = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage && nodes.length < 20) {
    const response: {
      data?: {
        data?: {
          products?: {
            nodes?: Array<{ id?: string; title?: string; handle?: string }>;
            pageInfo?: {
              hasNextPage?: boolean;
              endCursor?: string | null;
            };
          };
        };
      };
    } = await shopifyGraphQL.post("", {
      query: `
        query SearchProductsByTitle($first: Int!, $after: String, $query: String!) {
          products(first: $first, after: $after, query: $query) {
            nodes {
              id
              title
              handle
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
        query: `title:"${title.replace(/"/g, '\\"')}"`,
      },
    });

    const batch = Array.isArray(response.data?.data?.products?.nodes)
      ? response.data.data.products.nodes
      : [];
    nodes.push(...batch);
    hasNextPage = Boolean(response.data?.data?.products?.pageInfo?.hasNextPage);
    cursor = response.data?.data?.products?.pageInfo?.endCursor ?? null;
  }

  return nodes;
};

const extractNumericIdFromGid = (gid: string) => {
  const match = gid.match(/(\d+)$/);
  return match ? Number(match[1]) : null;
};

const resolveProductState = async (
  spec: ProductSpec,
  processedProductIds: Set<number>,
  processedHandles: Set<string>,
  processedTitleUrls: Set<string>
): Promise<
  | {
      state: CurrentProductState | null;
      matchedBy: MatchType;
      duplicateInCurrentJob: boolean;
    }
  | null
> => {
  const normalizedHandle = normalizeText(spec.handle) || slugify(spec.title);
  const normalizedTitle = normalizeComparisonText(spec.title);
  const normalizedTitleUrl = `${normalizedTitle}||${normalizeUrlForCompare(spec.officialUrl)}`;

  const inspectCandidate = async (
    state: CurrentProductState | null,
    matchedBy: Exclude<MatchType, "created">
  ) => {
    if (!state?.product?.id) {
      return null;
    }

    const productId = state.product.id;
    const handle = normalizeText(state.product.handle) || slugify(state.product.title);
    const titleKey = `${normalizeComparisonText(state.product.title)}||${normalizeUrlForCompare(
      state.officialUrl
    )}`;
    const duplicateInCurrentJob =
      processedProductIds.has(productId) ||
      processedHandles.has(handle) ||
      (titleKey.endsWith("||") ? false : processedTitleUrls.has(titleKey));

    return {
      state,
      matchedBy,
      duplicateInCurrentJob,
    };
  };

  if (spec.preferredProductId) {
    const byId = await inspectCandidate(
      await fetchProductStateById(spec.preferredProductId),
      "product_id"
    );
    if (byId) {
      return byId;
    }
  }

  const byHandle = await inspectCandidate(await fetchProductStateByHandle(normalizedHandle), "handle");
  if (byHandle) {
    return byHandle;
  }

  const titleCandidates = await searchProductsByTitle(spec.title);
  const exactTitleMatches = titleCandidates.filter(
    (candidate) => normalizeComparisonText(candidate.title ?? "") === normalizedTitle
  );

  for (const candidate of exactTitleMatches) {
    const numericId = extractNumericIdFromGid(normalizeText(candidate.id));
    if (!numericId) {
      continue;
    }

    const state = await fetchProductStateById(numericId);
    if (
      state?.product?.id &&
      normalizeComparisonText(state.product.title) === normalizedTitle &&
      normalizeUrlForCompare(state.officialUrl) === normalizeUrlForCompare(spec.officialUrl)
    ) {
      return inspectCandidate(state, "title_url");
    }
  }

  const safeTitleOnlyMatches = exactTitleMatches.filter(
    (candidate) => normalizeText(candidate.handle) === normalizedHandle
  );
  if (safeTitleOnlyMatches.length === 1) {
    const numericId = extractNumericIdFromGid(normalizeText(safeTitleOnlyMatches[0].id));
    if (numericId) {
      return inspectCandidate(await fetchProductStateById(numericId), "title");
    }
  }

  return {
    state: null,
    matchedBy: "created",
    duplicateInCurrentJob:
      processedHandles.has(normalizedHandle) || processedTitleUrls.has(normalizedTitleUrl),
  };
};

const fetchPublicationIds = async () => {
  const publicationIds: string[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response: {
      data?: {
        data?: {
          publications?: {
            nodes?: Array<{ id?: string }>;
            pageInfo?: {
              hasNextPage?: boolean;
              endCursor?: string | null;
            };
          };
        };
      };
    } = await shopifyGraphQL.post("", {
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

    const nodes = Array.isArray(response.data?.data?.publications?.nodes)
      ? response.data.data.publications.nodes
      : [];

    nodes.forEach((node) => {
      const id = normalizeText(node?.id);
      if (id) {
        publicationIds.push(id);
      }
    });

    hasNextPage = Boolean(response.data?.data?.publications?.pageInfo?.hasNextPage);
    cursor = response.data?.data?.publications?.pageInfo?.endCursor ?? null;
  }

  return dedupe(publicationIds);
};

let cachedPublicationIdsPromise: Promise<string[]> | null = null;

const publishProduct = async (productId: number) => {
  if (!cachedPublicationIdsPromise) {
    cachedPublicationIdsPromise = fetchPublicationIds();
  }

  const publicationIds = await cachedPublicationIdsPromise;
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

const buildMergedTypeMultiple = (
  hints: string[],
  allowedValues: Set<string>
) =>
  dedupe(hints)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => allowedValues.has(item));

const upsertShopifyProduct = async (
  spec: ProductSpec,
  currentState: CurrentProductState | null,
  bodyHtml: string
) => {
  const handle = currentState?.product?.handle || spec.handle || slugify(spec.title);
  const existingVariant = currentState?.product?.variants?.[0] ?? null;
  const payload = {
    product: {
      ...(currentState?.product?.id ? { id: currentState.product.id } : {}),
      title: currentState?.product?.title || spec.title,
      handle,
      vendor: spec.vendor,
      body_html: bodyHtml,
      status: "active",
      published: true,
      product_type: currentState?.product?.product_type || spec.productType,
      metafields_global_title_tag: spec.seoTitle,
      metafields_global_description_tag: spec.seoDescription,
      variants: [
        existingVariant?.id
          ? {
              id: existingVariant.id,
              price: spec.price,
              taxable: false,
              requires_shipping: false,
              inventory_management: null,
            }
          : {
              option1: "Default Title",
              price: spec.price,
              taxable: false,
              requires_shipping: false,
              inventory_management: null,
            },
      ],
    },
  };

  if (currentState?.product?.id) {
    const response = await shopifyRest.put(`/products/${currentState.product.id}.json`, payload);
    const productId = Number(response.data?.product?.id ?? currentState.product.id);
    await publishProduct(productId);
    return {
      action: "updated_existing_product" as const,
      productId,
    };
  }

  const response = await shopifyRest.post("/products.json", payload);
  const productId = Number(response.data?.product?.id);
  await publishProduct(productId);
  return {
    action: "created_missing_product" as const,
    productId,
  };
};

const setProductMetafields = async (
  productId: number,
  spec: ProductSpec,
  typeMultiple: string[],
  filters: Record<string, string[]>,
  marketplaceFilterReferences: MarketplaceFilterReferenceMap
) => {
  const inputs = [
    {
      namespace: "custom",
      key: "custom",
      type: "url",
      value: spec.officialUrl,
    },
    {
      namespace: "custom",
      key: "logo_image",
      type: "url",
      value: INMOTION_LOGO_URL,
    },
    {
      namespace: "custom",
      key: "type_multiple",
      type: "list.single_line_text_field",
      value: JSON.stringify(typeMultiple),
    },
    {
      namespace: "custom",
      key: "plans_pricing",
      type: "multi_line_text_field",
      value: buildPlansPricing(spec),
    },
    {
      namespace: "custom",
      key: "product_features",
      type: "multi_line_text_field",
      value: buildProductFeatures(spec),
    },
    {
      namespace: "custom",
      key: "pros_cons",
      type: "multi_line_text_field",
      value: buildProsCons(spec),
    },
    ...Object.entries(filters).map(([key, values]) => {
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
    throw new Error(`Metafield update failed: ${JSON.stringify(errors)}`);
  }
};

const fetchVendorProducts = async () => {
  const products: ShopifyProductRecord[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response: {
      data?: {
        data?: {
          products?: {
            nodes?: Array<{ id?: string; title?: string; handle?: string; status?: string; productType?: string; vendor?: string }>;
            pageInfo?: {
              hasNextPage?: boolean;
              endCursor?: string | null;
            };
          };
        };
      };
    } = await shopifyGraphQL.post("", {
      query: `
        query FetchInMotionProducts($first: Int!, $after: String, $query: String!) {
          products(first: $first, after: $after, query: $query) {
            nodes {
              id
              title
              handle
              status
              productType
              vendor
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
        query: `vendor:"${INMOTION_VENDOR}"`,
      },
    });

    const nodes = Array.isArray(response.data?.data?.products?.nodes)
      ? response.data.data.products.nodes
      : [];

    nodes.forEach((node) => {
      const numericId = extractNumericIdFromGid(normalizeText(node.id));
      if (!numericId) {
        return;
      }

      products.push({
        id: numericId,
        title: normalizeText(node.title),
        handle: normalizeText(node.handle),
        status: normalizeText(node.status) || "active",
        product_type: normalizeText(node.productType) || null,
        vendor: normalizeText(node.vendor) || INMOTION_VENDOR,
      });
    });

    hasNextPage = Boolean(response.data?.data?.products?.pageInfo?.hasNextPage);
    cursor = response.data?.data?.products?.pageInfo?.endCursor ?? null;
  }

  return products;
};

const deleteProduct = async (productId: number) => {
  await shopifyRest.delete(`/products/${productId}.json`);
};

const deleteOrphanAndDuplicateProducts = async (targetSpecs: ProductSpec[]) => {
  const vendorProducts = await fetchVendorProducts();
  const byTitle = new Map<string, ShopifyProductRecord[]>();
  vendorProducts.forEach((product) => {
    const key = normalizeComparisonText(product.title);
    const list = byTitle.get(key) ?? [];
    list.push(product);
    byTitle.set(key, list);
  });

  const targetTitleMap = new Map(
    targetSpecs.map((spec) => [normalizeComparisonText(spec.title), spec])
  );
  const targetHandles = new Set(targetSpecs.map((spec) => spec.handle));
  const deletions: DeletedProductRow[] = [];

  for (const product of vendorProducts) {
    const normalizedTitle = normalizeComparisonText(product.title);
    const matchingSpec = targetTitleMap.get(normalizedTitle);

    if (!matchingSpec || !targetHandles.has(product.handle)) {
      await deleteProduct(product.id);
      deletions.push({
        productId: product.id,
        title: product.title,
        handle: product.handle,
        reason: "deleted_non_matching_existing_product",
      });
    }
  }

  for (const spec of targetSpecs) {
    const remaining = (await fetchVendorProducts()).filter(
      (product) =>
        normalizeComparisonText(product.title) === normalizeComparisonText(spec.title) ||
        product.handle === spec.handle
    );

    if (remaining.length <= 1) {
      continue;
    }

    const preferred = spec.preferredProductId
      ? remaining.find((product) => product.id === spec.preferredProductId)
      : remaining.find((product) => product.handle === spec.handle) ?? remaining[0];
    const keepId = preferred?.id;

    for (const product of remaining) {
      if (product.id === keepId) {
        continue;
      }

      await deleteProduct(product.id);
      deletions.push({
        productId: product.id,
        title: product.title,
        handle: product.handle,
        reason: "deleted_duplicate_exact_match",
      });
    }
  }

  return deletions;
};

const csvEscape = (value: unknown) => {
  const text =
    typeof value === "string"
      ? value
      : value === null || value === undefined
        ? ""
        : String(value);

  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
};

const writeSummaryFiles = async (rows: SummaryRow[], deletions: DeletedProductRow[]) => {
  await ensureDir(EXPORTS_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(EXPORTS_DIR, `inmotion-update-summary-${timestamp}.json`);
  const csvPath = path.join(EXPORTS_DIR, `inmotion-update-summary-${timestamp}.csv`);

  const counts = {
    totalSectionBProductsReceived: 10,
    totalSectionCPlansProcessed: TARGET_SPECS.length,
    existingProductsUpdated: rows.filter(
      (row) =>
        row.finalStatus === "updated_existing_product" ||
        row.finalStatus === "updated_type_multiple"
    ).length,
    missingProductsCreated: rows.filter((row) => row.finalStatus === "created_missing_product").length,
    skippedCurrentJobDuplicates: rows.filter((row) => row.finalStatus === "skipped_existing_current_job").length,
    skippedMissingRequiredData: rows.filter((row) => row.finalStatus === "skipped_missing_required_data").length,
    skippedPricingUnavailable: rows.filter((row) => row.finalStatus === "skipped_pricing_unavailable").length,
    logoUploadedCount: rows.filter((row) => row.logoAction === "logo_uploaded").length,
    logoReusedSkippedCount: rows.filter((row) => row.logoAction === "skipped_logo_existing").length,
    deletedExistingProducts: deletions.length,
    failedCount: rows.filter((row) => row.finalStatus === "failed").length,
  };

  await fs.promises.writeFile(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        counts,
        deletedProducts: deletions,
        rows,
      },
      null,
      2
    ),
    "utf8"
  );

  const csvLines = [
    [
      "title",
      "requested_product_id",
      "final_product_id",
      "matched_by",
      "price_used",
      "seo_updated",
      "metafields_updated",
      "logo_action",
      "final_status",
      "assumption_notes",
      "error",
    ].join(","),
    ...rows.map((row) =>
      [
        csvEscape(row.title),
        csvEscape(row.requestedProductId ?? ""),
        csvEscape(row.finalProductId ?? ""),
        csvEscape(row.matchedBy),
        csvEscape(row.priceUsed),
        csvEscape(row.seoUpdated),
        csvEscape(row.metafieldsUpdated.join(" | ")),
        csvEscape(row.logoAction),
        csvEscape(row.finalStatus),
        csvEscape(row.assumptionNotes.join(" | ")),
        csvEscape(row.error ?? ""),
      ].join(",")
    ),
  ];

  await fs.promises.writeFile(csvPath, csvLines.join("\n"), "utf8");
  return { jsonPath, csvPath, counts };
};

const COMMON_SUPPORT_NOTES = [
  "24/7 award winning human support",
  "99.99% uptime and security monitoring",
  "Up to 90-day money-back guarantee",
];

const WORDPRESS_INCLUDED = [
  "Hosting Plus: Python, Node.JS, Ruby and GIT",
  "Free SSL",
  "Malware and DDoS Protection",
  "Web Firewall Application",
  "Native Backups and Migrations",
  "Free Domain value noted at $23 per year",
  "Free cPanel Email Accounts",
  "Professional Email with 30-Day Trial",
];

const ECO_COMMON = [
  "Sustainable Hosting: every server keeps valuable hardware out of landfills",
  "Reliable performance with tested and optimized hardware",
  "Cost-effective hardware for value and efficiency",
  "Enterprise features include security, backups, and 24/7 support options",
];

const buildVpsSpec = (seed: VpsPlanSeed): ProductSpec => ({
  title: seed.title,
  handle: slugify(seed.title),
  vendor: INMOTION_VENDOR,
  preferredProductId: seed.preferredProductId,
  officialUrl: seed.officialUrl,
  price: seed.price,
  productType: "VPS Hosting",
  bodyCategory: "managed VPS hosting with named virtual CPU, RAM, storage, and bandwidth allocations",
  categoryHints: ["Cloud Services", "VPS Hosting", "Managed VPS Hosting", "NVMe VPS"],
  filters: {
    hosting_type: ["VPS"],
    pricing_model: ["Subscription"],
    price_band: [priceBand(seed.price)],
    billing_cycle: ["Monthly", "Annual"],
    performance_tier: [seed.performanceTier],
    support_coverage: ["24/7 support", "Migration / onboarding help"],
    target_segment: ["Small business", "Developers", "Mid-market"],
  },
  seoTitle: `${seed.title} InMotion Hosting VPS Hosting`,
  seoDescription: `${seed.title} includes ${seed.vcpu}, ${seed.ram}, ${seed.storage}, ${seed.dedicatedIps}, and InMotion VPS pricing from $${seed.price} per month.`,
  audience:
    "developers, growing businesses, and store owners that need more dedicated resources and control than standard shared hosting provides",
  introTheme:
    `an exact InMotion VPS plan listing for the ${seed.planName} configuration, where the buying decision depends on resource allocations, term pricing, renewal cost, and onboarding value rather than generic VPS copy`,
  useCases: [
    "running business applications or stores that need dedicated virtual resources",
    "moving beyond entry shared hosting into a plan with clearer RAM, storage, and IP allocations",
    "comparing shorter billing terms against the lower long-term VPS rate before purchase",
  ],
  pricingNotes: [
    `${seed.planName} is listed at a recommended price of $${seed.recommendedPrice} per month.`,
    `${seed.planName} renews at $${seed.renewalPrice} per month.`,
    ...seed.termPrices.map((entry) => `${seed.planName} ${entry}`),
  ],
  featureGroups: [
    {
      heading: "Core Features",
      items: [
        seed.vcpu,
        seed.ram,
        seed.storage,
        seed.bandwidth,
        seed.dedicatedIps,
      ],
    },
    {
      heading: "Onboarding And Platform",
      items: [
        "Launch Assist onboarding and server setup noted as a $199 one-time value",
        ...(seed.extraFeatures ?? []),
      ],
    },
    {
      heading: "Support And Service Notes",
      items: COMMON_SUPPORT_NOTES,
    },
  ],
  factualPros: [
    "CPU, RAM, storage, bandwidth, and IP allocations are clearly laid out, which makes the plan easier to judge at a glance.",
    "Multiple billing terms are visible instead of only one headline figure.",
    "Launch Assist gives the plan a practical onboarding advantage for buyers moving onto VPS infrastructure.",
  ],
  factualCons: [
    "The renewal price is higher than the lowest long-term billed amount.",
    "The best visible price depends on a longer commitment rather than the shortest term.",
    "Higher plans in the same family may be a better fit if you need more RAM, storage, or IPs.",
  ],
  buyerConsiderations: [
    "Use the term-by-term price ladder, not just the lowest figure, when comparing total cost.",
    "If you expect heavier growth, the larger VPS plans expand both memory and storage further.",
    "This is a VPS product, so it is a stronger fit for buyers who need more resource clarity than a shared hosting plan can offer.",
  ],
  productCategoryLabel: "Managed VPS Hosting",
  assumptionNotes: [],
});

const buildManagedDedicatedSpec = (seed: ManagedDedicatedSeed): ProductSpec => ({
  title: seed.title,
  handle: slugify(seed.title),
  vendor: INMOTION_VENDOR,
  officialUrl: seed.officialUrl,
  price: seed.price,
  productType: "Dedicated Servers",
  bodyCategory: "managed dedicated server hosting with named hardware, bandwidth, and bundled support services",
  categoryHints: [
    "Cloud Services",
    "Dedicated Servers",
    "Managed Dedicated Servers",
  ],
  filters: {
    hosting_type: ["Dedicated server"],
    pricing_model: ["Subscription"],
    price_band: [priceBand(seed.price)],
    billing_cycle: ["Monthly", "Annual"],
    performance_tier: [seed.performanceTier],
    support_coverage: ["24/7 support", "Priority support", "Migration / onboarding help"],
    target_segment: ["Mid-market", "Enterprise", "Agencies"],
  },
  seoTitle: `${seed.title} InMotion Hosting Managed Dedicated Server`,
  seoDescription: `${seed.title} includes ${seed.cpu}, ${seed.ram}, ${seed.storage}, ${seed.bandwidth}, and managed dedicated server pricing from $${seed.price} per month.`,
  audience:
    "teams that need dedicated server hardware with bundled support, onboarding help, and a more fully managed operating model",
  introTheme:
    `an exact managed dedicated server listing for the ${seed.planName} plan, where the practical value comes from the server hardware plus the Premier Care and onboarding services included with the plan`,
  useCases: [
    "running production workloads that benefit from dedicated hardware and support-oriented management",
    "choosing a dedicated server plan with visible priority support and bundled care features",
    "comparing hardware capacity alongside the included support and backup benefits before committing",
  ],
  pricingNotes: [
    `${seed.planName} is shown at $${seed.headlinePrice} per month.`,
    `${seed.planName} renews at $${seed.renewalPrice} per month.`,
    ...seed.termPrices.map((entry) => `${seed.planName} ${entry}`),
  ],
  featureGroups: [
    {
      heading: "Hardware",
      items: [
        seed.cpu,
        `${seed.threads}`,
        seed.ram,
        seed.storage,
        seed.bandwidth,
        seed.dedicatedIps,
      ],
    },
    {
      heading: "Managed And Care Features",
      items: [
        "Launch Assist onboarding and server setup noted as a $199 one-time value",
        ...(seed.supportFeatures ?? []),
        ...(seed.extraFeatures ?? []),
      ],
    },
    {
      heading: "Support And Service Notes",
      items: COMMON_SUPPORT_NOTES,
    },
  ],
  factualPros: [
    "The plan combines hardware detail with a clearly defined support bundle, which makes comparison much more practical.",
    "Priority support, onboarding help, and care-oriented add-ons are clearly named.",
    "Higher managed tiers scale memory, storage, and IP allocations within the same family.",
  ],
  factualCons: [
    "These plans cost materially more than entry VPS or shared hosting offers.",
    "Some plans depend on annual-style positioning rather than a single simple monthly rate.",
    "The right plan depends heavily on hardware needs, not just the care bundle.",
  ],
  buyerConsiderations: [
    "Check whether the managed support bundle is part of the core value you need, not just the server hardware.",
    "If storage, bandwidth, or IP count are the main driver, compare the higher managed dedicated plans carefully before choosing.",
    "The exact plan price should be viewed alongside renewal and bundled service value, not in isolation.",
  ],
  productCategoryLabel: "Managed Dedicated Servers",
  assumptionNotes: [],
});

const buildDedicatedSpec = (seed: DedicatedSeed): ProductSpec => ({
  title: seed.title,
  handle: slugify(seed.title),
  vendor: INMOTION_VENDOR,
  officialUrl: seed.officialUrl,
  price: seed.price,
  productType: "Dedicated Servers",
  bodyCategory: "dedicated bare metal hosting with named hardware and public term pricing",
  categoryHints: seed.categoryHints,
  filters: {
    hosting_type: ["Dedicated server"],
    pricing_model: ["Subscription"],
    price_band: [priceBand(seed.price)],
    billing_cycle: ["Monthly", "Annual"],
    performance_tier: [seed.performanceTier],
    support_coverage: ["24/7 support"],
    target_segment: ["Small business", "Mid-market", "Enterprise", "Developers"],
  },
  seoTitle: `${seed.title} InMotion Hosting Dedicated Server`,
  seoDescription: `${seed.title} includes ${seed.cpu}, ${seed.ram}, ${seed.storage}, ${seed.bandwidth}, and dedicated server pricing from $${seed.price} per month.`,
  audience:
    "buyers that want dedicated server hardware with clearer direct resource ownership than a shared or VPS environment provides",
  introTheme:
    `an exact dedicated server listing for the ${seed.planName} plan, where the hardware profile, bandwidth range, and term pricing matter more than broad family-level positioning`,
  useCases: [
    "running heavier workloads that need dedicated server hardware rather than virtualized resources",
    "comparing base bare metal and higher-capacity commercial configurations with clearer hardware data",
    "choosing a dedicated server by storage, memory, bandwidth, and IP allocation instead of generic marketing claims",
  ],
  pricingNotes: [
    `${seed.planName} is shown at $${seed.headlinePrice} per month.`,
    `${seed.planName} renews at $${seed.renewalPrice} per month.`,
    ...seed.termPrices.map((entry) => `${seed.planName} ${entry}`),
  ],
  featureGroups: [
    {
      heading: "Hardware",
      items: [
        seed.cpu,
        seed.threads,
        seed.ram,
        seed.storage,
        seed.bandwidth,
        seed.dedicatedIps,
      ],
    },
    {
      heading: "Platform Details",
      items: seed.extraFeatures ?? [],
    },
    {
      heading: "Support And Service Notes",
      items: COMMON_SUPPORT_NOTES,
    },
  ],
  factualPros: [
    "Named CPU, RAM, storage, and bandwidth values make the hardware profile easy to compare.",
    "Buyers can compare short-term and longer-term pricing where term options are provided.",
    "The lineup ranges from smaller dedicated configurations to very high-capacity commercial hardware.",
  ],
  factualCons: [
    "Dedicated server plans are substantially more expensive than shared or entry VPS options.",
    "The lowest displayed price is not always the shortest-term price.",
    "Some plans are specialized around storage, bandwidth, or enterprise scale rather than broad general-purpose use.",
  ],
  buyerConsiderations: [
    "Match the hardware profile to the actual workload so you do not overbuy a higher-capacity server unnecessarily.",
    "Where both monthly and annual-style terms are shown, compare the ongoing cost against the entry figure carefully.",
    "Commercial-class and higher-capacity plans are best judged by bandwidth, memory, and total core count, not just brand tier.",
  ],
  productCategoryLabel: seed.productCategoryLabel,
  assumptionNotes: [],
});

const buildEcoSpec = (seed: EcoSeed): ProductSpec => ({
  title: seed.title,
  handle: slugify(seed.title),
  vendor: INMOTION_VENDOR,
  officialUrl: seed.officialUrl,
  price: seed.price,
  productType: "Dedicated Servers",
  bodyCategory: "eco-friendly dedicated server hosting built around reused hardware and lower-cost dedicated infrastructure",
  categoryHints: [
    "Cloud Services",
    "Dedicated Servers",
    "Bare Metal Servers",
  ],
  filters: {
    hosting_type: ["Dedicated server"],
    pricing_model: ["Subscription"],
    price_band: [priceBand(seed.price)],
    billing_cycle: ["Monthly", "Annual"],
    performance_tier: ["Standard"],
    support_coverage: ["24/7 support"],
    target_segment: ["Small business", "Developers", "Mid-market"],
  },
  seoTitle: `${seed.title} InMotion Hosting Eco Friendly Dedicated Server`,
  seoDescription: `${seed.title} includes ${seed.cpu}, ${seed.ram}, ${seed.storage}, 1 Gbps bandwidth, and eco-friendly dedicated server pricing from $${seed.price} per month.`,
  audience:
    "buyers that want lower-cost dedicated hardware with a sustainability angle and clearer server ownership than shared hosting can provide",
  introTheme:
    `an exact eco-friendly dedicated server listing for the ${seed.planName} plan, where the main buying appeal is dedicated hardware, lower entry cost, and a clear sustainability angle`,
  useCases: [
    "moving onto dedicated hardware at a lower entry price than a newer enterprise-class server",
    "choosing a dedicated server with a sustainability-focused positioning",
    "comparing eco-oriented dedicated plans by memory, storage, and thread count before stepping up to a larger dedicated tier",
  ],
  pricingNotes: [
    `${seed.planName} starts at $${seed.price} per month on the lower long-term rate shown for this plan.`,
    `${seed.planName} actual monthly price is listed at $${seed.actualPrice} per month.`,
    `${seed.planName} 1 Month @ $${seed.actualPrice}/mo.`,
    `${seed.planName} 1 Year @ $${seed.price}/mo.`,
    `${seed.planName} 2 Years @ $${seed.price}/mo.`,
  ],
  featureGroups: [
    {
      heading: "Hardware",
      items: [
        seed.cpu,
        seed.cores,
        seed.threads,
        seed.ram,
        seed.storage,
        seed.bandwidth,
      ],
    },
    {
      heading: "Eco Friendly Positioning",
      items: ECO_COMMON,
    },
    {
      heading: "Support And Service Notes",
      items: COMMON_SUPPORT_NOTES,
    },
  ],
  factualPros: [
    "The eco-friendly line offers dedicated hardware at lower entry pricing than many higher-tier dedicated plans.",
    "The sustainability angle is clear and specific, which gives the plan a distinct identity beyond a standard dedicated server pitch.",
    "Term pricing is visible, which makes the cost structure easier to compare.",
  ],
  factualCons: [
    "These plans use varied reused hardware options rather than one perfectly uniform configuration.",
    "The shortest term costs more than the lower annual-style figure.",
    "The eco-friendly line does not publish the same high-end bandwidth and storage scale as the commercial class servers.",
  ],
  buyerConsiderations: [
    "Read the CPU variation carefully because some eco-friendly plans list more than one possible processor option.",
    "Use the annual and monthly figures together when evaluating long-term cost.",
    "If you need the newest or most uniform hardware profile, a higher dedicated family may be a stronger fit.",
  ],
  productCategoryLabel: "Bare Metal Servers",
  assumptionNotes: [],
});

const buildWordPressSpec = (seed: WordPressSeed): ProductSpec => ({
  title: seed.title,
  handle: slugify(seed.title),
  vendor: INMOTION_VENDOR,
  officialUrl: seed.officialUrl,
  price: seed.price,
  productType: "Wordpress Hosting",
  bodyCategory: "shared WordPress hosting with named website limits, storage, caching, and support details",
  categoryHints: [
    "Cloud Services",
    "WordPress Hosting",
    "Managed WordPress Hosting",
  ],
  filters: {
    hosting_type: ["Managed WordPress"],
    pricing_model: ["Subscription"],
    price_band: [priceBand(seed.price)],
    billing_cycle: ["Monthly"],
    performance_tier: [seed.performanceTier],
    support_coverage: ["24/7 support"],
    target_segment: ["Individuals", "Small business", "Developers"],
  },
  seoTitle: `${seed.title} InMotion Hosting WordPress Hosting`,
  seoDescription: `${seed.title} includes ${seed.websites}, ${seed.storage}, ${seed.phpWorkers}, staging, caching, and WordPress hosting from $${seed.price} per month.`,
  audience:
    "WordPress site owners, freelancers, bloggers, and small businesses that want WordPress-specific tools in a simpler hosting model",
  introTheme:
    `an exact shared WordPress hosting listing for the ${seed.planName} plan, where the plan comparison depends on site count, NVMe storage, PHP workers, and support differences rather than generic WordPress marketing`,
  useCases: [
    "launching a WordPress site with staging, multisite support, and managed tooling already included",
    "comparing the entry plan against stronger WordPress tiers with more storage and PHP workers",
    "choosing a WordPress plan by site count, caching support, and support coverage rather than by a vague performance promise alone",
  ],
  pricingNotes: [
    `${seed.planName} starts at $${seed.price} per month.`,
    `${seed.planName} renews at $${seed.renewalPrice} per month.`,
  ],
  featureGroups: [
    {
      heading: "Core Features",
      items: [
        seed.websites,
        seed.storage,
        seed.bandwidth,
        seed.phpWorkers,
        seed.performanceClaim,
        "WordPress Multisite",
        "WordPress Staging Tool",
        "Advanced Caching",
      ],
    },
    {
      heading: "Included Services",
      items: [...seed.extraFeatures, ...WORDPRESS_INCLUDED],
    },
    {
      heading: "Support",
      items: [seed.support, ...COMMON_SUPPORT_NOTES],
    },
  ],
  factualPros: [
    "Site counts, storage, PHP worker limits, and renewal pricing are clearly spelled out, which helps with side-by-side comparison.",
    "Staging, caching, backups, and security features are explicit rather than implied.",
    "The lineup gives buyers an upgrade path from smaller WordPress sites to stronger plans with more worker capacity.",
  ],
  factualCons: [
    "Renewal pricing is higher than the opening rate.",
    "Some stronger support or cache features appear only on higher plans.",
    "The shared WordPress family is narrower in scope than a VPS or dedicated server if you need deeper server-level flexibility.",
  ],
  buyerConsiderations: [
    "Use site count, PHP workers, and storage alongside price when comparing the WordPress plans.",
    "If you expect heavier concurrency or more custom infrastructure needs, a stronger managed or VPS product may be a better fit.",
    "The support mix differs by plan, so it is worth checking whether phone support matters for your workflow.",
  ],
  productCategoryLabel: "Managed WordPress Hosting",
  assumptionNotes: [],
});

const buildUltraStackSpec = (seed: UltraStackSeed): ProductSpec => ({
  title: seed.title,
  handle: slugify(seed.title),
  vendor: INMOTION_VENDOR,
  officialUrl: seed.officialUrl,
  price: seed.price,
  productType: "Managed Hosting",
  bodyCategory: "higher-performance managed WordPress hosting with dedicated compute, Redis cache resources, and SLA-backed uptime positioning",
  categoryHints: [
    "Cloud Services",
    "Managed Hosting",
    "Managed WordPress Hosting",
    "High Traffic WordPress Hosting",
  ],
  filters: {
    hosting_type: ["Managed WordPress"],
    pricing_model: ["Subscription"],
    price_band: [priceBand(seed.price)],
    billing_cycle: ["Monthly", "Annual"],
    performance_tier: [seed.performanceTier],
    support_coverage: seed.supportValues,
    target_segment: ["Small business", "Agencies", "Mid-market", "Developers"],
  },
  seoTitle: `${seed.title} InMotion Hosting Managed WordPress Hosting`,
  seoDescription: `${seed.title} includes ${seed.vcpu}, ${seed.ram}, ${seed.storage}, ${seed.phpWorkers}, Redis cache, and managed WordPress pricing from $${seed.price} per month.`,
  audience:
    "teams that want more predictable WordPress performance and support than a standard shared plan while staying inside a managed environment",
  introTheme:
    `an exact UltraStack ONE for WordPress listing for the ${seed.planName} plan, where the value comes from named compute resources, Redis cache headroom, migration support, and stronger uptime positioning`,
  useCases: [
    "running a busier WordPress production site with more compute and memory than ordinary shared hosting offers",
    "supporting heavier plugin stacks, traffic spikes, or more demanding cache requirements on a managed WordPress setup",
    "choosing between monthly and yearly billing while keeping migration support and uptime commitments visible",
  ],
  pricingNotes: [
    `${seed.planName} is listed at $${seed.monthlyPrice} per month.`,
    `Yearly pricing for ${seed.planName} is $${seed.price} per month.`,
    `${seed.planName} renews at $${seed.renewalPrice} per month on the yearly price line.`,
  ],
  featureGroups: [
    {
      heading: "Core Features",
      items: [
        "1 WordPress site",
        seed.vcpu,
        seed.ram,
        seed.storage,
        "Unlimited bandwidth",
        seed.phpWorkers,
        seed.redis,
      ],
    },
    {
      heading: "Managed Platform Features",
      items: [
        "Advanced security",
        "W3 Total Cache",
        "Choice of data center",
        "99.99% uptime SLA",
        "Migration support included",
        "White Glove Site Migration noted as a $199 value",
        ...seed.extraFeatures,
      ],
    },
    {
      heading: "Support",
      items: [...seed.supportValues, ...COMMON_SUPPORT_NOTES],
    },
  ],
  factualPros: [
    "The UltraStack data publishes concrete compute, memory, storage, and PHP worker numbers.",
    "Redis cache sizing and uptime SLA make the plan comparison more practical than a generic managed-hosting summary.",
    "Migration help is included across the supplied UltraStack plans.",
  ],
  factualCons: [
    "The lowest visible price depends on yearly billing rather than the standard monthly rate.",
    "Each listed UltraStack plan is built around one WordPress site.",
    "Higher-capacity tiers cost materially more as compute and worker limits rise.",
  ],
  buyerConsiderations: [
    "Compare the monthly and yearly lines together before deciding on budget.",
    "Use compute, RAM, and PHP worker count to choose the right UltraStack tier rather than treating them as interchangeable.",
    "If support depth is a priority, the 24GB plan stands out because it is the only one in this group that mentions a dedicated support team.",
  ],
  productCategoryLabel: "Managed WordPress Hosting",
  assumptionNotes: [],
});

const buildResellerSpec = (seed: ResellerSeed): ProductSpec => ({
  title: seed.title,
  handle: slugify(seed.title),
  vendor: INMOTION_VENDOR,
  preferredProductId: seed.preferredProductId,
  officialUrl: seed.officialUrl,
  price: seed.price,
  productType: "Agency Reseller Plans",
  bodyCategory: "reseller hosting built around cPanel licenses, white-label support, and hosted client account capacity",
  categoryHints: [
    "Cloud Services",
    "Reseller Hosting",
    "Agency Reseller Plans",
    "cPanel Reseller Hosting",
    "White Label Hosting",
  ],
  filters: {
    hosting_type: ["Reseller hosting"],
    pricing_model: ["Subscription"],
    price_band: [priceBand(seed.price)],
    billing_cycle: ["Monthly"],
    performance_tier: [seed.performanceTier],
    control_panel: ["cPanel"],
    support_coverage: ["24/7 support"],
    target_segment: ["Agencies", "Small business", "Developers"],
  },
  seoTitle: `${seed.title} InMotion Hosting Reseller Hosting`,
  seoDescription: `${seed.title} includes ${seed.storage}, ${seed.bandwidth}, ${seed.licenses}, ${seed.dedicatedIps}, and reseller hosting pricing from $${seed.price} per month.`,
  audience:
    "agencies, freelancers, and hosting businesses that need a white-label reseller foundation with bundled licenses and account capacity",
  introTheme:
    `an exact reseller hosting listing for the ${seed.planName} plan, where the main buying questions are license count, storage, bandwidth, dedicated IP allocation, and the gap between opening and renewal pricing`,
  useCases: [
    "starting or growing a reseller hosting business with bundled cPanel licensing",
    "supporting client websites on a white-label hosting setup with named storage and bandwidth limits",
    "comparing the promotional starting rate against the later renewal price before adopting the reseller plan long term",
  ],
  pricingNotes: [
    `${seed.planName} starts at $${seed.promoPrice} per month.`,
    `${seed.planName} is also listed at $${seed.altPrice} per month for 6 months and onwards.`,
    `${seed.planName} renews at $${seed.renewalPrice} per month.`,
  ],
  featureGroups: [
    {
      heading: "Core Features",
      items: [
        seed.storage,
        seed.bandwidth,
        seed.licenses,
        "Unlimited email accounts",
        seed.dedicatedIps,
      ],
    },
    {
      heading: "Reseller Platform Features",
      items: [...seed.extraFeatures],
    },
    {
      heading: "Support",
      items: [seed.support, ...COMMON_SUPPORT_NOTES],
    },
  ],
  factualPros: [
    "The reseller plans publish license counts, storage, bandwidth, and renewal pricing clearly.",
    "White-label positioning and development-focused tools are clearly part of the package.",
    "The family scales from a very low promotional entry tier to larger plans with more capacity.",
  ],
  factualCons: [
    "The opening promotional price can be far lower than the later renewal amount.",
    "Higher reseller tiers may be necessary once license, storage, or IP needs grow.",
    "The exact support mix differs across the reseller family, especially for phone support on higher plans.",
  ],
  buyerConsiderations: [
    "Treat the renewal price as part of the real long-term cost, not only the promotional figure.",
    "Choose the plan based on license count and storage headroom as much as on entry price.",
    "If phone support matters, compare the higher reseller tiers because the entry plan is positioned more lightly.",
  ],
  productCategoryLabel: "Reseller Hosting",
  assumptionNotes: [],
});

const TARGET_SPECS: ProductSpec[] = [
  buildVpsSpec({
    title: "InMotion VPS Hosting 4 vCPU",
    planName: "VPS 4 vCPU",
    officialUrl: "https://www.inmotionhosting.com/vps-hosting",
    price: "9.99",
    recommendedPrice: "14.99",
    renewalPrice: "26.99",
    termPrices: [
      "1 Month @ $16.99/mo",
      "6 Months @ $15.99/mo",
      "1 Year @ $14.99/mo",
      "2 Years @ $13.99/mo",
      "3 Years @ $9.99/mo",
    ],
    vcpu: "4 vCPU Cores",
    ram: "8GB RAM",
    storage: "160GB NVMe SSD",
    bandwidth: "5TB Bandwidth",
    dedicatedIps: "2 Dedicated IPs",
    performanceTier: "Standard",
  }),
  buildVpsSpec({
    title: "InMotion VPS Hosting 8 vCPU",
    planName: "VPS 8 vCPU",
    officialUrl: "https://www.inmotionhosting.com/vps-hosting",
    price: "19.99",
    recommendedPrice: "22.99",
    renewalPrice: "56.99",
    termPrices: [
      "1 Month @ $29.99/mo",
      "6 Months @ $23.99/mo",
      "1 Year @ $22.99/mo",
      "2 Years @ $21.99/mo",
      "3 Years @ $19.99/mo",
    ],
    vcpu: "8 vCPU Cores",
    ram: "16GB RAM",
    storage: "260GB NVMe SSD",
    bandwidth: "Unlimited Bandwidth",
    dedicatedIps: "3 Dedicated IPs",
    performanceTier: "Premium",
  }),
  buildVpsSpec({
    title: "InMotion VPS Hosting 12 vCPU",
    planName: "VPS 12 vCPU",
    officialUrl: "https://www.inmotionhosting.com/vps-hosting",
    price: "31.99",
    recommendedPrice: "32.99",
    renewalPrice: "86.99",
    termPrices: [
      "1 Month @ $39.99/mo",
      "6 Months @ $38.99/mo",
      "1 Year @ $32.99/mo",
      "2 Years @ $36.99/mo",
      "3 Years @ $31.99/mo",
    ],
    vcpu: "12 vCPU Cores",
    ram: "24GB RAM",
    storage: "360GB NVMe SSD",
    bandwidth: "Unlimited Bandwidth",
    dedicatedIps: "5 Dedicated IPs",
    performanceTier: "Premium",
  }),
  buildVpsSpec({
    title: "InMotion VPS Hosting 16 vCPU",
    planName: "VPS 16 vCPU",
    officialUrl: "https://www.inmotionhosting.com/vps-hosting",
    price: "44.99",
    recommendedPrice: "44.99",
    renewalPrice: "121.99",
    termPrices: [
      "1 Month @ $52.99/mo",
      "6 Months @ $50.99/mo",
      "1 Year @ $44.99/mo",
      "2 Years @ $48.99/mo",
      "3 Years @ $44.99/mo",
    ],
    vcpu: "16 vCPU Cores",
    ram: "32GB RAM",
    storage: "460GB NVMe SSD",
    bandwidth: "Unlimited Bandwidth",
    dedicatedIps: "10 Dedicated IPs",
    extraFeatures: ["Docker Compatible"],
    performanceTier: "Premium",
  }),
  buildManagedDedicatedSpec({
    title: "InMotion Managed Dedicated Server Aspire",
    planName: "Aspire",
    officialUrl: "https://www.inmotionhosting.com/dedicated-servers",
    price: "34.99",
    headlinePrice: "35.00",
    renewalPrice: "49.99",
    termPrices: ["1 Month @ $45.00/mo", "1 Year @ $34.99/mo", "2 Years @ $34.99/mo"],
    cpu: "Xeon E3-1246 v3",
    threads: "4 Core / 8 Thread",
    ram: "16GB DDR3 RAM",
    storage: "960GB SSD",
    bandwidth: "1Gbps Unmetered Bandwidth",
    dedicatedIps: "1 Dedicated IP",
    performanceTier: "Standard",
  }),
  buildManagedDedicatedSpec({
    title: "InMotion Managed Dedicated Server Essential",
    planName: "Essential",
    officialUrl: "https://www.inmotionhosting.com/dedicated-servers",
    price: "189.98",
    headlinePrice: "189.98",
    renewalPrice: "189.98",
    termPrices: ["For 12 month term"],
    cpu: "Xeon E-2134",
    threads: "4 Core / 8 Thread",
    ram: "64GB DDR4 RAM",
    storage: "2TB SSD",
    bandwidth: "1Gbps Unmetered Bandwidth",
    dedicatedIps: "5 Dedicated IPs",
    extraFeatures: [
      "Premier Care Bundle Included",
      "Monarx Security noted as a $19.99/month value",
      "500GB Backup Storage noted as a $90/month value",
      "InMotion Solutions Consulting - 1hr/mo noted as a $48/month value",
    ],
    supportFeatures: [
      "cPanel Dedicated Premier included",
      "APS Priority Support",
    ],
    performanceTier: "Premium",
  }),
  buildManagedDedicatedSpec({
    title: "InMotion Managed Dedicated Server Advanced",
    planName: "Advanced",
    officialUrl: "https://www.inmotionhosting.com/dedicated-servers",
    price: "239.98",
    headlinePrice: "239.98",
    renewalPrice: "239.98",
    termPrices: ["For 12 month term"],
    cpu: "Xeon E-2176G",
    threads: "6 Core / 12 Thread",
    ram: "64GB DDR4 RAM",
    storage: "2x1.92TB SSD",
    bandwidth: "1Gbps Unmetered Bandwidth",
    dedicatedIps: "10 Dedicated IPs",
    extraFeatures: [
      "Software RAID-1",
      "Premier Care Bundle Included",
      "Monarx Security noted as a $19.99/month value",
      "500GB Backup Storage noted as a $90/month value",
      "InMotion Solutions Consulting - 1hr/mo noted as a $48/month value",
    ],
    supportFeatures: [
      "cPanel Dedicated Premier included",
      "APS Priority Support",
    ],
    performanceTier: "Premium",
  }),
  buildManagedDedicatedSpec({
    title: "InMotion Managed Dedicated Server Elite",
    planName: "Elite",
    officialUrl: "https://www.inmotionhosting.com/dedicated-servers",
    price: "289.98",
    headlinePrice: "289.98",
    renewalPrice: "289.98",
    termPrices: ["For 12 month term"],
    cpu: "Xeon E-2388G",
    threads: "8 Core / 16 Thread",
    ram: "128GB DDR4 RAM",
    storage: "2x1.92TB NVMe SSD",
    bandwidth: "1Gbps Unmetered Bandwidth",
    dedicatedIps: "16 Dedicated IPs",
    extraFeatures: [
      "Software RAID-1",
      "Premier Care Bundle Included",
      "Monarx Security noted as a $19.99/month value",
      "500GB Backup Storage noted as a $90/month value",
      "InMotion Solutions Consulting - 1hr/mo noted as a $48/month value",
    ],
    supportFeatures: [
      "cPanel Dedicated Premier included",
      "APS Priority Support",
    ],
    performanceTier: "Premium",
  }),
  buildManagedDedicatedSpec({
    title: "InMotion Managed Dedicated Server CC-2000",
    planName: "CC-2000",
    officialUrl: "https://www.inmotionhosting.com/dedicated-servers",
    price: "419.98",
    headlinePrice: "419.98",
    renewalPrice: "419.98",
    termPrices: ["For 12 month term"],
    cpu: "Dual Xeon Silver 4214",
    threads: "24 Core / 48 Thread",
    ram: "256GB DDR4 RAM",
    storage: "2x2TB Storage",
    bandwidth: "3Gbps - 10Gbps Unmetered Bandwidth",
    dedicatedIps: "25 Dedicated IPs",
    extraFeatures: [
      "Software RAID-1",
      "Choice of Data Center Location",
      "Includes US and EU Locations",
      "NVMe SSD storage",
      "Premier Care Bundle Included",
      "Monarx Security noted as a $19.99/month value",
      "2TB Backup Storage noted as a $360/month value",
      "InMotion Solutions Consulting - 1hr/mo noted as a $48/month value",
    ],
    supportFeatures: [
      "cPanel Dedicated Premier included",
      "APS Priority Support",
    ],
    performanceTier: "Enterprise",
  }),
  buildDedicatedSpec({
    title: "InMotion Dedicated Bare Metal Server Aspire",
    planName: "Aspire",
    officialUrl: "https://www.inmotionhosting.com/bare-metal-servers",
    price: "34.99",
    headlinePrice: "35.00",
    renewalPrice: "49.99",
    termPrices: ["1 Month @ $45.00/mo", "1 Year @ $34.99/mo", "2 Years @ $34.99/mo"],
    cpu: "Xeon E3-1246 v3",
    threads: "4 Core / 8 Thread",
    ram: "16GB DDR3 RAM",
    storage: "960GB SSD",
    bandwidth: "1Gbps Unmetered Bandwidth",
    dedicatedIps: "1 Dedicated IP",
    categoryHints: ["Cloud Services", "Dedicated Servers", "Bare Metal Servers"],
    productCategoryLabel: "Bare Metal Servers",
    performanceTier: "Standard",
  }),
  buildDedicatedSpec({
    title: "InMotion Dedicated Bare Metal Server Essential",
    planName: "Essential",
    officialUrl: "https://www.inmotionhosting.com/bare-metal-servers",
    price: "99.99",
    headlinePrice: "99.99",
    renewalPrice: "99.99",
    termPrices: ["1 Month @ $119.99/mo", "1 Year @ $99.99/mo", "2 Years @ $99.99/mo"],
    cpu: "Xeon E-2134",
    threads: "4 Core / 8 Thread",
    ram: "64GB DDR4 RAM",
    storage: "2TB SSD",
    bandwidth: "1Gbps Unmetered Bandwidth",
    dedicatedIps: "5 Dedicated IPs",
    categoryHints: ["Cloud Services", "Dedicated Servers", "Bare Metal Servers"],
    productCategoryLabel: "Bare Metal Servers",
    performanceTier: "Premium",
  }),
  buildDedicatedSpec({
    title: "InMotion Dedicated Bare Metal Server Advanced",
    planName: "Advanced",
    officialUrl: "https://www.inmotionhosting.com/bare-metal-servers",
    price: "149.99",
    headlinePrice: "149.99",
    renewalPrice: "149.99",
    termPrices: ["1 Month @ $179.99/mo", "1 Year @ $149.99/mo", "2 Years @ $149.99/mo"],
    cpu: "Xeon E-2176G",
    threads: "6 Core / 12 Thread",
    ram: "64GB DDR4 RAM",
    storage: "2x1.92TB SSD",
    bandwidth: "1Gbps Unmetered Bandwidth",
    dedicatedIps: "10 Dedicated IPs",
    extraFeatures: ["Software RAID-1"],
    categoryHints: ["Cloud Services", "Dedicated Servers", "Bare Metal Servers"],
    productCategoryLabel: "Bare Metal Servers",
    performanceTier: "Premium",
  }),
  buildDedicatedSpec({
    title: "InMotion Dedicated Bare Metal Server Elite",
    planName: "Elite",
    officialUrl: "https://www.inmotionhosting.com/bare-metal-servers",
    price: "199.99",
    headlinePrice: "199.99",
    renewalPrice: "199.99",
    termPrices: ["1 Month @ $239.99/mo", "1 Year @ $199.99/mo", "2 Years @ $199.99/mo"],
    cpu: "Xeon E-2388G",
    threads: "8 Core / 16 Thread",
    ram: "128GB DDR4 RAM",
    storage: "2x1.92TB NVMe SSD",
    bandwidth: "1Gbps Unmetered Bandwidth",
    dedicatedIps: "16 Dedicated IPs",
    extraFeatures: ["Software RAID-1", "NVMe SSD storage"],
    categoryHints: ["Cloud Services", "Dedicated Servers", "Bare Metal Servers"],
    productCategoryLabel: "Bare Metal Servers",
    performanceTier: "Premium",
  }),
  buildDedicatedSpec({
    title: "InMotion Dedicated Bare Metal Server Extreme",
    planName: "Extreme",
    officialUrl: "https://www.inmotionhosting.com/bare-metal-servers",
    price: "349.99",
    headlinePrice: "349.99",
    renewalPrice: "349.99",
    termPrices: ["For 12 month term"],
    cpu: "AMD EPYC 4545p",
    threads: "16 Core / 32 Thread",
    ram: "192GB DDR5 ECC RAM",
    storage: "2x3.84TB NVMe SSD",
    bandwidth: "3Gbps - 10Gbps Unmetered Bandwidth",
    dedicatedIps: "32 Dedicated IPs",
    extraFeatures: ["Software RAID-1", "NVMe SSD storage"],
    categoryHints: [
      "Cloud Services",
      "Dedicated Servers",
      "Bare Metal Servers",
      "High-Performance Dedicated Servers",
    ],
    productCategoryLabel: "High-Performance Dedicated Servers",
    performanceTier: "Enterprise",
  }),
  buildDedicatedSpec({
    title: "InMotion Commercial Class Bare Metal Server CC-1000",
    planName: "CC-1000",
    officialUrl: "https://www.inmotionhosting.com/dedicated-servers/high-capacity",
    price: "279.99",
    headlinePrice: "279.99",
    renewalPrice: "279.99",
    termPrices: ["1 Month @ $335.99/mo", "1 Year @ $279.99/mo", "2 Years @ $279.99/mo"],
    cpu: "Xeon Silver 4214",
    threads: "12 Core / 24 Thread",
    ram: "192GB DDR4 RAM",
    storage: "2x1TB Storage",
    bandwidth: "3Gbps - 10Gbps Unmetered Bandwidth",
    dedicatedIps: "20 Dedicated IPs",
    extraFeatures: [
      "Software RAID-1",
      "NVMe SSD storage",
      "Choice of Data Center Location",
      "Includes US and EU Locations",
    ],
    categoryHints: [
      "Cloud Services",
      "Dedicated Servers",
      "Enterprise Dedicated Servers",
      "High-Performance Dedicated Servers",
    ],
    productCategoryLabel: "Enterprise Dedicated Servers",
    performanceTier: "Enterprise",
  }),
  buildDedicatedSpec({
    title: "InMotion Commercial Class Bare Metal Server CC-2000",
    planName: "CC-2000",
    officialUrl: "https://www.inmotionhosting.com/dedicated-servers/high-capacity",
    price: "329.99",
    headlinePrice: "329.99",
    renewalPrice: "329.99",
    termPrices: ["1 Month @ $395.99/mo", "1 Year @ $329.99/mo", "2 Years @ $329.99/mo"],
    cpu: "Dual Xeon Silver 4214",
    threads: "24 Core / 48 Thread",
    ram: "256GB DDR4 RAM",
    storage: "2x2TB Storage",
    bandwidth: "3Gbps - 10Gbps Unmetered Bandwidth",
    dedicatedIps: "25 Dedicated IPs",
    extraFeatures: [
      "Software RAID-1",
      "NVMe SSD storage",
      "Choice of Data Center Location",
      "Includes US and EU Locations",
    ],
    categoryHints: [
      "Cloud Services",
      "Dedicated Servers",
      "Enterprise Dedicated Servers",
      "High-Performance Dedicated Servers",
    ],
    productCategoryLabel: "Enterprise Dedicated Servers",
    performanceTier: "Enterprise",
  }),
  buildDedicatedSpec({
    title: "InMotion Commercial Class Bare Metal Server CC-3000",
    planName: "CC-3000",
    officialUrl: "https://www.inmotionhosting.com/dedicated-servers/high-capacity",
    price: "799.99",
    headlinePrice: "799.99",
    renewalPrice: "799.99",
    termPrices: ["1 Month @ $959.99/mo", "1 Year @ $799.99/mo", "2 Years @ $799.99/mo"],
    cpu: "Dual Xeon Silver 4314",
    threads: "32 Core / 64 Thread",
    ram: "512GB DDR4 RAM",
    storage: "2x3.2TB Storage",
    bandwidth: "3Gbps - 10Gbps Unmetered Bandwidth",
    dedicatedIps: "30 Dedicated IPs",
    extraFeatures: [
      "Software RAID-1",
      "NVMe SSD storage",
      "Choice of Data Center Location",
      "Includes US and EU Locations",
    ],
    categoryHints: [
      "Cloud Services",
      "Dedicated Servers",
      "Enterprise Dedicated Servers",
      "High-Performance Dedicated Servers",
    ],
    productCategoryLabel: "Enterprise Dedicated Servers",
    performanceTier: "Enterprise",
  }),
  buildDedicatedSpec({
    title: "InMotion Commercial Class Bare Metal Server CC-4000",
    planName: "CC-4000",
    officialUrl: "https://www.inmotionhosting.com/dedicated-servers/high-capacity",
    price: "1599.99",
    headlinePrice: "1599.99",
    renewalPrice: "1599.99",
    termPrices: ["1 Month @ $1,919.99/mo", "1 Year @ $1,599.99/mo", "2 Years @ $1,599.99/mo"],
    cpu: "Dual Xeon Gold 6530",
    threads: "64 Core / 128 Thread",
    ram: "1024GB DDR5 RAM",
    storage: "2x6.4TB Storage",
    bandwidth: "10Gbps Unmetered Bandwidth",
    dedicatedIps: "64 Dedicated IPs",
    extraFeatures: [
      "Software RAID-1",
      "Choice of Data Center Location",
      "Includes US and EU Locations",
    ],
    categoryHints: [
      "Cloud Services",
      "Dedicated Servers",
      "Enterprise Dedicated Servers",
      "High-Performance Dedicated Servers",
    ],
    productCategoryLabel: "Enterprise Dedicated Servers",
    performanceTier: "Enterprise",
  }),
  buildEcoSpec({
    title: "InMotion Eco Friendly Dedicated Server CP-A1",
    planName: "CP-A1",
    officialUrl: "https://www.inmotionhosting.com/dedicated-servers/eco-friendly-servers",
    price: "32.00",
    actualPrice: "40.00",
    cpu: "Intel Xeon E5-2630 v3 @ 2.40GHz (X 2) or Intel Xeon E5-2620 v4 @ 2.10GHz (X 2)",
    cores: "8 Cores",
    threads: "32 Threads",
    ram: "16 GB Memory",
    storage: "1x SATA SSD or 1x 500 GB SSD",
    bandwidth: "1 Gbps Bandwidth",
  }),
  buildEcoSpec({
    title: "InMotion Eco Friendly Dedicated Server CP-E1",
    planName: "CP-E1",
    officialUrl: "https://www.inmotionhosting.com/dedicated-servers/eco-friendly-servers",
    price: "80.00",
    actualPrice: "100.00",
    cpu: "Intel Xeon E5-2630 v3 or Intel Xeon E5-2620 v4 configuration options",
    cores: "8 Cores",
    threads: "16 Threads or 32 Threads",
    ram: "64 GB Memory",
    storage: "1x 500 GB SSD",
    bandwidth: "1 Gbps Bandwidth",
  }),
  buildEcoSpec({
    title: "InMotion Eco Friendly Dedicated Server CP-E2",
    planName: "CP-E2",
    officialUrl: "https://www.inmotionhosting.com/dedicated-servers/eco-friendly-servers",
    price: "120.00",
    actualPrice: "150.00",
    cpu: "Intel Xeon E5-2620 v4 @ 2.10GHz or Intel Xeon E5-2620 v4 @ 2.10GHz (X 2)",
    cores: "8 Cores",
    threads: "16 Threads",
    ram: "96 GB or 128 GB Memory",
    storage: "1x 500 GB SSD",
    bandwidth: "1 Gbps Bandwidth",
  }),
  buildWordPressSpec({
    title: "InMotion WordPress Hosting WP Launch",
    planName: "WP Launch",
    officialUrl: "https://www.inmotionhosting.com/shared-hosting/wordpress",
    price: "5.29",
    renewalPrice: "15.49",
    websites: "2 Websites",
    storage: "100GB NVMe Storage",
    bandwidth: "Unmetered Bandwidth",
    phpWorkers: "3 PHP Workers per Site",
    performanceClaim: "20x WP Performance",
    support: "Live Chat Support from Helpful Humans",
    extraFeatures: [],
    performanceTier: "Standard",
  }),
  buildWordPressSpec({
    title: "InMotion WordPress Hosting WP Power",
    planName: "WP Power",
    officialUrl: "https://www.inmotionhosting.com/shared-hosting/wordpress",
    price: "5.29",
    renewalPrice: "19.49",
    websites: "10 Websites",
    storage: "200GB NVMe Storage",
    bandwidth: "Unmetered Bandwidth",
    phpWorkers: "4 PHP Workers per Site",
    performanceClaim: "30x WP Performance",
    support: "Live Chat and Phone Support from Helpful Humans",
    extraFeatures: [
      "Dedicated Opcode Cache Pool",
      "Choice of Data Center Location",
      "Includes US and EU Locations",
    ],
    performanceTier: "Premium",
  }),
  buildWordPressSpec({
    title: "InMotion WordPress Hosting WP Pro",
    planName: "WP Pro",
    officialUrl: "https://www.inmotionhosting.com/shared-hosting/wordpress",
    price: "12.29",
    renewalPrice: "26.49",
    websites: "40 Websites",
    storage: "300GB NVMe Storage",
    bandwidth: "Unmetered Bandwidth",
    phpWorkers: "6 PHP Workers per Site",
    performanceClaim: "40x WP Performance",
    support: "Live Chat and Phone Support from Helpful Humans",
    extraFeatures: [
      "2 vCPU Cores",
      "4GB RAM",
      "Dedicated Opcode Cache Pool",
      "Included Agency Features",
      "Pro Level Support",
      "Dedicated IP",
      "Choice of Data Center Location",
      "Includes US and EU Locations",
    ],
    performanceTier: "Premium",
  }),
  buildUltraStackSpec({
    title: "InMotion UltraStack ONE for WordPress 8GB RAM",
    planName: "UltraStack 8GB RAM",
    officialUrl: "https://www.inmotionhosting.com/ultrastack-one-for-wordpress",
    price: "33.33",
    monthlyPrice: "40.00",
    renewalPrice: "33.33",
    vcpu: "8 vCPU Compute Power",
    ram: "8GB RAM",
    storage: "250GB NVMe SSD",
    phpWorkers: "35 PHP Workers",
    redis: "128MB+ Redis Cache",
    extraFeatures: [],
    performanceTier: "Premium",
    supportValues: ["24/7 support", "Migration / onboarding help"],
  }),
  buildUltraStackSpec({
    title: "InMotion UltraStack ONE for WordPress 12GB RAM",
    planName: "UltraStack 12GB RAM",
    officialUrl: "https://www.inmotionhosting.com/ultrastack-one-for-wordpress",
    price: "50.00",
    monthlyPrice: "60.00",
    renewalPrice: "50.00",
    vcpu: "12 vCPU Compute Power",
    ram: "12GB RAM",
    storage: "300GB NVMe SSD",
    phpWorkers: "45 PHP Workers",
    redis: "192MB+ Redis Cache",
    extraFeatures: [],
    performanceTier: "Premium",
    supportValues: ["24/7 support", "Migration / onboarding help"],
  }),
  buildUltraStackSpec({
    title: "InMotion UltraStack ONE for WordPress 16GB RAM",
    planName: "UltraStack 16GB RAM",
    officialUrl: "https://www.inmotionhosting.com/ultrastack-one-for-wordpress",
    price: "66.67",
    monthlyPrice: "80.00",
    renewalPrice: "66.67",
    vcpu: "16 vCPU Compute Power",
    ram: "16GB RAM",
    storage: "350GB NVMe SSD",
    phpWorkers: "60 PHP Workers",
    redis: "256MB+ Redis Cache",
    extraFeatures: [],
    performanceTier: "Premium",
    supportValues: ["24/7 support", "Migration / onboarding help"],
  }),
  buildUltraStackSpec({
    title: "InMotion UltraStack ONE for WordPress 24GB RAM",
    planName: "UltraStack 24GB RAM",
    officialUrl: "https://www.inmotionhosting.com/ultrastack-one-for-wordpress",
    price: "100.00",
    monthlyPrice: "120.00",
    renewalPrice: "100.00",
    vcpu: "24 vCPU Compute Power",
    ram: "24GB RAM",
    storage: "400GB NVMe SSD",
    phpWorkers: "120 PHP Workers",
    redis: "512MB+ Redis Cache",
    extraFeatures: ["Dedicated Support Team"],
    performanceTier: "Enterprise",
    supportValues: ["24/7 support", "Migration / onboarding help", "Dedicated manager"],
  }),
  buildResellerSpec({
    title: "InMotion Reseller Hosting R-1000N",
    planName: "R-1000N",
    preferredProductId: 9345708851439,
    officialUrl: "https://www.inmotionhosting.com/reseller-hosting",
    price: "0.99",
    promoPrice: "0.99",
    altPrice: "19.99",
    renewalPrice: "35.99",
    storage: "80GB SSD",
    bandwidth: "1000GB Bandwidth",
    licenses: "25 cPanel Licenses Included",
    dedicatedIps: "1 Dedicated IP",
    extraFeatures: [
      "Security Suite",
      "Marketing Tools",
      "Hosting Plus",
      "Python, Node.JS, and GIT version control",
      "Choice of Data Center Location",
      "Includes US and EU Locations",
    ],
    support: "Live Chat Support from Helpful Humans",
    performanceTier: "Standard",
  }),
  buildResellerSpec({
    title: "InMotion Reseller Hosting R-2000N",
    planName: "R-2000N",
    officialUrl: "https://www.inmotionhosting.com/reseller-hosting",
    price: "26.99",
    promoPrice: "39.99",
    altPrice: "26.99",
    renewalPrice: "55.99",
    storage: "160GB NVMe SSD",
    bandwidth: "2000GB Bandwidth",
    licenses: "50 cPanel Licenses Included",
    dedicatedIps: "2 Dedicated IPs",
    extraFeatures: [
      "Security Suite",
      "Marketing Tools",
      "Hosting Plus",
      "Python, Node.JS, and GIT version control",
      "Choice of Data Center Location",
      "Includes US and EU Locations",
    ],
    support: "Live Chat and Phone Support from Helpful Humans",
    performanceTier: "Premium",
  }),
  buildResellerSpec({
    title: "InMotion Reseller Hosting R-3000N",
    planName: "R-3000N",
    officialUrl: "https://www.inmotionhosting.com/reseller-hosting",
    price: "39.99",
    promoPrice: "49.99",
    altPrice: "39.99",
    renewalPrice: "75.99",
    storage: "200GB NVMe SSD",
    bandwidth: "Unlimited Bandwidth",
    licenses: "80 cPanel Licenses Included",
    dedicatedIps: "3 Dedicated IPs",
    extraFeatures: [
      "Security Suite",
      "Marketing Tools",
      "Hosting Plus",
      "Python, Node.JS, and GIT version control",
      "Choice of Data Center Location",
      "Includes US and EU Locations",
    ],
    support: "Live Chat and Phone Support from Helpful Humans",
    performanceTier: "Premium",
  }),
  buildResellerSpec({
    title: "InMotion Reseller Hosting R-4000N",
    planName: "R-4000N",
    officialUrl: "https://www.inmotionhosting.com/reseller-hosting",
    price: "49.99",
    promoPrice: "59.99",
    altPrice: "49.99",
    renewalPrice: "109.99",
    storage: "300GB NVMe SSD",
    bandwidth: "Unlimited Bandwidth",
    licenses: "100 cPanel Licenses Included",
    dedicatedIps: "5 Dedicated IPs",
    extraFeatures: [
      "2GB Backup Storage",
      "Security Suite",
      "Marketing Tools",
      "Hosting Plus",
      "Python, Node.JS, and GIT version control",
      "Choice of Data Center Location",
      "Includes US and EU Locations",
    ],
    support: "Live Chat and Phone Support from Helpful Humans",
    performanceTier: "Premium",
  }),
];

const main = async () => {
  const allowedTypeValues = await buildAllowedTypeValues();
  const filterDefinitions = await buildCloudFilterDefinitions();
  const filterKeys = dedupe(
    TARGET_SPECS.flatMap((spec) =>
      Object.keys(validateFilterValues(spec, filterDefinitions))
    )
  );
  const marketplaceFilterReferences = await buildMarketplaceFilterReferenceMap(filterKeys);
  const deletions = await deleteOrphanAndDuplicateProducts(TARGET_SPECS);

  const rows: SummaryRow[] = [];
  const processedProductIds = new Set<number>();
  const processedHandles = new Set<string>();
  const processedTitleUrls = new Set<string>();

  for (const spec of TARGET_SPECS) {
    try {
      if (!normalizeText(spec.title) || !normalizeText(spec.vendor) || !normalizeText(spec.officialUrl)) {
        rows.push({
          title: spec.title,
          requestedProductId: spec.preferredProductId ?? null,
          finalProductId: null,
          matchedBy: "created",
          priceUsed: spec.price,
          seoUpdated: false,
          metafieldsUpdated: [],
          logoAction: "skipped_logo_existing",
          finalStatus: "skipped_missing_required_data",
          assumptionNotes: spec.assumptionNotes,
          error: "Title, vendor, or official URL missing.",
        });
        continue;
      }

      if (!Number(spec.price) || Number(spec.price) <= 0) {
        rows.push({
          title: spec.title,
          requestedProductId: spec.preferredProductId ?? null,
          finalProductId: null,
          matchedBy: "created",
          priceUsed: spec.price,
          seoUpdated: false,
          metafieldsUpdated: [],
          logoAction: "skipped_logo_existing",
          finalStatus: "skipped_pricing_unavailable",
          assumptionNotes: spec.assumptionNotes,
          error:
            'Price unavailable. Expected public price or the text `To visit product official website click "Get Now"`. ',
        });
        continue;
      }

      const matchResult = await resolveProductState(
        spec,
        processedProductIds,
        processedHandles,
        processedTitleUrls
      );
      if (!matchResult) {
        throw new Error(`Could not resolve match state for ${spec.title}`);
      }

      if (matchResult.duplicateInCurrentJob) {
        rows.push({
          title: spec.title,
          requestedProductId: spec.preferredProductId ?? null,
          finalProductId: matchResult.state?.product?.id ?? null,
          matchedBy: matchResult.matchedBy,
          priceUsed: spec.price,
          seoUpdated: false,
          metafieldsUpdated: [],
          logoAction: "skipped_logo_existing",
          finalStatus: "skipped_existing_current_job",
          assumptionNotes: spec.assumptionNotes,
          error: "Duplicate row skipped for current job safety.",
        });
        continue;
      }

      const currentState = matchResult.state;
      const bodyHtml = buildBodyHtml(spec);
      const mergedTypeMultiple = buildMergedTypeMultiple(
        spec.categoryHints,
        allowedTypeValues
      );
      const filters = validateFilterValues(spec, filterDefinitions);
      const upsertResult = await upsertShopifyProduct(spec, currentState, bodyHtml);

      await setProductMetafields(
        upsertResult.productId,
        spec,
        mergedTypeMultiple,
        filters,
        marketplaceFilterReferences
      );

      processedProductIds.add(upsertResult.productId);
      processedHandles.add(currentState?.product?.handle || spec.handle);
      processedTitleUrls.add(
        `${normalizeComparisonText(currentState?.product?.title || spec.title)}||${normalizeUrlForCompare(
          spec.officialUrl
        )}`
      );

      const finalStatus =
        upsertResult.action === "created_missing_product"
          ? "created_missing_product"
          : JSON.stringify(mergedTypeMultiple) !== JSON.stringify(currentState?.typeMultiple ?? [])
            ? "updated_type_multiple"
            : "updated_existing_product";

      rows.push({
        title: spec.title,
        requestedProductId: spec.preferredProductId ?? null,
        finalProductId: upsertResult.productId,
        matchedBy: matchResult.matchedBy,
        priceUsed: spec.price,
        seoUpdated: true,
        metafieldsUpdated: [
          "custom.custom",
          "custom.logo_image",
          "custom.type_multiple",
          "custom.plans_pricing",
          "custom.product_features",
          "custom.pros_cons",
          ...Object.keys(filters).map((key) => `marketplace.${key}`),
        ],
        logoAction: "skipped_logo_existing",
        finalStatus,
        assumptionNotes: spec.assumptionNotes,
        error: null,
      });
    } catch (error: any) {
      rows.push({
        title: spec.title,
        requestedProductId: spec.preferredProductId ?? null,
        finalProductId: null,
        matchedBy: "created",
        priceUsed: spec.price,
        seoUpdated: false,
        metafieldsUpdated: [],
        logoAction: "skipped_logo_existing",
        finalStatus: "failed",
        assumptionNotes: spec.assumptionNotes,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const { jsonPath, csvPath, counts } = await writeSummaryFiles(rows, deletions);

  console.log("Changed files:");
  console.log("- backend/src/scripts/updateInMotionHostingProducts.ts");
  console.log("");
  console.log(`Total Section B products received: ${counts.totalSectionBProductsReceived}`);
  console.log(`Total Section C plans processed: ${counts.totalSectionCPlansProcessed}`);
  console.log(`Existing products updated: ${counts.existingProductsUpdated}`);
  console.log(`Missing products created: ${counts.missingProductsCreated}`);
  console.log(`Deleted existing products: ${counts.deletedExistingProducts}`);
  console.log(`Skipped current-job duplicates: ${counts.skippedCurrentJobDuplicates}`);
  console.log(`Skipped missing required data: ${counts.skippedMissingRequiredData}`);
  console.log(`Skipped pricing unavailable: ${counts.skippedPricingUnavailable}`);
  console.log(`Logo uploaded count: ${counts.logoUploadedCount}`);
  console.log(`Logo reused/skipped count: ${counts.logoReusedSkippedCount}`);
  console.log(`Failed count: ${counts.failedCount}`);
  console.log("Deleted products:");
  deletions.forEach((row) => {
    console.log(`- ${row.title} | product_id=${row.productId} | reason=${row.reason}`);
  });
  console.log("Product-by-product summary:");
  rows.forEach((row) => {
    console.log(
      `- ${row.title} | requested_product_id=${row.requestedProductId ?? "n/a"} | final_product_id=${row.finalProductId ?? "n/a"} | matched_by=${row.matchedBy} | price_used=${row.priceUsed} | seo_updated=${row.seoUpdated} | logo_action=${row.logoAction} | final_status=${row.finalStatus}`
    );
    if (row.assumptionNotes.length > 0) {
      console.log(`  assumptions: ${row.assumptionNotes.join(" || ")}`);
    }
    if (row.metafieldsUpdated.length > 0) {
      console.log(`  metafields: ${row.metafieldsUpdated.join(", ")}`);
    }
    if (row.error) {
      console.log(`  error: ${row.error}`);
    }
  });
  console.log(`Summary JSON: ${jsonPath}`);
  console.log(`Summary CSV: ${csvPath}`);
};

main().catch((error) => {
  console.error("InMotion product update failed:", error);
  process.exitCode = 1;
});
