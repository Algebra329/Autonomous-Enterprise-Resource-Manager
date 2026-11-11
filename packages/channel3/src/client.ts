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

export const CHANNEL3_ANCHOR_QUERIES: Record<string, string> = {
  'LAP-14': 'Lenovo ThinkPad T14 Gen 5',
  'LAP-16': 'MacBook Pro 16 inch',
  'MON-24': 'HP E24 G5 monitor',
  'MON-27': '27 inch 4K USB-C monitor',
  'DOCK-TB': 'Lenovo ThinkPad Thunderbolt 4 dock',
};

export interface Channel3Benchmark {
  productId?: string;
  sku?: string;
  title: string;
  bestPrice: number;
  medianPrice: number;
  currency: string;
  offers: Channel3Offer[];
  checked_at: string;
  source: 'channel3-live' | 'fixture';
}

const USED_PRODUCT_RE = /\b(refurbished|renewed|used|pre-owned|open[-_ ]?box|reconditioned)\b/i;
const ACCESSORY_TITLE_RE =
  /\b(case|sleeve|cover|skin|skins|wrap|wraps|protector|charger|adapter|battery|cable|stand|mount|bag|backpack|keyboard|mouse|stylus|decal|sticker|riser|bracket|cleaner|wipes|replacement|compatible|dock|docking)\b/i;
const ACCESSORY_QUERY_RE =
  /\b(dock|docking|hub|adapter|charger|cable|stand|mount|case|sleeve|cover|skin|bag|backpack|keyboard|mouse|stylus|accessory|accessories)\b/i;
const LAPTOP_QUERY_RE = /\b(laptop|notebook|macbook|thinkpad|latitude|elitebook|xps|workstation)\b/i;
const MONITOR_QUERY_RE = /\b(monitor|display|screen|ultrawide)\b/i;

function computePriceStats(prices: number[]): { bestPrice: number; medianPrice: number } {
  const sorted = prices.slice().sort((a, b) => a - b);
  if (sorted.length === 0) {
    return { bestPrice: 0, medianPrice: 0 };
  }
  const bestPrice = Math.round(sorted[0]! * 100) / 100;
  const mid = Math.floor(sorted.length / 2);
  const rawMedian =
    sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const medianPrice = Math.round(rawMedian * 100) / 100;
  return { bestPrice, medianPrice };
}

function inferPriceFloor(query: string, categorySlug?: string): number {
  const isAccessoryQuery = ACCESSORY_QUERY_RE.test(query);
  const slug = (categorySlug || '').toLowerCase();
  if (!isAccessoryQuery && (LAPTOP_QUERY_RE.test(query) || slug.includes('laptop'))) {
    return 250;
  }
  if (!isAccessoryQuery && (MONITOR_QUERY_RE.test(query) || slug.includes('monitor'))) {
    return 80;
  }
  if (/\b(dock|docking)\b/i.test(query) || slug.includes('dock')) {
    return 50;
  }
  return 0.01;
}

function extractOfferPrice(raw: Record<string, unknown>): { price: number; currency: string } {
  const priceField = raw.price;
  let currency = typeof raw.currency === 'string' && raw.currency ? raw.currency : 'USD';
  let numeric = NaN;

  if (typeof priceField === 'number') {
    numeric = priceField;
  } else if (typeof priceField === 'string') {
    numeric = parseFloat(priceField);
  } else if (priceField && typeof priceField === 'object') {
    const pObj = priceField as Record<string, unknown>;
    if (typeof pObj.currency === 'string' && pObj.currency) {
      currency = pObj.currency;
    }
    const candidate = pObj.price ?? pObj.amount;
    if (typeof candidate === 'number') {
      numeric = candidate;
    } else if (typeof candidate === 'string') {
      numeric = parseFloat(candidate);
    }
  }

  return { price: numeric, currency: currency.toUpperCase() };
}

function extractMerchant(raw: Record<string, unknown>, url?: string): string {
  for (const key of [
    'domain',
    'merchant_domain',
    'merchant',
    'merchant_name',
    'website',
    'retailer',
    'seller',
  ]) {
    const val = raw[key];
    if (typeof val === 'string' && val.trim()) {
      return val.trim();
    }
    if (val && typeof val === 'object') {
      const obj = val as Record<string, unknown>;
      const nested = obj.domain ?? obj.name;
      if (typeof nested === 'string' && nested.trim()) {
        return nested.trim();
      }
    }
  }

  if (url) {
    try {
      const host = new URL(url).hostname;
      if (host) return host;
    } catch {
      // Ignore malformed URLs
    }
  }

  return 'merchant.example';
}

function parseChannel3Offers(rawOffers: unknown[], priceFloor: number): Channel3Offer[] {
  const parsed: Channel3Offer[] = [];
  for (const entry of rawOffers) {
    if (!entry || typeof entry !== 'object') continue;
    const o = entry as Record<string, unknown>;
    if (typeof o.condition === 'string' && USED_PRODUCT_RE.test(o.condition)) continue;

    const url =
      typeof o.buy_url === 'string'
        ? o.buy_url
        : typeof o.url === 'string'
          ? o.url
          : undefined;
    const { price, currency } = extractOfferPrice(o);

    let inStock = true;
    if (typeof o.in_stock === 'boolean') {
      inStock = o.in_stock;
    } else if (typeof o.availability === 'string' && o.availability.trim().length > 0) {
      const normAvail = o.availability.toLowerCase().replace(/[\s_-]/g, '');
      inStock = normAvail.includes('instock');
    }

    if (!inStock || !Number.isFinite(price) || price < priceFloor || currency !== 'USD') {
      continue;
    }

    parsed.push({
      merchant: extractMerchant(o, url),
      price: Math.round(price * 100) / 100,
      currency,
      in_stock: true,
      url,
    });
  }

  return parsed.sort((a, b) => a.price - b.price);
}

/**
 * Normalizes a Channel3 /v1/search response (`{ products: [...] }`) or legacy
 * flat offer response (`{ offers | results: [...] }`) into a Channel3Benchmark.
 * Returns null if no usable priced in-stock USD offers exist.
 */
export function normalizeChannel3Response(json: unknown, query: string): Channel3Benchmark | null {
  if (!json || typeof json !== 'object') return null;

  const isProductArray = (arr: unknown[]): arr is Array<Record<string, unknown>> =>
    arr.some(
      (item) =>
        Boolean(item) &&
        typeof item === 'object' &&
        Array.isArray((item as Record<string, unknown>).offers)
    );

  let rawProducts: Array<Record<string, unknown>> | null = null;
  let flatOffers: unknown[] | null = null;
  let topObj: Record<string, unknown> = {};

  if (Array.isArray(json)) {
    rawProducts = json.filter(
      (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object'
    );
  } else {
    topObj = json as Record<string, unknown>;
    if (Array.isArray(topObj.products)) {
      rawProducts = topObj.products.filter(
        (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object'
      );
    } else if (Array.isArray(topObj.results) && isProductArray(topObj.results)) {
      rawProducts = topObj.results.filter(
        (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object'
      );
    } else if (Array.isArray(topObj.offers)) {
      flatOffers = topObj.offers;
    } else if (Array.isArray(topObj.results)) {
      flatOffers = topObj.results;
    }
  }

  const checkedAt = new Date().toISOString();

  if (rawProducts !== null) {
    if (rawProducts.length === 0) return null;

    const isAccessoryQuery = ACCESSORY_QUERY_RE.test(query);
    const queryTokens = query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 0 && t !== 'inch' && (t.length >= 2 || /^\d+$/.test(t)));

    interface Candidate {
      productId?: string;
      title: string;
      offers: Channel3Offer[];
      fullHits: number;
      primaryHits: number;
    }

    const candidates: Candidate[] = [];
    for (const p of rawProducts) {
      const title = String(p.title ?? p.name ?? '').trim();
      if (!title) continue;
      if (USED_PRODUCT_RE.test(title)) continue;
      if (!isAccessoryQuery && ACCESSORY_TITLE_RE.test(title)) continue;

      let categorySlug: string | undefined;
      if (typeof p.category === 'string') {
        categorySlug = p.category;
      } else if (p.category && typeof p.category === 'object') {
        const catObj = p.category as Record<string, unknown>;
        if (typeof catObj.slug === 'string') {
          categorySlug = catObj.slug;
        }
      }

      const floor = inferPriceFloor(query, categorySlug);
      const offers = Array.isArray(p.offers) ? parseChannel3Offers(p.offers, floor) : [];
      if (offers.length === 0) continue;

      const brandNames = Array.isArray(p.brands)
        ? p.brands
            .map((b) => {
              if (typeof b === 'string') return b;
              if (b && typeof b === 'object') {
                const name = (b as Record<string, unknown>).name;
                return typeof name === 'string' ? name : '';
              }
              return '';
            })
            .filter(Boolean)
            .join(' ')
        : '';
      const featuresText = Array.isArray(p.key_features)
        ? p.key_features.filter((f): f is string => typeof f === 'string').join(' ')
        : '';
      const descriptionText = typeof p.description === 'string' ? p.description : '';

      const primaryText = `${title} ${brandNames}`.toLowerCase();
      const fullText = `${primaryText} ${descriptionText} ${featuresText}`.toLowerCase();

      const primaryHits = queryTokens.filter((tok) => primaryText.includes(tok)).length;
      const fullHits = queryTokens.filter((tok) => fullText.includes(tok)).length;

      const productId =
        typeof p.id === 'string'
          ? p.id
          : typeof p.product_id === 'string'
            ? p.product_id
            : undefined;

      candidates.push({
        productId,
        title,
        offers,
        fullHits,
        primaryHits,
      });
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
      if (b.fullHits !== a.fullHits) return b.fullHits - a.fullHits;
      const aMulti = a.offers.length >= 3 ? 1 : 0;
      const bMulti = b.offers.length >= 3 ? 1 : 0;
      if (bMulti !== aMulti) return bMulti - aMulti;
      if (b.primaryHits !== a.primaryHits) return b.primaryHits - a.primaryHits;
      return b.offers.length - a.offers.length;
    });

    const chosen = candidates[0]!;
    const { bestPrice, medianPrice } = computePriceStats(chosen.offers.map((o) => o.price));
    if (bestPrice <= 0 || medianPrice <= 0) return null;

    return {
      productId: chosen.productId,
      title: chosen.title,
      bestPrice,
      medianPrice,
      currency: 'USD',
      offers: chosen.offers,
      checked_at: checkedAt,
      source: 'channel3-live',
    };
  }

  if (flatOffers !== null) {
    const offers = parseChannel3Offers(flatOffers, inferPriceFloor(query));
    if (offers.length === 0) return null;
    const { bestPrice, medianPrice } = computePriceStats(offers.map((o) => o.price));
    return {
      productId: (topObj.product_id || topObj.id) as string | undefined,
      title: String(topObj.title || query),
      bestPrice,
      medianPrice,
      currency: String(topObj.currency || 'USD').toUpperCase(),
      offers,
      checked_at: checkedAt,
      source: 'channel3-live',
    };
  }

  return null;
}

export class Channel3Client {
  private apiKey?: string;
  private baseUrl: string;
  private cache: Map<string, { data: Channel3Benchmark; expiresAt: number }> = new Map();
  private inFlight: Map<string, Promise<Channel3Benchmark>> = new Map();
  private prefetchPromise: Promise<void> | null = null;
  private cacheTtlMs: number;
  private timeoutMs: number;
  private fetchFn?: typeof fetch;
  private fixtureData?: Record<string, FixtureItem>;

  constructor(options?: {
    apiKey?: string;
    baseUrl?: string;
    cacheTtlMs?: number;
    timeoutMs?: number;
    fetchFn?: typeof fetch;
  }) {
    this.apiKey = options?.apiKey || process.env.CHANNEL3_API_KEY;
    this.baseUrl = options?.baseUrl || 'https://api.trychannel3.com';
    const envTtl = Number(process.env.CHANNEL3_CACHE_TTL_MS);
    const envTimeout = Number(process.env.CHANNEL3_TIMEOUT_MS);
    this.cacheTtlMs = options?.cacheTtlMs ?? (Number.isFinite(envTtl) && envTtl > 0 ? envTtl : 6 * 60 * 60 * 1000); // 6h default
    this.timeoutMs = options?.timeoutMs ?? (Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : 25000); // 25s timeout for slow live calls
    this.fetchFn = options?.fetchFn;
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
   * Prefetches all 5 anchor hardware queries into cache (with 25s timeout).
   * Safe to call on startup; runs in background and falls back to fixtures if offline.
   */
  async prefetchAnchors(timeoutMs: number = Math.max(this.timeoutMs, 25000)): Promise<void> {
    if (this.prefetchPromise) return this.prefetchPromise;

    this.prefetchPromise = (async () => {
      const entries = Object.entries(CHANNEL3_ANCHOR_QUERIES);
      await Promise.allSettled(
        entries.map(async ([sku, query]) => {
          const benchmark = await this.searchWithTimeout(query, timeoutMs);
          const withSku: Channel3Benchmark = { ...benchmark, sku: benchmark.sku || sku };
          this.setCache(`sku:${sku.toUpperCase().trim()}`, withSku);
        })
      );
    })();

    return this.prefetchPromise;
  }

  /**
   * Search for benchmark pricing for a given query or hardware term.
   */
  async search(query: string): Promise<Channel3Benchmark> {
    return this.searchWithTimeout(query, this.timeoutMs);
  }

  private async searchWithTimeout(query: string, timeoutMs: number): Promise<Channel3Benchmark> {
    const cacheKey = `search:${query.toLowerCase().trim()}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const existingFlight = this.inFlight.get(cacheKey);
    if (existingFlight) return existingFlight;

    const task = (async () => {
      const requestFetch = this.fetchFn ?? (!process.env.VITEST ? fetch : undefined);
      // Try live API if apiKey is present
      if (this.apiKey && requestFetch) {
        try {
          const res = await requestFetch(`${this.baseUrl}/v1/search`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': this.apiKey,
            },
            body: JSON.stringify({ query, limit: 20 }),
            signal: AbortSignal.timeout(timeoutMs),
          });

          if (res.ok) {
            const json: unknown = await res.json();
            const benchmark = this.normalizeApiResponse(json, query);
            if (benchmark && benchmark.offers.length > 0) {
              this.setCache(cacheKey, benchmark);
              return benchmark;
            }
            console.warn(`[channel3] Live API returned no usable offers for "${query}", falling back to fixtures`);
          }
        } catch (err) {
          console.warn(`[channel3] Live API search failed for "${query}", falling back to fixtures:`, err);
        }
      }

      // Fallback to local fixture data
      const benchmark = this.searchFixtures(query);
      this.setCache(cacheKey, benchmark);
      return benchmark;
    })();

    this.inFlight.set(cacheKey, task);
    try {
      return await task;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  /**
   * Get benchmark pricing directly by SKU (e.g. LAP-14, MON-27).
   */
  async getBySku(sku: string): Promise<Channel3Benchmark> {
    const normalizedSku = sku.toUpperCase().trim();
    const cacheKey = `sku:${normalizedSku}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const anchorQuery = CHANNEL3_ANCHOR_QUERIES[normalizedSku];
    if (anchorQuery && this.apiKey && (this.fetchFn || !process.env.VITEST)) {
      const liveOrFallback = await this.search(anchorQuery);
      const benchmark: Channel3Benchmark = { ...liveOrFallback, sku: normalizedSku };
      this.setCache(cacheKey, benchmark);
      return benchmark;
    }

    if (this.fixtureData && this.fixtureData[normalizedSku]) {
      const item = this.fixtureData[normalizedSku];
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
        sku: normalizedSku,
        title: item.product_title || item.query || normalizedSku,
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
    return this.search(anchorQuery || sku);
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

  private normalizeApiResponse(json: unknown, query: string): Channel3Benchmark | null {
    return normalizeChannel3Response(json, query);
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
