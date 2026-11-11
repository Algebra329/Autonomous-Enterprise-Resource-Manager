import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CheckCheck,
  CircleAlert,
  ClipboardCheck,
  FileText,
  Menu,
  Search,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  initialNotifications,
  searchableItems,
  type NotificationItem,
} from "../../features/dashboard/data/dashboard.mock";

interface TopbarProps {
  onOpenSidebar: () => void;
}

const pageTitles: Record<string, string> = {
  "/dashboard": "AG Studio",
  "/policies": "Procurement Policies",
  "/approvals": "Approval Queue",
  "/arena": "Break-it Arena",
  "/audit": "Audit & Proof",
};

const notificationIcons = {
  approval: ClipboardCheck,
  executed: CheckCheck,
  blocked: CircleAlert,
  policy: FileText,
  system: ShieldCheck,
};

export default function Topbar({ onOpenSidebar }: TopbarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] =
    useState<NotificationItem[]>(initialNotifications);

  const title = pageTitles[location.pathname] ?? "AERM";

  const unreadCount = notifications.filter(
    (notification) => !notification.read,
  ).length;

  const filteredResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) return searchableItems;

    return searchableItems.filter((item) =>
      `${item.title} ${item.description} ${item.category}`
        .toLowerCase()
        .includes(query),
    );
  }, [searchQuery]);

  const openSearch = () => {
    setNotificationsOpen(false);
    setSearchOpen(true);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch();
      }

      if (event.key === "Escape") {
        closeSearch();
        setNotificationsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const toggleNotifications = () => {
    setSearchOpen(false);
    setNotificationsOpen((current) => !current);
  };

  const markNotificationAsRead = (id: string) => {
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === id
          ? { ...notification, read: true }
          : notification,
      ),
    );
  };

  const markAllAsRead = () => {
    setNotifications((current) =>
      current.map((notification) => ({ ...notification, read: true })),
    );
  };

  const handleNotificationClick = (notification: NotificationItem) => {
    markNotificationAsRead(notification.id);
    setNotificationsOpen(false);
    navigate(notification.destination);
  };

  const handleSearchResultClick = (destination: string) => {
    closeSearch();
    navigate(destination);
  };

  return (
    <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-zinc-200 bg-white/95 px-4 backdrop-blur-md sm:px-7 lg:px-9">
      <div className="flex items-center gap-4">
        <button
          onClick={onOpenSidebar}
          aria-label="Open navigation"
          className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 lg:hidden"
        >
          <Menu size={21} />
        </button>

        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-400">
            Workspace / {title}
          </p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-zinc-900">
            {title}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        {/* Search */}
        <button
          onClick={openSearch}
          aria-label="Search"
          title="Search (Ctrl + K)"
          className="flex items-center gap-2 rounded-lg p-2.5 text-zinc-500 hover:bg-zinc-100"
        >
          <Search size={19} />
          <span className="hidden text-xs text-zinc-400 xl:inline">
            Search
          </span>
          <kbd className="hidden rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] text-zinc-400 xl:inline">
            Ctrl K
          </kbd>
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={toggleNotifications}
            aria-label={`Notifications, ${unreadCount} unread`}
            aria-expanded={notificationsOpen}
            className="relative rounded-lg p-2.5 text-zinc-500 hover:bg-zinc-100"
          >
            <Bell size={19} />

            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex size-[17px] items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white ring-2 ring-white">
                {unreadCount}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <>
              <button
                aria-label="Close notifications"
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setNotificationsOpen(false)}
              />

              <div className="absolute right-0 z-50 mt-3 w-[min(360px,calc(100vw-32px))] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-zinc-100 p-4">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-900">
                      Notifications
                    </h2>
                    <p className="mt-1 text-xs text-zinc-500">
                      {unreadCount} unread notification
                      {unreadCount === 1 ? "" : "s"}
                    </p>
                  </div>

                  <button
                    onClick={markAllAsRead}
                    disabled={unreadCount === 0}
                    className="text-xs font-medium text-emerald-700 hover:text-emerald-800 disabled:cursor-not-allowed disabled:text-zinc-300"
                  >
                    Mark all as read
                  </button>
                </div>

                <div className="max-h-[400px] overflow-y-auto">
                  {notifications.map((notification) => {
                    const Icon = notificationIcons[notification.type];

                    return (
                      <button
                        key={notification.id}
                        onClick={() =>
                          handleNotificationClick(notification)
                        }
                        className={`flex w-full gap-3 border-b border-zinc-100 p-4 text-left transition-colors hover:bg-zinc-50 ${
                          !notification.read ? "bg-emerald-50/40" : ""
                        }`}
                      >
                        <div className="mt-0.5 rounded-lg bg-zinc-100 p-2 text-zinc-600">
                          <Icon size={17} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold text-zinc-900">
                              {notification.title}
                            </p>

                            {!notification.read && (
                              <span className="mt-1 size-2 shrink-0 rounded-full bg-emerald-500" />
                            )}
                          </div>

                          <p className="mt-1 text-xs leading-5 text-zinc-500">
                            {notification.message}
                          </p>

                          <p className="mt-2 text-[10px] text-zinc-400">
                            {notification.time}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="bg-zinc-50 p-3 text-center">
                  <button
                    onClick={() => {
                      setNotificationsOpen(false);
                      navigate("/audit");
                    }}
                    className="text-xs font-semibold text-zinc-600 hover:text-emerald-700"
                  >
                    View audit records
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="hidden h-8 w-px bg-zinc-200 sm:block" />

        <div className="hidden text-right sm:block">
          <p className="text-xs font-semibold text-zinc-800">
            AERM Workspace
          </p>
          <p className="text-[11px] text-zinc-500">PayPal AI Hackathon</p>
        </div>
      </div>

      {/* Search command panel */}
      {searchOpen && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 pt-[15vh] backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search workspace"
            className="w-full max-w-xl overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-zinc-100 px-4">
              <Search size={20} className="shrink-0 text-zinc-400" />

              <input
                autoFocus
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search pages, purchases, and policies..."
                className="h-14 min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
              />

              <button
                onClick={closeSearch}
                aria-label="Close search"
                className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100"
              >
                <X size={17} />
              </button>
            </div>

            <div className="max-h-[360px] overflow-y-auto p-2">
              {filteredResults.length > 0 ? (
                filteredResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() =>
                      handleSearchResultClick(result.destination)
                    }
                    className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left hover:bg-zinc-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-zinc-800">
                        {result.title}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {result.description}
                      </p>
                    </div>

                    <div className="ml-3 shrink-0 text-[10px] text-zinc-400">
                      {result.category}
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-4 py-10 text-center">
                  <Zap
                    size={22}
                    className="mx-auto text-zinc-300"
                  />
                  <p className="mt-3 text-sm font-medium text-zinc-700">
                    No results found
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">
                    Try another search term.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50 px-4 py-3 text-[10px] text-zinc-400">
              <span>Search across your workspace</span>
              <span>ESC to close</span>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}