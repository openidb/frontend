/**
 * Fetch sunnah.com HTML pages and save to local cache
 *
 * Usage:
 *   bun run scripts/fetch-sunnah-html.ts --collection=malik --cache-dir=/Volumes/KIOXIA/sunnah-html
 */

import * as fs from "fs";
import * as path from "path";

const args = process.argv.slice(2);
const collectionArg = args.find((arg) => arg.startsWith("--collection="))?.split("=")[1];
const cacheDirArg = args.find((arg) => arg.startsWith("--cache-dir="))?.split("=")[1];
const delayArg = args.find((arg) => arg.startsWith("--delay="))?.split("=")[1];
const startBookArg = args.find((arg) => arg.startsWith("--start-book="))?.split("=")[1];

if (!collectionArg || !cacheDirArg) {
  console.error("Usage: bun run scripts/fetch-sunnah-html.ts --collection=malik --cache-dir=/path/to/cache");
  process.exit(1);
}

const COLLECTION = collectionArg;
const CACHE_DIR = cacheDirArg;
const DELAY_MS = delayArg ? parseInt(delayArg, 10) : 500;
const START_BOOK = startBookArg ? parseInt(startBookArg, 10) : 1;

// Collection book counts (approximate max book numbers)
const COLLECTION_BOOKS: Record<string, number> = {
  malik: 61,
  bulugh: 16,
  darimi: 23,
  hisn: 1, // hisn is all in index page
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return null;
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("FETCH SUNNAH.COM HTML PAGES");
  console.log("=".repeat(60));
  console.log(`Collection: ${COLLECTION}`);
  console.log(`Cache directory: ${CACHE_DIR}`);
  console.log(`Delay: ${DELAY_MS}ms`);
  console.log(`Starting from book: ${START_BOOK}`);
  console.log("=".repeat(60));
  console.log();

  const maxBooks = COLLECTION_BOOKS[COLLECTION];
  if (!maxBooks) {
    console.error(`Unknown collection: ${COLLECTION}`);
    console.error(`Known collections: ${Object.keys(COLLECTION_BOOKS).join(", ")}`);
    process.exit(1);
  }

  // Create collection directory
  const collectionDir = path.join(CACHE_DIR, COLLECTION);
  if (!fs.existsSync(collectionDir)) {
    fs.mkdirSync(collectionDir, { recursive: true });
  }

  let fetched = 0;
  let skipped = 0;
  let errors = 0;

  for (let bookNum = START_BOOK; bookNum <= maxBooks; bookNum++) {
    const filename = `${bookNum}.html`;
    const filepath = path.join(collectionDir, filename);

    // Skip if already exists
    if (fs.existsSync(filepath)) {
      const stats = fs.statSync(filepath);
      if (stats.size > 1000) {
        console.log(`[${bookNum}/${maxBooks}] Skipping ${filename} (already exists, ${stats.size} bytes)`);
        skipped++;
        continue;
      }
    }

    const url = `https://sunnah.com/${COLLECTION}/${bookNum}`;
    process.stdout.write(`[${bookNum}/${maxBooks}] Fetching ${url}...`);

    const html = await fetchPage(url);

    if (html) {
      fs.writeFileSync(filepath, html, "utf-8");
      console.log(` saved (${html.length} bytes)`);
      fetched++;
    } else {
      console.log(` not found or error`);
      errors++;
    }

    // Rate limiting
    if (bookNum < maxBooks) {
      await sleep(DELAY_MS);
    }
  }

  console.log();
  console.log("=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Fetched: ${fetched}`);
  console.log(`Skipped (cached): ${skipped}`);
  console.log(`Errors/Not found: ${errors}`);
  console.log("=".repeat(60));
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
