import type { ChangeEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Button from "../../components/ui/button/Button";
import { Modal } from "../../components/ui/modal";
import InputField from "../../components/form/input/InputField";
import TextArea from "../../components/form/input/TextArea";
import {
  ChevronLeftIcon,
  DownloadIcon,
  EnvelopeIcon,
  MailIcon,
  ListIcon,
  PaperPlaneIcon,
  PlusIcon,
  TrashBinIcon,
  FolderIcon,
  TimeIcon,
} from "../../icons";
import {
  createEmailAccount,
  deleteEmailAccount,
  deleteEmailMessage,
  downloadEmailAttachment,
  fetchEmailAccounts,
  fetchEmailFolders,
  fetchEmailMessage,
  fetchEmailMessages,
  forwardEmail,
  markEmailFlag,
  markEmailRead,
  replyToEmail,
  sendEmail,
  testEmailAccount,
  updateEmailAccount,
  type ComposeAttachmentPayload,
  type EmailAccount,
  type EmailAccountPayload,
  type EmailFolder,
  type EmailMessageDetail,
  type EmailMessageSummary,
} from "../../services/emailManager.service";

type BannerState = {
  tone: "success" | "error" | "info";
  message: string;
} | null;

type FilterMode = "all" | "unread" | "starred" | "attachments";
type ComposeMode = "new" | "reply" | "replyAll" | "forward";

type AccountFormState = EmailAccountPayload & {
  imapPassword: string;
  smtpPassword: string;
};

type ComposeFormState = {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  bodyText: string;
  attachments: ComposeAttachmentPayload[];
  includeAttachments: boolean;
};

type PanelKey = "account" | "list" | "detail";

type PanelState = Record<PanelKey, boolean>;

const DEFAULT_ACCOUNT_FORM: AccountFormState = {
  displayName: "",
  emailAddress: "",
  username: "",
  imapUsername: "",
  imapPassword: "",
  smtpUsername: "",
  smtpPassword: "",
  imapHost: "imap.itmart24.com",
  imapPort: 993,
  imapSecure: true,
  smtpHost: "smtp.itmart24.com",
  smtpPort: 465,
  smtpSecure: true,
  isDefault: false,
  isActive: true,
};

const FILTER_OPTIONS: Array<{ key: FilterMode; label: string }> = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "starred", label: "Starred" },
  { key: "attachments", label: "Attachments" },
];

const PANEL_STATE_STORAGE_KEY = "itmart24.emailManager.panelState";

const DEFAULT_PANEL_STATE: PanelState = {
  account: true,
  list: true,
  detail: true,
};

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatRelativeDate = (value: string | null) => {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
};

const renderAddress = (entry: { name: string; address: string }) =>
  entry.name ? `${entry.name} <${entry.address}>` : entry.address;

const readErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const normalizeMessageFolderList = (folders: EmailFolder[]) => {
  const canonical = [
    { path: "INBOX", name: "Inbox", aliases: ["inbox"] },
    { path: "Sent", name: "Sent", aliases: ["sent"] },
    { path: "Drafts", name: "Drafts", aliases: ["drafts"] },
    { path: "Archive", name: "Archive", aliases: ["archive", "all mail"] },
    { path: "Spam", name: "Spam", aliases: ["spam", "junk"] },
    { path: "Trash", name: "Trash", aliases: ["trash", "deleted"] },
  ];

  const mapped = canonical
    .map((folder) => {
      const matched = folders.find((entry) => {
        const lowerName = entry.name.toLowerCase();
        const lowerPath = entry.path.toLowerCase();
        return folder.aliases.some(
          (alias) => lowerName.includes(alias) || lowerPath.includes(alias)
        );
      });

      return matched
        ? {
            path: matched.path,
            name: folder.name,
            specialUse: matched.specialUse,
          }
        : null;
    })
    .filter((entry): entry is EmailFolder => Boolean(entry));

  const extras = folders.filter(
    (folder) => !mapped.some((entry) => entry.path === folder.path)
  );

  return [...mapped, ...extras];
};

const toReplyRecipients = (message: EmailMessageDetail | null, currentAccount?: EmailAccount) => {
  if (!message) {
    return { to: "", cc: "" };
  }

  return {
    to: message.from.map((entry) => entry.address).join(", "),
    cc: currentAccount
      ? message.to
          .map((entry) => entry.address)
          .filter((entry) => entry.toLowerCase() !== currentAccount.emailAddress.toLowerCase())
          .concat(message.cc.map((entry) => entry.address))
          .filter((value, index, array) => array.indexOf(value) === index)
          .join(", ")
      : "",
  };
};

const messageBodyToText = (message: EmailMessageDetail | null) =>
  message?.text?.trim() || "";

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(new Error(`Failed to read file ${file.name}.`));
    reader.readAsDataURL(file);
  });

const LoadingCard = ({ lines = 4 }: { lines?: number }) => (
  <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/[0.05] dark:bg-white/[0.03]">
    {Array.from({ length: lines }).map((_, index) => (
      <div
        key={index}
        className="h-4 animate-pulse rounded bg-gray-200 dark:bg-gray-800"
        style={{ width: `${100 - index * 10}%` }}
      />
    ))}
  </div>
);

const sanitizePanelState = (value: Partial<PanelState> | null | undefined): PanelState => {
  const nextState: PanelState = {
    account: value?.account ?? DEFAULT_PANEL_STATE.account,
    list: value?.list ?? DEFAULT_PANEL_STATE.list,
    detail: value?.detail ?? DEFAULT_PANEL_STATE.detail,
  };

  return Object.values(nextState).some(Boolean) ? nextState : DEFAULT_PANEL_STATE;
};

const readPanelState = (): PanelState => {
  if (typeof window === "undefined") {
    return DEFAULT_PANEL_STATE;
  }

  try {
    const raw = window.localStorage.getItem(PANEL_STATE_STORAGE_KEY);
    return raw ? sanitizePanelState(JSON.parse(raw) as Partial<PanelState>) : DEFAULT_PANEL_STATE;
  } catch {
    return DEFAULT_PANEL_STATE;
  }
};

const PanelToggleButton = ({
  expanded,
  collapseLabel,
  expandLabel,
  onClick,
}: {
  expanded: boolean;
  collapseLabel: string;
  expandLabel: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    title={expanded ? collapseLabel : expandLabel}
    aria-label={expanded ? collapseLabel : expandLabel}
    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:border-brand-300 hover:text-brand-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-brand-500/40 dark:hover:text-brand-300"
  >
    <ChevronLeftIcon className={`size-4 transition-transform ${expanded ? "" : "rotate-180"}`} />
  </button>
);

const CollapsedPanelRail = ({
  icon,
  label,
  button,
}: {
  icon: ReactNode;
  label: string;
  button: ReactNode;
}) => (
  <div className="flex min-h-[88px] items-center justify-between rounded-3xl border border-gray-200 bg-white px-4 py-4 shadow-sm transition-all duration-300 dark:border-white/[0.05] dark:bg-white/[0.03] xl:min-h-[420px] xl:flex-col xl:px-3 xl:py-5">
    <div className="flex items-center gap-4 xl:flex-col">
      {button}
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 dark:bg-gray-900 dark:text-gray-300">
        {icon}
      </div>
    </div>
    <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-gray-400 xl:text-center xl:[writing-mode:vertical-rl]">
      {label}
    </div>
  </div>
);

export default function EmailManager() {
  const [banner, setBanner] = useState<BannerState>(null);
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [folders, setFolders] = useState<EmailFolder[]>([]);
  const [messages, setMessages] = useState<EmailMessageSummary[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<EmailMessageDetail | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [selectedFolder, setSelectedFolder] = useState("INBOX");
  const [selectedMessageUid, setSelectedMessageUid] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingMessageDetail, setLoadingMessageDetail] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<EmailAccount | null>(null);
  const [accountForm, setAccountForm] = useState<AccountFormState>(DEFAULT_ACCOUNT_FORM);
  const [savingAccount, setSavingAccount] = useState(false);
  const [testingAccount, setTestingAccount] = useState(false);
  const [accountTestResult, setAccountTestResult] = useState<{
    success: boolean;
    imap: { success: boolean; message: string };
    smtp: { success: boolean; message: string };
  } | null>(null);
  const [isComposeModalOpen, setIsComposeModalOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<ComposeMode>("new");
  const [composeForm, setComposeForm] = useState<ComposeFormState>({
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    bodyText: "",
    attachments: [],
    includeAttachments: true,
  });
  const [sending, setSending] = useState(false);
  const [panelState, setPanelState] = useState<PanelState>(readPanelState);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId]
  );

  const selectedFolderName = useMemo(
    () => folders.find((folder) => folder.path === selectedFolder)?.name ?? selectedFolder,
    [folders, selectedFolder]
  );

  const loadAccounts = async () => {
    try {
      setLoadingAccounts(true);
      const nextAccounts = await fetchEmailAccounts();
      setAccounts(nextAccounts);
      setSelectedAccountId((current) => {
        if (current && nextAccounts.some((account) => account.id === current)) {
          return current;
        }

        return nextAccounts.find((account) => account.isDefault)?.id ?? nextAccounts[0]?.id ?? null;
      });
    } catch (error) {
      setBanner({
        tone: "error",
        message: readErrorMessage(error, "Failed to load email accounts."),
      });
    } finally {
      setLoadingAccounts(false);
    }
  };

  useEffect(() => {
    void loadAccounts();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(PANEL_STATE_STORAGE_KEY, JSON.stringify(panelState));
  }, [panelState]);

  useEffect(() => {
    if (!selectedAccountId) {
      setFolders([]);
      setMessages([]);
      setSelectedMessage(null);
      setSelectedMessageUid(null);
      return;
    }

    let isMounted = true;

    const loadFolders = async () => {
      try {
        setLoadingFolders(true);
        const nextFolders = normalizeMessageFolderList(
          await fetchEmailFolders(selectedAccountId)
        );

        if (!isMounted) {
          return;
        }

        setFolders(nextFolders);
        setSelectedFolder((current) => {
          if (nextFolders.some((folder) => folder.path === current)) {
            return current;
          }

          return nextFolders[0]?.path ?? "INBOX";
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setBanner({
          tone: "error",
          message: readErrorMessage(error, "Failed to load folders."),
        });
      } finally {
        if (isMounted) {
          setLoadingFolders(false);
        }
      }
    };

    void loadFolders();

    return () => {
      isMounted = false;
    };
  }, [selectedAccountId]);

  useEffect(() => {
    if (!selectedAccountId || !selectedFolder) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          setLoadingMessages(true);
          const result = await fetchEmailMessages(selectedAccountId, {
            folder: selectedFolder,
            page,
            limit: 25,
            search,
            unreadOnly: filterMode === "unread",
            starredOnly: filterMode === "starred",
            attachmentsOnly: filterMode === "attachments",
          });
          setMessages(result.messages);
          setHasMore(result.hasMore);
          setSelectedMessageUid((current) => {
            if (current && result.messages.some((message) => message.uid === current)) {
              return current;
            }

            return result.messages[0]?.uid ?? null;
          });
        } catch (error) {
          setBanner({
            tone: "error",
            message: readErrorMessage(error, "Failed to load messages."),
          });
        } finally {
          setLoadingMessages(false);
        }
      })();
    }, search ? 350 : 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [selectedAccountId, selectedFolder, search, filterMode, page]);

  useEffect(() => {
    if (!selectedAccountId || !selectedMessageUid) {
      setSelectedMessage(null);
      return;
    }

    let isMounted = true;

    const loadMessage = async () => {
      try {
        setLoadingMessageDetail(true);
        const detail = await fetchEmailMessage(
          selectedAccountId,
          selectedMessageUid,
          selectedFolder
        );

        if (!isMounted) {
          return;
        }

        setSelectedMessage(detail);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setBanner({
          tone: "error",
          message: readErrorMessage(error, "Failed to load message details."),
        });
      } finally {
        if (isMounted) {
          setLoadingMessageDetail(false);
        }
      }
    };

    void loadMessage();

    return () => {
      isMounted = false;
    };
  }, [selectedAccountId, selectedMessageUid, selectedFolder]);

  const resetAccountModal = () => {
    setEditingAccount(null);
    setAccountForm(DEFAULT_ACCOUNT_FORM);
    setAccountTestResult(null);
  };

  const openCreateAccountModal = () => {
    resetAccountModal();
    setIsAccountModalOpen(true);
  };

  const openEditAccountModal = () => {
    if (!selectedAccount) {
      return;
    }

    setEditingAccount(selectedAccount);
    setAccountForm({
      displayName: selectedAccount.displayName,
      emailAddress: selectedAccount.emailAddress,
      username: selectedAccount.username,
      imapUsername: selectedAccount.imapUsername || selectedAccount.username,
      imapPassword: "",
      smtpUsername: selectedAccount.smtpUsername || selectedAccount.username,
      smtpPassword: "",
      imapHost: selectedAccount.imapHost,
      imapPort: selectedAccount.imapPort,
      imapSecure: selectedAccount.imapSecure,
      smtpHost: selectedAccount.smtpHost,
      smtpPort: selectedAccount.smtpPort,
      smtpSecure: selectedAccount.smtpSecure,
      isDefault: selectedAccount.isDefault,
      isActive: selectedAccount.isActive,
    });
    setAccountTestResult(null);
    setIsAccountModalOpen(true);
  };

  const handleSaveAccount = async () => {
    if (!accountForm.displayName.trim()) {
      setBanner({ tone: "error", message: "Display name is required." });
      return;
    }

    if (!accountForm.emailAddress.trim()) {
      setBanner({ tone: "error", message: "Email address is required." });
      return;
    }

    if (!accountForm.imapUsername.trim()) {
      setBanner({ tone: "error", message: "IMAP username is required." });
      return;
    }

    if (!accountForm.smtpUsername.trim()) {
      setBanner({ tone: "error", message: "SMTP username is required." });
      return;
    }

    if (!editingAccount && !accountForm.imapPassword) {
      setBanner({ tone: "error", message: "IMAP password is required for a new account." });
      return;
    }

    if (!editingAccount && !accountForm.smtpPassword) {
      setBanner({ tone: "error", message: "SMTP password is required for a new account." });
      return;
    }

    try {
      setSavingAccount(true);
      const payload: EmailAccountPayload = {
        ...accountForm,
        username: accountForm.emailAddress,
      };
      const savedAccount = editingAccount
        ? await updateEmailAccount(editingAccount.id, payload)
        : await createEmailAccount(payload);
      await loadAccounts();
      setSelectedAccountId(savedAccount.id);
      setIsAccountModalOpen(false);
      resetAccountModal();
      setBanner({
        tone: "success",
        message: editingAccount
          ? "Email account updated successfully."
          : "Email account added successfully.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        message: readErrorMessage(error, "Failed to save email account."),
      });
    } finally {
      setSavingAccount(false);
    }
  };

  const handleTestAccount = async (scope: "imap" | "smtp" | "both") => {
    if (!editingAccount) {
      setBanner({
        tone: "info",
        message: "Save the account first, then run the connection test.",
      });
      return;
    }

    try {
      setTestingAccount(true);
      const result = await testEmailAccount(editingAccount.id, scope);
      setAccountTestResult(result);
      setBanner({
        tone: result.success ? "success" : scope === "both" ? "error" : "info",
        message: result.success
          ? scope === "both"
            ? "IMAP and SMTP connections are working."
            : `${scope.toUpperCase()} connection is working.`
          : scope === "both"
            ? "One or more connection checks failed."
            : `${scope.toUpperCase()} connection check failed.`,
      });
    } catch (error) {
      setBanner({
        tone: "error",
        message: readErrorMessage(error, "Failed to test email account."),
      });
    } finally {
      setTestingAccount(false);
    }
  };

  const handleDisableAccount = async () => {
    if (!selectedAccount) {
      return;
    }

    if (!window.confirm(`Disable ${selectedAccount.emailAddress}?`)) {
      return;
    }

    try {
      await deleteEmailAccount(selectedAccount.id);
      await loadAccounts();
      setBanner({
        tone: "success",
        message: "Email account disabled successfully.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        message: readErrorMessage(error, "Failed to disable account."),
      });
    }
  };

  const openComposeModal = (mode: ComposeMode) => {
    setComposeMode(mode);

    if (mode === "new") {
      setComposeForm({
        to: "",
        cc: "",
        bcc: "",
        subject: "",
        bodyText: "",
        attachments: [],
        includeAttachments: true,
      });
    } else if (mode === "reply" || mode === "replyAll") {
      const recipients = toReplyRecipients(selectedMessage, selectedAccount ?? undefined);
      setComposeForm({
        to: recipients.to,
        cc: mode === "replyAll" ? recipients.cc : "",
        bcc: "",
        subject: selectedMessage?.subject?.startsWith("Re:")
          ? selectedMessage.subject
          : `Re: ${selectedMessage?.subject ?? ""}`,
        bodyText: `\n\nOn ${selectedMessage?.date ?? ""}, ${
          selectedMessage?.from.map(renderAddress).join(", ") ?? ""
        } wrote:\n${messageBodyToText(selectedMessage)}`,
        attachments: [],
        includeAttachments: true,
      });
    } else {
      setComposeForm({
        to: "",
        cc: "",
        bcc: "",
        subject: selectedMessage?.subject?.startsWith("Fwd:")
          ? selectedMessage.subject
          : `Fwd: ${selectedMessage?.subject ?? ""}`,
        bodyText: "",
        attachments: [],
        includeAttachments: true,
      });
    }

    setIsComposeModalOpen(true);
  };

  const handleSendMessage = async () => {
    if (!selectedAccount) {
      setBanner({ tone: "error", message: "Select an email account first." });
      return;
    }

    if (!composeForm.to.trim()) {
      setBanner({ tone: "error", message: "The To field is required." });
      return;
    }

    if (!composeForm.subject.trim()) {
      setBanner({ tone: "error", message: "Subject is required." });
      return;
    }

    try {
      setSending(true);
      if (composeMode === "new") {
        await sendEmail(selectedAccount.id, {
          to: composeForm.to,
          cc: composeForm.cc,
          bcc: composeForm.bcc,
          subject: composeForm.subject,
          bodyText: composeForm.bodyText,
          attachments: composeForm.attachments,
        });
      } else if (composeMode === "forward" && selectedMessage) {
        await forwardEmail(selectedAccount.id, {
          folder: selectedFolder,
          uid: selectedMessage.uid,
          to: composeForm.to,
          cc: composeForm.cc,
          bcc: composeForm.bcc,
          subject: composeForm.subject,
          bodyText: composeForm.bodyText,
          includeAttachments: composeForm.includeAttachments,
        });
      } else if (selectedMessage) {
        await replyToEmail(selectedAccount.id, {
          folder: selectedFolder,
          uid: selectedMessage.uid,
          to: composeForm.to,
          cc: composeForm.cc,
          bcc: composeForm.bcc,
          subject: composeForm.subject,
          bodyText: composeForm.bodyText,
        });
      }

      setIsComposeModalOpen(false);
      setBanner({ tone: "success", message: "Email sent successfully." });
    } catch (error) {
      setBanner({
        tone: "error",
        message: readErrorMessage(error, "Failed to send email."),
      });
    } finally {
      setSending(false);
    }
  };

  const refreshMailbox = async () => {
    await loadAccounts();
    setPage(1);
  };

  const handleMarkReadToggle = async () => {
    if (!selectedAccount || !selectedMessage) {
      return;
    }

    try {
      await markEmailRead(
        selectedAccount.id,
        selectedMessage.uid,
        selectedFolder,
        !selectedMessage.seen
      );
      setBanner({
        tone: "success",
        message: selectedMessage.seen
          ? "Message marked as unread."
          : "Message marked as read.",
      });
      setPage(1);
      setSelectedMessage({
        ...selectedMessage,
        seen: !selectedMessage.seen,
      });
      setMessages((current) =>
        current.map((message) =>
          message.uid === selectedMessage.uid
            ? { ...message, seen: !selectedMessage.seen }
            : message
        )
      );
    } catch (error) {
      setBanner({
        tone: "error",
        message: readErrorMessage(error, "Failed to update read state."),
      });
    }
  };

  const handleFlagToggle = async (message: EmailMessageSummary | EmailMessageDetail) => {
    if (!selectedAccount) {
      return;
    }

    try {
      await markEmailFlag(
        selectedAccount.id,
        message.uid,
        selectedFolder,
        !message.flagged
      );
      setMessages((current) =>
        current.map((entry) =>
          entry.uid === message.uid ? { ...entry, flagged: !message.flagged } : entry
        )
      );
      if (selectedMessage?.uid === message.uid) {
        setSelectedMessage({
          ...selectedMessage,
          flagged: !message.flagged,
        });
      }
    } catch (error) {
      setBanner({
        tone: "error",
        message: readErrorMessage(error, "Failed to update star state."),
      });
    }
  };

  const handleDeleteMessage = async () => {
    if (!selectedAccount || !selectedMessage) {
      return;
    }

    if (!window.confirm("Move this email to Trash or delete it?")) {
      return;
    }

    try {
      await deleteEmailMessage(selectedAccount.id, selectedMessage.uid, selectedFolder);
      setMessages((current) =>
        current.filter((message) => message.uid !== selectedMessage.uid)
      );
      setSelectedMessage(null);
      setSelectedMessageUid(null);
      setBanner({
        tone: "success",
        message: "Email deleted successfully.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        message: readErrorMessage(error, "Failed to delete email."),
      });
    }
  };

  const handleDownloadAttachment = async (attachmentId: string) => {
    if (!selectedAccount || !selectedMessage) {
      return;
    }

    try {
      const result = await downloadEmailAttachment(
        selectedAccount.id,
        selectedMessage.uid,
        selectedFolder,
        attachmentId
      );
      const url = window.URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setBanner({
        tone: "error",
        message: readErrorMessage(error, "Failed to download attachment."),
      });
    }
  };

  const handleComposeAttachmentChange = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) {
      return;
    }

    try {
      const nextAttachments = await Promise.all(
        files.map(async (file) => ({
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          contentBase64: await fileToBase64(file),
        }))
      );

      setComposeForm((current) => ({
        ...current,
        attachments: [...current.attachments, ...nextAttachments],
      }));
    } catch (error) {
      setBanner({
        tone: "error",
        message: readErrorMessage(error, "Failed to prepare attachments."),
      });
    } finally {
      event.target.value = "";
    }
  };

  const bannerStyles =
    banner?.tone === "success"
      ? "border-green-200 bg-green-50 text-green-700"
      : banner?.tone === "info"
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : "border-red-200 bg-red-50 text-red-700";

  const togglePanel = (panel: PanelKey) => {
    setPanelState((current) => {
      if (current[panel] && Object.values(current).filter(Boolean).length === 1) {
        return current;
      }

      return {
        ...current,
        [panel]: !current[panel],
      };
    });
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/[0.05] dark:bg-white/[0.03] xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-800 dark:text-white/90">
            Email Manager
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage incoming and outgoing emails from connected ITMart24 mailboxes.
          </p>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
          <select
            className="h-11 min-w-[240px] rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            value={selectedAccountId ?? ""}
            onChange={(event) => {
              setSelectedAccountId(event.target.value ? Number(event.target.value) : null);
              setPage(1);
            }}
            disabled={loadingAccounts || accounts.length === 0}
          >
            {accounts.length === 0 ? <option value="">No accounts</option> : null}
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.displayName} - {account.emailAddress}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            type="button"
            startIcon={<PlusIcon className="size-4" />}
            onClick={openCreateAccountModal}
          >
            Add Account
          </Button>
          <Button
            variant="outline"
            type="button"
            startIcon={<PaperPlaneIcon className="size-4" />}
            onClick={() => openComposeModal("new")}
            disabled={!selectedAccount}
          >
            Compose
          </Button>
          <Button
            variant="outline"
            type="button"
            onClick={() => void refreshMailbox()}
            disabled={loadingAccounts || loadingMessages}
          >
            Refresh
          </Button>
        </div>
      </div>

      {banner ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${bannerStyles}`}>
          {banner.message}
        </div>
      ) : null}

      {loadingAccounts ? (
        <LoadingCard lines={5} />
      ) : accounts.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center dark:border-gray-700 dark:bg-white/[0.03]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
            <MailIcon className="size-8" />
          </div>
          <h2 className="mt-5 text-xl font-semibold text-gray-800 dark:text-white/90">
            No email accounts connected yet
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-gray-500 dark:text-gray-400">
            Add your first mailbox to browse inbox folders, read messages, and send replies from the admin panel.
          </p>
          <div className="mt-6">
            <Button type="button" onClick={openCreateAccountModal}>
              Add Email Account
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6 overflow-hidden xl:flex-row">
          <div
            className={`min-w-0 transition-[flex-basis,max-width,width] duration-300 xl:flex-none ${
              panelState.account
                ? "xl:basis-[280px] xl:max-w-[280px]"
                : "xl:basis-[72px] xl:max-w-[72px]"
            }`}
          >
            {panelState.account ? (
              <div className="space-y-5 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/[0.05] dark:bg-white/[0.03]">
                <div className="flex justify-end xl:hidden">
                  <PanelToggleButton
                    expanded={panelState.account}
                    collapseLabel="Collapse account panel"
                    expandLabel="Expand account panel"
                    onClick={() => togglePanel("account")}
                  />
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">
                    Connected Account
                  </div>
                  <div className="mt-2 text-base font-semibold text-gray-800 dark:text-white/90">
                    {selectedAccount?.displayName}
                  </div>
                  <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {selectedAccount?.emailAddress}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      selectedAccount?.isActive
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {selectedAccount?.isActive ? "Active" : "Inactive"}
                  </div>
                  <div className="hidden xl:block">
                    <PanelToggleButton
                      expanded={panelState.account}
                      collapseLabel="Collapse account panel"
                      expandLabel="Expand account panel"
                      onClick={() => togglePanel("account")}
                    />
                  </div>
                </div>
              </div>
              <div className="mt-4 grid gap-2 text-xs text-gray-500 dark:text-gray-400">
                <div>IMAP: {selectedAccount?.imapHost}:{selectedAccount?.imapPort}</div>
                <div>SMTP: {selectedAccount?.smtpHost}:{selectedAccount?.smtpPort}</div>
                <div>
                  Last test:{" "}
                  {selectedAccount?.lastTestedAt
                    ? `${selectedAccount.lastTestStatus ?? "checked"} on ${formatDateTime(
                        selectedAccount.lastTestedAt
                      )}`
                    : "Not tested yet"}
                </div>
              </div>
            </div>

            <div>
              <div className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-gray-500">
                Folders
              </div>
              <div className="space-y-1.5">
                {loadingFolders ? (
                  <LoadingCard lines={4} />
                ) : (
                  folders.map((folder) => {
                    const selected = folder.path === selectedFolder;
                    return (
                      <button
                        key={folder.path}
                        type="button"
                        onClick={() => {
                          setSelectedFolder(folder.path);
                          setSelectedMessage(null);
                          setSelectedMessageUid(null);
                          setPage(1);
                        }}
                        className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm transition ${
                          selected
                            ? "bg-brand-500 text-white shadow-theme-xs"
                            : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                        }`}
                      >
                        <FolderIcon className="size-5" />
                        <span>{folder.name}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <Button type="button" variant="outline" onClick={openEditAccountModal}>
                Account Settings
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleDisableAccount}
                disabled={!selectedAccount}
              >
                Disable Account
              </Button>
            </div>
              </div>
            ) : (
              <CollapsedPanelRail
                icon={<FolderIcon className="size-5" />}
                label="Accounts"
                button={
                  <PanelToggleButton
                    expanded={panelState.account}
                    collapseLabel="Collapse account panel"
                    expandLabel="Expand account panel"
                    onClick={() => togglePanel("account")}
                  />
                }
              />
            )}
          </div>

          <div
            className={`min-w-0 transition-[flex-basis,max-width,width] duration-300 xl:flex-none ${
              panelState.list
                ? "xl:basis-[360px] xl:min-w-[320px] xl:max-w-[380px]"
                : "xl:basis-[72px] xl:max-w-[72px]"
            }`}
          >
            {panelState.list ? (
              <div className="space-y-5 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/[0.05] dark:bg-white/[0.03]">
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <InputField
                        type="text"
                        placeholder={`Search ${selectedFolderName}`}
                        value={search}
                        onChange={(event) => {
                          setSearch(event.target.value);
                          setPage(1);
                        }}
                      />
                    </div>
                    <PanelToggleButton
                      expanded={panelState.list}
                      collapseLabel="Collapse message list"
                      expandLabel="Expand message list"
                      onClick={() => togglePanel("list")}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {FILTER_OPTIONS.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => {
                          setFilterMode(option.key);
                          setPage(1);
                        }}
                        className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                          filterMode === option.key
                            ? "bg-brand-500 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

            <div className="space-y-3">
              {loadingMessages ? (
                <LoadingCard lines={7} />
              ) : messages.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-300 px-5 py-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  No emails found in {selectedFolderName}.
                </div>
              ) : (
                messages.map((message) => {
                  const isSelected = message.uid === selectedMessageUid;
                  return (
                    <button
                      key={message.uid}
                      type="button"
                      onClick={() => setSelectedMessageUid(message.uid)}
                      className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                        isSelected
                          ? "border-brand-300 bg-brand-50 dark:border-brand-500/40 dark:bg-brand-500/10"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:hover:border-gray-700 dark:hover:bg-gray-900"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {!message.seen ? (
                              <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />
                            ) : null}
                            <div
                              className={`truncate text-sm ${
                                message.seen
                                  ? "font-medium text-gray-600 dark:text-gray-300"
                                  : "font-semibold text-gray-900 dark:text-white"
                              }`}
                            >
                              {message.from[0]?.name || message.from[0]?.address || "Unknown sender"}
                            </div>
                          </div>
                          <div className="mt-2 truncate text-sm font-medium text-gray-800 dark:text-white/90">
                            {message.subject || "(No subject)"}
                          </div>
                          <div className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                            {message.preview || "No preview available."}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {formatRelativeDate(message.date)}
                          </div>
                          <div className="mt-2 flex items-center justify-end gap-2 text-gray-400">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleFlagToggle(message);
                              }}
                              className={message.flagged ? "text-amber-500" : ""}
                            >
                              {message.flagged ? "★" : "☆"}
                            </button>
                            {message.hasAttachments ? (
                              <EnvelopeIcon className="size-4" />
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between border-t border-gray-200 pt-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
              <span>Page {page}</span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={!hasMore}
                >
                  Next
                </Button>
              </div>
            </div>
              </div>
            ) : (
              <CollapsedPanelRail
                icon={<ListIcon className="size-5" />}
                label="Inbox"
                button={
                  <PanelToggleButton
                    expanded={panelState.list}
                    collapseLabel="Collapse message list"
                    expandLabel="Expand message list"
                    onClick={() => togglePanel("list")}
                  />
                }
              />
            )}
          </div>

          <div
            className={`min-w-0 transition-[flex-basis,max-width,width] duration-300 ${
              panelState.detail ? "xl:flex-1" : "xl:basis-[72px] xl:max-w-[72px] xl:flex-none"
            }`}
          >
            {panelState.detail ? (
              <div className="space-y-5 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/[0.05] dark:bg-white/[0.03]">
                {loadingMessageDetail ? (
                  <LoadingCard lines={10} />
                ) : !selectedMessage ? (
                  <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-gray-300 text-center dark:border-gray-700">
                    <div className="px-6">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                        <EnvelopeIcon className="size-7" />
                      </div>
                      <div className="mt-4 flex items-start justify-center gap-3">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                          Select an email to read
                        </h3>
                        <PanelToggleButton
                          expanded={panelState.detail}
                          collapseLabel="Collapse email preview"
                          expandLabel="Expand email preview"
                          onClick={() => togglePanel("detail")}
                        />
                      </div>
                      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        Choose a message from {selectedFolderName} to view its full content and actions.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                <div className="space-y-4 border-b border-gray-200 pb-5 dark:border-gray-800">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">
                        {selectedFolderName}
                      </div>
                      <h2 className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
                        {selectedMessage.subject || "(No subject)"}
                      </h2>
                    </div>
                    <div className="flex flex-wrap items-start gap-2">
                      <Button type="button" variant="outline" onClick={() => openComposeModal("reply")}>
                        Reply
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openComposeModal("replyAll")}
                      >
                        Reply All
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openComposeModal("forward")}
                      >
                        Forward
                      </Button>
                      <PanelToggleButton
                        expanded={panelState.detail}
                        collapseLabel="Collapse email preview"
                        expandLabel="Expand email preview"
                        onClick={() => togglePanel("detail")}
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                    <div>
                      <span className="font-semibold text-gray-800 dark:text-white/90">From:</span>{" "}
                      {selectedMessage.from.map(renderAddress).join(", ")}
                    </div>
                    <div>
                      <span className="font-semibold text-gray-800 dark:text-white/90">To:</span>{" "}
                      {selectedMessage.to.map(renderAddress).join(", ")}
                    </div>
                    {selectedMessage.cc.length > 0 ? (
                      <div>
                        <span className="font-semibold text-gray-800 dark:text-white/90">CC:</span>{" "}
                        {selectedMessage.cc.map(renderAddress).join(", ")}
                      </div>
                    ) : null}
                    <div className="flex items-center gap-2">
                      <TimeIcon className="size-4" />
                      <span>{formatDateTime(selectedMessage.date)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleMarkReadToggle()}
                    >
                      {selectedMessage.seen ? "Mark Unread" : "Mark Read"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleFlagToggle(selectedMessage)}
                    >
                      {selectedMessage.flagged ? "Unstar" : "Star"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      startIcon={<TrashBinIcon className="size-4" />}
                      onClick={() => void handleDeleteMessage()}
                    >
                      Delete
                    </Button>
                  </div>
                </div>

                <div className="prose max-w-none prose-sm rounded-2xl border border-gray-200 bg-white p-5 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200">
                  {selectedMessage.sanitizedHtml ? (
                    <div
                      dangerouslySetInnerHTML={{ __html: selectedMessage.sanitizedHtml }}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 dark:text-gray-200">
                      {selectedMessage.text || "No content available."}
                    </pre>
                  )}
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
                  <div className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">
                    Attachments
                  </div>
                  {selectedMessage.attachments.length === 0 ? (
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      No attachments in this message.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedMessage.attachments.map((attachment) => (
                        <div
                          key={attachment.attachmentId}
                          className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <div className="text-sm font-medium text-gray-800 dark:text-white/90">
                              {attachment.filename}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {attachment.contentType} • {attachment.size} bytes
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            startIcon={<DownloadIcon className="size-4" />}
                            onClick={() => void handleDownloadAttachment(attachment.attachmentId)}
                          >
                            Download
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                  </>
                )}
              </div>
            ) : (
              <CollapsedPanelRail
                icon={<MailIcon className="size-5" />}
                label="Preview"
                button={
                  <PanelToggleButton
                    expanded={panelState.detail}
                    collapseLabel="Collapse email preview"
                    expandLabel="Expand email preview"
                    onClick={() => togglePanel("detail")}
                  />
                }
              />
            )}
          </div>
        </div>
      )}

      <Modal
        isOpen={isAccountModalOpen}
        onClose={() => {
          setIsAccountModalOpen(false);
          resetAccountModal();
        }}
        className="max-w-4xl p-6 lg:p-8"
      >
        <div className="space-y-6">
          <div>
            <h3 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
              {editingAccount ? "Edit Email Account" : "Add Email Account"}
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Credentials stay encrypted on the backend and are never exposed to the frontend.
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Some providers use different usernames/passwords for IMAP and SMTP.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Display Name
              </label>
              <InputField
                value={accountForm.displayName}
                onChange={(event) =>
                  setAccountForm((current) => ({ ...current, displayName: event.target.value }))
                }
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email Address
              </label>
              <InputField
                type="email"
                value={accountForm.emailAddress}
                onChange={(event) =>
                  setAccountForm((current) => ({ ...current, emailAddress: event.target.value }))
                }
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Sender Identity
              </label>
              <InputField value={accountForm.emailAddress} disabled />
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
              <div className="mb-4">
                <div className="text-base font-semibold text-gray-800 dark:text-white/90">
                  IMAP Receiving Settings
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Use the mailbox credentials for replies, bounce notices, and auto-replies.
                </div>
              </div>
              <div className="grid gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    IMAP Username
                  </label>
                  <InputField
                    value={accountForm.imapUsername}
                    onChange={(event) =>
                      setAccountForm((current) => ({ ...current, imapUsername: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    IMAP Password
                  </label>
                  <InputField
                    type="password"
                    placeholder={editingAccount ? "Leave blank to keep existing IMAP password" : ""}
                    value={accountForm.imapPassword}
                    onChange={(event) =>
                      setAccountForm((current) => ({ ...current, imapPassword: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    IMAP Host
                  </label>
                  <InputField
                    value={accountForm.imapHost}
                    onChange={(event) =>
                      setAccountForm((current) => ({ ...current, imapHost: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    IMAP Port
                  </label>
                  <InputField
                    type="number"
                    value={accountForm.imapPort}
                    onChange={(event) =>
                      setAccountForm((current) => ({
                        ...current,
                        imapPort: Number(event.target.value || 0),
                      }))
                    }
                  />
                </div>
                <label className="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={accountForm.imapSecure}
                    onChange={(event) =>
                      setAccountForm((current) => ({ ...current, imapSecure: event.target.checked }))
                    }
                  />
                  IMAP Secure SSL/TLS
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
              <div className="mb-4">
                <div className="text-base font-semibold text-gray-800 dark:text-white/90">
                  SMTP Sending Settings
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Some providers require different SMTP usernames or passwords. Port 587 with SSL/TLS off is supported.
                </div>
              </div>
              <div className="grid gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    SMTP Username
                  </label>
                  <InputField
                    value={accountForm.smtpUsername}
                    onChange={(event) =>
                      setAccountForm((current) => ({ ...current, smtpUsername: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    SMTP Password
                  </label>
                  <InputField
                    type="password"
                    placeholder={editingAccount ? "Leave blank to keep existing SMTP password" : ""}
                    value={accountForm.smtpPassword}
                    onChange={(event) =>
                      setAccountForm((current) => ({ ...current, smtpPassword: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    SMTP Host
                  </label>
                  <InputField
                    value={accountForm.smtpHost}
                    onChange={(event) =>
                      setAccountForm((current) => ({ ...current, smtpHost: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    SMTP Port
                  </label>
                  <InputField
                    type="number"
                    value={accountForm.smtpPort}
                    onChange={(event) =>
                      setAccountForm((current) => ({
                        ...current,
                        smtpPort: Number(event.target.value || 0),
                      }))
                    }
                  />
                </div>
                <label className="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={accountForm.smtpSecure}
                    onChange={(event) =>
                      setAccountForm((current) => ({ ...current, smtpSecure: event.target.checked }))
                    }
                  />
                  SMTP Secure SSL/TLS
                </label>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300">
              <input
                type="checkbox"
                checked={accountForm.isDefault}
                onChange={(event) =>
                  setAccountForm((current) => ({ ...current, isDefault: event.target.checked }))
                }
              />
              Set as default account
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300">
              <input
                type="checkbox"
                checked={accountForm.isActive}
                onChange={(event) =>
                  setAccountForm((current) => ({ ...current, isActive: event.target.checked }))
                }
              />
              Account is active
            </label>
          </div>

          {accountTestResult ? (
            <div className="grid gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-800 dark:bg-gray-900 md:grid-cols-2">
              <div>
                <div className="font-semibold text-gray-800 dark:text-white/90">IMAP</div>
                <div className={accountTestResult.imap.success ? "text-green-600" : "text-red-600"}>
                  {accountTestResult.imap.message}
                </div>
              </div>
              <div>
                <div className="font-semibold text-gray-800 dark:text-white/90">SMTP</div>
                <div className={accountTestResult.smtp.success ? "text-green-600" : "text-red-600"}>
                  {accountTestResult.smtp.message}
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
            <Button type="button" variant="outline" onClick={() => void handleTestAccount("imap")} disabled={testingAccount}>
              {testingAccount ? "Testing..." : "Test IMAP"}
            </Button>
            <Button type="button" variant="outline" onClick={() => void handleTestAccount("smtp")} disabled={testingAccount}>
              {testingAccount ? "Testing..." : "Test SMTP"}
            </Button>
            <Button type="button" variant="outline" onClick={() => void handleTestAccount("both")} disabled={testingAccount}>
              {testingAccount ? "Testing..." : "Test Both"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setIsAccountModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveAccount} disabled={savingAccount}>
              {savingAccount ? "Saving..." : "Save Account"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isComposeModalOpen}
        onClose={() => setIsComposeModalOpen(false)}
        className="max-w-4xl p-6 lg:p-8"
      >
        <div className="space-y-6">
          <div>
            <h3 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
              {composeMode === "new"
                ? "Compose Email"
                : composeMode === "forward"
                  ? "Forward Email"
                  : "Reply to Email"}
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Sending from {selectedAccount?.displayName} ({selectedAccount?.emailAddress})
            </p>
          </div>

          <div className="grid gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                To
              </label>
              <InputField
                value={composeForm.to}
                onChange={(event) =>
                  setComposeForm((current) => ({ ...current, to: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  CC
                </label>
                <InputField
                  value={composeForm.cc}
                  onChange={(event) =>
                    setComposeForm((current) => ({ ...current, cc: event.target.value }))
                  }
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  BCC
                </label>
                <InputField
                  value={composeForm.bcc}
                  onChange={(event) =>
                    setComposeForm((current) => ({ ...current, bcc: event.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Subject
              </label>
              <InputField
                value={composeForm.subject}
                onChange={(event) =>
                  setComposeForm((current) => ({ ...current, subject: event.target.value }))
                }
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Message
              </label>
              <TextArea
                rows={12}
                value={composeForm.bodyText}
                onChange={(value) =>
                  setComposeForm((current) => ({ ...current, bodyText: value }))
                }
              />
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-800 dark:text-white/90">
                    Attachments
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Optional for new emails. For forwards, you can also include the original message attachments.
                  </div>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300">
                  <PlusIcon className="size-4" />
                  Add files
                  <input type="file" multiple className="hidden" onChange={handleComposeAttachmentChange} />
                </label>
              </div>

              {composeMode === "forward" ? (
                <label className="mt-4 flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={composeForm.includeAttachments}
                    onChange={(event) =>
                      setComposeForm((current) => ({
                        ...current,
                        includeAttachments: event.target.checked,
                      }))
                    }
                  />
                  Include original attachments
                </label>
              ) : null}

              {composeForm.attachments.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {composeForm.attachments.map((attachment, index) => (
                    <div
                      key={`${attachment.filename}-${index}`}
                      className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm dark:border-gray-800 dark:bg-gray-950"
                    >
                      <div>
                        <div className="font-medium text-gray-800 dark:text-white/90">
                          {attachment.filename}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {attachment.contentType}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setComposeForm((current) => ({
                            ...current,
                            attachments: current.attachments.filter((_, currentIndex) => currentIndex !== index),
                          }))
                        }
                        className="text-sm text-red-600"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
            <Button type="button" variant="outline" onClick={() => setIsComposeModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              startIcon={<PaperPlaneIcon className="size-4" />}
              onClick={handleSendMessage}
              disabled={sending}
            >
              {sending ? "Sending..." : "Send"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
