import { Router } from "express";
import {
  getTransparentGif,
  getUnsubscribeRecipientByToken,
  handleProviderWebhook,
  trackClickByToken,
  trackOpenByToken,
  unsubscribeByToken,
} from "../services/crmEmailTracking.service";

const router = Router();

const getRequestMeta = (req: any) => ({
  ipAddress: req.ip ?? req.headers["x-forwarded-for"] ?? null,
  userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
});

const renderUnsubscribePage = (
  email: string,
  token: string,
  state: "confirm" | "success" | "already_unsubscribed"
) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${state === "confirm" ? "Unsubscribe" : "Unsubscribed"} | ITMart24</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }
      .card { max-width: 560px; margin: 56px auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 32px; box-shadow: 0 16px 32px rgba(15, 23, 42, 0.06); }
      h1 { margin: 0 0 12px; font-size: 28px; }
      p { line-height: 1.6; color: #475569; }
      button.button { display: inline-block; margin-top: 16px; padding: 12px 18px; border-radius: 12px; background: #2563eb; color: #ffffff; text-decoration: none; font-weight: 600; border: 0; cursor: pointer; font-size: 14px; }
      .small { margin-top: 16px; font-size: 13px; color: #64748b; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${
        state === "confirm"
          ? "Unsubscribe from emails?"
          : state === "already_unsubscribed"
            ? "You are already unsubscribed."
            : "You have been unsubscribed."
      }</h1>
      <p>${
        state === "confirm"
          ? `If these emails are not helpful for <strong>${email}</strong>, you can unsubscribe now.`
          : `We will stop future campaign emails to <strong>${email}</strong>.`
      }</p>
      ${
        state === "confirm"
          ? `<form method="POST" action="/api/public/crm/email-track/unsubscribe/${token}/confirm">
              <button class="button" type="submit">Yes, unsubscribe me</button>
            </form>`
          : `<p class="small">You can close this page now.</p>`
      }
    </div>
  </body>
</html>`;

const handleUnsubscribeConfirmation = async (req: any, res: any) => {
  try {
    const result = await unsubscribeByToken(String(req.params.recipientTrackingToken));
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(
      renderUnsubscribePage(
        result.email,
        String(req.params.recipientTrackingToken),
        result.alreadyUnsubscribed ? "already_unsubscribed" : "success"
      )
    );
  } catch (error) {
    res.status(400).send("Unable to unsubscribe this email.");
  }
};

router.get("/open/:recipientTrackingToken.gif", async (req, res) => {
  try {
    await trackOpenByToken(String(req.params.recipientTrackingToken), getRequestMeta(req));
  } catch (error) {
    console.error("CRM email open tracking error:", error instanceof Error ? error.message : error);
  }

  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.send(getTransparentGif());
});

router.get("/click/:clickToken", async (req, res) => {
  try {
    const result = await trackClickByToken(String(req.params.clickToken), getRequestMeta(req));
    res.redirect(result.url);
  } catch (error) {
    res.status(404).send("Tracking link is invalid.");
  }
});

router.get("/unsubscribe/:recipientTrackingToken", async (req, res) => {
  try {
    const recipient = await getUnsubscribeRecipientByToken(String(req.params.recipientTrackingToken));
    if (!recipient) {
      res.status(404).send("Unsubscribe link is invalid.");
      return;
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(
      renderUnsubscribePage(
        String(recipient.email ?? ""),
        String(req.params.recipientTrackingToken),
        recipient.unsubscribed_at || recipient.status === "unsubscribed" ? "already_unsubscribed" : "confirm"
      )
    );
  } catch (error) {
    res.status(500).send("Unable to load unsubscribe page.");
  }
});

router.get("/unsubscribe/:recipientTrackingToken/confirm", handleUnsubscribeConfirmation);
router.post("/unsubscribe/:recipientTrackingToken/confirm", handleUnsubscribeConfirmation);

router.post("/webhook/provider", async (req, res) => {
  try {
    const data = await handleProviderWebhook((req.body ?? {}) as Record<string, unknown>);
    res.json({ success: true, data });
  } catch (error) {
    console.error("CRM provider webhook error:", error instanceof Error ? error.message : error);
    res.status(400).json({
      success: false,
      message: "Webhook payload could not be processed.",
    });
  }
});

export default router;
