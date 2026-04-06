import { shopifyRest } from "./shopifyHttp";
import { buildShopifyProductPayload } from "./shopifyProductMapper";
import { setProductMetafields } from "./shopifyMetafields";
import { firestore } from "../config/firebase";
const SHOPIFY_DRY_RUN = false;

const toProductGid = (productId: number) =>
  `gid://shopify/Product/${productId}`;

const normalizeText = (value: unknown) => {
  if (typeof value !== "string") {
    if (value === null || value === undefined) {
      return "";
    }

    return String(value).trim();
  }

  return value.trim();
};

const normalizeOptionalUrl = (value: unknown) => {
  const text = normalizeText(value);
  return text || null;
};

const normalizeTextList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }

      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        return normalizeText(
          record.name ??
            record.label ??
            record.title ??
            record.value
        );
      }

      return normalizeText(item);
    })
    .filter(Boolean);
};

const normalizeFeatureItems = (
  value: unknown
): Array<{ name: string; description: string }> => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        const name = item.trim();
        return name ? { name, description: "" } : null;
      }

      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const name = normalizeText(record.name ?? record.title ?? record.label);
        const description = normalizeText(
          record.description ?? record.value ?? record.text
        );

        if (!name && !description) {
          return null;
        }

        return {
          name: name || description,
          description: name ? description : "",
        };
      }

      const name = normalizeText(item);
      return name ? { name, description: "" } : null;
    })
    .filter(
      (item): item is { name: string; description: string } => Boolean(item)
    );
};

const buildFeaturesText = (features: Array<{ name: string; description: string }>) =>
  features
    .map((feature) =>
      feature.description
        ? `${feature.name} - ${feature.description}`
        : feature.name
    )
    .join("\n");

const buildPlansText = (plans: unknown) => {
  if (!Array.isArray(plans)) {
    return "";
  }

  return plans
    .map((plan, index) => {
      if (!plan || typeof plan !== "object") {
        return null;
      }

      const record = plan as Record<string, unknown>;
      const segments = [
        normalizeText(record.name),
        normalizeText(record.introPrice),
        normalizeText(record.introTerm),
      ].filter(Boolean);

      const customFields = Array.isArray(record.customFields)
        ? record.customFields
        : [];
      const customValues = Array.isArray(record.customValues)
        ? record.customValues
        : [];
      const customSegments = customFields
        .map((field, customIndex) => {
          const fieldText =
            typeof field === "string"
              ? field.trim()
              : field && typeof field === "object"
                ? normalizeText(
                    (field as Record<string, unknown>).label ??
                      (field as Record<string, unknown>).name ??
                      (field as Record<string, unknown>).title
                  )
                : "";
          const valueText = normalizeText(customValues[customIndex]);

          if (!fieldText || !valueText) {
            return "";
          }

          return `${fieldText}: ${valueText}`;
        })
        .filter(Boolean);

      if (segments.length === 0 && customSegments.length === 0) {
        return null;
      }

      return [segments.join(" "), ...customSegments].join("\n");
    })
    .filter(Boolean)
    .join("\n");
};

const resolveVendorName = async (product: any) => {
  const inlineVendorName = normalizeText(
    product.vendorResolved?.businessName ??
      product.businessName ??
      product.shopify?.product?.vendor
  );

  if (inlineVendorName) {
    return inlineVendorName;
  }

  const vendorId = normalizeText(product.vendorId);

  if (!vendorId) {
    return "";
  }

  try {
    const vendorProfileSnap = await firestore
      .collection("vendor_profile")
      .doc(vendorId)
      .get();

    if (!vendorProfileSnap.exists) {
      return "";
    }

    const vendorProfile = vendorProfileSnap.data() ?? {};

    return normalizeText(
      vendorProfile.businessName ??
        vendorProfile.business_name ??
        vendorProfile.vendorName
    );
  } catch (error) {
    console.error("Failed to resolve vendor profile name", error);
    return "";
  }
};

const normalizeProductForShopify = (product: any) => {
  const basic = product.vendor?.basic ?? product.basic ?? {};
  const pricing =
    product.vendor?.productPlanPricing ??
    product.vendor?.pricing ??
    product.pricing ??
    {};
  const media = product.vendor?.media ?? product.media ?? {};
  const verification =
    product.vendor?.verification ??
    product.verification ??
    {};
  const features = normalizeFeatureItems(
    product.vendor?.features ?? product.features
  );

  return {
    ...product,
    basic: {
      productName: normalizeText(basic.productName),
      category: normalizeText(
        basic.categoryName ?? basic.category ?? product.basic?.category
      ),
      description: normalizeText(
        basic.description ?? product.basic?.description
      ),
    },
    pricing: {
      ...pricing,
      affiliateUrl: normalizeOptionalUrl(pricing.affiliateUrl),
      plans: Array.isArray(pricing.plans) ? pricing.plans : [],
    },
    media: {
      ...media,
      thumbnailUrl: normalizeOptionalUrl(media.thumbnailUrl),
    },
    verification,
    features,
    metafieldsPayload: {
      featuresText: buildFeaturesText(features),
      plansText: buildPlansText(pricing.plans),
      affiliateUrl: normalizeOptionalUrl(pricing.affiliateUrl),
      thumbnailUrl: normalizeOptionalUrl(media.thumbnailUrl),
      typeMultiple: normalizeTextList(basic.subSubCategories),
      keywords: normalizeTextList(basic.keywords),
      verified:
        typeof verification.productVerified === "boolean"
          ? verification.productVerified
          : null,
      verifiedVendorLinkBadge:
        typeof verification.productLinkVerified === "boolean"
          ? verification.productLinkVerified
          : null,
      sponsored:
        typeof verification.isSponsored === "boolean"
          ? verification.isSponsored
          : null,
      supportResponseSlaBadge:
        typeof verification.supportResponseVerified === "boolean"
          ? verification.supportResponseVerified
          : null,
      refundClarityBadge:
        typeof verification.refundClarityVerified === "boolean"
          ? verification.refundClarityVerified
          : null,
      vendorId: normalizeText(product.vendorId),
      vendorProfileUrl: normalizeOptionalUrl(product.vendor_profile_url),
      productId: normalizeText(product.id),
    },
  };
};

type ShopifySyncResult = {
  action:
    | "created"
    | "updated"
    | "unlisted"
    | "skipped"
    | "skipped-no-product"
    | "skipped-existing-product";
  shopifyProductId: number | null;
  shopifyGraphqlId: string | null;
  handle: string | null;
};

/**
 * 🔐 Safety guard — NEVER allow dry-run in production
 */
if (process.env.NODE_ENV === "production") {
  if (SHOPIFY_DRY_RUN) {
    throw new Error(
      "SHOPIFY_DRY_RUN must be false in production"
    );
  }
}

/**
 * Extract numeric Shopify product ID safely
 */
const extractNumericId = (id: any): number => {
  if (!id) {
    throw new Error("Shopify Product ID is missing");
  }

  // REST API returns numeric ID
  if (typeof id === "number" && !isNaN(id)) {
    return id;
  }

  // GraphQL GID → extract numeric
  if (typeof id === "string") {
    const numericId = Number(id.split("/").pop());
    if (!numericId || isNaN(numericId)) {
      throw new Error(`Invalid Shopify GID received: ${id}`);
    }
    return numericId;
  }

  throw new Error(`Unsupported Shopify Product ID type: ${typeof id}`);
};

const unpublishProductFromAllPublications = async (
  productGid: string
) => {
  // 1️⃣ Get all publications where product is published
  const queryPublications = `
    query GetPublications($id: ID!) {
      node(id: $id) {
        ... on Product {
          publications(first: 50) {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      }
    }
  `;

  const publicationsRes = await shopifyRest.post(
    "/graphql.json",
    {
      query: queryPublications,
      variables: { id: productGid },
    }
  );

  const publications =
    publicationsRes.data?.data?.node?.publications
      ?.edges ?? [];

  if (!publications.length) {
    return;
  }

  // 2️⃣ Unpublish from EACH publication
  const mutation = `
    mutation Unpublish(
      $id: ID!
      $publicationId: ID!
    ) {
      publishableUnpublish(
        id: $id
        input: { publicationId: $publicationId }
      ) {
        userErrors {
          field
          message
        }
      }
    }
  `;

  for (const pub of publications) {
    const res = await shopifyRest.post(
      "/graphql.json",
      {
        query: mutation,
        variables: {
          id: productGid,
          publicationId: pub.node.id,
        },
      }
    );

    const errors =
      res.data?.data?.publishableUnpublish
        ?.userErrors;

    if (errors?.length) {
      throw new Error(
        `Failed to unpublish from ${pub.node.name}: ` +
        errors.map((e: any) => e.message).join(", ")
      );
    }
  }
};


/**
 * Sync product to Shopify based on status
 */
type ShopifyApiStatus = "active" | "draft";

export const syncProductWithShopify = async ({
  product,
  shopifyApiStatus,
}: {
  product: any;
  shopifyApiStatus: ShopifyApiStatus;
}) => {
  const vendorName = await resolveVendorName(product);
  const normalizedProduct = {
    ...normalizeProductForShopify(product),
    vendorName,
  };

  const shopifyData = normalizedProduct.shopify || {};

  const shopifyProductId =
    shopifyData.productId ?? null;

    // 🔍 DEBUG — Shopify ID source
console.log("🔍 Full shopify data:", shopifyData);
console.log("🔍 Raw productId:", shopifyData.productId);
console.log("🔍 DEBUG: shopifyProductId =", shopifyProductId);
console.log("🔍 DEBUG: typeof shopifyProductId =", typeof shopifyProductId);

  const isActive = shopifyApiStatus === "active";

  console.log("[Shopify Sync]");
  console.log("Product ID:", shopifyProductId);
  console.log("Requested Shopify Status:", shopifyApiStatus);
  console.log("Will Activate:", isActive);
  console.log(">>> FINAL DECISION: setting Shopify product to", shopifyApiStatus);


  if (
    shopifyApiStatus !== "active" &&
    shopifyApiStatus !== "draft"
  ) {
    throw new Error(
      `Invalid shopifyApiStatus received: ${shopifyApiStatus}`
    );
  }

  if (
    shopifyApiStatus === "draft" &&
    !shopifyProductId
  ) {
    console.log(
      "Skipping unlist: No Shopify product exists yet"
    );
    return { action: "skipped-no-product" };
  }


  /* ================= TEXT BUILDERS ================= */

  const {
    featuresText,
    plansText,
    affiliateUrl,
    thumbnailUrl,
    typeMultiple,
    keywords,
    verified,
    verifiedVendorLinkBadge,
    sponsored,
    supportResponseSlaBadge,
    refundClarityBadge,
    vendorId,
    vendorProfileUrl,
    productId,
  } = normalizedProduct.metafieldsPayload;


  const payload = buildShopifyProductPayload(normalizedProduct);
  payload.product.status = shopifyApiStatus;

  /* ---------- UPDATE ACTIVE/DRAFT ---------- */
  if (shopifyProductId) {
    try {
      const updatePayload = {
        product: {
          ...payload.product,
          id: shopifyProductId,
        },
      };

      console.log("🧪 SHOPIFY DRY RUN — UPDATE PAYLOAD");
      console.log("URL:", `/products/${shopifyProductId}.json`);
      console.log("BODY:", JSON.stringify(updatePayload, null, 2));

      if (!SHOPIFY_DRY_RUN) {
        await shopifyRest.put(
          `/products/${shopifyProductId}.json`,
          updatePayload
        );
      }

      await setProductMetafields({
        shopifyProductId,
        featuresText,
        plansText,
        affiliateUrl,
        thumbnailUrl,
        typeMultiple,
        keywords,
        verified,
        verifiedVendorLinkBadge,
        sponsored,
        supportResponseSlaBadge,
        refundClarityBadge,
        vendorId,
        vendorProfileUrl,
        productId,
      });

      if (shopifyApiStatus === "draft") {
        await unpublishProductFromAllPublications(
          toProductGid(shopifyProductId)
        );
      }

      return {
        action: shopifyApiStatus === "draft" ? "unlisted" : "updated",
        shopifyProductId,
        shopifyGraphqlId: toProductGid(shopifyProductId),
        handle: payload.product.handle ?? null,
      };
    } catch (err: any) {
      if (
        err.response?.status !== 404 ||
        shopifyApiStatus === "draft"
      ) {
        console.error("SHOPIFY UPDATE ERROR");
        console.error("URL:", err.config?.url);
        console.error("METHOD:", err.config?.method);
        console.error("STATUS:", err.response?.status);
        console.error("RESPONSE:", err.response?.data);
        throw err;
      }
      // active only → fallback to CREATE
    }
  }

  /* ---------- CREATE ACTIVE ---------- */
  if (isActive) {
    if (shopifyProductId) {
      return {
        action: "skipped-existing-product",
        shopifyProductId,
        shopifyGraphqlId: toProductGid(shopifyProductId),
        handle: payload.product.handle ?? null,
      };
    }
    try {
      const response = await shopifyRest.post(
        "/products.json",
        payload
      );

      const createdId = extractNumericId(
        response.data.product.id
      );

      console.log("Shopify CREATE productId:", createdId);

      await setProductMetafields({
        shopifyProductId: createdId,
        featuresText,
        plansText,
        affiliateUrl,
        thumbnailUrl,
        typeMultiple,
        keywords,
        verified,
        verifiedVendorLinkBadge,
        sponsored,
        supportResponseSlaBadge,
        refundClarityBadge,
        vendorId,
        vendorProfileUrl,
        productId,
      });

      return {
        action: "created",
        shopifyProductId: createdId,
        shopifyGraphqlId: response.data.product.admin_graphql_api_id,
        handle: response.data.product.handle,
      };
    } catch (err: any) {
      console.error("SHOPIFY CREATE ERROR");
      console.error("URL:", err.config?.url);
      console.error("METHOD:", err.config?.method);
      console.error("STATUS:", err.response?.status);
      console.error("RESPONSE:", err.response?.data);
      throw err;
    }
  }

  /* ================= FALLBACK ================= */

  return {
    action: "skipped",
    shopifyProductId: null,
    shopifyGraphqlId: null,
    handle: null,
  };
};
