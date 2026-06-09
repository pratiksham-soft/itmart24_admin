import { Router } from "express";
import { attachOptionalAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { catalog, collectionProducts, publicProductReviews, taxonomy } from "./reviews.controller";

const router = Router();

router.get("/catalog", asyncHandler(catalog));
router.get("/taxonomy", asyncHandler(taxonomy));
router.get("/collection-products", asyncHandler(collectionProducts));
router.get("/product", attachOptionalAuth, asyncHandler(publicProductReviews));

export default router;
