import { getAnalyticsPool } from "./analyticsPostgres.service";
import {
  DEFAULT_PARTNER99_PROMO,
  DEFAULT_PARTNER99_GLOBAL_PROMO,
  PROMO_CODE_TABLE_STATEMENTS,
  type PlanPromoCodePayload,
  type PromoDiscountType,
  type PromoMarketScope,
  type PromoScope,
} from "./planPromoCodes.schema";

export type PlanPromoCodeRecord = {
  id: number;
  code: string;
  offerName: string;
  description: string | null;
  promoScope: PromoScope;
  active: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  maxUsesPerVendor: number;
  allowedTopCategories: string[] | null;
  allowedSubCategories: string[] | null;
  allowedFinalCategories: string[] | null;
  applicablePlanId: string | null;
  applicablePlanName: string | null;
  applicablePlanSlug: string | null;
  applicablePortfolioPlanId: string | null;
  applicablePortfolioPlanTitle: string | null;
  applicableBillingCycle: string | null;
  applicablePeriodId: string | null;
  applicablePeriodLabel: string | null;
  applicableDurationMonths: number | null;
  applicableMarketScope: PromoMarketScope;
  applicableCountryCode: string | null;
  applicableCountryName: string | null;
  discountType: PromoDiscountType;
  discountValue: number;
  discountedPrice: number | null;
  currency: string;
  durationDays: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};


const normalizeString = (value: unknown) => String(value ?? "").trim();
const normalizeUpper = (value: unknown) => normalizeString(value).toUpperCase();
const normalizeLower = (value: unknown) => normalizeString(value).toLowerCase();
const buildVariantKey = (payload: {
  code: string;
  promoScope: string;
  applicablePlanId?: string | null;
  applicablePlanSlug?: string | null;
  applicablePortfolioPlanId?: string | null;
  applicablePeriodId?: string | null;
  applicableBillingCycle?: string | null;
  applicableCountryCode?: string | null;
}) =>
  [
    normalizeUpper(payload.code),
    normalizeLower(payload.promoScope || "subscription"),
    normalizeString(payload.applicablePlanId || payload.applicablePlanSlug || ""),
    normalizeString(payload.applicablePortfolioPlanId || ""),
    normalizeString(payload.applicablePeriodId || payload.applicableBillingCycle || ""),
    normalizeUpper(payload.applicableCountryCode || "ALL"),
  ].join("::");

const normalizeStringArrayOrNull = (value: unknown) => {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((entry) => normalizeString(entry))
    .filter(Boolean);

  return normalized.length > 0 ? normalized : null;
};

const assertRequiredString = (value: unknown, message: string) => {
  const normalized = normalizeString(value);
  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
};

const assertBoolean = (value: unknown) => value === true;

const assertPositiveNumber = (
  value: unknown,
  message: string,
  options?: { allowZero?: boolean }
) => {
  const numeric = Number(value);
  const minimum = options?.allowZero ? 0 : Number.MIN_VALUE;

  if (!Number.isFinite(numeric) || numeric < minimum) {
    throw new Error(message);
  }

  return numeric;
};

const toNullableIsoDate = (value: unknown) => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Please provide a valid start or expiry date.");
  }

  return date.toISOString();
};

const mapPromoRow = (row: Record<string, unknown>): PlanPromoCodeRecord => ({
  id: Number(row.id),
  code: normalizeUpper(row.code),
  offerName: normalizeString(row.offer_name),
  description: row.description == null ? null : normalizeString(row.description),
  promoScope:
    normalizeLower(row.promo_scope) === "portfolio" ? "portfolio" : "subscription",
  active: Boolean(row.active),
  startsAt:
    typeof row.starts_at === "string"
      ? row.starts_at
      : row.starts_at instanceof Date
        ? row.starts_at.toISOString()
        : null,
  expiresAt:
    typeof row.expires_at === "string"
      ? row.expires_at
      : row.expires_at instanceof Date
        ? row.expires_at.toISOString()
        : null,
  maxUsesPerVendor: Number(row.max_uses_per_vendor ?? 1),
  allowedTopCategories: Array.isArray(row.allowed_top_categories)
    ? (row.allowed_top_categories as string[])
    : null,
  allowedSubCategories: Array.isArray(row.allowed_sub_categories)
    ? (row.allowed_sub_categories as string[])
    : null,
  allowedFinalCategories: Array.isArray(row.allowed_final_categories)
    ? (row.allowed_final_categories as string[])
    : null,
  applicablePlanId: row.applicable_plan_id ? normalizeString(row.applicable_plan_id) : null,
  applicablePlanName: row.applicable_plan_name
    ? normalizeString(row.applicable_plan_name)
    : null,
  applicablePlanSlug: row.applicable_plan_slug
    ? normalizeString(row.applicable_plan_slug)
    : null,
  applicablePortfolioPlanId: row.applicable_portfolio_plan_id
    ? normalizeString(row.applicable_portfolio_plan_id)
    : null,
  applicablePortfolioPlanTitle: row.applicable_portfolio_plan_title
    ? normalizeString(row.applicable_portfolio_plan_title)
    : null,
  applicableBillingCycle: row.applicable_billing_cycle
    ? normalizeString(row.applicable_billing_cycle)
    : null,
  applicablePeriodId: row.applicable_period_id ? normalizeString(row.applicable_period_id) : null,
  applicablePeriodLabel: row.applicable_period_label
    ? normalizeString(row.applicable_period_label)
    : null,
  applicableDurationMonths:
    row.applicable_duration_months == null
      ? null
      : Number(row.applicable_duration_months),
  applicableMarketScope:
    normalizeLower(row.applicable_market_scope) === "country" ? "country" : "all",
  applicableCountryCode: row.applicable_country_code
    ? normalizeUpper(row.applicable_country_code)
    : null,
  applicableCountryName: row.applicable_country_name
    ? normalizeString(row.applicable_country_name)
    : null,
  discountType:
    normalizeLower(row.discount_type) === "amount_off"
      ? "amount_off"
      : normalizeLower(row.discount_type) === "percent_off"
        ? "percent_off"
        : "fixed_price",
  discountValue: Number(row.discount_value ?? 0),
  discountedPrice:
    row.discounted_price == null ? null : Number(row.discounted_price),
  currency: normalizeUpper(row.currency || "USD"),
  durationDays: row.duration_days == null ? null : Number(row.duration_days),
  metadata:
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {},
  createdAt:
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at ?? ""),
  updatedAt:
    row.updated_at instanceof Date
      ? row.updated_at.toISOString()
      : String(row.updated_at ?? ""),
});

const validatePromoPayload = (payload: PlanPromoCodePayload) => {
  const code = assertRequiredString(payload.code, "Promo code is required.").toUpperCase();
  const offerName = assertRequiredString(
    payload.offerName,
    "Offer name is required."
  );
  const promoScope =
    normalizeLower(payload.promoScope) === "portfolio" ? "portfolio" : "subscription";
  const discountType =
    normalizeLower(payload.discountType) === "amount_off"
      ? "amount_off"
      : normalizeLower(payload.discountType) === "percent_off"
        ? "percent_off"
        : "fixed_price";
  const discountValue = assertPositiveNumber(
    payload.discountValue,
    "Discount value must be zero or greater.",
    { allowZero: true }
  );
  const rawDiscountedPrice = payload.discountedPrice;
  const discountedPrice =
    rawDiscountedPrice == null ||
    (typeof rawDiscountedPrice === "string" && rawDiscountedPrice === "")
      ? null
      : assertPositiveNumber(
          rawDiscountedPrice,
          "Discounted price must be zero or greater.",
          { allowZero: true }
        );
  const currency = assertRequiredString(payload.currency, "Currency is required.").toUpperCase();
  const maxUsesPerVendor = Math.max(
    1,
    Number(payload.maxUsesPerVendor ?? 1) || 1
  );
  const rawDurationDays = payload.durationDays;
  const durationDays =
    rawDurationDays == null ||
    (typeof rawDurationDays === "string" && rawDurationDays === "")
      ? null
      : Math.max(1, Number(rawDurationDays));

  if (
    promoScope === "subscription" &&
    !normalizeString(payload.applicablePlanId) &&
    !normalizeString(payload.applicablePlanSlug)
  ) {
    throw new Error("Please select a subscription plan target.");
  }

  if (
    promoScope === "portfolio" &&
    !normalizeString(payload.applicablePortfolioPlanId)
  ) {
    throw new Error("Please select a portfolio plan target.");
  }

  if (
    !normalizeString(payload.applicablePeriodId) &&
    !normalizeString(payload.applicableBillingCycle) &&
    !Number(payload.applicableDurationMonths || 0)
  ) {
    throw new Error("Please select a billing period target.");
  }

  if (discountType === "fixed_price" && discountedPrice == null) {
    throw new Error("Please enter the final promo price.");
  }

  return {
    code,
    offerName,
    description: normalizeString(payload.description) || null,
    promoScope,
    active: assertBoolean(payload.active),
    startsAt: toNullableIsoDate(payload.startsAt),
    expiresAt: toNullableIsoDate(payload.expiresAt),
    maxUsesPerVendor,
    allowedTopCategories: normalizeStringArrayOrNull(payload.allowedTopCategories),
    allowedSubCategories: normalizeStringArrayOrNull(payload.allowedSubCategories),
    allowedFinalCategories: normalizeStringArrayOrNull(payload.allowedFinalCategories),
    applicablePlanId: normalizeString(payload.applicablePlanId) || null,
    applicablePlanName: normalizeString(payload.applicablePlanName) || null,
    applicablePlanSlug: normalizeString(payload.applicablePlanSlug) || null,
    applicablePortfolioPlanId: normalizeString(payload.applicablePortfolioPlanId) || null,
    applicablePortfolioPlanTitle:
      normalizeString(payload.applicablePortfolioPlanTitle) || null,
    applicableBillingCycle: normalizeString(payload.applicableBillingCycle) || null,
    applicablePeriodId: normalizeString(payload.applicablePeriodId) || null,
    applicablePeriodLabel: normalizeString(payload.applicablePeriodLabel) || null,
    applicableDurationMonths:
      payload.applicableDurationMonths == null ||
      (typeof payload.applicableDurationMonths === "string" &&
        payload.applicableDurationMonths === "")
        ? null
        : Number(payload.applicableDurationMonths),
    applicableMarketScope:
      normalizeLower(payload.applicableMarketScope) === "country" ? "country" : "all",
    applicableCountryCode: normalizeUpper(payload.applicableCountryCode) || null,
    applicableCountryName: normalizeString(payload.applicableCountryName) || null,
    discountType,
    discountValue,
    discountedPrice,
    currency,
    durationDays,
    metadata:
      payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {},
  };
};

const UPSERT_PROMO_SQL = `
  INSERT INTO promo_codes (
    variant_key,
    code,
    offer_name,
    description,
    promo_scope,
    active,
    starts_at,
    expires_at,
    max_uses_per_vendor,
    allowed_top_categories,
    allowed_sub_categories,
    allowed_final_categories,
    applicable_plan_id,
    applicable_plan_name,
    applicable_plan_slug,
    applicable_portfolio_plan_id,
    applicable_portfolio_plan_title,
    applicable_billing_cycle,
    applicable_period_id,
    applicable_period_label,
    applicable_duration_months,
    applicable_market_scope,
    applicable_country_code,
    applicable_country_name,
    discount_type,
    discount_value,
    discounted_price,
    currency,
    duration_days,
    metadata,
    updated_at
  ) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb,
    $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
    $25, $26, $27, $28, $29, $30::jsonb, NOW()
  )
  ON CONFLICT (variant_key) DO UPDATE
  SET
    variant_key = EXCLUDED.variant_key,
    offer_name = EXCLUDED.offer_name,
    description = EXCLUDED.description,
    promo_scope = EXCLUDED.promo_scope,
    active = EXCLUDED.active,
    starts_at = EXCLUDED.starts_at,
    expires_at = EXCLUDED.expires_at,
    max_uses_per_vendor = EXCLUDED.max_uses_per_vendor,
    allowed_top_categories = EXCLUDED.allowed_top_categories,
    allowed_sub_categories = EXCLUDED.allowed_sub_categories,
    allowed_final_categories = EXCLUDED.allowed_final_categories,
    applicable_plan_id = EXCLUDED.applicable_plan_id,
    applicable_plan_name = EXCLUDED.applicable_plan_name,
    applicable_plan_slug = EXCLUDED.applicable_plan_slug,
    applicable_portfolio_plan_id = EXCLUDED.applicable_portfolio_plan_id,
    applicable_portfolio_plan_title = EXCLUDED.applicable_portfolio_plan_title,
    applicable_billing_cycle = EXCLUDED.applicable_billing_cycle,
    applicable_period_id = EXCLUDED.applicable_period_id,
    applicable_period_label = EXCLUDED.applicable_period_label,
    applicable_duration_months = EXCLUDED.applicable_duration_months,
    applicable_market_scope = EXCLUDED.applicable_market_scope,
    applicable_country_code = EXCLUDED.applicable_country_code,
    applicable_country_name = EXCLUDED.applicable_country_name,
    discount_type = EXCLUDED.discount_type,
    discount_value = EXCLUDED.discount_value,
    discounted_price = EXCLUDED.discounted_price,
    currency = EXCLUDED.currency,
    duration_days = EXCLUDED.duration_days,
    metadata = EXCLUDED.metadata,
    updated_at = NOW()
  RETURNING *
`;

const buildPromoParams = (
  payload: ReturnType<typeof validatePromoPayload>
): unknown[] => [
  buildVariantKey(payload),
  payload.code,
  payload.offerName,
  payload.description,
  payload.promoScope,
  payload.active,
  payload.startsAt,
  payload.expiresAt,
  payload.maxUsesPerVendor,
  JSON.stringify(payload.allowedTopCategories),
  JSON.stringify(payload.allowedSubCategories),
  JSON.stringify(payload.allowedFinalCategories),
  payload.applicablePlanId,
  payload.applicablePlanName,
  payload.applicablePlanSlug,
  payload.applicablePortfolioPlanId,
  payload.applicablePortfolioPlanTitle,
  payload.applicableBillingCycle,
  payload.applicablePeriodId,
  payload.applicablePeriodLabel,
  payload.applicableDurationMonths,
  payload.applicableMarketScope,
  payload.applicableCountryCode,
  payload.applicableCountryName,
  payload.discountType,
  payload.discountValue,
  payload.discountedPrice,
  payload.currency,
  payload.durationDays,
  JSON.stringify(payload.metadata ?? {}),
];

export const ensureDefaultPromoCodeSeeds = async (
  clientOrPool?: { query: (text: string, params?: unknown[]) => Promise<unknown> }
) => {
  const client = clientOrPool ?? (await getAnalyticsPool());
  const normalizedSeeds = [
    validatePromoPayload({
      ...DEFAULT_PARTNER99_PROMO,
      applicableMarketScope: "country",
      applicableCountryCode: "IN",
      applicableCountryName: "India",
    }),
    validatePromoPayload(DEFAULT_PARTNER99_GLOBAL_PROMO),
  ];

  for (const seed of normalizedSeeds) {
    await client.query(UPSERT_PROMO_SQL, buildPromoParams(seed));
  }
};

export const listPlanPromoCodes = async () => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      SELECT *
      FROM promo_codes
      ORDER BY active DESC, updated_at DESC, code ASC
    `
  );

  return result.rows.map((row: Record<string, unknown>) => mapPromoRow(row));
};

export const createPlanPromoCode = async (payload: PlanPromoCodePayload) => {
  const pool = await getAnalyticsPool();
  const validated = validatePromoPayload(payload);
  const result = await pool.query(UPSERT_PROMO_SQL, buildPromoParams(validated));
  return mapPromoRow(result.rows[0] as Record<string, unknown>);
};

export const updatePlanPromoCode = async (
  promoId: number,
  payload: PlanPromoCodePayload
) => {
  const pool = await getAnalyticsPool();
  const existing = await pool.query("SELECT code FROM promo_codes WHERE id = $1", [promoId]);

  if (existing.rowCount === 0) {
    throw new Error("Promo code not found.");
  }

  const validated = validatePromoPayload({
    ...payload,
    code: normalizeString(payload.code) || existing.rows[0].code,
  });

  const result = await pool.query(
    `
      UPDATE promo_codes
      SET
        variant_key = $2,
        code = $3,
        offer_name = $4,
        description = $5,
        promo_scope = $6,
        active = $7,
        starts_at = $8,
        expires_at = $9,
        max_uses_per_vendor = $10,
        allowed_top_categories = $11::jsonb,
        allowed_sub_categories = $12::jsonb,
        allowed_final_categories = $13::jsonb,
        applicable_plan_id = $14,
        applicable_plan_name = $15,
        applicable_plan_slug = $16,
        applicable_portfolio_plan_id = $17,
        applicable_portfolio_plan_title = $18,
        applicable_billing_cycle = $19,
        applicable_period_id = $20,
        applicable_period_label = $21,
        applicable_duration_months = $22,
        applicable_market_scope = $23,
        applicable_country_code = $24,
        applicable_country_name = $25,
        discount_type = $26,
        discount_value = $27,
        discounted_price = $28,
        currency = $29,
        duration_days = $30,
        metadata = $31::jsonb,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [
      promoId,
      ...buildPromoParams(validated),
    ]
  );

  return mapPromoRow(result.rows[0] as Record<string, unknown>);
};

export const setPlanPromoCodeActiveState = async (promoId: number, active: boolean) => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      UPDATE promo_codes
      SET active = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [promoId, active]
  );

  if (result.rowCount === 0) {
    throw new Error("Promo code not found.");
  }

  return mapPromoRow(result.rows[0] as Record<string, unknown>);
};

export const deletePlanPromoCode = async (promoId: number) => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      DELETE FROM promo_codes
      WHERE id = $1
      RETURNING id
    `,
    [promoId]
  );

  if (result.rowCount === 0) {
    throw new Error("Promo code not found.");
  }

  return {
    success: true,
    id: Number(result.rows[0].id),
  };
};
