import { ensureTables, getAnalyticsPool } from "./analyticsPostgres.service";

type FounderVendorLeadPayload = {
  leadType?: unknown;
  fullName?: unknown;
  businessEmail?: unknown;
  companyName?: unknown;
  website?: unknown;
  categories?: unknown;
  phone?: unknown;
  message?: unknown;
  sourcePage?: unknown;
  shopifyPageId?: unknown;
};

const LEAD_TYPE = "founder_vendor_program";
const DEFAULT_SOURCE_PAGE = "founder_vendor_program_page";
const LEAD_SOURCE = "Founder Vendor Program Page";
const LEAD_TAG = "founder_vendor_program";

const PRODUCT_CATEGORY_OPTIONS = new Set([
  "Web Hosting",
  "WordPress Hosting",
  "VPS Hosting",
  "Dedicated Servers",
  "Cloud Hosting",
  "SaaS Software",
  "AI Tools",
  "Developer Tools",
  "Cybersecurity",
  "Business Software",
  "Other",
]);

const trim = (value: unknown) => String(value ?? "").trim();

const requiredText = (value: unknown, label: string) => {
  const normalized = trim(value);
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
};

const optionalText = (value: unknown) => trim(value) || null;

const normalizeWebsite = (value: unknown) => {
  const raw = trim(value);
  if (!raw) {
    throw new Error("Website URL is required.");
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const url = new URL(withProtocol);
    if (["http:", "https:"].includes(url.protocol) && url.hostname.includes(".")) {
      return url.toString().replace(/\/$/, "");
    }
  } catch (_error) {
    // Accept plain text website values without URL validation.
  }

  return raw;
};

const normalizeEmail = (value: unknown) => {
  const email = trim(value).toLowerCase();
  if (!email) {
    throw new Error("Business Email is required.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Business Email must be a valid email address.");
  }
  return email;
};

const normalizeChoice = (value: unknown, allowed: Set<string>, label: string) => {
  const normalized = requiredText(value, label);
  if (!allowed.has(normalized)) {
    throw new Error(`${label} has an invalid value.`);
  }
  return normalized;
};

const normalizeMultiChoice = (value: unknown, allowed: Set<string>, label: string) => {
  const values = Array.isArray(value)
    ? value.map(trim).filter(Boolean)
    : String(value ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);

  if (values.length === 0) {
    throw new Error(`${label} is required.`);
  }

  const uniqueValues = [...new Set(values)];
  const invalidValue = uniqueValues.find((entry) => !allowed.has(entry));
  if (invalidValue) {
    throw new Error(`${label} includes an invalid value.`);
  }

  return uniqueValues;
};

const splitContactName = (name: string) => {
  const parts = name.split(/\s+/).filter(Boolean);
  const firstName = parts.shift() ?? name;
  return {
    firstName,
    lastName: parts.join(" ") || null,
  };
};

const mergeTags = (existing: unknown) => {
  const tags = Array.isArray(existing)
    ? existing.map((tag) => String(tag ?? "").trim()).filter(Boolean)
    : [];

  return [...new Set([...tags, LEAD_TAG])];
};

const appendLeadNote = (existing: unknown, noteText: string) => {
  const notes = Array.isArray(existing) ? existing : [];

  return [
    ...notes,
    {
      id: `note-founder-vendor-${Date.now()}`,
      text: noteText,
      authorId: null,
      authorName: "Founder Vendor Program Page",
      createdAt: new Date().toISOString(),
    },
  ];
};

const sanitizeFounderVendorLead = (payload: FounderVendorLeadPayload) => ({
  leadType: LEAD_TYPE,
  fullName: requiredText(payload.fullName, "Full Name"),
  businessEmail: normalizeEmail(payload.businessEmail),
  companyName: requiredText(payload.companyName, "Company Name"),
  website: normalizeWebsite(payload.website),
  categories: normalizeMultiChoice(
    payload.categories,
    PRODUCT_CATEGORY_OPTIONS,
    "Primary Product Categories"
  ),
  phone: optionalText(payload.phone),
  message: optionalText(payload.message),
  sourcePage: optionalText(payload.sourcePage) || DEFAULT_SOURCE_PAGE,
  shopifyPageId: optionalText(payload.shopifyPageId) || null,
  status: "new",
});

const buildMessage = (lead: ReturnType<typeof sanitizeFounderVendorLead>) =>
  [
    `Founder Vendor Program Application`,
    `Primary product categories: ${lead.categories.join(", ")}`,
    `Phone / WhatsApp: ${lead.phone ?? "Not provided"}`,
    `Message: ${lead.message ?? "Not provided"}`,
  ].join("\n");

const buildNote = (lead: ReturnType<typeof sanitizeFounderVendorLead>) =>
  [
    "Founder Vendor Program Inquiry",
    `Primary product categories: ${lead.categories.join(", ")}`,
    `Phone / WhatsApp: ${lead.phone ?? "Not provided"}`,
    `Message: ${lead.message ?? "Not provided"}`,
    `Source page: ${lead.sourcePage}`,
    `Shopify Page ID: ${lead.shopifyPageId ?? "Not provided"}`,
  ].join("\n");

export const submitFounderVendorLead = async (payload: FounderVendorLeadPayload) => {
  await ensureTables();

  const lead = sanitizeFounderVendorLead(payload);
  const noteText = buildNote(lead);
  const contactName = splitContactName(lead.fullName);
  const pool = await getAnalyticsPool();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const customLeadResult = await client.query(
      `
        INSERT INTO crm_custom_leads (
          lead_type, company_name, website, business_email, contact_name,
          job_title, country, product_count_range, categories, promotion_goals,
          visibility_level, budget_range, message, source_page, shopify_page_id,
          status, follow_up_status, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9::jsonb, $10::jsonb,
          $11, $12, $13, $14, $15,
          $16, 'not_started', NOW(), NOW()
        )
        RETURNING id
      `,
        [
          lead.leadType,
          lead.companyName,
          lead.website,
          lead.businessEmail,
          lead.fullName,
          null,
          null,
          "Not specified",
          JSON.stringify(lead.categories),
          JSON.stringify([]),
          "Founder Vendor Program",
          null,
        buildMessage(lead),
        lead.sourcePage,
        lead.shopifyPageId,
        lead.status,
      ]
    );

    const existingLeadResult = await client.query(
      `
        SELECT *
        FROM crm_leads
        WHERE deleted_at IS NULL
          AND (
            LOWER(email) = LOWER($1)
            OR LOWER(COALESCE(website, '')) = LOWER($2)
          )
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `,
      [lead.businessEmail, lead.website]
    );

    let crmLeadId: number;
    if (existingLeadResult.rowCount && existingLeadResult.rows[0]) {
      const existing = existingLeadResult.rows[0] as Record<string, unknown>;
      const updateResult = await client.query(
        `
          UPDATE crm_leads
          SET first_name = COALESCE(first_name, $2),
              last_name = COALESCE(last_name, $3),
              email = COALESCE(email, $4),
              company_name = COALESCE(NULLIF(company_name, ''), $5),
              website = COALESCE(NULLIF(website, ''), $6),
              lead_source = $7,
              lead_status = $8,
              lead_priority = $9,
              tags = $10::jsonb,
              notes = $11::jsonb,
              last_activity_at = NOW(),
              updated_at = NOW()
          WHERE id = $1 AND deleted_at IS NULL
          RETURNING id
        `,
        [
          existing.id,
          contactName.firstName,
          contactName.lastName,
          lead.businessEmail,
          lead.companyName,
          lead.website,
          LEAD_SOURCE,
          "New",
          "Normal",
          JSON.stringify(mergeTags(existing.tags)),
          JSON.stringify(appendLeadNote(existing.notes, noteText)),
        ]
      );
      crmLeadId = Number(updateResult.rows[0].id);
    } else {
      const insertLeadResult = await client.query(
        `
          INSERT INTO crm_leads (
            first_name, last_name, email, company_name, website,
            lead_source, lead_status, lead_priority, tags, notes,
            last_activity_at, created_at, updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9::jsonb, $10::jsonb,
            NOW(), NOW(), NOW()
          )
          RETURNING id
        `,
        [
          contactName.firstName,
          contactName.lastName,
          lead.businessEmail,
          lead.companyName,
          lead.website,
          LEAD_SOURCE,
          "New",
          "Normal",
          JSON.stringify([LEAD_TAG]),
          JSON.stringify(appendLeadNote([], noteText)),
        ]
      );
      crmLeadId = Number(insertLeadResult.rows[0].id);
    }

    await client.query("COMMIT");

    return {
      customLeadId: Number(customLeadResult.rows[0].id),
      crmLeadId,
      status: lead.status,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};
