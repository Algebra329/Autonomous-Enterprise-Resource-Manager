import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { healthRoutes } from './routes/health.js';
import { policyRoutes } from './routes/policies.js';
import { mandateRoutes } from './routes/mandates.js';
import { proposalRoutes } from './routes/proposals.js';
import { orderRoutes } from './routes/orders.js';
import { ledgerRoutes } from './routes/ledger.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { safetyRoutes } from './routes/safety.js';
import { runRoutes } from './routes/runs.js';
import { webhookRoutes } from './routes/webhooks.js';
import { backtestRoutes } from './routes/backtest.js';
import { docRoutes } from './routes/docs.js';

export async function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : true,
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(cookie);

  // Register All Route Plugins
  await app.register(healthRoutes);
  await app.register(policyRoutes);
  await app.register(mandateRoutes);
  await app.register(proposalRoutes);
  await app.register(orderRoutes);
  await app.register(ledgerRoutes);
  await app.register(dashboardRoutes);
  await app.register(safetyRoutes);
  await app.register(runRoutes);
  await app.register(webhookRoutes);
  await app.register(backtestRoutes);
  await app.register(docRoutes);

  return app;
}

// Start server when run directly (not during vitest test execution)
const isDirectRun =
  !process.env.VITEST &&
  Boolean(
    process.argv[1] &&
      (import.meta.url.toLowerCase().includes(process.argv[1].replace(/\\/g, '/').toLowerCase()) ||
        process.argv[1].endsWith('index.ts') ||
        process.argv[1].endsWith('index.js'))
  );

if (isDirectRun) {
  const port = parseInt(process.env.PORT || '4000', 10);
  const host = process.env.HOST || '0.0.0.0';

  buildApp()
    .then((app) => app.listen({ port, host }))
    .then((address) => {
      console.log(`[api] Autonomous Enterprise Resource Manager API listening on ${address}`);
    })
    .catch((err) => {
      console.error('[api] Failed to start server:', err);
      process.exit(1);
    });
}

