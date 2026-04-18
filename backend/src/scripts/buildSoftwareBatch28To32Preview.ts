import * as fs from "fs";
import * as path from "path";

const EXPORTS_DIR = path.resolve(__dirname, "../../exports");
const DATE_STAMP = "2026-04-12";

type Confidence = "high" | "medium" | "low";
type FilterValues = Record<string, string[]>;

type Spec = {
  batch: number;
  title: string;
  vendor: string;
  handle: string;
  collectionHandle: string;
  collectionTitle: string;
  customUrl: string;
  sourceUrl: string;
  sourceUrls: string[];
  logoSourceUrl: string;
  sourceLabel: string;
  audience: string;
  overview: string;
  fitReason: string;
  workflowFocus: string;
  useCases: string[];
  featureList: string[];
  pricingBullets: string[];
  factualPros: string[];
  factualCons: string[];
  strengthsSummary: string;
  tradeoffSummary: string;
  startingPrice: number | null;
  priceEvidence: string;
  seoDescription: string;
  filters: FilterValues;
  confidence: Confidence;
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
  filterValues: FilterValues;
  verificationNotes: string;
  confidence: Confidence;
  missingFields: string[];
};

const csvEscape = (value: unknown) => {
  const stringValue =
    typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
};

const wordCount = (value: string) =>
  value
    .replace(/<[^>]+>/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

const toPriceString = (value: number | null) =>
  value === null || Number.isNaN(value) ? "" : String(value);

const buildBodyHtml = (spec: Spec) => {
  const featureSentence = spec.featureList.join(", ");
  const useCaseSentence = spec.useCases.join(", ");
  const prosSentence = spec.factualPros.join(", ");
  const consSentence = spec.factualCons.join(", ");
  const pricingSentence = spec.pricingBullets.join(" ");

  return [
    `<p>${spec.title} is ${spec.collectionTitle.toLowerCase()} for ${spec.audience} that need ${spec.overview}. It belongs in the ${spec.collectionTitle} collection because ${spec.fitReason}. The product is designed to give buyers a more organized way to manage ${spec.workflowFocus} without relying on disconnected spreadsheets, inboxes, or point solutions. This makes it relevant for marketplace shoppers who want software that clearly fits the category instead of something only loosely adjacent to it.</p>`,
    `<p>Official materials highlight capabilities such as ${featureSentence}. Those capabilities matter because teams in this category usually need dependable workflows, clear visibility, and fewer manual handoffs when daily activity starts to scale. In practice, organizations can use the software to support tasks such as ${useCaseSentence}. That blend of operational coverage and category fit helps explain why the product is a credible option for buyers comparing software in this space.</p>`,
    `<p>${spec.title} is strongest when organizations value ${spec.strengthsSummary}. Compared with broader alternatives, the product is positioned around a more specific workflow and audience, which can make implementation and day-to-day use easier for the right team. It can also help centralize work, improve reporting or oversight, and reduce avoidable administrative effort. Buyers should still review the product against internal process requirements, data needs, and team size to confirm that the vendor's delivery model and feature depth match how the organization actually works.</p>`,
    `<p>${pricingSentence} This draft uses ${spec.startingPrice === null ? "a blank price" : spec.startingPrice} because ${spec.priceEvidence}. The pricing section stays neutral and does not infer hidden fees, discounts, or contract terms beyond what was visible on official materials reviewed on 2026-04-12. When public pricing is limited, the listing intentionally keeps the commercial summary short so the store data stays accurate and verifiable.</p>`,
    `<p>Main strengths include ${prosSentence}. Trade-offs include ${consSentence}. ${spec.tradeoffSummary} Overall, ${spec.title} is a sound option for buyers who want ${spec.collectionTitle.toLowerCase()} aligned with the needs described above, while remaining mindful that final suitability depends on deployment preferences, budget expectations, and the level of operational complexity the team needs the software to support.</p>`,
  ].join("");
};

const buildVerificationNotes = (spec: Spec) => {
  const priceLine =
    spec.startingPrice === null
      ? "No public official base price was verified, so the price field is intentionally left blank."
      : `The selected price reflects ${spec.priceEvidence}.`;

  return [
    `Official ${spec.title} product and pricing materials were reviewed on 2026-04-12.`,
    priceLine,
    "Capterra was used only as a discovery source.",
    "Logo processing and Shopify Files upload are still pending.",
  ].join(" ");
};

const rowFromSpec = (spec: Spec): PreviewRow => {
  const bodyHtml = buildBodyHtml(spec);
  if (wordCount(bodyHtml) < 300) {
    throw new Error(`Description below 300 words for ${spec.handle}`);
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
    imageAltText: `${spec.title} ${spec.collectionTitle.toLowerCase()} logo`,
    seoTitle: `${spec.title} | ${spec.collectionTitle}`,
    seoDescription: spec.seoDescription,
    collectionHandles: [spec.collectionHandle],
    collectionTitles: [spec.collectionTitle],
    sourceUrl: spec.sourceUrl,
    sourceUrls: spec.sourceUrls,
    sourceLabel: spec.sourceLabel,
    logoSourceUrl: spec.logoSourceUrl,
    customUrl: spec.customUrl,
    customLogoImage: "",
    customTypeMultiple: [spec.collectionTitle],
    productFeatures: spec.featureList.map((item) => `- ${item}`).join("\n"),
    plansPricing: spec.pricingBullets.map((item) => `- ${item}`).join("\n"),
    prosCons: [
      ...spec.factualPros.map((item) => `- Pro: ${item}`),
      ...spec.factualCons.map((item) => `- Con: ${item}`),
    ].join("\n"),
    filterValues: spec.filters,
    verificationNotes: buildVerificationNotes(spec),
    confidence: spec.confidence,
    missingFields: [
      ...(spec.startingPrice === null ? ["price"] : []),
      "custom.logo_image",
    ],
  };
};

const specs: Spec[] = [
  {
    batch: 28,
    title: "Artwork Archive",
    vendor: "Artwork Archive",
    handle: "artwork-archive-art-gallery-software",
    collectionHandle: "art-gallery-software",
    collectionTitle: "Art Gallery Software",
    customUrl: "https://www.artworkarchive.com/",
    sourceUrl: "https://www.artworkarchive.com/pricing",
    sourceUrls: [
      "https://www.artworkarchive.com/",
      "https://www.artworkarchive.com/pricing",
      "https://www.capterra.in/directory/30957/art-gallery/software",
    ],
    logoSourceUrl: "https://www.artworkarchive.com/",
    sourceLabel: "Official Artwork Archive product and pricing pages; Capterra used for discovery",
    audience: "artists, galleries, and collection managers",
    overview: "cataloging artwork, tracking collection records, managing sales activity, and publishing collection information online",
    fitReason: "the official site positions it as a collection management system for artists and organizations with inventory, CRM, invoicing, and online display tools",
    workflowFocus: "art cataloging, client records, inventory control, and sales administration",
    useCases: [
      "document artworks and locations",
      "track contacts, sales, and donations",
      "share work through a public profile website",
      "support reporting and records for exhibitions or collections",
    ],
    featureList: [
      "catalog artworks, locations, and collection records in one system",
      "use integrated CRM, sales tracking, and online invoicing tools",
      "publish a public profile website to display work online",
      "add QR codes, reporting, and daily backups for collection records",
      "start on an entry plan for individual users and scale into organization plans",
    ],
    pricingBullets: [
      "Apprentice and Starter plans begin at 9 per month when billed annually.",
      "Professional and Plus plans are available for larger collections and organizations.",
      "A free 14-day trial is advertised on the official pricing page.",
    ],
    factualPros: ["entry pricing is public", "clear category fit for art record management", "includes collection and contact workflow tools"],
    factualCons: ["multi-user needs move into higher plans", "buyers should review organization plan limits carefully", "specialized museum workflows may require deeper evaluation"],
    strengthsSummary: "public entry pricing, dedicated collection management workflow, and a practical mix of inventory and CRM tools",
    tradeoffSummary: "Organizations with unusually complex institutional requirements may still want to compare feature depth and user limits before committing.",
    startingPrice: 9,
    priceEvidence: "the visible 9 per month Apprentice and Starter entry plans on the official pricing page",
    seoDescription: "Artwork Archive helps galleries and artists catalog art, manage sales records, and publish collection information online.",
    filters: {
      software_type: ["Design & content"],
      target_segment: ["Individuals", "Small business"],
      pricing_model: ["Subscription"],
      price_band: ["Under $10/month"],
      deployment_model: ["Cloud / SaaS"],
      collaboration_mode: ["Single-user"],
      support_coverage: ["Business hours support"],
    },
    confidence: "high",
  },
  {
    batch: 28,
    title: "Artlogic",
    vendor: "Artlogic",
    handle: "artlogic-art-gallery-software",
    collectionHandle: "art-gallery-software",
    collectionTitle: "Art Gallery Software",
    customUrl: "https://artlogic.net/",
    sourceUrl: "https://artlogic.net/pricing/",
    sourceUrls: [
      "https://artlogic.net/",
      "https://artlogic.net/pricing/",
      "https://www.capterra.in/directory/30957/art-gallery/software",
    ],
    logoSourceUrl: "https://artlogic.net/",
    sourceLabel: "Official Artlogic product and pricing pages; Capterra used for discovery",
    audience: "galleries and art businesses that need combined management, marketing, and online presentation tools",
    overview: "running gallery operations while also presenting and selling artworks online",
    fitReason: "the official pricing page presents gallery management, website, online viewing room, marketing, and sales capabilities for art businesses",
    workflowFocus: "gallery inventory, website presentation, online sales, and client-facing marketing activity",
    useCases: [
      "manage artworks and contacts for gallery operations",
      "launch viewing rooms and online stores",
      "handle sales pipeline activity and offer tracking",
      "maintain a branded website experience for buyers and collectors",
    ],
    featureList: [
      "combine gallery management with website and online sales modules",
      "publish online viewing rooms and storefront-style experiences",
      "use website builder and editor tools built for art presentation",
      "support professional marketing and sales workflows for galleries",
      "scale from essential website plans into broader gallery platform plans",
    ],
    pricingBullets: [
      "Gallery Website Essential starts at 70 per month on the official pricing page.",
      "Professional and expert tiers are available for larger teams and broader workflow needs.",
      "Some gallery platform configurations require a consultation for personalized pricing.",
    ],
    factualPros: ["strong category fit for galleries", "public entry pricing is available", "ties online presentation to operational tools"],
    factualCons: ["higher tiers become expensive quickly", "some configurations require sales contact", "buyers should confirm which module mix they actually need"],
    strengthsSummary: "gallery-specific workflow coverage, strong online presentation tooling, and public entry pricing for website-led use cases",
    tradeoffSummary: "The platform is most attractive when an organization wants both presentation and operational tooling, not just a narrow catalog database.",
    startingPrice: 70,
    priceEvidence: "the visible 70 per month Gallery Website Essential starting plan on the official pricing page",
    seoDescription: "Artlogic helps galleries manage artworks, launch viewing rooms, and support online sales with art-focused website tools.",
    filters: {
      software_type: ["Design & content"],
      target_segment: ["Small business", "Mid-market"],
      pricing_model: ["Subscription"],
      price_band: ["$51-$200/month"],
      deployment_model: ["Cloud / SaaS"],
      collaboration_mode: ["Team sharing"],
      support_coverage: ["Business hours support"],
    },
    confidence: "high",
  },
  {
    batch: 28,
    title: "Apify",
    vendor: "Apify",
    handle: "apify-artificial-intelligence-software",
    collectionHandle: "artificial-intelligence-software",
    collectionTitle: "Artificial Intelligence Software",
    customUrl: "https://apify.com/",
    sourceUrl: "https://apify.com/pricing",
    sourceUrls: [
      "https://apify.com/",
      "https://apify.com/pricing",
      "https://www.capterra.in/directory/30938/artificial-intelligence/software",
    ],
    logoSourceUrl: "https://apify.com/",
    sourceLabel: "Official Apify product and pricing pages; Capterra used for discovery",
    audience: "developers, data teams, and businesses that need AI-adjacent automation and web data workflows",
    overview: "running cloud-based actors, web data collection tasks, and automation workloads that support AI and structured data use cases",
    fitReason: "the official site presents Apify as a platform for building and running actors and AI agents with cloud infrastructure, APIs, and ready-made tools",
    workflowFocus: "automation, online data extraction, actor execution, and developer-led workflow orchestration",
    useCases: [
      "run prebuilt actors for web data collection",
      "build custom actors in JavaScript or Python",
      "support AI agents with structured inputs from the web",
      "handle rendering, proxies, and scaling from one managed platform",
    ],
    featureList: [
      "access a large store of ready-made actors for web data and automation tasks",
      "build and publish custom actors using JavaScript, Python, or Crawlee",
      "run workloads on Apify cloud with scaling, headless browsers, and JavaScript rendering",
      "use proxies, CAPTCHA handling, storage, and API-driven execution from one platform",
      "start on a free plan and scale with prepaid usage and higher support tiers",
    ],
    pricingBullets: [
      "Free plan is available with monthly usage credit.",
      "Starter plan begins at 29 per month plus pay-as-you-go usage.",
      "Scale, Business, and custom plans are available for larger workloads.",
    ],
    factualPros: ["free entry plan", "strong API-first and developer workflow fit", "official compliance signals are public"],
    factualCons: ["usage-based billing can be harder to forecast", "best value often depends on technical implementation depth", "non-technical teams may need onboarding help"],
    strengthsSummary: "developer-oriented automation tooling, flexible pricing, and strong support for structured data workflows",
    tradeoffSummary: "Apify is especially compelling for teams comfortable with automation concepts and less ideal for buyers seeking a simple no-configuration business app.",
    startingPrice: 0,
    priceEvidence: "the visible Free plan on the official Apify pricing page",
    seoDescription: "Apify gives teams a cloud platform for web automation, data extraction, and AI-ready workflow execution.",
    filters: {
      software_type: ["Developer tools"],
      target_segment: ["Developers", "Small business", "Mid-market"],
      pricing_model: ["Free", "Subscription", "Usage-based"],
      price_band: ["Free"],
      deployment_model: ["Cloud / SaaS", "API-first"],
      developer_features: ["API access", "Webhooks"],
      security_compliance: ["GDPR", "SOC 2", "CCPA"],
      support_coverage: ["Business hours support"],
    },
    confidence: "high",
  },
  {
    batch: 28,
    title: "Tidio",
    vendor: "Tidio",
    handle: "tidio-artificial-intelligence-software",
    collectionHandle: "artificial-intelligence-software",
    collectionTitle: "Artificial Intelligence Software",
    customUrl: "https://www.tidio.com/",
    sourceUrl: "https://www.tidio.com/pricing/",
    sourceUrls: [
      "https://www.tidio.com/",
      "https://www.tidio.com/pricing/",
      "https://www.capterra.in/directory/30938/artificial-intelligence/software",
    ],
    logoSourceUrl: "https://www.tidio.com/",
    sourceLabel: "Official Tidio product and pricing pages; Capterra used for discovery",
    audience: "support teams and online businesses that want conversational AI and live customer messaging in one system",
    overview: "handling customer conversations through live chat, ticketing, email workflows, and AI-assisted support automation",
    fitReason: "the official pricing page centers Tidio around Lyro AI Agent, live chat, ticketing, email management, and automation for customer support workflows",
    workflowFocus: "AI-assisted customer messaging, ticket handling, and support automation",
    useCases: [
      "respond to inbound customer questions through live chat and AI",
      "manage support tickets and email conversations in one workspace",
      "deploy FAQ-based AI responses for routine support questions",
      "expand support coverage without adding the same amount of manual workload",
    ],
    featureList: [
      "combine live chat, ticketing, email management, and live video calls in one suite",
      "use Lyro AI Agent conversations with FAQ upload and action support",
      "automate support interactions with workflows across multiple channels",
      "start on a free plan and expand into paid conversation and AI quotas",
      "access higher tiers for teams that need larger scale and custom quotas",
    ],
    pricingBullets: [
      "Free plan is available on the official pricing page.",
      "Starter begins at 24.17 per month and Growth starts at 49.17 per month.",
      "Plus and Premium tiers move into team and contact-sales pricing.",
    ],
    factualPros: ["free entry plan", "clear support and AI positioning", "multiple communication modes in one product"],
    factualCons: ["advanced AI usage scales into higher tiers", "conversation quotas matter for cost planning", "enterprise features may require sales contact"],
    strengthsSummary: "AI customer support positioning, public pricing, and blended live-chat plus ticketing workflow coverage",
    tradeoffSummary: "Buyers should review quota-driven pricing carefully if their support volume is likely to grow quickly.",
    startingPrice: 0,
    priceEvidence: "the visible Free plan on the official Tidio pricing page",
    seoDescription: "Tidio combines AI support, live chat, and ticketing to help teams automate routine customer conversations.",
    filters: {
      software_type: ["Helpdesk & support"],
      target_segment: ["Small business", "Mid-market"],
      pricing_model: ["Free", "Subscription"],
      price_band: ["Free"],
      deployment_model: ["Cloud / SaaS"],
      support_coverage: ["Business hours support"],
      collaboration_mode: ["Team sharing"],
    },
    confidence: "high",
  },
  {
    batch: 29,
    title: "ProProfs Quiz Maker",
    vendor: "ProProfs",
    handle: "proprofs-quiz-maker-assessment-software",
    collectionHandle: "assessment-software",
    collectionTitle: "Assessment Software",
    customUrl: "https://www.proprofs.com/quiz-school/",
    sourceUrl: "https://www.proprofs.com/quiz-school/solutions/quiz-maker-for-teachers/",
    sourceUrls: [
      "https://www.proprofs.com/quiz-school/",
      "https://www.proprofs.com/quiz-school/solutions/quiz-maker-for-teachers/",
      "https://www.capterra.in/directory/31117/assessment/software",
    ],
    logoSourceUrl: "https://www.proprofs.com/quiz-school/",
    sourceLabel: "Official ProProfs Quiz Maker product and pricing pages; Capterra used for discovery",
    audience: "educators, trainers, and hiring teams that need quick online assessments and quizzes",
    overview: "creating quizzes, tests, and assessments with AI assistance, scoring, and history tracking",
    fitReason: "the official site presents the product as online quiz and assessment software with free and paid plans for teaching, training, and hiring use cases",
    workflowFocus: "test creation, delivery, scoring, and assessment management",
    useCases: [
      "build quizzes and tests with AI or from templates",
      "run short assessments at no cost on the free plan",
      "track quiz-taker history and results",
      "expand into longer and more business-focused assessments on paid tiers",
    ],
    featureList: [
      "create quizzes, tests, and exams with AI-assisted authoring",
      "start on a free plan for shorter quizzes and basic history",
      "unlock unlimited questions and longer history on paid plans",
      "use assessment libraries and branding or security options on higher tiers",
      "support education, training, and hiring scenarios from one platform",
    ],
    pricingBullets: [
      "Free plan is available forever on the official page.",
      "Essentials starts at 19.99 per 100 active quiz takers per month.",
      "Higher tiers support longer assessments and additional business features.",
    ],
    factualPros: ["free entry plan", "broad assessment use cases", "AI-assisted authoring is visible on the official page"],
    factualCons: ["free plan has question limits", "usage is tied to active quiz takers on paid tiers", "buyers should confirm whether quiz depth matches formal testing needs"],
    strengthsSummary: "easy entry pricing, flexible assessment creation, and relevance across education and business training contexts",
    tradeoffSummary: "Teams with stricter proctoring or complex certification requirements may want to compare specialized testing platforms as well.",
    startingPrice: 0,
    priceEvidence: "the visible Free plan on the official ProProfs Quiz Maker page",
    seoDescription: "ProProfs Quiz Maker helps teams build quizzes and assessments with AI-assisted authoring and flexible online delivery.",
    filters: {
      software_type: ["Productivity"],
      target_segment: ["Individuals", "Small business", "Education / public sector"],
      pricing_model: ["Free", "Subscription"],
      price_band: ["Free"],
      deployment_model: ["Cloud / SaaS"],
      support_coverage: ["Business hours support"],
      collaboration_mode: ["Team sharing"],
    },
    confidence: "high",
  },
  {
    batch: 29,
    title: "TestInvite",
    vendor: "TestInvite",
    handle: "testinvite-assessment-software",
    collectionHandle: "assessment-software",
    collectionTitle: "Assessment Software",
    customUrl: "https://www.testinvite.com/",
    sourceUrl: "https://www.testinvite.com/lang/en/pricing-plans.html",
    sourceUrls: [
      "https://www.testinvite.com/",
      "https://www.testinvite.com/lang/en/pricing-plans.html",
      "https://www.capterra.in/directory/31117/assessment/software",
    ],
    logoSourceUrl: "https://www.testinvite.com/",
    sourceLabel: "Official TestInvite product and pricing pages; Capterra used for discovery",
    audience: "organizations that need structured assessments with configurable security and team administration",
    overview: "running online assessments with plan-based credits, test authoring, and optional proctoring controls",
    fitReason: "the official pricing page frames TestInvite around assessment plans, testing credits, custom questions, teammates, and advanced security options",
    workflowFocus: "assessment delivery, candidate management, and secured online testing",
    useCases: [
      "author and publish custom tests",
      "manage testing sessions with included credits",
      "scale teams and question banks as assessment volume grows",
      "add security options such as webcam, screen recording, or lockdown browser where needed",
    ],
    featureList: [
      "start with a Starter plan that includes testing credits and teammate access",
      "build custom questions and own tests from one platform",
      "scale question bank size and team capacity across higher plans",
      "add security layers such as webcam, screen recording, and lockdown browser options",
      "purchase extra credit packs as assessment volume increases",
    ],
    pricingBullets: [
      "Starter begins at 37 per month billed annually.",
      "Essential and Advanced plans increase capacity for questions, teammates, and support.",
      "Additional testing credits can be purchased separately when needed.",
    ],
    factualPros: ["public plan pricing", "structured assessment and security workflow", "capacity scales with clearer plan boundaries"],
    factualCons: ["credit-based usage requires planning", "advanced proctoring options can increase overall spend", "teams should estimate testing volume before choosing a plan"],
    strengthsSummary: "public starting price, assessment-focused controls, and clearer security-oriented workflow coverage than simpler quiz tools",
    tradeoffSummary: "The platform is best for teams that want a more formal testing setup and are comfortable managing credits and plan capacity.",
    startingPrice: 37,
    priceEvidence: "the visible 37 per month Starter plan on the official pricing page",
    seoDescription: "TestInvite helps organizations run online assessments with credits, test authoring, and configurable security options.",
    filters: {
      software_type: ["Productivity"],
      target_segment: ["Small business", "Mid-market", "Enterprise"],
      pricing_model: ["Subscription", "Usage-based"],
      price_band: ["$10-$50/month"],
      deployment_model: ["Cloud / SaaS"],
      support_coverage: ["Business hours support"],
      collaboration_mode: ["Team sharing"],
    },
    confidence: "high",
  },
  {
    batch: 29,
    title: "Sortly",
    vendor: "Sortly",
    handle: "sortly-asset-tracking-software",
    collectionHandle: "asset-tracking-software",
    collectionTitle: "Asset Tracking Software",
    customUrl: "https://www.sortly.com/",
    sourceUrl: "https://www.sortly.com/pricing/",
    sourceUrls: [
      "https://www.sortly.com/",
      "https://www.sortly.com/pricing/",
      "https://www.capterra.in/directory/30837/asset-tracking/software",
    ],
    logoSourceUrl: "https://www.sortly.com/",
    sourceLabel: "Official Sortly product and pricing pages; Capterra used for discovery",
    audience: "operations teams that need inventory and asset visibility without a complex enterprise setup",
    overview: "tracking items, users, labels, and stock activity through a cloud-based inventory and asset system",
    fitReason: "the official pricing page positions Sortly around inventory visibility, unique item tracking, user licenses, labels, and purchase-order workflows",
    workflowFocus: "asset records, inventory organization, barcode workflows, and stock operations",
    useCases: [
      "track unique items and inventory records",
      "assign user licenses for team-based asset handling",
      "create QR code and barcode labels",
      "support purchase orders and imports as operational needs expand",
    ],
    featureList: [
      "start on a free plan for smaller item counts and single-user tracking",
      "scale into higher tiers with more unique items and user licenses",
      "create QR code and barcode labels for asset organization",
      "import inventory data and support purchase order workflows on larger plans",
      "use a cloud-based interface designed for day-to-day inventory visibility",
    ],
    pricingBullets: [
      "Free plan is available at 0 per month.",
      "Advanced starts at 24 per month when billed yearly.",
      "Higher tiers add more item capacity, users, and operational features.",
    ],
    factualPros: ["free entry plan", "public pricing is easy to compare", "barcode and label workflow is clearly visible"],
    factualCons: ["larger operations may move quickly into paid tiers", "item limits vary by plan", "buyers should confirm whether advanced procurement needs are fully covered"],
    strengthsSummary: "simple pricing, approachable asset tracking, and clear barcode-oriented workflow support",
    tradeoffSummary: "Sortly is strongest for teams that want ease of use first and may be less attractive when a buyer needs a highly specialized enterprise asset suite.",
    startingPrice: 0,
    priceEvidence: "the visible Free plan on the official Sortly pricing page",
    seoDescription: "Sortly helps teams track inventory and assets with labels, user access, and cloud-based item management.",
    filters: {
      software_type: ["Finance & operations"],
      target_segment: ["Small business", "Mid-market"],
      pricing_model: ["Free", "Subscription"],
      price_band: ["Free"],
      deployment_model: ["Cloud / SaaS"],
      support_coverage: ["Business hours support"],
      collaboration_mode: ["Team sharing"],
    },
    confidence: "high",
  },
  {
    batch: 29,
    title: "AssetTiger",
    vendor: "AssetTiger",
    handle: "assettiger-asset-tracking-software",
    collectionHandle: "asset-tracking-software",
    collectionTitle: "Asset Tracking Software",
    customUrl: "https://www.assettiger.com/",
    sourceUrl: "https://www.assettiger.com/pricing/",
    sourceUrls: [
      "https://www.assettiger.com/",
      "https://www.assettiger.com/pricing/",
      "https://www.capterra.in/directory/30837/asset-tracking/software",
    ],
    logoSourceUrl: "https://www.assettiger.com/",
    sourceLabel: "Official AssetTiger product and pricing pages; Capterra used for discovery",
    audience: "teams that need cost-conscious asset tracking with scalable asset counts and barcode-friendly workflows",
    overview: "managing assets, labels, user access, and cloud storage from a pricing model that starts free and scales by asset count",
    fitReason: "the official pricing page emphasizes free entry, unlimited users, cloud storage, smartphone compatibility, and plan tiers based on asset volume",
    workflowFocus: "asset registration, barcode or smartphone-based tracking, and scalable inventory administration",
    useCases: [
      "start small with a free asset limit",
      "track assets across unlimited users",
      "scale up by asset count as the inventory footprint grows",
      "support mobile-friendly tracking and cloud-based records",
    ],
    featureList: [
      "start free for up to 250 assets",
      "use unlimited users and unlimited cloud storage on the official pricing model",
      "scale into paid plans based on asset counts from 500 upward",
      "support smartphone-compatible tracking and label-driven workflows",
      "keep pricing straightforward without per-user charges on the published plans",
    ],
    pricingBullets: [
      "Free plan covers up to 250 assets.",
      "Basic starts at 20 per month and scales through higher asset-count tiers.",
      "Inventory plans are also listed separately on the official pricing page.",
    ],
    factualPros: ["free plan is public", "unlimited-user positioning is clear", "pricing scales by asset count instead of per-user fees"],
    factualCons: ["free plan asset limits are modest", "larger asset estates move into paid tiers", "buyers should confirm deeper maintenance or audit requirements"],
    strengthsSummary: "cost-conscious entry point, transparent scaling by asset volume, and straightforward user allowances",
    tradeoffSummary: "AssetTiger fits best when simple cloud-based asset control is the priority and not every workflow requires deep enterprise customization.",
    startingPrice: 0,
    priceEvidence: "the visible Free plan for up to 250 assets on the official pricing page",
    seoDescription: "AssetTiger gives teams free entry-level asset tracking with unlimited users and pricing that scales by asset count.",
    filters: {
      software_type: ["Finance & operations"],
      target_segment: ["Small business", "Mid-market"],
      pricing_model: ["Free", "Subscription"],
      price_band: ["Free"],
      deployment_model: ["Cloud / SaaS"],
      support_coverage: ["Business hours support"],
      collaboration_mode: ["Team sharing"],
    },
    confidence: "high",
  },
  {
    batch: 30,
    title: "AL Advantage",
    vendor: "AL Advantage",
    handle: "al-advantage-assisted-living-software",
    collectionHandle: "assisted-living-software",
    collectionTitle: "Assisted Living Software",
    customUrl: "https://aladvantage.com/",
    sourceUrl: "https://aladvantage.com/software-overview",
    sourceUrls: [
      "https://aladvantage.com/",
      "https://aladvantage.com/software-overview",
      "https://www.capterra.in/directory/10034/assisted-living/pricing/free/software",
    ],
    logoSourceUrl: "https://aladvantage.com/",
    sourceLabel: "Official AL Advantage product pages; Capterra used for discovery",
    audience: "senior living operators and caregivers that need resident care and compliance workflows in one system",
    overview: "supporting resident assessments, service plans, care records, and compliance-oriented reporting for assisted living communities",
    fitReason: "the official site positions AL Advantage as senior care management software built for assisted living with assessments, care plans, charting, reporting, and community operations",
    workflowFocus: "resident assessments, care documentation, compliance tracking, and community operations",
    useCases: [
      "maintain service plans and care records",
      "track incidents, leaves, and level-of-care changes",
      "support state-specific compliance workflows",
      "give staff a single community snapshot for daily operations",
    ],
    featureList: [
      "capture resident assessments and flow data into service plans",
      "track incidents, follow-ups, and charting histories with time-stamped records",
      "support state-specific care reporting and printable operational reports",
      "manage diet, medication, bathing, and laundry schedules for residents",
      "offer unlimited users with trial and demo options on the official site",
    ],
    pricingBullets: [
      "Free demo and free trial are promoted on the official site.",
      "No official public base subscription price was visible in the reviewed materials.",
      "Commercial pricing appears to require direct vendor contact.",
    ],
    factualPros: ["strong fit for assisted living operations", "care and compliance workflows are clearly described", "free trial and demo are available"],
    factualCons: ["public base pricing is not listed", "buyers should confirm exact billing and implementation scope", "feature depth should be reviewed against facility size and clinical needs"],
    strengthsSummary: "category-specific resident care workflow coverage, compliance-oriented reporting, and practical day-to-day operational tools",
    tradeoffSummary: "Because pricing is not public, buyers will likely need a vendor conversation before they can complete a true commercial comparison.",
    startingPrice: null,
    priceEvidence: "the reviewed official pages did not publish a verifiable base subscription amount",
    seoDescription: "AL Advantage helps assisted living teams manage resident care plans, charting, and compliance-focused operations.",
    filters: {
      software_type: ["Finance & operations"],
      target_segment: ["Small business", "Mid-market"],
      pricing_model: ["Custom quote"],
      deployment_model: ["Cloud / SaaS"],
      support_coverage: ["24/7 support"],
      collaboration_mode: ["Roles & permissions"],
    },
    confidence: "high",
  },
  {
    batch: 30,
    title: "ECP",
    vendor: "ECP",
    handle: "ecp-assisted-living-software",
    collectionHandle: "assisted-living-software",
    collectionTitle: "Assisted Living Software",
    customUrl: "https://www.ecp123.com/",
    sourceUrl: "https://www.ecp123.com/",
    sourceUrls: [
      "https://www.ecp123.com/",
      "https://www.capterra.in/directory/10034/assisted-living/pricing/free/software",
    ],
    logoSourceUrl: "https://www.ecp123.com/",
    sourceLabel: "Official ECP product pages; Capterra used for discovery",
    audience: "assisted living communities that need one platform for resident lifecycle and operational workflows",
    overview: "bringing prospect, move-in, clinical, CRM, eMAR, EHR, and billing workflows together in one assisted living platform",
    fitReason: "the official site presents ECP as assisted living software that handles workflows from prospect to move-in to clinical to billing in one place",
    workflowFocus: "resident lifecycle management, clinical records, prospect handling, and billing coordination",
    useCases: [
      "manage prospect and move-in workflows",
      "support eMAR and EHR activity for communities",
      "coordinate CRM and billing activity alongside resident operations",
      "reduce navigation time for staff working across multiple daily processes",
    ],
    featureList: [
      "combine prospect, move-in, clinical, CRM, and billing workflows in one platform",
      "support assisted living operations with eMAR and EHR functionality",
      "use one interface designed to surface tasks in three clicks or less",
      "serve communities from admission through ongoing resident care operations",
      "present an all-in-one platform approach rather than separate modules from different tools",
    ],
    pricingBullets: [
      "Official reviewed materials focus on product capabilities and demo access.",
      "No official public base subscription price was visible in the reviewed materials.",
      "Commercial pricing appears to require direct discussion with ECP.",
    ],
    factualPros: ["clear all-in-one assisted living positioning", "resident lifecycle coverage is visible on the official site", "strong category fit"],
    factualCons: ["public pricing is not listed", "buyers should confirm implementation scope and support model", "larger organizations should validate feature depth for multi-site operations"],
    strengthsSummary: "broad assisted living workflow coverage and a clearly unified operational approach",
    tradeoffSummary: "The product looks well aligned to category needs, but cost comparison will remain incomplete until the vendor provides pricing details.",
    startingPrice: null,
    priceEvidence: "the reviewed official pages did not publish a verifiable base subscription amount",
    seoDescription: "ECP gives assisted living communities one platform for prospect, move-in, clinical, and billing workflows.",
    filters: {
      software_type: ["Finance & operations"],
      target_segment: ["Mid-market", "Enterprise"],
      pricing_model: ["Custom quote"],
      deployment_model: ["Cloud / SaaS"],
      collaboration_mode: ["Roles & permissions"],
      support_coverage: ["Business hours support"],
    },
    confidence: "high",
  },
  {
    batch: 30,
    title: "WildApricot",
    vendor: "WildApricot",
    handle: "wildapricot-association-management-software",
    collectionHandle: "association-management-software",
    collectionTitle: "Association Management Software",
    customUrl: "https://www.wildapricot.com/",
    sourceUrl: "https://www.wildapricot.com/pricing",
    sourceUrls: [
      "https://www.wildapricot.com/",
      "https://www.wildapricot.com/pricing",
      "https://www.wildapricot.com/features/membership-management-software",
      "https://www.capterra.in/directory/30113/association-management/software",
    ],
    logoSourceUrl: "https://www.wildapricot.com/",
    sourceLabel: "Official WildApricot product and pricing pages; Capterra used for discovery",
    audience: "member-based organizations and associations that need membership, events, payments, and website tools together",
    overview: "managing member records, renewals, events, payments, and communications from one cloud platform",
    fitReason: "the official site presents WildApricot as membership management software for organizations that need renewals, invoicing, websites, events, donations, and member communication",
    workflowFocus: "member administration, renewals, events, communications, and self-service portals",
    useCases: [
      "automate dues and renewal reminders",
      "run events and registration workflows",
      "maintain a member-facing website and portal",
      "handle payments, donations, and organization reporting",
    ],
    featureList: [
      "use a cloud-based member and contact database",
      "automate renewals, invoicing, recurring payments, and reminders",
      "run event listings, registrations, and event emails",
      "build a branded website and member portal without separate tooling",
      "manage donations, reports, and financial exports from one platform",
    ],
    pricingBullets: [
      "100 Contacts plan starts at 59.40 per month when prepaid annually.",
      "Monthly billing for 100 Contacts is listed at 66 per month.",
      "A 60-day free trial is available with no credit card required.",
    ],
    factualPros: ["public pricing is easy to verify", "broad association workflow coverage", "free trial is generous"],
    factualCons: ["pricing scales with contact volume", "payment-system details should be reviewed carefully", "larger chapter structures may need custom planning"],
    strengthsSummary: "clear association management fit, visible pricing, and strong coverage across membership, website, and event operations",
    tradeoffSummary: "WildApricot is especially compelling for member-based organizations that want one system, though growing databases will need close plan review.",
    startingPrice: 59.4,
    priceEvidence: "the visible 59.40 per month 100 Contacts annual-billing entry plan on the official pricing page",
    seoDescription: "WildApricot helps associations manage members, renewals, events, payments, and member-facing websites.",
    filters: {
      software_type: ["CRM & sales"],
      target_segment: ["Small business", "Mid-market", "Education / public sector"],
      pricing_model: ["Subscription"],
      price_band: ["$51-$200/month"],
      deployment_model: ["Cloud / SaaS"],
      collaboration_mode: ["Team sharing"],
      support_coverage: ["Business hours support"],
    },
    confidence: "high",
  },
  {
    batch: 30,
    title: "Join It",
    vendor: "Join It",
    handle: "join-it-association-management-software",
    collectionHandle: "association-management-software",
    collectionTitle: "Association Management Software",
    customUrl: "https://joinit.com/",
    sourceUrl: "https://support.joinit.com/en/articles/2772686-general-pricing-questions",
    sourceUrls: [
      "https://joinit.com/",
      "https://joinit.com/features/membership-crm",
      "https://support.joinit.com/en/articles/2772686-general-pricing-questions",
      "https://www.capterra.in/directory/30113/association-management/software",
    ],
    logoSourceUrl: "https://joinit.com/",
    sourceLabel: "Official Join It product and pricing pages; Capterra used for discovery",
    audience: "associations and membership programs that want a simpler membership CRM and renewal workflow",
    overview: "keeping member records, payments, renewals, and member communications organized in a modern membership platform",
    fitReason: "the official site centers Join It around membership management, renewal automation, member CRM, digital cards, payments, and connected website workflows",
    workflowFocus: "member data, renewals, payments, digital cards, and self-service membership operations",
    useCases: [
      "centralize member data and status history",
      "automate renewal reminders and recurring payments",
      "offer member self-service and digital membership cards",
      "connect membership workflows to websites and common external tools",
    ],
    featureList: [
      "keep all member data in one organized membership CRM",
      "automate renewals, reminders, and payment collection",
      "support digital membership cards and member self-service",
      "store admin-only notes and key membership details in one place",
      "integrate with tools such as Stripe, WordPress, Mailchimp, and Eventbrite",
    ],
    pricingBullets: [
      "Starter package begins at 29 per month.",
      "Total and Extra packages begin at 99 and 199 per month.",
      "Enterprise pricing is available by request.",
    ],
    factualPros: ["public starting price", "clean membership CRM positioning", "integrations are visible on the official site"],
    factualCons: ["service fees and payment processor costs still need review", "larger organizations may need higher packages", "buyers should confirm which package matches their membership volume"],
    strengthsSummary: "easy-to-understand member management workflow, public pricing, and a lighter-weight approach than some broader platforms",
    tradeoffSummary: "Join It is best suited to organizations that value clarity and ease of use over the deepest all-in-one association feature breadth.",
    startingPrice: 29,
    priceEvidence: "the visible 29 per month Starter package in the official Join It pricing support article",
    seoDescription: "Join It helps associations manage members, renewals, payments, and member-facing digital experiences.",
    filters: {
      software_type: ["CRM & sales"],
      target_segment: ["Small business", "Mid-market", "Education / public sector"],
      pricing_model: ["Subscription"],
      price_band: ["$10-$50/month"],
      deployment_model: ["Cloud / SaaS"],
      integrations: ["WordPress / WooCommerce"],
      collaboration_mode: ["Team sharing"],
      support_coverage: ["Business hours support"],
    },
    confidence: "high",
  },
  {
    batch: 31,
    title: "Buddy Punch",
    vendor: "Buddy Punch",
    handle: "buddy-punch-attendance-tracking-software",
    collectionHandle: "attendance-tracking-software",
    collectionTitle: "Attendance Tracking Software",
    customUrl: "https://buddypunch.com/",
    sourceUrl: "https://buddypunch.com/pricing/",
    sourceUrls: [
      "https://buddypunch.com/",
      "https://buddypunch.com/pricing/",
      "https://www.capterra.in/directory/30527/attendance-tracking/pricing/free/software",
    ],
    logoSourceUrl: "https://buddypunch.com/",
    sourceLabel: "Official Buddy Punch product and pricing pages; Capterra used for discovery",
    audience: "small and growing teams that need attendance, time tracking, and scheduling controls in one product",
    overview: "tracking attendance, punches, time off, and payroll-ready hours with location and device controls",
    fitReason: "the official pricing page positions Buddy Punch around employee time tracking, scheduling, payroll integrations, GPS punches, kiosk options, and reporting",
    workflowFocus: "time punches, attendance enforcement, payroll preparation, and scheduling control",
    useCases: [
      "track employee punches from mobile devices",
      "manage time off and job tracking",
      "sync hours into payroll providers",
      "enforce attendance controls such as GPS, geofencing, QR, or kiosk workflows",
    ],
    featureList: [
      "track attendance with mobile apps, time tracking, and time-off workflows",
      "capture GPS punch locations and add job or project tracking",
      "use reporting and payroll integrations from entry plans upward",
      "add geofencing, QR scanning, and kiosk punch methods on higher plans",
      "extend the platform with scheduling and GPS add-ons where needed",
    ],
    pricingBullets: [
      "Starter begins at 4.49 per user per month when billed annually.",
      "A 19 monthly base fee applies in addition to the per-user price.",
      "Pro and Enterprise plans add advanced attendance and support controls.",
    ],
    factualPros: ["public pricing is detailed", "attendance control features are easy to verify", "supports payroll-oriented workflows"],
    factualCons: ["pricing combines per-user and base fees", "advanced controls sit on higher plans or add-ons", "buyers should calculate true team cost before committing"],
    strengthsSummary: "clear attendance feature set, transparent pricing structure, and practical payroll integration support",
    tradeoffSummary: "Buddy Punch can be cost-effective for the right team, but buyers should look past the per-user headline and include the base fee in comparisons.",
    startingPrice: 4.49,
    priceEvidence: "the visible annual-billing Starter price of 4.49 per user per month on the official pricing page",
    seoDescription: "Buddy Punch helps teams track attendance, punches, time off, and payroll-ready hours with mobile and GPS controls.",
    filters: {
      software_type: ["Productivity"],
      target_segment: ["Small business", "Mid-market"],
      pricing_model: ["Subscription"],
      price_band: ["Under $10/month"],
      deployment_model: ["Cloud / SaaS"],
      support_coverage: ["Business hours support"],
      collaboration_mode: ["Roles & permissions"],
    },
    confidence: "high",
  },
  {
    batch: 31,
    title: "Jibble",
    vendor: "Jibble",
    handle: "jibble-attendance-tracking-software",
    collectionHandle: "attendance-tracking-software",
    collectionTitle: "Attendance Tracking Software",
    customUrl: "https://www.jibble.io/",
    sourceUrl: "https://www.jibble.io/upgrade-plans",
    sourceUrls: [
      "https://www.jibble.io/",
      "https://www.jibble.io/upgrade-plans",
      "https://www.jibble.io/attendance-tracker",
      "https://www.capterra.in/directory/30527/attendance-tracking/pricing/free/software",
    ],
    logoSourceUrl: "https://www.jibble.io/",
    sourceLabel: "Official Jibble product and pricing pages; Capterra used for discovery",
    audience: "teams that want free attendance and time tracking before deciding whether advanced controls are necessary",
    overview: "tracking attendance and time across mobile, desktop, and kiosk workflows with a strong free tier",
    fitReason: "the official site repeatedly positions Jibble as free attendance and time tracking software with attendance, biometric, reporting, and export features",
    workflowFocus: "attendance capture, biometric verification, timesheets, and team reporting",
    useCases: [
      "track attendance from mobile, desktop, or tablet",
      "use facial recognition or shared-kiosk clock-ins",
      "export timesheets into payroll workflows",
      "grow from a free core plan into paid control or policy features if needed",
    ],
    featureList: [
      "use a free plan that is positioned as free forever for unlimited users",
      "track attendance from desktop, mobile, tablet, and kiosk setups",
      "apply AI face recognition and geofence-based controls",
      "export timesheets and review analytics with advanced filters",
      "upgrade into higher plans for more policy, location, and management controls",
    ],
    pricingBullets: [
      "Free plan is available forever for unlimited users.",
      "Premium begins at 4.49 per user per month on the official upgrade page.",
      "Higher plans add more control, policies, and enterprise capabilities.",
    ],
    factualPros: ["free plan is clearly public", "attendance-specific features are easy to verify", "supports multiple device and clock-in styles"],
    factualCons: ["advanced controls move into paid tiers", "teams should compare free-plan limits against policy needs", "buyers with strict hierarchy needs may need higher plans"],
    strengthsSummary: "strong free entry point, clear attendance-category fit, and flexible device-based tracking options",
    tradeoffSummary: "Jibble is very appealing when cost control is important, but buyers should still verify whether the free tier covers the controls they actually need.",
    startingPrice: 0,
    priceEvidence: "the visible Free plan on the official Jibble upgrade page",
    seoDescription: "Jibble offers free attendance tracking with kiosk, biometric, reporting, and timesheet export workflows.",
    filters: {
      software_type: ["Productivity"],
      target_segment: ["Small business", "Mid-market"],
      pricing_model: ["Free", "Subscription"],
      price_band: ["Free"],
      deployment_model: ["Cloud / SaaS"],
      support_coverage: ["Business hours support"],
      collaboration_mode: ["Roles & permissions"],
    },
    confidence: "high",
  },
  {
    batch: 31,
    title: "Auctria",
    vendor: "Auctria",
    handle: "auctria-auction-software",
    collectionHandle: "auction-software",
    collectionTitle: "Auction Software",
    customUrl: "https://www.auctria.com/",
    sourceUrl: "https://academy.auctria.com/getting_started/auctria_costs/",
    sourceUrls: [
      "https://www.auctria.com/",
      "https://academy.auctria.com/getting_started/auctria_costs/",
      "https://www.capterra.in/directory/30528/auction/software",
    ],
    logoSourceUrl: "https://www.auctria.com/",
    sourceLabel: "Official Auctria product and pricing pages; Capterra used for discovery",
    audience: "nonprofits and fundraising teams that need online, silent, and live auction operations in one tool",
    overview: "running event fundraising workflows from tickets and items to bidding, payments, and receipts",
    fitReason: "the official site positions Auctria as fundraising event and auction software covering silent, live, online, mobile, and text-based bidding workflows",
    workflowFocus: "auction event setup, item and donor management, bidding, and payment collection",
    useCases: [
      "run silent, live, online, or hybrid auction events",
      "manage tickets, tables, bids, purchases, and donations",
      "build an event website with branded content",
      "handle text bidding and payment workflows from one system",
    ],
    featureList: [
      "run silent, live, online, and hybrid auction fundraisers from one platform",
      "manage tickets, tables, raffles, paddle raise, and sponsorship activity",
      "track donors, items, bids, purchases, and donations in one workflow",
      "use mobile and text-based bidding options for participant engagement",
      "start on a free Explorer license and scale into paid annual tiers",
    ],
    pricingBullets: [
      "Explorer plan is FREE for up to 10,000 in annual income.",
      "Emerald is listed at 375 per year and Diamond at 750 per year.",
      "Texting and optional services can add extra cost depending on usage.",
    ],
    factualPros: ["free entry plan is public", "auction-specific workflow coverage is strong", "pricing transparency is better than many competitors"],
    factualCons: ["annual pricing and processing fees should be reviewed together", "fundraising-event complexity can still require planning", "optional services add to total spend"],
    strengthsSummary: "strong auction-category alignment, transparent entry pricing, and broad coverage from setup through payment collection",
    tradeoffSummary: "Auctria is attractive for fundraising teams, but payment-processing economics still deserve a careful read before launch.",
    startingPrice: 0,
    priceEvidence: "the visible FREE Explorer license on the official Auctria costs page",
    seoDescription: "Auctria helps fundraising teams run silent, live, and online auctions with bidding, tickets, and donor workflows.",
    filters: {
      software_type: ["CRM & sales"],
      target_segment: ["Small business", "Education / public sector"],
      pricing_model: ["Free", "Subscription"],
      price_band: ["Free"],
      deployment_model: ["Cloud / SaaS"],
      support_coverage: ["Business hours support"],
      collaboration_mode: ["Team sharing"],
    },
    confidence: "high",
  },
  {
    batch: 31,
    title: "Givebutter",
    vendor: "Givebutter",
    handle: "givebutter-auction-software",
    collectionHandle: "auction-software",
    collectionTitle: "Auction Software",
    customUrl: "https://givebutter.com/",
    sourceUrl: "https://givebutter.com/auctions",
    sourceUrls: [
      "https://givebutter.com/",
      "https://givebutter.com/auctions",
      "https://help.givebutter.com/en/articles/12143045-givebutter-legacy-pricing-explained",
      "https://www.capterra.in/directory/30528/auction/software",
    ],
    logoSourceUrl: "https://givebutter.com/",
    sourceLabel: "Official Givebutter product and pricing pages; Capterra used for discovery",
    audience: "nonprofits that want low-friction online auction fundraising with donor-friendly participation",
    overview: "running charity auctions with item management, bidding, checkout, and donor engagement on one fundraising platform",
    fitReason: "the official auction page presents Givebutter as free auction software for nonprofits with item management, bidding notifications, checkout, and real-time updates",
    workflowFocus: "auction fundraising, donor engagement, item setup, and checkout flows",
    useCases: [
      "launch online or hybrid charity auctions",
      "manage items, categories, and bidding activity",
      "send automated bid and outbid notifications",
      "complete winner checkout and payment reminders in one place",
    ],
    featureList: [
      "run unlimited auctions with item and category management tools",
      "give supporters real-time bidding updates and mobile notifications",
      "support buy-now options, automated bids, and checkout workflows",
      "manage bidder, winner, payment, and donor activity from one fundraising platform",
      "start without platform cost when the free pricing model conditions are met",
    ],
    pricingBullets: [
      "Givebutter is described as completely free to use.",
      "Auction access is available from a free account with optional donor tips enabled.",
      "If tips are hidden, a flat platform fee can apply in addition to payment processing fees.",
    ],
    factualPros: ["free entry is clearly stated", "auction workflows are well explained", "real-time bidder experience is a visible strength"],
    factualCons: ["final fee experience depends on pricing configuration", "payment-processing costs still apply", "nonprofit event needs should be matched to feature depth"],
    strengthsSummary: "simple free starting point, clear nonprofit auction positioning, and a bidder-friendly event experience",
    tradeoffSummary: "The product is easy to shortlist, but organizations should still confirm how platform-fee choices affect the economics of each event.",
    startingPrice: 0,
    priceEvidence: "the official Help Center and auction pages describe Givebutter as free to use",
    seoDescription: "Givebutter helps nonprofits run free online auctions with item management, bidding, and checkout workflows.",
    filters: {
      software_type: ["CRM & sales"],
      target_segment: ["Small business", "Education / public sector"],
      pricing_model: ["Free"],
      price_band: ["Free"],
      deployment_model: ["Cloud / SaaS"],
      support_coverage: ["24/7 support"],
      collaboration_mode: ["Team sharing"],
    },
    confidence: "high",
  },
  {
    batch: 32,
    title: "Poll Everywhere",
    vendor: "Poll Everywhere",
    handle: "poll-everywhere-audience-response-software",
    collectionHandle: "audience-response-software",
    collectionTitle: "Audience Response Software",
    customUrl: "https://www.polleverywhere.com/",
    sourceUrl: "https://www.polleverywhere.com/plans",
    sourceUrls: [
      "https://www.polleverywhere.com/",
      "https://www.polleverywhere.com/plans",
      "https://www.capterra.in/directory/31398/audience-response/software",
    ],
    logoSourceUrl: "https://www.polleverywhere.com/",
    sourceLabel: "Official Poll Everywhere product and pricing pages; Capterra used for discovery",
    audience: "presenters, trainers, and educators that need live polls and audience participation during sessions",
    overview: "turning presentations and meetings into two-way sessions with live polling, Q&A, surveys, and response reporting",
    fitReason: "the official plans page centers Poll Everywhere around audience engagement, unlimited questions, live responses, AI prompts, and reporting",
    workflowFocus: "live polls, Q&A, audience participation, and response analysis",
    useCases: [
      "collect real-time audience responses during meetings and presentations",
      "run unlimited questions in slide decks or web surveys",
      "use AI prompts to create audience interactions faster",
      "review response reports after a session",
    ],
    featureList: [
      "start on a free Intro plan with live audience participation tools",
      "create unlimited questions, polls, and grouped slide decks or web surveys",
      "use AI prompts to accelerate question creation",
      "expand audience size and reporting features on paid tiers",
      "support business, nonprofit, education, and event-style interactions",
    ],
    pricingBullets: [
      "Intro plan is Free on the official business and nonprofit plans page.",
      "Present starts at 10 per month billed annually.",
      "Higher tiers expand audience size, AI prompts, and reporting capabilities.",
    ],
    factualPros: ["free plan is public", "strong audience-response category fit", "presentation workflow is clearly described"],
    factualCons: ["larger audiences require paid tiers", "feature depth varies by plan", "buyers should verify integration needs before selection"],
    strengthsSummary: "clear live-engagement focus, public starting price, and practical support for presentations and meetings",
    tradeoffSummary: "Poll Everywhere is easy to evaluate, though audience size and reporting requirements will quickly shape the best-fit plan.",
    startingPrice: 0,
    priceEvidence: "the visible Free Intro plan on the official plans page",
    seoDescription: "Poll Everywhere helps teams run live polls, Q&A, and audience feedback in meetings, classes, and events.",
    filters: {
      software_type: ["Productivity"],
      target_segment: ["Small business", "Mid-market", "Education / public sector"],
      pricing_model: ["Free", "Subscription"],
      price_band: ["Free"],
      deployment_model: ["Cloud / SaaS"],
      support_coverage: ["Documentation only"],
      collaboration_mode: ["Real-time collaboration"],
    },
    confidence: "high",
  },
  {
    batch: 32,
    title: "AhaSlides",
    vendor: "AhaSlides",
    handle: "ahaslides-audience-response-software",
    collectionHandle: "audience-response-software",
    collectionTitle: "Audience Response Software",
    customUrl: "https://ahaslides.com/",
    sourceUrl: "https://ahaslides.com/pricing/",
    sourceUrls: [
      "https://ahaslides.com/",
      "https://ahaslides.com/pricing/",
      "https://ahaslides.com/features/",
      "https://www.capterra.in/directory/31398/audience-response/software",
    ],
    logoSourceUrl: "https://ahaslides.com/",
    sourceLabel: "Official AhaSlides product and pricing pages; Capterra used for discovery",
    audience: "trainers, teachers, and meeting hosts that need lightweight interactive presentation tools",
    overview: "adding polls, quizzes, Q&A, and visual engagement formats to presentations and live sessions",
    fitReason: "the official site presents AhaSlides as interactive presentation software with live polls, quizzes, word clouds, Q&A, and audience analytics",
    workflowFocus: "interactive presentation design, audience participation, and session analytics",
    useCases: [
      "run live polls and quizzes during sessions",
      "collect Q&A and word-cloud style feedback",
      "present to smaller groups on a free plan",
      "grow into paid tiers for higher participant counts and exports",
    ],
    featureList: [
      "use live polls, quizzes, word clouds, Q&A, and survey interactions",
      "start free with up to 50 participants and unlimited events per month",
      "unlock unlimited interactive slides and analytics on paid plans",
      "connect with PowerPoint, Teams, Zoom, Google Slides, and RingCentral",
      "use branding, moderation, and export features on higher tiers",
    ],
    pricingBullets: [
      "Free plan is available at 0 with up to 50 participants.",
      "Essential begins at 7.95 per month billed yearly.",
      "Pro and Enterprise tiers expand analytics, moderation, security, and support.",
    ],
    factualPros: ["free plan is clearly public", "broad engagement features are visible", "integrations are published on the official site"],
    factualCons: ["participant limits matter on free and lower tiers", "advanced branding and moderation require upgrades", "buyers should confirm which pricing track applies to their use case"],
    strengthsSummary: "accessible free entry, clear audience-engagement feature set, and strong presentation-platform integrations",
    tradeoffSummary: "AhaSlides is especially well suited to interactive sessions, but buyers should align participant limits and feature depth with event scale.",
    startingPrice: 0,
    priceEvidence: "the visible Free plan on the official AhaSlides pricing page",
    seoDescription: "AhaSlides helps presenters run polls, quizzes, Q&A, and interactive sessions with simple audience engagement tools.",
    filters: {
      software_type: ["Productivity"],
      target_segment: ["Individuals", "Small business", "Education / public sector"],
      pricing_model: ["Free", "Subscription"],
      price_band: ["Free"],
      deployment_model: ["Cloud / SaaS"],
      integrations: ["Google / Microsoft"],
      collaboration_mode: ["Real-time collaboration"],
      support_coverage: ["Business hours support"],
    },
    confidence: "high",
  },
  {
    batch: 32,
    title: "FreeConferenceCall.com",
    vendor: "FreeConferenceCall.com",
    handle: "freeconferencecall-com-audio-conferencing-software",
    collectionHandle: "audio-conferencing-software",
    collectionTitle: "Audio Conferencing Software",
    customUrl: "https://www.freeconferencecall.com/en/us",
    sourceUrl: "https://www.freeconferencecall.com/en/pricing",
    sourceUrls: [
      "https://www.freeconferencecall.com/en/us",
      "https://www.freeconferencecall.com/en/pricing",
      "https://www.capterra.in/directory/32919/audio-conferencing/software",
    ],
    logoSourceUrl: "https://www.freeconferencecall.com/en/us",
    sourceLabel: "Official FreeConferenceCall.com product and pricing pages; Capterra used for discovery",
    audience: "businesses, nonprofits, educators, and distributed teams that need low-cost conference calling and collaboration tools",
    overview: "hosting audio conferences and related collaboration sessions with global access and a free core service model",
    fitReason: "the official site presents FreeConferenceCall.com as free conference calling with up to 1,000 participants, global dial-in access, recordings, and support resources",
    workflowFocus: "audio meetings, global dial-in access, host controls, and collaboration utilities",
    useCases: [
      "host audio conferences for remote teams or communities",
      "invite large participant groups with dial-in access",
      "review recordings and call detail history after meetings",
      "use global conferencing support across distributed locations",
    ],
    featureList: [
      "host standard meetings with up to 1,000 participants",
      "use free teleconferencing, screen sharing, video conferencing, and recordings",
      "access global dial-in numbers and mobile or desktop apps",
      "work from a pay-what-you-can pricing model with a free account",
      "contact customer care with 24/7 chat and email support options",
    ],
    pricingBullets: [
      "The core service is described as totally free.",
      "The pricing page suggests 4 per month as a voluntary contribution amount.",
      "FCC Pro adds premium capabilities for users that need upgraded conferencing features.",
    ],
    factualPros: ["free entry is clearly stated", "large participant support is visible", "global access is a notable strength"],
    factualCons: ["pricing model is unconventional for comparison shopping", "premium upgrade structure is less standardized than simple plan tiers", "buyers should confirm whether dedicated dial-in needs require FCC Pro"],
    strengthsSummary: "free access, generous participant limits, and strong global conferencing coverage",
    tradeoffSummary: "The service is appealing for cost-sensitive buyers, though organizations with very strict conferencing requirements may want to compare its premium path carefully.",
    startingPrice: 0,
    priceEvidence: "the official pricing page describes the service as totally free with pay-what-you-can contributions",
    seoDescription: "FreeConferenceCall.com provides audio conferencing, global dial-in access, and free collaboration tools for distributed teams.",
    filters: {
      software_type: ["Productivity"],
      target_segment: ["Individuals", "Small business", "Mid-market", "Education / public sector"],
      pricing_model: ["Free"],
      price_band: ["Free"],
      deployment_model: ["Cloud / SaaS"],
      support_coverage: ["24/7 support"],
      collaboration_mode: ["Real-time collaboration"],
    },
    confidence: "high",
  },
  {
    batch: 32,
    title: "Webex",
    vendor: "Webex",
    handle: "webex-audio-conferencing-software",
    collectionHandle: "audio-conferencing-software",
    collectionTitle: "Audio Conferencing Software",
    customUrl: "https://www.webex.com/",
    sourceUrl: "https://pricing.webex.com/us/en/hybrid-work/meetings/all-features/",
    sourceUrls: [
      "https://www.webex.com/",
      "https://pricing.webex.com/us/en/hybrid-work/meetings/all-features/",
      "https://www.capterra.in/directory/32919/audio-conferencing/software",
    ],
    logoSourceUrl: "https://www.webex.com/",
    sourceLabel: "Official Webex product and pricing pages; Capterra used for discovery",
    audience: "teams that need conferencing, calling, and collaboration under an enterprise-capable brand",
    overview: "running secure meetings and calls with messaging, whiteboards, recordings, and plan-based collaboration features",
    fitReason: "the official pricing page presents Webex Free and paid meeting plans with conferencing, audio, recording, messaging, app integration, and support capabilities",
    workflowFocus: "meetings, conferencing, team messaging, and hybrid collaboration",
    useCases: [
      "host conference meetings with audio and screen sharing",
      "support internal and external collaboration with messaging and whiteboards",
      "scale from a free plan into paid meeting and calling tiers",
      "use enterprise-ready security and admin features where needed",
    ],
    featureList: [
      "start on a free plan with meetings up to 40 minutes and up to 100 attendees",
      "use screen sharing, whiteboards, local recording, and unlimited messaging",
      "add paid meeting and call tiers for more attendees, cloud recording, and telephony",
      "support app integrations and advanced security features",
      "extend into broader hybrid-work and calling workflows as needs grow",
    ],
    pricingBullets: [
      "Webex Free is available at 0 per user per year.",
      "Webex Meet is listed at 12 per license per month on the official pricing table.",
      "Higher plans add calling, larger-scale collaboration, and enterprise support.",
    ],
    factualPros: ["free plan is visible", "enterprise-capable collaboration depth is public", "security and integration signals are strong"],
    factualCons: ["full plan matrix can be more complex than simpler conferencing tools", "paid options vary by product family", "buyers should align plan choice with meeting and calling needs"],
    strengthsSummary: "recognized collaboration brand, free starting point, and deeper security and integration depth than many lightweight alternatives",
    tradeoffSummary: "Webex is a strong shortlist option when conferencing is part of a broader collaboration stack, but the full portfolio can require more evaluation effort.",
    startingPrice: 0,
    priceEvidence: "the visible Webex Free plan at 0 per user per year on the official pricing page",
    seoDescription: "Webex supports audio conferencing, meetings, messaging, and secure collaboration with free and paid plans.",
    filters: {
      software_type: ["Productivity"],
      target_segment: ["Small business", "Mid-market", "Enterprise"],
      pricing_model: ["Free", "Subscription"],
      price_band: ["Free"],
      deployment_model: ["Cloud / SaaS"],
      integrations: ["Google / Microsoft"],
      security_compliance: ["SSO / RBAC"],
      support_coverage: ["Documentation only"],
      collaboration_mode: ["Real-time collaboration"],
    },
    confidence: "high",
  },
];

const grouped = new Map<number, PreviewRow[]>();

const buildCsv = (rows: PreviewRow[]) => {
  const headers = [
    "title",
    "handle",
    "vendor",
    "price",
    "status",
    "published",
    "charge_tax",
    "requires_shipping",
    "image_alt_text",
    "seo_title",
    "seo_description",
    "collection_handles",
    "collection_titles",
    "source_url",
    "source_urls",
    "source_label",
    "logo_source_url",
    "custom_url",
    "custom_logo_image",
    "custom_type_multiple",
    "product_features",
    "plans_pricing",
    "pros_cons",
    "filter_values",
    "verification_notes",
    "confidence",
    "missing_fields",
    "body_html",
  ];

  return [
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
        row.imageAltText,
        row.seoTitle,
        row.seoDescription,
        JSON.stringify(row.collectionHandles),
        JSON.stringify(row.collectionTitles),
        row.sourceUrl,
        JSON.stringify(row.sourceUrls),
        row.sourceLabel,
        row.logoSourceUrl,
        row.customUrl,
        row.customLogoImage,
        JSON.stringify(row.customTypeMultiple),
        row.productFeatures,
        row.plansPricing,
        row.prosCons,
        JSON.stringify(row.filterValues),
        row.verificationNotes,
        row.confidence,
        JSON.stringify(row.missingFields),
        row.bodyHtml,
      ]
        .map(csvEscape)
        .join(",")
    ),
  ].join("\n");
};

const main = async () => {
  for (const spec of specs) {
    const row = rowFromSpec(spec);
    const current = grouped.get(spec.batch) ?? [];
    current.push(row);
    grouped.set(spec.batch, current);
  }

  await fs.promises.mkdir(EXPORTS_DIR, { recursive: true });

  for (const batch of [28, 29, 30, 31, 32]) {
    const rows = grouped.get(batch) ?? [];
    if (rows.length !== 4) {
      throw new Error(`Expected 4 rows for batch ${batch}, found ${rows.length}`);
    }

    const jsonPath = path.join(EXPORTS_DIR, `software-batch${batch}-preview-${DATE_STAMP}.json`);
    const csvPath = path.join(EXPORTS_DIR, `software-batch${batch}-preview-${DATE_STAMP}.csv`);
    const reportPath = path.join(EXPORTS_DIR, `software-batch${batch}-validation-${DATE_STAMP}.json`);

    const report = {
      generatedAt: new Date().toISOString(),
      batch,
      totalRows: rows.length,
      handles: rows.map((row) => row.handle),
      descriptionWordCounts: rows.map((row) => ({
        handle: row.handle,
        words: wordCount(row.bodyHtml),
      })),
      blankPriceHandles: rows.filter((row) => row.price === "").map((row) => row.handle),
      logoPendingHandles: rows.filter((row) => row.missingFields.includes("custom.logo_image")).map((row) => row.handle),
      allPricesNumericOrBlank: rows.every((row) => row.price === "" || /^\d+(\.\d+)?$/.test(row.price)),
      allPublished: rows.every((row) => row.published === true),
      allActive: rows.every((row) => row.status === "active"),
      allNonShipping: rows.every((row) => row.requiresShipping === false),
      allNoTax: rows.every((row) => row.chargeTax === false),
    };

    await Promise.all([
      fs.promises.writeFile(jsonPath, JSON.stringify(rows, null, 2), "utf8"),
      fs.promises.writeFile(csvPath, buildCsv(rows), "utf8"),
      fs.promises.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8"),
    ]);

    console.log(
      JSON.stringify(
        {
          batch,
          jsonPath,
          csvPath,
          reportPath,
          handles: rows.map((row) => row.handle),
        },
        null,
        2
      )
    );
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
