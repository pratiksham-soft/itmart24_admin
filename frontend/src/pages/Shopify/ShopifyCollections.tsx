import { useEffect, useMemo, useRef, useState } from "react";
import Badge from "../../components/ui/badge/Badge";
import ComponentCard from "../../components/common/ComponentCard";
import { Modal } from "../../components/ui/modal";
import ProductSearchBar from "../Products/ProductSearchBar";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../components/ui/table";

type ShopifyCollectionRow = {
  id: number;
  title: string;
  handle: string | null;
  type: string;
  sortOrder: string;
  published: boolean;
  productCount: number;
  updatedAt: string | null;
  publishedAt: string | null;
  collectionUrl: string | null;
};

type ShopifyCollectionsResponse = {
  success: boolean;
  count: number;
  data: ShopifyCollectionRow[];
  page?: number;
  pageSize?: number;
  totalPages?: number;
  message?: string;
};

type CategoryFilterPath = {
  topCategory: string;
  parentCategory: string;
  finalCategory: string;
  collectionName: string;
  collectionHandle: string;
};

type ShopifyCategoryFiltersResponse = {
  success: boolean;
  data?: {
    paths: CategoryFilterPath[];
  };
  message?: string;
};

type ExportFormat = "json" | "csv" | "pdf";

const PAGE_SIZE = 25;
const inputClassName =
  "w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const helperCardClassName =
  "rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-800 dark:bg-gray-800/40";
const selectClassName =
  "w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const formatDate = (value: string | null) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const getDownloadFilename = (
  dispositionHeader: string | null,
  fallbackName: string
) => {
  const match = dispositionHeader?.match(/filename="([^"]+)"/i);

  return match?.[1] || fallbackName;
};

const CreateCollectionModal = ({
  isOpen,
  title,
  ruleValue,
  descriptionHtml,
  error,
  isCreating,
  onTitleChange,
  onRuleValueChange,
  onDescriptionChange,
  onResetRuleValue,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  title: string;
  ruleValue: string;
  descriptionHtml: string;
  error: string | null;
  isCreating: boolean;
  onTitleChange: (value: string) => void;
  onRuleValueChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onResetRuleValue: () => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    className="m-4 h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-4xl overflow-hidden rounded-3xl"
  >
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-white px-6 py-6 dark:border-gray-800 dark:from-brand-500/10 dark:to-gray-900 sm:px-8">
        <div className="pr-12">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">
            Shopify Smart Collection
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
            Create Collection
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            This will create the collection directly in Shopify with a friendly
            default rule based on <code>custom.type_multiple</code>.
          </p>
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          <div className="space-y-6">
            <div className="grid gap-3 md:grid-cols-3">
              <div className={helperCardClassName}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                  Collection Type
                </p>
                <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                  Smart
                </p>
              </div>

              <div className={helperCardClassName}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                  Match Logic
                </p>
                <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                  Any Condition
                </p>
              </div>

              <div className={helperCardClassName}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                  Default Rule
                </p>
                <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                  Type Multiple = collection name
                </p>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-5">
                <div>
                  <label
                    htmlFor="shopify-collection-title"
                    className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Collection Name
                  </label>
                  <input
                    id="shopify-collection-title"
                    type="text"
                    value={title}
                    onChange={(event) => onTitleChange(event.target.value)}
                    placeholder="For example: CRM Tools"
                    className={inputClassName}
                    autoFocus
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label
                      htmlFor="shopify-collection-rule-value"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      Type Multiple Value
                    </label>
                    <button
                      type="button"
                      onClick={onResetRuleValue}
                      className="text-xs font-medium text-brand-500 hover:text-brand-600"
                    >
                      Reset to collection name
                    </button>
                  </div>
                  <input
                    id="shopify-collection-rule-value"
                    type="text"
                    value={ruleValue}
                    onChange={(event) => onRuleValueChange(event.target.value)}
                    placeholder="Defaults to the collection name"
                    className={inputClassName}
                  />
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Products will be matched when their{" "}
                    <code>custom.type_multiple</code> includes this value.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="shopify-collection-description"
                    className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Description
                    <span className="ml-2 text-xs font-normal text-gray-400">
                      Optional
                    </span>
                  </label>
                  <textarea
                    id="shopify-collection-description"
                    rows={5}
                    value={descriptionHtml}
                    onChange={(event) => onDescriptionChange(event.target.value)}
                    placeholder="Add a short Shopify collection description if you want."
                    className={inputClassName}
                  />
                </div>
              </div>

              <div className="space-y-4 rounded-3xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-800/40">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                    Shopify Preview
                  </p>
                  <h4 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
                    {title.trim() || "Your new collection"}
                  </h4>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    Shopify will create this as an automated collection immediately
                    after you submit.
                  </p>
                </div>

                <div className="rounded-2xl border border-dashed border-brand-200 bg-white px-4 py-4 dark:border-brand-500/20 dark:bg-gray-900">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-500">
                    Condition Preview
                  </p>
                  <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
                    Products must match{" "}
                    <span className="font-semibold text-gray-900 dark:text-white">
                      any condition
                    </span>
                  </p>
                  <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-semibold text-gray-900 dark:text-white">
                      Type Multiple
                    </span>{" "}
                    is equal to{" "}
                    <span className="rounded-md bg-brand-50 px-2 py-1 font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                      {ruleValue.trim() || title.trim() || "collection name"}
                    </span>
                  </p>
                </div>

                <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
                  Products already linked through Shopify's default collection
                  membership or through <code>custom.type_multiple</code> will be
                  counted in the table after refresh.
                </p>
              </div>
            </div>

            {error ? (
              <div className="rounded-2xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300">
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <div className="border-t border-gray-200 px-6 py-5 dark:border-gray-800 sm:px-8">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className="rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCreating ? "Creating..." : "Create Collection"}
            </button>
          </div>
        </div>
      </form>
    </div>
  </Modal>
);

const DeleteCollectionModal = ({
  isOpen,
  collection,
  confirmationName,
  error,
  isDeleting,
  onConfirmationNameChange,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  collection: ShopifyCollectionRow | null;
  confirmationName: string;
  error: string | null;
  isDeleting: boolean;
  onConfirmationNameChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) => {
  const isMatch =
    Boolean(collection) && confirmationName === collection?.title;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="mx-4 w-full max-w-2xl overflow-hidden rounded-3xl"
    >
      <div className="border-b border-gray-200 bg-gradient-to-r from-error-50 to-white px-6 py-6 dark:border-gray-800 dark:from-error-500/10 dark:to-gray-900 sm:px-8">
        <div className="pr-12">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-error-600 dark:text-error-300">
            Permanent Delete
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
            Delete Collection
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            This removes the collection from Shopify. Type the exact collection
            name below to unlock delete.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6 px-6 py-6 sm:px-8">
        <div className="rounded-3xl border border-error-200 bg-error-50/70 p-5 dark:border-error-500/20 dark:bg-error-500/10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-error-600 dark:text-error-300">
            Collection To Delete
          </p>
          <h4 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
            {collection?.title ?? "-"}
          </h4>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Type exactly:
          </p>
          <div className="mt-3 inline-flex rounded-xl bg-white px-3 py-2 text-sm font-semibold text-error-700 shadow-sm dark:bg-gray-900 dark:text-error-300">
            {collection?.title ?? "-"}
          </div>
        </div>

        <div>
          <label
            htmlFor="shopify-delete-confirmation"
            className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Confirm Collection Name
          </label>
          <input
            id="shopify-delete-confirmation"
            type="text"
            value={confirmationName}
            onChange={(event) => onConfirmationNameChange(event.target.value)}
            placeholder="Type the exact collection name"
            className={inputClassName}
            autoFocus
          />
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Deletion stays disabled until the name matches exactly, including
            capitalization and spaces.
          </p>
        </div>

        {error ? (
          <div className="rounded-2xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300">
            {error}
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-5 sm:flex-row sm:items-center sm:justify-end dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isMatch || isDeleting}
            className="rounded-2xl bg-error-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-error-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDeleting ? "Deleting..." : "Delete Collection"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const PublishCollectionModal = ({
  isOpen,
  collection,
  nextPublished,
  error,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  collection: ShopifyCollectionRow | null;
  nextPublished: boolean;
  error: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    className="mx-4 w-full max-w-2xl overflow-hidden rounded-3xl"
  >
    <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-white px-6 py-6 dark:border-gray-800 dark:from-brand-500/10 dark:to-gray-900 sm:px-8">
      <div className="pr-12">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">
          Shopify Publication
        </p>
        <h3 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
          {nextPublished ? "Publish Collection" : "Unpublish Collection"}
        </h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          This change will be applied in Shopify immediately after you confirm.
        </p>
      </div>
    </div>

    <form onSubmit={onSubmit} className="space-y-6 px-6 py-6 sm:px-8">
      <div className="rounded-3xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-800/40">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
          Collection
        </p>
        <h4 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
          {collection?.title ?? "-"}
        </h4>
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
          {nextPublished
            ? "This will publish the collection to Shopify sales channels."
            : "This will unpublish the collection from Shopify sales channels."}
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-5 sm:flex-row sm:items-center sm:justify-end dark:border-gray-800">
        <button
          type="button"
          onClick={onClose}
          className="rounded-2xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting
            ? nextPublished
              ? "Publishing..."
              : "Unpublishing..."
            : nextPublished
              ? "Confirm Publish"
              : "Confirm Unpublish"}
        </button>
      </div>
    </form>
  </Modal>
);

const ShopifyCollections = () => {
  const [collections, setCollections] = useState<ShopifyCollectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(
    null
  );
  const [categoryPaths, setCategoryPaths] = useState<CategoryFilterPath[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTopCategory, setSelectedTopCategory] = useState("");
  const [selectedParentCategory, setSelectedParentCategory] = useState("");
  const [selectedFinalCategory, setSelectedFinalCategory] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [collectionTitle, setCollectionTitle] = useState("");
  const [ruleValue, setRuleValue] = useState("");
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const [isRuleValueDirty, setIsRuleValueDirty] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [collectionToDelete, setCollectionToDelete] =
    useState<ShopifyCollectionRow | null>(null);
  const [collectionToPublish, setCollectionToPublish] =
    useState<ShopifyCollectionRow | null>(null);
  const [publishTargetState, setPublishTargetState] = useState(false);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const hasLoadedCollections = useRef(false);

  const resetCreateForm = () => {
    setCollectionTitle("");
    setRuleValue("");
    setDescriptionHtml("");
    setIsRuleValueDirty(false);
    setCreateError(null);
  };

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    resetCreateForm();
  };

  const closeDeleteModal = () => {
    if (isDeleting) {
      return;
    }

    setIsDeleteOpen(false);
    setCollectionToDelete(null);
    setDeleteConfirmationName("");
    setDeleteError(null);
  };

  const closePublishModal = () => {
    if (isPublishing) {
      return;
    }

    setIsPublishModalOpen(false);
    setCollectionToPublish(null);
    setPublishTargetState(false);
    setPublishError(null);
  };

  const fetchCategoryFilters = async () => {
    setFilterError(null);

    try {
      const response = await fetch("/api/shopify/category-filters");
      const result: ShopifyCategoryFiltersResponse = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Failed to fetch Shopify category filters"
        );
      }

      setCategoryPaths(Array.isArray(result.data?.paths) ? result.data.paths : []);
    } catch (fetchError: any) {
      console.error("Failed to fetch Shopify category filters", fetchError);
      setFilterError(
        fetchError?.message || "Failed to load Shopify category filters"
      );
    }
  };

  const fetchCollections = async (
    requestedPage = page,
    requestedSearchQuery = searchQuery
  ) => {
    if (hasLoadedCollections.current) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const params = new URLSearchParams({
        page: String(requestedPage),
        pageSize: String(PAGE_SIZE),
      });
      const trimmedSearchQuery = requestedSearchQuery.trim();

      if (trimmedSearchQuery) {
        params.set("search", trimmedSearchQuery);
      }

      if (selectedTopCategory) {
        params.set("topCategory", selectedTopCategory);
      }

      if (selectedParentCategory) {
        params.set("parentCategory", selectedParentCategory);
      }

      if (selectedFinalCategory) {
        params.set("finalCategory", selectedFinalCategory);
      }

      const response = await fetch(`/api/shopify/collections?${params.toString()}`);
      const result: ShopifyCollectionsResponse = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Failed to fetch Shopify collections"
        );
      }

      setCollections(Array.isArray(result.data) ? result.data : []);
      setTotalCount(result.count ?? 0);
      setTotalPages(result.totalPages ?? 1);

      if (
        typeof result.page === "number" &&
        result.page !== requestedPage
      ) {
        setPage(result.page);
      }

      hasLoadedCollections.current = true;
    } catch (fetchError: any) {
      console.error("Failed to fetch Shopify collections", fetchError);
      setError(
        fetchError?.message || "Failed to load Shopify collections"
      );
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchCategoryFilters();
  }, []);

  useEffect(() => {
    void fetchCollections(page, searchQuery);
  }, [
    page,
    searchQuery,
    selectedTopCategory,
    selectedParentCategory,
    selectedFinalCategory,
  ]);

  useEffect(() => {
    if (!isRuleValueDirty) {
      setRuleValue(collectionTitle);
    }
  }, [collectionTitle, isRuleValueDirty]);

  const topCategoryOptions = useMemo(
    () =>
      [...new Set(categoryPaths.map((path) => path.topCategory).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right)),
    [categoryPaths]
  );

  const parentCategoryOptions = useMemo(() => {
    return [
      ...new Set(
        categoryPaths
          .filter(
            (path) =>
              !selectedTopCategory || path.topCategory === selectedTopCategory
          )
          .map((path) => path.parentCategory)
          .filter(Boolean)
      ),
    ].sort((left, right) => left.localeCompare(right));
  }, [categoryPaths, selectedTopCategory]);

  const finalCategoryOptions = useMemo(() => {
    return [
      ...new Set(
        categoryPaths
          .filter(
            (path) =>
              (!selectedTopCategory || path.topCategory === selectedTopCategory) &&
              (!selectedParentCategory ||
                path.parentCategory === selectedParentCategory)
          )
          .map((path) => path.finalCategory)
          .filter(Boolean)
      ),
    ].sort((left, right) => left.localeCompare(right));
  }, [categoryPaths, selectedParentCategory, selectedTopCategory]);

  const startItem = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, totalCount);

  const handlePageClick = (pageNumber: number) => {
    if (pageNumber < 1 || pageNumber > totalPages || pageNumber === page) {
      return;
    }

    setPage(pageNumber);
  };

  const handleExport = async (format: ExportFormat) => {
    setExportingFormat(format);
    setExportError(null);

    try {
      const params = new URLSearchParams({ format });
      const trimmedSearchQuery = searchQuery.trim();

      if (trimmedSearchQuery) {
        params.set("search", trimmedSearchQuery);
      }

      if (selectedTopCategory) {
        params.set("topCategory", selectedTopCategory);
      }

      if (selectedParentCategory) {
        params.set("parentCategory", selectedParentCategory);
      }

      if (selectedFinalCategory) {
        params.set("finalCategory", selectedFinalCategory);
      }

      const response = await fetch(
        `/api/shopify/collections/export?${params.toString()}`
      );

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(
          result?.message || "Failed to export Shopify collections report"
        );
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = downloadUrl;
      link.download = getDownloadFilename(
        response.headers.get("Content-Disposition"),
        `shopify-collections-category-report.${format}`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (submitError: any) {
      console.error("Failed to export Shopify collections report", submitError);
      setExportError(
        submitError?.message || "Failed to export Shopify collections report"
      );
    } finally {
      setExportingFormat(null);
    }
  };

  const handleCreateCollection = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    const trimmedTitle = collectionTitle.trim();
    const trimmedRuleValue = ruleValue.trim() || trimmedTitle;

    if (!trimmedTitle) {
      setCreateError("Collection name is required.");
      return;
    }

    setIsCreating(true);
    setCreateError(null);
    setCreateSuccess(null);
    setPublishSuccess(null);
    setDeleteSuccess(null);

    try {
      const response = await fetch("/api/shopify/collections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: trimmedTitle,
          ruleValue: trimmedRuleValue,
          descriptionHtml: descriptionHtml.trim(),
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Failed to create Shopify collection"
        );
      }

      if (page !== 1) {
        setPage(1);
      } else {
        await fetchCollections(1, searchQuery);
      }
      setCreateSuccess(
        `Collection "${result.data?.title ?? trimmedTitle}" was created in Shopify.`
      );
      closeCreateModal();
    } catch (submitError: any) {
      console.error("Failed to create Shopify collection", submitError);
      setCreateError(
        submitError?.message || "Failed to create Shopify collection"
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteCollection = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!collectionToDelete) {
      setDeleteError("Select a collection to delete.");
      return;
    }

    if (deleteConfirmationName !== collectionToDelete.title) {
      setDeleteError("Type the exact collection name to continue.");
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    setCreateSuccess(null);
    setPublishSuccess(null);
    setDeleteSuccess(null);

    try {
      const response = await fetch(
        `/api/shopify/collections/${collectionToDelete.id}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            confirmationName: deleteConfirmationName,
          }),
        }
      );
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Failed to delete Shopify collection"
        );
      }

      if (page !== 1) {
        setPage(1);
      } else {
        await fetchCollections(1, searchQuery);
      }
      setDeleteSuccess(
        `Collection "${result.data?.title ?? collectionToDelete.title}" was deleted from Shopify.`
      );
      closeDeleteModal();
    } catch (submitError: any) {
      console.error("Failed to delete Shopify collection", submitError);
      setDeleteError(
        submitError?.message || "Failed to delete Shopify collection"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePublishCollection = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!collectionToPublish) {
      setPublishError("Select a collection to update.");
      return;
    }

    setIsPublishing(true);
    setPublishError(null);
    setCreateSuccess(null);
    setPublishSuccess(null);
    setDeleteSuccess(null);

    try {
      const response = await fetch(
        `/api/shopify/collections/${collectionToPublish.id}/publish`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            published: publishTargetState,
          }),
        }
      );
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Failed to update Shopify collection publish state"
        );
      }

      await fetchCollections(page, searchQuery);
      setPublishSuccess(
        publishTargetState
          ? `Collection "${collectionToPublish.title}" was published in Shopify.`
          : `Collection "${collectionToPublish.title}" was unpublished in Shopify.`
      );
      closePublishModal();
    } catch (submitError: any) {
      console.error(
        "Failed to update Shopify collection publish state",
        submitError
      );
      setPublishError(
        submitError?.message ||
          "Failed to update Shopify collection publish state"
      );
    } finally {
      setIsPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400">
        Loading Shopify collections...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ComponentCard
        title="Shopify Collections"
        desc="Smart and custom collections available in the connected Shopify store."
      >
        <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/30">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Category Filters
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Leave any filter blank to include all values. Exports will use
                the same filters shown here.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPage(1);
                setSelectedTopCategory("");
                setSelectedParentCategory("");
                setSelectedFinalCategory("");
              }}
              className="rounded-2xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-white dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
            >
              Reset Filters
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Category
              </label>
              <select
                value={selectedTopCategory}
                onChange={(event) => {
                  setPage(1);
                  setSelectedTopCategory(event.target.value);
                  setSelectedParentCategory("");
                  setSelectedFinalCategory("");
                }}
                className={selectClassName}
              >
                <option value="">All Categories</option>
                {topCategoryOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Sub Category
              </label>
              <select
                value={selectedParentCategory}
                onChange={(event) => {
                  setPage(1);
                  setSelectedParentCategory(event.target.value);
                  setSelectedFinalCategory("");
                }}
                className={selectClassName}
              >
                <option value="">All Sub Categories</option>
                {parentCategoryOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Final Category
              </label>
              <select
                value={selectedFinalCategory}
                onChange={(event) => {
                  setPage(1);
                  setSelectedFinalCategory(event.target.value);
                }}
                className={selectClassName}
              >
                <option value="">All Final Categories</option>
                {finalCategoryOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filterError ? (
            <p className="mt-3 text-sm text-red-600">{filterError}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <ProductSearchBar
            id="shopify-collections-search"
            label="Search Shopify collections"
            value={searchQuery}
            onChange={(value) => {
              setPage(1);
              setSearchQuery(value);
            }}
            placeholder="Search by collection title, type, handle, sort order, or ID"
          />
          <div className="flex flex-wrap items-center gap-2">
            {(["json", "csv", "pdf"] as ExportFormat[]).map((format) => (
              <button
                key={format}
                type="button"
                disabled={exportingFormat !== null}
                onClick={() => void handleExport(format)}
                className="inline-flex items-center justify-center rounded-2xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                {exportingFormat === format
                  ? `Exporting ${format.toUpperCase()}...`
                  : `Export ${format.toUpperCase()}`}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setCreateSuccess(null);
                setDeleteSuccess(null);
                setCreateError(null);
                setIsCreateOpen(true);
              }}
              className="inline-flex items-center justify-center rounded-2xl bg-brand-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-600"
            >
              Create
            </button>
          </div>
        </div>

        {createSuccess ? (
          <div className="rounded-2xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300">
            {createSuccess}
          </div>
        ) : null}

        {publishSuccess ? (
          <div className="rounded-2xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300">
            {publishSuccess}
          </div>
        ) : null}

        {deleteSuccess ? (
          <div className="rounded-2xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300">
            {deleteSuccess}
          </div>
        ) : null}

        {isRefreshing ? (
          <p className="text-sm text-gray-500">
            Loading page {page} of Shopify collections...
          </p>
        ) : null}

        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : null}

        {exportError ? (
          <p className="text-sm text-red-600">{exportError}</p>
        ) : null}

        {searchQuery && !error ? (
          <p className="text-sm text-gray-500">
            {totalCount} matching collection{totalCount === 1 ? "" : "s"} found.
          </p>
        ) : null}

        {!error && !loading && collections.length === 0 ? (
          <p className="text-sm text-gray-500">
            {searchQuery
              ? "No Shopify collections match your search."
              : "No Shopify collections found."}
          </p>
        ) : null}

        {!error && collections.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
            <div className="max-w-full overflow-x-auto">
              <Table>
                <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                  <TableRow>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Collection
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Type
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Handle
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Sort Order
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Products
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Published
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Updated
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Action
                    </TableCell>
                  </TableRow>
                </TableHeader>

                <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {collections.map((collection) => (
                    <TableRow key={collection.id}>
                      <TableCell className="px-5 py-4 text-start">
                        <div>
                          <span className="block font-medium text-gray-800 text-theme-sm dark:text-white/90">
                            {collection.title}
                          </span>
                          <span className="block text-theme-xs text-gray-500 dark:text-gray-400">
                            ID: {collection.id}
                          </span>
                          {collection.collectionUrl ? (
                            <a
                              href={collection.collectionUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-block text-theme-xs text-brand-500 hover:underline"
                            >
                              Open collection
                            </a>
                          ) : null}
                        </div>
                      </TableCell>

                      <TableCell className="px-5 py-4">
                        <Badge
                          size="sm"
                          color={collection.type === "smart" ? "primary" : "info"}
                        >
                          {collection.type}
                        </Badge>
                      </TableCell>

                      <TableCell className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                        {collection.handle ? `/${collection.handle}` : "-"}
                      </TableCell>

                      <TableCell className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                        {collection.sortOrder}
                      </TableCell>

                      <TableCell className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                        {collection.productCount}
                      </TableCell>

                      <TableCell className="px-5 py-4 text-start">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={collection.published}
                            onClick={() => {
                              setCreateSuccess(null);
                              setPublishSuccess(null);
                              setDeleteSuccess(null);
                              setPublishError(null);
                              setCollectionToPublish(collection);
                              setPublishTargetState(!collection.published);
                              setIsPublishModalOpen(true);
                            }}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                              collection.published
                                ? "bg-success-500"
                                : "bg-gray-300 dark:bg-gray-700"
                            }`}
                          >
                            <span
                              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${
                                collection.published
                                  ? "translate-x-5"
                                  : "translate-x-1"
                              }`}
                            />
                          </button>
                          <Badge
                            size="sm"
                            color={collection.published ? "success" : "light"}
                          >
                            {collection.published ? "Published" : "Unpublished"}
                          </Badge>
                        </div>
                        <span className="mt-2 block text-theme-xs text-gray-500 dark:text-gray-400">
                          {formatDate(collection.publishedAt)}
                        </span>
                      </TableCell>

                      <TableCell className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                        {formatDate(collection.updatedAt)}
                      </TableCell>

                      <TableCell className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => {
                            setCreateSuccess(null);
                            setPublishSuccess(null);
                            setDeleteSuccess(null);
                            setDeleteError(null);
                            setCollectionToDelete(collection);
                            setDeleteConfirmationName("");
                            setIsDeleteOpen(true);
                          }}
                          className="rounded-xl border border-error-200 px-3 py-1.5 text-theme-xs font-medium text-error-600 transition hover:bg-error-50 dark:border-error-500/20 dark:text-error-300 dark:hover:bg-error-500/10"
                        >
                          Delete
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}

        {!error && collections.length > 0 ? (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-gray-500">
              {startItem}-{endItem} / {totalCount}
            </span>

            <div className="flex items-center gap-2">
              <button
                disabled={page === 1 || isRefreshing}
                onClick={() => handlePageClick(page - 1)}
                className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
              >
                Previous
              </button>

              {Array.from({ length: totalPages }, (_, index) => index + 1)
                .slice(Math.max(0, page - 3), Math.min(totalPages, page + 2))
                .map((pageNumber) => (
                  <button
                    key={pageNumber}
                    onClick={() => handlePageClick(pageNumber)}
                    className={`rounded-md px-3 py-1 text-sm ${
                      pageNumber === page ? "bg-blue-600 text-white" : "border"
                    }`}
                  >
                    {pageNumber}
                  </button>
                ))}

              {page + 2 < totalPages ? (
                <span className="px-1 text-sm">...</span>
              ) : null}

              <button
                disabled={page === totalPages || isRefreshing}
                onClick={() => handlePageClick(page + 1)}
                className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </ComponentCard>

      <CreateCollectionModal
        isOpen={isCreateOpen}
        title={collectionTitle}
        ruleValue={ruleValue}
        descriptionHtml={descriptionHtml}
        error={createError}
        isCreating={isCreating}
        onTitleChange={(value) => setCollectionTitle(value)}
        onRuleValueChange={(value) => {
          setIsRuleValueDirty(true);
          setRuleValue(value);
        }}
        onDescriptionChange={setDescriptionHtml}
        onResetRuleValue={() => {
          setIsRuleValueDirty(false);
          setRuleValue(collectionTitle);
        }}
        onClose={closeCreateModal}
        onSubmit={handleCreateCollection}
      />

      <DeleteCollectionModal
        isOpen={isDeleteOpen}
        collection={collectionToDelete}
        confirmationName={deleteConfirmationName}
        error={deleteError}
        isDeleting={isDeleting}
        onConfirmationNameChange={setDeleteConfirmationName}
        onClose={closeDeleteModal}
        onSubmit={handleDeleteCollection}
      />

      <PublishCollectionModal
        isOpen={isPublishModalOpen}
        collection={collectionToPublish}
        nextPublished={publishTargetState}
        error={publishError}
        isSubmitting={isPublishing}
        onClose={closePublishModal}
        onSubmit={handlePublishCollection}
      />
    </div>
  );
};

export default ShopifyCollections;
