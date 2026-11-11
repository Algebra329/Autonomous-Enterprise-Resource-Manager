import { NavLink } from "react-router-dom";
import {
  Activity,
  ChevronLeft,
  ClipboardCheck,
  FlaskConical,
  KeyRound,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
  X,
} from "lucide-react";

import { useBreakerQuery, useHealthQuery, useProposalsQuery } from "../../lib/queries";
import { useAermSigner } from "../../lib/useAermSigner";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({
  isOpen,
  onClose,
  isCollapsed,
  onToggleCollapse,
}: SidebarProps) {
  const { data: proposals } = useProposalsQuery();
  const { data: health, isError: healthError } = useHealthQuery();
  const { data: breaker } = useBreakerQuery();
  const { signer } = useAermSigner();

  const pendingApprovalCount = (proposals ?? []).filter(
    (p) => p.status === "needs_approval",
  ).length;

  const isHalted =
    Boolean(breaker?.kill_switch_active) ||
    breaker?.circuit_breaker.state === "open";

  const navigation = [
    {
      label: "WORKSPACE",
      items: [
        {
          name: "AG Studio",
          path: "/dashboard",
          icon: LayoutDashboard,
        },
        {
          name: "Procurement Policies",
          path: "/policies",
          icon: ShieldCheck,
        },
        {
          name: "Approval Queue",
          path: "/approvals",
          icon: ClipboardCheck,
          count: pendingApprovalCount,
        },
      ],
    },
    {
      label: "GOVERNANCE",
      items: [
        {
          name: "Break-it Arena",
          path: "/arena",
          icon: FlaskConical,
        },
        {
          name: "Audit & Proof",
          path: "/audit",
          icon: ScrollText,
        },
      ],
    },
  ];

  return (
    <>
      {isOpen && (
        <button
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-zinc-800 bg-zinc-950 text-zinc-300 transition-all duration-300 lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } ${isCollapsed ? "w-[76px]" : "w-[260px]"}`}
      >
        <div className="flex h-[76px] items-center justify-between border-b border-zinc-800 px-5">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400 text-zinc-950">
              <Activity size={21} strokeWidth={2.5} />
            </div>

            {!isCollapsed && (
              <div className="min-w-0">
                <p className="text-base font-bold tracking-wide text-white">
                  AERM
                </p>
                <p className="text-[10px] tracking-[0.16em] text-zinc-500">
                  ENTERPRISE CONTROL
                </p>
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            aria-label="Close sidebar"
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-8 overflow-y-auto px-3 py-7">
          {navigation.map((section) => (
            <div key={section.label}>
              {!isCollapsed && (
                <p className="mb-3 px-3 text-[10px] font-semibold tracking-[0.18em] text-zinc-600">
                  {section.label}
                </p>
              )}

              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;

                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={onClose}
                      title={isCollapsed ? item.name : undefined}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors ${
                          isActive
                            ? "bg-emerald-400/10 font-medium text-emerald-400"
                            : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                        } ${isCollapsed ? "justify-center" : ""}`
                      }
                    >
                      <Icon size={19} className="shrink-0" />

                      {!isCollapsed && (
                        <>
                          <span className="flex-1">{item.name}</span>

                          {"count" in item && typeof item.count === "number" && (
                            <span
                              className={`rounded-md px-2 py-0.5 text-xs ${
                                item.count > 0
                                  ? "bg-amber-500/20 font-semibold text-amber-300"
                                  : "bg-zinc-800 text-zinc-400"
                              }`}
                            >
                              {item.count}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-zinc-800 p-3 space-y-2">
          {!isCollapsed && (
            <div className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-2 text-[11px]">
              <span className="flex items-center gap-2 text-zinc-400">
                <span
                  className={`size-2 rounded-full ${
                    healthError
                      ? "bg-red-500"
                      : isHalted
                        ? "bg-amber-400"
                        : health?.status === "ok"
                          ? "bg-emerald-400"
                          : "bg-zinc-500"
                  }`}
                />
                {healthError
                  ? "API Offline"
                  : isHalted
                    ? "Safety Halted"
                    : health?.status === "ok"
                      ? "API Connected"
                      : "Connecting..."}
              </span>
              <span className="font-mono text-[10px] text-zinc-500">ES256</span>
            </div>
          )}

          <div
            className={`flex items-center gap-3 rounded-lg bg-zinc-900 p-3 ${
              isCollapsed ? "justify-center" : ""
            }`}
            title={
              signer
                ? `ES256 Signer: ${signer.issuer} (${signer.fingerprint})`
                : "Initializing P-256 signing key"
            }
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-sm font-bold text-emerald-400">
              <KeyRound size={16} />
            </div>

            {!isCollapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {signer ? signer.issuer : "Manager Key"}
                </p>
                <p className="truncate font-mono text-[11px] text-zinc-500">
                  {signer ? `P-256 · ${signer.fingerprint}` : "Initializing..."}
                </p>
              </div>
            )}
          </div>

          <button
            onClick={onToggleCollapse}
            className="mt-1 hidden w-full items-center justify-center rounded-lg p-2 text-zinc-500 hover:bg-zinc-900 hover:text-white lg:flex"
            aria-label="Toggle sidebar width"
          >
            <ChevronLeft
              size={18}
              className={`transition-transform ${
                isCollapsed ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>
      </aside>
    </>
  );
}
