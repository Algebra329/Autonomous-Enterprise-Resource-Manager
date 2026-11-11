import type { FastifyPluginAsync } from 'fastify';
import { PolicyCompileRequestSchema } from '@rm/shared';
import { compilePolicy } from '../services/compiler.js';

export const policyRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/policies/compile', async (req, reply) => {
    const parseResult = PolicyCompileRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Request body must be { text: string }',
        },
      });
    }

    const compiled = await compilePolicy(parseResult.data.text);
    reply.header('X-Compiler-Path', compiled.path);
    return reply.send(compiled);
  });
};

