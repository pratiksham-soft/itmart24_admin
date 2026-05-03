"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGrowthInsights = exports.getDashboardOverview = exports.buildSuggestedMonthlyTarget = exports.computeMonthlyAchievement = exports.fetchDashboardCollections = exports.getMonthRange = exports.parseMonthKey = exports.formatMonthLabel = exports.toIsoString = void 0;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const firebase_1 = require("../config/firebase");
const MONTHLY_TARGETS_COLLECTION = "monthly_targets";
const DASHBOARD_COLLECTIONS_CACHE_TTL_MS = 30 * 1000;
const ACTIVE_VENDOR_STATUSES = new Set(["approved", "active", "verified"]);
const PENDING_VENDOR_STATUSES = new Set([
    "registered",
    "pending",
    "under-review",
    "under_review",
    "review",
]);
const REJECTED_VENDOR_STATUSES = new Set(["rejected", "inactive", "blocked"]);
const PENDING_SUBSCRIPTION_STATUSES = new Set(["pending", "payment_failed"]);
const INACTIVE_SUBSCRIPTION_STATUSES = new Set([
    "expired",
    "cancelled",
    "replaced",
    "refunded",
    "inactive",
]);
const COUNTRY_NAME_ALIASES = {
    usa: "United States",
    us: "United States",
    uae: "United Arab Emirates",
    uk: "United Kingdom",
};
const roundToTwo = (value) => Math.round(value * 100) / 100;
let dashboardCollectionsCache = null;
let dashboardCollectionsPromise = null;
const normalizeText = (value) => String(value ?? "").trim();
const normalizeCountry = (value) => {
    const normalized = normalizeText(value);
    if (!normalized) {
        return "Unspecified";
    }
    const alias = COUNTRY_NAME_ALIASES[normalized.toLowerCase()];
    return alias ?? normalized;
};
const toDate = (value) => {
    if (!value) {
        return null;
    }
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }
    if (value instanceof firebase_admin_1.default.firestore.Timestamp) {
        return value.toDate();
    }
    if (typeof value === "string" || typeof value === "number") {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof value.toDate === "function") {
        const parsed = value.toDate();
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof value.toMillis === "function") {
        const parsed = new Date(value.toMillis());
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof value.seconds === "number") {
        return new Date(value.seconds * 1000);
    }
    if (typeof value._seconds === "number") {
        return new Date(value._seconds * 1000);
    }
    return null;
};
const toIsoString = (value) => toDate(value)?.toISOString() ?? null;
exports.toIsoString = toIsoString;
const startOfMonth = (value) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
const addMonths = (value, delta) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + delta, 1));
const toMonthKey = (value) => {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
};
const formatMonthLabel = (monthKey) => {
    const parsed = (0, exports.parseMonthKey)(monthKey);
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    }).format(parsed);
};
exports.formatMonthLabel = formatMonthLabel;
const parseMonthKey = (monthKey) => {
    const [yearText, monthText] = monthKey.split("-");
    const year = Number(yearText);
    const month = Number(monthText);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error("Month must use YYYY-MM format");
    }
    return new Date(Date.UTC(year, month - 1, 1));
};
exports.parseMonthKey = parseMonthKey;
const getMonthRange = (monthKey) => {
    const start = (0, exports.parseMonthKey)(monthKey);
    const end = addMonths(start, 1);
    return { start, end };
};
exports.getMonthRange = getMonthRange;
const isWithinRange = (value, start, end) => {
    const parsed = toDate(value);
    if (!parsed) {
        return false;
    }
    return parsed >= start && parsed < end;
};
const calculatePercentChange = (current, previous) => {
    if (previous === 0) {
        return current > 0 ? 100 : 0;
    }
    return roundToTwo(((current - previous) / previous) * 100);
};
const getInvoiceAmount = (invoice) => {
    const total = Number(invoice.amounts?.total ?? invoice.amounts?.baseAfterAdjustment ?? 0);
    return Number.isFinite(total) ? total : 0;
};
const getSubscriptionAmount = (subscription) => {
    const paymentAmount = Number(subscription.payment?.amount ?? NaN);
    if (Number.isFinite(paymentAmount) && paymentAmount > 0) {
        return paymentAmount;
    }
    const planAmount = Number(subscription.plan?.price ?? 0);
    return Number.isFinite(planAmount) ? planAmount : 0;
};
const normalizeVendorLifecycle = (status) => {
    const normalized = normalizeText(status).toLowerCase();
    if (ACTIVE_VENDOR_STATUSES.has(normalized)) {
        return "active";
    }
    if (REJECTED_VENDOR_STATUSES.has(normalized)) {
        return "rejected";
    }
    if (PENDING_VENDOR_STATUSES.has(normalized) || !normalized) {
        return "pending";
    }
    return "other";
};
const isVendorIncomplete = (vendor) => {
    const hasLogo = Boolean(normalizeText(vendor.logoUrl)) ||
        Boolean(normalizeText(vendor.media?.companyLogo?.url));
    const requiresTaxNumber = normalizeText(vendor.taxRegistered).toLowerCase() === "yes";
    const requiredValues = [
        vendor.businessName,
        vendor.regNo,
        vendor.address,
        vendor.country,
        vendor.website,
        vendor.contactEmail ?? vendor.email,
        vendor.contactPhone ?? vendor.phone,
    ];
    const hasMissingRequiredField = requiredValues.some((value) => !normalizeText(value));
    if (!Boolean(vendor.agreement)) {
        return true;
    }
    if (hasMissingRequiredField || !hasLogo) {
        return true;
    }
    if (requiresTaxNumber && !normalizeText(vendor.taxNumber)) {
        return true;
    }
    return false;
};
const getSubscriptionLifecycle = (subscription, now = new Date()) => {
    const normalizedStatus = normalizeText(subscription.status).toLowerCase();
    const endDate = toDate(subscription.endDate);
    if (normalizedStatus === "active" && endDate && endDate < now) {
        return "inactive";
    }
    if (normalizedStatus === "active") {
        return "active";
    }
    if (PENDING_SUBSCRIPTION_STATUSES.has(normalizedStatus)) {
        return "pending";
    }
    if (INACTIVE_SUBSCRIPTION_STATUSES.has(normalizedStatus) || normalizedStatus) {
        return "inactive";
    }
    return "inactive";
};
const getSubscriptionSortDate = (subscription) => toDate(subscription.updatedAt) ??
    toDate(subscription.createdAt) ??
    toDate(subscription.startDate) ??
    toDate(subscription.endDate) ??
    new Date(0);
const getSubscriptionActivationDate = (subscription) => toDate(subscription.startDate) ??
    toDate(subscription.updatedAt) ??
    toDate(subscription.createdAt);
const pickLatestSubscriptions = (subscriptions) => {
    const grouped = new Map();
    subscriptions.forEach((subscription) => {
        const key = `${normalizeText(subscription.vendorId)}:${normalizeText(subscription.productId)}`;
        if (!key || key === ":") {
            return;
        }
        const existing = grouped.get(key);
        if (!existing || getSubscriptionSortDate(subscription) > getSubscriptionSortDate(existing)) {
            grouped.set(key, subscription);
        }
    });
    return Array.from(grouped.values());
};
const buildMonthBuckets = (monthsBack, now) => {
    const currentMonthStart = startOfMonth(now);
    const months = [];
    for (let index = monthsBack - 1; index >= 0; index -= 1) {
        const monthDate = addMonths(currentMonthStart, -index);
        const monthKey = toMonthKey(monthDate);
        months.push({
            month: monthKey,
            label: new Intl.DateTimeFormat("en-US", {
                month: "short",
                timeZone: "UTC",
            }).format(monthDate),
            revenue: 0,
            subscriptions: 0,
            vendors: 0,
        });
    }
    return months;
};
const fetchDashboardCollections = async ({ forceRefresh = false, } = {}) => {
    const now = Date.now();
    if (!forceRefresh &&
        dashboardCollectionsCache &&
        now - dashboardCollectionsCache.cachedAt < DASHBOARD_COLLECTIONS_CACHE_TTL_MS) {
        return dashboardCollectionsCache.value;
    }
    if (dashboardCollectionsPromise) {
        return dashboardCollectionsPromise;
    }
    dashboardCollectionsPromise = (async () => {
        const [vendorSnapshot, subscriptionSnapshot, invoiceSnapshot] = await Promise.all([
            firebase_1.firestore
                .collection("vendor_profile")
                .select("businessName", "country", "website", "address", "agreement", "contactEmail", "contactPhone", "email", "phone", "regNo", "taxNumber", "taxRegistered", "onboardingStatus", "logoUrl", "createdAt", "updatedAt", "media.companyLogo.url")
                .get(),
            firebase_1.firestore
                .collection("subscriptions")
                .select("vendorId", "productId", "plan.planId", "plan.planName", "plan.price", "payment.status", "payment.amount", "status", "startDate", "endDate", "createdAt", "updatedAt")
                .get(),
            firebase_1.firestore
                .collection("invoices")
                .select("subscriptionId", "status", "vendor.id", "vendor.name", "product.id", "product.name", "amounts.total", "amounts.baseAfterAdjustment", "paidAt", "createdAt")
                .get(),
        ]);
        const collections = {
            vendors: vendorSnapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            })),
            subscriptions: subscriptionSnapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            })),
            invoices: invoiceSnapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            })),
        };
        dashboardCollectionsCache = {
            value: collections,
            cachedAt: Date.now(),
        };
        return collections;
    })();
    try {
        return await dashboardCollectionsPromise;
    }
    finally {
        dashboardCollectionsPromise = null;
    }
};
exports.fetchDashboardCollections = fetchDashboardCollections;
const computeMonthlyAchievement = (monthKey, collections) => {
    const { start, end } = (0, exports.getMonthRange)(monthKey);
    const revenue = roundToTwo(collections.invoices
        .filter((invoice) => {
        const status = normalizeText(invoice.status).toLowerCase();
        return status === "paid" && isWithinRange(invoice.paidAt ?? invoice.createdAt, start, end);
    })
        .reduce((sum, invoice) => sum + getInvoiceAmount(invoice), 0));
    const activatedSubscriptions = collections.subscriptions.filter((subscription) => {
        const lifecycle = getSubscriptionLifecycle(subscription);
        const activationDate = getSubscriptionActivationDate(subscription);
        return lifecycle !== "pending" && Boolean(activationDate) && isWithinRange(activationDate, start, end);
    }).length;
    const vendorOnboarding = collections.vendors.filter((vendor) => isWithinRange(vendor.createdAt, start, end)).length;
    return {
        revenue,
        subscriptions: activatedSubscriptions,
        vendorOnboarding,
    };
};
exports.computeMonthlyAchievement = computeMonthlyAchievement;
const buildSuggestedMonthlyTarget = (previousAchievement) => ({
    targetRevenue: roundToTwo(previousAchievement.revenue * 1.2),
    targetSubscriptions: Math.ceil(previousAchievement.subscriptions * 1.2),
    targetVendorOnboarding: Math.ceil(previousAchievement.vendorOnboarding * 1.2),
});
exports.buildSuggestedMonthlyTarget = buildSuggestedMonthlyTarget;
const resolveCurrentMonthlyTarget = async (now, collections) => {
    const currentMonth = toMonthKey(startOfMonth(now));
    const previousMonth = toMonthKey(addMonths(startOfMonth(now), -1));
    const [currentTargetSnapshot] = await Promise.all([
        firebase_1.firestore.collection(MONTHLY_TARGETS_COLLECTION).doc(currentMonth).get(),
    ]);
    const previousAchievement = (0, exports.computeMonthlyAchievement)(previousMonth, collections);
    const actualAchievement = (0, exports.computeMonthlyAchievement)(currentMonth, collections);
    const suggestion = (0, exports.buildSuggestedMonthlyTarget)(previousAchievement);
    const currentTarget = currentTargetSnapshot.exists
        ? currentTargetSnapshot.data()
        : null;
    const targetRevenue = Number(currentTarget?.targetRevenue ?? suggestion.targetRevenue ?? 0);
    const progressPct = targetRevenue > 0
        ? Math.min(100, roundToTwo((actualAchievement.revenue / targetRevenue) * 100))
        : 0;
    return {
        month: currentMonth,
        label: (0, exports.formatMonthLabel)(currentMonth),
        status: normalizeText(currentTarget?.status) || "draft",
        isSuggested: !currentTargetSnapshot.exists,
        remarks: normalizeText(currentTarget?.remarks),
        targetRevenue,
        targetSubscriptions: Number(currentTarget?.targetSubscriptions ?? suggestion.targetSubscriptions ?? 0),
        targetVendorOnboarding: Number(currentTarget?.targetVendorOnboarding ?? suggestion.targetVendorOnboarding ?? 0),
        actualRevenue: actualAchievement.revenue,
        actualSubscriptions: actualAchievement.subscriptions,
        actualVendorOnboarding: actualAchievement.vendorOnboarding,
        progressPct,
    };
};
const getDashboardOverview = async () => {
    const now = new Date();
    const collections = await (0, exports.fetchDashboardCollections)();
    const latestSubscriptions = pickLatestSubscriptions(collections.subscriptions);
    const vendorById = new Map(collections.vendors.map((vendor) => [vendor.id, vendor]));
    const subscriptionById = new Map(collections.subscriptions.map((subscription) => [subscription.id, subscription]));
    const monthBuckets = buildMonthBuckets(12, now);
    const monthIndex = new Map(monthBuckets.map((bucket) => [bucket.month, bucket]));
    const currentMonthKey = toMonthKey(startOfMonth(now));
    const previousMonthKey = toMonthKey(addMonths(startOfMonth(now), -1));
    const todayKey = now.toISOString().slice(0, 10);
    let activeVendors = 0;
    let pendingVendors = 0;
    let rejectedVendors = 0;
    let incompleteVendors = 0;
    collections.vendors.forEach((vendor) => {
        const lifecycle = normalizeVendorLifecycle(vendor.onboardingStatus);
        if (lifecycle === "active") {
            activeVendors += 1;
        }
        else if (lifecycle === "rejected") {
            rejectedVendors += 1;
        }
        else {
            pendingVendors += 1;
        }
        if (isVendorIncomplete(vendor)) {
            incompleteVendors += 1;
        }
        const createdAt = toDate(vendor.createdAt);
        if (!createdAt) {
            return;
        }
        const bucket = monthIndex.get(toMonthKey(startOfMonth(createdAt)));
        if (bucket) {
            bucket.vendors += 1;
        }
    });
    let activeSubscriptions = 0;
    let pendingSubscriptions = 0;
    let inactiveSubscriptions = 0;
    const planBreakdown = new Map();
    latestSubscriptions.forEach((subscription) => {
        const lifecycle = getSubscriptionLifecycle(subscription, now);
        const planId = normalizeText(subscription.plan?.planId) || "unmapped-plan";
        const planName = normalizeText(subscription.plan?.planName) || "Unmapped plan";
        const planEntry = planBreakdown.get(planId) ??
            {
                planId,
                planName,
                total: 0,
                active: 0,
                pending: 0,
                inactive: 0,
                revenue: 0,
            };
        planEntry.total += 1;
        if (lifecycle === "active") {
            activeSubscriptions += 1;
            planEntry.active += 1;
        }
        else if (lifecycle === "pending") {
            pendingSubscriptions += 1;
            planEntry.pending += 1;
        }
        else {
            inactiveSubscriptions += 1;
            planEntry.inactive += 1;
        }
        const activationDate = getSubscriptionActivationDate(subscription);
        if (activationDate) {
            const bucket = monthIndex.get(toMonthKey(startOfMonth(activationDate)));
            if (bucket) {
                bucket.subscriptions += 1;
            }
        }
        planBreakdown.set(planId, planEntry);
    });
    let totalRevenue = 0;
    let currentMonthRevenue = 0;
    let previousMonthRevenue = 0;
    let todayRevenue = 0;
    let totalPaidInvoices = 0;
    if (collections.invoices.length > 0) {
        collections.invoices.forEach((invoice) => {
            const status = normalizeText(invoice.status).toLowerCase();
            if (status !== "paid") {
                return;
            }
            const amount = getInvoiceAmount(invoice);
            const paidAt = toDate(invoice.paidAt ?? invoice.createdAt);
            totalRevenue += amount;
            totalPaidInvoices += 1;
            if (paidAt) {
                const monthKey = toMonthKey(startOfMonth(paidAt));
                const bucket = monthIndex.get(monthKey);
                if (bucket) {
                    bucket.revenue = roundToTwo(bucket.revenue + amount);
                }
                if (monthKey === currentMonthKey) {
                    currentMonthRevenue += amount;
                }
                if (monthKey === previousMonthKey) {
                    previousMonthRevenue += amount;
                }
                if (paidAt.toISOString().slice(0, 10) === todayKey) {
                    todayRevenue += amount;
                }
            }
            const subscription = subscriptionById.get(normalizeText(invoice.subscriptionId));
            if (subscription) {
                const planId = normalizeText(subscription.plan?.planId) || "unmapped-plan";
                const planEntry = planBreakdown.get(planId);
                if (planEntry) {
                    planEntry.revenue = roundToTwo(planEntry.revenue + amount);
                }
            }
        });
    }
    else {
        collections.subscriptions.forEach((subscription) => {
            const paymentStatus = normalizeText(subscription.payment?.status).toLowerCase();
            const amount = getSubscriptionAmount(subscription);
            const revenueDate = getSubscriptionActivationDate(subscription);
            if (paymentStatus !== "paid" || !revenueDate) {
                return;
            }
            totalRevenue += amount;
            const monthKey = toMonthKey(startOfMonth(revenueDate));
            const bucket = monthIndex.get(monthKey);
            if (bucket) {
                bucket.revenue = roundToTwo(bucket.revenue + amount);
            }
            if (monthKey === currentMonthKey) {
                currentMonthRevenue += amount;
            }
            if (monthKey === previousMonthKey) {
                previousMonthRevenue += amount;
            }
            if (revenueDate.toISOString().slice(0, 10) === todayKey) {
                todayRevenue += amount;
            }
        });
    }
    const currentMonthNewVendors = monthIndex.get(currentMonthKey)?.vendors ?? 0;
    const previousMonthNewVendors = monthIndex.get(previousMonthKey)?.vendors ?? 0;
    const currentMonthNewSubscriptions = monthIndex.get(currentMonthKey)?.subscriptions ?? 0;
    const previousMonthNewSubscriptions = monthIndex.get(previousMonthKey)?.subscriptions ?? 0;
    const countryCounts = collections.vendors.reduce((accumulator, vendor) => {
        const country = normalizeCountry(vendor.country);
        accumulator.set(country, (accumulator.get(country) ?? 0) + 1);
        return accumulator;
    }, new Map());
    const countryDistribution = Array.from(countryCounts.entries())
        .map(([country, count]) => ({
        country,
        count,
        share: collections.vendors.length
            ? roundToTwo((count / collections.vendors.length) * 100)
            : 0,
    }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 6);
    const recentActivity = [...latestSubscriptions]
        .sort((left, right) => getSubscriptionSortDate(right).getTime() - getSubscriptionSortDate(left).getTime())
        .slice(0, 8)
        .map((subscription) => {
        const vendor = vendorById.get(normalizeText(subscription.vendorId));
        const relatedInvoice = collections.invoices.find((invoice) => normalizeText(invoice.subscriptionId) === subscription.id);
        return {
            id: subscription.id,
            vendorName: normalizeText(vendor?.businessName) ||
                normalizeText(relatedInvoice?.vendor?.name) ||
                "Unknown vendor",
            country: normalizeCountry(vendor?.country),
            planName: normalizeText(subscription.plan?.planName) || "Unmapped plan",
            amount: roundToTwo(relatedInvoice ? getInvoiceAmount(relatedInvoice) : getSubscriptionAmount(subscription)),
            status: getSubscriptionLifecycle(subscription, now),
            paymentStatus: normalizeText(subscription.payment?.status).toLowerCase() || "unpaid",
            productName: normalizeText(relatedInvoice?.product?.name) ||
                `Product ${normalizeText(subscription.productId).slice(0, 8) || "N/A"}`,
            createdAt: (0, exports.toIsoString)(getSubscriptionActivationDate(subscription)),
        };
    });
    const monthlyTarget = await resolveCurrentMonthlyTarget(now, collections);
    return {
        generatedAt: now.toISOString(),
        summary: {
            totalVendors: collections.vendors.length,
            activeVendors,
            pendingVendors,
            rejectedVendors,
            vendorsWithIncompleteDocuments: incompleteVendors,
            totalSubscriptions: latestSubscriptions.length,
            activeSubscriptions,
            pendingSubscriptions,
            inactiveSubscriptions,
            totalRevenue: roundToTwo(totalRevenue),
            currentMonthRevenue: roundToTwo(currentMonthRevenue),
            previousMonthRevenue: roundToTwo(previousMonthRevenue),
            todayRevenue: roundToTwo(todayRevenue),
            totalPaidInvoices,
            pendingPaymentSubscriptions: collections.subscriptions.filter((subscription) => PENDING_SUBSCRIPTION_STATUSES.has(normalizeText(subscription.status).toLowerCase())).length,
            currentMonthNewVendors,
            previousMonthNewVendors,
            currentMonthNewSubscriptions,
            previousMonthNewSubscriptions,
        },
        planBreakdown: Array.from(planBreakdown.values()).sort((left, right) => right.total - left.total),
        monthlyTrends: monthBuckets,
        countryDistribution,
        recentActivity,
        monthlyTarget,
    };
};
exports.getDashboardOverview = getDashboardOverview;
const getGrowthInsights = (overview) => {
    return {
        vendorGrowthPct: calculatePercentChange(overview.summary.currentMonthNewVendors, overview.summary.previousMonthNewVendors),
        subscriptionGrowthPct: calculatePercentChange(overview.summary.currentMonthNewSubscriptions, overview.summary.previousMonthNewSubscriptions),
        revenueGrowthPct: calculatePercentChange(overview.summary.currentMonthRevenue, overview.summary.previousMonthRevenue),
    };
};
exports.getGrowthInsights = getGrowthInsights;
