/**
 * Import Bulugh al-Maram translations from local HTML cache
 *
 * Bulugh has hadith numbers with suffixes (E, A, or none).
 * Sunnah.com uses plain numbers. This script matches them.
 */

import "../env";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";
import { prisma } from "@web/lib/db";

const CACHE_DIR = "/Volumes/KIOXIA/sunnah-html/bulugh";
const dryRun = process.argv.includes("--dry-run");

async function main() {
  console.log("=".repeat(60));
  console.log("IMPORT BULUGH TRANSLATIONS");
  console.log("=".repeat(60));
  console.log(`Dry run: ${dryRun}`);
  console.log();

  // Build hadith lookup map
  console.log("Building hadith number mapping...");

  const bulughBooks = await prisma.hadithBook.findMany({
    where: { collection: { slug: "bulugh" } },
    select: { id: true, bookNumber: true }
  });

  const bookIdMap = new Map<number, number>();
  for (const book of bulughBooks) {
    bookIdMap.set(book.bookNumber, book.id);
  }

  const bulughHadiths = await prisma.hadith.findMany({
    where: {
      book: { collection: { slug: "bulugh" } }
    },
    select: {
      hadithNumber: true,
      book: { select: { bookNumber: true } }
    }
  });

  // Map: bookNumber -> numericPart -> [full hadithNumbers]
  const hadithMap = new Map<number, Map<string, string[]>>();
  for (const h of bulughHadiths) {
    const bookNum = h.book.bookNumber;
    const numericPart = h.hadithNumber.replace(/[A-Za-z]+$/, '');

    if (!hadithMap.has(bookNum)) {
      hadithMap.set(bookNum, new Map());
    }
    const bookMap = hadithMap.get(bookNum)!;

    if (!bookMap.has(numericPart)) {
      bookMap.set(numericPart, []);
    }
    bookMap.get(numericPart)!.push(h.hadithNumber);
  }

  console.log(`Mapped ${bulughHadiths.length} hadiths\n`);

  // Process HTML files
  const htmlFiles = fs.readdirSync(CACHE_DIR)
    .filter(f => f.endsWith(".html") && f !== "index.html")
    .sort((a, b) => parseInt(a) - parseInt(b));

  let imported = 0;
  let skipped = 0;
  let notFound = 0;
  let ambiguous = 0;

  for (const htmlFile of htmlFiles) {
    const bookNumber = parseInt(htmlFile.replace(".html", ""), 10);
    if (isNaN(bookNumber)) continue;

    const bookId = bookIdMap.get(bookNumber);

    if (!bookId) {
      console.log(`Skipping book ${bookNumber}: not in database`);
      continue;
    }

    const filepath = path.join(CACHE_DIR, htmlFile);
    const html = fs.readFileSync(filepath, "utf-8");
    const $ = cheerio.load(html);

    const bookHadithMap = hadithMap.get(bookNumber) || new Map();

    const containers = $(".actualHadithContainer").toArray();

    for (const container of containers) {
      const $c = $(container);

      // Extract hadith number from sharelink
      // Book 1 uses: share(this, '/bulugh:1')
      // Books 2-16 use: share(this, '/bulugh/2/1')
      const onclick = $c.find(".sharelink").attr("onclick") || "";
      let match = onclick.match(/share\(this,\s*'\/bulugh:(\d+)'\)/);
      if (!match) {
        match = onclick.match(/share\(this,\s*'\/bulugh\/\d+\/(\d+)'\)/);
      }

      if (!match) {
        skipped++;
        continue;
      }

      const numericHadith = match[1];

      // Get English translation
      const englishContainer = $c.find(".englishcontainer");
      if (!englishContainer.length) {
        skipped++;
        continue;
      }

      // Try multiple methods to extract text
      let textDetails = englishContainer.find(".text_details").text().trim();
      if (!textDetails) {
        textDetails = englishContainer.find(".english_hadith_full").text().trim();
      }

      if (!textDetails || textDetails.length < 10) {
        skipped++;
        continue;
      }

      // Clean up text
      const cleanText = textDetails.replace(/\s+/g, " ").trim();

      // Find matching hadith number in database
      const possibleNumbers = bookHadithMap.get(numericHadith) || [];

      if (possibleNumbers.length === 0) {
        notFound++;
        continue;
      }

      // Prefer no suffix, then E suffix, then A suffix
      let targetHadithNumber: string;
      if (possibleNumbers.length === 1) {
        targetHadithNumber = possibleNumbers[0];
      } else {
        const noSuffix = possibleNumbers.find(n => /^\d+$/.test(n));
        const withE = possibleNumbers.find(n => n.endsWith("E"));
        const withA = possibleNumbers.find(n => n.endsWith("A"));

        targetHadithNumber = noSuffix || withE || withA || possibleNumbers[0];
        ambiguous++;
      }

      if (dryRun) {
        console.log(`[DRY-RUN] Book ${bookNumber}, ${numericHadith} -> ${targetHadithNumber}: ${cleanText.slice(0, 60)}...`);
        imported++;
        continue;
      }

      // Store translation
      try {
        await prisma.hadithTranslation.upsert({
          where: {
            bookId_hadithNumber_language: {
              bookId,
              hadithNumber: targetHadithNumber,
              language: "en",
            },
          },
          update: { text: cleanText },
          create: {
            bookId,
            hadithNumber: targetHadithNumber,
            language: "en",
            text: cleanText,
          },
        });
        imported++;
      } catch (err: any) {
        console.error(`\nError storing ${bookNumber}:${targetHadithNumber}:`, err.message);
      }
    }

    process.stdout.write(`\rProcessed book ${bookNumber}: ${imported} imported`);
  }

  console.log("\n");
  console.log("=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Imported: ${imported}`);
  console.log(`Skipped (no English): ${skipped}`);
  console.log(`Not found in DB: ${notFound}`);
  console.log(`Ambiguous matches: ${ambiguous}`);
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
