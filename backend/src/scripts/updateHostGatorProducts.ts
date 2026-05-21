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
const SECTION_B_COUNT = 11;
const HOSTGATOR_VENDOR = "HostGator";
const HOSTGATOR_LOGO_URL =
  "https://cdn.shopify.com/s/files/1/0770/5192/0623/files/shared-hosting-hostgator-hatchling.png";

type CsvRow = Record<string, string>;

type ShopifyMetafieldRecord = {
  namespace?: string;
  key?: string;
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
  productCategoryLabel: string;
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
  assumptionNotes: string[];
  sourcePlanName?: string | null;
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

const buildPlansPricing = (spec: ProductSpec) => {
  if (!normalizeText(spec.price) || Number(spec.price) <= 0) {
    return 'To visit product official website click "Get Now"';
  }

  return buildPlainTextSection("Pricing", spec.pricingNotes);
};

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
  const featuresHtml = spec.featureGroups.map((group) => htmlSection(group.heading, group.items)).join("");
  const useCasesHtml = htmlList(spec.useCases);
  const pricingHtml = htmlList(spec.pricingNotes);
  const considerationsHtml = htmlList(spec.buyerConsiderations);
  const planReference = spec.sourcePlanName
    ? `${spec.sourcePlanName} plan`
    : `${spec.productCategoryLabel.toLowerCase()} option`;

  const html = [
    `<h2>${escapeHtml(spec.title)}</h2>`,
    `<p>${escapeHtml(
      `${spec.title} is ${spec.introTheme}. It brings together the details buyers usually need before choosing a ${planReference}, including resource limits, support access, renewal terms, and the practical fit for everyday website or store workloads.`
    )}</p>`,
    `<p>${escapeHtml(
      `This offer is most relevant for ${spec.audience}. Instead of relying on a short headline price alone, it helps to look at what is included across storage, website limits, performance, security, onboarding, and the billing tradeoffs that show up once the introductory term ends.`
    )}</p>`,
    `<h3>What This Hosting Plan Is Best Known For</h3>`,
    `<p>${escapeHtml(
      `The listing sits in the ${spec.bodyCategory} space, which matters because shared hosting, managed WordPress plans, WooCommerce-ready packages, VPS environments, and dedicated servers solve very different problems. Reading the plan in that context makes comparisons much more useful and far less generic.`
    )}</p>`,
    `<p>${escapeHtml(
      `For most buyers, the strongest evaluation points come down to the websites or projects the plan can comfortably support, the level of control or convenience it offers, and how much room it leaves for growth before an upgrade becomes necessary.`
    )}</p>`,
    useCasesHtml,
    `<h3>Features That Matter In Day-To-Day Use</h3>`,
    `<p>${escapeHtml(
      `A hosting package can look similar to competing plans at a glance, but the day-to-day experience often changes based on smaller details such as storage allocations, included SSL, migration help, malware coverage, control panel access, support channels, staging tools, backup terms, or the difference between entry-level and higher tiers. Keeping those details visible makes this listing more useful for a real buying decision.`
    )}</p>`,
    featuresHtml,
    `<h3>Pricing And Billing Notes</h3>`,
    `<p>${escapeHtml(
      `The published starting price is the lowest visible paid rate tied to this plan family. That figure is helpful, but it should be considered together with term length, renewal pricing, license differences where relevant, and the extras that only appear on higher tiers or longer commitments.`
    )}</p>`,
    pricingHtml,
    `<h3>What To Weigh Before Choosing</h3>`,
    `<p>${escapeHtml(
      `The best choice depends on the size of the workload, how much technical control is needed, and whether the plan is being chosen for a single launch, a growing business site, an online store, or a resource-heavy application. The points below highlight the tradeoffs that deserve attention before checkout.`
    )}</p>`,
    considerationsHtml,
    `<p>${escapeHtml(
      `Overall, ${spec.title} gives buyers a clearer way to evaluate ${spec.productCategoryLabel.toLowerCase()} options without losing the practical details that shape long-term fit, support expectations, and total cost.`
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

      definitions.set(key, {
        key,
        allowedValues: normalizeText(row.allowed_values)
          .split("|")
          .map((item) => item.trim())
          .filter(Boolean),
      });
    });

  return definitions;
};

const validateFilterValues = (spec: ProductSpec, filterDefinitions: Map<string, FilterDefinition>) => {
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

  const definitions = Array.isArray(definitionsResponse.data?.data?.metafieldDefinitions?.nodes)
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

const fetchProductStateByHandle = async (handle: string): Promise<CurrentProductState | null> => {
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
    const response: any = await shopifyGraphQL.post("", {
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
    const byId = await inspectCandidate(await fetchProductStateById(spec.preferredProductId), "product_id");
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

    const nodes = Array.isArray(response.data?.data?.publications?.nodes)
      ? response.data.data.publications.nodes
      : [];

    nodes.forEach((node: any) => {
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
  existingValues: string[],
  hints: string[],
  allowedValues: Set<string>
) =>
  dedupe([...existingValues, ...hints])
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
      value: HOSTGATOR_LOGO_URL,
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

const writeSummaryFiles = async (rows: SummaryRow[]) => {
  await ensureDir(EXPORTS_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(EXPORTS_DIR, `hostgator-update-summary-${timestamp}.json`);
  const csvPath = path.join(EXPORTS_DIR, `hostgator-update-summary-${timestamp}.csv`);

  const counts = {
    totalSectionBProductsReceived: TARGET_SPECS.length,
    existingProductsUpdated: rows.filter(
      (row) => row.finalStatus === "updated_existing_product" || row.finalStatus === "updated_type_multiple"
    ).length,
    missingProductsCreated: rows.filter((row) => row.finalStatus === "created_missing_product").length,
    skippedCurrentJobDuplicates: rows.filter((row) => row.finalStatus === "skipped_existing_current_job").length,
    skippedMissingRequiredData: rows.filter((row) => row.finalStatus === "skipped_missing_required_data").length,
    skippedPricingUnavailable: rows.filter((row) => row.finalStatus === "skipped_pricing_unavailable").length,
    logoUploadedCount: rows.filter((row) => row.logoAction === "logo_uploaded").length,
    logoReusedSkippedCount: rows.filter((row) => row.logoAction === "skipped_logo_existing").length,
    failedCount: rows.filter((row) => row.finalStatus === "failed").length,
  };

  await fs.promises.writeFile(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        counts,
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

const TARGET_SPECS: ProductSpec[] = [
  {
    title: "HostGator Baby Shared Hosting",
    preferredProductId: 9096034156783,
    handle: "hostgator-baby-shared-hosting",
    vendor: HOSTGATOR_VENDOR,
    officialUrl: "https://www.hostgator.com/web-hosting",
    price: "4.50",
    productType: "Shared Hosting",
    productCategoryLabel: "Shared Hosting",
    bodyCategory: "shared hosting with multi-site support, cPanel access, email features, and entry-level business-friendly resource limits",
    categoryHints: ["Cloud Services", "Shared Hosting", "Business Shared Hosting", "cPanel Shared Hosting", "SSD Shared Hosting", "Multi-Domain Hosting"],
    filters: {
      hosting_type: ["Shared hosting"],
      pricing_model: ["Subscription"],
      price_band: [priceBand("4.50")],
      billing_cycle: ["Monthly", "Quarterly", "Annual"],
      performance_tier: ["Standard"],
      control_panel: ["cPanel"],
      support_coverage: ["24/7 support", "Migration / onboarding help"],
      target_segment: ["Individuals", "Small business"],
    },
    seoTitle: "HostGator Baby Shared Hosting HostGator Shared Hosting",
    seoDescription: "HostGator Baby Shared Hosting starts at $4.50/month with 20 websites, 20 GB SSD storage, cPanel access, SSL, CDN, and phone plus chat support.",
    audience: "small businesses, side projects, and growing personal brands that need more than a single starter website",
    introTheme: "the Baby shared hosting tier from HostGator, built for customers who want room for more websites, more storage, and stronger support coverage than the lowest entry package",
    useCases: [
      "launching several business or content sites without moving into VPS territory too early",
      "running brochure sites, blogs, landing pages, or simple client projects from one account",
      "getting cPanel tools, email features, CDN support, SSL, and migration assistance in one starter-friendly package",
    ],
    pricingNotes: [
      "Starting price: $4.50/month introductory offer.",
      "Renewal pricing ranges from $24.19/month on a 1-month term down to $16.49/month on a 3-year term.",
      "Free domain for the first year is included on eligible terms.",
      "This tier includes AI-powered malware detection and removal, but renewal rates are meaningfully higher than the introductory rate.",
    ],
    featureGroups: [
      { heading: "Core Features", items: ["20 websites", "20 GB SSD storage", "Ideal for 50K visits per month", "Unlimited FTP accounts", "Unlimited addon and parked domains"] },
      { heading: "Performance", items: ["Free CDN with Cloudflare and Argo Routing", "Static content caching", "Object caching", "Managed WordPress updates"] },
      { heading: "Security", items: ["Free SSL with Let's Encrypt", "Free malware scanning", "AI-powered malware detection and removal", "Web application firewall", "DDoS protection"] },
      { heading: "Support", items: ["24/7 chat and phone support", "30-day money-back guarantee", "Courtesy website backups", "24/7/365 server monitoring"] },
      { heading: "Control Panel And Tools", items: ["Latest cPanel web hosting control panel", "WordPress staging site", "SSH and WP-CLI", "One-click installs for more than 75 open-source scripts"] },
    ],
    factualPros: ["More website and storage headroom than the entry Hatchling plan", "Phone and chat support are included", "Broad cPanel, email, and WordPress tool coverage for a low introductory price"],
    factualCons: ["Renewal pricing is much higher than the introductory rate", "Storage remains limited to 20 GB on this plan", "AI-powered malware removal is highlighted, but some buyers may still want to compare higher-tier resource allowances"],
    buyerConsiderations: ["The strongest rate depends on committing to a longer billing term.", "This plan is still shared hosting, so it is better suited to moderate workloads than heavy custom applications.", "Customers who need larger storage or much higher visitor capacity may outgrow it faster than the Business tier."],
    assumptionNotes: ["Mapped to the Baby plan in HostGator Web Hosting because the Section B title matches the published Baby shared hosting plan name exactly."],
    sourcePlanName: "Baby",
  },
  {
    title: "HostGator Business Shared Hosting",
    preferredProductId: 9096034222319,
    handle: "hostgator-business-shared-hosting",
    vendor: HOSTGATOR_VENDOR,
    officialUrl: "https://www.hostgator.com/web-hosting",
    price: "6.25",
    productType: "Shared Hosting",
    productCategoryLabel: "Business Shared Hosting",
    bodyCategory: "business-oriented shared hosting with higher website limits, stronger support coverage, and added privacy and security value",
    categoryHints: ["Cloud Services", "Shared Hosting", "Business Shared Hosting", "cPanel Shared Hosting", "SSD Shared Hosting", "Multi-Domain Hosting"],
    filters: {
      hosting_type: ["Shared hosting"],
      pricing_model: ["Subscription"],
      price_band: [priceBand("6.25")],
      billing_cycle: ["Monthly", "Quarterly", "Annual"],
      performance_tier: ["Premium"],
      control_panel: ["cPanel"],
      support_coverage: ["24/7 support", "Migration / onboarding help"],
      target_segment: ["Small business", "Mid-market"],
    },
    seoTitle: "HostGator Business Shared Hosting HostGator Business Hosting",
    seoDescription: "HostGator Business Shared Hosting starts at $6.25/month with 50 websites, 50 GB SSD storage, domain privacy, SSL, CDN, and 24/7 phone support.",
    audience: "small businesses, growing content brands, and teams that want more room, more traffic tolerance, and extra trust features on a shared hosting plan",
    introTheme: "the Business shared hosting tier from HostGator, aimed at buyers who need broader website capacity, higher traffic headroom, and added value such as first-year domain privacy",
    useCases: [
      "supporting a larger portfolio of business sites, microsites, or campaign pages from one account",
      "running sites that expect higher traffic than an entry shared plan is usually comfortable handling",
      "combining shared hosting simplicity with stronger bundled security and branding-related extras",
    ],
    pricingNotes: [
      "Starting price: $6.25/month introductory offer.",
      "Renewal pricing ranges from $30.79/month on a 1-month term down to $21.99/month on a 3-year term.",
      "Free domain for the first year and first-year domain privacy are included on eligible terms.",
      "The entry price is low, but the long-term rate is substantially higher after the promotional period.",
    ],
    featureGroups: [
      { heading: "Core Features", items: ["50 websites", "50 GB SSD storage", "Ideal for 200K visits per month", "Unlimited addon and parked domains", "Free site migration tool"] },
      { heading: "Performance", items: ["Free CDN with Cloudflare and Argo Routing", "Static content caching", "Object caching", "Managed WordPress updates", "WordPress staging site"] },
      { heading: "Security", items: ["Free SSL with Let's Encrypt", "Free malware scanning", "AI-powered malware detection and removal", "Web application firewall", "DDoS protection", "Domain privacy for the first year"] },
      { heading: "Support", items: ["24/7 chat and phone support", "30-day money-back guarantee", "Courtesy website backups", "24/7/365 server monitoring"] },
      { heading: "Control Panel And Apps", items: ["Latest cPanel control panel", "SSH and WP-CLI", "One-click installs", "Support for WordPress, Joomla, Drupal, Magento, and wiki hosting"] },
    ],
    factualPros: ["Higher website count and traffic guidance than lower shared tiers", "Includes first-year domain privacy", "Keeps the same broad cPanel and WordPress tooling while adding more capacity"],
    factualCons: ["Renewal prices rise sharply after the introductory term", "Still a shared hosting environment rather than a VPS or dedicated server", "Some buyers may not need the higher website limit and can save with a lower plan"],
    buyerConsiderations: ["This plan is most attractive when the additional website limit and privacy benefit will actually be used.", "Shared hosting convenience remains the tradeoff for customers who want deeper server-level control.", "Review the renewal term carefully if the plan is being chosen for long-term hosting rather than a short promotional window."],
    assumptionNotes: ["Mapped to the Business plan in HostGator Web Hosting because the Section B title matches the published Business shared hosting plan directly."],
    sourcePlanName: "Business",
  },
  {
    title: "HostGator Hatchling Shared Hosting",
    preferredProductId: 9096034287855,
    handle: "hostgator-hatchling-shared-hosting",
    vendor: HOSTGATOR_VENDOR,
    officialUrl: "https://www.hostgator.com/web-hosting",
    price: "3.75",
    productType: "Shared Hosting",
    productCategoryLabel: "Shared Hosting",
    bodyCategory: "entry shared hosting designed for lower-cost launches, smaller websites, and customers who want cPanel tools with a lighter starting price",
    categoryHints: ["Cloud Services", "Shared Hosting", "Beginner Hosting Plans", "cPanel Shared Hosting", "SSD Shared Hosting"],
    filters: {
      hosting_type: ["Shared hosting"],
      pricing_model: ["Subscription"],
      price_band: [priceBand("3.75")],
      billing_cycle: ["Monthly", "Quarterly", "Annual"],
      performance_tier: ["Standard"],
      control_panel: ["cPanel"],
      support_coverage: ["24/7 support", "Migration / onboarding help"],
      target_segment: ["Individuals", "Small business"],
    },
    seoTitle: "HostGator Hatchling Shared Hosting HostGator Starter Hosting",
    seoDescription: "HostGator Hatchling Shared Hosting starts at $3.75/month with 10 websites, 10 GB SSD storage, cPanel tools, SSL, CDN, and 24/7 chat support.",
    audience: "first-time site owners, small content projects, and budget-conscious buyers who still want cPanel, SSL, and a broad hosting feature set",
    introTheme: "the Hatchling shared hosting tier from HostGator, positioned as a low-cost way to get websites online with cPanel access, email tools, and common WordPress-friendly essentials",
    useCases: [
      "starting a first website, blog, or small business presence with a modest budget",
      "hosting a handful of lower-traffic sites before stepping up to a larger shared plan",
      "using common web applications and WordPress tools without needing VPS-style control",
    ],
    pricingNotes: [
      "Starting price: $3.75/month introductory offer.",
      "Renewal pricing ranges from $17.59/month on a 1-month term down to $10.99/month on a 3-year term.",
      "Free domain for the first year is included on eligible terms.",
      "Chat support is highlighted, while phone support is not listed on this tier.",
    ],
    featureGroups: [
      { heading: "Core Features", items: ["10 websites", "10 GB SSD storage", "Ideal for 40K visits per month", "Unlimited FTP accounts", "Free domain for the first year"] },
      { heading: "Performance", items: ["Free CDN with Cloudflare and Argo Routing", "Static content caching", "Object caching", "Managed WordPress updates", "WordPress staging site"] },
      { heading: "Security", items: ["Free SSL with Let's Encrypt", "Free malware scanning", "Malware detection and removal", "Web application firewall", "DDoS protection"] },
      { heading: "Support", items: ["24/7 chat support", "30-day money-back guarantee", "Courtesy website backups", "24/7/365 server monitoring"] },
      { heading: "Control Panel And Development Tools", items: ["Latest cPanel control panel", "SSH and WP-CLI", "MySQL databases with phpMyAdmin access", "One-click installs for more than 75 scripts"] },
    ],
    factualPros: ["Lowest visible paid starting price among the shared hosting plans listed", "Includes cPanel, SSL, CDN, and malware-related features despite the lower tier", "Suitable for smaller launches that do not need large storage allowances"],
    factualCons: ["Phone support is not listed for this tier", "Only 10 GB SSD storage is included", "Renewal pricing is higher than the initial offer"],
    buyerConsiderations: ["This plan works best when website count and storage needs are modest.", "Customers who need phone support or more headroom should compare the Baby and Business shared tiers.", "Longer commitments reduce the effective monthly renewal rate, but they also lock in the plan for a longer term."],
    assumptionNotes: ["Mapped to the Hatchling plan in HostGator Web Hosting because the Section B title matches the published Hatchling shared hosting plan directly."],
    sourcePlanName: "Hatchling",
  },
  {
    title: "HostGator Dedicated Shared Hosting",
    preferredProductId: 9096052867311,
    handle: "hostgator-dedicated-shared-hosting",
    vendor: HOSTGATOR_VENDOR,
    officialUrl: "https://www.hostgator.com/dedicated-server",
    price: "144.19",
    productType: "Dedicated Servers",
    productCategoryLabel: "Bare Metal Servers",
    bodyCategory: "entry dedicated server hosting with full root access, high resource isolation, and the flexibility to run Linux or Windows configurations",
    categoryHints: ["Cloud Services", "Dedicated Servers", "Bare Metal Servers"],
    filters: {
      hosting_type: ["Dedicated server"],
      pricing_model: ["Subscription"],
      price_band: [priceBand("144.19")],
      billing_cycle: ["Monthly", "Quarterly", "Annual"],
      performance_tier: ["Standard"],
      support_coverage: ["24/7 support", "Migration / onboarding help"],
      target_segment: ["Small business", "Developers", "Mid-market"],
    },
    seoTitle: "HostGator Dedicated Shared Hosting HostGator Dedicated Server",
    seoDescription: "HostGator Dedicated Hosting starts at $144.19/month with 8 CPU cores, 32 GB DDR5 RAM, 1000 GB NVMe storage, root access, and free migration.",
    audience: "buyers moving past shared or VPS plans into a fully isolated server with stronger control over performance and customization",
    introTheme: "the entry dedicated server offer in HostGator's current dedicated lineup, centered on isolated hardware, full root access, and a more traditional bare-metal hosting model",
    useCases: [
      "running heavier business sites, custom applications, or multi-service workloads that need isolated hardware",
      "moving off shared hosting when predictable dedicated resources become more important than low starting cost",
      "choosing a base dedicated server before deciding whether cPanel licensing should be included in the total monthly cost",
    ],
    pricingNotes: [
      "Starting price: $144.19/month introductory offer.",
      "Linux NVMe dedicated hosting with cPanel license renews from $206.47/month on a 1-month term down to $188.79/month on a 2-year or 3-year term.",
      "HostGator also lists a Linux version without cPanel license at the same introductory price, with renewal pricing from $190.99/month down to $174.99/month.",
      "The product is presented as one hosting option because the key difference is whether cPanel licensing is bundled into the billing structure.",
    ],
    featureGroups: [
      { heading: "Core Features", items: ["8 core CPU", "32 GB DDR5 RAM", "1000 GB NVMe storage", "Unmetered bandwidth", "3 dedicated IPs shown on the plan card"] },
      { heading: "Performance", items: ["AMD EPYC hardware", "100 Gbps port speed", "RAID 6 storage configuration", "Tier 3 data center", "Instant scalability"] },
      { heading: "Security", items: ["Advanced DDoS protection scrub center", "Linux security patches", "Create manual backups", "99.9% uptime guarantee"] },
      { heading: "Support", items: ["24/7/365 support", "Server monitoring", "Free migration", "Guided server setup", "Request a call back option"] },
      { heading: "Control And Platform", items: ["Full root access", "100% server control", "Linux or Windows operating system option", "Unlimited MySQL", "cPanel or Plesk path depending on operating system and licensing choice"] },
    ],
    factualPros: ["Dedicated hardware with full root access and unmetered bandwidth", "Free migration and guided setup are highlighted", "Supports both Linux and Windows paths within the dedicated family"],
    factualCons: ["Monthly pricing is far higher than shared or VPS plans", "cPanel licensing materially changes renewal cost", "This title originated from a misnamed Section B entry and was matched to the lowest current dedicated plan rather than a shared product"],
    buyerConsiderations: ["Choose carefully between bundled cPanel pricing and the lower no-license path if a control panel is not required.", "Dedicated hosting makes more sense when resource isolation and control are important enough to justify the higher monthly cost.", "Operating system and control panel choices should be confirmed before purchase because Linux and Windows paths differ."],
    assumptionNotes: ["Mapped to the Value Dedicated - NVMe 32 plan because the Section B title refers to dedicated hosting but is mislabeled as shared hosting.", "The listing merges the with-cPanel and without-cPanel variants into one product as instructed, with the license difference explained in pricing notes instead of creating duplicate products."],
    sourcePlanName: "Value Dedicated - NVMe 32",
  },
  {
    title: "HostGator Dedicated Pro Shared Hosting",
    preferredProductId: 9096052932847,
    handle: "hostgator-dedicated-pro-shared-hosting",
    vendor: HOSTGATOR_VENDOR,
    officialUrl: "https://www.hostgator.com/dedicated-server",
    price: "241.79",
    productType: "Dedicated Servers",
    productCategoryLabel: "High-Performance Dedicated Servers",
    bodyCategory: "mid-tier dedicated hosting with stronger CPU, memory, and storage headroom for heavier production workloads",
    categoryHints: ["Cloud Services", "Dedicated Servers", "High-Performance Dedicated Servers", "Bare Metal Servers"],
    filters: {
      hosting_type: ["Dedicated server"],
      pricing_model: ["Subscription"],
      price_band: [priceBand("241.79")],
      billing_cycle: ["Monthly", "Quarterly", "Annual"],
      performance_tier: ["Premium"],
      support_coverage: ["24/7 support", "Migration / onboarding help"],
      target_segment: ["Mid-market", "Enterprise", "Developers"],
    },
    seoTitle: "HostGator Dedicated Pro Shared Hosting HostGator Dedicated Server",
    seoDescription: "HostGator Power Dedicated Hosting starts at $241.79/month with 16 CPU cores, 64 GB DDR5 RAM, 2000 GB NVMe storage, and full root access.",
    audience: "teams that need a more capable dedicated server than an entry configuration but are not yet at the largest enterprise tier",
    introTheme: "the Power dedicated server tier from HostGator, positioned for heavier application stacks, busier websites, and customers that want larger bare-metal resource allocations",
    useCases: [
      "running larger business sites or applications that need more CPU, RAM, and storage than a base dedicated server",
      "hosting multiple demanding workloads on one isolated server with room to scale",
      "evaluating a higher-performance dedicated option while still choosing between bundled cPanel pricing and a no-license path",
    ],
    pricingNotes: [
      "Starting price: $241.79/month introductory offer.",
      "Linux NVMe dedicated hosting with cPanel license renews from $297.11/month on a 1-month term down to $271.19/month on a 2-year or 3-year term.",
      "HostGator also lists a Linux version without cPanel license at the same introductory price, with renewal pricing from $281.99/month down to $257.99/month.",
      "The product is treated as a single plan family because the licensing choice affects billing more than the underlying server resources.",
    ],
    featureGroups: [
      { heading: "Core Features", items: ["16 core CPU", "64 GB DDR5 RAM", "2000 GB NVMe storage", "Unmetered bandwidth", "3 dedicated IPs shown on the plan card"] },
      { heading: "Performance", items: ["AMD EPYC hardware", "100 Gbps port speed", "RAID 6 storage configuration", "Tier 3 data center", "High-speed websites"] },
      { heading: "Security", items: ["Advanced DDoS protection scrub center", "Linux security patches", "Create manual backups", "99.9% uptime guarantee"] },
      { heading: "Support", items: ["24/7/365 support", "Server monitoring", "Free migration", "Guided server setup", "cPanel and WordPress installation help"] },
      { heading: "Control And Platform", items: ["Full root access", "100% server control", "Linux or Windows operating system option", "Unlimited MySQL", "Control panel path depends on operating system and license choice"] },
    ],
    factualPros: ["Substantially higher memory and storage than the base dedicated tier", "Still includes migration, monitoring, and setup assistance", "Keeps full root access and dedicated resource isolation"],
    factualCons: ["Pricing is significantly higher than the entry dedicated option", "Control panel licensing still changes the real renewal cost", "Section B used a non-public plan name, so this record is aligned to the published Power dedicated tier"],
    buyerConsiderations: ["This tier makes the most sense when a base dedicated server feels undersized but the largest enterprise hardware would be excessive.", "Linux and Windows options should be compared before purchase because tooling and control panel paths differ.", "Dedicated server buyers should check the full renewal term rather than comparing promotional prices alone."],
    assumptionNotes: ["Mapped to Power Dedicated - NVMe 64 because the Section B title implies a higher dedicated tier but uses a non-public naming pattern.", "The script keeps the cPanel and no-cPanel paths in one product and explains the difference in pricing notes, as requested."],
    sourcePlanName: "Power Dedicated - NVMe 64",
  },
  {
    title: "HostGator VPS Shared Hosting",
    preferredProductId: 9096080490735,
    handle: "hostgator-vps-shared-hosting",
    vendor: HOSTGATOR_VENDOR,
    officialUrl: "https://www.hostgator.com/vps-hosting",
    price: "34.99",
    productType: "VPS Hosting",
    productCategoryLabel: "VPS Hosting",
    bodyCategory: "current NVMe VPS hosting with dedicated virtual resources, Linux-focused server control, and a clear step up from shared hosting",
    categoryHints: ["Cloud Services", "VPS Hosting", "Linux VPS", "SSD VPS"],
    filters: {
      hosting_type: ["VPS"],
      pricing_model: ["Subscription"],
      price_band: [priceBand("34.99")],
      billing_cycle: ["Monthly", "Quarterly", "Annual"],
      performance_tier: ["Standard"],
      support_coverage: ["24/7 support", "Migration / onboarding help"],
      target_segment: ["Small business", "Developers", "Mid-market"],
    },
    seoTitle: "HostGator VPS Shared Hosting HostGator VPS Hosting",
    seoDescription: "HostGator VPS Hosting starts at $34.99/month with 2 vCPU cores, 4 GB DDR5 RAM, 100 GB NVMe storage, 1 dedicated IP, and 24/7 support.",
    audience: "developers, growing businesses, and technical users who need more control and dedicated virtual resources than shared hosting can offer",
    introTheme: "the base current NVMe VPS plan from HostGator, built for customers who want server-level flexibility, resource isolation, and predictable VPS pricing without moving all the way to dedicated hardware",
    useCases: [
      "hosting business applications, stores, or websites that need more consistent resources than a shared plan typically provides",
      "managing a Linux-based server environment with SSH, cron, raw log access, and other advanced controls",
      "stepping into VPS hosting while comparing whether cPanel licensing is worth the added renewal cost",
    ],
    pricingNotes: [
      "Starting price: $34.99/month introductory offer for the current NVMe VPS plan without cPanel license.",
      "Renewal pricing on the no-cPanel path ranges from $59.99/month on a 1-month term down to $53.99/month on a 2-year or 3-year term.",
      "HostGator also lists the same plan family with cPanel license included, renewing from $71.99/month down to $65.99/month.",
      "The product is kept as one VPS listing because the main difference is whether cPanel licensing is bundled into the price.",
    ],
    featureGroups: [
      { heading: "Core Features", items: ["2 vCPU cores", "4 GB DDR5 RAM", "100 GB NVMe storage", "Unmetered bandwidth", "1 dedicated IP"] },
      { heading: "Performance", items: ["AMD EPYC servers", "10 Gbps port speed", "RAID 6 storage configuration", "Tier 3 data center", "Instant scalability"] },
      { heading: "Security", items: ["DDoS protection", "SSL certificates", "Linux security patches", "Live kernel patches without reboot", "99.9% uptime"] },
      { heading: "Support", items: ["24/7 chat and phone support", "Individual help", "Server monitoring", "Guided server setup", "Free migration available"] },
      { heading: "Advanced Features", items: ["Full Unix shell", "Secure Shell access", "Crontab access", "Unlimited MySQL databases", "Rails, Python, and Perl support", "Unlimited SFTP users"] },
    ],
    factualPros: ["Clear step up from shared hosting with dedicated virtual resources", "Strong list of advanced server-management features", "Explains the cost impact of adding cPanel without splitting the plan into duplicates"],
    factualCons: ["Renewal pricing is materially higher than the introductory rate", "cPanel licensing is not included in the lowest starting price", "The title in Section B labels this as shared hosting even though the source plan is VPS hosting"],
    buyerConsiderations: ["This plan is best for customers comfortable with a more technical hosting environment than standard shared packages.", "The no-cPanel starting price is lower, but buyers who rely on cPanel should budget for the higher licensed path.", "If workload growth is expected to be steep, higher VPS tiers may be worth comparing before purchase."],
    assumptionNotes: ["Mapped to Snappy 2000 - NVMe 4 because the Section B title refers to VPS hosting but is mislabeled as shared hosting.", "The with-cPanel and without-cPanel variants are described in one product to avoid duplicate listings."],
    sourcePlanName: "Snappy 2000 - NVMe 4",
  },
  {
    title: "HostGator WordPress Shared Hosting",
    preferredProductId: 9096171389167,
    handle: "hostgator-wordpress-shared-hosting",
    vendor: HOSTGATOR_VENDOR,
    officialUrl: "https://www.hostgator.com/managed-wordpress-hosting",
    price: "4.50",
    productType: "Managed WordPress Hosting",
    productCategoryLabel: "Managed WordPress Hosting",
    bodyCategory: "managed WordPress hosting with pre-installed WordPress, cPanel access, security tooling, and beginner-friendly site resources",
    categoryHints: ["Cloud Services", "WordPress Hosting", "Managed WordPress Hosting", "WordPress Staging Hosting"],
    filters: {
      hosting_type: ["Managed WordPress"],
      pricing_model: ["Subscription"],
      price_band: [priceBand("4.50")],
      billing_cycle: ["Monthly", "Quarterly", "Annual"],
      performance_tier: ["Standard"],
      control_panel: ["cPanel"],
      support_coverage: ["24/7 support", "Migration / onboarding help"],
      target_segment: ["Individuals", "Small business"],
    },
    seoTitle: "HostGator WordPress Shared Hosting HostGator Managed WordPress",
    seoDescription: "HostGator WordPress Hosting starts at $4.50/month with 20 websites, 20 GB SSD storage, WordPress pre-installed, SSL, CDN, and phone support.",
    audience: "WordPress users who want a lower-cost managed-style plan with pre-installed WordPress, security coverage, and familiar hosting tools",
    introTheme: "the Baby tier from HostGator's managed WordPress hosting range, focused on WordPress-ready setup, unmetered bandwidth, and buyer-friendly essentials for smaller sites",
    useCases: [
      "launching WordPress business sites, content sites, or landing pages with pre-installed WordPress",
      "keeping setup simpler with built-in SSL, CDN, email basics, and one-click WordPress tools",
      "starting with a WordPress-focused plan before moving to a higher managed tier for more resources",
    ],
    pricingNotes: [
      "Starting price: $4.50/month introductory offer.",
      "Renewal pricing ranges from $24.19/month on a 1-month term down to $16.49/month on a 3-year term.",
      "Free domain for the first year is included on eligible terms.",
      "Paid migration is available, while the lowest published rate depends on an introductory term.",
    ],
    featureGroups: [
      { heading: "Core Features", items: ["20 websites", "20 GB SSD storage", "Unmetered bandwidth", "WordPress pre-installed", "Basic email included"] },
      { heading: "Performance", items: ["Cloudflare CDN", "2 vCPUs", "One-click WordPress installs", "Auto-renewed SSL certification"] },
      { heading: "Security", items: ["Free SSL", "Malware scanning", "AI-powered malware detection and removal", "Courtesy website backups"] },
      { heading: "Support", items: ["Phone and chat support", "24/7/365 server monitoring", "Paid migration available", "30-day money-back guarantee"] },
      { heading: "Control Panel And Tools", items: ["Latest cPanel control panel", "SSH access", "Cron job scheduling", "WordPress, Joomla, Drupal, Magento, and wiki hosting support"] },
    ],
    factualPros: ["WordPress is pre-installed and paired with familiar cPanel access", "Includes phone and chat support with CDN and SSL coverage", "Offers a clear WordPress-specific starting point without VPS complexity"],
    factualCons: ["Renewal pricing is much higher than the introductory rate", "Paid migration is listed rather than free migration", "The Section B title calls it shared hosting, but the source product family is managed WordPress hosting"],
    buyerConsiderations: ["This tier is a practical fit when WordPress simplicity matters more than deep server customization.", "Storage and compute headroom remain modest, so faster-growing sites may need the Business or Pro WordPress tier.", "Review the renewal price carefully if the plan is intended for long-term use."],
    assumptionNotes: ["Mapped to the Baby plan in HostGator Managed WordPress Hosting because the Section B title points to WordPress hosting but does not include a plan name.", "The source family is managed WordPress hosting rather than standard shared hosting, so the categorization follows the published WordPress section."],
    sourcePlanName: "Baby",
  },
  {
    title: "HostGator Business Managed Hosting",
    preferredProductId: 9096861974767,
    handle: "hostgator-business-managed-hosting",
    vendor: HOSTGATOR_VENDOR,
    officialUrl: "https://www.hostgator.com/managed-wordpress-hosting",
    price: "6.25",
    productType: "Managed WordPress Hosting",
    productCategoryLabel: "Managed WordPress Hosting",
    bodyCategory: "mid-tier managed WordPress hosting with stronger resource headroom, weekly backups, and business-oriented WordPress support features",
    categoryHints: ["Cloud Services", "WordPress Hosting", "Managed WordPress Hosting", "High Traffic WordPress Hosting"],
    filters: {
      hosting_type: ["Managed WordPress"],
      pricing_model: ["Subscription"],
      price_band: [priceBand("6.25")],
      billing_cycle: ["Monthly", "Quarterly", "Annual"],
      performance_tier: ["Premium"],
      control_panel: ["cPanel"],
      support_coverage: ["24/7 support", "Migration / onboarding help"],
      target_segment: ["Small business", "Mid-market"],
    },
    seoTitle: "HostGator Business Managed Hosting HostGator Managed WordPress",
    seoDescription: "HostGator Business Managed Hosting starts at $6.25/month with 50 websites, 50 GB SSD storage, 3 vCPUs, weekly backups, and domain privacy.",
    audience: "growing businesses and WordPress site owners that need more websites, more storage, and backup improvements over a starter plan",
    introTheme: "the Business tier from HostGator's managed WordPress range, designed for customers who want more scale, more compute headroom, and stronger weekly backup coverage",
    useCases: [
      "supporting a larger set of WordPress sites or traffic-heavy business content",
      "moving beyond a starter WordPress plan while staying in a managed-friendly environment",
      "combining WordPress pre-installation with weekly backups, domain privacy, and business-grade support access",
    ],
    pricingNotes: [
      "Starting price: $6.25/month introductory offer.",
      "Renewal pricing ranges from $30.79/month on a 1-month term down to $21.99/month on a 3-year term.",
      "Free domain for the first year and first-year domain privacy are included on eligible terms.",
      "Weekly website backups are highlighted on this tier, but the gap between introductory and renewal pricing remains significant.",
    ],
    featureGroups: [
      { heading: "Core Features", items: ["50 websites", "50 GB SSD storage", "Unmetered bandwidth", "WordPress pre-installed", "Basic email included"] },
      { heading: "Performance", items: ["Cloudflare CDN", "3 vCPUs", "One-click WordPress installs", "Weekly website backups", "Auto-renewed SSL certification"] },
      { heading: "Security", items: ["Free SSL", "Malware scanning", "AI-powered malware detection and removal", "Domain privacy for the first year"] },
      { heading: "Support", items: ["Phone and chat support", "24/7/365 server monitoring", "Paid migration available", "30-day money-back guarantee"] },
      { heading: "Tools And Management", items: ["Latest cPanel control panel", "SSH access", "Cron job scheduling", "Joomla and Drupal hosting support", "Magento hosting support"] },
    ],
    factualPros: ["Noticeably more websites, storage, and compute than the entry WordPress tier", "Weekly backups and first-year domain privacy are included", "Keeps the managed WordPress setup while improving business-readiness"],
    factualCons: ["Renewal pricing rises sharply after the introductory period", "Paid migration is still listed rather than free migration", "The term managed hosting in Section B is broader than the specific managed WordPress family used here"],
    buyerConsiderations: ["This tier makes most sense when the added sites, weekly backups, and extra vCPU headroom will be used.", "It remains a WordPress-focused hosting product rather than a general-purpose server plan.", "The plan is easier to justify for businesses with multiple active sites than for a single small launch."],
    assumptionNotes: ["Mapped to the Business plan in HostGator Managed WordPress Hosting because the Section B title uses 'Business Managed Hosting' and the source provides a Business managed WordPress tier with matching positioning."],
    sourcePlanName: "Business",
  },
  {
    title: "HostGator Enterprise Managed Hosting",
    preferredProductId: 9096862073071,
    handle: "hostgator-enterprise-managed-hosting",
    vendor: HOSTGATOR_VENDOR,
    officialUrl: "https://www.hostgator.com/managed-wordpress-hosting",
    price: "",
    productType: "Managed Hosting",
    productCategoryLabel: "Managed Hosting",
    bodyCategory: "managed hosting",
    categoryHints: ["Cloud Services", "Managed Hosting"],
    filters: {},
    seoTitle: "HostGator Enterprise Managed Hosting HostGator Managed Hosting",
    seoDescription: "HostGator Enterprise Managed Hosting",
    audience: "",
    introTheme: "",
    useCases: [],
    pricingNotes: [],
    featureGroups: [],
    factualPros: [],
    factualCons: [],
    buyerConsiderations: [],
    assumptionNotes: ["No separate Enterprise managed hosting plan could be matched safely from the provided HostGator source text.", "The provided source includes Baby, Business, and Pro managed WordPress plans, but not a distinct Enterprise managed hosting plan that can be mapped without guessing."],
    sourcePlanName: null,
  },
  {
    title: "HostGator Pro Managed Hosting",
    preferredProductId: 9096862138607,
    handle: "hostgator-pro-managed-hosting",
    vendor: HOSTGATOR_VENDOR,
    officialUrl: "https://www.hostgator.com/managed-wordpress-hosting",
    price: "13.95",
    productType: "Managed WordPress Hosting",
    productCategoryLabel: "Managed WordPress Hosting",
    bodyCategory: "higher-tier managed WordPress hosting for heavier workloads, broader website limits, and more compute-intensive use cases",
    categoryHints: ["Cloud Services", "WordPress Hosting", "Managed WordPress Hosting", "High Traffic WordPress Hosting"],
    filters: {
      hosting_type: ["Managed WordPress"],
      pricing_model: ["Subscription"],
      price_band: [priceBand("13.95")],
      billing_cycle: ["Monthly", "Quarterly", "Annual"],
      performance_tier: ["Premium"],
      control_panel: ["cPanel"],
      support_coverage: ["24/7 support", "Migration / onboarding help"],
      target_segment: ["Small business", "Mid-market", "Agencies"],
    },
    seoTitle: "HostGator Pro Managed Hosting HostGator Managed WordPress",
    seoDescription: "HostGator Pro Managed Hosting starts at $13.95/month with 100 websites, 100 GB SSD storage, 5 vCPUs, weekly backups, and SSL.",
    audience: "high-traffic WordPress users, agencies, and businesses that need the biggest published managed WordPress tier in the provided HostGator source",
    introTheme: "the Pro tier from HostGator's managed WordPress range, aimed at buyers who need the largest website count and strongest published compute allocation in this WordPress family",
    useCases: [
      "supporting a larger portfolio of WordPress sites from one managed hosting account",
      "handling higher traffic or heavier plugin stacks than the lower WordPress tiers are built for",
      "getting WordPress pre-installation, weekly backups, and higher-tier compute without stepping into VPS management",
    ],
    pricingNotes: [
      "Starting price: $13.95/month introductory offer.",
      "Renewal pricing ranges from $38.49/month on a 1-month term down to $31.89/month on a 1-year term.",
      "Free domain for the first year and first-year domain privacy are included on eligible terms.",
      "Weekly backups are included, but the promotional entry price is far below the long-term renewal rate.",
    ],
    featureGroups: [
      { heading: "Core Features", items: ["100 websites", "100 GB SSD storage", "Unmetered bandwidth", "WordPress pre-installed", "Basic email included"] },
      { heading: "Performance", items: ["Cloudflare CDN", "5 vCPUs", "One-click WordPress installs", "Weekly website backups", "Auto-renewed SSL certification"] },
      { heading: "Security", items: ["Free SSL", "Malware scanning", "AI-powered malware detection and removal", "Domain privacy for the first year"] },
      { heading: "Support", items: ["Phone and chat support", "24/7/365 server monitoring", "Paid migration available", "30-day money-back guarantee"] },
      { heading: "Tools And Management", items: ["Latest cPanel control panel", "SSH access", "Cron job scheduling", "Joomla and Drupal hosting support", "Magento hosting support"] },
    ],
    factualPros: ["Largest published site count and storage allocation in the managed WordPress group provided", "Higher compute allocation than the lower WordPress tiers", "Includes weekly backups and first-year domain privacy"],
    factualCons: ["Renewal pricing is much higher than the introductory price", "Paid migration remains a limitation for buyers expecting free managed migration", "Section B uses a generic managed hosting label, but the closest factual source match is the Pro managed WordPress plan"],
    buyerConsiderations: ["This tier is best justified when the higher website count or resource envelope will actually be used.", "Buyers comparing it with VPS plans should remember it is still a managed WordPress environment rather than a broader server platform.", "If only one or two smaller WordPress sites are involved, the lower tiers may be more economical."],
    assumptionNotes: ["Mapped to the Pro plan in HostGator Managed WordPress Hosting because the Section B title uses 'Pro Managed Hosting' and the source provides a matching Pro managed WordPress tier."],
    sourcePlanName: "Pro",
  },
  {
    title: "HostGator Cloud for eCommerce WooCommerce",
    preferredProductId: 9102082408687,
    handle: "hostgator-cloud-for-ecommerce-woocommerce",
    vendor: HOSTGATOR_VENDOR,
    officialUrl: "https://www.hostgator.com/ecommerce",
    price: "12.95",
    productType: "WooCommerce Hosting",
    productCategoryLabel: "WooCommerce Hosting",
    bodyCategory: "ecommerce-focused hosting built around a store website, WordPress-based store management tools, and broader online selling features",
    categoryHints: ["Cloud Services", "E-commerce Hosting", "WooCommerce Hosting", "Managed WooCommerce Hosting", "WordPress Hosting"],
    filters: {
      pricing_model: ["Subscription"],
      price_band: [priceBand("12.95")],
      billing_cycle: ["Monthly", "Annual"],
      performance_tier: ["Premium"],
      support_coverage: ["24/7 support"],
      target_segment: ["Small business", "Mid-market"],
    },
    seoTitle: "HostGator Cloud for eCommerce WooCommerce HostGator Ecommerce Hosting",
    seoDescription: "HostGator eCommerce Hosting starts at $12.95/month with 100 GB SSD storage, analytics, product filtering, gift cards, and multichannel inventory tools.",
    audience: "online sellers that want more than a basic website and need store-oriented features, customer account tools, and broader selling functionality",
    introTheme: "the stronger of the two published HostGator ecommerce plans in the provided source, designed for stores that need a fuller feature set around online selling and multichannel inventory workflows",
    useCases: [
      "launching an online store with analytics, product filtering, payments, and customer account creation already in the package",
      "running a store that needs inventory support across more than one sales channel",
      "choosing an ecommerce-focused hosting bundle instead of assembling multiple add-ons separately",
    ],
    pricingNotes: [
      "Starting price: $12.95/month introductory offer for the Online Store + Marketplace plan.",
      "Renewal pricing is $47.95/month on a 1-month term and $39.95/month on 1-year or 3-year terms.",
      "Professional email renews at $2.99/month after the first billing cycle unless cancelled.",
      "This listing uses the Online Store + Marketplace plan because it is the stronger ecommerce fit for the WooCommerce-oriented Section B title and includes multichannel inventory features absent from the lower plan.",
    ],
    featureGroups: [
      { heading: "Core Features", items: ["Online store website", "100 GB SSD storage", "Unlimited products", "Website analytics", "Customer account creation"] },
      { heading: "Store And Selling Tools", items: ["Store creation with Wonder Theme", "Powered by YITH", "Product search and filtering", "Gift cards", "Wishlists", "Bookings and appointments", "Shipping labels", "Multi-channel inventory management"] },
      { heading: "Security And Reliability", items: ["Free SSL", "Secure online payments", "Weekly website backups", "Jetpack daily backups", "Automated WordPress updates"] },
      { heading: "Marketing And SEO", items: ["Yoast SEO", "Automatic Yoast SEO", "Pro Email free trial", "Custom account pages"] },
      { heading: "Support", items: ["24/7/365 support", "Call support", "Live chat", "Knowledge base", "30-day money-back guarantee"] },
    ],
    factualPros: ["More complete ecommerce feature set than the lower Online Store plan", "Adds multichannel inventory and shipping-label related capabilities", "Combines analytics, SEO, and store-facing features in one plan family"],
    factualCons: ["Renewal pricing is much higher than the introductory price", "Professional email becomes a paid add-on after the first billing cycle unless cancelled", "The public plan names do not explicitly use the word WooCommerce, so the match is based on the ecommerce hosting family and store feature fit"],
    buyerConsiderations: ["This plan is easier to justify when multichannel inventory and broader store tooling are actually needed.", "Sellers with simpler catalog needs may want to compare it against the lower Online Store option.", "Long-term cost should include the higher renewal price and any email add-on kept after the trial period."],
    assumptionNotes: ["Mapped to HostGator Online Store + Marketplace because the Section B title points to an ecommerce and WooCommerce-oriented offer, and this is the stronger published ecommerce plan in the provided source.", "The source does not publish a separate plan literally named Cloud for eCommerce WooCommerce, so the mapping follows the closest factual ecommerce plan family rather than inventing a title or duplicate product."],
    sourcePlanName: "Online Store + Marketplace",
  },
  ...buildRemainingTargetSpecs(),
];

function buildRemainingTargetSpecs(): ProductSpec[] {
  const specs: ProductSpec[] = [];

  specs.push({
    title: "HostGator Pro Shared Hosting",
    handle: "hostgator-pro-shared-hosting",
    vendor: HOSTGATOR_VENDOR,
    officialUrl: "https://www.hostgator.com/web-hosting",
    price: "13.95",
    productType: "Shared Hosting",
    productCategoryLabel: "Unlimited Shared Hosting",
    bodyCategory: "higher-capacity shared hosting for heavier traffic, more websites, and customers who want the largest published shared plan in this HostGator family",
    categoryHints: ["Cloud Services", "Shared Hosting", "Unlimited Shared Hosting", "Business Shared Hosting", "cPanel Shared Hosting", "SSD Shared Hosting", "Multi-Domain Hosting"],
    filters: {
      hosting_type: ["Shared hosting"],
      pricing_model: ["Subscription"],
      price_band: [priceBand("13.95")],
      billing_cycle: ["Monthly", "Quarterly", "Annual"],
      performance_tier: ["Premium"],
      control_panel: ["cPanel"],
      support_coverage: ["24/7 support", "Migration / onboarding help"],
      target_segment: ["Small business", "Mid-market"],
    },
    seoTitle: "HostGator Pro Shared Hosting HostGator Premium Shared Hosting",
    seoDescription: "HostGator Pro Shared Hosting starts at $13.95/month with 100 websites, 100 GB SSD storage, domain privacy, SSL, and 24/7 phone support.",
    audience: "growing brands, agencies, and site owners that want the largest published shared hosting tier before moving to VPS or dedicated infrastructure",
    introTheme: "the Pro shared hosting tier from HostGator, aimed at buyers who want the broadest website count, the biggest shared storage allocation, and stronger capacity than the lower shared plans",
    useCases: [
      "running a larger mix of business, campaign, or content sites from one shared hosting account",
      "staying on shared hosting while gaining more storage and visitor capacity than the Baby or Business tiers",
      "getting domain privacy, cPanel tools, CDN support, and malware-related features in the largest published shared package",
    ],
    pricingNotes: [
      "Starting price: $13.95/month introductory offer.",
      "Renewal pricing ranges from $38.49/month on a 1-month term down to $29.69/month on a 3-year term.",
      "Free domain for the first year and first-year domain privacy are included on eligible terms.",
      "This is the largest shared hosting tier in the provided HostGator source, so the higher promotional rate should be weighed against whether that extra headroom is truly needed.",
    ],
    featureGroups: [
      { heading: "Core Features", items: ["100 websites", "100 GB SSD storage", "Ideal for 400K visits per month", "Unlimited FTP accounts", "Unlimited addon and parked domains"] },
      { heading: "Performance", items: ["Free CDN with Cloudflare and Argo Routing", "Static content caching", "Object caching", "Managed WordPress updates", "WordPress staging site"] },
      { heading: "Security", items: ["Free SSL with Let's Encrypt", "Free malware scanning", "AI-powered malware detection and removal", "Web application firewall", "DDoS protection", "First-year domain privacy"] },
      { heading: "Support", items: ["24/7 chat and phone support", "30-day money-back guarantee", "Courtesy website backups", "24/7/365 server monitoring"] },
      { heading: "Control Panel And Apps", items: ["Latest cPanel control panel", "SSH and WP-CLI", "One-click installs", "Support for WordPress, Joomla, Drupal, Magento, and wiki hosting"] },
    ],
    factualPros: ["Largest website and storage allocation in the shared hosting family provided", "Keeps phone support and first-year domain privacy", "Offers more room before an upgrade to VPS becomes necessary"],
    factualCons: ["Higher introductory and renewal cost than the lower shared plans", "Still a shared hosting environment rather than isolated VPS resources", "Some buyers may be paying for scale they do not yet need"],
    buyerConsiderations: ["This plan makes the most sense when the additional website count or traffic capacity will actually be used.", "Shared hosting simplicity remains part of the package, so customers who need deep system control should compare VPS instead.", "The gap between promotional and renewal pricing is significant and should be reviewed carefully."],
    assumptionNotes: ["Mapped to the Pro plan in HostGator Web Hosting because it is the remaining named shared hosting plan in the provided source that was not yet represented in Shopify."],
    sourcePlanName: "Pro",
  });

  specs.push({
    title: "HostGator Online Store Hosting",
    handle: "hostgator-online-store-hosting",
    vendor: HOSTGATOR_VENDOR,
    officialUrl: "https://www.hostgator.com/ecommerce",
    price: "9.95",
    productType: "E-commerce Hosting",
    productCategoryLabel: "E-commerce Hosting",
    bodyCategory: "store-focused hosting for online sellers that need a website, product catalog, payments, analytics, and customer account features in one package",
    categoryHints: ["Cloud Services", "E-commerce Hosting", "WooCommerce Hosting", "WordPress Hosting"],
    filters: {
      pricing_model: ["Subscription"],
      price_band: [priceBand("9.95")],
      billing_cycle: ["Monthly", "Annual"],
      performance_tier: ["Standard"],
      support_coverage: ["24/7 support"],
      target_segment: ["Small business"],
    },
    seoTitle: "HostGator Online Store Hosting HostGator Ecommerce Hosting",
    seoDescription: "HostGator Online Store Hosting starts at $9.95/month with 50 GB SSD storage, analytics, SEO tools, backups, and store features for growing sellers.",
    audience: "smaller online sellers that need more than a brochure site but do not yet need multichannel inventory tooling",
    introTheme: "the entry ecommerce hosting tier from HostGator, built for merchants who want a store-ready website with payments, analytics, and practical selling tools without stepping up to the broader marketplace plan",
    useCases: [
      "launching an online store with a catalog, gift cards, SEO tools, and secure payments in one setup",
      "running a smaller ecommerce site that does not yet need multichannel inventory management",
      "choosing a bundled selling package instead of layering separate plugins and services from scratch",
    ],
    pricingNotes: [
      "Starting price: $9.95/month introductory offer.",
      "Renewal pricing is $29.95/month on a 1-month term and $24.95/month on 1-year or 3-year terms.",
      "Professional email is offered as a free trial and renews at $2.99/month after the first billing cycle unless cancelled.",
      "The lower price comes with fewer ecommerce operations features than the Online Store + Marketplace plan.",
    ],
    featureGroups: [
      { heading: "Core Features", items: ["Online store website", "50 GB SSD storage", "Unlimited products", "Website analytics", "Customer account creation"] },
      { heading: "Store Tools", items: ["Store creation with Wonder Theme", "Powered by YITH", "Product search and filtering", "Gift cards", "Wishlists", "Bookings and appointments"] },
      { heading: "Security And Reliability", items: ["Free SSL", "Secure online payments", "Weekly website backups", "Jetpack daily backups", "Automated WordPress updates"] },
      { heading: "Marketing And SEO", items: ["Yoast SEO", "Automatic Yoast SEO", "Pro Email free trial", "Custom account pages"] },
      { heading: "Support", items: ["24/7/365 support", "Call support", "Live chat", "Knowledge base", "30-day money-back guarantee"] },
    ],
    factualPros: ["Lower entry price than the stronger ecommerce tier", "Includes analytics, SEO tooling, and store-facing features in one plan", "Suitable for online stores that do not need multichannel inventory management yet"],
    factualCons: ["Renewal pricing rises significantly after the introductory period", "Professional email becomes a paid add-on unless cancelled", "The broader marketplace and multichannel features are reserved for the higher ecommerce plan"],
    buyerConsiderations: ["This plan fits best when one primary storefront is enough and cross-channel selling is not yet a priority.", "Merchants expecting more operational complexity may want to compare it with the Online Store + Marketplace tier.", "Long-term costs should include the higher renewal rate and any paid email add-ons that remain active."],
    assumptionNotes: ["Created from the remaining published Online Store ecommerce plan in HostGator's ecommerce section because the stronger Online Store + Marketplace plan was already represented by the existing WooCommerce-oriented product."],
    sourcePlanName: "Online Store",
  });

  specs.push({
    title: "HostGator Enterprise Dedicated Hosting",
    handle: "hostgator-enterprise-dedicated-hosting",
    vendor: HOSTGATOR_VENDOR,
    officialUrl: "https://www.hostgator.com/dedicated-server",
    price: "346.79",
    productType: "Dedicated Servers",
    productCategoryLabel: "Enterprise Dedicated Servers",
    bodyCategory: "enterprise-grade dedicated hosting with the largest published HostGator hardware profile in the provided source",
    categoryHints: ["Cloud Services", "Dedicated Servers", "Enterprise Dedicated Servers", "Bare Metal Servers"],
    filters: {
      hosting_type: ["Dedicated server"],
      pricing_model: ["Subscription"],
      price_band: [priceBand("346.79")],
      billing_cycle: ["Monthly", "Quarterly", "Annual"],
      performance_tier: ["Enterprise"],
      support_coverage: ["24/7 support", "Migration / onboarding help"],
      target_segment: ["Enterprise", "Mid-market", "Developers"],
    },
    seoTitle: "HostGator Enterprise Dedicated Hosting HostGator Dedicated Server",
    seoDescription: "HostGator Enterprise Dedicated Hosting starts at $346.79/month with 32 CPU cores, 128 GB DDR5 RAM, 3000 GB NVMe storage, and full root access.",
    audience: "teams that need the largest dedicated server configuration published in the provided HostGator source",
    introTheme: "the Enterprise dedicated server tier from HostGator, designed for heavier infrastructure workloads, larger websites, and customers that need the biggest bare-metal resource envelope in this family",
    useCases: [
      "running larger production environments that need substantial memory, storage, and dedicated CPU resources",
      "consolidating demanding workloads onto one powerful server with full hardware isolation",
      "choosing an enterprise-grade dedicated server while still comparing control panel licensing and operating system options carefully",
    ],
    pricingNotes: [
      "Starting price: $346.79/month introductory offer.",
      "Linux NVMe dedicated hosting with cPanel license renews from $429.11/month on a 1-month term down to $391.19/month on a 2-year or 3-year term.",
      "HostGator also lists a Linux version without cPanel license at the same introductory price, with renewal pricing from $413.99/month down to $377.99/month.",
      "The listing keeps the with-cPanel and without-cPanel paths together because the server resources remain the same while the licensing structure changes the billing.",
    ],
    featureGroups: [
      { heading: "Core Features", items: ["32 core CPU", "128 GB DDR5 RAM", "3000 GB NVMe storage", "Unmetered bandwidth", "3 dedicated IPs shown on the plan card"] },
      { heading: "Performance", items: ["AMD EPYC hardware", "100 Gbps port speed", "RAID 6 storage configuration", "Tier 3 data center", "High-speed websites"] },
      { heading: "Security", items: ["Advanced DDoS protection scrub center", "Linux security patches", "Create manual backups", "99.9% uptime guarantee"] },
      { heading: "Support", items: ["24/7/365 support", "Server monitoring", "Free migration", "Guided server setup", "cPanel and WordPress installation help"] },
      { heading: "Control And Platform", items: ["Full root access", "100% server control", "Linux or Windows operating system option", "Unlimited MySQL", "Plesk or cPanel path depending on platform and license choice"] },
    ],
    factualPros: ["Largest published dedicated hardware configuration in the provided source", "Includes migration, monitoring, and setup help", "Keeps Linux and Windows deployment options within the same server family"],
    factualCons: ["Highest monthly cost in the dedicated group covered here", "Control panel licensing changes the real renewal cost materially", "This plan is oversized for buyers whose workloads could still fit on VPS or lower dedicated tiers"],
    buyerConsiderations: ["This tier should usually be chosen for real resource requirements rather than promotional pricing alone.", "Operating system and control panel choices should be confirmed early because they affect tooling and renewal cost.", "For some teams, the Power tier may be the better value if the full enterprise hardware envelope is not necessary."],
    assumptionNotes: ["Created from the remaining Enterprise Dedicated - NVMe 128 plan in HostGator's current dedicated lineup.", "The with-cPanel and without-cPanel variants are described together instead of being split into duplicate products."],
    sourcePlanName: "Enterprise Dedicated - NVMe 128",
  });

  [
    {
      title: "HostGator Snappy 4000 VPS Hosting",
      handle: "hostgator-snappy-4000-vps-hosting",
      price: "53.99",
      sourcePlanName: "Snappy 4000 - NVMe 8",
      categoryHints: ["Cloud Services", "VPS Hosting", "NVMe VPS", "Linux VPS", "Scalable VPS"],
      performanceTier: "Premium",
      seoDescription: "HostGator Snappy 4000 VPS Hosting starts at $53.99/month with 4 vCPU cores, 8 GB DDR5 RAM, 200 GB NVMe storage, and 24/7 support.",
      introTheme: "a mid-tier current NVMe VPS plan from HostGator for customers who need more memory and storage than the entry VPS tier while keeping server-level control",
      audience: "developers, growing businesses, and technical site owners that need more headroom than an entry VPS plan",
      useCases: [
        "running heavier websites, stores, or applications than the base VPS tier is built for",
        "keeping VPS flexibility while moving to a more capable resource profile",
        "comparing the no-cPanel and bundled-cPanel billing paths without creating duplicate listings",
      ],
      pricingNotes: [
        "Starting price: $53.99/month introductory offer for the current NVMe VPS plan without cPanel license.",
        "Renewal pricing on the no-cPanel path ranges from $92.99/month on a 1-month term down to $83.99/month on a 2-year or 3-year term.",
        "The same plan family with cPanel license included renews from $104.99/month down to $95.99/month.",
        "The listing keeps the cPanel and no-cPanel paths together because the server resources are the same and the main difference is bundled licensing cost.",
      ],
      featureGroups: [
        { heading: "Core Features", items: ["4 vCPU cores", "8 GB DDR5 RAM", "200 GB NVMe storage", "Unmetered bandwidth", "1 dedicated IP"] },
        { heading: "Performance", items: ["AMD EPYC servers", "10 Gbps port speed", "RAID 6 storage configuration", "Tier 3 data center", "Instant scalability"] },
        { heading: "Security", items: ["DDoS protection", "SSL certificates", "Linux security patches", "Live kernel patches without reboot", "99.9% uptime"] },
        { heading: "Support", items: ["24/7 chat and phone support", "Individual help", "Server monitoring", "Guided server setup", "Free migration available"] },
        { heading: "Advanced Features", items: ["Full Unix shell", "Secure Shell access", "Crontab access", "Unlimited MySQL databases", "Rails, Python, and Perl support", "Unlimited SFTP users"] },
      ],
      factualPros: ["More memory and storage than the entry Snappy 2000 VPS plan", "Keeps advanced server-management controls and migration support", "Explains the cPanel cost split without creating a second duplicate product"],
      factualCons: ["Renewal pricing is much higher than the entry promotional rate", "cPanel is not included in the lowest listed starting price", "Still requires a more technical operating model than shared or managed WordPress hosting"],
      buyerConsiderations: ["This plan is a better fit than the entry VPS tier when application or site resource needs are already growing.", "The no-cPanel rate is lower, but buyers that rely on cPanel should budget around the licensed path instead.", "Teams that need even more resource headroom should compare it with the Snappy 8000 plan."],
    },
    {
      title: "HostGator Snappy 8000 VPS Hosting",
      handle: "hostgator-snappy-8000-vps-hosting",
      price: "82.99",
      sourcePlanName: "Snappy 8000 - NVMe 16",
      categoryHints: ["Cloud Services", "VPS Hosting", "NVMe VPS", "Linux VPS", "High-RAM VPS", "Scalable VPS"],
      performanceTier: "Premium",
      seoDescription: "HostGator Snappy 8000 VPS Hosting starts at $82.99/month with 8 vCPU cores, 16 GB DDR5 RAM, 450 GB NVMe storage, and 24/7 support.",
      introTheme: "the largest current NVMe VPS plan in the HostGator source provided, aimed at heavier workloads that need more memory, storage, and virtual CPU resources",
      audience: "technical teams, growing online businesses, and users that need the largest resource profile in this current HostGator VPS family",
      useCases: [
        "running larger production workloads that need more VPS headroom than the lower tiers provide",
        "supporting busier stores, apps, or custom hosting setups while keeping virtualized server control",
        "reviewing a high-resource VPS option before jumping all the way to dedicated hardware",
      ],
      pricingNotes: [
        "Starting price: $82.99/month introductory offer for the current NVMe VPS plan without cPanel license.",
        "Renewal pricing on the no-cPanel path ranges from $141.99/month on a 1-month term down to $128.99/month on a 3-year term.",
        "The same plan family with cPanel license included renews from $153.99/month down to $140.99/month.",
        "The product keeps the cPanel and no-cPanel variants in one listing because the server resources are unchanged and the pricing difference comes from bundled licensing.",
      ],
      featureGroups: [
        { heading: "Core Features", items: ["8 vCPU cores", "16 GB DDR5 RAM", "450 GB NVMe storage", "Unmetered bandwidth", "1 dedicated IP"] },
        { heading: "Performance", items: ["AMD EPYC servers", "10 Gbps port speed", "RAID 6 storage configuration", "Tier 3 data center", "Instant scalability"] },
        { heading: "Security", items: ["DDoS protection", "SSL certificates", "Linux security patches", "Live kernel patches without reboot", "99.9% uptime"] },
        { heading: "Support", items: ["24/7 chat and phone support", "Individual help", "Server monitoring", "Guided server setup", "Free migration available"] },
        { heading: "Advanced Features", items: ["Full Unix shell", "Secure Shell access", "Crontab access", "Unlimited MySQL databases", "Rails, Python, and Perl support", "Unlimited SFTP users"] },
      ],
      factualPros: ["Largest current NVMe VPS plan in the provided HostGator VPS lineup", "Combines strong storage, memory, and virtual CPU allocations with advanced controls", "Still easier to scale and price than moving immediately to dedicated hardware"],
      factualCons: ["Renewal pricing is substantially higher than the promotional entry rate", "cPanel is not included in the lowest price", "This plan may be more than smaller businesses actually need"],
      buyerConsiderations: ["This tier makes most sense when VPS-level flexibility is still desired but the lower plans feel undersized.", "For buyers that need the most predictable isolation possible, dedicated hosting remains worth comparing.", "The real cost should be reviewed with the desired control panel path and term length in mind."],
    },
  ].forEach((seed) => {
    specs.push({
      title: seed.title,
      handle: seed.handle,
      vendor: HOSTGATOR_VENDOR,
      officialUrl: "https://www.hostgator.com/vps-hosting",
      price: seed.price,
      productType: "VPS Hosting",
      productCategoryLabel: "NVMe VPS",
      bodyCategory: "current NVMe VPS hosting with dedicated virtual resources, Linux-focused control, and more room than entry shared plans",
      categoryHints: seed.categoryHints,
      filters: {
        hosting_type: ["VPS"],
        pricing_model: ["Subscription"],
        price_band: [priceBand(seed.price)],
        billing_cycle: ["Monthly", "Quarterly", "Annual"],
        performance_tier: [seed.performanceTier],
        support_coverage: ["24/7 support", "Migration / onboarding help"],
        target_segment: ["Small business", "Developers", "Mid-market"],
      },
      seoTitle: `${seed.title} HostGator VPS Hosting`,
      seoDescription: seed.seoDescription,
      audience: seed.audience,
      introTheme: seed.introTheme,
      useCases: seed.useCases,
      pricingNotes: seed.pricingNotes,
      featureGroups: seed.featureGroups,
      factualPros: seed.factualPros,
      factualCons: seed.factualCons,
      buyerConsiderations: seed.buyerConsiderations,
      assumptionNotes: [
        `Created from the remaining current HostGator VPS plan ${seed.sourcePlanName}.`,
        "The with-cPanel and without-cPanel variants are represented in one product to avoid duplicate listings.",
      ],
      sourcePlanName: seed.sourcePlanName,
    });
  });

  [
    {
      title: "HostGator Snappy 2000 Reseller Hosting",
      handle: "hostgator-snappy-2000-reseller-hosting",
      price: "34.99",
      sourcePlanName: "Snappy 2000 - NVMe 4",
      vcpu: "2 vCPU cores",
      ram: "4 GB DDR5 RAM",
      storage: "100 GB NVMe storage",
      bandwidth: "Unmetered bandwidth",
      performanceTier: "Standard",
    },
    {
      title: "HostGator Snappy 4000 Reseller Hosting",
      handle: "hostgator-snappy-4000-reseller-hosting",
      price: "53.99",
      sourcePlanName: "Snappy 4000 - NVMe 8",
      vcpu: "4 vCPU cores",
      ram: "8 GB DDR5 RAM",
      storage: "200 GB NVMe storage",
      bandwidth: "Unmetered bandwidth",
      performanceTier: "Premium",
    },
    {
      title: "HostGator Snappy 8000 Reseller Hosting",
      handle: "hostgator-snappy-8000-reseller-hosting",
      price: "82.99",
      sourcePlanName: "Snappy 8000 - NVMe 16",
      vcpu: "8 vCPU cores",
      ram: "16 GB DDR5 RAM",
      storage: "450 GB NVMe storage",
      bandwidth: "Unmetered bandwidth",
      performanceTier: "Premium",
    },
  ].forEach((seed) => {
    specs.push({
      title: seed.title,
      handle: seed.handle,
      vendor: HOSTGATOR_VENDOR,
      officialUrl: "https://www.hostgator.com/reseller-hosting",
      price: seed.price,
      productType: "Reseller Hosting",
      productCategoryLabel: "WHM Reseller Hosting",
      bodyCategory: "reseller hosting built for white-label hosting businesses that want WHM tools, resource control, and VPS-style infrastructure under the hood",
      categoryHints: ["Cloud Services", "Reseller Hosting", "WHM Reseller Hosting", "cPanel Reseller Hosting", "Linux Reseller Hosting", "White Label Hosting"],
      filters: {
        hosting_type: ["Reseller hosting"],
        pricing_model: ["Subscription"],
        price_band: [priceBand(seed.price)],
        billing_cycle: ["Monthly", "Quarterly", "Annual"],
        performance_tier: [seed.performanceTier],
        control_panel: ["cPanel"],
        support_coverage: ["24/7 support", "Priority support", "Migration / onboarding help"],
        target_segment: ["Small business", "Agencies", "Developers"],
      },
      seoTitle: `${seed.title} HostGator Reseller Hosting`,
      seoDescription: `${seed.title} starts at $${seed.price}/month with ${seed.vcpu}, ${seed.ram}, ${seed.storage}, WHM tools, and white-label reseller features.`,
      audience: "agencies, hosting entrepreneurs, and technical teams that want to resell hosting under their own brand",
      introTheme: `the ${seed.sourcePlanName} reseller hosting plan from HostGator, built for white-label hosting businesses that need WHM controls, client-management flexibility, and scalable NVMe-backed resources`,
      useCases: [
        "launching or growing a white-label hosting business",
        "managing client allocations, cPanel support, and business controls from one reseller environment",
        "choosing a reseller plan while comparing the effect of optional cPanel licensing on long-term cost",
      ],
      pricingNotes: [
        `Starting price: $${seed.price}/month introductory offer.`,
        "Renewal pricing without cPanel license follows the matching current HostGator VPS-family reseller rates and rises after the promotional period.",
        "Renewal pricing with cPanel license is higher because licensing is bundled into the billing path.",
        "The listing keeps the cPanel and no-cPanel paths together because the underlying reseller resources are the same and the major difference is licensing cost.",
      ],
      featureGroups: [
        { heading: "Core Features", items: [seed.vcpu, seed.ram, seed.storage, seed.bandwidth, "1 dedicated IP"] },
        { heading: "Reseller Features", items: ["White-label hosting business support", "WHM tools", "Billing software support", "Resource allocation control", "Payment method control", "Client service control", "Unlimited websites"] },
        { heading: "Email And Platform", items: ["Unlimited email accounts", "Unlimited MySQL databases", "Unlimited FTP accounts", "AlmaLinux 9", "Softaculous script installer", "cPanel and WHM optional"] },
        { heading: "Security And Network", items: ["Let's Encrypt SSL included", "Centralized DDoS protection", "Create manual and scheduled backups", "US-based data centers", "Fully redundant network"] },
        { heading: "Support", items: ["Premium support", "Server monitoring and remediation", "24/7/365 support", "30-day money-back guarantee", "Free migration available"] },
      ],
      factualPros: ["Purpose-built for reseller businesses rather than standard end-customer hosting", "WHM, white-label, and client control features are clearly highlighted", "Lets buyers compare licensing choices without creating duplicate plan listings"],
      factualCons: ["Renewal pricing rises after the introductory period", "cPanel is optional rather than included in the lowest promotional rate", "This is a more technical fit than entry shared hosting or simple managed website plans"],
      buyerConsiderations: ["This product is best suited to buyers that genuinely plan to manage hosting for clients or multiple end users.", "The reseller value becomes clearer when the white-label and WHM tooling will actually be used.", "It is worth deciding early whether optional cPanel licensing is essential to the intended business model."],
      assumptionNotes: [
        `Created from the remaining HostGator reseller plan ${seed.sourcePlanName}.`,
        "The with-cPanel and without-cPanel variants are combined into one product to avoid duplicate listings.",
      ],
      sourcePlanName: seed.sourcePlanName,
    });
  });

  [
    { family: "OpenClaw", title: "HostGator OpenClaw NVMe 2 VPS Hosting", handle: "hostgator-openclaw-nvme-2-vps-hosting", price: "2.09", renewal: "4.68", vcpu: "1 vCPU core", ram: "2 GB DDR5 RAM", storage: "50 GB NVMe storage", note: "Built for smaller OpenClaw workflow deployments and experimentation." },
    { family: "OpenClaw", title: "HostGator OpenClaw NVMe 4 VPS Hosting", handle: "hostgator-openclaw-nvme-4-vps-hosting", price: "4.18", renewal: "9.35", vcpu: "2 vCPU cores", ram: "4 GB DDR5 RAM", storage: "100 GB NVMe storage", note: "Recommended option in the provided OpenClaw lineup." },
    { family: "OpenClaw", title: "HostGator OpenClaw NVMe 8 VPS Hosting", handle: "hostgator-openclaw-nvme-8-vps-hosting", price: "8.36", renewal: "18.70", vcpu: "4 vCPU cores", ram: "8 GB DDR5 RAM", storage: "200 GB NVMe storage", note: "Better suited to larger OpenClaw workflow volumes and integration needs." },
    { family: "OpenClaw", title: "HostGator OpenClaw NVMe 16 VPS Hosting", handle: "hostgator-openclaw-nvme-16-vps-hosting", price: "17.67", renewal: "39.53", vcpu: "8 vCPU cores", ram: "16 GB DDR5 RAM", storage: "450 GB NVMe storage", note: "Fastest and highest-performing plan in the provided OpenClaw lineup." },
    { family: "GatorClaw", title: "HostGator GatorClaw NVMe 2 VPS Hosting", handle: "hostgator-gatorclaw-nvme-2-vps-hosting", price: "2.09", renewal: "4.68", vcpu: "1 vCPU core", ram: "2 GB DDR5 RAM", storage: "50 GB NVMe storage", note: "Focused on simpler no-code AI agent automation with guided setup." },
    { family: "GatorClaw", title: "HostGator GatorClaw NVMe 4 VPS Hosting", handle: "hostgator-gatorclaw-nvme-4-vps-hosting", price: "4.18", renewal: "9.35", vcpu: "2 vCPU cores", ram: "4 GB DDR5 RAM", storage: "100 GB NVMe storage", note: "Recommended option in the provided GatorClaw lineup." },
    { family: "GatorClaw", title: "HostGator GatorClaw NVMe 8 VPS Hosting", handle: "hostgator-gatorclaw-nvme-8-vps-hosting", price: "8.36", renewal: "18.70", vcpu: "4 vCPU cores", ram: "8 GB DDR5 RAM", storage: "200 GB NVMe storage", note: "Better suited to larger AI-agent workflows and bigger tech stacks." },
    { family: "GatorClaw", title: "HostGator GatorClaw NVMe 16 VPS Hosting", handle: "hostgator-gatorclaw-nvme-16-vps-hosting", price: "17.67", renewal: "39.53", vcpu: "8 vCPU cores", ram: "16 GB DDR5 RAM", storage: "450 GB NVMe storage", note: "Highest-performing GatorClaw VPS option in the provided source." },
  ].forEach((seed) => {
    const isOpenClaw = seed.family === "OpenClaw";
    specs.push({
      title: seed.title,
      handle: seed.handle,
      vendor: HOSTGATOR_VENDOR,
      officialUrl: isOpenClaw
        ? "https://www.hostgator.com/vps-hosting/openclaw"
        : "https://www.hostgator.com/vps-hosting/gatorclaw",
      price: seed.price,
      productType: "VPS Hosting",
      productCategoryLabel: "Scalable VPS",
      bodyCategory: `${seed.family.toLowerCase()}-oriented self-managed VPS hosting with NVMe storage, dedicated virtual resources, and workflow-focused infrastructure controls`,
      categoryHints: ["Cloud Services", "VPS Hosting", "NVMe VPS", "Scalable VPS"],
      filters: {
        hosting_type: ["VPS"],
        pricing_model: ["Subscription"],
        price_band: [priceBand(seed.price)],
        billing_cycle: ["Monthly", "Annual"],
        performance_tier: [Number(seed.price) >= 17 ? "Premium" : "Standard"],
        support_coverage: ["24/7 support"],
        target_segment: ["Developers", "Small business"],
      },
      seoTitle: `${seed.title} HostGator ${seed.family} VPS`,
      seoDescription: `${seed.title} starts at $${seed.price}/month with ${seed.vcpu}, ${seed.ram}, ${seed.storage}, unmetered bandwidth, and 24/7 infrastructure support.`,
      audience: isOpenClaw
        ? "technical users that want to run OpenClaw workflows on isolated VPS infrastructure with one-click deployment and strong control"
        : "teams that want a simpler no-code AI agent automation setup on self-managed VPS infrastructure",
      introTheme: isOpenClaw
        ? `a ${seed.family} VPS plan from HostGator for customers that want dedicated resources, workflow-oriented deployment, and full control over their own automation infrastructure`
        : `a ${seed.family} VPS plan from HostGator for customers that want guided AI-agent automation setup on dedicated VPS resources without giving up server-level control`,
      useCases: isOpenClaw
        ? [
            "running event-driven workflow systems and agent orchestration on isolated infrastructure",
            "deploying containerized OpenClaw environments with room to scale resources as volumes grow",
            "keeping hardware, network, and virtualization managed by HostGator while controlling the software stack directly",
          ]
        : [
            "launching no-code or guided AI-agent automation workflows on dedicated VPS resources",
            "connecting tools such as Gmail, Slack, and CRM-style services to automation flows",
            "using a simpler AI automation path while still keeping control of the runtime, applications, and configurations",
          ],
      pricingNotes: [
        `Starting price: $${seed.price}/month based on the lowest visible introductory 24-month rate shown in the provided source.`,
        `${seed.family} also shows higher introductory monthly and 1-year promotional rates depending on term length.`,
        `The 2-year renewal price shown in the source is $${seed.renewal}/month.`,
        seed.note,
      ],
      featureGroups: [
        { heading: "Core Features", items: [seed.vcpu, seed.ram, seed.storage, "Unmetered bandwidth", "24/7 support"] },
        { heading: "Performance", items: ["NVMe SSD storage", "Dedicated CPU, RAM, and storage", "Predictable performance", "Add resources on demand", "Handles traffic spikes"] },
        { heading: "Control And Deployment", items: isOpenClaw ? ["One-click OpenClaw deployment", "Containerized OpenClaw environment", "Full server-level control", "Infrastructure-level control", "Role-based permissions"] : ["No-code AI agent automation", "Guided setup", "Full server-level control", "Flexible infrastructure for AI automation", "Support for Gmail, Slack, and CRM-style tool connections"] },
        { heading: "Security And Reliability", items: ["Real-time monitoring", "Isolated infrastructure", "HostGator maintains hardware, network, and virtualization", "User manages OS, configurations, and applications", "Fault isolation or secure VPS environment"] },
        { heading: "Support", items: ["24/7 support", "Infrastructure-only support", "HostGator maintains the infrastructure layer", "Customer manages the software and runtime stack"] },
      ],
      factualPros: isOpenClaw
        ? ["Combines VPS-level control with workflow-oriented deployment details", "Uses dedicated resources rather than shared hosting", "Pricing notes clearly separate promotional and renewal paths"]
        : ["Positions AI-agent automation more simply than a generic self-managed VPS", "Keeps dedicated resources and server control", "Highlights tool-connection and workflow-oriented usage"],
      factualCons: isOpenClaw
        ? ["Infrastructure support does not replace user responsibility for OS and application management", "The best listed price depends on a longer introductory term", "These plans are more technical than entry shared or managed hosting offers"]
        : ["Infrastructure support does not cover full application management", "The best listed price depends on a longer introductory term", "The product still operates as a self-managed VPS environment despite the guided setup angle"],
      buyerConsiderations: [
        "These plans are best suited to buyers that are comfortable managing the software side of a VPS environment.",
        "The lowest published rate depends on a longer-term introductory offer rather than month-to-month billing.",
        "Choosing the right tier depends mostly on workflow volume, integration demands, and how much storage and memory the automation stack will need.",
      ],
      assumptionNotes: [`Created from the named ${seed.family} NVMe plan in the provided HostGator source.`],
      sourcePlanName: seed.title.replace(/^HostGator /, "").replace(" VPS Hosting", ""),
    });
  });

  [
    {
      title: "HostGator Single Domain SSL",
      handle: "hostgator-single-domain-ssl",
      price: "39.96",
      renewal: "Not clearly separated from the annual purchase price in the provided source",
      category: "SSL Certificates",
      seoDescription: "HostGator Single Domain SSL starts at $39.96/year with DV validation, one-domain protection, 256-bit encryption, and a TrustLogo site seal.",
      introTheme: "HostGator's paid entry SSL option for websites that need one-domain protection, a trust seal, and a straightforward domain-validated certificate",
      audience: "small business sites, single-domain stores, and site owners that want paid SSL coverage beyond free certificate options",
      features: ["Domain validated SSL", "Protects one domain and one subdomain", "TrustLogo Site Seal included", "2048-bit signatures", "Up to 256-bit encryption", "Recognized by all major browsers"],
      pros: ["Lowest paid SSL starting price in the HostGator SSL section", "Covers one domain and one subdomain with a trust seal", "Suitable for smaller ecommerce or business sites"],
      cons: ["Only one primary domain and one subdomain are covered", "Source pricing references more than one certificate path under this entry", "Warranty references differ between the comparison page and help article details"],
      notes: ["Annual price shown on the live SSL page is $39.96/year.", "HostGator help material also references Positive SSL at $39.99/year and Sectigo SSL at $99.99/year.", "Registration term shown: 1 year.", "This listing follows the lowest visible annual price while noting the alternate certificate pricing referenced in the source."],
    },
    {
      title: "HostGator Wildcard SSL",
      handle: "hostgator-wildcard-ssl",
      price: "119.99",
      renewal: "Not clearly separated from the annual purchase price in the provided source",
      category: "SSL Certificates",
      seoDescription: "HostGator Wildcard SSL starts at $119.99/year and covers one primary domain plus unlimited subdomains with DV validation and a trust seal.",
      introTheme: "HostGator's wildcard SSL option for businesses that need one certificate to secure a primary domain and many related subdomains",
      audience: "stores, portals, SaaS-style sites, and organizations that run multiple subdomains under one primary domain",
      features: ["Secures one primary domain and unlimited subdomains", "Domain validated SSL", "TrustLogo Site Seal included", "2048-bit signatures", "Up to 256-bit encryption", "Recognized by all major browsers"],
      pros: ["One certificate can cover a full subdomain structure", "More practical than buying separate certificates for each same-root subdomain", "Includes a trust seal and clear browser compatibility coverage"],
      cons: ["Only subdomains under the same primary domain are covered", "HostGator source material shows conflicting price and warranty references", "Additional installation fees are listed for extra subdomains and extra servers"],
      notes: ["Exact price from a HostGator Wildcard SSL help article is $119.99/year.", "The live SSL page also shows $239.88/year, so the provided source contains conflicting annual pricing.", "Registration term shown: 1 year.", "Free installation is noted for the primary domain and first five subdomains, with added installation charges beyond that."],
    },
    {
      title: "HostGator EV SSL",
      handle: "hostgator-ev-ssl",
      price: "239.88",
      renewal: "Not clearly separated from the annual purchase price in the provided source",
      category: "SSL Certificates",
      seoDescription: "HostGator EV SSL starts at $239.88/year with extended validation, 256-bit encryption, a TrustLogo seal, and a $1,750,000 warranty.",
      introTheme: "HostGator's extended validation SSL option for brands that want stronger identity assurance, the highest warranty in this SSL group, and a more rigorous validation path",
      audience: "established businesses, sensitive online services, and brands that want stronger trust assurances than a standard DV certificate provides",
      features: ["Extended Validation SSL", "Protects one domain or one subdomain", "$1,750,000 warranty", "TrustLogo Site Seal included", "2048-bit signatures", "Up to 256-bit encryption"],
      pros: ["Highest warranty level in the HostGator SSL options described", "Uses extended validation rather than only domain validation", "Designed for higher-trust business scenarios"],
      cons: ["More expensive than the lower SSL options", "Validation can take time and may require business verification documents", "The provided source also references a higher exact help-article price than the live page amount"],
      notes: ["Annual price shown on the live SSL page is $239.88/year.", "The HostGator EV SSL help article reference in the provided source lists $269.99/year.", "Registration term shown: 1 year.", "Extended validation requires a more rigorous issuance process than a standard DV SSL certificate."],
    },
  ].forEach((seed) => {
    specs.push({
      title: seed.title,
      handle: seed.handle,
      vendor: HOSTGATOR_VENDOR,
      officialUrl: "https://www.hostgator.com/ssl-certificates",
      price: seed.price,
      productType: "SSL Certificates",
      productCategoryLabel: seed.category,
      bodyCategory: "website security and certificate protection for domains, subdomains, browser trust signals, and encrypted connections",
      categoryHints: ["Cloud Services", "Security & SSL", "SSL Certificates", "Website Security"],
      filters: {
        pricing_model: ["Subscription"],
        billing_cycle: ["Annual"],
        support_coverage: ["24/7 support"],
        target_segment: ["Small business", "Mid-market"],
      },
      seoTitle: `${seed.title} HostGator SSL Certificate`,
      seoDescription: seed.seoDescription,
      audience: seed.audience,
      introTheme: seed.introTheme,
      useCases: [
        "securing a website with paid SSL protection and browser-recognized encryption",
        "adding trust signals such as HTTPS status and a site seal to a public-facing site",
        "choosing a certificate level that matches the number of domains or the level of trust assurance required",
      ],
      pricingNotes: seed.notes,
      featureGroups: [
        { heading: "Core Features", items: seed.features },
        { heading: "Security", items: ["Encrypts data transmission", "Helps protect sensitive visitor information", "Shows secure browser status", "Supports privacy and security expectations"] },
        { heading: "Trust And SEO", items: ["TrustLogo Site Seal included", "Recognized by all major browsers", "Can help support customer trust", "Can help support search visibility"] },
        { heading: "Support", items: ["24/7/365 support", "30-day money-back guarantee"] },
      ],
      factualPros: seed.pros,
      factualCons: seed.cons,
      buyerConsiderations: [
        "The right SSL level depends on whether one hostname, many subdomains, or stronger business validation is needed.",
        "HostGator's provided source contains some conflicting price or warranty references, so buyers should still confirm the final checkout details.",
        "Annual billing applies here rather than a month-to-month hosting-style billing model.",
      ],
      assumptionNotes: [`Created from the named HostGator SSL product ${seed.title.replace("HostGator ", "")}.`],
      sourcePlanName: seed.title.replace("HostGator ", ""),
    });
  });

  [
    {
      title: "HostGator Professional Email",
      handle: "hostgator-professional-email",
      price: "1.67",
      category: "Business Email Hosting",
      introTheme: "HostGator's Titan-powered entry professional email plan for buyers that need branded email on their own domain without paying for a larger collaboration tier",
      audience: "solopreneurs, freelancers, and small businesses that need a custom-domain business email account",
      seoDescription: "HostGator Professional Email starts at $1.67/month per mailbox with 10 GB storage, webmail, mobile access, migration tools, and anti-spam protection.",
      pricingNotes: ["Starting price: $1.67/month introductory offer.", "Billing terms shown: monthly or 1 year.", "Renewal pricing is not publicly available in the provided source.", "The price is described as likely per mailbox or per user."],
      features: ["10 GB email storage", "10 read receipts", "1 email template", "1 contact group", "Calendar and contacts", "Vacation responder", "Undo Send", "Webmail access", "Mobile app access", "Built-in migration tools"],
      extras: ["Advanced anti-spam and anti-virus", "Data encryption", "Allowlist", "Block sender", "Email forwarding support", "24/7 support"],
      pros: ["Low visible starting price for custom-domain email", "Includes migration tools and mobile access", "Covers practical email essentials without forcing a larger suite"],
      cons: ["Renewal pricing is not publicly listed", "Feature limits apply to templates, read receipts, and contact groups", "You need a domain to use the service"],
    },
    {
      title: "HostGator Professional Email Plus",
      handle: "hostgator-professional-email-plus",
      price: "2.50",
      category: "Business Email Hosting",
      introTheme: "HostGator's mid-tier Titan professional email plan for growing teams that need more storage, more productivity controls, and stronger collaboration features",
      audience: "professionals and growing businesses that need more than a single-user email starter plan",
      seoDescription: "HostGator Professional Email Plus starts at $2.50/month per mailbox with 50 GB email storage, Titan Drive, team chat, 2FA, and productivity tools.",
      pricingNotes: ["Starting price: $2.50/month introductory offer.", "Billing terms shown: monthly or 1 year.", "Renewal pricing is not publicly available in the provided source.", "The price is described as likely per mailbox or per user."],
      features: ["50 GB email storage", "Titan Drive 1 GB", "Unlimited read receipts", "Unlimited email templates", "Unlimited contact groups", "Send Later", "Follow-Up Reminders", "Turbo Search", "Send as Alias", "Grammar and spell check"],
      extras: ["Two-factor authentication", "Priority Inbox", "Email labels", "Auto Clean", "Branding", "Business Auto-Reply", "Team Chat", "Tasks"],
      pros: ["Adds strong productivity upgrades over the base email tier", "Includes 2FA, team chat, and Titan Drive", "Better fit for small teams than the starter plan"],
      cons: ["Renewal pricing is not publicly listed", "Still depends on owning a domain", "Some higher-end AI and backup features are reserved for Ultra"],
    },
    {
      title: "HostGator Professional Email Ultra",
      handle: "hostgator-professional-email-ultra",
      price: "5.83",
      category: "Enterprise Email Solutions",
      introTheme: "HostGator's highest published Titan email tier for teams that want AI-assisted email, built-in backup storage, campaigns, bookings, and broader business features",
      audience: "scaling teams and high-performance professionals that want email, backup, AI, and campaign features in one suite",
      seoDescription: "HostGator Professional Email Ultra starts at $5.83/month per mailbox with 100 GB email storage, 50 GB backup storage, AI tools, campaigns, and bookings.",
      pricingNotes: ["Starting price: $5.83/month introductory offer.", "Billing terms shown: monthly or 1 year.", "Renewal pricing is not publicly available in the provided source.", "The price is described as likely per mailbox or per user."],
      features: ["100 GB email storage", "50 GB email backup storage", "Titan Drive 50 GB", "Email AI", "AI Summary", "Email Campaigns", "Calendar Bookings", "Invoice Builder", "Signature Designer", "File and link tracking"],
      extras: ["Unlimited automatic daily backups", "One-click recovery for lost messages", "File transfer", "Email Designer", "Priority Inbox", "Tasks", "Team Chat", "Branded file-sharing links"],
      pros: ["Most feature-rich Titan tier in the provided source", "Adds backup storage and AI-assisted email tools", "Suitable for teams that want campaign, booking, and business utility features together"],
      cons: ["Renewal pricing is not publicly listed", "Higher starting cost than the lower Titan plans", "Some businesses may not need the extra AI, backup, and campaign functions"],
    },
  ].forEach((seed) => {
    specs.push({
      title: seed.title,
      handle: seed.handle,
      vendor: HOSTGATOR_VENDOR,
      officialUrl: "https://www.hostgator.com/titan",
      price: seed.price,
      productType: "Email Hosting",
      productCategoryLabel: seed.category,
      bodyCategory: "business email hosting for branded mailboxes, domain-based addresses, and team productivity on a professional email service",
      categoryHints: ["Cloud Services", "Email Hosting", seed.category],
      filters: {
        pricing_model: ["Subscription"],
        price_band: [priceBand(seed.price)],
        billing_cycle: ["Monthly", "Annual"],
        support_coverage: ["24/7 support"],
        target_segment: seed.category === "Enterprise Email Solutions" ? ["Small business", "Mid-market"] : ["Individuals", "Small business"],
      },
      seoTitle: `${seed.title} HostGator Email Hosting`,
      seoDescription: seed.seoDescription,
      audience: seed.audience,
      introTheme: seed.introTheme,
      useCases: [
        "running branded email accounts on a custom domain",
        "moving away from generic inboxes toward a more business-ready email setup",
        "choosing an email tier that fits storage needs, productivity features, and collaboration expectations",
      ],
      pricingNotes: seed.pricingNotes,
      featureGroups: [
        { heading: "Core Features", items: seed.features },
        { heading: "Security", items: ["Advanced anti-spam and anti-virus", "Data encryption", "Custom DKIM mentioned as part of Titan security benefits", "Allowlist and block sender support"] },
        { heading: "Access And Migration", items: ["Webmail access", "Mobile applications", "Android and iOS app support", "Browser access", "Built-in migration tools for existing emails and contacts"] },
        { heading: "Additional Features", items: seed.extras },
        { heading: "Support", items: ["24/7 HostGator support", "Email support", "Live chat support"] },
      ],
      factualPros: seed.pros,
      factualCons: seed.cons,
      buyerConsiderations: [
        "A custom domain is required to use Titan professional email.",
        "The provided source does not list public renewal pricing for these plans, so long-term cost should still be confirmed at checkout.",
        "The best tier depends on mailbox storage needs, team features, and whether extra tools such as AI, campaigns, or backups are actually useful.",
      ],
      assumptionNotes: [`Created from the named Titan email plan ${seed.title.replace("HostGator ", "")}.`],
      sourcePlanName: seed.title.replace("HostGator ", ""),
    });
  });

  [
    { title: "HostGator CodeGuard Basic", handle: "hostgator-codeguard-basic", price: "1.99", renewal: "3.99", websites: "Up to 5 websites", storage: "1 GB backup storage", restores: "3 restores per month", category: "Cloud Backup" },
    { title: "HostGator CodeGuard Professional", handle: "hostgator-codeguard-professional", price: "4.99", renewal: "4.99", websites: "Up to 10 websites", storage: "5 GB backup storage", restores: "Unlimited restores", category: "Server Backup" },
    { title: "HostGator CodeGuard Premium", handle: "hostgator-codeguard-premium", price: "8.99", renewal: "8.99", websites: "Up to 25 websites", storage: "10 GB backup storage", restores: "Unlimited restores", category: "Server Backup" },
    { title: "HostGator CodeGuard Enterprise", handle: "hostgator-codeguard-enterprise", price: "19.99", renewal: "19.99", websites: "Up to 100 websites", storage: "25 GB backup storage", restores: "Unlimited restores", category: "Server Backup" },
  ].forEach((seed) => {
    specs.push({
      title: seed.title,
      handle: seed.handle,
      vendor: HOSTGATOR_VENDOR,
      officialUrl: "https://www.hostgator.com/codeguard",
      price: seed.price,
      productType: "Website Backup",
      productCategoryLabel: seed.category,
      bodyCategory: "website backup and recovery coverage for ongoing site-change monitoring, restore access, and disaster-recovery planning",
      categoryHints: ["Cloud Services", "Backup & Disaster Recovery", seed.category, "Automated Backup"],
      filters: {
        pricing_model: ["Subscription"],
        price_band: [priceBand(seed.price)],
        billing_cycle: ["Annual"],
        support_coverage: ["24/7 support"],
        target_segment: seed.title.includes("Enterprise") ? ["Mid-market", "Agencies"] : ["Small business", "Agencies"],
      },
      seoTitle: `${seed.title} HostGator Website Backup`,
      seoDescription: `${seed.title} starts at $${seed.price}/month with ${seed.storage}, ${seed.websites.toLowerCase()}, daily backups, monitoring, and restore tools.`,
      audience: "site owners and agencies that want automated backup coverage and recovery options beyond manual backup habits",
      introTheme: `${seed.title.replace("HostGator ", "")} is HostGator's CodeGuard backup tier for customers that want automated website backups, change monitoring, and a clearer recovery path when sites break or are compromised`,
      useCases: [
        "protecting websites from hacks, malware, broken code, accidental changes, or crashes",
        "maintaining daily backup coverage with restore access and monitoring alerts",
        "choosing a backup tier based on website count, storage allowance, and restore flexibility",
      ],
      pricingNotes: [
        `Starting price: $${seed.price}/month introductory offer.`,
        `Renewal monthly cost breakdown shown in the source: $${seed.renewal}/month.`,
        "The full 1-year term is billed upfront at renewal.",
        seed.title.includes("Enterprise")
          ? "The introductory offer was described as dynamic or not clearly exposed in the provided source, so the visible monthly renewal breakdown is used as the working product price."
          : "The plan is positioned as a recurring annual purchase rather than a month-to-month hosting subscription.",
      ],
      featureGroups: [
        { heading: "Core Features", items: ["Daily automatic backups", seed.storage, seed.websites, "Unlimited databases", "Unlimited files", seed.restores] },
        { heading: "Monitoring", items: ["Daily site-change monitoring", "File change monitoring", "Backup progress alerts", "Website change alerts", "Email notifications for changes"] },
        { heading: "Recovery And Security", items: ["Restore previous website versions", "Restore files, databases, or entire websites", "Helps recover from malware, hacks, broken code, accidental changes, or crashes", "Website security monitoring"] },
        { heading: "Management", items: ["Cloud backup storage", "Initial backup after setup", "Continued backups when changes are detected", seed.title.includes("Basic") ? "On-demand backups are not included" : "On-demand backups are included"] },
        { heading: "Support", items: ["Managed from the HostGator customer portal", "Install, upgrade, modify, or cancel from the portal"] },
      ],
      factualPros: ["Automated backups and monitoring are built into every tier", "The higher plans add stronger restore flexibility and more storage", "Useful for buyers who want a clearer recovery path than manual backups alone"],
      factualCons: [seed.title.includes("Basic") ? "Restore count is limited on the Basic tier" : "Higher tiers cost more and may exceed the needs of very small sites", "The product is an add-on style backup service rather than full hosting by itself", "Enterprise introductory pricing is not clearly exposed in the provided source"],
      buyerConsiderations: ["The right tier depends mostly on website count, backup storage needs, and how important unlimited restores are.", "These plans are especially useful for customers that want recovery help after site changes or security incidents.", "Annual renewal billing should be considered alongside the displayed monthly cost breakdown."],
      assumptionNotes: [`Created from the named CodeGuard backup plan ${seed.title.replace("HostGator CodeGuard ", "")}.`],
      sourcePlanName: seed.title.replace("HostGator ", ""),
    });
  });

  [
    {
      title: "HostGator AI All-Access Pack",
      handle: "hostgator-ai-all-access-pack",
      price: "20.00",
      privacy: "Standard privacy level",
      categoryHints: ["AI Tools", "Assistant AI", "Personal AI Assistants"],
      seoDescription: "HostGator AI All-Access Pack is $20/month per user with ChatGPT, Gemini, Claude, Grok, research tools, and a multi-model dashboard.",
      introTheme: "HostGator's all-in-one AI assistant bundle for buyers that want one dashboard across several major AI models without managing separate subscriptions",
      audience: "teams and individuals that want to compare leading AI models, create content, and use research or presentation tools in one place",
      extras: ["Research Agent", "Presentation Builder", "AI Article Writer", "Account Management Dashboard", "Pre-built AI agents", "Multi-model response comparison"],
      pros: ["Bundles multiple leading AI models into one interface", "Useful for side-by-side response comparison", "Includes extra tools beyond the model access itself"],
      cons: ["Per-user monthly pricing applies", "Privacy+ controls are reserved for the higher tier", "VAT may apply separately where relevant"],
    },
    {
      title: "HostGator AI All-Access Pack Privacy+",
      handle: "hostgator-ai-all-access-pack-privacy-plus",
      price: "25.00",
      privacy: "Privacy Mode, end-to-end encryption, encrypted searches, privately hosted LLM access, PIN protection, and Incognito Mode",
      categoryHints: ["AI Tools", "Assistant AI", "Enterprise AI Assistants"],
      seoDescription: "HostGator AI All-Access Pack Privacy+ is $25/month per user with ChatGPT, Gemini, Claude, Grok, and added privacy safeguards.",
      introTheme: "the privacy-focused version of HostGator's AI All-Access bundle for buyers that want stronger safeguards around sensitive prompts and team usage",
      audience: "teams, agencies, and businesses that want multi-model AI access with stronger privacy controls than the base package",
      extras: ["Research Agent", "Presentation Builder", "AI Article Writer", "Account Management Dashboard", "Pre-built AI agents", "Multi-model response comparison"],
      pros: ["Adds meaningful privacy and encryption features over the base plan", "Still keeps access to the same multi-model AI bundle", "Better fit for teams handling sensitive work"],
      cons: ["Costs more per user than the base pack", "Monthly per-user pricing can add up for larger teams", "The source notes that discounts may apply only to the first invoice"],
    },
  ].forEach((seed) => {
    specs.push({
      title: seed.title,
      handle: seed.handle,
      vendor: HOSTGATOR_VENDOR,
      officialUrl: "https://www.hostgator.com/all-access",
      price: seed.price,
      productType: "AI Tools",
      productCategoryLabel: "Personal AI Assistants",
      bodyCategory: "multi-model AI assistant software with a shared dashboard, research tools, content tools, and team-friendly access management",
      categoryHints: seed.categoryHints,
      filters: {},
      seoTitle: `${seed.title} HostGator AI Assistant`,
      seoDescription: seed.seoDescription,
      audience: seed.audience,
      introTheme: seed.introTheme,
      useCases: [
        "switching between multiple leading AI models from one workspace",
        "comparing answers across models before choosing a final output",
        "using AI for writing, research, presentations, and general productivity without juggling separate tools",
      ],
      pricingNotes: [
        `Price: $${seed.price}/month per user.`,
        `Renewal price: $${seed.price}/month per user.`,
        "Billing is monthly and per user.",
        "HostGator notes that pricing may reflect a discount on the first invoice only and VAT may be charged separately where applicable.",
      ],
      featureGroups: [
        { heading: "Core Features", items: ["Access ChatGPT, Gemini, Claude Sonnet, and Grok in one place", "Switch between models based on the task", "Compare multiple responses before choosing an answer", "One central dashboard for multiple AI models"] },
        { heading: "Agents And Tools", items: seed.extras },
        { heading: "Management", items: ["Account Management Dashboard", "Built for teams and clients", "Centralized AI model access"] },
        { heading: "Privacy And Security", items: [seed.privacy] },
      ],
      factualPros: seed.pros,
      factualCons: seed.cons,
      buyerConsiderations: ["These plans are best judged by whether multi-model access and the extra tooling replace separate subscriptions.", "The monthly per-user pricing model matters for teams more than for single users.", "Privacy-sensitive teams should compare the base plan with Privacy+ rather than assuming they are functionally identical."],
      assumptionNotes: [`Created from the named AI product ${seed.title.replace("HostGator ", "")}.`],
      sourcePlanName: seed.title.replace("HostGator ", ""),
    });
  });

  [
    { ext: ".com", intro: "12.99", renewal: "22.99", fit: "businesses, brands, blogs, SaaS services, and general-purpose websites", note: "Most popular domain extension." },
    { ext: ".net", intro: "18.99", renewal: "22.99", fit: "technology, hosting, networking, and software-related websites", note: "Popular alternative when .com is unavailable." },
    { ext: ".org", intro: "14.99", renewal: "20.99", fit: "organizations, communities, non-profits, and public-interest websites", note: "Commonly associated with mission-driven or community-oriented sites." },
    { ext: ".site", intro: "0.99", renewal: "39.99", fit: "new websites, landing pages, and promotional projects", note: "Very low introductory rate with a much higher renewal price." },
    { ext: ".online", intro: "1.99", renewal: "49.99", fit: "online-first businesses, digital products, communities, and ecommerce websites", note: "Positioned for digital-first brands." },
    { ext: ".tech", intro: "3.99", renewal: "69.99", fit: "tech startups, SaaS products, AI tools, developer tools, and technology blogs", note: "Technology-focused domain extension." },
    { ext: ".website", intro: "0.99", renewal: "29.99", fit: "general websites, portfolios, small business sites, and starter projects", note: "Broad general-purpose extension with a low introductory rate." },
    { ext: ".me", intro: "17.99", renewal: "19.95", fit: "personal brands, creators, freelancers, portfolios, and resume websites", note: "Personal-brand-friendly domain extension." },
    { ext: ".info", intro: "21.99", renewal: "31.99", fit: "guides, blogs, directories, and informational websites", note: "Information-focused extension." },
    { ext: ".club", intro: "14.99", renewal: "15.00", fit: "clubs, memberships, fan communities, and group-based websites", note: "Community-focused extension." },
    { ext: ".biz", intro: "19.99", renewal: "26.99", fit: "small businesses, service providers, and commercial websites", note: "Business-oriented alternative to .com." },
    { ext: ".co", intro: "29.99", renewal: "35.00", fit: "startups, SaaS brands, tech companies, and modern business websites", note: "Short, brandable extension often used as a modern .com alternative." },
    { ext: ".host", intro: "6.99", renewal: "129.99", fit: "hosting providers, cloud companies, and server-focused brands", note: "Hosting-oriented extension with a steep renewal price." },
    { ext: ".space", intro: "1.99", renewal: "29.99", fit: "creative projects, communities, startups, and experimental brands", note: "Flexible extension for creative or broad branding uses." },
    { ext: ".us", intro: "18.99", renewal: "19.99", fit: "US-based businesses, regional services, and local brands", note: "US-focused country-code extension." },
  ].forEach((seed) => {
    const title = `HostGator ${seed.ext} Domain Registration`;
    specs.push({
      title,
      handle: slugify(title),
      vendor: HOSTGATOR_VENDOR,
      officialUrl: "https://www.hostgator.com/domains",
      price: seed.intro,
      productType: "Domain Registration",
      productCategoryLabel: "Domain Registration",
      bodyCategory: "domain registration and DNS-related services for brands, websites, and online identity management",
      categoryHints: ["Cloud Services", "Domain & DNS Services", "Domain Registration", "DNS Management"],
      filters: {
        pricing_model: ["Subscription"],
        billing_cycle: ["Annual"],
        support_coverage: ["Documentation only"],
        target_segment: ["Individuals", "Small business"],
      },
      seoTitle: `${title} HostGator Domain Registration`,
      seoDescription: `${title} starts at $${seed.intro}/year with HostGator domain management, renewal, locking, and optional privacy protection.`,
      audience: `buyers that need ${seed.fit}`,
      introTheme: `HostGator's ${seed.ext} domain registration option for customers that want ${seed.fit} with built-in renewal, locking, and customer-portal management`,
      useCases: [
        "registering a domain for a website, brand, service, or project",
        "managing renewal, locking, and DNS-related tasks from the HostGator customer portal",
        "choosing a domain extension that fits the intended audience, branding style, and website purpose",
      ],
      pricingNotes: [
        `Introductory offer: $${seed.intro}/year.`,
        `Renewal price: $${seed.renewal}/year.`,
        "Registered domains renew automatically by default according to the provided HostGator domain notes.",
        seed.note,
      ],
      featureGroups: [
        { heading: "Core Features", items: ["Domain registration", "Domain renewal", "Domain locking", "Customer portal management", "Optional Domain Privacy + Protection"] },
        { heading: "Management", items: ["Single dashboard domain management", "Auth code requests", "Expiration protection", "Domain connections", "Renewal and transfer controls"] },
        { heading: "Trust And Security", items: ["Domain locking helps prevent unauthorized transfers", "Supports secure checkout messaging", "Optional privacy protection for WHOIS-style exposure concerns"] },
        { heading: "Buyer Fit", items: [seed.fit] },
      ],
      factualPros: ["Simple way to register and manage a domain through HostGator", "Clear yearly introductory and renewal pricing is provided", "Optional privacy and locking features support ownership and security needs"],
      factualCons: ["Renewal pricing can be much higher than the introductory rate on some extensions", "This is a domain registration product rather than hosting itself", "The best extension depends on branding and fit, so lower price does not always mean better long-term value"],
      buyerConsiderations: ["The renewal rate matters as much as the intro price, especially for long-term brand use.", "Choose the extension for fit and credibility, not only for the lowest first-year cost.", "Some hosting plans include a free first-year domain, but those promotions have separate conditions and do not remove future renewal pricing."],
      assumptionNotes: [`Created from the named HostGator domain product ${seed.ext}.`],
      sourcePlanName: `${seed.ext} Domain`,
    });
  });

  return specs;
}

const main = async () => {
  const allowedTypeValues = await buildAllowedTypeValues();
  const filterDefinitions = await buildCloudFilterDefinitions();
  const filterKeys = dedupe(
    TARGET_SPECS.flatMap((spec) => Object.keys(validateFilterValues(spec, filterDefinitions)))
  );
  const marketplaceFilterReferences = await buildMarketplaceFilterReferenceMap(filterKeys);

  const rows: SummaryRow[] = [];
  const processedProductIds = new Set<number>();
  const processedHandles = new Set<string>();
  const processedTitleUrls = new Set<string>();

  for (const spec of TARGET_SPECS) {
    try {
      if (!normalizeText(spec.sourcePlanName)) {
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
          error: "No safe source plan match was available in hostgator.com.txt.",
        });
        continue;
      }

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
          error: 'Price unavailable. Expected public price or the text `To visit product official website click "Get Now"`.',
        });
        continue;
      }

      const matchResult = await resolveProductState(spec, processedProductIds, processedHandles, processedTitleUrls);
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
        currentState?.typeMultiple ?? [],
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

  const { jsonPath, csvPath, counts } = await writeSummaryFiles(rows);

  console.log("Changed files:");
  console.log("- backend/src/scripts/updateHostGatorProducts.ts");
  console.log("");
  console.log(`Total Section B products received: ${counts.totalSectionBProductsReceived}`);
  console.log(`Existing products updated: ${counts.existingProductsUpdated}`);
  console.log(`Missing products created: ${counts.missingProductsCreated}`);
  console.log(`Skipped current-job duplicates: ${counts.skippedCurrentJobDuplicates}`);
  console.log(`Skipped missing required data: ${counts.skippedMissingRequiredData}`);
  console.log(`Skipped pricing unavailable: ${counts.skippedPricingUnavailable}`);
  console.log(`Logo uploaded count: ${counts.logoUploadedCount}`);
  console.log(`Logo reused/skipped count: ${counts.logoReusedSkippedCount}`);
  console.log(`Failed count: ${counts.failedCount}`);
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
  console.error("HostGator product update failed:", error);
  process.exitCode = 1;
});
