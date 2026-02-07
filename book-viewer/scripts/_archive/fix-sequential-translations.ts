/**
 * Fix translations that use sequential per-book numbering
 * instead of global hadith numbers.
 *
 * For books where sunnah.com uses 1, 2, 3... but our DB uses
 * global numbers like 260R, 261R, 262R...
 */

import "dotenv/config";
import { prisma } from "../lib/db";

const dryRun = process.argv.includes("--dry-run");

async function fixBook(collectionSlug: string, bookNumber: number) {
  console.log(`\nFixing ${collectionSlug} book ${bookNumber}...`);

  const book = await prisma.hadithBook.findFirst({
    where: { collection: { slug: collectionSlug }, bookNumber },
    select: { id: true, nameEnglish: true }
  });

  if (!book) {
    console.log("  Book not found");
    return { fixed: 0, notMatched: 0 };
  }

  console.log(`  Book name: ${book.nameEnglish}`);

  // Get hadiths in order (by ID which should be insertion order)
  const hadiths = await prisma.hadith.findMany({
    where: { bookId: book.id },
    select: { id: true, hadithNumber: true },
    orderBy: { id: "asc" }
  });

  // Get orphaned translations (those with sequential numbers not matching any hadith)
  const hadithNums = new Set(hadiths.map((h) => h.hadithNumber));

  const translations = await prisma.hadithTranslation.findMany({
    where: { bookId: book.id },
    select: { id: true, hadithNumber: true, text: true }
  });

  // Find orphaned translations (sequential numbers)
  const orphanedTrans = translations.filter((t) => !hadithNums.has(t.hadithNumber));

  // Sort orphaned translations by numeric value
  orphanedTrans.sort((a, b) => parseInt(a.hadithNumber) - parseInt(b.hadithNumber));

  console.log(`  Hadiths: ${hadiths.length}`);
  console.log(`  Orphaned translations: ${orphanedTrans.length}`);

  if (orphanedTrans.length === 0) {
    return { fixed: 0, notMatched: 0 };
  }

  // Check if orphaned translations are sequential (1, 2, 3, ...)
  const isSequential = orphanedTrans.every((t, i) => parseInt(t.hadithNumber) === i + 1);

  if (!isSequential) {
    console.log("  Translations are not sequential 1, 2, 3... - skipping");
    return { fixed: 0, notMatched: orphanedTrans.length };
  }

  // Find hadiths without translations
  const translationNums = new Set(translations.map((t) => t.hadithNumber));
  const missingHadiths = hadiths.filter((h) => !translationNums.has(h.hadithNumber));

  console.log(`  Hadiths missing translations: ${missingHadiths.length}`);

  // If counts match, we can map by position
  if (missingHadiths.length !== orphanedTrans.length) {
    console.log(`  Count mismatch - cannot safely map`);
    return { fixed: 0, notMatched: orphanedTrans.length };
  }

  // Map by position
  let fixed = 0;
  for (let i = 0; i < orphanedTrans.length; i++) {
    const trans = orphanedTrans[i];
    const hadith = missingHadiths[i];

    if (dryRun) {
      console.log(`  [DRY-RUN] "${trans.hadithNumber}" -> "${hadith.hadithNumber}"`);
    } else {
      await prisma.hadithTranslation.update({
        where: { id: trans.id },
        data: { hadithNumber: hadith.hadithNumber }
      });
    }
    fixed++;
  }

  console.log(`  Fixed: ${fixed}`);
  return { fixed, notMatched: 0 };
}

async function findBooksWithSequentialMismatch(collectionSlug: string) {
  console.log(`\nScanning ${collectionSlug} for sequential numbering issues...`);

  const books = await prisma.hadithBook.findMany({
    where: { collection: { slug: collectionSlug } },
    select: { id: true, bookNumber: true },
    orderBy: { bookNumber: "asc" }
  });

  const booksToFix: number[] = [];

  for (const book of books) {
    const hadiths = await prisma.hadith.findMany({
      where: { bookId: book.id },
      select: { hadithNumber: true }
    });

    const hadithNums = new Set(hadiths.map((h) => h.hadithNumber));

    const translations = await prisma.hadithTranslation.findMany({
      where: { bookId: book.id },
      select: { hadithNumber: true }
    });

    // Find orphaned with sequential numbers
    const orphaned = translations.filter(
      (t) => !hadithNums.has(t.hadithNumber) && /^\d+$/.test(t.hadithNumber)
    );

    if (orphaned.length > 5) {
      // Sort and check if sequential
      orphaned.sort((a, b) => parseInt(a.hadithNumber) - parseInt(b.hadithNumber));
      const isSeq = orphaned.every((t, i) => parseInt(t.hadithNumber) === i + 1);

      if (isSeq) {
        booksToFix.push(book.bookNumber);
      }
    }
  }

  return booksToFix;
}

async function main() {
  console.log("=".repeat(60));
  console.log("FIX SEQUENTIAL TRANSLATION NUMBERING");
  console.log("=".repeat(60));
  console.log(`Dry run: ${dryRun}`);

  // Find and fix books with sequential numbering issues
  const collections = ["adab", "malik", "mishkat", "ahmad", "bukhari", "shamail"];

  let totalFixed = 0;
  let totalNotMatched = 0;

  for (const slug of collections) {
    const booksToFix = await findBooksWithSequentialMismatch(slug);

    if (booksToFix.length > 0) {
      console.log(`\n${slug}: Found ${booksToFix.length} books with sequential numbering`);
      console.log(`  Books: ${booksToFix.join(", ")}`);

      for (const bookNum of booksToFix) {
        const result = await fixBook(slug, bookNum);
        totalFixed += result.fixed;
        totalNotMatched += result.notMatched;
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total fixed: ${totalFixed}`);
  console.log(`Not matched: ${totalNotMatched}`);
}

main()
  .catch((e) => {
    console.error("Failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
