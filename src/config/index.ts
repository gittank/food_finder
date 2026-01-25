import dotenv from 'dotenv';

dotenv.config();

export const config = {
  amazon: {
    accessKey: process.env.AMAZON_ACCESS_KEY || '',
    secretKey: process.env.AMAZON_SECRET_KEY || '',
    partnerTag: process.env.AMAZON_PARTNER_TAG || '',
    marketplace: process.env.AMAZON_MARKETPLACE || 'www.amazon.com',
  },
};

export function validateConfig(): void {
  const { amazon } = config;

  if (!amazon.accessKey) {
    throw new Error('AMAZON_ACCESS_KEY is required');
  }
  if (!amazon.secretKey) {
    throw new Error('AMAZON_SECRET_KEY is required');
  }
  if (!amazon.partnerTag || amazon.partnerTag === 'YOUR_PARTNER_TAG_HERE') {
    throw new Error('AMAZON_PARTNER_TAG is required - find it in your Amazon Associates dashboard');
  }
}
