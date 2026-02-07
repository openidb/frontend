/**
 * Migrate Hadith Qdrant Payloads - Add bookId
 *
 * Updates existing Qdrant hadith payloads to include bookId field,
 * eliminating the need for database lookups during search.
 *
 * This is a one-time migration that updates payloads without regenerating embeddings.
 *
 * Usage:
 *   bun run scripts/migrate-hadith-payloads-add-bookid.ts
 */

import "../env";
import { prisma } from "@web/lib/db";
import { qdrant, QDRANT_HADITH_COLLECTION } from "@web/lib/qdrant";

const BATCH_SIZE = 100;

async function main() {
  console.log("=".repeat(70));
  console.log("HADITH QDRANT PAYLOAD MIGRATION - Add bookId");
  console.log("=".repeat(70));
  console.log(`Collection: ${QDRANT_HADITH_COLLECTION}\n`);

  // Step 1: Build mapping of {collectionSlug, bookNumber} → bookId
  console.log("Step 1: Building book ID mapping from database...");

  const hadithBooks = await prisma.hadithBook.findMany({
    select: {
      id: true,
      bookNumber: true,
      collection: {
        select: { slug: true },
      },
    },
  });

  const bookIdMap = new Map<string, number>();
  for (const book of hadithBooks) {
    const key = `${book.collection.slug}|${book.bookNumber}`;
    bookIdMap.set(key, book.id);
  }
  console.log(`  Found ${bookIdMap.size} unique book entries\n`);

  // Step 2: Get collection info
  const collectionInfo = await qdrant.getCollection(QDRANT_HADITH_COLLECTION);
  const totalPoints = collectionInfo.points_count || 0;
  console.log(`Step 2: Collection has ${totalPoints} points to update\n`);

  // Step 3: Scroll through all points and update payloads
  console.log("Step 3: Updating payloads with bookId...\n");

  let processedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let offset: string | number | null | undefined = undefined;

  while (true) {
    // Scroll through points
    const scrollResult = await qdrant.scroll(QDRANT_HADITH_COLLECTION, {
      limit: BATCH_SIZE,
      offset,
      with_payload: true,
      with_vector: false, // Don't need vectors, just payloads
    });

    const points = scrollResult.points;
    if (points.length === 0) break;

    // Prepare batch update
    const updates: { id: string | number; payload: { bookId: number } }[] = [];

    for (const point of points) {
      const payload = point.payload as {
        collectionSlug?: string;
        bookNumber?: number;
        bookId?: number;
      };

      // Skip if already has bookId
      if (payload.bookId !== undefined) {
        skippedCount++;
        continue;
      }

      const key = `${payload.collectionSlug}|${payload.bookNumber}`;
      const bookId = bookIdMap.get(key);

      if (bookId !== undefined) {
        updates.push({
          id: point.id,
          payload: { bookId },
        });
      } else {
        errorCount++;
        console.warn(`  Warning: No bookId found for ${key}`);
      }
    }

    // Batch update payloads
    if (updates.length > 0) {
      await qdrant.setPayload(QDRANT_HADITH_COLLECTION, {
        points: updates.map((u) => u.id),
        payload: {}, // Will be set per-point below
      });

      // Qdrant doesn't support batch per-point payload updates easily,
      // so we need to update individually or use overwrite
      for (const update of updates) {
        await qdrant.setPayload(QDRANT_HADITH_COLLECTION, {
          points: [update.id],
          payload: update.payload,
        });
      }
      updatedCount += updates.length;
    }

    processedCount += points.length;
    offset = scrollResult.next_page_offset as string | number | null | undefined;

    // Progress update
    const progress = ((processedCount / totalPoints) * 100).toFixed(1);
    process.stdout.write(
      `\r  Progress: ${processedCount}/${totalPoints} (${progress}%) - Updated: ${updatedCount}, Skipped: ${skippedCount}`
    );

    if (!offset) break;
  }

  console.log("\n");
  console.log("=".repeat(70));
  console.log("MIGRATION COMPLETE");
  console.log("=".repeat(70));
  console.log(`  Total processed: ${processedCount}`);
  console.log(`  Updated:         ${updatedCount}`);
  console.log(`  Skipped:         ${skippedCount} (already had bookId)`);
  console.log(`  Errors:          ${errorCount}`);

  // Verify a sample
  console.log("\nVerifying migration...");
  const sample = await qdrant.scroll(QDRANT_HADITH_COLLECTION, {
    limit: 3,
    with_payload: true,
  });

  for (const point of sample.points) {
    const payload = point.payload as { collectionSlug?: string; bookNumber?: number; bookId?: number };
    console.log(
      `  ${payload.collectionSlug} book ${payload.bookNumber} → bookId: ${payload.bookId}`
    );
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
