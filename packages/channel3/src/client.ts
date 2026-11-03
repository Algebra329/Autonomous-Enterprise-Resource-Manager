import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from workspace root
const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../../../.env'),
];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

export interface Channel3Offer {
  merchant: string;
  price: number;
  currency: string;
  in_stock: boolean;
  url?: string;
}

export interface FixtureOffer {
  merchant: string;
  price: number;
  currency?: string;
  in_stock?: boolean;
  url?: string;
}

export interface FixtureItem {
  query?: string;
  product_title?: string;
  median_price?: number;
  currency?: string;
  offers?: FixtureOffer[];
}

export interface Channel3Benchmark {
  productId?: string;
  sku?: string;
  title: string;
  bestPrice: number;
  medianPrice: number;
  currency: string;
  offers: Channel3Offer[];
  checked_at: string;
  source: 'live' | 'fixture';
}

export class Channel3Client {
  private apiKey?: string;
  private baseUrl: string;
  private cache: Map<string, { data: Channel3Benchmark; expiresAt: number }> = new Map();
  private cacheTtlMs: number;
  private fixtureData?: Record<string, FixtureItem>;

  constructor(options?: { apiKey?: string; baseUrl?: string; cacheTtlMs?: number }) {
    this.apiKey = options?.apiKey || process.env.CHANNEL3_API_KEY;
    this.baseUrl = options?.baseUrl || 'https://api.trychannel3.com';
    this.cacheTtlMs = options?.cacheTtlMs ?? 5 * 60 * 1000; // 5 min default
    this.loadFixtures();
  }

  private loadFixtures() {
    try {
      const candidates = [
        path.resolve(process.cwd(), 'seed/benchmarks-fixture.json'),
        path.resolve(__dirname, '../../../seed/benchmarks-fixture.json'),
        path.resolve(__dirname, '../../../../seed/benchmarks-fixture.json'),
      ];

      for (const fixturePath of candidates) {
        if (fs.existsSync(fixturePath)) {
          const raw = fs.readFileSync(fixturePath, 'utf8');
          const parsed = JSON.parse(raw);
          this.fixtureData = parsed.items || {};
          break;
        }
      }
    } catch (err) {
      console.warn('[channel3] Could not load local benchmarks-fixture.json:', err);
    }
  }

  /**
   * Search for benchmark pricing for a given query or hardware term.
   */
  async search(query: string): Promise<Channel3Benchmark> {
    const cacheKey = `search:${query.toLowerCase().trim()}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    // Try live API if apiKey is present
    if (this.apiKey && !process.env.VITEST) {
      try {
        const res = await fetch(`${this.baseUrl}/v1/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
          },
          body: JSON.stringify({ query }),
        });

        if (res.ok) {
          const json = (await res.json()) as Record<string, unknown>;
          const benchmark = this.normalizeApiResponse(json, query);
          this.setCache(cacheKey, benchmark);
          return benchmark;
        }
      } catch (err) {
        console.warn(`[channel3] Live API search failed for "${query}", falling back to fixtures:`, err);
      }
    }

    // Fallback to local fixture data
    const benchmark = this.searchFixtures(query);
    this.setCache(cacheKey, benchmark);
    return benchmark;
  }

  /**
   * Get benchmark pricing directly by SKU (e.g. LAP-14, MON-27).
   */
  async getBySku(sku: string): Promise<Channel3Benchmark> {
    const cacheKey = `sku:${sku.toUpperCase().trim()}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    if (this.fixtureData && this.fixtureData[sku]) {
      const item = this.fixtureData[sku];
      const offers: Channel3Offer[] = (item.offers || []).map((o) => ({
        merchant: o.merchant,
        price: o.price,
        currency: o.currency || 'USD',
        in_stock: o.in_stock ?? true,
        url: o.url,
      }));

      const prices = offers.filter((o) => o.in_stock).map((o) => o.price);
      const bestPrice = prices.length > 0 ? Math.min(...prices) : item.median_price || 1000;

      const benchmark: Channel3Benchmark = {
        sku,
        title: item.product_title || item.query || sku,
        bestPrice,
        medianPrice: item.median_price || bestPrice,
        currency: item.currency || 'USD',
        offers,
        checked_at: new Date().toISOString(),
        source: 'fixture',
      };

      this.setCache(cacheKey, benchmark);
      return benchmark;
    }

    // Default fallback if SKU not in fixture
    return this.search(sku);
  }

  /**
   * Re-checks price for price-drift detection right before execution.
   */
  async recheckPrice(
    sku: string,
    previousPrice: number
  ): Promise<{ currentPrice: number; driftPct: number; benchmark: Channel3Benchmark }> {
    const benchmark = await this.getBySku(sku);
    const currentPrice = benchmark.medianPrice || benchmark.bestPrice;
    const driftPct = Math.abs((currentPrice - previousPrice) / previousPrice) * 100;

    return {
      currentPrice,
      driftPct,
      benchmark,
    };
  }

  private searchFixtures(query: string): Channel3Benchmark {
    const q = query.toLowerCase();
    if (this.fixtureData) {
      for (const [sku, item] of Object.entries(this.fixtureData)) {
        if (
          sku.toLowerCase().includes(q) ||
          item.query?.toLowerCase().includes(q) ||
          item.product_title?.toLowerCase().includes(q)
        ) {
          const offers: Channel3Offer[] = (item.offers || []).map((o) => ({
            merchant: o.merchant,
            price: o.price,
            currency: o.currency || 'USD',
            in_stock: o.in_stock ?? true,
            url: o.url,
          }));

          const prices = offers.filter((o) => o.in_stock).map((o) => o.price);
          const bestPrice = prices.length > 0 ? Math.min(...prices) : item.median_price || 1000;

          return {
            sku,
            title: item.product_title || item.query || query,
            bestPrice,
            medianPrice: item.median_price || bestPrice,
            currency: item.currency || 'USD',
            offers,
            checked_at: new Date().toISOString(),
            source: 'fixture',
          };
        }
      }
    }

    // Generic safe fallback
    const isSkuCandidate =
      query.toUpperCase().startsWith('LAP-') ||
      query.toUpperCase().startsWith('MON-') ||
      query.toUpperCase().startsWith('DOCK-');

    return {
      sku: isSkuCandidate ? query : undefined,
      title: query,
      bestPrice: 1200,
      medianPrice: 1250,
      currency: 'USD',
      offers: [
        { merchant: 'market-baseline.example', price: 1200, currency: 'USD', in_stock: true },
        { merchant: 'reference.example', price: 1250, currency: 'USD', in_stock: true },
      ],
      checked_at: new Date().toISOString(),
      source: 'fixture',
    };
  }

  private normalizeApiResponse(json: Record<string, unknown>, query: string): Channel3Benchmark {
    const rawOffers = (json.offers || json.results || []) as Array<Record<string, unknown>>;
    const offers: Channel3Offer[] = rawOffers.map((o) => ({
      merchant: String(o.merchant_domain || o.merchant || 'merchant.example'),
      price: typeof o.price === 'number' ? o.price : parseFloat(String(o.price || '0')),
      currency: String(o.currency || 'USD'),
      in_stock: (o.in_stock as boolean | undefined) ?? true,
      url: (o.buy_url || o.url) as string | undefined,
    }));

    const validPrices = offers.filter((o) => o.in_stock && o.price > 0).map((o) => o.price);
    const bestPrice = validPrices.length > 0 ? Math.min(...validPrices) : 1000;
    const medianPrice =
      validPrices.length > 0
        ? validPrices.sort((a, b) => a - b)[Math.floor(validPrices.length / 2)]!
        : bestPrice;

    return {
      productId: (json.product_id || json.id) as string | undefined,
      title: String(json.title || query),
      bestPrice,
      medianPrice,
      currency: String(json.currency || 'USD'),
      offers,
      checked_at: new Date().toISOString(),
      source: 'live',
    };
  }

  private getFromCache(key: string): Channel3Benchmark | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  private setCache(key: string, data: Channel3Benchmark) {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }
}

export const defaultChannel3 = new Channel3Client();
