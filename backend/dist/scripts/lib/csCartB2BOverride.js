"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CS_CART_B2B_OVERRIDE = exports.getProductImportOverride = exports.PRODUCT_IMPORT_OVERRIDES_BY_HANDLE = exports.CS_CART_B2B_HANDLE = void 0;
exports.CS_CART_B2B_HANDLE = "cs-cart-b2b";
exports.PRODUCT_IMPORT_OVERRIDES_BY_HANDLE = {};
const getProductImportOverride = (handle) => exports.PRODUCT_IMPORT_OVERRIDES_BY_HANDLE[handle] ?? null;
exports.getProductImportOverride = getProductImportOverride;
exports.CS_CART_B2B_OVERRIDE = {
    handle: exports.CS_CART_B2B_HANDLE,
    title: "CS-Cart B2B",
    officialUrl: "https://www.cs-cart.com/",
    price: 75,
    bodyText: "CS-Cart Multi-Vendor Cloud is a hosted no-code marketplace builder for businesses that want to launch a B2B marketplace without managing installation, hosting, or software maintenance. The platform is positioned around fast launch, vendor management, automated payments, built-in themes, and managed infrastructure. It is suitable for organizations that want to validate or scale marketplace operations through an admin panel instead of a custom development project.",
    featureLines: [
        "Launch a hosted marketplace without installation, developers, or server setup",
        "Manage vendors, products, payments, and daily marketplace operations from one admin panel",
        "Use built-in themes, automatic updates, and managed hosting handled by CS-Cart",
        "Support global selling with multiple languages, multi-currency, taxes, and shipping tools",
        "Create multiple storefronts from one system for different audiences or regions",
        "Access a mobile app on the Advanced annual plan",
    ],
    pricingLines: [
        "Basic starts at $75 per month billed annually and includes up to 500 products, revenue up to $5,000, up to 50 vendors, and 1 admin",
        "Pro starts at $125 per month billed annually and includes up to 5,000 products, revenue up to $10,000, up to 500 vendors, and 3 admins",
        "Advanced starts at $235 per month billed annually and includes up to 50,000 products, unlimited revenue, unlimited vendors, unlimited admins, and a mobile app",
        "Monthly pricing starts at $95 for Basic, $155 for Pro, and $295 for Advanced",
        "The lowest visible base price on the referenced pricing page is $75 per month billed annually",
    ],
    seoTitle: "CS-Cart B2B | No-Code Marketplace Builder",
    seoDescription: "CS-Cart Multi-Vendor Cloud helps launch a B2B marketplace with managed hosting, vendor tools, and plans from $75/month billed annually.",
};
