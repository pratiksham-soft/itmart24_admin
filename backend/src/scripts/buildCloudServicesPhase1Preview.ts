import fs from "fs";
import path from "path";
import csv from "csv-parser";

const EXPORTS_DIR = path.resolve(__dirname, "../../exports");
const CATEGORY_CSV_PATH = path.resolve(
  __dirname,
  "../../imports/category-collections.csv"
);
const FILTERS_CSV_PATH = path.resolve(
  __dirname,
  "../../doc/shopify-filter-definitions.csv"
);

type CsvRow = Record<string, string>;

type FilterDefinition = {
  profileId: string;
  key: string;
  allowedValues: string[];
};

type ProductSpec = {
  title: string;
  handle: string;
  vendor: string;
  officialUrl: string;
  sourceUrls: string[];
  sourceLabel: string;
  logoSourceUrl: string;
  startingPrice: number;
  pricingModel: "Subscription" | "Usage-based" | "One-time purchase";
  billingCycle?: "Monthly" | "Annual" | "Usage-based";
  summary: string;
  bestFor: string;
  fitNarrative: string;
  featureList: string[];
  pricingBullets: string[];
  factualPros: string[];
  factualCons: string[];
  collections: string[];
  filters: Record<string, string[]>;
  confidence: "high" | "medium";
  verificationNotes: string[];
};

type PreviewRow = {
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
  collectionHandles: string[];
  collectionTitles: string[];
  sourceUrl: string;
  sourceUrls: string[];
  sourceLabel: string;
  logoSourceUrl: string;
  customUrl: string;
  customLogoImage: string;
  customTypeMultiple: string[];
  productFeatures: string;
  plansPricing: string;
  prosCons: string;
  filterValues: Record<string, string[]>;
  verificationNotes: string;
  confidence: "high" | "medium";
  missingFields: string[];
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

const ensureDir = async (dirPath: string) => {
  await fs.promises.mkdir(dirPath, { recursive: true });
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const stripHtml = (value: string) =>
  value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const wordCount = (value: string) =>
  stripHtml(value)
    .split(/\s+/)
    .filter(Boolean).length;

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

const splitAllowedValues = (value: string) =>
  value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

const toPriceString = (price: number) => price.toFixed(2).replace(/\.00$/, "");

const buildBodyHtml = (spec: ProductSpec) => {
  const paragraphs = [
    `${spec.title} is a cloud services listing for buyers who want a clear starting point on ${spec.collections.join(", ")} without having to piece together separate product pages and pricing tables. ${spec.summary}`,
    `${spec.bestFor} ${spec.fitNarrative} The service is mapped only to the collections where the underlying offer is a direct and defensible fit.`,
    `${spec.title} includes ${spec.featureList
      .slice(0, 4)
      .join(", ")}. ${spec.featureList.length > 4 ? `It also includes ${spec.featureList.slice(4).join(", ")}.` : ""} This combination makes the product useful for customers comparing practical operations, deployment model, and day-to-day administration rather than shopping on brand name alone.`,
    `Pricing starts at ${toPriceString(spec.startingPrice)}. ${spec.pricingBullets.join(" ")} This listing uses the lowest clearly visible price from the official source and keeps the full pricing notes concise so shoppers can understand the cost structure before they click through.`,
    `From a marketplace perspective, the strongest advantages are ${spec.factualPros.join(", ")}. The main trade-offs to keep in mind are ${spec.factualCons.join(", ")}. Those trade-offs are included so the listing stays balanced and useful for comparison instead of reading like unqualified sales copy.`,
    `${spec.vendor} positions this offer for ${spec.collections.join(", ")} workflows where reliability, administration effort, and predictable pricing matter. Buyers who need an exact architecture match, a broader enterprise contract, or region-specific terms should still review the provider page before purchase, but the plan details captured here are strong enough to support a production-ready catalog entry.`,
  ];

  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n");
};

const buildSeoTitle = (spec: ProductSpec) =>
  `${spec.title} | ${spec.vendor} ${spec.collections[0]}`;

const buildSeoDescription = (spec: ProductSpec) => {
  const text = `${spec.title} by ${spec.vendor} with pricing from ${toPriceString(
    spec.startingPrice
  )}. Best for ${spec.collections.slice(0, 2).join(" and ").toLowerCase()}.`;
  return text.length <= 160 ? text : `${text.slice(0, 157)}...`;
};

const buildFeaturesText = (spec: ProductSpec) =>
  spec.featureList.map((item) => `- ${item}`).join("\n");

const buildPlansPricingText = (spec: ProductSpec) =>
  spec.pricingBullets.map((item) => `- ${item}`).join("\n");

const buildProsConsText = (spec: ProductSpec) => {
  const pros = spec.factualPros.map((item) => `- Pro: ${item}`);
  const cons = spec.factualCons.map((item) => `- Con: ${item}`);
  return [...pros, ...cons].join("\n");
};

const latestZeroCollectionsCsvPath = () => {
  const files = fs
    .readdirSync(EXPORTS_DIR)
    .filter(
      (fileName) =>
        fileName.startsWith("zero-product-collections-") &&
        fileName.endsWith(".csv") &&
        !fileName.includes("-summary-") &&
        !fileName.includes("-ai-tools-") &&
        !fileName.includes("-cloud-services-") &&
        !fileName.includes("-software-")
    )
    .map((fileName) => ({
      fileName,
      fullPath: path.join(EXPORTS_DIR, fileName),
      mtimeMs: fs.statSync(path.join(EXPORTS_DIR, fileName)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (files.length === 0) {
    throw new Error("No zero-product-collections export found in backend/exports");
  }

  return files[0].fullPath;
};

const FILTER_KEYS_WITH_SHARED_VALUES = new Set([
  "pricing_model",
  "price_band",
  "billing_cycle",
  "support_coverage",
  "target_segment",
  "security_compliance",
  "server_region",
  "hosting_type",
]);

const PRODUCT_SPECS: ProductSpec[] = [
  {
    title: "Google Workspace Business Starter",
    handle: "google-workspace-business-starter",
    vendor: "Google Workspace",
    officialUrl: "https://workspace.google.com/pricing",
    sourceUrls: [
      "https://workspace.google.com/pricing",
      "https://workspace.google.com/intl/en/pricing/",
    ],
    sourceLabel: "Google Workspace pricing",
    logoSourceUrl: "https://workspace.google.com/",
    startingPrice: 7,
    pricingModel: "Subscription",
    billingCycle: "Monthly",
    summary:
      "The Business Starter tier focuses on professional email, lightweight collaboration, and entry-level administration for organizations that want Google-hosted productivity tools with a custom domain.",
    bestFor:
      "It is best for small teams, founders, and service businesses that need branded email, shared calendar access, and collaboration tools without moving straight to a larger suite.",
    fitNarrative:
      "It is a strong match for Business Email Hosting and Google Workspace Hosting because the plan is the base commercial edition with custom business email, pooled storage, and Google's standard management controls.",
    featureList: [
      "Secure custom business email on your own domain",
      "30 GB pooled storage per user",
      "Gemini AI assistant in Gmail",
      "Chat with AI in the Gemini app",
      "100 participant Google Meet meetings",
      "Security and management controls",
      "Standard support",
    ],
    pricingBullets: [
      "Starts at $7 per user per month with a one-year commitment.",
      "Google also shows $8.40 per user per month when billed monthly.",
      "A 14-day free trial is available on the pricing page.",
    ],
    factualPros: [
      "clearly published entry pricing",
      "custom business email is included",
      "storage and meeting limits are easy to understand",
    ],
    factualCons: [
      "30 GB pooled storage is modest for heavier teams",
      "the plan is limited to 300 users",
      "advanced compliance and archive features are reserved for higher tiers",
    ],
    collections: ["Business Email Hosting", "Google Workspace Hosting"],
    filters: {
      pricing_model: ["Subscription"],
      price_band: ["Under $10/month"],
      billing_cycle: ["Monthly", "Annual"],
      target_segment: ["Small business"],
    },
    confidence: "high",
    verificationNotes: [
      "Pricing and plan highlights verified from Google Workspace pricing pages on 2026-04-12.",
      "Logo upload has not been completed yet for the preview artifact.",
    ],
  },
  {
    title: "Google Workspace Business Standard",
    handle: "google-workspace-business-standard",
    vendor: "Google Workspace",
    officialUrl: "https://workspace.google.com/pricing",
    sourceUrls: [
      "https://workspace.google.com/pricing",
      "https://workspace.google.com/intl/en/pricing/",
    ],
    sourceLabel: "Google Workspace pricing",
    logoSourceUrl: "https://workspace.google.com/",
    startingPrice: 14,
    pricingModel: "Subscription",
    billingCycle: "Monthly",
    summary:
      "Business Standard expands the Google Workspace stack with larger pooled storage, richer meeting features, and stronger collaboration tooling while keeping the same custom email foundation.",
    bestFor:
      "It is best for growing teams that need business email hosting plus more storage, appointment scheduling, recording, and broader collaboration support.",
    fitNarrative:
      "It fits Google Workspace Hosting, Business Email Hosting, and Enterprise Email Solutions because it pairs domain email with a deeper productivity bundle and higher operating limits than the starter tier.",
    featureList: [
      "Secure custom business email",
      "2 TB pooled storage per user",
      "Gemini AI assistant across Gmail, Docs, Meet, and more",
      "NotebookLM with expanded access",
      "150 participant video meetings with recording",
      "Appointment booking pages",
      "eSignature support in Docs and PDFs",
      "Google Workspace Migrate tool for data migration",
    ],
    pricingBullets: [
      "Starts at $14 per user per month with a one-year commitment.",
      "Google also shows $16.80 per user per month when billed monthly.",
      "The plan remains capped at 300 users before buyers need an enterprise edition.",
    ],
    factualPros: [
      "larger storage allocation than Starter",
      "migration and meeting-recording features are built in",
      "the suite is still priced in a mid-market range",
    ],
    factualCons: [
      "annual pricing is notably lower than monthly billing",
      "enterprise governance controls still sit above this tier",
      "per-user costs rise quickly for larger teams",
    ],
    collections: [
      "Business Email Hosting",
      "Enterprise Email Solutions",
      "Google Workspace Hosting",
    ],
    filters: {
      pricing_model: ["Subscription"],
      price_band: ["$10-$50/month"],
      billing_cycle: ["Monthly", "Annual"],
      target_segment: ["Small business", "Mid-market"],
    },
    confidence: "high",
    verificationNotes: [
      "Pricing and plan highlights verified from Google Workspace pricing pages on 2026-04-12.",
      "Logo upload has not been completed yet for the preview artifact.",
    ],
  },
  {
    title: "Microsoft 365 Business Basic",
    handle: "microsoft-365-business-basic",
    vendor: "Microsoft 365",
    officialUrl:
      "https://www.microsoft.com/en-us/microsoft-365/business/microsoft-365-plans-and-pricing",
    sourceUrls: [
      "https://www.microsoft.com/en-us/microsoft-365/business/microsoft-365-plans-and-pricing",
      "https://www.microsoft.com/microsoft-365/microsoft-365-business",
    ],
    sourceLabel: "Microsoft 365 business pricing",
    logoSourceUrl: "https://www.microsoft.com/microsoft-365",
    startingPrice: 6,
    pricingModel: "Subscription",
    billingCycle: "Annual",
    summary:
      "Microsoft 365 Business Basic is the lower-cost commercial Microsoft email and collaboration plan for teams that want Exchange-backed mailboxes, Teams meetings, and OneDrive storage without desktop Office apps.",
    bestFor:
      "It is best for small businesses that need business-grade email, calendaring, cloud storage, and Microsoft collaboration without paying for the full desktop suite.",
    fitNarrative:
      "It is a direct fit for Business Email Hosting and Microsoft 365 Hosting because custom email, Exchange, Teams, and OneDrive are the core reasons buyers shop in those collections.",
    featureList: [
      "Custom business email",
      "Identity and access management for up to 300 users",
      "Web and mobile versions of Word, Excel, PowerPoint, and Outlook",
      "Microsoft Teams meetings and chat",
      "1 TB of cloud storage per user",
      "10+ additional business apps",
      "Automatic spam and malware filtering",
      "Anytime phone and web support",
    ],
    pricingBullets: [
      "Starts at $6.00 per user per month when paid yearly.",
      "Microsoft also lists a no-Teams annual option at $4.40 per user per month.",
      "The pricing page positions the plan for organizations with up to 300 employees.",
    ],
    factualPros: [
      "strong business email foundation at a low entry price",
      "1 TB storage per user is generous for the tier",
      "support and anti-malware filtering are included",
    ],
    factualCons: [
      "desktop Office apps are not part of the standard plan",
      "advanced security controls require higher tiers",
      "the listed low price depends on annual billing",
    ],
    collections: ["Business Email Hosting", "Microsoft 365 Hosting"],
    filters: {
      pricing_model: ["Subscription"],
      price_band: ["Under $10/month"],
      billing_cycle: ["Annual"],
      support_coverage: ["24/7 support"],
      target_segment: ["Small business"],
    },
    confidence: "high",
    verificationNotes: [
      "Pricing and plan highlights verified from Microsoft 365 pricing pages on 2026-04-12.",
      "Logo upload has not been completed yet for the preview artifact.",
    ],
  },
  {
    title: "Microsoft 365 Business Standard",
    handle: "microsoft-365-business-standard",
    vendor: "Microsoft 365",
    officialUrl:
      "https://www.microsoft.com/en-us/microsoft-365/business/microsoft-365-plans-and-pricing",
    sourceUrls: [
      "https://www.microsoft.com/en-us/microsoft-365/business/microsoft-365-plans-and-pricing",
      "https://www.microsoft.com/en-us/microsoft-365/business/microsoft-365-business-standard",
    ],
    sourceLabel: "Microsoft 365 business pricing",
    logoSourceUrl: "https://www.microsoft.com/microsoft-365",
    startingPrice: 12.5,
    pricingModel: "Subscription",
    billingCycle: "Annual",
    summary:
      "Microsoft 365 Business Standard adds desktop Office apps and a broader productivity footprint on top of the same Exchange, Teams, and storage foundation used by the lower tier.",
    bestFor:
      "It is best for established teams that need business email plus full desktop Office applications, webinar hosting, and standard Microsoft collaboration workflows.",
    fitNarrative:
      "It fits Microsoft 365 Hosting and Enterprise Email Solutions because it combines branded email with the fuller Microsoft business suite that many mid-market buyers standardize on.",
    featureList: [
      "Custom business email",
      "Desktop, web, and mobile Office apps",
      "1 TB cloud storage per user",
      "Teams meetings and webinars",
      "Automatic spam and malware filtering",
      "10+ additional business apps",
      "Anytime phone and web support",
      "Up to 300 users",
    ],
    pricingBullets: [
      "Starts at $12.50 per user per month when paid yearly.",
      "Microsoft also lists a monthly subscription at $15.00 per user per month.",
      "The no-Teams annual option is shown at $9.29 per user per month on the same family of pricing pages.",
    ],
    factualPros: [
      "desktop apps are included",
      "email, storage, and meetings stay in one vendor stack",
      "official monthly and annual pricing is clearly published",
    ],
    factualCons: [
      "annual commitment delivers the best pricing",
      "this tier still stops at 300 users",
      "higher-security bundles cost materially more",
    ],
    collections: [
      "Business Email Hosting",
      "Enterprise Email Solutions",
      "Microsoft 365 Hosting",
    ],
    filters: {
      pricing_model: ["Subscription"],
      price_band: ["$10-$50/month"],
      billing_cycle: ["Monthly", "Annual"],
      support_coverage: ["24/7 support"],
      target_segment: ["Small business", "Mid-market"],
    },
    confidence: "high",
    verificationNotes: [
      "Pricing and plan highlights verified from Microsoft 365 pricing pages on 2026-04-12.",
      "Logo upload has not been completed yet for the preview artifact.",
    ],
  },
  {
    title: "DNS Made Easy DNS-5",
    handle: "dns-made-easy-dns-5",
    vendor: "DNS Made Easy",
    officialUrl: "https://dnsmadeeasy.com/",
    sourceUrls: [
      "https://dnsmadeeasy.com/",
      "https://dnsmadeeasy.com/product/free-trial",
    ],
    sourceLabel: "DNS Made Easy managed DNS pricing",
    logoSourceUrl: "https://dnsmadeeasy.com/",
    startingPrice: 18.75,
    pricingModel: "Subscription",
    billingCycle: "Monthly",
    summary:
      "DNS-5 is DNS Made Easy's entry paid managed DNS plan for smaller production workloads that still need SLA-backed reliability, failover support, and low-latency authoritative DNS.",
    bestFor:
      "It is best for small businesses, agencies, and operations teams that need managed DNS without buying a larger multi-domain package on day one.",
    fitNarrative:
      "It maps cleanly to DNS Management and Premium DNS because it is an authoritative managed DNS subscription with SLA commitments, analytics, and failover instead of a free registrar add-on.",
    featureList: [
      "5 domains included",
      "1,500 DNS records",
      "5 million queries per month",
      "1 failover record",
      "5 query logs",
      "Two-factor authentication",
      "100% SLA-backed service",
    ],
    pricingBullets: [
      "Starts at $18.75 per month.",
      "DNS Made Easy also lists $225 billed annually for the same plan.",
      "A free trial is available for teams that want to test the platform first.",
    ],
    factualPros: [
      "public pricing is clear",
      "failover is included at the entry tier",
      "SLA-backed uptime is positioned as a core differentiator",
    ],
    factualCons: [
      "domain and record limits are modest",
      "higher automation features are reserved for larger memberships",
      "the product is not positioned as a registrar bundle",
    ],
    collections: ["DNS Management", "Premium DNS"],
    filters: {
      pricing_model: ["Subscription"],
      price_band: ["$10-$50/month"],
      billing_cycle: ["Monthly", "Annual"],
      target_segment: ["Small business", "Agencies", "Developers"],
    },
    confidence: "high",
    verificationNotes: [
      "Pricing and included limits verified from DNS Made Easy official pages on 2026-04-12.",
      "Logo upload has not been completed yet for the preview artifact.",
    ],
  },
  {
    title: "DNS Made Easy DNS-25",
    handle: "dns-made-easy-dns-25",
    vendor: "DNS Made Easy",
    officialUrl: "https://dnsmadeeasy.com/",
    sourceUrls: ["https://dnsmadeeasy.com/"],
    sourceLabel: "DNS Made Easy managed DNS pricing",
    logoSourceUrl: "https://dnsmadeeasy.com/",
    startingPrice: 56.25,
    pricingModel: "Subscription",
    billingCycle: "Monthly",
    summary:
      "DNS-25 is the larger managed DNS membership for teams that need more domains, higher query limits, analytics, and global traffic control on a published commercial plan.",
    bestFor:
      "It is best for agencies, DevOps teams, and growing infrastructure operators that need higher-capacity managed DNS than an entry plan can provide.",
    fitNarrative:
      "It is a direct match for Premium DNS and DNS Management because the plan adds traffic control, analytics, and larger usage ceilings while staying in the same authoritative DNS platform.",
    featureList: [
      "25 domains included",
      "7,500 DNS records",
      "25 million queries per month",
      "5 failover records",
      "10 query logs per month",
      "1 Global Traffic Director",
      "100% SLA-backed service",
      "DNS Analytics",
    ],
    pricingBullets: [
      "Starts at $56.25 per month.",
      "DNS Made Easy also lists $675 billed annually for the plan.",
      "The package adds Global Traffic Director and DNS Analytics above the lower tier.",
    ],
    factualPros: [
      "published capacity is substantially higher than DNS-5",
      "traffic director support is included",
      "analytics is built into the plan",
    ],
    factualCons: [
      "the monthly cost moves into a premium bracket",
      "larger teams may still need the DNS-50 tier",
      "the offer is centered on managed DNS rather than bundled domain registration",
    ],
    collections: ["DNS Management", "Premium DNS"],
    filters: {
      pricing_model: ["Subscription"],
      price_band: ["$51-$200/month"],
      billing_cycle: ["Monthly", "Annual"],
      target_segment: ["Small business", "Agencies", "Developers"],
    },
    confidence: "high",
    verificationNotes: [
      "Pricing and included limits verified from DNS Made Easy official pages on 2026-04-12.",
      "Logo upload has not been completed yet for the preview artifact.",
    ],
  },
  {
    title: "DNSimple Solo DNS Hosting",
    handle: "dnsimple-solo-dns-hosting",
    vendor: "DNSimple",
    officialUrl: "https://dnsimple.com/pricing",
    sourceUrls: [
      "https://dnsimple.com/pricing",
      "https://support.dnsimple.com/articles/dnsimple-plans/",
    ],
    sourceLabel: "DNSimple pricing",
    logoSourceUrl: "https://dnsimple.com/",
    startingPrice: 0.5,
    pricingModel: "Usage-based",
    billingCycle: "Usage-based",
    summary:
      "DNSimple Solo is a pay-as-you-go DNS and domain management plan built around hosted zones, DNS query volume, and lightweight control-plane automation instead of a fixed platform bundle.",
    bestFor:
      "It is best for individuals, developers, and small operations teams that want authoritative DNS, DNSSEC, and domain management without a base subscription fee.",
    fitNarrative:
      "It fits DNS Management and Premium DNS because the service is centered on hosted zones, Anycast DNS, DNSSEC, domain control, and operational automation rather than simple registrar defaults.",
    featureList: [
      "No base subscription fee for one user",
      "$0.50 per hosted zone per month",
      "$0.10 per million queries per zone per month",
      "Anycast DNS",
      "DNSSEC",
      "HTTP redirects",
      "Let's Encrypt SSL certificates",
      "WHOIS privacy services",
    ],
    pricingBullets: [
      "Starts at $0.50 per hosted zone per month on the Solo plan.",
      "Query volume is billed at $0.10 per million queries per zone per month.",
      "DNSimple documents the plan as pay-as-you-go with no base subscription fee.",
    ],
    factualPros: [
      "very low entry cost",
      "DNSSEC and Anycast DNS are included",
      "the usage-based model is clear for smaller estates",
    ],
    factualCons: [
      "pricing grows with zones and query volume",
      "the plan is limited to one user",
      "SLA coverage is not included at this tier",
    ],
    collections: ["DNS Management", "Premium DNS"],
    filters: {
      pricing_model: ["Usage-based"],
      price_band: ["Under $10/month"],
      billing_cycle: ["Usage-based"],
      target_segment: ["Individuals", "Developers", "Small business"],
    },
    confidence: "high",
    verificationNotes: [
      "Usage-based pricing and feature set verified from DNSimple pricing and support pages on 2026-04-12.",
      "Logo upload has not been completed yet for the preview artifact.",
    ],
  },
  {
    title: "DNSimple Teams DNS Hosting",
    handle: "dnsimple-teams-dns-hosting",
    vendor: "DNSimple",
    officialUrl: "https://dnsimple.com/pricing",
    sourceUrls: ["https://dnsimple.com/pricing"],
    sourceLabel: "DNSimple pricing",
    logoSourceUrl: "https://dnsimple.com/",
    startingPrice: 29,
    pricingModel: "Usage-based",
    billingCycle: "Monthly",
    summary:
      "DNSimple Teams adds a base subscription with team features such as access control, SSO support, broader activity history, and an SLA while retaining the same zone-based DNS billing model.",
    bestFor:
      "It is best for agencies, collaborative infrastructure teams, and businesses that need managed DNS governance rather than a single-user setup.",
    fitNarrative:
      "It fits Premium DNS and DNS Management because the plan keeps Anycast DNS and zone-based control while adding multi-user administration, SLA coverage, and stronger team operations.",
    featureList: [
      "Starts at $29 per month and includes one seat",
      "$0.50 per hosted zone per month",
      "$0.10 per million queries per zone per month",
      "1,000 DNS records per zone",
      "Single sign-on with Okta or Google",
      "99% SLA",
      "Unlimited activity history",
      "Domain access control",
    ],
    pricingBullets: [
      "Base subscription starts at $29 per month and includes one seat.",
      "Hosted zones are billed at $0.50 per zone per month.",
      "DNS query volume is billed at $0.10 per million queries per zone per month.",
    ],
    factualPros: [
      "team governance features are explicit",
      "SSO and SLA are clearly published",
      "zone-based pricing stays transparent",
    ],
    factualCons: [
      "the base subscription is materially higher than Solo",
      "zones and query volume still add to the bill",
      "enterprise-grade custom pricing begins above this tier",
    ],
    collections: ["DNS Management", "Premium DNS"],
    filters: {
      pricing_model: ["Usage-based"],
      price_band: ["$10-$50/month"],
      billing_cycle: ["Monthly", "Usage-based"],
      target_segment: ["Small business", "Agencies", "Developers"],
    },
    confidence: "high",
    verificationNotes: [
      "Pricing and team features verified from DNSimple pricing pages on 2026-04-12.",
      "Logo upload has not been completed yet for the preview artifact.",
    ],
  },
  {
    title: "Namecheap Easy Domain Transfer",
    handle: "namecheap-easy-domain-transfer",
    vendor: "Namecheap",
    officialUrl: "https://www.namecheap.com/domains/transfer/",
    sourceUrls: [
      "https://www.namecheap.com/domains/transfer/",
      "https://www.namecheap.com/domains/transfer/domain-transfer-sale/",
    ],
    sourceLabel: "Namecheap domain transfer pages",
    logoSourceUrl: "https://www.namecheap.com/",
    startingPrice: 11.48,
    pricingModel: "One-time purchase",
    summary:
      "Namecheap's domain transfer offer is a registrar transfer product with published transfer pricing, included privacy on eligible names, and a one-year renewal extension for supported TLDs.",
    bestFor:
      "It is best for domain owners who want lower transfer pricing, simpler portfolio consolidation, and registrar-side privacy coverage on common TLDs.",
    fitNarrative:
      "It belongs in Domain Transfer because the product is a registrar transfer workflow rather than a fresh domain registration listing or a DNS hosting subscription.",
    featureList: [
      "Published .com transfer pricing from $11.48 per year",
      "Free domain privacy for life on eligible transfers",
      "Most ICANN-mandated transfers add a one-year renewal",
      "Transfer completion window of 30 minutes to 6 days",
      "Support for bulk transfers up to 50 domains",
      "No downtime guidance during transfer",
    ],
    pricingBullets: [
      "Namecheap lists .com transfer pricing from $11.48 per year.",
      ".net transfers are shown at $12.98 and .org transfers at $10.98 on the same page.",
      "ICANN fees may apply to some domains and are noted separately by Namecheap.",
    ],
    factualPros: [
      "clear per-TLD transfer pricing",
      "privacy coverage is highlighted on the transfer page",
      "the page explains eligibility and transfer timing clearly",
    ],
    factualCons: [
      "pricing varies by TLD",
      "some domains have extra ICANN fees",
      "certain TLDs require manual handling or special transfer rules",
    ],
    collections: ["Domain Transfer"],
    filters: {
      pricing_model: ["One-time purchase"],
      target_segment: ["Individuals", "Small business", "Agencies"],
    },
    confidence: "high",
    verificationNotes: [
      "Transfer pricing verified from official Namecheap transfer pages on 2026-04-12.",
      "Logo upload has not been completed yet for the preview artifact.",
    ],
  },
  {
    title: "GoDaddy Domain Transfer",
    handle: "godaddy-domain-transfer",
    vendor: "GoDaddy",
    officialUrl: "https://www.godaddy.com/domains/domain-transfer",
    sourceUrls: [
      "https://www.godaddy.com/domains/domain-transfer",
      "https://www.godaddy.com/en/domains/domain-transfer",
    ],
    sourceLabel: "GoDaddy domain transfer pages",
    logoSourceUrl: "https://www.godaddy.com/",
    startingPrice: 12.99,
    pricingModel: "One-time purchase",
    summary:
      "GoDaddy Domain Transfer is a registrar transfer offer for moving an existing domain into GoDaddy with a flat .com transfer price, bundled privacy, and a free year of registration on supported transfers.",
    bestFor:
      "It is best for buyers who want a mainstream registrar, a simple transfer flow, and centralized domain management in the same account.",
    fitNarrative:
      "It fits Domain Transfer because the page is built specifically around moving an existing domain to a new registrar rather than selling first-time registrations or DNS-only services.",
    featureList: [
      "Transfer your .com for $12.99",
      "Includes free registration for a year on supported transfers",
      "Free privacy protection is included",
      "Supports bulk transfers",
      "GoDaddy documents a typical 5 to 7 day transfer window",
      "Transfer guidance covers authorization code, unlock, and contact verification steps",
    ],
    pricingBullets: [
      "GoDaddy lists .com transfer pricing at $12.99 on the main transfer page.",
      "The transfer includes a free year of registration on supported transfers.",
      "GoDaddy notes that the renewal after transfer follows the then-current annual retail price.",
    ],
    factualPros: [
      "flat .com transfer pricing is visible",
      "privacy is bundled",
      "the transfer process is documented step by step",
    ],
    factualCons: [
      "pricing is centered on the .com example",
      "transfer eligibility is limited by ICANN timing rules",
      "the post-transfer renewal price is not fixed long term",
    ],
    collections: ["Domain Transfer"],
    filters: {
      pricing_model: ["One-time purchase"],
      target_segment: ["Individuals", "Small business", "Agencies"],
    },
    confidence: "high",
    verificationNotes: [
      "Transfer pricing verified from official GoDaddy transfer pages on 2026-04-12.",
      "Logo upload has not been completed yet for the preview artifact.",
    ],
  },
  {
    title: "Sucuri Basic Platform",
    handle: "sucuri-basic-platform",
    vendor: "Sucuri",
    officialUrl: "https://info.sucuri.net/feature/malware-removal",
    sourceUrls: [
      "https://info.sucuri.net/feature/malware-removal",
      "https://info.sucuri.net/feature/blacklist",
      "https://info.sucuri.net/firewall-free-trial",
    ],
    sourceLabel: "Sucuri platform pages",
    logoSourceUrl: "https://sucuri.net/",
    startingPrice: 199.99,
    pricingModel: "Subscription",
    billingCycle: "Annual",
    summary:
      "Sucuri Basic is the entry full-platform website security plan that combines monitoring, malware cleanup, blacklist support, a website firewall, and DDoS mitigation in one annual subscription.",
    bestFor:
      "It is best for small business websites and agency-managed properties that need a bundled security response product rather than standalone scanning or a single point tool.",
    fitNarrative:
      "It fits Website Security, Malware Removal, Web Application Firewall, and DDoS Protection because the plan explicitly combines malware cleanup, blacklist monitoring, firewall coverage, and advanced DDoS mitigation.",
    featureList: [
      "Continuous security scanning",
      "Malware and hack removal",
      "Blacklist monitoring",
      "Virtual patching and hardening",
      "Advanced DDoS mitigation",
      "CDN performance layer",
      "SSL and PCI-compliant firewall support",
      "30-day money-back guarantee",
    ],
    pricingBullets: [
      "Sucuri lists the Basic plan at $199.99 per year per site.",
      "The plan includes a 12-hour malware and hack response target on the public pricing table.",
      "A 30-day guarantee is listed on the same product family pages.",
    ],
    factualPros: [
      "multiple security layers are included in one subscription",
      "malware cleanup is part of the published plan",
      "DDoS mitigation is explicitly listed",
    ],
    factualCons: [
      "pricing is annual rather than entry-level monthly",
      "support is ticket-based on the plan table",
      "organizations wanting faster response may need a higher tier",
    ],
    collections: [
      "Website Security",
      "Malware Removal",
      "Web Application Firewall",
      "DDoS Protection",
    ],
    filters: {
      pricing_model: ["Subscription"],
      billing_cycle: ["Annual"],
      support_coverage: ["24/7 support"],
      target_segment: ["Small business", "Agencies"],
    },
    confidence: "high",
    verificationNotes: [
      "Pricing and included protection layers verified from Sucuri official pages on 2026-04-12.",
      "Logo upload has not been completed yet for the preview artifact.",
    ],
  },
  {
    title: "Sucuri Professional Platform",
    handle: "sucuri-professional-platform",
    vendor: "Sucuri",
    officialUrl: "https://info.sucuri.net/feature/malware-removal",
    sourceUrls: [
      "https://info.sucuri.net/feature/malware-removal",
      "https://info.sucuri.net/feature/blacklist",
    ],
    sourceLabel: "Sucuri platform pages",
    logoSourceUrl: "https://sucuri.net/",
    startingPrice: 299.99,
    pricingModel: "Subscription",
    billingCycle: "Annual",
    summary:
      "Sucuri Professional is the higher security platform tier with faster cleanup response and the same broad website protection stack used for firewalling, monitoring, cleanup, and blacklist handling.",
    bestFor:
      "It is best for commercial websites that want the Sucuri platform with quicker incident turnaround than the entry plan.",
    fitNarrative:
      "It is a direct fit for Website Security, Malware Removal, Web Application Firewall, and DDoS Protection because the official plan table keeps all of those protection layers in scope and upgrades response speed.",
    featureList: [
      "Continuous security scanning",
      "Malware and hack removal",
      "Blacklist monitoring",
      "Virtual patching and hardening",
      "Advanced DDoS mitigation",
      "CDN performance layer",
      "SSL and PCI-compliant firewall support",
      "6-hour response target",
    ],
    pricingBullets: [
      "Sucuri lists the Professional plan at $299.99 per year per site.",
      "The public plan table shows a 6-hour response target for this tier.",
      "The same product family page positions it as the most popular Sucuri platform plan.",
    ],
    factualPros: [
      "faster response target than Basic",
      "the protection stack remains broad",
      "annual pricing is still clearly published",
    ],
    factualCons: [
      "annual cost is materially higher than the entry tier",
      "the service remains ticket-led rather than dedicated-manager-led",
      "the plan is focused on website security, not broader infrastructure hardening",
    ],
    collections: [
      "Website Security",
      "Malware Removal",
      "Web Application Firewall",
      "DDoS Protection",
    ],
    filters: {
      pricing_model: ["Subscription"],
      billing_cycle: ["Annual"],
      support_coverage: ["24/7 support"],
      target_segment: ["Small business", "Agencies"],
    },
    confidence: "high",
    verificationNotes: [
      "Pricing and included protection layers verified from Sucuri official pages on 2026-04-12.",
      "Logo upload has not been completed yet for the preview artifact.",
    ],
  },
  {
    title: "SiteLock Basic",
    handle: "sitelock-basic",
    vendor: "SiteLock",
    officialUrl: "https://www.sitelock.com/products/basic",
    sourceUrls: [
      "https://www.sitelock.com/products/basic",
      "https://www.sitelock.com/pricing",
    ],
    sourceLabel: "SiteLock pricing",
    logoSourceUrl: "https://www.sitelock.com/",
    startingPrice: 19.99,
    pricingModel: "Subscription",
    billingCycle: "Monthly",
    summary:
      "SiteLock Basic is the lower-priced monthly website security package focused on daily scanning, automatic malware removal, backup, and baseline monitoring for smaller sites.",
    bestFor:
      "It is best for budget-conscious site owners who want continuous scanning and cleanup in a simpler monthly package.",
    fitNarrative:
      "It maps to Website Security and Malware Removal because the plan centers on daily scanning, automatic malware removal, and backup rather than acting purely as an SSL or registrar add-on.",
    featureList: [
      "Daily code, database, and CMS scanning",
      "Unlimited automatic malware removal",
      "Website backup up to 2 GB",
      "SSL monitoring",
      "Site health monitoring",
      "SQL injection and cross-site scripting scans",
      "24/7 customer support access",
      "30-day refund window",
    ],
    pricingBullets: [
      "SiteLock lists Basic at $19.99 per month.",
      "The plan is presented as the budget-conscious option on the official pricing pages.",
      "Annual billing discounts are promoted on the pricing page, but the visible monthly base rate is $19.99.",
    ],
    factualPros: [
      "monthly entry pricing is easy to understand",
      "automatic malware removal is included",
      "backup and monitoring are bundled together",
    ],
    factualCons: [
      "the support response target is slower than higher tiers",
      "WAF features are not the headline positioning for this plan",
      "backup storage is limited to 2 GB",
    ],
    collections: ["Website Security", "Malware Removal"],
    filters: {
      pricing_model: ["Subscription"],
      price_band: ["$10-$50/month"],
      billing_cycle: ["Monthly"],
      support_coverage: ["24/7 support"],
      target_segment: ["Individuals", "Small business"],
    },
    confidence: "high",
    verificationNotes: [
      "Pricing and plan features verified from SiteLock official pages on 2026-04-12.",
      "Logo upload has not been completed yet for the preview artifact.",
    ],
  },
  {
    title: "SiteLock Pro",
    handle: "sitelock-pro",
    vendor: "SiteLock",
    officialUrl: "https://www.sitelock.com/products/pro",
    sourceUrls: [
      "https://www.sitelock.com/products/pro",
      "https://www.sitelock.com/pricing",
    ],
    sourceLabel: "SiteLock pricing",
    logoSourceUrl: "https://www.sitelock.com/",
    startingPrice: 29.99,
    pricingModel: "Subscription",
    billingCycle: "Monthly",
    summary:
      "SiteLock Pro is the higher monthly website security plan for sites that need the SiteLock stack plus its comprehensive CDN and web application firewall layer.",
    bestFor:
      "It is best for business sites with more traffic or stronger perimeter protection needs than the basic monitoring package provides.",
    fitNarrative:
      "It belongs in Website Security, Malware Removal, and Web Application Firewall because SiteLock explicitly adds a comprehensive CDN and WAF on top of scanning, cleanup, and backup.",
    featureList: [
      "Daily code, database, and CMS scanning",
      "Automatic patching for popular CMSes",
      "Comprehensive CDN and web application firewall",
      "Unlimited automatic malware removal",
      "Website backup up to 5 GB",
      "24-hour response target",
      "24/7 customer support access",
      "30-day refund window",
    ],
    pricingBullets: [
      "SiteLock lists Pro at $29.99 per month.",
      "The plan is positioned for sites with more traffic and extra protection needs.",
      "Annual billing discounts are promoted separately, but the visible monthly base rate is $29.99.",
    ],
    factualPros: [
      "WAF is explicitly included",
      "backup allowance is higher than Basic",
      "response target improves relative to the lower tier",
    ],
    factualCons: [
      "the plan costs more than Basic every month",
      "the public positioning stays website-centric rather than infrastructure-wide",
      "organizations needing dedicated response management may want a different service model",
    ],
    collections: ["Website Security", "Malware Removal", "Web Application Firewall"],
    filters: {
      pricing_model: ["Subscription"],
      price_band: ["$10-$50/month"],
      billing_cycle: ["Monthly"],
      support_coverage: ["24/7 support"],
      target_segment: ["Small business", "Mid-market"],
    },
    confidence: "high",
    verificationNotes: [
      "Pricing and plan features verified from SiteLock official pages on 2026-04-12.",
      "Logo upload has not been completed yet for the preview artifact.",
    ],
  },
  {
    title: "DigiCert Secure Site TLS/SSL",
    handle: "digicert-secure-site-tls-ssl",
    vendor: "DigiCert",
    officialUrl: "https://www.digicert.com/secure-site-ssl/ssl/",
    sourceUrls: ["https://www.digicert.com/secure-site-ssl/ssl/"],
    sourceLabel: "DigiCert Secure Site pricing",
    logoSourceUrl: "https://www.digicert.com/",
    startingPrice: 40,
    pricingModel: "Subscription",
    billingCycle: "Monthly",
    summary:
      "DigiCert Secure Site is a premium TLS/SSL subscription that combines certificate coverage with reputation tooling, malware checks, and blocklist checks for organizations that want more than a bare certificate issue workflow.",
    bestFor:
      "It is best for businesses and larger web properties that want a premium certificate offering with added validation and visibility tools.",
    fitNarrative:
      "It belongs in SSL Certificates because the core product is a DigiCert TLS/SSL subscription, even though the bundle also includes security-related supporting tools.",
    featureList: [
      "Premium TLS/SSL subscription",
      "Priority validation",
      "Malware checks",
      "Blocklist checks",
      "DigiCert Smart Seal",
      "$1.75 million NetSure warranty",
      "Multi-domain and wildcard options",
      "Automatic 12-month renewal subscription model",
    ],
    pricingBullets: [
      "DigiCert shows Secure Site starting at $40 per month per standard domain.",
      "The same page also shows a standard-domain figure of $44 per month in the configurator output.",
      "The subscription total shown for the entry configuration is $624.00 on the official page.",
    ],
    factualPros: [
      "premium certificate tooling is bundled with the subscription",
      "starting pricing is publicly visible",
      "DigiCert includes reputation-oriented checks beyond issuance alone",
    ],
    factualCons: [
      "pricing is much higher than a basic DV certificate",
      "the subscription model is more complex than commodity SSL offers",
      "many smaller sites will not need the premium add-ons",
    ],
    collections: ["SSL Certificates"],
    filters: {
      pricing_model: ["Subscription"],
      price_band: ["$10-$50/month"],
      billing_cycle: ["Monthly"],
      support_coverage: ["Priority support"],
      target_segment: ["Small business", "Mid-market", "Enterprise"],
    },
    confidence: "high",
    verificationNotes: [
      "Pricing and subscription details verified from DigiCert Secure Site pages on 2026-04-12.",
      "Logo upload has not been completed yet for the preview artifact.",
    ],
  },
  {
    title: "Sectigo Single Domain DV SSL",
    handle: "sectigo-single-domain-dv-ssl",
    vendor: "Sectigo",
    officialUrl: "https://www.sectigo.com/ssl-certificates-tls/dv-domain-validation",
    sourceUrls: [
      "https://www.sectigo.com/ssl-certificates-tls/dv-domain-validation",
      "https://www.sectigo.com/ssl-certificates-tls/single-ssl-certificates",
    ],
    sourceLabel: "Sectigo DV SSL pages",
    logoSourceUrl: "https://www.sectigo.com/",
    startingPrice: 88,
    pricingModel: "Subscription",
    summary:
      "Sectigo Single Domain DV SSL is a lower-complexity domain-validation certificate for websites that need standard encrypted HTTPS with fast issuance and a lower barrier than organization-validated products.",
    bestFor:
      "It is best for blogs, brochure sites, smaller business sites, and teams that want commercial certificate support without paying for premium enterprise validation tiers.",
    fitNarrative:
      "It is a direct fit for SSL Certificates because the offer is a domain validation certificate product with publicly stated certificate warranty, quick issuance, and commercial support.",
    featureList: [
      "Single-domain DV certificate",
      "Quick issuance",
      "24/7 expert service",
      "Unlimited server licenses",
      "30-day money-back guarantee",
      "Broad browser compatibility",
      "$500,000 certificate warranty",
      "Sectigo trust seal",
    ],
    pricingBullets: [
      "Sectigo states that a DV SSL starts at $88 for the single-domain option when choosing a six-year subscription.",
      "The page positions DV as the most cost-effective validation option.",
      "Pricing rises for multi-domain and wildcard variants.",
    ],
    factualPros: [
      "lower entry price than premium certificate bundles",
      "fast issuance is part of the core value proposition",
      "commercial support and warranty are clearly listed",
    ],
    factualCons: [
      "the published entry price depends on a longer subscription term",
      "DV validation does not add organization vetting",
      "the offer is intentionally simpler than enterprise certificate bundles",
    ],
    collections: ["SSL Certificates"],
    filters: {
      pricing_model: ["Subscription"],
      target_segment: ["Individuals", "Small business"],
      support_coverage: ["24/7 support"],
    },
    confidence: "high",
    verificationNotes: [
      "Pricing and feature details verified from Sectigo official pages on 2026-04-12.",
      "Logo upload has not been completed yet for the preview artifact.",
    ],
  },
];

const buildPreviewRows = async () => {
  const categoryRows = await readCsv(CATEGORY_CSV_PATH);
  const filterRows = await readCsv(FILTERS_CSV_PATH);
  const zeroCollectionsPath = latestZeroCollectionsCsvPath();
  const zeroCollectionRows = await readCsv(zeroCollectionsPath);

  const cloudCollectionByTitle = new Map(
    categoryRows
      .filter((row) => row.top_category === "Cloud Services")
      .map((row) => [row.final_category, row.collection_handle])
  );

  const filterDefinitions = new Map(
    filterRows
      .filter(
        (row) =>
          row.profile_id === "cloud-services" &&
          FILTER_KEYS_WITH_SHARED_VALUES.has(row.metafield_key)
      )
      .map((row) => [
        row.metafield_key,
        {
          profileId: row.profile_id,
          key: row.metafield_key,
          allowedValues: splitAllowedValues(row.allowed_values),
        } satisfies FilterDefinition,
      ])
  );

  const zeroCloudCollections = zeroCollectionRows.filter(
    (row) =>
      row.top_category === "Cloud Services" &&
      Number(row.product_count || 0) === 0
  );

  const previewRows: PreviewRow[] = PRODUCT_SPECS.map((spec) => {
    spec.collections.forEach((collection) => {
      if (!cloudCollectionByTitle.has(collection)) {
        throw new Error(`Cloud Services category missing from taxonomy: ${collection}`);
      }
    });

    Object.entries(spec.filters).forEach(([key, values]) => {
      const definition = filterDefinitions.get(key);
      if (!definition) {
        throw new Error(`Unknown cloud-services filter key: ${key}`);
      }
      values.forEach((value) => {
        if (!definition.allowedValues.includes(value)) {
          throw new Error(`Invalid value "${value}" for filter ${key}`);
        }
      });
    });

    const bodyHtml = buildBodyHtml(spec);
    if (wordCount(bodyHtml) < 300) {
      throw new Error(`Description too short for ${spec.handle}`);
    }

    return {
      title: spec.title,
      handle: spec.handle,
      bodyHtml,
      vendor: spec.vendor,
      status: "active",
      published: true,
      price: toPriceString(spec.startingPrice),
      chargeTax: false,
      requiresShipping: false,
      imageAltText: `${spec.title} logo`,
      seoTitle: buildSeoTitle(spec),
      seoDescription: buildSeoDescription(spec),
      collectionHandles: spec.collections.map(
        (collection) => cloudCollectionByTitle.get(collection) as string
      ),
      collectionTitles: [...spec.collections],
      sourceUrl: spec.officialUrl,
      sourceUrls: [...spec.sourceUrls],
      sourceLabel: spec.sourceLabel,
      logoSourceUrl: spec.logoSourceUrl,
      customUrl: spec.officialUrl,
      customLogoImage: "",
      customTypeMultiple: [...spec.collections],
      productFeatures: buildFeaturesText(spec),
      plansPricing: buildPlansPricingText(spec),
      prosCons: buildProsConsText(spec),
      filterValues: spec.filters,
      verificationNotes: spec.verificationNotes.join("\n"),
      confidence: spec.confidence,
      missingFields: ["custom.logo_image"],
    };
  });

  const coverageByCollection = zeroCloudCollections.map((collection) => {
    const count = previewRows.filter((row) =>
      row.customTypeMultiple.includes(collection.final_category)
    ).length;
    return {
      parentCategory: collection.parent_category,
      finalCategory: collection.final_category,
      collectionHandle: collection.collection_handle,
      liveCollectionFound: collection.live_collection_found === "true",
      productsAssigned: count,
    };
  });

  return {
    previewRows,
    zeroCloudCollections,
    coverageByCollection,
    coveredCollections: coverageByCollection.filter(
      (item) => item.productsAssigned >= 2
    ),
    shortfilledCollections: coverageByCollection.filter(
      (item) => item.productsAssigned > 0 && item.productsAssigned < 2
    ),
    uncoveredCollections: coverageByCollection.filter(
      (item) => item.productsAssigned === 0
    ),
    blockedCollections: coverageByCollection.filter(
      (item) => !item.liveCollectionFound
    ),
    zeroCollectionsPath,
  };
};

const buildPreviewCsv = (rows: PreviewRow[]) => {
  const headers = [
    "title",
    "handle",
    "vendor",
    "price",
    "status",
    "published",
    "charge_tax",
    "requires_shipping",
    "collection_titles",
    "collection_handles",
    "custom_url",
    "logo_source_url",
    "custom_logo_image",
    "source_url",
    "source_urls",
    "source_label",
    "image_alt_text",
    "seo_title",
    "seo_description",
    "product_features",
    "plans_pricing",
    "pros_cons",
    "filter_values",
    "confidence",
    "verification_notes",
    "missing_fields",
    "body_html",
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
        row.published,
        row.chargeTax,
        row.requiresShipping,
        row.collectionTitles.join(" | "),
        row.collectionHandles.join(" | "),
        row.customUrl,
        row.logoSourceUrl,
        row.customLogoImage,
        row.sourceUrl,
        row.sourceUrls.join(" | "),
        row.sourceLabel,
        row.imageAltText,
        row.seoTitle,
        row.seoDescription,
        row.productFeatures,
        row.plansPricing,
        row.prosCons,
        JSON.stringify(row.filterValues),
        row.confidence,
        row.verificationNotes,
        row.missingFields.join(" | "),
        row.bodyHtml,
      ]
        .map(csvEscape)
        .join(",")
    ),
  ];

  return lines.join("\n");
};

const main = async () => {
  await ensureDir(EXPORTS_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const {
    previewRows,
    coverageByCollection,
    coveredCollections,
    shortfilledCollections,
    uncoveredCollections,
    blockedCollections,
    zeroCloudCollections,
    zeroCollectionsPath,
  } = await buildPreviewRows();

  const jsonPath = path.join(
    EXPORTS_DIR,
    `cloud-services-phase1-preview-${timestamp}.json`
  );
  const csvPath = path.join(
    EXPORTS_DIR,
    `cloud-services-phase1-preview-${timestamp}.csv`
  );
  const reportPath = path.join(
    EXPORTS_DIR,
    `cloud-services-phase1-validation-${timestamp}.json`
  );

  const validation = {
    generatedAt: new Date().toISOString(),
    scope: "Cloud Services phase 1 preview",
    totalPreviewProducts: previewRows.length,
    targetedCollectionsCoveredAtMinimumTwo: coveredCollections.length,
    targetedCollectionsShortfilled: shortfilledCollections,
    targetedCollectionsUncovered: uncoveredCollections,
    blockedCollections,
    coveredCollections,
    coverageByCollection,
    remainingZeroCloudCollections: uncoveredCollections.length,
    rowsMissingLogoUpload: previewRows
      .filter((row) => row.missingFields.includes("custom.logo_image"))
      .map((row) => row.handle),
    descriptionWordCounts: previewRows.map((row) => ({
      handle: row.handle,
      words: wordCount(row.bodyHtml),
    })),
    priceValidation: previewRows.every((row) => /^\d+(\.\d+)?$/.test(row.price)),
    statusValidation: previewRows.every((row) => row.status === "active"),
    publishValidation: previewRows.every((row) => row.published === true),
    taxValidation: previewRows.every((row) => row.chargeTax === false),
    shippingValidation: previewRows.every((row) => row.requiresShipping === false),
    sourceExportUsed: path.basename(zeroCollectionsPath),
    totalZeroCloudCollectionsAtStart: zeroCloudCollections.length,
  };

  await Promise.all([
    fs.promises.writeFile(jsonPath, JSON.stringify(previewRows, null, 2), "utf8"),
    fs.promises.writeFile(csvPath, buildPreviewCsv(previewRows), "utf8"),
    fs.promises.writeFile(reportPath, JSON.stringify(validation, null, 2), "utf8"),
  ]);

  console.log(
    JSON.stringify(
      {
        jsonPath,
        csvPath,
        reportPath,
        totalPreviewProducts: previewRows.length,
        collectionsCoveredAtMinimumTwo: coveredCollections.length,
        remainingUncoveredCollections: uncoveredCollections.length,
      },
      null,
      2
    )
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
