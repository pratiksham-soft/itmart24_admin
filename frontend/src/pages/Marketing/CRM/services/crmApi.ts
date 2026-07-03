import { API_BASE_URL } from "../../../../config/api";
import { getStoredAdminSessionToken } from "../../../../services/adminAuth.service";
import type {
  CRMActivity,
  CRMApiResponse,
  CRMCampaign,
  CRMCampaignSegmentAudiencePreview,
  CRMCampaignAudiencePreview,
  CRMCampaignTrackingClick,
  CRMCampaignTrackingEvent,
  CRMCampaignTrackingOverview,
  CRMCampaignRecipient,
  CRMCampaignRecipientSummary,
  CRMCampaignSummary,
  CRMCompany,
  CRMContact,
  CRMCustomPortfolioLead,
  CRMDashboardData,
  CRMDeal,
  CRMLeadEmailRecipient,
  CRMLeadEmailCleanupPreview,
  CRMLeadEmailCleanupResult,
  CRMLeadImportPreview,
  CRMLeadImportResult,
  CRMLead,
  CRMListParams,
  CRMListResponse,
  CRMPreviewResponse,
  CRMReportsData,
  CRMSegment,
  CRMSegmentPreview,
  CRMSettings,
  CRMTask,
} from "../types/crm.types";

const readApiError = async (response: Response, fallbackMessage: string) => {
  const raw = await response.text();

  try {
    const parsed = JSON.parse(raw) as { message?: string; error?: string };
    return parsed.message || parsed.error || fallbackMessage;
  } catch {
    return raw || fallbackMessage;
  }
};

const getAuthHeaders = () => {
  const token = getStoredAdminSessionToken();
  if (!token) {
    throw new Error("Authentication is required.");
  }

  return {
    Authorization: `Bearer ${token}`,
  };
};

const buildQueryString = (params?: Record<string, unknown>) => {
  const query = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    query.set(key, String(value));
  });

  const queryString = query.toString();
  return queryString ? `?${queryString}` : "";
};

const fetchCRMJson = async <T>(
  path: string,
  init?: RequestInit,
  fallbackMessage?: string
) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...getAuthHeaders(),
      ...(
        init?.body && !(init.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}
      ),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, fallbackMessage ?? "Request failed."));
  }

  return response.json() as Promise<T>;
};

const getList = async <T>(path: string, params?: CRMListParams) => {
  const result = await fetchCRMJson<CRMApiResponse<T[]>>(
    `${path}${buildQueryString(params)}`,
    undefined,
    "Failed to load CRM records."
  );

  return {
    items: result.items ?? [],
    pagination: result.pagination ?? {
      page: 1,
      limit: params?.limit ?? 10,
      total: 0,
      totalPages: 0,
    },
  } as CRMListResponse<T>;
};

const getItem = async <T>(path: string) => {
  const result = await fetchCRMJson<CRMApiResponse<T>>(path, undefined, "Failed to load record.");
  return result.item as T;
};

const createItem = async <T>(path: string, payload: Record<string, unknown>) => {
  const result = await fetchCRMJson<CRMApiResponse<T>>(
    path,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    "Failed to create record."
  );
  return result.item as T;
};

const updateItem = async <T>(path: string, payload: Record<string, unknown>) => {
  const result = await fetchCRMJson<CRMApiResponse<T>>(
    path,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    "Failed to update record."
  );
  return result.item as T;
};

const deleteItem = async (path: string) => {
  return fetchCRMJson<{ success: boolean }>(
    path,
    {
      method: "DELETE",
    },
    "Failed to delete record."
  );
};

export const getCRMDashboard = async () => {
  const result = await fetchCRMJson<CRMApiResponse<CRMDashboardData>>(
    "/api/crm/dashboard",
    undefined,
    "Failed to load CRM dashboard."
  );
  return result.data as CRMDashboardData;
};

export const getLeads = (params?: CRMListParams) => getList<CRMLead>("/api/crm/leads", params);
export const getLead = (id: number) => getItem<CRMLead>(`/api/crm/leads/${id}`);
export const getLeadCustomPortfolio = async (id: number) => {
  const result = await fetchCRMJson<CRMApiResponse<CRMCustomPortfolioLead>>(
    `/api/crm/leads/${id}/custom-portfolio`,
    undefined,
    "Failed to load custom portfolio details."
  );
  return (result.item ?? null) as CRMCustomPortfolioLead | null;
};
export const createLead = (payload: Record<string, unknown>) => createItem<CRMLead>("/api/crm/leads", payload);
export const updateLead = (id: number, payload: Record<string, unknown>) => updateItem<CRMLead>(`/api/crm/leads/${id}`, payload);
export const deleteLead = (id: number) => deleteItem(`/api/crm/leads/${id}`);
export const previewLeadImport = async (formData: FormData) => {
  const result = await fetchCRMJson<CRMApiResponse<CRMLeadImportPreview>>(
    "/api/crm/leads/import/preview",
    {
      method: "POST",
      body: formData,
    },
    "Failed to preview lead import."
  );
  return result.data as CRMLeadImportPreview;
};
export const importLeads = async (formData: FormData) => {
  const result = await fetchCRMJson<CRMApiResponse<CRMLeadImportResult>>(
    "/api/crm/leads/import",
    {
      method: "POST",
      body: formData,
    },
    "Failed to import leads."
  );
  return result.data as CRMLeadImportResult;
};
export const previewLeadEmailCleanup = async (formData: FormData) => {
  const result = await fetchCRMJson<CRMApiResponse<CRMLeadEmailCleanupPreview>>(
    "/api/crm/leads/email-cleanup/preview",
    {
      method: "POST",
      body: formData,
    },
    "Failed to preview lead email cleanup."
  );
  return result.data as CRMLeadEmailCleanupPreview;
};
export const applyLeadEmailCleanup = async (formData: FormData) => {
  const result = await fetchCRMJson<CRMApiResponse<CRMLeadEmailCleanupResult>>(
    "/api/crm/leads/email-cleanup/apply",
    {
      method: "POST",
      body: formData,
    },
    "Failed to apply lead email cleanup."
  );
  return result.data as CRMLeadEmailCleanupResult;
};
export const convertLead = async (id: number, payload: Record<string, unknown>) => {
  return fetchCRMJson<Record<string, unknown>>(
    `/api/crm/leads/${id}/convert`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    "Failed to convert lead."
  );
};
export const addLeadNote = (id: number, payload: Record<string, unknown>) =>
  fetchCRMJson<CRMApiResponse<CRMLead>>(
    `/api/crm/leads/${id}/notes`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    "Failed to add note."
  );
export const addLeadTask = (id: number, payload: Record<string, unknown>) =>
  fetchCRMJson<CRMApiResponse<CRMTask>>(
    `/api/crm/leads/${id}/tasks`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    "Failed to create lead task."
  );

export const getContacts = (params?: CRMListParams) => getList<CRMContact>("/api/crm/contacts", params);
export const getContact = (id: number) => getItem<CRMContact>(`/api/crm/contacts/${id}`);
export const createContact = (payload: Record<string, unknown>) => createItem<CRMContact>("/api/crm/contacts", payload);
export const updateContact = (id: number, payload: Record<string, unknown>) => updateItem<CRMContact>(`/api/crm/contacts/${id}`, payload);
export const deleteContact = (id: number) => deleteItem(`/api/crm/contacts/${id}`);

export const getCompanies = (params?: CRMListParams) => getList<CRMCompany>("/api/crm/companies", params);
export const getCompany = (id: number) => getItem<CRMCompany>(`/api/crm/companies/${id}`);
export const createCompany = (payload: Record<string, unknown>) => createItem<CRMCompany>("/api/crm/companies", payload);
export const updateCompany = (id: number, payload: Record<string, unknown>) => updateItem<CRMCompany>(`/api/crm/companies/${id}`, payload);
export const deleteCompany = (id: number) => deleteItem(`/api/crm/companies/${id}`);

export const getDeals = (params?: CRMListParams) => getList<CRMDeal>("/api/crm/deals", params);
export const getDeal = (id: number) => getItem<CRMDeal>(`/api/crm/deals/${id}`);
export const createDeal = (payload: Record<string, unknown>) => createItem<CRMDeal>("/api/crm/deals", payload);
export const updateDeal = (id: number, payload: Record<string, unknown>) => updateItem<CRMDeal>(`/api/crm/deals/${id}`, payload);
export const deleteDeal = (id: number) => deleteItem(`/api/crm/deals/${id}`);
export const updateDealStage = async (id: number, stage: string) => {
  const result = await fetchCRMJson<CRMApiResponse<CRMDeal>>(
    `/api/crm/deals/${id}/stage`,
    {
      method: "PATCH",
      body: JSON.stringify({ stage }),
    },
    "Failed to update deal stage."
  );
  return result.item as CRMDeal;
};

export const getTasks = (params?: CRMListParams) => getList<CRMTask>("/api/crm/tasks", params);
export const getTask = (id: number) => getItem<CRMTask>(`/api/crm/tasks/${id}`);
export const createTask = (payload: Record<string, unknown>) => createItem<CRMTask>("/api/crm/tasks", payload);
export const updateTask = (id: number, payload: Record<string, unknown>) => updateItem<CRMTask>(`/api/crm/tasks/${id}`, payload);
export const deleteTask = (id: number) => deleteItem(`/api/crm/tasks/${id}`);
export const completeTask = async (id: number) => {
  const result = await fetchCRMJson<CRMApiResponse<CRMTask>>(
    `/api/crm/tasks/${id}/complete`,
    {
      method: "PATCH",
    },
    "Failed to complete task."
  );
  return result.item as CRMTask;
};

export const getActivities = (params?: CRMListParams) => getList<CRMActivity>("/api/crm/activities", params);
export const createActivity = (payload: Record<string, unknown>) => createItem<CRMActivity>("/api/crm/activities", payload);

export const getCampaigns = (params?: CRMListParams) => getList<CRMCampaign>("/api/crm/campaigns", params);
export const getCampaignDashboardData = async (params?: CRMListParams) => {
  const result = await fetchCRMJson<
    CRMApiResponse<CRMCampaign> & { items?: CRMCampaign[]; summary?: CRMCampaignSummary }
  >(
    `/api/crm/campaigns${buildQueryString(params)}`,
    undefined,
    "Failed to load campaigns."
  );

  return {
    items: result.items ?? [],
    pagination: result.pagination ?? {
      page: params?.page ?? 1,
      limit: params?.limit ?? 10,
      total: 0,
      totalPages: 0,
    },
    summary: result.summary ?? {
      totalCampaigns: 0,
      drafts: 0,
      sending: 0,
      completed: 0,
      failed: 0,
    },
  };
};
export const getCampaign = (id: number) => getItem<CRMCampaign>(`/api/crm/campaigns/${id}`);
export const createCampaign = (payload: Record<string, unknown>) => createItem<CRMCampaign>("/api/crm/campaigns", payload);
export const updateCampaign = (id: number, payload: Record<string, unknown>) => updateItem<CRMCampaign>(`/api/crm/campaigns/${id}`, payload);
export const deleteCampaign = (id: number) => deleteItem(`/api/crm/campaigns/${id}`);
export const duplicateCampaign = async (id: number) => {
  const result = await fetchCRMJson<CRMApiResponse<CRMCampaign>>(
    `/api/crm/campaigns/${id}/duplicate`,
    {
      method: "POST",
    },
    "Failed to duplicate campaign."
  );
  return result.item as CRMCampaign;
};
export const previewCampaign = async (id: number, payload?: Record<string, unknown>) => {
  const result = await fetchCRMJson<CRMApiResponse<CRMPreviewResponse>>(
    `/api/crm/campaigns/${id}/preview`,
    {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    },
    "Failed to preview campaign."
  );
  return result.preview as CRMPreviewResponse;
};
export const previewCampaignSegmentAudience = async (segmentId: number) => {
  const result = await fetchCRMJson<CRMApiResponse<CRMCampaignSegmentAudiencePreview>>(
    `/api/crm/campaigns/segments/${segmentId}/audience-preview`,
    undefined,
    "Failed to preview campaign segment audience."
  );
  return result.data as CRMCampaignSegmentAudiencePreview;
};
export const sendTestCampaign = async (id: number, payload: Record<string, unknown>) =>
  fetchCRMJson<{ success: boolean; message: string }>(
    `/api/crm/campaigns/${id}/test-send`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    "Failed to send test campaign."
  );
export const sendCampaign = async (id: number) => {
  const result = await fetchCRMJson<CRMApiResponse<CRMCampaign>>(
    `/api/crm/campaigns/${id}/send`,
    {
      method: "POST",
    },
    "Failed to send campaign."
  );
  return result.item as CRMCampaign;
};
export const cancelCampaign = async (id: number) => {
  const result = await fetchCRMJson<CRMApiResponse<CRMCampaign>>(
    `/api/crm/campaigns/${id}/cancel`,
    {
      method: "POST",
    },
    "Failed to cancel campaign."
  );
  return result.item as CRMCampaign;
};
export const getCampaignRecipients = async (
  id: number,
  params?: { page?: number; limit?: number; status?: string }
) => {
  const result = await fetchCRMJson<
    CRMApiResponse<CRMCampaignRecipient> & {
      items?: CRMCampaignRecipient[];
      summary?: CRMCampaignRecipientSummary;
    }
  >(
    `/api/crm/campaigns/${id}/recipients${buildQueryString(params)}`,
    undefined,
    "Failed to load campaign recipients."
  );

  return {
    items: result.items ?? [],
    pagination: result.pagination ?? {
      page: params?.page ?? 1,
      limit: params?.limit ?? 10,
      total: 0,
      totalPages: 0,
    },
    summary: result.summary ?? {
      total: 0,
      pending: 0,
      sending: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
    },
  };
};

export const getCampaignTracking = async (id: number) => {
  const result = await fetchCRMJson<
    CRMApiResponse<{
      overview: CRMCampaignTrackingOverview;
      audiencePreview: CRMCampaignAudiencePreview;
    }>
  >(
    `/api/crm/campaigns/${id}/tracking`,
    undefined,
    "Failed to load campaign tracking."
  );
  return result.data as {
    overview: CRMCampaignTrackingOverview;
    audiencePreview: CRMCampaignAudiencePreview;
  };
};

export const getCampaignEvents = async (id: number, params?: { page?: number; limit?: number }) => {
  const result = await fetchCRMJson<
    CRMApiResponse<CRMCampaignTrackingEvent> & { items?: CRMCampaignTrackingEvent[] }
  >(
    `/api/crm/campaigns/${id}/events${buildQueryString(params)}`,
    undefined,
    "Failed to load campaign events."
  );

  return {
    items: result.items ?? [],
    pagination: result.pagination ?? {
      page: params?.page ?? 1,
      limit: params?.limit ?? 25,
      total: 0,
      totalPages: 0,
    },
  };
};

export const getCampaignClicks = async (id: number, params?: { page?: number; limit?: number }) => {
  const result = await fetchCRMJson<
    CRMApiResponse<CRMCampaignTrackingClick> & { items?: CRMCampaignTrackingClick[] }
  >(
    `/api/crm/campaigns/${id}/clicks${buildQueryString(params)}`,
    undefined,
    "Failed to load campaign clicks."
  );

  return {
    items: result.items ?? [],
    pagination: result.pagination ?? {
      page: params?.page ?? 1,
      limit: params?.limit ?? 25,
      total: 0,
      totalPages: 0,
    },
  };
};

export const updateCampaignRecipientAction = async (
  campaignId: number,
  recipientId: number,
  action: "bounced" | "replied" | "complained" | "unsubscribed" | "do_not_contact",
  payload?: Record<string, unknown>
) => {
  const result = await fetchCRMJson<CRMApiResponse<CRMCampaignRecipient>>(
    `/api/crm/campaigns/${campaignId}/recipients/${recipientId}/actions/${action}`,
    {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    },
    "Failed to update campaign recipient."
  );
  return result.item as CRMCampaignRecipient;
};
export const getLeadEmailRecipients = async (
  params?: CRMListParams & { tags?: string; companyName?: string }
) => {
  const result = await fetchCRMJson<
    CRMApiResponse<CRMLeadEmailRecipient> & {
      items?: CRMLeadEmailRecipient[];
      meta?: { invalidFilteredCount: number; validFilteredCount: number };
    }
  >(
    `/api/crm/leads/email-recipients${buildQueryString(params)}`,
    undefined,
    "Failed to load lead recipients."
  );

  return {
    items: result.items ?? [],
    pagination: result.pagination ?? {
      page: params?.page ?? 1,
      limit: params?.limit ?? 10,
      total: 0,
      totalPages: 0,
    },
    meta: result.meta ?? {
      invalidFilteredCount: 0,
      validFilteredCount: 0,
    },
  };
};

export const getSegments = (params?: CRMListParams) => getList<CRMSegment>("/api/crm/segments", params);
export const getSegment = (id: number) => getItem<CRMSegment>(`/api/crm/segments/${id}`);
export const createSegment = (payload: Record<string, unknown>) => createItem<CRMSegment>("/api/crm/segments", payload);
export const updateSegment = (id: number, payload: Record<string, unknown>) => updateItem<CRMSegment>(`/api/crm/segments/${id}`, payload);
export const deleteSegment = (id: number) => deleteItem(`/api/crm/segments/${id}`);
export const previewSegmentDefinition = async (payload: Record<string, unknown>) => {
  const result = await fetchCRMJson<CRMApiResponse<CRMSegmentPreview>>(
    "/api/crm/segments/preview",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    "Failed to preview segment."
  );
  return result.preview as CRMSegmentPreview;
};
export const previewSegment = async (id: number) => {
  const result = await fetchCRMJson<CRMApiResponse<CRMSegmentPreview>>(
    `/api/crm/segments/${id}/preview`,
    {
      method: "POST",
    },
    "Failed to preview segment."
  );
  return result.preview as CRMSegmentPreview;
};

export const getCRMReports = async (params?: { dateFrom?: string; dateTo?: string }) => {
  const result = await fetchCRMJson<CRMApiResponse<CRMReportsData>>(
    `/api/crm/reports${buildQueryString(params)}`,
    undefined,
    "Failed to load reports."
  );
  return result.data as CRMReportsData;
};

export const getCRMSettings = async () => {
  const result = await fetchCRMJson<CRMApiResponse<CRMSettings>>(
    "/api/crm/settings",
    undefined,
    "Failed to load CRM settings."
  );
  return result.data as CRMSettings;
};

export const updateCRMSettings = async (payload: Record<string, unknown>) => {
  const result = await fetchCRMJson<CRMApiResponse<CRMSettings>>(
    "/api/crm/settings",
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    "Failed to update CRM settings."
  );
  return result.data as CRMSettings;
};
