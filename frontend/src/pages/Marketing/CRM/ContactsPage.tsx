import { useState } from "react";
import PageMeta from "../../../components/common/PageMeta";
import Badge from "../../../components/ui/badge/Badge";
import ContactFormModal from "./components/ContactFormModal";
import CRMEntityPage from "./components/CRMEntityPage";
import { createContact, deleteContact, getContacts, updateContact } from "./services/crmApi";
import type { BannerState, CRMContact } from "./types/crm.types";
import { defaultCRMSettings, formatDateTime, fullContactName, getStatusBadgeColor, readErrorMessage, toOptions } from "./utils/crmHelpers";

export default function ContactsPage() {
  const [editing, setEditing] = useState<CRMContact | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [banner, setBanner] = useState<BannerState>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const showBanner = (tone: "success" | "error" | "info", message: string) => {
    setBanner({ tone, message });
    window.setTimeout(() => setBanner(null), 3000);
  };

  return (
    <>
      <PageMeta title="CRM Contacts | ITMart24 Admin" description="Manage CRM contacts and company relationships." />
      <CRMEntityPage
        title="Contacts"
        description="Manage vendor, partner, customer, and prospect contacts with lifecycle stage and follow-up context."
        actionLabel="Add Contact"
        filters={[
          { key: "status", label: "Lifecycle", options: toOptions(defaultCRMSettings.lifecycleStages) },
        ]}
        loadItems={getContacts}
        deleteItem={deleteContact}
        columns={[
          {
            key: "name",
            label: "Contact",
            render: (item) => (
              <div>
                <div className="font-semibold text-gray-800 dark:text-white/90">{fullContactName(item as CRMContact)}</div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{(item as CRMContact).email || "No email"}</div>
              </div>
            ),
          },
          {
            key: "company",
            label: "Company",
            render: (item) => (
              <div>
                <div>{(item as CRMContact).companyName || "Unlinked"}</div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{(item as CRMContact).jobTitle || "No title"}</div>
              </div>
            ),
          },
          {
            key: "type",
            label: "Type",
            render: (item) => <Badge color={getStatusBadgeColor((item as CRMContact).contactType)} size="sm">{(item as CRMContact).contactType}</Badge>,
          },
          {
            key: "stage",
            label: "Lifecycle",
            render: (item) => <Badge color={getStatusBadgeColor((item as CRMContact).lifecycleStage)} size="sm">{(item as CRMContact).lifecycleStage}</Badge>,
          },
          {
            key: "followUp",
            label: "Next Follow-up",
            render: (item) => formatDateTime((item as CRMContact).nextFollowUpAt),
          },
        ]}
        rowKey={(item) => (item as CRMContact).id}
        getItemId={(item) => (item as CRMContact).id}
        getDeleteMessage={(item) => `Delete ${fullContactName(item as CRMContact)} from the CRM contact list?`}
        formModal={
          <ContactFormModal
            isOpen={isOpen}
            initialValue={editing}
            onClose={() => {
              setIsOpen(false);
              setEditing(null);
            }}
            onSubmit={async (payload) => {
              try {
                if (editing) {
                  await updateContact(editing.id, payload);
                  showBanner("success", "Contact updated successfully.");
                } else {
                  await createContact(payload);
                  showBanner("success", "Contact created successfully.");
                }
                setReloadKey((current) => current + 1);
              } catch (error) {
                throw new Error(readErrorMessage(error, "Failed to save contact."));
              }
            }}
          />
        }
        onCreate={() => {
          setEditing(null);
          setIsOpen(true);
        }}
        onEdit={(item) => {
          setEditing(item as CRMContact);
          setIsOpen(true);
        }}
        banner={banner}
        reloadKey={reloadKey}
      />
    </>
  );
}
