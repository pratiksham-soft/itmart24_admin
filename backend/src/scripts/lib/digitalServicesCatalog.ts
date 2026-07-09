export type DigitalServicesFinalCategory = {
  name: string;
  slug: string;
};

export type DigitalServicesSubcategory = {
  name: string;
  slug: string;
  finalCategories: DigitalServicesFinalCategory[];
};

export type DigitalServicesMainCategory = {
  name: string;
  slug: string;
  subcategories: DigitalServicesSubcategory[];
};

export const slugifyCategoryName = (value: string) =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/\//g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

export const DIGITAL_SERVICES_CATEGORY: DigitalServicesMainCategory = {
  name: "Digital Services",
  slug: "digital-services",
  subcategories: [
    {
      name: "Digital Marketing Services",
      slug: "digital-marketing-services",
      finalCategories: [
        "SEO Services",
        "Local SEO & Google Business Profile",
        "AI Visibility Optimization",
        "Performance Marketing",
        "Social Media Marketing",
        "Content Marketing",
        "Email Marketing",
        "Influencer Marketing",
        "Marketplace Marketing",
        "Conversion Rate Optimization",
        "Competitor Research & Strategy",
        "Landing Page Optimization",
        "Paid Ads Management",
        "Marketing Analytics & Reporting",
        "Online PR & Digital PR",
        "Affiliate Marketing",
      ].map((name) => ({ name, slug: slugifyCategoryName(name) })),
    },
    {
      name: "Web Design & Development Services",
      slug: "web-design-development-services",
      finalCategories: [
        "Website Design",
        "Website Development",
        "E-commerce Development",
        "Web App Development",
        "CMS Development",
        "Website Maintenance",
        "API & Integration",
        "WordPress Development",
        "Shopify Development",
        "Landing Page Development",
        "Website Speed Optimization",
      ].map((name) => ({ name, slug: slugifyCategoryName(name) })),
    },
    {
      name: "Designing & Creative Services",
      slug: "designing-creative-services",
      finalCategories: [
        "Graphic Design",
        "Logo & Brand Identity",
        "UI/UX Design",
        "Video Design",
        "Presentation Design",
        "Packaging Design",
        "Illustration Services",
        "Ad Creative Design",
        "Social Media Creatives",
        "Motion Graphics",
      ].map((name) => ({ name, slug: slugifyCategoryName(name) })),
    },
    {
      name: "App Development Services",
      slug: "app-development-services",
      finalCategories: [
        "Mobile App Development",
        "Cross-Platform Apps",
        "Business Apps",
        "App Maintenance",
        "App Publishing",
        "Android App Development",
        "iOS App Development",
        "App UI/UX Design",
      ].map((name) => ({ name, slug: slugifyCategoryName(name) })),
    },
    {
      name: "AI & Automation Services",
      slug: "ai-automation-services",
      finalCategories: [
        "AI Chatbot Services",
        "AI Automation",
        "AI Content Services",
        "AI Integration",
        "No-Code Automation",
        "AI Agent Development",
        "AI Workflow Automation",
        "AI Voicebot Services",
        "AI Lead Qualification Bots",
        "RPA Automation",
      ].map((name) => ({ name, slug: slugifyCategoryName(name) })),
    },
    {
      name: "Business Software & IT Services",
      slug: "business-software-it-services",
      finalCategories: [
        "CRM Services",
        "ERP Services",
        "POS Services",
        "HRMS Services",
        "Accounting Software Services",
        "Custom Software Development",
        "SaaS Development",
        "Inventory Management Software",
        "Billing & Invoice Software",
        "Software Maintenance & Support",
      ].map((name) => ({ name, slug: slugifyCategoryName(name) })),
    },
    {
      name: "Cloud, Hosting & DevOps Services",
      slug: "cloud-hosting-devops-services",
      finalCategories: [
        "Cloud Setup",
        "Server Management",
        "DevOps Services",
        "Website Migration",
        "Backup Services",
        "Security Setup",
        "Cloud Migration",
        "AWS Services",
        "Azure Services",
        "Google Cloud Services",
        "CI/CD Pipeline Setup",
      ].map((name) => ({ name, slug: slugifyCategoryName(name) })),
    },
    {
      name: "Cybersecurity Services",
      slug: "cybersecurity-services",
      finalCategories: [
        "Website Security",
        "Security Testing",
        "Compliance Services",
        "Email Security",
        "App Security",
        "Vulnerability Assessment",
        "Penetration Testing",
        "Malware Removal",
        "SSL & Website Hardening",
      ].map((name) => ({ name, slug: slugifyCategoryName(name) })),
    },
    {
      name: "Data & Analytics Services",
      slug: "data-analytics-services",
      finalCategories: [
        "Analytics Setup",
        "Dashboard Services",
        "Data Services",
        "Business Intelligence",
        "Tracking Setup",
        "Google Analytics 4 Setup",
        "Looker Studio Dashboards",
        "Data Visualization",
        "Marketing Attribution Tracking",
      ].map((name) => ({ name, slug: slugifyCategoryName(name) })),
    },
    {
      name: "Branding & Business Growth Services",
      slug: "branding-business-growth-services",
      finalCategories: [
        "Branding Services",
        "Startup Services",
        "Lead Generation",
        "Sales Enablement",
        "Online Reputation",
        "Go-To-Market Strategy",
        "Pitch Deck Design",
        "Business Consulting",
        "Public Relations",
      ].map((name) => ({ name, slug: slugifyCategoryName(name) })),
    },
  ],
};

export const DIGITAL_SERVICES_FINAL_CATEGORIES =
  DIGITAL_SERVICES_CATEGORY.subcategories.flatMap((subcategory) =>
    subcategory.finalCategories.map((finalCategory) => ({
      subcategoryName: subcategory.name,
      subcategorySlug: subcategory.slug,
      ...finalCategory,
    }))
  );
