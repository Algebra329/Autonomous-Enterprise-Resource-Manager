import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const arenaRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/arena/summary', async (_req, reply) => {
    const candidates = [
      path.resolve(process.cwd(), 'arena/results/summary.json'),
      path.resolve(__dirname, '../../../../arena/results/summary.json'),
    ];

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        return reply.send(JSON.parse(raw));
      }
    }

    return reply.status(404).send({
      error: {
        code: 'ARENA_SUMMARY_NOT_FOUND',
        message: 'No arena/results/summary.json found on server.',
      },
    });
  });
};

