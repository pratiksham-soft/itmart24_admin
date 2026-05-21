export type PlanPeriod = {
  id: string;
  label: string;
  durationInMonths: number;
  price: number;
};

export type PlanFeature = {
  title: string;
  description: string;
};

export type PortfolioPlanPricingOption = {
  id: string;
  periodInMonths: number;
  price: number;
  durationUnitName: string;
};

export type PortfolioPlan = {
  id: string;
  basePlanId: string;
  basePlanName: string;
  title: string;
  minProducts: number;
  maxProducts: number;
  pricingOptions: PortfolioPlanPricingOption[];
  isActive: boolean;
  sortOrder: number;
  createdAt?: any;
  updatedAt?: any;
};

export type SubscriptionPlan = {
  id?: string;
  name: string;
  slug: string;
  periods: PlanPeriod[];
  features: PlanFeature[];
  isActive: boolean;
  sortOrder?: number;
  portfolioPlans?: PortfolioPlan[];
  createdAt?: any;
  updatedAt?: any;
};
