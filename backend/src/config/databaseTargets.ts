import { APP_ENV } from "./env";

export const DEFAULT_USER_PORTAL_DATABASE =
  APP_ENV === "production" ? "user_portal" : "dev_user_portal";

export const DEFAULT_ANALYTICS_DATABASE =
  APP_ENV === "production"
    ? "itmart24_analytics"
    : "dev_itmart24_analytics";
