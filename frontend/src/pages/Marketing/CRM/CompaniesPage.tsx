import { useState } from "react";
import PageMeta from "../../../components/common/PageMeta";
import Badge from "../../../components/ui/badge/Badge";
import CompanyFormModal from "./components/CompanyFormModal";
import CRMEntityPage from "./components/CRMEntityPage";
import { createCompany, deleteCompany, getCompanies, updateCompany } from "./services/crmApi";
import type { BannerState, CRMCompany } from "./types/crm.types";
import { companyLabel, defaultCRMSettings, getStatusBadgeColor, readErrorMessage, toOptions } from "./utils/crmHelpers";

export default function CompaniesPage() {
  const [editing, setEditing] = useState<CRMCompany | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [banner, setBanner] = useState<BannerState>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const showBanner = (tone: "success" | "error" | "info", message: string) => {
    setBanner({ tone, message });
    window.setTimeout(() => setBanner(null), 3000);
  };

  return (
    <>
      <PageMeta title="CRM Companies | ITMart24 Admin" description="Manage companies, status, ownership, and account context." />
      <CRMEntityPage
        title="Companies"
        description="Track company records for vendors, partners, prospects, and customers with unified account context."
        actionLabel="Add Company"
        filters={[{ key: "status", label: "Status", options: toOptions(defaultCRMSettings.companyStatuses) }]}
        loadItems={getCompanies}
        deleteItem={deleteCompany}
        columns={[
          {
            key: "name",
            label: "Company",
            render: (item) => (
              <div>
                <div className="font-semibold text-gray-800 dark:text-white/90">{companyLabel(item as CRMCompany)}</div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{(item as CRMCompany).website || "No website"}</div>
              </div>
            ),
          },
          {
            key: "industry",
            label: "Industry",
            render: (item) => (
              <div>
                <div>{(item as CRMCompany).industry || "Not set"}</div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{(item as CRMCompany).companySize || "Size unknown"}</div>
              </div>
            ),
          },
          {
            key: "location",
            label: "Location",
            render: (item) => `${(item as CRMCompany).city || ""}${(item as CRMCompany).city && (item as CRMCompany).country ? ", " : ""}${(item as CRMCompany).country || "Not set"}`,
          },
          {
            key: "status",
            label: "Status",
            render: (item) => <Badge color={getStatusBadgeColor((item as CRMCompany).status)} size="sm">{(item as CRMCompany).status}</Badge>,
          },
        ]}
        rowKey={(item) => (item as CRMCompany).id}
        getItemId={(item) => (item as CRMCompany).id}
        getDeleteMessage={(item) => `Delete ${companyLabel(item as CRMCompany)} from the active CRM company list?`}
        formModal={
          <CompanyFormModal
            isOpen={isOpen}
            initialValue={editing}
            onClose={() => {
              setIsOpen(false);
              setEditing(null);
            }}
            onSubmit={async (payload) => {
              try {
                if (editing) {
                  await updateCompany(editing.id, payload);
                  showBanner("success", "Company updated successfully.");
                } else {
                  await createCompany(payload);
                  showBanner("success", "Company created successfully.");
                }
                setReloadKey((current) => current + 1);
              } catch (error) {
                throw new Error(readErrorMessage(error, "Failed to save company."));
              }
            }}
          />
        }
        onCreate={() => {
          setEditing(null);
          setIsOpen(true);
        }}
        onEdit={(item) => {
          setEditing(item as CRMCompany);
          setIsOpen(true);
        }}
        banner={banner}
        reloadKey={reloadKey}
      />
    </>
  );
}
