import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

const DATA_DIR = path.join(__dirname, '..', 'data');
const BASE_URL = 'https://veganessentials.com';
const COLLECTION = process.argv[2] || 'meat-seafood';

// Restricted ingredients (same as other scanners)
const RESTRICTED_INGREDIENTS = {
  eggs: ['egg', 'eggs', 'egg white', 'egg yolk', 'albumin', 'lysozyme', 'mayonnaise', 'mayo'],
  onions: ['onion', 'onions', 'onion powder', 'dried onion', 'cipollini', 'shallot', 'shallots'],
  garlic: ['garlic', 'garlic powder', 'minced garlic', 'roasted garlic'],
  scallions: ['scallion', 'scallions', 'green onion', 'green onions', 'spring onion', 'spring onions'],
  leeks: ['leek', 'leeks'],
};

const NON_VEG_INGREDIENTS = [
  'meat', 'beef', 'pork', 'chicken', 'turkey', 'lamb', 'duck', 'bacon', 'ham',
  'fish', 'salmon', 'tuna', 'shrimp', 'prawn', 'crab', 'lobster', 'oyster',
  'anchovy', 'anchovies', 'sardine', 'squid', 'octopus', 'clam', 'mussel',
  'gelatin', 'lard', 'tallow', 'bone', 'broth',
];

function analyzeIngredients(ingredientsText: string) {
  const normalized = ingredientsText.toLowerCase();
  const restrictedFound: string[] = [];
  const nonVegFound: string[] = [];

  for (const [category, terms] of Object.entries(RESTRICTED_INGREDIENTS)) {
    for (const term of terms) {
      // Use word boundary matching to avoid false positives (e.g. "chickpea" matching "chicken")
      const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(normalized)) {
        if (!restrictedFound.includes(category)) {
          restrictedFound.push(category);
        }
        break;
      }
    }
  }

  for (const term of NON_VEG_INGREDIENTS) {
    const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(normalized)) {
      nonVegFound.push(term);
    }
  }

  return {
    isVegetarian: nonVegFound.length === 0,
    hasRestrictedIngredients: restrictedFound.length > 0,
    restrictedFound,
    nonVegFound,
  };
}

// Extract ingredients from Shopify body_html
function extractIngredients(bodyHtml: string): string | undefined {
  if (!bodyHtml) return undefined;

  function stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#\d+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Strategy 1: Look for an Ingredients heading followed by content in the HTML structure
  // Match <h2>Ingredients</h2><p>...</p> or <h3>Ingredients</h3><p>...</p> etc.
  const headingPatterns = [
    /<h[1-6][^>]*>\s*(?:<[^>]+>)*\s*Ingredients?\s*(?:<[^>]+>)*\s*<\/h[1-6]>\s*<p[^>]*>([\s\S]*?)<\/p>/i,
    /<(?:strong|b)[^>]*>\s*Ingredients?\s*[:\s]*<\/(?:strong|b)>\s*(?:<br\s*\/?>)?\s*([\s\S]*?)(?:<\/p>|<br\s*\/?>.*?<(?:strong|b)>|$)/i,
    /<p[^>]*>\s*(?:<(?:strong|b)[^>]*>)?\s*Ingredients?\s*[:\s]*(?:<\/(?:strong|b)>)?\s*([\s\S]*?)<\/p>/i,
  ];

  for (const pattern of headingPatterns) {
    const match = bodyHtml.match(pattern);
    if (match && match[1]) {
      const cleaned = stripHtml(match[1]);
      if (cleaned.length > 10 && cleaned.includes(',')) {
        return cleaned.replace(/\.\s*$/, '').trim();
      }
    }
  }

  // Strategy 2: Fall back to plain text extraction on the full body
  const text = stripHtml(bodyHtml);
  // Look for "Ingredients:" or "Ingredients " followed by a comma-separated list
  const fallbackPattern = /\bIngredients?\s*[:]\s*((?:[^.]+,\s*)+[^.]+)/i;
  const match = text.match(fallbackPattern);
  if (match && match[1]) {
    const ingredients = match[1].replace(/\.\s*$/, '').trim();
    if (ingredients.length > 10 && ingredients.includes(',')) {
      return ingredients;
    }
  }

  return undefined;
}

// Fetch all products from Shopify collection JSON API
async function fetchCollectionProducts(): Promise<any[]> {
  const allProducts: any[] = [];
  let page = 1;

  while (true) {
    const url = `${BASE_URL}/collections/${COLLECTION}/products.json?limit=250&page=${page}`;
    console.log(`Fetching page ${page}...`);

    try {
      const response = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
        timeout: 15000,
      });

      const products = response.data.products;
      if (!products || products.length === 0) break;

      allProducts.push(...products);
      console.log(`  Got ${products.length} products (total: ${allProducts.length})`);

      if (products.length < 250) break;
      page++;
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error);
      break;
    }
  }

  return allProducts;
}

// Fetch individual product JSON for more detailed body_html
async function fetchProductDetail(handle: string): Promise<any | null> {
  try {
    const url = `${BASE_URL}/products/${handle}.json`;
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      timeout: 15000,
    });
    return response.data.product;
  } catch (error) {
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('\n========================================');
  console.log('  Vegan Essentials Product Scanner');
  console.log(`  Collection: ${COLLECTION}`);
  console.log('========================================\n');

  const products = await fetchCollectionProducts();
  console.log(`\nTotal products found: ${products.length}\n`);

  if (products.length === 0) {
    console.log('No products found.');
    process.exit(0);
  }

  const results = {
    source: 'Vegan Essentials',
    scannedAt: new Date().toISOString(),
    suitable: [] as any[],
    unsuitable: [] as any[],
    noIngredients: [] as any[],
  };

  console.log('Scanning products...\n');
  console.log('-'.repeat(60));

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    process.stdout.write(`[${i + 1}/${products.length}] ${product.title.substring(0, 45)}...`);

    // Fetch individual product page for detailed body_html
    const detail = await fetchProductDetail(product.handle);
    const bodyHtml = detail?.body_html || product.body_html || '';

    const ingredients = extractIngredients(bodyHtml);
    const imageUrl = product.images?.[0]?.src || '';
    const price = product.variants?.[0]?.price ? `$${product.variants[0].price}` : '';

    const productData: any = {
      id: product.handle,
      title: product.title,
      price,
      ingredients: ingredients || undefined,
      productUrl: `${BASE_URL}/products/${product.handle}`,
      imageUrl,
      images: (product.images || []).map((img: any) => img.src),
      source: 'Vegan Essentials',
      ingredientSource: 'html',
      scannedAt: new Date().toISOString(),
    };

    if (ingredients) {
      const analysis = analyzeIngredients(ingredients);
      productData.analysis = analysis;

      if (analysis.isVegetarian && !analysis.hasRestrictedIngredients) {
        results.suitable.push(productData);
        console.log(` -> SUITABLE`);
      } else {
        results.unsuitable.push(productData);
        const reasons = [...analysis.restrictedFound, ...analysis.nonVegFound];
        console.log(` -> ${reasons.join(', ')}`);
      }
    } else {
      results.noIngredients.push(productData);
      console.log(` -> No ingredients found`);
    }

    // Be polite to the server
    await delay(300);
  }

  console.log('-'.repeat(60));
  console.log('\n========================================');
  console.log('  SCAN COMPLETE');
  console.log('========================================');
  console.log(`\nSuitable: ${results.suitable.length}`);
  console.log(`Unsuitable: ${results.unsuitable.length}`);
  console.log(`No ingredients: ${results.noIngredients.length}`);

  if (results.suitable.length > 0) {
    console.log('\n--- Suitable Products ---');
    results.suitable.forEach(p => console.log(`  ✓ ${p.title}`));
  }

  if (results.unsuitable.length > 0) {
    console.log('\n--- Unsuitable Products ---');
    results.unsuitable.forEach(p => {
      const reasons = [...(p.analysis?.restrictedFound || []), ...(p.analysis?.nonVegFound || [])];
      console.log(`  ✗ ${p.title} (${reasons.join(', ')})`);
    });
  }

  if (results.noIngredients.length > 0) {
    console.log('\n--- Needs Review (no ingredients found) ---');
    results.noIngredients.forEach(p => console.log(`  ? ${p.title}`));
  }

  // Save results
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `veganessentials-${COLLECTION}-${dateStr}.json`;
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${filepath}`);
}

main().catch(console.error);
