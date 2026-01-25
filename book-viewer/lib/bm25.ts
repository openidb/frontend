/**
 * BM25 (Best Matching 25) scoring implementation
 *
 * BM25 is a ranking function used in information retrieval that improves upon TF-IDF by:
 * - Adding IDF weighting: Rare terms are more important than common ones
 * - Term frequency saturation: Repeated terms have diminishing returns
 * - Document length normalization: Long documents don't unfairly dominate
 *
 * Formula:
 * BM25(D, Q) = Σ IDF(qi) * (f(qi, D) * (k1 + 1)) / (f(qi, D) + k1 * (1 - b + b * |D|/avgdl))
 */

// BM25 parameters (standard values)
export const BM25_K1 = 1.5; // Term frequency saturation parameter
export const BM25_B = 0.75; // Length normalization parameter (0 = no normalization, 1 = full normalization)

export interface CorpusStats {
  totalDocuments: number;
  avgDocumentLength: number;
}

/**
 * Calculate IDF (Inverse Document Frequency) for a term
 * Uses the Robertson-Sparck Jones formula with +1 smoothing to avoid negative values
 *
 * @param documentFrequency - Number of documents containing the term
 * @param totalDocuments - Total number of documents in the corpus
 * @returns IDF score (higher for rarer terms)
 */
export function calculateIDF(
  documentFrequency: number,
  totalDocuments: number
): number {
  // Robertson-Sparck Jones formula with smoothing
  // log((N - df + 0.5) / (df + 0.5) + 1)
  return Math.log(
    (totalDocuments - documentFrequency + 0.5) / (documentFrequency + 0.5) + 1
  );
}

/**
 * Calculate BM25 score for a document given query terms
 *
 * @param termFrequencies - Map of term -> frequency in the document
 * @param documentLength - Number of words in the document
 * @param termIDFs - Map of term -> IDF score
 * @param avgDocumentLength - Average document length in the corpus
 * @returns BM25 relevance score
 */
export function calculateBM25Score(
  termFrequencies: Map<string, number>,
  documentLength: number,
  termIDFs: Map<string, number>,
  avgDocumentLength: number
): number {
  let score = 0;

  for (const [term, freq] of termFrequencies) {
    const idf = termIDFs.get(term) ?? 0;

    // Skip terms with no IDF (not in query or zero document frequency)
    if (idf === 0) continue;

    // BM25 term frequency component with saturation and length normalization
    const tfNumerator = freq * (BM25_K1 + 1);
    const tfDenominator =
      freq +
      BM25_K1 * (1 - BM25_B + BM25_B * (documentLength / avgDocumentLength));

    score += idf * (tfNumerator / tfDenominator);
  }

  return score;
}

/**
 * Count occurrences of search terms in text
 * Uses simple substring matching (case-insensitive for Latin, exact for Arabic)
 *
 * @param text - The document text to search
 * @param terms - Array of normalized search terms
 * @returns Map of term -> count
 */
export function countTermsInText(
  text: string,
  terms: string[]
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const term of terms) {
    if (!term || term.length === 0) {
      counts.set(term, 0);
      continue;
    }

    // Count occurrences using a simple approach
    // For Arabic text, we use word boundaries with regex
    // Escape special regex characters in the term
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Match term as a whole word (surrounded by whitespace or boundaries)
    // This handles Arabic words properly since \b doesn't work well with Arabic
    const regex = new RegExp(`(?:^|\\s)${escapedTerm}(?:\\s|$)`, "g");
    const matches = text.match(regex);
    counts.set(term, matches?.length ?? 0);
  }

  return counts;
}

/**
 * Count the number of words in text
 * Handles Arabic text by splitting on whitespace
 *
 * @param text - The text to count words in
 * @returns Number of words
 */
export function countWords(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

/**
 * Re-rank search results using BM25 scoring
 *
 * @param results - Array of search results with text content
 * @param queryTerms - Normalized query terms
 * @param corpusStats - Corpus statistics (total docs, avg length)
 * @param termIDFs - Map of term -> IDF score
 * @param getTextField - Function to extract text from result
 * @returns Results sorted by BM25 score (descending)
 */
/**
 * Normalize BM25 score to 0-1 range using sigmoid-like function
 * Maps: 0→0, k→0.5, ∞→1
 *
 * This allows combining BM25 scores with other normalized scores (e.g., semantic similarity)
 *
 * @param score - Raw BM25 score (unbounded, typically 0-10+)
 * @param k - Normalization parameter (score at which output = 0.5). Default: 5
 * @returns Normalized score in [0, 1] range
 */
export function normalizeBM25Score(score: number, k: number = 5): number {
  if (score <= 0) return 0;
  return score / (score + k);
}

/**
 * Combine ts_rank (PostgreSQL FTS score) and BM25 scores with weighted fusion
 *
 * ts_rank captures:
 * - Term proximity and phrase matching (adjacent terms score higher)
 * - Position in document (earlier occurrences may score higher depending on config)
 *
 * BM25 captures:
 * - IDF weighting (rare terms matter more than common ones)
 * - Term frequency saturation (diminishing returns for repeated terms)
 * - Document length normalization (long docs don't dominate)
 *
 * By combining both, we get the benefits of:
 * - Exact phrase matching (from ts_rank)
 * - Rare term boosting (from BM25)
 *
 * @param tsRank - ts_rank score from PostgreSQL FTS
 * @param bm25 - Raw BM25 score
 * @param maxTsRank - Maximum ts_rank in the result set (for normalization)
 * @param maxBM25 - Maximum BM25 score in the result set (for normalization)
 * @param tsWeight - Weight for ts_rank score (default: 0.5 = equal weighting)
 * @returns Combined score in [0, 1] range
 */
export function combineTsRankAndBM25(
  tsRank: number,
  bm25: number,
  maxTsRank: number,
  maxBM25: number,
  tsWeight: number = 0.5
): number {
  // Normalize both to 0-1 range using max normalization
  const tsNorm = maxTsRank > 0 ? tsRank / maxTsRank : 0;
  const bm25Norm = maxBM25 > 0 ? bm25 / maxBM25 : 0;

  // Weighted combination
  return tsNorm * tsWeight + bm25Norm * (1 - tsWeight);
}

export function rerankWithBM25<T>(
  results: T[],
  queryTerms: string[],
  corpusStats: CorpusStats,
  termIDFs: Map<string, number>,
  getTextField: (result: T) => string
): (T & { bm25Score: number })[] {
  const scored = results.map((result) => {
    const text = getTextField(result);
    const termFreqs = countTermsInText(text, queryTerms);
    const docLength = countWords(text);
    const bm25Score = calculateBM25Score(
      termFreqs,
      docLength,
      termIDFs,
      corpusStats.avgDocumentLength
    );

    return { ...result, bm25Score };
  });

  // Sort by BM25 score descending
  return scored.sort((a, b) => b.bm25Score - a.bm25Score);
}
