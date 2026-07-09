export type PromoScope = "subscription" | "portfolio";
export type PromoDiscountType = "fixed_price" | "amount_off" | "percent_off";
export type PromoMarketScope = "all" | "country";

export type PlanPromoCodePayload = {
  code: string;
  offerName: string;
  description?: string | null;
  promoScope: PromoScope;
  active: boolean;
  startsAt?: string | null;
  expiresAt?: string | null;
  maxUsesPerVendor?: number;
  allowedTopCategories?: string[] | null;
  allowedSubCategories?: string[] | null;
  allowedFinalCategories?: string[] | null;
  applicablePlanId?: string | null;
  applicablePlanName?: string | null;
  applicablePlanSlug?: string | null;
  applicablePortfolioPlanId?: string | null;
  applicablePortfolioPlanTitle?: string | null;
  applicableBillingCycle?: string | null;
  applicablePeriodId?: string | null;
  applicablePeriodLabel?: string | null;
  applicableDurationMonths?: number | null;
  applicableMarketScope?: PromoMarketScope;
  applicableCountryCode?: string | null;
  applicableCountryName?: string | null;
  discountType: PromoDiscountType;
  discountValue: number;
  discountedPrice?: number | null;
  currency: string;
  durationDays?: number | null;
  metadata?: Record<string, unknown>;
};

export const PROMO_CODE_TABLE_STATEMENTS = [
  `
    CREATE TABLE IF NOT EXISTS promo_codes (
      id BIGSERIAL PRIMARY KEY,
      variant_key TEXT,
      code TEXT NOT NULL,
      offer_name TEXT NOT NULL,
      description TEXT,
      promo_scope TEXT NOT NULL DEFAULT 'subscription',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      starts_at TIMESTAMP,
      expires_at TIMESTAMP,
      max_uses_per_vendor INTEGER NOT NULL DEFAULT 1,
      allowed_top_categories JSONB,
      allowed_sub_categories JSONB,
      allowed_final_categories JSONB,
      applicable_plan_id TEXT,
      applicable_plan_name TEXT,
      applicable_plan_slug TEXT,
      applicable_portfolio_plan_id TEXT,
      applicable_portfolio_plan_title TEXT,
      applicable_billing_cycle TEXT,
      applicable_period_id TEXT,
      applicable_period_label TEXT,
      applicable_duration_months INTEGER,
      applicable_market_scope TEXT NOT NULL DEFAULT 'all',
      applicable_country_code TEXT,
      applicable_country_name TEXT,
      discount_type TEXT NOT NULL DEFAULT 'fixed_price',
      discount_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
      discounted_price NUMERIC(12, 2),
      currency TEXT NOT NULL DEFAULT 'USD',
      duration_days INTEGER,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_promo_codes_scope_active
    ON promo_codes (promo_scope, active, updated_at DESC)
  `,
  `
    ALTER TABLE promo_codes
    ADD COLUMN IF NOT EXISTS variant_key TEXT
  `,
  `
    ALTER TABLE promo_codes
    DROP CONSTRAINT IF EXISTS promo_codes_code_key
  `,
  `
    UPDATE promo_codes
    SET variant_key = CONCAT_WS(
      '::',
      UPPER(code),
      COALESCE(promo_scope, 'subscription'),
      COALESCE(applicable_plan_id, applicable_plan_slug, ''),
      COALESCE(applicable_portfolio_plan_id, ''),
      COALESCE(applicable_period_id, applicable_billing_cycle, ''),
      COALESCE(applicable_country_code, 'ALL')
    )
    WHERE variant_key IS NULL OR BTRIM(variant_key) = ''
  `,
  `
    ALTER TABLE promo_codes
    ALTER COLUMN variant_key SET NOT NULL
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_codes_variant_key
    ON promo_codes (variant_key)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_promo_codes_plan_target
    ON promo_codes (
      applicable_plan_id,
      applicable_portfolio_plan_id,
      applicable_period_id,
      applicable_country_code
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS promo_code_usages (
      id BIGSERIAL PRIMARY KEY,
      usage_key TEXT NOT NULL UNIQUE,
      promo_code_id BIGINT REFERENCES promo_codes(id) ON DELETE SET NULL,
      promo_code TEXT NOT NULL,
      vendor_id TEXT NOT NULL,
      listing_id TEXT,
      payment_id TEXT,
      order_id TEXT,
      plan_type TEXT,
      plan_id TEXT,
      plan_name TEXT,
      billing_cycle TEXT,
      period_id TEXT,
      market_country_code TEXT,
      original_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
      discounted_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'used',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      used_at TIMESTAMP NOT NULL DEFAULT NOW(),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_promo_code_usages_vendor_code
    ON promo_code_usages (vendor_id, promo_code, used_at DESC)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_promo_code_usages_payment
    ON promo_code_usages (payment_id, order_id)
  `,
];

export const DEFAULT_PARTNER99_PROMO: PlanPromoCodePayload = {
  code: "PARTNER99",
  offerName: "ITMart24 Vendor Launch Partner Offer",
  description: "Business yearly promo price for eligible vendor listings.",
  promoScope: "subscription",
  active: true,
  startsAt: null,
  expiresAt: null,
  maxUsesPerVendor: 1,
  allowedTopCategories: null,
  allowedSubCategories: null,
  allowedFinalCategories: null,
  applicablePlanId: "business",
  applicablePlanName: "Business",
  applicablePlanSlug: "business",
  applicablePortfolioPlanId: null,
  applicablePortfolioPlanTitle: null,
  applicableBillingCycle: "yearly",
  applicablePeriodId: null,
  applicablePeriodLabel: "Yearly",
  applicableDurationMonths: 12,
  applicableMarketScope: "all",
  applicableCountryCode: null,
  applicableCountryName: null,
  discountType: "fixed_price",
  discountValue: 99,
  discountedPrice: 99,
  currency: "INR",
  durationDays: 365,
  metadata: {
    seededBy: "system",
    seedPurpose: "launch-offer",
  },
};

export const DEFAULT_PARTNER99_GLOBAL_PROMO: PlanPromoCodePayload = {
  code: "PARTNER99",
  offerName: "ITMart24 Vendor Launch Partner Offer",
  description: "Business yearly promo fallback price for eligible vendor listings in global markets.",
  promoScope: "subscription",
  active: true,
  startsAt: null,
  expiresAt: null,
  maxUsesPerVendor: 1,
  allowedTopCategories: null,
  allowedSubCategories: null,
  allowedFinalCategories: null,
  applicablePlanId: "business",
  applicablePlanName: "Business",
  applicablePlanSlug: "business",
  applicablePortfolioPlanId: null,
  applicablePortfolioPlanTitle: null,
  applicableBillingCycle: "yearly",
  applicablePeriodId: null,
  applicablePeriodLabel: "Yearly",
  applicableDurationMonths: 12,
  applicableMarketScope: "all",
  applicableCountryCode: null,
  applicableCountryName: null,
  discountType: "fixed_price",
  discountValue: 9,
  discountedPrice: 9,
  currency: "USD",
  durationDays: 365,
  metadata: {
    seededBy: "system",
    seedPurpose: "launch-offer-global-fallback",
  },
};
