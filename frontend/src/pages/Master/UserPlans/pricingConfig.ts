import type { CountryPricing } from "./types";

export type CountryPreset = {
  code: string;
  name: string;
  currency: string;
};

export const COUNTRY_PRESETS: CountryPreset[] = [
  { code: "US", name: "United States", currency: "USD" },
  { code: "IN", name: "India", currency: "INR" },
  { code: "GB", name: "United Kingdom", currency: "GBP" },
  { code: "AE", name: "United Arab Emirates", currency: "AED" },
  { code: "CA", name: "Canada", currency: "CAD" },
  { code: "AU", name: "Australia", currency: "AUD" },
  { code: "SG", name: "Singapore", currency: "SGD" },
  { code: "DE", name: "Germany", currency: "EUR" },
  { code: "FR", name: "France", currency: "EUR" },
  { code: "NL", name: "Netherlands", currency: "EUR" },
  { code: "SA", name: "Saudi Arabia", currency: "SAR" },
  { code: "ZA", name: "South Africa", currency: "ZAR" },
  { code: "NG", name: "Nigeria", currency: "NGN" },
  { code: "JP", name: "Japan", currency: "JPY" },
  { code: "BR", name: "Brazil", currency: "BRL" },
];

export const createTempId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const createCountryPricingDraft = (
  overrides?: Partial<CountryPricing>
): CountryPricing => ({
  id: createTempId("country_price"),
  countryCode: "",
  countryName: "",
  currencyCode: "USD",
  price: 0,
  discountPercentage: 0,
  ...overrides,
});

export const getCountryPresetByValue = (value: string) => {
  const normalized = value.trim().toLowerCase();

  return COUNTRY_PRESETS.find(
    (preset) =>
      preset.name.toLowerCase() === normalized ||
      preset.code.toLowerCase() === normalized
  );
};

export const normalizeDiscountPercentage = (value: number | undefined) => {
  const parsedValue = Number(value ?? 0);

  if (!Number.isFinite(parsedValue)) {
    return 0;
  }

  return Math.min(100, Math.max(0, parsedValue));
};

export const calculateDiscountedPrice = (
  price: number,
  discountPercentage?: number
) => {
  const normalizedPrice = Number(price ?? 0);
  const normalizedDiscount = normalizeDiscountPercentage(discountPercentage);

  return Number((normalizedPrice * (1 - normalizedDiscount / 100)).toFixed(2));
};

export const formatMoney = (amount: number, currencyCode = "USD") => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode || "USD",
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currencyCode || "USD"} ${amount}`;
  }
};

export const getCountryPricingKey = (pricing: Pick<CountryPricing, "countryCode" | "countryName">) =>
  (pricing.countryCode?.trim() || pricing.countryName.trim()).toLowerCase();

