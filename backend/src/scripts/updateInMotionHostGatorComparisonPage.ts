import "../config/env";
import { shopifyGraphQL, shopifyRest } from "../services/shopifyHttp";

const THEME_ID = "159711920367";
const ASSET_KEYS = [
  "sections/product-comparison-page.liquid",
  "sections/product-comparison-page-v2.liquid",
];
const HANDLE = "inmotion-vps-hosting-vs-hostgator-cloud-hosting";
const PRODUCT_A_IMAGE =
  "https://cdn.shopify.com/s/files/1/0770/5192/0623/files/InMotion-VPS-Hosting.png";
const PRODUCT_B_IMAGE =
  "https://cdn.shopify.com/s/files/1/0770/5192/0623/files/HostGator-Cloud-Hosting.png";
const COMPARISON_HERO_IMAGE =
  "https://cdn.shopify.com/s/files/1/0770/5192/0623/files/InMotion-VPS-Hosting-vs-HostGator-VPS-Hosting.png";
const OG_IMAGE = COMPARISON_HERO_IMAGE;
const PAGE_TITLE = "InMotion VPS Hosting vs HostGator VPS Hosting";
const PAGE_SEO_TITLE =
  "InMotion VPS Hosting vs HostGator VPS Hosting – Features, Use Cases & Official Links | ITMart24";
const PAGE_SEO_DESCRIPTION =
  "Compare InMotion VPS Hosting and HostGator VPS Hosting by features, use cases, pricing notes, and official links.";

const replacementBlock = [
  `when '${HANDLE}'`,
  "      assign product_a = 'InMotion VPS Hosting'",
  "      assign product_b = 'HostGator VPS Hosting'",
  "      assign category = 'Web hosting comparison'",
  "      assign intro = 'InMotion VPS Hosting and HostGator VPS Hosting are both aimed at buyers who need more control than standard shared hosting, but they approach the VPS decision from slightly different angles. InMotion presents a broader resource ladder with dedicated IP scaling and onboarding help, while HostGator focuses on self-managed VPS plans with NVMe storage, dedicated resources, and full server-level control.'",
  "      assign summary_a = 'InMotion VPS Hosting is better aligned to developers, agencies, online stores, and growing businesses that want a virtual private server with named vCPU, RAM, NVMe storage, bandwidth, and dedicated IP allocations across several tiers. The range also includes Launch Assist onboarding, and the top plan adds Docker compatibility for more advanced deployment needs.'",
  "      assign summary_b = 'HostGator VPS Hosting is better aligned to buyers who want a self-managed VPS environment with published NVMe tiers, DDR5 memory, unmetered bandwidth, and full server control. The supplied HostGator VPS family also emphasizes dedicated resources, predictable performance, and infrastructure-level support rather than a fully managed hosting experience.'",
  `      assign product_a_image = '${PRODUCT_A_IMAGE}'`,
  `      assign product_b_image = '${PRODUCT_B_IMAGE}'`,
  `      assign hero_image = '${COMPARISON_HERO_IMAGE}'`,
  "      assign official_a_url = 'https://www.inmotionhosting.com/vps-hosting'",
  "      assign official_b_url = 'https://www.hostgator.com/vps-hosting/openclaw'",
  "      assign best_a = 'Growing businesses, developers, agencies, and store owners that need root-level server flexibility, stronger resource isolation, dedicated IPs, and an upgrade path from entry VPS into larger plans with more compute, memory, and NVMe storage.'",
  "      assign best_b = 'Developers, technical teams, and self-managed VPS buyers that want dedicated resources, NVMe storage, full server control, and a lower entry price on long prepaid terms.'",
  "      assign features = 'Primary use case||VPS hosting for buyers who want dedicated server resources, predictable capacity planning, and more control over how workloads are deployed and scaled.||Self-managed VPS hosting for buyers who want dedicated resources, NVMe storage, and full server-level control without moving straight to dedicated hardware.##Starting price signal||Entry pricing starts at $14.99 per month on a one-year VPS 4 vCPU term, with renewal at $26.99 per month and alternate term pricing also available.||Entry pricing begins as low as $2.09 per month on a 24-month NVMe 2 introductory term, with renewal at $4.68 per month, while larger tiers move up through NVMe 4, NVMe 8, and NVMe 16 plans.##Resource model||Published allocations include 8GB to 32GB RAM, 160GB to 460GB NVMe SSD storage, 5TB or unlimited bandwidth, and 2 to 10 dedicated IPs depending on tier.||Published allocations range from 1 to 8 vCPU cores, 2GB to 16GB DDR5 RAM, 50GB to 450GB NVMe storage, and unmetered bandwidth across the visible VPS ladder.##Support and management||Launch Assist onboarding and server setup are included across the VPS range, and the broader InMotion positioning highlights 24/7 human support, security monitoring, and a money-back window.||HostGator VPS is positioned as self-managed infrastructure with 24/7 support at the hardware, network, and virtualization layer, while the customer manages the operating system, configurations, and applications.##Performance and scaling||The lineup provides a clear climb from entry VPS into larger plans with more memory, storage, bandwidth headroom, and dedicated IPs, and the top tier adds Docker compatibility.||The HostGator ladder uses NVMe storage, dedicated resources, and predictable performance, with bigger tiers adding more CPU, RAM, and storage for heavier workloads.##Buyer caution||The stronger VPS tiers become much more expensive at renewal, so contract length and growth expectations matter.||The lowest HostGator entry pricing depends on long prepaid terms, and the service is self-managed, so buyers should be comfortable handling software administration themselves.'",
  "      assign detailed_features = 'Pricing structure||The VPS range begins with a 4 vCPU plan at $14.99 per month on a one-year term, then moves to 8 vCPU at $22.99, 12 vCPU at $32.99, and 16 vCPU at $44.99 on comparable annual pricing. Renewal pricing rises to $26.99, $56.99, $86.99, and $121.99 per month respectively, while shorter and longer terms can shift the monthly rate.||HostGator VPS shows aggressive introductory pricing on longer terms, starting at $2.09 per month for NVMe 2, $4.18 for NVMe 4, $8.36 for NVMe 8, and $17.67 for NVMe 16 on 24-month pricing, with renewal moving to $4.68, $9.35, $18.70, and $39.53 per month.##Performance and scale||InMotion publishes a clear resource ladder with more RAM, storage, bandwidth headroom, and dedicated IPs as you move up the stack. The 16 vCPU tier adds Docker compatibility, which is useful for more advanced application workflows.||HostGator VPS scales from 1 vCPU and 2GB DDR5 RAM up to 8 vCPU and 16GB DDR5 RAM, while NVMe storage climbs from 50GB to 450GB and bandwidth remains unmetered across the visible plans.##Management experience||Launch Assist gives InMotion a more hands-on start for teams planning migrations, initial setup, or tuning. That can matter for buyers moving beyond entry shared hosting.||HostGator VPS is more self-directed. It emphasizes full server control, dedicated resources, infrastructure-level oversight, and a support boundary that stops short of full application management.##Practical tradeoff||InMotion is often the stronger fit when onboarding help, higher RAM ceilings, more dedicated IPs, and a clearer business-growth path matter most.||HostGator VPS is often the stronger fit when buyers want lower promotional entry pricing, a straightforward self-managed VPS model, and a lighter starting point for hands-on infrastructure work.'",
  "      assign pros_a = 'Clear published VPS tiers make capacity planning easier||Dedicated IPs, NVMe storage, and higher RAM options support more demanding sites and applications||Launch Assist onboarding adds value for migrations, setup, and early tuning'",
  "      assign cons_a = 'Renewal pricing rises sharply on higher tiers||Entry plan bandwidth is capped at 5TB before the range shifts to unlimited bandwidth on larger plans||Advanced needs may require moving beyond the lower VPS tiers sooner than expected'",
  "      assign pros_b = 'Lower visible entry pricing on long prepaid terms makes first-step VPS adoption easier||Published NVMe tiers provide a clear ladder from 1 vCPU and 2GB RAM up to 8 vCPU and 16GB RAM||Self-managed positioning gives technical buyers full server-level control and dedicated resources'",
  "      assign cons_b = 'The strongest promotional pricing depends on a 24-month term||Support is infrastructure-focused, so customers manage the operating system, software, and applications themselves||Top-end visible RAM and resource ceilings are lower than InMotions largest VPS tier in this comparison'",
  "      assign choice = 'Choose InMotion VPS Hosting if you want onboarding help, more generous higher-tier capacity, more dedicated IP headroom, and a stronger path for business growth or heavier application workloads. Choose HostGator VPS Hosting if you prefer a self-managed VPS model, want lower entry pricing on long terms, and are comfortable running the software side of the server yourself.'",
  "      assign pricing_note = 'InMotion VPS Hosting starts at $14.99 per month on a one-year term for the 4 vCPU plan and rises through higher-capacity tiers with materially higher renewal pricing. HostGator VPS Hosting starts at $2.09 per month on a 24-month NVMe 2 introductory term, with larger NVMe tiers and higher renewal rates as resources increase. Verify live billing terms, promotional periods, and support scope on each official website before making a final decision.'",
  "      assign faq_rows = 'Is InMotion VPS Hosting or HostGator VPS Hosting better for beginners?||For buyers who are new to VPS, InMotion is often the easier starting point because Launch Assist onboarding adds guidance during setup and migration. HostGator VPS can still work well for beginners with technical confidence, but it is more clearly self-managed.##Who should choose HostGator VPS Hosting?||HostGator VPS Hosting is a good fit for developers, technical teams, and hands-on site owners who want dedicated resources, NVMe storage, full server control, and lower introductory pricing on longer prepaid terms.##How should I compare InMotion VPS and HostGator VPS pricing?||Start with contract length, then compare renewal pricing, vCPU count, RAM, storage, bandwidth, and support boundaries. HostGator has the lower visible entry price, while InMotion provides a different value mix through onboarding help, larger upper tiers, and more dedicated IP scaling.##Does InMotion VPS Hosting include onboarding help?||Yes. The VPS plans include Launch Assist onboarding and server setup, which can be helpful during migration, initial tuning, and early deployment work.##Is HostGator VPS Hosting managed or self-managed?||The supplied HostGator VPS information points to a self-managed model. HostGator maintains the hardware, network, and virtualization layer, while the customer manages the operating system, configurations, and applications.##Which option is better for resource-heavy sites or applications?||InMotion VPS Hosting is usually the stronger fit for heavier workloads when you expect larger RAM pools, more dedicated IPs, and a broader upper tier. HostGator VPS remains relevant for buyers who want a leaner self-managed path with clear NVMe tiering.##What is the main tradeoff with HostGator VPS Hosting?||The biggest tradeoff is that the service is self-managed. That gives you more control, but it also means more responsibility for software administration, updates, and application setup.##Can I use this comparison as the final buying decision?||It is best used as a shortlist and decision aid. Before purchasing, confirm live pricing, contract terms, control-panel needs, support boundaries, and migration requirements on the official provider websites.'",
].join("\n");

const addPricingDefault = (assetValue: string) => {
  if (assetValue.includes("assign pricing_note =")) {
    return assetValue;
  }

  const marker = "  assign detailed_features = blank";
  if (!assetValue.includes(marker)) {
    throw new Error("Unable to locate pricing_note insertion point.");
  }

  return assetValue.replace(
    marker,
    `${marker}\n  assign pricing_note = 'Check the official website for the latest pricing and plan details. ITMart24 does not add unsupported prices, discounts, ratings, or review claims to this comparison page.'`
  );
};

const updatePricingMarkup = (assetValue: string) => {
  if (assetValue.includes("{{ pricing_note }}")) {
    return assetValue;
  }

  const pattern =
    /<p class="comparison-page__muted">Check the official website for the latest pricing and plan details\. ITMart24 does not add unsupported prices, discounts, ratings, or review claims to this comparison page\.<\/p>/;

  if (!pattern.test(assetValue)) {
    throw new Error("Unable to locate pricing note markup.");
  }

  return assetValue.replace(
    pattern,
    '<p class="comparison-page__muted">{{ pricing_note }}</p>'
  );
};

const updateHandleBlock = (assetValue: string) => {
  const pattern = new RegExp(
    `when '${HANDLE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'[\\s\\S]*?(?=\\n\\s*when '|\\n\\s*endcase)`,
    "i"
  );

  if (!pattern.test(assetValue)) {
    throw new Error(`Comparison block for ${HANDLE} was not found.`);
  }

  return assetValue.replace(pattern, replacementBlock);
};

type GraphQlError = {
  message?: string;
};

type UserError = {
  field?: string[] | null;
  message?: string | null;
};

const graphqlRequest = async <TData>(
  query: string,
  variables?: Record<string, unknown>
): Promise<TData> => {
  const response = await shopifyGraphQL.post("", {
    query,
    variables,
  });

  const errors = response.data?.errors as GraphQlError[] | undefined;
  if (Array.isArray(errors) && errors.length > 0) {
    throw new Error(
      errors.map((error) => error.message?.trim()).filter(Boolean).join(", ") ||
        "Shopify GraphQL request failed."
    );
  }

  return response.data.data as TData;
};

const formatUserErrors = (errors: UserError[]) =>
  errors
    .map((error) => {
      const field =
        Array.isArray(error.field) && error.field.length > 0
          ? `${error.field.join(".")}: `
          : "";
      return `${field}${error.message ?? "Unknown error"}`;
    })
    .join("; ");

const setPageOgImage = async () => {
  const pageData = await graphqlRequest<{
    pages: {
      nodes: Array<{
        id: string;
        handle: string;
        title: string;
        metafield?: {
          value: string;
        } | null;
      }>;
    };
  }>(
    `
      query PageByHandle($query: String!) {
        pages(first: 10, query: $query) {
          nodes {
            id
            handle
            title
            metafield(namespace: "custom", key: "og_image") {
              value
            }
          }
        }
      }
    `,
    {
      query: `handle:${HANDLE}`,
    }
  );

  const page = pageData.pages.nodes.find((node) => node.handle === HANDLE);
  if (!page) {
    throw new Error(`Page ${HANDLE} was not found in Shopify.`);
  }

  const mutationData = await graphqlRequest<{
    metafieldsSet: {
      userErrors: UserError[];
    };
  }>(
    `
      mutation SetPageOgImage($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      metafields: [
        {
          ownerId: page.id,
          namespace: "custom",
          key: "og_image",
          type: "url",
          value: OG_IMAGE,
        },
      ],
    }
  );

  if (mutationData.metafieldsSet.userErrors.length > 0) {
    throw new Error(formatUserErrors(mutationData.metafieldsSet.userErrors));
  }
};

const updatePageSeoAndTitle = async () => {
  const response = await shopifyRest.get("/pages.json", {
    params: {
      limit: 250,
    },
  });

  const pages = (response.data?.pages ?? []) as Array<{
    id: number;
    handle: string;
    title: string;
  }>;

  const page = pages.find((node) => node.handle === HANDLE);
  if (!page) {
    throw new Error(`Page ${HANDLE} was not found in Shopify.`);
  }

  await shopifyRest.put(`/pages/${page.id}.json`, {
    page: {
      id: page.id,
      title: PAGE_TITLE,
      metafields_global_title_tag: PAGE_SEO_TITLE,
      metafields_global_description_tag: PAGE_SEO_DESCRIPTION,
    },
  });
};

const verifyAssets = async () => {
  for (const assetKey of ASSET_KEYS) {
    const response = await shopifyRest.get(`/themes/${THEME_ID}/assets.json`, {
      params: {
        "asset[key]": assetKey,
      },
    });

    const value = response.data?.asset?.value as string | undefined;
    if (!value) {
      throw new Error(`Verification failed: ${assetKey} was not readable.`);
    }

    const checks = [
      PRODUCT_A_IMAGE,
      PRODUCT_B_IMAGE,
      COMPARISON_HERO_IMAGE,
      "HostGator VPS Hosting starts at $2.09 per month on a 24-month NVMe 2 introductory term",
      "Does InMotion VPS Hosting include onboarding help?",
    ];

    const missing = checks.filter((entry) => !value.includes(entry));
    if (missing.length > 0) {
      throw new Error(
        `Verification failed for ${assetKey}. Missing: ${missing.join(", ")}`
      );
    }
  }
};

const main = async () => {
  let changedCount = 0;

  for (const assetKey of ASSET_KEYS) {
    const response = await shopifyRest.get(`/themes/${THEME_ID}/assets.json`, {
      params: {
        "asset[key]": assetKey,
      },
    });

    const existingValue = response.data?.asset?.value as string | undefined;
    if (!existingValue) {
      throw new Error(`Theme asset value was not returned for ${assetKey}.`);
    }

    let nextValue = existingValue;
    nextValue = addPricingDefault(nextValue);
    nextValue = updatePricingMarkup(nextValue);
    nextValue = updateHandleBlock(nextValue);

    if (nextValue === existingValue) {
      console.log(`No change needed for ${assetKey}.`);
      continue;
    }

    await shopifyRest.put(`/themes/${THEME_ID}/assets.json`, {
      asset: {
        key: assetKey,
        value: nextValue,
      },
    });

    changedCount += 1;
    console.log(`Updated ${assetKey}.`);
  }

  await updatePageSeoAndTitle();
  await setPageOgImage();
  await verifyAssets();
  console.log(`Updated ${changedCount} comparison asset(s) for ${HANDLE}.`);
  console.log("Theme asset verification passed.");
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
