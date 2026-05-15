import { useState } from "react";
import PageMeta from "../../../components/common/PageMeta";
import Badge from "../../../components/ui/badge/Badge";
import Button from "../../../components/ui/button/Button";
import LeadFormModal from "./components/LeadFormModal";
import LeadImportModal from "./components/LeadImportModal";
import CRMEntityPage from "./components/CRMEntityPage";
import { addLeadNote, addLeadTask, convertLead, createLead, deleteLead, getLeads, updateLead } from "./services/crmApi";
import type { BannerState, CRMLead, CRMLeadImportResult } from "./types/crm.types";
import { defaultCRMSettings, formatCurrency, formatDateTime, fullLeadName, getPriorityBadgeColor, getStatusBadgeColor, isOverdue, readErrorMessage, toOptions } from "./utils/crmHelpers";
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

  const filters = [
    { key: "status", label: "Status", options: toOptions(defaultCRMSettings.leadStatuses) },
    { key: "source", label: "Source", options: toOptions(defaultCRMSettings.leadSources) },
    { key: "priority", label: "Priority", options: toOptions(defaultCRMSettings.leadPriorities) },
  ];

  const showBanner = (tone: "success" | "error" | "info", message: string) => {
    setBanner({ tone, message });
    window.setTimeout(() => setBanner(null), 3000);
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
                <div className="font-semibold text-gray-800 dark:text-white/90">{fullLeadName(lead as CRMLead)}</div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{(lead as CRMLead).email || "No email"}</div>
              </div>
            ),
          },
          {
            key: "company",
            label: "Company",
            render: (lead) => (
              <div>
                <div>{(lead as CRMLead).companyName || "Not linked"}</div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{(lead as CRMLead).jobTitle || "No title"}</div>
              </div>
            ),
          },
          {
            key: "source",
            label: "Source",
            render: (lead) => <Badge color={getStatusBadgeColor((lead as CRMLead).leadSource)} size="sm">{(lead as CRMLead).leadSource}</Badge>,
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
            key: "value",
            label: "Value",
            render: (lead) => formatCurrency((lead as CRMLead).estimatedValue, (lead as CRMLead).currency),
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
        }}
        banner={banner}
        reloadKey={reloadKey}
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
      />

      <Modal isOpen={Boolean(viewLead)} onClose={() => setViewLead(null)} className="max-w-5xl p-6 lg:p-8">
        {viewLead ? (
          <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-2xl font-semibold text-gray-800 dark:text-white/90">{fullLeadName(viewLead)}</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {viewLead.companyName || "No company"} · {viewLead.email || "No email"} · {viewLead.phone || "No phone"}
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
              {["overview", "activities", "tasks", "deals", "notes"].map((tab) => (
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
              <div className="grid gap-4 md:grid-cols-2">
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
                  <div className="text-sm text-gray-500 dark:text-gray-400">Estimated Value</div>
                  <div className="mt-1 font-semibold text-gray-800 dark:text-white/90">{formatCurrency(viewLead.estimatedValue, viewLead.currency)}</div>
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
          </div>
        ) : null}
      </Modal>
    </>
  );
}
