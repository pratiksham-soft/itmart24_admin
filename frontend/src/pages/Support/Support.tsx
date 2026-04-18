import { useEffect, useMemo, useRef, useState } from "react";
import type { FirestoreError } from "firebase/firestore";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
import Badge from "../../components/ui/badge/Badge";
import Button from "../../components/ui/button/Button";
import { Modal } from "../../components/ui/modal";
import { MoreDotIcon } from "../../icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import ProductSearchBar from "../Products/ProductSearchBar";
import {
  type MessageSenderRole,
  type SupportTicket,
  type SupportTicketMessage,
  type TicketStatus,
  type VendorProfileSummary,
  listenToSupportTicketMessages,
  listenToSupportTickets,
  loadVendorProfiles,
  resolveSupportAgentId,
  sendSupportTicketMessage,
  updateSupportTicketStatus,
} from "../../services/supportTickets.service";

type DerivedTicketState =
  | "Awaiting Support Reply"
  | "Awaiting Vendor Reply"
  | "Resolved"
  | "Closed";

type TicketStatusFilter = "all" | TicketStatus;
type SelectedTicketTab = "conversation" | "details";

type TicketThreadMessage = {
  id: string;
  message: string;
  senderRole: MessageSenderRole;
  senderId: string;
  createdAt: Date | null;
  isOriginal?: boolean;
};

type ModalSection = {
  id: string;
  title: string;
  summary?: string;
  tab?: SelectedTicketTab;
  hiddenFromStandard?: boolean;
  renderContent: (options: { isMaximized: boolean }) => React.ReactNode;
};

const PAGE_SIZE = 12;
const MESSAGE_MAX_LENGTH = 500;

const Support = () => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [vendorProfiles, setVendorProfiles] = useState<
    Record<string, VendorProfileSummary>
  >({});
  const [isLoadingTickets, setIsLoadingTickets] = useState(true);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TicketStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] =
    useState<SelectedTicketTab>("conversation");
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const supportAgentId = useMemo(() => resolveSupportAgentId(), []);

  useEffect(() => {
    const unsubscribe = listenToSupportTickets(
      (nextTickets) => {
        setTickets(nextTickets);
        setIsLoadingTickets(false);
        setTicketError(null);
      },
      (error) => {
        setTicketError(toFirestoreErrorMessage(error));
        setIsLoadingTickets(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncVendorProfiles = async () => {
      try {
        const profiles = await loadVendorProfiles(
          tickets.map((ticket) => ticket.vendorId)
        );

        if (!cancelled) {
          setVendorProfiles(profiles);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load vendor profiles", error);
        }
      }
    };

    void syncVendorProfiles();

    return () => {
      cancelled = true;
    };
  }, [tickets]);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) ?? null,
    [selectedTicketId, tickets]
  );

  useEffect(() => {
    if (!selectedTicket?.id) {
      setMessages([]);
      setMessageError(null);
      setReplyDraft("");
      setActionMessage(null);
      return undefined;
    }

    setSelectedTab("conversation");
    setIsLoadingMessages(true);
    setMessageError(null);

    const unsubscribe = listenToSupportTicketMessages(
      selectedTicket.id,
      (nextMessages) => {
        setMessages(nextMessages);
        setIsLoadingMessages(false);
      },
      (error) => {
        setMessageError(toFirestoreErrorMessage(error));
        setIsLoadingMessages(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [selectedTicket?.id]);

  const categories = useMemo(
    () =>
      [...new Set(tickets.map((ticket) => ticket.category).filter(Boolean))].sort(
        (left, right) => left.localeCompare(right)
      ),
    [tickets]
  );
  const [categoryFilter, setCategoryFilter] = useState("all");

  useEffect(() => {
    if (
      categoryFilter !== "all" &&
      !categories.some((category) => category === categoryFilter)
    ) {
      setCategoryFilter("all");
    }
  }, [categories, categoryFilter]);

  const filteredTickets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return tickets.filter((ticket) => {
      if (statusFilter !== "all" && ticket.status !== statusFilter) {
        return false;
      }

      if (categoryFilter !== "all" && ticket.category !== categoryFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const vendor = vendorProfiles[ticket.vendorId];
      const derivedState = getDerivedTicketState(ticket);

      return [
        ticket.ticketCode,
        ticket.category,
        ticket.description,
        ticket.vendorId,
        vendor?.businessName,
        vendor?.email,
        vendor?.contactName,
        vendor?.contactEmail,
        vendor?.website,
        vendor?.country,
        ticket.status,
        derivedState,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [categoryFilter, searchQuery, statusFilter, tickets, vendorProfiles]);

  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / PAGE_SIZE));
  const paginatedTickets = filteredTickets.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, categoryFilter]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const stats = useMemo(() => {
    const total = tickets.length;
    const open = tickets.filter((ticket) => ticket.status === "Open");
    const awaitingVendor = open.filter(
      (ticket) => ticket.lastMessageSenderRole === "support"
    ).length;

    return {
      total,
      open: open.length,
      awaitingSupport: open.length - awaitingVendor,
      awaitingVendor,
      resolved: tickets.filter((ticket) => ticket.status === "Resolved").length,
      closed: tickets.filter((ticket) => ticket.status === "Closed").length,
    };
  }, [tickets]);

  const threadMessages = useMemo<TicketThreadMessage[]>(() => {
    if (!selectedTicket) {
      return [];
    }

    const originalMessage: TicketThreadMessage = {
      id: `original-${selectedTicket.id}`,
      message: selectedTicket.description,
      senderRole: "vendor",
      senderId: selectedTicket.vendorId,
      createdAt: asDate(selectedTicket.createdAt),
      isOriginal: true,
    };

    return [
      originalMessage,
      ...messages.map((message) => ({
        id: message.id,
        message: message.message,
        senderRole: message.senderRole,
        senderId: message.senderId,
        createdAt: asDate(message.createdAt),
      })),
    ];
  }, [messages, selectedTicket]);

  const handleSendReply = async () => {
    if (!selectedTicket || !replyDraft.trim()) {
      return;
    }

    try {
      setIsSendingReply(true);
      setMessageError(null);
      setActionMessage(null);

      await sendSupportTicketMessage({
        ticketDocId: selectedTicket.id,
        message: replyDraft,
        senderId: supportAgentId,
      });

      setReplyDraft("");
      setActionMessage("Reply sent successfully.");
    } catch (error) {
      setMessageError(
        error instanceof Error ? error.message : "Failed to send support reply."
      );
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleUpdateStatus = async (status: TicketStatus) => {
    if (!selectedTicket) {
      return;
    }

    try {
      setIsUpdatingStatus(true);
      setMessageError(null);
      setActionMessage(null);

      await updateSupportTicketStatus({
        ticketDocId: selectedTicket.id,
        status,
      });

      setActionMessage(`Ticket marked as ${status}.`);
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : `Failed to mark ticket as ${status}.`
      );
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  return (
    <>
      <PageMeta
        title="Support Tickets | ITMart24 Admin"
        description="Review, respond to, and resolve vendor support tickets."
      />

      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <StatsCard
            title="All tickets"
            value={stats.total}
            description="Realtime support workload across all vendors."
          />
          <StatsCard
            title="Open tickets"
            value={stats.open}
            description={`${stats.awaitingSupport} awaiting support, ${stats.awaitingVendor} awaiting vendor.`}
          />
          <StatsCard
            title="Resolved / Closed"
            value={`${stats.resolved} / ${stats.closed}`}
            description="Status changes here stay compatible with Vendor_Portal notifications."
          />
        </section>

        <ComponentCard
          title="Support"
          desc="Realtime ticket operations for the shared Vendor_Portal Firestore workspace."
        >
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <ProductSearchBar
              id="support-ticket-search"
              label="Search support tickets"
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search by ticket, vendor, category, status, or email"
            />

            <div className="flex flex-col gap-3 sm:flex-row">
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as TicketStatusFilter)
                }
                className={filterClassName}
              >
                <option value="all">All statuses</option>
                <option value="Open">Open</option>
                <option value="Resolved">Resolved</option>
                <option value="Closed">Closed</option>
              </select>

              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className={filterClassName}
              >
                <option value="all">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Replies will be sent with sender ID{" "}
              <span className="font-medium text-gray-700 dark:text-gray-200">
                {supportAgentId}
              </span>
              .
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {filteredTickets.length} matching ticket
              {filteredTickets.length === 1 ? "" : "s"}.
            </p>
          </div>

          {ticketError ? (
            <InlineNotice tone="error">{ticketError}</InlineNotice>
          ) : null}

          {isLoadingTickets ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Loading support tickets...
            </p>
          ) : filteredTickets.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {searchQuery || statusFilter !== "all" || categoryFilter !== "all"
                ? "No support tickets match the current filters."
                : "No support tickets found."}
            </p>
          ) : (
            <>
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
                <div className="max-w-full overflow-x-auto">
                  <Table>
                    <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                      <TableRow>
                        <TableCell
                          isHeader
                          className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                        >
                          Ticket
                        </TableCell>
                        <TableCell
                          isHeader
                          className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                        >
                          Vendor
                        </TableCell>
                        <TableCell
                          isHeader
                          className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                        >
                          Category
                        </TableCell>
                        <TableCell
                          isHeader
                          className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                        >
                          Updated
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
                      {paginatedTickets.map((ticket) => {
                        const vendor = vendorProfiles[ticket.vendorId];
                        const derivedState = getDerivedTicketState(ticket);

                        return (
                          <TableRow key={ticket.id}>
                            <TableCell className="px-5 py-4 text-start align-top">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-gray-800 dark:text-white/90">
                                    {ticket.ticketCode}
                                  </span>
                                  {ticket.attachment?.url ? (
                                    <Badge size="sm" color="info">
                                      Attachment
                                    </Badge>
                                  ) : null}
                                </div>
                                <p className="max-w-xl text-sm text-gray-500 dark:text-gray-400">
                                  {truncate(ticket.description, 130)}
                                </p>
                              </div>
                            </TableCell>

                            <TableCell className="px-5 py-4 align-top">
                              <div className="space-y-1">
                                <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                                  {vendor?.businessName || "Unknown vendor"}
                                </p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  {vendor?.email ||
                                    vendor?.contactEmail ||
                                    ticket.vendorId}
                                </p>
                              </div>
                            </TableCell>

                            <TableCell className="px-5 py-4 align-top text-sm text-gray-500 dark:text-gray-400">
                              {ticket.category}
                            </TableCell>

                            <TableCell className="px-5 py-4 align-top text-sm text-gray-500 dark:text-gray-400">
                              <div className="space-y-1">
                                <p>{formatDateTime(ticket.updatedAt)}</p>
                                <p className="text-xs text-gray-400 dark:text-gray-500">
                                  Created {formatDate(ticket.createdAt)}
                                </p>
                              </div>
                            </TableCell>

                            <TableCell className="px-5 py-4 align-top">
                              <div className="space-y-2">
                                <TicketStateBadge state={derivedState} />
                                <p className="text-xs text-gray-400 dark:text-gray-500">
                                  Stored status: {ticket.status}
                                </p>
                              </div>
                            </TableCell>

                            <TableCell className="px-5 py-4 align-top">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedTicketId(ticket.id)}
                              >
                                Open ticket
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {(page - 1) * PAGE_SIZE + 1}-
                  {Math.min(page * PAGE_SIZE, filteredTickets.length)} /{" "}
                  {filteredTickets.length}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page === 1}
                    onClick={() => setPage((current) => current - 1)}
                    className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200"
                  >
                    Previous
                  </button>

                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Page {page} of {totalPages}
                  </span>

                  <button
                    type="button"
                    disabled={page === totalPages}
                    onClick={() => setPage((current) => current + 1)}
                    className="rounded-md bg-brand-500 px-3 py-1 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </ComponentCard>
      </div>

      <SupportTicketModal
        isOpen={selectedTicket !== null}
        ticket={selectedTicket}
        vendor={selectedTicket ? vendorProfiles[selectedTicket.vendorId] : undefined}
        messages={threadMessages}
        isLoadingMessages={isLoadingMessages}
        messageError={messageError}
        replyDraft={replyDraft}
        onReplyDraftChange={setReplyDraft}
        onClose={() => setSelectedTicketId(null)}
        onSendReply={() => void handleSendReply()}
        onMarkResolved={() => void handleUpdateStatus("Resolved")}
        onMarkClosed={() => void handleUpdateStatus("Closed")}
        selectedTab={selectedTab}
        onTabChange={setSelectedTab}
        isSendingReply={isSendingReply}
        isUpdatingStatus={isUpdatingStatus}
        actionMessage={actionMessage}
      />
    </>
  );
};

const SupportTicketModal = ({
  isOpen,
  ticket,
  vendor,
  messages,
  isLoadingMessages,
  messageError,
  replyDraft,
  onReplyDraftChange,
  onClose,
  onSendReply,
  onMarkResolved,
  onMarkClosed,
  selectedTab,
  onTabChange,
  isSendingReply,
  isUpdatingStatus,
  actionMessage,
}: {
  isOpen: boolean;
  ticket: SupportTicket | null;
  vendor?: VendorProfileSummary;
  messages: TicketThreadMessage[];
  isLoadingMessages: boolean;
  messageError: string | null;
  replyDraft: string;
  onReplyDraftChange: (value: string) => void;
  onClose: () => void;
  onSendReply: () => void;
  onMarkResolved: () => void;
  onMarkClosed: () => void;
  selectedTab: SelectedTicketTab;
  onTabChange: (tab: SelectedTicketTab) => void;
  isSendingReply: boolean;
  isUpdatingStatus: boolean;
  actionMessage: string | null;
}) => {
  if (!ticket) {
    return null;
  }

  const isOpenTicket = ticket.status === "Open";
  const derivedState = getDerivedTicketState(ticket);
  const canReply = isOpenTicket;
  const attachmentUrl = ticket.attachment?.url || "";
  const [isFeatureMenuOpen, setIsFeatureMenuOpen] = useState(false);
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null);
  const featureMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setIsFeatureMenuOpen(false);
      setFocusedSectionId(null);
      return;
    }

    setIsFeatureMenuOpen(false);
    setFocusedSectionId("conversation-thread");
  }, [isOpen, ticket.id]);

  const sidebarSections: ModalSection[] = [
    {
      id: "ticket-metadata",
      title: "Ticket metadata",
      summary: "Status, timing, and routing details.",
      hiddenFromStandard: true,
      renderContent: () => (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <MetaRow label="Stored status" value={ticket.status} />
          <MetaRow
            label="Raised on"
            value={formatDateTime(ticket.createdAt) || "-"}
          />
          <MetaRow
            label="Last updated"
            value={formatDateTime(ticket.updatedAt) || "-"}
          />
          <MetaRow
            label="Last sender"
            value={ticket.lastMessageSenderRole || "Unknown"}
          />
        </div>
      ),
    },
    {
      id: "vendor-context",
      title: "Vendor",
      summary: vendor?.businessName || "Vendor contact context.",
      renderContent: () => (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <MetaRow
            label="Business"
            value={vendor?.businessName || "Unknown vendor"}
          />
          <MetaRow label="Email" value={vendor?.email || "-"} />
          <MetaRow label="Contact" value={vendor?.contactName || "-"} />
          <MetaRow label="Contact email" value={vendor?.contactEmail || "-"} />
          <MetaRow label="Phone" value={vendor?.phone || "-"} />
          <MetaRow label="Contact phone" value={vendor?.contactPhone || "-"} />
          <MetaRow label="Website" value={vendor?.website || "-"} />
          <MetaRow label="Country" value={vendor?.country || "-"} />
        </div>
      ),
    },
  ];

  if (attachmentUrl) {
    sidebarSections.push({
      id: "attachment-preview",
      title: "Attachment",
      summary: ticket.attachment?.originalName || "Uploaded image",
      renderContent: ({ isMaximized }) => (
        <div className="space-y-4">
          <a
            href={attachmentUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
          >
            Open uploaded image
          </a>
          <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <img
              src={attachmentUrl}
              alt={ticket.attachment?.originalName || "Ticket attachment"}
              className={`w-full object-contain ${
                isMaximized ? "max-h-[70vh]" : "max-h-80"
              }`}
            />
          </div>
        </div>
      ),
    });
  }

  const renderReplyComposer = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {canReply
            ? "Replies create a support message doc and update the parent ticket metadata."
            : "Resolved and closed tickets remain visible in read-only mode."}
        </p>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {replyDraft.length}/{MESSAGE_MAX_LENGTH}
        </span>
      </div>

      <textarea
        value={replyDraft}
        onChange={(event) =>
          onReplyDraftChange(event.target.value.slice(0, MESSAGE_MAX_LENGTH))
        }
        rows={6}
        disabled={!canReply || isSendingReply}
        placeholder={
          canReply
            ? "Write a clear, customer-facing support reply..."
            : "Replies are disabled for resolved and closed tickets."
        }
        className="w-full resize-y rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-950/40"
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Keep replies concise and operational. Vendor notifications are
          triggered by the shared backend watcher.
        </p>
        <Button
          size="sm"
          onClick={onSendReply}
          disabled={!canReply || !replyDraft.trim() || isSendingReply}
        >
          {isSendingReply ? "Sending..." : "Send reply"}
        </Button>
      </div>
    </div>
  );

  const conversationSections: ModalSection[] = [
    {
      id: "original-message-note",
      title: "Original message note",
      summary: "The first thread item comes from the parent ticket document.",
      tab: "conversation",
      renderContent: () => (
        <div className="rounded-2xl border border-brand-100 bg-brand-50/70 px-4 py-3 text-sm text-brand-700 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-300">
          The first bubble below is the original ticket description from the
          parent Firestore document.
        </div>
      ),
    },
    {
      id: "conversation-thread",
      title: "Conversation thread",
      summary: `${messages.length} reply${messages.length === 1 ? "" : "ies"} in the live ticket thread.`,
      tab: "conversation",
      renderContent: ({ isMaximized }) => (
        <div className={`space-y-6 ${isMaximized ? "min-h-[70vh]" : ""}`}>
          <div className="space-y-4">
            {isLoadingMessages ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Loading conversation...
              </p>
            ) : (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={`max-w-3xl rounded-3xl border px-5 py-4 shadow-sm ${
                    message.senderRole === "support"
                      ? "ml-auto border-brand-100 bg-brand-50 text-brand-950 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-white"
                      : "border-gray-200 bg-white text-gray-900 dark:border-gray-800 dark:bg-gray-900/60 dark:text-white"
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">
                      {message.senderRole === "support"
                        ? "Support Team"
                        : vendor?.businessName || "Vendor"}
                    </span>
                    {message.isOriginal ? (
                      <Badge size="sm" color="info">
                        Original message
                      </Badge>
                    ) : null}
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-6">
                    {message.message || "No message content."}
                  </p>
                  <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                    {formatDateTime(message.createdAt)} | {message.senderId}
                  </p>
                </article>
              ))
            )}
          </div>

          {isMaximized ? (
            <div className="rounded-3xl border border-gray-200 bg-gray-50/70 p-5 dark:border-gray-800 dark:bg-gray-950/30">
              {renderReplyComposer()}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      id: "reply-composer",
      title: "Reply as support",
      summary: canReply
        ? "Send a support reply and update the ticket in place."
        : "Read-only because this ticket is not open.",
      tab: "conversation",
      renderContent: () => renderReplyComposer(),
    },
  ];

  const detailSections: ModalSection[] = [
    {
      id: "ticket-record",
      title: "Ticket record",
      summary: "Raw support ticket fields stored in Firestore.",
      tab: "details",
      renderContent: () => (
        <div className="space-y-4">
          <DetailField label="Ticket ID" value={ticket.id} />
          <DetailField label="Ticket code" value={ticket.ticketCode} />
          <DetailField label="Vendor ID" value={ticket.vendorId} />
          <DetailField label="Category" value={ticket.category} />
          <DetailField label="Status" value={ticket.status} />
          <DetailField
            label="Derived state"
            value={getDerivedTicketState(ticket)}
          />
          <DetailField
            label="Created"
            value={formatDateTime(ticket.createdAt) || "-"}
          />
          <DetailField
            label="Updated"
            value={formatDateTime(ticket.updatedAt) || "-"}
          />
          <DetailField
            label="Attachment URL"
            value={ticket.attachment?.url || "-"}
          />
        </div>
      ),
    },
    {
      id: "vendor-snapshot",
      title: "Vendor snapshot",
      summary: vendor?.businessName || "Vendor identity and contact fields.",
      tab: "details",
      renderContent: () => (
        <div className="space-y-4">
          <DetailField
            label="Business name"
            value={vendor?.businessName || "-"}
          />
          <DetailField label="Email" value={vendor?.email || "-"} />
          <DetailField label="Contact name" value={vendor?.contactName || "-"} />
          <DetailField
            label="Contact email"
            value={vendor?.contactEmail || "-"}
          />
          <DetailField label="Phone" value={vendor?.phone || "-"} />
          <DetailField
            label="Contact phone"
            value={vendor?.contactPhone || "-"}
          />
          <DetailField label="Website" value={vendor?.website || "-"} />
          <DetailField label="Country" value={vendor?.country || "-"} />
        </div>
      ),
    },
  ];

  const mainSections =
    selectedTab === "conversation" ? conversationSections : detailSections;
  const visibleSidebarSections = sidebarSections.filter(
    (section) => !section.hiddenFromStandard
  );
  const allSections = [
    ...sidebarSections,
    ...conversationSections,
    ...detailSections,
  ];
  const focusableSections = allSections.filter(
    (section) => !section.tab || section.tab === selectedTab
  );
  const focusedSection =
    allSections.find((section) => section.id === focusedSectionId) ?? null;

  useEffect(() => {
    if (focusedSectionId && !allSections.some((section) => section.id === focusedSectionId)) {
      setFocusedSectionId(null);
    }
  }, [allSections, focusedSectionId]);

  useEffect(() => {
    if (!isFeatureMenuOpen) {
      return undefined;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (
        featureMenuRef.current &&
        !featureMenuRef.current.contains(event.target as Node)
      ) {
        setIsFeatureMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isFeatureMenuOpen]);

  const handleOpenFocusedSection = (sectionId: string) => {
    const selectedSection = allSections.find((section) => section.id === sectionId);

    if (!selectedSection) {
      return;
    }

    if (selectedSection.tab) {
      onTabChange(selectedSection.tab);
    }

    setFocusedSectionId(sectionId);
    setIsFeatureMenuOpen(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      showCloseButton={false}
      className="m-4 h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[1400px]"
    >
      <div className="flex h-full flex-col overflow-hidden rounded-[28px] bg-white dark:bg-gray-900">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800 lg:px-7">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                  Support Ticket
                </p>
                <TicketStateBadge state={derivedState} />
                <Badge size="sm" color="light">
                  {ticket.category}
                </Badge>
              </div>

              <div>
                <h3 className="truncate text-xl font-semibold text-gray-900 dark:text-white">
                  {ticket.ticketCode}
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {vendor?.businessName || "Unknown vendor"} •{" "}
                  {vendor?.email || vendor?.contactEmail || ticket.vendorId}
                </p>
              </div>

              <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                <span>Updated {formatDateTime(ticket.updatedAt) || "-"}</span>
                <span>Raised {formatDate(ticket.createdAt)}</span>
                {ticket.attachment?.url ? <span>1 attachment</span> : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 xl:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Close
              </button>
              <Button
                size="sm"
                variant="outline"
                onClick={onMarkResolved}
                disabled={!isOpenTicket || isUpdatingStatus}
              >
                {isUpdatingStatus ? "Updating..." : "Mark Resolved"}
              </Button>
              <Button
                size="sm"
                onClick={onMarkClosed}
                disabled={!isOpenTicket || isUpdatingStatus}
              >
                {isUpdatingStatus ? "Updating..." : "Mark Closed"}
              </Button>
            </div>
          </div>

          {actionMessage ? (
            <div className="mt-4">
              <InlineNotice tone="success">{actionMessage}</InlineNotice>
            </div>
          ) : null}
          {messageError ? (
            <div className="mt-4">
              <InlineNotice tone="error">{messageError}</InlineNotice>
            </div>
          ) : null}
        </div>

        <div className="border-b border-gray-200 px-5 dark:border-gray-800 lg:px-7">
          <div className="flex items-center gap-2 py-3">
            <div className="custom-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto">
              {[
                { id: "conversation" as const, label: "Conversation" },
                { id: "details" as const, label: "Vendor & Ticket Details" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    onTabChange(tab.id);
                    if (tab.id === "conversation") {
                      setFocusedSectionId("conversation-thread");
                    } else {
                      setFocusedSectionId(null);
                    }
                  }}
                  className={`shrink-0 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                    selectedTab === tab.id
                      ? "border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-500/10 dark:text-brand-300"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800/40"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative ml-auto shrink-0" ref={featureMenuRef}>
              <button
                type="button"
                onClick={() => setIsFeatureMenuOpen((current) => !current)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-gray-200 text-gray-600 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800/40"
                aria-label="Open section menu"
              >
                <MoreDotIcon className="h-5 w-5" />
              </button>

              {isFeatureMenuOpen ? (
                <div className="absolute right-0 top-14 z-[100000] w-72 rounded-2xl border border-gray-200 bg-white p-2 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
                  <button
                    type="button"
                    onClick={() => {
                      setFocusedSectionId(null);
                      setIsFeatureMenuOpen(false);
                    }}
                    className={`flex w-full items-start rounded-xl px-3 py-3 text-left text-sm transition ${
                      focusedSectionId === null
                        ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                        : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                    }`}
                  >
                    Standard layout
                  </button>

                  <div className="my-2 border-t border-gray-100 dark:border-gray-800" />

                  {focusableSections.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => handleOpenFocusedSection(section.id)}
                      className={`flex w-full flex-col rounded-xl px-3 py-3 text-left transition ${
                        focusedSectionId === section.id
                          ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                          : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                      }`}
                    >
                      <span className="text-sm font-medium">{section.title}</span>
                      {section.summary ? (
                        <span className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {section.summary}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {focusedSection ? (
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5 lg:px-7">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                  Focused view
                </p>
                <h4 className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                  {focusedSection.title}
                </h4>
                {focusedSection.summary ? (
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {focusedSection.summary}
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setFocusedSectionId(null)}
                className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Back to standard layout
              </button>
            </div>

            <FeatureSection
              title={focusedSection.title}
              summary={focusedSection.summary}
              className="h-full"
              bodyClassName="h-full"
            >
              {focusedSection.renderContent({ isMaximized: true })}
            </FeatureSection>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[390px,minmax(0,1fr)]">
            <aside className="custom-scrollbar overflow-y-auto border-b border-gray-200 bg-gray-50/80 px-5 py-5 dark:border-gray-800 dark:bg-gray-950/20 xl:border-b-0 xl:border-r lg:px-7">
              <div className="space-y-6">
                {visibleSidebarSections.map((section) => (
                  <FeatureSection
                    key={section.id}
                    title={section.title}
                    summary={section.summary}
                  >
                    {section.renderContent({ isMaximized: false })}
                  </FeatureSection>
                ))}
              </div>
            </aside>

            <div className="custom-scrollbar min-h-0 overflow-y-auto px-5 py-5 lg:px-7">
              <div
                className={
                  selectedTab === "conversation"
                    ? "flex min-h-full flex-col gap-6"
                    : "grid gap-6 xl:grid-cols-2"
                }
              >
                {mainSections.map((section) => (
                  <FeatureSection
                    key={section.id}
                    title={section.title}
                    summary={section.summary}
                  >
                    {section.renderContent({ isMaximized: false })}
                  </FeatureSection>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

const StatsCard = ({
  title,
  value,
  description,
}: {
  title: string;
  value: number | string;
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

const TicketStateBadge = ({ state }: { state: DerivedTicketState }) => {
  const color =
    state === "Resolved"
      ? "success"
      : state === "Closed"
        ? "light"
        : state === "Awaiting Vendor Reply"
          ? "info"
          : "warning";

  return (
    <Badge size="sm" color={color}>
      {state}
    </Badge>
  );
};

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

const FeatureSection = ({
  title,
  summary,
  className = "",
  bodyClassName = "",
  children,
}: {
  title: string;
  summary?: string;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) => (
  <section
    className={`rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900/60 ${className}`}
  >
    <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
      <div className="min-w-0">
        <h4 className="text-base font-semibold text-gray-900 dark:text-white">
          {title}
        </h4>
        {summary ? (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {summary}
          </p>
        ) : null}
      </div>
    </div>
    <div className={`p-5 ${bodyClassName}`}>{children}</div>
  </section>
);

const MetaRow = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900/70">
    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
      {label}
    </p>
    <p className="mt-1 break-words text-sm text-gray-700 dark:text-gray-200">
      {value}
    </p>
  </div>
);

const DetailField = ({ label, value }: { label: string; value: string }) => (
  <div className="space-y-1">
    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
      {label}
    </p>
    <p className="break-words text-sm text-gray-700 dark:text-gray-200">
      {value}
    </p>
  </div>
);

const getDerivedTicketState = (ticket: SupportTicket): DerivedTicketState => {
  if (ticket.status === "Resolved" || ticket.status === "Closed") {
    return ticket.status;
  }

  return ticket.lastMessageSenderRole === "support"
    ? "Awaiting Vendor Reply"
    : "Awaiting Support Reply";
};

const asDate = (value: Date | null) => value;

const formatDate = (value: Date | null) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(value)
    : "-";

const formatDateTime = (value: Date | null) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(value)
    : "";

const truncate = (value: string, maxLength: number) =>
  value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;

const toFirestoreErrorMessage = (error: FirestoreError) =>
  error.message || "An unexpected Firestore error occurred.";

const filterClassName =
  "h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm text-gray-700 shadow-theme-xs outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

export default Support;
