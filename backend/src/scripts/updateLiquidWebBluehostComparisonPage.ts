import "../config/env";
import { shopifyRest } from "../services/shopifyHttp";
import { shopifyGraphQL } from "../services/shopifyHttp";

const THEME_ID = "159711920367";
const ASSET_KEYS = [
  "sections/product-comparison-page.liquid",
  "sections/product-comparison-page-v2.liquid",
];
const HANDLE = "liquid-web-managed-hosting-vs-bluehost-wordpress-hosting";
const PRODUCT_A_LOGO =
  "https://cdn.shopify.com/s/files/1/0770/5192/0623/files/LiquidWeb.jpg";
const PRODUCT_B_LOGO =
  "https://cdn.shopify.com/s/files/1/0770/5192/0623/files/bluehost-wordpress.png";
const COMPARISON_HERO_IMAGE =
  "https://cdn.shopify.com/s/files/1/0770/5192/0623/files/LiquidWeb_Bluehost.png";
const OG_IMAGE = COMPARISON_HERO_IMAGE;

const replacementBlock = [
  `when '${HANDLE}'`,
  "      assign product_a = 'Liquid Web Managed Hosting'",
  "      assign product_b = 'Bluehost WordPress Hosting'",
  "      assign category = 'Web hosting comparison'",
  "      assign intro = 'Liquid Web Managed Hosting and Bluehost WordPress Hosting both target WordPress users, but they serve different stages of growth. Liquid Web leans toward managed hosting depth and larger scaling paths, while Bluehost focuses on approachable onboarding, simpler plan selection, and a more accessible entry point for everyday website owners.'",
  "      assign summary_a = 'Liquid Web Managed Hosting is better aligned to buyers who want a managed WordPress hosting path that can move from a Spark entry plan into Builder, Producer, and Enterprise families with higher site counts, more storage, stronger worker capacity, and Cloudflare Enterprise, DDoS, WAF, migration, and staging options across the lineup.'",
  "      assign summary_b = 'Bluehost WordPress Hosting is better aligned to buyers who want an easier WordPress setup path with entry-level pricing, AI site creation tools, a free domain in the first year, CDN access, managed updates, and a beginner-friendly hosting experience.'",
  `      assign product_a_image = '${PRODUCT_A_LOGO}'`,
  `      assign product_b_image = '${PRODUCT_B_LOGO}'`,
  `      assign hero_image = '${COMPARISON_HERO_IMAGE}'`,
  "      assign official_a_url = 'https://www.liquidweb.com/wordpress-hosting/'",
  "      assign official_b_url = 'https://bluehost.com/'",
  "      assign best_a = 'Agencies, multi-site operators, WooCommerce teams, and businesses that expect managed hosting depth, stronger scaling paths, and a clearer route from starter plans to high-capacity environments.'",
  "      assign best_b = 'Beginners, bloggers, small businesses, and WordPress users that want straightforward onboarding, visible promotional entry pricing, bundled website tools, and easier early-stage plan selection.'",
  "      assign features = 'Primary use case||Managed WordPress hosting for business, agency, and scaling workloads that may grow from entry plans to large multi-site estates.||WordPress hosting for accessible site launches, small business growth, and users that want simpler onboarding with familiar bundled tools.##Starting price signal||Public entry pricing can begin as low as $4 per month on the longest prepaid term, with higher monthly pricing on shorter commitments.||Public entry pricing begins around $4.19 per month on a long-term plan, with renewal pricing rising after the introductory term.##Growth path||The lineup extends from smaller starter plans into pro and enterprise-oriented tiers with broader site capacity, larger storage pools, and stronger worker allocation.||The range moves from entry WordPress hosting into higher-performance plans with more resources, broader website capacity, and additional premium features.##Security and backups||Daily backups, DDoS protection, web application firewall coverage, CDN-related benefits, and staging or assisted migration appear across the range, with some advantages reserved for higher plans.||Free SSL, malware protection, backups, WAF, DDoS protection, domain privacy on eligible terms, and WordPress staging are part of the broader hosting proposition.##Support and management||The service emphasizes managed hosting operations, migration options, and stronger support signals for more demanding workloads.||The service emphasizes managed WordPress updates, AI site tools, chat and phone support, and an easier onboarding path for newer users.'",
  "      assign detailed_features = 'Pricing structure||Entry managed plans can start around $6 monthly, with lower effective pricing on one-year, two-year, or three-year prepaid terms. Higher tiers move meaningfully upward, with pro-oriented plans around $46 monthly and enterprise-oriented plans starting above $300 monthly before long-term discounts.||Business WordPress Hosting can start around $4.19 per month on a 36-month term with renewal near $13.99, while Premium is around $11.99 with renewal near $20.99. Public Pro pricing notes can show roughly $13.95 per month on a 36-month term with renewal near $28.99, plus alternate annual billing references.##Resources and scale||The broader range spans from single-site entry hosting with modest storage and worker levels up to high-capacity enterprise environments with hundreds of sites, much larger storage allowances, and stronger autoscaled worker capacity.||Business plans begin with generous website allowances and NVMe storage, while Premium and Pro tiers add stronger performance, broader website support, optimized resources, and features such as a dedicated IP on higher tiers.##Migration and staging||Migration options can range from self-serve on lower tiers to assisted migration and free staging on more advanced plans.||The platform promotes migration tools, website migration help on stronger tiers, and WordPress staging for safer updates and testing.##Buyer tradeoff||Liquid Web is usually the better fit when operational depth, scaling flexibility, and managed infrastructure matter more than the lowest starting price.||Bluehost is often the better fit when entry affordability, easier onboarding, and bundled site-building tools matter more than deeper infrastructure customization.'",
  "      assign pros_a = 'Clear upgrade path from entry managed WordPress plans into pro and enterprise families||Concrete site, storage, bandwidth, and worker guidance makes capacity planning easier||Cloudflare Enterprise, DDoS protection, WAF, migration options, and staging help support more demanding hosting needs'",
  "      assign cons_a = 'Best entry pricing depends on one-year, two-year, or three-year prepayment||Advanced features vary by plan tier, especially around migration, staging, and autoscaled workers||Enterprise-grade capacity raises monthly and renewal-style spend well beyond starter hosting budgets'",
  "      assign pros_b = 'Lower introductory pricing makes entry easier for many small sites||AI site tools, a free first-year domain, CDN access, managed updates, and guided onboarding help first-time WordPress buyers||Security and convenience features such as SSL, malware protection, WAF, DDoS protection, backups, SSH, WP-CLI, and staging strengthen the overall package'",
  "      assign cons_b = 'Renewal pricing can rise well above the introductory rate||Some stronger performance and premium benefits are reserved for higher plans||Billing structure and renewal math deserve careful review before checkout'",
  "      assign choice = 'Choose Liquid Web Managed Hosting if you expect broader scaling, more operational depth, or a managed WordPress path that can move from small business hosting into pro and enterprise-grade environments. Choose Bluehost WordPress Hosting if you want easier WordPress onboarding, lower visible entry pricing, and bundled website tools for a growing site that does not yet need the same infrastructure depth.'",
  "      assign pricing_note = 'Liquid Web pricing can range from around $6 per month on entry monthly terms to lower effective pricing near $4 on longer prepaid commitments, while pro and enterprise families rise substantially as capacity increases. Bluehost WordPress Hosting can begin around $4.19 per month on a long-term term, with Premium near $11.99 and Pro around $13.95 in some public pricing notes, while renewals trend notably higher. Verify current billing terms on each official website before purchase.'",
  "      assign faq_rows = 'Which hosting provider is better for beginners, Liquid Web or Bluehost?||Bluehost is usually the easier starting point for beginners because it emphasizes approachable onboarding, AI site tools, bundled setup features, and lower introductory pricing. Liquid Web is typically the better fit when buyers already know they need more operational depth or expect heavier long-term growth.##Which option is better for agencies or multi-site businesses?||Liquid Web is generally the stronger fit for agencies and multi-site operations because it offers a broader scaling path from entry managed hosting into pro and enterprise families with much higher site counts, storage, and worker capacity.##How should I compare Liquid Web and Bluehost pricing?||Start with the lowest visible paid term, then check renewal pricing, contract length, and higher-tier differences. In general, Bluehost shows the lower entry price, while Liquid Web spans a much wider range from starter plans to enterprise-level managed hosting.##Does ITMart24 sell these hosting plans directly?||ITMart24 does not directly sell hosting plans. The purpose of this comparison is to help you make a more informed and tailored buying decision before you visit the official provider website.##What should I verify before choosing a hosting provider?||Verify billing term, renewal pricing, migration level, backup retention, staging access, security coverage, support channel availability, and whether the plan can scale with your expected site count and traffic.##Is Liquid Web better for higher-growth WordPress projects?||Liquid Web is often the better fit for higher-growth WordPress projects when you expect broader scaling, stronger worker capacity, larger storage pools, or a path into more advanced managed environments.##Is Bluehost still a good choice for small business WordPress sites?||Yes. Bluehost remains a relevant option for small business WordPress sites because it combines approachable setup, bundled site tools, security features, staging support, and lower introductory pricing than larger managed hosting families.##Why does ITMart24 compare these providers if it does not sell the plans directly?||ITMart24 helps buyers research features, plan structure, tradeoffs, and official links in one place so they can shortlist hosting providers with more confidence before purchasing from the vendor itself.'",
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
      PRODUCT_A_LOGO,
      PRODUCT_B_LOGO,
      COMPARISON_HERO_IMAGE,
      "ITMart24 does not directly sell hosting plans.",
      "Which hosting provider is better for beginners, Liquid Web or Bluehost?",
    ];

    const missing = checks.filter((entry) => !value.includes(entry));
    if (missing.length > 0) {
      throw new Error(`Verification failed for ${assetKey}. Missing: ${missing.join(", ")}`);
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

  await setPageOgImage();
  await verifyAssets();
  console.log(`Updated ${changedCount} comparison asset(s) for ${HANDLE}.`);
  console.log("Theme asset verification passed.");
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
