import type { ChangeEvent } from "react";
import Button from "../../../../components/ui/button/Button";
import type { CRMSegmentCondition } from "../types/crm.types";

type SegmentBuilderProps = {
  entityType: string;
  conditions: CRMSegmentCondition[];
  onChange: (conditions: CRMSegmentCondition[]) => void;
};

type SegmentFieldType = "text" | "number" | "date" | "boolean" | "jsonb_array";

type SegmentFieldDefinition = {
  value: string;
  label: string;
  group: string;
  type: SegmentFieldType;
  operators: string[];
  helperText?: string;
  options?: string[];
};

export type SegmentQuickTemplate = {
  key: string;
  label: string;
  description: string;
  entityType: string;
  matchType: "all" | "any";
  conditions: CRMSegmentCondition[];
  limit?: number | null;
  sortBy?: string | null;
  sortDirection?: "asc" | "desc";
  randomize?: boolean;
};

const selectClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const inputClassName = selectClassName;
const fieldGroupsOrder = [
  "Basic Lead Info",
  "Email Campaign Safety",
  "Email Engagement",
  "CRM Activity",
  "Tags & Lifecycle",
  "Computed Campaign Readiness",
] as const;

const operatorLabelMap: Record<string, string> = {
  equals: "Equals",
  not_equals: "Does Not Equal",
  contains: "Contains",
  not_contains: "Does Not Contain",
  starts_with: "Starts With",
  ends_with: "Ends With",
  is_empty: "Is Empty",
  is_not_empty: "Is Not Empty",
  in: "In List",
  not_in: "Not In List",
  is_true: "Is True",
  is_false: "Is False",
  greater_than: "Greater Than",
  greater_than_or_equal: "Greater Than Or Equal",
  less_than: "Less Than",
  less_than_or_equal: "Less Than Or Equal",
  between: "Between",
  before: "Before",
  after: "After",
  on: "On",
  older_than_days: "Older Than Days",
  newer_than_days: "Newer Than Days",
  contains_any: "Contains Any",
  contains_all: "Contains All",
};

const leadSegmentFields: SegmentFieldDefinition[] = [
  { value: "id", label: "Lead ID", group: "Basic Lead Info", type: "number", operators: ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "between"] },
  { value: "companyName", label: "Company Name", group: "Basic Lead Info", type: "text", operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"] },
  { value: "contactName", label: "Contact Name", group: "Basic Lead Info", type: "text", operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"] },
  { value: "email", label: "Primary Email", group: "Basic Lead Info", type: "text", operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"] },
  { value: "phone", label: "Phone", group: "Basic Lead Info", type: "text", operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"] },
  { value: "website", label: "Website", group: "Basic Lead Info", type: "text", operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"] },
  { value: "leadType", label: "Lead Type", group: "Basic Lead Info", type: "text", operators: ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"] },
  { value: "leadStatus", label: "Lead Status", group: "Basic Lead Info", type: "text", operators: ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"] },
  { value: "leadSource", label: "Lead Source", group: "Basic Lead Info", type: "text", operators: ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"] },
  { value: "country", label: "Country", group: "Basic Lead Info", type: "text", operators: ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"] },
  { value: "city", label: "City", group: "Basic Lead Info", type: "text", operators: ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"] },
  { value: "state", label: "State", group: "Basic Lead Info", type: "text", operators: ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"] },
  { value: "industry", label: "Industry", group: "Basic Lead Info", type: "text", operators: ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"] },
  { value: "category", label: "Category", group: "Basic Lead Info", type: "text", operators: ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"] },
  { value: "subCategory", label: "Sub Category", group: "Basic Lead Info", type: "text", operators: ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"] },
  { value: "createdAt", label: "Created At", group: "Basic Lead Info", type: "date", operators: ["before", "after", "on", "between", "older_than_days", "newer_than_days", "is_empty", "is_not_empty"] },
  { value: "updatedAt", label: "Updated At", group: "Basic Lead Info", type: "date", operators: ["before", "after", "on", "between", "older_than_days", "newer_than_days", "is_empty", "is_not_empty"] },
  { value: "emailDomain", label: "Email Domain", group: "Email Campaign Safety", type: "text", operators: ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"] },
  { value: "emailType", label: "Email Type", group: "Email Campaign Safety", type: "text", operators: ["equals", "not_equals", "in", "not_in", "is_empty", "is_not_empty"], options: ["owner", "sales", "partnerships", "business", "marketing", "hello", "contact", "info", "free_mailbox", "support", "admin", "other_company_domain", "risky", "unknown"] },
  { value: "hasEmail", label: "Has Email", group: "Email Campaign Safety", type: "boolean", operators: ["is_true", "is_false", "equals", "not_equals"], helperText: "True when the main crm_leads.email field is not empty." },
  { value: "hasValidEmail", label: "Has Valid Email", group: "Email Campaign Safety", type: "boolean", operators: ["is_true", "is_false", "equals", "not_equals"], helperText: "Checks the main campaign email against a valid email format." },
  { value: "isFreeEmailProvider", label: "Free Email Provider", group: "Email Campaign Safety", type: "boolean", operators: ["is_true", "is_false", "equals", "not_equals"] },
  { value: "isCompanyDomainEmail", label: "Company Domain Email", group: "Email Campaign Safety", type: "boolean", operators: ["is_true", "is_false", "equals", "not_equals"] },
  { value: "isSupportEmail", label: "Support Email", group: "Email Campaign Safety", type: "boolean", operators: ["is_true", "is_false", "equals", "not_equals"] },
  { value: "isInfoEmail", label: "Info Email", group: "Email Campaign Safety", type: "boolean", operators: ["is_true", "is_false", "equals", "not_equals"] },
  { value: "isContactEmail", label: "Contact Email", group: "Email Campaign Safety", type: "boolean", operators: ["is_true", "is_false", "equals", "not_equals"] },
  { value: "isSalesEmail", label: "Sales Email", group: "Email Campaign Safety", type: "boolean", operators: ["is_true", "is_false", "equals", "not_equals"] },
  { value: "isHelloEmail", label: "Hello Email", group: "Email Campaign Safety", type: "boolean", operators: ["is_true", "is_false", "equals", "not_equals"] },
  { value: "isMarketingEmail", label: "Marketing Email", group: "Email Campaign Safety", type: "boolean", operators: ["is_true", "is_false", "equals", "not_equals"] },
  { value: "unsubscribed", label: "Unsubscribed", group: "Email Campaign Safety", type: "boolean", operators: ["is_true", "is_false", "equals", "not_equals"] },
  { value: "bounced", label: "Bounced", group: "Email Campaign Safety", type: "boolean", operators: ["is_true", "is_false", "equals", "not_equals"] },
  { value: "bounceType", label: "Bounce Type", group: "Email Campaign Safety", type: "text", operators: ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"] },
  { value: "spamComplaint", label: "Spam Complaint", group: "Email Campaign Safety", type: "boolean", operators: ["is_true", "is_false", "equals", "not_equals"] },
  { value: "doNotContact", label: "Do Not Contact", group: "Email Campaign Safety", type: "boolean", operators: ["is_true", "is_false", "equals", "not_equals"] },
  { value: "emailConsentStatus", label: "Email Consent Status", group: "Email Campaign Safety", type: "text", operators: ["equals", "not_equals", "in", "not_in", "is_empty", "is_not_empty"], options: ["unknown", "opted_in", "legitimate_interest", "unsubscribed", "do_not_contact"] },
  { value: "lastCampaignName", label: "Last Campaign Name", group: "Email Engagement", type: "text", operators: ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"] },
  { value: "lastCampaignStatus", label: "Last Campaign Status", group: "Email Engagement", type: "text", operators: ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"] },
  { value: "lastEmailSentAt", label: "Last Email Sent At", group: "Email Engagement", type: "date", operators: ["before", "after", "on", "between", "older_than_days", "newer_than_days", "is_empty", "is_not_empty"] },
  { value: "emailSentCount", label: "Email Sent Count", group: "Email Engagement", type: "number", operators: ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "between"] },
  { value: "lastEmailOpenedAt", label: "Last Email Opened At", group: "Email Engagement", type: "date", operators: ["before", "after", "on", "between", "older_than_days", "newer_than_days", "is_empty", "is_not_empty"] },
  { value: "emailOpenCount", label: "Email Open Count", group: "Email Engagement", type: "number", operators: ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "between"] },
  { value: "lastEmailClickedAt", label: "Last Email Clicked At", group: "Email Engagement", type: "date", operators: ["before", "after", "on", "between", "older_than_days", "newer_than_days", "is_empty", "is_not_empty"] },
  { value: "emailClickCount", label: "Email Click Count", group: "Email Engagement", type: "number", operators: ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "between"] },
  { value: "lastEmailRepliedAt", label: "Last Email Replied At", group: "Email Engagement", type: "date", operators: ["before", "after", "on", "between", "older_than_days", "newer_than_days", "is_empty", "is_not_empty"] },
  { value: "emailReplyCount", label: "Email Reply Count", group: "Email Engagement", type: "number", operators: ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "between"] },
  { value: "activityCount", label: "Activity Count", group: "CRM Activity", type: "number", operators: ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "between"] },
  { value: "lastActivityAt", label: "Last Activity At", group: "CRM Activity", type: "date", operators: ["before", "after", "on", "between", "older_than_days", "newer_than_days", "is_empty", "is_not_empty"] },
  { value: "lastActivityType", label: "Last Activity Type", group: "CRM Activity", type: "text", operators: ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"] },
  { value: "lastActivityOutcome", label: "Last Activity Outcome", group: "CRM Activity", type: "text", operators: ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"] },
  { value: "taskCount", label: "Task Count", group: "CRM Activity", type: "number", operators: ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "between"] },
  { value: "pendingTaskCount", label: "Pending Task Count", group: "CRM Activity", type: "number", operators: ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "between"] },
  { value: "overdueTaskCount", label: "Overdue Task Count", group: "CRM Activity", type: "number", operators: ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "between"] },
  { value: "followUpDue", label: "Follow Up Due", group: "CRM Activity", type: "boolean", operators: ["is_true", "is_false", "equals", "not_equals"] },
  { value: "hasOpenTask", label: "Has Open Task", group: "CRM Activity", type: "boolean", operators: ["is_true", "is_false", "equals", "not_equals"] },
  { value: "tags", label: "Tags", group: "Tags & Lifecycle", type: "jsonb_array", operators: ["contains", "not_contains", "contains_any", "contains_all", "is_empty", "is_not_empty"], helperText: "Use one tag or a comma-separated list. Contains all means every tag you enter must exist." },
  { value: "notes", label: "Notes", group: "Tags & Lifecycle", type: "text", operators: ["contains", "not_contains", "is_empty", "is_not_empty"] },
  { value: "owner", label: "Owner", group: "Tags & Lifecycle", type: "text", operators: ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"] },
  { value: "lifecycleStage", label: "Lifecycle Stage", group: "Tags & Lifecycle", type: "text", operators: ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"] },
  { value: "status", label: "Status", group: "Tags & Lifecycle", type: "text", operators: ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"] },
  { value: "stage", label: "Stage", group: "Tags & Lifecycle", type: "text", operators: ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"] },
  { value: "dealValue", label: "Deal Value", group: "Tags & Lifecycle", type: "number", operators: ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "between"] },
  { value: "campaignReady", label: "Campaign Ready", group: "Computed Campaign Readiness", type: "boolean", operators: ["is_true", "is_false", "equals", "not_equals"], helperText: "Ready means valid email and not unsubscribed, bounced, spam complaint, or do-not-contact." },
  { value: "agencyOutreachReady", label: "Agency Outreach Ready", group: "Computed Campaign Readiness", type: "boolean", operators: ["is_true", "is_false", "equals", "not_equals"], helperText: "True when the lead has the agency_outreach_ready tag and is campaign ready." },
  { value: "needsEmailReview", label: "Needs Email Review", group: "Computed Campaign Readiness", type: "boolean", operators: ["is_true", "is_false", "equals", "not_equals"], helperText: "True when the lead is missing a safe usable email or is tagged for review." },
  { value: "canEmail", label: "Can Email", group: "Computed Campaign Readiness", type: "boolean", operators: ["is_true", "is_false", "equals", "not_equals"], helperText: "Same safety logic as campaignReady." },
  { value: "emailRiskLevel", label: "Email Risk Level", group: "Computed Campaign Readiness", type: "text", operators: ["equals", "not_equals", "in", "not_in", "is_empty", "is_not_empty"], options: ["low", "medium", "high", "blocked"], helperText: "Low is safest. Blocked means unsubscribed, bounced, spam complaint, or do-not-contact." },
];

const fallbackFields: SegmentFieldDefinition[] = [
  { value: "leadType", label: "Lead Type", group: "Basic Lead Info", type: "text", operators: ["equals", "contains"] },
  { value: "leadStatus", label: "Lead Status", group: "Basic Lead Info", type: "text", operators: ["equals", "contains"] },
  { value: "leadSource", label: "Lead Source", group: "Basic Lead Info", type: "text", operators: ["equals", "contains"] },
  { value: "owner", label: "Owner", group: "Basic Lead Info", type: "text", operators: ["equals", "contains"] },
  { value: "tags", label: "Tags", group: "Tags & Lifecycle", type: "jsonb_array", operators: ["contains", "is_not_empty"] },
];

export const segmentQuickTemplates: SegmentQuickTemplate[] = [
  {
    key: "agency_outreach_ready",
    label: "Agency Outreach Ready",
    description: "Only leads already marked safe for agency outreach.",
    entityType: "leads",
    matchType: "all",
    conditions: [{ field: "agencyOutreachReady", operator: "is_true", value: null }],
    sortBy: "createdAt",
    sortDirection: "desc",
  },
  {
    key: "safe_email_audience",
    label: "Safe Email Campaign Audience",
    description: "Campaign-ready leads with a valid email.",
    entityType: "leads",
    matchType: "all",
    conditions: [
      { field: "campaignReady", operator: "is_true", value: null },
      { field: "hasValidEmail", operator: "is_true", value: null },
    ],
    sortBy: "emailRiskLevel",
    sortDirection: "asc",
  },
  {
    key: "agency_test_batch",
    label: "Agency Outreach Test Batch",
    description: "Safe low-risk agency leads for small test sends.",
    entityType: "leads",
    matchType: "all",
    conditions: [
      { field: "tags", operator: "contains", value: "agency_outreach_ready" },
      { field: "campaignReady", operator: "is_true", value: null },
      { field: "emailRiskLevel", operator: "equals", value: "low" },
    ],
    limit: 50,
    sortBy: "createdAt",
    sortDirection: "desc",
  },
  {
    key: "free_mailbox",
    label: "Gmail/Free Mailbox Leads",
    description: "Free mailbox leads that are still campaign safe.",
    entityType: "leads",
    matchType: "all",
    conditions: [
      { field: "isFreeEmailProvider", operator: "is_true", value: null },
      { field: "campaignReady", operator: "is_true", value: null },
    ],
  },
  {
    key: "support_leads",
    label: "Support Email Leads",
    description: "Support inbox leads that are safe enough to contact.",
    entityType: "leads",
    matchType: "all",
    conditions: [
      { field: "isSupportEmail", operator: "is_true", value: null },
      { field: "campaignReady", operator: "is_true", value: null },
    ],
  },
  {
    key: "needs_review",
    label: "Needs Email Review",
    description: "Leads that still need manual email cleanup review.",
    entityType: "leads",
    matchType: "all",
    conditions: [{ field: "needsEmailReview", operator: "is_true", value: null }],
  },
  {
    key: "engaged",
    label: "Engaged Email Leads",
    description: "Leads with opens, clicks, or replies.",
    entityType: "leads",
    matchType: "any",
    conditions: [
      { field: "emailOpenCount", operator: "greater_than", value: 0 },
      { field: "emailClickCount", operator: "greater_than", value: 0 },
      { field: "emailReplyCount", operator: "greater_than", value: 0 },
    ],
  },
  {
    key: "do_not_email",
    label: "Do Not Email",
    description: "Leads blocked from email campaigns.",
    entityType: "leads",
    matchType: "any",
    conditions: [
      { field: "unsubscribed", operator: "is_true", value: null },
      { field: "bounced", operator: "is_true", value: null },
      { field: "spamComplaint", operator: "is_true", value: null },
      { field: "doNotContact", operator: "is_true", value: null },
    ],
  },
];

export const getSegmentFieldsForEntity = (entityType: string) =>
  entityType === "leads" ? leadSegmentFields : fallbackFields;

export const getSegmentFieldDefinition = (entityType: string, field: string) =>
  getSegmentFieldsForEntity(entityType).find((entry) => entry.value === field);

const createEmptyCondition = (): CRMSegmentCondition => ({ field: "", operator: "", value: "" });

const needsExplicitValue = (operator: string) =>
  !["is_true", "is_false", "is_empty", "is_not_empty"].includes(operator);

export default function SegmentBuilder({
  entityType,
  conditions,
  onChange,
}: SegmentBuilderProps) {
  const fieldDefinitions = getSegmentFieldsForEntity(entityType);
  const nextConditions = conditions.length > 0 ? conditions : [createEmptyCondition()];

  const groupedFields = fieldGroupsOrder
    .map((group) => ({
      group,
      fields: fieldDefinitions.filter((field) => field.group === group),
    }))
    .filter((entry) => entry.fields.length > 0);

  const updateCondition = (index: number, updates: Partial<CRMSegmentCondition>) => {
    const updated = [...nextConditions];
    updated[index] = { ...updated[index], ...updates };
    onChange(updated);
  };

  const renderValueInput = (condition: CRMSegmentCondition, index: number) => {
    const fieldDefinition = getSegmentFieldDefinition(entityType, condition.field);
    if (!fieldDefinition) {
      return (
        <input
          value={typeof condition.value === "string" ? condition.value : ""}
          onChange={(event) => updateCondition(index, { value: event.target.value })}
          placeholder="Value"
          className={inputClassName}
        />
      );
    }

    if (!needsExplicitValue(condition.operator)) {
      return (
        <div className="rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          This operator does not need a value.
        </div>
      );
    }

    const renderSingleInput = (valueKey: "value" | "secondValue", placeholder: string) => {
      const currentValue = valueKey === "value" ? condition.value : condition.secondValue;
      const commonProps = {
        className: inputClassName,
        placeholder,
        value: currentValue == null ? "" : String(currentValue),
        onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
          updateCondition(index, { [valueKey]: event.target.value }),
      };

      if (fieldDefinition.type === "boolean") {
        return (
          <select
            className={selectClassName}
            value={currentValue == null ? "" : String(currentValue)}
            onChange={(event) => updateCondition(index, { [valueKey]: event.target.value })}
          >
            <option value="">Select value</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        );
      }

      if (fieldDefinition.options) {
        return (
          <select
            className={selectClassName}
            value={currentValue == null ? "" : String(currentValue)}
            onChange={(event) => updateCondition(index, { [valueKey]: event.target.value })}
          >
            <option value="">Select value</option>
            {fieldDefinition.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );
      }

      if (fieldDefinition.type === "date") {
        const inputType =
          condition.operator === "older_than_days" || condition.operator === "newer_than_days"
            ? "number"
            : "date";
        return <input {...commonProps} type={inputType} />;
      }

      if (fieldDefinition.type === "number") {
        return <input {...commonProps} type="number" />;
      }

      return <input {...commonProps} type="text" />;
    };

    if (condition.operator === "between") {
      return (
        <div className="grid gap-3 md:grid-cols-2">
          {renderSingleInput("value", "Start value")}
          {renderSingleInput("secondValue", "End value")}
        </div>
      );
    }

    const placeholder =
      condition.operator === "in" ||
      condition.operator === "not_in" ||
      condition.operator === "contains_any" ||
      condition.operator === "contains_all"
        ? "Comma separated values"
        : "Value";

    return renderSingleInput("value", placeholder);
  };

  return (
    <div className="space-y-3">
      {nextConditions.map((condition, index) => {
        const fieldDefinition = getSegmentFieldDefinition(entityType, condition.field);
        const operators = fieldDefinition?.operators ?? [];

        return (
          <div
            key={index}
            className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900"
          >
            <div className="grid gap-3 xl:grid-cols-[1.2fr_1fr_1.5fr_auto]">
              <select
                value={condition.field}
                onChange={(event) => {
                  const nextField = event.target.value;
                  const nextDefinition = getSegmentFieldDefinition(entityType, nextField);
                  updateCondition(index, {
                    field: nextField,
                    operator: nextDefinition?.operators[0] ?? "",
                    value: "",
                    secondValue: "",
                  });
                }}
                className={selectClassName}
              >
                <option value="">Choose field</option>
                {groupedFields.map((group) => (
                  <optgroup key={group.group} label={group.group}>
                    {group.fields.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              <select
                value={condition.operator}
                onChange={(event) => {
                  const nextOperator = event.target.value;
                  updateCondition(index, {
                    operator: nextOperator,
                    value: needsExplicitValue(nextOperator) ? condition.value ?? "" : null,
                    secondValue: nextOperator === "between" ? condition.secondValue ?? "" : "",
                  });
                }}
                className={selectClassName}
                disabled={!fieldDefinition}
              >
                <option value="">Choose operator</option>
                {operators.map((operator) => (
                  <option key={operator} value={operator}>
                    {operatorLabelMap[operator] ?? operator}
                  </option>
                ))}
              </select>

              <div>{renderValueInput(condition, index)}</div>

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const updated = nextConditions.filter((_entry, currentIndex) => currentIndex !== index);
                  onChange(updated.length > 0 ? updated : [createEmptyCondition()]);
                }}
              >
                Remove
              </Button>
            </div>

            {fieldDefinition?.helperText ? (
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{fieldDefinition.helperText}</div>
            ) : null}
          </div>
        );
      })}

      <Button type="button" variant="outline" onClick={() => onChange([...nextConditions, createEmptyCondition()])}>
        Add Condition
      </Button>
    </div>
  );
}
