/**
 * Sync Hisn al-Muslim Hadiths from Qdrant to PostgreSQL
 *
 * Updates the text_arabic and text_plain fields in the hadiths table
 * using the enriched data from Qdrant.
 *
 * Usage: bun run scripts/sync-hisn-from-qdrant.ts
 */

import { prisma } from "../lib/db";
import { qdrant, QDRANT_HADITH_COLLECTION } from "../lib/qdrant";

const BATCH_SIZE = 100;
const COLLECTION_SLUG = "hisn";

interface QdrantHadithPayload {
  collectionSlug: string;
  hadithNumber: string;
  text: string;
  textPlain: string;
  chapterArabic?: string;
  chapterEnglish?: string;
  bookId?: number;
}

async function main() {
  console.log("=== Sync Hisn al-Muslim from Qdrant to PostgreSQL ===\n");

  // Get the Hisn collection and book info
  const hisnCollection = await prisma.hadithCollection.findFirst({
    where: { slug: COLLECTION_SLUG },
  });

  if (!hisnCollection) {
    console.error("Hisn al-Muslim collection not found in database!");
    process.exit(1);
  }

  console.log(`Found collection: ${hisnCollection.nameEnglish} (ID: ${hisnCollection.id})`);

  // Get all Hisn books
  const hisnBooks = await prisma.hadithBook.findMany({
    where: { collectionId: hisnCollection.id },
  });

  console.log(`Found ${hisnBooks.length} book(s) in collection\n`);

  // Create a map of bookId -> book for quick lookup
  const bookMap = new Map(hisnBooks.map(b => [b.id, b]));

  // Scroll through Qdrant and get all Hisn hadiths
  let offset: string | number | null | undefined = undefined;
  let totalFetched = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  console.log("Fetching Hisn hadiths from Qdrant...\n");

  while (true) {
    const scrollResult = await qdrant.scroll(QDRANT_HADITH_COLLECTION, {
      limit: BATCH_SIZE,
      offset,
      with_payload: true,
      with_vector: false,
      filter: {
        must: [{ key: "collectionSlug", match: { value: COLLECTION_SLUG } }],
      },
    });

    const points = scrollResult.points;
    if (points.length === 0) break;

    totalFetched += points.length;

    // Process each hadith
    for (const point of points) {
      const payload = point.payload as QdrantHadithPayload;

      if (!payload.hadithNumber || !payload.text) {
        totalSkipped++;
        continue;
      }

      // Find the hadith in the database
      const hadith = await prisma.hadith.findFirst({
        where: {
          hadithNumber: payload.hadithNumber,
          book: {
            collectionId: hisnCollection.id,
          },
        },
      });

      if (!hadith) {
        console.log(`  Hadith ${payload.hadithNumber} not found in database, skipping`);
        totalSkipped++;
        continue;
      }

      // Update the hadith text
      await prisma.hadith.update({
        where: { id: hadith.id },
        data: {
          textArabic: payload.text,
          textPlain: payload.textPlain || payload.text,
          chapterArabic: payload.chapterArabic || hadith.chapterArabic,
          chapterEnglish: payload.chapterEnglish || hadith.chapterEnglish,
        },
      });

      totalUpdated++;
    }

    process.stdout.write(`\rProcessed: ${totalFetched} hadiths, updated: ${totalUpdated}, skipped: ${totalSkipped}`);

    offset = scrollResult.next_page_offset;
    if (!offset) break;
  }

  console.log("\n\n=== Sync Complete ===");
  console.log(`Total fetched from Qdrant: ${totalFetched}`);
  console.log(`Total updated in database: ${totalUpdated}`);
  console.log(`Total skipped: ${totalSkipped}`);

  // Verify the update
  console.log("\nVerifying sample hadiths...");
  const sampleHadiths = await prisma.hadith.findMany({
    where: {
      book: {
        collectionId: hisnCollection.id,
      },
    },
    take: 3,
    select: {
      hadithNumber: true,
      textArabic: true,
      textPlain: true,
    },
  });

  for (const h of sampleHadiths) {
    console.log(`\nHadith ${h.hadithNumber}:`);
    console.log(`  Arabic: ${h.textArabic.substring(0, 80)}...`);
    console.log(`  Plain: ${h.textPlain.substring(0, 80)}...`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
