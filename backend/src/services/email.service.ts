import nodemailer from "nodemailer";
import type { NotificationType } from "./notifications.service";

type NotificationEmailInput = {
  type: NotificationType;
  title: string;
  message: string;
  occurredAt: string;
  sourceId: string;
  relatedRoute: string | null;
};

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromEmail: string;
  fromName: string;
  toEmail: string;
};

const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  vendor_joined: "New vendor joined",
  product_inserted: "New product inserted",
  support_ticket_generated: "New support ticket generated",
};

const readEnv = (name: string) => {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
};

const parsePort = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 465;
};

const parseSecureFlag = (value: string) =>
  ["true", "1", "yes"].includes(value.trim().toLowerCase());

const getSmtpConfig = (): SmtpConfig | null => {
  const host = readEnv("SMTP_HOST");
  const port = parsePort(readEnv("SMTP_PORT"));
  const secure = parseSecureFlag(readEnv("SMTP_SECURE"));
  const user = readEnv("SMTP_USER");
  const pass = readEnv("SMTP_PASS");
  const fromEmail = readEnv("SMTP_FROM_EMAIL");
  const fromName = readEnv("SMTP_FROM_NAME");
  const toEmail = readEnv("NOTIFICATION_ALERT_EMAIL_TO");

  if (
    !host ||
    !user ||
    !pass ||
    !fromEmail ||
    !fromName ||
    !toEmail
  ) {
    return null;
  }

  return {
    host,
    port,
    secure,
    user,
    pass,
    fromEmail,
    fromName,
    toEmail,
  };
};

export async function sendNotificationEmail(
  input: NotificationEmailInput
) {
  const config = getSmtpConfig();

  if (!config) {
    console.error(
      "[notifications] SMTP email skipped because one or more required env vars are missing."
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  const typeLabel = NOTIFICATION_TYPE_LABELS[input.type];
  const subject = `[ITMart24 Alerts] ${typeLabel}`;
  const routeLine = input.relatedRoute ?? "Not available";

  const text = [
    `Event type: ${typeLabel}`,
    `Title: ${input.title}`,
    `Details: ${input.message}`,
    `Timestamp: ${input.occurredAt}`,
    `Source ID: ${input.sourceId}`,
    `Route: ${routeLine}`,
  ].join("\n");

  await transporter.sendMail({
    from: `"${config.fromName}" <${config.fromEmail}>`,
    to: config.toEmail,
    subject,
    text,
  });
}
