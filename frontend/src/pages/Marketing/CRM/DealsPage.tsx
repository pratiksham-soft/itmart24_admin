import { useCallback, useEffect, useState } from "react";
import PageMeta from "../../../components/common/PageMeta";
import Badge from "../../../components/ui/badge/Badge";
import DealFormModal from "./components/DealFormModal";
import PipelineBoard from "./components/PipelineBoard";
import CRMFilters from "./components/CRMFilters";
import CRMPageHeader from "./components/CRMPageHeader";
import CRMTable from "./components/CRMTable";
import ConfirmDeleteModal from "./components/ConfirmDeleteModal";
import { createDeal, deleteDeal, getDeals, updateDeal, updateDealStage } from "./services/crmApi";
import type { BannerState, CRMDeal } from "./types/crm.types";
import { dealLabel, defaultCRMSettings, formatCurrency, formatDate, getStatusBadgeColor, readErrorMessage, toOptions } from "./utils/crmHelpers";

export default function DealsPage() {
  const [deals, setDeals] = useState<CRMDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchValue, setSearchValue] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<"pipeline" | "table">("pipeline");
  const [editing, setEditing] = useState<CRMDeal | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CRMDeal | null>(null);
  const [banner, setBanner] = useState<BannerState>(null);

  const loadDeals = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getDeals({
        page: 1,
        limit: 100,
        q: searchValue,
        ...filterValues,
      });
      setDeals(response.items);
    } catch (error) {
      setBanner({ tone: "error", message: readErrorMessage(error, "Failed to load deals.") });
    } finally {
      setLoading(false);
    }
  }, [filterValues, searchValue]);

  useEffect(() => {
    void loadDeals();
  }, [loadDeals]);

  const showBanner = (tone: "success" | "error" | "info", message: string) => {
    setBanner({ tone, message });
    window.setTimeout(() => setBanner(null), 3000);
  };

  return (
    <>
      <PageMeta title="CRM Deals | ITMart24 Admin" description="Manage the sales pipeline, stages, values, and expected close dates." />
      <CRMPageHeader
        title="Deals / Pipeline"
        description="Track opportunities with stage visibility, value forecasting, expected close dates, and clean progression through the sales pipeline."
        actionLabel="Add Deal"
        onAction={() => {
          setEditing(null);
          setIsOpen(true);
        }}
        secondaryActionLabel={viewMode === "pipeline" ? "Table View" : "Pipeline View"}
        onSecondaryAction={() => setViewMode((current) => (current === "pipeline" ? "table" : "pipeline"))}
      />

      {banner ? (
        <div className={`mb-4 rounded-2xl px-4 py-3 text-sm ${
          banner.tone === "error" ? "bg-error-50 text-error-600" : banner.tone === "success" ? "bg-success-50 text-success-600" : "bg-blue-light-50 text-blue-light-600"
        }`}>
          {banner.message}
        </div>
      ) : null}

      <CRMFilters
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        filterValues={filterValues}
        filterConfigs={[{ key: "status", label: "Stage", options: toOptions(defaultCRMSettings.dealStages) }]}
        onFilterChange={(key, value) => setFilterValues((current) => ({ ...current, [key]: value }))}
        onReset={() => {
          setSearchValue("");
          setFilterValues({});
        }}
      />

      {viewMode === "pipeline" ? (
        <PipelineBoard
          deals={deals}
          stages={defaultCRMSettings.dealStages}
          onEdit={(deal) => {
            setEditing(deal);
            setIsOpen(true);
          }}
          onDelete={(deal) => setDeleteTarget(deal)}
          onStageChange={async (deal, stage) => {
            try {
              await updateDealStage(deal.id, stage);
              showBanner("success", `Deal moved to ${stage}.`);
              await loadDeals();
            } catch (error) {
              showBanner("error", readErrorMessage(error, "Failed to update deal stage."));
            }
          }}
        />
      ) : (
        <CRMTable
          columns={[
            {
              key: "deal",
              label: "Deal",
              render: (item) => (
                <div>
                  <div className="font-semibold text-gray-800 dark:text-white/90">{dealLabel(item as CRMDeal)}</div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{(item as CRMDeal).source || "No source"}</div>
                </div>
              ),
            },
            {
              key: "stage",
              label: "Stage",
              render: (item) => <Badge color={getStatusBadgeColor((item as CRMDeal).stage)} size="sm">{(item as CRMDeal).stage}</Badge>,
            },
            {
              key: "value",
              label: "Value",
              render: (item) => formatCurrency((item as CRMDeal).value, (item as CRMDeal).currency),
            },
            {
              key: "probability",
              label: "Probability",
              render: (item) => `${(item as CRMDeal).probability}%`,
            },
            {
              key: "close",
              label: "Expected Close",
              render: (item) => formatDate((item as CRMDeal).expectedCloseDate),
            },
          ]}
          items={deals}
          loading={loading}
          rowKey={(item) => (item as CRMDeal).id}
          onEdit={(item) => {
            setEditing(item as CRMDeal);
            setIsOpen(true);
          }}
          onDelete={(item) => setDeleteTarget(item as CRMDeal)}
        />
      )}

      <DealFormModal
        isOpen={isOpen}
        initialValue={editing}
        onClose={() => {
          setIsOpen(false);
          setEditing(null);
        }}
        onSubmit={async (payload) => {
          try {
            if (editing) {
              await updateDeal(editing.id, payload);
              showBanner("success", "Deal updated successfully.");
            } else {
              await createDeal(payload);
              showBanner("success", "Deal created successfully.");
            }
            await loadDeals();
          } catch (error) {
            throw new Error(readErrorMessage(error, "Failed to save deal."));
          }
        }}
      />

      <ConfirmDeleteModal
        isOpen={Boolean(deleteTarget)}
        title="Delete deal"
        description={deleteTarget ? `Delete ${dealLabel(deleteTarget)} from the pipeline?` : ""}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          void (async () => {
            try {
              await deleteDeal(deleteTarget.id);
              setDeleteTarget(null);
              showBanner("success", "Deal deleted successfully.");
              await loadDeals();
            } catch (error) {
              showBanner("error", readErrorMessage(error, "Failed to delete deal."));
            }
          })();
        }}
      />
    </>
  );
}
