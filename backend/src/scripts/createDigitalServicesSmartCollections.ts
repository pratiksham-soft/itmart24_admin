import fs from "fs";
import path from "path";
import csv from "csv-parser";
import "../config/env";
import { BACKEND_ROOT } from "../config/env";
import { shopifyGraphQL, shopifyRest } from "../services/shopifyHttp";

type CollectionCsvRow = {
  top_category?: string;
  top_slug?: string;
  subcategory?: string;
  subcategory_slug?: string;
  final_category?: string;
  final_category_slug?: string;
  collection_title?: string;
  collection_handle?: string;
  collection_url?: string;
  browse_page_handle?: string;
  browse_page_url?: string;
  is_flat_category?: string;
};

type SmartCollectionRecord = {
  id: number;
  handle: string;
  title: string;
  disjunctive: boolean;
  rules: Array<{
    column?: string;
    relation?: string;
    condition?: string;
  }>;
  admin_graphql_api_id?: string;
};

const collectionCsvPath = path.resolve(
  BACKEND_ROOT,
  "..",
  "..",
  "shopify_theme",
  "docs",
  "category-collections.csv"
);

const DIGITAL_SERVICES_PAGE_HANDLE = "digital-services";
const DIGITAL_SERVICES_PAGE_TITLE = "Digital Services";
const DIGITAL_SERVICES_PAGE_BODY = `
<p><strong>Discover trusted agencies and service providers for marketing, design, development, automation, cloud, cybersecurity, analytics, and business growth.</strong></p>
<p>Browse digital service providers by specialization and find the right partner for your website, app, software, AI, marketing, or business growth needs.</p>
`.trim();

const readDigitalServicesCollectionRows = async () => {
  const rows: CollectionCsvRow[] = [];

  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(collectionCsvPath)
      .pipe(csv())
      .on("data", (row: CollectionCsvRow) => rows.push(row))
      .on("end", () => resolve())
      .on("error", reject);
  });

  return rows.filter(
    (row) => String(row.top_slug || "").trim() === DIGITAL_SERVICES_PAGE_HANDLE
  );
};

const listAllSmartCollections = async () => {
  const collections: SmartCollectionRecord[] = [];
  let sinceId = 0;

  while (true) {
    const response = await shopifyRest.get("/smart_collections.json", {
      params: {
        limit: 250,
        since_id: sinceId || undefined,
      },
    });

    const batch = Array.isArray(response.data?.smart_collections)
      ? (response.data.smart_collections as SmartCollectionRecord[])
      : [];

    if (!batch.length) {
      break;
    }

    collections.push(...batch);
    sinceId = Number(batch[batch.length - 1]?.id) || 0;
  }

  return collections;
};

const loadExistingPage = async () => {
  let pageId = 0;
  const matches: Array<{ id: number; handle: string; title: string; template_suffix?: string }> =
    [];

  while (true) {
    const response = await shopifyRest.get("/pages.json", {
      params: {
        limit: 250,
        since_id: pageId || undefined,
        fields: "id,title,handle,template_suffix",
      },
    });
    const batch = Array.isArray(response.data?.pages) ? response.data.pages : [];

    if (!batch.length) {
      break;
    }

    matches.push(
      ...batch.filter(
        (page: any) =>
          String(page?.handle || "").trim() === DIGITAL_SERVICES_PAGE_HANDLE
      )
    );
    pageId = Number(batch[batch.length - 1]?.id) || 0;
  }

  return matches[0] ?? null;
};

const ensureDigitalServicesLandingPage = async () => {
  const existingPage = await loadExistingPage();
  const payload = {
    page: {
      title: DIGITAL_SERVICES_PAGE_TITLE,
      handle: DIGITAL_SERVICES_PAGE_HANDLE,
      body_html: DIGITAL_SERVICES_PAGE_BODY,
      template_suffix: "category-directory",
      published: true,
    },
  };

  if (!existingPage) {
    const response = await shopifyRest.post("/pages.json", payload);
    return {
      action: "created",
      pageId: response.data?.page?.id ?? null,
    };
  }

  const needsUpdate =
    String(existingPage.title || "").trim() !== DIGITAL_SERVICES_PAGE_TITLE ||
    String(existingPage.template_suffix || "").trim() !== "category-directory";

  if (!needsUpdate) {
    return {
      action: "skipped",
      pageId: existingPage.id,
    };
  }

  await shopifyRest.put(`/pages/${existingPage.id}.json`, {
    page: {
      id: existingPage.id,
      ...payload.page,
    },
  });

  return {
    action: "updated",
    pageId: existingPage.id,
  };
};

const getCollectionGid = (collection: SmartCollectionRecord) =>
  collection.admin_graphql_api_id || `gid://shopify/Collection/${collection.id}`;

const setCollectionNoindexMetafield = async (collection: SmartCollectionRecord) => {
  const response = await shopifyGraphQL.post("", {
    query: `
      mutation SetCollectionNoindex($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            key
            namespace
          }
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
          ownerId: getCollectionGid(collection),
          namespace: "custom",
          key: "noindex",
          type: "boolean",
          value: "true",
        },
      ],
    },
  });

  const errors = response.data?.data?.metafieldsSet?.userErrors ?? [];
  if (errors.length) {
    throw new Error(
      `Failed to set noindex metafield for ${collection.handle}: ${errors
        .map((error: { message?: string }) => error.message || "Unknown error")
        .join(", ")}`
    );
  }
};

const normalizeRules = (rules: SmartCollectionRecord["rules"]) =>
  (Array.isArray(rules) ? rules : []).map((rule) => ({
    column: String(rule?.column || "").trim(),
    relation: String(rule?.relation || "").trim(),
    condition: String(rule?.condition || "").trim(),
  }));

async function main() {
  const csvRows = await readDigitalServicesCollectionRows();
  if (!csvRows.length) {
    throw new Error(
      "No Digital Services rows found in shopify_theme/docs/category-collections.csv. Regenerate category data first."
    );
  }

  const pageResult = await ensureDigitalServicesLandingPage();
  const smartCollections = await listAllSmartCollections();
  const smartCollectionsByHandle = new Map(
    smartCollections.map((collection) => [collection.handle, collection])
  );

  const created: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];
  const failed: Array<{ handle: string; reason: string }> = [];

  for (const row of csvRows) {
    const handle = String(row.collection_handle || "").trim();
    const title = String(row.final_category || row.collection_title || "").trim();

    if (!handle || !title) {
      failed.push({
        handle: handle || "(missing handle)",
        reason: "Missing collection handle or title in generated CSV row.",
      });
      continue;
    }

    const expectedRules = [
      {
        column: "type",
        relation: "equals",
        condition: title,
      },
    ];

    try {
      const existingCollection = smartCollectionsByHandle.get(handle);

      if (!existingCollection) {
        const response = await shopifyRest.post("/smart_collections.json", {
          smart_collection: {
            title,
            handle,
            rules: expectedRules,
            disjunctive: true,
            published: true,
          },
        });

        const createdCollection = response.data?.smart_collection as SmartCollectionRecord;
        await setCollectionNoindexMetafield(createdCollection);
        smartCollectionsByHandle.set(handle, createdCollection);
        created.push(handle);
        console.log(`Created smart collection: ${title} (${handle})`);
        continue;
      }

      const normalizedExistingRules = normalizeRules(existingCollection.rules);
      const needsUpdate =
        String(existingCollection.title || "").trim() !== title ||
        existingCollection.disjunctive !== true ||
        normalizedExistingRules.length !== expectedRules.length ||
        normalizedExistingRules.some((rule, index) => {
          const expectedRule = expectedRules[index];
          return (
            rule.column !== expectedRule.column ||
            rule.relation !== expectedRule.relation ||
            rule.condition !== expectedRule.condition
          );
        });

      if (needsUpdate) {
        await shopifyRest.put(
          `/smart_collections/${existingCollection.id}.json`,
          {
            smart_collection: {
              id: existingCollection.id,
              title,
              handle,
              rules: expectedRules,
              disjunctive: true,
            },
          }
        );

        updated.push(handle);
        console.log(`Updated smart collection: ${title} (${handle})`);
      } else {
        skipped.push(handle);
        console.log(`Skipped smart collection: ${title} (${handle})`);
      }

      await setCollectionNoindexMetafield(existingCollection);
    } catch (error: any) {
      failed.push({
        handle,
        reason: error?.message || "Unknown Shopify error",
      });
      console.error(`Failed smart collection: ${handle}`, error);
    }
  }

  console.log("");
  console.log(`Landing page action: ${pageResult.action}`);
  console.log(`Created collections: ${created.length}`);
  console.log(`Updated collections: ${updated.length}`);
  console.log(`Skipped collections: ${skipped.length}`);
  console.log(`Failed collections: ${failed.length}`);

  if (failed.length > 0) {
    failed.forEach((item) =>
      console.log(`Failure -> ${item.handle}: ${item.reason}`)
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Failed to create Digital Services smart collections:", error);
  process.exitCode = 1;
});
