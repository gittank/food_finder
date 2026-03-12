import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

const DATA_DIR = path.join(__dirname, '..', 'data');

// Usage: ts-node src/woo-scan.ts <base-url> <source-name> [shop-path]
const BASE_URL = process.argv[2];
const SOURCE_NAME = process.argv[3];
const SHOP_PATH = process.argv[4] || '/shop/';

if (!BASE_URL || !SOURCE_NAME) {
  console.error('Usage: ts-node src/woo-scan.ts <base-url> <source-name> [shop-path]');
  process.exit(1);
}

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

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' };

// Scrape product links from WooCommerce shop pages
async function fetchAllProductUrls(): Promise<string[]> {
  const allUrls: string[] = [];
  const seen = new Set<string>();
  let page = 1;

  while (true) {
    const url = page === 1 ? `${BASE_URL}${SHOP_PATH}` : `${BASE_URL}${SHOP_PATH}page/${page}/`;
    console.log(`Fetching page ${page}...`);

    try {
      const response = await axios.get(url, { headers: HEADERS, timeout: 15000 });
      const html = response.data as string;

      // Extract product URLs from WooCommerce product links
      const urlPattern = /href="(https?:\/\/[^"]*\/product\/[^"]+)"/g;
      let match;
      let count = 0;
      while ((match = urlPattern.exec(html)) !== null) {
        const productUrl = match[1].split('?')[0]; // Remove query params
        if (!seen.has(productUrl)) {
          seen.add(productUrl);
          allUrls.push(productUrl);
          count++;
        }
      }

      if (count === 0) break;
      console.log(`  Found ${count} new products (total: ${allUrls.length})`);
      page++;
      await delay(300);
    } catch (error: any) {
      if (error.response?.status === 404) break;
      console.error(`Error fetching page ${page}:`, error.message);
      break;
    }
  }

  return allUrls;
}

// Extract product data from individual product page
function extractProductData(html: string, url: string): any {
  const slug = url.split('/product/')[1]?.replace(/\/$/, '') || 'unknown';

  // Try JSON-LD first (most reliable)
  let title = 'Unknown';
  let price = '';
  let imageUrl = '';
  let ingredients: string | undefined;

  // Extract JSON-LD structured data
  const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  if (jsonLdMatch) {
    for (const block of jsonLdMatch) {
      try {
        const jsonStr = block.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
        const data = JSON.parse(jsonStr);
        const products = Array.isArray(data['@graph']) ? data['@graph'].filter((item: any) => item['@type'] === 'Product') : [];
        const product = products[0] || (data['@type'] === 'Product' ? data : null);

        if (product) {
          title = product.name || title;
          imageUrl = product.image || imageUrl;
          if (product.offers) {
            const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
            const spec = offer?.priceSpecification?.[0] || offer;
            price = spec?.price ? `$${spec.price}` : '';
          }
          // Some stores include description with ingredients
          if (product.description) {
            const descIngredients = extractIngredientsFromText(product.description);
            if (descIngredients) ingredients = descIngredients;
          }
        }
      } catch {
        // Skip invalid JSON-LD blocks
      }
    }
  }

  // Fallback: extract title from og:title or <title>
  if (title === 'Unknown') {
    const ogTitle = html.match(/og:title"[^>]*content="([^"]+)"/i);
    if (ogTitle) title = ogTitle[1].replace(/ [-–|].*$/, '').trim();
  }

  // Extract price from HTML if not found in JSON-LD
  if (!price) {
    const priceMatch = html.match(/class="[^"]*woocommerce-Price-amount[^"]*"[^>]*>[^<]*<bdi[^>]*>[^$]*\$([0-9.]+)/);
    if (priceMatch) price = `$${priceMatch[1]}`;
  }

  // Extract image from og:image if not found
  if (!imageUrl) {
    const ogImage = html.match(/og:image"[^>]*content="([^"]+)"/i);
    if (ogImage) imageUrl = ogImage[1];
  }

  // Extract ingredients from the HTML Ingredients section
  if (!ingredients) {
    ingredients = extractIngredientsFromHtml(html);
  }

  // Get all product images
  const images: string[] = [];
  if (imageUrl) images.push(imageUrl);
  const galleryPattern = /data-large_image="([^"]+)"/g;
  let imgMatch;
  while ((imgMatch = galleryPattern.exec(html)) !== null) {
    if (!images.includes(imgMatch[1])) images.push(imgMatch[1]);
  }

  return { id: slug, title, price, ingredients, productUrl: url, imageUrl, images, source: SOURCE_NAME };
}

function extractIngredientsFromText(text: string): string | undefined {
  if (!text) return undefined;
  // Clean up
  const cleaned = text.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\s+/g, ' ').trim();

  // Look for "Ingredients" section followed by a list
  const pattern = /Ingredients\s*[:\n]\s*([\s\S]*?)(?=\n\s*(?:Allergen|Dietary|Shipping|Storage|Nutrition|FAQ|How to|Serving|$))/i;
  const match = cleaned.match(pattern);
  if (match && match[1]) {
    let ingredients = match[1].trim()
      .replace(/\n/g, ', ')
      .replace(/,\s*,/g, ',')
      .replace(/,\s*$/, '')
      .trim();
    if (ingredients.length > 5) return ingredients;
  }
  return undefined;
}

function extractIngredientsFromHtml(html: string): string | undefined {
  // Look for <h2>Ingredients</h2> followed by content
  const patterns = [
    /Ingredients<\/h[1-6]>\s*([\s\S]*?)(?=<h[1-6]|<\/div>\s*<\/div>)/i,
    /<h[1-6][^>]*>Ingredients<\/h[1-6]>\s*<[^>]*>([\s\S]*?)(?=<h[1-6]|<\/section)/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      // Strip HTML and clean up
      let text = match[1]
        .replace(/<li[^>]*>/gi, '')
        .replace(/<\/li>/gi, ', ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/\r?\n/g, ', ')
        .replace(/\s+/g, ' ')
        .replace(/,\s*,/g, ',')
        .replace(/^[\s,]+|[\s,]+$/g, '')
        .trim();

      // Stop at Allergens/Dietary/Shipping/Nutrition sections
      text = text.replace(/\s*(Allergen|Dietary|Shipping|Storage|Nutrition|FAQ).*$/i, '').trim();
      text = text.replace(/,\s*$/, '').trim();

      if (text.length > 5) return text;
    }
  }

  return undefined;
}

async function main() {
  const sourceSlug = SOURCE_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  console.log('\n========================================');
  console.log(`  ${SOURCE_NAME} Product Scanner (WooCommerce)`);
  console.log(`  URL: ${BASE_URL}`);
  console.log('========================================\n');

  const productUrls = await fetchAllProductUrls();

  // Filter out gift cards and non-food items
  const foodUrls = productUrls.filter(url => {
    const slug = url.split('/product/')[1]?.toLowerCase() || '';
    return !slug.includes('gift-card') && !slug.includes('gift_card');
  });

  console.log(`\nTotal products: ${productUrls.length} (${foodUrls.length} food items)\n`);

  if (foodUrls.length === 0) {
    console.log('No food products found.');
    process.exit(0);
  }

  const results = {
    source: SOURCE_NAME,
    scannedAt: new Date().toISOString(),
    suitable: [] as any[],
    unsuitable: [] as any[],
    noIngredients: [] as any[],
  };

  console.log('Scanning products...\n');
  console.log('-'.repeat(60));

  for (let i = 0; i < foodUrls.length; i++) {
    const url = foodUrls[i];
    process.stdout.write(`[${i + 1}/${foodUrls.length}] Fetching...`);

    try {
      const response = await axios.get(url, { headers: HEADERS, timeout: 15000 });
      const productData = extractProductData(response.data, url);
      process.stdout.write(` ${productData.title.substring(0, 40)}`);

      productData.scannedAt = new Date().toISOString();

      if (productData.ingredients) {
        const analysis = analyzeIngredients(productData.ingredients);
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
    } catch (error: any) {
      console.log(` -> Error: ${error.message}`);
    }

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
    console.log('\n--- Needs Review ---');
    results.noIngredients.forEach(p => console.log(`  ? ${p.title}`));
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `${sourceSlug}-${dateStr}.json`;
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${filepath}`);
}

main().catch(console.error);
