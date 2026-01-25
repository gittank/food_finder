import * as fs from 'fs';
import * as path from 'path';
import { extractTextFromImageUrl, extractIngredientsFromText } from './services/ocr/extractor';

const DATA_DIR = path.join(__dirname, '..', 'data');

// Restricted ingredients for analysis
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

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const inputFile = args[0];

  if (!inputFile) {
    console.log('OCR Scanner - Extract ingredients from product images');
    console.log('======================================================\n');
    console.log('Usage: npm run ocr <json-file>');
    console.log('\nExample:');
    console.log('  npm run ocr data/hmart-sauce-seasoning-ii-2026-01-24.json');
    process.exit(0);
  }

  const filepath = inputFile.startsWith('data/')
    ? path.join(__dirname, '..', inputFile)
    : inputFile;

  if (!fs.existsSync(filepath)) {
    console.error(`File not found: ${filepath}`);
    process.exit(1);
  }

  console.log(`\nLoading: ${filepath}\n`);
  const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));

  const productsToScan = data.noIngredientData || [];
  console.log(`Found ${productsToScan.length} products without ingredients\n`);

  if (productsToScan.length === 0) {
    console.log('No products to scan.');
    process.exit(0);
  }

  const results = {
    scannedAt: new Date().toISOString(),
    totalScanned: 0,
    successfulExtractions: 0,
    suitable: [] as any[],
    unsuitable: [] as any[],
    failed: [] as any[],
  };

  console.log('Starting OCR scan (this may take a while)...\n');
  console.log('='.repeat(60));

  for (let i = 0; i < productsToScan.length; i++) {
    const product = productsToScan[i];
    results.totalScanned++;

    const progress = `[${i + 1}/${productsToScan.length}]`;
    process.stdout.write(`${progress} ${product.title.substring(0, 40)}...`);

    if (!product.imageUrl) {
      console.log(' NO IMAGE');
      results.failed.push({ ...product, ocrError: 'No image URL' });
      continue;
    }

    try {
      const ocrResult = await extractTextFromImageUrl(product.imageUrl);

      if (ocrResult.ingredients && ocrResult.ingredients.length > 10) {
        results.successfulExtractions++;
        const analysis = analyzeIngredients(ocrResult.ingredients);

        const analyzedProduct = {
          ...product,
          ingredients: ocrResult.ingredients,
          ocrConfidence: ocrResult.confidence,
          analysis: {
            ...analysis,
            allIngredients: ocrResult.ingredients.split(/[,;]/).map((s: string) => s.trim()),
          },
          scannedAt: new Date().toISOString(),
        };

        if (analysis.isVegetarian && !analysis.hasRestrictedIngredients) {
          results.suitable.push(analyzedProduct);
          console.log(' ✓ SUITABLE');
        } else {
          results.unsuitable.push(analyzedProduct);
          const reasons = [...analysis.restrictedFound, ...analysis.nonVegFound].join(', ');
          console.log(` ✗ ${reasons}`);
        }
      } else {
        console.log(' NO INGREDIENTS FOUND');
        results.failed.push({
          ...product,
          ocrText: ocrResult.text?.substring(0, 200),
          ocrConfidence: ocrResult.confidence,
          ocrError: 'Could not extract ingredients',
        });
      }

      // Small delay to avoid overwhelming the system
      await sleep(100);

    } catch (error: any) {
      console.log(` ERROR: ${error.message}`);
      results.failed.push({ ...product, ocrError: error.message });
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('\nOCR SCAN COMPLETE');
  console.log('='.repeat(60));
  console.log(`\nTotal scanned: ${results.totalScanned}`);
  console.log(`Ingredients extracted: ${results.successfulExtractions}`);
  console.log(`  - Suitable: ${results.suitable.length}`);
  console.log(`  - Unsuitable: ${results.unsuitable.length}`);
  console.log(`Failed/No ingredients: ${results.failed.length}`);

  // Save results
  const outputFilename = `ocr-results-${new Date().toISOString().split('T')[0]}.json`;
  const outputPath = path.join(DATA_DIR, outputFilename);
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);

  // Merge with original data
  if (results.suitable.length > 0 || results.unsuitable.length > 0) {
    const originalSuitable = data.suitable || [];
    const originalUnsuitable = data.unsuitable || [];

    const mergedData = {
      ...data,
      suitable: [...originalSuitable, ...results.suitable],
      unsuitable: [...originalUnsuitable, ...results.unsuitable],
      noIngredientData: results.failed,
      summary: {
        total: data.summary.total,
        suitable: originalSuitable.length + results.suitable.length,
        unsuitable: originalUnsuitable.length + results.unsuitable.length,
        noIngredientData: results.failed.length,
      },
      lastOcrScan: new Date().toISOString(),
    };

    fs.writeFileSync(filepath, JSON.stringify(mergedData, null, 2));
    console.log(`\nMerged results back to: ${filepath}`);
  }
}

main().catch(console.error);
