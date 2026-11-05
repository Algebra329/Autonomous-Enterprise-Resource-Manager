import type { FastifyPluginAsync } from 'fastify';
import fs from 'fs';
import path from 'path';

export const backtestRoutes: FastifyPluginAsync = async (app) => {
  // POST /v1/backtest
  app.post('/v1/backtest', async (req, reply) => {
    const mlUrl = process.env.ML_SERVICE_URL;
    const serviceToken = process.env.SERVICE_TOKEN;

    // Try calling Robiu's advisory ML service if configured
    if (mlUrl) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        const res = await fetch(`${mlUrl}/backtest`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}),
          },
          body: JSON.stringify(req.body || {}),
          signal: controller.signal,
        });

        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json();
          return reply.send(data);
        }
      } catch (err) {
        console.warn('[backtest] ML service unavailable, falling back to seed/backtest-demo.json:', err);
      }
    }

    // Deterministic fallback to seed/backtest-demo.json
    const candidates = [
      path.resolve(process.cwd(), 'seed/backtest-demo.json'),
      path.resolve(process.cwd(), '../../seed/backtest-demo.json'),
    ];

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        return reply.send(JSON.parse(raw));
      }
    }

    return reply.status(500).send({
      error: { code: 'BACKTEST_UNAVAILABLE', message: 'No backtest fixture or ML service available' },
    });
  });
};

