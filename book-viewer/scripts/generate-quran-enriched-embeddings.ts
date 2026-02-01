/**
 * Generate Tafsir-Enriched Quran Embeddings
 *
 * Creates embeddings for Quran ayahs using Al-Jalalayn tafsir text.
 * The tafsir text already includes the ayah (marked with brackets), providing
 * richer semantic content for better search retrieval of short ayahs.
 *
 * Stores embeddings in a separate Qdrant collection while preserving
 * original ayah text in payload for display.
 *
 * Usage: bun run scripts/generate-quran-enriched-embeddings.ts [--force] [--batch-size=50]
 *
 * Options:
 *   --force          Re-generate embeddings even if they already exist
 *   --batch-size=N   Number of ayahs to process in each batch (default: 50)
 */

import "dotenv/config";
import { prisma } from "../lib/db";
import {
  qdrant,
  QDRANT_QURAN_ENRICHED_COLLECTION,
  EMBEDDING_DIMENSIONS,
} from "../lib/qdrant";
import {
  generateEmbeddings,
  normalizeArabicText,
  truncateForEmbedding,
} from "../lib/embeddings";
import crypto from "crypto";

// Parse command line arguments
const forceFlag = process.argv.includes("--force");
const batchSizeArg = process.argv.find((arg) => arg.startsWith("--batch-size="));
const BATCH_SIZE = batchSizeArg
  ? parseInt(batchSizeArg.split("=")[1], 10)
  : 50;

const TAFSIR_SOURCE = "jalalayn";

/**
 * Generate a deterministic point ID for enriched ayahs
 */
function generateEnrichedAyahPointId(
  surahNumber: number,
  ayahNumber: number
): string {
  const input = `ayah_enriched_${surahNumber}_${ayahNumber}`;
  return crypto.createHash("md5").update(input).digest("hex");
}

/**
 * Initialize the enriched Quran collection if it doesn't exist
 */
async function initializeCollection(): Promise<void> {
  try {
    const collections = await qdrant.getCollections();
    const exists = collections.collections.some(
      (c) => c.name === QDRANT_QURAN_ENRICHED_COLLECTION
    );

    if (exists && forceFlag) {
      console.log(`Deleting existing collection: ${QDRANT_QURAN_ENRICHED_COLLECTION}`);
      await qdrant.deleteCollection(QDRANT_QURAN_ENRICHED_COLLECTION);
    }

    if (!exists || forceFlag) {
      console.log(`Creating collection: ${QDRANT_QURAN_ENRICHED_COLLECTION}`);
      await qdrant.createCollection(QDRANT_QURAN_ENRICHED_COLLECTION, {
        vectors: {
          size: EMBEDDING_DIMENSIONS,
          distance: "Cosine",
        },
        optimizers_config: {
          indexing_threshold: 10000,
        },
      });

      // Create payload indexes for filtering
      await qdrant.createPayloadIndex(QDRANT_QURAN_ENRICHED_COLLECTION, {
        field_name: "surahNumber",
        field_schema: "integer",
      });
      await qdrant.createPayloadIndex(QDRANT_QURAN_ENRICHED_COLLECTION, {
        field_name: "ayahNumber",
        field_schema: "integer",
      });

      console.log("Enriched Quran collection created with payload indexes\n");
    } else {
      console.log(`Collection already exists: ${QDRANT_QURAN_ENRICHED_COLLECTION}\n`);
    }
  } catch (error) {
    console.error("Error initializing collection:", error);
    throw error;
  }
}

/**
 * Get existing point IDs from Qdrant to skip already processed ayahs
 */
async function getExistingPointIds(): Promise<Set<string>> {
  if (forceFlag) {
    return new Set();
  }

  try {
    const existingIds = new Set<string>();
    let offset: string | null = null;

    while (true) {
      const result = await qdrant.scroll(QDRANT_QURAN_ENRICHED_COLLECTION, {
        limit: 1000,
        offset: offset ?? undefined,
        with_payload: false,
        with_vector: false,
      });

      for (const point of result.points) {
        existingIds.add(point.id as string);
      }

      if (!result.next_page_offset) {
        break;
      }
      offset = result.next_page_offset as string;
    }

    return existingIds;
  } catch {
    // Collection might be empty or not exist
    return new Set();
  }
}

interface AyahWithTafsir {
  ayahNumber: number;
  textUthmani: string;
  textPlain: string;
  juzNumber: number;
  pageNumber: number;
  surah: {
    number: number;
    nameArabic: string;
    nameEnglish: string;
  };
  tafsirText: string;
}

/**
 * Fetch ayahs with their tafsir text
 */
async function fetchAyahsWithTafsir(
  skip: number,
  take: number
): Promise<AyahWithTafsir[]> {
  // Get ayahs
  const ayahs = await prisma.ayah.findMany({
    skip,
    take,
    orderBy: [{ surahId: "asc" }, { ayahNumber: "asc" }],
    select: {
      ayahNumber: true,
      textUthmani: true,
      textPlain: true,
      juzNumber: true,
      pageNumber: true,
      surah: {
        select: {
          number: true,
          nameArabic: true,
          nameEnglish: true,
        },
      },
    },
  });

  // Fetch tafsir for these ayahs
  const surahAyahPairs = ayahs.map((a) => ({
    surahNumber: a.surah.number,
    ayahNumber: a.ayahNumber,
  }));

  const tafsirs = await prisma.ayahTafsir.findMany({
    where: {
      source: TAFSIR_SOURCE,
      OR: surahAyahPairs.map((p) => ({
        surahNumber: p.surahNumber,
        ayahNumber: p.ayahNumber,
      })),
    },
    select: {
      surahNumber: true,
      ayahNumber: true,
      text: true,
    },
  });

  // Create a map for quick lookup
  const tafsirMap = new Map<string, string>();
  for (const t of tafsirs) {
    tafsirMap.set(`${t.surahNumber}:${t.ayahNumber}`, t.text);
  }

  // Combine ayahs with tafsir
  return ayahs
    .map((ayah) => {
      const key = `${ayah.surah.number}:${ayah.ayahNumber}`;
      const tafsirText = tafsirMap.get(key);

      if (!tafsirText) {
        return null; // Skip ayahs without tafsir
      }

      return {
        ...ayah,
        tafsirText,
      };
    })
    .filter((a): a is AyahWithTafsir => a !== null);
}

/**
 * Process a batch of ayahs: generate embeddings and upsert to Qdrant
 */
async function processBatch(ayahs: AyahWithTafsir[]): Promise<number> {
  // Prepare texts for embedding - use tafsir text which includes the ayah
  const texts = ayahs.map((ayah) => {
    const normalized = normalizeArabicText(ayah.tafsirText);
    return truncateForEmbedding(normalized);
  });

  // Generate embeddings in batch
  const embeddings = await generateEmbeddings(texts);

  // Prepare points for Qdrant
  // Store original ayah text (not tafsir) in payload for display
  const points = ayahs.map((ayah, index) => ({
    id: generateEnrichedAyahPointId(ayah.surah.number, ayah.ayahNumber),
    vector: embeddings[index],
    payload: {
      surahNumber: ayah.surah.number,
      ayahNumber: ayah.ayahNumber,
      surahNameArabic: ayah.surah.nameArabic,
      surahNameEnglish: ayah.surah.nameEnglish,
      text: ayah.textUthmani, // Original ayah for display
      textPlain: ayah.textPlain, // For keyword matching
      juzNumber: ayah.juzNumber,
      pageNumber: ayah.pageNumber,
      tafsirSource: TAFSIR_SOURCE,
    },
  }));

  // Upsert to Qdrant
  await qdrant.upsert(QDRANT_QURAN_ENRICHED_COLLECTION, {
    wait: true,
    points,
  });

  return points.length;
}

async function main() {
  console.log("Tafsir-Enriched Quran Embedding Generation");
  console.log("=".repeat(60));
  console.log(`Collection: ${QDRANT_QURAN_ENRICHED_COLLECTION}`);
  console.log(`Tafsir source: ${TAFSIR_SOURCE}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Mode: ${forceFlag ? "Force regenerate all" : "Skip existing"}`);
  console.log();

  // Check if tafsir data exists
  const tafsirCount = await prisma.ayahTafsir.count({
    where: { source: TAFSIR_SOURCE },
  });

  if (tafsirCount === 0) {
    console.error(
      "No tafsir data found in database. Run import-tafsir.ts first."
    );
    return;
  }

  console.log(`Found ${tafsirCount} tafsir entries in database`);

  // Initialize collection
  await initializeCollection();

  // Get existing point IDs to skip
  console.log("Checking for existing embeddings...");
  const existingIds = await getExistingPointIds();
  console.log(`Found ${existingIds.size} existing embeddings\n`);

  // Get total ayah count
  const totalAyahs = await prisma.ayah.count();
  console.log(`Total ayahs in database: ${totalAyahs}\n`);

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let noTafsir = 0;
  let offset = 0;

  while (offset < totalAyahs) {
    // Fetch batch of ayahs with tafsir
    const ayahsWithTafsir = await fetchAyahsWithTafsir(offset, BATCH_SIZE);

    // Track ayahs without tafsir
    const fetchedCount = Math.min(BATCH_SIZE, totalAyahs - offset);
    noTafsir += fetchedCount - ayahsWithTafsir.length;

    if (ayahsWithTafsir.length === 0) {
      offset += BATCH_SIZE;
      continue;
    }

    // Filter out already processed ayahs
    const ayahsToProcess = ayahsWithTafsir.filter((ayah) => {
      const pointId = generateEnrichedAyahPointId(
        ayah.surah.number,
        ayah.ayahNumber
      );
      if (existingIds.has(pointId)) {
        skipped++;
        return false;
      }
      return true;
    });

    if (ayahsToProcess.length > 0) {
      try {
        const count = await processBatch(ayahsToProcess);
        processed += count;
        console.log(
          `Processed ${processed} ayahs (skipped: ${skipped}, no tafsir: ${noTafsir}, failed: ${failed})`
        );
      } catch (error) {
        console.error(`Batch failed:`, error);
        failed += ayahsToProcess.length;
      }
    }

    offset += BATCH_SIZE;

    // Rate limiting: pause briefly between batches
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log("\n" + "=".repeat(60));
  console.log("EMBEDDING SUMMARY");
  console.log("=".repeat(60));
  console.log(`Processed:  ${processed}`);
  console.log(`Skipped:    ${skipped}`);
  console.log(`No tafsir:  ${noTafsir}`);
  console.log(`Failed:     ${failed}`);
  console.log("=".repeat(60));

  // Verify collection
  try {
    const info = await qdrant.getCollection(QDRANT_QURAN_ENRICHED_COLLECTION);
    console.log(`\nEnriched collection points: ${info.points_count}`);
  } catch (error) {
    console.error("Could not get collection info:", error);
  }
}

main()
  .catch((e) => {
    console.error("\nEmbedding generation failed:");
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
