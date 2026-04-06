import { Router } from "express";
import admin from "firebase-admin";
import { firestore } from "../config/firebase";

type FirestoreTimestampLike =
  | admin.firestore.Timestamp
  | {
      _seconds?: number;
      _nanoseconds?: number;
    }
  | null
  | undefined;

type FirestoreVendorData = {
  businessName?: string;
  businessType?: string;
  country?: string;
  website?: string;
  address?: string;
  agreement?: boolean;
  contactEmail?: string;
  contactName?: string;
  contactPhone?: string;
  email?: string;
  phone?: string;
  regNo?: string;
  taxNumber?: string;
  taxRegistered?: string;
  onboardingStatus?: string;
  logoUrl?: string;
  coverPhotoUrl?: string;
  introVideoUrl?: string;
  createdAt?: FirestoreTimestampLike;
  updatedAt?: FirestoreTimestampLike;
  media?: {
    companyLogo?: {
      url?: string;
    };
  };
  [key: string]: unknown;
};

const router = Router();

const normalizeTimestamp = (value: FirestoreTimestampLike) => {
  if (!value) {
    return null;
  }

  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }

  if (typeof value._seconds === "number") {
    return new Date(value._seconds * 1000).toISOString();
  }

  return null;
};

const normalizeFirestoreValue = (value: unknown): unknown => {
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeFirestoreValue(item));
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
      (accumulator, [key, nestedValue]) => {
        accumulator[key] = normalizeFirestoreValue(nestedValue);
        return accumulator;
      },
      {}
    );
  }

  return value;
};

const sanitizeUpdatePayload = (
  value: unknown,
  path: string[] = []
): unknown => {
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      sanitizeUpdatePayload(item, [...path, String(index)])
    );
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
      (accumulator, [key, nestedValue]) => {
        if (
          path.length === 0 &&
          ["id", "createdAt", "updatedAt"].includes(key)
        ) {
          return accumulator;
        }

        if (nestedValue === undefined) {
          return accumulator;
        }

        accumulator[key] = sanitizeUpdatePayload(
          nestedValue,
          [...path, key]
        );

        return accumulator;
      },
      {}
    );
  }

  return value;
};

router.get("/", async (_req, res) => {
  try {
    const snapshot = await firestore
      .collection("vendor_profile")
      .get();

    const vendors = snapshot.docs
      .map((doc) => {
        const data = doc.data() as FirestoreVendorData;

        return {
          id: doc.id,
          businessName: data.businessName ?? "",
          businessType: data.businessType ?? "",
          country: data.country ?? "",
          website: data.website ?? "",
          address: data.address ?? "",
          agreement: Boolean(data.agreement),
          contactEmail: data.contactEmail ?? "",
          contactName: data.contactName ?? "",
          contactPhone: data.contactPhone ?? "",
          email: data.email ?? "",
          phone: data.phone ?? "",
          regNo: data.regNo ?? "",
          taxNumber: data.taxNumber ?? "",
          taxRegistered: data.taxRegistered ?? "",
          onboardingStatus: data.onboardingStatus ?? "",
          logoUrl:
            data.logoUrl ??
            data.media?.companyLogo?.url ??
            "",
          coverPhotoUrl: data.coverPhotoUrl ?? "",
          introVideoUrl: data.introVideoUrl ?? "",
          createdAt: normalizeTimestamp(data.createdAt),
          updatedAt: normalizeTimestamp(data.updatedAt),
        };
      })
      .sort((left, right) => {
        const rightTime = right.createdAt
          ? new Date(right.createdAt).getTime()
          : 0;
        const leftTime = left.createdAt
          ? new Date(left.createdAt).getTime()
          : 0;

        return rightTime - leftTime;
      });

    res.json({
      success: true,
      count: vendors.length,
      data: vendors,
    });
  } catch (error) {
    console.error("Failed to fetch vendors:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch vendors",
    });
  }
});

router.get("/:vendorId", async (req, res) => {
  try {
    const vendorDoc = await firestore
      .collection("vendor_profile")
      .doc(req.params.vendorId)
      .get();

    if (!vendorDoc.exists) {
      res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
      return;
    }

    const normalizedVendor = normalizeFirestoreValue(
      vendorDoc.data() ?? {}
    ) as Record<string, unknown>;

    res.json({
      success: true,
      data: {
        id: vendorDoc.id,
        ...normalizedVendor,
      },
    });
  } catch (error) {
    console.error("Failed to fetch vendor details:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch vendor details",
    });
  }
});

router.patch("/:vendorId", async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      res.status(400).json({
        success: false,
        message: "Invalid vendor payload",
      });
      return;
    }

    const vendorRef = firestore
      .collection("vendor_profile")
      .doc(req.params.vendorId);

    const existingVendor = await vendorRef.get();

    if (!existingVendor.exists) {
      res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
      return;
    }

    const sanitizedPayload = sanitizeUpdatePayload(
      req.body
    ) as Record<string, unknown>;

    await vendorRef.set(
      {
        ...sanitizedPayload,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const updatedVendor = await vendorRef.get();
    const normalizedVendor = normalizeFirestoreValue(
      updatedVendor.data() ?? {}
    ) as Record<string, unknown>;

    res.json({
      success: true,
      message: "Vendor updated successfully",
      data: {
        id: updatedVendor.id,
        ...normalizedVendor,
      },
    });
  } catch (error) {
    console.error("Failed to update vendor:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update vendor",
    });
  }
});

export default router;
