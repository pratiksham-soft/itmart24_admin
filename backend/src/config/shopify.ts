export const SHOPIFY_CONFIG = {
  STORE_DOMAIN: process.env.SHOPIFY_STORE_DOMAIN!,
  ACCESS_TOKEN: process.env.SHOPIFY_ADMIN_API_TOKEN!,
  API_VERSION: process.env.SHOPIFY_API_VERSION || "2024-01",
};

if (
  !SHOPIFY_CONFIG.STORE_DOMAIN ||
  !SHOPIFY_CONFIG.ACCESS_TOKEN
) {
  throw new Error(
    "Missing Shopify configuration in environment variables"
  );
}
