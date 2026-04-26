import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'products.json');
const DEPLOY_DATA_DIR = path.join(__dirname, '..', 'deploy', 'data');

function normalizeProduct(product: any, source: string) {
  return {
    id: product.id || product.productId || product.slug || 'unknown',
    title: product.title || 'Unknown Product',
    price: product.price,
    ingredients: product.ingredients,
    productUrl: product.productUrl,
    imageUrl: product.imageUrl || (product.images && product.images[0]),
    source: product.source || source,
    analysis: product.analysis,
    section: product.section,
  };
}

// Normalize a title for dedup comparison: lowercase, strip punctuation, collapse whitespace
function dedupeKey(title: string): string {
  return (title || '')
    .toLowerCase()
    .replace(/[''""]/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'")
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Read and merge all data files
const files = fs.readdirSync(DATA_DIR)
  .filter(f => f.endsWith('.json') && f !== 'products.json')
  .sort()
  .reverse();

if (files.length === 0) {
  console.error('No data files found in', DATA_DIR);
  process.exit(1);
}

const merged: Record<string, any[]> = {
  featured: [],
  suitable: [],
};

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
  let source = 'Other';
  if (file.startsWith('sayweee')) source = 'Sayweee';
  else if (file.startsWith('lkk')) source = 'LKK';
  else if (file.startsWith('hmart')) source = 'H Mart';
  else if (file.startsWith('mexican')) source = 'Mexican';
  else if (file.startsWith('veganessentials')) source = 'Vegan Essentials';
  else if (file.startsWith('fody')) source = 'Fody';
  else if (file.startsWith('vreamery')) source = 'Vreamery';
  else if (file.startsWith('plantx')) source = 'PlantX';
  else if (file.startsWith('iherb')) source = 'iHerb';
  else if (file.startsWith('zerooge')) source = 'ZEROoge';
  else if (file.startsWith('noogeatz')) source = 'NoOgEatz';
  else if (file.startsWith('ogefreelife')) source = 'OGEFreeLife';
  else if (file.startsWith('ishopindian')) source = 'iShopIndian';
  else if (file.startsWith('edward')) source = 'Edward & Sons';
  else if (file.startsWith('lotus')) source = 'Lotus Foods';
  else if (file.startsWith('daiya')) source = 'Daiya';
  else if (file.startsWith('miyoko')) source = 'Miyokos';
  else if (file.startsWith('annie-chun') || file.startsWith('anniechun')) source = 'Annie Chuns';
  else if (file.startsWith('tofurky')) source = 'Tofurky';
  else if (file.startsWith('field-roast') || file.startsWith('fieldroast')) source = 'Field Roast';
  else if (file.startsWith('enjoy-life') || file.startsWith('enjoylife')) source = 'Enjoy Life';
  else if (file.startsWith('yamamotoyama')) source = 'Yamamotoyama';
  else if (file.startsWith('instagram-')) source = 'Instagram';
  else if (file.startsWith('goodnessme')) source = 'GoodnessMe';
  else if (file.startsWith('terrasoul')) source = 'Terrasoul';
  else if (file.startsWith('wild-planet') || file.startsWith('wildplanet')) source = 'Wild Planet';
  else if (file.startsWith('nuttzo')) source = 'NuttZo';
  else if (file.startsWith('lesserevil')) source = 'LesserEvil';
  else if (file.startsWith('yellowbird')) source = 'Yellowbird';
  else if (file.startsWith('aachi')) source = 'Aachi Foods';
  else if (file.startsWith('priya') && !file.startsWith('priya-')) source = 'Priya Foods';
  else if (file.startsWith('jabsons')) source = 'Jabsons';
  else if (file.startsWith('thats-it') || file.startsWith('thatsit')) source = 'Thats It Fruit';
  else if (file.startsWith('nugo')) source = 'NuGo';

  for (const category of ['featured', 'suitable']) {
    if (data[category]) {
      const normalized = data[category].map((p: any) => normalizeProduct(p, source));
      merged[category] = merged[category].concat(normalized);
    }
  }
}

// Step 1: Deduplicate by source-id per category (same store dupes)
for (const category of Object.keys(merged)) {
  const seen = new Set();
  merged[category] = merged[category].filter(p => {
    const key = `${p.source}-${p.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Step 2: Cross-store dedup by normalized title.
// Prefer the product with ingredients, then the one with an image, then first seen.
const beforeDedup = { featured: merged.featured.length, suitable: merged.suitable.length };

for (const category of Object.keys(merged)) {
  const byTitle = new Map<string, any>();

  for (const p of merged[category]) {
    const key = dedupeKey(p.title);
    if (!key) continue;

    const existing = byTitle.get(key);
    if (!existing) {
      byTitle.set(key, p);
      continue;
    }

    // Keep the better one: prefer has-ingredients > has-image > first
    const existingScore =
      (existing.ingredients ? 2 : 0) +
      (existing.imageUrl ? 1 : 0);
    const newScore =
      (p.ingredients ? 2 : 0) +
      (p.imageUrl ? 1 : 0);

    if (newScore > existingScore) {
      byTitle.set(key, p);
    }
  }

  merged[category] = Array.from(byTitle.values());
}

// Write to data/products.json
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(merged, null, 2));

// Also copy to deploy/data/
if (!fs.existsSync(DEPLOY_DATA_DIR)) {
  fs.mkdirSync(DEPLOY_DATA_DIR, { recursive: true });
}
fs.writeFileSync(path.join(DEPLOY_DATA_DIR, 'products.json'), JSON.stringify(merged, null, 2));

console.log(`Exported to ${OUTPUT_FILE}`);
console.log(`  Featured: ${merged.featured.length} (was ${beforeDedup.featured})`);
console.log(`  Suitable: ${merged.suitable.length} (was ${beforeDedup.suitable})`);
console.log(`  Removed ${(beforeDedup.featured - merged.featured.length) + (beforeDedup.suitable - merged.suitable.length)} cross-store duplicates`);
console.log(`\nAlso copied to ${path.join(DEPLOY_DATA_DIR, 'products.json')}`);
