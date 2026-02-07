/**
 * Re-scrape Corrupted Hisn al-Muslim Hadiths
 *
 * Fetches specific hadiths from sunnah.com and updates both PostgreSQL and Qdrant.
 *
 * Usage: bun run scripts/rescrape-corrupted-hisn.ts
 */

import "dotenv/config";
import * as cheerio from "cheerio";
import { prisma } from "../lib/db";
import { qdrant, QDRANT_HADITH_COLLECTION } from "../lib/qdrant";
import { generateEmbedding, normalizeArabicText } from "../lib/embeddings";

// Corrupted hadith numbers identified
const CORRUPTED_HADITHS = ["9", "11", "91", "105", "143", "144", "163", "164", "197"];

const COLLECTION_SLUG = "hisn";
const DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    console.log(`  Fetching: ${url}`);
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
      },
    });

    if (!response.ok) {
      console.error(`  HTTP ${response.status}`);
      return null;
    }

    return await response.text();
  } catch (error) {
    console.error(`  Error fetching ${url}:`, error);
    return null;
  }
}

interface ParsedHadith {
  hadithNumber: string;
  textArabic: string;
  textPlain: string;
  chapterArabic?: string;
  chapterEnglish?: string;
}

function parseHadithPage(html: string, hadithNumber: string): ParsedHadith | null {
  const $ = cheerio.load(html);

  // Look for Arabic text in various selectors
  let textArabic = "";

  // Strategy 1: Look for specific Arabic hadith containers
  const arabicSelectors = [
    ".arabic_hadith_full",
    ".arabic_sanad",
    ".text_details",
    ".hadith_narrated",
    ".arabic",
    "[class*='arabic']",
    "[lang='ar']",
  ];

  for (const selector of arabicSelectors) {
    $(selector).each((_, el) => {
      const text = $(el).text().trim();
      // Check if it has substantial Arabic content
      const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
      if (arabicChars > 20 && text.length > textArabic.length) {
        textArabic = text;
      }
    });
    if (textArabic.length > 50) break;
  }

  // Strategy 2: Look for hadith text containers
  if (!textArabic || textArabic.length < 30) {
    $(".hadithTextContainers, .actualHadithContainer, .hadith_container").each((_, container) => {
      const $container = $(container);
      $container.find("*").each((_, el) => {
        const text = $(el).text().trim();
        const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
        if (arabicChars > 30 && text.length > textArabic.length && text.length < 5000) {
          textArabic = text;
        }
      });
    });
  }

  // Strategy 3: Extract all Arabic text from page
  if (!textArabic || textArabic.length < 30) {
    const allText = $("body").text();
    const arabicMatches = allText.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\s،؛:.!؟«»\-()]+/g) || [];
    // Find the longest Arabic segment
    for (const match of arabicMatches) {
      const cleaned = match.trim();
      if (cleaned.length > textArabic.length && cleaned.length > 30 && cleaned.length < 2000) {
        textArabic = cleaned;
      }
    }
  }

  if (!textArabic || textArabic.length < 20) {
    console.error(`  Could not extract Arabic text for hadith ${hadithNumber}`);
    return null;
  }

  // Clean up the text
  textArabic = textArabic
    .replace(/\s+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();

  // Get chapter info
  let chapterArabic = "";
  let chapterEnglish = "";

  $(".chapter, .chapter_title, .englishchapter, .arabicchapter, h3, h4").each((_, el) => {
    const text = $(el).text().trim();
    if (/[\u0600-\u06FF]/.test(text) && !chapterArabic && text.length < 300) {
      chapterArabic = text;
    } else if (!/[\u0600-\u06FF]/.test(text) && !chapterEnglish && text.length < 300) {
      chapterEnglish = text;
    }
  });

  return {
    hadithNumber,
    textArabic,
    textPlain: normalizeArabicText(textArabic),
    chapterArabic: chapterArabic || undefined,
    chapterEnglish: chapterEnglish || undefined,
  };
}

async function main() {
  console.log("=== Re-scrape Corrupted Hisn al-Muslim Hadiths ===\n");
  console.log(`Hadiths to fix: ${CORRUPTED_HADITHS.join(", ")}\n`);

  // Get the Hisn collection and book
  const hisnCollection = await prisma.hadithCollection.findFirst({
    where: { slug: COLLECTION_SLUG },
  });

  if (!hisnCollection) {
    console.error("Hisn al-Muslim collection not found!");
    process.exit(1);
  }

  const hisnBook = await prisma.hadithBook.findFirst({
    where: { collectionId: hisnCollection.id },
  });

  if (!hisnBook) {
    console.error("Hisn al-Muslim book not found!");
    process.exit(1);
  }

  console.log(`Collection: ${hisnCollection.nameEnglish} (ID: ${hisnCollection.id})`);
  console.log(`Book ID: ${hisnBook.id}\n`);

  let updated = 0;
  let failed = 0;

  for (const hadithNumber of CORRUPTED_HADITHS) {
    console.log(`\n--- Hadith ${hadithNumber} ---`);

    // Fetch from sunnah.com
    const url = `https://sunnah.com/${COLLECTION_SLUG}:${hadithNumber}`;
    const html = await fetchPage(url);

    if (!html) {
      console.error(`  Failed to fetch hadith ${hadithNumber}`);
      failed++;
      await sleep(DELAY_MS);
      continue;
    }

    // Parse the hadith
    const parsed = parseHadithPage(html, hadithNumber);

    if (!parsed) {
      console.error(`  Failed to parse hadith ${hadithNumber}`);
      failed++;
      await sleep(DELAY_MS);
      continue;
    }

    console.log(`  Arabic text: ${parsed.textArabic.substring(0, 60)}...`);
    console.log(`  Plain text: ${parsed.textPlain.substring(0, 60)}...`);

    // Update PostgreSQL
    try {
      await prisma.hadith.updateMany({
        where: {
          bookId: hisnBook.id,
          hadithNumber: hadithNumber,
        },
        data: {
          textArabic: parsed.textArabic,
          textPlain: parsed.textPlain,
          chapterArabic: parsed.chapterArabic,
          chapterEnglish: parsed.chapterEnglish,
        },
      });
      console.log(`  ✓ Updated PostgreSQL`);
    } catch (error) {
      console.error(`  ✗ Failed to update PostgreSQL:`, error);
      failed++;
      await sleep(DELAY_MS);
      continue;
    }

    // Update Qdrant - find the point by hadith number and collection
    try {
      const searchResult = await qdrant.scroll(QDRANT_HADITH_COLLECTION, {
        limit: 1,
        filter: {
          must: [
            { key: "collectionSlug", match: { value: COLLECTION_SLUG } },
            { key: "hadithNumber", match: { value: hadithNumber } },
          ],
        },
        with_payload: true,
      });

      if (searchResult.points.length > 0) {
        const pointId = searchResult.points[0].id;

        // Generate new embedding for the corrected text
        const embedding = await generateEmbedding(parsed.textPlain);

        // Update the point with new text and embedding
        await qdrant.upsert(QDRANT_HADITH_COLLECTION, {
          wait: true,
          points: [
            {
              id: pointId,
              vector: embedding,
              payload: {
                ...searchResult.points[0].payload,
                text: parsed.textArabic,
                textPlain: parsed.textPlain,
                chapterArabic: parsed.chapterArabic || null,
                chapterEnglish: parsed.chapterEnglish || null,
              },
            },
          ],
        });
        console.log(`  ✓ Updated Qdrant (point ${pointId})`);
      } else {
        console.log(`  ⚠ Hadith not found in Qdrant, skipping Qdrant update`);
      }
    } catch (error) {
      console.error(`  ✗ Failed to update Qdrant:`, error);
      // Continue anyway, at least PostgreSQL is updated
    }

    updated++;
    await sleep(DELAY_MS);
  }

  console.log("\n=== Summary ===");
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);

  // Verify the updates
  console.log("\n=== Verification ===");
  for (const hadithNumber of CORRUPTED_HADITHS.slice(0, 3)) {
    const hadith = await prisma.hadith.findFirst({
      where: {
        bookId: hisnBook.id,
        hadithNumber: hadithNumber,
      },
      select: {
        hadithNumber: true,
        textArabic: true,
      },
    });

    if (hadith) {
      const hasArabic = (hadith.textArabic.match(/[\u0600-\u06FF]/g) || []).length > 20;
      console.log(`Hadith ${hadithNumber}: ${hasArabic ? "✓ Has Arabic" : "✗ Missing Arabic"}`);
      console.log(`  Preview: ${hadith.textArabic.substring(0, 50)}...`);
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Re-scrape failed:", err);
  process.exit(1);
});
