export { getProductByAsin, extractAsinFromUrl } from './services/amazon/client';
export { extractTextFromImageUrl, extractIngredientsFromImages } from './services/ocr/extractor';
export { config, validateConfig } from './config';
export type { ProductInfo, ProductLookupResult } from './services/amazon/types';
