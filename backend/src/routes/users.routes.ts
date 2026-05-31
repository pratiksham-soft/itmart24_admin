import { Router } from "express";
import {
  deleteUserPortalUser,
  listUserPortalUsers,
} from "../services/userPortalUsers.service";

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
