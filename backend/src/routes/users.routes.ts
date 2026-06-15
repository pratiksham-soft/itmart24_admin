import { Router } from "express";
import {
  deleteUserPortalUser,
  listUserPortalUsers,
} from "../services/userPortalUsers.service";
import { listGuestReports } from "../services/guestReport.service";
import {
  getUserPortalAccessDetails,
  updateUserPortalAccessDetails,
} from "../services/userPortalUserAccess.service";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const users = await listUserPortalUsers();
    res.json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    console.error("Failed to fetch registered users:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch registered users",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.get("/guest-users", async (_req, res) => {
  try {
    const reports = await listGuestReports();
    res.json({
      success: true,
      count: reports.length,
      data: reports,
    });
  } catch (error) {
    console.error("Failed to fetch guest users report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch guest users report",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.get("/:userId/access", async (req, res) => {
  try {
    const accessDetails = await getUserPortalAccessDetails(
      String(req.params.userId ?? "")
    );

    res.json({
      success: true,
      data: accessDetails,
    });
  } catch (error) {
    console.error("Failed to fetch user access details:", error);
    res.status(400).json({
      success: false,
      message:
        error instanceof Error && error.message
          ? error.message
          : "Failed to fetch user access details",
    });
  }
});

router.put("/:userId/access", async (req, res) => {
  try {
    const accessDetails = await updateUserPortalAccessDetails(
      String(req.params.userId ?? ""),
      {
        unlimitedAccess: Boolean(req.body?.unlimitedAccess),
        expiresAt:
          typeof req.body?.expiresAt === "string" && req.body.expiresAt.trim()
            ? req.body.expiresAt
            : null,
        featureLimits:
          req.body?.featureLimits && typeof req.body.featureLimits === "object"
            ? req.body.featureLimits
            : {},
      }
    );

    res.json({
      success: true,
      message: "User access settings updated successfully.",
      data: accessDetails,
    });
  } catch (error) {
    console.error("Failed to update user access details:", error);
    res.status(400).json({
      success: false,
      message:
        error instanceof Error && error.message
          ? error.message
          : "Failed to update user access details",
    });
  }
});

router.delete("/:userId", async (req, res) => {
  try {
    const deletedUser = await deleteUserPortalUser({
      userId: String(req.params.userId ?? ""),
      confirmationName: String(req.body?.confirmationName ?? ""),
    });

    res.json({
      success: true,
      message: "Registered user deleted successfully.",
      data: deletedUser,
    });
  } catch (error) {
    console.error("Failed to delete registered user:", error);
    res.status(400).json({
      success: false,
      message:
        error instanceof Error && error.message
          ? error.message
          : "Failed to delete registered user",
    });
  }
});

export default router;
