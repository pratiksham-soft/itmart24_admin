import {
  AlertCircle,
  Bell,
  Bookmark,
  Bot,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  Gift,
  LayoutDashboard,
  Layers3,
  LifeBuoy,
  LogOut,
  Menu,
  MessageSquareText,
  Pin,
  PinOff,
  Receipt,
  Scale,
  CheckCircle2,
  Search,
  Settings,
  ShieldPlus,
  Sparkles,
  Star,
  WandSparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useNotifications } from "../../hooks/useNotifications";
import { useToast } from "../../hooks/useToast";
import { StatusBadge } from "../common/StatusBadge";

const sidebarLogoSrc = "/favicon-w.png";

const navigationGroups = [
  {
    label: "Overview",
    items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Manage",
    items: [
      { to: "/products-in-use", label: "Products I Use", icon: Star },
      {
        to: "/my-projects",
        label: "My Projects",
        icon: FolderKanban,
        children: [
          { to: "/my-projects/overview", label: "Overview", icon: Layers3 },
          { to: "/my-projects/all-projects", label: "All Projects Workspace", icon: FolderKanban },
          { to: "/my-projects/project-analyzer", label: "Project Analyzer Level 1", icon: Bot },
          { to: "/my-projects/project-analyzer/competitor-comparison", label: "Project Analyzer Level 2", icon: Sparkles },
          { to: "/my-projects/project-analyzer/growth-advisor", label: "Project Analyzer Level 3", icon: WandSparkles },
        ],
      },
    ],
  },
  {
    label: "Research",
    items: [
      { to: "/saved-products", label: "Saved Products", icon: Bookmark },
      { to: "/saved-comparisons", label: "Saved Comparisons", icon: Scale },
    ],
  },
  {
    label: "Community",
    items: [
      { to: "/reviews", label: "My Reviews", icon: MessageSquareText },
      { to: "/rewards", label: "Rewards", icon: Gift },
    ],
  },
  {
    label: "Account",
    items: [
      {
        to: "/account/plans",
        label: "Plans",
        icon: ShieldPlus,
        children: [
          { to: "/account/plans", label: "Plans", icon: ShieldPlus },
          { to: "/account/billing", label: "Billing", icon: Receipt },
        ],
      },
      { to: "/notifications", label: "Notifications", icon: Bell },
      { to: "/support", label: "Support", icon: LifeBuoy },
      { to: "/settings", label: "My Settings", icon: Settings },
    ],
  },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
    "/my-projects": location.pathname.startsWith("/my-projects"),
    "/account/plans": location.pathname.startsWith("/account/"),
  });

  async function handleLogout() {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);
    try {
      await logout();
      pushToast("You have been logged out successfully.", "success");
      navigate("/login", { replace: true });
    } finally {
      setLoggingOut(false);
    }
  }

  function toggleSubmenu(itemTo: string) {
    setExpandedMenus((current) => ({
      ...current,
      [itemTo]: !current[itemTo],
    }));
  }

  const desktopSidebarExpanded = sidebarPinned || sidebarHovered;
  const sidebarExpanded = mobileNavOpen || desktopSidebarExpanded;
  const emailVerified = Boolean(user?.email_verified ?? user?.emailVerified);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_rgba(11,96,145,0.15),_transparent_28%),linear-gradient(180deg,#f8fbff_0%,#eef4ff_45%,#f7f7fb_100%)] text-slate-900">
      <div className="flex min-h-screen">
        {mobileNavOpen ? <button type="button" aria-label="Close navigation overlay" onClick={() => setMobileNavOpen(false)} className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-sm lg:hidden" /> : null}

        <aside
          onMouseEnter={() => {
            if (!sidebarPinned) {
              setSidebarHovered(true);
            }
          }}
          onMouseLeave={() => {
            if (!sidebarPinned) {
              setSidebarHovered(false);
            }
          }}
          className={[
            "portal-card-strong fixed inset-y-0 left-0 z-40 flex w-[min(86vw,320px)] flex-col rounded-none border-y-0 border-l-0 p-4 transition-[width,transform] duration-300 ease-out lg:translate-x-0",
            desktopSidebarExpanded ? "lg:w-[310px]" : "lg:w-[104px]",
            mobileNavOpen ? "translate-x-0" : "-translate-x-[110%] lg:translate-x-0",
          ].join(" ")}
        >
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                if (!desktopSidebarExpanded) {
                  setSidebarHovered(true);
                  return;
                }

                navigate("/dashboard");
                setMobileNavOpen(false);
              }}
              className="flex min-w-0 items-center gap-3 text-left"
              aria-label={desktopSidebarExpanded ? "Go to dashboard" : "Preview sidebar"}
            >
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/10">
                <img src={sidebarLogoSrc} alt="ITMart24" className="h-8 w-8 object-contain" />
              </div>
              <div
                className={[
                  "min-w-0 overflow-hidden transition-[max-width,opacity,transform] duration-300 ease-out",
                  sidebarExpanded ? "max-w-[180px] translate-x-0 opacity-100" : "max-w-0 -translate-x-2 opacity-0",
                ].join(" ")}
              >
                <p className="text-xs uppercase tracking-[0.28em] text-sky-200">ITMart24</p>
                <h1 className="text-xl font-semibold">User Portal</h1>
              </div>
            </button>
            <div className="flex items-center gap-2">
              {sidebarExpanded ? (
                <button
                  type="button"
                  onClick={() => {
                    const nextPinned = !sidebarPinned;
                    setSidebarPinned(nextPinned);
                    if (!nextPinned) {
                      setSidebarHovered(false);
                    }
                  }}
                  className={[
                    "hidden rounded-full border p-2 transition lg:inline-flex",
                    sidebarPinned ? "border-sky-300/60 bg-sky-500/15 text-sky-100" : "border-white/10 text-slate-300 hover:bg-white/10",
                  ].join(" ")}
                  aria-label={sidebarPinned ? "Unpin sidebar" : "Pin sidebar"}
                  title={sidebarPinned ? "Sidebar pinned" : "Pin sidebar open"}
                >
                  {sidebarPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                </button>
              ) : null}
              <button type="button" onClick={() => setMobileNavOpen(false)} className="rounded-full border border-white/10 p-2 text-slate-300 lg:hidden">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-6 min-h-0 flex-1 overflow-y-auto pr-1">
            <div
              className={[
                "overflow-hidden rounded-[1.7rem] border border-white/10 bg-white/5 transition-[max-height,opacity,margin,padding,transform] duration-300 ease-out",
                sidebarExpanded ? "mt-0 max-h-60 translate-y-0 p-4 opacity-100" : "max-h-0 -translate-y-2 px-4 py-0 opacity-0 border-transparent",
              ].join(" ")}
            >
              <div className="flex items-center gap-2 text-sky-200">
                <Sparkles className="h-4 w-4" />
                <p className="text-xs uppercase tracking-[0.2em]">Member Workspace</p>
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-300">Research products, manage subscriptions, and keep trusted buyer activity organized in one premium member experience.</p>
            </div>

            <div className="mt-6 space-y-7">
              {navigationGroups.map((group) => (
                <div key={group.label}>
                  <p
                    className={[
                      "overflow-hidden px-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 transition-[max-height,opacity,margin,transform] duration-300 ease-out",
                      sidebarExpanded ? "mb-3 max-h-8 translate-y-0 opacity-100" : "mb-0 max-h-0 -translate-y-1 opacity-0",
                    ].join(" ")}
                  >
                    {group.label}
                  </p>
                  <div className="space-y-2">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isNotificationsItem = item.to === "/notifications";
                      const childItems = "children" in item ? item.children : undefined;
                      const childRouteActive = childItems?.some((child) => location.pathname === child.to || location.pathname.startsWith(`${child.to}/`));
                      const parentActive = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`) || childRouteActive;
                      const submenuExpanded = childItems ? Boolean(expandedMenus[item.to] || childRouteActive) : false;

                      return (
                        <div key={item.to} className="space-y-2">
                          {childItems ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (!sidebarExpanded) {
                                  setSidebarHovered(true);
                                  return;
                                }

                                toggleSubmenu(item.to);
                              }}
                              className={[
                                "group flex w-full items-center rounded-2xl px-4 py-3 text-sm font-medium transition",
                                sidebarExpanded ? "justify-between" : "justify-center lg:px-3",
                                parentActive ? "bg-sky-600 text-white shadow-[0_22px_44px_-28px_rgba(14,165,233,0.7)]" : "text-slate-300 hover:bg-white/10 hover:text-white",
                              ].join(" ")}
                              title={!sidebarExpanded ? item.label : undefined}
                              aria-expanded={submenuExpanded}
                              aria-label={sidebarExpanded ? `${submenuExpanded ? "Collapse" : "Expand"} ${item.label} submenu` : `Preview ${item.label} submenu`}
                            >
                              <span className={["flex items-center", sidebarExpanded ? "gap-3" : "justify-center"].join(" ")}>
                                <span className={["flex h-10 w-10 items-center justify-center rounded-xl transition", parentActive ? "bg-white/14 text-white" : "bg-white/5 text-slate-300 group-hover:bg-white/10 group-hover:text-white"].join(" ")}>
                                  <Icon className="h-5 w-5" />
                                </span>
                                <span
                                  className={[
                                    "overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-300 ease-out",
                                    sidebarExpanded ? "max-w-[190px] translate-x-0 opacity-100" : "max-w-0 -translate-x-2 opacity-0",
                                  ].join(" ")}
                                >
                                  <span className="block text-left font-semibold">{item.label}</span>
                                  <span className={["mt-0.5 block text-xs", parentActive ? "text-sky-100/80" : "text-slate-400 group-hover:text-slate-300"].join(" ")}>
                                    {childItems.length} sections
                                  </span>
                                </span>
                              </span>
                              {sidebarExpanded ? (
                                <span className={["flex h-9 w-9 items-center justify-center rounded-xl border transition", parentActive ? "border-white/20 bg-white/12 text-white" : "border-white/10 bg-white/5 text-slate-400 group-hover:border-white/20 group-hover:text-white"].join(" ")}>
                                  {submenuExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </span>
                              ) : null}
                            </button>
                          ) : (
                            <NavLink
                              to={item.to}
                              onClick={() => setMobileNavOpen(false)}
                              className={() =>
                                [
                                  "group flex items-center rounded-2xl px-4 py-3 text-sm font-medium transition",
                                  sidebarExpanded ? "justify-between" : "justify-center lg:px-3",
                                  parentActive ? "bg-sky-600 text-white shadow-[0_22px_44px_-28px_rgba(14,165,233,0.7)]" : "text-slate-300 hover:bg-white/10 hover:text-white",
                                ].join(" ")
                              }
                              title={!sidebarExpanded ? item.label : undefined}
                            >
                              <span className={["flex items-center", sidebarExpanded ? "gap-3" : "justify-center"].join(" ")}>
                                <span className={["flex h-10 w-10 items-center justify-center rounded-xl transition", parentActive ? "bg-white/14 text-white" : "bg-white/5 text-slate-300 group-hover:bg-white/10 group-hover:text-white"].join(" ")}>
                                  <Icon className="h-5 w-5" />
                                </span>
                                <span
                                  className={[
                                    "overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-300 ease-out",
                                    sidebarExpanded ? "max-w-[190px] translate-x-0 opacity-100" : "max-w-0 -translate-x-2 opacity-0",
                                  ].join(" ")}
                                >
                                  <span className="inline-flex items-center gap-2">
                                    <span>{item.label}</span>
                                    {isNotificationsItem && unreadCount > 0 ? (
                                      <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-sm font-semibold leading-none text-red-200">
                                        {unreadCount}
                                      </span>
                                    ) : null}
                                  </span>
                                </span>
                              </span>
                              <ChevronRight
                                className={[
                                  "h-4 w-4 transition-[opacity,transform,max-width] duration-300 ease-out group-hover:opacity-100",
                                  sidebarExpanded ? "max-w-4 translate-x-0 opacity-0" : "max-w-0 translate-x-1 opacity-0",
                                ].join(" ")}
                              />
                            </NavLink>
                          )}

                          {childItems && sidebarExpanded ? (
                            <div
                              className={[
                                "grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-out",
                                submenuExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-70",
                              ].join(" ")}
                            >
                              <div className="overflow-hidden">
                                <div className="ml-3 rounded-2xl border border-white/8 bg-white/4 p-2">
                                  <div className="space-y-1">
                                    {childItems.map((child) => {
                                      const ChildIcon = child.icon;
                                      const childActive = location.pathname === child.to || location.pathname.startsWith(`${child.to}/`);
                                      return (
                                        <NavLink
                                          key={child.to}
                                          to={child.to}
                                          onClick={() => setMobileNavOpen(false)}
                                          className={[
                                            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                                            childActive ? "bg-white/12 text-white" : "text-slate-400 hover:bg-white/8 hover:text-white",
                                          ].join(" ")}
                                        >
                                          <span className={["flex h-8 w-8 items-center justify-center rounded-lg", childActive ? "bg-white/12 text-white" : "bg-white/5 text-slate-400"].join(" ")}>
                                            <ChildIcon className="h-4 w-4" />
                                          </span>
                                          <span className="truncate">{child.label}</span>
                                        </NavLink>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div
              className={[
                "mt-6 border border-white/10 bg-white/5 transition-[padding,border-radius] duration-300 ease-out",
                sidebarExpanded ? "rounded-[1.7rem] p-4" : "flex justify-center rounded-[1.3rem] p-2",
              ].join(" ")}
            >
              <div
                className={[
                  "overflow-hidden transition-[max-height,opacity,transform] duration-300 ease-out",
                  sidebarExpanded ? "max-h-80 translate-y-0 opacity-100" : "max-h-0 translate-y-1 opacity-0",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Signed in as</p>
                    <p className="mt-2 text-base font-semibold">{user?.full_name ?? user?.fullName ?? "Member"}</p>
                    <p className="text-sm text-slate-400">{user?.email}</p>
                  </div>
                  {!sidebarPinned ? <StatusBadge label="Hover mode" tone="info" /> : null}
                </div>
                <Link
                  to="/settings"
                  onClick={() => setMobileNavOpen(false)}
                  className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-white/15 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  View/Edit Profile
                </Link>
                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusBadge label="Protected access" tone="dark" />
                  {sidebarPinned ? <StatusBadge label="Pinned" tone="success" /> : null}
                </div>
              </div>
              <button
                onClick={() => void handleLogout()}
                disabled={loggingOut}
                className={[
                  "inline-flex items-center text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-60",
                  sidebarExpanded ? "mt-5 w-full justify-center gap-2 rounded-full border border-white/15 px-4 py-2.5" : "h-12 w-12 justify-center rounded-[1rem] border-0 bg-transparent",
                ].join(" ")}
                title={!sidebarExpanded ? "Logout" : undefined}
              >
                <LogOut className="h-4 w-4" />
                <span
                  className={[
                    "overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-300 ease-out",
                    sidebarExpanded ? "max-w-24 translate-x-0 opacity-100" : "max-w-0 -translate-x-2 opacity-0",
                  ].join(" ")}
                >
                  {loggingOut ? "Logging out..." : "Logout"}
                </span>
              </button>
            </div>
          </div>
        </aside>

        <div
          className={[
            "min-w-0 w-full p-4 transition-[padding,margin,width] duration-300 ease-out md:p-5 lg:p-6",
            desktopSidebarExpanded ? "lg:ml-[310px] lg:w-[calc(100%-310px)]" : "lg:ml-[104px] lg:w-[calc(100%-104px)]",
          ].join(" ")}
        >
          <div className="portal-card mb-5 w-full p-4 md:p-4.5">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <button type="button" onClick={() => setMobileNavOpen((value) => !value)} className="portal-button-secondary lg:hidden">
                  <Menu className="h-4 w-4" />
                  Menu
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-3 xl:flex-row xl:flex-nowrap xl:items-center xl:gap-4">
                    <div className="shrink-0">
                      <div id="page-header-eyebrow-slot" />
                    </div>

                    <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:items-center xl:min-w-0 xl:flex-1 xl:flex-nowrap xl:gap-3">
                      <label
                        className={[
                          "relative block w-full min-w-0 flex-1 transition-[max-width] duration-300 ease-out",
                          desktopSidebarExpanded ? "xl:max-w-[24rem]" : "xl:max-w-none",
                        ].join(" ")}
                      >
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input className={["portal-input pl-11", desktopSidebarExpanded ? "py-2.5" : "py-3"].join(" ")} placeholder="Search products, comparisons, reviews, or support..." />
                      </label>
                      <div className="flex shrink-0 flex-wrap items-center gap-2.5 sm:flex-nowrap">
                        <Link to="/notifications" className="portal-button-secondary shrink-0 gap-2">
                          <Bell className="h-4 w-4" />
                          Notifications
                          {unreadCount > 0 ? (
                            <span className="rounded-full bg-red-50 px-2 py-0.5 text-sm font-semibold text-red-600">
                              {unreadCount}
                            </span>
                          ) : null}
                        </Link>
                        <div className="portal-subtle-card flex shrink-0 items-center gap-3 px-3.5 py-2">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-50 text-sm font-semibold text-sky-700">
                            {(user?.full_name ?? user?.fullName ?? "M").slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{user?.full_name ?? user?.fullName ?? "Member"}</p>
                            <div className="flex items-center gap-1.5">
                              <p className="truncate text-xs text-slate-500">{user?.email}</p>
                              <button
                                type="button"
                                onClick={() => navigate("/settings#email-verification")}
                                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                                aria-label={emailVerified ? "Email verified" : "Email verification pending"}
                                title={emailVerified ? "Email verified" : "Verify your email"}
                              >
                                {emailVerified ? (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                ) : (
                                  <AlertCircle className="h-4 w-4 text-amber-500" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-col gap-2">
                    <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                      <div id="page-header-title-slot" />
                      <div id="page-header-actions-slot" />
                    </div>
                    <div id="page-header-description-slot" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
