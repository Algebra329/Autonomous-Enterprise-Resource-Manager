import type { FastifyPluginAsync } from 'fastify';
import { runWorkflow } from '@rm/workflows';
import type { Policy } from '@rm/shared';
import { state, recordLedgerEntry } from '../services/state.js';
import { evaluateCircuitBreaker } from './safety.js';

export const runRoutes: FastifyPluginAsync = async (app) => {
  // POST /v1/runs
  app.post('/v1/runs', async (req, reply) => {
    evaluateCircuitBreaker();

    if (state.killSwitchActive || state.circuitBreakerOpen) {
      return reply.status(403).send({
        error: {
          code: 'EXECUTION_HALTED',
          message: 'Cannot start run: Circuit breaker is open or kill switch is active.',
        },
      });
    }

    const body = (req.body || {}) as {
      trigger?: 'cron' | 'manual' | 'arena';
      mode?: string;
      policy?: Policy;
    };

    // Use newest active IntentMandate policy if caller didn't supply one
    let activePolicy = body.policy;
    if (!activePolicy) {
      for (const m of Array.from(state.mandates.values()).reverse()) {
        if (m.type === 'intent' && m.status === 'active') {
          activePolicy = m.constraints;
          break;
        }
      }
    }

    const triggerForWorkflow = body.trigger === 'cron' ? 'cron' : 'manual';
    const workflowResult = await runWorkflow({
      policy: activePolicy,
      trigger: triggerForWorkflow,
    });

    const existingPending = Array.from(state.proposals.values()).filter(
      (p) => p.status === 'needs_approval'
    );

    let addedProposals = 0;
    for (const proposal of workflowResult.proposals) {
      if (proposal.status === 'needs_approval') {
        const duplicate = existingPending.some(
          (e) =>
            e.kind === proposal.kind &&
            e.payload.sku === proposal.payload.sku &&
            e.payload.unit_price === proposal.payload.unit_price &&
            e.payload.subscription_id === proposal.payload.subscription_id
        );
        if (duplicate) continue;
      }

      state.proposals.set(proposal.id, {
        ...proposal,
        run_id: workflowResult.run_id,
      });
      addedProposals++;
    }

    for (const order of workflowResult.executed_orders) {
      state.orders.set(order.order_id, {
        id: order.order_id,
        proposal_id: order.proposal_id,
        mandate: order.proof_pack.mandate,
        vendor_id: order.proof_pack.vendor_quote.vendor_id,
        sku: order.proof_pack.vendor_quote.sku,
        quantity: order.proof_pack.vendor_quote.quantity,
        unit_price: order.proof_pack.vendor_quote.unit_price,
        amount: order.amount,
        currency: order.currency,
        paypal_order_id: order.paypal_order_id,
        status: 'COMPLETED',
        created_at: new Date().toISOString(),
      });

      recordLedgerEntry('order_auto_executed', order.order_id, {
        order_id: order.order_id,
        proposal_id: order.proposal_id,
        vendor_id: order.proof_pack.vendor_quote.vendor_id,
        sku: order.proof_pack.vendor_quote.sku,
        amount: order.amount,
        currency: order.currency,
        paypal_order_id: order.paypal_order_id,
      });
    }

    evaluateCircuitBreaker();

    const run = {
      id: workflowResult.run_id,
      trigger: body.trigger || 'manual',
      status: workflowResult.status,
      mode: activePolicy?.mode || body.mode || 'auto_under_cap',
      started_at: workflowResult.started_at,
      finished_at: workflowResult.finished_at,
      proposals_generated: addedProposals,
      metrics: workflowResult.metrics,
    };

    state.runs.set(workflowResult.run_id, run);

    recordLedgerEntry('run_completed', workflowResult.run_id, {
      run_id: workflowResult.run_id,
      trigger: run.trigger,
      status: run.status,
      proposals_generated: workflowResult.metrics.proposals_generated,
      auto_approved_orders: workflowResult.metrics.auto_approved_orders,
      awaiting_approval_proposals: workflowResult.metrics.awaiting_approval_proposals,
    });

    return reply.status(201).send(run);
  });

  // GET /v1/runs
  app.get('/v1/runs', async (_req, reply) => {
    return reply.send(Array.from(state.runs.values()).reverse());
  });

  // GET /v1/runs/:id
  app.get('/v1/runs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const run = state.runs.get(id);

    if (!run) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Run ${id} not found` },
      });
    }

    const proposals = Array.from(state.proposals.values());
    return reply.send({ ...run, proposals });
  });
};

