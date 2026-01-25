import { config, validateConfig } from './config';
import { getProductByAsin, extractAsinFromUrl } from './services/amazon/client';
import { extractIngredientsFromImages } from './services/ocr/extractor';

async function main() {
  // Get URL from command line arguments
  const url = process.argv[2];

  if (!url) {
    console.error('Usage: npm run lookup <amazon-url-or-asin>');
    console.error('Example: npm run lookup https://www.amazon.com/dp/B08XYZ1234');
    console.error('Example: npm run lookup B08XYZ1234');
    process.exit(1);
  }

  try {
    // Validate configuration
    validateConfig();
  } catch (error: any) {
    console.error('Configuration Error:', error.message);
    process.exit(1);
  }

  // Extract ASIN from URL
  const asin = extractAsinFromUrl(url);

  if (!asin) {
    console.error('Error: Could not extract ASIN from URL');
    console.error('Please provide a valid Amazon product URL or ASIN');
    process.exit(1);
  }

  console.log(`\nLooking up product: ${asin}\n`);

  // Fetch product details from Amazon PA-API
  const { product, error } = await getProductByAsin(asin);

  if (error || !product) {
    console.error('Error:', error || 'Product not found');
    process.exit(1);
  }

  // Display product info
  console.log('='.repeat(60));
  console.log('PRODUCT INFORMATION');
  console.log('='.repeat(60));
  console.log(`\nProduct Name: ${product.title}`);

  if (product.brand) {
    console.log(`Brand: ${product.brand}`);
  }

  console.log(`ASIN: ${product.asin}`);
  console.log(`URL: ${product.url}`);

  // Check for ingredients
  console.log('\n' + '-'.repeat(60));
  console.log('INGREDIENTS');
  console.log('-'.repeat(60));

  if (product.ingredients) {
    console.log(`\nFound in product data:\n${product.ingredients}`);
  } else {
    console.log('\nNo ingredients found in product data.');

    if (product.images.length > 0) {
      console.log(`\nAttempting OCR on ${product.images.length} product image(s)...`);

      const ocrResult = await extractIngredientsFromImages(product.images);

      if (ocrResult?.ingredients) {
        console.log(`\nExtracted via OCR (confidence: ${ocrResult.confidence.toFixed(1)}%):`);
        console.log(ocrResult.ingredients);
      } else {
        console.log('\nCould not extract ingredients from images.');

        // Show features as fallback
        if (product.features && product.features.length > 0) {
          console.log('\nProduct features (may contain ingredient info):');
          for (const feature of product.features) {
            console.log(`  - ${feature}`);
          }
        }
      }
    } else {
      console.log('No product images available for OCR.');
    }
  }

  console.log('\n' + '='.repeat(60));
}

main().catch(console.error);
