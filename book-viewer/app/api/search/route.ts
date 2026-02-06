/**
 * Hybrid Search API Endpoint
 *
 * GET /api/search?q={query}&limit={20}&mode={hybrid|semantic|keyword}&bookId={optional}
 *     &includeQuran={true}&includeHadith={true}&includeBooks={true}
 *     &reranker={qwen4b|qwen8b|jina|none}&similarityCutoff={0.6}
 *     &preRerankLimit={50}&postRerankLimit={10}
 *
 * Performs hybrid search combining:
 * - Elasticsearch BM25 search (keyword)
 * - Qdrant vector search (semantic)
 * - Reciprocal Rank Fusion (RRF) for combining results
 */

import { NextRequest, NextResponse } from "next/server";
import {
  qdrant,
  QDRANT_COLLECTION,
  QDRANT_AUTHORS_COLLECTION,
  QDRANT_QURAN_COLLECTION,
  QDRANT_QURAN_ENRICHED_COLLECTION,
  QDRANT_HADITH_COLLECTION,
  QDRANT_COLLECTION_BGE,
  QDRANT_QURAN_ENRICHED_COLLECTION_BGE,
  QDRANT_HADITH_COLLECTION_BGE,
  GEMINI_DIMENSIONS,
  BGE_DIMENSIONS,
} from "@/lib/qdrant";
import {
  generateEmbedding,
  normalizeArabicText,
  getEmbeddingModelName,
  type EmbeddingModel,
} from "@/lib/embeddings";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import OpenAI from "openai";
import { normalizeBM25Score } from "@/lib/bm25";
import {
  keywordSearchES,
  keywordSearchHadithsES,
  keywordSearchAyahsES,
  generateSunnahComUrl,
} from "@/lib/elasticsearch-search";
import { lookupFamousVerse, lookupFamousHadith, lookupSurah, type VerseReference, type HadithReference, type SurahReference } from "@/lib/famous-sources";
import { getCachedExpansion, setCachedExpansion } from "@/lib/query-expansion-cache";

// OpenRouter client for Qwen embeddings
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

type RerankerType = "gpt-oss-20b" | "gpt-oss-120b" | "gemini-flash" | "jina" | "qwen4b" | "none";

// Books to exclude from search results
// These books contain sources that negatively impact search quality
const EXCLUDED_BOOK_IDS = new Set([
  "2", // كتاب النوازل في الرضاع - excluded due to sources that negatively impacted search relevance
]);

export const dynamic = "force-dynamic";

type SearchMode = "hybrid" | "semantic" | "keyword";

interface SearchResult {
  score: number;
  semanticScore?: number;
  rank?: number;              // Position after reranking (1-indexed)
  bookId: string;
  pageNumber: number;
  volumeNumber: number;
  textSnippet: string;
  highlightedSnippet: string;
  matchType: "semantic" | "keyword" | "both";
  urlPageIndex?: string;
  contentTranslation?: string | null;  // Cached translation of the matched paragraph
  book: {
    id: string;
    titleArabic: string;
    titleLatin: string;
    titleTranslated?: string | null;
    filename: string;
    author: {
      nameArabic: string;
      nameLatin: string;
    };
  } | null;
}

interface AyahResult {
  score: number;
  semanticScore?: number;
  rank?: number;              // Position after reranking (1-indexed)
  surahNumber: number;
  ayahNumber: number;
  ayahEnd?: number;           // End ayah for chunks (undefined for single ayahs)
  ayahNumbers?: number[];     // All ayah numbers in chunk
  surahNameArabic: string;
  surahNameEnglish: string;
  text: string;
  translation?: string;       // Translation text in user's preferred language
  juzNumber: number;
  pageNumber: number;
  quranComUrl: string;
  isChunk?: boolean;          // True if this is a chunked result
  wordCount?: number;         // Word count for the chunk
}

interface HadithResult {
  score: number;
  semanticScore?: number;
  rank?: number;              // Position after reranking (1-indexed)
  bookId: number;             // For translation lookup
  collectionSlug: string;
  collectionNameArabic: string;
  collectionNameEnglish: string;
  bookNumber: number;
  bookNameArabic: string;
  bookNameEnglish: string;
  hadithNumber: string;
  text: string;
  chapterArabic: string | null;
  chapterEnglish: string | null;
  sunnahComUrl: string;
  translation?: string;       // English translation (when requested)
}

interface AuthorResult {
  id: string;  // shamela_author_id is now the primary key
  nameArabic: string;
  nameLatin: string;
  deathDateHijri: string | null;
  deathDateGregorian: string | null;
  booksCount: number;
}

interface RankedResult {
  bookId: string;
  pageNumber: number;
  volumeNumber: number;
  textSnippet: string;
  highlightedSnippet: string;
  semanticRank?: number;
  keywordRank?: number;
  semanticScore?: number;
  keywordScore?: number;
  tsRank?: number;        // Raw ts_rank score before fusion
  bm25Score?: number;     // Raw BM25 score before fusion
  fusedScore?: number;    // Weighted fusion score (semantic + bm25)
  urlPageIndex?: string;
  contentTranslation?: string | null;  // Cached translation of the matched paragraph
}

interface HadithRankedResult extends HadithResult {
  semanticRank?: number;
  keywordRank?: number;
  tsRank?: number;
  bm25Score?: number;
}

interface AyahRankedResult extends AyahResult {
  semanticRank?: number;
  keywordRank?: number;
  tsRank?: number;
  bm25Score?: number;
}

/**
 * Metadata about which Quran collection was used for semantic search
 */
interface AyahSearchMeta {
  collection: string;
  usedFallback: boolean;
  embeddingTechnique?: string;
}

/**
 * Result of searchAyahsSemantic including metadata
 */
interface AyahSemanticSearchResult {
  results: AyahRankedResult[];
  meta: AyahSearchMeta;
}

// ============================================================================
// Debug Stats Interface (for search analytics panel)
// ============================================================================

interface TopResultBreakdown {
  rank: number;
  type: 'book' | 'quran' | 'hadith';
  title: string;
  keywordScore: number | null; // BM25 score from Elasticsearch
  semanticScore: number | null;
  finalScore: number;
  matchType: 'semantic' | 'keyword' | 'both'; // How this result was matched
}

interface ExpandedQueryStats {
  query: string;
  weight: number;
  docsRetrieved: number;
  // Per-type breakdown
  books: number;
  ayahs: number;
  hadiths: number;
  // Timing for this query
  searchTimeMs: number;
}

interface SearchDebugStats {
  // Database totals (cached)
  databaseStats: DatabaseStats;
  // Search params
  searchParams: {
    mode: string;
    cutoff: number;
    totalAboveCutoff: number;
    totalShown: number;
  };
  // Algorithm details (expanded for full formula display)
  algorithm: {
    fusionMethod: string;
    fusionWeights: { semantic: number; keyword: number };
    keywordEngine: string; // e.g., "elasticsearch"
    bm25Params: { k1: number; b: number; normK: number };
    rrfK: number;
    embeddingModel: string;
    embeddingDimensions: number;
    rerankerModel: string | null;
    queryExpansionModel: string | null;
    // Quran embedding collection info
    quranCollection: string;
    quranCollectionFallback: boolean;
    embeddingTechnique?: string;
  };
  // Top results breakdown
  topResultsBreakdown: TopResultBreakdown[];
  // Refine-specific stats
  refineStats?: {
    expandedQueries: ExpandedQueryStats[];
    originalQueryDocs: number;
    // Timing breakdown for refine operations (ms)
    timing: {
      queryExpansion: number;
      parallelSearches: number;  // Total time for all parallel searches
      merge: number;
      rerank: number;
      total: number;
    };
    // Candidate counts
    candidates: {
      totalBeforeMerge: number;  // Sum of all docs from all queries
      afterMerge: { books: number; ayahs: number; hadiths: number };
      sentToReranker: number;
    };
    // Cache info
    queryExpansionCached: boolean;
  };
  // Reranker timeout notification
  rerankerTimedOut?: boolean;
  // Performance timing (ms)
  timing?: {
    total: number;
    embedding: number;
    semantic: { books: number; ayahs: number; hadiths: number };
    keyword: { books: number; ayahs: number; hadiths: number };
    merge: number;
    directLookup: number;
    authorSearch: number;
    rerank?: number;
    translations: number;
    bookMetadata: number;
  };
}

// RRF constant (standard value is 60)
const RRF_K = 60;

// ============================================================================
// Book Content Translation Helpers
// ============================================================================

/**
 * Extract paragraph texts from page HTML content
 * Used to match search snippets to their corresponding translated paragraphs
 */
function extractParagraphTexts(html: string): string[] {
  const paragraphs: string[] = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = pRegex.exec(html)) !== null) {
    const text = match[1]
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length > 1) paragraphs.push(text);
  }
  return paragraphs;
}

/**
 * Find the paragraph index that best matches a search snippet
 * Returns the index of the paragraph containing the snippet, or 0 as fallback
 */
function findMatchingParagraphIndex(snippet: string, paragraphs: string[]): number {
  // Clean snippet for comparison (remove highlight marks, normalize whitespace)
  const cleanSnippet = snippet
    .replace(/<\/?mark>/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // Find paragraph that contains or matches the snippet
  for (let i = 0; i < paragraphs.length; i++) {
    const normalizedParagraph = paragraphs[i].replace(/\s+/g, " ").trim();
    // Check if either contains the other (handles partial matches)
    if (normalizedParagraph.includes(cleanSnippet) || cleanSnippet.includes(normalizedParagraph)) {
      return i;
    }
  }

  // Fallback: find paragraph with most word overlap
  const snippetWords = new Set(cleanSnippet.split(/\s+/).filter(w => w.length > 2));
  let bestIndex = 0;
  let bestOverlap = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraphWords = paragraphs[i].split(/\s+/).filter(w => w.length > 2);
    const overlap = paragraphWords.filter(w => snippetWords.has(w)).length;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestIndex = i;
    }
  }

  return bestIndex;
}

// ============================================================================
// Database Statistics Caching (for debug panel)
// ============================================================================

interface DatabaseStats {
  totalBooks: number;
  totalPages: number;
  totalHadiths: number;
  totalAyahs: number;
}

let databaseStatsCache: { stats: DatabaseStats; expires: number } | null = null;
const DB_STATS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get database statistics for debug panel (cached)
 * Returns total counts for books, pages, hadiths, and ayahs
 */
async function getDatabaseStats(): Promise<DatabaseStats> {
  if (databaseStatsCache && databaseStatsCache.expires > Date.now()) {
    return databaseStatsCache.stats;
  }

  const [booksResult, pagesResult, hadithsResult, ayahsResult] = await Promise.all([
    prisma.book.count(),
    prisma.page.count(),
    prisma.hadith.count(),
    prisma.ayah.count(),
  ]);

  const stats: DatabaseStats = {
    totalBooks: booksResult,
    totalPages: pagesResult,
    totalHadiths: hadithsResult,
    totalAyahs: ayahsResult,
  };

  databaseStatsCache = { stats, expires: Date.now() + DB_STATS_CACHE_TTL };
  console.log(`[Debug] Cached database stats: ${stats.totalBooks} books, ${stats.totalPages} pages, ${stats.totalHadiths} hadiths, ${stats.totalAyahs} ayahs`);
  return stats;
}

// Minimum character count for semantic search (queries below this skip semantic)
// Short queries (≤3 chars) lack meaningful semantic content and produce noisy results
const MIN_CHARS_FOR_SEMANTIC = 4;

/**
 * Calculate dynamic similarity threshold based on query characteristics
 * Shorter queries need higher thresholds to filter noise from sparse embeddings
 */
function getDynamicSimilarityThreshold(query: string, baseThreshold: number): number {
  const normalized = normalizeArabicText(query).trim();
  const wordCount = normalized.split(/\s+/).filter(w => w.length > 0).length;
  const charCount = normalized.replace(/\s/g, '').length;

  // Very short queries (1-3 chars): significantly boost threshold
  if (charCount <= 3) {
    return Math.max(baseThreshold, 0.55);
  }

  // Short queries (4-6 chars or single word): moderately boost
  if (charCount <= 6 || wordCount === 1) {
    return Math.max(baseThreshold, 0.40);
  }

  // Medium queries (7-12 chars): slight boost
  if (charCount <= 12) {
    return Math.max(baseThreshold, 0.30);
  }

  // Longer queries: use base threshold
  return baseThreshold;
}

/**
 * Reciprocal Rank Fusion score calculation
 */
function calculateRRFScore(ranks: (number | undefined)[]): number {
  return ranks.reduce((sum: number, rank) => {
    if (rank === undefined) return sum;
    return sum + 1 / (RRF_K + rank);
  }, 0);
}

/**
 * Format an Ayah result for reranking with metadata context
 */
function formatAyahForReranking(ayah: AyahRankedResult): string {
  const range = ayah.ayahEnd ? `${ayah.ayahNumber}-${ayah.ayahEnd}` : String(ayah.ayahNumber);
  return `[QURAN] ${ayah.surahNameArabic} (${ayah.surahNameEnglish}), Ayah ${range}
${ayah.text.slice(0, 800)}`;
}

/**
 * Format a Hadith result for reranking with metadata context
 */
function formatHadithForReranking(hadith: HadithRankedResult): string {
  const chapter = hadith.chapterArabic ? ` - ${hadith.chapterArabic}` : '';
  return `[HADITH] ${hadith.collectionNameArabic} (${hadith.collectionNameEnglish}), ${hadith.bookNameArabic}${chapter}
${hadith.text.slice(0, 800)}`;
}

/**
 * Format a Book result for reranking with metadata context
 */
function formatBookForReranking(result: RankedResult, bookTitle?: string, authorName?: string): string {
  const meta = bookTitle ? `[BOOK] ${bookTitle}${authorName ? ` - ${authorName}` : ''}, p.${result.pageNumber}` : `[BOOK] Page ${result.pageNumber}`;
  return `${meta}
${result.textSnippet.slice(0, 800)}`;
}

/**
 * Check if query contains Arabic characters
 * Used to skip keyword search for non-Arabic queries on Arabic-only text columns
 */
function isArabicQuery(query: string): boolean {
  // Arabic Unicode range: \u0600-\u06FF (Arabic), \u0750-\u077F (Arabic Supplement)
  const arabicPattern = /[\u0600-\u06FF\u0750-\u077F]/;
  return arabicPattern.test(query);
}

/**
 * Search strategy based on query language
 * - Non-Arabic queries use semantic only (database content is Arabic)
 * - Arabic/mixed queries use hybrid (semantic + keyword)
 */
type SearchStrategy = 'semantic_only' | 'hybrid';

function getSearchStrategy(query: string): SearchStrategy {
  if (!isArabicQuery(query)) {
    return 'semantic_only';
  }
  return 'hybrid';
}

/**
 * Prepare search terms for PostgreSQL full-text search
 */
function prepareSearchTerms(query: string): string[] {
  // Strip diacritics first since text_plain columns have them removed
  const normalized = normalizeArabicText(query);

  return normalized
    .trim()
    .split(/\s+/)
    .filter((term) => term.length > 0)
    .map((term) => term.replace(/[^\u0600-\u06FF\w]/g, "")) // Keep Arabic and alphanumeric
    .filter((term) => term.length > 0);
}

/**
 * Check if query contains quoted phrases (user wants exact match)
 * When quotes are present, semantic search should be skipped
 */
function hasQuotedPhrases(query: string): boolean {
  const quoteRegex = /["«»„""](.*?)["«»„""]/;
  return quoteRegex.test(query);
}

// ============================================================================
// API Timeout Utility
// ============================================================================

/**
 * Fetch with timeout using AbortController
 * Returns the response or throws an error if timeout is exceeded
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = 15000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================================
// Score Fusion: Weighted Combination Approach
// ============================================================================

// Weighted fusion: combine semantic and keyword scores
// Max fused score = 0.8 + 0.3 = 1.1 (rewards results found by both methods)
const SEMANTIC_WEIGHT = 0.8;
const KEYWORD_WEIGHT = 0.3;

/**
 * Parsed search query with phrases and individual terms
 */
interface ParsedQuery {
  phrases: string[];  // Exact phrases from quoted sections (use <-> operator)
  terms: string[];    // Individual terms (use | OR operator)
}

/**
 * Parse search query to extract quoted phrases and individual terms
 * Supports regular quotes (""), Arabic quotes («»), and guillemets
 */
function parseSearchQuery(query: string): ParsedQuery {
  const phrases: string[] = [];
  const terms: string[] = [];

  // Match quoted phrases: regular quotes, Arabic quotes, guillemets
  const quoteRegex = /["«»„""](.*?)["«»„""]/g;
  let match;
  let lastIndex = 0;

  while ((match = quoteRegex.exec(query)) !== null) {
    // Unquoted text before this match → individual terms
    const before = query.slice(lastIndex, match.index).trim();
    if (before) {
      terms.push(...prepareSearchTerms(before));
    }

    // Quoted phrase - normalize and clean
    const phrase = normalizeArabicText(match[1]).trim();
    if (phrase && phrase.includes(' ')) {
      // Multi-word phrase: clean each word and add as phrase
      const words = phrase.split(/\s+/)
        .map((w) => w.replace(/[^\u0600-\u06FF\w]/g, ""))
        .filter((w) => w.length > 0);
      if (words.length > 1) {
        phrases.push(words.join(' '));
      } else if (words.length === 1) {
        terms.push(words[0]); // Single word in quotes → regular term
      }
    } else if (phrase) {
      // Single word in quotes → treat as regular term
      const cleaned = phrase.replace(/[^\u0600-\u06FF\w]/g, "");
      if (cleaned.length > 0) {
        terms.push(cleaned);
      }
    }

    lastIndex = quoteRegex.lastIndex;
  }

  // Remaining text after last quote → terms
  const remaining = query.slice(lastIndex).trim();
  if (remaining) {
    terms.push(...prepareSearchTerms(remaining));
  }

  return { phrases, terms };
}

/**
 * Build PostgreSQL tsquery from parsed query
 * - Phrases use <-> (FOLLOWED BY) for exact sequence matching
 * - Terms use | (OR) for broader matching
 * - Combined with & (AND) when both present
 */
function buildTsQuery(parsed: ParsedQuery): string {
  const queryParts: string[] = [];

  // Phrases: use <-> for sequential matching
  for (const phrase of parsed.phrases) {
    const words = phrase.split(/\s+/).filter((w) => w.length > 0);
    if (words.length > 1) {
      queryParts.push(`(${words.join(' <-> ')})`);
    } else if (words.length === 1) {
      queryParts.push(words[0]);
    }
  }

  // Terms: use | (OR)
  if (parsed.terms.length > 0) {
    queryParts.push(`(${parsed.terms.join(' | ')})`);
  }

  // Combine with & (AND) - phrases must match AND at least one term
  return queryParts.join(' & ');
}

/**
 * Generic RRF merge function for any content type with weighted score fusion
 *
 * Uses normalized score fusion with query-aware weights:
 * - BM25 scores are normalized to 0-1 using sigmoid function
 * - Semantic and BM25 are combined with weights based on query characteristics
 * - Results appearing in both searches get a 10% boost
 * - RRF score is used as tiebreaker
 */
function mergeWithRRFGeneric<T extends { semanticRank?: number; keywordRank?: number; semanticScore?: number; score?: number; tsRank?: number; bm25Score?: number }>(
  semanticResults: T[],
  keywordResults: T[],
  getKey: (item: T) => string,
  query: string
): (T & { rrfScore: number; fusedScore: number })[] {
  const resultMap = new Map<string, T & { rrfScore: number; fusedScore: number; keywordScore?: number }>();

  // Add semantic results
  for (const item of semanticResults) {
    const key = getKey(item);
    resultMap.set(key, { ...item, semanticRank: item.semanticRank, rrfScore: 0, fusedScore: 0 });
  }

  // Merge keyword results
  for (const item of keywordResults) {
    const key = getKey(item);
    const existing = resultMap.get(key);
    if (existing) {
      existing.keywordRank = item.keywordRank;
      // Keyword results have BM25 score in the `score` field
      existing.keywordScore = item.score;
      // Preserve ts_rank and bm25Score from keyword results
      existing.tsRank = item.tsRank;
      existing.bm25Score = item.bm25Score;
    } else {
      resultMap.set(key, { ...item, rrfScore: 0, fusedScore: 0, keywordScore: item.score });
    }
  }

  // Calculate fused scores and RRF scores using weighted combination approach
  const merged = Array.from(resultMap.values()).map((item) => {
    const hasSemantic = item.semanticRank !== undefined;
    const hasKeyword = item.keywordRank !== undefined;
    const semanticScore = item.semanticScore ?? 0;

    let fusedScore: number;

    if (hasSemantic && hasKeyword) {
      // Both signals: weighted combination (max 1.1 = 0.8 + 0.3)
      // Use RAW bm25Score (typically 8-13 range), not the already-normalized keywordScore
      const rawBM25 = item.bm25Score ?? 0;
      const normalizedBM25 = normalizeBM25Score(rawBM25);
      fusedScore = SEMANTIC_WEIGHT * semanticScore + KEYWORD_WEIGHT * normalizedBM25;
    } else if (hasSemantic) {
      // Semantic only: full semantic score
      fusedScore = semanticScore;
    } else {
      // Keyword only: full normalized BM25 score
      const rawBM25 = item.bm25Score ?? item.keywordScore ?? 0;
      fusedScore = normalizeBM25Score(rawBM25);
    }

    const rrfScore = calculateRRFScore([item.semanticRank, item.keywordRank]);

    // Set score = fusedScore so unified results use the normalized/fused score
    return { ...item, fusedScore, rrfScore, score: fusedScore };
  });

  // Sort by fused score (primary), RRF as tiebreaker
  return merged.sort((a, b) => {
    const fusedDiff = b.fusedScore - a.fusedScore;
    if (Math.abs(fusedDiff) > 0.001) return fusedDiff;
    return b.rrfScore - a.rrfScore;
  });
}

/**
 * Rerank results using Jina's multilingual reranker
 * Returns results sorted by relevance score, plus timedOut flag
 */
async function rerankWithJina<T>(
  query: string,
  results: T[],
  getText: (item: T) => string,
  topN: number
): Promise<{ results: T[]; timedOut: boolean }> {
  if (results.length === 0 || !process.env.JINA_API_KEY) {
    return { results: results.slice(0, topN), timedOut: false };
  }

  const TIMEOUT_MS = 10000; // 10 seconds
  try {
    const response = await fetchWithTimeout("https://api.jina.ai/v1/rerank", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.JINA_API_KEY}`,
      },
      body: JSON.stringify({
        model: "jina-reranker-v2-base-multilingual",
        query: query,
        top_n: Math.min(topN, results.length),
        documents: results.map((r) => getText(r)),
      }),
    }, TIMEOUT_MS);

    if (!response.ok) {
      throw new Error(`Jina API error: ${response.status}`);
    }

    const data = await response.json();
    return { results: data.results.map((r: { index: number }) => results[r.index]), timedOut: false };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError';
    if (timedOut) {
      console.warn(`[Reranker] Jina timed out after ${TIMEOUT_MS}ms, using RRF order`);
    } else {
      console.warn("[Reranker] Jina failed, using RRF order:", err);
    }
    return { results: results.slice(0, topN), timedOut };
  }
}

/**
 * Rerank results using Qwen embedding model (cosine similarity)
 * Good for cross-lingual queries (English -> Arabic)
 */
async function rerankWithQwen<T>(
  query: string,
  results: T[],
  getText: (item: T) => string,
  topN: number,
  model: "qwen/qwen3-embedding-4b" | "qwen/qwen3-embedding-8b" = "qwen/qwen3-embedding-4b"
): Promise<T[]> {
  if (results.length === 0 || !process.env.OPENROUTER_API_KEY) {
    return results.slice(0, topN);
  }

  try {
    // Generate embeddings for query and all documents in one batch
    const documents = results.map((r) => getText(r));
    const allTexts = [query, ...documents];

    const response = await openrouter.embeddings.create({
      model: model,
      input: allTexts,
    });

    const embeddings = response.data.map(d => d.embedding);
    const queryEmb = embeddings[0];
    const docEmbs = embeddings.slice(1);

    // Calculate cosine similarity for each document
    const scores = docEmbs.map((docEmb, index) => {
      const dotProduct = queryEmb.reduce((sum, a, i) => sum + a * docEmb[i], 0);
      const magQ = Math.sqrt(queryEmb.reduce((sum, a) => sum + a * a, 0));
      const magD = Math.sqrt(docEmb.reduce((sum, a) => sum + a * a, 0));
      return { index, score: dotProduct / (magQ * magD) };
    });

    // Sort by score descending and return top N results in original type
    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, topN)
      .map((s) => results[s.index]);
  } catch (err) {
    console.warn("Qwen reranking failed, using RRF order:", err);
    return results.slice(0, topN);
  }
}

/**
 * Rerank results using OpenAI's GPT-OSS models via OpenRouter
 * Uses LLM-based relevance ranking for best quality
 */
async function rerankWithGptOss<T>(
  query: string,
  results: T[],
  getText: (item: T) => string,
  topN: number,
  model: "openai/gpt-oss-20b" | "openai/gpt-oss-120b" = "openai/gpt-oss-20b"
): Promise<{ results: T[]; timedOut: boolean }> {
  if (results.length === 0 || !process.env.OPENROUTER_API_KEY) {
    return { results: results.slice(0, topN), timedOut: false };
  }

  const TIMEOUT_MS = 20000; // 20 seconds
  try {
    // Build reranking prompt with documents (800 chars for more context)
    const docsText = results
      .map((d, i) => `[${i + 1}] ${getText(d).slice(0, 800)}`)
      .join("\n\n");

    const prompt = `You are ranking Arabic/Islamic documents for a search query.

Query: "${query}"

Documents:
${docsText}

STEP 1: DETERMINE USER INTENT
Identify which type of search this is:

A) SPECIFIC SOURCE LOOKUP - User wants a particular Quran verse or hadith
   Indicators: Named verses (آية الكرسي، آية النور، الفاتحة), famous hadiths by title
   (إنما الأعمال بالنيات، حديث جبريل، حديث الولي), surah/ayah references (البقرة 255)

B) QUESTION - User seeks an answer (ما، لماذا، كيف، متى، حكم، what, why, how)

C) TOPIC SEARCH - User wants content about a subject (person, concept, ruling)

STEP 2: RANK BY INTENT

**If SPECIFIC SOURCE LOOKUP (A):**
Priority order:
1. [QURAN] or [HADITH] containing the EXACT verse/hadith being searched (HIGHEST)
2. [QURAN] or [HADITH] closely related to the searched source
3. [BOOK] with detailed tafsir/sharh of that specific source
4. [BOOK] that quotes or references the source
5. Unrelated content (LOWEST)

Example: "آية الكرسي" → BEST: [QURAN] Al-Baqarah 255

**If QUESTION (B):**
1. Documents that directly ANSWER the question (highest)
2. Documents that explain/discuss the answer
3. Documents that mention the topic but don't answer
4. Unrelated documents (lowest)

**If TOPIC SEARCH (C):**
1. Documents primarily ABOUT the topic (highest)
2. Documents with significant discussion of topic
3. Documents mentioning topic in context
4. Unrelated documents (lowest)

CROSS-LINGUAL MATCHING:
- "ayat al-kursi" = "آية الكرسي"
- "surah fatiha" = "سورة الفاتحة"
- "hadith of intentions" = "حديث النيات" / "الأعمال بالنيات"

Return ONLY a JSON array of document numbers by relevance: [3, 1, 5, 2, 4]`;

    const response = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      }),
    }, TIMEOUT_MS);

    if (!response.ok) {
      throw new Error(`GPT-OSS reranking failed: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";

    // Parse ranking from response
    const match = content.match(/\[[\d,\s]+\]/);
    if (!match) {
      // Fallback to original order
      console.warn("GPT-OSS returned invalid format, using original order");
      return { results: results.slice(0, topN), timedOut: false };
    }

    const ranking: number[] = JSON.parse(match[0]);

    // Map ranking back to results (1-indexed to 0-indexed)
    const reranked: T[] = [];
    for (const docNum of ranking.slice(0, topN)) {
      const idx = docNum - 1;
      if (idx >= 0 && idx < results.length && !reranked.includes(results[idx])) {
        reranked.push(results[idx]);
      }
    }

    // Fill remaining slots if ranking was incomplete
    for (const result of results) {
      if (reranked.length >= topN) break;
      if (!reranked.includes(result)) {
        reranked.push(result);
      }
    }

    return { results: reranked.slice(0, topN), timedOut: false };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError';
    if (timedOut) {
      console.warn(`[Reranker] GPT-OSS timed out after ${TIMEOUT_MS}ms, using RRF order`);
    } else {
      console.warn("[Reranker] GPT-OSS failed, using original order:", err);
    }
    return { results: results.slice(0, topN), timedOut };
  }
}

/**
 * LLM reranker using Gemini Flash
 * Fast, high-quality reasoning with the same prompt as GPT-OSS
 */
async function rerankWithGemini<T>(
  query: string,
  results: T[],
  getText: (item: T) => string,
  topN: number
): Promise<{ results: T[]; timedOut: boolean }> {
  if (results.length === 0 || !process.env.OPENROUTER_API_KEY) {
    return { results: results.slice(0, topN), timedOut: false };
  }

  const TIMEOUT_MS = 15000; // 15 seconds
  try {
    const docsText = results
      .map((d, i) => `[${i + 1}] ${getText(d).slice(0, 800)}`)
      .join("\n\n");

    const prompt = `You are ranking Arabic/Islamic documents for a search query.

Query: "${query}"

Documents:
${docsText}

STEP 1: DETERMINE USER INTENT
Identify which type of search this is:

A) SPECIFIC SOURCE LOOKUP - User wants a particular Quran verse or hadith
   Indicators: Named verses (آية الكرسي، آية النور، الفاتحة), famous hadiths by title
   (إنما الأعمال بالنيات، حديث جبريل، حديث الولي), surah/ayah references (البقرة 255)

B) QUESTION - User seeks an answer (ما، لماذا، كيف، متى، حكم، what, why, how)

C) TOPIC SEARCH - User wants content about a subject (person, concept, ruling)

STEP 2: RANK BY INTENT

**If SPECIFIC SOURCE LOOKUP (A):**
Priority order:
1. [QURAN] or [HADITH] containing the EXACT verse/hadith being searched (HIGHEST)
2. [QURAN] or [HADITH] closely related to the searched source
3. [BOOK] with detailed tafsir/sharh of that specific source
4. [BOOK] that quotes or references the source
5. Unrelated content (LOWEST)

Example: "آية الكرسي" → BEST: [QURAN] Al-Baqarah 255

**If QUESTION (B):**
1. Documents that directly ANSWER the question (highest)
2. Documents that explain/discuss the answer
3. Documents that mention the topic but don't answer
4. Unrelated documents (lowest)

**If TOPIC SEARCH (C):**
1. Documents primarily ABOUT the topic (highest)
2. Documents with significant discussion of topic
3. Documents mentioning topic in context
4. Unrelated documents (lowest)

CROSS-LINGUAL MATCHING:
- "ayat al-kursi" = "آية الكرسي"
- "surah fatiha" = "سورة الفاتحة"
- "hadith of intentions" = "حديث النيات" / "الأعمال بالنيات"

Return ONLY a JSON array of document numbers by relevance: [3, 1, 5, 2, 4]`;

    const response = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      }),
    }, TIMEOUT_MS);

    if (!response.ok) {
      throw new Error(`Gemini reranking failed: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";

    // Parse ranking from response
    const match = content.match(/\[[\d,\s]+\]/);
    if (!match) {
      console.warn("Gemini returned invalid format, using original order");
      return { results: results.slice(0, topN), timedOut: false };
    }

    const ranking: number[] = JSON.parse(match[0]);

    // Map ranking back to results (1-indexed to 0-indexed)
    const reranked: T[] = [];
    for (const docNum of ranking.slice(0, topN)) {
      const idx = docNum - 1;
      if (idx >= 0 && idx < results.length && !reranked.includes(results[idx])) {
        reranked.push(results[idx]);
      }
    }

    // Fill remaining slots if ranking was incomplete
    for (const result of results) {
      if (reranked.length >= topN) break;
      if (!reranked.includes(result)) {
        reranked.push(result);
      }
    }

    return { results: reranked.slice(0, topN), timedOut: false };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError';
    if (timedOut) {
      console.warn(`[Reranker] Gemini timed out after ${TIMEOUT_MS}ms, using RRF order`);
    } else {
      console.warn("[Reranker] Gemini failed, using original order:", err);
    }
    return { results: results.slice(0, topN), timedOut };
  }
}

/**
 * Rerank results using the specified reranker
 * Returns results and timedOut flag (true if reranker timed out)
 */
async function rerank<T>(
  query: string,
  results: T[],
  getText: (item: T) => string,
  topN: number,
  reranker: RerankerType
): Promise<{ results: T[]; timedOut: boolean }> {
  if (results.length === 0 || reranker === "none") {
    return { results: results.slice(0, topN), timedOut: false };
  }

  switch (reranker) {
    case "gpt-oss-20b":
      return rerankWithGptOss(query, results, getText, topN, "openai/gpt-oss-20b");
    case "gpt-oss-120b":
      return rerankWithGptOss(query, results, getText, topN, "openai/gpt-oss-120b");
    case "gemini-flash":
      return rerankWithGemini(query, results, getText, topN);
    case "jina":
      return rerankWithJina(query, results, getText, topN);
    case "qwen4b":
      // Qwen uses embedding model, doesn't make API calls that could timeout
      return { results: await rerankWithQwen(query, results, getText, topN, "qwen/qwen3-embedding-4b"), timedOut: false };
    default:
      return { results: results.slice(0, topN), timedOut: false };
  }
}

// ============================================================================
// Famous Source Direct Lookup
// ============================================================================

/**
 * Fetch a specific ayah directly by surah/ayah reference
 * Used when famous source lookup matches a known verse
 * Returns with score: 1.0 (perfect match)
 */
async function fetchAyahDirect(
  surahNumber: number,
  ayahNumber: number,
  ayahEnd?: number
): Promise<AyahRankedResult[]> {
  try {
    // Fetch surah metadata
    const surah = await prisma.surah.findUnique({
      where: { number: surahNumber },
      select: { nameArabic: true, nameEnglish: true },
    });

    if (!surah) {
      console.warn(`[Direct] Surah ${surahNumber} not found`);
      return [];
    }

    // Fetch ayah(s)
    const ayahNumbers = ayahEnd
      ? Array.from({ length: ayahEnd - ayahNumber + 1 }, (_, i) => ayahNumber + i)
      : [ayahNumber];

    const ayahs = await prisma.ayah.findMany({
      where: {
        surah: { number: surahNumber },
        ayahNumber: { in: ayahNumbers },
      },
      select: {
        ayahNumber: true,
        textUthmani: true,
        juzNumber: true,
        pageNumber: true,
      },
      orderBy: { ayahNumber: 'asc' },
    });

    if (ayahs.length === 0) {
      console.warn(`[Direct] Ayah ${surahNumber}:${ayahNumber} not found`);
      return [];
    }

    // If multiple ayahs, combine into one result
    if (ayahs.length > 1) {
      const combinedText = ayahs.map(a => a.textUthmani).join(' ');
      return [{
        score: 1.0,
        semanticScore: 1.0,
        surahNumber,
        ayahNumber: ayahs[0].ayahNumber,
        ayahEnd: ayahs[ayahs.length - 1].ayahNumber,
        ayahNumbers: ayahs.map(a => a.ayahNumber),
        surahNameArabic: surah.nameArabic,
        surahNameEnglish: surah.nameEnglish,
        text: combinedText,
        juzNumber: ayahs[0].juzNumber,
        pageNumber: ayahs[0].pageNumber,
        quranComUrl: `https://quran.com/${surahNumber}/${ayahNumber}`,
        isChunk: true,
        wordCount: combinedText.split(/\s+/).length,
        semanticRank: 1,
      }];
    }

    // Single ayah
    const ayah = ayahs[0];
    return [{
      score: 1.0,
      semanticScore: 1.0,
      surahNumber,
      ayahNumber: ayah.ayahNumber,
      surahNameArabic: surah.nameArabic,
      surahNameEnglish: surah.nameEnglish,
      text: ayah.textUthmani,
      juzNumber: ayah.juzNumber,
      pageNumber: ayah.pageNumber,
      quranComUrl: `https://quran.com/${surahNumber}/${ayah.ayahNumber}`,
      semanticRank: 1,
    }];
  } catch (err) {
    console.error(`[Direct] Error fetching ayah ${surahNumber}:${ayahNumber}:`, err);
    return [];
  }
}

/**
 * Fetch specific hadiths directly by collection/number reference
 * Used when famous source lookup matches known hadiths
 * Returns with score: 1.0 (perfect match)
 */
async function fetchHadithsDirect(
  references: HadithReference[]
): Promise<HadithRankedResult[]> {
  if (references.length === 0) return [];

  try {
    const results: HadithRankedResult[] = [];

    for (const ref of references) {
      const hadith = await prisma.hadith.findFirst({
        where: {
          hadithNumber: ref.hadithNumber,
          book: {
            collection: { slug: ref.collectionSlug },
          },
        },
        select: {
          hadithNumber: true,
          textArabic: true,
          chapterArabic: true,
          chapterEnglish: true,
          book: {
            select: {
              id: true,
              bookNumber: true,
              nameArabic: true,
              nameEnglish: true,
              collection: {
                select: {
                  slug: true,
                  nameArabic: true,
                  nameEnglish: true,
                },
              },
            },
          },
        },
      });

      if (hadith) {
        results.push({
          score: 1.0,
          semanticScore: 1.0,
          bookId: hadith.book.id,
          collectionSlug: hadith.book.collection.slug,
          collectionNameArabic: hadith.book.collection.nameArabic,
          collectionNameEnglish: hadith.book.collection.nameEnglish,
          bookNumber: hadith.book.bookNumber,
          bookNameArabic: hadith.book.nameArabic,
          bookNameEnglish: hadith.book.nameEnglish,
          hadithNumber: hadith.hadithNumber,
          text: hadith.textArabic,
          chapterArabic: hadith.chapterArabic,
          chapterEnglish: hadith.chapterEnglish,
          sunnahComUrl: generateSunnahComUrl(hadith.book.collection.slug, hadith.hadithNumber, hadith.book.bookNumber),
          semanticRank: 1,
        });
      }
    }

    return results;
  } catch (err) {
    console.error('[Direct] Error fetching hadiths:', err);
    return [];
  }
}

// ============================================================================
// Unified Cross-Type Reranking
// ============================================================================

/**
 * Unified cross-type reranking
 * Takes top candidates from all types and reranks them together
 * This allows the LLM to compare Quran vs Books vs Hadiths for proper ranking
 */
async function rerankUnified(
  query: string,
  ayahs: AyahRankedResult[],
  hadiths: HadithRankedResult[],
  books: RankedResult[],
  bookMetaMap: Map<string, { titleArabic: string; author: { nameArabic: string } }>,
  topN: number,
  reranker: RerankerType
): Promise<{
  ayahs: AyahRankedResult[];
  hadiths: HadithRankedResult[];
  books: RankedResult[];
}> {
  // Only LLM rerankers support cross-type comparison
  if (reranker === "none" || reranker === "jina" || reranker === "qwen4b") {
    return { ayahs, hadiths, books };
  }

  // Combine top candidates from each type
  type UnifiedDoc = { type: 'quran' | 'hadith' | 'book'; index: number; text: string; originalScore: number };
  const unified: UnifiedDoc[] = [];

  // Take top 5 from each type for unified reranking
  const TOP_PER_TYPE = 5;

  ayahs.slice(0, TOP_PER_TYPE).forEach((a, i) => {
    unified.push({ type: 'quran', index: i, text: formatAyahForReranking(a), originalScore: a.score });
  });

  hadiths.slice(0, TOP_PER_TYPE).forEach((h, i) => {
    unified.push({ type: 'hadith', index: i, text: formatHadithForReranking(h), originalScore: h.score });
  });

  books.slice(0, TOP_PER_TYPE).forEach((b, i) => {
    const book = bookMetaMap.get(b.bookId);
    unified.push({
      type: 'book',
      index: i,
      text: formatBookForReranking(b, book?.titleArabic, book?.author.nameArabic),
      originalScore: b.semanticScore || 0,
    });
  });

  // If we have very few documents, just return as-is
  if (unified.length < 3) {
    return { ayahs, hadiths, books };
  }

  try {
    // Build reranking prompt with all document types
    const docsText = unified
      .map((d, i) => `[${i + 1}] ${d.text.slice(0, 600)}`)
      .join("\n\n");

    const prompt = `You are ranking a MIXED set of Arabic/Islamic documents for a search query.
The set contains [QURAN] verses, [HADITH] narrations, and [BOOK] excerpts.

Query: "${query}"

Documents:
${docsText}

RANKING PRIORITY:
1. If the query is looking for a SPECIFIC SOURCE (verse name, hadith name, surah reference):
   - The ACTUAL source should rank HIGHEST (e.g., "آية الكرسي" → the [QURAN] Baqarah 255)
   - Books ABOUT that source rank lower than the source itself

2. If the query is a QUESTION:
   - Documents that directly ANSWER the question rank highest
   - Primary sources (Quran/Hadith) with relevant evidence rank high

3. If the query is a TOPIC search:
   - Primary sources directly about the topic rank highest
   - Scholarly commentary ranks based on relevance

Return ONLY a JSON array of document numbers by relevance: [3, 1, 5, 2, 4]`;

    const model = reranker === "gpt-oss-20b" ? "openai/gpt-oss-20b" :
                  reranker === "gpt-oss-120b" ? "openai/gpt-oss-120b" :
                  "google/gemini-3-flash-preview";

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      }),
    });

    if (!response.ok) {
      console.warn(`[Unified Rerank] API error: ${response.statusText}`);
      return { ayahs, hadiths, books };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";

    // Parse ranking from response
    const match = content.match(/\[[\d,\s]+\]/);
    if (!match) {
      console.warn("[Unified Rerank] Invalid format, keeping original order");
      return { ayahs, hadiths, books };
    }

    const ranking: number[] = JSON.parse(match[0]);

    // Build score map based on unified ranking
    const ayahScores = new Map<number, number>();
    const hadithScores = new Map<number, number>();
    const bookScores = new Map<number, number>();

    ranking.forEach((docNum, rank) => {
      const idx = docNum - 1;
      if (idx >= 0 && idx < unified.length) {
        const doc = unified[idx];
        // Score from 1.0 (rank 1) down to 0.5 (last rank)
        const score = 1.0 - (rank / (ranking.length * 2));

        if (doc.type === 'quran') ayahScores.set(doc.index, score);
        else if (doc.type === 'hadith') hadithScores.set(doc.index, score);
        else bookScores.set(doc.index, score);
      }
    });

    // Update scores and re-sort
    const updatedAyahs = ayahs.map((a, i) => {
      const newScore = ayahScores.get(i);
      return {
        ...a,
        score: newScore !== undefined ? newScore : a.score * 0.5,
      };
    }).sort((a, b) => b.score - a.score);

    const updatedHadiths = hadiths.map((h, i) => {
      const newScore = hadithScores.get(i);
      return {
        ...h,
        score: newScore !== undefined ? newScore : h.score * 0.5,
      };
    }).sort((a, b) => b.score - a.score);

    const updatedBooks = books.map((b, i) => {
      const newScore = bookScores.get(i);
      // Preserve RankedResult properties while updating score
      return {
        ...b,
        semanticScore: newScore !== undefined ? newScore : (b.semanticScore || 0) * 0.5,
      };
    }).sort((a, b) => (b.semanticScore || 0) - (a.semanticScore || 0));

    console.log(`[Unified Rerank] Reranked ${unified.length} documents across types`);
    return { ayahs: updatedAyahs, hadiths: updatedHadiths, books: updatedBooks };

  } catch (err) {
    console.warn("[Unified Rerank] Error, keeping original order:", err);
    return { ayahs, hadiths, books };
  }
}

/**
 * Unified search result for refine reranking
 * Combines all result types into a single list for one reranker API call
 */
interface UnifiedRefineResult {
  type: 'book' | 'ayah' | 'hadith';
  index: number;  // Original index within type array
  content: string;  // Formatted text for reranker
  originalScore: number;
}

/**
 * Unified reranking for refine search - single API call for all types
 *
 * Benefits over separate reranking:
 * - 1 API call instead of 3 (saves ~2s latency)
 * - Cross-type relevance comparison (LLM can rank Quran vs Books vs Hadiths)
 * - Better accuracy for mixed-type queries
 */
async function rerankUnifiedRefine(
  query: string,
  ayahs: AyahRankedResult[],
  hadiths: HadithRankedResult[],
  books: RankedResult[],
  bookMetaMap: Map<string, { titleArabic: string; author: { nameArabic: string } }>,
  limits: { books: number; ayahs: number; hadiths: number },
  reranker: RerankerType
): Promise<{
  books: RankedResult[];
  ayahs: AyahRankedResult[];
  hadiths: HadithRankedResult[];
  timedOut: boolean;
}> {
  // Skip reranking for non-LLM rerankers
  if (reranker === "none" || reranker === "jina" || reranker === "qwen4b") {
    return {
      books: books.slice(0, limits.books),
      ayahs: ayahs.slice(0, limits.ayahs),
      hadiths: hadiths.slice(0, limits.hadiths),
      timedOut: false
    };
  }

  // Build unified list of all candidates with type labels
  const unified: UnifiedRefineResult[] = [];

  // Add books (up to limits.books candidates)
  books.slice(0, limits.books).forEach((b, i) => {
    const book = bookMetaMap.get(b.bookId);
    unified.push({
      type: 'book',
      index: i,
      content: formatBookForReranking(b, book?.titleArabic, book?.author.nameArabic),
      originalScore: b.semanticScore || b.fusedScore || 0
    });
  });

  // Add ayahs (up to limits.ayahs candidates)
  ayahs.slice(0, limits.ayahs).forEach((a, i) => {
    unified.push({
      type: 'ayah',
      index: i,
      content: formatAyahForReranking(a),
      originalScore: a.semanticScore || a.score
    });
  });

  // Add hadiths (up to limits.hadiths candidates)
  hadiths.slice(0, limits.hadiths).forEach((h, i) => {
    unified.push({
      type: 'hadith',
      index: i,
      content: formatHadithForReranking(h),
      originalScore: h.semanticScore || h.score
    });
  });

  // If very few documents, return as-is
  if (unified.length < 3) {
    return {
      books: books.slice(0, limits.books),
      ayahs: ayahs.slice(0, limits.ayahs),
      hadiths: hadiths.slice(0, limits.hadiths),
      timedOut: false
    };
  }

  const TIMEOUT_MS = 25000; // 25 seconds for larger document set

  try {
    // Build reranking prompt with all document types
    const docsText = unified
      .map((d, i) => `[${i + 1}] ${d.content.slice(0, 600)}`)
      .join("\n\n");

    const prompt = `You are ranking a MIXED set of Arabic/Islamic documents for a search query.
The set contains [BOOK] excerpts, [QURAN] verses, and [HADITH] narrations.

Query: "${query}"

Documents:
${docsText}

RANKING PRIORITY:

1. **SPECIFIC SOURCE LOOKUP** (verse name, hadith name, surah reference):
   - The ACTUAL source should rank HIGHEST
   - Example: "آية الكرسي" → [QURAN] Al-Baqarah 255 first
   - Books ABOUT that source rank lower than the source itself

2. **QUESTION** (ما، لماذا، كيف، حكم، what, why, how):
   - Documents that directly ANSWER the question rank highest
   - Primary sources (Quran/Hadith) with relevant evidence rank high
   - Scholarly explanation ranks based on directness of answer

3. **TOPIC SEARCH** (person, concept, ruling):
   - Primary sources directly about the topic rank highest
   - Scholarly commentary with substantial discussion ranks next
   - Brief mentions rank lower

CROSS-LINGUAL: Match English queries to Arabic content and vice versa.

FILTERING: Only include documents that actually address the query topic.
EXCLUDE documents that:
- Have no meaningful connection to the query topic
- Appear in results due to keyword coincidence but address a completely different subject
- Would not help answer or inform the user's query

IMPORTANT: If the query is about a topic completely unrelated to Islamic texts (e.g., sports, celebrities, modern technology, entertainment), return an EMPTY array [] since none of the documents would be relevant.

Return ONLY a JSON array of document numbers by relevance (best first).
If no documents are relevant, return an empty array []:
[3, 1, 5, 2, ...]`;

    const model = reranker === "gpt-oss-20b" ? "openai/gpt-oss-20b" :
                  reranker === "gpt-oss-120b" ? "openai/gpt-oss-120b" :
                  "google/gemini-3-flash-preview";

    const response = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      }),
    }, TIMEOUT_MS);

    if (!response.ok) {
      console.warn(`[Unified Refine Rerank] API error: ${response.statusText}`);
      return {
        books: books.slice(0, limits.books),
        ayahs: ayahs.slice(0, limits.ayahs),
        hadiths: hadiths.slice(0, limits.hadiths),
        timedOut: false
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";

    // Parse ranking from response (also matches empty array [])
    const match = content.match(/\[[\d,\s]*\]/);
    if (!match) {
      console.warn("[Unified Refine Rerank] Invalid format, keeping original order");
      return {
        books: books.slice(0, limits.books),
        ayahs: ayahs.slice(0, limits.ayahs),
        hadiths: hadiths.slice(0, limits.hadiths),
        timedOut: false
      };
    }

    const ranking: number[] = JSON.parse(match[0]);

    // Split reranked results by type
    const rerankedBooks: RankedResult[] = [];
    const rerankedAyahs: AyahRankedResult[] = [];
    const rerankedHadiths: HadithRankedResult[] = [];

    for (const docNum of ranking) {
      const idx = docNum - 1;
      if (idx < 0 || idx >= unified.length) continue;

      const doc = unified[idx];
      const rank = rerankedBooks.length + rerankedAyahs.length + rerankedHadiths.length + 1;

      if (doc.type === 'book' && rerankedBooks.length < limits.books) {
        const book = books[doc.index];
        rerankedBooks.push({ ...book, semanticScore: 1 - (rank / 100) });
      } else if (doc.type === 'ayah' && rerankedAyahs.length < limits.ayahs) {
        const ayah = ayahs[doc.index];
        rerankedAyahs.push({ ...ayah, rank, score: 1 - (rank / 100) });
      } else if (doc.type === 'hadith' && rerankedHadiths.length < limits.hadiths) {
        const hadith = hadiths[doc.index];
        rerankedHadiths.push({ ...hadith, rank, score: 1 - (rank / 100) });
      }
    }

    // LLM-based relevance filtering: only return results the LLM deemed relevant
    // (no longer filling remaining slots with unreranked candidates)

    console.log(`[Unified Refine Rerank] Reranked ${unified.length} docs → ${rerankedBooks.length} books, ${rerankedAyahs.length} ayahs, ${rerankedHadiths.length} hadiths`);
    return { books: rerankedBooks, ayahs: rerankedAyahs, hadiths: rerankedHadiths, timedOut: false };

  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError';
    if (timedOut) {
      console.warn(`[Unified Refine Rerank] Timed out after ${TIMEOUT_MS}ms, using RRF order`);
    } else {
      console.warn("[Unified Refine Rerank] Error, keeping original order:", err);
    }
    return {
      books: books.slice(0, limits.books),
      ayahs: ayahs.slice(0, limits.ayahs),
      hadiths: hadiths.slice(0, limits.hadiths),
      timedOut
    };
  }
}

// ============================================================================
// Refine Search: Query Expansion
// ============================================================================

// Refine search limits are now configurable via URL parameters:
// - refineOriginalWeight, refineExpandedWeight (query weights)
// - refineBookPerQuery, refineAyahPerQuery, refineHadithPerQuery (per-query retrieval limits)
// - refineBookRerank, refineAyahRerank, refineHadithRerank (reranker limits)

/**
 * Expanded query with weight and reason
 */
interface ExpandedQuery {
  query: string;
  weight: number;
  reason: string;
}

/**
 * Map query expansion model config value to OpenRouter model ID
 */
function getQueryExpansionModelId(model: string): string {
  switch (model) {
    case "gpt-oss-120b":
      return "openai/gpt-oss-120b";
    case "gemini-flash":
    default:
      return "google/gemini-3-flash-preview";
  }
}

/**
 * Expand a search query into multiple alternative queries using LLM
 * Returns original query (weight=1.0) plus expanded queries (weight=0.7)
 * Results are cached to avoid redundant LLM calls
 */
async function expandQuery(query: string, model: string = "gemini-flash"): Promise<ExpandedQuery[]> {
  // Check cache first (saves 500-1000ms per repeated query)
  const cached = getCachedExpansion(query);
  if (cached) {
    console.log(`[Refine] Cache hit for query expansion: "${query}"`);
    return cached;
  }

  if (!process.env.OPENROUTER_API_KEY) {
    // Fallback: return just the original query
    return [{ query, weight: 1.0, reason: "Original query" }];
  }

  try {
    const prompt = `You are a search query expansion expert for an Arabic/Islamic text search engine covering Quran, Hadith, and classical Islamic books.

User Query: "${query}"

Your task: Generate 4 alternative search queries that will help find what the user is actually looking for.

EXPANSION STRATEGIES (use the most relevant):

1. **ANSWER-ORIENTED** (if query is a question)
   - Convert questions to statements/topics that would contain the answer
   - "What are the virtues of Shaban?" → "فضائل شعبان" / "ثواب صيام شعبان"
   - "When was the Prophet born?" → "مولد النبي" / "ولادة الرسول"

2. **TOPIC VARIANTS**
   - Arabic equivalents: "fasting" → "صيام" / "صوم"
   - Root variations: "صائم" / "صيام" / "صوم"
   - Related terminology: "Shaban fasting" → "صيام التطوع" / "النوافل"

3. **CONTEXTUAL EXPANSION**
   - What sources would discuss this topic?
   - "ruling on music" → "حكم الغناء" / "المعازف" / "اللهو"
   - "wudu steps" → "فرائض الوضوء" / "أركان الوضوء"

4. **SEMANTIC BRIDGES**
   - English query → Arabic content terms
   - Technical terms → common usage
   - "inheritance law" → "فرائض" / "مواريث" / "تقسيم التركة"

Return ONLY a JSON array of query strings:
["expanded query 1", "expanded query 2", "expanded query 3", "expanded query 4"]

IMPORTANT:
- Prioritize queries that would find ANSWERS, not just mentions
- Include at least one Arabic query if the original is English (and vice versa)
- Keep queries 2-5 words, focused and searchable
- Think: "What text would contain the answer to this?"
- Don't include the original query in your response`;

    const modelId = getQueryExpansionModelId(model);
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.warn(`Query expansion failed: ${response.statusText}`);
      return [{ query, weight: 1.0, reason: "Original query" }];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";

    // Parse the JSON array from response
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) {
      console.warn("Query expansion returned invalid format");
      return [{ query, weight: 1.0, reason: "Original query" }];
    }

    const expanded: string[] = JSON.parse(match[0]);

    // Build result: original (weight=1.0) + expanded (weight=0.7)
    const results: ExpandedQuery[] = [
      { query, weight: 1.0, reason: "Original query" },
    ];

    for (let i = 0; i < Math.min(expanded.length, 4); i++) {
      const expQuery = typeof expanded[i] === 'string' ? expanded[i] : (expanded[i] as any)?.query;
      if (expQuery && expQuery.trim() && expQuery !== query) {
        results.push({
          query: expQuery.trim(),
          weight: 0.7,
          reason: `Expanded query ${i + 1}`,
        });
      }
    }

    console.log(`[Refine] Expanded "${query}" into ${results.length} queries`);
    // Cache the result for future requests
    setCachedExpansion(query, results);
    return results;
  } catch (err) {
    console.warn("Query expansion error:", err);
    return [{ query, weight: 1.0, reason: "Original query" }];
  }
}

/**
 * Wrapper for expandQuery that also returns cache status
 */
async function expandQueryWithCacheInfo(query: string, model: string = "gemini-flash"): Promise<{ queries: ExpandedQuery[]; cached: boolean }> {
  const cached = getCachedExpansion(query);
  if (cached) {
    console.log(`[Refine] Cache hit for query expansion: "${query}"`);
    return { queries: cached, cached: true };
  }
  const queries = await expandQuery(query, model);
  return { queries, cached: false };
}

/**
 * Merge and deduplicate results from multiple queries using weighted RRF
 *
 * For each unique result:
 *   score(doc) = sum(weight[q] / (60 + rank[doc, q]))
 */
function mergeAndDeduplicateBooks(
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
        // Prefer highlighted snippet from keyword search
        if (result.highlightedSnippet && result.highlightedSnippet !== result.textSnippet) {
          existing.highlightedSnippet = result.highlightedSnippet;
        }
        // Preserve semantic score if present (use highest)
        if (result.semanticScore !== undefined && (existing.semanticScore === undefined || result.semanticScore > existing.semanticScore)) {
          existing.semanticScore = result.semanticScore;
        }
        // Preserve keyword scores if present (use highest)
        if (result.keywordScore !== undefined && (existing.keywordScore === undefined || result.keywordScore > existing.keywordScore)) {
          existing.keywordScore = result.keywordScore;
        }
        // Preserve tsRank independently (use highest)
        if (result.tsRank !== undefined && (existing.tsRank === undefined || result.tsRank > existing.tsRank)) {
          existing.tsRank = result.tsRank;
        }
        // Preserve bm25Score independently (use highest)
        if (result.bm25Score !== undefined && (existing.bm25Score === undefined || result.bm25Score > existing.bm25Score)) {
          existing.bm25Score = result.bm25Score;
        }
      } else {
        merged.set(key, { ...result, weightedRrfScore: rrfContribution });
      }
    }
  }

  // Sort by weighted RRF score
  return Array.from(merged.values())
    .sort((a, b) => b.weightedRrfScore - a.weightedRrfScore);
}

function mergeAndDeduplicateAyahs(
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

function mergeAndDeduplicateHadiths(
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

/**
 * Perform semantic search using Qdrant
 * @param precomputedEmbedding - Optional pre-generated embedding to avoid redundant API calls
 * @param collection - Qdrant collection to search (default: QDRANT_COLLECTION)
 * @param embeddingModel - Embedding model to use if generating new embedding
 */
async function semanticSearch(
  query: string,
  limit: number,
  bookId: string | null,
  similarityCutoff: number = 0.25,
  precomputedEmbedding?: number[],
  collection: string = QDRANT_COLLECTION,
  embeddingModel: EmbeddingModel = "gemini"
): Promise<RankedResult[]> {
  // Skip semantic search for quoted phrase queries (user wants exact match)
  if (hasQuotedPhrases(query)) {
    console.log(`Query "${query}" contains quotes, skipping semantic search`);
    return [];
  }

  const normalizedQuery = normalizeArabicText(query);

  // Skip semantic search for very short queries (high noise risk)
  if (normalizedQuery.replace(/\s/g, '').length < MIN_CHARS_FOR_SEMANTIC) {
    console.log(`Query "${query}" too short for semantic search, skipping`);
    return [];
  }

  // Apply dynamic threshold based on query length
  const effectiveCutoff = getDynamicSimilarityThreshold(query, similarityCutoff);

  // Use precomputed embedding if provided, otherwise generate one
  const queryEmbedding = precomputedEmbedding ?? await generateEmbedding(normalizedQuery, embeddingModel);

  // Filter by shamelaBookId (now the primary key)
  const filter = bookId
    ? {
        must: [
          {
            key: "shamelaBookId",
            match: { value: bookId },
          },
        ],
      }
    : undefined;

  const searchResults = await qdrant.search(collection, {
    vector: queryEmbedding,
    limit: limit,
    filter: filter,
    with_payload: {
      include: ["shamelaBookId", "pageNumber", "volumeNumber", "textSnippet"],
    },
    score_threshold: effectiveCutoff,
  });

  return searchResults.map((result, index) => {
    const payload = result.payload as {
      bookId?: number;           // Legacy numeric ID (may exist in old embeddings)
      shamelaBookId: string;     // String ID (primary key)
      pageNumber: number;
      volumeNumber: number;
      textSnippet: string;
    };

    return {
      bookId: payload.shamelaBookId,
      pageNumber: payload.pageNumber,
      volumeNumber: payload.volumeNumber,
      textSnippet: payload.textSnippet,
      highlightedSnippet: payload.textSnippet, // No highlighting for semantic
      semanticRank: index + 1,
      semanticScore: result.score,
    };
  });
}

/**
 * Merge results using weighted score fusion for books
 *
 * Uses normalized score fusion with query-aware weights:
 * - BM25 scores are normalized to 0-1 using sigmoid function
 * - Semantic and BM25 are combined with weights based on query characteristics
 * - Results appearing in both searches get a 10% boost
 * - RRF score is used as tiebreaker
 */
function mergeWithRRF(
  semanticResults: RankedResult[],
  keywordResults: RankedResult[],
  query: string
): (RankedResult & { fusedScore: number })[] {
  // Create a map keyed by (bookId, pageNumber)
  const resultMap = new Map<string, RankedResult & { fusedScore: number }>();

  // Add semantic results
  for (const result of semanticResults) {
    const key = `${result.bookId}-${result.pageNumber}`;
    resultMap.set(key, { ...result, fusedScore: 0 });
  }

  // Merge keyword results
  for (const result of keywordResults) {
    const key = `${result.bookId}-${result.pageNumber}`;
    const existing = resultMap.get(key);

    if (existing) {
      // Merge the results - prefer highlighted snippet from keyword search
      existing.keywordRank = result.keywordRank;
      existing.keywordScore = result.keywordScore;
      existing.highlightedSnippet = result.highlightedSnippet;
      existing.tsRank = result.tsRank;
      existing.bm25Score = result.bm25Score;
    } else {
      resultMap.set(key, { ...result, fusedScore: 0 });
    }
  }

  // Calculate fused scores and RRF scores using weighted combination approach
  const merged = Array.from(resultMap.values()).map((result) => {
    const hasSemantic = result.semanticRank !== undefined;
    const hasKeyword = result.keywordRank !== undefined;
    const semanticScore = result.semanticScore ?? 0;

    let fusedScore: number;

    if (hasSemantic && hasKeyword) {
      // Both signals: weighted combination (max 1.1 = 0.8 + 0.3)
      // Use RAW bm25Score (typically 8-13 range), not the already-normalized keywordScore
      const rawBM25 = result.bm25Score ?? 0;
      const normalizedBM25 = normalizeBM25Score(rawBM25);
      fusedScore = SEMANTIC_WEIGHT * semanticScore + KEYWORD_WEIGHT * normalizedBM25;
    } else if (hasSemantic) {
      // Semantic only: full semantic score
      fusedScore = semanticScore;
    } else {
      // Keyword only: full normalized BM25 score
      const rawBM25 = result.bm25Score ?? result.keywordScore ?? 0;
      fusedScore = normalizeBM25Score(rawBM25);
    }

    const rrfScore = calculateRRFScore([result.semanticRank, result.keywordRank]);

    return { ...result, fusedScore, rrfScore };
  });

  // Sort by fused score (primary), RRF as tiebreaker
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
function getMatchType(
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
 * Search for authors using semantic search (Qdrant) with keyword fallback
 */
async function searchAuthors(query: string, limit: number = 5): Promise<AuthorResult[]> {
  // Try semantic search first
  try {
    const normalizedQuery = normalizeArabicText(query);
    const queryEmbedding = await generateEmbedding(normalizedQuery);

    const searchResults = await qdrant.search(QDRANT_AUTHORS_COLLECTION, {
      vector: queryEmbedding,
      limit: limit,
      with_payload: {
        include: ["authorId", "nameArabic", "nameLatin", "deathDateHijri", "deathDateGregorian", "booksCount"],
      },
      score_threshold: 0.3, // Only return reasonably similar authors
    });

    if (searchResults.length > 0) {
      return searchResults.map((result) => {
        const payload = result.payload as {
          authorId: string;  // shamela_author_id is now the primary key
          nameArabic: string;
          nameLatin: string;
          deathDateHijri: string | null;
          deathDateGregorian: string | null;
          booksCount: number;
        };

        return {
          id: payload.authorId,
          nameArabic: payload.nameArabic,
          nameLatin: payload.nameLatin,
          deathDateHijri: payload.deathDateHijri,
          deathDateGregorian: payload.deathDateGregorian,
          booksCount: payload.booksCount,
        };
      });
    }
  } catch (err) {
    console.warn("Semantic author search failed, falling back to keyword:", err);
  }

  // Fallback to keyword search if semantic search fails or returns no results
  const authors = await prisma.author.findMany({
    where: {
      OR: [
        { nameArabic: { contains: query, mode: "insensitive" } },
        { nameLatin: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      nameArabic: true,
      nameLatin: true,
      deathDateHijri: true,
      deathDateGregorian: true,
      _count: {
        select: { books: true },
      },
    },
    take: limit,
    orderBy: {
      books: { _count: "desc" },
    },
  });

  return authors.map((author) => ({
    id: author.id,
    nameArabic: author.nameArabic,
    nameLatin: author.nameLatin,
    deathDateHijri: author.deathDateHijri,
    deathDateGregorian: author.deathDateGregorian,
    booksCount: author._count.books,
  }));
}

/**
 * Search for Quran ayahs using semantic search (returns ranked results with metadata)
 * Uses tafsir-enriched embeddings by default for better retrieval of short ayahs.
 * Falls back to original collection if enriched collection is unavailable.
 * @param precomputedEmbedding - Optional pre-generated embedding to avoid redundant API calls
 * @param useEnriched - Whether to use tafsir-enriched embeddings (default: true)
 * @returns Results array and metadata about which collection was used
 */
async function searchAyahsSemantic(
  query: string,
  limit: number = 10,
  similarityCutoff: number = 0.28,
  precomputedEmbedding?: number[],
  useEnriched: boolean = true,
  quranCollectionOverride?: string,
  embeddingModel: EmbeddingModel = "gemini"
): Promise<AyahSemanticSearchResult> {
  // Determine collection based on override or enriched flag
  const baseCollection = quranCollectionOverride || (useEnriched ? QDRANT_QURAN_ENRICHED_COLLECTION : QDRANT_QURAN_COLLECTION);
  const fallbackCollection = QDRANT_QURAN_COLLECTION;

  // Default metadata for early returns
  const defaultMeta: AyahSearchMeta = {
    collection: baseCollection,
    usedFallback: false,
    embeddingTechnique: useEnriched && !quranCollectionOverride ? "metadata-translation" : undefined,
  };

  try {
    // Skip semantic search for quoted phrase queries (user wants exact match)
    if (hasQuotedPhrases(query)) {
      console.log(`Query "${query}" contains quotes, skipping ayah semantic search`);
      return { results: [], meta: defaultMeta };
    }

    const normalizedQuery = normalizeArabicText(query);

    // Skip semantic search for very short queries (high noise risk)
    if (normalizedQuery.replace(/\s/g, '').length < MIN_CHARS_FOR_SEMANTIC) {
      console.log(`Query "${query}" too short for ayah semantic search, skipping`);
      return { results: [], meta: defaultMeta };
    }

    // Apply dynamic threshold based on query length
    const effectiveCutoff = getDynamicSimilarityThreshold(query, similarityCutoff);

    // Use precomputed embedding if provided, otherwise generate one
    const queryEmbedding = precomputedEmbedding ?? await generateEmbedding(normalizedQuery, embeddingModel);

    // Try the specified collection first
    let collection = baseCollection;
    let usedFallback = false;
    let searchResults;

    try {
      console.log(`[searchAyahsSemantic] Searching ${collection} for: "${query.substring(0, 50)}..."`);
      console.log(`[searchAyahsSemantic] effectiveCutoff=${effectiveCutoff}, limit=${limit}`);

      searchResults = await qdrant.search(collection, {
        vector: queryEmbedding,
        limit: limit,
        with_payload: true,  // Ayahs need full payload for various fields
        score_threshold: effectiveCutoff,
      });

      // Fall back to original collection if enriched returns no results (only if not using BGE override)
      if (useEnriched && !quranCollectionOverride && searchResults.length === 0) {
        console.log(`[searchAyahsSemantic] Enriched collection empty, falling back to original`);
        collection = fallbackCollection;
        usedFallback = true;
        searchResults = await qdrant.search(collection, {
          vector: queryEmbedding,
          limit: limit,
          with_payload: true,
          score_threshold: effectiveCutoff,
        });
      }
    } catch (enrichedErr) {
      // If enriched collection doesn't exist, fall back to original (only if not using BGE override)
      if (useEnriched && !quranCollectionOverride) {
        console.log(`[searchAyahsSemantic] Enriched collection unavailable, using original`);
        collection = fallbackCollection;
        usedFallback = true;
        searchResults = await qdrant.search(collection, {
          vector: queryEmbedding,
          limit: limit,
          with_payload: true,
          score_threshold: effectiveCutoff,
        });
      } else {
        throw enrichedErr;
      }
    }

    console.log(`[searchAyahsSemantic] ${collection} returned ${searchResults.length} results`);

    const meta: AyahSearchMeta = {
      collection,
      usedFallback,
      embeddingTechnique: collection === QDRANT_QURAN_ENRICHED_COLLECTION ? "metadata-translation" : undefined,
    };

    const results = searchResults.map((result, index) => {
      const payload = result.payload as {
        surahNumber: number;
        ayahNumber: number;
        surahNameArabic: string;
        surahNameEnglish: string;
        text: string;
        textPlain: string;
        juzNumber: number;
        pageNumber: number;
        embeddingTechnique?: string; // Present in enriched collection
      };

      return {
        score: result.score,
        semanticScore: result.score,
        surahNumber: payload.surahNumber,
        ayahNumber: payload.ayahNumber,
        surahNameArabic: payload.surahNameArabic,
        surahNameEnglish: payload.surahNameEnglish,
        text: payload.text,
        juzNumber: payload.juzNumber,
        pageNumber: payload.pageNumber,
        quranComUrl: `https://quran.com/${payload.surahNumber}?startingVerse=${payload.ayahNumber}`,
        semanticRank: index + 1,
      };
    });

    return { results, meta };
  } catch (err) {
    console.error("[searchAyahsSemantic] ERROR:", err);
    return { results: [], meta: { collection: QDRANT_QURAN_COLLECTION, usedFallback: true } };
  }
}

/**
 * Hybrid search for Quran ayahs using RRF fusion + reranking
 * @param options.precomputedEmbedding - Optional pre-generated embedding to avoid redundant API calls
 * @param options.quranCollection - Collection to search for ayahs
 * @param options.embeddingModel - Embedding model to use
 */
async function searchAyahsHybrid(
  query: string,
  limit: number = 10,
  options: { reranker?: RerankerType; preRerankLimit?: number; postRerankLimit?: number; similarityCutoff?: number; fuzzyFallback?: boolean; fuzzyThreshold?: number; precomputedEmbedding?: number[]; quranCollection?: string; embeddingModel?: EmbeddingModel } = {}
): Promise<AyahResult[]> {
  const { reranker = "none", preRerankLimit = 60, postRerankLimit = limit, similarityCutoff = 0.6, fuzzyFallback = true, fuzzyThreshold = 0.3, precomputedEmbedding, quranCollection, embeddingModel = "gemini" } = options;

  // Fetch more candidates for reranking
  const fetchLimit = Math.min(preRerankLimit, 100);

  const collectionToUse = quranCollection || QDRANT_QURAN_ENRICHED_COLLECTION;
  const defaultMeta: AyahSearchMeta = { collection: collectionToUse, usedFallback: false, embeddingTechnique: "metadata-translation" };
  const [semanticSearchResult, keywordResults] = await Promise.all([
    searchAyahsSemantic(query, fetchLimit, similarityCutoff, precomputedEmbedding, true, quranCollection, embeddingModel).catch(() => ({ results: [] as AyahRankedResult[], meta: defaultMeta })),
    keywordSearchAyahsES(query, fetchLimit, { fuzzyFallback, fuzzyThreshold }).catch(() => []),
  ]);

  const merged = mergeWithRRFGeneric(
    semanticSearchResult.results,
    keywordResults,
    (a) => `${a.surahNumber}-${a.ayahNumber}`,
    query
  );

  // Take top candidates for reranking
  const candidates = merged.slice(0, Math.min(preRerankLimit, 60));

  // Rerank with the specified reranker (using metadata-enriched formatter)
  const finalLimit = Math.min(postRerankLimit, limit);
  const { results: finalResults } = await rerank(
    query,
    candidates,
    (a) => formatAyahForReranking(a),
    finalLimit,
    reranker
  );

  // Return results with position (rank after reranking)
  // Use fusedScore as primary score for ranking (semantic + confirmation bonus)
  return finalResults.map((result, index) => {
    const r = result as typeof result & { fusedScore?: number; semanticScore?: number };
    return {
      ...result,
      score: r.fusedScore ?? r.semanticScore ?? result.rrfScore,
      fusedScore: r.fusedScore,
      semanticScore: r.semanticScore,
      rank: index + 1, // Position after reranking (1-indexed)
    };
  }) as AyahResult[];
}

/**
 * Search for Hadiths using semantic search (returns ranked results)
 * @param precomputedEmbedding - Optional pre-generated embedding to avoid redundant API calls
 * @param hadithCollectionOverride - Collection to search (default: QDRANT_HADITH_COLLECTION)
 * @param embeddingModel - Embedding model to use if generating new embedding
 */
async function searchHadithsSemantic(
  query: string,
  limit: number = 10,
  similarityCutoff: number = 0.25,
  precomputedEmbedding?: number[],
  hadithCollectionOverride?: string,
  embeddingModel: EmbeddingModel = "gemini"
): Promise<HadithRankedResult[]> {
  const _t0 = Date.now();
  try {
    // Skip semantic search for quoted phrase queries (user wants exact match)
    if (hasQuotedPhrases(query)) {
      console.log(`Query "${query}" contains quotes, skipping hadith semantic search`);
      return [];
    }

    const normalizedQuery = normalizeArabicText(query);

    // Skip semantic search for very short queries (high noise risk)
    if (normalizedQuery.replace(/\s/g, '').length < MIN_CHARS_FOR_SEMANTIC) {
      console.log(`Query "${query}" too short for hadith semantic search, skipping`);
      return [];
    }

    // Apply dynamic threshold based on query length
    const effectiveCutoff = getDynamicSimilarityThreshold(query, similarityCutoff);

    // Use precomputed embedding if provided, otherwise generate one
    const _tEmb = Date.now();
    const queryEmbedding = precomputedEmbedding ?? await generateEmbedding(normalizedQuery, embeddingModel);
    const _tEmbEnd = Date.now();
    if (!precomputedEmbedding) console.log(`[HadithSemantic] embedding generated: ${_tEmbEnd - _tEmb}ms`);

    const hadithCollection = hadithCollectionOverride || QDRANT_HADITH_COLLECTION;
    const _tQdrant = Date.now();
    const searchResults = await qdrant.search(hadithCollection, {
      vector: queryEmbedding,
      limit: limit,
      with_payload: true,  // Hadith needs full payload for various fields
      score_threshold: effectiveCutoff,
      filter: {
        must_not: [{ key: "isChainVariation", match: { value: true } }],
      },
    });
    console.log(`[HadithSemantic] qdrant search: ${Date.now() - _tQdrant}ms (${searchResults.length} results)`);

    if (searchResults.length === 0) {
      return [];
    }

    // Extract payloads and check which need bookId lookup
    const payloads = searchResults.map((result) => result.payload as {
      collectionSlug: string;
      collectionNameArabic: string;
      collectionNameEnglish: string;
      bookNumber: number;
      bookNameArabic: string;
      bookNameEnglish: string;
      hadithNumber: string;
      text: string;
      textPlain: string;
      chapterArabic: string | null;
      chapterEnglish: string | null;
      sunnahComUrl: string;
      bookId?: number;
    });

    // Build bookId lookup map for payloads missing bookId
    const bookIdMap = new Map<string, number>();
    const missingBookIds = payloads.filter((p) => !p.bookId);

    if (missingBookIds.length > 0) {
      // Get unique (collectionSlug, bookNumber) pairs
      const uniqueKeys = new Set(missingBookIds.map((p) => `${p.collectionSlug}|${p.bookNumber}`));
      const lookupPairs = Array.from(uniqueKeys).map((key) => {
        const [slug, num] = key.split("|");
        return { slug, bookNumber: parseInt(num, 10) };
      });

      // Batch lookup bookIds from database
      const books = await prisma.hadithBook.findMany({
        where: {
          OR: lookupPairs.map((p) => ({
            collection: { slug: p.slug },
            bookNumber: p.bookNumber,
          })),
        },
        select: {
          id: true,
          bookNumber: true,
          collection: { select: { slug: true } },
        },
      });

      for (const book of books) {
        bookIdMap.set(`${book.collection.slug}|${book.bookNumber}`, book.id);
      }
    }

    const mapped = searchResults.map((result, index) => {
      const payload = payloads[index];
      const bookId = payload.bookId || bookIdMap.get(`${payload.collectionSlug}|${payload.bookNumber}`) || 0;

      return {
        score: result.score,
        semanticScore: result.score,
        bookId,
        collectionSlug: payload.collectionSlug,
        collectionNameArabic: payload.collectionNameArabic,
        collectionNameEnglish: payload.collectionNameEnglish,
        bookNumber: payload.bookNumber,
        bookNameArabic: payload.bookNameArabic,
        bookNameEnglish: payload.bookNameEnglish,
        hadithNumber: payload.hadithNumber,
        text: payload.text,
        chapterArabic: payload.chapterArabic,
        chapterEnglish: payload.chapterEnglish,
        sunnahComUrl: payload.sunnahComUrl.replace(/(\d)[A-Z]+$/, '$1'),
        semanticRank: index + 1,
      };
    });
    console.log(`[HadithSemantic] total: ${Date.now() - _t0}ms`);
    return mapped;
  } catch (err) {
    console.warn("Hadith semantic search failed:", err);
    return [];
  }
}

/**
 * Hybrid search for Hadiths using RRF fusion + reranking
 * @param options.precomputedEmbedding - Optional pre-generated embedding to avoid redundant API calls
 * @param options.hadithCollection - Collection to search for hadiths
 * @param options.embeddingModel - Embedding model to use
 */
async function searchHadithsHybrid(
  query: string,
  limit: number = 10,
  options: { reranker?: RerankerType; preRerankLimit?: number; postRerankLimit?: number; similarityCutoff?: number; fuzzyFallback?: boolean; fuzzyThreshold?: number; precomputedEmbedding?: number[]; hadithCollection?: string; embeddingModel?: EmbeddingModel } = {}
): Promise<HadithResult[]> {
  const { reranker = "none", preRerankLimit = 60, postRerankLimit = limit, similarityCutoff = 0.6, fuzzyFallback = true, fuzzyThreshold = 0.3, precomputedEmbedding, hadithCollection, embeddingModel = "gemini" } = options;

  // Fetch more candidates for reranking
  const fetchLimit = Math.min(preRerankLimit, 100);

  // Time each component
  const _t0 = Date.now();
  const [semanticResults, keywordResults] = await Promise.all([
    searchHadithsSemantic(query, fetchLimit, similarityCutoff, precomputedEmbedding, hadithCollection, embeddingModel).catch(() => []),
    keywordSearchHadithsES(query, fetchLimit, { fuzzyFallback, fuzzyThreshold }).catch(() => []),
  ]);
  const _t1 = Date.now();
  console.log(`[HadithHybrid] semantic+keyword parallel: ${_t1 - _t0}ms (sem=${semanticResults.length}, kw=${keywordResults.length})`);

  const merged = mergeWithRRFGeneric(
    semanticResults,
    keywordResults,
    (h) => `${h.collectionSlug}-${h.hadithNumber}`,
    query
  );

  // Take top candidates for reranking (reranking is expensive, limit candidates)
  const candidates = merged.slice(0, Math.min(preRerankLimit, 75));

  // Rerank with the specified reranker (using metadata-enriched formatter)
  const finalLimit = Math.min(postRerankLimit, limit);
  const { results: finalResults } = await rerank(
    query,
    candidates,
    (h) => formatHadithForReranking(h),
    finalLimit,
    reranker
  );

  // Return results with position (rank after reranking)
  // Use fusedScore as primary score for ranking (semantic + confirmation bonus)
  return finalResults.map((result, index) => {
    const r = result as typeof result & { fusedScore?: number; semanticScore?: number };
    return {
      ...result,
      score: r.fusedScore ?? r.semanticScore ?? result.rrfScore,
      fusedScore: r.fusedScore,
      semanticScore: r.semanticScore,
      rank: index + 1, // Position after reranking (1-indexed)
    };
  });
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");
  const limitParam = searchParams.get("limit");
  const bookIdParam = searchParams.get("bookId");
  const modeParam = searchParams.get("mode") as SearchMode | null;

  // New configuration parameters
  const includeQuran = searchParams.get("includeQuran") !== "false";
  const includeHadith = searchParams.get("includeHadith") !== "false";
  const includeBooks = searchParams.get("includeBooks") !== "false";
  const rerankerParam = searchParams.get("reranker") as RerankerType | null;
  const reranker: RerankerType = rerankerParam && ["gpt-oss-20b", "gpt-oss-120b", "gemini-flash", "none"].includes(rerankerParam)
    ? rerankerParam
    : "none"; // No reranking by default - RRF fusion is sufficient
  const similarityCutoff = parseFloat(searchParams.get("similarityCutoff") || "0.6");
  const refineSimilarityCutoff = parseFloat(searchParams.get("refineSimilarityCutoff") || "0.25");
  const preRerankLimit = Math.min(Math.max(parseInt(searchParams.get("preRerankLimit") || "50", 10), 20), 200);
  const postRerankLimit = Math.min(Math.max(parseInt(searchParams.get("postRerankLimit") || "10", 10), 5), 50);

  // Fuzzy search parameters
  const fuzzyEnabled = searchParams.get("fuzzy") !== "false"; // Default true
  const fuzzyThreshold = parseFloat(searchParams.get("fuzzyThreshold") || "0.3");

  // Quran translation parameter (language code like "en", "ur", "fr", or "none")
  const quranTranslation = searchParams.get("quranTranslation") || "none";

  // Hadith translation parameter ("en" or "none")
  const hadithTranslation = searchParams.get("hadithTranslation") || "none";

  // Book title translation parameter (language code like "en", "fr", or "none"/"transliteration")
  const bookTitleLang = searchParams.get("bookTitleLang");

  // Book content translation parameter (language code like "en", "fr", or "none")
  // This fetches cached translations from page_translations table
  const bookContentTranslation = searchParams.get("bookContentTranslation") || "none";

  // Refine search parameter - enables query expansion and multi-query retrieval
  const refine = searchParams.get("refine") === "true";

  // Refine search configurable parameters
  const refineOriginalWeight = Math.min(Math.max(parseFloat(searchParams.get("refineOriginalWeight") || "1.0"), 0.5), 1.0);
  const refineExpandedWeight = Math.min(Math.max(parseFloat(searchParams.get("refineExpandedWeight") || "0.7"), 0.3), 1.0);
  const refineBookPerQuery = Math.min(Math.max(parseInt(searchParams.get("refineBookPerQuery") || "30", 10), 10), 60);
  const refineAyahPerQuery = Math.min(Math.max(parseInt(searchParams.get("refineAyahPerQuery") || "30", 10), 10), 60);
  const refineHadithPerQuery = Math.min(Math.max(parseInt(searchParams.get("refineHadithPerQuery") || "30", 10), 10), 60);
  const refineBookRerank = Math.min(Math.max(parseInt(searchParams.get("refineBookRerank") || "20", 10), 5), 40);
  const refineAyahRerank = Math.min(Math.max(parseInt(searchParams.get("refineAyahRerank") || "12", 10), 5), 25);
  const refineHadithRerank = Math.min(Math.max(parseInt(searchParams.get("refineHadithRerank") || "15", 10), 5), 25);
  const queryExpansionModel = searchParams.get("queryExpansionModel") || "gemini-flash";

  // Embedding model selection
  const embeddingModelParam = searchParams.get("embeddingModel") as EmbeddingModel | null;
  const embeddingModel: EmbeddingModel = embeddingModelParam === "bge-m3" ? "bge-m3" : "gemini";

  // Get collections based on embedding model
  const pageCollection = embeddingModel === "bge-m3" ? QDRANT_COLLECTION_BGE : QDRANT_COLLECTION;
  const quranCollection = embeddingModel === "bge-m3" ? QDRANT_QURAN_ENRICHED_COLLECTION_BGE : QDRANT_QURAN_ENRICHED_COLLECTION;
  const hadithCollection = embeddingModel === "bge-m3" ? QDRANT_HADITH_COLLECTION_BGE : QDRANT_HADITH_COLLECTION;
  const embeddingDimensions = embeddingModel === "bge-m3" ? BGE_DIMENSIONS : GEMINI_DIMENSIONS;

  // Validate query
  if (!query || query.trim().length === 0) {
    return NextResponse.json(
      { error: "Query parameter 'q' is required" },
      { status: 400 }
    );
  }

  // Parse parameters
  const limit = Math.min(Math.max(parseInt(limitParam || "20", 10), 1), 100);
  const bookId = bookIdParam || null;  // String book ID (shamelaBookId)
  const mode: SearchMode = modeParam || "hybrid";

  // Validate mode
  if (!["hybrid", "semantic", "keyword"].includes(mode)) {
    return NextResponse.json(
      { error: "Invalid mode. Must be 'hybrid', 'semantic', or 'keyword'" },
      { status: 400 }
    );
  }

  // Search config options for reranking
  const searchOptions = { reranker, preRerankLimit, postRerankLimit, similarityCutoff };

  // Fuzzy search options
  const fuzzyOptions = { fuzzyFallback: fuzzyEnabled, fuzzyThreshold };

  try {
    let rankedResults: RankedResult[];
    let expandedQueries: { query: string; reason: string }[] = [];
    let ayahsRaw: AyahResult[] = [];
    let hadiths: HadithResult[] = [];

    // Track Quran collection metadata for debug stats
    let ayahSearchMeta: AyahSearchMeta = {
      collection: QDRANT_QURAN_ENRICHED_COLLECTION,
      usedFallback: false,
      embeddingTechnique: "metadata-translation",
    };

    // Track stats for debug panel
    let refineQueryStats: ExpandedQueryStats[] = [];
    let totalAboveCutoff = 0;
    let rerankerTimedOut = false; // Track if reranker timed out for user notification

    // Refine-specific timing and stats
    const _refineTiming = {
      queryExpansion: 0,
      parallelSearches: 0,
      merge: 0,
      rerank: 0,
    };
    let _refineCandidates = {
      totalBeforeMerge: 0,
      afterMerge: { books: 0, ayahs: 0, hadiths: 0 },
      sentToReranker: 0,
    };
    let _refineQueryExpansionCached = false;

    // Track timing for performance debugging
    const _timing = {
      start: Date.now(),
      embedding: 0,
      semantic: { books: 0, ayahs: 0, hadiths: 0 },
      keyword: { books: 0, ayahs: 0, hadiths: 0 },
      merge: 0,
      directLookup: 0,
      authorSearch: 0,
      rerank: 0,
      translations: 0,
      bookMetadata: 0,
    };

    // Request-scoped cache for book metadata to avoid redundant fetches
    const bookMetadataCache = new Map<string, { id: string; titleArabic: string; author: { nameArabic: string } }>();

    /**
     * Get book metadata from cache or fetch from DB
     * Used for reranking - only fetches basic fields (id, titleArabic, author.nameArabic)
     */
    async function getBookMetadataForReranking(
      bookIds: string[]
    ): Promise<Map<string, { id: string; titleArabic: string; author: { nameArabic: string } }>> {
      // Check which IDs are not in cache
      const uncachedIds = bookIds.filter(id => !bookMetadataCache.has(id));

      // Fetch uncached books from DB
      if (uncachedIds.length > 0) {
        const fetchedBooks = await prisma.book.findMany({
          where: { id: { in: uncachedIds } },
          select: {
            id: true,
            titleArabic: true,
            author: { select: { nameArabic: true } },
          },
        });

        // Add to cache
        for (const book of fetchedBooks) {
          bookMetadataCache.set(book.id, book);
        }
      }

      // Return map of requested IDs
      const result = new Map<string, { id: string; titleArabic: string; author: { nameArabic: string } }>();
      for (const id of bookIds) {
        const book = bookMetadataCache.get(id);
        if (book) {
          result.set(id, book);
        }
      }
      return result;
    }

    // Fetch database stats (cached)
    const databaseStats = await getDatabaseStats();

    // ========================================================================
    // FAMOUS SOURCE DIRECT LOOKUP
    // ========================================================================
    // Look up famous verses/hadiths/surahs directly (runs in parallel with search)
    const famousVerse = includeQuran ? lookupFamousVerse(query) : undefined;
    const famousHadiths = includeHadith ? lookupFamousHadith(query) : [];
    // Always look up surah - user might want the full surah page link
    const famousSurah = includeQuran ? lookupSurah(query) : undefined;

    // Direct lookup promises (will be awaited later)
    const directAyahsPromise = famousVerse
      ? fetchAyahDirect(famousVerse.surahNumber, famousVerse.ayahNumber, famousVerse.ayahEnd)
      : Promise.resolve([]);
    const directHadithsPromise = famousHadiths.length > 0
      ? fetchHadithsDirect(famousHadiths)
      : Promise.resolve([]);
    // Fetch full surah ayahs if surah matched but no specific verse (avoids duplicate fetch)
    const directSurahAyahsPromise = (famousSurah && !famousVerse)
      ? fetchAyahDirect(famousSurah.surahNumber, 1, famousSurah.totalAyahs)
      : Promise.resolve([]);

    if (famousVerse) {
      console.log(`[Direct] Famous verse match: ${famousVerse.surahNumber}:${famousVerse.ayahNumber}${famousVerse.ayahEnd ? `-${famousVerse.ayahEnd}` : ''}`);
    }
    if (famousSurah) {
      console.log(`[Direct] Surah match: ${famousSurah.surahNumber} -> ${famousSurah.quranComUrl}`);
    }
    if (famousHadiths.length > 0) {
      console.log(`[Direct] Famous hadith match: ${famousHadiths.map(h => `${h.collectionSlug}:${h.hadithNumber}`).join(', ')}`);
    }

    // Search for authors (independent of refine mode)
    const authorsPromise = bookId ? Promise.resolve([]) : searchAuthors(query, 5);
    const hybridOptions = { ...searchOptions, ...fuzzyOptions };
    // Refine searches use a separate (typically lower) similarity threshold
    const refineSearchOptions = { ...searchOptions, similarityCutoff: refineSimilarityCutoff };
    const refineHybridOptions = { ...refineSearchOptions, ...fuzzyOptions };

    // Determine search strategy based on query language
    // Non-Arabic queries skip keyword search since database content is Arabic
    const searchStrategy = getSearchStrategy(query);
    const shouldSkipKeyword = searchStrategy === 'semantic_only' || mode === "semantic";

    if (searchStrategy === 'semantic_only') {
      console.log(`[Search] Non-Arabic query detected, using semantic-only search`);
    }

    // ========================================================================
    // REFINE SEARCH: Query expansion + multi-query retrieval + merge
    // ========================================================================
    if (refine && mode === "hybrid" && !bookId) {
      console.log(`[Refine] Starting refine search for: "${query}" (weights: original=${refineOriginalWeight}, expanded=${refineExpandedWeight})`);
      const _refineStart = Date.now();

      // Step 1: Expand the query (with timing)
      const _expansionStart = Date.now();
      const { queries: expandedRaw, cached: expansionCached } = await expandQueryWithCacheInfo(query, queryExpansionModel);
      _refineTiming.queryExpansion = Date.now() - _expansionStart;
      _refineQueryExpansionCached = expansionCached;

      // Apply user-configured weights to the expanded queries
      const expanded = expandedRaw.map((exp, idx) => ({
        ...exp,
        weight: idx === 0 ? refineOriginalWeight : refineExpandedWeight,
      }));
      expandedQueries = expanded.map(e => ({ query: e.query, reason: e.reason }));

      // Step 2: Execute parallel searches for all expanded queries
      const _searchesStart = Date.now();

      // For each query, search books, ayahs, and hadiths in parallel
      // Generate ONE embedding per expanded query and share across all searches
      // Track per-query timing
      const perQueryTimings: number[] = [];

      const querySearches = expanded.map(async (exp, queryIndex) => {
        const _queryStart = Date.now();
        const q = exp.query;
        const weight = exp.weight;

        // Pre-generate embedding ONCE for this expanded query (saves 200-400ms per query)
        const normalizedQ = normalizeArabicText(q);
        const shouldSkipSemantic = normalizedQ.replace(/\s/g, '').length < MIN_CHARS_FOR_SEMANTIC || hasQuotedPhrases(q);
        const qEmbedding = shouldSkipSemantic ? undefined : await generateEmbedding(normalizedQ, embeddingModel);

        // Run semantic + keyword for books (using configurable per-query limit)
        // Skip keyword search for non-Arabic queries (database content is Arabic)
        const [bookSemantic, bookKeyword] = await Promise.all([
          semanticSearch(q, refineBookPerQuery, null, refineSimilarityCutoff, qEmbedding, pageCollection, embeddingModel).catch(() => []),
          shouldSkipKeyword
            ? Promise.resolve([] as RankedResult[])
            : keywordSearchES(q, refineBookPerQuery, null, fuzzyOptions).catch(() => []),
        ]);

        const mergedBooks = mergeWithRRF(bookSemantic, bookKeyword, q);

        // Run hybrid or semantic-only for ayahs and hadiths (if enabled)
        // Skip keyword search for non-Arabic queries
        let ayahResults: AyahRankedResult[] = [];
        let hadithResults: HadithRankedResult[] = [];

        if (shouldSkipKeyword) {
          // Semantic-only search for non-Arabic queries
          const defaultMeta: AyahSearchMeta = { collection: quranCollection, usedFallback: false, embeddingTechnique: "metadata-translation" };
          ayahResults = includeQuran
            ? (await searchAyahsSemantic(q, refineAyahPerQuery, refineSimilarityCutoff, qEmbedding, true, quranCollection, embeddingModel).catch(() => ({ results: [], meta: defaultMeta }))).results
            : [];
          hadithResults = includeHadith
            ? await searchHadithsSemantic(q, refineHadithPerQuery, refineSimilarityCutoff, qEmbedding, hadithCollection, embeddingModel).catch(() => [])
            : [];
        } else {
          // Hybrid search for Arabic queries
          const refineHybridOptionsWithEmbedding = {
            ...refineHybridOptions,
            reranker: "none" as RerankerType,
            precomputedEmbedding: qEmbedding,
            quranCollection,
            hadithCollection,
            embeddingModel,
          };
          ayahResults = includeQuran
            ? await searchAyahsHybrid(q, refineAyahPerQuery, refineHybridOptionsWithEmbedding).catch(() => [])
            : [];
          hadithResults = includeHadith
            ? await searchHadithsHybrid(q, refineHadithPerQuery, refineHybridOptionsWithEmbedding).catch(() => [])
            : [];
        }

        perQueryTimings[queryIndex] = Date.now() - _queryStart;

        return {
          books: { results: mergedBooks, weight },
          ayahs: { results: ayahResults as AyahRankedResult[], weight },
          hadiths: { results: hadithResults as HadithRankedResult[], weight },
        };
      });

      const allResults = await Promise.all(querySearches);
      _refineTiming.parallelSearches = Date.now() - _searchesStart;

      // Track per-query document counts for debug stats (with per-type breakdown)
      refineQueryStats = expanded.map((exp, idx) => ({
        query: exp.query,
        weight: exp.weight,
        docsRetrieved: allResults[idx].books.results.length +
                       allResults[idx].ayahs.results.length +
                       allResults[idx].hadiths.results.length,
        books: allResults[idx].books.results.length,
        ayahs: allResults[idx].ayahs.results.length,
        hadiths: allResults[idx].hadiths.results.length,
        searchTimeMs: perQueryTimings[idx],
      }));

      // Calculate total candidates before merge
      _refineCandidates.totalBeforeMerge = refineQueryStats.reduce((sum, q) => sum + q.docsRetrieved, 0);

      // Step 3: Merge and deduplicate results from all queries (with timing)
      const _mergeStart = Date.now();
      const allBooks = allResults.map(r => r.books);
      const allAyahs = allResults.map(r => r.ayahs);
      const allHadiths = allResults.map(r => r.hadiths);

      const mergedBooks = includeBooks ? mergeAndDeduplicateBooks(allBooks) : [];
      const mergedAyahs = includeQuran ? mergeAndDeduplicateAyahs(allAyahs) : [];
      const mergedHadiths = includeHadith ? mergeAndDeduplicateHadiths(allHadiths) : [];
      _refineTiming.merge = Date.now() - _mergeStart;

      // Track after-merge candidates
      _refineCandidates.afterMerge = {
        books: mergedBooks.length,
        ayahs: mergedAyahs.length,
        hadiths: mergedHadiths.length,
      };

      console.log(`[Refine] Merged: ${mergedBooks.length} books, ${mergedAyahs.length} ayahs, ${mergedHadiths.length} hadiths`);

      // Step 4: Unified cross-type reranking (single API call for all types)
      // This allows the LLM to compare books vs ayahs vs hadiths for optimal ranking
      const _rerankStart = Date.now();

      // Fetch book metadata before reranking (uses request-scoped cache)
      const preRerankBookIds = [...new Set(mergedBooks.slice(0, 30).map((r) => r.bookId))];
      const preRerankBookMap = await getBookMetadataForReranking(preRerankBookIds);

      // Track candidates sent to reranker (using configurable limits)
      const rerankLimits = { books: refineBookRerank, ayahs: refineAyahRerank, hadiths: refineHadithRerank };
      _refineCandidates.sentToReranker = Math.min(mergedBooks.length, rerankLimits.books) +
                                          Math.min(mergedAyahs.length, rerankLimits.ayahs) +
                                          Math.min(mergedHadiths.length, rerankLimits.hadiths);

      // Single unified reranking call for all types
      const unifiedResult = await rerankUnifiedRefine(
        query,
        mergedAyahs,
        mergedHadiths,
        mergedBooks,
        preRerankBookMap,
        rerankLimits,
        reranker
      );
      _refineTiming.rerank = Date.now() - _rerankStart;

      // Track if reranker timed out
      rerankerTimedOut = unifiedResult.timedOut;

      rankedResults = unifiedResult.books;
      ayahsRaw = unifiedResult.ayahs;
      hadiths = unifiedResult.hadiths;

      console.log(`[Refine] Total time: ${Date.now() - _refineStart}ms (expansion: ${_refineTiming.queryExpansion}ms${_refineQueryExpansionCached ? ' cached' : ''}, searches: ${_refineTiming.parallelSearches}ms, merge: ${_refineTiming.merge}ms, rerank: ${_refineTiming.rerank}ms)`);

    } else {
      // ========================================================================
      // STANDARD SEARCH (non-refine mode)
      // ========================================================================
      // Optimized flow: Start keyword searches in PARALLEL with embedding generation
      // This saves ~150ms by not waiting for embedding before starting keyword searches

      const normalizedQuery = normalizeArabicText(query);
      const shouldSkipSemantic = normalizedQuery.replace(/\s/g, '').length < MIN_CHARS_FOR_SEMANTIC || hasQuotedPhrases(query);
      const fetchLimit = mode === "hybrid" ? preRerankLimit : limit;

      // ========================================================================
      // PHASE 1: Start keyword searches AND embedding generation in parallel
      // Keyword searches don't need embeddings, so they can start immediately
      // ========================================================================
      const _embStart = Date.now();
      const embeddingPromise = shouldSkipSemantic
        ? Promise.resolve(undefined)
        : generateEmbedding(normalizedQuery, embeddingModel);

      // Start all keyword searches immediately (parallel with embedding)
      // Using Elasticsearch for fast keyword search
      // Skip keyword search for non-Arabic queries (database is Arabic)
      const _kwBooksStart = Date.now();
      const keywordBooksPromise = (shouldSkipKeyword || !includeBooks)
        ? Promise.resolve([] as RankedResult[])
        : keywordSearchES(query, fetchLimit, bookId, fuzzyOptions)
            .then(res => { _timing.keyword.books = Date.now() - _kwBooksStart; return res; })
            .catch(() => [] as RankedResult[]);

      const _kwAyahsStart = Date.now();
      const keywordAyahsPromise = (shouldSkipKeyword || bookId || !includeQuran)
        ? Promise.resolve([] as AyahRankedResult[])
        : keywordSearchAyahsES(query, fetchLimit, fuzzyOptions)
            .then(res => { _timing.keyword.ayahs = Date.now() - _kwAyahsStart; return res; })
            .catch(() => [] as AyahRankedResult[]);

      const _kwHadithsStart = Date.now();
      const keywordHadithsPromise = (shouldSkipKeyword || bookId || !includeHadith)
        ? Promise.resolve([] as HadithRankedResult[])
        : keywordSearchHadithsES(query, fetchLimit, fuzzyOptions)
            .then(res => { _timing.keyword.hadiths = Date.now() - _kwHadithsStart; return res; })
            .catch(() => [] as HadithRankedResult[]);

      // Wait for embedding (keyword searches continue in background)
      const queryEmbedding = await embeddingPromise;
      _timing.embedding = Date.now() - _embStart;

      // ========================================================================
      // PHASE 2: Start semantic searches (now that embedding is ready)
      // ========================================================================
      const _semBooksStart = Date.now();
      const semanticBooksPromise = (mode === "keyword" || !includeBooks)
        ? Promise.resolve([] as RankedResult[])
        : semanticSearch(query, fetchLimit, bookId, similarityCutoff, queryEmbedding, pageCollection, embeddingModel)
            .then(res => { _timing.semantic.books = Date.now() - _semBooksStart; return res; })
            .catch(() => [] as RankedResult[]);

      const _semAyahsStart = Date.now();
      const defaultAyahMeta: AyahSearchMeta = { collection: quranCollection, usedFallback: false, embeddingTechnique: "metadata-translation" };
      const semanticAyahsPromise = (mode === "keyword" || bookId || !includeQuran)
        ? Promise.resolve({ results: [] as AyahRankedResult[], meta: defaultAyahMeta })
        : searchAyahsSemantic(query, fetchLimit, similarityCutoff, queryEmbedding, true, quranCollection, embeddingModel)
            .then(res => {
              _timing.semantic.ayahs = Date.now() - _semAyahsStart;
              console.log(`[SemanticAyahs] returned ${res.results.length} results from ${res.meta.collection}`);
              return res;
            })
            .catch((err) => {
              console.error("[SemanticAyahs] ERROR:", err);
              _timing.semantic.ayahs = Date.now() - _semAyahsStart;
              return { results: [] as AyahRankedResult[], meta: defaultAyahMeta };
            });

      const _semHadithsStart = Date.now();
      const semanticHadithsPromise = (mode === "keyword" || bookId || !includeHadith)
        ? Promise.resolve([] as HadithRankedResult[])
        : searchHadithsSemantic(query, fetchLimit, similarityCutoff, queryEmbedding, hadithCollection, embeddingModel)
            .then(res => { _timing.semantic.hadiths = Date.now() - _semHadithsStart; return res; })
            .catch(() => [] as HadithRankedResult[]);

      // ========================================================================
      // PHASE 3: Wait for all searches and merge results
      // ========================================================================
      const [
        keywordBooksResults,
        keywordAyahsResults,
        keywordHadithsResults,
        semanticBooksResults,
        semanticAyahsSearchResult,
        semanticHadithsResults,
      ] = await Promise.all([
        keywordBooksPromise,
        keywordAyahsPromise,
        keywordHadithsPromise,
        semanticBooksPromise,
        semanticAyahsPromise,
        semanticHadithsPromise,
      ]);

      // Extract results and metadata from semantic ayah search
      const semanticAyahsResults = semanticAyahsSearchResult.results;
      ayahSearchMeta = semanticAyahsSearchResult.meta;

      // Merge results for each content type
      const _mergeStart = Date.now();

      // Books: merge semantic + keyword
      if (!includeBooks) {
        rankedResults = [];
      } else if (mode === "keyword") {
        rankedResults = keywordBooksResults.slice(0, limit);
      } else if (mode === "semantic") {
        rankedResults = semanticBooksResults.slice(0, limit);
      } else {
        const merged = mergeWithRRF(semanticBooksResults, keywordBooksResults, query);
        totalAboveCutoff = merged.length;
        rankedResults = merged.slice(0, postRerankLimit);
      }

      // Ayahs: merge semantic + keyword
      if (bookId || !includeQuran) {
        ayahsRaw = [];
      } else if (mode === "keyword") {
        // Normalize BM25 scores to 0-1 for keyword-only results
        ayahsRaw = keywordAyahsResults.slice(0, 12).map(a => ({
          ...a,
          score: normalizeBM25Score(a.bm25Score ?? a.score ?? 0),
        }));
      } else if (mode === "semantic") {
        ayahsRaw = semanticAyahsResults.slice(0, 12);
      } else {
        ayahsRaw = mergeWithRRFGeneric(
          semanticAyahsResults,
          keywordAyahsResults,
          (a) => `${a.surahNumber}-${a.ayahNumber}`,
          query
        ).slice(0, 12);
      }

      // Hadiths: merge semantic + keyword
      if (bookId || !includeHadith) {
        hadiths = [];
      } else if (mode === "keyword") {
        // Normalize BM25 scores to 0-1 for keyword-only results
        hadiths = keywordHadithsResults.slice(0, 15).map(h => ({
          ...h,
          score: normalizeBM25Score(h.bm25Score ?? h.score ?? 0),
        }));
      } else if (mode === "semantic") {
        hadiths = semanticHadithsResults.slice(0, 15);
      } else {
        hadiths = mergeWithRRFGeneric(
          semanticHadithsResults,
          keywordHadithsResults,
          (h) => `${h.collectionSlug}-${h.hadithNumber}`,
          query
        ).slice(0, 15);
      }

      _timing.merge = Date.now() - _mergeStart;
    }

    // ========================================================================
    // MERGE DIRECT LOOKUP RESULTS
    // ========================================================================
    // Wait for direct lookup promises and merge with search results
    const _directLookupStart = Date.now();
    const [directAyahs, directHadiths, directSurahAyahs] = await Promise.all([
      directAyahsPromise,
      directHadithsPromise,
      directSurahAyahsPromise,
    ]);
    _timing.directLookup = Date.now() - _directLookupStart;

    // Merge direct ayah results (they have score: 1.0, should rank first)
    if (directAyahs.length > 0) {
      const directKeys = new Set(directAyahs.map(a => `${a.surahNumber}-${a.ayahNumber}`));
      // Build map of existing results to preserve their search scores
      const existingAyahMap = new Map(ayahsRaw.map(a => [`${a.surahNumber}-${a.ayahNumber}`, a as AyahRankedResult]));
      // Merge direct results with existing search scores preserved
      const mergedDirectAyahs = directAyahs.map(direct => {
        const existing = existingAyahMap.get(`${direct.surahNumber}-${direct.ayahNumber}`);
        if (existing) {
          // Preserve actual search scores from hybrid results
          return {
            ...direct,
            score: direct.score, // Keep score=1 for ranking
            semanticScore: existing.semanticScore ?? direct.semanticScore,
            bm25Score: existing.bm25Score,
            fusedScore: (existing as any).fusedScore,
          } as AyahResult & { bm25Score?: number; fusedScore?: number };
        }
        return direct;
      });
      // Remove duplicates from hybrid search, then prepend direct results
      const filteredAyahs = ayahsRaw.filter(a => !directKeys.has(`${a.surahNumber}-${a.ayahNumber}`));
      ayahsRaw = [...mergedDirectAyahs, ...filteredAyahs];
      console.log(`[Direct] Merged ${directAyahs.length} direct ayah(s) into results`);
    }

    // Merge direct surah ayahs (full surah results from surah name lookup)
    if (directSurahAyahs.length > 0) {
      const surahKeys = new Set(directSurahAyahs.map(a => `${a.surahNumber}-${a.ayahNumber}`));
      // Build map of existing results to preserve their search scores
      const existingAyahMap = new Map(ayahsRaw.map(a => [`${a.surahNumber}-${a.ayahNumber}`, a as AyahRankedResult]));
      // Merge surah results with existing search scores preserved
      const mergedSurahAyahs = directSurahAyahs.map(direct => {
        const existing = existingAyahMap.get(`${direct.surahNumber}-${direct.ayahNumber}`);
        if (existing) {
          return {
            ...direct,
            score: direct.score,
            semanticScore: existing.semanticScore ?? direct.semanticScore,
            bm25Score: existing.bm25Score,
            fusedScore: (existing as any).fusedScore,
          } as AyahResult & { bm25Score?: number; fusedScore?: number };
        }
        return direct;
      });
      // Remove duplicates from existing results, then prepend surah ayahs
      const filteredAyahs = ayahsRaw.filter(a => !surahKeys.has(`${a.surahNumber}-${a.ayahNumber}`));
      ayahsRaw = [...mergedSurahAyahs, ...filteredAyahs];
      console.log(`[Direct] Merged ${directSurahAyahs.length} surah ayah(s) into results`);
    }

    // Merge direct hadith results
    if (directHadiths.length > 0) {
      const directKeys = new Set(directHadiths.map(h => `${h.collectionSlug}-${h.hadithNumber}`));
      const filteredHadiths = (hadiths as HadithRankedResult[]).filter(h => !directKeys.has(`${h.collectionSlug}-${h.hadithNumber}`));
      hadiths = [...directHadiths, ...filteredHadiths];
      console.log(`[Direct] Merged ${directHadiths.length} direct hadith(s) into results`);
    }

    // Note: Cross-type reranking is now only done in refine mode via unified reranking
    // Standard search uses RRF fusion only (no reranking API calls)

    // Wait for author search to complete
    const _authorSearchStart = Date.now();
    const authorsRaw = await authorsPromise;
    _timing.authorSearch = Date.now() - _authorSearchStart;

    // Use all authors (no filtering by era)
    const authors = authorsRaw;

    // Fetch translations for ayahs, hadiths, and book content in parallel (saves 50-100ms)
    const _translationsStart = Date.now();
    const [ayahTranslations, hadithTranslationsRaw, bookContentTranslationsRaw] = await Promise.all([
      // Fetch Quran translations if requested
      (quranTranslation && quranTranslation !== "none" && ayahsRaw.length > 0)
        ? prisma.ayahTranslation.findMany({
            where: {
              language: quranTranslation,
              OR: ayahsRaw.map((a) => ({
                surahNumber: a.surahNumber,
                ayahNumber: a.ayahNumber,
              })),
            },
            select: {
              surahNumber: true,
              ayahNumber: true,
              text: true,
            },
          })
        : Promise.resolve([]),
      // Fetch Hadith translations if requested
      (hadithTranslation && hadithTranslation !== "none" && hadiths.length > 0)
        ? prisma.hadithTranslation.findMany({
            where: {
              language: hadithTranslation,
              OR: hadiths.map((h) => ({
                bookId: h.bookId,
                hadithNumber: h.hadithNumber,
              })),
            },
            select: {
              bookId: true,
              hadithNumber: true,
              text: true,
            },
          })
        : Promise.resolve([]),
      // Fetch Book content translations if requested (from cached page_translations)
      (bookContentTranslation && bookContentTranslation !== "none" && rankedResults.length > 0)
        ? prisma.pageTranslation.findMany({
            where: {
              language: bookContentTranslation,
              page: {
                OR: rankedResults.map((r) => ({
                  bookId: r.bookId,
                  pageNumber: r.pageNumber,
                })),
              },
            },
            select: {
              page: {
                select: {
                  bookId: true,
                  pageNumber: true,
                  contentHtml: true,  // Need HTML to extract paragraphs for matching
                },
              },
              paragraphs: true,
            },
          })
        : Promise.resolve([]),
    ]);
    _timing.translations = Date.now() - _translationsStart;

    // Merge ayah translations into results
    let ayahs = ayahsRaw;
    if (ayahTranslations.length > 0) {
      const translationMap = new Map(
        ayahTranslations.map((t) => [`${t.surahNumber}-${t.ayahNumber}`, t.text])
      );
      ayahs = ayahsRaw.map((ayah) => ({
        ...ayah,
        translation: translationMap.get(`${ayah.surahNumber}-${ayah.ayahNumber}`),
      }));
    }

    // Merge hadith translations into results
    if (hadithTranslationsRaw.length > 0) {
      const hadithTranslationMap = new Map(
        hadithTranslationsRaw.map((t) => [`${t.bookId}-${t.hadithNumber}`, t.text])
      );
      hadiths = hadiths.map((hadith) => ({
        ...hadith,
        translation: hadithTranslationMap.get(`${hadith.bookId}-${hadith.hadithNumber}`),
      }));
    }

    // Merge book content translations into results
    // Build a map of book-page -> { paragraphs, contentHtml } for matching
    type BookTranslationData = {
      paragraphs: Array<{ index: number; translation: string }>;
      contentHtml: string;
    };
    const bookContentTranslationMap = new Map<string, BookTranslationData>();
    if (bookContentTranslationsRaw.length > 0) {
      for (const t of bookContentTranslationsRaw) {
        const key = `${t.page.bookId}-${t.page.pageNumber}`;
        bookContentTranslationMap.set(key, {
          paragraphs: t.paragraphs as Array<{ index: number; translation: string }>,
          contentHtml: t.page.contentHtml,
        });
      }

      // Add contentTranslation to each ranked result
      rankedResults = rankedResults.map((r) => {
        const translationData = bookContentTranslationMap.get(`${r.bookId}-${r.pageNumber}`);
        if (!translationData) return r;

        const { paragraphs: translations, contentHtml } = translationData;
        const pageParagraphs = extractParagraphTexts(contentHtml);
        const matchIndex = findMatchingParagraphIndex(r.textSnippet, pageParagraphs);

        // Find translation for the matched paragraph
        const matchedTranslation = translations.find((t) => t.index === matchIndex);

        return {
          ...r,
          contentTranslation: matchedTranslation?.translation || null,
        };
      });
    }

    // Limit final results
    rankedResults = rankedResults.slice(0, limit);

    // Fetch urlPageIndex for each result from the pages table
    if (rankedResults.length > 0) {
      const pageKeys = rankedResults.map(r => ({ bookId: r.bookId, pageNumber: r.pageNumber }));

      const pages = await prisma.page.findMany({
        where: {
          OR: pageKeys.map(k => ({
            bookId: k.bookId,
            pageNumber: k.pageNumber,
          })),
        },
        select: {
          bookId: true,
          pageNumber: true,
          urlPageIndex: true,
        },
      });

      const pageMap = new Map(
        pages.map(p => [`${p.bookId}-${p.pageNumber}`, p.urlPageIndex])
      );

      // Add urlPageIndex to each result
      rankedResults = rankedResults.map(r => ({
        ...r,
        urlPageIndex: pageMap.get(`${r.bookId}-${r.pageNumber}`) || String(r.pageNumber),
      }));
    }

    // Extract book IDs for enrichment
    const bookIds = [...new Set(rankedResults.map((r) => r.bookId))];

    // Fetch book details from PostgreSQL
    const _bookMetaStart = Date.now();
    const booksRaw = await prisma.book.findMany({
      where: { id: { in: bookIds } },
      select: {
        id: true,
        titleArabic: true,
        titleLatin: true,
        filename: true,
        publicationYearHijri: true,
        author: {
          select: {
            nameArabic: true,
            nameLatin: true,
            deathDateHijri: true,
          },
        },
        ...(bookTitleLang && bookTitleLang !== "none" && bookTitleLang !== "transliteration"
          ? {
              titleTranslations: {
                where: { language: bookTitleLang },
                select: { title: true },
                take: 1,
              },
            }
          : {}),
      },
    });
    _timing.bookMetadata = Date.now() - _bookMetaStart;

    // Add titleTranslated field to each book
    const books = booksRaw.map((book) => {
      const { titleTranslations, ...rest } = book as typeof book & {
        titleTranslations?: { title: string }[];
      };
      return {
        ...rest,
        titleTranslated: titleTranslations?.[0]?.title || null,
      };
    });

    // Create lookup map for all books (no filtering by era)
    const bookMap = new Map(books.map((b) => [b.id, b]));

    // Filter out excluded books
    const filteredRankedResults = rankedResults.filter(r => !EXCLUDED_BOOK_IDS.has(r.bookId));

    // Format results with rank (position after reranking)
    const results: SearchResult[] = filteredRankedResults.map((result, index) => {
      const matchType = getMatchType(result);
      const book = bookMap.get(result.bookId) || null;
      const r = result as typeof result & { fusedScore?: number };

      // Use fusedScore as primary score for frontend sorting (semantic + confirmation bonus)
      let score: number;
      if (mode === "hybrid") {
        // Prefer fusedScore for sorting, fall back to RRF if not present
        score = r.fusedScore ?? result.semanticScore ?? calculateRRFScore([result.semanticRank, result.keywordRank]);
      } else if (mode === "semantic") {
        score = result.semanticScore || 0;
      } else {
        score = result.keywordScore || 0;
      }

      return {
        score,
        semanticScore: result.semanticScore,
        rank: index + 1, // Position after reranking (1-indexed)
        bookId: result.bookId,
        pageNumber: result.pageNumber,
        volumeNumber: result.volumeNumber,
        textSnippet: result.textSnippet,
        highlightedSnippet: result.highlightedSnippet,
        matchType,
        urlPageIndex: result.urlPageIndex,
        contentTranslation: result.contentTranslation,
        book,
      };
    });

    // Create unified ranking of all results for consistent display with frontend
    // Frontend merges all results and sorts by score, so we do the same here
    const unifiedResults: Array<{
      type: 'book' | 'quran' | 'hadith';
      score: number;
      data: SearchResult | AyahResult | HadithResult;
      rankedData?: RankedResult | AyahRankedResult | HadithRankedResult;
    }> = [];

    // Add all book results with their ranked data
    for (let i = 0; i < results.length; i++) {
      unifiedResults.push({
        type: 'book',
        score: results[i].score,
        data: results[i],
        rankedData: filteredRankedResults[i],
      });
    }

    // Add all ayah results (use fusedScore when available from hybrid merge)
    for (const a of ayahs) {
      const rankedAyah = a as AyahRankedResult & { fusedScore?: number };
      const score = rankedAyah.fusedScore ?? a.score;
      unifiedResults.push({ type: 'quran', score, data: a, rankedData: a as AyahRankedResult });
    }

    // Add all hadith results (use fusedScore when available from hybrid merge)
    for (const h of hadiths) {
      const rankedHadith = h as HadithRankedResult & { fusedScore?: number };
      const score = rankedHadith.fusedScore ?? h.score;
      unifiedResults.push({ type: 'hadith', score, data: h, rankedData: h as HadithRankedResult });
    }

    // Sort by score descending (same as frontend does in SearchClient.tsx)
    unifiedResults.sort((a, b) => b.score - a.score);

    // Build top results breakdown from unified sorted results (top 5)
    const top5Breakdown: TopResultBreakdown[] = unifiedResults
      .slice(0, 5)
      .map((item, index) => {
        const rank = index + 1;

        if (item.type === 'book') {
          const r = item.data as SearchResult;
          const ranked = item.rankedData as RankedResult & { fusedScore?: number };
          const hasSemantic = ranked?.semanticScore != null;
          const hasKeyword = ranked?.bm25Score != null;
          const matchType: 'semantic' | 'keyword' | 'both' =
            hasSemantic && hasKeyword ? 'both' : hasSemantic ? 'semantic' : 'keyword';
          return {
            rank,
            type: 'book' as const,
            title: r.book?.titleArabic?.slice(0, 50) || `Book ${r.bookId}`,
            keywordScore: ranked?.bm25Score ?? null, // ES BM25 score
            semanticScore: ranked?.semanticScore ?? null,
            finalScore: r.score,
            matchType,
          };
        } else if (item.type === 'quran') {
          const a = item.data as AyahResult;
          const ranked = item.rankedData as AyahRankedResult;
          const hasSemantic = a.semanticScore != null;
          const hasKeyword = ranked?.bm25Score != null;
          const matchType: 'semantic' | 'keyword' | 'both' =
            hasSemantic && hasKeyword ? 'both' : hasSemantic ? 'semantic' : 'keyword';
          return {
            rank,
            type: 'quran' as const,
            title: `${a.surahNameArabic} ${a.ayahNumber}`,
            keywordScore: ranked?.bm25Score ?? null, // ES BM25 score
            semanticScore: a.semanticScore ?? null,
            finalScore: a.score,
            matchType,
          };
        } else {
          const h = item.data as HadithResult;
          const ranked = item.rankedData as HadithRankedResult;
          const hasSemantic = h.semanticScore != null;
          const hasKeyword = ranked?.bm25Score != null;
          const matchType: 'semantic' | 'keyword' | 'both' =
            hasSemantic && hasKeyword ? 'both' : hasSemantic ? 'semantic' : 'keyword';
          return {
            rank,
            type: 'hadith' as const,
            title: `${h.collectionNameArabic} ${h.hadithNumber}`,
            keywordScore: ranked?.bm25Score ?? null, // ES BM25 score
            semanticScore: h.semanticScore ?? null,
            finalScore: h.score,
            matchType,
          };
        }
      });

    // Build debug stats with full algorithm parameters
    const debugStats: SearchDebugStats = {
      databaseStats,
      searchParams: {
        mode,
        cutoff: similarityCutoff,
        totalAboveCutoff: totalAboveCutoff || results.length + ayahs.length + hadiths.length,
        totalShown: results.length + ayahs.length + hadiths.length,
      },
      algorithm: {
        fusionMethod: shouldSkipKeyword ? 'semantic_only' : 'weighted_combination',
        fusionWeights: shouldSkipKeyword
          ? { semantic: 1.0, keyword: 0 }
          : { semantic: SEMANTIC_WEIGHT, keyword: KEYWORD_WEIGHT },
        keywordEngine: 'elasticsearch',
        bm25Params: { k1: 1.2, b: 0.75, normK: 5 }, // ES defaults
        rrfK: RRF_K,
        embeddingModel: getEmbeddingModelName(embeddingModel),
        embeddingDimensions: embeddingDimensions,
        rerankerModel: reranker === 'none' ? null : reranker,
        queryExpansionModel: refine ? getQueryExpansionModelId(queryExpansionModel) : null,
        // Quran embedding collection info
        quranCollection: ayahSearchMeta.collection,
        quranCollectionFallback: ayahSearchMeta.usedFallback,
        embeddingTechnique: ayahSearchMeta.embeddingTechnique,
      },
      topResultsBreakdown: top5Breakdown,
      ...(refine && refineQueryStats.length > 0 && {
        refineStats: {
          expandedQueries: refineQueryStats,
          originalQueryDocs: refineQueryStats.find(q => q.weight === 1.0)?.docsRetrieved || 0,
          timing: {
            queryExpansion: _refineTiming.queryExpansion,
            parallelSearches: _refineTiming.parallelSearches,
            merge: _refineTiming.merge,
            rerank: _refineTiming.rerank,
            total: _refineTiming.queryExpansion + _refineTiming.parallelSearches + _refineTiming.merge + _refineTiming.rerank,
          },
          candidates: _refineCandidates,
          queryExpansionCached: _refineQueryExpansionCached,
        },
      }),
      // Include timeout flag so frontend can show warning to user
      ...(rerankerTimedOut && { rerankerTimedOut: true }),
      // Performance timing breakdown
      timing: {
        total: Date.now() - _timing.start,
        embedding: _timing.embedding,
        semantic: _timing.semantic,
        keyword: _timing.keyword,
        merge: _timing.merge,
        directLookup: _timing.directLookup,
        authorSearch: _timing.authorSearch,
        ...(_timing.rerank > 0 && { rerank: _timing.rerank }),
        translations: _timing.translations,
        bookMetadata: _timing.bookMetadata,
      },
    };

    return NextResponse.json({
      query,
      mode,
      count: results.length,
      results,
      authors,
      ayahs,
      hadiths,
      // Include surah direct link if matched
      ...(famousSurah && {
        surah: {
          surahNumber: famousSurah.surahNumber,
          url: famousSurah.quranComUrl,
          totalAyahs: famousSurah.totalAyahs,
        },
      }),
      debugStats,
      ...(refine && {
        refined: true,
        expandedQueries,
      }),
    });
  } catch (error) {
    console.error("Search error:", error);

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes("Collection not found")) {
        return NextResponse.json(
          {
            error: "Search index not initialized",
            message: "Run the embedding generation script first",
          },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      { error: "Search failed", message: String(error) },
      { status: 500 }
    );
  }
}
