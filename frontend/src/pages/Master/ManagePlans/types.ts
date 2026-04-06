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

export type SubscriptionPlan = {
  id?: string;
  name: string;
  slug: string;
  periods: PlanPeriod[];
  features: PlanFeature[];
  isActive: boolean;
  createdAt?: any;
  updatedAt?: any;
};
