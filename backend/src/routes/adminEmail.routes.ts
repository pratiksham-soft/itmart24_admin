import { Router } from "express";
import {
  requireAdminAuth,
  type AuthenticatedAdminRequest,
} from "../middleware/adminAuth.middleware";
import {
  createEmailAccount,
  deleteEmailAccount,
  deleteEmailMessage,
  downloadEmailAttachment,
  forwardEmailMessage,
  getEmailMessage,
  listEmailAccounts,
  listEmailFolders,
  listEmailMessages,
  markEmailFlagState,
  markEmailReadState,
  replyToEmailMessage,
  sendEmailMessage,
  testEmailAccountConnections,
  updateEmailAccount,
} from "../services/adminEmail.service";

const router = Router();

router.use(requireAdminAuth);

const parseAccountId = (value: string) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Email account id is invalid.");
  }

  return Math.floor(parsed);
};

const parseUid = (value: string) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Message uid is invalid.");
  }

  return Math.floor(parsed);
};

const sendRouteError = (res: any, error: unknown, fallback = "Request failed.") => {
  const message = error instanceof Error && error.message ? error.message : fallback;
  const status =
    /required|invalid|inactive|not found/i.test(message) ? 400 : 500;

  console.error("[admin-email]", fallback, error);

  res.status(status).json({
    success: false,
    message,
  });
};

router.get("/accounts", async (_req, res) => {
  try {
    const accounts = await listEmailAccounts();
    res.json({
      success: true,
      accounts,
    });
  } catch (error) {
    sendRouteError(res, error, "Failed to load email accounts.");
  }
});

router.post("/accounts", async (req, res) => {
  try {
    const account = await createEmailAccount(req.body ?? {});
    res.status(201).json({
      success: true,
      account,
    });
  } catch (error) {
    sendRouteError(res, error, "Failed to create email account.");
  }
});

router.put("/accounts/:id", async (req, res) => {
  try {
    const account = await updateEmailAccount(parseAccountId(String(req.params.id)), req.body ?? {});
    res.json({
      success: true,
      account,
    });
  } catch (error) {
    sendRouteError(res, error, "Failed to update email account.");
  }
});

router.delete("/accounts/:id", async (req, res) => {
  try {
    const result = await deleteEmailAccount(parseAccountId(String(req.params.id)));
    res.json(result);
  } catch (error) {
    sendRouteError(res, error, "Failed to disable email account.");
  }
});

router.post("/accounts/:id/test", async (req, res) => {
  try {
    const result = await testEmailAccountConnections(parseAccountId(String(req.params.id)));
    res.json(result);
  } catch (error) {
    sendRouteError(res, error, "Failed to test email account.");
  }
});

router.get("/accounts/:id/folders", async (req, res) => {
  try {
    const folders = await listEmailFolders(parseAccountId(String(req.params.id)));
    res.json({
      success: true,
      folders,
    });
  } catch (error) {
    sendRouteError(res, error, "Failed to load mail folders.");
  }
});

router.get("/accounts/:id/messages", async (req, res) => {
  try {
    const result = await listEmailMessages(parseAccountId(String(req.params.id)), {
      folder: typeof req.query.folder === "string" ? req.query.folder : undefined,
      page: typeof req.query.page === "string" ? Number(req.query.page) : undefined,
      limit: typeof req.query.limit === "string" ? Number(req.query.limit) : undefined,
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      unreadOnly:
        typeof req.query.unreadOnly === "string" ? req.query.unreadOnly : undefined,
      starredOnly:
        typeof req.query.starredOnly === "string" ? req.query.starredOnly : undefined,
      attachmentsOnly:
        typeof req.query.attachmentsOnly === "string"
          ? req.query.attachmentsOnly
          : undefined,
    });
    res.json(result);
  } catch (error) {
    sendRouteError(res, error, "Failed to load messages.");
  }
});

router.get("/accounts/:id/messages/:uid", async (req, res) => {
  try {
    const message = await getEmailMessage(
      parseAccountId(String(req.params.id)),
      parseUid(String(req.params.uid)),
      typeof req.query.folder === "string" ? req.query.folder : "INBOX"
    );
    res.json(message);
  } catch (error) {
    sendRouteError(res, error, "Failed to load message details.");
  }
});

router.get("/accounts/:id/messages/:uid/attachments/:attachmentId", async (req, res) => {
  try {
    const attachment = await downloadEmailAttachment(
      parseAccountId(String(req.params.id)),
      parseUid(String(req.params.uid)),
      typeof req.query.folder === "string" ? req.query.folder : "INBOX",
      String(req.params.attachmentId)
    );
    res.setHeader("Content-Type", attachment.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${attachment.filename.replace(/"/g, "")}"`
    );
    res.send(attachment.content);
  } catch (error) {
    sendRouteError(res, error, "Failed to download attachment.");
  }
});

router.post("/accounts/:id/send", async (req: AuthenticatedAdminRequest, res) => {
  try {
    const result = await sendEmailMessage(
      parseAccountId(String(req.params.id)),
      req.body ?? {},
      Number(req.adminUser?.id)
    );
    res.json(result);
  } catch (error) {
    sendRouteError(res, error, "Failed to send email.");
  }
});

router.post("/accounts/:id/reply", async (req: AuthenticatedAdminRequest, res) => {
  try {
    const result = await replyToEmailMessage(
      parseAccountId(String(req.params.id)),
      req.body ?? {},
      Number(req.adminUser?.id)
    );
    res.json(result);
  } catch (error) {
    sendRouteError(res, error, "Failed to send reply.");
  }
});

router.post("/accounts/:id/forward", async (req: AuthenticatedAdminRequest, res) => {
  try {
    const result = await forwardEmailMessage(
      parseAccountId(String(req.params.id)),
      req.body ?? {},
      Number(req.adminUser?.id)
    );
    res.json(result);
  } catch (error) {
    sendRouteError(res, error, "Failed to forward email.");
  }
});

router.post("/accounts/:id/messages/:uid/mark-read", async (req, res) => {
  try {
    const result = await markEmailReadState(
      parseAccountId(String(req.params.id)),
      parseUid(String(req.params.uid)),
      req.body ?? {}
    );
    res.json(result);
  } catch (error) {
    sendRouteError(res, error, "Failed to update read state.");
  }
});

router.post("/accounts/:id/messages/:uid/flag", async (req, res) => {
  try {
    const result = await markEmailFlagState(
      parseAccountId(String(req.params.id)),
      parseUid(String(req.params.uid)),
      req.body ?? {}
    );
    res.json(result);
  } catch (error) {
    sendRouteError(res, error, "Failed to update flag state.");
  }
});

router.delete("/accounts/:id/messages/:uid", async (req, res) => {
  try {
    const result = await deleteEmailMessage(
      parseAccountId(String(req.params.id)),
      parseUid(String(req.params.uid)),
      typeof req.query.folder === "string" ? req.query.folder : "INBOX"
    );
    res.json(result);
  } catch (error) {
    sendRouteError(res, error, "Failed to delete message.");
  }
});

export default router;
