/**
 * Analyze orphaned translations to understand patterns
 */

import "dotenv/config";
import { prisma } from "../lib/db";

async function main() {
  console.log("=".repeat(70));
  console.log("ORPHANED TRANSLATION ANALYSIS");
  console.log("=".repeat(70));

  const collections = await prisma.hadithCollection.findMany({
    select: { slug: true, books: { select: { id: true, bookNumber: true } } }
  });

  for (const col of collections) {
    const bookIds = col.books.map((b) => b.id);
    if (bookIds.length === 0) continue;

    // Get all hadiths
    const hadiths = await prisma.hadith.findMany({
      where: { bookId: { in: bookIds } },
      select: { hadithNumber: true, bookId: true }
    });

    const hadithsByBook = new Map<number, Set<string>>();
    for (const h of hadiths) {
      if (!hadithsByBook.has(h.bookId)) hadithsByBook.set(h.bookId, new Set());
      hadithsByBook.get(h.bookId)!.add(h.hadithNumber);
    }

    // Get translations
    const translations = await prisma.hadithTranslation.findMany({
      where: { bookId: { in: bookIds } },
      select: { id: true, hadithNumber: true, bookId: true, text: true }
    });

    // Find orphaned
    const orphaned = translations.filter((t) => {
      const bookHadiths = hadithsByBook.get(t.bookId);
      return !bookHadiths?.has(t.hadithNumber);
    });

    if (orphaned.length === 0) continue;

    console.log(`\n${col.slug}: ${orphaned.length} orphaned translations`);

    // Group by book and analyze patterns
    const byBook = new Map<number, typeof orphaned>();
    for (const t of orphaned) {
      if (!byBook.has(t.bookId)) byBook.set(t.bookId, []);
      byBook.get(t.bookId)!.push(t);
    }

    // Check if these are complete duplicates of existing translations
    let duplicates = 0;
    let trueOrphans = 0;

    for (const [bookId, bookOrphaned] of byBook.entries()) {
      const bookNum = col.books.find((b) => b.id === bookId)?.bookNumber;
      const bookHadiths = hadithsByBook.get(bookId) || new Set();

      // Check if these orphaned hadith numbers are extra content not in DB
      // or if they might be duplicates due to numbering format differences
      for (const t of bookOrphaned) {
        // Check if a hadith with similar numeric part exists
        const numericPart = t.hadithNumber.replace(/[A-Za-z]+$/, "").replace(/^0+/, "");
        const possibleMatches = Array.from(bookHadiths).filter(
          (h) => h.replace(/[A-Za-z]+$/, "").replace(/^0+/, "") === numericPart
        );

        if (possibleMatches.length > 0) {
          duplicates++;
        } else {
          trueOrphans++;
        }
      }
    }

    console.log(`  Likely duplicates (have matching hadith): ${duplicates}`);
    console.log(`  True orphans (no matching hadith exists): ${trueOrphans}`);

    // Sample true orphans
    if (trueOrphans > 0 && trueOrphans <= 20) {
      const trueOrphanList = orphaned.filter((t) => {
        const bookHadiths = hadithsByBook.get(t.bookId) || new Set();
        const numericPart = t.hadithNumber.replace(/[A-Za-z]+$/, "").replace(/^0+/, "");
        const possibleMatches = Array.from(bookHadiths).filter(
          (h) => h.replace(/[A-Za-z]+$/, "").replace(/^0+/, "") === numericPart
        );
        return possibleMatches.length === 0;
      });

      console.log(`  Sample true orphans:`);
      for (const t of trueOrphanList.slice(0, 5)) {
        const bookNum = col.books.find((b) => b.id === t.bookId)?.bookNumber;
        console.log(`    Book ${bookNum}, #${t.hadithNumber}: ${t.text?.slice(0, 50)}...`);
      }
    }
  }

  console.log("\n" + "=".repeat(70));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
