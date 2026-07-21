import { API_BASE_URL } from "../config/api";
import { getStoredAdminSessionToken } from "./adminAuth.service";

export const getAdminAuthHeaders = (): Record<string, string> => {
  const sessionToken = getStoredAdminSessionToken();

  return sessionToken
    ? {
        Authorization: `Bearer ${sessionToken}`,
      }
    : {};
};

export const getAdminEventStreamUrl = (path: string) => {
  const sessionToken = getStoredAdminSessionToken();
  const baseUrl = new URL(path, API_BASE_URL);

  if (sessionToken) {
    baseUrl.searchParams.set("accessToken", sessionToken);
  }

  return baseUrl.toString();
};

export const readApiError = async (
  response: Response,
  fallbackMessage: string
) => {
  const raw = await response.text();

  try {
    const parsed = JSON.parse(raw) as {
      message?: string;
      error?: string;
    };
    return parsed.message || parsed.error || fallbackMessage;
  } catch {
    return raw || fallbackMessage;
  }
};
