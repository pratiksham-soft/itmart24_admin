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
        title: "InMotion OpenCart Hosting Power",
        handle: "inmotion-opencart-hosting-power",
        vendor: "InMotion Hosting",
        officialUrl: "https://www.inmotionhosting.com/opencart-hosting",
        sourceUrls: ["https://www.inmotionhosting.com/opencart-hosting"],
        sourceLabel: "InMotion OpenCart hosting",
        logoSourceUrl: "https://www.inmotionhosting.com/",
        startingPrice: 4.99,
        summary: "InMotion positions its Power tier as an OpenCart hosting plan for online stores that need higher NVMe storage, unmetered bandwidth, and support coverage on a hosting stack optimized for ecommerce workloads.",
        bestFor: "It is best for small to midsize merchants that want OpenCart-ready hosting with room for multiple storefronts and more traffic than a basic entry plan can comfortably handle.",
        fitNarrative: "It is a direct fit for OpenCart Hosting because InMotion has a dedicated OpenCart hosting page with published plan pricing, capacity guidance, and OpenCart-specific positioning.",
        featureList: ["10 websites", "200 GB NVMe storage", "Unmetered bandwidth", "About 300K monthly visitor guidance", "99.99% uptime guarantee", "Live chat support", "Phone support"],
        pricingBullets: ["The Power OpenCart plan starts at $4.99 per month on the official InMotion page.", "InMotion also shows the Power plan renewing at $17.99 per month.", "The page presents the tier as part of its OpenCart hosting lineup rather than as a generic shared-hosting placeholder."],
        factualPros: ["OpenCart-specific pricing is easy to verify", "the plan includes substantial storage for a shared ecommerce tier", "support and uptime commitments are clearly published"],
        factualCons: ["renewal pricing is meaningfully higher than the introductory rate", "shared hosting limits still apply as stores grow", "buyers with heavier ecommerce usage may need the higher Pro tier"],
        collections: ["OpenCart Hosting"],
        filters: {
            hosting_type: ["Shared hosting"],
            pricing_model: ["Subscription"],
            price_band: [priceBand(4.99)],
            billing_cycle: ["Monthly"],
            support_coverage: ["24/7 support"],
            target_segment: ["Small business", "Mid-market"],
        },
        confidence: "high",
        verificationNotes: ["OpenCart Power pricing, renewal price, storage, bandwidth, and uptime/support details verified from InMotion's official OpenCart hosting page."],
    },
    {
        title: "Hostinger OpenCart VPS KVM 1",
        handle: "hostinger-opencart-vps-kvm-1",
        vendor: "Hostinger",
        officialUrl: "https://www.hostinger.com/vps/opencart-hosting",
        sourceUrls: ["https://www.hostinger.com/vps/opencart-hosting"],
        sourceLabel: "Hostinger OpenCart VPS hosting",
        logoSourceUrl: "https://www.hostinger.com/",
        startingPrice: 6.49,
        summary: "Hostinger sells OpenCart VPS hosting on dedicated KVM-based resources, pairing entry pricing with weekly backups, malware scanning, and resource allocations sized for self-managed ecommerce deployments.",
        bestFor: "It is best for merchants and technical teams that want more control and dedicated VPS resources for OpenCart instead of relying on a conventional shared hosting tier.",
        fitNarrative: "It is a direct fit for OpenCart Hosting because Hostinger's official product page is built specifically around OpenCart VPS hosting and publishes plan-level pricing, resources, and renewal terms.",
        featureList: ["1 vCPU core", "4 GB RAM", "50 GB NVMe disk space", "4 TB bandwidth", "Automatic weekly backups", "Malware scanner", "30-day money-back guarantee"],
        pricingBullets: ["Hostinger lists the KVM 1 OpenCart VPS plan at $6.49 per month on the official product page.", "The page also shows renewal at $11.99 per month for the two-year term referenced in the offer.", "The service is explicitly positioned as OpenCart VPS hosting rather than a general-purpose VPS page with a loose OpenCart mention."],
        factualPros: ["OpenCart-specific VPS positioning is explicit", "resource allocations are stronger than a low-end shared plan", "weekly backups and malware scanning are listed up front"],
        factualCons: ["renewal pricing is higher than the promotional entry rate", "VPS administration is more hands-on than a standard shared ecommerce plan", "buyers still need to manage store performance and software maintenance"],
        collections: ["OpenCart Hosting"],
        filters: {
            hosting_type: ["VPS"],
            pricing_model: ["Subscription"],
            price_band: [priceBand(6.49)],
            billing_cycle: ["Monthly"],
            target_segment: ["Small business", "Developers", "Mid-market"],
            server_region: ["Multi-region"],
        },
        confidence: "high",
        verificationNotes: ["KVM 1 pricing, renewal details, and listed resources verified from Hostinger's official OpenCart VPS hosting page."],
    },
    {
        title: "InMotion PrestaShop Hosting Power",
        handle: "inmotion-prestashop-hosting-power",
        vendor: "InMotion Hosting",
        officialUrl: "https://www.inmotionhosting.com/prestashop-hosting",
        sourceUrls: ["https://www.inmotionhosting.com/prestashop-hosting"],
        sourceLabel: "InMotion PrestaShop hosting",
        logoSourceUrl: "https://www.inmotionhosting.com/",
        startingPrice: 4.99,
        summary: "InMotion presents its Power tier as a PrestaShop-ready hosting plan for online stores that need ecommerce-focused shared hosting with higher storage, unmetered bandwidth, and around-the-clock support access.",
        bestFor: "It is best for merchants launching or expanding PrestaShop storefronts that need a published hosting plan with enough space and visitor headroom for growing catalog and order activity.",
        fitNarrative: "It is a direct fit for PrestaShop Hosting because InMotion has a dedicated PrestaShop hosting page with official plan pricing and PrestaShop-specific storefront messaging.",
        featureList: ["10 websites", "200 GB NVMe storage", "Unmetered bandwidth", "About 300K monthly visitor guidance", "99.99% uptime guarantee", "Live chat support", "Phone support"],
        pricingBullets: ["The Power PrestaShop plan starts at $4.99 per month on the official InMotion page.", "InMotion also shows a renewal price of $17.99 per month for the Power tier.", "The page frames the plan as part of a dedicated PrestaShop hosting lineup instead of generic shared hosting."],
        factualPros: ["PrestaShop-specific positioning is explicit", "storage and traffic guidance are clearly published", "uptime and support promises are visible on the official page"],
        factualCons: ["intro pricing is much lower than renewal pricing", "shared hosting remains less flexible than VPS or dedicated ecommerce stacks", "heavier stores may outgrow the Power tier faster than smaller catalogs"],
        collections: ["PrestaShop Hosting"],
        filters: {
            hosting_type: ["Shared hosting"],
            pricing_model: ["Subscription"],
            price_band: [priceBand(4.99)],
            billing_cycle: ["Monthly"],
            support_coverage: ["24/7 support"],
            target_segment: ["Small business", "Mid-market"],
        },
        confidence: "high",
        verificationNotes: ["PrestaShop Power pricing, renewal price, listed resources, and support positioning verified from InMotion's official PrestaShop hosting page."],
    },
    {
        title: "Hostinger PrestaShop Hosting Business",
        handle: "hostinger-prestashop-hosting-business",
        vendor: "Hostinger",
        officialUrl: "https://www.hostinger.com/prestashop-hosting",
        sourceUrls: ["https://www.hostinger.com/prestashop-hosting"],
        sourceLabel: "Hostinger PrestaShop hosting",
        logoSourceUrl: "https://www.hostinger.com/",
        startingPrice: 2.99,
        summary: "Hostinger markets its Business plan as PrestaShop hosting with LiteSpeed delivery, one-click installation, daily backups, and ecommerce-friendly web hosting resources across globally distributed data centers.",
        bestFor: "It is best for smaller merchants that want low-cost PrestaShop hosting with a recognized ecommerce installer, daily backups, and broader website allowances than a single-site starter plan.",
        fitNarrative: "It is a direct fit for PrestaShop Hosting because Hostinger's official page is built specifically for PrestaShop hosting and publishes business-tier pricing, resources, and ecommerce-focused setup details.",
        featureList: ["50 websites", "50 GB NVMe disk space", "3 GB RAM", "2 CPU cores", "1-click PrestaShop installer", "Daily backups", "Unlimited bandwidth", "24/7 technical support"],
        pricingBullets: ["Hostinger lists the Business PrestaShop plan at $2.99 per month on the official page.", "The page also shows renewal at $16.99 per month on the referenced term.", "Hostinger highlights LiteSpeed, one-click PrestaShop installation, and globally distributed data centers on the same product page."],
        factualPros: ["entry pricing is very easy to compare", "the page is explicitly optimized around PrestaShop hosting", "daily backups and ecommerce setup features are included in the official plan details"],
        factualCons: ["renewal pricing is much higher than the entry rate", "the plan is still a shared hosting product despite generous website allowances", "buyers may need cloud tiers for larger stores with heavier traffic"],
        collections: ["PrestaShop Hosting"],
        filters: {
            hosting_type: ["Shared hosting"],
            pricing_model: ["Subscription"],
            price_band: [priceBand(2.99)],
            billing_cycle: ["Monthly"],
            support_coverage: ["24/7 support"],
            target_segment: ["Small business", "Mid-market"],
            server_region: ["Multi-region"],
        },
        confidence: "high",
        verificationNotes: ["Business plan pricing, renewal price, listed resources, and PrestaShop-specific features verified from Hostinger's official PrestaShop hosting page."],
    },
    {
        title: "InMotion Reseller Hosting R-1000N",
        handle: "inmotion-reseller-hosting-r-1000n",
        vendor: "InMotion Hosting",
        officialUrl: "https://www.inmotionhosting.com/reseller-hosting/reseller-whmcs",
        sourceUrls: [
            "https://www.inmotionhosting.com/reseller-hosting/reseller-whmcs",
            "https://www.inmotionhosting.com/reseller-hosting",
        ],
        sourceLabel: "InMotion reseller hosting",
        logoSourceUrl: "https://www.inmotionhosting.com/",
        startingPrice: 19.99,
        summary: "InMotion's R-1000N plan is a branded reseller hosting offer built for agencies and developers that want to sell hosting under their own name while using InMotion's infrastructure, support stack, and included business tooling.",
        bestFor: "It is best for agencies, freelancers, and service providers that want a published reseller package with billing automation, white-label flexibility, and a cleaner path into recurring hosting revenue.",
        fitNarrative: "It fits Agency Reseller Plans, cPanel Reseller Hosting, and White Label Hosting because InMotion's official reseller pages emphasize agency and developer use cases, included reseller tooling, cPanel availability, and free white labeling.",
        featureList: ["R-1000N reseller plan", "WHMCS included", "cPanel reseller environment", "Free white label", "Free domain reseller option", "24/7 support", "90-day money-back guarantee"],
        pricingBullets: ["The R-1000N reseller plan starts at $19.99 per month on InMotion's official reseller hosting page.", "The same page shows renewal at $35.99 per month.", "InMotion explicitly presents the service for agencies and developers who want branded reseller hosting without server maintenance."],
        factualPros: ["agency and developer positioning is explicit", "white-label and billing tools are included on the official page", "starter pricing is clearly published"],
        factualCons: ["renewal cost is higher than the entry offer", "resource and account scale are below larger reseller tiers", "the model depends on InMotion's underlying shared reseller platform rather than isolated infrastructure"],
        collections: ["Agency Reseller Plans", "cPanel Reseller Hosting", "White Label Hosting"],
        filters: {
            hosting_type: ["Reseller hosting"],
            pricing_model: ["Subscription"],
            price_band: [priceBand(19.99)],
            billing_cycle: ["Monthly"],
            control_panel: ["cPanel"],
            support_coverage: ["24/7 support"],
            target_segment: ["Agencies", "Developers", "Small business"],
        },
        confidence: "high",
        verificationNotes: ["R-1000N entry price, renewal price, agency/developer positioning, cPanel availability, WHMCS inclusion, and white-label messaging verified from InMotion's official reseller hosting pages."],
    },
    {
        title: "MilesWeb Lite Reseller Hosting",
        handle: "milesweb-lite-reseller-hosting",
        vendor: "MilesWeb",
        officialUrl: "https://www.milesweb.com/hosting/reseller-hosting/",
        sourceUrls: [
            "https://www.milesweb.com/hosting/reseller-hosting/",
            "https://www.milesweb.com/hosting/reseller-hosting/white-label-reseller-hosting",
        ],
        sourceLabel: "MilesWeb reseller hosting",
        logoSourceUrl: "https://www.milesweb.com/",
        startingPrice: 3.99,
        summary: "MilesWeb sells Lite as an entry reseller hosting plan aimed at agencies and freelancers that need cPanel plus WHM, unlimited domain hosting, and low-cost entry pricing for reselling under their own service model.",
        bestFor: "It is best for freelancers, agencies, and smaller web service shops that want a low-cost path into Linux reseller hosting with WHM-based account management and room for multiple client sites.",
        fitNarrative: "It fits Agency Reseller Plans, cPanel Reseller Hosting, Linux Reseller Hosting, Unlimited Reseller Hosting, and WHM Reseller Hosting because the official MilesWeb page describes the lineup as cPanel Linux reseller hosting for agencies and freelancers, with cPanel plus WHM and unlimited domains on the Lite plan.",
        featureList: ["5 cPanel accounts", "5 GB SSD NVMe", "Host unlimited domains", "Unmetered bandwidth", "cPanel plus WHM", "Unlimited databases", "Unlimited email accounts", "Daily backups"],
        pricingBullets: ["MilesWeb lists the Lite reseller plan at $3.99 per month for the 3-year plan on the official page.", "The page shows renewal at $8.99 per month.", "MilesWeb presents the reseller lineup as best-value cPanel Linux reseller hosting for agencies and freelancers."],
        factualPros: ["Linux reseller positioning is explicit", "cPanel plus WHM are included", "the plan supports unlimited domains at a very low entry price"],
        factualCons: ["the Lite plan starts with only 5 cPanel accounts", "renewal pricing is higher than the promotional term", "storage is modest for resellers managing multiple active client sites"],
        collections: ["Agency Reseller Plans", "cPanel Reseller Hosting", "Linux Reseller Hosting", "Unlimited Reseller Hosting", "WHM Reseller Hosting"],
        filters: {
            hosting_type: ["Reseller hosting"],
            pricing_model: ["Subscription"],
            price_band: [priceBand(3.99)],
            billing_cycle: ["Monthly"],
            control_panel: ["cPanel"],
            target_segment: ["Agencies", "Developers", "Small business"],
        },
        confidence: "high",
        verificationNotes: ["Lite reseller price, renewal price, cPanel plus WHM, unlimited domains, and agency/freelancer positioning verified from MilesWeb's official reseller hosting pages."],
    },
    {
        title: "Verpex Start-Up Reseller",
        handle: "verpex-start-up-reseller",
        vendor: "Verpex",
        officialUrl: "https://old.verpex.com/white-label-reseller-hosting",
        sourceUrls: [
            "https://old.verpex.com/white-label-reseller-hosting",
            "https://verpex.com/reseller-hosting",
            "https://verpex.com/unlimited-reseller-hosting",
        ],
        sourceLabel: "Verpex reseller hosting",
        logoSourceUrl: "https://verpex.com/",
        startingPrice: 11.99,
        summary: "Verpex markets Start-Up Reseller as a white-label reseller hosting plan with cPanel and WHM, CloudLinux isolation, unlimited websites and email accounts, and location choice for client deployments.",
        bestFor: "It is best for resellers that want a more feature-rich white-label hosting package than the smallest entry plans, while still keeping pricing visible and straightforward on the provider's official pages.",
        fitNarrative: "It fits cPanel Reseller Hosting, Linux Reseller Hosting, Unlimited Reseller Hosting, White Label Hosting, and WHM Reseller Hosting because Verpex explicitly describes this line as white-label reseller hosting and lists cPanel, WHM, CloudLinux, and unlimited websites on the product pages.",
        featureList: ["15 cPanel accounts", "50 GB NVMe SSD space", "Unlimited websites", "Unlimited email accounts", "WHM control panel", "CloudLinux", "Daily backups", "Choice of locations"],
        pricingBullets: ["Verpex shows the Start-Up Reseller plan from $11.99 per month on the official white-label reseller page.", "The current reseller pages also list a $17.90 monthly renewal price for Start-Up Reseller.", "Verpex describes the product as white-label affordable reseller hosting with cPanel and WHM included."],
        factualPros: ["white-label messaging is explicit", "WHM and CloudLinux are listed openly", "unlimited websites and email accounts broaden the reseller use case"],
        factualCons: ["renewal pricing is higher than the lowest promotional term", "the entry plan caps cPanel account count at 15", "storage is still finite despite the unlimited website messaging"],
        collections: ["cPanel Reseller Hosting", "Linux Reseller Hosting", "Unlimited Reseller Hosting", "White Label Hosting", "WHM Reseller Hosting"],
        filters: {
            hosting_type: ["Reseller hosting"],
            pricing_model: ["Subscription"],
            price_band: [priceBand(11.99)],
            billing_cycle: ["Monthly"],
            control_panel: ["cPanel"],
            support_coverage: ["24/7 support"],
            target_segment: ["Agencies", "Small business", "Developers"],
        },
        confidence: "high",
        verificationNotes: ["Start-Up Reseller promotional price, renewal price, white-label positioning, WHM, CloudLinux, and unlimited websites/email accounts verified from Verpex official reseller pages."],
    },
    {
        title: "ResellerClub Linux Reseller Hosting Starter",
        handle: "resellerclub-linux-reseller-hosting-starter",
        vendor: "ResellerClub",
        officialUrl: "https://www.resellerclub.com/reseller-hosting",
        sourceUrls: ["https://www.resellerclub.com/reseller-hosting"],
        sourceLabel: "ResellerClub Linux reseller hosting",
        logoSourceUrl: "https://www.resellerclub.com/",
        startingPrice: 10.99,
        summary: "ResellerClub's Linux Starter plan is a published reseller hosting product with cPanel packages, unlimited websites, and a defined account count for providers that want to resell Linux hosting under their own customer relationships.",
        bestFor: "It is best for smaller hosting resellers and web professionals that want an officially priced Linux reseller offer with multiple cPanel accounts and a predictable monthly starting rate.",
        fitNarrative: "It fits cPanel Reseller Hosting, Linux Reseller Hosting, and Unlimited Reseller Hosting because ResellerClub labels the product Linux Reseller Hosting and lists cPanel accounts, unlimited websites, and plan pricing on its official pages.",
        featureList: ["25 cPanel accounts", "20 GB SSD disk space", "200 GB data transfer", "Unlimited websites", "Free SSL", "Multiple term options", "Linux reseller plan"],
        pricingBullets: ["ResellerClub lists the Linux Starter reseller plan at $10.99 per month on the official reseller hosting page.", "The same page shows 3-month pricing rising to $17.49 per month and 1-month pricing at $17.99.", "The product is explicitly categorized as Linux Reseller Hosting."],
        factualPros: ["Linux reseller category fit is explicit", "cPanel account count is published", "unlimited websites are included on the official plan details"],
        factualCons: ["storage and transfer are capped at entry-plan levels", "shorter-term pricing is meaningfully higher", "larger resellers may need higher plans for more accounts and capacity"],
        collections: ["cPanel Reseller Hosting", "Linux Reseller Hosting", "Unlimited Reseller Hosting"],
        filters: {
            hosting_type: ["Reseller hosting"],
            pricing_model: ["Subscription"],
            price_band: [priceBand(10.99)],
            billing_cycle: ["Monthly"],
            control_panel: ["cPanel"],
            target_segment: ["Small business", "Agencies", "Developers"],
        },
        confidence: "high",
        verificationNotes: ["Linux Starter reseller pricing, cPanel account count, unlimited websites, and Linux reseller categorization verified from ResellerClub's official reseller hosting page."],
    },
    {
        title: "ResellerClub Windows Reseller Hosting R1",
        handle: "resellerclub-windows-reseller-hosting-r1",
        vendor: "ResellerClub",
        officialUrl: "https://www.resellerclub.com/products/windows-reseller-hosting",
        sourceUrls: ["https://www.resellerclub.com/products/windows-reseller-hosting"],
        sourceLabel: "ResellerClub Windows reseller hosting",
        logoSourceUrl: "https://www.resellerclub.com/",
        startingPrice: 17.99,
        summary: "ResellerClub positions R1 as the entry Windows reseller hosting plan for providers that need Plesk-based customer management, unlimited websites, and a defined starting point for reselling Windows web hosting services.",
        bestFor: "It is best for small hosting resellers that need a Windows-focused reseller plan with public pricing, Plesk account management, and room to host multiple customer websites.",
        fitNarrative: "It is a direct fit for Windows Reseller Hosting because the official product page labels the offer Windows Reseller Hosting and publishes the R1 plan details, pricing options, and included Plesk account model.",
        featureList: ["Unlimited websites", "10 GB disk space", "200 GB data transfer", "Unlimited email", "Unlimited Plesk accounts", "Free SSL", "Windows reseller plan"],
        pricingBullets: ["ResellerClub lists R1 at $17.99 per month on the 3-year term shown on the official Windows reseller page.", "The same page shows shorter-commitment pricing rising up to $20.49 per month.", "Plesk account management is included in the official plan details."],
        factualPros: ["Windows reseller positioning is explicit", "Plesk-based account management is clearly listed", "multiple term options are published openly"],
        factualCons: ["the entry plan starts with only 10 GB disk space", "shorter-term pricing is higher than the headline rate", "resource ceilings are modest for resellers expecting faster growth"],
        collections: ["Windows Reseller Hosting"],
        filters: {
            hosting_type: ["Reseller hosting"],
            pricing_model: ["Subscription"],
            price_band: [priceBand(17.99)],
            billing_cycle: ["Monthly"],
            control_panel: ["Plesk"],
            target_segment: ["Small business", "Agencies"],
        },
        confidence: "high",
        verificationNotes: ["R1 pricing, term options, disk/data allocations, and unlimited Plesk accounts verified from ResellerClub's official Windows reseller hosting page."],
    },
    {
        title: "ResellerClub Windows Reseller Hosting R2",
        handle: "resellerclub-windows-reseller-hosting-r2",
        vendor: "ResellerClub",
        officialUrl: "https://www.resellerclub.com/products/windows-reseller-hosting",
        sourceUrls: ["https://www.resellerclub.com/products/windows-reseller-hosting"],
        sourceLabel: "ResellerClub Windows reseller hosting",
        logoSourceUrl: "https://www.resellerclub.com/",
        startingPrice: 21.99,
        summary: "ResellerClub's R2 plan expands the same Windows reseller platform into a larger capacity tier with more storage and transfer for providers that need stronger headroom than the entry plan offers.",
        bestFor: "It is best for growing Windows hosting resellers that want a bigger officially priced tier with the same Plesk-based reseller model and more room for customer accounts.",
        fitNarrative: "It is a direct fit for Windows Reseller Hosting because R2 is a named plan on ResellerClub's Windows reseller product page with clear pricing and reseller-specific Windows hosting features.",
        featureList: ["Unlimited websites", "25 GB disk space", "500 GB data transfer", "Unlimited email", "Unlimited Plesk accounts", "Free SSL", "Windows reseller plan"],
        pricingBullets: ["ResellerClub lists the R2 Windows reseller plan at $21.99 per month on the 3-year term shown on the official page.", "The page shows shorter terms increasing up to $24.99 per month for a one-month term.", "The official details position R2 as the next-value tier for a growing reseller business."],
        factualPros: ["capacity is stronger than the entry Windows reseller tier", "Plesk-based reseller management remains included", "official pricing remains public across multiple terms"],
        factualCons: ["the plan is pricier than R1 on every term", "it is still a shared reseller model rather than isolated Windows infrastructure", "advanced growth may still require larger tiers beyond R2"],
        collections: ["Windows Reseller Hosting"],
        filters: {
            hosting_type: ["Reseller hosting"],
            pricing_model: ["Subscription"],
            price_band: [priceBand(21.99)],
            billing_cycle: ["Monthly"],
            control_panel: ["Plesk"],
            target_segment: ["Small business", "Mid-market", "Agencies"],
        },
        confidence: "high",
        verificationNotes: ["R2 pricing, term options, storage/transfer allocations, and Plesk-based reseller model verified from ResellerClub's official Windows reseller hosting page."],
    },
    {
        title: "ResellerClub Windows Shared Hosting Personal",
        handle: "resellerclub-windows-shared-hosting-personal",
        vendor: "ResellerClub",
        officialUrl: "https://www.resellerclub.com/windows-shared-hosting",
        sourceUrls: ["https://www.resellerclub.com/windows-shared-hosting"],
        sourceLabel: "ResellerClub Windows shared hosting",
        logoSourceUrl: "https://www.resellerclub.com/",
        startingPrice: 3.49,
        summary: "ResellerClub's Personal plan is a low-cost Windows shared hosting package built on Plesk, with single-domain support and unmetered storage and transfer allowances for entry Windows websites.",
        bestFor: "It is best for individuals and small businesses that want a basic Plesk-based Windows shared hosting plan with public pricing and simple single-site scope.",
        fitNarrative: "It fits Plesk Shared Hosting because the official Windows shared hosting page explicitly lists free Plesk, publishes Personal plan pricing, and positions the service as shared Windows hosting.",
        featureList: ["Single domain", "Unmetered disk space", "Unmetered data transfer", "Unlimited email accounts", "Free Plesk control panel", "Free SSL", "Windows shared hosting"],
        pricingBullets: ["ResellerClub lists the Personal Windows shared hosting plan at $3.49 per month on the official page.", "The official plan details also call out free Plesk for website, email, and DNS management.", "The product page frames this tier as ideal for a single website or blog."],
        factualPros: ["Plesk shared hosting fit is explicit", "entry pricing is easy to compare", "unmetered storage and transfer are listed for the base tier"],
        factualCons: ["the plan is limited to a single domain", "it targets simpler Windows-hosted sites rather than larger multi-site workloads", "resource boundaries beyond the unmetered language are not deeply granular"],
        collections: ["Plesk Shared Hosting"],
        filters: {
            hosting_type: ["Shared hosting"],
            pricing_model: ["Subscription"],
            price_band: [priceBand(3.49)],
            billing_cycle: ["Monthly"],
            control_panel: ["Plesk"],
            target_segment: ["Individuals", "Small business"],
        },
        confidence: "high",
        verificationNotes: ["Personal plan pricing, free Plesk, single-domain scope, and unmetered storage/transfer verified from ResellerClub's official Windows shared hosting page."],
    },
    {
        title: "ResellerClub Windows Shared Hosting Business",
        handle: "resellerclub-windows-shared-hosting-business",
        vendor: "ResellerClub",
        officialUrl: "https://www.resellerclub.com/windows-shared-hosting",
        sourceUrls: ["https://www.resellerclub.com/windows-shared-hosting"],
        sourceLabel: "ResellerClub Windows shared hosting",
        logoSourceUrl: "https://www.resellerclub.com/",
        startingPrice: 5.99,
        summary: "ResellerClub's Business plan expands the same Plesk-based Windows shared hosting platform into a multi-domain tier with more room for small business sites and growing hosted workloads.",
        bestFor: "It is best for small businesses that want a Windows shared hosting plan with Plesk, multi-domain support, and broader resource flexibility than a single-site starter package.",
        fitNarrative: "It fits Plesk Shared Hosting because the official Windows shared hosting page shows Business plan pricing and explicitly highlights the included Plesk control panel for shared Windows hosting.",
        featureList: ["5 domains", "Unmetered disk space", "Unmetered data transfer", "Unlimited email accounts", "Free Plesk control panel", "Free SSL", "Windows shared hosting"],
        pricingBullets: ["ResellerClub lists the Business Windows shared hosting plan at $5.99 per month on the official page.", "The page highlights free Plesk alongside multi-domain support for the Business tier.", "ResellerClub recommends the plan for small business owners on the official product page."],
        factualPros: ["multi-domain shared Windows hosting is available at a visible price", "Plesk remains included and clearly stated", "the plan is positioned directly for small business use"],
        factualCons: ["larger enterprises may outgrow shared Windows hosting quickly", "the service is still a shared environment despite multi-domain scope", "plan-level performance detail is lighter than on VPS or dedicated products"],
        collections: ["Plesk Shared Hosting"],
        filters: {
            hosting_type: ["Shared hosting"],
            pricing_model: ["Subscription"],
            price_band: [priceBand(5.99)],
            billing_cycle: ["Monthly"],
            control_panel: ["Plesk"],
            target_segment: ["Small business", "Mid-market"],
        },
        confidence: "high",
        verificationNotes: ["Business plan pricing, multi-domain scope, small-business positioning, and free Plesk inclusion verified from ResellerClub's official Windows shared hosting page."],
    },
    {
        title: "OVHcloud Advance-STOR 2024",
        handle: "ovhcloud-advance-stor-2024",
        vendor: "OVHcloud",
        officialUrl: "https://us.ovhcloud.com/bare-metal/prices/",
        sourceUrls: ["https://us.ovhcloud.com/bare-metal/prices/", "https://us.ovhcloud.com/bare-metal/storage/"],
        sourceLabel: "OVHcloud storage server pricing",
        logoSourceUrl: "https://us.ovhcloud.com/",
        startingPrice: 255,
        summary: "OVHcloud's Advance-STOR 2024 is a storage-oriented dedicated server built around high-capacity HDD SAS storage for backups, archiving, and other data-heavy workloads that benefit from dedicated hardware resources.",
        bestFor: "It is best for businesses that need a second storage-focused dedicated server option for backup repositories, archives, and large datasets on single-tenant hardware.",
        fitNarrative: "It fits Storage Dedicated Servers because OVHcloud explicitly labels the model Advance-STOR and pairs it with storage-focused messaging on its official storage server pages.",
        featureList: ["AMD EPYC 4344P", "8 cores / 16 threads", "32 GB to 192 GB RAM", "2 x 22 TB to 8 x 22 TB HDD SAS", "1 Gbps to 5 Gbps public bandwidth", "25 Gbps private bandwidth", "Storage-focused dedicated server range"],
        pricingBullets: ["Advance-STOR 2024 starts at $255 per month on the official OVHcloud dedicated server range page.", "The same listing shows installation fees of $255.", "OVHcloud's storage server page also positions these offers for backups, archiving, and large-volume data storage."],
        factualPros: ["storage-first positioning is explicit", "disk capacity ranges are much larger than general-purpose servers", "official pricing and setup fees are publicly visible"],
        factualCons: ["first-month cost increases with the setup fee", "the product remains unmanaged infrastructure", "HDD-based storage prioritizes capacity over top-end NVMe-style latency"],
        collections: ["Storage Dedicated Servers"],
        filters: {
            hosting_type: ["Dedicated server"],
            pricing_model: ["Subscription"],
            price_band: [priceBand(255)],
            billing_cycle: ["Monthly"],
            performance_tier: ["Premium"],
            server_region: ["Multi-region"],
            control_panel: ["No control panel"],
            target_segment: ["Mid-market", "Enterprise"],
        },
        confidence: "high",
        verificationNotes: ["Advance-STOR 2024 price, installation fee, storage ranges, and storage-focused positioning verified from OVHcloud's official dedicated server and storage pages."],
    },
    {
        title: "OVHcloud Managed VMware vSphere Pack PRE 48",
        handle: "ovhcloud-managed-vmware-vsphere-pack-pre-48",
        vendor: "OVHcloud",
        officialUrl: "https://www.ovhcloud.com/en/hosted-private-cloud/vmware/prices/",
        sourceUrls: ["https://www.ovhcloud.com/en/hosted-private-cloud/vmware/prices/"],
        sourceLabel: "OVHcloud VMware private cloud pricing",
        logoSourceUrl: "https://www.ovhcloud.com/",
        startingPrice: 2130.6,
        summary: "OVHcloud's Managed VMware vSphere Pack PRE 48 is a hosted private cloud starter pack with dedicated hosts, shared datastores, and a managed VMware environment for migration and infrastructure extension projects.",
        bestFor: "It is best for organizations that need a formally packaged private cloud environment for VMware workloads, application migration, or private infrastructure modernization with published pricing.",
        fitNarrative: "It is a direct fit for Private Cloud Hosting because the official OVHcloud page is specifically for hosted private cloud VMware pricing and lists Pack PRE 48 as a starter pack in that environment.",
        featureList: ["2 hosts", "48 GB RAM per host", "12c/24t 2.2 GHz CPU per host", "2 x 3 TB datastores", "99.95% SLA on the virtual datacentre", "Managed VMware vSphere environment", "Hosted private cloud starter pack"],
        pricingBullets: ["Pack PRE 48 is listed at $2,130.60 per month on the official OVHcloud VMware pricing page.", "OVHcloud describes the hosted private cloud packs as dedicated to the customer and designed for migration, datacentre extension, and infrastructure projects.", "The page also notes a 99.95% service level agreement on the virtual datacentre."],
        factualPros: ["private cloud category fit is explicit", "starter-pack pricing is public and detailed", "the environment is dedicated to the customer rather than shared multitenant hosting"],
        factualCons: ["entry cost is much higher than shared, VPS, or public cloud products", "this is a larger infrastructure commitment than simpler hosting plans", "additional hosts and options increase overall spend further"],
        collections: ["Private Cloud Hosting"],
        filters: {
            hosting_type: ["Cloud hosting"],
            pricing_model: ["Subscription"],
            price_band: [priceBand(2130.6)],
            billing_cycle: ["Monthly"],
            performance_tier: ["Enterprise"],
            target_segment: ["Enterprise", "Mid-market"],
        },
        confidence: "high",
        verificationNotes: ["Pack PRE 48 price, host counts, datastore details, SLA, and hosted private cloud positioning verified from OVHcloud's official VMware private cloud pricing page."],
    },
    {
        title: "OVHcloud Managed VMware vSphere Pack PRE 96",
        handle: "ovhcloud-managed-vmware-vsphere-pack-pre-96",
        vendor: "OVHcloud",
        officialUrl: "https://www.ovhcloud.com/en/hosted-private-cloud/vmware/prices/",
        sourceUrls: ["https://www.ovhcloud.com/en/hosted-private-cloud/vmware/prices/"],
        sourceLabel: "OVHcloud VMware private cloud pricing",
        logoSourceUrl: "https://www.ovhcloud.com/",
        startingPrice: 2430.2,
        summary: "OVHcloud's Managed VMware vSphere Pack PRE 96 is a larger hosted private cloud starter pack for organizations that need more memory headroom than the smallest Pack PRE 48 configuration.",
        bestFor: "It is best for teams planning private cloud deployments that need more VMware capacity from the first stage while keeping the same dedicated-host and managed-vSphere model.",
        fitNarrative: "It is a direct fit for Private Cloud Hosting because Pack PRE 96 is another named starter pack on OVHcloud's hosted private cloud VMware pricing page with clearly published monthly pricing.",
        featureList: ["2 hosts", "96 GB RAM per host", "12c/24t 2.2 GHz CPU per host", "2 x 3 TB datastores", "99.95% SLA on the virtual datacentre", "Managed VMware vSphere environment", "Hosted private cloud starter pack"],
        pricingBullets: ["Pack PRE 96 is listed at $2,430.20 per month on OVHcloud's official VMware private cloud pricing page.", "The page keeps the same starter-pack structure with dedicated hosts and 2 x 3 TB datastores.", "OVHcloud presents these starter packs as hosted private cloud solutions for migration and infrastructure extension."],
        factualPros: ["published private-cloud pricing is specific and verifiable", "memory per host is stronger than the smallest starter pack", "the dedicated-host model remains consistent with enterprise private cloud expectations"],
        factualCons: ["monthly cost remains far above conventional web hosting tiers", "private cloud deployments still require planning beyond the starter pack itself", "additional options and expansion hosts can substantially raise the total bill"],
        collections: ["Private Cloud Hosting"],
        filters: {
            hosting_type: ["Cloud hosting"],
            pricing_model: ["Subscription"],
            price_band: [priceBand(2430.2)],
            billing_cycle: ["Monthly"],
            performance_tier: ["Enterprise"],
            target_segment: ["Enterprise", "Mid-market"],
        },
        confidence: "high",
        verificationNotes: ["Pack PRE 96 price, host/datastore structure, SLA, and hosted private cloud categorization verified from OVHcloud's official VMware private cloud pricing page."],
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
    const phase1dPath = latestExportPath("cloud-services-phase1d-preview-", ".json");
    const zeroCollectionsPath = latestExportPath("zero-product-collections-", ".csv");
    const [categoryRows, filterRows, zeroRows, phase1dRows] = await Promise.all([
        readCsv(CATEGORY_CSV_PATH),
        readCsv(FILTERS_CSV_PATH),
        readCsv(zeroCollectionsPath),
        readJson(phase1dPath),
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
    [...phase1dRows, ...newRows].forEach((row) => mergedByHandle.set(row.handle, row));
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
    const jsonPath = path_1.default.join(EXPORTS_DIR, `cloud-services-phase1e-preview-${timestamp}.json`);
    const csvPath = path_1.default.join(EXPORTS_DIR, `cloud-services-phase1e-preview-${timestamp}.csv`);
    const reportPath = path_1.default.join(EXPORTS_DIR, `cloud-services-phase1e-validation-${timestamp}.json`);
    const validation = {
        generatedAt: new Date().toISOString(),
        scope: "Cloud Services cumulative preview through phase 1e",
        totalPreviewProducts: allRows.length,
        newPhase1eProducts: newRows.length,
        importedPhase1dProducts: phase1dRows.length,
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
        phase1dPreviewImported: path_1.default.basename(phase1dPath),
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
        newPhase1eProducts: newRows.length,
        collectionsCoveredAtMinimumTwo: coveredCollections.length,
        collectionsShortfilled: shortfilledCollections.length,
        remainingUncoveredCollections: uncoveredCollections.length,
    }, null, 2));
};
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
