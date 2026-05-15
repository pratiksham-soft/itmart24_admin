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
import blogManagerRoutes from "./routes/blogManager.routes";
import healthRoutes from "./routes/health.routes";
import authRoutes from "./routes/auth.routes";
import adminAuthRoutes from "./routes/adminAuth.routes";
import adminEmailRoutes from "./routes/adminEmail.routes";
import crmRoutes from "./routes/crm.routes";
import customPortfolioLeadsRoutes from "./routes/customPortfolioLeads.routes";



const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/products", productsRoutes);
app.use("/api/shopify", shopifyRoutes);
app.use("/api/vendors", vendorsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/admin/email", adminEmailRoutes);
app.use("/api/custom-portfolio-pricing", customPortfolioLeadsRoutes);
app.use("/apps/custom-portfolio-pricing", customPortfolioLeadsRoutes);
app.use("/api/crm", crmRoutes);
app.use("/api/subscription-plans", subscriptionPlansRoutes);
app.use("/api/product-categories", productCategoriesRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/monthly-targets", monthlyTargetsRoutes);
app.use("/api/blog-manager", blogManagerRoutes);
app.use("/api/health", healthRoutes);



app.get("/health", (_req, res) => {
  res.json({ status: "OK", service: "itmart24-admin-backend" });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(
    "Unhandled API error:",
    error instanceof Error ? error.message : String(error)
  );
  res.status(500).json({
    success: false,
    message: "Request failed.",
    error: error instanceof Error ? error.message : "Unexpected server error",
  });
});

export default app;
