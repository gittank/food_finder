import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import puppeteer, { Browser } from 'puppeteer';

const DATA_DIR = path.join(__dirname, '..', 'data');

// Usage: ts-node src/shopify-scan.ts <base-url> <source-name> [collection]
// Example: ts-node src/shopify-scan.ts https://www.fodyfoods.com Fody all
const BASE_URL = process.argv[2];
const SOURCE_NAME = process.argv[3];
const COLLECTION = process.argv[4] || 'all';

if (!BASE_URL || !SOURCE_NAME) {
  console.error('Usage: ts-node src/shopify-scan.ts <base-url> <source-name> [collection]');
  console.error('Example: ts-node src/shopify-scan.ts https://www.fodyfoods.com Fody all');
  process.exit(1);
}

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

function extractIngredients(bodyHtml: string): string | undefined {
  if (!bodyHtml) return undefined;

  // Strategy 1: HTML structure - heading followed by content
  const headingPatterns = [
    /<h[1-6][^>]*>\s*(?:<[^>]+>)*\s*Ingredients?\s*(?:<[^>]+>)*\s*<\/h[1-6]>\s*<p[^>]*>([\s\S]*?)<\/p>/i,
    /<(?:strong|b)[^>]*>\s*Ingredients?\s*[:\s]*<\/(?:strong|b)>\s*(?:<br\s*\/?>)?\s*([\s\S]*?)(?:<\/p>|<br\s*\/?>.*?<(?:strong|b)>|$)/i,
    /<p[^>]*>\s*(?:<(?:strong|b)[^>]*>)?\s*Ingredients?\s*[:\s]*(?:<\/(?:strong|b)>)?\s*([\s\S]*?)<\/p>/i,
    // Span-based patterns (common on some Shopify themes)
    /<span[^>]*>\s*Ingredients?\s*[:\s]*<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/i,
    // li-based ingredient lists
    /<(?:strong|b)>\s*Ingredients?\s*[:\s]*<\/(?:strong|b)>\s*<\/p>\s*<ul[^>]*>([\s\S]*?)<\/ul>/i,
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

  // Strategy 2: Plain text fallback
  const text = stripHtml(bodyHtml);
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

// Shared Puppeteer browser instance (lazily initialized on first Cloudflare block)
let browser: Browser | null = null;
let usePuppeteer = false;

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    console.log('  [Launching Puppeteer to bypass Cloudflare...]');
    browser = await puppeteer.launch({ headless: 'new' as any, args: ['--no-sandbox'] });
  }
  return browser;
}

async function fetchJsonWithPuppeteer(url: string): Promise<any> {
  const b = await getBrowser();
  const page = await b.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    // @ts-ignore - document exists in browser context
    const text = await page.evaluate(() => document.body.innerText);
    return JSON.parse(text);
  } finally {
    await page.close();
  }
}

async function fetchHtmlWithPuppeteer(url: string): Promise<string> {
  const b = await getBrowser();
  const page = await b.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    return await page.content();
  } finally {
    await page.close();
  }
}

const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' };

async function fetchJson(url: string): Promise<any> {
  if (usePuppeteer) return fetchJsonWithPuppeteer(url);
  try {
    const response = await axios.get(url, { headers: UA, timeout: 15000 });
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 429 || error.response?.status === 403) {
      console.log(`  [Cloudflare blocked, switching to Puppeteer]`);
      usePuppeteer = true;
      return fetchJsonWithPuppeteer(url);
    }
    throw error;
  }
}

async function fetchHtml(url: string): Promise<string> {
  if (usePuppeteer) return fetchHtmlWithPuppeteer(url);
  try {
    const response = await axios.get(url, { headers: UA, timeout: 15000 });
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 429 || error.response?.status === 403) {
      usePuppeteer = true;
      return fetchHtmlWithPuppeteer(url);
    }
    throw error;
  }
}

async function fetchCollectionProducts(): Promise<any[]> {
  const allProducts: any[] = [];
  let page = 1;

  while (true) {
    const url = `${BASE_URL}/collections/${COLLECTION}/products.json?limit=250&page=${page}`;
    console.log(`Fetching page ${page}...`);

    try {
      const data = await fetchJson(url);
      const products = data.products;
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

async function fetchProductDetail(handle: string): Promise<any | null> {
  try {
    const url = `${BASE_URL}/products/${handle}.json`;
    const data = await fetchJson(url);
    return data.product;
  } catch (error) {
    return null;
  }
}

// Fetch the full HTML page to find metafield-rendered ingredients
async function fetchProductPageHtml(handle: string): Promise<string | null> {
  try {
    const url = `${BASE_URL}/products/${handle}`;
    return await fetchHtml(url);
  } catch (error) {
    return null;
  }
}

// Extract ingredients from metafield span or other page-rendered content
function extractIngredientsFromPageHtml(html: string): string | undefined {
  if (!html) return undefined;

  // Look for metafield-multi_line_text_field spans (used by Fody and similar stores)
  const metafieldMatch = html.match(/<span[^>]*class="metafield-multi_line_text_field"[^>]*>([\s\S]*?)<\/span>/i);
  if (metafieldMatch && metafieldMatch[1]) {
    const text = metafieldMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length > 10) {
      const normalized = text.replace(/\n/g, ', ').replace(/,\s*,/g, ',').trim();
      if (normalized.includes(',')) {
        return normalized;
      }
    }
  }

  // Accordion-based ingredients (Daiya, etc.)
  // Pattern: accordion item with "Ingredients" button, content in sibling div
  const accordionMatch = html.match(
    /id="accordion-product-ingredients[^"]*"[\s\S]*?<div[^>]*class="[^"]*accordion__content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i
  );
  if (accordionMatch && accordionMatch[1]) {
    const text = accordionMatch[1].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    if (text.length > 10 && text.includes(',')) {
      return text.replace(/^INGREDIENTS:\s*/i, '').replace(/\.\s*$/, '').trim();
    }
  }

  // <details>/<summary> based ingredients (Annie Chun's, etc.)
  const detailsMatch = html.match(
    /<summary[^>]*>\s*Ingredients\s*<\/summary>\s*<div[^>]*>([\s\S]*?)<\/div>\s*<\/details>/i
  );
  if (detailsMatch && detailsMatch[1]) {
    const text = detailsMatch[1].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    if (text.length > 10 && text.includes(',')) {
      return text.replace(/^INGREDIENTS:\s*/i, '').replace(/\.\s*$/, '').trim();
    }
  }

  // Metafield rich_text_field divs (common on newer Shopify themes)
  const richTextMatch = html.match(
    /Ingredients[\s\S]{0,300}<div[^>]*class="metafield-rich_text_field"[^>]*>([\s\S]*?)<\/div>/i
  );
  if (richTextMatch && richTextMatch[1]) {
    const text = richTextMatch[1].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    if (text.length > 10 && text.includes(',')) {
      return text.replace(/^INGREDIENTS:\s*/i, '').replace(/\.\s*$/, '').trim();
    }
  }

  // Generic: any heading/label "Ingredients" followed by text content
  const genericPatterns = [
    /<(?:h[1-6]|strong|b|label|dt)[^>]*>\s*Ingredients?\s*<\/(?:h[1-6]|strong|b|label|dt)>\s*(?:<[^>]*>)*\s*([\s\S]*?)(?=<(?:h[1-6]|strong|b|label|dt|\/section|\/article))/i,
    /<div[^>]*class="[^"]*rte[^"]*"[^>]*>\s*<p>\s*<span[^>]*>([\s\S]*?)<\/span>/i,
  ];

  for (const pattern of genericPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const text = match[1].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      if (text.length > 10 && text.includes(',')) {
        return text.replace(/^INGREDIENTS:\s*/i, '').replace(/\.\s*$/, '').trim();
      }
    }
  }

  return undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const sourceSlug = SOURCE_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  console.log('\n========================================');
  console.log(`  ${SOURCE_NAME} Product Scanner`);
  console.log(`  URL: ${BASE_URL}`);
  console.log(`  Collection: ${COLLECTION}`);
  console.log('========================================\n');

  const products = await fetchCollectionProducts();

  // Filter out gift cards and non-food items
  const foodProducts = products.filter((p: any) => {
    const title = (p.title || '').toLowerCase();
    const type = (p.product_type || '').toLowerCase();
    return !title.includes('gift card') && type !== 'gift_card';
  });

  console.log(`\nTotal products found: ${products.length} (${foodProducts.length} food items)\n`);

  if (foodProducts.length === 0) {
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

  for (let i = 0; i < foodProducts.length; i++) {
    const product = foodProducts[i];
    process.stdout.write(`[${i + 1}/${foodProducts.length}] ${product.title.substring(0, 45)}...`);

    const detail = await fetchProductDetail(product.handle);
    const bodyHtml = detail?.body_html || product.body_html || '';

    let ingredients = extractIngredients(bodyHtml);

    // If no ingredients found in body_html, try fetching the full page HTML
    // (some stores render ingredients via metafields outside body_html)
    if (!ingredients) {
      const pageHtml = await fetchProductPageHtml(product.handle);
      if (pageHtml) {
        ingredients = extractIngredientsFromPageHtml(pageHtml);
      }
    }
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
      source: SOURCE_NAME,
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

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `${sourceSlug}-${COLLECTION}-${dateStr}.json`;
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${filepath}`);

  if (browser) await browser.close();
}

main().catch(async (err) => {
  console.error(err);
  if (browser) await browser.close();
});
