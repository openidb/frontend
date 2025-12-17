/**
 * Migration Script: JSON to PostgreSQL
 *
 * This script migrates existing JSON data (catalog.json, authors-metadata.json)
 * into the PostgreSQL database using Prisma ORM.
 *
 * Usage: bun run scripts/migrate-json-to-db.ts
 */

import "dotenv/config";
import { prisma } from "../lib/db";
import catalog from "../lib/catalog.json";
import authorsMetadata from "../lib/authors-metadata.json";

// Helper function to convert Arabic numerals to Western numerals
function arabicToWestern(str: string): string {
  if (!str) return str;
  return str
    .replace(/٠/g, '0')
    .replace(/١/g, '1')
    .replace(/٢/g, '2')
    .replace(/٣/g, '3')
    .replace(/٤/g, '4')
    .replace(/٥/g, '5')
    .replace(/٦/g, '6')
    .replace(/٧/g, '7')
    .replace(/٨/g, '8')
    .replace(/٩/g, '9');
}

interface AuthorMetadata {
  name_arabic: string;
  name_latin: string;
  shamela_author_id?: string;
  death_date_hijri?: string;
  birth_date_hijri?: string;
  death_date_gregorian?: string;
  birth_date_gregorian?: string;
  biography?: string;
  biography_source?: string | null;
  books_count?: number;
  books?: Array<{ id: string; title: string }>;
}

interface CatalogBook {
  id: string;
  title: string;
  titleLatin: string;
  author: string;
  authorLatin: string;
  datePublished: string;
  filename: string;
  category: string;
  subcategory?: string | null;
  yearAH: number;
  timePeriod: string;
}

async function main() {
  console.log("🚀 Starting data migration from JSON to PostgreSQL...\n");

  // Step 1: Migrate Authors
  console.log("📝 Step 1: Migrating authors...");
  const authorMap = new Map<string, number>(); // Map authorLatin -> database ID

  const authorsData = authorsMetadata as Record<string, AuthorMetadata>;
  let authorCount = 0;

  for (const [authorLatin, metadata] of Object.entries(authorsData)) {
    try {
      const author = await prisma.author.upsert({
        where: { nameLatin: authorLatin },
        update: {
          nameArabic: metadata.name_arabic,
          shamelaAuthorId: metadata.shamela_author_id || null,
          birthDateHijri: metadata.birth_date_hijri
            ? arabicToWestern(metadata.birth_date_hijri)
            : null,
          deathDateHijri: metadata.death_date_hijri
            ? arabicToWestern(metadata.death_date_hijri)
            : null,
          birthDateGregorian: metadata.birth_date_gregorian
            ? arabicToWestern(metadata.birth_date_gregorian)
            : null,
          deathDateGregorian: metadata.death_date_gregorian
            ? arabicToWestern(metadata.death_date_gregorian)
            : null,
          biography: metadata.biography || null,
          biographySource: metadata.biography_source || null,
        },
        create: {
          nameLatin: authorLatin,
          nameArabic: metadata.name_arabic,
          shamelaAuthorId: metadata.shamela_author_id || null,
          birthDateHijri: metadata.birth_date_hijri
            ? arabicToWestern(metadata.birth_date_hijri)
            : null,
          deathDateHijri: metadata.death_date_hijri
            ? arabicToWestern(metadata.death_date_hijri)
            : null,
          birthDateGregorian: metadata.birth_date_gregorian
            ? arabicToWestern(metadata.birth_date_gregorian)
            : null,
          deathDateGregorian: metadata.death_date_gregorian
            ? arabicToWestern(metadata.death_date_gregorian)
            : null,
          biography: metadata.biography || null,
          biographySource: metadata.biography_source || null,
        },
      });

      authorMap.set(authorLatin, author.id);
      authorCount++;
      console.log(`  ✓ ${authorLatin} (ID: ${author.id})`);
    } catch (error) {
      console.error(`  ✗ Failed to migrate author ${authorLatin}:`, error);
    }
  }

  console.log(`\n✅ Migrated ${authorCount} authors\n`);

  // Step 2: Migrate Categories
  console.log("📝 Step 2: Migrating categories...");
  const categoryMap = new Map<string, number>(); // Map category name -> database ID

  const uniqueCategories = new Set<string>();
  (catalog as CatalogBook[]).forEach(book => {
    if (book.category) {
      uniqueCategories.add(book.category);
    }
  });

  let categoryCount = 0;
  for (const categoryName of uniqueCategories) {
    try {
      const category = await prisma.category.upsert({
        where: { nameArabic: categoryName },
        update: {},
        create: {
          nameArabic: categoryName,
        },
      });

      categoryMap.set(categoryName, category.id);
      categoryCount++;
      console.log(`  ✓ ${categoryName} (ID: ${category.id})`);
    } catch (error) {
      console.error(`  ✗ Failed to migrate category ${categoryName}:`, error);
    }
  }

  console.log(`\n✅ Migrated ${categoryCount} categories\n`);

  // Step 3: Migrate Books
  console.log("📝 Step 3: Migrating books...");
  let bookCount = 0;
  let skippedBooks = 0;

  for (const book of catalog as CatalogBook[]) {
    const authorId = authorMap.get(book.authorLatin);

    if (!authorId) {
      console.warn(`  ⚠ Skipping book "${book.title}" - author "${book.authorLatin}" not found`);
      skippedBooks++;
      continue;
    }

    const categoryId = book.category ? categoryMap.get(book.category) : null;

    try {
      await prisma.book.upsert({
        where: { shamelaBookId: book.id },
        update: {
          titleArabic: book.title,
          titleLatin: book.titleLatin,
          authorId,
          categoryId: categoryId || null,
          filename: book.filename,
          timePeriod: book.timePeriod || null,
          publicationYearHijri: book.yearAH > 0 ? book.yearAH.toString() : null,
          publicationYearGregorian:
            book.datePublished && book.datePublished !== "TEST"
              ? book.datePublished
              : null,
        },
        create: {
          shamelaBookId: book.id,
          titleArabic: book.title,
          titleLatin: book.titleLatin,
          authorId,
          categoryId: categoryId || null,
          filename: book.filename,
          timePeriod: book.timePeriod || null,
          publicationYearHijri: book.yearAH > 0 ? book.yearAH.toString() : null,
          publicationYearGregorian:
            book.datePublished && book.datePublished !== "TEST"
              ? book.datePublished
              : null,
        },
      });

      bookCount++;
      console.log(`  ✓ ${book.title} (Shamela ID: ${book.id})`);
    } catch (error) {
      console.error(`  ✗ Failed to migrate book "${book.title}":`, error);
    }
  }

  console.log(`\n✅ Migrated ${bookCount} books`);
  if (skippedBooks > 0) {
    console.log(`⚠ Skipped ${skippedBooks} books due to missing authors\n`);
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 MIGRATION SUMMARY");
  console.log("=".repeat(60));
  console.log(`Authors:    ${authorCount}`);
  console.log(`Categories: ${categoryCount}`);
  console.log(`Books:      ${bookCount}`);
  console.log(`Skipped:    ${skippedBooks}`);
  console.log("=".repeat(60));
  console.log("\n✨ Migration completed successfully!");
}

main()
  .catch((e) => {
    console.error("\n❌ Migration failed:");
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
