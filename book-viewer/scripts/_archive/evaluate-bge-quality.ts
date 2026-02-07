/**
 * Evaluate Fine-tuned BGE-M3 Quality on Quran Search
 *
 * Measures retrieval accuracy using known query-answer pairs
 */
import "dotenv/config";
import { qdrant } from "../lib/qdrant";

const BGE_COLLECTION = "quran_ayahs_enriched_bge";

interface TestCase {
  query: string;
  description: string;
  expectedRefs: string[]; // Surah:Ayah references that should appear in top results
}

const testCases: TestCase[] = [
  {
    query: "قل هو الله أحد",
    description: "Say: He is Allah, the One",
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
  {
    query: "قصة آدم",
    description: "Story of Adam",
    expectedRefs: ["2:30", "2:31", "2:34", "7:11", "20:115"],
  },
  {
    query: "الصلاة والزكاة",
    description: "Prayer and Zakat",
    expectedRefs: ["2:43", "2:83", "2:110", "2:177"],
  },
  {
    query: "يوم القيامة",
    description: "Day of Resurrection",
    expectedRefs: ["75:1", "2:85", "3:77"],
  },
  {
    query: "الصبر على البلاء",
    description: "Patience in hardship",
    expectedRefs: ["2:45", "2:153", "2:155", "3:200"],
  },
  {
    query: "التوبة والاستغفار",
    description: "Repentance and seeking forgiveness",
    expectedRefs: ["4:110", "11:3", "39:53"],
  },
];

async function generateQueryEmbedding(text: string): Promise<number[]> {
  const res = await fetch("http://localhost:8000/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, type: "query" })
  });
  const data = await res.json() as { embedding: number[] };
  return data.embedding;
}

async function evaluate() {
  console.log("BGE-M3 Fine-tuned Model - Quran Search Quality Evaluation");
  console.log("=".repeat(70));

  let totalHits = 0;
  let totalExpected = 0;
  let totalMRR = 0;

  for (const tc of testCases) {
    const embedding = await generateQueryEmbedding(tc.query);

    const results = await qdrant.search(BGE_COLLECTION, {
      vector: embedding,
      limit: 10,
      with_payload: true,
    });

    const retrievedRefs = results.map(r => {
      const p = r.payload as { surahNumber: number; ayahNumber: number };
      return `${p.surahNumber}:${p.ayahNumber}`;
    });

    // Calculate hits (how many expected refs appear in top 10)
    const hits = tc.expectedRefs.filter(ref => retrievedRefs.includes(ref));
    totalHits += hits.length;
    totalExpected += tc.expectedRefs.length;

    // Calculate MRR (Mean Reciprocal Rank) for first expected hit
    let mrr = 0;
    for (const ref of tc.expectedRefs) {
      const rank = retrievedRefs.indexOf(ref);
      if (rank !== -1) {
        mrr = 1 / (rank + 1);
        break;
      }
    }
    totalMRR += mrr;

    const hitRate = (hits.length / tc.expectedRefs.length * 100).toFixed(0);
    const status = hits.length > 0 ? "✓" : "✗";

    console.log(`\n${status} "${tc.query.substring(0, 30)}..." (${tc.description})`);
    console.log(`   Expected: ${tc.expectedRefs.slice(0, 3).join(", ")}${tc.expectedRefs.length > 3 ? "..." : ""}`);
    console.log(`   Found:    ${retrievedRefs.slice(0, 5).join(", ")}`);
    console.log(`   Hits: ${hits.length}/${tc.expectedRefs.length} (${hitRate}%), MRR: ${mrr.toFixed(3)}`);

    if (hits.length > 0) {
      console.log(`   Matched:  ${hits.join(", ")}`);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("OVERALL METRICS");
  console.log("=".repeat(70));
  console.log(`Recall@10:      ${(totalHits / totalExpected * 100).toFixed(1)}% (${totalHits}/${totalExpected})`);
  console.log(`Mean MRR:       ${(totalMRR / testCases.length).toFixed(3)}`);
  console.log(`Queries tested: ${testCases.length}`);
}

evaluate().catch(console.error);
