import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageMeta from "../../../components/common/PageMeta";
import InputField from "../../../components/form/input/InputField";
import Badge from "../../../components/ui/badge/Badge";
import Button from "../../../components/ui/button/Button";
import { Dropdown } from "../../../components/ui/dropdown/Dropdown";
import { DropdownItem } from "../../../components/ui/dropdown/DropdownItem";
import { Modal } from "../../../components/ui/modal";
import { downloadCsv, downloadXlsx } from "../../../utils/spreadsheetExport";
import CampaignComposerModal from "./components/CampaignComposerModal";
import {
  cancelCampaign,
  deleteCampaign,
  duplicateCampaign,
  getCampaign,
  getCampaignClicks,
  getCampaignDashboardData,
  getCampaignEvents,
  getCampaignRecipients,
  getCampaignTracking,
  previewCampaign,
  resendCampaignRecipient,
  sendCampaign,
  sendTestCampaign,
  updateCampaignRecipientAction,
} from "./services/crmApi";
import type {
  BannerState,
  CRMCampaign,
  CRMCampaignAudiencePreview,
  CRMCampaignTrackingClick,
  CRMCampaignTrackingEvent,
  CRMCampaignTrackingOverview,
  CRMCampaignRecipient,
  CRMCampaignRecipientSummary,
  CRMCampaignSummary,
  CRMPreviewResponse,
} from "./types/crm.types";
import { formatDateTime, getStatusBadgeColor, readErrorMessage } from "./utils/crmHelpers";

const selectClassName =
  "h-11 rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const PREVIEW_UNSUBSCRIBE_URL =
  "https://admin.itmart24.com/api/public/crm/email-track/unsubscribe/preview-token";

const renderTemplate = (
  template: string,
  recipient: Partial<CRMCampaignRecipient>,
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

const formatDuration = (count: number, delaySeconds: number) => {
  const totalSeconds = Math.max(0, count * delaySeconds);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
};

const exportDateValue = (value: string | null | undefined) => (value ? formatDateTime(value) : "");

const buildCampaignExportRows = ({
  campaign,
  recipients,
  events,
  clicks,
}: {
  campaign: CRMCampaign;
  recipients: CRMCampaignRecipient[];
  events: CRMCampaignTrackingEvent[];
  clicks: CRMCampaignTrackingClick[];
}) =>
  recipients.map((recipient) => {
    const openEvents = events
      .filter((event) => event.recipientId === recipient.id && event.eventType === "opened")
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
    const recipientClicks = clicks
      .filter((click) => click.recipientId === recipient.id)
      .sort((left, right) => new Date(right.clickedAt).getTime() - new Date(left.clickedAt).getTime());
    const lastOpen = openEvents[0] ?? null;
    const lastClick = recipientClicks[0] ?? null;

    return {
      "Campaign ID": campaign.id,
      "Campaign Name": campaign.name,
      "Campaign Status": campaign.status,
      "Sender Email": campaign.senderEmail ?? "",
      "Subject": recipient.personalizedSubject ?? campaign.subject,
      "Recipient ID": recipient.id,
      Recipient: [recipient.firstName, recipient.lastName].filter(Boolean).join(" ") || recipient.companyName || "Lead",
      Email: recipient.email,
      "Company Name": recipient.companyName ?? "",
      "Lead Type": recipient.leadType ?? "",
      "Delivery Status": recipient.status,
      "Error Message": recipient.errorMessage ?? "",
      "Failure Reason": recipient.failureReason ?? "",
      "Blocked Reason": recipient.blockedReason ?? "",
      "Skip Reason": recipient.skipReason ?? "",
      "Open Count": recipient.openCount ?? 0,
      "Click Count": recipient.clickCount ?? 0,
      "Sent At": exportDateValue(recipient.sentAt),
      "Delivered At": exportDateValue(recipient.deliveredAt),
      "First Open At": exportDateValue(recipient.firstOpenedAt),
      "Last Open At": exportDateValue(recipient.lastOpenedAt),
      "Last Open Source": lastOpen?.eventSource ?? "",
      "Last Open IP": lastOpen?.ipAddress ?? "",
      "Last Open User Agent": lastOpen?.userAgent ?? "",
      "First Click At": exportDateValue(recipient.firstClickedAt),
      "Last Click At": exportDateValue(recipient.lastClickedAt),
      "Last Click URL": lastClick?.originalUrl ?? "",
      "Last Click IP": lastClick?.ipAddress ?? "",
      "Last Click User Agent": lastClick?.userAgent ?? "",
      "Replied At": exportDateValue(recipient.repliedAt),
      "Bounce At": exportDateValue(recipient.bounceAt),
      "Bounce Type": recipient.bounceType ?? "",
      "Bounce Reason": recipient.bounceReason ?? "",
      "Complained At": exportDateValue(recipient.complainedAt),
      "Unsubscribed At": exportDateValue(recipient.unsubscribedAt),
      "Last Event Type": recipient.lastEventType ?? "",
      "Last Event At": exportDateValue(recipient.lastEventAt),
      "Created At": exportDateValue(recipient.createdAt),
      "Updated At": exportDateValue(recipient.updatedAt),
    };
  });

export default function EmailCampaignsPage() {
  const [campaigns, setCampaigns] = useState<CRMCampaign[]>([]);
  const [summary, setSummary] = useState<CRMCampaignSummary>({
    totalCampaigns: 0,
    drafts: 0,
    sending: 0,
    completed: 0,
    failed: 0,
  });
  const [banner, setBanner] = useState<BannerState>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [composerCampaign, setComposerCampaign] = useState<CRMCampaign | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [detailCampaignId, setDetailCampaignId] = useState<number | null>(null);
  const [detailCampaign, setDetailCampaign] = useState<CRMCampaign | null>(null);
  const [detailRecipients, setDetailRecipients] = useState<CRMCampaignRecipient[]>([]);
  const [detailSummary, setDetailSummary] = useState<CRMCampaignRecipientSummary>({
    total: 0,
    pending: 0,
    sending: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  });
  const [detailTrackingOverview, setDetailTrackingOverview] = useState<CRMCampaignTrackingOverview | null>(null);
  const [detailAudiencePreview, setDetailAudiencePreview] = useState<CRMCampaignAudiencePreview | null>(null);
  const [detailEvents, setDetailEvents] = useState<CRMCampaignTrackingEvent[]>([]);
  const [detailClicks, setDetailClicks] = useState<CRMCampaignTrackingClick[]>([]);
  const [sendPreview, setSendPreview] = useState<CRMCampaignAudiencePreview | null>(null);
  const [detailPreview, setDetailPreview] = useState<CRMPreviewResponse | null>(null);
  const [detailRecipientPage, setDetailRecipientPage] = useState(1);
  const [detailRecipientTotalPages, setDetailRecipientTotalPages] = useState(0);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sendConfirmCampaign, setSendConfirmCampaign] = useState<CRMCampaign | null>(null);
  const [workingCampaignId, setWorkingCampaignId] = useState<number | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [workingRecipientId, setWorkingRecipientId] = useState<number | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<"csv" | "xlsx" | null>(null);
  const detailCampaignIdRef = useRef<number | null>(null);

  useEffect(() => {
    detailCampaignIdRef.current = detailCampaignId;
  }, [detailCampaignId]);

  const showBanner = (tone: "success" | "error" | "info", message: string) => {
    setBanner({ tone, message });
    window.setTimeout(() => setBanner(null), 4000);
  };

  const closeDetailModal = () => {
    setDetailCampaignId(null);
    setDetailCampaign(null);
    setDetailRecipients([]);
    setDetailPreview(null);
    setDetailSummary({
      total: 0,
      pending: 0,
      sending: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
    });
    setDetailTrackingOverview(null);
    setDetailAudiencePreview(null);
    setDetailEvents([]);
    setDetailClicks([]);
    setTestEmail("");
    setWorkingRecipientId(null);
    setIsExportMenuOpen(false);
    setExportingFormat(null);
  };

  const openSendConfirmation = async (campaign: CRMCampaign) => {
    setSendConfirmCampaign(campaign);
    try {
      const tracking = await getCampaignTracking(campaign.id);
      setSendPreview(tracking.audiencePreview);
    } catch {
      setSendPreview(null);
    }
  };

  const loadCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getCampaignDashboardData({
        page,
        limit,
        q: search,
        status: statusFilter,
      });
      setCampaigns(response.items);
      setSummary(response.summary);
      setTotalPages(response.pagination.totalPages);
    } catch (error) {
      showBanner("error", readErrorMessage(error, "Failed to load campaigns."));
    } finally {
      setLoading(false);
    }
  }, [limit, page, search, statusFilter]);

  const openCampaignDetails = useCallback(async (campaignId: number, silent = false) => {
    try {
      if (!silent) {
        setDetailCampaignId(campaignId);
      }
      if (!silent) {
        setLoadingDetail(true);
      }
      const [campaign, recipients, preview, tracking, events, clicks] = await Promise.all([
        getCampaign(campaignId),
        getCampaignRecipients(campaignId, { page: detailRecipientPage, limit: 20 }),
        previewCampaign(campaignId),
        getCampaignTracking(campaignId),
        getCampaignEvents(campaignId, { page: 1, limit: 20 }),
        getCampaignClicks(campaignId, { page: 1, limit: 20 }),
      ]);
      if (detailCampaignIdRef.current !== campaignId) {
        return;
      }
      setDetailCampaign(campaign);
      setDetailRecipients(recipients.items);
      setDetailSummary(recipients.summary);
      setDetailRecipientTotalPages(recipients.pagination.totalPages);
      setDetailPreview(preview);
      setDetailTrackingOverview(tracking.overview);
      setDetailAudiencePreview(tracking.audiencePreview);
      setDetailEvents(events.items);
      setDetailClicks(clicks.items);
    } catch (error) {
      if (!silent) {
        showBanner("error", readErrorMessage(error, "Failed to load campaign details."));
      }
    } finally {
      if (!silent) {
        setLoadingDetail(false);
      }
    }
  }, [detailRecipientPage]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCampaigns();
    }, search ? 300 : 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadCampaigns, search]);

  useEffect(() => {
    const hasSendingCampaign =
      campaigns.some((campaign) => campaign.status === "Sending") ||
      detailCampaign?.status === "Sending";

    if (!hasSendingCampaign) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadCampaigns();
      if (detailCampaignId) {
        void openCampaignDetails(detailCampaignId, true);
      }
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [campaigns, detailCampaign, detailCampaignId, loadCampaigns, openCampaignDetails]);

  useEffect(() => {
    if (!detailCampaignId) {
      return;
    }

    void openCampaignDetails(detailCampaignId, true);
  }, [detailCampaignId, detailRecipientPage, openCampaignDetails]);

  const selectedPreviewRecipient = useMemo(
    () => detailRecipients.find((recipient) => recipient.email) ?? null,
    [detailRecipients]
  );

  const renderedDetailSubject =
    detailCampaign && selectedPreviewRecipient
      ? renderTemplate(detailCampaign.subject, selectedPreviewRecipient, {
          unsubscribeUrl: PREVIEW_UNSUBSCRIBE_URL,
        })
      : detailPreview?.subject ?? detailCampaign?.subject ?? "";
  const renderedDetailBody =
    detailCampaign && selectedPreviewRecipient
      ? renderTemplate(detailCampaign.body, selectedPreviewRecipient, {
          unsubscribeUrl: PREVIEW_UNSUBSCRIBE_URL,
        })
      : detailPreview?.body ?? detailCampaign?.body ?? "";

  const refreshDetailTracking = useCallback(async (campaignId: number) => {
    const [tracking, recipients, events, clicks] = await Promise.all([
      getCampaignTracking(campaignId),
      getCampaignRecipients(campaignId, { page: detailRecipientPage, limit: 20 }),
      getCampaignEvents(campaignId, { page: 1, limit: 20 }),
      getCampaignClicks(campaignId, { page: 1, limit: 20 }),
    ]);
    setDetailTrackingOverview(tracking.overview);
    setDetailAudiencePreview(tracking.audiencePreview);
    setDetailRecipients(recipients.items);
    setDetailSummary(recipients.summary);
    setDetailRecipientTotalPages(recipients.pagination.totalPages);
    setDetailEvents(events.items);
    setDetailClicks(clicks.items);
  }, [detailRecipientPage]);

  const handleRecipientAction = useCallback(
    async (
      recipient: CRMCampaignRecipient,
      action: "bounced" | "replied" | "complained" | "unsubscribed" | "do_not_contact"
    ) => {
      if (!detailCampaign) {
        return;
      }

      try {
        setWorkingCampaignId(detailCampaign.id);
        await updateCampaignRecipientAction(detailCampaign.id, recipient.id, action);
        await refreshDetailTracking(detailCampaign.id);
        showBanner("success", `Recipient updated: ${action.replace(/_/g, " ")}.`);
      } catch (error) {
        showBanner("error", readErrorMessage(error, "Failed to update recipient."));
      } finally {
        setWorkingCampaignId(null);
      }
    },
    [detailCampaign, refreshDetailTracking]
  );

  const handleResendRecipient = useCallback(
    async (recipient: CRMCampaignRecipient) => {
      if (!detailCampaign) {
        return;
      }

      try {
        setWorkingRecipientId(recipient.id);
        await resendCampaignRecipient(detailCampaign.id, recipient.id);
        await refreshDetailTracking(detailCampaign.id);
        showBanner("success", `Resend completed for ${recipient.email}.`);
      } catch (error) {
        showBanner("error", readErrorMessage(error, "Failed to resend recipient email."));
      } finally {
        setWorkingRecipientId(null);
      }
    },
    [detailCampaign, refreshDetailTracking]
  );

  const handleExportRecipients = useCallback(
    async (format: "csv" | "xlsx") => {
      if (!detailCampaign || exportingFormat) {
        return;
      }

      setIsExportMenuOpen(false);
      setExportingFormat(format);

      const fetchAllPages = async <T,>(
        fetchPage: (page: number, limit: number) => Promise<{
          items: T[];
          pagination: { totalPages: number };
        }>
      ) => {
        const limit = 500;
        const allItems: T[] = [];
        let currentPage = 1;
        let totalPages = 1;

        while (currentPage <= totalPages) {
          const response = await fetchPage(currentPage, limit);
          allItems.push(...response.items);
          totalPages = Math.max(response.pagination.totalPages, 1);
          currentPage += 1;
        }

        return allItems;
      };

      try {
        const [recipients, events, clicks] = await Promise.all([
          fetchAllPages((pageNumber, pageLimit) =>
            getCampaignRecipients(detailCampaign.id, { page: pageNumber, limit: pageLimit })
          ),
          fetchAllPages((pageNumber, pageLimit) =>
            getCampaignEvents(detailCampaign.id, { page: pageNumber, limit: pageLimit })
          ),
          fetchAllPages((pageNumber, pageLimit) =>
            getCampaignClicks(detailCampaign.id, { page: pageNumber, limit: pageLimit })
          ),
        ]);

        const rows = buildCampaignExportRows({
          campaign: detailCampaign,
          recipients,
          events,
          clicks,
        });

        if (rows.length === 0) {
          showBanner("info", "No recipient details available to export.");
          return;
        }

        const dateTag = new Date().toISOString().slice(0, 10);
        const safeCampaignName = detailCampaign.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
        const fileBaseName = `${safeCampaignName || "campaign"}-recipient-delivery-${dateTag}`;

        if (format === "csv") {
          downloadCsv(`${fileBaseName}.csv`, rows);
        } else {
          downloadXlsx(`${fileBaseName}.xlsx`, rows);
        }

        showBanner("success", `Campaign report exported as ${format.toUpperCase()}.`);
      } catch (error) {
        showBanner("error", readErrorMessage(error, `Failed to export ${format.toUpperCase()} report.`));
      } finally {
        setExportingFormat(null);
      }
    },
    [detailCampaign, exportingFormat]
  );

  return (
    <>
      <PageMeta
        title="CRM Email Campaigns | ITMart24 Admin"
        description="Create, save, and send delayed bulk email campaigns to CRM leads."
      />

      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-800 dark:text-white/90">
              Email Campaigns
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Build enterprise-grade outreach campaigns for CRM leads using existing Email Manager accounts and safe delayed sending.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => {
              setComposerCampaign(null);
              setIsComposerOpen(true);
            }}
          >
            Create Campaign
          </Button>
        </div>

        {banner ? (
          <div
            className={`rounded-2xl px-4 py-3 text-sm ${
              banner.tone === "error"
                ? "bg-error-50 text-error-600"
                : banner.tone === "success"
                  ? "bg-success-50 text-success-600"
                  : "bg-blue-light-50 text-blue-light-600"
            }`}
          >
            {banner.message}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {[
            ["Total Campaigns", summary.totalCampaigns],
            ["Drafts", summary.drafts],
            ["Sending", summary.sending],
            ["Completed", summary.completed],
            ["Failed", summary.failed],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {label}
              </div>
              <div className="mt-3 text-3xl font-semibold text-gray-800 dark:text-white/90">{value}</div>
            </div>
          ))}
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-col gap-3 md:flex-row">
              <InputField
                placeholder="Search campaign name, subject, or sender email"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
              <select
                className={`${selectClassName} min-w-[180px]`}
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                {["Draft", "Sending", "Completed", "Failed", "Cancelled"].map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-2xl bg-blue-light-50 px-4 py-3 text-sm text-blue-light-700 dark:bg-blue-light-500/10">
              Emails are sent one by one with delay to reduce spam risk and server throttling.
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <th className="px-3 py-3 font-medium">Campaign</th>
                  <th className="px-3 py-3 font-medium">Sender</th>
                  <th className="px-3 py-3 font-medium">Recipients</th>
                  <th className="px-3 py-3 font-medium">Delivery</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Created</th>
                  <th className="px-3 py-3 font-medium">Last Activity</th>
                  <th className="px-3 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                      Loading campaigns...
                    </td>
                  </tr>
                ) : campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                      No campaigns yet. Create a draft to start sending delayed outreach to CRM leads.
                    </td>
                  </tr>
                ) : (
                  campaigns.map((campaign) => (
                    <tr key={campaign.id} className="border-b border-gray-100 last:border-b-0 dark:border-gray-800">
                      <td className="px-3 py-4">
                        <div className="font-semibold text-gray-800 dark:text-white/90">{campaign.name}</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{campaign.subject}</div>
                        {campaign.segmentName ? (
                          <div className="mt-1 text-xs text-blue-light-600 dark:text-blue-light-300">Segment: {campaign.segmentName}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-4 text-gray-700 dark:text-gray-300">
                        {campaign.senderEmail || "No sender"}
                      </td>
                      <td className="px-3 py-4 text-gray-700 dark:text-gray-300">
                        <div>{campaign.totalRecipients || campaign.recipientCount}</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Delay: {campaign.delaySeconds}s
                        </div>
                      </td>
                      <td className="px-3 py-4 text-gray-700 dark:text-gray-300">
                        <div>Sent: {campaign.sentCount}</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Failed: {campaign.failedCount} · Skipped: {campaign.skippedCount}
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <Badge color={getStatusBadgeColor(campaign.status)} size="sm">
                          {campaign.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-4 text-gray-700 dark:text-gray-300">
                        {formatDateTime(campaign.createdAt)}
                      </td>
                      <td className="px-3 py-4 text-gray-700 dark:text-gray-300">
                        {formatDateTime(campaign.lastActivityAt || campaign.updatedAt)}
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setDetailRecipientPage(1);
                              void openCampaignDetails(campaign.id);
                            }}
                          >
                            View
                          </Button>
                          {campaign.status === "Draft" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setComposerCampaign(campaign);
                                setIsComposerOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              try {
                                setWorkingCampaignId(campaign.id);
                                const duplicated = await duplicateCampaign(campaign.id);
                                showBanner("success", "Campaign duplicated successfully.");
                                setComposerCampaign(duplicated);
                                setIsComposerOpen(true);
                                await loadCampaigns();
                              } catch (error) {
                                showBanner("error", readErrorMessage(error, "Failed to duplicate campaign."));
                              } finally {
                                setWorkingCampaignId(null);
                              }
                            }}
                          >
                            Duplicate
                          </Button>
                          {campaign.status === "Draft" ? (
                            <Button
                              type="button"
                              size="sm"
                            onClick={() => void openSendConfirmation(campaign)}
                              disabled={workingCampaignId === campaign.id}
                            >
                              Start Sending
                            </Button>
                          ) : null}
                          {campaign.status === "Sending" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  setWorkingCampaignId(campaign.id);
                                  await cancelCampaign(campaign.id);
                                  showBanner("success", "Campaign cancellation requested.");
                                  await loadCampaigns();
                                  if (detailCampaign?.id === campaign.id) {
                                    await openCampaignDetails(campaign.id, true);
                                  }
                                } catch (error) {
                                  showBanner("error", readErrorMessage(error, "Failed to cancel campaign."));
                                } finally {
                                  setWorkingCampaignId(null);
                                }
                              }}
                            >
                              Cancel
                            </Button>
                          ) : null}
                          {campaign.status !== "Sending" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  setWorkingCampaignId(campaign.id);
                                  await deleteCampaign(campaign.id);
                                  showBanner("success", "Campaign deleted successfully.");
                                  await loadCampaigns();
                                } catch (error) {
                                  showBanner("error", readErrorMessage(error, "Failed to delete campaign."));
                                } finally {
                                  setWorkingCampaignId(null);
                                }
                              }}
                            >
                              Delete
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
              <span>Rows per page</span>
              <select
                className={selectClassName}
                value={limit}
                onChange={(event) => {
                  setLimit(Number(event.target.value));
                  setPage(1);
                }}
              >
                {[10, 20, 50].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Badge size="sm" color="light">
                Page {page} of {Math.max(totalPages, 1)}
              </Badge>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPage((current) => Math.min(Math.max(totalPages, 1), current + 1))}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>

      <CampaignComposerModal
        isOpen={isComposerOpen}
        initialCampaign={composerCampaign}
        onClose={() => {
          setIsComposerOpen(false);
          setComposerCampaign(null);
        }}
        onSaved={(campaign) => {
          showBanner(
            "success",
            composerCampaign ? "Campaign draft updated successfully." : "Campaign draft created successfully."
          );
          setComposerCampaign(campaign);
          void loadCampaigns();
        }}
      />

      <Modal
        isOpen={Boolean(sendConfirmCampaign)}
        onClose={() => {
          setSendConfirmCampaign(null);
          setSendPreview(null);
        }}
        className="max-w-3xl p-6 lg:p-8"
      >
        {sendConfirmCampaign ? (
          <div className="space-y-6">
            <div>
              <h3 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Confirm Campaign Send</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Review the sender, recipient count, delay, and subject before starting the background send.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Sender</div>
                <div className="mt-2 font-semibold text-gray-800 dark:text-white/90">{sendConfirmCampaign.senderEmail}</div>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Recipients</div>
                <div className="mt-2 font-semibold text-gray-800 dark:text-white/90">{sendConfirmCampaign.totalRecipients}</div>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Delay</div>
                <div className="mt-2 font-semibold text-gray-800 dark:text-white/90">{sendConfirmCampaign.delaySeconds} seconds</div>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Estimated Duration</div>
                <div className="mt-2 font-semibold text-gray-800 dark:text-white/90">
                  {formatDuration(sendConfirmCampaign.totalRecipients, sendConfirmCampaign.delaySeconds)}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Subject Preview</div>
              <div className="mt-2 font-semibold text-gray-800 dark:text-white/90">{sendConfirmCampaign.subject}</div>
            </div>

            {sendPreview ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Sendable", sendPreview.sendableLeads],
                  ["Blocked", sendPreview.blockedLeads],
                  ["Invalid Email", sendPreview.invalidEmailLeads],
                  ["Unsubscribed", sendPreview.unsubscribedLeads],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
                    <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
                    <div className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSendConfirmCampaign(null);
                  setSendPreview(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={workingCampaignId === sendConfirmCampaign.id}
                onClick={async () => {
                  try {
                    setWorkingCampaignId(sendConfirmCampaign.id);
                    await sendCampaign(sendConfirmCampaign.id);
                    setSendConfirmCampaign(null);
                    setSendPreview(null);
                    showBanner("success", "Campaign sending started. Delivery progress will update automatically.");
                    await loadCampaigns();
                  } catch (error) {
                    showBanner("error", readErrorMessage(error, "Failed to send campaign."));
                  } finally {
                    setWorkingCampaignId(null);
                  }
                }}
              >
                {workingCampaignId === sendConfirmCampaign.id ? "Starting..." : "Start Sending"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={Boolean(detailCampaignId)}
        onClose={closeDetailModal}
        className="max-w-6xl p-6 lg:p-8"
      >
        {detailCampaign ? (
          <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-2xl font-semibold text-gray-800 dark:text-white/90">{detailCampaign.name}</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Sender: {detailCampaign.senderEmail || "Not set"} · Created {formatDateTime(detailCampaign.createdAt)}
                </p>
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Unsubscribe protection: {detailCampaign.unsubscribeRequired === false ? "Optional" : "Enabled"}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 pr-12 sm:pr-14">
                <Badge color={getStatusBadgeColor(detailCampaign.status)} size="sm">
                  {detailCampaign.status}
                </Badge>
                {detailCampaign.status === "Draft" ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void openSendConfirmation(detailCampaign)}
                    disabled={workingCampaignId === detailCampaign.id}
                  >
                    Start Sending
                  </Button>
                ) : null}
                {detailCampaign.status === "Draft" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setComposerCampaign(detailCampaign);
                      setIsComposerOpen(true);
                    }}
                  >
                    Edit Draft
                  </Button>
                ) : null}
              </div>
            </div>

            {loadingDetail ? (
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                Loading campaign details...
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["Total", detailSummary.total],
                    ["Sent", detailSummary.sent],
                    ["Failed", detailSummary.failed],
                    ["Pending", detailSummary.pending + detailSummary.sending],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                      <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
                      <div className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-gray-800 dark:text-white/90">Progress</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {detailSummary.total > 0
                        ? `${Math.round(((detailSummary.sent + detailSummary.failed + detailSummary.skipped) / detailSummary.total) * 100)}%`
                        : "0%"}
                    </div>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{
                        width: detailSummary.total
                          ? `${((detailSummary.sent + detailSummary.failed + detailSummary.skipped) / detailSummary.total) * 100}%`
                          : "0%",
                      }}
                    />
                  </div>
                </div>

                {detailTrackingOverview || detailAudiencePreview ? (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {[
                      ["Blocked", detailAudiencePreview?.blockedLeads ?? 0],
                      ["Opened", detailTrackingOverview?.openedUnique ?? 0],
                      ["Clicked", detailTrackingOverview?.clickedUnique ?? 0],
                      ["Unsubscribed", detailTrackingOverview?.unsubscribed ?? 0],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
                        <div className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</div>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                  <div className="space-y-4">
                    <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
                      <div className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">Email Preview</div>
                      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
                        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Subject</div>
                        <div className="mt-2 font-semibold text-gray-800 dark:text-white/90">{renderedDetailSubject}</div>
                      </div>
                      <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
                        {detailCampaign.bodyMode === "html" ? (
                          <div
                            className="prose prose-sm max-w-none text-gray-700 dark:prose-invert dark:text-gray-200"
                            dangerouslySetInnerHTML={{ __html: renderedDetailBody || "<p>No preview available.</p>" }}
                          />
                        ) : (
                          <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 dark:text-gray-200">
                            {renderedDetailBody || "No preview available."}
                          </pre>
                        )}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
                      <div className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">Send Test Email</div>
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                        <InputField
                          type="email"
                          placeholder="Enter test email address"
                          value={testEmail}
                          onChange={(event) => setTestEmail(event.target.value)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={async () => {
                            try {
                              setWorkingCampaignId(detailCampaign.id);
                              await sendTestCampaign(detailCampaign.id, { email: testEmail });
                              showBanner("success", "Test email sent successfully.");
                            } catch (error) {
                              showBanner("error", readErrorMessage(error, "Failed to send test email."));
                            } finally {
                              setWorkingCampaignId(null);
                            }
                          }}
                          disabled={workingCampaignId === detailCampaign.id}
                        >
                          Send Test
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="text-sm font-semibold text-gray-800 dark:text-white/90">Recipient Delivery Status</div>
                          <div className="relative">
                            <button
                              type="button"
                              className="dropdown-toggle inline-flex h-9 items-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/[0.05]"
                              onClick={() => setIsExportMenuOpen((current) => !current)}
                              disabled={Boolean(exportingFormat)}
                            >
                              {exportingFormat ? `Exporting ${exportingFormat.toUpperCase()}...` : "Export"}
                            </button>
                            <Dropdown
                              isOpen={isExportMenuOpen}
                              onClose={() => setIsExportMenuOpen(false)}
                              className="w-44 p-1"
                            >
                              <DropdownItem
                                onClick={() => void handleExportRecipients("csv")}
                                onItemClick={() => setIsExportMenuOpen(false)}
                              >
                                Export CSV
                              </DropdownItem>
                              <DropdownItem
                                onClick={() => void handleExportRecipients("xlsx")}
                                onItemClick={() => setIsExportMenuOpen(false)}
                              >
                                Export XLSX
                              </DropdownItem>
                            </Dropdown>
                          </div>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Delay {detailCampaign.delaySeconds}s · Est. {formatDuration(detailCampaign.totalRecipients, detailCampaign.delaySeconds)}
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-800 dark:text-gray-400">
                              <th className="px-3 py-2 font-medium">Recipient</th>
                              <th className="px-3 py-2 font-medium">Email</th>
                              <th className="px-3 py-2 font-medium">Status</th>
                              <th className="px-3 py-2 font-medium">Opens</th>
                              <th className="px-3 py-2 font-medium">Clicks</th>
                              <th className="px-3 py-2 font-medium">Sent At</th>
                              <th className="px-3 py-2 font-medium">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detailRecipients.length === 0 ? (
                              <tr>
                                <td className="px-3 py-6 text-gray-500 dark:text-gray-400" colSpan={7}>
                                  No recipients found for this campaign.
                                </td>
                              </tr>
                            ) : (
                              detailRecipients.map((recipient) => (
                                <tr key={recipient.id} className="border-b border-gray-100 last:border-b-0 dark:border-gray-800">
                                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                                    {[recipient.firstName, recipient.lastName].filter(Boolean).join(" ") || recipient.companyName || "Lead"}
                                    {recipient.errorMessage ? (
                                      <div className="mt-1 text-xs text-error-600">{recipient.errorMessage}</div>
                                    ) : null}
                                  </td>
                                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{recipient.email}</td>
                                  <td className="px-3 py-2">
                                    <Badge color={getStatusBadgeColor(recipient.status)} size="sm">
                                      {recipient.status}
                                    </Badge>
                                  </td>
                                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{recipient.openCount ?? 0}</td>
                                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{recipient.clickCount ?? 0}</td>
                                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{formatDateTime(recipient.sentAt)}</td>
                                  <td className="px-3 py-2">
                                    <div className="flex flex-wrap gap-2">
                                      {recipient.status === "failed" && detailCampaign.status !== "Sending" ? (
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={() => void handleResendRecipient(recipient)}
                                          disabled={workingRecipientId === recipient.id}
                                        >
                                          {workingRecipientId === recipient.id ? "Resending..." : "Resend"}
                                        </Button>
                                      ) : null}
                                      <Button type="button" size="sm" variant="outline" onClick={() => void handleRecipientAction(recipient, "replied")}>
                                        Replied
                                      </Button>
                                      <Button type="button" size="sm" variant="outline" onClick={() => void handleRecipientAction(recipient, "bounced")}>
                                        Bounced
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Page {detailRecipientPage} of {Math.max(detailRecipientTotalPages, 1)}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setDetailRecipientPage((current) => Math.max(1, current - 1))}
                            disabled={detailRecipientPage <= 1}
                          >
                            Previous
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setDetailRecipientPage((current) => Math.min(Math.max(detailRecipientTotalPages, 1), current + 1))
                            }
                            disabled={detailRecipientPage >= detailRecipientTotalPages}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                  <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
                    <div className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">Recent Events</div>
                    <div className="space-y-3">
                      {detailEvents.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                          No tracking events yet.
                        </div>
                      ) : (
                        detailEvents.map((event) => (
                          <div key={event.id} className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
                            <div className="flex items-center justify-between gap-3">
                              <div className="font-medium text-gray-800 dark:text-white/90">{event.eventType}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(event.createdAt)}</div>
                            </div>
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              {event.email || "Unknown recipient"} · {event.eventSource}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
                    <div className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">Recent Clicks</div>
                    <div className="space-y-3">
                      {detailClicks.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                          No tracked clicks yet.
                        </div>
                      ) : (
                        detailClicks.map((click) => (
                          <div key={click.id} className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
                            <div className="font-medium text-gray-800 dark:text-white/90 break-all">{click.originalUrl}</div>
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatDateTime(click.clickedAt)}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
