const axios = require("axios");
const fs = require("fs");

const filepath = "data/mexican-products-2026-02-01.json";
const data = JSON.parse(fs.readFileSync(filepath, "utf-8"));

async function getOgImage(url) {
  try {
    const resp = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
      timeout: 15000,
    });
    const html = resp.data;
    // og:image
    const ogMatch = html.match(/og:image"[^>]*content="([^"]+)"/i);
    if (ogMatch) return ogMatch[1];
    // Shopify CDN image
    const shopifyMatch = html.match(/(https?:\/\/[^"]*cdn\.shopify\.com\/[^"]*\.(?:png|jpg|webp))/i);
    if (shopifyMatch) return shopifyMatch[1];
    return null;
  } catch (e) {
    console.log("  Error:", e.message);
    return null;
  }
}

async function main() {
  let fixed = 0;
  for (const bucket of ["suitable", "unsuitable", "noIngredients"]) {
    if (!data[bucket]) continue;
    for (const p of data[bucket]) {
      if (p.images && p.images.length > 0) continue;
      if (!p.productUrl) continue;

      process.stdout.write(p.title.substring(0, 45).padEnd(47));
      const img = await getOgImage(p.productUrl);
      if (img) {
        p.images = [img];
        fixed++;
        console.log("OK:", img.substring(0, 60));
      } else {
        console.log("NO IMAGE");
      }
      await new Promise(r => setTimeout(r, 200));
    }
  }
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log("\nFixed", fixed, "products");
}

main();
