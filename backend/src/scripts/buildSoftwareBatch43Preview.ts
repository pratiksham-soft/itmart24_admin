import * as fs from "fs";
import * as path from "path";

const EXPORTS_DIR = path.resolve(__dirname, "../../exports");
const DATE_STAMP = "2026-06-11";
const PRICING_FALLBACK = 'To visit product official website click "Get Now"';
const PRICING_DISCLAIMER =
  "Pricing, taxes, plan availability, AI credits, storage limits, and included features may vary by country, billing cycle, user type, and the provider's latest policy. Please verify current details on the official website before purchasing.";

type Confidence = "high" | "medium" | "low";
type FilterValues = Record<string, string[]>;

type CategoryRef = {
  handle: string;
  title: string;
};

type PricingMode = "free_only" | "public_paid" | "price_unavailable";

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
  tagline: string;
  audience: string;
  intro: string;
  bestFor: string;
  useCases: string[];
  featureGroups: Array<{
    heading: string;
    items: string[];
  }>;
  pricingMode: PricingMode;
  startingPrice: number;
  pricingHeading: string;
  pricingLines: string[];
  pros: string[];
  cons: string[];
  seoTitle: string;
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

const dedupe = <T>(values: T[]) => Array.from(new Set(values));

const wordCount = (value: string) =>
  value
    .replace(/<[^>]+>/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

const csvEscape = (value: unknown) => {
  const stringValue =
    typeof value === "string"
      ? value
      : value === null || value === undefined
        ? ""
        : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
};

const toPriceString = (value: number) => String(value);

const buildBodyHtml = (spec: Spec) => {
  const categoryNames = spec.categories.map((category) => category.title).join(" and ");
  const allFeatures = spec.featureGroups.flatMap((group) => group.items);

  return [
    `<p>${spec.title} helps ${spec.audience} create ${spec.intro}. It is a practical fit for buyers who want ${spec.tagline} without moving straight into a more complex specialist workflow. That makes it relevant for teams comparing ${categoryNames.toLowerCase()} and trying to balance speed, ease of use, brand consistency, and room to grow.</p>`,
    `<p>${spec.bestFor} In day-to-day work, that can mean turning campaign ideas into publishable visuals, preparing sales or teaching materials, refreshing branded assets, or producing content that needs to look polished without a long production cycle. The overall experience is aimed at people who value a clear workflow, accessible editing, and a design environment that can support repeatable content creation across multiple channels.</p>`,
    `<h2>Common use cases</h2>`,
    `<ul>${spec.useCases.map((item) => `<li>${item}</li>`).join("")}</ul>`,
    `<h2>Key capabilities</h2>`,
    ...spec.featureGroups.map(
      (group) =>
        `<h3>${group.heading}</h3><ul>${group.items
          .map((item) => `<li>${item}</li>`)
          .join("")}</ul>`
    ),
    `<p>Buyers usually consider ${spec.title} when they need strengths such as ${allFeatures
      .slice(0, 5)
      .join(", ")}. Those details matter because software in this space is rarely chosen on feature count alone. What tends to matter more is how quickly a team can get from idea to finished output, whether collaboration feels manageable, and whether paid plans unlock the tools that a growing workflow will eventually need.</p>`,
    `<h2>Pricing and buying notes</h2>`,
    `<p>${spec.pricingHeading} ${spec.pricingLines.join(" ")} ${PRICING_DISCLAIMER}</p>`,
    `<h2>What to consider before choosing</h2>`,
    `<p>${spec.title} stands out for ${spec.pros.slice(0, 3).join(", ")}. At the same time, buyers should weigh factors such as ${spec.cons.join(", ")}. That balance is especially important when comparing template-driven tools against more advanced creative suites, or when deciding whether a free tier is enough for ongoing business use. For the right audience, ${spec.title} can be a strong match, but it is still worth checking plan terms, export options, collaboration depth, and any AI usage limits before making a final decision.</p>`,
  ].join("");
};

const buildProductFeatures = (spec: Spec) =>
  spec.featureGroups
    .map((group) => [group.heading, ...group.items.map((item) => `- ${item}`)].join("\n"))
    .join("\n\n");

const buildPlansPricing = (spec: Spec) => {
  if (spec.pricingMode === "price_unavailable") {
    return PRICING_FALLBACK;
  }

  return [spec.pricingHeading, ...spec.pricingLines.map((line) => `- ${line}`), "", PRICING_DISCLAIMER].join(
    "\n"
  );
};

const buildProsCons = (spec: Spec) =>
  ["Pros", ...spec.pros.map((item) => `- ${item}`), "", "Cons", ...spec.cons.map((item) => `- ${item}`)].join(
    "\n"
  );

const buildVerificationNotes = (spec: Spec) =>
  [
    `Official ${spec.title} product pages were reviewed on ${DATE_STAMP}.`,
    spec.pricingMode === "price_unavailable"
      ? "A public paid base price was not safely confirmed, so the listing keeps the fallback pricing note."
      : `The numeric product price uses the current public paid starting point selected for this listing: ${spec.startingPrice}.`,
    "Logo upload remains pending until the upsert script runs.",
  ].join(" ");

const rowFromSpec = (spec: Spec): PreviewRow => {
  const bodyHtml = buildBodyHtml(spec);
  if (wordCount(bodyHtml) < 300) {
    throw new Error(`Description below 300 words for ${spec.handle}`);
  }

  const collectionHandles = dedupe(spec.categories.map((category) => category.handle));
  const collectionTitles = dedupe(spec.categories.map((category) => category.title));

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
    verificationNotes: buildVerificationNotes(spec),
    confidence: spec.confidence,
    missingFields: ["custom.logo_image"],
  };
};

const GD: CategoryRef = { handle: "graphic-design-software", title: "Graphic Design Software" };
const PE: CategoryRef = { handle: "photo-editing-software", title: "Photo Editing Software" };
const VG: CategoryRef = { handle: "vector-graphics-software", title: "Vector Graphics Software" };
const PR: CategoryRef = { handle: "presentation-software", title: "Presentation Software" };
const UX: CategoryRef = { handle: "ux-software", title: "UX Software" };
const BM: CategoryRef = { handle: "brand-management-tool", title: "Brand Management Tool" };
const AI: CategoryRef = { handle: "generative-ai-tools", title: "Generative AI Tools" };

const specs: Spec[] = [
  {
    title: "Adobe Express",
    vendor: "Adobe",
    handle: "adobe-express",
    categories: [GD, AI],
    customUrl: "https://www.adobe.com/express/",
    sourceUrl: "https://www.adobe.com/express/pricing",
    sourceUrls: ["https://www.adobe.com/express/", "https://www.adobe.com/express/pricing"],
    logoSourceUrl: "https://www.adobe.com/express/",
    sourceLabel: "Official Adobe Express product and pricing pages",
    tagline: "an online Adobe-backed design app for everyday marketing, social, and brand content",
    audience: "creators, students, marketers, and small businesses",
    intro: "social posts, flyers, reels, banners, resumes, logos, and branded visuals from a browser or mobile workflow",
    bestFor:
      "It is best suited to people who want fast content production, useful templates, and AI-assisted design features while still staying close to the wider Adobe ecosystem.",
    useCases: [
      "Create social posts, stories, and short promotional videos for everyday publishing.",
      "Build flyers, posters, resumes, banners, and quick brand assets without full desktop software.",
      "Resize and refresh campaign visuals for multiple channels from one project.",
      "Produce simple branded content for classrooms, creators, local businesses, and marketing teams.",
    ],
    featureGroups: [
      { heading: "Core design workflow", items: ["Online and mobile editor", "Templates for social posts, flyers, logos, videos, resumes, and marketing assets", "Quick video and social content creation"] },
      { heading: "AI and productivity", items: ["Adobe Firefly-powered generative AI features", "Text effects and AI image generation where available", "Background removal and resize tools on eligible plans"] },
      { heading: "Brand and asset support", items: ["Brand assets and template workflows", "Creative assets where included", "Integration with the Adobe ecosystem"] },
    ],
    pricingMode: "price_unavailable",
    startingPrice: 0,
    pricingHeading: "Free plan available.",
    pricingLines: [
      "Paid Adobe Express and Adobe Firefly-related plans vary by country and billing setup.",
      "A public USD base price was not safely confirmed for this listing.",
    ],
    pros: ["Strong Adobe ecosystem connection", "Useful AI-assisted design features", "Good fit for quick social and marketing visuals", "Beginner-friendlier than full professional Adobe apps"],
    cons: ["Premium features require paid plans", "AI credits and included tools vary by plan", "Not a full replacement for Photoshop, Illustrator, or Premiere Pro for advanced production", "Pricing can vary by country and billing option"],
    seoTitle: "Adobe Express Adobe AI Graphic Design Tool",
    seoDescription: "Adobe Express helps creators and small teams make social graphics, videos, flyers, and branded content with templates and AI tools.",
    filters: { software_type: ["Design & content"], target_segment: ["Individuals", "Small business", "Education / public sector"], primary_use_case: ["Content creation"], pricing_model: ["Free", "Subscription"], deployment_model: ["Cloud / SaaS"], collaboration_mode: ["Single-user", "Team sharing"], support_coverage: ["Documentation only", "Business hours support"] },
    confidence: "medium",
  },
  {
    title: "VistaCreate",
    vendor: "VistaCreate / Vista",
    handle: "vistacreate",
    categories: [GD],
    customUrl: "https://create.vista.com/",
    sourceUrl: "https://support.create.vista.com/hc/en-us/articles/6347917526940-VistaCreate-Plans",
    sourceUrls: ["https://create.vista.com/", "https://create.vista.com/features/", "https://support.create.vista.com/hc/en-us/articles/6347917526940-VistaCreate-Plans"],
    logoSourceUrl: "https://create.vista.com/",
    sourceLabel: "Official VistaCreate product, features, and plans pages",
    tagline: "a template-first design tool for fast social and marketing creative work",
    audience: "non-designers, creators, entrepreneurs, and small marketing teams",
    intro: "social posts, ads, posters, banners, flyers, covers, and simple branded visuals with a quick template-led workflow",
    bestFor:
      "It is especially useful when speed matters more than advanced illustration depth and when a small team wants a familiar browser-based editing experience.",
    useCases: [
      "Design social media graphics and ad visuals for daily publishing.",
      "Create posters, banners, flyers, and covers from editable templates.",
      "Refresh branded content with resize, background editing, and simple asset workflows.",
      "Give small teams a lightweight design space without a steep learning curve.",
    ],
    featureGroups: [
      { heading: "Templates and formats", items: ["100K+ free templates", "85+ design formats for social, ads, marketing, and business content", "Premium creative assets on Pro"] },
      { heading: "Editing tools", items: ["AI image generator", "Background remover", "Object eraser", "Resize tools"] },
      { heading: "Team and brand support", items: ["Brand-support workflows where available", "Team features on Pro", "14-day Pro trial where available"] },
    ],
    pricingMode: "public_paid",
    startingPrice: 10,
    pricingHeading: "Free plan available.",
    pricingLines: ["Pro starts at $10/month on the official support article.", "Up to 10 team seats are supported on Pro where available.", "A 14-day Pro trial may be available."],
    pros: ["Large template library", "Simple Canva-style workflow", "Good for quick social and marketing visuals", "AI and background editing tools are available"],
    cons: ["Advanced brand and team tools require Pro", "Less suitable for professional vector or detailed photo work", "Plan limits can change", "Asset availability varies by plan"],
    seoTitle: "VistaCreate Vista Social Media Graphic Design Tool",
    seoDescription: "VistaCreate helps creators and small teams design social posts, ads, flyers, and banners with templates, AI tools, and simple editing.",
    filters: { software_type: ["Design & content"], target_segment: ["Individuals", "Small business", "Agencies"], primary_use_case: ["Content creation"], pricing_model: ["Free", "Subscription"], deployment_model: ["Cloud / SaaS"], collaboration_mode: ["Single-user", "Team sharing"], support_coverage: ["Documentation only", "Business hours support"] },
    confidence: "high",
  },
  {
    title: "Visme",
    vendor: "Visme",
    handle: "visme",
    categories: [PR, GD],
    customUrl: "https://www.visme.co/",
    sourceUrl: "https://www.visme.co/pricing/",
    sourceUrls: ["https://www.visme.co/", "https://www.visme.co/pricing/"],
    logoSourceUrl: "https://www.visme.co/",
    sourceLabel: "Official Visme product and pricing pages",
    tagline: "a visual communication platform for structured business content, presentations, and data-led storytelling",
    audience: "business teams, educators, marketers, sales teams, and trainers",
    intro: "presentations, infographics, reports, documents, charts, forms, and branded communication assets",
    bestFor:
      "It works best for teams that need something more presentation- and document-oriented than a simple social graphic editor.",
    useCases: [
      "Build presentations for sales, internal updates, and training.",
      "Turn reports, statistics, and business data into cleaner visual communication.",
      "Create infographics, forms, and branded documents for campaigns or education.",
      "Support team-ready content workflows with stronger structure and brand control.",
    ],
    featureGroups: [
      { heading: "Presentation and document tools", items: ["Presentation maker", "Infographic maker", "Report and document design", "Data visualization and charts"] },
      { heading: "Brand and interactive content", items: ["Brand asset management", "Templates for business and marketing content", "Interactive content creation", "Videos and animated visual content"] },
      { heading: "Team support", items: ["Team collaboration on paid plans", "Business and enterprise plan options"] },
    ],
    pricingMode: "public_paid",
    startingPrice: 12.25,
    pricingHeading: "Free plan available.",
    pricingLines: ["Starter is listed at US $12.25/month per person when billed annually.", "Pro is listed at US $24.75/month per person when billed annually.", "Enterprise pricing is available for larger organizations."],
    pros: ["Strong for presentations, reports, and infographics", "Good fit for business communication teams", "More data- and document-oriented than many simple design apps", "Free plan available"],
    cons: ["Advanced features require paid plans", "May feel heavier than quick social design tools", "Exact limits should still be verified before purchase", "Advanced team and brand controls can require higher plans"],
    seoTitle: "Visme Visme Visual Communication Software",
    seoDescription: "Visme helps teams create presentations, reports, infographics, charts, and branded documents with collaboration and business-ready templates.",
    filters: { software_type: ["Design & content"], target_segment: ["Individuals", "Small business", "Mid-market", "Education / public sector"], primary_use_case: ["Content creation"], pricing_model: ["Free", "Subscription", "Custom quote"], deployment_model: ["Cloud / SaaS"], collaboration_mode: ["Single-user", "Team sharing"], support_coverage: ["Business hours support", "24/7 support"] },
    confidence: "high",
  },
  {
    title: "Piktochart",
    vendor: "Piktochart",
    handle: "piktochart",
    categories: [PR, GD],
    customUrl: "https://piktochart.com/",
    sourceUrl: "https://piktochart.com/pricing/",
    sourceUrls: ["https://piktochart.com/", "https://piktochart.com/pricing/", "https://piktochart.com/pro/", "https://piktochart.com/enterprise/"],
    logoSourceUrl: "https://piktochart.com/",
    sourceLabel: "Official Piktochart product and pricing pages",
    tagline: "an information design tool for turning data, reports, and messages into visual stories",
    audience: "educators, marketers, analysts, nonprofit teams, and business communicators",
    intro: "infographics, presentations, reports, posters, and visual documents that need clarity more than decorative complexity",
    bestFor:
      "It is a strong fit for buyers who regularly translate information-heavy content into something easier to present, publish, or share internally.",
    useCases: [
      "Create infographics from research, reports, or campaign data.",
      "Prepare presentations and visual summaries for meetings or classrooms.",
      "Design posters, social graphics, and visual documents with lighter production effort.",
      "Support branded team workspaces with stronger presentation and communication assets.",
    ],
    featureGroups: [
      { heading: "Visual communication tools", items: ["Infographic maker", "AI infographic generator", "Presentation maker", "Report design"] },
      { heading: "Design and branding", items: ["Poster and social graphic templates", "Brand customization", "Team workspace support"] },
      { heading: "Security and enterprise options", items: ["Video workflows where available", "2FA and password protection on paid plans where available", "SAML-based SSO on enterprise plan"] },
    ],
    pricingMode: "public_paid",
    startingPrice: 10,
    pricingHeading: "Free plan available.",
    pricingLines: ["Pro starts at $10 per member/month when billed annually.", "$15 per member/month is listed for monthly billing.", "Enterprise plans are available through sales."],
    pros: ["Strong for infographics, reports, and information design", "AI tools help start drafts quickly", "Useful for educators and business teams", "Enterprise security options exist on higher plans"],
    cons: ["Paid plans are needed for Pro and enterprise features", "Best fit is information-rich content rather than deep photo or vector editing", "Pricing is per member on paid tiers", "Enterprise pricing needs confirmation with sales"],
    seoTitle: "Piktochart Piktochart Infographic Maker Software",
    seoDescription: "Piktochart helps teams create infographics, reports, presentations, and posters with AI-assisted starting points and team-ready branding tools.",
    filters: { software_type: ["Design & content"], target_segment: ["Individuals", "Small business", "Mid-market", "Education / public sector"], primary_use_case: ["Content creation"], pricing_model: ["Free", "Subscription", "Custom quote"], deployment_model: ["Cloud / SaaS"], collaboration_mode: ["Single-user", "Team sharing", "Roles & permissions"], support_coverage: ["Business hours support"] },
    confidence: "high",
  },
  {
    title: "Figma",
    vendor: "Figma",
    handle: "figma",
    categories: [GD, AI],
    customUrl: "https://www.figma.com/",
    sourceUrl: "https://www.figma.com/pricing/",
    sourceUrls: ["https://www.figma.com/", "https://www.figma.com/pricing/", "https://www.figma.com/professional/"],
    logoSourceUrl: "https://www.figma.com/",
    sourceLabel: "Official Figma product and pricing pages",
    tagline: "a collaborative product design workspace for UI, UX, prototyping, and design systems",
    audience: "designers, product teams, developers, startups, agencies, and enterprise organizations",
    intro: "interface designs, app mockups, website layouts, prototypes, shared libraries, and developer handoff workflows",
    bestFor:
      "It is especially useful when multiple designers, product managers, and developers need to work from the same source of truth and keep iteration moving in real time.",
    useCases: [
      "Design website and product interfaces in a shared browser-first workspace.",
      "Build prototypes, reusable components, and design systems for growing teams.",
      "Support developer handoff with inspect, libraries, and implementation-ready context.",
      "Manage more advanced organization and enterprise workflows as teams scale.",
    ],
    featureGroups: [
      { heading: "Design workflow", items: ["Browser-based design editor", "UI and UX design tools", "Components", "Auto layout", "Advanced drawing tools"] },
      { heading: "Prototyping and systems", items: ["Prototyping", "Advanced prototyping with variables and logic on paid plans", "Team libraries", "Shared libraries and fonts on organization plans"] },
      { heading: "Admin and developer support", items: ["Centralized admin tools on higher plans", "SCIM seat management on enterprise", "REST API and Dev Mode support where available", "AI credits add-on available"] },
    ],
    pricingMode: "public_paid",
    startingPrice: 16,
    pricingHeading: "Free Starter plan available.",
    pricingLines: ["Professional full seat pricing is listed at $16/month.", "Organization starts at $55/month for a full seat on annual billing.", "Enterprise full seat pricing is listed at $90/month, with additional seat types available."],
    pros: ["Excellent for collaborative UI and UX work", "Strong design system and component workflows", "Real-time browser-based collaboration", "Useful for designers and developers together"],
    cons: ["Not meant for template-first social design work", "Higher-level admin and security tools require advanced plans", "Teams still need design workflow knowledge to get full value", "AI credits may need paid add-ons"],
    seoTitle: "Figma Figma UI UX Design Tool",
    seoDescription: "Figma supports UI and UX design, prototyping, components, and developer handoff with real-time collaboration for product teams.",
    filters: { software_type: ["Design & content", "Developer tools"], target_segment: ["Small business", "Mid-market", "Enterprise", "Agencies", "Developers"], primary_use_case: ["Content creation", "Developer workflow"], pricing_model: ["Free", "Subscription"], deployment_model: ["Cloud / SaaS"], collaboration_mode: ["Real-time collaboration", "Roles & permissions"], developer_features: ["API access", "OAuth / SSO"], support_coverage: ["Documentation only", "Business hours support", "Priority support"] },
    confidence: "high",
  },
  {
    title: "Microsoft Designer",
    vendor: "Microsoft",
    handle: "microsoft-designer",
    categories: [GD, AI],
    customUrl: "https://designer.microsoft.com/",
    sourceUrl: "https://support.microsoft.com/en-us/designer/frequently-asked-questions-about-microsoft-designer",
    sourceUrls: ["https://designer.microsoft.com/", "https://www.microsoft.com/en-us/microsoft-365/microsoft-designer", "https://support.microsoft.com/en-us/designer/frequently-asked-questions-about-microsoft-designer"],
    logoSourceUrl: "https://designer.microsoft.com/",
    sourceLabel: "Official Microsoft Designer and support pages",
    tagline: "an AI-powered design app for everyday graphics, invitations, and quick visual content",
    audience: "everyday users, creators, students, and small businesses with Microsoft accounts",
    intro: "social posts, invitations, postcards, banners, and digital graphics with AI-assisted generation and editing",
    bestFor:
      "It is a sensible option for people who already spend time in Microsoft services and want design help without learning a full creative suite.",
    useCases: [
      "Create quick social graphics, invitations, and digital cards.",
      "Generate and refine visual ideas with AI prompts and built-in editing.",
      "Use connected Microsoft account and Microsoft 365 benefits where supported.",
      "Support simple creative tasks across personal, school, or small business projects.",
    ],
    featureGroups: [
      { heading: "Creative workflow", items: ["AI-powered design creation", "Social media posts", "Invitations", "Digital postcards", "Banners and graphics"] },
      { heading: "Editing and access", items: ["Image and design editing", "Microsoft account access", "Microsoft 365 integration benefits where available"] },
      { heading: "Usage considerations", items: ["More credits available with eligible Microsoft 365 plans where available", "Designer access through Copilot in Microsoft apps where supported"] },
    ],
    pricingMode: "price_unavailable",
    startingPrice: 0,
    pricingHeading: "Free to use with a Microsoft account.",
    pricingLines: ["Some heavier usage may depend on a Microsoft 365 subscription.", "A standalone public paid price was not clearly defined on the reviewed pages."],
    pros: ["Free entry with a Microsoft account", "AI-assisted design workflow", "Useful for quick personal and social graphics", "Connects with Microsoft 365 and Copilot experiences where supported"],
    cons: ["Premium usage may depend on Microsoft 365", "AI credits and access vary by account and plan", "Less advanced than professional design tools", "Feature availability can vary by region and account type"],
    seoTitle: "Microsoft Designer Microsoft AI Design App",
    seoDescription: "Microsoft Designer helps users create social graphics, invitations, and digital content with AI-assisted generation and Microsoft account access.",
    filters: { software_type: ["Design & content"], target_segment: ["Individuals", "Small business", "Education / public sector"], primary_use_case: ["Content creation"], pricing_model: ["Free", "Subscription"], deployment_model: ["Cloud / SaaS"], collaboration_mode: ["Single-user"], integrations: ["Google / Microsoft"], support_coverage: ["Documentation only", "Business hours support"] },
    confidence: "medium",
  },
  {
    title: "Snappa",
    vendor: "Snappa",
    handle: "snappa",
    categories: [GD],
    customUrl: "https://snappa.com/",
    sourceUrl: "https://snappa.com/pricing",
    sourceUrls: ["https://snappa.com/", "https://snappa.com/pricing"],
    logoSourceUrl: "https://snappa.com/",
    sourceLabel: "Official Snappa product and pricing pages",
    tagline: "a quick graphic design tool built around speed, templates, and stock assets",
    audience: "bloggers, social media managers, marketers, and non-designers",
    intro: "social graphics, blog images, ads, headers, and lightweight web visuals without a heavy design workflow",
    bestFor:
      "It makes the most sense for people who want straightforward image creation and care more about speed than advanced editing depth.",
    useCases: [
      "Produce social images and blog graphics on a tight schedule.",
      "Create ad visuals, headers, and simple branded creative for online campaigns.",
      "Use stock photos, presets, and lightweight editing to shorten production time.",
      "Give non-designers a faster path to everyday content creation.",
    ],
    featureGroups: [
      { heading: "Content creation", items: ["Pre-made templates", "Social media graphics", "Blog images", "Ads and online visuals"] },
      { heading: "Assets and editing", items: ["Free stock photos and graphics", "Royalty-free commercial-use assets", "Simple image editor", "Text, graphics, and effects"] },
      { heading: "Plan-level tools", items: ["Background removal where available", "Resizing features where available", "Free plan available"] },
    ],
    pricingMode: "price_unavailable",
    startingPrice: 0,
    pricingHeading: "Free Starter plan available.",
    pricingLines: ["Paid Pro and Team plans are available.", "A current official paid base price was not safely confirmed from the reviewed pricing page."],
    pros: ["Easy for non-designers", "Fast social and blog image creation", "Royalty-free photos and graphics are included", "Lighter workflow than complex design suites"],
    cons: ["Less suitable for advanced illustration or photo work", "Paid plan is needed for higher usage and premium features", "Smaller ecosystem than larger design platforms", "Official pricing should be rechecked before purchase"],
    seoTitle: "Snappa Snappa Quick Graphic Design Software",
    seoDescription: "Snappa helps non-designers create social graphics, blog images, ads, and quick marketing visuals with templates and stock assets.",
    filters: { software_type: ["Design & content"], target_segment: ["Individuals", "Small business", "Agencies"], primary_use_case: ["Content creation"], pricing_model: ["Free", "Subscription"], deployment_model: ["Cloud / SaaS"], collaboration_mode: ["Single-user", "Team sharing"], support_coverage: ["Documentation only", "Business hours support"] },
    confidence: "medium",
  },
  {
    title: "Pixlr",
    vendor: "Pixlr",
    handle: "pixlr",
    categories: [PE, AI],
    customUrl: "https://pixlr.com/",
    sourceUrl: "https://pixlr.com/pricing/",
    sourceUrls: ["https://pixlr.com/", "https://pixlr.com/pricing/", "https://pixlr.com/tools/pixlr-e/"],
    logoSourceUrl: "https://pixlr.com/",
    sourceLabel: "Official Pixlr product and pricing pages",
    tagline: "a browser-based photo editor with AI generation and quick creative editing tools",
    audience: "creators, marketers, students, and small businesses",
    intro: "image edits, social visuals, background changes, AI image generation, and quick design tasks without desktop installation",
    bestFor:
      "It is particularly useful for people who want flexible browser editing, AI-assisted image work, and lighter setup than traditional desktop photo software.",
    useCases: [
      "Edit photos and marketing images directly in a browser.",
      "Generate AI imagery and apply AI-powered cleanup or enhancement tools.",
      "Create quick social graphics with templates and creative assets.",
      "Handle routine image work without maintaining a full desktop editing stack.",
    ],
    featureGroups: [
      { heading: "Editors and design tools", items: ["Pixlr X and Pixlr E editing tools", "Online photo editor", "Templates and creative assets"] },
      { heading: "AI features", items: ["AI image generation", "AI-powered editing tools", "Background and object editing where available"] },
      { heading: "Advanced plan features", items: ["Image, video, and audio AI models on higher plans where available", "High-resolution export options on higher plans", "Free version available"] },
    ],
    pricingMode: "public_paid",
    startingPrice: 2.49,
    pricingHeading: "Free version available.",
    pricingLines: ["Plus is listed at €2.49 per month on the reviewed pricing page.", "Premium is listed at €9.99 per month, with lower annualized pricing shown on yearly billing.", "Ultra is listed from €24.99 per month."],
    pros: ["Browser-based photo editing", "Free version available", "Useful AI-powered image tools", "No heavy setup for basic work"],
    cons: ["Ad-free and advanced AI features require paid plans", "AI credits and generation limits vary by plan", "Professional users may still prefer desktop-grade editors", "Pricing may vary by region and currency"],
    seoTitle: "Pixlr Pixlr Online Photo Editor",
    seoDescription: "Pixlr offers browser-based photo editing, AI image tools, templates, and quick creative workflows for creators and small teams.",
    filters: { software_type: ["Design & content"], target_segment: ["Individuals", "Small business", "Education / public sector"], primary_use_case: ["Content creation"], pricing_model: ["Free", "Subscription"], deployment_model: ["Cloud / SaaS"], collaboration_mode: ["Single-user"], support_coverage: ["Documentation only", "Business hours support"] },
    confidence: "high",
  },
  {
    title: "PicMonkey",
    vendor: "PicMonkey",
    handle: "picmonkey",
    categories: [PE, GD, BM],
    customUrl: "https://www.picmonkey.com/",
    sourceUrl: "https://www.picmonkey.com/pricing",
    sourceUrls: ["https://www.picmonkey.com/", "https://www.picmonkey.com/features", "https://www.picmonkey.com/pricing"],
    logoSourceUrl: "https://www.picmonkey.com/",
    sourceLabel: "Official PicMonkey product, features, and pricing pages",
    tagline: "a photo editing and graphic design tool for branded content and small business visuals",
    audience: "creators, online sellers, and brand-focused small businesses",
    intro: "social graphics, logos, watermarks, ads, covers, business cards, and everyday branded images from one accessible editor",
    bestFor:
      "It suits buyers who want a mix of approachable photo editing and simple marketing design without switching between separate tools for every task.",
    useCases: [
      "Edit photos and create branded graphics for social and commerce use.",
      "Make logos, watermarks, business cards, and simple ad creatives.",
      "Use templates and fonts to speed up recurring brand content work.",
      "Support small business content teams that need practical editing rather than deep creative suite complexity.",
    ],
    featureGroups: [
      { heading: "Design and editing", items: ["Photo editing", "Graphic design maker", "Social media graphics", "Logos and watermarks", "Business cards"] },
      { heading: "Brand and content tools", items: ["Brand-style workflows", "Templates", "Animations, fonts, and premium effects on higher plans where available"] },
      { heading: "Plan-level extras", items: ["Cloud storage on paid plans", "Video support on eligible plans", "Co-editing on higher plans where available", "7-day free trial where available"] },
    ],
    pricingMode: "public_paid",
    startingPrice: 7.99,
    pricingHeading: "Trial availability may vary.",
    pricingLines: ["Basic starts at $7.99/month or $72/year.", "Pro and Business plans are available at higher prices.", "A 7-day free trial may be available."],
    pros: ["Good balance of photo editing and simple design", "Useful for small business branding", "Logo, watermark, and social design tools in one place", "Paid plans add more storage and creative features"],
    cons: ["A fully emphasized free plan is not the focus", "Advanced tools require Pro or Business", "Less suitable for professional vector or UI work", "Subscription is required after trial for ongoing paid use"],
    seoTitle: "PicMonkey PicMonkey Photo Editing Design Software",
    seoDescription: "PicMonkey combines photo editing, branded graphics, logos, templates, and small business design tools in one accessible platform.",
    filters: { software_type: ["Design & content"], target_segment: ["Individuals", "Small business", "Agencies"], primary_use_case: ["Content creation"], pricing_model: ["Subscription"], deployment_model: ["Cloud / SaaS"], collaboration_mode: ["Single-user", "Team sharing"], support_coverage: ["Business hours support"] },
    confidence: "high",
  },
  {
    title: "Affinity",
    vendor: "Canva / Affinity",
    handle: "affinity",
    categories: [VG, GD],
    customUrl: "https://www.affinity.studio/",
    sourceUrl: "https://www.affinity.studio/",
    sourceUrls: ["https://www.affinity.studio/"],
    logoSourceUrl: "https://www.affinity.studio/",
    sourceLabel: "Official Affinity website",
    tagline: "a professional creative software family for vector, photo, and layout work",
    audience: "designers, illustrators, photographers, publishers, and creative freelancers",
    intro: "vector artwork, pixel editing, page layout, and more advanced design production than template-based tools are built to handle",
    bestFor:
      "It makes sense for buyers who want more creative control and a more production-oriented workflow than browser-first template tools usually provide.",
    useCases: [
      "Create vector graphics, illustrations, and brand assets with greater precision.",
      "Handle pixel editing and photo work in a more professional creative environment.",
      "Build layout-driven projects for publishing and visual communication.",
      "Move into a stronger desktop-style workflow while keeping access to Canva-connected AI options where supported.",
    ],
    featureGroups: [
      { heading: "Creative toolset", items: ["Vector design tools", "Pixel and photo editing tools", "Layout design tools", "Unified creative workspace"] },
      { heading: "Professional workflow", items: ["Professional creative editing", "Stronger control than template-first platforms", "Official Affinity platform by Canva"] },
      { heading: "AI-related notes", items: ["AI tools available with Canva premium access where supported", "Generative fill and background removal may depend on eligible Canva premium access"] },
    ],
    pricingMode: "free_only",
    startingPrice: 0,
    pricingHeading: "Free core access is presented for the core Affinity platform.",
    pricingLines: ["Some AI-powered tools may require Canva premium plan access where supported."],
    pros: ["Professional creative tools for vector, photo, and layout work", "Free core access is highlighted in the prompt data", "More control than template-first design tools", "Connects with Canva premium AI features where supported"],
    cons: ["AI features may require Canva premium access", "Learning curve is steeper than Canva-style tools", "It is not a browser-first social media template platform", "Feature direction may change as Canva evolves Affinity"],
    seoTitle: "Affinity Canva Professional Creative Design Software",
    seoDescription: "Affinity supports vector design, photo editing, and layout work for creatives who need more control than template-based online tools.",
    filters: { software_type: ["Design & content"], target_segment: ["Individuals", "Small business", "Agencies"], primary_use_case: ["Content creation"], pricing_model: ["Free"], deployment_model: ["On-premise"], collaboration_mode: ["Single-user"], support_coverage: ["Documentation only", "Business hours support"] },
    confidence: "medium",
  },
  {
    title: "Inkscape",
    vendor: "Inkscape Project",
    handle: "inkscape",
    categories: [VG],
    customUrl: "https://inkscape.org/",
    sourceUrl: "https://inkscape.org/",
    sourceUrls: ["https://inkscape.org/", "https://github.com/inkscape/inkscape"],
    logoSourceUrl: "https://inkscape.org/",
    sourceLabel: "Official Inkscape website and project repository",
    tagline: "a free open-source SVG editor for illustration, icons, diagrams, and vector artwork",
    audience: "students, hobbyists, educators, designers, and developers who need subscription-free vector editing",
    intro: "logos, icons, illustrations, maps, diagrams, typography, and scalable graphics in a desktop environment built around SVG",
    bestFor:
      "It is a practical choice for buyers who care about vector capability and open-source flexibility more than polished cloud collaboration.",
    useCases: [
      "Design logos, icons, and illustrations without a subscription.",
      "Work with SVG files for web graphics, diagrams, and interface assets.",
      "Create educational, artistic, or technical vector documents on desktop systems.",
      "Use extensions and open-source tooling for customized workflows.",
    ],
    featureGroups: [
      { heading: "Vector creation", items: ["Free and open-source vector graphics software", "SVG native format", "Illustration tools", "Logo and icon design"] },
      { heading: "Broader applications", items: ["Diagram and map creation", "Typography and web graphics", "Suitable for artistic and technical vector work"] },
      { heading: "Platform support", items: ["Cross-platform desktop support", "Extension support"] },
    ],
    pricingMode: "free_only",
    startingPrice: 0,
    pricingHeading: "Free and open-source software.",
    pricingLines: ["No subscription is required for the core software."],
    pros: ["Completely free and open source", "Strong SVG and vector editing capability", "Useful for logos, illustrations, icons, and diagrams", "Cross-platform desktop availability"],
    cons: ["The interface can take time to learn", "It is not a template-first browser platform", "Cloud collaboration is not the main focus", "Professional print or brand workflows may need additional tools"],
    seoTitle: "Inkscape Inkscape Free Vector Graphics Editor",
    seoDescription: "Inkscape is a free open-source vector graphics editor for logos, icons, illustrations, diagrams, and SVG-based design work.",
    filters: { software_type: ["Design & content"], target_segment: ["Individuals", "Developers", "Education / public sector"], primary_use_case: ["Content creation"], pricing_model: ["Free"], deployment_model: ["On-premise"], collaboration_mode: ["Single-user"], support_coverage: ["Documentation only"] },
    confidence: "high",
  },
  {
    title: "CorelDRAW",
    vendor: "Corel",
    handle: "coreldraw",
    categories: [VG, GD],
    customUrl: "https://www.coreldraw.com/",
    sourceUrl: "https://www.coreldraw.com/",
    sourceUrls: ["https://www.coreldraw.com/"],
    logoSourceUrl: "https://www.coreldraw.com/",
    sourceLabel: "Official CorelDRAW website",
    tagline: "a desktop-grade design suite for vector illustration, layout, typography, and production graphics",
    audience: "designers, sign makers, print shops, brand teams, and creative businesses",
    intro: "vector illustration, page layout, photo editing, poster work, signage, and print production tasks that demand more control",
    bestFor:
      "It is well matched to buyers who need a professional creative toolset for print and production-heavy work rather than quick template editing alone.",
    useCases: [
      "Create vector artwork, logos, signage, and print-ready creative assets.",
      "Handle page layout and production graphics for business or client projects.",
      "Support typography-heavy work and advanced creative production workflows.",
      "Equip designers and print-focused teams with a more desktop-oriented suite.",
    ],
    featureGroups: [
      { heading: "Design and production", items: ["Vector illustration", "Page layout", "Photo editing", "Typography tools", "Logo and poster design"] },
      { heading: "Specialized output", items: ["Print design", "Signage and production graphics", "Professional creative workflow"] },
      { heading: "Platform and teamwork", items: ["Windows and Mac support where available", "Collaboration features where available"] },
    ],
    pricingMode: "price_unavailable",
    startingPrice: 0,
    pricingHeading: "Paid plans and trial options are available.",
    pricingLines: ["A current public USD base price was not safely confirmed for this listing."],
    pros: ["Professional vector and layout toolset", "Useful for print, signage, logos, and production graphics", "Desktop-grade creative workflow", "Strong fit for advanced designers and print businesses"],
    cons: ["It is paid software", "Learning curve is higher than template-first tools", "It may be more than casual users need", "Licensing details should be verified before purchase"],
    seoTitle: "CorelDRAW Corel Professional Vector Design Software",
    seoDescription: "CorelDRAW supports vector illustration, layout, typography, and production graphics for print businesses and advanced creative teams.",
    filters: { software_type: ["Design & content"], target_segment: ["Small business", "Mid-market", "Agencies"], primary_use_case: ["Content creation"], pricing_model: ["Subscription"], deployment_model: ["On-premise"], collaboration_mode: ["Single-user", "Team sharing"], support_coverage: ["Business hours support"] },
    confidence: "medium",
  },
  {
    title: "Adobe Photoshop",
    vendor: "Adobe",
    handle: "adobe-photoshop",
    categories: [PE],
    customUrl: "https://www.adobe.com/products/photoshop.html",
    sourceUrl: "https://www.adobe.com/products/photoshop/plans.html",
    sourceUrls: ["https://www.adobe.com/products/photoshop.html", "https://www.adobe.com/products/photoshop/plans.html", "https://www.adobe.com/in/products/photoshop.html"],
    logoSourceUrl: "https://www.adobe.com/products/photoshop.html",
    sourceLabel: "Official Adobe Photoshop product and plans pages",
    tagline: "a professional image editing application for retouching, compositing, digital art, and advanced visual production",
    audience: "photographers, designers, marketers, agencies, and creative professionals",
    intro: "photo editing, retouching, raster graphics, compositing, web visuals, and advanced creative image work with deeper control",
    bestFor:
      "It is the right fit when an everyday browser editor is no longer enough and a buyer needs precise image manipulation, richer tool depth, and a more established creative workflow.",
    useCases: [
      "Retouch photography and build polished marketing visuals.",
      "Create composites, layered artwork, and image-driven campaign assets.",
      "Support digital art, web graphics, and professional creative production.",
      "Work across desktop, web, and mobile access depending on the selected plan.",
    ],
    featureGroups: [
      { heading: "Image editing depth", items: ["Photo retouching", "Image compositing", "Raster graphics editing", "Background editing"] },
      { heading: "Creative workflows", items: ["Digital art workflows", "Desktop, web, and mobile access depending on plan", "Creative Cloud integration"] },
      { heading: "Plan-level additions", items: ["Generative AI features where included", "Adobe Express Premium included on some plans", "Cloud storage depending on plan"] },
    ],
    pricingMode: "public_paid",
    startingPrice: 22.99,
    pricingHeading: "Paid subscription.",
    pricingLines: ["The standalone Photoshop plan commonly shows US$22.99/month on annual billed monthly terms.", "Some plans include 100GB cloud storage and monthly generative credits.", "Regional pricing and promotional terms may differ."],
    pros: ["Advanced photo editing and image manipulation depth", "Strong AI and Creative Cloud ecosystem support", "Suitable for professional creative workflows", "Works across desktop, web, and mobile depending on plan"],
    cons: ["Subscription required", "More complex than simple online design tools", "Generative credits and storage vary by plan", "Pricing varies by country and promotional terms"],
    seoTitle: "Adobe Photoshop Adobe Professional Photo Editing Software",
    seoDescription: "Adobe Photoshop supports professional photo editing, retouching, compositing, digital art, and advanced image production workflows.",
    filters: { software_type: ["Design & content"], target_segment: ["Individuals", "Small business", "Agencies"], primary_use_case: ["Content creation"], pricing_model: ["Subscription"], deployment_model: ["Hybrid"], collaboration_mode: ["Single-user"], support_coverage: ["Business hours support"] },
    confidence: "medium",
  },
  {
    title: "Adobe Illustrator",
    vendor: "Adobe",
    handle: "adobe-illustrator",
    categories: [VG],
    customUrl: "https://www.adobe.com/products/illustrator.html",
    sourceUrl: "https://www.adobe.com/products/illustrator/plans.html",
    sourceUrls: ["https://www.adobe.com/products/illustrator.html", "https://www.adobe.com/products/illustrator/plans.html", "https://www.adobe.com/in/products/illustrator.html"],
    logoSourceUrl: "https://www.adobe.com/products/illustrator.html",
    sourceLabel: "Official Adobe Illustrator product and plans pages",
    tagline: "a professional vector illustration application for logos, icons, typography, and scalable brand assets",
    audience: "professional designers, illustrators, branding teams, agencies, and businesses",
    intro: "logos, icons, illustrations, packaging artwork, web graphics, and other vector-first creative work that needs precision and scale",
    bestFor:
      "It is most appropriate when a buyer needs clean scalable artwork, stronger control than template tools provide, and a workflow built around vector design from the start.",
    useCases: [
      "Create logos, icons, and brand assets for print and digital use.",
      "Develop illustrations, packaging artwork, and promotional graphics.",
      "Build scalable creative output for web, mobile, video, and print projects.",
      "Support professional typography and drawing workflows inside Adobe Creative Cloud.",
    ],
    featureGroups: [
      { heading: "Vector design", items: ["Vector illustration", "Logo design", "Icon design", "Drawing and shape tools", "Typography"] },
      { heading: "Platform and ecosystem", items: ["Desktop and iPad support where available", "Print, web, video, and mobile output", "Creative Cloud integration"] },
      { heading: "Plan-level additions", items: ["Generative AI features where available", "Fonts and asset ecosystem depending on plan"] },
    ],
    pricingMode: "price_unavailable",
    startingPrice: 0,
    pricingHeading: "Paid subscription.",
    pricingLines: ["Regional and promotional pricing varies, and a current public USD base price was not safely confirmed for this listing."],
    pros: ["Professional vector design standard", "Strong for logos, icons, illustrations, and typography", "Scalable artwork for print and digital use", "Creative Cloud ecosystem support"],
    cons: ["Subscription required", "More complex than beginner design tools", "Generative AI features may use credits", "Pricing varies by region and promotion"],
    seoTitle: "Adobe Illustrator Adobe Vector Illustration Software",
    seoDescription: "Adobe Illustrator supports professional vector illustration, logo design, typography, and scalable brand graphics for print and digital work.",
    filters: { software_type: ["Design & content"], target_segment: ["Individuals", "Small business", "Agencies"], primary_use_case: ["Content creation"], pricing_model: ["Subscription"], deployment_model: ["Hybrid"], collaboration_mode: ["Single-user"], support_coverage: ["Business hours support"] },
    confidence: "medium",
  },
  {
    title: "Desygner",
    vendor: "Desygner",
    handle: "desygner",
    categories: [BM, GD],
    customUrl: "https://desygner.com/",
    sourceUrl: "https://desygner.com/pricing/",
    sourceUrls: ["https://desygner.com/", "https://desygner.com/pricing/"],
    logoSourceUrl: "https://desygner.com/",
    sourceLabel: "Official Desygner product and pricing pages",
    tagline: "a business design platform focused on branded content control and reusable marketing workflows",
    audience: "small businesses, franchises, sales teams, and marketing organizations",
    intro: "branded templates, marketing assets, business documents, and content distribution workflows that need stronger control than casual design tools usually provide",
    bestFor:
      "It is especially useful when many people need to create on-brand content without giving every contributor full creative freedom over every design element.",
    useCases: [
      "Create business cards, flyers, menus, certificates, posters, and promotional materials.",
      "Manage branded templates and asset libraries across teams or locations.",
      "Support guest users, localized assets, and controlled content updates.",
      "Give sales and marketing teams a more structured self-service design workflow.",
    ],
    featureGroups: [
      { heading: "Business design tools", items: ["Business and marketing design tools", "Templates for business documents and promotions", "PDF editing", "Cross-platform workflows"] },
      { heading: "Brand and asset control", items: ["Brand portal workflows", "Digital asset management", "Localization support"] },
      { heading: "Team support", items: ["AI-powered campaign customization where available", "Team and guest user support where available", "Business plan for multiple users"] },
    ],
    pricingMode: "public_paid",
    startingPrice: 14.95,
    pricingHeading: "Paid business plan.",
    pricingLines: ["Business pricing is shown as starting from USD14.95/month for up to 5 team members and unlimited guest users where available.", "Larger team pricing structures are also mentioned."],
    pros: ["Good for branded business and marketing materials", "Supports team and guest workflows", "Useful for asset control and brand consistency", "Covers a wide range of business document and promotion needs"],
    cons: ["Advanced business features require a paid plan", "Pricing may vary by team size and billing term", "It is not a professional photo or vector suite first", "Brand portal workflows may need setup time"],
    seoTitle: "Desygner Desygner Business Design Platform",
    seoDescription: "Desygner helps teams manage branded templates, business content, asset libraries, and controlled marketing workflows from one platform.",
    filters: { software_type: ["Design & content"], target_segment: ["Small business", "Mid-market", "Agencies"], primary_use_case: ["Content creation"], pricing_model: ["Subscription"], deployment_model: ["Cloud / SaaS"], collaboration_mode: ["Team sharing", "Roles & permissions"], support_coverage: ["Business hours support"] },
    confidence: "high",
  },
  {
    title: "PosterMyWall",
    vendor: "PosterMyWall",
    handle: "postermywall",
    categories: [GD],
    customUrl: "https://www.postermywall.com/",
    sourceUrl: "https://www.postermywall.com/index.php/premium",
    sourceUrls: ["https://www.postermywall.com/", "https://www.postermywall.com/index.php/premium", "https://support.postermywall.com/hc/en-us/articles/360021586572-What-do-I-get-from-the-PosterMyWall-Premium-Subscription"],
    logoSourceUrl: "https://www.postermywall.com/",
    sourceLabel: "Official PosterMyWall product, premium, and support pages",
    tagline: "an easy marketing design platform for local promotion, events, and social publishing",
    audience: "small businesses, restaurants, event organizers, schools, creators, and local marketers",
    intro: "posters, flyers, social graphics, videos, email creatives, event pages, and everyday promotions that need to be produced quickly",
    bestFor:
      "It works particularly well for buyers who create recurring promotional material and want design, simple publishing, and campaign-friendly outputs in one place.",
    useCases: [
      "Create posters, flyers, and social posts for local campaigns and events.",
      "Build promotional videos, digital signage, and email creatives.",
      "Use event pages and publishing tools for time-sensitive marketing.",
      "Support schools, stores, and community organizations that need fast visual outreach.",
    ],
    featureGroups: [
      { heading: "Promotional design tools", items: ["Poster and flyer templates", "Social media designs", "Video designs", "Email templates and campaign tools", "Event pages"] },
      { heading: "Plan-level editing tools", items: ["AI image features on eligible plans", "Background removal on eligible plans", "Social publishing and scheduling on premium plans"] },
      { heading: "Download and asset support", items: ["High-resolution, watermark-free downloads on Premium", "Free downloads for supported social media sizes on the free plan", "1 million+ templates mentioned on pricing pages"] },
    ],
    pricingMode: "public_paid",
    startingPrice: 19,
    pricingHeading: "Free plan available.",
    pricingLines: ["Premium is shown at $19/month or $149/year.", "Premium support materials mention 100 free credits at the start of every month.", "Unlimited high-resolution, watermark-free image and video downloads are highlighted for Premium."],
    pros: ["Strong fit for posters, flyers, and local promotions", "Free plan available", "Premium supports high-resolution and watermark-free downloads", "Includes email and event promotion tools"],
    cons: ["Premium features require upgrade", "The platform focuses more on marketing assets than design systems", "AI, background removal, and scheduling may depend on plan level", "Pricing and credits can change"],
    seoTitle: "PosterMyWall PosterMyWall Poster Flyer Design Tool",
    seoDescription: "PosterMyWall helps businesses and schools create posters, flyers, social graphics, videos, and event promotions with ready-made templates.",
    filters: { software_type: ["Design & content"], target_segment: ["Individuals", "Small business", "Education / public sector"], primary_use_case: ["Content creation"], pricing_model: ["Free", "Subscription"], deployment_model: ["Cloud / SaaS"], collaboration_mode: ["Single-user", "Team sharing"], support_coverage: ["Documentation only", "Business hours support"] },
    confidence: "high",
  },
  {
    title: "Stencil",
    vendor: "Stencil",
    handle: "stencil",
    categories: [GD],
    customUrl: "https://getstencil.com/",
    sourceUrl: "https://getstencil.com/pricing",
    sourceUrls: ["https://getstencil.com/", "https://getstencil.com/pricing"],
    logoSourceUrl: "https://getstencil.com/",
    sourceLabel: "Official Stencil product and pricing pages",
    tagline: "a lightweight design tool for social graphics, quotes, and blog visuals",
    audience: "bloggers, social media managers, marketers, creators, and small businesses",
    intro: "social images, quote graphics, blog visuals, ad creatives, and simple headers with a fast low-friction workflow",
    bestFor:
      "It is best suited to buyers who want a streamlined design tool for repeatable online graphics rather than a full creative suite with many advanced features.",
    useCases: [
      "Produce social media images and quote posts quickly.",
      "Create blog headers, simple ad graphics, and campaign visuals.",
      "Work with templates, icons, and photos in a lightweight browser-based editor.",
      "Give marketers and creators a faster path to everyday content production.",
    ],
    featureGroups: [
      { heading: "Simple content tools", items: ["Social media image creation", "Blog graphics", "Quote images", "Templates and presets"] },
      { heading: "Assets and organization", items: ["Icons and photos", "Collections and favorites"] },
      { heading: "Plan options", items: ["Free, Pro, and Unlimited plan options", "Monthly and yearly billing", "7-day money-back guarantee on paid plans where available", "Cancel anytime on monthly plans"] },
    ],
    pricingMode: "public_paid",
    startingPrice: 15,
    pricingHeading: "Free plan available.",
    pricingLines: ["Pro is commonly shown at $15/month on the official pricing page.", "Unlimited is commonly shown at $20/month.", "Paid plans may include a 7-day money-back guarantee where available."],
    pros: ["Simple and fast for social graphics", "Good fit for bloggers and marketers", "Free plan available", "Lighter than larger design suites"],
    cons: ["Free plan has usage and asset limits", "Less suitable for advanced design or video work", "Paid plan is needed for higher usage", "It is not a replacement for professional design software"],
    seoTitle: "Stencil Stencil Social Media Image Design Tool",
    seoDescription: "Stencil helps bloggers and marketers create social images, quote graphics, and blog visuals quickly with templates and stock assets.",
    filters: { software_type: ["Design & content"], target_segment: ["Individuals", "Small business", "Agencies"], primary_use_case: ["Content creation"], pricing_model: ["Free", "Subscription"], deployment_model: ["Cloud / SaaS"], collaboration_mode: ["Single-user"], support_coverage: ["Documentation only", "Business hours support"] },
    confidence: "high",
  },
  {
    title: "Kittl",
    vendor: "Kittl",
    handle: "kittl",
    categories: [GD, AI],
    customUrl: "https://www.kittl.com/",
    sourceUrl: "https://www.kittl.com/pricing",
    sourceUrls: ["https://www.kittl.com/", "https://www.kittl.com/pricing", "https://www.kittl.com/features"],
    logoSourceUrl: "https://www.kittl.com/",
    sourceLabel: "Official Kittl product, pricing, and features pages",
    tagline: "an AI-first design platform for branding, typography, product visuals, and mockup-driven creator work",
    audience: "creators, print-on-demand sellers, design-focused brands, and small creative teams",
    intro: "typography-led designs, product visuals, templates, mockups, and branding assets that need a more polished style than a basic social editor",
    bestFor:
      "It stands out for buyers who care about visual style, typography, and product-ready presentation while still wanting a modern AI-assisted workflow.",
    useCases: [
      "Create branded graphics, merch visuals, and print-on-demand assets.",
      "Build mockups and product visuals for ecommerce and creator businesses.",
      "Use AI generation and curated assets to accelerate early design exploration.",
      "Support small teams that need stylish output without a complex studio setup.",
    ],
    featureGroups: [
      { heading: "Design and AI workflow", items: ["AI-powered design generation", "Image generation models", "Pro editing tools", "Templates"] },
      { heading: "Creator-focused assets", items: ["Mockups", "Curated assets", "Fonts and typography tools"] },
      { heading: "Scaling and storage", items: ["Flows for scalable creative workflows", "Team collaboration features", "Brand kits and higher storage on advanced plans where available", "Free to start with no credit card required"] },
    ],
    pricingMode: "price_unavailable",
    startingPrice: 0,
    pricingHeading: "Free plan available.",
    pricingLines: ["Paid plans are available, but a current public USD base price was not safely confirmed for this listing."],
    pros: ["Strong for typography, branding, mockups, and product visuals", "AI-first creative workflow", "Free to start", "Useful for creators and print-on-demand sellers"],
    cons: ["Free plan has limitations", "Advanced AI, project, brand, or high-res features may require paid plans", "Less focused on business documents and presentations", "Plan limits should be verified before buying"],
    seoTitle: "Kittl Kittl AI Design Platform for Creators",
    seoDescription: "Kittl helps creators build branded graphics, typography-led visuals, mockups, and product assets with AI-assisted design tools.",
    filters: { software_type: ["Design & content"], target_segment: ["Individuals", "Small business", "Agencies"], primary_use_case: ["Content creation"], pricing_model: ["Free", "Subscription"], deployment_model: ["Cloud / SaaS"], collaboration_mode: ["Single-user", "Team sharing"], support_coverage: ["Documentation only", "Business hours support"] },
    confidence: "medium",
  },
  {
    title: "Placeit",
    vendor: "Placeit / Envato",
    handle: "placeit",
    categories: [GD],
    customUrl: "https://placeit.net/",
    sourceUrl: "https://placeit.net/pricing",
    sourceUrls: ["https://placeit.net/", "https://placeit.net/pricing"],
    logoSourceUrl: "https://placeit.net/",
    sourceLabel: "Official Placeit product and pricing pages",
    tagline: "a cloud design platform focused on mockups, logos, videos, and ecommerce-ready templates",
    audience: "ecommerce sellers, print-on-demand businesses, creators, gaming brands, and marketers",
    intro: "product mockups, apparel visuals, logo ideas, merch videos, gaming graphics, and social content using ready-made templates",
    bestFor:
      "It works particularly well for buyers who need product presentation visuals quickly and want breadth across mockups, logo starters, and short-form promotional content.",
    useCases: [
      "Create apparel and product mockups for ecommerce listings and ads.",
      "Build logos, merch videos, and branded social assets from ready-made templates.",
      "Produce gaming and creator visuals without full custom design production.",
      "Support quick content needs for stores, creators, and print-on-demand operations.",
    ],
    featureGroups: [
      { heading: "Mockups and branding", items: ["Mockup generator", "Product and apparel mockups", "Logo maker"] },
      { heading: "Video and templates", items: ["Video templates", "Design templates", "Gaming graphics", "YouTube and social media visuals", "Merch videos"] },
      { heading: "Subscription model", items: ["Unlimited access subscription options", "Commercial usage rights where included", "No credits or no-limits claims where included on plan"] },
    ],
    pricingMode: "public_paid",
    startingPrice: 14.95,
    pricingHeading: "Paid subscription.",
    pricingLines: ["Subscription pricing is shown as $14.95/month or $89.69/year."],
    pros: ["Strong for mockups and ecommerce visuals", "Useful for print-on-demand and merchandise sellers", "Logo, video, and social templates are included", "Broad asset access under subscription"],
    cons: ["Best value depends on frequent use", "Template-based output may need extra customization", "It is not a full professional editing suite", "Commercial usage terms should be verified before purchase"],
    seoTitle: "Placeit Placeit Mockup Design Tool",
    seoDescription: "Placeit helps sellers and creators build mockups, logos, merch videos, and social visuals with ready-made templates and broad asset access.",
    filters: { software_type: ["Design & content"], target_segment: ["Individuals", "Small business", "Agencies"], primary_use_case: ["Content creation"], pricing_model: ["Subscription"], deployment_model: ["Cloud / SaaS"], collaboration_mode: ["Single-user"], support_coverage: ["Business hours support"] },
    confidence: "high",
  },
  {
    title: "Prezi",
    vendor: "Prezi",
    handle: "prezi",
    categories: [PR, AI],
    customUrl: "https://prezi.com/",
    sourceUrl: "https://prezi.com/pricing/",
    sourceUrls: ["https://prezi.com/", "https://prezi.com/pricing/", "https://support.prezi.com/hc/en-us/articles/360003478934-Guide-to-Prezi-plans"],
    logoSourceUrl: "https://prezi.com/",
    sourceLabel: "Official Prezi pricing and support pages",
    tagline: "an interactive presentation platform built around zooming storytelling and AI-assisted slide creation",
    audience: "educators, students, presenters, sales teams, trainers, and consultants",
    intro: "interactive presentations, video presentations, infographics, and visual stories that feel more dynamic than a traditional slide deck",
    bestFor:
      "It is a strong option for buyers who want a more visual, non-linear presentation style and value audience engagement over a standard slide-by-slide format.",
    useCases: [
      "Create interactive presentations for sales, training, and classroom use.",
      "Turn prompts or imported content into faster visual story drafts.",
      "Produce presentation videos and supporting infographic-style content.",
      "Share more dynamic pitch, teaching, or consulting material online.",
    ],
    featureGroups: [
      { heading: "Presentation creation", items: ["AI presentation creation", "Interactive zooming presentation canvas", "Presentation templates", "Prezi Video", "Infographics and visual content creation"] },
      { heading: "Plan-level features", items: ["PDF or PPT import on supported plans", "AI image creation and AI text transformation where available", "Privacy and sharing controls on paid plans"] },
      { heading: "Advanced access", items: ["Desktop app and offline access on higher plans", "PDF export and portable presentations on Plus where available", "Premium features, training, analytics, or priority support on higher plans where available"] },
    ],
    pricingMode: "public_paid",
    startingPrice: 19,
    pricingHeading: "Basic plan is free.",
    pricingLines: ["Paid plans start from $19/month on the reviewed official pricing page.", "Support documentation describes Basic as free and outlines Standard, Plus, and higher plans."],
    pros: ["Distinctive interactive presentation style", "AI tools can speed up presentation creation", "Good for visual storytelling and audience engagement", "Useful for educators and business presenters"],
    cons: ["The format may not suit every traditional slide workflow", "Offline access and export features may require higher plans", "Some users need time to learn the zooming format", "Pricing and AI inclusions vary by plan"],
    seoTitle: "Prezi Prezi AI Presentation Maker",
    seoDescription: "Prezi helps educators and business presenters create interactive presentations, videos, and visual stories with AI-assisted workflows.",
    filters: { software_type: ["Design & content"], target_segment: ["Individuals", "Small business", "Education / public sector"], primary_use_case: ["Content creation"], pricing_model: ["Free", "Subscription"], deployment_model: ["Cloud / SaaS"], collaboration_mode: ["Single-user", "Team sharing"], support_coverage: ["Documentation only", "Business hours support", "Priority support"] },
    confidence: "high",
  },
  {
    title: "Beautiful.ai",
    vendor: "Beautiful.ai",
    handle: "beautiful-ai",
    categories: [PR, AI],
    customUrl: "https://www.beautiful.ai/",
    sourceUrl: "https://www.beautiful.ai/pricing",
    sourceUrls: ["https://www.beautiful.ai/", "https://www.beautiful.ai/pricing"],
    logoSourceUrl: "https://www.beautiful.ai/",
    sourceLabel: "Official Beautiful.ai product and pricing pages",
    tagline: "an AI presentation platform focused on smart slide layouts and polished deck creation",
    audience: "professionals, startups, consultants, educators, and sales or marketing teams",
    intro: "slide decks, pitch presentations, business updates, and branded presentations that need to look polished with less manual formatting effort",
    bestFor:
      "It is particularly appealing when presentation quality matters, but the team does not want to spend extra time adjusting every layout by hand.",
    useCases: [
      "Build professional-looking presentations for sales, consulting, and leadership updates.",
      "Use AI assistance to speed up early draft creation and slide structuring.",
      "Maintain brand consistency across decks and teams on paid plans.",
      "Support collaborative presentation workflows for growing business teams.",
    ],
    featureGroups: [
      { heading: "Presentation creation", items: ["AI presentation maker", "Smart Slides", "Automated formatting", "Presentation templates", "Embedded media"] },
      { heading: "Brand and analytics", items: ["Custom branding on paid plans", "Analytics on selected plans"] },
      { heading: "Team and enterprise options", items: ["Team collaboration on team plans", "Enterprise plan for larger organizations", "14-day free trial where available", "One-off single presentation purchase where offered"] },
    ],
    pricingMode: "public_paid",
    startingPrice: 12,
    pricingHeading: "Paid plans with trial availability.",
    pricingLines: ["Pro is listed at $12/month billed annually.", "Team is listed at $40 per user/month billed annually or $50 per user/month monthly.", "Enterprise pricing is custom, and a one-off single presentation option may be available for $45."],
    pros: ["Strong for professional-looking presentations", "Smart slide formatting saves time", "AI-assisted deck creation", "Team and enterprise options are available"],
    cons: ["Pro is billed annually", "Team cost increases with more users", "Brand, analytics, and admin features can require higher plans", "It is not a general-purpose graphic design suite"],
    seoTitle: "Beautiful.ai Beautiful.ai AI Presentation Software",
    seoDescription: "Beautiful.ai helps teams create polished presentations with smart slide layouts, branding controls, collaboration, and AI-assisted deck creation.",
    filters: { software_type: ["Design & content"], target_segment: ["Individuals", "Small business", "Mid-market", "Enterprise"], primary_use_case: ["Content creation"], pricing_model: ["Subscription", "Custom quote"], deployment_model: ["Cloud / SaaS"], collaboration_mode: ["Single-user", "Team sharing", "Roles & permissions"], support_coverage: ["Documentation only", "Business hours support", "Priority support"] },
    confidence: "high",
  },
];

const rows = specs.map(rowFromSpec);

const outputJson = path.join(EXPORTS_DIR, `software-batch43-preview-${DATE_STAMP}.json`);
const outputCsv = path.join(EXPORTS_DIR, `software-batch43-preview-${DATE_STAMP}.csv`);

fs.mkdirSync(EXPORTS_DIR, { recursive: true });
fs.writeFileSync(outputJson, `${JSON.stringify(rows, null, 2)}\n`, "utf8");

const csvHeaders = [
  "title",
  "handle",
  "vendor",
  "price",
  "seoTitle",
  "seoDescription",
  "customUrl",
  "sourceUrl",
  "collectionHandles",
  "collectionTitles",
  "confidence",
];

const csvLines = [
  csvHeaders.join(","),
  ...rows.map((row) =>
    [
      row.title,
      row.handle,
      row.vendor,
      row.price,
      row.seoTitle,
      row.seoDescription,
      row.customUrl,
      row.sourceUrl,
      row.collectionHandles.join("|"),
      row.collectionTitles.join("|"),
      row.confidence,
    ]
      .map(csvEscape)
      .join(",")
  ),
];

fs.writeFileSync(outputCsv, `${csvLines.join("\n")}\n`, "utf8");

console.log(`Wrote ${rows.length} products to ${outputJson}`);
console.log(`Wrote CSV summary to ${outputCsv}`);
