import {
  createUserPortalPlan,
  getUserPortalPlanById,
  updateUserPortalPlan,
  UserPlanFeature,
  UserPlanPeriod,
  UserPlanProjectKey,
} from "../services/userPortalPlans.service";

type SeedPlan = {
  id: string;
  projectKey: UserPlanProjectKey;
  name: string;
  slug: string;
  description: string;
  periods: UserPlanPeriod[];
  features: UserPlanFeature[];
  isActive: boolean;
  sortOrder: number;
};

const basicFeatures: UserPlanFeature[] = [
  "1 project",
  "50 URL checks per month",
  "3 full project analysis reports per month",
  "Website health check",
  "Speed and mobile experience check",
  "Basic SEO checker",
  "Security and trust check",
  "Sitemap and robots.txt check",
  "Basic broken link check",
  "Up to 2 competitors per comparison",
  "Basic content gap suggestions",
  "1 AI Project Growth Plan per month",
  "7-day and 30-day action plan",
  "Suggested tool/service categories",
  "Exportable report",
  "Last 5 reports history",
].map((title) => ({ title, description: "" }));

const enterpriseFeatures: UserPlanFeature[] = [
  "Up to 10 projects",
  "1,000 URL checks per month",
  "50 full project analysis reports per month",
  "Advanced website health analysis",
  "Advanced SEO, speed, mobile, accessibility, and security checks",
  "Advanced competitor comparison",
  "Up to 5 competitors per comparison",
  "Content gap analyzer",
  "Trust and conversion gap analyzer",
  "AI Project Growth Advisor",
  "20 AI growth plans per month",
  "7-day, 30-day, and 90-day growth roadmap",
  "Google Search Console insights when connected",
  "Advanced monitoring suggestions",
  "ITMart24 tool/service recommendations",
  "Professional export reports",
  "Full report history",
  "Priority analysis processing",
  "Suitable for agency/client use",
].map((title) => ({ title, description: "" }));

const seedPlans: SeedPlan[] = [
  {
    id: "basic",
    projectKey: "user-portal",
    name: "Basic",
    slug: "basic",
    description:
      "Essential project analysis for individuals and small website owners.",
    periods: [
      {
        id: "monthly-1-1",
        label: "Monthly",
        durationInMonths: 1,
        price: 2.99,
        discountPercentage: 0,
        countryPricing: [
          {
            id: "india-inr-1",
            countryCode: "IN",
            countryName: "India",
            currencyCode: "INR",
            price: 287,
            discountPercentage: 0,
          },
        ],
      },
      {
        id: "yearly-12-2",
        label: "Yearly",
        durationInMonths: 12,
        price: 35.88,
        discountPercentage: 50,
        countryPricing: [
          {
            id: "india-inr-1",
            countryCode: "IN",
            countryName: "India",
            currencyCode: "INR",
            price: 3444,
            discountPercentage: 50,
          },
        ],
      },
    ],
    features: basicFeatures,
    isActive: true,
    sortOrder: 1,
  },
  {
    id: "enterprise",
    projectKey: "user-portal",
    name: "Enterprise",
    slug: "enterprise",
    description:
      "Advanced project growth analysis for serious websites, startups, agencies, SaaS projects, and digital businesses.",
    periods: [
      {
        id: "monthly-1-1",
        label: "Monthly",
        durationInMonths: 1,
        price: 9.99,
        discountPercentage: 0,
        countryPricing: [
          {
            id: "india-inr-1",
            countryCode: "IN",
            countryName: "India",
            currencyCode: "INR",
            price: 959,
            discountPercentage: 0,
          },
        ],
      },
      {
        id: "yearly-12-2",
        label: "Yearly",
        durationInMonths: 12,
        price: 119.88,
        discountPercentage: 50,
        countryPricing: [
          {
            id: "india-inr-1",
            countryCode: "IN",
            countryName: "India",
            currencyCode: "INR",
            price: 11508,
            discountPercentage: 50,
          },
        ],
      },
    ],
    features: enterpriseFeatures,
    isActive: true,
    sortOrder: 2,
  },
];

async function main() {
  for (const plan of seedPlans) {
    const existing = await getUserPortalPlanById(plan.id);

    if (existing) {
      await updateUserPortalPlan(plan.id, plan);
      console.log(`Updated user plan: ${plan.name}`);
      continue;
    }

    await createUserPortalPlan(plan);
    console.log(`Created user plan: ${plan.name}`);
  }
}

void main()
  .then(() => {
    console.log("User portal plans upsert complete.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("User portal plans upsert failed:", error);
    process.exit(1);
  });
