// RRF constant (standard value is 60)
export const RRF_K = 60;

// Weighted fusion: combine semantic and keyword scores
// Max fused score = 0.8 + 0.3 = 1.1 (rewards results found by both methods)
export const SEMANTIC_WEIGHT = 0.8;
export const KEYWORD_WEIGHT = 0.3;

// Minimum character count for semantic search (queries below this skip semantic)
// Short queries (≤3 chars) lack meaningful semantic content and produce noisy results
export const MIN_CHARS_FOR_SEMANTIC = 4;

// Database stats cache TTL (5 minutes)
export const DB_STATS_CACHE_TTL = 5 * 60 * 1000;

// Author search: minimum Qdrant score to include a result
export const AUTHOR_SCORE_THRESHOLD = 0.3;

// Text truncation limits for reranker LLM prompts
export const RERANKER_TEXT_LIMIT = 800;
export const UNIFIED_RERANKER_TEXT_LIMIT = 600;

// Timeout for unified cross-type reranking (refine search)
export const UNIFIED_RERANK_TIMEOUT_MS = 25000;

// Pre-rerank candidate caps per content type
export const AYAH_PRE_RERANK_CAP = 60;
export const HADITH_PRE_RERANK_CAP = 75;
export const FETCH_LIMIT_CAP = 100;

// Default similarity cutoff for ayah semantic search
export const DEFAULT_AYAH_SIMILARITY_CUTOFF = 0.28;

// Books to exclude from search results
// These books contain sources that negatively impact search quality
export const EXCLUDED_BOOK_IDS = new Set([
  "2", // كتاب النوازل في الرضاع - excluded due to sources that negatively impacted search relevance
]);
