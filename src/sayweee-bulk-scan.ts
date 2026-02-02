import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { extractTextFromImageUrl } from './services/ocr/extractor';

const DATA_DIR = path.join(__dirname, '..', 'data');

const RESTRICTED_INGREDIENTS: Record<string, string[]> = {
  eggs: ['egg', 'eggs', 'egg white', 'egg yolk', 'albumin', 'lysozyme', 'mayonnaise', 'mayo'],
  onions: ['onion', 'onions', 'onion powder', 'dried onion', 'cipollini', 'shallot', 'shallots'],
  garlic: ['garlic', 'garlic powder', 'minced garlic', 'roasted garlic', 'dehydrated garlic'],
  scallions: ['scallion', 'scallions', 'green onion', 'green onions', 'spring onion', 'spring onions'],
  leeks: ['leek', 'leeks'],
};

const NON_VEG = [
  'meat', 'beef', 'pork', 'chicken', 'turkey', 'lamb', 'duck', 'bacon', 'ham',
  'fish', 'salmon', 'tuna', 'shrimp', 'prawn', 'crab', 'lobster', 'oyster',
  'anchovy', 'anchovies', 'sardine', 'squid', 'octopus', 'clam', 'mussel',
  'gelatin', 'lard', 'tallow', 'bone', 'broth',
];

function analyze(text: string) {
  const n = text.toLowerCase();
  const restricted: string[] = [];
  for (const [cat, terms] of Object.entries(RESTRICTED_INGREDIENTS)) {
    for (const t of terms) {
      if (n.includes(t)) { restricted.push(cat); break; }
    }
  }
  const nonVeg = NON_VEG.filter(t => n.includes(t));
  return {
    isVegetarian: nonVeg.length === 0,
    hasRestrictedIngredients: restricted.length > 0,
    restrictedFound: restricted,
    nonVegFound: nonVeg,
  };
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Step 1: Extract product links from a category/search page ──

async function extractProductLinks(pageUrl: string): Promise<Array<{ id: string; slug: string; url: string }>> {
  const resp = await axios.get(pageUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    maxRedirects: 5, timeout: 30000,
  });
  const html: string = resp.data;

  const pattern = /\/en\/product\/([^/]+)\/(\d+)/g;
  const seen = new Set<string>();
  const products: Array<{ id: string; slug: string; url: string }> = [];

  let match;
  while ((match = pattern.exec(html)) !== null) {
    const [, slug, id] = match;
    if (seen.has(id)) continue;
    seen.add(id);
    products.push({ id, slug, url: `https://www.sayweee.com/en/product/${slug}/${id}` });
  }
  return products;
}

// ── Step 2: Fetch a product page and extract info ──

async function fetchProductInfo(url: string, id: string): Promise<{
  title: string; images: string[]; ingredients: string | null;
  ingredientSource: string | null; price: string | undefined;
}> {
  const resp = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    maxRedirects: 5, timeout: 15000,
  });
  const html: string = resp.data;

  // Title
  const titleMatch = html.match(/og:title"[^>]*content="([^"]+)"/i);
  const title = titleMatch ? titleMatch[1].replace(/ \| Weee!.*$/, '').trim() : 'Unknown';

  // Images
  let images: string[] = [];
  const imgArr = html.match(/\["(https:\/\/img\d+\.weee(?:cdn)?\.(?:net|com)\/(?:item|product)\/image\/[^"]+)"(?:,"(https:\/\/img\d+\.weee(?:cdn)?\.(?:net|com)\/(?:item|product)\/image\/[^"]+)")*\]/);
  if (imgArr) {
    try { images = JSON.parse(imgArr[0]).map((u: string) => u.split('!')[0]); } catch {}
  }
  if (images.length === 0) {
    const pat = /https?:\/\/img\d+\.weee(?:cdn)?\.(?:net|com)\/(?:item|product)\/image\/[^"'\s)\\]+/g;
    const matches = html.match(pat) || [];
    const seen = new Set<string>();
    for (const m of matches) { const c = m.split('!')[0]; if (!seen.has(c)) { seen.add(c); images.push(c); } }
  }

  // Ingredients from page HTML
  let ingredients: string | null = null;
  let ingredientSource: string | null = null;

  // Try escaped JSON
  const detPat = /Ingredient[s]?\s*[Ll]ist:?\s*\\u003c\/p\\u003e\s*\\u003cp\\u003e([\s\S]*?)(?:Storage|Disclaimer|Return|\\u003cdiv|\\u003c\/div)/i;
  const detMatch = html.match(detPat);
  if (detMatch) {
    const extracted = detMatch[1]
      .replace(/\\u003c[^\\]*?\\u003e/g, ' ')
      .replace(/\\u0026nbsp;/g, ' ')
      .replace(/\\u0026#39;/g, "'")
      .replace(/\\u0026amp;/g, '&')
      .replace(/\\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (extracted.length > 15 && !extracted.includes('may differ from')) {
      ingredients = extracted;
      ingredientSource = 'page';
    }
  }

  if (!ingredients) {
    const pats = [
      /Ingredient[s]?\s*[Ll]ist:?\s*<\/p>\s*<p>([^<]+(?:<\/p>\s*<p>[^<]+)*)/i,
      /Ingredient[s]?[:\s]+([A-Z][^<]{20,300}?)(?:<|$)/i,
    ];
    for (const p of pats) {
      const m = html.match(p);
      if (m) {
        const ext = (m[1] || m[0]).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        if (ext.length > 15 && !ext.includes('may differ from')) {
          ingredients = ext;
          ingredientSource = 'page';
          break;
        }
      }
    }
  }

  // Price
  const priceMatch = html.match(/\$(\d+\.?\d*)/);
  const price = priceMatch ? `$${priceMatch[1]}` : undefined;

  return { title, images, ingredients, ingredientSource, price };
}

// ── Step 3: OCR for ingredients ──

async function ocrForIngredients(images: string[]): Promise<{
  ingredients: string | null; confidence: number; ocrImageUrl: string | null;
}> {
  const toTry = images.slice(0, 10);
  let best = { ingredients: null as string | null, confidence: 0, ocrImageUrl: null as string | null };

  for (const url of toTry) {
    try {
      const result = await extractTextFromImageUrl(url);
      if (result.ingredients && result.ingredients.length > 15) {
        const score = result.confidence + (result.ingredients.split(',').length * 5);
        const bestScore = best.confidence + ((best.ingredients || '').split(',').length * 5);
        if (score > bestScore) {
          best = { ingredients: result.ingredients, confidence: result.confidence, ocrImageUrl: url };
        }
      }
    } catch {}
  }
  return best;
}

// ── Main ──

async function main() {
  console.log('\n========================================');
  console.log('  Sayweee Bulk Scanner');
  console.log('========================================\n');

  const lookupFile = path.join(__dirname, '..', 'sayweee_lookup.txt');
  const urls = fs.readFileSync(lookupFile, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('http'));

  console.log(`Found ${urls.length} URLs to scan\n`);

  // Step 1: Collect all product links
  const allProducts = new Map<string, { id: string; slug: string; url: string; sourceUrl: string }>();

  for (const url of urls) {
    const label = decodeURIComponent(url).replace(/^.*\//, '').substring(0, 60);
    process.stdout.write(`Fetching: ${label}...`);
    try {
      const products = await extractProductLinks(url);
      let newCount = 0;
      for (const p of products) {
        if (!allProducts.has(p.id)) {
          allProducts.set(p.id, { ...p, sourceUrl: url });
          newCount++;
        }
      }
      console.log(` ${products.length} products (${newCount} new)`);
    } catch (e: any) {
      console.log(` ERROR: ${e.message}`);
    }
    await delay(200);
  }

  console.log(`\nTotal unique products: ${allProducts.size}\n`);

  // Check what's already in data files
  const existingIds = new Set<string>();
  const dataFiles = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('sayweee-') && f.endsWith('.json'));
  for (const f of dataFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
    for (const bucket of ['featured', 'suitable', 'unsuitable', 'noIngredients', 'needsReview']) {
      if (data[bucket]) {
        for (const p of data[bucket]) {
          if (p.productId) existingIds.add(String(p.productId));
        }
      }
    }
  }

  const newProducts = Array.from(allProducts.values()).filter(p => !existingIds.has(p.id));
  console.log(`Already scanned: ${existingIds.size}`);
  console.log(`New to scan: ${newProducts.length}\n`);

  if (newProducts.length === 0) {
    console.log('Nothing new to scan!');
    return;
  }

  // Step 2+3: Fetch each product, try page ingredients, fall back to OCR
  const dateStr = new Date().toISOString().split('T')[0];
  const outputFile = path.join(DATA_DIR, `sayweee-bulk-${dateStr}.json`);

  const results: Record<string, any[]> = {
    suitable: [],
    unsuitable: [],
    noIngredients: [],
  };

  const counts = { suitable: 0, unsuitable: 0, noIngredients: 0, pageIngredients: 0, ocrIngredients: 0 };

  console.log('Scanning products...\n');
  console.log('-'.repeat(60));

  for (let i = 0; i < newProducts.length; i++) {
    const p = newProducts[i];
    process.stdout.write(`[${i + 1}/${newProducts.length}] `);

    let info;
    try {
      info = await fetchProductInfo(p.url, p.id);
    } catch (e: any) {
      console.log(`${p.slug.substring(0, 40)}... FETCH ERROR`);
      await delay(200);
      continue;
    }

    process.stdout.write(`${(info.title).substring(0, 40)}...`);

    let ingredients = info.ingredients;
    let ingredientSource = info.ingredientSource;
    let ocrConfidence: number | undefined;
    let ocrImageUrl: string | undefined;

    // If no page ingredients, try OCR
    if (!ingredients && info.images.length > 0) {
      process.stdout.write(' OCR...');
      const ocrResult = await ocrForIngredients(info.images);
      if (ocrResult.ingredients) {
        ingredients = ocrResult.ingredients;
        ingredientSource = 'ocr';
        ocrConfidence = ocrResult.confidence;
        ocrImageUrl = ocrResult.ocrImageUrl || undefined;
        counts.ocrIngredients++;
      }
    } else if (ingredients) {
      counts.pageIngredients++;
    }

    const entry: any = {
      title: info.title,
      images: info.images,
      ingredients: ingredients || undefined,
      ingredientSource: ingredientSource || undefined,
      ocrConfidence,
      ocrImageUrl,
      price: info.price,
      productId: p.id,
      productUrl: p.url,
      scannedAt: new Date().toISOString(),
    };

    if (ingredients) {
      const analysis = analyze(ingredients);
      entry.analysis = analysis;

      if (analysis.isVegetarian && !analysis.hasRestrictedIngredients) {
        results.suitable.push(entry);
        counts.suitable++;
        console.log(` -> SUITABLE`);
      } else {
        results.unsuitable.push(entry);
        counts.unsuitable++;
        const reasons = [...analysis.restrictedFound, ...analysis.nonVegFound].join(', ');
        console.log(` -> ${reasons}`);
      }
    } else {
      results.noIngredients.push(entry);
      counts.noIngredients++;
      console.log(` -> needs review`);
    }

    await delay(200);
  }

  console.log('-'.repeat(60));
  console.log('\n========================================');
  console.log('  SCAN COMPLETE');
  console.log('========================================');
  console.log(`\n  Suitable:        ${counts.suitable}`);
  console.log(`  Unsuitable:      ${counts.unsuitable}`);
  console.log(`  Needs review:    ${counts.noIngredients}`);
  console.log(`  ---`);
  console.log(`  Page ingredients: ${counts.pageIngredients}`);
  console.log(`  OCR ingredients:  ${counts.ocrIngredients}`);

  // Save
  const output = {
    source: 'Sayweee',
    query: 'bulk-lookup',
    scannedAt: new Date().toISOString(),
    sourceUrls: urls,
    ...results,
  };

  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`\nResults saved to: ${outputFile}`);
}

main().catch(console.error);
