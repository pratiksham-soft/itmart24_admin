import webpush from "web-push";

type WebPushSubscriptionInput = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

let webPushConfigured = false;
let webPushInitializationAttempted = false;

type WebPushConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

const getWebPushConfig = (): WebPushConfig => {
  const publicKey = String(process.env.WEB_PUSH_PUBLIC_KEY ?? "").trim();
  const privateKey = String(process.env.WEB_PUSH_PRIVATE_KEY ?? "").trim();
  const subject = String(process.env.WEB_PUSH_SUBJECT ?? "").trim();

  return {
    publicKey,
    privateKey,
    subject,
  };
};

export const getMissingWebPushConfigKeys = () => {
  const config = getWebPushConfig();
  const missingKeys: string[] = [];

  if (!config.publicKey) {
    missingKeys.push("WEB_PUSH_PUBLIC_KEY");
  }

  if (!config.privateKey) {
    missingKeys.push("WEB_PUSH_PRIVATE_KEY");
  }

  if (!config.subject) {
    missingKeys.push("WEB_PUSH_SUBJECT");
  }

  return missingKeys;
};

export const initializeWebPushIfNeeded = () => {
  if (webPushInitializationAttempted) {
    return webPushConfigured;
  }

  webPushInitializationAttempted = true;
  const config = getWebPushConfig();

  if (getMissingWebPushConfigKeys().length > 0) {
    return false;
  }

  webpush.setVapidDetails(
    config.subject,
    config.publicKey,
    config.privateKey
  );
  webPushConfigured = true;
  return true;
};

export const getWebPushPublicKey = () => {
  const config = getWebPushConfig();
  return config.publicKey || null;
};

export const isWebPushConfigured = () => initializeWebPushIfNeeded();

export const sendWebPushNotification = async (
  subscription: WebPushSubscriptionInput,
  payload: Record<string, unknown>
) => {
  if (!initializeWebPushIfNeeded()) {
    return {
      success: false,
      shouldDeactivate: false,
      statusCode: null as number | null,
    };
  }

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify(payload)
    );

    return {
      success: true,
      shouldDeactivate: false,
      statusCode: 201,
    };
  } catch (error: any) {
    const statusCode =
      typeof error?.statusCode === "number" ? error.statusCode : null;

    return {
      success: false,
      shouldDeactivate: statusCode === 404 || statusCode === 410,
      statusCode,
      errorMessage:
        error instanceof Error ? error.message : String(error),
    };
  }
};
