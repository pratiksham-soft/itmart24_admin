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
  leadType?: string;
  source?: string;
  owner?: string;
  priority?: string;
  tags?: string;
  companyName?: string;
  cleanupStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
};

export type CRMLead = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  contactName?: string | null;
  email: string | null;
  phone: string | null;
  emails: string[];
  phones: string[];
  address: string | null;
  companyName: string | null;
  country?: string | null;
  city?: string | null;
  state?: string | null;
  industry?: string | null;
  category?: string | null;
  subCategory?: string | null;
  jobTitle: string | null;
  website: string | null;
  lifecycleStage?: string | null;
  leadType: string | null;
  leadSource: string;
  leadStatus: string;
  leadPriority: string;
  leadScore: number;
  estimatedValue: number;
  currency: string;
  assignedTo: number | null;
  tags: string[];
  notes: Array<Record<string, unknown>>;
  unsubscribed?: boolean;
  bounced?: boolean;
  bounceType?: string | null;
  spamComplaint?: boolean;
  doNotContact?: boolean;
  emailConsentStatus?: string;
  lastEmailSentAt?: string | null;
  emailSentCount?: number;
  lastEmailOpenedAt?: string | null;
  emailOpenCount?: number;
  lastEmailClickedAt?: string | null;
  emailClickCount?: number;
  lastEmailRepliedAt?: string | null;
  emailReplyCount?: number;
  lastCampaignName?: string | null;
  lastCampaignStatus?: string | null;
  lastCampaignId?: string | null;
  hasEmail?: boolean;
  hasValidEmail?: boolean;
  emailDomain?: string | null;
  emailType?: string | null;
  isFreeEmailProvider?: boolean;
  isCompanyDomainEmail?: boolean;
  isSupportEmail?: boolean;
  isInfoEmail?: boolean;
  isContactEmail?: boolean;
  isSalesEmail?: boolean;
  isHelloEmail?: boolean;
  isMarketingEmail?: boolean;
  campaignReady?: boolean;
  canEmail?: boolean;
  agencyOutreachReady?: boolean;
  needsEmailReview?: boolean;
  emailRiskLevel?: "low" | "medium" | "high" | "blocked" | string;
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
  segmentName?: string | null;
  senderAccountId: number | null;
  senderEmail: string | null;
  fromName?: string | null;
  replyTo?: string | null;
  subject: string;
  body: string;
  bodyHtml?: string | null;
  bodyText?: string | null;
  bodyMode: "html" | "text";
  status: string;
  delaySeconds: number;
  delayMinSeconds?: number;
  delayMaxSeconds?: number;
  trackOpens?: boolean;
  trackClicks?: boolean;
  unsubscribeRequired?: boolean;
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
  recipientKey?: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  address: string | null;
  companyName: string | null;
  jobTitle: string | null;
  website: string | null;
  leadType?: string | null;
  status: string;
  blockedReason?: string | null;
  skipReason?: string | null;
  messageId?: string | null;
  providerMessageId?: string | null;
  trackingToken?: string | null;
  personalizedSubject: string | null;
  personalizedBodyHtml: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  deliveredAt?: string | null;
  firstOpenedAt?: string | null;
  lastOpenedAt?: string | null;
  openCount?: number;
  firstClickedAt?: string | null;
  lastClickedAt?: string | null;
  clickCount?: number;
  repliedAt?: string | null;
  bounceAt?: string | null;
  bounceType?: string | null;
  bounceReason?: string | null;
  complainedAt?: string | null;
  unsubscribedAt?: string | null;
  failedAt?: string | null;
  failureReason?: string | null;
  lastEventType?: string | null;
  lastEventAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CRMLeadEmailRecipient = {
  id: number;
  recipientKey: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  emails: string[];
  phones: string[];
  address: string | null;
  companyName: string | null;
  jobTitle: string | null;
  website: string | null;
  leadType: string | null;
  leadStatus: string;
  leadPriority: string;
  leadScore: number;
  tags: string[];
  notes: Array<Record<string, unknown>>;
  assignedTo: number | null;
  emailType?: string | null;
  emailRiskLevel?: string;
  campaignReady?: boolean;
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
  blocked?: number;
  opened?: number;
  clicked?: number;
  replied?: number;
  bounced?: number;
  unsubscribed?: number;
  complained?: number;
};

export type CRMCampaignTrackingOverview = {
  totalRecipients: number;
  pending: number;
  skipped: number;
  blocked: number;
  queued: number;
  sent: number;
  delivered: number;
  openedUnique: number;
  openedTotal: number;
  clickedUnique: number;
  clickedTotal: number;
  replied: number;
  autoReplied: number;
  bounced: number;
  hardBounced: number;
  softBounced: number;
  technicalBounced: number;
  complained: number;
  unsubscribed: number;
  failed: number;
  sendRate: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
  complaintRate: number;
  unsubscribeRate: number;
};

export type CRMCampaignAudiencePreview = {
  totalLeads: number;
  sendableLeads: number;
  blockedLeads: number;
  invalidEmailLeads: number;
  unsubscribedLeads: number;
  bouncedLeads: number;
  spamComplaintLeads: number;
  doNotContactLeads: number;
  riskDistribution: Array<{ label: string; count: number }>;
};

export type CRMCampaignTrackingEvent = {
  id: number;
  campaignId: number | null;
  recipientId: number | null;
  leadId: number | null;
  eventType: string;
  eventSource: string;
  email: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  url: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type CRMCampaignTrackingClick = {
  id: number;
  campaignId: number;
  recipientId: number;
  leadId: number | null;
  originalUrl: string;
  trackingUrl: string | null;
  clickedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export type CRMSegmentCondition = {
  field: string;
  operator: string;
  value: string | string[] | boolean | number | null;
  secondValue?: string | number | null;
};

export type CRMSegment = {
  id: number;
  name: string;
  description: string | null;
  entityType: string;
  conditions: CRMSegmentCondition[];
  matchType: string;
  limit?: number | null;
  sortBy?: string | null;
  sortDirection?: "asc" | "desc";
  randomize?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CRMCampaignSegmentAudiencePreview = {
  segment: Record<string, unknown>;
  summary: {
    matchedLeads: number;
    campaignReady: number;
    sendable: number;
    blocked: number;
    missingEmail: number;
    invalidEmail: number;
    unsubscribed: number;
    bounced: number;
    spamComplaint: number;
    doNotContact: number;
    appliedLimit: number | null;
  };
  recipients: Array<{
    leadId: number;
    email: string;
    companyName: string | null;
    firstName: string | null;
    lastName: string | null;
    website: string | null;
    emailType: string | null;
    emailRiskLevel: string;
    campaignReady: boolean;
  }>;
  blockedRecipients: Array<{
    leadId: number;
    email: string | null;
    companyName: string | null;
    firstName: string | null;
    lastName: string | null;
    reason: string;
  }>;
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
  emailTypeDistribution: Array<{ label: string; count: number }>;
  emailRiskDistribution: Array<{ label: string; count: number }>;
  countryDistribution: Array<{ label: string; count: number }>;
  campaignReadinessSummary: {
    campaignReadyCount: number;
    agencyOutreachReadyCount: number;
    sendableCount: number;
    blockedLeadCount: number;
    missingEmailCount: number;
    invalidEmailCount: number;
    unsubscribedCount: number;
    bouncedCount: number;
    spamComplaintCount: number;
    doNotContactCount: number;
    freeMailboxCount: number;
    supportEmailCount: number;
  };
  appliedLimit: number | null;
  sortBy: string | null;
  sortDirection: "asc" | "desc";
  randomize: boolean;
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
  selectedEmail: string | null;
  selectedEmailType: string | null;
  originalEmailValues: string[];
  excludedEmails: string[];
  duplicateEmailsRemoved: number;
  companyName: string | null;
  leadType: string | null;
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
  validBestEmailsSelected: number;
  gmailSelectedCount: number;
  supportSelectedCount: number;
  noSafeEmailCount: number;
  duplicateEmailsRemovedCount: number;
  excludedBadEmailsCount: number;
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

export type CRMLeadEmailCleanupSampleMatched = {
  row: number;
  leadId: number;
  companyName: string | null;
  website: string | null;
  currentEmail: string | null;
  bestEmail: string;
  bestEmailType: string | null;
  sendStatus: string | null;
  matchMethod: "id" | "company_website" | "email";
};

export type CRMLeadEmailCleanupSampleUnmatched = {
  row: number;
  companyName: string | null;
  website: string | null;
  bestEmail: string | null;
  reason: string;
};

export type CRMLeadEmailCleanupPreview = {
  totalRows: number;
  matchedRows: number;
  unmatchedRows: number;
  willUpdate: number;
  skippedRows: number;
  errors: CRMLeadImportError[];
  sampleMatchedRecords: CRMLeadEmailCleanupSampleMatched[];
  sampleUnmatchedRecords: CRMLeadEmailCleanupSampleUnmatched[];
  warnings: string[];
};

export type CRMLeadEmailCleanupResult = {
  totalRows: number;
  matchedRows: number;
  unmatchedRows: number;
  updatedRows: number;
  skippedRows: number;
  failedRows: number;
  errors: CRMLeadImportError[];
  warnings: string[];
};
