import { useEffect, useMemo, useState } from "react";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
import Badge from "../../components/ui/badge/Badge";
import Button from "../../components/ui/button/Button";
import ProductSearchBar from "../Products/ProductSearchBar";
import {
  fetchUserSupportTicket,
  fetchUserSupportTickets,
  fetchVendorSupportTicket,
  fetchVendorSupportTickets,
  sendUserSupportReply,
  sendVendorSupportReply,
  updateUserSupportTicketStatus,
  updateVendorSupportTicketStatus,
  type UserSupportAttachment,
  type UserSupportEvent,
  type UserSupportTicket,
  type VendorSupportTicket,
  type VendorSupportTicketMessage,
  type VendorTicketStatus,
} from "../../services/adminSupport.service";

type SupportChannel = "vendor" | "user";
type SupportTicketStatusFilter = "all" | "open" | "resolved" | "closed";

const PAGE_SIZE = 10;

const Support = () => {
  const [activeChannel, setActiveChannel] = useState<SupportChannel>("vendor");
  const [vendorTickets, setVendorTickets] = useState<VendorSupportTicket[]>([]);
  const [userTickets, setUserTickets] = useState<UserSupportTicket[]>([]);
  const [vendorError, setVendorError] = useState<string | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [isLoadingVendorTickets, setIsLoadingVendorTickets] = useState(true);
  const [isLoadingUserTickets, setIsLoadingUserTickets] = useState(true);
  const [selectedVendorTicket, setSelectedVendorTicket] = useState<{
    ticket: VendorSupportTicket;
    messages: VendorSupportTicketMessage[];
  } | null>(null);
  const [selectedUserTicket, setSelectedUserTicket] =
    useState<UserSupportTicket | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<SupportTicketStatusFilter>("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const loadVendorTickets = async () => {
      try {
        setIsLoadingVendorTickets(true);
        setVendorError(null);
        setVendorTickets(await fetchVendorSupportTickets());
      } catch (error) {
        setVendorError(
          error instanceof Error
            ? error.message
            : "Failed to load vendor support tickets."
        );
      } finally {
        setIsLoadingVendorTickets(false);
      }
    };

    const loadUserTickets = async () => {
      try {
        setIsLoadingUserTickets(true);
        setUserError(null);
        setUserTickets(await fetchUserSupportTickets());
      } catch (error) {
        setUserError(
          error instanceof Error
            ? error.message
            : "Failed to load user support tickets."
        );
      } finally {
        setIsLoadingUserTickets(false);
      }
    };

    void loadVendorTickets();
    void loadUserTickets();
  }, []);

  useEffect(() => {
    setSelectedTicketId(null);
    setSelectedVendorTicket(null);
    setSelectedUserTicket(null);
    setDetailError(null);
    setReplyDraft("");
    setActionMessage(null);
    setPage(1);
  }, [activeChannel]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    const loadDetail = async () => {
      if (!selectedTicketId) {
        return;
      }

      try {
        setIsLoadingDetail(true);
        setDetailError(null);
        setReplyDraft("");
        setActionMessage(null);

        if (activeChannel === "vendor") {
          setSelectedVendorTicket(await fetchVendorSupportTicket(selectedTicketId));
          setSelectedUserTicket(null);
        } else {
          setSelectedUserTicket(await fetchUserSupportTicket(selectedTicketId));
          setSelectedVendorTicket(null);
        }
      } catch (error) {
        setDetailError(
          error instanceof Error
            ? error.message
            : "Failed to load ticket details."
        );
      } finally {
        setIsLoadingDetail(false);
      }
    };

    void loadDetail();
  }, [activeChannel, selectedTicketId]);

  const activeTickets = activeChannel === "vendor" ? vendorTickets : userTickets;
  const isLoadingTickets =
    activeChannel === "vendor" ? isLoadingVendorTickets : isLoadingUserTickets;
  const ticketError = activeChannel === "vendor" ? vendorError : userError;

  const filteredTickets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return activeTickets.filter((ticket) => {
      const normalizedStatus =
        activeChannel === "vendor"
          ? normalizeVendorStatus(ticket.status as VendorTicketStatus)
          : normalizeUserStatus(ticket.status);

      if (statusFilter !== "all" && normalizedStatus !== statusFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchableValues =
        activeChannel === "vendor"
          ? [
              (ticket as VendorSupportTicket).ticketCode,
              ticket.category,
              ticket.description,
              (ticket as VendorSupportTicket).vendor?.businessName,
              (ticket as VendorSupportTicket).vendor?.email,
              ticket.status,
            ]
          : [
              (ticket as UserSupportTicket).ticketNumber,
              (ticket as UserSupportTicket).subject,
              ticket.category,
              ticket.description,
              (ticket as UserSupportTicket).user?.fullName,
              (ticket as UserSupportTicket).user?.email,
              ticket.status,
              (ticket as UserSupportTicket).source,
            ];

      return searchableValues
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [activeChannel, activeTickets, searchQuery, statusFilter]);

  const paginatedTickets = useMemo(
    () =>
      filteredTickets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredTickets, page]
  );

  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const stats = useMemo(() => {
    const counts = {
      total: activeTickets.length,
      open: 0,
      resolved: 0,
      closed: 0,
    };

    activeTickets.forEach((ticket) => {
      const normalizedStatus =
        activeChannel === "vendor"
          ? normalizeVendorStatus(ticket.status as VendorTicketStatus)
          : normalizeUserStatus(ticket.status);

      counts[normalizedStatus] += 1;
    });

    return counts;
  }, [activeChannel, activeTickets]);

  const detailMeta = useMemo(() => {
    if (activeChannel === "vendor" && selectedVendorTicket) {
      return {
        title: selectedVendorTicket.ticket.ticketCode,
        subtitle:
          selectedVendorTicket.ticket.vendor?.businessName ||
          selectedVendorTicket.ticket.vendor?.email ||
          selectedVendorTicket.ticket.vendorId,
        status: selectedVendorTicket.ticket.status,
      };
    }

    if (activeChannel === "user" && selectedUserTicket) {
      return {
        title: selectedUserTicket.ticketNumber,
        subtitle:
          selectedUserTicket.user?.fullName ||
          selectedUserTicket.user?.email ||
          "Registered user",
        status: selectedUserTicket.status,
      };
    }

    return null;
  }, [activeChannel, selectedUserTicket, selectedVendorTicket]);

  const canReply = useMemo(() => {
    if (activeChannel === "vendor" && selectedVendorTicket) {
      return selectedVendorTicket.ticket.status === "Open";
    }

    if (activeChannel === "user" && selectedUserTicket) {
      return normalizeUserStatus(selectedUserTicket.status) === "open";
    }

    return false;
  }, [activeChannel, selectedUserTicket, selectedVendorTicket]);

  const handleRefresh = async () => {
    try {
      setActionMessage(null);
      if (activeChannel === "vendor") {
        setVendorTickets(await fetchVendorSupportTickets());
      } else {
        setUserTickets(await fetchUserSupportTickets());
      }
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : "Failed to refresh tickets."
      );
    }
  };

  const handleSendReply = async () => {
    const message = replyDraft.trim();
    if (!selectedTicketId || !message) {
      return;
    }

    try {
      setIsSendingReply(true);
      setDetailError(null);
      setActionMessage(null);

      if (activeChannel === "vendor") {
        await sendVendorSupportReply(selectedTicketId, message);
        setSelectedVendorTicket(await fetchVendorSupportTicket(selectedTicketId));
        setVendorTickets(await fetchVendorSupportTickets());
      } else {
        await sendUserSupportReply(selectedTicketId, message);
        setSelectedUserTicket(await fetchUserSupportTicket(selectedTicketId));
        setUserTickets(await fetchUserSupportTickets());
      }

      setReplyDraft("");
      setActionMessage("Reply sent successfully.");
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : "Failed to send reply."
      );
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleUpdateStatus = async (nextStatus: "resolved" | "closed") => {
    if (!selectedTicketId) {
      return;
    }

    try {
      setIsUpdatingStatus(true);
      setDetailError(null);
      setActionMessage(null);

      if (activeChannel === "vendor") {
        const mappedStatus: VendorTicketStatus =
          nextStatus === "resolved" ? "Resolved" : "Closed";
        await updateVendorSupportTicketStatus(selectedTicketId, mappedStatus);
        setSelectedVendorTicket(await fetchVendorSupportTicket(selectedTicketId));
        setVendorTickets(await fetchVendorSupportTickets());
      } else {
        await updateUserSupportTicketStatus(selectedTicketId, nextStatus);
        setSelectedUserTicket(await fetchUserSupportTicket(selectedTicketId));
        setUserTickets(await fetchUserSupportTickets());
      }

      setActionMessage(
        `Ticket marked as ${nextStatus === "resolved" ? "resolved" : "closed"}.`
      );
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : "Failed to update ticket status."
      );
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  return (
    <>
      <PageMeta
        title="Support | ITMart24 Admin"
        description="Manage vendor and user support tickets from one professional workspace."
      />

      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatsCard
            title="Active channel"
            value={activeChannel === "vendor" ? "Vendor Support" : "User Support"}
            description="Switch between marketplace-side and demand-side ticket queues."
          />
          <StatsCard
            title="Total tickets"
            value={stats.total}
            description="Current workload for the selected support channel."
          />
          <StatsCard
            title="Open tickets"
            value={stats.open}
            description="Tickets that still need action or a follow-up reply."
          />
          <StatsCard
            title="Resolved / Closed"
            value={`${stats.resolved} / ${stats.closed}`}
            description="Completed support outcomes for the selected queue."
          />
        </section>

        <ComponentCard
          title="Support Workspace"
          desc="Manage vendor and demand-side support from a cleaner shared operations view."
        >
          <div className="space-y-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap gap-2">
                <ChannelButton
                  isActive={activeChannel === "vendor"}
                  label="Vendor support"
                  count={vendorTickets.length}
                  onClick={() => setActiveChannel("vendor")}
                />
                <ChannelButton
                  isActive={activeChannel === "user"}
                  label="User support"
                  count={userTickets.length}
                  onClick={() => setActiveChannel("user")}
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <ProductSearchBar
                  id="support-search"
                  value={searchQuery}
                  onChange={setSearchQuery}
                  label="Search support tickets"
                  placeholder={
                    activeChannel === "vendor"
                      ? "Search by ticket, vendor, email, category, or status"
                      : "Search by ticket, user, subject, category, source, or status"
                  }
                />

                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as SupportTicketStatusFilter)
                  }
                  className={filterClassName}
                >
                  <option value="all">All statuses</option>
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            </div>

            {ticketError ? (
              <InlineNotice tone="error">{ticketError}</InlineNotice>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr),minmax(360px,0.9fr)]">
              <section className="rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900/60">
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                      Ticket Queue
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {filteredTickets.length} matching ticket
                      {filteredTickets.length === 1 ? "" : "s"}.
                    </p>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleRefresh}
                  >
                    Refresh
                  </Button>
                </div>

                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {isLoadingTickets ? (
                    <EmptyState label="Loading support tickets..." />
                  ) : paginatedTickets.length === 0 ? (
                    <EmptyState label="No support tickets match the current filters." />
                  ) : (
                    paginatedTickets.map((ticket) => {
                      const isSelected = selectedTicketId === ticket.id;
                      return (
                        <button
                          key={ticket.id}
                          type="button"
                          onClick={() => setSelectedTicketId(ticket.id)}
                          className={`w-full px-5 py-4 text-left transition ${
                            isSelected
                              ? "bg-brand-50/70 dark:bg-brand-500/10"
                              : "hover:bg-gray-50 dark:hover:bg-gray-800/40"
                          }`}
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                  {activeChannel === "vendor"
                                    ? (ticket as VendorSupportTicket).ticketCode
                                    : (ticket as UserSupportTicket).ticketNumber}
                                </p>
                                <StatusBadge
                                  channel={activeChannel}
                                  status={ticket.status}
                                />
                                {activeChannel === "vendor" &&
                                (ticket as VendorSupportTicket).attachment ? (
                                  <Badge size="sm" color="info">
                                    Attachment
                                  </Badge>
                                ) : null}
                                {activeChannel === "user" &&
                                (ticket as UserSupportTicket).source !== "portal" ? (
                                  <Badge size="sm" color="warning">
                                    {(ticket as UserSupportTicket).source}
                                  </Badge>
                                ) : null}
                              </div>

                              <p className="text-sm text-gray-700 dark:text-gray-200">
                                {activeChannel === "vendor"
                                  ? (ticket as VendorSupportTicket).vendor?.businessName ||
                                    (ticket as VendorSupportTicket).vendor?.email ||
                                    "Unknown vendor"
                                  : (ticket as UserSupportTicket).subject}
                              </p>

                              <p className="line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
                                {ticket.description || "No description available."}
                              </p>
                            </div>

                            <div className="space-y-1 text-sm text-gray-500 dark:text-gray-400 lg:min-w-[170px] lg:text-right">
                              <p>{ticket.category}</p>
                              <p>{formatDateTime(ticket.updatedAt)}</p>
                              <p className="text-xs">
                                {activeChannel === "vendor"
                                  ? (ticket as VendorSupportTicket).vendor?.email ||
                                    (ticket as VendorSupportTicket).vendorId
                                  : (ticket as UserSupportTicket).user?.email ||
                                    "No email"}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4 dark:border-gray-800">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {filteredTickets.length === 0
                      ? "0 results"
                      : `${(page - 1) * PAGE_SIZE + 1}-${Math.min(
                          page * PAGE_SIZE,
                          filteredTickets.length
                        )} of ${filteredTickets.length}`}
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      disabled={page === 1}
                      className={pagerButtonClassName}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPage((current) => Math.min(totalPages, current + 1))
                      }
                      disabled={page === totalPages}
                      className={pagerButtonClassName}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900/60">
                <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                        Ticket Details
                      </h3>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Review the conversation, context, and next action in one place.
                      </p>
                    </div>

                    {detailMeta ? (
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {detailMeta.title}
                        </p>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          {detailMeta.subtitle}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {detailMeta ? (
                    <div className="mt-3">
                      <StatusBadge
                        channel={activeChannel}
                        status={detailMeta.status}
                      />
                    </div>
                  ) : null}

                  {actionMessage ? (
                    <div className="mt-4">
                      <InlineNotice tone="success">{actionMessage}</InlineNotice>
                    </div>
                  ) : null}
                  {detailError ? (
                    <div className="mt-4">
                      <InlineNotice tone="error">{detailError}</InlineNotice>
                    </div>
                  ) : null}
                </div>

                {isLoadingDetail ? (
                  <EmptyState label="Loading ticket details..." />
                ) : !selectedTicketId ? (
                  <EmptyState label="Select a ticket to open the conversation and details." />
                ) : activeChannel === "vendor" && selectedVendorTicket ? (
                  <VendorDetailPanel
                    ticket={selectedVendorTicket.ticket}
                    messages={selectedVendorTicket.messages}
                    replyDraft={replyDraft}
                    onReplyChange={setReplyDraft}
                    onSendReply={handleSendReply}
                    onResolve={() => handleUpdateStatus("resolved")}
                    onClose={() => handleUpdateStatus("closed")}
                    isSendingReply={isSendingReply}
                    isUpdatingStatus={isUpdatingStatus}
                    canReply={canReply}
                  />
                ) : activeChannel === "user" && selectedUserTicket ? (
                  <UserDetailPanel
                    ticket={selectedUserTicket}
                    replyDraft={replyDraft}
                    onReplyChange={setReplyDraft}
                    onSendReply={handleSendReply}
                    onResolve={() => handleUpdateStatus("resolved")}
                    onClose={() => handleUpdateStatus("closed")}
                    isSendingReply={isSendingReply}
                    isUpdatingStatus={isUpdatingStatus}
                    canReply={canReply}
                  />
                ) : (
                  <EmptyState label="Ticket details are unavailable right now." />
                )}
              </section>
            </div>
          </div>
        </ComponentCard>
      </div>
    </>
  );
};

const VendorDetailPanel = ({
  ticket,
  messages,
  replyDraft,
  onReplyChange,
  onSendReply,
  onResolve,
  onClose,
  isSendingReply,
  isUpdatingStatus,
  canReply,
}: {
  ticket: VendorSupportTicket;
  messages: VendorSupportTicketMessage[];
  replyDraft: string;
  onReplyChange: (value: string) => void;
  onSendReply: () => void;
  onResolve: () => void;
  onClose: () => void;
  isSendingReply: boolean;
  isUpdatingStatus: boolean;
  canReply: boolean;
}) => {
  const thread = [
    {
      id: `original-${ticket.id}`,
      senderRole: "vendor" as const,
      senderId: ticket.vendorId,
      message: ticket.description,
      createdAt: ticket.createdAt,
      isOriginal: true,
    },
    ...messages.map((message) => ({
      ...message,
      isOriginal: false,
    })),
  ];

  return (
    <DetailLayout
      primaryMeta={[
        ["Vendor", ticket.vendor?.businessName || "Unknown vendor"],
        ["Email", ticket.vendor?.email || ticket.vendor?.contactEmail || ticket.vendorId],
        ["Category", ticket.category],
        ["Updated", formatDateTime(ticket.updatedAt)],
      ]}
      secondaryMeta={[
        ["Ticket ID", ticket.id],
        ["Created", formatDateTime(ticket.createdAt)],
        ["Country", ticket.vendor?.country || "-"],
        ["Website", ticket.vendor?.website || "-"],
      ]}
      attachments={
        ticket.attachment
          ? [
              {
                key: ticket.attachment.url,
                label: ticket.attachment.originalName || "Attachment",
                href: ticket.attachment.url,
                meta: `${formatBytes(ticket.attachment.size)} • ${
                  ticket.attachment.mimeType || "file"
                }`,
              },
            ]
          : []
      }
      conversation={thread.map((message) => ({
        id: message.id,
        speaker:
          message.senderRole === "support"
            ? "Support Team"
            : ticket.vendor?.businessName || "Vendor",
        role: message.senderRole,
        message: message.message,
        createdAt: message.createdAt,
        badge: message.isOriginal ? "Original message" : null,
      }))}
      replyDraft={replyDraft}
      onReplyChange={onReplyChange}
      onSendReply={onSendReply}
      onResolve={onResolve}
      onClose={onClose}
      isSendingReply={isSendingReply}
      isUpdatingStatus={isUpdatingStatus}
      canReply={canReply}
    />
  );
};

const UserDetailPanel = ({
  ticket,
  replyDraft,
  onReplyChange,
  onSendReply,
  onResolve,
  onClose,
  isSendingReply,
  isUpdatingStatus,
  canReply,
}: {
  ticket: UserSupportTicket;
  replyDraft: string;
  onReplyChange: (value: string) => void;
  onSendReply: () => void;
  onResolve: () => void;
  onClose: () => void;
  isSendingReply: boolean;
  isUpdatingStatus: boolean;
  canReply: boolean;
}) => {
  const conversation = (ticket.messages ?? []).map((message) => ({
    id: message.id,
    speaker:
      message.senderType === "support"
        ? "Support Team"
        : ticket.user?.fullName || ticket.user?.email || "User",
    role: (message.senderType === "support" ? "support" : "vendor") as
      | "support"
      | "vendor",
    message: message.message,
    createdAt: message.createdAt,
    badge: message.messageType !== "message" ? message.messageType : null,
  }));

  return (
    <DetailLayout
      primaryMeta={[
        ["User", ticket.user?.fullName || "Registered user"],
        ["Email", ticket.user?.email || "-"],
        ["Subject", ticket.subject],
        ["Category", ticket.category],
      ]}
      secondaryMeta={[
        ["Source", ticket.source || "portal"],
        ["Priority", ticket.priority || "-"],
        ["Conversation", humanizeSupportValue(ticket.conversationStatus)],
        ["Updated", formatDateTime(ticket.updatedAt)],
      ]}
      attachments={(ticket.attachments ?? []).map((attachment) =>
        mapUserAttachmentToCard(attachment)
      )}
      conversation={conversation}
      events={ticket.events ?? []}
      replyDraft={replyDraft}
      onReplyChange={onReplyChange}
      onSendReply={onSendReply}
      onResolve={onResolve}
      onClose={onClose}
      isSendingReply={isSendingReply}
      isUpdatingStatus={isUpdatingStatus}
      canReply={canReply}
    />
  );
};

const DetailLayout = ({
  primaryMeta,
  secondaryMeta,
  attachments,
  conversation,
  events = [],
  replyDraft,
  onReplyChange,
  onSendReply,
  onResolve,
  onClose,
  isSendingReply,
  isUpdatingStatus,
  canReply,
}: {
  primaryMeta: Array<[string, string]>;
  secondaryMeta: Array<[string, string]>;
  attachments: Array<{ key: string; label: string; href: string; meta: string }>;
  conversation: Array<{
    id: string;
    speaker: string;
    role: "vendor" | "support";
    message: string;
    createdAt: string | null;
    badge: string | null;
  }>;
  events?: UserSupportEvent[];
  replyDraft: string;
  onReplyChange: (value: string) => void;
  onSendReply: () => void;
  onResolve: () => void;
  onClose: () => void;
  isSendingReply: boolean;
  isUpdatingStatus: boolean;
  canReply: boolean;
}) => (
  <div className="space-y-6 px-5 py-5">
    <div className="grid gap-4 xl:grid-cols-2">
      <MetaCard title="Profile & Ticket" items={primaryMeta} />
      <MetaCard title="Operational Details" items={secondaryMeta} />
    </div>

    {attachments.length > 0 ? (
      <section className="space-y-3">
        <SectionTitle title="Attachments" description="Reference files shared in this ticket." />
        <div className="space-y-3">
          {attachments.map((attachment) => (
            <a
              key={attachment.key}
              href={attachment.href}
              target="_blank"
              rel="noreferrer"
              className="block rounded-2xl border border-gray-200 px-4 py-3 text-sm transition hover:border-brand-300 hover:bg-brand-50/40 dark:border-gray-800 dark:hover:border-brand-500 dark:hover:bg-brand-500/10"
            >
              <p className="font-medium text-gray-900 dark:text-white">
                {attachment.label}
              </p>
              <p className="mt-1 text-gray-500 dark:text-gray-400">
                {attachment.meta}
              </p>
            </a>
          ))}
        </div>
      </section>
    ) : null}

    <section className="space-y-3">
      <SectionTitle
        title="Conversation"
        description="Review the full reply flow before responding."
      />
      <div className="space-y-3">
        {conversation.length === 0 ? (
          <EmptyState label="No conversation messages are available for this ticket." />
        ) : (
          conversation.map((message) => (
            <article
              key={message.id}
              className={`rounded-2xl border px-4 py-4 ${
                message.role === "support"
                  ? "border-brand-200 bg-brand-50/50 dark:border-brand-500/20 dark:bg-brand-500/10"
                  : "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/40"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {message.speaker}
                </p>
                {message.badge ? (
                  <Badge size="sm" color="info">
                    {message.badge}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-200">
                {message.message || "No message content."}
              </p>
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                {formatDateTime(message.createdAt)}
              </p>
            </article>
          ))
        )}
      </div>
    </section>

    {events.length > 0 ? (
      <section className="space-y-3">
        <SectionTitle
          title="Activity Timeline"
          description="Important ticket events recorded in the support system."
        />
        <div className="space-y-3">
          {events.map((event, index) => (
            <div
              key={`${event.eventType}-${event.createdAt}-${index}`}
              className="rounded-2xl border border-gray-200 px-4 py-3 dark:border-gray-800"
            >
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {event.eventTitle}
              </p>
              {event.eventDescription ? (
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  {event.eventDescription}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {formatDateTime(event.createdAt)}
              </p>
            </div>
          ))}
        </div>
      </section>
    ) : null}

    <section className="space-y-3">
      <SectionTitle
        title="Reply & Actions"
        description={
          canReply
            ? "Respond clearly and move the ticket to the right outcome."
            : "This ticket is closed for replies. You can still review the history above."
        }
      />

      <textarea
        value={replyDraft}
        onChange={(event) => onReplyChange(event.target.value)}
        rows={5}
        disabled={!canReply || isSendingReply}
        placeholder="Write a clear, professional reply for the customer or vendor."
        className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 shadow-theme-xs outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800"
      />

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          size="sm"
          onClick={onSendReply}
          disabled={!canReply || !replyDraft.trim() || isSendingReply}
        >
          {isSendingReply ? "Sending..." : "Send reply"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onResolve}
          disabled={!canReply || isUpdatingStatus}
        >
          {isUpdatingStatus ? "Updating..." : "Mark resolved"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onClose}
          disabled={!canReply || isUpdatingStatus}
        >
          {isUpdatingStatus ? "Updating..." : "Close ticket"}
        </Button>
      </div>
    </section>
  </div>
);

const MetaCard = ({
  title,
  items,
}: {
  title: string;
  items: Array<[string, string]>;
}) => (
  <section className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-gray-950/20">
    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
      {title}
    </h4>
    <div className="mt-4 grid gap-3">
      {items.map(([label, value]) => (
        <div key={label}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
            {label}
          </p>
          <p className="mt-1 break-words text-sm text-gray-700 dark:text-gray-200">
            {value || "-"}
          </p>
        </div>
      ))}
    </div>
  </section>
);

const SectionTitle = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => (
  <div>
    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
      {title}
    </h4>
    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
      {description}
    </p>
  </div>
);

const ChannelButton = ({
  isActive,
  label,
  count,
  onClick,
}: {
  isActive: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
      isActive
        ? "border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-500/10 dark:text-brand-300"
        : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800/40"
    }`}
  >
    {label}
    <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs dark:bg-white/10">
      {count}
    </span>
  </button>
);

const StatusBadge = ({
  channel,
  status,
}: {
  channel: SupportChannel;
  status: string;
}) => {
  const normalizedStatus =
    channel === "vendor"
      ? normalizeVendorStatus(status as VendorTicketStatus)
      : normalizeUserStatus(status);

  const color =
    normalizedStatus === "resolved"
      ? "success"
      : normalizedStatus === "closed"
        ? "light"
        : "warning";

  return (
    <Badge size="sm" color={color}>
      {normalizedStatus === "open"
        ? "Open"
        : normalizedStatus === "resolved"
          ? "Resolved"
          : "Closed"}
    </Badge>
  );
};

const StatsCard = ({
  title,
  value,
  description,
}: {
  title: string;
  value: string | number;
  description: string;
}) => (
  <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
      {title}
    </p>
    <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">
      {value}
    </p>
    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
      {description}
    </p>
  </div>
);

const InlineNotice = ({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "success" | "error";
}) => (
  <div
    className={`rounded-2xl border px-4 py-3 text-sm ${
      tone === "error"
        ? "border-error-200 bg-error-50 text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300"
        : "border-success-200 bg-success-50 text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300"
    }`}
  >
    {children}
  </div>
);

const EmptyState = ({ label }: { label: string }) => (
  <div className="px-5 py-8 text-sm text-gray-500 dark:text-gray-400">
    {label}
  </div>
);

const mapUserAttachmentToCard = (attachment: UserSupportAttachment) => ({
  key: attachment.id,
  label: attachment.fileName || "Attachment",
  href: attachment.publicUrl || "#",
  meta: `${formatBytes(attachment.fileSizeBytes)} • ${
    attachment.mimeType || "file"
  }`,
});

const normalizeVendorStatus = (status: VendorTicketStatus) => {
  if (status === "Resolved") {
    return "resolved";
  }

  if (status === "Closed") {
    return "closed";
  }

  return "open";
};

const normalizeUserStatus = (status: string) => {
  const normalized = status.trim().toLowerCase();

  if (normalized === "resolved") {
    return "resolved";
  }

  if (normalized === "closed") {
    return "closed";
  }

  return "open";
};

const humanizeSupportValue = (value: string | null | undefined) =>
  String(value ?? "-")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (segment) => segment.toUpperCase());

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
};

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${
    units[unitIndex]
  }`;
};

const filterClassName =
  "h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm text-gray-700 shadow-theme-xs outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const pagerButtonClassName =
  "rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800";

export default Support;
