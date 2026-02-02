# Food Finder

A tool that scans Sayweee.com for vegetarian food products that don't contain eggs, onions, garlic, scallions, leeks, or shallots.

## Features

- **OCR-based ingredient extraction** - Uses Tesseract.js to read ingredients from product images
- **Quality scoring** - Distinguishes real ingredient lists from nutrition labels
- **Category scanning** - Scan entire product categories (seasoning, snacks, etc.)
- **Store filtering** - Filter by store origin (Japanese, Korean, Chinese, etc.)
- **Web UI** - View and browse suitable products

## Installation

```bash
npm install
```

## Usage

### Scan by search term
```bash
npm run sayweee:scan -- sauce
```

### Scan entire category
```bash
npm run sayweee:scan -- --category seasoning
```

### Scan with store filter
```bash
# Japanese store products only
npm run sayweee:scan -- --store japanese

# Seasoning category, Korean store only
npm run sayweee:scan -- --category seasoning --store korean
```

### Limit results
```bash
# Stop after finding 10 suitable items
npm run sayweee:scan -- --category seasoning --limit 10
```

### Available options

| Flag | Description |
|------|-------------|
| `--category <name>` | Scan a category (seasoning, snack, instant, beverages, bakery, dairy, canned, dried) |
| `--store <name>` | Filter by store (chinese, japanese, korean, vietnamese, indian, thai, filipino) |
| `--limit <n>` | Stop after finding n suitable items |
| `--browser` | Use Puppeteer browser mode (experimental) |

**Note:** The `--store` filter works with the store's curated landing page (~70-85 products). For comprehensive scanning, use `--category` without `--store` to get all products (~900 for seasoning).

### Start web UI
```bash
npm run serve
```
Then open http://localhost:3000

### Export data for static deployment
```bash
npm run export
```
Merges all data files into `data/products.json` with only `featured` and `suitable` products, normalized and deduplicated.

## Static Deployment (Docker)

A read-only version of Food Finder lives on the `deploy` branch. It serves only the Featured and Suitable tabs via nginx in Docker — no backend, no editing.

### Deploy branch structure

```
deploy/
├── index.html          # Static frontend (read-only)
├── data/
│   └── products.json   # Pre-built data snapshot
├── nginx.conf          # nginx config
├── Dockerfile          # nginx:alpine container
└── .dockerignore
```

### Build and run

```bash
git checkout deploy
docker build -t food-finder .
docker run -p 8080:80 food-finder
```

Then open http://localhost:8080

### Update deployed data

When you scan new products on main and want to update the deployment:

```bash
# 1. On main, regenerate the data snapshot
git checkout main
npm run export

# 2. Copy to deploy branch
cp data/products.json /tmp/products.json
git checkout deploy
cp /tmp/products.json data/products.json

# 3. Commit and rebuild
git add data/products.json
git commit -m "Update data"
docker build -t food-finder .
```

## How it works

1. Fetches product pages from Sayweee.com
2. Extracts ingredients from HTML or uses OCR on product images
3. Analyzes ingredients for restricted items:
   - **Eggs**: egg, albumin, lysozyme, mayonnaise
   - **Onions**: onion, onion powder, shallot
   - **Garlic**: garlic, garlic powder
   - **Scallions**: scallion, green onion, spring onion
   - **Leeks**: leek
4. Checks for non-vegetarian ingredients (meat, fish, gelatin, etc.)
5. Saves results to `data/` directory

## Project Structure

```
food_finder/
├── src/
│   ├── sayweee-scan.ts      # Main scanner
│   ├── server.ts            # Web server
│   ├── export-data.ts       # Data export for static deployment
│   └── services/
│       ├── ocr/extractor.ts # OCR processing
│       └── sayweee/client.ts # Sayweee API client
├── web/
│   └── index.html           # Web UI
├── data/                    # Scan results
└── package.json
```

## License

MIT
