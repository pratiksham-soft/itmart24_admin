import "../config/env";
import admin, { firestore } from "../config/firebase";
import { shopifyRest } from "../services/shopifyHttp";
import { setCustomProductMetafields } from "../services/shopifyMetafields";

const SHOPIFY_PRODUCT_ID = 9362707120367;
const MULTILINE_SEPARATOR = "\r\n";

const TITLE = "Canva";
const FULL_NAME = "Canva Graphic Design Platform";
const CATEGORY = "Graphic Design Software";
const WEBSITE_URL = "https://www.canva.com/";
const FEATURE_URL = "https://www.canva.com/features/";
const PRICING_URL = "https://www.canva.com/en_in/pricing/";
const PRO_URL = "https://www.canva.com/pro/";
const BUSINESS_URL = "https://www.canva.com/canva-business/";
const ENTERPRISE_URL = "https://www.canva.com/enterprise/";
const EDUCATION_URL = "https://www.canva.com/en_in/education/";
const CAMPUS_URL = "https://www.canva.com/en_in/for-campus/";

const SHORT_DESCRIPTION =
  "Canva is an online graphic design and visual communication platform that helps individuals, businesses, teachers, schools, and organizations create social media graphics, presentations, videos, documents, marketing assets, brand content, and educational materials using templates, drag-and-drop editing, stock content, collaboration tools, brand kits, and AI-powered design features.";

const LONG_DESCRIPTION =
  "Canva is a cloud-based graphic design and visual communication platform built for users who want to create professional-looking content without complex design software. It provides an easy drag-and-drop editor, thousands of design types, millions of templates, stock photos, videos, graphics, audio assets, brand management tools, content scheduling, collaboration features, education tools, and AI-assisted design capabilities.";

const LONG_DESCRIPTION_2 =
  "Canva can be used to create social media posts, presentations, posters, videos, flyers, business documents, marketing creatives, classroom materials, brand assets, ads, infographics, resumes, whiteboards, websites, and many other visual content formats.";

const LONG_DESCRIPTION_3 =
  "The platform offers multiple plan types for different users, including Canva Free for individuals, Canva Pro for creators and professionals, Canva Business for growing teams and businesses, Canva Enterprise for large organizations, Canva Education for eligible K-12 teachers and schools, and Canva Campus for higher education institutions.";

const LONG_DESCRIPTION_4 =
  "Canva is especially useful for non-designers, creators, marketing teams, educators, startups, small businesses, agencies, and organizations that need to create high-quality visual content quickly while keeping brand consistency and collaboration under control.";

const SECONDARY_CATEGORIES = [
  "Design Tools",
  "AI Design Tools",
  "Marketing Design Software",
  "Social Media Design Tools",
  "Presentation Software",
  "Video Design Tools",
  "Brand Management Tools",
  "Education Technology",
  "Team Collaboration Tools",
  "Visual Communication Platform",
];

const TAGS = [
  "Graphic Design",
  "Canva",
  "Drag and Drop Design",
  "Online Design Tool",
  "AI Design Tool",
  "Social Media Design",
  "Presentation Design",
  "Brand Kit",
  "Templates",
  "Marketing Creatives",
  "Content Creation",
  "Video Design",
  "Poster Design",
  "Flyer Design",
  "Education Design Tool",
  "Business Design Platform",
  "Team Collaboration",
  "Visual Communication",
  "Cloud Design Software",
  "AI Image Design",
];

const TARGET_USERS = [
  "Individuals",
  "Creators",
  "Freelancers",
  "Small businesses",
  "Marketing teams",
  "Social media managers",
  "Startups",
  "Agencies",
  "Teachers",
  "Schools",
  "Students",
  "Colleges and universities",
  "Nonprofits",
  "Enterprise teams",
  "HR teams",
  "Sales teams",
  "Content teams",
  "Brand teams",
];

const USE_CASES = [
  "Create social media posts and reels",
  "Design presentations",
  "Create marketing flyers and posters",
  "Design videos and short-form content",
  "Create business documents",
  "Build brand assets",
  "Create ads and marketing creatives",
  "Design classroom resources",
  "Create lesson materials",
  "Collaborate with teams on designs",
  "Manage brand kits",
  "Schedule social media content",
  "Remove image backgrounds",
  "Resize designs for different platforms",
  "Translate designs",
  "Create AI-assisted content",
  "Build visual communication assets",
  "Create print-ready designs",
  "Create infographics",
  "Create resumes and portfolios",
  "Create educational assignments and resources",
];

const KEY_FEATURES = [
  "Easy drag-and-drop design editor",
  "1,000+ design types",
  "Large template library",
  "Free and premium stock photos, videos, graphics, and audio",
  "Brand Kit support",
  "Background remover on premium plans",
  "Magic Resize on premium plans",
  "Design translation tools on premium plans",
  "Social media content scheduling on premium plans",
  "AI-powered design and content tools",
  "AI ad creation and ad insights where available",
  "Canva AI 2.0 where available",
  "Canva AI connectors where available",
  "Components feature where available",
  "Canva Offline where available",
  "Magic Layers where available",
  "Team collaboration tools",
  "Approval workflows on business and enterprise plans",
  "Admin controls on business, enterprise, school, and campus plans",
  "SSO and SCIM provisioning on enterprise/campus plans where available",
  "LMS integrations for education plans",
  "Cloud storage based on selected plan",
  "Access to Affinity on supported plans",
  "Access to Leonardo.Ai and Flourish on selected business, enterprise, and campus plans",
  "Print order discount on selected paid business/enterprise plans",
];

const COMPARISON_SUMMARY = [
  "Canva Free is suitable for individuals who want basic design tools, free templates, and limited storage.",
  "Canva Pro is suitable for creators, freelancers, and professionals who need premium templates, stock assets, brand kits, background removal, Magic Resize, content scheduling, and higher AI allowance.",
  "Canva Business is suitable for growing businesses and teams that need collaboration, admin tools, approvals, more brand kits, higher storage, and access to additional creative tools.",
  "Canva Enterprise is suitable for large organizations that need advanced security, SSO, SCIM, custom apps, multi-team brand management, dedicated support, and enterprise-level controls.",
  "Canva Education is suitable for eligible K-12 teachers, students, schools, and districts.",
  "Canva Campus is suitable for colleges, universities, and higher education institutions that need institution-wide creative access and centralized controls.",
];

const PROS = [
  "Easy to use for beginners and non-designers",
  "Large template and asset library",
  "Useful for social media, presentations, videos, documents, and marketing content",
  "Strong free plan for basic design needs",
  "Premium plans include time-saving tools like background remover and Magic Resize",
  "Brand Kit helps maintain visual consistency",
  "Collaboration and approval tools are useful for teams",
  "Education plans are free for eligible K-12 users and schools",
  "Supports AI-powered design workflows",
  "Cloud-based access across devices",
];

const CONS = [
  "Advanced features require paid plans",
  "AI usage is subject to plan-based limits",
  "Some features may vary by region, plan, and eligibility",
  "Enterprise and Campus pricing requires contacting Canva",
  "Free plan has limited storage and limited Brand Kit capability",
  "Some premium assets and tools may require upgrade or additional terms",
  "Users needing full professional design control may still prefer advanced desktop design software",
];

const BEST_FOR = [
  "Content creators",
  "Small business owners",
  "Digital marketers",
  "Social media managers",
  "Freelancers",
  "Teachers",
  "Students",
  "Schools",
  "Marketing teams",
  "Startup teams",
  "Non-designers",
  "Brand teams",
  "Business communication teams",
  "Agencies",
  "Enterprise visual communication teams",
];

const NOT_IDEAL_FOR = [
  "Users who need advanced vector illustration workflows only",
  "Users who need full offline professional desktop publishing workflows",
  "Users who require highly specialized print production software",
  "Users who want unlimited AI usage without plan restrictions",
  "Users who do not want a subscription for premium features",
];

const SEO_TITLE = "Canva Graphic Design Platform - Features, Pricing, Plans & Review";
const SEO_DESCRIPTION =
  "Explore Canva, an online graphic design and visual communication platform for creating social media posts, presentations, videos, marketing designs, classroom resources, brand assets, and business content. Compare Canva Free, Pro, Business, Enterprise, Education, and Campus plans.";

const SEO_KEYWORDS = [
  "Canva",
  "Canva Pro",
  "Canva Business",
  "Canva Enterprise",
  "Canva Education",
  "Canva Campus",
  "graphic design software",
  "online design tool",
  "AI design platform",
  "social media design tool",
  "presentation design software",
  "brand kit software",
  "marketing design tool",
  "visual communication platform",
  "Canva pricing",
  "Canva features",
];

const PRICING_DISCLAIMER =
  "Prices, taxes, AI usage limits, feature availability, and eligibility may vary by country, billing cycle, organization type, and Canva's latest terms. Users should verify current details on Canva's official website before purchasing.";

const AI_DISCLAIMER =
  "AI allowances, premium features, and newly launched tools may be subject to Canva usage limits, rollout status, plan terms, regional availability, and eligibility rules.";

const OFFICIAL_URLS = {
  website: WEBSITE_URL,
  features: FEATURE_URL,
  pricing: PRICING_URL,
  pro: PRO_URL,
  business: BUSINESS_URL,
  enterprise: ENTERPRISE_URL,
  education: EDUCATION_URL,
  campus: CAMPUS_URL,
};

const FAQS = [
  {
    question: "What is Canva used for?",
    answer:
      "Canva is used to create visual content such as social media posts, presentations, videos, posters, flyers, documents, ads, brand assets, classroom materials, infographics, and marketing designs using an online drag-and-drop editor.",
  },
  {
    question: "Is Canva free?",
    answer:
      "Yes. Canva offers a Free plan for individuals. The Free plan includes basic design tools, templates, stock content, limited cloud storage, and limited AI usage. Premium tools and larger asset libraries are available in paid plans.",
  },
  {
    question: "What is the difference between Canva Free and Canva Pro?",
    answer:
      "Canva Free is suitable for basic design needs, while Canva Pro adds premium templates, premium stock assets, more Brand Kits, background remover, Magic Resize, social content scheduling, more storage, and higher AI allowance.",
  },
  {
    question: "Who should use Canva Business?",
    answer:
      "Canva Business is designed for teams and businesses that need collaboration tools, admin controls, approvals, more Brand Kits, higher storage, premium content, and advanced marketing and AI-powered design features.",
  },
  {
    question: "Does Canva offer an enterprise plan?",
    answer:
      "Yes. Canva Enterprise is available for large organizations that need enterprise-level security, SSO, SCIM provisioning, custom apps, multi-team management, tiered approvals, priority support, and dedicated success management.",
  },
  {
    question: "Is Canva free for teachers and schools?",
    answer:
      "Canva Education is free for eligible K-12 teachers, students, schools, and districts. Eligibility and access depend on Canva's education verification rules.",
  },
  {
    question: "What is Canva Campus?",
    answer:
      "Canva Campus is designed for higher education institutions that want to provide Canva access across students, staff, and faculty with centralized controls, SSO, reporting, LMS integrations, and institution-wide creative collaboration.",
  },
  {
    question: "Does Canva include AI features?",
    answer:
      "Yes. Canva includes AI-powered features depending on the selected plan. AI usage allowances and access to specific AI tools may vary by plan, region, and Canva's latest terms.",
  },
  {
    question: "Can Canva be used for team collaboration?",
    answer:
      "Yes. Canva supports team collaboration, shared designs, admin controls, approvals, brand kits, and content management features on selected paid business, enterprise, education, and campus plans.",
  },
  {
    question: "Are Canva prices fixed worldwide?",
    answer:
      "No. Canva prices may vary by country, currency, billing cycle, taxes, eligibility, and Canva's latest pricing policies. Users should check Canva's official pricing page before purchasing.",
  },
];

const PRICING_PLANS = [
  {
    name: "Free",
    type: "Individual",
    priceLabel: "$0/year",
    billing: "Yearly",
    userLimit: "One person",
    description: "Design anything and bring your ideas to life. No cost, just creativity.",
    features: [
      "Easy drag-and-drop editor and 1,000+ design types",
      "1.6M+ templates to start fast",
      "4.7M+ photos, videos, graphics, and audio",
      "1 Brand Kit with 3 colors only",
      "Ad insights and AI ad creation where available",
      "Access to Affinity",
      "5GB cloud storage",
      "AI allowance",
      "Up to 200 Standard AI uses or 20 Premium AI uses, subject to Canva's terms",
      "Canva Offline",
      "Magic Layers trial where available",
    ],
  },
  {
    name: "Pro",
    type: "Individual",
    monthlyPrice: "US$15/month",
    yearlyPrice: "US$120/year",
    billing: "Monthly and yearly",
    userLimit: "One person",
    description: "Unlock premium content, more powerful design tools, and AI features.",
    features: [
      "Premium tools such as resize, translate, and remove background",
      "3.6M+ templates including premium templates",
      "141M+ premium photos, videos, graphics, and audio",
      "5 Brand Kits",
      "Social content scheduling",
      "Ad insights and AI ad creation where available",
      "Access to Affinity with AI where available",
      "100GB cloud storage",
      "AI allowance",
      "10x more AI than Canva Free, including Standard, Premium, or Ultra AI where available",
      "AI Pass add-on available at extra cost",
      "Canva AI 2.0",
      "Canva AI connectors",
      "Components",
      "Canva Offline",
      "Magic Layers where available",
    ],
  },
  {
    name: "Business",
    type: "Business / Team",
    monthlyPrice: "US$21/month per person",
    yearlyPrice: "US$210/year per person",
    billing: "Monthly and yearly",
    userLimit: "Per person",
    description: "Create content faster, market smarter, and grow your business with advanced tools.",
    features: [
      "Collaboration and team admin tools",
      "3.6M+ templates including premium templates",
      "141M+ premium photos, videos, graphics, and audio",
      "100 Brand Kits and approvals",
      "Ad insights and AI ad creation where available",
      "Access to Affinity with AI where available",
      "Access to Leonardo.Ai and Flourish",
      "10% discount on print orders where available",
      "500GB cloud storage",
      "AI allowance",
      "20x more AI than Canva Free, including Standard, Premium, or Ultra AI where available",
      "AI Pass add-on available at extra cost",
      "Canva AI 2.0",
      "Canva AI connectors",
      "Components",
      "Canva Offline",
      "Magic Layers where available",
    ],
  },
  {
    name: "Enterprise",
    type: "Enterprise",
    priceLabel: "Custom pricing",
    ctaText: "Let's talk",
    description: "Empower your organization with end-to-end visual communication.",
    features: [
      "Enterprise-level security and controls",
      "SSO and SCIM provisioning",
      "Custom apps",
      "1000 Brand Kits with tiered approvals and multi-team management",
      "Ad insights and AI ad creation where available",
      "Access to Affinity with AI where available",
      "Access to Leonardo.Ai and Flourish",
      "Priority support and dedicated success manager where available",
      "10% discount on print orders where available",
      "1TB cloud storage",
      "AI allowance",
      "20x more AI than Canva Free, including Standard, Premium, or Ultra AI where available",
      "Canva AI 2.0 marked as soon/where available",
      "Canva AI connectors marked as soon/where available",
      "Components",
      "Canva Offline",
      "Magic Layers where available",
    ],
  },
  {
    name: "Canva Education for Teachers",
    type: "Education",
    priceLabel: "Free",
    eligibility: "Eligible K-12 teachers and their students",
    description: "100% free, easy-to-use learning platform for every K-12 classroom.",
    features: [
      "100M+ copyright-free images, videos, audio, animations, and more",
      "Thousands of templates, lessons, and resources for every subject and grade",
      "AI tools to boost creativity, productivity, and engagement where available",
      "Access to premium features such as Magic Resize",
      "Build interactive experiences with AI where available",
      "Assignment hub to manage and review classwork",
      "Certification courses from Design School",
      "LMS integrations including Google Classroom, Microsoft Teams, Canvas, Schoology, D2L, and more",
      "1TB secure cloud storage",
      "FERPA and COPPA certified",
      "GDPR-compliant with safe-for-school content",
      "Learn Grid",
      "Components",
      "Canva Offline",
      "Magic Layers where available",
    ],
  },
  {
    name: "Canva Education for Schools and Districts",
    type: "Education",
    priceLabel: "Free",
    eligibility: "Eligible K-12 teachers, students, schools, and districts",
    description: "Scalable, secure, and 100% free for K-12 schools and districts.",
    features: [
      "Access to Canva Education's premium features",
      "District-wide deployment with SSO and LMS integrations",
      "Manage accounts with role and student permissions",
      "Centralized admin controls, reporting, and audit logs",
      "Professional learning resources and customer support for schools",
      "Collaboration and content management for all staff",
      "Brand Kits to create consistent school-wide communication",
      "Access to Affinity with AI where available",
      "FERPA and COPPA certified",
      "GDPR-compliant with safe-for-school content",
      "Learn Grid",
      "Components",
      "Canva Offline",
      "Magic Layers where available",
    ],
  },
  {
    name: "Canva Campus",
    type: "Higher Education",
    priceLabel: "Custom pricing",
    ctaText: "Let's talk",
    description: "Empower your campus community to create, collaborate, and communicate at scale.",
    features: [
      "Premium Canva access for every student",
      "Enterprise access for staff and faculty",
      "1000 Brand Kits for schools, departments, and teams",
      "Campus-wide rollout with SSO",
      "Centralized admin controls, reporting, and AI audit logs",
      "ISO 27001 and SOC 2 Type II compliance",
      "Priority support and dedicated success manager where available",
      "Top LMS integrations for coursework",
      "Access to Affinity with AI where available",
      "Access to Leonardo.Ai and Flourish where available",
      "Canva AI 2.0 marked as soon/where available",
      "Canva AI connectors marked as soon/where available",
      "Components",
      "Canva Offline",
      "Magic Layers where available",
    ],
  },
];

const toBulletList = (items: string[]) =>
  items.map((item) => `- ${item}`).join(MULTILINE_SEPARATOR);

const toSection = (title: string, items: string[]) =>
  [title, ...items.map((item) => `- ${item}`)].join(MULTILINE_SEPARATOR);

const buildBodyHtml = () => {
  const officialLinksHtml = [
    ["Official website", WEBSITE_URL],
    ["Features", FEATURE_URL],
    ["Pricing", PRICING_URL],
    ["Canva Pro", PRO_URL],
    ["Canva Business", BUSINESS_URL],
    ["Canva Enterprise", ENTERPRISE_URL],
    ["Canva Education", EDUCATION_URL],
    ["Canva Campus", CAMPUS_URL],
  ]
    .map(
      ([label, url]) =>
        `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a></li>`
    )
    .join("");

  const faqHtml = FAQS.map(
    (item) =>
      `<li><strong>${escapeHtml(item.question)}</strong><br>${escapeHtml(item.answer)}</li>`
  ).join("");

  const planSummaryHtml = PRICING_PLANS.map((plan) => {
    const pricingBits = [
      plan.priceLabel ? `Price: ${plan.priceLabel}` : "",
      plan.monthlyPrice ? `Monthly: ${plan.monthlyPrice}` : "",
      plan.yearlyPrice ? `Yearly: ${plan.yearlyPrice}` : "",
      plan.billing ? `Billing: ${plan.billing}` : "",
      plan.userLimit ? `User limit: ${plan.userLimit}` : "",
      plan.eligibility ? `Eligibility: ${plan.eligibility}` : "",
      plan.ctaText ? `CTA: ${plan.ctaText}` : "",
    ].filter(Boolean);

    return `<li><strong>${escapeHtml(plan.name)}</strong> (${escapeHtml(plan.type)}) - ${escapeHtml(
      plan.description
    )}<br>${escapeHtml(pricingBits.join(" | "))}</li>`;
  }).join("");

  return [
    `<h2>${escapeHtml(FULL_NAME)}</h2>`,
    `<p>${escapeHtml(SHORT_DESCRIPTION)}</p>`,
    `<p>${escapeHtml(LONG_DESCRIPTION)}</p>`,
    `<p>${escapeHtml(LONG_DESCRIPTION_2)}</p>`,
    `<p>${escapeHtml(LONG_DESCRIPTION_3)}</p>`,
    `<p>${escapeHtml(LONG_DESCRIPTION_4)}</p>`,
    "<h3>Category</h3>",
    `<p><strong>Main category:</strong> ${escapeHtml(CATEGORY)}</p>`,
    `<p><strong>Secondary categories:</strong> ${escapeHtml(SECONDARY_CATEGORIES.join(", "))}</p>`,
    "<h3>Target Users</h3>",
    `<ul>${TARGET_USERS.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`,
    "<h3>Use Cases</h3>",
    `<ul>${USE_CASES.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`,
    "<h3>Key Features</h3>",
    `<ul>${KEY_FEATURES.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`,
    "<h3>Plan Overview</h3>",
    `<ul>${planSummaryHtml}</ul>`,
    "<h3>Plan Comparison Summary</h3>",
    `<ul>${COMPARISON_SUMMARY.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`,
    "<h3>Best For</h3>",
    `<ul>${BEST_FOR.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`,
    "<h3>Not Ideal For</h3>",
    `<ul>${NOT_IDEAL_FOR.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`,
    "<h3>Official Links</h3>",
    `<ul>${officialLinksHtml}</ul>`,
    "<h3>Important Notes</h3>",
    `<p>${escapeHtml(PRICING_DISCLAIMER)}</p>`,
    `<p>${escapeHtml(AI_DISCLAIMER)}</p>`,
    "<h3>FAQ</h3>",
    `<ul>${faqHtml}</ul>`,
  ].join("");
};

const buildFeaturesText = () =>
  [
    toSection("Full product name", [FULL_NAME]),
    toSection("Short description", [SHORT_DESCRIPTION]),
    toSection("Category", [CATEGORY]),
    toSection("Secondary categories", SECONDARY_CATEGORIES),
    toSection("Target users", TARGET_USERS),
    toSection("Use cases", USE_CASES),
    toSection("Key features", KEY_FEATURES),
    toSection("Official links", [
      `Website: ${WEBSITE_URL}`,
      `Features: ${FEATURE_URL}`,
      `Pricing: ${PRICING_URL}`,
      `Pro: ${PRO_URL}`,
      `Business: ${BUSINESS_URL}`,
      `Enterprise: ${ENTERPRISE_URL}`,
      `Education: ${EDUCATION_URL}`,
      `Campus: ${CAMPUS_URL}`,
    ]),
    toSection("Important notes", [PRICING_DISCLAIMER, AI_DISCLAIMER]),
  ].join(MULTILINE_SEPARATOR + MULTILINE_SEPARATOR);

const buildPlansText = () =>
  [
    ...PRICING_PLANS.map((plan) =>
      [
        `${plan.name} (${plan.type})`,
        ...(plan.priceLabel ? [`Price: ${plan.priceLabel}`] : []),
        ...(plan.monthlyPrice ? [`Monthly price: ${plan.monthlyPrice}`] : []),
        ...(plan.yearlyPrice ? [`Yearly price: ${plan.yearlyPrice}`] : []),
        ...(plan.billing ? [`Billing: ${plan.billing}`] : []),
        ...(plan.userLimit ? [`User limit: ${plan.userLimit}`] : []),
        ...(plan.eligibility ? [`Eligibility: ${plan.eligibility}`] : []),
        ...(plan.ctaText ? [`CTA text: ${plan.ctaText}`] : []),
        `Description: ${plan.description}`,
        ...plan.features.map((feature) => `- ${feature}`),
      ].join(MULTILINE_SEPARATOR)
    ),
    "",
    "Comparison summary",
    ...COMPARISON_SUMMARY.map((item) => `- ${item}`),
    "",
    `Pricing disclaimer: ${PRICING_DISCLAIMER}`,
    `AI note: ${AI_DISCLAIMER}`,
  ].join(MULTILINE_SEPARATOR + MULTILINE_SEPARATOR);

const buildProsConsText = () =>
  [
    toSection("Pros", PROS),
    toSection("Cons", CONS),
    toSection("Best for", BEST_FOR),
    toSection("Not ideal for", NOT_IDEAL_FOR),
  ].join(MULTILINE_SEPARATOR + MULTILINE_SEPARATOR);

const buildSourceRecords = () =>
  [
    { label: "Main features page", url: FEATURE_URL },
    { label: "Pricing page", url: PRICING_URL },
    { label: "Canva Pro page", url: PRO_URL },
    { label: "Canva Business page", url: BUSINESS_URL },
    { label: "Canva Enterprise page", url: ENTERPRISE_URL },
    { label: "Canva Education page", url: EDUCATION_URL },
    { label: "Canva Campus page", url: CAMPUS_URL },
  ];

const buildVendorFeatures = () =>
  KEY_FEATURES.map((feature) => ({
    name: feature,
    description: "",
  }));

const buildVendorPlans = () =>
  PRICING_PLANS.map((plan) => ({
    name: plan.name,
    type: plan.type,
    introPrice: plan.priceLabel ?? plan.monthlyPrice ?? "",
    introTerm: plan.billing ?? "",
    renewalPrice: plan.yearlyPrice ?? "",
    renewalTerm: plan.priceLabel ? "" : "Yearly",
    description: plan.description,
    userLimit: plan.userLimit ?? "",
    eligibility: plan.eligibility ?? "",
    ctaText: plan.ctaText ?? "",
    features: plan.features,
    customFields: [
      "Billing",
      "User limit",
      "Eligibility",
      "CTA text",
      "Pricing note",
    ],
    customValues: [
      plan.billing ?? "Not specified",
      plan.userLimit ?? "Not specified",
      plan.eligibility ?? "Not specified",
      plan.ctaText ?? "Not specified",
      PRICING_DISCLAIMER,
    ],
  }));

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const updateFirestoreMirrors = async (
  productHandle: string | null,
  currentMetafields: Record<string, unknown>
) => {
  const productCollection = firestore.collection("products");
  const docMap = new Map<string, FirebaseFirestore.DocumentSnapshot>();

  const directDoc = await productCollection.doc(String(SHOPIFY_PRODUCT_ID)).get();
  if (directDoc.exists) {
    docMap.set(directDoc.id, directDoc);
  }

  const fieldQueries = await Promise.all([
    productCollection.where("shopify.productId", "==", SHOPIFY_PRODUCT_ID).get(),
    productCollection.where("shopify.identifiers.productId", "==", SHOPIFY_PRODUCT_ID).get(),
    productCollection.where("shopifyProductId", "==", SHOPIFY_PRODUCT_ID).get(),
  ]);

  fieldQueries.forEach((snapshot) => {
    snapshot.docs.forEach((doc) => {
      docMap.set(doc.id, doc);
    });
  });

  const docs = Array.from(docMap.values());
  if (docs.length === 0) {
    return [];
  }

  const plans = buildVendorPlans();
  const features = buildVendorFeatures();
  const sourceRecords = buildSourceRecords();
  const updates: string[] = [];

  for (const doc of docs) {
    const existing = (doc.data() ?? {}) as Record<string, any>;
    const existingVendor = existing.vendor ?? {};
    const existingVendorBasic = existingVendor.basic ?? {};
    const existingVendorPricing = existingVendor.pricing ?? {};
    const existingShopify = existing.shopify ?? {};
    const existingShopifyProduct = existingShopify.product ?? {};
    const existingShopifyData = existingShopify.shopifyData ?? {};
    const existingShopifyMetafields = existingShopifyData.metafields ?? {};

    await doc.ref.set(
      {
        basic: {
          productName: TITLE,
          category: CATEGORY,
          description: SHORT_DESCRIPTION,
        },
        pricing: {
          selectedPlan: "Free",
          price: 0,
          plans,
        },
        features,
        vendor: {
          basic: {
            ...existingVendorBasic,
            productName: TITLE,
            category: CATEGORY,
            categoryName: CATEGORY,
            description: SHORT_DESCRIPTION,
            keywords: SEO_KEYWORDS,
            demoLink: WEBSITE_URL,
            officialWebsite: WEBSITE_URL,
            officialUrls: OFFICIAL_URLS,
            sourceUrls: sourceRecords.map((source) => source.url),
          },
          features,
          pricing: {
            ...existingVendorPricing,
            selectedPlan: "Free",
            price: 0,
            affiliateUrl: WEBSITE_URL,
            plans,
            pricingDisclaimer: PRICING_DISCLAIMER,
          },
          metadata: {
            ...(existingVendor.metadata ?? {}),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            sources: sourceRecords,
          },
        },
        shopify: {
          productId: SHOPIFY_PRODUCT_ID,
          handle:
            existingShopify.handle ??
            existingShopify.identifiers?.handle ??
            productHandle,
          product: {
            ...existingShopifyProduct,
            title: TITLE,
            handle:
              existingShopifyProduct.handle ??
              existingShopify.handle ??
              existingShopify.identifiers?.handle ??
              productHandle,
            descriptionHtml: buildBodyHtml(),
            category: CATEGORY,
            productType: CATEGORY,
            tags: TAGS,
            vendor: existingShopifyProduct.vendor ?? "",
          },
          shopifyData: {
            ...existingShopifyData,
            seo: {
              title: SEO_TITLE,
              description: SEO_DESCRIPTION,
            },
            metafields: {
              ...existingShopifyMetafields,
              ...currentMetafields,
            },
          },
          identifiers: {
            ...(existingShopify.identifiers ?? {}),
            productId: SHOPIFY_PRODUCT_ID,
            handle:
              existingShopify.identifiers?.handle ??
              existingShopify.handle ??
              productHandle,
            shopifyProductURL:
              existingShopify.identifiers?.shopifyProductURL ??
              (productHandle ? `https://www.itmart24.com/products/${productHandle}` : null),
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    updates.push(doc.id);
  }

  return updates;
};

const main = async () => {
  const getResponse = await shopifyRest.get(`/products/${SHOPIFY_PRODUCT_ID}.json`);
  const product = getResponse.data?.product;

  if (!product?.id) {
    throw new Error(`Shopify product ${SHOPIFY_PRODUCT_ID} was not found.`);
  }

  const productHandle =
    typeof product.handle === "string" && product.handle.trim() ? product.handle.trim() : "canva";

  await shopifyRest.put(`/products/${SHOPIFY_PRODUCT_ID}.json`, {
    product: {
      id: SHOPIFY_PRODUCT_ID,
      title: TITLE,
      handle: productHandle,
      body_html: buildBodyHtml(),
      product_type: CATEGORY,
      tags: TAGS.join(", "),
      metafields_global_title_tag: SEO_TITLE,
      metafields_global_description_tag: SEO_DESCRIPTION,
    },
  });

  const metafieldsPayload = {
    short_description: SHORT_DESCRIPTION,
    summary: SHORT_DESCRIPTION,
    full_name: FULL_NAME,
    product_features: buildFeaturesText(),
    plans_pricing: buildPlansText(),
    pros_cons: buildProsConsText(),
    pricing_disclaimer: PRICING_DISCLAIMER,
    ai_note: AI_DISCLAIMER,
    official_urls: JSON.stringify(OFFICIAL_URLS),
    sources: JSON.stringify(buildSourceRecords()),
    pricing_plans: JSON.stringify(PRICING_PLANS),
    faq: JSON.stringify(FAQS),
    target_users: JSON.stringify(TARGET_USERS),
    use_cases: JSON.stringify(USE_CASES),
    comparison_summary: JSON.stringify(COMPARISON_SUMMARY),
    best_for: JSON.stringify(BEST_FOR),
    not_ideal_for: JSON.stringify(NOT_IDEAL_FOR),
  };

  await setCustomProductMetafields({
    shopifyProductId: SHOPIFY_PRODUCT_ID,
    metafields: [
      { key: "custom", type: "url", value: WEBSITE_URL },
      { key: "short_description", type: "multi_line_text_field", value: SHORT_DESCRIPTION },
      { key: "summary", type: "multi_line_text_field", value: SHORT_DESCRIPTION },
      { key: "full_name", type: "single_line_text_field", value: FULL_NAME },
      { key: "type_multiple", type: "list.single_line_text_field", value: JSON.stringify(SECONDARY_CATEGORIES) },
      { key: "keywords", type: "list.single_line_text_field", value: JSON.stringify(SEO_KEYWORDS) },
      { key: "product_features", type: "multi_line_text_field", value: buildFeaturesText() },
      { key: "plans_pricing", type: "multi_line_text_field", value: buildPlansText() },
      { key: "pros_cons", type: "multi_line_text_field", value: buildProsConsText() },
      { key: "pricing_disclaimer", type: "multi_line_text_field", value: PRICING_DISCLAIMER },
      { key: "ai_note", type: "multi_line_text_field", value: AI_DISCLAIMER },
      { key: "official_urls", type: "json", value: JSON.stringify(OFFICIAL_URLS) },
      { key: "sources", type: "json", value: JSON.stringify(buildSourceRecords()) },
      { key: "pricing_plans", type: "json", value: JSON.stringify(PRICING_PLANS) },
      { key: "faq", type: "json", value: JSON.stringify(FAQS) },
      { key: "target_users", type: "json", value: JSON.stringify(TARGET_USERS) },
      { key: "use_cases", type: "json", value: JSON.stringify(USE_CASES) },
      { key: "comparison_summary", type: "json", value: JSON.stringify(COMPARISON_SUMMARY) },
      { key: "best_for", type: "json", value: JSON.stringify(BEST_FOR) },
      { key: "not_ideal_for", type: "json", value: JSON.stringify(NOT_IDEAL_FOR) },
    ],
  });

  const firestoreDocs = await updateFirestoreMirrors(productHandle, metafieldsPayload);

  console.log(`Updated Shopify product ${SHOPIFY_PRODUCT_ID} (${productHandle}).`);
  console.log(`Preserved handle: ${productHandle}`);
  console.log(`Updated tags count: ${TAGS.length}`);
  console.log(`Updated secondary categories count: ${SECONDARY_CATEGORIES.length}`);
  console.log(`Updated plan count: ${PRICING_PLANS.length}`);
  console.log(
    firestoreDocs.length > 0
      ? `Updated Firestore mirror documents: ${firestoreDocs.join(", ")}`
      : "No Firestore mirror document matched this Shopify product ID."
  );
};

main().catch((error) => {
  console.error("Canva product update failed:", error);
  process.exitCode = 1;
});
