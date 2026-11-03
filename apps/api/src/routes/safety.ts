import type { FastifyPluginAsync } from 'fastify';
import { state, recordLedgerEntry } from '../services/state.js';

export const safetyRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/safety/breaker
  app.get('/v1/safety/breaker', async (req, reply) => {
    return reply.send({
      circuit_breaker: {
        state: state.circuitBreakerOpen ? 'open' : 'closed',
        last_tripped: state.lastBreakerTripped,
        rules: {
          max_orders_per_hour: 3,
          max_spend_per_hour: 3000,
          over_benchmark_pct: 10,
        },
      },
      kill_switch_active: state.killSwitchActive,
    });
  });

  // POST /v1/safety/kill-switch
  app.post('/v1/safety/kill-switch', async (req, reply) => {
    state.killSwitchActive = true;
    state.circuitBreakerOpen = true;
    state.lastBreakerTripped = new Date().toISOString();

    // Revoke all active mandates
    let revokedCount = 0;
    for (const [id, mandate] of state.mandates.entries()) {
      if (mandate.status === 'active') {
        mandate.status = 'revoked';
        state.revokedMandateIds.add(id);
        state.revokedMandateIds.add(mandate.nonce);
        revokedCount++;
      }
    }

    // Halt all running autonomous runs
    for (const run of state.runs.values()) {
      if (run.status === 'running' || run.status === 'queued') {
        run.status = 'halted';
      }
    }

    recordLedgerEntry('kill_switch_engaged', null, {
      action: 'kill_switch_engaged',
      revoked_mandates_count: revokedCount,
      timestamp: state.lastBreakerTripped,
    });

    return reply.send({
      status: 'halted',
      kill_switch_active: true,
      circuit_breaker_open: true,
      revoked_mandates_count: revokedCount,
      message: 'Kill switch engaged. All active mandates revoked and autonomous runs halted.',
    });
  });
};

