export interface ProductInfo {
  asin: string;
  title: string;
  brand?: string;
  ingredients?: string;
  features?: string[];
  images: string[];
  url: string;
}

export interface ProductLookupResult {
  product: ProductInfo | null;
  error?: string;
}
