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
const LIQUID_WEB_LOGO_URL =
  "https://cdn.shopify.com/s/files/1/0770/5192/0623/files/liquid-web-logo.png";

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

type ProductSpec = {
  title: string;
  preferredProductId?: number;
  vendor: "Liquid Web" | "Nexcess";
  officialUrl: string;
  price: string;
  bodyCategory: string;
  productType: string;
  categoryHints: string[];
  filters: Record<string, string[]>;
  seoTitle: string;
  seoDescription: string;
  audience: string;
  introTheme: string;
  useCases: string[];
  pricingNotes: string[];
  featureGroups: Array<{
    heading: string;
    items: string[];
  }>;
  factualPros: string[];
  factualCons: string[];
  buyerConsiderations: string[];
  bodyFacts: string[];
  productCategoryLabel: string;
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

const SPECS: ProductSpec[] = [
  {
    title: "Liquid Web Business Managed Hosting",
    preferredProductId: 9096862630127,
    vendor: "Liquid Web",
    officialUrl: "https://www.liquidweb.com/wordpress-hosting/",
    price: "4.00",
    bodyCategory: "managed WordPress hosting",
    productType: "Managed Hosting",
    categoryHints: [
      "Cloud Services",
      "Managed Hosting",
      "Fully Managed Servers",
      "Managed WordPress Hosting",
    ],
    filters: {
      hosting_type: ["Managed WordPress"],
      pricing_model: ["Subscription"],
      price_band: ["Under $10/month"],
      billing_cycle: ["Monthly", "Annual"],
      performance_tier: ["Standard"],
      target_segment: ["Small business", "Individuals"],
    },
    seoTitle:
      "Liquid Web Business Managed Hosting Liquid Web Managed WordPress Hosting",
    seoDescription:
      "Liquid Web Business Managed Hosting covers managed WordPress plans with backups, migration options, and public entry pricing for smaller sites.",
    audience:
      "small businesses, solo operators, consultants, and early-stage site owners that want managed hosting without moving straight to a large custom environment",
    introTheme:
      "a customer-facing managed hosting listing built around Liquid Web's lower-entry managed WordPress and WooCommerce plan family, where the supplied plan data emphasizes entry pricing, backups, migration paths, and room for one or a few production sites",
    useCases: [
      "launching a business website that needs daily backups and simple migration support",
      "running a small content site or brochure site on a managed environment",
      "starting a WooCommerce or WordPress project with published resource limits and term options",
    ],
    pricingNotes: [
      "Spark Launch is listed at $6 per month on the standard monthly view.",
      "The same entry family shows $5 per month billed upfront for one year, $4.50 per month for two years, and $4 per month for three years.",
      "The Shopify product price uses the lowest visible paid price from the supplied family data.",
    ],
    featureGroups: [
      {
        heading: "Core Features",
        items: [
          "Supports 1 site on the entry Spark family",
          "15 GB storage",
          "2 TB bandwidth",
          "10 PHP workers per site",
          "Unlimited visits",
          "Daily backups with 7-day or 30-day retention depending on plan",
        ],
      },
      {
        heading: "Managed Features",
        items: [
          "Self-serve migration on lower plans",
          "Assisted migration on Elevate plans",
          "Visual comparison and Stencils on higher plans",
          "Cloudflare Enterprise",
          "DDoS protection",
          "Web application firewall",
        ],
      },
    ],
    factualPros: [
      "Public pricing is visible across multiple billing terms.",
      "The supplied family includes backups, migration options, and WordPress-oriented management features.",
      "Higher tiers in the same family add security and storefront-oriented tools without changing vendors.",
    ],
    factualCons: [
      "The lowest price depends on annual or multi-year prepayment.",
      "Backup retention and migration level vary by plan.",
      "Some security and comparison tools only appear on higher plans.",
    ],
    buyerConsiderations: [
      "Compare backup retention and migration scope before selecting a plan.",
      "Entry pricing is lower on prepaid terms than on the base monthly view.",
      "Advanced storefront or staging features sit higher in the family.",
    ],
    bodyFacts: [
      "Spark Launch starts at $6 monthly, or as low as $4 monthly on the three-year upfront term in the supplied data.",
      "The lower family covers one site with 15 GB storage and 2 TB bandwidth.",
      "Higher variants add Cloudflare Enterprise, DDoS protection, a web application firewall, and staging support.",
    ],
    productCategoryLabel: "Managed WordPress Hosting",
  },
  {
    title: "Liquid Web Enterprise Managed Hosting",
    preferredProductId: 9096862728431,
    vendor: "Liquid Web",
    officialUrl: "https://www.liquidweb.com/wordpress-hosting/",
    price: "204.50",
    bodyCategory: "enterprise managed hosting",
    productType: "Managed Hosting",
    categoryHints: [
      "Cloud Services",
      "Managed Hosting",
      "Fully Managed Servers",
      "Managed WordPress Hosting",
    ],
    filters: {
      hosting_type: ["Managed WordPress"],
      pricing_model: ["Subscription"],
      price_band: ["$201-$500/month"],
      billing_cycle: ["Monthly", "Annual"],
      performance_tier: ["Enterprise"],
      target_segment: ["Enterprise", "Mid-market", "Agencies"],
    },
    seoTitle:
      "Liquid Web Enterprise Managed Hosting Liquid Web Enterprise Hosting",
    seoDescription:
      "Liquid Web Enterprise Managed Hosting summarizes high-capacity managed hosting with 250-site scale, autoscaled workers, and prepaid term pricing.",
    audience:
      "larger agencies, multi-brand operators, and enterprise teams managing broad WordPress or WooCommerce portfolios with higher concurrency and storage demands",
    introTheme:
      "an enterprise-scale managed hosting listing aligned to the supplied Enterprise family, where the plan data focuses on very high site counts, large storage allocations, significant PHP worker capacity, and higher prepaid contract pricing",
    useCases: [
      "running large multi-site WordPress estates",
      "supporting heavy WooCommerce or content operations that need broad storage and worker headroom",
      "standardizing large managed hosting estates under one provider family",
    ],
    pricingNotes: [
      "Enterprise Launch is listed at $306.75 per month in the monthly-style price line.",
      "The same family shows $255.63 per month billed upfront for one year, $230.06 for two years, and $204.50 for three years.",
      "Enterprise Thrive and Enterprise Elevate raise pricing further for stronger support and autoscaled worker capacity.",
    ],
    featureGroups: [
      {
        heading: "Core Features",
        items: [
          "Can handle up to 250 sites",
          "800 GB storage",
          "10 TB bandwidth",
          "60 PHP workers per site",
          "70 autoscaled PHP workers per site on Enterprise Elevate",
          "Unlimited visits",
        ],
      },
      {
        heading: "Managed Features",
        items: [
          "Daily backups with 7-day or 30-day retention depending on plan",
          "Self-serve migration on Launch and Thrive",
          "Assisted migration on Elevate",
          "Cloudflare Enterprise",
          "DDoS protection",
          "Web application firewall",
          "Free staging site on Elevate",
        ],
      },
    ],
    factualPros: [
      "The supplied Enterprise family publishes storage, bandwidth, and worker levels clearly.",
      "Higher tiers add assisted migration and stronger operational tooling.",
      "The lineup is designed for very large site counts compared with starter managed hosting plans.",
    ],
    factualCons: [
      "Pricing rises substantially as features and commitments increase.",
      "The best advertised price depends on long-term prepayment.",
      "Autoscaled worker headroom is reserved for the Elevate tier.",
    ],
    buyerConsiderations: [
      "Verify which migration level and backup retention window your team needs.",
      "The entry Enterprise plan does not automatically include every higher-tier feature.",
      "The three-year prepaid rate is materially lower than the headline monthly figure.",
    ],
    bodyFacts: [
      "Enterprise Launch reaches 250 sites with 800 GB storage and 10 TB bandwidth.",
      "Enterprise Elevate expands to 70 autoscaled PHP workers per site and adds assisted migration and free staging.",
      "The supplied price ladder covers monthly-style and prepaid annual, two-year, and three-year commitments.",
    ],
    productCategoryLabel: "Managed WordPress Hosting",
  },
  {
    title: "Liquid Web Pro Managed Hosting",
    preferredProductId: 9096862826735,
    vendor: "Liquid Web",
    officialUrl: "https://www.liquidweb.com/wordpress-hosting/",
    price: "30.67",
    bodyCategory: "mid-to-high managed hosting",
    productType: "Managed Hosting",
    categoryHints: [
      "Cloud Services",
      "Managed Hosting",
      "Fully Managed Servers",
      "Managed WordPress Hosting",
    ],
    filters: {
      hosting_type: ["Managed WordPress"],
      pricing_model: ["Subscription"],
      price_band: ["$10-$50/month"],
      billing_cycle: ["Monthly", "Annual"],
      performance_tier: ["Premium"],
      target_segment: ["Small business", "Agencies", "Mid-market"],
    },
    seoTitle: "Liquid Web Pro Managed Hosting Liquid Web Premium Hosting",
    seoDescription:
      "Liquid Web Pro Managed Hosting highlights higher-capacity managed hosting with stronger site limits, security features, and term-based pricing.",
    audience:
      "growing agencies, professional site owners, and operators who need more room than entry managed hosting but are not yet sizing for the largest enterprise family",
    introTheme:
      "a professionally positioned managed hosting listing centered on the stronger middle of the supplied Liquid Web plan families, where larger site counts, bigger storage pools, and more PHP workers matter more than entry pricing alone",
    useCases: [
      "running multiple production sites with broader worker and storage headroom",
      "supporting premium WordPress or WooCommerce workloads that need stronger security and staging options",
      "moving from starter managed hosting into a more operations-oriented plan family",
    ],
    pricingNotes: [
      "Builder Launch is listed at $46 per month, with lower prepaid rates down to $30.67 for a three-year term.",
      "Producer Launch starts at $92 per month and scales the same family upward for more sites and storage.",
      "The Shopify price uses the lowest visible paid amount from the supplied pro-oriented family data.",
    ],
    featureGroups: [
      {
        heading: "Core Features",
        items: [
          "Builder Launch can handle up to 25 sites",
          "100 GB storage",
          "5 TB bandwidth",
          "30 PHP workers per site",
          "Producer Launch can handle up to 50 sites",
          "300 GB storage in the Producer family",
        ],
      },
      {
        heading: "Managed Features",
        items: [
          "Daily backups",
          "Self-serve migration on Launch and Thrive",
          "Assisted migration on Elevate",
          "Visual comparison",
          "Stencils",
          "Cloudflare Enterprise",
          "DDoS protection",
          "Web application firewall",
          "Free staging site on Elevate",
        ],
      },
    ],
    factualPros: [
      "The supplied pro-tier families publish larger site counts and worker limits than entry plans.",
      "Security and optimization features are visible on Thrive and Elevate tiers.",
      "There is a clear upgrade path from Builder to Producer without changing the provider family.",
    ],
    factualCons: [
      "The lowest visible price still depends on long prepaid terms.",
      "Advanced features are tier-dependent rather than universal.",
      "Monthly-style pricing is materially higher than the deepest prepaid figure.",
    ],
    buyerConsiderations: [
      "Choose between Builder and Producer based on site count and storage needs.",
      "Confirm whether you need Launch, Thrive, or Elevate features before comparing only headline price.",
      "Autoscaled workers and free staging are not present on every tier.",
    ],
    bodyFacts: [
      "Builder Launch starts at $46 monthly-style or $30.67 on the three-year prepaid term.",
      "Producer Launch expands the family to 50 sites and 300 GB storage.",
      "Thrive and Elevate tiers add security, workflow, and migration upgrades beyond Launch.",
    ],
    productCategoryLabel: "Managed WordPress Hosting",
  },
  {
    title: "Liquid Web eCommerce Managed Hosting",
    preferredProductId: 9102081949935,
    vendor: "Liquid Web",
    officialUrl: "https://www.liquidweb.com/wordpress-hosting/",
    price: "4.00",
    bodyCategory: "managed ecommerce hosting",
    productType: "Managed Hosting",
    categoryHints: [
      "Cloud Services",
      "Managed Hosting",
      "Managed WooCommerce Hosting",
      "WooCommerce Hosting",
    ],
    filters: {
      hosting_type: ["Managed WordPress"],
      pricing_model: ["Subscription"],
      price_band: ["Under $10/month"],
      billing_cycle: ["Monthly", "Annual"],
      performance_tier: ["Premium"],
      target_segment: ["Small business", "Agencies", "Mid-market"],
    },
    seoTitle:
      "Liquid Web eCommerce Managed Hosting Liquid Web WooCommerce Hosting",
    seoDescription:
      "Liquid Web eCommerce Managed Hosting summarizes WooCommerce-ready managed hosting with backups, security tooling, and prepaid entry pricing.",
    audience:
      "store owners and agencies that want a managed WordPress-based commerce environment with clearer pricing, operational tooling, and a structured path from starter to higher tiers",
    introTheme:
      "an ecommerce-focused managed hosting listing built from the supplied WordPress and WooCommerce plan family, where store-friendly security, backups, migrations, and scaling options matter alongside site counts and PHP worker limits",
    useCases: [
      "launching a WooCommerce store on managed infrastructure",
      "running product catalogs that need backups, WAF coverage, and migration options",
      "scaling from one store into multi-store operations without leaving the same hosting family",
    ],
    pricingNotes: [
      "Spark Launch is listed at $6 per month on the standard monthly view, with prepaid rates down to $4 per month for three years.",
      "Higher WooCommerce-friendly tiers scale to more sites, storage, bandwidth, and autoscaled PHP workers.",
      "Cloudflare Enterprise, DDoS protection, and web application firewall coverage appear in the higher supplied tiers.",
    ],
    featureGroups: [
      {
        heading: "Core Features",
        items: [
          "Entry Spark family supports 1 site with 15 GB storage and 2 TB bandwidth",
          "Spark+ supports 3 sites with 25 GB storage and 2.5 TB bandwidth",
          "Maker supports 5 sites with 40 GB storage and 3 TB bandwidth",
          "Unlimited visits",
          "10 to 20 PHP workers per site depending on family",
        ],
      },
      {
        heading: "Managed Features",
        items: [
          "Daily backups",
          "Self-serve migration or assisted migration depending on plan",
          "Visual comparison",
          "Stencils",
          "Cloudflare Enterprise",
          "DDoS protection",
          "Web application firewall",
          "Free staging site on Elevate plans",
        ],
      },
    ],
    factualPros: [
      "The supplied WooCommerce-friendly family includes security and migration options relevant to stores.",
      "There are multiple public term prices for budget and growth comparisons.",
      "Higher tiers add more worker headroom and staging support for active stores.",
    ],
    factualCons: [
      "Best advertised pricing depends on prepaid terms.",
      "Worker counts, retention windows, and migration level differ across plans.",
      "Store owners may need a higher tier sooner if concurrency or catalog size grows quickly.",
    ],
    buyerConsiderations: [
      "Use worker count and storage, not only headline price, when comparing WooCommerce-suitable tiers.",
      "Confirm whether you need Launch, Thrive, or Elevate support features.",
      "The lowest visible price is tied to a multi-year billing term.",
    ],
    bodyFacts: [
      "Spark, Spark+, and Maker provide a progression from one to five sites with higher storage and bandwidth.",
      "Elevate tiers add autoscaled PHP workers, assisted migration, and a free staging site.",
      "Security tooling such as Cloudflare Enterprise, DDoS protection, and WAF appears in the higher supplied plans.",
    ],
    productCategoryLabel: "Managed WooCommerce Hosting",
  },
  {
    title: "Liquid Web Nexcess Magento Plans",
    preferredProductId: 9102082474223,
    vendor: "Nexcess",
    officialUrl: "https://www.nexcess.net/magento/",
    price: "42.64",
    bodyCategory: "managed Magento hosting",
    productType: "E-commerce Hosting",
    categoryHints: [
      "Cloud Services",
      "Managed Hosting",
      "Managed Magento Hosting",
      "Magento Hosting",
    ],
    filters: {
      hosting_type: ["Cloud hosting"],
      pricing_model: ["Subscription"],
      price_band: ["$10-$50/month"],
      billing_cycle: ["Monthly"],
      performance_tier: ["Premium"],
      support_coverage: ["24/7 support"],
      target_segment: ["Small business", "Mid-market", "Agencies"],
      control_panel: ["Custom panel"],
    },
    seoTitle:
      "Liquid Web Nexcess Magento Plans Nexcess Managed Magento Hosting",
    seoDescription:
      "Liquid Web Nexcess Magento Plans cover managed Magento hosting with PHP worker scaling, Elasticsearch support, and renewal pricing details.",
    audience:
      "merchants and agencies that need a Magento-specific managed hosting line rather than a generic VPS or broad WordPress platform",
    introTheme:
      "a Magento-first managed hosting listing based directly on the supplied Nexcess plan ladder, where store counts, storage, bandwidth, autoscaled workers, and Magento support define the practical value of the service",
    useCases: [
      "running Magento or Adobe Commerce storefront workloads on a managed platform",
      "sizing a Magento environment around PHP workers, storage, and support expectations",
      "comparing introductory pricing versus later renewal cost before selecting a plan",
    ],
    pricingNotes: [
      "XS is listed at $42.64 per month for the first three months and then $74 per month.",
      "S is listed at $74.80 for the first three months and then $145 per month.",
      "M is listed at $123.76 for the first three months and then $247 per month.",
      "L is listed at $201.52 for the first three months and then $409 per month.",
    ],
    featureGroups: [
      {
        heading: "Core Features",
        items: [
          "Up to 11, 16, 21, or 31 sites depending on plan",
          "50 GB, 75 GB, 125 GB, or 400 GB storage depending on plan",
          "1000 GB, 2 TB, 3 TB, or 5 TB bandwidth depending on plan",
          "25 to 100 PHP workers per plan",
          "50 to 125 autoscaled PHP workers",
        ],
      },
      {
        heading: "Managed Features",
        items: [
          "Fully managed environment",
          "Elasticsearch for Magento 2.4+",
          "24/7/365 Magento support",
          "Disaster recovery assistance",
          "PCI compliance on XS, S, and M details",
          "Dedicated environments",
          "Cloudflare CDN",
          "Free SSL certificates on L",
        ],
      },
    ],
    factualPros: [
      "The plan ladder publishes both introductory and renewal pricing.",
      "Magento-specific support and Elasticsearch are clearly called out.",
      "Worker counts and storage allocations make plan comparison more concrete.",
    ],
    factualCons: [
      "Renewal pricing rises after the opening promotional period.",
      "Some features differ by plan, such as SSL references on L.",
      "This family is specialized for Magento rather than general hosting workloads.",
    ],
    buyerConsiderations: [
      "Review both introductory and renewal cost before selecting a plan.",
      "Pick a plan based on site count, storage, and PHP worker requirements.",
      "Magento-specific tooling is valuable, but it may be unnecessary for non-Magento stacks.",
    ],
    bodyFacts: [
      "The supplied lineup spans XS through L, with higher site, storage, and worker ceilings at each level.",
      "Renewal pricing is materially higher than the initial three-month promotional rate.",
      "Support, disaster recovery assistance, and Magento-oriented stack components are central to the product family.",
    ],
    productCategoryLabel: "Managed Magento Hosting",
  },
  {
    title: "Liquid Web Managed VPS 2 GB",
    preferredProductId: 9345704460527,
    vendor: "Liquid Web",
    officialUrl: "https://www.liquidweb.com/vps/vps-hosting/",
    price: "36",
    bodyCategory: "managed VPS hosting",
    productType: "VPS Hosting",
    categoryHints: [
      "Cloud Services",
      "VPS Hosting",
      "Managed VPS Hosting",
    ],
    filters: {
      hosting_type: ["VPS"],
      pricing_model: ["Subscription"],
      price_band: ["$10-$50/month"],
      billing_cycle: ["Monthly"],
      performance_tier: ["Premium"],
      target_segment: ["Small business", "Developers", "Mid-market"],
    },
    seoTitle: "Liquid Web Managed VPS 2 GB Liquid Web Managed VPS Hosting",
    seoDescription:
      "Liquid Web Managed VPS 2 GB summarizes managed VPS pricing and features including SSD storage, DDoS protection, and control panel availability.",
    audience:
      "buyers looking for a managed VPS foundation with published monthly pricing, server administration support, and room to choose Windows or common control panels",
    introTheme:
      "a managed VPS listing refreshed from the supplied Liquid Web managed VPS details, where the published entry configuration in the new source material starts at 4 GB RAM and focuses on managed administration, SSD storage, bandwidth, and protection",
    useCases: [
      "hosting business applications on a managed virtual server",
      "deploying Windows or Linux workloads with root access",
      "choosing a VPS with clear CPU, RAM, storage, and bandwidth allocations",
    ],
    pricingNotes: [
      "The supplied managed VPS family starts at $36 per month for the 4 GB RAM plan.",
      "Liquid Web also lists $50 for 8 GB RAM, $145 for 16 GB RAM, and $89 for 24 GB RAM in the supplied notes.",
      "The same pricing notes describe a 50 percent savings period for the first two months.",
    ],
    featureGroups: [
      {
        heading: "Core Features",
        items: [
          "2 vCPU on the 4 GB managed plan",
          "4 GB RAM",
          "80 GB SSD",
          "3 TB bandwidth",
          "10 GB network",
          "Dedicated IP address",
        ],
      },
      {
        heading: "Managed Features",
        items: [
          "Fully managed service",
          "Windows available",
          "InterWorx, cPanel, and Plesk available",
          "Fast provisioning",
          "Robust API",
          "Unmetered inbound traffic",
          "DDoS protection",
          "Root access",
        ],
      },
    ],
    factualPros: [
      "The supplied managed VPS data publishes CPU, RAM, SSD, and bandwidth clearly.",
      "Windows availability and multiple control panel options are explicit.",
      "The plan includes DDoS protection, root access, and a dedicated IP address.",
    ],
    factualCons: [
      "The refreshed source material starts at 4 GB RAM, not 2 GB RAM.",
      "Discount language applies to the first two months rather than a flat lifetime rate.",
      "Control panel choice may affect the final setup path.",
    ],
    buyerConsiderations: [
      "Confirm the current entry RAM tier because the supplied source material begins at 4 GB.",
      "Compare the 4 GB, 8 GB, 16 GB, and 24 GB managed tiers before purchase.",
      "Review the introductory discount period separately from the ongoing monthly price.",
    ],
    bodyFacts: [
      "The supplied managed VPS data begins with a 4 GB RAM plan at $36 per month.",
      "The family includes 2 to 6 vCPU and 80 GB to 540 GB SSD across the listed tiers.",
      "Managed service, DDoS protection, root access, and dedicated IPs remain central to the product family.",
    ],
    productCategoryLabel: "Managed VPS Hosting",
  },
  {
    title: "Liquid Web General Plesk VPS",
    preferredProductId: 9345704558831,
    vendor: "Liquid Web",
    officialUrl: "https://www.liquidweb.com/vps-hosting/plesk/",
    price: "36",
    bodyCategory: "Plesk-ready VPS hosting",
    productType: "VPS Hosting",
    categoryHints: [
      "Cloud Services",
      "VPS Hosting",
      "Plesk VPS",
    ],
    filters: {
      hosting_type: ["VPS"],
      pricing_model: ["Subscription"],
      price_band: ["$10-$50/month"],
      billing_cycle: ["Monthly"],
      performance_tier: ["Premium"],
      control_panel: ["Plesk"],
      target_segment: ["Small business", "Agencies", "Developers"],
    },
    seoTitle: "Liquid Web General Plesk VPS Liquid Web Plesk VPS Hosting",
    seoDescription:
      "Liquid Web General Plesk VPS highlights VPS pricing, SSD resources, and Plesk availability for teams that prefer panel-based server management.",
    audience:
      "developers, agencies, and administrators who want VPS resources with a panel-driven management workflow instead of a command-line-only approach",
    introTheme:
      "a Plesk-oriented VPS listing that uses the supplied Liquid Web VPS family data, where published specifications cover CPU, RAM, SSD, bandwidth, Windows support, and available control panels including Plesk",
    useCases: [
      "managing hosted websites through a graphical control panel",
      "running VPS-based web stacks that benefit from Plesk availability",
      "choosing a Liquid Web VPS with published bandwidth and SSD allocations",
    ],
    pricingNotes: [
      "The supplied managed VPS family starts at $36 per month on the 4 GB RAM plan.",
      "The same family notes that InterWorx, cPanel, and Plesk are available.",
      "The current supplied pricing notes also show a 50 percent savings period for the first two months.",
    ],
    featureGroups: [
      {
        heading: "Core Features",
        items: [
          "2 vCPU on the 4 GB plan",
          "4 GB RAM",
          "80 GB SSD",
          "3 TB bandwidth",
          "10 GB network",
          "Dedicated IP address",
        ],
      },
      {
        heading: "Managed Features",
        items: [
          "Fully managed service",
          "Plesk available",
          "InterWorx and cPanel also available",
          "Windows available",
          "Fast provisioning",
          "Robust API",
          "Unmetered inbound traffic",
          "DDoS protection",
          "Root access",
        ],
      },
    ],
    factualPros: [
      "The supplied data explicitly says Plesk is available.",
      "Published server specs make the entry tier easy to compare.",
      "The plan family includes Windows compatibility and management tooling.",
    ],
    factualCons: [
      "Plesk availability does not mean every plan buyer needs the same control panel path.",
      "The two-month discount period is temporary.",
      "Heavier workloads may need the larger RAM and storage tiers.",
    ],
    buyerConsiderations: [
      "Confirm whether Plesk is the best control panel choice for the intended stack.",
      "Use the published 8 GB, 16 GB, and 24 GB tiers if the 4 GB plan looks too tight.",
      "Review the introductory savings period separately from the long-run monthly cost.",
    ],
    bodyFacts: [
      "The supplied data says Plesk is available alongside InterWorx and cPanel.",
      "The entry managed VPS tier in the new source material is 4 GB RAM at $36 per month.",
      "Larger managed VPS tiers increase CPU, storage, and bandwidth headroom.",
    ],
    productCategoryLabel: "Plesk VPS",
  },
  {
    title: "Liquid Web General ASP.NET VPS",
    preferredProductId: 9345704624367,
    vendor: "Liquid Web",
    officialUrl: "https://www.liquidweb.com/vps-hosting/asp-net/",
    price: "36",
    bodyCategory: "Windows-capable VPS hosting",
    productType: "VPS Hosting",
    categoryHints: [
      "Cloud Services",
      "VPS Hosting",
      "Windows VPS",
    ],
    filters: {
      hosting_type: ["VPS"],
      pricing_model: ["Subscription"],
      price_band: ["$10-$50/month"],
      billing_cycle: ["Monthly"],
      performance_tier: ["Premium"],
      target_segment: ["Developers", "Small business", "Mid-market"],
    },
    seoTitle:
      "Liquid Web General ASP.NET VPS Liquid Web Windows VPS Hosting",
    seoDescription:
      "Liquid Web General ASP.NET VPS covers Windows-ready VPS details with SSD resources, root access, and managed service pricing from supplied plan data.",
    audience:
      "teams that want a Windows-capable VPS foundation for .NET-style workloads, internal applications, or web hosting tasks without giving up managed service coverage",
    introTheme:
      "a Windows-oriented VPS listing grounded in the supplied Liquid Web managed VPS details, where Windows availability, SSD storage, bandwidth, and root access are explicit in the published plan data",
    useCases: [
      "running Windows-based web applications on a managed VPS",
      "deploying application stacks that need root access and SSD-backed resources",
      "choosing a VPS with public pricing and clear CPU and RAM sizing",
    ],
    pricingNotes: [
      "The supplied managed VPS family starts at $36 per month for 4 GB RAM.",
      "8 GB, 16 GB, and 24 GB RAM tiers are also listed in the same supplied pricing notes.",
      "The discount note says buyers save 50 percent for the first two months.",
    ],
    featureGroups: [
      {
        heading: "Core Features",
        items: [
          "2 vCPU on the 4 GB plan",
          "4 GB RAM",
          "80 GB SSD",
          "3 TB bandwidth",
          "10 GB network",
          "Dedicated IP address",
        ],
      },
      {
        heading: "Managed Features",
        items: [
          "Fully managed service",
          "Windows available",
          "InterWorx, cPanel, and Plesk available",
          "Fast provisioning",
          "Robust API",
          "Unmetered inbound traffic",
          "DDoS protection",
          "Root access",
        ],
      },
    ],
    factualPros: [
      "Windows availability is explicitly included in the supplied VPS details.",
      "The source material publishes resource allocations and management features clearly.",
      "The product family includes DDoS protection, root access, and dedicated IP addressing.",
    ],
    factualCons: [
      "The refreshed details describe a general managed VPS family rather than an ASP.NET-only feature list.",
      "The best entry price is not a permanent lifetime rate because the introductory discount is temporary.",
      "Larger Windows workloads may require more than the entry configuration.",
    ],
    buyerConsiderations: [
      "Confirm the application stack and Windows requirements before selecting the entry tier.",
      "Compare the higher RAM tiers if the workload is production-heavy.",
      "Check control panel preference if the team wants Plesk or cPanel with Windows.",
    ],
    bodyFacts: [
      "Windows availability is explicit in the supplied Liquid Web managed VPS data.",
      "The current family spans 4 GB through 24 GB RAM with SSD storage and fixed bandwidth allocations.",
      "Managed service, API access, DDoS protection, and root access are consistent headline facts across the supplied family.",
    ],
    productCategoryLabel: "Windows VPS",
  },
  {
    title: "Liquid Web General WordPress VPS",
    preferredProductId: 9345705607407,
    vendor: "Liquid Web",
    officialUrl: "https://www.liquidweb.com/wordpress-hosting/vps-wordpress/",
    price: "36",
    bodyCategory: "WordPress-ready VPS hosting",
    productType: "WordPress Hosting",
    categoryHints: [
      "Cloud Services",
      "WordPress Hosting",
      "WordPress VPS",
    ],
    filters: {
      hosting_type: ["VPS", "Managed WordPress"],
      pricing_model: ["Subscription"],
      price_band: ["$10-$50/month"],
      billing_cycle: ["Monthly"],
      performance_tier: ["Premium"],
      target_segment: ["Developers", "Agencies", "Mid-market"],
    },
    seoTitle:
      "Liquid Web General WordPress VPS Liquid Web WordPress VPS Hosting",
    seoDescription:
      "Liquid Web General WordPress VPS summarizes VPS-based hosting with SSD resources, control panel options, and managed service pricing for WordPress-oriented deployments.",
    audience:
      "agencies, developers, and operators who prefer isolated VPS resources for WordPress-style deployments instead of a small shared plan",
    introTheme:
      "a WordPress-oriented VPS listing refreshed from the supplied Liquid Web VPS data, where the factual inputs now emphasize managed VPS resources, storage, bandwidth, root access, and available control panels rather than a separate WordPress-specific feature bundle",
    useCases: [
      "running WordPress on isolated VPS resources",
      "choosing a VPS plan with public pricing and room to scale beyond entry shared hosting",
      "using a panel-managed server for custom WordPress deployment paths",
    ],
    pricingNotes: [
      "The supplied managed VPS family starts at $36 per month on the 4 GB plan.",
      "Larger tiers are listed at $50, $145, and $89 per month in the supplied notes.",
      "The supplied pricing also highlights a 50 percent savings period for the first two months.",
    ],
    featureGroups: [
      {
        heading: "Core Features",
        items: [
          "2 vCPU on the 4 GB plan",
          "4 GB RAM",
          "80 GB SSD",
          "3 TB bandwidth",
          "10 GB network",
          "Dedicated IP address",
        ],
      },
      {
        heading: "Managed Features",
        items: [
          "Fully managed service",
          "InterWorx, cPanel, and Plesk available",
          "Windows available",
          "Fast provisioning",
          "Robust API",
          "Unmetered inbound traffic",
          "DDoS protection",
          "Root access",
        ],
      },
    ],
    factualPros: [
      "The supplied managed VPS family has explicit server specs and management features.",
      "Multiple control panel options make WordPress deployment workflows more flexible.",
      "The plan family includes root access, DDoS protection, and dedicated IP addressing.",
    ],
    factualCons: [
      "The refreshed source data is general VPS data rather than a WordPress-only feature sheet.",
      "The lowest visible price reflects the current supplied entry managed VPS tier, not a shared hosting plan.",
      "Smaller WordPress sites may not need VPS-level resource isolation.",
    ],
    buyerConsiderations: [
      "Compare the VPS footprint against simpler managed WordPress plans if the workload is small.",
      "Select a control panel and OS path that matches the WordPress management workflow.",
      "Use higher RAM tiers if the site portfolio or plugin load is heavier than the entry plan supports.",
    ],
    bodyFacts: [
      "The new supplied VPS family begins with a 4 GB RAM managed plan at $36 per month.",
      "The same family keeps SSD storage, bandwidth, DDoS protection, and panel availability front and center.",
      "Larger tiers expand memory, CPU, storage, and bandwidth for more demanding workloads.",
    ],
    productCategoryLabel: "WordPress VPS",
  },
  {
    title: "Liquid Web Acronis Cyber Backups 250GB Dedicated",
    preferredProductId: 9345708163311,
    vendor: "Liquid Web",
    officialUrl: "https://www.liquidweb.com/hosting-add-ons/acronis-cyber-backups/",
    price: "17",
    bodyCategory: "server backup service",
    productType: "Backup & Disaster Recovery",
    categoryHints: [
      "Cloud Services",
      "Backup & Disaster Recovery",
      "Automated Backup",
      "Server Backup",
    ],
    filters: {
      hosting_type: ["Cloud hosting"],
      pricing_model: ["Subscription"],
      price_band: ["$10-$50/month"],
      billing_cycle: ["Monthly"],
      performance_tier: ["Standard"],
      target_segment: ["Small business", "Mid-market", "Enterprise"],
      control_panel: ["Custom panel"],
    },
    seoTitle:
      "Liquid Web Acronis Cyber Backups 250GB Dedicated Liquid Web Server Backup",
    seoDescription:
      "Liquid Web Acronis Cyber Backups 250GB Dedicated provides off-server backup pricing, self-service management, and restore-focused protection.",
    audience:
      "teams that need off-server protection for hosted workloads and want a provider-backed backup service with clear monthly quota pricing",
    introTheme:
      "a backup-focused hosting add-on listing aligned directly to the supplied Acronis Cyber Backups details, where quota size, restore control, and off-server protection matter more than compute specifications",
    useCases: [
      "protecting dedicated or hosted server data with off-server backup storage",
      "adding recurring server backup coverage without building a separate backup stack",
      "using a self-service portal for backup setup and restore management",
    ],
    pricingNotes: [
      "The supplied dedicated hosting quota price is $17 per month for 250 GB.",
      "The same notes state that Acronis Cyber Backups start at $11 per month as a base price.",
      "Pricing varies by storage quota and hosting type.",
    ],
    featureGroups: [
      {
        heading: "Core Features",
        items: [
          "250 GB dedicated hosting quota in this listing",
          "Off-server backup storage",
          "Monthly pricing by quota",
          "Flexible storage tiers",
        ],
      },
      {
        heading: "Managed Features",
        items: [
          "Self-service backup portal",
          "Backup configuration management",
          "Restore management",
          "Acronis backup cloud option",
        ],
      },
    ],
    factualPros: [
      "The supplied data publishes both a base price and a 250 GB dedicated quota price.",
      "Off-server storage strengthens separation from the primary workload.",
      "Backup and restore management are explicitly part of the service description.",
    ],
    factualCons: [
      "Cost increases with larger backup quotas.",
      "This listing is for backup protection rather than compute resources.",
      "Teams still need to size quota against their protected data growth.",
    ],
    buyerConsiderations: [
      "Choose quota based on current and expected protected data volume.",
      "Review whether the hosted workload needs only backups or broader disaster recovery tooling.",
      "Budget for higher quotas if retention needs or data size expand.",
    ],
    bodyFacts: [
      "The supplied listing price is $17 per month for the 250 GB dedicated quota.",
      "Liquid Web also describes a lower base starting point of $11 per month in the supplied notes.",
      "The service is centered on off-server backup protection with self-service management and restore workflows.",
    ],
    productCategoryLabel: "Server Backup",
  },
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

const priceBand = (price: number) => {
  if (price === 0) {
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

type AdditionalWordPressPlanInput = {
  familyKey: string;
  familyTitle: string;
  tier: "Launch" | "Thrive" | "Elevate";
  monthlyPrice: string;
  yearlyPrice: string;
  twoYearPrice: string;
  threeYearPrice: string;
  sites: string;
  storage: string;
  bandwidth: string;
  phpWorkers: string;
  autoscaledWorkers?: string;
  retention: string;
  migration: string;
  extraFeatures: string[];
  targetSegment: string[];
  performanceTier: "Standard" | "Premium" | "Enterprise";
};

type AdditionalVpsPlanInput = {
  title: string;
  officialUrl: string;
  price: string;
  originalPrice?: string;
  discountNote?: string;
  managementModel: string;
  vcpu: string;
  ram: string;
  storage: string;
  bandwidth: string;
  network: string;
  os: string;
  controlPanels: string[];
  categoryHints: string[];
  productCategoryLabel: string;
  targetSegment: string[];
  performanceTier: "Standard" | "Premium" | "Enterprise";
};

type AdditionalDedicatedPlanInput = {
  title: string;
  officialUrl: string;
  price: string;
  originalPrice?: string;
  discountNote?: string;
  managementModel: string;
  cpu: string;
  memory: string;
  storage: string;
  bandwidth: string;
  controlPanels: string[];
  categoryHints: string[];
  productCategoryLabel: string;
  targetSegment: string[];
  performanceTier: "Standard" | "Premium" | "Enterprise";
};

type AdditionalMagentoPlanInput = {
  title: string;
  price: string;
  renewalPrice: string;
  sites: string;
  storage: string;
  bandwidth: string;
  phpWorkers: string;
  autoscaledWorkers: string;
  extraFeatures: string[];
  performanceTier: "Premium" | "Enterprise";
  targetSegment: string[];
};

const normalizeFamilyTitleForHandle = (value: string) =>
  value.replace(/\+/g, " Plus ");

const buildPlainTextSection = (heading: string, items: string[]) => {
  const normalizedItems = dedupe(items.map((item) => normalizeText(item)).filter(Boolean));
  if (normalizedItems.length === 0) {
    return "";
  }

  return [heading, ...normalizedItems.map((item) => `- ${item}`)].join(MULTILINE_SEPARATOR);
};

const buildAdditionalWordPressSpec = (
  input: AdditionalWordPressPlanInput
): ProductSpec => {
  const familyTitle = normalizeFamilyTitleForHandle(input.familyTitle);
  const title = `Liquid Web ${familyTitle} ${input.tier}`;
  const price = input.threeYearPrice;
  const priceValue = Number(price);
  const categoryLabel =
    input.tier === "Launch" || input.tier === "Thrive"
      ? "Managed WordPress Hosting"
      : "Managed WordPress Hosting";

  return {
    title,
    vendor: "Liquid Web",
    officialUrl: "https://www.liquidweb.com/wordpress-hosting/",
    price,
    bodyCategory: "managed WordPress and WooCommerce hosting",
    productType: "Managed Hosting",
    categoryHints: [
      "Cloud Services",
      "Managed Hosting",
      "Managed WordPress Hosting",
      "Managed WooCommerce Hosting",
      "WooCommerce Hosting",
    ],
    filters: {
      hosting_type: ["Managed WordPress"],
      pricing_model: ["Subscription"],
      price_band: [priceBand(priceValue)],
      billing_cycle: ["Monthly", "Annual"],
      performance_tier: [input.performanceTier],
      target_segment: input.targetSegment,
    },
    seoTitle: `${title} Liquid Web Managed WordPress Hosting`,
    seoDescription: `${title} includes ${input.sites}, ${input.storage} storage, ${input.bandwidth} bandwidth, and term-based pricing for managed WordPress and WooCommerce hosting.`.slice(
      0,
      160
    ),
    audience:
      "buyers comparing managed WordPress and WooCommerce plans by site capacity, worker limits, retention policy, and prepaid term pricing",
    introTheme:
      `a product-specific hosting listing for the ${familyTitle} ${input.tier} tier, where the supplied Liquid Web plan data focuses on published pricing by term, site capacity, storage, bandwidth, PHP worker limits, and the managed feature set that changes between Launch, Thrive, and Elevate`,
    useCases: [
      `hosting up to ${input.sites.toLowerCase()} with managed WordPress and WooCommerce tooling`,
      `matching a plan to ${input.storage.toLowerCase()} of storage and ${input.bandwidth.toLowerCase()} of bandwidth`,
      `choosing between basic migration coverage, stronger retention, and higher-tier operational features`,
    ],
    pricingNotes: [
      `${input.tier} is listed at $${input.monthlyPrice}/month on the monthly-style view.`,
      `$${input.yearlyPrice}/month billed upfront for 1 year.`,
      `$${input.twoYearPrice}/month billed upfront for 2 years.`,
      `$${input.threeYearPrice}/month billed upfront for 3 years.`,
    ],
    featureGroups: [
      {
        heading: "Resources",
        items: [
          `Can handle up to ${input.sites}`,
          `${input.storage} storage`,
          `${input.bandwidth} bandwidth`,
          `${input.phpWorkers} PHP workers per site`,
          ...(input.autoscaledWorkers
            ? [`${input.autoscaledWorkers} autoscaled PHP workers per site`]
            : []),
        ],
      },
      {
        heading: "Features",
        items: [
          "Unlimited visits",
          `Daily backups (${input.retention} retention)`,
          input.migration,
          ...input.extraFeatures,
        ],
      },
    ],
    factualPros: [
      "The supplied plan data publishes monthly-style and prepaid term prices clearly.",
      "Storage, bandwidth, and PHP worker limits are visible for direct comparison.",
      "The feature set scales in a predictable way from Launch to Thrive to Elevate.",
    ],
    factualCons: [
      "The lowest visible price depends on multi-year prepayment.",
      "Backup retention and migration level vary by tier.",
      "Some advanced security or staging features are reserved for higher plans.",
    ],
    buyerConsiderations: [
      "Use site count, worker limits, and retention policy together when comparing tiers.",
      "The three-year figure is the lowest visible paid term, not the base monthly-style price.",
      "Elevate tiers add stronger workflow tooling but come at a much higher effective price.",
    ],
    bodyFacts: [
      `${title} is listed as a managed WordPress and WooCommerce hosting tier in the supplied data.`,
      `The current supplied pricing ladder runs from $${input.monthlyPrice}/month down to $${input.threeYearPrice}/month on the three-year prepaid term.`,
      `The plan includes ${input.storage} storage, ${input.bandwidth} bandwidth, and ${input.phpWorkers} PHP workers per site${input.autoscaledWorkers ? ` plus ${input.autoscaledWorkers} autoscaled PHP workers per site` : ""}.`,
    ],
    productCategoryLabel: categoryLabel,
  };
};

const buildAdditionalVpsSpec = (input: AdditionalVpsPlanInput): ProductSpec => {
  const priceValue = Number(input.price);
  const controlPanelFilters = dedupe(
    input.controlPanels.filter((panel) => panel === "cPanel" || panel === "Plesk")
  );

  return {
    title: input.title,
    vendor: "Liquid Web",
    officialUrl: input.officialUrl,
    price: input.price,
    bodyCategory: `${input.productCategoryLabel.toLowerCase()} with published VPS specifications`,
    productType: "VPS Hosting",
    categoryHints: input.categoryHints,
    filters: {
      hosting_type: ["VPS"],
      pricing_model: ["Subscription"],
      price_band: [priceBand(priceValue)],
      billing_cycle: ["Monthly"],
      performance_tier: [input.performanceTier],
      target_segment: input.targetSegment,
      ...(controlPanelFilters.length > 0 ? { control_panel: controlPanelFilters } : {}),
    },
    seoTitle: `${input.title} Liquid Web ${input.productCategoryLabel}`,
    seoDescription: `${input.title} lists ${input.ram} RAM, ${input.storage} SSD, ${input.bandwidth} bandwidth, and managed VPS pricing from Liquid Web.`.slice(
      0,
      160
    ),
    audience:
      "buyers comparing VPS plans by RAM, CPU, storage, bandwidth, operating system support, and control panel options",
    introTheme:
      `a plan-specific VPS listing built from the supplied Liquid Web ${input.productCategoryLabel.toLowerCase()} data, where the focus is on CPU, RAM, SSD storage, network allocation, management model, and the available operating system or control panel path`,
    useCases: [
      "choosing a VPS with explicit CPU, memory, and SSD allocations",
      "matching the server plan to Linux or Windows workload needs",
      "comparing management model, control panel choice, and introductory discount context",
    ],
    pricingNotes: [
      `${input.title} is listed at $${input.price}/month.`,
      ...(input.originalPrice ? [`Actual Price is $${input.originalPrice}/month.`] : []),
      ...(input.discountNote ? [input.discountNote] : []),
    ],
    featureGroups: [
      {
        heading: "Core Features",
        items: [
          input.managementModel,
          `${input.vcpu} vCPU`,
          `${input.ram} RAM`,
          `${input.storage} SSD`,
          `${input.bandwidth} bandwidth`,
          `${input.network} network`,
          "Dedicated IP address",
        ],
      },
      {
        heading: "Platform And Access",
        items: [
          input.os,
          `${input.controlPanels.join(", ")} available`,
          "Fast provisioning",
          "Robust API",
          "Unmetered inbound traffic",
          "DDoS protection",
          "Root access",
        ],
      },
    ],
    factualPros: [
      "The supplied data publishes VPS resources and pricing clearly.",
      "Operating system availability and panel options are stated directly in the plan details.",
      "DDoS protection, API access, root access, and a dedicated IP are part of the supplied feature set.",
    ],
    factualCons: [
      "The discount note applies only to the early billing window.",
      "Heavier workloads may need a larger RAM or storage tier.",
      "Control panel preference can affect how the plan is evaluated.",
    ],
    buyerConsiderations: [
      "Compare RAM, bandwidth, and control panel needs before choosing the lowest visible price.",
      "Review the introductory discount separately from the ongoing monthly amount.",
      "Use higher tiers when production workload needs exceed the published entry resources.",
    ],
    bodyFacts: [
      `${input.title} is described as ${input.managementModel.toLowerCase()} in the supplied plan data.`,
      `The plan includes ${input.vcpu} vCPU, ${input.ram} RAM, ${input.storage} SSD, and ${input.bandwidth} bandwidth.`,
      `${input.os} and ${input.controlPanels.join(", ")} are included in the supplied plan notes.`,
    ],
    productCategoryLabel: input.productCategoryLabel,
  };
};

const buildAdditionalDedicatedSpec = (
  input: AdditionalDedicatedPlanInput
): ProductSpec => {
  const priceValue = Number(input.price);
  const controlPanelFilters = dedupe(
    input.controlPanels.filter((panel) => panel === "cPanel" || panel === "Plesk")
  );

  return {
    title: input.title,
    vendor: "Liquid Web",
    officialUrl: input.officialUrl,
    price: input.price,
    bodyCategory: `${input.productCategoryLabel.toLowerCase()} with published dedicated hardware details`,
    productType: "Dedicated Servers",
    categoryHints: input.categoryHints,
    filters: {
      hosting_type: ["Dedicated server"],
      pricing_model: ["Subscription"],
      price_band: [priceBand(priceValue)],
      billing_cycle: ["Monthly"],
      performance_tier: [input.performanceTier],
      target_segment: input.targetSegment,
      ...(controlPanelFilters.length > 0 ? { control_panel: controlPanelFilters } : {}),
    },
    seoTitle: `${input.title} Liquid Web ${input.productCategoryLabel}`,
    seoDescription: `${input.title} lists ${input.cpu}, ${input.memory} memory, ${input.storage}, and dedicated server pricing from Liquid Web.`.slice(
      0,
      160
    ),
    audience:
      "buyers sizing dedicated servers around CPU class, memory, storage, bandwidth, control panel options, and management model",
    introTheme:
      `a dedicated server listing grounded in the supplied Liquid Web ${input.productCategoryLabel.toLowerCase()} data, where the strongest factual differentiators are CPU model, memory, SSD allocation, monthly pricing, and the split between managed and self-managed operation`,
    useCases: [
      "comparing dedicated server hardware by CPU, memory, and SSD footprint",
      "choosing between managed and self-managed dedicated hosting",
      "matching panel availability and bandwidth to a larger hosted workload",
    ],
    pricingNotes: [
      `${input.title} is listed at $${input.price}/month.`,
      ...(input.originalPrice ? [`Actual Price is $${input.originalPrice}/month.`] : []),
      ...(input.discountNote ? [input.discountNote] : []),
    ],
    featureGroups: [
      {
        heading: "Core Hardware",
        items: [
          input.managementModel,
          input.cpu,
          `${input.memory} memory`,
          input.storage,
          `${input.bandwidth} bandwidth`,
          "Dedicated IP address",
        ],
      },
      {
        heading: "Management And Access",
        items: [
          "Unlimited sites with InterWorx",
          `${input.controlPanels.join(" and ")} available`,
          "DDoS protection",
          "Remote management tools",
          "Advanced security",
          "Root access",
        ],
      },
    ],
    factualPros: [
      "The supplied data clearly publishes CPU model, memory, storage, and monthly price.",
      "Control panel availability and remote management tooling are included in the plan notes.",
      "The dedicated plans keep DDoS protection, root access, and a dedicated IP in view.",
    ],
    factualCons: [
      "The discount note applies only to the early billing period.",
      "Managed and self-managed options have materially different operational expectations.",
      "Higher hardware tiers carry much higher monthly cost.",
    ],
    buyerConsiderations: [
      "Choose managed versus self-managed based on internal administration capacity.",
      "Compare SSD allocation and memory with the intended production footprint.",
      "Review the early discount separately from the ongoing monthly price.",
    ],
    bodyFacts: [
      `${input.title} is described as ${input.managementModel.toLowerCase()} in the supplied dedicated server data.`,
      `The plan includes ${input.cpu}, ${input.memory} memory, ${input.storage}, and ${input.bandwidth} bandwidth.`,
      `${input.controlPanels.join(" and ")} are available, and the plan notes also call out DDoS protection and remote management tools.`,
    ],
    productCategoryLabel: input.productCategoryLabel,
  };
};

const buildAdditionalMagentoSpec = (
  input: AdditionalMagentoPlanInput
): ProductSpec => ({
  title: input.title,
  vendor: "Nexcess",
  officialUrl: "https://www.nexcess.net/magento/",
  price: input.price,
  bodyCategory: "managed Magento hosting with published worker, storage, and renewal details",
  productType: "Managed Hosting",
  categoryHints: [
    "Cloud Services",
    "Managed Hosting",
    "Managed Magento Hosting",
    "Magento Hosting",
  ],
  filters: {
    hosting_type: ["Cloud hosting"],
    pricing_model: ["Subscription"],
    price_band: [priceBand(Number(input.price))],
    billing_cycle: ["Monthly"],
    performance_tier: [input.performanceTier],
    support_coverage: ["24/7 support"],
    target_segment: input.targetSegment,
    control_panel: ["Custom panel"],
  },
  seoTitle: `${input.title} Nexcess Managed Magento Hosting`,
  seoDescription: `${input.title} includes ${input.storage} storage, ${input.bandwidth} bandwidth, autoscaled PHP workers, and renewal pricing details for managed Magento hosting.`.slice(
    0,
    160
  ),
  audience:
    "store owners and agencies comparing Magento-specific managed hosting by site count, storage, worker limits, support, and renewal pricing",
  introTheme:
    `a Magento-specific managed hosting listing for the ${input.title} tier, where the supplied data focuses on promotional pricing, later renewal cost, site capacity, PHP worker levels, and the managed platform features relevant to Magento storefront operations`,
  useCases: [
    "running Magento or Adobe Commerce workloads on a managed environment",
    "comparing storage, bandwidth, and PHP worker capacity across Magento plans",
    "reviewing introductory pricing versus renewal before selecting a tier",
  ],
  pricingNotes: [
    `${input.title} is listed at $${input.price}/month for the first 3 months.`,
    `The later renewal price is $${input.renewalPrice}/month.`,
    `The plan covers up to ${input.sites.toLowerCase()}, ${input.storage} storage, and ${input.bandwidth} bandwidth.`,
  ],
  featureGroups: [
    {
      heading: "Core Features",
      items: [
        `Up to ${input.sites}`,
        "Fully managed",
        `${input.storage} storage`,
        `${input.bandwidth} bandwidth`,
        `${input.phpWorkers} PHP workers per plan`,
        `${input.autoscaledWorkers} autoscaled PHP workers`,
      ],
    },
    {
      heading: "Magento Platform Features",
      items: [
        "Elasticsearch for M2.4+",
        "24/7/365 Magento support",
        "Disaster recovery assistance",
        ...input.extraFeatures,
      ],
    },
  ],
  factualPros: [
    "The supplied plan data publishes both introductory and renewal prices.",
    "Magento-specific support and worker allocations are clearly stated.",
    "Storage, bandwidth, and site limits make cross-plan comparison easier.",
  ],
  factualCons: [
    "Renewal pricing is materially higher than the opening promotional rate.",
    "The service is specialized for Magento rather than broad hosting use cases.",
    "Higher tiers become expensive as worker and storage needs increase.",
  ],
  buyerConsiderations: [
    "Compare both the 3-month introductory rate and the longer-term renewal price.",
    "Use site count, worker allocation, and storage together when selecting a plan.",
    "Magento-specific managed hosting may be unnecessary for non-Magento stacks.",
  ],
  bodyFacts: [
    `${input.title} is described as fully managed Magento hosting in the supplied data.`,
    `The plan includes ${input.storage} storage, ${input.bandwidth} bandwidth, ${input.phpWorkers} PHP workers per plan, and ${input.autoscaledWorkers} autoscaled PHP workers.`,
    `The promotional rate is $${input.price}/month for 3 months, then $${input.renewalPrice}/month.`,
  ],
  productCategoryLabel: "Managed Magento Hosting",
});

const ADDITIONAL_SPECS: ProductSpec[] = [
  ...([
    {
      title: "Liquid Web Managed VPS 4 GB",
      officialUrl: "https://www.liquidweb.com/vps/vps-hosting/",
      price: "36",
      originalPrice: "72",
      discountNote: "Save 50% for 2 months.",
      managementModel: "Fully managed",
      vcpu: "2",
      ram: "4 GB",
      storage: "80 GB",
      bandwidth: "3 TB",
      network: "10 GB",
      os: "Windows available",
      controlPanels: ["InterWorx", "cPanel", "Plesk"],
      categoryHints: ["Cloud Services", "VPS Hosting", "Managed VPS Hosting"],
      productCategoryLabel: "Managed VPS Hosting",
      targetSegment: ["Small business", "Developers", "Mid-market"],
      performanceTier: "Premium",
    },
    {
      title: "Liquid Web Managed VPS 8 GB",
      officialUrl: "https://www.liquidweb.com/vps/vps-hosting/",
      price: "50",
      originalPrice: "100",
      discountNote: "Save 50% for 2 months.",
      managementModel: "Fully managed",
      vcpu: "4",
      ram: "8 GB",
      storage: "240 GB",
      bandwidth: "5 TB",
      network: "10 GB",
      os: "Windows available",
      controlPanels: ["InterWorx", "cPanel", "Plesk"],
      categoryHints: ["Cloud Services", "VPS Hosting", "Managed VPS Hosting"],
      productCategoryLabel: "Managed VPS Hosting",
      targetSegment: ["Small business", "Developers", "Mid-market"],
      performanceTier: "Premium",
    },
    {
      title: "Liquid Web Managed VPS 16 GB",
      officialUrl: "https://www.liquidweb.com/vps/vps-hosting/",
      price: "145",
      originalPrice: "72.50",
      discountNote: "Save 50% for 2 months.",
      managementModel: "Fully managed",
      vcpu: "6",
      ram: "16 GB",
      storage: "440 GB",
      bandwidth: "7 TB",
      network: "10 GB",
      os: "Windows available",
      controlPanels: ["InterWorx", "cPanel", "Plesk"],
      categoryHints: ["Cloud Services", "VPS Hosting", "Managed VPS Hosting", "High-RAM VPS"],
      productCategoryLabel: "Managed VPS Hosting",
      targetSegment: ["Mid-market", "Enterprise", "Developers"],
      performanceTier: "Premium",
    },
    {
      title: "Liquid Web Managed VPS 24 GB",
      officialUrl: "https://www.liquidweb.com/vps/vps-hosting/",
      price: "89",
      originalPrice: "178",
      discountNote: "Save 50% for 2 months.",
      managementModel: "Fully managed",
      vcpu: "6",
      ram: "24 GB",
      storage: "540 GB",
      bandwidth: "8 TB",
      network: "10 GB",
      os: "Windows available",
      controlPanels: ["InterWorx", "cPanel", "Plesk"],
      categoryHints: ["Cloud Services", "VPS Hosting", "Managed VPS Hosting", "High-RAM VPS"],
      productCategoryLabel: "Managed VPS Hosting",
      targetSegment: ["Mid-market", "Enterprise", "Developers"],
      performanceTier: "Premium",
    },
    {
      title: "Liquid Web Self Managed VPS 1 GB",
      officialUrl: "https://www.liquidweb.com/vps/vps-hosting/",
      price: "5",
      managementModel: "Self or fully managed",
      vcpu: "1",
      ram: "1 GB",
      storage: "30 GB",
      bandwidth: "1 TB",
      network: "10 GB",
      os: "Linux",
      controlPanels: ["cPanel", "Plesk"],
      categoryHints: ["Cloud Services", "VPS Hosting", "Unmanaged VPS Hosting", "Linux VPS"],
      productCategoryLabel: "Unmanaged VPS Hosting",
      targetSegment: ["Individuals", "Developers", "Small business"],
      performanceTier: "Standard",
    },
    {
      title: "Liquid Web Self Managed VPS 4 GB",
      officialUrl: "https://www.liquidweb.com/vps/vps-hosting/",
      price: "8.50",
      originalPrice: "17",
      discountNote: "Save 50% for 2 months.",
      managementModel: "Self or fully managed",
      vcpu: "2",
      ram: "4 GB",
      storage: "80 GB",
      bandwidth: "3 TB",
      network: "10 GB",
      os: "Linux or Windows",
      controlPanels: ["InterWorx", "cPanel", "Plesk"],
      categoryHints: ["Cloud Services", "VPS Hosting", "Unmanaged VPS Hosting"],
      productCategoryLabel: "Unmanaged VPS Hosting",
      targetSegment: ["Developers", "Small business", "Mid-market"],
      performanceTier: "Standard",
    },
    {
      title: "Liquid Web Self Managed VPS 8 GB",
      officialUrl: "https://www.liquidweb.com/vps/vps-hosting/",
      price: "22.50",
      originalPrice: "45",
      discountNote: "Save 50% for 2 months.",
      managementModel: "Self or fully managed",
      vcpu: "4",
      ram: "8 GB",
      storage: "240 GB",
      bandwidth: "5 TB",
      network: "10 GB",
      os: "Linux or Windows",
      controlPanels: ["InterWorx", "cPanel", "Plesk"],
      categoryHints: ["Cloud Services", "VPS Hosting", "Unmanaged VPS Hosting"],
      productCategoryLabel: "Unmanaged VPS Hosting",
      targetSegment: ["Developers", "Small business", "Mid-market"],
      performanceTier: "Premium",
    },
    {
      title: "Liquid Web Self Managed VPS 16 GB",
      officialUrl: "https://www.liquidweb.com/vps/vps-hosting/",
      price: "45",
      originalPrice: "90",
      discountNote: "Save 50% for 2 months.",
      managementModel: "Self or fully managed",
      vcpu: "6",
      ram: "16 GB",
      storage: "440 GB",
      bandwidth: "7 TB",
      network: "10 GB",
      os: "Linux or Windows",
      controlPanels: ["InterWorx", "cPanel", "Plesk"],
      categoryHints: ["Cloud Services", "VPS Hosting", "Unmanaged VPS Hosting", "High-RAM VPS"],
      productCategoryLabel: "Unmanaged VPS Hosting",
      targetSegment: ["Developers", "Small business", "Mid-market"],
      performanceTier: "Premium",
    },
  ] as AdditionalVpsPlanInput[]).map(buildAdditionalVpsSpec),
  ...([
    {
      title: "Liquid Web Managed Dedicated Server Intel Xeon E-2134",
      officialUrl: "https://www.liquidweb.com/products/dedicated-servers/",
      price: "77.50",
      originalPrice: "155",
      discountNote: "Save 50% for 2 months.",
      managementModel: "Fully managed",
      cpu: "Intel Xeon E-2134 with 4 @ 3.5GHz",
      memory: "12 GB",
      storage: "383 GB SSD RAID-1",
      bandwidth: "10 TB",
      controlPanels: ["Plesk", "cPanel"],
      categoryHints: ["Cloud Services", "Dedicated Servers", "Managed Dedicated Servers"],
      productCategoryLabel: "Managed Dedicated Servers",
      targetSegment: ["Small business", "Mid-market", "Developers"],
      performanceTier: "Premium",
    },
    {
      title: "Liquid Web Managed Dedicated Server Intel Xeon E-2356G",
      officialUrl: "https://www.liquidweb.com/products/dedicated-servers/",
      price: "134",
      originalPrice: "268",
      discountNote: "Save 50% for 2 months.",
      managementModel: "Fully managed",
      cpu: "Intel Xeon E-2356G with 6 @ 3.2GHz",
      memory: "64 GB",
      storage: "793 GB SSD",
      bandwidth: "10 TB",
      controlPanels: ["Plesk", "cPanel"],
      categoryHints: ["Cloud Services", "Dedicated Servers", "Managed Dedicated Servers"],
      productCategoryLabel: "Managed Dedicated Servers",
      targetSegment: ["Mid-market", "Enterprise", "Developers"],
      performanceTier: "Premium",
    },
    {
      title: "Liquid Web Managed Dedicated Server Intel Xeon 6226R Single",
      officialUrl: "https://www.liquidweb.com/products/dedicated-servers/",
      price: "237.50",
      originalPrice: "475",
      discountNote: "Save 50% for 2 months.",
      managementModel: "Fully managed",
      cpu: "Intel Xeon 6226R Single with 16 @ 2.8GHz (3.9 Max Turbo)",
      memory: "64 GB",
      storage: "1.7 TB SSD",
      bandwidth: "10 TB",
      controlPanels: ["Plesk", "cPanel"],
      categoryHints: ["Cloud Services", "Dedicated Servers", "Managed Dedicated Servers", "High-Performance Dedicated Servers"],
      productCategoryLabel: "Managed Dedicated Servers",
      targetSegment: ["Enterprise", "Mid-market", "Developers"],
      performanceTier: "Enterprise",
    },
    {
      title: "Liquid Web Managed Dedicated Server Intel Xeon 6226R Dual",
      officialUrl: "https://www.liquidweb.com/products/dedicated-servers/",
      price: "293.50",
      originalPrice: "587",
      discountNote: "Save 50% for 2 months.",
      managementModel: "Fully managed",
      cpu: "Intel Xeon 6226R Dual with 32 @ 2.9GHz",
      memory: "192 GB",
      storage: "3.2 TB SSD",
      bandwidth: "10 TB",
      controlPanels: ["Plesk", "cPanel"],
      categoryHints: ["Cloud Services", "Dedicated Servers", "Managed Dedicated Servers", "High-Performance Dedicated Servers"],
      productCategoryLabel: "Managed Dedicated Servers",
      targetSegment: ["Enterprise", "Mid-market", "Developers"],
      performanceTier: "Enterprise",
    },
    {
      title: "Liquid Web Self Managed Dedicated Intel Xeon E-2134",
      officialUrl: "https://www.liquidweb.com/products/dedicated-servers/",
      price: "55.50",
      originalPrice: "111",
      discountNote: "Save 50% for 2 months.",
      managementModel: "Self managed",
      cpu: "Intel Xeon E-2134 with 4 @ 3.5GHz",
      memory: "12 GB",
      storage: "383 GB SSD RAID-1",
      bandwidth: "10 TB",
      controlPanels: ["Plesk", "cPanel"],
      categoryHints: ["Cloud Services", "Dedicated Servers", "Unmanaged Dedicated Servers"],
      productCategoryLabel: "Unmanaged Dedicated Servers",
      targetSegment: ["Developers", "Small business", "Mid-market"],
      performanceTier: "Premium",
    },
    {
      title: "Liquid Web Self Managed Dedicated Intel Xeon E-2356G",
      officialUrl: "https://www.liquidweb.com/products/dedicated-servers/",
      price: "112",
      originalPrice: "224",
      discountNote: "Save 50% for 2 months.",
      managementModel: "Self managed",
      cpu: "Intel Xeon E-2356G with 6 @ 3.2GHz",
      memory: "64 GB",
      storage: "793 GB SSD",
      bandwidth: "10 TB",
      controlPanels: ["Plesk", "cPanel"],
      categoryHints: ["Cloud Services", "Dedicated Servers", "Unmanaged Dedicated Servers"],
      productCategoryLabel: "Unmanaged Dedicated Servers",
      targetSegment: ["Developers", "Mid-market", "Enterprise"],
      performanceTier: "Premium",
    },
    {
      title: "Liquid Web Self Managed Dedicated Intel Xeon 6226R Single",
      officialUrl: "https://www.liquidweb.com/products/dedicated-servers/",
      price: "215.50",
      originalPrice: "431",
      discountNote: "Save 50% for 2 months.",
      managementModel: "Self managed",
      cpu: "Intel Xeon 6226R Single with 16 @ 2.8GHz (3.9 Max Turbo)",
      memory: "64 GB",
      storage: "1.7 TB SSD",
      bandwidth: "10 TB",
      controlPanels: ["Plesk", "cPanel"],
      categoryHints: ["Cloud Services", "Dedicated Servers", "Unmanaged Dedicated Servers", "High-Performance Dedicated Servers"],
      productCategoryLabel: "Unmanaged Dedicated Servers",
      targetSegment: ["Developers", "Mid-market", "Enterprise"],
      performanceTier: "Enterprise",
    },
    {
      title: "Liquid Web Self Managed Dedicated Intel Xeon 6226R Dual",
      officialUrl: "https://www.liquidweb.com/products/dedicated-servers/",
      price: "271.50",
      originalPrice: "543",
      discountNote: "Save 50% for 2 months.",
      managementModel: "Self managed",
      cpu: "Intel Xeon 6226R Dual with 32 @ 2.9GHz",
      memory: "192 GB",
      storage: "3.2 TB SSD",
      bandwidth: "10 TB",
      controlPanels: ["Plesk", "cPanel"],
      categoryHints: ["Cloud Services", "Dedicated Servers", "Unmanaged Dedicated Servers", "High-Performance Dedicated Servers"],
      productCategoryLabel: "Unmanaged Dedicated Servers",
      targetSegment: ["Developers", "Mid-market", "Enterprise"],
      performanceTier: "Enterprise",
    },
  ] as AdditionalDedicatedPlanInput[]).map(buildAdditionalDedicatedSpec),
  ...([
    {
      title: "Nexcess Magento Hosting XS",
      price: "42.64",
      renewalPrice: "74",
      sites: "11 sites",
      storage: "50 GB",
      bandwidth: "1000 GB",
      phpWorkers: "25",
      autoscaledWorkers: "50",
      extraFeatures: [
        "PCI compliance",
        "Dedicated environments",
        "Cloudflare CDN",
      ],
      performanceTier: "Premium",
      targetSegment: ["Small business", "Mid-market", "Agencies"],
    },
    {
      title: "Nexcess Magento Hosting S",
      price: "74.80",
      renewalPrice: "145",
      sites: "16 sites",
      storage: "75 GB",
      bandwidth: "2 TB",
      phpWorkers: "50",
      autoscaledWorkers: "75",
      extraFeatures: [
        "PCI compliance",
        "Dedicated environments",
        "Cloudflare CDN",
      ],
      performanceTier: "Premium",
      targetSegment: ["Small business", "Mid-market", "Agencies"],
    },
    {
      title: "Nexcess Magento Hosting M",
      price: "123.76",
      renewalPrice: "247",
      sites: "21 sites",
      storage: "125 GB",
      bandwidth: "3 TB",
      phpWorkers: "75",
      autoscaledWorkers: "100",
      extraFeatures: [
        "PCI compliance",
        "Dedicated environments",
        "Cloudflare CDN",
      ],
      performanceTier: "Premium",
      targetSegment: ["Mid-market", "Agencies", "Enterprise"],
    },
    {
      title: "Nexcess Magento Hosting L",
      price: "201.52",
      renewalPrice: "409",
      sites: "31 sites",
      storage: "400 GB",
      bandwidth: "5 TB",
      phpWorkers: "100",
      autoscaledWorkers: "125",
      extraFeatures: [
        "Free SSL certificates",
        "Dedicated environments",
        "Cloudflare CDN",
      ],
      performanceTier: "Enterprise",
      targetSegment: ["Enterprise", "Mid-market", "Agencies"],
    },
  ] as AdditionalMagentoPlanInput[]).map(buildAdditionalMagentoSpec),
  ...([
    {
      familyKey: "spark",
      familyTitle: "Spark",
      tier: "Launch",
      monthlyPrice: "6",
      yearlyPrice: "5",
      twoYearPrice: "4.50",
      threeYearPrice: "4",
      sites: "1 site",
      storage: "15 GB",
      bandwidth: "2 TB",
      phpWorkers: "10",
      retention: "7-day",
      migration: "Self-serve migration",
      extraFeatures: [],
      targetSegment: ["Individuals", "Small business"],
      performanceTier: "Standard",
    },
    {
      familyKey: "spark",
      familyTitle: "Spark",
      tier: "Thrive",
      monthlyPrice: "12",
      yearlyPrice: "10",
      twoYearPrice: "9",
      threeYearPrice: "8",
      sites: "1 site",
      storage: "15 GB",
      bandwidth: "2 TB",
      phpWorkers: "10",
      retention: "30-day",
      migration: "Self-serve migration",
      extraFeatures: [
        "Visual comparison",
        "Stencils",
        "Cloudflare Enterprise",
        "DDoS protection",
        "Web application firewall",
      ],
      targetSegment: ["Small business", "Agencies"],
      performanceTier: "Premium",
    },
    {
      familyKey: "spark",
      familyTitle: "Spark",
      tier: "Elevate",
      monthlyPrice: "24",
      yearlyPrice: "20",
      twoYearPrice: "18",
      threeYearPrice: "16",
      sites: "1 site",
      storage: "15 GB",
      bandwidth: "2 TB",
      phpWorkers: "10",
      autoscaledWorkers: "20",
      retention: "30-day",
      migration: "Assisted migration",
      extraFeatures: [
        "Visual comparison",
        "Stencils",
        "Cloudflare Enterprise",
        "DDoS protection",
        "Web application firewall",
        "Free staging site",
      ],
      targetSegment: ["Small business", "Agencies", "Mid-market"],
      performanceTier: "Premium",
    },
    {
      familyKey: "spark-plus",
      familyTitle: "Spark Plus",
      tier: "Launch",
      monthlyPrice: "12",
      yearlyPrice: "10",
      twoYearPrice: "9",
      threeYearPrice: "8",
      sites: "3 sites",
      storage: "25 GB",
      bandwidth: "2.5 TB",
      phpWorkers: "15",
      retention: "7-day",
      migration: "Self-serve migration",
      extraFeatures: [],
      targetSegment: ["Small business", "Agencies"],
      performanceTier: "Standard",
    },
    {
      familyKey: "spark-plus",
      familyTitle: "Spark Plus",
      tier: "Thrive",
      monthlyPrice: "24",
      yearlyPrice: "20",
      twoYearPrice: "18",
      threeYearPrice: "16",
      sites: "3 sites",
      storage: "25 GB",
      bandwidth: "2.5 TB",
      phpWorkers: "15",
      retention: "30-day",
      migration: "Self-serve migration",
      extraFeatures: [
        "Visual comparison",
        "Stencils",
        "Cloudflare Enterprise",
        "DDoS protection",
        "Web application firewall",
      ],
      targetSegment: ["Small business", "Agencies", "Mid-market"],
      performanceTier: "Premium",
    },
    {
      familyKey: "spark-plus",
      familyTitle: "Spark Plus",
      tier: "Elevate",
      monthlyPrice: "48",
      yearlyPrice: "40",
      twoYearPrice: "36",
      threeYearPrice: "32",
      sites: "3 sites",
      storage: "25 GB",
      bandwidth: "2.5 TB",
      phpWorkers: "15",
      autoscaledWorkers: "25",
      retention: "30-day",
      migration: "Assisted migration",
      extraFeatures: [
        "Visual comparison",
        "Stencils",
        "Cloudflare Enterprise",
        "DDoS protection",
        "Web application firewall",
        "Free staging site",
      ],
      targetSegment: ["Small business", "Agencies", "Mid-market"],
      performanceTier: "Premium",
    },
    {
      familyKey: "maker",
      familyTitle: "Maker",
      tier: "Launch",
      monthlyPrice: "24.50",
      yearlyPrice: "20.42",
      twoYearPrice: "18.38",
      threeYearPrice: "16.33",
      sites: "5 sites",
      storage: "40 GB",
      bandwidth: "3 TB",
      phpWorkers: "20",
      retention: "7-day",
      migration: "Self-serve migration",
      extraFeatures: [],
      targetSegment: ["Small business", "Agencies", "Mid-market"],
      performanceTier: "Premium",
    },
    {
      familyKey: "maker",
      familyTitle: "Maker",
      tier: "Thrive",
      monthlyPrice: "49",
      yearlyPrice: "40.83",
      twoYearPrice: "36.75",
      threeYearPrice: "32.67",
      sites: "5 sites",
      storage: "40 GB",
      bandwidth: "3 TB",
      phpWorkers: "20",
      retention: "30-day",
      migration: "Self-serve migration",
      extraFeatures: [
        "Visual comparison",
        "Stencils",
        "Cloudflare Enterprise",
        "DDoS protection",
        "Web application firewall",
      ],
      targetSegment: ["Small business", "Agencies", "Mid-market"],
      performanceTier: "Premium",
    },
    {
      familyKey: "maker",
      familyTitle: "Maker",
      tier: "Elevate",
      monthlyPrice: "98",
      yearlyPrice: "81.67",
      twoYearPrice: "73.50",
      threeYearPrice: "65.33",
      sites: "5 sites",
      storage: "40 GB",
      bandwidth: "3 TB",
      phpWorkers: "20",
      autoscaledWorkers: "30",
      retention: "30-day",
      migration: "Assisted migration",
      extraFeatures: [
        "Visual comparison",
        "Stencils",
        "Cloudflare Enterprise",
        "DDoS protection",
        "Web application firewall",
        "Free staging site",
      ],
      targetSegment: ["Agencies", "Mid-market", "Small business"],
      performanceTier: "Premium",
    },
    {
      familyKey: "designer",
      familyTitle: "Designer",
      tier: "Launch",
      monthlyPrice: "28.13",
      yearlyPrice: "28.13",
      twoYearPrice: "25.31",
      threeYearPrice: "22.50",
      sites: "10 sites",
      storage: "60 GB",
      bandwidth: "4 TB",
      phpWorkers: "20",
      retention: "7-day",
      migration: "Self-serve migration",
      extraFeatures: [],
      targetSegment: ["Agencies", "Mid-market", "Small business"],
      performanceTier: "Premium",
    },
    {
      familyKey: "designer",
      familyTitle: "Designer",
      tier: "Thrive",
      monthlyPrice: "67.50",
      yearlyPrice: "56.25",
      twoYearPrice: "50.63",
      threeYearPrice: "45",
      sites: "10 sites",
      storage: "60 GB",
      bandwidth: "4 TB",
      phpWorkers: "20",
      retention: "30-day",
      migration: "Self-serve migration",
      extraFeatures: [
        "Visual comparison",
        "Stencils",
        "Cloudflare Enterprise",
        "DDoS protection",
        "Web application firewall",
      ],
      targetSegment: ["Agencies", "Mid-market", "Small business"],
      performanceTier: "Premium",
    },
    {
      familyKey: "designer",
      familyTitle: "Designer",
      tier: "Elevate",
      monthlyPrice: "135",
      yearlyPrice: "112.50",
      twoYearPrice: "101.25",
      threeYearPrice: "90",
      sites: "10 sites",
      storage: "60 GB",
      bandwidth: "4 TB",
      phpWorkers: "20",
      autoscaledWorkers: "30",
      retention: "30-day",
      migration: "Assisted migration",
      extraFeatures: [
        "Visual comparison",
        "Stencils",
        "Cloudflare Enterprise",
        "DDoS protection",
        "Web application firewall",
        "Free staging site",
      ],
      targetSegment: ["Agencies", "Mid-market", "Enterprise"],
      performanceTier: "Premium",
    },
    {
      familyKey: "builder",
      familyTitle: "Builder",
      tier: "Launch",
      monthlyPrice: "46",
      yearlyPrice: "38.33",
      twoYearPrice: "34.50",
      threeYearPrice: "30.67",
      sites: "25 sites",
      storage: "100 GB",
      bandwidth: "5 TB",
      phpWorkers: "30",
      retention: "7-day",
      migration: "Self-serve migration",
      extraFeatures: [],
      targetSegment: ["Agencies", "Mid-market", "Small business"],
      performanceTier: "Premium",
    },
    {
      familyKey: "builder",
      familyTitle: "Builder",
      tier: "Thrive",
      monthlyPrice: "92",
      yearlyPrice: "76.67",
      twoYearPrice: "69",
      threeYearPrice: "61.33",
      sites: "25 sites",
      storage: "100 GB",
      bandwidth: "5 TB",
      phpWorkers: "30",
      retention: "30-day",
      migration: "Self-serve migration",
      extraFeatures: [
        "Visual comparison",
        "Stencils",
        "Cloudflare Enterprise",
        "DDoS protection",
        "Web application firewall",
      ],
      targetSegment: ["Agencies", "Mid-market", "Small business"],
      performanceTier: "Premium",
    },
    {
      familyKey: "builder",
      familyTitle: "Builder",
      tier: "Elevate",
      monthlyPrice: "184",
      yearlyPrice: "153.33",
      twoYearPrice: "138",
      threeYearPrice: "122.67",
      sites: "25 sites",
      storage: "100 GB",
      bandwidth: "5 TB",
      phpWorkers: "30",
      autoscaledWorkers: "40",
      retention: "30-day",
      migration: "Assisted migration",
      extraFeatures: [
        "Visual comparison",
        "Stencils",
        "Cloudflare Enterprise",
        "DDoS protection",
        "Web application firewall",
        "Free staging site",
      ],
      targetSegment: ["Agencies", "Mid-market", "Enterprise"],
      performanceTier: "Premium",
    },
    {
      familyKey: "producer",
      familyTitle: "Producer",
      tier: "Launch",
      monthlyPrice: "92",
      yearlyPrice: "76.67",
      twoYearPrice: "69",
      threeYearPrice: "61.33",
      sites: "50 sites",
      storage: "300 GB",
      bandwidth: "5 TB",
      phpWorkers: "40",
      retention: "7-day",
      migration: "Self-serve migration",
      extraFeatures: [],
      targetSegment: ["Agencies", "Mid-market", "Enterprise"],
      performanceTier: "Premium",
    },
    {
      familyKey: "producer",
      familyTitle: "Producer",
      tier: "Thrive",
      monthlyPrice: "184",
      yearlyPrice: "153.33",
      twoYearPrice: "138",
      threeYearPrice: "122.67",
      sites: "50 sites",
      storage: "300 GB",
      bandwidth: "5 TB",
      phpWorkers: "40",
      retention: "30-day",
      migration: "Self-serve migration",
      extraFeatures: [
        "Visual comparison",
        "Stencils",
        "Cloudflare Enterprise",
        "DDoS protection",
        "Web application firewall",
      ],
      targetSegment: ["Agencies", "Mid-market", "Enterprise"],
      performanceTier: "Premium",
    },
    {
      familyKey: "producer",
      familyTitle: "Producer",
      tier: "Elevate",
      monthlyPrice: "368",
      yearlyPrice: "306.67",
      twoYearPrice: "276",
      threeYearPrice: "245.33",
      sites: "50 sites",
      storage: "300 GB",
      bandwidth: "5 TB",
      phpWorkers: "40",
      autoscaledWorkers: "50",
      retention: "30-day",
      migration: "Assisted migration",
      extraFeatures: [
        "Visual comparison",
        "Stencils",
        "Cloudflare Enterprise",
        "DDoS protection",
        "Web application firewall",
        "Free staging site",
      ],
      targetSegment: ["Agencies", "Mid-market", "Enterprise"],
      performanceTier: "Enterprise",
    },
    {
      familyKey: "executive",
      familyTitle: "Executive",
      tier: "Launch",
      monthlyPrice: "168.74",
      yearlyPrice: "140.63",
      twoYearPrice: "126.56",
      threeYearPrice: "112.50",
      sites: "100 sites",
      storage: "500 GB",
      bandwidth: "10 TB",
      phpWorkers: "50",
      retention: "7-day",
      migration: "Self-serve migration",
      extraFeatures: [],
      targetSegment: ["Mid-market", "Enterprise", "Agencies"],
      performanceTier: "Enterprise",
    },
    {
      familyKey: "executive",
      familyTitle: "Executive",
      tier: "Thrive",
      monthlyPrice: "337.50",
      yearlyPrice: "281.25",
      twoYearPrice: "253.13",
      threeYearPrice: "225",
      sites: "100 sites",
      storage: "500 GB",
      bandwidth: "10 TB",
      phpWorkers: "50",
      retention: "30-day",
      migration: "Self-serve migration",
      extraFeatures: [
        "Visual comparison",
        "Stencils",
        "Cloudflare Enterprise",
        "DDoS protection",
        "Web application firewall",
      ],
      targetSegment: ["Mid-market", "Enterprise", "Agencies"],
      performanceTier: "Enterprise",
    },
    {
      familyKey: "executive",
      familyTitle: "Executive",
      tier: "Elevate",
      monthlyPrice: "675",
      yearlyPrice: "562.50",
      twoYearPrice: "506.25",
      threeYearPrice: "450",
      sites: "100 sites",
      storage: "500 GB",
      bandwidth: "10 TB",
      phpWorkers: "50",
      autoscaledWorkers: "60",
      retention: "30-day",
      migration: "Assisted migration",
      extraFeatures: [
        "Visual comparison",
        "Stencils",
        "Cloudflare Enterprise",
        "DDoS protection",
        "Web application firewall",
        "Free staging site",
      ],
      targetSegment: ["Enterprise", "Mid-market", "Agencies"],
      performanceTier: "Enterprise",
    },
    {
      familyKey: "enterprise",
      familyTitle: "Enterprise",
      tier: "Launch",
      monthlyPrice: "306.75",
      yearlyPrice: "255.63",
      twoYearPrice: "230.06",
      threeYearPrice: "204.50",
      sites: "250 sites",
      storage: "800 GB",
      bandwidth: "10 TB",
      phpWorkers: "60",
      retention: "7-day",
      migration: "Self-serve migration",
      extraFeatures: [],
      targetSegment: ["Enterprise", "Mid-market", "Agencies"],
      performanceTier: "Enterprise",
    },
    {
      familyKey: "enterprise",
      familyTitle: "Enterprise",
      tier: "Thrive",
      monthlyPrice: "613.50",
      yearlyPrice: "511.25",
      twoYearPrice: "460.13",
      threeYearPrice: "409",
      sites: "250 sites",
      storage: "800 GB",
      bandwidth: "10 TB",
      phpWorkers: "60",
      retention: "30-day",
      migration: "Self-serve migration",
      extraFeatures: [
        "Visual comparison",
        "Stencils",
        "Cloudflare Enterprise",
        "DDoS protection",
        "Web application firewall",
      ],
      targetSegment: ["Enterprise", "Mid-market", "Agencies"],
      performanceTier: "Enterprise",
    },
    {
      familyKey: "enterprise",
      familyTitle: "Enterprise",
      tier: "Elevate",
      monthlyPrice: "1227",
      yearlyPrice: "1022.50",
      twoYearPrice: "920.25",
      threeYearPrice: "818",
      sites: "250 sites",
      storage: "800 GB",
      bandwidth: "10 TB",
      phpWorkers: "60",
      autoscaledWorkers: "70",
      retention: "30-day",
      migration: "Assisted migration",
      extraFeatures: [
        "Visual comparison",
        "Stencils",
        "Cloudflare Enterprise",
        "DDoS protection",
        "Web application firewall",
        "Free staging site",
      ],
      targetSegment: ["Enterprise", "Mid-market", "Agencies"],
      performanceTier: "Enterprise",
    },
  ] as AdditionalWordPressPlanInput[]).map(buildAdditionalWordPressSpec),
];

const TARGET_SPECS = [...SPECS, ...ADDITIONAL_SPECS];

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

const htmlList = (items: string[]) =>
  `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;

const htmlSection = (heading: string, items: string[]) =>
  items.length === 0 ? "" : `<h3>${escapeHtml(heading)}</h3>${htmlList(dedupe(items))}`;

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
      `${spec.title} is presented here as ${spec.introTheme}. The goal of this update is to keep the Shopify listing useful for customers who are comparing real hosting or backup offers, while staying inside the factual limits of the supplied Liquid Web and Nexcess plan details.`
    )}</p>`,
    `<p>${escapeHtml(
      `This product is best suited to ${spec.audience}. In practical terms, buyers should be able to understand what the service is, how it is positioned inside the broader hosting family, and which parts of the published pricing or plan structure deserve extra attention before they click through to the vendor website.`
    )}</p>`,
    `<h3>What This Product Covers</h3>`,
    `<p>${escapeHtml(
      `The supplied plan information describes ${spec.bodyCategory} with a clear commercial angle: public pricing, named capacity points, and a set of management or support-oriented features that distinguish the offer from generic infrastructure. That makes the listing useful for customers who do not just want a brand name, but also need the beginning of a comparison between entry options, stronger tiers, and feature tradeoffs.`
    )}</p>`,
    `<p>${escapeHtml(
      `For this listing, the most relevant use cases include the following scenarios. These are framed from the supplied plan facts, not from unsupported marketing claims, so the emphasis stays on workloads, growth path, and operational fit rather than vague performance language.`
    )}</p>`,
    useCasesHtml,
    `<h3>Features And Plan Structure</h3>`,
    `<p>${escapeHtml(
      `The available feature set matters because customers often compare managed hosting, VPS, or backup listings based on very practical differences such as storage, bandwidth, PHP workers, migration level, control panel availability, backup retention, or restore workflow. The current supplied family information gives enough structure to summarize those tradeoffs in a customer-facing way without inventing features that were not provided.`
    )}</p>`,
    featuresHtml,
    `<h3>Pricing And Billing Notes</h3>`,
    `<p>${escapeHtml(
      `The Shopify price uses the lowest visible non-zero public amount from the supplied product family that most reasonably matches the listing title. The detailed pricing notes stay alongside that number so customers can still see where prepaid billing, introductory discounts, renewals, or higher-tier differences change the real commercial picture.`
    )}</p>`,
    pricingHtml,
    `<h3>Buyer Considerations</h3>`,
    `<p>${escapeHtml(
      `This is also where responsible catalog copy matters. Some of the supplied families include stronger higher tiers, promotional windows, or title-to-plan mismatches that a buyer should notice before checkout. Instead of hiding those differences, the listing keeps them visible as considerations so the product remains helpful on repeat runs and still preserves existing Shopify data outside the requested update scope.`
    )}</p>`,
    considerationsHtml,
    `<p>${escapeHtml(
      `Overall, ${spec.title} is best read as a factual marketplace summary of the current supplied family data for ${spec.productCategoryLabel}. Customers who need exact contract terms, region availability, or the newest plan naming should still review the official vendor page, but the Shopify record now captures the strongest concrete details available from the provided Section C material in a cleaner, more comparable format.`
    )}</p>`,
  ].join("");

  if (getWordCount(html) < 300) {
    throw new Error(`Body HTML for ${spec.title} did not reach 300 words`);
  }

  return html;
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
  const handle = currentState?.product?.handle || slugify(spec.title);
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
      value: LIQUID_WEB_LOGO_URL,
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
  const jsonPath = path.join(EXPORTS_DIR, `liquidweb-update-summary-${timestamp}.json`);
  const csvPath = path.join(EXPORTS_DIR, `liquidweb-update-summary-${timestamp}.csv`);

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
  const notes: string[] = [];

  if (
    [
      "Liquid Web Business Managed Hosting",
      "Liquid Web Pro Managed Hosting",
      "Liquid Web Enterprise Managed Hosting",
      "Liquid Web eCommerce Managed Hosting",
    ].includes(spec.title)
  ) {
    notes.push(
      "Managed hosting family URL was inferred from Liquid Web's broader WordPress hosting family because Section C did not include direct official URLs."
    );
  }

  if (
    [
      "Liquid Web Managed VPS 2 GB",
      "Liquid Web General Plesk VPS",
      "Liquid Web General ASP.NET VPS",
      "Liquid Web General WordPress VPS",
    ].includes(spec.title)
  ) {
    notes.push(
      "The refreshed Section C VPS details begin at a 4 GB managed plan, so the listing uses the nearest supplied entry-tier VPS facts while preserving the existing Shopify title."
    );
  }

  if (spec.title === "Liquid Web Pro Managed Hosting") {
    notes.push(
      "The pro-tier mapping was aligned to the stronger Builder and Producer managed hosting family because the title implies a higher-capacity tier without naming a single exact plan."
    );
  }

  if (spec.title === "Liquid Web Business Managed Hosting") {
    notes.push(
      "The business-tier mapping was aligned to the lower managed WordPress family because the title is general and Section C provides multiple Spark-family entry plans."
    );
  }

  if (spec.title === "Liquid Web Enterprise Managed Hosting") {
    notes.push(
      "The enterprise-tier mapping was aligned to the explicit Enterprise plan family because that was the clearest direct match in Section C."
    );
  }

  if (spec.title === "Liquid Web eCommerce Managed Hosting") {
    notes.push(
      "The ecommerce-tier mapping was aligned to the WooCommerce-oriented managed hosting family because Section B also contains a separate Magento-specific product."
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
  console.log("- backend/src/scripts/updateLiquidWebHostingProducts.ts");
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
  console.error("Liquid Web product update failed:", error);
  process.exitCode = 1;
});
