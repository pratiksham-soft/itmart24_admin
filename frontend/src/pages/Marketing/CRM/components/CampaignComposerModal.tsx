import { useEffect, useMemo, useState } from "react";
import InputField from "../../../../components/form/input/InputField";
import TextArea from "../../../../components/form/input/TextArea";
import Button from "../../../../components/ui/button/Button";
import Badge from "../../../../components/ui/badge/Badge";
import { Modal } from "../../../../components/ui/modal";
import { fetchEmailAccounts, type EmailAccount } from "../../../../services/emailManager.service";
import {
  createCampaign,
  getCampaignRecipients,
  getLeadEmailRecipients,
  updateCampaign,
} from "../services/crmApi";
import type {
  CRMCampaign,
  CRMCampaignRecipient,
  CRMLeadEmailRecipient,
} from "../types/crm.types";
import {
  fullLeadName,
  getPriorityBadgeColor,
  getStatusBadgeColor,
  readErrorMessage,
} from "../utils/crmHelpers";

type CampaignComposerModalProps = {
  isOpen: boolean;
  initialCampaign: CRMCampaign | null;
  onClose: () => void;
  onSaved: (campaign: CRMCampaign) => void;
};

type CampaignFormState = {
  name: string;
  senderAccountId: string;
  subject: string;
  body: string;
  bodyMode: "html" | "text";
  delaySeconds: number;
};

const selectClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const tokenOptions = [
  "{{firstName}}",
  "{{lastName}}",
  "{{companyName}}",
  "{{jobTitle}}",
  "{{website}}",
  "{{email}}",
];

const htmlSnippets = [
  { label: "Bold", value: "<strong>Bold text</strong>" },
  { label: "Italic", value: "<em>Italic text</em>" },
  { label: "Underline", value: "<u>Underlined text</u>" },
  { label: "Heading", value: "<h2>Section heading</h2>" },
  { label: "Bullet List", value: "<ul><li>First point</li><li>Second point</li></ul>" },
  { label: "Numbered List", value: "<ol><li>First step</li><li>Second step</li></ol>" },
  { label: "Link", value: '<a href="https://example.com" target="_blank" rel="noopener noreferrer">Add link</a>' },
  { label: "Center", value: '<p style="text-align:center;">Centered text</p>' },
];

const defaultFormState = (accounts: EmailAccount[], campaign?: CRMCampaign | null): CampaignFormState => ({
  name: campaign?.name ?? "",
  senderAccountId: String(
    campaign?.senderAccountId ?? accounts.find((account) => account.isDefault)?.id ?? accounts[0]?.id ?? ""
  ),
  subject: campaign?.subject ?? "",
  body:
    campaign?.body ??
    "<p>Hello {{firstName}},</p><p>We would love to connect with {{companyName}} about ITMart24 opportunities.</p>",
  bodyMode: campaign?.bodyMode ?? "html",
  delaySeconds: campaign?.delaySeconds ?? 10,
});

const renderTemplate = (template: string, recipient: Partial<CRMLeadEmailRecipient>) =>
  [
    ["{{firstName}}", recipient.firstName ?? ""],
    ["{{lastName}}", recipient.lastName ?? ""],
    ["{{companyName}}", recipient.companyName ?? ""],
    ["{{jobTitle}}", recipient.jobTitle ?? ""],
    ["{{website}}", recipient.website ?? ""],
    ["{{email}}", recipient.email ?? ""],
  ].reduce((content, [token, value]) => content.split(token).join(value), template);

const formatDuration = (recipientCount: number, delaySeconds: number) => {
  const totalSeconds = recipientCount * delaySeconds;
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
};

const mapRecipientToLead = (recipient: CRMCampaignRecipient): CRMLeadEmailRecipient => ({
  id: recipient.leadId ?? recipient.id,
  firstName: recipient.firstName,
  lastName: recipient.lastName,
  email: recipient.email,
  phone: null,
  companyName: recipient.companyName,
  jobTitle: recipient.jobTitle,
  website: recipient.website,
  leadStatus: "Selected",
  leadPriority: "Medium",
  leadScore: 0,
  tags: [],
  notes: [],
  assignedTo: null,
});

export default function CampaignComposerModal({
  isOpen,
  initialCampaign,
  onClose,
  onSaved,
}: CampaignComposerModalProps) {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [form, setForm] = useState<CampaignFormState>(defaultFormState([], null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leadItems, setLeadItems] = useState<CRMLeadEmailRecipient[]>([]);
  const [leadPage, setLeadPage] = useState(1);
  const [leadLimit] = useState(10);
  const [leadTotalPages, setLeadTotalPages] = useState(0);
  const [leadSearch, setLeadSearch] = useState("");
  const [leadFilters, setLeadFilters] = useState({
    status: "",
    priority: "",
    tags: "",
    owner: "",
    companyName: "",
  });
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [invalidFilteredCount, setInvalidFilteredCount] = useState(0);
  const [selectedRecipients, setSelectedRecipients] = useState<Record<number, CRMLeadEmailRecipient>>({});
  const [loadingInitialRecipients, setLoadingInitialRecipients] = useState(false);
  const [previewRecipientId, setPreviewRecipientId] = useState<number | null>(null);
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isMounted = true;
    const load = async () => {
      try {
        setLoadingAccounts(true);
        const nextAccounts = await fetchEmailAccounts();
        if (!isMounted) {
          return;
        }
        setAccounts(nextAccounts.filter((account) => account.isActive));
        setForm(defaultFormState(nextAccounts.filter((account) => account.isActive), initialCampaign));
      } catch (loadError) {
        if (!isMounted) {
          return;
        }
        setError(readErrorMessage(loadError, "Failed to load email accounts."));
      } finally {
        if (isMounted) {
          setLoadingAccounts(false);
        }
      }
    };

    void load();
    return () => {
      isMounted = false;
    };
  }, [isOpen, initialCampaign]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isMounted = true;
    const loadLeads = async () => {
      try {
        setLoadingLeads(true);
        const response = await getLeadEmailRecipients({
          page: leadPage,
          limit: leadLimit,
          q: leadSearch,
          status: leadFilters.status,
          priority: leadFilters.priority,
          owner: leadFilters.owner,
          tags: leadFilters.tags,
          companyName: leadFilters.companyName,
        });
        if (!isMounted) {
          return;
        }
        setLeadItems(response.items);
        setLeadTotalPages(response.pagination.totalPages);
        setInvalidFilteredCount(response.meta.invalidFilteredCount);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }
        setError(readErrorMessage(loadError, "Failed to load CRM leads."));
      } finally {
        if (isMounted) {
          setLoadingLeads(false);
        }
      }
    };

    const timer = window.setTimeout(() => {
      void loadLeads();
    }, leadSearch ? 300 : 0);

    return () => {
      isMounted = false;
      window.clearTimeout(timer);
    };
  }, [isOpen, leadFilters, leadLimit, leadPage, leadSearch]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedRecipients({});
      setLeadPage(1);
      setLeadSearch("");
      setLeadFilters({
        status: "",
        priority: "",
        tags: "",
        owner: "",
        companyName: "",
      });
      setError(null);
      return;
    }

    if (!initialCampaign) {
      setSelectedRecipients({});
      return;
    }

    let isMounted = true;
    const loadRecipients = async () => {
      try {
        setLoadingInitialRecipients(true);
        const response = await getCampaignRecipients(initialCampaign.id, {
          page: 1,
          limit: 5000,
        });
        if (!isMounted) {
          return;
        }
        const mapped = Object.fromEntries(
          response.items
            .filter((recipient) => recipient.leadId != null)
            .map((recipient) => [recipient.leadId as number, mapRecipientToLead(recipient)])
        );
        setSelectedRecipients(mapped);
        const firstId = Object.keys(mapped)[0];
        setPreviewRecipientId(firstId ? Number(firstId) : null);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }
        setError(readErrorMessage(loadError, "Failed to load campaign recipients."));
      } finally {
        if (isMounted) {
          setLoadingInitialRecipients(false);
        }
      }
    };

    void loadRecipients();
    return () => {
      isMounted = false;
    };
  }, [initialCampaign, isOpen]);

  const selectedRecipientList = useMemo(
    () => Object.values(selectedRecipients).sort((left, right) => left.id - right.id),
    [selectedRecipients]
  );

  const previewRecipient =
    (previewRecipientId != null ? selectedRecipients[previewRecipientId] : null) ??
    selectedRecipientList[0] ??
    null;

  const renderedSubject = previewRecipient
    ? renderTemplate(form.subject, previewRecipient)
    : form.subject;
  const renderedBody = previewRecipient ? renderTemplate(form.body, previewRecipient) : form.body;

  const toggleRecipient = (lead: CRMLeadEmailRecipient) => {
    setSelectedRecipients((current) => {
      const next = { ...current };
      if (next[lead.id]) {
        delete next[lead.id];
      } else {
        next[lead.id] = lead;
      }
      return next;
    });
  };

  const handleSelectAllFiltered = async () => {
    try {
      setLoadingLeads(true);
      const response = await getLeadEmailRecipients({
        page: 1,
        limit: 5000,
        q: leadSearch,
        status: leadFilters.status,
        priority: leadFilters.priority,
        owner: leadFilters.owner,
        tags: leadFilters.tags,
        companyName: leadFilters.companyName,
      });
      setSelectedRecipients((current) => {
        const next = { ...current };
        response.items.forEach((lead) => {
          next[lead.id] = lead;
        });
        return next;
      });
      if (response.items[0]) {
        setPreviewRecipientId(response.items[0].id);
      }
      setInvalidFilteredCount(response.meta.invalidFilteredCount);
    } catch (selectionError) {
      setError(readErrorMessage(selectionError, "Failed to select filtered leads."));
    } finally {
      setLoadingLeads(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError("Campaign name is required.");
      return;
    }
    if (!form.senderAccountId) {
      setError("Sender account is required.");
      return;
    }
    if (!form.subject.trim()) {
      setError("Subject is required.");
      return;
    }
    if (!form.body.trim()) {
      setError("Email body is required.");
      return;
    }
    if (selectedRecipientList.length === 0) {
      setError("Select at least one valid recipient.");
      return;
    }
    if (form.delaySeconds < 5 || form.delaySeconds > 300) {
      setError("Delay must be between 5 and 300 seconds.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const payload = {
        name: form.name.trim(),
        senderAccountId: Number(form.senderAccountId),
        subject: form.subject.trim(),
        body: form.body,
        bodyMode: form.bodyMode,
        delaySeconds: form.delaySeconds,
        recipientLeadIds: selectedRecipientList.map((lead) => lead.id),
      };

      const savedCampaign = initialCampaign
        ? await updateCampaign(initialCampaign.id, payload)
        : await createCampaign(payload);
      onSaved(savedCampaign);
      onClose();
    } catch (saveError) {
      setError(readErrorMessage(saveError, "Failed to save campaign."));
    } finally {
      setSaving(false);
    }
  };

  const insertToken = (field: "subject" | "body", token: string) => {
    setForm((current) => ({
      ...current,
      [field]: `${String(current[field] ?? "")}${token}`,
    }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-7xl p-6 lg:p-8">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
              {initialCampaign ? "Edit Email Campaign" : "Create Email Campaign"}
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Bulk emails are sent one by one with delay to reduce spam risk and server throttling.
            </p>
          </div>
          <div className="rounded-2xl border border-blue-light-100 bg-blue-light-50 px-4 py-3 text-sm text-blue-light-700 dark:border-blue-light-900/40 dark:bg-blue-light-500/10">
            <div>Use only opted-in or business-relevant contacts.</div>
            <div>Avoid misleading subject lines.</div>
            <div>Bulk emails are sent gradually using delay to reduce throttling.</div>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl bg-error-50 px-4 py-3 text-sm text-error-600">{error}</div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Campaign Name</label>
                <InputField
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Sender Account</label>
                <select
                  className={selectClassName}
                  value={form.senderAccountId}
                  onChange={(event) => setForm((current) => ({ ...current, senderAccountId: event.target.value }))}
                  disabled={loadingAccounts}
                >
                  <option value="">{loadingAccounts ? "Loading accounts..." : "Select sender account"}</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.displayName} ({account.emailAddress})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Delay Between Emails</label>
                <InputField
                  type="number"
                  min="5"
                  max="300"
                  value={form.delaySeconds}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      delaySeconds: Number(event.target.value || 10),
                    }))
                  }
                  hint={`Default 10 seconds. Estimated duration: ${formatDuration(selectedRecipientList.length, form.delaySeconds || 10)}.`}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Body Mode</label>
                <select
                  className={selectClassName}
                  value={form.bodyMode}
                  onChange={(event) => setForm((current) => ({ ...current, bodyMode: event.target.value as "html" | "text" }))}
                >
                  <option value="html">HTML editor with preview</option>
                  <option value="text">Plain text</option>
                </select>
              </div>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-gray-800 dark:text-white/90">Subject</div>
                <div className="flex flex-wrap gap-2">
                  {tokenOptions.map((token) => (
                    <button
                      key={`subject-${token}`}
                      type="button"
                      onClick={() => insertToken("subject", token)}
                      className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:border-brand-300 hover:text-brand-600 dark:border-gray-700 dark:text-gray-300"
                    >
                      {token}
                    </button>
                  ))}
                </div>
              </div>
              <InputField
                value={form.subject}
                onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
              />
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-800 dark:text-white/90">Email Body</div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {form.bodyMode === "html"
                      ? "Write safe HTML and use the live preview on the right."
                      : "Write plain text. Personalization tokens are supported."}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tokenOptions.map((token) => (
                    <button
                      key={`body-${token}`}
                      type="button"
                      onClick={() => insertToken("body", token)}
                      className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:border-brand-300 hover:text-brand-600 dark:border-gray-700 dark:text-gray-300"
                    >
                      {token}
                    </button>
                  ))}
                </div>
              </div>

              {form.bodyMode === "html" ? (
                <div className="mb-3 flex flex-wrap gap-2">
                  {htmlSnippets.map((snippet) => (
                    <button
                      key={snippet.label}
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          body: `${current.body}\n${snippet.value}`.trim(),
                        }))
                      }
                      className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:border-brand-300 hover:text-brand-600 dark:border-gray-700 dark:text-gray-300"
                    >
                      {snippet.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, body: "" }))}
                    className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:border-error-300 hover:text-error-600 dark:border-gray-700 dark:text-gray-300"
                  >
                    Clear
                  </button>
                </div>
              ) : null}

              <TextArea
                rows={14}
                value={form.body}
                onChange={(value) => setForm((current) => ({ ...current, body: value }))}
                className="font-mono"
              />
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-800 dark:text-white/90">Recipients</div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Select CRM leads with valid email addresses. Selected: {selectedRecipientList.length}.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => void handleSelectAllFiltered()}>
                    Select All Filtered
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedRecipients({});
                      setPreviewRecipientId(null);
                    }}
                  >
                    Clear Selection
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                <InputField
                  placeholder="Search name, company, email, website, tags"
                  value={leadSearch}
                  onChange={(event) => {
                    setLeadSearch(event.target.value);
                    setLeadPage(1);
                  }}
                />
                <select
                  className={selectClassName}
                  value={leadFilters.status}
                  onChange={(event) => {
                    setLeadFilters((current) => ({ ...current, status: event.target.value }));
                    setLeadPage(1);
                  }}
                >
                  <option value="">All statuses</option>
                  {["New", "Contacted", "Qualified", "Demo Scheduled", "Proposal Sent", "Negotiation", "Converted", "Lost"].map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <select
                  className={selectClassName}
                  value={leadFilters.priority}
                  onChange={(event) => {
                    setLeadFilters((current) => ({ ...current, priority: event.target.value }));
                    setLeadPage(1);
                  }}
                >
                  <option value="">All priorities</option>
                  {["Low", "Medium", "High", "Urgent"].map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <InputField
                  placeholder="Filter by tags"
                  value={leadFilters.tags}
                  onChange={(event) => {
                    setLeadFilters((current) => ({ ...current, tags: event.target.value }));
                    setLeadPage(1);
                  }}
                />
                <InputField
                  placeholder="Assigned owner ID"
                  value={leadFilters.owner}
                  onChange={(event) => {
                    setLeadFilters((current) => ({ ...current, owner: event.target.value }));
                    setLeadPage(1);
                  }}
                />
                <InputField
                  placeholder="Company name"
                  value={leadFilters.companyName}
                  onChange={(event) => {
                    setLeadFilters((current) => ({ ...current, companyName: event.target.value }));
                    setLeadPage(1);
                  }}
                />
              </div>

              {invalidFilteredCount > 0 ? (
                <div className="mt-3 rounded-2xl bg-warning-50 px-4 py-3 text-sm text-warning-700">
                  {invalidFilteredCount} filtered lead{invalidFilteredCount === 1 ? "" : "s"} without valid email were excluded automatically.
                </div>
              ) : null}

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-800 dark:text-gray-400">
                      <th className="px-3 py-2 font-medium">Select</th>
                      <th className="px-3 py-2 font-medium">Lead</th>
                      <th className="px-3 py-2 font-medium">Email</th>
                      <th className="px-3 py-2 font-medium">Company</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingLeads ? (
                      <tr>
                        <td className="px-3 py-6 text-gray-500 dark:text-gray-400" colSpan={6}>
                          Loading lead recipients...
                        </td>
                      </tr>
                    ) : leadItems.length === 0 ? (
                      <tr>
                        <td className="px-3 py-6 text-gray-500 dark:text-gray-400" colSpan={6}>
                          No email-ready leads matched your filters.
                        </td>
                      </tr>
                    ) : (
                      leadItems.map((lead) => (
                        <tr key={lead.id} className="border-b border-gray-100 last:border-b-0 dark:border-gray-800">
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={Boolean(selectedRecipients[lead.id])}
                              onChange={() => toggleRecipient(lead)}
                              className="h-4 w-4"
                            />
                          </td>
                          <td className="px-3 py-3 font-medium text-gray-800 dark:text-white/90">{fullLeadName(lead)}</td>
                          <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{lead.email}</td>
                          <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{lead.companyName || "No company"}</td>
                          <td className="px-3 py-3">
                            <Badge color={getStatusBadgeColor(lead.leadStatus)} size="sm">
                              {lead.leadStatus}
                            </Badge>
                          </td>
                          <td className="px-3 py-3">
                            <Badge color={getPriorityBadgeColor(lead.leadPriority)} size="sm">
                              {lead.leadPriority}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Page {leadPage} of {Math.max(leadTotalPages, 1)}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setLeadPage((current) => Math.max(1, current - 1))}
                    disabled={leadPage <= 1}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setLeadPage((current) => Math.min(Math.max(leadTotalPages, 1), current + 1))}
                    disabled={leadPage >= leadTotalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-gray-800 dark:text-white/90">Preview Email</div>
                <select
                  className={`${selectClassName} max-w-xs`}
                  value={previewRecipient?.id ?? ""}
                  onChange={(event) => setPreviewRecipientId(event.target.value ? Number(event.target.value) : null)}
                >
                  <option value="">Preview recipient</option>
                  {selectedRecipientList.map((recipient) => (
                    <option key={recipient.id} value={recipient.id}>
                      {fullLeadName(recipient)} ({recipient.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Subject</div>
                <div className="mt-2 text-sm font-semibold text-gray-800 dark:text-white/90">
                  {renderedSubject || "No subject yet"}
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
                {form.bodyMode === "html" ? (
                  <div
                    className="prose prose-sm max-w-none text-gray-700 dark:prose-invert dark:text-gray-200"
                    dangerouslySetInnerHTML={{ __html: renderedBody || "<p>No content yet.</p>" }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 dark:text-gray-200">
                    {renderedBody || "No content yet."}
                  </pre>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="text-sm font-semibold text-gray-800 dark:text-white/90">Selected Recipients</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {selectedRecipientList.length} valid lead{selectedRecipientList.length === 1 ? "" : "s"} selected.
              </div>
              <div className="mt-4 space-y-3">
                {loadingInitialRecipients ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400">Loading selected recipients...</div>
                ) : selectedRecipientList.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    No recipients selected yet.
                  </div>
                ) : (
                  selectedRecipientList.slice(0, 12).map((recipient) => (
                    <div
                      key={recipient.id}
                      className="flex items-start justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900"
                    >
                      <div>
                        <div className="font-medium text-gray-800 dark:text-white/90">{fullLeadName(recipient)}</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {recipient.email} {recipient.companyName ? `· ${recipient.companyName}` : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleRecipient(recipient)}
                        className="text-xs font-medium text-error-600"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
              {selectedRecipientList.length > 12 ? (
                <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  Showing first 12 selected recipients.
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving..." : initialCampaign ? "Save Draft" : "Create Draft"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
