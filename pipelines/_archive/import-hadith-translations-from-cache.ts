/**
 * Import Hadith Translations from Local HTML Cache
 *
 * Parses sunnah.com HTML files from a local cache directory and imports
 * English translations into the database. Much faster than fetching from network.
 *
 * Usage:
 *   bun run scripts/import-hadith-translations-from-cache.ts --cache-dir=/Volumes/KIOXIA/sunnah-html [--collection=muslim] [--dry-run]
 *
 * Options:
 *   --cache-dir=PATH    Path to the sunnah.com HTML cache directory
 *   --collection=slug   Only process specific collection (e.g., muslim, malik)
 *   --dry-run           Show what would be imported without storing
 */

import "../env";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";
import { prisma } from "@web/lib/db";

// Parse command line arguments
const args = process.argv.slice(2);
const cacheDirArg = args.find((arg) => arg.startsWith("--cache-dir="))?.split("=")[1];
const collectionArg = args.find((arg) => arg.startsWith("--collection="))?.split("=")[1];
const dryRun = args.includes("--dry-run");

if (!cacheDirArg) {
  console.error("Error: --cache-dir is required");
  console.error("Usage: bun run scripts/import-hadith-translations-from-cache.ts --cache-dir=/path/to/cache");
  process.exit(1);
}

const CACHE_DIR = cacheDirArg;

interface HadithTranslation {
  collectionSlug: string;
  hadithNumber: string;
  bookNumber: number;
  englishText: string;
}

/**
 * Extract hadith number from reference URL like "/muslim:8a" or "/malik/1/5"
 */
function extractHadithNumber(href: string): string | null {
  // Format: /collection:number or /collection/book/number
  const colonMatch = href.match(/\/([^/:]+):(\d+[a-z]?)$/);
  if (colonMatch) {
    return colonMatch[2];
  }

  // Format: /collection/book/number (for malik, bulugh)
  const pathMatch = href.match(/\/([^/]+)\/(\d+)\/(\d+)$/);
  if (pathMatch) {
    return pathMatch[3];
  }

  return null;
}

/**
 * Extract hadith number from sharelink onclick like "share(this, '/malik/1/5')"
 */
function extractHadithNumberFromSharelink(onclick: string): string | null {
  // Extract URL from share(this, '/malik/1/5')
  const match = onclick.match(/share\(this,\s*'([^']+)'\)/);
  if (!match) return null;

  return extractHadithNumber(match[1]);
}

/**
 * Parse a single HTML file and extract all hadith translations
 */
function parseHtmlFile(
  htmlContent: string,
  collectionSlug: string,
  bookNumber: number
): HadithTranslation[] {
  const $ = cheerio.load(htmlContent);
  const translations: HadithTranslation[] = [];

  // Find all hadith containers - use actualHadithContainer which contains both
  // the text and the reference table
  $(".actualHadithContainer").each((_, container) => {
    const $container = $(container);

    // Get hadith number from reference link (inside the container but outside hadithTextContainers)
    let hadithNumber: string | null = null;

    // Method 1: Try reference link (most collections)
    const refLink = $container.find("table.hadith_reference a[href]").first();
    const href = refLink.attr("href");
    if (href) {
      hadithNumber = extractHadithNumber(href);
    }

    // Method 2: Try sharelink onclick (malik, bulugh)
    if (!hadithNumber) {
      const sharelink = $container.find(".sharelink[onclick]").first();
      const onclick = sharelink.attr("onclick");
      if (onclick) {
        hadithNumber = extractHadithNumberFromSharelink(onclick);
      }
    }

    if (!hadithNumber) return;

    // Extract English translation from hadithTextContainers
    const textContainer = $container.find(".hadithTextContainers").first();
    const englishContainer = textContainer.find(".englishcontainer").first();
    if (!englishContainer.length) return;

    // Get narration and text
    const narrated = englishContainer.find(".hadith_narrated").text().trim();
    const textDetails = englishContainer.find(".text_details").first().text().trim();

    let englishText = "";
    if (narrated && textDetails) {
      englishText = `${narrated}\n\n${textDetails}`;
    } else if (textDetails) {
      englishText = textDetails;
    } else if (narrated) {
      englishText = narrated;
    }

    // Clean up whitespace
    englishText = englishText.replace(/\s+/g, " ").trim();

    // Skip if no meaningful translation
    if (!englishText || englishText.length < 10) return;

    translations.push({
      collectionSlug,
      hadithNumber,
      bookNumber,
      englishText,
    });
  });

  return translations;
}

/**
 * Get book ID from database
 */
async function getBookId(
  collectionSlug: string,
  bookNumber: number
): Promise<number | null> {
  const book = await prisma.hadithBook.findFirst({
    where: {
      bookNumber,
      collection: { slug: collectionSlug },
    },
    select: { id: true },
  });
  return book?.id ?? null;
}

/**
 * Store translation in database
 */
async function storeTranslation(
  bookId: number,
  hadithNumber: string,
  text: string
): Promise<void> {
  await prisma.hadithTranslation.upsert({
    where: {
      bookId_hadithNumber_language: {
        bookId,
        hadithNumber,
        language: "en",
      },
    },
    update: { text },
    create: {
      bookId,
      hadithNumber,
      language: "en",
      text,
    },
  });
}

/**
 * Get existing translation count by collection
 */
async function getExistingTranslationCount(collectionSlug: string): Promise<number> {
  const result = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count
    FROM hadith_translations ht
    JOIN hadith_books hb ON ht.book_id = hb.id
    JOIN hadith_collections hc ON hb.collection_id = hc.id
    WHERE hc.slug = ${collectionSlug} AND ht.language = 'en'
  `;
  return Number(result[0].count);
}

async function main() {
  console.log("=".repeat(70));
  console.log("IMPORT HADITH TRANSLATIONS FROM LOCAL CACHE");
  console.log("=".repeat(70));
  console.log(`Cache directory: ${CACHE_DIR}`);
  console.log(`Collection filter: ${collectionArg || "all"}`);
  console.log(`Dry run: ${dryRun}`);
  console.log("=".repeat(70));
  console.log();

  // Check cache directory exists
  if (!fs.existsSync(CACHE_DIR)) {
    console.error(`Error: Cache directory does not exist: ${CACHE_DIR}`);
    process.exit(1);
  }

  // Get list of collections from cache directory
  const cacheCollections = fs.readdirSync(CACHE_DIR)
    .filter(name => {
      const stat = fs.statSync(path.join(CACHE_DIR, name));
      return stat.isDirectory() && !name.startsWith(".");
    });

  console.log(`Found ${cacheCollections.length} collections in cache:`);
  console.log(`  ${cacheCollections.join(", ")}\n`);

  // Filter by collection if specified
  const collectionsToProcess = collectionArg
    ? cacheCollections.filter(c => c === collectionArg)
    : cacheCollections;

  if (collectionsToProcess.length === 0) {
    console.error(`No collections found to process`);
    process.exit(1);
  }

  // Build book ID cache
  console.log("Building book ID mapping...");
  const bookIdCache = new Map<string, number>();
  const hadithBooks = await prisma.hadithBook.findMany({
    select: {
      id: true,
      bookNumber: true,
      collection: { select: { slug: true } },
    },
  });
  for (const book of hadithBooks) {
    const key = `${book.collection.slug}|${book.bookNumber}`;
    bookIdCache.set(key, book.id);
  }
  console.log(`Cached ${bookIdCache.size} book IDs\n`);

  // Process each collection
  let totalImported = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const startTime = Date.now();

  for (const collectionSlug of collectionsToProcess) {
    const collectionDir = path.join(CACHE_DIR, collectionSlug);

    // Get existing translation count
    const existingCount = await getExistingTranslationCount(collectionSlug);

    // List HTML files (book pages)
    const htmlFiles = fs.readdirSync(collectionDir)
      .filter(name => name.endsWith(".html") && name !== "index.html")
      .sort((a, b) => {
        const numA = parseInt(a.replace(".html", ""), 10);
        const numB = parseInt(b.replace(".html", ""), 10);
        return numA - numB;
      });

    console.log(`\nProcessing ${collectionSlug} (${htmlFiles.length} books, ${existingCount} existing translations)...`);

    let collectionImported = 0;
    let collectionSkipped = 0;

    for (const htmlFile of htmlFiles) {
      const bookNumber = parseInt(htmlFile.replace(".html", ""), 10);
      const filePath = path.join(collectionDir, htmlFile);

      // Get book ID
      const bookIdKey = `${collectionSlug}|${bookNumber}`;
      const bookId = bookIdCache.get(bookIdKey);

      if (!bookId) {
        // Skip books not in database
        continue;
      }

      // Read and parse HTML
      const htmlContent = fs.readFileSync(filePath, "utf-8");
      const translations = parseHtmlFile(htmlContent, collectionSlug, bookNumber);

      for (const trans of translations) {
        if (dryRun) {
          console.log(`  [DRY-RUN] ${collectionSlug}:${trans.hadithNumber} (${trans.englishText.length} chars)`);
          collectionImported++;
          continue;
        }

        try {
          await storeTranslation(bookId, trans.hadithNumber, trans.englishText);
          collectionImported++;
        } catch (error) {
          // Likely a unique constraint - hadith doesn't exist
          collectionSkipped++;
        }
      }

      // Progress update
      process.stdout.write(`\r  Book ${bookNumber}: ${collectionImported} imported, ${collectionSkipped} skipped`);
    }

    console.log(`\n  ${collectionSlug}: ${collectionImported} imported, ${collectionSkipped} skipped`);
    totalImported += collectionImported;
    totalSkipped += collectionSkipped;
  }

  const elapsed = (Date.now() - startTime) / 1000;

  console.log("\n" + "=".repeat(70));
  console.log("SUMMARY");
  console.log("=".repeat(70));
  console.log(`Total imported: ${totalImported}`);
  console.log(`Total skipped: ${totalSkipped}`);
  console.log(`Total errors: ${totalErrors}`);
  console.log(`Time elapsed: ${elapsed.toFixed(1)}s`);
  console.log(`Rate: ${(totalImported / elapsed).toFixed(1)} translations/s`);
  console.log("=".repeat(70));

  // Show updated coverage
  if (totalImported > 0 && !dryRun) {
    console.log("\nUpdated translation coverage:");
    const coverage = await prisma.$queryRaw<
      Array<{ slug: string; total: bigint; with_trans: bigint }>
    >`
      SELECT
        hc.slug,
        COUNT(DISTINCT h.hadith_number) as total,
        COUNT(DISTINCT ht.hadith_number) as with_trans
      FROM hadith_collections hc
      JOIN hadith_books hb ON hc.id = hb.collection_id
      JOIN hadiths h ON hb.id = h.book_id
      LEFT JOIN hadith_translations ht ON h.book_id = ht.book_id AND h.hadith_number = ht.hadith_number
      GROUP BY hc.slug
      ORDER BY hc.slug
    `;

    for (const row of coverage) {
      const total = Number(row.total);
      const withTrans = Number(row.with_trans);
      const pct = total > 0 ? ((withTrans / total) * 100).toFixed(1) : "0.0";
      console.log(`  ${row.slug.padEnd(16)} ${withTrans}/${total} (${pct}%)`);
    }
  }
}

main()
  .catch((e) => {
    console.error("\nFailed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
