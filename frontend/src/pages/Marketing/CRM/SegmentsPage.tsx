import { useState } from "react";
import PageMeta from "../../../components/common/PageMeta";
import Button from "../../../components/ui/button/Button";
import Badge from "../../../components/ui/badge/Badge";
import { Modal } from "../../../components/ui/modal";
import InputField from "../../../components/form/input/InputField";
import TextArea from "../../../components/form/input/TextArea";
import CRMEntityPage from "./components/CRMEntityPage";
import SegmentBuilder, { segmentQuickTemplates } from "./components/SegmentBuilder";
import {
  createSegment,
  deleteSegment,
  getSegments,
  previewSegment,
  previewSegmentDefinition,
  updateSegment,
} from "./services/crmApi";
import type { BannerState, CRMSegment, CRMSegmentCondition, CRMSegmentPreview } from "./types/crm.types";
import { defaultCRMSettings, readErrorMessage, serializeConditions, toOptions } from "./utils/crmHelpers";

const selectClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const createEmptyCondition = (): CRMSegmentCondition => ({ field: "", operator: "", value: "" });

export default function SegmentsPage() {
  const [editing, setEditing] = useState<CRMSegment | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [banner, setBanner] = useState<BannerState>(null);
  const [preview, setPreview] = useState<CRMSegmentPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState({
    name: "",
    description: "",
    entityType: defaultCRMSettings.segmentEntityTypes[0],
    matchType: defaultCRMSettings.segmentMatchTypes[0] as "all" | "any",
    conditions: [createEmptyCondition()] as CRMSegmentCondition[],
    limit: "",
    sortBy: "createdAt",
    sortDirection: "desc" as "asc" | "desc",
    randomize: false,
  });

  const showBanner = (tone: "success" | "error" | "info", message: string) => {
    setBanner({ tone, message });
    window.setTimeout(() => setBanner(null), 3000);
  };

  const openForm = (segment?: CRMSegment) => {
    setEditing(segment ?? null);
    setPreview(null);
    setPreviewLoading(false);
    setForm({
      name: segment?.name || "",
      description: segment?.description || "",
      entityType: segment?.entityType || defaultCRMSettings.segmentEntityTypes[0],
      matchType: (segment?.matchType as "all" | "any") || (defaultCRMSettings.segmentMatchTypes[0] as "all" | "any"),
      conditions: segment?.conditions?.length ? segment.conditions : [createEmptyCondition()],
      limit: segment?.limit != null ? String(segment.limit) : "",
      sortBy: segment?.sortBy || "createdAt",
      sortDirection: segment?.sortDirection || "desc",
      randomize: Boolean(segment?.randomize),
    });
    setIsOpen(true);
  };

  const buildPayload = () => ({
    name: form.name,
    description: form.description,
    entityType: form.entityType,
    matchType: form.matchType,
    conditions: serializeConditions(form.conditions),
    limit: form.limit ? Number(form.limit) : null,
    sortBy: form.sortBy || null,
    sortDirection: form.sortDirection,
    randomize: form.randomize,
  });

  const handlePreviewDefinition = async () => {
    try {
      setPreviewLoading(true);
      const response = await previewSegmentDefinition(buildPayload());
      setPreview(response);
    } catch (error) {
      showBanner("error", readErrorMessage(error, "Failed to preview segment."));
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <>
      <PageMeta title="CRM Segments | ITMart24 Admin" description="Create dynamic CRM segments with reusable conditions and preview results." />
      <CRMEntityPage
        title="Segments"
        description="Create reusable dynamic audience segments for campaigns and targeted CRM follow-ups."
        actionLabel="Create Segment"
        filters={[{ key: "status", label: "Entity Type", options: toOptions(defaultCRMSettings.segmentEntityTypes) }]}
        loadItems={getSegments}
        deleteItem={deleteSegment}
        columns={[
          {
            key: "segment",
            label: "Segment",
            render: (item) => (
              <div>
                <div className="font-semibold text-gray-800 dark:text-white/90">{(item as CRMSegment).name}</div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{(item as CRMSegment).description || "No description"}</div>
              </div>
            ),
          },
          {
            key: "entity",
            label: "Entity Type",
            render: (item) => <Badge size="sm" color="info">{(item as CRMSegment).entityType}</Badge>,
          },
          {
            key: "match",
            label: "Match Type",
            render: (item) => <Badge size="sm" color="light">{(item as CRMSegment).matchType}</Badge>,
          },
          {
            key: "conditions",
            label: "Conditions",
            render: (item) => `${(item as CRMSegment).conditions?.length ?? 0} conditions`,
          },
        ]}
        rowKey={(item) => (item as CRMSegment).id}
        getItemId={(item) => (item as CRMSegment).id}
        getDeleteMessage={(item) => `Delete segment "${(item as CRMSegment).name}"?`}
        formModal={
          <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} className="max-w-7xl p-6 lg:p-8">
            <div className="space-y-6">
              <div>
                <h3 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
                  {editing ? "Edit Segment" : "Create Segment"}
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Build campaign-safe dynamic audiences for email campaigns, follow-ups, reporting, and future automation.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Segment Name</label>
                  <InputField value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Entity Type</label>
                  <select
                    className={selectClassName}
                    value={form.entityType}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        entityType: event.target.value,
                        conditions: [createEmptyCondition()],
                      }))
                    }
                  >
                    {defaultCRMSettings.segmentEntityTypes.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Match Type</label>
                  <select className={selectClassName} value={form.matchType} onChange={(event) => setForm((current) => ({ ...current, matchType: event.target.value as "all" | "any" }))}>
                    {defaultCRMSettings.segmentMatchTypes.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Segment Limit</label>
                  <input
                    type="number"
                    min="1"
                    value={form.limit}
                    onChange={(event) => setForm((current) => ({ ...current, limit: event.target.value }))}
                    className={selectClassName}
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <div className="xl:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                  <TextArea rows={3} value={form.description} onChange={(value) => setForm((current) => ({ ...current, description: value }))} />
                </div>
                <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-1">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Sort By</label>
                    <select className={selectClassName} value={form.sortBy} onChange={(event) => setForm((current) => ({ ...current, sortBy: event.target.value }))}>
                      {["createdAt", "updatedAt", "lastActivityAt", "nextFollowUpAt", "emailRiskLevel", "emailSentCount", "emailOpenCount", "emailClickCount", "emailReplyCount", "dealValue", "id"].map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Sort Direction</label>
                    <select className={selectClassName} value={form.sortDirection} onChange={(event) => setForm((current) => ({ ...current, sortDirection: event.target.value as "asc" | "desc" }))}>
                      <option value="desc">desc</option>
                      <option value="asc">asc</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm dark:border-gray-800 dark:bg-gray-900">
                    <input
                      type="checkbox"
                      checked={form.randomize}
                      onChange={(event) => setForm((current) => ({ ...current, randomize: event.target.checked }))}
                      className="h-4 w-4"
                    />
                    <span className="text-gray-700 dark:text-gray-300">Randomize result order</span>
                  </label>
                </div>
              </div>

              <div className="rounded-3xl border border-gray-200 bg-gray-50/60 p-5 dark:border-gray-800 dark:bg-white/[0.03]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-800 dark:text-white/90">Quick Templates</div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Use a starter audience, then adjust the conditions if needed.</div>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {segmentQuickTemplates.map((template) => (
                    <button
                      key={template.key}
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          entityType: template.entityType,
                          matchType: template.matchType,
                          conditions: template.conditions,
                          limit: template.limit != null ? String(template.limit) : "",
                          sortBy: template.sortBy || "createdAt",
                          sortDirection: template.sortDirection || "desc",
                          randomize: Boolean(template.randomize),
                        }))
                      }
                      className="rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-brand-300 hover:bg-brand-50/50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-brand-500/10"
                    >
                      <div className="text-sm font-semibold text-gray-800 dark:text-white/90">{template.label}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{template.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <SegmentBuilder
                entityType={form.entityType}
                conditions={form.conditions}
                onChange={(conditions) => setForm((current) => ({ ...current, conditions }))}
              />

              <div className="rounded-3xl border border-gray-200 bg-gray-50/70 p-5 dark:border-gray-800 dark:bg-white/[0.03]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-800 dark:text-white/90">Preview Segment</div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Check matched leads, email safety mix, and blocked counts before saving the segment.
                    </div>
                  </div>
                  <Button type="button" variant="outline" onClick={() => void handlePreviewDefinition()} disabled={previewLoading}>
                    {previewLoading ? "Previewing..." : "Preview Segment"}
                  </Button>
                </div>

                {preview ? (
                  <div className="space-y-5">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                      {[
                        ["Matched leads", preview.count],
                        ["Campaign ready", preview.campaignReadinessSummary.campaignReadyCount],
                        ["Sendable", preview.campaignReadinessSummary.sendableCount],
                        ["Agency ready", preview.campaignReadinessSummary.agencyOutreachReadyCount],
                        ["Blocked", preview.campaignReadinessSummary.blockedLeadCount],
                        ["Missing email", preview.campaignReadinessSummary.missingEmailCount],
                        ["Invalid email", preview.campaignReadinessSummary.invalidEmailCount],
                        ["Unsubscribed", preview.campaignReadinessSummary.unsubscribedCount],
                        ["Bounced", preview.campaignReadinessSummary.bouncedCount],
                        ["Spam complaint", preview.campaignReadinessSummary.spamComplaintCount],
                        ["Do not contact", preview.campaignReadinessSummary.doNotContactCount],
                        ["Free mailbox", preview.campaignReadinessSummary.freeMailboxCount],
                        ["Support email", preview.campaignReadinessSummary.supportEmailCount],
                        ["Applied limit", preview.appliedLimit ?? "No limit"],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                          <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
                          <div className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="grid gap-4 xl:grid-cols-3">
                      {([
                        ["Email Type Distribution", preview.emailTypeDistribution],
                        ["Email Risk Distribution", preview.emailRiskDistribution],
                        ["Country Distribution", preview.countryDistribution],
                      ] as Array<[string, Array<{ label: string; count: number }>]>).map(([title, items]) => (
                        <div key={String(title)} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                          <div className="text-sm font-semibold text-gray-800 dark:text-white/90">{title}</div>
                          <div className="mt-3 space-y-2">
                            {items.length === 0 ? (
                              <div className="text-xs text-gray-500 dark:text-gray-400">No data yet.</div>
                            ) : (
                              items.map((item) => (
                                <div key={item.label} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/60">
                                  <span className="text-gray-700 dark:text-gray-300">{item.label}</span>
                                  <span className="font-semibold text-gray-800 dark:text-white/90">{item.count}</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-gray-800 dark:text-white/90">Sample Leads</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Showing first 20 matched leads</div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-800 dark:text-gray-400">
                              <th className="px-3 py-2 font-medium">Lead</th>
                              <th className="px-3 py-2 font-medium">Email</th>
                              <th className="px-3 py-2 font-medium">Email Type</th>
                              <th className="px-3 py-2 font-medium">Risk</th>
                              <th className="px-3 py-2 font-medium">Country</th>
                              <th className="px-3 py-2 font-medium">Ready</th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview.items.map((item, index) => (
                              <tr key={`${String(item.id ?? index)}-${index}`} className="border-b border-gray-100 last:border-b-0 dark:border-gray-800">
                                <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                                  {String(item.first_name ?? "") || String(item.last_name ?? "")
                                    ? `${String(item.first_name ?? "")} ${String(item.last_name ?? "")}`.trim()
                                    : String(item.company_name ?? "Unnamed lead")}
                                </td>
                                <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{String(item.email ?? "No email")}</td>
                                <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{String(item.email_type ?? "unknown")}</td>
                                <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{String(item.email_risk_level ?? "unknown")}</td>
                                <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{String(item.country ?? "Unknown")}</td>
                                <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{item.campaign_ready ? "Yes" : "No"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    No preview yet. Click Preview Segment to see matched leads and campaign safety summary.
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button
                  type="button"
                  onClick={async () => {
                    try {
                      const payload = buildPayload();
                      if (editing) {
                        await updateSegment(editing.id, payload);
                        showBanner("success", "Segment updated successfully.");
                      } else {
                        await createSegment(payload);
                        showBanner("success", "Segment created successfully.");
                      }
                      setReloadKey((current) => current + 1);
                      setIsOpen(false);
                    } catch (error) {
                      showBanner("error", readErrorMessage(error, "Failed to save segment."));
                    }
                  }}
                >
                  {editing ? "Update Segment" : "Create Segment"}
                </Button>
              </div>
            </div>
          </Modal>
        }
        onCreate={() => openForm()}
        onEdit={(item) => openForm(item as CRMSegment)}
        onView={async (item) => {
          try {
            const response = await previewSegment((item as CRMSegment).id);
            setPreview(response);
          } catch (error) {
            showBanner("error", readErrorMessage(error, "Failed to preview segment."));
          }
        }}
        banner={banner}
        reloadKey={reloadKey}
      />

      <Modal isOpen={Boolean(preview) && !isOpen} onClose={() => setPreview(null)} className="max-w-6xl p-6 lg:p-8">
        {preview ? (
          <div className="space-y-6">
            <div>
              <h3 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Segment Preview</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{preview.count} matching records</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {[
                ["Campaign Ready", preview.campaignReadinessSummary.campaignReadyCount],
                ["Sendable", preview.campaignReadinessSummary.sendableCount],
                ["Agency Ready", preview.campaignReadinessSummary.agencyOutreachReadyCount],
                ["Blocked", preview.campaignReadinessSummary.blockedLeadCount],
                ["Missing Email", preview.campaignReadinessSummary.missingEmailCount],
                ["Invalid Email", preview.campaignReadinessSummary.invalidEmailCount],
                ["Unsubscribed", preview.campaignReadinessSummary.unsubscribedCount],
                ["Bounced", preview.campaignReadinessSummary.bouncedCount],
                ["Spam Complaint", preview.campaignReadinessSummary.spamComplaintCount],
                ["Do Not Contact", preview.campaignReadinessSummary.doNotContactCount],
                ["Free Mailbox", preview.campaignReadinessSummary.freeMailboxCount],
                ["Support Email", preview.campaignReadinessSummary.supportEmailCount],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
                  <div className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</div>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              {preview.items.map((item, index) => (
                <div key={index} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{JSON.stringify(item, null, 2)}</pre>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
