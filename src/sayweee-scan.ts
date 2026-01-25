import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { extractTextFromImageUrl, extractIngredientsFromText } from './services/ocr/extractor';

const DATA_DIR = path.join(__dirname, '..', 'data');
const BASE_URL = 'https://www.sayweee.com';

// Restricted ingredients
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

// Validate that ingredients text is actually valid (not garbage)
function isValidIngredients(text: string): boolean {
  if (!text || text.length < 15) return false;

  // Must have commas (ingredient lists are comma-separated)
  if (!text.includes(',')) return false;

  // Should contain common ingredient-related words
  const ingredientIndicators = [
    'water', 'salt', 'sugar', 'flour', 'oil', 'starch', 'soy', 'wheat',
    'rice', 'corn', 'vinegar', 'sauce', 'extract', 'flavor', 'sodium',
    'acid', 'protein', 'modified', 'natural', 'contains'
  ];
  const normalized = text.toLowerCase();
  const hasIngredientWords = ingredientIndicators.some(word => normalized.includes(word));

  // Check for garbage patterns (common parsing failures)
  const garbagePatterns = [
    /^list:\s*["\])}]+/i,  // "list: "])" type garbage
    /^\s*["\[\]{}()]+\s*$/,  // Just brackets/quotes
    /^[^a-zA-Z]*$/,  // No letters at all
    /undefined|null|NaN/i,  // JavaScript artifacts
  ];
  const isGarbage = garbagePatterns.some(pattern => pattern.test(text));

  return hasIngredientWords && !isGarbage;
}

// Score how likely text is to be an ingredient list (higher = better)
// Returns a score from 0-100 that can be combined with OCR confidence
function scoreIngredientQuality(text: string): number {
  if (!text) return 0;
  const normalized = text.toLowerCase();
  let score = 50; // Start neutral

  // NEGATIVE: Nutrition label indicators (penalize heavily)
  const nutritionPatterns = [
    /\d+\s*%\s*dv/i,           // "21% DV"
    /daily\s*value/i,          // "Daily Value"
    /calories/i,               // "Calories"
    /total\s*(fat|carb)/i,     // "Total Fat", "Total Carb"
    /serving\s*size/i,         // "Serving Size"
    /\d+\s*mg/i,               // "500mg"
    /\d+\s*g\b/i,              // "20g"
    /cholesterol/i,
    /potassium/i,
    /dietary\s*fiber/i,
  ];
  for (const pattern of nutritionPatterns) {
    if (pattern.test(normalized)) {
      score -= 15; // Heavy penalty for each nutrition indicator
    }
  }

  // POSITIVE: Real ingredient indicators
  const ingredientPatterns = [
    'water', 'salt', 'sugar', 'flour', 'oil', 'starch', 'soy', 'wheat',
    'rice', 'corn', 'vinegar', 'pepper', 'spice', 'garlic', 'onion',
    'ginger', 'chili', 'lemon', 'lime', 'sesame', 'peanut', 'coconut',
    'tapioca', 'potato', 'vegetable', 'fruit', 'juice', 'paste',
    'powder', 'dried', 'extract', 'natural', 'artificial'
  ];
  for (const word of ingredientPatterns) {
    if (normalized.includes(word)) {
      score += 5; // Bonus for each ingredient word
    }
  }

  // POSITIVE: Looks like ingredient list structure
  const commaCount = (text.match(/,/g) || []).length;
  if (commaCount >= 3) score += 10;  // Multiple ingredients
  if (commaCount >= 6) score += 10;  // Long ingredient list

  // POSITIVE: Starts with common first ingredients
  if (/^(water|sugar|salt|flour|corn|wheat|soy)/i.test(normalized)) {
    score += 15;
  }

  // NEGATIVE: Too short or too long
  if (text.length < 30) score -= 10;
  if (text.length > 500) score -= 5;

  // Clamp to 0-100
  return Math.max(0, Math.min(100, score));
}

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

async function fetchProductPage(url: string) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      timeout: 15000,
    });
    return response.data;
  } catch (error) {
    return null;
  }
}

function extractProductInfo(html: string, productId: string) {
  // Extract title
  const titleMatch = html.match(/og:title"[^>]*content="([^"]+)"/i);
  const title = titleMatch ? titleMatch[1].replace(/ \| Weee!.*$/, '').trim() : 'Unknown';

  // Extract images - prefer the product's own image array over all page images
  let images: string[] = [];

  // First, try to find the product's image gallery array (JSON format)
  const imageArrayMatch = html.match(/\["(https:\/\/img\d+\.weee(?:cdn)?\.(?:net|com)\/item\/image\/[^"]+)"(?:,"(https:\/\/img\d+\.weee(?:cdn)?\.(?:net|com)\/item\/image\/[^"]+)")*\]/);
  if (imageArrayMatch) {
    try {
      const parsed = JSON.parse(imageArrayMatch[0]);
      if (Array.isArray(parsed)) {
        images = parsed.map((url: string) => url.split('!')[0]);
      }
    } catch {
      // Fall through to backup method
    }
  }

  // Fallback: extract from page if no gallery array found
  if (images.length === 0) {
    const imagePattern = /https:\/\/img\d+\.weee(?:cdn)?\.(?:net|com)\/item\/image\/[^"'\s)\\]+/g;
    const imageMatches = html.match(imagePattern) || [];
    const seenImages = new Set<string>();
    for (const img of imageMatches) {
      const cleanUrl = img.split('!')[0];
      if (!seenImages.has(cleanUrl) && !cleanUrl.includes('-square')) {
        seenImages.add(cleanUrl);
        images.push(cleanUrl);
      }
    }
  }

  // Try to extract ingredients from HTML first
  let ingredients: string | undefined;
  const ingredientPatterns = [
    /Ingredients?[:\s]+([A-Z][^<]+?)(?:<|$)/i,
    /Water,\s*[a-zA-Z,\s()]+(?:salt|sugar)[^<]+/i,
  ];

  for (const pattern of ingredientPatterns) {
    const match = html.match(pattern);
    if (match) {
      const extracted = match[1] || match[0];
      if (extracted.length > 20 && extracted.includes(',')) {
        ingredients = extracted.replace(/\\u003c[^>]*\\u003e/g, ' ').trim();
        break;
      }
    }
  }

  // Extract price
  const priceMatch = html.match(/\$(\d+\.?\d*)/);
  const price = priceMatch ? `$${priceMatch[1]}` : undefined;

  return { title, images, ingredients, price, productId };
}

async function scanProductWithOcr(productInfo: any) {
  // Check if HTML ingredients are valid
  const htmlIngredientsValid = isValidIngredients(productInfo.ingredients || '');

  // Always scan ALL images to find the best ingredients
  let bestOcrResult: { ingredients: string; confidence: number; qualityScore: number; combinedScore: number; imageUrl: string } | null = null;

  for (const imageUrl of productInfo.images.slice(0, 10)) {
    try {
      const result = await extractTextFromImageUrl(imageUrl);
      if (result.ingredients && result.confidence > 30) {
        // Validate OCR result too
        if (isValidIngredients(result.ingredients)) {
          // Calculate ingredient quality score (penalizes nutrition labels)
          const qualityScore = scoreIngredientQuality(result.ingredients);
          // Combined score: weight quality more than raw OCR confidence
          // This ensures real ingredient lists beat nutrition labels even with lower OCR confidence
          const combinedScore = (qualityScore * 0.6) + (result.confidence * 0.4);

          // Keep the result with highest combined score
          if (!bestOcrResult || combinedScore > bestOcrResult.combinedScore) {
            bestOcrResult = {
              ingredients: result.ingredients,
              confidence: result.confidence,
              qualityScore: qualityScore,
              combinedScore: combinedScore,
              imageUrl: imageUrl,
            };
          }
        }
      }
    } catch (error) {
      continue;
    }
  }

  // Decide which source to use: HTML or OCR
  if (bestOcrResult && bestOcrResult.confidence > 50) {
    // Prefer high-confidence OCR results
    return {
      ...productInfo,
      ingredients: bestOcrResult.ingredients,
      ocrConfidence: bestOcrResult.confidence,
      ocrImageUrl: bestOcrResult.imageUrl,
      ingredientSource: 'ocr',
    };
  } else if (htmlIngredientsValid) {
    // Use valid HTML ingredients
    return {
      ...productInfo,
      ingredientSource: 'html',
    };
  } else if (bestOcrResult) {
    // Use lower-confidence OCR if no valid HTML
    return {
      ...productInfo,
      ingredients: bestOcrResult.ingredients,
      ocrConfidence: bestOcrResult.confidence,
      ocrImageUrl: bestOcrResult.imageUrl,
      ingredientSource: 'ocr',
    };
  }

  // No valid ingredients found
  return {
    ...productInfo,
    ingredients: undefined,
  };
}

async function searchSayweee(query: string): Promise<string[]> {
  try {
    const response = await axios.get(`${BASE_URL}/en/search`, {
      params: { keyword: query },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    const productPattern = /\/product\/([^/]+)\/(\d+)/g;
    const matches = [...response.data.matchAll(productPattern)];
    const urls: string[] = [];
    const seenIds = new Set<string>();

    for (const match of matches) {
      const [, slug, id] = match;
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      urls.push(`${BASE_URL}/en/product/${slug}/${id}`);
    }

    return urls;
  } catch (error) {
    return [];
  }
}

// Available stores
const STORES = ['chinese', 'japanese', 'korean', 'vietnamese', 'indian', 'thai', 'filipino'];

// Subcategories for each main category
const CATEGORY_SUBCATEGORIES: Record<string, string[]> = {
  seasoning: ['seasoning', 'seasoning01', 'seasoning02', 'seasoning03', 'seasoning04',
              'seasoning05', 'seasoning06', 'seasoning07', 'seasoning08', 'seasoning09', 'seasoning10'],
  snack: ['snack', 'snack01', 'snack02', 'snack03', 'snack04', 'snack05', 'snack06',
          'snack07', 'snack08', 'snack09', 'snack10', 'snack11', 'snack13', 'snack14', 'snack15'],
  instant: ['instant', 'instant01', 'instant02', 'instant03', 'instant04', 'instant05',
            'instant06', 'instant07', 'instant08', 'instant09', 'instant10', 'instant11'],
  beverages: ['beverages', 'beverages01', 'beverages02', 'beverages03', 'beverages04',
              'beverages05', 'beverages06', 'beverages07', 'beverages08'],
  bakery: ['bakery', 'bakery01', 'bakery02', 'bakery03', 'bakery04', 'bakery05', 'bakery07'],
  dairy: ['dairy', 'dairy01', 'dairy02', 'dairy03', 'dairy04', 'dairy05'],
  canned: ['canned', 'canned01', 'canned02', 'canned03', 'canned04', 'canned05'],
  dried: ['dried', 'dried01', 'dried02', 'dried03', 'dried04', 'dried05',
          'dried06', 'dried07', 'dried08', 'dried09'],
};

async function fetchCategoryProducts(category: string, store?: string): Promise<string[]> {
  const subcategories = CATEGORY_SUBCATEGORIES[category] || [category];
  const seenIds = new Set<string>();
  const urls: string[] = [];

  // If store is specified, first get products from that store to filter
  let storeProductIds: Set<string> | null = null;
  if (store) {
    storeProductIds = await fetchStoreProductIds(store);
    console.log(`Filtering by store "${store}" (${storeProductIds.size} products in store)\n`);
  }

  console.log(`Fetching products from ${subcategories.length} subcategories...`);

  for (const subcat of subcategories) {
    try {
      process.stdout.write(`  Scanning ${subcat}...`);
      const response = await axios.get(`${BASE_URL}/en/category/${subcat}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        timeout: 15000,
      });

      const productPattern = /\/product\/([^/]+)\/(\d+)/g;
      const matches = [...response.data.matchAll(productPattern)];
      let added = 0;

      for (const match of matches) {
        const [, slug, id] = match;
        if (seenIds.has(id)) continue;
        // If store filter is active, only include products from that store
        if (storeProductIds && !storeProductIds.has(id)) continue;
        seenIds.add(id);
        urls.push(`${BASE_URL}/en/product/${slug}/${id}`);
        added++;
      }
      console.log(` ${added} new products (total: ${urls.length})`);
    } catch (error) {
      console.log(` error`);
    }
  }

  return urls;
}

async function fetchStoreProductIds(store: string): Promise<Set<string>> {
  const ids = new Set<string>();
  const storeName = store.toLowerCase();

  if (!STORES.includes(storeName)) {
    console.log(`Warning: Unknown store "${store}". Available: ${STORES.join(', ')}`);
    return ids;
  }

  try {
    const response = await axios.get(
      `${BASE_URL}/en/grocery-near-me/asian-supermarket-in-usa/${storeName}-store`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        timeout: 15000,
      }
    );

    const productPattern = /\/product\/[^/]+\/(\d+)/g;
    const matches = [...response.data.matchAll(productPattern)];
    for (const match of matches) {
      ids.add(match[1]);
    }
  } catch (error) {
    console.log(`Error fetching store "${store}"`);
  }

  return ids;
}

async function fetchStoreProducts(store: string): Promise<string[]> {
  const storeName = store.toLowerCase();
  const urls: string[] = [];
  const seenIds = new Set<string>();

  if (!STORES.includes(storeName)) {
    console.log(`Unknown store "${store}". Available stores: ${STORES.join(', ')}`);
    return urls;
  }

  console.log(`Fetching products from ${storeName} store...`);

  try {
    const response = await axios.get(
      `${BASE_URL}/en/grocery-near-me/asian-supermarket-in-usa/${storeName}-store`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        timeout: 15000,
      }
    );

    const productPattern = /\/product\/([^/]+)\/(\d+)/g;
    const matches = [...response.data.matchAll(productPattern)];

    for (const match of matches) {
      const [, slug, id] = match;
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      urls.push(`${BASE_URL}/en/product/${slug}/${id}`);
    }
    console.log(`Found ${urls.length} products`);
  } catch (error) {
    console.log(`Error fetching store`);
  }

  return urls;
}

async function main() {
  const args = process.argv.slice(2);

  // Parse flags
  const limitIndex = args.indexOf('--limit');
  const categoryIndex = args.indexOf('--category');
  const storeIndex = args.indexOf('--store');

  // Get limit value if specified
  const suitableLimit = limitIndex !== -1 && args[limitIndex + 1]
    ? parseInt(args[limitIndex + 1], 10)
    : Infinity;

  // Get category if specified
  const category = categoryIndex !== -1 ? args[categoryIndex + 1] : null;

  // Get store if specified
  const store = storeIndex !== -1 ? args[storeIndex + 1] : null;

  // Filter out flags from query
  let queryArgs = [...args];
  if (limitIndex !== -1) {
    queryArgs = [...queryArgs.slice(0, limitIndex), ...queryArgs.slice(limitIndex + 2)];
  }
  const catIdx = queryArgs.indexOf('--category');
  if (catIdx !== -1) {
    queryArgs = [...queryArgs.slice(0, catIdx), ...queryArgs.slice(catIdx + 2)];
  }
  const strIdx = queryArgs.indexOf('--store');
  if (strIdx !== -1) {
    queryArgs = [...queryArgs.slice(0, strIdx), ...queryArgs.slice(strIdx + 2)];
  }
  const query = queryArgs.join(' ') || 'sauce';

  console.log('\n========================================');
  console.log('  Sayweee Product Scanner with OCR');
  console.log('========================================\n');

  let productUrls: string[];
  let scanMode: string;

  if (category) {
    // Category mode - optionally filtered by store
    console.log(`Scanning category: "${category}"${store ? ` (${store} store only)` : ''}\n`);
    productUrls = await fetchCategoryProducts(category, store || undefined);
    scanMode = store ? `category-${category}-${store}` : `category-${category}`;
  } else if (store) {
    // Store-only mode (no category)
    console.log(`Scanning store: "${store}" (curated selection)\n`);
    productUrls = await fetchStoreProducts(store);
    scanMode = `store-${store}`;
  } else {
    // Search mode
    console.log(`Searching for: "${query}"\n`);
    productUrls = await searchSayweee(query);
    scanMode = query;
  }
  console.log(`\nFound ${productUrls.length} total products\n`);

  if (productUrls.length === 0) {
    console.log('No products found.');
    process.exit(0);
  }

  const results = {
    query: category ? `category:${category}` : query,
    scannedAt: new Date().toISOString(),
    suitable: [] as any[],
    unsuitable: [] as any[],
    noIngredients: [] as any[],
  };

  console.log('Scanning products with OCR...\n');
  console.log('-'.repeat(60));

  for (let i = 0; i < productUrls.length; i++) {
    // Stop if we've found enough suitable items
    if (results.suitable.length >= suitableLimit) {
      console.log(`\nReached limit of ${suitableLimit} suitable items. Stopping.`);
      break;
    }

    const url = productUrls[i];
    const idMatch = url.match(/\/(\d+)$/);
    const productId = idMatch ? idMatch[1] : 'unknown';

    process.stdout.write(`[${i + 1}] Fetching...`);

    const html = await fetchProductPage(url);
    if (!html) {
      console.log(' Error fetching page');
      continue;
    }

    const productInfo = extractProductInfo(html, productId);
    process.stdout.write(` ${productInfo.title.substring(0, 30)}...`);

    // Try OCR if no ingredients in HTML
    const scannedProduct = await scanProductWithOcr(productInfo);
    scannedProduct.productUrl = url;
    scannedProduct.scannedAt = new Date().toISOString();

    if (scannedProduct.ingredients) {
      const analysis = analyzeIngredients(scannedProduct.ingredients);
      scannedProduct.analysis = analysis;

      const sourceInfo = scannedProduct.ingredientSource === 'ocr'
        ? ` [OCR ${scannedProduct.ocrConfidence?.toFixed(0)}%]`
        : ' [HTML]';

      if (analysis.isVegetarian && !analysis.hasRestrictedIngredients) {
        results.suitable.push(scannedProduct);
        console.log(` ✓ SUITABLE (${results.suitable.length}/${suitableLimit})${sourceInfo}`);
      } else {
        results.unsuitable.push(scannedProduct);
        const reasons = [...analysis.restrictedFound, ...analysis.nonVegFound];
        console.log(` ✗ ${reasons.join(', ')}${sourceInfo}`);
      }
    } else {
      results.noIngredients.push(scannedProduct);
      console.log(` No ingredients found (${scannedProduct.images?.length || 0} images scanned)`);
    }
  }

  console.log('-'.repeat(60));
  console.log('\n========================================');
  console.log('  SCAN COMPLETE');
  console.log('========================================');
  console.log(`\nSuitable: ${results.suitable.length}`);
  console.log(`Unsuitable: ${results.unsuitable.length}`);
  console.log(`No ingredients: ${results.noIngredients.length}`);

  // Save results
  const filename = `sayweee-${scanMode.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.json`;
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${filepath}`);
}

main().catch(console.error);
