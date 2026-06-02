import type { IncomingHttpHeaders } from "http";

type CountryPricingLike = {
  countryCode?: string;
  countryName?: string;
  currencyCode?: string;
  price?: number;
  discountPercentage?: number;
};

type PeriodPricingLike = {
  label?: string;
  durationInMonths?: number;
  price?: number;
  discountPercentage?: number;
  countryPricing?: CountryPricingLike[];
};

const COUNTRY_HEADER_KEYS = [
  "cf-ipcountry",
  "cloudfront-viewer-country",
  "x-vercel-ip-country",
  "x-country-code",
  "x-geo-country",
  "fly-client-country",
  "fastly-client-country-code",
] as const;

const UNKNOWN_COUNTRY_CODES = new Set(["", "XX", "ZZ", "T1", "A1"]);

const normalizeCountryCode = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(normalized) || UNKNOWN_COUNTRY_CODES.has(normalized)) {
    return null;
  }

  return normalized;
};

const resolveCountryEntry = (
  entries: CountryPricingLike[] | undefined,
  targetCountryCode: string | null
) => {
  if (!targetCountryCode || !Array.isArray(entries)) {
    return null;
  }

  return (
    entries.find(
      (entry) => normalizeCountryCode(entry.countryCode) === targetCountryCode
    ) ?? null
  );
};

const roundMoney = (value: number, currencyCode: string) => {
  if (currencyCode === "INR") {
    return Math.round(value);
  }

  return Number(value.toFixed(2));
};

const resolveEffectivePrice = (
  price: number,
  discountPercentage: number,
  currencyCode: string
) => roundMoney(price * (1 - discountPercentage / 100), currencyCode);

export type ResolvedPricingDetails = {
  countryCode: string | null;
  currencyCode: string;
  originalPrice: number;
  discountPercentage: number;
  discountedPrice: number;
  saveAmount: number | null;
  isDiscounted: boolean;
};

export const detectVisitorCountryCode = (headers: IncomingHttpHeaders) => {
  for (const headerKey of COUNTRY_HEADER_KEYS) {
    const value = headers[headerKey];
    const candidate = Array.isArray(value) ? value[0] : value;
    const normalized = normalizeCountryCode(candidate);

    if (normalized) {
      return normalized;
    }
  }

  return null;
};

export const resolvePricingDetails = (
  pricing: PeriodPricingLike,
  targetCountryCode: string | null,
  monthlyReferencePricing?: PeriodPricingLike | null
): ResolvedPricingDetails => {
  const marketEntry = resolveCountryEntry(pricing.countryPricing, targetCountryCode);
  const originalPrice = Number(marketEntry?.price ?? pricing.price ?? 0);
  const discountPercentage = Number(
    marketEntry?.discountPercentage ?? pricing.discountPercentage ?? 0
  );
  const currencyCode = String(marketEntry?.currencyCode ?? "USD").trim() || "USD";
  const discountedPrice = resolveEffectivePrice(
    originalPrice,
    discountPercentage,
    currencyCode
  );

  const durationInMonths =
    typeof pricing.durationInMonths === "number" && pricing.durationInMonths > 0
      ? pricing.durationInMonths
      : 0;

  let saveAmount: number | null = null;

  if (monthlyReferencePricing && durationInMonths > 1) {
    const monthlyReferenceEntry = resolveCountryEntry(
      monthlyReferencePricing.countryPricing,
      targetCountryCode
    );
    const monthlyBasePrice = Number(
      monthlyReferenceEntry?.price ?? monthlyReferencePricing.price ?? 0
    );
    const monthlyDiscountPercentage = Number(
      monthlyReferenceEntry?.discountPercentage ??
        monthlyReferencePricing.discountPercentage ??
        0
    );
    const monthlyCurrencyCode =
      String(monthlyReferenceEntry?.currencyCode ?? currencyCode).trim() ||
      currencyCode;
    const monthlyEffectivePrice = resolveEffectivePrice(
      monthlyBasePrice,
      monthlyDiscountPercentage,
      monthlyCurrencyCode
    );
    const comparisonTotal = monthlyEffectivePrice * durationInMonths;
    const savings = comparisonTotal - discountedPrice;

    saveAmount =
      savings > 0 ? roundMoney(savings, currencyCode) : null;
  }

  return {
    countryCode: marketEntry ? normalizeCountryCode(marketEntry.countryCode) : null,
    currencyCode,
    originalPrice,
    discountPercentage,
    discountedPrice,
    saveAmount,
    isDiscounted: discountPercentage > 0 && discountedPrice < originalPrice,
  };
};
