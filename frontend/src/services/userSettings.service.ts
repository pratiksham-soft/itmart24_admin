import { API_BASE_URL } from "../config/api";
import { getStoredAdminSessionToken } from "./adminAuth.service";

export type HeaderAccountIconSettings = {
  clickEnabled: boolean;
  updatedByAdminId?: number | null;
  updatedByAdminEmail?: string | null;
  updatedAt?: string | null;
};

const readApiError = async (response: Response, fallbackMessage: string) => {
  const raw = await response.text();

  try {
    const parsed = JSON.parse(raw) as { message?: string; error?: string };
    return parsed.message || parsed.error || fallbackMessage;
  } catch {
    return raw || fallbackMessage;
  }
};

const getAuthHeaders = (): Record<string, string> => {
  const sessionToken = getStoredAdminSessionToken();

  return sessionToken
    ? {
        Authorization: `Bearer ${sessionToken}`,
      }
    : {};
};

export async function fetchHeaderAccountIconSettings() {
  const response = await fetch(`${API_BASE_URL}/api/users/settings/header-account-icon`, {
    headers: {
      ...getAuthHeaders(),
    },
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Failed to load user settings.")
    );
  }

  const result = (await response.json()) as {
    success: true;
    data: HeaderAccountIconSettings;
  };

  return result.data;
}

export async function updateHeaderAccountIconSettings(clickEnabled: boolean) {
  const response = await fetch(`${API_BASE_URL}/api/users/settings/header-account-icon`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      clickEnabled,
    }),
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Failed to save user settings.")
    );
  }

  const result = (await response.json()) as {
    success: true;
    data: HeaderAccountIconSettings;
  };

  return result.data;
}
