/**
 * Analyze missing and orphaned translations to find patterns
 */

import "../env";
import { prisma } from "@web/lib/db";

async function analyzeCollection(slug: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Analyzing: ${slug.toUpperCase()}`);
  console.log("=".repeat(60));

  const books = await prisma.hadithBook.findMany({
    where: { collection: { slug } },
    select: {
      id: true,
      bookNumber: true,
      nameArabic: true
    },
    orderBy: { bookNumber: "asc" }
  });

  let totalMissing = 0;
  let totalOrphaned = 0;
  const missingByBook: { bookNumber: number; missing: string[] }[] = [];
  const orphanedByBook: { bookNumber: number; orphaned: string[] }[] = [];

  for (const book of books) {
    // Get hadiths
    const hadiths = await prisma.hadith.findMany({
      where: { bookId: book.id },
      select: { hadithNumber: true }
    });
    const hadithNums = new Set(hadiths.map((h) => h.hadithNumber));

    // Get translations
    const translations = await prisma.hadithTranslation.findMany({
      where: { bookId: book.id },
      select: { hadithNumber: true }
    });
    const translationNums = new Set(translations.map((t) => t.hadithNumber));

    // Find missing (hadiths without translations)
    const missing: string[] = [];
    for (const num of hadithNums) {
      if (!translationNums.has(num)) {
        missing.push(num);
      }
    }

    // Find orphaned (translations without hadiths)
    const orphaned: string[] = [];
    for (const num of translationNums) {
      if (!hadithNums.has(num)) {
        orphaned.push(num);
      }
    }

    if (missing.length > 0) {
      totalMissing += missing.length;
      missingByBook.push({ bookNumber: book.bookNumber, missing });
    }

    if (orphaned.length > 0) {
      totalOrphaned += orphaned.length;
      orphanedByBook.push({ bookNumber: book.bookNumber, orphaned });
    }
  }

  // Print summary
  console.log(`\nTotal missing: ${totalMissing}`);
  console.log(`Total orphaned: ${totalOrphaned}`);

  if (missingByBook.length > 0) {
    console.log("\nMissing translations by book:");
    for (const { bookNumber, missing } of missingByBook.slice(0, 10)) {
      console.log(`  Book ${bookNumber}: ${missing.length} missing`);
      console.log(`    Examples: ${missing.slice(0, 5).join(", ")}`);
    }
  }

  if (orphanedByBook.length > 0) {
    console.log("\nOrphaned translations by book:");
    for (const { bookNumber, orphaned } of orphanedByBook.slice(0, 10)) {
      console.log(`  Book ${bookNumber}: ${orphaned.length} orphaned`);
      console.log(`    Examples: ${orphaned.slice(0, 5).join(", ")}`);
    }
  }

  // Check for pattern: are orphaned numbers close to missing numbers?
  if (missingByBook.length > 0 && orphanedByBook.length > 0) {
    console.log("\nPotential mapping issues:");
    for (const { bookNumber, missing } of missingByBook.slice(0, 3)) {
      const orphanedInBook = orphanedByBook.find((o) => o.bookNumber === bookNumber);
      if (orphanedInBook) {
        console.log(`  Book ${bookNumber}:`);
        console.log(`    Missing hadiths: ${missing.slice(0, 5).join(", ")}`);
        console.log(`    Orphaned trans:  ${orphanedInBook.orphaned.slice(0, 5).join(", ")}`);
      }
    }
  }
}

async function main() {
  // Analyze collections with issues
  await analyzeCollection("adab");
  await analyzeCollection("malik");
  await analyzeCollection("bulugh");
  await analyzeCollection("hisn");

  console.log("\n" + "=".repeat(60));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
