"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertMonthlyTarget = exports.getMonthlyTargetByMonth = exports.getMonthlyTargets = exports.getMonthlyTargetRecommendation = void 0;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const firebase_1 = require("../config/firebase");
const dashboard_service_1 = require("./dashboard.service");
const COLLECTION = "monthly_targets";
const addMonthsToMonthKey = (monthKey, delta) => {
    const current = (0, dashboard_service_1.parseMonthKey)(monthKey);
    const next = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + delta, 1));
    const year = next.getUTCFullYear();
    const month = String(next.getUTCMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
};
const roundToTwo = (value) => Math.round(value * 100) / 100;
const sanitizeTargetNumber = (value, { integer = false } = {}) => {
    const numericValue = Number(value ?? 0);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
        return 0;
    }
    return integer ? Math.round(numericValue) : roundToTwo(numericValue);
};
const sanitizeStatus = (value) => {
    const normalized = String(value ?? "").trim().toLowerCase();
    if (["draft", "active", "closed"].includes(normalized)) {
        return normalized;
    }
    return "draft";
};
const toComparableTargetRecord = (value) => JSON.stringify(value ?? null);
const getMonthlyTargetRecommendation = async (monthKey) => {
    (0, dashboard_service_1.parseMonthKey)(monthKey);
    const collections = await (0, dashboard_service_1.fetchDashboardCollections)();
    const previousMonth = addMonthsToMonthKey(monthKey, -1);
    const baseline = (0, dashboard_service_1.computeMonthlyAchievement)(previousMonth, collections);
    const suggestion = (0, dashboard_service_1.buildSuggestedMonthlyTarget)(baseline);
    const actual = (0, dashboard_service_1.computeMonthlyAchievement)(monthKey, collections);
    return {
        month: monthKey,
        label: (0, dashboard_service_1.formatMonthLabel)(monthKey),
        baseline: {
            month: previousMonth,
            label: (0, dashboard_service_1.formatMonthLabel)(previousMonth),
            ...baseline,
        },
        suggested: suggestion,
        actual,
    };
};
exports.getMonthlyTargetRecommendation = getMonthlyTargetRecommendation;
const getMonthlyTargets = async () => {
    const [snapshot, collections] = await Promise.all([
        firebase_1.firestore.collection(COLLECTION).orderBy("month", "desc").get(),
        (0, dashboard_service_1.fetchDashboardCollections)(),
    ]);
    return snapshot.docs.map((doc) => {
        const record = doc.data();
        const actual = (0, dashboard_service_1.computeMonthlyAchievement)(record.month, collections);
        const progressPct = record.targetRevenue > 0
            ? Math.min(100, roundToTwo((actual.revenue / record.targetRevenue) * 100))
            : 0;
        return {
            id: doc.id,
            ...record,
            label: (0, dashboard_service_1.formatMonthLabel)(record.month),
            actual,
            progressPct,
            createdAt: (0, dashboard_service_1.toIsoString)(record.createdAt),
            updatedAt: (0, dashboard_service_1.toIsoString)(record.updatedAt),
        };
    });
};
exports.getMonthlyTargets = getMonthlyTargets;
const getMonthlyTargetByMonth = async (monthKey) => {
    (0, dashboard_service_1.parseMonthKey)(monthKey);
    const [snapshot, recommendation] = await Promise.all([
        firebase_1.firestore.collection(COLLECTION).doc(monthKey).get(),
        (0, exports.getMonthlyTargetRecommendation)(monthKey),
    ]);
    if (!snapshot.exists) {
        return null;
    }
    const record = snapshot.data();
    const progressPct = record.targetRevenue > 0
        ? Math.min(100, roundToTwo((recommendation.actual.revenue / record.targetRevenue) * 100))
        : 0;
    return {
        id: snapshot.id,
        ...record,
        label: (0, dashboard_service_1.formatMonthLabel)(monthKey),
        actual: recommendation.actual,
        progressPct,
        createdAt: (0, dashboard_service_1.toIsoString)(record.createdAt),
        updatedAt: (0, dashboard_service_1.toIsoString)(record.updatedAt),
    };
};
exports.getMonthlyTargetByMonth = getMonthlyTargetByMonth;
const upsertMonthlyTarget = async (monthKey, payload) => {
    (0, dashboard_service_1.parseMonthKey)(monthKey);
    (0, dashboard_service_1.getMonthRange)(monthKey);
    const recommendation = await (0, exports.getMonthlyTargetRecommendation)(monthKey);
    const targetRevenue = sanitizeTargetNumber(payload.targetRevenue);
    const targetSubscriptions = sanitizeTargetNumber(payload.targetSubscriptions, {
        integer: true,
    });
    const targetVendorOnboarding = sanitizeTargetNumber(payload.targetVendorOnboarding, {
        integer: true,
    });
    const suggested = recommendation.suggested;
    const manualOverride = targetRevenue !== suggested.targetRevenue ||
        targetSubscriptions !== suggested.targetSubscriptions ||
        targetVendorOnboarding !== suggested.targetVendorOnboarding;
    const document = {
        month: monthKey,
        targetRevenue,
        targetSubscriptions,
        targetVendorOnboarding,
        remarks: String(payload.remarks ?? "").trim(),
        status: sanitizeStatus(payload.status),
        baseline: {
            month: recommendation.baseline.month,
            revenue: recommendation.baseline.revenue,
            subscriptions: recommendation.baseline.subscriptions,
            vendorOnboarding: recommendation.baseline.vendorOnboarding,
        },
        suggested,
        manualOverride,
    };
    const targetRef = firebase_1.firestore.collection(COLLECTION).doc(monthKey);
    const existing = await targetRef.get();
    const nextDocument = {
        ...document,
        createdAt: existing.exists
            ? existing.data()?.createdAt ?? firebase_admin_1.default.firestore.FieldValue.serverTimestamp()
            : firebase_admin_1.default.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp(),
    };
    if (existing.exists &&
        toComparableTargetRecord({
            month: existing.data()?.month,
            targetRevenue: existing.data()?.targetRevenue,
            targetSubscriptions: existing.data()?.targetSubscriptions,
            targetVendorOnboarding: existing.data()?.targetVendorOnboarding,
            remarks: existing.data()?.remarks,
            status: existing.data()?.status,
            baseline: existing.data()?.baseline,
            suggested: existing.data()?.suggested,
            manualOverride: existing.data()?.manualOverride,
        }) === toComparableTargetRecord(document)) {
        return (0, exports.getMonthlyTargetByMonth)(monthKey);
    }
    await targetRef.set(nextDocument, { merge: true });
    return (0, exports.getMonthlyTargetByMonth)(monthKey);
};
exports.upsertMonthlyTarget = upsertMonthlyTarget;
