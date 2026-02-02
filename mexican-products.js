const fs = require("fs");
const path = require("path");

const DATA_DIR = "data";

const RESTRICTED = {
  eggs: ['egg', 'eggs', 'egg white', 'egg yolk', 'albumin', 'lysozyme', 'mayonnaise', 'mayo'],
  onions: ['onion', 'onions', 'onion powder', 'dried onion', 'cipollini', 'shallot', 'shallots'],
  garlic: ['garlic', 'garlic powder', 'minced garlic', 'roasted garlic', 'dehydrated garlic'],
  scallions: ['scallion', 'scallions', 'green onion', 'green onions', 'spring onion', 'spring onions'],
  leeks: ['leek', 'leeks'],
};
const NON_VEG = ['meat','beef','pork','chicken','turkey','lamb','duck','bacon','ham','fish','salmon','tuna','shrimp','prawn','crab','lobster','oyster','anchovy','anchovies','sardine','squid','octopus','clam','mussel','gelatin','lard','tallow','bone','broth'];

function analyze(text) {
  const n = text.toLowerCase();
  const restricted = [];
  for (const [cat, terms] of Object.entries(RESTRICTED)) {
    for (const t of terms) { if (n.includes(t)) { restricted.push(cat); break; } }
  }
  const nonVeg = NON_VEG.filter(t => n.includes(t));
  return {
    isVegetarian: nonVeg.length === 0,
    hasRestrictedIngredients: restricted.length > 0,
    restrictedFound: restricted,
    nonVegFound: nonVeg,
  };
}

const products = [
  // ═══ XOCHITL ═══
  { title: "Xochitl Sea Salt Tortilla Chips", source: "Xochitl", productUrl: "https://www.xochitl.com/products/sea-salt-corn-chips", imageUrl: "https://www.xochitl.com/cdn/shop/files/SeaSalt12oz-Sidecopy.webp", price: "$10.00", ingredients: "White corn, organic palm olein oil, water, lime, sea salt." },
  { title: "Xochitl Organic Blue Tortilla Chips", source: "Xochitl", productUrl: "https://www.xochitl.com/products/organic-blue-corn-chips", imageUrl: "https://www.xochitl.com/cdn/shop/files/OrganicBlueCorn12oz-Sidecopy.webp", price: "$10.00", ingredients: "Organic blue corn, organic palm olein oil, water, lime, sea salt." },
  { title: "Xochitl Organic White Tortilla Chips", source: "Xochitl", productUrl: "https://www.xochitl.com/products/organic-white-corn-chips", imageUrl: "https://www.xochitl.com/cdn/shop/files/OrganicWhiteCorn12oz-Sidecopy.webp", price: "$10.00", ingredients: "Organic white corn, organic palm olein oil, water, lime, sea salt." },
  { title: "Xochitl No-Salt Tortilla Chips", source: "Xochitl", productUrl: "https://www.xochitl.com/products/no-salt-tortilla-chips", imageUrl: "https://www.xochitl.com/cdn/shop/files/NoSalt12oz-Sidecopy.webp", price: "$10.00", ingredients: "White corn, organic palm olein oil, water, lime." },
  { title: "Xochitl The Dipper Chips", source: "Xochitl", productUrl: "https://www.xochitl.com/products/the-dipper-chips", imageUrl: "https://www.xochitl.com/cdn/shop/files/Dipper16oz-Sidecopy.webp", price: "$10.00", ingredients: "White corn, organic palm olein oil, water, lime, sea salt." },
  { title: "Xochitl Cholula Hot Sauce Tortilla Chips", source: "Xochitl", productUrl: "https://www.xochitl.com/products/cholula-hot-sauce-tortilla-chips", imageUrl: "https://www.xochitl.com/cdn/shop/files/Cholula11oz-Sidecopy.webp", price: "$10.00", ingredients: "White corn, organic palm olein oil, water, lime, maltodextrin (corn, rice), salt, garlic powder, onion powder, vinegar solids, tomato powder, spices (including chili pepper), cayenne pepper sauce (aged cayenne red pepper, vinegar, salt, garlic), red bell pepper, citric acid, yeast extract, extractives of paprika, acetic acid, natural flavor." },
  { title: "Xochitl Spicy Lime Tortilla Chips", source: "Xochitl", productUrl: "https://www.xochitl.com/products/spicy-lime-chips", imageUrl: "https://www.xochitl.com/cdn/shop/files/SpicyLime12oz-Sidecopy.webp", price: "$10.00", ingredients: "Corn, water, organic palm olein oil, lime, sea salt, black pepper, red pepper, citric acid, garlic." },
  { title: "Xochitl Chipotle Salsa", source: "Xochitl", productUrl: "https://www.xochitl.com/products/chipotle-salsa", imageUrl: "https://www.xochitl.com/cdn/shop/files/chipotle3_e031fc0f-ca6a-4302-bb16-2aab5b0827df.webp", price: "$10.00", ingredients: "Tomatoes, water, tomato puree, garlic, sea salt, lime juice, extra virgin cold press olive oil, dehydrated chipotle pepper." },
  { title: "Xochitl Asada Verde Salsa", source: "Xochitl", productUrl: "https://www.xochitl.com/products/asada-verde-salsa", imageUrl: "https://www.xochitl.com/cdn/shop/files/asada-verde3.webp", price: "$10.00", ingredients: "Tomatillos, water, fire-roasted onion, jalapeño pepper, garlic, sea salt, lime juice, cornstarch, dehydrated cilantro." },
  { title: "Xochitl Stone Ground Salsa", source: "Xochitl", productUrl: "https://www.xochitl.com/products/stone-ground-salsa", imageUrl: "https://www.xochitl.com/cdn/shop/files/stone-ground3.webp", price: "$10.00", ingredients: "Fire-roasted tomatoes, water, jalapeño peppers, lime juice, chile de arbol, sea salt." },

  // ═══ FODY FOODS (Low FODMAP - no garlic/onion) ═══
  { title: "Fody Mild Salsa", source: "Fody Foods", productUrl: "https://www.fodyfoods.com/products/low-fodmap-mild-salsa", price: "$7.99", ingredients: "Diced tomatoes, tomato puree (water, tomato paste), jalapeño peppers, apple cider vinegar, sea salt, cilantro, lime juice concentrate, cumin." },
  { title: "Fody Medium Salsa", source: "Fody Foods", productUrl: "https://www.fodyfoods.com/products/low-fodmap-salsa-medium", price: "$7.99", ingredients: "Diced tomatoes, tomato puree (water, tomato paste), jalapeño peppers, cilantro, apple cider vinegar, sea salt, lime juice concentrate, cumin." },
  { title: "Fody Salsa Verde", source: "Fody Foods", productUrl: "https://www.fodyfoods.com/products/low-fodmap-salsa-verde", price: "$7.99", ingredients: "Roasted green tomatoes, green bell peppers, jalapeño peppers, tomatillos, water, roasted tomatoes, lime juice concentrate, cilantro, sea salt, black pepper, cumin." },
  { title: "Fody Marinara Pasta Sauce", source: "Fody Foods", productUrl: "https://www.fodyfoods.com/products/low-fodmap-marinara-sauce", price: "$8.99", ingredients: "Chopped tomatoes, tomato paste, extra virgin olive oil, carrot puree, celery puree, sea salt, basil." },
  { title: "Fody Tomato Basil Pasta Sauce", source: "Fody Foods", productUrl: "https://www.fodyfoods.com/products/low-fodmap-tomato-basil-sauce", price: "$8.99", ingredients: "Chopped tomatoes, extra virgin olive oil, carrot puree, basil, sea salt." },
  { title: "Fody Spicy Marinara (Arrabbiata) Pasta Sauce", source: "Fody Foods", productUrl: "https://www.fodyfoods.com/products/low-fodmap-arrabbiata-sauce", price: "$8.99", ingredients: "Chopped tomatoes, extra virgin olive oil, sea salt, crushed red pepper." },
  { title: "Fody Vegan Bolognese Pasta Sauce", source: "Fody Foods", productUrl: "https://www.fodyfoods.com/products/low-fodmap-vegan-bolognese-pasta-sauce", price: "$8.99", ingredients: "Chopped tomatoes, extra virgin olive oil, kabocha squash, carrot puree, shiitake mushrooms, walnuts, dehydrated carrots, sea salt." },
  { title: "Fody Original Ketchup", source: "Fody Foods", productUrl: "https://www.fodyfoods.com/products/original-ketchup", price: "$7.49", ingredients: "Tomato puree (water, tomato paste), organic cane sugar, distilled vinegar, salt, black pepper, clove powder, chili powder, allspice powder, cinnamon powder." },
  { title: "Fody Original BBQ Sauce", source: "Fody Foods", productUrl: "https://www.fodyfoods.com/products/low-fodmap-bbq-sauce", price: "$6.99", ingredients: "Tomato puree (tomato paste, water), apple cider vinegar, raw cane sugar, molasses, organic horseradish, sea salt, natural smoke flavor, black pepper." },
  { title: "Fody Taco Sauce", source: "Fody Foods", productUrl: "https://www.fodyfoods.com/products/low-fodmap-taco-sauce", price: "$7.49", ingredients: "Water, tomato paste, distilled vinegar, cumin, himalayan pink salt, avocado oil, arrowroot powder, paprika, organic raw cane sugar, ancho powder." },
  { title: "Fody Green Enchilada Sauce", source: "Fody Foods", productUrl: "https://www.fodyfoods.com/products/low-fodmap-green-enchilada-sauce", price: "$7.49", ingredients: "Tomatillos, water, anaheim peppers, distilled vinegar, avocado oil, arrowroot powder, roasted poblano puree, himalayan pink salt, cumin, coriander, black pepper, cilantro." },
  { title: "Fody No Soy Teriyaki Sauce & Marinade", source: "Fody Foods", productUrl: "https://www.fodyfoods.com/products/low-fodmap-teriyaki-sauce-marinade", price: "$7.49", ingredients: "Water, gluten & soy free tamari sauce (water, pea, salt, pea protein, alcohol), rice wine vinegar, organic dark sugar, arrowroot powder, toasted sesame oil, pineapple juice concentrate, tamarind, ginger." },
  { title: "Fody Sesame Ginger Sauce & Marinade", source: "Fody Foods", productUrl: "https://www.fodyfoods.com/products/low-fodmap-sesame-ginger-sauce-marinade", price: "$7.49", ingredients: "Water, distilled vinegar, toasted sesame oil, gluten & soy free tamari sauce (water, pea, salt, pea protein, alcohol), organic raw cane sugar, arrowroot powder, avocado oil, ginger, himalayan pink salt, orange juice concentrate, tamarind." },
  { title: "Fody Vegan Caesar Salad Dressing", source: "Fody Foods", productUrl: "https://www.fodyfoods.com/products/low-fodmap-caesar-salad-dressing", price: "$7.99", ingredients: null },
  { title: "Fody Balsamic Vinaigrette", source: "Fody Foods", productUrl: "https://www.fodyfoods.com/products/low-fodmap-balsamic-vinaigrette", price: "$7.99", ingredients: null },
  { title: "Fody Maple Dijon Salad Dressing", source: "Fody Foods", productUrl: "https://www.fodyfoods.com/products/low-fodmap-maple-dijon-salad-dressing", price: "$7.99", ingredients: null },
  { title: "Fody Garden Herb Salad Dressing", source: "Fody Foods", productUrl: "https://www.fodyfoods.com/products/low-fodmap-garden-herb-salad-dressing", price: "$7.99", ingredients: null },
  { title: "Fody Garlic-Infused Olive Oil", source: "Fody Foods", productUrl: "https://www.fodyfoods.com/products/low-fodmap-garlic-infused-olive-oil", price: "$19.99", ingredients: null },
  { title: "Fody Shallot-Infused Olive Oil", source: "Fody Foods", productUrl: "https://www.fodyfoods.com/products/low-fodmap-shallot-infused-olive-oil", price: "$19.99", ingredients: null },
  { title: "Fody Chicken Soup Base", source: "Fody Foods", productUrl: "https://www.fodyfoods.com/products/low-fodmap-chicken-soup-base", price: "$8.99", ingredients: null },
  { title: "Fody Vegetable Soup Base", source: "Fody Foods", productUrl: "https://www.fodyfoods.com/products/low-fodmap-vegetable-soup-base", price: "$8.99", ingredients: null },

  // ═══ SAN JUAN SALSA ═══
  { title: "San Juan Traditional Salsa", source: "San Juan Salsa", productUrl: "https://sanjuansalsa.com/traditional-salsa", ingredients: "Tomatoes (peeled ground tomatoes, extra heavy tomato puree, salt), tomato juice (tomatoes, salt, ascorbic acid), onions, green bell peppers, garlic, parsley, cilantro, serrano peppers, spices, herbs, raw apple cider vinegar, sea salt." },
  { title: "San Juan Mild Salsa", source: "San Juan Salsa", productUrl: "https://sanjuansalsa.com/mild-salsa-1", ingredients: "Tomatoes (peeled ground tomatoes, extra heavy tomato puree, salt), tomato juice (tomatoes, salt, ascorbic acid), onions, green bell peppers, garlic, parsley, cilantro, serrano peppers, spices, herbs, raw apple cider vinegar, sea salt." },
  { title: "San Juan Medium Salsa", source: "San Juan Salsa", productUrl: "https://sanjuansalsa.com/medium-salsa", ingredients: "Tomatoes (peeled ground tomatoes, extra heavy tomato puree, salt), tomato juice (tomatoes, salt, ascorbic acid), onions, green bell peppers, garlic, serrano peppers, parsley, cilantro, spices, herbs, raw apple cider vinegar, sea salt." },
  { title: "San Juan Roasted Red Salsa (Men's Room)", source: "San Juan Salsa", productUrl: "https://sanjuansalsa.com/mens-room-roast-red-salsa", ingredients: null },
  { title: "San Juan Hot Salsa", source: "San Juan Salsa", productUrl: "https://sanjuansalsa.com/hot-salsa", ingredients: "Tomatoes (peeled ground tomatoes, extra heavy tomato puree, salt), tomato juice (tomatoes, salt, ascorbic acid), onions, green bell peppers, serrano peppers, garlic, parsley, cilantro, spices, herbs, raw apple cider vinegar, sea salt." },
  { title: "San Juan Verde Salsa", source: "San Juan Salsa", productUrl: "https://sanjuansalsa.com/verde-salsa", ingredients: null },
  { title: "San Juan Pineapple Mango Salsa", source: "San Juan Salsa", productUrl: "https://sanjuansalsa.com/pineapple-mango", ingredients: null },
  { title: "San Juan Afterburner Salsa", source: "San Juan Salsa", productUrl: "https://sanjuansalsa.com/afterburner-salsa", ingredients: null },
  { title: "San Juan Yellow Corn Round Tortilla Chips", source: "San Juan Salsa", productUrl: "https://sanjuansalsa.com/yellow-corn-rnd-chips", ingredients: null },
  { title: "San Juan White Corn Triangle Tortilla Chips", source: "San Juan Salsa", productUrl: "https://sanjuansalsa.com/yellow-corn-chips", ingredients: null },
];

const results = { suitable: [], unsuitable: [], noIngredients: [] };
const counts = { suitable: 0, unsuitable: 0, noIngredients: 0 };

for (const p of products) {
  const analysis = p.ingredients ? analyze(p.ingredients) : null;
  const entry = {
    title: p.title,
    images: p.imageUrl ? [p.imageUrl] : [],
    ingredients: p.ingredients || undefined,
    ingredientSource: p.ingredients ? "manufacturer" : undefined,
    price: p.price,
    productUrl: p.productUrl,
    source: p.source,
    scannedAt: new Date().toISOString(),
  };
  if (analysis) entry.analysis = analysis;

  let bucket;
  if (!analysis) {
    bucket = "noIngredients";
  } else if (analysis.isVegetarian && !analysis.hasRestrictedIngredients) {
    bucket = "suitable";
  } else {
    bucket = "unsuitable";
  }

  results[bucket].push(entry);
  counts[bucket]++;

  const reasons = analysis ? [...analysis.restrictedFound, ...analysis.nonVegFound].join(", ") || "clean" : "no ingredients";
  console.log(`${bucket.padEnd(14)} ${p.title.substring(0, 50).padEnd(52)} ${reasons}`);
}

const output = {
  source: "Mexican Products",
  query: "mexican-lookup",
  scannedAt: new Date().toISOString(),
  sourceUrls: [
    "https://www.xochitl.com/collections/shop-now",
    "https://www.fodyfoods.com/",
    "https://sanjuansalsa.com/all-products",
  ],
  ...results,
};

const outputFile = path.join(DATA_DIR, `mexican-products-${new Date().toISOString().split("T")[0]}.json`);
fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));

console.log(`\n${"=".repeat(60)}`);
console.log(`Suitable:     ${counts.suitable}`);
console.log(`Unsuitable:   ${counts.unsuitable}`);
console.log(`Needs review: ${counts.noIngredients}`);
console.log(`\nSaved to: ${outputFile}`);
