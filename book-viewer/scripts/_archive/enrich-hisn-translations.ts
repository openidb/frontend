/**
 * Enrich Hisn al-Muslim English Translations with Chapter Names
 *
 * Extracts English chapter names from chapter_arabic field and prepends to translations.
 *
 * Usage: bun run scripts/enrich-hisn-translations.ts
 */

import "dotenv/config";
import { prisma } from "../lib/db";

const COLLECTION_SLUG = "hisn";

function extractEnglishChapter(chapterArabic: string | null): string | null {
  if (!chapterArabic) return null;

  // Pattern: "(N)Chapter: English Chapter Name\n(N)\nArabic Chapter Name"
  const match = chapterArabic.match(/Chapter:\s*([^\n]+)/i);
  if (match) {
    return match[1].trim();
  }
  return null;
}

async function main() {
  console.log("=== Enrich Hisn al-Muslim English Translations with Chapter Names ===\n");

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

  // Get all Hisn hadiths with their chapter info
  const hadiths = await prisma.hadith.findMany({
    where: {
      bookId: hisnBook.id,
    },
    select: {
      hadithNumber: true,
      chapterArabic: true,
    },
  });

  console.log(`Found ${hadiths.length} hadiths\n`);

  // Build a map of hadith number -> English chapter name
  const chapterMap = new Map<string, string>();
  for (const hadith of hadiths) {
    const englishChapter = extractEnglishChapter(hadith.chapterArabic);
    if (englishChapter) {
      chapterMap.set(hadith.hadithNumber, englishChapter);
    }
  }

  console.log(`Extracted ${chapterMap.size} English chapter names\n`);

  // Get all English translations for Hisn
  const translations = await prisma.hadithTranslation.findMany({
    where: {
      bookId: hisnBook.id,
      language: "en",
    },
  });

  console.log(`Found ${translations.length} English translations\n`);

  let updated = 0;
  let skipped = 0;

  for (const translation of translations) {
    const chapterName = chapterMap.get(translation.hadithNumber);

    if (!chapterName) {
      console.log(`Hadith ${translation.hadithNumber}: No English chapter name found, skipping`);
      skipped++;
      continue;
    }

    // Check if chapter is already in the translation
    if (translation.text.toLowerCase().includes(chapterName.toLowerCase())) {
      console.log(`Hadith ${translation.hadithNumber}: Chapter already in translation, skipping`);
      skipped++;
      continue;
    }

    // Prepend chapter name to translation
    const enrichedText = `${chapterName}\n\n${translation.text}`;

    await prisma.hadithTranslation.update({
      where: { id: translation.id },
      data: { text: enrichedText },
    });

    updated++;
    process.stdout.write(`\rUpdated: ${updated}/${translations.length}`);
  }

  console.log(`\n\n=== Summary ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);

  // Verify a few translations
  console.log("\n=== Verification ===");
  const sampleTranslations = await prisma.hadithTranslation.findMany({
    where: {
      bookId: hisnBook.id,
      language: "en",
    },
    take: 5,
    orderBy: {
      hadithNumber: "asc",
    },
  });

  for (const t of sampleTranslations) {
    console.log(`\nHadith ${t.hadithNumber}:`);
    console.log(`  ${t.text.substring(0, 120)}...`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Enrichment failed:", err);
  process.exit(1);
});
