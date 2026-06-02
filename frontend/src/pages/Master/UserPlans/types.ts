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
