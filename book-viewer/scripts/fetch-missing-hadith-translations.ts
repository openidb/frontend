/**
 * Fetch Missing Hadith Translations from Sunnah.com
 *
 * Finds hadiths without English translations and fetches them directly
 * from sunnah.com. Only stores real translations from the website.
 *
 * Usage:
 *   bun run scripts/fetch-missing-hadith-translations.ts [--collection=muslim] [--limit=100] [--delay=500]
 *
 * Options:
 *   --collection=slug  Only process specific collection (e.g., muslim, malik)
 *   --limit=N          Maximum hadiths to fetch (default: unlimited)
 *   --delay=N          Delay between requests in ms (default: 300)
 *   --dry-run          Show what would be fetched without storing
 */

import "dotenv/config";
import * as cheerio from "cheerio";
import { prisma } from "../lib/db";

// Collections that use /collection/book/hadith format instead of /collection:hadith
const BOOK_PATH_COLLECTIONS = new Set(["malik", "bulugh"]);

// Parse command line arguments
const args = process.argv.slice(2);
const collectionArg = args.find((arg) => arg.startsWith("--collection="))?.split("=")[1];
const limitArg = args.find((arg) => arg.startsWith("--limit="))?.split("=")[1];
const delayArg = args.find((arg) => arg.startsWith("--delay="))?.split("=")[1];
const dryRun = args.includes("--dry-run");

const LIMIT = limitArg ? parseInt(limitArg, 10) : Infinity;
const DELAY_MS = delayArg ? parseInt(delayArg, 10) : 300;

/**
 * Generate the correct sunnah.com URL for a hadith
 */
function generateSunnahComUrl(
  collectionSlug: string,
  hadithNumber: string,
  bookNumber: number
): string {
  // Remove letter suffixes for URL (e.g., "684a" -> "684")
  const cleanHadithNumber = hadithNumber.replace(/[A-Za-z]+$/, "");

  if (BOOK_PATH_COLLECTIONS.has(collectionSlug)) {
    return `https://sunnah.com/${collectionSlug}/${bookNumber}/${cleanHadithNumber}`;
  }
  return `https://sunnah.com/${collectionSlug}:${cleanHadithNumber}`;
}

/**
 * Fetch and parse English translation from sunnah.com
 */
async function fetchTranslation(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; HadithTranslationFetcher/1.0)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // Hadith doesn't exist on sunnah.com
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract English translation
    // Try multiple selectors for different page layouts
    let englishText = "";

    // Method 1: Standard hadith page layout
    const narrated = $(".hadith_narrated").first().text().trim();
    const textDetails = $(".text_details").first().text().trim();

    if (narrated && textDetails) {
      englishText = `${narrated}\n\n${textDetails}`;
    } else if (textDetails) {
      englishText = textDetails;
    } else if (narrated) {
      englishText = narrated;
    }

    // Method 2: Try englishcontainer if above didn't work
    if (!englishText) {
      const englishContainer = $(".englishcontainer").first();
      if (englishContainer.length) {
        const narrated2 = englishContainer.find(".hadith_narrated").text().trim();
        const text2 = englishContainer.find(".text_details").text().trim();
        if (narrated2 && text2) {
          englishText = `${narrated2}\n\n${text2}`;
        } else if (text2) {
          englishText = text2;
        } else if (narrated2) {
          englishText = narrated2;
        }
      }
    }

    // Method 3: Try any english text class
    if (!englishText) {
      const englishOnly = $(".english_hadith_full").first().text().trim();
      if (englishOnly) {
        englishText = englishOnly;
      }
    }

    // Clean up whitespace
    englishText = englishText.replace(/\s+/g, " ").trim();

    // Return null if no meaningful translation found
    if (!englishText || englishText.length < 10) {
      return null;
    }

    return englishText;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  Error fetching ${url}: ${message}`);
    return null;
  }
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
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("=".repeat(70));
  console.log("FETCH MISSING HADITH TRANSLATIONS FROM SUNNAH.COM");
  console.log("=".repeat(70));
  console.log(`Collection filter: ${collectionArg || "all"}`);
  console.log(`Limit: ${LIMIT === Infinity ? "unlimited" : LIMIT}`);
  console.log(`Delay between requests: ${DELAY_MS}ms`);
  console.log(`Dry run: ${dryRun}`);
  console.log("=".repeat(70));
  console.log();

  // Get hadiths without translations using raw query
  console.log("Finding hadiths without translations...");

  // Use separate queries to avoid Prisma template literal interpolation issues
  const hadiths = collectionArg
    ? await prisma.$queryRaw<
        Array<{
          id: number;
          book_id: number;
          hadith_number: string;
          book_number: number;
          collection_slug: string;
        }>
      >`
        SELECT
          h.id,
          h.book_id,
          h.hadith_number,
          hb.book_number,
          hc.slug as collection_slug
        FROM hadiths h
        JOIN hadith_books hb ON h.book_id = hb.id
        JOIN hadith_collections hc ON hb.collection_id = hc.id
        LEFT JOIN hadith_translations ht
          ON h.book_id = ht.book_id
          AND h.hadith_number = ht.hadith_number
          AND ht.language = 'en'
        WHERE ht.id IS NULL
          AND hc.slug = ${collectionArg}
        ORDER BY hc.slug, hb.book_number, h.hadith_number
      `
    : await prisma.$queryRaw<
        Array<{
          id: number;
          book_id: number;
          hadith_number: string;
          book_number: number;
          collection_slug: string;
        }>
      >`
        SELECT
          h.id,
          h.book_id,
          h.hadith_number,
          hb.book_number,
          hc.slug as collection_slug
        FROM hadiths h
        JOIN hadith_books hb ON h.book_id = hb.id
        JOIN hadith_collections hc ON hb.collection_id = hc.id
        LEFT JOIN hadith_translations ht
          ON h.book_id = ht.book_id
          AND h.hadith_number = ht.hadith_number
          AND ht.language = 'en'
        WHERE ht.id IS NULL
        ORDER BY hc.slug, hb.book_number, h.hadith_number
      `;

  console.log(`Found ${hadiths.length} hadiths without translations\n`);

  if (hadiths.length === 0) {
    console.log("No missing translations found!");
    return;
  }

  // Group by collection for summary
  const byCollection = new Map<string, number>();
  for (const h of hadiths) {
    byCollection.set(h.collection_slug, (byCollection.get(h.collection_slug) || 0) + 1);
  }

  console.log("Missing translations by collection:");
  for (const [slug, count] of byCollection.entries()) {
    console.log(`  ${slug}: ${count}`);
  }
  console.log();

  // Process hadiths
  const toProcess = hadiths.slice(0, LIMIT);
  let fetched = 0;
  let stored = 0;
  let notFound = 0;
  let errors = 0;

  const startTime = Date.now();

  for (let i = 0; i < toProcess.length; i++) {
    const hadith = toProcess[i];
    const url = generateSunnahComUrl(
      hadith.collection_slug,
      hadith.hadith_number,
      hadith.book_number
    );

    process.stdout.write(
      `\r[${i + 1}/${toProcess.length}] ${hadith.collection_slug}:${hadith.hadith_number}...`
    );

    if (dryRun) {
      console.log(` -> ${url}`);
      continue;
    }

    const translation = await fetchTranslation(url);
    fetched++;

    if (translation) {
      await storeTranslation(hadith.book_id, hadith.hadith_number, translation);
      stored++;
      process.stdout.write(` stored (${translation.length} chars)\n`);
    } else {
      notFound++;
      process.stdout.write(` no translation found\n`);
    }

    // Rate limiting
    if (i < toProcess.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  const elapsed = (Date.now() - startTime) / 1000;

  console.log("\n" + "=".repeat(70));
  console.log("SUMMARY");
  console.log("=".repeat(70));
  console.log(`Total processed: ${fetched}`);
  console.log(`Translations stored: ${stored}`);
  console.log(`Not found on sunnah.com: ${notFound}`);
  console.log(`Errors: ${errors}`);
  console.log(`Time elapsed: ${elapsed.toFixed(1)}s`);
  console.log(`Rate: ${(fetched / elapsed).toFixed(1)} requests/s`);
  console.log("=".repeat(70));

  // Show updated coverage
  if (stored > 0) {
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
