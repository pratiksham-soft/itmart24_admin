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

export type PortfolioPlanPricingOption = {
  id: string;
  periodInMonths: number;
  price: number;
  durationUnitName: string;
  discountPercentage?: number;
  countryPricing?: CountryPricing[];
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

export type PromoScope = "subscription" | "portfolio";
export type PromoDiscountType = "fixed_price" | "amount_off" | "percent_off";
export type PromoMarketScope = "all" | "country";

export type PlanPromoCode = {
  id: number;
  code: string;
  offerName: string;
  description: string | null;
  promoScope: PromoScope;
  active: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  maxUsesPerVendor: number;
  allowedTopCategories: string[] | null;
  allowedSubCategories: string[] | null;
  allowedFinalCategories: string[] | null;
  applicablePlanId: string | null;
  applicablePlanName: string | null;
  applicablePlanSlug: string | null;
  applicablePortfolioPlanId: string | null;
  applicablePortfolioPlanTitle: string | null;
  applicableBillingCycle: string | null;
  applicablePeriodId: string | null;
  applicablePeriodLabel: string | null;
  applicableDurationMonths: number | null;
  applicableMarketScope: PromoMarketScope;
  applicableCountryCode: string | null;
  applicableCountryName: string | null;
  discountType: PromoDiscountType;
  discountValue: number;
  discountedPrice: number | null;
  currency: string;
  durationDays: number | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};
