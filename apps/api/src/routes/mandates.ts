import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import { IntentMandateSchema } from '@rm/shared';
import { hashMandatePayload, makeEs256Verifier } from '@rm/guard';
import {
  state,
  recordLedgerEntry,
  isValidP256Jwk,
  registerIssuerKey,
  getIssuerRegistry,
} from '../services/state.js';

export const mandateRoutes: FastifyPluginAsync = async (app) => {
  // POST /v1/mandates/intent
  app.post('/v1/mandates/intent', async (req, reply) => {
    const rawBody = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const maybePublicKey = rawBody.public_key;
    const mandateCandidate = { ...rawBody };
    delete mandateCandidate.public_key;

    const parseResult = IntentMandateSchema.safeParse(mandateCandidate);
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

    // Optional TOFU registration of issuer's ES256 P-256 public JWK when submitting first mandate
    if (maybePublicKey !== undefined) {
      if (!isValidP256Jwk(maybePublicKey)) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_PUBLIC_KEY',
            message: 'public_key must be an EC P-256 JWK { kty: "EC", crv: "P-256", x, y }',
          },
        });
      }
      const reg = registerIssuerKey(mandate.issuer, maybePublicKey);
      if (!reg.ok) {
        return reply.status(409).send({
          error: {
            code: 'KEY_CONFLICT',
            message: reg.reason,
          },
        });
      }
    }

    const payloadHash = hashMandatePayload(mandate);

    // If the Intent Mandate includes a signature, verify it cryptographically against the registered issuer key
    if (mandate.signature !== undefined) {
      const verifier = makeEs256Verifier(getIssuerRegistry());
      if (!verifier(payloadHash, mandate.signature, mandate.issuer)) {
        return reply.status(403).send({
          error: {
            code: 'VERIFICATION_BLOCKED',
            message: 'Intent Mandate signature verification failed or issuer public key is not registered',
            rule: 'SIGNATURE_INVALID',
          },
        });
      }
    }

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

  // POST /v1/keys/:issuer - Register an ES256 P-256 public JWK for an issuer (Trust-On-First-Use)
  app.post('/v1/keys/:issuer', async (req, reply) => {
    const { issuer } = req.params as { issuer: string };
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const candidate = body.public_key ?? body;

    if (!isValidP256Jwk(candidate)) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_PUBLIC_KEY',
          message: 'Body must carry an EC P-256 JWK { kty: "EC", crv: "P-256", x, y }',
        },
      });
    }

    const reg = registerIssuerKey(issuer, candidate);
    if (!reg.ok) {
      return reply.status(409).send({
        error: {
          code: 'KEY_CONFLICT',
          message: reg.reason,
        },
      });
    }

    return reply.status(201).send({
      issuer,
      algorithm: 'ES256',
      public_key: state.issuerKeys.get(issuer),
    });
  });

  // GET /v1/keys/:issuer
  app.get('/v1/keys/:issuer', async (req, reply) => {
    const { issuer } = req.params as { issuer: string };
    const jwk = state.issuerKeys.get(issuer);
    if (!jwk) {
      return reply.status(404).send({
        error: {
          code: 'KEY_NOT_FOUND',
          message: `No ES256 public key registered for issuer "${issuer}"`,
        },
      });
    }
    return reply.send({
      issuer,
      algorithm: 'ES256',
      public_key: jwk,
    });
  });
};

