/**
 * Hybrid Search API Endpoint
 *
 * GET /api/search?q={query}&limit={20}&mode={hybrid|semantic|keyword}&bookId={optional}
 *     &includeQuran={true}&includeHadith={true}&includeBooks={true}
 *     &reranker={qwen4b|qwen8b|jina|none}&similarityCutoff={0.15}
 *     &preRerankLimit={60}&postRerankLimit={10}
 *
 * Performs hybrid search combining:
 * - PostgreSQL full-text search (keyword)
 * - Qdrant vector search (semantic)
 * - Reciprocal Rank Fusion (RRF) for combining results
 */

import { NextRequest, NextResponse } from "next/server";
import { qdrant, QDRANT_COLLECTION, QDRANT_AUTHORS_COLLECTION, QDRANT_QURAN_COLLECTION, QDRANT_HADITH_COLLECTION } from "@/lib/qdrant";
import { generateEmbedding, normalizeArabicText } from "@/lib/embeddings";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import OpenAI from "openai";

// OpenRouter client for Qwen embeddings
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

type RerankerType = "gpt-oss" | "gpt-oss-120b" | "qwen4b" | "jina" | "none";

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
  urlPageIndex?: string;
}

interface HadithRankedResult extends HadithResult {
  semanticRank?: number;
  keywordRank?: number;
}

interface AyahRankedResult extends AyahResult {
  semanticRank?: number;
  keywordRank?: number;
}

// RRF constant (standard value is 60)
const RRF_K = 60;

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
 * Generic RRF merge function for any content type
 *
 * IMPORTANT: Sorts by semantic score first, then RRF as tiebreaker.
 * This prioritizes results with higher semantic relevance over keyword-only matches,
 * while still using RRF to combine and deduplicate results from both sources.
 */
function mergeWithRRFGeneric<T extends { semanticRank?: number; keywordRank?: number; semanticScore?: number }>(
  semanticResults: T[],
  keywordResults: T[],
  getKey: (item: T) => string
): (T & { rrfScore: number })[] {
  const resultMap = new Map<string, T & { rrfScore: number }>();

  // Add semantic results
  for (const item of semanticResults) {
    const key = getKey(item);
    resultMap.set(key, { ...item, semanticRank: item.semanticRank, rrfScore: 0 });
  }

  // Merge keyword results
  for (const item of keywordResults) {
    const key = getKey(item);
    const existing = resultMap.get(key);
    if (existing) {
      existing.keywordRank = item.keywordRank;
    } else {
      resultMap.set(key, { ...item, rrfScore: 0 });
    }
  }

  // Calculate RRF scores and sort by semantic score first, then RRF as tiebreaker
  return Array.from(resultMap.values())
    .map((item) => ({
      ...item,
      rrfScore: calculateRRFScore([item.semanticRank, item.keywordRank]),
    }))
    .sort((a, b) => {
      // Primary: semantic score (higher is better), default to 0 for keyword-only results
      const semanticDiff = (b.semanticScore ?? 0) - (a.semanticScore ?? 0);
      if (Math.abs(semanticDiff) > 0.01) return semanticDiff;
      // Tiebreaker: RRF score (boosts results found in both searches)
      return b.rrfScore - a.rrfScore;
    });
}

/**
 * Rerank results using Jina's multilingual reranker
 * Returns results sorted by relevance score
 */
async function rerankWithJina<T>(
  query: string,
  results: T[],
  getText: (item: T) => string,
  topN: number
): Promise<T[]> {
  if (results.length === 0 || !process.env.JINA_API_KEY) {
    return results.slice(0, topN);
  }

  try {
    const response = await fetch("https://api.jina.ai/v1/rerank", {
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
    });

    if (!response.ok) {
      throw new Error(`Jina API error: ${response.status}`);
    }

    const data = await response.json();
    return data.results.map((r: { index: number }) => results[r.index]);
  } catch (err) {
    console.warn("Jina reranking failed, using RRF order:", err);
    return results.slice(0, topN);
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
): Promise<T[]> {
  if (results.length === 0 || !process.env.OPENROUTER_API_KEY) {
    return results.slice(0, topN);
  }

  try {
    // Build reranking prompt with documents (800 chars for more context)
    const docsText = results
      .map((d, i) => `[${i + 1}] ${getText(d).slice(0, 800)}`)
      .join("\n\n");

    const prompt = `You are ranking Arabic/Islamic documents for relevance to a search query.

Query: "${query}"

Documents:
${docsText}

RANKING RULES (in priority order):

1. **EXPLICIT TOPIC MATCH** (highest priority)
   - Documents that explicitly mention the query topic by name rank FIRST
   - For query "shaban", documents containing "شعبان" rank highest
   - For query "Ramadan", documents containing "رمضان" rank highest
   - This applies even if the semantic similarity score is lower

2. **DIRECT ANSWER/DISCUSSION**
   - Documents that directly discuss or answer the query topic
   - Example: A hadith about fasting in Shaban directly addresses "what is special about Shaban"

3. **RELATED CONTEXT**
   - Documents that provide useful related information
   - Example: Discussing Islamic months, fasting practices, etc.

4. **UNRELATED** (rank last)
   - Documents that don't discuss the query topic at all
   - Documents about different topics that happen to share some Arabic words
   - Example: A verse about "the even and the odd" is NOT about Shaban

CROSS-LINGUAL: The query may be in English while documents are in Arabic. Treat them as equivalent:
- "shaban" = "شعبان"
- "ramadan" = "رمضان"
- "fasting" = "صيام" / "صوم"
- "prophet" = "النبي" / "رسول الله"

Return ONLY a JSON array of document numbers by relevance: [3, 1, 5, 2, 4]`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
    });

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
      return results.slice(0, topN);
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

    return reranked.slice(0, topN);
  } catch (err) {
    console.warn("GPT-OSS reranking failed, using original order:", err);
    return results.slice(0, topN);
  }
}

/**
 * Rerank results using the specified reranker
 */
async function rerank<T>(
  query: string,
  results: T[],
  getText: (item: T) => string,
  topN: number,
  reranker: RerankerType
): Promise<T[]> {
  if (results.length === 0 || reranker === "none") {
    return results.slice(0, topN);
  }

  switch (reranker) {
    case "gpt-oss":
      return rerankWithGptOss(query, results, getText, topN, "openai/gpt-oss-20b");
    case "gpt-oss-120b":
      return rerankWithGptOss(query, results, getText, topN, "openai/gpt-oss-120b");
    case "jina":
      return rerankWithJina(query, results, getText, topN);
    case "qwen4b":
      return rerankWithQwen(query, results, getText, topN, "qwen/qwen3-embedding-4b");
    default:
      return results.slice(0, topN);
  }
}

/**
 * Perform keyword search using PostgreSQL full-text search
 */
async function keywordSearch(
  query: string,
  limit: number,
  bookId: string | null,
  options: { fuzzyFallback?: boolean; fuzzyThreshold?: number } = {}
): Promise<RankedResult[]> {
  const { fuzzyFallback = true, fuzzyThreshold = 0.3 } = options;

  // Parse query to extract phrases and terms
  const parsed = parseSearchQuery(query);

  if (parsed.phrases.length === 0 && parsed.terms.length === 0) {
    return [];
  }

  // Build tsquery with phrase support (<-> for exact sequences)
  const tsQuery = buildTsQuery(parsed);

  // Build the WHERE clause for optional book filter
  const bookFilter = bookId ? Prisma.sql`AND p.book_id = ${bookId}` : Prisma.empty;

  // Execute raw SQL for full-text search with ts_headline for snippets
  const results = await prisma.$queryRaw<
    {
      book_id: string;
      page_number: number;
      volume_number: number;
      content_plain: string;
      headline: string;
      rank: number;
    }[]
  >`
    SELECT
      p.book_id,
      p.page_number,
      p.volume_number,
      p.content_plain,
      ts_headline(
        'simple',
        p.content_plain,
        to_tsquery('simple', ${tsQuery}),
        'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=20, MaxFragments=1'
      ) as headline,
      ts_rank(to_tsvector('simple', p.content_plain), to_tsquery('simple', ${tsQuery})) as rank
    FROM pages p
    WHERE to_tsvector('simple', p.content_plain) @@ to_tsquery('simple', ${tsQuery})
    ${bookFilter}
    ORDER BY rank DESC
    LIMIT ${limit}
  `;

  const mappedResults = results.map((r, index) => ({
    bookId: r.book_id,
    pageNumber: r.page_number,
    volumeNumber: r.volume_number,
    textSnippet: r.content_plain.slice(0, 300),
    highlightedSnippet: r.headline,
    keywordRank: index + 1,
    keywordScore: r.rank,
  }));

  // If no results and fuzzy fallback is enabled, try fuzzy search on terms only
  // (phrases require exact match, so fuzzy doesn't make sense for them)
  if (mappedResults.length === 0 && fuzzyFallback) {
    if (parsed.terms.length > 0) {
      console.log(`No exact page matches for "${query}", trying fuzzy search on terms...`);
      const termsOnlyQuery = parsed.terms.join(' ');
      return fuzzyKeywordSearch(termsOnlyQuery, limit, bookId, fuzzyThreshold);
    }
    // For phrase-only queries with no results, return empty (semantic search will help)
    return [];
  }

  return mappedResults;
}

/**
 * Keyword search for hadiths using PostgreSQL full-text search
 */
async function keywordSearchHadiths(
  query: string,
  limit: number,
  options: { fuzzyFallback?: boolean; fuzzyThreshold?: number } = {}
): Promise<HadithRankedResult[]> {
  const { fuzzyFallback = true, fuzzyThreshold = 0.3 } = options;

  // Parse query to extract phrases and terms
  const parsed = parseSearchQuery(query);

  if (parsed.phrases.length === 0 && parsed.terms.length === 0) {
    return [];
  }

  // Build tsquery with phrase support (<-> for exact sequences)
  const tsQuery = buildTsQuery(parsed);

  const results = await prisma.$queryRaw<
    {
      id: number;
      hadith_number: string;
      text_arabic: string;
      chapter_arabic: string | null;
      chapter_english: string | null;
      book_number: number;
      book_name_arabic: string;
      book_name_english: string;
      collection_slug: string;
      collection_name_arabic: string;
      collection_name_english: string;
      rank: number;
    }[]
  >`
    SELECT
      h.id,
      h.hadith_number,
      h.text_arabic,
      h.chapter_arabic,
      h.chapter_english,
      b.book_number,
      b.name_arabic as book_name_arabic,
      b.name_english as book_name_english,
      c.slug as collection_slug,
      c.name_arabic as collection_name_arabic,
      c.name_english as collection_name_english,
      ts_rank(to_tsvector('simple', h.text_plain), to_tsquery('simple', ${tsQuery})) as rank
    FROM hadiths h
    JOIN hadith_books b ON h.book_id = b.id
    JOIN hadith_collections c ON b.collection_id = c.id
    WHERE to_tsvector('simple', h.text_plain) @@ to_tsquery('simple', ${tsQuery})
    ORDER BY rank DESC
    LIMIT ${limit}
  `;

  const mappedResults = results.map((r, index) => ({
    score: r.rank,
    collectionSlug: r.collection_slug,
    collectionNameArabic: r.collection_name_arabic,
    collectionNameEnglish: r.collection_name_english,
    bookNumber: r.book_number,
    bookNameArabic: r.book_name_arabic,
    bookNameEnglish: r.book_name_english,
    hadithNumber: r.hadith_number,
    text: r.text_arabic,
    chapterArabic: r.chapter_arabic,
    chapterEnglish: r.chapter_english,
    sunnahComUrl: `https://sunnah.com/${r.collection_slug}:${r.hadith_number.replace(/[A-Z]+$/, '')}`,
    keywordRank: index + 1,
  }));

  // If no results and fuzzy fallback is enabled, try fuzzy search on terms only
  if (mappedResults.length === 0 && fuzzyFallback) {
    if (parsed.terms.length > 0) {
      console.log(`No exact hadith matches for "${query}", trying fuzzy search on terms...`);
      const termsOnlyQuery = parsed.terms.join(' ');
      return fuzzyKeywordSearchHadiths(termsOnlyQuery, limit, fuzzyThreshold);
    }
    return [];
  }

  return mappedResults;
}

/**
 * Keyword search for Quran ayahs using PostgreSQL full-text search
 */
async function keywordSearchAyahs(
  query: string,
  limit: number,
  options: { fuzzyFallback?: boolean; fuzzyThreshold?: number } = {}
): Promise<AyahRankedResult[]> {
  const { fuzzyFallback = true, fuzzyThreshold = 0.3 } = options;

  // Parse query to extract phrases and terms
  const parsed = parseSearchQuery(query);

  if (parsed.phrases.length === 0 && parsed.terms.length === 0) {
    return [];
  }

  // Build tsquery with phrase support (<-> for exact sequences)
  const tsQuery = buildTsQuery(parsed);

  const results = await prisma.$queryRaw<
    {
      id: number;
      ayah_number: number;
      text_uthmani: string;
      juz_number: number;
      page_number: number;
      surah_number: number;
      surah_name_arabic: string;
      surah_name_english: string;
      rank: number;
    }[]
  >`
    SELECT
      a.id,
      a.ayah_number,
      a.text_uthmani,
      a.juz_number,
      a.page_number,
      s.number as surah_number,
      s.name_arabic as surah_name_arabic,
      s.name_english as surah_name_english,
      ts_rank(to_tsvector('simple', a.text_plain), to_tsquery('simple', ${tsQuery})) as rank
    FROM ayahs a
    JOIN surahs s ON a.surah_id = s.id
    WHERE to_tsvector('simple', a.text_plain) @@ to_tsquery('simple', ${tsQuery})
    ORDER BY rank DESC
    LIMIT ${limit}
  `;

  const mappedResults = results.map((r, index) => ({
    score: r.rank,
    surahNumber: r.surah_number,
    ayahNumber: r.ayah_number,
    surahNameArabic: r.surah_name_arabic,
    surahNameEnglish: r.surah_name_english,
    text: r.text_uthmani,
    juzNumber: r.juz_number,
    pageNumber: r.page_number,
    quranComUrl: `https://quran.com/${r.surah_number}?startingVerse=${r.ayah_number}`,
    keywordRank: index + 1,
  }));

  // If no results and fuzzy fallback is enabled, try fuzzy search on terms only
  if (mappedResults.length === 0 && fuzzyFallback) {
    if (parsed.terms.length > 0) {
      console.log(`No exact ayah matches for "${query}", trying fuzzy search on terms...`);
      const termsOnlyQuery = parsed.terms.join(' ');
      return fuzzyKeywordSearchAyahs(termsOnlyQuery, limit, fuzzyThreshold);
    }
    return [];
  }

  return mappedResults;
}

/**
 * Fuzzy keyword search for book pages using pg_trgm trigram matching
 * Falls back to similarity matching when exact FTS fails
 */
async function fuzzyKeywordSearch(
  query: string,
  limit: number,
  bookId: string | null,
  similarityThreshold: number = 0.3
): Promise<RankedResult[]> {
  const normalized = normalizeArabicText(query);
  if (normalized.trim().length < 2) return [];

  const bookFilter = bookId ? Prisma.sql`AND book_id = ${bookId}` : Prisma.empty;

  const results = await prisma.$queryRaw<
    {
      book_id: string;
      page_number: number;
      volume_number: number;
      content_plain: string;
      similarity_score: number;
      ts_rank_score: number;
      combined_score: number;
    }[]
  >`
    SELECT * FROM (
      SELECT
        p.book_id,
        p.page_number,
        p.volume_number,
        p.content_plain,
        similarity(p.content_plain, ${normalized}) as similarity_score,
        ts_rank(to_tsvector('simple', p.content_plain),
                plainto_tsquery('simple', ${normalized})) as ts_rank_score,
        (ts_rank(to_tsvector('simple', p.content_plain),
                plainto_tsquery('simple', ${normalized})) * 2 +
         similarity(p.content_plain, ${normalized})) as combined_score
      FROM pages p
      WHERE (
        p.content_plain % ${normalized}
        OR to_tsvector('simple', p.content_plain) @@ plainto_tsquery('simple', ${normalized})
      )
    ) sub
    WHERE 1=1 ${bookFilter}
    ORDER BY combined_score DESC
    LIMIT ${limit}
  `;

  return results.map((r, index) => ({
    bookId: r.book_id,
    pageNumber: r.page_number,
    volumeNumber: r.volume_number,
    textSnippet: r.content_plain.slice(0, 300),
    highlightedSnippet: r.content_plain.slice(0, 300), // No highlighting for fuzzy
    keywordRank: index + 1,
    keywordScore: r.combined_score,
  }));
}

/**
 * Fuzzy keyword search for Quran ayahs using pg_trgm trigram matching
 */
async function fuzzyKeywordSearchAyahs(
  query: string,
  limit: number,
  similarityThreshold: number = 0.3
): Promise<AyahRankedResult[]> {
  const normalized = normalizeArabicText(query);
  if (normalized.trim().length < 2) return [];

  const results = await prisma.$queryRaw<
    {
      id: number;
      ayah_number: number;
      text_uthmani: string;
      juz_number: number;
      page_number: number;
      surah_number: number;
      surah_name_arabic: string;
      surah_name_english: string;
      similarity_score: number;
      ts_rank_score: number;
      combined_score: number;
    }[]
  >`
    SELECT * FROM (
      SELECT
        a.id,
        a.ayah_number,
        a.text_uthmani,
        a.juz_number,
        a.page_number,
        s.number as surah_number,
        s.name_arabic as surah_name_arabic,
        s.name_english as surah_name_english,
        similarity(a.text_plain, ${normalized}) as similarity_score,
        ts_rank(to_tsvector('simple', a.text_plain),
                plainto_tsquery('simple', ${normalized})) as ts_rank_score,
        (ts_rank(to_tsvector('simple', a.text_plain),
                plainto_tsquery('simple', ${normalized})) * 2 +
         similarity(a.text_plain, ${normalized})) as combined_score
      FROM ayahs a
      JOIN surahs s ON a.surah_id = s.id
      WHERE (
        a.text_plain % ${normalized}
        OR to_tsvector('simple', a.text_plain) @@ plainto_tsquery('simple', ${normalized})
      )
    ) sub
    ORDER BY combined_score DESC
    LIMIT ${limit}
  `;

  return results.map((r, index) => ({
    score: r.combined_score,
    surahNumber: r.surah_number,
    ayahNumber: r.ayah_number,
    surahNameArabic: r.surah_name_arabic,
    surahNameEnglish: r.surah_name_english,
    text: r.text_uthmani,
    juzNumber: r.juz_number,
    pageNumber: r.page_number,
    quranComUrl: `https://quran.com/${r.surah_number}?startingVerse=${r.ayah_number}`,
    keywordRank: index + 1,
  }));
}

/**
 * Fuzzy keyword search for hadiths using pg_trgm trigram matching
 */
async function fuzzyKeywordSearchHadiths(
  query: string,
  limit: number,
  similarityThreshold: number = 0.3
): Promise<HadithRankedResult[]> {
  const normalized = normalizeArabicText(query);
  if (normalized.trim().length < 2) return [];

  const results = await prisma.$queryRaw<
    {
      id: number;
      hadith_number: string;
      text_arabic: string;
      chapter_arabic: string | null;
      chapter_english: string | null;
      book_number: number;
      book_name_arabic: string;
      book_name_english: string;
      collection_slug: string;
      collection_name_arabic: string;
      collection_name_english: string;
      similarity_score: number;
      ts_rank_score: number;
      combined_score: number;
    }[]
  >`
    SELECT * FROM (
      SELECT
        h.id,
        h.hadith_number,
        h.text_arabic,
        h.chapter_arabic,
        h.chapter_english,
        b.book_number,
        b.name_arabic as book_name_arabic,
        b.name_english as book_name_english,
        c.slug as collection_slug,
        c.name_arabic as collection_name_arabic,
        c.name_english as collection_name_english,
        similarity(h.text_plain, ${normalized}) as similarity_score,
        ts_rank(to_tsvector('simple', h.text_plain),
                plainto_tsquery('simple', ${normalized})) as ts_rank_score,
        (ts_rank(to_tsvector('simple', h.text_plain),
                plainto_tsquery('simple', ${normalized})) * 2 +
         similarity(h.text_plain, ${normalized})) as combined_score
      FROM hadiths h
      JOIN hadith_books b ON h.book_id = b.id
      JOIN hadith_collections c ON b.collection_id = c.id
      WHERE (
        h.text_plain % ${normalized}
        OR to_tsvector('simple', h.text_plain) @@ plainto_tsquery('simple', ${normalized})
      )
    ) sub
    ORDER BY combined_score DESC
    LIMIT ${limit}
  `;

  return results.map((r, index) => ({
    score: r.combined_score,
    collectionSlug: r.collection_slug,
    collectionNameArabic: r.collection_name_arabic,
    collectionNameEnglish: r.collection_name_english,
    bookNumber: r.book_number,
    bookNameArabic: r.book_name_arabic,
    bookNameEnglish: r.book_name_english,
    hadithNumber: r.hadith_number,
    text: r.text_arabic,
    chapterArabic: r.chapter_arabic,
    chapterEnglish: r.chapter_english,
    sunnahComUrl: `https://sunnah.com/${r.collection_slug}:${r.hadith_number.replace(/[A-Z]+$/, '')}`,
    keywordRank: index + 1,
  }));
}

/**
 * Perform semantic search using Qdrant
 */
async function semanticSearch(
  query: string,
  limit: number,
  bookId: string | null,
  similarityCutoff: number = 0.25
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

  const queryEmbedding = await generateEmbedding(normalizedQuery);

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

  const searchResults = await qdrant.search(QDRANT_COLLECTION, {
    vector: queryEmbedding,
    limit: limit,
    filter: filter,
    with_payload: true,
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
 * Merge results using Reciprocal Rank Fusion
 *
 * IMPORTANT: Sorts by semantic score first, then RRF as tiebreaker.
 * This prioritizes results with higher semantic relevance over keyword-only matches.
 */
function mergeWithRRF(
  semanticResults: RankedResult[],
  keywordResults: RankedResult[]
): RankedResult[] {
  // Create a map keyed by (bookId, pageNumber)
  const resultMap = new Map<string, RankedResult>();

  // Add semantic results
  for (const result of semanticResults) {
    const key = `${result.bookId}-${result.pageNumber}`;
    resultMap.set(key, { ...result });
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
    } else {
      resultMap.set(key, { ...result });
    }
  }

  // Calculate RRF scores and sort by semantic score first, then RRF as tiebreaker
  const merged = Array.from(resultMap.values()).map((result) => ({
    ...result,
    rrfScore: calculateRRFScore([result.semanticRank, result.keywordRank]),
  }));

  // Sort by semantic score first, RRF as tiebreaker
  merged.sort((a, b) => {
    // Primary: semantic score (higher is better), default to 0 for keyword-only results
    const semanticDiff = (b.semanticScore ?? 0) - (a.semanticScore ?? 0);
    if (Math.abs(semanticDiff) > 0.01) return semanticDiff;
    // Tiebreaker: RRF score (boosts results found in both searches)
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
      with_payload: true,
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
 * Search for Quran ayahs using semantic search (returns ranked results)
 */
async function searchAyahsSemantic(query: string, limit: number = 10, similarityCutoff: number = 0.28): Promise<AyahRankedResult[]> {
  try {
    // Skip semantic search for quoted phrase queries (user wants exact match)
    if (hasQuotedPhrases(query)) {
      console.log(`Query "${query}" contains quotes, skipping ayah semantic search`);
      return [];
    }

    const normalizedQuery = normalizeArabicText(query);

    // Skip semantic search for very short queries (high noise risk)
    if (normalizedQuery.replace(/\s/g, '').length < MIN_CHARS_FOR_SEMANTIC) {
      console.log(`Query "${query}" too short for ayah semantic search, skipping`);
      return [];
    }

    // Apply dynamic threshold based on query length
    const effectiveCutoff = getDynamicSimilarityThreshold(query, similarityCutoff);

    const queryEmbedding = await generateEmbedding(normalizedQuery);

    const searchResults = await qdrant.search(QDRANT_QURAN_COLLECTION, {
      vector: queryEmbedding,
      limit: limit,
      with_payload: true,
      score_threshold: effectiveCutoff,
    });

    return searchResults.map((result, index) => {
      const payload = result.payload as {
        surahNumber: number;
        ayahNumber: number;
        surahNameArabic: string;
        surahNameEnglish: string;
        text: string;
        textPlain: string;
        juzNumber: number;
        pageNumber: number;
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
  } catch (err) {
    console.warn("Ayah semantic search failed:", err);
    return [];
  }
}

/**
 * Hybrid search for Quran ayahs using RRF fusion + reranking
 */
async function searchAyahsHybrid(
  query: string,
  limit: number = 10,
  options: { reranker?: RerankerType; preRerankLimit?: number; postRerankLimit?: number; similarityCutoff?: number; fuzzyFallback?: boolean; fuzzyThreshold?: number } = {}
): Promise<AyahResult[]> {
  const { reranker = "qwen4b", preRerankLimit = 60, postRerankLimit = limit, similarityCutoff = 0.15, fuzzyFallback = true, fuzzyThreshold = 0.3 } = options;

  // Fetch more candidates for reranking
  const fetchLimit = Math.min(preRerankLimit, 100);

  const [semanticResults, keywordResults] = await Promise.all([
    searchAyahsSemantic(query, fetchLimit, similarityCutoff).catch(() => []),
    keywordSearchAyahs(query, fetchLimit, { fuzzyFallback, fuzzyThreshold }).catch(() => []),
  ]);

  const merged = mergeWithRRFGeneric(
    semanticResults,
    keywordResults,
    (a) => `${a.surahNumber}-${a.ayahNumber}`
  );

  // Take top candidates for reranking
  const candidates = merged.slice(0, Math.min(preRerankLimit, 60));

  // Rerank with the specified reranker (using metadata-enriched formatter)
  const finalLimit = Math.min(postRerankLimit, limit);
  const finalResults = await rerank(
    query,
    candidates,
    (a) => formatAyahForReranking(a),
    finalLimit,
    reranker
  );

  // Return results with position (rank after reranking)
  // Use semantic score as primary score for frontend sorting (falls back to RRF if no semantic)
  return finalResults.map((result, index) => ({
    ...result,
    score: (result as { semanticScore?: number }).semanticScore ?? result.rrfScore,
    semanticScore: (result as { semanticScore?: number }).semanticScore,
    rank: index + 1, // Position after reranking (1-indexed)
  })) as AyahResult[];
}

/**
 * Search for Hadiths using semantic search (returns ranked results)
 */
async function searchHadithsSemantic(query: string, limit: number = 10, similarityCutoff: number = 0.25): Promise<HadithRankedResult[]> {
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

    const queryEmbedding = await generateEmbedding(normalizedQuery);

    const searchResults = await qdrant.search(QDRANT_HADITH_COLLECTION, {
      vector: queryEmbedding,
      limit: limit,
      with_payload: true,
      score_threshold: effectiveCutoff,
    });

    return searchResults.map((result, index) => {
      const payload = result.payload as {
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
      };

      return {
        score: result.score,
        semanticScore: result.score,
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
  } catch (err) {
    console.warn("Hadith semantic search failed:", err);
    return [];
  }
}

/**
 * Hybrid search for Hadiths using RRF fusion + reranking
 */
async function searchHadithsHybrid(
  query: string,
  limit: number = 10,
  options: { reranker?: RerankerType; preRerankLimit?: number; postRerankLimit?: number; similarityCutoff?: number; fuzzyFallback?: boolean; fuzzyThreshold?: number } = {}
): Promise<HadithResult[]> {
  const { reranker = "qwen4b", preRerankLimit = 60, postRerankLimit = limit, similarityCutoff = 0.15, fuzzyFallback = true, fuzzyThreshold = 0.3 } = options;

  // Fetch more candidates for reranking
  const fetchLimit = Math.min(preRerankLimit, 100);

  const [semanticResults, keywordResults] = await Promise.all([
    searchHadithsSemantic(query, fetchLimit, similarityCutoff).catch(() => []),
    keywordSearchHadiths(query, fetchLimit, { fuzzyFallback, fuzzyThreshold }).catch(() => []),
  ]);

  const merged = mergeWithRRFGeneric(
    semanticResults,
    keywordResults,
    (h) => `${h.collectionSlug}-${h.hadithNumber}`
  );

  // Take top candidates for reranking (reranking is expensive, limit candidates)
  const candidates = merged.slice(0, Math.min(preRerankLimit, 75));

  // Rerank with the specified reranker (using metadata-enriched formatter)
  const finalLimit = Math.min(postRerankLimit, limit);
  const finalResults = await rerank(
    query,
    candidates,
    (h) => formatHadithForReranking(h),
    finalLimit,
    reranker
  );

  // Return results with position (rank after reranking)
  // Use semantic score as primary score for frontend sorting (falls back to RRF if no semantic)
  return finalResults.map((result, index) => ({
    ...result,
    score: (result as { semanticScore?: number }).semanticScore ?? result.rrfScore,
    semanticScore: (result as { semanticScore?: number }).semanticScore,
    rank: index + 1, // Position after reranking (1-indexed)
  }));
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
  const reranker: RerankerType = rerankerParam && ["gpt-oss", "gpt-oss-120b", "qwen4b", "jina", "none"].includes(rerankerParam)
    ? rerankerParam
    : "gpt-oss-120b"; // Default to gpt-oss-120b for highest quality
  const similarityCutoff = parseFloat(searchParams.get("similarityCutoff") || "0.15");
  const preRerankLimit = Math.min(Math.max(parseInt(searchParams.get("preRerankLimit") || "60", 10), 20), 200);
  const postRerankLimit = Math.min(Math.max(parseInt(searchParams.get("postRerankLimit") || "10", 10), 5), 50);

  // Fuzzy search parameters
  const fuzzyEnabled = searchParams.get("fuzzy") !== "false"; // Default true
  const fuzzyThreshold = parseFloat(searchParams.get("fuzzyThreshold") || "0.3");

  // Quran translation parameter (language code like "en", "ur", "fr", or "none")
  const quranTranslation = searchParams.get("quranTranslation") || "none";

  // Book title translation parameter (language code like "en", "fr", or "none"/"transliteration")
  const bookTitleLang = searchParams.get("bookTitleLang");

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

    // Search for authors, ayahs, and hadiths in parallel (only if not filtering by bookId)
    // Use hybrid search for ayahs and hadiths to combine semantic + keyword with RRF
    const authorsPromise = bookId ? Promise.resolve([]) : searchAuthors(query, 5);
    const hybridOptions = { ...searchOptions, ...fuzzyOptions };
    const ayahsPromise = (bookId || !includeQuran) ? Promise.resolve([]) : searchAyahsHybrid(query, 12, hybridOptions);
    const hadithsPromise = (bookId || !includeHadith) ? Promise.resolve([]) : searchHadithsHybrid(query, 15, hybridOptions);

    // Fetch more results for RRF fusion
    const fetchLimit = mode === "hybrid" ? Math.min(preRerankLimit, 100) : limit;

    if (!includeBooks) {
      rankedResults = [];
    } else if (mode === "keyword") {
      rankedResults = await keywordSearch(query, limit, bookId, fuzzyOptions);
    } else if (mode === "semantic") {
      rankedResults = await semanticSearch(query, limit, bookId, similarityCutoff);
    } else {
      // Hybrid: run both searches, with graceful fallback if semantic fails
      const semanticPromise = semanticSearch(query, fetchLimit, bookId, similarityCutoff).catch((err) => {
        console.warn("Semantic search failed, using keyword only:", err.message);
        return [] as RankedResult[];
      });

      const keywordPromise = keywordSearch(query, fetchLimit, bookId, fuzzyOptions);

      const [semanticResults, keywordResults] = await Promise.all([
        semanticPromise,
        keywordPromise,
      ]);

      const merged = mergeWithRRF(semanticResults, keywordResults);

      // Fetch book metadata before reranking for better context
      const preRerankCandidates = merged.slice(0, preRerankLimit);
      const preRerankBookIds = [...new Set(preRerankCandidates.map((r) => r.bookId))];
      const preRerankBooks = await prisma.book.findMany({
        where: { id: { in: preRerankBookIds } },
        select: {
          id: true,
          titleArabic: true,
          author: {
            select: {
              nameArabic: true,
            },
          },
        },
      });
      const preRerankBookMap = new Map<string, typeof preRerankBooks[0]>(preRerankBooks.map((b) => [b.id, b]));

      // Rerank books with the specified reranker (using metadata-enriched formatter)
      rankedResults = await rerank(
        query,
        preRerankCandidates,
        (r) => {
          const book = preRerankBookMap.get(r.bookId);
          return formatBookForReranking(r, book?.titleArabic, book?.author.nameArabic);
        },
        postRerankLimit,
        reranker
      );
    }

    // Wait for author, ayah, and hadith searches to complete
    const [authorsRaw, ayahsRaw, hadiths] = await Promise.all([authorsPromise, ayahsPromise, hadithsPromise]);

    // Use all authors (no filtering by era)
    const authors = authorsRaw;

    // Fetch translations for ayahs if translation language is specified
    let ayahs = ayahsRaw;
    if (quranTranslation && quranTranslation !== "none" && ayahsRaw.length > 0) {
      const translations = await prisma.ayahTranslation.findMany({
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
      });

      // Create lookup map for translations
      const translationMap = new Map(
        translations.map((t) => [`${t.surahNumber}-${t.ayahNumber}`, t.text])
      );

      // Merge translations into ayah results
      ayahs = ayahsRaw.map((ayah) => ({
        ...ayah,
        translation: translationMap.get(`${ayah.surahNumber}-${ayah.ayahNumber}`),
      }));
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

    // Format results with rank (position after reranking)
    const results: SearchResult[] = rankedResults.map((result, index) => {
      const matchType = getMatchType(result);
      const book = bookMap.get(result.bookId) || null;

      // Use semantic score as primary score for frontend sorting (falls back to RRF/keyword)
      let score: number;
      if (mode === "hybrid") {
        // Prefer semantic score for sorting, fall back to RRF if no semantic match
        score = result.semanticScore ?? calculateRRFScore([result.semanticRank, result.keywordRank]);
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
        book,
      };
    });

    return NextResponse.json({
      query,
      mode,
      count: results.length,
      results,
      authors,
      ayahs,
      hadiths,
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
