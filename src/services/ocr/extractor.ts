import Tesseract from 'tesseract.js';
import axios from 'axios';
import sharp from 'sharp';

export interface OcrResult {
  text: string;
  confidence: number;
  ingredients?: string;
}

export async function extractTextFromImageUrl(imageUrl: string): Promise<OcrResult> {
  try {
    // Download the image
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });
    const imageBuffer = Buffer.from(response.data);

    // Try multiple preprocessing approaches and pick the best result
    const results = await Promise.all([
      processWithPreset(imageBuffer, 'default'),
      processWithPreset(imageBuffer, 'highContrast'),
      processWithPreset(imageBuffer, 'threshold'),
    ]);

    // Pick the result with highest confidence and ingredients found
    let bestResult = results[0];
    for (const result of results) {
      if (result.ingredients && !bestResult.ingredients) {
        bestResult = result;
      } else if (result.confidence > bestResult.confidence && result.ingredients) {
        bestResult = result;
      }
    }

    return bestResult;
  } catch (error: any) {
    console.error('OCR Error:', error.message);
    return {
      text: '',
      confidence: 0,
    };
  }
}

async function processWithPreset(imageBuffer: Buffer, preset: string): Promise<OcrResult> {
  try {
    const processedBuffer = await preprocessImage(imageBuffer, preset);
    const result = await Tesseract.recognize(processedBuffer, 'eng', {
      logger: () => {},
    });

    const text = result.data.text;
    const confidence = result.data.confidence;
    const ingredients = extractIngredientsFromText(text);

    return { text, confidence, ingredients };
  } catch {
    return { text: '', confidence: 0 };
  }
}

async function preprocessImage(imageBuffer: Buffer, preset: string): Promise<Buffer> {
  try {
    let pipeline = sharp(imageBuffer);

    switch (preset) {
      case 'highContrast':
        // High contrast for faded labels
        pipeline = pipeline
          .grayscale()
          .normalize()
          .sharpen({ sigma: 2 })
          .modulate({ brightness: 1.1, saturation: 0 })
          .linear(1.5, -0.2); // Increase contrast
        break;

      case 'threshold':
        // Binary threshold for clear text
        pipeline = pipeline
          .grayscale()
          .normalize()
          .threshold(128);
        break;

      case 'enlargeAndSharpen':
        // Enlarge small text
        pipeline = pipeline
          .resize({ width: 2000, withoutEnlargement: false })
          .grayscale()
          .sharpen({ sigma: 1.5 })
          .normalize();
        break;

      default:
        // Default: grayscale + normalize + sharpen
        pipeline = pipeline
          .grayscale()
          .normalize()
          .sharpen();
    }

    return await pipeline.toBuffer();
  } catch {
    return imageBuffer;
  }
}

export function extractIngredientsFromText(text: string): string | undefined {
  if (!text) return undefined;

  // Clean up OCR artifacts
  let cleaned = text
    .replace(/[|]/g, 'I')
    .replace(/[0O]/g, (m) => m) // Keep as-is, context dependent
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Look for ingredient section patterns
  const patterns = [
    // Standard "Ingredients:" label
    /ingredients?\s*[:\-]?\s*(.+?)(?=\.\s*(?:contains|allergen|nutrition|storage|distributed|manufactured|keep|best|expir)|$)/is,
    // "Contains:" for allergens often lists main ingredients
    /contains?\s*[:\-]\s*([^.]+)/is,
    // Pattern starting with common first ingredients
    /(water,\s*(?:sugar|salt|soy|corn|wheat|flour)[^.]+)/is,
    // Pattern with preservatives indicator
    /([a-z\s,()]+(?:sodium|potassium|preservative)[^.]+)/is,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      let ingredients = match[1]
        .replace(/^\s*[:\-]\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Validate: should have commas and common ingredient words
      const hasCommas = ingredients.includes(',');
      const hasIngredientWords = /water|salt|sugar|flour|oil|starch|soy/i.test(ingredients);

      if (ingredients.length > 15 && (hasCommas || hasIngredientWords)) {
        return ingredients;
      }
    }
  }

  return undefined;
}

export async function extractIngredientsFromImages(imageUrls: string[]): Promise<OcrResult | null> {
  console.log(`  Scanning ${imageUrls.length} images for ingredients...`);

  for (let i = 0; i < Math.min(imageUrls.length, 10); i++) {
    const url = imageUrls[i];
    process.stdout.write(`  [${i + 1}/${Math.min(imageUrls.length, 10)}] Scanning...`);

    try {
      const result = await extractTextFromImageUrl(url);

      if (result.ingredients && result.confidence > 30) {
        console.log(` Found! (${result.confidence.toFixed(0)}% confidence)`);
        return result;
      } else {
        console.log(` No ingredients`);
      }
    } catch (error) {
      console.log(` Error`);
    }
  }

  return null;
}

// Google Vision API integration (requires API key)
export async function extractTextWithGoogleVision(imageUrl: string, apiKey: string): Promise<OcrResult> {
  try {
    const response = await axios.post(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        requests: [{
          image: { source: { imageUri: imageUrl } },
          features: [{ type: 'TEXT_DETECTION' }],
        }],
      }
    );

    const annotations = response.data.responses[0]?.textAnnotations;
    if (!annotations || annotations.length === 0) {
      return { text: '', confidence: 0 };
    }

    const text = annotations[0].description || '';
    const ingredients = extractIngredientsFromText(text);

    return {
      text,
      confidence: 95, // Google Vision is generally high confidence
      ingredients,
    };
  } catch (error: any) {
    console.error('Google Vision Error:', error.response?.data?.error?.message || error.message);
    return { text: '', confidence: 0 };
  }
}
