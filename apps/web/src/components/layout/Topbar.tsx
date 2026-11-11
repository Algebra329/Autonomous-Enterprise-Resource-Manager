import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CheckCheck,
  CircleAlert,
  ClipboardCheck,
  FileText,
  Globe,
  Menu,
  Search,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  DEFAULT_API_URL,
  getApiBaseUrl,
  setApiBaseUrlOverride,
} from "../../lib/api";
import {
  useHealthQuery,
  useInvalidateAerm,
  useLedgerQuery,
  useMandatesQuery,
  useProposalsQuery,
} from "../../lib/queries";

interface TopbarProps {
  onOpenSidebar: () => void;
}

interface DynamicNotification {
  id: string;
  title: string;
  message: string;
  time: string;
  type: "approval" | "executed" | "blocked" | "policy" | "system";
  destination: string;
}

interface SearchItem {
  id: string;
  title: string;
  description: string;
  category: string;
  destination: string;
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

const RENDER_API_PRESET = "https://autonomous-enterprise-resource-manager.onrender.com";

const staticNavSearch: SearchItem[] = [
  {
    id: "nav-dashboard",
    title: "AG Studio",
    description: "Procurement overview, live metrics, and autonomous run trigger",
    category: "Navigation",
    destination: "/dashboard",
  },
  {
    id: "nav-policies",
    title: "Procurement Policies",
    description: "Compile plain-English rules via DeepSeek & sign ES256 Intent Mandates",
    category: "Navigation",
    destination: "/policies",
  },
  {
    id: "nav-approvals",
    title: "Approval Queue",
    description: "Review pending purchases & approve with browser WebCrypto ES256",
    category: "Navigation",
    destination: "/approvals",
  },
  {
    id: "nav-arena",
    title: "Break-it Arena",
    description: "Run live adversarial probes, circuit breaker, and kill switch checks",
    category: "Navigation",
    destination: "/arena",
  },
  {
    id: "nav-audit",
    title: "Audit & Proof",
    description: "Inspect tamper-evident ledger hashes and order Proof Packs",
    category: "Navigation",
    destination: "/audit",
  },
];

function formatShortTime(iso?: string): string {
  if (!iso) return "Just now";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Topbar({ onOpenSidebar }: TopbarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const invalidateAll = useInvalidateAerm();

  const { data: health, isError: healthError } = useHealthQuery();
  const { data: proposals } = useProposalsQuery();
  const { data: ledger } = useLedgerQuery();
  const { data: mandates } = useMandatesQuery();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [endpointMenuOpen, setEndpointMenuOpen] = useState(false);
  const [apiInput, setApiInput] = useState(getApiBaseUrl);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());

  const title = pageTitles[location.pathname] ?? "AERM";
  const activeApiUrl = getApiBaseUrl();

  const notifications = useMemo<DynamicNotification[]>(() => {
    const items: DynamicNotification[] = [];

    for (const p of proposals ?? []) {
      if (p.status === "needs_approval") {
        const total = p.payload.quantity * p.payload.unit_price;
        items.push({
          id: `prop-${p.id}`,
          title:
            p.kind === "cancel"
              ? `Cancel subscription: ${p.payload.app || p.payload.sku}`
              : `Purchase awaiting approval (${p.payload.sku})`,
          message: `${p.payload.vendor_id} · $${total.toLocaleString()} ${p.payload.currency}${
            p.reason ? ` · ${p.reason}` : ""
          }`,
          time: formatShortTime(p.created_at),
          type: "approval",
          destination: "/approvals",
        });
      }
    }

    const recentLedger = [...(ledger?.entries ?? [])].reverse().slice(0, 6);
    for (const entry of recentLedger) {
      const id = `ledger-${entry.seq ?? entry.hash.slice(0, 10)}`;
      if (entry.type === "kill_switch_engaged") {
        items.push({
          id,
          title: "Emergency kill switch engaged",
          message: "All active mandates revoked and runs halted",
          time: formatShortTime(entry.created_at),
          type: "blocked",
          destination: "/arena",
        });
      } else if (
        entry.type === "order_executed" ||
        entry.type === "order_auto_executed"
      ) {
        const amount = Number(entry.data.amount ?? 0);
        const vendor = String(entry.data.vendor_id ?? "vendor");
        items.push({
          id,
          title: "Purchase executed & anchored",
          message: `${vendor} · $${amount.toLocaleString()} · #${entry.hash.slice(0, 8)}`,
          time: formatShortTime(entry.created_at),
          type: "executed",
          destination: "/audit",
        });
      } else if (entry.type === "mandate_registered") {
        items.push({
          id,
          title: "ES256 Intent Mandate signed",
          message: `Issuer ${String(entry.data.issuer ?? "manager")}`,
          time: formatShortTime(entry.created_at),
          type: "policy",
          destination: "/policies",
        });
      } else {
        items.push({
          id,
          title: entry.type.replace(/_/g, " "),
          message: `Ledger #${entry.seq ?? "-"} · ${entry.hash.slice(0, 10)}...`,
          time: formatShortTime(entry.created_at),
          type: "system",
          destination: "/audit",
        });
      }
    }

    if (items.length === 0) {
      items.push({
        id: "system-ready",
        title: healthError ? "Backend API unreachable" : "Workspace ready",
        message: healthError
          ? `Start @rm/api at ${activeApiUrl}`
          : `${health?.service ?? "@rm/api"} healthy`,
        time: "Live",
        type: "system",
        destination: "/dashboard",
      });
    }

    return items;
  }, [proposals, ledger, health, healthError, activeApiUrl]);

  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;

  const searchableItems = useMemo<SearchItem[]>(() => {
    const dynamicProposals: SearchItem[] = (proposals ?? []).map((p) => ({
      id: `search-prop-${p.id}`,
      title: `${p.kind === "cancel" ? "Cancel" : "Purchase"}: ${p.payload.app || p.payload.sku}`,
      description: `${p.payload.vendor_id} · $${(p.payload.quantity * p.payload.unit_price).toLocaleString()} · ${p.status}`,
      category: "Proposal",
      destination: p.status === "needs_approval" ? "/approvals" : "/audit",
    }));

    const dynamicMandates: SearchItem[] = (mandates ?? []).map((m) => ({
      id: `search-mand-${m.id}`,
      title: `Mandate (${m.status}) · ${m.issuer}`,
      description: m.source_text,
      category: "Policy Mandate",
      destination: "/policies",
    }));

    return [...staticNavSearch, ...dynamicProposals, ...dynamicMandates];
  }, [proposals, mandates]);

  const filteredResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return searchableItems;

    return searchableItems.filter((item) =>
      `${item.title} ${item.description} ${item.category}`
        .toLowerCase()
        .includes(query),
    );
  }, [searchQuery, searchableItems]);

  const openSearch = () => {
    setNotificationsOpen(false);
    setEndpointMenuOpen(false);
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
        setEndpointMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const markAllAsRead = () => {
    setReadIds(new Set(notifications.map((n) => n.id)));
  };

  const handleNotificationClick = (notification: DynamicNotification) => {
    setReadIds((prev) => new Set(prev).add(notification.id));
    setNotificationsOpen(false);
    navigate(notification.destination);
  };

  const handleSearchResultClick = (destination: string) => {
    closeSearch();
    navigate(destination);
  };

  const applyApiUrl = async (target: string | null) => {
    setApiBaseUrlOverride(target);
    const next = getApiBaseUrl();
    setApiInput(next);
    setEndpointMenuOpen(false);
    await invalidateAll();
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

      <div className="flex items-center gap-2 sm:gap-3">
        {/* API Endpoint Indicator & Switcher */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setNotificationsOpen(false);
              setSearchOpen(false);
              setApiInput(getApiBaseUrl());
              setEndpointMenuOpen((v) => !v);
            }}
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              healthError
                ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
            title={`Connected backend: ${activeApiUrl}`}
          >
            <Globe size={14} />
            <span className="hidden max-w-[160px] truncate md:inline">
              {activeApiUrl.includes("localhost")
                ? "Local API"
                : activeApiUrl.includes("onrender.com")
                  ? "Render Live"
                  : "Custom API"}
            </span>
          </button>

          {endpointMenuOpen && (
            <>
              <button
                aria-label="Close API switcher"
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setEndpointMenuOpen(false)}
              />
              <div className="absolute right-0 z-50 mt-3 w-[min(340px,calc(100vw-32px))] rounded-xl border border-zinc-200 bg-white p-4 shadow-xl">
                <p className="text-xs font-semibold text-zinc-900">
                  Backend API Target
                </p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Default from <code className="font-mono">VITE_API_URL</code>:{" "}
                  <code className="font-mono">{DEFAULT_API_URL}</code>
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void applyApiUrl("http://localhost:4000")}
                    className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                  >
                    localhost:4000
                  </button>
                  <button
                    type="button"
                    onClick={() => void applyApiUrl(RENDER_API_PRESET)}
                    className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                  >
                    Render Live API
                  </button>
                  <button
                    type="button"
                    onClick={() => void applyApiUrl(null)}
                    className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-500 hover:bg-zinc-50"
                  >
                    Reset Default
                  </button>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void applyApiUrl(apiInput);
                  }}
                  className="mt-3 flex gap-2"
                >
                  <input
                    value={apiInput}
                    onChange={(e) => setApiInput(e.target.value)}
                    placeholder="https://..."
                    className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 font-mono text-xs text-zinc-800 outline-none focus:border-emerald-500"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800"
                  >
                    Use
                  </button>
                </form>
              </div>
            </>
          )}
        </div>

        {/* Search */}
        <button
          onClick={openSearch}
          aria-label="Search"
          title="Search (Ctrl + K)"
          className="flex items-center gap-2 rounded-lg p-2.5 text-zinc-500 hover:bg-zinc-100"
        >
          <Search size={19} />
          <span className="hidden text-xs text-zinc-400 xl:inline">Search</span>
          <kbd className="hidden rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] text-zinc-400 xl:inline">
            Ctrl K
          </kbd>
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => {
              setSearchOpen(false);
              setEndpointMenuOpen(false);
              setNotificationsOpen((current) => !current);
            }}
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
                      Live Notifications
                    </h2>
                    <p className="mt-1 text-xs text-zinc-500">
                      {unreadCount} unread event{unreadCount === 1 ? "" : "s"}
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
                    const isRead = readIds.has(notification.id);

                    return (
                      <button
                        key={notification.id}
                        onClick={() => handleNotificationClick(notification)}
                        className={`flex w-full gap-3 border-b border-zinc-100 p-4 text-left transition-colors hover:bg-zinc-50 ${
                          !isRead ? "bg-emerald-50/40" : ""
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

                            {!isRead && (
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
          <p className="text-xs font-semibold text-zinc-800">AERM Workspace</p>
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
                placeholder="Search pages, proposals, and mandates..."
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
                    onClick={() => handleSearchResultClick(result.destination)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left hover:bg-zinc-50"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="truncate text-sm font-medium text-zinc-800">
                        {result.title}
                      </p>
                      <p className="mt-1 truncate text-xs text-zinc-500">
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
                  <Zap size={22} className="mx-auto text-zinc-300" />
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
              <span>Live search across workspace</span>
              <span>ESC to close</span>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
