import { type FormEvent, useEffect, useMemo, useState } from "react";
import PageMeta from "../../components/common/PageMeta";
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
import { API_BASE_URL } from "../../config/api";

type PortalUser = {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  country: string | null;
  companyName: string | null;
  jobRole: string | null;
  avatarUrl: string | null;
  publicReviewDisplayName: string | null;
  emailVerified: boolean;
  role: string;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  savedProductsCount: number;
  savedComparisonsCount: number;
  productsInUseCount: number;
  reviewsCount: number;
  supportTicketsCount: number;
};

const PAGE_SIZE = 25;
const inputClassName =
  "w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getInitials = (user: PortalUser) => {
  const source = (user.fullName || user.email || "User").trim();
  const segments = source.split(/\s+/).filter(Boolean).slice(0, 2);
  if (segments.length === 0) {
    return "U";
  }

  return segments.map((segment) => segment.charAt(0).toUpperCase()).join("");
};

const getStatusClasses = (status: string) => {
  const normalized = status.trim().toLowerCase();

  if (normalized === "active") {
    return "border-success-200 bg-success-50 text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300";
  }

  if (normalized === "inactive") {
    return "border-gray-200 bg-gray-100 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300";
  }

  return "border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-500/20 dark:bg-warning-500/10 dark:text-warning-300";
};

const SummaryCard = ({
  title,
  value,
  caption,
  accentClassName,
}: {
  title: string;
  value: string;
  caption: string;
  accentClassName: string;
}) => (
  <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
    <div
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${accentClassName}`}
    >
      {title}
    </div>
    <div className="mt-4 text-3xl font-semibold text-gray-900 dark:text-white">
      {value}
    </div>
    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{caption}</p>
  </div>
);

const DeleteUserModal = ({
  isOpen,
  user,
  confirmationName,
  error,
  isDeleting,
  onConfirmationNameChange,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  user: PortalUser | null;
  confirmationName: string;
  error: string | null;
  isDeleting: boolean;
  onConfirmationNameChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) => {
  const confirmationTarget =
    user?.fullName?.trim() || user?.email?.trim() || user?.id || "";
  const isMatch =
    Boolean(confirmationTarget) && confirmationName === confirmationTarget;

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
            Delete Registered User
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            This removes the member account permanently from the user portal.
            Type the exact user name below to unlock delete.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6 px-6 py-6 sm:px-8">
        <div className="rounded-3xl border border-error-200 bg-error-50/70 p-5 dark:border-error-500/20 dark:bg-error-500/10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-error-600 dark:text-error-300">
            User To Delete
          </p>
          <h4 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
            {user?.fullName || "Unnamed User"}
          </h4>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Email: {user?.email ?? "-"}
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            ID: {user?.id ?? "-"}
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
            htmlFor="user-delete-confirmation"
            className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Confirm User Name
          </label>
          <input
            id="user-delete-confirmation"
            type="text"
            value={confirmationName}
            onChange={(event) => onConfirmationNameChange(event.target.value)}
            placeholder="Type the exact user name"
            className={inputClassName}
            autoFocus
          />
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Deletion stays disabled until the value matches exactly, including
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
            {isDeleting ? "Deleting..." : "Delete User"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const UserDetailsModal = ({
  user,
  onClose,
}: {
  user: PortalUser | null;
  onClose: () => void;
}) => {
  if (!user) {
    return null;
  }

  const activityItems = [
    { label: "Saved Products", value: user.savedProductsCount },
    { label: "Comparisons", value: user.savedComparisonsCount },
    { label: "Products In Use", value: user.productsInUseCount },
    { label: "Reviews", value: user.reviewsCount },
    { label: "Support Tickets", value: user.supportTicketsCount },
  ];

  return (
    <Modal
      isOpen={Boolean(user)}
      onClose={onClose}
      className="mx-4 w-full max-w-4xl overflow-hidden rounded-3xl"
    >
      <div className="border-b border-sky-100 bg-gradient-to-r from-sky-50 via-cyan-50 to-white px-6 py-6 dark:border-sky-500/10 dark:from-sky-500/10 dark:via-cyan-500/5 dark:to-gray-900 sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.fullName || user.email}
                className="h-16 w-16 rounded-2xl border border-white/60 object-cover shadow-sm"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-600 text-lg font-semibold text-white shadow-sm">
                {getInitials(user)}
              </div>
            )}

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
                Portal Member
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                {user.fullName || "Unnamed User"}
              </h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                {user.email}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClasses(user.status)}`}
            >
              {user.status || "Unknown"}
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                user.emailVerified
                  ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300"
                  : "border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-500/20 dark:bg-warning-500/10 dark:text-warning-300"
              }`}
            >
              {user.emailVerified ? "Email Verified" : "Verification Pending"}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-6 px-6 py-6 sm:px-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {activityItems.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-800 dark:bg-gray-900/50"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                {item.label}
              </p>
              <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                {item.value}
              </p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900/30">
            <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
              Profile
            </h4>
            <div className="mt-4 space-y-3 text-sm text-gray-600 dark:text-gray-300">
              <div>
                <span className="font-medium text-gray-900 dark:text-white">
                  Full name:
                </span>{" "}
                {user.fullName || "-"}
              </div>
              <div>
                <span className="font-medium text-gray-900 dark:text-white">
                  Role:
                </span>{" "}
                {user.role || "-"}
              </div>
              <div>
                <span className="font-medium text-gray-900 dark:text-white">
                  Public review name:
                </span>{" "}
                {user.publicReviewDisplayName || "-"}
              </div>
              <div>
                <span className="font-medium text-gray-900 dark:text-white">
                  Phone:
                </span>{" "}
                {user.phone || "-"}
              </div>
              <div>
                <span className="font-medium text-gray-900 dark:text-white">
                  Country:
                </span>{" "}
                {user.country || "-"}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900/30">
            <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
              Work Context
            </h4>
            <div className="mt-4 space-y-3 text-sm text-gray-600 dark:text-gray-300">
              <div>
                <span className="font-medium text-gray-900 dark:text-white">
                  Company:
                </span>{" "}
                {user.companyName || "-"}
              </div>
              <div>
                <span className="font-medium text-gray-900 dark:text-white">
                  Job role:
                </span>{" "}
                {user.jobRole || "-"}
              </div>
              <div>
                <span className="font-medium text-gray-900 dark:text-white">
                  Joined:
                </span>{" "}
                {formatDateTime(user.createdAt)}
              </div>
              <div>
                <span className="font-medium text-gray-900 dark:text-white">
                  Last updated:
                </span>{" "}
                {formatDateTime(user.updatedAt)}
              </div>
              <div>
                <span className="font-medium text-gray-900 dark:text-white">
                  User ID:
                </span>{" "}
                {user.id}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-gray-200 pt-5 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

const Users = () => {
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<PortalUser | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<PortalUser | null>(null);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/api/users`);
        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || "Failed to fetch registered users");
        }

        setUsers(Array.isArray(result.data) ? result.data : []);
      } catch (fetchError) {
        console.error("Failed to fetch registered users", fetchError);
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to fetch registered users"
        );
      } finally {
        setLoading(false);
      }
    };

    void fetchUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return users;
    }

    return users.filter((user) =>
      [
        user.fullName,
        user.email,
        user.phone,
        user.country,
        user.companyName,
        user.jobRole,
        user.publicReviewDisplayName,
        user.status,
        user.role,
        user.id,
      ]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(query))
    );
  }, [searchQuery, users]);

  const totalUsers = users.length;
  const activeUsers = users.filter(
    (user) => user.status.trim().toLowerCase() === "active"
  ).length;
  const verifiedUsers = users.filter((user) => user.emailVerified).length;
  const engagedUsers = users.filter(
    (user) =>
      user.savedProductsCount > 0 ||
      user.savedComparisonsCount > 0 ||
      user.productsInUseCount > 0 ||
      user.reviewsCount > 0 ||
      user.supportTicketsCount > 0
  ).length;

  const totalCount = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const paginatedUsers = filteredUsers.slice(
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

  const closeDeleteModal = () => {
    setIsDeleteOpen(false);
    setUserToDelete(null);
    setDeleteConfirmationName("");
    setDeleteError(null);
    setIsDeleting(false);
  };

  const handleDeleteUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!userToDelete) {
      setDeleteError("Select a user to delete.");
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    setDeleteSuccess(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/users/${userToDelete.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirmationName: deleteConfirmationName,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to delete registered user");
      }

      if (selectedUser?.id === userToDelete.id) {
        setSelectedUser(null);
      }

      setUsers((currentUsers) =>
        currentUsers.filter((user) => user.id !== userToDelete.id)
      );
      setDeleteSuccess(
        `User "${userToDelete.fullName || userToDelete.email}" was deleted successfully.`
      );
      closeDeleteModal();
    } catch (submitError) {
      console.error("Failed to delete registered user", submitError);
      setDeleteError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to delete registered user"
      );
      setIsDeleting(false);
    }
  };

  if (loading) {
    return <div>Loading registered users...</div>;
  }

  return (
    <>
      <PageMeta
        title="Users | ITMart24 Admin"
        description="Browse registered user_portal members and their buyer activity."
      />

      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Registered Members"
            value={String(totalUsers)}
            caption="All accounts currently available from the user_portal database."
            accentClassName="bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"
          />
          <SummaryCard
            title="Active Accounts"
            value={String(activeUsers)}
            caption="Profiles marked active and currently part of the live member base."
            accentClassName="bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
          />
          <SummaryCard
            title="Verified Emails"
            value={String(verifiedUsers)}
            caption="Members who have completed email verification in the portal."
            accentClassName="bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300"
          />
          <SummaryCard
            title="Engaged Users"
            value={String(engagedUsers)}
            caption="Members with saved research, product usage, reviews, or support activity."
            accentClassName="bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
          />
        </div>

        <ComponentCard
          title="Registered Users"
          desc="Buyer and member accounts synced from the user_portal PostgreSQL users table."
        >
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <ProductSearchBar
              id="users-search"
              label="Search registered users"
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search by member name, email, company, role, country, status, or ID"
            />
            <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300">
              Buyer workspace members, not vendor profiles.
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300">
              {error}
            </div>
          ) : null}

          {deleteSuccess ? (
            <div className="rounded-2xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300">
              {deleteSuccess}
            </div>
          ) : null}

          {searchQuery ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {totalCount} matching user{totalCount === 1 ? "" : "s"} found.
            </p>
          ) : null}

          {filteredUsers.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {searchQuery
                ? "No registered users match your search."
                : "No registered users found."}
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
              <div className="max-w-full overflow-x-auto">
                <Table>
                  <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                    <TableRow>
                      <TableCell
                        isHeader
                        className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                      >
                        Member
                      </TableCell>
                      <TableCell
                        isHeader
                        className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                      >
                        Company / Role
                      </TableCell>
                      <TableCell
                        isHeader
                        className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                      >
                        Activity
                      </TableCell>
                      <TableCell
                        isHeader
                        className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                      >
                        Status
                      </TableCell>
                      <TableCell
                        isHeader
                        className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                      >
                        Action
                      </TableCell>
                    </TableRow>
                  </TableHeader>

                  <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                    {paginatedUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="px-5 py-4 text-start">
                          <div className="flex items-center gap-3">
                            {user.avatarUrl ? (
                              <img
                                src={user.avatarUrl}
                                alt={user.fullName || user.email}
                                className="h-11 w-11 rounded-2xl border border-gray-200 object-cover"
                              />
                            ) : (
                              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-600 text-sm font-semibold text-white">
                                {getInitials(user)}
                              </div>
                            )}

                            <div>
                              <span className="block text-theme-sm font-medium text-gray-800 dark:text-white/90">
                                {user.fullName || "Unnamed User"}
                              </span>
                              <span className="block text-theme-xs text-gray-500 dark:text-gray-400">
                                {user.email}
                              </span>
                              <span className="block text-theme-xs text-gray-400 dark:text-gray-500">
                                Joined {formatDateTime(user.createdAt)}
                              </span>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                          <div className="space-y-1">
                            <div className="font-medium text-gray-800 dark:text-white/90">
                              {user.companyName || "-"}
                            </div>
                            <div>{user.jobRole || "Role not set"}</div>
                            <div>{user.country || "Country not set"}</div>
                          </div>
                        </TableCell>

                        <TableCell className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                          <div className="space-y-1">
                            <div>
                              {user.savedProductsCount} saved ·{" "}
                              {user.savedComparisonsCount} comparisons
                            </div>
                            <div>
                              {user.productsInUseCount} in use ·{" "}
                              {user.reviewsCount} reviews
                            </div>
                            <div>{user.supportTicketsCount} support tickets</div>
                          </div>
                        </TableCell>

                        <TableCell className="px-5 py-4">
                          <div className="flex flex-col items-start gap-2">
                            <span
                              className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClasses(user.status)}`}
                            >
                              {user.status || "Unknown"}
                            </span>
                            <span
                              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                                user.emailVerified
                                  ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300"
                                  : "border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-500/20 dark:bg-warning-500/10 dark:text-warning-300"
                              }`}
                            >
                              {user.emailVerified ? "Verified" : "Pending"}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setSelectedUser(user)}
                              className="rounded-xl border border-sky-200 px-3 py-1.5 text-theme-xs font-medium text-sky-700 transition hover:bg-sky-50 dark:border-sky-500/20 dark:text-sky-300 dark:hover:bg-sky-500/10"
                            >
                              View Profile
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteSuccess(null);
                                setDeleteError(null);
                                setUserToDelete(user);
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

          {filteredUsers.length > 0 ? (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {startItem}-{endItem} / {totalCount}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() =>
                    setPage((currentPage) => Math.max(1, currentPage - 1))
                  }
                  className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
                >
                  Previous
                </button>

                {Array.from({ length: totalPages }, (_, index) => index + 1)
                  .slice(Math.max(0, page - 3), Math.min(totalPages, page + 2))
                  .map((pageNumber) => (
                    <button
                      key={pageNumber}
                      type="button"
                      onClick={() => setPage(pageNumber)}
                      className={`rounded-md px-3 py-1 text-sm ${
                        pageNumber === page ? "bg-sky-600 text-white" : "border"
                      }`}
                    >
                      {pageNumber}
                    </button>
                  ))}

                {page + 2 < totalPages ? (
                  <span className="px-1 text-sm">...</span>
                ) : null}

                <button
                  type="button"
                  disabled={page === totalPages}
                  onClick={() =>
                    setPage((currentPage) =>
                      Math.min(totalPages, currentPage + 1)
                    )
                  }
                  className="rounded-md bg-sky-600 px-3 py-1 text-sm text-white disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </ComponentCard>
      </div>

      <UserDetailsModal
        user={selectedUser}
        onClose={() => setSelectedUser(null)}
      />

      <DeleteUserModal
        isOpen={isDeleteOpen}
        user={userToDelete}
        confirmationName={deleteConfirmationName}
        error={deleteError}
        isDeleting={isDeleting}
        onConfirmationNameChange={setDeleteConfirmationName}
        onClose={closeDeleteModal}
        onSubmit={handleDeleteUser}
      />
    </>
  );
};

export default Users;
