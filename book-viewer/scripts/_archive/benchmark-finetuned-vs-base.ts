/**
 * Fair Comparison: Fine-tuned vs Base BGE-M3
 *
 * Both models search the SAME collection (embedded with fine-tuned model).
 * This tests how well each model's QUERY encoding matches the stored PASSAGE encodings.
 *
 * For a truly fair comparison, we'd need separate collections,
 * but this still shows relative query understanding.
 */
import "dotenv/config";
import { qdrant } from "../lib/qdrant";

const COLLECTION = "quran_ayahs_enriched_bge";

interface TestCase {
  query: string;
  description: string;
  expectedRefs: string[];
  category: "exact" | "semantic" | "english";
}

const testCases: TestCase[] = [
  // Exact text matches - should work well
  {
    query: "قل هو الله أحد",
    description: "Al-Ikhlas 112:1",
    expectedRefs: ["112:1"],
    category: "exact",
  },
  {
    query: "بسم الله الرحمن الرحيم",
    description: "Bismillah 1:1",
    expectedRefs: ["1:1"],
    category: "exact",
  },
  {
    query: "الله لا إله إلا هو الحي القيوم",
    description: "Ayat al-Kursi 2:255",
    expectedRefs: ["2:255", "3:2"],
    category: "exact",
  },
  {
    query: "إنا أعطيناك الكوثر",
    description: "Al-Kawthar 108:1",
    expectedRefs: ["108:1"],
    category: "exact",
  },
  {
    query: "والعصر إن الإنسان لفي خسر",
    description: "Al-Asr 103:1-2",
    expectedRefs: ["103:1", "103:2"],
    category: "exact",
  },
  // Semantic/thematic queries
  {
    query: "التوحيد",
    description: "Monotheism",
    expectedRefs: ["112:1", "112:2", "112:3"],
    category: "semantic",
  },
  {
    query: "الصلاة والزكاة",
    description: "Prayer and Zakat",
    expectedRefs: ["2:43", "2:83", "2:110"],
    category: "semantic",
  },
  {
    query: "الصبر على البلاء",
    description: "Patience in hardship",
    expectedRefs: ["2:45", "2:153", "2:155"],
    category: "semantic",
  },
  {
    query: "التوبة والاستغفار",
    description: "Repentance",
    expectedRefs: ["4:110", "11:3", "39:53"],
    category: "semantic",
  },
  {
    query: "يوم القيامة",
    description: "Day of Resurrection",
    expectedRefs: ["75:1", "2:85", "3:77"],
    category: "semantic",
  },
  // English queries (cross-lingual)
  {
    query: "God is one",
    description: "Monotheism (EN)",
    expectedRefs: ["112:1"],
    category: "english",
  },
  {
    query: "patience in hardship",
    description: "Patience (EN)",
    expectedRefs: ["2:45", "2:153", "2:155"],
    category: "english",
  },
  {
    query: "prayer and charity",
    description: "Prayer+Zakat (EN)",
    expectedRefs: ["2:43", "2:83", "2:110"],
    category: "english",
  },
  {
    query: "day of judgment",
    description: "Qiyamah (EN)",
    expectedRefs: ["75:1", "2:85"],
    category: "english",
  },
];

async function generateFinetunedEmbedding(text: string): Promise<number[]> {
  const res = await fetch("http://localhost:8000/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, type: "query" }),
  });
  const data = (await res.json()) as { embedding: number[] };
  return data.embedding;
}

async function generateBaseEmbedding(text: string): Promise<number[]> {
  const res = await fetch("http://localhost:8002/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, type: "query" }),
  });
  const data = (await res.json()) as { embedding: number[] };
  return data.embedding;
}

async function search(embedding: number[], limit = 10) {
  const results = await qdrant.search(COLLECTION, {
    vector: embedding,
    limit,
    with_payload: true,
  });
  return results.map((r) => ({
    ref: `${(r.payload as { surahNumber: number }).surahNumber}:${(r.payload as { ayahNumber: number }).ayahNumber}`,
    score: r.score,
  }));
}

async function benchmark() {
  console.log("═".repeat(75));
  console.log("  FINE-TUNED vs BASE BGE-M3 BENCHMARK");
  console.log("  Searching same collection with both query encoders");
  console.log("═".repeat(75));

  // Check servers
  const [ft, base] = await Promise.all([
    fetch("http://localhost:8000/health").then((r) => r.ok).catch(() => false),
    fetch("http://localhost:8002/health").then((r) => r.ok).catch(() => false),
  ]);

  if (!ft || !base) {
    console.log("\nError: Need both servers running:");
    console.log(`  Port 8000 (fine-tuned): ${ft ? "✓" : "✗"}`);
    console.log(`  Port 8002 (base):       ${base ? "✓" : "✗"}`);
    return;
  }

  const results: Record<
    string,
    { ft: { hit: boolean; mrr: number; score: number }; base: { hit: boolean; mrr: number; score: number } }
  > = {};

  const categoryStats = {
    exact: { ftHits: 0, baseHits: 0, count: 0 },
    semantic: { ftHits: 0, baseHits: 0, count: 0 },
    english: { ftHits: 0, baseHits: 0, count: 0 },
  };

  console.log("\n" + "-".repeat(75));
  console.log(
    "  Query".padEnd(24) +
      "FT Top".padEnd(10) +
      "FT Score".padEnd(10) +
      "Base Top".padEnd(10) +
      "Base Score".padEnd(10) +
      "Winner"
  );
  console.log("-".repeat(75));

  for (const tc of testCases) {
    const [ftEmbed, baseEmbed] = await Promise.all([
      generateFinetunedEmbedding(tc.query),
      generateBaseEmbedding(tc.query),
    ]);

    const [ftResults, baseResults] = await Promise.all([
      search(ftEmbed),
      search(baseEmbed),
    ]);

    const ftRefs = ftResults.map((r) => r.ref);
    const baseRefs = baseResults.map((r) => r.ref);

    // Check hits
    const ftHit = tc.expectedRefs.some((ref) => ftRefs.includes(ref));
    const baseHit = tc.expectedRefs.some((ref) => baseRefs.includes(ref));

    // MRR
    let ftMRR = 0,
      baseMRR = 0;
    for (const ref of tc.expectedRefs) {
      const rank = ftRefs.indexOf(ref);
      if (rank !== -1) {
        ftMRR = 1 / (rank + 1);
        break;
      }
    }
    for (const ref of tc.expectedRefs) {
      const rank = baseRefs.indexOf(ref);
      if (rank !== -1) {
        baseMRR = 1 / (rank + 1);
        break;
      }
    }

    results[tc.description] = {
      ft: { hit: ftHit, mrr: ftMRR, score: ftResults[0]?.score || 0 },
      base: { hit: baseHit, mrr: baseMRR, score: baseResults[0]?.score || 0 },
    };

    categoryStats[tc.category].count++;
    if (ftHit) categoryStats[tc.category].ftHits++;
    if (baseHit) categoryStats[tc.category].baseHits++;

    const ftStatus = ftHit ? "✓" : "✗";
    const baseStatus = baseHit ? "✓" : "✗";
    const winner =
      ftHit && !baseHit ? "FT" : !ftHit && baseHit ? "Base" : ftHit && baseHit ? "Both" : "-";

    console.log(
      `  ${tc.description.substring(0, 20).padEnd(22)} ${ftStatus} ${ftRefs[0]?.padEnd(7) || "N/A".padEnd(7)} ${ftResults[0]?.score.toFixed(3).padEnd(8) || "N/A".padEnd(8)} ${baseStatus} ${baseRefs[0]?.padEnd(7) || "N/A".padEnd(7)} ${baseResults[0]?.score.toFixed(3).padEnd(8) || "N/A".padEnd(8)} ${winner}`
    );
  }

  // Summary
  const ftTotalHits = Object.values(results).filter((r) => r.ft.hit).length;
  const baseTotalHits = Object.values(results).filter((r) => r.base.hit).length;
  const ftAvgMRR =
    Object.values(results).reduce((sum, r) => sum + r.ft.mrr, 0) / testCases.length;
  const baseAvgMRR =
    Object.values(results).reduce((sum, r) => sum + r.base.mrr, 0) / testCases.length;
  const ftAvgScore =
    Object.values(results).reduce((sum, r) => sum + r.ft.score, 0) / testCases.length;
  const baseAvgScore =
    Object.values(results).reduce((sum, r) => sum + r.base.score, 0) / testCases.length;

  console.log("\n" + "═".repeat(75));
  console.log("  RESULTS SUMMARY");
  console.log("═".repeat(75));

  console.log(`
                          Fine-tuned BGE-M3    Base BGE-M3      Difference
  ──────────────────────────────────────────────────────────────────────────
  Hit Rate @10            ${((ftTotalHits / testCases.length) * 100).toFixed(1).padStart(5)}%              ${((baseTotalHits / testCases.length) * 100).toFixed(1).padStart(5)}%            ${ftTotalHits > baseTotalHits ? "+" : ""}${(((ftTotalHits - baseTotalHits) / testCases.length) * 100).toFixed(1)}%
  MRR                     ${ftAvgMRR.toFixed(3).padStart(5)}               ${baseAvgMRR.toFixed(3).padStart(5)}             ${ftAvgMRR > baseAvgMRR ? "+" : ""}${(ftAvgMRR - baseAvgMRR).toFixed(3)}
  Avg Similarity Score    ${ftAvgScore.toFixed(3).padStart(5)}               ${baseAvgScore.toFixed(3).padStart(5)}             ${ftAvgScore > baseAvgScore ? "+" : ""}${(ftAvgScore - baseAvgScore).toFixed(3)}
  `);

  console.log("  BY CATEGORY:");
  console.log("  ──────────────────────────────────────────────────────────────────────────");
  for (const [cat, stats] of Object.entries(categoryStats)) {
    const ftRate = ((stats.ftHits / stats.count) * 100).toFixed(0);
    const baseRate = ((stats.baseHits / stats.count) * 100).toFixed(0);
    console.log(
      `  ${cat.charAt(0).toUpperCase() + cat.slice(1).padEnd(10)} (${stats.count} queries): FT ${ftRate}%  Base ${baseRate}%  ${stats.ftHits > stats.baseHits ? "→ FT wins" : stats.baseHits > stats.ftHits ? "→ Base wins" : "→ Tie"}`
    );
  }

  console.log("\n" + "═".repeat(75));
  console.log("  ANALYSIS");
  console.log("═".repeat(75));

  if (ftTotalHits > baseTotalHits) {
    console.log(`  🏆 Fine-tuned BGE-M3 outperforms base model`);
    console.log(`     ${((ftTotalHits - baseTotalHits) / baseTotalHits * 100).toFixed(0)}% improvement in hit rate`);
  } else if (baseTotalHits > ftTotalHits) {
    console.log(`  ⚠️  Base BGE-M3 has better hit rate`);
    console.log(`     Note: Collection was embedded with fine-tuned model`);
    console.log(`     Base model may benefit from broader generalization`);
  } else {
    console.log(`  📊 Both models perform equally on hit rate`);
  }

  if (ftAvgScore > baseAvgScore) {
    console.log(`  📈 Fine-tuned model produces ${((ftAvgScore / baseAvgScore - 1) * 100).toFixed(0)}% higher similarity scores`);
    console.log(`     (Model is more confident in its matches)`);
  }

  console.log("\n" + "═".repeat(75));
}

benchmark().catch(console.error);
