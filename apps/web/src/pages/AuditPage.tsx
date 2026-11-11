import { useState } from "react";
import {
  CheckCircle2,
  Download,
  FileCode2,
  Lock,
  RefreshCw,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import type { ProofPack } from "@rm/shared";

import { api } from "../lib/api";
import { canonicalize, hashMandatePayload, sha256Hex } from "../lib/crypto";
import { useLedgerQuery, useOrdersQuery } from "../lib/queries";

interface ClientVerificationState {
  valid: boolean;
  mandateHashMatch: boolean;
  cartHashMatch: boolean;
  checkedAt: string;
}

export default function AuditPage() {
  const [selectedType, setSelectedType] = useState<string>("all");
  const filterArg = selectedType === "all" ? undefined : selectedType;

  const { data: ledger, isLoading: ledgerLoading, refetch: refetchLedger } =
    useLedgerQuery(filterArg);
  const { data: orders, isLoading: ordersLoading } = useOrdersQuery();

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [proofPack, setProofPack] = useState<ProofPack | null>(null);
  const [proofLoading, setProofLoading] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);
  const [clientVerify, setClientVerify] = useState<ClientVerificationState | null>(
    null,
  );

  const inspectProofPack = async (orderId: string) => {
    setSelectedOrderId(orderId);
    setProofLoading(true);
    setProofError(null);
    setClientVerify(null);

    try {
      const pack = await api.getProofPack(orderId);
      setProofPack(pack);

      const expectedMandateHash = await hashMandatePayload(pack.mandate);
      const normalizedCart = {
        currency: pack.vendor_quote.currency || "USD",
        quantity: pack.vendor_quote.quantity,
        sku: pack.vendor_quote.sku,
        total:
          pack.vendor_quote.quantity * pack.vendor_quote.unit_price,
        unit_price: pack.vendor_quote.unit_price,
        vendor_id: pack.vendor_quote.vendor_id,
      };
      const expectedCartHash = await sha256Hex(canonicalize(normalizedCart));

      const mandateHashMatch = pack.mandate_hash === expectedMandateHash;
      const cartHashMatch = pack.cart_hash === expectedCartHash;
      setClientVerify({
        valid: mandateHashMatch && cartHashMatch,
        mandateHashMatch,
        cartHashMatch,
        checkedAt: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      setProofError(
        err instanceof Error ? err.message : "Failed to load Proof Pack",
      );
      setProofPack(null);
    } finally {
      setProofLoading(false);
    }
  };

  const downloadProofPack = () => {
    if (!proofPack) return;
    const blob = new Blob([JSON.stringify(proofPack, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `proof-pack-${proofPack.order_id.slice(0, 8)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const eventTypes = [
    "all",
    "order_executed",
    "order_auto_executed",
    "mandate_registered",
    "mandate_revoked",
    "proposal_rejected",
    "run_completed",
    "kill_switch_engaged",
    "safety_breaker_reset",
  ];

  const entries = [...(ledger?.entries ?? [])].reverse();
  const orderList = orders ?? [];

  return (
    <div className="space-y-8">
      {/* Header + Integrity Badge */}
      <section className="flex flex-col justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
            Hash-Chained Audit Trail & Order Proofs
          </span>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900">
            Audit & Cryptographic Proof Packs
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Every mandate registration, automated run, order execution, and
            revocation is linked via{" "}
            <code className="font-mono">
              sha256(prev_hash + canonicalize(data))
            </code>{" "}
            and verified locally in your browser.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
              ledger?.chain_status === "TAMPERED"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {ledger?.chain_status === "TAMPERED" ? (
              <ShieldAlert size={15} />
            ) : (
              <ShieldCheck size={15} />
            )}
            Ledger Chain: {ledger?.chain_status ?? "VALID"} (
            {ledger?.total_entries ?? 0} entries)
          </span>

          <button
            type="button"
            onClick={() => void refetchLedger()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
          >
            <RefreshCw size={14} />
            Verify Chain
          </button>
        </div>
      </section>

      {/* Executed Orders & Proof Pack Inspector */}
      <section className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <article className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 p-6">
            <h3 className="font-semibold text-zinc-900">
              Executed Orders ({orderList.length})
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              Select an order to fetch{" "}
              <code className="font-mono">GET /v1/orders/:id/proof-pack</code>
            </p>
          </div>

          {ordersLoading ? (
            <div className="p-8 text-center text-sm text-zinc-400">
              Loading executed orders...
            </div>
          ) : orderList.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500">
              No executed orders yet. Run the autonomous pipeline on AG Studio or
              approve a proposal in the Approval Queue.
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {orderList.map((order) => (
                <div
                  key={order.id}
                  className={`flex flex-col justify-between gap-3 p-5 sm:flex-row sm:items-center ${
                    selectedOrderId === order.id ? "bg-emerald-50/50" : ""
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        {order.status}
                      </span>
                      <span className="text-sm font-semibold text-zinc-900">
                        {order.quantity}x {order.sku} · ${order.amount.toLocaleString()}
                      </span>
                    </div>
                    <p className="font-mono text-[11px] text-zinc-500">
                      PayPal: {order.paypal_order_id} · Vendor: {order.vendor_id}
                    </p>
                    <p className="font-mono text-[11px] text-zinc-400">
                      Signer: {order.issuer} ({order.mandate_type})
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void inspectProofPack(order.id)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
                  >
                    <FileCode2 size={14} />
                    Inspect Proof Pack
                  </button>
                </div>
              ))}
            </div>
          )}
        </article>

        {/* Proof Pack Viewer */}
        <article className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
            <div>
              <h3 className="flex items-center gap-2 font-semibold text-zinc-900">
                <Lock size={17} className="text-emerald-600" />
                Proof Pack Verification
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                Recomputes SHA-256 mandate & cart hashes directly in your browser
              </p>
            </div>

            {proofPack && (
              <button
                type="button"
                onClick={downloadProofPack}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
              >
                <Download size={13} />
                Export JSON
              </button>
            )}
          </div>

          {proofLoading ? (
            <div className="p-8 text-center text-sm text-zinc-400">
              Fetching Proof Pack...
            </div>
          ) : proofError ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-700">
              {proofError}
            </div>
          ) : !proofPack ? (
            <div className="mt-6 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-8 text-center text-sm text-zinc-500">
              Pick an executed order on the left to inspect its signed mandate,
              quote, PayPal order reference, and SHA-256 ledger binding.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {clientVerify && (
                <div
                  className={`rounded-lg border p-3 text-xs ${
                    clientVerify.valid
                      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                      : "border-red-200 bg-red-50 text-red-900"
                  }`}
                >
                  <p className="flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 size={15} />
                    {clientVerify.valid
                      ? "Browser WebCrypto SHA-256 Verification PASSED"
                      : "Hash Mismatch Detected"}
                  </p>
                  <p className="mt-1 font-mono text-[11px]">
                    mandate_hash:{" "}
                    {clientVerify.mandateHashMatch ? "MATCH" : "MISMATCH"} ·
                    cart_hash: {clientVerify.cartHashMatch ? "MATCH" : "MISMATCH"}{" "}
                    ({clientVerify.checkedAt})
                  </p>
                </div>
              )}

              <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-4 font-mono text-[11px] text-zinc-700">
                <p className="break-all">
                  <strong>order_id:</strong> {proofPack.order_id}
                </p>
                <p className="break-all">
                  <strong>paypal_order_id:</strong> {proofPack.paypal_order_id}
                </p>
                <p className="break-all">
                  <strong>mandate_hash:</strong> {proofPack.mandate_hash}
                </p>
                <p className="break-all">
                  <strong>cart_hash:</strong> {proofPack.cart_hash}
                </p>
                <p className="break-all">
                  <strong>ledger_hash:</strong> {proofPack.ledger_hash}
                </p>
                <p className="break-all">
                  <strong>signature ({proofPack.signature.kind}):</strong>{" "}
                  {typeof proofPack.signature.payload === "string"
                    ? proofPack.signature.payload
                    : JSON.stringify(proofPack.signature.payload)}
                </p>
              </div>
            </div>
          )}
        </article>
      </section>

      {/* Full Tamper-Evident Ledger Timeline */}
      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-4 border-b border-zinc-100 p-6 sm:flex-row sm:items-center">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-zinc-900">
              <ScrollText size={18} className="text-emerald-600" />
              Append-Only Ledger Entries ({entries.length})
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              Filter by ledger event type
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {eventTypes.map((evt) => (
              <button
                key={evt}
                type="button"
                onClick={() => setSelectedType(evt)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  selectedType === evt
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {evt}
              </button>
            ))}
          </div>
        </div>

        {ledgerLoading ? (
          <div className="p-8 text-center text-sm text-zinc-400">
            Loading audit ledger...
          </div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500">
            No ledger entries recorded for this filter yet.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {entries.map((entry) => (
              <div
                key={`${entry.seq ?? entry.hash}`}
                className="space-y-2 p-5 sm:px-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-zinc-900 px-2 py-0.5 font-mono text-[11px] font-semibold text-white">
                      #{entry.seq ?? "-"}
                    </span>
                    <span className="rounded bg-emerald-50 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-800">
                      {entry.type}
                    </span>
                    {entry.ref_id && (
                      <span className="font-mono text-[11px] text-zinc-500">
                        ref: {entry.ref_id}
                      </span>
                    )}
                  </div>

                  <span className="text-xs text-zinc-400">
                    {entry.created_at
                      ? new Date(entry.created_at).toLocaleString()
                      : ""}
                  </span>
                </div>

                <div className="grid gap-1 font-mono text-[11px] text-zinc-500 lg:grid-cols-2">
                  <p className="truncate">prev: {entry.prev_hash}</p>
                  <p className="truncate text-zinc-800">hash: {entry.hash}</p>
                </div>

                <pre className="overflow-x-auto rounded-lg bg-zinc-50 p-3 font-mono text-[11px] text-zinc-700">
                  {JSON.stringify(entry.data, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
