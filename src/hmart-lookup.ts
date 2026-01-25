import * as fs from 'fs';
import * as path from 'path';
import {
  searchProducts,
  getCollectionProducts,
  fetchProductPage,
  HMartProduct
} from './services/hmart/client';

const DATA_DIR = path.join(__dirname, '..', 'data');

interface AnalyzedProduct extends HMartProduct {
  analysis?: AnalysisResult;
  scannedAt: string;
}

function saveToJson(filename: string, data: any): string {
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  return filepath;
}

function loadFromJson(filename: string): any {
  const filepath = path.join(DATA_DIR, filename);
  if (fs.existsSync(filepath)) {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  }
  return null;
}

// Restricted ingredients for Jain vegetarian diet
const RESTRICTED_INGREDIENTS = {
  eggs: ['egg', 'eggs', 'egg white', 'egg yolk', 'albumin', 'lysozyme', 'mayonnaise', 'mayo'],
  onions: ['onion', 'onions', 'onion powder', 'dried onion', 'cipollini', 'shallot', 'shallots'],
  garlic: ['garlic', 'garlic powder', 'minced garlic', 'roasted garlic'],
  scallions: ['scallion', 'scallions', 'green onion', 'green onions', 'spring onion', 'spring onions'],
  leeks: ['leek', 'leeks'],
};

// Non-vegetarian ingredients
const NON_VEG_INGREDIENTS = [
  'meat', 'beef', 'pork', 'chicken', 'turkey', 'lamb', 'duck', 'bacon', 'ham',
  'fish', 'salmon', 'tuna', 'shrimp', 'prawn', 'crab', 'lobster', 'oyster',
  'anchovy', 'anchovies', 'sardine', 'squid', 'octopus', 'clam', 'mussel',
  'gelatin', 'lard', 'tallow', 'bone', 'broth',
];

interface AnalysisResult {
  isVegetarian: boolean;
  hasRestrictedIngredients: boolean;
  restrictedFound: string[];
  nonVegFound: string[];
  allIngredients: string[];
}

function analyzeIngredients(ingredientsText: string): AnalysisResult {
  const normalized = ingredientsText.toLowerCase();
  const restrictedFound: string[] = [];
  const nonVegFound: string[] = [];

  // Check for restricted ingredients
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

  // Check for non-vegetarian ingredients
  for (const term of NON_VEG_INGREDIENTS) {
    if (normalized.includes(term)) {
      nonVegFound.push(term);
    }
  }

  // Parse ingredient list
  const allIngredients = ingredientsText
    .split(/[,;]/)
    .map(i => i.trim())
    .filter(i => i.length > 0);

  return {
    isVegetarian: nonVegFound.length === 0,
    hasRestrictedIngredients: restrictedFound.length > 0,
    restrictedFound,
    nonVegFound,
    allIngredients,
  };
}

function printProduct(product: HMartProduct, analysis?: AnalysisResult) {
  console.log('\n' + '='.repeat(60));
  console.log('PRODUCT INFORMATION');
  console.log('='.repeat(60));
  console.log(`\nName: ${product.title}`);
  console.log(`Brand: ${product.vendor || 'Unknown'}`);
  console.log(`Price: ${product.price}`);
  console.log(`URL: ${product.productUrl}`);

  console.log('\n' + '-'.repeat(60));
  console.log('INGREDIENTS');
  console.log('-'.repeat(60));

  if (product.ingredients) {
    console.log(`\n${product.ingredients}`);

    if (analysis) {
      console.log('\n' + '-'.repeat(60));
      console.log('ANALYSIS');
      console.log('-'.repeat(60));

      const vegStatus = analysis.isVegetarian ? '✓ VEGETARIAN' : '✗ NOT VEGETARIAN';
      console.log(`\n${vegStatus}`);

      if (analysis.nonVegFound.length > 0) {
        console.log(`Non-veg ingredients: ${analysis.nonVegFound.join(', ')}`);
      }

      if (analysis.hasRestrictedIngredients) {
        console.log(`\n✗ CONTAINS RESTRICTED INGREDIENTS:`);
        console.log(`  ${analysis.restrictedFound.join(', ')}`);
      } else {
        console.log(`\n✓ No restricted ingredients (eggs, onions, garlic, scallions, leeks)`);
      }
    }
  } else {
    console.log('\nNo ingredients found in product data.');
    if (product.imageUrl) {
      console.log(`\nImage available for OCR: ${product.imageUrl}`);
    }
  }

  console.log('\n' + '='.repeat(60));
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log('H Mart Product Lookup Tool');
    console.log('==========================\n');
    console.log('Usage:');
    console.log('  npm run hmart search <query>     - Search for products');
    console.log('  npm run hmart collection <name>  - List products in a collection');
    console.log('  npm run hmart url <product-url>  - Look up a specific product');
    console.log('\nCollections: sauce-seasoning-ii, dry-noodles, pasta, snacks, etc.');
    console.log('\nExample:');
    console.log('  npm run hmart search "soy sauce"');
    console.log('  npm run hmart collection sauce-seasoning-ii');
    process.exit(0);
  }

  if (command === 'search') {
    const query = args.slice(1).join(' ');
    if (!query) {
      console.error('Please provide a search query');
      process.exit(1);
    }

    console.log(`\nSearching for: "${query}"...\n`);
    const result = await searchProducts(query);

    if (result.error) {
      console.error('Error:', result.error);
      process.exit(1);
    }

    if (result.products.length === 0) {
      console.log('No products found.');
      process.exit(0);
    }

    console.log(`Found ${result.products.length} products:\n`);
    for (const product of result.products) {
      console.log(`- ${product.title}`);
      console.log(`  ${product.productUrl}\n`);
    }
  } else if (command === 'collection') {
    const collection = args[1];
    if (!collection) {
      console.error('Please provide a collection name');
      process.exit(1);
    }

    console.log(`\nFetching collection: "${collection}"...\n`);
    const result = await getCollectionProducts(collection);

    if (result.error) {
      console.error('Error:', result.error);
      process.exit(1);
    }

    console.log(`Found ${result.products.length} products:\n`);

    const suitableProducts: AnalyzedProduct[] = [];
    const unsuitableProducts: AnalyzedProduct[] = [];
    const noDataProducts: AnalyzedProduct[] = [];
    const timestamp = new Date().toISOString();

    for (const product of result.products) {
      if (product.ingredients) {
        const analysis = analyzeIngredients(product.ingredients);
        const analyzedProduct: AnalyzedProduct = {
          ...product,
          analysis,
          scannedAt: timestamp,
        };

        if (analysis.isVegetarian && !analysis.hasRestrictedIngredients) {
          suitableProducts.push(analyzedProduct);
          console.log(`✓ ${product.title}`);
          console.log(`  Ingredients: ${product.ingredients.substring(0, 80)}...`);
          console.log('');
        } else {
          unsuitableProducts.push(analyzedProduct);
        }
      } else {
        noDataProducts.push({
          ...product,
          scannedAt: timestamp,
        });
      }
    }

    // Save results to JSON files
    const outputData = {
      collection,
      scannedAt: timestamp,
      summary: {
        total: result.products.length,
        suitable: suitableProducts.length,
        unsuitable: unsuitableProducts.length,
        noIngredientData: noDataProducts.length,
      },
      suitable: suitableProducts,
      unsuitable: unsuitableProducts,
      noIngredientData: noDataProducts,
    };

    const filename = `hmart-${collection}-${timestamp.split('T')[0]}.json`;
    const filepath = saveToJson(filename, outputData);

    console.log(`\nSummary: ${suitableProducts.length} suitable, ${unsuitableProducts.length} unsuitable out of ${result.products.length} products`);
    console.log(`\nResults saved to: ${filepath}`);
  } else if (command === 'url') {
    const url = args[1];
    if (!url) {
      console.error('Please provide a product URL');
      process.exit(1);
    }

    console.log(`\nFetching product from: ${url}...\n`);
    const product = await fetchProductPage(url);

    if (!product) {
      console.error('Could not fetch product');
      process.exit(1);
    }

    const analysis = product.ingredients ? analyzeIngredients(product.ingredients) : undefined;
    printProduct(product, analysis);
  } else {
    console.error(`Unknown command: ${command}`);
    console.log('Use: search, collection, or url');
    process.exit(1);
  }
}

main().catch(console.error);
