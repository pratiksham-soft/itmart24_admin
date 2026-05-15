export type BadgeTone = "primary" | "success" | "error" | "warning" | "info" | "light" | "dark";

export type BannerState = {
  tone: "success" | "error" | "info";
  message: string;
} | null;

export type CRMOption = {
  label: string;
  value: string;
};

export type PaginationState = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type CRMListResponse<T> = {
  items: T[];
  pagination: PaginationState;
};

export type CRMListParams = {
  page?: number;
  limit?: number;
  q?: string;
  status?: string;
  source?: string;
  owner?: string;
  priority?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
};

export type CRMLead = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  jobTitle: string | null;
  website: string | null;
  leadSource: string;
  leadStatus: string;
  leadPriority: string;
  leadScore: number;
  estimatedValue: number;
  currency: string;
  assignedTo: number | null;
  tags: string[];
  notes: Array<Record<string, unknown>>;
  nextFollowUpAt: string | null;
  lastActivityAt: string | null;
  convertedContactId?: number | null;
  convertedCompanyId?: number | null;
  convertedDealId?: number | null;
  hasCustomPortfolio?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CRMCustomPortfolioLead = {
  id: number;
  leadType: string;
  companyName: string;
  website: string;
  businessEmail: string;
  contactName: string;
  jobTitle: string | null;
  country: string | null;
  productCountRange: string;
  categories: string[];
  promotionGoals: string[];
  visibilityLevel: string;
  budgetRange: string | null;
  message: string | null;
  sourcePage: string;
  shopifyPageId: string;
  status: string;
  assignedTo: number | null;
  salesNotes: string | null;
  followUpStatus: string;
  createdAt: string;
  updatedAt: string;
};

export type CRMContact = {
  id: number;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  alternatePhone: string | null;
  companyId: number | null;
  companyName: string | null;
  jobTitle: string | null;
  department: string | null;
  contactType: string;
  lifecycleStage: string;
  owner: number | null;
  tags: string[];
  notes: Array<Record<string, unknown>>;
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CRMCompany = {
  id: number;
  name: string;
  website: string | null;
  industry: string | null;
  companySize: string | null;
  country: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  twitterUrl: string | null;
  facebookUrl: string | null;
  description: string | null;
  owner: number | null;
  status: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type CRMDeal = {
  id: number;
  title: string;
  leadId: number | null;
  contactId: number | null;
  companyId: number | null;
  stage: string;
  value: number;
  currency: string;
  probability: number;
  expectedCloseDate: string | null;
  owner: number | null;
  source: string | null;
  description: string | null;
  lostReason: string | null;
  wonAt: string | null;
  lostAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CRMTask = {
  id: number;
  title: string;
  description: string | null;
  taskType: string;
  priority: string;
  status: string;
  dueAt: string | null;
  reminderAt: string | null;
  assignedTo: number | null;
  relatedType: string | null;
  relatedId: number | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CRMActivity = {
  id: number;
  activityType: string;
  title: string;
  description: string | null;
  relatedType: string | null;
  relatedId: number | null;
  actorId: number | null;
  actorName: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type CRMCampaign = {
  id: number;
  name: string;
  senderAccountId: number | null;
  senderEmail: string | null;
  subject: string;
  body: string;
  bodyMode: "html" | "text";
  status: string;
  delaySeconds: number;
  recipientType: string;
  segmentId: number | null;
  totalRecipients: number;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  openedCount: number;
  clickedCount: number;
  scheduledAt: string | null;
  startedAt: string | null;
  sentAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  lastError: string | null;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CRMCampaignRecipient = {
  id: number;
  campaignId: number;
  leadId: number | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  jobTitle: string | null;
  website: string | null;
  status: string;
  personalizedSubject: string | null;
  personalizedBodyHtml: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CRMLeadEmailRecipient = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  companyName: string | null;
  jobTitle: string | null;
  website: string | null;
  leadStatus: string;
  leadPriority: string;
  leadScore: number;
  tags: string[];
  notes: Array<Record<string, unknown>>;
  assignedTo: number | null;
};

export type CRMCampaignSummary = {
  totalCampaigns: number;
  drafts: number;
  sending: number;
  completed: number;
  failed: number;
};

export type CRMCampaignRecipientSummary = {
  total: number;
  pending: number;
  sending: number;
  sent: number;
  failed: number;
  skipped: number;
};

export type CRMSegmentCondition = {
  field: string;
  operator: string;
  value: string;
};

export type CRMSegment = {
  id: number;
  name: string;
  description: string | null;
  entityType: string;
  conditions: CRMSegmentCondition[];
  matchType: string;
  createdAt: string;
  updatedAt: string;
};

export type CRMSettings = {
  leadStatuses: string[];
  leadSources: string[];
  leadPriorities: string[];
  contactTypes: string[];
  lifecycleStages: string[];
  companyStatuses: string[];
  companySizes: string[];
  dealStages: string[];
  taskTypes: string[];
  taskPriorities: string[];
  taskStatuses: string[];
  activityTypes: string[];
  campaignStatuses: string[];
  recipientTypes: string[];
  segmentEntityTypes: string[];
  segmentMatchTypes: string[];
  defaultCurrency: string;
  assignmentRules?: Record<string, unknown>;
  emailCampaignDefaults?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
};

export type CRMDashboardData = {
  summary: {
    totalLeads: number;
    newLeads: number;
    qualifiedLeads: number;
    activeDeals: number;
    wonDeals: number;
    lostDeals: number;
    pendingFollowUps: number;
    overdueTasks: number;
    emailCampaignsSent: number;
    conversionRate: number;
  };
  leadsBySource: Array<{ label: string; value: number }>;
  dealsByStage: Array<{ label: string; value: number; amount: number }>;
  monthlyLeadGrowth: Array<{ label: string; count: number }>;
  revenueForecast: Array<{ label: string; amount: number }>;
  taskCompletionOverview: {
    completed: number;
    pending: number;
  };
  recentActivity: CRMActivity[];
  todaysFollowUps: CRMTask[];
  quickActions: Array<{ key: string; label: string }>;
};

export type CRMReportsData = {
  leadFunnel: Array<{ label: string; value: number }>;
  leadSource: Array<{ label: string; value: number }>;
  salesPipeline: Array<{ label: string; value: number; amount: number }>;
  conversion: {
    totalLeads: number;
    convertedLeads: number;
    rate: number;
  };
  taskProductivity: Array<{ label: string; value: number }>;
  ownerPerformance: Array<{
    owner: string;
    leadsAssigned: number;
    dealsWon: number;
    followupsCompleted: number;
  }>;
  campaignReport: Array<Record<string, unknown>>;
};

export type CRMPreviewResponse = {
  subject: string;
  body: string;
  bodyMode?: "html" | "text";
  variables: Record<string, string>;
};

export type CRMSegmentPreview = {
  count: number;
  items: Array<Record<string, unknown>>;
};

export type CRMApiResponse<T> = {
  success: boolean;
  item?: T;
  items?: T[];
  data?: T;
  preview?: T;
  pagination?: PaginationState;
  message?: string;
};

export type CRMLeadImportError = {
  row: number;
  field: string;
  message: string;
};

export type CRMLeadImportDuplicate = {
  row: number;
  email: string;
  action: "skip" | "update" | "create";
};

export type CRMLeadImportPreviewRow = {
  row: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  companyName: string | null;
  leadStatus: string;
  leadPriority: string;
  status: "valid" | "invalid" | "duplicate";
};

export type CRMLeadImportPreview = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  willCreate: number;
  willUpdate: number;
  willSkip: number;
  errors: CRMLeadImportError[];
  duplicates: CRMLeadImportDuplicate[];
  previewRows: CRMLeadImportPreviewRow[];
  warnings: string[];
};

export type CRMLeadImportResult = {
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: CRMLeadImportError[];
  warnings: string[];
};
