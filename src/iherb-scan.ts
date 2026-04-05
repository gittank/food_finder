import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const DATA_DIR = path.join(__dirname, '..', 'data');

// Usage: ts-node src/iherb-scan.ts [category] [max-pages]
// Example: ts-node src/iherb-scan.ts snacks 5
const CATEGORY = process.argv[2] || 'grocery';
const MAX_PAGES = parseInt(process.argv[3] || '50', 10);

const RESTRICTED_INGREDIENTS: Record<string, string[]> = {
  eggs: ['egg', 'eggs', 'egg white', 'egg yolk', 'albumin', 'lysozyme', 'mayonnaise', 'mayo'],
  onions: ['onion', 'onions', 'onion powder', 'dried onion', 'cipollini', 'shallot', 'shallots'],
  garlic: ['garlic', 'garlic powder', 'minced garlic', 'roasted garlic', 'dehydrated garlic'],
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

// Use Facebook bot UA to bypass Cloudflare
const HEADERS = {
  'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

function fetchPage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: HEADERS, timeout: 20000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = res.headers.location;
        if (redirectUrl) {
          fetchPage(redirectUrl).then(resolve).catch(reject);
          return;
        }
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// Extract product URLs from sitemap
async function getProductUrlsFromSitemap(): Promise<string[]> {
  const allUrls: string[] = [];
  const sitemapFiles = [
    'https://www.iherb.com/sitemaps/products-0-www-0.xml',
    'https://www.iherb.com/sitemaps/products-0-www-1.xml',
    'https://www.iherb.com/sitemaps/products-0-www-2.xml',
  ];

  for (const sitemapUrl of sitemapFiles) {
    console.log(`Fetching sitemap: ${sitemapUrl}`);
    try {
      const xml = await fetchPage(sitemapUrl);
      const urlPattern = /<loc>(https:\/\/www\.iherb\.com\/pr\/[^<]+)<\/loc>/g;
      let match;
      while ((match = urlPattern.exec(xml)) !== null) {
        allUrls.push(match[1]);
      }
      console.log(`  Found ${allUrls.length} total product URLs so far`);
    } catch (error: any) {
      console.error(`  Error fetching sitemap: ${error.message}`);
    }
  }

  return allUrls;
}

// Extract product URLs from a category listing page
async function getProductUrlsFromCategory(category: string, maxPages: number): Promise<string[]> {
  const allUrls: string[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= maxPages; page++) {
    const url = `https://www.iherb.com/c/${category}?p=${page}`;
    console.log(`Fetching category page ${page}...`);

    try {
      const html = await fetchPage(url);

      // Extract product URLs from category page
      const urlPattern = /href="(\/pr\/[^"]+)"/g;
      let match;
      let count = 0;
      while ((match = urlPattern.exec(html)) !== null) {
        const productUrl = `https://www.iherb.com${match[1].split('?')[0]}`;
        if (!seen.has(productUrl)) {
          seen.add(productUrl);
          allUrls.push(productUrl);
          count++;
        }
      }

      if (count === 0) break;
      console.log(`  Found ${count} new products (total: ${allUrls.length})`);
      await delay(500);
    } catch (error: any) {
      console.error(`  Error on page ${page}: ${error.message}`);
      if (error.message.includes('403')) break;
      break;
    }
  }

  return allUrls;
}

// Extract product data from a product page
function extractProductData(html: string, url: string): any {
  // Product name
  const nameMatch = html.match(/<h1[^>]*id="name"[^>]*>([^<]+)<\/h1>/i)
    || html.match(/<h1[^>]*data-testid="product-name"[^>]*>([^<]+)<\/h1>/i);
  const title = nameMatch ? nameMatch[1].trim() : 'Unknown';

  // Brand
  const brandMatch = html.match(/<div[^>]*id="brand"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i)
    || html.match(/<span[^>]*class="[^"]*brand-name[^"]*"[^>]*>([^<]+)<\/span>/i);
  const brand = brandMatch ? brandMatch[1].trim() : undefined;

  // Price
  const priceMatch = html.match(/\$([0-9]+\.[0-9]{2})/);
  const price = priceMatch ? `$${priceMatch[1]}` : '';

  // Image
  const imageMatch = html.match(/<img[^>]*id="iherb-product-image"[^>]*src="([^"]+)"/i)
    || html.match(/<img[^>]*data-testid="product-image"[^>]*src="([^"]+)"/i)
    || html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
  const imageUrl = imageMatch ? imageMatch[1] : '';

  // Ingredients from prodOverviewIngred
  let ingredients: string | undefined;
  const ingredPatterns = [
    // "Other ingredients" or "Ingredients" heading followed by prodOverviewIngred div
    /(?:Other\s+)?[Ii]ngredients<\/(?:strong|b|h3|h4)>[\s\S]*?<div[^>]*class="prodOverviewIngred"[^>]*>([\s\S]*?)<\/div>/i,
    // Direct prodOverviewIngred class
    /<div[^>]*class="prodOverviewIngred"[^>]*>([\s\S]*?)<\/div>/i,
    // Ingredients in a paragraph after heading
    /[Ii]ngredients<\/(?:strong|b|h3|h4)>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i,
  ];

  for (const pattern of ingredPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const text = match[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#\d+;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Filter out non-ingredient text
      const cleaned = text
        .replace(/\s*(Packaged in|Manufactured in|Produced in|Made in|Contains:|Allergen|Warning|Caution|CONTAINS|This product|May contain|Produced in a facility|Not manufactured with)[\s\S]*/i, '')
        .replace(/\.\s*$/, '')
        .trim();

      if (cleaned.length > 5) {
        ingredients = cleaned;
        break;
      }
    }
  }

  // Extract slug for ID
  const slugMatch = url.match(/\/pr\/([^/]+)/);
  const id = slugMatch ? slugMatch[1] : url;

  return {
    id,
    title,
    brand,
    price,
    ingredients,
    productUrl: url,
    imageUrl,
    source: 'iHerb',
  };
}

async function main() {
  console.log('\n========================================');
  console.log('  iHerb Product Scanner');
  console.log(`  Category: ${CATEGORY}`);
  console.log(`  Max pages: ${MAX_PAGES}`);
  console.log('========================================\n');

  // Try category page first, fall back to sitemap
  let productUrls: string[];

  console.log('Getting product URLs from category pages...\n');
  productUrls = await getProductUrlsFromCategory(CATEGORY, MAX_PAGES);

  if (productUrls.length === 0) {
    console.log('Category pages blocked. Trying sitemaps...\n');
    const allSitemapUrls = await getProductUrlsFromSitemap();

    // Filter for food-related product URLs by slug keywords
    // Be specific to avoid supplements
    const foodKeywords = [
      'chocolate', 'candy', 'snack', 'chips-', 'cracker', 'cookie', 'cookies',
      'granola', 'cereal', 'oatmeal', 'rice-cake', 'pasta-', 'noodle', 'bread-',
      'sauce-', 'salsa-', 'dressing-', 'vinegar-', 'olive-oil', 'coconut-oil',
      'honey-', 'maple-syrup', 'agave', 'stevia-', 'monk-fruit',
      'tea-', 'coffee-', 'cocoa-', 'matcha',
      'almond-butter', 'cashew-butter', 'peanut-butter', 'tahini',
      'jam-', 'jelly-', 'fruit-spread',
      'salt-', 'seasoning', 'turmeric', 'cinnamon', 'cumin',
      'flour-', 'baking-', 'pancake', 'waffle',
      'dried-fruit', 'raisins', 'dates-', 'trail-mix',
      'popcorn', 'pretzel', 'puffs-',
      'gummy-bear', 'licorice', 'marshmallow',
      'coconut-milk', 'oat-milk', 'almond-milk',
      'ghee', 'nutritional-yeast',
    ];

    productUrls = allSitemapUrls.filter(url => {
      const slug = url.split('/pr/')[1]?.toLowerCase() || '';
      return foodKeywords.some(kw => slug.includes(kw));
    });

    console.log(`Filtered to ${productUrls.length} food-related URLs from ${allSitemapUrls.length} total`);
  }

  console.log(`\nTotal product URLs: ${productUrls.length}\n`);

  if (productUrls.length === 0) {
    console.log('No products found.');
    process.exit(0);
  }

  const results = {
    source: 'iHerb',
    category: CATEGORY,
    scannedAt: new Date().toISOString(),
    suitable: [] as any[],
    unsuitable: [] as any[],
    noIngredients: [] as any[],
  };

  console.log('Scanning products...\n');
  console.log('-'.repeat(60));

  for (let i = 0; i < productUrls.length; i++) {
    const url = productUrls[i];
    process.stdout.write(`[${i + 1}/${productUrls.length}] `);

    try {
      const html = await fetchPage(url);
      const productData = extractProductData(html, url);
      process.stdout.write(`${productData.title.substring(0, 45)}`);

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
      console.log(`Error: ${error.message}`);
    }

    await delay(500);
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

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `iherb-${CATEGORY}-${dateStr}.json`;
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${filepath}`);
}

main().catch(console.error);
