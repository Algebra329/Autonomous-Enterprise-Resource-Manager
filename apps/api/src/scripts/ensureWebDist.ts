import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, '../../../..');
const distIndex = path.join(repoRoot, 'apps', 'web', 'dist', 'index.html');

if (!fs.existsSync(distIndex)) {
  console.log('[api] apps/web/dist not found; building @rm/web bundle...');
  try {
    execFileSync('pnpm', ['--filter', '@rm/web', 'build'], {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
  } catch (err) {
    console.warn('[api] @rm/web auto-build skipped/failed; API will still start:', err);
  }
}

