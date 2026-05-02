const API_BASE_URL = "http://localhost:5000";
const LOCAL_TOKEN_KEY = "itmart24_admin_session_token";
const SESSION_TOKEN_KEY = "itmart24_admin_session_token_session";

export type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type SignUpAdminPayload = {
  name: string;
  email: string;
  password: string;
};

type SignInAdminPayload = {
  email: string;
  password: string;
  rememberMe: boolean;
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

const clearStoredSessionToken = () => {
  window.localStorage.removeItem(LOCAL_TOKEN_KEY);
  window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
};

const storeSessionToken = (sessionToken: string, rememberMe: boolean) => {
  clearStoredSessionToken();

  if (rememberMe) {
    window.localStorage.setItem(LOCAL_TOKEN_KEY, sessionToken);
    return;
  }

  window.sessionStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
};

export const getStoredAdminSessionToken = () =>
  window.localStorage.getItem(LOCAL_TOKEN_KEY) ||
  window.sessionStorage.getItem(SESSION_TOKEN_KEY) ||
  "";

const getAuthHeaders = (): Record<string, string> => {
  const sessionToken = getStoredAdminSessionToken();

  if (!sessionToken) {
    return {};
  }

  return {
    Authorization: `Bearer ${sessionToken}`,
  };
};

export async function signUpAdmin({
  name,
  email,
  password,
}: SignUpAdminPayload) {
  const response = await fetch(`${API_BASE_URL}/api/admin/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      email,
      password,
    }),
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        "Unable to create the admin account right now."
      )
    );
  }

  return response.json() as Promise<{ success: true; user: AdminUser }>;
}

export async function signInAdmin({
  email,
  password,
  rememberMe,
}: SignInAdminPayload) {
  const response = await fetch(`${API_BASE_URL}/api/admin/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      rememberMe,
    }),
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Unable to sign in right now.")
    );
  }

  const result = (await response.json()) as {
    success: true;
    sessionToken: string;
    user: AdminUser;
    expiresAt: string;
  };

  storeSessionToken(result.sessionToken, rememberMe);
  return result;
}

export async function logoutAdmin() {
  const sessionToken = getStoredAdminSessionToken();

  try {
    await fetch(`${API_BASE_URL}/api/admin/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken
          ? {
              Authorization: `Bearer ${sessionToken}`,
            }
          : {}),
      },
    });
  } finally {
    clearStoredSessionToken();
  }
}

export async function getCurrentAdminProfile() {
  const sessionToken = getStoredAdminSessionToken();

  if (!sessionToken) {
    return null;
  }

  const response = await fetch(`${API_BASE_URL}/api/admin/auth/me`, {
    headers: {
      ...getAuthHeaders(),
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      clearStoredSessionToken();
      return null;
    }

    throw new Error(
      await readApiError(response, "Unable to load the admin profile.")
    );
  }

  const result = (await response.json()) as {
    success: true;
    user: AdminUser;
  };

  return result.user;
}

export async function changeAdminPassword({
  newPassword,
}: {
  newPassword: string;
}) {
  const sessionToken = getStoredAdminSessionToken();

  if (!sessionToken) {
    throw new Error("Authentication is required.");
  }

  const response = await fetch(`${API_BASE_URL}/api/admin/auth/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      newPassword,
    }),
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        "Unable to change password right now. Please try again."
      )
    );
  }

  return response.json() as Promise<{ success: true; message: string }>;
}

export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}
