/**
 * Fix Hisn al-Muslim Separator
 *
 * Changes the separator between chapter name and hadith text from double newline to ": "
 *
 * Usage: bun run scripts/fix-hisn-separator.ts
 */

import "dotenv/config";
import { prisma } from "../lib/db";
import { qdrant, QDRANT_HADITH_COLLECTION } from "../lib/qdrant";
import { generateEmbedding, normalizeArabicText } from "../lib/embeddings";

const COLLECTION_SLUG = "hisn";

async function main() {
  console.log("=== Fix Hisn al-Muslim Separator ===\n");

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

  console.log(`Book ID: ${hisnBook.id}\n`);

  // Update Arabic hadiths
  console.log("Updating Arabic hadiths...");
  const hadiths = await prisma.hadith.findMany({
    where: { bookId: hisnBook.id },
  });

  let arabicUpdated = 0;
  for (const hadith of hadiths) {
    // Replace first occurrence of double newline with ": "
    const newTextArabic = hadith.textArabic.replace(/\n\n/, ": ");
    const newTextPlain = normalizeArabicText(newTextArabic);

    if (newTextArabic !== hadith.textArabic) {
      await prisma.hadith.update({
        where: { id: hadith.id },
        data: {
          textArabic: newTextArabic,
          textPlain: newTextPlain,
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
          const embedding = await generateEmbedding(newTextPlain);

          await qdrant.upsert(QDRANT_HADITH_COLLECTION, {
            wait: true,
            points: [
              {
                id: point.id,
                vector: embedding,
                payload: {
                  ...point.payload,
                  text: newTextArabic,
                  textPlain: newTextPlain,
                },
              },
            ],
          });
        }
      } catch (error) {
        console.error(`  Failed to update Qdrant for hadith ${hadith.hadithNumber}`);
      }

      arabicUpdated++;
    }
  }
  console.log(`  Updated ${arabicUpdated} Arabic hadiths\n`);

  // Update English translations
  console.log("Updating English translations...");
  const translations = await prisma.hadithTranslation.findMany({
    where: {
      bookId: hisnBook.id,
      language: "en",
    },
  });

  let englishUpdated = 0;
  for (const translation of translations) {
    // Replace first occurrence of double newline with ": "
    const newText = translation.text.replace(/\n\n/, ": ");

    if (newText !== translation.text) {
      await prisma.hadithTranslation.update({
        where: { id: translation.id },
        data: { text: newText },
      });
      englishUpdated++;
    }
  }
  console.log(`  Updated ${englishUpdated} English translations\n`);

  // Verify
  console.log("=== Verification ===\n");

  const sampleHadiths = await prisma.hadith.findMany({
    where: { bookId: hisnBook.id },
    take: 3,
  });

  for (const h of sampleHadiths) {
    console.log(`Hadith ${h.hadithNumber} (Arabic):`);
    console.log(`  ${h.textArabic.substring(0, 80)}...\n`);
  }

  const sampleTranslations = await prisma.hadithTranslation.findMany({
    where: { bookId: hisnBook.id, language: "en" },
    take: 3,
  });

  for (const t of sampleTranslations) {
    console.log(`Hadith ${t.hadithNumber} (English):`);
    console.log(`  ${t.text.substring(0, 80)}...\n`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fix failed:", err);
  process.exit(1);
});
