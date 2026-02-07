/**
 * Comprehensive Embedding Model Benchmark
 *
 * Compares three embedding models on Quran search:
 * 1. Fine-tuned BGE-M3 (trained on Arabic Islamic texts)
 * 2. Original BGE-M3 (BAAI/bge-m3 base model)
 * 3. Gemini Embedding (google/gemini-embedding-001)
 *
 * Metrics: Recall@K, MRR, Hit Rate, Average Similarity
 */
import "dotenv/config";
import { qdrant } from "../lib/qdrant";

// Collections
const FINETUNED_BGE_COLLECTION = "quran_ayahs_enriched_bge";
const GEMINI_COLLECTION = "quran_ayahs_enriched";

// Test cases with expected results
interface TestCase {
  query: string;
  description: string;
  expectedRefs: string[]; // Surah:Ayah that should appear in top results
}

const testCases: TestCase[] = [
  // Direct text matches
  {
    query: "قل هو الله أحد",
    description: "Say: He is Allah, the One (Al-Ikhlas)",
    expectedRefs: ["112:1"],
  },
  {
    query: "بسم الله الرحمن الرحيم",
    description: "Bismillah",
    expectedRefs: ["1:1"],
  },
  {
    query: "الله لا إله إلا هو الحي القيوم",
    description: "Ayat al-Kursi opening",
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
  // Thematic/semantic queries
  {
    query: "التوحيد",
    description: "Monotheism",
    expectedRefs: ["112:1", "112:2", "112:3", "112:4"],
  },
  {
    query: "الصلاة والزكاة",
    description: "Prayer and Zakat",
    expectedRefs: ["2:43", "2:83", "2:110", "2:177"],
  },
  {
    query: "الصبر على البلاء",
    description: "Patience in hardship",
    expectedRefs: ["2:45", "2:153", "2:155", "3:200"],
  },
  {
    query: "التوبة والاستغفار",
    description: "Repentance and forgiveness",
    expectedRefs: ["4:110", "11:3", "39:53"],
  },
  {
    query: "يوم القيامة",
    description: "Day of Resurrection",
    expectedRefs: ["75:1", "2:85", "3:77"],
  },
  // Story-based queries
  {
    query: "قصة آدم",
    description: "Story of Adam",
    expectedRefs: ["2:30", "2:31", "2:34", "7:11", "20:115"],
  },
  {
    query: "قصة موسى وفرعون",
    description: "Moses and Pharaoh",
    expectedRefs: ["7:103", "7:104", "20:24", "26:10", "28:3"],
  },
  // English queries (cross-lingual)
  {
    query: "God is one",
    description: "God is one (English)",
    expectedRefs: ["112:1"],
  },
  {
    query: "patience in hardship",
    description: "Patience (English)",
    expectedRefs: ["2:45", "2:153", "2:155"],
  },
];

// Embedding functions
async function generateFinetunedBGEEmbedding(text: string): Promise<number[]> {
  const res = await fetch("http://localhost:8000/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, type: "query" }),
  });
  if (!res.ok) throw new Error(`Fine-tuned BGE server error: ${res.status}`);
  const data = (await res.json()) as { embedding: number[] };
  return data.embedding;
}

async function generateBaseBGEEmbedding(text: string): Promise<number[]> {
  // Use port 8002 for base model (will start separately)
  const res = await fetch("http://localhost:8002/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, type: "query" }),
  });
  if (!res.ok) throw new Error(`Base BGE server error: ${res.status}`);
  const data = (await res.json()) as { embedding: number[] };
  return data.embedding;
}

async function generateGeminiEmbedding(text: string): Promise<number[]> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
  });

  const response = await openai.embeddings.create({
    model: "google/gemini-embedding-001",
    input: text,
  });
  return response.data[0].embedding;
}

interface SearchResult {
  ref: string;
  score: number;
}

async function searchCollection(
  collection: string,
  embedding: number[],
  limit = 10
): Promise<SearchResult[]> {
  try {
    const results = await qdrant.search(collection, {
      vector: embedding,
      limit,
      with_payload: true,
    });
    return results.map((r) => {
      const p = r.payload as { surahNumber: number; ayahNumber: number };
      return {
        ref: `${p.surahNumber}:${p.ayahNumber}`,
        score: r.score,
      };
    });
  } catch (e) {
    return [];
  }
}

interface ModelMetrics {
  recall1: number;
  recall5: number;
  recall10: number;
  mrr: number;
  avgTopScore: number;
  hits: number;
  total: number;
}

function calculateMetrics(
  retrievedRefs: string[],
  expectedRefs: string[],
  topScore: number
): {
  hit1: boolean;
  hit5: boolean;
  hit10: boolean;
  mrr: number;
  topScore: number;
} {
  const hit1 = expectedRefs.some((ref) => retrievedRefs.slice(0, 1).includes(ref));
  const hit5 = expectedRefs.some((ref) => retrievedRefs.slice(0, 5).includes(ref));
  const hit10 = expectedRefs.some((ref) => retrievedRefs.slice(0, 10).includes(ref));

  // MRR: reciprocal rank of first expected hit
  let mrr = 0;
  for (const ref of expectedRefs) {
    const rank = retrievedRefs.indexOf(ref);
    if (rank !== -1) {
      mrr = 1 / (rank + 1);
      break;
    }
  }

  return { hit1, hit5, hit10, mrr, topScore };
}

async function evaluateModel(
  name: string,
  generateEmbedding: (text: string) => Promise<number[]>,
  collection: string
): Promise<ModelMetrics> {
  let hit1Count = 0;
  let hit5Count = 0;
  let hit10Count = 0;
  let totalMRR = 0;
  let totalTopScore = 0;
  let hitCount = 0;

  console.log(`\n📊 Evaluating: ${name}`);
  console.log("-".repeat(60));

  for (const tc of testCases) {
    try {
      const embedding = await generateEmbedding(tc.query);
      const results = await searchCollection(collection, embedding);
      const retrievedRefs = results.map((r) => r.ref);
      const topScore = results[0]?.score || 0;

      const metrics = calculateMetrics(retrievedRefs, tc.expectedRefs, topScore);

      if (metrics.hit1) hit1Count++;
      if (metrics.hit5) hit5Count++;
      if (metrics.hit10) {
        hit10Count++;
        hitCount++;
      }
      totalMRR += metrics.mrr;
      totalTopScore += topScore;

      const status = metrics.hit10 ? "✓" : "✗";
      console.log(
        `  ${status} ${tc.description.padEnd(30)} | Top: ${retrievedRefs[0]?.padEnd(8) || "N/A"} | Score: ${topScore.toFixed(3)} | MRR: ${metrics.mrr.toFixed(3)}`
      );
    } catch (e) {
      console.log(`  ✗ ${tc.description.padEnd(30)} | ERROR: ${(e as Error).message}`);
    }
  }

  return {
    recall1: hit1Count / testCases.length,
    recall5: hit5Count / testCases.length,
    recall10: hit10Count / testCases.length,
    mrr: totalMRR / testCases.length,
    avgTopScore: totalTopScore / testCases.length,
    hits: hitCount,
    total: testCases.length,
  };
}

async function checkServerAvailability(): Promise<{
  finetuned: boolean;
  base: boolean;
}> {
  const checkServer = async (port: number): Promise<boolean> => {
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      if (!res.ok) return false;
      const data = await res.json() as { status: string; model?: string };
      return data.status === "ok" && data.model !== undefined;
    } catch {
      return false;
    }
  };

  return {
    finetuned: await checkServer(8000),
    base: await checkServer(8002),
  };
}

async function benchmark() {
  console.log("═".repeat(70));
  console.log("  COMPREHENSIVE EMBEDDING MODEL BENCHMARK");
  console.log("  Quran Semantic Search Evaluation");
  console.log("═".repeat(70));
  console.log(`  Test cases: ${testCases.length}`);
  console.log(`  Metrics: Recall@1, Recall@5, Recall@10, MRR, Avg Similarity`);

  const availability = await checkServerAvailability();

  const results: Record<string, ModelMetrics> = {};

  // 1. Fine-tuned BGE-M3
  if (availability.finetuned) {
    results["Fine-tuned BGE-M3"] = await evaluateModel(
      "Fine-tuned BGE-M3 (arabic-islamic-bge-m3)",
      generateFinetunedBGEEmbedding,
      FINETUNED_BGE_COLLECTION
    );
  } else {
    console.log("\n⚠️  Fine-tuned BGE-M3 server not available (port 8000)");
  }

  // 2. Base BGE-M3
  if (availability.base) {
    results["Base BGE-M3"] = await evaluateModel(
      "Base BGE-M3 (BAAI/bge-m3)",
      generateBaseBGEEmbedding,
      FINETUNED_BGE_COLLECTION // Same collection, different query embeddings
    );
  } else {
    console.log("\n⚠️  Base BGE-M3 server not available (port 8002)");
    console.log("    To enable: cd embedding-server && EMBEDDING_MODEL=BAAI/bge-m3 uvicorn main:app --port 8002");
  }

  // 3. Gemini
  if (process.env.OPENROUTER_API_KEY) {
    results["Gemini"] = await evaluateModel(
      "Gemini Embedding (google/gemini-embedding-001)",
      generateGeminiEmbedding,
      GEMINI_COLLECTION
    );
  } else {
    console.log("\n⚠️  Gemini not available (OPENROUTER_API_KEY not set)");
  }

  // Print comparison table
  console.log("\n" + "═".repeat(70));
  console.log("  RESULTS COMPARISON");
  console.log("═".repeat(70));

  const modelNames = Object.keys(results);
  if (modelNames.length === 0) {
    console.log("\nNo models were evaluated. Check server availability.");
    return;
  }

  // Header
  console.log(
    "\n  Model".padEnd(30) +
      "Recall@1".padStart(10) +
      "Recall@5".padStart(10) +
      "Recall@10".padStart(11) +
      "MRR".padStart(8) +
      "Avg Sim".padStart(10)
  );
  console.log("  " + "-".repeat(67));

  // Data rows
  for (const [name, m] of Object.entries(results)) {
    console.log(
      `  ${name.padEnd(28)}${(m.recall1 * 100).toFixed(1).padStart(9)}%${(m.recall5 * 100).toFixed(1).padStart(9)}%${(m.recall10 * 100).toFixed(1).padStart(10)}%${m.mrr.toFixed(3).padStart(8)}${m.avgTopScore.toFixed(3).padStart(10)}`
    );
  }

  // Winner analysis
  console.log("\n" + "═".repeat(70));
  console.log("  ANALYSIS");
  console.log("═".repeat(70));

  if (modelNames.length >= 2) {
    const sortedByRecall = modelNames.sort(
      (a, b) => results[b].recall10 - results[a].recall10
    );
    const sortedByMRR = modelNames.sort((a, b) => results[b].mrr - results[a].mrr);

    console.log(`\n  🏆 Best Recall@10: ${sortedByRecall[0]} (${(results[sortedByRecall[0]].recall10 * 100).toFixed(1)}%)`);
    console.log(`  🏆 Best MRR:       ${sortedByMRR[0]} (${results[sortedByMRR[0]].mrr.toFixed(3)})`);

    // Improvement calculation
    if (results["Fine-tuned BGE-M3"] && results["Base BGE-M3"]) {
      const ft = results["Fine-tuned BGE-M3"];
      const base = results["Base BGE-M3"];
      const recallImprovement = ((ft.recall10 - base.recall10) / base.recall10) * 100;
      const mrrImprovement = ((ft.mrr - base.mrr) / base.mrr) * 100;

      console.log(`\n  📈 Fine-tuning Improvement over Base BGE-M3:`);
      console.log(`     Recall@10: ${recallImprovement >= 0 ? "+" : ""}${recallImprovement.toFixed(1)}%`);
      console.log(`     MRR:       ${mrrImprovement >= 0 ? "+" : ""}${mrrImprovement.toFixed(1)}%`);
    }

    if (results["Fine-tuned BGE-M3"] && results["Gemini"]) {
      const ft = results["Fine-tuned BGE-M3"];
      const gem = results["Gemini"];
      console.log(`\n  📊 Fine-tuned BGE-M3 vs Gemini:`);
      console.log(`     Recall@10: ${ft.recall10 > gem.recall10 ? "BGE wins" : gem.recall10 > ft.recall10 ? "Gemini wins" : "Tie"} (${(ft.recall10 * 100).toFixed(1)}% vs ${(gem.recall10 * 100).toFixed(1)}%)`);
      console.log(`     MRR:       ${ft.mrr > gem.mrr ? "BGE wins" : gem.mrr > ft.mrr ? "Gemini wins" : "Tie"} (${ft.mrr.toFixed(3)} vs ${gem.mrr.toFixed(3)})`);
    }
  }

  console.log("\n" + "═".repeat(70));
}

benchmark().catch(console.error);
