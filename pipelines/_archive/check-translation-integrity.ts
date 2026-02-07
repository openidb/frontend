/**
 * Comprehensive integrity check for hadith translations
 */

import "../env";
import { prisma } from "@web/lib/db";

async function main() {
  console.log("=".repeat(70));
  console.log("COMPREHENSIVE HADITH TRANSLATION INTEGRITY CHECK");
  console.log("=".repeat(70));
  console.log();

  // 1. Get all collections with stats
  const collections = await prisma.hadithCollection.findMany({
    select: {
      id: true,
      slug: true,
      nameEnglish: true,
      books: {
        select: {
          id: true,
          bookNumber: true,
          _count: { select: { hadiths: true } }
        }
      }
    },
    orderBy: { slug: "asc" }
  });

  console.log("1. TRANSLATION COVERAGE BY COLLECTION");
  console.log("-".repeat(70));
  console.log(
    "Collection".padEnd(18),
    "Hadiths".padStart(8),
    "Matched".padStart(8),
    "Orphaned".padStart(8),
    "Coverage".padStart(10)
  );
  console.log("-".repeat(70));

  interface Issue {
    collection: string;
    type: "orphaned" | "missing" | "zero_coverage";
    count: number;
    samples?: { bookId: number; hadithNumber: string }[];
  }

  const issues: Issue[] = [];
  const collectionStats: {
    slug: string;
    total: number;
    matched: number;
    orphaned: number;
  }[] = [];

  for (const col of collections) {
    const bookIds = col.books.map((b) => b.id);
    const totalHadiths = col.books.reduce((sum, b) => sum + b._count.hadiths, 0);

    if (bookIds.length === 0) continue;

    // Get all hadith numbers per book
    const hadiths = await prisma.hadith.findMany({
      where: { bookId: { in: bookIds } },
      select: { hadithNumber: true, bookId: true }
    });

    const hadithsByBook = new Map<number, Set<string>>();
    for (const h of hadiths) {
      if (!hadithsByBook.has(h.bookId)) hadithsByBook.set(h.bookId, new Set());
      hadithsByBook.get(h.bookId)!.add(h.hadithNumber);
    }

    // Get all translations
    const translations = await prisma.hadithTranslation.findMany({
      where: { bookId: { in: bookIds } },
      select: { hadithNumber: true, bookId: true }
    });

    let matched = 0;
    let orphaned = 0;
    const orphanedList: { bookId: number; hadithNumber: string }[] = [];

    for (const t of translations) {
      const bookHadiths = hadithsByBook.get(t.bookId);
      if (bookHadiths?.has(t.hadithNumber)) {
        matched++;
      } else {
        orphaned++;
        if (orphanedList.length < 5) {
          orphanedList.push({ bookId: t.bookId, hadithNumber: t.hadithNumber });
        }
      }
    }

    const coverage =
      totalHadiths > 0 ? ((matched / totalHadiths) * 100).toFixed(1) : "0.0";
    console.log(
      col.slug.padEnd(18),
      totalHadiths.toString().padStart(8),
      matched.toString().padStart(8),
      orphaned.toString().padStart(8),
      (coverage + "%").padStart(10)
    );

    collectionStats.push({
      slug: col.slug,
      total: totalHadiths,
      matched,
      orphaned
    });

    if (orphaned > 0) {
      issues.push({
        collection: col.slug,
        type: "orphaned",
        count: orphaned,
        samples: orphanedList
      });
    }

    if (matched === 0 && totalHadiths > 0) {
      issues.push({
        collection: col.slug,
        type: "zero_coverage",
        count: totalHadiths
      });
    } else if (matched < totalHadiths && matched > 0) {
      const missing = totalHadiths - matched;
      issues.push({ collection: col.slug, type: "missing", count: missing });
    }
  }

  // Summary totals
  const totalHadiths = collectionStats.reduce((s, c) => s + c.total, 0);
  const totalMatched = collectionStats.reduce((s, c) => s + c.matched, 0);
  const totalOrphaned = collectionStats.reduce((s, c) => s + c.orphaned, 0);

  console.log("-".repeat(70));
  console.log(
    "TOTAL".padEnd(18),
    totalHadiths.toString().padStart(8),
    totalMatched.toString().padStart(8),
    totalOrphaned.toString().padStart(8),
    ((totalMatched / totalHadiths) * 100).toFixed(1).padStart(9) + "%"
  );

  console.log();
  console.log("2. ISSUES FOUND");
  console.log("-".repeat(70));

  const zeroIssues = issues.filter((i) => i.type === "zero_coverage");
  const missingIssues = issues.filter((i) => i.type === "missing");
  const orphanedIssues = issues.filter((i) => i.type === "orphaned");

  if (zeroIssues.length > 0) {
    console.log("\n[CRITICAL] Collections with 0% coverage:");
    for (const issue of zeroIssues) {
      console.log(`  - ${issue.collection}: ${issue.count} hadiths with no translations`);
    }
  }

  if (missingIssues.length > 0) {
    console.log("\n[WARNING] Collections with partial coverage:");
    for (const issue of missingIssues) {
      const stats = collectionStats.find((c) => c.slug === issue.collection)!;
      const pct = ((stats.matched / stats.total) * 100).toFixed(1);
      console.log(
        `  - ${issue.collection}: ${issue.count} hadiths missing translations (${pct}% coverage)`
      );
    }
  }

  if (orphanedIssues.length > 0) {
    console.log("\n[INFO] Orphaned translations (no matching hadith):");
    for (const issue of orphanedIssues) {
      console.log(`  - ${issue.collection}: ${issue.count} orphaned`);
      if (issue.samples) {
        for (const s of issue.samples.slice(0, 3)) {
          console.log(`      bookId=${s.bookId}, hadithNumber="${s.hadithNumber}"`);
        }
      }
    }
  }

  // 3. Check for sunnah.com availability
  console.log();
  console.log("3. SUNNAH.COM TRANSLATION AVAILABILITY");
  console.log("-".repeat(70));
  console.log("Collections known to have English on sunnah.com:");
  const sunnahCollections = [
    "bukhari",
    "muslim",
    "abudawud",
    "tirmidhi",
    "nasai",
    "ibnmajah",
    "malik",
    "riyadussalihin",
    "adab",
    "shamail",
    "bulugh",
    "mishkat",
    "qudsi40",
    "nawawi40",
    "hisn"
  ];

  for (const slug of sunnahCollections) {
    const stats = collectionStats.find((c) => c.slug === slug);
    if (stats) {
      const pct = stats.total > 0 ? ((stats.matched / stats.total) * 100).toFixed(1) : "0";
      const status = parseFloat(pct) >= 95 ? "OK" : parseFloat(pct) > 0 ? "PARTIAL" : "MISSING";
      console.log(`  ${slug.padEnd(16)} ${pct.padStart(6)}% - ${status}`);
    }
  }

  console.log("\nCollections WITHOUT English on sunnah.com:");
  const noEnglish = ["darimi", "ahmad"];
  for (const slug of noEnglish) {
    const stats = collectionStats.find((c) => c.slug === slug);
    if (stats) {
      console.log(`  ${slug.padEnd(16)} (Arabic only on sunnah.com)`);
    }
  }

  console.log();
  console.log("=".repeat(70));
}

main()
  .catch((e) => {
    console.error("Failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
