/**
 * Compare Quran Embedding Collections
 *
 * Tests retrieval quality between original ayah embeddings and
 * tafsir-enriched embeddings for semantic search.
 *
 * Usage: bun run scripts/compare-quran-embeddings.ts
 */

import "../env";
import {
  qdrant,
  QDRANT_QURAN_COLLECTION,
  QDRANT_QURAN_ENRICHED_COLLECTION,
} from "@web/lib/qdrant";
import { generateEmbedding, normalizeArabicText } from "@web/lib/embeddings";
import { prisma } from "@web/lib/db";

interface SearchResult {
  surahNumber: number;
  ayahNumber: number;
  score: number;
  text: string;
  surahName: string;
}

interface TestCase {
  query: string;
  description: string;
  expectedSurahs?: number[]; // Surahs we expect to see in top results
  expectedAyahs?: Array<{ surah: number; ayah: number }>; // Specific ayahs expected
}

// Test cases focusing on concepts that should match short ayahs
const TEST_CASES: TestCase[] = [
  {
    query: "التوحيد",
    description: "Monotheism/Oneness of God - should match Al-Ikhlas",
    expectedSurahs: [112],
    expectedAyahs: [{ surah: 112, ayah: 1 }],
  },
  {
    query: "الله أحد",
    description: "God is One - direct match for Al-Ikhlas",
    expectedSurahs: [112],
  },
  {
    query: "الصمد",
    description: "The Eternal Refuge - Al-Ikhlas ayah 2",
    expectedSurahs: [112],
    expectedAyahs: [{ surah: 112, ayah: 2 }],
  },
  {
    query: "الكوثر نهر الجنة",
    description: "Al-Kawthar river in paradise",
    expectedSurahs: [108],
  },
  {
    query: "الشفاعة",
    description: "Intercession - mentioned in Al-Kawthar tafsir",
    expectedSurahs: [108],
  },
  {
    query: "الوسواس الخناس",
    description: "The whisperer who withdraws - An-Nas",
    expectedSurahs: [114],
  },
  {
    query: "شر الحاسد",
    description: "Evil of the envier - Al-Falaq",
    expectedSurahs: [113],
  },
  {
    query: "السحر والعقد",
    description: "Magic and knots - Al-Falaq",
    expectedSurahs: [113],
  },
  {
    query: "أبو لهب",
    description: "Abu Lahab - Al-Masad",
    expectedSurahs: [111],
  },
  {
    query: "النصر والفتح",
    description: "Victory and conquest - An-Nasr",
    expectedSurahs: [110],
  },
  {
    query: "الكافرون لا أعبد",
    description: "Disbelievers - Al-Kafirun",
    expectedSurahs: [109],
  },
  {
    query: "الفيل وأبرهة",
    description: "The Elephant and Abraha - Al-Fil",
    expectedSurahs: [105],
  },
  {
    query: "العصر والخسر",
    description: "Time and loss - Al-Asr",
    expectedSurahs: [103],
  },
  {
    query: "التكاثر والقبور",
    description: "Competition in increase and graves - At-Takathur",
    expectedSurahs: [102],
  },
  {
    query: "القارعة يوم القيامة",
    description: "The Striking Hour - Al-Qari'ah",
    expectedSurahs: [101],
  },
];

async function searchCollection(
  collection: string,
  queryEmbedding: number[],
  limit: number = 10
): Promise<SearchResult[]> {
  const results = await qdrant.search(collection, {
    vector: queryEmbedding,
    limit,
    with_payload: true,
    score_threshold: 0.2,
  });

  return results.map((r) => {
    const payload = r.payload as {
      surahNumber: number;
      ayahNumber: number;
      text: string;
      surahNameArabic: string;
    };
    return {
      surahNumber: payload.surahNumber,
      ayahNumber: payload.ayahNumber,
      score: r.score,
      text: payload.text,
      surahName: payload.surahNameArabic,
    };
  });
}

function calculateMetrics(
  results: SearchResult[],
  expectedSurahs: number[],
  expectedAyahs?: Array<{ surah: number; ayah: number }>
): {
  hitAtK: { [k: number]: boolean };
  mrr: number;
  avgScore: number;
  topSurahMatch: boolean;
} {
  const hitAtK: { [k: number]: boolean } = { 1: false, 3: false, 5: false, 10: false };
  let firstRelevantRank = 0;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const isRelevant = expectedSurahs.includes(r.surahNumber);

    if (isRelevant) {
      if (firstRelevantRank === 0) firstRelevantRank = i + 1;
      if (i < 1) hitAtK[1] = true;
      if (i < 3) hitAtK[3] = true;
      if (i < 5) hitAtK[5] = true;
      if (i < 10) hitAtK[10] = true;
    }
  }

  const mrr = firstRelevantRank > 0 ? 1 / firstRelevantRank : 0;
  const avgScore = results.length > 0
    ? results.reduce((sum, r) => sum + r.score, 0) / results.length
    : 0;
  const topSurahMatch = results.length > 0 && expectedSurahs.includes(results[0].surahNumber);

  return { hitAtK, mrr, avgScore, topSurahMatch };
}

async function runTest(testCase: TestCase): Promise<{
  original: { results: SearchResult[]; metrics: ReturnType<typeof calculateMetrics> };
  enriched: { results: SearchResult[]; metrics: ReturnType<typeof calculateMetrics> };
}> {
  const normalized = normalizeArabicText(testCase.query);
  const embedding = await generateEmbedding(normalized);

  const [originalResults, enrichedResults] = await Promise.all([
    searchCollection(QDRANT_QURAN_COLLECTION, embedding),
    searchCollection(QDRANT_QURAN_ENRICHED_COLLECTION, embedding),
  ]);

  const expectedSurahs = testCase.expectedSurahs || [];

  return {
    original: {
      results: originalResults,
      metrics: calculateMetrics(originalResults, expectedSurahs, testCase.expectedAyahs),
    },
    enriched: {
      results: enrichedResults,
      metrics: calculateMetrics(enrichedResults, expectedSurahs, testCase.expectedAyahs),
    },
  };
}

function formatResult(r: SearchResult): string {
  const truncatedText = r.text.length > 50 ? r.text.substring(0, 50) + "..." : r.text;
  return `${r.surahNumber}:${r.ayahNumber} (${r.score.toFixed(3)}) ${truncatedText}`;
}

async function main() {
  console.log("═".repeat(80));
  console.log("QURAN EMBEDDING COMPARISON: Original vs Tafsir-Enriched");
  console.log("═".repeat(80));
  console.log();

  // Verify collections exist
  const collections = await qdrant.getCollections();
  const hasOriginal = collections.collections.some((c) => c.name === QDRANT_QURAN_COLLECTION);
  const hasEnriched = collections.collections.some((c) => c.name === QDRANT_QURAN_ENRICHED_COLLECTION);

  if (!hasOriginal) {
    console.error(`Missing collection: ${QDRANT_QURAN_COLLECTION}`);
    return;
  }
  if (!hasEnriched) {
    console.error(`Missing collection: ${QDRANT_QURAN_ENRICHED_COLLECTION}`);
    return;
  }

  const originalInfo = await qdrant.getCollection(QDRANT_QURAN_COLLECTION);
  const enrichedInfo = await qdrant.getCollection(QDRANT_QURAN_ENRICHED_COLLECTION);
  console.log(`Original collection: ${originalInfo.points_count} points`);
  console.log(`Enriched collection: ${enrichedInfo.points_count} points`);
  console.log();

  // Aggregate metrics
  let totalOriginalMRR = 0;
  let totalEnrichedMRR = 0;
  let originalHits = { 1: 0, 3: 0, 5: 0, 10: 0 };
  let enrichedHits = { 1: 0, 3: 0, 5: 0, 10: 0 };
  let originalTopMatch = 0;
  let enrichedTopMatch = 0;
  let enrichedWins = 0;
  let originalWins = 0;
  let ties = 0;

  for (const testCase of TEST_CASES) {
    console.log("─".repeat(80));
    console.log(`Query: "${testCase.query}"`);
    console.log(`Description: ${testCase.description}`);
    console.log(`Expected surahs: ${testCase.expectedSurahs?.join(", ") || "N/A"}`);
    console.log();

    const result = await runTest(testCase);

    // Display top 5 results side by side
    console.log("  ORIGINAL                                    ENRICHED");
    console.log("  " + "─".repeat(38) + "  " + "─".repeat(38));

    for (let i = 0; i < 5; i++) {
      const orig = result.original.results[i];
      const enri = result.enriched.results[i];
      const origStr = orig ? formatResult(orig).substring(0, 38).padEnd(38) : "".padEnd(38);
      const enriStr = enri ? formatResult(enri).substring(0, 38).padEnd(38) : "".padEnd(38);

      // Highlight if matches expected surah
      const origMatch = orig && testCase.expectedSurahs?.includes(orig.surahNumber) ? "✓" : " ";
      const enriMatch = enri && testCase.expectedSurahs?.includes(enri.surahNumber) ? "✓" : " ";

      console.log(`${origMatch} ${origStr}  ${enriMatch} ${enriStr}`);
    }

    console.log();
    console.log(`  Metrics:`);
    console.log(`    MRR:        ${result.original.metrics.mrr.toFixed(3)}  vs  ${result.enriched.metrics.mrr.toFixed(3)} ${result.enriched.metrics.mrr > result.original.metrics.mrr ? "⬆️ ENRICHED" : result.enriched.metrics.mrr < result.original.metrics.mrr ? "⬇️ ORIGINAL" : "="}`);
    console.log(`    Hit@1:      ${result.original.metrics.hitAtK[1] ? "✓" : "✗"}      vs  ${result.enriched.metrics.hitAtK[1] ? "✓" : "✗"}`);
    console.log(`    Hit@3:      ${result.original.metrics.hitAtK[3] ? "✓" : "✗"}      vs  ${result.enriched.metrics.hitAtK[3] ? "✓" : "✗"}`);
    console.log(`    Hit@5:      ${result.original.metrics.hitAtK[5] ? "✓" : "✗"}      vs  ${result.enriched.metrics.hitAtK[5] ? "✓" : "✗"}`);
    console.log(`    Avg Score:  ${result.original.metrics.avgScore.toFixed(3)}  vs  ${result.enriched.metrics.avgScore.toFixed(3)}`);
    console.log();

    // Aggregate
    totalOriginalMRR += result.original.metrics.mrr;
    totalEnrichedMRR += result.enriched.metrics.mrr;
    if (result.original.metrics.hitAtK[1]) originalHits[1]++;
    if (result.original.metrics.hitAtK[3]) originalHits[3]++;
    if (result.original.metrics.hitAtK[5]) originalHits[5]++;
    if (result.original.metrics.hitAtK[10]) originalHits[10]++;
    if (result.enriched.metrics.hitAtK[1]) enrichedHits[1]++;
    if (result.enriched.metrics.hitAtK[3]) enrichedHits[3]++;
    if (result.enriched.metrics.hitAtK[5]) enrichedHits[5]++;
    if (result.enriched.metrics.hitAtK[10]) enrichedHits[10]++;
    if (result.original.metrics.topSurahMatch) originalTopMatch++;
    if (result.enriched.metrics.topSurahMatch) enrichedTopMatch++;

    if (result.enriched.metrics.mrr > result.original.metrics.mrr) {
      enrichedWins++;
    } else if (result.original.metrics.mrr > result.enriched.metrics.mrr) {
      originalWins++;
    } else {
      ties++;
    }

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 200));
  }

  // Summary
  const n = TEST_CASES.length;
  console.log("═".repeat(80));
  console.log("SUMMARY");
  console.log("═".repeat(80));
  console.log();
  console.log("                          ORIGINAL    ENRICHED    WINNER");
  console.log("─".repeat(60));
  console.log(`Mean Reciprocal Rank:     ${(totalOriginalMRR / n).toFixed(3)}       ${(totalEnrichedMRR / n).toFixed(3)}       ${totalEnrichedMRR > totalOriginalMRR ? "ENRICHED ⬆️" : totalOriginalMRR > totalEnrichedMRR ? "ORIGINAL" : "TIE"}`);
  console.log(`Hit@1:                    ${originalHits[1]}/${n}         ${enrichedHits[1]}/${n}         ${enrichedHits[1] > originalHits[1] ? "ENRICHED ⬆️" : originalHits[1] > enrichedHits[1] ? "ORIGINAL" : "TIE"}`);
  console.log(`Hit@3:                    ${originalHits[3]}/${n}         ${enrichedHits[3]}/${n}         ${enrichedHits[3] > originalHits[3] ? "ENRICHED ⬆️" : originalHits[3] > enrichedHits[3] ? "ORIGINAL" : "TIE"}`);
  console.log(`Hit@5:                    ${originalHits[5]}/${n}         ${enrichedHits[5]}/${n}         ${enrichedHits[5] > originalHits[5] ? "ENRICHED ⬆️" : originalHits[5] > enrichedHits[5] ? "ORIGINAL" : "TIE"}`);
  console.log(`Hit@10:                   ${originalHits[10]}/${n}         ${enrichedHits[10]}/${n}         ${enrichedHits[10] > originalHits[10] ? "ENRICHED ⬆️" : originalHits[10] > enrichedHits[10] ? "ORIGINAL" : "TIE"}`);
  console.log(`Top Match Rate:           ${originalTopMatch}/${n}         ${enrichedTopMatch}/${n}         ${enrichedTopMatch > originalTopMatch ? "ENRICHED ⬆️" : originalTopMatch > enrichedTopMatch ? "ORIGINAL" : "TIE"}`);
  console.log();
  console.log(`Per-Query Wins:           ${originalWins}           ${enrichedWins}           (${ties} ties)`);
  console.log();

  if (totalEnrichedMRR > totalOriginalMRR) {
    const improvement = ((totalEnrichedMRR - totalOriginalMRR) / totalOriginalMRR * 100).toFixed(1);
    console.log(`✅ ENRICHED embeddings improve MRR by ${improvement}%`);
  } else if (totalOriginalMRR > totalEnrichedMRR) {
    const decrease = ((totalOriginalMRR - totalEnrichedMRR) / totalOriginalMRR * 100).toFixed(1);
    console.log(`⚠️ ORIGINAL embeddings perform ${decrease}% better`);
  } else {
    console.log(`➡️ Both collections perform equally`);
  }
}

main()
  .catch((e) => {
    console.error("Test failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
