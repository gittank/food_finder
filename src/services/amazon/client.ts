import axios from 'axios';
import { config } from '../../config';
import { ProductInfo, ProductLookupResult } from './types';

// OAuth token cache
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

// Creators API endpoints - NA region (Version 2.1)
const TOKEN_URL = 'https://creatorsapi.auth.us-east-1.amazoncognito.com/oauth2/token';
const API_BASE_URL = 'https://creatorsapi.amazon';
const CREDENTIAL_VERSION = '2.1';

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && Date.now() < tokenExpiry - 300000) {
    return cachedToken;
  }

  try {
    const response = await axios.post(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.amazon.accessKey,
        client_secret: config.amazon.secretKey,
        scope: 'creatorsapi/default',
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    cachedToken = response.data.access_token;
    tokenExpiry = Date.now() + (response.data.expires_in * 1000);

    console.log('OAuth token obtained successfully');
    return cachedToken!;
  } catch (error: any) {
    console.error('OAuth Error:', error.response?.data || error.message);
    throw new Error('Failed to obtain OAuth token');
  }
}

export async function getProductByAsin(asin: string): Promise<ProductLookupResult> {
  try {
    const token = await getAccessToken();

    const requestBody = {
      itemIds: [asin],
      itemIdType: 'ASIN',
      marketplace: config.amazon.marketplace,
      partnerTag: config.amazon.partnerTag,
      resources: [
        'images.primary.large',
        'images.variants.large',
        'itemInfo.title',
        'itemInfo.features',
        'itemInfo.byLineInfo',
        'itemInfo.productInfo',
      ],
    };

    const response = await axios.post(
      `${API_BASE_URL}/catalog/v1/getItems`,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${token}, Version ${CREDENTIAL_VERSION}`,
          'Content-Type': 'application/json',
          'x-marketplace': config.amazon.marketplace,
        },
      }
    );

    const items = response.data.itemsResult?.items;
    if (!items?.[0]) {
      return { product: null, error: 'Product not found' };
    }

    const product = parseProductFromResponse(items[0], asin);
    return { product };
  } catch (error: any) {
    const errorMsg = error.response?.data?.errors?.[0]?.message
      || error.response?.data?.message
      || error.response?.data
      || error.message;
    console.error('Creators API Error:', errorMsg);
    return { product: null, error: typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg) };
  }
}

function parseProductFromResponse(item: any, asin: string): ProductInfo {
  const itemInfo = item.itemInfo || {};
  const images = item.images || {};

  const title = itemInfo.title?.displayValue || 'Unknown';
  const brand = itemInfo.byLineInfo?.brand?.displayValue;
  const features = itemInfo.features?.displayValues || [];

  // Try to find ingredients in features
  let ingredients: string | undefined;
  for (const feature of features) {
    const lowerFeature = feature.toLowerCase();
    if (lowerFeature.includes('ingredient') || lowerFeature.startsWith('contains:')) {
      ingredients = feature;
      break;
    }
  }

  // Collect all image URLs
  const imageUrls: string[] = [];

  // Check for primary image (various sizes)
  const primary = images.primary;
  if (primary) {
    const primaryUrl = primary.large?.url || primary.medium?.url || primary.small?.url || primary.hiRes?.url;
    if (primaryUrl) {
      imageUrls.push(primaryUrl);
    }
  }

  // Check for variant images
  const variants = images.variants || [];
  for (const variant of variants) {
    const variantUrl = variant.large?.url || variant.medium?.url || variant.small?.url;
    if (variantUrl) {
      imageUrls.push(variantUrl);
    }
  }

  const url = item.detailPageURL || `https://www.amazon.com/dp/${asin}`;

  return {
    asin,
    title,
    brand,
    ingredients,
    features,
    images: imageUrls,
    url,
  };
}

export function extractAsinFromUrl(url: string): string | null {
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /\/product\/([A-Z0-9]{10})/i,
    /amazon\.[^/]+\/([A-Z0-9]{10})/i,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1].toUpperCase();
    }
  }

  if (/^[A-Z0-9]{10}$/i.test(url)) {
    return url.toUpperCase();
  }

  return null;
}
