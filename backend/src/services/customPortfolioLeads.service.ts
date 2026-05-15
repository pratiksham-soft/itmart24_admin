import { ensureTables, getAnalyticsPool } from "./analyticsPostgres.service";

type CustomPortfolioLeadPayload = {
  leadType?: unknown;
  companyName?: unknown;
  website?: unknown;
  businessEmail?: unknown;
  contactName?: unknown;
  jobTitle?: unknown;
  country?: unknown;
  productCountRange?: unknown;
  categories?: unknown;
  promotionGoals?: unknown;
  visibilityLevel?: unknown;
  budgetRange?: unknown;
  message?: unknown;
  sourcePage?: unknown;
  shopifyPageId?: unknown;
};

const SOURCE_PAGE = "vendor_page";
const SHOPIFY_PAGE_ID = "124057551087";
const LEAD_SOURCE = "Vendor Page - Custom Portfolio Pricing";
const LEAD_TAG = "custom_portfolio_pricing";

const PRODUCT_COUNT_OPTIONS = new Set([
  "2-5 products",
  "6-10 products",
  "11-25 products",
  "26-50 products",
  "50+ products",
]);

const CATEGORY_OPTIONS = new Set([
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

const PROMOTION_GOAL_OPTIONS = new Set([
  "More product impressions",
  "More website clicks",
  "Better category visibility",
  "Featured placement",
  "Comparison page inclusion",
  "Vendor profile promotion",
  "Lead generation",
  "Brand awareness",
  "Launch campaign",
  "Long-term marketplace visibility",
]);

const VISIBILITY_OPTIONS = new Set([
  "Basic portfolio listing",
  "Growth visibility package",
  "Enterprise visibility package",
  "Maximum category exposure",
  "Not sure, please recommend",
]);

const BUDGET_OPTIONS = new Set([
  "Below $1,000",
  "$1,000 - $2,500",
  "$2,500 - $5,000",
  "$5,000 - $10,000",
  "$10,000+",
  "Not decided yet",
]);

const trim = (value: unknown) => String(value ?? "").trim();

const normalizeWebsite = (value: unknown) => {
  const raw = trim(value);
  if (!raw) {
    throw new Error("Official Website is required.");
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const url = new URL(withProtocol);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) {
      throw new Error("invalid");
    }
    return url.toString().replace(/\/$/, "");
  } catch (_error) {
    throw new Error("Official Website must be a valid website URL.");
  }
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

const requiredText = (value: unknown, label: string) => {
  const normalized = trim(value);
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
};

const optionalText = (value: unknown) => trim(value) || null;

const normalizeChoice = (value: unknown, allowed: Set<string>, label: string) => {
  const normalized = requiredText(value, label);
  if (!allowed.has(normalized)) {
    throw new Error(`${label} has an invalid value.`);
  }
  return normalized;
};

const normalizeOptionalChoice = (value: unknown, allowed: Set<string>, label: string) => {
  const normalized = optionalText(value);
  if (!normalized) {
    return null;
  }
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

const getLeadPriority = (productCountRange: string, budgetRange: string | null) => {
  if (productCountRange === "50+ products" || budgetRange === "$10,000+") {
    return "High";
  }

  if (
    ["11-25 products", "26-50 products"].includes(productCountRange) ||
    ["$2,500 - $5,000", "$5,000 - $10,000"].includes(budgetRange ?? "")
  ) {
    return "Medium";
  }

  return "Normal";
};

const buildNote = (lead: ReturnType<typeof sanitizeCustomPortfolioLead>) =>
  [
    "Custom Portfolio Pricing Inquiry",
    `Product count range: ${lead.productCountRange}`,
    `Selected categories: ${lead.categories.join(", ")}`,
    `Promotion goals: ${lead.promotionGoals.join(", ")}`,
    `Preferred visibility level: ${lead.visibilityLevel}`,
    `Budget range: ${lead.budgetRange ?? "Not provided"}`,
    `Message: ${lead.message ?? "Not provided"}`,
    `Source page: ${lead.sourcePage}`,
    `Shopify Page ID: ${lead.shopifyPageId}`,
  ].join("\n");

const sanitizeCustomPortfolioLead = (payload: CustomPortfolioLeadPayload) => ({
  leadType: "custom_portfolio_pricing",
  companyName: requiredText(payload.companyName, "Company Name"),
  website: normalizeWebsite(payload.website),
  businessEmail: normalizeEmail(payload.businessEmail),
  contactName: requiredText(payload.contactName, "Contact Person Name"),
  jobTitle: optionalText(payload.jobTitle),
  country: optionalText(payload.country),
  productCountRange: normalizeChoice(
    payload.productCountRange,
    PRODUCT_COUNT_OPTIONS,
    "Number of Products / Plans"
  ),
  categories: normalizeMultiChoice(
    payload.categories,
    CATEGORY_OPTIONS,
    "Primary Product Categories"
  ),
  promotionGoals: normalizeMultiChoice(
    payload.promotionGoals,
    PROMOTION_GOAL_OPTIONS,
    "Promotion Goals"
  ),
  visibilityLevel: normalizeChoice(
    payload.visibilityLevel,
    VISIBILITY_OPTIONS,
    "Preferred Visibility Level"
  ),
  budgetRange: normalizeOptionalChoice(
    payload.budgetRange,
    BUDGET_OPTIONS,
    "Estimated Yearly Budget"
  ),
  message: optionalText(payload.message),
  sourcePage: SOURCE_PAGE,
  shopifyPageId: SHOPIFY_PAGE_ID,
  status: "new",
});

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
      id: `note-custom-portfolio-${Date.now()}`,
      text: noteText,
      authorId: null,
      authorName: "Vendor Page",
      createdAt: new Date().toISOString(),
    },
  ];
};

export const submitCustomPortfolioLead = async (
  payload: CustomPortfolioLeadPayload
) => {
  await ensureTables();

  const lead = sanitizeCustomPortfolioLead(payload);
  const priority = getLeadPriority(lead.productCountRange, lead.budgetRange);
  const noteText = buildNote(lead);
  const contactName = splitContactName(lead.contactName);
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
        lead.contactName,
        lead.jobTitle,
        lead.country,
        lead.productCountRange,
        JSON.stringify(lead.categories),
        JSON.stringify(lead.promotionGoals),
        lead.visibilityLevel,
        lead.budgetRange,
        lead.message,
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
              job_title = COALESCE(NULLIF(job_title, ''), $6),
              website = COALESCE(NULLIF(website, ''), $7),
              lead_source = $8,
              lead_status = $9,
              lead_priority = $10,
              tags = $11::jsonb,
              notes = $12::jsonb,
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
          lead.jobTitle,
          lead.website,
          LEAD_SOURCE,
          "New",
          priority,
          JSON.stringify(mergeTags(existing.tags)),
          JSON.stringify(appendLeadNote(existing.notes, noteText)),
        ]
      );
      crmLeadId = Number(updateResult.rows[0].id);
    } else {
      const insertLeadResult = await client.query(
        `
          INSERT INTO crm_leads (
            first_name, last_name, email, company_name, job_title, website,
            lead_source, lead_status, lead_priority, tags, notes,
            last_activity_at, created_at, updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10::jsonb, $11::jsonb,
            NOW(), NOW(), NOW()
          )
          RETURNING id
        `,
        [
          contactName.firstName,
          contactName.lastName,
          lead.businessEmail,
          lead.companyName,
          lead.jobTitle,
          lead.website,
          LEAD_SOURCE,
          "New",
          priority,
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
