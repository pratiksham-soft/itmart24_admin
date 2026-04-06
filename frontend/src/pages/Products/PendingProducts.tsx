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

type Product = {
  id: string;
  vendorId: string;
  businessName: string;
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
    price: number;
    selectedPlan: string;
  };
  status: string;
};

type LifecycleStatus = "pending" | "active" | "rejected" | "on-hold";

const PendingProducts = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusDraft, setStatusDraft] = useState<Record<string, LifecycleStatus>>(
    {}
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<LifecycleStatus | "">("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const filteredProducts = filterProductsByQuery(products, searchQuery);
  const areAllVisibleSelected =
    filteredProducts.length > 0 &&
    filteredProducts.every((product) => selectedIds.has(product.id));

  const toggleRowSelection = (productId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(productId) ? next.delete(productId) : next.add(productId);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    const visibleIds = filteredProducts.map((product) => product.id);

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

  const fetchPendingProducts = async () => {
    setLoading(true);

    try {
      const response = await fetch("http://localhost:5000/api/products/pending");
      const result = await response.json();

      if (result.success) {
        setProducts(result.data);
      }

      setSelectedIds(new Set());
      setBulkStatus("");
    } catch (error) {
      console.error("Failed to load pending products", error);
    } finally {
      setLoading(false);
    }
  };

  const {
    isUpdating,
    successMessage,
    setSuccessMessage,
    updateStatus,
    updateStatusBulk,
  } = useProductStatusUpdate({
    onSuccess: fetchPendingProducts,
  });

  useEffect(() => {
    fetchPendingProducts();
  }, []);

  useEffect(() => {
    const initialDraft: Record<string, LifecycleStatus> = {};

    products.forEach((product) => {
      initialDraft[product.id] = product.status as LifecycleStatus;
    });

    setStatusDraft(initialDraft);
  }, [products]);

  useEffect(() => {
    const visibleIds = new Set(
      filterProductsByQuery(products, searchQuery).map((product) => product.id)
    );

    setSelectedIds((prev) => {
      const nextIds = Array.from(prev).filter((id) => visibleIds.has(id));

      return nextIds.length === prev.size ? prev : new Set(nextIds);
    });
  }, [products, searchQuery]);

  if (loading) {
    return <div className="text-sm text-gray-500">Loading pending products...</div>;
  }

  return (
    <div className="space-y-6">
      <ComponentCard title="Pending Products">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <ProductSearchBar
            id="pending-products-search"
            value={searchQuery}
            onChange={setSearchQuery}
          />

          {selectedIds.size > 1 && (
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={bulkStatus}
                onChange={(event) =>
                  setBulkStatus(event.target.value as LifecycleStatus)
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
            {filteredProducts.length} matching product
            {filteredProducts.length === 1 ? "" : "s"} found.
          </p>
        )}

        {filteredProducts.length === 0 ? (
          <p className="text-sm text-gray-500">
            {searchQuery
              ? "No pending products match your search."
              : "No pending products found."}
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
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="px-5 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(product.id)}
                          onChange={() => toggleRowSelection(product.id)}
                        />
                      </TableCell>
                      <TableCell className="px-5 py-4 text-start">
                        <div>
                          <span className="block font-medium text-gray-800 text-theme-sm dark:text-white/90">
                            {product.basic.productName}
                          </span>
                          <span className="block text-theme-xs text-gray-500 dark:text-gray-400">
                            {product.vendor?.basic?.subCategoryName ?? "-"}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell className="px-4 py-3 text-theme-sm text-gray-500 dark:text-gray-400">
                        {product.businessName}
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
                            {product.status}
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
                            <option value="pending">Pending</option>
                            <option value="active">Active</option>
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
      />
    </div>
  );
};

export default PendingProducts;
