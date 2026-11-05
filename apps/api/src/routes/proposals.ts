import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import { ProposalApproveRequestSchema, ProposalRejectRequestSchema } from '@rm/shared';
import { verifyMandate, verifyMandateSignature } from '@rm/guard';
import { state, recordLedgerEntry } from '../services/state.js';

export const proposalRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/proposals
  app.get('/v1/proposals', async (req, reply) => {
    const query = req.query as { status?: string };
    const list = Array.from(state.proposals.values()).filter((p) =>
      query.status ? p.status === query.status : true
    );
    return reply.send(list);
  });

  // POST /v1/proposals/:id/approve
  app.post('/v1/proposals/:id/approve', async (req, reply) => {
    const { id } = req.params as { id: string };
    const proposal = state.proposals.get(id);

    if (!proposal) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Proposal ${id} not found` },
      });
    }

    const parseResult = ProposalApproveRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_APPROVAL',
          message: 'Approval must carry signed Cart Mandate and signature',
          details: parseResult.error.format(),
        },
      });
    }

    const { cart_mandate, signature } = parseResult.data;
    cart_mandate.signature = signature;

    // Run deterministic verification via packages/guard
    const verdict = verifyMandate(cart_mandate, proposal, {
      knownIssuers: [cart_mandate.issuer],
      revokedMandateIds: state.revokedMandateIds,
      usedNonces: state.usedNonces,
      remainingMonthlyBudget: 50000,
      circuitBreakerOpen: state.circuitBreakerOpen,
      killSwitchActive: state.killSwitchActive,
      verifySignature: (hash, sig) => verifyMandateSignature(hash, sig),
    });

    if (verdict.result === 'blocked') {
      return reply.status(403).send({
        error: {
          code: 'VERIFICATION_BLOCKED',
          message: 'Cart Mandate blocked by security verifier',
          failing_rules: verdict.failing_rules,
        },
      });
    }

    // Execute order
    const orderId = randomUUID();
    const paypalOrderId = `PAYPAL-${randomUUID().substring(0, 8).toUpperCase()}`;

    proposal.status = 'executed';
    proposal.verdict = 'auto_approved';

    const orderRecord = {
      id: orderId,
      proposal_id: id,
      mandate: cart_mandate,
      vendor_id: cart_mandate.cart.vendor_id,
      sku: cart_mandate.cart.sku,
      quantity: cart_mandate.cart.quantity,
      unit_price: cart_mandate.cart.unit_price,
      amount: cart_mandate.cart.total,
      currency: cart_mandate.cart.currency,
      paypal_order_id: paypalOrderId,
      status: 'COMPLETED',
      created_at: new Date().toISOString(),
    };

    state.orders.set(orderId, orderRecord);
    state.usedNonces.add(cart_mandate.nonce);

    // Record on ledger
    const ledgerEntry = recordLedgerEntry('order_executed', orderId, {
      order_id: orderId,
      proposal_id: id,
      vendor_id: cart_mandate.cart.vendor_id,
      amount: cart_mandate.cart.total,
      currency: cart_mandate.cart.currency,
      paypal_order_id: paypalOrderId,
      cart_hash: cart_mandate.nonce,
    });

    return reply.send({
      status: 'approved_and_executed',
      order_id: orderId,
      paypal_order_id: paypalOrderId,
      ledger_seq: ledgerEntry.seq,
      ledger_hash: ledgerEntry.hash,
    });
  });

  // POST /v1/proposals/:id/reject
  app.post('/v1/proposals/:id/reject', async (req, reply) => {
    const { id } = req.params as { id: string };
    const proposal = state.proposals.get(id);

    if (!proposal) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Proposal ${id} not found` },
      });
    }

    const parseResult = ProposalRejectRequestSchema.safeParse(req.body);
    const reason = parseResult.success ? parseResult.data.reason : 'Rejected by manager';

    proposal.status = 'rejected';
    proposal.reason = reason;

    recordLedgerEntry('proposal_rejected', id, {
      proposal_id: id,
      reason,
      rejected_at: new Date().toISOString(),
    });

    return reply.send({ id, status: 'rejected', reason });
  });
};

