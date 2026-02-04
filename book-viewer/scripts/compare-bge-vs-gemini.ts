/**
 * Compare Fine-tuned BGE-M3 vs Gemini on Quran Search
 */
import "dotenv/config";
import { qdrant } from "../lib/qdrant";

const BGE_COLLECTION = "quran_ayahs_enriched_bge";
const GEMINI_COLLECTION = "quran_ayahs_enriched";

// Test queries with expected results
const queries = [
  { query: "التوحيد", desc: "Monotheism", expected: "112:1 (Al-Ikhlas)" },
  { query: "آية الكرسي", desc: "Ayat al-Kursi", expected: "2:255" },
  { query: "قصة موسى", desc: "Story of Moses", expected: "Surah 20, 26, 28" },
  { query: "الصبر", desc: "Patience", expected: "2:45, 2:153" },
  { query: "الرحمن الرحيم", desc: "Most Merciful", expected: "1:1, 55:1" },
];

async function generateBGEEmbedding(text: string): Promise<number[]> {
  const res = await fetch("http://localhost:8000/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, type: "query" })
  });
  const data = await res.json() as { embedding: number[] };
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

async function searchCollection(collection: string, embedding: number[], limit = 3) {
  const results = await qdrant.search(collection, {
    vector: embedding,
    limit,
    with_payload: true,
  });
  return results.map(r => {
    const p = r.payload as { surahNumber: number; ayahNumber: number; text: string };
    return {
      ref: `${p.surahNumber}:${p.ayahNumber}`,
      score: r.score,
      text: p.text?.substring(0, 50)
    };
  });
}

async function compare() {
  console.log("Comparing Fine-tuned BGE-M3 vs Gemini on Quran Search");
  console.log("=".repeat(70));

  for (const { query, desc, expected } of queries) {
    console.log(`\n📖 Query: "${query}" (${desc})`);
    console.log(`   Expected: ${expected}`);
    console.log("-".repeat(60));

    // Get embeddings
    const bgeEmbed = await generateBGEEmbedding(query);
    const geminiEmbed = await generateGeminiEmbedding(query);

    // Search both collections
    const bgeResults = await searchCollection(BGE_COLLECTION, bgeEmbed);
    const geminiResults = await searchCollection(GEMINI_COLLECTION, geminiEmbed);

    console.log("\n  BGE-M3 (Fine-tuned):");
    for (const r of bgeResults) {
      console.log(`    [${r.score.toFixed(3)}] ${r.ref} - ${r.text}...`);
    }

    console.log("\n  Gemini:");
    for (const r of geminiResults) {
      console.log(`    [${r.score.toFixed(3)}] ${r.ref} - ${r.text}...`);
    }
  }

  console.log("\n" + "=".repeat(70));
}

compare().catch(console.error);
