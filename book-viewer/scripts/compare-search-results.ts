/**
 * Compare search results between Gemini and Local E5 embeddings
 */
import "dotenv/config";
import { qdrant } from "../lib/qdrant";
import { generateEmbedding } from "../lib/embeddings";
import { generateEmbeddingLocal } from "../lib/embeddings-local";

const QUERIES = ["الصلاة", "الزكاة", "الصيام"];

async function main() {
  for (const query of QUERIES) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Query: "${query}"`);
    console.log("=".repeat(60));

    // Generate embeddings
    const geminiEmb = await generateEmbedding(query);
    const localEmb = await generateEmbeddingLocal(query, "query");

    // Search Gemini collection
    console.log("\n--- Gemini Top 5 Results ---");
    const geminiResults = await qdrant.search("sunnah_hadiths", {
      vector: geminiEmb,
      limit: 5,
      with_payload: true,
    });
    for (const r of geminiResults) {
      const text = (r.payload?.textPlain as string)?.slice(0, 80);
      console.log(
        `[${r.score.toFixed(3)}] ${r.payload?.collectionSlug}:${r.payload?.hadithNumber}`
      );
      console.log(`  ${text}...`);
    }

    console.log("\n--- Local E5 Top 5 Results ---");
    const localResults = await qdrant.search("sunnah_hadiths_gemma", {
      vector: localEmb,
      limit: 5,
      with_payload: true,
    });
    for (const r of localResults) {
      const text = (r.payload?.textPlain as string)?.slice(0, 80);
      console.log(
        `[${r.score.toFixed(3)}] ${r.payload?.collectionSlug}:${r.payload?.hadithNumber}`
      );
      console.log(`  ${text}...`);
    }

    await new Promise((r) => setTimeout(r, 500));
  }
}

main().catch(console.error);
