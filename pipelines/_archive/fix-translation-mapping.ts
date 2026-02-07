/**
 * Fix translation hadith number mapping
 *
 * Problem: Translations were imported with plain numbers (1, 2, 3)
 * but database has suffixed numbers (1A, 2R, 3E, etc.)
 *
 * Solution: Update translations to use the correct suffixed numbers
 */

import "../env";
import { prisma } from "@web/lib/db";

const dryRun = process.argv.includes("--dry-run");

async function fixCollection(slug: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Fixing: ${slug.toUpperCase()}`);
  console.log("=".repeat(60));

  const books = await prisma.hadithBook.findMany({
    where: { collection: { slug } },
    select: { id: true, bookNumber: true },
    orderBy: { bookNumber: "asc" }
  });

  let totalFixed = 0;
  let totalAmbiguous = 0;
  let totalNotFound = 0;

  for (const book of books) {
    // Get all hadiths in this book
    const hadiths = await prisma.hadith.findMany({
      where: { bookId: book.id },
      select: { hadithNumber: true }
    });

    // Build map: numeric part -> [full numbers with suffixes]
    const numericToFull = new Map<string, string[]>();
    for (const h of hadiths) {
      const numeric = h.hadithNumber.replace(/[A-Za-z]+$/, "");
      if (!numericToFull.has(numeric)) {
        numericToFull.set(numeric, []);
      }
      numericToFull.get(numeric)!.push(h.hadithNumber);
    }

    const hadithNums = new Set(hadiths.map((h) => h.hadithNumber));

    // Get translations in this book
    const translations = await prisma.hadithTranslation.findMany({
      where: { bookId: book.id },
      select: { id: true, hadithNumber: true }
    });

    for (const trans of translations) {
      // Skip if already matches a hadith
      if (hadithNums.has(trans.hadithNumber)) {
        continue;
      }

      // This is an orphaned translation - try to find the correct number
      const numeric = trans.hadithNumber.replace(/[A-Za-z]+$/, "");
      const possibleMatches = numericToFull.get(numeric) || [];

      if (possibleMatches.length === 0) {
        totalNotFound++;
        continue;
      }

      if (possibleMatches.length === 1) {
        // Exact match - update the translation
        const correctNumber = possibleMatches[0];

        if (dryRun) {
          console.log(`[DRY-RUN] Book ${book.bookNumber}: "${trans.hadithNumber}" -> "${correctNumber}"`);
        } else {
          // Check if target already has a translation
          const existing = await prisma.hadithTranslation.findFirst({
            where: {
              bookId: book.id,
              hadithNumber: correctNumber,
              language: "en"
            }
          });

          if (existing) {
            // Delete the orphaned one (keep the existing)
            await prisma.hadithTranslation.delete({ where: { id: trans.id } });
          } else {
            // Update to correct number
            await prisma.hadithTranslation.update({
              where: { id: trans.id },
              data: { hadithNumber: correctNumber }
            });
          }
        }
        totalFixed++;
      } else {
        // Multiple matches - ambiguous
        // Try to pick the best one: prefer no suffix, then A, then E, then R, then U
        const noSuffix = possibleMatches.find((n) => /^\d+$/.test(n));
        const withA = possibleMatches.find((n) => n.endsWith("A"));
        const withE = possibleMatches.find((n) => n.endsWith("E"));
        const withR = possibleMatches.find((n) => n.endsWith("R"));

        const bestMatch = noSuffix || withA || withE || withR || possibleMatches[0];

        if (dryRun) {
          console.log(`[DRY-RUN] Book ${book.bookNumber}: "${trans.hadithNumber}" -> "${bestMatch}" (from ${possibleMatches.join(", ")})`);
        } else {
          // Check if target already has a translation
          const existing = await prisma.hadithTranslation.findFirst({
            where: {
              bookId: book.id,
              hadithNumber: bestMatch,
              language: "en"
            }
          });

          if (existing) {
            // Delete the orphaned one
            await prisma.hadithTranslation.delete({ where: { id: trans.id } });
          } else {
            await prisma.hadithTranslation.update({
              where: { id: trans.id },
              data: { hadithNumber: bestMatch }
            });
          }
        }
        totalFixed++;
        totalAmbiguous++;
      }
    }

    process.stdout.write(`\rProcessed book ${book.bookNumber}`);
  }

  console.log(`\n\nResults for ${slug}:`);
  console.log(`  Fixed: ${totalFixed}`);
  console.log(`  Ambiguous (picked best): ${totalAmbiguous}`);
  console.log(`  Not found: ${totalNotFound}`);

  return { fixed: totalFixed, ambiguous: totalAmbiguous, notFound: totalNotFound };
}

async function main() {
  console.log("=".repeat(60));
  console.log("FIX TRANSLATION MAPPING");
  console.log("=".repeat(60));
  console.log(`Dry run: ${dryRun}`);

  // Collections with mapping issues
  const collectionsToFix = ["adab", "malik", "bulugh", "hisn", "mishkat", "ahmad", "bukhari", "muslim", "nasai", "tirmidhi", "shamail"];

  const results: { slug: string; fixed: number; ambiguous: number; notFound: number }[] = [];

  for (const slug of collectionsToFix) {
    const result = await fixCollection(slug);
    results.push({ slug, ...result });
  }

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log("Collection".padEnd(15), "Fixed".padStart(8), "Ambiguous".padStart(10), "Not Found".padStart(12));
  console.log("-".repeat(45));

  let totalFixed = 0;
  let totalAmbiguous = 0;
  let totalNotFound = 0;

  for (const r of results) {
    if (r.fixed > 0 || r.notFound > 0) {
      console.log(r.slug.padEnd(15), r.fixed.toString().padStart(8), r.ambiguous.toString().padStart(10), r.notFound.toString().padStart(12));
    }
    totalFixed += r.fixed;
    totalAmbiguous += r.ambiguous;
    totalNotFound += r.notFound;
  }

  console.log("-".repeat(45));
  console.log("TOTAL".padEnd(15), totalFixed.toString().padStart(8), totalAmbiguous.toString().padStart(10), totalNotFound.toString().padStart(12));
}

main()
  .catch((e) => {
    console.error("Failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
