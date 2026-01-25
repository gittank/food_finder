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

### Start web UI
```bash
npm run server
```
Then open http://localhost:3000

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
│   └── services/
│       ├── ocr/extractor.ts # OCR processing
│       └── sayweee/client.ts # Sayweee API client
├── web/
│   └── index.html           # Web UI
├── data/                    # Scan results (gitignored)
└── package.json
```

## License

MIT
