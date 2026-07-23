import { API_BASE_URL } from "../config/api";
import { getAdminAuthHeaders, readApiError } from "./adminApi";
import type {
  LiveVisitor,
  VisitorDetails,
  VisitorFilters,
  VisitorListResponse,
  VisitorLocationItem,
  VisitorPageItem,
  VisitorSessionDetails,
  VisitorSummaryResponse,
} from "../types/visitors";

function buildUrl(path: string, filters?: VisitorFilters) {
  const url = new URL(path, API_BASE_URL);
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value == null || value === "" || value === "all") {
        return;
      }

      url.searchParams.set(key, String(value));
    });
  }

  return url.toString();
}

async function readData<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(await readApiError(response, "Unable to load visitor analytics."));
  }

  const parsed = (await response.json()) as { success: boolean; data: T };
  return parsed.data;
}

export async function fetchVisitorSummary() {
  const response = await fetch(buildUrl("/api/admin/visitors/summary"), {
    headers: getAdminAuthHeaders(),
  });
  return readData<VisitorSummaryResponse>(response);
}

export async function fetchLiveVisitors() {
  const response = await fetch(buildUrl("/api/admin/visitors/live"), {
    headers: getAdminAuthHeaders(),
  });
  return readData<LiveVisitor[]>(response);
}

export async function fetchVisitors(filters: VisitorFilters) {
  const response = await fetch(buildUrl("/api/admin/visitors", filters), {
    headers: getAdminAuthHeaders(),
  });
  return readData<VisitorListResponse>(response);
}

export async function exportVisitorsCsv(filters: VisitorFilters) {
  const response = await fetch(buildUrl("/api/admin/visitors", { ...filters, format: "csv" }), {
    headers: getAdminAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, "Unable to export visitor data."));
  }
  return response.text();
}

export async function fetchVisitorLocations(filters: VisitorFilters) {
  const response = await fetch(buildUrl("/api/admin/visitors/locations", filters), {
    headers: getAdminAuthHeaders(),
  });
  return readData<VisitorLocationItem[]>(response);
}

export async function fetchVisitorPages(filters: VisitorFilters) {
  const response = await fetch(buildUrl("/api/admin/visitors/pages", filters), {
    headers: getAdminAuthHeaders(),
  });
  return readData<VisitorPageItem[]>(response);
}

export async function fetchVisitorDetails(visitorId: string) {
  const response = await fetch(buildUrl(`/api/admin/visitors/${encodeURIComponent(visitorId)}`), {
    headers: getAdminAuthHeaders(),
  });
  return readData<VisitorDetails>(response);
}

export async function fetchVisitorSessionDetails(sessionId: string) {
  const response = await fetch(buildUrl(`/api/admin/visitors/sessions/${encodeURIComponent(sessionId)}`), {
    headers: getAdminAuthHeaders(),
  });
  return readData<VisitorSessionDetails>(response);
}
