import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import {
  AlertHexaIcon,
  BoxCubeIcon,
  CalenderIcon,
  ChatIcon,
  ChevronDownIcon,
  CopyIcon,
  GridIcon,
  HorizontaLDots,
  ListIcon,
  PageIcon,
  PieChartIcon,
  PlugInIcon,
  TableIcon,
  UserCircleIcon,
} from "../icons";
import Badge from "../components/ui/badge/Badge";
import Button from "../components/ui/button/Button";
import { Modal } from "../components/ui/modal";
import { useSidebar } from "../context/SidebarContext";
import SidebarWidget from "./SidebarWidget";

type NavItem = {
  name: string;
  icon?: React.ReactNode;
  path?: string;
  subItems?: NavItem[];
  pro?: boolean;
  new?: boolean;
};

const databaseBadgeByProjectId: Record<
  string,
  {
    label: string;
    color: "success" | "info";
  }
> = {
  "vendor-portal-91ecc": {
    label: "Live",
    color: "success",
  },
  "dev-vendor-portal-11c9d": {
    label: "Development",
    color: "info",
  },
} as const;

type HealthService = "firestore" | "postgres";

type HealthResponse = {
  service: HealthService;
  connected: boolean;
  checkedAt: string;
  details: {
    message: string;
    host?: string;
    database?: string;
  };
};

const serviceLabelByKey: Record<HealthService, string> = {
  firestore: "Firestore",
  postgres: "Postgres",
};

const buildFallbackHealthResponse = (
  service: HealthService,
  message: string
): HealthResponse => ({
  service,
  connected: false,
  checkedAt: new Date().toISOString(),
  details: {
    message,
  },
});

const normalizeHealthResponse = (
  service: HealthService,
  payload: unknown
): HealthResponse => {
  const record =
    payload && typeof payload === "object"
      ? (payload as Partial<HealthResponse>)
      : {};
  const details: Partial<HealthResponse["details"]> =
    record.details && typeof record.details === "object"
      ? (record.details as HealthResponse["details"])
      : {};

  return {
    service,
    connected: Boolean(record.connected),
    checkedAt:
      typeof record.checkedAt === "string" && record.checkedAt
        ? record.checkedAt
        : new Date().toISOString(),
    details: {
      message:
        typeof details.message === "string" && details.message
          ? details.message
          : record.connected
            ? "Connected"
            : "Disconnected",
      host: typeof details.host === "string" ? details.host : undefined,
      database:
        typeof details.database === "string" ? details.database : undefined,
    },
  };
};

const formatCheckedAt = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const ConnectionStatusButton = ({
  service,
  health,
  loading,
  onClick,
}: {
  service: HealthService;
  health: HealthResponse | null;
  loading: boolean;
  onClick: () => void;
}) => {
  const label = serviceLabelByKey[service];
  const isConnected = Boolean(health?.connected);
  const title = loading
    ? `Checking ${label} connection`
    : `${label} ${isConnected ? "connected" : "disconnected"}`;

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`relative flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-semibold transition-colors ${
        isConnected
          ? "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400"
          : loading
            ? "border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400"
            : "border-gray-300 bg-gray-100 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
      }`}
    >
      <span>{service === "firestore" ? "FS" : "PG"}</span>
      <span
        className={`absolute right-1 top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-gray-900 ${
          isConnected
            ? "bg-success-500"
            : loading
              ? "animate-pulse bg-warning-500"
              : "bg-error-500"
        }`}
      />
    </button>
  );
};

const navItems: NavItem[] = [
  {
    icon: <GridIcon />,
    name: "Dashboard",
    subItems: [{ name: "Analytics", path: "/" }],
  },
  {
    icon: <ChatIcon />,
    name: "Support",
    path: "/support",
  },
  {
    icon: <AlertHexaIcon />,
    name: "Notifications",
    path: "/notifications",
  },
  {
    icon: <BoxCubeIcon />,
    name: "Products",
    subItems: [
      { name: "Pending Products", path: "/products/pending" },
      { name: "Claimed Products", path: "/products/claimed" },
      { name: "Active Products", path: "/products/active" },
      { name: "Rejected Products", path: "/products/rejected" },
      { name: "On Hold Products", path: "/products/on-hold" },
    ],
  },
  {
    icon: <PlugInIcon />,
    name: "Marketing",
    subItems: [
      {
        name: "Blog Manager",
        subItems: [
          { name: "Jobs", path: "/marketing/blog-manager/jobs" },
          { name: "Blogs", path: "/marketing/blog-manager/blogs" },
        ],
      },
      {
        name: "SM Manager",
        path: "/marketing/sm-manager",
      },
      {
        name: "Settings",
        path: "/marketing/settings",
      },
    ],
  },
  {
    icon: <UserCircleIcon />,
    name: "Vendors",
    path: "/vendors",
  },
  {
    icon: <UserCircleIcon />,
    name: "User Profile",
    path: "/profile",
  },
  {
    icon: <BoxCubeIcon />,
    name: "Shopify",
    subItems: [
      { name: "Shopify Products", path: "/shopify/products" },
      { name: "Shopify Collections", path: "/shopify/collections" },
    ],
  },
  {
    icon: <PlugInIcon />,
    name: "Masters",
    subItems: [
      { name: "Sync", path: "/master/sync" },
      { name: "Manage Plans", path: "/master/manage-plans" },
      { name: "Monthly Target", path: "/master/monthly-target" },
      { name: "Product Category Master", path: "/master/product-category-master" },
    ],
  },
  {
    icon: <CalenderIcon />,
    name: "Calendar",
    path: "/calendar",
  },
  {
    name: "Forms",
    icon: <ListIcon />,
    subItems: [{ name: "Form Elements", path: "/form-elements" }],
  },
  {
    name: "Tables",
    icon: <TableIcon />,
    subItems: [{ name: "Basic Tables", path: "/basic-tables" }],
  },
  {
    name: "Pages",
    icon: <PageIcon />,
    subItems: [
      { name: "Blank Page", path: "/blank" },
      { name: "404 Error", path: "/error-404" },
    ],
  },
];

const othersItems: NavItem[] = [
  {
    icon: <PieChartIcon />,
    name: "Charts",
    subItems: [
      { name: "Line Chart", path: "/line-chart" },
      { name: "Bar Chart", path: "/bar-chart" },
    ],
  },
  {
    icon: <BoxCubeIcon />,
    name: "UI Elements",
    subItems: [
      { name: "Alerts", path: "/alerts" },
      { name: "Avatar", path: "/avatars" },
      { name: "Badge", path: "/badge" },
      { name: "Buttons", path: "/buttons" },
      { name: "Images", path: "/images" },
      { name: "Videos", path: "/videos" },
    ],
  },
  {
    icon: <PlugInIcon />,
    name: "Authentication",
    subItems: [
      { name: "Sign In", path: "/signin" },
      { name: "Sign Up", path: "/signup" },
    ],
  },
];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const location = useLocation();
  const showFullLogo = isExpanded || isHovered || isMobileOpen;
  const projectBadge =
    databaseBadgeByProjectId[import.meta.env.VITE_FIREBASE_PROJECT_ID];
  const environmentBadge =
    import.meta.env.VITE_APP_ENV === "development"
      ? {
          label: "Development",
          color: "warning" as const,
          variant: "solid" as const,
        }
      : projectBadge
        ? {
            label: projectBadge.label,
            color: projectBadge.color,
            variant: "light" as const,
          }
        : null;
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const [healthByService, setHealthByService] = useState<
    Record<HealthService, HealthResponse | null>
  >({
    firestore: null,
    postgres: null,
  });
  const [loadingByService, setLoadingByService] = useState<
    Record<HealthService, boolean>
  >({
    firestore: true,
    postgres: true,
  });
  const [selectedService, setSelectedService] = useState<HealthService | null>(
    null
  );
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const hasRequestedHealthRef = useRef(false);

  const isActive = useCallback(
    (path: string) => location.pathname === path,
    [location.pathname]
  );

  const findActiveAncestorKeys = useCallback(
    (items: NavItem[], parentKey: string): string[] => {
      const matchedKeys: string[] = [];

      items.forEach((item, index) => {
        const itemKey = `${parentKey}-${index}-${item.name}`;
        const descendantKeys = item.subItems
          ? findActiveAncestorKeys(item.subItems, itemKey)
          : [];
        const isCurrentActive = item.path ? isActive(item.path) : false;

        if (descendantKeys.length > 0 || isCurrentActive) {
          if (item.subItems?.length) {
            matchedKeys.push(itemKey);
          }
          matchedKeys.push(...descendantKeys);
        }
      });

      return matchedKeys;
    },
    [isActive]
  );

  useEffect(() => {
    const nextOpenMenus: Record<string, boolean> = {};
    [
      ...findActiveAncestorKeys(navItems, "main"),
      ...findActiveAncestorKeys(othersItems, "others"),
    ].forEach((key) => {
      nextOpenMenus[key] = true;
    });
    setOpenMenus((previous) => ({ ...previous, ...nextOpenMenus }));
  }, [findActiveAncestorKeys, location.pathname]);

  const handleSubmenuToggle = (key: string) => {
    setOpenMenus((previous) => ({
      ...previous,
      [key]: !previous[key],
    }));
  };

  const canShowLabels = isExpanded || isHovered || isMobileOpen;

  const fetchHealth = useCallback(async (service: HealthService) => {
    setLoadingByService((previous) => ({
      ...previous,
      [service]: true,
    }));

    try {
      const response = await fetch(`/api/health/${service}`);
      let payload: unknown = null;

      try {
        payload = await response.json();
      } catch (_error) {
        payload = null;
      }

      if (payload) {
        setHealthByService((previous) => ({
          ...previous,
          [service]: normalizeHealthResponse(service, payload),
        }));
      } else {
        setHealthByService((previous) => ({
          ...previous,
          [service]: buildFallbackHealthResponse(
            service,
            `HTTP ${response.status} ${response.statusText}`.trim()
          ),
        }));
      }
    } catch (error) {
      setHealthByService((previous) => ({
        ...previous,
        [service]: buildFallbackHealthResponse(
          service,
          error instanceof Error && error.message
            ? `Network error: ${error.message}`
            : "Network error while checking connection"
        ),
      }));
    } finally {
      setLoadingByService((previous) => ({
        ...previous,
        [service]: false,
      }));
    }
  }, []);

  useEffect(() => {
    if (hasRequestedHealthRef.current) {
      return;
    }

    hasRequestedHealthRef.current = true;
    void Promise.all([fetchHealth("firestore"), fetchHealth("postgres")]);
  }, [fetchHealth]);

  useEffect(() => {
    if (!copyNotice) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCopyNotice(null);
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [copyNotice]);

  const renderSubItems = useCallback(
    (items: NavItem[], parentKey: string, level = 0) => (
      <ul
        className={`${
          level === 0 ? "flex flex-col gap-4" : "mt-2 space-y-1"
        }`}
      >
        {items.map((item, index) => {
          const itemKey = `${parentKey}-${index}-${item.name}`;
          const hasChildren = Boolean(item.subItems?.length);
          const isItemActive = item.path ? isActive(item.path) : false;

          return (
            <li key={itemKey}>
              {hasChildren ? (
                <>
                  <button
                    onClick={() => handleSubmenuToggle(itemKey)}
                    className={`group flex w-full items-center ${
                      level === 0
                        ? `menu-item ${
                            openMenus[itemKey] ? "menu-item-active" : "menu-item-inactive"
                          } ${!isExpanded && !isHovered ? "lg:justify-center" : "lg:justify-start"}`
                        : `menu-dropdown-item ${
                            openMenus[itemKey]
                              ? "menu-dropdown-item-active"
                              : "menu-dropdown-item-inactive"
                          }`
                    }`}
                    style={level > 0 ? { paddingLeft: `${level * 16}px` } : undefined}
                  >
                    {level === 0 && item.icon ? (
                      <span
                        className={`menu-item-icon-size ${
                          openMenus[itemKey]
                            ? "menu-item-icon-active"
                            : "menu-item-icon-inactive"
                        }`}
                      >
                        {item.icon}
                      </span>
                    ) : null}
                    {canShowLabels ? (
                      <span className={level === 0 ? "menu-item-text" : ""}>
                        {item.name}
                      </span>
                    ) : null}
                    {canShowLabels ? (
                      <ChevronDownIcon
                        className={`ml-auto h-5 w-5 transition-transform duration-200 ${
                          openMenus[itemKey] ? "rotate-180 text-brand-500" : ""
                        }`}
                      />
                    ) : null}
                  </button>
                  {canShowLabels && openMenus[itemKey] ? (
                    <div className={level === 0 ? "" : "ml-4"}>
                      {renderSubItems(item.subItems ?? [], itemKey, level + 1)}
                    </div>
                  ) : null}
                </>
              ) : item.path ? (
                <Link
                  to={item.path}
                  className={`group ${
                    level === 0
                      ? `menu-item ${isItemActive ? "menu-item-active" : "menu-item-inactive"}`
                      : `menu-dropdown-item ${
                          isItemActive
                            ? "menu-dropdown-item-active"
                            : "menu-dropdown-item-inactive"
                        }`
                  }`}
                  style={level > 0 ? { paddingLeft: `${level * 16}px` } : undefined}
                >
                  {level === 0 && item.icon ? (
                    <span
                      className={`menu-item-icon-size ${
                        isItemActive ? "menu-item-icon-active" : "menu-item-icon-inactive"
                      }`}
                    >
                      {item.icon}
                    </span>
                  ) : null}
                  {canShowLabels ? (
                    <span className={level === 0 ? "menu-item-text" : ""}>
                      {item.name}
                    </span>
                  ) : null}
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    ),
    [canShowLabels, handleSubmenuToggle, isActive, isExpanded, isHovered, openMenus]
  );

  const mainMenu = useMemo(() => renderSubItems(navItems, "main"), [renderSubItems]);
  const othersMenu = useMemo(
    () => renderSubItems(othersItems, "others"),
    [renderSubItems]
  );
  const activeHealth = selectedService ? healthByService[selectedService] : null;
  const activeHealthJson = activeHealth
    ? JSON.stringify(activeHealth, null, 2)
    : "";

  const handleCopyHealth = useCallback(async () => {
    if (!activeHealthJson) {
      return;
    }

    try {
      await navigator.clipboard.writeText(activeHealthJson);
      setCopyNotice("Copied to clipboard");
    } catch (_error) {
      window.prompt("Copy connection details:", activeHealthJson);
    }
  }, [activeHealthJson]);

  return (
    <>
      <aside
        className={`fixed mt-16 flex h-screen flex-col border-r border-gray-200 bg-white px-5 text-gray-900 transition-all duration-300 ease-in-out dark:border-gray-800 dark:bg-gray-900 top-0 left-0 z-50 lg:mt-0 ${
        isExpanded || isMobileOpen ? "w-[290px]" : isHovered ? "w-[290px]" : "w-[90px]"
        } ${isMobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
        onMouseEnter={() => !isExpanded && setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          className={`flex flex-col gap-3 py-8 ${
          showFullLogo ? "items-start" : "items-center lg:items-center"
          }`}
        >
          <Link to="/">
            {showFullLogo ? (
              <>
                <img
                  className="dark:hidden"
                  src="/images/logo/logo.svg"
                  alt="Logo"
                  width={150}
                  height={40}
                />
                <img
                  className="hidden dark:block"
                  src="/images/logo/logo-dark.svg"
                  alt="Logo"
                  width={150}
                  height={40}
                />
              </>
            ) : (
              <img src="/images/logo/logo-icon.svg" alt="Logo" width={32} height={32} />
            )}
          </Link>
          {environmentBadge || showFullLogo ? (
            <div
              className={`flex items-center gap-2 ${
                showFullLogo ? "flex-wrap" : "justify-center"
              }`}
            >
              {environmentBadge && showFullLogo ? (
                <Badge
                  size="sm"
                  color={environmentBadge.color}
                  variant={environmentBadge.variant}
                >
                  {environmentBadge.label}
                </Badge>
              ) : null}
              <div className="flex items-center gap-2">
                <ConnectionStatusButton
                  service="firestore"
                  health={healthByService.firestore}
                  loading={loadingByService.firestore}
                  onClick={() => setSelectedService("firestore")}
                />
                <ConnectionStatusButton
                  service="postgres"
                  health={healthByService.postgres}
                  loading={loadingByService.postgres}
                  onClick={() => setSelectedService("postgres")}
                />
              </div>
            </div>
          ) : null}
        </div>
        <div className="no-scrollbar flex flex-col overflow-y-auto duration-300 ease-linear">
          <nav className="mb-6">
            <div className="flex flex-col gap-4">
              <div>
                <h2
                  className={`mb-4 flex text-xs uppercase leading-[20px] text-gray-400 ${
                    !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
                  }`}
                >
                  {canShowLabels ? "Menu" : <HorizontaLDots className="size-6" />}
                </h2>
                {mainMenu}
              </div>
              <div>
                <h2
                  className={`mb-4 flex text-xs uppercase leading-[20px] text-gray-400 ${
                    !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
                  }`}
                >
                  {canShowLabels ? "Others" : <HorizontaLDots />}
                </h2>
                {othersMenu}
              </div>
            </div>
          </nav>
          {canShowLabels ? <SidebarWidget /> : null}
        </div>
      </aside>
      <Modal
        isOpen={selectedService !== null}
        onClose={() => setSelectedService(null)}
        className="max-w-2xl p-6 lg:p-8"
      >
        <div className="space-y-6">
          <div className="border-b border-gray-200 pb-4 dark:border-gray-800">
            <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
              {selectedService ? serviceLabelByKey[selectedService] : "Service"} Status
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Connection status details are selectable and safe to copy.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {copyNotice ?? "Use Copy to copy the full JSON response."}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {selectedService ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void fetchHealth(selectedService)}
                  disabled={loadingByService[selectedService]}
                >
                  {loadingByService[selectedService] ? "Checking..." : "Refresh"}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleCopyHealth()}
                disabled={!activeHealthJson}
                startIcon={<CopyIcon className="size-4" />}
              >
                Copy
              </Button>
            </div>
          </div>

          {selectedService ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm leading-7 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
                <div className="select-text">
                  Service: {serviceLabelByKey[selectedService]}
                </div>
                <div className="select-text">
                  Status:{" "}
                  {loadingByService[selectedService]
                    ? "Checking..."
                    : activeHealth?.connected
                      ? "Connected"
                      : "Disconnected"}
                </div>
                <div className="select-text">
                  Checked at:{" "}
                  {activeHealth ? formatCheckedAt(activeHealth.checkedAt) : "Not checked yet"}
                </div>
                {activeHealth?.details.host ? (
                  <div className="select-text">Host: {activeHealth.details.host}</div>
                ) : null}
                {activeHealth?.details.database ? (
                  <div className="select-text">
                    Database: {activeHealth.details.database}
                  </div>
                ) : null}
                <div className="select-text">
                  {activeHealth?.connected ? "Message" : "Reason"}:{" "}
                  {activeHealth?.details.message ?? "Unavailable"}
                </div>
              </div>

              <pre className="max-h-[360px] overflow-auto rounded-2xl border border-gray-200 bg-gray-50 p-4 text-xs leading-6 text-gray-800 whitespace-pre-wrap select-text dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
                {activeHealthJson || "No response available yet."}
              </pre>
            </div>
          ) : null}

          <div className="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-800">
            <Button variant="outline" onClick={() => setSelectedService(null)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default AppSidebar;
