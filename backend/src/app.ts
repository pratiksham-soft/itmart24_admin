import express from "express";
import cors from "cors";
import productsRoutes from "./routes/products.routes";
import subscriptionPlansRoutes from "./routes/subscriptionPlans.routes";
import productCategoriesRoutes from "./routes/productCategories.routes";
import vendorsRoutes from "./routes/vendors.routes";
import shopifyRoutes from "./routes/shopify.routes";
import notificationsRoutes from "./routes/notifications.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import monthlyTargetsRoutes from "./routes/monthlyTargets.routes";



const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/products", productsRoutes);
app.use("/api/shopify", shopifyRoutes);
app.use("/api/vendors", vendorsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/subscription-plans", subscriptionPlansRoutes);
app.use("/api/product-categories", productCategoriesRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/monthly-targets", monthlyTargetsRoutes);



app.get("/health", (_req, res) => {
  res.json({ status: "OK", service: "itmart24-admin-backend" });
});

export default app;
