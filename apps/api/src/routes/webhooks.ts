import type { FastifyPluginAsync } from 'fastify';
import { recordLedgerEntry } from '../services/state.js';

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  // POST /webhooks/paypal
  app.post('/webhooks/paypal', async (req, reply) => {
    const event = (req.body || {}) as {
      id?: string;
      event_type?: string;
      resource?: Record<string, unknown>;
    };

    const eventId = event.id || `evt_${Date.now()}`;
    const eventType = event.event_type || 'PAYMENT.CAPTURE.COMPLETED';

    recordLedgerEntry('paypal_webhook_event', eventId, {
      event_id: eventId,
      event_type: eventType,
      resource: event.resource || {},
      received_at: new Date().toISOString(),
    });

    return reply.status(200).send({ received: true, event_id: eventId });
  });
};

