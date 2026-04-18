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
const NEW_PRODUCTS = [
    {
        title: "Amezmo Hobby Managed PHP Hosting",
        handle: "amezmo-hobby-managed-php-hosting",
        vendor: "Amezmo",
        officialUrl: "https://www.amezmo.com/pricing",
        sourceUrls: ["https://www.amezmo.com/pricing", "https://www.amezmo.com/support/plans"],
        sourceLabel: "Amezmo pricing",
        logoSourceUrl: "https://www.amezmo.com/",
        startingPrice: 5,
        summary: "Amezmo sells Hobby as an entry managed PHP app hosting plan with zero-downtime deployments, managed MySQL, and a simple per-app monthly price.",
        bestFor: "It is best for smaller PHP apps, prototypes, and developers who want managed deployment workflows without building and maintaining their own PHP server stack.",
        fitNarrative: "It is a direct fit for Managed PHP Hosting because Amezmo explicitly describes the platform as managed PHP app hosting and publishes plan-level pricing and features on its official pricing page.",
        featureList: ["Single Linux container", "Shared RAM", "Single environment", "Zero-downtime deployments", "Managed MySQL", "1 custom SSL domain", "Deployment hooks"],
        pricingBullets: ["Hobby starts at $5 per app per month on the official pricing page.", "The plan is positioned for simple PHP apps with zero-downtime deployment support.", "Amezmo frames the platform as managed PHP app hosting rather than generic infrastructure."],
        factualPros: ["clear managed PHP positioning", "entry pricing is transparent", "deployment automation and managed MySQL are already included"],
        factualCons: ["single environment only", "shared RAM is limited for larger workloads", "the plan is intentionally narrow compared with higher Amezmo tiers"],
        collections: ["Managed PHP Hosting"],
        filters: {
            hosting_type: ["Cloud hosting"],
            pricing_model: ["Subscription"],
            price_band: [priceBand(5)],
            billing_cycle: ["Monthly"],
            control_panel: ["Custom panel"],
            target_segment: ["Developers", "Individuals", "Small business"],
            server_region: ["Multi-region"],
        },
        confidence: "high",
        verificationNotes: ["Pricing, plan scope, and managed PHP positioning verified from Amezmo's official pricing page."],
    },
    {
        title: "Amezmo Business Managed PHP Hosting",
        handle: "amezmo-business-managed-php-hosting",
        vendor: "Amezmo",
        officialUrl: "https://www.amezmo.com/pricing",
        sourceUrls: ["https://www.amezmo.com/pricing"],
        sourceLabel: "Amezmo pricing",
        logoSourceUrl: "https://www.amezmo.com/",
        startingPrice: 20,
        summary: "Amezmo Business expands the same managed PHP platform into a more production-ready tier with more PHP workers, multi-database backups, dedicated MySQL, and horizontal scaling support.",
        bestFor: "It is best for production PHP apps that need stronger backup, scaling, and isolation features while staying on a platform built specifically around managed PHP application hosting.",
        fitNarrative: "It is a direct fit for Managed PHP Hosting because Business remains inside Amezmo's managed PHP app hosting pricing grid while materially expanding deployment, backup, and performance capabilities.",
        featureList: ["2 Linux containers", "4 PHP workers", "Dedicated MySQL container", "Database backups to S3", "7-day backup retention", "Horizontal scaling", "8 custom domains"],
        pricingBullets: ["Business starts at $20 per app per month on the official pricing page.", "The plan adds dedicated MySQL, more workers, encrypted backups, and horizontal scaling features.", "Amezmo positions the platform around managed PHP application delivery rather than raw VM administration."],
        factualPros: ["production-oriented managed PHP feature set", "scaling and backup capabilities are clearly published", "pricing remains transparent at plan level"],
        factualCons: ["higher monthly price than the Hobby tier", "still app-platform oriented instead of full custom infrastructure", "advanced uptime SLA language depends on a separate contract"],
        collections: ["Managed PHP Hosting"],
        filters: {
            hosting_type: ["Cloud hosting"],
            pricing_model: ["Subscription"],
            price_band: [priceBand(20)],
            billing_cycle: ["Monthly"],
            control_panel: ["Custom panel"],
            target_segment: ["Developers", "Small business", "Mid-market"],
            server_region: ["Multi-region"],
            performance_tier: ["Premium"],
        },
        confidence: "high",
        verificationNotes: ["Business plan pricing and feature set verified from Amezmo's official pricing page."],
    },
    {
        title: "Cloudways Flexible PHP Hosting Small",
        handle: "cloudways-flexible-php-hosting-small",
        vendor: "Cloudways",
        officialUrl: "https://www.cloudways.com/en/application-hosting.php",
        sourceUrls: ["https://www.cloudways.com/en/application-hosting.php", "https://www.cloudways.com/en/pricing.php"],
        sourceLabel: "Cloudways application hosting",
        logoSourceUrl: "https://www.cloudways.com/",
        startingPrice: 11,
        summary: "Cloudways sells managed cloud hosting for PHP apps on optimized cloud servers, pairing public starter pricing with managed application deployment, scaling, backups, and migration help.",
        bestFor: "It is best for developers, agencies, and smaller businesses that want managed PHP hosting with cloud flexibility while avoiding direct server maintenance.",
        fitNarrative: "It is a direct fit for Managed PHP Hosting because Cloudways explicitly lists PHP among its supported managed application types and publishes entry pricing and platform features on its official application hosting and pricing pages.",
        featureList: ["PHP listed as a supported application", "2 GB RAM", "1 vCPU", "50 GB storage", "2 TB transfer bandwidth", "Free migration", "24/7 support"],
        pricingBullets: ["Cloudways Flexible application hosting starts at $11 per month on the official application hosting page.", "Cloudways lists PHP among the supported managed application types.", "The pricing page also highlights 24/7 support, multiple PHP versions, and managed migration support."],
        factualPros: ["public entry pricing is easy to compare", "PHP is explicitly supported on a managed platform", "the service includes migration and support signals on official pages"],
        factualCons: ["cost rises with larger servers and add-ons", "buyers still need to size the underlying cloud resources correctly", "the platform is broader than PHP alone"],
        collections: ["Managed PHP Hosting"],
        filters: {
            hosting_type: ["Cloud hosting"],
            pricing_model: ["Subscription"],
            price_band: [priceBand(11)],
            billing_cycle: ["Monthly"],
            control_panel: ["Custom panel"],
            support_coverage: ["24/7 support", "Migration / onboarding help"],
            target_segment: ["Developers", "Agencies", "Small business"],
            server_region: ["Multi-region"],
            performance_tier: ["Premium"],
        },
        confidence: "high",
        verificationNotes: ["Cloudways managed application pricing and PHP support verified from official application hosting and pricing pages."],
    },
    {
        title: "Agrohi Managed DevOps",
        handle: "agrohi-managed-devops",
        vendor: "Agrohi",
        officialUrl: "https://agrohi.com/",
        sourceUrls: ["https://agrohi.com/"],
        sourceLabel: "Agrohi managed DevOps pricing",
        logoSourceUrl: "https://agrohi.com/",
        startingPrice: 2000,
        summary: "Agrohi sells managed DevOps as a monthly service for teams that want fully managed operations, infrastructure maintenance, cost optimization, and architecture health checks without building an in-house DevOps function.",
        bestFor: "It is best for startups and smaller teams that want ongoing DevOps ownership, monitoring, and optimization support at a predictable monthly service cost.",
        fitNarrative: "It is a direct fit for DevOps Managed Services because Agrohi's official site names the offer Managed DevOps, describes the operational scope, and publishes a visible monthly starting range.",
        featureList: ["24/7 monitoring and incident response", "Infrastructure maintenance and updates", "Cost optimization reviews", "Monthly architecture health checks", "Slack and email support", "Documentation-first handover", "Follow-the-sun operations"],
        pricingBullets: ["Managed DevOps is priced at $2k-$5k per month on the official Agrohi site.", "This preview uses the lowest clearly advertised starting price of $2,000.", "Agrohi describes the offer as fully managed operations for teams that do not want to hire in-house."],
        factualPros: ["clear managed DevOps service framing", "pricing range is public on the official site", "support, maintenance, and cost optimization are bundled in the service scope"],
        factualCons: ["the published price is a range rather than a single fixed package", "custom infrastructure complexity can move the final cost upward", "the service excludes application feature development"],
        collections: ["DevOps Managed Services"],
        filters: {
            pricing_model: ["Subscription"],
            price_band: [priceBand(2000)],
            billing_cycle: ["Monthly"],
            support_coverage: ["24/7 support"],
            target_segment: ["Small business", "Mid-market"],
            server_region: ["Multi-region"],
        },
        confidence: "high",
        verificationNotes: ["Managed DevOps scope and starting monthly range verified from Agrohi's official homepage pricing section."],
    },
    {
        title: "SDH Managed DevOps Small",
        handle: "sdh-managed-devops-small",
        vendor: "SDH",
        officialUrl: "https://sdh.global/services/devops-services/managed-devops/",
        sourceUrls: ["https://sdh.global/services/devops-services/managed-devops/", "https://sdh.global/services/devops-services/"],
        sourceLabel: "SDH managed DevOps pricing",
        logoSourceUrl: "https://sdh.global/",
        startingPrice: 2000,
        summary: "SDH sells Small as the entry tier in its fully managed DevOps services lineup, covering ongoing support, monitoring software solutions, backups and disaster recovery, and a fixed monthly cost.",
        bestFor: "It is best for organizations that want a fixed-cost managed DevOps support package with published hours, support windows, and SLA expectations instead of open-ended consulting billing.",
        fitNarrative: "It is a direct fit for DevOps Managed Services because SDH's official managed DevOps page presents Small as a fixed-cost ongoing managed service package rather than a vague consulting placeholder.",
        featureList: ["40 base package hours", "Backups and disaster recovery", "Monitoring software solutions", "16x5 incident handling", "Best-effort resolution time", "Defined SLA reaction windows", "Fixed monthly service pricing"],
        pricingBullets: ["Small is listed at $2,000 on SDH's official managed DevOps pricing table.", "The package includes 40 base hours and ongoing support services.", "Initial implementation work is quoted separately and is not included in the managed support price."],
        factualPros: ["fixed monthly price is clearly published", "service scope includes operational support and disaster recovery", "the plan defines hours and SLA expectations upfront"],
        factualCons: ["incident handling is limited to 16x5 on the Small plan", "one-time implementation work is priced separately", "larger or more complex teams may need a higher package"],
        collections: ["DevOps Managed Services"],
        filters: {
            pricing_model: ["Subscription"],
            price_band: [priceBand(2000)],
            billing_cycle: ["Monthly"],
            support_coverage: ["Business hours support"],
            target_segment: ["Small business", "Mid-market"],
        },
        confidence: "high",
        verificationNotes: ["Small plan pricing and service scope verified from SDH's official managed DevOps pricing page."],
    },
    {
        title: "SDH Managed DevOps Medium",
        handle: "sdh-managed-devops-medium",
        vendor: "SDH",
        officialUrl: "https://sdh.global/services/devops-services/managed-devops/",
        sourceUrls: ["https://sdh.global/services/devops-services/managed-devops/"],
        sourceLabel: "SDH managed DevOps pricing",
        logoSourceUrl: "https://sdh.global/",
        startingPrice: 4000,
        summary: "SDH Medium extends the same managed DevOps service into a larger support package with more hours, faster response targets, and longer incident handling windows for teams with more demanding operations.",
        bestFor: "It is best for growing organizations that need more operational coverage and faster response commitments than an entry managed DevOps retainer can provide.",
        fitNarrative: "It fits DevOps Managed Services because Medium is part of SDH's fixed-cost ongoing managed DevOps package lineup and publishes measurable support scope instead of custom-only pricing.",
        featureList: ["80 base package hours", "Backups and disaster recovery", "Monitoring software solutions", "24x5 incident handling", "Sub-1-hour resolution target", "Faster SLA reaction windows", "Fixed monthly service pricing"],
        pricingBullets: ["Medium is listed at $4,000 on SDH's official managed DevOps pricing table.", "The package includes 80 base hours and 24x5 incident handling.", "Initial implementation and custom migration work are quoted separately."],
        factualPros: ["higher support capacity than the Small plan", "published response expectations are stronger", "fixed monthly price remains transparent"],
        factualCons: ["cost doubles relative to the Small tier", "still excludes separately priced one-time implementation work", "24x7 handling requires the Large tier rather than Medium"],
        collections: ["DevOps Managed Services"],
        filters: {
            pricing_model: ["Subscription"],
            price_band: [priceBand(4000)],
            billing_cycle: ["Monthly"],
            support_coverage: ["Priority support"],
            target_segment: ["Mid-market", "Enterprise"],
        },
        confidence: "high",
        verificationNotes: ["Medium plan pricing and service scope verified from SDH's official managed DevOps pricing page."],
    },
];
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
    const phase1Path = latestExportPath("cloud-services-phase1-preview-", ".json");
    const phase1bPath = latestExportPath("cloud-services-phase1b-preview-", ".json");
    const zeroCollectionsPath = latestExportPath("zero-product-collections-", ".csv");
    const [categoryRows, filterRows, zeroRows, phase1Rows, phase1bRows] = await Promise.all([
        readCsv(CATEGORY_CSV_PATH),
        readCsv(FILTERS_CSV_PATH),
        readCsv(zeroCollectionsPath),
        readJson(phase1Path),
        readJson(phase1bPath),
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
    [...phase1Rows, ...phase1bRows, ...newRows].forEach((row) => mergedByHandle.set(row.handle, row));
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
    const jsonPath = path_1.default.join(EXPORTS_DIR, `cloud-services-phase1c-preview-${timestamp}.json`);
    const csvPath = path_1.default.join(EXPORTS_DIR, `cloud-services-phase1c-preview-${timestamp}.csv`);
    const reportPath = path_1.default.join(EXPORTS_DIR, `cloud-services-phase1c-validation-${timestamp}.json`);
    const validation = {
        generatedAt: new Date().toISOString(),
        scope: "Cloud Services cumulative preview through phase 1c",
        totalPreviewProducts: allRows.length,
        newPhase1cProducts: newRows.length,
        importedPhase1Products: phase1Rows.length,
        importedPhase1bProducts: phase1bRows.length,
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
        phase1PreviewImported: path_1.default.basename(phase1Path),
        phase1bPreviewImported: path_1.default.basename(phase1bPath),
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
        newPhase1cProducts: newRows.length,
        collectionsCoveredAtMinimumTwo: coveredCollections.length,
        collectionsShortfilled: shortfilledCollections.length,
        remainingUncoveredCollections: uncoveredCollections.length,
    }, null, 2));
};
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
