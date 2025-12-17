#!/usr/bin/env node
/**
 * Save Book Metadata to Database
 *
 * This script is called by Python scrapers to save book metadata to PostgreSQL.
 * It reads JSON from stdin and saves it to the database.
 *
 * Usage: cat metadata.json | bun run scripts/save-book-metadata.ts
 * Or: echo '{"book": {...}, "author": {...}}' | bun run scripts/save-book-metadata.ts
 */

import "dotenv/config";
import { prisma } from "../lib/db";

// Helper function to convert Arabic numerals to Western numerals
function arabicToWestern(str: string): string {
  if (!str) return str;
  return str
    .replace(/٠/g, "0")
    .replace(/١/g, "1")
    .replace(/٢/g, "2")
    .replace(/٣/g, "3")
    .replace(/٤/g, "4")
    .replace(/٥/g, "5")
    .replace(/٦/g, "6")
    .replace(/٧/g, "7")
    .replace(/٨/g, "8")
    .replace(/٩/g, "9");
}

interface BookMetadata {
  shamela_book_id: string;
  title_arabic: string;
  title_latin: string;
  author_arabic: string;
  author_latin: string;
  shamela_author_id?: string;
  category_arabic?: string;
  category_english?: string;
  shamela_category_id?: string;
  publisher?: string;
  publisher_location?: string;
  editor?: string;
  publication_year_hijri?: string;
  publication_year_gregorian?: string;
  publication_edition?: string;
  publication_location?: string;
  isbn?: string;
  total_volumes?: number;
  total_pages?: number;
  page_alignment_note?: string;
  verification_status?: string;
  editorial_type?: string;
  institution?: string;
  supervisor?: string;
  description_html?: string;
  summary?: string;
  time_period?: string;
  filename: string;
}

interface AuthorMetadata {
  shamela_author_id?: string;
  name_arabic: string;
  name_latin: string;
  birth_date_hijri?: string;
  death_date_hijri?: string;
  birth_date_gregorian?: string;
  death_date_gregorian?: string;
  biography?: string;
  biography_source?: string;
}

interface InputData {
  book: BookMetadata;
  author?: AuthorMetadata;
}

async function saveMetadata(data: InputData) {
  console.error("📝 Saving metadata to database...");

  // Step 1: Upsert Author
  let authorId: number;
  const authorData = data.author || {
    name_arabic: data.book.author_arabic,
    name_latin: data.book.author_latin,
    shamela_author_id: data.book.shamela_author_id,
  };

  const author = await prisma.author.upsert({
    where: { nameLatin: authorData.name_latin },
    update: {
      nameArabic: authorData.name_arabic,
      shamelaAuthorId: authorData.shamela_author_id || null,
      birthDateHijri: authorData.birth_date_hijri
        ? arabicToWestern(authorData.birth_date_hijri)
        : null,
      deathDateHijri: authorData.death_date_hijri
        ? arabicToWestern(authorData.death_date_hijri)
        : null,
      birthDateGregorian: authorData.birth_date_gregorian
        ? arabicToWestern(authorData.birth_date_gregorian)
        : null,
      deathDateGregorian: authorData.death_date_gregorian
        ? arabicToWestern(authorData.death_date_gregorian)
        : null,
      biography: authorData.biography || null,
      biographySource: authorData.biography_source || null,
    },
    create: {
      nameLatin: authorData.name_latin,
      nameArabic: authorData.name_arabic,
      shamelaAuthorId: authorData.shamela_author_id || null,
      birthDateHijri: authorData.birth_date_hijri
        ? arabicToWestern(authorData.birth_date_hijri)
        : null,
      deathDateHijri: authorData.death_date_hijri
        ? arabicToWestern(authorData.death_date_hijri)
        : null,
      birthDateGregorian: authorData.birth_date_gregorian
        ? arabicToWestern(authorData.birth_date_gregorian)
        : null,
      deathDateGregorian: authorData.death_date_gregorian
        ? arabicToWestern(authorData.death_date_gregorian)
        : null,
      biography: authorData.biography || null,
      biographySource: authorData.biography_source || null,
    },
  });

  authorId = author.id;
  console.error(`  ✓ Author: ${author.nameLatin} (ID: ${authorId})`);

  // Step 2: Upsert Category (if provided)
  let categoryId: number | null = null;
  if (data.book.category_arabic) {
    const category = await prisma.category.upsert({
      where: { nameArabic: data.book.category_arabic },
      update: {
        nameEnglish: data.book.category_english || null,
        shamelaCategoryId: data.book.shamela_category_id || null,
      },
      create: {
        nameArabic: data.book.category_arabic,
        nameEnglish: data.book.category_english || null,
        shamelaCategoryId: data.book.shamela_category_id || null,
      },
    });
    categoryId = category.id;
    console.error(`  ✓ Category: ${category.nameArabic} (ID: ${categoryId})`);
  }

  // Step 3: Upsert Publisher (if provided)
  let publisherId: number | null = null;
  if (data.book.publisher) {
    const publisher = await prisma.publisher.upsert({
      where: { name: data.book.publisher },
      update: {
        location: data.book.publisher_location || null,
      },
      create: {
        name: data.book.publisher,
        location: data.book.publisher_location || null,
      },
    });
    publisherId = publisher.id;
    console.error(`  ✓ Publisher: ${publisher.name} (ID: ${publisherId})`);
  }

  // Step 4: Upsert Editor (if provided)
  let editorId: number | null = null;
  if (data.book.editor) {
    const editor = await prisma.editor.upsert({
      where: { name: data.book.editor },
      update: {},
      create: {
        name: data.book.editor,
      },
    });
    editorId = editor.id;
    console.error(`  ✓ Editor: ${editor.name} (ID: ${editorId})`);
  }

  // Step 5: Upsert Book
  const book = await prisma.book.upsert({
    where: { shamelaBookId: data.book.shamela_book_id },
    update: {
      titleArabic: data.book.title_arabic,
      titleLatin: data.book.title_latin,
      authorId,
      categoryId,
      publisherId,
      editorId,
      publicationYearHijri: data.book.publication_year_hijri || null,
      publicationYearGregorian: data.book.publication_year_gregorian || null,
      publicationEdition: data.book.publication_edition || null,
      publicationLocation: data.book.publication_location || null,
      isbn: data.book.isbn || null,
      totalVolumes: data.book.total_volumes || 1,
      totalPages: data.book.total_pages || null,
      pageAlignmentNote: data.book.page_alignment_note || null,
      verificationStatus: data.book.verification_status || null,
      editorialType: data.book.editorial_type || null,
      institution: data.book.institution || null,
      supervisor: data.book.supervisor || null,
      descriptionHtml: data.book.description_html || null,
      summary: data.book.summary || null,
      filename: data.book.filename,
      timePeriod: data.book.time_period || null,
    },
    create: {
      shamelaBookId: data.book.shamela_book_id,
      titleArabic: data.book.title_arabic,
      titleLatin: data.book.title_latin,
      authorId,
      categoryId,
      publisherId,
      editorId,
      publicationYearHijri: data.book.publication_year_hijri || null,
      publicationYearGregorian: data.book.publication_year_gregorian || null,
      publicationEdition: data.book.publication_edition || null,
      publicationLocation: data.book.publication_location || null,
      isbn: data.book.isbn || null,
      totalVolumes: data.book.total_volumes || 1,
      totalPages: data.book.total_pages || null,
      pageAlignmentNote: data.book.page_alignment_note || null,
      verificationStatus: data.book.verification_status || null,
      editorialType: data.book.editorial_type || null,
      institution: data.book.institution || null,
      supervisor: data.book.supervisor || null,
      descriptionHtml: data.book.description_html || null,
      summary: data.book.summary || null,
      filename: data.book.filename,
      timePeriod: data.book.time_period || null,
    },
  });

  console.error(`  ✓ Book: ${book.titleArabic} (ID: ${book.id})`);

  return {
    success: true,
    book_id: book.id,
    author_id: authorId,
    category_id: categoryId,
    publisher_id: publisherId,
    editor_id: editorId,
  };
}

// Read JSON from stdin
async function main() {
  let inputData = "";

  // Read from stdin
  process.stdin.setEncoding("utf8");

  for await (const chunk of process.stdin) {
    inputData += chunk;
  }

  if (!inputData.trim()) {
    console.error("❌ Error: No input data provided");
    console.error("Usage: cat metadata.json | bun run scripts/save-book-metadata.ts");
    process.exit(1);
  }

  try {
    const data = JSON.parse(inputData) as InputData;

    if (!data.book) {
      console.error("❌ Error: Missing 'book' field in input data");
      process.exit(1);
    }

    const result = await saveMetadata(data);

    // Output result as JSON to stdout
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("❌ Error saving metadata:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
