import "../config/env";
import * as fs from "fs";
import * as path from "path";
import csv = require("csv-parser");
import axios from "axios";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
let shopifyClientsPromise:
  | Promise<typeof import("../services/shopifyHttp")>
  | null = null;

const CATEGORY_CSV_PATH = path.resolve(
  __dirname,
  "../../imports/category-collections.csv"
);
const FILTERS_CSV_PATH = path.resolve(
  __dirname,
  "../../doc/shopify-filter-definitions.csv"
);
const EXPORTS_DIR = path.resolve(__dirname, "../../exports");
const LOGO_TEMP_DIR = path.resolve(EXPORTS_DIR, "tmp-linux-hosting-logos");
const SHOPIFY_GRAPHQL_PAGE_SIZE = 100;
const TARGET_FINAL_CATEGORY = "Linux Shared Hosting";
const TARGET_COLLECTION_HANDLE = "linux-shared-hosting";
const TARGET_CATEGORY_SLUG = "cloud-services";
const TARGET_SUBCATEGORY = "Shared Hosting";

type CsvRow = Record<string, string>;

type FilterDefinition = {
  categorySlug: string;
  namespace: string;
  key: string;
  displayLabel: string;
  input: string;
  allowedValues: string[];
};

type MarketplaceFilterReferenceMap = Record<
  string,
  {
    type: string;
    byLabel: Record<string, string>;
  }
>;

type ProviderPlan = {
  code: string;
  title: string;
  handle: string;
  existingProductId?: number;
  planName: string;
  officialPath: string;
  lowestPrice: number;
  pricingSummary: string[];
  features: string[];
  factualPros: string[];
  factualCons: string[];
  verificationNotes: string[];
  confidence: "high" | "medium" | "low";
  filters: Partial<Record<string, string[]>>;
};

type ProviderSpec = {
  vendor: string;
  brand: string;
  website: string;
  productUrl: string;
  officialSourceLabel: string;
  logoPageUrl: string;
  logoUrlHint?: string;
  logoAlt: string;
  platformLabel: string;
  descriptionLead: string[];
  descriptionSupport: string[];
  plans: ProviderPlan[];
};

type ProductDatasetRow = {
  title: string;
  handle: string;
  bodyHtml: string;
  vendor: string;
  status: "active";
  published: true;
  price: string;
  chargeTax: false;
  requiresShipping: false;
  imageAltText: string;
  seoTitle: string;
  seoDescription: string;
  existingProductId: number | null;
  collectionHandle: string;
  collectionTitle: string;
  sourceUrl: string;
  sourceLabel: string;
  logoSourceUrl: string;
  logoSourceHint: string;
  customUrl: string;
  customLogoImage: string;
  customTypeMultiple: string[];
  productFeatures: string;
  plansPricing: string;
  prosCons: string;
  filterValues: Record<string, string[]>;
  verificationNotes: string;
  confidence: "high" | "medium" | "low";
  missingFields: string[];
};

type UploadResult = {
  action: "created" | "updated" | "skipped";
  handle: string;
  title: string;
  shopifyProductId: number | null;
  sourceUrl: string;
  logoFileUrl: string | null;
  imageAction: "created" | "updated" | "skipped";
  missingFields: string[];
  verificationNotes: string;
  error?: string;
};

type ShopifyProductRecord = {
  id: number;
  title: string;
  handle: string;
  vendor: string;
  status: string;
};

type ProviderPlanSeed = {
  code: string;
  name: string;
  handle: string;
  existingProductId?: number;
  lowestPrice: number;
  pricingSummary: string[];
  features: string[];
  factualPros: string[];
  factualCons: string[];
  verificationNotes: string[];
  confidence: "high" | "medium" | "low";
  filters: Partial<Record<string, string[]>>;
};

const PRODUCT_GID = (productId: number) => `gid://shopify/Product/${productId}`;

const CLOUD_SERVICE_FILTER_KEYS = new Set([
  "hosting_type",
  "pricing_model",
  "price_band",
  "billing_cycle",
  "performance_tier",
  "server_region",
  "control_panel",
  "security_compliance",
  "support_coverage",
  "target_segment",
]);

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

const toSentence = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

const dedupe = <T>(values: T[]) => Array.from(new Set(values));

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

const stripHtml = (value: string) =>
  value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const splitAllowedValues = (value: string) =>
  value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

const toPriceString = (price: number) => price.toFixed(2).replace(/\.00$/, "");

const inferPriceBand = (price: number) => {
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

const appendUnique = (items: string[], value: string) => {
  if (value && !items.includes(value)) {
    items.push(value);
  }
};

const getShopifyClients = async () => {
  if (!shopifyClientsPromise) {
    shopifyClientsPromise = import("../services/shopifyHttp");
  }

  return shopifyClientsPromise;
};

const buildProviderPlans = (
  vendor: string,
  officialPath: string,
  seeds: ProviderPlanSeed[]
): ProviderPlan[] =>
  seeds.map((seed) => ({
    code: seed.code,
    title: `${vendor} ${seed.name} Shared Hosting`,
    handle: seed.handle,
    existingProductId: seed.existingProductId,
    planName: seed.name,
    officialPath,
    lowestPrice: seed.lowestPrice,
    pricingSummary: seed.pricingSummary,
    features: seed.features,
    factualPros: seed.factualPros,
    factualCons: seed.factualCons,
    verificationNotes: seed.verificationNotes,
    confidence: seed.confidence,
    filters: seed.filters,
  }));

const PROVIDERS: ProviderSpec[] = [
  {
    vendor: "GreenGeeks",
    brand: "GreenGeeks",
    website: "https://www.greengeeks.com",
    productUrl: "https://www.greengeeks.com/cpanel-hosting",
    officialSourceLabel: "GreenGeeks cPanel Hosting",
    logoPageUrl: "https://www.greengeeks.com",
    logoAlt: "GreenGeeks Linux shared hosting logo",
    platformLabel: "cPanel-based Linux shared hosting",
    descriptionLead: [
      "GreenGeeks positions this offer as cPanel hosting built for standard Linux websites and online projects.",
      "The official page emphasizes SSD-backed storage, unmetered transfer, free SSL, email, daily backups, CDN access, and a free domain on eligible terms.",
      "That combination makes the line relevant for store owners, brochure sites, blogs, and small business websites that want familiar shared-hosting workflows without moving into VPS administration.",
    ],
    descriptionSupport: [
      "All plans on the official page are presented as managed shared hosting rather than unmanaged infrastructure.",
      "GreenGeeks also highlights developer-facing tools such as SSH and WP-CLI support on the same page.",
      "The plan differences mainly center on site count, web space, backup flexibility, and premium extras such as dedicated IP and enhanced SSL on the highest tier.",
    ],
    plans: buildProviderPlans("GreenGeeks", "/cpanel-hosting", [
      {
        code: "greengeeks-lite",
        name: "Lite",
        handle: "greengeeks-linux-shared-hosting-lite",
        existingProductId: 9096033698031,
        lowestPrice: 2.95,
        pricingSummary: [
          "Lite: $2.95/month advertised introductory price",
          "Higher renewal pricing may apply on GreenGeeks renewal terms",
        ],
        features: [
          "1 website",
          "25 GB web space",
          "Unmetered transfer",
          "Free SSL certificate",
          "Free domain for the first year on eligible terms",
          "Free nightly backups",
          "Free email accounts",
          "Free CDN",
          "cPanel, SSH, and WP-CLI support",
        ],
        factualPros: [
          "Entry plan still includes SSL, email, CDN, backups, and cPanel access",
          "Official page includes SSH and WP-CLI tooling alongside standard hosting features",
        ],
        factualCons: [
          "Limited to 1 website",
          "Storage allowance is lower than GreenGeeks higher plans",
        ],
        verificationNotes: [
          "Price and plan limits verified from official GreenGeeks cPanel hosting page",
        ],
        confidence: "high",
        filters: {
          hosting_type: ["Shared hosting"],
          pricing_model: ["Subscription"],
          price_band: [inferPriceBand(2.95)],
          control_panel: ["cPanel"],
          support_coverage: ["24/7 support"],
          target_segment: ["Individuals", "Small business"],
        },
      },
      {
        code: "greengeeks-pro",
        name: "Pro",
        handle: "greengeeks-linux-shared-hosting-pro",
        existingProductId: 9096033829103,
        lowestPrice: 4.95,
        pricingSummary: [
          "Pro: $4.95/month advertised introductory price",
          "Priority support and on-demand backups are listed on the official page",
        ],
        features: [
          "Unlimited websites",
          "50 GB web space",
          "Unmetered transfer",
          "Free SSL certificate",
          "Free nightly backups",
          "On-demand backups",
          "Free email accounts",
          "Free CDN",
          "Priority support",
        ],
        factualPros: [
          "Supports multiple websites without moving to a higher infrastructure class",
          "Adds on-demand backups and priority support over the Lite plan",
        ],
        factualCons: [
          "Still a shared-hosting environment rather than isolated VPS resources",
          "Storage remains capped at 50 GB",
        ],
        verificationNotes: [
          "Plan inclusions verified from official GreenGeeks cPanel hosting comparison table",
        ],
        confidence: "high",
        filters: {
          hosting_type: ["Shared hosting"],
          pricing_model: ["Subscription"],
          price_band: [inferPriceBand(4.95)],
          control_panel: ["cPanel"],
          support_coverage: ["24/7 support", "Priority support"],
          target_segment: ["Small business"],
        },
      },
      {
        code: "greengeeks-premium",
        name: "Premium",
        handle: "greengeeks-linux-shared-hosting-premium",
        existingProductId: 9096033763567,
        lowestPrice: 8.95,
        pricingSummary: [
          "Premium: $8.95/month advertised introductory price",
          "Dedicated IP, AlphaSSL, and Redis object caching are listed on the official page",
        ],
        features: [
          "Unlimited websites",
          "100 GB web space",
          "Unmetered transfer",
          "Dedicated IP",
          "Premium AlphaSSL",
          "Redis object caching",
          "Free nightly backups",
          "Free CDN",
          "Priority support",
        ],
        factualPros: [
          "Highest GreenGeeks shared plan adds dedicated IP and premium SSL",
          "Includes the largest advertised storage allocation in this lineup",
        ],
        factualCons: [
          "Higher starting price than the Lite and Pro plans",
          "Still shares server resources with other accounts",
        ],
        verificationNotes: [
          "Premium plan extras verified from official GreenGeeks cPanel hosting page",
        ],
        confidence: "high",
        filters: {
          hosting_type: ["Shared hosting"],
          pricing_model: ["Subscription"],
          price_band: [inferPriceBand(8.95)],
          control_panel: ["cPanel"],
          support_coverage: ["24/7 support", "Priority support"],
          target_segment: ["Small business"],
        },
      },
    ]),
  },
  {
    vendor: "Hostwinds",
    brand: "Hostwinds",
    website: "https://www.hostwinds.com",
    productUrl: "https://www.hostwinds.com/hosting/shared",
    officialSourceLabel: "Hostwinds Shared Hosting",
    logoPageUrl: "https://www.hostwinds.com",
    logoAlt: "Hostwinds shared hosting logo",
    platformLabel: "shared hosting with cPanel on Linux-style web hosting plans",
    descriptionLead: [
      "Hostwinds presents these plans under its shared hosting lineup, with cPanel management, nightly backups, SSL, and instant setup highlighted on the official page.",
      "The plans are structured around how many domains can be hosted while keeping core shared-hosting capabilities consistent across the range.",
      "That makes the lineup suitable for buyers who want a familiar control panel and shared-hosting feature set without stepping into VPS management.",
    ],
    descriptionSupport: [
      "The official page also lists unlimited disk space and bandwidth, unlimited databases, subdomains, and email accounts across the plans.",
      "A free dedicated IP is included in the comparison details shown on the same product page.",
      "Because the differences are easy to read on the official pricing table, the plans work well for a clean Shopify product comparison set.",
    ],
    plans: buildProviderPlans("Hostwinds", "/hosting/shared", [
      {
        code: "hostwinds-basic",
        name: "Basic",
        handle: "hostwinds-linux-shared-hosting-basic",
        existingProductId: 9096034910447,
        lowestPrice: 4.54,
        pricingSummary: [
          "Basic: $4.54/month advertised price",
          "Hostwinds positions the plan for 1 domain",
        ],
        features: [
          "1 domain",
          "Unlimited bandwidth",
          "Unlimited disk space",
          "Latest cPanel",
          "Free SSL certificate",
          "Instant setup",
          "Nightly backups",
          "Unlimited subdomains, databases, and email accounts",
          "Free dedicated IP",
        ],
        factualPros: [
          "Official page includes nightly backups, SSL, and a dedicated IP",
          "Core storage and bandwidth are listed as unlimited",
        ],
        factualCons: [
          "Restricted to 1 hosted domain",
          "Shared plan resources are not dedicated",
        ],
        verificationNotes: [
          "Basic shared-hosting details verified from official Hostwinds shared hosting page",
        ],
        confidence: "high",
        filters: {
          hosting_type: ["Shared hosting"],
          pricing_model: ["Subscription"],
          price_band: [inferPriceBand(4.54)],
          control_panel: ["cPanel"],
          support_coverage: ["24/7 support"],
          target_segment: ["Individuals", "Small business"],
        },
      },
      {
        code: "hostwinds-advanced",
        name: "Advanced",
        handle: "hostwinds-linux-shared-hosting-advanced",
        existingProductId: 9096034844911,
        lowestPrice: 5.84,
        pricingSummary: [
          "Advanced: $5.84/month advertised price",
          "Hostwinds positions the plan for up to 4 domains",
        ],
        features: [
          "4 domains",
          "Unlimited bandwidth",
          "Unlimited disk space",
          "Latest cPanel",
          "Free SSL certificate",
          "Nightly backups",
          "Unlimited subdomains, databases, and email accounts",
          "Instant setup",
          "Free dedicated IP",
        ],
        factualPros: [
          "Supports multiple domains while keeping the same shared-hosting toolset",
          "Includes nightly backups and free SSL on the official page",
        ],
        factualCons: [
          "Domain allowance is still capped",
          "Shared hosting is less isolated than VPS or dedicated options",
        ],
        verificationNotes: [
          "Advanced domain count and advertised pricing verified from official Hostwinds shared hosting page",
        ],
        confidence: "high",
        filters: {
          hosting_type: ["Shared hosting"],
          pricing_model: ["Subscription"],
          price_band: [inferPriceBand(5.84)],
          control_panel: ["cPanel"],
          support_coverage: ["24/7 support"],
          target_segment: ["Small business"],
        },
      },
      {
        code: "hostwinds-ultimate",
        name: "Ultimate",
        handle: "hostwinds-linux-shared-hosting-ultimate",
        existingProductId: 9096034975983,
        lowestPrice: 7.14,
        pricingSummary: [
          "Ultimate: $7.14/month advertised price",
          "Hostwinds positions the plan for unlimited domains",
        ],
        features: [
          "Unlimited domains",
          "Unlimited bandwidth",
          "Unlimited disk space",
          "Latest cPanel",
          "Free SSL certificate",
          "Nightly backups",
          "Unlimited subdomains, databases, and email accounts",
          "Instant setup",
          "Free dedicated IP",
        ],
        factualPros: [
          "Unlimited domain hosting on the provider's shared-hosting tier",
          "Keeps dedicated IP, SSL, and nightly backups in the same plan",
        ],
        factualCons: [
          "Still a shared environment despite the larger allowance",
          "No isolated compute guarantees are published for this plan tier",
        ],
        verificationNotes: [
          "Ultimate plan features verified from official Hostwinds shared hosting page",
        ],
        confidence: "high",
        filters: {
          hosting_type: ["Shared hosting"],
          pricing_model: ["Subscription"],
          price_band: [inferPriceBand(7.14)],
          control_panel: ["cPanel"],
          support_coverage: ["24/7 support"],
          target_segment: ["Small business", "Agencies"],
        },
      },
    ]),
  },
  {
    vendor: "KnownHost",
    brand: "KnownHost",
    website: "https://www.knownhost.com",
    productUrl: "https://www.knownhost.com/compare/web-hosting",
    officialSourceLabel: "KnownHost Web Hosting",
    logoPageUrl: "https://www.knownhost.com",
    logoAlt: "KnownHost shared hosting logo",
    platformLabel: "cPanel shared hosting on KnownHost web hosting",
    descriptionLead: [
      "KnownHost lists these products on its official web-hosting comparison page with cPanel access, free migrations, LiteSpeed, and NVMe-backed infrastructure called out in the plan table.",
      "The lineup is more explicit than many shared-hosting pages because the provider also publishes CPU, memory, storage, email, database, and inode limits for each tier.",
      "That level of detail makes it straightforward to build accurate catalog records without inferring features that are not stated on the official page.",
    ],
    descriptionSupport: [
      "KnownHost also highlights free SSL, a dedicated IPv4 address, and 24/7/365 support for the shared-hosting line.",
      "The higher tiers expand domains, storage, memory, and database allowances while staying inside the shared-hosting category.",
      "Because the provider separates its VPS and dedicated products elsewhere, these plans fit the Linux Shared Hosting collection cleanly.",
    ],
    plans: buildProviderPlans("KnownHost", "/compare/web-hosting", [
      {
        code: "knownhost-basic",
        name: "Basic",
        handle: "knownhost-linux-shared-hosting-basic",
        existingProductId: 9096035696879,
        lowestPrice: 3.47,
        pricingSummary: [
          "Basic: $3.47/month advertised price",
          "KnownHost lists this tier with 1 domain",
        ],
        features: [
          "1 domain",
          "1 CPU core",
          "1 GB RAM",
          "10 GB cloud storage",
          "5 email accounts",
          "2 MySQL databases",
          "100,000 inodes",
          "Free SSL and dedicated IPv4",
          "cPanel, LiteSpeed, NVMe backend, and free migrations",
        ],
        factualPros: [
          "Official page publishes CPU and RAM allocations instead of only marketing copy",
          "Includes dedicated IPv4 and free migrations on the entry plan",
        ],
        factualCons: [
          "Single-domain allowance",
          "Entry-level email, database, and storage limits are modest",
        ],
        verificationNotes: [
          "Plan limits verified from official KnownHost web-hosting comparison page",
        ],
        confidence: "high",
        filters: {
          hosting_type: ["Shared hosting"],
          pricing_model: ["Subscription"],
          price_band: [inferPriceBand(3.47)],
          control_panel: ["cPanel"],
          support_coverage: ["24/7 support", "Migration / onboarding help"],
          target_segment: ["Individuals", "Developers"],
        },
      },
      {
        code: "knownhost-standard",
        name: "Standard",
        handle: "knownhost-linux-shared-hosting-standard",
        existingProductId: 9096035893487,
        lowestPrice: 6.48,
        pricingSummary: [
          "Standard: $6.48/month advertised price",
          "KnownHost lists this tier with 5 domains",
        ],
        features: [
          "5 domains",
          "2 CPU cores",
          "2 GB RAM",
          "25 GB cloud storage",
          "25 email accounts",
          "5 MySQL databases",
          "200,000 inodes",
          "Free SSL and dedicated IPv4",
          "cPanel, LiteSpeed, NVMe backend, and free migrations",
        ],
        factualPros: [
          "Adds CPU, RAM, domains, and storage over the Basic tier",
          "Still includes cPanel, dedicated IPv4, and migrations",
        ],
        factualCons: [
          "Website count is capped at 5",
          "Storage remains limited compared with the top plan",
        ],
        verificationNotes: [
          "Standard plan values verified from official KnownHost comparison page",
        ],
        confidence: "high",
        filters: {
          hosting_type: ["Shared hosting"],
          pricing_model: ["Subscription"],
          price_band: [inferPriceBand(6.48)],
          control_panel: ["cPanel"],
          support_coverage: ["24/7 support", "Migration / onboarding help"],
          target_segment: ["Small business", "Developers"],
        },
      },
      {
        code: "knownhost-professional",
        name: "Professional",
        handle: "knownhost-linux-shared-hosting-professional",
        existingProductId: 9096035827951,
        lowestPrice: 9.98,
        pricingSummary: [
          "Professional: $9.98/month advertised price",
          "KnownHost lists this tier with unlimited domains and Patchman",
        ],
        features: [
          "Unlimited domains",
          "4 CPU cores",
          "4 GB RAM",
          "Unlimited cloud storage",
          "Unlimited email accounts",
          "Unlimited MySQL databases",
          "300,000 inodes",
          "Free SSL and dedicated IPv4",
          "cPanel, LiteSpeed, NVMe backend, free migrations, and Patchman",
        ],
        factualPros: [
          "Largest resource allocation among the selected KnownHost shared plans",
          "Adds Patchman while keeping cPanel and migration support",
        ],
        factualCons: [
          "Highest starting price in the selected KnownHost set",
          "Shared hosting still does not provide VPS-style root control",
        ],
        verificationNotes: [
          "Professional plan inclusions verified from official KnownHost comparison page",
        ],
        confidence: "high",
        filters: {
          hosting_type: ["Shared hosting"],
          pricing_model: ["Subscription"],
          price_band: [inferPriceBand(9.98)],
          control_panel: ["cPanel"],
          support_coverage: ["24/7 support", "Migration / onboarding help"],
          target_segment: ["Small business", "Agencies", "Developers"],
        },
      },
    ]),
  },
  {
    vendor: "Namecheap",
    brand: "Namecheap",
    website: "https://www.namecheap.com",
    productUrl: "https://www.namecheap.com/hosting/shared/",
    officialSourceLabel: "Namecheap Shared Hosting",
    logoPageUrl: "https://www.namecheap.com",
    logoUrlHint: "https://www.namecheap.com/favicon.ico",
    logoAlt: "Namecheap shared hosting logo",
    platformLabel: "shared hosting with cPanel on Namecheap's Linux hosting line",
    descriptionLead: [
      "Namecheap sells these products from its official shared-hosting page, where the plans are built around cPanel hosting for conventional websites rather than VPS or managed WordPress-only use cases.",
      "The page publishes storage, website counts, email allowances, backup frequency, and introductory yearly pricing for each tier.",
      "That makes the lineup a clean fit for a Linux Shared Hosting collection where shoppers expect transparent plan differences and public pricing.",
    ],
    descriptionSupport: [
      "Namecheap also lists migration support, SSL, CDN access, LiteSpeed performance, and SSH access within the shared-hosting feature set.",
      "Stellar Plus and Stellar Business expand site counts and backup posture while keeping the same overall shared-hosting model.",
      "The official page explicitly contrasts plan capacities, which supports accurate feature-based descriptions without relying on review sites.",
    ],
    plans: buildProviderPlans("Namecheap", "/hosting/shared/", [
      {
        code: "namecheap-stellar",
        name: "Stellar",
        handle: "namecheap-linux-shared-hosting-stellar",
        existingProductId: 9096036253935,
        lowestPrice: 1.98,
        pricingSummary: [
          "Stellar: 30-day free trial, then $22.88/year introductory price",
          "Namecheap also states the plan renews at $48.88/year",
        ],
        features: [
          "3 websites",
          "20 GB SSD storage",
          "Unmetered bandwidth",
          "30 email mailboxes",
          "Twice-weekly backups",
          "Free migration",
          "Free SSL certificate",
          "CDN support",
          "cPanel, SSH access, and LiteSpeed web server",
        ],
        factualPros: [
          "Official page provides both intro and renewal yearly pricing",
          "Includes SSH and cPanel alongside standard shared-hosting features",
        ],
        factualCons: [
          "Website count is capped at 3",
          "Storage is limited to 20 GB SSD",
        ],
        verificationNotes: [
          "Stellar plan pricing and inclusions verified from official Namecheap shared hosting page",
        ],
        confidence: "high",
        filters: {
          hosting_type: ["Shared hosting"],
          pricing_model: ["Subscription"],
          price_band: [inferPriceBand(1.98)],
          billing_cycle: ["Annual"],
          control_panel: ["cPanel"],
          support_coverage: ["24/7 support", "Migration / onboarding help"],
          target_segment: ["Individuals", "Small business"],
        },
      },
      {
        code: "namecheap-stellar-plus",
        name: "Stellar Plus",
        handle: "namecheap-linux-shared-hosting-stellar-plus",
        existingProductId: 9096036385007,
        lowestPrice: 2.98,
        pricingSummary: [
          "Stellar Plus: 30-day free trial, then $34.88/year introductory price",
          "Namecheap also states the plan renews at $74.88/year",
        ],
        features: [
          "Unlimited websites",
          "Unmetered SSD storage",
          "Unlimited email mailboxes",
          "AutoBackup included",
          "Free migration",
          "Free SSL certificate",
          "CDN support",
          "cPanel, SSH access, and LiteSpeed web server",
        ],
        factualPros: [
          "Unlimited websites and mailboxes on the shared-hosting tier",
          "Official page calls out AutoBackup and unmetered SSD storage",
        ],
        factualCons: [
          "Renewal price is higher than the intro rate",
          "Shared hosting does not provide server-level control",
        ],
        verificationNotes: [
          "Stellar Plus values verified from official Namecheap shared hosting page",
        ],
        confidence: "high",
        filters: {
          hosting_type: ["Shared hosting"],
          pricing_model: ["Subscription"],
          price_band: [inferPriceBand(2.98)],
          billing_cycle: ["Annual"],
          control_panel: ["cPanel"],
          support_coverage: ["24/7 support", "Migration / onboarding help"],
          target_segment: ["Small business"],
        },
      },
      {
        code: "namecheap-stellar-business",
        name: "Stellar Business",
        handle: "namecheap-linux-shared-hosting-stellar-business",
        existingProductId: 9096036319471,
        lowestPrice: 4.98,
        pricingSummary: [
          "Stellar Business: 30-day free trial, then $58.88/year introductory price",
          "Namecheap also states the plan renews at $112.88/year",
        ],
        features: [
          "Unlimited websites",
          "50 GB SSD storage",
          "Cloud storage architecture",
          "Unlimited email mailboxes",
          "AutoBackup included",
          "Imunify360 security",
          "Free migration",
          "Free SSL certificate",
          "cPanel, SSH access, and LiteSpeed web server",
        ],
        factualPros: [
          "Adds Imunify360 and business-focused storage architecture on the official page",
          "Keeps unlimited website support inside a public shared-hosting plan",
        ],
        factualCons: [
          "More expensive than the lower Stellar tiers",
          "50 GB storage cap is lower than some unlimited-storage competitors",
        ],
        verificationNotes: [
          "Stellar Business details verified from official Namecheap shared hosting page",
        ],
        confidence: "high",
        filters: {
          hosting_type: ["Shared hosting"],
          pricing_model: ["Subscription"],
          price_band: [inferPriceBand(4.98)],
          billing_cycle: ["Annual"],
          control_panel: ["cPanel"],
          support_coverage: ["24/7 support", "Migration / onboarding help"],
          target_segment: ["Small business"],
        },
      },
    ]),
  },
  {
    vendor: "ChemiCloud",
    brand: "ChemiCloud",
    website: "https://chemicloud.com",
    productUrl: "https://chemicloud.com/web-hosting",
    officialSourceLabel: "ChemiCloud Web Hosting",
    logoPageUrl: "https://chemicloud.com",
    logoAlt: "ChemiCloud web hosting logo",
    platformLabel: "cPanel-based web hosting on Linux shared infrastructure",
    descriptionLead: [
      "ChemiCloud markets these plans from its official web-hosting page with cPanel, NVMe storage, free migrations, daily backups, and free CDN support in the standard shared-hosting bundle.",
      "The provider publishes website counts, storage, visit estimates, CPU, RAM, and backup retention windows directly in the plan comparison table.",
      "That makes the lineup unusually transparent for a shared-hosting catalog and helps keep Shopify copy grounded in provider-published facts.",
    ],
    descriptionSupport: [
      "The product page also highlights server-level protections, HTTP/3 support, and one-click restore on higher plans.",
      "Plan progression is based on website count, resources, storage, backup retention, and traffic guidance rather than a change in hosting model.",
      "Because the page is clearly positioned as web hosting with cPanel, these products fit the Linux Shared Hosting collection requirements.",
    ],
    plans: buildProviderPlans("ChemiCloud", "/web-hosting", [
      {
        code: "chemicloud-starter",
        name: "Starter",
        handle: "chemicloud-linux-shared-hosting-starter",
        existingProductId: 9096032780527,
        lowestPrice: 2.49,
        pricingSummary: [
          "Starter: $2.49/month advertised price",
          "Official page estimates suitability for about 25,000 monthly visits",
        ],
        features: [
          "1 website",
          "20 GB NVMe storage",
          "About 25,000 monthly visits",
          "1 CPU core",
          "2 GB RAM",
          "10-day backup retention",
          "cPanel access",
          "Free domain, SSL, migration, and CDN",
        ],
        factualPros: [
          "Official page publishes CPU, RAM, storage, and backup retention details",
          "Includes migration, SSL, and CDN in the entry plan",
        ],
        factualCons: [
          "Single-site plan",
          "Shortest backup retention in the selected ChemiCloud lineup",
        ],
        verificationNotes: [
          "Starter plan values verified from official ChemiCloud web hosting page",
        ],
        confidence: "high",
        filters: {
          hosting_type: ["Shared hosting"],
          pricing_model: ["Subscription"],
          price_band: [inferPriceBand(2.49)],
          control_panel: ["cPanel"],
          support_coverage: ["24/7 support", "Migration / onboarding help"],
          target_segment: ["Individuals", "Small business"],
        },
      },
      {
        code: "chemicloud-pro",
        name: "Pro",
        handle: "chemicloud-linux-shared-hosting-pro",
        existingProductId: 9096032714991,
        lowestPrice: 3.49,
        pricingSummary: [
          "Pro: $3.49/month advertised price",
          "Official page estimates suitability for about 50,000 monthly visits",
        ],
        features: [
          "Unlimited websites",
          "35 GB NVMe storage",
          "About 50,000 monthly visits",
          "2 CPU cores",
          "4 GB RAM",
          "20-day backup retention",
          "One-click restore",
          "cPanel access",
          "Free domain, SSL, migration, and CDN",
        ],
        factualPros: [
          "Adds unlimited websites and longer backup retention over Starter",
          "Official page publishes resource increases clearly",
        ],
        factualCons: [
          "Storage is still capped at 35 GB",
          "Shared environment remains less isolated than VPS plans",
        ],
        verificationNotes: [
          "Pro plan details verified from official ChemiCloud web hosting page",
        ],
        confidence: "high",
        filters: {
          hosting_type: ["Shared hosting"],
          pricing_model: ["Subscription"],
          price_band: [inferPriceBand(3.49)],
          control_panel: ["cPanel"],
          support_coverage: ["24/7 support", "Migration / onboarding help"],
          target_segment: ["Small business"],
        },
      },
      {
        code: "chemicloud-turbo",
        name: "Turbo",
        handle: "chemicloud-linux-shared-hosting-turbo",
        existingProductId: 9096032846063,
        lowestPrice: 4.49,
        pricingSummary: [
          "Turbo: $4.49/month advertised price",
          "Official page estimates suitability for about 100,000 monthly visits",
        ],
        features: [
          "Unlimited websites",
          "50 GB NVMe storage",
          "About 100,000 monthly visits",
          "3 CPU cores",
          "6 GB RAM",
          "30-day backup retention",
          "HTTP/3 support",
          "Advanced malware protection",
          "cPanel access and one-click restore",
        ],
        factualPros: [
          "Longest backup retention and largest resource allocation in the selected ChemiCloud set",
          "Official page adds HTTP/3 and advanced malware protection",
        ],
        factualCons: [
          "Higher price than the lower ChemiCloud tiers",
          "Storage still has a stated cap at 50 GB",
        ],
        verificationNotes: [
          "Turbo plan inclusions verified from official ChemiCloud web hosting page",
        ],
        confidence: "high",
        filters: {
          hosting_type: ["Shared hosting"],
          pricing_model: ["Subscription"],
          price_band: [inferPriceBand(4.49)],
          control_panel: ["cPanel"],
          support_coverage: ["24/7 support", "Migration / onboarding help"],
          target_segment: ["Small business", "Agencies"],
        },
      },
    ]),
  },
  {
    vendor: "TMDHosting",
    brand: "TMDHosting",
    website: "https://www.tmdhosting.com",
    productUrl: "https://www.tmdhosting.com/shared-hosting.html",
    officialSourceLabel: "TMDHosting Shared Hosting",
    logoPageUrl: "https://www.tmdhosting.com",
    logoAlt: "TMDHosting shared hosting logo",
    platformLabel: "cPanel-based Linux shared hosting",
    descriptionLead: [
      "TMDHosting explicitly calls this lineup cPanel-based Linux shared hosting on the official product page, which makes the collection fit especially clear.",
      "The provider publishes separate monthly, annual, and triennial prices for the selected plans, alongside storage, site counts, and relative performance multipliers.",
      "That public pricing structure lets us store a numeric lowest visible price while still preserving the billing-cycle detail in the plans-pricing metafield.",
    ],
    descriptionSupport: [
      "The official page also lists LiteSpeed, cPanel, CloudLinux, SSH/SFTP access, and response-time promises for support.",
      "The higher tiers add more storage, more sites, stronger relative performance, and 30 included backups.",
      "Because the page labels these products as Linux shared hosting directly, there is no need to infer the hosting type from unrelated product lines.",
    ],
    plans: buildProviderPlans("TMDHosting", "/shared-hosting.html", [
      {
        code: "tmdhosting-starter",
        name: "Starter",
        handle: "tmdhosting-linux-shared-hosting-starter",
        existingProductId: 9096037007599,
        lowestPrice: 9.52,
        pricingSummary: [
          "Starter: $9.52/month on triennial term",
          "Annual price shown as $10.71/month; monthly price shown as $11.90/month",
        ],
        features: [
          "1 website",
          "50 GB SSD storage",
          "Standard performance tier",
          "Free SSL certificate",
          "LiteSpeed web server",
          "cPanel and CloudLinux",
          "SSH and SFTP access",
          "15-minute support response target",
        ],
        factualPros: [
          "Official page explicitly labels the product as Linux shared hosting",
          "Displays multiple billing-cycle prices publicly instead of hiding monthly pricing",
        ],
        factualCons: [
          "Backups are not included on the Starter tier according to the official comparison",
          "Single-site allowance",
        ],
        verificationNotes: [
          "Starter plan prices and features verified from official TMDHosting shared hosting page",
        ],
        confidence: "high",
        filters: {
          hosting_type: ["Shared hosting"],
          pricing_model: ["Subscription"],
          price_band: [inferPriceBand(9.52)],
          billing_cycle: ["Monthly", "Annual"],
          performance_tier: ["Standard"],
          control_panel: ["cPanel"],
          support_coverage: ["24/7 support"],
          target_segment: ["Small business"],
        },
      },
      {
        code: "tmdhosting-business",
        name: "Business",
        handle: "tmdhosting-linux-shared-hosting-business",
        existingProductId: 9096036876527,
        lowestPrice: 12.72,
        pricingSummary: [
          "Business: $12.72/month on triennial term",
          "Annual price shown as $14.31/month; monthly price shown as $15.90/month",
        ],
        features: [
          "Unlimited websites",
          "100 GB SSD storage",
          "Performance x2",
          "30 backups included",
          "Free SSL certificate",
          "LiteSpeed web server",
          "cPanel and CloudLinux",
          "SSH and SFTP access",
          "15-minute support response target",
        ],
        factualPros: [
          "Adds included backups and higher performance over Starter",
          "Multiple billing-cycle prices are visible on the official page",
        ],
        factualCons: [
          "More expensive than lower shared-hosting plans in this project",
          "Storage still has a fixed 100 GB cap",
        ],
        verificationNotes: [
          "Business plan values verified from official TMDHosting shared hosting page",
        ],
        confidence: "high",
        filters: {
          hosting_type: ["Shared hosting"],
          pricing_model: ["Subscription"],
          price_band: [inferPriceBand(12.72)],
          billing_cycle: ["Monthly", "Annual"],
          performance_tier: ["Premium"],
          control_panel: ["cPanel"],
          support_coverage: ["24/7 support"],
          target_segment: ["Small business", "Agencies"],
        },
      },
      {
        code: "tmdhosting-enterprise",
        name: "Enterprise",
        handle: "tmdhosting-linux-shared-hosting-enterprise",
        existingProductId: 9096036942063,
        lowestPrice: 19.12,
        pricingSummary: [
          "Enterprise: $19.12/month on triennial term",
          "Annual price shown as $21.51/month; monthly price shown as $23.90/month",
        ],
        features: [
          "Unlimited websites",
          "Unlimited SSD storage",
          "Performance x4",
          "30 backups included",
          "Free SSL certificate",
          "LiteSpeed web server",
          "cPanel and CloudLinux",
          "SSH and SFTP access",
          "15-minute support response target",
        ],
        factualPros: [
          "Highest relative performance in the selected TMDHosting shared lineup",
          "Official page includes unlimited SSD storage on this tier",
        ],
        factualCons: [
          "Highest price in the selected TMDHosting set",
          "Still shared hosting despite the larger allowances",
        ],
        verificationNotes: [
          "Enterprise plan details verified from official TMDHosting shared hosting page",
        ],
        confidence: "high",
        filters: {
          hosting_type: ["Shared hosting"],
          pricing_model: ["Subscription"],
          price_band: [inferPriceBand(19.12)],
          billing_cycle: ["Monthly", "Annual"],
          performance_tier: ["Enterprise"],
          control_panel: ["cPanel"],
          support_coverage: ["24/7 support"],
          target_segment: ["Small business", "Agencies"],
        },
      },
    ]),
  },
  {
    vendor: "HostPapa",
    brand: "HostPapa",
    website: "https://www.hostpapa.com",
    productUrl: "https://www.hostpapa.com/web-hosting-plan/",
    officialSourceLabel: "HostPapa Web Hosting Plans",
    logoPageUrl: "https://www.hostpapa.com",
    logoAlt: "HostPapa web hosting logo",
    platformLabel: "cPanel website hosting on Linux shared infrastructure",
    descriptionLead: [
      "HostPapa sells these plans from its official web-hosting page with website counts, NVMe storage, and relative resource levels shown for each package.",
      "The lineup stays inside standard website hosting rather than moving into VPS or reseller plans, and the product page is paired with HostPapa's cPanel website-hosting language.",
      "That makes the plans appropriate for this Linux Shared Hosting collection when the catalog copy stays tied to the published shared-hosting feature set.",
    ],
    descriptionSupport: [
      "The official page also highlights free domain transfer benefits, CDN access, security tools, and performance-tuned hosting.",
      "The selected plans scale by storage, site counts, and resource multipliers from Essentials through Elite.",
      "Because the product line is sold publicly with clear pricing and capacities, these records can be created without relying on third-party summaries.",
    ],
    plans: buildProviderPlans("HostPapa", "/web-hosting-plan/", [
      {
        code: "hostpapa-essentials",
        name: "Essentials",
        handle: "hostpapa-linux-shared-hosting-essentials",
        existingProductId: 9096034779375,
        lowestPrice: 2.95,
        pricingSummary: [
          "Essentials: $2.95/month advertised price",
          "HostPapa lists 1x resources on the official page",
        ],
        features: [
          "1 website",
          "25 GB NVMe storage",
          "1x resources",
          "Free SSL certificate",
          "CDN support",
          "Performance-tuned hosting",
          "Website builder and migration-friendly onboarding materials",
        ],
        factualPros: [
          "Low starting price with NVMe storage on the official page",
          "Easy entry point for single-site shared hosting",
        ],
        factualCons: [
          "Limited to 1 website",
          "Smallest storage and resource allocation in the selected HostPapa lineup",
        ],
        verificationNotes: [
          "Essentials plan price and capacities verified from official HostPapa web hosting plans page",
        ],
        confidence: "high",
        filters: {
          hosting_type: ["Shared hosting"],
          pricing_model: ["Subscription"],
          price_band: [inferPriceBand(2.95)],
          control_panel: ["cPanel"],
          support_coverage: ["24/7 support", "Migration / onboarding help"],
          target_segment: ["Individuals", "Small business"],
        },
      },
      {
        code: "hostpapa-growth",
        name: "Growth",
        handle: "hostpapa-linux-shared-hosting-growth",
        existingProductId: 9096034713839,
        lowestPrice: 5.95,
        pricingSummary: [
          "Growth: $5.95/month advertised price",
          "HostPapa lists 2x resources on the official page",
        ],
        features: [
          "5 websites",
          "100 GB NVMe storage",
          "2x resources",
          "Free SSL certificate",
          "CDN support",
          "Performance-tuned hosting",
          "Website tools and onboarding resources",
        ],
        factualPros: [
          "Supports multiple websites while staying in shared hosting",
          "100 GB NVMe storage is a large step up from Essentials",
        ],
        factualCons: [
          "Still a capped website count",
          "Less capacity than Premium and Elite",
        ],
        verificationNotes: [
          "Growth plan values verified from official HostPapa web hosting plans page",
        ],
        confidence: "high",
        filters: {
          hosting_type: ["Shared hosting"],
          pricing_model: ["Subscription"],
          price_band: [inferPriceBand(5.95)],
          control_panel: ["cPanel"],
          support_coverage: ["24/7 support", "Migration / onboarding help"],
          target_segment: ["Small business"],
        },
      },
      {
        code: "hostpapa-premium",
        name: "Premium",
        handle: "hostpapa-linux-shared-hosting-premium",
        existingProductId: 9096034582767,
        lowestPrice: 6.95,
        pricingSummary: [
          "Premium: $6.95/month advertised price",
          "HostPapa lists 4x resources on the official page",
        ],
        features: [
          "Unlimited websites",
          "200 GB NVMe storage",
          "4x resources",
          "Free SSL certificate",
          "CDN support",
          "Performance-tuned hosting",
          "Website tools and onboarding resources",
        ],
        factualPros: [
          "Unlimited sites with a larger 200 GB NVMe allocation",
          "Official page shows a stronger resource multiplier than Growth",
        ],
        factualCons: [
          "Higher starting price than the lower HostPapa plans",
          "Storage remains capped below Elite's unmetered option",
        ],
        verificationNotes: [
          "Premium plan details verified from official HostPapa web hosting plans page",
        ],
        confidence: "high",
        filters: {
          hosting_type: ["Shared hosting"],
          pricing_model: ["Subscription"],
          price_band: [inferPriceBand(6.95)],
          control_panel: ["cPanel"],
          support_coverage: ["24/7 support", "Migration / onboarding help"],
          target_segment: ["Small business", "Agencies"],
        },
      },
      {
        code: "hostpapa-elite",
        name: "Elite",
        handle: "hostpapa-linux-shared-hosting-elite",
        existingProductId: 9096034648303,
        lowestPrice: 9.95,
        pricingSummary: [
          "Elite: $9.95/month advertised price",
          "HostPapa lists 8x resources on the official page",
        ],
        features: [
          "Unlimited websites",
          "Unmetered NVMe storage",
          "8x resources",
          "Free SSL certificate",
          "CDN support",
          "Performance-tuned hosting",
          "Website tools and onboarding resources",
        ],
        factualPros: [
          "Largest advertised resource tier in the selected HostPapa lineup",
          "Unmetered NVMe storage is listed on the official page",
        ],
        factualCons: [
          "Highest price among the selected HostPapa plans",
          "Still shared hosting rather than isolated infrastructure",
        ],
        verificationNotes: [
          "Elite plan values verified from official HostPapa web hosting plans page",
        ],
        confidence: "high",
        filters: {
          hosting_type: ["Shared hosting"],
          pricing_model: ["Subscription"],
          price_band: [inferPriceBand(9.95)],
          control_panel: ["cPanel"],
          support_coverage: ["24/7 support", "Migration / onboarding help"],
          target_segment: ["Small business", "Agencies"],
        },
      },
    ]),
  },
  {
    vendor: "IONOS",
    brand: "IONOS",
    website: "https://www.ionos.com",
    productUrl: "https://www.ionos.com/hosting/linux-hosting",
    officialSourceLabel: "IONOS Linux Hosting",
    logoPageUrl: "https://www.ionos.com",
    logoAlt: "IONOS Linux hosting logo",
    platformLabel: "Linux hosting for shared website workloads",
    descriptionLead: [
      "IONOS sells this lineup from an official page called Linux Hosting, which makes the operating-system fit explicit for this collection.",
      "The page publishes intro pricing, renewal pricing after year one, storage, RAM, PHP memory limits, databases, SFTP, shell access, wildcard SSL, and daily backup coverage.",
      "Those plan details make it possible to describe each product accurately while keeping the copy focused on shared website hosting rather than cloud-server products.",
    ],
    descriptionSupport: [
      "IONOS also highlights DDoS protection and geo-redundant infrastructure on the product page.",
      "The selected plans scale from a small single-site package to larger packages with more storage and capacity while remaining within Linux hosting.",
      "The official page also references ISO 27001-certified data centers, which is relevant to the security-compliance facet when used carefully.",
    ],
    plans: buildProviderPlans("IONOS", "/hosting/linux-hosting", [
      {
        code: "ionos-essential",
        name: "Essential",
        handle: "ionos-linux-shared-hosting-essential",
        existingProductId: 9096035369199,
        lowestPrice: 4,
        pricingSummary: [
          "Essential: $4/month for the first year",
          "IONOS states the plan renews at $8/month after year one",
        ],
        features: [
          "1 website",
          "10 GB storage",
          "10 databases",
          "512 MB PHP memory",
          "SFTP access",
          "Wildcard SSL certificate",
          "Daily backup",
          "DDoS protection",
          "Geo-redundant infrastructure",
        ],
        factualPros: [
          "Official page clearly separates intro and renewal pricing",
          "Linux hosting page includes daily backup and wildcard SSL",
        ],
        factualCons: [
          "Single-site plan",
          "Smallest storage allocation in the selected IONOS lineup",
        ],
        verificationNotes: [
          "Essential plan values verified from official IONOS Linux Hosting page",
        ],
        confidence: "high",
        filters: {
          hosting_type: ["Shared hosting"],
          pricing_model: ["Subscription"],
          price_band: [inferPriceBand(4)],
          billing_cycle: ["Annual"],
          security_compliance: ["ISO 27001"],
          support_coverage: ["24/7 support"],
          target_segment: ["Individuals", "Small business"],
        },
      },
      {
        code: "ionos-starter",
        name: "Starter",
        handle: "ionos-linux-shared-hosting-starter",
        existingProductId: 9096035303663,
        lowestPrice: 6,
        pricingSummary: [
          "Starter: $6/month for the first year",
          "IONOS states the plan renews at $10/month after year one",
        ],
        features: [
          "10 websites",
          "100 GB storage",
          "50 databases",
          "768 MB PHP memory",
          "SFTP access",
          "Wildcard SSL certificate",
          "Daily backup",
          "DDoS protection",
          "Geo-redundant infrastructure",
        ],
        factualPros: [
          "Large increase in site count and storage compared with Essential",
          "Official page retains Linux hosting, backup, and SSL details",
        ],
        factualCons: [
          "Renewal price increases after the first year",
          "Storage remains capped",
        ],
        verificationNotes: [
          "Starter plan details verified from official IONOS Linux Hosting page",
        ],
        confidence: "high",
        filters: {
          hosting_type: ["Shared hosting"],
          pricing_model: ["Subscription"],
          price_band: [inferPriceBand(6)],
          billing_cycle: ["Annual"],
          security_compliance: ["ISO 27001"],
          support_coverage: ["24/7 support"],
          target_segment: ["Small business"],
        },
      },
      {
        code: "ionos-plus",
        name: "Plus",
        handle: "ionos-linux-shared-hosting-plus",
        existingProductId: 9096035434735,
        lowestPrice: 1,
        pricingSummary: [
          "Plus: $1/month for the first year",
          "IONOS states the plan renews at $14/month after year one",
        ],
        features: [
          "Unlimited websites",
          "Unlimited storage",
          "Unlimited databases",
          "1 GB PHP memory",
          "SFTP access",
          "Shell and Git access",
          "Wildcard SSL certificate",
          "Daily backup",
          "DDoS protection and geo-redundant infrastructure",
        ],
        factualPros: [
          "Official page lists unlimited websites, storage, and databases",
          "Includes shell and Git access on the Linux hosting page",
        ],
        factualCons: [
          "Introductory price is far below the renewal price",
          "Shared hosting still does not provide full server-level control",
        ],
        verificationNotes: [
          "Plus plan details verified from official IONOS Linux Hosting page",
        ],
        confidence: "high",
        filters: {
          hosting_type: ["Shared hosting"],
          pricing_model: ["Subscription"],
          price_band: [inferPriceBand(1)],
          billing_cycle: ["Annual"],
          security_compliance: ["ISO 27001"],
          support_coverage: ["24/7 support"],
          target_segment: ["Small business", "Developers"],
        },
      },
    ]),
  },
];

const loadFilterDefinitions = async () => {
  const rows = await readCsv(FILTERS_CSV_PATH);
  return rows
    .filter(
      (row) =>
        row.category_slug === TARGET_CATEGORY_SLUG &&
        row.namespace === "marketplace" &&
        CLOUD_SERVICE_FILTER_KEYS.has(row.metafield_key)
    )
    .map<FilterDefinition>((row) => ({
      categorySlug: row.category_slug,
      namespace: row.namespace,
      key: row.metafield_key,
      displayLabel: row.display_label,
      input: row.input,
      allowedValues: splitAllowedValues(row.allowed_values ?? ""),
    }));
};

const loadTargetCategory = async () => {
  const rows = await readCsv(CATEGORY_CSV_PATH);
  const match = rows.find(
    (row) =>
      row.top_category === "Cloud Services" &&
      row.subcategory === TARGET_SUBCATEGORY &&
      row.final_category === TARGET_FINAL_CATEGORY &&
      row.collection_handle === TARGET_COLLECTION_HANDLE
  );

  if (!match) {
    throw new Error(
      `Could not find ${TARGET_FINAL_CATEGORY} in ${CATEGORY_CSV_PATH}`
    );
  }

  return match;
};

const buildBulletsText = (items: string[]) =>
  items.map((item) => `- ${item}`).join("\n");

const buildDescriptionHtml = (provider: ProviderSpec, plan: ProviderPlan) => {
  const paragraphs = [
    ...provider.descriptionLead.map(toSentence),
    toSentence(
      `${plan.title} is the ${provider.vendor} ${plan.planName} plan on the provider's official ${provider.officialSourceLabel} page.`
    ),
    toSentence(
      `The current lowest publicly visible starting price on the official page is ${toPriceString(plan.lowestPrice)} per month-equivalent, and the pricing details are captured in the plans and pricing metafield for review.`
    ),
    toSentence(
      `Key published features for this plan include ${plan.features
        .slice(0, 5)
        .join(", ")
        .replace(/, ([^,]*)$/, ", and $1")}.`
    ),
    ...provider.descriptionSupport.map(toSentence),
    toSentence(
      `This product is suitable for shoppers who want ${provider.platformLabel} with a public feature list, a visible starting price, and a plan structure that is easy to compare against other shared-hosting offers.`
    ),
    toSentence(
      `It is not represented here as VPS, dedicated, reseller, or Windows hosting, because the dataset is intentionally limited to offers that fit the Linux Shared Hosting collection based on the official provider materials reviewed for this task.`
    ),
    toSentence(
      `Where pricing changes by billing term or renews at a different rate, those facts are preserved in the pricing notes rather than hidden inside the description.`
    ),
  ].filter(Boolean);

  const featureItems = plan.features.map((feature) => `<li>${escapeHtml(feature)}</li>`);
  const pricingItems = plan.pricingSummary.map(
    (item) => `<li>${escapeHtml(item)}</li>`
  );

  return [
    ...paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
    "<h3>Included features</h3>",
    `<ul>${featureItems.join("")}</ul>`,
    "<h3>Pricing notes</h3>",
    `<ul>${pricingItems.join("")}</ul>`,
  ].join("");
};

const buildSeoTitle = (provider: ProviderSpec, plan: ProviderPlan) => {
  const title = `${plan.title} | ${provider.brand} Linux Shared Hosting`;
  return title.length <= 70 ? title : title.slice(0, 67).trimEnd() + "...";
};

const buildSeoDescription = (provider: ProviderSpec, plan: ProviderPlan) => {
  const description = `${plan.title} from ${provider.brand} with ${plan.features
    .slice(0, 3)
    .join(", ")}. Lowest advertised price ${toPriceString(plan.lowestPrice)}.`;

  return description.length <= 160
    ? description
    : description.slice(0, 157).trimEnd() + "...";
};

const normalizeFilterValues = (
  filterDefinitions: FilterDefinition[],
  filterValues: Partial<Record<string, string[]>>
) => {
  const normalized: Record<string, string[]> = {};

  filterDefinitions.forEach((definition) => {
    const requestedValues = dedupe(filterValues[definition.key] ?? []);
    if (requestedValues.length === 0) {
      return;
    }

    const invalid = requestedValues.filter(
      (value) => !definition.allowedValues.includes(value)
    );
    if (invalid.length > 0) {
      throw new Error(
        `Invalid values for ${definition.key}: ${invalid.join(", ")}`
      );
    }

    normalized[definition.key] = requestedValues;
  });

  return normalized;
};

const buildProductDataset = async () => {
  const targetCategory = await loadTargetCategory();
  const filterDefinitions = await loadFilterDefinitions();
  const rows: ProductDatasetRow[] = [];
  const handleSet = new Set<string>();
  const titleSet = new Set<string>();

  PROVIDERS.forEach((provider) => {
    provider.plans.forEach((plan) => {
      if (handleSet.has(plan.handle)) {
        throw new Error(`Duplicate handle detected: ${plan.handle}`);
      }
      if (titleSet.has(plan.title)) {
        throw new Error(`Duplicate title detected: ${plan.title}`);
      }

      const bodyHtml = buildDescriptionHtml(provider, plan);
      if (stripHtml(bodyHtml).split(/\s+/).length < 300) {
        throw new Error(`Description too short for ${plan.title}`);
      }

      handleSet.add(plan.handle);
      titleSet.add(plan.title);

      rows.push({
        title: plan.title,
        handle: plan.handle,
        bodyHtml,
        vendor: provider.vendor,
        status: "active",
        published: true,
        price: toPriceString(plan.lowestPrice),
        chargeTax: false,
        requiresShipping: false,
        imageAltText: `${provider.brand} ${plan.planName} Linux shared hosting logo`,
        seoTitle: buildSeoTitle(provider, plan),
        seoDescription: buildSeoDescription(provider, plan),
        existingProductId: plan.existingProductId ?? null,
        collectionHandle: String(targetCategory.collection_handle),
        collectionTitle: String(targetCategory.collection_title),
        sourceUrl: provider.productUrl,
        sourceLabel: provider.officialSourceLabel,
        logoSourceUrl: provider.logoPageUrl,
        logoSourceHint: provider.logoUrlHint ?? "",
        customUrl: provider.productUrl,
        customLogoImage: "",
        customTypeMultiple: [TARGET_FINAL_CATEGORY],
        productFeatures: buildBulletsText(plan.features),
        plansPricing: buildBulletsText(plan.pricingSummary),
        prosCons: buildBulletsText([
          ...plan.factualPros.map((item) => `Pros: ${item}`),
          ...plan.factualCons.map((item) => `Cons: ${item}`),
        ]),
        filterValues: normalizeFilterValues(filterDefinitions, plan.filters),
        verificationNotes: buildBulletsText(plan.verificationNotes),
        confidence: plan.confidence,
        missingFields: ["custom.logo_image"],
      });
    });
  });

  if (rows.length !== 25) {
    throw new Error(`Expected 25 products, found ${rows.length}`);
  }

  return {
    rows,
    filterDefinitions,
  };
};

const buildPreviewCsv = (rows: ProductDatasetRow[]) => {
  const headers = [
    "title",
    "handle",
    "vendor",
    "price",
    "status",
    "published",
    "existing_product_id",
    "collection_handle",
    "source_url",
    "logo_source_url",
    "custom_type_multiple",
    "product_features",
    "plans_pricing",
    "pros_cons",
    "seo_title",
    "seo_description",
    "confidence",
    "verification_notes",
    "missing_fields",
    "filters_json",
  ];

  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      [
        row.title,
        row.handle,
        row.vendor,
        row.price,
        row.status,
        String(row.published),
        row.existingProductId ?? "",
        row.collectionHandle,
        row.sourceUrl,
        row.logoSourceUrl,
        row.customTypeMultiple.join(" | "),
        row.productFeatures,
        row.plansPricing,
        row.prosCons,
        row.seoTitle,
        row.seoDescription,
        row.confidence,
        row.verificationNotes,
        row.missingFields.join(" | "),
        JSON.stringify(row.filterValues),
      ]
        .map(csvEscape)
        .join(",")
    ),
  ];

  return lines.join("\n");
};

const writePreviewArtifacts = async (rows: ProductDatasetRow[]) => {
  await ensureDir(EXPORTS_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(
    EXPORTS_DIR,
    `linux-shared-hosting-preview-${timestamp}.json`
  );
  const csvPath = path.join(
    EXPORTS_DIR,
    `linux-shared-hosting-preview-${timestamp}.csv`
  );
  const reportPath = path.join(
    EXPORTS_DIR,
    `linux-shared-hosting-validation-${timestamp}.json`
  );

  const validation = {
    totalProducts: rows.length,
    duplicateHandles: [],
    duplicateTitles: [],
    productsMissingExistingId: rows
      .filter((row) => !row.existingProductId)
      .map((row) => row.handle),
    productsMissingFields: rows
      .filter((row) => row.missingFields.length > 0)
      .map((row) => ({
        handle: row.handle,
        missingFields: row.missingFields,
      })),
  };

  await Promise.all([
    fs.promises.writeFile(jsonPath, JSON.stringify(rows, null, 2), "utf8"),
    fs.promises.writeFile(csvPath, buildPreviewCsv(rows), "utf8"),
    fs.promises.writeFile(reportPath, JSON.stringify(validation, null, 2), "utf8"),
  ]);

  return {
    jsonPath,
    csvPath,
    reportPath,
    validation,
  };
};

const fetchAllExistingProducts = async () => {
  const { shopifyRest } = await getShopifyClients();
  const products: ShopifyProductRecord[] = [];
  let sinceId = 0;
  let hasMore = true;

  while (hasMore) {
    const response = await shopifyRest.get("/products.json", {
      params: {
        limit: 250,
        since_id: sinceId,
        fields: "id,title,handle,vendor,status",
      },
    });

    const pageProducts = Array.isArray(response.data?.products)
      ? response.data.products
      : [];

    pageProducts.forEach((product: any) => {
      if (typeof product?.id === "number") {
        products.push(product as ShopifyProductRecord);
      }
    });

    hasMore = pageProducts.length === 250;
    sinceId = hasMore ? Number(pageProducts[pageProducts.length - 1].id) : sinceId;
  }

  return products;
};

const fetchProductById = async (productId: number) => {
  const { shopifyRest } = await getShopifyClients();
  const response = await shopifyRest.get(`/products/${productId}.json`);
  return response.data?.product ?? null;
};

const fetchProductByHandle = async (handle: string) => {
  const { shopifyRest } = await getShopifyClients();
  const response = await shopifyRest.get("/products.json", {
    params: {
      handle,
      limit: 1,
    },
  });

  const products = Array.isArray(response.data?.products)
    ? response.data.products
    : [];
  return products[0] ?? null;
};

const fetchPublicationIds = async () => {
  const { shopifyGraphQL } = await getShopifyClients();
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
        errors?: Array<{ message?: string }>;
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

    if (response.data?.errors?.length) {
      throw new Error(JSON.stringify(response.data.errors));
    }

    const connection = response.data?.data?.publications;
    const nodes = Array.isArray(connection?.nodes) ? connection.nodes : [];
    nodes.forEach((node: any) => {
      if (node?.id) {
        publicationIds.push(String(node.id));
      }
    });

    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage);
    cursor = connection?.pageInfo?.endCursor ?? null;
  }

  return dedupe(publicationIds);
};

const publishProduct = async (productId: number) => {
  const { shopifyGraphQL } = await getShopifyClients();
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

const buildMarketplaceFilterReferenceMap = async (
  filterKeys: string[]
): Promise<MarketplaceFilterReferenceMap> => {
  const { shopifyGraphQL } = await getShopifyClients();
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

const setShopifyMetafields = async (
  productId: number,
  row: ProductDatasetRow,
  logoFileUrl: string | null,
  marketplaceFilterReferences: MarketplaceFilterReferenceMap
) => {
  const { shopifyGraphQL } = await getShopifyClients();
  const inputs = [
    {
      namespace: "custom",
      key: "custom",
      type: "url",
      value: row.customUrl,
    },
    ...(logoFileUrl
      ? [
          {
            namespace: "custom",
            key: "logo_image",
            type: "url",
            value: logoFileUrl,
          },
        ]
      : []),
    {
      namespace: "custom",
      key: "type_multiple",
      type: "list.single_line_text_field",
      value: JSON.stringify(row.customTypeMultiple),
    },
    {
      namespace: "custom",
      key: "product_features",
      type: "multi_line_text_field",
      value: row.productFeatures,
    },
    {
      namespace: "custom",
      key: "plans_pricing",
      type: "multi_line_text_field",
      value: row.plansPricing,
    },
    {
      namespace: "custom",
      key: "pros_cons",
      type: "multi_line_text_field",
      value: row.prosCons,
    },
    ...Object.entries(row.filterValues).map(([key, values]) => {
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
          metafields {
            id
            key
          }
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
    throw new Error(`Metafields failed: ${JSON.stringify(errors)}`);
  }
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
      appendUnique(candidates, absoluteUrl(baseUrl, match[1]));
    }
  });

  appendUnique(candidates, absoluteUrl(baseUrl, "/favicon.ico"));
  return candidates;
};

const resolveLogoSourceUrl = async (provider: ProviderSpec) => {
  if (provider.logoUrlHint) {
    return provider.logoUrlHint;
  }

  const response = await axios.get(provider.logoPageUrl, {
    timeout: 30000,
    responseType: "text",
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  const html = String(response.data ?? "");
  const candidates = extractLogoCandidates(provider.logoPageUrl, html);

  for (const candidate of candidates) {
    try {
      const headResponse = await axios.get(candidate, {
        timeout: 30000,
        responseType: "arraybuffer",
        maxRedirects: 5,
        headers: {
          "User-Agent": "Mozilla/5.0",
          Referer: provider.logoPageUrl,
        },
      });
      if (Number(headResponse.status) >= 200 && Number(headResponse.status) < 400) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  throw new Error(`Could not resolve logo source for ${provider.vendor}`);
};

const downloadLogoAsset = async (provider: ProviderSpec) => {
  await ensureDir(LOGO_TEMP_DIR);
  const sourceUrl = await resolveLogoSourceUrl(provider);
  const response = await axios.get<ArrayBuffer>(sourceUrl, {
    timeout: 30000,
    responseType: "arraybuffer",
    maxRedirects: 5,
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: provider.logoPageUrl,
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
  });

  const contentType = String(response.headers["content-type"] ?? "").split(";")[0];
  const urlPath = new URL(sourceUrl).pathname;
  const extensionFromUrl = path.extname(urlPath);
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

  const originalPath = path.join(LOGO_TEMP_DIR, `${slugify(provider.vendor)}${extension}`);
  await fs.promises.writeFile(originalPath, Buffer.from(response.data));

  if ([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico"].includes(extension.toLowerCase())) {
    const outputPath = path.join(LOGO_TEMP_DIR, `${slugify(provider.vendor)}-120.png`);
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
    try {
      await execFileAsync("powershell", ["-Command", psScript], {
        windowsHide: true,
      });
    } catch {
      return {
        sourceUrl,
        filePath: originalPath,
      };
    }
    return {
      sourceUrl,
      filePath: outputPath,
    };
  }

  return {
    sourceUrl,
    filePath: originalPath,
  };
};

const uploadFileToShopify = async (
  localPath: string,
  altText: string
) => {
  const { shopifyGraphQL } = await getShopifyClients();
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

  const stagedErrors = stagedUploadResponse.data?.data?.stagedUploadsCreate?.userErrors ?? [];
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
  const fileId = fileNode?.id ? String(fileNode.id) : null;
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

const upsertProductImage = async (
  productId: number,
  logoFileUrl: string,
  altText: string
) => {
  const { shopifyRest } = await getShopifyClients();
  const product = await fetchProductById(productId);
  const images = Array.isArray(product?.images) ? product.images : [];
  const primaryImage = images[0];

  if (primaryImage?.id) {
    await shopifyRest.put(`/products/${productId}/images/${primaryImage.id}.json`, {
      image: {
        id: primaryImage.id,
        alt: altText,
      },
    });
    return "updated" as const;
  }

  await shopifyRest.post(`/products/${productId}/images.json`, {
    image: {
      src: logoFileUrl,
      alt: altText,
    },
  });
  return "created" as const;
};

const upsertShopifyProduct = async (row: ProductDatasetRow) => {
  const { shopifyRest } = await getShopifyClients();
  const existingProduct =
    (row.existingProductId ? await fetchProductById(row.existingProductId) : null) ??
    (await fetchProductByHandle(row.handle));

  const existingVariant = Array.isArray(existingProduct?.variants)
    ? existingProduct.variants[0]
    : null;

  const payload = {
    product: {
      ...(existingProduct?.id ? { id: existingProduct.id } : {}),
      title: row.title,
      handle: row.handle,
      body_html: row.bodyHtml,
      vendor: row.vendor,
      product_type: TARGET_FINAL_CATEGORY,
      status: row.status,
      published: row.published,
      metafields_global_title_tag: row.seoTitle,
      metafields_global_description_tag: row.seoDescription,
      variants: [
        existingVariant?.id
          ? {
              id: existingVariant.id,
              price: row.price,
              taxable: row.chargeTax,
              requires_shipping: row.requiresShipping,
            }
          : {
              option1: "Default Title",
              price: row.price,
              taxable: row.chargeTax,
              requires_shipping: row.requiresShipping,
            },
      ],
    },
  };

  if (existingProduct?.id) {
    const response = await shopifyRest.put(
      `/products/${existingProduct.id}.json`,
      payload
    );
    return {
      action: "updated" as const,
      productId: Number(response.data?.product?.id ?? existingProduct.id),
    };
  }

  const response = await shopifyRest.post("/products.json", payload);
  return {
    action: "created" as const,
    productId: Number(response.data?.product?.id),
  };
};

const applyDataset = async (rows: ProductDatasetRow[]) => {
  const existingProducts = await fetchAllExistingProducts();
  const marketplaceFilterReferences = await buildMarketplaceFilterReferenceMap(
    dedupe(rows.flatMap((row) => Object.keys(row.filterValues)))
  );
  const duplicateHandles = rows.filter(
    (row) =>
      existingProducts.some(
        (product) =>
          product.handle === row.handle &&
          product.id !== (row.existingProductId ?? product.id)
      )
  );

  if (duplicateHandles.length > 0) {
    throw new Error(
      `Duplicate Shopify handles already exist: ${duplicateHandles
        .map((row) => row.handle)
        .join(", ")}`
    );
  }

  const providerLogoCache = new Map<string, { fileUrl: string; sourceUrl: string }>();
  const results: UploadResult[] = [];

  for (const row of rows) {
    const provider = PROVIDERS.find((item) => item.vendor === row.vendor);
    if (!provider) {
      throw new Error(`Provider not found for ${row.vendor}`);
    }

    try {
      let logo:
        | {
            fileUrl: string;
            sourceUrl: string;
          }
        | null = providerLogoCache.get(provider.vendor) ?? null;
      let logoError: string | null = null;
      if (!logo) {
        try {
          const downloaded = await downloadLogoAsset(provider);
          const fileUrl = await uploadFileToShopify(downloaded.filePath, provider.logoAlt);
          logo = {
            fileUrl,
            sourceUrl: downloaded.sourceUrl,
          };
          providerLogoCache.set(provider.vendor, logo);
        } catch (error) {
          logoError = error instanceof Error ? error.message : String(error);
          logo = null;
        }
      }

      const productResult = await upsertShopifyProduct(row);
      await setShopifyMetafields(
        productResult.productId,
        row,
        logo?.fileUrl ?? null,
        marketplaceFilterReferences
      );
      await publishProduct(productResult.productId);
      const imageAction = logo?.fileUrl
        ? await upsertProductImage(
            productResult.productId,
            logo.fileUrl,
            row.imageAltText
          )
        : ("skipped" as const);

      results.push({
        action: productResult.action,
        handle: row.handle,
        title: row.title,
        shopifyProductId: productResult.productId,
        sourceUrl: row.sourceUrl,
        logoFileUrl: logo?.fileUrl ?? null,
        imageAction,
        missingFields: logo?.fileUrl ? [] : ["custom.logo_image"],
        verificationNotes: logoError
          ? `${row.verificationNotes}\n- Logo not uploaded: ${logoError}`
          : row.verificationNotes,
      });
    } catch (error) {
      results.push({
        action: "skipped",
        handle: row.handle,
        title: row.title,
        shopifyProductId: row.existingProductId,
        sourceUrl: row.sourceUrl,
        logoFileUrl: null,
        imageAction: "skipped",
        missingFields: row.missingFields,
        verificationNotes: row.verificationNotes,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(
    EXPORTS_DIR,
    `linux-shared-hosting-upload-report-${timestamp}.json`
  );
  await fs.promises.writeFile(reportPath, JSON.stringify(results, null, 2), "utf8");

  return {
    reportPath,
    results,
  };
};

const main = async () => {
  const shouldApply = process.argv.includes("--apply");
  const { rows } = await buildProductDataset();
  const preview = await writePreviewArtifacts(rows);

  console.log(`Preview JSON: ${preview.jsonPath}`);
  console.log(`Preview CSV: ${preview.csvPath}`);
  console.log(`Validation report: ${preview.reportPath}`);

  if (!shouldApply) {
    console.log("Dry run complete. Re-run with --apply to upload/update Shopify.");
    return;
  }

  const applied = await applyDataset(rows);
  console.log(`Upload report: ${applied.reportPath}`);
  console.log(
    `Created: ${applied.results.filter((item) => item.action === "created").length}`
  );
  console.log(
    `Updated: ${applied.results.filter((item) => item.action === "updated").length}`
  );
  console.log(
    `Skipped: ${applied.results.filter((item) => item.action === "skipped").length}`
  );
};

main().catch((error) => {
  console.error("Linux shared hosting upsert failed:", error);
  process.exitCode = 1;
});
