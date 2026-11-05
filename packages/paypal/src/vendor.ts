export interface VendorCaptureParams {
  orderId: string;
  payeeEmail?: string;
  amount: number;
  currency: string;
}

export interface CapturePayload {
  order_id: string;
  payee_email?: string;
  amount: {
    currency_code: string;
    value: string;
  };
}

export function formatCapturePayload(params: VendorCaptureParams): CapturePayload {
  return {
    order_id: params.orderId,
    payee_email: params.payeeEmail,
    amount: {
      currency_code: params.currency,
      value: params.amount.toFixed(2),
    },
  };
}

