import express from "express";
import cors from "cors";
import productsRoutes from "./routes/products.routes";
import subscriptionPlansRoutes from "./routes/subscriptionPlans.routes";
import productCategoriesRoutes from "./routes/productCategories.routes";
import vendorsRoutes from "./routes/vendors.routes";



const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/products", productsRoutes);
app.use("/api/vendors", vendorsRoutes);
app.use("/api/subscription-plans", subscriptionPlansRoutes);
app.use("/api/product-categories", productCategoriesRoutes);



app.get("/health", (_req, res) => {
  res.json({ status: "OK", service: "itmart24-admin-backend" });
});

export default app;
