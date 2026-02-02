import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

const DATA_DIR = path.join(__dirname, '..', 'data');

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── LKK image filtering (same rules as lkk-scan.ts) ──

const LKK_SKIP_PATTERNS = [
  'apple-touch-icon', 'favicon', 'lkk-icon-', 'LKKLogo', 'searchicon',
  'iconsClose', 'shoppingcart', '/styles/', 'attr-icon', 'icon-cny',
  'icon-clock', 'icon-star', 'f-fb', 'f-twt', 'f-ins', 'f-pin',
  'linkedin', 'tiktok', 'youtube', '/scripts/', '/images/icon-',
];

function isValidLkkImage(url: string): boolean {
  if (LKK_SKIP_PATTERNS.some(p => url.includes(p))) return false;
  if (/[?&](h|w)=(30|80)(&|$)/.test(url)) return false;
  if (/\.(js|css)(\?|$)/.test(url)) return false;
  if (url.includes('/-/media/')) {
    const hasSize = /[?&]h=\d+/.test(url);
    const isProductSize = /[?&]h=(315|400|[5-9]\d\d|\d{4,})/.test(url);
    if (hasSize && !isProductSize) return false;
  }
  return true;
}

function cleanLkkImages(images: string[]): string[] {
  if (!images || images.length === 0) return images;

  // Find the og:image (first entry is always og:image from the scanner)
  const ogImage = images[0];

  // Filter the rest
  const filtered = images.filter(isValidLkkImage);

  // Ensure og:image is first if it passed filtering, otherwise prepend it
  // (og:image is always a real product photo)
  if (filtered.length === 0 || filtered[0] !== ogImage) {
    if (ogImage && !filtered.includes(ogImage)) {
      filtered.unshift(ogImage);
    }
  }

  return filtered;
}

// ── Sayweee: fetch missing images from product page ──

async function fetchSayweeeProductImages(productUrl: string): Promise<string[]> {
  try {
    const response = await axios.get(productUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      maxRedirects: 5,
      timeout: 15000,
    });

    const html: string = response.data;
    const images: string[] = [];

    // Try JSON image array first
    const imageArrayMatch = html.match(/\["(https:\/\/img\d+\.weee(?:cdn)?\.(?:net|com)\/(?:item|product)\/image\/[^"]+)"(?:,"(https:\/\/img\d+\.weee(?:cdn)?\.(?:net|com)\/(?:item|product)\/image\/[^"]+)")*\]/);
    if (imageArrayMatch) {
      try {
        const parsed = JSON.parse(imageArrayMatch[0]);
        if (Array.isArray(parsed)) {
          return parsed.map((url: string) => url.split('!')[0]);
        }
      } catch { /* fall through */ }
    }

    // Fallback: extract from page
    const imagePattern = /https?:\/\/img\d+\.weee(?:cdn)?\.(?:net|com)\/(?:item|product)\/image\/[^"'\s)\\]+/g;
    const imageMatches = html.match(imagePattern) || [];
    const seen = new Set<string>();
    for (const img of imageMatches) {
      const clean = img.split('!')[0];
      if (!seen.has(clean) && !clean.includes('-square')) {
        seen.add(clean);
        images.push(clean);
      }
    }

    return images;
  } catch (error: any) {
    console.error(`  Error fetching ${productUrl}: ${error.message}`);
    return [];
  }
}

// ── Fix a single data file's products ──

function fixLkkFile(filepath: string): number {
  const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  let fixed = 0;

  for (const bucket of ['suitable', 'unsuitable', 'noIngredients']) {
    const products = data[bucket];
    if (!Array.isArray(products)) continue;

    for (const product of products) {
      const before = (product.images || []).length;
      product.images = cleanLkkImages(product.images || []);
      if (product.images.length !== before) fixed++;
    }
  }

  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  return fixed;
}

async function fixSayweeeFile(filepath: string): Promise<number> {
  const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  let fixed = 0;

  for (const bucket of ['suitable', 'unsuitable', 'noIngredients', 'needsReview']) {
    const products = data[bucket];
    if (!Array.isArray(products)) continue;

    for (const product of products) {
      if (product.images && product.images.length > 0) continue;
      if (!product.productUrl && !product.productId) continue;

      const url = product.productUrl || `https://www.sayweee.com/en/product/-/${product.productId}`;
      process.stdout.write(`  Fetching images for: ${(product.title || '').substring(0, 40)}...`);

      const images = await fetchSayweeeProductImages(url);
      if (images.length > 0) {
        product.images = images;
        fixed++;
        console.log(` found ${images.length} images`);
      } else {
        console.log(' no images found');
      }

      await delay(200);
    }
  }

  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  return fixed;
}

// ── Main ──

async function main() {
  console.log('\n========================================');
  console.log('  Image Repair Script');
  console.log('========================================\n');

  // Fix LKK files
  const lkkFiles = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('lkk-products-') && f.endsWith('.json'));
  for (const file of lkkFiles) {
    const filepath = path.join(DATA_DIR, file);
    console.log(`[LKK] Cleaning images in ${file}...`);
    const fixed = fixLkkFile(filepath);
    console.log(`  Cleaned ${fixed} products\n`);
  }

  // Fix Sayweee files
  const sayweeeFiles = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('sayweee-') && f.endsWith('.json'));
  for (const file of sayweeeFiles) {
    const filepath = path.join(DATA_DIR, file);
    console.log(`[Sayweee] Fixing missing images in ${file}...`);
    const fixed = await fixSayweeeFile(filepath);
    console.log(`  Fixed ${fixed} products\n`);
  }

  console.log('Done!');
}

main().catch(console.error);
