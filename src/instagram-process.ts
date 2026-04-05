import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'data');

// Read the Instagram data
const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('instagram-zero.oge'));
if (files.length === 0) {
  console.error('No Instagram data file found');
  process.exit(1);
}

const filepath = path.join(DATA_DIR, files[files.length - 1]);
const rawData = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
const posts = rawData.posts || [];

console.log(`\nProcessing ${posts.length} posts from @zero.oge\n`);

// Manually curated product names from captions (since captions are conversational)
const productMap: Record<string, string> = {
  'CS7ggBWLMQIyDZx7ZH01X03I4gT7jsER1Md4Uk0': "Arizona Pepper's Chipotle Habanero Pepper Sauce",
  'CS7eUOBrk-9XiuSEey110JYXPKN4I7NUUaYyLw0': 'Original Louisiana Hot Sauce',
  'CS7dklQLKiBsg7IHZes9bQkalqbVIFUpkNtNe40': 'Hello Kitty Tomato Basil Italian Pasta Sauce',
  'CS7daHtrsQbwUGR_FB69ovAbtIo3PbLb1ud7yU0': 'Classic Mac And Cheese Sauce',
  'CS7dHnpr4FFSlM9WyTIuTo6asu5MVdkculgAWs0': 'Crispy Crunchy Spicy Mochi Rice Nuggets (Trader Joe\'s)',
  'CO8I7MqjZCzkVk41eZvM1Dd_autWnxeiBMOREc0': 'Simply Eggless Plant-Based Egg',
  'CO8GTNGjJrzt8xE7f4JyWTa7ujazmt0vlI-dO80': 'Pirates Booty Aged White Cheddar Puffs',
  'CO8FOs6DE0u4bYO2Ni3pDQ8-LVEIEVvmCh1IkY0': "Chosen Foods Red Pepper Simmer Sauce",
  'CJls42Fj3zlsVN1sSbNemTFpMiCE-5tg4KNDDs0': "Gordo's Original Cheese Dip",
  'CCiyf-cDcLU6VKBNLlX9pkgsidSI6DtpMIR31A0': 'Pure Farmland Italian Style Meatballs & Breakfast Patties',
  'B4gS414jchxoEW72H2z03qR86u_FIhY4Nn3biQ0': 'Humble House Habanero & Aji Amarillo Hot Sauce',
  'B4VDygqDrU7J6zJWGUELGhb77mxjMAVVaKNgI40': 'Simply Organic Medium Enchilada Sauce',
  'B4Sqf39DbRg67pm1oR1awpNO47SUlmO5NVAAJU0': 'Nabisco Good Thins Salt & Vinegar Crisp & Thins',
  'B24GHdIjTo1sp6mCCiMhOc3C2-43c4LSvbbIpg0': "Daelmans Stroopwafels",
  'B0y_q8PDZCoFgKGWW8iqwd32rrtcnHMMT73foA0': 'Himalayan Pink Salt & Lime Seasoning',
  'B0q6LLfj9Bs7I24C5E2Jx1rwUZiVmojRrZ5Vuo0': 'Klondike Cookie Ice Cream Sandwich',
  'Bxcx-DllnCKr2dm59FFINmajZokFuCz65TPwdo0': "Hummustir Blazin' Habanero Hummus",
  'BuJ2CzqlKW7KOe38hA6r3jsnxMbCzvDBs-KNqM0': 'Pillsbury Mini Pies (Apple Cinnamon & Chocolate Lava)',
  'BuE8YguFGdldQe3xVOKee6n0TPpL7CF9c6Qa0E0': "Mike's Hot Honey",
  'BtRROJ3l4qNTXb5tadHnHrS9Oa2E_8yOwXC2ok0': 'Tres Latin Foods Bite Sized Pupusas',
  'BtOmm4Xnw_nutZjMFKG1Sqte6f7H8ASXKWnpdo0': "Rao's Sensitive Formula Marinara Sauce",
  'BqfQ4Lgn8k0H9IFyPrkWwEHiJw1LJ8Zgyjp6QU0': "Marie Callender's Fruit Pies (Apple, Berry, Peach, Cherry)",
  'BlbHmfOF7uYwtVuCGScMfmTwfLjgZvfE7KZcBg0': 'GH Snacks Rosemary Olive Oil Kettle Chips',
  'BlYcP_rFMmRmhOh-7Gv9oNZFjkBg2BGvKATXvc0': "M&M's Ice Cream Cookie Sandwich",
  'BjazdWpFz4ordXOxBocU09fWoojxah_3eUmSJ80': 'Siete Lime & Sea Salt Grain-Free Chips',
  'BjVTHJGFRcSAXCBSJKdMNG8eQl2LW_2oWoE8fs0': "Smucker's Marshmallow Topping",
  'BjI9rHFFlNU-jB5ECArpNnxD5aG_OkLau7flbw0': "Nellino's Pomodoro Pasta Sauce",
  'BjDNXA7FnLZf82hzFuJ2VzG_-33t6RsfmZpS_E0': 'Whole Foods Vegan Pesto',
  'Bh7IQlZl_viHDjdFNkPCNrzJz7Vyxwf3JZ26W40': 'Beyond Meat Brat Original & Sweet Italian Sausage',
  'BhztSjElPDdSGo2m7xx221TWbNw1XMpMJxhLy40': 'Veggie Straws Sea Salt',
  'BhuEtk3FTxpHwHfUKmGVmXd58I8VLZ80-dPxYQ0': 'Archer Farms Margherita Traditional Crust Pizza',
  'BhrWniXntvaivpOj2_cZOzuRgFJI7PuIuRjzlo0': 'Nature Valley Oats & Honey Crunchy Granola Bars',
  'Bhjc5oDlpx18cmaB2rOSPalrYVkyzN87ZB2knk0': "Zapp's Sweet Pimento Cream Cheese Chips",
  'BfJZ5wJHGANny1R6l-7tzJBkANMefWTPY73f800': 'V&V Supremo Queso Chihuahua Cheese',
  'BfGyggInRROxl9qA6fOZl6NS2NAxM2zKsU-5940': 'Cipriani Pesto Sauce',
  'Ba4R7mfHZOF90k4PcftDkOPSR6ssenkQbhCBCU0': 'Ortega Crispy Taco Toppers (Jalapeno)',
  'BaH6j0vnUdnZemsVsJ5Ikc26_OZe6Yicy-ol0Q0': 'Chex Mix Popped Sweet and Salty Snack',
  'BZ6cA1pnRX61uk3mDWyMbRqrTD03_uV5Ie0EVk0': 'Mission Queso Dip (Rennet-Free)',
  'BTH3rotjuSdwqpjWyFWW6bMEksZS8j3ggYiONY0': "Trader Joe's 3 Cheese Pizza (Organic)",
  'BTAYpG_DaNIIRRsdlDk4WzjXY0fx3Z8-aisH3Q0': "Trader Joe's Kettle Popped Sweet & Salty Popcorn Chips",
  'BS13BEHjXnIHUvPDvIeDYRvIWpzQWVzxf0aIPo0': "Campbell's Tomato Carrot Bisque",
  'BSwx-ngjzJMkZZceJknfzATTgHF21LbnzBOPc40': 'Lightlife Gimme Lean Breakfast Patties',
  'BODbLLqjg8qAtBLws6eDWQFK90XMdA0jeqfbLM0': "Sara Lee's Dutch Apple Pie",
  'BN-Qu5yjbCtUSsfDZz9AC4lKi-eWnqKbnwFVTk0': "S'mores Candy Bar",
  'BLjiH-9D9Yx2YrsrsuuHphIBWQG5x3zrZ5JPJ80': 'Hampton Creek Double Chocolate Espresso',
  'BI3J0b8jijbWGzDEYc844seBUWMGgIM2JJKKKg0': "Amy's Kitchen Broccoli & Cheddar Bake",
  'BIYWDPhBm01aeH6EWqGQM2w2z0ETHfrdE3LaEo0': 'The Cookie Dough Cafe',
  'BDzX39jQNBp-tXH1b-f3bvSrFFUpTKCXn4f7oU0': "Lenny & Larry's Complete Cookie (Vegan)",
  'BCL1A82wNFhkcEwuMxHUtK1tHA-6fGA2Jb3dZs0': 'Lightlife Tofu Pups (Vegan Hot Dogs)',
  'BBaYfnBwNOS_W4qtmXdQAOyDBxuAlyQz7ikEL80': "Ben & Jerry's Non-Dairy (PB & Cookies, Chunky Monkey, Fudge Brownie, Coffee Caramel)",
  'BA8fY_BQNN2cFf4SEC8JS6vWdQpZDkVT9EQDpw0': "Ling's Hot Sauce",
  '9_4AbWwNJAzWwI8n-JEHSzizNJAqAOWtxTK280': 'Lightlife Smart Deli Veggie Ham Slices',
  '7mDP0hwNKE-xU4x8FTHGV0B6ykAPLdDfYoMcQ0': 'Skittles (Gelatin-Free)',
  '7WmNBuwNH1i8_IuD5rFrnPRju7qwXc3xqV09Y0': 'IKEA Ketchup',
  '7WlR5dQNGIrUWPlqcd6wg7jCeBflPX9bzAsgM0': 'Progresso Vegetable Classics Lentil Soup',
  '7Wjd11wNCsBanZHxwV8t0UO-Z5TgGP-onn5a80': 'Dr. Oetker Funfoods Pasta & Pizza Sauce',
  '7WJWcZQNDM9nHz-qbYfp9ozEBLdAhQ5ESSeFw0': "Annie's Raspberry Vinaigrette",
  '7WHv3QwNP2s9TWNE-CpvJUz1x8paAtHg0PjBY0': 'Sargento Cheese (Rennet-Free)',
  '7WE3oOQNK78SG20uK4x-uu8ZNHoKtmz_AtFvg0': "Mott's Medleys Assorted Fruit Snacks",
  '7WENhMwNJxqssbNA_DPCt-UfHrpPSgs6oXWa40': "Rao's Sensitive Formula Marinara Sauce",
  '7WBT05QNEMdXzKvc65Noff6CbJ4iBzWL_6glA0': 'Cabot Cheese (Rennet-Free)',
};

// Extract stores from @mentions
function extractStores(caption: string): string[] {
  const storeMap: Record<string, string> = {
    walmart: 'Walmart', target: 'Target', costco: 'Costco', samsclub: "Sam's Club",
    wholefoods: 'Whole Foods', traderjoes: "Trader Joe's", publix: 'Publix',
    amazon: 'Amazon', walgreens: 'Walgreens', dollartree: 'Dollar Tree',
    worldmarket: 'World Market', foodlion: 'Food Lion', sprouts: 'Sprouts',
    earthfare: 'Earth Fare', heb: 'HEB', ikeausa: 'IKEA',
  };

  const stores: string[] = [];
  const mentionPattern = /@(\w+)/g;
  let match;
  while ((match = mentionPattern.exec(caption)) !== null) {
    const key = match[1].toLowerCase();
    if (storeMap[key]) {
      stores.push(storeMap[key]);
    }
  }
  return stores;
}

const products: any[] = [];

for (const post of posts) {
  const title = productMap[post.shortcode];
  if (!title) continue;

  const stores = extractStores(post.caption || '');

  products.push({
    id: post.shortcode,
    title,
    price: '',
    ingredients: undefined,
    productUrl: post.postUrl,
    imageUrl: post.imageUrl,
    images: post.images || [post.imageUrl],
    source: 'ZEROoge',
    stores: stores.length > 0 ? stores.join(', ') : undefined,
    date: post.date,
    scannedAt: new Date().toISOString(),
  });
}

// All products from this account are curated as onion/garlic/egg-free
const results = {
  source: 'ZEROoge',
  scannedAt: new Date().toISOString(),
  suitable: products,
  unsuitable: [] as any[],
  noIngredients: [] as any[],
};

console.log(`Extracted ${products.length} products\n`);
console.log('--- Products ---\n');
for (const p of products) {
  console.log(`  ${p.title}`);
  if (p.stores) console.log(`    Available at: ${p.stores}`);
}

const dateStr = new Date().toISOString().split('T')[0];
const outFile = `zerooge-${dateStr}.json`;
const outPath = path.join(DATA_DIR, outFile);
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(`\nSaved to: ${outPath}`);
console.log(`Total suitable: ${results.suitable.length}`);
