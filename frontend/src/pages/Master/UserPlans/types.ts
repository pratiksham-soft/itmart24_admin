export type CountryPricing = {
  id: string;
  countryCode?: string;
  countryName: string;
  currencyCode: string;
  price: number;
  discountPercentage?: number;
};

export type PlanPeriod = {
  id: string;
  label: string;
  durationInMonths: number;
  price: number;
  discountPercentage?: number;
  countryPricing?: CountryPricing[];
};

export type PlanFeature = {
  title: string;
  description: string;
};

export type SubscriptionPlan = {
  id?: string;
  name: string;
  slug: string;
  description: string;
  periods: PlanPeriod[];
  features: PlanFeature[];
  isActive: boolean;
  sortOrder?: number;
  createdAt?: any;
  updatedAt?: any;
};

export type OneTimeReportToolKey =
  | "seo_health"
  | "competitor_comparison"
  | "ai_analysis";

export type OneTimeReportPlan = {
  id?: string;
  toolKey: OneTimeReportToolKey;
  planKey: string;
  displayName: string;
  fallbackPriceUsd: number;
  priceInr: number;
  taxInclusive: boolean;
  sortOrder: number;
  badgeLabel?: string | null;
  summaryLine: string;
  publicFeatures: string[];
  maxCompetitors: number;
  pdfExportEnabled: boolean;
  isActive: boolean;
  countryPricing: CountryPricing[];
  createdAt?: any;
  updatedAt?: any;
};
