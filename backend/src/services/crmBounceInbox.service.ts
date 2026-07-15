import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getAnalyticsPool } from "./analyticsPostgres.service";
import { applyRecipientEvent } from "./crmEmailTracking.service";
import { decryptEmailCredential } from "../utils/emailCredentialCrypto";

type JsonRecord = Record<string, unknown>;

type ProcessMode = "dry-run" | "apply";

type ProcessBounceInboxOptions = {
  accountEmail: string;
  folder?: string;
  limit?: number;
  mode: ProcessMode;
};

type InternalEmailAccount = {
  id: number;
  emailAddress: string;
  imapUsername: string;
  encryptedImapPassword: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
};

type RecipientRow = Record<string, unknown>;

type LeadRow = {
  id: number;
  email: string | null;
  notes: JsonRecord[];
  unsubscribed: boolean;
  bounced: boolean;
  spamComplaint: boolean;
  doNotContact: boolean;
  emailConsentStatus: string;
  lastCampaignStatus: string | null;
};

type MessageAnalysis =
  | {
      kind: "bounce";
      bounceType: "hard" | "soft" | "technical";
      reason: string;
      matchedEmail: string | null;
      candidateEmails: string[];
    }
  | {
      kind: "auto_replied";
      reason: string;
      matchedEmail: string | null;
      candidateEmails: string[];
    }
  | {
      kind: "ignore";
      reason: string;
      matchedEmail: null;
      candidateEmails: string[];
    };

type ProcessStats = {
  totalInboxMessagesScanned: number;
  bounceMessagesDetected: number;
  hardBounces: number;
  softBounces: number;
  technicalBounces: number;
  autoRepliesDetected: number;
  leadsMatched: number;
  leadsNotFound: number;
  campaignRecipientsMatched: number;
  updatesThatWouldBeApplied: number;
  alreadyProcessed: number;
  ignoredMessages: number;
};

type ProcessResult = {
  accountEmail: string;
  folder: string;
  mode: ProcessMode;
  limit: number;
  stats: ProcessStats;
  updates: Array<{
    uid: number;
    subject: string;
    kind: "bounce" | "auto_replied";
    matchedEmail: string | null;
    leadId: number | null;
    recipientId: number | null;
    action: string;
    reason: string;
  }>;
};

const DEFAULT_FOLDER = "INBOX";
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;
const IMAP_SOCKET_TIMEOUT_MS = 30000;
const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const HARD_BOUNCE_RULES = [
  { pattern: /\b550\s+5\.1\.1\b/i, reason: "550 5.1.1 recipient does not exist" },
  { pattern: /\b550\s+5\.1\.10\b/i, reason: "550 5.1.10 recipient not found" },
  { pattern: /\bNoSuchUser\b/i, reason: "No such user" },
  { pattern: /\bRecipientNotFound\b/i, reason: "Recipient not found" },
  { pattern: /\bmailbox does not exist\b/i, reason: "Mailbox does not exist" },
  { pattern: /\buser does not exist\b/i, reason: "User does not exist" },
  { pattern: /\baddress does not exist\b/i, reason: "Address does not exist" },
  { pattern: /\binvalid recipient\b/i, reason: "Invalid recipient" },
  { pattern: /\brecipient address rejected\b/i, reason: "Recipient address rejected" },
];

const SOFT_BOUNCE_RULES = [
  { pattern: /\bmailbox full\b/i, reason: "Mailbox full" },
  { pattern: /\bover quota\b/i, reason: "Mailbox over quota" },
  { pattern: /\bquota exceeded\b/i, reason: "Quota exceeded" },
  { pattern: /\bstorage allocation exceeded\b/i, reason: "Storage allocation exceeded" },
  { pattern: /\bretry timeout exceeded\b/i, reason: "Retry timeout exceeded" },
  { pattern: /\btemporary failure\b/i, reason: "Temporary failure" },
];

const TECHNICAL_BOUNCE_RULES = [
  { pattern: /\bunrouteable address\b/i, reason: "Unrouteable address" },
  { pattern: /\bmx records? .*non-existent hosts?\b/i, reason: "MX records point to non-existent hosts" },
  { pattern: /\ball relevant mx records point to non-existent hosts\b/i, reason: "MX records point to non-existent hosts" },
  { pattern: /\brelay access denied\b/i, reason: "Relay access denied" },
  { pattern: /\baccess denied\b/i, reason: "Access denied" },
  { pattern: /\brecipient address rejected: access denied\b/i, reason: "Recipient address rejected: access denied" },
];

const AUTO_REPLY_RULES = [
  /\bout of office\b/i,
  /\bautomatic reply\b/i,
  /\bauto(?:matic)?(?: |-)?reply\b/i,
  /\baway from (?:the )?office\b/i,
  /\bticket created\b/i,
  /\bmessage received and being reviewed\b/i,
  /\bwe have received your email\b/i,
  /\bthank you for your email\b/i,
  /\bcurrently out of office\b/i,
];

const BOUNCE_SUBJECT_RULES = [
  /\bundeliver/i,
  /\bdelivery status notification\b/i,
  /\bdelivery failed\b/i,
  /\bmail delivery\b/i,
  /\bfailure notice\b/i,
  /\breturned mail\b/i,
];

const BOUNCE_SOURCE_RULES = [
  /\bmailer-daemon\b/i,
  /\bpostmaster\b/i,
];

const toTrimmedString = (value: unknown) => String(value ?? "").trim();

const clampLimit = (value: number) =>
  Math.max(1, Math.min(MAX_LIMIT, Number.isFinite(value) ? Math.round(value) : DEFAULT_LIMIT));

const uniqueEmails = (values: string[]) =>
  Array.from(
    new Set(
      values
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0)
    )
  );

const normalizeHeaderValue = (value: unknown) => {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? "").trim()).filter(Boolean).join(" ");
  }
  if (value && typeof value === "object" && "value" in (value as object)) {
    return JSON.stringify(value);
  }
  return "";
};

const readParsedHeader = (parsed: any, key: string) => {
  try {
    return normalizeHeaderValue(parsed?.headers?.get?.(key));
  } catch {
    return "";
  }
};

const extractEmailsFromText = (value: string) =>
  uniqueEmails(Array.from(value.matchAll(EMAIL_REGEX)).map((match) => match[0] ?? ""));

const extractBounceCandidateEmails = (rawSource: string, textBody: string, accountEmail: string) => {
  const candidates: string[] = [];
  const explicitPatterns = [
    /Final-Recipient:\s*(?:rfc822;\s*)?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi,
    /Original-Recipient:\s*(?:rfc822;\s*)?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi,
    /Recipient Address:\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi,
    /X-Failed-Recipients:\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi,
  ];

  explicitPatterns.forEach((pattern) => {
    for (const match of rawSource.matchAll(pattern)) {
      if (match[1]) {
        candidates.push(match[1]);
      }
    }
  });

  for (const match of rawSource.matchAll(/The following address(?:es)? failed:([\s\S]{0,800})/gi)) {
    candidates.push(...extractEmailsFromText(match[1] ?? ""));
  }

  for (const match of rawSource.matchAll(/delivery to the following recipient(?:s)? failed(?: permanently)?:([\s\S]{0,800})/gi)) {
    candidates.push(...extractEmailsFromText(match[1] ?? ""));
  }

  if (candidates.length === 0) {
    candidates.push(...extractEmailsFromText(textBody));
  }

  return uniqueEmails(candidates).filter((email) => email !== accountEmail.toLowerCase());
};

const classifyBounceType = (content: string) => {
  for (const rule of HARD_BOUNCE_RULES) {
    if (rule.pattern.test(content)) {
      return { bounceType: "hard" as const, reason: rule.reason };
    }
  }
  for (const rule of SOFT_BOUNCE_RULES) {
    if (rule.pattern.test(content)) {
      return { bounceType: "soft" as const, reason: rule.reason };
    }
  }
  for (const rule of TECHNICAL_BOUNCE_RULES) {
    if (rule.pattern.test(content)) {
      return { bounceType: "technical" as const, reason: rule.reason };
    }
  }
  if (/\b5\.[0-9]+\.[0-9]+\b/i.test(content)) {
    return { bounceType: "hard" as const, reason: "Permanent delivery failure" };
  }
  if (/\b4\.[0-9]+\.[0-9]+\b/i.test(content)) {
    return { bounceType: "soft" as const, reason: "Temporary delivery failure" };
  }
  return { bounceType: "technical" as const, reason: "Technical delivery failure" };
};

const analyzeMailboxMessage = (input: {
  accountEmail: string;
  fromEmails: string[];
  subject: string;
  rawSource: string;
  textBody: string;
  parsed: any;
}): MessageAnalysis => {
  const subject = input.subject.trim();
  const subjectAndBody = `${subject}\n${input.textBody}\n${input.rawSource}`;
  const autoSubmitted = readParsedHeader(input.parsed, "auto-submitted");
  const precedence = readParsedHeader(input.parsed, "precedence");
  const xAutoReply = readParsedHeader(input.parsed, "x-autoreply");
  const xAutoRespond = readParsedHeader(input.parsed, "x-autorespond");
  const contentType = readParsedHeader(input.parsed, "content-type");

  const looksLikeBounce =
    BOUNCE_SUBJECT_RULES.some((pattern) => pattern.test(subject)) ||
    BOUNCE_SOURCE_RULES.some((pattern) => input.fromEmails.some((email) => pattern.test(email))) ||
    /Final-Recipient:/i.test(input.rawSource) ||
    /Original-Recipient:/i.test(input.rawSource) ||
    /Diagnostic-Code:/i.test(input.rawSource) ||
    /The following address(?:es)? failed/i.test(input.rawSource) ||
    /multipart\/report/i.test(contentType) ||
    /delivery-status/i.test(contentType);

  const looksLikeAutoReplyByHeaders =
    /auto-(?:replied|generated)/i.test(autoSubmitted) ||
    /auto/i.test(xAutoReply) ||
    /auto/i.test(xAutoRespond) ||
    /\bbulk\b/i.test(precedence);

  const looksLikeAutoReplyByContent = AUTO_REPLY_RULES.some((pattern) => pattern.test(subjectAndBody));

  if (looksLikeAutoReplyByHeaders && !looksLikeBounce) {
    const candidateEmails = uniqueEmails(input.fromEmails).filter(
      (email) => email !== input.accountEmail.toLowerCase()
    );
    return {
      kind: "auto_replied",
      reason: "Automatic reply detected from mailbox headers.",
      matchedEmail: candidateEmails[0] ?? null,
      candidateEmails,
    };
  }

  if (looksLikeBounce) {
    const candidateEmails = extractBounceCandidateEmails(
      input.rawSource,
      input.textBody,
      input.accountEmail
    );
    const bounce = classifyBounceType(subjectAndBody);
    return {
      kind: "bounce",
      bounceType: bounce.bounceType,
      reason: bounce.reason,
      matchedEmail: candidateEmails[0] ?? null,
      candidateEmails,
    };
  }

  if (looksLikeAutoReplyByContent) {
    const candidateEmails = uniqueEmails(input.fromEmails).filter(
      (email) => email !== input.accountEmail.toLowerCase()
    );
    return {
      kind: "auto_replied",
      reason: "Automatic reply detected from subject or body.",
      matchedEmail: candidateEmails[0] ?? null,
      candidateEmails,
    };
  }

  return {
    kind: "ignore",
    reason: "Message is neither a bounce notice nor an auto reply.",
    matchedEmail: null,
    candidateEmails: [],
  };
};

const createImapClient = (account: InternalEmailAccount) =>
  new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecure,
    auth: {
      user: account.imapUsername,
      pass: decryptEmailCredential(account.encryptedImapPassword),
    },
    logger: false,
    socketTimeout: IMAP_SOCKET_TIMEOUT_MS,
  });

const loadInboxAccount = async (accountEmail: string) => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      SELECT
        id,
        email_address,
        COALESCE(NULLIF(BTRIM(imap_username), ''), username) AS imap_username,
        COALESCE(NULLIF(BTRIM(encrypted_imap_password), ''), encrypted_password) AS encrypted_imap_password,
        imap_host,
        imap_port,
        imap_secure
      FROM email_accounts
      WHERE deleted_at IS NULL
        AND is_active = TRUE
        AND LOWER(email_address) = $1
      LIMIT 1
    `,
    [accountEmail.trim().toLowerCase()]
  );

  if (result.rowCount === 0) {
    throw new Error(`Active email account not found for ${accountEmail}.`);
  }

  const row = result.rows[0] as Record<string, unknown>;
  return {
    id: Number(row.id ?? 0),
    emailAddress: String(row.email_address ?? ""),
    imapUsername: String(row.imap_username ?? ""),
    encryptedImapPassword: String(row.encrypted_imap_password ?? ""),
    imapHost: String(row.imap_host ?? ""),
    imapPort: Number(row.imap_port ?? 0),
    imapSecure: Boolean(row.imap_secure),
  } as InternalEmailAccount;
};

const loadMatchedLead = async (emails: string[]) => {
  if (emails.length === 0) {
    return null;
  }

  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      SELECT
        id,
        email,
        notes,
        COALESCE(unsubscribed, FALSE) AS unsubscribed,
        COALESCE(bounced, FALSE) AS bounced,
        COALESCE(spam_complaint, FALSE) AS spam_complaint,
        COALESCE(do_not_contact, FALSE) AS do_not_contact,
        COALESCE(email_consent_status, 'unknown') AS email_consent_status,
        last_campaign_status
      FROM crm_leads
      WHERE deleted_at IS NULL
        AND (
          LOWER(COALESCE(email, '')) = ANY($1::text[])
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(emails, '[]'::jsonb)) AS lead_email(value)
            WHERE LOWER(lead_email.value) = ANY($1::text[])
          )
        )
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    [emails]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0] as Record<string, unknown>;
  return {
    id: Number(row.id ?? 0),
    email: row.email ? String(row.email) : null,
    notes: Array.isArray(row.notes) ? (row.notes as JsonRecord[]) : [],
    unsubscribed: Boolean(row.unsubscribed),
    bounced: Boolean(row.bounced),
    spamComplaint: Boolean(row.spam_complaint),
    doNotContact: Boolean(row.do_not_contact),
    emailConsentStatus: String(row.email_consent_status ?? "unknown"),
    lastCampaignStatus: row.last_campaign_status ? String(row.last_campaign_status) : null,
  } as LeadRow;
};

const loadMatchedRecipient = async (emails: string[]) => {
  if (emails.length === 0) {
    return null;
  }

  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      SELECT recipient.*, campaign.name AS campaign_name
      FROM crm_campaign_recipients recipient
      LEFT JOIN crm_campaigns campaign ON campaign.id = recipient.campaign_id
      WHERE LOWER(recipient.email) = ANY($1::text[])
      ORDER BY COALESCE(recipient.last_event_at, recipient.bounce_at, recipient.replied_at, recipient.sent_at, recipient.created_at) DESC, recipient.id DESC
      LIMIT 1
    `,
    [emails]
  );

  return (result.rows[0] as RecipientRow | undefined) ?? null;
};

const loadProcessedLog = async (accountId: number, folder: string, uid: number) => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      SELECT id
      FROM crm_inbox_message_logs
      WHERE account_id = $1
        AND folder = $2
        AND uid = $3
      LIMIT 1
    `,
    [accountId, folder, uid]
  );
  return result.rowCount > 0;
};

const appendLeadNoteEntry = (lead: LeadRow | null, text: string, metadata: JsonRecord) => {
  const nextNotes = Array.isArray(lead?.notes) ? [...lead!.notes] : [];
  nextNotes.push({
    text,
    createdAt: new Date().toISOString(),
    authorName: "System Inbox Processor",
    source: "crm_bounce_inbox",
    ...metadata,
  });
  return nextNotes;
};

const updateLeadForInboxOutcome = async (
  lead: LeadRow,
  outcome: {
    kind: "bounce" | "auto_replied";
    bounceType?: "hard" | "soft" | "technical";
    noteText: string;
  }
) => {
  const nextNotes = appendLeadNoteEntry(lead, outcome.noteText, {
    outcome: outcome.kind,
    bounceType: outcome.bounceType ?? null,
  });
  const pool = await getAnalyticsPool();

  if (outcome.kind === "bounce") {
    await pool.query(
      `
        UPDATE crm_leads
        SET bounced = CASE WHEN $2 = 'hard' THEN TRUE ELSE bounced END,
            bounce_type = $2,
            last_campaign_status = CASE
              WHEN COALESCE(unsubscribed, FALSE)
                OR COALESCE(spam_complaint, FALSE)
                OR COALESCE(do_not_contact, FALSE)
                OR COALESCE(email_consent_status, 'unknown') IN ('unsubscribed', 'do_not_contact')
              THEN last_campaign_status
              ELSE 'bounced'
            END,
            notes = $3::jsonb,
            last_activity_at = NOW(),
            updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [lead.id, outcome.bounceType ?? "technical", JSON.stringify(nextNotes)]
    );
    return;
  }

  await pool.query(
    `
      UPDATE crm_leads
      SET last_email_replied_at = NOW(),
          last_campaign_status = CASE
            WHEN COALESCE(unsubscribed, FALSE)
              OR COALESCE(spam_complaint, FALSE)
              OR COALESCE(do_not_contact, FALSE)
              OR COALESCE(email_consent_status, 'unknown') IN ('unsubscribed', 'do_not_contact')
            THEN last_campaign_status
            ELSE 'auto_replied'
          END,
          notes = $2::jsonb,
          last_activity_at = NOW(),
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
    `,
    [lead.id, JSON.stringify(nextNotes)]
  );
};

const insertLeadOnlyEmailEvent = async (payload: {
  campaignId?: number | null;
  recipientId?: number | null;
  leadId: number | null;
  eventType: "bounced" | "auto_replied";
  eventSource: string;
  email: string | null;
  metadata: JsonRecord;
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
        metadata,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
    `,
    [
      payload.campaignId ?? null,
      payload.recipientId ?? null,
      payload.leadId,
      payload.eventType,
      payload.eventSource,
      payload.email,
      JSON.stringify(payload.metadata ?? {}),
    ]
  );
};

const insertProcessedLog = async (payload: {
  accountId: number;
  folder: string;
  uid: number;
  messageId: string | null;
  subject: string;
  senderEmail: string | null;
  matchedEmail: string | null;
  leadId: number | null;
  recipientId: number | null;
  detectedType: string;
  actionTaken: string;
  metadata: JsonRecord;
}) => {
  const pool = await getAnalyticsPool();
  await pool.query(
    `
      INSERT INTO crm_inbox_message_logs (
        account_id,
        folder,
        uid,
        message_id,
        subject,
        sender_email,
        matched_email,
        lead_id,
        recipient_id,
        detected_type,
        action_taken,
        metadata,
        processed_at,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, NOW(), NOW())
      ON CONFLICT (account_id, folder, uid) DO NOTHING
    `,
    [
      payload.accountId,
      payload.folder,
      payload.uid,
      payload.messageId,
      payload.subject,
      payload.senderEmail,
      payload.matchedEmail,
      payload.leadId,
      payload.recipientId,
      payload.detectedType,
      payload.actionTaken,
      JSON.stringify(payload.metadata ?? {}),
    ]
  );
};

export const processCrmBounceInbox = async (
  options: ProcessBounceInboxOptions
): Promise<ProcessResult> => {
  const account = await loadInboxAccount(options.accountEmail);
  const folder = toTrimmedString(options.folder) || DEFAULT_FOLDER;
  const limit = clampLimit(Number(options.limit ?? DEFAULT_LIMIT));
  const client = createImapClient(account);

  const stats: ProcessStats = {
    totalInboxMessagesScanned: 0,
    bounceMessagesDetected: 0,
    hardBounces: 0,
    softBounces: 0,
    technicalBounces: 0,
    autoRepliesDetected: 0,
    leadsMatched: 0,
    leadsNotFound: 0,
    campaignRecipientsMatched: 0,
    updatesThatWouldBeApplied: 0,
    alreadyProcessed: 0,
    ignoredMessages: 0,
  };

  const updates: ProcessResult["updates"] = [];

  try {
    await client.connect();
    const mailbox = await client.mailboxOpen(folder);
    const totalMessages = Number(mailbox.exists ?? 0);
    if (totalMessages <= 0) {
      return {
        accountEmail: account.emailAddress,
        folder,
        mode: options.mode,
        limit,
        stats,
        updates,
      };
    }

    const startSeq = Math.max(totalMessages - limit + 1, 1);
    const range = `${startSeq}:${totalMessages}`;

    for await (const message of client.fetch(range, {
      uid: true,
      envelope: true,
      internalDate: true,
      source: true,
    } as any)) {
      stats.totalInboxMessagesScanned += 1;

      const sourceBuffer =
        message.source instanceof Buffer
          ? message.source
          : Buffer.from(message.source ?? "");
      const parsed = await simpleParser(sourceBuffer, {
        skipHtmlToText: false,
        skipImageLinks: true,
      });

      const subject = String(message.envelope?.subject ?? parsed.subject ?? "(No subject)");
      const fromEmails = uniqueEmails(
        Array.isArray(parsed.from?.value)
          ? parsed.from.value.map((entry: { address?: string }) => String(entry.address ?? ""))
          : []
      );
      const senderEmail = fromEmails[0] ?? null;
      const rawSource = sourceBuffer.toString("utf8");
      const textBody = String(parsed.text ?? parsed.html ?? "").replace(/\s+/g, " ").trim();
      const analysis = analyzeMailboxMessage({
        accountEmail: account.emailAddress,
        fromEmails,
        subject,
        rawSource,
        textBody,
        parsed,
      });

      if (analysis.kind === "ignore") {
        stats.ignoredMessages += 1;
        continue;
      }

      const alreadyProcessed = await loadProcessedLog(account.id, folder, Number(message.uid ?? 0));
      if (alreadyProcessed) {
        stats.alreadyProcessed += 1;
        continue;
      }

      if (analysis.kind === "bounce") {
        stats.bounceMessagesDetected += 1;
        if (analysis.bounceType === "hard") {
          stats.hardBounces += 1;
        } else if (analysis.bounceType === "soft") {
          stats.softBounces += 1;
        } else {
          stats.technicalBounces += 1;
        }
      } else {
        stats.autoRepliesDetected += 1;
      }

      const candidateEmails = uniqueEmails(analysis.candidateEmails);
      const matchedLead = await loadMatchedLead(candidateEmails);
      const matchedRecipient = await loadMatchedRecipient(candidateEmails);

      if (matchedLead) {
        stats.leadsMatched += 1;
      } else {
        stats.leadsNotFound += 1;
      }

      if (matchedRecipient) {
        stats.campaignRecipientsMatched += 1;
      }

      const matchedEmail =
        analysis.matchedEmail ??
        (matchedRecipient?.email ? String(matchedRecipient.email).toLowerCase() : null) ??
        matchedLead?.email?.toLowerCase() ??
        candidateEmails[0] ??
        null;

      const kindLabel =
        analysis.kind === "bounce"
          ? `${analysis.bounceType}_bounce`
          : "auto_replied";
      const noteText =
        analysis.kind === "bounce"
          ? `Bounce inbox detected a ${analysis.bounceType} bounce for ${matchedEmail ?? "an unknown address"}: ${analysis.reason}. Source message: ${subject}.`
          : `Bounce inbox detected an auto reply from ${matchedEmail ?? senderEmail ?? "an unknown address"}: ${analysis.reason}. Source message: ${subject}.`;

      const action =
        analysis.kind === "bounce"
          ? `mark_${analysis.bounceType}_bounce`
          : "mark_auto_replied";

      stats.updatesThatWouldBeApplied += 1;
      updates.push({
        uid: Number(message.uid ?? 0),
        subject,
        kind: analysis.kind,
        matchedEmail,
        leadId: matchedLead?.id ?? null,
        recipientId:
          matchedRecipient?.id == null ? null : Number(matchedRecipient.id),
        action,
        reason: analysis.reason,
      });

      if (options.mode !== "apply") {
        continue;
      }

      const metadata: JsonRecord = {
        sourceSubject: subject,
        sourceMessageId: parsed.messageId ?? null,
        sourceDate:
          message.internalDate != null
            ? new Date(message.internalDate).toISOString()
            : parsed.date?.toISOString?.() ?? null,
        senderEmail,
        matchedEmail,
        candidateEmails,
        classifierReason: analysis.reason,
      };

      if (matchedRecipient) {
        if (analysis.kind === "bounce") {
          await applyRecipientEvent(matchedRecipient, "bounced", "bounce_inbox", {
            bounceType: analysis.bounceType,
            bounceReason: analysis.reason,
            metadata,
          });
        } else {
          await applyRecipientEvent(matchedRecipient, "auto_replied", "bounce_inbox", {
            metadata,
          });
        }
      } else {
        await insertLeadOnlyEmailEvent({
          leadId: matchedLead?.id ?? null,
          eventType: analysis.kind === "bounce" ? "bounced" : "auto_replied",
          eventSource: "bounce_inbox",
          email: matchedEmail,
          metadata,
        });
      }

      if (matchedLead) {
        await updateLeadForInboxOutcome(matchedLead, {
          kind: analysis.kind,
          bounceType: analysis.kind === "bounce" ? analysis.bounceType : undefined,
          noteText,
        });
      }

      await insertProcessedLog({
        accountId: account.id,
        folder,
        uid: Number(message.uid ?? 0),
        messageId: parsed.messageId ?? null,
        subject,
        senderEmail,
        matchedEmail,
        leadId: matchedLead?.id ?? null,
        recipientId:
          matchedRecipient?.id == null ? null : Number(matchedRecipient.id),
        detectedType: kindLabel,
        actionTaken: matchedLead || matchedRecipient ? action : "logged_unmatched",
        metadata,
      });
    }
  } finally {
    await client.logout().catch(() => undefined);
  }

  return {
    accountEmail: account.emailAddress,
    folder,
    mode: options.mode,
    limit,
    stats,
    updates,
  };
};
