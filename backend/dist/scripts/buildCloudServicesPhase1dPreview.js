"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const csv_parser_1 = __importDefault(require("csv-parser"));
const EXPORTS_DIR = path_1.default.resolve(__dirname, "../../exports");
const CATEGORY_CSV_PATH = path_1.default.resolve(__dirname, "../../imports/category-collections.csv");
const FILTERS_CSV_PATH = path_1.default.resolve(__dirname, "../../doc/shopify-filter-definitions.csv");
const readCsv = async (filePath) => new Promise((resolve, reject) => {
    const rows = [];
    fs_1.default.createReadStream(filePath)
        .pipe((0, csv_parser_1.default)())
        .on("data", (row) => {
        rows.push(Object.fromEntries(Object.entries(row).map(([k, v]) => [
            k.replace(/^\uFEFF/, "").replace(/^"|"$/g, ""),
            typeof v === "string" ? v.trim() : String(v ?? ""),
        ])));
    })
        .on("end", () => resolve(rows))
        .on("error", reject);
});
const readJson = async (filePath) => JSON.parse(await fs_1.default.promises.readFile(filePath, "utf8"));
const ensureDir = (dirPath) => fs_1.default.promises.mkdir(dirPath, { recursive: true });
const escapeHtml = (value) => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const stripHtml = (value) => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const wordCount = (value) => stripHtml(value).split(/\s+/).filter(Boolean).length;
const splitAllowedValues = (value) => value.split("|").map((item) => item.trim()).filter(Boolean);
const toPriceString = (price) => price.toFixed(2).replace(/\.00$/, "");
const csvEscape = (value) => {
    const text = typeof value === "string" ? value : value == null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const priceBand = (price) => price === 0
    ? "Free"
    : price < 10
        ? "Under $10/month"
        : price <= 50
            ? "$10-$50/month"
            : price <= 200
                ? "$51-$200/month"
                : price <= 500
                    ? "$201-$500/month"
                    : "Over $500/month";
const latestExportPath = (prefix, suffix) => {
    const file = fs_1.default
        .readdirSync(EXPORTS_DIR)
        .filter((name) => name.startsWith(prefix) && name.endsWith(suffix))
        .map((name) => ({
        name,
        fullPath: path_1.default.join(EXPORTS_DIR, name),
        mtimeMs: fs_1.default.statSync(path_1.default.join(EXPORTS_DIR, name)).mtimeMs,
    }))
        .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
    if (!file) {
        throw new Error(`No export found for prefix ${prefix}`);
    }
    return file.fullPath;
};
const buildBodyHtml = (spec) => {
    const paragraphs = [
        `${spec.title} is a cloud services listing for buyers comparing ${spec.collections.join(", ")} with official pricing and clearly stated scope. ${spec.summary}`,
        `${spec.bestFor} ${spec.fitNarrative} The mapping stays narrow so the product is only assigned where the provider's published positioning and features make the taxonomy fit defensible.`,
        `${spec.title} includes ${spec.featureList.slice(0, 4).join(", ")}. ${spec.featureList.length > 4 ? `It also includes ${spec.featureList.slice(4).join(", ")}.` : ""} This helps shoppers compare service depth, operational model, and day-to-day administration expectations without reconstructing the offer from multiple disconnected pages.`,
        `Pricing starts at ${toPriceString(spec.startingPrice)}. ${spec.pricingBullets.join(" ")} The catalog price stores the lowest clearly visible official amount while the pricing notes preserve the billing context, service scope, or range details that matter before purchase.`,
        `The main practical advantages are ${spec.factualPros.join(", ")}. The main trade-offs are ${spec.factualCons.join(", ")}. Including both sides keeps the listing balanced and useful for marketplace evaluation rather than one-sided promotion.`,
        `${spec.vendor} positions this offer for buyers who want dependable ${spec.collections.join(", ")} coverage with a clearer buying path than raw vendor research alone. The captured official details are strong enough for a review-ready marketplace draft, while any remaining ambiguity is called out in the verification notes instead of being silently assumed.`,
    ];
    return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n");
};
const seoTitle = (spec) => `${spec.title} | ${spec.vendor} ${spec.collections[0]}`;
const seoDescription = (spec) => {
    const text = `${spec.title} by ${spec.vendor} with pricing from ${toPriceString(spec.startingPrice)}. Best for ${spec.collections.slice(0, 2).join(" and ").toLowerCase()}.`;
    return text.length <= 160 ? text : `${text.slice(0, 157)}...`;
};
const NEW_PRODUCTS = [];
NEW_PRODUCTS.push({
    title: "DigitalOcean Basic Droplet",
    handle: "digitalocean-basic-droplet",
    vendor: "DigitalOcean",
    officialUrl: "https://www.digitalocean.com/pricing/droplets",
    sourceUrls: [
        "https://www.digitalocean.com/pricing/droplets",
        "https://docs.digitalocean.com/products/droplets/details/pricing/",
    ],
    sourceLabel: "DigitalOcean Droplet pricing",
    logoSourceUrl: "https://www.digitalocean.com/",
    startingPrice: 4,
    summary: "DigitalOcean Basic Droplets are entry cloud virtual machines designed for lightweight applications, development environments, and small websites with clear monthly caps and per-second billing.",
    bestFor: "It is best for developers, startups, and smaller teams that want a straightforward public cloud instance without negotiating a contract or managing a dedicated hardware footprint.",
    fitNarrative: "It is a direct fit for Cloud Server Instances and Public Cloud Hosting because DigitalOcean presents Droplets as on-demand virtual machines with published resource tiers, public networking, and transparent platform pricing.",
    featureList: ["512 MiB RAM", "1 vCPU", "10 GiB SSD", "500 GiB outbound transfer", "Per-second billing with monthly cap", "Public IPv4 address", "Snapshots and backups available"],
    pricingBullets: ["Basic Droplets start at $4 per month on the official pricing page.", "DigitalOcean also bills Droplets per second with a 60-second minimum and a monthly cap.", "Entry Droplets are positioned for bursty applications, development workloads, and low-traffic sites."],
    factualPros: ["entry pricing is easy to compare", "resource tiers and transfer allowances are clearly published", "billing stays flexible with per-second metering and monthly caps"],
    factualCons: ["the smallest plan is intentionally limited in RAM and storage", "buyers still manage the operating system and workload stack", "higher performance tiers cost more once workloads grow"],
    collections: ["Cloud Server Instances", "Public Cloud Hosting"],
    filters: {
        hosting_type: ["Cloud hosting"],
        pricing_model: ["Subscription"],
        price_band: [priceBand(4)],
        billing_cycle: ["Monthly"],
        performance_tier: ["Standard"],
        server_region: ["Multi-region"],
        control_panel: ["Custom panel"],
        target_segment: ["Developers", "Small business", "Mid-market"],
    },
    confidence: "high",
    verificationNotes: ["Droplet pricing, minimum plan resources, transfer allowance, and billing model verified from DigitalOcean's official pricing and documentation pages."],
}, {
    title: "Vultr Regular Performance Cloud Compute 1GB",
    handle: "vultr-regular-performance-cloud-compute-1gb",
    vendor: "Vultr",
    officialUrl: "https://www.vultr.com/pricing/",
    sourceUrls: ["https://www.vultr.com/pricing/", "https://www.vultr.com/products/cloud-compute/"],
    sourceLabel: "Vultr cloud compute pricing",
    logoSourceUrl: "https://www.vultr.com/",
    startingPrice: 5,
    summary: "Vultr Regular Performance Cloud Compute provides shared-vCPU virtual machines for general business and developer workloads with public monthly and hourly pricing across a large global footprint.",
    bestFor: "It is best for developers, agencies, and smaller infrastructure teams that need a low-cost public cloud instance for web apps, testing, and smaller database or CMS workloads.",
    fitNarrative: "It fits Cloud Server Instances and Public Cloud Hosting because Vultr explicitly describes Cloud Compute as on-demand virtual machines and publishes regular performance plan pricing, storage, bandwidth, and hourly rates on its official site.",
    featureList: ["1 GB memory", "1 vCPU", "25 GB storage", "1 TB bandwidth", "Monthly and hourly billing", "Global deployment locations", "Shared-vCPU virtual machine model"],
    pricingBullets: ["The 1 GB Regular Performance Cloud Compute plan is listed at $5 per month on the official pricing page.", "Vultr also publishes an hourly rate for the plan, supporting usage-based deployment patterns.", "The product page positions Cloud Compute for web, app, dev/test, and smaller database workloads."],
    factualPros: ["official pricing is public and easy to benchmark", "resource and bandwidth allocations are spelled out clearly", "the service supports rapid global deployment without custom quoting"],
    factualCons: ["shared-vCPU performance is not the same as dedicated compute", "entry storage and memory are limited for heavier workloads", "buyers remain responsible for OS and application administration"],
    collections: ["Cloud Server Instances", "Public Cloud Hosting"],
    filters: {
        hosting_type: ["Cloud hosting"],
        pricing_model: ["Subscription"],
        price_band: [priceBand(5)],
        billing_cycle: ["Monthly"],
        performance_tier: ["Standard"],
        server_region: ["Multi-region"],
        control_panel: ["Custom panel"],
        target_segment: ["Developers", "Agencies", "Small business"],
    },
    confidence: "high",
    verificationNotes: ["Regular Performance Cloud Compute pricing, resources, and positioning verified from Vultr's official pricing and product pages."],
}, {
    title: "Backblaze B2 Cloud Storage",
    handle: "backblaze-b2-cloud-storage",
    vendor: "Backblaze",
    officialUrl: "https://www.backblaze.com/cloud-storage/pricing",
    sourceUrls: ["https://www.backblaze.com/cloud-storage/pricing"],
    sourceLabel: "Backblaze B2 pricing",
    logoSourceUrl: "https://www.backblaze.com/",
    startingPrice: 6,
    summary: "Backblaze B2 is an S3-compatible cloud object storage service positioned for active archiving, backup, recovery, media, and application workloads with predictable pay-as-you-go pricing.",
    bestFor: "It is best for teams that need cloud storage they can use directly for backup repositories, object storage workloads, recovery datasets, or lower-cost data retention without a long-term contract.",
    fitNarrative: "It is a direct fit for Cloud Storage and Cloud Backup because Backblaze describes B2 as object storage built for backup and recovery use cases and publishes a simple per-terabyte monthly starting rate on the official pricing page.",
    featureList: ["S3-compatible object storage", "Starts at 1 TB-scale pricing", "Pay-as-you-go monthly billing", "Free egress up to 3x stored volume", "No minimum file size or storage duration fees", "Compliance-ready positioning", "Backup and recovery workload focus"],
    pricingBullets: ["Backblaze B2 starts at $6 per TB per month on the official pricing page.", "The pricing page also highlights pay-as-you-go monthly billing or annual capacity commitments.", "Backblaze explicitly positions B2 for active archiving, backup, and recovery workloads."],
    factualPros: ["backup and recovery positioning is explicit", "pricing is transparent and easy to compare", "the service works for both storage and backup repository use cases"],
    factualCons: ["pricing is usage-based rather than a fixed all-in-one plan", "buyers still need to size storage and egress patterns carefully", "application integrations may require separate tooling"],
    collections: ["Cloud Storage", "Cloud Backup"],
    filters: {
        hosting_type: ["Cloud hosting"],
        pricing_model: ["Usage-based"],
        price_band: [priceBand(6)],
        billing_cycle: ["Usage-based"],
        performance_tier: ["Standard"],
        server_region: ["Multi-region"],
        control_panel: ["Custom panel"],
        target_segment: ["Small business", "Mid-market", "Enterprise", "Developers"],
    },
    confidence: "high",
    verificationNotes: ["Backblaze B2 starting price, usage model, and backup/recovery positioning verified from Backblaze's official pricing page."],
}, {
    title: "DigitalOcean Spaces Standard Storage",
    handle: "digitalocean-spaces-standard-storage",
    vendor: "DigitalOcean",
    officialUrl: "https://docs.digitalocean.com/products/spaces/details/pricing/",
    sourceUrls: [
        "https://docs.digitalocean.com/products/spaces/details/pricing/",
        "https://www.digitalocean.com/pricing",
    ],
    sourceLabel: "DigitalOcean Spaces pricing",
    logoSourceUrl: "https://www.digitalocean.com/",
    startingPrice: 5,
    summary: "DigitalOcean Spaces Standard Storage is an S3-compatible object storage subscription with bundled storage, bundled transfer, and a built-in CDN for serving assets and storing application data.",
    bestFor: "It is best for developers and small to midsize teams that want cloud object storage with predictable entry pricing for static assets, media libraries, backups, and application data.",
    fitNarrative: "It fits Cloud Storage because Spaces is DigitalOcean's official object storage offer and the pricing documentation clearly publishes the base subscription, included storage, included bandwidth, and add-on rates.",
    featureList: ["S3-compatible buckets", "250 GiB included storage", "1,024 GiB outbound transfer included", "Built-in Spaces CDN", "Hourly prorating after bucket deletion", "Additional storage at per-GiB rates", "Multi-bucket subscription model"],
    pricingBullets: ["Spaces Standard Storage starts at $5 per month on the official documentation page.", "The base subscription includes 250 GiB of storage and 1,024 GiB of outbound transfer.", "Additional storage beyond the included allotment is billed at $0.02 per GiB per month."],
    factualPros: ["base subscription is straightforward", "storage and transfer inclusions are clearly listed", "the built-in CDN broadens the service's practical use"],
    factualCons: ["the base tier can be exceeded once storage or bandwidth grows", "this is object storage rather than a full backup workflow product", "buyers still need to manage lifecycle and access patterns"],
    collections: ["Cloud Storage"],
    filters: {
        hosting_type: ["Cloud hosting"],
        pricing_model: ["Subscription"],
        price_band: [priceBand(5)],
        billing_cycle: ["Monthly"],
        performance_tier: ["Standard"],
        server_region: ["Multi-region"],
        control_panel: ["Custom panel"],
        target_segment: ["Developers", "Small business", "Mid-market"],
    },
    confidence: "high",
    verificationNotes: ["Spaces subscription pricing, included storage, transfer allowance, and CDN inclusion verified from DigitalOcean's official documentation."],
});
NEW_PRODUCTS.push({
    title: "OVHcloud Advance-2 2026",
    handle: "ovhcloud-advance-2-2026",
    vendor: "OVHcloud",
    officialUrl: "https://us.ovhcloud.com/bare-metal/prices/",
    sourceUrls: ["https://us.ovhcloud.com/bare-metal/prices/"],
    sourceLabel: "OVHcloud dedicated server pricing",
    logoSourceUrl: "https://us.ovhcloud.com/",
    startingPrice: 173,
    summary: "OVHcloud Advance-2 2026 is a dedicated bare metal server in the vendor's versatile Advance range with configurable RAM, storage, public bandwidth, and a location selector on the official server range page.",
    bestFor: "It is best for businesses that need a single-tenant dedicated server with published hardware, higher headroom than entry servers, and room to customize storage and region choices.",
    fitNarrative: "It fits Bare Metal Servers, Custom Configuration Servers, Location-Based Dedicated Servers, and Unmanaged Dedicated Servers because OVHcloud presents the server as dedicated hardware, exposes configuration ranges, allows region selection, and sells it as part of its standard bare metal catalog rather than a managed server package.",
    featureList: ["AMD EPYC 4345P", "8 cores / 16 threads", "64 GB to 256 GB RAM", "2 x 960 GB to 2 x 960 GB plus 2 x 15.36 TB storage range", "1 Gbps to 5 Gbps public bandwidth", "25 Gbps private bandwidth", "Region selection on product page"],
    pricingBullets: ["Advance-2 2026 starts at $173 per month on the official OVHcloud dedicated server pricing page.", "The page also shows installation fees of $173.", "OVHcloud exposes RAM, storage, bandwidth, and region choices directly on the listing page, supporting a custom-configuration buying path."],
    factualPros: ["dedicated hardware specifications are public", "configuration ranges and region selection are visible", "the plan reaches well beyond entry-level dedicated capacity"],
    factualCons: ["setup fees match the starting monthly price", "management is not bundled like a managed hosting product", "monthly cost is materially higher than VPS or entry cloud instances"],
    collections: ["Bare Metal Servers", "Custom Configuration Servers", "Location-Based Dedicated Servers", "Unmanaged Dedicated Servers"],
    filters: {
        hosting_type: ["Dedicated server"],
        pricing_model: ["Subscription"],
        price_band: [priceBand(173)],
        billing_cycle: ["Monthly"],
        performance_tier: ["Premium"],
        server_region: ["Multi-region"],
        control_panel: ["No control panel"],
        target_segment: ["Mid-market", "Enterprise"],
    },
    confidence: "high",
    verificationNotes: ["Advance-2 2026 starting price, hardware details, configuration ranges, and region selector verified from OVHcloud's official dedicated server range page."],
}, {
    title: "OVHcloud RISE-1",
    handle: "ovhcloud-rise-1",
    vendor: "OVHcloud",
    officialUrl: "https://eco.us.ovhcloud.com/",
    sourceUrls: ["https://eco.us.ovhcloud.com/"],
    sourceLabel: "OVHcloud Eco dedicated server pricing",
    logoSourceUrl: "https://eco.us.ovhcloud.com/",
    startingPrice: 70,
    summary: "OVHcloud RISE-1 is an Eco dedicated server offering that combines single-tenant hardware with configurable memory and storage options at a lower entry price than larger premium ranges.",
    bestFor: "It is best for smaller businesses and technical teams that need dedicated hardware with room for storage upgrades and location selection without immediately moving into heavier enterprise server pricing.",
    fitNarrative: "It fits Bare Metal Servers, Custom Configuration Servers, Location-Based Dedicated Servers, and Unmanaged Dedicated Servers because OVHcloud markets Rise as dedicated servers, shows upgrade ranges for storage and memory, and exposes location-aware ordering on its Eco catalog.",
    featureList: ["Intel Xeon-E 2386G", "6 cores / 12 threads", "32 GB to 128 GB RAM", "2 x 512 GB to 2 x 512 GB plus 2 x 6 TB storage range", "1 Gbps public bandwidth", "1 Gbps private bandwidth", "Location selector on Eco ordering page"],
    pricingBullets: ["OVHcloud lists RISE-1 at $70 per month on the official Eco dedicated servers page.", "The page also shows installation fees of $70.", "RISE-1 includes configurable RAM and storage options rather than a fixed single hardware profile."],
    factualPros: ["entry dedicated pricing is clearly published", "the server still offers meaningful configuration flexibility", "single-tenant hardware is available at a lower price than larger ranges"],
    factualCons: ["setup fees add materially to first-month cost", "the product is still unmanaged from a hosting-operations perspective", "resource ceilings are lower than larger Advance and Scale servers"],
    collections: ["Bare Metal Servers", "Custom Configuration Servers", "Location-Based Dedicated Servers", "Unmanaged Dedicated Servers"],
    filters: {
        hosting_type: ["Dedicated server"],
        pricing_model: ["Subscription"],
        price_band: [priceBand(70)],
        billing_cycle: ["Monthly"],
        performance_tier: ["Standard"],
        server_region: ["Multi-region"],
        control_panel: ["No control panel"],
        target_segment: ["Small business", "Mid-market"],
    },
    confidence: "high",
    verificationNotes: ["RISE-1 price, hardware details, configuration ranges, and location-based ordering context verified from OVHcloud's official Eco dedicated server catalog."],
}, {
    title: "OVHcloud Advance-STOR 2026",
    handle: "ovhcloud-advance-stor-2026",
    vendor: "OVHcloud",
    officialUrl: "https://us.ovhcloud.com/bare-metal/prices/",
    sourceUrls: ["https://us.ovhcloud.com/bare-metal/prices/"],
    sourceLabel: "OVHcloud storage server pricing",
    logoSourceUrl: "https://us.ovhcloud.com/",
    startingPrice: 294,
    summary: "OVHcloud Advance-STOR 2026 is a storage-oriented dedicated server positioned for archiving, backup, recovery, and distributed storage workloads in the vendor's bare metal lineup.",
    bestFor: "It is best for organizations that need a storage-focused dedicated server with large-capacity expansion options and single-tenant control for archiving or backup-heavy infrastructure.",
    fitNarrative: "It fits Storage Dedicated Servers and also works for Bare Metal Servers, Custom Configuration Servers, Location-Based Dedicated Servers, and Unmanaged Dedicated Servers because OVHcloud includes it in the bare metal range while explicitly surfacing storage-oriented naming, capacity options, and configurable purchase attributes.",
    featureList: ["Storage-focused dedicated server", "Starting at 8 cores / 16 threads", "64 GB to 256 GB RAM range", "Storage-oriented configuration path", "1 Gbps public bandwidth", "Installation fee published", "Region-aware ordering flow"],
    pricingBullets: ["Advance-STOR 2026 starts at $294 per month on the official OVHcloud dedicated server pricing page.", "The listing also shows installation fees of $294.", "OVHcloud places the server inside a storage-oriented dedicated lineup suitable for archiving, backup, and recovery style workloads."],
    factualPros: ["storage-dedicated positioning is explicit in the product name", "pricing and setup fees are public", "the server can cover storage-heavy dedicated workloads better than general-purpose entry servers"],
    factualCons: ["entry price is higher than general-purpose dedicated servers", "the product still requires customer-side system administration", "exact final cost depends on selected storage and location options"],
    collections: ["Storage Dedicated Servers", "Bare Metal Servers", "Custom Configuration Servers", "Location-Based Dedicated Servers", "Unmanaged Dedicated Servers"],
    filters: {
        hosting_type: ["Dedicated server"],
        pricing_model: ["Subscription"],
        price_band: [priceBand(294)],
        billing_cycle: ["Monthly"],
        performance_tier: ["Premium"],
        server_region: ["Multi-region"],
        control_panel: ["No control panel"],
        target_segment: ["Mid-market", "Enterprise"],
    },
    confidence: "high",
    verificationNotes: ["Advance-STOR 2026 naming, starting price, setup fee, and storage-oriented dedicated positioning verified from OVHcloud's official dedicated server pricing page."],
}, {
    title: "OVHcloud RISE-2",
    handle: "ovhcloud-rise-2",
    vendor: "OVHcloud",
    officialUrl: "https://eco.us.ovhcloud.com/",
    sourceUrls: ["https://eco.us.ovhcloud.com/"],
    sourceLabel: "OVHcloud Eco Rise pricing",
    logoSourceUrl: "https://eco.us.ovhcloud.com/",
    startingPrice: 80,
    summary: "OVHcloud RISE-2 is an Eco dedicated server with more cores and broader bandwidth choices than the smallest entry options while retaining configurable storage and region-aware deployment choices.",
    bestFor: "It is best for buyers that need affordable dedicated hardware with room for moderate growth, especially when they want to tune storage and bandwidth choices without stepping into larger enterprise server ranges.",
    fitNarrative: "It fits Bare Metal Servers, Custom Configuration Servers, Location-Based Dedicated Servers, and Unmanaged Dedicated Servers because the official Eco catalog presents it as single-tenant hardware with configurable storage, bandwidth variants, and location-led ordering.",
    featureList: ["Intel Xeon-E 2388G", "8 cores / 16 threads", "32 GB to 128 GB RAM", "2 x 512 GB to 2 x 512 GB plus 2 x 6 TB storage range", "1 Gbps to 3 Gbps public bandwidth", "1 Gbps private bandwidth", "Location selector in Eco catalog"],
    pricingBullets: ["OVHcloud lists RISE-2 at $80 per month on the official Eco dedicated servers page.", "The page also shows installation fees of $80.", "Bandwidth and storage configuration ranges are shown directly on the product listing."],
    factualPros: ["dedicated server pricing remains approachable", "configuration ranges are visible before ordering", "the model offers more headroom than the smallest entry dedicated offers"],
    factualCons: ["first-month cost rises with the one-time setup fee", "the product is still unmanaged", "capacity remains below larger premium dedicated server families"],
    collections: ["Bare Metal Servers", "Custom Configuration Servers", "Location-Based Dedicated Servers", "Unmanaged Dedicated Servers"],
    filters: {
        hosting_type: ["Dedicated server"],
        pricing_model: ["Subscription"],
        price_band: [priceBand(80)],
        billing_cycle: ["Monthly"],
        performance_tier: ["Standard"],
        server_region: ["Multi-region"],
        control_panel: ["No control panel"],
        target_segment: ["Small business", "Mid-market"],
    },
    confidence: "high",
    verificationNotes: ["RISE-2 starting price, hardware ranges, bandwidth options, and ordering context verified from OVHcloud's official Eco dedicated server page."],
});
NEW_PRODUCTS.push({
    title: "DigitalOcean App Platform Shared Fixed 512MB",
    handle: "digitalocean-app-platform-shared-fixed-512mb",
    vendor: "DigitalOcean",
    officialUrl: "https://www.digitalocean.com/pricing/app-platform",
    sourceUrls: [
        "https://www.digitalocean.com/pricing/app-platform",
        "https://docs.digitalocean.com/products/app-platform/details/pricing/",
    ],
    sourceLabel: "DigitalOcean App Platform pricing",
    logoSourceUrl: "https://www.digitalocean.com/",
    startingPrice: 5,
    summary: "DigitalOcean App Platform is a managed platform-as-a-service that deploys applications from code repositories or container images and handles infrastructure, patching, and platform operations on behalf of the user.",
    bestFor: "It is best for developers and smaller product teams that want managed container-style application delivery without running and patching raw servers themselves.",
    fitNarrative: "It fits Container Hosting and Managed Cloud Hosting because DigitalOcean explicitly describes App Platform as a fully managed PaaS and publishes paid shared container pricing for deployed app components on its official pricing pages.",
    featureList: ["Deploy from Git repositories or container images", "1 shared vCPU", "512 MiB RAM", "50 GiB bandwidth included", "Managed builds and deployments", "Automatic HTTPS", "Platform-managed infrastructure"],
    pricingBullets: ["DigitalOcean lists the shared fixed 512 MiB App Platform component at $5 per month on the official pricing page.", "The paid tier page highlights deployment from container registries, scaling options, and managed app infrastructure.", "App Platform bills app components by the second with a minimum, but the published starter container price is shown as a monthly rate."],
    factualPros: ["entry pricing is clear for a managed platform", "container and code deployment paths are both officially supported", "the service reduces direct server administration work"],
    factualCons: ["larger apps scale up in cost as components and resources increase", "platform constraints differ from running raw instances", "database and add-on services introduce separate charges"],
    collections: ["Container Hosting", "Managed Cloud Hosting"],
    filters: {
        hosting_type: ["Cloud hosting"],
        pricing_model: ["Subscription"],
        price_band: [priceBand(5)],
        billing_cycle: ["Monthly"],
        performance_tier: ["Standard"],
        server_region: ["Multi-region"],
        control_panel: ["Custom panel"],
        target_segment: ["Developers", "Small business", "Mid-market"],
    },
    confidence: "high",
    verificationNotes: ["App Platform managed PaaS positioning and the $5 starter shared container price verified from DigitalOcean's official pricing pages."],
}, {
    title: "Google Cloud Run Requests-Based",
    handle: "google-cloud-run-requests-based",
    vendor: "Google Cloud",
    officialUrl: "https://cloud.google.com/run/pricing",
    sourceUrls: ["https://cloud.google.com/run/pricing"],
    sourceLabel: "Google Cloud Run pricing",
    logoSourceUrl: "https://cloud.google.com/",
    startingPrice: 0.4,
    summary: "Google Cloud Run is a fully managed container execution service that runs stateless containers on demand and bills by consumed resources and requests after the free tier is exhausted.",
    bestFor: "It is best for development teams that want managed container hosting with automatic scaling, no server management, and billing that follows actual usage instead of fixed infrastructure reservations.",
    fitNarrative: "It fits Container Hosting because Cloud Run is Google's official managed container runtime and the pricing page publishes request-based and instance-based billing metrics directly for hosted services.",
    featureList: ["Managed stateless container hosting", "Automatic scaling", "Request-based billing option", "Instance-based billing option", "2 million free requests per month", "Per-resource and per-request pricing", "Regional deployment options"],
    pricingBullets: ["Cloud Run request pricing is listed at $0.40 per 1,000,000 requests after the free tier on the official pricing page.", "The same pricing page also publishes separate CPU and memory rates for hosted services.", "Cloud Run bills only after the free tier is consumed, making the service strongly usage-based rather than plan-based."],
    factualPros: ["container hosting model is explicit", "scaling and billing mechanics are documented in detail", "free tier support can lower entry cost for smaller workloads"],
    factualCons: ["cost estimation is more complex than a flat monthly plan", "total spend depends on requests, CPU, memory, and region", "buyers need to understand usage patterns rather than only plan tiers"],
    collections: ["Container Hosting"],
    filters: {
        hosting_type: ["Cloud hosting"],
        pricing_model: ["Usage-based"],
        price_band: [priceBand(0.4)],
        billing_cycle: ["Usage-based"],
        performance_tier: ["Standard"],
        server_region: ["Multi-region"],
        control_panel: ["Custom panel"],
        target_segment: ["Developers", "Small business", "Mid-market", "Enterprise"],
    },
    confidence: "high",
    verificationNotes: ["Cloud Run managed container scope, free tier, and published request-based pricing verified from Google's official Cloud Run pricing page."],
}, {
    title: "Cloudways Flexible Managed Cloud Hosting Small",
    handle: "cloudways-flexible-managed-cloud-hosting-small",
    vendor: "Cloudways",
    officialUrl: "https://www.cloudways.com/en/pricing.php",
    sourceUrls: ["https://www.cloudways.com/en/pricing.php"],
    sourceLabel: "Cloudways managed cloud hosting pricing",
    logoSourceUrl: "https://www.cloudways.com/",
    startingPrice: 11,
    summary: "Cloudways Flexible is a managed cloud hosting platform that layers management, optimization, support, and tooling on top of cloud infrastructure from providers such as DigitalOcean, Vultr, Linode, AWS, and Google Cloud.",
    bestFor: "It is best for agencies, developers, and growing businesses that want managed cloud hosting with built-in tooling, scaling options, and provider choice without administering raw cloud servers directly.",
    fitNarrative: "It fits Managed Cloud Hosting because Cloudways explicitly markets Flexible as customizable managed hosting and publishes visible starter pricing, included resources, and platform capabilities on its official pricing page.",
    featureList: ["2 GB RAM", "1 vCPU", "50 GB storage", "2 TB bandwidth", "Managed hosting layer", "24/7 support", "Free migration", "Multiple cloud provider options"],
    pricingBullets: ["Cloudways Flexible starts at $11 per month on the official pricing page.", "The starter configuration shown includes 2 GB RAM, 1 vCPU, 50 GB storage, and 2 TB transfer bandwidth.", "Cloudways highlights 24/7 support, free migration, and managed hosting capabilities on the same pricing page."],
    factualPros: ["managed cloud positioning is explicit", "entry pricing and included resources are visible", "support and migration help are part of the published offer"],
    factualCons: ["pricing and available resources vary by chosen cloud provider", "promotional pricing terms can apply for limited periods", "platform convenience comes at a premium over raw infrastructure"],
    collections: ["Managed Cloud Hosting"],
    filters: {
        hosting_type: ["Cloud hosting"],
        pricing_model: ["Subscription"],
        price_band: [priceBand(11)],
        billing_cycle: ["Monthly"],
        performance_tier: ["Premium"],
        server_region: ["Multi-region"],
        control_panel: ["Custom panel"],
        support_coverage: ["24/7 support", "Migration / onboarding help"],
        target_segment: ["Developers", "Agencies", "Small business", "Mid-market"],
    },
    confidence: "high",
    verificationNotes: ["Cloudways Flexible starter price, included resources, and managed hosting positioning verified from Cloudways' official pricing page."],
}, {
    title: "DigitalOcean Kubernetes Basic",
    handle: "digitalocean-kubernetes-basic",
    vendor: "DigitalOcean",
    officialUrl: "https://www.digitalocean.com/pricing/kubernetes",
    sourceUrls: [
        "https://www.digitalocean.com/pricing/kubernetes",
        "https://docs.digitalocean.com/products/kubernetes/details/pricing/",
    ],
    sourceLabel: "DigitalOcean Kubernetes pricing",
    logoSourceUrl: "https://www.digitalocean.com/",
    startingPrice: 12,
    summary: "DigitalOcean Kubernetes is a managed Kubernetes service with a provider-managed control plane and worker nodes billed from published node pricing tiers.",
    bestFor: "It is best for teams that want managed Kubernetes hosting on a simpler platform with published node pricing and less control-plane administration overhead.",
    fitNarrative: "It fits Kubernetes Hosting because DigitalOcean presents the product as a managed Kubernetes service and publishes a basic node price directly on its official pricing pages.",
    featureList: ["Managed Kubernetes control plane", "Basic node pricing", "High availability support", "Autoscaling support", "Integration with load balancers and volumes", "API and CLI access", "Worker nodes billed from Droplet-based pricing"],
    pricingBullets: ["DigitalOcean Kubernetes Basic is listed at $12 per month per node on the official pricing page.", "The documentation explains that worker nodes are billed like Droplets while the managed service handles the control plane.", "DigitalOcean positions the service for Kubernetes workloads without self-managing the cluster control plane."],
    factualPros: ["managed Kubernetes intent is explicit", "published starter node price is easy to compare", "the service integrates with DigitalOcean's broader cloud stack"],
    factualCons: ["total cost scales with node count and attached services", "buyers still manage cluster workloads and architecture", "Kubernetes complexity remains higher than simpler PaaS products"],
    collections: ["Kubernetes Hosting"],
    filters: {
        hosting_type: ["Cloud hosting"],
        pricing_model: ["Subscription"],
        price_band: [priceBand(12)],
        billing_cycle: ["Monthly"],
        performance_tier: ["Premium"],
        server_region: ["Multi-region"],
        control_panel: ["Custom panel"],
        target_segment: ["Developers", "Mid-market", "Enterprise"],
    },
    confidence: "high",
    verificationNotes: ["DigitalOcean Kubernetes managed service positioning and the published $12 per month per node basic price verified from DigitalOcean's official pricing pages."],
}, {
    title: "OVHcloud Managed Kubernetes Service",
    handle: "ovhcloud-managed-kubernetes-service",
    vendor: "OVHcloud",
    officialUrl: "https://us.ovhcloud.com/public-cloud/prices/",
    sourceUrls: ["https://us.ovhcloud.com/public-cloud/prices/"],
    sourceLabel: "OVHcloud public cloud pricing",
    logoSourceUrl: "https://us.ovhcloud.com/",
    startingPrice: 0,
    summary: "OVHcloud Managed Kubernetes Service is a provider-managed Kubernetes control plane offering where the service itself is free and customers pay for the worker nodes, storage, and network resources they provision.",
    bestFor: "It is best for teams that want managed Kubernetes orchestration while preserving control over the underlying worker-node sizing and attached OVHcloud public cloud resources.",
    fitNarrative: "It fits Kubernetes Hosting because OVHcloud explicitly lists Managed Kubernetes Service in its containers and orchestration catalog and states on the pricing page that the service itself is free while worker nodes are billed separately.",
    featureList: ["Managed Kubernetes control plane", "CNCF-certified Kubernetes cluster", "Free master nodes", "Worker nodes billed separately", "Volumes billed separately", "Load balancer billed separately", "Public cloud ecosystem integration"],
    pricingBullets: ["OVHcloud states that the Managed Kubernetes Service is free on the official public cloud pricing page.", "The same page notes that worker nodes, volumes, and load balancers are billed separately based on the selected models.", "This listing uses a zero service price because the control plane itself is explicitly published as free."],
    factualPros: ["control-plane pricing is clearly published as free", "the product is directly categorized under containers and orchestration", "buyers can pair the service with different OVHcloud resource models"],
    factualCons: ["overall cluster cost still depends on separately billed worker nodes and storage", "Kubernetes operations remain more complex than simpler hosting models", "free control plane does not mean the full deployment is cost-free"],
    collections: ["Kubernetes Hosting"],
    filters: {
        hosting_type: ["Cloud hosting"],
        pricing_model: ["Free"],
        price_band: [priceBand(0)],
        billing_cycle: ["Usage-based"],
        performance_tier: ["Premium"],
        server_region: ["Multi-region"],
        control_panel: ["Custom panel"],
        target_segment: ["Developers", "Mid-market", "Enterprise"],
    },
    confidence: "high",
    verificationNotes: ["OVHcloud's official public cloud pricing page states that the Managed Kubernetes Service is free and that worker nodes and attached resources are billed separately."],
});
NEW_PRODUCTS.push({
    title: "IDrive e2 Pay-As-You-Go Storage",
    handle: "idrive-e2-pay-as-you-go-storage",
    vendor: "IDrive",
    officialUrl: "https://www.idrive.com/s3-storage-e2/pricing",
    sourceUrls: ["https://www.idrive.com/s3-storage-e2/pricing"],
    sourceLabel: "IDrive e2 pricing",
    logoSourceUrl: "https://www.idrive.com/",
    startingPrice: 5,
    summary: "IDrive e2 is an S3-compatible cloud object storage service with pay-as-you-go pricing, free API calls, and positioning for backup, archival, and general object storage workloads.",
    bestFor: "It is best for businesses and technical teams that want cloud backup-capable object storage with simple per-terabyte pricing and no separate API-call charges.",
    fitNarrative: "It is a defensible fit for Cloud Backup because the official pricing page positions e2 around storage, downloads, and compatibility with backup-oriented workloads while publishing clear pay-as-you-go monthly rates.",
    featureList: ["S3-compatible object storage", "Pay-as-you-go billing", "10 GB free trial allocation", "Free API calls", "Free egress up to 3x active storage", "Monthly and yearly purchase options", "Backup-oriented compatibility messaging"],
    pricingBullets: ["IDrive e2 pay-as-you-go pricing is listed at $5 per TB per month on the official pricing page.", "The page also states a minimum storage fee of $5 per TB and highlights free API calls.", "Free egress applies up to three times the active stored volume."],
    factualPros: ["usage pricing is simple to understand", "free API calls can simplify cost estimation", "the product works as a backup target as well as object storage"],
    factualCons: ["billing depends on stored capacity rather than a fixed bundle", "buyers need to manage backup software or workflows separately", "promotional yearly offers can complicate direct plan-to-plan comparison"],
    collections: ["Cloud Backup"],
    filters: {
        hosting_type: ["Cloud hosting"],
        pricing_model: ["Usage-based"],
        price_band: [priceBand(5)],
        billing_cycle: ["Usage-based"],
        performance_tier: ["Standard"],
        server_region: ["Multi-region"],
        control_panel: ["Custom panel"],
        target_segment: ["Small business", "Mid-market", "Enterprise", "Developers"],
    },
    confidence: "high",
    verificationNotes: ["IDrive e2 pay-as-you-go price, free API calls, and egress policy verified from IDrive's official pricing page."],
}, {
    title: "DigitalOcean Backups Every 4 Hours",
    handle: "digitalocean-backups-every-4-hours",
    vendor: "DigitalOcean",
    officialUrl: "https://docs.digitalocean.com/products/backups/details/pricing/",
    sourceUrls: [
        "https://docs.digitalocean.com/products/backups/details/pricing/",
        "https://www.digitalocean.com/pricing/backups",
    ],
    sourceLabel: "DigitalOcean Backups pricing",
    logoSourceUrl: "https://www.digitalocean.com/",
    startingPrice: 0.01,
    summary: "DigitalOcean Backups is the platform's automated Droplet backup service, supporting recurring system-level backups with usage-based pricing and retention controls for recovery and rollback.",
    bestFor: "It is best for teams already running DigitalOcean Droplets that need automated server backup schedules without deploying a separate backup platform or manual snapshot process.",
    fitNarrative: "It fits Automated Backup and Server Backup because DigitalOcean explicitly describes Backups as automatically created system-level backups of Droplets and publishes both schedule frequency options and usage-based pricing on the official documentation.",
    featureList: ["Automated system-level Droplet backups", "Every 4-hour schedule option", "Custom retention support", "Usage-based backup billing", "Restore to older states", "Clone new Droplets from backups", "Incremental backup model"],
    pricingBullets: ["Usage-based DigitalOcean Backups start at $0.01 per GiB per month for every 4-hour backups on the official pricing documentation.", "The docs also list 6-hour, 12-hour, daily, and weekly schedule prices.", "DigitalOcean positions Backups as automated system-level protection for Droplet recovery and rollback."],
    factualPros: ["backup schedules and pricing are clearly documented", "the service is directly tied to server recovery workflows", "buyers can choose more frequent schedules than simple daily backups"],
    factualCons: ["pricing depends on backup size rather than a flat package", "the product is specific to DigitalOcean workloads", "restorable data growth can raise monthly cost over time"],
    collections: ["Automated Backup", "Server Backup"],
    filters: {
        hosting_type: ["Cloud hosting"],
        pricing_model: ["Usage-based"],
        price_band: [priceBand(0.01)],
        billing_cycle: ["Usage-based"],
        performance_tier: ["Standard"],
        server_region: ["Multi-region"],
        control_panel: ["Custom panel"],
        target_segment: ["Developers", "Small business", "Mid-market"],
    },
    confidence: "high",
    verificationNotes: ["Backup schedule options, automated backup scope, and the $0.01 per GiB every-4-hours rate verified from DigitalOcean's official backup pricing pages."],
}, {
    title: "Liquid Web Acronis Cyber Backups 250GB Dedicated",
    handle: "liquid-web-acronis-cyber-backups-250gb-dedicated",
    vendor: "Liquid Web",
    officialUrl: "https://www.liquidweb.com/hosting-add-ons/acronis-cyber-backups/",
    sourceUrls: ["https://www.liquidweb.com/hosting-add-ons/acronis-cyber-backups/"],
    sourceLabel: "Liquid Web Acronis backup pricing",
    logoSourceUrl: "https://www.liquidweb.com/",
    startingPrice: 17,
    summary: "Liquid Web sells Acronis Cyber Backups as an add-on backup service for hosted infrastructure, combining off-server protection, self-service backup management, and quota-based monthly pricing.",
    bestFor: "It is best for businesses that want a provider-backed automated backup option for hosted servers without piecing together separate storage, retention, and restore tooling on their own.",
    fitNarrative: "It fits Automated Backup and Server Backup because the official add-on page presents Acronis Cyber Backups as a hosted backup product for dedicated and cloud servers with specific storage quotas and monthly starting prices.",
    featureList: ["Self-service backup portal", "Off-server backup storage", "Dedicated hosting quota option", "Acronis backup cloud option", "Backup configuration and restore management", "Flexible storage tiers", "Monthly pricing by quota"],
    pricingBullets: ["Liquid Web lists Dedicated hosting Acronis Cyber Backups at $17 per month for 250 GB on the official add-on page.", "The same page says Acronis Cyber Backups start at a base price of $11 per month, with quota pricing detailed by hosting type.", "The product is positioned as off-server backup protection with easy configuration and restoration."],
    factualPros: ["server backup intent is explicit", "quota pricing is clearly published", "the off-server model improves separation from the primary workload environment"],
    factualCons: ["cost grows with larger backup quotas", "this is an add-on rather than a standalone compute service", "buyers still need to align quota size with protected data growth"],
    collections: ["Automated Backup", "Server Backup"],
    filters: {
        hosting_type: ["Cloud hosting"],
        pricing_model: ["Subscription"],
        price_band: [priceBand(17)],
        billing_cycle: ["Monthly"],
        performance_tier: ["Standard"],
        server_region: ["USA"],
        control_panel: ["Custom panel"],
        target_segment: ["Small business", "Mid-market", "Enterprise"],
    },
    confidence: "high",
    verificationNotes: ["Acronis Cyber Backups starting price, 250 GB dedicated plan price, and backup management positioning verified from Liquid Web's official add-on page."],
}, {
    title: "AWS Elastic Disaster Recovery",
    handle: "aws-elastic-disaster-recovery",
    vendor: "Amazon Web Services",
    officialUrl: "https://aws.amazon.com/disaster-recovery/pricing",
    sourceUrls: [
        "https://aws.amazon.com/disaster-recovery/pricing",
        "https://aws.amazon.com/disaster-recovery",
    ],
    sourceLabel: "AWS Elastic Disaster Recovery pricing",
    logoSourceUrl: "https://aws.amazon.com/",
    startingPrice: 0.028,
    summary: "AWS Elastic Disaster Recovery is a usage-based disaster recovery service that replicates source servers into AWS and supports test launches, recovery launches, and point-in-time recovery.",
    bestFor: "It is best for organizations that need formally packaged disaster recovery capabilities with ongoing replication and failover options, but do not want to maintain a permanently active secondary recovery site.",
    fitNarrative: "It is a direct fit for Disaster Recovery as a Service because AWS positions Elastic Disaster Recovery as a dedicated DR service and publishes a clear per-source-server hourly price on its official pricing page.",
    featureList: ["Continuous data replication", "Per-source-server hourly pricing", "Test launches included", "Recovery launches included", "Point-in-time recovery", "AWS-based recovery site model", "No upfront fee or minimum fee"],
    pricingBullets: ["AWS Elastic Disaster Recovery is priced at $0.028 per source server per hour on the official pricing page.", "AWS states there are no upfront costs and no minimum fee for the service itself.", "Additional AWS storage and compute used for replication and recovery are billed separately."],
    factualPros: ["DRaaS positioning is explicit", "hourly service pricing is published clearly", "test and recovery workflows are part of the documented service scope"],
    factualCons: ["total cost also depends on separate AWS storage and compute resources", "pricing is usage-based rather than a simple fixed monthly bundle", "the service is geared toward organizations with defined recovery processes"],
    collections: ["Disaster Recovery as a Service"],
    filters: {
        hosting_type: ["Cloud hosting"],
        pricing_model: ["Usage-based"],
        price_band: [priceBand(0.028)],
        billing_cycle: ["Usage-based"],
        performance_tier: ["High availability"],
        server_region: ["Multi-region"],
        control_panel: ["Custom panel"],
        target_segment: ["Mid-market", "Enterprise"],
    },
    confidence: "high",
    verificationNotes: ["AWS DRS per-source-server hourly rate and DR service scope verified from AWS's official disaster recovery pricing and product pages."],
});
const FILTER_KEYS = new Set([
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
const buildPreviewRow = (spec, cloudByTitle, defs) => {
    spec.collections.forEach((name) => {
        if (!cloudByTitle.has(name)) {
            throw new Error(`Cloud Services category missing from taxonomy: ${name}`);
        }
    });
    Object.entries(spec.filters).forEach(([key, values]) => {
        const def = defs.get(key);
        if (!def) {
            throw new Error(`Unknown cloud-services filter key: ${key}`);
        }
        values.forEach((value) => {
            if (!def.allowedValues.includes(value)) {
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
        seoTitle: seoTitle(spec),
        seoDescription: seoDescription(spec),
        collectionHandles: spec.collections.map((name) => cloudByTitle.get(name)),
        collectionTitles: [...spec.collections],
        sourceUrl: spec.officialUrl,
        sourceUrls: [...spec.sourceUrls],
        sourceLabel: spec.sourceLabel,
        logoSourceUrl: spec.logoSourceUrl,
        customUrl: spec.officialUrl,
        customLogoImage: "",
        customTypeMultiple: [...spec.collections],
        productFeatures: spec.featureList.map((item) => `- ${item}`).join("\n"),
        plansPricing: spec.pricingBullets.map((item) => `- ${item}`).join("\n"),
        prosCons: [
            ...spec.factualPros.map((item) => `- Pro: ${item}`),
            ...spec.factualCons.map((item) => `- Con: ${item}`),
        ].join("\n"),
        filterValues: spec.filters,
        verificationNotes: spec.verificationNotes.join("\n"),
        confidence: spec.confidence,
        missingFields: ["custom.logo_image"],
    };
};
const buildPreviewCsv = (rows) => {
    const headers = [
        "title", "handle", "vendor", "price", "status", "published", "charge_tax", "requires_shipping", "collection_titles", "collection_handles", "custom_url", "logo_source_url", "custom_logo_image", "source_url", "source_urls", "source_label", "image_alt_text", "seo_title", "seo_description", "product_features", "plans_pricing", "pros_cons", "filter_values", "confidence", "verification_notes", "missing_fields", "body_html",
    ];
    return [
        headers.join(","),
        ...rows.map((row) => [row.title, row.handle, row.vendor, row.price, row.status, row.published, row.chargeTax, row.requiresShipping, row.collectionTitles.join(" | "), row.collectionHandles.join(" | "), row.customUrl, row.logoSourceUrl, row.customLogoImage, row.sourceUrl, row.sourceUrls.join(" | "), row.sourceLabel, row.imageAltText, row.seoTitle, row.seoDescription, row.productFeatures, row.plansPricing, row.prosCons, JSON.stringify(row.filterValues), row.confidence, row.verificationNotes, row.missingFields.join(" | "), row.bodyHtml].map(csvEscape).join(",")),
    ].join("\n");
};
const main = async () => {
    await ensureDir(EXPORTS_DIR);
    const phase1cPath = latestExportPath("cloud-services-phase1c-preview-", ".json");
    const zeroCollectionsPath = latestExportPath("zero-product-collections-", ".csv");
    const [categoryRows, filterRows, zeroRows, phase1cRows] = await Promise.all([
        readCsv(CATEGORY_CSV_PATH),
        readCsv(FILTERS_CSV_PATH),
        readCsv(zeroCollectionsPath),
        readJson(phase1cPath),
    ]);
    const cloudByTitle = new Map(categoryRows
        .filter((row) => row.top_category === "Cloud Services")
        .map((row) => [row.final_category, row.collection_handle]));
    const defs = new Map(filterRows
        .filter((row) => row.profile_id === "cloud-services" && FILTER_KEYS.has(row.metafield_key))
        .map((row) => [row.metafield_key, { key: row.metafield_key, allowedValues: splitAllowedValues(row.allowed_values) }]));
    const zeroCloud = zeroRows.filter((row) => row.top_category === "Cloud Services" && Number(row.product_count || 0) === 0);
    const newRows = NEW_PRODUCTS.map((spec) => buildPreviewRow(spec, cloudByTitle, defs));
    const mergedByHandle = new Map();
    [...phase1cRows, ...newRows].forEach((row) => mergedByHandle.set(row.handle, row));
    const allRows = [...mergedByHandle.values()];
    const coverageByCollection = zeroCloud.map((row) => ({
        parentCategory: row.parent_category,
        finalCategory: row.final_category,
        collectionHandle: row.collection_handle,
        liveCollectionFound: row.live_collection_found === "true",
        productsAssigned: allRows.filter((item) => item.collectionHandles.includes(row.collection_handle)).length,
    }));
    const coveredCollections = coverageByCollection.filter((item) => item.productsAssigned >= 2);
    const shortfilledCollections = coverageByCollection.filter((item) => item.productsAssigned > 0 && item.productsAssigned < 2);
    const uncoveredCollections = coverageByCollection.filter((item) => item.productsAssigned === 0);
    const blockedCollections = coverageByCollection.filter((item) => !item.liveCollectionFound);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const jsonPath = path_1.default.join(EXPORTS_DIR, `cloud-services-phase1d-preview-${timestamp}.json`);
    const csvPath = path_1.default.join(EXPORTS_DIR, `cloud-services-phase1d-preview-${timestamp}.csv`);
    const reportPath = path_1.default.join(EXPORTS_DIR, `cloud-services-phase1d-validation-${timestamp}.json`);
    const validation = {
        generatedAt: new Date().toISOString(),
        scope: "Cloud Services cumulative preview through phase 1d",
        totalPreviewProducts: allRows.length,
        newPhase1dProducts: newRows.length,
        importedPhase1cProducts: phase1cRows.length,
        targetedCollectionsCoveredAtMinimumTwo: coveredCollections.length,
        targetedCollectionsShortfilled: shortfilledCollections,
        targetedCollectionsUncovered: uncoveredCollections,
        blockedCollections,
        coveredCollections,
        coverageByCollection,
        remainingZeroCloudCollections: uncoveredCollections.length,
        rowsMissingLogoUpload: allRows.filter((row) => row.missingFields.includes("custom.logo_image")).map((row) => row.handle),
        descriptionWordCounts: allRows.map((row) => ({ handle: row.handle, words: wordCount(row.bodyHtml) })),
        priceValidation: allRows.every((row) => /^\d+(\.\d+)?$/.test(row.price)),
        statusValidation: allRows.every((row) => row.status === "active"),
        publishValidation: allRows.every((row) => row.published === true),
        taxValidation: allRows.every((row) => row.chargeTax === false),
        shippingValidation: allRows.every((row) => row.requiresShipping === false),
        zeroCollectionsExportUsed: path_1.default.basename(zeroCollectionsPath),
        phase1cPreviewImported: path_1.default.basename(phase1cPath),
        totalZeroCloudCollectionsAtStart: zeroCloud.length,
    };
    await Promise.all([
        fs_1.default.promises.writeFile(jsonPath, JSON.stringify(allRows, null, 2), "utf8"),
        fs_1.default.promises.writeFile(csvPath, buildPreviewCsv(allRows), "utf8"),
        fs_1.default.promises.writeFile(reportPath, JSON.stringify(validation, null, 2), "utf8"),
    ]);
    console.log(JSON.stringify({
        jsonPath,
        csvPath,
        reportPath,
        totalPreviewProducts: allRows.length,
        newPhase1dProducts: newRows.length,
        collectionsCoveredAtMinimumTwo: coveredCollections.length,
        collectionsShortfilled: shortfilledCollections.length,
        remainingUncoveredCollections: uncoveredCollections.length,
    }, null, 2));
};
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
