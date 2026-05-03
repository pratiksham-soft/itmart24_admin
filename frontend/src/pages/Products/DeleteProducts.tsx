import { type FormEvent, useState } from "react";
import Badge from "../../components/ui/badge/Badge";
import ComponentCard from "../../components/common/ComponentCard";
import { Modal } from "../../components/ui/modal";
import ProductSearchBar from "./ProductSearchBar";
import { usePaginatedStatusProducts } from "./usePaginatedStatusProducts";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../components/ui/table";

const inputClassName =
  "w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const DeleteProductModal = ({
  isOpen,
  product,
  confirmationName,
  error,
  isDeleting,
  onConfirmationNameChange,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  product: ReturnType<typeof usePaginatedStatusProducts>["products"][number] | null;
  confirmationName: string;
  error: string | null;
  isDeleting: boolean;
  onConfirmationNameChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) => {
  const confirmationTarget = product?.basic?.productName?.trim() || product?.id || "";
  const isMatch = Boolean(confirmationTarget) && confirmationName === confirmationTarget;

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
            Delete Product
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            This will permanently delete this product from ITMart24 and Shopify,
            including associated Shopify product media/files where possible.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6 px-6 py-6 sm:px-8">
        <div className="rounded-3xl border border-error-200 bg-error-50/70 p-5 dark:border-error-500/20 dark:bg-error-500/10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-error-600 dark:text-error-300">
            Product To Delete
          </p>
          <h4 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
            {product?.basic?.productName || "Unnamed Product"}
          </h4>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Vendor: {product?.businessName || "-"}
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Shopify Product ID: {product?.shopifyProductId ?? "-"}
          </p>
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
            Type exactly:
          </p>
          <div className="mt-3 inline-flex rounded-xl bg-white px-3 py-2 text-sm font-semibold text-error-700 shadow-sm dark:bg-gray-900 dark:text-error-300">
            {confirmationTarget || "-"}
          </div>
        </div>

        {product?.activeSubscription?.hasActiveSubscription ? (
          <div className="rounded-3xl border border-warning-300 bg-warning-50 p-5 text-warning-900 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-100">
            <p className="text-sm font-semibold uppercase tracking-[0.12em]">
              Warning
            </p>
            <p className="mt-3 text-sm font-medium">
              This product currently has an active subscription/plan associated with it.
            </p>
            <p className="mt-2 text-sm">
              Deleting this product may impact billing, vendor access, analytics,
              storefront visibility, integrations, or customer references.
            </p>
            {product.activeSubscription.activeSubscriptionMessage ? (
              <p className="mt-2 text-sm">
                {product.activeSubscription.activeSubscriptionMessage}
              </p>
            ) : null}
          </div>
        ) : null}

        <div>
          <label
            htmlFor="product-delete-confirmation"
            className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Confirm Product Name
          </label>
          <input
            id="product-delete-confirmation"
            type="text"
            value={confirmationName}
            onChange={(event) => onConfirmationNameChange(event.target.value)}
            placeholder="Type the exact product name"
            className={inputClassName}
            autoFocus
          />
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Deletion stays disabled until the value matches exactly, including capitalization and spaces.
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
            {isDeleting ? "Deleting..." : "Delete Product"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const statusBadgeColor = (status: string) => {
  if (status === "active") {
    return "success";
  }

  if (status === "pending") {
    return "warning";
  }

  if (status === "on-hold") {
    return "info";
  }

  if (status === "draft") {
    return "info";
  }

  return "error";
};

const DeleteProducts = () => {
  const {
    products,
    loading,
    isRefreshing,
    isPageLoading,
    error,
    searchQuery,
    setSearchQuery,
    page,
    totalCount,
    totalPages,
    startItem,
    endItem,
    handlePageClick,
    refetchProducts,
  } = usePaginatedStatusProducts({
    endpoint: "http://localhost:5000/api/products/delete-list",
  });
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [productToDelete, setProductToDelete] =
    useState<(typeof products)[number] | null>(null);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const openDeleteModal = (product: (typeof products)[number]) => {
    setProductToDelete(product);
    setDeleteConfirmationName("");
    setDeleteError(null);
    setIsDeleteOpen(true);
  };

  const closeDeleteModal = () => {
    setIsDeleteOpen(false);
    setProductToDelete(null);
    setDeleteConfirmationName("");
    setDeleteError(null);
    setIsDeleting(false);
  };

  const handleDeleteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!productToDelete) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    setDeleteSuccess(null);
    setDeleteWarning(null);

    try {
      const response = await fetch(
        `http://localhost:5000/api/products/${productToDelete.id}`,
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
        throw new Error(result.message || "Failed to delete product");
      }

      const warnings = Array.isArray(result.data?.warnings)
        ? result.data.warnings.filter(Boolean)
        : [];
      const warningMessage =
        warnings.length > 0 ? warnings.join(" ") : null;

      setDeleteSuccess(
        result.message || `Product "${productToDelete.basic.productName}" deleted successfully.`
      );
      setDeleteWarning(warningMessage);
      closeDeleteModal();
      await refetchProducts();
    } catch (submitError) {
      console.error("Failed to delete product", submitError);
      setDeleteError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to delete product"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400">
        Loading products available for deletion...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ComponentCard title="Delete Products">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <ProductSearchBar
            id="delete-products-search"
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search by product, vendor, category, Shopify status, handle, or ID"
          />
        </div>

        {deleteSuccess ? (
          <div className="mt-4 rounded-2xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300">
            {deleteSuccess}
          </div>
        ) : null}

        {deleteWarning ? (
          <div className="mt-4 rounded-2xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800 dark:border-warning-500/20 dark:bg-warning-500/10 dark:text-warning-200">
            {deleteWarning}
          </div>
        ) : null}

        {isRefreshing ? (
          <p className="text-sm text-gray-500">
            Loading page {page} of products...
          </p>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {searchQuery ? (
          <p className="text-sm text-gray-500">
            {totalCount} matching product{totalCount === 1 ? "" : "s"} found.
          </p>
        ) : null}

        {!error && products.length === 0 ? (
          <p className="text-sm text-gray-500">
            {searchQuery
              ? "No products match your search."
              : "No products available for deletion."}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
            <div className="max-w-full overflow-x-auto">
              <Table>
                <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                  <TableRow>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Product
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Vendor
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Category
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Local Status
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Shopify
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Subscription
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Action
                    </TableCell>
                  </TableRow>
                </TableHeader>

                <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="px-5 py-4 text-start">
                        <span className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                          {product.basic.productName}
                        </span>
                        <span className="block text-theme-xs text-gray-500 dark:text-gray-400">
                          Product ID: {product.id}
                        </span>
                      </TableCell>

                      <TableCell className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                        <div>{product.businessName || "-"}</div>
                        <div className="text-theme-xs text-gray-400 dark:text-gray-500">
                          Vendor ID: {product.vendorId || "-"}
                        </div>
                      </TableCell>

                      <TableCell className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                        {product.basic.category || "-"}
                      </TableCell>

                      <TableCell className="px-5 py-4">
                        <Badge size="sm" color={statusBadgeColor(product.status)}>
                          {product.status.replace("-", " ")}
                        </Badge>
                      </TableCell>

                      <TableCell className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                        <Badge
                          size="sm"
                          color={statusBadgeColor(product.shopifyStatus || "missing")}
                        >
                          {(product.shopifyStatus || "missing").replace("-", " ")}
                        </Badge>
                        <div className="mt-2 text-theme-xs text-gray-500 dark:text-gray-400">
                          ID: {product.shopifyProductId ?? "-"}
                        </div>
                        <div className="text-theme-xs text-gray-500 dark:text-gray-400">
                          Handle: {product.shopifyHandle || "-"}
                        </div>
                        {product.shopifyProductURL ? (
                          <a
                            href={product.shopifyProductURL}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-block text-theme-xs font-medium text-brand-500 hover:text-brand-600"
                          >
                            Open storefront
                          </a>
                        ) : null}
                      </TableCell>

                      <TableCell className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                        {product.activeSubscription?.hasActiveSubscription ? (
                          <div className="rounded-2xl border border-warning-200 bg-warning-50 px-3 py-2 text-warning-900 dark:border-warning-500/20 dark:bg-warning-500/10 dark:text-warning-100">
                            <div className="font-medium">Active</div>
                            <div className="mt-1 text-theme-xs">
                              {product.activeSubscription.activeSubscriptionMessage ||
                                `${product.activeSubscription.activeSubscriptionCount} active subscription(s)`}
                            </div>
                          </div>
                        ) : (
                          <span>No active subscription</span>
                        )}
                      </TableCell>

                      <TableCell className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => openDeleteModal(product)}
                          className="rounded-2xl bg-error-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-error-600"
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
        )}

        {!error && products.length > 0 ? (
          <div
            className={`mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${
              isPageLoading ? "cursor-progress" : ""
            }`}
          >
            <span className="text-sm text-gray-500">
              {startItem}-{endItem} / {totalCount}
            </span>

            <div className="flex items-center gap-2">
              <button
                disabled={page === 1 || isPageLoading}
                onClick={() => handlePageClick(page - 1)}
                className="rounded-md border px-3 py-1 text-sm disabled:cursor-progress disabled:opacity-50"
              >
                Previous
              </button>

              {Array.from({ length: totalPages }, (_, index) => index + 1)
                .slice(Math.max(0, page - 3), Math.min(totalPages, page + 2))
                .map((pageNumber) => (
                  <button
                    key={pageNumber}
                    disabled={isPageLoading}
                    onClick={() => handlePageClick(pageNumber)}
                    className={`rounded-md px-3 py-1 text-sm disabled:cursor-progress disabled:opacity-50 ${
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
                disabled={page === totalPages || isPageLoading}
                onClick={() => handlePageClick(page + 1)}
                className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white disabled:cursor-progress disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </ComponentCard>

      <DeleteProductModal
        isOpen={isDeleteOpen}
        product={productToDelete}
        confirmationName={deleteConfirmationName}
        error={deleteError}
        isDeleting={isDeleting}
        onConfirmationNameChange={setDeleteConfirmationName}
        onClose={closeDeleteModal}
        onSubmit={handleDeleteSubmit}
      />
    </div>
  );
};

export default DeleteProducts;
