import crypto from "crypto";
import { getAnalyticsPool } from "./analyticsPostgres.service";

type JsonRecord = Record<string, unknown>;

type TrackingRequestMeta = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

type CampaignLike = {
  id: number;
  name?: string | null;
  subject: string;
  body?: string | null;
  bodyHtml?: string | null;
  bodyText?: string | null;
  bodyMode?: "html" | "text";
  trackOpens?: boolean;
  trackClicks?: boolean;
  unsubscribeRequired?: boolean;
};

type RecipientLike = {
  id: number;
  campaignId: number;
  leadId: number | null;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  contactName?: string | null;
  companyName?: string | null;
  website?: string | null;
  jobTitle?: string | null;
  trackingToken?: string | null;
};

type RecipientAction =
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "replied"
  | "bounced"
  | "complained"
  | "unsubscribed"
  | "failed"
  | "blocked"
  | "skipped"
  | "queued";

const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
  "base64"
);

const TRACKING_ALLOWED_HOSTS = new Set([
  "itmart24.com",
  "www.itmart24.com",
  "user.itmart24.com",
  "vendor.itmart24.com",
  "admin.itmart24.com",
]);

const BOT_USER_AGENT_PATTERN =
  /(googleimageproxy|google-read-aloud|googlebot|bingbot|yandex|linkedinbot|slackbot|discordbot|whatsapp|telegrambot|facebookexternalhit|meta-externalagent|outlook|microsoft office|thunderbird|applewebkit\/605\.1\.15 \(khtml, like gecko\) mobile\/|mail\.ru|proofpoint)/i;

const toTrimmedString = (value: unknown) => String(value ?? "").trim();

const readErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

let hasWarnedMissingTrackingBaseUrl = false;

const getTrackingBaseUrl = () => {
  const configuredBaseUrl = (
    process.env.CRM_PUBLIC_TRACKING_BASE_URL ||
    process.env.CRM_EMAIL_TRACKING_BASE_URL ||
    process.env.PUBLIC_TRACKING_BASE_URL ||
    process.env.PUBLIC_API_BASE_URL ||
    process.env.PUBLIC_APP_URL ||
    process.env.APP_BASE_URL ||
    ""
  ).trim();

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, "");
  }

  if (!hasWarnedMissingTrackingBaseUrl) {
    console.warn(
      "CRM public tracking base URL is not configured. Set CRM_PUBLIC_TRACKING_BASE_URL for production-safe tracking links."
    );
    hasWarnedMissingTrackingBaseUrl = true;
  }

  return "http://localhost:5000";
};

const generateTrackingToken = () => crypto.randomBytes(24).toString("hex");

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const stripHtmlToText = (value: string) =>
  value
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();

const isAllowedTrackingUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? TRACKING_ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())
      : false;
  } catch {
    return false;
  }
};

const isBotUserAgent = (userAgent?: string | null) =>
  Boolean(userAgent && BOT_USER_AGENT_PATTERN.test(userAgent));

const replaceCampaignVariables = (
  template: string,
  recipient: RecipientLike,
  extra: Record<string, string>
) =>
  [
    ["{{firstName}}", recipient.firstName ?? ""],
    ["{{lastName}}", recipient.lastName ?? ""],
    ["{{contactName}}", recipient.contactName ?? [recipient.firstName, recipient.lastName].filter(Boolean).join(" ")],
    ["{{companyName}}", recipient.companyName ?? ""],
    ["{{email}}", recipient.email ?? ""],
    ["{{website}}", recipient.website ?? ""],
    ["{{jobTitle}}", recipient.jobTitle ?? ""],
    ["{{unsubscribeUrl}}", extra.unsubscribeUrl ?? ""],
    ["{{unsubscribeLink}}", extra.unsubscribeUrl ?? ""],
    ["{{unsubscribe_url}}", extra.unsubscribeUrl ?? ""],
    ["{{agencyOfferUrl}}", extra.agencyOfferUrl ?? ""],
  ].reduce((content, [token, replacement]) => content.split(token).join(replacement), template);

const appendUnsubscribeFooterIfMissing = (content: string, bodyMode: "html" | "text", unsubscribeUrl: string) => {
  if (
    content.includes("{{unsubscribeUrl}}") ||
    content.includes("{{unsubscribeLink}}") ||
    content.includes("{{unsubscribe_url}}") ||
    content.includes(unsubscribeUrl)
  ) {
    return content;
  }

  if (bodyMode === "html") {
    return `${content}<p style="margin-top:24px;font-size:12px;color:#64748b;">If this is not relevant, you can <a href="${escapeHtml(
      unsubscribeUrl
    )}" target="_blank" rel="noopener noreferrer">unsubscribe here</a>.</p>`;
  }

  return `${content}\n\nIf this is not relevant, you can unsubscribe here: ${unsubscribeUrl}`;
};

const ensureTrackingToken = async (recipientId: number, existingToken?: string | null) => {
  if (existingToken) {
    return existingToken;
  }

  const token = generateTrackingToken();
  const pool = await getAnalyticsPool();
  await pool.query(
    `
      UPDATE crm_campaign_recipients
      SET tracking_token = $2,
          updated_at = NOW()
      WHERE id = $1
    `,
    [recipientId, token]
  );
  return token;
};

const insertEvent = async (payload: {
  campaignId: number | null;
  recipientId: number | null;
  leadId: number | null;
  eventType: string;
  eventSource: string;
  email?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  url?: string | null;
  metadata?: JsonRecord;
}) => {
  const pool = await getAnalyticsPool();
  await pool.query(
    `
      INSERT INTO crm_email_events (
        campaign_id,
        recipient_id,
        lead_id,
        event_type,
        event_source,
        email,
        ip_address,
        user_agent,
        url,
        metadata,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW())
    `,
    [
      payload.campaignId,
      payload.recipientId,
      payload.leadId,
      payload.eventType,
      payload.eventSource,
      payload.email ?? null,
      payload.ipAddress ?? null,
      payload.userAgent ?? null,
      payload.url ?? null,
      JSON.stringify(payload.metadata ?? {}),
    ]
  );
};

const updateLeadForEvent = async (
  leadId: number | null,
  campaignId: number,
  campaignName: string | null,
  eventType: RecipientAction,
  metadata?: JsonRecord
) => {
  if (!leadId) {
    return;
  }

  const pool = await getAnalyticsPool();
  if (eventType === "sent") {
    await pool.query(
      `
        UPDATE crm_leads
        SET last_email_sent_at = NOW(),
            email_sent_count = COALESCE(email_sent_count, 0) + 1,
            last_campaign_name = $2,
            last_campaign_status = 'sent',
            last_campaign_id = $3,
            updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [leadId, campaignName, String(campaignId)]
    );
    return;
  }
  if (eventType === "opened") {
    await pool.query(
      `
        UPDATE crm_leads
        SET last_email_opened_at = NOW(),
            email_open_count = COALESCE(email_open_count, 0) + 1,
            updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [leadId]
    );
    return;
  }
  if (eventType === "clicked") {
    await pool.query(
      `
        UPDATE crm_leads
        SET last_email_clicked_at = NOW(),
            email_click_count = COALESCE(email_click_count, 0) + 1,
            updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [leadId]
    );
    return;
  }
  if (eventType === "replied") {
    await pool.query(
      `
        UPDATE crm_leads
        SET last_email_replied_at = NOW(),
            email_reply_count = COALESCE(email_reply_count, 0) + 1,
            last_campaign_status = 'replied',
            updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [leadId]
    );
    return;
  }
  if (eventType === "bounced") {
    const bounceType = toTrimmedString(metadata?.bounceType).toLowerCase() || "unknown";
    await pool.query(
      `
        UPDATE crm_leads
        SET bounced = CASE WHEN $2 = 'hard' THEN TRUE ELSE bounced END,
            bounce_type = $2,
            last_campaign_status = 'bounced',
            updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [leadId, bounceType]
    );
    return;
  }
  if (eventType === "complained") {
    await pool.query(
      `
        UPDATE crm_leads
        SET spam_complaint = TRUE,
            do_not_contact = TRUE,
            email_consent_status = 'do_not_contact',
            last_campaign_status = 'complained',
            updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [leadId]
    );
    return;
  }
  if (eventType === "unsubscribed") {
    await pool.query(
      `
        UPDATE crm_leads
        SET unsubscribed = TRUE,
            email_consent_status = 'unsubscribed',
            last_campaign_status = 'unsubscribed',
            updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [leadId]
    );
  }
};

const loadRecipientByTrackingToken = async (trackingToken: string) => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      SELECT recipient.*, campaign.name AS campaign_name, COALESCE(lead.unsubscribed, FALSE) AS lead_unsubscribed
      FROM crm_campaign_recipients recipient
      LEFT JOIN crm_campaigns campaign ON campaign.id = recipient.campaign_id
      LEFT JOIN crm_leads lead ON lead.id = recipient.lead_id
      WHERE recipient.tracking_token = $1
      LIMIT 1
    `,
    [trackingToken]
  );
  return (result.rows[0] as Record<string, unknown>) ?? null;
};

export const buildTrackedCampaignContent = async (campaign: CampaignLike, recipient: RecipientLike) => {
  const trackingToken = await ensureTrackingToken(recipient.id, recipient.trackingToken ?? null);
  const trackingBaseUrl = getTrackingBaseUrl();
  const unsubscribeUrl = `${trackingBaseUrl}/api/public/crm/email-track/unsubscribe/${trackingToken}`;
  const agencyOfferUrl = "https://itmart24.com/agency-partner";
  const bodyMode = campaign.bodyMode === "text" ? "text" : "html";

  const rawHtml = String(campaign.bodyHtml ?? campaign.body ?? "").trim();
  const rawText =
    String(campaign.bodyText ?? "").trim() ||
    (bodyMode === "html" && rawHtml ? stripHtmlToText(rawHtml) : String(campaign.body ?? "").trim());

  let htmlBody =
    bodyMode === "html"
      ? replaceCampaignVariables(rawHtml, recipient, { unsubscribeUrl, agencyOfferUrl })
      : "";
  let textBody = replaceCampaignVariables(rawText, recipient, { unsubscribeUrl, agencyOfferUrl });

  if (campaign.unsubscribeRequired !== false) {
    if (bodyMode === "html") {
      htmlBody = appendUnsubscribeFooterIfMissing(htmlBody, "html", unsubscribeUrl);
    }
    textBody = appendUnsubscribeFooterIfMissing(textBody, "text", unsubscribeUrl);
  }

  const pool = await getAnalyticsPool();
  await pool.query(`DELETE FROM crm_email_links WHERE recipient_id = $1`, [recipient.id]);

  if (campaign.trackClicks !== false && bodyMode === "html" && htmlBody) {
    const hrefPattern = /href=(["'])(https?:\/\/[^"'<>]+)\1/gi;
    const replacements = new Map<string, string>();
    let match: RegExpExecArray | null;
    while ((match = hrefPattern.exec(htmlBody))) {
      const originalUrl = match[2];
      if (!isAllowedTrackingUrl(originalUrl) || replacements.has(originalUrl)) {
        continue;
      }
      const clickToken = generateTrackingToken();
      const trackingUrl = `${trackingBaseUrl}/api/public/crm/email-track/click/${clickToken}`;
      await pool.query(
        `
          INSERT INTO crm_email_links (
            campaign_id,
            recipient_id,
            lead_id,
            click_token,
            original_url,
            tracking_url,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `,
        [campaign.id, recipient.id, recipient.leadId, clickToken, originalUrl, trackingUrl]
      );
      replacements.set(originalUrl, trackingUrl);
    }

    replacements.forEach((trackingUrl, originalUrl) => {
      htmlBody = htmlBody.split(originalUrl).join(trackingUrl);
      textBody = textBody.split(originalUrl).join(trackingUrl);
    });
  }

  if (campaign.trackOpens !== false && bodyMode === "html" && htmlBody) {
    htmlBody += `<img src="${trackingBaseUrl}/api/public/crm/email-track/open/${trackingToken}.gif" width="1" height="1" alt="" style="display:block;border:0;outline:none;width:1px;height:1px;" />`;
  }

  return {
    trackingToken,
    subject: replaceCampaignVariables(campaign.subject, recipient, { unsubscribeUrl, agencyOfferUrl }),
    bodyHtml: bodyMode === "html" ? htmlBody : null,
    bodyText: textBody,
    unsubscribeUrl,
    agencyOfferUrl,
  };
};

export const applyRecipientEvent = async (
  recipientRow: Record<string, unknown>,
  eventType: RecipientAction,
  eventSource: string,
  meta: TrackingRequestMeta & {
    url?: string | null;
    metadata?: JsonRecord;
    failureReason?: string | null;
    blockedReason?: string | null;
    skipReason?: string | null;
    bounceType?: string | null;
    bounceReason?: string | null;
  } = {}
) => {
  const pool = await getAnalyticsPool();
  const campaignId = Number(recipientRow.campaign_id ?? recipientRow.campaignId ?? 0);
  const recipientId = Number(recipientRow.id ?? 0);
  const leadId =
    recipientRow.lead_id == null && recipientRow.leadId == null
      ? null
      : Number(recipientRow.lead_id ?? recipientRow.leadId);
  const email = toTrimmedString(recipientRow.email) || null;
  const campaignName = recipientRow.campaign_name ? String(recipientRow.campaign_name) : null;

  const updateSqlByEvent: Record<RecipientAction, string> = {
    queued: `status = 'queued'`,
    skipped: `status = 'skipped', skip_reason = $3`,
    blocked: `status = 'blocked', blocked_reason = $3`,
    sent: `status = 'sent', sent_at = NOW(), message_id = COALESCE($3, message_id), provider_message_id = COALESCE($4, provider_message_id)`,
    delivered: `status = CASE WHEN status IN ('replied','clicked','opened','complained','unsubscribed','bounced') THEN status ELSE 'delivered' END, delivered_at = COALESCE(delivered_at, NOW())`,
    opened: `status = CASE WHEN status IN ('sent','delivered') THEN 'opened' ELSE status END, first_opened_at = COALESCE(first_opened_at, NOW()), last_opened_at = NOW(), open_count = COALESCE(open_count, 0) + 1`,
    clicked: `status = CASE WHEN status IN ('sent','delivered','opened') THEN 'clicked' ELSE status END, first_clicked_at = COALESCE(first_clicked_at, NOW()), last_clicked_at = NOW(), click_count = COALESCE(click_count, 0) + 1`,
    replied: `status = 'replied', replied_at = COALESCE(replied_at, NOW())`,
    bounced: `status = 'bounced', bounce_at = COALESCE(bounce_at, NOW()), bounce_type = $3, bounce_reason = $4`,
    complained: `status = 'complained', complained_at = COALESCE(complained_at, NOW())`,
    unsubscribed: `status = 'unsubscribed', unsubscribed_at = COALESCE(unsubscribed_at, NOW())`,
    failed: `status = 'failed', failed_at = COALESCE(failed_at, NOW()), failure_reason = $3`,
  };

  let params: unknown[] = [recipientId, eventType];
  if (eventType === "skipped") {
    params = [recipientId, eventType, meta.skipReason ?? null];
  } else if (eventType === "blocked") {
    params = [recipientId, eventType, meta.blockedReason ?? null];
  } else if (eventType === "sent") {
    params = [
      recipientId,
      eventType,
      toTrimmedString(meta.metadata?.messageId) || null,
      toTrimmedString(meta.metadata?.providerMessageId) || null,
    ];
  } else if (eventType === "bounced") {
    params = [recipientId, eventType, meta.bounceType ?? "unknown", meta.bounceReason ?? null];
  } else if (eventType === "failed") {
    params = [recipientId, eventType, meta.failureReason ?? null];
  }

  await pool.query(
    `
      UPDATE crm_campaign_recipients
      SET ${updateSqlByEvent[eventType]},
          last_event_type = $2,
          last_event_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `,
    params
  );

  await insertEvent({
    campaignId,
    recipientId,
    leadId,
    eventType,
    eventSource,
    email,
    ipAddress: meta.ipAddress ?? null,
    userAgent: meta.userAgent ?? null,
    url: meta.url ?? null,
    metadata: meta.metadata ?? {},
  });

  await updateLeadForEvent(leadId, campaignId, campaignName, eventType, {
    ...meta.metadata,
    bounceType: meta.bounceType ?? null,
  });
};

export const trackOpenByToken = async (trackingToken: string, meta: TrackingRequestMeta) => {
  const recipient = await loadRecipientByTrackingToken(trackingToken);
  if (!recipient) {
    return { ok: false };
  }

  await applyRecipientEvent(recipient, "opened", isBotUserAgent(meta.userAgent) ? "tracking_pixel_bot" : "tracking_pixel", meta);
  return { ok: true };
};

export const trackClickByToken = async (clickToken: string, meta: TrackingRequestMeta) => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      SELECT link.*, recipient.email, recipient.campaign_id, campaign.name AS campaign_name
      FROM crm_email_links link
      INNER JOIN crm_campaign_recipients recipient ON recipient.id = link.recipient_id
      LEFT JOIN crm_campaigns campaign ON campaign.id = link.campaign_id
      WHERE link.click_token = $1
      LIMIT 1
    `,
    [clickToken]
  );
  const row = (result.rows[0] as Record<string, unknown>) ?? null;
  if (!row) {
    throw new Error("Tracking link not found.");
  }

  const originalUrl = String(row.original_url ?? "");
  if (!isAllowedTrackingUrl(originalUrl)) {
    throw new Error("Tracking link destination is not allowed.");
  }

  await pool.query(
    `
      INSERT INTO crm_email_clicks (
        campaign_id,
        recipient_id,
        lead_id,
        original_url,
        tracking_url,
        clicked_at,
        ip_address,
        user_agent
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7)
    `,
    [
      Number(row.campaign_id ?? 0),
      Number(row.recipient_id ?? 0),
      row.lead_id == null ? null : Number(row.lead_id),
      originalUrl,
      toTrimmedString(row.tracking_url) || null,
      meta.ipAddress ?? null,
      meta.userAgent ?? null,
    ]
  );

  await applyRecipientEvent(
    {
      id: Number(row.recipient_id ?? 0),
      campaign_id: Number(row.campaign_id ?? 0),
      lead_id: row.lead_id == null ? null : Number(row.lead_id),
      email: row.email,
      campaign_name: row.campaign_name,
    },
    "clicked",
    "redirect_link",
    { ...meta, url: originalUrl }
  );

  return { url: originalUrl };
};

export const getUnsubscribeRecipientByToken = async (trackingToken: string) => {
  return loadRecipientByTrackingToken(trackingToken);
};

export const unsubscribeByToken = async (
  trackingToken: string,
  source = "unsubscribe_link",
  reason?: string | null
) => {
  const recipient = await loadRecipientByTrackingToken(trackingToken);
  if (!recipient) {
    throw new Error("Unsubscribe token is invalid.");
  }

  const recipientId = Number(recipient.id ?? 0);
  const leadId = recipient.lead_id == null ? null : Number(recipient.lead_id);
  const campaignId = Number(recipient.campaign_id ?? 0);
  const email = String(recipient.email ?? "");
  const pool = await getAnalyticsPool();
  const alreadyUnsubscribed =
    Boolean(recipient.unsubscribed_at) ||
    String(recipient.status ?? "").toLowerCase() === "unsubscribed" ||
    Boolean(recipient.lead_unsubscribed);

  if (!alreadyUnsubscribed) {
    await pool.query(
      `
        INSERT INTO crm_email_unsubscribes (
          lead_id,
          email,
          campaign_id,
          recipient_id,
          reason,
          unsubscribed_at,
          source
        )
        VALUES ($1, $2, $3, $4, $5, NOW(), $6)
      `,
      [leadId, email, campaignId, recipientId, reason ?? null, source]
    );

    await applyRecipientEvent(recipient, "unsubscribed", source, {
      metadata: { reason: reason ?? null },
    });
  }

  return {
    email,
    campaignId,
    alreadyUnsubscribed,
  };
};

const normalizeWebhookEventType = (value: unknown): RecipientAction | null => {
  const normalized = toTrimmedString(value).toLowerCase();
  if (["bounce", "bounced"].includes(normalized)) return "bounced";
  if (["complaint", "spamreport", "abuse", "marked_spam", "complained"].includes(normalized)) return "complained";
  if (["delivered", "delivery"].includes(normalized)) return "delivered";
  if (["failed", "dropped"].includes(normalized)) return "failed";
  if (["queued"].includes(normalized)) return "queued";
  return null;
};

export const handleProviderWebhook = async (payload: Record<string, unknown>) => {
  const events = Array.isArray(payload.events) ? (payload.events as Array<Record<string, unknown>>) : [payload];
  const pool = await getAnalyticsPool();
  const results: Array<{ eventType: string; matched: boolean }> = [];

  for (const event of events) {
    const eventType = normalizeWebhookEventType(event.event_type ?? event.type ?? event.event);
    if (!eventType) {
      results.push({ eventType: toTrimmedString(event.event_type ?? event.type ?? event.event) || "unknown", matched: false });
      continue;
    }

    const providerMessageId =
      toTrimmedString(event.provider_message_id) ||
      toTrimmedString(event.message_id) ||
      toTrimmedString(event.smtp_id) ||
      "";
    const email = toTrimmedString(event.email || event.recipient).toLowerCase();
    const campaignId = Number(event.campaign_id ?? 0);

    const lookup = await pool.query(
      `
        SELECT recipient.*, campaign.name AS campaign_name
        FROM crm_campaign_recipients recipient
        LEFT JOIN crm_campaigns campaign ON campaign.id = recipient.campaign_id
        WHERE (
          ($1 <> '' AND (recipient.provider_message_id = $1 OR recipient.message_id = $1))
          OR ($2 <> '' AND LOWER(recipient.email) = $2 AND ($3 = 0 OR recipient.campaign_id = $3))
        )
        ORDER BY recipient.id DESC
        LIMIT 1
      `,
      [providerMessageId, email, campaignId]
    );

    const recipient = (lookup.rows[0] as Record<string, unknown>) ?? null;
    if (!recipient) {
      results.push({ eventType, matched: false });
      continue;
    }

    await applyRecipientEvent(recipient, eventType, "webhook", {
      failureReason: toTrimmedString(event.reason || event.failure_reason) || null,
      bounceType: toTrimmedString(event.bounce_type || event.severity) || "unknown",
      bounceReason: toTrimmedString(event.reason || event.bounce_reason) || null,
      metadata: event,
    });
    results.push({ eventType, matched: true });
  }

  return {
    processed: results.length,
    matched: results.filter((entry) => entry.matched).length,
    results,
  };
};

export const markCampaignRecipientAction = async (
  campaignId: number,
  recipientId: number,
  action: "bounced" | "replied" | "complained" | "unsubscribed" | "do_not_contact",
  payload?: Record<string, unknown>
) => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      SELECT recipient.*, campaign.name AS campaign_name
      FROM crm_campaign_recipients recipient
      LEFT JOIN crm_campaigns campaign ON campaign.id = recipient.campaign_id
      WHERE recipient.campaign_id = $1 AND recipient.id = $2
      LIMIT 1
    `,
    [campaignId, recipientId]
  );
  const recipient = (result.rows[0] as Record<string, unknown>) ?? null;
  if (!recipient) {
    throw new Error("Campaign recipient not found.");
  }

  if (action === "do_not_contact") {
    if (recipient.lead_id != null) {
      await pool.query(
        `
          UPDATE crm_leads
          SET do_not_contact = TRUE,
              email_consent_status = 'do_not_contact',
              updated_at = NOW()
          WHERE id = $1 AND deleted_at IS NULL
        `,
        [Number(recipient.lead_id)]
      );
    }
    await applyRecipientEvent(recipient, "blocked", "admin_manual", {
      blockedReason: "Marked as do not contact by admin.",
      metadata: payload ?? {},
    });
    return;
  }

  if (action === "bounced") {
    await applyRecipientEvent(recipient, "bounced", "admin_manual", {
      bounceType: toTrimmedString(payload?.bounceType) || "unknown",
      bounceReason: toTrimmedString(payload?.bounceReason) || null,
      metadata: payload ?? {},
    });
    return;
  }

  if (action === "replied") {
    await applyRecipientEvent(recipient, "replied", "admin_manual", {
      metadata: payload ?? {},
    });
    return;
  }

  if (action === "complained") {
    await applyRecipientEvent(recipient, "complained", "admin_manual", {
      metadata: payload ?? {},
    });
    return;
  }

  if (action === "unsubscribed") {
    await unsubscribeByToken(String(recipient.tracking_token ?? ""), "admin_manual", toTrimmedString(payload?.reason) || null);
  }
};

export const getCampaignTrackingOverview = async (campaignId: number) => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      SELECT
        COUNT(*)::int AS total_recipients,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
        COUNT(*) FILTER (WHERE status = 'skipped')::int AS skipped_count,
        COUNT(*) FILTER (WHERE status = 'blocked')::int AS blocked_count,
        COUNT(*) FILTER (WHERE status = 'queued')::int AS queued_count,
        COUNT(*) FILTER (WHERE sent_at IS NOT NULL OR status IN ('sent','delivered','opened','clicked','replied','bounced','complained','unsubscribed','failed'))::int AS sent_count,
        COUNT(*) FILTER (WHERE delivered_at IS NOT NULL OR status IN ('delivered','opened','clicked','replied','bounced','complained','unsubscribed'))::int AS delivered_count,
        COUNT(*) FILTER (WHERE first_opened_at IS NOT NULL)::int AS opened_unique_count,
        COALESCE(SUM(open_count), 0)::int AS opened_total_count,
        COUNT(*) FILTER (WHERE first_clicked_at IS NOT NULL)::int AS clicked_unique_count,
        COALESCE(SUM(click_count), 0)::int AS clicked_total_count,
        COUNT(*) FILTER (WHERE replied_at IS NOT NULL OR status = 'replied')::int AS replied_count,
        COUNT(*) FILTER (WHERE bounce_at IS NOT NULL OR status = 'bounced')::int AS bounced_count,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(bounce_type, '')) = 'hard')::int AS hard_bounced_count,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(bounce_type, '')) = 'soft')::int AS soft_bounced_count,
        COUNT(*) FILTER (WHERE complained_at IS NOT NULL OR status = 'complained')::int AS complained_count,
        COUNT(*) FILTER (WHERE unsubscribed_at IS NOT NULL OR status = 'unsubscribed')::int AS unsubscribed_count,
        COUNT(*) FILTER (WHERE failed_at IS NOT NULL OR status = 'failed')::int AS failed_count
      FROM crm_campaign_recipients
      WHERE campaign_id = $1
    `,
    [campaignId]
  );
  const row = (result.rows[0] as Record<string, unknown>) ?? {};
  const sentBase = Number(row.delivered_count ?? row.sent_count ?? 0);
  const sentCount = Number(row.sent_count ?? 0);
  const safeRate = (numerator: number, denominator: number) =>
    denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(2)) : 0;

  return {
    totalRecipients: Number(row.total_recipients ?? 0),
    pending: Number(row.pending_count ?? 0),
    skipped: Number(row.skipped_count ?? 0),
    blocked: Number(row.blocked_count ?? 0),
    queued: Number(row.queued_count ?? 0),
    sent: sentCount,
    delivered: Number(row.delivered_count ?? 0),
    openedUnique: Number(row.opened_unique_count ?? 0),
    openedTotal: Number(row.opened_total_count ?? 0),
    clickedUnique: Number(row.clicked_unique_count ?? 0),
    clickedTotal: Number(row.clicked_total_count ?? 0),
    replied: Number(row.replied_count ?? 0),
    bounced: Number(row.bounced_count ?? 0),
    hardBounced: Number(row.hard_bounced_count ?? 0),
    softBounced: Number(row.soft_bounced_count ?? 0),
    complained: Number(row.complained_count ?? 0),
    unsubscribed: Number(row.unsubscribed_count ?? 0),
    failed: Number(row.failed_count ?? 0),
    sendRate: safeRate(sentCount, Number(row.total_recipients ?? 0)),
    openRate: safeRate(Number(row.opened_unique_count ?? 0), sentBase || sentCount),
    clickRate: safeRate(Number(row.clicked_unique_count ?? 0), sentBase || sentCount),
    replyRate: safeRate(Number(row.replied_count ?? 0), sentBase || sentCount),
    bounceRate: safeRate(Number(row.bounced_count ?? 0), sentCount),
    complaintRate: safeRate(Number(row.complained_count ?? 0), sentCount),
    unsubscribeRate: safeRate(Number(row.unsubscribed_count ?? 0), sentBase || sentCount),
  };
};

export const listCampaignEvents = async (campaignId: number, page = 1, limit = 25) => {
  const offset = Math.max(0, (page - 1) * limit);
  const pool = await getAnalyticsPool();
  const [itemsResult, countResult] = await Promise.all([
    pool.query(
      `
        SELECT *
        FROM crm_email_events
        WHERE campaign_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2 OFFSET $3
      `,
      [campaignId, limit, offset]
    ),
    pool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM crm_email_events
        WHERE campaign_id = $1
      `,
      [campaignId]
    ),
  ]);

  return {
    items: itemsResult.rows,
    pagination: {
      page,
      limit,
      total: Number((countResult.rows[0] as { total: number }).total ?? 0),
      totalPages: Math.ceil(Number((countResult.rows[0] as { total: number }).total ?? 0) / limit) || 0,
    },
  };
};

export const listCampaignClicks = async (campaignId: number, page = 1, limit = 25) => {
  const offset = Math.max(0, (page - 1) * limit);
  const pool = await getAnalyticsPool();
  const [itemsResult, countResult] = await Promise.all([
    pool.query(
      `
        SELECT *
        FROM crm_email_clicks
        WHERE campaign_id = $1
        ORDER BY clicked_at DESC, id DESC
        LIMIT $2 OFFSET $3
      `,
      [campaignId, limit, offset]
    ),
    pool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM crm_email_clicks
        WHERE campaign_id = $1
      `,
      [campaignId]
    ),
  ]);

  return {
    items: itemsResult.rows,
    pagination: {
      page,
      limit,
      total: Number((countResult.rows[0] as { total: number }).total ?? 0),
      totalPages: Math.ceil(Number((countResult.rows[0] as { total: number }).total ?? 0) / limit) || 0,
    },
  };
};

export const getCampaignAudiencePreview = async (campaignId: number) => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      SELECT
        COUNT(*)::int AS total_leads,
        COUNT(*) FILTER (WHERE recipient.status NOT IN ('blocked'))::int AS sendable_leads,
        COUNT(*) FILTER (WHERE recipient.status = 'blocked')::int AS blocked_leads,
        COUNT(*) FILTER (WHERE lead.email IS NULL OR BTRIM(COALESCE(lead.email, '')) = '')::int AS invalid_email_leads,
        COUNT(*) FILTER (WHERE COALESCE(lead.unsubscribed, FALSE))::int AS unsubscribed_leads,
        COUNT(*) FILTER (WHERE COALESCE(lead.bounced, FALSE))::int AS bounced_leads,
        COUNT(*) FILTER (WHERE COALESCE(lead.spam_complaint, FALSE))::int AS spam_complaint_leads,
        COUNT(*) FILTER (WHERE COALESCE(lead.do_not_contact, FALSE))::int AS do_not_contact_leads,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(recipient.blocked_reason, '')) LIKE '%low email quality%')::int AS blocked_risk_leads
      FROM crm_campaign_recipients recipient
      LEFT JOIN crm_leads lead ON lead.id = recipient.lead_id
      WHERE recipient.campaign_id = $1
    `,
    [campaignId]
  );

  const riskRows = await pool.query(
    `
      SELECT
        COALESCE(lead.email_risk_level, 'unknown') AS label,
        COUNT(*)::int AS count
      FROM (
        SELECT
          recipient.id,
          CASE
            WHEN lead.email IS NULL OR BTRIM(COALESCE(lead.email, '')) = '' THEN 'blocked'
            WHEN COALESCE(lead.unsubscribed, FALSE)
              OR COALESCE(lead.bounced, FALSE)
              OR COALESCE(lead.spam_complaint, FALSE)
              OR COALESCE(lead.do_not_contact, FALSE)
              OR COALESCE(lead.email_consent_status, 'unknown') IN ('unsubscribed', 'do_not_contact') THEN 'blocked'
            WHEN split_part(LOWER(COALESCE(lead.email, '')), '@', 1) ~ '^(admin|administrator|office|hr|careers|jobs|billing|webmaster)([+._-].*)?$' THEN 'high'
            WHEN split_part(LOWER(COALESCE(lead.email, '')), '@', 1) ~ '^(info|contact|support)([+._-].*)?$' THEN 'medium'
            WHEN split_part(LOWER(COALESCE(lead.email, '')), '@', 2) IN ('gmail.com','yahoo.com','hotmail.com','outlook.com','live.com','icloud.com','protonmail.com','proton.me') THEN 'medium'
            WHEN split_part(LOWER(COALESCE(lead.email, '')), '@', 1) ~ '(^|[._-])(owner|founder|cofounder|co-founder|ceo|director|md|managingdirector|president)([._-]|$)'
              OR split_part(LOWER(COALESCE(lead.email, '')), '@', 1) ~ '^(sales|partnerships?|partner|business|marketing|hello)([+._-]|$)' THEN 'low'
            ELSE 'medium'
          END AS email_risk_level
        FROM crm_campaign_recipients recipient
        LEFT JOIN crm_leads lead ON lead.id = recipient.lead_id
        WHERE recipient.campaign_id = $1
      ) lead
      GROUP BY 1
      ORDER BY 2 DESC, 1 ASC
    `,
    [campaignId]
  );
  const row = (result.rows[0] as Record<string, unknown>) ?? {};

  return {
    totalLeads: Number(row.total_leads ?? 0),
    sendableLeads: Number(row.sendable_leads ?? 0),
    blockedLeads: Number(row.blocked_leads ?? 0),
    invalidEmailLeads: Number(row.invalid_email_leads ?? 0),
    unsubscribedLeads: Number(row.unsubscribed_leads ?? 0),
    bouncedLeads: Number(row.bounced_leads ?? 0),
    spamComplaintLeads: Number(row.spam_complaint_leads ?? 0),
    doNotContactLeads: Number(row.do_not_contact_leads ?? 0),
    riskDistribution: riskRows.rows,
  };
};

export const getTransparentGif = () => TRANSPARENT_GIF;
