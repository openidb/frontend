/**
 * Update Hadith Qdrant Payloads
 *
 * Adds isChainVariation field to existing Qdrant hadith points based on
 * the is_chain_variation field in the PostgreSQL database.
 *
 * Prerequisites:
 * - Run mark-chain-variation-hadiths.ts first to populate the database field
 *
 * Usage: bun run scripts/update-hadith-qdrant-payloads.ts
 */

import { prisma } from "../lib/db";
import { qdrant, QDRANT_HADITH_COLLECTION } from "../lib/qdrant";

const BATCH_SIZE = 500;

async function main() {
  console.log("=== Update Hadith Qdrant Payloads ===\n");

  // Check collection exists
  try {
    const collectionInfo = await qdrant.getCollection(QDRANT_HADITH_COLLECTION);
    console.log(`Collection: ${QDRANT_HADITH_COLLECTION}`);
    console.log(`Points count: ${collectionInfo.points_count}`);
  } catch (error) {
    console.error(`Collection ${QDRANT_HADITH_COLLECTION} not found!`);
    process.exit(1);
  }

  // Get hadiths marked as chain variations from database
  const chainVariations = await prisma.hadith.findMany({
    where: { isChainVariation: true },
    select: {
      hadithNumber: true,
      book: {
        select: {
          bookNumber: true,
          collection: {
            select: { slug: true },
          },
        },
      },
    },
  });

  console.log(`\nHadiths marked as chain variations in DB: ${chainVariations.length}`);

  // Build lookup set for fast checking
  // Qdrant point IDs are constructed differently - we need to scroll and update
  // based on payload matching
  const chainVariationKeys = new Set(
    chainVariations.map(h => `${h.book.collection.slug}|${h.book.bookNumber}|${h.hadithNumber}`)
  );

  console.log(`Unique chain variation keys: ${chainVariationKeys.size}\n`);

  // Scroll through all points and update payloads
  let totalProcessed = 0;
  let totalUpdated = 0;
  let offset: string | number | null | undefined = undefined;

  console.log("Scrolling through Qdrant collection...\n");

  while (true) {
    const scrollResult = await qdrant.scroll(QDRANT_HADITH_COLLECTION, {
      limit: BATCH_SIZE,
      offset,
      with_payload: true,
      with_vector: false,
    });

    const points = scrollResult.points;
    if (points.length === 0) break;

    // Prepare batch update operations
    const pointsToUpdate: { id: string | number; payload: { isChainVariation: boolean } }[] = [];

    for (const point of points) {
      const payload = point.payload as {
        collectionSlug?: string;
        bookNumber?: number;
        hadithNumber?: string;
      };

      if (payload.collectionSlug && payload.bookNumber !== undefined && payload.hadithNumber) {
        const key = `${payload.collectionSlug}|${payload.bookNumber}|${payload.hadithNumber}`;
        const isChainVariation = chainVariationKeys.has(key);

        // Only update if it's a chain variation (or to ensure the field exists)
        pointsToUpdate.push({
          id: point.id,
          payload: { isChainVariation },
        });
      }
    }

    // Batch update payloads
    if (pointsToUpdate.length > 0) {
      // Use set_payload to add/update the field without overwriting other fields
      await qdrant.setPayload(QDRANT_HADITH_COLLECTION, {
        points: pointsToUpdate.map(p => p.id),
        payload: { isChainVariation: false }, // Default first
      });

      // Now set true for chain variations
      const chainVarPoints = pointsToUpdate.filter(p => p.payload.isChainVariation);
      if (chainVarPoints.length > 0) {
        await qdrant.setPayload(QDRANT_HADITH_COLLECTION, {
          points: chainVarPoints.map(p => p.id),
          payload: { isChainVariation: true },
        });
        totalUpdated += chainVarPoints.length;
      }
    }

    totalProcessed += points.length;

    // Get next offset
    offset = scrollResult.next_page_offset;

    const pct = offset ? "" : " (100%)";
    process.stdout.write(`\rProcessed: ${totalProcessed} points, ${totalUpdated} marked as chain variations${pct}`);

    if (!offset) break;
  }

  console.log("\n\n=== Update Complete ===");
  console.log(`Total points processed: ${totalProcessed}`);
  console.log(`Points marked as chain variations: ${totalUpdated}`);

  // Verify a sample
  console.log("\nVerifying sample chain variation points...");
  const sampleResult = await qdrant.scroll(QDRANT_HADITH_COLLECTION, {
    limit: 5,
    filter: {
      must: [{ key: "isChainVariation", match: { value: true } }],
    },
    with_payload: true,
  });

  if (sampleResult.points.length > 0) {
    console.log(`Found ${sampleResult.points.length} sample chain variation points:`);
    for (const point of sampleResult.points) {
      const p = point.payload as { collectionSlug: string; hadithNumber: string };
      console.log(`  - ${p.collectionSlug}:${p.hadithNumber}`);
    }
  } else {
    console.log("No points with isChainVariation=true found (this might be expected if none were marked)");
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Update failed:", err);
  process.exit(1);
});
