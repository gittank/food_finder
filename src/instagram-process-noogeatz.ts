import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'data');

const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('instagram-no_og_eatz'));
if (files.length === 0) { console.error('No data file found'); process.exit(1); }

const rawData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, files[files.length - 1]), 'utf-8'));
const posts = rawData.posts || [];

// Curated product names from image analysis + OCR + caption context
const productMap: Record<string, { title: string; stores?: string }> = {
  'DWrI1COjQeq': { title: 'Volcanic Peppers Cranky Cranberry Cherry Bomb Sauce', stores: 'heathotsauce.com' },
  'DWnTGFtjWCp': { title: "Trader Joe's Organic White Truffle Potato Chips", stores: "Trader Joe's" },
  'DWnPzJlDeln': { title: 'MUSH Peanut Butter Banana Overnight Oats', stores: 'Target' },
  'DWnPw9tjVZV': { title: 'Takis Hot Honey Tortilla Chips', stores: 'Walmart' },
  'DWnPswhjS1N': { title: 'Filippo Berio Basil Pesto (Vegan, Dairy-Free)', stores: 'Fresh Thyme' },
  'DWkHlcij8Co': { title: 'MUSH Vanilla Bean Overnight Oats (No Added Sugar)', stores: 'Target' },
  'DWjr51OAEdt': { title: 'Jams PB&J Strawberry Frozen Sandwiches', stores: 'Target' },
  'DWhvKiajZ1-': { title: 'De Cecco Pesto alla Genovese', stores: 'Whole Foods' },
  'DWhu8OODYy8': { title: 'Di Fara Classic Pizza (Frozen)', stores: 'Target' },
  'DWfynJbjd-Z': { title: 'Pillsbury Cinnamon Rolls (Original Icing)', stores: 'Walmart, Target, Kroger, Meijer' },
  'DWfyi5ZjXBM': { title: 'Mozzarella Cheese Pizza (Frozen, Product of Canada)', stores: 'Target' },
  'DWdH3PYDdL0': { title: 'Tabasco Original Red Pepper Sauce', stores: 'Walmart' },
  'DWdH1eSjUoH': { title: 'Tabasco Scorpion Sauce', stores: 'Walmart, Meijer, Target' },
  'DWbyf7ejfY8': { title: "O'Brothers Organics Jalapeno Pepper Sauce", stores: 'Amazon' },
  'DWbyO8VDeou': { title: 'Three Cheese Frozen Pizza', stores: 'Schnucks' },
  'DWZh7IIj3vk': { title: 'Monster Cookie Dough (Dairy-Free, Allergen-Free)', stores: 'Fresh Thyme' },
  'DWX0LYZDQrp': { title: 'Broccoli & Cheddar (Organic Vegetables)', stores: 'Target, Kroger' },
  'DWW9a-7j6MN': { title: "O'Brothers Organics Habanero Hot Sauce", stores: 'Amazon' },
  'DWWp65yjad4': { title: 'Pillsbury Crescent Rolls', stores: 'Walmart, Target, Kroger' },
  'DWVVfREDclH': { title: "Melinda's Jalapeno Hot Sauce", stores: 'Amazon' },
  'DWUmwvXDy7G': { title: 'White Cheddar Sharp Cheese', stores: 'Kroger' },
  'DWUmuoaj-bY': { title: 'NotMayo Plant-Based Chipotle Dressing (Kraft NotCo)', stores: 'Amazon' },
  'DWQUdVgjVLy': { title: "O'Brothers Organic Chipotle Pepper Sauce", stores: 'Whole Foods' },
  'DWQUWj0jTEP': { title: 'Whole Foods Strawberry Cherry Pistachio Crumble Pie', stores: 'Whole Foods' },
  'DWPY8MlD6P8': { title: '365 Organic Refried Beans', stores: 'Whole Foods' },
  'DWPFyfYACPz': { title: 'Organic Salsa Con Queso', stores: 'Fresh Thyme, Whole Foods, Target' },
  'DWPFv3YAAxZ': { title: 'Organic Salsa Verde', stores: 'Whole Foods' },
  'DWNfVIpDdH8': { title: 'Taylor Farms Organic Honey Citrus Chopped Kit', stores: 'Whole Foods' },
  'DWNfUCdjZJq': { title: 'Whole Foods Vegetable Pot Stickers', stores: 'Whole Foods' },
  'DWLHtHIDTb1': { title: 'Rubicon Vegan Chocolate Chip Cookies', stores: 'Target, Whole Foods, Fresh Thyme' },
  'DWLHqOcjbYN': { title: 'Deep River Jalapeno Kettle Chips', stores: 'Whole Foods' },
  'DWLHpH7DTqO': { title: 'Deep River Snack Chips', stores: 'Amazon, Fresh Thyme' },
  'DWLCxsijZjk': { title: 'Snickers/Twix Ice Cream Bars Value Pack', stores: 'Walmart, Meijer, Kroger, Target' },
  'DWLCj8VjW7F': { title: 'Pretzel Bites', stores: 'Walmart' },
  'DWK-p7rjduL': { title: 'Santiago Vegetarian Refried Pinto Beans', stores: 'Gordon Food Service' },
  'DWIViXcjRBS': { title: 'Crunchy Oat Flour Cookies Fudge Dipped', stores: 'Walmart' },
  'DWHeO85Ea3n': { title: 'Pillsbury Grands Biscuits', stores: 'Walmart' },
  'DWCtW0uDTie': { title: 'Swad Masa (Whole Grain)', stores: 'Patel Brothers' },
  'DWCtQ4QjUzc': { title: 'Birthday Cake Snack', stores: 'Aldi' },
  'DWAHkzjD5Mi': { title: 'Pillsbury Toaster Strudel', stores: 'Walmart' },
  'DV_odXqgJ7_': { title: 'Nong Ramyun Hot & Spicy Noodle Soup', stores: 'Amazon' },
  'DV_oaIRAIdl': { title: 'Flavor Originals Snacks', stores: 'Walmart' },
  'DV_OHucjbe8': { title: 'Frozen Pizza', stores: 'Walmart' },
  'DV-JnpsjaQ3': { title: 'Veggiit Crunchy Snack', stores: 'Target' },
  'DV9sMFhjXT9': { title: 'Cocktail Samosas Potato', stores: 'Patel Brothers' },
  'DVy0MuggI2_': { title: 'Thin Crunchy Honey Mustard Pretzel Snacks', stores: 'Kroger' },
  'DVy0IRDgFMX': { title: 'Frozen Cheese Pizza', stores: 'Walmart' },
  'DVy0GugAPR6': { title: 'Thin Crunchy Pretzel Snacks', stores: 'Kroger' },
  'DVwoe1hjZ6t': { title: 'Cheese Cubes (21 oz)', stores: 'Heinens' },
  'DVvxhSADesa': { title: "Snyder's Pretzels", stores: 'Kroger' },
  'DVvxf7GDf4n': { title: 'Popcorn (Perfectly Seasoned)', stores: 'Kroger' },
  'DVt7GRqj4ha': { title: 'Protein Powder (50g, Clean Label)', stores: 'Walmart, Target, Fresh Thyme' },
  'DVpH6iijawb': { title: "Trader Joe's Korean Vegetable Seaweed Rice Roll", stores: "Trader Joe's" },
  'DVpFg0vjVin': { title: 'Kroger Brand Snacks', stores: 'Kroger' },
  'DVm-0xfjXA5': { title: "Sam's Club Snack Pack", stores: "Sam's Club" },
  'DVmdXu0jepg': { title: 'Indian Cocktail Samosas', stores: 'Patel Brothers' },
  'DVmdVZWDfPo': { title: 'Frozen Snack', stores: 'Walmart' },
  'DVmczm0DScZ': { title: 'Frozen Snack', stores: 'Meijer' },
  'DVmcv4iDerB': { title: "Benton's Stroopwafels (Dutch Cookies)", stores: 'Aldi' },
  'DVmcs9BjWWV': { title: 'Aldi Brand Snack', stores: 'Aldi' },
  'DVjwWPLj3eC': { title: 'Frozen Snack Pack', stores: 'Costco, Target, Kroger' },
  'DVjK3h7jVXk': { title: 'Kroger Snack', stores: 'Kroger' },
  'DVguht2Dak6': { title: 'Frozen Dumplings (soy sauce packet removable)', stores: 'Schnucks, Meijer, Kroger' },
  'DVepwvPjXIA': { title: 'Gas Station Snack', stores: 'Gas Station, Kroger, Meijer, Walmart' },
  'DVepsxCjX3E': { title: 'Snack Chips', stores: 'Kroger, Target' },
  'DVel5RODyeL': { title: 'Plant-Based Burger Patties', stores: 'Kroger, Target' },
  'DVcnA0uDQMl': { title: 'Boulder Batch Hot Honey Kettle Chips', stores: 'Target' },
  'DVccUukjSA6': { title: 'Frozen Snack', stores: 'Target, Kroger, Walmart' },
  'DVccS8gjb9i': { title: 'Fresh Thyme Snack', stores: 'Fresh Thyme, Whole Foods' },
  'DVccRW_DR9Y': { title: 'Kroger Snack', stores: 'Kroger' },
  'DVaKzd9jZaY': { title: 'Two-Bite Cinnamon Rolls (Honey Glaze)', stores: 'Fresh Thyme' },
  'DVaKuYHDbpP': { title: 'Frozen Snack', stores: 'Meijer' },
  'DVaKgy3jbd3': { title: 'Pillsbury Cookie Dough', stores: 'Walmart, Target, Kroger, Meijer' },
  'DVaKM1IjYNo': { title: 'Grain Free Tortilla Chips', stores: 'Walmart, Target, Kroger, Fresh Thyme' },
  'DVaJ5NYDUgM': { title: 'Less Sugar Chocolate Chunk Cookie Dough', stores: 'Target, Kroger, Walmart, Meijer' },
  'DVaJr-VDaeg': { title: 'Kroger Snack', stores: 'Kroger' },
  'DVaJflpjcke': { title: 'Pillsbury Toaster Strudel Pastries', stores: 'Target, Kroger, Walmart' },
  'DVZWESKj0-c': { title: 'Sambal Oelek Ground Fresh Chili Paste', stores: 'Kroger' },
  'DVY0FFLDfts': { title: 'Goodles Down the Hatch Creamy Hatch Chile Popper Mac', stores: 'Fresh Thyme, Target, Kroger' },
  'DVXn-NgDesC': { title: 'Kroger Hot Honey Snack', stores: 'Kroger' },
  'DVXi8PjDRhZ': { title: 'Fresh Thyme Snack', stores: 'Fresh Thyme, Whole Foods' },
  'DVXi45zDc3s': { title: 'Plant-Based Patties', stores: 'Target, Walmart, Kroger' },
  'DVXf86zjZ7Y': { title: 'Fruit Snack Pouches (10-pack)', stores: 'Kroger, Walmart, Target, Meijer' },
  'DVXft_MDezE': { title: 'Fresh Thyme Snack', stores: 'Fresh Thyme' },
  'DVXfroaDS6I': { title: "Hellmann's Plant-Based Mayo", stores: 'Kroger, Walmart, Target' },
  'DVW9R3bDaG2': { title: 'Nestle Toll House Chocolate Chip Cookie Sandwiches', stores: 'Kroger, Walmart, Target' },
  'DVW9M6hjXXy': { title: 'Fresh Thyme Snack', stores: 'Fresh Thyme' },
  'DVW8zWCjdYi': { title: 'Fresh Thyme/Whole Foods Snack', stores: 'Fresh Thyme, Whole Foods' },
  'DVW8wKaDanT': { title: "Rich's Cheddar Cheese Sauce", stores: 'Kroger, Walmart' },
  'DVW8n7kDXaX': { title: 'Sweet Chocolate Chunk Cookie Dough', stores: 'Target, Walmart, Kroger, Meijer' },
  'DVW8jSujeeL': { title: 'Kroger Hot Honey Snack', stores: 'Kroger' },
  'DVW8bTwjVkq': { title: 'Fresh Thyme Snack', stores: 'Fresh Thyme' },
  'DVW8DTTjXav': { title: 'Raw Cakes (Plant-Based)', stores: 'Fresh Thyme, Whole Foods' },
  'DVVIcFHDTFQ': { title: 'Organic Snack', stores: 'Fresh Thyme, Whole Foods' },
  'DVUz9m4DXkW': { title: 'Ekadashi Friendly Snack', stores: 'Fresh Thyme, Whole Foods' },
  'DVUz5ssjRXB': { title: 'Grain Free Tortilla Chips', stores: 'Target, Kroger, Walmart, Fresh Thyme' },
  'DVUz0OYDdQi': { title: 'Fresh Thyme/Whole Foods Snack', stores: 'Fresh Thyme, Whole Foods' },
  'DVUzu2JjZi2': { title: 'Aldi Snack', stores: 'Aldi' },
  'DVUzfl-jTff': { title: 'Fresh Thyme Snack', stores: 'Fresh Thyme' },
  'DVT2rkCDW_W': { title: 'Sensitive Marinara Sauce (No Onion, No Garlic)', stores: 'Kroger, Walmart, Meijer' },
  'DVT2gVBjWX8': { title: 'Salted Caramel Chocolate Cookie Dough', stores: 'Kroger, Walmart, Target' },
  'DVT19bMDWBg': { title: 'Organic Snack', stores: 'Fresh Thyme, Whole Foods' },
  'DVT1679DZEu': { title: 'Frozen Snack', stores: 'Kroger, Walmart, Target, Meijer' },
  'DVT14y7DSIy': { title: 'Frozen Snack', stores: 'Target, Walmart, Kroger, Meijer' },
  'DVSnBGRjXRI': { title: 'Organic Snack', stores: 'Fresh Thyme, Whole Foods' },
  'DVSPiabDceP': { title: 'Organic Snack', stores: 'Fresh Thyme, Whole Foods' },
  'DVSPfCrjVzZ': { title: 'Simple Mills Sweet Thins Chocolate Brownie', stores: 'Target' },
  'DVR2tqrjdas': { title: 'Multi-Store Snack', stores: 'Target, Walmart, Kroger, Meijer, Fresh Thyme, Whole Foods' },
  'DVR17eiDQZ1': { title: 'Simple Mills Almond Flour Chocolate Chip Cookies', stores: 'Kroger, Target' },
  'DVR0k5zjZWb': { title: 'Ekadashi Friendly Snack', stores: 'Fresh Thyme' },
  'DVRqwrOj65q': { title: 'Ekadashi Friendly Snack', stores: 'Target, Kroger, Walmart' },
  'DVRLXqwDRCR': { title: 'Aldi Snack', stores: 'Aldi' },
  'DVRLUYODciK': { title: 'Frozen Snack', stores: 'Kroger, Walmart, Target' },
  'DVP8NKVjdGm': { title: 'Uncommon Candy Soft & Chewy', stores: 'Target' },
  'DVPTRR4jVY2': { title: 'Kroger Snack', stores: 'Kroger' },
  'DVPTOOtjU-7': { title: 'Aldi Stone Ground Mustard', stores: 'Aldi' },
  'DVNO_JwDRn3': { title: 'Aldi Snack', stores: 'Aldi' },
  'DVM18-sDYpv': { title: 'Kroger Chocolate Chocolate Chip Soft Cookie', stores: 'Kroger' },
  'DVM17mBjRxl': { title: 'Meijer Snack', stores: 'Meijer' },
  'DVL7ncQDSwl': { title: 'Snack Pack', stores: 'Walmart, Target, Walgreens, Kroger' },
};

const products: any[] = [];

for (const post of posts) {
  const info = productMap[post.shortcode];
  if (!info) continue;
  // Skip generic/unidentified entries
  if (info.title.includes('Snack') && !info.title.includes('Fruit Snack') &&
      !info.title.includes('Pretzel Snack') && info.title.split(' ').length <= 3) continue;

  products.push({
    id: post.shortcode,
    title: info.title,
    price: '',
    ingredients: undefined,
    productUrl: post.postUrl,
    imageUrl: post.imageUrl,
    images: post.images || [post.imageUrl],
    source: 'NoOgEatz',
    stores: info.stores,
    date: post.date,
    scannedAt: new Date().toISOString(),
  });
}

const results = {
  source: 'NoOgEatz',
  scannedAt: new Date().toISOString(),
  suitable: products,
  unsuitable: [] as any[],
  noIngredients: [] as any[],
};

console.log(`Extracted ${products.length} products\n`);
for (const p of products) {
  console.log(`  ${p.title} (${p.stores})`);
}

const dateStr = new Date().toISOString().split('T')[0];
const outFile = `noogeatz-${dateStr}.json`;
const outPath = path.join(DATA_DIR, outFile);
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(`\nSaved to: ${outPath}`);
