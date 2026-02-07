import type {
  RerankerType,
  RankedResult,
  AyahRankedResult,
  HadithRankedResult,
  UnifiedRefineResult,
} from "./types";

const RERANKER_MODELS: Record<string, string> = {
  "gpt-oss-20b": "openai/gpt-oss-20b",
  "gpt-oss-120b": "openai/gpt-oss-120b",
  "gemini-flash": "google/gemini-3-flash-preview",
};

/**
 * Fetch with timeout using AbortController
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

/**
 * Format an Ayah result for reranking with metadata context
 */
export function formatAyahForReranking(ayah: AyahRankedResult): string {
  const range = ayah.ayahEnd ? `${ayah.ayahNumber}-${ayah.ayahEnd}` : String(ayah.ayahNumber);
  return `[QURAN] ${ayah.surahNameArabic} (${ayah.surahNameEnglish}), Ayah ${range}
${ayah.text.slice(0, 800)}`;
}

/**
 * Format a Hadith result for reranking with metadata context
 */
export function formatHadithForReranking(hadith: HadithRankedResult): string {
  const chapter = hadith.chapterArabic ? ` - ${hadith.chapterArabic}` : '';
  return `[HADITH] ${hadith.collectionNameArabic} (${hadith.collectionNameEnglish}), ${hadith.bookNameArabic}${chapter}
${hadith.text.slice(0, 800)}`;
}

/**
 * Format a Book result for reranking with metadata context
 */
export function formatBookForReranking(result: RankedResult, bookTitle?: string, authorName?: string): string {
  const meta = bookTitle ? `[BOOK] ${bookTitle}${authorName ? ` - ${authorName}` : ''}, p.${result.pageNumber}` : `[BOOK] Page ${result.pageNumber}`;
  return `${meta}
${result.textSnippet.slice(0, 800)}`;
}

/** Shared reranker prompt for LLM-based rerankers */
function buildRerankerPrompt(query: string, docsText: string): string {
  return `You are ranking Arabic/Islamic documents for a search query.

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
}

/**
 * Parse LLM ranking response into reranked results
 */
function parseLLMRanking<T>(content: string, results: T[], topN: number): T[] | null {
  const match = content.match(/\[[\d,\s]+\]/);
  if (!match) return null;

  const ranking: number[] = JSON.parse(match[0]);
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
}

/**
 * Rerank results using LLM via OpenRouter (GPT-OSS or Gemini)
 */
async function rerankWithLLM<T>(
  query: string,
  results: T[],
  getText: (item: T) => string,
  topN: number,
  model: string,
  timeoutMs: number
): Promise<{ results: T[]; timedOut: boolean }> {
  if (results.length === 0 || !process.env.OPENROUTER_API_KEY) {
    return { results: results.slice(0, topN), timedOut: false };
  }

  try {
    const docsText = results
      .map((d, i) => `[${i + 1}] ${getText(d).slice(0, 800)}`)
      .join("\n\n");

    const prompt = buildRerankerPrompt(query, docsText);

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
    }, timeoutMs);

    if (!response.ok) {
      throw new Error(`LLM reranking failed: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";

    const reranked = parseLLMRanking(content, results, topN);
    if (!reranked) {
      console.warn(`[Reranker] ${model} returned invalid format, using original order`);
      return { results: results.slice(0, topN), timedOut: false };
    }

    return { results: reranked, timedOut: false };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError';
    if (timedOut) {
      console.warn(`[Reranker] ${model} timed out after ${timeoutMs}ms, using RRF order`);
    } else {
      console.warn(`[Reranker] ${model} failed, using original order:`, err);
    }
    return { results: results.slice(0, topN), timedOut };
  }
}

/**
 * Rerank results using the specified reranker
 */
export async function rerank<T>(
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
      return rerankWithLLM(query, results, getText, topN, "openai/gpt-oss-20b", 20000);
    case "gpt-oss-120b":
      return rerankWithLLM(query, results, getText, topN, "openai/gpt-oss-120b", 20000);
    case "gemini-flash":
      return rerankWithLLM(query, results, getText, topN, "google/gemini-3-flash-preview", 15000);
    default:
      return { results: results.slice(0, topN), timedOut: false };
  }
}

/**
 * Unified cross-type reranking for standard search
 */
export async function rerankUnified(
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
  if (reranker === "none") {
    return { ayahs, hadiths, books };
  }

  type UnifiedDoc = { type: 'quran' | 'hadith' | 'book'; index: number; text: string; originalScore: number };
  const unified: UnifiedDoc[] = [];
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

  if (unified.length < 3) {
    return { ayahs, hadiths, books };
  }

  try {
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

    const model = RERANKER_MODELS[reranker] ?? "google/gemini-3-flash-preview";

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

    const match = content.match(/\[[\d,\s]+\]/);
    if (!match) {
      console.warn("[Unified Rerank] Invalid format, keeping original order");
      return { ayahs, hadiths, books };
    }

    const ranking: number[] = JSON.parse(match[0]);

    const ayahScores = new Map<number, number>();
    const hadithScores = new Map<number, number>();
    const bookScores = new Map<number, number>();

    ranking.forEach((docNum, rank) => {
      const idx = docNum - 1;
      if (idx >= 0 && idx < unified.length) {
        const doc = unified[idx];
        const score = 1.0 - (rank / (ranking.length * 2));

        if (doc.type === 'quran') ayahScores.set(doc.index, score);
        else if (doc.type === 'hadith') hadithScores.set(doc.index, score);
        else bookScores.set(doc.index, score);
      }
    });

    const updatedAyahs = ayahs.map((a, i) => {
      const newScore = ayahScores.get(i);
      return { ...a, score: newScore !== undefined ? newScore : a.score * 0.5 };
    }).sort((a, b) => b.score - a.score);

    const updatedHadiths = hadiths.map((h, i) => {
      const newScore = hadithScores.get(i);
      return { ...h, score: newScore !== undefined ? newScore : h.score * 0.5 };
    }).sort((a, b) => b.score - a.score);

    const updatedBooks = books.map((b, i) => {
      const newScore = bookScores.get(i);
      return { ...b, semanticScore: newScore !== undefined ? newScore : (b.semanticScore || 0) * 0.5 };
    }).sort((a, b) => (b.semanticScore || 0) - (a.semanticScore || 0));

    return { ayahs: updatedAyahs, hadiths: updatedHadiths, books: updatedBooks };

  } catch (err) {
    console.warn("[Unified Rerank] Error, keeping original order:", err);
    return { ayahs, hadiths, books };
  }
}

/**
 * Unified reranking for refine search - single API call for all types
 */
export async function rerankUnifiedRefine(
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
  if (reranker === "none") {
    return {
      books: books.slice(0, limits.books),
      ayahs: ayahs.slice(0, limits.ayahs),
      hadiths: hadiths.slice(0, limits.hadiths),
      timedOut: false
    };
  }

  const unified: UnifiedRefineResult[] = [];

  books.slice(0, limits.books).forEach((b, i) => {
    const book = bookMetaMap.get(b.bookId);
    unified.push({
      type: 'book',
      index: i,
      content: formatBookForReranking(b, book?.titleArabic, book?.author.nameArabic),
      originalScore: b.semanticScore || b.fusedScore || 0
    });
  });

  ayahs.slice(0, limits.ayahs).forEach((a, i) => {
    unified.push({
      type: 'ayah',
      index: i,
      content: formatAyahForReranking(a),
      originalScore: a.semanticScore || a.score
    });
  });

  hadiths.slice(0, limits.hadiths).forEach((h, i) => {
    unified.push({
      type: 'hadith',
      index: i,
      content: formatHadithForReranking(h),
      originalScore: h.semanticScore || h.score
    });
  });

  if (unified.length < 3) {
    return {
      books: books.slice(0, limits.books),
      ayahs: ayahs.slice(0, limits.ayahs),
      hadiths: hadiths.slice(0, limits.hadiths),
      timedOut: false
    };
  }

  const TIMEOUT_MS = 25000;

  try {
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

    const model = RERANKER_MODELS[reranker] ?? "google/gemini-3-flash-preview";

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
