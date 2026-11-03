import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function seedDatabase() {
  console.log('[db:seed] Starting database seeding from seed/*.json...');
  const seedDir = path.resolve(__dirname, '../../../../seed');

  if (!fs.existsSync(seedDir)) {
    console.error(`[db:seed] Seed directory not found: ${seedDir}`);
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Seed Assets (Hardware)
    const assetsFile = path.join(seedDir, 'assets.json');
    if (fs.existsSync(assetsFile)) {
      const assets = JSON.parse(fs.readFileSync(assetsFile, 'utf8'));
      console.log(`[db:seed] Seeding ${assets.length} assets...`);
      for (const a of assets) {
        await client.query(
          `INSERT INTO assets (id, asset_tag, name, category, sku, purchased_at, replace_after_months, status, assigned_to, purchase_price)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO NOTHING`,
          [
            a.id,
            a.asset_tag || null,
            a.name,
            a.category,
            a.sku || null,
            a.purchased_at,
            a.replace_after_months || 36,
            a.status || 'active',
            a.assigned_to || null,
            a.purchase_price || null,
          ]
        );
      }
      console.log('[db:seed] Assets seeded.');
    }

    // 2. Seed SaaS Subscriptions
    const saasFile = path.join(seedDir, 'saas.json');
    if (fs.existsSync(saasFile)) {
      const saas = JSON.parse(fs.readFileSync(saasFile, 'utf8'));
      console.log(`[db:seed] Seeding ${saas.length} SaaS subscriptions...`);
      for (const s of saas) {
        await client.query(
          `INSERT INTO saas_subscriptions (id, app, vendor_id, paypal_enabled, paypal_subscription_id, seat_price, seat_count, monthly_cost, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO NOTHING`,
          [
            s.id,
            s.app,
            s.vendor_id,
            s.paypal_enabled ?? false,
            s.paypal_subscription_id || null,
            s.seat_price || null,
            s.seat_count || 0,
            s.monthly_cost,
            s.status || 'active',
          ]
        );
      }
      console.log('[db:seed] SaaS subscriptions seeded.');
    }

    // 3. Seed Seats
    const seatsFile = path.join(seedDir, 'seats.json');
    if (fs.existsSync(seatsFile)) {
      const seats = JSON.parse(fs.readFileSync(seatsFile, 'utf8'));
      console.log(`[db:seed] Seeding ${seats.length} SaaS seat records...`);
      // Batch insert in chunks of 500 for high performance
      const chunkSize = 500;
      for (let i = 0; i < seats.length; i += chunkSize) {
        const chunk = seats.slice(i, i + chunkSize);
        for (const st of chunk) {
          await client.query(
            `INSERT INTO seats (id, subscription_id, user_email, last_active_at, weekly_sessions_13w)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO NOTHING`,
            [
              st.id,
              st.subscription_id,
              st.user_email,
              st.last_active_at,
              st.weekly_sessions_13w ? JSON.stringify(st.weekly_sessions_13w) : null,
            ]
          );
        }
      }
      console.log('[db:seed] Seats seeded.');
    }

    // 4. Seed Purchase History (history-90d.json)
    const historyFile = path.join(seedDir, 'history-90d.json');
    if (fs.existsSync(historyFile)) {
      const history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
      console.log(`[db:seed] Seeding ${history.length} purchase history records...`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS purchase_history (
          id UUID PRIMARY KEY,
          ordered_at TIMESTAMPTZ NOT NULL,
          vendor_id TEXT NOT NULL,
          sku TEXT,
          category TEXT NOT NULL,
          quantity INT NOT NULL,
          unit_price NUMERIC(12, 2) NOT NULL,
          total NUMERIC(12, 2) NOT NULL,
          currency TEXT NOT NULL DEFAULT 'USD',
          benchmark_price NUMERIC(12, 2),
          benchmark_currency TEXT DEFAULT 'USD',
          requested_by TEXT,
          channel TEXT
        );
      `);
      for (const h of history) {
        await client.query(
          `INSERT INTO purchase_history (id, ordered_at, vendor_id, sku, category, quantity, unit_price, total, currency, benchmark_price, benchmark_currency, requested_by, channel)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (id) DO NOTHING`,
          [
            h.id,
            h.ordered_at,
            h.vendor_id,
            h.sku || null,
            h.category,
            h.quantity,
            h.unit_price,
            h.total,
            h.currency || 'USD',
            h.benchmark_price || null,
            h.benchmark_currency || 'USD',
            h.requested_by || null,
            h.channel || 'manual',
          ]
        );
      }
      console.log('[db:seed] Purchase history seeded.');
    }

    await client.query('COMMIT');
    console.log('[db:seed] Seeding completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[db:seed] Seeding error:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seedDatabase().catch((err) => {
  console.error('[db:seed] Fatal error:', err);
  process.exit(1);
});

