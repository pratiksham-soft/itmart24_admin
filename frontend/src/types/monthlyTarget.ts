export interface MonthlyAchievement {
  revenue: number;
  subscriptions: number;
  vendorOnboarding: number;
}

export interface MonthlyTargetBaseline extends MonthlyAchievement {
  month: string;
  label: string;
}

export interface MonthlyTargetSuggested {
  targetRevenue: number;
  targetSubscriptions: number;
  targetVendorOnboarding: number;
}

export interface MonthlyTargetRecommendation {
  month: string;
  label: string;
  baseline: MonthlyTargetBaseline;
  suggested: MonthlyTargetSuggested;
  actual: MonthlyAchievement;
}

export interface MonthlyTargetRecord {
  id: string;
  month: string;
  label: string;
  targetRevenue: number;
  targetSubscriptions: number;
  targetVendorOnboarding: number;
  remarks: string;
  status: string;
  baseline: {
    month: string;
    revenue: number;
    subscriptions: number;
    vendorOnboarding: number;
  };
  suggested: MonthlyTargetSuggested;
  manualOverride: boolean;
  actual: MonthlyAchievement;
  progressPct: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}
