/**
 * Test Fine-tuned BGE-M3 on Quran Search
 */
import "dotenv/config";
import { qdrant } from "../lib/qdrant";

const BGE_COLLECTION = "quran_ayahs_enriched_bge";

// Test queries
const queries = [
  { query: "التوحيد", desc: "Monotheism - should match Al-Ikhlas" },
  { query: "الصبر والصلاة", desc: "Patience and prayer" },
  { query: "آية الكرسي", desc: "Ayat al-Kursi (2:255)" },
  { query: "قصة موسى وفرعون", desc: "Story of Moses and Pharaoh" },
  { query: "الجنة والنار", desc: "Paradise and Hell" },
  { query: "الرحمن الرحيم", desc: "The Most Merciful" },
  { query: "patience in hardship", desc: "English: patience in hardship" },
  { query: "God is one", desc: "English: God is one" },
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

async function test() {
  console.log("Testing Fine-tuned BGE-M3 on Quran Search");
  console.log("=".repeat(60));

  for (const { query, desc } of queries) {
    const embedding = await generateQueryEmbedding(query);

    const results = await qdrant.search(BGE_COLLECTION, {
      vector: embedding,
      limit: 5,
      with_payload: true,
    });

    console.log(`\n📖 Query: "${query}"`);
    console.log(`   (${desc})`);
    console.log("-".repeat(50));

    for (const r of results) {
      const p = r.payload as { surahNumber: number; ayahNumber: number; text: string; surahNameArabic: string };
      const text = p.text?.substring(0, 60) || "";
      console.log(`  [${r.score.toFixed(3)}] ${p.surahNumber}:${p.ayahNumber} (${p.surahNameArabic}) - ${text}...`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Test complete!");
}

test().catch(console.error);
