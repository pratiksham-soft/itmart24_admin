import { Router } from "express";
import {
  deleteUserPortalUser,
  listUserPortalUsers,
} from "../services/userPortalUsers.service";
import {
  addGuestReportDuplicateExclusion,
  getGuestReportTrackingDetails,
  listGuestReportDuplicateExclusions,
  listGuestFeedback,
  listGuestReportDuplicates,
  listGuestReports,
  removeGuestReportDuplicateExclusion,
} from "../services/guestReport.service";
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

router.get("/guest-feedback", async (_req, res) => {
  try {
    const feedback = await listGuestFeedback();
    res.json({
      success: true,
      count: feedback.length,
      data: feedback,
    });
  } catch (error) {
    console.error("Failed to fetch guest feedback:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch guest feedback",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.get("/guest-report-duplicates", async (req, res) => {
  try {
    const reportTypeParam = String(req.query.reportType ?? "").trim();
    const reportType =
      reportTypeParam === "SEO_HEALTH" ||
      reportTypeParam === "AI_VISIBILITY" ||
      reportTypeParam === "COMPETITOR_COMPARISON"
        ? reportTypeParam
        : undefined;

    const duplicates = await listGuestReportDuplicates({
      reportType,
      domain: String(req.query.domain ?? ""),
      limit: Number(req.query.limit ?? 100),
    });

    res.json({
      success: true,
      count: duplicates.length,
      data: duplicates,
    });
  } catch (error) {
    console.error("Failed to fetch duplicate guest report audit:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch duplicate guest report audit",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.get("/guest-report-duplicate-exclusions", async (_req, res) => {
  try {
    const exclusions = await listGuestReportDuplicateExclusions();
    res.json({
      success: true,
      count: exclusions.length,
      data: exclusions,
    });
  } catch (error) {
    console.error("Failed to fetch guest report duplicate exclusions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch guest report duplicate exclusions",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.post("/guest-report-duplicate-exclusions", async (req, res) => {
  try {
    const exclusion = await addGuestReportDuplicateExclusion({
      website: String(req.body?.website ?? ""),
      notes: typeof req.body?.notes === "string" ? req.body.notes : "",
    });

    res.status(201).json({
      success: true,
      message: "Excluded website saved successfully.",
      data: exclusion,
    });
  } catch (error) {
    console.error("Failed to save guest report duplicate exclusion:", error);
    res.status(400).json({
      success: false,
      message:
        error instanceof Error && error.message
          ? error.message
          : "Failed to save guest report duplicate exclusion",
    });
  }
});

router.delete("/guest-report-duplicate-exclusions/:exclusionId", async (req, res) => {
  try {
    const deleted = await removeGuestReportDuplicateExclusion(
      String(req.params.exclusionId ?? "")
    );

    res.json({
      success: true,
      message: "Excluded website removed successfully.",
      data: deleted,
    });
  } catch (error) {
    console.error("Failed to delete guest report duplicate exclusion:", error);
    res.status(404).json({
      success: false,
      message:
        error instanceof Error && error.message
          ? error.message
          : "Failed to delete guest report duplicate exclusion",
    });
  }
});

router.get("/guest-users/:guestReportId/tracking", async (req, res) => {
  try {
    const details = await getGuestReportTrackingDetails(
      String(req.params.guestReportId ?? "")
    );

    res.json({
      success: true,
      data: details,
    });
  } catch (error) {
    console.error("Failed to fetch guest tracking details:", error);
    res.status(404).json({
      success: false,
      message:
        error instanceof Error && error.message
          ? error.message
          : "Failed to fetch guest tracking details",
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
