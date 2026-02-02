import express from 'express';
import * as fs from 'fs';
import * as path from 'path';

const app = express();
app.use(express.json());
const PORT = 3000;

const DATA_DIR = path.join(__dirname, '..', 'data');
const WEB_DIR = path.join(__dirname, '..', 'web');

// Serve static files (no caching in dev)
app.use(express.static(WEB_DIR, { etag: false, lastModified: false }));
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Normalize product data from different sources
function normalizeProduct(product: any, source: string) {
  return {
    id: product.id || product.productId || product.slug || 'unknown',
    title: product.title || 'Unknown Product',
    brand: product.brand || product.vendor,
    price: product.price,
    ingredients: product.ingredients,
    productUrl: product.productUrl,
    imageUrl: product.imageUrl || (product.images && product.images[0]),
    source: product.source || source,
    analysis: product.analysis,
  };
}

// API endpoint to get products
app.get('/api/products', (req, res) => {
  try {
    // Find the most recent data file
    const files = fs.readdirSync(DATA_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length === 0) {
      return res.json({ featured: [], suitable: [], unsuitable: [], noIngredients: [], summary: {} });
    }

    // Combine all data files
    const allByCategory: Record<string, any[]> = {
      featured: [],
      suitable: [],
      unsuitable: [],
      noIngredients: [],
    };

    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
      // Determine source from filename
      let source = 'Other';
      if (file.startsWith('sayweee')) source = 'Sayweee';
      else if (file.startsWith('lkk')) source = 'LKK';
      else if (file.startsWith('hmart')) source = 'H Mart';
      else if (file.startsWith('mexican')) source = 'Mexican';

      for (const category of Object.keys(allByCategory)) {
        if (data[category]) {
          const normalized = data[category].map((p: any) => normalizeProduct(p, source));
          allByCategory[category] = allByCategory[category].concat(normalized);
        }
      }
    }

    // Remove duplicates by product ID + source per category
    for (const category of Object.keys(allByCategory)) {
      const seen = new Set();
      allByCategory[category] = allByCategory[category].filter(p => {
        const key = `${p.source}-${p.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    res.json({
      ...allByCategory,
      summary: {
        featured: allByCategory.featured.length,
        suitable: allByCategory.suitable.length,
        unsuitable: allByCategory.unsuitable.length,
        noIngredients: allByCategory.noIngredients.length,
      }
    });
  } catch (error) {
    console.error('Error loading data:', error);
    res.status(500).json({ error: 'Failed to load data' });
  }
});

// API endpoint to list data files
app.get('/api/files', (req, res) => {
  try {
    const files = fs.readdirSync(DATA_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
        return {
          filename: f,
          collection: data.collection,
          scannedAt: data.scannedAt,
          summary: data.summary,
        };
      });
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// API endpoint to update a product's image URL
app.post('/api/products/update-image', (req, res) => {
  try {
    const { productId, source, imageUrl } = req.body;

    if (!productId || !source || !imageUrl) {
      return res.status(400).json({ error: 'productId, source, and imageUrl are required' });
    }

    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(DATA_DIR, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const fileSource = file.startsWith('sayweee') ? 'Sayweee' : file.startsWith('lkk') ? 'LKK' : 'H Mart';

      if (fileSource !== source) continue;

      let modified = false;

      for (const category of ['featured', 'suitable', 'unsuitable', 'noIngredients']) {
        if (!data[category]) continue;

        const product = data[category].find((p: any) =>
          String(p.id || p.productId || p.slug) === String(productId)
        );

        if (product) {
          if (!product.images) product.images = [];
          if (!product.images.includes(imageUrl)) {
            product.images.unshift(imageUrl);
          }
          product.imageUrl = imageUrl;
          modified = true;
          break;
        }
      }

      if (modified) {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return res.json({ success: true, message: 'Image updated' });
      }
    }

    res.status(404).json({ error: 'Product not found' });
  } catch (error) {
    console.error('Error updating image:', error);
    res.status(500).json({ error: 'Failed to update image' });
  }
});

// API endpoint to move products between categories
app.post('/api/products/move', (req, res) => {
  try {
    const { changes } = req.body;

    if (!changes || !Array.isArray(changes) || changes.length === 0) {
      return res.status(400).json({ error: 'No changes provided' });
    }

    // Read all JSON files
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(DATA_DIR, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const source = file.startsWith('sayweee') ? 'Sayweee' : file.startsWith('lkk') ? 'LKK' : 'H Mart';

      let modified = false;

      for (const change of changes) {
        // Only process changes for this source
        if (change.source !== source) continue;

        const { productId, fromCategory, toCategory } = change;

        // Find product in fromCategory
        const fromArray = data[fromCategory];
        if (!fromArray) continue;

        const productIndex = fromArray.findIndex((p: any) =>
          (p.id || p.productId || p.slug) === productId ||
          String(p.id || p.productId || p.slug) === String(productId)
        );

        if (productIndex === -1) continue;

        // Move the product
        const [product] = fromArray.splice(productIndex, 1);

        // Initialize target array if needed
        if (!data[toCategory]) {
          data[toCategory] = [];
        }

        data[toCategory].push(product);
        modified = true;

        // Update summary counts
        if (data.summary) {
          data.summary[fromCategory] = (data.summary[fromCategory] || 1) - 1;
          data.summary[toCategory] = (data.summary[toCategory] || 0) + 1;
        }
      }

      // Write back if modified
      if (modified) {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      }
    }

    res.json({ success: true, moved: changes.length });
  } catch (error) {
    console.error('Error moving products:', error);
    res.status(500).json({ error: 'Failed to move products' });
  }
});

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  Food Finder Web Server`);
  console.log(`========================================`);
  console.log(`\n  Open in browser: http://localhost:${PORT}`);
  console.log(`\n  API endpoints:`);
  console.log(`    GET /api/products - Get all products`);
  console.log(`    GET /api/files    - List data files`);
  console.log(`\n========================================\n`);
});
