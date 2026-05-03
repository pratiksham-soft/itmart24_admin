"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSmtpEmail = sendSmtpEmail;
exports.sendNotificationEmail = sendNotificationEmail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const NOTIFICATION_TYPE_LABELS = {
    vendor_joined: "New vendor joined",
    product_inserted: "New product inserted",
    support_ticket_generated: "New support ticket generated",
};
const readEnv = (name) => {
    const value = process.env[name];
    return typeof value === "string" ? value.trim() : "";
};
const parsePort = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 465;
};
const parseSecureFlag = (value) => ["true", "1", "yes"].includes(value.trim().toLowerCase());
const getSmtpConfig = () => {
    const host = readEnv("SMTP_HOST");
    const port = parsePort(readEnv("SMTP_PORT"));
    const secure = parseSecureFlag(readEnv("SMTP_SECURE"));
    const user = readEnv("SMTP_USER");
    const pass = readEnv("SMTP_PASS");
    const fromEmail = readEnv("SMTP_FROM_EMAIL");
    const fromName = readEnv("SMTP_FROM_NAME");
    const toEmail = readEnv("NOTIFICATION_ALERT_EMAIL_TO");
    if (!host ||
        !user ||
        !pass ||
        !fromEmail ||
        !fromName ||
        !toEmail) {
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
async function sendSmtpEmail(input) {
    const config = getSmtpConfig();
    if (!config) {
        throw new Error("SMTP email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL, and SMTP_FROM_NAME.");
    }
    const transporter = nodemailer_1.default.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
            user: config.user,
            pass: config.pass,
        },
    });
    await transporter.sendMail({
        from: `"${input.fromName ?? config.fromName}" <${input.fromEmail ?? config.fromEmail}>`,
        to: input.to,
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
    });
}
async function sendNotificationEmail(input) {
    const config = getSmtpConfig();
    if (!config) {
        console.error("[notifications] SMTP email skipped because one or more required env vars are missing.");
        return;
    }
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
    await sendSmtpEmail({
        to: config.toEmail,
        subject,
        text,
        fromEmail: config.fromEmail,
        fromName: config.fromName,
    });
}
