/**
 * Clean up orphaned translations that have no matching hadith
 */

import "dotenv/config";
import { prisma } from "../lib/db";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  console.log("=".repeat(60));
  console.log("CLEANUP ORPHANED TRANSLATIONS");
  console.log("=".repeat(60));
  console.log(`Dry run: ${dryRun}`);
  console.log();

  const collections = await prisma.hadithCollection.findMany({
    select: { slug: true, books: { select: { id: true } } }
  });

  let totalDeleted = 0;

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
      select: { id: true, hadithNumber: true, bookId: true }
    });

    // Find orphaned
    const orphanedIds = translations
      .filter((t) => {
        const bookHadiths = hadithsByBook.get(t.bookId);
        return !bookHadiths?.has(t.hadithNumber);
      })
      .map((t) => t.id);

    if (orphanedIds.length === 0) continue;

    if (dryRun) {
      console.log(`[DRY-RUN] ${col.slug}: Would delete ${orphanedIds.length} orphaned translations`);
    } else {
      await prisma.hadithTranslation.deleteMany({
        where: { id: { in: orphanedIds } }
      });
      console.log(`${col.slug}: Deleted ${orphanedIds.length} orphaned translations`);
    }

    totalDeleted += orphanedIds.length;
  }

  console.log();
  console.log("=".repeat(60));
  console.log(`Total ${dryRun ? "would delete" : "deleted"}: ${totalDeleted}`);
  console.log("=".repeat(60));
}

main()
  .catch((e) => {
    console.error("Failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
