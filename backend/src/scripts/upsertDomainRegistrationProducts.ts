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
const LOGO_TEMP_DIR = path.resolve(
  EXPORTS_DIR,
  "tmp-domain-registration-logos"
);
const SHOPIFY_GRAPHQL_PAGE_SIZE = 100;
const TARGET_FINAL_CATEGORY = "Domain Registration";
const TARGET_COLLECTION_HANDLE = "domain-registration";
const TARGET_CATEGORY_SLUG = "cloud-services";
const TARGET_SUBCATEGORY = "Domain & DNS Services";

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

type ProviderSpec = {
  vendor: string;
  brand: string;
  website: string;
  productUrl: string;
  sourceUrls: string[];
  officialSourceLabel: string;
  logoPageUrl: string;
  logoUrlHint?: string;
  logoAlt: string;
  lowestPrice: number;
  pricingSummary: string[];
  features: string[];
  factualPros: string[];
  factualCons: string[];
  verificationNotes: string[];
  confidence: "high" | "medium" | "low";
  descriptionLead: string[];
  descriptionSupport: string[];
  filters: Partial<Record<string, string[]>>;
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
  sourceUrls: string[];
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
  sourceUrls: string[];
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

const PRODUCT_GID = (productId: number) =>
  `gid://shopify/Product/${productId}`;

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

const toPriceString = (price: number) =>
  price.toFixed(2).replace(/\.00$/, "");

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

const isValidUrl = (value: string) => {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const PROVIDERS: ProviderSpec[] = [
  {
    vendor: "Namecheap",
    brand: "Namecheap",
    website: "https://www.namecheap.com/",
    productUrl: "https://www.namecheap.com/domains/registration.aspx",
    sourceUrls: [
      "https://www.namecheap.com/domains/registration.aspx",
      "https://www.namecheap.com/promos/new-com-promo/",
      "https://www.namecheap.com/security/domain-privacy-service/",
      "https://www.namecheap.com/promos/",
    ],
    officialSourceLabel: "Namecheap domain registration pages",
    logoPageUrl: "https://www.namecheap.com/",
    logoAlt: "Namecheap domain registration logo",
    lowestPrice: 6.79,
    pricingSummary: [
      "Starting .COM offer: $6.79 for the first year for new customers.",
      ".COM standard pricing shown in the published table: $11.28 registration, $18.48 renewal, and $11.48 transfer.",
      "Some registrations may include the ICANN mandatory fee where applicable.",
    ],
    features: [
      "Free domain privacy for life on eligible new registrations and transfers",
      "Domain availability search across popular and deal TLDs",
      "Visible registration, renewal, and transfer pricing",
      "Expert help and guidance for setup and domain selection",
      "24/7 live support team",
    ],
    factualPros: [
      "Official sources clearly show first-year, renewal, and transfer pricing for .COM.",
      "Privacy protection is included for life on eligible registrations and transfers.",
    ],
    factualCons: [
      "The headline $6.79 .COM offer is limited to new customers.",
      "An additional ICANN fee may apply on some domains.",
    ],
    verificationNotes: [
      "Pricing verified from Namecheap domain search and .COM promo pages.",
      "Privacy inclusion verified from Namecheap domain privacy service page.",
      "24/7 support verified from Namecheap promos page.",
    ],
    confidence: "high",
    descriptionLead: [
      "Namecheap markets domain registration as an affordable way to secure a brand, project, or business identity online without forcing shoppers into a hosting bundle just to buy a name.",
      "The official domain search pages emphasize transparent promotional pricing, visible renewal and transfer data, and free privacy protection on eligible registrations and transfers.",
      "That makes the service relevant for buyers who want to compare registrar fundamentals such as pricing clarity, privacy, support, and day-one management tools before adding any optional extras.",
    ],
    descriptionSupport: [
      "The reviewed Namecheap pages separate first-year promotional pricing from renewal and transfer pricing instead of leaving those details hidden until checkout.",
      "Namecheap also positions privacy as a standard inclusion for eligible domains rather than an upsell, which is important for customers who want personal contact details shielded from public WHOIS records.",
      "Its published support messaging also makes clear that real people are available 24/7, which helps buyers who expect to manage renewals, transfers, DNS changes, and domain-related issues over time.",
    ],
    filters: {
      pricing_model: ["Subscription"],
      billing_cycle: ["Annual"],
      support_coverage: ["24/7 support"],
    },
  },
  {
    vendor: "GoDaddy",
    brand: "GoDaddy",
    website: "https://www.godaddy.com/",
    productUrl: "https://www.godaddy.com/en/domains",
    sourceUrls: ["https://www.godaddy.com/en/domains"],
    officialSourceLabel: "GoDaddy domain search page",
    logoPageUrl: "https://www.godaddy.com/",
    logoAlt: "GoDaddy domain registration logo",
    lowestPrice: 0.01,
    pricingSummary: [
      "Featured .COM offer: $0.01 for the first year on the promoted plan.",
      "The promoted offer includes GoDaddy Airo and free domain privacy protection.",
      "Some featured low-price offers require a 3-year purchase, with additional years renewing at $24.99.",
    ],
    features: [
      "Free domain privacy protection on the promoted domain offer",
      "AI-powered GoDaddy Airo included on the featured .COM deal",
      "Domain search across multiple TLDs including .com, .co, .net, .org, .shop, and .ai",
      "Clear promotional pricing and offer terms",
    ],
    factualPros: [
      "The official page makes the entry promo and the major conditions visible before checkout.",
      "Free domain privacy is included on the featured offer.",
    ],
    factualCons: [
      "The lowest visible pricing is promotional and new-customer dependent.",
      "Some promotional cards on the same page require multi-year checkout and renew at a higher rate.",
    ],
    verificationNotes: [
      "Pricing and privacy details verified from the official GoDaddy domain search page.",
    ],
    confidence: "high",
    descriptionLead: [
      "GoDaddy presents its domain registration service as a broad, consumer-facing entry point for finding, registering, and managing domain names across mainstream and specialty extensions.",
      "The official domains page puts headline pricing, privacy inclusion, and domain search directly in front of the user, which makes it easy to evaluate the service as a domain-registration product rather than as a hosting bundle.",
      "That is useful for marketplace comparison because customers can quickly assess the registrar on visible registration terms, extension availability, and management-focused benefits.",
    ],
    descriptionSupport: [
      "In the reviewed source, GoDaddy highlights a featured .COM promotion, includes free domain privacy protection in the offer, and surfaces AI-powered Airo as part of the overall domain-buying package.",
      "The page also shows multiple extensions on the same search experience, reinforcing that the product is a general domain-registration service rather than a single-extension specialty listing.",
      "Where the lowest visible price depends on promotional conditions or longer checkout commitments, those conditions are preserved in the pricing notes for this catalog entry instead of being flattened into a generic statement.",
    ],
    filters: {
      pricing_model: ["Subscription"],
      billing_cycle: ["Annual"],
    },
  },
  {
    vendor: "Hostinger",
    brand: "Hostinger",
    website: "https://www.hostinger.com/",
    productUrl: "https://www.hostinger.com/cheap-domain-names",
    sourceUrls: ["https://www.hostinger.com/cheap-domain-names"],
    officialSourceLabel: "Hostinger cheap domain names page",
    logoPageUrl: "https://www.hostinger.com/",
    logoAlt: "Hostinger domain registration logo",
    lowestPrice: 0.01,
    pricingSummary: [
      ".COM is promoted at $0.01 for the first year, with regular pricing shown as $19.99.",
      ".NET is shown at $11.99 and .XYZ at $1.99 in the same pricing panel.",
      "Featured entry prices apply to the first year with a 2-year-or-longer registration term.",
    ],
    features: [
      "Free domain privacy protection on eligible domains",
      "24/7 expert support",
      "Automatic renewals",
      "AI domain generator",
      "Visible multi-TLD pricing",
    ],
    factualPros: [
      "The official page shows both the promo and the regular price for key TLDs.",
      "Support and privacy inclusion are published alongside the registration offer.",
    ],
    factualCons: [
      "The $0.01 headline price requires a two-year-or-longer registration term.",
      "Privacy is limited to eligible domains rather than every possible TLD.",
    ],
    verificationNotes: [
      "Pricing, 24/7 support, auto-renewal, and privacy details verified from Hostinger's cheap domain names page.",
    ],
    confidence: "high",
    descriptionLead: [
      "Hostinger positions domain registration as a low-friction way to claim a name online while still getting access to practical registrar features such as privacy, renewals, and support.",
      "The official page reviewed for this dataset is especially clear because it shows multiple TLD prices on one screen and pairs those prices with the operational features that matter after checkout.",
      "That combination helps shoppers compare Hostinger on both cost and ongoing domain-management convenience rather than on price alone.",
    ],
    descriptionSupport: [
      "The same source also highlights an AI domain generator, automatic renewals, and free domain privacy protection for eligible domains, which are useful signals for first-time buyers and small teams alike.",
      "Hostinger explicitly calls out 24/7 expert support on the domain-registration page, so support is not left as an assumption.",
      "Because the headline .COM deal requires a two-year-or-longer registration period, this catalog entry records that condition directly in the pricing notes instead of treating the visible promo as an unconditional annual price.",
    ],
    filters: {
      pricing_model: ["Subscription"],
      billing_cycle: ["Annual"],
      support_coverage: ["24/7 support"],
    },
  },
  {
    vendor: "IONOS",
    brand: "IONOS",
    website: "https://www.ionos.com/",
    productUrl: "https://www.ionos.com/domains/1-dollar-domains",
    sourceUrls: [
      "https://www.ionos.com/domains/1-dollar-domains",
      "https://www.ionos.com/digitalguide/domains/domain-extensions/what-is-com/",
    ],
    officialSourceLabel: "IONOS domain promotion pages",
    logoPageUrl: "https://www.ionos.com/",
    logoAlt: "IONOS domain registration logo",
    lowestPrice: 1,
    pricingSummary: [
      "Starting promotional offer: $1 domain registration on selected offers.",
      "The promoted offer highlights simple registration, premium TLD access, a 24/7 personal consultant, and free privacy protection for eligible domains.",
      "Pricing depends on the selected extension and the active promotional offer.",
    ],
    features: [
      "Simple registration workflow",
      "Premium TLDs at promoted prices",
      "24/7 personal consultant included",
      "Free privacy protection for eligible domains",
      "Domain-focused promotional landing experience",
    ],
    factualPros: [
      "IONOS publishes both the domain promotion and the included support/privacy benefits.",
      "The service clearly stays within the domain-registration scope on the reviewed sources.",
    ],
    factualCons: [
      "The headline price is promotional rather than a universal ongoing rate across all TLDs.",
      "Privacy is described as available for eligible domains only.",
    ],
    verificationNotes: [
      "Domain pricing and included consultant/privacy details verified from official IONOS sources.",
    ],
    confidence: "high",
    descriptionLead: [
      "IONOS markets domain registration as a standalone entry point for users who want to secure a web address quickly and then manage it with clear support access and registrar tools.",
      "The reviewed official promotion is especially relevant because it places the domain offer, privacy position, and support model together instead of scattering those facts across unrelated pages.",
      "For this marketplace entry, the focus stays strictly on the registrar offer rather than on the provider's hosting, website builder, or other infrastructure products.",
    ],
    descriptionSupport: [
      "IONOS explicitly highlights simple registration, premium TLD pricing, a 24/7 personal consultant, and free privacy protection for eligible domains in the same official source path used for this dataset.",
      "That combination makes the service easier to compare against registrars that separate pricing from operational support or treat privacy as an optional add-on.",
      "Because the most visible price is a promotion-based domain offer, this entry keeps the contextual limitations inside the pricing notes so the catalog remains accurate and reviewable.",
    ],
    filters: {
      pricing_model: ["Subscription"],
      billing_cycle: ["Annual"],
      support_coverage: ["24/7 support"],
    },
  },
  {
    vendor: "DreamHost",
    brand: "DreamHost",
    website: "https://www.dreamhost.com/",
    productUrl: "https://www.dreamhost.com/features/private-registration/",
    sourceUrls: [
      "https://www.dreamhost.com/features/private-registration/",
      "https://www.dreamhost.com/domains/pricing/",
      "https://www.dreamhost.com/domains/com/",
    ],
    officialSourceLabel: "DreamHost domain pricing and privacy pages",
    logoPageUrl: "https://www.dreamhost.com/",
    logoAlt: "DreamHost domain registration logo",
    lowestPrice: 9.99,
    pricingSummary: [
      ".COM domains are promoted at $9.99 for the first year and include free private registration.",
      "Published .COM pricing shows $9.99 registration, $19.99 renewal, and $9.99 transfer.",
      "Pricing varies by extension, but this listing uses the clearly promoted .COM rate.",
    ],
    features: [
      "Free domain privacy protection",
      "24/7/365 chat and email support",
      "DNS management",
      "Domain forwarding",
      "Optional domain locking",
      "Custom nameservers",
    ],
    factualPros: [
      "DreamHost clearly ties free privacy to the promoted .COM offer.",
      "The registrar feature set includes forwarding, DNS management, locking, and always-on support.",
    ],
    factualCons: [
      "Renewal pricing is higher than the first-year .COM price.",
      "Feature and support pages are spread across multiple official DreamHost URLs.",
    ],
    verificationNotes: [
      "DreamHost .COM pricing and included privacy verified from the private registration page.",
      "Register, renew, and transfer pricing verified from the DreamHost domain pricing page.",
      "Domain management features and 24/7 help verified from the DreamHost .COM domain page.",
    ],
    confidence: "high",
    descriptionLead: [
      "DreamHost frames domain registration as a privacy-conscious registrar offer backed by visible domain management features instead of a bare checkout funnel.",
      "The official pages used for this entry are unusually detailed because they cover both the commercial side of registration pricing and the operational side of post-purchase domain management.",
      "That makes DreamHost a useful catalog entry for buyers who care about privacy, forwarding, locking, DNS edits, and access to support after the initial order is complete.",
    ],
    descriptionSupport: [
      "DreamHost explicitly states that its promoted .COM domains include free private registration, and the product-specific .COM page also calls out DNS management, forwarding, custom nameservers, and optional domain locking.",
      "Support is not implied: DreamHost states that help is available 24/7/365 through chat and email, which is especially relevant for renewals, transfers, and DNS troubleshooting.",
      "The first-year .COM rate is clear on the official page, and the corresponding pricing table provides renewal and transfer values that are preserved below for comparison.",
    ],
    filters: {
      pricing_model: ["Subscription"],
      billing_cycle: ["Annual"],
      support_coverage: ["24/7 support"],
    },
  },
  {
    vendor: "Dynadot",
    brand: "Dynadot",
    website: "https://www.dynadot.com/",
    productUrl: "https://www.dynadot.com/domain",
    sourceUrls: [
      "https://www.dynadot.com/domain/org",
      "https://www.dynadot.com/domain/security.html",
      "https://www.dynadot.com/help/question/create-custom-domain-email",
    ],
    officialSourceLabel: "Dynadot domain pages",
    logoPageUrl: "https://www.dynadot.com/",
    logoAlt: "Dynadot domain registration logo",
    lowestPrice: 6.99,
    pricingSummary: [
      ".ORG pricing is shown at $6.99 for registration, $10.50 for renewal, and $10.50 for transfer.",
      "Pricing varies by extension across Dynadot's full domain catalog.",
      "Privacy is available on supported registrations and is free on eligible TLDs.",
    ],
    features: [
      "Free domain privacy on eligible TLDs",
      "Account lock and two-factor authentication",
      "Optional Registry Lock",
      "24/7 support",
      "Free email address or free email forwarding options tied to registered domains",
    ],
    factualPros: [
      "Dynadot publishes a register, renew, and transfer breakdown on the official .ORG domain page.",
      "Security features such as privacy, account lock, and 2FA are documented in official registrar pages.",
    ],
    factualCons: [
      "The clearest price source is a TLD-specific page rather than a single static general registrar page.",
      "Free privacy is limited to eligible TLDs.",
    ],
    verificationNotes: [
      "Price used from Dynadot's official .ORG registration page.",
      "Privacy and account-protection features verified from Dynadot domain security page.",
      "Free email/free forwarding add-ons verified from official Dynadot help content.",
    ],
    confidence: "high",
    descriptionLead: [
      "Dynadot positions domain registration as a registrar-first service with visible pricing, privacy controls, and a set of built-in add-ons that make a domain more usable immediately after purchase.",
      "The official sources reviewed for this entry combine a clear TLD-specific pricing breakdown with security and email-related pages that describe what registered-domain customers can enable inside their account.",
      "That gives this product enough verified detail to stand as a marketplace listing for general domain registration, even though the price reference used here comes from Dynadot's official .ORG page.",
    ],
    descriptionSupport: [
      "Dynadot documents free privacy on eligible TLDs, account lock, two-factor authentication, and optional Registry Lock, which are all directly relevant to domain ownership and registrar choice.",
      "Its official support content also states that each registered or transferred domain can include a free email address or free email forwarding path, which strengthens the core registrar value proposition without turning this listing into an email-hosting product.",
      "Because the official .ORG page provides a full register, renew, and transfer schedule, this entry preserves those values directly instead of substituting third-party summaries or assumptions.",
    ],
    filters: {
      pricing_model: ["Subscription"],
      billing_cycle: ["Annual"],
      support_coverage: ["24/7 support"],
    },
  },
  {
    vendor: "NameSilo",
    brand: "NameSilo",
    website: "https://www.namesilo.com/",
    productUrl: "https://www.namesilo.com/pricing",
    sourceUrls: [
      "https://www.namesilo.com/pricing",
      "https://www.namesilo.com/Support/Domain-Defender",
    ],
    officialSourceLabel: "NameSilo pricing and security pages",
    logoPageUrl: "https://www.namesilo.com/",
    logoAlt: "NameSilo domain registration logo",
    lowestPrice: 2.75,
    pricingSummary: [
      ".US registration is shown at $2.75 in the visible pricing tier.",
      "The visible pricing grid also shows .COM at $17.29 and .ORG at $10.79.",
      "WHOIS privacy, email forwarding, Domain Defender protection, custom WHOIS records, and DNS management are included at no extra cost.",
    ],
    features: [
      "Free WHOIS privacy",
      "Free email forwarding",
      "Free Domain Defender protection",
      "Free custom WHOIS records",
      "Free DNS management",
      "Registry-level lock plus additional Domain Defender protections",
    ],
    factualPros: [
      "The pricing page explicitly lists included no-cost domain add-ons.",
      "NameSilo documents registrar-level security controls for account and domain protection.",
    ],
    factualCons: [
      "The published pricing page is a large dynamic grid that is less focused than a short comparison table.",
      "Visible pricing varies by extension and discount tier, so buyers still need to confirm their exact TLD before checkout.",
    ],
    verificationNotes: [
      "Pricing and included free add-ons verified from NameSilo's official pricing page.",
      "Domain Defender protections verified from NameSilo support documentation.",
    ],
    confidence: "high",
    descriptionLead: [
      "NameSilo presents domain registration as a registrar service that combines visible extension pricing with a bundled set of domain-management and protection features that do not require separate add-on purchases.",
      "That structure is helpful for comparison because the official pricing page does more than list TLD rates: it also states which registrar tools are included at no extra cost.",
      "For a marketplace dataset focused on production-ready domain-registration listings, this gives NameSilo enough verified detail to assess both price and practical day-to-day ownership value.",
    ],
    descriptionSupport: [
      "The reviewed NameSilo pricing page states that WHOIS privacy, email forwarding, Domain Defender protection, custom WHOIS records, and DNS management are always free, which is unusually direct and easy to map into a product listing.",
      "NameSilo's Domain Defender documentation also describes stronger account and change-protection measures, including extra security questions and proactive notifications for domain changes.",
      "Because the pricing grid varies across extensions and discount tiers, this entry keeps the visible TLD-specific rate in the pricing notes and avoids overstating a universal registrar-wide first-year number.",
    ],
    filters: {
      pricing_model: ["Subscription"],
      billing_cycle: ["Annual"],
    },
  },
  {
    vendor: "Porkbun",
    brand: "Porkbun",
    website: "https://porkbun.com/",
    productUrl: "https://porkbun.com/tld/prices",
    sourceUrls: [
      "https://porkbun.com/tld/prices",
      "https://porkbun.com/tld/help",
      "https://porkbun.com/tld/com",
    ],
    officialSourceLabel: "Porkbun domain pricing pages",
    logoPageUrl: "https://porkbun.com/",
    logoAlt: "Porkbun domain registration logo",
    lowestPrice: 1.85,
    pricingSummary: [
      ".US is shown at $1.85 for the first-year sale.",
      "The same pricing list shows .COM from $11.08 and .ORG from $6.88.",
      "A free link in bio site is included with each .COM purchase.",
    ],
    features: [
      "Free WHOIS privacy",
      "Free SSL certificates",
      "URL forwarding",
      "Email forwarding",
      "Cloudflare DNS management",
      "24/7 email support",
    ],
    factualPros: [
      "Porkbun clearly lists multiple free domain-management features in official pages.",
      "The pricing page surfaces both common TLD pricing and sale pricing in one place.",
    ],
    factualCons: [
      "The lowest visible pricing is tied to a sale price on a specific TLD.",
      "Phone support is limited to business hours even though email support is 24/7.",
    ],
    verificationNotes: [
      "Pricing verified from Porkbun's official TLD pricing pages.",
      "Feature set and 24/7 email support verified from Porkbun's feature/help page.",
    ],
    confidence: "high",
    descriptionLead: [
      "Porkbun markets domain registration as a low-friction registrar product with a notable emphasis on free operational extras that are normally purchased separately elsewhere.",
      "The official pages reviewed for this dataset make that positioning easy to verify because they combine visible pricing with a concise list of included features such as privacy, forwarding, SSL, and DNS management.",
      "That matters for product catalog quality because buyers comparing registrars often care as much about bundled domain tools as they do about the headline first-year price.",
    ],
    descriptionSupport: [
      "Porkbun's official materials state that WHOIS privacy, SSL certificates, URL forwarding, email forwarding, and Cloudflare DNS management are included with every Porkbun domain, which keeps the focus squarely on the registrar offer.",
      "The support information is also unusually specific: Porkbun lists USA-based phone support hours and separately states that email support is available 24/7.",
      "Where the lowest visible price depends on a sale-priced TLD, that context is preserved below instead of being treated as a permanent registrar-wide base price.",
    ],
    filters: {
      pricing_model: ["Subscription"],
      billing_cycle: ["Annual"],
      support_coverage: ["24/7 support"],
    },
  },
  {
    vendor: "Domain.com",
    brand: "Domain.com",
    website: "https://www.domain.com/",
    productUrl: "https://www.domain.com/",
    sourceUrls: [
      "https://www.domain.com/",
      "https://www.domain.com/domains/whois-privacy",
      "https://www.domain.com/ai-domain-generator",
    ],
    officialSourceLabel: "Domain.com domain pages",
    logoPageUrl: "https://www.domain.com/",
    logoAlt: "Domain.com domain registration logo",
    lowestPrice: 5,
    pricingSummary: [
      ".COM, .NET, .ORG, and .INFO are promoted at $5 for the first year.",
      "Additional offers start as low as $0.99 for selected first-year registrations.",
      "Domain transfer is promoted at $10.99 and includes a free 1-year extension.",
    ],
    features: [
      "One month free of hosting and privacy protection on the featured domain offer",
      "Free AI tools with every domain",
      "Personalized coming soon page",
      "Streamlined link in bio page",
      "400+ domain extensions",
      "WHOIS privacy and protection options",
    ],
    factualPros: [
      "Domain.com publishes a clear first-year domain promotion for several mainstream TLDs.",
      "The official site also outlines AI tools and privacy/protection features tied to domain ownership.",
    ],
    factualCons: [
      "The most prominent pricing is promotional and limited to new accounts.",
      "WHOIS privacy protection is also sold as a standalone paid protection plan outside the promo bundle.",
    ],
    verificationNotes: [
      "Domain pricing and AI tools verified from the official Domain.com homepage.",
      "Privacy and protection details verified from Domain.com's WHOIS privacy page.",
      "Transfer pricing verified from Domain.com's transfer page.",
    ],
    confidence: "high",
    descriptionLead: [
      "Domain.com positions domain registration as the foundation of a broader online-presence stack, but the reviewed materials still provide enough registrar-specific information to treat the service as a standalone domain-registration product.",
      "The homepage surfaces first-year pricing for mainstream extensions, highlights AI-powered launch tools, and frames the domain purchase as the first step toward identity, protection, and online presence.",
      "That combination makes Domain.com suitable for a marketplace listing focused on domain registration rather than on full-site infrastructure.",
    ],
    descriptionSupport: [
      "Domain.com's official pages go beyond a simple domain search box by calling out free AI tools, a personalized coming soon page, a link in bio page, and 400-plus available extensions tied to the domain-registration experience.",
      "The privacy side is also documented directly, with a separate WHOIS privacy and domain protection page that explains how personal contact details can be shielded and how alerts and monitoring support ongoing domain safety.",
      "Because the most visible domain pricing is promotional and tied to new-account conditions, those constraints remain in the pricing notes for review instead of being hidden behind a generic price label.",
    ],
    filters: {
      pricing_model: ["Subscription"],
      billing_cycle: ["Annual"],
    },
  },
  {
    vendor: "Cloudflare",
    brand: "Cloudflare",
    website: "https://www.cloudflare.com/",
    productUrl: "https://www.cloudflare.com/products/registrar/",
    sourceUrls: [
      "https://www.cloudflare.com/products/registrar/",
      "https://www.cloudflare.com/plans/",
    ],
    officialSourceLabel: "Cloudflare Registrar pages",
    logoPageUrl: "https://www.cloudflare.com/",
    logoAlt: "Cloudflare Registrar logo",
    lowestPrice: 7.85,
    pricingSummary: [
      "Starting price shown for Cloudflare Registrar: $7.85.",
      "Registration and renewal are positioned as at-cost with no registrar markup.",
      "Pricing is based on the registry fee for the selected extension without added registration or renewal markups.",
    ],
    features: [
      "Transparent no-markup registration and renewal pricing",
      "Support for over 390 TLDs",
      "Free DNS",
      "Free CDN",
      "Free SSL",
      "Domain registration, transfer, consolidation, and management in one service",
    ],
    factualPros: [
      "Cloudflare explicitly markets the product as at-cost registration and renewal with no markup.",
      "The official product page clearly lists included security and performance benefits.",
    ],
    factualCons: [
      "The publicly visible starting price comes from Cloudflare's pricing page rather than a TLD-by-TLD table on the product page.",
      "The service is geared toward domain portfolio management and Cloudflare platform usage, which may be more technical than consumer-first registrars.",
    ],
    verificationNotes: [
      "Cloudflare Registrar product details verified from the official product page.",
      "The starting price of $7.85 verified from Cloudflare's official plans page.",
    ],
    confidence: "high",
    descriptionLead: [
      "Cloudflare Registrar is positioned differently from many consumer registrars because the official message emphasizes at-cost registration, no-markup renewals, and deep integration with Cloudflare's existing DNS, CDN, and SSL services.",
      "That makes it especially relevant for users who treat a domain as part of a broader infrastructure or performance stack instead of as a simple checkout add-on.",
      "Even so, the product still fits this collection cleanly because the reviewed official sources describe registration, renewal, transfer, and domain-management functions in registrar-specific terms.",
    ],
    descriptionSupport: [
      "Cloudflare states that Registrar eliminates surprise fees and unnecessary add-ons, and that customers only pay the underlying registration and renewal fees charged by the registry.",
      "The product page also highlights support for more than 390 TLDs along with built-in backend security through free DNS, free CDN, and free SSL, which is a meaningful differentiator in a domain-registration comparison set.",
      "Because the published starting price comes from Cloudflare's separate pricing page rather than the feature page itself, both official URLs are preserved in the source list for verification.",
    ],
    filters: {
      pricing_model: ["Subscription"],
      billing_cycle: ["Annual"],
    },
  },
];

const loadFilterDefinitions = async () => {
  const rows = await readCsv(FILTERS_CSV_PATH);
  return rows
    .filter(
      (row) =>
        row.category_slug === TARGET_CATEGORY_SLUG &&
        row.namespace === "marketplace"
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

const stripTrailingPunctuation = (value: string) =>
  value.trim().replace(/[.:\s]+$/g, "");

const toTitleSentence = (value: string) => {
  const trimmed = stripTrailingPunctuation(value);
  if (!trimmed) {
    return "";
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

const toReadableList = (items: string[]) => {
  const cleaned = items
    .map((item) => stripTrailingPunctuation(item))
    .filter(Boolean);

  if (cleaned.length === 0) {
    return "";
  }
  if (cleaned.length === 1) {
    return cleaned[0];
  }
  if (cleaned.length === 2) {
    return `${cleaned[0]} and ${cleaned[1]}`;
  }

  return `${cleaned.slice(0, -1).join(", ")}, and ${cleaned[cleaned.length - 1]}`;
};

const buildProfessionalPros = (provider: ProviderSpec) =>
  provider.features
    .slice(0, 2)
    .map((feature) => toTitleSentence(feature));

const buildProfessionalCons = (provider: ProviderSpec) =>
  provider.factualCons.map((item) => {
    const replacements: Array<[RegExp, string]> = [
      [
        /^Feature and support pages are spread across multiple official DreamHost URLs\.?$/i,
        "Pricing, privacy, and management details may require checking separate pages.",
      ],
      [
        /^The clearest price source is a TLD-specific page rather than a single static general registrar page\.?$/i,
        "Visible starting price depends on the specific extension used for comparison.",
      ],
      [
        /^The published pricing page is a large dynamic grid that is less focused than a short comparison table\.?$/i,
        "Pricing is presented in a large extension grid, so comparison takes more effort.",
      ],
      [
        /^The service clearly stays within the domain-registration scope on the reviewed sources\.?$/i,
        "The service is focused on domain registration rather than a broad bundled platform.",
      ],
      [
        /^The most prominent pricing is promotional and limited to new accounts\.?$/i,
        "The headline rate is promotional and may not apply to every buyer.",
      ],
    ];

    let output = item.trim();
    replacements.forEach(([pattern, replacement]) => {
      output = output.replace(pattern, replacement);
    });
    return toTitleSentence(output);
  });

const buildDescriptionHtml = (provider: ProviderSpec) => {
  const featureExcerpt = toReadableList(provider.features.slice(0, 5));
  const strengths = toReadableList(buildProfessionalPros(provider));
  const considerations = toReadableList(buildProfessionalCons(provider).slice(0, 2));

  const paragraphs = [
    toSentence(
      `${provider.brand} Domain Registration is designed for individuals, startups, and businesses that want to secure and manage domain names through a single registrar account.`
    ),
    toSentence(
      `The service supports the core tasks buyers expect from a registrar, including domain search, registration, renewal, transfers, DNS or account management, and extension selection across a broader catalog of TLDs.`
    ),
    toSentence(
      `Current entry pricing starts at $${toPriceString(
        provider.lowestPrice
      )}, with exact costs varying by extension, promotional eligibility, and renewal terms.`
    ),
    toSentence(
      `${provider.brand} includes key capabilities such as ${featureExcerpt}, making it suitable for buyers who want a balance of registration convenience, domain control, and ongoing account management.`
    ),
    toSentence(
      `This registrar is a practical fit for projects that need a clean path from domain purchase to ownership management, especially when privacy, transfer handling, or support availability are important buying factors.`
    ),
    toSentence(
      `For most buyers, the main decision points are first-year pricing, renewal pricing, transfer costs, privacy availability, domain-management tools, and how clearly the registrar presents those terms before checkout.`
    ),
    toSentence(
      `A strong domain registration service should make it easy to register a name, renew it on time, transfer it when needed, manage DNS settings, and keep ownership details and account access under control over the full life of the domain.`
    ),
    toSentence(
      `${provider.brand} is most useful when you want a registrar that can support both the initial purchase and the longer-term operational side of domain ownership without adding unnecessary complexity.`
    ),
    toSentence(
      `Notable strengths include ${strengths}, while buyers should still review renewal pricing, extension-specific policies, and offer conditions before checkout.`
    ),
    toSentence(
      `Important considerations include ${considerations || "variation in pricing and terms between different extensions and offers"}.`
    ),
    toSentence(
      `Because registration terms can vary between standard TLDs, country-code domains, transfers, and promotional offers, it is best to confirm the exact extension-specific price and renewal policy that matches your intended domain before placing an order.`
    ),
  ].filter(Boolean);

  const featureItems = provider.features.map(
    (feature) => `<li>${escapeHtml(feature)}</li>`
  );
  const pricingItems = provider.pricingSummary.map(
    (item) => `<li>${escapeHtml(item)}</li>`
  );
  const prosConsItems = [
    ...buildProfessionalPros(provider).map((item) => `Pro: ${item}`),
    ...buildProfessionalCons(provider).map((item) => `Con: ${item}`),
  ].map((item) => `<li>${escapeHtml(item)}</li>`);

  return [
    ...paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
    "<h3>Included features</h3>",
    `<ul>${featureItems.join("")}</ul>`,
    "<h3>Pricing notes</h3>",
    `<ul>${pricingItems.join("")}</ul>`,
    "<h3>Factual considerations</h3>",
    `<ul>${prosConsItems.join("")}</ul>`,
  ].join("");
};

const buildSeoTitle = (provider: ProviderSpec) => {
  const title = `${provider.brand} Domain Registration | Official Pricing Review`;
  return title.length <= 70 ? title : title.slice(0, 67).trimEnd() + "...";
};

const buildSeoDescription = (provider: ProviderSpec) => {
  const description = `${provider.brand} domain registration with ${provider.features
    .slice(0, 2)
    .join(", ")
    .toLowerCase()}, and official pricing from $${toPriceString(
    provider.lowestPrice
  )}.`;

  return description.length <= 160
    ? description
    : description.slice(0, 157).trimEnd() + "...";
};

const normalizeFilterValues = (
  filterDefinitions: FilterDefinition[],
  filterValues: Partial<Record<string, string[]>>
) => {
  const definitionsByKey = new Map(
    filterDefinitions.map((definition) => [definition.key, definition])
  );
  const normalized: Record<string, string[]> = {};

  Object.entries(filterValues).forEach(([key, values]) => {
    const definition = definitionsByKey.get(key);
    if (!definition) {
      throw new Error(`Missing filter definition for ${key}`);
    }

    const requestedValues = dedupe(values ?? []);
    if (requestedValues.length === 0) {
      return;
    }

    const invalid = requestedValues.filter(
      (value) => !definition.allowedValues.includes(value)
    );
    if (invalid.length > 0) {
      throw new Error(`Invalid values for ${key}: ${invalid.join(", ")}`);
    }

    normalized[key] = requestedValues;
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
    const title = `${provider.brand} Domain Registration`;
    const handle = `${slugify(provider.brand)}-domain-registration`;

    if (handleSet.has(handle)) {
      throw new Error(`Duplicate handle detected: ${handle}`);
    }
    if (titleSet.has(title)) {
      throw new Error(`Duplicate title detected: ${title}`);
    }

    const bodyHtml = buildDescriptionHtml(provider);
    if (stripHtml(bodyHtml).split(/\s+/).length < 300) {
      throw new Error(`Description too short for ${title}`);
    }

    const urlsToValidate = [
      provider.website,
      provider.productUrl,
      provider.logoPageUrl,
      ...provider.sourceUrls,
    ];
    const invalidUrl = urlsToValidate.find((url) => !isValidUrl(url));
    if (invalidUrl) {
      throw new Error(`Invalid URL detected for ${provider.brand}: ${invalidUrl}`);
    }

    handleSet.add(handle);
    titleSet.add(title);

    rows.push({
      title,
      handle,
      bodyHtml,
      vendor: provider.vendor,
      status: "active",
      published: true,
      price: toPriceString(provider.lowestPrice),
      chargeTax: false,
      requiresShipping: false,
      imageAltText: `${provider.brand} domain registration logo`,
      seoTitle: buildSeoTitle(provider),
      seoDescription: buildSeoDescription(provider),
      existingProductId: null,
      collectionHandle: String(targetCategory.collection_handle),
      collectionTitle: String(targetCategory.collection_title),
      sourceUrl: provider.productUrl,
      sourceUrls: dedupe([provider.productUrl, ...provider.sourceUrls]),
      sourceLabel: provider.officialSourceLabel,
      logoSourceUrl: provider.logoPageUrl,
      logoSourceHint: provider.logoUrlHint ?? "",
      customUrl: provider.productUrl,
      customLogoImage: "",
      customTypeMultiple: [TARGET_FINAL_CATEGORY],
      productFeatures: buildBulletsText(provider.features),
      plansPricing: buildBulletsText(provider.pricingSummary),
      prosCons: buildBulletsText([
        ...buildProfessionalPros(provider).map((item) => `Pros: ${item}`),
        ...buildProfessionalCons(provider).map((item) => `Cons: ${item}`),
      ]),
      filterValues: normalizeFilterValues(filterDefinitions, provider.filters),
      verificationNotes: buildBulletsText(provider.verificationNotes),
      confidence: provider.confidence,
      missingFields: ["custom.logo_image"],
    });
  });

  if (rows.length < 10) {
    throw new Error(`Expected at least 10 products, found ${rows.length}`);
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
    "source_urls_json",
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
        JSON.stringify(row.sourceUrls),
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
    `domain-registration-preview-${timestamp}.json`
  );
  const csvPath = path.join(
    EXPORTS_DIR,
    `domain-registration-preview-${timestamp}.csv`
  );
  const reportPath = path.join(
    EXPORTS_DIR,
    `domain-registration-validation-${timestamp}.json`
  );

  const duplicateHandles = rows
    .map((row) => row.handle)
    .filter((handle, index, values) => values.indexOf(handle) !== index);
  const duplicateTitles = rows
    .map((row) => row.title)
    .filter((title, index, values) => values.indexOf(title) !== index);

  const validation = {
    totalProducts: rows.length,
    duplicateHandles: dedupe(duplicateHandles),
    duplicateTitles: dedupe(duplicateTitles),
    productsMissingExistingId: rows
      .filter((row) => !row.existingProductId)
      .map((row) => row.handle),
    productsMissingFields: rows
      .filter((row) => row.missingFields.length > 0)
      .map((row) => ({
        handle: row.handle,
        missingFields: row.missingFields,
      })),
    invalidPriceRows: rows
      .filter((row) => !/^\d+(\.\d+)?$/.test(row.price))
      .map((row) => row.handle),
    invalidUrlRows: rows
      .filter(
        (row) =>
          !isValidUrl(row.sourceUrl) ||
          !isValidUrl(row.customUrl) ||
          row.sourceUrls.some((url) => !isValidUrl(url))
      )
      .map((row) => row.handle),
    statusCheck: rows.every((row) => row.status === "active"),
    publishCheck: rows.every((row) => row.published === true),
    taxCheck: rows.every((row) => row.chargeTax === false),
    shippingCheck: rows.every((row) => row.requiresShipping === false),
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
    sinceId = hasMore
      ? Number(pageProducts[pageProducts.length - 1].id)
      : sinceId;
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
  if (filterKeys.length === 0) {
    return {};
  }

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
      metaobjectDefinitionResponse.data?.data?.metaobjectDefinition?.type ??
      null;
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
      if (
        Number(headResponse.status) >= 200 &&
        Number(headResponse.status) < 400
      ) {
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
      Accept:
        "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
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

  const originalPath = path.join(
    LOGO_TEMP_DIR,
    `${slugify(provider.vendor)}${extension}`
  );
  await fs.promises.writeFile(originalPath, Buffer.from(response.data));

  if (
    [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico"].includes(
      extension.toLowerCase()
    )
  ) {
    const outputPath = path.join(
      LOGO_TEMP_DIR,
      `${slugify(provider.vendor)}-120.png`
    );
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

const uploadFileToShopify = async (localPath: string, altText: string) => {
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

  const stagedErrors =
    stagedUploadResponse.data?.data?.stagedUploadsCreate?.userErrors ?? [];
  if (stagedErrors.length > 0) {
    throw new Error(`Staged upload failed: ${JSON.stringify(stagedErrors)}`);
  }

  const target =
    stagedUploadResponse.data?.data?.stagedUploadsCreate?.stagedTargets?.[0];
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
  const duplicateHandles = rows.filter((row) => {
    const matches = existingProducts.filter(
      (product) => product.handle === row.handle
    );
    return matches.length > 1;
  });

  if (duplicateHandles.length > 0) {
    throw new Error(
      `Duplicate Shopify handles already exist: ${duplicateHandles
        .map((row) => row.handle)
        .join(", ")}`
    );
  }

  const providerLogoCache = new Map<
    string,
    {
      fileUrl: string;
      sourceUrl: string;
    }
  >();
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
          const fileUrl = await uploadFileToShopify(
            downloaded.filePath,
            provider.logoAlt
          );
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
        sourceUrls: row.sourceUrls,
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
        sourceUrls: row.sourceUrls,
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
    `domain-registration-upload-report-${timestamp}.json`
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
  console.error("Domain registration upsert failed:", error);
  process.exitCode = 1;
});
