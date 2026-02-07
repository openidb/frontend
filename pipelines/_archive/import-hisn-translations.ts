/**
 * Import Hisn al-Muslim translations from local HTML cache
 *
 * Hisn has a different structure - all hadiths are in index.html
 * with translations in <span class="translation"> elements
 */

import "../env";
import * as cheerio from "cheerio";
import * as fs from "fs";
import { prisma } from "@web/lib/db";

const CACHE_FILE = "/Volumes/KIOXIA/sunnah-html/hisn/index.html";
const dryRun = process.argv.includes("--dry-run");

async function main() {
  console.log("=".repeat(60));
  console.log("IMPORT HISN AL-MUSLIM TRANSLATIONS");
  console.log("=".repeat(60));
  console.log(`Dry run: ${dryRun}`);
  console.log();

  if (!fs.existsSync(CACHE_FILE)) {
    console.error(`Cache file not found: ${CACHE_FILE}`);
    process.exit(1);
  }

  const html = fs.readFileSync(CACHE_FILE, "utf-8");
  const $ = cheerio.load(html);

  // Get hisn book ID
  const book = await prisma.hadithBook.findFirst({
    where: {
      collection: { slug: "hisn" }
    },
    select: { id: true }
  });

  if (!book) {
    console.error("Hisn book not found in database");
    process.exit(1);
  }

  console.log(`Hisn book ID: ${book.id}`);
  console.log();

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  const containers = $(".actualHadithContainer").toArray();

  for (const container of containers) {
    const $c = $(container);

    // Get hadith number from sharelink onclick="share(this, '/hisn:1')"
    const onclick = $c.find(".sharelink").attr("onclick") || "";
    const match = onclick.match(/share\(this,\s*'\/hisn:(\d+)'\)/);

    if (!match) {
      skipped++;
      continue;
    }

    const hadithNumber = match[1];

    // Get translation text from <span class="translation">
    const translation = $c.find(".translation").text().trim();

    if (!translation || translation.length < 5) {
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`[DRY-RUN] ${hadithNumber}: ${translation.slice(0, 80)}...`);
      imported++;
      continue;
    }

    try {
      await prisma.hadithTranslation.upsert({
        where: {
          bookId_hadithNumber_language: {
            bookId: book.id,
            hadithNumber,
            language: "en",
          },
        },
        update: { text: translation },
        create: {
          bookId: book.id,
          hadithNumber,
          language: "en",
          text: translation,
        },
      });
      imported++;
      process.stdout.write(`\rImported: ${imported}`);
    } catch (error) {
      errors++;
      console.error(`\nError importing ${hadithNumber}:`, error);
    }
  }

  console.log("\n");
  console.log("=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Imported: ${imported}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);
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
