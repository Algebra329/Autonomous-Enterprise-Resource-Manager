import { useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { CartMandate, Proposal } from "@rm/shared";

import {
  api,
  ApiClientError,
  ensureSignerRegistered,
  type ApproveProposalResponse,
} from "../lib/api";
import {
  useInvalidateAerm,
  useMandatesQuery,
  useProposalsQuery,
} from "../lib/queries";
import { useAermSigner } from "../lib/useAermSigner";

type StatusFilter = "all" | "needs_approval" | "executed" | "rejected" | "blocked";

export default function ApprovalsPage() {
  const navigate = useNavigate();
  const invalidateAll = useInvalidateAerm();
  const { signer } = useAermSigner();
  const { data: proposals, isLoading, isError, error } = useProposalsQuery();
  const { data: mandates } = useMandatesQuery();

  const [filter, setFilter] = useState<StatusFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [approvalReceipts, setApprovalReceipts] = useState<
    Record<string, ApproveProposalResponse>
  >({});
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  const activeIntentId = (mandates ?? []).find(
    (m) => m.type === "intent" && m.status === "active",
  )?.id;

  const list = proposals ?? [];
  const filtered =
    filter === "all" ? list : list.filter((p) => p.status === filter);

  const handleApprove = async (proposal: Proposal) => {
    if (!signer) return;
    setBusyId(proposal.id);
    setActionErrors((prev) => {
      const next = { ...prev };
      delete next[proposal.id];
      return next;
    });

    try {
      await ensureSignerRegistered(signer);

      const unsignedCart: CartMandate = {
        type: "cart",
        issuer: signer.issuer,
        ...(activeIntentId ? { parent: activeIntentId } : {}),
        cart: {
          vendor_id: proposal.payload.vendor_id,
          sku: proposal.payload.sku,
          quantity: proposal.payload.quantity,
          unit_price: proposal.payload.unit_price,
          total: Number(
            (proposal.payload.quantity * proposal.payload.unit_price).toFixed(2),
          ),
          currency: proposal.payload.currency || "USD",
          quote_id: proposal.payload.quote_id,
        },
        nonce: `cart-${crypto.randomUUID()}`,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      const { signature } = await signer.signMandate(unsignedCart);
      const receipt = await api.approveProposal(proposal.id, {
        cart_mandate: unsignedCart,
        signature,
      });

      setApprovalReceipts((prev) => ({
        ...prev,
        [proposal.id]: receipt,
      }));

      await invalidateAll();
    } catch (err) {
      let msg = "Approval failed";
      if (err instanceof ApiClientError) {
        msg = err.failing_rules?.length
          ? `${err.message} (${err.failing_rules.join(", ")})`
          : err.message;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setActionErrors((prev) => ({ ...prev, [proposal.id]: msg }));
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (proposal: Proposal) => {
    setBusyId(proposal.id);
    setActionErrors((prev) => {
      const next = { ...prev };
      delete next[proposal.id];
      return next;
    });

    try {
      const reason =
        rejectReasons[proposal.id]?.trim() || "Rejected by manager in UI";
      await api.rejectProposal(proposal.id, reason);
      await invalidateAll();
    } catch (err) {
      setActionErrors((prev) => ({
        ...prev,
        [proposal.id]:
          err instanceof Error ? err.message : "Failed to reject proposal",
      }));
    } finally {
      setBusyId(null);
    }
  };

  const filterTabs: Array<{ key: StatusFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: list.length },
    {
      key: "needs_approval",
      label: "Needs Approval",
      count: list.filter((p) => p.status === "needs_approval").length,
    },
    {
      key: "executed",
      label: "Executed",
      count: list.filter((p) => p.status === "executed").length,
    },
    {
      key: "rejected",
      label: "Rejected",
      count: list.filter((p) => p.status === "rejected").length,
    },
    {
      key: "blocked",
      label: "Blocked",
      count: list.filter((p) => p.status === "blocked").length,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
            Cryptographic Cart Mandate Signing
          </span>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900">
            Approval Queue
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Approve out-of-policy purchases or idle SaaS cancellations by
            signing a canonical{" "}
            <code className="font-mono">CartMandate</code> with your browser
            ECDSA P-256 key (<code className="font-mono">@rm/guard</code> ES256).
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
          <KeyRound size={15} className="text-emerald-600" />
          <span className="font-mono">
            {signer ? signer.issuer : "Loading signer..."}
          </span>
        </div>
      </section>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
              filter === tab.key
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] ${
                filter === tab.key
                  ? "bg-white/15 text-white"
                  : "bg-zinc-100 text-zinc-700"
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          Loading proposals from API...
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {(error as Error)?.message || "Could not load proposals."}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
          No proposals in this status. Trigger a procurement run from AG Studio
          to populate more items.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((proposal) => {
            const total = proposal.payload.quantity * proposal.payload.unit_price;
            const market = proposal.benchmark?.market_price;
            const marketDiffPct =
              market && market > 0
                ? ((proposal.payload.unit_price - market) / market) * 100
                : null;
            const receipt = approvalReceipts[proposal.id];
            const errMsg = actionErrors[proposal.id];
            const isBusy = busyId === proposal.id;
            const isPending = proposal.status === "needs_approval";

            return (
              <article
                key={proposal.id}
                className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-md px-2.5 py-1 text-xs font-semibold uppercase ${
                          proposal.status === "needs_approval"
                            ? "bg-amber-50 text-amber-700"
                            : proposal.status === "executed"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-red-50 text-red-700"
                        }`}
                      >
                        {proposal.status.replace(/_/g, " ")}
                      </span>

                      <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium uppercase text-zinc-700">
                        {proposal.kind}
                      </span>

                      {proposal.failing_rules.map((rule) => (
                        <span
                          key={rule}
                          className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-[11px] font-medium text-amber-800"
                        >
                          {rule}
                        </span>
                      ))}
                    </div>

                    <h3 className="text-lg font-semibold text-zinc-900">
                      {proposal.kind === "cancel"
                        ? `Cancel Idle SaaS: ${proposal.payload.app || proposal.payload.sku}`
                        : `${proposal.benchmark?.title || proposal.payload.sku} (${proposal.payload.sku})`}
                    </h3>

                    <p className="text-xs text-zinc-500">
                      Vendor:{" "}
                      <span className="font-semibold text-zinc-700">
                        {proposal.payload.vendor_id}
                      </span>{" "}
                      · Qty: {proposal.payload.quantity} × $
                      {proposal.payload.unit_price.toLocaleString()} · Quote:{" "}
                      <span className="font-mono">{proposal.payload.quote_id}</span>
                    </p>

                    {proposal.reason && (
                      <p className="flex items-center gap-1.5 text-xs text-zinc-600">
                        <CircleAlert size={14} className="text-amber-600" />
                        {proposal.reason}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-start gap-1 lg:items-end">
                    <p className="text-2xl font-bold text-zinc-900">
                      ${total.toLocaleString()} {proposal.payload.currency}
                    </p>
                    {market !== undefined && marketDiffPct !== null && (
                      <p className="text-xs text-zinc-500">
                        Benchmark ({proposal.benchmark?.source}): $
                        {market.toLocaleString()} (
                        <span
                          className={
                            marketDiffPct <= 0
                              ? "font-semibold text-emerald-600"
                              : "font-semibold text-amber-600"
                          }
                        >
                          {marketDiffPct > 0 ? "+" : ""}
                          {marketDiffPct.toFixed(1)}% vs market
                        </span>
                        )
                      </p>
                    )}
                    <p className="font-mono text-[11px] text-zinc-400">
                      ID: {proposal.id}
                    </p>
                  </div>
                </div>

                {errMsg && (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    {errMsg}
                  </div>
                )}

                {receipt && (
                  <div className="mt-4 flex flex-col justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950 sm:flex-row sm:items-center">
                    <div className="space-y-1">
                      <p className="flex items-center gap-1.5 font-semibold text-emerald-800">
                        <CheckCircle2 size={15} />
                        Approved with ES256 & Order Executed
                      </p>
                      <p className="font-mono text-[11px]">
                        Order: {receipt.order_id} · PayPal: {receipt.paypal_order_id}
                      </p>
                      <p className="font-mono text-[11px]">
                        Ledger Seq #{receipt.ledger_seq} · {receipt.ledger_hash}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => navigate("/audit")}
                      className="shrink-0 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                    >
                      Inspect Proof Pack
                    </button>
                  </div>
                )}

                {isPending && (
                  <div className="mt-5 flex flex-col gap-3 border-t border-zinc-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-1 items-center gap-2">
                      <input
                        value={rejectReasons[proposal.id] || ""}
                        onChange={(e) =>
                          setRejectReasons((prev) => ({
                            ...prev,
                            [proposal.id]: e.target.value,
                          }))
                        }
                        placeholder="Optional rejection reason..."
                        className="w-full max-w-xs rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-800 outline-none focus:border-zinc-400"
                      />
                      <button
                        type="button"
                        onClick={() => void handleReject(proposal)}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        <XCircle size={14} />
                        Reject
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleApprove(proposal)}
                      disabled={isBusy || !signer}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
                    >
                      {isBusy ? (
                        <RefreshCw size={15} className="animate-spin" />
                      ) : (
                        <ShieldCheck size={15} />
                      )}
                      {isBusy
                        ? "Signing ES256 & Verifying..."
                        : proposal.kind === "cancel"
                          ? "Approve Cancellation (ES256)"
                          : "Approve & Sign Cart Mandate (ES256)"}
                    </button>
                  </div>
                )}

                {!isPending && !receipt && (
                  <div className="mt-4 flex items-center gap-2 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
                    <ClipboardCheck size={14} />
                    <span>
                      Status finalized: <strong>{proposal.status}</strong>
                    </span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
