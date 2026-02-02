import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import puppeteer from 'puppeteer';

const DATA_DIR = path.join(__dirname, '..', 'data');
const BASE_URL = 'https://usa.lkk.com';

// Restricted ingredients (same as sayweee-scan)
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
      if (normalized.includes(term)) {
        if (!restrictedFound.includes(category)) {
          restrictedFound.push(category);
        }
        break;
      }
    }
  }

  for (const term of NON_VEG_INGREDIENTS) {
    if (normalized.includes(term)) {
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

// Fetch sitemap and extract foodservices product URLs
async function fetchSitemapProductUrls(): Promise<string[]> {
  console.log('Fetching sitemap...');
  try {
    const response = await axios.get(`${BASE_URL}/sitemap.xml`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      timeout: 15000,
    });

    const urls: string[] = [];
    // Match foodservices product URLs (not category/saucetype pages)
    const urlPattern = /<loc>(https:\/\/usa\.lkk\.com\/en\/foodservices\/products\/[^<]+)<\/loc>/g;
    let match;
    while ((match = urlPattern.exec(response.data)) !== null) {
      const url = match[1];
      // Exclude category filter pages
      if (!url.includes('/saucetype/')) {
        urls.push(url);
      }
    }
    console.log(`  Found ${urls.length} foodservices product URLs from sitemap`);
    return urls;
  } catch (error) {
    console.error('Error fetching sitemap:', error);
    return [];
  }
}

// Use Puppeteer to get consumer product URLs (they use JS "Load More")
async function fetchConsumerProductUrls(): Promise<string[]> {
  console.log('Fetching consumer product URLs with browser...');
  const urls: string[] = [];

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(`${BASE_URL}/en/products`, { waitUntil: 'networkidle2', timeout: 60000 });

    // Click "Load More" until all products are shown
    let lastCount = 0;
    for (let i = 0; i < 30; i++) {
      const loadMoreBtn = await page.$('a[href="javascript:void(0);"]');
      if (!loadMoreBtn) break;

      const btnText = await page.evaluate(`
        (() => {
          const el = document.querySelector('a[href="javascript:void(0);"]');
          return el ? el.textContent.trim() : '';
        })()
      `);
      if (!btnText || !String(btnText).toLowerCase().includes('load more')) break;

      await loadMoreBtn.click();
      await new Promise(resolve => setTimeout(resolve, 2000));

      const currentCount = await page.evaluate(`
        document.querySelectorAll('a[href*="/en/products/"]').length
      `) as number;

      if (currentCount === lastCount) break;
      lastCount = currentCount;
      process.stdout.write(`\r  Loaded ${currentCount} product links...`);
    }
    console.log('');

    // Extract all product URLs
    const links = await page.evaluate(`
      Array.from(document.querySelectorAll('a[href*="/en/products/"]'))
        .map(function(a) { return a.getAttribute('href'); })
        .filter(function(href) { return href && href.indexOf('/products?') === -1 && href !== '/en/products'; })
    `) as string[];

    const seen = new Set<string>();
    for (const link of links) {
      const fullUrl = link.startsWith('http') ? link : `${BASE_URL}${link}`;
      const normalized = fullUrl.split('?')[0];
      // Skip category/filter pages
      if (normalized.includes('/saucetype/')) continue;
      if (!seen.has(normalized)) {
        seen.add(normalized);
        urls.push(normalized);
      }
    }
    console.log(`  Found ${urls.length} consumer product URLs`);
  } catch (error) {
    console.error('Browser error:', error);
  } finally {
    await browser.close();
  }

  return urls;
}

// Combine both sources and deduplicate by slug
function deduplicateUrls(foodservicesUrls: string[], consumerUrls: string[]): string[] {
  const slugToUrl = new Map<string, string>();

  // Consumer URLs take priority (they have consumer-facing ingredients)
  for (const url of consumerUrls) {
    const slug = url.split('/').pop() || '';
    if (slug) slugToUrl.set(slug, url);
  }

  // Add foodservices URLs for slugs not already present
  for (const url of foodservicesUrls) {
    const slug = url.split('/').pop() || '';
    if (slug && !slugToUrl.has(slug)) {
      slugToUrl.set(slug, url);
    }
  }

  return Array.from(slugToUrl.values());
}

async function fetchProductPage(url: string): Promise<string | null> {
  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      timeout: 15000,
    });
    return response.data;
  } catch (error) {
    return null;
  }
}

function extractProductInfo(html: string, url: string) {
  const slug = url.split('/').pop() || 'unknown';

  // Extract title - product name is in <h3 class="name">
  let title = 'Unknown';
  const nameMatch = html.match(/<h3[^>]*class="name"[^>]*>([^<]+)<\/h3>/i);
  const ogTitleMatch = html.match(/og:title"[^>]*content="([^"]+)"/i);
  const titleTagMatch = html.match(/<title[^>]*>\s*([^|<]+)/i);

  if (nameMatch) {
    title = nameMatch[1].trim();
  } else if (ogTitleMatch) {
    title = ogTitleMatch[1].replace(/ \|.*$/, '').trim();
  } else if (titleTagMatch) {
    title = titleTagMatch[1].trim();
  }

  // Extract ingredients - LKK uses <h2>Ingredients:</h2><p>...</p>
  // Content may contain <br>, nested <p>, and other inline HTML
  let ingredients: string | undefined;
  const ingredientMatch = html.match(/<h[23]>Ingredients:?<\/h[23]>\s*<p>([\s\S]*?)<\/p>(?:\s*<br\s*\/?>)*\s*(?:<\/p>)?/i);
  if (ingredientMatch && ingredientMatch[1]) {
    // Strip HTML tags, normalize whitespace
    const extracted = ingredientMatch[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (extracted.length > 5) {
      ingredients = extracted;
    }
  }

  // Extract allergens
  let allergens: string | undefined;
  const allergenMatch = html.match(/<h[23]>Allergens:?<\/h[23]>\s*<p>([\s\S]*?)<\/p>/i);
  if (allergenMatch && allergenMatch[1]) {
    const text = allergenMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.toLowerCase() !== 'n/a' && text.length > 0) {
      allergens = text;
    }
  }

  // Extract product image — prefer og:image which has the actual product photo
  const images: string[] = [];
  const ogImageMatch = html.match(/og:image"[^>]*content="([^"]+)"/i);
  if (ogImageMatch) {
    // Decode HTML entities (&amp; -> &)
    const ogUrl = ogImageMatch[1].replace(/&amp;/g, '&');
    images.push(ogUrl);
  }

  // Also grab any product-specific images from the page (skip icons/favicons/logos)
  const imagePattern = /https:\/\/cdn-akamai\.lkk\.com\/[^"'\s)\\]+/g;
  const imageMatches = html.match(imagePattern) || [];
  const seenImages = new Set<string>(images.map(u => u.split('?')[0]));
  const skipPatterns = [
    'apple-touch-icon', 'favicon', 'lkk-icon-', 'LKKLogo', 'searchicon',
    'iconsClose', 'shoppingcart', '/styles/', 'attr-icon', 'icon-cny',
    'icon-clock', 'icon-star', 'f-fb', 'f-twt', 'f-ins', 'f-pin',
    'linkedin', 'tiktok', 'youtube', '/scripts/', '/images/icon-',
  ];

  for (const img of imageMatches) {
    const cleanUrl = img.split('?')[0];
    if (seenImages.has(cleanUrl)) continue;
    if (skipPatterns.some(p => img.includes(p))) continue;
    // Skip tiny icons (30x30, 80x80)
    if (/[?&](h|w)=(30|80)(&|$)/.test(img)) continue;
    // Skip non-image assets
    if (/\.(js|css)(\?|$)/.test(img)) continue;
    // For /-/media/ URLs, only keep product-like sizes or full-size (no size params)
    if (img.includes('/-/media/')) {
      const hasSize = /[?&]h=\d+/.test(img);
      const isProductSize = /[?&]h=(315|400|[5-9]\d\d|\d{4,})/.test(img);
      if (hasSize && !isProductSize) continue;
    }
    seenImages.add(cleanUrl);
    images.push(img.replace(/&amp;/g, '&'));
  }

  return { title, slug, ingredients, allergens, images, productUrl: url, scannedAt: '' };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('\n========================================');
  console.log('  Lee Kum Kee Product Scanner');
  console.log('========================================\n');

  // Fetch product URLs from both sources
  const foodservicesUrls = await fetchSitemapProductUrls();
  const consumerUrls = await fetchConsumerProductUrls();
  const productUrls = deduplicateUrls(foodservicesUrls, consumerUrls);

  console.log(`\nTotal unique products to scan: ${productUrls.length}\n`);

  if (productUrls.length === 0) {
    console.log('No products found.');
    process.exit(0);
  }

  const results = {
    source: 'LKK',
    scannedAt: new Date().toISOString(),
    suitable: [] as any[],
    unsuitable: [] as any[],
    noIngredients: [] as any[],
  };

  console.log('Scanning products...\n');
  console.log('-'.repeat(60));

  for (let i = 0; i < productUrls.length; i++) {
    const url = productUrls[i];
    process.stdout.write(`[${i + 1}/${productUrls.length}] Fetching...`);

    const html = await fetchProductPage(url);
    if (!html) {
      console.log(' Error fetching page');
      await delay(200);
      continue;
    }

    const productInfo = extractProductInfo(html, url);
    process.stdout.write(` ${productInfo.title.substring(0, 40)}`);

    productInfo.scannedAt = new Date().toISOString();

    if (productInfo.ingredients) {
      const analysis = analyzeIngredients(productInfo.ingredients);
      (productInfo as any).analysis = analysis;

      if (analysis.isVegetarian && !analysis.hasRestrictedIngredients) {
        results.suitable.push(productInfo);
        console.log(` -> SUITABLE`);
      } else {
        results.unsuitable.push(productInfo);
        const reasons = [...analysis.restrictedFound, ...analysis.nonVegFound];
        console.log(` -> ${reasons.join(', ')}`);
      }
    } else {
      results.noIngredients.push(productInfo);
      console.log(` -> No ingredients found`);
    }

    await delay(200);
  }

  console.log('-'.repeat(60));
  console.log('\n========================================');
  console.log('  SCAN COMPLETE');
  console.log('========================================');
  console.log(`\nSuitable: ${results.suitable.length}`);
  console.log(`Unsuitable: ${results.unsuitable.length}`);
  console.log(`No ingredients: ${results.noIngredients.length}`);

  // Save results
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `lkk-products-${dateStr}.json`;
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${filepath}`);
}

main().catch(console.error);
