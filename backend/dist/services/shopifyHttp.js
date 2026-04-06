"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.shopifyGraphQL = exports.shopifyRest = void 0;
const axios_1 = __importDefault(require("axios"));
const shopify_1 = require("../config/shopify");
exports.shopifyRest = axios_1.default.create({
    baseURL: `https://${shopify_1.SHOPIFY_CONFIG.STORE_DOMAIN}/admin/api/${shopify_1.SHOPIFY_CONFIG.API_VERSION}`,
    headers: {
        "X-Shopify-Access-Token": shopify_1.SHOPIFY_CONFIG.ACCESS_TOKEN,
        "Content-Type": "application/json",
    },
});
exports.shopifyGraphQL = axios_1.default.create({
    baseURL: `https://${shopify_1.SHOPIFY_CONFIG.STORE_DOMAIN}/admin/api/${shopify_1.SHOPIFY_CONFIG.API_VERSION}/graphql.json`,
    headers: {
        "X-Shopify-Access-Token": shopify_1.SHOPIFY_CONFIG.ACCESS_TOKEN,
        "Content-Type": "application/json",
    },
});
