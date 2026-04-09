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

type ShopifyProductRow = {
  id: string;
  shopifyProductId: number | null;
  title: string;
  handle: string | null;
  vendor: string;
  editableCollectionIds: number[];
  collectionNames: string[];
  tags: string[];
  productUrl: string | null;
};

type ShopifyCollectionOption = {
  id: number;
  title: string;
  handle: string | null;
  type: "custom" | "smart";
  sortOrder: string;
  published: boolean;
  productCount: number;
};

const PAGE_SIZE = 25;
const COLLECTION_ROW_HEIGHT = 112;
const COLLECTION_LIST_OVERSCAN = 6;
const inputClassName =
  "w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const ManageCollectionsModal = ({
  isOpen,
  product,
  collections,
  collectionsLoading,
  collectionsError,
  searchQuery,
  selectedCollectionIds,
  saveError,
  isSaving,
  onSearchChange,
  onToggleCollection,
  onRefreshCollections,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  product: ShopifyProductRow | null;
  collections: ShopifyCollectionOption[];
  collectionsLoading: boolean;
  collectionsError: string | null;
  searchQuery: string;
  selectedCollectionIds: number[];
  saveError: string | null;
  isSaving: boolean;
  onSearchChange: (value: string) => void;
  onToggleCollection: (collectionId: number) => void;
  onRefreshCollections: () => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) => {
  type CollectionView = "all" | "selected" | "smart" | "custom";

  const selectedIds = new Set(selectedCollectionIds);
  const listViewportRef = useRef<HTMLDivElement | null>(null);
  const [activeView, setActiveView] = useState<CollectionView>("all");
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const selectedCollections = useMemo(
    () =>
      collections
        .filter((collection) => selectedIds.has(collection.id))
        .sort((left, right) => left.title.localeCompare(right.title)),
    [collections, selectedCollectionIds]
  );

  const viewCounts = useMemo(
    () => ({
      all: collections.length,
      selected: selectedCollectionIds.length,
      smart: collections.filter((collection) => collection.type === "smart")
        .length,
      custom: collections.filter((collection) => collection.type === "custom")
        .length,
    }),
    [collections, selectedCollectionIds]
  );

  const filteredCollections = useMemo(() => {
    return collections
      .filter((collection) => {
        if (activeView === "selected" && !selectedIds.has(collection.id)) {
          return false;
        }

        if (activeView === "smart" && collection.type !== "smart") {
          return false;
        }

        if (activeView === "custom" && collection.type !== "custom") {
          return false;
        }

        if (!normalizedSearchQuery) {
          return true;
        }

        return [
          collection.title,
          collection.type,
          collection.handle ?? "",
          collection.sortOrder,
          collection.productCount.toString(),
        ].some((value) => value.toLowerCase().includes(normalizedSearchQuery));
      })
      .sort((left, right) => {
        const selectedOrder =
          Number(selectedIds.has(right.id)) - Number(selectedIds.has(left.id));

        if (selectedOrder !== 0) {
          return selectedOrder;
        }

        if (left.type !== right.type) {
          return left.type === "smart" ? -1 : 1;
        }

        return left.title.localeCompare(right.title);
      });
  }, [activeView, collections, normalizedSearchQuery, selectedCollectionIds]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setActiveView("all");
    setScrollTop(0);
  }, [isOpen, product?.id]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const viewportElement = listViewportRef.current;
    setScrollTop(0);

    if (viewportElement) {
      viewportElement.scrollTop = 0;
      setViewportHeight(viewportElement.clientHeight);
    }

    const updateViewportHeight = () => {
      setViewportHeight(listViewportRef.current?.clientHeight ?? 0);
    };

    updateViewportHeight();
    window.addEventListener("resize", updateViewportHeight);

    return () => {
      window.removeEventListener("resize", updateViewportHeight);
    };
  }, [activeView, filteredCollections.length, isOpen, searchQuery]);

  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / COLLECTION_ROW_HEIGHT) - COLLECTION_LIST_OVERSCAN
  );
  const visibleItemCount =
    Math.ceil(viewportHeight / COLLECTION_ROW_HEIGHT) +
    COLLECTION_LIST_OVERSCAN * 2;
  const endIndex = Math.min(
    filteredCollections.length,
    startIndex + visibleItemCount
  );
  const visibleCollections = filteredCollections.slice(startIndex, endIndex);
  const topSpacerHeight = startIndex * COLLECTION_ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(
    0,
    (filteredCollections.length - endIndex) * COLLECTION_ROW_HEIGHT
  );
  const selectionPreview = selectedCollections.slice(0, 10);
  const remainingSelectionCount = Math.max(
    0,
    selectedCollections.length - selectionPreview.length
  );
  const viewOptions: Array<{
    value: CollectionView;
    label: string;
    badgeColor: "light" | "primary" | "info";
  }> = [
    { value: "all", label: "All", badgeColor: "light" },
    { value: "selected", label: "Selected", badgeColor: "primary" },
    { value: "smart", label: "Smart", badgeColor: "primary" },
    { value: "custom", label: "Custom", badgeColor: "info" },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="m-4 h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[1280px] overflow-hidden rounded-3xl"
    >
      <div className="flex h-full flex-col">
        <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-white px-6 py-6 dark:border-gray-800 dark:from-brand-500/10 dark:to-gray-900 sm:px-8">
          <div className="pr-12">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">
              Shopify Product Collections
            </p>
            <h3 className="mt-2 line-clamp-2 text-2xl font-semibold text-gray-900 dark:text-white">
              {product?.title ?? "Manage Collections"}
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Search quickly, keep selected collections at the top, and save
              changes to Shopify immediately.
            </p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex min-h-0 flex-1 px-6 py-5 sm:px-8">
            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div className="min-h-0 overflow-y-auto rounded-3xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/30">
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                        Selected
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                        {selectedCollectionIds.length}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                        Smart
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                        {viewCounts.smart}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                        Custom
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                        {viewCounts.custom}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-dashed border-brand-200 bg-brand-50/60 px-4 py-4 dark:border-brand-500/20 dark:bg-brand-500/10">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-500">
                      How It Works
                    </p>
                    <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                      Collections to select appear in the results panel on the
                      right. Use search or the filter chips below to narrow the
                      list.
                    </p>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Smart collections use <code>custom.type_multiple</code>.
                      Custom collections use normal Shopify membership.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="shopify-product-collections-search"
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      Search Collections
                    </label>
                    <input
                      id="shopify-product-collections-search"
                      type="text"
                      value={searchQuery}
                      onChange={(event) => onSearchChange(event.target.value)}
                      placeholder="Search by collection name, handle, type, or product count"
                      className={inputClassName}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {viewOptions.map((option) => {
                      const isActive = activeView === option.value;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setActiveView(option.value)}
                          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                            isActive
                              ? "border-brand-500 bg-brand-500 text-white"
                              : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                          }`}
                        >
                          <span>{option.label}</span>
                          <Badge
                            size="sm"
                            color={isActive ? "light" : option.badgeColor}
                          >
                            {viewCounts[option.value]}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
                          Current Selection
                        </p>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          Click any selected pill to remove it quickly.
                        </p>
                      </div>
                      <Badge size="sm" color="primary">
                        {selectedCollections.length} selected
                      </Badge>
                    </div>

                    <div className="mt-3 flex max-h-36 flex-wrap gap-2 overflow-y-auto pr-1">
                      {selectionPreview.length > 0 ? (
                        selectionPreview.map((collection) => (
                          <button
                            key={collection.id}
                            type="button"
                            onClick={() => onToggleCollection(collection.id)}
                            className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:hover:bg-brand-500/20"
                          >
                            {collection.title}
                          </button>
                        ))
                      ) : (
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          No collections selected yet.
                        </span>
                      )}

                      {remainingSelectionCount > 0 ? (
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                          +{remainingSelectionCount} more
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/30">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-4 dark:border-gray-800">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                      Collections To Select
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Tick the checkbox beside any collection name in this list.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                    Showing{" "}
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {filteredCollections.length}
                    </span>{" "}
                    collections
                  </div>
                </div>

                <div className="border-b border-gray-200 px-4 py-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  Search and filters on the left update this list instantly.
                </div>

                <div
                  ref={listViewportRef}
                  onScroll={(event) =>
                    setScrollTop(event.currentTarget.scrollTop)
                  }
                  className="min-h-[320px] flex-1 overflow-y-auto px-3 py-3"
                >
                  {collectionsError ? (
                    <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-2xl border border-error-200 bg-error-50 px-6 py-10 text-center dark:border-error-500/20 dark:bg-error-500/10">
                      <p className="text-sm font-medium text-error-700 dark:text-error-300">
                        Failed to load Shopify collections.
                      </p>
                      <p className="mt-2 text-sm text-error-600 dark:text-error-200">
                        {collectionsError}
                      </p>
                      <button
                        type="button"
                        onClick={onRefreshCollections}
                        className="mt-4 rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600"
                      >
                        Retry Loading Collections
                      </button>
                    </div>
                  ) : collectionsLoading ? (
                    <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
                      Loading collections...
                    </div>
                  ) : filteredCollections.length === 0 ? (
                    <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
                      <p className="font-medium text-gray-700 dark:text-gray-200">
                        No collections are visible for this filter.
                      </p>
                      <p className="mt-2 max-w-md">
                        Try clearing the search, switch to the{" "}
                        <span className="font-medium">All</span> filter, or
                        reload collections if Shopify data did not load.
                      </p>
                    </div>
                  ) : (
                    <div
                      style={{
                        paddingTop: topSpacerHeight,
                        paddingBottom: bottomSpacerHeight,
                      }}
                      className="space-y-3"
                    >
                      {visibleCollections.map((collection) => {
                        const isSelected = selectedIds.has(collection.id);

                        return (
                          <label
                            key={collection.id}
                            style={{ minHeight: COLLECTION_ROW_HEIGHT }}
                            className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-4 transition ${
                              isSelected
                                ? "border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10"
                                : "border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800/40"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => onToggleCollection(collection.id)}
                              className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                  {collection.title}
                                </span>
                                <Badge
                                  size="sm"
                                  color={
                                    collection.type === "smart"
                                      ? "primary"
                                      : "info"
                                  }
                                >
                                  {collection.type}
                                </Badge>
                                {isSelected ? (
                                  <Badge size="sm" color="success">
                                    Selected
                                  </Badge>
                                ) : null}
                              </div>

                              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                {collection.type === "smart"
                                  ? "Controlled by Type Multiple. Saving updates the product metafield in Shopify."
                                  : "Manual collection membership. Saving updates the product's collection links in Shopify."}
                              </p>

                              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
                                <span>
                                  Handle:{" "}
                                  {collection.handle
                                    ? `/${collection.handle}`
                                    : "-"}
                                </span>
                                <span>Products: {collection.productCount}</span>
                                <span>Sort: {collection.sortOrder || "-"}</span>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 px-6 py-5 dark:border-gray-800 sm:px-8">
            {saveError ? (
              <div className="mb-4 rounded-2xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300">
                {saveError}
              </div>
            ) : null}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Saving will update both smart and custom collection membership
                in Shopify immediately.
              </p>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-2xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || collectionsLoading}
                  className="rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save Collections"}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </Modal>
  );
};

const ShopifyProducts = () => {
  const [products, setProducts] = useState<ShopifyProductRow[]>([]);
  const [collections, setCollections] = useState<ShopifyCollectionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [collectionsError, setCollectionsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [activeProduct, setActiveProduct] = useState<ShopifyProductRow | null>(null);
  const [collectionSearch, setCollectionSearch] = useState("");
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<number[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const hasFetchedProducts = useRef(false);

  const fetchProducts = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/shopify/products");
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to fetch Shopify products");
      }

      setProducts(result.data);
    } catch (fetchError: any) {
      console.error("Failed to fetch Shopify products", fetchError);
      setError(fetchError?.message || "Failed to load Shopify products");
    } finally {
      setLoading(false);
    }
  };

  const fetchCollections = async () => {
    setCollectionsLoading(true);
    setCollectionsError(null);

    try {
      const response = await fetch("/api/shopify/collections");
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to fetch Shopify collections");
      }

      setCollections(result.data);
    } catch (fetchError: any) {
      console.error("Failed to fetch Shopify collections", fetchError);
      setCollections([]);
      setCollectionsError(
        fetchError?.message || "Failed to load Shopify collections"
      );
    } finally {
      setCollectionsLoading(false);
    }
  };

  useEffect(() => {
    if (hasFetchedProducts.current) {
      return;
    }

    hasFetchedProducts.current = true;
    fetchProducts();
    fetchCollections();
  }, []);

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return products;
    }

    return products.filter((product) =>
      [
        product.title,
        product.vendor,
        product.handle ?? "",
        product.shopifyProductId?.toString() ?? "",
        product.collectionNames.join(" "),
        product.tags.join(" "),
      ].some((value) => value.toLowerCase().includes(query))
    );
  }, [products, searchQuery]);

  const totalCount = filteredProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const paginatedProducts = filteredProducts.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );
  const startItem = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, totalCount);

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const handlePageClick = (pageNumber: number) => {
    if (pageNumber < 1 || pageNumber > totalPages || pageNumber === page) {
      return;
    }

    setPage(pageNumber);
  };

  const handleOpenManageCollections = (product: ShopifyProductRow) => {
    setActiveProduct(product);
    setSelectedCollectionIds(product.editableCollectionIds);
    setCollectionSearch("");
    setSaveError(null);
    setSuccessMessage(null);
    setIsManageOpen(true);

    if (collections.length === 0) {
      fetchCollections();
    }
  };

  const handleCloseManageCollections = () => {
    if (isSaving) {
      return;
    }

    setIsManageOpen(false);
    setActiveProduct(null);
    setSelectedCollectionIds([]);
    setCollectionSearch("");
    setSaveError(null);
  };

  const handleToggleCollection = (collectionId: number) => {
    setSelectedCollectionIds((previous) =>
      previous.includes(collectionId)
        ? previous.filter((id) => id !== collectionId)
        : [...previous, collectionId].sort((left, right) => left - right)
    );
  };

  const handleSaveCollections = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!activeProduct?.shopifyProductId) {
      setSaveError("This Shopify product is missing a valid Shopify ID.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await fetch(
        `/api/shopify/products/${activeProduct.shopifyProductId}/collections`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            selectedCollectionIds,
          }),
        }
      );
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Failed to update Shopify product collections"
        );
      }

      await Promise.all([fetchProducts(), fetchCollections()]);
      setSuccessMessage(
        `Collections updated for "${activeProduct.title}" in Shopify.`
      );
      handleCloseManageCollections();
    } catch (submitError: any) {
      console.error("Failed to update Shopify product collections", submitError);
      setSaveError(
        submitError?.message || "Failed to update Shopify product collections"
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return <div>Loading Shopify products...</div>;
  }

  return (
    <div className="space-y-6">
      <ComponentCard
        title="Shopify Products"
        desc="Products fetched directly from the connected Shopify store."
      >
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <ProductSearchBar
            id="shopify-products-search"
            label="Search Shopify products"
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search by title, vendor, collection, handle, tag, or Shopify ID"
          />
        </div>

        {successMessage ? (
          <div className="rounded-2xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300">
            {successMessage}
          </div>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {searchQuery && !error ? (
          <p className="text-sm text-gray-500">
            {totalCount} matching Shopify product
            {totalCount === 1 ? "" : "s"} found.
          </p>
        ) : null}

        {!error && filteredProducts.length === 0 ? (
          <p className="text-sm text-gray-500">
            {searchQuery
              ? "No Shopify products match your search."
              : "No Shopify products found."}
          </p>
        ) : null}

        {!error && filteredProducts.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
            <div className="max-w-full overflow-x-auto">
              <Table>
                <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                  <TableRow>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Product
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Shopify ID
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Vendor
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Collection
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Action
                    </TableCell>
                  </TableRow>
                </TableHeader>

                <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {paginatedProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="px-5 py-4 text-start">
                        <div>
                          <span className="block font-medium text-gray-800 text-theme-sm dark:text-white/90">
                            {product.title}
                          </span>
                          <span className="block text-theme-xs text-gray-500 dark:text-gray-400">
                            {product.handle ? `/${product.handle}` : "No handle"}
                          </span>
                          {product.productUrl ? (
                            <a
                              href={product.productUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-block text-theme-xs text-brand-500 hover:underline"
                            >
                              Open product
                            </a>
                          ) : null}
                        </div>
                      </TableCell>

                      <TableCell className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                        {product.shopifyProductId ?? "-"}
                      </TableCell>

                      <TableCell className="px-5 py-4 text-start">
                        <span className="block text-theme-sm text-gray-700 dark:text-gray-300">
                          {product.vendor}
                        </span>
                      </TableCell>

                      <TableCell className="px-5 py-4 text-start">
                        <div className="flex flex-wrap gap-2">
                          {product.collectionNames.length > 0 ? (
                            product.collectionNames.map((collectionName) => (
                              <span
                                key={`${product.id}-${collectionName}`}
                                className="rounded-full bg-brand-50 px-3 py-1 text-theme-xs font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                              >
                                {collectionName}
                              </span>
                            ))
                          ) : (
                            <span className="text-theme-sm text-gray-500 dark:text-gray-400">
                              No collections
                            </span>
                          )}
                        </div>
                        <span className="mt-2 block text-theme-xs text-gray-500 dark:text-gray-400">
                          {product.tags.length > 0
                            ? product.tags.slice(0, 2).join(", ")
                            : "No tags"}
                        </span>
                      </TableCell>

                      <TableCell className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => handleOpenManageCollections(product)}
                          className="rounded-2xl bg-brand-500 px-3 py-2 text-theme-xs font-medium text-white transition hover:bg-brand-600"
                        >
                          Manage Collections
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}

        {!error && filteredProducts.length > 0 ? (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-gray-500">
              {startItem}-{endItem} / {totalCount}
            </span>

            <div className="flex items-center gap-2">
              <button
                disabled={page === 1}
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
                disabled={page === totalPages}
                onClick={() => handlePageClick(page + 1)}
                className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </ComponentCard>

      <ManageCollectionsModal
        isOpen={isManageOpen}
        product={activeProduct}
        collections={collections}
        collectionsLoading={collectionsLoading}
        collectionsError={collectionsError}
        searchQuery={collectionSearch}
        selectedCollectionIds={selectedCollectionIds}
        saveError={saveError}
        isSaving={isSaving}
        onSearchChange={setCollectionSearch}
        onToggleCollection={handleToggleCollection}
        onRefreshCollections={fetchCollections}
        onClose={handleCloseManageCollections}
        onSubmit={handleSaveCollections}
      />
    </div>
  );
};

export default ShopifyProducts;
