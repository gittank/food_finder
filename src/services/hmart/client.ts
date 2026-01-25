import axios from 'axios';

export interface HMartProduct {
  id: string;
  title: string;
  vendor: string;
  price: string;
  ingredients?: string;
  imageUrl?: string;
  productUrl: string;
}

export interface HMartSearchResult {
  products: HMartProduct[];
  error?: string;
}

const BASE_URL = 'https://hmartdelivery.com';

export async function searchProducts(query: string, limit: number = 20): Promise<HMartSearchResult> {
  try {
    // Shopify sites have a JSON search endpoint
    const response = await axios.get(`${BASE_URL}/search/suggest.json`, {
      params: {
        q: query,
        resources: {
          type: 'product',
          limit: limit,
        },
      },
    });

    const products = response.data.resources?.results?.products || [];

    return {
      products: products.map((p: any) => ({
        id: p.id?.toString() || '',
        title: p.title || '',
        vendor: p.vendor || '',
        price: p.price ? `$${(p.price / 100).toFixed(2)}` : '',
        imageUrl: p.image,
        productUrl: `${BASE_URL}${p.url}`,
      })),
    };
  } catch (error: any) {
    console.error('Search Error:', error.message);
    return { products: [], error: error.message };
  }
}

export async function getCollectionProducts(collection: string): Promise<HMartSearchResult> {
  try {
    // Shopify collections have a JSON endpoint
    const response = await axios.get(`${BASE_URL}/collections/${collection}/products.json`, {
      params: { limit: 250 },
    });

    const products = response.data.products || [];

    return {
      products: products.map((p: any) => parseProduct(p)),
    };
  } catch (error: any) {
    console.error('Collection Error:', error.message);
    return { products: [], error: error.message };
  }
}

export async function getProductByHandle(handle: string): Promise<HMartProduct | null> {
  try {
    const response = await axios.get(`${BASE_URL}/products/${handle}.json`);
    const product = response.data.product;

    if (!product) {
      return null;
    }

    return parseProduct(product);
  } catch (error: any) {
    console.error('Product Error:', error.message);
    return null;
  }
}

export async function fetchProductPage(url: string): Promise<HMartProduct | null> {
  try {
    // Convert URL to JSON endpoint
    const jsonUrl = url.replace(/\/?$/, '.json');
    const response = await axios.get(jsonUrl);
    const product = response.data.product;

    if (!product) {
      return null;
    }

    return parseProduct(product);
  } catch (error: any) {
    // Try fetching HTML and parsing
    try {
      const htmlResponse = await axios.get(url);
      return parseProductFromHtml(htmlResponse.data, url);
    } catch {
      console.error('Product Fetch Error:', error.message);
      return null;
    }
  }
}

function parseProduct(p: any): HMartProduct {
  // Extract ingredients from body_html
  let ingredients: string | undefined;

  if (p.body_html) {
    // Strip all HTML tags first
    let text = p.body_html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#\d+;/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Find ingredients section
    const ingredientMatch = text.match(/Ingredients:\s*[^\w]*\s*([^*]+?)(?:Allergens:|Storage:|$)/i);
    if (ingredientMatch) {
      const parsed = ingredientMatch[1]
        .replace(/^\W+/, '') // Remove leading non-word chars
        .replace(/\s+/g, ' ')
        .trim();

      // Clean up common artifacts
      if (parsed.length >= 5 && parsed !== '??') {
        ingredients = parsed;
      }
    }
  }

  const imageUrl = p.images?.[0]?.src || p.image?.src;

  return {
    id: p.id?.toString() || '',
    title: p.title || '',
    vendor: p.vendor || '',
    price: p.variants?.[0]?.price ? `$${p.variants[0].price}` : '',
    ingredients,
    imageUrl,
    productUrl: `${BASE_URL}/products/${p.handle}`,
  };
}

function parseProductFromHtml(html: string, url: string): HMartProduct | null {
  // Extract product info from HTML
  const titleMatch = html.match(/<h1[^>]*class="[^"]*product[^"]*title[^"]*"[^>]*>([^<]+)</i)
    || html.match(/<title>([^<|]+)/i);
  const title = titleMatch ? titleMatch[1].trim() : 'Unknown';

  // Look for ingredients in meta tags or product description
  const ingredientMatch = html.match(/ingredients?[:\s]*([^<\n]+)/i);
  const ingredients = ingredientMatch ? ingredientMatch[1].trim() : undefined;

  // Extract image
  const imageMatch = html.match(/og:image"[^>]*content="([^"]+)"/i);
  const imageUrl = imageMatch ? imageMatch[1] : undefined;

  // Extract price
  const priceMatch = html.match(/\$(\d+\.\d{2})/);
  const price = priceMatch ? `$${priceMatch[1]}` : '';

  return {
    id: url,
    title,
    vendor: '',
    price,
    ingredients,
    imageUrl,
    productUrl: url,
  };
}

export function extractHandleFromUrl(url: string): string | null {
  const match = url.match(/\/products\/([^/?]+)/);
  return match ? match[1] : null;
}
