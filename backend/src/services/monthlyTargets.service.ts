import admin from "firebase-admin";
import { firestore } from "../config/firebase";
import {
  buildSuggestedMonthlyTarget,
  computeMonthlyAchievement,
  fetchDashboardCollections,
  formatMonthLabel,
  getMonthRange,
  parseMonthKey,
  toIsoString,
} from "./dashboard.service";

type StoredMonthlyTarget = {
  month: string;
  targetRevenue: number;
  targetSubscriptions: number;
  targetVendorOnboarding: number;
  remarks: string;
  status: string;
  baseline: {
    month: string;
    revenue: number;
    subscriptions: number;
    vendorOnboarding: number;
  };
  suggested: {
    targetRevenue: number;
    targetSubscriptions: number;
    targetVendorOnboarding: number;
  };
  manualOverride: boolean;
  createdAt?: admin.firestore.Timestamp | Date | string | number | null;
  updatedAt?: admin.firestore.Timestamp | Date | string | number | null;
};

const COLLECTION = "monthly_targets";

const addMonthsToMonthKey = (monthKey: string, delta: number) => {
  const current = parseMonthKey(monthKey);
  const next = new Date(
    Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + delta, 1)
  );

  const year = next.getUTCFullYear();
  const month = String(next.getUTCMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
};

const roundToTwo = (value: number) => Math.round(value * 100) / 100;

const sanitizeTargetNumber = (value: unknown, { integer = false } = {}) => {
  const numericValue = Number(value ?? 0);

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return 0;
  }

  return integer ? Math.round(numericValue) : roundToTwo(numericValue);
};

const sanitizeStatus = (value: unknown) => {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (["draft", "active", "closed"].includes(normalized)) {
    return normalized;
  }

  return "draft";
};

const toComparableTargetRecord = (value: unknown) =>
  JSON.stringify(value ?? null);

export const getMonthlyTargetRecommendation = async (monthKey: string) => {
  parseMonthKey(monthKey);

  const collections = await fetchDashboardCollections();
  const previousMonth = addMonthsToMonthKey(monthKey, -1);
  const baseline = computeMonthlyAchievement(previousMonth, collections);
  const suggestion = buildSuggestedMonthlyTarget(baseline);
  const actual = computeMonthlyAchievement(monthKey, collections);

  return {
    month: monthKey,
    label: formatMonthLabel(monthKey),
    baseline: {
      month: previousMonth,
      label: formatMonthLabel(previousMonth),
      ...baseline,
    },
    suggested: suggestion,
    actual,
  };
};

export const getMonthlyTargets = async () => {
  const [snapshot, collections] = await Promise.all([
    firestore.collection(COLLECTION).orderBy("month", "desc").get(),
    fetchDashboardCollections(),
  ]);

  return snapshot.docs.map((doc) => {
    const record = doc.data() as StoredMonthlyTarget;
    const actual = computeMonthlyAchievement(record.month, collections);
    const progressPct =
      record.targetRevenue > 0
        ? Math.min(100, roundToTwo((actual.revenue / record.targetRevenue) * 100))
        : 0;

    return {
      id: doc.id,
      ...record,
      label: formatMonthLabel(record.month),
      actual,
      progressPct,
      createdAt: toIsoString(record.createdAt),
      updatedAt: toIsoString(record.updatedAt),
    };
  });
};

export const getMonthlyTargetByMonth = async (monthKey: string) => {
  parseMonthKey(monthKey);

  const [snapshot, recommendation] = await Promise.all([
    firestore.collection(COLLECTION).doc(monthKey).get(),
    getMonthlyTargetRecommendation(monthKey),
  ]);

  if (!snapshot.exists) {
    return null;
  }

  const record = snapshot.data() as StoredMonthlyTarget;
  const progressPct =
    record.targetRevenue > 0
      ? Math.min(
          100,
          roundToTwo((recommendation.actual.revenue / record.targetRevenue) * 100)
        )
      : 0;

  return {
    id: snapshot.id,
    ...record,
    label: formatMonthLabel(monthKey),
    actual: recommendation.actual,
    progressPct,
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt),
  };
};

export const upsertMonthlyTarget = async (
  monthKey: string,
  payload: Record<string, unknown>
) => {
  parseMonthKey(monthKey);
  getMonthRange(monthKey);

  const recommendation = await getMonthlyTargetRecommendation(monthKey);
  const targetRevenue = sanitizeTargetNumber(payload.targetRevenue);
  const targetSubscriptions = sanitizeTargetNumber(payload.targetSubscriptions, {
    integer: true,
  });
  const targetVendorOnboarding = sanitizeTargetNumber(
    payload.targetVendorOnboarding,
    {
      integer: true,
    }
  );
  const suggested = recommendation.suggested;
  const manualOverride =
    targetRevenue !== suggested.targetRevenue ||
    targetSubscriptions !== suggested.targetSubscriptions ||
    targetVendorOnboarding !== suggested.targetVendorOnboarding;
  const document: StoredMonthlyTarget = {
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

  const targetRef = firestore.collection(COLLECTION).doc(monthKey);
  const existing = await targetRef.get();
  const nextDocument = {
    ...document,
    createdAt: existing.exists
      ? existing.data()?.createdAt ?? admin.firestore.FieldValue.serverTimestamp()
      : admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (
    existing.exists &&
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
    }) === toComparableTargetRecord(document)
  ) {
    return getMonthlyTargetByMonth(monthKey);
  }

  await targetRef.set(nextDocument, { merge: true });

  return getMonthlyTargetByMonth(monthKey);
};
