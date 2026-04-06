import axios from "axios";

const SHOPIFY_STORE_DOMAIN =
  process.env.SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_ADMIN_API_TOKEN =
  process.env.SHOPIFY_ADMIN_API_TOKEN!;
const SHOPIFY_API_VERSION =
  process.env.SHOPIFY_API_VERSION || "2024-01";

if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_API_TOKEN) {
  throw new Error(
    "Missing Shopify Admin API environment variables"
  );
}

export const shopifyClient = axios.create({
  baseURL: `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`,
  headers: {
    "X-Shopify-Access-Token": SHOPIFY_ADMIN_API_TOKEN,
    "Content-Type": "application/json",
  },
});
