// Test the exact API semantic search flow
import { generateEmbedding, normalizeArabicText } from "@web/lib/embeddings";
import { qdrant, QDRANT_QURAN_COLLECTION } from "@web/lib/qdrant";

const query = "وآخر دعواهم إن الحمدلله رب العالمين";

// Replicate getDynamicSimilarityThreshold
function getDynamicSimilarityThreshold(query: string, baseThreshold: number): number {
  const normalized = normalizeArabicText(query).trim();
  const wordCount = normalized.split(/\s+/).filter(w => w.length > 0).length;
  const charCount = normalized.replace(/\s/g, '').length;

  console.log(`Query analysis: wordCount=${wordCount}, charCount=${charCount}`);

  if (charCount <= 3) {
    return Math.max(baseThreshold, 0.55);
  }

  if (charCount <= 6 || wordCount <= 1) {
    return Math.max(baseThreshold, 0.45);
  }

  if (wordCount <= 2) {
    return Math.max(baseThreshold, 0.35);
  }

  // Longer queries use base threshold
  return baseThreshold;
}

async function main() {
  console.log("Original query:", query);

  const normalizedQuery = normalizeArabicText(query);
  console.log("Normalized query:", normalizedQuery);

  const baseThreshold = 0.15;  // API default from params
  const effectiveCutoff = getDynamicSimilarityThreshold(query, baseThreshold);
  console.log("Base threshold:", baseThreshold);
  console.log("Effective cutoff:", effectiveCutoff);

  const embedding = await generateEmbedding(normalizedQuery);
  console.log("Embedding generated, dimensions:", embedding.length);

  const searchResults = await qdrant.search(QDRANT_QURAN_COLLECTION, {
    vector: embedding,
    limit: 20,
    with_payload: true,
    score_threshold: effectiveCutoff,
  });

  console.log(`\nSearch returned ${searchResults.length} results:`);
  for (const r of searchResults) {
    const p = r.payload as { surahNumber: number; ayahNumber: number; textPlain: string };
    console.log(`${p.surahNumber}:${p.ayahNumber} score=${r.score.toFixed(4)} ${(p.textPlain?.substring(0, 50) || "")}`);
  }

  // Check specifically for Yunus 10:10
  const yunus = searchResults.find(r => {
    const p = r.payload as { surahNumber: number; ayahNumber: number };
    return p.surahNumber === 10 && p.ayahNumber === 10;
  });

  if (yunus) {
    console.log("\n*** YUNUS 10:10 FOUND with score:", yunus.score);
  } else {
    console.log("\n*** YUNUS 10:10 NOT FOUND in results");
  }
}

main();
