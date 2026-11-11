import {
  ArrowDownRight,
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  DollarSign,
  ShieldCheck,
  ShoppingCart,
  Wallet,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

const metrics = [
  {
    label: "Total procurement spend",
    value: "$284,590",
    change: "12.8%",
    trend: "down",
    description: "vs. previous period",
    icon: Wallet,
  },
  {
    label: "Savings generated",
    value: "$42,850",
    change: "8.4%",
    trend: "up",
    description: "vs. benchmark",
    icon: DollarSign,
  },
  {
    label: "Pending approvals",
    value: "12",
    change: "4 urgent",
    trend: "neutral",
    description: "awaiting human review",
    icon: Clock3,
  },
  {
    label: "Blocked attempts",
    value: "28",
    change: "6 this week",
    trend: "neutral",
    description: "policy violations prevented",
    icon: ShieldCheck,
  },
];

const activities = [
  {
    title: "Purchase automatically executed",
    detail: "Cloud infrastructure · Vendor A",
    amount: "$4,200",
    status: "Executed",
    time: "10 minutes ago",
  },
  {
    title: "Approval required",
    detail: "Software licensing · Vendor B",
    amount: "$12,500",
    status: "Pending",
    time: "32 minutes ago",
  },
  {
    title: "Procurement attempt blocked",
    detail: "Hardware purchase · Policy violation",
    amount: "$8,900",
    status: "Blocked",
    time: "1 hour ago",
  },
];

function MetricCard({
  label,
  value,
  change,
  trend,
  description,
  icon: Icon,
}: (typeof metrics)[number]) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-zinc-500">{label}</p>

        <div className="rounded-lg bg-zinc-100 p-2 text-zinc-600">
          <Icon size={19} />
        </div>
      </div>

      <p className="mt-5 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
        {value}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {trend === "up" && (
          <span className="flex items-center gap-1 font-semibold text-emerald-600">
            <ArrowUpRight size={14} />
            {change}
          </span>
        )}

        {trend === "down" && (
          <span className="flex items-center gap-1 font-semibold text-emerald-600">
            <ArrowDownRight size={14} />
            {change}
          </span>
        )}

        {trend === "neutral" && (
          <span className="font-semibold text-zinc-700">{change}</span>
        )}

        <span className="text-zinc-400">{description}</span>
      </div>
    </article>
  );
}

export default function DashboardPage() {
    const navigate = useNavigate();

  return (
    <div className="space-y-8">
      {/* Page introduction */}
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
              Autonomous operations
            </span>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
            Procurement overview
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            Monitor procurement activity, policy compliance, financial
            performance, and autonomous purchasing decisions.
          </p>
        </div>

        <span className="w-fit rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          DEMO DATA · NOT LIVE
        </span>
      </section>

      {/* Metric cards */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-zinc-900">Key metrics</h3>
          <span className="text-xs text-zinc-400">Illustrative values</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>
      </section>

      {/* Main dashboard panels */}
      <section className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        {/* Procurement performance */}
        <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-zinc-900">
                Procurement performance
              </h3>
              <p className="mt-1 text-sm text-zinc-500">
                Illustrative spend and savings overview
              </p>
            </div>

            <span className="rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-600">
              This month
            </span>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-zinc-500">Total spend</p>
              <p className="mt-1 text-xl font-bold text-zinc-900">$284.6k</p>
            </div>

            <div>
              <p className="text-xs text-zinc-500">Savings</p>
              <p className="mt-1 text-xl font-bold text-emerald-600">
                $42.85k
              </p>
            </div>
          </div>

          <div className="mt-8 flex h-40 items-end gap-3 border-b border-zinc-100 pb-2 sm:gap-5">
            {[45, 62, 50, 78, 58, 88, 70, 95, 67, 82, 72, 100].map(
              (height, index) => (
                <div
                  key={index}
                  className="flex h-full flex-1 items-end"
                  title={`Period ${index + 1}`}
                >
                  <div
                    className="w-full rounded-t-md bg-emerald-500/80 transition-colors hover:bg-emerald-400"
                    style={{ height: `${height}%` }}
                  />
                </div>
              ),
            )}
          </div>

          <div className="mt-3 flex justify-between text-[11px] text-zinc-400">
            <span>Period 1</span>
            <span>Period 6</span>
            <span>Period 12</span>
          </div>
        </article>

        {/* Governance status */}
        <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <div>
            <h3 className="font-semibold text-zinc-900">
              Governance status
            </h3>
            <p className="mt-1 text-sm text-zinc-500">
              Illustrative control indicators
            </p>
          </div>

          <div className="mt-6 flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50 p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white p-2 text-emerald-600">
                <CircleCheck size={20} />
              </div>

              <div>
                <p className="text-sm font-semibold text-zinc-900">
                  Procurement controls
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Demo status only
                </p>
              </div>
            </div>

            <span className="text-xs font-semibold text-emerald-700">
              Active
            </span>
          </div>

          <div className="mt-4 space-y-5">
            <div>
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-zinc-600">Mandate utilisation</span>
                <span className="font-semibold text-zinc-900">72%</span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                <div className="h-full w-[72%] rounded-full bg-emerald-500" />
              </div>
            </div>

            <div>
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-zinc-600">Approval resolution</span>
                <span className="font-semibold text-zinc-900">86%</span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                <div className="h-full w-[86%] rounded-full bg-emerald-500" />
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-lg border border-amber-100 bg-amber-50 p-3">
            <CircleAlert
              size={18}
              className="mt-0.5 shrink-0 text-amber-600"
            />

            <p className="text-xs leading-5 text-amber-800">
              These indicators are placeholders. Actual circuit-breaker and
              mandate states will come from the backend.
            </p>
          </div>
        </article>
      </section>

      {/* Recent activity */}
      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 p-5 sm:px-6">
          <div>
            <h3 className="font-semibold text-zinc-900">
              Recent procurement activity
            </h3>
            <p className="mt-1 text-sm text-zinc-500">
              Example autonomous purchasing events
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
          {activities.map((activity) => (
            <div
              key={activity.title}
              className="flex flex-col justify-between gap-3 p-5 sm:flex-row sm:items-center sm:px-6"
            >
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  {activity.title}
                </p>

                <p className="mt-1 text-xs text-zinc-500">
                  {activity.detail}
                </p>
              </div>

              <div className="flex items-center justify-between gap-5 sm:justify-end">
                <div className="text-right">
                  <p className="text-sm font-semibold text-zinc-900">
                    {activity.amount}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">
                    {activity.time}
                  </p>
                </div>

                <span
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    activity.status === "Executed"
                      ? "bg-emerald-50 text-emerald-700"
                      : activity.status === "Pending"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-red-50 text-red-700"
                  }`}
                >
                  {activity.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}