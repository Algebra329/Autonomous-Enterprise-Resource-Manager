import fs from 'fs';
import path from 'path';

export interface MLClientOptions {
  baseUrl?: string;
  serviceToken?: string;
  timeoutMs?: number;
}

export class MLClient {
  private baseUrl: string;
  private token?: string;
  private timeoutMs: number;

  constructor(options?: MLClientOptions) {
    this.baseUrl = options?.baseUrl || process.env.ML_SERVICE_URL || 'http://localhost:8000';
    this.token = options?.serviceToken || process.env.SERVICE_TOKEN;
    this.timeoutMs = options?.timeoutMs || 2000; // 2s timeout constraint
  }

  private async postWithTimeout<T>(endpoint: string, body: unknown): Promise<T | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      if (res.ok) {
        return (await res.json()) as T;
      }
    } catch (err) {
      console.warn(`[ml-client] Call to ${endpoint} timed out or failed, using deterministic fallback:`, err);
    }
    return null;
  }

  /**
   * Advisory Fair Price Scoring
   */
  async scorePrice(offers: Array<Record<string, unknown>>, candidatePrice?: number) {
    const mlRes = await this.postWithTimeout<Record<string, unknown>>('/score/price', {
      offers,
      candidate_price: candidatePrice,
    });
    if (mlRes) return mlRes;

    // Deterministic fallback: median price
    const prices = offers.map((o) => (typeof o.price === 'number' ? o.price : 0)).filter((p) => p > 0);
    const sorted = prices.sort((a, b) => a - b);
    const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)]! : candidatePrice || 0;
    return {
      fair_price: median,
      is_fallback: true,
      reason: 'ML service offline; used deterministic median',
    };
  }

  /**
   * Advisory Seat Idle Scoring
   */
  async scoreSeatIdle(seats: Array<Record<string, unknown>>, thresholdDays = 30) {
    const mlRes = await this.postWithTimeout<Record<string, unknown>>('/score/seat-idle', {
      seats,
      threshold_days: thresholdDays,
    });
    if (mlRes) return mlRes;

    // Deterministic fallback: 30-day inactivity check
    const now = Date.now();
    const idleCount = seats.filter((s) => {
      if (!s.last_active_at) return true;
      const diffDays = (now - new Date(String(s.last_active_at)).getTime()) / (1000 * 60 * 60 * 24);
      return diffDays >= thresholdDays;
    }).length;

    return {
      idle_count: idleCount,
      total_seats: seats.length,
      idle_ratio: seats.length > 0 ? idleCount / seats.length : 0,
      is_fallback: true,
    };
  }

  /**
   * Backtest Execution
   */
  async runBacktest(policy: Record<string, unknown>, purchases?: Array<Record<string, unknown>>) {
    const mlRes = await this.postWithTimeout<Record<string, unknown>>('/backtest', {
      policy,
      purchases: purchases || [],
    });
    if (mlRes) return mlRes;

    // Fixture fallback to seed/backtest-demo.json
    try {
      const candidates = [
        path.resolve(process.cwd(), 'seed/backtest-demo.json'),
        path.resolve(process.cwd(), '../../seed/backtest-demo.json'),
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          return JSON.parse(fs.readFileSync(p, 'utf8'));
        }
      }
    } catch {
      // ignore
    }
    return {
      is_fallback: true,
      summary: { auto_approved: 0, escalated: 0, blocked: 0 },
    };
  }
}

export const defaultMLClient = new MLClient();

