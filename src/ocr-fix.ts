import * as fs from 'fs';
import * as path from 'path';
import { extractTextFromImageUrl, extractIngredientsFromText } from './services/ocr/extractor';

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

async function ocrProduct(product: any): Promise<{ ingredients: string | null; confidence: number; ocrImageUrl: string | null }> {
  const images: string[] = product.images || [];
  if (images.length === 0) return { ingredients: null, confidence: 0, ocrImageUrl: null };

  // Try up to 10 images, prefer later images (more likely to be back label)
  const toTry = images.slice(0, 10);
  let bestResult: { ingredients: string | null; confidence: number; imageUrl: string | null } = {
    ingredients: null, confidence: 0, imageUrl: null,
  };

  for (let i = 0; i < toTry.length; i++) {
    const url = toTry[i];
    try {
      const result = await extractTextFromImageUrl(url);
      if (result.ingredients && result.ingredients.length > 15) {
        // Score: prefer longer ingredient lists and higher confidence
        const score = result.confidence + (result.ingredients.split(',').length * 5);
        const bestScore = bestResult.confidence + ((bestResult.ingredients || '').split(',').length * 5);
        if (score > bestScore) {
          bestResult = { ingredients: result.ingredients, confidence: result.confidence, imageUrl: url };
        }
      }
    } catch {
      // skip
    }
  }

  return { ingredients: bestResult.ingredients, confidence: bestResult.confidence, ocrImageUrl: bestResult.imageUrl };
}

async function main() {
  console.log('\n========================================');
  console.log('  OCR Ingredient Scanner');
  console.log('========================================\n');

  // Process specific product first if requested
  const priorityId = '16759'; // Szechuan Flavor Crispy Chili Sauce

  const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('sayweee-') && f.endsWith('.json'));

  let totalScanned = 0;
  let totalFixed = 0;

  for (const file of files) {
    const filepath = path.join(DATA_DIR, file);
    const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));

    const noIngredients: any[] = data.noIngredients || [];
    if (noIngredients.length === 0) continue;

    console.log(`\n[${file}] ${noIngredients.length} products without ingredients`);

    // Sort so priority product comes first
    noIngredients.sort((a: any, b: any) => {
      if (a.productId === priorityId) return -1;
      if (b.productId === priorityId) return 1;
      return 0;
    });

    let fixed = 0;
    const toRemove: number[] = [];

    for (let i = 0; i < noIngredients.length; i++) {
      const product = noIngredients[i];
      const images = product.images || [];
      if (images.length === 0) continue;

      totalScanned++;
      const label = product.productId === priorityId ? '*** PRIORITY *** ' : '';
      process.stdout.write(`  ${label}[${i + 1}/${noIngredients.length}] ${(product.title || '?').substring(0, 40)}...`);

      const result = await ocrProduct(product);

      if (result.ingredients) {
        const analysis = analyze(result.ingredients);
        product.ingredients = result.ingredients;
        product.ingredientSource = 'ocr';
        product.ocrConfidence = result.confidence;
        product.ocrImageUrl = result.ocrImageUrl;
        product.analysis = analysis;

        // Move to appropriate bucket
        const bucket = (analysis.isVegetarian && !analysis.hasRestrictedIngredients) ? 'suitable' : 'unsuitable';
        if (!data[bucket]) data[bucket] = [];
        data[bucket].push(product);
        toRemove.push(i);
        fixed++;
        totalFixed++;

        const reasons = [...analysis.restrictedFound, ...analysis.nonVegFound].join(', ') || 'clean';
        console.log(` -> ${bucket} (${reasons}) [${Math.round(result.confidence)}% conf]`);

        if (product.productId === priorityId) {
          console.log(`    INGREDIENTS: ${result.ingredients}`);
        }
      } else {
        console.log(' no ingredients found');
      }

      await delay(100);
    }

    // Remove moved products from noIngredients (reverse order to preserve indices)
    for (const idx of toRemove.reverse()) {
      noIngredients.splice(idx, 1);
    }

    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`  Fixed: ${fixed}, Remaining: ${noIngredients.length}`);
  }

  console.log('\n========================================');
  console.log(`  DONE: Scanned ${totalScanned}, Fixed ${totalFixed}`);
  console.log('========================================\n');
}

main().catch(console.error);
