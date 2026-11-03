export interface PayPalSubscriptionSummary {
  id: string;
  plan_id: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
  subscriber_email?: string;
  billing_amount?: string;
}

export function parseSubscriptionStatus(raw: string): string {
  return raw.toUpperCase();
}

