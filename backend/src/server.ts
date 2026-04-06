import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import productsRoutes from "./routes/products.routes";
import app from "./app";

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
