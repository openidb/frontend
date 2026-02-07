/**
 * Enrich Hisn al-Muslim Hadiths with Chapter Names
 *
 * Updates the text_arabic field to include the chapter name as part of the hadith text.
 * Format: "chapter_name: hadith_text"
 *
 * Usage: bun run scripts/enrich-hisn-with-chapters.ts
 */

import "dotenv/config";
import { prisma } from "../lib/db";
import { qdrant, QDRANT_HADITH_COLLECTION } from "../lib/qdrant";
import { generateEmbedding, normalizeArabicText } from "../lib/embeddings";

const COLLECTION_SLUG = "hisn";

async function main() {
  console.log("=== Enrich Hisn al-Muslim Hadiths with Chapter Names ===\n");

  // Get the Hisn collection
  const hisnCollection = await prisma.hadithCollection.findFirst({
    where: { slug: COLLECTION_SLUG },
  });

  if (!hisnCollection) {
    console.error("Hisn al-Muslim collection not found!");
    process.exit(1);
  }

  // Get all Hisn hadiths with their chapter names
  const hadiths = await prisma.hadith.findMany({
    where: {
      book: {
        collectionId: hisnCollection.id,
      },
    },
    include: {
      book: true,
    },
  });

  console.log(`Found ${hadiths.length} Hisn hadiths to enrich\n`);

  let updated = 0;
  let skipped = 0;

  for (const hadith of hadiths) {
    // Skip if no chapter name
    if (!hadith.chapterArabic) {
      console.log(`Hadith ${hadith.hadithNumber}: No chapter name, skipping`);
      skipped++;
      continue;
    }

    // Clean up chapter name (remove English parts and chapter numbers)
    let chapterName = hadith.chapterArabic
      .replace(/^\(\d+\)Chapter:.*\n\(\d+\)\n?/i, '') // Remove "(N)Chapter: ...\n(N)\n"
      .replace(/^\(\d+\)\s*/g, '')  // Remove leading (N)
      .replace(/Chapter:.*$/gim, '') // Remove "Chapter: ..." lines
      .trim();

    // Skip if chapter name is empty after cleaning or already in the text
    if (!chapterName || hadith.textArabic.includes(chapterName)) {
      console.log(`Hadith ${hadith.hadithNumber}: Chapter already in text or empty, skipping`);
      skipped++;
      continue;
    }

    // Create enriched text: "chapter_name\n\nhadith_text"
    const enrichedTextArabic = `${chapterName}\n\n${hadith.textArabic}`;
    const enrichedTextPlain = normalizeArabicText(enrichedTextArabic);

    // Update PostgreSQL
    await prisma.hadith.update({
      where: { id: hadith.id },
      data: {
        textArabic: enrichedTextArabic,
        textPlain: enrichedTextPlain,
      },
    });

    // Update Qdrant
    try {
      const searchResult = await qdrant.scroll(QDRANT_HADITH_COLLECTION, {
        limit: 1,
        filter: {
          must: [
            { key: "collectionSlug", match: { value: COLLECTION_SLUG } },
            { key: "hadithNumber", match: { value: hadith.hadithNumber } },
          ],
        },
        with_payload: true,
      });

      if (searchResult.points.length > 0) {
        const point = searchResult.points[0];
        const embedding = await generateEmbedding(enrichedTextPlain);

        await qdrant.upsert(QDRANT_HADITH_COLLECTION, {
          wait: true,
          points: [
            {
              id: point.id,
              vector: embedding,
              payload: {
                ...point.payload,
                text: enrichedTextArabic,
                textPlain: enrichedTextPlain,
              },
            },
          ],
        });
      }
    } catch (error) {
      console.error(`  Failed to update Qdrant for hadith ${hadith.hadithNumber}:`, error);
    }

    updated++;
    process.stdout.write(`\rUpdated: ${updated}/${hadiths.length}`);
  }

  console.log(`\n\n=== Summary ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);

  // Verify a few hadiths
  console.log("\n=== Verification ===");
  const sampleHadiths = await prisma.hadith.findMany({
    where: {
      book: {
        collectionId: hisnCollection.id,
      },
    },
    take: 5,
    select: {
      hadithNumber: true,
      textArabic: true,
    },
  });

  for (const h of sampleHadiths) {
    console.log(`\nHadith ${h.hadithNumber}:`);
    console.log(`  ${h.textArabic.substring(0, 100)}...`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Enrichment failed:", err);
  process.exit(1);
});
