import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Badge from "../../../../components/ui/badge/Badge";
import Button from "../../../../components/ui/button/Button";
import CRMFilters from "./CRMFilters";
import CRMPageHeader from "./CRMPageHeader";
import CRMTable from "./CRMTable";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import type { BannerState, CRMListParams, CRMListResponse, CRMOption } from "../types/crm.types";
import { readErrorMessage } from "../utils/crmHelpers";

type FilterConfig = {
  key: string;
  label: string;
  type?: "select" | "text";
  placeholder?: string;
  options: CRMOption[];
};

type CRMEntityPageProps<T> = {
  title: string;
  description: string;
  actionLabel: string;
  secondaryActionLabel?: string;
  filters: FilterConfig[];
  loadItems: (params: CRMListParams) => Promise<CRMListResponse<T>>;
  deleteItem: (id: number) => Promise<unknown>;
  columns: Array<{
    key: string;
    label: string;
    render: (item: T) => React.ReactNode;
  }>;
  rowKey: (item: T) => string | number;
  getItemId: (item: T) => number;
  getDeleteMessage: (item: T) => string;
  formModal: React.ReactNode;
  onCreate: () => void;
  onSecondaryAction?: () => void;
  onEdit: (item: T) => void;
  onView?: (item: T) => void;
  banner?: BannerState;
  reloadKey?: number;
  headerActionsFooter?: ReactNode;
  filterSecondaryActionLabel?: string;
  onFilterSecondaryAction?: (params: CRMListParams) => Promise<void> | void;
};

export default function CRMEntityPage<T>({
  title,
  description,
  actionLabel,
  secondaryActionLabel,
  filters,
  loadItems,
  deleteItem,
  columns,
  rowKey,
  getItemId,
  getDeleteMessage,
  formModal,
  onCreate,
  onSecondaryAction,
  onEdit,
  onView,
  banner,
  reloadKey = 0,
  headerActionsFooter,
  filterSecondaryActionLabel,
  onFilterSecondaryAction,
}: CRMEntityPageProps<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [searchValue, setSearchValue] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [runningFilterSecondaryAction, setRunningFilterSecondaryAction] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await loadItems({
          page,
          limit,
          q: searchValue,
          ...filterValues,
        });
        if (!isMounted) {
          return;
        }
        setItems(response.items);
        setTotalPages(response.pagination.totalPages);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }
        setError(readErrorMessage(loadError, "Failed to load records."));
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }, searchValue ? 300 : 0);

    return () => {
      isMounted = false;
      window.clearTimeout(timer);
    };
  }, [filterValues, limit, loadItems, page, reloadKey, searchValue]);

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      setDeleting(true);
      await deleteItem(getItemId(deleteTarget));
      setDeleteTarget(null);
      const response = await loadItems({
        page,
        limit,
        q: searchValue,
        ...filterValues,
      });
      setItems(response.items);
      setTotalPages(response.pagination.totalPages);
    } catch (deleteError) {
      setError(readErrorMessage(deleteError, "Failed to delete record."));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <CRMPageHeader
        title={title}
        description={description}
        actionLabel={actionLabel}
        onAction={onCreate}
        secondaryActionLabel={secondaryActionLabel}
        onSecondaryAction={onSecondaryAction}
        actionsFooter={headerActionsFooter}
      />
      {banner ? (
        <div className={`mb-4 rounded-2xl px-4 py-3 text-sm ${
          banner.tone === "error"
            ? "bg-error-50 text-error-600"
            : banner.tone === "success"
              ? "bg-success-50 text-success-600"
              : "bg-blue-light-50 text-blue-light-600"
        }`}>
          {banner.message}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-2xl bg-error-50 px-4 py-3 text-sm text-error-600">{error}</div>
      ) : null}

      <CRMFilters
        searchValue={searchValue}
        onSearchChange={(value) => {
          setSearchValue(value);
          setPage(1);
        }}
        filterValues={filterValues}
        filterConfigs={filters}
        onFilterChange={(key, value) => {
          setFilterValues((current) => ({ ...current, [key]: value }));
          setPage(1);
        }}
        onReset={() => {
          setSearchValue("");
          setFilterValues({});
          setPage(1);
        }}
        secondaryActionLabel={filterSecondaryActionLabel}
        onSecondaryAction={() => {
          if (!onFilterSecondaryAction) {
            return;
          }

          void (async () => {
            try {
              setRunningFilterSecondaryAction(true);
              await onFilterSecondaryAction({
                q: searchValue,
                ...filterValues,
              });
            } catch (actionError) {
              setError(readErrorMessage(actionError, "Failed to complete action."));
            } finally {
              setRunningFilterSecondaryAction(false);
            }
          })();
        }}
        secondaryActionLoading={runningFilterSecondaryAction}
      />

      <CRMTable
        columns={columns}
        items={items}
        loading={loading}
        rowKey={rowKey}
        onEdit={onEdit}
        onDelete={(item) => setDeleteTarget(item)}
        onView={onView}
      />

      <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-white/[0.03] md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
          <span>Rows per page</span>
          <select
            value={limit}
            onChange={(event) => {
              setLimit(Number(event.target.value));
              setPage(1);
            }}
            className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            {[10, 20, 50].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Badge size="sm" color="light">
            Page {page} of {Math.max(totalPages, 1)}
          </Badge>
          <Button type="button" size="sm" variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
            Previous
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setPage((current) => Math.min(Math.max(totalPages, 1), current + 1))} disabled={page >= totalPages}>
            Next
          </Button>
        </div>
      </div>

      {formModal}
      <ConfirmDeleteModal
        isOpen={Boolean(deleteTarget)}
        title="Delete CRM record"
        description={deleteTarget ? getDeleteMessage(deleteTarget) : ""}
        loading={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}
