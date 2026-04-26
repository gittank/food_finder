import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

const DATA_DIR = path.join(__dirname, '..', 'data');
const BASE_URL = 'https://www.ishopindian.com';
const SOURCE_NAME = 'iShopIndian';

// We scan leaf subcategories because the parent category pages don't aggregate products.
// Pass --section <name> to scan only that section (e.g. --section snacks).
const CATEGORIES: { path: string; section: string }[] = [
  // Premade entrees (ready-to-eat meals by brand)
  { path: '/Buy-Aachi-Instaa-Heat-And-Eat-Meals/', section: 'entrees' },
  { path: '/Ashoka-Brand-Ready-to-Eat-Indian-Foods/', section: 'entrees' },
  { path: '/Buy-falak-brand-ready-to-eat/', section: 'entrees' },
  { path: '/Buy-Gits-Brand-Ready-Meals/', section: 'entrees' },
  { path: '/Haldirams-Brand-Minute-Khana-Meals/', section: 'entrees' },
  { path: '/buy-hocco-ready-to-eat/', section: 'entrees' },
  { path: '/Khazana-Brand-Organic-Ready-to-Eat-Indian-Meals/', section: 'entrees' },
  { path: '/Buy-Kitchens-of-India-Ready-to-Eat-Meals/', section: 'entrees' },
  { path: '/Buy-Maya-Kaimal-Brand-Organic-Meals/', section: 'entrees' },
  { path: '/MTR-Brand-Ready-to-Eat-Meals/', section: 'entrees' },
  { path: '/Pataks-Brand-Meals/', section: 'entrees' },
  { path: '/Buy-Priya-Ready-to-Eat/', section: 'entrees' },
  { path: '/Tasty-Bite-Meals-Ready-to-Eat/', section: 'entrees' },
  { path: '/Truly-Indian-Brand-Ready-to-Eat-Meals/', section: 'entrees' },
  { path: '/Organic-Indian-Ready-To-Eat-and-Ready-to-Cook-Snacks/', section: 'entrees' },
  // Sauces
  { path: '/Indian-Chutneys-and-Sauces/', section: 'sauces' },
  { path: '/Indian-Cooking-Pastes-and-Indian-Simmer-Sauces/', section: 'sauces' },
  // Achars (pickles)
  { path: '/Indian-Chili-Pickles/', section: 'achars' },
  { path: '/Indian-Garlic-Pickles/', section: 'achars' },
  { path: '/Indian-Ginger-Pickles/', section: 'achars' },
  { path: '/Indian-Lime-Pickles/', section: 'achars' },
  { path: '/Indian-Mango-Pickles-Relishes/', section: 'achars' },
  { path: '/Indian-Mixed-Pickles/', section: 'achars' },
  { path: '/Other-Indian-Pickles-Relishes/', section: 'achars' },
  { path: '/Organic-Pickles-Condiments-Jams/', section: 'achars' },
  // Snacks (namkeen, chips, mixtures by brand)
  { path: '/Buy-Ammas-Kitchen-Brand-Snacks/', section: 'snacks' },
  { path: '/Abhiruchi-South-Indian-Snacks/', section: 'snacks' },
  { path: '/Anand-Brand-Snacks-From-South-India/', section: 'snacks' },
  { path: '/A2B-brand-snacks/', section: 'snacks' },
  { path: '/Bikaji-Brand-Snacks/', section: 'snacks' },
  { path: '/buy-bikano-brand-snacks/', section: 'snacks' },
  { path: '/Cake-Rusk-Tea-Toasts-and-Khari-Puff-Pastry/', section: 'snacks' },
  { path: '/chhedas-brand-snacks/', section: 'snacks' },
  { path: '/Indian-Cookies-Biscuits-Wafers/', section: 'snacks' },
  { path: '/Buy-Deep-Brand-Snacks-Online/', section: 'snacks' },
  { path: '/Buy-Garvi-Gujarat-Snacks/', section: 'snacks' },
  { path: '/Buy-Haldirams-Snacks-Online/', section: 'snacks' },
  { path: '/Buy-Janakis-Brand-Snacks-Online/', section: 'snacks' },
  { path: '/khakhara-indian-wheat-crisps/', section: 'snacks' },
  { path: '/Mirch-Masala-Brand-Snacks/', section: 'snacks' },
  { path: '/Buy-Nirav-Brand-Snacks/', section: 'snacks' },
  { path: '/Indian-Snacks-Munchies/', section: 'snacks' },
  { path: '/Buy-Raju-Brand-Snacks/', section: 'snacks' },
  { path: '/Real-Bites-Brand/', section: 'snacks' },
  { path: '/Roasted-Indian-Snacks/', section: 'snacks' },
  { path: '/Sankethi-Adukale-Snacks-For-Sale-USA/', section: 'snacks' },
  { path: '/Buy-Udupi-Deep-South-Indian-Snacks/', section: 'snacks' },
  { path: '/Organic-Indian-Snacks/', section: 'snacks' },
  { path: '/Buy-Papad-Lentil-Wafers-Pappadums/', section: 'snacks' },
  { path: '/Buy-Fresh-Indian-Sweets-Desserts/', section: 'snacks' },
];

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

function analyzeIngredients(ingredientsText: string, title = '') {
  const normalized = ingredientsText.toLowerCase();
  const restrictedFound: string[] = [];
  const nonVegFound: string[] = [];

  for (const [category, terms] of Object.entries(RESTRICTED_INGREDIENTS)) {
    for (const term of terms) {
      const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(normalized)) {
        if (!restrictedFound.includes(category)) restrictedFound.push(category);
        break;
      }
    }
  }

  for (const term of NON_VEG_INGREDIENTS) {
    const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(normalized)) nonVegFound.push(term);
  }

  // Title-based override: some products (e.g. Priya "with Garlic" pickles) only
  // declare "Mixed Spices" on the label but explicitly name the allium in the
  // title. Trust the manufacturer's title over an underspecified ingredient list.
  const lowerTitle = title.toLowerCase();
  const titleChecks: [string, RegExp][] = [
    ['garlic', /\bwith\s+garlic\b|\bgarlic\s+pickle\b/],
    ['onions', /\bwith\s+onions?\b|\bonion\s+pickle\b/],
    ['scallions', /\bwith\s+scallions?\b|\bwith\s+(green|spring)\s+onions?\b/],
  ];
  for (const [cat, re] of titleChecks) {
    if (re.test(lowerTitle) && !restrictedFound.includes(cat)) restrictedFound.push(cat);
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

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

// Walk pageId=1,2,3... extracting product URLs whose href is in this category (skips cross-sells).
async function fetchCategoryProductUrls(catPath: string): Promise<string[]> {
  const seen = new Set<string>();
  const ordered: string[] = [];
  let page = 1;
  let totalRecords: number | null = null;

  while (true) {
    const url = `${BASE_URL}${catPath}?pageId=${page}`;
    process.stdout.write(`    page ${page}...`);

    let html: string;
    try {
      const response = await axios.get(url, { headers: HEADERS, timeout: 20000 });
      html = response.data as string;
    } catch (err: any) {
      console.log(` error: ${err.message}`);
      break;
    }

    if (totalRecords === null) {
      const m = html.match(/<span class="records-count">(\d+)<\/span>/);
      if (m) totalRecords = parseInt(m[1], 10);
    }

    // Only keep products whose href is under this category path (filters out
    // featured / "you may also like" / "recently viewed" cross-sells).
    const articleRegex = /<article class="product productid-(\d+)[^"]*">([\s\S]*?)<\/article>/g;
    let added = 0;
    let m: RegExpExecArray | null;
    while ((m = articleRegex.exec(html)) !== null) {
      const body = m[2];
      const hrefMatch = body.match(/href="(https:\/\/www\.ishopindian\.com\/[^"]+)"/);
      if (!hrefMatch) continue;
      const href = hrefMatch[1].split('?')[0];
      if (!href.includes(catPath)) continue;
      if (seen.has(href)) continue;
      seen.add(href);
      ordered.push(href);
      added++;
    }

    console.log(` +${added} (total ${ordered.length}${totalRecords !== null ? `/${totalRecords}` : ''})`);

    if (added === 0) break;
    if (totalRecords !== null && ordered.length >= totalRecords) break;
    page++;
    await delay(300);
  }

  return ordered;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '-')
    .replace(/&mdash;/g, '-');
}

function findIngredientsIn(text: string): string | undefined {
  const m = text.match(/Ingredients\s*[:\-]+\s*([\s\S]*?)(?:\.\s*(?:Vegetarian|Vegan|Natural|Kosher|Halal|Allergen|Storage|Nutrition|Serving|Country of Origin|Manufactured|Made in|How to|Directions|Net Wt|Net Weight|Contains|May Contain)\b|$)/i);
  if (!m) return undefined;
  const ingredients = m[1].replace(/\s+/g, ' ').replace(/[,.\s]+$/, '').trim();
  return ingredients.length > 5 ? ingredients : undefined;
}

function findMadeWithIngredients(text: string): string | undefined {
  const m = text.match(/\bmade\s+with\s+([\s\S]{10,300}?)(?:\.\s*(?:Contains|No|Serve|Best|Store|Keep|Refrigerate|How|Directions|Net)\b|\.?\s*$)/i);
  if (!m) return undefined;
  const ingredients = m[1].replace(/\s+/g, ' ').replace(/[,.\s]+$/, '').trim();
  return ingredients.length > 5 ? ingredients : undefined;
}

function extractIngredients(html: string): string | undefined {
  // The visible product-description body has the full ingredient list.
  // The <meta name="description"> often truncates mid-list (e.g. Pav Bhaji's
  // meta cuts off before "...onions, water, garlic..."), which would wrongly
  // mark allium-containing items as suitable. So prefer body, fall back to meta.
  const candidates: string[] = [];

  // 1. Check the dedicated Ingredients tab (X-Cart "ingredients-tab" div)
  const ingredientsTab = html.match(/<div[^>]*class="ingredients-tab"[^>]*>([\s\S]*?)<\/div>/i)?.[1];
  if (ingredientsTab) {
    const cleaned = ingredientsTab
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const decoded = decodeHtmlEntities(cleaned);
    // Skip if the tab just says "No Ingredients specified"
    if (!/no\s+ingredients\s+specified/i.test(decoded) && decoded.length > 10) {
      candidates.push('Ingredients: ' + decoded);
    }
  }

  // 2. Check the product-description div
  const descBlock = html.match(/<div[^>]*class="[^"]*product-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1];
  if (descBlock) {
    const cleaned = descBlock
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ');
    candidates.push(decodeHtmlEntities(cleaned));
  }

  // 3. Check meta description
  const metaDesc = html.match(/<meta name="description" content="([^"]+)"/i)?.[1]
    || html.match(/<meta property="og:description" content="([^"]+)"/i)?.[1];
  if (metaDesc) candidates.push(decodeHtmlEntities(metaDesc));

  // Pick the longest ingredient list found (more complete = safer).
  let best: string | undefined;
  for (const text of candidates) {
    const ing = findIngredientsIn(text);
    if (ing && (!best || ing.length > best.length)) best = ing;
  }

  // Fallback: look for "made with ..." pattern in description
  if (!best) {
    for (const text of candidates) {
      const ing = findMadeWithIngredients(text);
      if (ing && (!best || ing.length > best.length)) best = ing;
    }
  }

  return best;
}

function extractProductData(html: string, url: string, section: string) {
  const slug = url.split('/').pop() || 'unknown';

  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : 'Unknown';

  const priceMatch = html.match(/class="price product-price">([^<]+)<\/span>/);
  const price = priceMatch ? priceMatch[1].trim() : '';

  let imageUrl = html.match(/<meta property="og:image" content="([^"]+)"/i)?.[1] || '';
  if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;

  const ingredients = extractIngredients(html);

  return {
    id: slug,
    title,
    price,
    ingredients,
    productUrl: url,
    imageUrl,
    images: imageUrl ? [imageUrl] : [],
    source: SOURCE_NAME,
    section,
  };
}

async function main() {
  // Optional --section flag to scan only one section
  const sectionArg = process.argv.indexOf('--section');
  const sectionFilter = sectionArg !== -1 ? process.argv[sectionArg + 1] : undefined;

  const categoriesToScan = sectionFilter
    ? CATEGORIES.filter(c => c.section === sectionFilter)
    : CATEGORIES;

  const sections = [...new Set(categoriesToScan.map(c => c.section))].join(', ');
  console.log('\n========================================');
  console.log(`  ${SOURCE_NAME} Product Scanner (X-Cart)`);
  console.log(`  URL: ${BASE_URL}`);
  console.log(`  Sections: ${sections}`);
  console.log('========================================\n');

  // Phase 1: collect all product URLs across categories.
  const productEntries: { url: string; section: string }[] = [];
  const seenUrls = new Set<string>();

  for (const cat of categoriesToScan) {
    console.log(`Category [${cat.section}] ${cat.path}`);
    const urls = await fetchCategoryProductUrls(cat.path);
    for (const u of urls) {
      if (!seenUrls.has(u)) {
        seenUrls.add(u);
        productEntries.push({ url: u, section: cat.section });
      }
    }
    await delay(400);
  }

  console.log(`\nTotal unique products to scan: ${productEntries.length}\n`);

  // Phase 2: fetch each product and analyze.
  const newResults = {
    suitable: [] as any[],
    unsuitable: [] as any[],
    noIngredients: [] as any[],
  };

  console.log('-'.repeat(60));
  for (let i = 0; i < productEntries.length; i++) {
    const { url, section } = productEntries[i];
    process.stdout.write(`[${i + 1}/${productEntries.length}] `);

    try {
      const response = await axios.get(url, { headers: HEADERS, timeout: 20000 });
      const productData: any = extractProductData(response.data, url, section);
      productData.scannedAt = new Date().toISOString();

      process.stdout.write(`${productData.title.substring(0, 50).padEnd(50)} `);

      if (productData.ingredients) {
        const analysis = analyzeIngredients(productData.ingredients, productData.title);
        productData.analysis = analysis;
        if (analysis.isVegetarian && !analysis.hasRestrictedIngredients) {
          newResults.suitable.push(productData);
          console.log('-> SUITABLE');
        } else {
          newResults.unsuitable.push(productData);
          const reasons = [...analysis.restrictedFound, ...analysis.nonVegFound];
          console.log(`-> ${reasons.join(', ')}`);
        }
      } else {
        newResults.noIngredients.push(productData);
        console.log('-> No ingredients found');
      }
    } catch (err: any) {
      console.log(`-> Error: ${err.message}`);
    }

    await delay(300);
  }
  console.log('-'.repeat(60));

  // Phase 3: merge with existing data file (dedup by product id).
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `ishopindian-${dateStr}.json`;
  const filepath = path.join(DATA_DIR, filename);

  let merged: any = {
    source: SOURCE_NAME,
    scannedAt: new Date().toISOString(),
    suitable: [] as any[],
    unsuitable: [] as any[],
    noIngredients: [] as any[],
  };

  // Load existing file if present
  if (fs.existsSync(filepath)) {
    const existing = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    merged.suitable = existing.suitable || [];
    merged.unsuitable = existing.unsuitable || [];
    merged.noIngredients = existing.noIngredients || [];
  }

  // Append new results
  merged.suitable.push(...newResults.suitable);
  merged.unsuitable.push(...newResults.unsuitable);
  merged.noIngredients.push(...newResults.noIngredients);

  // Deduplicate by product id across all categories
  const dedup = (arr: any[]) => {
    const seen = new Set<string>();
    return arr.filter(p => {
      const key = p.id || p.productUrl;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  merged.suitable = dedup(merged.suitable);
  merged.unsuitable = dedup(merged.unsuitable);
  merged.noIngredients = dedup(merged.noIngredients);

  // Also dedup across categories (a product should only appear in one)
  const allIds = new Set<string>();
  for (const cat of ['suitable', 'unsuitable', 'noIngredients']) {
    merged[cat] = merged[cat].filter((p: any) => {
      const key = p.id || p.productUrl;
      if (allIds.has(key)) return false;
      allIds.add(key);
      return true;
    });
  }

  merged.summary = {
    suitable: merged.suitable.length,
    unsuitable: merged.unsuitable.length,
    noIngredients: merged.noIngredients.length,
  };

  fs.writeFileSync(filepath, JSON.stringify(merged, null, 2));

  console.log('\n========================================');
  console.log('  SCAN COMPLETE');
  console.log('========================================');
  console.log(`New scanned: ${newResults.suitable.length + newResults.unsuitable.length + newResults.noIngredients.length}`);
  console.log(`After merge+dedup:`);
  console.log(`  Suitable: ${merged.suitable.length}`);
  console.log(`  Unsuitable: ${merged.unsuitable.length}`);
  console.log(`  No ingredients: ${merged.noIngredients.length}`);
  console.log(`\nResults saved to: ${filepath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
