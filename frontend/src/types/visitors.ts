export type VisitorSummary = {
  liveVisitorsNow: number;
  uniqueVisitorsToday: number;
  sessionsToday: number;
  pageViewsToday: number;
  uniqueVisitorsLast7Days: number;
  newVisitors: number;
  returningVisitors: number;
  averageSessionDurationSeconds: number;
  bounceRate: number;
};

export type VisitorCharts = {
  visitorsOverTime: Array<{ day: string; visitors: number }>;
  pageViewsOverTime: Array<{ day: string; pageViews: number }>;
  portalSplit: Array<{ portal: string; visitors: number; sessions: number }>;
  deviceDistribution: Array<{ device: string; sessions: number }>;
  topCountries: Array<{ country: string; visitors: number }>;
  topCities: Array<{ city: string; visitors: number }>;
  topPages: Array<{ path: string; portal: string; pageViews: number; visitors: number }>;
  topReferrers: Array<{ referrer: string; sessions: number }>;
  utmCampaigns: Array<{ campaign: string; sessions: number }>;
};

export type VisitorSummaryResponse = {
  timezone: string;
  liveVisitorWindowMinutes: number;
  generatedAt: string;
  summary: VisitorSummary;
  charts: VisitorCharts;
};

export type B2BLeadZoneDownloadAnalyticsResponse = {
  timezone: string;
  generatedAt: string;
  range: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalDownloads: number;
    uniqueVisitors: number;
    uniqueSessions: number;
    downloadsToday: number;
    downloadsLast7Days: number;
    downloadsLast30Days: number;
    knownLocationDownloads: number;
    locationCoverageRate: number;
  };
  charts: {
    downloadsOverTime: Array<{ day: string; downloads: number; uniqueVisitors: number }>;
    topCountries: Array<{ country: string; downloads: number; uniqueVisitors: number }>;
    topCities: Array<{ city: string; country: string; downloads: number; uniqueVisitors: number }>;
    sourceBreakdown: Array<{ source: string; downloads: number }>;
    pageBreakdown: Array<{ path: string; downloads: number; uniqueVisitors: number }>;
    deviceBreakdown: Array<{ device: string; downloads: number }>;
  };
  recentDownloads: Array<{
    id: string;
    anonymousVisitorId: string;
    sessionId: string;
    assetLabel: string | null;
    downloadUrl: string | null;
    pagePath: string | null;
    referrer: string | null;
    utmSource: string | null;
    browser: string | null;
    operatingSystem: string | null;
    location: string;
    createdAt: string;
  }>;
};

export type LiveVisitor = {
  id: string;
  portal: string;
  currentPath: string | null;
  pageTitle: string | null;
  location: string;
  visitorType: string;
  associatedUserId: string | null;
  associatedVendorId: string | null;
  device: string | null;
  browser: string | null;
  referrer: string | null;
  source: string | null;
  startedAt: string;
  lastActivityAt: string;
  pageViews: number;
};

export type VisitorListItem = {
  visitorId: string;
  portal: string;
  firstSeen: string;
  lastSeen: string;
  location: string;
  sessions: number;
  pageViews: number;
  totalDurationSeconds: number;
  latestPage: string | null;
  device: string | null;
  browser: string | null;
  visitorType: string;
  associatedUserId: string | null;
  associatedVendorId: string | null;
  acquisitionSource: string | null;
};

export type VisitorListResponse = {
  total: number;
  page: number;
  limit: number;
  items: VisitorListItem[];
};

export type VisitorLocationItem = {
  country: string;
  region: string;
  city: string;
  portal: string;
  visitors: number;
  sessions: number;
  pageViews: number;
};

export type VisitorPageItem = {
  path: string;
  portal: string;
  pageTitle: string | null;
  uniqueVisitors: number;
  sessions: number;
  pageViews: number;
  averageTimeOnPageSeconds: number;
  entries: number;
  exits: number;
  exitRate: number;
  lastViewed: string;
};

export type VisitorDetails = {
  visitor: {
    visitorId: string;
    firstSeenAt: string;
    lastSeenAt: string;
    portal: string;
    visitorType: string;
    associatedUserId: string | null;
    associatedVendorId: string | null;
    location: string;
    device: string | null;
    browser: string | null;
    operatingSystem: string | null;
    language: string | null;
    maskedIp: string | null;
  };
  sessions: Array<{
    sessionId: string;
    portal: string;
    startedAt: string;
    lastActivityAt: string;
    endedAt: string | null;
    landingPath: string | null;
    exitPath: string | null;
    referrer: string | null;
    utmSource: string | null;
    utmCampaign: string | null;
    pageViews: number;
    durationSeconds: number;
  }>;
  pageJourney: Array<{
    pageViewId: string;
    sessionId: string;
    path: string | null;
    pageTitle: string | null;
    viewedAt: string;
    exitedAt: string | null;
    durationSeconds: number;
  }>;
};

export type VisitorSessionDetails = {
  session: {
    sessionId: string;
    visitorId: string;
    portal: string;
    visitorType: string;
    associatedUserId: string | null;
    associatedVendorId: string | null;
    startedAt: string;
    lastActivityAt: string;
    endedAt: string | null;
    landingPath: string | null;
    exitPath: string | null;
    referrer: string | null;
    utmSource: string | null;
    utmCampaign: string | null;
    location: string;
    device: string | null;
    browser: string | null;
    pageViews: number;
    durationSeconds: number;
  };
  pageJourney: Array<{
    pageViewId: string;
    path: string | null;
    pageTitle: string | null;
    viewedAt: string;
    exitedAt: string | null;
    durationSeconds: number;
    isEntry: boolean;
    isExit: boolean;
  }>;
};

export type VisitorFilters = {
  page?: number;
  limit?: number;
  portal?: string;
  visitorType?: string;
  country?: string;
  region?: string;
  city?: string;
  device?: string;
  browser?: string;
  search?: string;
  pagePath?: string;
  referrer?: string;
  utmSource?: string;
  utmCampaign?: string;
  botStatus?: string;
  startDate?: string;
  endDate?: string;
  format?: "json" | "csv";
};
