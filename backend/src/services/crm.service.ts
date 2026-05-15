import {
  getAnalyticsPool,
  ensureTables,
} from "./analyticsPostgres.service";
import { sendEmailMessage } from "./adminEmail.service";
import csvParser from "csv-parser";
import { Readable } from "stream";

type JsonRecord = Record<string, unknown>;

type PaginationQuery = {
  page?: unknown;
  limit?: unknown;
  q?: unknown;
  status?: unknown;
  source?: unknown;
  owner?: unknown;
  priority?: unknown;
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
  companyName: string | null;
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

type CsvLeadDraft = {
  row: number;
  raw: Record<string, string>;
  payload?: Record<string, unknown>;
  status?: "valid" | "invalid" | "duplicate";
  duplicateEmail?: string | null;
  duplicateLeadId?: number | null;
  duplicateAction?: "skip" | "update" | "create";
};

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;
const MAX_LEAD_IMPORT_ROWS = 2000;
const CRM_ALLOWED_SORT_ORDER = new Set(["asc", "desc"]);
const CRM_LEAD_IMPORT_HEADERS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "companyName",
  "jobTitle",
  "website",
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

const toTagArray = (value: unknown) => {
  if (Array.isArray(value)) {
    return toArrayOfStrings(value);
  }

  if (typeof value === "string") {
    return value
      .split(/[;,|]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [] as string[];
};

const normalizeCsvHeader = (value: string) =>
  value.replace(/^\uFEFF/, "").trim().replace(/\s+/g, "");

const isCsvLeadRowEmpty = (row: Record<string, string>) =>
  Object.values(row).every((value) => !toTrimmedString(value));

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

const mapLead = (row: Record<string, unknown>): any => {
  const record = camelizeRow(row);
  return {
    ...record,
    tags: normalizeJsonField<string[]>(record.tags, []),
    notes: normalizeJsonField<JsonRecord[]>(record.notes, []),
    hasCustomPortfolio: Boolean(record.hasCustomPortfolio),
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
    source: toTrimmedString(query.source),
    owner: toTrimmedString(query.owner),
    priority: toTrimmedString(query.priority),
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
  const firstName = toTrimmedString(payload.firstName);
  const lastName = toTrimmedString(payload.lastName);
  const companyName = toTrimmedString(payload.companyName);
  const email = toEmail(payload.email, "Lead email");
  if (!firstName && !lastName && !companyName && !email) {
    throw new Error("At least one of firstName, lastName, companyName, or email is required.");
  }

  return {
    firstName: firstName || null,
    lastName: lastName || null,
    email,
    phone: toOptionalString(payload.phone),
    companyName: companyName || null,
    jobTitle: toOptionalString(payload.jobTitle),
    website: toUrl(payload.website, "Website"),
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
    leadScore: toFiniteNumber(payload.leadScore ?? 0, "leadScore", {
      min: 0,
      max: 100,
    }),
    estimatedValue: toFiniteNumber(payload.estimatedValue ?? 0, "estimatedValue", {
      min: 0,
    }),
    currency: toOptionalString(payload.currency) ?? CRM_DEFAULTS.defaultCurrency,
    assignedTo: await resolveAdminOwner(payload.assignedTo ?? actor.id),
    tags: toTagArray(payload.tags),
    notes: Array.isArray(payload.notes)
      ? (payload.notes as JsonRecord[])
      : [],
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

        const normalizedRow = Object.fromEntries(
          Object.entries(row).map(([key, value]) => [normalizeCsvHeader(key), String(value ?? "").trim()])
        );

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
          CRM_LEAD_IMPORT_HEADERS.includes(header as (typeof CRM_LEAD_IMPORT_HEADERS)[number])
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
                header as (typeof CRM_LEAD_IMPORT_HEADERS)[number]
              )
          ),
        });
      })
      .on("error", (error) => {
        reject(new Error(readErrorMessage(error, "Failed to parse CSV file.")));
      });
  });
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
        AND email IS NOT NULL
        AND LOWER(email) = ANY($1::text[])
    `,
    [emails]
  );

  const existingLeads = new Map<string, any>();
  for (const row of result.rows as Array<Record<string, unknown>>) {
    const mapped = mapLead(row);
    if (mapped.email) {
      existingLeads.set(String(mapped.email).toLowerCase(), mapped);
    }
  }

  return existingLeads;
};

const buildLeadImportPayload = async (
  row: Record<string, string>,
  actor: AdminActor
) => {
  const notes = buildImportedNote(toOptionalString(row.notes), actor);
  return {
    firstName: toOptionalString(row.firstName),
    lastName: toOptionalString(row.lastName),
    email: toOptionalString(row.email),
    phone: toOptionalString(row.phone),
    companyName: toOptionalString(row.companyName),
    jobTitle: toOptionalString(row.jobTitle),
    website: toOptionalString(row.website),
    leadSource: toOptionalString(row.leadSource) ?? "Manual Entry",
    leadStatus: toOptionalString(row.leadStatus) ?? "New",
    leadPriority: toOptionalString(row.leadPriority) ?? "Medium",
    leadScore: toOptionalString(row.leadScore) ?? 0,
    estimatedValue: toOptionalString(row.estimatedValue) ?? 0,
    currency: toOptionalString(row.currency) ?? CRM_DEFAULTS.defaultCurrency,
    assignedTo: await resolveLeadImportOwner(row.assignedTo, actor),
    tags: toTagArray(row.tags),
    notes,
    nextFollowUpAt: toOptionalString(row.nextFollowUpAt),
  };
};

const buildLeadImportUpdatePayload = (
  existingLead: any,
  payload: Record<string, unknown>
) => {
  const noteEntries = Array.isArray(payload.notes) ? (payload.notes as JsonRecord[]) : [];
  const mergedNotes = noteEntries.length > 0 ? [...(existingLead.notes ?? []), ...noteEntries] : undefined;

  return {
    ...(payload.firstName ? { firstName: payload.firstName } : {}),
    ...(payload.lastName ? { lastName: payload.lastName } : {}),
    ...(payload.email ? { email: payload.email } : {}),
    ...(payload.phone ? { phone: payload.phone } : {}),
    ...(payload.companyName ? { companyName: payload.companyName } : {}),
    ...(payload.jobTitle ? { jobTitle: payload.jobTitle } : {}),
    ...(payload.website ? { website: payload.website } : {}),
    ...(payload.leadSource ? { leadSource: payload.leadSource } : {}),
    ...(payload.leadStatus ? { leadStatus: payload.leadStatus } : {}),
    ...(payload.leadPriority ? { leadPriority: payload.leadPriority } : {}),
    ...(payload.leadScore !== undefined ? { leadScore: payload.leadScore } : {}),
    ...(payload.estimatedValue !== undefined ? { estimatedValue: payload.estimatedValue } : {}),
    ...(payload.currency ? { currency: payload.currency } : {}),
    ...(payload.assignedTo ? { assignedTo: payload.assignedTo } : {}),
    ...(Array.isArray(payload.tags) && payload.tags.length > 0 ? { tags: payload.tags } : {}),
    ...(mergedNotes ? { notes: mergedNotes } : {}),
    ...(payload.nextFollowUpAt ? { nextFollowUpAt: payload.nextFollowUpAt } : {}),
  } as Record<string, unknown>;
};

const prepareLeadImport = async (
  buffer: Buffer,
  options: LeadImportOptions,
  actor: AdminActor
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
    try {
      const payload = await buildLeadImportPayload(csvRow.values, actor);
      await sanitizeLeadPayload(payload, actor);
      drafts.push({
        row: csvRow.row,
        raw: csvRow.values,
        payload,
        status: "valid",
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
      });
    }
  }

  const duplicateEmails = Array.from(
    new Set(
      drafts
        .filter((draft) => draft.status === "valid" && draft.payload?.email)
        .map((draft) => String(draft.payload?.email).toLowerCase())
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

    const email = draft.payload.email ? String(draft.payload.email).toLowerCase() : null;
    const existingLead = email ? existingLeadsByEmail.get(email) : null;
    if (!existingLead) {
      willCreate += 1;
      continue;
    }

    draft.duplicateEmail = email;
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
      email: email as string,
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

  const previewRows = drafts.slice(0, 10).map((draft) => ({
    row: draft.row,
    firstName: toOptionalString(draft.raw.firstName),
    lastName: toOptionalString(draft.raw.lastName),
    email: toOptionalString(draft.raw.email),
    companyName: toOptionalString(draft.raw.companyName),
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
  };
};

const resolveSegmentWhere = (
  conditions: unknown[],
  matchType: string,
  alias: string
) => {
  const values: unknown[] = [];
  const clauses: string[] = [];

  conditions.forEach((entry) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    const field = toTrimmedString(record.field);
    const operator = toTrimmedString(record.operator);
    const value = record.value;

    const allowedFieldMap: Record<string, string> = {
      leadStatus: `${alias}.lead_status`,
      leadSource: `${alias}.lead_source`,
      country: `${alias}.country`,
      tags: `${alias}.tags`,
      dealValue: `${alias}.value`,
      nextFollowUpAt: `${alias}.next_follow_up_at`,
      lastActivityAt: `${alias}.last_activity_at`,
      lifecycleStage: `${alias}.lifecycle_stage`,
      status: `${alias}.status`,
      stage: `${alias}.stage`,
      owner: `${alias}.owner`,
    };

    const column = allowedFieldMap[field];
    if (!column || !operator) {
      return;
    }

    if (operator === "equals") {
      values.push(value);
      clauses.push(`${column} = $${values.length}`);
      return;
    }

    if (operator === "contains") {
      values.push(`%${String(value ?? "")}%`);
      clauses.push(`${column}::text ILIKE $${values.length}`);
      return;
    }

    if (operator === "greater_than") {
      values.push(value);
      clauses.push(`${column} > $${values.length}`);
      return;
    }

    if (operator === "before") {
      values.push(value);
      clauses.push(`${column} < $${values.length}`);
      return;
    }

    if (operator === "older_than_days") {
      values.push(Number(value) || 0);
      clauses.push(`${column} < NOW() - ($${values.length} * INTERVAL '1 day')`);
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

    const resolved = resolveSegmentWhere(conditions, matchType, alias);
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
      "lead.phone",
      "lead.company_name",
      "lead.lead_source",
    ],
    filters: [
      { queryValue: toTrimmedString(query.status), clause: "lead.lead_status = ?" },
      { queryValue: toTrimmedString(query.source), clause: "lead.lead_source = ?" },
      { queryValue: toTrimmedString(query.owner), clause: "lead.assigned_to::text = ?" },
      { queryValue: toTrimmedString(query.priority), clause: "lead.lead_priority = ?" },
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
        first_name, last_name, email, phone, company_name, job_title, website,
        lead_source, lead_status, lead_priority, lead_score, estimated_value, currency,
        assigned_to, tags, notes, next_follow_up_at, last_activity_at,
        created_by, updated_by, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13,
        $14, $15::jsonb, $16::jsonb, $17, NOW(),
        $18, $19, NOW(), NOW()
      )
      RETURNING *
    `,
    [
      input.firstName,
      input.lastName,
      input.email,
      input.phone,
      input.companyName,
      input.jobTitle,
      input.website,
      input.leadSource,
      input.leadStatus,
      input.leadPriority,
      input.leadScore,
      input.estimatedValue,
      input.currency,
      input.assignedTo,
      JSON.stringify(input.tags),
      JSON.stringify(input.notes),
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
          company_name = $6,
          job_title = $7,
          website = $8,
          lead_source = $9,
          lead_status = $10,
          lead_priority = $11,
          lead_score = $12,
          estimated_value = $13,
          currency = $14,
          assigned_to = $15,
          tags = $16::jsonb,
          notes = $17::jsonb,
          next_follow_up_at = $18,
          last_activity_at = NOW(),
          updated_by = $19,
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
      input.companyName,
      input.jobTitle,
      input.website,
      input.leadSource,
      input.leadStatus,
      input.leadPriority,
      input.leadScore,
      input.estimatedValue,
      input.currency,
      input.assignedTo,
      JSON.stringify(input.tags),
      JSON.stringify(input.notes),
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
  const { preview } = await prepareLeadImport(buffer, options, actor);
  return preview;
};

export const importLeadsFromCsv = async (
  buffer: Buffer,
  payload: Record<string, unknown>,
  actor: AdminActor
) => {
  const options = parseLeadImportOptions(payload);
  const { drafts, preview } = await prepareLeadImport(buffer, options, actor);

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
        created_by, updated_by, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, NOW(), NOW())
      RETURNING *
    `,
    [
      input.name,
      input.description,
      input.entityType,
      JSON.stringify(input.conditions),
      input.matchType,
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
          updated_by = $7,
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

  const recipients = await getSegmentRecipients({
    recipientType: "segments",
    segmentId: Number(segment.id),
  });

  return {
    count: recipients.length,
    items: recipients.slice(0, 20),
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
    leadSources: Array.isArray(payload.leadSources)
      ? payload.leadSources
      : CRM_DEFAULTS.leadSources,
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
