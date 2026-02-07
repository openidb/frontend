/**
 * Import Malik translations from local HTML cache
 *
 * Malik has a special numbering system with suffixes (A, R, U).
 * This script tries to match sunnah.com numbers to database numbers.
 */

import "dotenv/config";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";
import { prisma } from "../lib/db";

const CACHE_DIR = "/Volumes/KIOXIA/sunnah-html/malik";
const dryRun = process.argv.includes("--dry-run");

interface Translation {
  bookNumber: number;
  hadithNumber: string;
  text: string;
}

async function main() {
  console.log("=".repeat(60));
  console.log("IMPORT MALIK TRANSLATIONS");
  console.log("=".repeat(60));
  console.log(`Dry run: ${dryRun}`);
  console.log();

  // Build hadith lookup map: bookNumber -> numericPart -> full hadithNumbers
  console.log("Building hadith number mapping...");

  const malikBooks = await prisma.hadithBook.findMany({
    where: { collection: { slug: "malik" } },
    select: { id: true, bookNumber: true }
  });

  const bookIdMap = new Map<number, number>();
  for (const book of malikBooks) {
    bookIdMap.set(book.bookNumber, book.id);
  }

  const malikHadiths = await prisma.hadith.findMany({
    where: {
      book: { collection: { slug: "malik" } }
    },
    select: {
      hadithNumber: true,
      book: { select: { bookNumber: true } }
    }
  });

  // Map: bookNumber -> numericPart -> [full hadithNumbers]
  const hadithMap = new Map<number, Map<string, string[]>>();
  for (const h of malikHadiths) {
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

  console.log(`Mapped ${malikHadiths.length} hadiths\n`);

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

      // Extract hadith number from sharelink: share(this, '/malik/1/1')
      const onclick = $c.find(".sharelink").attr("onclick") || "";
      const match = onclick.match(/share\(this,\s*'\/malik\/\d+\/(\d+)'\)/);

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

      const textDetails = englishContainer.find(".text_details").text().trim();
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

      // Prefer A suffix, then no suffix, then R, then U
      let targetHadithNumber: string;
      if (possibleNumbers.length === 1) {
        targetHadithNumber = possibleNumbers[0];
      } else {
        // Multiple matches - try to pick best one
        const withA = possibleNumbers.find(n => n.endsWith("A"));
        const noSuffix = possibleNumbers.find(n => /^\d+$/.test(n));
        const withR = possibleNumbers.find(n => n.endsWith("R"));

        targetHadithNumber = withA || noSuffix || withR || possibleNumbers[0];
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
