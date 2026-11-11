import { useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  DollarSign,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { api, ApiClientError, type RunSummary } from "../lib/api";
import {
  useBacktestQuery,
  useBreakerQuery,
  useHealthQuery,
  useInvalidateAerm,
  useLedgerQuery,
  useMandatesQuery,
  useOrdersQuery,
  useProposalsQuery,
  useRunsQuery,
} from "../lib/queries";

function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: amount >= 1000 ? 0 : 2,
  }).format(amount);
}

function formatTime(iso?: string): string {
  if (!iso) return "Recent";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const invalidateAll = useInvalidateAerm();

  const { data: health, isError: healthError } = useHealthQuery();
  const { data: proposals } = useProposalsQuery();
  const { data: mandates } = useMandatesQuery();
  const { data: orders } = useOrdersQuery();
  const { data: breaker } = useBreakerQuery();
  const { data: ledger } = useLedgerQuery();
  const { data: backtest, refetch: refetchBacktest, isFetching: backtestLoading } =
    useBacktestQuery();
  const { data: runs } = useRunsQuery();

  const [runningPipeline, setRunningPipeline] = useState(false);
  const [lastRun, setLastRun] = useState<RunSummary | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const proposalList = proposals ?? [];
  const orderList = orders ?? [];
  const mandateList = mandates ?? [];
  const ledgerEntries = ledger?.entries ?? [];

  const totalOrderSpend = orderList.reduce((sum, o) => sum + o.amount, 0);
  const pendingProposals = proposalList.filter((p) => p.status === "needs_approval");
  const pendingValue = pendingProposals.reduce(
    (sum, p) => sum + p.payload.quantity * p.payload.unit_price,
    0,
  );
  const blockedProposals = proposalList.filter((p) => p.status === "blocked");
  const activeMandates = mandateList.filter((m) => m.status === "active");
  const resolvedCount = proposalList.filter(
    (p) => p.status === "executed" || p.status === "rejected" || p.status === "auto_approved",
  ).length;
  const resolutionPct =
    proposalList.length > 0 ? Math.round((resolvedCount / proposalList.length) * 100) : 100;

  const realizedSavings = backtest?.backtest.summary.realized_savings ?? 0;
  const potentialSavings = backtest?.backtest.summary.potential_savings ?? 0;
  const weeklyRows = backtest?.backtest.weekly ?? [];
  const maxWeeklySavings = Math.max(
    1,
    ...weeklyRows.map((w) => Math.max(0, w.projected_savings)),
  );

  const breakerOpen =
    Boolean(breaker?.kill_switch_active) ||
    breaker?.circuit_breaker.state === "open";
  const spendLastHour = breaker?.circuit_breaker.rolling_metrics.spend_last_hour ?? 0;
  const maxSpendPerHour = breaker?.circuit_breaker.rules.max_spend_per_hour ?? 5000;
  const spendUtilizationPct = Math.min(
    100,
    Math.round((spendLastHour / Math.max(1, maxSpendPerHour)) * 100),
  );

  const latestActiveCap = activeMandates[0]?.constraints.monthly_cap ?? 12000;
  const mandateCapPct = Math.min(
    100,
    Math.round((totalOrderSpend / Math.max(1, latestActiveCap)) * 100),
  );

  const handleRunWorkflow = async () => {
    setRunningPipeline(true);
    setRunError(null);
    try {
      const result = await api.triggerWorkflowRun({ trigger: "manual" });
      setLastRun(result);
      await invalidateAll();
    } catch (err) {
      setRunError(
        err instanceof ApiClientError || err instanceof Error
          ? err.message
          : "Failed to trigger autonomous run",
      );
    } finally {
      setRunningPipeline(false);
    }
  };

  const metricCards = [
    {
      label: "Executed spend (live)",
      value: formatUsd(totalOrderSpend),
      change: `${orderList.length} executed order${orderList.length === 1 ? "" : "s"}`,
      trend: "down" as const,
      description: `across ${runs?.length ?? 0} workflow run${(runs?.length ?? 0) === 1 ? "" : "s"}`,
      icon: Wallet,
    },
    {
      label: "90-day replay savings",
      value: formatUsd(realizedSavings),
      change: `${formatUsd(potentialSavings)} potential`,
      trend: "up" as const,
      description: "synthetic history backtest",
      icon: DollarSign,
    },
    {
      label: "Pending approvals",
      value: String(pendingProposals.length),
      change: formatUsd(pendingValue),
      trend: "neutral" as const,
      description: "awaiting ES256 human sign-off",
      icon: Clock3,
    },
    {
      label: "Active mandates & guard",
      value: `${activeMandates.length} active`,
      change: `${blockedProposals.length} blocked · ${ledgerEntries.length} ledger`,
      trend: "neutral" as const,
      description:
        ledger?.chain_status === "TAMPERED"
          ? "Ledger TAMPERED"
          : "Hash chain VALID",
      icon: ShieldCheck,
    },
  ];

  const recentFeed = [
    ...proposalList.map((p) => ({
      id: `prop-${p.id}`,
      title:
        p.kind === "cancel"
          ? `Cancel idle SaaS: ${p.payload.app || p.payload.sku}`
          : `Purchase ${p.payload.quantity}x ${p.payload.sku}`,
      detail: `${p.payload.vendor_id} · ${p.reason || (p.failing_rules.length > 0 ? p.failing_rules.join(", ") : "Within policy")}`,
      amount:
        p.kind === "cancel" && p.payload.savings_monthly
          ? `Save ${formatUsd(p.payload.savings_monthly)}/mo`
          : formatUsd(p.payload.quantity * p.payload.unit_price),
      status: p.status,
      time: formatTime(p.created_at),
      destination: p.status === "needs_approval" ? "/approvals" : "/audit",
    })),
  ].slice(0, 6);

  return (
    <div className="space-y-8">
      {/* Page introduction */}
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span
              className={`size-2 rounded-full ${
                healthError
                  ? "bg-red-500"
                  : breakerOpen
                    ? "bg-amber-500"
                    : "bg-emerald-500"
              }`}
            />
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
              {healthError
                ? "API disconnected"
                : `${health?.service ?? "@rm/api"} · Live backend connected`}
            </span>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
            Procurement overview
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            Trigger autonomous asset/seat scans, monitor deterministic{" "}
            <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs text-zinc-700">
              @rm/guard
            </code>{" "}
            verdicts, and review pending ES256 human approvals.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
              healthError
                ? "border-red-200 bg-red-50 text-red-700"
                : breakerOpen
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {healthError
              ? "OFFLINE · START API"
              : breaker?.kill_switch_active
                ? "KILL SWITCH ENGAGED"
                : breakerOpen
                  ? "BREAKER OPEN"
                  : "LIVE API · BREAKER ARMED"}
          </span>

          <button
            type="button"
            onClick={() => void handleRunWorkflow()}
            disabled={runningPipeline || healthError}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {runningPipeline ? (
              <RefreshCw size={15} className="animate-spin" />
            ) : (
              <Play size={15} />
            )}
            {runningPipeline ? "Running workflow..." : "Run Autonomous Pipeline"}
          </button>
        </div>
      </section>

      {runError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <ShieldAlert size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Workflow execution halted</p>
            <p className="mt-1 text-xs">{runError}</p>
          </div>
        </div>
      )}

      {lastRun?.metrics && (
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <CircleCheck size={18} className="mt-0.5 shrink-0 text-emerald-600" />
            <div className="text-xs text-emerald-950">
              <p className="font-semibold">
                Pipeline Run Completed ({lastRun.id.slice(0, 8)}...)
              </p>
              <p className="mt-1 text-emerald-800">
                Scanned {lastRun.metrics.overdue_assets_found} overdue hardware
                items & {lastRun.metrics.idle_subscriptions_found} idle SaaS
                apps → {lastRun.metrics.auto_approved_orders} auto-executed (
                {formatUsd(lastRun.metrics.total_spend_executed)}),{" "}
                {lastRun.metrics.awaiting_approval_proposals} routed to Approval
                Queue, {formatUsd(lastRun.metrics.projected_monthly_savings)}/mo
                SaaS savings identified.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate("/approvals")}
            className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            Review Queue
          </button>
        </div>
      )}

      {/* Metric cards */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-zinc-900">Key metrics</h3>
          <span className="text-xs text-zinc-400">
            Live state + synthetic replay
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((metric) => {
            const Icon = metric.icon;
            return (
              <article
                key={metric.label}
                className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <p className="text-sm font-medium text-zinc-500">
                    {metric.label}
                  </p>

                  <div className="rounded-lg bg-zinc-100 p-2 text-zinc-600">
                    <Icon size={19} />
                  </div>
                </div>

                <p className="mt-5 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
                  {metric.value}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {metric.trend === "up" && (
                    <span className="flex items-center gap-1 font-semibold text-emerald-600">
                      <ArrowUpRight size={14} />
                      {metric.change}
                    </span>
                  )}

                  {metric.trend === "down" && (
                    <span className="flex items-center gap-1 font-semibold text-emerald-600">
                      <ArrowDownRight size={14} />
                      {metric.change}
                    </span>
                  )}

                  {metric.trend === "neutral" && (
                    <span className="font-semibold text-zinc-700">
                      {metric.change}
                    </span>
                  )}

                  <span className="text-zinc-400">{metric.description}</span>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Main dashboard panels */}
      <section className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        {/* Backtest performance */}
        <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-zinc-900">
                90-day policy backtest replay
              </h3>
              <p className="mt-1 text-sm text-zinc-500">
                {backtest?.backtest.summary.counts.auto_approved ?? 0} auto-approved
                · {backtest?.backtest.summary.counts.escalated ?? 0} escalated ·{" "}
                {backtest?.backtest.summary.counts.blocked ?? 0} breaker-blocked
              </p>
            </div>

            <button
              type="button"
              onClick={() => void refetchBacktest()}
              className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-200"
            >
              <RefreshCw
                size={13}
                className={backtestLoading ? "animate-spin" : ""}
              />
              Refresh
            </button>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-zinc-500">Realized savings</p>
              <p className="mt-1 text-xl font-bold text-emerald-600">
                {formatUsd(realizedSavings)}
              </p>
            </div>

            <div>
              <p className="text-xs text-zinc-500">Historical human spend</p>
              <p className="mt-1 text-xl font-bold text-zinc-900">
                {formatUsd(backtest?.backtest.summary.human_spend_total_usd ?? 0)}
              </p>
            </div>

            <div>
              <p className="text-xs text-zinc-500">Held by breaker</p>
              <p className="mt-1 text-xl font-bold text-amber-600">
                {formatUsd(
                  backtest?.backtest.summary.spend_held_by_breaker_usd ?? 0,
                )}
              </p>
            </div>
          </div>

          <div className="mt-8 flex h-40 items-end gap-2 border-b border-zinc-100 pb-2 sm:gap-3">
            {weeklyRows.length > 0 ? (
              weeklyRows.map((week) => {
                const positiveVal = Math.max(0, week.projected_savings);
                const heightPct =
                  positiveVal > 0
                    ? Math.max(12, Math.round((positiveVal / maxWeeklySavings) * 100))
                    : week.blocked > 0 || week.escalated > 0
                      ? 14
                      : 6;

                return (
                  <div
                    key={String(week.week)}
                    className="flex h-full flex-1 items-end"
                    title={`${week.week}: $${week.projected_savings.toFixed(2)} saved (${week.auto_approved} auto, ${week.escalated} escalated, ${week.blocked} blocked)`}
                  >
                    <div
                      className={`w-full rounded-t-md transition-colors ${
                        week.projected_savings > 0
                          ? "bg-emerald-500/85 hover:bg-emerald-400"
                          : week.blocked > 0
                            ? "bg-amber-400/80 hover:bg-amber-300"
                            : "bg-zinc-200 hover:bg-zinc-300"
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                );
              })
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
                Connect API to view 90-day replay metrics
              </div>
            )}
          </div>

          <div className="mt-3 flex justify-between text-[11px] text-zinc-400">
            <span>{weeklyRows[0]?.week ?? "Week 1"}</span>
            <span>
              {weeklyRows[Math.floor(weeklyRows.length / 2)]?.week ?? "Mid"}
            </span>
            <span>
              {weeklyRows[weeklyRows.length - 1]?.week ?? "Latest"}
            </span>
          </div>
        </article>

        {/* Governance status */}
        <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <div>
            <h3 className="font-semibold text-zinc-900">Governance status</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Live circuit-breaker & mandate enforcement
            </p>
          </div>

          <div
            className={`mt-6 flex items-center justify-between rounded-lg border p-4 ${
              breakerOpen
                ? "border-red-200 bg-red-50"
                : "border-emerald-100 bg-emerald-50"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`rounded-lg bg-white p-2 ${
                  breakerOpen ? "text-red-600" : "text-emerald-600"
                }`}
              >
                {breakerOpen ? <ShieldAlert size={20} /> : <CircleCheck size={20} />}
              </div>

              <div>
                <p className="text-sm font-semibold text-zinc-900">
                  Safety Circuit Breaker
                </p>
                <p className="mt-1 text-xs text-zinc-600">
                  {breaker?.circuit_breaker.rolling_metrics.orders_last_hour ?? 0} /{" "}
                  {breaker?.circuit_breaker.rules.max_orders_per_hour ?? 5} orders/hr
                </p>
              </div>
            </div>

            <span
              className={`text-xs font-semibold uppercase ${
                breakerOpen ? "text-red-700" : "text-emerald-700"
              }`}
            >
              {breaker?.kill_switch_active
                ? "Halted"
                : breaker?.circuit_breaker.state ?? "Closed"}
            </span>
          </div>

          <div className="mt-5 space-y-5">
            <div>
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-zinc-600">1-hour velocity cap</span>
                <span className="font-semibold text-zinc-900">
                  {formatUsd(spendLastHour)} / {formatUsd(maxSpendPerHour)}
                </span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className={`h-full rounded-full transition-all ${
                    spendUtilizationPct >= 80 ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${spendUtilizationPct}%` }}
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-zinc-600">Monthly mandate utilisation</span>
                <span className="font-semibold text-zinc-900">
                  {mandateCapPct}% ({formatUsd(latestActiveCap)} cap)
                </span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${mandateCapPct}%` }}
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-zinc-600">Approval queue resolution</span>
                <span className="font-semibold text-zinc-900">
                  {resolutionPct}%
                </span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${resolutionPct}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <CircleAlert size={18} className="mt-0.5 shrink-0 text-zinc-500" />

            <p className="text-xs leading-5 text-zinc-600">
              All purchases pass deterministic 16-rule{" "}
              <code className="font-mono">@rm/guard</code> verification and require
              ES256 cryptographic signatures when out-of-policy.
            </p>
          </div>
        </article>
      </section>

      {/* Recent activity */}
      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 p-5 sm:px-6">
          <div>
            <h3 className="font-semibold text-zinc-900">
              Live proposals & procurement events
            </h3>
            <p className="mt-1 text-sm text-zinc-500">
              Real-time items from <code className="font-mono">/v1/proposals</code>
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate("/approvals")}
            aria-label="Open pending purchase approvals"
            title="Review pending purchase approvals"
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
          >
            <ShoppingCart size={20} />
          </button>
        </div>

        <div className="divide-y divide-zinc-100">
          {recentFeed.length > 0 ? (
            recentFeed.map((item) => (
              <div
                key={item.id}
                onClick={() => navigate(item.destination)}
                className="flex cursor-pointer flex-col justify-between gap-3 p-5 transition-colors hover:bg-zinc-50 sm:flex-row sm:items-center sm:px-6"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900">
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">{item.detail}</p>
                </div>

                <div className="flex items-center justify-between gap-5 sm:justify-end">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-zinc-900">
                      {item.amount}
                    </p>
                    <p className="mt-1 text-xs text-zinc-400">{item.time}</p>
                  </div>

                  <span
                    className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${
                      item.status === "executed" || item.status === "auto_approved"
                        ? "bg-emerald-50 text-emerald-700"
                        : item.status === "needs_approval"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-red-50 text-red-700"
                    }`}
                  >
                    {item.status.replace(/_/g, " ")}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-sm text-zinc-500">
              No procurement events yet. Click{" "}
              <span className="font-semibold text-zinc-800">
                Run Autonomous Pipeline
              </span>{" "}
              above to scan assets and generate proposals.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
