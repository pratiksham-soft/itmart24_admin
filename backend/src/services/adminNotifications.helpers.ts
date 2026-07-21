export const ADMIN_NOTIFICATION_CATEGORIES = [
  "vendors",
  "products",
  "users",
  "guest_reports",
  "payments",
] as const;

export const ADMIN_NOTIFICATION_SEVERITIES = [
  "info",
  "success",
  "warning",
  "error",
] as const;

export type AdminNotificationCategory =
  (typeof ADMIN_NOTIFICATION_CATEGORIES)[number];

export type AdminNotificationSeverity =
  (typeof ADMIN_NOTIFICATION_SEVERITIES)[number];

export type AdminNotificationType =
  | "vendor.registered"
  | "product.submitted"
  | "user.registered"
  | "guest-report.generated"
  | "payment.initiated"
  | "payment.succeeded"
  | "payment.failed";

const SAFE_ADMIN_TARGET_PREFIXES = [
  "/",
  "/vendors",
  "/products",
  "/users",
  "/notifications",
  "/shopify",
  "/marketing",
  "/master",
] as const;

export const isSafeInternalAdminTarget = (value: unknown) => {
  if (typeof value !== "string") {
    return false;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue.startsWith("/")) {
    return false;
  }

  if (trimmedValue.startsWith("//")) {
    return false;
  }

  return SAFE_ADMIN_TARGET_PREFIXES.some((prefix) =>
    trimmedValue === prefix || trimmedValue.startsWith(`${prefix}/`) || trimmedValue.startsWith(`${prefix}?`)
  );
};

export const sanitizeTargetUrl = (
  value: unknown,
  fallback = "/notifications"
) => (isSafeInternalAdminTarget(value) ? String(value).trim() : fallback);

export const sanitizeNotificationMetadata = (
  value: unknown
): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
    (accumulator, [key, nestedValue]) => {
      const normalizedKey = String(key).trim();
      if (!normalizedKey) {
        return accumulator;
      }

      if (
        /password|otp|secret|signature|token|authorization|auth|card|cvv|cvc|access/i.test(
          normalizedKey
        )
      ) {
        return accumulator;
      }

      accumulator[normalizedKey] = sanitizeJsonValue(nestedValue);
      return accumulator;
    },
    {}
  );
};

const sanitizeJsonValue = (value: unknown): unknown => {
  if (
    value == null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.slice(0, 25).map((entry) => sanitizeJsonValue(entry));
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
      (accumulator, [key, nestedValue]) => {
        if (
          /password|otp|secret|signature|token|authorization|auth|card|cvv|cvc|access/i.test(
            key
          )
        ) {
          return accumulator;
        }

        accumulator[key] = sanitizeJsonValue(nestedValue);
        return accumulator;
      },
      {}
    );
  }

  return String(value);
};

export const normalizeNotificationCategory = (
  value: unknown
): AdminNotificationCategory | null => {
  if (typeof value !== "string") {
    return null;
  }

  return ADMIN_NOTIFICATION_CATEGORIES.includes(
    value as AdminNotificationCategory
  )
    ? (value as AdminNotificationCategory)
    : null;
};

export const normalizeNotificationSeverity = (
  value: unknown
): AdminNotificationSeverity | null => {
  if (typeof value !== "string") {
    return null;
  }

  return ADMIN_NOTIFICATION_SEVERITIES.includes(
    value as AdminNotificationSeverity
  )
    ? (value as AdminNotificationSeverity)
    : null;
};

export const buildPushMessageForCategory = (
  category: AdminNotificationCategory
) => {
  switch (category) {
    case "vendors":
      return "A new vendor registration was recorded.";
    case "products":
      return "A product was submitted for admin review.";
    case "users":
      return "A new user account was created.";
    case "guest_reports":
      return "A guest report was generated.";
    case "payments":
      return "New payment activity was recorded.";
    default:
      return "New admin activity was recorded.";
  }
};
