import { type FormEvent, useEffect, useMemo, useState } from "react";
import ComponentCard from "../../components/common/ComponentCard";
import { Modal } from "../../components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import ProductSearchBar from "../Products/ProductSearchBar";
import VendorDetailsModal from "./VendorDetailsModal";
import { API_BASE_URL } from "../../config/api";

type Vendor = {
  id: string;
  businessName: string;
  businessType: string;
  country: string;
  website: string;
  address: string;
  agreement: boolean;
  contactEmail: string;
  contactName: string;
  contactPhone: string;
  email: string;
  phone: string;
  regNo: string;
  taxNumber: string;
  taxRegistered: string;
  onboardingStatus: string;
  logoUrl: string;
  createdAt: string | null;
  updatedAt: string | null;
};

const PAGE_SIZE = 25;
const inputClassName =
  "w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const DeleteVendorModal = ({
  isOpen,
  vendor,
  confirmationName,
  error,
  isDeleting,
  onConfirmationNameChange,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  vendor: Vendor | null;
  confirmationName: string;
  error: string | null;
  isDeleting: boolean;
  onConfirmationNameChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) => {
  const confirmationTarget = vendor?.businessName?.trim() || vendor?.id || "";
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
            Delete Vendor
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            This removes the vendor profile permanently. Type the exact vendor name below to unlock delete.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6 px-6 py-6 sm:px-8">
        <div className="rounded-3xl border border-error-200 bg-error-50/70 p-5 dark:border-error-500/20 dark:bg-error-500/10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-error-600 dark:text-error-300">
            Vendor To Delete
          </p>
          <h4 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
            {vendor?.businessName || "Unnamed Vendor"}
          </h4>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            ID: {vendor?.id ?? "-"}
          </p>
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
            Type exactly:
          </p>
          <div className="mt-3 inline-flex rounded-xl bg-white px-3 py-2 text-sm font-semibold text-error-700 shadow-sm dark:bg-gray-900 dark:text-error-300">
            {confirmationTarget || "-"}
          </div>
        </div>

        <div>
          <label
            htmlFor="vendor-delete-confirmation"
            className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Confirm Vendor Name
          </label>
          <input
            id="vendor-delete-confirmation"
            type="text"
            value={confirmationName}
            onChange={(event) => onConfirmationNameChange(event.target.value)}
            placeholder="Type the exact vendor name"
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
            {isDeleting ? "Deleting..." : "Delete Vendor"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const Vendors = () => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [vendorToDelete, setVendorToDelete] = useState<Vendor | null>(null);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchVendors = async () => {
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/vendors`);
      const result = await response.json();

      if (result.success) {
        setVendors(result.data);
      }
    } catch (error) {
      console.error("Failed to fetch vendors", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, []);

  const filteredVendors = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return vendors;
    }

    return vendors.filter((vendor) =>
      [
        vendor.businessName,
        vendor.contactName,
        vendor.contactEmail,
        vendor.email,
        vendor.phone,
        vendor.contactPhone,
        vendor.country,
        vendor.businessType,
        vendor.website,
        vendor.regNo,
        vendor.onboardingStatus,
      ].some((value) => value.toLowerCase().includes(query))
    );
  }, [searchQuery, vendors]);

  const totalCount = filteredVendors.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const paginatedVendors = filteredVendors.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );
  const startItem = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, totalCount);

  const handlePageClick = (pageNumber: number) => {
    if (pageNumber === page || pageNumber < 1 || pageNumber > totalPages) {
      return;
    }

    setPage(pageNumber);
  };

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const closeDeleteModal = () => {
    setIsDeleteOpen(false);
    setVendorToDelete(null);
    setDeleteConfirmationName("");
    setDeleteError(null);
    setIsDeleting(false);
  };

  const handleDeleteVendor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!vendorToDelete) {
      setDeleteError("Select a vendor to delete.");
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    setDeleteSuccess(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/vendors/${vendorToDelete.id}`,
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
        throw new Error(result.message || "Failed to delete vendor");
      }

      if (selectedVendorId === vendorToDelete.id) {
        setSelectedVendorId(null);
      }

      setVendors((currentVendors) =>
        currentVendors.filter((vendor) => vendor.id !== vendorToDelete.id)
      );
      setDeleteSuccess(
        `Vendor "${vendorToDelete.businessName || vendorToDelete.id}" was deleted successfully.`
      );
      closeDeleteModal();
    } catch (submitError) {
      console.error("Failed to delete vendor", submitError);
      setDeleteError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to delete vendor"
      );
      setIsDeleting(false);
    }
  };

  if (loading) {
    return <div>Loading vendors...</div>;
  }

  return (
    <div className="space-y-6">
      <ComponentCard
        title="Vendors"
        desc="All vendors from the Firestore vendor_profile collection."
      >
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <ProductSearchBar
            id="vendors-search"
            label="Search vendors"
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search by business, contact, email, phone, country, type, or ID"
          />
        </div>

        {deleteSuccess ? (
          <div className="rounded-2xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300">
            {deleteSuccess}
          </div>
        ) : null}

        {searchQuery && (
          <p className="text-sm text-gray-500">
            {totalCount} matching vendor{totalCount === 1 ? "" : "s"} found.
          </p>
        )}

        {filteredVendors.length === 0 ? (
          <p className="text-sm text-gray-500">
            {searchQuery
              ? "No vendors match your search."
              : "No vendors found."}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
            <div className="max-w-full overflow-x-auto">
              <Table>
                <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                  <TableRow>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Business
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Country
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Action
                    </TableCell>
                  </TableRow>
                </TableHeader>

                <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {paginatedVendors.map((vendor) => (
                    <TableRow key={vendor.id}>
                      <TableCell className="px-5 py-4 text-start">
                        <div className="flex items-center gap-3">
                          {vendor.logoUrl ? (
                            <img
                              src={vendor.logoUrl}
                              alt={vendor.businessName || "Vendor logo"}
                              className="h-10 w-10 rounded-lg border border-gray-200 object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-dashed border-gray-300 text-xs text-gray-400">
                              NA
                            </div>
                          )}

                          <div>
                            <span className="block font-medium text-gray-800 text-theme-sm dark:text-white/90">
                              {vendor.businessName || "-"}
                            </span>
                            <span className="block text-theme-xs text-gray-500 dark:text-gray-400">
                              {vendor.website || vendor.id}
                            </span>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                        {vendor.country || "-"}
                      </TableCell>

                      <TableCell className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setSelectedVendorId(vendor.id)}
                            className="rounded-md border border-gray-300 px-3 py-1 text-theme-xs text-gray-700 dark:border-gray-700 dark:text-white"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteSuccess(null);
                              setDeleteError(null);
                              setVendorToDelete(vendor);
                              setDeleteConfirmationName("");
                              setIsDeleteOpen(true);
                            }}
                            className="rounded-xl border border-error-200 px-3 py-1.5 text-theme-xs font-medium text-error-600 transition hover:bg-error-50 dark:border-error-500/20 dark:text-error-300 dark:hover:bg-error-500/10"
                          >
                            Delete
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

        {filteredVendors.length > 0 && (
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

      <VendorDetailsModal
        isOpen={selectedVendorId !== null}
        vendorId={selectedVendorId}
        onClose={() => setSelectedVendorId(null)}
        onUpdated={fetchVendors}
      />

      <DeleteVendorModal
        isOpen={isDeleteOpen}
        vendor={vendorToDelete}
        confirmationName={deleteConfirmationName}
        error={deleteError}
        isDeleting={isDeleting}
        onConfirmationNameChange={setDeleteConfirmationName}
        onClose={closeDeleteModal}
        onSubmit={handleDeleteVendor}
      />
    </div>
  );
};

export default Vendors;
