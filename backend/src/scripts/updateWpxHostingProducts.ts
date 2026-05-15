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
const SHOPIFY_GRAPHQL_PAGE_SIZE = 50;
const MULTILINE_SEPARATOR = "\r\n";
const WPX_LOGO_URL =
  "https://cdn.shopify.com/s/files/1/0770/5192/0623/files/WPX_Logo_Purple_and_Orange.png";
const WPX_AFFILIATE_URL = "https://wpx.net/?affid=12462";
const WPX_VENDOR = "WPX Hosting";

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
  vendor: string;
  officialUrl: string;
  price: string;
  productType: string;
  productCategoryLabel: string;
  categoryHints: string[];
  filters: Record<string, string[]>;
  seoTitle: string;
  seoDescription: string;
  audience: string;
  introTheme: string;
  planPositioning: string;
  useCases: string[];
  pricingPoints: string[];
  featureGroups: FeatureGroup[];
  pros: string[];
  cons: string[];
  buyerConsiderations: string[];
  bodyFacts: string[];
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

const htmlList = (items: string[]) =>
  `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;

const buildPlainTextSection = (heading: string, items: string[]) => {
  const normalizedItems = dedupe(items.map((item) => normalizeText(item)).filter(Boolean));
  if (normalizedItems.length === 0) {
    return "";
  }

  return [heading, ...normalizedItems.map((item) => `- ${item}`)].join(MULTILINE_SEPARATOR);
};

const buildPriceBand = (price: string) => {
  const amount = Number(price);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Free";
  }
  if (amount < 10) {
    return "Under $10/month";
  }
  if (amount <= 50) {
    return "$10-$50/month";
  }
  if (amount <= 200) {
    return "$51-$200/month";
  }
  if (amount <= 500) {
    return "$201-$500/month";
  }
  return "Over $500/month";
};

const makeSpec = (input: Omit<ProductSpec, "vendor" | "officialUrl">): ProductSpec => ({
  ...input,
  vendor: WPX_VENDOR,
  officialUrl: WPX_AFFILIATE_URL,
});

const TARGET_SPECS: ProductSpec[] = [
  makeSpec({
    title: "WPX Hosting Starter",
    price: "11.99",
    productType: "WordPress Hosting",
    productCategoryLabel: "Managed WordPress Hosting",
    categoryHints: ["Cloud Services", "WordPress Hosting", "Managed WordPress Hosting"],
    filters: {
      hosting_type: ["Managed WordPress"],
      pricing_model: ["Subscription"],
      price_band: [buildPriceBand("11.99")],
      billing_cycle: ["Monthly", "Annual"],
      performance_tier: ["Standard"],
      support_coverage: ["24/7 support"],
      target_segment: ["Individuals", "Small business"],
    },
    seoTitle: "WPX Hosting Starter WPX Managed WordPress Hosting",
    seoDescription:
      "WPX Hosting Starter highlights entry managed WordPress hosting with CDN, backups, malware cleanup, and lower prepaid pricing.",
    audience:
      "individual site owners, bloggers, and small businesses launching one WordPress website on managed hosting",
    introTheme:
      "the entry WPX WordPress hosting offer built around the supplied Starter plan, where one-site coverage, practical management features, and lower prepaid pricing matter more than raw scale",
    planPositioning:
      "Starter is the one-site entry point in the supplied WordPress hosting range and is positioned for buyers that want managed hosting without stepping into a multi-site or agency-sized package.",
    useCases: [
      "launching one business or content website on managed WordPress hosting",
      "moving from basic hosting to a platform with backups, SSL, and malware cleanup included",
      "starting with one site while keeping room to review stronger WPX tiers later",
    ],
    pricingPoints: [
      "Starter is listed at $17.99 per month on the monthly view.",
      "The yearly prepaid rate is shown as $14.99 per month with two months free included.",
      "The lowest visible public rate in the supplied Starter pricing ladder is $11.99 per month when prepaid for five years.",
      "Multi-year savings increase as the billing term gets longer, so the best rate is tied to prepayment.",
    ],
    featureGroups: [
      {
        heading: "Core Features",
        items: [
          "1 Website",
          "10 GB Storage",
          "Unlimited Visitors",
          "100 GB Bandwidth",
        ],
      },
      {
        heading: "Performance",
        items: [
          "3 GB RAM",
          "0.5 CPU Cores",
          "9 PHP Workers",
          "Custom high-speed global CDN",
        ],
      },
      {
        heading: "Security",
        items: [
          "Free SSL Certificates",
          "Daily Backups",
          "Malware scans and removal",
        ],
      },
      {
        heading: "Support",
        items: [
          "Site Migrations",
          "Fixed For You Guarantee",
          "24/7 Technical Support",
        ],
      },
    ],
    pros: [
      "The supplied Starter plan includes CDN, backups, SSL, malware cleanup, and 24/7 support.",
      "Public monthly, yearly, and longer prepaid prices are clearly listed.",
      "The plan is straightforward for one-site buyers who want managed WordPress hosting.",
    ],
    cons: [
      "The best advertised price depends on long-term prepayment.",
      "Starter is limited to 1 website and 10 GB storage.",
      "Bandwidth is lower than the stronger WordPress and WooCommerce tiers in the supplied range.",
    ],
    buyerConsiderations: [
      "Starter is the closest fit for one-site buyers rather than agencies or multi-site teams.",
      "The monthly view is materially higher than the deepest prepaid rate.",
      "Storage and performance resources are more limited than Business or Professional.",
    ],
    bodyFacts: [
      "Starter covers one high-performance site.",
      "The supplied entry plan includes 3 GB RAM, 0.5 CPU cores, and 9 PHP workers.",
      "Daily backups, malware scans and removal, and 24/7 technical support are explicit in the source details.",
    ],
  }),
  makeSpec({
    title: "WPX Hosting Business",
    price: "19.99",
    productType: "WordPress Hosting",
    productCategoryLabel: "Managed WordPress Hosting",
    categoryHints: ["Cloud Services", "WordPress Hosting", "Managed WordPress Hosting"],
    filters: {
      hosting_type: ["Managed WordPress"],
      pricing_model: ["Subscription"],
      price_band: [buildPriceBand("19.99")],
      billing_cycle: ["Monthly", "Annual"],
      performance_tier: ["Premium"],
      support_coverage: ["24/7 support"],
      target_segment: ["Small business"],
    },
    seoTitle: "WPX Hosting Business WPX Managed WordPress Hosting",
    seoDescription:
      "WPX Hosting Business covers growing WordPress hosting with more websites, email features, CDN, backups, and managed support.",
    audience:
      "growing small businesses that need more than a one-site plan and want bundled email and managed hosting features",
    introTheme:
      "the WPX Business WordPress hosting plan from the supplied data, where website count, bundled email capability, and stronger resource headroom matter more than bare entry price",
    planPositioning:
      "Business is positioned above Starter for growing small businesses that need room for more websites and a broader email-capable managed setup.",
    useCases: [
      "running several small business or brand sites on one managed account",
      "adding business email and webmail support to a WordPress hosting purchase",
      "moving beyond starter site limits while staying in the same WPX family",
    ],
    pricingPoints: [
      "Business is listed at $29.99 per month on the monthly view.",
      "The yearly prepaid rate is shown as $24.99 per month with two months free included.",
      "The lowest visible public rate in the supplied Business pricing ladder is $19.99 per month when prepaid for five years.",
      "Longer terms reduce the advertised monthly equivalent, so billing commitment changes the effective entry cost.",
    ],
    featureGroups: [
      {
        heading: "Core Features",
        items: [
          "Up to 5 Websites",
          "20 GB Storage",
          "Unlimited Visitors",
          "200 GB Bandwidth",
        ],
      },
      {
        heading: "Performance",
        items: [
          "5 GB RAM",
          "1 CPU Core",
          "15 PHP Workers",
          "Custom high-speed global CDN",
        ],
      },
      {
        heading: "Security",
        items: [
          "Free SSL Certificates",
          "Daily Backups",
          "Malware scans and removal",
          "AI-powered Email Protection",
        ],
      },
      {
        heading: "Managed Features",
        items: [
          "Business Email",
          "Webmail",
          "Unlimited Mail Boxes",
          "Email Migrations",
          "Temp URL",
          "24/7 Technical Support",
        ],
      },
    ],
    pros: [
      "Business increases website count, bandwidth, and PHP workers over Starter.",
      "The supplied plan adds business email, webmail, unlimited mail boxes, and email migrations.",
      "Managed security and support features remain part of the offer.",
    ],
    cons: [
      "The lowest advertised rate still depends on long-term prepayment.",
      "Business has less storage and performance headroom than Professional or Agency Hosting tiers.",
      "Buyers needing many more sites may outgrow the 5-site ceiling.",
    ],
    buyerConsiderations: [
      "Business is stronger than Starter for multi-site small business use, but it is not the agency-scale tier.",
      "Email-focused features are part of the package, so it can fit buyers consolidating website and email needs.",
      "The monthly headline price is higher than the longer-term prepaid rates.",
    ],
    bodyFacts: [
      "Business is positioned for growing small businesses.",
      "The supplied plan supports up to 5 websites and 20 GB storage.",
      "Email migrations, AI-powered email protection, and temp URL support are explicitly listed.",
    ],
  }),
  makeSpec({
    title: "WPX Hosting Professional",
    price: "39.99",
    productType: "WordPress Hosting",
    productCategoryLabel: "Managed WordPress Hosting",
    categoryHints: ["Cloud Services", "WordPress Hosting", "Managed WordPress Hosting"],
    filters: {
      hosting_type: ["Managed WordPress"],
      pricing_model: ["Subscription"],
      price_band: [buildPriceBand("39.99")],
      billing_cycle: ["Monthly", "Annual"],
      performance_tier: ["Premium"],
      support_coverage: ["24/7 support"],
      target_segment: ["Agencies", "Small business"],
    },
    seoTitle: "WPX Hosting Professional WPX Managed WordPress Hosting",
    seoDescription:
      "WPX Hosting Professional highlights higher-capacity managed WordPress hosting for freelancers and agencies with stronger resources.",
    audience:
      "freelancers, professional site operators, and small agencies that need more room than entry WordPress hosting plans",
    introTheme:
      "the higher-capacity WPX Professional WordPress hosting plan described in the supplied data, where stronger RAM, CPU, worker levels, and broader site coverage support scaling teams",
    planPositioning:
      "Professional sits above Business and is framed for scaling freelancers and small agencies that want materially more resources without going all the way to the agency-focused plans.",
    useCases: [
      "managing a portfolio of client or brand sites on one managed hosting tier",
      "supporting heavier WordPress workloads with more RAM, CPU, and PHP workers",
      "scaling from a small business plan into a more agency-friendly setup",
    ],
    pricingPoints: [
      "Professional is listed at $59.99 per month on the monthly view.",
      "The yearly prepaid rate is shown as $49.99 per month with two months free included.",
      "The lowest visible public rate in the supplied Professional pricing ladder is $39.99 per month when prepaid for five years.",
      "Prepaid terms materially reduce the effective monthly price compared with the month-to-month view.",
    ],
    featureGroups: [
      {
        heading: "Core Features",
        items: [
          "Up to 15 Websites",
          "40 GB Storage",
          "Unlimited Visitors",
          "400 GB Bandwidth",
        ],
      },
      {
        heading: "Performance",
        items: [
          "15 GB RAM",
          "2 CPU Cores",
          "45 PHP Workers",
          "Custom high-speed global CDN",
        ],
      },
      {
        heading: "Security",
        items: [
          "Free SSL Certificates",
          "Daily Backups",
          "Malware scans and removal",
          "AI-powered Email Protection",
        ],
      },
      {
        heading: "Managed Features",
        items: [
          "Business Email",
          "Webmail",
          "Unlimited Mail Boxes",
          "Email Migrations",
          "Temp URL",
          "24/7 Technical Support",
        ],
      },
    ],
    pros: [
      "Professional offers substantially more websites, storage, RAM, CPU, and PHP workers than the lower WordPress tiers.",
      "The plan keeps WPX email, security, support, and CDN features in place.",
      "The supplied positioning is well aligned to freelancers and small agencies.",
    ],
    cons: [
      "The best advertised rate depends on long-term prepayment.",
      "Professional is still smaller than Elite or Agency Hosting for higher-end agency workloads.",
      "Monthly pricing is notably higher than the deepest prepaid figure.",
    ],
    buyerConsiderations: [
      "Professional is the clearest fit when Business looks too small but agency hosting is still unnecessary.",
      "Website count and PHP worker headroom are important comparison points here, not just price.",
      "Teams expecting rapid portfolio growth may need to compare against Elite or Agency Hosting too.",
    ],
    bodyFacts: [
      "Professional is described for scaling freelancers and small agencies.",
      "The supplied plan supports up to 15 websites, 40 GB storage, and 45 PHP workers.",
      "It inherits the WordPress family email, support, security, and migration features from the provided plan details.",
    ],
  }),
  makeSpec({
    title: "WPX Agency Hosting Elite",
    price: "79.99",
    productType: "Managed Hosting",
    productCategoryLabel: "Managed WordPress Hosting",
    categoryHints: ["Cloud Services", "Managed Hosting", "Managed WordPress Hosting"],
    filters: {
      hosting_type: ["Managed WordPress"],
      pricing_model: ["Subscription"],
      price_band: [buildPriceBand("79.99")],
      billing_cycle: ["Monthly", "Annual"],
      performance_tier: ["Enterprise"],
      support_coverage: ["24/7 support"],
      target_segment: ["Agencies", "Mid-market"],
    },
    seoTitle: "WPX Agency Hosting Elite WPX Managed Hosting",
    seoDescription:
      "WPX Agency Hosting Elite covers high-capacity managed hosting for power users with Redis, email features, CDN, and stronger resources.",
    audience:
      "power users, larger freelancers, and agencies that need agency-grade managed hosting without jumping to the largest WPX agency tier",
    introTheme:
      "the WPX Elite agency hosting plan from the supplied data, where higher website ceilings, Redis Cache, broad support coverage, and larger compute resources define the value",
    planPositioning:
      "Elite is the upper agency-oriented hosting tier below the largest Agency plan and is framed for power users that need more scale than standard WordPress hosting.",
    useCases: [
      "running a larger agency portfolio with stronger resource headroom",
      "supporting multiple client sites with managed migrations, backups, and Redis Cache included",
      "moving to an agency-grade WPX plan without using the largest available tier",
    ],
    pricingPoints: [
      "Elite is listed at $119.99 per month on the monthly view.",
      "The yearly prepaid rate is shown as $99.99 per month with two months free included.",
      "The lowest visible public rate in the supplied Elite pricing ladder is $79.99 per month when prepaid for five years.",
      "Longer prepaid terms lower the effective monthly cost but require greater upfront commitment.",
    ],
    featureGroups: [
      {
        heading: "Core Features",
        items: [
          "Up to 35 Websites",
          "80 GB Storage",
          "Unlimited Visitors",
          "Unlimited Bandwidth",
        ],
      },
      {
        heading: "Performance",
        items: [
          "35 GB RAM",
          "3 CPU Cores",
          "105 PHP Workers",
          "Custom high-speed global CDN",
          "Redis Cache",
        ],
      },
      {
        heading: "Security",
        items: [
          "Free SSL Certificates",
          "Daily Backups",
          "Malware scans and removal",
          "AI-Powered Email Protection",
        ],
      },
      {
        heading: "Managed Features",
        items: [
          "Site and Email Migrations",
          "Business Email + Webmail",
          "Unlimited Mail Boxes",
          "Temp URL",
          "Fixed For You Guarantee",
          "24/7 Technical Support",
        ],
      },
    ],
    pros: [
      "Elite provides a large jump in website capacity, RAM, CPU, PHP workers, and bandwidth.",
      "Redis Cache is explicitly included in the supplied Elite feature set.",
      "The plan keeps email, migration, security, backup, and support coverage in one managed package.",
    ],
    cons: [
      "The best advertised price depends on long-term prepayment.",
      "Elite costs materially more than the regular WordPress hosting tiers.",
      "Buyers with very large agency estates may still need the bigger Agency plan.",
    ],
    buyerConsiderations: [
      "Elite is best compared on website ceiling, worker count, and storage rather than on monthly price alone.",
      "It is a stronger agency fit than Professional when portfolio size or concurrency is growing.",
      "Teams with exceptionally large site counts should compare it with the top Agency tier.",
    ],
    bodyFacts: [
      "Elite is described as agency hosting for power users.",
      "The supplied plan includes 35 GB RAM, 3 CPU cores, and 105 PHP workers.",
      "Redis Cache and unlimited bandwidth are explicitly listed on the Elite tier.",
    ],
  }),
  makeSpec({
    title: "WPX Agency Hosting",
    price: "399.99",
    productType: "Managed Hosting",
    productCategoryLabel: "Managed WordPress Hosting",
    categoryHints: ["Cloud Services", "Managed Hosting", "Managed WordPress Hosting"],
    filters: {
      hosting_type: ["Managed WordPress"],
      pricing_model: ["Subscription"],
      price_band: [buildPriceBand("399.99")],
      billing_cycle: ["Monthly", "Annual"],
      performance_tier: ["Enterprise"],
      support_coverage: ["24/7 support"],
      target_segment: ["Agencies", "Enterprise"],
    },
    seoTitle: "WPX Agency Hosting WPX Enterprise Managed Hosting",
    seoDescription:
      "WPX Agency Hosting summarizes the largest agency-focused WPX plan with high website capacity, Redis, CDN, and managed support.",
    audience:
      "large agencies and multi-site operators that need the highest WPX website capacity and stronger infrastructure headroom",
    introTheme:
      "the top-end WPX Agency Hosting tier from the supplied data, where very high website limits, larger storage, stronger compute levels, and managed operational tooling matter more than entry affordability",
    planPositioning:
      "Agency is the largest supplied WPX agency hosting plan and is designed for teams that need a much bigger site ceiling and broader resource allocation than Elite.",
    useCases: [
      "operating a large agency portfolio with many production sites",
      "consolidating multi-brand WordPress workloads under one managed hosting tier",
      "using the strongest supplied WPX hosting resources for agency-scale projects",
    ],
    pricingPoints: [
      "Agency is listed at $599.99 per month on the monthly view.",
      "The yearly prepaid rate is shown as $499.99 per month with two months free included.",
      "The lowest visible public rate in the supplied Agency pricing ladder is $399.99 per month when prepaid for five years.",
      "The plan's pricing changes significantly by billing term, so buyers should compare total commitment as well as monthly equivalent.",
    ],
    featureGroups: [
      {
        heading: "Core Features",
        items: [
          "Up to 200 Websites",
          "300 GB Storage",
          "Unlimited Visitors",
          "Unlimited Bandwidth",
        ],
      },
      {
        heading: "Performance",
        items: [
          "100 GB RAM",
          "6 CPU Cores",
          "300 PHP Workers",
          "Custom high-speed global CDN",
          "Redis Cache",
        ],
      },
      {
        heading: "Security",
        items: [
          "Free SSL Certificates",
          "Daily Backups",
          "Malware scans and removal",
          "AI-Powered Email Protection",
        ],
      },
      {
        heading: "Managed Features",
        items: [
          "Site and Email Migrations",
          "Business Email + Webmail",
          "Unlimited Mail Boxes",
          "Temp URL",
          "Fixed For You Guarantee",
          "24/7 Technical Support",
        ],
      },
    ],
    pros: [
      "Agency is the strongest supplied WPX tier for website count, RAM, CPU, storage, and PHP workers.",
      "The plan includes Redis Cache, CDN, backups, malware cleanup, migrations, and 24/7 support.",
      "It is clearly positioned for large agency or multi-site operations rather than small hosting needs.",
    ],
    cons: [
      "Agency pricing is far higher than the smaller WPX plans.",
      "The best advertised rate depends on long prepaid terms.",
      "The plan is likely oversized for buyers that only need a few sites.",
    ],
    buyerConsiderations: [
      "Agency makes the most sense when very high site counts or heavy concurrency justify the larger spend.",
      "Compare this tier against Elite based on actual site portfolio size and resource needs.",
      "The upfront commitment rises materially on the discounted long-term terms.",
    ],
    bodyFacts: [
      "Agency is described as full-service agency hosting.",
      "The supplied plan supports up to 200 websites with 300 GB storage and 300 PHP workers.",
      "It carries Redis Cache, migrations, email features, and managed protection features in the provided details.",
    ],
  }),
  makeSpec({
    title: "WPX Hosting (with WooCommerce)",
    preferredProductId: 9102082605295,
    price: "23.33",
    productType: "E-commerce Hosting",
    productCategoryLabel: "Managed WooCommerce Hosting",
    categoryHints: [
      "Cloud Services",
      "E-commerce Hosting",
      "WooCommerce Hosting",
      "Managed WooCommerce Hosting",
    ],
    filters: {
      hosting_type: ["Managed WordPress"],
      pricing_model: ["Subscription"],
      price_band: [buildPriceBand("23.33")],
      billing_cycle: ["Monthly", "Annual"],
      performance_tier: ["Premium"],
      support_coverage: ["24/7 support"],
      target_segment: ["Small business", "Agencies"],
    },
    seoTitle: "WPX Hosting with WooCommerce WPX WooCommerce Hosting",
    seoDescription:
      "WPX Hosting with WooCommerce covers managed WooCommerce-ready hosting with CDN, backups, malware cleanup, and public multi-term pricing.",
    audience:
      "store owners, growing online businesses, and agencies that want WooCommerce-ready hosting with managed operational features instead of a bare server setup",
    introTheme:
      "a WooCommerce-focused WPX hosting listing built from the supplied Powerstore, Superstore, and Hyperstore plan family, where ecommerce performance, managed support, and public term pricing are the main customer-facing decision points",
    planPositioning:
      "This existing Shopify title is a generic WooCommerce-facing WPX listing, so it is best treated as a family-level product that summarizes the three supplied WooCommerce tiers rather than pretending it is one exact named plan.",
    useCases: [
      "launching one WooCommerce store with managed hosting and a lower paid entry point",
      "scaling from a single store to a small ecommerce portfolio on stronger WPX tiers",
      "comparing WooCommerce-focused hosting around storage, bandwidth, RAM, CPU, and support coverage",
    ],
    pricingPoints: [
      "Powerstore starts at $34.99 per month on the monthly view.",
      "The yearly prepaid rate for Powerstore is shown as $29.16 per month with two months free included.",
      "The lowest visible paid public rate in the supplied WooCommerce family is $23.33 per month when prepaid for five years.",
      "Superstore and Hyperstore raise pricing for higher store capacity, storage, RAM, CPU, and bandwidth headroom.",
    ],
    featureGroups: [
      {
        heading: "Core Features",
        items: [
          "WooCommerce-optimized hosting",
          "1 website on Powerstore, up to 3 on Superstore, and up to 5 on Hyperstore",
          "20 GB, 50 GB, or 100 GB storage depending on plan",
          "Unlimited visitors across the supplied WooCommerce plans",
          "400 GB or unlimited bandwidth depending on plan",
        ],
      },
      {
        heading: "Performance",
        items: [
          "8 GB RAM, 2 CPU cores, and 10 PHP workers on Powerstore",
          "36 GB RAM, 3 CPU cores, and 40 PHP workers on Superstore",
          "80 GB RAM, 4 CPU cores, and 80 PHP workers on Hyperstore",
          "Custom high-speed global CDN",
          "Redis Cache",
        ],
      },
      {
        heading: "Security",
        items: [
          "Free SSL Certificates",
          "Daily Backups",
          "Malware scans and removal",
          "AI-Powered Email Protection",
        ],
      },
      {
        heading: "Managed Features",
        items: [
          "Site and Email Migrations",
          "Business Email + Webmail",
          "Unlimited Mail Boxes",
          "Temp URL",
          "Fixed For You Guarantee",
          "24/7 Technical Support",
        ],
      },
    ],
    pros: [
      "The supplied WooCommerce family publishes multiple billing-term prices instead of only a vague starting point.",
      "Every listed WooCommerce tier includes CDN, SSL, backups, malware removal, and 24/7 support.",
      "Higher plans add substantially more RAM, CPU, PHP workers, storage, and website capacity for growing stores.",
    ],
    cons: [
      "The lowest advertised price depends on long-term prepayment.",
      "Entry storage on Powerstore is limited to 20 GB.",
      "Higher resource levels and multi-store capacity require moving to the more expensive Superstore or Hyperstore tiers.",
    ],
    buyerConsiderations: [
      "Use website count, PHP workers, and storage needs alongside price when comparing the WPX WooCommerce tiers.",
      "The monthly headline price is higher than the deepest prepaid rate, so billing term materially affects total cost.",
      "Powerstore is the closest fit for a one-store entry buyer, while larger catalogs or multiple stores align better with Superstore or Hyperstore.",
    ],
    bodyFacts: [
      "The supplied WooCommerce family includes Powerstore, Superstore, and Hyperstore.",
      "Powerstore is positioned for one high-performance store, while Superstore and Hyperstore expand store count and resource ceilings.",
      "Redis Cache, global CDN, malware scans and removal, daily backups, and 24/7 technical support are explicit in the provided plan details.",
    ],
  }),
  makeSpec({
    title: "WPX WooCommerce Hosting Powerstore",
    price: "23.33",
    productType: "E-commerce Hosting",
    productCategoryLabel: "Managed WooCommerce Hosting",
    categoryHints: [
      "Cloud Services",
      "E-commerce Hosting",
      "WooCommerce Hosting",
      "Managed WooCommerce Hosting",
    ],
    filters: {
      hosting_type: ["Managed WordPress"],
      pricing_model: ["Subscription"],
      price_band: [buildPriceBand("23.33")],
      billing_cycle: ["Monthly", "Annual"],
      performance_tier: ["Premium"],
      support_coverage: ["24/7 support"],
      target_segment: ["Small business"],
    },
    seoTitle: "WPX WooCommerce Hosting Powerstore WPX Managed WooCommerce Hosting",
    seoDescription:
      "WPX WooCommerce Hosting Powerstore covers one-store managed WooCommerce hosting with CDN, Redis, backups, and prepaid pricing.",
    audience:
      "single-store merchants that want WooCommerce-optimized hosting with stronger managed features than a basic shared setup",
    introTheme:
      "the entry WPX WooCommerce plan from the supplied Powerstore data, where one-store coverage, Redis Cache, and managed support are paired with public term pricing",
    planPositioning:
      "Powerstore is the closest one-store WooCommerce entry plan in the supplied WPX ecommerce family.",
    useCases: [
      "launching one high-performance WooCommerce store on managed hosting",
      "moving to WooCommerce-optimized hosting with Redis, CDN, and backups included",
      "starting with one store before upgrading to multi-store WPX ecommerce tiers",
    ],
    pricingPoints: [
      "Powerstore is listed at $34.99 per month on the monthly view.",
      "The yearly prepaid rate is shown as $29.16 per month with two months free included.",
      "The lowest visible public rate in the supplied Powerstore pricing ladder is $23.33 per month when prepaid for five years.",
      "Longer billing commitments reduce the effective monthly rate.",
    ],
    featureGroups: [
      {
        heading: "Core Features",
        items: [
          "1 Website",
          "20 GB Storage",
          "Unlimited Visitors",
          "400 GB Bandwidth",
          "Optimized for WooCommerce",
        ],
      },
      {
        heading: "Performance",
        items: [
          "8 GB RAM",
          "2 CPU Cores",
          "10 PHP Workers",
          "Custom high-speed global CDN",
          "Redis Cache",
        ],
      },
      {
        heading: "Security",
        items: [
          "Free SSL Certificates",
          "Daily Backups",
          "Malware scans and removal",
          "AI-Powered Email Protection",
        ],
      },
      {
        heading: "Managed Features",
        items: [
          "Site and Email Migrations",
          "Business Email + Webmail",
          "Unlimited Mail Boxes",
          "Temp URL",
          "Fixed For You Guarantee",
          "24/7 Technical Support",
        ],
      },
    ],
    pros: [
      "Powerstore is directly positioned for one high-performance WooCommerce store.",
      "The supplied feature set includes Redis Cache, CDN, backups, SSL, and malware cleanup.",
      "Public multi-term pricing makes the entry WooCommerce tier easier to compare.",
    ],
    cons: [
      "The best advertised rate depends on long-term prepayment.",
      "Powerstore covers only 1 website and 20 GB storage.",
      "Larger portfolios or heavier stores may need Superstore or Hyperstore.",
    ],
    buyerConsiderations: [
      "Powerstore is best for one-store use rather than multi-store operations.",
      "The monthly price is higher than the deepest prepaid rate.",
      "Compare PHP workers and storage carefully if the catalog or traffic is expected to grow quickly.",
    ],
    bodyFacts: [
      "Powerstore is described for one high-performance store.",
      "The supplied plan includes 8 GB RAM, 2 CPU cores, 10 PHP workers, and Redis Cache.",
      "Business Email + Webmail and site and email migrations are explicitly listed.",
    ],
  }),
  makeSpec({
    title: "WPX WooCommerce Hosting Superstore",
    price: "49.99",
    productType: "E-commerce Hosting",
    productCategoryLabel: "Managed WooCommerce Hosting",
    categoryHints: [
      "Cloud Services",
      "E-commerce Hosting",
      "WooCommerce Hosting",
      "Managed WooCommerce Hosting",
    ],
    filters: {
      hosting_type: ["Managed WordPress"],
      pricing_model: ["Subscription"],
      price_band: [buildPriceBand("49.99")],
      billing_cycle: ["Monthly", "Annual"],
      performance_tier: ["Premium"],
      support_coverage: ["24/7 support"],
      target_segment: ["Small business", "Agencies"],
    },
    seoTitle: "WPX WooCommerce Hosting Superstore WPX Managed WooCommerce Hosting",
    seoDescription:
      "WPX WooCommerce Hosting Superstore covers multi-store WooCommerce hosting with more RAM, storage, bandwidth, and managed support.",
    audience:
      "growing merchants and agencies that need more than a single-store WooCommerce plan while staying in a managed WPX environment",
    introTheme:
      "the middle WPX WooCommerce plan from the supplied Superstore data, where broader store capacity and stronger resource levels support growth beyond an entry storefront",
    planPositioning:
      "Superstore is positioned for growing ecommerce portfolios and sits between the one-store Powerstore tier and the higher-end Hyperstore tier.",
    useCases: [
      "running multiple WooCommerce stores or storefront brands on one WPX plan",
      "scaling beyond entry ecommerce hosting while keeping managed support and security features",
      "supporting higher traffic or broader catalogs with more RAM, storage, and worker capacity",
    ],
    pricingPoints: [
      "Superstore is listed at $74.99 per month on the monthly view.",
      "The yearly prepaid rate is shown as $62.49 per month with two months free included.",
      "The lowest visible public rate in the supplied Superstore pricing ladder is $49.99 per month when prepaid for five years.",
      "The family uses lower effective monthly rates on longer prepaid terms.",
    ],
    featureGroups: [
      {
        heading: "Core Features",
        items: [
          "Up to 3 Websites",
          "50 GB Storage",
          "Unlimited Visitors",
          "Unlimited Bandwidth",
          "Optimized for WooCommerce",
        ],
      },
      {
        heading: "Performance",
        items: [
          "36 GB RAM",
          "3 CPU Cores",
          "40 PHP Workers",
          "Custom high-speed global CDN",
          "Redis Cache",
        ],
      },
      {
        heading: "Security",
        items: [
          "Free SSL Certificates",
          "Daily Backups",
          "Malware scans and removal",
          "AI-Powered Email Protection",
        ],
      },
      {
        heading: "Managed Features",
        items: [
          "Site and Email Migrations",
          "Business Email + Webmail",
          "Unlimited Mail Boxes",
          "Temp URL",
          "Fixed For You Guarantee",
          "24/7 Technical Support",
        ],
      },
    ],
    pros: [
      "Superstore increases store count, storage, bandwidth, RAM, CPU, and PHP workers over Powerstore.",
      "Unlimited bandwidth is explicit in the supplied Superstore plan.",
      "The plan retains WPX ecommerce management, security, and support features.",
    ],
    cons: [
      "The best advertised rate still depends on long-term prepayment.",
      "Superstore costs materially more than Powerstore.",
      "Larger or peak-demand stores may still need Hyperstore.",
    ],
    buyerConsiderations: [
      "Superstore is a better fit than Powerstore when more than one store or more resource headroom is needed.",
      "The price difference is meaningful, so it should be compared against real store growth needs.",
      "Hyperstore remains the stronger choice for peak ecommerce performance requirements.",
    ],
    bodyFacts: [
      "Superstore is described for growing ecommerce portfolios.",
      "The supplied plan includes 36 GB RAM, 3 CPU cores, 40 PHP workers, and unlimited bandwidth.",
      "It supports up to 3 websites with WooCommerce optimization.",
    ],
  }),
  makeSpec({
    title: "WPX WooCommerce Hosting Hyperstore",
    price: "99.99",
    productType: "E-commerce Hosting",
    productCategoryLabel: "Managed WooCommerce Hosting",
    categoryHints: [
      "Cloud Services",
      "E-commerce Hosting",
      "WooCommerce Hosting",
      "Managed WooCommerce Hosting",
    ],
    filters: {
      hosting_type: ["Managed WordPress"],
      pricing_model: ["Subscription"],
      price_band: [buildPriceBand("99.99")],
      billing_cycle: ["Monthly", "Annual"],
      performance_tier: ["Enterprise"],
      support_coverage: ["24/7 support"],
      target_segment: ["Agencies", "Mid-market"],
    },
    seoTitle: "WPX WooCommerce Hosting Hyperstore WPX Managed WooCommerce Hosting",
    seoDescription:
      "WPX WooCommerce Hosting Hyperstore summarizes high-capacity WPX ecommerce hosting with larger resources, Redis, and managed support.",
    audience:
      "high-growth merchants and agencies that need the strongest supplied WPX WooCommerce resource profile for heavier store workloads",
    introTheme:
      "the highest WooCommerce-focused WPX plan from the supplied Hyperstore data, where stronger performance ceilings and multi-store growth matter more than entry affordability",
    planPositioning:
      "Hyperstore is the highest supplied WooCommerce tier and is positioned for peak ecommerce performance in the WPX product family.",
    useCases: [
      "supporting high-traffic WooCommerce stores with more resource headroom",
      "running multiple larger storefronts under one managed WPX ecommerce tier",
      "moving into the strongest supplied WPX WooCommerce plan for growth-oriented operations",
    ],
    pricingPoints: [
      "Hyperstore is listed at $149.99 per month on the monthly view.",
      "The yearly prepaid rate is shown as $124.99 per month with two months free included.",
      "The lowest visible public rate in the supplied Hyperstore pricing ladder is $99.99 per month when prepaid for five years.",
      "Longer prepaid terms reduce the effective monthly price but increase upfront commitment.",
    ],
    featureGroups: [
      {
        heading: "Core Features",
        items: [
          "Up to 5 Websites",
          "100 GB Storage",
          "Unlimited Visitors",
          "Unlimited Bandwidth",
          "Optimized for WooCommerce",
        ],
      },
      {
        heading: "Performance",
        items: [
          "80 GB RAM",
          "4 CPU Cores",
          "80 PHP Workers",
          "Custom high-speed global CDN",
          "Redis Cache",
        ],
      },
      {
        heading: "Security",
        items: [
          "Free SSL Certificates",
          "Daily Backups",
          "Malware scans and removal",
          "AI-Powered Email Protection",
        ],
      },
      {
        heading: "Managed Features",
        items: [
          "Site and Email Migrations",
          "Business Email + Webmail",
          "Unlimited Mail Boxes",
          "Temp URL",
          "Fixed For You Guarantee",
          "24/7 Technical Support",
        ],
      },
    ],
    pros: [
      "Hyperstore is the strongest supplied WooCommerce plan for RAM, CPU, PHP workers, and storage.",
      "The plan includes Redis Cache, CDN, backups, migrations, and 24/7 support.",
      "Unlimited bandwidth and broader site capacity support more demanding ecommerce workloads.",
    ],
    cons: [
      "Hyperstore pricing is much higher than Powerstore and Superstore.",
      "The best advertised rate depends on long-term prepayment.",
      "The plan may be oversized for smaller stores that do not need enterprise-style resource ceilings.",
    ],
    buyerConsiderations: [
      "Hyperstore makes the most sense when concurrency, catalog size, or multi-store growth justify the larger spend.",
      "It should be compared against Superstore based on actual resource pressure rather than only on feature breadth.",
      "The billing-term discount changes the effective monthly rate substantially.",
    ],
    bodyFacts: [
      "Hyperstore is described for peak ecommerce performance.",
      "The supplied plan includes 80 GB RAM, 4 CPU cores, 80 PHP workers, and 100 GB storage.",
      "It is the highest supplied WooCommerce tier in the provided WPX plan set.",
    ],
  }),
];

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

const fetchProductStateById = async (
  productId: number
): Promise<CurrentProductState | null> => {
  try {
    const [productResponse, metafieldsResponse] = await Promise.all([
      shopifyRest.get(`/products/${productId}.json`),
      shopifyRest.get(`/products/${productId}/metafields.json`, {
        params: { limit: 250 },
      }),
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
  const normalizedHandle = slugify(spec.title);
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
    const handle = slugify(state.product.handle || state.product.title);
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
    (candidate) => slugify(candidate.handle ?? "") === normalizedHandle
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

const buildPlansPricing = (spec: ProductSpec) =>
  buildPlainTextSection("Pricing", spec.pricingPoints);

const buildProductFeatures = (spec: ProductSpec) =>
  spec.featureGroups
    .map((group) => buildPlainTextSection(group.heading, group.items))
    .filter(Boolean)
    .join(`${MULTILINE_SEPARATOR}${MULTILINE_SEPARATOR}`);

const buildProsCons = (spec: ProductSpec) =>
  [buildPlainTextSection("Pros", spec.pros), buildPlainTextSection("Cons", spec.cons)]
    .filter(Boolean)
    .join(`${MULTILINE_SEPARATOR}${MULTILINE_SEPARATOR}`);

const buildBodyHtml = (spec: ProductSpec) => {
  const html = [
    `<h2>${escapeHtml(spec.title)}</h2>`,
    `<p>${escapeHtml(
      `${spec.title} is ${spec.introTheme}. This overview is written to help buyers understand how the plan is positioned, what it includes, and where it makes the most sense in a real hosting decision.`
    )}</p>`,
    `<p>${escapeHtml(
      `This plan is best suited to ${spec.audience}. It gives a clearer picture of how the service fits into the wider WPX lineup, with attention to the things buyers usually compare first: resources, included features, pricing structure, and room to grow.`
    )}</p>`,
    "<h3>What This Product Covers</h3>",
    `<p>${escapeHtml(
      spec.planPositioning
    )}</p>`,
    `<p>${escapeHtml(
      `What makes this plan easier to evaluate is that the core details are concrete. Pricing is laid out across multiple billing terms, the main resource limits are clear, and the feature set is easy to understand. That makes it possible to describe the service in a straightforward way without relying on empty marketing language.`
    )}</p>`,
    "<h3>Practical Use Cases</h3>",
    htmlList(spec.useCases),
    "<h3>Features And Service Details</h3>",
    `<p>${escapeHtml(
      `For most hosting buyers, the real differences come down to site count, storage, bandwidth, RAM, CPU, PHP workers, and the quality of the managed extras around the service. Features like migrations, backups, caching, email tools, and day-to-day support often matter just as much as the headline price, especially once a site begins to grow.`
    )}</p>`,
    ...spec.featureGroups.map((group) => `<h3>${escapeHtml(group.heading)}</h3>${htmlList(group.items)}`),
    "<h3>Pricing And Billing Notes</h3>",
    `<p>${escapeHtml(
      `The displayed starting price reflects the lowest publicly visible non-zero rate that fits this plan. At the same time, the billing notes remain important because yearly terms, longer prepaid commitments, and higher tiers can change the real cost in a meaningful way.`
    )}</p>`,
    htmlList(spec.pricingPoints),
    "<h3>Buyer Considerations</h3>",
    `<p>${escapeHtml(
      `A good hosting choice is not only about choosing the lowest number on the page. The plans in this range differ in storage, worker capacity, website allowance, and the level of performance they are designed to support. Some of the strongest advertised rates also depend on longer prepaid terms, so it helps to weigh both the resource fit and the billing commitment before deciding.`
    )}</p>`,
    htmlList(spec.buyerConsiderations),
    "<h3>Key Facts</h3>",
    htmlList(spec.bodyFacts),
    `<p>${escapeHtml(
      `Overall, ${spec.title} is best understood as a clear overview of the WPX plan details for ${spec.productCategoryLabel}. It brings together the most important points a buyer would want to review before choosing a plan, while still leaving room to confirm the latest checkout and billing terms directly with WPX.`
    )}</p>`,
  ].join("");

  if (getWordCount(html) < 300) {
    throw new Error(`Body HTML for ${spec.title} did not reach 300 words`);
  }

  return html;
};

const buildNormalizedTypeMultiple = (
  existingValues: string[],
  hints: string[],
  allowedValues: Set<string>
) => {
  const hintSet = new Set(hints);
  return dedupe([...existingValues.filter((value) => hintSet.has(value)), ...hints])
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => allowedValues.has(item));
};

const upsertShopifyProduct = async (
  spec: ProductSpec,
  currentState: CurrentProductState | null,
  bodyHtml: string
) => {
  const handle = normalizeText(currentState?.product?.handle) || slugify(spec.title);
  const existingVariant = currentState?.product?.variants?.[0] ?? null;
  const payload = {
    product: {
      ...(currentState?.product?.id ? { id: currentState.product.id } : {}),
      title: spec.title,
      handle,
      vendor: spec.vendor,
      body_html: bodyHtml,
      status: "active",
      published: true,
      product_type: spec.productType,
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
      value: WPX_LOGO_URL,
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
  const jsonPath = path.join(EXPORTS_DIR, `wpx-update-summary-${timestamp}.json`);
  const csvPath = path.join(EXPORTS_DIR, `wpx-update-summary-${timestamp}.csv`);

  const counts = {
    totalSectionBProductsReceived: TARGET_SPECS.length,
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

const buildAssumptionNotes = (spec: ProductSpec) => {
  const notes = [
    "The affiliate URL https://wpx.net/?affid=12462 was used for WPX redirection links because the task explicitly requested the affiliate-based destination.",
    "The custom.plans_pricing, custom.product_features, and custom.pros_cons metafields are now written as plain multiline text without HTML tags because those metafields do not support HTML formatting.",
  ];

  if (spec.title === "WPX Hosting (with WooCommerce)") {
    notes.push(
      "The generic WooCommerce title was treated as a family-level WPX ecommerce listing anchored to the supplied Powerstore, Superstore, and Hyperstore data instead of pretending it is one exact named plan."
    );
  }

  if (spec.title.includes("Starter") || spec.title.includes("Business") || spec.title.includes("Professional")) {
    notes.push(
      "WordPress plan products were mapped to Cloud Services > WordPress Hosting with Managed WordPress Hosting as the strongest final category."
    );
  }

  if (spec.title.includes("Agency Hosting")) {
    notes.push(
      "Agency plan products were mapped to Cloud Services > Managed Hosting with Managed WordPress Hosting as the strongest final category."
    );
  }

  if (spec.title.includes("WooCommerce") || spec.title.includes("(with WooCommerce)")) {
    notes.push(
      "WooCommerce plan products were mapped to Cloud Services > E-commerce Hosting with WooCommerce Hosting and Managed WooCommerce Hosting as the strongest category hints."
    );
  }

  return notes;
};

const main = async () => {
  const allowedTypeValues = await buildAllowedTypeValues();
  const filterDefinitions = await buildCloudFilterDefinitions();
  const filterKeys = dedupe(
    TARGET_SPECS.flatMap((spec) =>
      Object.keys(validateFilterValues(spec, filterDefinitions))
    )
  );
  const marketplaceFilterReferences = await buildMarketplaceFilterReferenceMap(filterKeys);

  const rows: SummaryRow[] = [];
  const processedProductIds = new Set<number>();
  const processedHandles = new Set<string>();
  const processedTitleUrls = new Set<string>();

  for (const spec of TARGET_SPECS) {
    const assumptionNotes = buildAssumptionNotes(spec);

    try {
      if (!normalizeText(spec.title)) {
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
          assumptionNotes,
          error: "Title missing.",
        });
        continue;
      }

      if (!normalizeText(spec.vendor) || !normalizeText(spec.officialUrl)) {
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
          assumptionNotes,
          error: "Vendor or official URL missing.",
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
          assumptionNotes,
          error: 'Price unavailable. Expected public price or the text `To visit product official website click "Get Now"`.',
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
          assumptionNotes,
          error: "Duplicate row skipped for current job safety.",
        });
        continue;
      }

      const currentState = matchResult.state;
      const bodyHtml = buildBodyHtml(spec);
      const normalizedTypeMultiple = buildNormalizedTypeMultiple(
        currentState?.typeMultiple ?? [],
        spec.categoryHints,
        allowedTypeValues
      );
      const filters = validateFilterValues(spec, filterDefinitions);
      const upsertResult = await upsertShopifyProduct(spec, currentState, bodyHtml);

      await setProductMetafields(
        upsertResult.productId,
        spec,
        normalizedTypeMultiple,
        filters,
        marketplaceFilterReferences
      );

      processedProductIds.add(upsertResult.productId);
      processedHandles.add(
        slugify(currentState?.product?.handle || currentState?.product?.title || spec.title)
      );
      processedTitleUrls.add(
        `${normalizeComparisonText(
          currentState?.product?.title || spec.title
        )}||${normalizeUrlForCompare(spec.officialUrl)}`
      );

      const finalStatus =
        upsertResult.action === "created_missing_product"
          ? "created_missing_product"
          : JSON.stringify(normalizedTypeMultiple) !== JSON.stringify(currentState?.typeMultiple ?? [])
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
        assumptionNotes,
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
        assumptionNotes,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const { jsonPath, csvPath, counts } = await writeSummaryFiles(rows);

  console.log("Changed files:");
  console.log("- backend/src/scripts/updateWpxHostingProducts.ts");
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
  console.error("WPX product update failed:", error);
  process.exitCode = 1;
});
