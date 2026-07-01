import { useState } from "react";
import PageMeta from "../../../components/common/PageMeta";
import Button from "../../../components/ui/button/Button";
import Badge from "../../../components/ui/badge/Badge";
import { Modal } from "../../../components/ui/modal";
import InputField from "../../../components/form/input/InputField";
import TextArea from "../../../components/form/input/TextArea";
import CRMEntityPage from "./components/CRMEntityPage";
import SegmentBuilder from "./components/SegmentBuilder";
import { createSegment, deleteSegment, getSegments, previewSegment, updateSegment } from "./services/crmApi";
import type { BannerState, CRMSegment, CRMSegmentCondition } from "./types/crm.types";
import { defaultCRMSettings, readErrorMessage, serializeConditions, toOptions } from "./utils/crmHelpers";

const selectClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

export default function SegmentsPage() {
  const [editing, setEditing] = useState<CRMSegment | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [banner, setBanner] = useState<BannerState>(null);
  const [preview, setPreview] = useState<{ count: number; items: Array<Record<string, unknown>> } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState({
    name: "",
    description: "",
    entityType: defaultCRMSettings.segmentEntityTypes[0],
    matchType: defaultCRMSettings.segmentMatchTypes[0],
    conditions: [{ field: "", operator: "", value: "" }] as CRMSegmentCondition[],
  });

  const showBanner = (tone: "success" | "error" | "info", message: string) => {
    setBanner({ tone, message });
    window.setTimeout(() => setBanner(null), 3000);
  };

  const openForm = (segment?: CRMSegment) => {
    setEditing(segment ?? null);
    setForm({
      name: segment?.name || "",
      description: segment?.description || "",
      entityType: segment?.entityType || defaultCRMSettings.segmentEntityTypes[0],
      matchType: segment?.matchType || defaultCRMSettings.segmentMatchTypes[0],
      conditions: segment?.conditions?.length ? segment.conditions : [{ field: "", operator: "", value: "" }],
    });
    setIsOpen(true);
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
          <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} className="max-w-5xl p-6 lg:p-8">
            <div className="space-y-6">
              <div>
                <h3 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
                  {editing ? "Edit Segment" : "Create Segment"}
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Use condition groups to build dynamic audiences for outreach and reporting.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Segment Name</label>
                  <InputField value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Entity Type</label>
                  <select className={selectClassName} value={form.entityType} onChange={(event) => setForm((current) => ({ ...current, entityType: event.target.value }))}>
                    {defaultCRMSettings.segmentEntityTypes.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Match Type</label>
                  <select className={selectClassName} value={form.matchType} onChange={(event) => setForm((current) => ({ ...current, matchType: event.target.value }))}>
                    {defaultCRMSettings.segmentMatchTypes.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                <TextArea rows={3} value={form.description} onChange={(value) => setForm((current) => ({ ...current, description: value }))} />
              </div>

              <SegmentBuilder
                conditions={form.conditions}
                onChange={(conditions) => setForm((current) => ({ ...current, conditions }))}
                fieldOptions={toOptions(["leadType", "leadStatus", "leadSource", "country", "tags", "dealValue", "nextFollowUpAt", "lastActivityAt", "lifecycleStage", "status", "stage", "owner"])}
                operatorOptions={toOptions(["equals", "contains", "greater_than", "before", "older_than_days"])}
              />

              <div className="flex justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button
                  type="button"
                  onClick={async () => {
                    try {
                      const payload = {
                        name: form.name,
                        description: form.description,
                        entityType: form.entityType,
                        matchType: form.matchType,
                        conditions: serializeConditions(form.conditions),
                      };
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

      <Modal isOpen={Boolean(preview)} onClose={() => setPreview(null)} className="max-w-4xl p-6 lg:p-8">
        {preview ? (
          <div className="space-y-6">
            <div>
              <h3 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Segment Preview</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{preview.count} matching records</p>
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
