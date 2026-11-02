import { Channel3Client } from '../packages/channel3/src/client.js';

async function testLive() {
  console.log('====================================================');
  console.log('Testing Live Channel3 API with your CHANNEL3_API_KEY');
  console.log('====================================================\n');

  const apiKey = process.env.CHANNEL3_API_KEY;
  if (!apiKey) {
    console.error('ERROR: CHANNEL3_API_KEY is not set in your .env file!');
    process.exit(1);
  }

  console.log(`Key found: ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`);
  console.log('Querying Channel3 endpoint: https://api.trychannel3.com/v1/search\n');

  const client = new Channel3Client({ apiKey });

  try {
    const term = 'Lenovo ThinkPad laptop';
    console.log(`Searching for: "${term}"...`);
    const benchmark = await client.search(term);

    console.log('\n--- LIVE CHANNEL3 BENCHMARK RESULT ---');
    console.log(`Source:       ${benchmark.source}`);
    console.log(`Product Title: ${benchmark.title}`);
    console.log(`Best Price:   $${benchmark.bestPrice} ${benchmark.currency}`);
    console.log(`Median Price: $${benchmark.medianPrice} ${benchmark.currency}`);
    console.log(`Checked At:   ${benchmark.checked_at}`);
    console.log(`Offers count: ${benchmark.offers.length}`);

    if (benchmark.offers.length > 0) {
      console.log('\nTop Merchant Offers:');
      benchmark.offers.slice(0, 3).forEach((o, i) => {
        console.log(`  ${i + 1}. ${o.merchant}: $${o.price} ${o.currency} (In stock: ${o.in_stock})`);
      });
    }

    console.log('\nSUCCESS! Live Channel3 integration is working perfectly.');
  } catch (err) {
    console.error('Failed to query live API:', err);
  }
}

testLive();

