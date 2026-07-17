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
  getSegments,
  previewCampaignSegmentAudience,
  sendTestCampaign,
  updateCampaign,
} from "../services/crmApi";
import type {
  CRMCampaign,
  CRMCampaignSegmentAudiencePreview,
  CRMCampaignRecipient,
  CRMLeadEmailRecipient,
  CRMSegment,
} from "../types/crm.types";
import {
  crmLeadTypes,
  formatLeadType,
  fullLeadName,
  getLeadTypeBadgeColor,
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

type AudienceSource = "manual" | "segment";
type TestEmailStatus = { tone: "success" | "error"; message: string } | null;

const selectClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const tokenOptions = [
  "{{firstName}}",
  "{{lastName}}",
  "{{address}}",
  "{{companyName}}",
  "{{jobTitle}}",
  "{{website}}",
  "{{email}}",
  "{{unsubscribeUrl}}",
];

const PREVIEW_UNSUBSCRIBE_URL =
  "https://admin.itmart24.com/api/public/crm/email-track/unsubscribe/preview-token";

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

const renderTemplate = (
  template: string,
  recipient: Partial<CRMLeadEmailRecipient>,
  extra?: { unsubscribeUrl?: string }
) =>
  [
    ["{{firstName}}", recipient.firstName ?? ""],
    ["{{lastName}}", recipient.lastName ?? ""],
    ["{{address}}", recipient.address ?? ""],
    ["{{companyName}}", recipient.companyName ?? ""],
    ["{{jobTitle}}", recipient.jobTitle ?? ""],
    ["{{website}}", recipient.website ?? ""],
    ["{{email}}", recipient.email ?? ""],
    ["{{unsubscribeUrl}}", extra?.unsubscribeUrl ?? PREVIEW_UNSUBSCRIBE_URL],
    ["{{unsubscribeLink}}", extra?.unsubscribeUrl ?? PREVIEW_UNSUBSCRIBE_URL],
    ["{{unsubscribe_url}}", extra?.unsubscribeUrl ?? PREVIEW_UNSUBSCRIBE_URL],
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
  recipientKey: recipient.recipientKey ?? `${recipient.leadId ?? recipient.id}::${recipient.email.toLowerCase()}`,
  firstName: recipient.firstName,
  lastName: recipient.lastName,
  email: recipient.email,
  phone: null,
  emails: [recipient.email],
  phones: [],
  address: recipient.address,
  companyName: recipient.companyName,
  jobTitle: recipient.jobTitle,
  website: recipient.website,
  leadType: recipient.leadType ?? null,
  leadStatus: "Selected",
  leadPriority: "Medium",
  leadScore: 0,
  tags: [],
  notes: [],
  assignedTo: null,
  emailType: null,
  emailRiskLevel: recipient.status,
  campaignReady: recipient.status !== "blocked",
});

const mapSegmentRecipientToLead = (
  recipient: CRMCampaignSegmentAudiencePreview["recipients"][number]
): CRMLeadEmailRecipient => ({
  id: recipient.leadId,
  recipientKey: `${recipient.leadId}::${recipient.email.toLowerCase()}`,
  firstName: recipient.firstName,
  lastName: recipient.lastName,
  email: recipient.email,
  phone: null,
  emails: [recipient.email],
  phones: [],
  address: null,
  companyName: recipient.companyName,
  jobTitle: null,
  website: recipient.website,
  leadType: null,
  leadStatus: "Segment",
  leadPriority: "Medium",
  leadScore: 0,
  tags: [],
  notes: [],
  assignedTo: null,
  emailType: recipient.emailType,
  emailRiskLevel: recipient.emailRiskLevel,
  campaignReady: recipient.campaignReady,
});

export default function CampaignComposerModal({
  isOpen,
  initialCampaign,
  onClose,
  onSaved,
}: CampaignComposerModalProps) {
  const getLeadEmails = (lead: CRMLeadEmailRecipient) => {
    const values = Array.isArray(lead.emails) && lead.emails.length > 0 ? lead.emails : lead.email ? [lead.email] : [];
    return Array.from(new Set(values.filter(Boolean).map((email) => email.trim().toLowerCase())));
  };

  const buildRecipientKey = (leadId: number, email: string) => `${leadId}::${email.trim().toLowerCase()}`;

  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [segments, setSegments] = useState<CRMSegment[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingSegments, setLoadingSegments] = useState(false);
  const [loadingSegmentPreview, setLoadingSegmentPreview] = useState(false);
  const [form, setForm] = useState<CampaignFormState>(defaultFormState([], null));
  const [audienceSource, setAudienceSource] = useState<AudienceSource>(initialCampaign?.segmentId ? "segment" : "manual");
  const [selectedSegmentId, setSelectedSegmentId] = useState<string>(initialCampaign?.segmentId ? String(initialCampaign.segmentId) : "");
  const [segmentPreview, setSegmentPreview] = useState<CRMCampaignSegmentAudiencePreview | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMode, setSaveMode] = useState<"draft">("draft");
  const [error, setError] = useState<string | null>(null);
  const [leadItems, setLeadItems] = useState<CRMLeadEmailRecipient[]>([]);
  const [leadPage, setLeadPage] = useState(1);
  const [leadLimit] = useState(10);
  const [leadTotalPages, setLeadTotalPages] = useState(0);
  const [leadSearch, setLeadSearch] = useState("");
  const [leadFilters, setLeadFilters] = useState({
    status: "",
    leadType: "",
    priority: "",
    tags: "",
    owner: "",
    companyName: "",
  });
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [hasLoadedRecipients, setHasLoadedRecipients] = useState(false);
  const [invalidFilteredCount, setInvalidFilteredCount] = useState(0);
  const [selectedRecipients, setSelectedRecipients] = useState<Record<string, CRMLeadEmailRecipient>>({});
  const [loadingInitialRecipients, setLoadingInitialRecipients] = useState(false);
  const [previewRecipientId, setPreviewRecipientId] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [testEmailStatus, setTestEmailStatus] = useState<TestEmailStatus>(null);
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isMounted = true;
    const load = async () => {
      try {
        setLoadingAccounts(true);
        setLoadingSegments(true);
        const [nextAccounts, nextSegments] = await Promise.all([
          fetchEmailAccounts(),
          getSegments({ page: 1, limit: 200 }),
        ]);
        if (!isMounted) {
          return;
        }
        setAccounts(nextAccounts.filter((account) => account.isActive));
        setSegments(nextSegments.items.filter((segment) => String(segment.entityType) === "leads"));
        setForm(defaultFormState(nextAccounts.filter((account) => account.isActive), initialCampaign));
        setAudienceSource(initialCampaign?.segmentId ? "segment" : "manual");
        setSelectedSegmentId(initialCampaign?.segmentId ? String(initialCampaign.segmentId) : "");
      } catch (loadError) {
        if (!isMounted) {
          return;
        }
        setError(readErrorMessage(loadError, "Failed to load email accounts."));
      } finally {
        if (isMounted) {
          setLoadingAccounts(false);
          setLoadingSegments(false);
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
          leadType: leadFilters.leadType,
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
  }, [hasLoadedRecipients, isOpen, leadFilters, leadLimit, leadPage, leadSearch]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedRecipients({});
      setLeadPage(1);
      setLeadSearch("");
      setHasLoadedRecipients(false);
      setLeadItems([]);
      setLeadTotalPages(0);
      setInvalidFilteredCount(0);
      setLeadFilters({
        status: "",
        leadType: "",
        priority: "",
        tags: "",
        owner: "",
        companyName: "",
      });
      setError(null);
      setSegmentPreview(null);
      setSelectedSegmentId(initialCampaign?.segmentId ? String(initialCampaign.segmentId) : "");
      setAudienceSource(initialCampaign?.segmentId ? "segment" : "manual");
      setTestEmail("");
      setTestEmailStatus(null);
      setSendingTestEmail(false);
      return;
    }

    if (!initialCampaign) {
      setSelectedRecipients({});
      setPreviewRecipientId(null);
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
            .map((recipient) => {
              const mappedRecipient = mapRecipientToLead(recipient);
              return [mappedRecipient.recipientKey, mappedRecipient];
            })
        );
        setSelectedRecipients(mapped);
        const firstId = Object.keys(mapped)[0];
        setPreviewRecipientId(firstId ?? null);
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

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (audienceSource !== "segment") {
      setSegmentPreview(null);
      return;
    }

    if (!selectedSegmentId) {
      setSegmentPreview(null);
      setSelectedRecipients({});
      setPreviewRecipientId(null);
      return;
    }

    let isMounted = true;
    const loadSegmentAudience = async () => {
      try {
        setLoadingSegmentPreview(true);
        const preview = await previewCampaignSegmentAudience(Number(selectedSegmentId));
        if (!isMounted) {
          return;
        }
        setSegmentPreview(preview);
        const mappedRecipients = Object.fromEntries(
          preview.recipients.map((recipient) => {
            const lead = mapSegmentRecipientToLead(recipient);
            return [lead.recipientKey, lead];
          })
        );
        setSelectedRecipients(mappedRecipients);
        setPreviewRecipientId(Object.keys(mappedRecipients)[0] ?? null);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }
        setSegmentPreview(null);
        setSelectedRecipients({});
        setPreviewRecipientId(null);
        setError(readErrorMessage(loadError, "Failed to load selected segment."));
      } finally {
        if (isMounted) {
          setLoadingSegmentPreview(false);
        }
      }
    };

    void loadSegmentAudience();
    return () => {
      isMounted = false;
    };
  }, [audienceSource, isOpen, selectedSegmentId]);

  const selectedRecipientList = useMemo(
    () =>
      Object.values(selectedRecipients).sort((left, right) =>
        left.id === right.id ? left.email.localeCompare(right.email) : left.id - right.id
      ),
    [selectedRecipients]
  );

  const previewRecipient =
    (previewRecipientId != null ? selectedRecipients[previewRecipientId] : null) ??
    selectedRecipientList[0] ??
    null;

  const renderedSubject = previewRecipient
    ? renderTemplate(form.subject, previewRecipient, { unsubscribeUrl: PREVIEW_UNSUBSCRIBE_URL })
    : form.subject;
  const renderedBody = previewRecipient
    ? renderTemplate(form.body, previewRecipient, { unsubscribeUrl: PREVIEW_UNSUBSCRIBE_URL })
    : form.body;

  const toggleRecipient = (lead: CRMLeadEmailRecipient, email = lead.email) => {
    const normalizedEmail = email.trim().toLowerCase();
    const recipientKey = buildRecipientKey(lead.id, normalizedEmail);
    setSelectedRecipients((current) => {
      const next = { ...current };
      if (next[recipientKey]) {
        delete next[recipientKey];
      } else {
        next[recipientKey] = {
          ...lead,
          recipientKey,
          email: normalizedEmail,
        };
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
        leadType: leadFilters.leadType,
        priority: leadFilters.priority,
        owner: leadFilters.owner,
        tags: leadFilters.tags,
        companyName: leadFilters.companyName,
      });
      setSelectedRecipients((current) => {
        const next = { ...current };
        response.items.forEach((lead) => {
          getLeadEmails(lead).forEach((email) => {
            const recipientKey = buildRecipientKey(lead.id, email);
            next[recipientKey] = {
              ...lead,
              recipientKey,
              email,
            };
          });
        });
        return next;
      });
      if (response.items[0]) {
        const firstEmail = getLeadEmails(response.items[0])[0];
        setPreviewRecipientId(firstEmail ? buildRecipientKey(response.items[0].id, firstEmail) : null);
      }
      setHasLoadedRecipients(true);
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
    if (audienceSource === "segment" && !selectedSegmentId) {
      setError("Select a saved segment.");
      return;
    }
    if (selectedRecipientList.length === 0) {
      setError(audienceSource === "segment" ? "Selected segment has no sendable recipients." : "Select at least one valid recipient.");
      return;
    }
    if (form.delaySeconds < 5 || form.delaySeconds > 300) {
      setError("Delay must be between 5 and 300 seconds.");
      return;
    }

    try {
      setSaving(true);
      setSaveMode("draft");
      setError(null);
      const payload = {
        name: form.name.trim(),
        senderAccountId: Number(form.senderAccountId),
        subject: form.subject.trim(),
        body: form.body,
        bodyMode: form.bodyMode,
        delaySeconds: form.delaySeconds,
        audienceSource,
        segmentId: audienceSource === "segment" ? Number(selectedSegmentId) : null,
        recipientLeadIds:
          audienceSource === "manual" ? Array.from(new Set(selectedRecipientList.map((lead) => lead.id))) : [],
        recipientSelections:
          audienceSource === "manual"
            ? selectedRecipientList.map((lead) => ({
                leadId: lead.id,
                email: lead.email,
              }))
            : [],
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
      setSaveMode("draft");
    }
  };

  const handleSendTestEmail = async () => {
    if (!initialCampaign) {
      return;
    }

    if (!testEmail.trim()) {
      setTestEmailStatus({
        tone: "error",
        message: "Email Sending Failed",
      });
      return;
    }

    try {
      setSendingTestEmail(true);
      setTestEmailStatus(null);
      await sendTestCampaign(initialCampaign.id, { email: testEmail.trim() });
      setTestEmailStatus({
        tone: "success",
        message: "Email Successfully send",
      });
    } catch (sendError) {
      setTestEmailStatus({
        tone: "error",
        message: readErrorMessage(sendError, "Email Sending Failed"),
      });
    } finally {
      setSendingTestEmail(false);
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
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="mb-4">
                <div className="text-sm font-semibold text-gray-800 dark:text-white/90">Audience</div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Choose a saved CRM segment for campaign-safe recipients or switch to manual lead selection.
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Audience Source</label>
                  <select
                    className={selectClassName}
                    value={audienceSource}
                    onChange={(event) => {
                      const nextSource = event.target.value as AudienceSource;
                      setAudienceSource(nextSource);
                      setError(null);
                      if (nextSource === "manual") {
                        setSegmentPreview(null);
                        setSelectedSegmentId("");
                        setSelectedRecipients({});
                        setPreviewRecipientId(null);
                      } else if (!selectedSegmentId && segments[0]) {
                        setSelectedSegmentId(String(segments[0].id));
                      }
                    }}
                  >
                    <option value="segment">Saved Segment</option>
                    <option value="manual">Manual Leads</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Segment Selector</label>
                  <select
                    className={selectClassName}
                    value={selectedSegmentId}
                    onChange={(event) => {
                      setSelectedSegmentId(event.target.value);
                      setError(null);
                    }}
                    disabled={audienceSource !== "segment" || loadingSegments}
                  >
                    <option value="">{loadingSegments ? "Loading segments..." : "Select saved segment"}</option>
                    {segments.map((segment) => (
                      <option key={segment.id} value={segment.id}>
                        {segment.name} ({segment.conditions.length} conditions)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {audienceSource === "segment" ? (
                <div className="mt-4 space-y-4">
                  {loadingSegmentPreview ? (
                    <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                      Loading segment audience preview...
                    </div>
                  ) : segmentPreview ? (
                    <>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                        {[
                          ["Matched leads", segmentPreview.summary.matchedLeads],
                          ["Campaign ready", segmentPreview.summary.campaignReady],
                          ["Sendable", segmentPreview.summary.sendable],
                          ["Blocked", segmentPreview.summary.blocked],
                          ["Applied limit", segmentPreview.summary.appliedLimit ?? "No limit"],
                        ].map(([label, value]) => (
                          <div key={String(label)} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
                            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
                            <div className="mt-2 text-xl font-semibold text-gray-800 dark:text-white/90">{String(value)}</div>
                          </div>
                        ))}
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                        {[
                          ["Missing email", segmentPreview.summary.missingEmail],
                          ["Invalid email", segmentPreview.summary.invalidEmail],
                          ["Unsubscribed", segmentPreview.summary.unsubscribed],
                          ["Bounced", segmentPreview.summary.bounced],
                          ["Spam complaint", segmentPreview.summary.spamComplaint],
                          ["Do not contact", segmentPreview.summary.doNotContact],
                        ].map(([label, value]) => (
                          <div key={String(label)} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
                            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
                            <div className="mt-2 text-lg font-semibold text-gray-800 dark:text-white/90">{String(value)}</div>
                          </div>
                        ))}
                      </div>

                      {segmentPreview.summary.blocked > 0 ? (
                        <div className="rounded-2xl bg-warning-50 px-4 py-3 text-sm text-warning-700">
                          {segmentPreview.summary.blocked} blocked lead{segmentPreview.summary.blocked === 1 ? "" : "s"} will be excluded from sending, but you can still save the draft with the sendable recipients.
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                      Select a saved segment to preview the campaign-safe audience.
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
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
              <div className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                Use <code>{"{{unsubscribeUrl}}"}</code> for opt-out links. Backward-compatible tags <code>{"{{unsubscribeLink}}"}</code> and <code>{"{{unsubscribe_url}}"}</code> also work.
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

            {initialCampaign ? (
              <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
                <div className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">Send Test Email</div>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                  <InputField
                    type="email"
                    placeholder="Enter test email address"
                    value={testEmail}
                    onChange={(event) => {
                      setTestEmail(event.target.value);
                      if (testEmailStatus) {
                        setTestEmailStatus(null);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleSendTestEmail()}
                    disabled={sendingTestEmail}
                  >
                    {sendingTestEmail ? "Sending..." : "Send"}
                  </Button>
                </div>
                {testEmailStatus ? (
                  <div
                    className={`mt-3 text-sm ${
                      testEmailStatus.tone === "success"
                        ? "text-success-600 dark:text-success-400"
                        : "text-error-600 dark:text-error-400"
                    }`}
                  >
                    {testEmailStatus.message}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-800 dark:text-white/90">Recipients</div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {audienceSource === "segment"
                      ? "Recipients are loaded automatically from the saved segment preview."
                      : `Select CRM lead email addresses. Selected: ${selectedRecipientList.length}.`}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleSelectAllFiltered()}
                    disabled={audienceSource !== "manual"}
                  >
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
                    disabled={audienceSource !== "manual"}
                  >
                    Clear Selection
                  </Button>
                </div>
              </div>

              {audienceSource === "manual" ? (
                <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
                <InputField
                  placeholder="Search name, company, email, website, tags"
                  value={leadSearch}
                  onChange={(event) => {
                    setLeadSearch(event.target.value);
                    setLeadPage(1);
                    setHasLoadedRecipients(false);
                    setLeadItems([]);
                    setInvalidFilteredCount(0);
                  }}
                />
                <select
                  className={selectClassName}
                  value={leadFilters.status}
                  onChange={(event) => {
                    setLeadFilters((current) => ({ ...current, status: event.target.value }));
                    setLeadPage(1);
                    setHasLoadedRecipients(false);
                    setLeadItems([]);
                    setInvalidFilteredCount(0);
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
                  value={leadFilters.leadType}
                  onChange={(event) => {
                    setLeadFilters((current) => ({ ...current, leadType: event.target.value }));
                    setLeadPage(1);
                    setHasLoadedRecipients(false);
                    setLeadItems([]);
                    setInvalidFilteredCount(0);
                  }}
                >
                  <option value="">All lead types</option>
                  {crmLeadTypes.map((item) => (
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
                    setHasLoadedRecipients(false);
                    setLeadItems([]);
                    setInvalidFilteredCount(0);
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
                    setHasLoadedRecipients(false);
                    setLeadItems([]);
                    setInvalidFilteredCount(0);
                  }}
                />
                <InputField
                  placeholder="Assigned owner ID"
                  value={leadFilters.owner}
                  onChange={(event) => {
                    setLeadFilters((current) => ({ ...current, owner: event.target.value }));
                    setLeadPage(1);
                    setHasLoadedRecipients(false);
                    setLeadItems([]);
                    setInvalidFilteredCount(0);
                  }}
                />
                <InputField
                  placeholder="Company name"
                  value={leadFilters.companyName}
                  onChange={(event) => {
                    setLeadFilters((current) => ({ ...current, companyName: event.target.value }));
                    setLeadPage(1);
                    setHasLoadedRecipients(false);
                    setLeadItems([]);
                    setInvalidFilteredCount(0);
                  }}
                />
              </div>

              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setLeadPage(1);
                    setHasLoadedRecipients(true);
                  }}
                >
                  Filter
                </Button>
              </div>

              {hasLoadedRecipients && invalidFilteredCount > 0 ? (
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
                      <th className="px-3 py-2 font-medium">Lead Type</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!hasLoadedRecipients ? (
                      <tr>
                        <td className="px-3 py-6 text-gray-500 dark:text-gray-400" colSpan={7}>
                          Apply filters and click Filter to load recipients.
                        </td>
                      </tr>
                    ) : loadingLeads ? (
                      <tr>
                        <td className="px-3 py-6 text-gray-500 dark:text-gray-400" colSpan={7}>
                          Loading lead recipients...
                        </td>
                      </tr>
                    ) : leadItems.length === 0 ? (
                      <tr>
                        <td className="px-3 py-6 text-gray-500 dark:text-gray-400" colSpan={7}>
                          No email-ready leads matched your filters.
                        </td>
                      </tr>
                    ) : (
                      leadItems.map((lead) => (
                        <tr key={lead.id} className="border-b border-gray-100 last:border-b-0 dark:border-gray-800">
                          <td className="px-3 py-3">
                            <div className="space-y-2">
                              {getLeadEmails(lead).map((email) => {
                                const recipientKey = buildRecipientKey(lead.id, email);
                                return (
                                  <div key={recipientKey}>
                                    <input
                                      type="checkbox"
                                      checked={Boolean(selectedRecipients[recipientKey])}
                                      onChange={() => toggleRecipient(lead, email)}
                                      className="h-4 w-4"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                          <td className="px-3 py-3 font-medium text-gray-800 dark:text-white/90">{fullLeadName(lead)}</td>
                          <td className="px-3 py-3 text-gray-700 dark:text-gray-300">
                            <div className="space-y-2">
                              {getLeadEmails(lead).map((email) => (
                                <div key={`${lead.id}-${email}`} className="break-all">{email}</div>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{lead.companyName || "No company"}</td>
                          <td className="px-3 py-3">
                            <Badge color={getLeadTypeBadgeColor(lead.leadType)} size="sm">
                              {formatLeadType(lead.leadType)}
                            </Badge>
                          </td>
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
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  The selected saved segment controls the recipient list automatically. Change the segment above to refresh this audience.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-gray-800 dark:text-white/90">Preview Email</div>
                <select
                  className={`${selectClassName} max-w-xs`}
                  value={previewRecipient?.recipientKey ?? ""}
                  onChange={(event) => setPreviewRecipientId(event.target.value || null)}
                >
                  <option value="">Preview recipient</option>
                  {selectedRecipientList.map((recipient) => (
                    <option key={recipient.recipientKey} value={recipient.recipientKey}>
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
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-gray-800 dark:text-white/90">Selected Recipients</div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRecipients({});
                    setPreviewRecipientId(null);
                  }}
                  disabled={audienceSource !== "manual"}
                  className="text-sm font-medium text-brand-600 hover:underline"
                >
                  Clear all
                </button>
              </div>
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
                      key={recipient.recipientKey}
                      className="flex items-start justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900"
                    >
                      <div>
                        <div className="font-medium text-gray-800 dark:text-white/90">{fullLeadName(recipient)}</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {recipient.email} {recipient.companyName ? `· ${recipient.companyName}` : ""}
                        </div>
                        <div className="mt-2">
                          <Badge color={getLeadTypeBadgeColor(recipient.leadType)} size="sm">
                            {formatLeadType(recipient.leadType)}
                          </Badge>
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
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleSave()}
            disabled={
              saving ||
              loadingSegmentPreview ||
              (audienceSource === "segment" && (!selectedSegmentId || (segmentPreview?.summary.sendable ?? 0) === 0))
            }
          >
            {saving && saveMode === "draft" ? "Saving..." : initialCampaign ? "Save Draft" : "Create Draft"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
