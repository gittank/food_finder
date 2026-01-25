import * as fs from 'fs';
import * as path from 'path';
import {
  getProductByUrl,
  searchProducts,
  SayweeeProduct
} from './services/sayweee/client';

const DATA_DIR = path.join(__dirname, '..', 'data');

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

interface AnalysisResult {
  isVegetarian: boolean;
  hasRestrictedIngredients: boolean;
  restrictedFound: string[];
  nonVegFound: string[];
}

function analyzeIngredients(ingredientsText: string): AnalysisResult {
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

function printProduct(product: SayweeeProduct, analysis?: AnalysisResult) {
  console.log('\n' + '='.repeat(60));
  console.log('PRODUCT INFORMATION');
  console.log('='.repeat(60));
  console.log(`\nName: ${product.title}`);
  if (product.brand) console.log(`Brand: ${product.brand}`);
  if (product.price) console.log(`Price: ${product.price}`);
  console.log(`URL: ${product.productUrl}`);
  console.log(`Images: ${product.images.length} found`);

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
    if (product.images.length > 0) {
      console.log('\nImages available for OCR:');
      product.images.slice(0, 3).forEach((img, i) => {
        console.log(`  ${i + 1}. ${img}`);
      });
    }
  }

  console.log('\n' + '='.repeat(60));
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log('Sayweee Product Lookup Tool');
    console.log('===========================\n');
    console.log('Usage:');
    console.log('  npm run sayweee search <query>   - Search for products');
    console.log('  npm run sayweee url <url>        - Look up a product by URL');
    console.log('\nExample:');
    console.log('  npm run sayweee search "soy sauce"');
    console.log('  npm run sayweee url "https://www.sayweee.com/en/product/Kikkoman-Soy-Sauce/83174"');
    process.exit(0);
  }

  if (command === 'search') {
    const query = args.slice(1).join(' ');
    if (!query) {
      console.error('Please provide a search query');
      process.exit(1);
    }

    console.log(`\nSearching for: "${query}"...\n`);
    const products = await searchProducts(query);

    if (products.length === 0) {
      console.log('No products found.');
      process.exit(0);
    }

    console.log(`Found ${products.length} products:\n`);
    for (const product of products) {
      console.log(`- ${product.title}`);
      console.log(`  ${product.productUrl}\n`);
    }

    // Fetch details for first few products
    console.log('\n--- Fetching details for first 5 products ---\n');

    const detailed: any[] = [];
    for (const product of products.slice(0, 5)) {
      console.log(`Fetching: ${product.title}...`);
      const fullProduct = await getProductByUrl(product.productUrl);
      if (fullProduct) {
        detailed.push(fullProduct);
        if (fullProduct.ingredients) {
          const analysis = analyzeIngredients(fullProduct.ingredients);
          const status = analysis.isVegetarian && !analysis.hasRestrictedIngredients
            ? '✓ SUITABLE'
            : '✗ ' + [...analysis.restrictedFound, ...analysis.nonVegFound].join(', ');
          console.log(`  ${status}`);
          console.log(`  Ingredients: ${fullProduct.ingredients.substring(0, 60)}...`);
        } else {
          console.log(`  No ingredients found`);
        }
      }
    }

  } else if (command === 'url') {
    const url = args[1];
    if (!url) {
      console.error('Please provide a product URL');
      process.exit(1);
    }

    console.log(`\nFetching product from: ${url}...\n`);
    const product = await getProductByUrl(url);

    if (!product) {
      console.error('Could not fetch product');
      process.exit(1);
    }

    const analysis = product.ingredients ? analyzeIngredients(product.ingredients) : undefined;
    printProduct(product, analysis);

  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}

main().catch(console.error);
