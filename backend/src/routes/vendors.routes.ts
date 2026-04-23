import { Router } from "express";
import admin from "firebase-admin";
import { firestore } from "../config/firebase";
import { shopifyGraphQL } from "../services/shopifyHttp";

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
  vendorProfileUrl?: string;
  createdAt?: FirestoreTimestampLike;
  updatedAt?: FirestoreTimestampLike;
  media?: {
    companyLogo?: {
      url?: string;
      shopifyFileId?: string;
    };
    coverPhoto?: {
      url?: string;
      shopifyFileId?: string;
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

const getGraphQlErrorMessage = (
  errors?: Array<{ message?: string }> | null,
  fallback = "Shopify request failed"
) => {
  if (!Array.isArray(errors) || errors.length === 0) {
    return fallback;
  }

  const message = errors
    .map((error) => error.message?.trim())
    .filter(Boolean)
    .join(", ");

  return message || fallback;
};

const extractPageHandleFromUrl = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/pages\/([^/?#]+)/i);

    return match?.[1]?.trim() ?? "";
  } catch {
    return "";
  }
};

const deleteShopifyPageByHandle = async (handle: string) => {
  if (!handle) {
    return;
  }

  const pageLookupResponse: {
    data?: {
      data?: {
        pages?: {
          nodes?: Array<{ id?: string | null }>;
        };
      };
      errors?: Array<{ message?: string }>;
    };
  } = await shopifyGraphQL.post("", {
    query: `
      query ExistingVendorPage($first: Int!, $query: String!) {
        pages(first: $first, query: $query) {
          nodes {
            id
          }
        }
      }
    `,
    variables: {
      first: 1,
      query: `handle:${handle}`,
    },
  });

  if (pageLookupResponse.data?.errors?.length) {
    throw new Error(
      getGraphQlErrorMessage(
        pageLookupResponse.data.errors,
        "Failed to look up Shopify vendor page"
      )
    );
  }

  const pageId = pageLookupResponse.data?.data?.pages?.nodes?.[0]?.id;

  if (!pageId) {
    return;
  }

  const pageDeleteResponse: {
    data?: {
      data?: {
        pageDelete?: {
          deletedPageId?: string | null;
          userErrors?: Array<{ message?: string }>;
        };
      };
      errors?: Array<{ message?: string }>;
    };
  } = await shopifyGraphQL.post("", {
    query: `
      mutation DeleteVendorPage($id: ID!) {
        pageDelete(id: $id) {
          deletedPageId
          userErrors {
            message
          }
        }
      }
    `,
    variables: {
      id: pageId,
    },
  });

  if (pageDeleteResponse.data?.errors?.length) {
    throw new Error(
      getGraphQlErrorMessage(
        pageDeleteResponse.data.errors,
        "Failed to delete Shopify vendor page"
      )
    );
  }

  const pageDeleteErrors =
    pageDeleteResponse.data?.data?.pageDelete?.userErrors ?? [];

  if (pageDeleteErrors.length > 0) {
    throw new Error(
      getGraphQlErrorMessage(
        pageDeleteErrors,
        "Failed to delete Shopify vendor page"
      )
    );
  }
};

const deleteShopifyFiles = async (fileIds: string[]) => {
  const uniqueFileIds = [...new Set(fileIds.map((id) => id.trim()).filter(Boolean))];

  if (uniqueFileIds.length === 0) {
    return;
  }

  const fileDeleteResponse: {
    data?: {
      data?: {
        fileDelete?: {
          deletedFileIds?: string[];
          userErrors?: Array<{ message?: string }>;
        };
      };
      errors?: Array<{ message?: string }>;
    };
  } = await shopifyGraphQL.post("", {
    query: `
      mutation DeleteVendorFiles($fileIds: [ID!]!) {
        fileDelete(fileIds: $fileIds) {
          deletedFileIds
          userErrors {
            message
          }
        }
      }
    `,
    variables: {
      fileIds: uniqueFileIds,
    },
  });

  if (fileDeleteResponse.data?.errors?.length) {
    throw new Error(
      getGraphQlErrorMessage(
        fileDeleteResponse.data.errors,
        "Failed to delete Shopify vendor files"
      )
    );
  }

  const fileDeleteErrors =
    fileDeleteResponse.data?.data?.fileDelete?.userErrors ?? [];

  if (fileDeleteErrors.length > 0) {
    throw new Error(
      getGraphQlErrorMessage(
        fileDeleteErrors,
        "Failed to delete Shopify vendor files"
      )
    );
  }
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

router.delete("/:vendorId", async (req, res) => {
  try {
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

    const vendorData = existingVendor.data() as FirestoreVendorData;
    const confirmationName =
      typeof req.body?.confirmationName === "string"
        ? req.body.confirmationName
        : "";
    const expectedConfirmationName =
      vendorData.businessName?.trim() || existingVendor.id;

    if (!confirmationName) {
      res.status(400).json({
        success: false,
        message: "Vendor name confirmation is required",
      });
      return;
    }

    if (confirmationName !== expectedConfirmationName) {
      res.status(400).json({
        success: false,
        message: "Typed vendor name does not match exactly",
      });
      return;
    }

    const vendorPageHandle = extractPageHandleFromUrl(
      vendorData.vendorProfileUrl ??
        (vendorData["vendor_profile_url"] as string | undefined) ??
        ""
    );
    const vendorFileIds = [
      vendorData.media?.companyLogo?.shopifyFileId,
      vendorData.media?.coverPhoto?.shopifyFileId,
    ].filter((value): value is string => typeof value === "string" && Boolean(value.trim()));

    await deleteShopifyPageByHandle(vendorPageHandle);
    await deleteShopifyFiles(vendorFileIds);
    await vendorRef.delete();

    res.json({
      success: true,
      message: "Vendor deleted successfully",
    });
  } catch (error) {
    console.error("Failed to delete vendor:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete vendor",
    });
  }
});

export default router;
