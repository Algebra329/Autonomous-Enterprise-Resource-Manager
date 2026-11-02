import { describe, it, expect } from 'vitest';
import { Channel3Client } from '../src/client.js';

describe('packages/channel3 - Price Benchmark Client', () => {
  const client = new Channel3Client({ cacheTtlMs: 1000 });

  it('retrieves benchmark pricing by SKU from fixture data', async () => {
    const res = await client.getBySku('LAP-14');
    expect(res).toBeDefined();
    expect(res.sku).toBe('LAP-14');
    expect(res.medianPrice).toBeGreaterThan(1000);
    expect(res.bestPrice).toBeGreaterThan(0);
    expect(res.offers.length).toBeGreaterThan(0);
    expect(res.currency).toBe('USD');
  });

  it('performs query search matching title or hardware terms', async () => {
    const res = await client.search('Thunderbolt 4');
    expect(res).toBeDefined();
    expect(res.title.toLowerCase()).toContain('thunderbolt');
    expect(res.bestPrice).toBeGreaterThan(0);
  });

  it('caches responses for identical queries', async () => {
    const first = await client.getBySku('MON-27');
    const second = await client.getBySku('MON-27');
    expect(first.checked_at).toBe(second.checked_at);
  });

  it('calculates price drift between recheck and initial price', async () => {
    const initialPrice = 1400;
    const { currentPrice, driftPct, benchmark } = await client.recheckPrice('LAP-14', initialPrice);
    expect(currentPrice).toBeGreaterThan(0);
    expect(driftPct).toBeGreaterThanOrEqual(0);
    expect(benchmark.sku).toBe('LAP-14');
  });
});

