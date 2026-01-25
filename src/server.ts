import express from 'express';
import * as fs from 'fs';
import * as path from 'path';

const app = express();
const PORT = 3000;

const DATA_DIR = path.join(__dirname, '..', 'data');
const WEB_DIR = path.join(__dirname, '..', 'web');

// Serve static files
app.use(express.static(WEB_DIR));

// Normalize product data from different sources
function normalizeProduct(product: any, source: string) {
  return {
    id: product.id || product.productId || 'unknown',
    title: product.title || 'Unknown Product',
    brand: product.brand || product.vendor,
    price: product.price,
    ingredients: product.ingredients,
    productUrl: product.productUrl,
    imageUrl: product.imageUrl || (product.images && product.images[0]),
    source,
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
      return res.json({ suitable: [], unsuitable: [], summary: {} });
    }

    // Combine all data files
    let allSuitable: any[] = [];
    let allUnsuitable: any[] = [];

    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
      // Determine source from filename
      const source = file.startsWith('sayweee') ? 'Sayweee' : 'H Mart';

      if (data.suitable) {
        const normalized = data.suitable.map((p: any) => normalizeProduct(p, source));
        allSuitable = allSuitable.concat(normalized);
      }
      if (data.unsuitable) {
        const normalized = data.unsuitable.map((p: any) => normalizeProduct(p, source));
        allUnsuitable = allUnsuitable.concat(normalized);
      }
    }

    // Remove duplicates by product ID + source
    const seenKeys = new Set();
    allSuitable = allSuitable.filter(p => {
      const key = `${p.source}-${p.id}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });

    res.json({
      suitable: allSuitable,
      unsuitable: allUnsuitable,
      summary: {
        suitable: allSuitable.length,
        unsuitable: allUnsuitable.length,
        bySource: {
          hmart: allSuitable.filter(p => p.source === 'H Mart').length,
          sayweee: allSuitable.filter(p => p.source === 'Sayweee').length,
        }
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
