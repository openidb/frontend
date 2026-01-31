/**
 * Benchmark: Gemini Embedding vs EmbeddingGemma
 *
 * Compares latency and search quality between:
 *   - Gemini embedding-001 (via OpenRouter API, 3072 dims)
 *   - EmbeddingGemma-300M (local server, 768 dims)
 *
 * Prerequisites:
 *   1. Start embedding server: cd embedding-server && uvicorn main:app --port 8000
 *   2. Generate EmbeddingGemma embeddings: bun run scripts/generate-hadith-embeddings-gemma.ts
 *   3. Ensure OPENROUTER_API_KEY is set for Gemini comparisons
 *
 * Usage:
 *   bun run scripts/benchmark-embedding-models.ts
 */

import "dotenv/config";
import { qdrant } from "../lib/qdrant";
import { generateEmbedding } from "../lib/embeddings";
import {
  generateEmbeddingLocal,
  isEmbeddingServerAvailable,
} from "../lib/embeddings-local";

// Collection names
const QDRANT_HADITH_COLLECTION = "sunnah_hadiths";
const QDRANT_HADITH_GEMMA_COLLECTION = "sunnah_hadiths_gemma";

// Test queries (mix of Arabic and English)
const TEST_QUERIES = [
  "الصلاة",
  "الزكاة والصدقة",
  "أحكام الصيام في رمضان",
  "النبي صلى الله عليه وسلم",
  "prayer times",
  "الإيمان بالله واليوم الآخر",
  "فضل الصدقة",
  "أركان الإسلام",
];

// Number of iterations for latency benchmarks
const ITERATIONS = 5;

// Top K results to compare
const TOP_K = 10;

interface LatencyStats {
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
}

interface SearchResult {
  hadithNumber: string;
  collectionSlug: string;
  score: number;
}

function calculateStats(latencies: number[]): LatencyStats {
  const sorted = [...latencies].sort((a, b) => a - b);
  const n = sorted.length;

  return {
    avg: latencies.reduce((a, b) => a + b, 0) / n,
    p50: sorted[Math.floor(n * 0.5)],
    p95: sorted[Math.floor(n * 0.95)],
    p99: sorted[Math.floor(n * 0.99)],
    min: sorted[0],
    max: sorted[n - 1],
  };
}

async function benchmarkEmbeddingLatency(
  query: string,
  iterations: number
): Promise<{ gemini: LatencyStats; gemma: LatencyStats }> {
  const geminiLatencies: number[] = [];
  const gemmaLatencies: number[] = [];

  for (let i = 0; i < iterations; i++) {
    // Benchmark Gemini
    const geminiStart = performance.now();
    await generateEmbedding(query);
    geminiLatencies.push(performance.now() - geminiStart);

    // Benchmark EmbeddingGemma
    const gemmaStart = performance.now();
    await generateEmbeddingLocal(query);
    gemmaLatencies.push(performance.now() - gemmaStart);

    // Brief pause between iterations
    await new Promise((r) => setTimeout(r, 50));
  }

  return {
    gemini: calculateStats(geminiLatencies),
    gemma: calculateStats(gemmaLatencies),
  };
}

async function searchHadiths(
  embedding: number[],
  collection: string,
  limit: number
): Promise<SearchResult[]> {
  const results = await qdrant.search(collection, {
    vector: embedding,
    limit,
    with_payload: true,
  });

  return results.map((r) => ({
    hadithNumber: r.payload?.hadithNumber as string,
    collectionSlug: r.payload?.collectionSlug as string,
    score: r.score,
  }));
}

function calculateOverlap(
  resultsA: SearchResult[],
  resultsB: SearchResult[]
): number {
  const setA = new Set(
    resultsA.map((r) => `${r.collectionSlug}:${r.hadithNumber}`)
  );
  const setB = new Set(
    resultsB.map((r) => `${r.collectionSlug}:${r.hadithNumber}`)
  );

  let overlap = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      overlap++;
    }
  }

  return overlap;
}

async function checkCollectionExists(name: string): Promise<boolean> {
  try {
    const collections = await qdrant.getCollections();
    return collections.collections.some((c) => c.name === name);
  } catch {
    return false;
  }
}

async function main() {
  console.log("=".repeat(70));
  console.log("EMBEDDING MODEL BENCHMARK");
  console.log("Comparing Gemini embedding-001 vs EmbeddingGemma-300M");
  console.log("=".repeat(70));
  console.log();

  // Check prerequisites
  console.log("Checking prerequisites...\n");

  // Check embedding server
  const serverAvailable = await isEmbeddingServerAvailable();
  if (!serverAvailable) {
    console.error("ERROR: Local embedding server is not available!");
    console.error("Please start the server:");
    console.error("  cd embedding-server && uvicorn main:app --port 8000");
    process.exit(1);
  }
  console.log("  [OK] Local embedding server is running");

  // Check Qdrant collections
  const geminiCollectionExists = await checkCollectionExists(
    QDRANT_HADITH_COLLECTION
  );
  const gemmaCollectionExists = await checkCollectionExists(
    QDRANT_HADITH_GEMMA_COLLECTION
  );

  if (!geminiCollectionExists) {
    console.error(`ERROR: Collection '${QDRANT_HADITH_COLLECTION}' not found!`);
    console.error("Please generate Gemini embeddings first:");
    console.error("  bun run scripts/generate-embeddings.ts --hadiths-only");
    process.exit(1);
  }
  console.log(`  [OK] Gemini collection: ${QDRANT_HADITH_COLLECTION}`);

  if (!gemmaCollectionExists) {
    console.error(
      `ERROR: Collection '${QDRANT_HADITH_GEMMA_COLLECTION}' not found!`
    );
    console.error("Please generate EmbeddingGemma embeddings first:");
    console.error("  bun run scripts/generate-hadith-embeddings-gemma.ts");
    process.exit(1);
  }
  console.log(`  [OK] EmbeddingGemma collection: ${QDRANT_HADITH_GEMMA_COLLECTION}`);

  // Get collection info
  const geminiInfo = await qdrant.getCollection(QDRANT_HADITH_COLLECTION);
  const gemmaInfo = await qdrant.getCollection(QDRANT_HADITH_GEMMA_COLLECTION);
  console.log(`  Gemini collection points: ${geminiInfo.points_count}`);
  console.log(`  EmbeddingGemma collection points: ${gemmaInfo.points_count}`);
  console.log();

  // =========================================================================
  // LATENCY BENCHMARK
  // =========================================================================
  console.log("=".repeat(70));
  console.log(`EMBEDDING LATENCY (${ITERATIONS} iterations per query)`);
  console.log("=".repeat(70));
  console.log();

  const allGeminiLatencies: number[] = [];
  const allGemmaLatencies: number[] = [];

  for (const query of TEST_QUERIES) {
    process.stdout.write(`  "${query}"... `);
    const stats = await benchmarkEmbeddingLatency(query, ITERATIONS);

    allGeminiLatencies.push(stats.gemini.avg);
    allGemmaLatencies.push(stats.gemma.avg);

    console.log(
      `Gemini: ${stats.gemini.avg.toFixed(0)}ms, ` +
        `EmbeddingGemma: ${stats.gemma.avg.toFixed(0)}ms ` +
        `(${(stats.gemini.avg / stats.gemma.avg).toFixed(1)}x faster)`
    );
  }

  const overallGemini = calculateStats(allGeminiLatencies);
  const overallGemma = calculateStats(allGemmaLatencies);
  const speedup = overallGemini.avg / overallGemma.avg;

  console.log();
  console.log("Overall Latency Summary:");
  console.log("─".repeat(50));
  console.log(
    `  Gemini:         avg=${overallGemini.avg.toFixed(0)}ms   ` +
      `p50=${overallGemini.p50.toFixed(0)}ms   ` +
      `p95=${overallGemini.p95.toFixed(0)}ms`
  );
  console.log(
    `  EmbeddingGemma: avg=${overallGemma.avg.toFixed(0)}ms   ` +
      `p50=${overallGemma.p50.toFixed(0)}ms   ` +
      `p95=${overallGemma.p95.toFixed(0)}ms`
  );
  console.log(`  -> EmbeddingGemma is ${speedup.toFixed(1)}x faster`);
  console.log();

  // =========================================================================
  // SEARCH QUALITY BENCHMARK
  // =========================================================================
  console.log("=".repeat(70));
  console.log(`SEARCH QUALITY (Top-${TOP_K} Overlap)`);
  console.log("=".repeat(70));
  console.log();

  const overlaps: number[] = [];

  for (const query of TEST_QUERIES) {
    process.stdout.write(`  "${query}"... `);

    // Generate embeddings with both models
    const geminiEmbedding = await generateEmbedding(query);
    const gemmaEmbedding = await generateEmbeddingLocal(query);

    // Search with both embeddings
    const geminiResults = await searchHadiths(
      geminiEmbedding,
      QDRANT_HADITH_COLLECTION,
      TOP_K
    );
    const gemmaResults = await searchHadiths(
      gemmaEmbedding,
      QDRANT_HADITH_GEMMA_COLLECTION,
      TOP_K
    );

    // Calculate overlap
    const overlap = calculateOverlap(geminiResults, gemmaResults);
    overlaps.push(overlap);

    console.log(`${overlap}/${TOP_K} same results`);

    // Brief pause between queries
    await new Promise((r) => setTimeout(r, 100));
  }

  const avgOverlap = overlaps.reduce((a, b) => a + b, 0) / overlaps.length;
  const overlapPercentage = (avgOverlap / TOP_K) * 100;

  console.log();
  console.log("Overall Quality Summary:");
  console.log("─".repeat(50));
  console.log(
    `  Average overlap: ${avgOverlap.toFixed(1)}/${TOP_K} (${overlapPercentage.toFixed(0)}%)`
  );
  console.log();

  // =========================================================================
  // RECOMMENDATION
  // =========================================================================
  console.log("=".repeat(70));
  console.log("RECOMMENDATION");
  console.log("=".repeat(70));
  console.log();

  const latencyOk = overallGemma.avg < 50;
  const qualityOk = overlapPercentage >= 75;

  if (latencyOk && qualityOk) {
    console.log("  ✓ SWITCH TO EMBEDDINGGEMMA");
    console.log(`    - ${speedup.toFixed(0)}x faster embedding generation`);
    console.log(`    - ${overlapPercentage.toFixed(0)}% result quality maintained`);
    console.log("    - Free and runs locally");
  } else if (!latencyOk) {
    console.log("  ✗ KEEP GEMINI");
    console.log(
      `    - EmbeddingGemma latency (${overallGemma.avg.toFixed(0)}ms) above 50ms threshold`
    );
  } else {
    console.log("  ✗ KEEP GEMINI");
    console.log(
      `    - Quality overlap (${overlapPercentage.toFixed(0)}%) below 75% threshold`
    );
  }

  console.log();
  console.log("=".repeat(70));
  console.log("Benchmark completed!");
}

main().catch((e) => {
  console.error("Benchmark failed:", e);
  process.exit(1);
});
