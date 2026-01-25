import axios from 'axios';

export interface SayweeeProduct {
  id: string;
  title: string;
  brand?: string;
  price?: string;
  ingredients?: string;
  description?: string;
  images: string[];
  productUrl: string;
}

const BASE_URL = 'https://www.sayweee.com';

export async function getProductById(productId: string): Promise<SayweeeProduct | null> {
  try {
    // First, we need to find the product URL
    const response = await axios.get(`${BASE_URL}/en/product/-/${productId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      maxRedirects: 5,
    });

    return parseProductFromHtml(response.data, productId);
  } catch (error: any) {
    console.error(`Error fetching product ${productId}:`, error.message);
    return null;
  }
}

export async function getProductByUrl(url: string): Promise<SayweeeProduct | null> {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const idMatch = url.match(/\/(\d+)$/);
    const productId = idMatch ? idMatch[1] : 'unknown';

    return parseProductFromHtml(response.data, productId);
  } catch (error: any) {
    console.error('Error fetching product:', error.message);
    return null;
  }
}

function parseProductFromHtml(html: string, productId: string): SayweeeProduct | null {
  try {
    // Extract title from og:title or page title
    const titleMatch = html.match(/og:title"[^>]*content="([^"]+)"/i)
      || html.match(/<title>([^<|]+)/i);
    const title = titleMatch ? titleMatch[1].replace(/ \| Weee!.*$/, '').trim() : 'Unknown';

    // Extract description which often contains ingredients
    const descMatch = html.match(/og:description"[^>]*content="([^"]+)"/i);
    let description = descMatch ? descMatch[1] : '';

    // Look for ingredients in the page content
    let ingredients: string | undefined;

    // First, try to find the full details section with all ingredients
    // The details are often in escaped JSON with \u003cp\u003e tags
    const detailsPattern = /Ingredients?\s*list:?\\u003c\/p\\u003e(.*?)(?:Storage|Disclaimer|Return|\\u003cdiv)/is;
    const detailsMatch = html.match(detailsPattern);
    if (detailsMatch) {
      ingredients = detailsMatch[1]
        .replace(/\\u003c[^\\]*?\\u003e/g, ' ')  // Remove escaped HTML tags
        .replace(/\\u0026nbsp;/g, ' ')  // Replace &nbsp;
        .replace(/\\u0026#39;/g, "'")   // Replace apostrophe
        .replace(/\\u0026amp;/g, '&')   // Replace &amp;
        .replace(/\\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    // Fallback: try simpler patterns
    if (!ingredients || ingredients.length < 20) {
      const ingredientPatterns = [
        // Match full ingredient sections including multiple paragraphs
        /Ingredients?\s*list:?\s*<\/p>\s*<p>([^<]+(?:<\/p>\s*<p>[^<]+)*)/i,
        /Ingredients?[:\s]+([A-Z][^<]+?)(?:<|$)/i,
        /Water,\s*[a-zA-Z,\s]+(?:salt|sugar|wheat|soy)[^.<]*/i,
      ];

      for (const pattern of ingredientPatterns) {
        const match = html.match(pattern);
        if (match) {
          const extracted = (match[1] || match[0])
            .replace(/<[^>]*>/g, ' ')
            .replace(/\\u003c[^>]*\\u003e/g, ' ')
            .replace(/\\n/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (extracted.length > 20) {
            ingredients = extracted;
            break;
          }
        }
      }
    }

    // Extract images - prefer the product's own image array over all page images
    let images: string[] = [];

    // First, try to find the product's image gallery array (JSON format)
    const imageArrayMatch = html.match(/\["(https:\/\/img\d+\.weee(?:cdn)?\.(?:net|com)\/item\/image\/[^"]+)"(?:,"(https:\/\/img\d+\.weee(?:cdn)?\.(?:net|com)\/item\/image\/[^"]+)")*\]/);
    if (imageArrayMatch) {
      // Parse the JSON array of product images
      try {
        const arrayStr = imageArrayMatch[0];
        const parsed = JSON.parse(arrayStr);
        if (Array.isArray(parsed)) {
          images = parsed.map((url: string) => url.split('!')[0]); // Remove size suffix
        }
      } catch {
        // Fall through to backup method
      }
    }

    // Fallback: extract from page if no gallery array found
    if (images.length === 0) {
      const imagePattern = /https?:\/\/img\d+\.weee(?:cdn)?\.(?:net|com)\/item\/image\/[^"'\s)\\]+/g;
      const imageMatches = html.match(imagePattern) || [];

      // Deduplicate and clean image URLs
      const seenImages = new Set<string>();
      for (const img of imageMatches) {
        const cleanUrl = img.split('!')[0]; // Remove size suffix
        if (!seenImages.has(cleanUrl) && !cleanUrl.includes('-square')) {
          seenImages.add(cleanUrl);
          images.push(cleanUrl);
        }
      }
    }

    // Extract price
    const priceMatch = html.match(/\$(\d+\.?\d*)/);
    const price = priceMatch ? `$${priceMatch[1]}` : undefined;

    // Extract brand (often in title like "Brand Product Name")
    const brandMatch = title.match(/^([A-Z][a-zA-Z]+)\s/);
    const brand = brandMatch ? brandMatch[1] : undefined;

    // Build product URL
    const urlMatch = html.match(/og:url"[^>]*content="([^"]+)"/i);
    const productUrl = urlMatch ? urlMatch[1] : `${BASE_URL}/en/product/-/${productId}`;

    return {
      id: productId,
      title,
      brand,
      price,
      ingredients,
      description,
      images,
      productUrl,
    };
  } catch (error) {
    console.error('Error parsing product HTML:', error);
    return null;
  }
}

export function extractProductIdFromUrl(url: string): string | null {
  const match = url.match(/\/product\/[^/]+\/(\d+)/);
  return match ? match[1] : null;
}

// Search for products (requires scraping search results page)
export async function searchProducts(query: string, limit: number = 20): Promise<SayweeeProduct[]> {
  try {
    const response = await axios.get(`${BASE_URL}/en/search`, {
      params: { keyword: query },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    // Extract product IDs and URLs from search results
    const productPattern = /\/product\/([^/]+)\/(\d+)/g;
    const matches = [...response.data.matchAll(productPattern)];

    const products: SayweeeProduct[] = [];
    const seenIds = new Set<string>();

    for (const match of matches.slice(0, limit)) {
      const [, slug, id] = match;
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      products.push({
        id,
        title: slug.replace(/-/g, ' '),
        images: [],
        productUrl: `${BASE_URL}/en/product/${slug}/${id}`,
      });
    }

    return products;
  } catch (error: any) {
    console.error('Search error:', error.message);
    return [];
  }
}
