import * as fs from 'fs';
import * as path from 'path';
import { extractTextFromImageUrl } from './services/ocr/extractor';

const DATA_DIR = path.join(__dirname, '..', 'data');

const USERNAME = process.argv[2] || 'no_og_eatz';

// Find the Instagram data file
const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith(`instagram-${USERNAME}`));
if (files.length === 0) {
  console.error(`No Instagram data file found for @${USERNAME}`);
  process.exit(1);
}

const filepath = path.join(DATA_DIR, files[files.length - 1]);
const rawData = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
const posts = rawData.posts || [];

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// Extract store names from caption
function extractStores(caption: string): string[] {
  const storeMap: Record<string, string> = {
    walmart: 'Walmart', target: 'Target', costco: 'Costco',
    "sam's club": "Sam's Club", 'sams club': "Sam's Club",
    'whole foods': 'Whole Foods', "trader joe's": "Trader Joe's",
    kroger: 'Kroger', meijer: 'Meijer', aldi: 'Aldi',
    amazon: 'Amazon', walgreens: 'Walgreens', publix: 'Publix',
    'fresh thyme': 'Fresh Thyme', schnucks: 'Schnucks',
    'patel brothers': 'Patel Brothers', heinens: 'Heinens',
    'dollar tree': 'Dollar Tree',
  };

  const lower = caption.toLowerCase();
  const stores: string[] = [];
  for (const [key, name] of Object.entries(storeMap)) {
    if (lower.includes(key)) stores.push(name);
  }
  return stores;
}

// Try to extract a product name from OCR text
function extractProductName(ocrText: string): string | null {
  if (!ocrText || ocrText.length < 3) return null;

  // Clean up OCR text
  const cleaned = ocrText
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // The product name is usually the most prominent text on the package
  // Try to find it in the first portion of OCR text
  const lines = ocrText.split('\n').filter(l => l.trim().length > 2);

  // Return the first substantial line as the product name
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip lines that look like ingredients, nutrition facts, or fine print
    if (trimmed.length > 3 && trimmed.length < 80 &&
        !trimmed.toLowerCase().startsWith('ingredients') &&
        !trimmed.toLowerCase().startsWith('nutrition') &&
        !trimmed.toLowerCase().startsWith('serving') &&
        !trimmed.toLowerCase().startsWith('calories') &&
        !trimmed.toLowerCase().match(/^\d/) &&
        !trimmed.toLowerCase().includes('net wt')) {
      return trimmed;
    }
  }

  return cleaned.substring(0, 60);
}

async function main() {
  console.log('\n========================================');
  console.log(`  Instagram OCR: @${USERNAME}`);
  console.log(`  Posts: ${posts.length}`);
  console.log('========================================\n');

  const products: any[] = [];
  let ocrSuccess = 0;

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const images = post.images || [post.imageUrl];
    const stores = extractStores(post.caption || '');

    process.stdout.write(`[${i + 1}/${posts.length}] `);

    if (!images[0]) {
      console.log('No image');
      continue;
    }

    try {
      // OCR the first image (product photo)
      const result = await extractTextFromImageUrl(images[0]);
      const rawText = result.text || '';
      const productName = extractProductName(rawText);

      if (productName && productName.length > 3) {
        ocrSuccess++;
        console.log(`${productName.substring(0, 50)} (${stores.join(', ') || 'unknown store'})`);

        products.push({
          id: post.shortcode,
          title: productName,
          price: '',
          ingredients: result.ingredients || undefined,
          productUrl: post.postUrl,
          imageUrl: post.imageUrl,
          images,
          source: 'NoOgEatz',
          stores: stores.length > 0 ? stores.join(', ') : undefined,
          date: post.date,
          ocrText: rawText.substring(0, 500),
          ocrConfidence: result.confidence,
          ingredientSource: 'ocr',
          scannedAt: new Date().toISOString(),
        });
      } else {
        console.log(`(no text extracted) ${stores.join(', ') || ''}`);
      }
    } catch (error: any) {
      console.log(`Error: ${error.message}`);
    }

    await delay(200);
  }

  // All products from this account are curated as OG-free
  const results = {
    source: 'NoOgEatz',
    scannedAt: new Date().toISOString(),
    suitable: products,
    unsuitable: [] as any[],
    noIngredients: [] as any[],
  };

  console.log('\n========================================');
  console.log('  COMPLETE');
  console.log('========================================');
  console.log(`  OCR success: ${ocrSuccess}/${posts.length}`);
  console.log(`  Products extracted: ${products.length}`);

  const dateStr = new Date().toISOString().split('T')[0];
  const outFile = `noogeatz-${dateStr}.json`;
  const outPath = path.join(DATA_DIR, outFile);
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`  Saved to: ${outPath}`);
}

main().catch(console.error);
