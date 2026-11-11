import type { FastifyPluginAsync } from 'fastify';
import { verifyLedgerChain } from '@rm/ledger';
import { state } from '../services/state.js';

export const ledgerRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/ledger?from=&to=&type=
  app.get('/v1/ledger', async (req, reply) => {
    const query = req.query as { from?: string; to?: string; type?: string };

    let entries = state.ledger;
    if (query.type) {
      entries = entries.filter((e) => e.type === query.type);
    }

    const verification = verifyLedgerChain(state.ledger);

    return reply.send({
      chain_status: verification.valid ? 'VALID' : 'TAMPERED',
      total_entries: state.ledger.length,
      filtered_entries: entries.length,
      entries,
    });
  });
};

