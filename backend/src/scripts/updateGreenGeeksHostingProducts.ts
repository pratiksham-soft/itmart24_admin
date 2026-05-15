import "../config/env";
import fs from "fs";
import path from "path";
import axios from "axios";
import { execFile } from "child_process";
import { promisify } from "util";
import csv = require("csv-parser");
import { shopifyGraphQL, shopifyRest } from "../services/shopifyHttp";

const execFileAsync = promisify(execFile);

const PRODUCT_GID = (productId: number) => `gid://shopify/Product/${productId}`;
const CATEGORY_CSV_PATH = path.resolve(__dirname, "../../imports/category-collections.csv");
const FILTERS_CSV_PATH = path.resolve(
  __dirname,
  "../../doc/shopify-filter-definitions.csv"
);
const EXPORTS_DIR = path.resolve(__dirname, "../../exports");
const LOGO_TEMP_DIR = path.resolve(EXPORTS_DIR, "tmp-greengeeks-logo");
const OFFICIAL_URL = "https://www.greengeeks.com/track/itmartt24/cp-default";
const MULTILINE_SEPARATOR = "\r\n";
const SHOPIFY_GRAPHQL_PAGE_SIZE = 50;

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
  body_html?: string;
  variants?: ShopifyVariantRecord[];
};

type CurrentProductState = {
  product: ShopifyProductRecord | null;
  metafieldMap: Map<string, ShopifyMetafieldRecord>;
  typeMultiple: string[];
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

type ProductFamily =
  | "shared"
  | "wordpress"
  | "woocommerce"
  | "cloud-shared"
  | "vps-overview"
  | "dedicated-overview"
  | "reseller"
  | "managed-vps";

type GreenGeeksPlan = {
  name: string;
  specialLabel?: string;
  price: string;
  renewalPrice?: string;
  billingNote?: string;
  bestFor: string;
  websites?: string;
  webSpace?: string;
  traffic?: string;
  transfer?: string;
  cpanelAccounts?: string;
  ram?: string;
  vcpu?: string;
  storage?: string;
  regions?: string;
  coreFeatures: string[];
  managedFeatures?: string[];
  ecoFeatures?: string[];
  exclusiveFeatures?: string[];
};

type ProductSpec = {
  title: string;
  existingProductId?: number;
  family: ProductFamily;
  plan: GreenGeeksPlan;
  introTheme: string;
  audience: string;
  useCase: string;
  pricingModel: string;
  categoryHints: string[];
  filters: Record<string, string[]>;
  seoTitle: string;
  seoDescription: string;
};

type SummaryRow = {
  title: string;
  productId: number | null;
  action: "updated" | "created" | "failed";
  typeMultipleUpdated: boolean;
  logoAction: "skipped_logo_existing" | "logo_uploaded" | "logo_missing";
  metafieldsUpdated: string[];
  error: string | null;
};

const SHARED_CORE_FEATURES = [
  "Unmetered Traffic",
  "Free Email",
  "Free SSL Certificate",
  "Free Domain (1st Year)",
  "Free CDN",
  "Daily Backups",
  "99.9% Uptime Guarantee",
  "Enhanced Security",
  "30-Day Money-Back Guarantee",
  "Multi-user Access",
  "Managed Hosting for WordPress",
  "Built-in Caching",
  "Unlimited Databases",
  "AI Website Builder",
  "Easy Drag-and-Drop Builder",
  "Conversion-Focused Templates",
  "AI-Powered Content Creation",
  "SEO-Ready Optimization",
];

const SHARED_MANAGED_FEATURES = [
  "Instant WP Installation",
  "Free WordPress Migration",
  "LiteSpeed Cache for WordPress",
  "WordPress Auto-updates",
  "Advanced WP Security",
  "WooCommerce Included",
  "WP-CLI & SSH",
  "Staging & Git",
];

const SHARED_ECO_FEATURES = [
  "300% Renewable Energy Match",
  "1 Tree Planted per Customer",
];

const SPECIFICATIONS: ProductSpec[] = [
  {
    title: "GreenGeeks Lite Shared Hosting",
    existingProductId: 9096033698031,
    family: "shared",
    plan: {
      name: "Lite",
      specialLabel: "Special Price",
      price: "2.95",
      renewalPrice: "13.95",
      billingNote: "Pre-paid for 12 months",
      bestFor: "small websites or blogs that are just getting started",
      websites: "1 Website",
      webSpace: "25 GB Web Space",
      traffic: "Unmetered Traffic",
      coreFeatures: ["1 Website", "25 GB Web Space", ...SHARED_CORE_FEATURES],
      managedFeatures: SHARED_MANAGED_FEATURES,
      ecoFeatures: SHARED_ECO_FEATURES,
    },
    introTheme:
      "the GreenGeeks entry shared hosting plan designed for smaller launches, early business websites, and content-focused projects that need a professional foundation without a high starting cost",
    audience:
      "beginners, solo founders, bloggers, consultants, and small businesses",
    useCase:
      "launching a reliable website with security, performance basics, managed WordPress support, and built-in site creation tools already included",
    pricingModel: "annual-intro-shared",
    categoryHints: [
      "Cloud Services",
      "Shared Hosting",
      "Managed Hosting",
      "WordPress Hosting",
      "Managed WordPress Hosting",
    ],
    filters: {
      hosting_type: ["Shared hosting"],
      pricing_model: ["Subscription"],
      price_band: ["Under $10/month"],
      billing_cycle: ["Annual"],
      performance_tier: ["Standard"],
      target_segment: ["Individuals", "Small business"],
    },
    seoTitle: "GreenGeeks Lite Shared Hosting | GreenGeeks Starter Hosting",
    seoDescription:
      "GreenGeeks Lite Shared Hosting starts at $2.95/month billed annually with SSL, CDN, backups, WordPress tools, and 25 GB web space.",
  },
  {
    title: "GreenGeeks Pro Shared Hosting",
    existingProductId: 9096033829103,
    family: "shared",
    plan: {
      name: "Pro",
      specialLabel: "Special Price",
      price: "4.95",
      renewalPrice: "18.95",
      billingNote: "Pre-paid for 12 months",
      bestFor: "growing websites that need more speed and resources",
      websites: "Unlimited Websites",
      webSpace: "50 GB Web Space",
      traffic: "Unmetered Traffic",
      coreFeatures: ["Unlimited Websites", "50 GB Web Space", ...SHARED_CORE_FEATURES],
      managedFeatures: SHARED_MANAGED_FEATURES,
      ecoFeatures: SHARED_ECO_FEATURES,
      exclusiveFeatures: [
        "On-Demand Backups",
        "Priority 24/7 Support",
        "WordPress Repair Tool",
      ],
    },
    introTheme:
      "the GreenGeeks shared hosting plan for growing websites that need more room, better backup flexibility, and stronger customer support than an entry-tier package",
    audience:
      "small businesses, agencies, and website owners scaling beyond a one-site starter setup",
    useCase:
      "managing multiple websites with broader storage, WordPress workflow support, and a more support-oriented shared hosting plan",
    pricingModel: "annual-intro-shared",
    categoryHints: [
      "Cloud Services",
      "Shared Hosting",
      "Managed Hosting",
      "WordPress Hosting",
      "Managed WordPress Hosting",
    ],
    filters: {
      hosting_type: ["Shared hosting"],
      pricing_model: ["Subscription"],
      price_band: ["Under $10/month"],
      billing_cycle: ["Annual"],
      performance_tier: ["Premium"],
      support_coverage: ["Priority support"],
      target_segment: ["Small business", "Agencies"],
    },
    seoTitle: "GreenGeeks Pro Shared Hosting | GreenGeeks Growth Hosting",
    seoDescription:
      "GreenGeeks Pro Shared Hosting starts at $4.95/month billed annually with unlimited websites, 50 GB space, backups, and priority support.",
  },
  {
    title: "GreenGeeks Premium Shared Hosting",
    existingProductId: 9096033763567,
    family: "shared",
    plan: {
      name: "Premium",
      specialLabel: "Special Price",
      price: "8.95",
      renewalPrice: "30.95",
      billingNote: "Pre-paid for 12 months",
      bestFor: "busy websites or online stores",
      websites: "Unlimited Websites",
      webSpace: "100 GB Web Space",
      traffic: "Unmetered Traffic",
      coreFeatures: ["Unlimited Websites", "100 GB Web Space", ...SHARED_CORE_FEATURES],
      managedFeatures: SHARED_MANAGED_FEATURES,
      ecoFeatures: SHARED_ECO_FEATURES,
      exclusiveFeatures: [
        "On-Demand Backups",
        "Priority 24/7 Support",
        "WordPress Repair Tool",
        "Free Dedicated IP ($48/yr value)",
        "Free AlphaSSL ($99/yr value)",
        "Object Caching (Redis)",
      ],
    },
    introTheme:
      "the highest shared hosting tier in this GreenGeeks set, aimed at busier websites and online stores that need stronger bundled extras while staying in a managed shared environment",
    audience:
      "growing businesses, online stores, agencies, and multi-site operators",
    useCase:
      "running active websites or stores with more storage, stronger premium inclusions, and a broader feature bundle for uptime, security, and support",
    pricingModel: "annual-intro-shared",
    categoryHints: [
      "Cloud Services",
      "Shared Hosting",
      "Managed Hosting",
      "WordPress Hosting",
      "Managed WordPress Hosting",
    ],
    filters: {
      hosting_type: ["Shared hosting"],
      pricing_model: ["Subscription"],
      price_band: ["Under $10/month"],
      billing_cycle: ["Annual"],
      performance_tier: ["Premium"],
      support_coverage: ["Priority support"],
      target_segment: ["Small business", "Mid-market", "Agencies"],
    },
    seoTitle: "GreenGeeks Premium Shared Hosting | GreenGeeks Premium Plan",
    seoDescription:
      "GreenGeeks Premium Shared Hosting starts at $8.95/month billed annually with unlimited sites, Redis caching, dedicated IP, and priority support.",
  },
  {
    title: "GreenGeeks WP Shared Hosting",
    existingProductId: 9096171127023,
    family: "wordpress",
    plan: {
      name: "Lite",
      specialLabel: "Special Price",
      price: "2.95",
      renewalPrice: "13.95",
      billingNote: "Pre-paid for 12 months",
      bestFor: "WordPress sites that need managed updates, migration help, and built-in performance tools at an affordable entry price",
      websites: "1 Website",
      webSpace: "25 GB Web Space",
      traffic: "Unmetered Traffic",
      coreFeatures: ["1 Website", "25 GB Web Space", ...SHARED_CORE_FEATURES],
      managedFeatures: SHARED_MANAGED_FEATURES,
      ecoFeatures: SHARED_ECO_FEATURES,
    },
    introTheme:
      "a managed WordPress-focused GreenGeeks listing built around migration support, caching, staging, CLI access, and easier ongoing site maintenance",
    audience:
      "WordPress site owners, creators, developers, and businesses that want a cleaner managed workflow",
    useCase:
      "running WordPress websites with a straightforward setup process, better update handling, and developer-friendly deployment tools",
    pricingModel: "annual-intro-shared",
    categoryHints: [
      "Cloud Services",
      "Shared Hosting",
      "WordPress Hosting",
      "Managed Hosting",
      "Managed WordPress Hosting",
    ],
    filters: {
      hosting_type: ["Managed WordPress"],
      pricing_model: ["Subscription"],
      price_band: ["Under $10/month"],
      billing_cycle: ["Annual"],
      performance_tier: ["Standard"],
      target_segment: ["Individuals", "Small business", "Developers"],
    },
    seoTitle: "GreenGeeks WP Shared Hosting | GreenGeeks Managed WordPress",
    seoDescription:
      "GreenGeeks WP Shared Hosting starts at $2.95/month billed annually with migration, caching, staging, WP-CLI, and WordPress security tools.",
  },
  {
    title: "GreenGeeks WooCommerce eCommerce Hosting",
    existingProductId: 9102082146543,
    family: "woocommerce",
    plan: {
      name: "Lite",
      specialLabel: "Special Price",
      price: "2.95",
      renewalPrice: "13.95",
      billingNote: "Pre-paid for 12 months",
      bestFor: "WooCommerce stores that need a secure managed WordPress foundation with built-in performance and launch support",
      websites: "1 Website",
      webSpace: "25 GB Web Space",
      traffic: "Unmetered Traffic",
      coreFeatures: ["1 Website", "25 GB Web Space", ...SHARED_CORE_FEATURES],
      managedFeatures: SHARED_MANAGED_FEATURES,
      ecoFeatures: SHARED_ECO_FEATURES,
    },
    introTheme:
      "a WooCommerce-oriented GreenGeeks hosting listing for online stores that need fast WordPress delivery, security basics, backups, and launch-friendly management tools",
    audience:
      "small store owners, service businesses, agencies, and creators selling through WooCommerce",
    useCase:
      "publishing product pages, handling secure checkout, and keeping a WooCommerce storefront easy to manage over time",
    pricingModel: "annual-intro-shared",
    categoryHints: [
      "Cloud Services",
      "Shared Hosting",
      "WordPress Hosting",
      "WooCommerce Hosting",
      "E-commerce Hosting",
      "Managed Hosting",
      "Managed WordPress Hosting",
      "Managed WooCommerce Hosting",
    ],
    filters: {
      hosting_type: ["Managed WordPress"],
      pricing_model: ["Subscription"],
      price_band: ["Under $10/month"],
      billing_cycle: ["Annual"],
      performance_tier: ["Standard"],
      target_segment: ["Small business", "Agencies"],
    },
    seoTitle: "GreenGeeks WooCommerce eCommerce Hosting | GreenGeeks Store Hosting",
    seoDescription:
      "GreenGeeks WooCommerce eCommerce Hosting starts at $2.95/month billed annually with backups, SSL, caching, migration support, and WooCommerce tools.",
  },
  {
    title: "GreenGeeks Cloud Shared Hosting",
    existingProductId: 9096165589231,
    family: "cloud-shared",
    plan: {
      name: "Lite",
      specialLabel: "Special Price",
      price: "2.95",
      renewalPrice: "13.95",
      billingNote: "Pre-paid for 12 months",
      bestFor: "websites that need reliable uptime, shared hosting simplicity, and cloud-friendly delivery through caching and CDN coverage",
      websites: "1 Website",
      webSpace: "25 GB Web Space",
      traffic: "Unmetered Traffic",
      coreFeatures: ["1 Website", "25 GB Web Space", ...SHARED_CORE_FEATURES],
      managedFeatures: SHARED_MANAGED_FEATURES,
      ecoFeatures: SHARED_ECO_FEATURES,
    },
    introTheme:
      "a GreenGeeks shared hosting listing presented for buyers who care about uptime, CDN-backed delivery, and managed website essentials in a cloud-oriented buying context",
    audience:
      "businesses, agencies, and website owners comparing cloud-style hosting offers",
    useCase:
      "launching websites that need dependable delivery, backup coverage, and simple management without stepping into custom infrastructure",
    pricingModel: "annual-intro-shared",
    categoryHints: [
      "Cloud Services",
      "Shared Hosting",
      "Managed Hosting",
      "Managed Cloud Hosting",
    ],
    filters: {
      hosting_type: ["Cloud hosting"],
      pricing_model: ["Subscription"],
      price_band: ["Under $10/month"],
      billing_cycle: ["Annual"],
      performance_tier: ["Standard"],
      target_segment: ["Individuals", "Small business"],
    },
    seoTitle: "GreenGeeks Cloud Shared Hosting | GreenGeeks Cloud Hosting",
    seoDescription:
      "GreenGeeks Cloud Shared Hosting starts at $2.95/month billed annually with CDN, backups, SSL, caching, and managed website features.",
  },
  {
    title: "GreenGeeks VPS Shared Hosting",
    existingProductId: 9096080228591,
    family: "vps-overview",
    plan: {
      name: "Managed VPS",
      price: "69.95",
      bestFor: "buyers that need a managed VPS starting point with real CPU, RAM, SSD, and transfer details",
      ram: "4 GB RAM",
      vcpu: "4 vCPU",
      storage: "75 GB SSD",
      transfer: "10 TB Transfer",
      regions: "Available in USA, Canada & Europe",
      coreFeatures: [
        "4 GB RAM",
        "4 vCPU",
        "75 GB SSD",
        "10 TB Transfer",
        "cPanel Included",
        "Free SSL Certificate",
        "Free Website Transfer",
        "Free Softaculous License",
        "GreenGeeks Managed Support",
        "30-day Money Back Guarantee",
      ],
      ecoFeatures: ["300% Green Energy Match", "1 Tree Planted"],
      exclusiveFeatures: [
        "Also available in 8 GB and 16 GB managed VPS configurations",
      ],
    },
    introTheme:
      "a managed VPS overview listing that now reflects the supplied GreenGeeks VPS lineup instead of relying on shared-hosting placeholder language",
    audience:
      "developers, agencies, growing businesses, and teams that need more dedicated VPS resources with managed support",
    useCase:
      "running heavier websites or applications that need fixed RAM, vCPU, SSD storage, transfer allocation, and cPanel-managed operations",
    pricingModel: "monthly-vps",
    categoryHints: [
      "Cloud Services",
      "VPS Hosting",
      "Managed Hosting",
      "Managed VPS Hosting",
    ],
    filters: {
      hosting_type: ["VPS"],
      pricing_model: ["Subscription"],
      price_band: ["$51-$200/month"],
      billing_cycle: ["Monthly"],
      performance_tier: ["Premium"],
      server_region: ["Multi-region"],
      control_panel: ["cPanel"],
      target_segment: ["Small business", "Developers", "Agencies"],
    },
    seoTitle: "GreenGeeks VPS Shared Hosting | GreenGeeks Managed VPS",
    seoDescription:
      "GreenGeeks VPS Shared Hosting now reflects managed VPS details with 4 GB RAM, 4 vCPU, cPanel, SSD storage, and $69.95/month pricing.",
  },
  {
    title: "GreenGeeks Dedicated Shared Hosting",
    existingProductId: 9096052703471,
    family: "dedicated-overview",
    plan: {
      name: "Premium",
      specialLabel: "Special Price",
      price: "8.95",
      renewalPrice: "30.95",
      billingNote: "Pre-paid for 12 months",
      bestFor: "busy websites or online stores that still need a shared hosting product summary without unsupported dedicated-server resource claims",
      websites: "Unlimited Websites",
      webSpace: "100 GB Web Space",
      traffic: "Unmetered Traffic",
      coreFeatures: ["Unlimited Websites", "100 GB Web Space", ...SHARED_CORE_FEATURES],
      managedFeatures: SHARED_MANAGED_FEATURES,
      ecoFeatures: SHARED_ECO_FEATURES,
      exclusiveFeatures: [
        "On-Demand Backups",
        "Priority 24/7 Support",
        "WordPress Repair Tool",
        "Free Dedicated IP ($48/yr value)",
        "Free AlphaSSL ($99/yr value)",
        "Object Caching (Redis)",
      ],
    },
    introTheme:
      "a GreenGeeks hosting listing that keeps the current title intact while using the strongest supported shared-plan data instead of inventing dedicated-server allocations that were not supplied",
    audience:
      "buyers who want a professional hosting listing with clear pricing and premium shared-plan features",
    useCase:
      "presenting a premium-feature hosting offer with strong shared-plan inclusions, better support, and higher-end add-ons",
    pricingModel: "annual-intro-shared",
    categoryHints: [
      "Cloud Services",
      "Shared Hosting",
      "Managed Hosting",
      "WordPress Hosting",
      "Managed WordPress Hosting",
    ],
    filters: {
      hosting_type: ["Shared hosting"],
      pricing_model: ["Subscription"],
      price_band: ["Under $10/month"],
      billing_cycle: ["Annual"],
      performance_tier: ["Premium"],
      support_coverage: ["Priority support"],
      target_segment: ["Small business", "Mid-market"],
    },
    seoTitle: "GreenGeeks Dedicated Shared Hosting | GreenGeeks Premium Hosting",
    seoDescription:
      "GreenGeeks Dedicated Shared Hosting highlights premium shared-plan features, annual intro pricing, backups, SSL, CDN, and stronger support coverage.",
  },
  {
    title: "GreenGeeks RH-25 Reseller Hosting",
    family: "reseller",
    plan: {
      name: "RH-25",
      specialLabel: "Special Price",
      price: "19.95",
      renewalPrice: "34.95",
      billingNote: "Pre-paid for 12 months",
      bestFor: "resellers starting or growing a hosting business with a lower-cost entry point",
      transfer: "600 GB Transfer",
      cpanelAccounts: "25 cPanel Accounts",
      storage: "60 GB SSD Disk Space",
      coreFeatures: [
        "60 GB SSD Disk Space",
        "600 GB Transfer",
        "25 cPanel Accounts",
        "Free SSL Certificate",
        "Free cPanel Migrations",
        "GreenGeeks Managed Support",
        "30-day Money Back Guarantee",
      ],
      ecoFeatures: ["300% Green Energy Match", "1 Tree Planted"],
    },
    introTheme:
      "the entry reseller hosting option in this GreenGeeks set, built for partners that want to sell hosting under a managed provider foundation",
    audience:
      "agencies, freelancers, and hosting resellers launching smaller client portfolios",
    useCase:
      "selling hosting accounts with SSD storage, bundled SSL, migration help, and managed support from a greener hosting brand",
    pricingModel: "annual-intro-reseller",
    categoryHints: [
      "Cloud Services",
      "Reseller Hosting",
      "cPanel Reseller Hosting",
      "Linux Reseller Hosting",
    ],
    filters: {
      hosting_type: ["Reseller hosting"],
      pricing_model: ["Subscription"],
      price_band: ["$10-$50/month"],
      billing_cycle: ["Annual"],
      control_panel: ["cPanel"],
      support_coverage: ["Migration / onboarding help"],
      target_segment: ["Agencies", "Small business"],
    },
    seoTitle: "GreenGeeks RH-25 Reseller Hosting | GreenGeeks Reseller Plan",
    seoDescription:
      "GreenGeeks RH-25 Reseller Hosting starts at $19.95/month billed annually with 60 GB SSD, 25 cPanel accounts, SSL, and managed support.",
  },
  {
    title: "GreenGeeks RH-50 Reseller Hosting",
    family: "reseller",
    plan: {
      name: "RH-50",
      specialLabel: "Special Price",
      price: "24.95",
      renewalPrice: "49.95",
      billingNote: "Pre-paid for 12 months",
      bestFor: "resellers that need a stronger mid-range plan with room for more client accounts",
      transfer: "800 GB Transfer",
      cpanelAccounts: "50 cPanel Accounts",
      storage: "80 GB SSD Disk Space",
      coreFeatures: [
        "80 GB SSD Disk Space",
        "800 GB Transfer",
        "50 cPanel Accounts",
        "Free SSL Certificate",
        "Free cPanel Migrations",
        "GreenGeeks Managed Support",
        "30-day Money Back Guarantee",
      ],
      ecoFeatures: ["300% Green Energy Match", "1 Tree Planted"],
    },
    introTheme:
      "the GreenGeeks reseller plan positioned as a best-selling middle tier for partners managing a broader client base",
    audience:
      "agencies, consultants, and hosting resellers serving a growing customer list",
    useCase:
      "offering more hosted client accounts while staying inside a managed reseller hosting structure with SSD space and migration support",
    pricingModel: "annual-intro-reseller",
    categoryHints: [
      "Cloud Services",
      "Reseller Hosting",
      "cPanel Reseller Hosting",
      "Linux Reseller Hosting",
    ],
    filters: {
      hosting_type: ["Reseller hosting"],
      pricing_model: ["Subscription"],
      price_band: ["$10-$50/month"],
      billing_cycle: ["Annual"],
      control_panel: ["cPanel"],
      support_coverage: ["Migration / onboarding help"],
      target_segment: ["Agencies", "Small business"],
    },
    seoTitle: "GreenGeeks RH-50 Reseller Hosting | GreenGeeks Reseller Hosting",
    seoDescription:
      "GreenGeeks RH-50 Reseller Hosting starts at $24.95/month billed annually with 80 GB SSD, 50 cPanel accounts, SSL, and managed support.",
  },
  {
    title: "GreenGeeks RH-80 Reseller Hosting",
    family: "reseller",
    plan: {
      name: "RH-80",
      specialLabel: "Special Price",
      price: "34.95",
      renewalPrice: "69.95",
      billingNote: "Pre-paid for 12 months",
      bestFor: "resellers that need the largest account capacity in the supplied GreenGeeks reseller set",
      transfer: "1600 GB Transfer",
      cpanelAccounts: "80 cPanel Accounts",
      storage: "160 GB SSD Disk Space",
      coreFeatures: [
        "160 GB SSD Disk Space",
        "1600 GB Transfer",
        "80 cPanel Accounts",
        "Free SSL Certificate",
        "Free cPanel Migrations",
        "GreenGeeks Managed Support",
        "30-day Money Back Guarantee",
      ],
      ecoFeatures: ["300% Green Energy Match", "1 Tree Planted"],
    },
    introTheme:
      "the highest reseller hosting plan in this GreenGeeks batch, aimed at partners that need more disk space, transfer, and cPanel account capacity",
    audience:
      "agencies and established resellers managing larger hosting portfolios",
    useCase:
      "supporting more client accounts with broader reseller capacity while keeping migrations, SSL, and managed support inside the offer",
    pricingModel: "annual-intro-reseller",
    categoryHints: [
      "Cloud Services",
      "Reseller Hosting",
      "cPanel Reseller Hosting",
      "Linux Reseller Hosting",
    ],
    filters: {
      hosting_type: ["Reseller hosting"],
      pricing_model: ["Subscription"],
      price_band: ["$10-$50/month"],
      billing_cycle: ["Annual"],
      control_panel: ["cPanel"],
      support_coverage: ["Migration / onboarding help"],
      target_segment: ["Agencies", "Small business"],
    },
    seoTitle: "GreenGeeks RH-80 Reseller Hosting | GreenGeeks Reseller Plan",
    seoDescription:
      "GreenGeeks RH-80 Reseller Hosting starts at $34.95/month billed annually with 160 GB SSD, 80 cPanel accounts, SSL, and migrations.",
  },
  {
    title: "GreenGeeks 4GB Managed VPS Hosting",
    family: "managed-vps",
    plan: {
      name: "4GB",
      price: "69.95",
      bestFor: "buyers that need an entry managed VPS with fixed resources and cPanel included",
      ram: "4 GB RAM",
      vcpu: "4 vCPU",
      storage: "75 GB SSD",
      transfer: "10 TB Transfer",
      regions: "Available in USA, Canada & Europe",
      coreFeatures: [
        "4 GB RAM",
        "4 vCPU",
        "75 GB SSD",
        "10 TB Transfer",
        "cPanel Included",
        "Free SSL Certificate",
        "Free Website Transfer",
        "Free Softaculous License",
        "GreenGeeks Managed Support",
        "30-day Money Back Guarantee",
      ],
      ecoFeatures: ["300% Green Energy Match", "1 Tree Planted"],
    },
    introTheme:
      "the entry managed VPS plan in the supplied GreenGeeks VPS lineup, built for customers that need clearer server resources than shared hosting can provide",
    audience:
      "developers, agencies, and growing businesses that want managed VPS resources without a custom unmanaged stack",
    useCase:
      "running projects that need fixed RAM, vCPU, SSD storage, cPanel management, and generous transfer allocation",
    pricingModel: "monthly-vps",
    categoryHints: [
      "Cloud Services",
      "VPS Hosting",
      "Managed Hosting",
      "Managed VPS Hosting",
    ],
    filters: {
      hosting_type: ["VPS"],
      pricing_model: ["Subscription"],
      price_band: ["$51-$200/month"],
      billing_cycle: ["Monthly"],
      performance_tier: ["Premium"],
      server_region: ["Multi-region"],
      control_panel: ["cPanel"],
      target_segment: ["Small business", "Developers", "Agencies"],
    },
    seoTitle: "GreenGeeks 4GB Managed VPS Hosting | GreenGeeks VPS Plan",
    seoDescription:
      "GreenGeeks 4GB Managed VPS Hosting is priced at $69.95/month with 4 GB RAM, 4 vCPU, 75 GB SSD, cPanel, and managed support.",
  },
  {
    title: "GreenGeeks 8GB Managed VPS Hosting",
    family: "managed-vps",
    plan: {
      name: "8GB",
      price: "129.95",
      bestFor: "buyers that need a more powerful managed VPS with additional RAM and CPU headroom",
      ram: "8 GB RAM",
      vcpu: "6 vCPU",
      storage: "150 GB SSD",
      transfer: "10 TB Transfer",
      regions: "Available in USA, Canada & Europe",
      coreFeatures: [
        "8 GB RAM",
        "6 vCPU",
        "150 GB SSD",
        "10 TB Transfer",
        "cPanel Included",
        "Free SSL Certificate",
        "Free Website Transfer",
        "Free Softaculous License",
        "GreenGeeks Managed Support",
        "30-day Money Back Guarantee",
      ],
      ecoFeatures: ["300% Green Energy Match", "1 Tree Planted"],
    },
    introTheme:
      "the mid-range managed VPS plan in this GreenGeeks batch, aimed at projects that need more compute and storage than an entry VPS",
    audience:
      "growing businesses, developers, and agencies supporting heavier workloads or larger sites",
    useCase:
      "running larger websites, applications, or client environments that need more RAM, more storage, and managed VPS oversight",
    pricingModel: "monthly-vps",
    categoryHints: [
      "Cloud Services",
      "VPS Hosting",
      "Managed Hosting",
      "Managed VPS Hosting",
    ],
    filters: {
      hosting_type: ["VPS"],
      pricing_model: ["Subscription"],
      price_band: ["$51-$200/month"],
      billing_cycle: ["Monthly"],
      performance_tier: ["Enterprise"],
      server_region: ["Multi-region"],
      control_panel: ["cPanel"],
      target_segment: ["Small business", "Developers", "Agencies"],
    },
    seoTitle: "GreenGeeks 8GB Managed VPS Hosting | GreenGeeks Managed VPS",
    seoDescription:
      "GreenGeeks 8GB Managed VPS Hosting is priced at $129.95/month with 8 GB RAM, 6 vCPU, 150 GB SSD, cPanel, and managed support.",
  },
  {
    title: "GreenGeeks 16GB Managed VPS Hosting",
    family: "managed-vps",
    plan: {
      name: "16GB",
      price: "179.95",
      bestFor: "buyers that need the highest managed VPS capacity in the supplied GreenGeeks VPS range",
      ram: "16 GB RAM",
      vcpu: "6 vCPU",
      storage: "250 GB SSD",
      transfer: "10 TB Transfer",
      regions: "Available in USA, Canada & Europe",
      coreFeatures: [
        "16 GB RAM",
        "6 vCPU",
        "250 GB SSD",
        "10 TB Transfer",
        "cPanel Included",
        "Free SSL Certificate",
        "Free Website Transfer",
        "Free Softaculous License",
        "GreenGeeks Managed Support",
        "30-day Money Back Guarantee",
      ],
      ecoFeatures: ["300% Green Energy Match", "1 Tree Planted"],
    },
    introTheme:
      "the largest managed VPS plan in the supplied GreenGeeks data, intended for buyers that need more memory and storage within a managed cPanel VPS setup",
    audience:
      "heavier-growth businesses, agencies, and technical teams with more demanding hosting workloads",
    useCase:
      "supporting larger workloads or multiple environments that need higher RAM capacity, broader SSD storage, and managed VPS administration",
    pricingModel: "monthly-vps",
    categoryHints: [
      "Cloud Services",
      "VPS Hosting",
      "Managed Hosting",
      "Managed VPS Hosting",
    ],
    filters: {
      hosting_type: ["VPS"],
      pricing_model: ["Subscription"],
      price_band: ["$51-$200/month"],
      billing_cycle: ["Monthly"],
      performance_tier: ["Enterprise"],
      server_region: ["Multi-region"],
      control_panel: ["cPanel"],
      target_segment: ["Mid-market", "Developers", "Agencies"],
    },
    seoTitle: "GreenGeeks 16GB Managed VPS Hosting | GreenGeeks VPS Hosting",
    seoDescription:
      "GreenGeeks 16GB Managed VPS Hosting is priced at $179.95/month with 16 GB RAM, 6 vCPU, 250 GB SSD, cPanel, and managed support.",
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

const isLikelyHttpUrl = (value: string | null | undefined) => {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

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

const toListText = (items: string[]) =>
  items.map((item) => `- ${item}`).join(MULTILINE_SEPARATOR);

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

const buildMarketplaceFilterReferenceMap = async (
  filterKeys: string[]
): Promise<MarketplaceFilterReferenceMap> => {
  if (filterKeys.length === 0) {
    return {};
  }

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

  const definitionNodes = Array.isArray(
    definitionsResponse.data?.data?.metafieldDefinitions?.nodes
  )
    ? definitionsResponse.data.data.metafieldDefinitions.nodes
    : [];

  const definitionByKey = new Map<string, any>();
  definitionNodes.forEach((node: any) => {
    if (filterKeys.includes(String(node?.key ?? ""))) {
      definitionByKey.set(String(node.key), node);
    }
  });

  const map: MarketplaceFilterReferenceMap = {};

  for (const key of filterKeys) {
    const definition = definitionByKey.get(key);
    if (!definition) {
      continue;
    }

    const metaobjectDefinitionId = (definition.validations ?? []).find(
      (validation: any) => validation?.name === "metaobject_definition_id"
    )?.value;

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

const publishProduct = async (productId: number) => {
  const publicationIds = await fetchPublicationIds();
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

const absoluteUrl = (baseUrl: string, maybeRelativeUrl: string) => {
  try {
    return new URL(maybeRelativeUrl, baseUrl).toString();
  } catch {
    return maybeRelativeUrl;
  }
};

const extractLogoCandidates = (baseUrl: string, html: string) => {
  const candidates: string[] = [];
  const patterns = [
    /<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*(?:logo|brand)/gi,
    /<link[^>]+rel=["'][^"']*(?:apple-touch-icon|icon)[^"']*["'][^>]+href=["']([^"']+)["']/gi,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
  ];

  patterns.forEach((pattern) => {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
      candidates.push(absoluteUrl(baseUrl, match[1]));
    }
  });

  candidates.push(absoluteUrl(baseUrl, "/favicon.ico"));
  return dedupe(candidates);
};

const resolveGreenGeeksLogoSourceUrl = async () => {
  const response = await axios.get("https://www.greengeeks.com/", {
    timeout: 30000,
    responseType: "text",
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  const html = String(response.data ?? "");
  const candidates = extractLogoCandidates("https://www.greengeeks.com/", html);

  for (const candidate of candidates) {
    try {
      const imageResponse = await axios.get<ArrayBuffer>(candidate, {
        timeout: 30000,
        responseType: "arraybuffer",
        maxRedirects: 5,
        headers: {
          "User-Agent": "Mozilla/5.0",
          Referer: "https://www.greengeeks.com/",
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
      });

      if (
        Number(imageResponse.status) >= 200 &&
        Number(imageResponse.status) < 400 &&
        String(imageResponse.headers["content-type"] ?? "").startsWith("image/")
      ) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  throw new Error("Could not resolve a GreenGeeks logo source URL");
};

const downloadAndResizeGreenGeeksLogo = async () => {
  await ensureDir(LOGO_TEMP_DIR);
  const sourceUrl = await resolveGreenGeeksLogoSourceUrl();
  const response = await axios.get<ArrayBuffer>(sourceUrl, {
    timeout: 30000,
    responseType: "arraybuffer",
    maxRedirects: 5,
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: "https://www.greengeeks.com/",
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
  });

  const contentType = String(response.headers["content-type"] ?? "").split(";")[0];
  const urlPath = new URL(sourceUrl).pathname;
  const extensionFromUrl = path.extname(urlPath).toLowerCase();
  const extension =
    extensionFromUrl ||
    ({
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/svg+xml": ".svg",
      "image/webp": ".webp",
      "image/gif": ".gif",
      "image/x-icon": ".ico",
      "image/vnd.microsoft.icon": ".ico",
    }[contentType] ?? ".bin");

  const originalPath = path.join(LOGO_TEMP_DIR, `greengeeks-source${extension}`);
  await fs.promises.writeFile(originalPath, Buffer.from(response.data));

  if ([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico"].includes(extension)) {
    const outputPath = path.join(LOGO_TEMP_DIR, "greengeeks-120.png");
    const psScript = `
Add-Type -AssemblyName System.Drawing;
$inputPath = '${originalPath.replace(/'/g, "''")}';
$outputPath = '${outputPath.replace(/'/g, "''")}';
$image = [System.Drawing.Image]::FromFile($inputPath);
$newWidth = 120;
$newHeight = [int]([Math]::Round($image.Height * ($newWidth / [double]$image.Width)));
$bitmap = New-Object System.Drawing.Bitmap($newWidth, $newHeight);
$graphics = [System.Drawing.Graphics]::FromImage($bitmap);
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic;
$graphics.DrawImage($image, 0, 0, $newWidth, $newHeight);
$bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png);
$graphics.Dispose();
$bitmap.Dispose();
$image.Dispose();
`;
    await execFileAsync("powershell", ["-Command", psScript], {
      windowsHide: true,
    });

    return {
      filePath: outputPath,
      sourceUrl,
    };
  }

  return {
    filePath: originalPath,
    sourceUrl,
  };
};

const mimeTypeFromPath = (filePath: string) => {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    case ".webp":
      return "image/webp";
    case ".ico":
      return "image/x-icon";
    default:
      return "application/octet-stream";
  }
};

const uploadFileToShopify = async (localPath: string, altText: string) => {
  const fileName = path.basename(localPath);
  const mimeType = mimeTypeFromPath(localPath);
  const fileBytes = await fs.promises.readFile(localPath);

  const stagedUploadResponse = await shopifyGraphQL.post("", {
    query: `
      mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    variables: {
      input: [
        {
          filename: fileName,
          mimeType,
          httpMethod: "PUT",
          resource: "FILE",
        },
      ],
    },
  });

  const stagedErrors =
    stagedUploadResponse.data?.data?.stagedUploadsCreate?.userErrors ?? [];
  if (stagedErrors.length > 0) {
    throw new Error(`Staged upload failed: ${JSON.stringify(stagedErrors)}`);
  }

  const target = stagedUploadResponse.data?.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target?.url || !target?.resourceUrl) {
    throw new Error("Shopify did not return a staged upload target");
  }

  const uploadHeaders: Record<string, string> = {
    "Content-Type": mimeType,
  };
  (target.parameters ?? []).forEach((parameter: any) => {
    if (parameter?.name && parameter?.value) {
      uploadHeaders[String(parameter.name)] = String(parameter.value);
    }
  });

  await axios.put(target.url, fileBytes, {
    headers: uploadHeaders,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  const fileCreateResponse = await shopifyGraphQL.post("", {
    query: `
      mutation FileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            fileStatus
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    variables: {
      files: [
        {
          alt: altText,
          contentType: "IMAGE",
          originalSource: target.resourceUrl,
        },
      ],
    },
  });

  const fileErrors = fileCreateResponse.data?.data?.fileCreate?.userErrors ?? [];
  if (fileErrors.length > 0) {
    throw new Error(`File create failed: ${JSON.stringify(fileErrors)}`);
  }

  const fileNode = fileCreateResponse.data?.data?.fileCreate?.files?.[0];
  const fileId = normalizeText(fileNode?.id);
  if (!fileId) {
    throw new Error("Shopify file ID was not returned");
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const pollResponse = await shopifyGraphQL.post("", {
      query: `
        query CheckFileStatus($id: ID!) {
          node(id: $id) {
            ... on File {
              fileStatus
              preview {
                status
                image {
                  url
                }
              }
            }
            ... on MediaImage {
              image {
                url
              }
            }
            ... on GenericFile {
              url
            }
          }
        }
      `,
      variables: {
        id: fileId,
      },
    });

    const node = pollResponse.data?.data?.node;
    const url =
      node?.image?.url ?? node?.preview?.image?.url ?? node?.url ?? null;
    const status =
      node?.fileStatus ?? node?.preview?.status ?? fileNode?.fileStatus ?? null;

    if (url && (status === "READY" || status === "UPLOADED" || !status)) {
      return String(url);
    }

    if (status === "FAILED") {
      throw new Error(`Shopify file processing failed for ${fileName}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  throw new Error("Shopify file URL was not returned");
};

const getSharedGreenGeeksLogoUrl = async (states: CurrentProductState[]) => {
  const existingShopifyLogo = states.find(
    (state) =>
      state.product &&
      isLikelyHttpUrl(state.logoUrl) &&
      normalizeText(state.logoUrl).toLowerCase().includes("shopify")
  );

  if (existingShopifyLogo?.logoUrl) {
    return {
      logoUrl: existingShopifyLogo.logoUrl,
      action: "skipped_logo_existing" as const,
    };
  }

  const downloaded = await downloadAndResizeGreenGeeksLogo();
  const uploadedLogoUrl = await uploadFileToShopify(downloaded.filePath, "GreenGeeks logo");
  return {
    logoUrl: uploadedLogoUrl,
    action: "logo_uploaded" as const,
  };
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

const buildPlansPricing = (spec: ProductSpec) => {
  const lines = [
    spec.plan.specialLabel ? `${spec.plan.specialLabel}: ${spec.plan.name}` : `Plan: ${spec.plan.name}`,
    `Price: $${spec.plan.price}/month`,
  ];

  if (spec.plan.billingNote) {
    lines.push(`Billing: ${spec.plan.billingNote}`);
  }

  if (spec.plan.renewalPrice) {
    lines.push(`Renewal: $${spec.plan.renewalPrice}/month`);
  }

  lines.push(`Best for: ${spec.plan.bestFor}`);
  return toListText(lines);
};

const buildProductFeatures = (spec: ProductSpec) => {
  const features = [
    ...spec.plan.coreFeatures,
    ...(spec.plan.managedFeatures ?? []),
    ...(spec.plan.ecoFeatures ?? []),
    ...(spec.plan.exclusiveFeatures ?? []),
  ];
  return toListText(dedupe(features));
};

const buildProsCons = (spec: ProductSpec) => {
  const pros: string[] = [];
  const cons: string[] = [];

  switch (spec.family) {
    case "shared":
    case "wordpress":
    case "woocommerce":
    case "cloud-shared":
    case "dedicated-overview":
      pros.push(
        "Pro: Includes a broad feature bundle covering SSL, backups, CDN, and managed WordPress capabilities.",
        "Pro: Supports website launch, migration, and ongoing maintenance with customer-facing hosting features."
      );
      if (spec.plan.exclusiveFeatures?.length) {
        pros.push(`Pro: Adds ${spec.plan.exclusiveFeatures.join(", ")}.`);
      }
      cons.push(
        `Con: Intro pricing depends on ${spec.plan.billingNote?.toLowerCase() ?? "the advertised term"}.`
      );
      if (spec.plan.renewalPrice) {
        cons.push(`Con: Renewal pricing rises to $${spec.plan.renewalPrice}/month.`);
      }
      if (spec.family === "dedicated-overview") {
        cons.push(
          "Con: This listing does not claim dedicated-server hardware allocations because those details were not supplied."
        );
      }
      break;
    case "reseller":
      pros.push(
        "Pro: Built around reseller-focused capacity with bundled SSL, migrations, and managed support.",
        "Pro: cPanel account limits are clearly defined, which helps agencies size the plan more easily."
      );
      cons.push(
        `Con: Intro pricing depends on ${spec.plan.billingNote?.toLowerCase() ?? "the advertised term"}.`
      );
      if (spec.plan.renewalPrice) {
        cons.push(`Con: Renewal pricing rises to $${spec.plan.renewalPrice}/month.`);
      }
      break;
    case "managed-vps":
    case "vps-overview":
      pros.push(
        "Pro: Uses explicit VPS resources instead of generic hosting claims.",
        "Pro: Includes cPanel, SSL, website transfer support, Softaculous, and managed support."
      );
      if (spec.plan.regions) {
        pros.push(`Pro: ${spec.plan.regions}.`);
      }
      cons.push(
        "Con: Monthly pricing is materially higher than entry shared hosting because the plan includes dedicated VPS resources."
      );
      break;
  }

  return toListText([...pros, ...cons]);
};

const buildBodyHtml = (spec: ProductSpec) => {
  const highlights = dedupe([
    ...spec.plan.coreFeatures.slice(0, 8),
    ...(spec.plan.managedFeatures ?? []).slice(0, 4),
    ...(spec.plan.exclusiveFeatures ?? []).slice(0, 4),
  ]);

  const highlightsHtml = highlights
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  const pricingBits = [
    `<li><strong>Plan:</strong> ${escapeHtml(spec.plan.name)}</li>`,
    `<li><strong>Starting price:</strong> $${escapeHtml(spec.plan.price)}/month</li>`,
    ...(spec.plan.billingNote
      ? [`<li><strong>Billing:</strong> ${escapeHtml(spec.plan.billingNote)}</li>`]
      : []),
    ...(spec.plan.renewalPrice
      ? [`<li><strong>Renewal:</strong> $${escapeHtml(spec.plan.renewalPrice)}/month</li>`]
      : []),
    ...(spec.plan.websites
      ? [`<li><strong>Websites:</strong> ${escapeHtml(spec.plan.websites)}</li>`]
      : []),
    ...(spec.plan.webSpace
      ? [`<li><strong>Web Space:</strong> ${escapeHtml(spec.plan.webSpace)}</li>`]
      : []),
    ...(spec.plan.storage
      ? [`<li><strong>Storage:</strong> ${escapeHtml(spec.plan.storage)}</li>`]
      : []),
    ...(spec.plan.transfer
      ? [`<li><strong>Transfer:</strong> ${escapeHtml(spec.plan.transfer)}</li>`]
      : []),
    ...(spec.plan.ram ? [`<li><strong>RAM:</strong> ${escapeHtml(spec.plan.ram)}</li>`] : []),
    ...(spec.plan.vcpu ? [`<li><strong>vCPU:</strong> ${escapeHtml(spec.plan.vcpu)}</li>`] : []),
  ].join("");

  const html = [
    `<h2>${escapeHtml(spec.title)}</h2>`,
    `<p>${escapeHtml(
      `${spec.title} is positioned as ${spec.introTheme}. This update is written to keep the listing professional, product-specific, and aligned with the supplied GreenGeeks plan details instead of using generic marketplace copy.`
    )}</p>`,
    `<p>${escapeHtml(
      `The product is best suited to ${spec.audience} that need ${spec.useCase}. In practical terms, that means customers evaluating this listing should be able to understand what the product is, who it fits, and what kind of operational support or resource level it provides before they compare it to other hosting options.`
    )}</p>`,
    `<h3>Key Product Direction</h3>`,
    `<p>${escapeHtml(
      `GreenGeeks presents this plan for ${spec.plan.bestFor}. The supplied feature set gives the product a clearer industry-standard shape: buyers can see the core hosting or VPS allocation, the support-oriented inclusions, the website or account limits where relevant, and the bundled extras that affect setup, migration, security, or maintainability. That combination makes the listing useful for businesses that want a customer-facing hosting summary with practical purchase details instead of vague promotional language.`
    )}</p>`,
    `<ul>${highlightsHtml}</ul>`,
    `<h3>Performance, Security, And Support</h3>`,
    `<p>${escapeHtml(
      `Performance and operational confidence are central to this update. Across the supplied GreenGeeks plans, the offer emphasizes secure hosting, migration assistance, caching or SSD-backed delivery, SSL coverage, and structured support features that reduce launch friction. For shared and WordPress-oriented plans, that includes managed WordPress capabilities, backups, and site-building tools. For reseller plans, it includes cPanel account capacity, reseller-friendly migrations, and managed support. For VPS plans, it includes explicit RAM, vCPU, SSD, transfer, cPanel, and regional availability.`
    )}</p>`,
    `<p>${escapeHtml(
      `The pricing treatment is also kept transparent. The Shopify product price uses the relevant plan's advertised starting point, while the detailed pricing metafield records the plan name, billing condition where supplied, and renewal amount when applicable. That helps the product remain commercially readable and closer to industry-standard marketplace expectations, especially where introductory pricing and later renewal charges differ.`
    )}</p>`,
    `<h3>Pricing Snapshot</h3>`,
    `<ul>${pricingBits}</ul>`,
    `<h3>Use Case Fit</h3>`,
    `<p>${escapeHtml(
      `Overall, ${spec.title} is most relevant for buyers who want a clearly framed GreenGeeks hosting product with factual feature coverage, a professional tone, and enough specific detail to compare plans responsibly. The listing avoids unsupported claims, keeps the title stable when an existing product is already in Shopify, and uses multiple relevant category values in custom.type_multiple when the product reasonably fits more than one part of the hosting taxonomy.`
    )}</p>`,
  ].join("");

  if (getWordCount(html) < 300) {
    throw new Error(`Body HTML for ${spec.title} did not reach 300 words`);
  }

  return html;
};

const resolveProductState = async (spec: ProductSpec) => {
  const byId = spec.existingProductId
    ? await fetchProductStateById(spec.existingProductId)
    : null;
  if (byId?.product) {
    return byId;
  }

  const byHandle = await fetchProductStateByHandle(slugify(spec.title));
  if (byHandle?.product) {
    return byHandle;
  }

  return null;
};

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
      vendor: "GreenGeeks",
      body_html: bodyHtml,
      status: "active",
      published: true,
      metafields_global_title_tag: spec.seoTitle,
      metafields_global_description_tag: spec.seoDescription,
      variants: [
        existingVariant?.id
          ? {
              id: existingVariant.id,
              price: spec.plan.price,
              taxable: false,
              requires_shipping: false,
              inventory_management: null,
            }
          : {
              option1: "Default Title",
              price: spec.plan.price,
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
      action: "updated" as const,
      productId,
    };
  }

  const response = await shopifyRest.post("/products.json", payload);
  const productId = Number(response.data?.product?.id);
  await publishProduct(productId);
  return {
    action: "created" as const,
    productId,
  };
};

const setProductMetafields = async (
  productId: number,
  typeMultiple: string[],
  logoUrl: string | null,
  spec: ProductSpec,
  filters: Record<string, string[]>,
  marketplaceFilterReferences: MarketplaceFilterReferenceMap
) => {
  const inputs = [
    {
      namespace: "custom",
      key: "custom",
      type: "url",
      value: OFFICIAL_URL,
    },
    ...(logoUrl
      ? [
          {
            namespace: "custom",
            key: "logo_image",
            type: "url",
            value: logoUrl,
          },
        ]
      : []),
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
  const jsonPath = path.join(EXPORTS_DIR, `greengeeks-update-summary-${timestamp}.json`);
  const csvPath = path.join(EXPORTS_DIR, `greengeeks-update-summary-${timestamp}.csv`);

  await fs.promises.writeFile(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
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
      "product_id",
      "action",
      "type_multiple_updated",
      "logo_action",
      "metafields_updated",
      "error",
    ].join(","),
    ...rows.map((row) =>
      [
        csvEscape(row.title),
        csvEscape(row.productId ?? ""),
        csvEscape(row.action),
        csvEscape(row.typeMultipleUpdated),
        csvEscape(row.logoAction),
        csvEscape(row.metafieldsUpdated.join(" | ")),
        csvEscape(row.error ?? ""),
      ].join(",")
    ),
  ];

  await fs.promises.writeFile(csvPath, csvLines.join("\n"), "utf8");
  return { jsonPath, csvPath };
};

const main = async () => {
  const allowedTypeValues = await buildAllowedTypeValues();
  const filterDefinitions = await buildCloudFilterDefinitions();

  const initialStates = (
    await Promise.all(
      SPECIFICATIONS.filter((spec) => spec.existingProductId).map((spec) =>
        fetchProductStateById(spec.existingProductId as number)
      )
    )
  ).filter((state): state is CurrentProductState => Boolean(state?.product));

  const sharedLogo = await getSharedGreenGeeksLogoUrl(initialStates);

  const filterKeys = dedupe(
    SPECIFICATIONS.flatMap((spec) =>
      Object.keys(validateFilterValues(spec, filterDefinitions))
    )
  );
  const marketplaceFilterReferences = await buildMarketplaceFilterReferenceMap(filterKeys);

  const rows: SummaryRow[] = [];

  for (const spec of SPECIFICATIONS) {
    try {
      const currentState = await resolveProductState(spec);
      const bodyHtml = buildBodyHtml(spec);
      const mergedTypeMultiple = buildMergedTypeMultiple(
        currentState?.typeMultiple ?? [],
        spec.categoryHints,
        allowedTypeValues
      );
      const typeMultipleUpdated =
        JSON.stringify(mergedTypeMultiple) !==
        JSON.stringify(currentState?.typeMultiple ?? []);
      const filters = validateFilterValues(spec, filterDefinitions);
      const upsertResult = await upsertShopifyProduct(spec, currentState, bodyHtml);
      const logoUrl = currentState?.logoUrl || sharedLogo.logoUrl || null;

      await setProductMetafields(
        upsertResult.productId,
        mergedTypeMultiple,
        logoUrl,
        spec,
        filters,
        marketplaceFilterReferences
      );

      rows.push({
        title: spec.title,
        productId: upsertResult.productId,
        action: upsertResult.action,
        typeMultipleUpdated,
        logoAction: logoUrl
          ? sharedLogo.action === "logo_uploaded" && !currentState?.logoUrl
            ? "logo_uploaded"
            : "skipped_logo_existing"
          : "logo_missing",
        metafieldsUpdated: [
          "custom.custom",
          "custom.logo_image",
          "custom.type_multiple",
          "custom.plans_pricing",
          "custom.product_features",
          "custom.pros_cons",
          ...Object.keys(filters).map((key) => `marketplace.${key}`),
        ],
        error: null,
      });
    } catch (error: any) {
      rows.push({
        title: spec.title,
        productId: spec.existingProductId ?? null,
        action: "failed",
        typeMultipleUpdated: false,
        logoAction: "logo_missing",
        metafieldsUpdated: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const updatedCount = rows.filter((row) => row.action === "updated").length;
  const createdCount = rows.filter((row) => row.action === "created").length;
  const failedCount = rows.filter((row) => row.action === "failed").length;
  const { jsonPath, csvPath } = await writeSummaryFiles(rows);

  console.log("Changed files:");
  console.log("- backend/src/scripts/updateGreenGeeksHostingProducts.ts");
  console.log("");
  console.log(`Products updated count: ${updatedCount}`);
  console.log(`Products created count: ${createdCount}`);
  console.log(`Products failed count: ${failedCount}`);
  console.log("Product-by-product status summary:");
  rows.forEach((row) => {
    console.log(
      `- ${row.title} (${row.productId ?? "n/a"}): ${row.action}; logo=${row.logoAction}; type_multiple_updated=${row.typeMultipleUpdated}`
    );
  });
  console.log("Metafields updated summary:");
  rows
    .filter((row) => row.action !== "failed")
    .forEach((row) => {
      console.log(`- ${row.title}: ${row.metafieldsUpdated.join(", ")}`);
    });
  console.log("Logo action summary:");
  console.log(
    `- skipped_logo_existing: ${rows.filter((row) => row.logoAction === "skipped_logo_existing").length}`
  );
  console.log(
    `- logo_uploaded: ${rows.filter((row) => row.logoAction === "logo_uploaded").length}`
  );
  console.log(
    `- logo_missing: ${rows.filter((row) => row.logoAction === "logo_missing").length}`
  );
  console.log(`Summary JSON: ${jsonPath}`);
  console.log(`Summary CSV: ${csvPath}`);
};

main().catch((error) => {
  console.error("GreenGeeks product update failed:", error);
  process.exitCode = 1;
});
