import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import { IntentMandateSchema } from '@rm/shared';
import { hashMandatePayload } from '@rm/guard';
import { state, recordLedgerEntry } from '../services/state.js';

export const mandateRoutes: FastifyPluginAsync = async (app) => {
  // POST /v1/mandates/intent
  app.post('/v1/mandates/intent', async (req, reply) => {
    const parseResult = IntentMandateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_MANDATE',
          message: 'Malformed Intent Mandate payload',
          details: parseResult.error.format(),
        },
      });
    }

    const mandate = parseResult.data;
    const payloadHash = hashMandatePayload(mandate);
    const mandateId = randomUUID();

    // Store in state
    state.mandates.set(mandateId, {
      ...mandate,
      id: mandateId,
      status: 'active',
      created_at: new Date().toISOString(),
    });

    state.usedNonces.add(mandate.nonce);

    // Record on the tamper-evident ledger
    recordLedgerEntry('mandate_registered', mandateId, {
      mandate_id: mandateId,
      issuer: mandate.issuer,
      payload_hash: payloadHash,
      type: 'intent',
      constraints: mandate.constraints,
    });

    return reply.status(201).send({
      id: mandateId,
      payload_hash: payloadHash,
      status: 'active',
    });
  });

  // GET /v1/mandates
  app.get('/v1/mandates', async (req, reply) => {
    const query = req.query as { status?: string };
    const list = Array.from(state.mandates.values()).filter((m) =>
      query.status ? m.status === query.status : true
    );
    return reply.send(list);
  });

  // POST /v1/mandates/:id/revoke
  app.post('/v1/mandates/:id/revoke', async (req, reply) => {
    const { id } = req.params as { id: string };
    const mandate = state.mandates.get(id);

    if (!mandate) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Mandate ${id} not found` },
      });
    }

    const body = (req.body || {}) as { reason?: string };
    const reason = body.reason || 'Revoked by manager';

    mandate.status = 'revoked';
    state.revokedMandateIds.add(id);
    state.revokedMandateIds.add(mandate.nonce);

    recordLedgerEntry('mandate_revoked', id, {
      mandate_id: id,
      reason,
      revoked_at: new Date().toISOString(),
    });

    return reply.send({ id, status: 'revoked', reason });
  });

  // GET /v1/keys/:issuer
  app.get('/v1/keys/:issuer', async (req, reply) => {
    const { issuer } = req.params as { issuer: string };
    // Simulated public key distribution (Spec 7.1)
    return reply.send({
      issuer,
      algorithm: 'ES256',
      public_key: {
        kty: 'EC',
        crv: 'P-256',
        x: 'f83OJ3D2xFmTtx9ERVU6ghp88-4437zODq9mq8INNm4',
        y: 'x_daQjjUz3WQK_ZTAwcIKO64J_EBuzZbv2IfwVR9mfA',
      },
    });
  });
};

