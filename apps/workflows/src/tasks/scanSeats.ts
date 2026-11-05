import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface IdleSubscriptionSummary {
  subscription_id: string;
  app: string;
  vendor_id: string;
  monthly_cost: number;
  seat_count: number;
  idle_seat_count: number;
  idle_ratio: number;
  suggest_cancellation: boolean;
  reason: string;
}

/**
 * Scans SaaS software seats and subscriptions for underutilized or abandoned licenses.
 */
export async function scanSeats(
  idleDaysThreshold = 30,
  asOfDate: Date = new Date()
): Promise<IdleSubscriptionSummary[]> {
  const summaries: IdleSubscriptionSummary[] = [];

  const saasCandidates = [
    path.resolve(process.cwd(), 'seed/saas.json'),
    path.resolve(__dirname, '../../../../seed/saas.json'),
  ];
  const seatsCandidates = [
    path.resolve(process.cwd(), 'seed/seats.json'),
    path.resolve(__dirname, '../../../../seed/seats.json'),
  ];

  interface RawSaasApp {
    id: string;
    subscription_id: string;
    app: string;
    vendor_id: string;
    monthly_cost: number;
    seat_count?: number;
  }

  interface RawSeat {
    id: string;
    subscription_id: string;
    last_active_at?: string;
  }

  let saasApps: RawSaasApp[] = [];
  for (const p of saasCandidates) {
    if (fs.existsSync(p)) {
      saasApps = JSON.parse(fs.readFileSync(p, 'utf8'));
      break;
    }
  }

  let seats: RawSeat[] = [];
  for (const p of seatsCandidates) {
    if (fs.existsSync(p)) {
      seats = JSON.parse(fs.readFileSync(p, 'utf8'));
      break;
    }
  }

  // Group seats by subscription_id
  const seatsBySub = new Map<string, RawSeat[]>();
  for (const st of seats) {
    const list = seatsBySub.get(st.subscription_id) || [];
    list.push(st);
    seatsBySub.set(st.subscription_id, list);
  }

  for (const sub of saasApps) {
    const subSeats = seatsBySub.get(sub.id) || [];
    let idleCount = 0;

    for (const seat of subSeats) {
      if (!seat.last_active_at) {
        idleCount++;
        continue;
      }
      const lastActive = new Date(seat.last_active_at);
      const daysInactive = Math.floor((asOfDate.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));
      if (daysInactive >= idleDaysThreshold) {
        idleCount++;
      }
    }

    const totalSeats = subSeats.length > 0 ? subSeats.length : sub.seat_count || 1;
    const idleRatio = totalSeats > 0 ? idleCount / totalSeats : 0;

    // Suggest cancellation if idle ratio >= 40% or no recent activity
    if (idleRatio >= 0.4 || idleCount >= 20) {
      summaries.push({
        subscription_id: sub.id,
        app: sub.app,
        vendor_id: sub.vendor_id,
        monthly_cost: typeof sub.monthly_cost === 'number' ? sub.monthly_cost : parseFloat(sub.monthly_cost),
        seat_count: totalSeats,
        idle_seat_count: idleCount,
        idle_ratio: Math.round(idleRatio * 100) / 100,
        suggest_cancellation: true,
        reason: `${idleCount} of ${totalSeats} seats (${Math.round(idleRatio * 100)}%) idle for >${idleDaysThreshold} days`,
      });
    }
  }

  return summaries;
}

