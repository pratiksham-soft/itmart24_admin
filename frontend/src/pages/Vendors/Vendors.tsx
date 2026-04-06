import { useEffect, useMemo, useState } from "react";
import ComponentCard from "../../components/common/ComponentCard";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import ProductSearchBar from "../Products/ProductSearchBar";
import VendorDetailsModal from "./VendorDetailsModal";

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

const Vendors = () => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);

  const fetchVendors = async () => {
    setLoading(true);

    try {
      const response = await fetch("http://localhost:5000/api/vendors");
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
    </div>
  );
};

export default Vendors;
