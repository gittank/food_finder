import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'products.json');

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
  };
}

// Read and merge all data files (same logic as server.ts)
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

  for (const category of ['featured', 'suitable']) {
    if (data[category]) {
      const normalized = data[category].map((p: any) => normalizeProduct(p, source));
      merged[category] = merged[category].concat(normalized);
    }
  }
}

// Deduplicate by source-id per category
for (const category of Object.keys(merged)) {
  const seen = new Set();
  merged[category] = merged[category].filter(p => {
    const key = `${p.source}-${p.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(merged, null, 2));

console.log(`Exported to ${OUTPUT_FILE}`);
console.log(`  Featured: ${merged.featured.length}`);
console.log(`  Suitable: ${merged.suitable.length}`);
