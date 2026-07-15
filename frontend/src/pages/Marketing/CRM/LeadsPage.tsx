import { useState } from "react";
import PageMeta from "../../../components/common/PageMeta";
import Badge from "../../../components/ui/badge/Badge";
import Button from "../../../components/ui/button/Button";
import LeadFormModal from "./components/LeadFormModal";
import LeadImportModal from "./components/LeadImportModal";
import CRMEntityPage from "./components/CRMEntityPage";
import { addLeadNote, addLeadTask, convertLead, createLead, deleteLead, getLeadCustomPortfolio, getLeads, updateLead } from "./services/crmApi";
import type { BannerState, CRMCustomPortfolioLead, CRMLead, CRMLeadEmailCleanupResult, CRMLeadImportResult, CRMListParams } from "./types/crm.types";
import { crmLeadTypes, defaultCRMSettings, formatCurrency, formatDateTime, formatLeadType, fullLeadName, getLeadTypeBadgeColor, getPriorityBadgeColor, getStatusBadgeColor, isOverdue, readErrorMessage, toOptions } from "./utils/crmHelpers";
import { Modal } from "../../../components/ui/modal";
import ActivityTimeline from "./components/ActivityTimeline";

export default function LeadsPage() {
  const [editingLead, setEditingLead] = useState<CRMLead | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [banner, setBanner] = useState<BannerState>(null);
  const [viewLead, setViewLead] = useState<CRMLead | null>(null);
  const [detailTab, setDetailTab] = useState("overview");
  const [reloadKey, setReloadKey] = useState(0);
  const [customPortfolio, setCustomPortfolio] = useState<CRMCustomPortfolioLead | null>(null);
  const [customPortfolioLoading, setCustomPortfolioLoading] = useState(false);

  const filters = [
    { key: "leadType", label: "Lead Type", options: toOptions([...crmLeadTypes]) },
    { key: "status", label: "Status", options: toOptions(defaultCRMSettings.leadStatuses) },
    { key: "source", label: "Source", options: toOptions(defaultCRMSettings.leadSources) },
    { key: "priority", label: "Priority", options: toOptions(defaultCRMSettings.leadPriorities) },
    {
      key: "cleanupStatus",
      label: "Cleanup Status",
      options: toOptions(["Needs Review", "No Review Tag"]).map((option) => ({
        ...option,
        value: option.value === "Needs Review" ? "needs_review" : "not_review",
      })),
    },
    { key: "tags", label: "Tags", type: "text" as const, placeholder: "Filter by tag" , options: [] },
    { key: "companyName", label: "Company Name", type: "text" as const, placeholder: "Company name" , options: [] },
  ];

  const showBanner = (tone: "success" | "error" | "info", message: string) => {
    setBanner({ tone, message });
    window.setTimeout(() => setBanner(null), 3000);
  };

  const getLeadEmails = (lead: CRMLead) =>
    Array.isArray(lead.emails) && lead.emails.length > 0 ? lead.emails : lead.email ? [lead.email] : [];

  const getLeadPhones = (lead: CRMLead) =>
    Array.isArray(lead.phones) && lead.phones.length > 0 ? lead.phones : lead.phone ? [lead.phone] : [];

  const getCampaignSafetyBadge = (lead: CRMLead) => {
    if (!lead.email) {
      return { label: "No Email", color: "warning" as const };
    }
    if (lead.unsubscribed) {
      return { label: "Unsubscribed", color: "error" as const };
    }
    if (lead.bounced) {
      return { label: lead.bounceType === "hard" ? "Hard Bounced" : "Bounced", color: "error" as const };
    }
    if (lead.spamComplaint || lead.doNotContact || lead.emailRiskLevel === "blocked") {
      return { label: "Blocked", color: "error" as const };
    }
    if (lead.campaignReady) {
      return { label: "Ready", color: "success" as const };
    }
    return { label: "Needs Review", color: "warning" as const };
  };

  const getLeadDetailSignals = (lead: CRMLead) => {
    const signals: Array<{ label: string; color: "error" | "warning" | "info" | "success" | "light" }> = [];

    if (lead.bounced || lead.lastCampaignStatus === "bounced") {
      if (lead.bounceType === "soft") {
        signals.push({ label: "Soft Bounced", color: "warning" });
      } else if (lead.bounceType === "technical") {
        signals.push({ label: "Technical Bounce", color: "info" });
      } else {
        signals.push({ label: "Hard Bounced", color: "error" });
      }
    }

    if (lead.lastCampaignStatus === "auto_replied") {
      signals.push({ label: "Auto-reply Received", color: "info" });
    }

    return signals;
  };

  const escapeCsvValue = (value: unknown) => {
    const normalized = String(value ?? "");
    if (/[",\n]/.test(normalized)) {
      return `"${normalized.replace(/"/g, '""')}"`;
    }
    return normalized;
  };

  const downloadCsv = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleExportCsv = async (params: CRMListParams) => {
    const pageSize = 200;
    const firstPage = await getLeads({
      ...params,
      page: 1,
      limit: pageSize,
    });

    let allLeads = [...firstPage.items];

    for (let currentPage = 2; currentPage <= Math.max(firstPage.pagination.totalPages, 1); currentPage += 1) {
      const response = await getLeads({
        ...params,
        page: currentPage,
        limit: pageSize,
      });
      allLeads = [...allLeads, ...response.items];
    }

    const headers = [
      "First Name",
      "Last Name",
      "Emails",
      "Phones",
      "Address",
      "Company Name",
      "Job Title",
      "Website",
      "Lead Type",
      "Lead Source",
      "Lead Status",
      "Lead Priority",
      "Lead Score",
      "Estimated Value",
      "Currency",
      "Assigned To",
      "Tags",
      "Next Follow Up",
      "Last Activity",
      "Created At",
      "Updated At",
      "Email Consent Status",
      "Unsubscribed",
      "Bounced",
      "Spam Complaint",
      "Do Not Contact",
    ];

    const rows = allLeads.map((lead) =>
      [
        lead.firstName,
        lead.lastName,
        getLeadEmails(lead).join(", "),
        getLeadPhones(lead).join(", "),
        lead.address,
        lead.companyName,
        lead.jobTitle,
        lead.website,
        lead.leadType,
        lead.leadSource,
        lead.leadStatus,
        lead.leadPriority,
        lead.leadScore,
        lead.estimatedValue,
        lead.currency,
        lead.assignedTo,
        (lead.tags ?? []).join(", "),
        lead.nextFollowUpAt,
        lead.lastActivityAt,
        lead.createdAt,
        lead.updatedAt,
        lead.emailConsentStatus,
        lead.unsubscribed ? "true" : "false",
        lead.bounced ? "true" : "false",
        lead.spamComplaint ? "true" : "false",
        lead.doNotContact ? "true" : "false",
      ]
        .map(escapeCsvValue)
        .join(",")
    );

    const csvContent = [headers.map(escapeCsvValue).join(","), ...rows].join("\n");
    const filename = `crm-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCsv(filename, csvContent);
    showBanner("success", `Exported ${allLeads.length} lead${allLeads.length === 1 ? "" : "s"} to CSV.`);
  };

  return (
    <>
      <PageMeta title="CRM Leads | ITMart24 Admin" description="Manage lead capture, qualification, follow-up notes, and conversion." />
      <CRMEntityPage
        title="Leads"
        description="Track inbound and manual leads with status, score, ownership, follow-up timing, and conversion workflows."
        actionLabel="Add Lead"
        secondaryActionLabel="Import Leads"
        filters={filters}
        loadItems={getLeads}
        deleteItem={deleteLead}
        columns={[
          {
            key: "lead",
            label: "Lead",
            render: (lead) => (
              <div>
                <div className="flex flex-wrap items-center gap-2 font-semibold text-gray-800 dark:text-white/90">
                  <span>{fullLeadName(lead as CRMLead)}</span>
                  <Badge color={getLeadTypeBadgeColor((lead as CRMLead).leadType)} size="sm">
                    {formatLeadType((lead as CRMLead).leadType)}
                  </Badge>
                  {(lead as CRMLead).hasCustomPortfolio ? (
                    <span className="inline-flex rounded-full bg-blue-light-50 px-2.5 py-1 text-[11px] font-medium text-blue-light-700 dark:bg-blue-light-500/10 dark:text-blue-light-300">
                      Custom Portfolio
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{(lead as CRMLead).companyName || "No company"}</div>
              </div>
            ),
          },
          {
            key: "email",
            label: "Email",
            render: (lead) => (
              <div>
                <div>{(lead as CRMLead).email || "No email"}</div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {(lead as CRMLead).emailType || "unknown"}{(lead as CRMLead).emailRiskLevel ? ` | ${(lead as CRMLead).emailRiskLevel}` : ""}
                </div>
              </div>
            ),
          },
          {
            key: "tags",
            label: "Tags",
            render: (lead) =>
              (lead as CRMLead).tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {(lead as CRMLead).tags.slice(0, 3).map((tag) => (
                    <Badge key={tag} color="light" size="sm">{tag}</Badge>
                  ))}
                  {(lead as CRMLead).tags.length > 3 ? (
                    <span className="text-xs text-gray-500 dark:text-gray-400">+{(lead as CRMLead).tags.length - 3} more</span>
                  ) : null}
                </div>
              ) : "No tags",
          },
          {
            key: "type",
            label: "Lead Type",
            render: (lead) => (
              <Badge color={getLeadTypeBadgeColor((lead as CRMLead).leadType)} size="sm">
                {formatLeadType((lead as CRMLead).leadType)}
              </Badge>
            ),
          },
          {
            key: "campaignSafety",
            label: "Campaign Safety",
            render: (lead) => {
              const badge = getCampaignSafetyBadge(lead as CRMLead);
              return (
                <div className="flex flex-wrap gap-2">
                  <Badge color={badge.color} size="sm">{badge.label}</Badge>
                  {(lead as CRMLead).agencyOutreachReady ? <Badge color="success" size="sm">Agency Ready</Badge> : null}
                </div>
              );
            },
          },
          {
            key: "status",
            label: "Status",
            render: (lead) => <Badge color={getStatusBadgeColor((lead as CRMLead).leadStatus)} size="sm">{(lead as CRMLead).leadStatus}</Badge>,
          },
          {
            key: "priority",
            label: "Priority",
            render: (lead) => <Badge color={getPriorityBadgeColor((lead as CRMLead).leadPriority)} size="sm">{(lead as CRMLead).leadPriority}</Badge>,
          },
          {
            key: "followUp",
            label: "Next Follow-up",
            render: (lead) => (
              <span className={isOverdue((lead as CRMLead).nextFollowUpAt) ? "font-semibold text-error-600" : ""}>
                {formatDateTime((lead as CRMLead).nextFollowUpAt)}
              </span>
            ),
          },
        ]}
        rowKey={(lead) => (lead as CRMLead).id}
        getItemId={(lead) => (lead as CRMLead).id}
        getDeleteMessage={(lead) => `Delete ${fullLeadName(lead as CRMLead)}? This keeps activity logs but removes the lead from active CRM lists.`}
        formModal={
          <LeadFormModal
            isOpen={isModalOpen}
            initialValue={editingLead}
            onClose={() => {
              setIsModalOpen(false);
              setEditingLead(null);
            }}
            onSubmit={async (payload) => {
              if (editingLead) {
                await updateLead(editingLead.id, payload);
                showBanner("success", "Lead updated successfully.");
                setReloadKey((current) => current + 1);
                return;
              }
              await createLead(payload);
              showBanner("success", "Lead created successfully.");
              setReloadKey((current) => current + 1);
            }}
          />
        }
        onCreate={() => {
          setEditingLead(null);
          setIsModalOpen(true);
        }}
        onSecondaryAction={() => setIsImportModalOpen(true)}
        onEdit={(lead) => {
          setEditingLead(lead as CRMLead);
          setIsModalOpen(true);
        }}
        onView={(lead) => {
          setViewLead(lead as CRMLead);
          setDetailTab("overview");
          setCustomPortfolio(null);
          if ((lead as CRMLead).hasCustomPortfolio) {
            setCustomPortfolioLoading(true);
            void getLeadCustomPortfolio((lead as CRMLead).id)
              .then((item) => setCustomPortfolio(item))
              .catch((error) => {
                showBanner("error", readErrorMessage(error, "Failed to load custom portfolio details."));
              })
              .finally(() => setCustomPortfolioLoading(false));
          }
        }}
        banner={banner}
        reloadKey={reloadKey}
        filterSecondaryActionLabel="Export CSV"
        onFilterSecondaryAction={handleExportCsv}
        headerActionsFooter={
          <a
            href="/samples/crm-leads-sample.csv"
            download="crm-leads-sample.csv"
            className="text-sm font-medium text-brand-600 underline-offset-4 hover:underline"
          >
            Download sample CSV
          </a>
        }
      />

      <LeadImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImported={(result: CRMLeadImportResult) => {
          showBanner(
            "success",
            `Lead import completed. Created ${result.created}, updated ${result.updated}, skipped ${result.skipped}, failed ${result.failed}.`
          );
          setReloadKey((current) => current + 1);
        }}
        onEmailCleanupApplied={(result: CRMLeadEmailCleanupResult) => {
          showBanner(
            "success",
            `Email cleanup completed. Updated ${result.updatedRows}, unmatched ${result.unmatchedRows}, skipped ${result.skippedRows}, failed ${result.failedRows}.`
          );
          setReloadKey((current) => current + 1);
        }}
      />

      <Modal isOpen={Boolean(viewLead)} onClose={() => setViewLead(null)} className="max-w-5xl p-6 lg:p-8">
        {viewLead ? (
          <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-2xl font-semibold text-gray-800 dark:text-white/90">{fullLeadName(viewLead)}</h3>
                <div className="mt-3">
                  <Badge color={getLeadTypeBadgeColor(viewLead.leadType)} size="sm">
                    {formatLeadType(viewLead.leadType)}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {viewLead.companyName || "No company"} | {viewLead.email || "No email"} | {viewLead.phone || "No phone"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    const note = window.prompt("Add note");
                    if (!note) return;
                    try {
                      await addLeadNote(viewLead.id, { note });
                      showBanner("success", "Lead note added.");
                    } catch (error) {
                      showBanner("error", readErrorMessage(error, "Failed to add note."));
                    }
                  }}
                >
                  Add Note
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await addLeadTask(viewLead.id, {
                        title: `Follow up with ${fullLeadName(viewLead)}`,
                        taskType: "Follow-up",
                        dueAt: new Date(Date.now() + 86400000).toISOString(),
                        relatedType: "lead",
                        relatedId: viewLead.id,
                      });
                      showBanner("success", "Follow-up task created.");
                    } catch (error) {
                      showBanner("error", readErrorMessage(error, "Failed to create task."));
                    }
                  }}
                >
                  Add Follow-up Task
                </Button>
                <Button
                  type="button"
                  onClick={async () => {
                    try {
                      await convertLead(viewLead.id, { createDeal: true });
                      showBanner("success", "Lead converted successfully.");
                    } catch (error) {
                      showBanner("error", readErrorMessage(error, "Failed to convert lead."));
                    }
                  }}
                >
                  Convert Lead
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-4 dark:border-gray-800">
              {["overview", "activities", "tasks", "deals", "notes", ...(viewLead.hasCustomPortfolio ? ["custom portfolio"] : [])].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setDetailTab(tab)}
                  className={`rounded-full px-4 py-2 text-sm font-medium ${
                    detailTab === tab
                      ? "bg-brand-500 text-white"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {detailTab === "overview" ? (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Campaign Safety</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge color={getCampaignSafetyBadge(viewLead).color} size="sm">{getCampaignSafetyBadge(viewLead).label}</Badge>
                      {viewLead.agencyOutreachReady ? <Badge color="success" size="sm">Agency Ready</Badge> : null}
                      {viewLead.emailRiskLevel ? <Badge color="light" size="sm">{viewLead.emailRiskLevel}</Badge> : null}
                      {getLeadDetailSignals(viewLead).map((signal) => (
                        <Badge key={signal.label} color={signal.color} size="sm">{signal.label}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Email Type</div>
                    <div className="mt-1 font-semibold text-gray-800 dark:text-white/90">{viewLead.emailType || "unknown"}</div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Email Domain</div>
                    <div className="mt-1 font-semibold text-gray-800 dark:text-white/90">{viewLead.emailDomain || "Not available"}</div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Lead Type</div>
                    <div className="mt-1 font-semibold text-gray-800 dark:text-white/90">{formatLeadType(viewLead.leadType)}</div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Status</div>
                    <div className="mt-1 font-semibold text-gray-800 dark:text-white/90">{viewLead.leadStatus}</div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Priority</div>
                    <div className="mt-1 font-semibold text-gray-800 dark:text-white/90">{viewLead.leadPriority}</div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Lead Source</div>
                    <div className="mt-1 font-semibold text-gray-800 dark:text-white/90">{viewLead.leadSource}</div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                    <div className="text-sm text-gray-500 dark:text-gray-400">City</div>
                    <div className="mt-1 font-semibold text-gray-800 dark:text-white/90">{viewLead.city || "Not set"}</div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                    <div className="text-sm text-gray-500 dark:text-gray-400">State</div>
                    <div className="mt-1 font-semibold text-gray-800 dark:text-white/90">{viewLead.state || "Not set"}</div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Country</div>
                    <div className="mt-1 font-semibold text-gray-800 dark:text-white/90">{viewLead.country || "Not set"}</div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Estimated Value</div>
                    <div className="mt-1 font-semibold text-gray-800 dark:text-white/90">{formatCurrency(viewLead.estimatedValue, viewLead.currency)}</div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Lifecycle Stage</div>
                    <div className="mt-1 font-semibold text-gray-800 dark:text-white/90">{viewLead.lifecycleStage || "Not set"}</div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] md:col-span-2">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Emails</div>
                    <div className="mt-1 font-semibold text-gray-800 dark:text-white/90 break-words">{getLeadEmails(viewLead).join(", ") || "No email"}</div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] md:col-span-2">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Phone Numbers</div>
                    <div className="mt-1 font-semibold text-gray-800 dark:text-white/90 break-words">{getLeadPhones(viewLead).join(", ") || "No phone"}</div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] md:col-span-2">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Address / Legacy Address</div>
                    <div className="mt-1 font-semibold text-gray-800 dark:text-white/90 break-words">{viewLead.address || "Not provided"}</div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["Email Consent", viewLead.emailConsentStatus || "unknown"],
                    ["Unsubscribed", viewLead.unsubscribed ? "Yes" : "No"],
                    ["Bounced", viewLead.bounced ? `Yes${viewLead.bounceType ? ` (${viewLead.bounceType})` : ""}` : "No"],
                    ["Spam Complaint", viewLead.spamComplaint ? "Yes" : "No"],
                    ["Do Not Contact", viewLead.doNotContact ? "Yes" : "No"],
                    ["Emails Sent", String(viewLead.emailSentCount ?? 0)],
                    ["Emails Opened", String(viewLead.emailOpenCount ?? 0)],
                    ["Emails Clicked", String(viewLead.emailClickCount ?? 0)],
                    ["Emails Replied", String(viewLead.emailReplyCount ?? 0)],
                    ["Last Campaign", viewLead.lastCampaignName || "Not available"],
                    ["Last Campaign Status", viewLead.lastCampaignStatus || "Not available"],
                    ["Last Sent", formatDateTime(viewLead.lastEmailSentAt ?? null)],
                    ["Last Opened", formatDateTime(viewLead.lastEmailOpenedAt ?? null)],
                    ["Last Clicked", formatDateTime(viewLead.lastEmailClickedAt ?? null)],
                    ["Last Replied", formatDateTime(viewLead.lastEmailRepliedAt ?? null)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
                      <div className="mt-1 font-semibold text-gray-800 dark:text-white/90 break-words">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {detailTab === "activities" ? <ActivityTimeline activities={[]} /> : null}
            {detailTab === "tasks" ? <div className="text-sm text-gray-500 dark:text-gray-400">Tasks created from this lead appear in the Tasks page.</div> : null}
            {detailTab === "deals" ? <div className="text-sm text-gray-500 dark:text-gray-400">Converted or linked deals appear in the Deals page.</div> : null}
            {detailTab === "notes" ? (
              <div className="space-y-3">
                {(viewLead.notes ?? []).length === 0 ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400">No notes yet.</div>
                ) : (
                  (viewLead.notes ?? []).map((note, index) => (
                    <div key={index} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                      <div className="text-sm text-gray-700 dark:text-gray-300">{String((note as { text?: string }).text ?? "")}</div>
                    </div>
                  ))
                )}
              </div>
            ) : null}
            {detailTab === "custom portfolio" ? (
              customPortfolioLoading ? (
                <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
                  Loading custom portfolio details...
                </div>
              ) : customPortfolio ? (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                      <div className="text-sm text-gray-500 dark:text-gray-400">Contact Name</div>
                      <div className="mt-1 font-semibold text-gray-800 dark:text-white/90">{customPortfolio.contactName}</div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                      <div className="text-sm text-gray-500 dark:text-gray-400">Business Email</div>
                      <div className="mt-1 font-semibold text-gray-800 dark:text-white/90">{customPortfolio.businessEmail}</div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                      <div className="text-sm text-gray-500 dark:text-gray-400">Website</div>
                      <div className="mt-1 font-semibold text-gray-800 dark:text-white/90 break-all">{customPortfolio.website}</div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                      <div className="text-sm text-gray-500 dark:text-gray-400">Product Count Range</div>
                      <div className="mt-1 font-semibold text-gray-800 dark:text-white/90">{customPortfolio.productCountRange}</div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                      <div className="text-sm text-gray-500 dark:text-gray-400">Visibility Level</div>
                      <div className="mt-1 font-semibold text-gray-800 dark:text-white/90">{customPortfolio.visibilityLevel}</div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                      <div className="text-sm text-gray-500 dark:text-gray-400">Budget Range</div>
                      <div className="mt-1 font-semibold text-gray-800 dark:text-white/90">{customPortfolio.budgetRange || "Not provided"}</div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                      <div className="text-sm text-gray-500 dark:text-gray-400">Country</div>
                      <div className="mt-1 font-semibold text-gray-800 dark:text-white/90">{customPortfolio.country || "Not provided"}</div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                      <div className="text-sm text-gray-500 dark:text-gray-400">Follow-up Status</div>
                      <div className="mt-1 font-semibold text-gray-800 dark:text-white/90">{customPortfolio.followUpStatus}</div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                      <div className="text-sm text-gray-500 dark:text-gray-400">Lead Status</div>
                      <div className="mt-1 font-semibold text-gray-800 dark:text-white/90">{customPortfolio.status}</div>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                      <div className="text-sm text-gray-500 dark:text-gray-400">Categories</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {customPortfolio.categories.length > 0 ? customPortfolio.categories.map((item) => (
                          <Badge key={item} color="info" size="sm">{item}</Badge>
                        )) : <span className="text-sm text-gray-500 dark:text-gray-400">No categories</span>}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                      <div className="text-sm text-gray-500 dark:text-gray-400">Promotion Goals</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {customPortfolio.promotionGoals.length > 0 ? customPortfolio.promotionGoals.map((item) => (
                          <Badge key={item} color="success" size="sm">{item}</Badge>
                        )) : <span className="text-sm text-gray-500 dark:text-gray-400">No promotion goals</span>}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                      <div className="text-sm text-gray-500 dark:text-gray-400">Message</div>
                      <div className="mt-2 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                        {customPortfolio.message || "No message provided."}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                      <div className="text-sm text-gray-500 dark:text-gray-400">Internal Sales Notes</div>
                      <div className="mt-2 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                        {customPortfolio.salesNotes || "No sales notes yet."}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                      <div className="text-sm text-gray-500 dark:text-gray-400">Source Page</div>
                      <div className="mt-1 font-semibold text-gray-800 dark:text-white/90">{customPortfolio.sourcePage}</div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                      <div className="text-sm text-gray-500 dark:text-gray-400">Submitted</div>
                      <div className="mt-1 font-semibold text-gray-800 dark:text-white/90">{formatDateTime(customPortfolio.createdAt)}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
                  No custom portfolio details were found for this lead.
                </div>
              )
            ) : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
