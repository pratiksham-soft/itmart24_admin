import { Router } from "express";
import { submitFounderVendorLead } from "../services/founderVendorLeads.service";

const router = Router();

const sendError = (res: any, error: unknown) => {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "Unable to submit Founder Vendor Program request.";

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
    const result = await submitFounderVendorLead(req.body ?? {});
    res.status(201).json({
      success: true,
      data: result,
      message:
        "Thank you for applying to the ITMart24 Founder Vendor Program. Our team has received your details and will review your application shortly.",
    });
  } catch (error) {
    console.error("Founder vendor lead submit error:", error);
    sendError(res, error);
  }
});

export default router;
