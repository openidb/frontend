/**
 * Compare Quran Embedding Collections - Conceptual Queries
 *
 * Tests retrieval with conceptual/semantic queries that don't directly
 * match ayah text but should match via tafsir context.
 *
 * Usage: bun run scripts/compare-quran-concepts.ts
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
}

interface TestCase {
  query: string;
  description: string;
  concept: string; // What concept we're testing
  expectedSurahs: number[];
  note?: string;
}

// Conceptual queries - searching for ideas NOT directly in the ayah text
const CONCEPT_TESTS: TestCase[] = [
  {
    query: "وحدانية الله",
    description: "Divine unity/oneness",
    concept: "Should match Al-Ikhlas via tafsir mentioning التوحيد/أحد",
    expectedSurahs: [112],
  },
  {
    query: "الملجأ والمقصود",
    description: "The refuge and the one sought",
    concept: "Should match الصمد (112:2) - tafsir explains 'المقصود في الحوائج'",
    expectedSurahs: [112],
  },
  {
    query: "لا ولد ولا والد",
    description: "Neither begotten nor begetting",
    concept: "Should match 112:3 - tafsir explains 'لانتفاء مجانسته'",
    expectedSurahs: [112],
  },
  {
    query: "الخير الكثير",
    description: "Abundant good",
    concept: "Should match Al-Kawthar - tafsir defines الكوثر as 'الخير الكثير'",
    expectedSurahs: [108],
  },
  {
    query: "حوض النبي",
    description: "The Prophet's pool",
    concept: "Al-Kawthar tafsir mentions 'حوضه ترد عليه أمته'",
    expectedSurahs: [108],
  },
  {
    query: "عيد النحر والأضحية",
    description: "Eid sacrifice",
    concept: "Al-Kawthar 108:2 tafsir: 'صلاة عيد النحر وانحر نسكك'",
    expectedSurahs: [108],
  },
  {
    query: "الابتر المقطوع",
    description: "The one cut off",
    concept: "Al-Kawthar 108:3 tafsir explains الأبتر",
    expectedSurahs: [108],
  },
  {
    query: "الشيطان يوسوس",
    description: "Satan whispers",
    concept: "An-Nas tafsir explains الوسواس = الشيطان",
    expectedSurahs: [114],
  },
  {
    query: "ذكر الله يطرد الشيطان",
    description: "Remembering Allah repels Satan",
    concept: "An-Nas 114:4 tafsir: 'يخنس ويتأخر عن القلب كلما ذكر الله'",
    expectedSurahs: [114],
  },
  {
    query: "السواحر والنفث",
    description: "Sorceresses who blow",
    concept: "Al-Falaq 113:4 tafsir: 'السواحر تنفث في العقد'",
    expectedSurahs: [113],
  },
  {
    query: "لبيد بن الأعصم",
    description: "Labid ibn al-A'sam (who bewitched the Prophet)",
    concept: "Mentioned in Al-Falaq tafsir",
    expectedSurahs: [113],
  },
  {
    query: "النار ذات اللهب",
    description: "Fire of blazing flame",
    concept: "Al-Masad 111:3 - about Abu Lahab's punishment",
    expectedSurahs: [111],
  },
  {
    query: "حمالة الحطب",
    description: "Carrier of firewood",
    concept: "Al-Masad 111:4 - Abu Lahab's wife",
    expectedSurahs: [111],
  },
  {
    query: "فتح مكة",
    description: "Conquest of Makkah",
    concept: "An-Nasr context - revelation after Makkah's conquest",
    expectedSurahs: [110],
  },
  {
    query: "دخول الناس في الإسلام",
    description: "People entering Islam",
    concept: "An-Nasr 110:2 concept",
    expectedSurahs: [110],
  },
  {
    query: "التوبة والاستغفار",
    description: "Repentance and seeking forgiveness",
    concept: "An-Nasr 110:3 command",
    expectedSurahs: [110],
  },
  {
    query: "قريش ورحلة الشتاء والصيف",
    description: "Quraysh and winter/summer journeys",
    concept: "Surah Quraysh 106 context",
    expectedSurahs: [106],
  },
  {
    query: "أصحاب الفيل أبرهة الحبشي",
    description: "People of the Elephant - Abraha",
    concept: "Al-Fil 105 - tafsir mentions أبرهة",
    expectedSurahs: [105],
  },
  {
    query: "الطير الأبابيل والحجارة",
    description: "Birds with stones",
    concept: "Al-Fil 105:3-4",
    expectedSurahs: [105],
  },
  {
    query: "الزمن والعمر",
    description: "Time and lifespan",
    concept: "Al-Asr 103 - الدهر/الزمن",
    expectedSurahs: [103],
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
    score_threshold: 0.15,
  });

  return results.map((r) => {
    const payload = r.payload as {
      surahNumber: number;
      ayahNumber: number;
      text: string;
    };
    return {
      surahNumber: payload.surahNumber,
      ayahNumber: payload.ayahNumber,
      score: r.score,
      text: payload.text,
    };
  });
}

async function main() {
  console.log("═".repeat(80));
  console.log("CONCEPTUAL QUERY COMPARISON: Original vs Tafsir-Enriched");
  console.log("═".repeat(80));
  console.log();
  console.log("Testing queries that search for CONCEPTS, not exact text matches.");
  console.log("Enriched embeddings should perform better here.\n");

  let originalWins = 0;
  let enrichedWins = 0;
  let ties = 0;
  let originalHit5 = 0;
  let enrichedHit5 = 0;
  let originalMRRSum = 0;
  let enrichedMRRSum = 0;

  for (const test of CONCEPT_TESTS) {
    const embedding = await generateEmbedding(normalizeArabicText(test.query));

    const [origResults, enrichResults] = await Promise.all([
      searchCollection(QDRANT_QURAN_COLLECTION, embedding, 10),
      searchCollection(QDRANT_QURAN_ENRICHED_COLLECTION, embedding, 10),
    ]);

    // Find first relevant result position
    const origFirstHit = origResults.findIndex((r) => test.expectedSurahs.includes(r.surahNumber));
    const enrichFirstHit = enrichResults.findIndex((r) => test.expectedSurahs.includes(r.surahNumber));

    const origMRR = origFirstHit >= 0 ? 1 / (origFirstHit + 1) : 0;
    const enrichMRR = enrichFirstHit >= 0 ? 1 / (enrichFirstHit + 1) : 0;

    originalMRRSum += origMRR;
    enrichedMRRSum += enrichMRR;

    if (origFirstHit >= 0 && origFirstHit < 5) originalHit5++;
    if (enrichFirstHit >= 0 && enrichFirstHit < 5) enrichedHit5++;

    let winner = "TIE";
    if (enrichMRR > origMRR) {
      enrichedWins++;
      winner = "ENRICHED ⬆️";
    } else if (origMRR > enrichMRR) {
      originalWins++;
      winner = "ORIGINAL";
    } else {
      ties++;
    }

    console.log("─".repeat(80));
    console.log(`Query: "${test.query}"`);
    console.log(`Concept: ${test.concept}`);
    console.log();

    // Show top 3 from each
    console.log("  Original Top 3:                         Enriched Top 3:");
    for (let i = 0; i < 3; i++) {
      const o = origResults[i];
      const e = enrichResults[i];
      const oMatch = o && test.expectedSurahs.includes(o.surahNumber) ? "✓" : " ";
      const eMatch = e && test.expectedSurahs.includes(e.surahNumber) ? "✓" : " ";
      const oStr = o ? `${o.surahNumber}:${o.ayahNumber} (${o.score.toFixed(3)})` : "-";
      const eStr = e ? `${e.surahNumber}:${e.ayahNumber} (${e.score.toFixed(3)})` : "-";
      console.log(`  ${oMatch} ${oStr.padEnd(32)}    ${eMatch} ${eStr}`);
    }
    console.log();
    console.log(`  MRR: ${origMRR.toFixed(3)} vs ${enrichMRR.toFixed(3)}  →  ${winner}`);

    await new Promise((r) => setTimeout(r, 200));
  }

  const n = CONCEPT_TESTS.length;
  console.log("\n" + "═".repeat(80));
  console.log("CONCEPTUAL QUERY SUMMARY");
  console.log("═".repeat(80));
  console.log();
  console.log("                          ORIGINAL    ENRICHED    WINNER");
  console.log("─".repeat(60));
  console.log(`Mean Reciprocal Rank:     ${(originalMRRSum / n).toFixed(3)}       ${(enrichedMRRSum / n).toFixed(3)}       ${enrichedMRRSum > originalMRRSum ? "ENRICHED ⬆️" : originalMRRSum > enrichedMRRSum ? "ORIGINAL" : "TIE"}`);
  console.log(`Hit@5:                    ${originalHit5}/${n}         ${enrichedHit5}/${n}         ${enrichedHit5 > originalHit5 ? "ENRICHED ⬆️" : originalHit5 > enrichedHit5 ? "ORIGINAL" : "TIE"}`);
  console.log();
  console.log(`Per-Query Wins:           ${originalWins}           ${enrichedWins}           (${ties} ties)`);
  console.log();

  if (enrichedMRRSum > originalMRRSum) {
    const improvement = ((enrichedMRRSum - originalMRRSum) / originalMRRSum * 100).toFixed(1);
    console.log(`✅ ENRICHED embeddings improve MRR by ${improvement}% on conceptual queries`);
  } else if (originalMRRSum > enrichedMRRSum) {
    const decrease = ((originalMRRSum - enrichedMRRSum) / originalMRRSum * 100).toFixed(1);
    console.log(`⚠️ ORIGINAL embeddings perform ${decrease}% better`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
