import { shopifyGraphQL } from "./shopifyHttp";

type MetafieldInput = {
  shopifyProductId: number;
  featuresText?: string;
  plansText?: string;
  affiliateUrl?: string | null;
  thumbnailUrl?: string | null;
  typeMultiple?: string[];
  keywords?: string[];
  verified?: boolean | null;
  verifiedVendorLinkBadge?: boolean | null;
  sponsored?: boolean | null;
  vendorId?: string | null;
  vendorProfileUrl?: string | null;
  productId?: string | null;
  supportResponseSlaBadge?: boolean | null;
  refundClarityBadge?: boolean | null;
};

type ShopifyMetafield = {
  namespace: string;
  key: string;
  type: string;
  value: string;
};

export type ProductCustomMetafieldInput = {
  key: string;
  type: string;
  value: string;
  namespace?: string;
};

const createTextMetafield = (
  key: string,
  type: string,
  value?: string | null
): ShopifyMetafield | null => {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  return {
    namespace: "custom",
    key,
    type,
    value: value.trim(),
  };
};

const createListMetafield = (
  key: string,
  values?: string[]
): ShopifyMetafield | null => {
  const normalizedValues = Array.isArray(values)
    ? values
        .map((item) => String(item).trim())
        .filter(Boolean)
    : [];

  if (normalizedValues.length === 0) {
    return null;
  }

  return {
    namespace: "custom",
    key,
    type: "list.single_line_text_field",
    value: JSON.stringify(normalizedValues),
  };
};

const createBooleanMetafield = (
  key: string,
  value?: boolean | null
): ShopifyMetafield | null => {
  if (typeof value !== "boolean") {
    return null;
  }

  return {
    namespace: "custom",
    key,
    type: "boolean",
    value: String(value),
  };
};

export const setProductMetafields = async ({
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
  vendorId,
  vendorProfileUrl,
  productId,
  supportResponseSlaBadge,
  refundClarityBadge,
}: MetafieldInput) => {
  if (!shopifyProductId || isNaN(shopifyProductId)) {
    throw new Error(
      `Invalid shopifyProductId received in metafields: ${shopifyProductId}`
    );
  }

  const metafields = [
    createTextMetafield("product_features", "multi_line_text_field", featuresText),
    createTextMetafield("plans_pricing", "multi_line_text_field", plansText),
    createTextMetafield("custom", "url", affiliateUrl),
    createTextMetafield("logo_image", "url", thumbnailUrl),
    createListMetafield("type_multiple", typeMultiple),
    createListMetafield("keywords", keywords),
    createBooleanMetafield("verified", verified),
    createBooleanMetafield(
      "verified_vendor_link_badge",
      verifiedVendorLinkBadge
    ),
    createBooleanMetafield("sponsored", sponsored),
    createBooleanMetafield(
      "support_response_sla_badge",
      supportResponseSlaBadge
    ),
    createBooleanMetafield("refund_clarity_badge", refundClarityBadge),
    createTextMetafield("vendor_id", "single_line_text_field", vendorId),
    createTextMetafield("vendor_profile_url", "url", vendorProfileUrl),
    createTextMetafield("product_id", "single_line_text_field", productId),
  ].filter((metafield): metafield is ShopifyMetafield => Boolean(metafield));

  await setCustomProductMetafields({
    shopifyProductId,
    metafields,
  });
};

export const setCustomProductMetafields = async ({
  shopifyProductId,
  metafields,
}: {
  shopifyProductId: number;
  metafields: ProductCustomMetafieldInput[];
}) => {
  if (!shopifyProductId || isNaN(shopifyProductId)) {
    throw new Error(
      `Invalid shopifyProductId received in metafields: ${shopifyProductId}`
    );
  }

  const normalizedMetafields = metafields
    .map((metafield) => {
      const key = metafield.key?.trim();
      const type = metafield.type?.trim();
      const value = metafield.value?.trim();

      if (!key || !type || !value) {
        return null;
      }

      return {
        namespace: metafield.namespace?.trim() || "custom",
        key,
        type,
        value,
      } satisfies ShopifyMetafield;
    })
    .filter((metafield): metafield is ShopifyMetafield => Boolean(metafield));

  if (normalizedMetafields.length === 0) {
    console.log("No metafields to save");
    return;
  }

  const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          key
          namespace
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    metafields: normalizedMetafields.map((mf) => ({
      ownerId: `gid://shopify/Product/${shopifyProductId}`,
      namespace: mf.namespace,
      key: mf.key,
      type: mf.type,
      value: mf.value,
    })),
  };

  const response = await shopifyGraphQL.post("", {
    query: mutation,
    variables,
  });

  const result = response.data.data.metafieldsSet;

  if (result.userErrors.length) {
    console.error(
      "Shopify metafield userErrors:",
      JSON.stringify(result.userErrors, null, 2)
    );
    throw new Error("Metafield save failed");
  }

  console.log(
    "Metafields saved:",
    result.metafields.map((m: any) => `${m.namespace}.${m.key}`)
  );
};
