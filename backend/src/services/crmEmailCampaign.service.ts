import { ensureTables, getAnalyticsPool } from "./analyticsPostgres.service";
import { listEmailAccounts, sendEmailMessage } from "./adminEmail.service";
import {
  canSendEmailToLead,
  computeLeadCampaignSafetyState,
  evaluateLeadSegmentAudience,
} from "./crm.service";
import {
  applyRecipientEvent,
  buildTrackedCampaignContent,
  getCampaignAudiencePreview,
  getCampaignTrackingOverview,
  listCampaignClicks,
  listCampaignEvents,
  markCampaignRecipientAction,
} from "./crmEmailTracking.service";

type JsonRecord = Record<string, unknown>;

type AdminActor = {
  id: number;
  name: string;
  email: string;
};

type PaginationQuery = {
  page?: unknown;
  limit?: unknown;
  q?: unknown;
  status?: unknown;
  leadType?: unknown;
  priority?: unknown;
  owner?: unknown;
  tags?: unknown;
  companyName?: unknown;
  campaignId?: unknown;
};

type CampaignPayload = {
  name?: unknown;
  senderAccountId?: unknown;
  subject?: unknown;
  body?: unknown;
  bodyMode?: unknown;
  delaySeconds?: unknown;
  recipientLeadIds?: unknown;
  recipientSelections?: unknown;
  trackOpens?: unknown;
  trackClicks?: unknown;
  unsubscribeRequired?: unknown;
  replyTo?: unknown;
  fromName?: unknown;
  segmentId?: unknown;
  audienceSource?: unknown;
};

type RecipientSelection = {
  leadId: number;
  email: string;
};

type SegmentAudiencePreview = {
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

type CampaignRecord = {
  id: number;
  name: string;
  segmentName?: string | null;
  senderAccountId: number | null;
  senderEmail: string | null;
  subject: string;
  body: string;
  bodyMode: "html" | "text";
  bodyHtml?: string | null;
  bodyText?: string | null;
  status: string;
  recipientType: string;
  segmentId: number | null;
  delaySeconds: number;
  delayMinSeconds?: number;
  delayMaxSeconds?: number;
  trackOpens?: boolean;
  trackClicks?: boolean;
  unsubscribeRequired?: boolean;
  fromName?: string | null;
  replyTo?: string | null;
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
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string;
  updatedAt: string;
};

type CampaignRecipientRecord = {
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

type LeadRecipientCandidate = {
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
  unsubscribed?: boolean;
  bounced?: boolean;
  bounceType?: string | null;
  spamComplaint?: boolean;
  doNotContact?: boolean;
  emailConsentStatus?: string;
  emailDomain?: string | null;
  emailType?: string | null;
  emailRiskLevel?: string;
  hasValidEmail?: boolean;
  campaignReady?: boolean;
};

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CAMPAIGN_STATUSES = ["Draft", "Sending", "Completed", "Failed", "Cancelled"] as const;
const RECIPIENT_STATUSES = ["pending", "sending", "sent", "failed", "skipped", "cancelled"] as const;
const CAMPAIGN_BODY_MODES = ["html", "text"] as const;
const MIN_DELAY_SECONDS = 5;
const MAX_DELAY_SECONDS = 300;
const activeCampaignProcessors = new Set<number>();

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
const toNumberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const toPositiveInteger = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.round(parsed);
};
const readErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;
const isValidEmail = (value: string | null | undefined) =>
  Boolean(value && EMAIL_REGEX.test(String(value).trim().toLowerCase()));
const toBoolean = (value: unknown, fallback = false) => {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return ["true", "1", "yes", "y", "on"].includes(normalized);
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

const mapCampaign = (row: Record<string, unknown>): CampaignRecord => {
  const mapped = camelizeRow(row);

  return {
    ...(mapped as CampaignRecord),
    id: Number(mapped.id ?? 0),
    senderAccountId:
      mapped.senderAccountId == null ? null : Number(mapped.senderAccountId),
    segmentId: mapped.segmentId == null ? null : Number(mapped.segmentId),
    delaySeconds: Number(mapped.delaySeconds ?? 0),
    delayMinSeconds: Number(mapped.delayMinSeconds ?? mapped.delaySeconds ?? 45),
    delayMaxSeconds: Number(mapped.delayMaxSeconds ?? mapped.delaySeconds ?? 90),
    trackOpens: Boolean(mapped.trackOpens ?? true),
    trackClicks: Boolean(mapped.trackClicks ?? true),
    unsubscribeRequired: Boolean(mapped.unsubscribeRequired ?? true),
    totalRecipients: Number(mapped.totalRecipients ?? 0),
    recipientCount: Number(mapped.recipientCount ?? 0),
    sentCount: Number(mapped.sentCount ?? 0),
    failedCount: Number(mapped.failedCount ?? 0),
    skippedCount: Number(mapped.skippedCount ?? 0),
    openedCount: Number(mapped.openedCount ?? 0),
    clickedCount: Number(mapped.clickedCount ?? 0),
    createdBy: mapped.createdBy == null ? null : Number(mapped.createdBy),
    updatedBy: mapped.updatedBy == null ? null : Number(mapped.updatedBy),
  };
};

const mapCampaignRecipient = (row: Record<string, unknown>): CampaignRecipientRecord =>
  ({
    ...(camelizeRow(row) as CampaignRecipientRecord),
    id: Number(row.id ?? 0),
    campaignId: Number(row.campaign_id ?? 0),
    leadId: row.lead_id == null ? null : Number(row.lead_id),
    recipientKey: `${Number(row.lead_id ?? 0)}::${String(row.email ?? "").toLowerCase()}`,
    openCount: Number(row.open_count ?? 0),
    clickCount: Number(row.click_count ?? 0),
  });

const mapLeadRecipient = (row: Record<string, unknown>): LeadRecipientCandidate => {
  const mapped = camelizeRow(row);
  const emails = normalizeJsonField<string[]>(mapped.emails, []);
  const phones = normalizeJsonField<string[]>(mapped.phones, []);
  const primaryEmail = String(mapped.email ?? emails[0] ?? "");
  const primaryPhone = mapped.phone ? String(mapped.phone) : phones[0] ?? null;
  const safety = computeLeadCampaignSafetyState({
    ...mapped,
    tags: normalizeJsonField<string[]>(mapped.tags, []),
    unsubscribed: Boolean(mapped.unsubscribed),
    bounced: Boolean(mapped.bounced),
    spamComplaint: Boolean(mapped.spamComplaint),
    doNotContact: Boolean(mapped.doNotContact),
    emailConsentStatus: mapped.emailConsentStatus,
  });
  return {
    ...(mapped as LeadRecipientCandidate),
    recipientKey: `${Number(mapped.id ?? 0)}::${primaryEmail.toLowerCase()}`,
    email: primaryEmail,
    phone: primaryPhone,
    emails,
    phones,
    address: mapped.address ? String(mapped.address) : null,
    tags: normalizeJsonField<string[]>(mapped.tags, []),
    notes: normalizeJsonField<Array<Record<string, unknown>>>(mapped.notes, []),
    unsubscribed: Boolean(mapped.unsubscribed),
    bounced: Boolean(mapped.bounced),
    bounceType: mapped.bounceType ? String(mapped.bounceType) : null,
    spamComplaint: Boolean(mapped.spamComplaint),
    doNotContact: Boolean(mapped.doNotContact),
    emailConsentStatus: safety.emailConsentStatus,
    emailDomain: safety.emailDomain,
    emailType: safety.emailType,
    emailRiskLevel: safety.emailRiskLevel,
    hasValidEmail: safety.hasValidEmail,
    campaignReady: safety.campaignReady,
  };
};

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

const assertAllowed = (value: string | null, allowed: readonly string[], fieldName: string) => {
  if (!value) {
    return null;
  }
  if (!allowed.includes(value)) {
    throw new Error(`${fieldName} is invalid.`);
  }
  return value;
};

const stripHtmlToText = (value: string) =>
  value
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const delayMs = (seconds: number) => Math.max(MIN_DELAY_SECONDS, Math.min(MAX_DELAY_SECONDS, seconds)) * 1000;

const renderTemplate = (
  template: string,
  recipient: {
    firstName?: string | null;
    lastName?: string | null;
    address?: string | null;
    companyName?: string | null;
    jobTitle?: string | null;
    website?: string | null;
    email?: string | null;
  }
) =>
  [
    ["{{firstName}}", recipient.firstName || ""],
    ["{{lastName}}", recipient.lastName || ""],
    ["{{address}}", recipient.address || ""],
    ["{{companyName}}", recipient.companyName || ""],
    ["{{jobTitle}}", recipient.jobTitle || ""],
    ["{{website}}", recipient.website || ""],
    ["{{email}}", recipient.email || ""],
  ].reduce((content, [token, replacement]) => content.split(token).join(replacement), template);

const buildPagination = (query: PaginationQuery) => {
  const page = toPositiveInteger(query.page, 1);
  const limit = Math.min(MAX_PAGE_SIZE, toPositiveInteger(query.limit, DEFAULT_PAGE_SIZE));
  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
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

const loadCampaignById = async (id: number) => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      SELECT campaign.*, segment.name AS segment_name
      FROM crm_campaigns campaign
      LEFT JOIN crm_segments segment ON segment.id = campaign.segment_id
      WHERE campaign.id = $1 AND campaign.deleted_at IS NULL
      LIMIT 1
    `,
    [id]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapCampaign(result.rows[0] as Record<string, unknown>);
};

const loadCampaignRecipientById = async (campaignId: number, recipientId: number) => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      SELECT *
      FROM crm_campaign_recipients
      WHERE campaign_id = $1 AND id = $2
      LIMIT 1
    `,
    [campaignId, recipientId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapCampaignRecipient(result.rows[0] as Record<string, unknown>);
};

const loadSenderAccount = async (senderAccountId: number) => {
  const accounts = await listEmailAccounts();
  const account = accounts.find(
    (entry: { id: number; isActive: boolean }) =>
      entry.id === senderAccountId && entry.isActive
  );
  if (!account) {
    throw new Error("Selected sender account is unavailable or inactive.");
  }
  return account;
};

const sanitizeLeadIds = (value: unknown) => {
  if (!Array.isArray(value)) {
    throw new Error("At least one recipient is required.");
  }

  const ids = Array.from(
    new Set(
      value
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry) && entry > 0)
        .map((entry) => Math.round(entry))
    )
  );

  if (ids.length === 0) {
    throw new Error("At least one recipient is required.");
  }

  return ids;
};

const sanitizeRecipientSelections = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as RecipientSelection[];
  }

  const seen = new Set<string>();
  const selections: RecipientSelection[] = [];

  value.forEach((entry) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    const leadId = Number(record.leadId);
    const email = toTrimmedString(record.email).toLowerCase();
    if (!Number.isFinite(leadId) || leadId <= 0 || !isValidEmail(email)) {
      return;
    }
    const recipientKey = `${Math.round(leadId)}::${email}`;
    if (seen.has(recipientKey)) {
      return;
    }
    seen.add(recipientKey);
    selections.push({
      leadId: Math.round(leadId),
      email,
    });
  });

  return selections;
};

const sanitizeCampaignPayload = async (payload: CampaignPayload) => {
  const name = toTrimmedString(payload.name);
  const subject = toTrimmedString(payload.subject);
  const body = String(payload.body ?? "").trim();
  const bodyMode =
    assertAllowed(toTrimmedString(payload.bodyMode) || "html", CAMPAIGN_BODY_MODES, "bodyMode") ?? "html";
  const senderAccountId = toNumberOrNull(payload.senderAccountId);
  const delaySecondsRaw = Number(payload.delaySeconds);
  const delaySeconds = Number.isFinite(delaySecondsRaw)
    ? Math.max(MIN_DELAY_SECONDS, Math.min(MAX_DELAY_SECONDS, Math.round(delaySecondsRaw)))
    : 10;
  const recipientSelections = sanitizeRecipientSelections(payload.recipientSelections);

  if (!name) {
    throw new Error("Campaign name is required.");
  }
  if (!senderAccountId) {
    throw new Error("Sender account is required.");
  }
  if (!subject) {
    throw new Error("Subject is required.");
  }
  if (!body) {
    throw new Error("Email body is required.");
  }
  if (delaySeconds < MIN_DELAY_SECONDS || delaySeconds > MAX_DELAY_SECONDS) {
    throw new Error(`Delay must be between ${MIN_DELAY_SECONDS} and ${MAX_DELAY_SECONDS} seconds.`);
  }

  const senderAccount = await loadSenderAccount(senderAccountId);
  const segmentId = toNumberOrNull(payload.segmentId);
  const audienceSourceRaw = toTrimmedString(payload.audienceSource).toLowerCase();
  const audienceSource = audienceSourceRaw === "saved_segment" || audienceSourceRaw === "segment" ? "segment" : "manual";
  if (audienceSource === "segment" && !segmentId) {
    throw new Error("Saved segment is required.");
  }
  const recipientLeadIds =
    audienceSource === "segment"
      ? []
      : recipientSelections.length > 0
        ? Array.from(new Set(recipientSelections.map((selection) => selection.leadId)))
        : sanitizeLeadIds(payload.recipientLeadIds);

  return {
    name,
    senderAccountId,
    senderEmail: senderAccount.emailAddress,
    subject,
    body,
    bodyMode,
    delaySeconds,
    recipientLeadIds,
    recipientSelections,
    trackOpens: toBoolean(payload.trackOpens, true),
    trackClicks: toBoolean(payload.trackClicks, true),
    unsubscribeRequired: toBoolean(payload.unsubscribeRequired, true),
    replyTo: toOptionalString(payload.replyTo),
    fromName: toOptionalString(payload.fromName) ?? senderAccount.displayName ?? null,
    segmentId,
    audienceSource,
  };
};

const getBlockedReason = (lead: LeadRecipientCandidate | undefined, email: string) => {
  if (!lead) {
    return "Lead record is unavailable.";
  }
  if (!isValidEmail(email)) {
    return "Recipient email is missing or invalid.";
  }
  if (lead.unsubscribed || lead.emailConsentStatus === "unsubscribed") {
    return "Lead has unsubscribed from email.";
  }
  if (lead.doNotContact || lead.emailConsentStatus === "do_not_contact") {
    return "Lead is marked as do not contact.";
  }
  if (lead.spamComplaint) {
    return "Lead is blocked because of a spam complaint.";
  }
  if (lead.bounced) {
    return `Lead is blocked because of a ${lead.bounceType || "previous"} bounce.`;
  }
  if (!lead.hasValidEmail) {
    return "Lead does not have a valid campaign email.";
  }
  if (lead.emailRiskLevel === "blocked") {
    return "Lead is blocked by email risk rules.";
  }
  if (!lead.campaignReady) {
    return "Lead is not campaign ready yet.";
  }
  return "Lead is blocked by campaign safety rules.";
};

const mapSegmentLeadToRecipient = (row: Record<string, unknown>): LeadRecipientCandidate => {
  const mapped = camelizeRow(row);
  const emails = normalizeJsonField<string[]>(mapped.emails, []);
  const phones = normalizeJsonField<string[]>(mapped.phones, []);
  return {
    id: Number(mapped.id ?? 0),
    recipientKey: `${Number(mapped.id ?? 0)}::${String(mapped.email ?? "").trim().toLowerCase()}`,
    firstName: mapped.firstName ? String(mapped.firstName) : null,
    lastName: mapped.lastName ? String(mapped.lastName) : null,
    email: String(mapped.email ?? "").trim().toLowerCase(),
    phone: mapped.phone ? String(mapped.phone) : phones[0] ?? null,
    emails,
    phones,
    address: mapped.address ? String(mapped.address) : null,
    companyName: mapped.companyName ? String(mapped.companyName) : null,
    jobTitle: mapped.jobTitle ? String(mapped.jobTitle) : null,
    website: mapped.website ? String(mapped.website) : null,
    leadType: mapped.leadType ? String(mapped.leadType) : null,
    leadStatus: mapped.leadStatus ? String(mapped.leadStatus) : "Selected",
    leadPriority: mapped.leadPriority ? String(mapped.leadPriority) : "Medium",
    leadScore: Number(mapped.leadScore ?? 0),
    tags: normalizeJsonField<string[]>(mapped.tags, []),
    notes: normalizeJsonField<Array<Record<string, unknown>>>(mapped.notes, []),
    assignedTo: mapped.assignedTo == null ? null : Number(mapped.assignedTo),
    unsubscribed: Boolean(mapped.unsubscribed),
    bounced: Boolean(mapped.bounced),
    bounceType: mapped.bounceType ? String(mapped.bounceType) : null,
    spamComplaint: Boolean(mapped.spamComplaint),
    doNotContact: Boolean(mapped.doNotContact),
    emailConsentStatus: mapped.emailConsentStatus ? String(mapped.emailConsentStatus) : "unknown",
    emailDomain: mapped.emailDomain ? String(mapped.emailDomain) : null,
    emailType: mapped.emailType ? String(mapped.emailType) : null,
    emailRiskLevel: mapped.emailRiskLevel ? String(mapped.emailRiskLevel) : "blocked",
    hasValidEmail: Boolean(mapped.hasValidEmail),
    campaignReady: Boolean(mapped.campaignReady),
  };
};

const buildSegmentAudiencePreview = async (segmentId: number): Promise<SegmentAudiencePreview> => {
  const evaluation = await evaluateLeadSegmentAudience(segmentId);
  const matchedLeads = evaluation.leads.map(mapSegmentLeadToRecipient);
  const recipients = matchedLeads
    .filter((lead) => canSendEmailToLead(lead))
    .map((lead) => ({
      leadId: lead.id,
      email: lead.email,
      companyName: lead.companyName ?? null,
      firstName: lead.firstName ?? null,
      lastName: lead.lastName ?? null,
      website: lead.website ?? null,
      emailType: lead.emailType ?? null,
      emailRiskLevel: lead.emailRiskLevel ?? "blocked",
      campaignReady: Boolean(lead.campaignReady),
    }));
  const blockedRecipients = matchedLeads
    .filter((lead) => !canSendEmailToLead(lead))
    .map((lead) => ({
      leadId: lead.id,
      email: lead.email || null,
      companyName: lead.companyName ?? null,
      firstName: lead.firstName ?? null,
      lastName: lead.lastName ?? null,
      reason: getBlockedReason(lead, lead.email),
    }));

  return {
    segment: evaluation.segment as Record<string, unknown>,
    summary: {
      matchedLeads: evaluation.preview.count,
      campaignReady: evaluation.preview.campaignReadinessSummary.campaignReadyCount,
      sendable: recipients.length,
      blocked: blockedRecipients.length,
      missingEmail: evaluation.preview.campaignReadinessSummary.missingEmailCount,
      invalidEmail: evaluation.preview.campaignReadinessSummary.invalidEmailCount,
      unsubscribed: evaluation.preview.campaignReadinessSummary.unsubscribedCount,
      bounced: evaluation.preview.campaignReadinessSummary.bouncedCount,
      spamComplaint: evaluation.preview.campaignReadinessSummary.spamComplaintCount,
      doNotContact: evaluation.preview.campaignReadinessSummary.doNotContactCount,
      appliedLimit: evaluation.preview.appliedLimit,
    },
    recipients,
    blockedRecipients,
  };
};

const loadLeadRecipientsByIds = async (leadIds: number[]) => {
  if (leadIds.length === 0) {
    return [] as LeadRecipientCandidate[];
  }

  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      SELECT
        id,
        first_name,
        last_name,
        email,
        phone,
        emails,
        phones,
        address,
        company_name,
        job_title,
        website,
        lead_type,
        lead_status,
        lead_priority,
        lead_score,
        tags,
        notes,
        assigned_to,
        unsubscribed,
        bounced,
        bounce_type,
        spam_complaint,
        do_not_contact,
        email_consent_status
      FROM crm_leads
      WHERE deleted_at IS NULL
        AND id = ANY($1::bigint[])
      ORDER BY updated_at DESC, id DESC
    `,
    [leadIds]
  );

  return (result.rows as Array<Record<string, unknown>>)
    .map(mapLeadRecipient);
};

const replaceCampaignRecipients = async (campaignId: number, leadIds: number[], recipientSelections?: RecipientSelection[]) => {
  const leads = await loadLeadRecipientsByIds(leadIds);
  const leadById = new Map<number, LeadRecipientCandidate>(
    leads.map((lead) => [lead.id, lead])
  );
  const selectedRecipients =
    recipientSelections && recipientSelections.length > 0
      ? recipientSelections
          .filter((selection) => isValidEmail(selection.email))
          .map((selection) => {
            const lead = leadById.get(selection.leadId);
            return {
              id: lead?.id ?? selection.leadId,
              recipientKey: `${selection.leadId}::${selection.email}`,
              firstName: lead?.firstName ?? null,
              lastName: lead?.lastName ?? null,
              email: selection.email,
              phone: lead?.phone ?? null,
              emails: lead ? lead.emails : [selection.email],
              phones: lead?.phones ?? [],
              address: lead?.address ?? null,
              companyName: lead?.companyName ?? null,
              jobTitle: lead?.jobTitle ?? null,
              website: lead?.website ?? null,
              leadType: lead?.leadType ?? null,
              leadStatus: lead?.leadStatus ?? "Selected",
              leadPriority: lead?.leadPriority ?? "Medium",
              leadScore: lead?.leadScore ?? 0,
              tags: lead?.tags ?? [],
              notes: lead?.notes ?? [],
              assignedTo: lead?.assignedTo ?? null,
            };
          })
      : leads.flatMap((lead) => {
          const emails = Array.from(
            new Set(
              (Array.isArray(lead.emails) && lead.emails.length > 0 ? lead.emails : [lead.email]).filter((email): email is string => isValidEmail(email))
            )
          );
          return emails.map((email) => ({
            ...lead,
            recipientKey: `${lead.id}::${email.toLowerCase()}`,
            email,
          }));
        });

  const recipientsWithSafety = selectedRecipients.map((recipient) => {
    const lead = leadById.get(recipient.id);
    const isSendable = Boolean(
      lead &&
        canSendEmailToLead({
          ...lead,
          email: recipient.email,
        })
    );
    return {
      ...recipient,
      lead,
      isSendable,
      blockedReason: isSendable ? null : getBlockedReason(lead, recipient.email),
    };
  });

  const sendableRecipients = recipientsWithSafety.filter((recipient) => recipient.isSendable);

  if (sendableRecipients.length === 0) {
    throw new Error("At least one selected lead must have a safe campaign-ready email address.");
  }

  const client = await (await getAnalyticsPool()).connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM crm_campaign_recipients WHERE campaign_id = $1", [campaignId]);

    for (const recipient of recipientsWithSafety) {
      await client.query(
        `
          INSERT INTO crm_campaign_recipients (
            campaign_id,
            lead_id,
            email,
            first_name,
            last_name,
            address,
            company_name,
            job_title,
            website,
            status,
            blocked_reason,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
        `,
        [
          campaignId,
          leadById.has(recipient.id) ? recipient.id : null,
          recipient.email,
          recipient.firstName,
          recipient.lastName,
          recipient.address,
          recipient.companyName,
          recipient.jobTitle,
          recipient.website,
          recipient.isSendable ? "pending" : "blocked",
          recipient.blockedReason,
        ]
      );
    }

    await client.query(
      `
        UPDATE crm_campaigns
        SET total_recipients = $2,
            recipient_count = $3,
            sent_count = 0,
            failed_count = 0,
            skipped_count = 0,
            last_error = NULL,
            last_activity_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `,
      [campaignId, recipientsWithSafety.length, sendableRecipients.length]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return recipientsWithSafety.length;
};

const replaceCampaignRecipientsFromSegmentAudience = async (
  campaignId: number,
  audiencePreview: SegmentAudiencePreview
) => {
  const client = await (await getAnalyticsPool()).connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM crm_campaign_recipients WHERE campaign_id = $1", [campaignId]);

    for (const recipient of audiencePreview.recipients) {
      await client.query(
        `
          INSERT INTO crm_campaign_recipients (
            campaign_id,
            lead_id,
            email,
            first_name,
            last_name,
            company_name,
            website,
            status,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW(), NOW())
        `,
        [
          campaignId,
          recipient.leadId,
          recipient.email,
          recipient.firstName,
          recipient.lastName,
          recipient.companyName,
          recipient.website,
        ]
      );
    }

    for (const recipient of audiencePreview.blockedRecipients) {
      await client.query(
        `
          INSERT INTO crm_campaign_recipients (
            campaign_id,
            lead_id,
            email,
            first_name,
            last_name,
            company_name,
            status,
            blocked_reason,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'blocked', $7, NOW(), NOW())
        `,
        [
          campaignId,
          recipient.leadId,
          recipient.email,
          recipient.firstName,
          recipient.lastName,
          recipient.companyName,
          recipient.reason,
        ]
      );
    }

    await client.query(
      `
        UPDATE crm_campaigns
        SET total_recipients = $2,
            recipient_count = $3,
            sent_count = 0,
            failed_count = 0,
            skipped_count = 0,
            last_error = NULL,
            last_activity_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `,
      [campaignId, audiencePreview.recipients.length + audiencePreview.blockedRecipients.length, audiencePreview.recipients.length]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const syncCampaignCounts = async (campaignId: number) => {
  const pool = await getAnalyticsPool();
  const summaryResult = await pool.query(
    `
      SELECT
        COUNT(*)::int AS total_recipients,
        COUNT(*) FILTER (WHERE status IN ('sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'complained', 'unsubscribed'))::int AS sent_count,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count,
        COUNT(*) FILTER (WHERE status IN ('skipped', 'blocked'))::int AS skipped_count,
        COUNT(*) FILTER (WHERE status NOT IN ('blocked'))::int AS recipient_count
      FROM crm_campaign_recipients
      WHERE campaign_id = $1
    `,
    [campaignId]
  );
  const summary = summaryResult.rows[0] as Record<string, unknown>;

  await pool.query(
    `
      UPDATE crm_campaigns
      SET total_recipients = $2,
          recipient_count = $3,
          sent_count = $4,
          failed_count = $5,
          skipped_count = $6,
          last_activity_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `,
    [
      campaignId,
      Number(summary.total_recipients ?? 0),
      Number(summary.recipient_count ?? 0),
      Number(summary.sent_count ?? 0),
      Number(summary.failed_count ?? 0),
      Number(summary.skipped_count ?? 0),
    ]
  );
};

const getRecipientSummary = async (campaignId: number) => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE status IN ('sending', 'queued'))::int AS sending,
        COUNT(*) FILTER (WHERE status IN ('sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'complained', 'unsubscribed'))::int AS sent,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
        COUNT(*) FILTER (WHERE status IN ('skipped', 'blocked'))::int AS skipped,
        COUNT(*) FILTER (WHERE status = 'blocked')::int AS blocked,
        COUNT(*) FILTER (WHERE first_opened_at IS NOT NULL OR status IN ('opened', 'clicked', 'replied'))::int AS opened,
        COUNT(*) FILTER (WHERE first_clicked_at IS NOT NULL OR status IN ('clicked', 'replied'))::int AS clicked,
        COUNT(*) FILTER (WHERE replied_at IS NOT NULL OR status = 'replied')::int AS replied,
        COUNT(*) FILTER (WHERE bounce_at IS NOT NULL OR status = 'bounced')::int AS bounced,
        COUNT(*) FILTER (WHERE unsubscribed_at IS NOT NULL OR status = 'unsubscribed')::int AS unsubscribed,
        COUNT(*) FILTER (WHERE complained_at IS NOT NULL OR status = 'complained')::int AS complained
      FROM crm_campaign_recipients
      WHERE campaign_id = $1
    `,
    [campaignId]
  );
  const row = result.rows[0] as Record<string, unknown>;
  return {
    total: Number(row.total ?? 0),
    pending: Number(row.pending ?? 0),
    sending: Number(row.sending ?? 0),
    sent: Number(row.sent ?? 0),
    failed: Number(row.failed ?? 0),
    skipped: Number(row.skipped ?? 0),
    blocked: Number(row.blocked ?? 0),
    opened: Number(row.opened ?? 0),
    clicked: Number(row.clicked ?? 0),
    replied: Number(row.replied ?? 0),
    bounced: Number(row.bounced ?? 0),
    unsubscribed: Number(row.unsubscribed ?? 0),
    complained: Number(row.complained ?? 0),
  };
};

const finalizeCampaignStatus = async (campaignId: number) => {
  const campaign = await loadCampaignById(campaignId);
  if (!campaign) {
    return;
  }

  const summary = await getRecipientSummary(campaignId);
  const nextStatus =
    campaign.status === "Cancelled"
      ? "Cancelled"
      : summary.sent > 0 || (summary.failed > 0 && summary.sent + summary.failed + summary.skipped === summary.total)
        ? summary.sent > 0
          ? "Completed"
          : "Failed"
        : "Failed";

  const pool = await getAnalyticsPool();
  await pool.query(
    `
      UPDATE crm_campaigns
      SET status = $2,
          sent_at = CASE WHEN $2 = 'Completed' THEN COALESCE(sent_at, NOW()) ELSE sent_at END,
          completed_at = CASE WHEN $2 IN ('Completed', 'Failed') THEN NOW() ELSE completed_at END,
          last_activity_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `,
    [campaignId, nextStatus]
  );
};

const processCampaignInBackground = async (campaignId: number, actor: AdminActor) => {
  if (activeCampaignProcessors.has(campaignId)) {
    return;
  }

  activeCampaignProcessors.add(campaignId);

  try {
    const campaign = await loadCampaignById(campaignId);
    if (!campaign) {
      return;
    }

    const senderAccountId = campaign.senderAccountId;
    if (!senderAccountId) {
      throw new Error("Campaign sender account is missing.");
    }

    const pagination = { page: 1, limit: 5000, offset: 0 };
    const pool = await getAnalyticsPool();
    const recipientsResult = await pool.query(
      `
        SELECT *
        FROM crm_campaign_recipients
        WHERE campaign_id = $1
          AND status IN ('pending', 'failed', 'sending')
        ORDER BY id ASC
        LIMIT $2 OFFSET $3
      `,
      [campaignId, pagination.limit, pagination.offset]
    );

    const recipients = (recipientsResult.rows as Array<Record<string, unknown>>).map(mapCampaignRecipient);
    const delay = delayMs(campaign.delaySeconds || 10);

    for (let index = 0; index < recipients.length; index += 1) {
      const freshCampaign = await loadCampaignById(campaignId);
      if (!freshCampaign || freshCampaign.status === "Cancelled") {
        break;
      }

      const recipient = await loadCampaignRecipientById(campaignId, recipients[index].id);
      if (
        !recipient ||
        !isValidEmail(recipient.email) ||
        ["sent", "delivered", "opened", "clicked", "replied", "unsubscribed", "complained"].includes(recipient.status)
      ) {
        continue;
      }
      if (recipient.status === "blocked") {
        continue;
      }

      let lead: LeadRecipientCandidate | undefined;
      if (recipient.leadId) {
        [lead] = await loadLeadRecipientsByIds([recipient.leadId]);
        if (!lead || !canSendEmailToLead({ ...lead, email: recipient.email })) {
          await applyRecipientEvent(
            {
              id: recipient.id,
              campaign_id: campaignId,
              lead_id: recipient.leadId,
              email: recipient.email,
              campaign_name: freshCampaign.name,
            },
            "blocked",
            "internal",
            {
              blockedReason: getBlockedReason(lead, recipient.email),
            }
          );
          continue;
        }
      }

      const trackedContent = await buildTrackedCampaignContent(
        {
          id: freshCampaign.id,
          name: freshCampaign.name,
          subject: freshCampaign.subject,
          body: freshCampaign.body,
          bodyHtml: freshCampaign.bodyHtml ?? (freshCampaign.bodyMode === "html" ? freshCampaign.body : null),
          bodyText: freshCampaign.bodyText ?? (freshCampaign.bodyMode === "text" ? freshCampaign.body : null),
          bodyMode: freshCampaign.bodyMode,
          trackOpens: freshCampaign.trackOpens,
          trackClicks: freshCampaign.trackClicks,
          unsubscribeRequired: freshCampaign.unsubscribeRequired,
        },
        {
          id: recipient.id,
          campaignId,
          leadId: recipient.leadId,
          email: recipient.email,
          firstName: recipient.firstName,
          lastName: recipient.lastName,
          contactName: [recipient.firstName, recipient.lastName].filter(Boolean).join(" ") || null,
          companyName: recipient.companyName,
          website: recipient.website,
          jobTitle: recipient.jobTitle,
          trackingToken: recipient.trackingToken,
        }
      );

      try {
        await pool.query(
          `
            UPDATE crm_campaign_recipients
            SET status = 'sending',
                personalized_subject = $3,
                personalized_body_html = $4,
                error_message = NULL,
                updated_at = NOW()
            WHERE campaign_id = $1 AND id = $2
          `,
          [campaignId, recipient.id, trackedContent.subject, trackedContent.bodyHtml ?? trackedContent.bodyText]
        );

        const sendResult = await sendEmailMessage(
          senderAccountId,
          {
            to: recipient.email,
            subject: trackedContent.subject,
            bodyText: trackedContent.bodyText,
            bodyHtml: trackedContent.bodyHtml ?? undefined,
          },
          actor.id
        );

        await pool.query(
          `
            UPDATE crm_campaign_recipients
            SET personalized_subject = $3,
                personalized_body_html = $4,
                tracking_token = COALESCE(tracking_token, $5),
                updated_at = NOW()
            WHERE campaign_id = $1 AND id = $2
          `,
          [campaignId, recipient.id, trackedContent.subject, trackedContent.bodyHtml ?? trackedContent.bodyText, trackedContent.trackingToken]
        );

        await applyRecipientEvent(
          {
            id: recipient.id,
            campaign_id: campaignId,
            lead_id: recipient.leadId,
            email: recipient.email,
            campaign_name: freshCampaign.name,
          },
          "sent",
          "smtp",
          {
            metadata: {
              messageId: sendResult.messageId ?? null,
              providerMessageId: sendResult.messageId ?? null,
            },
          }
        );

        await pool.query(
          `
            UPDATE crm_campaigns
            SET sent_count = sent_count + 1,
                last_error = NULL,
                last_activity_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
          `,
          [campaignId]
        );

      } catch (error) {
        const errorMessage = readErrorMessage(error, "Failed to send email.");
        await pool.query(
          `
            UPDATE crm_campaign_recipients
            SET status = 'failed',
                personalized_subject = $3,
                personalized_body_html = $4,
                error_message = $5,
                updated_at = NOW()
            WHERE campaign_id = $1 AND id = $2
          `,
          [
            campaignId,
            recipient.id,
            trackedContent.subject,
            trackedContent.bodyHtml ?? trackedContent.bodyText,
            errorMessage,
          ]
        );

        await applyRecipientEvent(
          {
            id: recipient.id,
            campaign_id: campaignId,
            lead_id: recipient.leadId,
            email: recipient.email,
            campaign_name: freshCampaign.name,
          },
          "failed",
          "smtp",
          {
            failureReason: errorMessage,
          }
        );

        await pool.query(
          `
            UPDATE crm_campaigns
            SET failed_count = failed_count + 1,
                last_error = $2,
                last_activity_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
          `,
          [campaignId, errorMessage]
        );
      }

      const latestCampaign = await loadCampaignById(campaignId);
      if (!latestCampaign || latestCampaign.status === "Cancelled") {
        break;
      }

      if (index < recipients.length - 1) {
        await sleep(delay);
      }
    }

    await syncCampaignCounts(campaignId);
    const latestCampaign = await loadCampaignById(campaignId);
    if (latestCampaign?.status !== "Cancelled") {
      await finalizeCampaignStatus(campaignId);
      const finalCampaign = await loadCampaignById(campaignId);
      if (finalCampaign) {
        await insertActivity({
          activityType: "Campaign Sent",
          title: `Campaign processed: ${finalCampaign.name}`,
          description: `Sent ${finalCampaign.sentCount}, failed ${finalCampaign.failedCount}, skipped ${finalCampaign.skippedCount}.`,
          relatedType: "campaign",
          relatedId: finalCampaign.id,
          actor,
        });
      }
    }
  } catch (error) {
    const pool = await getAnalyticsPool();
    await pool.query(
      `
        UPDATE crm_campaigns
        SET status = 'Failed',
            completed_at = NOW(),
            last_error = $2,
            last_activity_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `,
      [campaignId, readErrorMessage(error, "Campaign processing failed.")]
    );
  } finally {
    activeCampaignProcessors.delete(campaignId);
  }
};

export const listLeadEmailRecipients = async (query: PaginationQuery) =>
  withSchemaRecovery(async () => {
    const pagination = buildPagination(query);
    const q = toTrimmedString(query.q).toLowerCase();
    const status = toTrimmedString(query.status);
    const leadType = toTrimmedString(query.leadType);
    const priority = toTrimmedString(query.priority);
    const owner = toTrimmedString(query.owner);
    const tags = toTrimmedString(query.tags).toLowerCase();
    const companyName = toTrimmedString(query.companyName).toLowerCase();
    const values: unknown[] = [];
    const clauses = ["lead.deleted_at IS NULL"];

    if (status) {
      values.push(status);
      clauses.push(`lead.lead_status = $${values.length}`);
    }
    if (leadType) {
      values.push(leadType);
      clauses.push(`lead.lead_type = $${values.length}`);
    }
    if (priority) {
      values.push(priority);
      clauses.push(`lead.lead_priority = $${values.length}`);
    }
    if (owner) {
      values.push(owner);
      clauses.push(`lead.assigned_to::text = $${values.length}`);
    }
    if (tags) {
      values.push(`%${tags}%`);
      clauses.push(`lead.tags::text ILIKE $${values.length}`);
    }
    if (companyName) {
      values.push(`%${companyName}%`);
      clauses.push(`lead.company_name ILIKE $${values.length}`);
    }
    if (q) {
      values.push(`%${q}%`);
      const parameter = `$${values.length}`;
      clauses.push(`(
        lead.first_name ILIKE ${parameter}
        OR lead.last_name ILIKE ${parameter}
        OR lead.email ILIKE ${parameter}
        OR lead.emails::text ILIKE ${parameter}
        OR lead.address ILIKE ${parameter}
        OR lead.company_name ILIKE ${parameter}
        OR lead.website ILIKE ${parameter}
        OR lead.lead_type ILIKE ${parameter}
        OR lead.tags::text ILIKE ${parameter}
      )`);
    }

    const whereClause = clauses.join(" AND ");
    const pool = await getAnalyticsPool();
    const [itemsResult, countResult, rawCountResult] = await Promise.all([
      pool.query(
        `
          SELECT
            lead.id,
            lead.first_name,
            lead.last_name,
            lead.email,
            lead.phone,
            lead.emails,
            lead.phones,
            lead.address,
            lead.company_name,
            lead.job_title,
            lead.website,
            lead.lead_type,
            lead.lead_status,
            lead.lead_priority,
            lead.lead_score,
            lead.tags,
            lead.notes,
            lead.assigned_to
          FROM crm_leads lead
          WHERE ${whereClause}
            AND (
              lead.email ~* '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$'
              OR EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(COALESCE(lead.emails, '[]'::jsonb)) AS email_entry(value)
                WHERE email_entry.value ~* '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$'
              )
            )
          ORDER BY lead.updated_at DESC, lead.id DESC
          LIMIT $${values.length + 1}
          OFFSET $${values.length + 2}
        `,
        [...values, pagination.limit, pagination.offset]
      ),
      pool.query(
        `
          SELECT COUNT(*)::int AS total
          FROM crm_leads lead
          WHERE ${whereClause}
            AND (
              lead.email ~* '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$'
              OR EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(COALESCE(lead.emails, '[]'::jsonb)) AS email_entry(value)
                WHERE email_entry.value ~* '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$'
              )
            )
        `,
        values
      ),
      pool.query(
        `
          SELECT COUNT(*)::int AS total
          FROM crm_leads lead
          WHERE ${whereClause}
        `,
        values
      ),
    ]);

    const total = Number((countResult.rows[0] as { total: number }).total ?? 0);
    const rawTotal = Number((rawCountResult.rows[0] as { total: number }).total ?? 0);

    return {
      items: (itemsResult.rows as Array<Record<string, unknown>>).map(mapLeadRecipient),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / pagination.limit) : 0,
      },
      meta: {
        invalidFilteredCount: Math.max(0, rawTotal - total),
        validFilteredCount: total,
      },
    };
  });

export const listCampaigns = async (query: PaginationQuery) =>
  withSchemaRecovery(async () => {
    const pagination = buildPagination(query);
    const q = toTrimmedString(query.q);
    const status = toTrimmedString(query.status);
    const values: unknown[] = [];
    const clauses = ["campaign.deleted_at IS NULL"];

    if (status) {
      values.push(status);
      clauses.push(`campaign.status = $${values.length}`);
    }
    if (q) {
      values.push(`%${q}%`);
      const parameter = `$${values.length}`;
      clauses.push(`(
        campaign.name ILIKE ${parameter}
        OR campaign.subject ILIKE ${parameter}
        OR COALESCE(campaign.sender_email, '') ILIKE ${parameter}
      )`);
    }

    const whereClause = clauses.join(" AND ");
    const pool = await getAnalyticsPool();
    const [itemsResult, countResult, summaryResult] = await Promise.all([
      pool.query(
        `
          SELECT campaign.*, segment.name AS segment_name
          FROM crm_campaigns campaign
          LEFT JOIN crm_segments segment ON segment.id = campaign.segment_id
          WHERE ${whereClause}
          ORDER BY campaign.updated_at DESC, campaign.id DESC
          LIMIT $${values.length + 1}
          OFFSET $${values.length + 2}
        `,
        [...values, pagination.limit, pagination.offset]
      ),
      pool.query(
        `
          SELECT COUNT(*)::int AS total
          FROM crm_campaigns campaign
          WHERE ${whereClause}
        `,
        values
      ),
      pool.query(
        `
          SELECT
            COUNT(*)::int AS total_campaigns,
            COUNT(*) FILTER (WHERE status = 'Draft')::int AS drafts,
            COUNT(*) FILTER (WHERE status = 'Sending')::int AS sending,
            COUNT(*) FILTER (WHERE status = 'Completed')::int AS completed,
            COUNT(*) FILTER (WHERE status = 'Failed')::int AS failed
          FROM crm_campaigns
          WHERE deleted_at IS NULL
        `
      ),
    ]);

    const total = Number((countResult.rows[0] as { total: number }).total ?? 0);
    const summary = summaryResult.rows[0] as Record<string, unknown>;

    return {
      items: (itemsResult.rows as Array<Record<string, unknown>>).map(mapCampaign),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / pagination.limit) : 0,
      },
      summary: {
        totalCampaigns: Number(summary.total_campaigns ?? 0),
        drafts: Number(summary.drafts ?? 0),
        sending: Number(summary.sending ?? 0),
        completed: Number(summary.completed ?? 0),
        failed: Number(summary.failed ?? 0),
      },
    };
  });

export const getCampaignById = async (id: number) =>
  withSchemaRecovery(async () => loadCampaignById(id));

export const createCampaign = async (payload: CampaignPayload, actor: AdminActor) =>
  withSchemaRecovery(async () => {
    const input = await sanitizeCampaignPayload(payload);
    const pool = await getAnalyticsPool();
    const result = await pool.query(
      `
        INSERT INTO crm_campaigns (
          name,
          sender_account_id,
          sender_email,
          from_name,
          reply_to,
          subject,
          body,
          body_html,
          body_text,
          body_mode,
          status,
          recipient_type,
          segment_id,
          delay_seconds,
          delay_min_seconds,
          delay_max_seconds,
          track_opens,
          track_clicks,
          unsubscribe_required,
          total_recipients,
          recipient_count,
          sent_count,
          failed_count,
          skipped_count,
          created_by,
          updated_by,
          last_activity_at,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Draft', $11, $12, $13, $14, $15, $16, $17, $18, 0, 0, 0, 0, 0, $19, $20, NOW(), NOW(), NOW()
        )
        RETURNING *
      `,
      [
        input.name,
        input.senderAccountId,
        input.senderEmail,
        input.fromName,
        input.replyTo,
        input.subject,
        input.body,
        input.bodyMode === "html" ? input.body : null,
        input.bodyMode === "text" ? input.body : stripHtmlToText(input.body),
        input.bodyMode,
        input.audienceSource === "segment" ? "segments" : "leads",
        input.segmentId,
        input.delaySeconds,
        input.delaySeconds,
        input.delaySeconds,
        input.trackOpens,
        input.trackClicks,
        input.unsubscribeRequired,
        actor.id,
        actor.id,
      ]
    );

    const campaign = mapCampaign(result.rows[0] as Record<string, unknown>);
    if (input.audienceSource === "segment" && input.segmentId) {
      const audiencePreview = await buildSegmentAudiencePreview(input.segmentId);
      if (audiencePreview.recipients.length === 0) {
        throw new Error("Selected segment has no sendable recipients.");
      }
      await replaceCampaignRecipientsFromSegmentAudience(campaign.id, audiencePreview);
    } else {
      await replaceCampaignRecipients(campaign.id, input.recipientLeadIds, input.recipientSelections);
    }

    await insertActivity({
      activityType: "Campaign Created",
      title: `Campaign created: ${campaign.name}`,
      relatedType: "campaign",
      relatedId: campaign.id,
      actor,
    });

    return loadCampaignById(campaign.id);
  });

export const updateCampaign = async (id: number, payload: CampaignPayload, actor: AdminActor) =>
  withSchemaRecovery(async () => {
    const existing = await loadCampaignById(id);
    if (!existing) {
      throw new Error("Campaign not found.");
    }
    if (existing.status === "Sending" || existing.status === "Completed") {
      throw new Error("Only draft, failed, or cancelled campaigns can be edited.");
    }

    const input = await sanitizeCampaignPayload(payload);
    const pool = await getAnalyticsPool();
    await pool.query(
      `
        UPDATE crm_campaigns
        SET name = $2,
            sender_account_id = $3,
            sender_email = $4,
            from_name = $5,
            reply_to = $6,
            subject = $7,
            body = $8,
            body_html = $9,
            body_text = $10,
            body_mode = $11,
            status = 'Draft',
            recipient_type = $12,
            segment_id = $13,
            delay_seconds = $14,
            delay_min_seconds = $15,
            delay_max_seconds = $16,
            track_opens = $17,
            track_clicks = $18,
            unsubscribe_required = $19,
            cancelled_at = NULL,
            completed_at = NULL,
            started_at = NULL,
            sent_at = NULL,
            last_error = NULL,
            updated_by = $20,
            last_activity_at = NOW(),
            updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [
        id,
        input.name,
        input.senderAccountId,
        input.senderEmail,
        input.fromName,
        input.replyTo,
        input.subject,
        input.body,
        input.bodyMode === "html" ? input.body : null,
        input.bodyMode === "text" ? input.body : stripHtmlToText(input.body),
        input.bodyMode,
        input.audienceSource === "segment" ? "segments" : "leads",
        input.segmentId,
        input.delaySeconds,
        input.delaySeconds,
        input.delaySeconds,
        input.trackOpens,
        input.trackClicks,
        input.unsubscribeRequired,
        actor.id,
      ]
    );

    if (input.audienceSource === "segment" && input.segmentId) {
      const audiencePreview = await buildSegmentAudiencePreview(input.segmentId);
      if (audiencePreview.recipients.length === 0) {
        throw new Error("Selected segment has no sendable recipients.");
      }
      await replaceCampaignRecipientsFromSegmentAudience(id, audiencePreview);
    } else {
      await replaceCampaignRecipients(id, input.recipientLeadIds, input.recipientSelections);
    }
    return loadCampaignById(id);
  });

export const deleteCampaign = async (id: number, actor: AdminActor) =>
  withSchemaRecovery(async () => {
    const existing = await loadCampaignById(id);
    if (!existing) {
      throw new Error("Campaign not found.");
    }
    if (existing.status === "Sending") {
      throw new Error("A sending campaign cannot be deleted.");
    }

    await (await getAnalyticsPool()).query(
      `
        UPDATE crm_campaigns
        SET deleted_at = NOW(),
            updated_by = $2,
            updated_at = NOW(),
            last_activity_at = NOW()
        WHERE id = $1
      `,
      [id, actor.id]
    );

    return { success: true };
  });

export const duplicateCampaign = async (id: number, actor: AdminActor) =>
  withSchemaRecovery(async () => {
    const existing = await loadCampaignById(id);
    if (!existing) {
      throw new Error("Campaign not found.");
    }

    const pool = await getAnalyticsPool();
    const result = await pool.query(
      `
        INSERT INTO crm_campaigns (
          name,
          sender_account_id,
          sender_email,
          from_name,
          reply_to,
          subject,
          body,
          body_html,
          body_text,
          body_mode,
          status,
          recipient_type,
          segment_id,
          delay_seconds,
          delay_min_seconds,
          delay_max_seconds,
          track_opens,
          track_clicks,
          unsubscribe_required,
          total_recipients,
          recipient_count,
          sent_count,
          failed_count,
          skipped_count,
          created_by,
          updated_by,
          last_activity_at,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Draft', $11, $12, $13, $14, $15, $16, $17, $18, 0, 0, 0, 0, 0, $19, $20, NOW(), NOW(), NOW()
        )
        RETURNING *
      `,
      [
        `${existing.name} Copy`,
        existing.senderAccountId,
        existing.senderEmail,
        existing.fromName ?? null,
        existing.replyTo ?? null,
        existing.subject,
        existing.body,
        existing.bodyHtml ?? (existing.bodyMode === "html" ? existing.body : null),
        existing.bodyText ?? (existing.bodyMode === "text" ? existing.body : stripHtmlToText(existing.body)),
        existing.bodyMode,
        existing.recipientType,
        existing.segmentId,
        existing.delaySeconds,
        existing.delayMinSeconds ?? existing.delaySeconds,
        existing.delayMaxSeconds ?? existing.delaySeconds,
        existing.trackOpens ?? true,
        existing.trackClicks ?? true,
        existing.unsubscribeRequired ?? true,
        actor.id,
        actor.id,
      ]
    );

    const duplicate = mapCampaign(result.rows[0] as Record<string, unknown>);
    if (existing.recipientType === "segments" && existing.segmentId) {
      const audiencePreview = await buildSegmentAudiencePreview(existing.segmentId);
      if (audiencePreview.recipients.length === 0) {
        throw new Error("Selected segment has no sendable recipients.");
      }
      await replaceCampaignRecipientsFromSegmentAudience(duplicate.id, audiencePreview);
    } else {
      const recipientRows = await pool.query(
        `
          SELECT lead_id, email
          FROM crm_campaign_recipients
          WHERE campaign_id = $1
            AND lead_id IS NOT NULL
          ORDER BY id ASC
        `,
        [id]
      );
      const recipientSelections = recipientRows.rows
        .map((row: Record<string, unknown>) => ({
          leadId: Number((row as { lead_id?: unknown }).lead_id),
          email: toTrimmedString((row as { email?: unknown }).email).toLowerCase(),
        }))
        .filter((entry: RecipientSelection) => Number.isFinite(entry.leadId) && entry.leadId > 0 && isValidEmail(entry.email));
      const leadIds = recipientSelections
        .map((entry: RecipientSelection) => entry.leadId)
        .filter((entry: number) => Number.isFinite(entry) && entry > 0);
      await replaceCampaignRecipients(duplicate.id, leadIds, recipientSelections);
    }
    return loadCampaignById(duplicate.id);
  });

export const previewCampaign = async (id: number, payload?: Record<string, unknown>) =>
  withSchemaRecovery(async () => {
    const campaign = await loadCampaignById(id);
    if (!campaign) {
      throw new Error("Campaign not found.");
    }

    const sampleRecipient = {
      firstName: toTrimmedString(payload?.firstName) || "Alex",
      lastName: toTrimmedString(payload?.lastName) || "Morgan",
      address: toTrimmedString(payload?.address) || "Bengaluru, Karnataka, India",
      companyName: toTrimmedString(payload?.companyName) || "ITMart24 Partner",
      jobTitle: toTrimmedString(payload?.jobTitle) || "Marketing Manager",
      email: toTrimmedString(payload?.email) || "alex@example.com",
      website: toTrimmedString(payload?.website) || "https://example.com",
    };

    return {
      subject: renderTemplate(campaign.subject, sampleRecipient),
      body: renderTemplate(campaign.body, sampleRecipient),
      bodyMode: campaign.bodyMode,
      variables: sampleRecipient,
    };
  });

export const sendTestCampaign = async (id: number, payload: Record<string, unknown>, actor: AdminActor) =>
  withSchemaRecovery(async () => {
    const campaign = await loadCampaignById(id);
    if (!campaign) {
      throw new Error("Campaign not found.");
    }
    if (!campaign.senderAccountId) {
      throw new Error("Campaign sender account is required.");
    }

    const testEmail = toTrimmedString(payload.email).toLowerCase();
    if (!isValidEmail(testEmail)) {
      throw new Error("A valid test email is required.");
    }

    const renderedSubject = renderTemplate(campaign.subject, {
      firstName: "Test",
      lastName: "Recipient",
      address: "Kolkata, West Bengal, India",
      companyName: "ITMart24",
      jobTitle: "Marketing Lead",
      email: testEmail,
      website: "https://itmart24.com",
    });
    const renderedBody = renderTemplate(campaign.body, {
      firstName: "Test",
      lastName: "Recipient",
      address: "Kolkata, West Bengal, India",
      companyName: "ITMart24",
      jobTitle: "Marketing Lead",
      email: testEmail,
      website: "https://itmart24.com",
    });

    await sendEmailMessage(
      campaign.senderAccountId,
      {
        to: testEmail,
        subject: renderedSubject,
        bodyText: campaign.bodyMode === "html" ? stripHtmlToText(renderedBody) : renderedBody,
        bodyHtml: campaign.bodyMode === "html" ? renderedBody : undefined,
      },
      actor.id
    );

    return { success: true, message: "Test campaign sent successfully." };
  });

export const sendCampaign = async (id: number, actor: AdminActor) =>
  withSchemaRecovery(async () => {
    const campaign = await loadCampaignById(id);
    if (!campaign) {
      throw new Error("Campaign not found.");
    }
    if (campaign.status === "Sending") {
      throw new Error("Campaign is already sending.");
    }
    if (campaign.status === "Completed") {
      throw new Error("Completed campaigns cannot be re-sent. Duplicate the campaign to send it again.");
    }
    if (!campaign.senderAccountId) {
      throw new Error("Campaign sender account is required.");
    }
    if (!campaign.senderEmail) {
      throw new Error("Campaign from email is required.");
    }
    if (!toTrimmedString(campaign.subject)) {
      throw new Error("Campaign subject is required.");
    }
    if (!toTrimmedString(campaign.body)) {
      throw new Error("Campaign body is required.");
    }
    if (campaign.unsubscribeRequired === false) {
      throw new Error("Unsubscribe link is required before sending campaigns.");
    }

    const summary = await getRecipientSummary(id);
    const audiencePreview = await getCampaignAudiencePreview(id);
    if (summary.total === 0) {
      throw new Error("Add at least one valid recipient before sending this campaign.");
    }
    if (audiencePreview.sendableLeads <= 0) {
      throw new Error("This campaign has no sendable leads after safety checks.");
    }

    await loadSenderAccount(campaign.senderAccountId);
    await (await getAnalyticsPool()).query(
      `
        UPDATE crm_campaigns
        SET status = 'Sending',
            started_at = COALESCE(started_at, NOW()),
            completed_at = NULL,
            cancelled_at = NULL,
            sent_at = NULL,
            last_error = NULL,
            sent_count = 0,
            failed_count = 0,
            skipped_count = 0,
            updated_by = $2,
            last_activity_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `,
      [id, actor.id]
    );

    await (await getAnalyticsPool()).query(
      `
        UPDATE crm_campaign_recipients
        SET status = 'pending',
            error_message = NULL,
            failure_reason = NULL,
            skip_reason = NULL,
            sent_at = NULL,
            delivered_at = NULL,
            first_opened_at = NULL,
            last_opened_at = NULL,
            open_count = 0,
            first_clicked_at = NULL,
            last_clicked_at = NULL,
            click_count = 0,
            replied_at = NULL,
            bounce_at = NULL,
            bounce_type = NULL,
            bounce_reason = NULL,
            complained_at = NULL,
            unsubscribed_at = NULL,
            failed_at = NULL,
            last_event_type = NULL,
            last_event_at = NULL,
            personalized_subject = NULL,
            personalized_body_html = NULL,
            updated_at = NOW()
        WHERE campaign_id = $1
          AND status <> 'blocked'
      `,
      [id]
    );

    void processCampaignInBackground(id, actor);
    return loadCampaignById(id);
  });

export const cancelCampaign = async (id: number, actor: AdminActor) =>
  withSchemaRecovery(async () => {
    const campaign = await loadCampaignById(id);
    if (!campaign) {
      throw new Error("Campaign not found.");
    }
    if (campaign.status !== "Sending") {
      throw new Error("Only sending campaigns can be cancelled.");
    }

    await (await getAnalyticsPool()).query(
      `
        UPDATE crm_campaigns
        SET status = 'Cancelled',
            cancelled_at = NOW(),
            updated_by = $2,
            last_activity_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `,
      [id, actor.id]
    );

    await insertActivity({
      activityType: "Campaign Sent",
      title: `Campaign cancelled: ${campaign.name}`,
      description: "Bulk sending was cancelled by an admin.",
      relatedType: "campaign",
      relatedId: id,
      actor,
    });

    return loadCampaignById(id);
  });

export const getCampaignRecipients = async (id: number, query: PaginationQuery) =>
  withSchemaRecovery(async () => {
    const campaign = await loadCampaignById(id);
    if (!campaign) {
      throw new Error("Campaign not found.");
    }

    const pagination = buildPagination(query);
    const status = toTrimmedString(query.status).toLowerCase();
    const values: unknown[] = [id];
    const clauses = ["recipient.campaign_id = $1"];

    if (status) {
      values.push(status);
      clauses.push(`LOWER(recipient.status) = $${values.length}`);
    }

    const whereClause = clauses.join(" AND ");
    const pool = await getAnalyticsPool();
    const [itemsResult, countResult] = await Promise.all([
      pool.query(
        `
          SELECT recipient.*, lead.lead_type
          FROM crm_campaign_recipients recipient
          LEFT JOIN crm_leads lead ON lead.id = recipient.lead_id
          WHERE ${whereClause}
          ORDER BY recipient.id ASC
          LIMIT $${values.length + 1}
          OFFSET $${values.length + 2}
        `,
        [...values, pagination.limit, pagination.offset]
      ),
      pool.query(
        `
          SELECT COUNT(*)::int AS total
          FROM crm_campaign_recipients recipient
          WHERE ${whereClause}
        `,
        values
      ),
    ]);

    const total = Number((countResult.rows[0] as { total: number }).total ?? 0);
    return {
      items: (itemsResult.rows as Array<Record<string, unknown>>).map(mapCampaignRecipient),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / pagination.limit) : 0,
      },
      summary: await getRecipientSummary(id),
    };
  });

export const previewCampaignSegmentAudience = async (segmentId: number) =>
  withSchemaRecovery(async () => buildSegmentAudiencePreview(segmentId));

export const getCampaignTrackingData = async (id: number) =>
  withSchemaRecovery(async () => {
    const campaign = await loadCampaignById(id);
    if (!campaign) {
      throw new Error("Campaign not found.");
    }

    return {
      overview: await getCampaignTrackingOverview(id),
      audiencePreview: await getCampaignAudiencePreview(id),
    };
  });

export const getCampaignEventList = async (id: number, query: PaginationQuery) =>
  withSchemaRecovery(async () => {
    const campaign = await loadCampaignById(id);
    if (!campaign) {
      throw new Error("Campaign not found.");
    }
    const page = toPositiveInteger(query.page, 1);
    const limit = Math.min(MAX_PAGE_SIZE, toPositiveInteger(query.limit, 25));
    return listCampaignEvents(id, page, limit);
  });

export const getCampaignClickList = async (id: number, query: PaginationQuery) =>
  withSchemaRecovery(async () => {
    const campaign = await loadCampaignById(id);
    if (!campaign) {
      throw new Error("Campaign not found.");
    }
    const page = toPositiveInteger(query.page, 1);
    const limit = Math.min(MAX_PAGE_SIZE, toPositiveInteger(query.limit, 25));
    return listCampaignClicks(id, page, limit);
  });

export const updateCampaignRecipientTracking = async (
  campaignId: number,
  recipientId: number,
  action: "bounced" | "replied" | "complained" | "unsubscribed" | "do_not_contact",
  payload: Record<string, unknown>
) =>
  withSchemaRecovery(async () => {
    await markCampaignRecipientAction(campaignId, recipientId, action, payload);
    return loadCampaignRecipientById(campaignId, recipientId);
  });
