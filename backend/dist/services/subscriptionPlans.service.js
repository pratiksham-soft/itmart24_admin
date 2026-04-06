"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSubscriptionPlanInUse = exports.deleteSubscriptionPlan = exports.updateSubscriptionPlan = exports.createSubscriptionPlan = exports.getSubscriptionPlanById = exports.getAllSubscriptionPlans = void 0;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const db = firebase_admin_1.default.firestore();
const COLLECTION = "subscription_plans";
const getAllSubscriptionPlans = async () => {
    const snapshot = await db
        .collection(COLLECTION)
        .orderBy("createdAt", "asc")
        .get();
    return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
    }));
};
exports.getAllSubscriptionPlans = getAllSubscriptionPlans;
const getSubscriptionPlanById = async (planId) => {
    const doc = await db.collection(COLLECTION).doc(planId).get();
    if (!doc.exists) {
        return null;
    }
    return {
        id: doc.id,
        ...doc.data(),
    };
};
exports.getSubscriptionPlanById = getSubscriptionPlanById;
const createSubscriptionPlan = async (payload) => {
    if (!payload.periods || payload.periods.length === 0) {
        throw new Error("At least one period is required");
    }
    const ref = db.collection(COLLECTION).doc(payload.slug);
    await ref.set({
        name: payload.name,
        slug: payload.slug,
        periods: payload.periods,
        features: payload.features,
        isActive: payload.isActive,
        createdAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp(),
    });
    return payload.slug;
};
exports.createSubscriptionPlan = createSubscriptionPlan;
const updateSubscriptionPlan = async (planId, payload) => {
    if (payload.periods && payload.periods.length === 0) {
        throw new Error("Plan must have at least one period");
    }
    const ref = db.collection(COLLECTION).doc(planId);
    await ref.update({
        ...payload,
        updatedAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp(),
    });
};
exports.updateSubscriptionPlan = updateSubscriptionPlan;
const deleteSubscriptionPlan = async (planId) => {
    await db.collection(COLLECTION).doc(planId).delete();
};
exports.deleteSubscriptionPlan = deleteSubscriptionPlan;
const isSubscriptionPlanInUse = async (planId) => {
    const snapshot = await firebase_admin_1.default
        .firestore()
        .collection("products")
        .where("subscription.planId", "==", planId)
        .limit(1)
        .get();
    return !snapshot.empty;
};
exports.isSubscriptionPlanInUse = isSubscriptionPlanInUse;
