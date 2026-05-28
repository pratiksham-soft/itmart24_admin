import admin from "firebase-admin";

const db = admin.firestore();
const COLLECTION = "subscription_plans";

type SubscriptionPlanPeriod = {
  id: string;
  label: string;
  durationInMonths: number;
  durationInDays?: number;
  price: number;
  discountPercentage?: number;
  countryPricing?: SubscriptionCountryPricing[];
};

type SubscriptionPlanFeature = {
  title: string;
  description: string;
};

export type PortfolioPlanPricingOptionPayload = {
  periodInMonths: number;
  price: number;
  durationUnitName: string;
  discountPercentage?: number;
  countryPricing?: CountryPricingPayload[];
};

export type CountryPricingPayload = {
  countryCode?: string;
  countryName: string;
  currencyCode: string;
  price: number;
  discountPercentage?: number;
};

export type SubscriptionCountryPricing = CountryPricingPayload & {
  id: string;
};

export type PortfolioPlanPayload = {
  basePlanId: string;
  title: string;
  minProducts: number;
  maxProducts: number;
  pricingOptions: PortfolioPlanPricingOptionPayload[];
  isActive: boolean;
  sortOrder?: number;
};

export type SubscriptionPortfolioPlanPricingOption =
  PortfolioPlanPricingOptionPayload & {
    id: string;
  };

export type SubscriptionPortfolioPlan = Omit<
  PortfolioPlanPayload,
  "pricingOptions"
> & {
  id: string;
  basePlanName: string;
  pricingOptions: SubscriptionPortfolioPlanPricingOption[];
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type SubscriptionPlanPayload = {
  name: string;
  slug: string;
  sortOrder?: number;
  periods: SubscriptionPlanPeriod[];
  features: SubscriptionPlanFeature[];
  isActive: boolean;
};

type SubscriptionPlanRecord = SubscriptionPlanPayload & {
  portfolioPlans?: unknown[];
};

const PORTFOLIO_PLAN_SEEDS: PortfolioPlanPayload[] = [
  {
    basePlanId: "starter",
    title: "Starter Portfolio",
    minProducts: 3,
    maxProducts: 5,
    pricingOptions: [
      { periodInMonths: 12, price: 490, durationUnitName: "Yearly" },
      { periodInMonths: 36, price: 999, durationUnitName: "Founder Lock" },
    ],
    isActive: true,
    sortOrder: 1,
  },
  {
    basePlanId: "starter",
    title: "Starter Portfolio",
    minProducts: 6,
    maxProducts: 10,
    pricingOptions: [
      { periodInMonths: 12, price: 890, durationUnitName: "Yearly" },
      { periodInMonths: 36, price: 1799, durationUnitName: "Founder Lock" },
    ],
    isActive: true,
    sortOrder: 2,
  },
  {
    basePlanId: "starter",
    title: "Starter Portfolio",
    minProducts: 11,
    maxProducts: 15,
    pricingOptions: [
      { periodInMonths: 12, price: 1290, durationUnitName: "Yearly" },
      { periodInMonths: 36, price: 2599, durationUnitName: "Founder Lock" },
    ],
    isActive: true,
    sortOrder: 3,
  },
  {
    basePlanId: "starter",
    title: "Starter Portfolio",
    minProducts: 16,
    maxProducts: 20,
    pricingOptions: [
      { periodInMonths: 12, price: 1690, durationUnitName: "Yearly" },
      { periodInMonths: 36, price: 3399, durationUnitName: "Founder Lock" },
    ],
    isActive: true,
    sortOrder: 4,
  },
  {
    basePlanId: "business",
    title: "Business Portfolio",
    minProducts: 3,
    maxProducts: 5,
    pricingOptions: [
      { periodInMonths: 12, price: 1490, durationUnitName: "Yearly" },
      { periodInMonths: 36, price: 2999, durationUnitName: "Founder Lock" },
    ],
    isActive: true,
    sortOrder: 1,
  },
  {
    basePlanId: "business",
    title: "Business Portfolio",
    minProducts: 6,
    maxProducts: 10,
    pricingOptions: [
      { periodInMonths: 12, price: 2790, durationUnitName: "Yearly" },
      { periodInMonths: 36, price: 5599, durationUnitName: "Founder Lock" },
    ],
    isActive: true,
    sortOrder: 2,
  },
  {
    basePlanId: "business",
    title: "Business Portfolio",
    minProducts: 11,
    maxProducts: 15,
    pricingOptions: [
      { periodInMonths: 12, price: 3990, durationUnitName: "Yearly" },
      { periodInMonths: 36, price: 7999, durationUnitName: "Founder Lock" },
    ],
    isActive: true,
    sortOrder: 3,
  },
  {
    basePlanId: "business",
    title: "Business Portfolio",
    minProducts: 16,
    maxProducts: 20,
    pricingOptions: [
      { periodInMonths: 12, price: 4990, durationUnitName: "Yearly" },
      { periodInMonths: 36, price: 9999, durationUnitName: "Founder Lock" },
    ],
    isActive: true,
    sortOrder: 4,
  },
  {
    basePlanId: "enterprise",
    title: "Enterprise Portfolio",
    minProducts: 3,
    maxProducts: 5,
    pricingOptions: [
      { periodInMonths: 12, price: 3490, durationUnitName: "Yearly" },
      { periodInMonths: 36, price: 6990, durationUnitName: "Founder Lock" },
    ],
    isActive: true,
    sortOrder: 1,
  },
  {
    basePlanId: "enterprise",
    title: "Enterprise Portfolio",
    minProducts: 6,
    maxProducts: 10,
    pricingOptions: [
      { periodInMonths: 12, price: 5990, durationUnitName: "Yearly" },
      { periodInMonths: 36, price: 11990, durationUnitName: "Founder Lock" },
    ],
    isActive: true,
    sortOrder: 2,
  },
  {
    basePlanId: "enterprise",
    title: "Enterprise Portfolio",
    minProducts: 11,
    maxProducts: 15,
    pricingOptions: [
      { periodInMonths: 12, price: 8990, durationUnitName: "Yearly" },
      { periodInMonths: 36, price: 17990, durationUnitName: "Founder Lock" },
    ],
    isActive: true,
    sortOrder: 3,
  },
  {
    basePlanId: "enterprise",
    title: "Enterprise Portfolio",
    minProducts: 16,
    maxProducts: 20,
    pricingOptions: [
      { periodInMonths: 12, price: 11990, durationUnitName: "Yearly" },
      { periodInMonths: 36, price: 23990, durationUnitName: "Founder Lock" },
    ],
    isActive: true,
    sortOrder: 4,
  },
];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const assertNonEmptyString = (value: unknown, message: string) => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(message);
  }

  return value.trim();
};

const assertNumber = (
  value: unknown,
  message: string,
  options?: { min?: number; max?: number }
) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    throw new Error(message);
  }

  if (options?.min !== undefined && numericValue < options.min) {
    throw new Error(message);
  }

  if (options?.max !== undefined && numericValue > options.max) {
    throw new Error(message);
  }

  return numericValue;
};

const rangesOverlap = (
  minA: number,
  maxA: number,
  minB: number,
  maxB: number
) => minA <= maxB && minB <= maxA;

const buildPortfolioPlanId = (
  basePlanId: string,
  title: string,
  minProducts: number,
  maxProducts: number
) => `${slugify(basePlanId)}-${slugify(title)}-${minProducts}-${maxProducts}`;

const buildPricingOptionId = (
  durationUnitName: string,
  periodInMonths: number
) => `${slugify(durationUnitName)}-${periodInMonths}`;

const buildCountryPricingId = (countryName: string, currencyCode: string) =>
  `${slugify(countryName)}-${slugify(currencyCode)}`;

const timestampNow = () => admin.firestore.Timestamp.now();

const inferMonthsFromText = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.toLowerCase();
  const monthsMatch = normalizedValue.match(/(\d+)\s*month/);

  if (monthsMatch) {
    return Number(monthsMatch[1]);
  }

  const yearsMatch = normalizedValue.match(/(\d+)\s*year/);

  if (yearsMatch) {
    return Number(yearsMatch[1]) * 12;
  }

  return null;
};

const normalizeDiscountPercentage = (value: unknown) => {
  const parsedValue = Number(value ?? 0);

  if (!Number.isFinite(parsedValue)) {
    return 0;
  }

  return Math.min(100, Math.max(0, parsedValue));
};

const removeUndefinedDeep = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((entry) => removeUndefinedDeep(entry)) as T;
  }

  if (value && typeof value === "object") {
    const cleanedEntries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([entryKey, entryValue]) => [entryKey, removeUndefinedDeep(entryValue)]);

    return Object.fromEntries(cleanedEntries) as T;
  }

  return value;
};

const normalizeCountryPricing = (
  countryPricing: unknown
): SubscriptionCountryPricing[] => {
  if (!Array.isArray(countryPricing)) {
    return [];
  }

  const normalizedEntries: SubscriptionCountryPricing[] = [];

  for (const entry of countryPricing) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const candidate = entry as Record<string, unknown>;
    const countryName = String(candidate.countryName ?? "").trim();
    const currencyCode = String(candidate.currencyCode ?? "")
      .trim()
      .toUpperCase();
    const price = Number(candidate.price);

    if (
      countryName === "" ||
      currencyCode === "" ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      continue;
    }

    normalizedEntries.push({
      id:
        typeof candidate.id === "string" && candidate.id.trim() !== ""
          ? candidate.id
          : buildCountryPricingId(countryName, currencyCode),
      countryCode: String(candidate.countryCode ?? "")
        .trim()
        .toUpperCase(),
      countryName,
      currencyCode,
      price,
      discountPercentage: normalizeDiscountPercentage(candidate.discountPercentage),
    });
  }

  return normalizedEntries;
};

const normalizePricingOptions = (
  pricingOptions: unknown,
  legacyPlan?: Record<string, unknown>
): SubscriptionPortfolioPlanPricingOption[] => {
  if (Array.isArray(pricingOptions)) {
    const normalizedOptions: SubscriptionPortfolioPlanPricingOption[] = [];

    pricingOptions.forEach((option, index) => {
      if (!option || typeof option !== "object") {
        return;
      }

      const candidate = option as Record<string, unknown>;
      const periodInMonths = Number(candidate.periodInMonths);
      const price = Number(candidate.price);
      const durationUnitName = String(candidate.durationUnitName ?? "").trim();

      if (
        !Number.isFinite(periodInMonths) ||
        periodInMonths <= 0 ||
        !Number.isFinite(price) ||
        price < 0 ||
        durationUnitName === ""
      ) {
        return;
      }

      normalizedOptions.push({
        id:
          typeof candidate.id === "string" && candidate.id.trim() !== ""
            ? candidate.id
            : buildPricingOptionId(durationUnitName, periodInMonths + index),
        periodInMonths,
        price,
        durationUnitName,
        discountPercentage: normalizeDiscountPercentage(
          candidate.discountPercentage
        ),
        countryPricing: normalizeCountryPricing(candidate.countryPricing),
      });
    });

    return normalizedOptions;
  }

  if (!legacyPlan) {
    return [];
  }

  const legacyOptions: SubscriptionPortfolioPlanPricingOption[] = [];
  const regularPrice = Number(legacyPlan.regularPrice);
  const regularPeriodInMonths = Number(legacyPlan.periodInMonths);

  if (
    Number.isFinite(regularPrice) &&
    regularPrice >= 0 &&
    Number.isFinite(regularPeriodInMonths) &&
    regularPeriodInMonths > 0
  ) {
    legacyOptions.push({
      id: buildPricingOptionId("price", regularPeriodInMonths),
      periodInMonths: regularPeriodInMonths,
      price: regularPrice,
      durationUnitName: "Price",
      discountPercentage: 0,
      countryPricing: [],
    });
  }

  const founderLockPrice = Number(legacyPlan.founderLockPrice);
  const founderLockPeriod =
    inferMonthsFromText(legacyPlan.founderLockPriceText) ??
    inferMonthsFromText(legacyPlan.displayText) ??
    36;

  if (Number.isFinite(founderLockPrice) && founderLockPrice >= 0) {
    legacyOptions.push({
      id: buildPricingOptionId("founder-lock", founderLockPeriod),
      periodInMonths: founderLockPeriod,
      price: founderLockPrice,
      durationUnitName: "Founder Lock",
      discountPercentage: 0,
      countryPricing: [],
    });
  }

  return legacyOptions;
};

const normalizePortfolioPlans = (
  portfolioPlans: unknown
): SubscriptionPortfolioPlan[] => {
  if (!Array.isArray(portfolioPlans)) {
    return [];
  }

  const normalizedPlans: Array<SubscriptionPortfolioPlan | null> = portfolioPlans.map(
    (plan) => {
      if (!plan || typeof plan !== "object") {
        return null;
      }

      const candidate = plan as Record<string, unknown>;

      if (
        typeof candidate.id !== "string" ||
        typeof candidate.basePlanId !== "string" ||
        typeof candidate.basePlanName !== "string" ||
        typeof candidate.title !== "string"
      ) {
        return null;
      }

      return {
        id: candidate.id,
        basePlanId: candidate.basePlanId,
        basePlanName: candidate.basePlanName,
        title: candidate.title,
        minProducts: Number(candidate.minProducts ?? 0),
        maxProducts: Number(candidate.maxProducts ?? 0),
        pricingOptions: normalizePricingOptions(candidate.pricingOptions, candidate),
        isActive: Boolean(candidate.isActive),
        sortOrder: Number(candidate.sortOrder ?? 0),
        createdAt: candidate.createdAt,
        updatedAt: candidate.updatedAt,
      };
    }
  );

  return normalizedPlans.filter(
    (plan): plan is SubscriptionPortfolioPlan => plan !== null
  );
};

const normalizePlanPeriods = (periods: unknown): SubscriptionPlanPeriod[] => {
  if (!Array.isArray(periods)) {
    return [];
  }

  const normalizedPeriods: SubscriptionPlanPeriod[] = [];

  periods.forEach((period, index) => {
    if (!period || typeof period !== "object") {
      return;
    }

    const candidate = period as Record<string, unknown>;
    const label = String(candidate.label ?? "").trim();
    const durationInMonths = Number(candidate.durationInMonths);
    const price = Number(candidate.price);

    if (
      label === "" ||
      !Number.isFinite(durationInMonths) ||
      durationInMonths <= 0 ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      return;
    }

    normalizedPeriods.push({
      id:
        typeof candidate.id === "string" && candidate.id.trim() !== ""
          ? candidate.id
          : `period-${index + 1}`,
      label,
      durationInMonths,
      durationInDays: Number.isFinite(Number(candidate.durationInDays))
        ? Number(candidate.durationInDays)
        : undefined,
      price,
      discountPercentage: normalizeDiscountPercentage(candidate.discountPercentage),
      countryPricing: normalizeCountryPricing(candidate.countryPricing),
    });
  });

  return normalizedPeriods;
};

const validateCountryPricing = (countryPricing: CountryPricingPayload[] | undefined) => {
  if (!Array.isArray(countryPricing) || countryPricing.length === 0) {
    return [];
  }

  const seenCountries = new Set<string>();

  return countryPricing.map((entry) => {
    const countryName = assertNonEmptyString(
      entry.countryName,
      "Each country pricing row needs a country name"
    );
    const currencyCode = assertNonEmptyString(
      entry.currencyCode,
      "Each country pricing row needs a currency code"
    ).toUpperCase();
    const price = assertNumber(
      entry.price,
      "Each country price value must be zero or positive",
      { min: 0 }
    );
    const discountPercentage = assertNumber(
      entry.discountPercentage ?? 0,
      "Each country discount percentage must stay between 0 and 100",
      { min: 0, max: 100 }
    );
    const countryKey = `${String(entry.countryCode ?? "")
      .trim()
      .toLowerCase()}-${countryName.toLowerCase()}`;

    if (seenCountries.has(countryKey)) {
      throw new Error(`Duplicate country pricing found for ${countryName}`);
    }

    seenCountries.add(countryKey);

    return {
      id: buildCountryPricingId(countryName, currencyCode),
      countryCode: String(entry.countryCode ?? "")
        .trim()
        .toUpperCase(),
      countryName,
      currencyCode,
      price,
      discountPercentage,
    };
  });
};

const validatePricingOptions = (
  pricingOptions: PortfolioPlanPricingOptionPayload[]
) => {
  if (!Array.isArray(pricingOptions) || pricingOptions.length === 0) {
    throw new Error("At least one pricing option is required");
  }

  const seenPeriods = new Set<number>();

  return pricingOptions.map((option) => {
    const periodInMonths = assertNumber(
      option.periodInMonths,
      "Each period in months value must be a positive number",
      { min: 1 }
    );
    const price = assertNumber(
      option.price,
      "Each price value must be zero or positive",
      { min: 0 }
    );
    const durationUnitName = assertNonEmptyString(
      option.durationUnitName,
      "Each duration unit name is required"
    );
    const discountPercentage = assertNumber(
      option.discountPercentage ?? 0,
      "Each discount percentage must stay between 0 and 100",
      { min: 0, max: 100 }
    );
    const countryPricing = validateCountryPricing(option.countryPricing);

    if (seenPeriods.has(periodInMonths)) {
      throw new Error(
        `Duplicate period in months value found: ${periodInMonths}`
      );
    }

    seenPeriods.add(periodInMonths);

    return {
      id: buildPricingOptionId(durationUnitName, periodInMonths),
      periodInMonths,
      price,
      durationUnitName,
      discountPercentage,
      countryPricing,
    };
  });
};

const validatePlanPeriods = (periods: SubscriptionPlanPeriod[]) => {
  if (!Array.isArray(periods) || periods.length === 0) {
    throw new Error("At least one period is required");
  }

  const seenPeriods = new Set<number>();

  return periods.map((period, index) => {
    const label = assertNonEmptyString(period.label, "Each period label is required");
    const durationInMonths = assertNumber(
      period.durationInMonths,
      "Each duration in months value must be a positive number",
      { min: 1 }
    );
    const price = assertNumber(
      period.price,
      "Each price value must be zero or positive",
      { min: 0 }
    );
    const discountPercentage = assertNumber(
      period.discountPercentage ?? 0,
      "Each discount percentage must stay between 0 and 100",
      { min: 0, max: 100 }
    );
    const countryPricing = validateCountryPricing(period.countryPricing);

    if (seenPeriods.has(durationInMonths)) {
      throw new Error(`Duplicate duration found: ${durationInMonths} months`);
    }

    seenPeriods.add(durationInMonths);

    return removeUndefinedDeep({
      id:
        typeof period.id === "string" && period.id.trim() !== ""
          ? period.id
          : `period-${index + 1}`,
      label,
      durationInMonths,
      durationInDays: Number.isFinite(Number(period.durationInDays))
        ? Number(period.durationInDays)
        : undefined,
      price,
      discountPercentage,
      countryPricing,
    });
  });
};

const validatePortfolioPlanPayload = (payload: PortfolioPlanPayload) => {
  const basePlanId = assertNonEmptyString(
    payload.basePlanId,
    "Base plan is required"
  );
  const title = assertNonEmptyString(
    payload.title,
    "Portfolio plan title is required"
  );
  const minProducts = assertNumber(
    payload.minProducts,
    "Min product count must be a positive number",
    { min: 1 }
  );
  const maxProducts = assertNumber(
    payload.maxProducts,
    "Max product count must be greater than or equal to min product count",
    { min: minProducts }
  );
  const pricingOptions = validatePricingOptions(payload.pricingOptions);
  const isActive = Boolean(payload.isActive);
  const sortOrder = Number.isFinite(Number(payload.sortOrder))
    ? Number(payload.sortOrder)
    : undefined;

  return {
    basePlanId,
    title,
    minProducts,
    maxProducts,
    pricingOptions,
    isActive,
    sortOrder,
  };
};

const validatePortfolioRangeConflicts = (
  portfolioPlans: SubscriptionPortfolioPlan[],
  candidate: {
    id: string;
    minProducts: number;
    maxProducts: number;
  }
) => {
  const duplicateRange = portfolioPlans.find(
    (plan) =>
      plan.id !== candidate.id &&
      plan.minProducts === candidate.minProducts &&
      plan.maxProducts === candidate.maxProducts
  );

  if (duplicateRange) {
    throw new Error(
      `Range ${candidate.minProducts}-${candidate.maxProducts} already exists for this base plan`
    );
  }

  const overlappingRange = portfolioPlans.find(
    (plan) =>
      plan.id !== candidate.id &&
      rangesOverlap(
        plan.minProducts,
        plan.maxProducts,
        candidate.minProducts,
        candidate.maxProducts
      )
  );

  if (overlappingRange) {
    throw new Error(
      `Range ${candidate.minProducts}-${candidate.maxProducts} overlaps with existing range ${overlappingRange.minProducts}-${overlappingRange.maxProducts}`
    );
  }
};

const resolveNextSortOrder = async () => {
  const snapshot = await db
    .collection(COLLECTION)
    .orderBy("sortOrder", "desc")
    .limit(1)
    .get();

  const highestSortOrder = Number(snapshot.docs[0]?.data()?.sortOrder);

  return Number.isFinite(highestSortOrder) ? highestSortOrder + 1 : 1;
};

const resolveNextPortfolioSortOrder = (
  portfolioPlans: SubscriptionPortfolioPlan[]
) => {
  const highestSortOrder = portfolioPlans.reduce((highest, plan) => {
    const currentSortOrder = Number(plan.sortOrder);
    return Number.isFinite(currentSortOrder) && currentSortOrder > highest
      ? currentSortOrder
      : highest;
  }, 0);

  return highestSortOrder + 1;
};

export const getAllSubscriptionPlans = async () => {
  const snapshot = await db
    .collection(COLLECTION)
    .orderBy("createdAt", "asc")
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data() as SubscriptionPlanRecord;

    return {
      id: doc.id,
      ...data,
      periods: normalizePlanPeriods(data.periods),
      portfolioPlans: normalizePortfolioPlans(data.portfolioPlans),
    };
  });
};

export const getSubscriptionPlanById = async (planId: string) => {
  const doc = await db.collection(COLLECTION).doc(planId).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data() as SubscriptionPlanRecord;

  return {
    id: doc.id,
    ...data,
    periods: normalizePlanPeriods(data.periods),
    portfolioPlans: normalizePortfolioPlans(data.portfolioPlans),
  };
};

export const createSubscriptionPlan = async (
  payload: SubscriptionPlanPayload
) => {
  const validatedPeriods = validatePlanPeriods(payload.periods);

  const ref = db.collection(COLLECTION).doc(payload.slug);
  const nextSortOrder = Number.isFinite(Number(payload.sortOrder))
    ? Number(payload.sortOrder)
    : await resolveNextSortOrder();

  await ref.set({
    name: payload.name,
    slug: payload.slug,
    sortOrder: nextSortOrder,
    periods: validatedPeriods,
    features: payload.features,
    isActive: payload.isActive,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return payload.slug;
};

export const updateSubscriptionPlan = async (
  planId: string,
  payload: Partial<SubscriptionPlanPayload>
) => {
  if (payload.periods && payload.periods.length === 0) {
    throw new Error("Plan must have at least one period");
  }

  const ref = db.collection(COLLECTION).doc(planId);
  const nextPayload = removeUndefinedDeep({
    ...payload,
    periods: payload.periods ? validatePlanPeriods(payload.periods) : undefined,
  });

  await ref.update({
    ...nextPayload,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
};

export const createPortfolioPlan = async (
  payload: PortfolioPlanPayload
): Promise<SubscriptionPortfolioPlan> => {
  const validated = validatePortfolioPlanPayload(payload);
  const ref = db.collection(COLLECTION).doc(validated.basePlanId);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);

    if (!snapshot.exists) {
      throw new Error("Base plan not found");
    }

    const planData = snapshot.data() as SubscriptionPlanRecord;
    const existingPortfolioPlans = normalizePortfolioPlans(
      planData.portfolioPlans
    );
    const portfolioPlanId = buildPortfolioPlanId(
      validated.basePlanId,
      validated.title,
      validated.minProducts,
      validated.maxProducts
    );

    validatePortfolioRangeConflicts(existingPortfolioPlans, {
      id: portfolioPlanId,
      minProducts: validated.minProducts,
      maxProducts: validated.maxProducts,
    });

    const portfolioPlan: SubscriptionPortfolioPlan = {
      ...validated,
      id: portfolioPlanId,
      basePlanName: planData.name,
      sortOrder:
        validated.sortOrder ??
        resolveNextPortfolioSortOrder(existingPortfolioPlans),
      createdAt: timestampNow(),
      updatedAt: timestampNow(),
    };

    transaction.update(ref, {
      portfolioPlans: [...existingPortfolioPlans, portfolioPlan],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return portfolioPlan;
  });
};

export const updatePortfolioPlan = async (
  basePlanId: string,
  portfolioPlanId: string,
  payload: PortfolioPlanPayload
): Promise<SubscriptionPortfolioPlan> => {
  const validated = validatePortfolioPlanPayload(payload);

  if (validated.basePlanId !== basePlanId) {
    throw new Error("Base plan cannot be changed for an existing portfolio plan");
  }

  const ref = db.collection(COLLECTION).doc(basePlanId);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);

    if (!snapshot.exists) {
      throw new Error("Base plan not found");
    }

    const planData = snapshot.data() as SubscriptionPlanRecord;
    const existingPortfolioPlans = normalizePortfolioPlans(
      planData.portfolioPlans
    );
    const currentPortfolioPlan = existingPortfolioPlans.find(
      (plan) => plan.id === portfolioPlanId
    );

    if (!currentPortfolioPlan) {
      throw new Error("Portfolio plan not found");
    }

    validatePortfolioRangeConflicts(existingPortfolioPlans, {
      id: portfolioPlanId,
      minProducts: validated.minProducts,
      maxProducts: validated.maxProducts,
    });

    const updatedPortfolioPlan: SubscriptionPortfolioPlan = {
      ...currentPortfolioPlan,
      ...validated,
      id: portfolioPlanId,
      basePlanName: planData.name,
      sortOrder: validated.sortOrder ?? currentPortfolioPlan.sortOrder ?? 1,
      updatedAt: timestampNow(),
    };

    transaction.update(ref, {
      portfolioPlans: existingPortfolioPlans.map((plan) =>
        plan.id === portfolioPlanId ? updatedPortfolioPlan : plan
      ),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return updatedPortfolioPlan;
  });
};

export const setPortfolioPlanActiveState = async (
  basePlanId: string,
  portfolioPlanId: string,
  isActive: boolean
): Promise<SubscriptionPortfolioPlan> => {
  const ref = db.collection(COLLECTION).doc(basePlanId);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);

    if (!snapshot.exists) {
      throw new Error("Base plan not found");
    }

    const planData = snapshot.data() as SubscriptionPlanRecord;
    const existingPortfolioPlans = normalizePortfolioPlans(
      planData.portfolioPlans
    );
    const currentPortfolioPlan = existingPortfolioPlans.find(
      (plan) => plan.id === portfolioPlanId
    );

    if (!currentPortfolioPlan) {
      throw new Error("Portfolio plan not found");
    }

    const updatedPortfolioPlan: SubscriptionPortfolioPlan = {
      ...currentPortfolioPlan,
      isActive,
      updatedAt: timestampNow(),
    };

    transaction.update(ref, {
      portfolioPlans: existingPortfolioPlans.map((plan) =>
        plan.id === portfolioPlanId ? updatedPortfolioPlan : plan
      ),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return updatedPortfolioPlan;
  });
};

export const seedPortfolioPlans = async () => {
  const plansById = new Map<string, SubscriptionPortfolioPlan[]>();

  for (const seed of PORTFOLIO_PLAN_SEEDS) {
    const ref = db.collection(COLLECTION).doc(seed.basePlanId);

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);

      if (!snapshot.exists) {
        return;
      }

      const planData = snapshot.data() as SubscriptionPlanRecord;
      const existingPortfolioPlans = normalizePortfolioPlans(
        planData.portfolioPlans
      );
      const alreadyExists = existingPortfolioPlans.some(
        (plan) =>
          plan.minProducts === seed.minProducts &&
          plan.maxProducts === seed.maxProducts &&
          plan.title.trim().toLowerCase() === seed.title.trim().toLowerCase()
      );

      if (alreadyExists) {
        plansById.set(seed.basePlanId, existingPortfolioPlans);
        return;
      }

      const portfolioPlanId = buildPortfolioPlanId(
        seed.basePlanId,
        seed.title,
        seed.minProducts,
        seed.maxProducts
      );

      validatePortfolioRangeConflicts(existingPortfolioPlans, {
        id: portfolioPlanId,
        minProducts: seed.minProducts,
        maxProducts: seed.maxProducts,
      });

      const portfolioPlan: SubscriptionPortfolioPlan = {
        ...validatePortfolioPlanPayload(seed),
        id: portfolioPlanId,
        basePlanName: planData.name,
        sortOrder:
          seed.sortOrder ?? resolveNextPortfolioSortOrder(existingPortfolioPlans),
        createdAt: timestampNow(),
        updatedAt: timestampNow(),
      };
      const nextPortfolioPlans = [...existingPortfolioPlans, portfolioPlan];

      transaction.update(ref, {
        portfolioPlans: nextPortfolioPlans,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      plansById.set(seed.basePlanId, nextPortfolioPlans);
    });
  }

  return plansById;
};

export const deleteSubscriptionPlan = async (planId: string) => {
  await db.collection(COLLECTION).doc(planId).delete();
};

export const isSubscriptionPlanInUse = async (planId: string) => {
  const snapshot = await admin
    .firestore()
    .collection("products")
    .where("subscription.planId", "==", planId)
    .limit(1)
    .get();

  return !snapshot.empty;
};
