import { Router } from "express";
import { requireAdminAuth, type AuthenticatedAdminRequest } from "../middleware/adminAuth.middleware";
import {
  getHeaderAccountIconSettings,
  getPublicHeaderAccountIconSettings,
  updateHeaderAccountIconSettings,
} from "../services/userPortalHeaderSettings.service";

const router = Router();

router.get("/public/header-account-icon", async (_req, res) => {
  try {
    const settings = await getPublicHeaderAccountIconSettings();
    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error("Public user settings fetch error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user settings.",
    });
  }
});

router.get("/header-account-icon", requireAdminAuth, async (_req, res) => {
  try {
    const settings = await getHeaderAccountIconSettings();
    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error("User settings fetch error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user settings.",
    });
  }
});

router.put("/header-account-icon", requireAdminAuth, async (req: AuthenticatedAdminRequest, res) => {
  try {
    const settings = await updateHeaderAccountIconSettings({
      clickEnabled: req.body?.clickEnabled,
      updatedByAdminId: req.adminUser?.id ?? null,
      updatedByAdminEmail: req.adminUser?.email ?? null,
    });

    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error("User settings update error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update user settings.",
    });
  }
});

export default router;
