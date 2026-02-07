/**
 * Compare BGE vs Gemini Collections
 *
 * Uses fine-tuned BGE embeddings to search both:
 * 1. BGE collection (quran_ayahs_enriched_bge) - model-matched
 * 2. Gemini collection (quran_ayahs_enriched) - cross-model
 *
 * This shows how well each collection performs for semantic search
 * when queried with consistent embeddings.
 */
import "../env";
import { qdrant } from "@web/lib/qdrant";

const BGE_COLLECTION = "quran_ayahs_enriched_bge";
const GEMINI_COLLECTION = "quran_ayahs_enriched";

interface TestCase {
  query: string;
  description: string;
  expectedRefs: string[];
}

const testCases: TestCase[] = [
  {
    query: "قل هو الله أحد",
    description: "Al-Ikhlas opening",
    expectedRefs: ["112:1"],
  },
  {
    query: "بسم الله الرحمن الرحيم",
    description: "Bismillah",
    expectedRefs: ["1:1"],
  },
  {
    query: "الله لا إله إلا هو الحي القيوم",
    description: "Ayat al-Kursi",
    expectedRefs: ["2:255", "3:2"],
  },
  {
    query: "إنا أعطيناك الكوثر",
    description: "Al-Kawthar",
    expectedRefs: ["108:1"],
  },
  {
    query: "والعصر إن الإنسان لفي خسر",
    description: "Al-Asr",
    expectedRefs: ["103:1", "103:2"],
  },
  {
    query: "التوحيد",
    description: "Monotheism",
    expectedRefs: ["112:1", "112:2"],
  },
  {
    query: "الصلاة والزكاة",
    description: "Prayer and Zakat",
    expectedRefs: ["2:43", "2:83", "2:110"],
  },
  {
    query: "الصبر على البلاء",
    description: "Patience",
    expectedRefs: ["2:45", "2:153", "2:155"],
  },
  {
    query: "التوبة والاستغفار",
    description: "Repentance",
    expectedRefs: ["4:110", "11:3", "39:53"],
  },
  {
    query: "يوم القيامة",
    description: "Day of Judgment",
    expectedRefs: ["75:1", "2:85"],
  },
  {
    query: "قصة آدم",
    description: "Story of Adam",
    expectedRefs: ["2:30", "2:31", "7:11"],
  },
  {
    query: "قصة موسى وفرعون",
    description: "Moses and Pharaoh",
    expectedRefs: ["7:103", "20:24", "26:10"],
  },
  {
    query: "God is one",
    description: "God is one (EN)",
    expectedRefs: ["112:1"],
  },
  {
    query: "patience in hardship",
    description: "Patience (EN)",
    expectedRefs: ["2:45", "2:153"],
  },
];

async function generateBGEEmbedding(text: string): Promise<number[]> {
  const res = await fetch("http://localhost:8000/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, type: "query" }),
  });
  const data = (await res.json()) as { embedding: number[] };
  return data.embedding;
}

interface SearchResult {
  ref: string;
  score: number;
  text: string;
}

async function searchCollection(
  collection: string,
  embedding: number[],
  limit = 10
): Promise<SearchResult[]> {
  const results = await qdrant.search(collection, {
    vector: embedding,
    limit,
    with_payload: true,
  });
  return results.map((r) => {
    const p = r.payload as {
      surahNumber: number;
      ayahNumber: number;
      text?: string;
    };
    return {
      ref: `${p.surahNumber}:${p.ayahNumber}`,
      score: r.score,
      text: p.text?.substring(0, 40) || "",
    };
  });
}

async function benchmark() {
  console.log("═".repeat(80));
  console.log("  FINE-TUNED BGE-M3 vs GEMINI COLLECTION COMPARISON");
  console.log("  Using fine-tuned BGE-M3 queries to search both collections");
  console.log("═".repeat(80));

  // Check collections exist
  try {
    const bgeInfo = await qdrant.getCollection(BGE_COLLECTION);
    const geminiInfo = await qdrant.getCollection(GEMINI_COLLECTION);
    console.log(`\n  BGE Collection: ${bgeInfo.points_count} points (${bgeInfo.config.params.vectors?.size || "?"} dim)`);
    console.log(`  Gemini Collection: ${geminiInfo.points_count} points (${geminiInfo.config.params.vectors?.size || "?"} dim)`);
  } catch (e) {
    console.error("Error checking collections:", e);
    return;
  }

  let bgeHits = 0, geminiHits = 0;
  let bgeMRR = 0, geminiMRR = 0;
  let bgeAvgScore = 0, geminiAvgScore = 0;

  console.log("\n" + "-".repeat(80));
  console.log("  Query".padEnd(25) + "BGE Result".padEnd(18) + "BGE Score".padEnd(12) + "Gemini Result".padEnd(18) + "Gemini Score");
  console.log("-".repeat(80));

  for (const tc of testCases) {
    const embedding = await generateBGEEmbedding(tc.query);

    const bgeResults = await searchCollection(BGE_COLLECTION, embedding);
    const geminiResults = await searchCollection(GEMINI_COLLECTION, embedding);

    const bgeRefs = bgeResults.map((r) => r.ref);
    const geminiRefs = geminiResults.map((r) => r.ref);

    // Check hits
    const bgeHit = tc.expectedRefs.some((ref) => bgeRefs.includes(ref));
    const geminiHit = tc.expectedRefs.some((ref) => geminiRefs.includes(ref));
    if (bgeHit) bgeHits++;
    if (geminiHit) geminiHits++;

    // MRR
    for (const ref of tc.expectedRefs) {
      const bgeRank = bgeRefs.indexOf(ref);
      if (bgeRank !== -1) {
        bgeMRR += 1 / (bgeRank + 1);
        break;
      }
    }
    for (const ref of tc.expectedRefs) {
      const geminiRank = geminiRefs.indexOf(ref);
      if (geminiRank !== -1) {
        geminiMRR += 1 / (geminiRank + 1);
        break;
      }
    }

    bgeAvgScore += bgeResults[0]?.score || 0;
    geminiAvgScore += geminiResults[0]?.score || 0;

    const bgeStatus = bgeHit ? "✓" : "✗";
    const geminiStatus = geminiHit ? "✓" : "✗";
    const queryShort = tc.description.substring(0, 20).padEnd(22);

    console.log(
      `  ${queryShort} ${bgeStatus} ${bgeRefs[0]?.padEnd(14) || "N/A".padEnd(14)} ${bgeResults[0]?.score.toFixed(3).padEnd(10) || "N/A".padEnd(10)} ${geminiStatus} ${geminiRefs[0]?.padEnd(14) || "N/A".padEnd(14)} ${geminiResults[0]?.score.toFixed(3) || "N/A"}`
    );
  }

  console.log("\n" + "═".repeat(80));
  console.log("  RESULTS SUMMARY");
  console.log("═".repeat(80));

  const n = testCases.length;
  console.log(`
  Metric               Fine-tuned BGE (matched)    Gemini Collection (cross-model)
  ─────────────────────────────────────────────────────────────────────────────────
  Hit Rate @10         ${((bgeHits / n) * 100).toFixed(1).padStart(5)}%                       ${((geminiHits / n) * 100).toFixed(1).padStart(5)}%
  MRR                  ${(bgeMRR / n).toFixed(3).padStart(5)}                        ${(geminiMRR / n).toFixed(3).padStart(5)}
  Avg Top Score        ${(bgeAvgScore / n).toFixed(3).padStart(5)}                        ${(geminiAvgScore / n).toFixed(3).padStart(5)}
  `);

  const winner = bgeHits > geminiHits ? "Fine-tuned BGE-M3" : geminiHits > bgeHits ? "Gemini Collection" : "Tie";
  console.log(`  🏆 Winner (Hit Rate): ${winner}`);

  if (bgeHits !== geminiHits) {
    const diff = Math.abs(((bgeHits - geminiHits) / n) * 100);
    console.log(`     Improvement: ${diff.toFixed(1)}% higher hit rate`);
  }

  console.log("\n" + "═".repeat(80));
  console.log("  NOTE: This compares model-matched BGE vs cross-model Gemini search.");
  console.log("  BGE collection was embedded with fine-tuned BGE-M3.");
  console.log("  Gemini collection was embedded with Gemini Embedding API.");
  console.log("═".repeat(80));
}

benchmark().catch(console.error);
