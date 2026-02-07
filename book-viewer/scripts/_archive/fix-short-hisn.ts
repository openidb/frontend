/**
 * Fix Short Hisn al-Muslim Hadiths
 *
 * Updates specific short hadiths that were missed by the main scraper.
 *
 * Usage: bun run scripts/fix-short-hisn.ts
 */

import "dotenv/config";
import * as cheerio from "cheerio";
import { prisma } from "../lib/db";
import { qdrant, QDRANT_HADITH_COLLECTION } from "../lib/qdrant";
import { generateEmbedding, normalizeArabicText } from "../lib/embeddings";

// Short hadiths with their correct text
const SHORT_HADITHS = [
  {
    number: "9",
    textArabic: "بِسْمِ الله",
    chapterArabic: "ما يقول إذا وضع الثوب",
  },
  {
    number: "11",
    textArabic: "غُفْـرانَك",
    chapterArabic: "دعاء الخروج من الخلاء",
  },
  {
    number: "197",
    textArabic: "وَلَكَ",
    chapterArabic: "الدعاء لمن قال غفر الله لك",
  },
];

const COLLECTION_SLUG = "hisn";

async function main() {
  console.log("=== Fix Short Hisn al-Muslim Hadiths ===\n");

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

  for (const hadith of SHORT_HADITHS) {
    console.log(`\n--- Hadith ${hadith.number} ---`);
    console.log(`  Text: ${hadith.textArabic}`);
    console.log(`  Chapter: ${hadith.chapterArabic}`);

    const textPlain = normalizeArabicText(hadith.textArabic);

    // Update PostgreSQL
    try {
      await prisma.hadith.updateMany({
        where: {
          bookId: hisnBook.id,
          hadithNumber: hadith.number,
        },
        data: {
          textArabic: hadith.textArabic,
          textPlain: textPlain,
          chapterArabic: hadith.chapterArabic,
        },
      });
      console.log(`  ✓ Updated PostgreSQL`);
    } catch (error) {
      console.error(`  ✗ Failed to update PostgreSQL:`, error);
      continue;
    }

    // Update Qdrant
    try {
      const searchResult = await qdrant.scroll(QDRANT_HADITH_COLLECTION, {
        limit: 1,
        filter: {
          must: [
            { key: "collectionSlug", match: { value: COLLECTION_SLUG } },
            { key: "hadithNumber", match: { value: hadith.number } },
          ],
        },
        with_payload: true,
      });

      if (searchResult.points.length > 0) {
        const pointId = searchResult.points[0].id;

        // Generate new embedding
        const embedding = await generateEmbedding(textPlain);

        // Update the point
        await qdrant.upsert(QDRANT_HADITH_COLLECTION, {
          wait: true,
          points: [
            {
              id: pointId,
              vector: embedding,
              payload: {
                ...searchResult.points[0].payload,
                text: hadith.textArabic,
                textPlain: textPlain,
                chapterArabic: hadith.chapterArabic,
              },
            },
          ],
        });
        console.log(`  ✓ Updated Qdrant (point ${pointId})`);
      } else {
        console.log(`  ⚠ Not found in Qdrant`);
      }
    } catch (error) {
      console.error(`  ✗ Failed to update Qdrant:`, error);
    }
  }

  console.log("\n=== Verification ===");
  for (const hadith of SHORT_HADITHS) {
    const dbHadith = await prisma.hadith.findFirst({
      where: {
        bookId: hisnBook.id,
        hadithNumber: hadith.number,
      },
    });

    if (dbHadith) {
      console.log(`Hadith ${hadith.number}: "${dbHadith.textArabic}"`);
    }
  }

  await prisma.$disconnect();
  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Fix failed:", err);
  process.exit(1);
});
