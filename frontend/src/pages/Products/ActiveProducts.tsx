import { useEffect, useState } from "react";
import ComponentCard from "../../components/common/ComponentCard";
import { useProductStatusUpdate } from "../../hooks/useProductStatusUpdate";
import StatusPopups from "../../components/common/StatusPopups";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import Badge from "../../components/ui/badge/Badge";
import ProductSearchBar from "./ProductSearchBar";
import ProductDetailsModal from "./ProductDetailsModal";
import { filterProductsByQuery } from "./productSearch";

type LifecycleStatus =
  | "active"
  | "pending"
  | "rejected"
  | "on-hold";

type UIProduct = {
  id: string;
  vendorId: string;
  businessName: string;
  status: LifecycleStatus;
  shopifyProductURL: string | null;
  vendor?: {
    basic?: {
      subCategoryName?: string;
    };
  };
  basic: {
    productName: string;
    category: string;
    description: string;
  };
  pricing: {
    selectedPlan: string;
    price: number;
  };
};

const PAGE_SIZE = 25;

const ActiveProducts = () => {
  const [products, setProducts] = useState<UIProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusDraft, setStatusDraft] = useState<Record<string, LifecycleStatus>>(
    {}
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<LifecycleStatus | "">("");
  const [page, setPage] = useState(1);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const filteredProducts = filterProductsByQuery(products, searchQuery);
  const totalCount = filteredProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const paginatedProducts = filteredProducts.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );
  const areAllVisibleSelected =
    paginatedProducts.length > 0 &&
    paginatedProducts.every((product) => selectedIds.has(product.id));
  const startItem = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, totalCount);

  const toggleRowSelection = (productId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(productId) ? next.delete(productId) : next.add(productId);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    const visibleIds = paginatedProducts.map((product) => product.id);

    setSelectedIds((prev) => {
      const next = new Set(prev);

      if (areAllVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }

      return next;
    });
  };

  const fetchActiveProducts = async () => {
    setLoading(true);

    try {
      const res = await fetch("http://localhost:5000/api/products/active?all=true");
      const result = await res.json();

      if (result.success) {
        const uiProducts: UIProduct[] = result.data.map((product: UIProduct) => ({
          id: product.id,
          vendorId: product.vendorId,
          businessName: product.businessName,
          status: product.status,
          shopifyProductURL: product.shopifyProductURL,
          vendor: {
            basic: {
              subCategoryName: product.vendor?.basic?.subCategoryName,
            },
          },
          basic: {
            productName: product.basic.productName,
            category: product.basic.category,
            description: product.basic.description,
          },
          pricing: {
            selectedPlan: product.pricing.selectedPlan,
            price: product.pricing.price,
          },
        }));

        setProducts(uiProducts);
      }

      setSelectedIds(new Set());
      setBulkStatus("");
    } catch (err) {
      console.error("Failed to fetch active products", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePageClick = (pageNumber: number) => {
    if (pageNumber === page || pageNumber < 1 || pageNumber > totalPages) {
      return;
    }

    setSelectedIds(new Set());
    setPage(pageNumber);
  };

  const {
    isUpdating,
    successMessage,
    setSuccessMessage,
    updateStatus,
    updateStatusBulk,
  } = useProductStatusUpdate({
    onSuccess: fetchActiveProducts,
  });

  useEffect(() => {
    fetchActiveProducts();
  }, []);

  useEffect(() => {
    const initialDraft: Record<string, LifecycleStatus> = {};

    products.forEach((product) => {
      initialDraft[product.id] = product.status;
    });

    setStatusDraft(initialDraft);
  }, [products]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    const visibleIds = new Set(
      filterProductsByQuery(products, searchQuery)
        .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
        .map((product) => product.id)
    );

    setSelectedIds((prev) => {
      const nextIds = Array.from(prev).filter((id) => visibleIds.has(id));

      return nextIds.length === prev.size ? prev : new Set(nextIds);
    });
  }, [page, products, searchQuery]);

  if (loading) {
    return <div>Loading active products...</div>;
  }

  return (
    <div className="space-y-6">
      <ComponentCard title="Active Products">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <ProductSearchBar
            id="active-products-search"
            value={searchQuery}
            onChange={setSearchQuery}
          />

          {selectedIds.size > 1 && (
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={bulkStatus}
                onChange={(event) =>
                  setBulkStatus(event.target.value as LifecycleStatus | "")
                }
                className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm"
              >
                <option value="">Select status</option>
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="rejected">Rejected</option>
                <option value="on-hold">On Hold</option>
              </select>

              <button
                disabled={!bulkStatus || isUpdating}
                onClick={() => {
                  if (!bulkStatus) {
                    return;
                  }

                  updateStatusBulk(Array.from(selectedIds), bulkStatus);
                }}
                className="rounded-md bg-blue-600 px-4 py-1 text-sm text-white disabled:opacity-50"
              >
                Bulk Confirm
              </button>
            </div>
          )}
        </div>

        {searchQuery && (
          <p className="text-sm text-gray-500">
            {totalCount} matching product{totalCount === 1 ? "" : "s"} found.
          </p>
        )}

        {filteredProducts.length === 0 ? (
          <p className="text-sm text-gray-500">
            {searchQuery
              ? "No active products match your search."
              : "No active products found."}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
            <div className="max-w-full overflow-x-auto">
              <Table>
                <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                  <TableRow>
                    <TableCell isHeader className="px-5 py-3">
                      <input
                        type="checkbox"
                        checked={areAllVisibleSelected}
                        onChange={toggleSelectAllVisible}
                      />
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Product
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Vendor
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Plan
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Price
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Status / Action
                    </TableCell>
                  </TableRow>
                </TableHeader>

                <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {paginatedProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="px-5 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(product.id)}
                          onChange={() => toggleRowSelection(product.id)}
                        />
                      </TableCell>
                      <TableCell className="px-5 py-4 text-start">
                        <span className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                          {product.basic.productName}
                        </span>
                        <span className="block text-theme-xs text-gray-500 dark:text-gray-400">
                          {product.vendor?.basic?.subCategoryName ?? "-"}
                        </span>
                      </TableCell>

                      <TableCell className="px-4 py-3 text-theme-sm text-gray-500 dark:text-gray-400">
                        {product.vendorId}
                      </TableCell>

                      <TableCell className="px-4 py-3 text-theme-sm text-gray-500 dark:text-gray-400">
                        {product.pricing.selectedPlan}
                      </TableCell>

                      <TableCell className="px-4 py-3 text-theme-sm text-gray-500 dark:text-gray-400">
                        Rs. {product.pricing.price}
                      </TableCell>

                      <TableCell className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Badge
                            size="sm"
                            color={
                              product.status === "active"
                                ? "success"
                                : product.status === "pending"
                                  ? "warning"
                                  : product.status === "on-hold"
                                    ? "info"
                                    : "error"
                            }
                          >
                            {product.status.replace("-", " ")}
                          </Badge>

                          <select
                            value={statusDraft[product.id] ?? product.status}
                            onChange={(event) =>
                              setStatusDraft({
                                ...statusDraft,
                                [product.id]: event.target.value as LifecycleStatus,
                              })
                            }
                            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-theme-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                          >
                            <option value="active">Active</option>
                            <option value="pending">Pending</option>
                            <option value="rejected">Rejected</option>
                            <option value="on-hold">On Hold</option>
                          </select>

                          <button
                            disabled={
                              isUpdating ||
                              statusDraft[product.id] === undefined ||
                              statusDraft[product.id] === product.status
                            }
                            onClick={() =>
                              updateStatus(product.id, statusDraft[product.id])
                            }
                            className="rounded-md bg-blue-600 px-3 py-1 text-theme-xs text-white disabled:opacity-50"
                          >
                            Confirm
                          </button>

                          <button
                            type="button"
                            onClick={() => setSelectedProductId(product.id)}
                            className="rounded-md border border-gray-300 px-3 py-1 text-theme-xs text-gray-700 dark:border-gray-700 dark:text-white"
                          >
                            View
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {filteredProducts.length > 0 && (
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

              {page + 2 < totalPages && (
                <span className="px-1 text-sm">...</span>
              )}

              <button
                disabled={page === totalPages}
                onClick={() => handlePageClick(page + 1)}
                className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </ComponentCard>

      <StatusPopups
        isUpdating={isUpdating}
        successMessage={successMessage}
        onCloseSuccess={() => setSuccessMessage(null)}
      />

      <ProductDetailsModal
        isOpen={selectedProductId !== null}
        productId={selectedProductId}
        onClose={() => setSelectedProductId(null)}
        onUpdated={fetchActiveProducts}
      />
    </div>
  );
};

export default ActiveProducts;
