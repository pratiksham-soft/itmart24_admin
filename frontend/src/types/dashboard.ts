export interface DashboardSummary {
  totalVendors: number;
  activeVendors: number;
  pendingVendors: number;
  rejectedVendors: number;
  vendorsWithIncompleteDocuments: number;
  totalSubscriptions: number;
  activeSubscriptions: number;
  pendingSubscriptions: number;
  inactiveSubscriptions: number;
  totalRevenue: number;
  currentMonthRevenue: number;
  previousMonthRevenue: number;
  todayRevenue: number;
  totalPaidInvoices: number;
  pendingPaymentSubscriptions: number;
  currentMonthNewVendors: number;
  previousMonthNewVendors: number;
  currentMonthNewSubscriptions: number;
  previousMonthNewSubscriptions: number;
}

export interface DashboardPlanBreakdown {
  planId: string;
  planName: string;
  total: number;
  active: number;
  pending: number;
  inactive: number;
  revenue: number;
}

export interface DashboardMonthlyTrend {
  month: string;
  label: string;
  revenue: number;
  subscriptions: number;
  vendors: number;
}

export interface DashboardCountryDistribution {
  country: string;
  count: number;
  share: number;
}

export interface DashboardRecentActivity {
  id: string;
  vendorName: string;
  country: string;
  planName: string;
  amount: number;
  status: string;
  paymentStatus: string;
  productName: string;
  createdAt: string | null;
}

export interface DashboardMonthlyTarget {
  month: string;
  label: string;
  status: string;
  isSuggested: boolean;
  remarks: string;
  targetRevenue: number;
  targetSubscriptions: number;
  targetVendorOnboarding: number;
  actualRevenue: number;
  actualSubscriptions: number;
  actualVendorOnboarding: number;
  progressPct: number;
}

export interface DashboardGrowth {
  vendorGrowthPct: number;
  subscriptionGrowthPct: number;
  revenueGrowthPct: number;
}

export interface DashboardUserBusinessSummary {
  totalUsers: number;
  activeUsers: number;
  verifiedUsers: number;
  totalBusinesses: number;
  subscribedBusinesses: number;
  totalSubscriptions: number;
  activeSubscriptions: number;
  inactiveSubscriptions: number;
  totalRevenue: number;
  currentMonthRevenue: number;
  previousMonthRevenue: number;
  todayRevenue: number;
  paidOrders: number;
  currentMonthNewUsers: number;
  previousMonthNewUsers: number;
}

export interface DashboardUserBusinessGrowth {
  userGrowthPct: number;
  subscriptionGrowthPct: number;
  revenueGrowthPct: number;
}

export interface DashboardUserBusiness {
  summary: DashboardUserBusinessSummary;
  growth: DashboardUserBusinessGrowth;
}

export interface DashboardOverview {
  generatedAt: string;
  summary: DashboardSummary;
  planBreakdown: DashboardPlanBreakdown[];
  monthlyTrends: DashboardMonthlyTrend[];
  countryDistribution: DashboardCountryDistribution[];
  recentActivity: DashboardRecentActivity[];
  monthlyTarget: DashboardMonthlyTarget;
  growth: DashboardGrowth;
  userBusiness: DashboardUserBusiness;
}
