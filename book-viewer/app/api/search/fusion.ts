import { normalizeBM25Score } from "@/lib/search/bm25";
import { RRF_K, SEMANTIC_WEIGHT, KEYWORD_WEIGHT } from "./config";
import type { RankedResult, AyahRankedResult, HadithRankedResult } from "./types";

/**
 * Reciprocal Rank Fusion score calculation
 */
export function calculateRRFScore(ranks: (number | undefined)[]): number {
  return ranks.reduce((sum: number, rank) => {
    if (rank === undefined) return sum;
    return sum + 1 / (RRF_K + rank);
  }, 0);
}

/**
 * Generic RRF merge function for any content type with weighted score fusion
 */
export function mergeWithRRFGeneric<T extends { semanticRank?: number; keywordRank?: number; semanticScore?: number; score?: number; tsRank?: number; bm25Score?: number }>(
  semanticResults: T[],
  keywordResults: T[],
  getKey: (item: T) => string,
  query: string
): (T & { rrfScore: number; fusedScore: number })[] {
  const resultMap = new Map<string, T & { rrfScore: number; fusedScore: number; keywordScore?: number }>();

  for (const item of semanticResults) {
    const key = getKey(item);
    resultMap.set(key, { ...item, semanticRank: item.semanticRank, rrfScore: 0, fusedScore: 0 });
  }

  for (const item of keywordResults) {
    const key = getKey(item);
    const existing = resultMap.get(key);
    if (existing) {
      existing.keywordRank = item.keywordRank;
      existing.keywordScore = item.score;
      existing.tsRank = item.tsRank;
      existing.bm25Score = item.bm25Score;
    } else {
      resultMap.set(key, { ...item, rrfScore: 0, fusedScore: 0, keywordScore: item.score });
    }
  }

  const merged = Array.from(resultMap.values()).map((item) => {
    const hasSemantic = item.semanticRank !== undefined;
    const hasKeyword = item.keywordRank !== undefined;
    const semanticScore = item.semanticScore ?? 0;

    let fusedScore: number;

    if (hasSemantic && hasKeyword) {
      const rawBM25 = item.bm25Score ?? 0;
      const normalizedBM25 = normalizeBM25Score(rawBM25);
      fusedScore = SEMANTIC_WEIGHT * semanticScore + KEYWORD_WEIGHT * normalizedBM25;
    } else if (hasSemantic) {
      fusedScore = semanticScore;
    } else {
      const rawBM25 = item.bm25Score ?? item.keywordScore ?? 0;
      fusedScore = normalizeBM25Score(rawBM25);
    }

    const rrfScore = calculateRRFScore([item.semanticRank, item.keywordRank]);

    return { ...item, fusedScore, rrfScore, score: fusedScore };
  });

  return merged.sort((a, b) => {
    const fusedDiff = b.fusedScore - a.fusedScore;
    if (Math.abs(fusedDiff) > 0.001) return fusedDiff;
    return b.rrfScore - a.rrfScore;
  });
}

/**
 * Merge results using weighted score fusion for books
 */
export function mergeWithRRF(
  semanticResults: RankedResult[],
  keywordResults: RankedResult[],
  query: string
): (RankedResult & { fusedScore: number })[] {
  const resultMap = new Map<string, RankedResult & { fusedScore: number }>();

  for (const result of semanticResults) {
    const key = `${result.bookId}-${result.pageNumber}`;
    resultMap.set(key, { ...result, fusedScore: 0 });
  }

  for (const result of keywordResults) {
    const key = `${result.bookId}-${result.pageNumber}`;
    const existing = resultMap.get(key);

    if (existing) {
      existing.keywordRank = result.keywordRank;
      existing.keywordScore = result.keywordScore;
      existing.highlightedSnippet = result.highlightedSnippet;
      existing.tsRank = result.tsRank;
      existing.bm25Score = result.bm25Score;
    } else {
      resultMap.set(key, { ...result, fusedScore: 0 });
    }
  }

  const merged = Array.from(resultMap.values()).map((result) => {
    const hasSemantic = result.semanticRank !== undefined;
    const hasKeyword = result.keywordRank !== undefined;
    const semanticScore = result.semanticScore ?? 0;

    let fusedScore: number;

    if (hasSemantic && hasKeyword) {
      const rawBM25 = result.bm25Score ?? 0;
      const normalizedBM25 = normalizeBM25Score(rawBM25);
      fusedScore = SEMANTIC_WEIGHT * semanticScore + KEYWORD_WEIGHT * normalizedBM25;
    } else if (hasSemantic) {
      fusedScore = semanticScore;
    } else {
      const rawBM25 = result.bm25Score ?? result.keywordScore ?? 0;
      fusedScore = normalizeBM25Score(rawBM25);
    }

    const rrfScore = calculateRRFScore([result.semanticRank, result.keywordRank]);

    return { ...result, fusedScore, rrfScore };
  });

  merged.sort((a, b) => {
    const fusedDiff = b.fusedScore - a.fusedScore;
    if (Math.abs(fusedDiff) > 0.001) return fusedDiff;
    return b.rrfScore - a.rrfScore;
  });

  return merged;
}

/**
 * Determine match type based on which search methods found the result
 */
export function getMatchType(
  result: RankedResult
): "semantic" | "keyword" | "both" {
  if (result.semanticRank !== undefined && result.keywordRank !== undefined) {
    return "both";
  }
  if (result.semanticRank !== undefined) {
    return "semantic";
  }
  return "keyword";
}

/**
 * Merge and deduplicate book results from multiple queries using weighted RRF
 */
export function mergeAndDeduplicateBooks(
  resultsPerQuery: { results: RankedResult[]; weight: number }[]
): RankedResult[] {
  const merged = new Map<string, RankedResult & { weightedRrfScore: number }>();

  for (const { results, weight } of resultsPerQuery) {
    for (let rank = 0; rank < results.length; rank++) {
      const result = results[rank];
      const key = `${result.bookId}-${result.pageNumber}`;
      const rrfContribution = weight / (RRF_K + rank + 1);

      const existing = merged.get(key);
      if (existing) {
        existing.weightedRrfScore += rrfContribution;
        if (result.highlightedSnippet && result.highlightedSnippet !== result.textSnippet) {
          existing.highlightedSnippet = result.highlightedSnippet;
        }
        if (result.semanticScore !== undefined && (existing.semanticScore === undefined || result.semanticScore > existing.semanticScore)) {
          existing.semanticScore = result.semanticScore;
        }
        if (result.keywordScore !== undefined && (existing.keywordScore === undefined || result.keywordScore > existing.keywordScore)) {
          existing.keywordScore = result.keywordScore;
        }
        if (result.tsRank !== undefined && (existing.tsRank === undefined || result.tsRank > existing.tsRank)) {
          existing.tsRank = result.tsRank;
        }
        if (result.bm25Score !== undefined && (existing.bm25Score === undefined || result.bm25Score > existing.bm25Score)) {
          existing.bm25Score = result.bm25Score;
        }
      } else {
        merged.set(key, { ...result, weightedRrfScore: rrfContribution });
      }
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => b.weightedRrfScore - a.weightedRrfScore);
}

/**
 * Merge and deduplicate ayah results from multiple queries using weighted RRF
 */
export function mergeAndDeduplicateAyahs(
  resultsPerQuery: { results: AyahRankedResult[]; weight: number }[]
): AyahRankedResult[] {
  const merged = new Map<string, AyahRankedResult & { weightedRrfScore: number }>();

  for (const { results, weight } of resultsPerQuery) {
    for (let rank = 0; rank < results.length; rank++) {
      const result = results[rank];
      const key = `${result.surahNumber}-${result.ayahNumber}`;
      const rrfContribution = weight / (RRF_K + rank + 1);

      const existing = merged.get(key);
      if (existing) {
        existing.weightedRrfScore += rrfContribution;
        if (result.semanticScore !== undefined && (existing.semanticScore === undefined || result.semanticScore > existing.semanticScore)) {
          existing.semanticScore = result.semanticScore;
        }
      } else {
        merged.set(key, { ...result, weightedRrfScore: rrfContribution });
      }
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => b.weightedRrfScore - a.weightedRrfScore);
}

/**
 * Merge and deduplicate hadith results from multiple queries using weighted RRF
 */
export function mergeAndDeduplicateHadiths(
  resultsPerQuery: { results: HadithRankedResult[]; weight: number }[]
): HadithRankedResult[] {
  const merged = new Map<string, HadithRankedResult & { weightedRrfScore: number }>();

  for (const { results, weight } of resultsPerQuery) {
    for (let rank = 0; rank < results.length; rank++) {
      const result = results[rank];
      const key = `${result.collectionSlug}-${result.hadithNumber}`;
      const rrfContribution = weight / (RRF_K + rank + 1);

      const existing = merged.get(key);
      if (existing) {
        existing.weightedRrfScore += rrfContribution;
        if (result.semanticScore !== undefined && (existing.semanticScore === undefined || result.semanticScore > existing.semanticScore)) {
          existing.semanticScore = result.semanticScore;
        }
      } else {
        merged.set(key, { ...result, weightedRrfScore: rrfContribution });
      }
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => b.weightedRrfScore - a.weightedRrfScore);
}
