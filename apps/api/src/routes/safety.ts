import type { FastifyPluginAsync } from 'fastify';
import { state, recordLedgerEntry } from '../services/state.js';

function readPositiveInt(val: string | undefined, fallback: number): number {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const BREAKER_MAX_ORDERS_PER_HOUR = readPositiveInt(process.env.BREAKER_MAX_ORDERS_PER_HOUR, 5);
export const BREAKER_MAX_SPEND_PER_HOUR = readPositiveInt(process.env.BREAKER_MAX_SPEND_PER_HOUR, 5000);

export function evaluateCircuitBreaker() {
  const oneHourAgo = Date.now() - 3600_000;
  const windowStart = Math.max(oneHourAgo, state.lastBreakerResetAt ?? 0);
  const recentOrders = Array.from(state.orders.values()).filter(
    (o) => new Date(o.created_at).getTime() > windowStart
  );
  const recentSpend = recentOrders.reduce((sum, o) => sum + (o.amount || 0), 0);

  if (
    recentOrders.length >= BREAKER_MAX_ORDERS_PER_HOUR ||
    recentSpend >= BREAKER_MAX_SPEND_PER_HOUR
  ) {
    state.circuitBreakerOpen = true;
    if (!state.lastBreakerTripped) {
      state.lastBreakerTripped = new Date().toISOString();
    }
  }

  return {
    recentOrdersCount: recentOrders.length,
    recentSpend,
    maxOrdersPerHour: BREAKER_MAX_ORDERS_PER_HOUR,
    maxSpendPerHour: BREAKER_MAX_SPEND_PER_HOUR,
    open: state.circuitBreakerOpen,
  };
}

export const safetyRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/safety/breaker
  app.get('/v1/safety/breaker', async (req, reply) => {
    const metrics = evaluateCircuitBreaker();

    return reply.send({
      circuit_breaker: {
        state: metrics.open ? 'open' : 'closed',
        last_tripped: state.lastBreakerTripped,
        rules: {
          max_orders_per_hour: metrics.maxOrdersPerHour,
          max_spend_per_hour: metrics.maxSpendPerHour,
          over_benchmark_pct: 10,
        },
        rolling_metrics: {
          orders_last_hour: metrics.recentOrdersCount,
          spend_last_hour: metrics.recentSpend,
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

  // POST /v1/safety/reset
  app.post('/v1/safety/reset', async (_req, reply) => {
    state.killSwitchActive = false;
    state.circuitBreakerOpen = false;
    state.lastBreakerTripped = null;
    state.lastBreakerResetAt = Date.now();

    recordLedgerEntry('safety_breaker_reset', null, {
      action: 'safety_breaker_reset',
      timestamp: new Date().toISOString(),
    });

    return reply.send({
      status: 'armed',
      kill_switch_active: false,
      circuit_breaker_open: false,
      message: 'Circuit breaker and kill switch reset.',
    });
  });
};

