// Test the full search flow mimicking the API
import { generateEmbedding, normalizeArabicText } from "../lib/embeddings";
import { qdrant, QDRANT_QURAN_COLLECTION } from "../lib/qdrant";
import { keywordSearchAyahsES } from "../lib/search/elasticsearch-search";

const query = "وآخر دعواهم إن الحمدلله رب العالمين";
const MIN_CHARS_FOR_SEMANTIC = 4;
const K_RRF = 60;

type AyahRankedResult = {
  semanticRank?: number;
  keywordRank?: number;
  semanticScore?: number;
  score?: number;
  surahNumber: number;
  ayahNumber: number;
  text: string;
};

function getDynamicSimilarityThreshold(query: string, baseThreshold: number): number {
  const normalized = normalizeArabicText(query).trim();
  const wordCount = normalized.split(/\s+/).filter(w => w.length > 0).length;
  const charCount = normalized.replace(/\s/g, '').length;

  if (charCount <= 3) return Math.max(baseThreshold, 0.55);
  if (charCount <= 6 || wordCount <= 1) return Math.max(baseThreshold, 0.45);
  if (wordCount <= 2) return Math.max(baseThreshold, 0.35);
  return baseThreshold;
}

function hasQuotedPhrases(query: string): boolean {
  const quoteRegex = /["«»„""](.*?)["«»„""]/;
  return quoteRegex.test(query);
}

async function searchAyahsSemantic(query: string, limit: number, cutoff: number, precomputedEmbedding?: number[]) {
  if (hasQuotedPhrases(query)) {
    console.log("Skipping semantic: has quotes");
    return [];
  }

  const normalizedQuery = normalizeArabicText(query);
  if (normalizedQuery.replace(/\s/g, '').length < MIN_CHARS_FOR_SEMANTIC) {
    console.log("Skipping semantic: too short");
    return [];
  }

  const effectiveCutoff = getDynamicSimilarityThreshold(query, cutoff);
  const embedding = precomputedEmbedding ?? await generateEmbedding(normalizedQuery);

  console.log("Effective cutoff:", effectiveCutoff);
  console.log("Embedding dimensions:", embedding.length);

  const searchResults = await qdrant.search(QDRANT_QURAN_COLLECTION, {
    vector: embedding,
    limit,
    with_payload: true,
    score_threshold: effectiveCutoff,
  });

  console.log("Qdrant returned", searchResults.length, "results");

  return searchResults.map((result, index) => {
    const payload = result.payload as { surahNumber: number; ayahNumber: number; text: string };
    return {
      semanticScore: result.score,
      semanticRank: index + 1,
      surahNumber: payload.surahNumber,
      ayahNumber: payload.ayahNumber,
      text: payload.text,
    };
  });
}

function mergeWithRRFGeneric(semanticResults: AyahRankedResult[], keywordResults: AyahRankedResult[]) {
  const resultMap = new Map<string, AyahRankedResult & { rrfScore: number }>();

  for (const item of semanticResults) {
    const key = `${item.surahNumber}-${item.ayahNumber}`;
    resultMap.set(key, { ...item, rrfScore: 0 });
  }

  for (const item of keywordResults) {
    const key = `${item.surahNumber}-${item.ayahNumber}`;
    const existing = resultMap.get(key);
    if (existing) {
      existing.keywordRank = item.keywordRank;
      existing.score = item.score;
    } else {
      resultMap.set(key, { ...item, rrfScore: 0 });
    }
  }

  // Calculate RRF
  for (const item of resultMap.values()) {
    let score = 0;
    if (item.semanticRank !== undefined) {
      score += 1 / (K_RRF + item.semanticRank);
    }
    if (item.keywordRank !== undefined) {
      score += 1 / (K_RRF + item.keywordRank);
    }
    item.rrfScore = score;
  }

  return Array.from(resultMap.values()).sort((a, b) => {
    // Sort by semantic score first (if present), then RRF
    const aHasSemantic = a.semanticScore !== undefined;
    const bHasSemantic = b.semanticScore !== undefined;
    if (aHasSemantic && !bHasSemantic) return -1;
    if (!aHasSemantic && bHasSemantic) return 1;
    if (aHasSemantic && bHasSemantic) {
      return (b.semanticScore || 0) - (a.semanticScore || 0);
    }
    return b.rrfScore - a.rrfScore;
  });
}

async function main() {
  console.log("Query:", query);
  console.log("Normalized:", normalizeArabicText(query));
  console.log("");

  const normalizedQuery = normalizeArabicText(query);
  const shouldSkipSemantic = normalizedQuery.replace(/\s/g, '').length < MIN_CHARS_FOR_SEMANTIC || hasQuotedPhrases(query);
  console.log("shouldSkipSemantic:", shouldSkipSemantic);

  const limit = 20;
  const cutoff = 0.15;

  // Generate embedding
  const embedding = shouldSkipSemantic ? undefined : await generateEmbedding(normalizedQuery);
  console.log("Embedding generated:", embedding ? "yes" : "no");
  console.log("");

  // Run semantic search
  console.log("=== SEMANTIC SEARCH ===");
  const semanticResults = await searchAyahsSemantic(query, limit, cutoff, embedding);
  console.log("Semantic results count:", semanticResults.length);
  for (const r of semanticResults.slice(0, 5)) {
    console.log(`  ${r.surahNumber}:${r.ayahNumber} score=${r.semanticScore?.toFixed(4)}`);
  }
  console.log("");

  // Run keyword search
  console.log("=== KEYWORD SEARCH ===");
  const keywordResults = await keywordSearchAyahsES(query, limit, {});
  console.log("Keyword results count:", keywordResults.length);
  for (const r of keywordResults.slice(0, 5)) {
    console.log(`  ${r.surahNumber}:${r.ayahNumber} score=${r.score?.toFixed(4)}`);
  }
  console.log("");

  // Merge
  console.log("=== MERGED RESULTS ===");
  const merged = mergeWithRRFGeneric(semanticResults, keywordResults as AyahRankedResult[]);
  console.log("Merged results count:", merged.length);
  for (const r of merged.slice(0, 10)) {
    console.log(`  ${r.surahNumber}:${r.ayahNumber} semantic=${r.semanticScore?.toFixed(4) || "null"} keyword=${r.score?.toFixed(4) || "null"}`);
  }
}

main();
