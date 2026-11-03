import type { FastifyPluginAsync } from 'fastify';
import { state } from '../services/state.js';

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/dashboard/:source
  app.get('/v1/dashboard/:source', async (req, reply) => {
    const { source } = req.params as { source: string };

    switch (source) {
      case 'spend':
        return reply.send([
          {
            date: '2026-10-28',
            vendor: 'vendor_a',
            category: 'laptops',
            amount: 2900,
            benchmark_price: 2800,
            savings_vs_benchmark: 100,
          },
          {
            date: '2026-10-30',
            vendor: 'vendor_b',
            category: 'monitors',
            amount: 840,
            benchmark_price: 880,
            savings_vs_benchmark: 40,
          },
        ]);

      case 'seat_savings':
        return reply.send([
          {
            date: '2026-10-26',
            app: 'DealPilot CRM',
            monthly_saving: 225,
            cumulative_saving: 225,
          },
          {
            date: '2026-10-29',
            app: 'DocuHub',
            monthly_saving: 144,
            cumulative_saving: 369,
          },
        ]);

      case 'approvals': {
        const approvals = Array.from(state.proposals.values()).map((p) => ({
          proposal_id: p.id,
          kind: p.kind,
          status: p.status,
          age_hours: 2,
          amount: p.payload.quantity * p.payload.unit_price,
        }));
        return reply.send(approvals);
      }

      case 'mandate_usage': {
        const usage = Array.from(state.mandates.values()).map((m) => ({
          mandate_id: m.id,
          cap: (m as any).constraints?.monthly_cap || 5000,
          used: 1450,
          remaining: ((m as any).constraints?.monthly_cap || 5000) - 1450,
          expires: m.expires,
        }));
        return reply.send(usage);
      }

      case 'blocked_attempts':
        return reply.send([
          {
            date: '2026-10-31',
            source: 'agent',
            rule: 'UNIT_PRICE_EXCEEDED',
            count: 3,
          },
          {
            date: '2026-11-01',
            source: 'arena',
            rule: 'SIGNATURE_INVALID',
            count: 14,
          },
        ]);

      case 'breaker':
        return reply.send([
          {
            rule: 'max_spend_per_hour',
            state: state.circuitBreakerOpen ? 'tripped' : 'closed',
            last_tripped: state.lastBreakerTripped,
          },
        ]);

      case 'backtest':
        return reply.send([
          {
            week: 'Week 1',
            projected_savings: 1200,
            auto_approved: 8,
            escalated: 2,
            blocked: 1,
          },
          {
            week: 'Week 2',
            projected_savings: 1850,
            auto_approved: 12,
            escalated: 3,
            blocked: 2,
          },
        ]);

      default:
        return reply.status(404).send({
          error: {
            code: 'UNKNOWN_SOURCE',
            message: `Unknown dashboard source '${source}'. Valid sources: spend, seat_savings, approvals, mandate_usage, blocked_attempts, breaker, backtest`,
          },
        });
    }
  });
};

