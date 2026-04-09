"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const products_routes_1 = __importDefault(require("./routes/products.routes"));
const subscriptionPlans_routes_1 = __importDefault(require("./routes/subscriptionPlans.routes"));
const productCategories_routes_1 = __importDefault(require("./routes/productCategories.routes"));
const vendors_routes_1 = __importDefault(require("./routes/vendors.routes"));
const shopify_routes_1 = __importDefault(require("./routes/shopify.routes"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use("/api/products", products_routes_1.default);
app.use("/api/shopify", shopify_routes_1.default);
app.use("/api/vendors", vendors_routes_1.default);
app.use("/api/subscription-plans", subscriptionPlans_routes_1.default);
app.use("/api/product-categories", productCategories_routes_1.default);
app.get("/health", (_req, res) => {
    res.json({ status: "OK", service: "itmart24-admin-backend" });
});
exports.default = app;
