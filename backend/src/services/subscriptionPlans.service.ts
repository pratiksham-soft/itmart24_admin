import admin from "firebase-admin";

const db = admin.firestore();
const COLLECTION = "subscription_plans";

export type SubscriptionPlanPayload = {
    name: string;
    slug: string;
    periods: {
        id: string;
        label: string;
        durationInMonths: number;
		durationInDays: number;
        price: number;
    }[];
    features: string[];
    isActive: boolean;
};


export const getAllSubscriptionPlans = async () => {
    const snapshot = await db
        .collection(COLLECTION)
        .orderBy("createdAt", "asc")
        .get();

    return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
    }));
};

export const getSubscriptionPlanById = async (planId: string) => {
    const doc = await db.collection(COLLECTION).doc(planId).get();

    if (!doc.exists) {
        return null;
    }

    return {
        id: doc.id,
        ...doc.data(),
    };
};

export const createSubscriptionPlan = async (
    payload: SubscriptionPlanPayload
) => {
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

  await ref.update({
    ...payload,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
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
