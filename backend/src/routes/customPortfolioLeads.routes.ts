import { Router } from "express";
import { submitCustomPortfolioLead } from "../services/customPortfolioLeads.service";
import { submitFounderVendorLead } from "../services/founderVendorLeads.service";

const router = Router();
const FOUNDER_VENDOR_PROGRAM_PAGE_ID = "132191748335";

const isFounderVendorSubmission = (payload: Record<string, unknown>) => {
  const leadType = String(payload.leadType ?? "").trim().toLowerCase();
  const sourcePage = String(payload.sourcePage ?? "").trim().toLowerCase();
  const shopifyPageId = String(payload.shopifyPageId ?? "").trim();

  return (
    leadType === "founder_vendor_program" ||
    sourcePage === "founder_vendor_program_page" ||
    shopifyPageId === FOUNDER_VENDOR_PROGRAM_PAGE_ID
  );
};

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
    const payload = (req.body ?? {}) as Record<string, unknown>;

    if (isFounderVendorSubmission(payload)) {
      const result = await submitFounderVendorLead(payload);
      res.status(201).json({
        success: true,
        data: result,
        message:
          "Thank you for applying to the ITMart24 Founder Vendor Program. Our team has received your details and will review your application shortly.",
      });
      return;
    }

    const result = await submitCustomPortfolioLead(payload);
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
