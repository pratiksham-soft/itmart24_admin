import { Router } from "express";
import { submitCustomPortfolioLead } from "../services/customPortfolioLeads.service";

const router = Router();

const sendError = (res: any, error: unknown) => {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "Unable to submit Custom Portfolio Pricing request.";

  const status =
    message.includes("required") ||
    message.includes("valid") ||
    message.includes("invalid")
      ? 400
      : 500;

  res.status(status).json({
    success: false,
    message,
  });
};

router.post("/", async (req, res) => {
  try {
    const result = await submitCustomPortfolioLead(req.body ?? {});
    res.status(201).json({
      success: true,
      data: result,
      message:
        "Thank you for your interest in ITMart24 Custom Portfolio Pricing. Our sales team has received your request and will review your company details, product portfolio, and promotion goals. We will contact you shortly with a suitable portfolio package.",
    });
  } catch (error) {
    console.error("Custom portfolio lead submit error:", error);
    sendError(res, error);
  }
});

export default router;
