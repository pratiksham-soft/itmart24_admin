import {
  getAnalyticsPool,
  ensureTables,
} from "./analyticsPostgres.service";
import { sendEmailMessage } from "./adminEmail.service";
import csvParser from "csv-parser";
import { Readable } from "stream";

type JsonRecord = Record<string, unknown>;
type SegmentPreviewDistribution = { label: string; count: number };
type SegmentSortDirection = "asc" | "desc";

type PaginationQuery = {
  page?: unknown;
  limit?: unknown;
  q?: unknown;
  status?: unknown;
  leadType?: unknown;
  source?: unknown;
  owner?: unknown;
  priority?: unknown;
  tags?: unknown;
  companyName?: unknown;
  cleanupStatus?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
  sortBy?: unknown;
  sortOrder?: unknown;
};

type AdminActor = {
  id: number;
  name: string;
  email: string;
};

type LeadConvertPayload = {
  createDeal?: unknown;
  dealTitle?: unknown;
  dealValue?: unknown;
  currency?: unknown;
  stage?: unknown;
  expectedCloseDate?: unknown;
  probability?: unknown;
  description?: unknown;
};

type LeadActivityOptions = {
  skipActivity?: boolean;
  activityOverride?: {
    activityType: string;
    title: string;
    description?: string | null;
    metadata?: JsonRecord;
  };
};

type LeadImportDuplicateStrategy = "skip" | "update" | "allow";

type LeadImportOptions = {
  duplicateStrategy: LeadImportDuplicateStrategy;
  createActivityLogs: boolean;
};

type LeadImportError = {
  row: number;
  field: string;
  message: string;
};

type LeadImportDuplicate = {
  row: number;
  email: string;
  action: "skip" | "update" | "create";
};

type LeadImportPreviewRow = {
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

type LeadImportPreview = {
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
  errors: LeadImportError[];
  duplicates: LeadImportDuplicate[];
  previewRows: LeadImportPreviewRow[];
  warnings: string[];
};

type LeadImportResult = {
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: LeadImportError[];
  warnings: string[];
};

type LeadEmailCleanupError = {
  row: number;
  field: string;
  message: string;
};

type LeadEmailCleanupMatchMethod = "id" | "company_website" | "email";

type LeadEmailCleanupMatchedSample = {
  row: number;
  leadId: number;
  companyName: string | null;
  website: string | null;
  currentEmail: string | null;
  bestEmail: string;
  bestEmailType: string | null;
  sendStatus: string | null;
  matchMethod: LeadEmailCleanupMatchMethod;
};

type LeadEmailCleanupUnmatchedSample = {
  row: number;
  companyName: string | null;
  website: string | null;
  bestEmail: string | null;
  reason: string;
};

type LeadEmailCleanupPreview = {
  totalRows: number;
  matchedRows: number;
  unmatchedRows: number;
  willUpdate: number;
  skippedRows: number;
  errors: LeadEmailCleanupError[];
  sampleMatchedRecords: LeadEmailCleanupMatchedSample[];
  sampleUnmatchedRecords: LeadEmailCleanupUnmatchedSample[];
  warnings: string[];
};

type LeadEmailCleanupResult = {
  totalRows: number;
  matchedRows: number;
  unmatchedRows: number;
  updatedRows: number;
  skippedRows: number;
  failedRows: number;
  errors: LeadEmailCleanupError[];
  warnings: string[];
};

type CsvLeadDraft = {
  row: number;
  raw: Record<string, string>;
  payload?: Record<string, unknown>;
  status?: "valid" | "invalid" | "duplicate";
  duplicateEmail?: string | null;
  duplicateLeadId?: number | null;
  duplicateAction?: "skip" | "update" | "create";
  emailSelection?: LeadImportEmailSelectionResult;
};

type LeadImportEmailSelectionResult = {
  originalEmailValues: string[];
  allValidEmails: string[];
  selectedEmail: string | null;
  selectedEmailType: string | null;
  selectedEmailPriority: number | null;
  excludedEmails: string[];
  duplicateEmailsRemoved: number;
  cleaningNote: string | null;
  isFreeMailboxSelected: boolean;
  isSupportSelected: boolean;
};

type CsvLeadEmailCleanupDraft = {
  row: number;
  raw: Record<string, string>;
  status: "matched" | "unmatched" | "skipped";
  reason?: string;
  leadId?: number | null;
  matchedLead?: any | null;
  matchMethod?: LeadEmailCleanupMatchMethod;
  companyName?: string | null;
  website?: string | null;
  bestEmail?: string | null;
  bestEmailType?: string | null;
  sendStatus?: string | null;
  emailCountInOriginalRow?: number;
  excludedEmails?: string[];
  otherSendableEmails?: string[];
  cleaningNote?: string | null;
  candidateEmails?: string[];
};

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;
const MAX_LEAD_IMPORT_ROWS = 2000;
const CRM_LEAD_TYPES = ["Vendor", "Consumer"] as const;
const CRM_ALLOWED_SORT_ORDER = new Set(["asc", "desc"]);
const CRM_LEAD_IMPORT_HEADERS = [
  "firstName",
  "lastName",
  "email",
  "emails",
  "phone",
  "address",
  "companyName",
  "country",
  "city",
  "state",
  "industry",
  "category",
  "subCategory",
  "jobTitle",
  "website",
  "leadType",
  "leadSource",
  "leadStatus",
  "leadPriority",
  "leadScore",
  "estimatedValue",
  "currency",
  "assignedTo",
  "tags",
  "notes",
  "nextFollowUpAt",
  "lifecycleStage",
  "unsubscribed",
  "bounced",
  "bounceType",
  "spamComplaint",
  "doNotContact",
  "emailConsentStatus",
] as const;
const CRM_LEAD_IMPORT_HEADER_ALIASES: Record<string, (typeof CRM_LEAD_IMPORT_HEADERS)[number]> = {
  firstname: "firstName",
  lastname: "lastName",
  email: "email",
  emails: "emails",
  contactemail: "email",
  contactemails: "emails",
  phone: "phone",
  phones: "phone",
  address: "address",
  companyname: "companyName",
  country: "country",
  city: "city",
  state: "state",
  industry: "industry",
  category: "category",
  subcategory: "subCategory",
  jobtitle: "jobTitle",
  website: "website",
  leadtype: "leadType",
  leadsource: "leadSource",
  leadstatus: "leadStatus",
  leadpriority: "leadPriority",
  leadscore: "leadScore",
  estimatedvalue: "estimatedValue",
  currency: "currency",
  assignedto: "assignedTo",
  tags: "tags",
  notes: "notes",
  nextfollowupat: "nextFollowUpAt",
  lifestagestage: "lifecycleStage",
  lifestylestage: "lifecycleStage",
  lifestag: "lifecycleStage",
  lifecyclestage: "lifecycleStage",
  unsubscribed: "unsubscribed",
  bounced: "bounced",
  bouncetype: "bounceType",
  spamcomplaint: "spamComplaint",
  donotcontact: "doNotContact",
  emailconsentstatus: "emailConsentStatus",
};
const CRM_LEAD_EMAIL_CLEANUP_HEADERS = [
  "id",
  "companyname",
  "website",
  "email",
  "emails",
  "originalemails",
  "allemails",
  "bestemail",
  "bestemailtype",
  "sendstatus",
  "excludedemails",
  "othersendableemails",
  "cleaningnote",
  "emailcountinoriginalrow",
] as const;

export const CRM_DEFAULTS = {
  leadStatuses: [
    "New",
    "Contacted",
    "Qualified",
    "Demo Scheduled",
    "Proposal Sent",
    "Negotiation",
    "Converted",
    "Lost",
  ],
  leadSources: [
    "Website",
    "Vendor Signup",
    "Manual Entry",
    "Email Campaign",
    "Map Scraper",
    "Social Media",
    "Referral",
    "Marketplace Listing",
    "Product Page",
    "Comparison Page",
    "Other",
  ],
  leadPriorities: ["Low", "Medium", "High", "Urgent"],
  contactTypes: [
    "Vendor",
    "Partner",
    "Customer",
    "Prospect",
    "Affiliate",
    "Support Contact",
    "Other",
  ],
  lifecycleStages: [
    "Subscriber",
    "Lead",
    "Marketing Qualified",
    "Sales Qualified",
    "Opportunity",
    "Customer",
    "Partner",
    "Inactive",
  ],
  companyStatuses: [
    "Prospect",
    "Active Vendor",
    "Partner",
    "Customer",
    "Inactive",
    "Blacklisted",
  ],
  companySizes: ["Solo", "2-10", "11-50", "51-200", "201-1000", "1000+"],
  dealStages: [
    "New",
    "Qualified",
    "Demo Scheduled",
    "Proposal Sent",
    "Negotiation",
    "Won",
    "Lost",
  ],
  taskTypes: [
    "Call",
    "Email",
    "Meeting",
    "Demo",
    "Proposal",
    "Follow-up",
    "Internal Note",
    "Other",
  ],
  taskPriorities: ["Low", "Medium", "High", "Urgent"],
  taskStatuses: ["Pending", "In Progress", "Completed", "Cancelled"],
  activityTypes: [
    "Lead Created",
    "Lead Updated",
    "Lead Converted",
    "Contact Created",
    "Contact Updated",
    "Company Created",
    "Company Updated",
    "Deal Created",
    "Deal Stage Changed",
    "Task Created",
    "Task Completed",
    "Note Added",
    "Email Sent",
    "Call Logged",
    "Meeting Logged",
    "Campaign Created",
    "Campaign Sent",
    "Segment Created",
  ],
  campaignStatuses: [
    "Draft",
    "Sending",
    "Completed",
    "Failed",
    "Cancelled",
  ],
  recipientTypes: ["leads", "contacts", "companies", "segments"],
  segmentEntityTypes: ["leads", "contacts", "companies", "deals"],
  segmentMatchTypes: ["all", "any"],
  defaultCurrency: "USD",
};

const CRM_SEGMENT_SORT_FIELDS = [
  "createdAt",
  "updatedAt",
  "lastActivityAt",
  "nextFollowUpAt",
  "emailRiskLevel",
  "emailSentCount",
  "emailOpenCount",
  "emailClickCount",
  "emailReplyCount",
  "dealValue",
  "id",
] as const;

const readErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const isSchemaRecoveryError = (error: unknown) => {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: string }).code ?? "")
      : "";

  return ["42P01", "42703", "42P10"].includes(code);
};

const withSchemaRecovery = async <T>(operation: () => Promise<T>) => {
  try {
    return await operation();
  } catch (error) {
    if (!isSchemaRecoveryError(error)) {
      throw error;
    }

    await ensureTables();
    return operation();
  }
};

const toTrimmedString = (value: unknown) => String(value ?? "").trim();

const toOptionalString = (value: unknown) => {
  const normalized = toTrimmedString(value);
  return normalized || null;
};

const splitCommaSeparatedValues = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry ?? "").trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [] as string[];
};

const toEmail = (value: unknown, fieldName: string) => {
  const normalized = toTrimmedString(value).toLowerCase();
  if (!normalized) {
    return null;
  }

  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
  if (!isValid) {
    throw new Error(`${fieldName} must be a valid email address.`);
  }

  return normalized;
};

const toEmailArray = (value: unknown, fieldName: string) => {
  const values = Array.from(
    new Set(
      splitCommaSeparatedValues(value).map((entry) => entry.toLowerCase())
    )
  );

  values.forEach((entry, index) => {
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry);
    if (!isValid) {
      throw new Error(`${fieldName} #${index + 1} must be a valid email address.`);
    }
  });

  return values;
};

const toUrl = (value: unknown, fieldName: string) => {
  const normalized = toTrimmedString(value);
  if (!normalized) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("invalid");
    }
    return normalized;
  } catch (_error) {
    throw new Error(`${fieldName} must be a valid URL.`);
  }
};

const toNumberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toFiniteNumber = (
  value: unknown,
  fieldName: string,
  options?: { min?: number; max?: number; allowNull?: boolean }
) => {
  if ((value === null || value === undefined || value === "") && options?.allowNull) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} must be a valid number.`);
  }

  if (options?.min != null && parsed < options.min) {
    throw new Error(`${fieldName} must be at least ${options.min}.`);
  }

  if (options?.max != null && parsed > options.max) {
    throw new Error(`${fieldName} must be at most ${options.max}.`);
  }

  return parsed;
};

const toInteger = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.round(parsed));
};

const toIsoDateTimeOrNull = (value: unknown, fieldName: string) => {
  const normalized = toTrimmedString(value);
  if (!normalized) {
    return null;
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date.`);
  }

  return date.toISOString();
};

const toArrayOfStrings = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [] as string[];
};

const extractTagStrings = (value: unknown) => {
  if (Array.isArray(value)) {
    return uniqueStrings(
      value
        .flatMap((entry) => {
          if (typeof entry === "string") {
            return entry
              .split(/[,\n;|]/)
              .map((item) => item.trim())
              .filter(Boolean);
          }

          if (entry && typeof entry === "object") {
            const record = entry as Record<string, unknown>;
            return [record.name, record.value, record.label, record.tag]
              .map((item) => String(item ?? "").trim())
              .filter(Boolean);
          }

          const normalized = String(entry ?? "").trim();
          return normalized ? [normalized] : [];
        })
        .filter(Boolean)
    );
  }

  if (typeof value === "string") {
    return uniqueStrings(
      value
        .split(/[,\n;|]/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    );
  }

  return [] as string[];
};

const hasLeadTag = (value: unknown, tag: string) => {
  const normalizedTag = toTrimmedString(tag).toLowerCase();
  if (!normalizedTag) {
    return false;
  }

  return extractTagStrings(value).some((entry) => entry.toLowerCase() === normalizedTag);
};

const toTagArray = (value: unknown) => {
  return extractTagStrings(value);
};

const toPhoneArray = (value: unknown) =>
  Array.from(new Set(splitCommaSeparatedValues(value)));

const normalizeCsvHeader = (value: string) =>
  value.replace(/^\uFEFF/, "").trim().replace(/\s+/g, "");

const normalizeLeadImportHeaderAlias = (value: string) =>
  value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

const resolveLeadImportHeader = (value: string) =>
  CRM_LEAD_IMPORT_HEADER_ALIASES[normalizeLeadImportHeaderAlias(value)] ?? normalizeCsvHeader(value);

const normalizeCleanupCsvHeader = (value: string) =>
  value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

const isCsvLeadRowEmpty = (row: Record<string, string>) =>
  Object.values(row).every((value) => !toTrimmedString(value));

const isCsvLeadEmailCleanupRowEmpty = (row: Record<string, string>) =>
  Object.values(row).every((value) => !toTrimmedString(value));

const parseDelimitedValues = (value: unknown) =>
  Array.from(
    new Set(
      String(value ?? "")
        .split(/[;,|\n]/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );

const firstNonEmptyCleanupValue = (row: Record<string, string>, keys: string[]) => {
  for (const key of keys) {
    const value = toTrimmedString(row[key]);
    if (value) {
      return value;
    }
  }
  return "";
};

const buildImportedNote = (text: string | null, actor: AdminActor) => {
  if (!text) {
    return [] as JsonRecord[];
  }

  return [
    {
      id: `note-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      authorId: actor.id,
      authorName: actor.name,
      createdAt: new Date().toISOString(),
    },
  ] as JsonRecord[];
};

const sanitizeJsonArray = (value: unknown, fieldName: string) => {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be a valid JSON array.`);
  }

  return value;
};

const assertAllowed = (value: string | null, allowedValues: string[], fieldName: string) => {
  if (!value) {
    return null;
  }

  if (!allowedValues.includes(value)) {
    throw new Error(`${fieldName} must be one of: ${allowedValues.join(", ")}.`);
  }

  return value;
};

const camelizeRow = (row: Record<string, unknown>) => {
  const mapped: Record<string, unknown> = {};

  Object.entries(row).forEach(([key, value]) => {
    const camelKey = key.replace(/_([a-z])/g, (_match, letter: string) =>
      letter.toUpperCase()
    );
    mapped[camelKey] = value;
  });

  return mapped;
};

const normalizeJsonField = <T>(value: unknown, fallback: T): T => {
  if (value == null) {
    return fallback;
  }

  if (typeof value === "object") {
    return value as T;
  }

  return fallback;
};

const uniqueStrings = (items: string[]) => Array.from(new Set(items.filter(Boolean)));

const FREE_MAILBOX_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
]);
const CRM_EMAIL_CONSENT_STATUSES = [
  "unknown",
  "opted_in",
  "legitimate_interest",
  "unsubscribed",
  "do_not_contact",
] as const;
const CRM_BOUNCE_TYPES = ["hard", "soft", "unknown"] as const;

const LEAD_IMPORT_AUTO_NOTE_TEXT = "Best email selected automatically during lead import.";

const extractEmailsFromValue = (value: unknown) =>
  (String(value ?? "").toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? []).map((entry) =>
    entry.trim()
  );

const extractDomainFromWebsite = (value: unknown) => {
  const normalized = toTrimmedString(value);
  if (!normalized) {
    return null;
  }

  try {
    const withProtocol = /^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`;
    const parsed = new URL(withProtocol);
    return parsed.hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch (_error) {
    return null;
  }
};

const normalizeEmailConsentStatus = (value: unknown) => {
  const normalized = toTrimmedString(value).toLowerCase().replace(/\s+/g, "_");
  if (!normalized) {
    return "unknown";
  }

  const synonymMap: Record<string, string> = {
    granted: "opted_in",
    denied: "do_not_contact",
    pending: "unknown",
  };
  const canonical = synonymMap[normalized] ?? normalized;

  if ((CRM_EMAIL_CONSENT_STATUSES as readonly string[]).includes(canonical)) {
    return canonical as (typeof CRM_EMAIL_CONSENT_STATUSES)[number];
  }

  return "unknown";
};

const assertEmailConsentStatus = (value: unknown) => {
  const normalized = normalizeEmailConsentStatus(value);
  const rawValue = toTrimmedString(value);
  if (rawValue && normalized === "unknown" && rawValue.toLowerCase() !== "unknown") {
    throw new Error(
      `emailConsentStatus must be one of: ${CRM_EMAIL_CONSENT_STATUSES.join(", ")}.`
    );
  }
  return normalized;
};

const normalizeBounceType = (value: unknown) => {
  const normalized = toTrimmedString(value).toLowerCase();
  if (!normalized) {
    return null;
  }

  if ((CRM_BOUNCE_TYPES as readonly string[]).includes(normalized)) {
    return normalized as (typeof CRM_BOUNCE_TYPES)[number];
  }

  throw new Error(`bounceType must be one of: ${CRM_BOUNCE_TYPES.join(", ")}.`);
};

const parseBooleanLikeValue = (value: unknown) => {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = toTrimmedString(value).toLowerCase();
  if (!normalized) {
    return false;
  }

  if (["true", "1", "yes", "y"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "n"].includes(normalized)) {
    return false;
  }

  throw new Error("Boolean field must be true or false.");
};

const classifyPrimaryLeadEmail = (email: string | null) => {
  const normalizedEmail = toTrimmedString(email).toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return {
      emailDomain: null,
      emailType: "unknown",
      hasValidEmail: false,
      isFreeMailbox: false,
    };
  }

  const localPart = normalizedEmail.split("@")[0] ?? "";
  const emailDomain = normalizedEmail.split("@")[1] ?? null;
  const isFreeMailbox = Boolean(emailDomain && FREE_MAILBOX_DOMAINS.has(emailDomain));

  if (/^(noreply|no-reply|donotreply|do-not-reply|abuse|privacy|legal|bug|bugs|security|postmaster|hostmaster)([+._-].*)?$/i.test(localPart)) {
    return { emailDomain, emailType: "risky", hasValidEmail: true, isFreeMailbox };
  }
  if (/^(admin|administrator|office|hr|careers|jobs|billing|webmaster)([+._-].*)?$/i.test(localPart)) {
    return { emailDomain, emailType: "admin", hasValidEmail: true, isFreeMailbox };
  }
  if (/(^|[._-])(owner|founder|cofounder|co-founder|ceo|director|md|managingdirector|president)([._-]|$)/i.test(localPart)) {
    return { emailDomain, emailType: "owner", hasValidEmail: true, isFreeMailbox };
  }
  if (/^sales([+._-]|$)/i.test(localPart)) {
    return { emailDomain, emailType: "sales", hasValidEmail: true, isFreeMailbox };
  }
  if (/^(partnerships?|partner)([+._-]|$)/i.test(localPart)) {
    return { emailDomain, emailType: "partnerships", hasValidEmail: true, isFreeMailbox };
  }
  if (/^business([+._-]|$)/i.test(localPart)) {
    return { emailDomain, emailType: "business", hasValidEmail: true, isFreeMailbox };
  }
  if (/^marketing([+._-]|$)/i.test(localPart)) {
    return { emailDomain, emailType: "marketing", hasValidEmail: true, isFreeMailbox };
  }
  if (/^hello([+._-]|$)/i.test(localPart)) {
    return { emailDomain, emailType: "hello", hasValidEmail: true, isFreeMailbox };
  }
  if (/^contact([+._-]|$)/i.test(localPart)) {
    return { emailDomain, emailType: "contact", hasValidEmail: true, isFreeMailbox };
  }
  if (/^info([+._-]|$)/i.test(localPart)) {
    return { emailDomain, emailType: "info", hasValidEmail: true, isFreeMailbox };
  }
  if (/^support([+._-]|$)/i.test(localPart)) {
    return { emailDomain, emailType: "support", hasValidEmail: true, isFreeMailbox };
  }
  if (isFreeMailbox) {
    return { emailDomain, emailType: "free_mailbox", hasValidEmail: true, isFreeMailbox };
  }

  return { emailDomain, emailType: "other_company_domain", hasValidEmail: true, isFreeMailbox };
};

export const computeLeadCampaignSafetyState = (lead: Record<string, unknown>) => {
  // `crm_leads.email` is the primary campaign send email. `crm_leads.emails` preserves all valid imported emails.
  const primaryEmail = toOptionalString(lead.email);
  const emailClassification = classifyPrimaryLeadEmail(primaryEmail);
  const tags = extractTagStrings(lead.tags);
  const unsubscribed = Boolean(lead.unsubscribed);
  const bounced = Boolean(lead.bounced);
  const spamComplaint = Boolean(lead.spamComplaint);
  const doNotContact = Boolean(lead.doNotContact);
  const emailConsentStatus = normalizeEmailConsentStatus(lead.emailConsentStatus ?? "unknown");
  const blockedByConsent = ["unsubscribed", "do_not_contact"].includes(emailConsentStatus);
  const hasEmail = Boolean(primaryEmail);
  const hasValidEmail = emailClassification.hasValidEmail;
  const isSupportEmail = emailClassification.emailType === "support";
  const isInfoEmail = emailClassification.emailType === "info";
  const isContactEmail = emailClassification.emailType === "contact";
  const isSalesEmail = emailClassification.emailType === "sales";
  const isHelloEmail = emailClassification.emailType === "hello";
  const isMarketingEmail = emailClassification.emailType === "marketing";
  const campaignReady =
    hasValidEmail &&
    !unsubscribed &&
    !bounced &&
    !spamComplaint &&
    !doNotContact &&
    !blockedByConsent;
  const needsEmailReview = hasLeadTag(tags, "email_needs_review") || !hasValidEmail || !hasEmail;
  const agencyOutreachReady = hasLeadTag(tags, "agency_outreach_ready") && campaignReady;
  let emailRiskLevel: "low" | "medium" | "high" | "blocked" = "high";

  if (
    !hasEmail ||
    !hasValidEmail ||
    unsubscribed ||
    bounced ||
    spamComplaint ||
    doNotContact ||
    blockedByConsent ||
    emailClassification.emailType === "risky"
  ) {
    emailRiskLevel = "blocked";
  } else if (emailClassification.emailType === "admin") {
    emailRiskLevel = "high";
  } else if (["free_mailbox", "info", "contact", "support"].includes(emailClassification.emailType)) {
    emailRiskLevel = "medium";
  } else if (
    [
      "owner",
      "sales",
      "partnerships",
      "business",
      "marketing",
      "hello",
    ].includes(emailClassification.emailType)
  ) {
    emailRiskLevel = "low";
  } else if (emailClassification.emailType === "other_company_domain") {
    emailRiskLevel = "medium";
  }

  return {
    contactName:
      toOptionalString(lead.contactName) ??
      toOptionalString([lead.firstName, lead.lastName].map((entry) => toTrimmedString(entry)).filter(Boolean).join(" ")) ??
      null,
    hasEmail,
    hasValidEmail,
    emailDomain: emailClassification.emailDomain,
    emailType: emailClassification.emailType,
    isFreeEmailProvider: emailClassification.isFreeMailbox,
    isCompanyDomainEmail: hasValidEmail && !emailClassification.isFreeMailbox,
    isSupportEmail,
    isInfoEmail,
    isContactEmail,
    isSalesEmail,
    isHelloEmail,
    isMarketingEmail,
    unsubscribed,
    bounced,
    spamComplaint,
    doNotContact,
    emailConsentStatus,
    campaignReady,
    canEmail: campaignReady,
    agencyOutreachReady,
    needsEmailReview,
    emailRiskLevel,
  };
};

export const canSendEmailToLead = (lead: Record<string, unknown>) => {
  const safety = computeLeadCampaignSafetyState(lead);
  if (!safety.hasEmail || !safety.hasValidEmail) {
    return false;
  }
  if (!safety.canEmail) {
    return false;
  }
  if (safety.emailRiskLevel === "blocked") {
    return false;
  }
  return true;
};

const classifyLeadEmailCandidate = (email: string, website: string | null) => {
  const normalizedEmail = email.toLowerCase();
  const localPart = normalizedEmail.split("@")[0] ?? "";
  const domain = normalizedEmail.split("@")[1] ?? "";
  const websiteDomain = extractDomainFromWebsite(website);
  const matchesWebsiteDomain =
    websiteDomain != null && (domain === websiteDomain || domain.endsWith(`.${websiteDomain}`));
  const isFreeMailbox = FREE_MAILBOX_DOMAINS.has(domain);

  if (
    /^(noreply|no-reply|donotreply|do-not-reply|abuse|privacy|legal|bug|bugs|security|postmaster|webmaster|hostmaster|careers|jobs)([+._-].*)?$/i.test(
      localPart
    )
  ) {
    return {
      email: normalizedEmail,
      type: "excluded",
      priority: 999,
      excluded: true,
      fallbackOnly: false,
      isFreeMailbox: false,
      isSupport: false,
      matchesWebsiteDomain,
    };
  }

  if (/^(hr|billing)([+._-].*)?$/i.test(localPart)) {
    return {
      email: normalizedEmail,
      type: localPart.startsWith("hr") ? "hr" : "billing",
      priority: 90,
      excluded: false,
      fallbackOnly: true,
      isFreeMailbox,
      isSupport: false,
      matchesWebsiteDomain,
    };
  }

  if (/(^|[._-])(owner|founder|cofounder|co-founder|ceo|director|md|managingdirector|president)([._-]|$)/i.test(localPart)) {
    return {
      email: normalizedEmail,
      type: "owner_or_founder",
      priority: 1,
      excluded: false,
      fallbackOnly: false,
      isFreeMailbox,
      isSupport: false,
      matchesWebsiteDomain,
    };
  }

  const orderedPrefixes = [
    { pattern: /^sales([+._-]|$)/i, type: "sales", priority: 2, isSupport: false },
    { pattern: /^(partnerships?|partner)([+._-]|$)/i, type: "partnerships", priority: 3, isSupport: false },
    { pattern: /^business([+._-]|$)/i, type: "business", priority: 4, isSupport: false },
    { pattern: /^marketing([+._-]|$)/i, type: "marketing", priority: 5, isSupport: false },
    { pattern: /^hello([+._-]|$)/i, type: "hello", priority: 6, isSupport: false },
    { pattern: /^contact([+._-]|$)/i, type: "contact", priority: 7, isSupport: false },
    { pattern: /^info([+._-]|$)/i, type: "info", priority: 8, isSupport: false },
    { pattern: /^support([+._-]|$)/i, type: "support", priority: 10, isSupport: true },
  ] as const;

  for (const candidate of orderedPrefixes) {
    if (candidate.pattern.test(localPart)) {
      return {
        email: normalizedEmail,
        type: candidate.type,
        priority: candidate.priority,
        excluded: false,
        fallbackOnly: false,
        isFreeMailbox,
        isSupport: candidate.isSupport,
        matchesWebsiteDomain,
      };
    }
  }

  if (isFreeMailbox) {
    return {
      email: normalizedEmail,
      type: "free_mailbox",
      priority: 9,
      excluded: false,
      fallbackOnly: false,
      isFreeMailbox: true,
      isSupport: false,
      matchesWebsiteDomain,
    };
  }

  return {
    email: normalizedEmail,
    type: matchesWebsiteDomain ? "company_domain" : "other_valid_email",
    priority: 11,
    excluded: false,
    fallbackOnly: false,
    isFreeMailbox: false,
    isSupport: false,
    matchesWebsiteDomain,
  };
};

const selectBestLeadEmail = (
  emailValues: string[],
  website: string | null
): LeadImportEmailSelectionResult => {
  const normalizedEmails = emailValues
    .map((entry) => String(entry ?? "").trim().toLowerCase())
    .filter(Boolean);
  const uniqueValidEmails = uniqueStrings(
    normalizedEmails.filter((entry) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry))
  );
  const duplicateEmailsRemoved = Math.max(0, normalizedEmails.length - uniqueValidEmails.length);
  const classified = uniqueValidEmails.map((email) => classifyLeadEmailCandidate(email, website));
  const standardCandidates = classified.filter((entry) => !entry.excluded && !entry.fallbackOnly);
  const fallbackCandidates = classified.filter((entry) => !entry.excluded && entry.fallbackOnly);
  const excludedEmails = classified
    .filter((entry) => entry.excluded)
    .map((entry) => entry.email);
  const sortedCandidates = [...standardCandidates].sort((left, right) => left.priority - right.priority);
  const selectedCandidate =
    sortedCandidates[0] ??
    [...fallbackCandidates].sort((left, right) => left.priority - right.priority)[0] ??
    null;
  const fallbackExcludedEmails =
    selectedCandidate && selectedCandidate.fallbackOnly
      ? []
      : fallbackCandidates.map((entry) => entry.email);
  const selectedEmail = selectedCandidate?.email ?? null;
  const selectedEmailType = selectedCandidate?.type ?? null;

  let cleaningNote: string | null = null;
  if (selectedCandidate?.type === "support") {
    cleaningNote = "Only support email was available or it was the best campaign-safe option.";
  } else if (selectedCandidate?.type === "free_mailbox") {
    cleaningNote = "A free mailbox email was selected because it was the best valid option.";
  } else if (selectedCandidate?.fallbackOnly) {
    cleaningNote = "Only fallback email types like hr or billing were available.";
  } else if (selectedCandidate) {
    cleaningNote = `Selected ${selectedCandidate.type.replace(/_/g, " ")} as the best campaign-safe email.`;
  } else if (uniqueValidEmails.length > 0) {
    cleaningNote = "No campaign-safe primary email was found from the imported emails.";
  }

  return {
    originalEmailValues: uniqueValidEmails,
    allValidEmails: uniqueValidEmails,
    selectedEmail,
    selectedEmailType,
    selectedEmailPriority: selectedCandidate?.priority ?? null,
    excludedEmails: uniqueStrings([...excludedEmails, ...fallbackExcludedEmails]),
    duplicateEmailsRemoved,
    cleaningNote,
    isFreeMailboxSelected: selectedCandidate?.isFreeMailbox ?? false,
    isSupportSelected: selectedCandidate?.isSupport ?? false,
  };
};

const collectLeadImportRowEmails = (row: Record<string, string>) => {
  const values = [row.email, row.emails];
  return values.flatMap((value) => extractEmailsFromValue(value));
};

const buildLeadImportEmailTags = (
  existingTags: string[],
  selection: LeadImportEmailSelectionResult
) => {
  const nextTags = [...existingTags, "email_cleaned"];

  if (selection.selectedEmail) {
    nextTags.push("agency_outreach_ready");
  } else {
    nextTags.push("email_needs_review");
  }

  if (selection.isFreeMailboxSelected) {
    nextTags.push("gmail_lead");
  }

  if (selection.isSupportSelected) {
    nextTags.push("support_lead");
  }

  return uniqueStrings(nextTags);
};

const buildLeadImportEmailSelectionNote = (
  selection: LeadImportEmailSelectionResult,
  actor: AdminActor,
  importOperationId: string
) =>
  ({
    id: `note-import-email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    noteKind: "import_email_selection",
    importOperationId,
    text: LEAD_IMPORT_AUTO_NOTE_TEXT,
    bestEmail: selection.selectedEmail,
    bestEmailType: selection.selectedEmailType,
    allValidEmails: selection.allValidEmails,
    excludedEmails: selection.excludedEmails,
    cleaningNote: selection.cleaningNote,
    appliedAt: new Date().toISOString(),
    authorId: actor.id,
    authorName: actor.name,
    createdAt: new Date().toISOString(),
  }) satisfies JsonRecord;

const shouldReplaceLeadPrimaryEmail = (
  currentSelection: LeadImportEmailSelectionResult,
  importedSelection: LeadImportEmailSelectionResult
) => {
  if (!importedSelection.selectedEmail) {
    return false;
  }

  if (!currentSelection.selectedEmail) {
    return true;
  }

  if (currentSelection.selectedEmail === importedSelection.selectedEmail) {
    return false;
  }

  return (
    (importedSelection.selectedEmailPriority ?? Number.POSITIVE_INFINITY) <
    (currentSelection.selectedEmailPriority ?? Number.POSITIVE_INFINITY)
  );
};

const ensureRequiredLeadSources = (items: unknown) => {
  const normalized = Array.isArray(items)
    ? items.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [];

  return uniqueStrings([...normalized, ...CRM_DEFAULTS.leadSources]);
};

const mapLead = (row: Record<string, unknown>): any => {
  const record = camelizeRow(row);
  const emails = normalizeJsonField<string[]>(record.emails, []);
  const phones = normalizeJsonField<string[]>(record.phones, []);
  const tags = extractTagStrings(record.tags);
  const safety = computeLeadCampaignSafetyState({
    ...record,
    firstName: record.firstName,
    lastName: record.lastName,
    tags,
    unsubscribed: Boolean(record.unsubscribed),
    bounced: Boolean(record.bounced),
    spamComplaint: Boolean(record.spamComplaint),
    doNotContact: Boolean(record.doNotContact),
    emailConsentStatus: record.emailConsentStatus,
  });
  return {
    ...record,
    contactName: safety.contactName,
    leadType: record.leadType ? String(record.leadType) : null,
    email: record.email ? String(record.email) : emails[0] ?? null,
    phone: record.phone ? String(record.phone) : phones[0] ?? null,
    address: record.address ? String(record.address) : null,
    country: toOptionalString(record.country),
    city: toOptionalString(record.city),
    state: toOptionalString(record.state),
    industry: toOptionalString(record.industry),
    category: toOptionalString(record.category),
    subCategory: toOptionalString(record.subCategory),
    lifecycleStage: toOptionalString(record.lifecycleStage),
    bounceType: toOptionalString(record.bounceType),
    lastCampaignName: toOptionalString(record.lastCampaignName),
    lastCampaignStatus: toOptionalString(record.lastCampaignStatus),
    lastCampaignId: toOptionalString(record.lastCampaignId),
    emails,
    phones,
    tags,
    notes: normalizeJsonField<JsonRecord[]>(record.notes, []),
    hasCustomPortfolio: Boolean(record.hasCustomPortfolio),
    unsubscribed: Boolean(record.unsubscribed),
    bounced: Boolean(record.bounced),
    spamComplaint: Boolean(record.spamComplaint),
    doNotContact: Boolean(record.doNotContact),
    emailConsentStatus: safety.emailConsentStatus,
    emailSentCount: Number(record.emailSentCount ?? 0),
    emailOpenCount: Number(record.emailOpenCount ?? 0),
    emailClickCount: Number(record.emailClickCount ?? 0),
    emailReplyCount: Number(record.emailReplyCount ?? 0),
    hasEmail: safety.hasEmail,
    hasValidEmail: safety.hasValidEmail,
    emailDomain: safety.emailDomain,
    emailType: safety.emailType,
    isFreeEmailProvider: safety.isFreeEmailProvider,
    isCompanyDomainEmail: safety.isCompanyDomainEmail,
    isSupportEmail: safety.isSupportEmail,
    isInfoEmail: safety.isInfoEmail,
    isContactEmail: safety.isContactEmail,
    isSalesEmail: safety.isSalesEmail,
    isHelloEmail: safety.isHelloEmail,
    isMarketingEmail: safety.isMarketingEmail,
    campaignReady: safety.campaignReady,
    canEmail: safety.canEmail,
    agencyOutreachReady: safety.agencyOutreachReady,
    needsEmailReview: safety.needsEmailReview,
    emailRiskLevel: safety.emailRiskLevel,
  };
};

const mapCustomPortfolioLead = (row: Record<string, unknown>): any => {
  const record = camelizeRow(row);
  return {
    ...record,
    categories: normalizeJsonField<string[]>(record.categories, []),
    promotionGoals: normalizeJsonField<string[]>(record.promotionGoals, []),
  };
};

const mapContact = (row: Record<string, unknown>): any => {
  const record = camelizeRow(row);
  return {
    ...record,
    tags: normalizeJsonField<string[]>(record.tags, []),
    notes: normalizeJsonField<JsonRecord[]>(record.notes, []),
  };
};

const mapCompany = (row: Record<string, unknown>): any => {
  const record = camelizeRow(row);
  return {
    ...record,
    tags: normalizeJsonField<string[]>(record.tags, []),
  };
};

const mapDeal = (row: Record<string, unknown>): any => camelizeRow(row);
const mapTask = (row: Record<string, unknown>): any => camelizeRow(row);
const mapActivity = (row: Record<string, unknown>): any => ({
  ...camelizeRow(row),
  metadata: normalizeJsonField<JsonRecord>(
    camelizeRow(row).metadata,
    {}
  ),
});
const mapCampaign = (row: Record<string, unknown>): any => camelizeRow(row);
const mapSegment = (row: Record<string, unknown>): any => ({
  ...camelizeRow(row),
  conditions: normalizeJsonField<unknown[]>(camelizeRow(row).conditions, []),
  limit: toNumberOrNull(camelizeRow(row).segmentLimit),
  sortBy: camelizeRow(row).sortBy ? String(camelizeRow(row).sortBy) : null,
  sortDirection: camelizeRow(row).sortDirection ? String(camelizeRow(row).sortDirection) : "desc",
  randomize: Boolean(camelizeRow(row).randomize),
});

const buildPagination = (query: PaginationQuery) => {
  const page = toInteger(query.page, 1);
  const limit = Math.min(MAX_PAGE_SIZE, toInteger(query.limit, DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * limit;

  return {
    page,
    limit,
    offset,
    q: toTrimmedString(query.q),
    status: toTrimmedString(query.status),
    leadType: toTrimmedString(query.leadType),
    source: toTrimmedString(query.source),
    owner: toTrimmedString(query.owner),
    priority: toTrimmedString(query.priority),
    tags: toTrimmedString(query.tags),
    companyName: toTrimmedString(query.companyName),
    cleanupStatus: toTrimmedString(query.cleanupStatus),
    dateFrom: toTrimmedString(query.dateFrom),
    dateTo: toTrimmedString(query.dateTo),
    sortBy: toTrimmedString(query.sortBy),
    sortOrder: CRM_ALLOWED_SORT_ORDER.has(toTrimmedString(query.sortOrder).toLowerCase())
      ? toTrimmedString(query.sortOrder).toLowerCase()
      : "desc",
  };
};

const getListResult = async <T>(options: {
  table: string;
  alias?: string;
  searchableColumns: string[];
  filters?: Array<{
    queryValue: string;
    clause: string;
  }>;
  dateColumn?: string;
  selectSql?: string;
  sortColumnMap?: Record<string, string>;
  query: PaginationQuery;
  mapRow: (row: Record<string, unknown>) => T;
}) => {
  return withSchemaRecovery(async () => {
    const pool = await getAnalyticsPool();
    const alias = options.alias ?? options.table;
    const pagination = buildPagination(options.query);
    const values: unknown[] = [];
    const whereClauses = [`${alias}.deleted_at IS NULL`];

    if (pagination.q) {
      const likeValue = `%${pagination.q}%`;
      const searchClauses = options.searchableColumns.map((column) => {
        values.push(likeValue);
        return `${column} ILIKE $${values.length}`;
      });
      whereClauses.push(`(${searchClauses.join(" OR ")})`);
    }

    (options.filters ?? []).forEach((filter) => {
      if (!filter.queryValue) {
        return;
      }

      values.push(filter.queryValue);
      whereClauses.push(filter.clause.replace("?", `$${values.length}`));
    });

    if (options.dateColumn && pagination.dateFrom) {
      values.push(pagination.dateFrom);
      whereClauses.push(`${options.dateColumn}::date >= $${values.length}`);
    }

    if (options.dateColumn && pagination.dateTo) {
      values.push(pagination.dateTo);
      whereClauses.push(`${options.dateColumn}::date <= $${values.length}`);
    }

    const allowedSortMap = options.sortColumnMap ?? {};
    const sortColumn =
      allowedSortMap[pagination.sortBy] ??
      allowedSortMap.createdAt ??
      `${alias}.created_at`;
    const whereSql = `WHERE ${whereClauses.join(" AND ")}`;

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM ${options.table} ${alias} ${whereSql}`,
      values
    );

    values.push(pagination.limit);
    values.push(pagination.offset);

    const result = await pool.query(
      `
        ${options.selectSql ?? `SELECT ${alias}.* FROM ${options.table} ${alias}`}
        ${whereSql}
        ORDER BY ${sortColumn} ${pagination.sortOrder}, ${alias}.id DESC
        LIMIT $${values.length - 1}
        OFFSET $${values.length}
      `,
      values
    );

    const total = Number(countResult.rows[0]?.total ?? 0);

    return {
      items: (result.rows as Array<Record<string, unknown>>).map(options.mapRow),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / pagination.limit) : 0,
      },
    };
  });
};

const getRecordById = async <T>(
  table: string,
  id: number,
  mapRow: (row: Record<string, unknown>) => T
) => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `SELECT * FROM ${table} WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [id]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapRow(result.rows[0] as Record<string, unknown>);
};

const resolveAdminOwner = async (ownerValue: unknown) => {
  const ownerId = toNumberOrNull(ownerValue);
  if (ownerId == null) {
    return null;
  }

  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      SELECT id, name, email
      FROM admins
      WHERE id = $1
      LIMIT 1
    `,
    [ownerId]
  );

  if (result.rowCount === 0) {
    throw new Error("Assigned owner is invalid.");
  }

  return Number(result.rows[0].id);
};

const insertActivity = async (payload: {
  activityType: string;
  title: string;
  description?: string | null;
  relatedType?: string | null;
  relatedId?: number | null;
  actor: AdminActor;
  metadata?: JsonRecord;
}) => {
  const pool = await getAnalyticsPool();
  await pool.query(
    `
      INSERT INTO crm_activities (
        activity_type,
        title,
        description,
        related_type,
        related_id,
        actor_id,
        actor_name,
        metadata,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
    `,
    [
      payload.activityType,
      payload.title,
      payload.description ?? null,
      payload.relatedType ?? null,
      payload.relatedId ?? null,
      payload.actor.id,
      payload.actor.name,
      JSON.stringify(payload.metadata ?? {}),
    ]
  );
};

const appendNote = (
  existingNotes: JsonRecord[],
  text: string,
  actor: AdminActor
) => {
  const note = {
    id: `note-${Date.now()}`,
    text,
    authorId: actor.id,
    authorName: actor.name,
    createdAt: new Date().toISOString(),
  };

  return [...existingNotes, note];
};

const sanitizeLeadPayload = async (
  payload: Record<string, unknown>,
  actor: AdminActor
) => {
  // Campaign safety flags must never be reset casually. These always block sending when true.
  const firstName = toTrimmedString(payload.firstName);
  const lastName = toTrimmedString(payload.lastName);
  const companyName = toTrimmedString(payload.companyName);
  const emails = toEmailArray(payload.emails ?? payload.email, "Lead email");
  const phones = toPhoneArray(payload.phones ?? payload.phone);
  const email = emails[0] ?? null;
  const phone = phones[0] ?? null;
  const unsubscribed = parseBooleanLikeValue(payload.unsubscribed ?? false);
  const bounced = parseBooleanLikeValue(payload.bounced ?? false);
  const spamComplaint = parseBooleanLikeValue(payload.spamComplaint ?? false);
  const doNotContact = parseBooleanLikeValue(payload.doNotContact ?? false);
  const emailConsentStatus = assertEmailConsentStatus(payload.emailConsentStatus ?? "unknown");
  const bounceType = normalizeBounceType(payload.bounceType);
  const leadScore = toFiniteNumber(payload.leadScore ?? 0, "leadScore", {
    min: 0,
    max: 100,
  });
  const estimatedValue = toFiniteNumber(payload.estimatedValue ?? 0, "estimatedValue", {
    min: 0,
  });
  const emailSentCount = toFiniteNumber(payload.emailSentCount ?? 0, "emailSentCount", {
    min: 0,
  });
  const emailOpenCount = toFiniteNumber(payload.emailOpenCount ?? 0, "emailOpenCount", {
    min: 0,
  });
  const emailClickCount = toFiniteNumber(payload.emailClickCount ?? 0, "emailClickCount", {
    min: 0,
  });
  const emailReplyCount = toFiniteNumber(payload.emailReplyCount ?? 0, "emailReplyCount", {
    min: 0,
  });

  if (!firstName && !lastName && !companyName && emails.length === 0) {
    throw new Error("At least one of firstName, lastName, companyName, or email is required.");
  }

  if (bounceType && !bounced) {
    throw new Error("bounceType can only be set when bounced is true.");
  }

  return {
    firstName: firstName || null,
    lastName: lastName || null,
    email,
    phone,
    emails,
    phones,
    address: toOptionalString(payload.address),
    companyName: companyName || null,
    country: toOptionalString(payload.country),
    city: toOptionalString(payload.city),
    state: toOptionalString(payload.state),
    industry: toOptionalString(payload.industry),
    category: toOptionalString(payload.category),
    subCategory: toOptionalString(payload.subCategory),
    jobTitle: toOptionalString(payload.jobTitle),
    website: toUrl(payload.website, "Website"),
    lifecycleStage: toOptionalString(payload.lifecycleStage),
    leadType: assertAllowed(
      toOptionalString(payload.leadType),
      [...CRM_LEAD_TYPES],
      "leadType"
    ),
    leadSource:
      assertAllowed(
        toOptionalString(payload.leadSource),
        CRM_DEFAULTS.leadSources,
        "leadSource"
      ) ?? "Other",
    leadStatus:
      assertAllowed(
        toOptionalString(payload.leadStatus),
        CRM_DEFAULTS.leadStatuses,
        "leadStatus"
      ) ?? "New",
    leadPriority:
      assertAllowed(
        toOptionalString(payload.leadPriority),
        CRM_DEFAULTS.leadPriorities,
        "leadPriority"
      ) ?? "Medium",
    leadScore,
    estimatedValue,
    currency: toOptionalString(payload.currency) ?? CRM_DEFAULTS.defaultCurrency,
    assignedTo: await resolveAdminOwner(payload.assignedTo ?? actor.id),
    tags: toTagArray(payload.tags),
    notes: Array.isArray(payload.notes)
      ? (payload.notes as JsonRecord[])
      : [],
    unsubscribed,
    bounced,
    bounceType,
    spamComplaint,
    doNotContact,
    emailConsentStatus,
    lastEmailSentAt: toIsoDateTimeOrNull(payload.lastEmailSentAt, "lastEmailSentAt"),
    emailSentCount,
    lastEmailOpenedAt: toIsoDateTimeOrNull(payload.lastEmailOpenedAt, "lastEmailOpenedAt"),
    emailOpenCount,
    lastEmailClickedAt: toIsoDateTimeOrNull(payload.lastEmailClickedAt, "lastEmailClickedAt"),
    emailClickCount,
    lastEmailRepliedAt: toIsoDateTimeOrNull(payload.lastEmailRepliedAt, "lastEmailRepliedAt"),
    emailReplyCount,
    lastCampaignName: toOptionalString(payload.lastCampaignName),
    lastCampaignStatus: toOptionalString(payload.lastCampaignStatus),
    lastCampaignId: toOptionalString(payload.lastCampaignId),
    nextFollowUpAt: toIsoDateTimeOrNull(payload.nextFollowUpAt, "nextFollowUpAt"),
  };
};

const sanitizeContactPayload = async (
  payload: Record<string, unknown>,
  actor: AdminActor
) => {
  const firstName = toTrimmedString(payload.firstName);
  if (!firstName) {
    throw new Error("firstName is required.");
  }

  return {
    firstName,
    lastName: toOptionalString(payload.lastName),
    email: toEmail(payload.email, "Contact email"),
    phone: toOptionalString(payload.phone),
    alternatePhone: toOptionalString(payload.alternatePhone),
    companyId: toNumberOrNull(payload.companyId),
    companyName: toOptionalString(payload.companyName),
    jobTitle: toOptionalString(payload.jobTitle),
    department: toOptionalString(payload.department),
    contactType:
      assertAllowed(
        toOptionalString(payload.contactType),
        CRM_DEFAULTS.contactTypes,
        "contactType"
      ) ?? "Prospect",
    lifecycleStage:
      assertAllowed(
        toOptionalString(payload.lifecycleStage),
        CRM_DEFAULTS.lifecycleStages,
        "lifecycleStage"
      ) ?? "Lead",
    owner: await resolveAdminOwner(payload.owner ?? actor.id),
    tags: toArrayOfStrings(payload.tags),
    notes: Array.isArray(payload.notes)
      ? (payload.notes as JsonRecord[])
      : [],
    lastContactedAt: toIsoDateTimeOrNull(payload.lastContactedAt, "lastContactedAt"),
    nextFollowUpAt: toIsoDateTimeOrNull(payload.nextFollowUpAt, "nextFollowUpAt"),
  };
};

const resolveLeadImportOwner = async (ownerValue: unknown, actor: AdminActor) => {
  const normalized = toTrimmedString(ownerValue);
  if (!normalized) {
    return actor.id;
  }

  if (
    ["admin", "current", "me"].includes(normalized.toLowerCase()) ||
    normalized.toLowerCase() === actor.email.toLowerCase() ||
    normalized.toLowerCase() === actor.name.toLowerCase()
  ) {
    return actor.id;
  }

  const numericOwnerId = toNumberOrNull(normalized);
  if (numericOwnerId != null) {
    return resolveAdminOwner(numericOwnerId);
  }

  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      SELECT id
      FROM admins
      WHERE LOWER(email) = LOWER($1) OR LOWER(name) = LOWER($1)
      LIMIT 1
    `,
    [normalized]
  );

  if (result.rowCount === 0) {
    throw new Error(`assignedTo could not be resolved for "${normalized}".`);
  }

  return Number(result.rows[0].id);
};

const parseLeadImportOptions = (payload: Record<string, unknown>): LeadImportOptions => {
  const duplicateStrategyRaw = toTrimmedString(payload.duplicateStrategy).toLowerCase();
  const duplicateStrategy =
    duplicateStrategyRaw === "update" || duplicateStrategyRaw === "allow"
      ? duplicateStrategyRaw
      : duplicateStrategyRaw === "skip"
        ? "skip"
        : "skip";

  const createActivityLogsRaw = payload.createActivityLogs;
  const createActivityLogs =
    typeof createActivityLogsRaw === "boolean"
      ? createActivityLogsRaw
      : String(createActivityLogsRaw ?? "true").toLowerCase() !== "false";

  return {
    duplicateStrategy,
    createActivityLogs,
  };
};

const parseCsvRows = async (buffer: Buffer) => {
  const csvText = buffer.toString("utf8").replace(/^\uFEFF/, "");

  return new Promise<{
    rows: Array<{ row: number; values: Record<string, string> }>;
    headers: string[];
    ignoredHeaders: string[];
  }>((resolve, reject) => {
    const rows: Array<{ row: number; values: Record<string, string> }> = [];
    let headers: string[] = [];

    Readable.from([csvText])
      .pipe(
        csvParser({
          mapHeaders: ({ header }) => normalizeCsvHeader(header),
          mapValues: ({ value }) => String(value ?? "").trim(),
        })
      )
      .on("headers", (incomingHeaders: string[]) => {
        headers = incomingHeaders.filter(Boolean);
      })
      .on("data", (row: Record<string, string>) => {
        if (rows.length >= MAX_LEAD_IMPORT_ROWS) {
          reject(new Error("Maximum 2,000 leads can be imported at once."));
          return;
        }

        const normalizedRow = Object.entries(row).reduce<Record<string, string>>((accumulator, [key, value]) => {
          const resolvedKey = resolveLeadImportHeader(key);
          const normalizedValue = String(value ?? "").trim();
          if (!normalizedValue) {
            return accumulator;
          }

          if (accumulator[resolvedKey] && ["email", "emails", "phone"].includes(resolvedKey)) {
            accumulator[resolvedKey] = `${accumulator[resolvedKey]}\n${normalizedValue}`;
            return accumulator;
          }

          if (!accumulator[resolvedKey]) {
            accumulator[resolvedKey] = normalizedValue;
          }

          return accumulator;
        }, {});

        if (isCsvLeadRowEmpty(normalizedRow)) {
          return;
        }

        rows.push({
          row: rows.length + 2,
          values: normalizedRow,
        });
      })
      .on("end", () => {
        const recognizedHeaders = headers.filter((header) =>
          CRM_LEAD_IMPORT_HEADERS.includes(
            resolveLeadImportHeader(header) as (typeof CRM_LEAD_IMPORT_HEADERS)[number]
          )
        );
        if (recognizedHeaders.length === 0) {
          reject(
            new Error(
              "CSV headers are invalid. Please use the sample CSV and keep the column names unchanged."
            )
          );
          return;
        }

        resolve({
          rows,
          headers,
          ignoredHeaders: headers.filter(
            (header) =>
              !CRM_LEAD_IMPORT_HEADERS.includes(
                resolveLeadImportHeader(header) as (typeof CRM_LEAD_IMPORT_HEADERS)[number]
              )
          ),
        });
      })
      .on("error", (error) => {
        reject(new Error(readErrorMessage(error, "Failed to parse CSV file.")));
      });
  });
};

const parseLeadEmailCleanupCsvRows = async (buffer: Buffer) => {
  const csvText = buffer.toString("utf8").replace(/^\uFEFF/, "");

  return new Promise<{
    rows: Array<{ row: number; values: Record<string, string> }>;
    headers: string[];
    ignoredHeaders: string[];
  }>((resolve, reject) => {
    const rows: Array<{ row: number; values: Record<string, string> }> = [];
    let headers: string[] = [];

    Readable.from([csvText])
      .pipe(
        csvParser({
          mapHeaders: ({ header }) => normalizeCleanupCsvHeader(header),
          mapValues: ({ value }) => String(value ?? "").trim(),
        })
      )
      .on("headers", (incomingHeaders: string[]) => {
        headers = incomingHeaders.filter(Boolean);
      })
      .on("data", (row: Record<string, string>) => {
        if (rows.length >= MAX_LEAD_IMPORT_ROWS) {
          reject(new Error("Maximum 2,000 cleanup rows can be processed at once."));
          return;
        }

        const normalizedRow = Object.fromEntries(
          Object.entries(row).map(([key, value]) => [normalizeCleanupCsvHeader(key), String(value ?? "").trim()])
        );

        if (isCsvLeadEmailCleanupRowEmpty(normalizedRow)) {
          return;
        }

        rows.push({
          row: rows.length + 2,
          values: normalizedRow,
        });
      })
      .on("end", () => {
        if (!headers.includes("bestemail")) {
          reject(new Error('CSV must include a "Best Email" column.'));
          return;
        }

        resolve({
          rows,
          headers,
          ignoredHeaders: headers.filter(
            (header) =>
              !CRM_LEAD_EMAIL_CLEANUP_HEADERS.includes(
                header as (typeof CRM_LEAD_EMAIL_CLEANUP_HEADERS)[number]
              )
          ),
        });
      })
      .on("error", (error) => {
        reject(new Error(readErrorMessage(error, "Failed to parse cleanup CSV file.")));
      });
  });
};

const isSendStatusSendable = (value: string | null) =>
  toTrimmedString(value).toLowerCase() === "sendable";

const isFreeMailboxLead = (bestEmail: string, bestEmailType: string | null) => {
  const normalizedType = toTrimmedString(bestEmailType).toLowerCase();
  const emailDomain = bestEmail.split("@")[1]?.toLowerCase() ?? "";
  const freeDomains = new Set([
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "live.com",
    "msn.com",
    "aol.com",
    "icloud.com",
    "me.com",
    "proton.me",
    "protonmail.com",
    "gmx.com",
  ]);

  return normalizedType.includes("gmail") || normalizedType.includes("free") || freeDomains.has(emailDomain);
};

const isSupportLead = (bestEmail: string, bestEmailType: string | null) => {
  const normalizedType = toTrimmedString(bestEmailType).toLowerCase();
  return normalizedType.includes("support") || bestEmail.toLowerCase().startsWith("support@");
};

const buildLeadEmailCleanupTags = (
  existingTags: string[],
  bestEmail: string,
  bestEmailType: string | null,
  sendStatus: string | null,
  safetySnapshot?: Record<string, unknown>
) => {
  const cleanupManagedTags = new Set([
    "agency_outreach_ready",
    "gmail_lead",
    "support_lead",
    "email_needs_review",
  ]);
  const nextTags = existingTags.filter((tag) => !cleanupManagedTags.has(String(tag).toLowerCase()));

  nextTags.push("email_cleaned");

  const canMarkReady = safetySnapshot ? canSendEmailToLead(safetySnapshot) : true;

  if (isSendStatusSendable(sendStatus) && canMarkReady) {
    nextTags.push("agency_outreach_ready");
  } else if (sendStatus) {
    nextTags.push("email_needs_review");
  }

  if (isFreeMailboxLead(bestEmail, bestEmailType)) {
    nextTags.push("gmail_lead");
  }

  if (isSupportLead(bestEmail, bestEmailType)) {
    nextTags.push("support_lead");
  }

  return uniqueStrings(nextTags);
};

const buildLeadEmailCleanupNote = (draft: CsvLeadEmailCleanupDraft, actor: AdminActor) => {
  const appliedAt = new Date().toISOString();
  return {
    id: `note-email-cleanup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: "Email cleanup applied for agency outreach.",
    bestEmail: draft.bestEmail,
    bestEmailType: draft.bestEmailType ?? null,
    emailCountInOriginalRow: draft.emailCountInOriginalRow ?? 0,
    excludedEmails: draft.excludedEmails ?? [],
    otherSendableEmails: draft.otherSendableEmails ?? [],
    cleaningNote: draft.cleaningNote ?? null,
    appliedAt,
    authorId: actor.id,
    authorName: actor.name,
    createdAt: appliedAt,
  } satisfies JsonRecord;
};

const loadLeadByCompanyAndWebsite = async (companyName: string, website: string) => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      SELECT *
      FROM crm_leads
      WHERE deleted_at IS NULL
        AND LOWER(COALESCE(company_name, '')) = LOWER($1)
        AND LOWER(COALESCE(website, '')) = LOWER($2)
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    [companyName, website]
  );

  return result.rowCount > 0 ? mapLead(result.rows[0] as Record<string, unknown>) : null;
};

const loadLeadByCandidateEmails = async (emails: string[]) => {
  if (emails.length === 0) {
    return null;
  }

  const normalizedEmails = emails.map((email) => email.toLowerCase());
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      SELECT *
      FROM crm_leads
      WHERE deleted_at IS NULL
        AND (
          (email IS NOT NULL AND LOWER(email) = ANY($1::text[]))
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(emails, '[]'::jsonb)) AS email_entry(value)
            WHERE LOWER(email_entry.value) = ANY($1::text[])
          )
        )
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    [normalizedEmails]
  );

  return result.rowCount > 0 ? mapLead(result.rows[0] as Record<string, unknown>) : null;
};

const resolveLeadEmailCleanupMatch = async (draft: CsvLeadEmailCleanupDraft) => {
  if (draft.leadId && Number.isFinite(draft.leadId) && draft.leadId > 0) {
    const byId = await getLeadById(draft.leadId);
    if (byId) {
      return {
        lead: byId,
        matchMethod: "id" as const,
      };
    }
  }

  if (draft.companyName && draft.website) {
    const byCompanyWebsite = await loadLeadByCompanyAndWebsite(draft.companyName, draft.website);
    if (byCompanyWebsite) {
      return {
        lead: byCompanyWebsite,
        matchMethod: "company_website" as const,
      };
    }
  }

  if (draft.candidateEmails && draft.candidateEmails.length > 0) {
    const byEmail = await loadLeadByCandidateEmails(draft.candidateEmails);
    if (byEmail) {
      return {
        lead: byEmail,
        matchMethod: "email" as const,
      };
    }
  }

  return null;
};

const prepareLeadEmailCleanup = async (buffer: Buffer) => {
  const parsedCsv = await parseLeadEmailCleanupCsvRows(buffer);
  if (parsedCsv.rows.length === 0) {
    throw new Error("The cleanup CSV file is empty or contains no valid rows.");
  }

  const warnings =
    parsedCsv.ignoredHeaders.length > 0
      ? ["Some cleanup columns were ignored because they are not supported."]
      : [];

  const drafts: CsvLeadEmailCleanupDraft[] = [];
  const errors: LeadEmailCleanupError[] = [];

  for (const csvRow of parsedCsv.rows) {
    const row = csvRow.values;
    const bestEmail = firstNonEmptyCleanupValue(row, ["bestemail"]).toLowerCase();
    const bestEmailType = toOptionalString(firstNonEmptyCleanupValue(row, ["bestemailtype"]));
    const sendStatusColumnExists = parsedCsv.headers.includes("sendstatus");
    const sendStatus = toOptionalString(firstNonEmptyCleanupValue(row, ["sendstatus"]));
    const companyName = toOptionalString(firstNonEmptyCleanupValue(row, ["companyname"]));
    const website = toOptionalString(firstNonEmptyCleanupValue(row, ["website"]));
    const rowLeadId = toNumberOrNull(firstNonEmptyCleanupValue(row, ["id"]));
    const excludedEmails = parseDelimitedValues(firstNonEmptyCleanupValue(row, ["excludedemails"])).map((entry) => entry.toLowerCase());
    const otherSendableEmails = parseDelimitedValues(firstNonEmptyCleanupValue(row, ["othersendableemails"])).map((entry) => entry.toLowerCase());
    const rowEmails = [
      ...parseDelimitedValues(firstNonEmptyCleanupValue(row, ["email"])),
      ...parseDelimitedValues(firstNonEmptyCleanupValue(row, ["emails"])),
      ...parseDelimitedValues(firstNonEmptyCleanupValue(row, ["originalemails"])),
      ...parseDelimitedValues(firstNonEmptyCleanupValue(row, ["allemails"])),
      bestEmail,
      ...excludedEmails,
      ...otherSendableEmails,
    ]
      .map((entry) => entry.toLowerCase())
      .filter(Boolean);
    const candidateEmails = uniqueStrings(rowEmails);
    const originalEmailCountRaw = toNumberOrNull(firstNonEmptyCleanupValue(row, ["emailcountinoriginalrow"]));
    const emailCountInOriginalRow = originalEmailCountRaw ?? candidateEmails.length;
    const cleaningNote = toOptionalString(firstNonEmptyCleanupValue(row, ["cleaningnote"]));

    if (!bestEmail) {
      drafts.push({
        row: csvRow.row,
        raw: row,
        status: "skipped",
        reason: "Best Email is empty.",
        companyName,
        website,
        bestEmail: null,
      });
      errors.push({
        row: csvRow.row,
        field: "Best Email",
        message: "Best Email is empty.",
      });
      continue;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bestEmail)) {
      drafts.push({
        row: csvRow.row,
        raw: row,
        status: "skipped",
        reason: "Best Email must be a valid email address.",
        companyName,
        website,
        bestEmail,
      });
      errors.push({
        row: csvRow.row,
        field: "Best Email",
        message: "Best Email must be a valid email address.",
      });
      continue;
    }

    if (sendStatusColumnExists && !sendStatus) {
      drafts.push({
        row: csvRow.row,
        raw: row,
        status: "skipped",
        reason: "Send Status is required when the column is present.",
        companyName,
        website,
        bestEmail,
        bestEmailType,
      });
      errors.push({
        row: csvRow.row,
        field: "Send Status",
        message: "Send Status is required when the column is present.",
      });
      continue;
    }

    const draft: CsvLeadEmailCleanupDraft = {
      row: csvRow.row,
      raw: row,
      status: "unmatched",
      leadId: rowLeadId,
      companyName,
      website,
      bestEmail,
      bestEmailType,
      sendStatus,
      emailCountInOriginalRow,
      excludedEmails,
      otherSendableEmails,
      cleaningNote,
      candidateEmails,
    };

    const matched = await resolveLeadEmailCleanupMatch(draft);
    if (!matched) {
      draft.reason = "No existing active CRM lead matched this row.";
      drafts.push(draft);
      continue;
    }

    draft.status = "matched";
    draft.matchedLead = matched.lead;
    draft.leadId = Number(matched.lead.id);
    draft.matchMethod = matched.matchMethod;
    drafts.push(draft);
  }

  const matchedRows = drafts.filter((draft) => draft.status === "matched");
  const unmatchedRows = drafts.filter((draft) => draft.status === "unmatched");
  const skippedRows = drafts.filter((draft) => draft.status === "skipped");

  const preview: LeadEmailCleanupPreview = {
    totalRows: drafts.length,
    matchedRows: matchedRows.length,
    unmatchedRows: unmatchedRows.length,
    willUpdate: matchedRows.length,
    skippedRows: skippedRows.length,
    errors,
    sampleMatchedRecords: matchedRows.slice(0, 10).map((draft) => ({
      row: draft.row,
      leadId: Number(draft.leadId ?? 0),
      companyName: draft.matchedLead?.companyName ?? draft.companyName ?? null,
      website: draft.matchedLead?.website ?? draft.website ?? null,
      currentEmail: draft.matchedLead?.email ?? null,
      bestEmail: String(draft.bestEmail ?? ""),
      bestEmailType: draft.bestEmailType ?? null,
      sendStatus: draft.sendStatus ?? null,
      matchMethod: draft.matchMethod ?? "email",
    })),
    sampleUnmatchedRecords: unmatchedRows.slice(0, 10).map((draft) => ({
      row: draft.row,
      companyName: draft.companyName ?? null,
      website: draft.website ?? null,
      bestEmail: draft.bestEmail ?? null,
      reason: draft.reason ?? "No existing active CRM lead matched this row.",
    })),
    warnings,
  };

  return {
    drafts,
    preview,
  };
};

const fetchExistingLeadsByEmail = async (emails: string[]) => {
  if (emails.length === 0) {
    return new Map<string, any>();
  }

  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      SELECT *
      FROM crm_leads
      WHERE deleted_at IS NULL
        AND (
          (email IS NOT NULL AND LOWER(email) = ANY($1::text[]))
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(emails, '[]'::jsonb)) AS email_entry(value)
            WHERE LOWER(email_entry.value) = ANY($1::text[])
          )
        )
    `,
    [emails]
  );

  const existingLeads = new Map<string, any>();
  for (const row of result.rows as Array<Record<string, unknown>>) {
    const mapped = mapLead(row);
    const leadEmails = Array.isArray(mapped.emails) && mapped.emails.length > 0
      ? mapped.emails
      : mapped.email
        ? [mapped.email]
        : [];
    leadEmails.forEach((email: string) => {
      existingLeads.set(String(email).toLowerCase(), mapped);
    });
  }

  return existingLeads;
};

const buildLeadImportPayload = async (
  row: Record<string, string>,
  actor: AdminActor,
  emailSelection: LeadImportEmailSelectionResult,
  importOperationId: string
) => {
  const unsubscribed = row.unsubscribed ? parseBooleanLikeValue(row.unsubscribed) : false;
  const bounced = row.bounced ? parseBooleanLikeValue(row.bounced) : false;
  const spamComplaint = row.spamComplaint ? parseBooleanLikeValue(row.spamComplaint) : false;
  const doNotContact = row.doNotContact ? parseBooleanLikeValue(row.doNotContact) : false;
  const emailConsentStatus = row.emailConsentStatus
    ? assertEmailConsentStatus(row.emailConsentStatus)
    : "unknown";
  const shouldMarkAgencyReady =
    Boolean(emailSelection.selectedEmail) &&
    !unsubscribed &&
    !bounced &&
    !spamComplaint &&
    !doNotContact &&
    !["unsubscribed", "do_not_contact"].includes(emailConsentStatus);
  const importProvidedSafetyFields = [
    row.unsubscribed ? "unsubscribed" : null,
    row.bounced ? "bounced" : null,
    row.bounceType ? "bounceType" : null,
    row.spamComplaint ? "spamComplaint" : null,
    row.doNotContact ? "doNotContact" : null,
    row.emailConsentStatus ? "emailConsentStatus" : null,
  ].filter(Boolean);
  const notes = [
    ...buildImportedNote(toOptionalString(row.notes), actor),
    buildLeadImportEmailSelectionNote(emailSelection, actor, importOperationId),
  ];
  const orderedEmails = emailSelection.selectedEmail
    ? uniqueStrings([emailSelection.selectedEmail, ...emailSelection.allValidEmails])
    : emailSelection.allValidEmails;
  return {
    firstName: toOptionalString(row.firstName),
    lastName: toOptionalString(row.lastName),
    email: emailSelection.selectedEmail,
    phone: toOptionalString(row.phone),
    emails: orderedEmails,
    phones: splitCommaSeparatedValues(row.phone),
    address: toOptionalString(row.address),
    companyName: toOptionalString(row.companyName),
    country: toOptionalString(row.country),
    city: toOptionalString(row.city),
    state: toOptionalString(row.state),
    industry: toOptionalString(row.industry),
    category: toOptionalString(row.category),
    subCategory: toOptionalString(row.subCategory),
    jobTitle: toOptionalString(row.jobTitle),
    website: toOptionalString(row.website),
    lifecycleStage: toOptionalString(row.lifecycleStage),
    leadType: toOptionalString(row.leadType) ?? "Consumer",
    leadSource: toOptionalString(row.leadSource) ?? "Manual Entry",
    leadStatus: toOptionalString(row.leadStatus) ?? "New",
    leadPriority: toOptionalString(row.leadPriority) ?? "Medium",
    leadScore: toOptionalString(row.leadScore) ?? 0,
    estimatedValue: toOptionalString(row.estimatedValue) ?? 0,
    currency: toOptionalString(row.currency) ?? CRM_DEFAULTS.defaultCurrency,
    assignedTo: await resolveLeadImportOwner(row.assignedTo, actor),
    tags: buildLeadImportEmailTags(toTagArray(row.tags), {
      ...emailSelection,
      selectedEmail: shouldMarkAgencyReady ? emailSelection.selectedEmail : null,
    }),
    notes,
    unsubscribed,
    bounced,
    bounceType: toOptionalString(row.bounceType),
    spamComplaint,
    doNotContact,
    emailConsentStatus,
    importProvidedSafetyFields,
    nextFollowUpAt: toOptionalString(row.nextFollowUpAt),
  };
};

const buildLeadImportUpdatePayload = (
  existingLead: any,
  payload: Record<string, unknown>
) => {
  const importProvidedSafetyFields = Array.isArray(payload.importProvidedSafetyFields)
    ? (payload.importProvidedSafetyFields as string[])
    : [];
  const noteEntries = Array.isArray(payload.notes) ? (payload.notes as JsonRecord[]) : [];
  const existingNotes = Array.isArray(existingLead.notes) ? (existingLead.notes as JsonRecord[]) : [];
  const existingEmails = uniqueStrings(
    [
      ...(Array.isArray(existingLead.emails) ? existingLead.emails : []),
      toOptionalString(existingLead.email) ?? "",
    ].filter(Boolean)
  );
  const importedEmails = Array.isArray(payload.emails)
    ? uniqueStrings((payload.emails as unknown[]).map((entry) => String(entry ?? "").toLowerCase()))
    : [];
  const mergedEmails = uniqueStrings([...existingEmails, ...importedEmails]);
  const currentSelection = selectBestLeadEmail(existingEmails, toOptionalString(existingLead.website));
  const importedSelection = selectBestLeadEmail(
    importedEmails,
    toOptionalString(payload.website) ?? toOptionalString(existingLead.website)
  );
  const shouldReplacePrimaryEmail = shouldReplaceLeadPrimaryEmail(currentSelection, importedSelection);
  const mergedSafetySnapshot = {
    email: shouldReplacePrimaryEmail && importedSelection.selectedEmail ? importedSelection.selectedEmail : existingLead.email,
    tags: uniqueStrings([
      ...(Array.isArray(existingLead.tags) ? existingLead.tags : []),
      ...(Array.isArray(payload.tags) ? (payload.tags as string[]) : []),
    ]),
    unsubscribed: importProvidedSafetyFields.includes("unsubscribed")
      ? Boolean(payload.unsubscribed)
      : Boolean(existingLead.unsubscribed),
    bounced: importProvidedSafetyFields.includes("bounced")
      ? Boolean(payload.bounced)
      : Boolean(existingLead.bounced),
    spamComplaint: importProvidedSafetyFields.includes("spamComplaint")
      ? Boolean(payload.spamComplaint)
      : Boolean(existingLead.spamComplaint),
    doNotContact: importProvidedSafetyFields.includes("doNotContact")
      ? Boolean(payload.doNotContact)
      : Boolean(existingLead.doNotContact),
    emailConsentStatus: importProvidedSafetyFields.includes("emailConsentStatus")
      ? payload.emailConsentStatus
      : existingLead.emailConsentStatus,
  };
  const mergedSafetyState = computeLeadCampaignSafetyState(mergedSafetySnapshot);
  const mergedTags = uniqueStrings(
    mergedSafetySnapshot.tags.filter((tag) =>
      mergedSafetyState.canEmail ? true : String(tag).toLowerCase() !== "agency_outreach_ready"
    )
  );
  const existingImportOperationIds = new Set(
    existingNotes
      .map((note) =>
        note && typeof note === "object" && "importOperationId" in note
          ? String((note as JsonRecord).importOperationId ?? "")
          : ""
      )
      .filter(Boolean)
  );
  const dedupedIncomingNotes = noteEntries.filter((note) => {
    const operationId =
      note && typeof note === "object" && "importOperationId" in note
        ? String((note as JsonRecord).importOperationId ?? "")
        : "";
    return !operationId || !existingImportOperationIds.has(operationId);
  });
  const mergedNotes =
    dedupedIncomingNotes.length > 0 ? [...existingNotes, ...dedupedIncomingNotes] : undefined;

  return {
    ...(payload.firstName ? { firstName: payload.firstName } : {}),
    ...(payload.lastName ? { lastName: payload.lastName } : {}),
    ...(shouldReplacePrimaryEmail && importedSelection.selectedEmail
      ? { email: importedSelection.selectedEmail }
      : {}),
    ...(payload.phone ? { phone: payload.phone } : {}),
    ...(mergedEmails.length > 0 ? { emails: mergedEmails } : {}),
    ...(payload.phones ? { phones: payload.phones } : {}),
    ...(payload.address ? { address: payload.address } : {}),
    ...(payload.companyName ? { companyName: payload.companyName } : {}),
    ...(payload.jobTitle ? { jobTitle: payload.jobTitle } : {}),
    ...(payload.website ? { website: payload.website } : {}),
    ...(payload.leadType ? { leadType: payload.leadType } : {}),
    ...(payload.leadSource ? { leadSource: payload.leadSource } : {}),
    ...(payload.leadStatus ? { leadStatus: payload.leadStatus } : {}),
    ...(payload.leadPriority ? { leadPriority: payload.leadPriority } : {}),
    ...(payload.leadScore !== undefined ? { leadScore: payload.leadScore } : {}),
    ...(payload.estimatedValue !== undefined ? { estimatedValue: payload.estimatedValue } : {}),
    ...(payload.currency ? { currency: payload.currency } : {}),
    ...(payload.assignedTo ? { assignedTo: payload.assignedTo } : {}),
    ...(mergedTags.length > 0 ? { tags: mergedTags } : {}),
    ...(importProvidedSafetyFields.includes("unsubscribed") ? { unsubscribed: payload.unsubscribed } : {}),
    ...(importProvidedSafetyFields.includes("bounced") ? { bounced: payload.bounced } : {}),
    ...(importProvidedSafetyFields.includes("bounceType") ? { bounceType: payload.bounceType } : {}),
    ...(importProvidedSafetyFields.includes("spamComplaint") ? { spamComplaint: payload.spamComplaint } : {}),
    ...(importProvidedSafetyFields.includes("doNotContact") ? { doNotContact: payload.doNotContact } : {}),
    ...(importProvidedSafetyFields.includes("emailConsentStatus")
      ? { emailConsentStatus: payload.emailConsentStatus }
      : {}),
    ...(mergedNotes ? { notes: mergedNotes } : {}),
    ...(payload.nextFollowUpAt ? { nextFollowUpAt: payload.nextFollowUpAt } : {}),
  } as Record<string, unknown>;
};

const prepareLeadImport = async (
  buffer: Buffer,
  options: LeadImportOptions,
  actor: AdminActor,
  importOperationId: string
) => {
  const parsedCsv = await parseCsvRows(buffer);
  if (parsedCsv.rows.length === 0) {
    throw new Error("The CSV file is empty or contains no valid rows.");
  }

  const warnings =
    parsedCsv.ignoredHeaders.length > 0
      ? ["Some columns were ignored because they are not supported."]
      : [];

  const drafts: CsvLeadDraft[] = [];
  const errors: LeadImportError[] = [];

  for (const csvRow of parsedCsv.rows) {
    const emailSelection = selectBestLeadEmail(
      collectLeadImportRowEmails(csvRow.values),
      toOptionalString(csvRow.values.website)
    );

    try {
      const payload = await buildLeadImportPayload(
        csvRow.values,
        actor,
        emailSelection,
        importOperationId
      );
      await sanitizeLeadPayload(payload, actor);
      drafts.push({
        row: csvRow.row,
        raw: csvRow.values,
        payload,
        status: "valid",
        emailSelection,
      });
    } catch (error) {
      const message = readErrorMessage(error, "Row validation failed.");
      const fieldMatch = message.match(/^([A-Za-z0-9]+)\s/);
      errors.push({
        row: csvRow.row,
        field: fieldMatch?.[1] ?? "row",
        message,
      });
      drafts.push({
        row: csvRow.row,
        raw: csvRow.values,
        status: "invalid",
        emailSelection,
      });
    }
  }

  const duplicateEmails = Array.from(
    new Set(
      drafts
        .filter((draft) => draft.status === "valid" && Array.isArray(draft.payload?.emails))
        .flatMap((draft) => (draft.payload?.emails as string[]).map((email) => String(email).toLowerCase()))
    )
  );
  const existingLeadsByEmail = await fetchExistingLeadsByEmail(duplicateEmails);
  const duplicates: LeadImportDuplicate[] = [];

  let willCreate = 0;
  let willUpdate = 0;
  let willSkip = 0;

  for (const draft of drafts) {
    if (draft.status !== "valid" || !draft.payload) {
      continue;
    }

    const draftEmails = Array.isArray(draft.payload.emails)
      ? (draft.payload.emails as string[]).map((email) => String(email).toLowerCase())
      : [];
    const matchedEmail = draftEmails.find((email) => existingLeadsByEmail.has(email)) ?? null;
    const existingLead = matchedEmail ? existingLeadsByEmail.get(matchedEmail) : null;
    if (!existingLead) {
      willCreate += 1;
      continue;
    }

    draft.duplicateEmail = matchedEmail;
    draft.duplicateLeadId = Number(existingLead.id);
    draft.status = "duplicate";

    const action =
      options.duplicateStrategy === "update"
        ? "update"
        : options.duplicateStrategy === "allow"
          ? "create"
          : "skip";

    draft.duplicateAction = action;
    duplicates.push({
      row: draft.row,
      email: matchedEmail as string,
      action,
    });

    if (action === "update") {
      willUpdate += 1;
    } else if (action === "skip") {
      willSkip += 1;
    } else {
      willCreate += 1;
    }
  }

  const validSelections = drafts
    .map((draft) => draft.emailSelection)
    .filter((selection): selection is LeadImportEmailSelectionResult => Boolean(selection));
  const previewRows = drafts.slice(0, 10).map((draft) => ({
    row: draft.row,
    firstName: toOptionalString(draft.raw.firstName),
    lastName: toOptionalString(draft.raw.lastName),
    email: draft.emailSelection?.selectedEmail ?? null,
    selectedEmail: draft.emailSelection?.selectedEmail ?? null,
    selectedEmailType: draft.emailSelection?.selectedEmailType ?? null,
    originalEmailValues: draft.emailSelection?.originalEmailValues ?? [],
    excludedEmails: draft.emailSelection?.excludedEmails ?? [],
    duplicateEmailsRemoved: draft.emailSelection?.duplicateEmailsRemoved ?? 0,
    companyName: toOptionalString(draft.raw.companyName),
    leadType: toOptionalString(draft.raw.leadType),
    leadStatus: toOptionalString(draft.raw.leadStatus) ?? "New",
    leadPriority: toOptionalString(draft.raw.leadPriority) ?? "Medium",
    status: draft.status === "duplicate" ? "duplicate" : draft.status === "invalid" ? "invalid" : "valid",
  })) satisfies LeadImportPreviewRow[];

  const preview: LeadImportPreview = {
    totalRows: drafts.length,
    validRows: drafts.filter((draft) => draft.status === "valid" || draft.status === "duplicate").length,
    invalidRows: drafts.filter((draft) => draft.status === "invalid").length,
    duplicateRows: duplicates.length,
    willCreate,
    willUpdate,
    willSkip,
    validBestEmailsSelected: validSelections.filter((selection) => Boolean(selection.selectedEmail)).length,
    gmailSelectedCount: validSelections.filter((selection) => selection.isFreeMailboxSelected).length,
    supportSelectedCount: validSelections.filter((selection) => selection.isSupportSelected).length,
    noSafeEmailCount: validSelections.filter((selection) => !selection.selectedEmail).length,
    duplicateEmailsRemovedCount: validSelections.reduce(
      (total, selection) => total + selection.duplicateEmailsRemoved,
      0
    ),
    excludedBadEmailsCount: validSelections.reduce(
      (total, selection) => total + selection.excludedEmails.length,
      0
    ),
    errors,
    duplicates,
    previewRows,
    warnings,
  };

  return {
    drafts,
    preview,
  };
};

const sanitizeCompanyPayload = async (
  payload: Record<string, unknown>,
  actor: AdminActor
) => {
  const name = toTrimmedString(payload.name);
  if (!name) {
    throw new Error("name is required.");
  }

  return {
    name,
    website: toUrl(payload.website, "Website"),
    industry: toOptionalString(payload.industry),
    companySize:
      assertAllowed(
        toOptionalString(payload.companySize),
        CRM_DEFAULTS.companySizes,
        "companySize"
      ) ?? null,
    country: toOptionalString(payload.country),
    city: toOptionalString(payload.city),
    email: toEmail(payload.email, "Company email"),
    phone: toOptionalString(payload.phone),
    linkedinUrl: toUrl(payload.linkedinUrl, "LinkedIn URL"),
    twitterUrl: toUrl(payload.twitterUrl, "Twitter URL"),
    facebookUrl: toUrl(payload.facebookUrl, "Facebook URL"),
    description: toOptionalString(payload.description),
    owner: await resolveAdminOwner(payload.owner ?? actor.id),
    status:
      assertAllowed(
        toOptionalString(payload.status),
        CRM_DEFAULTS.companyStatuses,
        "status"
      ) ?? "Prospect",
    tags: toArrayOfStrings(payload.tags),
  };
};

const sanitizeDealPayload = async (
  payload: Record<string, unknown>,
  actor: AdminActor
) => {
  const title = toTrimmedString(payload.title);
  if (!title) {
    throw new Error("title is required.");
  }

  return {
    title,
    leadId: toNumberOrNull(payload.leadId),
    contactId: toNumberOrNull(payload.contactId),
    companyId: toNumberOrNull(payload.companyId),
    stage:
      assertAllowed(
        toOptionalString(payload.stage),
        CRM_DEFAULTS.dealStages,
        "stage"
      ) ?? "New",
    value: toFiniteNumber(payload.value ?? 0, "value", { min: 0 }),
    currency: toOptionalString(payload.currency) ?? CRM_DEFAULTS.defaultCurrency,
    probability: toFiniteNumber(payload.probability ?? 0, "probability", {
      min: 0,
      max: 100,
    }),
    expectedCloseDate: toIsoDateTimeOrNull(
      payload.expectedCloseDate,
      "expectedCloseDate"
    ),
    owner: await resolveAdminOwner(payload.owner ?? actor.id),
    source: toOptionalString(payload.source),
    description: toOptionalString(payload.description),
    lostReason: toOptionalString(payload.lostReason),
  };
};

const sanitizeTaskPayload = async (
  payload: Record<string, unknown>,
  actor: AdminActor
) => {
  const title = toTrimmedString(payload.title);
  if (!title) {
    throw new Error("title is required.");
  }

  const relatedType = toOptionalString(payload.relatedType);
  if (relatedType && !["lead", "contact", "company", "deal"].includes(relatedType)) {
    throw new Error("relatedType must match allowed values.");
  }

  return {
    title,
    description: toOptionalString(payload.description),
    taskType:
      assertAllowed(
        toOptionalString(payload.taskType),
        CRM_DEFAULTS.taskTypes,
        "taskType"
      ) ?? "Follow-up",
    priority:
      assertAllowed(
        toOptionalString(payload.priority),
        CRM_DEFAULTS.taskPriorities,
        "priority"
      ) ?? "Medium",
    status:
      assertAllowed(
        toOptionalString(payload.status),
        CRM_DEFAULTS.taskStatuses,
        "status"
      ) ?? "Pending",
    dueAt: toIsoDateTimeOrNull(payload.dueAt, "dueAt"),
    reminderAt: toIsoDateTimeOrNull(payload.reminderAt, "reminderAt"),
    assignedTo: await resolveAdminOwner(payload.assignedTo ?? actor.id),
    relatedType,
    relatedId: toNumberOrNull(payload.relatedId),
  };
};

const sanitizeCampaignPayload = async (payload: Record<string, unknown>) => {
  const name = toTrimmedString(payload.name);
  const subject = toTrimmedString(payload.subject);
  const body = String(payload.body ?? "").trim();
  const recipientType = toOptionalString(payload.recipientType);

  if (!name) {
    throw new Error("name is required.");
  }

  if (!subject) {
    throw new Error("subject is required.");
  }

  if (!body) {
    throw new Error("body is required.");
  }

  if (!recipientType) {
    throw new Error("recipientType is required.");
  }

  assertAllowed(recipientType, CRM_DEFAULTS.recipientTypes, "recipientType");

  return {
    name,
    subject,
    body,
    status:
      assertAllowed(
        toOptionalString(payload.status),
        CRM_DEFAULTS.campaignStatuses,
        "status"
      ) ?? "Draft",
    recipientType,
    segmentId: toNumberOrNull(payload.segmentId),
    recipientCount: toFiniteNumber(payload.recipientCount ?? 0, "recipientCount", {
      min: 0,
    }),
    sentCount: toFiniteNumber(payload.sentCount ?? 0, "sentCount", { min: 0 }),
    failedCount: toFiniteNumber(payload.failedCount ?? 0, "failedCount", { min: 0 }),
    openedCount: toFiniteNumber(payload.openedCount ?? 0, "openedCount", { min: 0 }),
    clickedCount: toFiniteNumber(payload.clickedCount ?? 0, "clickedCount", {
      min: 0,
    }),
    scheduledAt: toIsoDateTimeOrNull(payload.scheduledAt, "scheduledAt"),
  };
};

const sanitizeSegmentPayload = (payload: Record<string, unknown>) => {
  const name = toTrimmedString(payload.name);
  if (!name) {
    throw new Error("name is required.");
  }

  const entityType = toOptionalString(payload.entityType);
  if (!entityType) {
    throw new Error("entityType is required.");
  }

  assertAllowed(entityType, CRM_DEFAULTS.segmentEntityTypes, "entityType");

  const segmentLimit = toNumberOrNull(payload.limit ?? payload.segmentLimit);
  if (segmentLimit != null && (!Number.isInteger(segmentLimit) || segmentLimit <= 0)) {
    throw new Error("limit must be a positive whole number.");
  }

  const sortBy = toOptionalString(payload.sortBy);
  if (sortBy) {
    assertAllowed(sortBy, [...CRM_SEGMENT_SORT_FIELDS], "sortBy");
  }

  const sortDirection =
    (assertAllowed(
      toOptionalString(payload.sortDirection),
      ["asc", "desc"],
      "sortDirection"
    ) as SegmentSortDirection | null) ?? "desc";

  return {
    name,
    description: toOptionalString(payload.description),
    entityType,
    conditions: sanitizeJsonArray(payload.conditions, "conditions"),
    matchType:
      assertAllowed(
        toOptionalString(payload.matchType),
        CRM_DEFAULTS.segmentMatchTypes,
        "matchType"
      ) ?? "all",
    limit: segmentLimit,
    sortBy,
    sortDirection,
    randomize: Boolean(payload.randomize),
  };
};

const toBooleanOrNull = (value: unknown) => {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = toTrimmedString(value).toLowerCase();
  if (!normalized) {
    return null;
  }

  if (["true", "1", "yes"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no"].includes(normalized)) {
    return false;
  }

  return null;
};

const parseSegmentListValue = (value: unknown) => {
  if (Array.isArray(value)) {
    return uniqueStrings(
      value.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    );
  }

  return uniqueStrings(
    String(value ?? "")
      .split(/[,\n;|]/)
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
};

const escapeSqlLiteral = (value: string) => value.replace(/'/g, "''");

const buildLeadSegmentExpressions = (alias: string) => {
  const normalizedTagArray = `CASE
    WHEN jsonb_typeof(COALESCE(${alias}.tags, '[]'::jsonb)) = 'array' THEN COALESCE(${alias}.tags, '[]'::jsonb)
    ELSE '[]'::jsonb
  END`;
  const normalizedTagItemValue = (valueSql: string) => `CASE
    WHEN jsonb_typeof(${valueSql}) = 'string' THEN LOWER(BTRIM(${valueSql}::text, '"'))
    WHEN jsonb_typeof(${valueSql}) = 'object' THEN LOWER(COALESCE(${valueSql}->>'name', ${valueSql}->>'value', ${valueSql}->>'label', ${valueSql}->>'tag', ''))
    ELSE ''
  END`;
  const legacyTagText = `CASE
    WHEN jsonb_typeof(COALESCE(${alias}.tags, 'null'::jsonb)) = 'string' THEN BTRIM(COALESCE(${alias}.tags, '""'::jsonb)::text, '"')
    ELSE ''
  END`;
  const tagMatchExistsSql = (comparisonSql: string) => `(
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(${normalizedTagArray}) AS tag_item(value)
      WHERE ${normalizedTagItemValue("tag_item.value")} ${comparisonSql}
    )
    OR EXISTS (
      SELECT 1
      FROM regexp_split_to_table(${legacyTagText}, E'\\s*[,;|\\n]\\s*') AS legacy_tag(value)
      WHERE LOWER(BTRIM(legacy_tag.value)) ${comparisonSql}
    )
  )`;
  const normalizedEmail = `LOWER(COALESCE(${alias}.email, ''))`;
  const emailLocalPart = `split_part(${normalizedEmail}, '@', 1)`;
  const emailDomain = `NULLIF(split_part(${normalizedEmail}, '@', 2), '')`;
  const validEmail = `${normalizedEmail} ~ '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$'`;
  const freeDomainList = Array.from(FREE_MAILBOX_DOMAINS)
    .map((domain) => `'${escapeSqlLiteral(domain)}'`)
    .join(", ");
  const isFreeMailbox = `${emailDomain} IN (${freeDomainList})`;
  const riskyLocalPart = `${emailLocalPart} ~ '^(noreply|no-reply|donotreply|do-not-reply|abuse|privacy|legal|bug|bugs|security|postmaster|hostmaster)([+._-].*)?$'`;
  const emailType = `
    CASE
      WHEN ${normalizedEmail} = '' THEN 'unknown'
      WHEN NOT (${validEmail}) THEN 'unknown'
      WHEN ${riskyLocalPart} THEN 'risky'
      WHEN ${emailLocalPart} ~ '^(admin|administrator|office|hr|careers|jobs|billing|webmaster)([+._-].*)?$' THEN 'admin'
      WHEN ${emailLocalPart} ~ '(^|[._-])(owner|founder|cofounder|co-founder|ceo|director|md|managingdirector|president)([._-]|$)' THEN 'owner'
      WHEN ${emailLocalPart} ~ '^sales([+._-]|$)' THEN 'sales'
      WHEN ${emailLocalPart} ~ '^(partnerships?|partner)([+._-]|$)' THEN 'partnerships'
      WHEN ${emailLocalPart} ~ '^business([+._-]|$)' THEN 'business'
      WHEN ${emailLocalPart} ~ '^marketing([+._-]|$)' THEN 'marketing'
      WHEN ${emailLocalPart} ~ '^hello([+._-]|$)' THEN 'hello'
      WHEN ${emailLocalPart} ~ '^contact([+._-]|$)' THEN 'contact'
      WHEN ${emailLocalPart} ~ '^info([+._-]|$)' THEN 'info'
      WHEN ${emailLocalPart} ~ '^support([+._-]|$)' THEN 'support'
      WHEN ${isFreeMailbox} THEN 'free_mailbox'
      WHEN ${emailDomain} IS NOT NULL THEN 'other_company_domain'
      ELSE 'unknown'
    END
  `;
  const blockedByConsent = `COALESCE(${alias}.email_consent_status, 'unknown') IN ('unsubscribed', 'do_not_contact')`;
  const campaignReady = `(
    ${validEmail}
    AND COALESCE(${alias}.unsubscribed, FALSE) = FALSE
    AND COALESCE(${alias}.bounced, FALSE) = FALSE
    AND COALESCE(${alias}.spam_complaint, FALSE) = FALSE
    AND COALESCE(${alias}.do_not_contact, FALSE) = FALSE
    AND NOT (${blockedByConsent})
  )`;
  const needsEmailReview = `(
    ${tagMatchExistsSql(`= 'email_needs_review'`)}
    OR NOT (${validEmail})
    OR ${normalizedEmail} = ''
  )`;
  const agencyOutreachReady = `(
    ${tagMatchExistsSql(`= 'agency_outreach_ready'`)}
    AND ${campaignReady}
  )`;
  const emailRiskLevel = `
    CASE
      WHEN ${normalizedEmail} = ''
        OR NOT (${validEmail})
        OR COALESCE(${alias}.unsubscribed, FALSE)
        OR COALESCE(${alias}.bounced, FALSE)
        OR COALESCE(${alias}.spam_complaint, FALSE)
        OR COALESCE(${alias}.do_not_contact, FALSE)
        OR (${blockedByConsent})
        OR (${emailType}) = 'risky' THEN 'blocked'
      WHEN (${emailType}) = 'admin' THEN 'high'
      WHEN (${emailType}) IN ('free_mailbox', 'info', 'contact', 'support') THEN 'medium'
      WHEN (${emailType}) IN ('owner', 'sales', 'partnerships', 'business', 'marketing', 'hello') THEN 'low'
      WHEN (${emailType}) = 'other_company_domain' THEN 'medium'
      ELSE 'high'
    END
  `;

  return {
    id: `${alias}.id`,
    companyName: `${alias}.company_name`,
    contactName: `NULLIF(BTRIM(CONCAT_WS(' ', COALESCE(${alias}.first_name, ''), COALESCE(${alias}.last_name, ''))), '')`,
    email: `${alias}.email`,
    phone: `${alias}.phone`,
    address: `${alias}.address`,
    website: `${alias}.website`,
    leadType: `${alias}.lead_type`,
    leadStatus: `${alias}.lead_status`,
    leadSource: `${alias}.lead_source`,
    country: `${alias}.country`,
    city: `${alias}.city`,
    state: `${alias}.state`,
    industry: `${alias}.industry`,
    category: `${alias}.category`,
    subCategory: `${alias}.sub_category`,
    tags: `${alias}.tags`,
    notes: `${alias}.notes::text`,
    owner: `COALESCE(owner_admin.name, owner_admin.email, ${alias}.assigned_to::text, '')`,
    lifecycleStage: `${alias}.lifecycle_stage`,
    status: `${alias}.lead_status`,
    stage: `COALESCE(latest_deal.stage, '')`,
    dealValue: `COALESCE(latest_deal.value, 0)`,
    lastActivityAt: `COALESCE(${alias}.last_activity_at, activity_summary.last_activity_at)`,
    nextFollowUpAt: `${alias}.next_follow_up_at`,
    createdAt: `${alias}.created_at`,
    updatedAt: `${alias}.updated_at`,
    emailDomain,
    emailType,
    hasEmail: `(${normalizedEmail} <> '')`,
    hasValidEmail: `(${validEmail})`,
    isFreeEmailProvider: `(${isFreeMailbox})`,
    isCompanyDomainEmail: `((${validEmail}) AND NOT (${isFreeMailbox}))`,
    isSupportEmail: `(${emailLocalPart} ~ '^support([+._-]|$)')`,
    isInfoEmail: `(${emailLocalPart} ~ '^info([+._-]|$)')`,
    isContactEmail: `(${emailLocalPart} ~ '^contact([+._-]|$)')`,
    isSalesEmail: `(${emailLocalPart} ~ '^sales([+._-]|$)')`,
    isHelloEmail: `(${emailLocalPart} ~ '^hello([+._-]|$)')`,
    isMarketingEmail: `(${emailLocalPart} ~ '^marketing([+._-]|$)')`,
    unsubscribed: `COALESCE(${alias}.unsubscribed, FALSE)`,
    bounced: `COALESCE(${alias}.bounced, FALSE)`,
    bounceType: `${alias}.bounce_type`,
    spamComplaint: `COALESCE(${alias}.spam_complaint, FALSE)`,
    doNotContact: `COALESCE(${alias}.do_not_contact, FALSE)`,
    emailConsentStatus: `COALESCE(${alias}.email_consent_status, 'unknown')`,
    lastEmailSentAt: `${alias}.last_email_sent_at`,
    emailSentCount: `COALESCE(${alias}.email_sent_count, 0)`,
    lastEmailOpenedAt: `${alias}.last_email_opened_at`,
    emailOpenCount: `COALESCE(${alias}.email_open_count, 0)`,
    lastEmailClickedAt: `${alias}.last_email_clicked_at`,
    emailClickCount: `COALESCE(${alias}.email_click_count, 0)`,
    lastEmailRepliedAt: `${alias}.last_email_replied_at`,
    emailReplyCount: `COALESCE(${alias}.email_reply_count, 0)`,
    lastCampaignName: `${alias}.last_campaign_name`,
    lastCampaignStatus: `${alias}.last_campaign_status`,
    activityCount: `COALESCE(activity_summary.activity_count, 0)`,
    lastActivityType: `COALESCE(activity_summary.last_activity_type, '')`,
    lastActivityOutcome: `COALESCE(activity_summary.last_activity_outcome, '')`,
    taskCount: `COALESCE(task_summary.task_count, 0)`,
    pendingTaskCount: `COALESCE(task_summary.pending_task_count, 0)`,
    overdueTaskCount: `COALESCE(task_summary.overdue_task_count, 0)`,
    followUpDue: `(${alias}.next_follow_up_at IS NOT NULL AND ${alias}.next_follow_up_at <= NOW())`,
    hasOpenTask: `COALESCE(task_summary.has_open_task, FALSE)`,
    campaignReady,
    agencyOutreachReady,
    needsEmailReview,
    canEmail: campaignReady,
    emailRiskLevel,
  };
};

const buildLegacySegmentFieldMap = (alias: string) =>
  ({
    leadType: { type: "text", sql: `${alias}.lead_type`, operators: ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"] },
    leadStatus: { type: "text", sql: `${alias}.lead_status`, operators: ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"] },
    leadSource: { type: "text", sql: `${alias}.lead_source`, operators: ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"] },
    country: { type: "text", sql: `${alias}.country`, operators: ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"] },
    tags: { type: "jsonb_array", sql: `${alias}.tags`, operators: ["contains", "not_contains", "contains_any", "contains_all", "is_empty", "is_not_empty"] },
    dealValue: { type: "number", sql: `${alias}.value`, operators: ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "between"] },
    nextFollowUpAt: { type: "date", sql: `${alias}.next_follow_up_at`, operators: ["before", "after", "on", "between", "older_than_days", "newer_than_days", "is_empty", "is_not_empty"] },
    lastActivityAt: { type: "date", sql: `${alias}.last_activity_at`, operators: ["before", "after", "on", "between", "older_than_days", "newer_than_days", "is_empty", "is_not_empty"] },
    lifecycleStage: { type: "text", sql: `${alias}.lifecycle_stage`, operators: ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"] },
    status: { type: "text", sql: `${alias}.status`, operators: ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"] },
    stage: { type: "text", sql: `${alias}.stage`, operators: ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"] },
    owner: { type: "text", sql: `${alias}.owner`, operators: ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"] },
  }) as Record<string, { type: string; sql: string; operators: string[] }>;

const buildLeadSegmentFieldMap = (alias: string) => {
  const expressions = buildLeadSegmentExpressions(alias);

  return {
    id: { type: "number", sql: expressions.id, operators: ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "between"] },
    companyName: { type: "text", sql: expressions.companyName, operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"] },
    contactName: { type: "text", sql: expressions.contactName, operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"] },
    email: { type: "text", sql: expressions.email, operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"] },
    phone: { type: "text", sql: expressions.phone, operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"] },
    address: { type: "text", sql: expressions.address, operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"] },
    website: { type: "text", sql: expressions.website, operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"] },
    leadType: { type: "text", sql: expressions.leadType, operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"] },
    leadStatus: { type: "text", sql: expressions.leadStatus, operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"] },
    leadSource: { type: "text", sql: expressions.leadSource, operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"] },
    country: { type: "text", sql: expressions.country, operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"] },
    city: { type: "text", sql: expressions.city, operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"] },
    state: { type: "text", sql: expressions.state, operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"] },
    industry: { type: "text", sql: expressions.industry, operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"] },
    category: { type: "text", sql: expressions.category, operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"] },
    subCategory: { type: "text", sql: expressions.subCategory, operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"] },
    tags: { type: "jsonb_array", sql: expressions.tags, operators: ["contains", "not_contains", "contains_any", "contains_all", "is_empty", "is_not_empty"] },
    notes: { type: "text", sql: expressions.notes, operators: ["contains", "not_contains", "is_empty", "is_not_empty"] },
    owner: { type: "text", sql: expressions.owner, operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"] },
    lifecycleStage: { type: "text", sql: expressions.lifecycleStage, operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"] },
    status: { type: "text", sql: expressions.status, operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"] },
    stage: { type: "text", sql: expressions.stage, operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"] },
    dealValue: { type: "number", sql: expressions.dealValue, operators: ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "between"] },
    lastActivityAt: { type: "date", sql: expressions.lastActivityAt, operators: ["before", "after", "on", "between", "older_than_days", "newer_than_days", "is_empty", "is_not_empty"] },
    nextFollowUpAt: { type: "date", sql: expressions.nextFollowUpAt, operators: ["before", "after", "on", "between", "older_than_days", "newer_than_days", "is_empty", "is_not_empty"] },
    createdAt: { type: "date", sql: expressions.createdAt, operators: ["before", "after", "on", "between", "older_than_days", "newer_than_days", "is_empty", "is_not_empty"] },
    updatedAt: { type: "date", sql: expressions.updatedAt, operators: ["before", "after", "on", "between", "older_than_days", "newer_than_days", "is_empty", "is_not_empty"] },
    emailDomain: { type: "text", sql: expressions.emailDomain, operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"] },
    emailType: { type: "text", sql: expressions.emailType, operators: ["equals", "not_equals", "in", "not_in", "is_empty", "is_not_empty"] },
    hasEmail: { type: "boolean", sql: expressions.hasEmail, operators: ["is_true", "is_false", "equals", "not_equals"] },
    hasValidEmail: { type: "boolean", sql: expressions.hasValidEmail, operators: ["is_true", "is_false", "equals", "not_equals"] },
    isFreeEmailProvider: { type: "boolean", sql: expressions.isFreeEmailProvider, operators: ["is_true", "is_false", "equals", "not_equals"] },
    isCompanyDomainEmail: { type: "boolean", sql: expressions.isCompanyDomainEmail, operators: ["is_true", "is_false", "equals", "not_equals"] },
    isSupportEmail: { type: "boolean", sql: expressions.isSupportEmail, operators: ["is_true", "is_false", "equals", "not_equals"] },
    isInfoEmail: { type: "boolean", sql: expressions.isInfoEmail, operators: ["is_true", "is_false", "equals", "not_equals"] },
    isContactEmail: { type: "boolean", sql: expressions.isContactEmail, operators: ["is_true", "is_false", "equals", "not_equals"] },
    isSalesEmail: { type: "boolean", sql: expressions.isSalesEmail, operators: ["is_true", "is_false", "equals", "not_equals"] },
    isHelloEmail: { type: "boolean", sql: expressions.isHelloEmail, operators: ["is_true", "is_false", "equals", "not_equals"] },
    isMarketingEmail: { type: "boolean", sql: expressions.isMarketingEmail, operators: ["is_true", "is_false", "equals", "not_equals"] },
    unsubscribed: { type: "boolean", sql: expressions.unsubscribed, operators: ["is_true", "is_false", "equals", "not_equals"] },
    bounced: { type: "boolean", sql: expressions.bounced, operators: ["is_true", "is_false", "equals", "not_equals"] },
    bounceType: { type: "text", sql: expressions.bounceType, operators: ["equals", "not_equals", "contains", "not_contains", "is_empty", "is_not_empty", "in", "not_in"] },
    spamComplaint: { type: "boolean", sql: expressions.spamComplaint, operators: ["is_true", "is_false", "equals", "not_equals"] },
    doNotContact: { type: "boolean", sql: expressions.doNotContact, operators: ["is_true", "is_false", "equals", "not_equals"] },
    emailConsentStatus: { type: "text", sql: expressions.emailConsentStatus, operators: ["equals", "not_equals", "contains", "not_contains", "is_empty", "is_not_empty", "in", "not_in"] },
    lastEmailSentAt: { type: "date", sql: expressions.lastEmailSentAt, operators: ["before", "after", "on", "between", "older_than_days", "newer_than_days", "is_empty", "is_not_empty"] },
    emailSentCount: { type: "number", sql: expressions.emailSentCount, operators: ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "between"] },
    lastEmailOpenedAt: { type: "date", sql: expressions.lastEmailOpenedAt, operators: ["before", "after", "on", "between", "older_than_days", "newer_than_days", "is_empty", "is_not_empty"] },
    emailOpenCount: { type: "number", sql: expressions.emailOpenCount, operators: ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "between"] },
    lastEmailClickedAt: { type: "date", sql: expressions.lastEmailClickedAt, operators: ["before", "after", "on", "between", "older_than_days", "newer_than_days", "is_empty", "is_not_empty"] },
    emailClickCount: { type: "number", sql: expressions.emailClickCount, operators: ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "between"] },
    lastEmailRepliedAt: { type: "date", sql: expressions.lastEmailRepliedAt, operators: ["before", "after", "on", "between", "older_than_days", "newer_than_days", "is_empty", "is_not_empty"] },
    emailReplyCount: { type: "number", sql: expressions.emailReplyCount, operators: ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "between"] },
    lastCampaignName: { type: "text", sql: expressions.lastCampaignName, operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"] },
    lastCampaignStatus: { type: "text", sql: expressions.lastCampaignStatus, operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"] },
    activityCount: { type: "number", sql: expressions.activityCount, operators: ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "between"] },
    lastActivityType: { type: "text", sql: expressions.lastActivityType, operators: ["equals", "not_equals", "contains", "not_contains", "is_empty", "is_not_empty", "in", "not_in"] },
    lastActivityOutcome: { type: "text", sql: expressions.lastActivityOutcome, operators: ["equals", "not_equals", "contains", "not_contains", "is_empty", "is_not_empty", "in", "not_in"] },
    taskCount: { type: "number", sql: expressions.taskCount, operators: ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "between"] },
    pendingTaskCount: { type: "number", sql: expressions.pendingTaskCount, operators: ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "between"] },
    overdueTaskCount: { type: "number", sql: expressions.overdueTaskCount, operators: ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "between"] },
    followUpDue: { type: "boolean", sql: expressions.followUpDue, operators: ["is_true", "is_false", "equals", "not_equals"] },
    hasOpenTask: { type: "boolean", sql: expressions.hasOpenTask, operators: ["is_true", "is_false", "equals", "not_equals"] },
    campaignReady: { type: "boolean", sql: expressions.campaignReady, operators: ["is_true", "is_false", "equals", "not_equals"] },
    agencyOutreachReady: { type: "boolean", sql: expressions.agencyOutreachReady, operators: ["is_true", "is_false", "equals", "not_equals"] },
    needsEmailReview: { type: "boolean", sql: expressions.needsEmailReview, operators: ["is_true", "is_false", "equals", "not_equals"] },
    canEmail: { type: "boolean", sql: expressions.canEmail, operators: ["is_true", "is_false", "equals", "not_equals"] },
    emailRiskLevel: { type: "text", sql: expressions.emailRiskLevel, operators: ["equals", "not_equals", "in", "not_in", "is_empty", "is_not_empty"] },
  } as Record<string, { type: string; sql: string; operators: string[] }>;
};

const resolveSegmentWhere = (
  conditions: unknown[],
  matchType: string,
  alias: string,
  entityType = "leads"
) => {
  const values: unknown[] = [];
  const clauses: string[] = [];
  const allowedFieldMap =
    entityType === "leads"
      ? buildLeadSegmentFieldMap(alias)
      : buildLegacySegmentFieldMap(alias);

  conditions.forEach((entry) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    const field = toTrimmedString(record.field);
    const operator = toTrimmedString(record.operator);
    const config = allowedFieldMap[field];
    const rawValue = record.value;
    const secondValue = record.secondValue;

    if (!config || !operator) {
      throw new Error(`Unsupported segment field "${field}".`);
    }

    if (!config.operators.includes(operator)) {
      throw new Error(`Operator "${operator}" is not allowed for field "${field}".`);
    }

    const column = config.sql;

    if (config.type === "text") {
      const listValue = parseSegmentListValue(rawValue);
      const singleValue = toTrimmedString(rawValue);

      if (operator === "is_empty") {
        clauses.push(`NULLIF(BTRIM(COALESCE(${column}::text, '')), '') IS NULL`);
        return;
      }
      if (operator === "is_not_empty") {
        clauses.push(`NULLIF(BTRIM(COALESCE(${column}::text, '')), '') IS NOT NULL`);
        return;
      }
      if (operator === "equals" || operator === "not_equals") {
        values.push(singleValue);
        clauses.push(`LOWER(COALESCE(${column}::text, '')) ${operator === "not_equals" ? "<>" : "="} LOWER($${values.length})`);
        return;
      }
      if (operator === "contains" || operator === "not_contains") {
        values.push(`%${singleValue}%`);
        clauses.push(`COALESCE(${column}::text, '') ${operator === "not_contains" ? "NOT ILIKE" : "ILIKE"} $${values.length}`);
        return;
      }
      if (operator === "starts_with") {
        values.push(`${singleValue}%`);
        clauses.push(`COALESCE(${column}::text, '') ILIKE $${values.length}`);
        return;
      }
      if (operator === "ends_with") {
        values.push(`%${singleValue}`);
        clauses.push(`COALESCE(${column}::text, '') ILIKE $${values.length}`);
        return;
      }
      if (operator === "in" || operator === "not_in") {
        if (listValue.length === 0) {
          throw new Error(`Field "${field}" requires one or more values.`);
        }
        values.push(listValue.map((entry) => entry.toLowerCase()));
        clauses.push(`LOWER(COALESCE(${column}::text, '')) ${operator === "not_in" ? "NOT" : ""} = ANY($${values.length}::text[])`);
        return;
      }
    }

    if (config.type === "boolean") {
      if (operator === "is_true") {
        clauses.push(`COALESCE(${column}, FALSE) = TRUE`);
        return;
      }
      if (operator === "is_false") {
        clauses.push(`COALESCE(${column}, FALSE) = FALSE`);
        return;
      }

      const boolValue = toBooleanOrNull(rawValue);
      if (boolValue == null) {
        throw new Error(`Field "${field}" requires a true/false value.`);
      }
      values.push(boolValue);
      clauses.push(`COALESCE(${column}, FALSE) ${operator === "not_equals" ? "<>" : "="} $${values.length}`);
      return;
    }

    if (config.type === "number") {
      const numberValue = toNumberOrNull(rawValue);
      const numberValue2 = toNumberOrNull(secondValue);

      if (operator === "between") {
        if (numberValue == null || numberValue2 == null) {
          throw new Error(`Field "${field}" requires two numeric values for between.`);
        }
        values.push(numberValue);
        values.push(numberValue2);
        clauses.push(`${column} BETWEEN $${values.length - 1} AND $${values.length}`);
        return;
      }

      if (numberValue == null) {
        throw new Error(`Field "${field}" requires a numeric value.`);
      }

      values.push(numberValue);
      const comparisonMap: Record<string, string> = {
        equals: "=",
        not_equals: "<>",
        greater_than: ">",
        greater_than_or_equal: ">=",
        less_than: "<",
        less_than_or_equal: "<=",
      };
      clauses.push(`${column} ${comparisonMap[operator]} $${values.length}`);
      return;
    }

    if (config.type === "date") {
      const firstValue = toTrimmedString(rawValue);
      const secondDateValue = toTrimmedString(secondValue);

      if (operator === "is_empty") {
        clauses.push(`${column} IS NULL`);
        return;
      }
      if (operator === "is_not_empty") {
        clauses.push(`${column} IS NOT NULL`);
        return;
      }
      if (operator === "older_than_days" || operator === "newer_than_days") {
        const days = toNumberOrNull(rawValue);
        if (days == null) {
          throw new Error(`Field "${field}" requires a day count.`);
        }
        values.push(days);
        clauses.push(
          `${column} ${operator === "older_than_days" ? "<" : ">"} NOW() - ($${values.length} * INTERVAL '1 day')`
        );
        return;
      }
      if (operator === "between") {
        if (!firstValue || !secondDateValue) {
          throw new Error(`Field "${field}" requires two dates for between.`);
        }
        values.push(firstValue);
        values.push(secondDateValue);
        clauses.push(`${column} BETWEEN $${values.length - 1}::timestamp AND $${values.length}::timestamp`);
        return;
      }
      if (!firstValue) {
        throw new Error(`Field "${field}" requires a date value.`);
      }
      values.push(firstValue);
      if (operator === "before") {
        clauses.push(`${column} < $${values.length}::timestamp`);
        return;
      }
      if (operator === "after") {
        clauses.push(`${column} > $${values.length}::timestamp`);
        return;
      }
      if (operator === "on") {
        clauses.push(`DATE(${column}) = DATE($${values.length}::timestamp)`);
      }
      return;
    }

    if (config.type === "jsonb_array") {
      const listValue = parseSegmentListValue(rawValue).map((entry) => entry.toLowerCase());
      const normalizedArrayLength = `CASE
        WHEN jsonb_typeof(COALESCE(${column}, '[]'::jsonb)) = 'array' THEN jsonb_array_length(COALESCE(${column}, '[]'::jsonb))
        WHEN jsonb_typeof(COALESCE(${column}, 'null'::jsonb)) = 'string' AND NULLIF(BTRIM(BTRIM(COALESCE(${column}, '""'::jsonb)::text, '"')), '') IS NOT NULL THEN 1
        ELSE 0
      END`;
      const normalizedTagMatchExists = (comparisonSql: string) => `(
        EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(COALESCE(${column}, '[]'::jsonb)) = 'array' THEN COALESCE(${column}, '[]'::jsonb)
              ELSE '[]'::jsonb
            END
          ) AS item(value)
          WHERE (
            CASE
              WHEN jsonb_typeof(item.value) = 'string' THEN LOWER(BTRIM(item.value::text, '"'))
              WHEN jsonb_typeof(item.value) = 'object' THEN LOWER(COALESCE(item.value->>'name', item.value->>'value', item.value->>'label', item.value->>'tag', ''))
              ELSE ''
            END
          ) ${comparisonSql}
        )
        OR EXISTS (
          SELECT 1
          FROM regexp_split_to_table(
            CASE
              WHEN jsonb_typeof(COALESCE(${column}, 'null'::jsonb)) = 'string' THEN BTRIM(COALESCE(${column}, '""'::jsonb)::text, '"')
              ELSE ''
            END,
            E'\\s*[,;|\\n]\\s*'
          ) AS legacy_item(value)
          WHERE LOWER(BTRIM(legacy_item.value)) ${comparisonSql}
        )
      )`;

      if (operator === "is_empty") {
        clauses.push(`${normalizedArrayLength} = 0`);
        return;
      }
      if (operator === "is_not_empty") {
        clauses.push(`${normalizedArrayLength} > 0`);
        return;
      }
      if (listValue.length === 0) {
        throw new Error(`Field "${field}" requires one or more values.`);
      }

      values.push(listValue);
      if (operator === "contains" || operator === "not_contains") {
        clauses.push(
          `${operator === "not_contains" ? "NOT " : ""}${normalizedTagMatchExists(`= ANY($${values.length}::text[])`)}`
        );
        return;
      }
      if (operator === "contains_any") {
        clauses.push(normalizedTagMatchExists(`= ANY($${values.length}::text[])`));
        return;
      }
      if (operator === "contains_all") {
        clauses.push(`
          NOT EXISTS (
            SELECT 1
            FROM unnest($${values.length}::text[]) AS wanted(value)
            WHERE NOT ${normalizedTagMatchExists(`= LOWER(wanted.value)`)}
          )`);
      }
    }
  });

  if (clauses.length === 0) {
    return {
      sql: "TRUE",
      values,
    };
  }

  return {
    sql: clauses.join(matchType === "any" ? " OR " : " AND "),
    values,
  };
};

const buildLeadSegmentSortClause = (sortBy: string | null, sortDirection: SegmentSortDirection, randomize: boolean) => {
  if (randomize) {
    return "ORDER BY RANDOM()";
  }

  const sortFieldMap: Record<string, string> = {
    id: "id",
    createdAt: "created_at",
    updatedAt: "updated_at",
    lastActivityAt: "last_activity_at",
    nextFollowUpAt: "next_follow_up_at",
    emailRiskLevel: "email_risk_level",
    emailSentCount: "email_sent_count",
    emailOpenCount: "email_open_count",
    emailClickCount: "email_click_count",
    emailReplyCount: "email_reply_count",
    dealValue: "deal_value",
  };

  const column = sortFieldMap[sortBy ?? ""] ?? "created_at";
  return `ORDER BY ${column} ${sortDirection}, id DESC`;
};

const buildLeadSegmentBaseQuery = (segment: {
  conditions: unknown[];
  matchType: string;
  limit?: number | null;
  sortBy?: string | null;
  sortDirection?: SegmentSortDirection;
  randomize?: boolean;
}) => {
  const alias = "lead";
  const resolved = resolveSegmentWhere(segment.conditions, segment.matchType, alias, "leads");
  const sortClause = buildLeadSegmentSortClause(
    segment.sortBy ?? null,
    segment.sortDirection ?? "desc",
    Boolean(segment.randomize)
  );

  return {
    values: resolved.values,
    sortClause,
    sql: `
      WITH lead_segment_source AS (
        SELECT
          lead.id,
          lead.first_name,
          lead.last_name,
          lead.company_name,
          lead.email,
          lead.emails,
          lead.phone,
          lead.phones,
          lead.address,
          lead.job_title,
          lead.website,
          lead.country,
          lead.city,
          lead.state,
          lead.industry,
          lead.category,
          lead.sub_category,
          lead.lead_type,
          lead.lead_status,
          lead.lead_priority,
          lead.lead_score,
          lead.lead_source,
          lead.lifecycle_stage,
          lead.assigned_to,
          lead.tags,
          lead.notes,
          lead.created_at,
          lead.updated_at,
          lead.next_follow_up_at,
          COALESCE(lead.last_activity_at, activity_summary.last_activity_at) AS last_activity_at,
          COALESCE(latest_deal.value, 0) AS deal_value,
          COALESCE(latest_deal.stage, '') AS stage,
          COALESCE(owner_admin.name, owner_admin.email, lead.assigned_to::text, '') AS owner,
          ${buildLeadSegmentExpressions(alias).emailDomain} AS email_domain,
          ${buildLeadSegmentExpressions(alias).emailType} AS email_type,
          ${buildLeadSegmentExpressions(alias).hasEmail} AS has_email,
          ${buildLeadSegmentExpressions(alias).hasValidEmail} AS has_valid_email,
          ${buildLeadSegmentExpressions(alias).isFreeEmailProvider} AS is_free_email_provider,
          ${buildLeadSegmentExpressions(alias).isCompanyDomainEmail} AS is_company_domain_email,
          ${buildLeadSegmentExpressions(alias).isSupportEmail} AS is_support_email,
          ${buildLeadSegmentExpressions(alias).isInfoEmail} AS is_info_email,
          ${buildLeadSegmentExpressions(alias).isContactEmail} AS is_contact_email,
          ${buildLeadSegmentExpressions(alias).isSalesEmail} AS is_sales_email,
          ${buildLeadSegmentExpressions(alias).isHelloEmail} AS is_hello_email,
          ${buildLeadSegmentExpressions(alias).isMarketingEmail} AS is_marketing_email,
          COALESCE(lead.unsubscribed, FALSE) AS unsubscribed,
          COALESCE(lead.bounced, FALSE) AS bounced,
          lead.bounce_type,
          COALESCE(lead.spam_complaint, FALSE) AS spam_complaint,
          COALESCE(lead.do_not_contact, FALSE) AS do_not_contact,
          COALESCE(lead.email_consent_status, 'unknown') AS email_consent_status,
          lead.last_email_sent_at,
          COALESCE(lead.email_sent_count, 0) AS email_sent_count,
          lead.last_email_opened_at,
          COALESCE(lead.email_open_count, 0) AS email_open_count,
          lead.last_email_clicked_at,
          COALESCE(lead.email_click_count, 0) AS email_click_count,
          lead.last_email_replied_at,
          COALESCE(lead.email_reply_count, 0) AS email_reply_count,
          lead.last_campaign_name,
          lead.last_campaign_status,
          COALESCE(activity_summary.activity_count, 0) AS activity_count,
          COALESCE(activity_summary.last_activity_type, '') AS last_activity_type,
          COALESCE(activity_summary.last_activity_outcome, '') AS last_activity_outcome,
          COALESCE(task_summary.task_count, 0) AS task_count,
          COALESCE(task_summary.pending_task_count, 0) AS pending_task_count,
          COALESCE(task_summary.overdue_task_count, 0) AS overdue_task_count,
          COALESCE(task_summary.has_open_task, FALSE) AS has_open_task,
          ${buildLeadSegmentExpressions(alias).followUpDue} AS follow_up_due,
          ${buildLeadSegmentExpressions(alias).campaignReady} AS campaign_ready,
          ${buildLeadSegmentExpressions(alias).agencyOutreachReady} AS agency_outreach_ready,
          ${buildLeadSegmentExpressions(alias).needsEmailReview} AS needs_email_review,
          ${buildLeadSegmentExpressions(alias).canEmail} AS can_email,
          ${buildLeadSegmentExpressions(alias).emailRiskLevel} AS email_risk_level
        FROM crm_leads lead
        LEFT JOIN admins owner_admin ON owner_admin.id = lead.assigned_to
        LEFT JOIN LATERAL (
          SELECT deal.value, deal.stage, deal.updated_at
          FROM crm_deals deal
          WHERE deal.lead_id = lead.id AND deal.deleted_at IS NULL
          ORDER BY deal.updated_at DESC, deal.id DESC
          LIMIT 1
        ) latest_deal ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::int AS activity_count,
            MAX(activity.created_at) AS last_activity_at,
            (ARRAY_AGG(activity.activity_type ORDER BY activity.created_at DESC))[1] AS last_activity_type,
            (ARRAY_AGG(COALESCE(activity.metadata->>'outcome', '') ORDER BY activity.created_at DESC))[1] AS last_activity_outcome
          FROM crm_activities activity
          WHERE activity.related_type = 'lead'
            AND activity.related_id = lead.id
            AND activity.deleted_at IS NULL
        ) activity_summary ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::int AS task_count,
            COUNT(*) FILTER (WHERE LOWER(COALESCE(task.status, '')) = 'pending')::int AS pending_task_count,
            COUNT(*) FILTER (
              WHERE LOWER(COALESCE(task.status, '')) NOT IN ('completed', 'cancelled')
                AND task.due_at IS NOT NULL
                AND task.due_at < NOW()
            )::int AS overdue_task_count,
            BOOL_OR(LOWER(COALESCE(task.status, '')) NOT IN ('completed', 'cancelled')) AS has_open_task
          FROM crm_tasks task
          WHERE task.related_type = 'lead'
            AND task.related_id = lead.id
            AND task.deleted_at IS NULL
        ) task_summary ON TRUE
        WHERE lead.deleted_at IS NULL
          AND ${resolved.sql}
      ),
      lead_segment_filtered AS (
        SELECT *
        FROM lead_segment_source
      )
      SELECT *
      FROM lead_segment_filtered
      ${sortClause}
    `,
  };
};

const loadLeadSegmentPreview = async (segment: {
  conditions: unknown[];
  matchType: string;
  limit?: number | null;
  sortBy?: string | null;
  sortDirection?: SegmentSortDirection;
  randomize?: boolean;
}) => {
  const pool = await getAnalyticsPool();
  const built = buildLeadSegmentBaseQuery(segment);
  const limit = segment.limit ?? null;
  const previewValues = [...built.values];
  const sampleLimit = Math.min(limit ?? 20, 20);
  previewValues.push(sampleLimit);

  const [countResult, sampleResult, emailTypeDistribution, riskDistribution, countryDistribution, readinessResult] =
    await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM (${built.sql}) AS matched`, built.values),
      pool.query(
        `
          SELECT id, first_name, last_name, company_name, email, phone, website, country, city, state,
                 lead_type, lead_status, owner, email_type, email_risk_level, campaign_ready,
                 agency_outreach_ready, unsubscribed, bounced, spam_complaint, do_not_contact,
                 created_at, updated_at
          FROM (${built.sql}) AS matched
          LIMIT $${previewValues.length}
        `,
        previewValues
      ),
      pool.query(
        `
          SELECT COALESCE(email_type, 'unknown') AS label, COUNT(*)::int AS count
          FROM (${built.sql}) AS matched
          GROUP BY COALESCE(email_type, 'unknown')
          ORDER BY count DESC, label ASC
        `,
        built.values
      ),
      pool.query(
        `
          SELECT COALESCE(email_risk_level, 'unknown') AS label, COUNT(*)::int AS count
          FROM (${built.sql}) AS matched
          GROUP BY COALESCE(email_risk_level, 'unknown')
          ORDER BY count DESC, label ASC
        `,
        built.values
      ),
      pool.query(
        `
          SELECT COALESCE(NULLIF(country, ''), 'Unknown') AS label, COUNT(*)::int AS count
          FROM (${built.sql}) AS matched
          GROUP BY COALESCE(NULLIF(country, ''), 'Unknown')
          ORDER BY count DESC, label ASC
          LIMIT 10
        `,
        built.values
      ),
      pool.query(
        `
          SELECT
            COUNT(*) FILTER (WHERE campaign_ready = TRUE)::int AS campaign_ready_count,
            COUNT(*) FILTER (WHERE agency_outreach_ready = TRUE)::int AS agency_outreach_ready_count,
            COUNT(*) FILTER (WHERE can_email = TRUE)::int AS sendable_count,
            COUNT(*) FILTER (WHERE email_risk_level = 'blocked')::int AS blocked_lead_count,
            COUNT(*) FILTER (WHERE COALESCE(email, '') = '')::int AS missing_email_count,
            COUNT(*) FILTER (WHERE has_valid_email = FALSE)::int AS invalid_email_count,
            COUNT(*) FILTER (WHERE unsubscribed = TRUE)::int AS unsubscribed_count,
            COUNT(*) FILTER (WHERE bounced = TRUE)::int AS bounced_count,
            COUNT(*) FILTER (WHERE spam_complaint = TRUE)::int AS spam_complaint_count,
            COUNT(*) FILTER (WHERE do_not_contact = TRUE)::int AS do_not_contact_count,
            COUNT(*) FILTER (WHERE is_free_email_provider = TRUE)::int AS free_mailbox_count,
            COUNT(*) FILTER (WHERE is_support_email = TRUE)::int AS support_email_count
          FROM (${built.sql}) AS matched
        `,
        built.values
      ),
    ]);

  const readinessRow = readinessResult.rows[0] as Record<string, unknown>;

  return {
    count: Number((countResult.rows[0] as { total: number }).total ?? 0),
    items: sampleResult.rows as Array<Record<string, unknown>>,
    emailTypeDistribution: (emailTypeDistribution.rows as Array<Record<string, unknown>>).map((row) => ({
      label: String(row.label ?? "unknown"),
      count: Number(row.count ?? 0),
    })) satisfies SegmentPreviewDistribution[],
    emailRiskDistribution: (riskDistribution.rows as Array<Record<string, unknown>>).map((row) => ({
      label: String(row.label ?? "unknown"),
      count: Number(row.count ?? 0),
    })) satisfies SegmentPreviewDistribution[],
    countryDistribution: (countryDistribution.rows as Array<Record<string, unknown>>).map((row) => ({
      label: String(row.label ?? "Unknown"),
      count: Number(row.count ?? 0),
    })) satisfies SegmentPreviewDistribution[],
    campaignReadinessSummary: {
      campaignReadyCount: Number(readinessRow.campaign_ready_count ?? 0),
      agencyOutreachReadyCount: Number(readinessRow.agency_outreach_ready_count ?? 0),
      sendableCount: Number(readinessRow.sendable_count ?? 0),
      blockedLeadCount: Number(readinessRow.blocked_lead_count ?? 0),
      missingEmailCount: Number(readinessRow.missing_email_count ?? 0),
      invalidEmailCount: Number(readinessRow.invalid_email_count ?? 0),
      unsubscribedCount: Number(readinessRow.unsubscribed_count ?? 0),
      bouncedCount: Number(readinessRow.bounced_count ?? 0),
      spamComplaintCount: Number(readinessRow.spam_complaint_count ?? 0),
      doNotContactCount: Number(readinessRow.do_not_contact_count ?? 0),
      freeMailboxCount: Number(readinessRow.free_mailbox_count ?? 0),
      supportEmailCount: Number(readinessRow.support_email_count ?? 0),
    },
    appliedLimit: limit,
    sortBy: segment.sortBy ?? null,
    sortDirection: segment.sortDirection ?? "desc",
    randomize: Boolean(segment.randomize),
  };
};

export const evaluateLeadSegmentAudience = async (id: number) => {
  const segment = await getSegmentById(id);
  if (!segment) {
    throw new Error("Segment not found.");
  }
  if (String(segment.entityType) !== "leads") {
    throw new Error("Only lead segments can be used for email campaigns.");
  }

  const normalizedSegment = {
    conditions: normalizeJsonField<unknown[]>(segment.conditions, []),
    matchType: String(segment.matchType ?? "all"),
    limit: toNumberOrNull(segment.limit),
    sortBy: toOptionalString(segment.sortBy),
    sortDirection:
      (toOptionalString(segment.sortDirection)?.toLowerCase() === "asc" ? "asc" : "desc") as SegmentSortDirection,
    randomize: Boolean(segment.randomize),
  };

  const preview = await loadLeadSegmentPreview(normalizedSegment);
  const built = buildLeadSegmentBaseQuery(normalizedSegment);
  const pool = await getAnalyticsPool();
  const recipientValues = [...built.values];
  const appliedLimit = normalizedSegment.limit ?? 5000;
  recipientValues.push(appliedLimit);
  const result = await pool.query(
    `
      SELECT
        id,
        first_name,
        last_name,
        company_name,
        email,
        emails,
        phone,
        phones,
        website,
        address,
        lead_type,
        lead_status,
        lead_priority,
        lead_score,
        tags,
        notes,
        assigned_to,
        email_type,
        email_risk_level,
        campaign_ready,
        can_email,
        has_valid_email,
        unsubscribed,
        bounced,
        bounce_type,
        spam_complaint,
        do_not_contact,
        email_consent_status,
        country,
        city,
        state,
        created_at,
        updated_at
      FROM (${built.sql}) AS matched
      LIMIT $${recipientValues.length}
    `,
    recipientValues
  );

  return {
    segment,
    preview,
    leads: result.rows as Array<Record<string, unknown>>,
  };
};

const getSegmentRecipients = async (campaign: {
  recipientType: string;
  segmentId: number | null;
}) => {
  const pool = await getAnalyticsPool();

  if (campaign.recipientType === "segments") {
    if (!campaign.segmentId) {
      return [] as Array<{ email: string; firstName?: string; lastName?: string; companyName?: string; website?: string }>;
    }

    const segmentResult = await pool.query(
      `SELECT * FROM crm_segments WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [campaign.segmentId]
    );

    if (segmentResult.rowCount === 0) {
      return [];
    }

    const segment = segmentResult.rows[0] as Record<string, unknown>;
    const entityType = String(segment.entity_type ?? "leads");
    const matchType = String(segment.match_type ?? "all");
    const conditions = normalizeJsonField<unknown[]>(segment.conditions, []);
    const limit = toNumberOrNull(segment.segment_limit);
    const sortBy = toOptionalString(segment.sort_by);
    const sortDirection =
      (toOptionalString(segment.sort_direction)?.toLowerCase() === "asc" ? "asc" : "desc") as SegmentSortDirection;
    const randomize = Boolean(segment.randomize);

    if (entityType === "leads") {
      const built = buildLeadSegmentBaseQuery({
        conditions,
        matchType,
        limit,
        sortBy,
        sortDirection,
        randomize,
      });
      const recipientValues = [...built.values];
      recipientValues.push(Math.min(limit ?? 100, 100));
      const result = await pool.query(
        `
          SELECT email, first_name, last_name, company_name, website
          FROM (${built.sql}) AS matched
          WHERE COALESCE(email, '') <> ''
            AND campaign_ready = TRUE
          LIMIT $${recipientValues.length}
        `,
        recipientValues
      );

      return (result.rows as Array<Record<string, unknown>>).map((row) => ({
        email: String(row.email ?? ""),
        firstName: row.first_name ? String(row.first_name) : "",
        lastName: row.last_name ? String(row.last_name) : "",
        companyName: row.company_name ? String(row.company_name) : "",
        website: row.website ? String(row.website) : "",
      }));
    }

    const tableByEntityType: Record<string, string> = {
      leads: "crm_leads",
      contacts: "crm_contacts",
      companies: "crm_companies",
      deals: "crm_deals",
    };
    const alias = "entity";
    const table = tableByEntityType[entityType];
    if (!table) {
      return [];
    }

    const resolved = resolveSegmentWhere(conditions, matchType, alias, entityType);
    const emailColumn = entityType === "companies" ? "email" : "email";
    const result = await pool.query(
      `
        SELECT ${alias}.email,
               ${alias}.first_name,
               ${alias}.last_name,
               ${alias}.company_name,
               ${alias}.website,
               ${alias}.name
        FROM ${table} ${alias}
        WHERE ${alias}.deleted_at IS NULL
          AND ${resolved.sql}
          AND COALESCE(${alias}.${emailColumn}, '') <> ''
        LIMIT 100
      `,
      resolved.values
    );

    return (result.rows as Array<Record<string, unknown>>).map((row) => ({
      email: String(row.email ?? ""),
      firstName: row.first_name ? String(row.first_name) : row.name ? String(row.name) : "",
      lastName: row.last_name ? String(row.last_name) : "",
      companyName: row.company_name ? String(row.company_name) : row.name ? String(row.name) : "",
      website: row.website ? String(row.website) : "",
    }));
  }

  const tableByRecipientType: Record<string, string> = {
    leads: "crm_leads",
    contacts: "crm_contacts",
    companies: "crm_companies",
  };
  const table = tableByRecipientType[campaign.recipientType];
  if (!table) {
    return [];
  }

  const result = await pool.query(
    `
      SELECT email, first_name, last_name, company_name, website, name
      FROM ${table}
      WHERE deleted_at IS NULL
        AND COALESCE(email, '') <> ''
      ORDER BY updated_at DESC, id DESC
      LIMIT 100
    `
  );

  return (result.rows as Array<Record<string, unknown>>).map((row) => ({
    email: String(row.email ?? ""),
    firstName: row.first_name ? String(row.first_name) : row.name ? String(row.name) : "",
    lastName: row.last_name ? String(row.last_name) : "",
    companyName: row.company_name ? String(row.company_name) : row.name ? String(row.name) : "",
    website: row.website ? String(row.website) : "",
  }));
};

const applyCampaignVariables = (
  template: string,
  recipient: {
    firstName?: string;
    lastName?: string;
    companyName?: string;
    email?: string;
    website?: string;
  }
) =>
  [
    ["{{firstName}}", recipient.firstName || ""],
    ["{{lastName}}", recipient.lastName || ""],
    ["{{companyName}}", recipient.companyName || ""],
    ["{{email}}", recipient.email || ""],
    ["{{website}}", recipient.website || ""],
  ].reduce(
    (content, [token, replacement]) => content.split(token).join(replacement),
    template
  );

const getDefaultEmailAccountId = async () => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      SELECT id
      FROM email_accounts
      WHERE deleted_at IS NULL AND is_active = TRUE
      ORDER BY is_default DESC, updated_at DESC, id DESC
      LIMIT 1
    `
  );

  if (result.rowCount === 0) {
    throw new Error(
      "No active email account is configured. Add one in Email Manager before sending campaigns."
    );
  }

  return Number(result.rows[0].id);
};

export const listLeads = async (query: PaginationQuery) =>
  getListResult({
    table: "crm_leads",
    alias: "lead",
    selectSql: `
      SELECT
        lead.*,
        EXISTS (
          SELECT 1
          FROM crm_custom_leads custom_lead
          WHERE
            (
              COALESCE(LOWER(custom_lead.business_email), '') <> ''
              AND COALESCE(LOWER(custom_lead.business_email), '') = COALESCE(LOWER(lead.email), '')
            )
            OR (
              COALESCE(LOWER(custom_lead.website), '') <> ''
              AND COALESCE(LOWER(custom_lead.website), '') = COALESCE(LOWER(lead.website), '')
            )
        ) AS has_custom_portfolio
      FROM crm_leads lead
    `,
    searchableColumns: [
      "lead.first_name",
      "lead.last_name",
      "lead.email",
      "lead.emails::text",
      "lead.phone",
      "lead.phones::text",
      "lead.address",
      "lead.company_name",
      "lead.lead_type",
      "lead.lead_source",
    ],
    filters: [
      { queryValue: toTrimmedString(query.status), clause: "lead.lead_status = ?" },
      { queryValue: toTrimmedString(query.leadType), clause: "lead.lead_type = ?" },
      { queryValue: toTrimmedString(query.source), clause: "lead.lead_source = ?" },
      { queryValue: toTrimmedString(query.owner), clause: "lead.assigned_to::text = ?" },
      { queryValue: toTrimmedString(query.priority), clause: "lead.lead_priority = ?" },
      { queryValue: toTrimmedString(query.tags) ? `%${toTrimmedString(query.tags)}%` : "", clause: "lead.tags::text ILIKE ?" },
      { queryValue: toTrimmedString(query.companyName) ? `%${toTrimmedString(query.companyName)}%` : "", clause: "lead.company_name ILIKE ?" },
      {
        queryValue:
          toTrimmedString(query.cleanupStatus) === "needs_review" || toTrimmedString(query.cleanupStatus) === "not_review"
            ? "%cleanup-review%"
            : "",
        clause:
          toTrimmedString(query.cleanupStatus) === "needs_review"
            ? "lead.tags::text ILIKE ?"
            : toTrimmedString(query.cleanupStatus) === "not_review"
              ? "lead.tags::text NOT ILIKE ?"
              : "TRUE = TRUE",
      },
    ],
    dateColumn: "lead.created_at",
    sortColumnMap: {
      createdAt: "lead.created_at",
      lastActivity: "lead.last_activity_at",
      priority: "lead.lead_priority",
      score: "lead.lead_score",
    },
    query,
    mapRow: mapLead,
  });

export const getLeadById = async (id: number) =>
  withSchemaRecovery(async () => {
    const pool = await getAnalyticsPool();
    const result = await pool.query(
      `
        SELECT
          lead.*,
          EXISTS (
            SELECT 1
            FROM crm_custom_leads custom_lead
            WHERE
              (
                COALESCE(LOWER(custom_lead.business_email), '') <> ''
                AND COALESCE(LOWER(custom_lead.business_email), '') = COALESCE(LOWER(lead.email), '')
              )
              OR (
                COALESCE(LOWER(custom_lead.website), '') <> ''
                AND COALESCE(LOWER(custom_lead.website), '') = COALESCE(LOWER(lead.website), '')
              )
          ) AS has_custom_portfolio
        FROM crm_leads lead
        WHERE lead.id = $1 AND lead.deleted_at IS NULL
        LIMIT 1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapLead(result.rows[0] as Record<string, unknown>);
  });

export const getLeadCustomPortfolioByLeadId = async (id: number) =>
  withSchemaRecovery(async () => {
    const lead = await getLeadById(id);
    if (!lead) {
      throw new Error("Lead not found.");
    }

    const email = toTrimmedString(lead.email).toLowerCase();
    const website = toTrimmedString(lead.website).toLowerCase();
    if (!email && !website) {
      return null;
    }

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (email) {
      values.push(email);
      conditions.push(`LOWER(COALESCE(custom_lead.business_email, '')) = $${values.length}`);
    }

    if (website) {
      values.push(website);
      conditions.push(`LOWER(COALESCE(custom_lead.website, '')) = $${values.length}`);
    }

    const pool = await getAnalyticsPool();
    const result = await pool.query(
      `
        SELECT *
        FROM crm_custom_leads custom_lead
        WHERE ${conditions.join(" OR ")}
        ORDER BY custom_lead.created_at DESC, custom_lead.id DESC
        LIMIT 1
      `,
      values
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapCustomPortfolioLead(result.rows[0] as Record<string, unknown>);
  });

export const createLead = async (
  payload: Record<string, unknown>,
  actor: AdminActor,
  options?: LeadActivityOptions
) => {
  const input = await sanitizeLeadPayload(payload, actor);
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      INSERT INTO crm_leads (
        first_name, last_name, email, phone, emails, phones, address, company_name, job_title, website,
        country, city, state, industry, category, sub_category, lifecycle_stage,
        lead_type, lead_source, lead_status, lead_priority, lead_score, estimated_value, currency,
        assigned_to, tags, notes,
        unsubscribed, bounced, bounce_type, spam_complaint, do_not_contact, email_consent_status,
        last_email_sent_at, email_sent_count, last_email_opened_at, email_open_count,
        last_email_clicked_at, email_click_count, last_email_replied_at, email_reply_count,
        last_campaign_name, last_campaign_status, last_campaign_id,
        next_follow_up_at, last_activity_at,
        created_by, updated_by, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17,
        $18, $19, $20, $21, $22, $23, $24,
        $25, $26::jsonb, $27::jsonb,
        $28, $29, $30, $31, $32, $33,
        $34, $35, $36, $37,
        $38, $39, $40, $41,
        $42, $43, $44,
        $45, NOW(),
        $46, $47, NOW(), NOW()
      )
      RETURNING *
    `,
    [
      input.firstName,
      input.lastName,
      input.email,
      input.phone,
      JSON.stringify(input.emails),
      JSON.stringify(input.phones),
      input.address,
      input.companyName,
      input.jobTitle,
      input.website,
      input.country,
      input.city,
      input.state,
      input.industry,
      input.category,
      input.subCategory,
      input.lifecycleStage,
      input.leadType,
      input.leadSource,
      input.leadStatus,
      input.leadPriority,
      input.leadScore,
      input.estimatedValue,
      input.currency,
      input.assignedTo,
      JSON.stringify(input.tags),
      JSON.stringify(input.notes),
      input.unsubscribed,
      input.bounced,
      input.bounceType,
      input.spamComplaint,
      input.doNotContact,
      input.emailConsentStatus,
      input.lastEmailSentAt,
      input.emailSentCount,
      input.lastEmailOpenedAt,
      input.emailOpenCount,
      input.lastEmailClickedAt,
      input.emailClickCount,
      input.lastEmailRepliedAt,
      input.emailReplyCount,
      input.lastCampaignName,
      input.lastCampaignStatus,
      input.lastCampaignId,
      input.nextFollowUpAt,
      actor.id,
      actor.id,
    ]
  );

  const lead = mapLead(result.rows[0] as Record<string, unknown>);
  if (!options?.skipActivity) {
    await insertActivity({
      activityType: options?.activityOverride?.activityType ?? "Lead Created",
      title:
        options?.activityOverride?.title ??
        `Lead created: ${lead.firstName || lead.companyName || "Untitled lead"}`,
      description:
        options?.activityOverride?.description ??
        (lead.email ? `Lead email: ${lead.email}` : null),
      relatedType: "lead",
      relatedId: Number(lead.id),
      actor,
      metadata: options?.activityOverride?.metadata,
    });
  }
  return lead;
};

export const updateLead = async (
  id: number,
  payload: Record<string, unknown>,
  actor: AdminActor,
  options?: LeadActivityOptions
) => {
  const existing = await getLeadById(id);
  if (!existing) {
    throw new Error("Lead not found.");
  }

  const input = await sanitizeLeadPayload(
    {
      ...existing,
      ...payload,
      notes: Array.isArray(payload.notes) ? payload.notes : existing.notes,
    },
    actor
  );

  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      UPDATE crm_leads
      SET first_name = $2,
          last_name = $3,
          email = $4,
          phone = $5,
          emails = $6::jsonb,
          phones = $7::jsonb,
          address = $8,
          company_name = $9,
          job_title = $10,
          website = $11,
          country = $12,
          city = $13,
          state = $14,
          industry = $15,
          category = $16,
          sub_category = $17,
          lifecycle_stage = $18,
          lead_type = $19,
          lead_source = $20,
          lead_status = $21,
          lead_priority = $22,
          lead_score = $23,
          estimated_value = $24,
          currency = $25,
          assigned_to = $26,
          tags = $27::jsonb,
          notes = $28::jsonb,
          unsubscribed = $29,
          bounced = $30,
          bounce_type = $31,
          spam_complaint = $32,
          do_not_contact = $33,
          email_consent_status = $34,
          last_email_sent_at = $35,
          email_sent_count = $36,
          last_email_opened_at = $37,
          email_open_count = $38,
          last_email_clicked_at = $39,
          email_click_count = $40,
          last_email_replied_at = $41,
          email_reply_count = $42,
          last_campaign_name = $43,
          last_campaign_status = $44,
          last_campaign_id = $45,
          next_follow_up_at = $46,
          last_activity_at = NOW(),
          updated_by = $47,
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `,
    [
      id,
      input.firstName,
      input.lastName,
      input.email,
      input.phone,
      JSON.stringify(input.emails),
      JSON.stringify(input.phones),
      input.address,
      input.companyName,
      input.jobTitle,
      input.website,
      input.country,
      input.city,
      input.state,
      input.industry,
      input.category,
      input.subCategory,
      input.lifecycleStage,
      input.leadType,
      input.leadSource,
      input.leadStatus,
      input.leadPriority,
      input.leadScore,
      input.estimatedValue,
      input.currency,
      input.assignedTo,
      JSON.stringify(input.tags),
      JSON.stringify(input.notes),
      input.unsubscribed,
      input.bounced,
      input.bounceType,
      input.spamComplaint,
      input.doNotContact,
      input.emailConsentStatus,
      input.lastEmailSentAt,
      input.emailSentCount,
      input.lastEmailOpenedAt,
      input.emailOpenCount,
      input.lastEmailClickedAt,
      input.emailClickCount,
      input.lastEmailRepliedAt,
      input.emailReplyCount,
      input.lastCampaignName,
      input.lastCampaignStatus,
      input.lastCampaignId,
      input.nextFollowUpAt,
      actor.id,
    ]
  );

  const lead = mapLead(result.rows[0] as Record<string, unknown>);
  if (!options?.skipActivity) {
    await insertActivity({
      activityType: options?.activityOverride?.activityType ?? "Lead Updated",
      title:
        options?.activityOverride?.title ??
        `Lead updated: ${lead.firstName || lead.companyName || "Untitled lead"}`,
      description: options?.activityOverride?.description ?? null,
      relatedType: "lead",
      relatedId: Number(lead.id),
      actor,
      metadata: options?.activityOverride?.metadata,
    });
  }
  return lead;
};

export const deleteLead = async (id: number, actor: AdminActor) => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      UPDATE crm_leads
      SET deleted_at = NOW(), updated_by = $2, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `,
    [id, actor.id]
  );

  if (result.rowCount === 0) {
    throw new Error("Lead not found.");
  }

  return { success: true };
};

export const addLeadNote = async (
  id: number,
  payload: Record<string, unknown>,
  actor: AdminActor
) => {
  const lead = await getLeadById(id);
  if (!lead) {
    throw new Error("Lead not found.");
  }

  const text = toTrimmedString(payload.note ?? payload.text);
  if (!text) {
    throw new Error("Note text is required.");
  }

  const nextNotes = appendNote(lead.notes as JsonRecord[], text, actor);
  const pool = await getAnalyticsPool();
  await pool.query(
    `
      UPDATE crm_leads
      SET notes = $2::jsonb, last_activity_at = NOW(), updated_by = $3, updated_at = NOW()
      WHERE id = $1
    `,
    [id, JSON.stringify(nextNotes), actor.id]
  );

  await insertActivity({
    activityType: "Note Added",
    title: `Note added to lead`,
    description: text,
    relatedType: "lead",
    relatedId: id,
    actor,
  });

  return getLeadById(id);
};

export const setLeadBlocked = async (
  id: number,
  payload: Record<string, unknown>,
  actor: AdminActor
) => {
  const lead = await getLeadById(id);
  if (!lead) {
    throw new Error("Lead not found.");
  }

  const blocked = parseBooleanLikeValue(payload.blocked ?? true);
  const reason = toOptionalString(payload.reason);

  if (Boolean(lead.doNotContact) === blocked) {
    return lead;
  }

  const timestamp = new Date().toISOString();
  const noteText = blocked
    ? `Lead blocked by admin on ${timestamp}. Future CRM contact disabled.${reason ? ` Reason: ${reason}.` : ""}`
    : `Lead unblocked by admin on ${timestamp}. CRM contact may resume if other safety checks pass.${reason ? ` Reason: ${reason}.` : ""}`;
  const nextNotes = appendNote(lead.notes as JsonRecord[], noteText, actor);
  const nextLastCampaignStatus = blocked ? "blocked" : lead.lastCampaignStatus;

  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      UPDATE crm_leads
      SET do_not_contact = $2,
          notes = $3::jsonb,
          last_campaign_status = $4,
          last_activity_at = NOW(),
          updated_by = $5,
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `,
    [id, blocked, JSON.stringify(nextNotes), nextLastCampaignStatus, actor.id]
  );

  if (result.rowCount === 0) {
    throw new Error("Lead not found.");
  }

  await insertActivity({
    activityType: blocked ? "Lead Blocked" : "Lead Unblocked",
    title: blocked ? "Lead blocked from CRM contact" : "Lead unblocked for CRM contact",
    description: noteText,
    relatedType: "lead",
    relatedId: id,
    actor,
    metadata: {
      blocked,
      reason,
    },
  });

  return mapLead(result.rows[0] as Record<string, unknown>);
};

export const createLeadTask = async (
  id: number,
  payload: Record<string, unknown>,
  actor: AdminActor
) => {
  const lead = await getLeadById(id);
  if (!lead) {
    throw new Error("Lead not found.");
  }

  return createTask(
    {
      ...payload,
      relatedType: "lead",
      relatedId: id,
    },
    actor
  );
};

export const convertLead = async (
  id: number,
  payload: LeadConvertPayload,
  actor: AdminActor
) => {
  const pool = await getAnalyticsPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const leadResult = await client.query(
      `SELECT * FROM crm_leads WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [id]
    );

    if (leadResult.rowCount === 0) {
      throw new Error("Lead not found.");
    }

    const lead = mapLead(leadResult.rows[0] as Record<string, unknown>);

    let contactId =
      lead.convertedContactId != null ? Number(lead.convertedContactId) : null;
    let companyId =
      lead.convertedCompanyId != null ? Number(lead.convertedCompanyId) : null;
    let dealId = lead.convertedDealId != null ? Number(lead.convertedDealId) : null;

    if (contactId == null && lead.email) {
      const existingContact = await client.query(
        `
          SELECT id
          FROM crm_contacts
          WHERE lower(email) = lower($1) AND deleted_at IS NULL
          LIMIT 1
        `,
        [lead.email]
      );

      if (existingContact.rowCount > 0) {
        contactId = Number(existingContact.rows[0].id);
      }
    }

    if (companyId == null && lead.companyName) {
      const existingCompany = await client.query(
        `
          SELECT id
          FROM crm_companies
          WHERE lower(name) = lower($1) AND deleted_at IS NULL
          LIMIT 1
        `,
        [lead.companyName]
      );

      if (existingCompany.rowCount > 0) {
        companyId = Number(existingCompany.rows[0].id);
      }
    }

    if (companyId == null && lead.companyName) {
      const insertedCompany = await client.query(
        `
          INSERT INTO crm_companies (
            name, website, email, phone, owner, status, tags,
            created_by, updated_by, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, 'Prospect', $6::jsonb, $7, $8, NOW(), NOW())
          RETURNING id
        `,
        [
          lead.companyName,
          lead.website,
          lead.email,
          lead.phone,
          lead.assignedTo,
          JSON.stringify(lead.tags ?? []),
          actor.id,
          actor.id,
        ]
      );
      companyId = Number(insertedCompany.rows[0].id);
    }

    if (contactId == null) {
      const insertedContact = await client.query(
        `
          INSERT INTO crm_contacts (
            first_name, last_name, email, phone, company_id, company_name, job_title,
            contact_type, lifecycle_stage, owner, tags, notes, next_follow_up_at,
            created_by, updated_by, created_at, updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            'Prospect', 'Lead', $8, $9::jsonb, $10::jsonb, $11,
            $12, $13, NOW(), NOW()
          )
          RETURNING id
        `,
        [
          lead.firstName || lead.companyName || "Lead",
          lead.lastName,
          lead.email,
          lead.phone,
          companyId,
          lead.companyName,
          lead.jobTitle,
          lead.assignedTo,
          JSON.stringify(lead.tags ?? []),
          JSON.stringify(lead.notes ?? []),
          lead.nextFollowUpAt,
          actor.id,
          actor.id,
        ]
      );
      contactId = Number(insertedContact.rows[0].id);
    }

    if (toTrimmedString(payload.createDeal).toLowerCase() === "true" || payload.createDeal === true) {
      if (dealId == null) {
        const stage =
          assertAllowed(
            toOptionalString(payload.stage),
            CRM_DEFAULTS.dealStages,
            "stage"
          ) ?? "New";
        const dealResult = await client.query(
          `
            INSERT INTO crm_deals (
              title, lead_id, contact_id, company_id, stage, value, currency, probability,
              expected_close_date, owner, source, description,
              created_by, updated_by, created_at, updated_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8,
              $9, $10, $11, $12,
              $13, $14, NOW(), NOW()
            )
            RETURNING id
          `,
          [
            toOptionalString(payload.dealTitle) ||
              `${lead.companyName || `${lead.firstName || "Lead"} ${lead.lastName || ""}`.trim()} Opportunity`,
            id,
            contactId,
            companyId,
            stage,
            toFiniteNumber(payload.dealValue ?? lead.estimatedValue ?? 0, "dealValue", {
              min: 0,
            }),
            toOptionalString(payload.currency) ?? lead.currency ?? CRM_DEFAULTS.defaultCurrency,
            toFiniteNumber(payload.probability ?? 50, "probability", {
              min: 0,
              max: 100,
            }),
            toIsoDateTimeOrNull(payload.expectedCloseDate, "expectedCloseDate"),
            lead.assignedTo,
            lead.leadSource,
            toOptionalString(payload.description),
            actor.id,
            actor.id,
          ]
        );
        dealId = Number(dealResult.rows[0].id);
      }
    }

    await client.query(
      `
        UPDATE crm_leads
        SET lead_status = 'Converted',
            converted_contact_id = $2,
            converted_company_id = $3,
            converted_deal_id = $4,
            last_activity_at = NOW(),
            updated_by = $5,
            updated_at = NOW()
        WHERE id = $1
      `,
      [id, contactId, companyId, dealId, actor.id]
    );

    await client.query("COMMIT");

    await insertActivity({
      activityType: "Lead Converted",
      title: `Lead converted`,
      description: `Lead ${id} converted to CRM records.`,
      relatedType: "lead",
      relatedId: id,
      actor,
      metadata: {
        contactId,
        companyId,
        dealId,
      },
    });

    return {
      lead: await getLeadById(id),
      contactId,
      companyId,
      dealId,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const previewLeadImport = async (
  buffer: Buffer,
  payload: Record<string, unknown>,
  actor: AdminActor
) => {
  const options = parseLeadImportOptions(payload);
  const { preview } = await prepareLeadImport(buffer, options, actor, `preview-${Date.now()}`);
  return preview;
};

export const previewLeadEmailCleanup = async (
  buffer: Buffer,
  _payload: Record<string, unknown>,
  _actor: AdminActor
) => {
  const { preview } = await prepareLeadEmailCleanup(buffer);
  return preview;
};

export const importLeadsFromCsv = async (
  buffer: Buffer,
  payload: Record<string, unknown>,
  actor: AdminActor
) => {
  const options = parseLeadImportOptions(payload);
  const importOperationId = `lead-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { drafts, preview } = await prepareLeadImport(buffer, options, actor, importOperationId);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [...preview.errors];

  for (const draft of drafts) {
    if (!draft.payload || draft.status === "invalid") {
      failed += 1;
      continue;
    }

    try {
      if (draft.status === "duplicate" && draft.duplicateAction === "skip") {
        skipped += 1;
        continue;
      }

      if (draft.status === "duplicate" && draft.duplicateAction === "update" && draft.duplicateLeadId) {
        const existingLead = await getLeadById(draft.duplicateLeadId);
        if (!existingLead) {
          throw new Error("Existing lead could not be found for update.");
        }

        await updateLead(
          draft.duplicateLeadId,
          buildLeadImportUpdatePayload(existingLead, draft.payload),
          actor,
          {
            skipActivity: !options.createActivityLogs,
            activityOverride: options.createActivityLogs
              ? {
                  activityType: "Lead Updated",
                  title: "Lead updated from import",
                  description: "Lead was updated from CSV import",
                  metadata: {
                    source: "csv-import",
                    row: draft.row,
                  },
                }
              : undefined,
          }
        );
        updated += 1;
        continue;
      }

      await createLead(draft.payload, actor, {
        skipActivity: !options.createActivityLogs,
        activityOverride: options.createActivityLogs
          ? {
              activityType: "Lead Created",
              title: "Lead imported",
              description: "Lead was imported from CSV",
              metadata: {
                source: "csv-import",
                row: draft.row,
              },
            }
          : undefined,
      });
      created += 1;
    } catch (error) {
      failed += 1;
      errors.push({
        row: draft.row,
        field: "row",
        message: readErrorMessage(error, "Failed to import row."),
      });
    }
  }

  if (options.createActivityLogs && (created > 0 || updated > 0 || skipped > 0 || failed > 0)) {
    await insertActivity({
      activityType: "Leads Imported",
      title: "CSV lead import completed",
      description: `Created ${created}, updated ${updated}, skipped ${skipped}, failed ${failed}.`,
      actor,
      metadata: {
        source: "csv-import",
        totalRows: preview.totalRows,
        created,
        updated,
        skipped,
        failed,
      },
    });
  }

  const result: LeadImportResult = {
    totalRows: preview.totalRows,
    created,
    updated,
    skipped,
    failed,
    errors,
    warnings: preview.warnings,
  };

  return result;
};

export const applyLeadEmailCleanup = async (
  buffer: Buffer,
  _payload: Record<string, unknown>,
  actor: AdminActor
) => {
  const { drafts, preview } = await prepareLeadEmailCleanup(buffer);
  const pool = await getAnalyticsPool();
  let updatedRows = 0;
  let failedRows = 0;
  const errors = [...preview.errors];

  for (const draft of drafts) {
    if (draft.status !== "matched" || !draft.matchedLead || !draft.bestEmail) {
      continue;
    }

    try {
      const existingLead = draft.matchedLead;
      const nextTags = buildLeadEmailCleanupTags(
        Array.isArray(existingLead.tags) ? (existingLead.tags as string[]) : [],
        draft.bestEmail,
        draft.bestEmailType ?? null,
        draft.sendStatus ?? null,
        {
          ...existingLead,
          email: draft.bestEmail,
        }
      );
      const nextNotes = [
        ...(Array.isArray(existingLead.notes) ? (existingLead.notes as JsonRecord[]) : []),
        buildLeadEmailCleanupNote(draft, actor),
      ];

      const result = await pool.query(
        `
          UPDATE crm_leads
          SET email = $2,
              tags = $3::jsonb,
              notes = $4::jsonb,
              updated_by = $5,
              updated_at = NOW()
          WHERE id = $1
            AND deleted_at IS NULL
          RETURNING id
        `,
        [
          Number(existingLead.id),
          draft.bestEmail,
          JSON.stringify(nextTags),
          JSON.stringify(nextNotes),
          actor.id,
        ]
      );

      if (result.rowCount === 0) {
        throw new Error("Lead was not updated because it no longer exists.");
      }

      updatedRows += 1;
    } catch (error) {
      failedRows += 1;
      console.error("CRM lead email cleanup apply error:", {
        row: draft.row,
        leadId: draft.leadId ?? null,
        message: readErrorMessage(error, "Failed to apply email cleanup."),
      });
      errors.push({
        row: draft.row,
        field: "row",
        message: readErrorMessage(error, "Failed to apply email cleanup."),
      });
    }
  }

  if (updatedRows > 0 || failedRows > 0 || preview.unmatchedRows > 0 || preview.skippedRows > 0) {
    await insertActivity({
      activityType: "Leads Imported",
      title: "Agency email cleanup applied",
      description: `Updated ${updatedRows}, unmatched ${preview.unmatchedRows}, skipped ${preview.skippedRows}, failed ${failedRows}.`,
      actor,
      metadata: {
        source: "agency-email-cleanup",
        totalRows: preview.totalRows,
        matchedRows: preview.matchedRows,
        unmatchedRows: preview.unmatchedRows,
        skippedRows: preview.skippedRows,
        updatedRows,
        failedRows,
      },
    });
  }

  const result: LeadEmailCleanupResult = {
    totalRows: preview.totalRows,
    matchedRows: preview.matchedRows,
    unmatchedRows: preview.unmatchedRows,
    updatedRows,
    skippedRows: preview.skippedRows,
    failedRows,
    errors,
    warnings: preview.warnings,
  };

  return result;
};

export const listContacts = async (query: PaginationQuery) =>
  getListResult({
    table: "crm_contacts",
    alias: "contact",
    searchableColumns: [
      "contact.first_name",
      "contact.last_name",
      "contact.email",
      "contact.phone",
      "contact.company_name",
      "contact.job_title",
    ],
    filters: [
      { queryValue: toTrimmedString(query.status), clause: "contact.lifecycle_stage = ?" },
      { queryValue: toTrimmedString(query.owner), clause: "contact.owner::text = ?" },
    ],
    dateColumn: "contact.created_at",
    sortColumnMap: {
      createdAt: "contact.created_at",
      lastActivity: "contact.last_contacted_at",
    },
    query,
    mapRow: mapContact,
  });

export const getContactById = async (id: number) =>
  getRecordById("crm_contacts", id, mapContact);

export const createContact = async (payload: Record<string, unknown>, actor: AdminActor) => {
  const input = await sanitizeContactPayload(payload, actor);
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      INSERT INTO crm_contacts (
        first_name, last_name, email, phone, alternate_phone, company_id, company_name,
        job_title, department, contact_type, lifecycle_stage, owner, tags, notes,
        last_contacted_at, next_follow_up_at, created_by, updated_by, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb,
        $15, $16, $17, $18, NOW(), NOW()
      )
      RETURNING *
    `,
    [
      input.firstName,
      input.lastName,
      input.email,
      input.phone,
      input.alternatePhone,
      input.companyId,
      input.companyName,
      input.jobTitle,
      input.department,
      input.contactType,
      input.lifecycleStage,
      input.owner,
      JSON.stringify(input.tags),
      JSON.stringify(input.notes),
      input.lastContactedAt,
      input.nextFollowUpAt,
      actor.id,
      actor.id,
    ]
  );

  const contact = mapContact(result.rows[0] as Record<string, unknown>);
  await insertActivity({
    activityType: "Contact Created",
    title: `Contact created: ${contact.firstName} ${contact.lastName || ""}`.trim(),
    relatedType: "contact",
    relatedId: Number(contact.id),
    actor,
  });
  return contact;
};

export const updateContact = async (
  id: number,
  payload: Record<string, unknown>,
  actor: AdminActor
) => {
  const existing = await getContactById(id);
  if (!existing) {
    throw new Error("Contact not found.");
  }

  const input = await sanitizeContactPayload(
    {
      ...existing,
      ...payload,
    },
    actor
  );

  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      UPDATE crm_contacts
      SET first_name = $2,
          last_name = $3,
          email = $4,
          phone = $5,
          alternate_phone = $6,
          company_id = $7,
          company_name = $8,
          job_title = $9,
          department = $10,
          contact_type = $11,
          lifecycle_stage = $12,
          owner = $13,
          tags = $14::jsonb,
          notes = $15::jsonb,
          last_contacted_at = $16,
          next_follow_up_at = $17,
          updated_by = $18,
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `,
    [
      id,
      input.firstName,
      input.lastName,
      input.email,
      input.phone,
      input.alternatePhone,
      input.companyId,
      input.companyName,
      input.jobTitle,
      input.department,
      input.contactType,
      input.lifecycleStage,
      input.owner,
      JSON.stringify(input.tags),
      JSON.stringify(input.notes),
      input.lastContactedAt,
      input.nextFollowUpAt,
      actor.id,
    ]
  );

  const contact = mapContact(result.rows[0] as Record<string, unknown>);
  await insertActivity({
    activityType: "Contact Updated",
    title: `Contact updated: ${contact.firstName} ${contact.lastName || ""}`.trim(),
    relatedType: "contact",
    relatedId: Number(contact.id),
    actor,
  });
  return contact;
};

export const deleteContact = async (id: number, actor: AdminActor) => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      UPDATE crm_contacts
      SET deleted_at = NOW(), updated_by = $2, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `,
    [id, actor.id]
  );

  if (result.rowCount === 0) {
    throw new Error("Contact not found.");
  }

  return { success: true };
};

export const listCompanies = async (query: PaginationQuery) =>
  getListResult({
    table: "crm_companies",
    alias: "company",
    searchableColumns: [
      "company.name",
      "company.website",
      "company.email",
      "company.phone",
      "company.industry",
      "company.country",
      "company.city",
    ],
    filters: [
      { queryValue: toTrimmedString(query.status), clause: "company.status = ?" },
      { queryValue: toTrimmedString(query.owner), clause: "company.owner::text = ?" },
    ],
    dateColumn: "company.created_at",
    sortColumnMap: {
      createdAt: "company.created_at",
    },
    query,
    mapRow: mapCompany,
  });

export const getCompanyById = async (id: number) =>
  getRecordById("crm_companies", id, mapCompany);

export const createCompany = async (payload: Record<string, unknown>, actor: AdminActor) => {
  const input = await sanitizeCompanyPayload(payload, actor);
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      INSERT INTO crm_companies (
        name, website, industry, company_size, country, city, email, phone,
        linkedin_url, twitter_url, facebook_url, description, owner, status, tags,
        created_by, updated_by, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15::jsonb,
        $16, $17, NOW(), NOW()
      )
      RETURNING *
    `,
    [
      input.name,
      input.website,
      input.industry,
      input.companySize,
      input.country,
      input.city,
      input.email,
      input.phone,
      input.linkedinUrl,
      input.twitterUrl,
      input.facebookUrl,
      input.description,
      input.owner,
      input.status,
      JSON.stringify(input.tags),
      actor.id,
      actor.id,
    ]
  );

  const company = mapCompany(result.rows[0] as Record<string, unknown>);
  await insertActivity({
    activityType: "Company Created",
    title: `Company created: ${company.name}`,
    relatedType: "company",
    relatedId: Number(company.id),
    actor,
  });
  return company;
};

export const updateCompany = async (
  id: number,
  payload: Record<string, unknown>,
  actor: AdminActor
) => {
  const existing = await getCompanyById(id);
  if (!existing) {
    throw new Error("Company not found.");
  }

  const input = await sanitizeCompanyPayload(
    {
      ...existing,
      ...payload,
    },
    actor
  );

  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      UPDATE crm_companies
      SET name = $2,
          website = $3,
          industry = $4,
          company_size = $5,
          country = $6,
          city = $7,
          email = $8,
          phone = $9,
          linkedin_url = $10,
          twitter_url = $11,
          facebook_url = $12,
          description = $13,
          owner = $14,
          status = $15,
          tags = $16::jsonb,
          updated_by = $17,
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `,
    [
      id,
      input.name,
      input.website,
      input.industry,
      input.companySize,
      input.country,
      input.city,
      input.email,
      input.phone,
      input.linkedinUrl,
      input.twitterUrl,
      input.facebookUrl,
      input.description,
      input.owner,
      input.status,
      JSON.stringify(input.tags),
      actor.id,
    ]
  );

  const company = mapCompany(result.rows[0] as Record<string, unknown>);
  await insertActivity({
    activityType: "Company Updated",
    title: `Company updated: ${company.name}`,
    relatedType: "company",
    relatedId: Number(company.id),
    actor,
  });
  return company;
};

export const deleteCompany = async (id: number, actor: AdminActor) => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      UPDATE crm_companies
      SET deleted_at = NOW(), updated_by = $2, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `,
    [id, actor.id]
  );

  if (result.rowCount === 0) {
    throw new Error("Company not found.");
  }

  return { success: true };
};

export const listDeals = async (query: PaginationQuery) =>
  getListResult({
    table: "crm_deals",
    alias: "deal",
    searchableColumns: [
      "deal.title",
      "deal.source",
      "deal.description",
    ],
    filters: [
      { queryValue: toTrimmedString(query.status), clause: "deal.stage = ?" },
      { queryValue: toTrimmedString(query.owner), clause: "deal.owner::text = ?" },
    ],
    dateColumn: "deal.created_at",
    sortColumnMap: {
      createdAt: "deal.created_at",
      lastActivity: "deal.updated_at",
    },
    query,
    mapRow: mapDeal,
  });

export const getDealById = async (id: number) => getRecordById("crm_deals", id, mapDeal);

export const createDeal = async (payload: Record<string, unknown>, actor: AdminActor) => {
  const input = await sanitizeDealPayload(payload, actor);
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      INSERT INTO crm_deals (
        title, lead_id, contact_id, company_id, stage, value, currency, probability,
        expected_close_date, owner, source, description, lost_reason,
        created_by, updated_by, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13,
        $14, $15, NOW(), NOW()
      )
      RETURNING *
    `,
    [
      input.title,
      input.leadId,
      input.contactId,
      input.companyId,
      input.stage,
      input.value,
      input.currency,
      input.probability,
      input.expectedCloseDate,
      input.owner,
      input.source,
      input.description,
      input.lostReason,
      actor.id,
      actor.id,
    ]
  );

  const deal = mapDeal(result.rows[0] as Record<string, unknown>);
  await insertActivity({
    activityType: "Deal Created",
    title: `Deal created: ${deal.title}`,
    relatedType: "deal",
    relatedId: Number(deal.id),
    actor,
  });
  return deal;
};

export const updateDeal = async (
  id: number,
  payload: Record<string, unknown>,
  actor: AdminActor
) => {
  const existing = await getDealById(id);
  if (!existing) {
    throw new Error("Deal not found.");
  }

  const input = await sanitizeDealPayload(
    {
      ...existing,
      ...payload,
    },
    actor
  );

  const wonAt = input.stage === "Won" ? new Date().toISOString() : null;
  const lostAt = input.stage === "Lost" ? new Date().toISOString() : null;

  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      UPDATE crm_deals
      SET title = $2,
          lead_id = $3,
          contact_id = $4,
          company_id = $5,
          stage = $6,
          value = $7,
          currency = $8,
          probability = $9,
          expected_close_date = $10,
          owner = $11,
          source = $12,
          description = $13,
          lost_reason = $14,
          won_at = CASE WHEN $6 = 'Won' THEN COALESCE(won_at, $15) ELSE NULL END,
          lost_at = CASE WHEN $6 = 'Lost' THEN COALESCE(lost_at, $16) ELSE NULL END,
          updated_by = $17,
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `,
    [
      id,
      input.title,
      input.leadId,
      input.contactId,
      input.companyId,
      input.stage,
      input.value,
      input.currency,
      input.probability,
      input.expectedCloseDate,
      input.owner,
      input.source,
      input.description,
      input.lostReason,
      wonAt,
      lostAt,
      actor.id,
    ]
  );

  const deal = mapDeal(result.rows[0] as Record<string, unknown>);
  await insertActivity({
    activityType: existing.stage !== deal.stage ? "Deal Stage Changed" : "Deal Created",
    title:
      existing.stage !== deal.stage
        ? `Deal moved to ${deal.stage}`
        : `Deal updated: ${deal.title}`,
    relatedType: "deal",
    relatedId: Number(deal.id),
    actor,
  });
  return deal;
};

export const deleteDeal = async (id: number, actor: AdminActor) => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      UPDATE crm_deals
      SET deleted_at = NOW(), updated_by = $2, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `,
    [id, actor.id]
  );

  if (result.rowCount === 0) {
    throw new Error("Deal not found.");
  }

  return { success: true };
};

export const updateDealStage = async (
  id: number,
  stageValue: unknown,
  actor: AdminActor
) => {
  const existing = await getDealById(id);
  if (!existing) {
    throw new Error("Deal not found.");
  }

  const stage =
    assertAllowed(toOptionalString(stageValue), CRM_DEFAULTS.dealStages, "stage") ??
    "New";

  return updateDeal(
    id,
    {
      ...existing,
      stage,
    },
    actor
  );
};

export const listTasks = async (query: PaginationQuery) =>
  getListResult({
    table: "crm_tasks",
    alias: "task",
    searchableColumns: [
      "task.title",
      "task.description",
      "task.task_type",
      "task.status",
    ],
    filters: [
      { queryValue: toTrimmedString(query.status), clause: "task.status = ?" },
      { queryValue: toTrimmedString(query.owner), clause: "task.assigned_to::text = ?" },
      { queryValue: toTrimmedString(query.priority), clause: "task.priority = ?" },
    ],
    dateColumn: "task.created_at",
    sortColumnMap: {
      createdAt: "task.created_at",
      dueAt: "task.due_at",
      priority: "task.priority",
    },
    query,
    mapRow: mapTask,
  });

export const getTaskById = async (id: number) => getRecordById("crm_tasks", id, mapTask);

export const createTask = async (payload: Record<string, unknown>, actor: AdminActor) => {
  const input = await sanitizeTaskPayload(payload, actor);
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      INSERT INTO crm_tasks (
        title, description, task_type, priority, status, due_at, reminder_at,
        assigned_to, related_type, related_id, created_by, updated_by, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, NOW(), NOW()
      )
      RETURNING *
    `,
    [
      input.title,
      input.description,
      input.taskType,
      input.priority,
      input.status,
      input.dueAt,
      input.reminderAt,
      input.assignedTo,
      input.relatedType,
      input.relatedId,
      actor.id,
      actor.id,
    ]
  );

  const task = mapTask(result.rows[0] as Record<string, unknown>);
  await insertActivity({
    activityType: "Task Created",
    title: `Task created: ${task.title}`,
    relatedType: task.relatedType ? String(task.relatedType) : "task",
    relatedId: task.relatedId ? Number(task.relatedId) : Number(task.id),
    actor,
  });
  return task;
};

export const updateTask = async (
  id: number,
  payload: Record<string, unknown>,
  actor: AdminActor
) => {
  const existing = await getTaskById(id);
  if (!existing) {
    throw new Error("Task not found.");
  }

  const input = await sanitizeTaskPayload(
    {
      ...existing,
      ...payload,
    },
    actor
  );

  const result = await (await getAnalyticsPool()).query(
    `
      UPDATE crm_tasks
      SET title = $2,
          description = $3,
          task_type = $4,
          priority = $5,
          status = $6,
          due_at = $7,
          reminder_at = $8,
          assigned_to = $9,
          related_type = $10,
          related_id = $11,
          updated_by = $12,
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `,
    [
      id,
      input.title,
      input.description,
      input.taskType,
      input.priority,
      input.status,
      input.dueAt,
      input.reminderAt,
      input.assignedTo,
      input.relatedType,
      input.relatedId,
      actor.id,
    ]
  );

  return mapTask(result.rows[0] as Record<string, unknown>);
};

export const deleteTask = async (id: number, actor: AdminActor) => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      UPDATE crm_tasks
      SET deleted_at = NOW(), updated_by = $2, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `,
    [id, actor.id]
  );

  if (result.rowCount === 0) {
    throw new Error("Task not found.");
  }

  return { success: true };
};

export const completeTask = async (id: number, actor: AdminActor) => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      UPDATE crm_tasks
      SET status = 'Completed',
          completed_at = NOW(),
          updated_by = $2,
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `,
    [id, actor.id]
  );

  if (result.rowCount === 0) {
    throw new Error("Task not found.");
  }

  const task = mapTask(result.rows[0] as Record<string, unknown>);
  await insertActivity({
    activityType: "Task Completed",
    title: `Task completed: ${task.title}`,
    relatedType: task.relatedType ? String(task.relatedType) : "task",
    relatedId: task.relatedId ? Number(task.relatedId) : Number(task.id),
    actor,
  });
  return task;
};

export const listActivities = async (query: PaginationQuery) =>
  getListResult({
    table: "crm_activities",
    alias: "activity",
    searchableColumns: [
      "activity.activity_type",
      "activity.title",
      "activity.description",
      "activity.actor_name",
    ],
    filters: [
      { queryValue: toTrimmedString(query.status), clause: "activity.activity_type = ?" },
      { queryValue: toTrimmedString(query.source), clause: "activity.related_type = ?" },
    ],
    dateColumn: "activity.created_at",
    sortColumnMap: {
      createdAt: "activity.created_at",
    },
    query,
    mapRow: mapActivity,
  });

export const createActivity = async (payload: Record<string, unknown>, actor: AdminActor) => {
  const activityType =
    assertAllowed(
      toOptionalString(payload.activityType),
      CRM_DEFAULTS.activityTypes,
      "activityType"
    ) ?? "Note Added";
  const title = toTrimmedString(payload.title);
  if (!title) {
    throw new Error("title is required.");
  }

  await insertActivity({
    activityType,
    title,
    description: toOptionalString(payload.description),
    relatedType: toOptionalString(payload.relatedType),
    relatedId: toNumberOrNull(payload.relatedId),
    actor,
    metadata:
      payload.metadata && typeof payload.metadata === "object"
        ? (payload.metadata as JsonRecord)
        : {},
  });

  const latest = await listActivities({ page: 1, limit: 1 });
  return latest.items[0] ?? null;
};

export const listCampaigns = async (query: PaginationQuery) =>
  getListResult({
    table: "crm_campaigns",
    alias: "campaign",
    searchableColumns: [
      "campaign.name",
      "campaign.subject",
      "campaign.status",
      "campaign.recipient_type",
    ],
    filters: [{ queryValue: toTrimmedString(query.status), clause: "campaign.status = ?" }],
    dateColumn: "campaign.created_at",
    sortColumnMap: {
      createdAt: "campaign.created_at",
      sentAt: "campaign.sent_at",
    },
    query,
    mapRow: mapCampaign,
  });

export const getCampaignById = async (id: number) =>
  getRecordById("crm_campaigns", id, mapCampaign);

export const createCampaign = async (
  payload: Record<string, unknown>,
  actor: AdminActor
) => {
  const input = await sanitizeCampaignPayload(payload);
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      INSERT INTO crm_campaigns (
        name, subject, body, status, recipient_type, segment_id,
        recipient_count, sent_count, failed_count, opened_count, clicked_count,
        scheduled_at, created_by, updated_by, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, NOW(), NOW()
      )
      RETURNING *
    `,
    [
      input.name,
      input.subject,
      input.body,
      input.status,
      input.recipientType,
      input.segmentId,
      input.recipientCount,
      input.sentCount,
      input.failedCount,
      input.openedCount,
      input.clickedCount,
      input.scheduledAt,
      actor.id,
      actor.id,
    ]
  );

  const campaign = mapCampaign(result.rows[0] as Record<string, unknown>);
  await insertActivity({
    activityType: "Campaign Created",
    title: `Campaign created: ${campaign.name}`,
    relatedType: "campaign",
    relatedId: Number(campaign.id),
    actor,
  });
  return campaign;
};

export const updateCampaign = async (
  id: number,
  payload: Record<string, unknown>,
  actor: AdminActor
) => {
  const existing = await getCampaignById(id);
  if (!existing) {
    throw new Error("Campaign not found.");
  }

  const input = await sanitizeCampaignPayload({
    ...existing,
    ...payload,
  });

  const result = await (await getAnalyticsPool()).query(
    `
      UPDATE crm_campaigns
      SET name = $2,
          subject = $3,
          body = $4,
          status = $5,
          recipient_type = $6,
          segment_id = $7,
          recipient_count = $8,
          sent_count = $9,
          failed_count = $10,
          opened_count = $11,
          clicked_count = $12,
          scheduled_at = $13,
          updated_by = $14,
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `,
    [
      id,
      input.name,
      input.subject,
      input.body,
      input.status,
      input.recipientType,
      input.segmentId,
      input.recipientCount,
      input.sentCount,
      input.failedCount,
      input.openedCount,
      input.clickedCount,
      input.scheduledAt,
      actor.id,
    ]
  );

  return mapCampaign(result.rows[0] as Record<string, unknown>);
};

export const deleteCampaign = async (id: number, actor: AdminActor) => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      UPDATE crm_campaigns
      SET deleted_at = NOW(), updated_by = $2, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `,
    [id, actor.id]
  );

  if (result.rowCount === 0) {
    throw new Error("Campaign not found.");
  }

  return { success: true };
};

export const previewCampaign = async (
  id: number,
  payload?: Record<string, unknown>
) => {
  const campaign = await getCampaignById(id);
  if (!campaign) {
    throw new Error("Campaign not found.");
  }

  const sampleRecipient = {
    firstName: toTrimmedString(payload?.firstName) || "Alex",
    lastName: toTrimmedString(payload?.lastName) || "Morgan",
    companyName: toTrimmedString(payload?.companyName) || "ITMart24 Partner",
    email: toTrimmedString(payload?.email) || "alex@example.com",
    website: toTrimmedString(payload?.website) || "https://example.com",
  };

  return {
    subject: applyCampaignVariables(String(campaign.subject ?? ""), sampleRecipient),
    body: applyCampaignVariables(String(campaign.body ?? ""), sampleRecipient),
    variables: sampleRecipient,
  };
};

export const sendTestCampaign = async (
  id: number,
  payload: Record<string, unknown>,
  actor: AdminActor
) => {
  const campaign = await getCampaignById(id);
  if (!campaign) {
    throw new Error("Campaign not found.");
  }

  const testEmail = toEmail(payload.email, "Test email");
  if (!testEmail) {
    throw new Error("A test email is required.");
  }

  const accountId = await getDefaultEmailAccountId();
  await sendEmailMessage(
    accountId,
    {
      to: testEmail,
      subject: applyCampaignVariables(String(campaign.subject ?? ""), {
        firstName: "Test",
        lastName: "Recipient",
        companyName: "ITMart24",
        email: testEmail,
        website: "https://itmart24.com",
      }),
      bodyText: applyCampaignVariables(String(campaign.body ?? ""), {
        firstName: "Test",
        lastName: "Recipient",
        companyName: "ITMart24",
        email: testEmail,
        website: "https://itmart24.com",
      }),
    },
    actor.id
  );

  return {
    success: true,
    message: "Test campaign sent successfully.",
  };
};

export const sendCampaign = async (id: number, actor: AdminActor) => {
  const campaign = await getCampaignById(id);
  if (!campaign) {
    throw new Error("Campaign not found.");
  }

  const recipients = await getSegmentRecipients({
    recipientType: String(campaign.recipientType ?? ""),
    segmentId:
      campaign.segmentId == null ? null : Number(campaign.segmentId),
  });

  if (recipients.length === 0) {
    throw new Error("No recipients matched this campaign.");
  }

  const accountId = await getDefaultEmailAccountId();
  let sentCount = 0;
  let failedCount = 0;

  for (const recipient of recipients.slice(0, 100)) {
    try {
      await sendEmailMessage(
        accountId,
        {
          to: recipient.email,
          subject: applyCampaignVariables(String(campaign.subject ?? ""), recipient),
          bodyText: applyCampaignVariables(String(campaign.body ?? ""), recipient),
        },
        actor.id
      );
      sentCount += 1;
    } catch (_error) {
      failedCount += 1;
    }
  }

  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      UPDATE crm_campaigns
      SET status = $2,
          recipient_count = $3,
          sent_count = $4,
          failed_count = $5,
          sent_at = NOW(),
          updated_by = $6,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [
      id,
      failedCount > 0 ? "Failed" : "Sent",
      recipients.length,
      sentCount,
      failedCount,
      actor.id,
    ]
  );

  const updated = mapCampaign(result.rows[0] as Record<string, unknown>);
  await insertActivity({
    activityType: "Campaign Sent",
    title: `Campaign sent: ${updated.name}`,
    description: `${sentCount} sent, ${failedCount} failed.`,
    relatedType: "campaign",
    relatedId: id,
    actor,
  });
  return updated;
};

export const listSegments = async (query: PaginationQuery) =>
  getListResult({
    table: "crm_segments",
    alias: "segment",
    searchableColumns: [
      "segment.name",
      "segment.description",
      "segment.entity_type",
    ],
    dateColumn: "segment.created_at",
    sortColumnMap: {
      createdAt: "segment.created_at",
    },
    query,
    mapRow: mapSegment,
  });

export const getSegmentById = async (id: number) =>
  getRecordById("crm_segments", id, mapSegment);

export const createSegment = async (payload: Record<string, unknown>, actor: AdminActor) => {
  const input = sanitizeSegmentPayload(payload);
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      INSERT INTO crm_segments (
        name, description, entity_type, conditions, match_type,
        segment_limit, sort_by, sort_direction, randomize,
        created_by, updated_by, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      RETURNING *
    `,
    [
      input.name,
      input.description,
      input.entityType,
      JSON.stringify(input.conditions),
      input.matchType,
      input.limit,
      input.sortBy,
      input.sortDirection,
      input.randomize,
      actor.id,
      actor.id,
    ]
  );

  const segment = mapSegment(result.rows[0] as Record<string, unknown>);
  await insertActivity({
    activityType: "Segment Created",
    title: `Segment created: ${segment.name}`,
    relatedType: "segment",
    relatedId: Number(segment.id),
    actor,
  });
  return segment;
};

export const updateSegment = async (
  id: number,
  payload: Record<string, unknown>,
  actor: AdminActor
) => {
  const existing = await getSegmentById(id);
  if (!existing) {
    throw new Error("Segment not found.");
  }

  const input = sanitizeSegmentPayload({
    ...existing,
    ...payload,
  });
  const result = await (await getAnalyticsPool()).query(
    `
      UPDATE crm_segments
      SET name = $2,
          description = $3,
          entity_type = $4,
          conditions = $5::jsonb,
          match_type = $6,
          segment_limit = $7,
          sort_by = $8,
          sort_direction = $9,
          randomize = $10,
          updated_by = $11,
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `,
    [
      id,
      input.name,
      input.description,
      input.entityType,
      JSON.stringify(input.conditions),
      input.matchType,
      input.limit,
      input.sortBy,
      input.sortDirection,
      input.randomize,
      actor.id,
    ]
  );
  return mapSegment(result.rows[0] as Record<string, unknown>);
};

export const deleteSegment = async (id: number, actor: AdminActor) => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      UPDATE crm_segments
      SET deleted_at = NOW(), updated_by = $2, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `,
    [id, actor.id]
  );

  if (result.rowCount === 0) {
    throw new Error("Segment not found.");
  }

  return { success: true };
};

export const previewSegment = async (id: number) => {
  const segment = await getSegmentById(id);
  if (!segment) {
    throw new Error("Segment not found.");
  }

  if (String(segment.entityType) === "leads") {
    return loadLeadSegmentPreview({
      conditions: normalizeJsonField<unknown[]>(segment.conditions, []),
      matchType: String(segment.matchType ?? "all"),
      limit: toNumberOrNull(segment.limit),
      sortBy: toOptionalString(segment.sortBy),
      sortDirection:
        (toOptionalString(segment.sortDirection)?.toLowerCase() === "asc" ? "asc" : "desc") as SegmentSortDirection,
      randomize: Boolean(segment.randomize),
    });
  }

  const recipients = await getSegmentRecipients({
    recipientType: "segments",
    segmentId: Number(segment.id),
  });

  return {
    count: recipients.length,
    items: recipients.slice(0, 20),
    emailTypeDistribution: [],
    emailRiskDistribution: [],
    countryDistribution: [],
    campaignReadinessSummary: {
      campaignReadyCount: 0,
      agencyOutreachReadyCount: 0,
      sendableCount: 0,
      blockedLeadCount: 0,
      missingEmailCount: 0,
      invalidEmailCount: 0,
      unsubscribedCount: 0,
      bouncedCount: 0,
      spamComplaintCount: 0,
      doNotContactCount: 0,
      freeMailboxCount: 0,
      supportEmailCount: 0,
    },
    appliedLimit: null,
    sortBy: null,
    sortDirection: "desc",
    randomize: false,
  };
};

export const previewSegmentDefinition = async (payload: Record<string, unknown>) => {
  const input = sanitizeSegmentPayload({
    ...payload,
    name: toTrimmedString(payload.name) || "Preview Segment",
  });
  if (input.entityType === "leads") {
    return loadLeadSegmentPreview({
      conditions: input.conditions,
      matchType: input.matchType,
      limit: input.limit,
      sortBy: input.sortBy,
      sortDirection: input.sortDirection,
      randomize: input.randomize,
    });
  }

  const resolved = resolveSegmentWhere(input.conditions, input.matchType, "entity", input.entityType);
  const tableByEntityType: Record<string, string> = {
    leads: "crm_leads",
    contacts: "crm_contacts",
    companies: "crm_companies",
    deals: "crm_deals",
  };
  const table = tableByEntityType[input.entityType];
  if (!table) {
    throw new Error("Unsupported segment entity type.");
  }

  const result = await (await getAnalyticsPool()).query(
    `
      SELECT *
      FROM ${table} entity
      WHERE entity.deleted_at IS NULL
        AND ${resolved.sql}
      ORDER BY entity.updated_at DESC, entity.id DESC
      LIMIT 20
    `,
    resolved.values
  );

  return {
    count: result.rowCount,
    items: result.rows as Array<Record<string, unknown>>,
    emailTypeDistribution: [],
    emailRiskDistribution: [],
    countryDistribution: [],
    campaignReadinessSummary: {
      campaignReadyCount: 0,
      agencyOutreachReadyCount: 0,
      sendableCount: 0,
      blockedLeadCount: 0,
      missingEmailCount: 0,
      invalidEmailCount: 0,
      unsubscribedCount: 0,
      bouncedCount: 0,
      spamComplaintCount: 0,
      doNotContactCount: 0,
      freeMailboxCount: 0,
      supportEmailCount: 0,
    },
    appliedLimit: input.limit ?? null,
    sortBy: input.sortBy ?? null,
    sortDirection: input.sortDirection,
    randomize: input.randomize,
  };
};

export const getCRMSettings = async () => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      SELECT setting_key, setting_value
      FROM crm_settings
      ORDER BY setting_key ASC
    `
  );

  const storedSettings = (result.rows as Array<Record<string, unknown>>).reduce(
    (accumulator, row) => {
      accumulator[String(row.setting_key ?? "")] = row.setting_value;
      return accumulator;
    },
    {} as Record<string, unknown>
  );

  return {
    ...CRM_DEFAULTS,
    ...storedSettings,
    leadSources: ensureRequiredLeadSources(storedSettings.leadSources),
  };
};

export const updateCRMSettings = async (
  payload: Record<string, unknown>,
  actor: AdminActor
) => {
  const nextSettings: Record<string, unknown> = {
    leadStatuses: Array.isArray(payload.leadStatuses)
      ? payload.leadStatuses
      : CRM_DEFAULTS.leadStatuses,
    leadSources: ensureRequiredLeadSources(payload.leadSources),
    dealStages: Array.isArray(payload.dealStages)
      ? payload.dealStages
      : CRM_DEFAULTS.dealStages,
    taskTypes: Array.isArray(payload.taskTypes)
      ? payload.taskTypes
      : CRM_DEFAULTS.taskTypes,
    contactTypes: Array.isArray(payload.contactTypes)
      ? payload.contactTypes
      : CRM_DEFAULTS.contactTypes,
    defaultCurrency:
      toTrimmedString(payload.defaultCurrency) || CRM_DEFAULTS.defaultCurrency,
    assignmentRules:
      payload.assignmentRules && typeof payload.assignmentRules === "object"
        ? payload.assignmentRules
        : {},
    emailCampaignDefaults:
      payload.emailCampaignDefaults && typeof payload.emailCampaignDefaults === "object"
        ? payload.emailCampaignDefaults
        : {},
    permissions:
      payload.permissions && typeof payload.permissions === "object"
        ? payload.permissions
        : {
            view: true,
            create: true,
            update: true,
            delete: true,
            reports: true,
            settings: true,
            campaigns: true,
          },
  };

  const pool = await getAnalyticsPool();
  for (const [key, value] of Object.entries(nextSettings)) {
    await pool.query(
      `
        INSERT INTO crm_settings (setting_key, setting_value, created_at, updated_at)
        VALUES ($1, $2::jsonb, NOW(), NOW())
        ON CONFLICT (setting_key)
        DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
      `,
      [key, JSON.stringify(value)]
    );
  }

  await insertActivity({
    activityType: "Note Added",
    title: "CRM settings updated",
    description: `Settings updated by ${actor.name}`,
    actor,
  });

  return getCRMSettings();
};

export const getCRMDashboard = async () => {
  return withSchemaRecovery(async () => {
    const pool = await getAnalyticsPool();
    const [
      leadCounts,
      dealCounts,
      taskCounts,
      campaignCounts,
      sourceCounts,
      stageCounts,
      growth,
      forecast,
      recentActivity,
      todaysFollowUps,
    ] = await Promise.all([
      pool.query(
        `
          SELECT
            COUNT(*) FILTER (WHERE deleted_at IS NULL) AS total_leads,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND lead_status = 'New') AS new_leads,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND lead_status = 'Qualified') AS qualified_leads,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND lead_status = 'Converted') AS converted_leads
          FROM crm_leads
        `
      ),
      pool.query(
        `
          SELECT
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND stage NOT IN ('Won', 'Lost')) AS active_deals,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND stage = 'Won') AS won_deals,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND stage = 'Lost') AS lost_deals,
            COALESCE(SUM(value) FILTER (WHERE deleted_at IS NULL AND stage NOT IN ('Won', 'Lost')), 0) AS forecast_value
          FROM crm_deals
        `
      ),
      pool.query(
        `
          SELECT
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND status <> 'Completed' AND due_at::date = CURRENT_DATE) AS todays_followups,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND status <> 'Completed' AND due_at < NOW()) AS overdue_tasks,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'Completed') AS completed_tasks,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND status <> 'Completed') AS pending_tasks
          FROM crm_tasks
        `
      ),
      pool.query(
        `
          SELECT
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND status IN ('Sent', 'Completed')) AS sent_campaigns
          FROM crm_campaigns
        `
      ),
      pool.query(
        `
          SELECT lead_source AS label, COUNT(*)::int AS value
          FROM crm_leads
          WHERE deleted_at IS NULL
          GROUP BY lead_source
          ORDER BY value DESC, label ASC
        `
      ),
      pool.query(
        `
          SELECT stage AS label, COUNT(*)::int AS value, COALESCE(SUM(value), 0) AS amount
          FROM crm_deals
          WHERE deleted_at IS NULL
          GROUP BY stage
          ORDER BY value DESC, label ASC
        `
      ),
      pool.query(
        `
          SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') AS label,
                 COUNT(*)::int AS count
          FROM crm_leads
          WHERE deleted_at IS NULL
            AND created_at >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
          GROUP BY DATE_TRUNC('month', created_at)
          ORDER BY DATE_TRUNC('month', created_at) ASC
        `
      ),
      pool.query(
        `
          SELECT TO_CHAR(DATE_TRUNC('month', COALESCE(expected_close_date, created_at)), 'Mon YYYY') AS label,
                 COALESCE(SUM(value), 0) AS amount
          FROM crm_deals
          WHERE deleted_at IS NULL
            AND stage NOT IN ('Won', 'Lost')
            AND COALESCE(expected_close_date, created_at) >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
          GROUP BY DATE_TRUNC('month', COALESCE(expected_close_date, created_at))
          ORDER BY DATE_TRUNC('month', COALESCE(expected_close_date, created_at)) ASC
        `
      ),
      pool.query(
        `
          SELECT *
          FROM crm_activities
          ORDER BY created_at DESC, id DESC
          LIMIT 10
        `
      ),
      pool.query(
        `
          SELECT *
          FROM crm_tasks
          WHERE deleted_at IS NULL
            AND status <> 'Completed'
            AND due_at::date = CURRENT_DATE
          ORDER BY due_at ASC, id ASC
          LIMIT 10
        `
      ),
    ]);

    const leadRow = leadCounts.rows[0] as Record<string, unknown>;
    const dealRow = dealCounts.rows[0] as Record<string, unknown>;
    const taskRow = taskCounts.rows[0] as Record<string, unknown>;
    const campaignRow = campaignCounts.rows[0] as Record<string, unknown>;

    const totalLeads = Number(leadRow.total_leads ?? 0);
    const convertedLeads = Number(leadRow.converted_leads ?? 0);

    return {
      summary: {
        totalLeads,
        newLeads: Number(leadRow.new_leads ?? 0),
        qualifiedLeads: Number(leadRow.qualified_leads ?? 0),
        activeDeals: Number(dealRow.active_deals ?? 0),
        wonDeals: Number(dealRow.won_deals ?? 0),
        lostDeals: Number(dealRow.lost_deals ?? 0),
        pendingFollowUps: Number(taskRow.todays_followups ?? 0),
        overdueTasks: Number(taskRow.overdue_tasks ?? 0),
        emailCampaignsSent: Number(campaignRow.sent_campaigns ?? 0),
        conversionRate: totalLeads > 0 ? Number(((convertedLeads / totalLeads) * 100).toFixed(2)) : 0,
      },
      leadsBySource: sourceCounts.rows.map((row: Record<string, unknown>) => ({
        label: String(row.label ?? "Unknown"),
        value: Number(row.value ?? 0),
      })),
      dealsByStage: stageCounts.rows.map((row: Record<string, unknown>) => ({
        label: String(row.label ?? "Unknown"),
        value: Number(row.value ?? 0),
        amount: Number(row.amount ?? 0),
      })),
      monthlyLeadGrowth: growth.rows.map((row: Record<string, unknown>) => ({
        label: String(row.label ?? ""),
        count: Number(row.count ?? 0),
      })),
      revenueForecast: forecast.rows.map((row: Record<string, unknown>) => ({
        label: String(row.label ?? ""),
        amount: Number(row.amount ?? 0),
      })),
      taskCompletionOverview: {
        completed: Number(taskRow.completed_tasks ?? 0),
        pending: Number(taskRow.pending_tasks ?? 0),
      },
      recentActivity: (recentActivity.rows as Array<Record<string, unknown>>).map(mapActivity),
      todaysFollowUps: (todaysFollowUps.rows as Array<Record<string, unknown>>).map(mapTask),
      quickActions: [
        { key: "lead", label: "Add Lead" },
        { key: "contact", label: "Add Contact" },
        { key: "company", label: "Add Company" },
        { key: "deal", label: "Add Deal" },
        { key: "task", label: "Create Task" },
        { key: "campaign", label: "Create Email Campaign" },
      ],
    };
  });
};

export const getCRMReports = async (query: {
  dateFrom?: unknown;
  dateTo?: unknown;
}) => {
  const dateFrom = toTrimmedString(query.dateFrom);
  const dateTo = toTrimmedString(query.dateTo);
  const values: unknown[] = [];
  const dateClauseParts: string[] = [];

  if (dateFrom) {
    values.push(dateFrom);
    dateClauseParts.push(`created_at::date >= $${values.length}`);
  }

  if (dateTo) {
    values.push(dateTo);
    dateClauseParts.push(`created_at::date <= $${values.length}`);
  }

  const dateSql =
    dateClauseParts.length > 0 ? ` AND ${dateClauseParts.join(" AND ")}` : "";

  const pool = await getAnalyticsPool();
  const [leadFunnel, leadSource, pipeline, conversion, taskProductivity, ownerPerformance, campaignReport] =
    await Promise.all([
      pool.query(
        `
          SELECT lead_status AS label, COUNT(*)::int AS value
          FROM crm_leads
          WHERE deleted_at IS NULL ${dateSql}
          GROUP BY lead_status
          ORDER BY value DESC
        `,
        values
      ),
      pool.query(
        `
          SELECT lead_source AS label, COUNT(*)::int AS value
          FROM crm_leads
          WHERE deleted_at IS NULL ${dateSql}
          GROUP BY lead_source
          ORDER BY value DESC
        `,
        values
      ),
      pool.query(
        `
          SELECT stage AS label, COUNT(*)::int AS value, COALESCE(SUM(value), 0) AS amount
          FROM crm_deals
          WHERE deleted_at IS NULL ${dateSql}
          GROUP BY stage
          ORDER BY value DESC
        `,
        values
      ),
      pool.query(
        `
          SELECT
            COUNT(*) FILTER (WHERE deleted_at IS NULL) AS total_leads,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND lead_status = 'Converted') AS converted_leads
          FROM crm_leads
          WHERE 1 = 1 ${dateSql}
        `,
        values
      ),
      pool.query(
        `
          SELECT status AS label, COUNT(*)::int AS value
          FROM crm_tasks
          WHERE deleted_at IS NULL ${dateSql}
          GROUP BY status
          ORDER BY value DESC
        `,
        values
      ),
      pool.query(
        `
          SELECT COALESCE(admins.name, 'Unassigned') AS owner,
                 COUNT(DISTINCT leads.id)::int AS leads_assigned,
                 COUNT(DISTINCT deals.id) FILTER (WHERE deals.stage = 'Won')::int AS deals_won,
                 COUNT(DISTINCT tasks.id) FILTER (WHERE tasks.status = 'Completed')::int AS followups_completed
          FROM admins
          LEFT JOIN crm_leads leads ON leads.assigned_to = admins.id AND leads.deleted_at IS NULL
          LEFT JOIN crm_deals deals ON deals.owner = admins.id AND deals.deleted_at IS NULL
          LEFT JOIN crm_tasks tasks ON tasks.assigned_to = admins.id AND tasks.deleted_at IS NULL
          GROUP BY admins.name
          ORDER BY owner ASC
        `
      ),
      pool.query(
        `
          SELECT name, status, recipient_count, sent_count, failed_count, opened_count, clicked_count, sent_at
          FROM crm_campaigns
          WHERE deleted_at IS NULL ${dateSql}
          ORDER BY created_at DESC
        `,
        values
      ),
    ]);

  const conversionRow = conversion.rows[0] as Record<string, unknown>;
  const totalLeads = Number(conversionRow.total_leads ?? 0);
  const convertedLeads = Number(conversionRow.converted_leads ?? 0);

  return {
    leadFunnel: leadFunnel.rows.map((row: Record<string, unknown>) => ({
      label: String(row.label ?? ""),
      value: Number(row.value ?? 0),
    })),
    leadSource: leadSource.rows.map((row: Record<string, unknown>) => ({
      label: String(row.label ?? ""),
      value: Number(row.value ?? 0),
    })),
    salesPipeline: pipeline.rows.map((row: Record<string, unknown>) => ({
      label: String(row.label ?? ""),
      value: Number(row.value ?? 0),
      amount: Number(row.amount ?? 0),
    })),
    conversion: {
      totalLeads,
      convertedLeads,
      rate: totalLeads > 0 ? Number(((convertedLeads / totalLeads) * 100).toFixed(2)) : 0,
    },
    taskProductivity: taskProductivity.rows.map((row: Record<string, unknown>) => ({
      label: String(row.label ?? ""),
      value: Number(row.value ?? 0),
    })),
    ownerPerformance: ownerPerformance.rows.map((row: Record<string, unknown>) => ({
      owner: String(row.owner ?? "Unassigned"),
      leadsAssigned: Number(row.leads_assigned ?? 0),
      dealsWon: Number(row.deals_won ?? 0),
      followupsCompleted: Number(row.followups_completed ?? 0),
    })),
    campaignReport: campaignReport.rows.map((row: Record<string, unknown>) => camelizeRow(row)),
  };
};
