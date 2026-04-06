import axios from "axios";
import { SHOPIFY_CONFIG } from "../config/shopify";

export const shopifyRest = axios.create({
  baseURL: `https://${SHOPIFY_CONFIG.STORE_DOMAIN}/admin/api/${SHOPIFY_CONFIG.API_VERSION}`,
  headers: {
    "X-Shopify-Access-Token": SHOPIFY_CONFIG.ACCESS_TOKEN,
    "Content-Type": "application/json",
  },
});

export const shopifyGraphQL = axios.create({
  baseURL: `https://${SHOPIFY_CONFIG.STORE_DOMAIN}/admin/api/${SHOPIFY_CONFIG.API_VERSION}/graphql.json`,
  headers: {
    "X-Shopify-Access-Token": SHOPIFY_CONFIG.ACCESS_TOKEN,
    "Content-Type": "application/json",
  },
});
