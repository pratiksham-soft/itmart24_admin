import { Router } from "express";
import {
  requireAdminAuth,
  type AuthenticatedAdminRequest,
} from "../middleware/adminAuth.middleware";
import {
  getUserSupportTicket,
  getVendorSupportTicket,
  listUserSupportTickets,
  listVendorSupportTickets,
  sendUserSupportReply,
  sendVendorSupportReply,
  updateUserSupportTicketStatus,
  updateVendorSupportTicketStatus,
  type VendorTicketStatus,
} from "../services/adminSupport.service";

const router = Router();

router.use(requireAdminAuth);

const sendRouteError = (
  res: any,
  error: unknown,
  fallbackMessage: string
) => {
  const message =
    error instanceof Error && error.message ? error.message : fallbackMessage;
  const status =
    /required|invalid|not found/i.test(message) ? 400 : 500;

  console.error("[admin-support]", fallbackMessage, error);

  res.status(status).json({
    success: false,
    message,
  });
};

const getActorId = (req: AuthenticatedAdminRequest) =>
  String(req.adminUser?.email || req.adminUser?.id || "admin_support");

router.get("/vendor-tickets", async (_req, res) => {
  try {
    const data = await listVendorSupportTickets();
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    sendRouteError(res, error, "Failed to load vendor support tickets.");
  }
});

router.get("/vendor-tickets/:ticketId", async (req, res) => {
  try {
    const data = await getVendorSupportTicket(String(req.params.ticketId ?? ""));
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    sendRouteError(res, error, "Failed to load vendor support ticket.");
  }
});

router.post("/vendor-tickets/:ticketId/reply", async (req: AuthenticatedAdminRequest, res) => {
  try {
    await sendVendorSupportReply({
      ticketId: String(req.params.ticketId ?? ""),
      message: String(req.body?.message ?? ""),
      senderId: getActorId(req),
    });

    res.status(201).json({
      success: true,
      message: "Vendor support reply sent successfully.",
    });
  } catch (error) {
    sendRouteError(res, error, "Failed to send vendor support reply.");
  }
});

router.patch("/vendor-tickets/:ticketId/status", async (req, res) => {
  try {
    const status = String(req.body?.status ?? "") as VendorTicketStatus;

    if (status !== "Open" && status !== "Resolved" && status !== "Closed") {
      throw new Error("A valid vendor ticket status is required.");
    }

    await updateVendorSupportTicketStatus({
      ticketId: String(req.params.ticketId ?? ""),
      status,
    });

    res.json({
      success: true,
      message: "Vendor ticket status updated successfully.",
    });
  } catch (error) {
    sendRouteError(res, error, "Failed to update vendor ticket status.");
  }
});

router.get("/user-tickets", async (_req, res) => {
  try {
    const data = await listUserSupportTickets();
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    sendRouteError(res, error, "Failed to load user support tickets.");
  }
});

router.get("/user-tickets/:ticketId", async (req, res) => {
  try {
    const data = await getUserSupportTicket(String(req.params.ticketId ?? ""));
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    sendRouteError(res, error, "Failed to load user support ticket.");
  }
});

router.post("/user-tickets/:ticketId/reply", async (req: AuthenticatedAdminRequest, res) => {
  try {
    await sendUserSupportReply({
      ticketId: String(req.params.ticketId ?? ""),
      message: String(req.body?.message ?? ""),
      senderId: getActorId(req),
    });

    res.status(201).json({
      success: true,
      message: "User support reply sent successfully.",
    });
  } catch (error) {
    sendRouteError(res, error, "Failed to send user support reply.");
  }
});

router.patch("/user-tickets/:ticketId/status", async (req: AuthenticatedAdminRequest, res) => {
  try {
    const status = String(req.body?.status ?? "").toLowerCase();

    if (status !== "open" && status !== "resolved" && status !== "closed") {
      throw new Error("A valid user ticket status is required.");
    }

    await updateUserSupportTicketStatus({
      ticketId: String(req.params.ticketId ?? ""),
      status,
      actorId: getActorId(req),
    });

    res.json({
      success: true,
      message: "User ticket status updated successfully.",
    });
  } catch (error) {
    sendRouteError(res, error, "Failed to update user ticket status.");
  }
});

export default router;
