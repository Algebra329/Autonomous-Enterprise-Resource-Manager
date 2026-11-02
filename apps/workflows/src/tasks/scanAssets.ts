import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface OverdueAsset {
  id: string;
  asset_tag?: string;
  name: string;
  category: string;
  sku: string;
  purchased_at: string;
  replace_after_months: number;
  months_in_service: number;
  assigned_to?: string;
}

/**
 * Scans physical and hardware assets to identify items due for lifecycle replacement.
 */
export async function scanAssets(asOfDate: Date = new Date()): Promise<OverdueAsset[]> {
  const overdue: OverdueAsset[] = [];

  const candidates = [
    path.resolve(process.cwd(), 'seed/assets.json'),
    path.resolve(__dirname, '../../../../seed/assets.json'),
  ];

  let rawAssets: any[] = [];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      rawAssets = JSON.parse(fs.readFileSync(p, 'utf8'));
      break;
    }
  }

  for (const asset of rawAssets) {
    if (asset.status !== 'active') continue;

    const purchaseDate = new Date(asset.purchased_at);
    const monthsInService =
      (asOfDate.getFullYear() - purchaseDate.getFullYear()) * 12 +
      (asOfDate.getMonth() - purchaseDate.getMonth());

    if (monthsInService >= (asset.replace_after_months || 36)) {
      overdue.push({
        id: asset.id,
        asset_tag: asset.asset_tag,
        name: asset.name,
        category: asset.category,
        sku: asset.sku || 'LAP-14',
        purchased_at: asset.purchased_at,
        replace_after_months: asset.replace_after_months || 36,
        months_in_service: monthsInService,
        assigned_to: asset.assigned_to,
      });
    }
  }

  return overdue;
}

