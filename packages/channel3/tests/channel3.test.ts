import { describe, it, expect } from 'vitest';
import { Channel3Client, normalizeChannel3Response } from '../src/client.js';

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

  it('normalizes Channel3 /v1/search products[] payload, filtering accessories/used/out-of-stock and selecting multi-offer product', () => {
    const apiPayload = {
      products: [
        {
          id: 'skin-1',
          title: 'Lenovo ThinkPad T14 Skins & Wraps',
          category: { slug: 'laptop-accessories' },
          offers: [
            {
              url: 'https://buy.trychannel3.com/skin-1',
              domain: 'decalgirl.com',
              price: { price: 24.99, currency: 'USD' },
              availability: 'InStock',
              condition: 'new',
            },
          ],
        },
        {
          id: 'used-1',
          title: 'Refurbished Lenovo ThinkPad T14 Gen 5 Laptop',
          brands: [{ name: 'Lenovo' }],
          category: { slug: 'laptops' },
          offers: [
            {
              url: 'https://buy.trychannel3.com/used-1',
              domain: 'outlet.example.com',
              price: { price: 899, currency: 'USD' },
              availability: 'InStock',
              condition: 'refurbished',
            },
          ],
        },
        {
          id: 'single-1',
          title: 'Lenovo ThinkPad T14 Gen 5 Business Laptop',
          brands: [{ name: 'Lenovo' }],
          category: { slug: 'laptops' },
          offers: [
            {
              url: 'https://buy.trychannel3.com/single-1',
              domain: 'newegg.com',
              price: { price: 1399.99, currency: 'USD' },
              availability: 'InStock',
              condition: 'new',
            },
          ],
        },
        {
          id: 'MKfy49V',
          title: 'Lenovo ThinkPad T14 Gen 5 - AI PC',
          description: '14 inch business laptop with Intel Core Ultra 7.',
          brands: [{ name: 'Lenovo' }],
          category: { slug: 'laptops' },
          offers: [
            {
              url: 'https://buy.trychannel3.com/o1',
              domain: 'bestbuy.com',
              price: { price: 1953.99, currency: 'USD' },
              availability: 'InStock',
              condition: 'new',
            },
            {
              url: 'https://buy.trychannel3.com/o2',
              domain: 'adorama.com',
              price: { price: 1234.0, currency: 'USD' },
              availability: 'InStock',
              condition: 'new',
            },
            {
              url: 'https://buy.trychannel3.com/o3',
              domain: 'officedepot.com',
              price: { price: 1587.99, currency: 'USD' },
              availability: 'InStock',
              condition: 'new',
            },
            {
              url: 'https://buy.trychannel3.com/o4',
              domain: 'cdw.com',
              price: { price: 1486.99, currency: 'USD' },
              availability: 'InStock',
              condition: 'new',
            },
            {
              url: 'https://buy.trychannel3.com/o5',
              domain: 'newegg.com',
              price: { price: 1728.99, currency: 'USD' },
              availability: 'InStock',
              condition: 'new',
            },
            {
              url: 'https://buy.trychannel3.com/oos',
              domain: 'oos.example.com',
              price: { price: 999.0, currency: 'USD' },
              availability: 'OutOfStock',
              condition: 'new',
            },
            {
              url: 'https://buy.trychannel3.com/eur',
              domain: 'eu.example.com',
              price: { price: 1400.0, currency: 'EUR' },
              availability: 'InStock',
              condition: 'new',
            },
            {
              url: 'https://buy.trychannel3.com/cheap-psu',
              domain: 'parts.example.com',
              price: { price: 45.0, currency: 'USD' },
              availability: 'InStock',
              condition: 'new',
            },
          ],
        },
      ],
    };

    const res = normalizeChannel3Response(apiPayload, 'Lenovo ThinkPad T14 Gen 5');
    expect(res).not.toBeNull();
    expect(res!.source).toBe('channel3-live');
    expect(res!.productId).toBe('MKfy49V');
    expect(res!.title).toBe('Lenovo ThinkPad T14 Gen 5 - AI PC');
    expect(res!.offers).toHaveLength(5);
    expect(res!.bestPrice).toBe(1234.0);
    expect(res!.medianPrice).toBe(1587.99);
    expect(res!.offers[0]?.merchant).toBe('adorama.com');
  });

  it('preserves docks for dock queries while filtering cheap non-dock cables', () => {
    const dockPayload = {
      products: [
        {
          id: 'dock-1',
          title: 'Thinkpad Thunderbolt 4 Smart Dock Gen 2',
          brands: [{ name: 'Lenovo' }],
          category: { slug: 'laptop-docking-stations' },
          offers: [
            { domain: 'lenovo.com', price: { price: 277.19, currency: 'USD' }, availability: 'InStock' },
            { domain: 'bhphotovideo.com', price: { price: 296.99, currency: 'USD' }, availability: 'InStock' },
            { domain: 'cdw.com', price: { price: 303.99, currency: 'USD' }, availability: 'InStock' },
            { domain: 'bestbuy.com', price: { price: 364.99, currency: 'USD' }, availability: 'InStock' },
            { domain: 'cheapcable.com', price: { price: 19.99, currency: 'USD' }, availability: 'InStock' },
          ],
        },
      ],
    };

    const res = normalizeChannel3Response(dockPayload, 'Lenovo ThinkPad Thunderbolt 4 dock');
    expect(res).not.toBeNull();
    expect(res!.offers).toHaveLength(4);
    expect(res!.bestPrice).toBe(277.19);
    expect(res!.medianPrice).toBe(300.49);
  });

  it('uses channel3-live when mocked fetch returns valid products and falls back to fixture when 0 usable offers remain', async () => {
    const liveMockFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          products: [
            {
              id: 'tp-live',
              title: 'Lenovo ThinkPad T14 Gen 5 Business Laptop',
              brands: [{ name: 'Lenovo' }],
              category: { slug: 'laptops' },
              offers: [
                {
                  domain: 'cdw.com',
                  price: { price: 1486.99, currency: 'USD' },
                  availability: 'InStock',
                  condition: 'new',
                },
                {
                  domain: 'newegg.com',
                  price: { price: 1399.99, currency: 'USD' },
                  availability: 'InStock',
                  condition: 'new',
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );

    const liveClient = new Channel3Client({ apiKey: 'test-key', fetchFn: liveMockFetch });
    const liveRes = await liveClient.search('Lenovo ThinkPad laptop');
    expect(liveRes.source).toBe('channel3-live');
    expect(liveRes.offers).toHaveLength(2);
    expect(liveRes.bestPrice).toBe(1399.99);
    expect(liveRes.medianPrice).toBe(1443.49);

    const emptyMockFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ products: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const emptyClient = new Channel3Client({ apiKey: 'test-key', fetchFn: emptyMockFetch });
    const fallbackRes = await emptyClient.search('Lenovo ThinkPad T14 Gen 5');
    expect(fallbackRes.source).toBe('fixture');
    expect(fallbackRes.offers.length).toBeGreaterThan(0);
    expect(fallbackRes.medianPrice).toBeGreaterThan(0);
  });
});

