import type { FastifyPluginAsync } from 'fastify';
import { buildProofPack } from '@rm/ledger';
import type { VendorQuote } from '@rm/shared';
import { state } from '../services/state.js';

export const orderRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/orders/:id/proof-pack
  app.get('/v1/orders/:id/proof-pack', async (req, reply) => {
    const { id } = req.params as { id: string };
    const order = state.orders.get(id);

    if (!order) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Order ${id} not found` },
      });
    }

    const latestLedger = state.ledger[state.ledger.length - 1];
    const prevLedger = state.ledger.length > 1 ? state.ledger[state.ledger.length - 2] : null;

    const vendorQuote: VendorQuote = {
      quote_id: order.mandate.type === 'cart' ? order.mandate.cart.quote_id || 'q-default' : 'q-auto',
      vendor_id: order.vendor_id,
      sku: order.sku,
      quantity: order.quantity,
      unit_price: order.unit_price,
      currency: order.currency,
      valid_until: order.mandate.expires,
    };

    if (!order.mandate.signature) {
      return reply.status(500).send({
        error: { code: 'MISSING_SIGNATURE', message: `Order ${id} is missing mandate signature` },
      });
    }

    const proofPack = buildProofPack({
      proposal_id: order.proposal_id,
      order_id: id,
      mandate: order.mandate,
      signature: order.mandate.signature,
      vendor_quote: vendorQuote,
      ledger_hash: latestLedger ? latestLedger.hash : '0'.repeat(64),
      prev_hash: prevLedger ? prevLedger.hash : '0'.repeat(64),
      paypal_order_id: order.paypal_order_id,
      verified_at: order.created_at,
    });

    return reply.send(proofPack);
  });
};

