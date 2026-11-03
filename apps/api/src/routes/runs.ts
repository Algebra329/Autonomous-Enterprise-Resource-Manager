import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import { state, recordLedgerEntry } from '../services/state.js';

export const runRoutes: FastifyPluginAsync = async (app) => {
  // POST /v1/runs
  app.post('/v1/runs', async (req, reply) => {
    if (state.killSwitchActive || state.circuitBreakerOpen) {
      return reply.status(403).send({
        error: {
          code: 'EXECUTION_HALTED',
          message: 'Cannot start run: Circuit breaker is open or kill switch is active.',
        },
      });
    }

    const runId = randomUUID();
    const body = (req.body || {}) as { trigger?: 'cron' | 'manual' | 'arena'; mode?: string };

    const run = {
      id: runId,
      trigger: body.trigger || 'manual',
      status: 'completed',
      mode: body.mode || 'auto_under_cap',
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      proposals_generated: state.proposals.size,
    };

    state.runs.set(runId, run);

    recordLedgerEntry('run_completed', runId, {
      run_id: runId,
      trigger: run.trigger,
      status: run.status,
    });

    return reply.status(201).send(run);
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

