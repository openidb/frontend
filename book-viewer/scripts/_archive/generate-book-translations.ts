/**
 * Generate Book Title Translations Script
 *
 * Translates book titles using Google Gemini 2.0 Flash via OpenRouter.
 *
 * Usage:
 *   bun run scripts/generate-book-translations.ts [options]
 *
 * Options:
 *   --force           Force re-translation of existing translations
 *   --lang=en         Translate only specific language (comma-separated for multiple)
 *   --book=ID         Translate specific book by ID
 *   --dry-run         Show what would be translated without making API calls
 */

import "dotenv/config";
import { prisma } from "../lib/db";

// Languages to translate (matching app UI languages, excluding Arabic)
export const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "fr", name: "French" },
  { code: "id", name: "Indonesian" },
  { code: "ur", name: "Urdu" },
  { code: "es", name: "Spanish" },
  { code: "zh", name: "Chinese (Simplified)" },
  { code: "pt", name: "Portuguese" },
  { code: "ru", name: "Russian" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "it", name: "Italian" },
  { code: "bn", name: "Bengali" },
];

// OpenRouter configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = "google/gemini-2.0-flash-001"; // Fast and cost-effective

// Rate limiting
const REQUESTS_PER_MINUTE = 30;
const REQUEST_DELAY_MS = Math.ceil(60000 / REQUESTS_PER_MINUTE);

/**
 * Translate text using OpenRouter API
 */
export async function translateText(
  text: string,
  targetLang: string
): Promise<string | null> {
  if (!OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY not set");
    return null;
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: `This is an Arabic Islamic book title. Translate it naturally to the target language, preserving Islamic terminology where appropriate.

Translate this Arabic text to ${targetLang}. Return ONLY the translation, nothing else:

${text}`,
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`API error: ${response.status} - ${error}`);
      return null;
    }

    const data = await response.json();
    const translation = data.choices?.[0]?.message?.content?.trim();

    if (!translation) {
      console.error("Empty translation received");
      return null;
    }

    return translation;
  } catch (error) {
    console.error("Translation error:", error);
    return null;
  }
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Translate book titles
 */
export async function translateBookTitles(options: {
  force: boolean;
  languages: string[];
  bookId?: string;
  dryRun: boolean;
}): Promise<{ translated: number; skipped: number; failed: number }> {
  console.log("\n📚 Translating book titles...\n");

  let translated = 0;
  let skipped = 0;
  let failed = 0;

  // Get books to translate
  const whereClause = options.bookId ? { id: options.bookId } : {};
  const books = await prisma.book.findMany({
    where: whereClause,
    select: {
      id: true,
      titleArabic: true,
      titleTranslations: {
        select: { language: true },
      },
    },
  });

  console.log(`Found ${books.length} books to process\n`);

  for (const book of books) {
    console.log(`\n📖 ${book.titleArabic.substring(0, 50)}...`);

    for (const lang of options.languages) {
      // Check if translation already exists
      const hasTranslation = book.titleTranslations.some(t => t.language === lang);
      if (hasTranslation && !options.force) {
        skipped++;
        continue;
      }

      if (options.dryRun) {
        console.log(`   [DRY RUN] Would translate to ${lang}`);
        translated++;
        continue;
      }

      // Rate limiting
      await sleep(REQUEST_DELAY_MS);

      // Translate
      const langName = LANGUAGES.find(l => l.code === lang)?.name || lang;
      const translation = await translateText(book.titleArabic, langName);

      if (translation) {
        // Upsert translation
        await prisma.bookTitleTranslation.upsert({
          where: {
            bookId_language: {
              bookId: book.id,
              language: lang,
            },
          },
          create: {
            bookId: book.id,
            language: lang,
            title: translation,
          },
          update: {
            title: translation,
          },
        });
        console.log(`   ✅ ${lang}: ${translation.substring(0, 60)}...`);
        translated++;
      } else {
        console.log(`   ❌ ${lang}: Failed to translate`);
        failed++;
      }
    }
  }

  return { translated, skipped, failed };
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const force = args.includes("--force");
  const dryRun = args.includes("--dry-run");

  // Parse language filter
  const langArg = args.find(a => a.startsWith("--lang="));
  const languages = langArg
    ? langArg.replace("--lang=", "").split(",")
    : LANGUAGES.map(l => l.code);

  // Parse book ID filter
  const bookArg = args.find(a => a.startsWith("--book="));
  const bookId = bookArg ? bookArg.replace("--book=", "") : undefined;

  console.log("🌍 Book Title Translation Generator\n");
  console.log("Configuration:");
  console.log(`  Force: ${force}`);
  console.log(`  Dry run: ${dryRun}`);
  console.log(`  Languages: ${languages.join(", ")}`);
  console.log(`  Book ID: ${bookId || "all"}`);

  if (!OPENROUTER_API_KEY && !dryRun) {
    console.error("\n❌ OPENROUTER_API_KEY environment variable not set");
    process.exit(1);
  }

  const options = { force, languages, bookId, dryRun };

  // Translate book titles
  const titleStats = await translateBookTitles(options);

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 Summary\n");

  console.log("Book Titles:");
  console.log(`  ✅ Translated: ${titleStats.translated}`);
  console.log(`  ⏭️  Skipped: ${titleStats.skipped}`);
  console.log(`  ❌ Failed: ${titleStats.failed}`);

  console.log("\n✨ Done!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
