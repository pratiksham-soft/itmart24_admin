"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("../config/env");
const shopifyHttp_1 = require("../services/shopifyHttp");
const csCartB2BOverride_1 = require("./lib/csCartB2BOverride");
const PRODUCT_GID = (productId) => `gid://shopify/Product/${productId}`;
const MULTILINE_SEPARATOR = "\r\n";
const toSentence = (value) => {
    const normalized = value.trim().replace(/\s+/g, " ");
    if (!normalized) {
        return "";
    }
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};
const joinAsSentence = (items) => {
    const normalized = items.map(toSentence).filter(Boolean);
    if (normalized.length === 0) {
        return "";
    }
    if (normalized.length === 1) {
        return normalized[0];
    }
    if (normalized.length === 2) {
        return `${normalized[0]} and ${normalized[1]}`;
    }
    return `${normalized.slice(0, -1).join(", ")}, and ${normalized[normalized.length - 1]}`;
};
const buildBodyHtml = () => {
    const featureSentence = joinAsSentence(csCartB2BOverride_1.CS_CART_B2B_OVERRIDE.featureLines.slice(0, 4));
    const pricingSentence = joinAsSentence(csCartB2BOverride_1.CS_CART_B2B_OVERRIDE.pricingLines.slice(0, 4));
    return [
        `<p>${csCartB2BOverride_1.CS_CART_B2B_OVERRIDE.title} is positioned as a hosted marketplace builder for businesses that want B2B commerce workflows without taking on infrastructure management. The official CS-Cart cloud offer focuses on helping teams launch a multi-vendor marketplace quickly, manage sellers and products through an admin interface, and avoid a custom development cycle for core platform setup. That makes the product relevant for organizations comparing B2B marketplace platforms that need faster launch speed, clearer operating controls, and a managed delivery model.</p>`,
        `<p>The current product direction emphasizes marketplace administration rather than self-hosted deployment. Based on the official CS-Cart cloud pricing page reviewed on April 19, 2026, the platform supports workflows such as ${featureSentence}. Those capabilities matter for B2B operators because wholesale and distributor marketplaces often need account-aware workflows, vendor coordination, configurable catalogs, and operational controls that can scale as more suppliers and buyers join the platform.</p>`,
        `<p>${csCartB2BOverride_1.CS_CART_B2B_OVERRIDE.title} is also presented as a practical fit for teams that want to validate a marketplace concept, launch a managed platform, or grow into a larger multi-vendor operation without maintaining servers and manual platform upgrades. The hosted delivery model keeps infrastructure, uptime, and software updates under CS-Cart management, while the admin experience is designed to let business teams configure marketplace settings, payments, and storefront structure from one place. For buyers in the B2B eCommerce Platform category, that combination can reduce operational friction during early launch and ongoing marketplace administration.</p>`,
        `<p>The visible pricing on the referenced page now starts at $75 per month billed annually for the Basic plan. ${pricingSentence}. Using $75 as the Shopify price keeps the product aligned with the lowest clearly advertised current entry point on the official cloud marketplace builder page, while detailed plan limits remain in the pricing metafield for comparison. Buyers should still review plan inclusions, usage thresholds, and rollout requirements on the official CS-Cart site before making a final decision.</p>`,
        `<p>Overall, the updated listing reflects CS-Cart's managed marketplace builder positioning more accurately than the previous one-time-license framing. It is a suitable option for businesses that want a hosted B2B marketplace platform with vendor management, international selling support, and structured plan tiers, while still recognizing that organizations with deeper customization requirements may need to compare the cloud offer against more developer-controlled alternatives in the broader CS-Cart ecosystem.</p>`,
    ].join("");
};
const buildProductFeatures = () => csCartB2BOverride_1.CS_CART_B2B_OVERRIDE.featureLines
    .map((line) => `- ${toSentence(line)}`)
    .join(MULTILINE_SEPARATOR);
const buildPlansPricing = () => csCartB2BOverride_1.CS_CART_B2B_OVERRIDE.pricingLines
    .map((line) => `- ${toSentence(line)}`)
    .join(MULTILINE_SEPARATOR);
const buildProsCons = () => [
    "- Pro: Managed cloud marketplace builder with no installation or hosting setup required.",
    "- Pro: Clear public starting price at $75 per month billed annually.",
    "- Pro: Includes vendor, catalog, payment, and multi-storefront workflow support for marketplace operations.",
    "- Con: Lower-tier plans cap products, revenue, vendors, and admin access.",
    "- Con: Cloud customization is more limited than a fully self-hosted marketplace stack.",
    "- Con: Buyers should compare annual and monthly plan differences, including mobile app availability.",
].join(MULTILINE_SEPARATOR);
const setCustomMetafields = async (productId) => {
    const metafields = [
        {
            ownerId: PRODUCT_GID(productId),
            namespace: "custom",
            key: "custom",
            type: "url",
            value: csCartB2BOverride_1.CS_CART_B2B_OVERRIDE.officialUrl,
        },
        {
            ownerId: PRODUCT_GID(productId),
            namespace: "custom",
            key: "product_features",
            type: "multi_line_text_field",
            value: buildProductFeatures(),
        },
        {
            ownerId: PRODUCT_GID(productId),
            namespace: "custom",
            key: "plans_pricing",
            type: "multi_line_text_field",
            value: buildPlansPricing(),
        },
        {
            ownerId: PRODUCT_GID(productId),
            namespace: "custom",
            key: "pros_cons",
            type: "multi_line_text_field",
            value: buildProsCons(),
        },
    ];
    const response = await shopifyHttp_1.shopifyGraphQL.post("", {
        query: `
      mutation SetProductMetafields($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors {
            field
            message
          }
        }
      }
    `,
        variables: {
            metafields,
        },
    });
    const errors = response.data?.data?.metafieldsSet?.userErrors ?? [];
    if (errors.length > 0) {
        throw new Error(`Metafield update failed: ${JSON.stringify(errors)}`);
    }
};
const main = async () => {
    const response = await shopifyHttp_1.shopifyRest.get("/products.json", {
        params: {
            handle: csCartB2BOverride_1.CS_CART_B2B_HANDLE,
            limit: 1,
        },
    });
    const product = Array.isArray(response.data?.products)
        ? response.data.products[0]
        : null;
    if (!product?.id) {
        throw new Error(`Could not find Shopify product with handle ${csCartB2BOverride_1.CS_CART_B2B_HANDLE}`);
    }
    const primaryVariant = Array.isArray(product.variants) ? product.variants[0] : null;
    if (!primaryVariant?.id) {
        throw new Error(`Could not find primary variant for ${csCartB2BOverride_1.CS_CART_B2B_HANDLE}`);
    }
    await shopifyHttp_1.shopifyRest.put(`/products/${product.id}.json`, {
        product: {
            id: product.id,
            body_html: buildBodyHtml(),
            metafields_global_title_tag: csCartB2BOverride_1.CS_CART_B2B_OVERRIDE.seoTitle,
            metafields_global_description_tag: csCartB2BOverride_1.CS_CART_B2B_OVERRIDE.seoDescription,
            variants: [
                {
                    id: primaryVariant.id,
                    price: String(csCartB2BOverride_1.CS_CART_B2B_OVERRIDE.price),
                    taxable: false,
                    requires_shipping: false,
                },
            ],
        },
    });
    await setCustomMetafields(Number(product.id));
    console.log(`Updated ${csCartB2BOverride_1.CS_CART_B2B_HANDLE} (${product.id})`);
    console.log(`Official URL: ${csCartB2BOverride_1.CS_CART_B2B_OVERRIDE.officialUrl}`);
    console.log(`Price: ${csCartB2BOverride_1.CS_CART_B2B_OVERRIDE.price}`);
};
main().catch((error) => {
    console.error("CS-Cart B2B update failed:", error);
    process.exitCode = 1;
});
