import * as fs from "fs";
import * as path from "path";

const EXPORTS_DIR = path.resolve(__dirname, "../../exports");
const DATE_STAMP = "2026-06-11";

type Confidence = "high" | "medium" | "low";
type FilterValues = Record<string, string[]>;

type CategoryRef = {
  handle: string;
  title: string;
};

type Spec = {
  title: string;
  vendor: string;
  handle: string;
  categories: CategoryRef[];
  customUrl: string;
  sourceUrl: string;
  sourceUrls: string[];
  logoSourceUrl: string;
  sourceLabel: string;
  summary: string;
  audience: string;
  bestFor: string;
  useCases: string[];
  featureGroups: Array<{
    heading: string;
    items: string[];
  }>;
  pricingSummary: string;
  pricingLines: string[];
  price: number;
  pros: string[];
  cons: string[];
  seoTitle: string;
  seoDescription: string;
  filters: FilterValues;
  verificationNotes: string;
  confidence: Confidence;
  missingFields?: string[];
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

const dedupe = <T>(values: T[]) => Array.from(new Set(values));

const csvEscape = (value: unknown) => {
  const stringValue =
    typeof value === "string"
      ? value
      : value === null || value === undefined
        ? ""
        : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
};

const stripHtml = (value: string) => value.replace(/<[^>]+>/g, " ");

const wordCount = (value: string) =>
  stripHtml(value)
    .split(/\s+/)
    .filter(Boolean).length;

const buildBodyHtml = (spec: Spec) => {
  const categoryNames = spec.categories.map((item) => item.title).join(", ");
  return [
    `<p>${spec.title} is positioned for buyers evaluating ${categoryNames.toLowerCase()} and looking for a product that can support ${spec.summary}. The official product pages present it as a practical platform for teams that need dependable deployment, a clear workflow, and a real-world implementation path rather than a one-off prototype. That makes it relevant for organizations that want to compare not only core capability, but also rollout complexity, supported use cases, pricing structure, and operational fit.</p>`,
    `<p>${spec.bestFor} ${spec.audience} can use it to improve how people navigate spaces, learn procedures, communicate with prospects, or understand working styles depending on the product category. In each case, the product is presented as a business-ready service rather than a novelty experience. Buyers evaluating software in these collections usually care about whether the experience is easy to adopt, whether deployment can scale beyond a pilot, and whether the platform can align with day-to-day operational goals. ${spec.title} addresses that comparison through its combination of product workflow, support posture, and commercial structure.</p>`,
    `<h2>Common use cases</h2>`,
    `<ul>${spec.useCases.map((item) => `<li>${item}</li>`).join("")}</ul>`,
    `<h2>Key capabilities</h2>`,
    ...spec.featureGroups.map(
      (group) =>
        `<h3>${group.heading}</h3><ul>${group.items
          .map((item) => `<li>${item}</li>`)
          .join("")}</ul>`
    ),
    `<p>For comparison shopping, buyers should look closely at how ${spec.title} handles onboarding, day-to-day administration, and the depth of the product experience. Those factors often matter just as much as the headline feature set. A strong match is usually one where the platform fits the team’s current maturity, offers room to scale, and supports the environments or workflows that matter most. ${spec.title} is especially relevant when the goal is to choose a solution that feels operationally usable, not just technically interesting.</p>`,
    `<h2>Pricing and buying notes</h2>`,
    `<p>${spec.pricingSummary}</p>`,
    `<h2>What to consider before choosing</h2>`,
    `<p>${spec.title} brings clear strengths for buyers who value ${spec.pros.slice(0, 3).join(", ")}. At the same time, a balanced evaluation should weigh points such as ${spec.cons.join(", ")}. That is particularly important when comparing products with public self-serve pricing against enterprise-led sales motions, or when deciding whether a broader platform justifies a more involved rollout. For the right team and use case, ${spec.title} can be a strong marketplace fit, but it is still wise to confirm current commercial terms, support expectations, and implementation requirements before making a final decision.</p>`,
  ].join("");
};

const buildProductFeatures = (spec: Spec) =>
  spec.featureGroups
    .map((group) => [group.heading, ...group.items.map((item) => `- ${item}`)].join("\n"))
    .join("\n\n");

const buildPlansPricing = (spec: Spec) =>
  [spec.pricingSummary, ...spec.pricingLines.map((line) => `- ${line}`)].join("\n");

const buildProsCons = (spec: Spec) =>
  ["Pros", ...spec.pros.map((item) => `- ${item}`), "", "Cons", ...spec.cons.map((item) => `- ${item}`)].join(
    "\n"
  );

const rowFromSpec = (spec: Spec): PreviewRow => {
  const bodyHtml = buildBodyHtml(spec);
  if (wordCount(bodyHtml) < 300) {
    throw new Error(`Description below 300 words for ${spec.handle}`);
  }

  const collectionHandles = dedupe(spec.categories.map((item) => item.handle));
  const collectionTitles = dedupe(spec.categories.map((item) => item.title));

  return {
    title: spec.title,
    handle: spec.handle,
    bodyHtml,
    vendor: spec.vendor,
    status: "active",
    published: true,
    price: String(spec.price),
    chargeTax: false,
    requiresShipping: false,
    imageAltText: `${spec.title} logo`,
    seoTitle: spec.seoTitle,
    seoDescription: spec.seoDescription,
    collectionHandles,
    collectionTitles,
    sourceUrl: spec.sourceUrl,
    sourceUrls: spec.sourceUrls,
    sourceLabel: spec.sourceLabel,
    logoSourceUrl: spec.logoSourceUrl,
    customUrl: spec.customUrl,
    customLogoImage: "",
    customTypeMultiple: collectionTitles,
    productFeatures: buildProductFeatures(spec),
    plansPricing: buildPlansPricing(spec),
    prosCons: buildProsCons(spec),
    filterValues: spec.filters,
    verificationNotes: spec.verificationNotes,
    confidence: spec.confidence,
    missingFields: spec.missingFields ?? ["custom.logo_image"],
  };
};

const AR_NAV: CategoryRef = {
  handle: "ar-navigation-ai",
  title: "AR Navigation AI",
};
const AR_TRAIN: CategoryRef = {
  handle: "ar-training-simulations",
  title: "AR Training Simulations",
};
const BEHAVIOR: CategoryRef = {
  handle: "behavioral-analysis-ai",
  title: "Behavioral Analysis AI",
};
const TRAINING_SOFTWARE: CategoryRef = {
  handle: "training-software",
  title: "Training Software",
};
const SIMULATION_SOFTWARE: CategoryRef = {
  handle: "simulation-software",
  title: "Simulation Software",
};
const VR_SOFTWARE: CategoryRef = {
  handle: "virtual-reality-vr-software",
  title: "Virtual Reality (VR) Software",
};

const specs: Spec[] = [
  {
    title: "Immersal",
    vendor: "Immersal",
    handle: "immersal",
    categories: [AR_NAV],
    customUrl: "https://immersal.com/",
    sourceUrl: "https://immersal.com/pricing/",
    sourceUrls: ["https://immersal.com/", "https://immersal.com/pricing/"],
    logoSourceUrl: "https://immersal.com/",
    sourceLabel: "Official Immersal product and pricing pages",
    summary: "visual positioning and AR navigation experiences for commercial spaces, industrial environments, and large-scale location-aware deployments",
    audience: "Teams can use it for indoor and site-scale spatial experiences where navigation, positioning accuracy, and AR overlays need to work together across practical business settings.",
    bestFor:
      "It is best suited to teams that want an AR navigation stack with visual positioning, mapping, and room to move from testing into commercial rollout.",
    useCases: [
      "Create AR navigation and wayfinding experiences inside large commercial venues.",
      "Support industrial or site-based AR workflows that depend on mapped spatial context.",
      "Build visual positioning experiences for mobile devices and supported AR headsets.",
      "Scale from early experimentation into commercial VPS-enabled deployments.",
    ],
    featureGroups: [
      {
        heading: "Mapping and positioning",
        items: [
          "Immersal Mapper support with image-based map creation",
          "Visual positioning service for location-aware AR experiences",
          "Support for larger mapped environments on paid plans",
        ],
      },
      {
        heading: "Platform capabilities",
        items: [
          "VPS for Web on Pro",
          "360 camera and Leica device upload support on Pro",
          "Commercial-use support on paid plans",
        ],
      },
      {
        heading: "Deployment options",
        items: [
          "Free plan for early testing",
          "Pro subscription for expanded usage",
          "Enterprise custom solutions for private server access, SLA, and large-scale projects",
        ],
      },
    ],
    pricingSummary:
      "Immersal lists a free tier at $0/month, a Pro plan at $99/month, and Enterprise custom pricing for larger deployments.",
    pricingLines: [
      "Free: $0/month with up to 100 images per map for getting started.",
      "Pro: $99/month with 360 camera and Leica upload support, VPS for Web access, and up to 500 images per map.",
      "Enterprise: custom pricing for large-scale VPS projects, private server access, and SLA-backed deployments.",
    ],
    price: 0,
    pros: [
      "Public pricing is available for both free and Pro entry points",
      "Strong fit for visual-positioning-led AR navigation projects",
      "Commercial-use path is clearly defined on paid plans",
      "Enterprise option covers larger and more demanding deployments",
    ],
    cons: [
      "Advanced deployment needs may require Enterprise engagement",
      "Map-size and feature limits differ significantly by plan",
      "Buyers still need to validate device and environment fit before rollout",
    ],
    seoTitle: "Immersal AR Navigation AI Visual Positioning Platform",
    seoDescription:
      "Immersal provides AR navigation and visual positioning tools with free, Pro, and Enterprise options for mapped commercial and industrial spaces.",
    filters: {
      pricing_model: ["Free", "Subscription", "Custom quote"],
      price_band: ["Free"],
      deployment_model: ["Cloud / SaaS"],
      customization_level: ["API / workflow customization", "Enterprise services"],
    },
    verificationNotes:
      "Official Immersal pricing reviewed on 2026-06-11. Public pricing was verified from the official pricing page. Logo upload remains pending until the upsert script runs.",
    confidence: "high",
  },
  {
    title: "Oriient",
    vendor: "Oriient",
    handle: "oriient",
    categories: [AR_NAV],
    customUrl: "https://www.oriient.me/",
    sourceUrl: "https://www.oriient.me/",
    sourceUrls: ["https://www.oriient.me/", "https://www.oriient.me/geomagnetic-indoor-positioning-technology/"],
    logoSourceUrl: "https://www.oriient.me/",
    sourceLabel: "Official Oriient website and technology pages",
    summary: "software-only indoor GPS and navigation services that use Earth’s magnetic field and proprietary deep learning technology for smartphone-based indoor wayfinding",
    audience: "It is aimed at organizations that want indoor navigation without installing beacons or other dedicated location hardware, especially in retail, malls, airports, and smart-building settings.",
    bestFor:
      "It is best suited to buyers that want a low-infrastructure indoor navigation approach and prefer an SDK-led platform over a point solution with custom hardware rollout.",
    useCases: [
      "Add indoor navigation to retail, airport, or mall mobile apps.",
      "Support multi-floor wayfinding on users' own smartphones.",
      "Deploy indoor positioning in smart-building environments without beacons.",
      "Use software-only location services where infrastructure simplicity matters.",
    ],
    featureGroups: [
      {
        heading: "Positioning technology",
        items: [
          "Software-only indoor positioning",
          "Uses Earth’s magnetic field for indoor location services",
          "Proprietary deep learning technology called out on the official site",
        ],
      },
      {
        heading: "Operational fit",
        items: [
          "No beacons or dedicated infrastructure required",
          "Accuracy positioned at within 1 meter on the official site",
          "Deployment aimed at mobile apps in retail and smart-building use cases",
        ],
      },
      {
        heading: "Commercial approach",
        items: [
          "SDK-oriented product model",
          "Demo-led sales motion",
          "Official pricing is not publicly listed",
        ],
      },
    ],
    pricingSummary:
      "Oriient presents a request-demo sales flow, but a public numeric base price was not safely confirmed from the official source reviewed for this dataset.",
    pricingLines: [
      "Commercial access is handled through the vendor's demo-led sales process.",
      "The official site emphasizes SDK deployment and indoor GPS services rather than a public self-serve plan table.",
      "Buyers should confirm current contract structure and rollout scope directly with Oriient.",
    ],
    price: 0,
    pros: [
      "Strong AR-navigation fit without hardware-heavy deployment",
      "Official site clearly highlights deep-learning-driven indoor positioning",
      "Useful for smartphone-led indoor wayfinding use cases",
    ],
    cons: [
      "Public numeric pricing was not safely verified",
      "Commercial terms require direct vendor engagement",
      "Buyers should validate venue-specific accuracy and implementation effort",
    ],
    seoTitle: "Oriient AR Navigation AI Indoor GPS Platform",
    seoDescription:
      "Oriient delivers software-only indoor GPS and navigation using Earth's magnetic field and proprietary deep learning technology for mobile apps.",
    filters: {
      pricing_model: ["Custom quote"],
      deployment_model: ["Cloud / SaaS", "API-first"],
      customization_level: ["API / workflow customization", "Enterprise services"],
    },
    verificationNotes:
      "Official Oriient homepage and linked product messaging reviewed on 2026-06-11. Product fit was verified from the official site, but a public numeric starting price was not safely confirmed. Logo upload remains pending until the upsert script runs.",
    confidence: "medium",
  },
  {
    title: "JigSpace",
    vendor: "JigSpace",
    handle: "jigspace",
    categories: [AR_TRAIN, TRAINING_SOFTWARE, SIMULATION_SOFTWARE, VR_SOFTWARE],
    customUrl: "https://www.jig.com/",
    sourceUrl: "https://www.jig.com/pricing",
    sourceUrls: ["https://www.jig.com/", "https://www.jig.com/pricing"],
    logoSourceUrl: "https://www.jig.com/",
    sourceLabel: "Official JigSpace pricing and product pages",
    summary: "interactive 3D and AR training, sales, and product demonstration workflows across Apple Vision Pro, iPad, web, and desktop environments",
    audience: "It is suitable for teams that want to replace static manuals, classroom sessions, or travel-heavy product walkthroughs with interactive spatial content that can be reused across distributed teams.",
    bestFor:
      "It is best suited to organizations that need immersive training or technical presentation workflows and want a platform that supports both day-to-day collaboration and larger enterprise rollouts.",
    useCases: [
      "Train technicians, crews, and field teams with interactive 3D walkthroughs.",
      "Use Apple Vision Pro or iPad-based spatial content for operational training.",
      "Share technical demonstrations and product education across distributed teams.",
      "Replace printed manuals or static collateral with reusable interactive modules.",
    ],
    featureGroups: [
      {
        heading: "Training and presentation workflow",
        items: [
          "Interactive 3D presentation and training content",
          "Support for training alongside sales demos and trade shows",
          "Apps for iPhone, iPad, Mac, Windows, and Apple Vision Pro with browser viewing support",
        ],
      },
      {
        heading: "Security and enterprise controls",
        items: [
          "SOC 2 Type II compliant environment",
          "Enterprise SSO and role-based access control",
          "EU Data Residency for enterprise customers",
        ],
      },
      {
        heading: "Commercial structure",
        items: [
          "Freemium plan with one Jig",
          "Starter and Organization paid tiers",
          "Enterprise custom pricing with customer success and professional services",
        ],
      },
    ],
    pricingSummary:
      "JigSpace publicly describes a freemium plan, Starter at $6,000 to $15,000 per year, Organization at $15,000 to $50,000 per year, and Enterprise at $50,000 to $1,000,000+ per year.",
    pricingLines: [
      "Freemium: one Jig for initial evaluation.",
      "Starter: $6,000 to $15,000 per year for smaller teams validating spatial computing.",
      "Organization: $15,000 to $50,000 per year for established sales or training teams.",
      "Enterprise: $50,000 to $1,000,000+ per year with SOC 2, SSO, EU Data Residency, white-label viewer, dedicated customer success, and professional services.",
      "Starter plan includes a 7-day free trial according to the official FAQ.",
    ],
    price: 6000,
    pros: [
      "Clear official pricing ranges for paid plans",
      "Strong fit for immersive training and technical education",
      "Enterprise security controls are explicitly documented",
      "Supports both device apps and browser-based viewing",
    ],
    cons: [
      "Paid pricing is oriented toward business teams rather than low-cost self-serve buyers",
      "Best-value plans are annual business purchases",
      "Enterprise benefits require higher-tier engagement",
    ],
    seoTitle: "JigSpace AR Training Simulations Spatial Training Platform",
    seoDescription:
      "JigSpace helps teams deliver interactive 3D training and technical presentations with Apple Vision Pro, iPad, web, and enterprise controls.",
    filters: {
      pricing_model: ["Freemium", "Subscription", "Custom quote"],
      free_trial: ["7 days"],
      deployment_model: ["Cloud / SaaS"],
      customization_level: ["Out of the box", "Enterprise services"],
      security_compliance: ["GDPR", "SOC 2", "SSO / RBAC"],
      support_coverage: ["Priority support", "Dedicated manager", "Migration / onboarding help"],
    },
    verificationNotes:
      "Official JigSpace pricing page and embedded FAQ reviewed on 2026-06-11. Paid pricing ranges, trial details, device support, and enterprise security notes were verified from the official source. Logo upload remains pending until the upsert script runs.",
    confidence: "high",
  },
  {
    title: "GMetriXR",
    vendor: "GMetriXR",
    handle: "gmetrixr",
    categories: [AR_TRAIN, TRAINING_SOFTWARE, SIMULATION_SOFTWARE, VR_SOFTWARE],
    customUrl: "https://www.gmetri.com/",
    sourceUrl: "https://www.gmetri.com/pricing",
    sourceUrls: ["https://www.gmetri.com/", "https://www.gmetri.com/pricing"],
    logoSourceUrl: "https://www.gmetri.com/",
    sourceLabel: "Official GMetriXR pricing and platform pages",
    summary: "no-code XR, metaverse, onboarding, and training experiences with collaborative spaces, editor access, and SDK-driven extension points",
    audience: "It is relevant for teams that want to build training simulations, onboarding experiences, or immersive learning spaces without relying on a code-first production workflow.",
    bestFor:
      "It is best suited to organizations that want a no-code XR platform for training or onboarding and still need room for enterprise customization, analytics, or SDK-based integration.",
    useCases: [
      "Create XR onboarding and learning experiences without a code-first build process.",
      "Run training simulations with collaborative spaces, voice, text, and screenshare support.",
      "Extend immersive experiences with SDK and API access for deeper integration.",
      "Scale from a professional plan into enterprise deployments with advanced controls.",
    ],
    featureGroups: [
      {
        heading: "Creation and collaboration",
        items: [
          "Unlimited spaces, scenes, elements, and customizability on all plans",
          "Voice, text, screenshare, notifications, and collaborative metaverse spaces",
          "Full editor access with integrations such as SketchFab, Flickr, and custom assets",
        ],
      },
      {
        heading: "Platform and access",
        items: [
          "GMetri SDK with APIs for deeper integration",
          "Google and Microsoft authenticated links plus SAML support in the official FAQ",
          "Enterprise options for advanced analytics, geo analytics, and custom domain support",
        ],
      },
      {
        heading: "Commercial structure",
        items: [
          "Professional plan available in annual and monthly billing",
          "Enterprise custom pricing",
          "Education and nonprofit free or discounted tiers mentioned in the official FAQ",
        ],
      },
    ],
    pricingSummary:
      "GMetriXR lists Professional at $44 per month on annual billing or $49 per month on monthly billing, plus Enterprise custom pricing.",
    pricingLines: [
      "Professional annual: $44 per month.",
      "Professional monthly: $49 per month.",
      "Enterprise: custom pricing with advanced analytics, custom domain, security compliance, and dedicated support channel.",
      "Education and nonprofit organizations may qualify for special free or discounted tiers.",
    ],
    price: 44,
    pros: [
      "Public paid pricing is clearly available",
      "Strong training-simulation and onboarding fit",
      "No-code workflow reduces production barriers",
      "Enterprise extension path is documented",
    ],
    cons: [
      "Higher-end analytics and branding controls are reserved for enterprise buyers",
      "Organizations should confirm concurrency and volume needs before choosing a plan",
      "Some advanced access patterns depend on enterprise setup",
    ],
    seoTitle: "GMetriXR AR Training Simulations No-Code XR Platform",
    seoDescription:
      "GMetriXR is a no-code XR platform for training simulations, onboarding, and immersive learning with Professional and Enterprise plans.",
    filters: {
      pricing_model: ["Subscription", "Custom quote"],
      price_band: ["$10-$50/month"],
      deployment_model: ["Cloud / SaaS", "API-first"],
      customization_level: ["Template-based", "API / workflow customization", "Enterprise services"],
      integrations: ["API / webhooks", "Google / Microsoft"],
      security_compliance: ["SSO / RBAC"],
      support_coverage: ["Documentation only", "Dedicated manager"],
    },
    verificationNotes:
      "Official GMetriXR pricing page and FAQ reviewed on 2026-06-11. Professional pricing, enterprise packaging, API/SDK support, and authenticated access options were verified from the official source. Logo upload remains pending until the upsert script runs.",
    confidence: "high",
  },
  {
    title: "Crystal",
    vendor: "Crystal",
    handle: "crystal",
    categories: [BEHAVIOR],
    customUrl: "https://www.crystalknows.com/",
    sourceUrl: "https://www.crystalknows.com/pricing",
    sourceUrls: ["https://www.crystalknows.com/", "https://www.crystalknows.com/pricing"],
    logoSourceUrl: "https://www.crystalknows.com/",
    sourceLabel: "Official Crystal homepage and pricing page",
    summary: "personality-based communication and relationship insights for work across team, sales, hiring, and AI-integrated use cases",
    audience: "It is relevant for professionals and teams that want behavioral context to improve communication, recruiting, or sales conversations without turning the experience into a heavy assessment-only workflow.",
    bestFor:
      "It is best suited to organizations that want workplace personality insights presented as an everyday operating layer for communication, relationship building, and people understanding.",
    useCases: [
      "Use personality insights to tailor work communication and collaboration.",
      "Support hiring and recruiting workflows with behavior-oriented context.",
      "Give sales teams personality-based guidance for relationship building.",
      "Extend personality understanding into AI-assisted workplace tools and workflows.",
    ],
    featureGroups: [
      {
        heading: "Behavioral insight focus",
        items: [
          "Personality platform for work",
          "DISC, Big Five, Enneagram, and related personality content on the official site",
          "Positioning around stronger relationships and better communication",
        ],
      },
      {
        heading: "Business use cases",
        items: [
          "Dedicated product positioning for Teams, Sales, Hiring, and Personality AI",
          "Free assessment and free-start calls to action on the official site",
          "Support resources and FAQ documentation linked from the official site",
        ],
      },
      {
        heading: "Commercial structure",
        items: [
          "Official pricing page is available",
          "Public page indicates free trial availability",
          "A public numeric base price was not safely confirmed from the official source reviewed for this dataset",
        ],
      },
    ],
    pricingSummary:
      "Crystal's official pricing page states that pricing is available for Teams, Hiring, and Sales and that buyers can start with a free trial, but a public numeric starting price was not safely confirmed from the reviewed official source.",
    pricingLines: [
      "The official pricing page presents a free-trial-led upgrade path.",
      "Commercial packaging is framed around Teams, Hiring, and Sales use cases.",
      "Buyers should confirm current plan pricing directly on the live vendor page before purchase.",
    ],
    price: 0,
    pros: [
      "Strong behavioral-analysis and workplace personality fit",
      "Official site clearly positions the product across communication, hiring, and sales",
      "Accessible product framing for both individuals and teams",
    ],
    cons: [
      "Public numeric starting price was not safely verified from the reviewed source",
      "Exact plan economics need confirmation on the live vendor page",
      "Buyers should validate which product line best matches their use case",
    ],
    seoTitle: "Crystal Behavioral Analysis AI Personality Platform",
    seoDescription:
      "Crystal helps teams understand personality, improve communication, and apply behavioral insights across sales, hiring, and workplace collaboration.",
    filters: {
      pricing_model: ["Subscription"],
      free_trial: ["Custom trial or demo"],
      deployment_model: ["Cloud / SaaS"],
      customization_level: ["Out of the box"],
      support_coverage: ["Documentation only"],
    },
    verificationNotes:
      "Official Crystal homepage and pricing page reviewed on 2026-06-11. Behavioral-analysis fit and free-trial messaging were verified from the official source, but a public numeric starting price was not safely confirmed from the reviewed page capture. Logo upload remains pending until the upsert script runs.",
    confidence: "medium",
  },
  {
    title: "Humantic AI",
    vendor: "Humantic AI",
    handle: "humantic-ai",
    categories: [BEHAVIOR],
    customUrl: "https://humantic.ai/",
    sourceUrl: "https://humantic.ai/start/pricing",
    sourceUrls: ["https://humantic.ai/", "https://humantic.ai/start/pricing"],
    logoSourceUrl: "https://humantic.ai/",
    sourceLabel: "Official Humantic AI product and pricing pages",
    summary: "personality prediction and behavioral intelligence for sales, recruiting, and product integrations, including browser-based workflows and API-led extension",
    audience: "It fits revenue, recruiting, and platform teams that want personality signals embedded inside daily workflows rather than isolated in a standalone assessment experience.",
    bestFor:
      "It is best suited to teams that want behavioral prediction applied directly to outreach, recruiting, or product integrations and value both browser-based assistance and API-led extension paths.",
    useCases: [
      "Predict communication and decision styles for prospecting and relationship building.",
      "Support recruiting or candidate evaluation workflows with personality insight.",
      "Embed personality signals into existing systems through the Personality AI API.",
      "Use native CRM and productivity workflow support for sales execution.",
    ],
    featureGroups: [
      {
        heading: "Behavior and personality intelligence",
        items: [
          "Personality AI Assistant focused on communication, decision, and engagement prediction",
          "Behavioral insight workflows for sales and recruiting",
          "Organization and Individual pricing tabs on the official pricing page",
        ],
      },
      {
        heading: "Integrations and deployment",
        items: [
          "Official references to LinkedIn, Gmail, Google Calendar, Outlook, Salesforce, Outreach, Salesloft, and HubSpot integrations",
          "Personality AI API for product integrations",
          "Enterprise deployment notes covering CRM integration, SSO, role mapping, customization, and onboarding",
        ],
      },
      {
        heading: "Commercial structure",
        items: [
          "Annual and monthly billing toggles appear on the official pricing page",
          "Pro plan is marked as annual-only in the official page copy",
          "Public numeric prices were not safely confirmed from the reviewed official source",
        ],
      },
    ],
    pricingSummary:
      "Humantic AI's official pricing page clearly presents Organization and Individual plan structures with annual and monthly billing toggles, but the numeric public plan amounts were not safely exposed in the reviewed official source capture.",
    pricingLines: [
      "Organization and Individual pricing structures are shown on the official pricing page.",
      "Annual and monthly billing toggles are visible, and some plans are marked with annual-only availability.",
      "Buyers should confirm current numeric pricing directly on the live vendor page before purchase.",
    ],
    price: 0,
    pros: [
      "Clear behavioral-analysis and personality-AI positioning",
      "Strong workflow integration story for sales and recruiting teams",
      "API option supports product-level extension",
      "Official site documents onboarding and enterprise customization paths",
    ],
    cons: [
      "Public numeric starting price was not safely verified from the reviewed source",
      "Commercial details appear to depend on live client-side rendering or direct engagement",
      "Buyers should verify which plan includes the integrations they need",
    ],
    seoTitle: "Humantic AI Behavioral Analysis AI Personality Intelligence",
    seoDescription:
      "Humantic AI delivers personality prediction and behavioral intelligence for sales, recruiting, and product integrations with API and workflow support.",
    filters: {
      pricing_model: ["Subscription", "Custom quote"],
      deployment_model: ["Cloud / SaaS", "API-first"],
      customization_level: ["API / workflow customization", "Enterprise services"],
      integrations: ["API / webhooks", "Google / Microsoft"],
      security_compliance: ["GDPR", "SSO / RBAC"],
      support_coverage: ["Migration / onboarding help"],
    },
    verificationNotes:
      "Official Humantic AI product and pricing pages reviewed on 2026-06-11. Product fit, integrations, API availability, and enterprise onboarding details were verified from the official source, but public numeric pricing was not safely confirmed from the reviewed page capture. Logo upload remains pending until the upsert script runs.",
    confidence: "medium",
  },
];

const rows = specs.map(rowFromSpec);
const outputJson = path.join(EXPORTS_DIR, `ai-tools-ar-behavior-preview-${DATE_STAMP}.json`);
const outputCsv = path.join(EXPORTS_DIR, `ai-tools-ar-behavior-preview-${DATE_STAMP}.csv`);

fs.mkdirSync(EXPORTS_DIR, { recursive: true });
fs.writeFileSync(outputJson, `${JSON.stringify(rows, null, 2)}\n`, "utf8");

const csvHeaders = [
  "title",
  "handle",
  "vendor",
  "price",
  "sourceUrl",
  "collectionHandles",
  "collectionTitles",
  "confidence",
  "verificationNotes",
];

const csvLines = [
  csvHeaders.join(","),
  ...rows.map((row) =>
    [
      row.title,
      row.handle,
      row.vendor,
      row.price,
      row.sourceUrl,
      row.collectionHandles.join("|"),
      row.collectionTitles.join("|"),
      row.confidence,
      row.verificationNotes,
    ]
      .map(csvEscape)
      .join(",")
  ),
];

fs.writeFileSync(outputCsv, `${csvLines.join("\n")}\n`, "utf8");

console.log(`Wrote ${rows.length} products to ${outputJson}`);
console.log(`Wrote CSV summary to ${outputCsv}`);
