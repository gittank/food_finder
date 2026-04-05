import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'data');

const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('instagram-oge.free.life'));
if (files.length === 0) { console.error('No data file found'); process.exit(1); }

const rawData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, files[files.length - 1]), 'utf-8'));
const posts = rawData.posts || [];

// Manually curated product names from captions
const productMap: Record<string, string> = {
  'B5GUpf9jPNe': 'On the Border Tortilla Chips (Rennet-Free)',
  'B356K7xjv7h': "Chips Ahoy! Brownie Filled Cookies (Eggless)",
  'B3V8z7rjmu8': 'Ritz Toasted Chips',
  'B3V8L0Xjn0-': 'Follow Your Heart VeganEgg',
  'BxV7lf7liYg': 'Daiya Cheezecake (Dairy-Free)',
  'BwVzNNYlGWd': "Hellman's Vegan Mayo",
  'BwQs47WlPmz': "Cabot Monterey Jack Cheese (Rennet-Free)",
  'Boji0fSl_25': 'Whole Foods Spinach Artichoke Dip',
  'BnAkl-TFbZg': 'PopCorners Popped Corn Chips',
  'Bj6LydwnXnY': 'Nutritional Yeast',
  'Be5xuo7lj4C': 'Hostess Eggless Cupcakes',
  'Bd21AHlB9oZ': "Lay's Potato Chips",
  'BaAIyyBB0fZ': 'On the Border Cheese Dip',
  'BZDHwzPB48X': 'Sweet & Sara Pumpkin Spice S\'mores (Gelatin-Free)',
  'BYe0YdwhCuo': 'Blaze Pizza (OG-Free)',
  'BX0xFrThhBn': 'Swedish Fish (Gelatin-Free)',
  'BXCEORpBHOl': "Welch's Frozen Fruit Bars (Gelatin-Free)",
  'BWWF4DwB33X': 'Bai Antioxidant Infusion Drinks',
  'BWEW7bch1Tx': 'Naked Juice (Not Green Machine - has garlic)',
  'BV8q4IXh-uI': "Mott's & Annie's Gelatin-Free Gummies",
  'BVs-AnGhdwU': 'Chips Ahoy! Original (Eggless)',
  'BVifmjxh66p': 'Ritz Chips',
  'BU-b9j5BNHR': 'JUST Cookies (Eggless)',
  'BUsyk28BrV-': 'Boba Tea Popping Pearls',
  'BUinwalB0vC': 'Rice Krispies Treats (Gelatin-Free)',
  'BUYNpD_htuS': 'Sour Patch Kids (Gelatin-Free)',
  'BUKrwOeBr58': "Trader Joe's Frozen Pizza",
  'BUHX4bEhYnV': 'Klondike Bars',
  'BT7wWFHBNLB': 'Dandies Marshmallows (Gelatin-Free)',
  'BT10h47B9Oq': "Ben & Jerry's Non-Dairy Ice Cream",
  'BTp98HGhYXe': 'Pop-Tarts Unfrosted (Gelatin-Free)',
  'BTkh5y2Ba-F': 'Perfectly Free Frozen Bites (Vegan, Eggless)',
  'BTiHQQOhGCT': 'Twix, Milky Way & Snickers Ice Cream Bars (Eggless)',
  'BTeHnuzBVmP': 'Heinz Jalapeno Mustard',
  'BTX4hLzhBqM': "Lenny & Larry's Complete Cookie (Vegan)",
};

const products: any[] = [];

for (const post of posts) {
  const title = productMap[post.shortcode];
  if (!title) continue;

  products.push({
    id: post.shortcode,
    title,
    price: '',
    ingredients: undefined,
    productUrl: post.postUrl,
    imageUrl: post.imageUrl,
    images: post.images || [post.imageUrl],
    source: 'OGEFreeLife',
    date: post.date,
    scannedAt: new Date().toISOString(),
  });
}

const results = {
  source: 'OGEFreeLife',
  scannedAt: new Date().toISOString(),
  suitable: products,
  unsuitable: [] as any[],
  noIngredients: [] as any[],
};

console.log(`Extracted ${products.length} products\n`);
for (const p of products) {
  console.log(`  ${p.title}`);
}

const dateStr = new Date().toISOString().split('T')[0];
const outFile = `ogefreelife-${dateStr}.json`;
const outPath = path.join(DATA_DIR, outFile);
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(`\nSaved to: ${outPath}`);
