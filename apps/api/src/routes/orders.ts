import type { FastifyPluginAsync } from 'fastify';
import { buildProofPack } from '@rm/ledger';
import type { VendorQuote } from '@rm/shared';
import { state } from '../services/state.js';

export const orderRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/orders
  app.get('/v1/orders', async (_req, reply) => {
    const orders = Array.from(state.orders.values()).map((o) => ({
      id: o.id,
      proposal_id: o.proposal_id,
      vendor_id: o.vendor_id,
      sku: o.sku,
      quantity: o.quantity,
      unit_price: o.unit_price,
      amount: o.amount,
      currency: o.currency,
      paypal_order_id: o.paypal_order_id,
      status: o.status,
      created_at: o.created_at,
      issuer: o.mandate.issuer,
      mandate_type: o.mandate.type,
    }));
    return reply.send(orders.reverse());
  });

  // GET /v1/orders/:id/proof-pack
  app.get('/v1/orders/:id/proof-pack', async (req, reply) => {
    const { id } = req.params as { id: string };
    const order = state.orders.get(id);

    if (!order) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Order ${id} not found` },
      });
    }

    let ledgerIndex = -1;
    for (let i = state.ledger.length - 1; i >= 0; i--) {
      if (state.ledger[i]?.ref_id === id) {
        ledgerIndex = i;
        break;
      }
    }

    const latestLedger =
      ledgerIndex >= 0 ? state.ledger[ledgerIndex] : state.ledger[state.ledger.length - 1];
    const prevLedger =
      ledgerIndex > 0
        ? state.ledger[ledgerIndex - 1]
        : ledgerIndex === 0
          ? null
          : state.ledger.length > 1
            ? state.ledger[state.ledger.length - 2]
            : null;

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

