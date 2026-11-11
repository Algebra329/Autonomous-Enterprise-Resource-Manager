import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  console.log('[db:migrate] Starting database migrations...');
  const migrationsDir = path.resolve(__dirname, '../../../../db/migrations');

  if (!fs.existsSync(migrationsDir)) {
    console.error(`[db:migrate] Migrations directory not found: ${migrationsDir}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('[db:migrate] No SQL migrations found.');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create migrations tracker table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    for (const file of files) {
      const res = await client.query('SELECT 1 FROM _schema_migrations WHERE name = $1', [file]);
      if (res.rowCount && res.rowCount > 0) {
        console.log(`[db:migrate] Skipping already applied migration: ${file}`);
        continue;
      }

      console.log(`[db:migrate] Applying migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO _schema_migrations (name) VALUES ($1)', [file]);
      console.log(`[db:migrate] Successfully applied: ${file}`);
    }

    await client.query('COMMIT');
    console.log('[db:migrate] All migrations applied successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[db:migrate] Migration error occurred:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('[db:migrate] Fatal error:', err);
  process.exit(1);
});

