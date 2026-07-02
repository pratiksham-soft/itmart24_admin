import type {
  BadgeTone,
  CRMCompany,
  CRMContact,
  CRMDeal,
  CRMLead,
  CRMOption,
  CRMSettings,
  CRMTask,
} from "../types/crm.types";

export const defaultCRMSettings: CRMSettings = {
  leadStatuses: [
    "New",
    "Contacted",
    "Qualified",
    "Demo Scheduled",
    "Proposal Sent",
    "Negotiation",
    "Converted",
    "Lost",
  ],
  leadSources: [
    "Website",
    "Vendor Signup",
    "Manual Entry",
    "Email Campaign",
    "Map Scraper",
    "Social Media",
    "Referral",
    "Marketplace Listing",
    "Product Page",
    "Comparison Page",
    "Other",
  ],
  leadPriorities: ["Low", "Medium", "High", "Urgent"],
  contactTypes: [
    "Vendor",
    "Partner",
    "Customer",
    "Prospect",
    "Affiliate",
    "Support Contact",
    "Other",
  ],
  lifecycleStages: [
    "Subscriber",
    "Lead",
    "Marketing Qualified",
    "Sales Qualified",
    "Opportunity",
    "Customer",
    "Partner",
    "Inactive",
  ],
  companyStatuses: ["Prospect", "Active Vendor", "Partner", "Customer", "Inactive", "Blacklisted"],
  companySizes: ["Solo", "2-10", "11-50", "51-200", "201-1000", "1000+"],
  dealStages: ["New", "Qualified", "Demo Scheduled", "Proposal Sent", "Negotiation", "Won", "Lost"],
  taskTypes: ["Call", "Email", "Meeting", "Demo", "Proposal", "Follow-up", "Internal Note", "Other"],
  taskPriorities: ["Low", "Medium", "High", "Urgent"],
  taskStatuses: ["Pending", "In Progress", "Completed", "Cancelled"],
  activityTypes: [
    "Lead Created",
    "Lead Updated",
    "Lead Converted",
    "Contact Created",
    "Company Created",
    "Deal Created",
    "Deal Stage Changed",
    "Task Created",
    "Task Completed",
    "Note Added",
    "Email Sent",
    "Campaign Created",
    "Campaign Sent",
  ],
  campaignStatuses: ["Draft", "Sending", "Completed", "Failed", "Cancelled"],
  recipientTypes: ["leads", "contacts", "companies", "segments"],
  segmentEntityTypes: ["leads", "contacts", "companies", "deals"],
  segmentMatchTypes: ["all", "any"],
  defaultCurrency: "USD",
};

export const crmLeadTypes = ["Vendor", "Consumer"] as const;

export const toOptions = (items: string[]): CRMOption[] =>
  items.map((item) => ({
    label: item,
    value: item,
  }));

export const formatDateTime = (value?: string | null) => {
  if (!value) {
    return "Not set";
  }

  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatDate = (value?: string | null) => {
  if (!value) {
    return "Not set";
  }

  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const formatCurrency = (value?: number | null, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));

export const readErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export const formatLeadType = (value?: string | null) => {
  if (value && crmLeadTypes.includes(value as (typeof crmLeadTypes)[number])) {
    return value;
  }

  return "Not Set";
};

export const getLeadTypeBadgeColor = (value?: string | null): BadgeTone => {
  if (value === "Vendor") return "primary";
  if (value === "Consumer") return "info";
  return "light";
};

export const getStatusBadgeColor = (value: string): BadgeTone => {
  const normalized = value.toLowerCase();
  if (["won", "converted", "completed", "qualified", "active vendor", "customer", "sent"].includes(normalized)) {
    return "success";
  }
  if (["lost", "failed", "cancelled", "blacklisted", "inactive"].includes(normalized)) {
    return "error";
  }
  if (["overdue", "urgent", "negotiation"].includes(normalized)) {
    return "warning";
  }
  if (["new", "draft", "pending", "contacted", "proposal sent", "scheduled"].includes(normalized)) {
    return "info";
  }
  return "light";
};

export const getPriorityBadgeColor = (value: string): BadgeTone => {
  const normalized = value.toLowerCase();
  if (normalized === "urgent") return "error";
  if (normalized === "high") return "warning";
  if (normalized === "medium") return "info";
  return "light";
};

export const isOverdue = (value?: string | null) => {
  if (!value) {
    return false;
  }

  return new Date(value).getTime() < Date.now();
};

export const fullLeadName = (lead: Partial<CRMLead>) =>
  `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || lead.companyName || "Unnamed Lead";

export const fullContactName = (contact: Partial<CRMContact>) =>
  `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || "Unnamed Contact";

export const companyLabel = (company: Partial<CRMCompany>) => company.name || "Unnamed Company";

export const dealLabel = (deal: Partial<CRMDeal>) => deal.title || "Untitled Deal";

export const taskLabel = (task: Partial<CRMTask>) => task.title || "Untitled Task";

export const serializeConditions = (
  conditions: Array<{ field: string; operator: string; value: string }>
) => conditions.filter((condition) => condition.field && condition.operator && condition.value);
